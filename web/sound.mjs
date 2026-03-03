// ═══════════════════════════════════════════════════════════════
// CRATE ENGINE — SOUND SYSTEM v1
// Procedural audio via Web Audio API — zero files, zero latency
// ═══════════════════════════════════════════════════════════════

let ctx = null;
let masterGain = null;
let musicGain = null;
let sfxGain = null;
let ambientGain = null;
let _currentMusic = null;
let _currentAmbient = null;
let _initialized = false;
let _muted = false;

// Lazy-init on first user interaction
function ensureCtx() { if (!_initialized) return false;
  if (_initialized && ctx?.state === 'running') return true;
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.7;
    masterGain.connect(ctx.destination);
    
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.3;
    musicGain.connect(masterGain);
    
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.6;
    sfxGain.connect(masterGain);
    
    ambientGain = ctx.createGain();
    ambientGain.gain.value = 0.25;
    ambientGain.connect(masterGain);
    
    _initialized = true;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx.state === 'running';
}

// ═══════════════════════════════════════════
// UTILITY: Note frequencies
// ═══════════════════════════════════════════
const NOTE_FREQ = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.26, G5: 783.99,
};

function noise(duration, gain = 0.1) {
  if (!ensureCtx()) return;
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * gain;
  return buffer;
}

function playTone(freq, duration, type = 'sine', gainVal = 0.3, dest = sfxGain, delay = 0) {
  if (!ensureCtx()) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gainVal, ctx.currentTime + delay);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
  osc.connect(g);
  g.connect(dest);
  osc.start(ctx.currentTime + delay);
  osc.stop(ctx.currentTime + delay + duration + 0.05);
}

function playNoise(duration, gainVal = 0.1, filterFreq = 2000, dest = sfxGain) {
  if (!ensureCtx()) return;
  const buf = noise(duration, 1);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gainVal, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  src.connect(filter);
  filter.connect(g);
  g.connect(dest);
  src.start();
}

// ═══════════════════════════════════════════
// SFX LIBRARY
// ═══════════════════════════════════════════

