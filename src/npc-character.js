import * as THREE from 'three';

const material = color => new THREE.MeshStandardMaterial({
  color, roughness: 0.79, metalness: 0.01, flatShading: true
});
function box(parent, color, width, height, depth, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth),
    material(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function labelTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#25385ddf';
  ctx.beginPath();
  ctx.roundRect(6, 14, 500, 104, 28);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#f7f0b4';
  ctx.stroke();
  ctx.font = '900 50px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff9dc';
  ctx.fillText(text, 256, 65);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createNPCCharacter(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const rig = new THREE.Group();
  root.add(rig);
  // Roupa exclusiva da Nina; estrutura leve em blocos.
  box(rig, '#f7a455', 0.90, 0.89, 0.51, 0, 1.55, 0);
  box(rig, '#fff2bd', 0.88, 0.16, 0.56, 0, 1.98, 0);
  box(rig, '#ffe1ab', 0.62, 0.62, 0.60, 0, 2.33, 0);
  box(rig, '#38455e', 0.69, 0.12, 0.67, 0, 2.70, 0);
  box(rig, '#614b91', 0.70, 0.24, 0.65, 0, 2.74, 0.04);
  box(rig, '#614b91', 0.72, 0.18, 0.20, 0, 2.60, -0.32);
  box(rig, '#ffaed1', 0.28, 0.17, 0.68, 0.38, 2.53, 0);
  box(rig, '#ffaed1', 0.28, 0.17, 0.68, -0.38, 2.53, 0);
  for (const x of [-0.15, 0.15]) {
    box(rig, '#32405a', 0.07, 0.09, 0.025, x, 2.36, -0.315);
  }
  box(rig, '#944c65', 0.18, 0.035, 0.022, 0, 2.20, -0.319);
  // Bolsa lateral e detalhes de roupa.
  box(rig, '#4bc4b5', 0.50, 0.58, 0.18, 0.42, 1.55, 0.20);
  box(rig, '#fdf4b9', 0.32, 0.23, 0.05, 0.42, 1.53, 0.31);

  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  leftArm.position.set(-0.62, 1.88, 0);
  rightArm.position.set(0.62, 1.88, 0);
  leftLeg.position.set(-0.23, 1.12, 0);
  rightLeg.position.set(0.23, 1.12, 0);
  box(leftArm, '#ffe1ab', 0.31, 0.72, 0.36, 0, -0.37, 0);
  box(rightArm, '#ffe1ab', 0.31, 0.72, 0.36, 0, -0.37, 0);
  box(leftLeg, '#5c6eba', 0.36, 0.96, 0.42, 0, -0.48, 0);
  box(rightLeg, '#5c6eba', 0.36, 0.96, 0.42, 0, -0.48, 0);
  box(leftLeg, '#38485c', 0.40, 0.19, 0.55, 0, -0.90, -0.09);
  box(rightLeg, '#38485c', 0.40, 0.19, 0.55, 0, -0.90, -0.09);
  rig.add(leftArm, rightArm, leftLeg, rightLeg);

  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map: labelTexture('NINA • MORADORA'),
    transparent: true, depthWrite: false
  }));
  label.position.set(0, 3.55, 0);
  label.scale.set(3.8, 0.94, 1);
  root.add(label);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.83, 1.01, 32),
    new THREE.MeshBasicMaterial({
      color: '#f3e68e', side: THREE.DoubleSide, transparent: true,
      depthWrite: false, opacity: 0.55
    })
  );
  ring.rotation.x = -Math.PI / 2;
  scene.add(ring);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.75, 24),
    new THREE.MeshBasicMaterial({
      color: '#1b3440', transparent: true, opacity: 0.21, depthWrite: false
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  function update({ x, y, z, heading, walking, action, time, nearPlayer }) {
    root.position.set(x, y, z);
    root.rotation.y = heading;
    ring.position.set(x, y + 0.055, z);
    ring.visible = nearPlayer;
    ring.scale.setScalar(1 + Math.sin(time * 2.8) * 0.035);
    shadow.position.set(x, y + 0.035, z);

    const swing = Math.sin(time * 9.8) * (walking ? 0.49 : 0.015);
    leftArm.rotation.x = swing;
    rightArm.rotation.x = -swing;
    leftLeg.rotation.x = -swing;
    rightLeg.rotation.x = swing;
    rightArm.rotation.z = 0;
    leftArm.rotation.z = 0;
    rig.position.y = walking ? Math.abs(Math.cos(time * 9.8)) * 0.055 : Math.sin(time * 1.8) * 0.025;

    if (action === 'eat') {
      rightArm.rotation.x = -1.8 + Math.sin(time * 5.2) * 0.20;
      leftArm.rotation.x = -0.5;
    } else if (action === 'rest') {
      rig.position.y = -0.20;
      rig.rotation.x = 0.14;
      leftArm.rotation.x = rightArm.rotation.x = 0.25;
    } else if (action === 'socialize' || action === 'talk') {
      rightArm.rotation.z = -0.65 + Math.sin(time * 5) * 0.25;
      rightArm.rotation.x = -0.45;
    } else {
      rig.rotation.x = 0;
    }
    if (action !== 'rest') rig.rotation.x = 0;
  }

  return { root, update };
}
