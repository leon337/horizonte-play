// Funções determinísticas do relevo e da água (unidades em metros).
export const WORLD_SIZE = 150;
export const WORLD_LIMIT = WORLD_SIZE / 2 - 3;
export const LAKE = Object.freeze({ x: 30, z: -25, radius: 14.6 });

export function rawHeight(x, z) {
  return 1.35 * Math.sin(x * 0.073) +
    1.25 * Math.cos(z * 0.065) +
    0.54 * Math.sin((x + z) * 0.15) +
    0.65 * Math.sin(x * 0.032 - z * 0.041);
}
export const LAKE_LEVEL = rawHeight(LAKE.x, LAKE.z) - 0.72;
// O corpo fica horizontal ao nadar; o centro do tronco permanece perto da lâmina d'água.
export const SWIM_ENTRY_DEPTH = 1.45;
export const SWIM_SURFACE_OFFSET = 1.78;
export function smoothstep(a, b, value) {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
export function distanceToLake(x, z) {
  return Math.hypot(x - LAKE.x, z - LAKE.z);
}
export function heightAt(x, z) {
  const d = distanceToLake(x, z);
  const land = rawHeight(x, z);
  // O fundo fica até ~9 m abaixo da superfície, com rampas progressivas.
  const deepFactor = 1 - smoothstep(1.2, LAKE.radius + 0.8, d);
  const basin = LAKE_LEVEL - 0.19 - 8.75 * deepFactor;
  const shoreline = smoothstep(LAKE.radius - 0.9, LAKE.radius + 5.1, d);
  return basin * (1 - shoreline) + land * shoreline;
}
export function insideWorld(x, z) {
  return Math.abs(x) < WORLD_LIMIT && Math.abs(z) < WORLD_LIMIT;
}
export function isInLake(x, z) {
  return distanceToLake(x, z) < LAKE.radius;
}
export function waterDepthAt(x, z) {
  return isInLake(x, z) ? Math.max(0, LAKE_LEVEL - heightAt(x, z)) : 0;
}
export function isSwimmingAt(x, z) {
  return waterDepthAt(x, z) > SWIM_ENTRY_DEPTH;
}
// Compatibilidade com a flutuação da versão anterior.
export function characterBaseAt(x, z) {
  const ground = heightAt(x, z);
  return isSwimmingAt(x, z) ? Math.max(ground, LAKE_LEVEL - 0.95) : ground;
}
// Os pés nunca atravessam o fundo nem emergem demais da superfície.
export function swimFeetLimits(x, z) {
  const floor = heightAt(x, z) + 0.14;
  const surface = Math.max(floor, LAKE_LEVEL - SWIM_SURFACE_OFFSET);
  return { floor, surface };
}
export function clampSwimFeet(x, z, feetY) {
  const { floor, surface } = swimFeetLimits(x, z);
  return Math.max(floor, Math.min(surface, feetY));
}
export function isFullySubmerged(feetY) {
  // Em pose horizontal, o topo do corpo fica cerca de 2,15 m acima dos pés virtuais.
  return feetY + 2.15 < LAKE_LEVEL - 0.10;
}
