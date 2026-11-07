import * as THREE from 'three';
import { LAKE, LAKE_LEVEL, heightAt, waterDepthAt } from './terrain.js';

// Elementos originais e leves: vegetação submersa, pedras e bolhas.
export function createUnderwater(scene) {
  let seed = 9137;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const between = (lo, hi) => lo + random() * (hi - lo);
  const dummy = new THREE.Object3D();

  const plantCount = 76;
  const kelp = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.24, 1.7, 5),
    new THREE.MeshStandardMaterial({
      color: '#d1ecd5', roughness: 0.95, flatShading: true,
      side: THREE.DoubleSide
    }),
    plantCount
  );
  for (let i = 0; i < plantCount; i++) {
    let x, z, depth;
    do {
      const radius = Math.sqrt(random()) * 11.9;
      const angle = random() * Math.PI * 2;
      x = LAKE.x + Math.cos(angle) * radius;
      z = LAKE.z + Math.sin(angle) * radius;
      depth = waterDepthAt(x, z);
    } while (depth < 1.8);
    const size = between(0.55, 1.65);
    dummy.position.set(x, heightAt(x, z) + 0.8 * size, z);
    dummy.scale.set(size, size, size);
    dummy.rotation.set(0, between(-Math.PI, Math.PI), 0);
    dummy.updateMatrix();
    kelp.setMatrixAt(i, dummy.matrix);
    kelp.setColorAt(i, new THREE.Color(['#428e80', '#60b6a0', '#9bbf85', '#368d93'][i % 4]));
  }
  kelp.instanceMatrix.needsUpdate = true;
  kelp.computeBoundingSphere();
  scene.add(kelp);

  const coralCount = 35;
  const coral = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.6, 0),
    new THREE.MeshStandardMaterial({ color: '#fff8e3', roughness: 0.9, flatShading: true }),
    coralCount
  );
  for (let i = 0; i < coralCount; i++) {
    const theta = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * 10.4;
    const x = LAKE.x + r * Math.cos(theta);
    const z = LAKE.z + r * Math.sin(theta);
    const scale = between(0.5, 1.2);
    dummy.position.set(x, heightAt(x, z) + 0.33 * scale, z);
    dummy.scale.set(scale, scale * 0.7, scale);
    dummy.rotation.set(random() * 0.4, random() * 6, random() * 0.4);
    dummy.updateMatrix();
    coral.setMatrixAt(i, dummy.matrix);
    coral.setColorAt(i, new THREE.Color(['#ff9e91', '#ffd3a5', '#ab9de7', '#eea9c2'][i % 4]));
  }
  coral.instanceMatrix.needsUpdate = true;
  coral.computeBoundingSphere();
  scene.add(coral);

  const bubbleCount = 58;
  const bubbles = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.09, 7, 5),
    new THREE.MeshBasicMaterial({
      color: '#eafffc', transparent: true, opacity: 0.65,
      depthWrite: false
    }),
    bubbleCount
  );
  bubbles.frustumCulled = false;
  const items = [];
  for (let i = 0; i < bubbleCount; i++) {
    const angle = between(0, Math.PI * 2);
    const radius = Math.sqrt(random()) * 11.5;
    const x = LAKE.x + Math.cos(angle) * radius;
    const z = LAKE.z + Math.sin(angle) * radius;
    const floor = heightAt(x, z);
    const top = LAKE_LEVEL - 0.12;
    items.push({
      x, z, floor, top,
      y: between(floor + 0.1, Math.max(floor + 0.2, top)),
      size: between(0.55, 1.7),
      speed: between(0.18, 0.78),
      phase: between(0, 7)
    });
  }
  scene.add(bubbles);

  // Peixes geométricos com cardumes e animações suaves.
  const fishCount=44;
  const fishBody=new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.55,1),
    new THREE.MeshStandardMaterial({color:'#ffffff',roughness:0.48,metalness:0.12,flatShading:true}),
    fishCount
  );
  fishBody.frustumCulled=false;
  const tailGeometry=new THREE.BufferGeometry();
  tailGeometry.setAttribute('position',new THREE.Float32BufferAttribute([
    0,0,0.35, 0,0.32,0.98, 0,-0.32,0.98
  ],3));
  tailGeometry.computeVertexNormals();
  const tails=new THREE.InstancedMesh(
    tailGeometry,
    new THREE.MeshStandardMaterial({color:'#a9e1db',roughness:0.62,side:THREE.DoubleSide}),
    fishCount
  );
  tails.frustumCulled=false;
  const fish=[];
  const fishColors=['#f8b785','#f7dea6','#94d0d7','#d2a5cd','#8fc9be'];
  for(let i=0;i<fishCount;i++) {
    fish.push({
      angle:random()*Math.PI*2,
      radius:between(1.1,9.1),
      depth:between(2.8,5.2),
      speed:between(0.10,0.29)*(i%2?1:-1),
      size:between(0.48,0.91),
      phase:between(0,6.28)
    });
    fishBody.setColorAt(i,new THREE.Color(fishColors[i%fishColors.length]));
  }
  if(fishBody.instanceColor)fishBody.instanceColor.needsUpdate=true;
  scene.add(fishBody,tails);

  function update(dt, elapsed) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      item.y += item.speed * dt;
      if (item.y > item.top) item.y = item.floor + 0.13;
      dummy.position.set(
        item.x + Math.sin(elapsed * 1.3 + item.phase) * 0.14,
        item.y,
        item.z + Math.cos(elapsed * 1.1 + item.phase) * 0.14
      );
      dummy.scale.setScalar(item.size);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      bubbles.setMatrixAt(i, dummy.matrix);
    }
    bubbles.instanceMatrix.needsUpdate = true;
    for(let i=0;i<fish.length;i++){
      const item=fish[i];
      const angle=item.angle+elapsed*item.speed;
      const radius=item.radius+Math.sin(elapsed*0.4+item.phase)*0.55;
      const x=LAKE.x+Math.cos(angle)*radius;
      const z=LAKE.z+Math.sin(angle)*radius;
      const floor=heightAt(x,z);
      const y=Math.max(floor+0.52,LAKE_LEVEL-item.depth+Math.sin(elapsed*1.2+item.phase)*0.23);
      const facing=Math.atan2(-Math.cos(angle)*item.speed,Math.sin(angle)*item.speed);
      dummy.position.set(x,y,z);
      dummy.rotation.set(0,facing,0);
      dummy.scale.set(item.size*0.66,item.size*0.46,item.size*1.1);
      dummy.updateMatrix();
      fishBody.setMatrixAt(i,dummy.matrix);
      dummy.scale.set(item.size,item.size,item.size);
      dummy.rotation.y=facing+Math.sin(elapsed*5+item.phase)*0.08;
      dummy.updateMatrix();
      tails.setMatrixAt(i,dummy.matrix);
    }
    fishBody.instanceMatrix.needsUpdate=true;
    tails.instanceMatrix.needsUpdate=true;
  }

  return { update };
}
