import * as THREE from 'three';

// Avatar original. O esqueleto em grupos permite andar em pé ou nadar horizontalmente.
const mat = color => new THREE.MeshStandardMaterial({ color, roughness: 0.83, flatShading: true });
function part(parent, color, w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export function createAvatar(scene) {
  const root = new THREE.Group();
  scene.add(root);
  // Giro no centro do corpo: o avatar não gira pelos pés ao entrar na água.
  const swimPivot = new THREE.Group();
  swimPivot.position.y = 1.55;
  root.add(swimPivot);
  const body = new THREE.Group();
  body.position.y = -1.55;
  swimPivot.add(body);

  part(body, '#2c93fa', 1.05, 1.12, 0.55, 0, 1.67, 0);
  part(body, '#b8efff', 0.76, 0.22, 0.59, 0, 2.13, 0);
  part(body, '#f2bb68', 0.68, 0.7, 0.66, 0, 2.69, 0);
  part(body, '#2b2e4d', 0.75, 0.18, 0.73, 0, 3.10, 0.02);
  part(body, '#2b2e4d', 0.76, 0.19, 0.25, 0, 2.98, -0.29);
  for (const x of [-0.17, 0.17]) {
    part(body, '#263445', 0.085, 0.105, 0.016, x, 2.73, -0.338);
  }
  part(body, '#7c3b34', 0.23, 0.045, 0.018, 0, 2.51, -0.346);
  part(body, '#e6a14e', 0.79, 0.92, 0.28, 0, 1.72, 0.40);
  part(body, '#ffdc8e', 0.3, 0.25, 0.03, 0, 1.7, 0.555);

  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  leftArm.position.set(-0.70, 2.08, 0);
  rightArm.position.set(0.70, 2.08, 0);
  leftLeg.position.set(-0.26, 1.1, 0);
  rightLeg.position.set(0.26, 1.1, 0);
  part(leftArm, '#f0b56c', 0.36, 0.97, 0.43, 0, -0.5, 0);
  part(rightArm, '#f0b56c', 0.36, 0.97, 0.43, 0, -0.5, 0);
  part(leftLeg, '#354d9c', 0.42, 1.02, 0.48, 0, -0.52, 0);
  part(rightLeg, '#354d9c', 0.42, 1.02, 0.48, 0, -0.52, 0);
  part(leftLeg, '#253450', 0.45, 0.2, 0.61, 0, -0.94, -0.09);
  part(rightLeg, '#253450', 0.45, 0.2, 0.61, 0, -0.94, -0.09);
  body.add(leftArm, rightArm, leftLeg, rightLeg);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.82, 24),
    new THREE.MeshBasicMaterial({ color: '#2b3c2d', transparent: true, opacity: 0.2, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  let swimBlend = 0;
  let lastTime = null;
  function update(x, groundY, z, rotation, elevation, time, moving, speed, swimming = false) {
    const dt = lastTime === null ? 0.016 : Math.min(0.1, Math.max(0, time - lastTime));
    lastTime = time;
    const target = swimming ? 1 : 0;
    swimBlend = THREE.MathUtils.damp(swimBlend, target, 8.5, dt);
    root.position.set(x, groundY + elevation, z);
    root.rotation.y = rotation;

    // A cabeça aponta para a frente e o tronco fica paralelo à água.
    swimPivot.rotation.x = -1.42 * swimBlend;
    swimPivot.rotation.z = swimBlend * (moving ? Math.sin(time * 5.8) * 0.055 : Math.sin(time * 1.6) * 0.014);

    const stride = Math.sin(time * (speed > 7 ? 16 : 11));
    const walkAmplitude = moving ? 0.60 : 0.035;
    const stroke = Math.sin(time * (moving ? 8.4 : 2.4));
    const swimAmplitude = moving ? 0.66 : 0.12;
    // Braçadas alternadas à frente do corpo; pernas realizam batimentos.
    leftArm.rotation.x = THREE.MathUtils.lerp(stride * walkAmplitude, -2.25 + stroke * swimAmplitude, swimBlend);
    rightArm.rotation.x = THREE.MathUtils.lerp(-stride * walkAmplitude, -2.25 - stroke * swimAmplitude, swimBlend);
    leftArm.rotation.z = swimBlend * 0.17;
    rightArm.rotation.z = -swimBlend * 0.17;
    leftLeg.rotation.x = THREE.MathUtils.lerp(-stride * walkAmplitude, 0.10 + stroke * swimAmplitude * 0.60, swimBlend);
    rightLeg.rotation.x = THREE.MathUtils.lerp(stride * walkAmplitude, 0.10 - stroke * swimAmplitude * 0.60, swimBlend);
    body.position.y = -1.55 + (swimming ? Math.sin(time * 3.4) * 0.035 :
      moving ? Math.abs(Math.cos(time * 10)) * 0.065 : Math.sin(time * 2.2) * 0.025);

    shadow.position.set(x, groundY + 0.045, z);
    shadow.material.opacity = swimming ? 0.045 : 0.20 * (1 - Math.min(Math.max(0, elevation) / 6, 0.82));
    return swimBlend;
  }

  return {
    root, shadow, update,
    getPose: () => swimBlend,
    getMotionState: () => ({
      swimming: swimBlend > 0.75,
      blend: swimBlend,
      tilt: swimPivot.rotation.x,
      leftArm: leftArm.rotation.x,
      rightArm: rightArm.rotation.x,
      leftLeg: leftLeg.rotation.x,
      rightLeg: rightLeg.rotation.x
    })
  };
}
