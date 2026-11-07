const BRIDGE = 'http://127.0.0.1:4174';
const VOICE = 'Kore';
const MAX_SESSION_MS = 5 * 60 * 1000;
const MODEL = 'gemini-3.8-live';

export function pcmToBase64(samples) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const clipped = Math.min(1, Math.max(-1, samples[i]));
    view.setInt16(i * 2, clipped < 0 ? Math.round(clipped * 32768) :
      Math.round(clipped * 32767), true);
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 16384) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  }
  return btoa(binary);
}
export function base64ToPcm(base64) {
  const binary = atob(base64);
  const samples = new Float32Array(Math.floor(binary.length / 2));
  for (let i = 0; i < samples.length; i++) {
    const lo = binary.charCodeAt(i * 2);
    const hi = binary.charCodeAt(i * 2 + 1);
    const value = (hi << 8) | lo;
    samples[i] = (value >= 32768 ? value - 65536 : value) / 32768;
  }
  return samples;
}
function voiceWorkletURL() {
  const code = `
class HorizonteMic extends AudioWorkletProcessor {
  constructor() {
    super();
    this.temp = new Float32Array(2048);
    this.fill = 0;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (input) {
      for (let i=0;i<input.length;i++) {
        this.temp[this.fill++] = input[i];
        if (this.fill===2048) {
          this.port.postMessage(this.temp, [this.temp.buffer]);
          this.temp = new Float32Array(2048);
          this.fill = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('horizonte-mic', HorizonteMic);`;
  return URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
}

