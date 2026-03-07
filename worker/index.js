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
ground grass / ground dirt / ground sand / ground snow / ground stone / ground concrete / ground lava
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

=== PROPS & MODELS (857 Unity + 3400 base models available) ===
add [model name] — use any alias below or unity_ prefix names

SMART MODEL ALIASES BY SCENE TYPE:
- FLOODED/POST-APOC: add unity_villa1_ext_b, add unity_bld_bridge_a, add unity_church1_mid_a, add unity_barn2_mid_a, add unity_lo_prop_car_a, add zombie
- TOON CITY: add toon_apartment, add toon_city_hall, add helicopter, add toon_park, add toon_ambulance, add unity_cb_apartment_h
- SPACE/SCI-FI: add space_fighter, add spaceship, add unity_capitalship_shield, add unity_spacefighter_wing, add space_rifle
- MEDIEVAL/FANTASY: add knight_character, add dark_knight, add unity_pt_pine_tree_03_green, add unity_pt_wooden_bridge_02, add unity_sword5_3
- FPS WEAPONS: add unity_akm, add unity_revolver, add unity_crossbow, add pistol, add medieval_sword_fps
- NATURE/FOLIAGE: add infini_twist_tree, add fern, add infini_mushrooms, add unity_pt_ore_rock_01
- VEHICLES: add touring_race_car, add unity_lo_prop_car_a, add toon_ambulance
- HORROR: add zombie, add unity_villa1_ext_b, add unity_church1_mid_a + fog heavy + time midnight
- NPC ANIMATIONS: add unity_humanm_combatidle01, add unity_humanf_straferun01_forwardright

NATURAL LANGUAGE MODEL MATCHING:
spaceship/spacecraft = space_fighter | race car = touring_race_car | knight = knight_character
zombie = zombie | pistol/handgun = pistol | shotgun = unity_fp_doublebarlshotgun
rifle/ak47 = unity_akm | fern = infini_fern | mushroom = infini_mushrooms
helicopter = helicopter | apartment = toon_apartment | church = unity_church1_mid_a
barn = unity_barn2_mid_a | bridge = unity_bld_bridge_a | villa = unity_villa1_ext_b

=== USER CUSTOM MODEL IMPORT ===
import model [URL] - loads any GLB from a public URL
import my model - opens file picker for local GLB upload
load model from [URL] - alias for import model
use my model as [name] - registers uploaded model with custom alias  
place my model - places last imported model in scene
When user mentions "my model", "custom model", "my own 3D file" - use import commands

=== VEHICLES ===
add car / drive car / add vehicle [type]
add traffic / add ai cars / add pedestrians

=== WATER ===
add water / add ocean / add river / add pool / add lake
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


=== COMPLETE GAME SYSTEMS — AI KNOWS ALL OF THESE ===

--- INVENTORY & ITEMS ---
add inventory / open inventory / inventory grid [4x4]
add item [name] to inventory / add [weapon] to inventory
inventory hotbar / show backpack / add loot system
equip [item] / unequip / drop item / use item
add crafting / add crafting table / add crafting menu
add shop / add vendor / add buy menu / add sell menu
add health potion / add stamina item / add armor item

--- NPC DIALOGUE SYSTEM ---
add npc dialogue / enable dialogue system
npc say [text] / npc [name] say [text]
add quest giver npc / add shopkeeper npc / add guard npc / add merchant npc
dialogue tree [name] / add dialogue option [text]
npc [name] has quest [quest name]
add friendly npc / add hostile npc / add neutral npc
npc talk range [meters] / interact with npc
add npc voice / npc speak [line]
spawn npc [type] at [x,y,z] with name [name]
add conversation [npc] / add cutscene dialogue

--- MENUS & UI SCREENS ---
add main menu / show main menu / title screen
add pause menu / show pause menu (Esc to open)
add settings menu / add options menu
add game over screen / add death screen / add respawn screen
add victory screen / add win screen / add level complete screen
add loading screen / add splash screen
add credits screen / add about screen
add HUD / hide HUD / toggle HUD
add crosshair / hide crosshair / crosshair [dot/cross/circle]
add minimap / hide minimap / minimap size [small/large]
add compass / add radar
add health bar / add stamina bar / add ammo counter
add kill counter / add score display / add timer / add wave counter
add xp bar / add level indicator / add money display
add status effects display / add buff icons

