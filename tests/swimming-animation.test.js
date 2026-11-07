import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAvatar } from '../src/avatar.js';
import {
  LAKE, LAKE_LEVEL, heightAt, waterDepthAt, isSwimmingAt,
  SWIM_ENTRY_DEPTH, SWIM_SURFACE_OFFSET, swimFeetLimits, isFullySubmerged
} from '../src/terrain.js';

test('personagem passa de andar em pé para nadar deitado com braçadas e pernadas', () => {
  const scene = new THREE.Scene();
  const avatar = createAvatar(scene);
  avatar.update(0, heightAt(0, 6), 6, 0, 0, 0.1, true, 6, false);
  assert.ok(avatar.getMotionState().blend < 0.2);

  const lakeFloor = heightAt(LAKE.x, LAKE.z);
  for (let i = 1; i <= 90; i++) {
    avatar.update(LAKE.x, lakeFloor, LAKE.z, 0, LAKE_LEVEL - SWIM_SURFACE_OFFSET - lakeFloor, i / 60 + 0.1, true, 3.5, true);
  }
  const swim = avatar.getMotionState();
  assert.ok(swim.swimming, 'animação deve estar no modo natação');
  assert.ok(swim.tilt < -1.20, 'tronco deve ficar quase horizontal');
  assert.ok(Math.abs(swim.leftArm) > 1.3, 'braço deve se estender para a frente');
  assert.ok(Math.abs(swim.rightArm) > 1.3, 'outro braço deve se estender para a frente');
  assert.ok(Math.abs(swim.leftLeg - swim.rightLeg) > 0.1, 'pernas devem ter movimentos alternados');

  for (let i = 91; i <= 180; i++) {
    avatar.update(0, heightAt(0, 6), 6, 0, 0, i / 60 + 0.1, true, 6, false);
  }
  const walked = avatar.getMotionState();
  assert.ok(!walked.swimming);
  assert.ok(Math.abs(walked.tilt) < 0.1, 'ao sair o corpo deve ficar em pé');
});
test('profundidade mínima evita nadar flutuando acima da margem rasa', () => {
  assert.ok(SWIM_ENTRY_DEPTH >= 1.2);
  assert.ok(SWIM_SURFACE_OFFSET > 1.5);
  assert.ok(!isSwimmingAt(LAKE.x + LAKE.radius - 0.1, LAKE.z));
  assert.ok(isSwimmingAt(LAKE.x, LAKE.z));
  const { floor, surface } = swimFeetLimits(LAKE.x, LAKE.z);
  assert.ok(floor < surface);
  assert.equal(surface, LAKE_LEVEL - SWIM_SURFACE_OFFSET);
  assert.equal(isFullySubmerged(surface), false);
  assert.ok(waterDepthAt(LAKE.x, LAKE.z) > 8);
});
