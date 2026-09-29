/*
 Procedural ambient sound with the Web Audio API: filtered noise and small oscillators, so there are no audio files,
 downloads or licences. Browsers only allow sound after a click, so start() is called from the Play/Start button.
*/
export const AMBIENCES = Object.freeze(['ocean', 'wind', 'forest', 'rain', 'fire', 'night']);

function noiseBuffer(context, seconds = 4, brown = false) {
 const length = Math.floor(context.sampleRate * seconds), buffer = context.createBuffer(1, length, context.sampleRate), data = buffer.getChannelData(0);
 let last = 0;
 for (let i = 0; i < length; i++) { const white = Math.random() * 2 - 1; if (brown) { last = (last + .02 * white) / 1.02; data[i] = last * 3.5; } else data[i] = white; }
 return buffer;
}

export function createAmbience({ AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext } = {}) {
 let context = null, master = null, nodes = [], timers = [], current = 'none';
 const loop = (buffer) => { const source = context.createBufferSource(); source.buffer = buffer; source.loop = true; source.start(); nodes.push(source); return source; };
 const lfo = (frequency, depth, target, offset = 0) => { const osc = context.createOscillator(), gain = context.createGain(); osc.frequency.value = frequency; gain.gain.value = depth; osc.connect(gain).connect(target); if (offset) target.value = offset; osc.start(); nodes.push(osc, gain); };
 const filter = (type, frequency, q = .7) => { const node = context.createBiquadFilter(); node.type = type; node.frequency.value = frequency; node.Q.value = q; nodes.push(node); return node; };
 const gainNode = value => { const node = context.createGain(); node.gain.value = value; nodes.push(node); return node; };
 const every = (min, max, fn) => { let stopped = false; const tick = () => { if (stopped) return; fn(); timers.push(setTimeout(tick, min + Math.random() * (max - min))); }; timers.push(setTimeout(tick, min)); timers.push({ stop: () => { stopped = true; } }); };
 const chirp = (from, to, duration, volume) => {
  const osc = context.createOscillator(), gain = context.createGain(), t = context.currentTime;
  osc.frequency.setValueAtTime(from, t); osc.frequency.exponentialRampToValueAtTime(to, t + duration);
  gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(volume, t + .01); gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
  osc.connect(gain).connect(master); osc.start(t); osc.stop(t + duration + .05);
 };

 const builders = {
  ocean() { const src = loop(noiseBuffer(context, 6, true)), lp = filter('lowpass', 500), g = gainNode(.5); src.connect(lp).connect(g).connect(master); lfo(.09, .35, g.gain, .5); lfo(.07, 300, lp.frequency, 700); },
  wind() { const src = loop(noiseBuffer(context, 5)), bp = filter('bandpass', 500, 1.2), g = gainNode(.18); src.connect(bp).connect(g).connect(master); lfo(.05, 280, bp.frequency, 520); lfo(.11, .1, g.gain, .18); },
  forest() { builders.wind(); every(700, 3200, () => { const base = 2200 + Math.random() * 1800; for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) setTimeout(() => chirp(base, base * (1.2 + Math.random() * .5), .09 + Math.random() * .08, .05), i * 130); }); },
  rain() { const src = loop(noiseBuffer(context, 4)), hp = filter('highpass', 900), lp = filter('lowpass', 7000), g = gainNode(.22); src.connect(hp).connect(lp).connect(g).connect(master); every(40, 160, () => chirp(3200 + Math.random() * 2500, 1800, .03, .02)); },
  fire() { const src = loop(noiseBuffer(context, 5, true)), lp = filter('lowpass', 900), g = gainNode(.45); src.connect(lp).connect(g).connect(master); lfo(.3, .12, g.gain, .45); every(60, 420, () => chirp(1200 + Math.random() * 3000, 400, .015 + Math.random() * .02, .12)); },
  night() { const src = loop(noiseBuffer(context, 5, true)), lp = filter('lowpass', 300), g = gainNode(.12); src.connect(lp).connect(g).connect(master); every(900, 2400, () => { for (let i = 0; i < 3; i++) setTimeout(() => chirp(4300, 4200, .05, .025), i * 70); }); }
 };

 function stop() {
  for (const timer of timers) timer.stop ? timer.stop() : clearTimeout(timer); timers = [];
  for (const node of nodes) { try { node.stop?.(); } catch {} node.disconnect?.(); } nodes = []; current = 'none';
 }
 /** Starts (or switches) the ambience. Safe to call repeatedly; 'none' stops it. */
 function start(settings = {}) {
  const kind = settings.ambience || 'none', volume = settings.ambienceVolume ?? .5;
  if (kind === current && master) { master.gain.value = volume; return; }
  stop(); if (kind === 'none' || !AMBIENCES.includes(kind) || !AudioContextClass) return;
  if (!context) { context = new AudioContextClass(); master = context.createGain(); master.connect(context.destination); }
  master.gain.value = volume; context.resume?.(); builders[kind](); current = kind;
 }
 async function dispose() { stop(); if (context) { await context.close().catch(() => {}); context = null; master = null; } }
 return { start, stop, dispose, get playing() { return current; } };
}
