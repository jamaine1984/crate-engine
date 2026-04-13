export const HORROR_AUDIO = {
  menu_music: '/audio/horror/menumusic01.wav',
  event_music: '/audio/horror/eventmusic01.wav',
  horror_music: '/audio/horror/eventmusic01.wav',
  heartbeat: '/audio/horror/heartbeat.wav',
  vision_ambient: '/audio/horror/visionsound1.wav',
  street_light_hum: '/audio/horror/streetlightsoundloop.wav',
  police_siren: '/audio/horror/policesiren.wav',
  chainsaw_idle: '/audio/horror/chainsawidle.wav',
  chainsaw_attack: '/audio/horror/chainsawattack.wav',
  chainsaw_on: '/audio/horror/chainsawturnon.wav',
  hunter_chase: '/audio/horror/hunter01chase01loop.wav',
  hunter_vision: '/audio/horror/huntersvisionsound.wav',
  footstep_1: '/audio/horror/player_footstep_01.wav',
  footstep_land: '/audio/horror/player_land.wav',
  door_open: '/audio/horror/dooropen.wav',
  door_close: '/audio/horror/closecardoor.wav',
  door_unlock: '/audio/horror/doorunlockingsoundloop.wav',
  flashlight_on: '/audio/horror/flashlightturnonsound.wav',
  flashlight_off: '/audio/horror/flashlightturnoffsound.wav',
  light_on: '/audio/horror/lightturnonsound.wav',
  light_off: '/audio/horror/lightturnoffsound.wav',
  match_start: '/audio/horror/matchstartsound.wav',
  street_break: '/audio/horror/streetlightbreaksound.wav',
  sword_swing: '/audio/horror/swordswing01.wav',
  sword_hit_flesh: '/audio/horror/swordfleshhit01.wav',
  sword_equip: '/audio/horror/swordequip01.wav',
  knife_hit: '/audio/horror/knifecharacterhit.wav',
  shotgun: '/audio/horror/shotgunsound.wav',
  car_start: '/audio/horror/carturnonsound.wav',
  car_accel: '/audio/horror/accelerationhigh.wav',
  car_skid: '/audio/horror/skid.wav',
  firecracker: '/audio/horror/firecrackersound.wav',
};

const audioState = { ctx: null, nodes: {} };

function getAudioCtx() {
  if (audioState.ctx) return audioState.ctx;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  audioState.ctx = new AudioContextCtor();
  return audioState.ctx;
}

export function getAudioKeys() {
  return Object.keys(HORROR_AUDIO);
}

export async function playSound(key, loop = false, volume = 1.0) {
  const src = HORROR_AUDIO[key];
  if (!src) return false;
  try {
    const ctx = getAudioCtx();
    if (!ctx) return false;
    if (ctx.state === 'suspended') await ctx.resume();
    if (loop && audioState.nodes[key]) stopSound(key);
    const response = await fetch(src);
    if (!response.ok) return false;
    const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    source.loop = loop;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);
    if (loop) {
      audioState.nodes[key] = { source, gain };
    }
    return true;
  } catch {
    return false;
  }
}

export function stopSound(key) {
  const node = audioState.nodes[key];
  if (!node) return;
  try {
    node.source.stop();
  } catch {}
  delete audioState.nodes[key];
}

export function stopAllSounds() {
  Object.keys(audioState.nodes).forEach(stopSound);
  if (audioState.ctx) {
    try {
      audioState.ctx.close();
    } catch {}
    audioState.ctx = null;
  }
}

export function bindAudioGlobals(target = window) {
  target._playHorrorSound = (...args) => playSound(...args);
  target._stopSound = (key) => stopSound(key);
  target._stopAllSounds = () => stopAllSounds();
  Object.defineProperty(target, '_HORROR_AUDIO', {
    configurable: true,
    get: () => HORROR_AUDIO,
  });
}

if (typeof window !== 'undefined') {
  bindAudioGlobals(window);
}
