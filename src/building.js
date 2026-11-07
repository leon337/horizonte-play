import * as THREE from 'three';
import { heightAt, insideWorld, LAKE, distanceToLake } from './terrain.js';

const SAVE_KEY = 'horizonte-sandbox-blocks-v1';
const PALETTE = [
  { label: 'Coral', color: '#ff8c72' },
  { label: 'Azul', color: '#63b5f8' },
  { label: 'Amarelo', color: '#ffe082' }
];
const MAX_BLOCKS = 90;
const GRID_SIZE = 2.6;
export const BLOCK_COLORS = PALETTE;

export function snapToGrid(value) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}
export function canBuildAt(x, z, avatar, colliders = []) {
  if (!insideWorld(x, z) || distanceToLake(x, z) < LAKE.radius + 2.4) return false;
  if (Math.hypot(x - avatar.x, z - avatar.z) < 3.1) return false;
  return !colliders.some(item => Math.hypot(item.x - x, item.z - z) < (item.radius || 1) + 1.2);
}

export function createBuildingSystem(scene, baseColliders) {
  const box = new THREE.BoxGeometry(2.35, 2.35, 2.35);
  const mats = PALETTE.map(item => new THREE.MeshStandardMaterial({
    color: item.color, flatShading: true, roughness: 0.79
  }));
  const blocks = [];
  const colliders = [];
  const limit = MAX_BLOCKS;

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(blocks.map(({ x, z, color }) => ({ x, z, color }))));
    } catch {
      // A navegação continua normalmente mesmo sem armazenamento disponível.
    }
  }
  function addBlock(x, z, color, persist = true) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || blocks.length >= limit) return false;
    x = snapToGrid(x);
    z = snapToGrid(z);
    if (!Number.isInteger(color) || color < 0 || color >= PALETTE.length) return false;
    if (!canBuildAt(x, z, { x: 0, z: 6 }, [...baseColliders, ...colliders])) return false;
    const mesh = new THREE.Mesh(box, mats[color]);
    mesh.position.set(x, heightAt(x, z) + 1.175, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const collider = { x, z, radius: 1.55 };
    colliders.push(collider);
    blocks.push({ x, z, color, mesh, collider });
    if (persist) save();
    return true;
  }
  function placeInFront(avatar, yaw, color) {
    const x = snapToGrid(avatar.x - Math.sin(yaw) * 5.4);
    const z = snapToGrid(avatar.z - Math.cos(yaw) * 5.4);
    if (!canBuildAt(x, z, avatar, [...baseColliders, ...colliders])) return false;
    return addBlock(x, z, color);
  }
  function removeLast() {
    const last = blocks.pop();
    if (!last) return false;
    scene.remove(last.mesh);
    colliders.pop();
    save();
    return true;
  }
  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]');
      if (!Array.isArray(saved)) return;
      saved.slice(0, MAX_BLOCKS).forEach(item => {
        if (item && Number.isFinite(item.x) && Number.isFinite(item.z)) {
          addBlock(item.x, item.z, item.color, false);
        }
      });
    } catch {
      // Ignora dados antigos ou inválidos.
    }
  }
  restore();

  return { placeInFront, removeLast, colliders, get count() { return blocks.length; }, limit };
}
