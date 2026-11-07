import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAKE, LAKE_LEVEL, heightAt, isInLake, waterDepthAt,
  isSwimmingAt, characterBaseAt, insideWorld,
  swimFeetLimits, clampSwimFeet, isFullySubmerged
} from '../src/terrain.js';

test('o centro do lago possui profundidade para mergulho real', () => {
  assert.ok(insideWorld(LAKE.x, LAKE.z));
  assert.equal(isInLake(LAKE.x, LAKE.z), true);
  assert.ok(waterDepthAt(LAKE.x, LAKE.z) > 8, 'esperado lago com mais de 8 m');
  assert.ok(waterDepthAt(LAKE.x, LAKE.z) < 10);
});
test('o lago tem rampas de entrada progressivas até o fundo', () => {
  const values = [14, 13, 11, 8, 4, 0].map(dx => waterDepthAt(LAKE.x + dx, LAKE.z));
  for (let i = 1; i < values.length; i++) {
    assert.ok(values[i] >= values[i - 1], 'a profundidade cresce ao aproximar do centro');
  }
});
test('a navegação na água conserva os limites do fundo e da superfície', () => {
  const x = LAKE.x, z = LAKE.z;
  const { floor, surface } = swimFeetLimits(x, z);
  assert.ok(floor < surface);
  assert.ok(floor >= heightAt(x, z));
  assert.equal(clampSwimFeet(x, z, -999), floor);
  assert.equal(clampSwimFeet(x, z, 999), surface);
  assert.ok(isFullySubmerged(floor));
  assert.equal(isFullySubmerged(surface), false);
});
test('o boneco pode mergulhar, subir e voltar a flutuar', () => {
  const x = LAKE.x, z = LAKE.z;
  let feet = clampSwimFeet(x, z, LAKE_LEVEL - 1.12);
  for (let i = 0; i < 120; i++) feet = clampSwimFeet(x, z, feet - 2.8 / 60);
  assert.ok(isFullySubmerged(feet), 'deve alcançar o estado submerso');
  for (let i = 0; i < 120; i++) feet = clampSwimFeet(x, z, feet + 4.0 / 60);
  assert.equal(isFullySubmerged(feet), false);
  assert.ok(feet <= LAKE_LEVEL - 1.12 + 1e-8);
});
test('na parte rasa não atravessa o fundo', () => {
  const x = LAKE.x + 11, z = LAKE.z;
  assert.ok(isSwimmingAt(x, z));
  assert.ok(clampSwimFeet(x, z, -500) > heightAt(x, z));
});
test('fora do lago o chão continua normal', () => {
  const x = LAKE.x + LAKE.radius + 2, z = LAKE.z;
  assert.equal(isInLake(x, z), false);
  assert.equal(isSwimmingAt(x, z), false);
  assert.equal(waterDepthAt(x, z), 0);
  assert.equal(characterBaseAt(x, z), heightAt(x, z));
});
