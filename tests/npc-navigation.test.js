import test from 'node:test';
import assert from 'node:assert/strict';
import { findNpcPath, npcPassable, npcSegmentFree } from '../src/npc-navigation.js';
import { LAKE, insideWorld, distanceToLake } from '../src/terrain.js';

test('percurso direto é preferido quando não há obstáculos', () => {
  const start = { x: 1, z: 8 };
  const goal = { x: 6, z: 8 };
  const path = findNpcPath(start, goal);
  assert.deepEqual(path, [goal]);
});
test('Nina não atravessa o lago ou sai dos limites do terreno', () => {
  assert.equal(npcPassable(LAKE.x, LAKE.z), false);
  assert.equal(npcPassable(120, 120), false);
  assert.ok(npcPassable(6, 9));
});
test('desvia de obstáculo e mantém cada trecho transitável', () => {
  const obstacles = [{ x: 0, z: 9, radius: 3.8 }];
  const start = { x: -9, z: 9 };
  const goal = { x: 10, z: 9 };
  const path = findNpcPath(start, goal, obstacles);
  assert.ok(path.length > 1, 'deve ter desvio');
  let previous = start;
  for (const next of path) {
    assert.equal(npcSegmentFree(previous, next, obstacles), true);
    previous = next;
  }
  assert.ok(Math.hypot(previous.x - goal.x, previous.z - goal.z) < 2.5);
});
test('contorna o lago para alcançar o outro lado', () => {
  const start = { x: 9, z: -25 };
  const goal = { x: 51, z: -25 };
  const path = findNpcPath(start, goal);
  assert.ok(path.length > 1, 'rota deve contornar água');
  let previous = start;
  for (const waypoint of path) {
    assert.ok(insideWorld(waypoint.x, waypoint.z));
    assert.ok(distanceToLake(waypoint.x, waypoint.z) > LAKE.radius);
    assert.equal(npcSegmentFree(previous, waypoint), true);
    previous = waypoint;
  }
});
test('destino ocupado é ajustado para espaço seguro', () => {
  const start = { x: 4, z: 13 };
  const obstacles = [{ x: 14, z: 13, radius: 2.8 }];
  const path = findNpcPath(start, { x: 14, z: 13 }, obstacles);
  assert.ok(path.length >= 1);
  assert.ok(npcPassable(path[path.length - 1].x, path[path.length - 1].z, obstacles));
});
test('entrada inválida não gera caminho', () => {
  assert.deepEqual(findNpcPath({ x: NaN, z: 2 }, { x: 1, z: 1 }), []);
  assert.deepEqual(findNpcPath(null, null), []);
});