export const SFX = {
  // Footsteps
  footstep() {
    playNoise(0.08, 0.15, 800 + Math.random() * 400);
  },
  
  footstepRun() {
    playNoise(0.06, 0.2, 1000 + Math.random() * 500);
  },

  // Combat
  swordSwing() {
    if (!ensureCtx()) return;
    playNoise(0.15, 0.25, 3000);
    playTone(800 + Math.random() * 200, 0.12, 'sawtooth', 0.08);
  },

  swordHit() {
    if (!ensureCtx()) return;
    playTone(300, 0.1, 'square', 0.2);
    playTone(150, 0.15, 'sawtooth', 0.15, sfxGain, 0.02);
    playNoise(0.12, 0.3, 2000);
  },

  heavyAttack() {
    if (!ensureCtx()) return;
    playTone(120, 0.3, 'sawtooth', 0.25);
    playTone(80, 0.4, 'square', 0.15, sfxGain, 0.05);
    playNoise(0.25, 0.35, 1500);
  },

  // Damage
  playerHit() {
    if (!ensureCtx()) return;
    playTone(200, 0.2, 'square', 0.3);
    playTone(100, 0.3, 'sawtooth', 0.2, sfxGain, 0.05);
  },

  enemyHit() {
    if (!ensureCtx()) return;
    playTone(400, 0.1, 'square', 0.2);
    playNoise(0.08, 0.2, 2500);
  },

  enemyDeath() {
    if (!ensureCtx()) return;
    playTone(300, 0.15, 'sawtooth', 0.2);
    playTone(200, 0.2, 'sawtooth', 0.15, sfxGain, 0.1);
    playTone(100, 0.3, 'square', 0.1, sfxGain, 0.2);
    playNoise(0.3, 0.15, 1000);
  },

  playerDeath() {
    if (!ensureCtx()) return;
    playTone(400, 0.3, 'sine', 0.3);
    playTone(300, 0.3, 'sine', 0.25, sfxGain, 0.2);
    playTone(200, 0.4, 'sine', 0.2, sfxGain, 0.4);
    playTone(100, 0.6, 'sine', 0.15, sfxGain, 0.6);
  },

  // Dodge / roll
  dodge() {
    if (!ensureCtx()) return;
    playNoise(0.1, 0.15, 1500);
    playTone(500, 0.08, 'sine', 0.1);
  },

  // Jump
  jump() {
    if (!ensureCtx()) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.15);
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(g); g.connect(sfxGain);
    osc.start(); osc.stop(ctx.currentTime + 0.25);
  },

  land() {
    playNoise(0.1, 0.2, 600);
  },

  // Pickup / loot
  pickup() {
    if (!ensureCtx()) return;
    playTone(523, 0.08, 'sine', 0.2);
    playTone(659, 0.08, 'sine', 0.2, sfxGain, 0.08);
    playTone(784, 0.12, 'sine', 0.15, sfxGain, 0.16);
  },

  // Level up
  levelUp() {
    if (!ensureCtx()) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach(function(f, i) {
      playTone(f, 0.2, 'sine', 0.25, sfxGain, i * 0.12);
    });
    playTone(1047, 0.5, 'triangle', 0.15, sfxGain, 0.5);
  },

  // Quest complete
  questComplete() {
    if (!ensureCtx()) return;
    var melody = [392, 440, 523, 659, 784];
    melody.forEach(function(f, i) {
      playTone(f, 0.15, 'triangle', 0.2, sfxGain, i * 0.1);
    });
  },

  // Craft
  craft() {
    if (!ensureCtx()) return;
    playTone(300, 0.1, 'square', 0.15);
    playNoise(0.08, 0.2, 3000);
    playTone(600, 0.15, 'sine', 0.15, sfxGain, 0.15);
  },

  // UI sounds
  uiClick() {
    playTone(800, 0.05, 'sine', 0.1);
  },

  uiOpen() {
    playTone(400, 0.08, 'sine', 0.12);
    playTone(600, 0.08, 'sine', 0.1, sfxGain, 0.05);
  },

  uiClose() {
    playTone(600, 0.08, 'sine', 0.1);
    playTone(400, 0.08, 'sine', 0.08, sfxGain, 0.05);
  },

  // Environment
  explosion() {
    if (!ensureCtx()) return;
    playTone(60, 0.5, 'sawtooth', 0.4);
    playNoise(0.6, 0.5, 800);
    playTone(40, 0.8, 'square', 0.2, sfxGain, 0.1);
  },

  lightning() {
    if (!ensureCtx()) return;
    playNoise(0.4, 0.5, 4000);
    playTone(100, 0.6, 'sawtooth', 0.3, sfxGain, 0.05);
    playNoise(0.8, 0.2, 1000);
  },

  thunder() {
    if (!ensureCtx()) return;
    setTimeout(function() {
      playNoise(1.5, 0.35, 500);
      playTone(50, 1.0, 'sawtooth', 0.15);
    }, 300 + Math.random() * 1000);
  },

  portal() {
    if (!ensureCtx()) return;
    playTone(200, 0.3, 'sine', 0.15);
    playTone(300, 0.3, 'sine', 0.1, sfxGain, 0.1);
    playTone(400, 0.2, 'triangle', 0.1, sfxGain, 0.2);
  },

  teleport() {
    if (!ensureCtx()) return;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.3);
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(g); g.connect(sfxGain);
    osc.start(); osc.stop(ctx.currentTime + 0.45);
  },

  // Building enter/exit
  doorOpen() {
    playNoise(0.15, 0.1, 600);
    playTone(200, 0.1, 'sine', 0.08, sfxGain, 0.05);
  },

  doorClose() {
    playNoise(0.12, 0.12, 500);
    playTone(150, 0.08, 'sine', 0.08);
  },

  // Vehicle
  engineStart() {
    if (!ensureCtx()) return;
    playTone(80, 0.3, 'sawtooth', 0.15);
    playTone(120, 0.5, 'sawtooth', 0.1, sfxGain, 0.2);
  },

  // Respawn
  respawn() {
    if (!ensureCtx()) return;
    playTone(200, 0.15, 'sine', 0.2);
    playTone(300, 0.15, 'sine', 0.2, sfxGain, 0.12);
    playTone(400, 0.15, 'sine', 0.2, sfxGain, 0.24);
    playTone(600, 0.3, 'triangle', 0.15, sfxGain, 0.36);
  },

  // Heal
  heal() {
    if (!ensureCtx()) return;
    playTone(440, 0.1, 'sine', 0.15);
    playTone(554, 0.1, 'sine', 0.15, sfxGain, 0.08);
    playTone(659, 0.15, 'sine', 0.12, sfxGain, 0.16);
  },
};

// ═══════════════════════════════════════════
// FOOTSTEP TRACKER
// ═══════════════════════════════════════════
let _stepTimer = 0;
let _lastMoving = false;

