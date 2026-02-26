// LLM-powered command interpreter — understands ANY natural language
// Uses Claude API to convert human speech → engine commands

const SYSTEM_PROMPT = `You are the AI brain of Crate Engine, a browser-based 3D game engine.
Your job: convert ANY user input into one or more engine commands.

AVAILABLE COMMANDS (use these EXACTLY):
- play as [character] — start playing (characters: knight, adventurer, swat, king, punk, soldier, casual, farmer, suit, worker, witch, medieval, scifi, formal, beach, spacesuit)
- equip [weapon] — equip weapon (sword, axe, rifle, pistol, shotgun, bow, spear, hammer, dagger, katana, shield, staff)
- spawn [N] enemies — spawn hostile NPCs
- spawn [N] npcs — spawn friendly NPCs
- add [object] — add any 3D object (cottage, castle, tree, rock, car, boat, etc — 2000+ models available)
- build a [world] — build themed world (medieval village, tropical paradise, haunted graveyard, space station, pirate island, dungeon, zombie wasteland, frozen tundra, cyberpunk city, etc)
- terrain [type] — change terrain (flat, hills, mountains, desert, island, canyon, volcano)
- water [preset] — set water style (calm, tropical, stormy, arctic, blood, lava, crystal)
- time [period] — change time (dawn, sunrise, noon, sunset, dusk, night, midnight)
- make it rain / make it snow / fog heavy / clear weather
- clear — clear entire scene
- save / load
- heal — restore health
- stats — show character stats

RULES:
1. Return ONLY a JSON array of command strings. Nothing else.
2. Break complex requests into multiple commands.
3. If unclear, make your best guess.
4. For "add a player" → use "play as knight"
5. For weapons that shoot → use "equip rifle" or "equip pistol"
6. For "make a world/scene with X" → use "build a" + individual "add" commands

EXAMPLES:
User: "add a player with a gun in a medieval village"
["build a medieval village", "play as knight", "equip rifle"]

User: "I want to fight zombies at night"
["build a zombie wasteland", "time night", "play as soldier", "equip shotgun", "spawn 10 enemies"]

User: "put a house and some trees"
["add cottage", "add tree", "add tree", "add tree"]

User: "make it snow and add a frozen lake"
["make it snow", "terrain flat", "water arctic"]

User: "give me a sword"
["equip sword"]`;

const CLAUDE_WORKER = 'https://crate-engine-ai.koikes2021.workers.dev';

export function setApiKey(key) {} // No longer needed — worker handles keys
export function hasApiKey() { return true; } // Always available via worker

// Call Claude via our Cloudflare Worker proxy
export async function interpretWithLLM(userInput) {
  // Quick check — if it's a simple known command, skip the API call
  const lower = userInput.toLowerCase().trim();
  const directCmds = /^(play|clear|save|load|heal|stats|help|weapons|buildings|characters|trees|animals|vehicles|rocks|furniture|food|dungeon|scifi|animations|library|scripts)$/;
  if (directCmds.test(lower)) {
    return [userInput]; // Pass through directly
  }
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000); // 12s timeout
    
    const response = await fetch(CLAUDE_WORKER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: userInput, apiKey: localStorage.getItem('crate_openrouter_key') || undefined }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    
    if (!response.ok) {
      console.warn('Claude worker error, falling back to local parser');
      return localSmartParse(userInput);
    }
    
    const data = await response.json();
    
    // Store the message for the agent to display
    if (data.message) window._lastAIMessage = data.message;
    
    if (data.commands && data.commands.length > 0) {
      return data.commands;
    }
    return localSmartParse(userInput);
  } catch (err) {
    console.warn('Claude worker error:', err.message);
    return localSmartParse(userInput);
  }
}

