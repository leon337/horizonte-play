import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createCommerce } from '../server/commerce-domain.mjs';
import { createCommerceHandler } from '../server/commerce-mcp.mjs';
import { localInterpret, createAttendantService } from '../server/commerce-attendant.mjs';
import { createHandler as createGeminiHandler, ATTENDANT_MODEL } from '../server/gemini-local.mjs';

const ORIGIN = 'http://127.0.0.1:5173';
const post = (base, path, data, origin = ORIGIN) => fetch(base + path, {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});
async function withCommerce(run, interpreter = async () => null) {
  const store = createCommerce({ persist: false });
  const hosts = new Set();
  const server = http.createServer(createCommerceHandler(store, {
    allowedHosts: hosts, interpreter
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  hosts.add('127.0.0.1:' + server.address().port);
  try { await run(base, store); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('atendente interpreta pedidos em português e diferencia preço de compra', () => {
  assert.deepEqual(localInterpret('Quero dois cafés!'),
    { intent: 'order', sku: 'cafe', quantity: 2 });
  assert.deepEqual(localInterpret('me vê 3 pães de queijo'),
    { intent: 'order', sku: 'pao_queijo', quantity: 3 });
  assert.deepEqual(localInterpret('Quanto custa um suco?'), { intent: 'list' });
  assert.deepEqual(localInterpret('Quero 99 sucos'),
    { intent: 'order', sku: 'suco', quantity: 99 });
  assert.deepEqual(localInterpret('Quero café e suco'), { intent: 'help' });
});

test('MCP: simular pedido não altera carteira; confirmar altera exatamente uma vez', async () => {
  await withCommerce(async (base, store) => {
    const shop = store.createCafe({ x: 12, z: 5, name: 'Café do Teste' });
    const route = '/api/shops/' + shop.id + '/attendant/';
    const preview = await post(base, route + 'chat',
      { message: 'Quero dois cafés', useGemini: false });
    assert.equal(preview.status, 200);
    const proposal = (await preview.json()).proposal;
    assert.equal(proposal.amount, 16);
    assert.equal(store.snapshot().wallet, 180);
    assert.equal(store.inventory(shop.id).products[0].stock, 14);
    const wrongShop = await post(base, '/api/shops/cafe-99/attendant/confirm',
      { proposalId: proposal.id });
    assert.equal(wrongShop.status, 403);
    const confirm = await post(base, route + 'confirm', { proposalId: proposal.id });
    assert.equal(confirm.status, 201);
    assert.equal((await confirm.json()).wallet, 164);
    assert.equal(store.inventory(shop.id).products[0].stock, 12);
    const duplicate = await post(base, route + 'confirm', { proposalId: proposal.id });
    assert.equal(duplicate.status, 409);
    assert.equal(store.cash(shop.id).orders, 1);
  });
});

test('MCP: só permite origem local, mensagem limitada e pedidos de até 20 unidades', async () => {
  await withCommerce(async (base, store) => {
    const shop = store.createCafe({ x: 12, z: 5, name: 'Café Seguro' });
    const route = '/api/shops/' + shop.id + '/attendant/chat';
    assert.equal((await post(base, route, { message: 'Quero um café' },
      'https://site-invasor.example')).status, 403);
    assert.equal((await post(base, route, { message: 'x'.repeat(241) })).status, 400);
    const longOrder = await post(base, route, { message: 'Quero 25 cafés' });
    assert.equal((await longOrder.json()).proposal, null);
    assert.equal(store.snapshot().wallet, 180);
    assert.equal(store.cash(shop.id).orders, 0);
  });
});

test('MCP: estoque é validado novamente após a confirmação', async () => {
  await withCommerce(async (base, store) => {
    const shop = store.createCafe({ x: 12, z: 5, name: 'Estoque' });
    const route = '/api/shops/' + shop.id + '/attendant/';
    const preview = await (await post(base, route + 'chat',
      { message: 'Quero 8 sucos' })).json();
    store.order({ shopId: shop.id, sku: 'suco', quantity: 1 });
    const confirmed = await post(base, route + 'confirm',
      { proposalId: preview.proposal.id });
    assert.equal(confirmed.status, 409);
    assert.equal(store.inventory(shop.id).products.find(p => p.sku === 'suco').stock, 7);
    assert.equal(store.cash(shop.id).orders, 1);
  });
});

test('Gemini opcional: resultado validado e queda automática para modo local', async () => {
  await withCommerce(async (base, store) => {
    const shop = store.createCafe({ x: 12, z: 5, name: 'Café IA' });
    const route = '/api/shops/' + shop.id + '/attendant/chat';
    const ai = await (await post(base, route,
      { message: 'Quero dois pães de queijo', useGemini: true })).json();
    assert.equal(ai.mode, 'gemini');
    assert.equal(ai.proposal.sku, 'pao_queijo');
    assert.equal(store.cash(shop.id).orders, 0);
  }, async () => ({ intent: 'order', sku: 'pao_queijo', quantity: 2 }));
  await withCommerce(async (base, store) => {
    const shop = store.createCafe({ x: 12, z: 5, name: 'Café Fallback' });
    const response = await (await post(base,
      '/api/shops/' + shop.id + '/attendant/chat',
      { message: 'Quero dois cafés', useGemini: true })).json();
    assert.equal(response.mode, 'local-fallback');
    assert.equal(response.proposal.sku, 'cafe');
  }, async () => ({ intent: 'order', sku: 'other', quantity: 99 }));
});

test('MCP: duas confirmações simultâneas não duplicam a venda', async () => {
  await withCommerce(async (base, store) => {
    const shop = store.createCafe({ x: 12, z: 5, name: 'Concorrência' });
    const route = '/api/shops/' + shop.id + '/attendant/';
    const response = await (await post(base, route + 'chat',
      { message: 'Quero dois cafés' })).json();
    const confirms = await Promise.all([
      post(base, route + 'confirm', { proposalId: response.proposal.id }),
      post(base, route + 'confirm', { proposalId: response.proposal.id })
    ]);
    assert.deepEqual(confirms.map(item => item.status).sort(), [201, 409]);
    assert.equal(store.cash(shop.id).orders, 1);
    assert.equal(store.snapshot().wallet, 164);
  });
});

test('Gemini não pode trocar o item pedido pelo jogador', async () => {
  await withCommerce(async (base, store) => {
    const shop = store.createCafe({ x: 12, z: 5, name: 'Validação Gemini' });
    const result = await (await post(base,
      '/api/shops/' + shop.id + '/attendant/chat',
      { message: 'Quero dois sucos', useGemini: true })).json();
    assert.equal(result.mode, 'local-fallback');
    assert.equal(result.proposal.sku, 'suco');
    assert.equal(result.proposal.quantity, 2);
  }, async () => ({ intent: 'order', sku: 'cafe', quantity: 20 }));
});

test('Atendente rejeita cota expirada e confirmação sem proposta', async () => {
  let clock = 5000;
  const store = createCommerce({ persist: false });
  const shop = store.createCafe({ x: 12, z: 5, name: 'Relógio' });
  const assistant = createAttendantService(async (name, args) => {
    if (name === 'consultar_estoque') return store.inventory(args.estabelecimento_id);
    if (name === 'registrar_pedido') return store.order({
      shopId: args.estabelecimento_id, sku: args.produto,
      quantity: args.quantidade
    });
  }, { now: () => clock });
  const answer = await assistant.chat({ shopId: shop.id, message: 'Quero um café' });
  clock += 120001;
  await assert.rejects(() => assistant.confirm({
    shopId: shop.id, proposalId: answer.proposal.id
  }), /expirado/);
  assert.equal(store.snapshot().wallet, 180);
});

test('Ponte Gemini interpreta JSON sem expor chave; endpoint bloqueia origem externa', async () => {
  const key = 'AIza' + 'A'.repeat(35);
  let upstream = null;
  const handler = createGeminiHandler({ key, fetcher: async (url, init) => {
    upstream = { url, init };
    return { ok: true, json: async () => ({ candidates: [{ content: {
      parts: [{ text: JSON.stringify({ intent: 'order', sku: 'cafe', quantity: 2 }) }]
    } }] }) };
  } });
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    assert.equal((await post(base, '/api/attendant/parse',
      { message: 'Quero um café' }, 'https://invasor.test')).status, 403);
    const result = await post(base, '/api/attendant/parse',
      { message: 'Quero dois cafés' });
    assert.equal(result.status, 200);
    const body = await result.text();
    assert.equal(JSON.parse(body).sku, 'cafe');
    assert.ok(!body.includes(key));
    assert.ok(upstream.url.includes(ATTENDANT_MODEL));
    assert.equal(upstream.init.headers['x-goog-api-key'], key);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
