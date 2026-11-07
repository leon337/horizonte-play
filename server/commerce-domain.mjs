// Regras do Horizonte Commerce: moedas fictícias, dados locais e transações atômicas.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canOpenCafe } from '../src/commerce-placement.js';
export { canOpenCafe } from '../src/commerce-placement.js';

export const CATALOG = Object.freeze({
  cafe: Object.freeze({ label: 'Café quentinho', price: 8, initial: 14 }),
  pao_queijo: Object.freeze({ label: 'Pão de queijo', price: 6, initial: 12 }),
  suco: Object.freeze({ label: 'Suco de frutas', price: 10, initial: 8 })
});
export const MAX_SHOPS = 8;
export const COMMERCE_PORT = 4180;
const defaultFile = path.join(process.env.LOCALAPPDATA ||
  path.join(os.homedir(), '.horizonte-play'), 'HorizontePlay', 'commerce-v1.json');

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
function cleanTitle(value) {
  const str = String(value || 'Cafeteria do Horizonte').trim();
  if (!/^[\p{L}\p{N}\s'-]{3,35}$/u.test(str)) fail('Nome inválido (3 a 35 caracteres).');
  return str;
}
function validCount(value, limit = 20) {
  if (!Number.isInteger(value) || value < 1 || value > limit) fail('Quantidade inválida.');
  return value;
}
// As mesmas regras de posicionamento são usadas pelo jogo e pelo backend.
export function newCommerceState() {
  return { version: 1, nextId: 1, nextOrder: 1, wallet: 180, shops: [] };
}
function validateStoredState(raw) {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.shops) ||
      raw.shops.length > MAX_SHOPS || !Number.isInteger(raw.nextId) ||
      !Number.isInteger(raw.nextOrder) || !Number.isFinite(raw.wallet)) return false;
  for (const shop of raw.shops) {
    if (!shop || typeof shop.id !== 'string' || !Number.isFinite(shop.x) ||
        !Number.isFinite(shop.z) || !shop.stock || !shop.stats ||
        Object.keys(CATALOG).some(sku => !Number.isInteger(shop.stock[sku]) ||
          shop.stock[sku] < 0 || shop.stock[sku] > 500)) return false;
  }
  return true;
}
export function createCommerce({ file = defaultFile, persist = true } = {}) {
  let state = newCommerceState();
  if (persist && fs.existsSync(file)) {
    try {
      const loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (validateStoredState(loaded)) state = loaded;
    } catch { /* Conserva estado novo quando o arquivo é inválido. */ }
  }
  function save() {
    if (!persist) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tempfile = file + '.tmp-' + process.pid;
    fs.writeFileSync(tempfile, JSON.stringify(state, null, 2), { mode: 0o600 });
    fs.renameSync(tempfile, file);
  }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function list() { return copy(state.shops); }
  function snapshot() {
    return { wallet: state.wallet, shops: list(), maxShops: MAX_SHOPS,
      catalog: copy(CATALOG), currency: 'moedas virtuais', version: 1 };
  }
  function shopById(id) {
    const shop = state.shops.find(item => item.id === String(id));
    if (!shop) fail('Estabelecimento não encontrado.', 404);
    return shop;
  }
  function get(id) { return copy(shopById(id)); }
  function createCafe({ x, z, name } = {}) {
    if (state.shops.length >= MAX_SHOPS) fail('Máximo de cafeterias atingido.');
    if (!canOpenCafe(x, z, state.shops)) fail('Local inadequado: procure terreno livre, longe do lago e de outros prédios.');
    const shop = {
      id: 'cafe-' + state.nextId++, type: 'cafeteria',
      name: cleanTitle(name), x: Number(x.toFixed(2)), z: Number(z.toFixed(2)),
      stock: Object.fromEntries(Object.entries(CATALOG).map(([sku, item]) => [sku, item.initial])),
      stats: { balance: 0, revenue: 0, orders: 0, lastOrder: null },
      createdAt: new Date().toISOString()
    };
    state.shops.push(shop);
    save();
    return copy(shop);
  }
  function inventory(id) {
    const shop = shopById(id);
    return { id: shop.id, name: shop.name,
      products: Object.entries(CATALOG).map(([sku, item]) => ({
        sku, label: item.label, price: item.price, stock: shop.stock[sku]
      })) };
  }
  function order({ shopId, sku, quantity = 1, customer = 'jogador' } = {}) {
    const shop = shopById(shopId);
    if (!Object.hasOwn(CATALOG, sku)) fail('Produto inexistente.');
    validCount(quantity);
    if (!['jogador', 'nina'].includes(customer)) fail('Cliente inválido.');
    if (shop.stock[sku] < quantity) fail('Estoque insuficiente.', 409);
    const amount = CATALOG[sku].price * quantity;
    if (customer === 'jogador' && state.wallet < amount) fail('Você não possui moedas virtuais suficientes.', 409);
    if (customer === 'jogador') state.wallet -= amount;
    shop.stock[sku] -= quantity;
    shop.stats.orders++;
    shop.stats.revenue += amount;
    shop.stats.balance += amount;
    const receipt = {
      id: 'pedido-' + state.nextOrder++, shopId: shop.id,
      sku, product: CATALOG[sku].label, quantity, amount, customer,
      createdAt: new Date().toISOString()
    };
    shop.stats.lastOrder = receipt;
    save();
    return { receipt: copy(receipt), wallet: state.wallet, stock: shop.stock[sku] };
  }
  function restock({ shopId, sku, quantity = 5 } = {}) {
    const shop = shopById(shopId);
    if (!Object.hasOwn(CATALOG, sku)) fail('Produto inexistente.');
    validCount(quantity, 25);
    if (shop.stock[sku] + quantity > 200) fail('Limite de estoque atingido.');
    shop.stock[sku] += quantity;
    save();
    return { shopId: shop.id, sku, stock: shop.stock[sku], simulated: true };
  }
  function cash(id) {
    const shop = shopById(id);
    return { id: shop.id, name: shop.name, ...copy(shop.stats),
      currency: 'moedas virtuais' };
  }
  return { snapshot, list, get, createCafe, inventory, order, restock, cash,
    get dataFile() { return file; } };
}
