import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttendantBrain, ATTENDANT_STATIONS } from '../src/commerce-attendant-brain.js';

const shop = Object.freeze({ id: 'cafe-1', x: 12, z: 5 });
function step(brain, seconds, context = {}) {
  let result = brain.getSnapshot();
  for (let t = 0; t < seconds; t += 0.1) result = brain.update(0.1, context);
  return result;
}

test('Alex nasce em estação segura atrás do balcão e com rotina própria', () => {
  const brain = createAttendantBrain(shop);
  const initial = brain.getSnapshot();
  assert.equal(initial.shopId, shop.id);
  assert.equal(initial.walking, false);
  assert.equal(initial.activity, 'Atendendo no balcão');
  assert.equal(initial.x, ATTENDANT_STATIONS[0].x);
  const activities = new Set();
  let walked = false;
  for (let i = 0; i < 1200; i++) {
    const snapshot = brain.update(0.1, {});
    activities.add(snapshot.activity);
    walked ||= snapshot.walking;
    assert.ok(snapshot.x >= -1.36 && snapshot.x <= 1.36);
    assert.ok(snapshot.z >= -0.56 && snapshot.z <= 0.26);
  }
  assert.ok(walked);
  assert.ok(activities.has('Preparando café'));
  assert.ok(activities.has('Organizando pedidos'));
  assert.ok(activities.has('Caminhando pelo balcão'));
});

test('Alex cumprimenta jogador quando entra na área uma vez por visita', () => {
  const brain = createAttendantBrain(shop);
  const near = { player: { x: shop.x + 4, z: shop.z + 1 } };
  const first = brain.update(0.1, near);
  assert.equal(first.speech, 'Bem-vindo! ☕');
  assert.equal(first.nearPlayer, true);
  step(brain, 4, near);
  assert.equal(brain.getSnapshot().speech, '');
  assert.equal(brain.update(0.1, near).speech, '');
  const far = brain.update(0.1, { player: { x: 0, z: 0 } });
  assert.equal(far.nearPlayer, false);
  assert.equal(brain.update(0.1, near).speech, 'Bem-vindo! ☕');
});

test('Alex reage à Nina próxima sem registrar pedido fictício', () => {
  const brain = createAttendantBrain(shop);
  const answer = brain.update(0.1, {
    player: { x: 100, z: 100 },
    nina: { x: shop.x + 6, z: shop.z }
  });
  assert.equal(answer.speech, 'Oi, Nina! ☕');
  assert.equal(answer.nearNina, true);
  assert.equal(answer.nearPlayer, false);
  assert.equal(brain.update(0.1, { nina: null }).nearNina, false);
});

test('Conversa e pedido controlam a animação sem alterar o comércio', () => {
  const brain = createAttendantBrain(shop);
  const initial = brain.getSnapshot();
  assert.equal(brain.event('open'), true);
  assert.equal(brain.getSnapshot().speech, 'Olá! Posso ajudar?');
  const talking = brain.update(0.1, { player: { x: 15, z: 6 }, interacting: true });
  assert.equal(talking.interacting, true);
  assert.equal(talking.walking, false);
  assert.equal(talking.x, initial.x);
  assert.equal(brain.event('order'), true);
  assert.equal(brain.getSnapshot().speech, 'Pedido pronto! ☕');
  assert.equal(brain.event('unused-action'), false);
  const ending = step(brain, 6);
  assert.equal(ending.speech, '');
  assert.equal(ending.interacting, false);
});

test('Cérebro é isolado por cafeteria e tolera delta inválido', () => {
  const first = createAttendantBrain(shop);
  const second = createAttendantBrain({ id: 'cafe-2', x: 22, z: 15 });
  first.event('restock');
  assert.equal(first.getSnapshot().speech, 'Estoque organizado!');
  assert.equal(second.getSnapshot().speech, '');
  const before = first.getSnapshot();
  first.update(NaN, {});
  first.update(-1, {});
  assert.equal(first.getSnapshot().x, before.x);
  assert.equal(first.getSnapshot().z, before.z);
  assert.throws(() => createAttendantBrain({ x: NaN, z: 0 }), /inválida/);
});

test('Coordenadas mundo são independentes das coordenadas locais do ator', () => {
  const brain = createAttendantBrain(shop);
  step(brain, 15);
  const actor = brain.getSnapshot();
  assert.ok(Math.abs((shop.x + actor.x) - shop.x) < 1.5);
  assert.ok(Math.abs((shop.z + actor.z) - shop.z) < 1);
  assert.ok(Number.isFinite(actor.heading));
});
