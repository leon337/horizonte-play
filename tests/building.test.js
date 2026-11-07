import test from 'node:test';
import assert from 'node:assert/strict';
import { snapToGrid, canBuildAt, BLOCK_COLORS } from '../src/building.js';

test('a construção encaixa blocos na grade', () => {
  assert.equal(snapToGrid(2.8), 2.6);
  assert.equal(snapToGrid(-2.8), -2.6);
  assert.equal(snapToGrid(0.1), 0);
});
test('há três cores originais', () => {
  assert.equal(BLOCK_COLORS.length, 3);
  assert.ok(BLOCK_COLORS.every(color => color.color.startsWith('#')));
});
test('não constrói sobre jogador, lago ou obstáculos', () => {
  const avatar = { x: 0, z: 6 };
  assert.equal(canBuildAt(0, 6, avatar), false);
  assert.equal(canBuildAt(30, -25, avatar), false);
  assert.equal(canBuildAt(16, 20, avatar, [{ x: 16, z: 20, radius: 2 }]), false);
  assert.equal(canBuildAt(-34, 15, avatar), true);
});
