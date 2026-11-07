// Horizonte Living — cérebro local, independente do renderizador e de APIs externas.
// O NPC usa um modelo simples de utilidade/necessidades, não um modelo de linguagem.
export const NPC_NAME = 'Nina';
export const NPC_MEMORY_KEY = 'horizonte-living-nina-v1';
export const NPC_GOALS = Object.freeze({
  explore: 'Explorando o vale',
  eat: 'Fazendo uma refeição',
  rest: 'Descansando em casa',
  socialize: 'Procurando companhia',
  wander: 'Passeando pela vila',
  follow: 'Seguindo você'
});
export const NPC_TARGETS = Object.freeze({
  eat: { x: 6, z: 13 },
  rest: { x: -9, z: 15 },
  explore: [
    { x: 12, z: -5 }, { x: -8, z: -3 }, { x: 19, z: 8 },
    { x: -4, z: 23 }
  ],
  wander: [
    { x: 5, z: 9 }, { x: -7, z: 10 }, { x: 11, z: 14 },
    { x: 1, z: -2 }
  ]
});

export const clampNeed = n => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
export function cleanName(raw) {
  const name = String(raw ?? '').replace(/[<>\\{}\[\]\n\r]/g, '').trim()
    .split(/\s+/).slice(0, 2).join(' ').slice(0, 25);
  if (!/^[\p{L}][\p{L} '-]{0,24}$/u.test(name)) return null;
  return name.charAt(0).toLocaleUpperCase('pt-BR') + name.slice(1);
}
export function normalizeSpeech(raw) {
  return String(raw ?? '').toLocaleLowerCase('pt-BR')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
export function initialMind(saved = {}) {
  const remembered = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  return {
    name: NPC_NAME,
    needs: { food: 69, energy: 73, social: 63, curiosity: 36 },
    goal: 'explore',
    phase: 'travel',
    taskRemaining: 0,
    clockMinutes: 8 * 60,
    goalIndex: 0,
    completed: 0,
    follow: false,
    conversationOpen: false,
    memory: {
      playerName: cleanName(remembered.playerName),
      conversations: Math.max(0, Math.min(10000, Number.isInteger(remembered.conversations) ? remembered.conversations : 0)),
      lastTopic: ['name', 'world', 'needs', 'follow', 'none'].includes(remembered.lastTopic) ? remembered.lastTopic : 'none'
    }
  };
}
export function decideGoal(mind) {
  if (mind.follow) return 'follow';
  if (mind.needs.food < 46) return 'eat';
  if (mind.needs.energy < 42) return 'rest';
  if (mind.needs.social < 38) return 'socialize';
  if (mind.needs.curiosity < 62) return 'explore';
  return 'wander';
}
export function getTarget(mind, player = { x: 0, z: 6 }) {
  switch (mind.goal) {
    case 'eat': return NPC_TARGETS.eat;
    case 'rest': return NPC_TARGETS.rest;
    case 'socialize': return { x: player.x, z: player.z };
    case 'follow': return { x: player.x, z: player.z };
    case 'explore': return NPC_TARGETS.explore[mind.goalIndex % NPC_TARGETS.explore.length];
    default: return NPC_TARGETS.wander[mind.goalIndex % NPC_TARGETS.wander.length];
  }
}
export function updateMind(mind, dt, arrived = false) {
  dt = Math.max(0, Math.min(0.25, Number.isFinite(dt) ? dt : 0));
  if (mind.conversationOpen || dt === 0) return mind;
  mind.clockMinutes = (mind.clockMinutes + dt * 1.5) % 1440;
  const n = mind.needs;
  n.food = clampNeed(n.food - dt * 0.14);
  n.energy = clampNeed(n.energy - dt * (mind.phase === 'travel' ? 0.12 : 0.045));
  n.social = clampNeed(n.social - dt * 0.07);
  n.curiosity = clampNeed(n.curiosity - dt * 0.09);

  if (mind.follow) {
    mind.goal = 'follow';
    mind.phase = 'travel';
    mind.taskRemaining = 0;
    return mind;
  }
  if (mind.goal === 'follow') {
    mind.goal = decideGoal(mind);
    mind.phase = 'travel';
  }
  if (mind.phase === 'acting') {
    mind.taskRemaining -= dt;
    if (mind.taskRemaining <= 0) {
      if (mind.goal === 'eat') n.food = clampNeed(n.food + 52);
      if (mind.goal === 'rest') n.energy = clampNeed(n.energy + 62);
      if (mind.goal === 'explore') n.curiosity = clampNeed(n.curiosity + 44);
      if (mind.goal === 'socialize') n.social = clampNeed(n.social + 45);
      if (mind.goal === 'wander') n.curiosity = clampNeed(n.curiosity + 15);
      mind.completed += 1;
      mind.goalIndex += 1;
      mind.goal = decideGoal(mind);
      mind.phase = 'travel';
      mind.taskRemaining = 0;
    }
  } else {
    // Emergências mudam o planejamento sem precisar terminar uma caminhada longa.
    const urgent = n.food < 20 ? 'eat' : n.energy < 20 ? 'rest' : null;
    if (urgent && urgent !== mind.goal) mind.goal = urgent;
    if (arrived) {
      mind.phase = 'acting';
      mind.taskRemaining = mind.goal === 'rest' ? 8 : mind.goal === 'eat' ? 6 : 4;
    }
  }
  return mind;
}
export function clockLabel(clockMinutes) {
  const m = Math.floor(((clockMinutes % 1440) + 1440) % 1440);
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' +
    String(m % 60).padStart(2, '0');
}
export function memorySnapshot(mind) {
  return { playerName: mind.memory.playerName,
    conversations: mind.memory.conversations, lastTopic: mind.memory.lastTopic };
}
export function npcReply(mind, utterance, context = {}) {
  const input = String(utterance ?? '').slice(0, 140).trim();
  if (!input) return 'Pode falar! Estou ouvindo.';
  const speech = normalizeSpeech(input);
  const nameMatch = input.match(/(?:meu nome (?:é|e)|me chamo|pode me chamar de)\s+([\p{L}][\p{L} '-]{0,25})/iu);
  mind.memory.conversations++;
  const familiarity = mind.memory.playerName ? ', ' + mind.memory.playerName : '';
  mind.needs.social = clampNeed(mind.needs.social + 6);
  if (nameMatch) {
    const name = cleanName(nameMatch[1]);
    if (name) {
      mind.memory.playerName = name;
      mind.memory.lastTopic = 'name';
      return 'Prazer, ' + name + '! Vou lembrar como você gosta de ser chamado.';
    }
  }
  if (/(nao me siga|pare de me seguir|pare de seguir|pare|fique aqui|fica aqui|volte a rotina|voltar a rotina)/.test(speech)) {
    mind.follow = false;
    mind.goal = decideGoal(mind);
    mind.phase = 'travel';
    mind.memory.lastTopic = 'follow';
    return 'Combinado' + familiarity + '! Vou voltar às minhas atividades pela vila.';
  }
  if (/(me siga|siga me|segue me|vem comigo|venha comigo|me acompanhe|acompanha me)/.test(speech)) {
    mind.follow = true;
    mind.goal = 'follow';
    mind.phase = 'travel';
    mind.memory.lastTopic = 'follow';
    return 'Claro' + familiarity + '! Vou acompanhar você pelas áreas de terra firme.';
  }
  if (/(como voce esta|tudo bem|sentindo|fome|energia|cansad|precisa)/.test(speech)) {
    mind.memory.lastTopic = 'needs';
    const n = mind.needs;
    const current = n.food < 46 ? 'Estou com fome.' : n.energy < 42 ? 'Estou precisando descansar.' :
      n.curiosity < 62 ? 'Estou com vontade de explorar.' : 'Estou bem e animada!';
    return current + ' Minha energia está em ' + Math.round(n.energy) + '% e a saciedade em ' + Math.round(n.food) + '%.';
  }
  if (/(o que voce faz|o que esta fazendo|rotina|trabalho|profissao|vida)/.test(speech)) {
    mind.memory.lastTopic = 'needs';
    return 'Agora estou: ' + NPC_GOALS[mind.goal].toLowerCase() + '. Eu decido entre comer, descansar e explorar conforme minhas necessidades.';
  }
  if (/(quem e voce|seu nome|como se chama)/.test(speech)) {
    mind.memory.lastTopic = 'name';
    return 'Sou Nina, a primeira moradora autônoma do Horizonte Play. Ainda estou aprendendo a conhecer esse mundo!';
  }
  if (/(lago|agua|nadar|mergulho)/.test(speech)) {
    mind.memory.lastTopic = 'world';
    return 'O lago fica adiante! Você pode nadar nele. Por enquanto, prefiro caminhar nas trilhas.';
  }
  if (/(casa|mora|onde vive|descansar)/.test(speech)) {
    mind.memory.lastTopic = 'world';
    return 'Minha casa fica perto das construções coloridas. Quando fico cansada, volto para descansar.';
  }
  if (/(hora|horario|que horas)/.test(speech)) {
    mind.memory.lastTopic = 'world';
    return 'Aqui no vale são ' + clockLabel(mind.clockMinutes) + ' no nosso relógio de jogo.';
  }
  if (/(ajuda|comando|conversar|pode fazer)/.test(speech)) {
    mind.memory.lastTopic = 'world';
    return 'Você pode perguntar sobre minha rotina, meu nome, o lago ou dizer "me siga" e "pare de me seguir".';
  }
  mind.memory.lastTopic = 'world';
  const choices = [
    'O Horizonte tem lugares interessantes. Quer explorar comigo? Diga "me siga".',
    'Gosto de passear pelo vale e visitar minha casa. Pergunte como estou ou o que estou fazendo.',
    'Ainda converso por respostas locais, mas lembro seu nome e posso seguir você.'
  ];
  return choices[mind.memory.conversations % choices.length];
}
