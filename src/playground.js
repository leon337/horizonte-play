import * as THREE from 'three';
import { heightAt } from './terrain.js';

function block(scene, material, w, h, d, x, groundY, z, yOffset = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, groundY + yOffset + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
const material = color => new THREE.MeshStandardMaterial({
  color, flatShading: true, roughness: 0.86
});

export function createPlayground(scene) {
  const colliders = [];
  const cream = material('#fff4d6');
  const orange = material('#f2ad54');
  const teal = material('#5ed4b4');
  const pink = material('#ef8ab3');
  const blue = material('#79b9fa');
  const violet = material('#9981dc');
  const wood = material('#695a75');
  const lime = material('#b9e46d');

  // Pequena praça de chegada.
  const cx = 0, cz = 6, cy = heightAt(cx, cz);
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(5.8, 5.8, 0.14, 10),
    material('#edd6b2')
  );
  plaza.position.set(cx, cy - 0.02, cz);
  plaza.receiveShadow = true;
  scene.add(plaza);

  // Arco original do Horizonte, na direção do lago.
  const archZ = -3;
  for (const x of [-3.5, 3.5]) {
    block(scene, wood, 0.78, 4.15, 0.78, x, heightAt(x, archZ), archZ);
    colliders.push({ x, z: archZ, radius: 0.65 });
  }
  block(scene, blue, 7.9, 1.0, 0.82, 0, heightAt(0, archZ), archZ, 3.5);

  // Bandeirinhas quadradas e marcos de percurso.
  for (let i = 0; i < 5; i++) {
    const x = 8 + i * 3.2;
    const z = 0 - i * 3.8;
    const y = heightAt(x, z);
    block(scene, wood, 0.13, 3.0, 0.13, x, y, z);
    block(scene, [orange, pink, lime, teal, blue][i], 1.0, 0.74, 0.15, x + 0.56, y, z, 1.95);
  }

  // Casas de brinquedo: construções próprias de baixa complexidade.
  function house(x, z, walls, roof, size = 1) {
    const y = heightAt(x, z);
    block(scene, cream, 4.5 * size, 0.3, 4.2 * size, x, y, z);
    block(scene, walls, 3.7 * size, 3.1 * size, 3.6 * size, x, y, z, 0.2);
    const roofMesh = new THREE.Mesh(
      new THREE.ConeGeometry(3.16 * size, 2.15 * size, 4),
      roof
    );
    roofMesh.rotation.y = Math.PI / 4;
    roofMesh.position.set(x, y + 4.18 * size, z);
    roofMesh.castShadow = true;
    scene.add(roofMesh);
    const door = block(scene, wood, 1.05 * size, 2.0 * size, 0.11, x, y, z - 1.86 * size);
    door.castShadow = false;
    for (const dx of [-1.10, 1.10]) {
      block(scene, blue, 0.7 * size, 0.7 * size, 0.12, x + dx * size, y + 0.7 * size, z - 1.86 * size);
    }
    colliders.push({ x, z, radius: 3.3 * size });
  }
  house(-14, 15, teal, orange, 1.0);
  house(-23, 21, pink, violet, 0.92);
  house(14, 22, blue, lime, 0.9);

  // Torres decorativas, que dão ao vale um aspecto de mapa de jogo.
  for (const [x, z, color] of [[-32, -12, orange], [43, 18, violet]]) {
    const y = heightAt(x, z);
    block(scene, cream, 4.2, 0.5, 4.2, x, y, z);
    block(scene, color, 3.4, 5.7, 3.4, x, y, z, 0.5);
    block(scene, wood, 4.7, 0.6, 4.7, x, y, z, 6.2);
    colliders.push({ x, z, radius: 2.9 });
  }

  // Peças coloridas espalhadas longe da entrada, apenas cenário.
  for (const [x, z, color] of [
    [-20, -6, orange], [-26, -8, teal], [-20, -14, pink],
    [11, 30, lime], [17, 32, violet], [23, 32, blue]
  ]) {
    const y = heightAt(x, z);
    block(scene, color, 2.2, 1.4, 2.2, x, y, z);
    colliders.push({ x, z, radius: 1.4 });
  }
  return { colliders };
}
