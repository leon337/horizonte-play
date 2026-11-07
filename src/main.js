import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createWorld } from './world.js';
import { createGraphics } from './graphics.js';
import { createAvatar } from './avatar.js';
import { createNPC } from './npc.js';
import { createCommerceExperience } from './commerce-client.js';
import { createGeminiLive } from './npc-live.js';
import { createPlayground } from './playground.js';
import { createBuildingSystem, BLOCK_COLORS } from './building.js';
import { heightAt, insideWorld, distanceToLake, LAKE, LAKE_LEVEL, SWIM_SURFACE_OFFSET, isSwimmingAt, clampSwimFeet, isFullySubmerged } from './terrain.js';
import './style.css';

const viewport = document.querySelector('#viewport');
const errorBox = document.querySelector('#error');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  errorBox.hidden = false;
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const world = createWorld(scene);
const scenery = createPlayground(scene);
world.colliders.push(...scenery.colliders);
const avatar = createAvatar(scene);
const builder = createBuildingSystem(scene, world.colliders);
const npc = createNPC(scene, world.colliders, builder.colliders);
world.colliders.push(npc.collider);
// Ondas ao redor do personagem quando ele está nadando.
const swimmingRipple = new THREE.Mesh(
  new THREE.RingGeometry(0.65, 1.08, 48),
  new THREE.MeshBasicMaterial({ color: '#e7fcff', side: THREE.DoubleSide, transparent: true, opacity: 0.6, depthWrite: false })
);
swimmingRipple.rotation.x = -Math.PI / 2;
swimmingRipple.visible = false;
scene.add(swimmingRipple);

const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 280);
const overviewCameraPosition = new THREE.Vector3(34, 30, 37);
const overviewTarget = new THREE.Vector3(4, 1, -8);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.07;
orbit.minDistance = 9;
orbit.maxDistance = 110;
orbit.maxPolarAngle = Math.PI / 2 - 0.07;
orbit.target.copy(overviewTarget);
camera.position.copy(overviewCameraPosition);
orbit.update();
const graphics = createGraphics(renderer, scene, camera, world, viewport);

const SPAWN = { x: 0, z: 6 };
const player = {
  x: SPAWN.x, z: SPAWN.z, rotation: -0.40, up: 0,
  vY: 0, grounded: true, swimming: false, swimY: null,
  swimVelocityY: 0, waterVX: 0, waterVZ: 0, moving: false, speed: 0
};
let cameraYaw = 0.52;
let cameraPitch = 0.26;
let cameraDistance = 9.5;
let swimCameraOffset = 0;
let mode = 'overview';
let paused = false;
let hasPlayed = false;
let elapsed = 0;
let lastInfoTime = 0;
let selectedColor = 0;
let pointer = null;
let toastTimer = null;
let dialogueOpen = false;
let lastNpcUIUpdate = 0;
const pressed = new Set();
const $ = id => document.querySelector('#' + id);

const menu = $('menu');
const pausePanel = $('pause-panel');
const hud = $('hud');
const viewLabel = $('view-label');
const coords = $('coords');
const mission = $('mission');
const count = $('block-count');
const toast = $('toast');
let liveCaption = null;
const geminiLive = createGeminiLive({
  onState: state => {
    const connect = $('npc-live-connect');
    connect.textContent = state.connected ? '⏹ Desconectar Gemini' : '✨ Conectar Gemini 3.8 Live';
    connect.disabled = /Conectando/.test(state.status);
    $('npc-live-mic').disabled = !state.connected;
    $('npc-live-mic').textContent = state.microphone ? '🔴 Desligar microfone' : '🎤 Microfone';
    $('npc-live-status').textContent = state.status;
    if (state.status === 'Gemini Live conectado') liveCaption = null;
  },
  onText: text => {
    if (!dialogueOpen || !text.trim()) return;
    if (!liveCaption) {
      addNpcMessage('npc', '');
      liveCaption = $('npc-chat-history').lastElementChild.querySelector('span');
    }
    liveCaption.textContent += text;
    const history = $('npc-chat-history');
    history.scrollTop = history.scrollHeight;
  },
  onUserTranscript: text => {
    if (dialogueOpen && text.trim()) addNpcMessage('player', text);
  },
  onError: message => {
    if (dialogueOpen) addNpcMessage('npc', 'Gemini Live: ' + message);
    else notify(message);
  }
});

