'use client';

// ── Config ──
export function getConfig() {
  if (typeof window === 'undefined') return {};
  const raw = localStorage.getItem('msi-config');
  return raw ? JSON.parse(raw) : {};
}
export function saveConfig(data) {
  const existing = getConfig();
  localStorage.setItem('msi-config', JSON.stringify({ ...existing, ...data }));
}

// ── Content Log (scripts + status) ──
export function getContentLog() {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem('msi-content');
  return raw ? JSON.parse(raw) : [];
}
export function saveContentLog(log) {
  localStorage.setItem('msi-content', JSON.stringify(log));
}
export function addContent(entry) {
  const log = getContentLog();
  log.unshift(entry);
  saveContentLog(log);
  return log;
}
export function updateContent(id, updates) {
  const log = getContentLog();
  const idx = log.findIndex(c => c.id === id);
  if (idx >= 0) log[idx] = { ...log[idx], ...updates };
  saveContentLog(log);
  return log;
}

// ── Image Library ──
export function getImageLibrary() {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem('msi-images');
  return raw ? JSON.parse(raw) : [];
}
export function addImage(entry) {
  const lib = getImageLibrary();
  lib.unshift(entry);
  localStorage.setItem('msi-images', JSON.stringify(lib));
  return lib;
}

// ── Script Generation (Opus 4.6) ──
export async function generateScript(apiKey, theme, platform) {
  const HOOKS = {
    'free-dating': ["Stop paying $30/month just to swipe right 💀", "Dating apps are scamming you.", "Why I deleted Tinder for THIS free app"],
    'speed-dating': ["I went on 5 dates in 25 minutes 🎥", "Speed dating from your couch hits different", "5 minutes. 1 video call. Instant chemistry."],
    'ai-matching': ["This app knows your personality better than you do", "AI matched me 94% compatible 🧠"],
    'international': ["Met someone from Tokyo at midnight 🌙", "Real-time flirt translation"],
    'games-fun': ["Never Have I Ever... on a dating app?? 🎮", "This dating app has GAMES inside"],
    'verification': ["No catfish zone ✅", "Selfie verified dating"],
    'dating-tips': ["3 signs they're into you on video dates", "First video date? Don't do THIS"],
    'gift-store': ["Send virtual gifts to your crush 🎁", "The gift store is insane"],
    'night-owl': ["3 AM and everyone's asleep except you 🦉", "Night shift workers deserve love too 💜", "Dating is impossible when your 9pm is everyone else's 9am", "POV: You just got off a 12-hour shift and the world is asleep", "The loneliest hour? 3 AM. Not anymore."],
  };
  const hooks = HOOKS[theme] || HOOKS['free-dating'];
  const hook = hooks[Math.floor(Math.random() * hooks.length)];

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'anthropic/claude-opus-4.6',
      messages: [{ role: 'user', content: `You are a viral short-form video scriptwriter for "Midnight Singles International" — a revolutionary FREE dating app.

Create a 15-second ${platform === 'youtube' ? 'YouTube Short' : 'TikTok'} script. Style: narrator voice-over with visuals showing real photorealistic people (diverse, attractive, natural looking) plus app UI, text overlays.

THEME: ${theme}
HOOK: "${hook}"

KEY SELLING POINTS:
- 100% FREE to use — no paywall
- Every new user gets 1 FREE video minute with signup
- Live video speed dating rooms (The Lounge 5min, Candlelight 10min, VIP verified-only)
- AI personality matching (Big Five traits)
- International with real-time translation
- Icebreaker games built in
- Virtual gift store
- Selfie verification (no catfish)

NIGHT OWL STRATEGY (use when theme is night-owl):
- Target night shift workers, nurses, security guards, bartenders, warehouse crews
- Emphasize: "dating is impossible when your schedule is flipped"
- Tone: empathetic, relatable, "we see you" energy
- Key message: Midnight Singles is where night owls find love
- Post times: 11pm-3am when the audience is actually scrolling

Return ONLY valid JSON:
{
  "hook": "narrator opens (2 sec)",
  "body": "narrator main content (8-10 sec)",
  "cta": "narrator call to action (3 sec)",
  "onScreenText": ["text overlay 1", "text overlay 2", "text overlay 3", "text overlay 4"],
  "imagePrompt": "Photorealistic image prompt — real diverse attractive people, cinematic, no AI distortion, perfect anatomy. Include setting/mood details.",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "caption": "post caption with emojis"
}` }],
      temperature: 0.9,
    }),
  });
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : { hook, body: content, cta: 'Download Midnight Singles International — free', hashtags: ['dating', 'midnightsingles'], caption: hook };
}

// ── Image Generation (GPT-5 Image Mini) ──
export async function generateImage(apiKey, prompt) {
  const fullPrompt = `Generate a photorealistic vertical 9:16 image. ${prompt}. Ultra realistic photography, cinematic lighting, perfect anatomy, no AI distortion or disfigurement, no deformed faces or hands. Shot on professional camera, shallow depth of field.`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-5-image-mini',
      messages: [{ role: 'user', content: fullPrompt }],
    }),
  });
  const data = await response.json();
  const msg = data.choices?.[0]?.message || {};
  const imgs = msg.images || [];
  if (imgs.length > 0) {
    const url = imgs[0]?.image_url?.url || '';
    if (url.startsWith('data:')) {
      return { success: true, dataUrl: url };
    }
  }
  return { success: false, error: 'No image returned' };
}

// ── Audio Library (ElevenLabs voiceovers) ──
export function getAudioLibrary() {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem('msi-audio');
  return raw ? JSON.parse(raw) : [];
}
export function addAudio(entry) {
  const lib = getAudioLibrary();
  lib.unshift(entry);
  localStorage.setItem('msi-audio', JSON.stringify(lib));
  return lib;
}
export function updateAudio(id, updates) {
  const lib = getAudioLibrary();
  const idx = lib.findIndex(a => a.id === id);
  if (idx >= 0) lib[idx] = { ...lib[idx], ...updates };
  localStorage.setItem('msi-audio', JSON.stringify(lib));
  return lib;
}
export function deleteAudio(id) {
  const lib = getAudioLibrary().filter(a => a.id !== id);
  localStorage.setItem('msi-audio', JSON.stringify(lib));
  return lib;
}
