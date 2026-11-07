import { createCommerceWorld } from './commerce-world.js';
import { findCafeSpot } from './commerce-placement.js';

const API = 'http://127.0.0.1:4180';
async function call(path, options = {}) {
  let response;
  try {
    response = await fetch(API + path, {
      method: options.data ? 'POST' : 'GET',
      cache: 'no-store',
      headers: options.data ? { 'Content-Type': 'application/json' } : {},
      body: options.data ? JSON.stringify(options.data) : undefined,
      signal: AbortSignal.timeout(14000)
    });
  } catch {
    throw new Error('Servidor MCP de lojas offline. Inicie o Horizonte pelo atalho.');
  }
  let json;
  try { json = await response.json(); } catch {
    throw new Error('Resposta inválida do servidor de lojas.');
  }
  if (!response.ok) throw new Error(json.error || 'Falha ao processar a operação.');
  return json;
}
function text(id, value) { document.getElementById(id).textContent = String(value); }
function $(id) { return document.getElementById(id); }

export function createCommerceExperience({ scene, world, builder, npc, player,
  notify, canAct, restoreFocus }) {
  const display = createCommerceWorld(scene, world.colliders);
  let state = { shops: [], wallet: 180, maxShops: 8, catalog: {} };
  let online = false, working = false, modalOpen = false;
  let activeShop = null, lastHud = -1;
  let pendingQuote = null;

  function updateState(data) {
    if (!data || !Array.isArray(data.shops)) return;
    state = data;
    for (const shop of state.shops) {
      if (!display.has(shop.id)) {
        display.add(shop);
        npc.onWorldChanged();
      }
    }
    render();
  }
  async function synchronize() {
    try {
      updateState(await call('/api/state'));
      online = true;
      text('commerce-connection', 'MCP conectado · ' + state.shops.length + ' loja(s)');
      render();
      return true;
    } catch (error) {
      online = false;
      text('commerce-connection', 'Servidor MCP offline');
      text('commerce-feedback', error.message);
      render();
      return false;
    }
  }
  function render() {
    text('commerce-wallet', state.wallet + ' moedas');
    text('commerce-count', state.shops.length + ' / ' + state.maxShops);
    const nearby = display.nearby(player);
    const interact = $('commerce-interact');
    interact.disabled = working || !nearby || !online || !canAct();
    interact.title = nearby ? 'Abrir balcão da cafeteria (G)' : 'Aproxime-se de uma cafeteria';
    text('commerce-nearby', nearby ? 'Perto: ' + nearby.name : 'Nenhuma loja próxima');
    $('commerce-create').disabled = !online || working || !canAct() ||
      state.shops.length >= state.maxShops;
    $('commerce-refresh').disabled = working;
    if (activeShop) {
      const fresh = state.shops.find(shop => shop.id === activeShop.id);
      if (fresh) {
        activeShop = fresh;
        text('commerce-shop-title', activeShop.name);
        text('commerce-shop-stats',
          activeShop.stats.orders + ' pedidos · Caixa ' +
          activeShop.stats.balance + ' moedas');
      }
    }
  }
  function setWorking(value) {
    working = value;
    $('commerce-buy').disabled = value;
    $('commerce-restock').disabled = value;
    $('commerce-nina-order').disabled = value;
    $('commerce-attendant-send').disabled = value;
    $('commerce-attendant-input').disabled = value;
    $('commerce-attendant-confirm').disabled = value;
    render();
  }
  async function createCafe() {
    if (!online || working || !canAct()) return false;
    const where = findCafeSpot(player, [...world.colliders, ...builder.colliders],
      state.shops);
    if (!where) {
      notify('Não encontramos espaço livre perto daqui. Caminhe e tente novamente.');
      return false;
    }
    const name = $('commerce-name').value.trim() || 'Cafeteria do Horizonte';
    setWorking(true);
    try {
      const created = await call('/api/shops', { data: { ...where, name } });
      await synchronize();
      notify('🏪 ' + created.name + ' criada! Aproxime-se e pressione G.');
      text('commerce-feedback', 'Estabelecimento criado em ' + created.x +
        ', ' + created.z + ' · comércio fictício');
      return true;
    } catch (error) {
      notify(error.message);
      text('commerce-feedback', error.message);
      return false;
    } finally { setWorking(false); }
  }
  function renderProducts(shop) {
    const select = $('commerce-product');
    const previouslySelected = select.value;
    select.replaceChildren();
    for (const [sku, item] of Object.entries(state.catalog)) {
      const option = document.createElement('option');
      option.value = sku;
      option.textContent = item.label + ' · ' + item.price + ' moedas' +
        ' (' + shop.stock[sku] + ' unidades)';
      select.appendChild(option);
    }
    if (Object.hasOwn(state.catalog, previouslySelected)) select.value = previouslySelected;
  }
  function open() {
    if (!canAct() || !online || modalOpen) return false;
    const shop = display.nearby(player);
    if (!shop) {
      notify('Chegue perto de uma cafeteria para abrir o atendimento.');
      return false;
    }
    activeShop = state.shops.find(item => item.id === shop.id) || shop;
    modalOpen = true;
    $('commerce-modal').hidden = false;
    text('commerce-feedback', 'Bem-vindo! Escolha um produto ou veja o caixa.');
    renderProducts(activeShop);
    resetAttendant();
    render();
    $('commerce-product').focus();
    return true;
  }
  function close() {
    if (!modalOpen) return;
    modalOpen = false;
    pendingQuote = null;
    activeShop = null;
    $('commerce-modal').hidden = true;
    if (restoreFocus) restoreFocus();
  }
  async function transact(kind) {
    if (!modalOpen || !online || !activeShop || working) return false;
    const shopId = activeShop.id;
    const sku = $('commerce-product').value;
    const quantity = Number($('commerce-quantity').value);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      text('commerce-feedback', 'Escolha uma quantidade de 1 a 20.');
      return false;
    }
    const route = kind === 'restock' ? 'restock' : 'orders';
    const data = kind === 'restock'
      ? { sku, quantity: Math.min(quantity, 20) }
      : { sku, quantity, customer: kind === 'nina' ? 'nina' : 'jogador' };
    setWorking(true);
    try {
      const result = await call('/api/shops/' + encodeURIComponent(shopId) +
        '/' + route, { data });
      await synchronize();
      if (activeShop) renderProducts(activeShop);
      const message = kind === 'restock' ? '📦 Estoque reposto (' + result.stock + ' unidades)'
        : (kind === 'nina' ? '🤖 Nina fez um pedido fictício: ' :
          '☕ Pedido registrado: ') + result.receipt.product +
          ' · ' + result.receipt.amount + ' moedas';
      text('commerce-feedback', message);
      notify(message);
      return true;
    } catch (error) {
      text('commerce-feedback', error.message);
      return false;
    } finally { setWorking(false); }
  }
  function say(author, message) {
    const line = document.createElement('div');
    line.className = 'commerce-attendant-line';
    const who = document.createElement('strong');
    who.textContent = author + ': ';
    const content = document.createElement('span');
    content.textContent = String(message);
    line.append(who, content);
    const history = $('commerce-attendant-history');
    history.appendChild(line);
    history.scrollTop = history.scrollHeight;
  }
  function resetAttendant() {
    pendingQuote = null;
    $('commerce-attendant-confirm').hidden = true;
    $('commerce-attendant-history').replaceChildren();
    $('commerce-attendant-input').value = '';
    $('commerce-attendant-gemini').checked = false;
    text('commerce-attendant-mode', 'Atendimento local · sem custo de IA');
    say('Alex', 'Olá! Consulte o cardápio ou diga o que gostaria de comprar.');
  }
  async function sendAttendant(event) {
    event.preventDefault();
    if (!modalOpen || !online || !activeShop || working) return;
    const shopId = activeShop.id;
    const message = $('commerce-attendant-input').value.trim();
    if (!message) return;
    $('commerce-attendant-input').value = '';
    pendingQuote = null;
    $('commerce-attendant-confirm').hidden = true;
    say('Você', message);
    setWorking(true);
    try {
      const result = await call('/api/shops/' + encodeURIComponent(shopId) +
        '/attendant/chat', { data: {
          message, useGemini: $('commerce-attendant-gemini').checked
        } });
      if (!modalOpen || activeShop?.id !== shopId) return;
      say('Alex', result.message);
      pendingQuote = result.proposal;
      $('commerce-attendant-confirm').hidden = !pendingQuote;
      text('commerce-attendant-mode', result.mode === 'gemini'
        ? 'Gemini · interpretação de texto'
        : result.mode === 'local-fallback'
          ? 'Modo local · Gemini indisponível'
          : 'Atendimento local · sem custo de IA');
    } catch (error) {
      if (modalOpen && activeShop?.id === shopId) say('Sistema', error.message);
    } finally {
      setWorking(false);
      if (modalOpen && activeShop?.id === shopId) $('commerce-attendant-input').focus();
    }
  }
  async function confirmAttendant() {
    if (!modalOpen || !online || !activeShop || working || !pendingQuote) return;
    const shopId = activeShop.id;
    const proposalId = pendingQuote.id;
    pendingQuote = null;
    $('commerce-attendant-confirm').hidden = true;
    setWorking(true);
    try {
      const result = await call('/api/shops/' + encodeURIComponent(shopId) +
        '/attendant/confirm', { data: { proposalId } });
      await synchronize();
      if (modalOpen && activeShop?.id === shopId) {
        renderProducts(activeShop);
        say('Alex', 'Pedido ' + result.receipt.id + ' registrado: ' +
          result.receipt.quantity + ' × ' + result.receipt.product + ' · ' +
          result.receipt.amount + ' moedas virtuais.');
        text('commerce-feedback', 'Compra confirmada. Saldo: ' + result.wallet + ' moedas.');
      }
    } catch (error) {
      if (modalOpen && activeShop?.id === shopId) say('Sistema', error.message);
    } finally { setWorking(false); }
  }
  function onKey(key) {
    if (modalOpen) {
      if (key === 'escape') close();
      return true;
    }
    if (!canAct()) return false;
    if (key === 'b') { void createCafe(); return true; }
    if (key === 'g') { open(); return true; }
    return false;
  }
  function update(time, visible) {
    display.update(time, player);
    $('commerce-hud').hidden = !visible;
    if (!visible && modalOpen) close();
    if (time - lastHud > 0.34) {
      lastHud = time;
      render();
    }
  }
  $('commerce-create').addEventListener('click', () => { void createCafe(); });
  $('commerce-interact').addEventListener('click', open);
  $('commerce-refresh').addEventListener('click', () => { void synchronize(); });
  $('commerce-close').addEventListener('click', close);
  $('commerce-buy').addEventListener('click', () => { void transact('buy'); });
  $('commerce-restock').addEventListener('click', () => { void transact('restock'); });
  $('commerce-nina-order').addEventListener('click', () => { void transact('nina'); });
  $('commerce-attendant-form').addEventListener('submit', event => {
    void sendAttendant(event);
  });
  $('commerce-attendant-confirm').addEventListener('click', () => {
    void confirmAttendant();
  });
  void synchronize();
  return {
    update, close, onKey, createCafe, open, synchronize,
    restrictCamera: (target, desired) => display.restrictCamera(target, desired),
    isModalOpen: () => modalOpen,
    getSnapshot: () => ({ online, shops: state.shops.length, wallet: state.wallet,
      nearby: display.nearby(player)?.id || null })
  };
}
