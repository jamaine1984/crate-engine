// Crate Engine AI Worker — RAG + Model Fallback Chain
// Free tier first, paid fallback (gpt-4o-mini) only when all free models rate-limited
import { KB } from './kb.js';

// ── MODEL FALLBACK CHAIN ─────────────────────────────────────────────────────
// Tries each in order — skips on 429 rate limit, falls to next
const FREE_MODELS = [
  'google/gemini-2.0-flash-exp:free',           // Primary — fastest
  'google/gemini-2.0-flash-thinking-exp:free',  // Backup 1 — smarter
  'meta-llama/llama-3.1-8b-instruct:free',      // Backup 2 — reliable
  'qwen/qwen-2.5-7b-instruct:free',             // Backup 3 — good at instructions
  'google/gemma-2-9b-it:free',                  // Backup 4
  'mistralai/mistral-7b-instruct:free',         // Backup 5 — lightweight
];

const PAID_FALLBACK = 'openai/gpt-4o-mini'; // ~$0.15/1M tokens — last resort only

// ── RAG KEYWORD SEARCH ───────────────────────────────────────────────────────
function queryKB(input, topN = 8) {
  const q = input.toLowerCase();
  const words = q.split(/\W+/).filter(w => w.length > 3);

  const TOPIC_TRIGGERS = {
    fps:         ['first person','fps','mouselook','pointer lock'],
    tps:         ['third person','tps','over shoulder'],
    shooting:    ['shoot','gun','bullet','raycast','hitscan','fire','aim','ammo','reload'],
    water:       ['water','swim','ocean','river','lake','buoyancy','float','wave','underwater','pool'],
    dungeon:     ['dungeon','cave','underground','tunnel','mine','corridor'],
    interior:    ['interior','inside','building','house','room','door','enter','exit'],
    city:        ['city','town','street','road','block','skyscraper','urban','traffic','grid'],
    npc:         ['npc','crowd','pedestrian','character','citizen','person'],
    combat:      ['fight','combat','attack','sword','melee','parry','dodge','damage','health'],
    animation:   ['animation','blend','state machine','ik','foot','root motion','locomotion'],
    audio:       ['sound','audio','music','footstep','reverb','ambient','sfx'],
    networking:  ['multiplayer','network','lag','prediction','rollback','sync','server','client'],
    performance: ['performance','optimize','culling','lod','batching','instancing','gpu'],
    lighting:    ['light','shadow','bloom','ambient','global illumination','baked'],
    particles:   ['particle','vfx','explosion','fire','smoke','spark','effect'],
    inventory:   ['inventory','item','pickup','equip','slot','drag','drop','backpack'],
    dialogue:    ['dialogue','conversation','npc talk','quest','branch','choice'],
    procedural:  ['procedural','noise','perlin','biome','terrain','heightmap','generate'],
    physics:     ['physics','gravity','mass','collision','rigid','bounce','force'],
    vehicles:    ['car','vehicle','drive','truck','wheel','suspension','steering'],
    threejs:     ['three.js','threejs','webgl','shader','mesh','geometry','material'],
  };

  const scored = KB.map(chunk => {
    let score = 0;
    const fact = chunk.text.toLowerCase();
    const topic = chunk.t.toLowerCase();
    words.forEach(w => { if (fact.includes(w)) score += 2; });
    for (const [t, triggers] of Object.entries(TOPIC_TRIGGERS)) {
      if (triggers.some(tr => q.includes(tr))) {
        if (topic.startsWith(t)) score += 5;
      }
    }
    if (q.includes(topic.split('_')[0])) score += 3;
    return { ...chunk, score };
  });

  return scored
    .filter(c => c.score > 0)
    .sort((a,b) => b.score - a.score)
    .slice(0, topN)
    .map(c => `[${c.t}] ${c.text}`);
}