const commerce = createCommerceExperience({
  scene, world, builder, npc, player, notify,
  canAct: () => mode === 'play' && !paused && !dialogueOpen,
  restoreFocus: () => viewport.focus()
});

function updateUI() {
  menu.hidden = mode !== 'overview';
  pausePanel.hidden = mode !== 'play' || !paused;
  hud.hidden = mode !== 'play';
  $('npc-panel').hidden = mode !== 'play';
  if (dialogueOpen && (mode !== 'play' || paused)) closeNpcChat();
  $('overview-btn').hidden = mode !== 'play';
  $('reset-btn').hidden = mode !== 'play';
  $('build-controls').hidden = mode !== 'play';
  viewLabel.textContent = mode === 'overview' ? 'VISÃO DO MUNDO' : paused ? 'PAUSADO' : 'JOGANDO';
  $('start-btn').textContent = hasPlayed ? 'Voltar ao jogo  ↗' : 'Entrar no mundo  ↗';
  count.textContent = builder.count + ' / ' + builder.limit;
}
function info() {
  coords.textContent = Math.round(player.x) + ', ' + Math.round(player.z);
  const away = Math.max(0, Math.round(distanceToLake(player.x, player.z) - LAKE.radius));
  const underwater = player.swimming && isFullySubmerged(player.swimY);
  mission.textContent = underwater
    ? '🌊 Mergulhando · Espaço sobe, C/Ctrl desce'
    : player.swimming ? '🌊 Nadando · C/Ctrl mergulha'
    : away <= 5 ? 'Você chegou perto do lago!' : 'Explore o lago · ' + away + ' m';
  if (mode === 'play' && !paused) viewLabel.textContent = underwater ? 'SUBMERSO' : player.swimming ? 'NADANDO' : 'JOGANDO';
  const depth = player.swimming ? Math.max(0, LAKE_LEVEL - (player.swimY + 1.7)) : 0;
  $('depth-panel').hidden = !player.swimming;
  $('depth-readout').textContent = depth.toFixed(1) + ' m';
  count.textContent = builder.count + ' / ' + builder.limit;
}
function notify(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2200);
}
function feetY() {
  return player.swimming ? player.swimY : heightAt(player.x, player.z) + player.up;
}
function syncAvatar() {
  const ground = heightAt(player.x, player.z);
  const bob = player.swimming ? Math.sin(elapsed * 3.2) * 0.045 : 0;
  avatar.update(player.x, ground, player.z, player.rotation, feetY() - ground + bob, elapsed, player.moving, player.speed, player.swimming);
}
function followCamera(dt, instant = false) {
  const y = feetY();
  const target = new THREE.Vector3(player.x, y + 1.55, player.z);
  const distance = player.swimming ? Math.min(cameraDistance, 6.3) : cameraDistance;
  const horizontal = distance * Math.cos(cameraPitch);
  // Durante a natação, enquadra o avatar a 3/4 para mostrar o corpo horizontal e as braçadas.
  swimCameraOffset = instant ? (player.swimming ? 0.58 : 0) :
    THREE.MathUtils.damp(swimCameraOffset, player.swimming ? 0.58 : 0, 3.5, dt);
  const viewYaw = cameraYaw + swimCameraOffset;
  const desired = new THREE.Vector3(
    player.x + Math.sin(viewYaw) * horizontal,
    y + 1.55 + Math.sin(cameraPitch) * distance,
    player.z + Math.cos(viewYaw) * horizontal
  );
  if (player.swimming && isFullySubmerged(player.swimY)) {
    // Câmera segue o mergulho e permanece no volume de água.
    const dx = desired.x - LAKE.x, dz = desired.z - LAKE.z;
    const d = Math.hypot(dx, dz);
    if (d > LAKE.radius - 1.2) {
      const k = (LAKE.radius - 1.2) / d;
      desired.x = LAKE.x + dx * k;
      desired.z = LAKE.z + dz * k;
    }
    desired.y = Math.min(desired.y, LAKE_LEVEL - 0.58);
    desired.y = Math.max(desired.y, heightAt(desired.x, desired.z) + 0.45);
  }
  const adjusted = mode === 'play' ? commerce.restrictCamera(target, desired) : 0;
  if (adjusted) cameraYaw += adjusted;
  const blend = instant || adjusted ? 1 : 1 - Math.exp(-dt * 9);
  camera.position.lerp(desired, blend);
  camera.lookAt(target);
}
function startPlaying() {
  mode = 'play';
  paused = false;
  hasPlayed = true;
  pressed.clear();
  pointer = null;
  orbit.enabled = false;
  syncAvatar();
  followCamera(0, true);
  updateUI();
  info();
  notify('Bem-vindo ao Horizonte!');
  viewport.focus();
}
function setOverview() {
  mode = 'overview';
  paused = false;
  pressed.clear();
  pointer = null;
  orbit.enabled = true;
  camera.position.copy(overviewCameraPosition);
  orbit.target.copy(overviewTarget);
  orbit.update();
  updateUI();
}
function resetPlayer() {
  Object.assign(player, {
    x: SPAWN.x, z: SPAWN.z, rotation: -0.40, up: 0,
    vY: 0, grounded: true, swimming: false, swimY: null,
    swimVelocityY: 0, waterVX: 0, waterVZ: 0, moving: false, speed: 0
  });
  cameraYaw = 0.52;
  cameraPitch = 0.26;
  syncAvatar();
  followCamera(0, true);
  info();
  notify('Você voltou ao início');
}
function pauseGame() {
  if (mode !== 'play') return;
  paused = !paused;
  pressed.clear();
  pointer = null;
  updateUI();
}

