import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

// Compatível com RX 580 4 GB: nenhuma opção tenta consumir VRAM sem limite.
const PRESETS = Object.freeze({
  equilibrado: { label: 'Equilibrado', scale: 0.86, bloom: false },
  alto: { label: 'Alto', scale: 1, bloom: false },
  ultra: { label: 'Ultra', scale: 1.4, bloom: true }
});
export { PRESETS };

export function createGraphics(renderer,scene,camera,world,viewport,onUpdate) {
  const renderPass = new RenderPass(scene,camera);
  const composer = new EffectComposer(renderer);
  composer.addPass(renderPass);

  const fxaa = new ShaderPass(FXAAShader);
  composer.addPass(fxaa);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1280,720),0.11,0.22,1.10);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let quality='ultra';
  let width=1, height=1,ratio=1;
  let frameCount=0,lastFrame=performance.now();
  let lastFps=0;
  let automaticReduction=false;
  let poorSeconds=0;

  const qualitySelect=document.querySelector('#graphics-quality');
  const performanceLabel=document.querySelector('#graphics-fps');
  const status=document.querySelector('#graphics-status');
  function applyDimensions() {
    width=Math.max(1,viewport.clientWidth);
    height=Math.max(1,viewport.clientHeight);
    // A escala é limitada em resoluções maiores para proteger os 4 GB de VRAM.
    const maxScaledPixels=4_050_000;
    const baseDpr=Math.min(window.devicePixelRatio||1,1.5);
    ratio=Math.min(Math.max(baseDpr,PRESETS[quality].scale),Math.sqrt(maxScaledPixels/(width*height)));
    ratio=Math.max(0.7,ratio);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width,height,false);
    composer.setPixelRatio(ratio);
    composer.setSize(width,height);
    fxaa.material.uniforms.resolution.value.set(1/(width*ratio),1/(height*ratio));
    camera.aspect=width/height;
    camera.updateProjectionMatrix();
    if(typeof onUpdate==='function')onUpdate(quality);
    status.textContent=PRESETS[quality].label+' · '+Math.round(width*ratio)+'×'+Math.round(height*ratio);
  }

  function setQuality(value,manual=true) {
    if(!Object.hasOwn(PRESETS,value))return;
    quality=value;
    if(manual){automaticReduction=false;poorSeconds=0;}
    qualitySelect.value=value;
    bloom.enabled=PRESETS[value].bloom;
    fxaa.enabled=PRESETS[value].bloom;
    world.setGraphicsQuality(value);
    applyDimensions();
  }

  qualitySelect.addEventListener('change',e=>setQuality(e.target.value));
  window.addEventListener('resize',applyDimensions);

  function render(dt, playing) {
    if(bloom.enabled)composer.render(dt);
    else renderer.render(scene,camera);
    frameCount++;
    const now=performance.now();
    const elapsed=(now-lastFrame)/1000;
    if(elapsed>=1){
      lastFps=Math.round(frameCount/elapsed);
      performanceLabel.textContent=lastFps+' FPS';
      if(playing&&quality==='ultra') {
        poorSeconds=lastFps<23?poorSeconds+elapsed:Math.max(0,poorSeconds-elapsed*2);
        if(poorSeconds>=10&&!automaticReduction){
          automaticReduction=true;
          setQuality('alto',false);
          status.textContent='Alto automático · FPS baixo';
        }
      }
      frameCount=0;
      lastFrame=now;
    }
  }

  setQuality('ultra',false);
  return { render, resize:applyDimensions, setQuality, getQuality:()=>quality };
}
