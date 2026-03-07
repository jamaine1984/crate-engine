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

// ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────
const BASE_SYSTEM = `You are the AI brain of Crate Engine — a browser 3D game engine built on Three.js.
You help users build complete game worlds using engine commands.

RESPONSE FORMAT — always return valid JSON:
{"commands": ["cmd1", "cmd2", ...], "message": "friendly note", "mode": "command"}
{"commands": [], "message": "technical answer", "mode": "knowledge"}

COMPLETE ENGINE COMMAND REFERENCE:

=== WORLD & TERRAIN ===
terrain flat / terrain hills / terrain mountains / terrain desert / terrain island / terrain canyon / terrain volcanic / terrain arctic
ground grass / ground dirt / ground sand / ground snow / ground stone / ground concrete / ground lava / ground marble
mountains / rolling hills / canyon / volcano / desert dunes / arctic plains
generate desert city / generate snow city / generate jungle city / generate swamp city

=== SKY & LIGHTING ===
time dawn / time sunrise / time morning / time noon / time afternoon / time sunset / time dusk / time night / time midnight
aaa sky / realistic sky / sunrise / sunset
set ambient [0-1] / ambient brightness [0-1]
bloom on / bloom off / bloom [0-5]
grain [0-1]

=== WEATHER & ATMOSPHERE ===
fog on / fog off / fog [density 0.001-0.05]
make it rain / snow / clear weather / stop rain
particles dust / particles fireflies / particles embers / particles ash / particles leaves

=== CHARACTERS & NPCs ===
play as knight / swat / soldier / casual / suit / witch / medieval / scifi / beach / spacesuit
equip sword / axe / rifle / pistol / shotgun / bow / spear / hammer / dagger / katana / staff / scythe
spawn [N] npcs / spawn [N] enemies / spawn [N] guards / spawn npc zombie / spawn npc woman / spawn npc man
add npc [type] at [x,y,z]

=== BUILDINGS & STRUCTURES ===
add modern house / add modern house 2 floors
build a city / build downtown / build residential area / build a dungeon / build a cave / build interior
add skyscraper / add tower / add castle / add ruins
add traffic light / add street lamp / add fire hydrant

=== PROPS & MODELS ===
add [model name] — 3400+ models: furniture, weapons, vehicles, nature, fantasy, sci-fi, medieval, pirate, etc.
add tree / add pine tree / add palm tree / add rock / add boulder
add car / add taxi / add police car / add ambulance
add chest / add barrel / add crate / add torch / add campfire
add bench / add table / add chair / add bookshelf / add bed

=== VEHICLES ===
add car / drive car / add vehicle [type]
add traffic / add ai cars / add pedestrians

=== WATER ===
add water / add ocean / add river / add pool / add lake / add swimming
water calm / water tropical / water stormy / water arctic / water blood / water lava / water crystal

=== SYSTEMS ===
fps mode / tps mode
add shooting / add combat system / add melee combat
add inventory / add dialogue / add quests
add audio / add footsteps / add ambient sound / add spatial audio
add first person camera / add third person camera / add cinematic camera

=== GAME PRESETS ===
zombie game / racing mode / rpg mode / survival mode / fps mode / horror mode / city builder / sandbox

=== WORLD GEN ===
build a town / add roads / add residential area / add commercial area / add park
auto town / generate world

=== UTILITY ===
clear / save / load / heal / stats
show buildings / show weapons / show characters / show vehicles / show trees

AGENTIC WORLD BUILDING RULES:
1. For complex world requests ("make a Dark Souls area"), output 8-15 commands that BUILD the full scene
2. Order: terrain → sky/time → atmosphere → structures → props → npcs → systems
3. Use REAL coordinates. Spread buildings/NPCs across x/z (-100 to 100 range)
4. Use knowledge context to pick authentic values (fog density, time of day, prop types)
5. Never output the same command twice. Build complete, layered worlds.
6. For game-style requests, set the full atmosphere first, then populate
`;

// ── AGENTIC WORLD BUILDER ──────────────────────────────────────────────────
function buildAgentPrompt(input, facts) {
  const knowledgeBlock = facts.length > 0
    ? `\n\nRELEVANT GAME DESIGN KNOWLEDGE (use these for authentic values):\n${facts.map((f,i) => `${i+1}. ${typeof f === 'object' ? f.text : f}`).join('\n').substring(0, 3000)}`
    : '';

  return BASE_SYSTEM + knowledgeBlock + `\n\nUser request: "${input}"\n\nBuild a complete, immersive scene. Return 8-15 commands that fully realize this world. Use the knowledge above for authentic values (fog density, prop spacing, time of day, etc).`;
}