function canMoveTo(x, z) {
  if (!insideWorld(x, z)) return false;
  for (const item of [...world.colliders, ...builder.colliders]) {
    const radius = (item.radius || 0.4) + 0.43;
    if ((x - item.x) ** 2 + (z - item.z) ** 2 < radius ** 2) return false;
  }
  return true;
}
function movePlayer(dt) {
  if (mode !== 'play' || paused || dialogueOpen || commerce.isModalOpen()) return;
  let lateral = 0, forward = 0;
  if (pressed.has('w') || pressed.has('arrowup')) forward += 1;
  if (pressed.has('s') || pressed.has('arrowdown')) forward -= 1;
  if (pressed.has('a') || pressed.has('arrowleft')) lateral -= 1;
  if (pressed.has('d') || pressed.has('arrowright')) lateral += 1;
  const size = Math.hypot(lateral, forward);
  player.speed = player.swimming ? (pressed.has('shift') ? 5.4 : 3.5) : (pressed.has('shift') ? 10 : 6);
  if (size > 0) { lateral /= size; forward /= size; }
  const dx = lateral * Math.cos(cameraYaw) - forward * Math.sin(cameraYaw);
  const dz = -lateral * Math.sin(cameraYaw) - forward * Math.cos(cameraYaw);
  if (player.swimming) {
    // A água tem resistência: aceleração progressiva, desaceleração suave e inércia.
    player.waterVX = THREE.MathUtils.damp(player.waterVX, dx * player.speed, 4.0, dt);
    player.waterVZ = THREE.MathUtils.damp(player.waterVZ, dz * player.speed, 4.0, dt);
    if (canMoveTo(player.x + player.waterVX * dt, player.z)) player.x += player.waterVX * dt;
    else player.waterVX = 0;
    if (canMoveTo(player.x, player.z + player.waterVZ * dt)) player.z += player.waterVZ * dt;
    else player.waterVZ = 0;
  } else {
    player.waterVX = 0;
    player.waterVZ = 0;
    if (size > 0) {
      if (canMoveTo(player.x + dx * player.speed * dt, player.z)) player.x += dx * player.speed * dt;
      if (canMoveTo(player.x, player.z + dz * player.speed * dt)) player.z += dz * player.speed * dt;
    }
  }
  player.moving = size > 0 || (player.swimming && Math.hypot(player.waterVX, player.waterVZ) > 0.25);
  if (size > 0) {
    const desiredRotation = Math.atan2(-dx, -dz);
    const difference = Math.atan2(Math.sin(desiredRotation - player.rotation), Math.cos(desiredRotation - player.rotation));
    player.rotation += difference * Math.min(1, dt * (player.swimming ? 5.2 : 11));
  }
  const wasSwimming = player.swimming;
  player.swimming = isSwimmingAt(player.x, player.z);
  if (player.swimming !== wasSwimming) {
    player.grounded = true;
    player.up = 0;
    player.vY = 0;
    player.swimVelocityY = 0;
    if (player.swimming) {
      player.swimY = clampSwimFeet(player.x, player.z, LAKE_LEVEL - SWIM_SURFACE_OFFSET);
      notify('🌊 Agora você nada! C/Ctrl mergulha; Espaço sobe.');
    } else {
      // Sai da água sem saltar instantaneamente para o chão.
      const oldHeight = player.swimY;
      player.up = Math.max(0, oldHeight - heightAt(player.x, player.z));
      player.grounded = player.up <= 0.02;
      player.waterVX = 0;
      player.waterVZ = 0;
      player.swimY = null;
      notify('Você saiu da água.');
    }
    info();
  }
  if (player.swimming) {
    const down = pressed.has('c') || pressed.has('control');
    const up = pressed.has(' ');
    // Subir, descer e flutuar: quando solta as teclas, há empuxo suave.
    const velocityTarget = down === up ? 0.14 : (up ? 3.0 : -3.0) * (pressed.has('shift') ? 1.35 : 1);
    player.swimVelocityY = THREE.MathUtils.damp(player.swimVelocityY, velocityTarget, 4.3, dt);
    player.swimY = clampSwimFeet(player.x, player.z, player.swimY + player.swimVelocityY * dt);
    player.grounded = true;
  } else if (!player.grounded) {
    player.up += player.vY * dt;
    player.vY -= 18.5 * dt;
    if (player.up <= 0) {
      player.up = 0;
      player.vY = 0;
      player.grounded = true;
    }
  }
}
function placeBlock() {
  if (mode !== 'play' || paused || dialogueOpen || commerce.isModalOpen()) return;
  const ok = builder.placeInFront(player, player.rotation, selectedColor);
  if (ok) npc.onWorldChanged();
  notify(ok ? 'Bloco colocado!' : 'Não há espaço para construir aqui');
  info();
}
function undoBlock() {
  if (mode !== 'play' || paused || dialogueOpen || commerce.isModalOpen()) return;
  const removed = builder.removeLast();
  if (removed) npc.onWorldChanged();
  notify(removed ? 'Último bloco removido' : 'Nenhum bloco para remover');
  info();
}
function selectColor(value) {
  selectedColor = value;
  document.querySelectorAll('[data-color]').forEach(button => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.color) === value));
  });
  $('color-label').textContent = BLOCK_COLORS[value].label;
}

