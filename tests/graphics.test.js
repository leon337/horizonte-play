import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/graphics.js';

test('existe controle para níveis diferentes de GPU', () => {
  assert.deepEqual(Object.keys(PRESETS), ['equilibrado','alto','ultra']);
  assert.ok(PRESETS.ultra.scale > PRESETS.alto.scale);
  assert.ok(PRESETS.alto.scale > PRESETS.equilibrado.scale);
  assert.ok(PRESETS.ultra.bloom);
  assert.equal(PRESETS.alto.bloom, false);
});
test('presets têm escalas de resolução positivas e limitadas', () => {
  for(const preset of Object.values(PRESETS)) {
    assert.ok(preset.scale >= 0.7);
    assert.ok(preset.scale <= 1.5);
  }
});
