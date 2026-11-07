// Horizonte Living Network — barramento de mensagens entre agentes do mundo.
// Mensagens tipadas, missão rastreável, turnos limitados e ferramentas de
// somente leitura. Nenhum agente recebe credencial ou permissão de compra.
const TYPES = new Set([
  'inventory_request', 'inventory_report', 'demo_request', 'demo_accept',
  'arrived', 'demo_ready', 'thanks', 'failed'
]);
const clamp = dt => Number.isFinite(dt) ? Math.max(0, Math.min(0.15, dt)) : 0;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const safeProducts = products => Array.isArray(products)
  ? products.filter(item => item && typeof item.sku === 'string' &&
    typeof item.label === 'string' && Number.isInteger(item.stock) &&
    item.stock >= 0 && Number.isFinite(item.price) && item.price >= 0)
    .slice(0, 12).map(({ sku, label, stock, price }) =>
      ({ sku, label: label.slice(0, 70), stock, price }))
  : [];

export function createMultiagentNetwork({
  readInventory, assignNina = () => false, releaseNina = () => {},
  onAlexEvent = () => {}, onMessage = () => {},
  generateDialogue = null, persistTask = null
} = {}) {
  if (typeof readInventory !== 'function') throw new TypeError('Ferramenta obrigatória.');
  const agents = new Map();
  const log = [];
  let enabled = true, geminiEnabled = false, aiStatus = 'local',
    memoryStatus = 'idle', clock = 0, seq = 0, current = null, completed = 0;
  let lastRun = -120, lastAttempt = -8, recentShop = null;
  function register(id, handler) {
    if (!/^(nina|alex:cafe-\d+)$/.test(id) || typeof handler !== 'function')
      throw new TypeError('Agente não autorizado.');
    agents.set(id, handler);
  }
  function record(from, to, kind, taskId, text) {
    const message = Object.freeze({
      id: ++seq, taskId, from, to, kind, at: Math.round(clock * 10) / 10,
      text: String(text).slice(0, 180)
    });
    log.push(message);
    if (log.length > 40) log.shift();
    onMessage(message);
    return message;
  }
  // Entrega rastreável para agente registrado, sem envio de código livre.
  function send(from, to, kind, data = {}, text = '') {
    if (!current || !agents.has(from) || !agents.has(to) || !TYPES.has(kind))
      return false;
    if (current.messages++ >= 14) {
      fail('Limite de mensagens da tarefa atingido.');
      return false;
    }
    const msg = record(from, to, kind, current.id, text);
    agents.get(to)(msg, data);
    return true;
  }
  // Falas geradas são apenas texto: o evento/tarefa continua determinístico.
  function speak(from, to, kind, data, fallback) {
    if (!geminiEnabled || !generateDialogue ||
        !['inventory_request','inventory_report','demo_request',
          'demo_accept'].includes(kind))
      return send(from, to, kind, data, fallback);
    const taskId = current?.id;
    const context = JSON.stringify({
      cafeteria:current?.shopName, produto:current?.item?.label || null,
      finalidade:'demonstração fictícia sem compra'
    });
    aiStatus = 'gerando';
    Promise.resolve().then(() => generateDialogue({
      agentId:from,recipient:to,kind,taskId,fallback,context
    })).then(response => {
      if (!current || current.id !== taskId || !enabled) return;
      const text = geminiEnabled && typeof response?.text === 'string' &&
        response.text.trim() && response.text.length <= 180
        ? response.text : fallback;
      aiStatus = text === fallback ? 'fallback' : 'gemini';
      send(from,to,kind,data,text);
    }).catch(() => {
      if (!current || current.id !== taskId || !enabled) return;
      aiStatus = 'fallback';
      send(from,to,kind,data,fallback);
    });
    return true;
  }
  function finish(status, reason = '') {
    if (!current) return;
    const task = current;
    task.phase = status;
    task.reason = reason;
    if (status === 'completed') {
      completed++;
      if (persistTask && task.item) {
        memoryStatus = 'saving';
        Promise.resolve().then(() => persistTask({
          taskId:task.id,shopId:task.shopId,product:task.item.sku
        })).then(() => { memoryStatus='saved'; })
          .catch(() => { memoryStatus='error'; });
      }
    }
    releaseNina(task.shopId);
    lastRun = clock;
    current = null;
  }
  function fail(reason) {
    if (!current) return;
    record('rede', 'nina', 'failed', current.id, reason);
    finish('failed', reason);
  }
  register('nina', (msg, data) => {
    if (!current || msg.taskId !== current.id) return;
    if (msg.kind === 'inventory_report') {
      const products = safeProducts(data.products);
      const item = products.find(p => p.sku === 'cafe' && p.stock > 0) ||
        products.find(p => p.stock > 0);
      if (!item) return fail('Sem produtos disponíveis para demonstração.');
      current.item = item;
      speak('nina', current.alex, 'demo_request', { sku: item.sku },
        'Alex, vamos demonstrar o preparo de ' + item.label + '?');
    } else if (msg.kind === 'demo_accept') {
      current.phase = 'travelling';
    } else if (msg.kind === 'demo_ready') {
      current.phase = 'acknowledging';
      send('nina', current.alex, 'thanks', {},
        'Ótimo trabalho! A demonstração foi concluída em equipe.');
    }
  });
  function registerShop(shopId) {
    const id = 'alex:' + shopId;
    if (agents.has(id)) return id;
    register(id, (msg, data) => {
      if (!current || current.alex !== id || current.id !== msg.taskId) return;
      if (msg.kind === 'inventory_request') {
        const taskId = current.id;
        Promise.resolve().then(() => readInventory(shopId))
          .then(inventory => {
            if (!current || current.id !== taskId || !enabled) return;
            speak(id, 'nina', 'inventory_report', {
              products: safeProducts(inventory?.products)
            }, 'Estoque consultado via MCP; vou enviar o catálogo disponível.');
          }).catch(() => {
            if (current?.id === taskId) fail('Consulta MCP indisponível.');
          });
      } else if (msg.kind === 'demo_request') {
        speak(id, 'nina', 'demo_accept', {},
          'Combinado, Nina. Espero você para preparar o pedido demonstrativo.');
        onAlexEvent(shopId, 'talk');
      } else if (msg.kind === 'arrived') {
        current.phase = 'preparing';
        current.prepRemaining = 3.5;
        onAlexEvent(shopId, 'talk');
      } else if (msg.kind === 'thanks') {
        onAlexEvent(shopId, 'demo');
        finish('completed');
      }
    });
    return id;
  }
  function start(shop) {
    if (!enabled || current || !shop || !Number.isFinite(shop.x) ||
        !Number.isFinite(shop.z) || !/^cafe-\d+$/.test(shop.id) ||
        clock - lastRun < 90) return false;
    lastAttempt = clock;
    const target = assignNina(shop);
    if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.z))
      return false;
    const alex = registerShop(shop.id);
    current = { id: 'task-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2,8) + '-' + (++seq),
      shopId: shop.id,
      shopName: String(shop.name).slice(0, 40), alex,
      target, phase: 'requesting', item: null, prepRemaining: 0,
      started: clock, messages: 0 };
    recentShop = shop.id;
    speak('nina', alex, 'inventory_request', {},
      'Alex, preciso conferir o estoque para nossa tarefa em equipe.');
    return true;
  }
  function update(dt, { shops = [], nina = null, active = true } = {}) {
    if (!enabled || !active) return snapshot();
    clock += clamp(dt);
    if (current && clock - current.started > 75) fail('Tempo da missão esgotado.');
    if (!current && nina && !nina.follow && !nina.conversationOpen &&
        clock - lastRun >= 90 && clock - lastAttempt >= 8 && Array.isArray(shops)) {
      const candidates = shops.filter(s => /^cafe-\d+$/.test(s.id) &&
        Number.isFinite(s.x) && Number.isFinite(s.z) &&
        distance(nina, s) <= 35).sort((a, b) =>
        distance(nina, a) - distance(nina, b));
      const chosen = candidates.find(s => s.id !== recentShop) || candidates[0];
      if (chosen) start(chosen);
    }
    if (!current) return snapshot();
    if (!nina || nina.follow || nina.conversationOpen)
      return (fail('Missão interrompida para respeitar a rotina de Nina.'), snapshot());
    if (current.phase === 'travelling' &&
        distance(nina, current.target) <= 1.45) {
      current.phase = 'arriving';
      send('nina', current.alex, 'arrived', {},
        'Cheguei ao balcão. Vamos realizar a demonstração!');
    }
    if (current?.phase === 'preparing') {
      current.prepRemaining -= clamp(dt);
      if (current.prepRemaining <= 0) {
        const item = current.item;
        send(current.alex, 'nina', 'demo_ready', {},
          'Pronto! Demonstração de ' + item.label +
          ' concluída sem alterar o estoque.');
      }
    }
    return snapshot();
  }
  function setGeminiEnabled(next) {
    geminiEnabled = Boolean(next);
    aiStatus = geminiEnabled ? 'pronto' : 'local';
    return geminiEnabled;
  }
  function cancel(reason = 'Missão interrompida.') {
    if (current) fail(reason);
  }
  function setEnabled(next) {
    enabled = Boolean(next);
    if (!enabled && current) fail('Rede desativada pelo jogador.');
    return enabled;
  }
  function snapshot() {
    return {
      enabled, geminiEnabled, aiStatus, memoryStatus, completed,
      active: current ? {
        id: current.id, shopId: current.shopId, phase: current.phase,
        product: current.item?.label || null, target: { ...current.target }
      } : null,
      messages: log.slice(-20),
      agentIds: [...agents.keys()]
    };
  }
  return { register, send, start, update, cancel,
    setEnabled, setGeminiEnabled, snapshot };
}
