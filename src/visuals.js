import * as THREE from 'three';
import { LAKE, LAKE_LEVEL, heightAt } from './terrain.js';

// Atmosfera, sol e água animados por shaders, sem texturas externas.
export function createCinematicVisuals(scene) {
  const sunDirection = new THREE.Vector3(-0.49, 0.80, -0.35).normalize();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(230, 64, 36),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTime: { value: 0 },
        uSun: { value: sunDirection }
      },
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vDirection;
        uniform vec3 uSun;
        uniform float uTime;
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),
                     mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
        }
        float fbm(vec2 p) {
          float s=0.0, a=0.53;
          for(int i=0;i<4;i++) {s+=noise(p)*a;p=p*2.02+8.39;a*=0.49;}
          return s;
        }
        void main() {
          vec3 d = normalize(vDirection);
          float h = smoothstep(-0.16, 0.87, d.y);
          vec3 horizon = vec3(0.14, 0.53, 0.88);
          vec3 zenith = vec3(0.02, 0.12, 0.47);
          vec3 sky = mix(horizon, zenith, pow(h, 0.82));
          float sunAmount = max(dot(d, uSun), 0.0);
          float sunDisc = smoothstep(0.9985, 0.99977, sunAmount);
          float glow = pow(sunAmount, 36.0);
          sky += vec3(1.0, 0.67, 0.31) * glow * 0.35;
          sky = mix(sky, vec3(1.0, 0.96, 0.75), sunDisc * 0.97);
          vec2 cloudUv = d.xz / max(0.15, d.y + 0.54);
          float cloud = fbm(cloudUv*3.1+vec2(uTime*0.0025,0.0));
          cloud = smoothstep(0.48, 0.72, cloud);
          cloud *= smoothstep(0.04,0.24,d.y) * (1.0-smoothstep(0.69,0.90,d.y));
          sky = mix(sky, vec3(1.0,0.995,0.97), cloud*0.63);
          gl_FragColor = vec4(sky,1.0);
        }
      `
    })
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  const lakeRadius = LAKE.radius;
  const waterMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector2(LAKE.x, LAKE.z) },
      uRadius: { value: lakeRadius },
      uSun: { value: sunDirection },
      uUnderwater: { value: 0 },
      uEye: { value: new THREE.Vector3() }
    },
    vertexShader: `
      uniform float uTime;
      uniform float uRadius;
      varying vec3 vPosition;
      varying vec2 vLake;
      void main() {
        vec3 p = position;
        vLake = p.xz;
        float edge = 1.0-smoothstep(uRadius-2.6,uRadius,length(vLake));
        float wave = sin(p.x*1.35+uTime*0.85)*cos(p.z*1.28-uTime*0.65)*0.07
                   + sin(p.x*2.4+p.z*1.6+uTime*1.35)*0.022;
        p.y += wave*edge;
        vec4 world = modelMatrix*vec4(p,1.0);
        vPosition = world.xyz;
        gl_Position=projectionMatrix*viewMatrix*world;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform float uTime;
      uniform vec2 uCenter;
      uniform float uRadius;
      uniform vec3 uEye;
      uniform vec3 uSun;
      uniform float uUnderwater;
      varying vec3 vPosition;
      varying vec2 vLake;
      float wave(vec2 p) {
        return sin(p.x*1.35+uTime*0.85)*cos(p.y*1.28-uTime*0.65)*0.07+
               sin(p.x*2.4+p.y*1.6+uTime*1.35)*0.022;
      }
      void main() {
        float r=length(vLake);
        if(r>uRadius) discard;
        vec2 p=vLake;
        vec2 grad = vec2(
          wave(p+vec2(0.07,0.0))-wave(p-vec2(0.07,0.0)),
          wave(p+vec2(0.0,0.07))-wave(p-vec2(0.0,0.07))
        ) / 0.14;
        vec3 normal = normalize(vec3(-grad.x,1.0,-grad.y));
        vec3 viewDir=normalize(uEye-vPosition);
        float fresnel=pow(1.0-clamp(abs(dot(normal,viewDir)),0.0,1.0),3.0);
        float depth = 1.0-smoothstep(1.5,uRadius-1.0,r);
        vec3 shallow = vec3(0.085,0.44,0.60);
        vec3 deep = vec3(0.01,0.14,0.34);
        vec3 col=mix(shallow,deep,depth*0.82);
        float patterns=sin(p.x*2.8+uTime*0.95)*sin(p.y*3.8-uTime*0.77);
        float ripples=0.5+0.5*patterns;
        col += vec3(0.10,0.25,0.20)*ripples*0.18;
        col=mix(col,vec3(0.77,0.93,0.97),fresnel*0.62);
        vec3 reflectDir=reflect(-uSun,normal);
        float sparkle=pow(max(dot(reflectDir,viewDir),0.0),90.0);
        col += vec3(1.0,0.94,0.76)*sparkle*0.62;
        float shore = smoothstep(uRadius-1.65,uRadius-0.12,r);
        float foam=shore*(0.30+0.23*sin(r*9.0+p.x*2.0+uTime*1.7));
        col=mix(col,vec3(0.86,1.0,0.97),clamp(foam,0.0,0.6));
        float alpha=mix(0.83,0.92,fresnel);
        alpha=mix(alpha,0.26,uUnderwater);
        gl_FragColor=vec4(col,alpha);
      }
    `
  });
  const waterGeometry = new THREE.PlaneGeometry(2*lakeRadius,2*lakeRadius,142,142);
  waterGeometry.rotateX(-Math.PI/2);
  const water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.position.set(LAKE.x,LAKE_LEVEL,LAKE.z);
  water.renderOrder=4;
  scene.add(water);

  const causticGeometry = new THREE.PlaneGeometry(lakeRadius*2, lakeRadius*2, 120, 120);
  causticGeometry.rotateX(-Math.PI/2);
  const pos=causticGeometry.attributes.position;
  for(let i=0;i<pos.count;i++) {
    const x=pos.getX(i), z=pos.getZ(i);
    pos.setY(i, heightAt(LAKE.x+x, LAKE.z+z) - LAKE_LEVEL + 0.055);
  }
  pos.needsUpdate=true;
  causticGeometry.computeVertexNormals();
  const caustics = new THREE.Mesh(causticGeometry,new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,
    uniforms:{uTime:{value:0},uRadius:{value:lakeRadius}},
    vertexShader:`
      varying vec2 vPoint;
      varying float vLevel;
      void main(){
        vPoint=position.xz;
        vLevel=position.y;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      }
    `,
    fragmentShader:`
      precision highp float;
      varying vec2 vPoint;
      varying float vLevel;
      uniform float uTime;
      uniform float uRadius;
      void main(){
        float radius=length(vPoint);
        if(radius>uRadius-0.3) discard;
        vec2 p=vPoint*1.7;
        float a=sin(p.x*1.5+sin(p.y*.78+uTime*.68))*sin(p.y*1.52+cos(p.x*.81-uTime*.6));
        float b=sin(p.x*2.5-p.y*.6+uTime*.53);
        float caustic=pow(smoothstep(0.48,0.97,a*0.6+b*0.28+0.4),2.3);
        float edge=1.0-smoothstep(uRadius-2.0,uRadius,radius);
        gl_FragColor=vec4(vec3(0.47,0.98,0.87),caustic*0.25*edge);
      }
    `
  }));
  caustics.position.set(LAKE.x, LAKE_LEVEL, LAKE.z);
  caustics.renderOrder=1;
  scene.add(caustics);

  return {
    sky, water,
    update(elapsed,camera) {
      sky.position.copy(camera.position);
      sky.material.uniforms.uTime.value=elapsed;
      waterMaterial.uniforms.uTime.value=elapsed;
      waterMaterial.uniforms.uEye.value.copy(camera.position);
      caustics.material.uniforms.uTime.value=elapsed;
    },
    setUnderwater(value) {
      sky.visible=!value;
      waterMaterial.uniforms.uUnderwater.value=value?1:0;
    }
  };
}
