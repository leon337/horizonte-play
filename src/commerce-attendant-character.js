import * as THREE from 'three';

// Rig simples do Alex. Nenhum asset externo, API ou dependência nova.
function box(parent, color, size, position) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({
      color, roughness: 0.81, metalness: 0.01, flatShading: true
    })
  );
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function spriteText(label, width, height, background) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  function draw(text) {
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.roundRect(5, 12, 502, 104, 26);
    ctx.fill();
    ctx.strokeStyle = '#fff4cd';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = '#fffaf2';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 39px Arial, sans-serif';
    let value = String(text).slice(0, 40);
    while (ctx.measureText(value).width > 467 && value.length > 1) {
      value = value.slice(0, -1);
    }
    ctx.fillText(value, 256, 66);
    texture.needsUpdate = true;
  }
  draw(label);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, transparent: true, depthWrite: false
  }));
  sprite.scale.set(width, height, 1);
  return { sprite, draw };
}
export function createAttendantCharacter(parent, shopId) {
  const root = new THREE.Group();
  root.name = 'alex-attendant-' + String(shopId);
  parent.add(root);
  const torso = new THREE.Group();
  root.add(torso);
  box(torso, '#50a5a1', [0.78, 1.05, 0.50], [0, 1.63, 0]);
  box(torso, '#f8edce', [0.43, 0.67, 0.045], [0, 1.58, -0.28]);
  box(torso, '#edaa68', [0.22, 0.12, 0.07], [0, 1.74, -0.32]);
  box(torso, '#424f78', [0.61, 0.18, 0.55], [0, 1.06, 0]);

  const head = new THREE.Group();
  head.position.y = 2.34;
  torso.add(head);
  box(head, '#f3c794', [0.65, 0.61, 0.58], [0, 0, 0]);
  box(head, '#5d455f', [0.72, 0.13, 0.63], [0, 0.35, 0]);
  box(head, '#fff2d7', [0.77, 0.29, 0.69], [0, 0.51, 0]);
  box(head, '#fff2d7', [0.91, 0.08, 0.74], [0, 0.39, -0.05]);
  for (const eye of [-0.15, 0.15]) {
    box(head, '#263e52', [0.065, 0.073, 0.028], [eye, 0.02, -0.306]);
  }
  box(head, '#965668', [0.18, 0.035, 0.025], [0, -0.14, -0.305]);

  function limb(px, py, color, dimensions, offset) {
    const limbRoot = new THREE.Group();
    limbRoot.position.set(px, py, 0);
    torso.add(limbRoot);
    box(limbRoot, color, dimensions, offset);
    return limbRoot;
  }
  const leftArm = limb(-0.55, 2.01, '#f3c794', [0.27, 0.77, 0.32], [0, -0.38, 0]);
  const rightArm = limb(0.55, 2.01, '#f3c794', [0.27, 0.77, 0.32], [0, -0.38, 0]);
  const leftLeg = limb(-0.20, 1.12, '#526b87', [0.29, 0.94, 0.38], [0, -0.47, 0]);
  const rightLeg = limb(0.20, 1.12, '#526b87', [0.29, 0.94, 0.38], [0, -0.47, 0]);

  const title = spriteText('ALEX · ATENDENTE', 3.3, 0.83, '#30485c');
  title.sprite.position.set(0, 3.42, 0);
  root.add(title.sprite);

  const bubble = spriteText('Bem-vindo! ☕', 3.2, 0.82, '#62456b');
  // Acima do telhado (4,35m): mensagem visível mesmo da lateral da loja.
  bubble.sprite.position.set(0, 5.90, 0);
  bubble.sprite.visible = false;
  root.add(bubble.sprite);
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.64, 0.79, 28),
    new THREE.MeshBasicMaterial({
      color: '#f4db77', side: THREE.DoubleSide,
      transparent: true, opacity: 0.67, depthWrite: false
    }));
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.075;
  halo.visible = false;
  root.add(halo);
  let previousSpeech = '';

  function update(snapshot, time, showAttention = false) {
    root.position.set(snapshot.x, 0, snapshot.z);
    root.rotation.y = snapshot.heading;
    const walking = snapshot.walking;
    const armSwing = walking ? Math.sin(time * 8.7) * 0.40 : 0;
    leftLeg.rotation.x = -armSwing;
    rightLeg.rotation.x = armSwing;
    leftArm.rotation.x = armSwing * 0.7;
    rightArm.rotation.x = -armSwing * 0.7;
    leftArm.rotation.z = 0;
    rightArm.rotation.z = 0;
    head.rotation.y = 0;
    torso.position.y = walking ?
      Math.abs(Math.sin(time * 8.7)) * 0.065 : Math.sin(time * 2.1) * 0.020;

    if (snapshot.interacting || snapshot.speech) {
      rightArm.rotation.x = -0.46;
      rightArm.rotation.z = -0.60 + Math.sin(time * 4.5) * 0.20;
      head.rotation.y = Math.sin(time * 2.7) * 0.075;
    } else if (snapshot.activity === 'Preparando café') {
      leftArm.rotation.x = -0.8 + Math.sin(time * 4.2) * 0.24;
      rightArm.rotation.x = -0.65;
    } else if (snapshot.activity === 'Organizando pedidos') {
      rightArm.rotation.x = -0.55 + Math.sin(time * 2.2) * 0.15;
    }
    halo.visible = showAttention;
    halo.scale.setScalar(1 + Math.sin(time * 3) * 0.055);
    if (snapshot.speech !== previousSpeech) {
      previousSpeech = snapshot.speech;
      if (snapshot.speech) bubble.draw(snapshot.speech);
    }
    bubble.sprite.visible = Boolean(snapshot.speech) && showAttention;
    title.sprite.visible = showAttention;
  }
  return { root, update };
}
