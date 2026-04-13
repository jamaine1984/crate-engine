// Deferred world compiler routing and legacy map templates.
const WORLD_COMPILER_MAP = {
  city: 'CITY_MODERN', suburban: 'CITY_MODERN', urban: 'CITY_MODERN',
  town: 'MEDIEVAL_VILLAGE', village: 'MEDIEVAL_VILLAGE', medieval: 'MEDIEVAL_VILLAGE', 'medieval siege': 'MEDIEVAL_VILLAGE',
  zombie: 'ZOMBIELAND', graveyard: 'ZOMBIELAND',
  space: 'SPACE_STATION', station: 'SPACE_STATION',
  island: 'TROPICAL_ISLAND', 'tropical paradise': 'TROPICAL_ISLAND', jungle: 'TROPICAL_ISLAND', tropical: 'TROPICAL_ISLAND',
  desert: 'DESERT_OUTPOST', outpost: 'DESERT_OUTPOST', volcano: 'DESERT_OUTPOST',
  pirate: 'PIRATE_COVE', 'pirate cove': 'PIRATE_COVE',
  haunted: 'HAUNTED_GRAVEYARD',
  dungeon: 'DUNGEON_CRAWL',
  cyberpunk: 'CYBERPUNK_CITY',
  camp: 'FARM_COUNTRY', farm: 'FARM_COUNTRY',
  kingdom: 'RPG_VILLAGE', rpg: 'RPG_VILLAGE',
  ruins: 'CASTLE_SIEGE', castle: 'CASTLE_SIEGE', siege: 'CASTLE_SIEGE', frozen: 'CASTLE_SIEGE',
  underwater: 'UNDERWATER_REEF', reef: 'UNDERWATER_REEF',
};