// ── SYSTEM PROMPT ────────────────────────────────────────────────────────────
const BASE_SYSTEM = `You are the AI brain of Crate Engine, a browser-based 3D game engine built on Three.js.
Help users build game worlds, cities, dungeons, interiors, combat systems, NPC AI, cameras, and more.

TWO MODES:
1. COMMAND MODE (default): Convert request into engine commands.
   Return: {"commands": ["cmd1", "cmd2"], "message": "brief friendly note", "mode": "command"}

2. KNOWLEDGE MODE: When user asks HOW something works or wants technical details.
   Return: {"commands": [], "message": "detailed answer with real values", "mode": "knowledge"}

AVAILABLE COMMANDS:
- play as [character] — knight, swat, soldier, casual, suit, witch, medieval, scifi, beach, spacesuit
- equip [weapon] — sword, axe, rifle, pistol, shotgun, bow, spear, hammer, dagger, katana, staff
- spawn [N] npcs / spawn [N] enemies / spawn npc woman / spawn npc man
- add [object] — buildings, trees, rocks, cars, furniture, props (2000+ models)
- build a city / build a dungeon / build a cave / build interior / build a house
- add water / add pool / add ocean / add river / add swimming
- fps mode / tps mode / add first person camera / add third person camera
- add shooting / add combat system / add melee combat / add inventory / add dialogue
- terrain [type] — flat, hills, mountains, desert, island, canyon
- water [preset] — calm, tropical, stormy, arctic, blood, lava, crystal
- time [period] — dawn, sunrise, noon, sunset, dusk, night, midnight
- make it rain / snow / fog / clear weather
- add traffic / add ai cars / add pedestrians / add crowd
- build city world / build downtown / add residential area / add roads
- add audio / add footsteps / add ambient sound / add spatial audio
- clear / save / load / heal / stats
- show [category] — weapons, buildings, characters, vehicles, trees

RULES:
1. ALWAYS return valid JSON
2. Break complex requests into multiple commands
3. Use KNOWLEDGE MODE with provided context when user asks technical questions
4. Be specific and friendly`;

function buildPrompt(input, facts) {
  if (!facts.length) return BASE_SYSTEM;
  return BASE_SYSTEM + `\n\nRELEVANT KNOWLEDGE (use these real values):\n${facts.map((f,i) => `${i+1}. ${f}`).join('\n')}`;
}

// ── CALL AI WITH FALLBACK CHAIN ───────────────────────────────────────────────
async function callAI(apiKey, messages, isAgent) {
  const maxTokens = isAgent ? 600 : 350;
  const modelsToTry = [...FREE_MODELS];
  let lastError = '';
  let usedPaid = false;

  for (const model of modelsToTry) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
          'HTTP-Referer': 'https://crateshipgames.com',
          'X-Title': 'Crate Engine AI',
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
      });

      if (res.status === 429) {
        lastError = `${model} rate limited`;
        console.warn(`[AI] ${model} rate limited, trying next...`);
        continue; // try next model
      }

      if (!res.ok) {
        lastError = `${model} error ${res.status}`;
        continue;
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      if (text) return { text, model, paid: false };

    } catch (e) {
      lastError = e.message;
      continue;
    }
  }

  // All free models exhausted — try paid gpt-4o-mini
  console.warn('[AI] All free models rate limited, falling back to gpt-4o-mini (paid)');
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'HTTP-Referer': 'https://crateshipgames.com',
        'X-Title': 'Crate Engine AI',
      },
      body: JSON.stringify({ model: PAID_FALLBACK, max_tokens: maxTokens, messages }),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      if (text) return { text, model: PAID_FALLBACK, paid: true };
    }
  } catch(e) {}

  return null; // everything failed
}

