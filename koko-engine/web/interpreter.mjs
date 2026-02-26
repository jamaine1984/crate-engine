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

  // --- FALLBACK: treat entire input as asset search ---
  // If someone just types "tree" or "red car", try to find it
  return { action: 'addObject', query: raw };
}

export { interpret, WORLD_TYPES, WATER_TYPES, WEAPON_TYPES, CHARACTER_IDS, GALLERY_CATEGORIES };
