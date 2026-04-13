const HEADTTS_VERSION = '1.1.0';
let headttsInstance = null;
let audioContext = null;

function getAudioContext() {
  if (!audioContext) {
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctx) throw new Error('Web Audio is not available in this browser');
    audioContext = new Ctx();
  }
  return audioContext;
}

function extractAudioPayload(message) {
  if (!message) return null;
  if (message.type === 'error') {
    throw new Error(message.data?.error || message.error || 'HeadTTS synthesis failed');
  }
  return message.data?.audio || message.data || message.audio || null;
}

async function decodeAudioPayload(payload) {
  if (!payload) return null;
  if (payload instanceof AudioBuffer) return payload;
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();
  if (payload instanceof ArrayBuffer) return ctx.decodeAudioData(payload.slice(0));
  if (ArrayBuffer.isView(payload)) return ctx.decodeAudioData(payload.buffer.slice(0));
  if (payload.audio instanceof AudioBuffer) return payload.audio;
  if (payload.audio instanceof ArrayBuffer) return ctx.decodeAudioData(payload.audio.slice(0));
  if (ArrayBuffer.isView(payload.audio)) return ctx.decodeAudioData(payload.audio.buffer.slice(0));
  return null;
}

async function playSynthesisMessages(messages) {
  const entries = Array.isArray(messages) ? messages : [messages];
  for (const entry of entries) {
    const payload = extractAudioPayload(entry);
    const audioBuffer = await decodeAudioPayload(payload);
    if (!audioBuffer) continue;
    const ctx = getAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start();
    return true;
  }
  return false;
}

export async function ensureSpeechTTS(options = {}) {
  if (headttsInstance) return headttsInstance;
  const url = `https://cdn.jsdelivr.net/npm/@met4citizen/headtts@${HEADTTS_VERSION}/+esm`;
  const { HeadTTS } = await import(/* @vite-ignore */ url);
  headttsInstance = new HeadTTS({
    endpoints: ['webgpu', 'wasm'],
    audioCtx: getAudioContext(),
    workerModule: `https://cdn.jsdelivr.net/npm/@met4citizen/headtts@${HEADTTS_VERSION}/modules/worker-tts.mjs`,
    dictionaryURL: `https://cdn.jsdelivr.net/npm/@met4citizen/headtts@${HEADTTS_VERSION}/dictionaries/`,
    languages: ['en-us'],
    voices: [options.voice || 'af_bella']
  });
  await headttsInstance.connect();
  return headttsInstance;
}

export async function speakTextWithTTS(text, options = {}) {
  const headtts = await ensureSpeechTTS(options);
  headtts.setup({
    voice: options.voice || 'af_bella',
    language: options.language || 'en-us',
    speed: options.speed || 1,
    audioEncoding: 'wav'
  });
  const messages = await headtts.synthesize({ input: text });
  const played = await playSynthesisMessages(messages);
  return { played, messages };
}
