// Atendente do Horizonte Commerce: interpreta intenções, mas nunca executa
// uma compra sem confirmação separada. Ferramentas MCP são a fonte de dados.
import { randomUUID } from 'node:crypto';

const SKUS = new Set(['cafe', 'pao_queijo', 'suco']);
const WORD_NUMBERS = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3,
  quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
const normalize = text => String(text).toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

export function localInterpret(message) {
  const line = normalize(message);
  const matches = [
    /\b(cafe|cafes|cafezinho|cafezinhos)\b/.test(line) && 'cafe',
    /\b(pao de queijo|paes de queijo|paozinho de queijo)\b/.test(line) && 'pao_queijo',
    /\b(suco|sucos)\b/.test(line) && 'suco'
  ].filter(Boolean);
  const sku = matches.length === 1 ? matches[0] : null;
  const wantsPrice = /\b(preco|custa|quanto|valor|cardapio|menu|estoque|tem|vende|disponivel)\b/.test(line);
  const wantsOrder = /\b(quero|queria|comprar|compro|pedido|pedir|me ve|me da|separa|traz|vou querer)\b/.test(line);
  const match = line.match(/\b(\d{1,3}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\b/);
  const quantity = match ? (WORD_NUMBERS[match[1]] ?? Number(match[1])) : 1;
  if (matches.length > 1) return { intent: 'help' };
  if (wantsPrice && !wantsOrder) return { intent: 'list' };
  if (wantsOrder && sku) return { intent: 'order', sku, quantity };
  return { intent: 'list' };
}
function approvedInterpret(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.intent === 'order' && SKUS.has(raw.sku) &&
      Number.isInteger(raw.quantity) && raw.quantity >= 1 && raw.quantity <= 20)
    return { intent: 'order', sku: raw.sku, quantity: raw.quantity };
  if (['list', 'help'].includes(raw.intent)) return { intent: raw.intent };
  return null;
}
function userError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
function describe(products) {
  return products.map(item =>
    item.label + ': ' + item.price + ' moedas (' + item.stock + ' disponíveis)').join('; ') + '.';
}

export function createAttendantService(callTool, { interpreter = null, now = Date.now } = {}) {
  const pending = new Map();
  function prune() {
    for (const [id, quote] of pending)
      if (quote.expiresAt <= now()) pending.delete(id);
    while (pending.size > 100) pending.delete(pending.keys().next().value);
  }
  async function chat({ shopId, message, useGemini = false } = {}) {
    if (typeof shopId !== 'string' || !/^cafe-\d+$/.test(shopId))
      throw userError('Cafeteria inválida.');
    if (typeof message !== 'string' || !message.trim() || message.length > 240)
      throw userError('Escreva uma mensagem de até 240 caracteres.');
    prune();
    const inventory = await callTool('consultar_estoque', { estabelecimento_id: shopId });
    const localIntent = localInterpret(message);
    let intent = localIntent;
    let mode = 'local';
    if (useGemini === true && interpreter) {
      try {
        const suggestion = approvedInterpret(await interpreter(message));
        const conflict = localIntent.intent === 'order' && (
          suggestion?.intent !== 'order' || suggestion.sku !== localIntent.sku ||
          suggestion.quantity !== localIntent.quantity);
        if (suggestion && !conflict) { intent = suggestion; mode = 'gemini'; }
        else mode = 'local-fallback';
      } catch { mode = 'local-fallback'; }
    }
    if (intent.intent !== 'order') return {
      message: 'Olá! Nosso cardápio: ' + describe(inventory.products) +
        ' Diga, por exemplo: quero dois cafés.',
      mode, proposal: null
    };
    if (!Number.isInteger(intent.quantity) || intent.quantity < 1 || intent.quantity > 20)
      return { message: 'A quantidade deve ser entre 1 e 20.', mode, proposal: null };
    const item = inventory.products.find(product => product.sku === intent.sku);
    if (!item) return { message: 'Não encontrei esse produto no cardápio.', mode, proposal: null };
    if (item.stock < intent.quantity) return {
      message: 'Temos apenas ' + item.stock + ' unidade(s) de ' + item.label +
        '. Escolha outra quantidade.', mode, proposal: null
    };
    const amount = item.price * intent.quantity;
    const proposalId = randomUUID();
    pending.set(proposalId, {
      shopId, sku: item.sku, quantity: intent.quantity, expiresAt: now() + 120000
    });
    const proposal = { id: proposalId, shopId, sku: item.sku,
      quantity: intent.quantity, product: item.label, amount };
    return { message: 'Posso separar ' + intent.quantity + ' × ' + item.label +
      ' por ' + amount + ' moedas virtuais? Confirme para registrar a compra.',
      mode, proposal };
  }
  async function confirm({ shopId, proposalId } = {}) {
    prune();
    if (typeof proposalId !== 'string' || !pending.has(proposalId))
      throw userError('Pedido expirado ou já confirmado. Faça um novo pedido.', 409);
    const quote = pending.get(proposalId);
    if (shopId !== quote.shopId) throw userError('O pedido pertence a outra cafeteria.', 403);
    pending.delete(proposalId); // Consumo único, mesmo que o estoque tenha mudado.
    return await callTool('registrar_pedido', {
      estabelecimento_id: quote.shopId, produto: quote.sku,
      quantidade: quote.quantity, cliente: 'jogador', confirmar: true
    });
  }
  return { chat, confirm };
}
