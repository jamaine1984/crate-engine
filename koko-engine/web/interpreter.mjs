// ============================================================================
// CRATE ENGINE — AI INTERPRETER (Phase 3)
// One function that understands natural language → calls Action API
// No regex spaghetti. Pattern matching with clear priority.
// ============================================================================

const WORLD_TYPES = [
  'hurricane', 'tropical paradise', 'arctic storm', 'dark swamp', 'war zone',
  'enchanted forest', 'pirate cove', 'dragon lair', 'medieval siege', 'ocean voyage',
  'town', 'village', 'city', 'dungeon', 'arena', 'battlefield', 'kingdom',
  'island', 'forest', 'camp', 'graveyard', 'pirate', 'cyberpunk', 'desert',
  'frozen', 'jungle', 'space', 'mountain', 'volcano', 'haunted', 'western',
  'ruins', 'zen', 'swamp', 'floating'
];

const WATER_TYPES = ['tropical', 'storm', 'lake', 'ocean', 'swamp', 'river', 'arctic'];

const WEAPON_TYPES = [
  'sword', 'axe', 'dagger', 'hammer', 'spear', 'katana',
  'pistol', 'rifle', 'shotgun', 'smg', 'sniper', 'bow'
];

const CHARACTER_IDS = [
  'knight', 'cyberpunk', 'soldier', 'platformer', 'avatar', 'walking_man',
  'man', 'king', 'witch', 'women_soldier', 'robot', 'platformer_gun',
  'cyber_enemy', 'cyber_enemy_gun', 'cyber_flying', 'cyber_large',
  'platformer_enemy', 'space_enemy', 'space_boss'
];

const TERRAIN_TYPES = ['flat', 'hills', 'mountains', 'canyon', 'island', 'dunes', 'volcano', 'mesa', 'archipelago'];

const WEATHER_TYPES = ['rain', 'snow', 'clear', 'storm', 'overcast'];

const TIME_TYPES = ['morning', 'noon', 'afternoon', 'sunset', 'evening', 'night', 'midnight', 'dawn', 'dusk', 'overcast'];

const INTERIOR_TYPES = ['house', 'shop', 'tavern'];

const GALLERY_CATEGORIES = {
  // Map user words to catalog categories
  'characters': 'characters', 'character': 'characters', 'people': 'characters', 'person': 'characters',
  'weapons': 'weapons', 'weapon': 'weapons', 'sword': 'weapons', 'swords': 'weapons', 'gun': 'weapons', 'guns': 'weapons',
  'buildings': 'buildings', 'building': 'buildings', 'house': 'buildings', 'houses': 'buildings', 'castle': 'buildings',
  'vehicles': 'vehicles', 'vehicle': 'vehicles', 'car': 'vehicles', 'cars': 'vehicles', 'boat': 'vehicles', 'truck': 'vehicles',
  'animals': 'animals', 'animal': 'animals', 'creature': 'animals', 'creatures': 'animals', 'pet': 'animals', 'pets': 'animals',
  'trees': 'trees', 'tree': 'trees', 'plant': 'trees', 'plants': 'trees', 'bush': 'trees', 'flower': 'trees',
  'rocks': 'rocks', 'rock': 'rocks', 'stone': 'rocks', 'boulder': 'rocks', 'crystal': 'rocks',
  'furniture': 'furniture', 'table': 'furniture', 'chair': 'furniture', 'bed': 'furniture', 'lamp': 'furniture',
  'food': 'food', 'item': 'food', 'items': 'food', 'potion': 'food', 'chest': 'food', 'barrel': 'food',
  'dungeon': 'dungeon', 'skull': 'dungeon', 'torch': 'dungeon', 'grave': 'dungeon',
  'scifi': 'scifi', 'sci-fi': 'scifi', 'robot': 'scifi', 'mech': 'scifi', 'drone': 'scifi', 'spaceship': 'scifi',
  'nature': 'nature', 'tent': 'nature', 'camping': 'nature', 'outdoor': 'nature',
  'modern': 'modern',
};