// Smart local fallback — handles common patterns without API
function localSmartParse(input) {
  const lower = input.toLowerCase().trim();
  const cmds = [];
  
  // === PLAYER/CHARACTER ===
  if (lower.match(/(?:add|give|create|spawn|i want|make|be)\s+(?:a\s+|me\s+)?(?:player|character|person|guy|hero)/)) {
    // Check for specific character
    const charMatch = lower.match(/(?:as|like|the)\s+(\w+)/);
    cmds.push('play as ' + (charMatch ? charMatch[1] : 'knight'));
  }
  
  // === WEAPONS ===
  const weaponPatterns = [
    [/(?:gun|rifle|shoot|sniper|ar|assault|m4|ak)/i, 'rifle'],
    [/(?:pistol|handgun|glock|9mm|sidearm)/i, 'pistol'],
    [/(?:shotgun|pump|12.?gauge)/i, 'shotgun'],
    [/(?:sword|blade|claymore|longsword)/i, 'sword'],
    [/(?:katana|samurai|ninja)/i, 'katana'],
    [/(?:axe|hatchet|tomahawk)/i, 'axe'],
    [/(?:bow|crossbow|arrow)/i, 'bow'],
    [/(?:spear|lance|javelin|trident)/i, 'spear'],
    [/(?:hammer|mace|club|warhammer)/i, 'hammer'],
    [/(?:dagger|knife|shiv)/i, 'dagger'],
    [/(?:staff|wand|magic)/i, 'staff'],
    [/(?:shield|buckler|protect)/i, 'shield'],
  ];
  
  const hasWeaponRequest = lower.match(/(?:with|holding|give|equip|carry|wield|arm)\s+(?:a\s+|me\s+)?(\w+)/);
  const shootsRequest = lower.match(/(?:that|who|can)\s+(?:shoots?|fires?|attacks?)/);
  
  if (hasWeaponRequest || shootsRequest) {
    let weaponFound = false;
    for (const [pattern, weapon] of weaponPatterns) {
      if (pattern.test(lower)) {
        cmds.push('equip ' + weapon);
        weaponFound = true;
        break;
      }
    }
    if (!weaponFound && shootsRequest) cmds.push('equip rifle');
    if (!weaponFound && hasWeaponRequest && !shootsRequest) cmds.push('equip ' + hasWeaponRequest[1]);
  }
  
  // === ENEMIES/NPCS ===
  const enemyMatch = lower.match(/(?:spawn|add|with|fight|against|vs)\s+(?:(\d+)\s+)?(?:enemies|monsters|zombies|hostiles|bad guys|mobs|creatures|skeletons)/);
  if (enemyMatch) cmds.push(`spawn ${enemyMatch[1] || '5'} enemies`);
  
  const npcMatch = lower.match(/(?:spawn|add|with)\s+(?:(\d+)\s+)?(?:npcs?|people|villagers|townsfolk|characters|friends|allies)/);
  if (npcMatch) cmds.push(`spawn ${npcMatch[1] || '3'} npcs`);
  
  // === WORLD BUILDING ===
  const worldPatterns = {
    'medieval': /medieval|middle.?age|kingdom|castle.?town/,
    'village': /village|town|settlement/,
    'zombie wasteland': /zombie|undead|apocalyp|wasteland/,
    'pirate island': /pirate|pirate.?island|treasure/,
    'space station': /space|sci.?fi|futur|station|galact/,
    'haunted graveyard': /haunt|grave|ghost|spooky|horror|scary|crypt/,
    'frozen tundra': /frozen|ice|arctic|tundra|snow|winter|cold/,
    'desert': /desert|sand|sahara|dune|arid/,
    'tropical paradise': /tropical|beach|paradise|island|palm|hawaii/,
    'dungeon': /dungeon|cave|underground|catacombs/,
    'cyberpunk city': /cyber|neon|futur.?city|blade.?runner/,
    'war zone': /war|battle|military|army|combat.?zone/,
    'forest': /forest|wood|jungle|wild/,
    'volcano': /volcan|lava|fire.?land/,
  };
  
  for (const [world, pattern] of Object.entries(worldPatterns)) {
    if (pattern.test(lower) && lower.match(/(?:build|create|make|take me|go to|in a|on a|generate|world|scene|map|level)/)) {
      cmds.push('build a ' + world);
      break;
    }
  }
  
  // === OBJECTS ===
  const objectPatterns = [
    [/(?:house|home|cottage|cabin|hut)/i, 'cottage'],
    [/(?:castle|fortress|citadel|keep)/i, 'castle'],
    [/(?:tree|oak|pine|palm)/i, 'tree'],
    [/(?:rock|boulder|stone)/i, 'rock'],
    [/(?:car|vehicle|automobile)/i, 'car'],
    [/(?:boat|ship|vessel)/i, 'boat'],
    [/(?:tower|watchtower|lookout)/i, 'tower'],
    [/(?:bridge)/i, 'bridge'],
    [/(?:fence|wall|barrier)/i, 'fence'],
    [/(?:lamp|light|torch|lantern)/i, 'torch'],
    [/(?:table|desk)/i, 'table'],
    [/(?:chair|seat|bench)/i, 'chair'],
    [/(?:chest|crate|box|barrel)/i, 'chest'],
  ];
  
  if (lower.match(/(?:add|put|place|spawn|create)\s/)) {
    const countMatch = lower.match(/(\d+)\s+(\w+)/);
    for (const [pattern, obj] of objectPatterns) {
      if (pattern.test(lower)) {
        const count = countMatch ? parseInt(countMatch[1]) : 1;
        for (let i = 0; i < Math.min(count, 20); i++) cmds.push('add ' + obj);
        break;
      }
    }
  }
  
  // === ENVIRONMENT ===
  if (lower.match(/(?:rain|raining)/)) cmds.push('make it rain');
  if (lower.match(/(?:snow|snowing)/)) cmds.push('make it snow');
  if (lower.match(/(?:fog|foggy|mist)/)) cmds.push('fog heavy');
  if (lower.match(/(?:clear weather|sunny|stop rain)/)) cmds.push('clear weather');
  
  // === TIME ===
  const timeMatch = lower.match(/(?:night|day|dawn|sunset|sunrise|dusk|noon|midnight|morning|evening)/);
  if (timeMatch) {
    let time = timeMatch[0];
    if (time === 'morning') time = 'dawn';
    if (time === 'evening') time = 'sunset';
    cmds.push('time ' + time);
  }
  
  // === TERRAIN ===
  if (lower.match(/(?:flat|plain)\s*(?:terrain|ground|land|map)?/)) cmds.push('terrain flat');
  if (lower.match(/(?:mountain|hilly|hills)/)) cmds.push('terrain mountains');
  
  // === ACTIONS ===
  if (lower.match(/^(?:play|start|go|begin|let'?s go)$/)) cmds.push('play');
  if (lower.match(/(?:heal|health|restore|recover)/)) cmds.push('heal');
  if (lower.match(/(?:clear|reset|wipe|clean|start over|new scene)/)) cmds.push('clear');
  if (lower.match(/(?:save)/)) cmds.push('save');
  if (lower.match(/(?:load)/)) cmds.push('load');
  
  // === CATCH-ALL: if nothing matched, try as direct command ===
  if (cmds.length === 0) {
    // Pass through as-is — the engine's own interpreter will try
    cmds.push(input);
  }
  
  return cmds;
}