function refreshNpcUI() {
  const state = npc.getSnapshot(player);
  $('npc-status').textContent = state.phase === 'acting' ?
    state.activity + '...' : state.activity;
  $('npc-food').value = Math.round(state.needs.food);
  $('npc-energy').value = Math.round(state.needs.energy);
  $('npc-social').value = Math.round(state.needs.social);
  $('npc-curiosity').value = Math.round(state.needs.curiosity);
  $('npc-time').textContent = state.time + ' · Vale Verde';
  $('npc-distance').textContent = state.near ? 'Perto de você' : 'Aproxime-se';
  const talkButton = $('npc-talk-btn');
  talkButton.disabled = !state.near || mode !== 'play' || paused || commerce.isModalOpen();
  talkButton.title = state.near ? 'Conversar com Nina (F)' : 'Chegue perto de Nina para conversar';
}
function addNpcMessage(author, content) {
  const item = document.createElement('p');
  item.className = author === 'npc' ? 'npc-message npc-says' : 'npc-message player-says';
  const name = document.createElement('strong');
  name.textContent = author === 'npc' ? 'NINA' : 'VOCÊ';
  const body = document.createElement('span');
  body.textContent = String(content).slice(0, 500);
  item.append(name, body);
  const history = $('npc-chat-history');
  history.appendChild(item);
  while (history.childElementCount > 24) history.firstElementChild.remove();
  history.scrollTop = history.scrollHeight;
}
function openNpcChat() {
  if (dialogueOpen || commerce.isModalOpen() || mode !== 'play' || paused) return;
  if (!npc.startConversation(player)) {
    notify('Chegue perto de Nina para conversar.');
    return;
  }
  dialogueOpen = true;
  pressed.clear();
  $('npc-chat-history').replaceChildren();
  $('npc-chat').hidden = false;
  const memory = npc.getSnapshot(player).rememberedName;
  addNpcMessage('npc', memory ?
    'Que bom te ver de novo, ' + memory + '! Como posso ajudar?' :
    'Oi! Eu sou a Nina. Você pode perguntar sobre minhas atividades ou me pedir para seguir você.');
  $('npc-chat-input').value = '';
  $('npc-chat-input').focus();
}
function closeNpcChat() {
  if (!dialogueOpen) return;
  geminiLive.disconnect();
  liveCaption = null;
  dialogueOpen = false;
  npc.endConversation();
  $('npc-chat').hidden = true;
  pressed.clear();
  if (mode === 'play' && !paused) viewport.focus();
}
$('npc-talk-btn').addEventListener('click', openNpcChat);
$('npc-chat-close').addEventListener('click', closeNpcChat);
$('npc-live-connect').addEventListener('click', async () => {
  if (!dialogueOpen) return;
  if (geminiLive.isConnected()) {
    geminiLive.disconnect();
    addNpcMessage('npc', 'Voltamos ao modo local, sem API.');
    return;
  }
  const state = npc.getSnapshot(player);
  const connected = await geminiLive.connect({
    playerName: state.rememberedName,
    activity: state.activity
  });
  if (connected && dialogueOpen) {
    addNpcMessage('npc', 'Gemini 3.8 Live conectado. Pode escrever ou ligar o microfone.');
  }
});
$('npc-live-mic').addEventListener('click', async () => {
  if (dialogueOpen) await geminiLive.toggleMicrophone();
});
$('npc-chat-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!dialogueOpen) return;
  const input = $('npc-chat-input');
  const message = input.value.trim().slice(0, 140);
  if (!message) return;
  addNpcMessage('player', message);
  if (geminiLive.isConnected()) {
    npc.say(message, player); // Atualiza a memória e os comandos seguros do mundo.
    liveCaption = null;
    if (!geminiLive.sendText(message)) {
      addNpcMessage('npc', 'Não foi possível enviar ao Gemini. Desconecte para conversar localmente.');
    }
  } else {
    addNpcMessage('npc', npc.say(message, player));
  }
  input.value = '';
  refreshNpcUI();
  input.focus();
});

