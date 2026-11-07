import test from 'node:test';
import assert from 'node:assert/strict';
import { heightAt, rawHeight, LAKE, LAKE_LEVEL, WORLD_LIMIT, insideWorld, distanceToLake } from '../src/terrain.js';

test('altura do terreno é finita e determinística', () => {
  const samples = [[0, 0], [2, 4], [-63, 17], [30, -25], [73, -69]];
  for (const [x, z] of samples) {
    assert.ok(Number.isFinite(heightAt(x, z)));
    assert.equal(heightAt(x, z), heightAt(x, z));
  }
});
test('o lago tem fundo abaixo da água', () => {
  assert.ok(heightAt(LAKE.x, LAKE.z) < LAKE_LEVEL);
  assert.equal(distanceToLake(LAKE.x, LAKE.z), 0);
});
test('limites de caminhada são aplicados', () => {
  assert.ok(insideWorld(0, 6));
  assert.ok(!insideWorld(WORLD_LIMIT, 0));
  assert.ok(!insideWorld(0, -WORLD_LIMIT));
  assert.ok(rawHeight(0, 0) !== undefined);
});