--- WIN & LOSE CONDITIONS ---
add win condition / set win condition
win if kill [N] enemies / win if collect [N] items / win if reach [location]
win if survive [N] seconds / win if score [N] points
add lose condition / lose if health reaches 0
lose if time runs out / add timer countdown [seconds]
add checkpoint / add respawn point / auto save
add lives system / set lives [N]
add score system / add high score / add leaderboard

--- AUDIO & MUSIC ---
add background music / play music [style: epic/calm/horror/action/ambient]
add ambient sound / stop music / fade music out
add footstep sounds / footsteps on/off
add combat sounds / add explosion sounds / add weapon sounds
add spatial audio / audio range [meters]
add rain sound / add wind sound / add crowd sound
add voice line [text] / add subtitle [text]
mute / unmute / volume [0-1]

--- CUTSCENES & CINEMATICS ---
add cutscene / start cutscene / end cutscene
cinematic mode / letterbox on/off
camera pan to [x,y,z] in [seconds]
camera orbit / camera fly through
add intro cutscene / add outro cutscene
add slow motion / slow motion [0.1-1.0] / normal speed
freeze frame / add black fade / add white fade

--- QUESTS & PROGRESSION ---
add quest / add quest [name]
quest objective: kill [N] [enemy type]
quest objective: collect [N] [item]
quest objective: reach [location]
quest reward: [item] / quest reward: [XP amount]
complete quest / fail quest / abandon quest
add skill tree / add abilities / add power up
add experience system / add leveling / gain xp [amount]
add achievement / unlock achievement [name]

--- SAVE & LOAD ---
save game / load game / new game
add checkpoint / add save point
auto save on / auto save off
export world / share world

--- POLISH COMMANDS ---
VISUAL QUALITY:
graphics low / graphics medium / graphics high / graphics ultra
anti-aliasing on / anti-aliasing off / fxaa / smaa
ssao on / ssao off (ambient occlusion)
shadow quality low/medium/high/ultra
lod on / lod off (level of detail)
performance mode / quality mode

POST-PROCESSING:
bloom on / bloom off / bloom [0-5]
vignette [0-1] (edge darkening)
chromatic aberration [0-0.01] (lens distortion)
grain [0-1] (film grain)
depth of field on / dof off / dof focus [distance]
motion blur on / motion blur off
color grade cinematic / color grade warm / color grade cool / color grade horror / color grade noir / color grade vivid
contrast [0.5-2.0] / saturation [0-2] / brightness [0-2]
sharpness [0-1]

ATMOSPHERE POLISH:
fog [density] / fog color [hex]
ambient brightness [0-2]
sun intensity [0-5] / sun color [hex]
shadow softness [0-5]
particles dust / particles fireflies / particles embers / particles ash / particles leaves / particles snow / particles rain
add god rays / disable god rays
add lens flare / disable lens flare

--- MULTIPLAYER ---
multiplayer / join [room] / host game / create room
add multiplayer / sync players / add netcode
chat [message] / broadcast [message]

--- PERFORMANCE & OPTIMIZATION ---
performance mode (disables expensive effects)
quality preset low/medium/high/ultra
limit fps [30/60/120/unlimited]
show stats / hide stats / fps counter on
clear cache / optimize scene / reduce draw calls

=== WHAT A COMPLETE GAME NEEDS (AI CHECKLIST) ===
A complete game requires:
1. WORLD — terrain, sky, lighting, atmosphere
2. PLAYER — character, controls, camera mode (fps/tps)
3. COMBAT — weapons, enemies, health system
4. PROGRESSION — quests, inventory, leveling, saves
5. UI — HUD, inventory screen, pause menu, main menu
6. AUDIO — music, ambient, SFX
7. STORY — NPC dialogue, cutscenes, objectives
8. POLISH — post-processing, performance tuning, game over/win screens
9. FEEL — screen shake, hit effects, particles, slow-mo moments

When building complete games, output commands that cover ALL 9 categories.

AGENTIC WORLD BUILDING RULES:
1. For complex world requests output 8-15 commands that BUILD the full scene
2. Order: terrain -> sky/time -> fog/atmosphere -> structures -> props -> npcs -> systems
3. Use REAL coordinates. Spread buildings/NPCs across x/z (-100 to 100 range)
4. Match model aesthetic to scene: toon models for cartoon worlds, flooded models for destroyed look, space kit for sci-fi
5. Use knowledge context to pick authentic values (fog density, time of day, prop types)
6. Never output the same command twice. Build complete, layered worlds.
7. For game-style requests, set the full atmosphere first, then populate
8. Open natural language: if user asks for anything specific (a fern, a spaceship, an AK47) - use the exact matching model
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