const MAP_TEMPLATES = {
  // ===== MEDIEVAL FANTASY =====
  town: {
    terrain: { type: 'flat', height: 0 },
    ground: 'grass', env: ['time afternoon'],
    water: null, weather: null, particles: null,
    items: [
      // === TOWN SQUARE — open plaza with well ===
      { cmd: 'add well', pos: [0, 0] },
      { cmd: 'add market stall', pos: [-8, 6] }, { cmd: 'add market stall', pos: [8, 6] },
      { cmd: 'add market stall', pos: [0, -8] },
      { cmd: 'add barrel', pos: [-10, 8] }, { cmd: 'add barrel', pos: [10, 8] },
      { cmd: 'add cart', pos: [12, -3] },
      // === NORTH STREET — wide spacing (15+ units between buildings) ===
      { cmd: 'add tavern', pos: [-30, 35] },
      { cmd: 'add blacksmith', pos: [0, 38] },
      { cmd: 'add modern house', pos: [30, 35] },
      // === SOUTH STREET ===
      { cmd: 'add modern house', pos: [-30, -35] },
      { cmd: 'add modern house', pos: [0, -38] },
      { cmd: 'add modern house', pos: [30, -35] },
      // === EAST STREET ===
      { cmd: 'add modern house', pos: [45, 0] },
      { cmd: 'add modern house', pos: [45, 25] },
      // === WEST STREET ===
      { cmd: 'add modern house', pos: [-45, 0] },
      { cmd: 'add modern house', pos: [-45, -25] },
      // === TORCHES — line the wide paths ===
      { cmd: 'add torch', pos: [-15, 18] }, { cmd: 'add torch', pos: [15, 18] },
      { cmd: 'add torch', pos: [-15, -18] }, { cmd: 'add torch', pos: [15, -18] },
      { cmd: 'add torch', pos: [-30, 0] }, { cmd: 'add torch', pos: [30, 0] },
      { cmd: 'add torch', pos: [0, 18] }, { cmd: 'add torch', pos: [0, -18] },
      // === ROADS — connecting paths ===
      { cmd: 'add road at 0 18', pos: [0, 18] },   // center to north
      { cmd: 'add road at 0 -18', pos: [0, -18] },  // center to south  
      { cmd: 'add road', pos: [0, 0] },              // center crossroad
      // === PERIMETER — nature ring far from buildings ===
      { cmd: 'add tree', scatter: { count: 35, radius: 80, avoidCenter: 50 } },
      { cmd: 'add bush', scatter: { count: 18, radius: 70, avoidCenter: 45 } },
      { cmd: 'add rock', scatter: { count: 8, radius: 75, avoidCenter: 50 } },
      // === NPCs — spread around the plaza ===
      { cmd: 'spawn villager', scatter: { count: 6, radius: 25 } },
      { cmd: 'spawn guard', pos: [-18, 20] }, { cmd: 'spawn guard', pos: [18, 20] },
    ]
  },
  village: {
    terrain: { type: 'flat', height: 0 },
    ground: 'grass', env: ['time morning'],
    items: [
      { cmd: 'add modern house', pos: [12, -8] }, { cmd: 'add modern house', pos: [-14, 6] },
      { cmd: 'add modern house', pos: [6, 18] }, { cmd: 'add modern house', pos: [-10, -20] },
      { cmd: 'add campfire', pos: [0, 0] },
      { cmd: 'add well', pos: [8, -4] },
      { cmd: 'add log', pos: [-2, 2] }, { cmd: 'add log', pos: [2, -2] },
      { cmd: 'add chicken', scatter: { count: 6, radius: 18 } },
      { cmd: 'add tree', scatter: { count: 25, radius: 60, avoidCenter: 10 } },
      { cmd: 'add bush', scatter: { count: 15, radius: 45 } },
      { cmd: 'add flower', scatter: { count: 10, radius: 30 } },
      { cmd: 'add rock', scatter: { count: 8, radius: 50 } },
      { cmd: 'spawn villager', scatter: { count: 4, radius: 25 } },
      { cmd: 'spawn farmer', scatter: { count: 2, radius: 20 } },
    ]
  },
  kingdom: {
    terrain: { type: 'hills', height: 0.4 },
    ground: 'grass', env: ['time afternoon'],
    items: [
      { cmd: 'add castle', pos: [0, -50] },
      { cmd: 'add tower', pos: [-40, -40] }, { cmd: 'add tower', pos: [40, -40] },
      { cmd: 'add tower', pos: [-40, 0] }, { cmd: 'add tower', pos: [40, 0] },
      { cmd: 'add wall', pos: [-20, -45] }, { cmd: 'add wall', pos: [20, -45] },
      { cmd: 'add gate', pos: [0, -30] },
      { cmd: 'add tavern', pos: [25, 10] }, { cmd: 'add blacksmith', pos: [-25, 10] },
      { cmd: 'add modern house', scatter: { count: 10, radius: 40, avoidCenter: 15 } },
      { cmd: 'add market stall', scatter: { count: 4, radius: 25 } },
      { cmd: 'add tree', scatter: { count: 15, radius: 70, avoidCenter: 25 } },
      { cmd: 'add torch', scatter: { count: 15, radius: 45 } },
      { cmd: 'spawn guard', scatter: { count: 6, radius: 40 } },
      { cmd: 'spawn knight', scatter: { count: 3, radius: 35 } },
      { cmd: 'spawn villager', scatter: { count: 8, radius: 35 } },
    ]
  },
  'medieval siege': {
    terrain: { type: 'hills', height: 0.5 },
    ground: 'dirt', env: ['time sunset', 'fog on'], weather: 'rain', particles: 'ash',
    items: [
      { cmd: 'add castle', pos: [0, -40] },
      { cmd: 'add tower', pos: [-30, -35] }, { cmd: 'add tower', pos: [30, -35] },
      { cmd: 'add wall', pos: [-15, -30] }, { cmd: 'add wall', pos: [15, -30] },
      { cmd: 'add campfire', pos: [20, 20] }, { cmd: 'add campfire', pos: [-20, 20] },
      { cmd: 'add tent', pos: [25, 25] }, { cmd: 'add tent', pos: [-25, 25] },
      { cmd: 'add barrel', scatter: { count: 8, radius: 25 } },
      { cmd: 'add rock', scatter: { count: 10, radius: 50 } },
      { cmd: 'add dead tree', scatter: { count: 6, radius: 60 } },
      { cmd: 'spawn soldier', scatter: { count: 8, radius: 30 } },
      { cmd: 'spawn knight', scatter: { count: 4, radius: 20 } },
    ]
  },
  dungeon: {
    terrain: { type: 'flat' },
    ground: 'stone', env: ['time night', 'fog on'], particles: 'embers',
    items: [
      { cmd: 'add castle', pos: [0, 0] },
      { cmd: 'add torch', scatter: { count: 12, radius: 25 } },
      { cmd: 'add barrel', scatter: { count: 6, radius: 20 } },
      { cmd: 'add chest', scatter: { count: 3, radius: 15 } },
      { cmd: 'add rock', scatter: { count: 8, radius: 30 } },
      { cmd: 'spawn skeleton', scatter: { count: 5, radius: 25 } },
      { cmd: 'spawn enemies', scatter: { count: 3, radius: 20 } },
    ]
  },
  
  // ===== NATURE & WILDERNESS =====
  forest: {
    terrain: { type: 'hills', height: 0.4 },
    ground: 'grass', env: ['time morning'], particles: 'fireflies',
    items: [
      { cmd: 'add pine tree', scatter: { count: 40, radius: 80 } },
      { cmd: 'add tree', scatter: { count: 25, radius: 70 } },
      { cmd: 'add bush', scatter: { count: 20, radius: 60 } },
      { cmd: 'add flower', scatter: { count: 15, radius: 50 } },
      { cmd: 'add mushroom', scatter: { count: 10, radius: 40 } },
      { cmd: 'add rock', scatter: { count: 12, radius: 65 } },
      { cmd: 'add boulder', scatter: { count: 4, radius: 55 } },
      { cmd: 'add log', scatter: { count: 6, radius: 50 } },
      { cmd: 'add deer', scatter: { count: 3, radius: 50 } },
      { cmd: 'add fox', scatter: { count: 2, radius: 40 } },
      { cmd: 'add campfire', pos: [0, 0] },
    ]
  },
  'enchanted forest': {
    terrain: { type: 'hills', height: 0.5 },
    ground: 'grass', env: ['time night'], particles: 'fireflies',
    items: [
      { cmd: 'add cherry blossom', scatter: { count: 15, radius: 60 } },
      { cmd: 'add tree', scatter: { count: 30, radius: 80 } },
      { cmd: 'add mushroom', scatter: { count: 15, radius: 50 } },
      { cmd: 'add flower', scatter: { count: 20, radius: 50 } },
      { cmd: 'add crystal', scatter: { count: 8, radius: 40 } },
      { cmd: 'add rock', scatter: { count: 10, radius: 60 } },
      { cmd: 'add fountain', pos: [0, 0] },
      { cmd: 'add torch', scatter: { count: 8, radius: 30 } },
      { cmd: 'spawn witch', scatter: { count: 2, radius: 30 } },
      { cmd: 'spawn villager', scatter: { count: 3, radius: 25 } },
    ]
  },
  mountain: {
    terrain: { type: 'mountains', height: 1.2 },
    ground: 'gravel', env: ['time afternoon'], particles: 'dust',
    items: [
      { cmd: 'add pine tree', scatter: { count: 20, radius: 60, avoidCenter: 10 } },
      { cmd: 'add boulder', scatter: { count: 15, radius: 70 } },
      { cmd: 'add rock', scatter: { count: 20, radius: 80 } },
      { cmd: 'add eagle', scatter: { count: 2, radius: 40 } },
      { cmd: 'add campfire', pos: [0, 0] },
      { cmd: 'add tent', pos: [5, 5] },
    ]
  },
  island: {
    terrain: { type: 'island', height: 1.0 },
    ground: 'sand', env: ['time afternoon'],
    water: 'tropical', particles: null,
    items: [
      { cmd: 'add ocean' },
      { cmd: 'add palm tree', scatter: { count: 20, radius: 40, avoidCenter: 5 } },
      { cmd: 'add bush', scatter: { count: 10, radius: 35 } },
      { cmd: 'add rock', scatter: { count: 8, radius: 45 } },
      { cmd: 'add flower', scatter: { count: 8, radius: 30 } },
      { cmd: 'add boat', pos: [40, 0] },
      { cmd: 'add campfire', pos: [0, 5] },
      { cmd: 'add chest', pos: [15, -10] },
    ]
  },
  'tropical paradise': {
    terrain: { type: 'island', height: 1.0 },
    ground: 'sand', env: ['time afternoon'],
    water: 'tropical',
    items: [
      { cmd: 'add ocean' },
      { cmd: 'add palm tree', scatter: { count: 30, radius: 45 } },
      { cmd: 'add bush', scatter: { count: 15, radius: 40 } },
      { cmd: 'add flower', scatter: { count: 12, radius: 35 } },
      { cmd: 'add rock', scatter: { count: 10, radius: 50 } },
      { cmd: 'add boat', pos: [45, 0] }, { cmd: 'add boat', pos: [-40, 15] },
      { cmd: 'add campfire', pos: [5, 8] },
      { cmd: 'add tent', pos: [10, 10] },
      { cmd: 'add chest', pos: [-8, -5] },
      { cmd: 'add parrot', scatter: { count: 3, radius: 30 } },
      { cmd: 'spawn villager', scatter: { count: 3, radius: 25 } },
    ]
  },
  jungle: {
    terrain: { type: 'hills', height: 0.6 },
    ground: 'mud', env: ['time morning'], weather: 'rain', particles: 'spores',
    items: [
      { cmd: 'add tree', scatter: { count: 45, radius: 80 } },
      { cmd: 'add palm tree', scatter: { count: 15, radius: 60 } },
      { cmd: 'add bush', scatter: { count: 25, radius: 65 } },
      { cmd: 'add flower', scatter: { count: 15, radius: 50 } },
      { cmd: 'add mushroom', scatter: { count: 12, radius: 45 } },
      { cmd: 'add vine', scatter: { count: 8, radius: 50 } },
      { cmd: 'add boulder', scatter: { count: 6, radius: 55 } },
      { cmd: 'add rock', scatter: { count: 10, radius: 60 } },
      { cmd: 'add snake', scatter: { count: 3, radius: 30 } },
      { cmd: 'add parrot', scatter: { count: 4, radius: 40 } },
      { cmd: 'add campfire', pos: [0, 0] },
    ]
  },
  
  // ===== HARSH ENVIRONMENTS =====
  desert: {
    terrain: { type: 'dunes', height: 0.8 },
    ground: 'sand', env: ['time noon'], particles: 'dust',
    items: [
      { cmd: 'add cactus', scatter: { count: 15, radius: 70 } },
      { cmd: 'add rock', scatter: { count: 20, radius: 80 } },
      { cmd: 'add boulder', scatter: { count: 6, radius: 60 } },
      { cmd: 'add dead tree', scatter: { count: 4, radius: 55 } },
      { cmd: 'add skull', scatter: { count: 3, radius: 40 } },
      { cmd: 'add tent', pos: [0, 0] },
      { cmd: 'add campfire', pos: [5, 0] },
      { cmd: 'add barrel', pos: [3, 3] },
      { cmd: 'add camel', scatter: { count: 2, radius: 30 } },
    ]
  },
  'arctic storm': {
    terrain: { type: 'hills', height: 0.6 },
    ground: 'snow', env: ['time morning'], weather: 'snow',
    water: 'arctic', particles: 'snow',
    items: [
      { cmd: 'add ocean 300' },
      { cmd: 'add pine tree', scatter: { count: 15, radius: 60 } },
      { cmd: 'add rock', scatter: { count: 15, radius: 70 } },
      { cmd: 'add boulder', scatter: { count: 8, radius: 60 } },
      { cmd: 'add modern house', pos: [0, 0] },
      { cmd: 'add campfire', pos: [8, 0] },
      { cmd: 'add barrel', scatter: { count: 4, radius: 15 } },
      { cmd: 'add wolf', scatter: { count: 3, radius: 40 } },
      { cmd: 'add husky', scatter: { count: 2, radius: 20 } },
    ]
  },
  frozen: {
    terrain: { type: 'plateau', height: 0.7 },
    ground: 'ice', env: ['time dawn'], weather: 'snow', particles: 'snow',
    items: [
      { cmd: 'add pine tree', scatter: { count: 10, radius: 50 } },
      { cmd: 'add rock', scatter: { count: 20, radius: 70 } },
      { cmd: 'add boulder', scatter: { count: 10, radius: 60 } },
      { cmd: 'add crystal', scatter: { count: 5, radius: 30 } },
      { cmd: 'add chest', pos: [0, 0] },
      { cmd: 'add wolf', scatter: { count: 4, radius: 45 } },
    ]
  },
  volcano: {
    terrain: { type: 'volcano', height: 1.5 },
    ground: 'lava', env: ['time night'], particles: 'embers',
    items: [
      { cmd: 'add rock', scatter: { count: 25, radius: 80 } },
      { cmd: 'add boulder', scatter: { count: 10, radius: 60 } },
      { cmd: 'add dead tree', scatter: { count: 6, radius: 50 } },
      { cmd: 'add torch', scatter: { count: 8, radius: 30 } },
      { cmd: 'spawn enemies', scatter: { count: 5, radius: 40 } },
    ]
  },
  
  // ===== WATER WORLDS =====
  hurricane: {
    terrain: { type: 'island', height: 0.8 },
    ground: 'mud', env: ['time night'],
    water: 'hurricane', weather: 'rain', particles: 'rain',
    items: [
      { cmd: 'add ocean 400' },
      { cmd: 'add palm tree', scatter: { count: 8, radius: 35 } },
      { cmd: 'add rock', scatter: { count: 12, radius: 40 } },
      { cmd: 'add boat', pos: [45, 10] },
      { cmd: 'add barrel', scatter: { count: 6, radius: 25 } },
      { cmd: 'add modern house', pos: [0, 0] },
    ]
  },
  'ocean voyage': {
    terrain: { type: 'flat' },
    ground: 'sand', env: ['time afternoon'],
    water: 'ocean',
    items: [
      { cmd: 'add ocean 500' },
      { cmd: 'add boat', pos: [0, 0] }, { cmd: 'add boat', pos: [30, 20] },
      { cmd: 'add boat', pos: [-25, -15] },
      { cmd: 'add barrel', pos: [3, 0] },
      { cmd: 'add chest', pos: [-2, 0] },
    ]
  },
  'dark swamp': {
    terrain: { type: 'hills', height: 0.15 },
    ground: 'mud', env: ['time night', 'fog on'],
    water: 'swamp', particles: 'spores',
    items: [
      { cmd: 'add lake 80' },
      { cmd: 'add dead tree', scatter: { count: 20, radius: 60 } },
      { cmd: 'add tree', scatter: { count: 10, radius: 50 } },
      { cmd: 'add bush', scatter: { count: 15, radius: 45 } },
      { cmd: 'add mushroom', scatter: { count: 12, radius: 40 } },
      { cmd: 'add rock', scatter: { count: 10, radius: 50 } },
      { cmd: 'add log', scatter: { count: 6, radius: 35 } },
      { cmd: 'add frog', scatter: { count: 4, radius: 30 } },
      { cmd: 'add snake', scatter: { count: 3, radius: 25 } },
      { cmd: 'add torch', scatter: { count: 6, radius: 25 } },
      { cmd: 'spawn witch', scatter: { count: 2, radius: 30 } },
    ]
  },
  'pirate cove': {
    terrain: { type: 'island', height: 0.8 },
    ground: 'sand', env: ['time sunset'],
    water: 'ocean',
    items: [
      { cmd: 'add ocean 400' },
      { cmd: 'add boat', pos: [50, 0] }, { cmd: 'add boat', pos: [-45, 20] },
      { cmd: 'add palm tree', scatter: { count: 15, radius: 35 } },
      { cmd: 'add barrel', scatter: { count: 8, radius: 20 } },
      { cmd: 'add chest', pos: [0, -10] }, { cmd: 'add chest', pos: [8, -8] },
      { cmd: 'add campfire', pos: [0, 5] },
      { cmd: 'add tent', pos: [10, 8] },
      { cmd: 'add torch', scatter: { count: 6, radius: 20 } },
      { cmd: 'add skull', scatter: { count: 3, radius: 15 } },
      { cmd: 'spawn villager', scatter: { count: 4, radius: 20 } },
    ]
  },
  
  // ===== COMBAT ARENAS =====
  arena: {
    terrain: { type: 'flat' },
    ground: 'sand', env: ['time afternoon'],
    items: [
      { cmd: 'add column', pos: [15, 15] }, { cmd: 'add column', pos: [-15, 15] },
      { cmd: 'add column', pos: [15, -15] }, { cmd: 'add column', pos: [-15, -15] },
      { cmd: 'add column', pos: [25, 0] }, { cmd: 'add column', pos: [-25, 0] },
      { cmd: 'add column', pos: [0, 25] }, { cmd: 'add column', pos: [0, -25] },
      { cmd: 'add torch', scatter: { count: 12, radius: 28 } },
      { cmd: 'add barrel', scatter: { count: 6, radius: 20 } },
      { cmd: 'spawn enemies 5' },
    ]
  },
  battlefield: {
    terrain: { type: 'hills', height: 0.3 },
    ground: 'dirt', env: ['time sunset', 'fog on'], particles: 'ash',
    items: [
      { cmd: 'add tent', pos: [40, 0] }, { cmd: 'add tent', pos: [45, 10] },
      { cmd: 'add tent', pos: [-40, 0] }, { cmd: 'add tent', pos: [-45, 10] },
      { cmd: 'add campfire', pos: [42, 5] }, { cmd: 'add campfire', pos: [-42, 5] },
      { cmd: 'add barrel', scatter: { count: 10, radius: 30 } },
      { cmd: 'add rock', scatter: { count: 12, radius: 50 } },
      { cmd: 'add dead tree', scatter: { count: 5, radius: 40 } },
      { cmd: 'spawn soldier', scatter: { count: 6, radius: 35 } },
      { cmd: 'spawn knight', scatter: { count: 4, radius: 30 } },
    ]
  },
  'war zone': {
    terrain: { type: 'hills', height: 0.4 },
    ground: 'dirt', env: ['time night'], weather: 'rain', particles: 'embers',
    items: [
      { cmd: 'add tank', pos: [20, 0] }, { cmd: 'add tank', pos: [-25, 10] },
      { cmd: 'add tent', scatter: { count: 4, radius: 30 } },
      { cmd: 'add barrel', scatter: { count: 10, radius: 35 } },
      { cmd: 'add rock', scatter: { count: 15, radius: 50 } },
      { cmd: 'add boulder', scatter: { count: 5, radius: 40 } },
      { cmd: 'add dead tree', scatter: { count: 8, radius: 45 } },
      { cmd: 'add campfire', scatter: { count: 3, radius: 25 } },
      { cmd: 'spawn soldier', scatter: { count: 8, radius: 35 } },
    ]
  },
  
  // ===== FANTASY =====
  'dragon lair': {
    terrain: { type: 'volcano', height: 1.0 },
    ground: 'stone', env: ['time night'], particles: 'embers',
    items: [
      { cmd: 'add boulder', scatter: { count: 15, radius: 60 } },
      { cmd: 'add rock', scatter: { count: 20, radius: 70 } },
      { cmd: 'add dead tree', scatter: { count: 6, radius: 50 } },
      { cmd: 'add chest', scatter: { count: 5, radius: 20 } },
      { cmd: 'add torch', scatter: { count: 10, radius: 30 } },
      { cmd: 'add crystal', scatter: { count: 4, radius: 25 } },
      { cmd: 'add dragon', pos: [0, 0] },
      { cmd: 'spawn enemies', scatter: { count: 4, radius: 35 } },
    ]
  },
  graveyard: {
    terrain: { type: 'flat', height: 0 },
    ground: 'dirt', env: ['time night', 'fog on'], particles: 'dust',
    items: [
      { cmd: 'add tombstone', scatter: { count: 20, radius: 40 } },
      { cmd: 'add dead tree', scatter: { count: 8, radius: 50 } },
      { cmd: 'add church', pos: [0, -30] },
      { cmd: 'add torch', scatter: { count: 6, radius: 30 } },
      { cmd: 'add fence', scatter: { count: 8, radius: 35 } },
      { cmd: 'add rock', scatter: { count: 10, radius: 45 } },
      { cmd: 'spawn skeleton', scatter: { count: 6, radius: 30 } },
    ]
  },
  haunted: {
    terrain: { type: 'hills', height: 0.3 },
    ground: 'stone', env: ['time night', 'fog on'], particles: 'fireflies',
    items: [
      { cmd: 'add castle', pos: [0, -35] },
      { cmd: 'add dead tree', scatter: { count: 15, radius: 60 } },
      { cmd: 'add tombstone', scatter: { count: 10, radius: 40 } },
      { cmd: 'add torch', scatter: { count: 8, radius: 30 } },
      { cmd: 'add rock', scatter: { count: 12, radius: 50 } },
      { cmd: 'add gate', pos: [0, -15] },
      { cmd: 'add fence', scatter: { count: 10, radius: 35 } },
      { cmd: 'spawn skeleton', scatter: { count: 5, radius: 35 } },
      { cmd: 'spawn witch', scatter: { count: 2, radius: 25 } },
    ]
  },
  ruins: {
    terrain: { type: 'canyon', height: 0.6 },
    ground: 'gravel', env: ['time sunset'], particles: 'dust',
    items: [
      { cmd: 'add column', scatter: { count: 12, radius: 30 } },
      { cmd: 'add arch', scatter: { count: 4, radius: 25 } },
      { cmd: 'add wall', scatter: { count: 6, radius: 35 } },
      { cmd: 'add rock', scatter: { count: 15, radius: 50 } },
      { cmd: 'add boulder', scatter: { count: 8, radius: 45 } },
      { cmd: 'add chest', scatter: { count: 3, radius: 20 } },
      { cmd: 'add torch', scatter: { count: 6, radius: 25 } },
      { cmd: 'add bush', scatter: { count: 8, radius: 40 } },
    ]
  },
  
  // ===== MODERN & SCI-FI =====
  cyberpunk: {
    terrain: { type: 'flat' },
    ground: 'concrete', env: ['time night'], particles: 'embers',
    items: [
      { cmd: 'add building', scatter: { count: 10, radius: 60 } },
      { cmd: 'add tower', scatter: { count: 4, radius: 50 } },
      { cmd: 'add car', scatter: { count: 6, radius: 40 } },
      { cmd: 'add motorcycle', scatter: { count: 3, radius: 30 } },
      { cmd: 'add barrel', scatter: { count: 8, radius: 35 } },
      { cmd: 'add dumpster', scatter: { count: 4, radius: 30 } },
      { cmd: 'add light', scatter: { count: 12, radius: 45 } },
      { cmd: 'spawn scifi', scatter: { count: 5, radius: 35 } },
    ]
  },
  space: {
    terrain: { type: 'crater', height: 0.8 },
    ground: 'stone', env: ['time night'], particles: 'dust',
    items: [
      { cmd: 'add boulder', scatter: { count: 20, radius: 70 } },
      { cmd: 'add rock', scatter: { count: 25, radius: 80 } },
      { cmd: 'add crystal', scatter: { count: 8, radius: 40 } },
      { cmd: 'add mech', scatter: { count: 2, radius: 30 } },
      { cmd: 'add console', scatter: { count: 3, radius: 20 } },
      { cmd: 'add crate', scatter: { count: 6, radius: 25 } },
      { cmd: 'spawn scifi', scatter: { count: 3, radius: 25 } },
    ]
  },
  
  // ===== PEACEFUL & ZEN =====
  zen: {
    terrain: { type: 'hills', height: 0.15 },
    ground: 'gravel', env: ['time morning'], particles: 'leaves',
    items: [
      { cmd: 'add cherry blossom', scatter: { count: 12, radius: 40 } },
      { cmd: 'add tree', scatter: { count: 8, radius: 50 } },
      { cmd: 'add bush', scatter: { count: 10, radius: 35 } },
      { cmd: 'add flower', scatter: { count: 15, radius: 30 } },
      { cmd: 'add rock', scatter: { count: 8, radius: 25 } },
      { cmd: 'add fountain', pos: [0, 0] },
      { cmd: 'add bench', pos: [8, 0] }, { cmd: 'add bench', pos: [-8, 0] },
      { cmd: 'add bridge', pos: [0, 15] },
      { cmd: 'add lantern', scatter: { count: 6, radius: 25 } },
    ]
  },
  camp: {
    terrain: { type: 'hills', height: 0.25 },
    ground: 'grass', env: ['time sunset'], particles: 'fireflies',
    items: [
      { cmd: 'add campfire', pos: [0, 0] },
      { cmd: 'add tent', pos: [8, 5] }, { cmd: 'add tent', pos: [-8, 5] },
      { cmd: 'add log', pos: [3, -3] }, { cmd: 'add log', pos: [-3, -3] },
      { cmd: 'add barrel', pos: [10, -2] },
      { cmd: 'add tree', scatter: { count: 25, radius: 60, avoidCenter: 10 } },
      { cmd: 'add bush', scatter: { count: 12, radius: 45 } },
      { cmd: 'add rock', scatter: { count: 8, radius: 50 } },
      { cmd: 'add horse', scatter: { count: 2, radius: 15 } },
      { cmd: 'spawn villager', scatter: { count: 3, radius: 15 } },
    ]
  },
  
  // ===== SPECIAL =====
  western: {
    terrain: { type: 'dunes', height: 0.4 },
    ground: 'sand', env: ['time noon'], particles: 'dust',
    items: [
      { cmd: 'add modern house', pos: [20, 0] }, { cmd: 'add modern house', pos: [-20, 0] },
      { cmd: 'add modern house', pos: [0, 20] }, { cmd: 'add tavern', pos: [0, -20] },
      { cmd: 'add well', pos: [0, 0] },
      { cmd: 'add barrel', scatter: { count: 6, radius: 20 } },
      { cmd: 'add cactus', scatter: { count: 10, radius: 50 } },
      { cmd: 'add horse', scatter: { count: 3, radius: 25 } },
      { cmd: 'add dead tree', scatter: { count: 4, radius: 40 } },
      { cmd: 'add rock', scatter: { count: 8, radius: 45 } },
      { cmd: 'spawn villager', scatter: { count: 4, radius: 20 } },
      { cmd: 'spawn guard', scatter: { count: 2, radius: 15 } },
    ]
  },
  floating: {
    terrain: { type: 'plateau', height: 1.0 },
    ground: 'grass', env: ['time afternoon'], particles: 'leaves',
    items: [
      { cmd: 'add tree', scatter: { count: 15, radius: 40 } },
      { cmd: 'add flower', scatter: { count: 12, radius: 30 } },
      { cmd: 'add bush', scatter: { count: 8, radius: 35 } },
      { cmd: 'add rock', scatter: { count: 10, radius: 45 } },
      { cmd: 'add crystal', scatter: { count: 5, radius: 25 } },
      { cmd: 'add fountain', pos: [0, 0] },
      { cmd: 'add bridge', pos: [20, 0] },
      { cmd: 'add torch', scatter: { count: 6, radius: 30 } },
    ]
  },
  swamp: {
    terrain: { type: 'hills', height: 0.1 },
    ground: 'mud', env: ['time night', 'fog on'],
    water: 'swamp', particles: 'spores',
    items: [
      { cmd: 'add lake 60' },
      { cmd: 'add dead tree', scatter: { count: 18, radius: 55 } },
      { cmd: 'add mushroom', scatter: { count: 15, radius: 40 } },
      { cmd: 'add bush', scatter: { count: 12, radius: 45 } },
      { cmd: 'add rock', scatter: { count: 10, radius: 50 } },
      { cmd: 'add log', scatter: { count: 8, radius: 35 } },
      { cmd: 'add frog', scatter: { count: 4, radius: 30 } },
      { cmd: 'add torch', scatter: { count: 4, radius: 20 } },
      { cmd: 'spawn witch', scatter: { count: 2, radius: 25 } },
    ]
  },

  city: {
    terrain: { type: 'flat', height: 0 },
    ground: 'grass', env: ['time afternoon'],
    items: [
      { cmd: 'add road', pos: [-200, -280] },
      { cmd: 'add road', pos: [-200, -240] },
      { cmd: 'add road', pos: [-200, -160] },
      { cmd: 'add road', pos: [-200, -120] },
      { cmd: 'add road', pos: [-200, -80] },
      { cmd: 'add road', pos: [-200, -40] },
      { cmd: 'add road', pos: [-200, 40] },
      { cmd: 'add road', pos: [-200, 80] },
      { cmd: 'add road', pos: [-200, 120] },
      { cmd: 'add road', pos: [-200, 160] },
      { cmd: 'add road', pos: [-200, 240] },
      { cmd: 'add road', pos: [-100, -280] },
      { cmd: 'add road', pos: [-100, -240] },
      { cmd: 'add road', pos: [-100, -160] },
      { cmd: 'add road', pos: [-100, -120] },
      { cmd: 'add road', pos: [-100, -80] },
      { cmd: 'add road', pos: [-100, -40] },
      { cmd: 'add road', pos: [-100, 40] },
      { cmd: 'add road', pos: [-100, 80] },
      { cmd: 'add road', pos: [-100, 120] },
      { cmd: 'add road', pos: [-100, 160] },
      { cmd: 'add road', pos: [-100, 240] },
      { cmd: 'add road', pos: [0, -280] },
      { cmd: 'add road', pos: [0, -240] },
      { cmd: 'add road', pos: [0, -160] },
      { cmd: 'add road', pos: [0, -120] },
      { cmd: 'add road', pos: [0, -80] },
      { cmd: 'add road', pos: [0, -40] },
      { cmd: 'add road', pos: [0, 40] },
      { cmd: 'add road', pos: [0, 80] },
      { cmd: 'add road', pos: [0, 120] },
      { cmd: 'add road', pos: [0, 160] },
      { cmd: 'add road', pos: [0, 240] },
      { cmd: 'add road', pos: [100, -280] },
      { cmd: 'add road', pos: [100, -240] },
      { cmd: 'add road', pos: [100, -160] },
      { cmd: 'add road', pos: [100, -120] },
      { cmd: 'add road', pos: [100, -80] },
      { cmd: 'add road', pos: [100, -40] },
      { cmd: 'add road', pos: [100, 40] },
      { cmd: 'add road', pos: [100, 80] },
      { cmd: 'add road', pos: [100, 120] },
      { cmd: 'add road', pos: [100, 160] },
      { cmd: 'add road', pos: [100, 240] },
      { cmd: 'add road', pos: [200, -280] },
      { cmd: 'add road', pos: [200, -240] },
      { cmd: 'add road', pos: [200, -160] },
      { cmd: 'add road', pos: [200, -120] },
      { cmd: 'add road', pos: [200, -80] },
      { cmd: 'add road', pos: [200, -40] },
      { cmd: 'add road', pos: [200, 40] },
      { cmd: 'add road', pos: [200, 80] },
      { cmd: 'add road', pos: [200, 120] },
      { cmd: 'add road', pos: [200, 160] },
      { cmd: 'add road', pos: [200, 240] },
      { cmd: 'add road at 0 0 ew', pos: [-280, -200] },
      { cmd: 'add road at 0 0 ew', pos: [-240, -200] },
      { cmd: 'add road at 0 0 ew', pos: [-160, -200] },
      { cmd: 'add road at 0 0 ew', pos: [-120, -200] },
      { cmd: 'add road at 0 0 ew', pos: [-80, -200] },
      { cmd: 'add road at 0 0 ew', pos: [-40, -200] },
      { cmd: 'add road at 0 0 ew', pos: [40, -200] },
      { cmd: 'add road at 0 0 ew', pos: [80, -200] },
      { cmd: 'add road at 0 0 ew', pos: [120, -200] },
      { cmd: 'add road at 0 0 ew', pos: [160, -200] },
      { cmd: 'add road at 0 0 ew', pos: [240, -200] },
      { cmd: 'add road at 0 0 ew', pos: [-280, -100] },
      { cmd: 'add road at 0 0 ew', pos: [-240, -100] },
      { cmd: 'add road at 0 0 ew', pos: [-160, -100] },
      { cmd: 'add road at 0 0 ew', pos: [-120, -100] },
      { cmd: 'add road at 0 0 ew', pos: [-80, -100] },
      { cmd: 'add road at 0 0 ew', pos: [-40, -100] },
      { cmd: 'add road at 0 0 ew', pos: [40, -100] },
      { cmd: 'add road at 0 0 ew', pos: [80, -100] },
      { cmd: 'add road at 0 0 ew', pos: [120, -100] },
      { cmd: 'add road at 0 0 ew', pos: [160, -100] },
      { cmd: 'add road at 0 0 ew', pos: [240, -100] },
      { cmd: 'add road at 0 0 ew', pos: [-280, 0] },
      { cmd: 'add road at 0 0 ew', pos: [-240, 0] },
      { cmd: 'add road at 0 0 ew', pos: [-160, 0] },
      { cmd: 'add road at 0 0 ew', pos: [-120, 0] },
      { cmd: 'add road at 0 0 ew', pos: [-80, 0] },
      { cmd: 'add road at 0 0 ew', pos: [-40, 0] },
      { cmd: 'add road at 0 0 ew', pos: [40, 0] },
      { cmd: 'add road at 0 0 ew', pos: [80, 0] },
      { cmd: 'add road at 0 0 ew', pos: [120, 0] },
      { cmd: 'add road at 0 0 ew', pos: [160, 0] },
      { cmd: 'add road at 0 0 ew', pos: [240, 0] },
      { cmd: 'add road at 0 0 ew', pos: [-280, 100] },
      { cmd: 'add road at 0 0 ew', pos: [-240, 100] },
      { cmd: 'add road at 0 0 ew', pos: [-160, 100] },
      { cmd: 'add road at 0 0 ew', pos: [-120, 100] },
      { cmd: 'add road at 0 0 ew', pos: [-80, 100] },
      { cmd: 'add road at 0 0 ew', pos: [-40, 100] },
      { cmd: 'add road at 0 0 ew', pos: [40, 100] },
      { cmd: 'add road at 0 0 ew', pos: [80, 100] },
      { cmd: 'add road at 0 0 ew', pos: [120, 100] },
      { cmd: 'add road at 0 0 ew', pos: [160, 100] },
      { cmd: 'add road at 0 0 ew', pos: [240, 100] },
      { cmd: 'add road at 0 0 ew', pos: [-280, 200] },
      { cmd: 'add road at 0 0 ew', pos: [-240, 200] },
      { cmd: 'add road at 0 0 ew', pos: [-160, 200] },
      { cmd: 'add road at 0 0 ew', pos: [-120, 200] },
      { cmd: 'add road at 0 0 ew', pos: [-80, 200] },
      { cmd: 'add road at 0 0 ew', pos: [-40, 200] },
      { cmd: 'add road at 0 0 ew', pos: [40, 200] },
      { cmd: 'add road at 0 0 ew', pos: [80, 200] },
      { cmd: 'add road at 0 0 ew', pos: [120, 200] },
      { cmd: 'add road at 0 0 ew', pos: [160, 200] },
      { cmd: 'add road at 0 0 ew', pos: [240, 200] },
      { cmd: 'add intersection', pos: [-200, -200] },
      { cmd: 'add intersection', pos: [-200, -100] },
      { cmd: 'add intersection', pos: [-200, 0] },
      { cmd: 'add intersection', pos: [-200, 100] },
      { cmd: 'add intersection', pos: [-200, 200] },
      { cmd: 'add intersection', pos: [-100, -200] },
      { cmd: 'add intersection', pos: [-100, -100] },
      { cmd: 'add intersection', pos: [-100, 0] },
      { cmd: 'add intersection', pos: [-100, 100] },
      { cmd: 'add intersection', pos: [-100, 200] },
      { cmd: 'add intersection', pos: [0, -200] },
      { cmd: 'add intersection', pos: [0, -100] },
      { cmd: 'add intersection', pos: [0, 0] },
      { cmd: 'add intersection', pos: [0, 100] },
      { cmd: 'add intersection', pos: [0, 200] },
      { cmd: 'add intersection', pos: [100, -200] },
      { cmd: 'add intersection', pos: [100, -100] },
      { cmd: 'add intersection', pos: [100, 0] },
      { cmd: 'add intersection', pos: [100, 100] },
      { cmd: 'add intersection', pos: [100, 200] },
      { cmd: 'add intersection', pos: [200, -200] },
      { cmd: 'add intersection', pos: [200, -100] },
      { cmd: 'add intersection', pos: [200, 0] },
      { cmd: 'add intersection', pos: [200, 100] },
      { cmd: 'add intersection', pos: [200, 200] },
      { cmd: 'add skyscraper', pos: [-50, -50] },
      { cmd: 'add apartment', pos: [-20, -50] },
      { cmd: 'add skyscraper', pos: [50, -50] },
      { cmd: 'add apartment', pos: [80, -50] },
      { cmd: 'add skyscraper', pos: [-50, 50] },
      { cmd: 'add apartment', pos: [-20, 50] },
      { cmd: 'add skyscraper', pos: [50, 50] },
      { cmd: 'add apartment', pos: [80, 50] },
      { cmd: 'add grocery', pos: [-75, -165], rot: 1.5708 },
      { cmd: 'add restaurant', pos: [-75, -135], rot: 1.5708 },
      { cmd: 'add apartment', pos: [-50, -150] },
      { cmd: 'add restaurant', pos: [25, -165], rot: 1.5708 },
      { cmd: 'add bank', pos: [25, -135], rot: 1.5708 },
      { cmd: 'add apartment', pos: [50, -150] },
      { cmd: 'add bank', pos: [-75, 135], rot: 1.5708 },
      { cmd: 'add cafe', pos: [-75, 165], rot: 1.5708 },
      { cmd: 'add apartment', pos: [-50, 150] },
      { cmd: 'add cafe', pos: [25, 135], rot: 1.5708 },
      { cmd: 'add salon', pos: [25, 165], rot: 1.5708 },
      { cmd: 'add apartment', pos: [50, 150] },
      { cmd: 'add salon', pos: [-175, -65], rot: 1.5708 },
      { cmd: 'add pharmacy', pos: [-175, -35], rot: 1.5708 },
      { cmd: 'add apartment', pos: [-150, -50] },
      { cmd: 'add pharmacy', pos: [-175, 35], rot: 1.5708 },
      { cmd: 'add clothing', pos: [-175, 65], rot: 1.5708 },
      { cmd: 'add apartment', pos: [-150, 50] },
      { cmd: 'add clothing', pos: [125, -65], rot: 1.5708 },
      { cmd: 'add barber', pos: [125, -35], rot: 1.5708 },
      { cmd: 'add apartment', pos: [150, -50] },
      { cmd: 'add barber', pos: [125, 35], rot: 1.5708 },
      { cmd: 'add grocery', pos: [125, 65], rot: 1.5708 },
      { cmd: 'add apartment', pos: [150, 50] },
      { cmd: 'add modern house', pos: [-170, -170], rot: 0 },
      { cmd: 'add modern house 2 floors', pos: [-130, -170], rot: 0 },
      { cmd: 'add pitched house', pos: [-170, -130], rot: 3.1416 },
      { cmd: 'add ranch', pos: [-130, -130], rot: 3.1416 },
      { cmd: 'add fence', pos: [-188, -150] },
      { cmd: 'add fence', pos: [-112, -150] },
      { cmd: 'add fence', pos: [-150, -188] },
      { cmd: 'add fence', pos: [-150, -112] },
      { cmd: 'add pool', pos: [-138, -140] },
      { cmd: 'add tree', pos: [-158, -150] },
      { cmd: 'add tree', pos: [-142, -150] },
      { cmd: 'add tree', pos: [-150, -158] },
      { cmd: 'add mansion', pos: [130, -170], rot: 0 },
      { cmd: 'add duplex', pos: [170, -170], rot: 0 },
      { cmd: 'add modern house', pos: [130, -130], rot: 3.1416 },
      { cmd: 'add modern house 2 floors', pos: [170, -130], rot: 3.1416 },
      { cmd: 'add fence', pos: [112, -150] },
      { cmd: 'add fence', pos: [188, -150] },
      { cmd: 'add fence', pos: [150, -188] },
      { cmd: 'add fence', pos: [150, -112] },
      { cmd: 'add pool', pos: [162, -140] },
      { cmd: 'add tree', pos: [142, -150] },
      { cmd: 'add tree', pos: [158, -150] },
      { cmd: 'add tree', pos: [150, -158] },
      { cmd: 'add pitched house', pos: [-170, 130], rot: 0 },
      { cmd: 'add ranch', pos: [-130, 130], rot: 0 },
      { cmd: 'add mansion', pos: [-170, 170], rot: 3.1416 },
      { cmd: 'add duplex', pos: [-130, 170], rot: 3.1416 },
      { cmd: 'add fence', pos: [-188, 150] },
      { cmd: 'add fence', pos: [-112, 150] },
      { cmd: 'add fence', pos: [-150, 112] },
      { cmd: 'add fence', pos: [-150, 188] },
      { cmd: 'add pool', pos: [-138, 160] },
      { cmd: 'add tree', pos: [-158, 150] },
      { cmd: 'add tree', pos: [-142, 150] },
      { cmd: 'add tree', pos: [-150, 142] },
      { cmd: 'add modern house', pos: [130, 130], rot: 0 },
      { cmd: 'add modern house 2 floors', pos: [170, 130], rot: 0 },
      { cmd: 'add pitched house', pos: [130, 170], rot: 3.1416 },
      { cmd: 'add ranch', pos: [170, 170], rot: 3.1416 },
      { cmd: 'add fence', pos: [112, 150] },
      { cmd: 'add fence', pos: [188, 150] },
      { cmd: 'add fence', pos: [150, 112] },
      { cmd: 'add fence', pos: [150, 188] },
      { cmd: 'add pool', pos: [162, 160] },
      { cmd: 'add tree', pos: [142, 150] },
      { cmd: 'add tree', pos: [158, 150] },
      { cmd: 'add tree', pos: [150, 142] },
      { cmd: 'add traffic light', pos: [-108, -8] },
      { cmd: 'add traffic light', pos: [-92, 8] },
      { cmd: 'add traffic light', pos: [92, -8] },
      { cmd: 'add traffic light', pos: [108, 8] },
      { cmd: 'add traffic light', pos: [-8, -108] },
      { cmd: 'add traffic light', pos: [8, -92] },
      { cmd: 'add traffic light', pos: [-8, 92] },
      { cmd: 'add traffic light', pos: [8, 108] },
      { cmd: 'add traffic light', pos: [-8, -8] },
      { cmd: 'add traffic light', pos: [8, 8] },
      { cmd: 'add stop sign', pos: [-193, -193] },
      { cmd: 'add stop sign', pos: [-193, 207] },
      { cmd: 'add stop sign', pos: [207, -193] },
      { cmd: 'add stop sign', pos: [207, 207] },
      { cmd: 'add ph_street_lamp_01', pos: [-9, -250] },
      { cmd: 'add ph_street_lamp_01', pos: [9, -250] },
      { cmd: 'add ph_street_lamp_01', pos: [-9, -210] },
      { cmd: 'add ph_street_lamp_01', pos: [9, -210] },
      { cmd: 'add ph_street_lamp_01', pos: [-9, -170] },
      { cmd: 'add ph_street_lamp_01', pos: [9, -170] },
      { cmd: 'add ph_street_lamp_01', pos: [-9, -130] },
      { cmd: 'add ph_street_lamp_01', pos: [9, -130] },
      { cmd: 'add ph_street_lamp_01', pos: [-9, -90] },
      { cmd: 'add ph_street_lamp_01', pos: [9, -90] },
      { cmd: 'add ph_street_lamp_01', pos: [-9, -50] },
      { cmd: 'add ph_street_lamp_01', pos: [9, -50] },
      { cmd: 'add ph_street_lamp_01', pos: [-9, -10] },
      { cmd: 'add ph_street_lamp_01', pos: [9, -10] },
      { cmd: 'add ph_street_lamp_01', pos: [-9, 30] },
      { cmd: 'add ph_street_lamp_01', pos: [9, 30] },
      { cmd: 'add ph_street_lamp_01', pos: [-9, 70] },
      { cmd: 'add ph_street_lamp_01', pos: [9, 70] },
      { cmd: 'add ph_street_lamp_01', pos: [-9, 110] },
      { cmd: 'add ph_street_lamp_01', pos: [9, 110] },
      { cmd: 'add ph_street_lamp_01', pos: [-9, 150] },
      { cmd: 'add ph_street_lamp_01', pos: [9, 150] },
      { cmd: 'add ph_street_lamp_01', pos: [-9, 190] },
      { cmd: 'add ph_street_lamp_01', pos: [9, 190] },
      { cmd: 'add ph_street_lamp_01', pos: [-9, 230] },
      { cmd: 'add ph_street_lamp_01', pos: [9, 230] },
      { cmd: 'add ph_fire_hydrant', pos: [-9, -200] },
      { cmd: 'add ph_fire_hydrant', pos: [-9, -100] },
      { cmd: 'add ph_fire_hydrant', pos: [-9, 0] },
      { cmd: 'add ph_fire_hydrant', pos: [-9, 100] },
      { cmd: 'add ph_fire_hydrant', pos: [-9, 200] },
      { cmd: 'add bench', pos: [-9, -150] },
      { cmd: 'add bench', pos: [-9, -90] },
      { cmd: 'add bench', pos: [-9, -30] },
      { cmd: 'add bench', pos: [-9, 30] },
      { cmd: 'add bench', pos: [-9, 90] },
      { cmd: 'add bench', pos: [-9, 150] },
      { cmd: 'add tree', pos: [-165, 135] },
      { cmd: 'add tree', pos: [-165, 147] },
      { cmd: 'add tree', pos: [-165, 159] },
      { cmd: 'add tree', pos: [-155, 135] },
      { cmd: 'add tree', pos: [-155, 147] },
      { cmd: 'add tree', pos: [-155, 159] },
      { cmd: 'add tree', pos: [-145, 135] },
      { cmd: 'add tree', pos: [-145, 147] },
      { cmd: 'add tree', pos: [-145, 159] },
      { cmd: 'add ph_park_bench', pos: [-155, 150] },
      { cmd: 'add ph_park_bench', pos: [-145, 155] },
      { cmd: 'add gas station', pos: [150, -150] },
      { cmd: 'add parking lot', pos: [-150, -150] },
      { cmd: 'spawn villager', scatter: { count: 4, radius: 100 } },
      { cmd: 'spawn woman', scatter: { count: 3, radius: 80 } },
    ]
  },
  suburban: {
    terrain: { type: 'flat', height: 0 },
    ground: 'grass', env: ['time morning'],
    items: [
      // Quiet residential street
      { cmd: 'add road', pos: [0, -40] },
      { cmd: 'add road', pos: [0, 0] },
      { cmd: 'add road', pos: [0, 40] },
      { cmd: 'add road', pos: [0, 80] },
      // Houses with yards — spaced out
      { cmd: 'add modern house', pos: [-25, -35], rot: Math.PI/2 },
      { cmd: 'add pitched house', pos: [-25, -10], rot: Math.PI/2 },
      { cmd: 'add ranch', pos: [-25, 15], rot: Math.PI/2 },
      { cmd: 'add modern house 2 floors', pos: [-25, 40], rot: Math.PI/2 },
      { cmd: 'add mansion', pos: [-25, 65], rot: Math.PI/2 },
      { cmd: 'add pitched house', pos: [25, -35], rot: -Math.PI/2 },
      { cmd: 'add modern house 2 floors', pos: [25, -10], rot: -Math.PI/2 },
      { cmd: 'add duplex', pos: [25, 15], rot: -Math.PI/2 },
      { cmd: 'add modern house', pos: [25, 40], rot: -Math.PI/2 },
      { cmd: 'add ranch', pos: [25, 65], rot: -Math.PI/2 },
      // Pools in backyards
      { cmd: 'add pool', pos: [-35, -8] },
      { cmd: 'add pool', pos: [35, 42] },
      { cmd: 'add pool', pos: [-35, 67] },
      // Trees in yards
      { cmd: 'add tree', pos: [-20, -25] }, { cmd: 'add tree', pos: [-20, 5] },
      { cmd: 'add tree', pos: [20, -20] }, { cmd: 'add tree', pos: [20, 25] },
      { cmd: 'add tree', pos: [-20, 50] }, { cmd: 'add tree', pos: [20, 55] },
      { cmd: 'add tree', pos: [-32, -30] }, { cmd: 'add tree', pos: [32, 10] },
      // Street lamps
      { cmd: 'add ph_street_lamp_01', pos: [-7, -30] },
      { cmd: 'add ph_street_lamp_01', pos: [7, -10] },
      { cmd: 'add ph_street_lamp_01', pos: [-7, 20] },
      { cmd: 'add ph_street_lamp_01', pos: [7, 50] },
      { cmd: 'add ph_street_lamp_01', pos: [-7, 75] },
      // Fire hydrants
      { cmd: 'add ph_fire_hydrant', pos: [-7, -20] },
      { cmd: 'add ph_fire_hydrant', pos: [7, 30] },
      // Mailboxes (just small boxes for now)
      { cmd: 'add trash can', pos: [-14, -34] },
      { cmd: 'add trash can', pos: [14, -9] },
      { cmd: 'add trash can', pos: [-14, 16] },
      // Parked cars
      // Park at the end
      { cmd: 'add tree', pos: [0, 90] }, { cmd: 'add tree', pos: [-8, 95] },
      { cmd: 'add tree', pos: [8, 95] }, { cmd: 'add tree', pos: [-4, 100] },
      { cmd: 'add tree', pos: [4, 100] },
      { cmd: 'add ph_park_bench', pos: [0, 92] },
    ],
    npcs: { count: 6 },
  },
}