export function updateFootsteps(dt, isMoving, isRunning) {
  if (!isMoving) { _stepTimer = 0; _lastMoving = false; return; }
  var interval = isRunning ? 0.28 : 0.42;
  _stepTimer += dt;
  if (_stepTimer >= interval) {
    _stepTimer = 0;
    if (isRunning) SFX.footstepRun(); else SFX.footstep();
  }
}

// ═══════════════════════════════════════════
// AMBIENT MUSIC — Procedural per biome
// ═══════════════════════════════════════════

const BIOME_MUSIC = {
  // Scale notes for each mood
  peaceful: { scale: [261.63, 293.66, 329.63, 392.00, 440.00], tempo: 2.0, type: 'sine' },
  medieval: { scale: [220.00, 261.63, 293.66, 329.63, 392.00, 440.00], tempo: 1.5, type: 'triangle' },
  dark:     { scale: [130.81, 146.83, 164.81, 196.00, 220.00], tempo: 3.0, type: 'sine' },
  combat:   { scale: [146.83, 174.61, 196.00, 220.00, 261.63], tempo: 0.8, type: 'sawtooth' },
  scifi:    { scale: [329.63, 392.00, 440.00, 523.25, 587.33], tempo: 1.8, type: 'triangle' },
  frozen:   { scale: [392.00, 440.00, 523.25, 587.33, 659.26], tempo: 2.5, type: 'sine' },
  horror:   { scale: [130.81, 138.59, 146.83, 155.56, 174.61], tempo: 4.0, type: 'sine' },
  desert:   { scale: [220.00, 246.94, 293.66, 329.63, 440.00], tempo: 2.0, type: 'triangle' },
  jungle:   { scale: [196.00, 220.00, 261.63, 293.66, 392.00], tempo: 1.5, type: 'sine' },
  cyberpunk:{ scale: [174.61, 196.00, 233.08, 261.63, 311.13], tempo: 1.2, type: 'square' },
};

let _musicTimer = 0;
let _musicMood = 'peaceful';
let _musicNoteIdx = 0;
let _bassTimer = 0;

export function setMusicMood(mood) {
  if (BIOME_MUSIC[mood]) _musicMood = mood;
}

export function updateMusic(dt) {
  if (!ensureCtx() || _muted) return;
  var cfg = BIOME_MUSIC[_musicMood] || BIOME_MUSIC.peaceful;
  
  // Melody notes
  _musicTimer += dt;
  if (_musicTimer >= cfg.tempo) {
    _musicTimer = 0;
    // Pick note — mostly sequential with occasional jumps
    if (Math.random() < 0.7) {
      _musicNoteIdx = (_musicNoteIdx + 1) % cfg.scale.length;
    } else {
      _musicNoteIdx = Math.floor(Math.random() * cfg.scale.length);
    }
    var freq = cfg.scale[_musicNoteIdx];
    // Sometimes rest (silence)
    if (Math.random() > 0.2) {
      playTone(freq, cfg.tempo * 0.8, cfg.type, 0.08, musicGain);
    }
  }
  
  // Bass drone every 4 beats
  _bassTimer += dt;
  if (_bassTimer >= cfg.tempo * 4) {
    _bassTimer = 0;
    var bassFreq = cfg.scale[0] * 0.5;
    playTone(bassFreq, cfg.tempo * 3, 'sine', 0.06, musicGain);
  }
}

// ═══════════════════════════════════════════
// AMBIENT SOUNDS — Biome-specific background
// ═══════════════════════════════════════════

let _ambTimer = 0;