// ── CLARIFYING QUESTION SYSTEM ───────────────────────────────────────────────
function needsClarification(input) {
  const ambiguous = [
    { test: /build.*city|create.*city|make.*city/i, q: "city_style", ask: "What style city? Reply: toon (colorful/low-poly) or realistic (detailed buildings)" },
    { test: /build.*world|create.*world|make.*world/i, q: "world_style", ask: "What style? Reply: modern, medieval, sci-fi, fantasy, horror, post-apocalyptic, or toon" },
    { test: /add.*building|place.*building/i, q: "building_style", ask: "What style building? Reply: modern, toon, medieval, flooded, or sci-fi" },
    { test: /add.*character|spawn.*character|add.*person/i, q: "char_style", ask: "What kind? Reply: knight, zombie, soldier, civilian, or describe them" },
  ];
  for (const rule of ambiguous) {
    if (rule.test.test(input)) return rule.ask;
  }
  return null;
}

// ── SMART ITEM SELECTION ─────────────────────────────────────────────────────
function resolveSmartModel(input) {
  const lower = input.toLowerCase();
  // Vehicles
  if (/race car|racing car|touring car/.test(lower)) return 'touring_race_car';
  if (/spaceship|space ship|space craft|spacecraft/.test(lower)) return 'space_fighter';
  if (/helicopter/.test(lower)) return 'helicopter';
  if (/ambulance/.test(lower)) return 'toon_ambulance';
  // Weapons
  if (/ak47|akm|assault rifle/.test(lower)) return 'unity_akm';
  if (/shotgun|double barrel/.test(lower)) return 'unity_fp_doublebarlshotgun';
  if (/sniper|hunting rifle/.test(lower)) return 'unity_fp_huntingrifle';
  if (/revolver/.test(lower)) return 'unity_revolver';
  if (/crossbow/.test(lower)) return 'unity_crossbow';
  if (/pistol|handgun|9mm/.test(lower)) return 'pistol';
  // Characters
  if (/zombie/.test(lower)) return 'zombie';
  if (/knight/.test(lower)) return 'knight_character';
  if (/dark knight/.test(lower)) return 'dark_knight';
  // Buildings - style aware
  if (/toon.*building|cartoon.*building/.test(lower)) return 'toon_apartment';
  if (/flooded.*building|destroyed.*building/.test(lower)) return 'unity_villa1_ext_b';
  if (/church/.test(lower)) return 'unity_church1_mid_a';
  if (/barn/.test(lower)) return 'unity_barn2_mid_a';
  if (/bridge/.test(lower)) return 'unity_bld_bridge_a';
  if (/villa/.test(lower)) return 'unity_villa2_ext_a';
  // Nature
  if (/fern/.test(lower)) return 'infini_fern';
  if (/mushroom/.test(lower)) return 'infini_mushrooms';
  if (/pine tree/.test(lower)) return 'unity_pt_pine_tree_03_green';
  if (/twisted.*tree|twist.*pine/.test(lower)) return 'infini_twist_tree';
  // Space parts
  if (/capital ship/.test(lower)) return 'unity_capitalship_shield';
  if (/space.*gun|space.*rifle/.test(lower)) return 'space_rifle';
  return null;
}
// ── END SMART SELECTION ───────────────────────────────────────────────────────

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
      // Check if we need to clarify style before building
      const clarifyMsg = needsClarification(input);
      if (clarifyMsg && !input.includes('toon') && !input.includes('realistic') && !input.includes('modern') && !input.includes('low poly') && !input.includes('medieval') && !input.includes('sci-fi') && !input.includes('fantasy') && !input.includes('horror') && !input.includes('zombie') && !input.includes('space')) {
        // Only ask once - if they already specified a style, skip
        // For single item adds, skip clarification (only for world builds)
        const isBigBuild = /build.*world|create.*world|make.*world|build.*city|create.*city|make.*city/.test(input);
        if (isBigBuild) {
          return new Response(JSON.stringify({
            ok: true,
            commands: [],
            message: clarifyMsg,
            mode: "clarify"
          }), { headers: corsHeaders });
        }
      }

      // Smart single-item model resolution
      const smartModel = resolveSmartModel(input);
      if (smartModel && /^(add|place|spawn|put)\s+/i.test(input) && !input.includes(' a ') === false) {
        // Let AI handle it but hint the model
        const enhancedInput = input + ` (use model: ${smartModel})`;
      }

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
