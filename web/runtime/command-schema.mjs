// ============================================================================
// CRATE ENGINE 2.0 — COMMAND SCHEMA (JS side)
// Mirrors crates/koko-commands — keep in sync.
// See research/COMMAND_SCHEMA.md for the full spec.
// ============================================================================

export const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// All valid command types
// ---------------------------------------------------------------------------

export const COMMAND_TYPES = new Set([
  // Scene
  'CLEAR_SCENE', 'SAVE_SCENE', 'LOAD_SCENE', 'EXPORT_SCENE', 'SHARE_SCENE', 'SCREENSHOT',

  // Objects
  'SPAWN_OBJECT', 'SCATTER_OBJECTS', 'REMOVE_OBJECT', 'TRANSFORM_OBJECT', 'COLOR_OBJECT', 'UNDO',

  // Environment
  'SET_TERRAIN', 'SET_WEATHER', 'SET_TIME', 'SET_FOG', 'SET_WATER', 'SET_PARTICLES', 'SET_WETNESS',

  // Player
  'ENTER_PLAY_MODE', 'EXIT_PLAY_MODE', 'SET_CHARACTER', 'EQUIP_WEAPON', 'UNEQUIP_WEAPON',
  'TOGGLE_CAMERA', 'TOGGLE_INVENTORY', 'SET_SENSITIVITY',

  // NPCs
  'SPAWN_NPC',

  // Vehicles
  'DRIVE_VEHICLE', 'EXIT_VEHICLE',

  // Buildings
  'ADD_INTERIOR',

  // Graphics
  'SET_GRAPHICS', 'SET_BLOOM', 'SET_SSAO', 'SET_POSTFX', 'SET_VIGNETTE', 'SET_GRAIN',

  // World Build
  'BUILD_WORLD', 'WORLD_BUILD',

  // Asset Queries (Phase 2 — world compiler feeds)
  'QUERY_ASSETS',

  // UI
  'SHOW_HELP', 'OPEN_LIBRARY', 'SHOW_GENERATOR', 'AI_SETTINGS', 'SCRIPT_MANAGER',

  // Multiplayer
  'JOIN_MULTIPLAYER', 'JOIN_ROOM', 'LEAVE_MULTIPLAYER', 'CHAT_MESSAGE',

  // Animation
  'PLAY_ANIMATION', 'STOP_ANIMATION',

  // Quick Play
  'QUICK_PLAY',

  // Simulation (Phase 4)
  'SIM_START', 'SIM_STOP', 'SIM_SPEED', 'SIM_STATS',

  // Rendering (Phase 5 — streaming + instancing)
  'RENDER_STATS', 'RENDER_QUALITY',

  // Special
  'EXEC_RAW', 'AAA_SKY', 'TOGGLE_DAY_NIGHT', 'SHOOTER_MODE', 'DRIVING_DEMO',
]);

// ---------------------------------------------------------------------------
// Required fields per command type (empty array = no required fields)
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS = {
  SPAWN_OBJECT:     ['query'],
  SCATTER_OBJECTS:   ['query', 'count'],
  REMOVE_OBJECT:    ['target'],
  COLOR_OBJECT:     ['target', 'color'],
  SET_TERRAIN:      ['type'],
  SET_WEATHER:      ['type'],
  SET_TIME:         ['time'],
  SET_WATER:        ['preset'],
  SET_PARTICLES:    ['type'],
  SET_CHARACTER:    ['id'],
  EQUIP_WEAPON:     ['weaponId'],
  SET_GRAPHICS:     ['level'],
  BUILD_WORLD:      ['template'],
  WORLD_BUILD:      ['template'],
  JOIN_ROOM:        ['room'],
  CHAT_MESSAGE:     ['message'],
  EXEC_RAW:         ['input'],
  QUICK_PLAY:       ['mode'],
  QUERY_ASSETS:     [],  // all filter fields optional: category, zone, style, placement, subcategory, search, minHeight, maxHeight
  RENDER_QUALITY:   ['level'],  // low, medium, high, ultra
  SAVE_SCENE:       [],  // name is optional
};