export function createGeminiLive({ onState = () => {}, onText = () => {},
  onUserTranscript = () => {}, onError = () => {} } = {}) {
  let session = null;
  let live = false;
  let busy = false;
  let microphone = null;
  let inputContext = null;
  let inputNode = null;
  let silentNode = null;
  let outputContext = null;
  let nextAudioTime = 0;
  let workletURL = null;
  let expiryTimer = null;
  let generation = 0;
  let waitingForTurn = false;

  const status = (name) => onState({ status: name, connected: live,
    microphone: Boolean(microphone), waiting: waitingForTurn });
  function stopMicrophone() {
    if (inputNode) { inputNode.disconnect(); inputNode.port.onmessage = null; inputNode = null; }
    if (silentNode) { silentNode.disconnect(); silentNode = null; }
    if (microphone) {
      microphone.getTracks().forEach(track => track.stop());
      microphone = null;
    }
    if (inputContext) { inputContext.close().catch(() => {}); inputContext = null; }
    if (workletURL) { URL.revokeObjectURL(workletURL); workletURL = null; }
    status(live ? 'Gemini Live conectado' : 'Modo local');
  }
  function disconnect() {
    generation++;
    busy = false;
    waitingForTurn = false;
    clearTimeout(expiryTimer);
    expiryTimer = null;
    stopMicrophone();
    try { session?.close(); } catch {}
    session = null;
    live = false;
    if (outputContext) {
      outputContext.close().catch(() => {});
      outputContext = null;
    }
    nextAudioTime = 0;
    status('Modo local');
  }
  function audioChunk(data) {
    if (!outputContext || outputContext.state === 'closed') return;
    let pcm;
    try { pcm = base64ToPcm(data); } catch { return; }
    if (pcm.length === 0) return;
    const buffer = outputContext.createBuffer(1, pcm.length, 24000);
    buffer.copyToChannel(pcm, 0);
    const source = outputContext.createBufferSource();
    source.buffer = buffer;
    source.connect(outputContext.destination);
    nextAudioTime = Math.max(nextAudioTime, outputContext.currentTime + 0.035);
    source.start(nextAudioTime);
    nextAudioTime += buffer.duration;
  }
  async function connect(context) {
    if (busy || live) return live;
    busy = true;
    const current = ++generation;
    status('Conectando Gemini 3.8 Live...');
    try {
      // O contexto de áudio precisa ser iniciado por interação explícita do usuário.
      outputContext = new AudioContext({ sampleRate: 24000 });
      await outputContext.resume();
      const response = await fetch(BRIDGE + '/api/live-token', {
        method: 'POST', mode: 'cors', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: 'user-click' }),
        signal: AbortSignal.timeout(18000)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível conectar.');
      if (current !== generation) return false;
      // SDK só é carregado quando o jogador opta por conectar (sem custo ao abrir o jogo).
      const { GoogleGenAI, Modality } = await import('@google/genai');
      if (current !== generation) return false;
      const ai = new GoogleGenAI({
        apiKey: payload.token, httpOptions: { apiVersion: 'v1beta' }
      });
      session = await ai.live.connect({
        model: MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
          systemInstruction: {
            parts: [{ text:
              'Você interpreta Nina, uma moradora amigável do mundo 3D Horizonte Play. ' +
              'Converse naturalmente em português brasileiro, com respostas curtas (até 3 frases). ' +
              'Sua personalidade é curiosa, gentil e bem-humorada. ' +
              'Você pode explicar seu mundo e atividades, mas não prometa executar ações físicas sem suporte do jogo. ' +
              'Sua rotina local inclui explorar, comer, descansar, socializar e seguir o jogador. ' +
              'O nome lembrado do jogador é: ' + (context.playerName || 'ainda desconhecido') +
              '. Sua atividade atual: ' + (context.activity || 'explorando o vale') + '.'
            }]
          }
        },
        callbacks: {
          onopen: () => status('Sessão Live iniciada'),
          onmessage: message => {
            if (current !== generation) return;
            const content = message.serverContent;
            if (!content) return;
            if (content.inputTranscription?.text) onUserTranscript(content.inputTranscription.text);
            if (content.outputTranscription?.text) onText(content.outputTranscription.text);
            for (const part of content.modelTurn?.parts || []) {
              if (part.inlineData?.mimeType?.startsWith('audio/')) audioChunk(part.inlineData.data);
            }
            if (content.turnComplete) {
              waitingForTurn = false;
              status('Gemini Live conectado');
            }
            if (content.interrupted) {
              waitingForTurn = false;
              nextAudioTime = 0;
            }
          },
          onerror: () => onError('A conexão Gemini encontrou um erro.'),
          onclose: () => { if (current === generation) disconnect(); }
        }
      });
      if (current !== generation) { session?.close(); return false; }
      live = true;
      busy = false;
      expiryTimer = setTimeout(() => {
        onError('A sessão terminou após 5 minutos para controlar custos.');
        disconnect();
      }, MAX_SESSION_MS);
      status('Gemini 3.8 Live conectado');
      return true;
    } catch (error) {
      if (current === generation) {
        disconnect();
        onError(error?.message || 'Erro de conexão Gemini Live.');
      }
      return false;
    }
  }
  function sendText(text) {
    if (!live || !session) return false;
    waitingForTurn = true;
    status('Nina está respondendo...');
    try {
      session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text: String(text).slice(0, 500) }] }],
        turnComplete: true
      });
      return true;
    } catch {
      onError('Não foi possível enviar sua mensagem.');
      return false;
    }
  }
  async function toggleMicrophone() {
    if (microphone) {
      stopMicrophone();
      try { session?.sendRealtimeInput({ audioStreamEnd: true }); } catch {}
      return false;
    }
    if (!live || !session) { onError('Conecte o Gemini Live primeiro.'); return false; }
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode)
        throw new Error('Microfone em tempo real indisponível neste navegador.');
      microphone = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
        video: false
      });
      inputContext = new AudioContext({ sampleRate: 16000 });
      workletURL = voiceWorkletURL();
      await inputContext.audioWorklet.addModule(workletURL);
      const source = inputContext.createMediaStreamSource(microphone);
      inputNode = new AudioWorkletNode(inputContext, 'horizonte-mic');
      const silent = inputContext.createGain();
      silent.gain.value = 0;
      silentNode = silent;
      inputNode.port.onmessage = e => {
        if (!live || !microphone || !session) return;
        try {
          session.sendRealtimeInput({ audio: {
            data: pcmToBase64(e.data),
            mimeType: 'audio/pcm;rate=' + inputContext.sampleRate
          } });
        } catch {}
      };
      source.connect(inputNode);
      inputNode.connect(silentNode).connect(inputContext.destination);
      await inputContext.resume();
      status('Microfone ativo: converse com Nina');
      return true;
    } catch(error) {
      stopMicrophone();
      onError(error?.message || 'Não foi possível ativar microfone.');
      return false;
    }
  }
  return { connect, disconnect, sendText, toggleMicrophone,
    isConnected: () => live, microphoneActive: () => Boolean(microphone) };
}
