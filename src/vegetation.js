import * as THREE from 'three';
import { heightAt, distanceToLake, LAKE } from './terrain.js';

// Vegetação original com instanciamento na GPU: milhares de folhas, poucos draw calls.
export function createDetailedNature(scene, colliders) {
  let seed = 7331;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const range=(min,max)=>min+(max-min)*random();
  const dummy = new THREE.Object3D();
  const path = [[-1,6],[3,2],[8,-3],[13,-7],[19,-11],[20.8,-13]];
  function trailDistance(x,z) {
    let shortest=1e9;
    for(let i=0;i<path.length-1;i++) {
      const [ax,az]=path[i], [bx,bz]=path[i+1];
      const vx=bx-ax,vz=bz-az;
      const t=THREE.MathUtils.clamp(((x-ax)*vx+(z-az)*vz)/(vx*vx+vz*vz),0,1);
      const d=Math.hypot(x-ax-t*vx,z-az-t*vz);
      if(d<shortest)shortest=d;
    }
    return shortest;
  }
  function restricted(x,z,margin=1.5) {
    if(distanceToLake(x,z)<LAKE.radius+margin)return true;
    if(Math.hypot(x,z-6)<6.8+margin)return true;
    if(trailDistance(x,z)<1.45+margin)return true;
    if(Math.hypot(x+14,z-15)<4.5+margin)return true;
    if(Math.hypot(x+23,z-21)<4.5+margin)return true;
    if(Math.hypot(x-14,z-22)<4.5+margin)return true;
    return false;
  }

  const grassGeometry = new THREE.PlaneGeometry(0.18,0.85,1,2);
  grassGeometry.translate(0,0.425,0);
  const grassMat = new THREE.MeshLambertMaterial({
    color:'#ffffff',side:THREE.DoubleSide
  });
  const windUniform={value:0};
  grassMat.onBeforeCompile=(shader)=>{
    shader.uniforms.uWindTime=windUniform;
    shader.vertexShader=shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nuniform float uWindTime;'
    ).replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float wind = sin(uWindTime * 1.4 + instanceMatrix[3].x * 0.18 + instanceMatrix[3].z * 0.23 + position.y * 3.0);
       transformed.x += wind * position.y * 0.18;`
    );
  };
  const grassCount = 15800;
  const grass = new THREE.InstancedMesh(grassGeometry,grassMat,grassCount);
  grass.castShadow=false;
  grass.receiveShadow=false;
  grass.frustumCulled=false;
  let done=0;
  const grassPalette=['#3f914e','#56a45c','#6aaf5e','#89b46a','#9cc777','#7aaa67','#43865f'];
  for(let i=0;i<90000&&done<grassCount;i++) {
    const x=range(-74,74),z=range(-74,74);
    if(restricted(x,z,0.4))continue;
    const y=heightAt(x,z);
    const scale=range(0.42,1.18);
    dummy.position.set(x,y+0.014,z);
    dummy.rotation.set(0,range(0,Math.PI*2),0);
    dummy.scale.set(scale,scale,scale);
    dummy.updateMatrix();
    grass.setMatrixAt(done,dummy.matrix);
    grass.setColorAt(done,new THREE.Color(grassPalette[Math.floor(random()*grassPalette.length)]));
    done++;
  }
  grass.count=done;
  grass.instanceMatrix.needsUpdate=true;
  if(grass.instanceColor) grass.instanceColor.needsUpdate=true;
  grass.renderOrder=0;
  scene.add(grass);

  // Copas de árvores mais arredondadas para variar o horizonte.
  const count=115;
  const wood = new THREE.MeshStandardMaterial({color:'#8a644a',roughness:0.97});
  const leaves = new THREE.MeshStandardMaterial({
    color:'#ffffff',roughness:0.8,metalness:0.0,flatShading:true
  });
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17,0.28,2.1,9),wood,count);
  const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.35,1),leaves,count);
  const crownsTop=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.93,1),leaves,count);
  let placed=0;
  const treePalette=['#65b45d','#4a9e6a','#7ebe65','#83c76a','#4a9568','#9cbd64'];
  for(let i=0;i<4000&&placed<count;i++){
    const x=range(-68,68),z=range(-68,68);
    if(restricted(x,z,3.0))continue;
    if(colliders.some(c=>(c.x-x)**2+(c.z-z)**2<5.5**2))continue;
    const y=heightAt(x,z),s=range(0.85,1.65);
    dummy.position.set(x,y+1.12*s,z);
    dummy.scale.set(s,s,s);
    dummy.rotation.set(0,range(0,6.28),0);
    dummy.updateMatrix();
    trunks.setMatrixAt(placed,dummy.matrix);
    dummy.position.set(x,y+3.18*s,z);
    dummy.scale.set(s,s*0.82,s);
    dummy.updateMatrix();
    crowns.setMatrixAt(placed,dummy.matrix);
    const color=new THREE.Color(treePalette[Math.floor(random()*treePalette.length)]);
    crowns.setColorAt(placed,color);
    dummy.position.set(x+0.20*s,y+4.04*s,z-0.08*s);
    dummy.scale.set(s*0.72,s*0.72,s*0.75);
    dummy.updateMatrix();
    crownsTop.setMatrixAt(placed,dummy.matrix);
    crownsTop.setColorAt(placed,color.clone().multiplyScalar(1.14));
    colliders.push({x,z,radius:0.45*s});
    placed++;
  }
  for(const mesh of [trunks,crowns,crownsTop]){
    mesh.count=placed;
    mesh.castShadow=true;
    mesh.receiveShadow=true;
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }

  const flowersCount=820;
  const flowers=new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.15,1),
    new THREE.MeshStandardMaterial({
      color:'#ffffff',roughness:0.82,flatShading:true
    }),flowersCount
  );
  const flowerPalette=['#ffce82','#ffd9f1','#f2fdad','#c4acfc','#ffe8c3'];
  let flowersDone=0;
  for(let i=0;i<5000&&flowersDone<flowersCount;i++){
    const x=range(-65,65),z=range(-65,65);
    if(restricted(x,z,0.4))continue;
    const y=heightAt(x,z);
    const s=range(0.65,1.35);
    dummy.position.set(x,y+0.22*s,z);
    dummy.rotation.set(0,range(0,6.28),0);
    dummy.scale.set(s,s*0.68,s);
    dummy.updateMatrix();
    flowers.setMatrixAt(flowersDone,dummy.matrix);
    flowers.setColorAt(flowersDone,new THREE.Color(flowerPalette[Math.floor(random()*flowerPalette.length)]));
    flowersDone++;
  }
  flowers.count=flowersDone;
  flowers.instanceMatrix.needsUpdate=true;
  if(flowers.instanceColor)flowers.instanceColor.needsUpdate=true;
  flowers.computeBoundingSphere();
  scene.add(flowers);

  return {
    update(elapsed){windUniform.value=elapsed},
    setQuality(level){
      grass.count = level==='equilibrado' ? Math.min(5600,done) :
        level==='alto' ? Math.min(11500,done) : done;
    },
    count:done
  };
}
