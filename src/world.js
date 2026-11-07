import * as THREE from 'three';
import { createUnderwater } from './underwater.js';
import { createCinematicVisuals } from './visuals.js';
import { createDetailedNature } from './vegetation.js';
import {
  WORLD_SIZE, LAKE, LAKE_LEVEL, heightAt, distanceToLake, smoothstep
} from './terrain.js';

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = seededRandom(3372026);
const rand = (min, max) => min + random() * (max - min);
const palette = (arr) => arr[Math.floor(random() * arr.length)];
const colliders = [];

const trailPoints = [
  [-1, 6], [3, 2], [8, -3], [13, -7], [19, -11], [20.8, -13.0]
];
function distanceToSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(px - (ax + t * vx), pz - (az + t * vz));
}
function onTrail(x, z, margin = 2.6) {
  for (let i = 0; i < trailPoints.length - 1; i++) {
    if (distanceToSegment(x, z, ...trailPoints[i], ...trailPoints[i + 1]) < margin) return true;
  }
  return false;
}
function safeForNature(x, z, spacing = 4) {
  return Math.hypot(x, z - 6) > 10 &&
    distanceToLake(x, z) > 20 &&
    !onTrail(x, z, spacing);
}
function addMesh(scene, geometry, material, x, y, z, shadows = false) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  scene.add(mesh);
  return mesh;
}

// Microrrelevo da grama/terra, criado localmente e armazenado na GPU como textura.
function createGroundBumpTexture() {
  const size=256;
  const data=new Uint8Array(size*size*4);
  let seed=7719;
  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const random=(seed/4294967296-0.5);
      const h=0.45+0.16*Math.sin(x*0.147)*Math.cos(y*0.172)
        +0.12*Math.sin(x*0.37+y*0.21)*Math.cos(y*0.44-x*0.12)
        +0.16*random;
      const value=Math.max(0,Math.min(255,Math.round(h*255)));
      const i=(y*size+x)*4;
      data[i]=data[i+1]=data[i+2]=value;
      data[i+3]=255;
    }
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(42,42);
  texture.anisotropy=8;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=true;
  texture.needsUpdate=true;
  return texture;
}

