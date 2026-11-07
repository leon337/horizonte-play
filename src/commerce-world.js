import * as THREE from 'three';
import { heightAt } from './terrain.js';

const material = color => new THREE.MeshStandardMaterial({
  color, roughness: 0.82, metalness: 0.015, flatShading: true
});
function cube(parent, color, w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function signTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#6c4171';
  ctx.beginPath();
  ctx.roundRect(6, 8, 756, 176, 25);
  ctx.fill();
  ctx.strokeStyle = '#fff3c7';
  ctx.lineWidth = 11;
  ctx.stroke();
  ctx.fillStyle = '#fff4cf';
  ctx.font = 'bold 62px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = String(text).slice(0, 30).toLocaleUpperCase('pt-BR');
  const width = ctx.measureText(label).width;
  if (width > 660) {
    ctx.font = 'bold ' + Math.floor(62 * 660 / width) + 'px Arial, sans-serif';
  }
  ctx.fillText(label, 384, 97);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function makeShop(scene, shop) {
  const group = new THREE.Group();
  group.position.set(shop.x, heightAt(shop.x, shop.z), shop.z);
  scene.add(group);

  // Cafeteria estilizada de balcão: loja interativa, não é cenário de fachada.
  cube(group, '#e4c69c', 7.6, 0.22, 7.2, 0, 0.04, 0);
  cube(group, '#fff2d8', 7.25, 3.8, 0.38, 0, 2.0, 3.18);
  cube(group, '#ffecd0', 0.44, 3.8, 6.15, -3.46, 2.0, 0.2);
  cube(group, '#ffecd0', 0.44, 3.8, 6.15, 3.46, 2.0, 0.2);
  cube(group, '#de867c', 8.2, 0.55, 8.0, 0, 4.03, 0.0);
  cube(group, '#f1ad92', 8.45, 0.16, 8.15, 0, 4.35, 0.0);
  cube(group, '#ffc793', 7.4, 0.23, 1.45, 0, 3.52, -3.37);
  for (let i = -3; i <= 3; i++) {
    cube(group, i % 2 === 0 ? '#f8dca5' : '#ed9c9b', 1.08, 0.58, 1.45,
      i * 1.05, 3.12, -3.38);
  }

  cube(group, '#b9785e', 6.6, 1.22, 0.75, 0, 1.07, -2.53);
  cube(group, '#f7dfb5', 6.75, 0.18, 0.95, 0, 1.78, -2.50);
  cube(group, '#78c8b9', 1.3, 1.58, 0.13, -2.47, 2.55, 3.01);
  cube(group, '#78c8b9', 1.3, 1.58, 0.13, 2.47, 2.55, 3.01);
  // Cafeteira, canecas e alimentos de brinquedo.
  cube(group, '#596c81', 1.1, 0.9, 0.64, -2.05, 2.29, -1.78);
  cube(group, '#ffdda7', 0.47, 0.32, 0.42, -0.74, 1.98, -2.43);
  cube(group, '#ffdda7', 0.47, 0.32, 0.42, 0.0, 1.98, -2.43);
  for (const x of [1.12, 1.72, 2.32]) {
    const roll = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0),
      material('#e5a75e'));
    roll.position.set(x, 2.05, -2.49);
    roll.castShadow = true;
    group.add(roll);
  }

  // Atendente do MVP: boneco cenográfico com tarefas digitais via MCP.
  const worker = new THREE.Group();
  worker.position.set(0.62, 0, 0.15);
  cube(worker, '#4f9f9e', 0.69, 1.10, 0.49, 0, 1.57, 0);
  cube(worker, '#d3c390', 0.60, 0.60, 0.55, 0, 2.45, 0);
  cube(worker, '#674b78', 0.72, 0.24, 0.65, 0, 2.80, 0);
  cube(worker, '#53687b', 0.28, 0.9, 0.35, -0.18, 0.53, 0);
  cube(worker, '#53687b', 0.28, 0.9, 0.35, 0.18, 0.53, 0);
  const workerArm = cube(worker, '#d3c390', 0.22, 0.81, 0.29, 0.57, 1.58, 0.0);
  cube(worker, '#d3c390', 0.22, 0.81, 0.29, -0.57, 1.58, 0);
  group.add(worker);

  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map: signTexture(shop.name), transparent: true, depthWrite: false
  }));
  label.position.set(0, 5.36, -1.9);
  label.scale.set(5.3, 1.34, 1);
  group.add(label);

  const ring = new THREE.Mesh(new THREE.RingGeometry(4.25, 4.53, 48),
    new THREE.MeshBasicMaterial({
      color: '#ffe99a', transparent: true, opacity: 0.67,
      side: THREE.DoubleSide, depthWrite: false
    }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.12, 0);
  group.add(ring);

  const collider = { x: shop.x, z: shop.z, radius: 3.7 };
  return {
    shop, group, collider, workerArm, ring,
    update(time, near) {
      workerArm.rotation.z = Math.sin(time * 2.7) * 0.16;
      ring.visible = near;
      ring.material.opacity = 0.42 + Math.sin(time * 3) * 0.16;
    }
  };
}
export function createCommerceWorld(scene, obstacles) {
  const shops = new Map();
  function add(shop) {
    if (!shop || shops.has(shop.id)) return;
    const display = makeShop(scene, shop);
    shops.set(shop.id, display);
    obstacles.push(display.collider);
  }
  function update(time, player) {
    for (const display of shops.values()) {
      const near = Math.hypot(display.shop.x - player.x,
        display.shop.z - player.z) < 8;
      display.update(time, near);
    }
  }
  function nearby(player, maxDistance = 7.7) {
    let best = null;
    for (const display of shops.values()) {
      const distance = Math.hypot(display.shop.x - player.x,
        display.shop.z - player.z);
      if (distance <= maxDistance &&
        (!best || distance < best.distance)) best = { shop: display.shop, distance };
    }
    return best?.shop || null;
  }
  // Encontra um ângulo alternativo de câmera ao redor do avatar.
  // Reduzir a distância demais causa zoom dentro do corpo; por isso rotaciona.
  function restrictCamera(target, desired) {
    if (!shops.size) return 0;
    function blocked(candidate) {
      for (const display of shops.values()) {
        const sx = display.shop.x, sz = display.shop.z;
        const floor = heightAt(sx, sz);
        for (let i = 1; i <= 60; i++) {
          const t = i / 60;
          const x = target.x + (candidate.x - target.x) * t;
          const y = target.y + (candidate.y - target.y) * t;
          const z = target.z + (candidate.z - target.z) * t;
          if (Math.abs(x - sx) < 3.95 &&
              Math.abs(z - sz) < 4.15 &&
              y > floor + 0.1 && y < floor + 5.3) return true;
        }
      }
      return false;
    }
    if (!blocked(desired)) return 0;
    const dx = desired.x - target.x;
    const dz = desired.z - target.z;
    const angle = Math.atan2(dx, dz);
    const distance = Math.hypot(dx, dz);
    for (const offset of [-0.45, 0.45, -0.85, 0.85, -1.30, 1.30,
      -1.8, 1.8, Math.PI]) {
      const candidate = desired.clone();
      candidate.x = target.x + Math.sin(angle + offset) * distance;
      candidate.z = target.z + Math.cos(angle + offset) * distance;
      if (!blocked(candidate)) {
        desired.copy(candidate);
        return offset;
      }
    }
    // Último recurso: eleva a visão para não atravessar a cobertura.
    desired.y = Math.max(desired.y, target.y + 7.0);
    return 0;
  }
  return { add, update, nearby, restrictCamera,
    get count() { return shops.size; },
    has: id => shops.has(id) };
}
