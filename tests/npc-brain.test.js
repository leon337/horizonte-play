import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialMind, updateMind, npcReply, decideGoal, getTarget,
  clockLabel, memorySnapshot, NPC_GOALS
} from '../src/npc-brain.js';

test('Nina inicia com necessidades, rotina e dados controlados', () => {
  const mind = initialMind();
  assert.equal(mind.name, 'Nina');
  assert.equal(mind.goal, 'explore');
  assert.equal(mind.follow, false);
  assert.ok(Object.keys(NPC_GOALS).length >= 6);
  assert.ok(getTarget(mind).x !== undefined);
  assert.equal(clockLabel(mind.clockMinutes), '08:00');
});
test('Nina explora, conclui atividade e melhora curiosidade', () => {
  const mind = initialMind();
  updateMind(mind, 0.1, true);
  assert.equal(mind.phase, 'acting');
  for (let i = 0; i < 45; i++) updateMind(mind, 0.1);
  assert.ok(mind.needs.curiosity > 60);
  assert.equal(mind.completed, 1);
  assert.equal(mind.goal, 'wander');
});
test('necessidades urgentes mudam o objetivo e comida restaura saciedade', () => {
  const mind = initialMind();
  mind.needs.food = 12;
  updateMind(mind, 0.1, false);
  assert.equal(mind.goal, 'eat');
  updateMind(mind, 0.1, true);
  for (let i = 0; i < 70; i++) updateMind(mind, 0.1);
  assert.ok(mind.needs.food > 50);
  assert.ok(mind.completed >= 1);
});
test('prioridade de descanso e sociabilidade', () => {
  const mind = initialMind();
  mind.needs.food = 80;
  mind.needs.energy = 25;
  assert.equal(decideGoal(mind), 'rest');
  mind.needs.energy = 80;
  mind.needs.social = 20;
  assert.equal(decideGoal(mind), 'socialize');
});
test('conversa memoriza nome, ativa seguir e volta a rotina', () => {
  const mind = initialMind();
  assert.match(npcReply(mind, 'Meu nome é Ana'), /Ana/);
  assert.equal(mind.memory.playerName, 'Ana');
  assert.match(npcReply(mind, 'me siga'), /acompanhar/i);
  assert.equal(mind.follow, true);
  assert.match(npcReply(mind, 'pare de me seguir'), /voltar/i);
  assert.equal(mind.follow, false);
  const memory = memorySnapshot(mind);
  assert.deepEqual(Object.keys(memory).sort(), ['conversations', 'lastTopic', 'playerName']);
  assert.equal(initialMind(memory).memory.playerName, 'Ana');
});
test('fala desconhecida é tratada localmente e nomes inválidos não contaminam estado', () => {
  const mind = initialMind({ playerName: '<script>alert(1)</script>', conversations: 999999 });
  assert.equal(mind.memory.playerName, null);
  assert.equal(mind.memory.conversations, 10000);
  const answer = npcReply(mind, '<img src=x onerror=alert(1)>');
  assert.ok(typeof answer === 'string' && answer.length > 15);
  assert.equal(mind.memory.playerName, null);
});
test('interação responde sobre atividades e horário sem chamada externa', () => {
  const mind = initialMind();
  assert.match(npcReply(mind, 'o que está fazendo?'), /explorando/i);
  assert.match(npcReply(mind, 'que horas são?'), /08:00/);
  assert.match(npcReply(mind, 'como você está?'), /energia/i);
});