// TRANSFORM_OBJECT needs at least one of position/rotation/scale (special case)

// ---------------------------------------------------------------------------
// Valid enum values for constrained fields
// ---------------------------------------------------------------------------

const VALID_VALUES = {
  SET_TERRAIN: {
    type: ['flat', 'hills', 'mountains', 'canyon', 'island', 'dunes', 'volcano', 'mesa', 'archipelago'],
  },
  SET_WEATHER: {
    type: ['rain', 'snow', 'clear', 'storm', 'overcast'],
  },
  SET_TIME: {
    time: ['morning', 'noon', 'afternoon', 'sunset', 'evening', 'night', 'midnight', 'dawn', 'dusk', 'overcast'],
  },
  SET_WATER: {
    preset: ['tropical', 'storm', 'lake', 'ocean', 'swamp', 'river', 'arctic'],
  },
  SET_PARTICLES: {
    type: ['rain', 'snow', 'fire', 'dust', 'fireflies', 'embers', 'ash', 'spores', 'bubbles', 'leaves', 'petals', 'off'],
  },
  SET_GRAPHICS: {
    level: ['low', 'medium', 'high', 'ultra'],
  },
  RENDER_QUALITY: {
    level: ['low', 'medium', 'high', 'ultra'],
  },
  QUICK_PLAY: {
    mode: ['arena', 'survival', 'explore', 'demo'],
  },
};

// ---------------------------------------------------------------------------
// Pro-gated commands
// ---------------------------------------------------------------------------

