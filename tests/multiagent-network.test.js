import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createMultiagentNetwork } from '../src/multiagent-network.js';
import { createCommerce } from '../server/commerce-domain.mjs';
import { createCommerceHandler } from '../server/commerce-mcp.mjs';

const shop = { id: 'cafe-1', x: 10, z: 10, name: 'Café da Equipe' };
const products = [
  { sku: 'cafe', label: 'Café quentinho', price: 8, stock: 6 },
  { sku: 'suco', label: 'Suco', price: 10, stock: 3 }
];
const near = { x: 10, z: 5.15, follow: false, conversationOpen: false };
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(options = {}) {
  const events = [], assignments = [], releases = [], emotes = [];
  const network = createMultiagentNetwork({
    readInventory: options.readInventory || (async () => ({ products })),
    assignNina: options.assignNina || (s => {
      assignments.push(s.id);
      return { x: s.x, z: s.z - 5.15 };
    }),
    releaseNina: id => releases.push(id),
    onAlexEvent: (...args) => emotes.push(args),
    onMessage: msg => events.push(msg)
  });
  return { network, events, assignments, releases, emotes };
}

test('Nina e Alex trocam mensagens bidirecionais e concluem missão em colaboração', async () => {
  const sim = setup();
  sim.network.update(0.1, { shops: [shop], nina: near });
  await flush();
  const traveling = sim.network.snapshot();
  assert.equal(traveling.active.phase, 'travelling');
  assert.deepEqual(sim.assignments, ['cafe-1']);
  assert.equal(traveling.agentIds.includes('nina'), true);
  assert.equal(traveling.agentIds.includes('alex:cafe-1'), true);
  const kinds = sim.events.map(m => m.kind);
  assert.deepEqual(kinds.slice(0, 4), [
    'inventory_request', 'inventory_report', 'demo_request', 'demo_accept'
  ]);
  sim.network.update(0.1, { shops: [shop], nina: near });
  assert.equal(sim.network.snapshot().active.phase, 'preparing');
  for (let i = 0; i < 40; i++)
    sim.network.update(0.1, { shops: [shop], nina: near });
  assert.equal(sim.network.snapshot().active, null);
  assert.equal(sim.network.snapshot().completed, 1);
  assert.deepEqual(sim.releases, ['cafe-1']);
  assert.deepEqual(sim.emotes.at(-1), ['cafe-1', 'demo']);
  const sequence = sim.events.map(m => m.kind);
  assert.deepEqual(sequence.slice(-4), [
    'demo_accept', 'arrived', 'demo_ready', 'thanks'
  ]);
  assert.ok(sim.events.every(m => /^task-[a-z0-9-]+$/.test(m.taskId)));
  assert.ok(sim.events.every(m => m.text.length <= 180));
  assert.equal(new Set(sim.events.map(m => m.taskId)).size, 1);
  assert.ok(sim.events.some(m => m.from === 'nina' && m.to === 'alex:cafe-1'));
  assert.ok(sim.events.some(m => m.from === 'alex:cafe-1' && m.to === 'nina'));
});

test('Sem estoque, sem caminhada e sem pedidos automáticos', async () => {
  const sim = setup({ readInventory: async () =>
    ({ products: [{ sku:'cafe',label:'Café',stock:0,price:8 }] }) });
  sim.network.update(0.1, { shops:[shop], nina:near });
  await flush();
  const snapshot = sim.network.snapshot();
  assert.equal(snapshot.active, null);
  assert.equal(snapshot.completed, 0);
  assert.equal(sim.releases.length, 1);
  assert.equal(sim.events.at(-1).kind, 'failed');
  assert.ok(!sim.events.some(m => m.kind === 'demo_ready'));
});

test('Falha do MCP interrompe tarefa e não gera resposta inventada', async () => {
  const sim = setup({ readInventory: async () => { throw new Error('offline'); } });
  sim.network.update(0.1, { shops:[shop], nina:near });
  await flush();
  assert.equal(sim.network.snapshot().active, null);
  assert.match(sim.events.at(-1).text, /MCP indisponível/);
  assert.equal(sim.releases.length, 1);
});

test('Desligar rede interrompe sessão e impede novas mensagens e consultas', async () => {
  let calls = 0;
  const sim = setup({ readInventory: async () => {
    calls++;
    return { products };
  } });
  sim.network.update(0.1, { shops:[shop], nina:near });
  assert.equal(sim.network.setEnabled(false), false);
  await flush();
  assert.equal(calls, 1);
  assert.equal(sim.network.snapshot().active, null);
  assert.equal(sim.network.snapshot().completed, 0);
  const messages = sim.events.length;
  for(let i = 0; i < 50; i++) sim.network.update(0.1, { shops:[shop], nina:near });
  assert.equal(sim.events.length, messages);
  assert.equal(sim.releases.length, 1);
});

test('Conversa do jogador tem prioridade sobre a missão de Nina', async () => {
  const sim = setup();
  sim.network.update(0.1, { shops:[shop], nina:near });
  await flush();
  sim.network.update(0.1, { shops:[shop],
    nina:{ ...near, conversationOpen:true } });
  assert.equal(sim.network.snapshot().active, null);
  assert.equal(sim.releases.length, 1);
  assert.match(sim.events.at(-1).text, /interrompida/i);
});

test('Rede respeita destino autorizado, distância máxima e intervalo entre tarefas', async () => {
  const sim = setup();
  assert.equal(sim.network.start({ id: '../internal', x:10, z:10 }), false);
  assert.equal(sim.network.send('nina', 'intruso', 'demo_request'), false);
  assert.equal(sim.network.send('intruso', 'nina', 'demo_request'), false);
  assert.equal(sim.network.start({ id:'cafe-1', x:NaN,z:10 }), false);
  sim.network.update(0.1, { shops:[shop],
    nina:{...near,x:100,z:100} });
  assert.equal(sim.events.length,0);
  sim.network.update(0.1, { shops:[shop], nina:near });
  await flush();
  sim.network.update(0.1, { shops:[shop], nina:near });
  for(let i=0;i<40;i++) sim.network.update(0.1,{shops:[shop],nina:near});
  assert.equal(sim.network.snapshot().completed,1);
  const n=sim.events.length;
  for(let i=0;i<200;i++) sim.network.update(0.1,{shops:[shop],nina:near});
  assert.equal(sim.events.length,n);
});

test('Gateway MCP de agentes é somente leitura, restringe origem e não afeta economia', async () => {
  const store = createCommerce({ persist:false });
  const existing = store.createCafe({name:'Café da Rede',x:12,z:5});
  const hosts = new Set();
  const server = http.createServer(createCommerceHandler(store,{allowedHosts:hosts}));
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  hosts.add('127.0.0.1:'+server.address().port);
  const api='/api/shops/'+existing.id+'/agents/stock';
  const origin='http://127.0.0.1:5173';
  try {
    const initial=store.snapshot();
    const response=await fetch(base+api,{headers:{Origin:origin}});
    assert.equal(response.status,200);
    const body=await response.json();
    assert.deepEqual(body,store.inventory(existing.id));
    assert.equal((await fetch(base+api,{
      method:'POST',headers:{Origin:origin}
    })).status,404);
    assert.equal((await fetch(base+api,{
      headers:{Origin:'https://outside.example'}
    })).status,403);
    assert.equal((await fetch(base+'/api/shops/cafe-999/agents/stock',{
      headers:{Origin:origin}
    })).status,400);
    assert.equal(store.snapshot().wallet,initial.wallet);
    assert.equal(store.cash(existing.id).orders,0);
    assert.deepEqual(store.inventory(existing.id),body);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