// --------------------------------------------------------------------------
// INTERPRET — the one function that replaces parseAndExecute
// --------------------------------------------------------------------------
function interpret(input) {
  const raw = input.trim();
  const lower = raw.toLowerCase();
  const words = lower.split(/\s+/);

  // --- PLAY/EDIT MODE ---
  if (lower === 'play' || lower === 'play mode' || lower === 'start' || lower === 'start game') {
    return { action: 'enterPlayMode' };
  }
  if (lower === 'edit' || lower === 'edit mode' || lower === 'stop' || lower === 'stop playing') {
    return { action: 'exitPlayMode' };
  }

  // --- HELP ---
  if (lower === 'help' || lower === 'commands' || lower === '?' || lower === 'show commands' || lower === 'show help') {
    return { action: 'showHelp' };
  }

  // --- CLEAR ---
  if (lower === 'clear' || lower === 'reset' || lower === 'clear scene' || lower === 'new scene') {
    return { action: 'clearScene' };
  }

  // --- CAMERA ---
  if (lower === 'fps' || lower === 'tps' || lower === 'first person' || lower === 'third person' || lower === 'toggle camera') {
    return { action: 'toggleCamera' };
  }

  // --- LIBRARY / BROWSE ---
  if (lower === 'library' || lower === 'browse' || lower === 'browse all' || lower === 'asset library' || lower === 'assets' || lower === 'models' || lower === 'model library') {
    return { action: 'openLibrary' };
  }
  // Browse specific category: "show weapons", "browse buildings", "animals"
  // Play mode commands
  if (lower === 'play' || lower === 'start' || lower === 'go') {
    return { action: 'enterPlayMode' };
  }
  if (lower.startsWith('play as ') || lower.startsWith('play ')) {
    const char = lower.replace(/^play\s*(as\s*)?/, '').trim();
    if (char) return { action: 'playAs', character: char };
    return { action: 'enterPlayMode' };
  }

  // Toolbar buttons send bare category names — open gallery for those
  const TOOLBAR_CATS = ['characters', 'weapons', 'buildings', 'trees', 'animals', 'vehicles', 'rocks', 'furniture', 'food', 'dungeon', 'scifi', 'animations', 'modern', 'nature'];
  if (TOOLBAR_CATS.includes(lower)) {
    return { action: 'openLibrary', category: GALLERY_CATEGORIES[lower] || lower };
  }
  for (const [keyword, category] of Object.entries(GALLERY_CATEGORIES)) {
    if (lower === `show ${keyword}` || lower === `browse ${keyword}` || lower === `open ${keyword}` || lower === `${keyword} gallery` || lower === `${keyword} library`) {
      return { action: 'openLibrary', category };
    }
  }

  // --- 3D GENERATOR ---
  if (lower === 'generator' || lower === '3d generator' || lower === 'generate 3d' || lower === 'create 3d model' || lower === 'text to 3d') {
    return { action: 'showGenerator' };
  }

  // --- BUILD WORLD (check BEFORE generic "add") ---
  for (const world of WORLD_TYPES) {
    if (lower === world || lower === `build ${world}` || lower === `create ${world}` || 
        lower === `generate ${world}` || lower === `make ${world}` || lower === `load ${world}` ||
        lower === `build a ${world}` || lower === `create a ${world}` ||
        lower === `${world} world` || lower === `${world} map` ||
        lower === `take me to ${world}` || lower === `go to ${world}`) {
      return { action: 'buildWorld', template: world };
    }
  }

  // --- EQUIP WEAPON ---
  for (const weapon of WEAPON_TYPES) {
    if (lower === `equip ${weapon}` || lower === weapon || lower === `use ${weapon}` || lower === `grab ${weapon}` || lower === `pick up ${weapon}`) {
      return { action: 'equipWeapon', weaponId: weapon };
    }
  }
  if (lower === 'unequip' || lower === 'drop weapon' || lower === 'holster') {
    return { action: 'unequipWeapon' };
  }
  if (lower === 'show weapons' || lower === 'weapon list' || lower === 'my weapons') {
    return { action: 'openLibrary', category: 'weapons' };
  }

  // --- SET CHARACTER ---
  for (const charId of CHARACTER_IDS) {
    const charName = charId.replace(/_/g, ' ');
    if (lower === charId || lower === charName || lower === `play as ${charId}` || lower === `play as ${charName}` || lower === `be ${charName}` || lower === `set character ${charId}`) {
      return { action: 'setCharacter', id: charId };
    }
  }
  if (lower === 'characters' || lower === 'character gallery' || lower === 'choose character' || lower === 'pick character') {
    return { action: 'openLibrary', category: 'characters' };
  }

  // --- WATER PRESET ---
  for (const water of WATER_TYPES) {
    if (lower === `water ${water}` || lower === `${water} water` || lower === `set water ${water}` || lower === `ocean ${water}`) {
      return { action: 'setWater', preset: water };
    }
  }
  if (lower === 'add ocean' || lower === 'ocean' || lower === 'create ocean') {
    return { action: 'setWater', preset: 'ocean', create: true };
  }
  if (lower === 'add lake' || lower === 'lake' || lower === 'add pond') {
    return { action: 'setWater', preset: 'lake', create: true, size: 30 };
  }

  // --- TERRAIN ---
  for (const terrain of TERRAIN_TYPES) {
    if (lower === `terrain ${terrain}` || lower === `set terrain ${terrain}` || lower === `${terrain} terrain`) {
      return { action: 'setTerrain', type: terrain };
    }
  }

  // --- CLEAR WEATHER ---
  if (lower === 'clear weather' || lower === 'stop rain' || lower === 'stop snow' || lower === 'no rain' || lower === 'no snow' || lower === 'weather clear' || lower === 'weather off') {
    return { action: 'setWeather', type: 'clear' };
  }

  // --- FOG ---
  if (lower === 'fog on' || lower === 'fog' || lower === 'add fog' || lower === 'enable fog') {
    return { action: 'setFog', enabled: true };
  }
  if (lower === 'fog off' || lower === 'no fog' || lower === 'remove fog' || lower === 'disable fog' || lower === 'clear fog') {
    return { action: 'setFog', enabled: false };
  }

  // --- PARTICLES ---
  const particleMatch = lower.match(/^(?:particles?|ambient)\s+(rain|snow|fire|dust|fireflies|embers|ash|spores|bubbles|leaves|petals|off|none|clear)/);
  if (particleMatch) {
    const ptype = particleMatch[1];
    if (ptype === 'off' || ptype === 'none' || ptype === 'clear') {
      return { action: 'setParticles', type: 'off' };
    }
    return { action: 'setParticles', type: ptype };
  }

  // --- WEATHER ---
  for (const weather of WEATHER_TYPES) {
    if (lower === weather || lower === `set weather ${weather}` || lower === `make it ${weather}` || lower === `weather ${weather}`) {
      return { action: 'setWeather', type: weather };
    }
  }

  // --- TIME ---
  for (const time of TIME_TYPES) {
    if (lower === time || lower === `time ${time}` || lower === `set time ${time}` || lower === `make it ${time}`) {
      return { action: 'setTime', time };
    }
  }

  // --- INTERIOR BUILDINGS ---
  for (const interior of INTERIOR_TYPES) {
    if (lower === `interior ${interior}` || lower === `add ${interior}` || lower === `build ${interior}`) {
      return { action: 'addInterior', type: interior };
    }
  }
  // Multi-story
  const storyMatch = lower.match(/^(\d+)\s*story\s*(house|building)/);
  if (storyMatch) {
    return { action: 'addInterior', type: 'house', options: { floors: parseInt(storyMatch[1]) } };
  }

  // --- SPAWN NPCs ---
  const npcMatch = lower.match(/^(?:spawn|add|create)\s+(\d+)?\s*(?:hostile\s+|enemy\s+)?(?:npcs?|enemies|hostiles|people|villagers)/);
  if (npcMatch) {
    const count = parseInt(npcMatch[1]) || 3;
    const hostile = lower.includes('hostile') || lower.includes('enemy') || lower.includes('enemies');
    return { action: 'spawnNPC', count, hostile };
  }
  if (lower === 'spawn enemies' || lower === 'add enemies') {
    return { action: 'spawnNPC', count: 5, hostile: true };
  }

  // --- INVENTORY ---
  if (lower === 'inventory' || lower === 'open inventory' || lower === 'bag' || lower === 'backpack') {
    return { action: 'toggleInventory' };
  }

  // --- SAVE / LOAD ---
  if (lower === 'save' || lower.startsWith('save ')) {
    return { action: 'save', name: raw.replace(/^save\s*/i, '').trim() || undefined };
  }
  if (lower === 'load' || lower === 'saves' || lower === 'load game') {
    return { action: 'load' };
  }

  // --- GENERIC ADD OBJECT (fuzzy search) ---
  // "add house", "add big tree", "place a boat", "I want a dragon"
  const addMatch = lower.match(/^(?:add|place|put|spawn|create|i want|give me|make)\s+(?:a |an |the |some |my )?(.+)/);
  if (addMatch) {
    const query = addMatch[1].trim();
    return { action: 'addObject', query };
  }

  // --- MULTIPLAYER ---
  if (lower === 'multiplayer' || lower === 'mp' || lower === 'lobby' || lower === 'join game' || lower === 'online' || lower === 'co-op') {
    return { action: 'multiplayer' };
  }
  if (lower === 'disconnect' || lower === 'leave room' || lower === 'leave mp') {
    return { action: 'disconnect' };
  }
  const joinMatch = lower.match(/^join\s+(.+)/);
  if (joinMatch) {
    return { action: 'joinRoom', room: joinMatch[1] };
  }
  const chatMatch = lower.match(/^chat\s+(.+)/);
  if (chatMatch) {
    return { action: 'chat', message: chatMatch[1] };
  }

  // --- GRAPHICS ---
  const gfxMatch = lower.match(/^(?:graphics|quality|set quality|visual quality)\s*(low|medium|high|ultra)?$/);
  if (gfxMatch) {
    return { action: 'setGraphics', level: gfxMatch[1] || 'high' };
  }
  if (lower === 'bloom on') return { action: 'setBloom', enabled: true };
  if (lower === 'bloom off') return { action: 'setBloom', enabled: false };
  const bloomMatch = lower.match(/^bloom\s+(\d+\.?\d*)/);
  if (bloomMatch) return { action: 'setBloom', enabled: true, strength: parseFloat(bloomMatch[1]) };
  if (lower === 'ssao on') return { action: 'setSSAO', enabled: true };
  if (lower === 'ssao off') return { action: 'setSSAO', enabled: false };

  // --- SHOOTER MODE ---
  if (lower === 'shooter mode' || lower === 'fps mode' || lower === 'enable shooter') {
    return { action: 'shooterMode' };
  }

  // --- DRIVING DEMO ---
  if (lower === 'driving demo' || lower === 'drive demo' || lower === 'car demo') {
    return { action: 'drivingDemo' };
  }

  // --- SKY / SUN ---
  if (lower === 'aaa sky' || lower === 'realistic sky') return { action: 'aaaSky' };
  if (lower === 'sunrise' || lower === 'dawn') return { action: 'setTime', time: 'dawn' };
  if (lower === 'sunset' || lower === 'dusk') return { action: 'setTime', time: 'sunset' };
  if (lower === 'noon' || lower === 'midday') return { action: 'setTime', time: 'noon' };

  // --- WETNESS ---
  if (lower === 'wet' || lower === 'wet ground' || lower === 'puddles') return { action: 'setWetness', value: 0.6 };
  if (lower === 'dry' || lower === 'dry ground') return { action: 'setWetness', value: 0 };
  const wetMatch = lower.match(/^wet(?:ness)?\s+(\d+\.?\d*)/);
  if (wetMatch) return { action: 'setWetness', value: parseFloat(wetMatch[1]) };

  // --- OCEAN RESIZE ---
  const resizeMatch = lower.match(/^(?:resize ocean|ocean)\s+(\d+)/);
  if (resizeMatch) return { action: 'resizeOcean', size: parseInt(resizeMatch[1]) };
  if (lower === 'ocean bigger') return { action: 'resizeOcean', size: 1000 };
  if (lower === 'ocean smaller') return { action: 'resizeOcean', size: 200 };

  // --- ANIMATION ---
  const animMatch = lower.match(/^(?:play anim|animate|animation|anim)\s+(.+)/);
  if (animMatch) return { action: 'playAnimation', name: animMatch[1].trim() };

  // --- SCATTER ---
  const scatterMatch = lower.match(/^(?:scatter|add)\s+(\d+)\s+(.+)/);
  if (scatterMatch) {
    const count = parseInt(scatterMatch[1]);
    return { action: 'scatter', count, query: scatterMatch[2].trim() };
  }

  // --- DELETE / REMOVE ---
  if (lower === 'undo' || lower === 'remove last' || lower === 'delete last') {
    return { action: 'undo' };
  }
  const deleteMatch = lower.match(/^(?:delete|remove)\s+(.+)/);
  if (deleteMatch) return { action: 'delete', query: deleteMatch[1].trim() };

  // --- SCREENSHOT ---
  if (lower === 'screenshot' || lower === 'capture' || lower === 'photo') return { action: 'screenshot' };

  // --- EXPORT ---
  if (lower === 'export' || lower === 'export scene') return { action: 'export' };

  // --- SHARE ---
  if (lower === 'share' || lower === 'share scene') return { action: 'share' };


    // --- COLOR ---
  const colorMatch = lower.match(/^(?:color|paint|set color)\s+(.+?)\s+(red|blue|green|yellow|white|black|orange|purple|pink|cyan|gold|silver|brown|gray|grey|#[0-9a-f]{3,6})/);
  if (colorMatch) return { action: 'colorObject', target: colorMatch[1], color: colorMatch[2] };

  // --- SCALE ---
  const scaleMatch = lower.match(/^(?:scale|resize|size)\s+(.+?)\s+(\d+\.?\d*)/);
  if (scaleMatch) return { action: 'scaleObject', target: scaleMatch[1], scale: parseFloat(scaleMatch[2]) };

  // --- MOVE ---
  const moveMatch = lower.match(/^(?:move|translate|position)\s+(.+?)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*(-?\d+\.?\d*)?/);
  if (moveMatch) return { action: 'moveObject', target: moveMatch[1], x: parseFloat(moveMatch[2]), y: parseFloat(moveMatch[3]), z: moveMatch[4] ? parseFloat(moveMatch[4]) : undefined };

  // --- ROTATE ---
  const rotateMatch = lower.match(/^(?:rotate|spin|turn)\s+(.+?)\s+(-?\d+\.?\d*)/);
  if (rotateMatch) return { action: 'rotateObject', target: rotateMatch[1], degrees: parseFloat(rotateMatch[2]) };

  // --- DRIVE ---
  const driveMatch = lower.match(/^(?:drive|enter|ride)\s+(.+)/);
  if (driveMatch) return { action: 'driveVehicle', target: driveMatch[1] };
  if (lower === 'exit vehicle' || lower === 'get out' || lower === 'stop driving') return { action: 'exitVehicle' };

  // --- POST-PROCESSING ---
  if (lower === 'postfx on' || lower === 'post processing on') return { action: 'setPostFX', enabled: true };
  if (lower === 'postfx off' || lower === 'post processing off') return { action: 'setPostFX', enabled: false };
  const vignetteMatch = lower.match(/^vignette\s+(\d+\.?\d*)/);
  if (vignetteMatch) return { action: 'setVignette', value: parseFloat(vignetteMatch[1]) };
  const grainMatch = lower.match(/^grain\s+(\d+\.?\d*)/);
  if (grainMatch) return { action: 'setGrain', value: parseFloat(grainMatch[1]) };

  // --- AI SETTINGS ---
  if (lower === 'ai settings' || lower === 'ai config' || lower === 'ai model') return { action: 'aiSettings' };

  // --- SCRIPT ---
  if (lower === 'scripts' || lower === 'script manager') return { action: 'scriptManager' };
  if (lower === 'edit script' || lower === 'script editor') return { action: 'scriptEditor' };

  // --- STOP ANIMATION ---
  const stopAnimMatch = lower.match(/^stop\s+(.+)/);
  if (stopAnimMatch) return { action: 'stopAnimation', target: stopAnimMatch[1] };


    // --- SENSITIVITY ---
  const sensMatch = lower.match(/^(?:sensitivity|mouse sensitivity|sens)\s+(\d+\.?\d*)/);
  if (sensMatch) return { action: 'setSensitivity', value: parseFloat(sensMatch[1]) };
  if (lower === 'sensitivity low') return { action: 'setSensitivity', value: 0.001 };
  if (lower === 'sensitivity high') return { action: 'setSensitivity', value: 0.006 };

  // --- QUICK PLAY COMMANDS ---
  if (lower === 'arena' || lower === 'combat arena' || lower === 'fight' || lower === 'battle') {
    return { action: 'quickArena' };
  }
  if (lower === 'survival' || lower === 'survive' || lower === 'wave mode' || lower === 'horde mode') {
    return { action: 'quickSurvival' };
  }
  if (lower === 'explore' || lower === 'exploration' || lower === 'free roam') {
    return { action: 'quickExplore' };
  }
  if (lower === 'demo' || lower === 'show demo' || lower === 'showcase') {
    return { action: 'quickDemo' };
  }

    // --- FALLBACK: treat entire input as asset search ---
  // If someone just types "tree" or "red car", try to find it
  return { action: 'addObject', query: raw };
}



// ============================================================================
// COMMAND SHOWCASE — All available commands organized by category
// Used by the help/commands panel
// ============================================================================
const COMMANDS_SHOWCASE = {
  '🌍 World Building': [
    'build tropical paradise', 'build arctic storm', 'build dark swamp',
    'build war zone', 'build enchanted forest', 'build pirate cove',
    'build dragon lair', 'build medieval siege', 'build cyberpunk',
    'build desert', 'build volcano', 'build haunted', 'build space',
    'build western', 'build ruins', 'build zen', 'build floating',
  ],
  '🏗️ Objects & Assets': [
    'add tree', 'add house', 'add car', 'add dragon',
    'add 10 trees', 'scatter 20 rocks',
    'browse buildings', 'browse weapons', 'browse animals',
    'library', 'asset library',
  ],
  '⚔️ Weapons & Combat': [
    'equip sword', 'equip katana', 'equip axe', 'equip hammer',
    'equip pistol', 'equip rifle', 'equip shotgun', 'equip bow',
    'equip sniper', 'equip smg', 'equip dagger', 'equip spear',
    'show weapons', 'unequip',
  ],
  '🎮 Play Mode': [
    'play', 'play as knight', 'play as soldier', 'play as witch',
    'fps', 'tps', 'toggle camera',
    'shooter mode', 'driving demo',
  ],
  '👥 NPCs': [
    'spawn 5 npcs', 'spawn enemies', 'spawn 3 hostile npcs',
    'spawn villagers',
  ],
  '🌊 Water & Weather': [
    'water tropical', 'water storm', 'water lake', 'water arctic',
    'add ocean', 'add lake',
    'rain', 'snow', 'clear weather', 'storm',
    'fog on', 'fog off',
  ],
  '⛰️ Terrain': [
    'terrain flat', 'terrain hills', 'terrain mountains',
    'terrain island', 'terrain canyon', 'terrain volcano',
    'terrain dunes', 'terrain mesa',
  ],
  '🌅 Time & Sky': [
    'morning', 'noon', 'sunset', 'night', 'midnight',
    'dawn', 'dusk', 'aaa sky',
  ],
  '✨ Effects': [
    'particles fire', 'particles rain', 'particles snow',
    'particles fireflies', 'particles dust', 'particles leaves',
    'bloom on', 'bloom off', 'ssao on', 'postfx on',
    'wet ground', 'dry ground',
    'vignette 0.5', 'grain 0.3',
  ],
  '🎨 Edit Objects': [
    'color tree red', 'scale car 2', 'rotate house 90',
    'move tree 10 0 10', 'delete tree', 'undo',
  ],
  '🏠 Buildings': [
    'add house', 'add shop', 'add tavern',
    'interior house', 'interior shop',
    '2 story house', '3 story building',
  ],
  '💾 Save & Share': [
    'save', 'save my world', 'load',
    'screenshot', 'export', 'share',
  ],
  '🔮 AI & Scripts': [
    'ai settings', 'scripts', 'edit script',
    '3d generator', 'text to 3d',
  ],
  '🎮 Quick Play': [
    'arena', 'survival', 'explore', 'demo',
    'fight', 'battle', 'horde mode',
  ],
  '🌐 Multiplayer': [
    'multiplayer', 'join lobby', 'disconnect',
  ],
  '⚙️ Graphics': [
    'graphics low', 'graphics medium', 'graphics high', 'graphics ultra',
  ],
};


export { interpret, COMMANDS_SHOWCASE, WORLD_TYPES, WATER_TYPES, WEAPON_TYPES, CHARACTER_IDS, GALLERY_CATEGORIES };