export function updateAmbient(dt, biome) {
  if (!ensureCtx() || _muted) return;
  _ambTimer += dt;
  
  // Birds in peaceful/forest biomes
  if ((biome === 'forest' || biome === 'peaceful' || biome === 'medieval' || biome === 'farm' || biome === 'jungle') && _ambTimer > 3 + Math.random() * 5) {
    _ambTimer = 0;
    // Bird chirp
    var birdFreq = 1500 + Math.random() * 1500;
    playTone(birdFreq, 0.05, 'sine', 0.04, ambientGain);
    playTone(birdFreq * 1.2, 0.05, 'sine', 0.03, ambientGain, 0.07);
    if (Math.random() > 0.5) {
      playTone(birdFreq * 0.9, 0.06, 'sine', 0.03, ambientGain, 0.15);
    }
  }
  
  // Wind in frozen/desert/mountain
  if ((biome === 'frozen' || biome === 'desert' || biome === 'mountain') && _ambTimer > 4 + Math.random() * 6) {
    _ambTimer = 0;
    playNoise(2.0, 0.06, 400 + Math.random() * 300);
  }
  
  // Crickets at night / horror
  if ((biome === 'night' || biome === 'horror' || biome === 'dark') && _ambTimer > 1 + Math.random() * 2) {
    _ambTimer = 0;
    var cricketFreq = 4000 + Math.random() * 1000;
    for (var i = 0; i < 3 + Math.random() * 4; i++) {
      playTone(cricketFreq, 0.02, 'sine', 0.02, ambientGain, i * 0.06);
    }
  }
  
  // Electric hum for cyberpunk/scifi
  if ((biome === 'cyberpunk' || biome === 'scifi') && _ambTimer > 5 + Math.random() * 8) {
    _ambTimer = 0;
    playTone(60, 1.5, 'sawtooth', 0.02, ambientGain);
  }
  
  // Dripping for dungeon/cave
  if ((biome === 'dungeon' || biome === 'cave') && _ambTimer > 2 + Math.random() * 4) {
    _ambTimer = 0;
    playTone(2000 + Math.random() * 1000, 0.04, 'sine', 0.05, ambientGain);
  }
}

// ═══════════════════════════════════════════
// CONTROLS
// ═══════════════════════════════════════════

export function setMasterVolume(v) { if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, v)); }
export function setMusicVolume(v) { if (musicGain) musicGain.gain.value = Math.max(0, Math.min(1, v)); }
export function setSFXVolume(v) { if (sfxGain) sfxGain.gain.value = Math.max(0, Math.min(1, v)); }
export function setAmbientVolume(v) { if (ambientGain) ambientGain.gain.value = Math.max(0, Math.min(1, v)); }

export function mute() { _muted = true; if (masterGain) masterGain.gain.value = 0; }
export function unmute() { _muted = false; if (masterGain) masterGain.gain.value = 0.7; }
export function toggleMute() { if (_muted) unmute(); else mute(); return !_muted; }
export function isMuted() { return _muted; }

export function init() { if (_initialized) return; ctx = new (window.AudioContext || window.webkitAudioContext)(); masterGain = ctx.createGain(); masterGain.gain.value = 0.7; masterGain.connect(ctx.destination); musicGain = ctx.createGain(); musicGain.gain.value = 0.3; musicGain.connect(masterGain); sfxGain = ctx.createGain(); sfxGain.gain.value = 0.6; sfxGain.connect(masterGain); ambientGain = ctx.createGain(); ambientGain.gain.value = 0.25; ambientGain.connect(masterGain); _initialized = true; if (ctx.state === "suspended") ctx.resume(); }

// Map biome names to music moods
export function biomeToMood(biome) {
  var b = (biome || '').toLowerCase();
  if (b.match(/medieval|village|castle|fantasy|farm|pirate|enchanted/)) return 'medieval';
  if (b.match(/zombie|wasteland|apocal|war|nuclear/)) return 'combat';
  if (b.match(/haunted|graveyard|dark|horror|crypt|mansion/)) return 'horror';
  if (b.match(/frozen|tundra|ice|winter|snow/)) return 'frozen';
  if (b.match(/space|station|sci.?fi|alien|outpost/)) return 'scifi';
  if (b.match(/desert|oasis|sahara/)) return 'desert';
  if (b.match(/jungle|temple|dinosaur|tropical/)) return 'jungle';
  if (b.match(/cyber|neon|modern|city/)) return 'cyberpunk';
  if (b.match(/dungeon|cave|mine|dwarf/)) return 'dark';
  return 'peaceful';
}

// Map biome to ambient type
export function biomeToAmbient(biome) {
  var b = (biome || '').toLowerCase();
  if (b.match(/forest|village|farm|enchanted|garden|park/)) return 'forest';
  if (b.match(/frozen|tundra|ice|winter|desert|mountain/)) return 'frozen';
  if (b.match(/haunted|graveyard|dark|horror|night|zombie/)) return 'night';
  if (b.match(/cyber|neon|space|sci.?fi/)) return 'cyberpunk';
  if (b.match(/dungeon|cave|mine|crypt/)) return 'dungeon';
  if (b.match(/jungle|temple|dinosaur|tropical/)) return 'jungle';
  return 'peaceful';
}

// Expose globally
window._sound = {
  SFX,
  init,
  setMasterVolume, setMusicVolume, setSFXVolume, setAmbientVolume,
  mute, unmute, toggleMute, isMuted,
  setMusicMood, updateMusic, updateAmbient, updateFootsteps,
  biomeToMood, biomeToAmbient,
};
