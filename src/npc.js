import { createNPCCharacter } from './npc-character.js';
import { heightAt } from './terrain.js';
import { findNpcPath, npcPassable } from './npc-navigation.js';
import {
  NPC_NAME, NPC_MEMORY_KEY, NPC_GOALS,
  initialMind, updateMind, getTarget, npcReply, memorySnapshot, clockLabel
} from './npc-brain.js';

function loadMemory() {
  try {
    return JSON.parse(localStorage.getItem(NPC_MEMORY_KEY) || 'null');
  } catch { return null; }
}
function saveMemory(mind) {
  try {
    localStorage.setItem(NPC_MEMORY_KEY, JSON.stringify(memorySnapshot(mind)));
  } catch { /* O NPC continua funcionando sem armazenamento. */ }
}

export function createNPC(scene, baseColliders, dynamicColliders) {
  const mind = initialMind(loadMemory());
  const character = createNPCCharacter(scene);
  const position = { x: 6.4, z: 9.2 };
  const collider = { x: position.x, z: position.z, radius: 0.58 };
  let heading = -0.5;
  let path = [];
  let pathEnd = null;
  let planGoal = null;
  let planTarget = null;
  let planCooldown = 0;
  let walking = false;
  let elapsed = 0;
  let blockedFor = 0;
  let currentPlayer = { x: 0, z: 6 };
  const speed = 2.45;

  function obstacles() {
    return [...baseColliders.filter(item => item !== collider), ...dynamicColliders];
  }
  function replan(target, goal) {
    const route = findNpcPath(position, target, obstacles());
    path = route;
    pathEnd = route.length ? route[route.length - 1] : null;
    planGoal = goal;
    planTarget = { ...target };
    planCooldown = goal === 'follow' || goal === 'socialize' ? 1.6 : 6;
  }
  function walk(dt) {
    if (!path.length) { walking = false; return; }
    let next = path[0];
    let dx = next.x - position.x;
    let dz = next.z - position.z;
    let distance = Math.hypot(dx, dz);
    if (distance < 0.36) {
      path.shift();
      if (!path.length) { walking = false; return; }
      next = path[0];
      dx = next.x - position.x;
      dz = next.z - position.z;
      distance = Math.hypot(dx, dz);
    }
    if (distance < 0.001) { walking = false; return; }
    const vx = dx / distance;
    const vz = dz / distance;
    const step = Math.min(distance, dt * speed);
    const blockers = obstacles();
    const nx = position.x + vx * step;
    const nz = position.z + vz * step;
    if (npcPassable(nx, nz, blockers)) {
      position.x = nx;
      position.z = nz;
      collider.x = nx;
      collider.z = nz;
      walking = true;
      blockedFor = 0;
    } else {
      walking = false;
      blockedFor += dt;
      if (blockedFor > 0.45) {
        planCooldown = 0;
        blockedFor = 0;
      }
    }
    const angle = Math.atan2(-vx, -vz);
    const diff = Math.atan2(Math.sin(angle - heading), Math.cos(angle - heading));
    heading += diff * Math.min(1, dt * 7);
  }
  function update(dt, time, player, stopped = false) {
    elapsed = time;
    currentPlayer = { x: player.x, z: player.z };
    const nearPlayer = Math.hypot(player.x - position.x, player.z - position.z) <= 3.9;
    if (!stopped && !mind.conversationOpen) {
      const oldGoal = mind.goal;
      const destination = getTarget(mind, player);
      const dist = Math.hypot(destination.x - position.x, destination.z - position.z);
      const endpointReached = pathEnd &&
        Math.hypot(pathEnd.x - position.x, pathEnd.z - position.z) < 1.15;
      const arrive = mind.goal === 'follow' ? dist < 2.8 :
        dist < 1.4 || Boolean(endpointReached);
      updateMind(mind, dt, arrive);
      const target = getTarget(mind, player);
      const targetMoved = !planTarget ||
        Math.hypot(planTarget.x - target.x, planTarget.z - target.z) > 2.6;
      planCooldown -= dt;
      if (mind.goal !== oldGoal) {
        path = []; pathEnd = null; planCooldown = 0;
      }
      if (mind.phase === 'acting') {
        walking = false;
        path = [];
      } else if (mind.goal === 'follow' && nearPlayer) {
        walking = false;
        path = [];
      } else {
        if (planCooldown <= 0 || planGoal !== mind.goal || targetMoved) {
          replan(target, mind.goal);
        }
        walk(dt);
      }
    } else {
      walking = false;
    }

    if (mind.conversationOpen) {
      const facePlayer = Math.atan2(
        -(player.x - position.x), -(player.z - position.z)
      );
      const difference = Math.atan2(Math.sin(facePlayer - heading),
        Math.cos(facePlayer - heading));
      heading += difference * Math.min(1, dt * 6);
    }
    character.update({
      x: position.x, y: heightAt(position.x, position.z), z: position.z,
      heading, walking, time,
      action: mind.conversationOpen ? 'talk' :
        mind.phase === 'acting' ? mind.goal : 'idle',
      nearPlayer
    });
    return getSnapshot(player);
  }
  function closeTo(player) {
    return Math.hypot(position.x - player.x, position.z - player.z) <= 3.9;
  }
  function startConversation(player) {
    if (!closeTo(player)) return false;
    mind.conversationOpen = true;
    walking = false;
    return true;
  }
  function endConversation() {
    mind.conversationOpen = false;
    planCooldown = 0;
  }
  function say(text, player) {
    if (!mind.conversationOpen || !closeTo(player)) {
      return 'Aproxime-se para conversar comigo.';
    }
    const message = npcReply(mind, text, { player });
    saveMemory(mind);
    planCooldown = 0;
    return message;
  }
  function getSnapshot(player = currentPlayer) {
    return {
      name: NPC_NAME,
      x: position.x, z: position.z,
      activity: NPC_GOALS[mind.goal],
      phase: mind.phase,
      time: clockLabel(mind.clockMinutes),
      needs: { ...mind.needs },
      follow: mind.follow,
      near: closeTo(player),
      conversations: mind.memory.conversations,
      rememberedName: mind.memory.playerName,
      completed: mind.completed,
      walking
    };
  }
  function onWorldChanged() { planCooldown = 0; }
  character.update({
    x: position.x, y: heightAt(position.x, position.z), z: position.z,
    heading, walking: false, time: 0, action: 'idle', nearPlayer: false
  });
  return {
    collider, update, closeTo, startConversation, endConversation,
    say, getSnapshot, onWorldChanged
  };
}
