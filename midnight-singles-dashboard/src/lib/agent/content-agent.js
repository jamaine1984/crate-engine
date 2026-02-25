/**
 * Midnight Singles International — Content Marketing Agent
 * 
 * Generates daily content for YouTube Shorts & TikTok:
 * 1. Script generation (OpenRouter LLM)
 * 2. Image generation (OpenRouter FLUX/SDXL)
 * 3. Video generation (SeedDance 2.0 / fallback)
 * 4. Scheduling & posting
 */

const CONTENT_THEMES = [
  {
    id: 'free-dating',
    name: 'Free Dating Revolution',
    hooks: [
      "Stop paying $30/month just to swipe right 💀",
      "Dating apps are scamming you. Here's proof.",
      "Why I deleted Tinder for THIS free app",
      "Every feature that costs $$ on Tinder? Free here.",
      "Dating shouldn't cost money. Period.",
    ],
    style: 'comparison / value prop',
    platforms: ['youtube', 'tiktok'],
  },
  {
    id: 'speed-dating',
    name: 'Video Speed Dating',
    hooks: [
      "I went on 5 dates in 25 minutes 🎥",
      "Speed dating from your couch hits different",
      "The Candlelight Room changed my love life",
      "5 minutes. 1 video call. Instant chemistry check.",
      "POV: You just matched in a speed dating room",
    ],
    style: 'showcase / storytelling',
    platforms: ['youtube', 'tiktok'],
  },
  {
    id: 'ai-matching',
    name: 'AI Personality Matching',
    hooks: [
      "This app knows your personality better than you do",
      "AI matched me with someone 94% compatible 🧠",
      "Big Five personality matching > swiping on looks",
      "The algorithm that actually understands you",
    ],
    style: 'educational / wow factor',
    platforms: ['youtube', 'tiktok'],
  },
  {
    id: 'international',
    name: 'International Connections',
    hooks: [
      "Met someone from Tokyo at midnight 🌙",
      "This app translates your flirting in real-time",
      "Dating with no borders. Literally.",
      "International dating just got easy",
    ],
    style: 'aspirational / lifestyle',
    platforms: ['youtube', 'tiktok'],
  },
  {
    id: 'games-fun',
    name: 'Icebreaker Games',
    hooks: [
      "Never Have I Ever... on a dating app?? 🎮",
      "This dating app has GAMES inside",
      "Would You Rather: dating edition hits different",
      "Breaking the ice has never been this fun",
    ],
    style: 'fun / engagement',
    platforms: ['tiktok'],
  },
  {
    id: 'verification',
    name: 'Real People Only',
    hooks: [
      "No catfish zone ✅ Selfie verified only",
      "This is what verified dating looks like",
      "Tired of fake profiles? This app fixes that.",
    ],
    style: 'trust / safety',
    platforms: ['youtube', 'tiktok'],
  },
  {
    id: 'gift-store',
    name: 'Virtual Gifts',
    hooks: [
      "Send virtual gifts to your crush 🎁",
      "The gift store in this dating app is insane",
      "Showing love before the first date",
    ],
    style: 'feature showcase',
    platforms: ['tiktok'],
  },
  {
    id: 'dating-tips',
    name: 'Dating Advice',
    hooks: [
      "3 signs they're actually into you on video dates",
      "First video date? Here's what NOT to do",
      "The #1 mistake people make on dating apps",
      "How to stand out on a dating app (without being cringe)",
    ],
    style: 'educational / advice',
    platforms: ['youtube', 'tiktok'],
  },
];

const POSTING_SCHEDULE = {
  // PST times
  youtube: ['10:00', '18:00'],        // 2 YouTube Shorts/day
  tiktok: ['12:00', '16:00', '21:00'], // 3 TikToks/day
};

