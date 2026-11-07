import { WORLD_LIMIT, insideWorld, LAKE, distanceToLake } from './terrain.js';

const CELL = 2.5;
const MAX_AXIS = Math.floor(WORLD_LIMIT / CELL);
const NEIGHBORS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [-1, 1], [1, -1], [-1, -1]
];

export function npcPassable(x, z, obstacles = [], clearance = 0.62) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || !insideWorld(x, z)) return false;
  // O primeiro morador é terrestre. O jogador pode nadar, mas o NPC não atravessa o lago.
  if (distanceToLake(x, z) < LAKE.radius + 1.15 + clearance) return false;
  return !obstacles.some(item => {
    if (!Number.isFinite(item.x) || !Number.isFinite(item.z)) return false;
    const r = (Number.isFinite(item.radius) ? item.radius : 0.5) + clearance;
    return (item.x - x) ** 2 + (item.z - z) ** 2 < r ** 2;
  });
}
export function npcSegmentFree(from, to, obstacles = []) {
  const len = Math.hypot(to.x - from.x, to.z - from.z);
  if (!Number.isFinite(len)) return false;
  const steps = Math.max(1, Math.ceil(len / 0.65));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!npcPassable(from.x + (to.x - from.x) * t,
      from.z + (to.z - from.z) * t, obstacles)) return false;
  }
  return true;
}
function gridPos(ix, iz) { return { x: ix * CELL, z: iz * CELL }; }
function key(ix, iz) { return ix + ',' + iz; }
function parse(keyString) {
  const [ix, iz] = keyString.split(',').map(Number);
  return { ix, iz };
}
function validIndex(ix, iz) {
  return Math.abs(ix) <= MAX_AXIS && Math.abs(iz) <= MAX_AXIS;
}
function nearestCell(target, obstacles, cache) {
  const cx = Math.round(target.x / CELL);
  const cz = Math.round(target.z / CELL);
  for (let radius = 0; radius <= 7; radius++) {
    const candidates = [];
    for (let iz = cz - radius; iz <= cz + radius; iz++) {
      for (let ix = cx - radius; ix <= cx + radius; ix++) {
        if (Math.max(Math.abs(ix - cx), Math.abs(iz - cz)) !== radius) continue;
        if (validIndex(ix, iz) && available(ix, iz, obstacles, cache)) {
          candidates.push({ ix, iz, distance: Math.hypot(ix * CELL - target.x, iz * CELL - target.z) });
        }
      }
    }
    if (candidates.length) {
      candidates.sort((a, b) => a.distance - b.distance || a.ix - b.ix || a.iz - b.iz);
      return candidates[0];
    }
  }
  return null;
}
function available(ix, iz, obstacles, cache) {
  if (!validIndex(ix, iz)) return false;
  const id = key(ix, iz);
  if (!cache.has(id)) {
    const point = gridPos(ix, iz);
    cache.set(id, npcPassable(point.x, point.z, obstacles));
  }
  return cache.get(id);
}
export function findNpcPath(start, target, obstacles = [], maxNodes = 2300) {
  if (![start?.x, start?.z, target?.x, target?.z].every(Number.isFinite)) return [];
  if (npcPassable(target.x, target.z, obstacles) &&
    npcSegmentFree(start, target, obstacles)) return [{ x: target.x, z: target.z }];
  const cache = new Map();
  const from = nearestCell(start, obstacles, cache);
  const to = nearestCell(target, obstacles, cache);
  if (!from || !to) return [];
  const endKey = key(to.ix, to.iz);
  const startKey = key(from.ix, from.iz);
  const heuristic = (ix, iz) => Math.hypot(ix - to.ix, iz - to.iz);
  const nodes = new Map([[startKey, { ix: from.ix, iz: from.iz, g: 0, f: heuristic(from.ix, from.iz), parent: null }]]);
  const open = new Set([startKey]);
  const closed = new Set();
  let explored = 0;
  while (open.size > 0 && explored++ < maxNodes) {
    let currentKey = null;
    let current = null;
    for (const id of open) {
      const node = nodes.get(id);
      if (!current || node.f < current.f || (node.f === current.f && node.g < current.g)) {
        current = node; currentKey = id;
      }
    }
    if (currentKey === endKey) {
      const path = [];
      let cursor = current;
      while (cursor) {
        path.push(gridPos(cursor.ix, cursor.iz));
        cursor = cursor.parent ? nodes.get(cursor.parent) : null;
      }
      path.reverse();
      if (path.length) path[0] = { x: start.x, z: start.z };
      if (npcPassable(target.x, target.z, obstacles) &&
        npcSegmentFree(path[path.length - 1], target, obstacles)) {
        path.push({ x: target.x, z: target.z });
      }
      const smooth = [];
      for (let i = 0; i < path.length - 1;) {
        let j = path.length - 1;
        while (j > i + 1 && !npcSegmentFree(path[i], path[j], obstacles)) j--;
        smooth.push(path[j]);
        i = j;
      }
      return smooth;
    }
    open.delete(currentKey); closed.add(currentKey);
    for (const [sx, sz] of NEIGHBORS) {
      const ix = current.ix + sx;
      const iz = current.iz + sz;
      const nid = key(ix, iz);
      if (closed.has(nid) || !available(ix, iz, obstacles, cache)) continue;
      // Impede atravessar quinas de casas e troncos.
      if (sx !== 0 && sz !== 0 && (
        !available(current.ix + sx, current.iz, obstacles, cache) ||
        !available(current.ix, current.iz + sz, obstacles, cache)
      )) continue;
      const distance = sx !== 0 && sz !== 0 ? Math.SQRT2 : 1;
      const g = current.g + distance;
      const existing = nodes.get(nid);
      if (!existing || g < existing.g) {
        nodes.set(nid, { ix, iz, g, f: g + heuristic(ix, iz), parent: currentKey });
        open.add(nid);
      }
    }
  }
  return [];
}