// ── CORS ─────────────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// ── MAIN HANDLER ─────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);

    if (url.pathname === '/stats') {
      return new Response(JSON.stringify({
        status: 'ok',
        kb_chunks: KB.length,
        free_models: FREE_MODELS.length,
        paid_fallback: PAID_FALLBACK,
        topics: [...new Set(KB.map(c => c.t))].sort(),
      }), { headers: CORS });
    }

    if (url.pathname === '/query-knowledge' && request.method === 'POST') {
      const { q } = await request.json();
      return new Response(JSON.stringify({ query: q, results: queryKB(q || '', 10) }), { headers: CORS });
    }

    // ── VISION ANALYZE — analyze game screenshot frames ──────────────────
    if (url.pathname === '/vision-analyze' && request.method === 'POST') {
      const { imageBase64, mimeType, game, aspect } = await request.json();
      const apiKey = env.OPENROUTER_API_KEY;
      if (!apiKey) return new Response(JSON.stringify({ error: 'no api key' }), { headers: CORS });
      
      const prompt = `You are a game design analyst. Analyze this ${game || 'game'} screenshot and extract concrete measurements and design patterns.

Focus on: ${aspect || 'building scale, road width, lighting color, atmosphere, player scale, distances'}

Return ONLY valid JSON like:
{
  "game": "${game || 'unknown'}",
  "aspect": "${aspect || 'general'}",
  "observations": [
    "building height appears ~X player heights tall",
    "road is approximately X lanes wide",
    "lighting color temperature: warm/cool, hex estimate",
    "fog density: none/light/heavy, starts at ~X units",
    "art style: realistic/stylized/cartoon/lowpoly",
    "key design patterns observed"
  ],
  "measurements": {
    "buildingHeightPlayers": 0,
    "roadWidthLanes": 0,
    "lightingTemp": "neutral",
    "fogDensity": "none",
    "artStyle": "realistic",
    "drawDistance": "medium"
  }
}`;

      try {
        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemini-2.0-flash-001',
            max_tokens: 600,
            messages: [{
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: 'data:' + (mimeType||'image/jpeg') + ';base64,' + imageBase64 } },
                { type: 'text', text: prompt }
              ]
            }]
          })
        });
        const data = await resp.json();
        const raw = data.choices?.[0]?.message?.content || '';
        if (!raw) return new Response(JSON.stringify({ ok: true, analysis: {}, debug: { status: resp.status, data } }), { headers: CORS });
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        let parsed = {};
        try { parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw }; } catch(pe) { parsed = { raw }; }
        return new Response(JSON.stringify({ ok: true, analysis: parsed }), { headers: CORS });
      } catch(e) {
        return new Response(JSON.stringify({ error: e.message }), { headers: CORS });
      }
    }

    if (request.method !== 'POST') return new Response('POST only', { status: 405 });

    try {
      const body = await request.json();
      const input = body.input || body.message || body.text || '';
      const apiKey = body.apiKey || env.OPENROUTER_API_KEY;
      const isAgent = body.agent === true || body.mode === 'agent';

      if (!input) return new Response(JSON.stringify({ commands: [], message: 'What would you like to build?' }), { headers: CORS });

      const facts = queryKB(input);
      const systemPrompt = buildPrompt(input, facts);

      if (!apiKey) {
        return new Response(JSON.stringify({ commands: [input], message: 'Running...', kb_hits: facts.length }), { headers: CORS });
      }

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input },
      ];

      const result = await callAI(apiKey, messages, isAgent);

      if (!result) {
        return new Response(JSON.stringify({ commands: [input], message: 'Running...', kb_hits: facts.length }), { headers: CORS });
      }

      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        parsed.kb_hits = facts.length;
        parsed.model_used = result.model;
        parsed.used_paid = result.paid;
        return new Response(JSON.stringify(parsed), { headers: CORS });
      }

      return new Response(JSON.stringify({
        commands: [input],
        message: result.text.slice(0, 300),
        kb_hits: facts.length,
        model_used: result.model,
      }), { headers: CORS });

    } catch (err) {
      return new Response(JSON.stringify({ commands: [], message: 'Error: ' + err.message }), { status: 500, headers: CORS });
    }
  }
};