const IMAGE_STYLES = {
  dark_luxury: 'Dark luxury aesthetic, midnight purple and gold tones, sleek modern dating app UI, premium feel, dark background with soft glow',
  lifestyle: 'Diverse attractive young adults, warm lighting, candlelit atmosphere, romantic modern setting, cinematic',
  tech_modern: 'Futuristic UI mockup, holographic elements, AI visualization, dark theme with neon accents',
  fun_playful: 'Bright colorful, playful dating vibe, emoji style, gen-z aesthetic, bold text overlays',
};

/**
 * Generate a content script using OpenRouter
 */
async function generateScript(apiKey, theme, platform) {
  const selectedTheme = CONTENT_THEMES.find(t => t.id === theme) || CONTENT_THEMES[0];
  const hook = selectedTheme.hooks[Math.floor(Math.random() * selectedTheme.hooks.length)];

  const prompt = `You are a viral content creator for "Midnight Singles International" — a revolutionary FREE dating app with VIDEO SPEED DATING.

Create a ${platform === 'youtube' ? '15-second YouTube Short' : '15-second TikTok'} script.

THEME: ${selectedTheme.name}
STYLE: ${selectedTheme.style}
HOOK: "${hook}"

APP KEY FEATURES:
- 100% free core (no paywall to match & chat)
- Live video speed dating rooms (The Lounge 5min, Candlelight 10min, VIP verified-only)
- AI matching with Big Five personality traits
- International with real-time translation
- Icebreaker games (Never Have I Ever, Would You Rather, Two Truths)
- Virtual gift store
- Selfie verification (no catfish)
- Social feed (Midnight Feed)
- Horoscope compatibility

FORMAT YOUR RESPONSE AS JSON:
{
  "hook": "opening line (first 2 seconds)",
  "body": "main content (8-10 seconds)",
  "cta": "call to action (last 3 seconds)",
  "onScreenText": ["text overlay 1", "text overlay 2", "text overlay 3"],
  "imagePrompt": "detailed prompt for AI image generation to use as video background/thumbnail",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "caption": "post caption with emojis"
}`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
    }),
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  return { raw: content };
}

/**
 * Generate an image using OpenRouter
 */
async function generateImage(apiKey, prompt, style = 'dark_luxury') {
  const fullPrompt = `${prompt}. ${IMAGE_STYLES[style] || IMAGE_STYLES.dark_luxury}`;

  // Try FLUX through OpenRouter
  const response = await fetch('https://openrouter.ai/api/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'black-forest-labs/flux-1.1-pro',
      prompt: fullPrompt,
      n: 1,
      size: '1080x1920', // Vertical for shorts/tiktok
    }),
  });

  return await response.json();
}

/**
 * Generate daily content batch
 */
async function generateDailyBatch(apiKey) {
  const today = new Date().toISOString().split('T')[0];
  const batch = [];

  // Pick themes for today (rotate through themes)
  const dayOfWeek = new Date().getDay();
  const themePool = [...CONTENT_THEMES].sort(() => Math.random() - 0.5);

  // 2 YouTube Shorts
  for (let i = 0; i < 2; i++) {
    const theme = themePool[i % themePool.length];
    if (theme.platforms.includes('youtube')) {
      const script = await generateScript(apiKey, theme.id, 'youtube');
      batch.push({
        id: `yt-${today}-${i}`,
        platform: 'youtube',
        theme: theme.id,
        script,
        scheduledTime: POSTING_SCHEDULE.youtube[i],
        status: 'generated',
        date: today,
      });
    }
  }

  // 3 TikToks
  for (let i = 0; i < 3; i++) {
    const theme = themePool[(i + 2) % themePool.length];
    if (theme.platforms.includes('tiktok')) {
      const script = await generateScript(apiKey, theme.id, 'tiktok');
      batch.push({
        id: `tt-${today}-${i}`,
        platform: 'tiktok',
        theme: theme.id,
        script,
        scheduledTime: POSTING_SCHEDULE.tiktok[i],
        status: 'generated',
        date: today,
      });
    }
  }

  return batch;
}

module.exports = {
  CONTENT_THEMES,
  POSTING_SCHEDULE,
  IMAGE_STYLES,
  generateScript,
  generateImage,
  generateDailyBatch,
};