export function createWorld(scene) {
  scene.background = new THREE.Color('#8dcbe6');
  scene.fog = new THREE.FogExp2('#8dcbe6', 0.0038);

  scene.add(new THREE.HemisphereLight('#fafbe9', '#4c7259', 1.16));
  const sunLight = new THREE.DirectionalLight('#fff1d4', 2.55);
  sunLight.position.set(-45, 75, -25);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -75;
  sunLight.shadow.camera.right = 75;
  sunLight.shadow.camera.top = 75;
  sunLight.shadow.camera.bottom = -75;
  sunLight.shadow.camera.near = 0.1;
  sunLight.shadow.camera.far = 220;
  sunLight.shadow.normalBias = 0.022;
  scene.add(sunLight);

  // Relevo procedural, sem arquivos ou texturas externas.
  const terrainGeom = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 258, 258);
  terrainGeom.rotateX(-Math.PI / 2);
  const pos = terrainGeom.attributes.position;
  const colors = [];
  const green = new THREE.Color();
  const sand = new THREE.Color('#cfbd91');
  const lakebed = new THREE.Color('#9fc7b4');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const shade = Math.sin(x * 0.73) * Math.cos(z * 0.61) * 0.5 + 0.5;
    green.setHSL(0.289 + shade * 0.033, 0.33 + shade * 0.13, 0.29 + shade * 0.115);
    const shore = 1 - smoothstep(13, 21, distanceToLake(x, z));
    green.lerp(sand, shore * 0.86);
    green.lerp(lakebed, (1 - smoothstep(LAKE.radius - 1.2, LAKE.radius + 0.3, distanceToLake(x, z))) * 0.83);
    colors.push(green.r, green.g, green.b);
  }
  terrainGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  terrainGeom.computeVertexNormals();
  const ground = addMesh(scene, terrainGeom, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.96, metalness: 0.0,
    bumpMap: createGroundBumpTexture(), bumpScale: 0.09, flatShading: false
  }), 0, 0, 0);
  ground.receiveShadow = true;

  // Água animada e fundo com reflexos e cáusticas proceduralmente simulados.
  const visuals = createCinematicVisuals(scene);
  const underwater = createUnderwater(scene);

  // Trilha baixa que acompanha as ondulações do terreno.
  const curve = new THREE.CatmullRomCurve3(trailPoints.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const pathVertices = [];
  const pathIndices = [];
  const samples = 110;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    const nx = -tangent.z;
    const nz = tangent.x;
    for (const sign of [-1, 1]) {
      const x = p.x + sign * nx * 1.15;
      const z = p.z + sign * nz * 1.15;
      pathVertices.push(x, heightAt(x, z) + 0.07, z);
    }
    if (i < samples) {
      const j = i * 2;
      pathIndices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
    }
  }
  const pathGeo = new THREE.BufferGeometry();
  pathGeo.setAttribute('position', new THREE.Float32BufferAttribute(pathVertices, 3));
  pathGeo.setIndex(pathIndices);
  pathGeo.computeVertexNormals();
  scene.add(new THREE.Mesh(pathGeo, new THREE.MeshStandardMaterial({
    color: '#bea77c', roughness: 1, side: THREE.DoubleSide
  })));

  // Pinheiros instanciados: a mata inteira custa apenas três grupos de desenho.
  const count = 175;
  const trunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.15, 0.2, 1.0, 5),
    new THREE.MeshStandardMaterial({ color: '#66523c', roughness: 1 }),
    count
  );
  const foliageMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff', roughness: 1, flatShading: true
  });
  const foliage1 = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 2.2, 6), foliageMaterial, count);
  const foliage2 = new THREE.InstancedMesh(new THREE.ConeGeometry(0.78, 1.85, 6), foliageMaterial, count);
  const dummy = new THREE.Object3D();
  const foliageColors = ['#306c50', '#48825a', '#477b5b', '#5d9069', '#3c7257'];
  let placedTrees = 0;
  for (let attempts = 0; attempts < 3500 && placedTrees < count; attempts++) {
    const x = rand(-69, 69);
    const z = rand(-69, 69);
    if (!safeForNature(x, z, 3.4)) continue;
    const y = heightAt(x, z);
    const s = rand(0.82, 1.46);
    dummy.position.set(x, y + s * 0.7, z);
    dummy.scale.set(s, 1.4 * s, s);
    dummy.rotation.y = rand(0, Math.PI * 2);
    dummy.updateMatrix();
    trunk.setMatrixAt(placedTrees, dummy.matrix);
    dummy.position.set(x, y + s * 2.2, z);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    foliage1.setMatrixAt(placedTrees, dummy.matrix);
    dummy.position.set(x, y + s * 3.3, z);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    foliage2.setMatrixAt(placedTrees, dummy.matrix);
    const base = new THREE.Color(palette(foliageColors));
    foliage1.setColorAt(placedTrees, base);
    foliage2.setColorAt(placedTrees, base.clone().multiplyScalar(1.13));
    colliders.push({ x, z, radius: 0.42 * s });
    placedTrees++;
  }
  for (const mesh of [trunk, foliage1, foliage2]) {
    mesh.count = placedTrees;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    scene.add(mesh);
  }

  // Pedras arredondadas de baixa resolução.
  const rockCount = 85;
  const rocks = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: '#a0aaa0', roughness: 1, flatShading: true }),
    rockCount
  );
  for (let i = 0; i < rockCount; i++) {
    let x, z;
    do { x = rand(-69, 69); z = rand(-69, 69); }
    while (!safeForNature(x, z, 2.1));
    const s = rand(0.32, 1.18);
    dummy.position.set(x, heightAt(x, z) + s * 0.42, z);
    dummy.scale.set(s * 1.1, s * 0.67, s * 0.88);
    dummy.rotation.set(rand(0, 1), rand(0, Math.PI * 2), rand(0, 1));
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
    rocks.setColorAt(i, new THREE.Color(palette(['#959e95', '#aeb0a3', '#b7b6a1', '#8c9b94'])));
    if (s > 0.8) colliders.push({ x, z, radius: s * 0.72 });
  }
  rocks.instanceMatrix.needsUpdate = true;
  scene.add(rocks);

  // Flores e tufos baixos para dar escala ao espaço.
  const flowerCount = 300;
  const flowers = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.13, 0),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75, flatShading: true }),
    flowerCount
  );
  for (let i = 0; i < flowerCount; i++) {
    const x = rand(-58, 58);
    const z = rand(-58, 58);
    const s = rand(0.7, 1.35);
    dummy.position.set(x, heightAt(x, z) + 0.13 * s, z);
    dummy.scale.setScalar(s);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    flowers.setColorAt(i, new THREE.Color(palette(['#f5e2a2', '#faf7dc', '#e6b1b5', '#d6d1ff'])));
  }
  flowers.instanceMatrix.needsUpdate = true;
  scene.add(flowers);

  // Nuvens geométricas discretas ao redor do horizonte.
  const cloudMaterial = new THREE.MeshBasicMaterial({ color: '#f7fbf8', transparent: true, opacity: 0.76 });
  const cloudGeometry = new THREE.IcosahedronGeometry(1, 1);
  const clouds = [];
  for (let i = 0; i < 11; i++) {
    const group = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const puff = new THREE.Mesh(cloudGeometry, cloudMaterial);
      puff.position.set(j * 2 - 2, rand(-0.35, 0.35), rand(-0.7, 0.7));
      puff.scale.set(rand(2.2, 3.6), rand(0.7, 1.25), rand(1.35, 2));
      group.add(puff);
    }
    group.position.set(rand(-95, 95), rand(24, 37), rand(-95, 95));
    scene.add(group);
    clouds.push({ group, speed: rand(0.012, 0.035) });
  }

  const nature = createDetailedNature(scene, colliders);

  return {
    colliders,
    setUnderwater(value){ visuals.setUnderwater(value); },
    setGraphicsQuality(level){
      nature.setQuality(level);
      const size=level==='equilibrado'?1024:level==='alto'?2048:4096;
      if(sunLight.shadow.mapSize.x!==size){
        sunLight.shadow.mapSize.set(size,size);
        if(sunLight.shadow.map){sunLight.shadow.map.dispose();sunLight.shadow.map=null;}
      }
    },
    update(elapsed, dt = 0.016, camera) {
      underwater.update(dt, elapsed);
      nature.update(elapsed);
      if(camera) visuals.update(elapsed,camera);
      clouds.forEach(({ group, speed }, i) => {
        group.position.x += speed * 0.016;
        if (group.position.x > 110) group.position.x = -110;
        group.position.y += Math.sin(elapsed * 0.2 + i) * 0.0008;
      });
    }
  };
}