function buildPrompt(input, facts) {
  if (!facts.length) return BASE_SYSTEM;
  const factTexts = facts.map((f,i) => `${i+1}. ${typeof f === 'object' ? f.text : f}`).join('\n').substring(0, 2000);
  return BASE_SYSTEM + `\n\nRELEVANT KNOWLEDGE:\n${factTexts}`;
}

// ── CALL AI WITH FALLBACK CHAIN ───────────────────────────────────────────────
async function callAI(apiKey, messages, isAgent, isWorldBuild = false) {
  const maxTokens = isAgent ? 800 : (isWorldBuild ? 600 : 400);
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


    // === /embed — generate text embedding ===
    if (url.pathname === '/embed' && request.method === 'POST') {
      const { text } = await request.json();
      if (!text) return new Response(JSON.stringify({ ok: false, error: 'no text' }), { headers: CORS });
      const embResp = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'openai/text-embedding-3-small', input: text.substring(0, 8192) })
      });
      const embData = await embResp.json();
      const embedding = embData?.data?.[0]?.embedding;
      if (!embedding) return new Response(JSON.stringify({ ok: false, error: embData }), { headers: CORS });
      return new Response(JSON.stringify({ ok: true, embedding }), { headers: CORS });
    }

    // === /vector-search — semantic search via Vectorize ===
    if (url.pathname === '/vector-search' && request.method === 'POST') {
      const { q, topK = 8 } = await request.json();
      if (!q) return new Response(JSON.stringify({ ok: false, error: 'no query' }), { headers: CORS });
      if (!env.VECTORIZE) return new Response(JSON.stringify({ ok: false, error: 'vectorize not bound' }), { headers: CORS });
      const embResp2 = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'openai/text-embedding-3-small', input: q.substring(0, 8192) })
      });
      const embData2 = await embResp2.json();
      const queryVec = embData2?.data?.[0]?.embedding;
      if (!queryVec) return new Response(JSON.stringify({ ok: false, error: 'embed failed' }), { headers: CORS });
      const vResults = await env.VECTORIZE.query(queryVec, { topK, returnMetadata: 'all' });
      return new Response(JSON.stringify({ ok: true, results: vResults.matches }), { headers: CORS });
    }

    if (request.method !== 'POST') return new Response('POST only', { status: 405 });

    try {
      const body = await request.json();
      const input = body.input || body.message || body.text || '';
      const apiKey = body.apiKey || env.OPENROUTER_API_KEY;
      const isAgent = body.agent === true || body.mode === 'agent';

      if (!input) return new Response(JSON.stringify({ commands: [], message: 'What would you like to build?' }), { headers: CORS });

      // Vector search (semantic) → keyword fallback
      let facts = [];
      if (env.VECTORIZE) {
        try {
          const _embR = await fetch('https://openrouter.ai/api/v1/embeddings', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'openai/text-embedding-3-small', input: input.substring(0, 8192) })
          });
          const _embD = await _embR.json();
          const _qVec = _embD?.data?.[0]?.embedding;
          if (_qVec) {
            const _vRes = await env.VECTORIZE.query(_qVec, { topK: 10, returnMetadata: 'all' });
            facts = (_vRes.matches || []).filter(m => m.score > 0.35).map(m => ({ t: m.metadata?.topic || '', text: m.metadata?.text || '' }));
          }
        } catch(_e) {}
      }
      if (facts.length === 0) facts = queryKB(input);
      // Detect agentic world-building requests (complex scene descriptions)
      const isWorldBuild = /make|build|create|generate|design|set up|construct/i.test(input) &&
        /world|scene|area|environment|level|map|zone|city|dungeon|forest|village|realm|land|biome/i.test(input) ||
        /dark souls|elden ring|minecraft|fortnite|gta|resident evil|cyberpunk|skyrim|horror|soulslike/i.test(input) ||
        /atmosphere|style|vibe|feel like|themed/i.test(input);
      const systemPrompt = isWorldBuild ? buildAgentPrompt(input, facts.map ? facts : facts) : buildPrompt(input, facts);

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
