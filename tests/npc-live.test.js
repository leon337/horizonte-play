import test from 'node:test';
import assert from 'node:assert/strict';
import { pcmToBase64, base64ToPcm } from '../src/npc-live.js';

test('áudio PCM16 é serializado/deserializado sem alterações grandes', () => {
  const input = new Float32Array([0, 0.15, -0.32, 0.79, -0.8, 1, -1]);
  const result = base64ToPcm(pcmToBase64(input));
  assert.equal(result.length, input.length);
  input.forEach((sample, i) => {
    assert.ok(Math.abs(sample-result[i]) < 0.00005);
  });
});
test('pacotes de voz em branco são suportados', () => {
  assert.equal(pcmToBase64(new Float32Array(0)), '');
  assert.equal(base64ToPcm('').length, 0);
});
