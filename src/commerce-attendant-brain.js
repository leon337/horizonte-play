// Horizonte Living Commerce — comportamento local, determinístico e sem API.
// O atendente permanece atrás do balcão. Estado 3D não modifica saldo/estoque.
export const ATTENDANT_STATIONS = Object.freeze([
  Object.freeze({ x: 0.65, z: -0.55, activity: 'Atendendo no balcão', duration: 4 }),
  Object.freeze({ x: -1.35, z: 0.25, activity: 'Preparando café', duration: 5 }),
  Object.freeze({ x: 1.35, z: 0.25, activity: 'Organizando pedidos', duration: 4.5 })
]);
const SAY = Object.freeze({
  greet: 'Bem-vindo! ☕',
  open: 'Olá! Posso ajudar?',
  talk: 'Pode falar!',
  order: 'Pedido pronto! ☕',
  demo: 'Demonstração pronta! ☕',
  restock: 'Estoque organizado!',
  nina: 'Oi, Nina! ☕',
  bye: 'Até logo!'
});
const delta = value => Number.isFinite(value) ? Math.max(0, Math.min(0.15, value)) : 0;
const distance = (a, b) =>
  a && b && Number.isFinite(b.x) && Number.isFinite(b.z)
    ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;

export function createAttendantBrain(shop) {
  if (!shop || !Number.isFinite(shop.x) || !Number.isFinite(shop.z))
    throw new TypeError('Cafeteria inválida para NPC.');
  const state = {
    x: ATTENDANT_STATIONS[0].x, z: ATTENDANT_STATIONS[0].z,
    heading: 0, activity: ATTENDANT_STATIONS[0].activity,
    walking: false, station: 0, remaining: ATTENDANT_STATIONS[0].duration,
    hold: 0, speech: '', speechRemaining: 0,
    nearPlayer: false, nearNina: false, interacting: false
  };
  function say(type) {
    if (!Object.hasOwn(SAY, type)) return false;
    state.speech = SAY[type];
    state.speechRemaining = type === 'order' ? 4 : 2.9;
    state.hold = type === 'order' ? 3.3 : 2.0;
    state.walking = false;
    if (type === 'order' || type === 'open') {
      state.station = 0; // Volta ao balcão sem teleporte.
      state.remaining = ATTENDANT_STATIONS[0].duration;
    }
    return true;
  }
  function update(dt, { player = null, nina = null, interacting = false } = {}) {
    const step = delta(dt);
    const shopPosition = { x: shop.x, z: shop.z };
    const playerNearby = distance(shopPosition, player) <= 8;
    const ninaNearby = distance(shopPosition, nina) <= 7.1;
    if (!state.nearPlayer && playerNearby) say('greet');
    else if (!state.nearNina && ninaNearby && !interacting) say('nina');
    state.nearPlayer = playerNearby;
    state.nearNina = ninaNearby;
    state.interacting = Boolean(interacting);
    if (step === 0) return snapshot();

    state.speechRemaining = Math.max(0, state.speechRemaining - step);
    if (state.speechRemaining === 0) state.speech = '';
    state.hold = Math.max(0, state.hold - step);
    if (state.interacting || state.hold > 0) {
      state.walking = false;
      state.activity = state.interacting ? 'Conversando com o jogador' : 'Recebendo clientes';
      if (playerNearby && player) {
        const dx = player.x - (shop.x + state.x);
        const dz = player.z - (shop.z + state.z);
        if (Math.hypot(dx, dz) > 0.2) {
          const face = Math.atan2(-dx, -dz);
          const diff = Math.atan2(Math.sin(face - state.heading),
            Math.cos(face - state.heading));
          state.heading += diff * Math.min(1, step * 4);
        }
      }
      return snapshot();
    }

    const target = ATTENDANT_STATIONS[state.station];
    const dx = target.x - state.x;
    const dz = target.z - state.z;
    const remaining = Math.hypot(dx, dz);
    if (remaining > 0.045) {
      const move = Math.min(remaining, step * 0.65);
      state.x += (dx / remaining) * move;
      state.z += (dz / remaining) * move;
      const face = Math.atan2(-dx, -dz);
      const diff = Math.atan2(Math.sin(face - state.heading),
        Math.cos(face - state.heading));
      state.heading += diff * Math.min(1, step * 6);
      state.walking = true;
      state.activity = 'Caminhando pelo balcão';
    } else {
      state.walking = false;
      state.x = target.x;
      state.z = target.z;
      state.activity = target.activity;
      state.remaining -= step;
      if (state.remaining <= 0) {
        state.station = (state.station + 1) % ATTENDANT_STATIONS.length;
        state.remaining = ATTENDANT_STATIONS[state.station].duration;
      }
    }
    // Os únicos caminhos e posições são os pontos seguros atrás do balcão.
    return snapshot();
  }
  function snapshot() {
    return {
      shopId: shop.id, x: state.x, z: state.z, heading: state.heading,
      activity: state.activity, walking: state.walking,
      speech: state.speech, nearPlayer: state.nearPlayer,
      nearNina: state.nearNina, interacting: state.interacting
    };
  }
  return { update, event: say, getSnapshot: snapshot };
}
