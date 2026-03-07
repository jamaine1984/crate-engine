// Crate Engine AI Worker — RAG-powered (943 knowledge chunks)
import { KB } from './kb.js';

// ── KEYWORD SEARCH ───────────────────────────────────────────────────────────
function queryKB(input, topN = 8) {
  const q = input.toLowerCase();
  const words = q.split(/\W+/).filter(w => w.length > 3);

  const TOPIC_TRIGGERS = {
    fps:         ['first person','fps','mouselook','pointer lock'],
    tps:         ['third person','tps','over shoulder','behind player'],
    shooting:    ['shoot','gun','bullet','raycast','hitscan','fire','aim','ammo','reload'],
    water:       ['water','swim','ocean','river','lake','buoyancy','float','wave','underwater','pool'],
    dungeon:     ['dungeon','cave','underground','tunnel','mine','corridor','cellar'],
    interior:    ['interior','inside','building','house','room','door','enter','exit'],
    city:        ['city','town','street','road','block','skyscraper','urban','traffic','grid'],
    npc:         ['npc','crowd','pedestrian','character','citizen','person','people','ai npc'],
    combat:      ['fight','combat','attack','sword','melee','parry','dodge','hit','damage','health'],
    animation:   ['animation','blend','state machine','ik','foot','root motion','locomotion'],
    audio:       ['sound','audio','music','footstep','reverb','ambient','sfx','3d sound'],
    networking:  ['multiplayer','network','lag','prediction','rollback','sync','server','client'],
    performance: ['performance','fps','optimize','culling','lod','batching','instancing','gpu'],
    lighting:    ['light','shadow','bloom','ambient','global illumination','gi','baked'],
    particles:   ['particle','vfx','explosion','fire','smoke','spark','effect','burst'],
    inventory:   ['inventory','item','pickup','equip','slot','drag','drop','backpack'],
    dialogue:    ['dialogue','conversation','npc talk','quest','branch','choice','response'],
    procedural:  ['procedural','noise','perlin','biome','terrain','heightmap','generate'],
    physics:     ['physics','gravity','mass','collision','rigid','bounce','force','velocity'],
    vehicles:    ['car','vehicle','drive','truck','wheel','suspension','steering'],
    threejs:     ['three.js','threejs','webgl','shader','mesh','geometry','material'],
  };

  const scored = KB.map(chunk => {
    let score = 0;
    const fact = chunk.f.toLowerCase();
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
    .map(c => `[${c.t}] ${c.f}`);
}

// ── SYSTEM PROMPT ────────────────────────────────────────────────────────────
const BASE_SYSTEM = `You are the AI brain of Crate Engine, a browser-based 3D game engine built on Three.js.
You help users build game worlds, cities, dungeons, interiors, combat systems, NPC AI, and more.

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
- add water / add pool / add ocean / add river
- fps mode / tps mode / add first person camera / add third person camera
- add shooting / add combat system / add melee combat
- add swimming / add buoyancy / water physics
- add audio / add footsteps / add ambient sound
- add inventory / add dialogue system
- terrain [type] — flat, hills, mountains, desert, island, canyon
- water [preset] — calm, tropical, stormy, arctic, blood, lava, crystal
- time [period] — dawn, sunrise, noon, sunset, dusk, night, midnight
- make it rain / snow / fog / clear weather
- add traffic / add ai cars / add pedestrians / add crowd
- build city world / build downtown / add residential area / add roads
- clear / save / load / heal / stats
- show [category] — weapons, buildings, characters, vehicles, trees

RULES:
1. ALWAYS return valid JSON
2. Break complex requests into multiple commands
3. Use KNOWLEDGE MODE with provided context facts when user asks technical questions
4. Be specific and friendly in message field`;

function buildPrompt(input, facts) {
  if (!facts.length) return BASE_SYSTEM;
  return BASE_SYSTEM + `\n\nRELEVANT KNOWLEDGE (use these real values in your response):\n${facts.map((f,i) => `${i+1}. ${f}`).join('\n')}`;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// ── HANDLER ──────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);

    // Stats
    if (url.pathname === '/stats') {
      const topics = [...new Set(KB.map(c => c.t))].sort();
      return new Response(JSON.stringify({ status: 'ok', kb_chunks: KB.length, topics }), { headers: CORS });
    }

    // Direct KB query
    if (url.pathname === '/query-knowledge' && request.method === 'POST') {
      const { q } = await request.json();
      return new Response(JSON.stringify({ query: q, results: queryKB(q || '', 10) }), { headers: CORS });
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

      const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
          'HTTP-Referer': 'https://crateshipgames.com',
          'X-Title': 'Crate Engine AI',
        },
        body: JSON.stringify({
          model: isAgent ? 'google/gemini-2.0-flash-thinking-exp:free' : 'google/gemini-2.0-flash-exp:free',
          max_tokens: isAgent ? 600 : 350,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: input }
          ]
        })
      });

      if (!aiRes.ok) {
        return new Response(JSON.stringify({ commands: [input], message: 'Running...', kb_hits: facts.length }), { headers: CORS });
      }

      const data = await aiRes.json();
      const text = data.choices?.[0]?.message?.content || '{}';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        parsed.kb_hits = facts.length;
        return new Response(JSON.stringify(parsed), { headers: CORS });
      }
      return new Response(JSON.stringify({ commands: [input], message: text.slice(0, 300), kb_hits: facts.length }), { headers: CORS });

    } catch (err) {
      return new Response(JSON.stringify({ commands: [], message: 'Error: ' + err.message }), { status: 500, headers: CORS });
    }
  }
};