const PRO_COMMANDS = new Set(['EXPORT_SCENE', 'WORLD_BUILD']);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a command object.
 *
 * @param {Object} cmd - normalized command { v, id, ts, source, type, payload }
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateCommand(cmd) {
  // Check schema version
  if (cmd.v !== SCHEMA_VERSION) {
    return { valid: false, error: `Unsupported schema version: ${cmd.v} (current: ${SCHEMA_VERSION})` };
  }

  // Check command type exists
  if (!cmd.type || !COMMAND_TYPES.has(cmd.type)) {
    return { valid: false, error: `Unknown command type: ${cmd.type}` };
  }

  const payload = cmd.payload || {};

  // Check required fields
  const required = REQUIRED_FIELDS[cmd.type];
  if (required) {
    for (const field of required) {
      if (payload[field] === undefined || payload[field] === null) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }
  }

  // Special case: TRANSFORM_OBJECT needs at least one of position/rotation/scale
  if (cmd.type === 'TRANSFORM_OBJECT') {
    if (!payload.position && !payload.rotation && payload.scale === undefined) {
      return { valid: false, error: 'TRANSFORM_OBJECT requires at least one of: position, rotation, scale' };
    }
  }

  // Check enum values
  const validValues = VALID_VALUES[cmd.type];
  if (validValues) {
    for (const [field, allowed] of Object.entries(validValues)) {
      const val = payload[field];
      if (val !== undefined && !allowed.includes(val)) {
        return { valid: false, error: `Invalid value for ${field}: "${val}". Must be one of: ${allowed.join(', ')}` };
      }
    }
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Command ID generation
// ---------------------------------------------------------------------------

let _cmdCounter = 0;

/**
 * Generate a unique command ID.
 * Format: cmd_{timestamp}_{counter}
 */
export function createCommandId() {
  return `cmd_${Date.now().toString(36)}_${(++_cmdCounter).toString(36)}`;
}

// ---------------------------------------------------------------------------
// Interpreter → Command mapping
// ---------------------------------------------------------------------------

/**
 * Convert an interpreter result (from interpreter.mjs interpret()) to a command.
 * This is the bridge between the legacy interpreter and the new command bus.
 *
 * @param {Object} intent - output from interpret(), e.g. { action: 'buildWorld', template: 'medieval village' }
 * @param {string} source - command source: 'chat', 'voice', 'editor', etc.
 * @returns {Object} command ready for commandBus.dispatch()
 */
export function intentToCommand(intent, source = 'chat') {
  const map = {
    enterPlayMode:   () => ({ type: 'ENTER_PLAY_MODE', payload: {} }),
    exitPlayMode:    () => ({ type: 'EXIT_PLAY_MODE', payload: {} }),
    showHelp:        () => ({ type: 'SHOW_HELP', payload: {} }),
    clearScene:      () => ({ type: 'CLEAR_SCENE', payload: {} }),
    toggleCamera:    () => ({ type: 'TOGGLE_CAMERA', payload: {} }),
    openLibrary:     () => ({ type: 'OPEN_LIBRARY', payload: { category: intent.category } }),
    showGenerator:   () => ({ type: 'SHOW_GENERATOR', payload: {} }),
    buildWorld:      () => ({ type: 'BUILD_WORLD', payload: { template: intent.template } }),
    equipWeapon:     () => ({ type: 'EQUIP_WEAPON', payload: { weaponId: intent.weaponId } }),
    unequipWeapon:   () => ({ type: 'UNEQUIP_WEAPON', payload: {} }),
    setCharacter:    () => ({ type: 'SET_CHARACTER', payload: { id: intent.id } }),
    playAs:          () => ({ type: 'SET_CHARACTER', payload: { id: intent.character } }),
    setWater:        () => ({ type: 'SET_WATER', payload: { preset: intent.preset, create: intent.create, size: intent.size } }),
    setTerrain:      () => ({ type: 'SET_TERRAIN', payload: { type: intent.type } }),
    setWeather:      () => ({ type: 'SET_WEATHER', payload: { type: intent.type } }),
    setFog:          () => ({ type: 'SET_FOG', payload: { enabled: intent.enabled } }),
    setParticles:    () => ({ type: 'SET_PARTICLES', payload: { type: intent.type } }),
    setTime:         () => ({ type: 'SET_TIME', payload: { time: intent.time } }),
    addInterior:     () => ({ type: 'ADD_INTERIOR', payload: { type: intent.type, floors: intent.options?.floors } }),
    spawnNPC:        () => ({ type: 'SPAWN_NPC', payload: { count: intent.count, hostile: intent.hostile } }),
    addObject:       () => ({ type: 'SPAWN_OBJECT', payload: { query: intent.query } }),
    scatter:         () => ({ type: 'SCATTER_OBJECTS', payload: { query: intent.query, count: intent.count } }),
    delete:          () => ({ type: 'REMOVE_OBJECT', payload: { target: intent.query } }),
    colorObject:     () => ({ type: 'COLOR_OBJECT', payload: { target: intent.target, color: intent.color } }),
    scaleObject:     () => ({ type: 'TRANSFORM_OBJECT', payload: { target: intent.target, scale: intent.scale } }),
    moveObject:      () => ({ type: 'TRANSFORM_OBJECT', payload: { target: intent.target, position: { x: intent.x, y: intent.y, z: intent.z } } }),
    rotateObject:    () => ({ type: 'TRANSFORM_OBJECT', payload: { target: intent.target, rotation: { y: intent.degrees } } }),
    driveVehicle:    () => ({ type: 'DRIVE_VEHICLE', payload: { target: intent.target } }),
    exitVehicle:     () => ({ type: 'EXIT_VEHICLE', payload: {} }),
    save:            () => ({ type: 'SAVE_SCENE', payload: { name: intent.name } }),
    load:            () => ({ type: 'LOAD_SCENE', payload: {} }),
    export:          () => ({ type: 'EXPORT_SCENE', payload: { format: 'html' } }),
    share:           () => ({ type: 'SHARE_SCENE', payload: {} }),
    screenshot:      () => ({ type: 'SCREENSHOT', payload: {} }),
    setGraphics:     () => ({ type: 'SET_GRAPHICS', payload: { level: intent.level } }),
    setBloom:        () => ({ type: 'SET_BLOOM', payload: { enabled: intent.enabled, strength: intent.strength } }),
    setSSAO:         () => ({ type: 'SET_SSAO', payload: { enabled: intent.enabled } }),
    setPostFX:       () => ({ type: 'SET_POSTFX', payload: { enabled: intent.enabled } }),
    setVignette:     () => ({ type: 'SET_VIGNETTE', payload: { value: intent.value } }),
    setGrain:        () => ({ type: 'SET_GRAIN', payload: { value: intent.value } }),
    setWetness:      () => ({ type: 'SET_WETNESS', payload: { value: intent.value } }),
    multiplayer:     () => ({ type: 'JOIN_MULTIPLAYER', payload: {} }),
    disconnect:      () => ({ type: 'LEAVE_MULTIPLAYER', payload: {} }),
    joinRoom:        () => ({ type: 'JOIN_ROOM', payload: { room: intent.room } }),
    chat:            () => ({ type: 'CHAT_MESSAGE', payload: { message: intent.message } }),
    playAnimation:   () => ({ type: 'PLAY_ANIMATION', payload: { name: intent.name } }),
    stopAnimation:   () => ({ type: 'STOP_ANIMATION', payload: { target: intent.target } }),
    toggleInventory: () => ({ type: 'TOGGLE_INVENTORY', payload: {} }),
    setSensitivity:  () => ({ type: 'SET_SENSITIVITY', payload: { value: intent.value } }),
    quickArena:      () => ({ type: 'QUICK_PLAY', payload: { mode: 'arena' } }),
    quickSurvival:   () => ({ type: 'QUICK_PLAY', payload: { mode: 'survival' } }),
    quickExplore:    () => ({ type: 'QUICK_PLAY', payload: { mode: 'explore' } }),
    quickDemo:       () => ({ type: 'QUICK_PLAY', payload: { mode: 'demo' } }),
    undo:            () => ({ type: 'UNDO', payload: {} }),
    execRaw:         () => ({ type: 'EXEC_RAW', payload: { input: intent.input || intent.raw || '' } }),
    aaaSky:          () => ({ type: 'AAA_SKY', payload: {} }),
    toggleDayNight:  () => ({ type: 'TOGGLE_DAY_NIGHT', payload: {} }),
    shooterMode:     () => ({ type: 'SHOOTER_MODE', payload: {} }),
    drivingDemo:     () => ({ type: 'DRIVING_DEMO', payload: {} }),
    aiSettings:      () => ({ type: 'AI_SETTINGS', payload: {} }),
    scriptManager:   () => ({ type: 'SCRIPT_MANAGER', payload: {} }),
    scriptEditor:    () => ({ type: 'SCRIPT_MANAGER', payload: {} }),
    resizeOcean:     () => ({ type: 'SET_WATER', payload: { preset: 'ocean', size: intent.size } }),
    queryAssets:     () => ({ type: 'QUERY_ASSETS', payload: {
      category: intent.category, zone: intent.zone, style: intent.style,
      placement: intent.placement, subcategory: intent.subcategory,
      search: intent.search || intent.query,
      minHeight: intent.minHeight, maxHeight: intent.maxHeight,
    }}),
  };

  const mapper = map[intent.action];
  if (!mapper) {
    // Fallback: treat as raw execution
    return {
      type: 'EXEC_RAW',
      payload: { input: intent.raw || JSON.stringify(intent) },
      source,
    };
  }

  const cmd = mapper();
  cmd.source = source;
  return cmd;
}

// ---------------------------------------------------------------------------
// Utility: check if a command requires Pro
// ---------------------------------------------------------------------------

export function requiresPro(commandType) {
  return PRO_COMMANDS.has(commandType);
}
