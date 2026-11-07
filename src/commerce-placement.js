// Compartilhado por frontend e servidor: critérios de ocupação no mundo.
import { insideWorld, distanceToLake, LAKE } from './terrain.js';

export function canOpenCafe(x, z, shops = []) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || !insideWorld(x, z)) return false;
  if (distanceToLake(x, z) < LAKE.radius + 6.2) return false;
  if (Math.hypot(x, z - 6) < 8) return false;
  if (Math.hypot(x + 14, z - 15) < 6.6 ||
      Math.hypot(x + 23, z - 21) < 6.6 ||
      Math.hypot(x - 14, z - 22) < 6.6) return false;
  return !shops.some(shop => Math.hypot(shop.x - x, shop.z - z) < 10);
}
export function findCafeSpot(player, obstacles = [], shops = []) {
  for (const radius of [11, 13, 15, 18, 21, 25, 30]) {
    for (let i = 0; i < 32; i++) {
      const angle = (i / 32) * Math.PI * 2;
      const x = Math.round((player.x + Math.sin(angle) * radius) * 2) / 2;
      const z = Math.round((player.z + Math.cos(angle) * radius) * 2) / 2;
      if (!canOpenCafe(x, z, shops)) continue;
      if (obstacles.some(item => Math.hypot(item.x - x, item.z - z) <
        (item.radius || 0.4) + 4.2)) continue;
      return { x, z };
    }
  }
  return null;
}