export function getWorldCompilerTemplate(mapType) {
  return WORLD_COMPILER_MAP[mapType] || null;
}

export function buildLegacyMapPlan(mapType) {
  const template = MAP_TEMPLATES[mapType] || MAP_TEMPLATES.town;
  const commands = [];
  const pendingRotations = {};

  if (template.terrain) {
    const terrainType = template.terrain.type || 'hills';
    commands.push('terrain ' + terrainType);
  }

  if (template.ground) {
    commands.push('ground ' + template.ground);
  }

  if (template.env) {
    template.env.forEach((entry) => commands.push(entry));
  }

  if (template.weather) {
    commands.push(template.weather);
  }

  if (template.particles) {
    commands.push('particles ' + template.particles);
  }

  for (const item of (template.items || [])) {
    if (item.scatter) {
      const scatter = item.scatter;
      const count = scatter.count || 1;
      const radius = scatter.radius || 30;
      const avoidCenter = scatter.avoidCenter || 0;
      for (let index = 0; index < count; index++) {
        let px;
        let pz;
        let attempts = 0;
        do {
          const angle = Math.random() * Math.PI * 2;
          const dist = avoidCenter + Math.random() * (radius - avoidCenter);
          px = Math.round(Math.cos(angle) * dist);
          pz = Math.round(Math.sin(angle) * dist);
          attempts++;
        } while (attempts < 10 && avoidCenter > 0 && Math.sqrt(px * px + pz * pz) < avoidCenter);
        commands.push(item.cmd + ' at ' + px + ' ' + pz);
      }
    } else if (item.pos) {
      commands.push(item.cmd + ' at ' + item.pos[0] + ' ' + item.pos[1]);
      if (item.rot !== undefined) {
        pendingRotations[item.pos[0] + ',' + item.pos[1]] = item.rot;
      }
    } else {
      commands.push(item.cmd);
    }
  }

  return {
    template,
    commands,
    pendingRotations,
    waterPreset: template.water || null,
    ambientSound: mapType === 'city' ? 'city' : null,
    trafficEnabled: mapType === 'city' || mapType === 'cyberpunk',
  };
}