$('start-btn').addEventListener('click', startPlaying);
$('resume-btn').addEventListener('click', () => {
  paused = false;
  updateUI();
  viewport.focus();
});
$('overview-btn').addEventListener('click', setOverview);
$('pause-overview-btn').addEventListener('click', setOverview);
$('reset-btn').addEventListener('click', resetPlayer);
$('build-btn').addEventListener('click', placeBlock);
$('undo-btn').addEventListener('click', undoBlock);
document.querySelectorAll('[data-color]').forEach(button => {
  button.addEventListener('click', () => selectColor(Number(button.dataset.color)));
});
selectColor(0);

document.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (dialogueOpen) {
    if (key === 'escape') {
      event.preventDefault();
      closeNpcChat();
    }
    return;
  }
  if (commerce.isModalOpen()) {
    if (key === 'escape') {
      event.preventDefault();
      commerce.close();
    }
    return;
  }
  // Não interpretar digitação de nome ou campos como comandos do avatar.
  if (event.target?.closest?.('input,textarea,select')) return;
  if (commerce.onKey(key)) {
    event.preventDefault();
    return;
  }
  if (key === 'f' && mode === 'play' && !paused) {
    event.preventDefault();
    openNpcChat();
    return;
  }
  if (mode === 'play' && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'control'].includes(key)) {
    event.preventDefault();
  }
  if (key === 'escape') {
    if (!event.repeat) pauseGame();
    return;
  }
  if (key === 'v' && mode === 'play') {
    setOverview();
    return;
  }
  if (key === 'r' && mode === 'play') {
    resetPlayer();
    return;
  }
  if (mode !== 'play' || paused) return;
  pressed.add(key);
  if (event.repeat) return;
  if (key === ' ' && player.grounded && !player.swimming) {
    player.grounded = false;
    player.vY = 7.2;
  }
  if (key === 'e') placeBlock();
  if (key === 'q') undoBlock();
  if (['1', '2', '3'].includes(key)) selectColor(Number(key) - 1);
});
document.addEventListener('keyup', event => pressed.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => pressed.clear());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pressed.clear();
});
renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());
renderer.domElement.addEventListener('pointerdown', event => {
  if (mode !== 'play' || paused || event.button > 2) return;
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener('pointermove', event => {
  if (mode !== 'play' || paused || !pointer || pointer.id !== event.pointerId) return;
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  cameraYaw -= dx * 0.0065;
  cameraPitch = THREE.MathUtils.clamp(cameraPitch + dy * 0.0045, -0.08, 1.04);
});
renderer.domElement.addEventListener('pointerup', () => { pointer = null; });
renderer.domElement.addEventListener('pointercancel', () => { pointer = null; });
renderer.domElement.addEventListener('wheel', event => {
  if (mode !== 'play') return;
  event.preventDefault();
  cameraDistance = THREE.MathUtils.clamp(cameraDistance + Math.sign(event.deltaY) * 0.9, 4.8, 17);
}, { passive: false });

// Diagnóstico de desenvolvimento: somente leitura, não altera o estado do jogo.
if (import.meta.env.DEV) {
  window.__horizonteNPC = () => npc.getSnapshot(player);
  window.__horizonteCommerce = () => commerce.getSnapshot();
  window.__horizonteMotion = () => ({
    swimming: player.swimming,
    playerPosition: { x: player.x, z: player.z },
    cameraYaw,
    currentFeetY: feetY(),
    depth: player.swimming ? LAKE_LEVEL - (player.swimY + 1.55) : 0,
    motion: avatar.getMotionState()
  });
}
// A escala de renderização e o resize são administrados pelo módulo gráfico.
updateUI();
info();
syncAvatar();

const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  world.update(elapsed, dt, camera);
  npc.update(dt, elapsed, player,
    dialogueOpen || commerce.isModalOpen() || (mode === 'play' && paused));
  commerce.update(elapsed, mode === 'play');
  if (elapsed - lastNpcUIUpdate > 0.22) {
    lastNpcUIUpdate = elapsed;
    refreshNpcUI();
  }
  if (mode === 'overview') orbit.update();
  else {
    movePlayer(dt);
    syncAvatar();
    followCamera(dt);
    if (elapsed - lastInfoTime > 0.15) {
      lastInfoTime = elapsed;
      info();
    }
  }
  const underwater = mode === 'play' && player.swimming && camera.position.y < LAKE_LEVEL - 0.23 &&
    distanceToLake(camera.position.x, camera.position.z) < LAKE.radius - 0.4;
  $('app').classList.toggle('is-underwater', underwater);
  world.setUnderwater(underwater);
  scene.background.set(underwater ? '#125b75' : '#8dcbe6');
  scene.fog.color.set(underwater ? '#1d7891' : '#8dcbe6');
  scene.fog.density += ((underwater ? 0.050 : 0.0038) - scene.fog.density) * Math.min(1, dt * 8);
  renderer.toneMappingExposure += ((underwater ? 0.88 : 1.05) - renderer.toneMappingExposure) * Math.min(1, dt * 8);
  swimmingRipple.visible = mode === 'play' && player.swimming && !isFullySubmerged(player.swimY);
  if (swimmingRipple.visible) {
    swimmingRipple.position.set(player.x, LAKE_LEVEL + 0.034, player.z);
    swimmingRipple.scale.setScalar(1 + 0.16 * Math.sin(elapsed * 3.6));
  }
  graphics.render(dt, mode === 'play' && !paused);
}
renderer.setAnimationLoop(animate);
