// LLM-powered command interpreter — RAG-enhanced via crate-engine-ai worker
// Typed commands + AI Agent button both route here

const CLAUDE_WORKER = 'https://crate-engine-ai.koikes2021.workers.dev';

export function setApiKey(key) {}       // handled server-side
export function hasApiKey() { return true; }

// ── MAIN ENTRY — typed command or AI agent call ───────────────────────────
export async function interpretWithLLM(userInput, options = {}) {
  const lower = userInput.toLowerCase().trim();

  // Pass-through simple direct commands — no API call needed
  const directCmds = /^(play|clear|save|load|heal|stats|help|weapons|buildings|characters|trees|animals|vehicles|rocks|furniture|food|dungeon|scifi|animations|library|scripts|play mode|exit play|quit)$/;
  if (directCmds.test(lower)) return [userInput];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 14000);

    const payload = {
      input: userInput,
      apiKey: localStorage.getItem('crate_openrouter_key') || undefined,
      agent: options.agent === true,  // AI Agent button uses smarter model + more tokens
    };

    const response = await fetch(CLAUDE_WORKER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn('[LLM] Worker error, falling back to local parser');
      return localSmartParse(userInput);
    }

    const data = await response.json();

    // Store AI message for UI display
    if (data.message) window._lastAIMessage = data.message;
    if (data.kb_hits) console.log(`[LLM] RAG hits: ${data.kb_hits}`);

    // KNOWLEDGE MODE — display rich answer, no commands to run
    if (data.mode === 'knowledge' && data.message) {
      window._lastAIMessage = data.message;
      window._aiKnowledgeResponse = data.message;
      return [];
    }

    if (data.commands && data.commands.length > 0) return data.commands;
    return localSmartParse(userInput);

  } catch (err) {
    console.warn('[LLM] Worker error:', err.message);
    return localSmartParse(userInput);
  }
}

// ── LOCAL FALLBACK ────────────────────────────────────────────────────────
function localSmartParse(input) {
  const lower = input.toLowerCase().trim();
  const cmds = [];

  // PLAYER
  if (/(?:add|give|create|spawn|i want|make|be)\s+(?:a\s+|me\s+)?(?:player|character|person|guy|hero)/.test(lower)) {
    const charMatch = lower.match(/(?:as|like|the)\s+(\w+)/);
    cmds.push('play as ' + (charMatch ? charMatch[1] : 'knight'));
  }

  // WEAPONS
  const wpn = [
    [/gun|rifle|shoot|sniper|ar|assault|m4|ak/i, 'rifle'],
    [/pistol|handgun|glock|9mm|sidearm/i, 'pistol'],
    [/shotgun|pump/i, 'shotgun'],
    [/sword|blade|claymore/i, 'sword'],
    [/katana|samurai/i, 'katana'],
    [/axe|hatchet/i, 'axe'],
    [/bow|crossbow/i, 'bow'],
    [/spear|lance/i, 'spear'],
    [/hammer|mace/i, 'hammer'],
    [/dagger|knife/i, 'dagger'],
    [/staff|wand|magic/i, 'staff'],
    [/shield|buckler/i, 'shield'],
  ];
  if (/equip|give me|hold|grab|wield|use/.test(lower)) {
    for (const [pat, w] of wpn) {
      if (pat.test(lower)) { cmds.push('equip ' + w); break; }
    }
  }

  // OBJECTS
  const obj = [
    [/house|home|cottage|cabin|hut/i, 'cottage'],
    [/castle|fortress/i, 'castle'],
    [/tree|oak|pine|palm/i, 'tree'],
    [/rock|boulder/i, 'rock'],
    [/car|vehicle|automobile/i, 'car'],
    [/boat|ship/i, 'boat'],
    [/tower/i, 'tower'],
    [/bridge/i, 'bridge'],
    [/fence|wall/i, 'fence'],
    [/lamp|torch|lantern/i, 'torch'],
    [/table|desk/i, 'table'],
    [/chair|seat|bench/i, 'chair'],
    [/chest|crate|barrel/i, 'chest'],
  ];
  if (/add|put|place|spawn|create/.test(lower)) {
    const countMatch = lower.match(/(\d+)\s+\w+/);
    for (const [pat, o] of obj) {
      if (pat.test(lower)) {
        const n = countMatch ? Math.min(parseInt(countMatch[1]), 20) : 1;
        for (let i = 0; i < n; i++) cmds.push('add ' + o);
        break;
      }
    }
  }

  // ENVIRONMENT
  if (/rain|raining/.test(lower))            cmds.push('make it rain');
  if (/snow|snowing/.test(lower))            cmds.push('make it snow');
  if (/fog|foggy|mist/.test(lower))          cmds.push('fog heavy');
  if (/clear weather|sunny|stop rain/.test(lower)) cmds.push('clear weather');

  // TIME
  const tm = lower.match(/night|day|dawn|sunset|sunrise|dusk|noon|midnight|morning|evening/);
  if (tm) {
    let t = tm[0];
    if (t === 'morning') t = 'dawn';
    if (t === 'evening') t = 'sunset';
    cmds.push('time ' + t);
  }

  // TERRAIN / WATER
  if (/flat|plain/.test(lower))      cmds.push('terrain flat');
  if (/mountain|hill/.test(lower))   cmds.push('terrain mountains');
  if (/desert|sand/.test(lower))     cmds.push('terrain desert');

  // NPCS
  const npcMatch = lower.match(/spawn\s+(\d+)?\s*(npc|enemy|enemies|person|people|crowd)/);
  if (npcMatch) {
    const n = npcMatch[1] || 1;
    const hostile = /enemy|enemies/.test(npcMatch[2]);
    cmds.push(`spawn ${n} ${hostile ? 'enemies' : 'npcs'}`);
  }

  // ACTIONS
  if (/^(?:play|start|go|begin|let'?s go)$/.test(lower)) cmds.push('play');
  if (/heal|health|restore/.test(lower))   cmds.push('heal');
  if (/clear|reset|wipe|start over/.test(lower)) cmds.push('clear');
  if (/^save/.test(lower))   cmds.push('save');
  if (/^load/.test(lower))   cmds.push('load');

  // CAMERA
  if (/first.?person|fps/.test(lower)) cmds.push('fps mode');
  if (/third.?person|tps/.test(lower)) cmds.push('tps mode');

  // CITY / DUNGEON / INTERIOR
  if (/city|downtown|urban/.test(lower))    cmds.push('build city world');
  if (/dungeon|underground/.test(lower))    cmds.push('build a dungeon');
  if (/cave|cavern/.test(lower))            cmds.push('build a cave');
  if (/interior|inside|room/.test(lower))   cmds.push('build interior');

  // WATER
  if (/swim|pool|water/.test(lower))        cmds.push('add water');
  if (/ocean|sea/.test(lower))              cmds.push('add ocean');

  // SHOOTING / COMBAT
  if (/shooting|gunplay/.test(lower))       cmds.push('add shooting');
  if (/combat|fight|melee/.test(lower))     cmds.push('add combat system');

  if (cmds.length === 0) cmds.push(input);
  return cmds;
}
