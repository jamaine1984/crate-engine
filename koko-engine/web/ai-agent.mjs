import { parseIntent, executeIntent } from './godmode.mjs';
import { interpretWithLLM, hasApiKey, setApiKey } from './llm-interpreter.mjs';
// Crate Engine AI Agent v3 — Full game engine assistant
// Knows ALL engine commands: build, play, combat, craft, quests, NPCs, weather, etc.

// ═══════════════════════════════════════════
// FULL COMMAND REFERENCE (for AI parsing)
// ═══════════════════════════════════════════
const COMMAND_HELP = `🎮 CRATE ENGINE COMMANDS:

🏗️ BUILD WORLDS:
  build a medieval village | build a space base | build a zombie wasteland
  build a frozen tundra | build a haunted graveyard | build a cyberpunk city
  build a dinosaur valley | build a dungeon crawler | build a pirate island
  build a desert wasteland | build a war zone | build a neon alley
  (27+ biome presets with matching ground, sky, fog, weather)

🎯 OBJECTS:
  add [object] | add [object] at X Y Z | add 10 trees
  scatter 20 rocks | remove [name] | clear

🌍 ENVIRONMENT:
  time dawn/sunrise/noon/sunset/dusk/night/midnight
  make it rain | make it snow | fog light/heavy | clear weather
  change ground to snow/sand/dirt/stone/lava/ice/metal/asphalt

🎮 PLAY MODE:
  play | exit play | toggle camera | 1st person | 3rd person

⚔️ COMBAT:
  spawn 5 enemies | equip sword/axe/shield/spear/hammer | heal
  talk (to nearby NPC) | quests

🏗️ CRAFTING:
  craft | craft iron sword | craft health potion | materials

📊 CHARACTER:
  stats | upgrade strength/vitality/endurance/agility/luck
  character knight/cyberpunk/soldier

🎬 ANIMATION:
  animate [object] walk/idle/run/attack | freeze all | unfreeze all

⚡ GODMODE (say anything!):
  make it rain fireballs | lightning strike | tornado
  make the dragon float | spin the castle | make trees glow
  create a portal | force field on me | make it rain swords
  make the knight follow me | explode | earthquake
  make the tower rainbow | clone the tree 10 times
  make the dragon giant | create floating island
  add water | day/night cycle | launch the barrel
  stop all behaviors | list behaviors
  (Describe ANY effect — the engine creates it live!)

📸 OTHER:
  screenshot (F2) | share | model browser (Ctrl+B)
  make [object] bigger/smaller | rotate [object] 90
  change [object] to red/blue/green
`;
// Zero API calls — all intelligence runs client-side

// ═══════════════════════════════════════════
// SCENE RECIPES — one-click full environments
// ═══════════════════════════════════════════
const RECIPES = {
  'medieval village': {
    emoji: '🏰', commands: [
      'clear', 'ground grass', 'sky day',
      'add house at -10 0 0', 'add house at 10 0 0', 'add house at -5 0 -12', 'add house at 5 0 -12',
      'add tavern at 0 0 8', 'add well at 0 0 0',
      'add fence at -15 0 -6', 'add fence at 15 0 -6', 'add fence at -15 0 6', 'add fence at 15 0 6',
      'add tree at -18 0 3', 'add tree at 18 0 3', 'add tree at -12 0 12', 'add tree at 12 0 12',
      'add pine at -20 0 -8', 'add pine at 20 0 -8',
      'add barrel at -3 0 1', 'add barrel at 3 0 1', 'add barrel at -8 0 3',
      'add cart at 7 0 -3', 'add hay_bale at -7 0 5', 'add hay_bale at -6 0 5',
      'add torch at -8 0 0', 'add torch at 8 0 0', 'add torch at 0 0 -10',
      'add villager at -2 0 2', 'add villager at 4 0 -1', 'add villager at -6 0 -4',
      'add horse at 12 0 5', 'add chicken at -4 0 4', 'add dog at 2 0 3',
      'add banner at 0 0 6', 'add flower at -3 0 6', 'add flower at 3 0 6',
      'time sunset', 'fog light'
    ]
  },
  'haunted graveyard': {
    emoji: '👻', commands: [
      'clear', 'ground dark', 'sky night',
      'add tombstone at -6 0 -2', 'add tombstone at -4 0 0', 'add tombstone at -2 0 -1',
      'add tombstone at 0 0 1', 'add tombstone at 2 0 -1', 'add tombstone at 4 0 0',
      'add tombstone at 6 0 -2', 'add tombstone at -3 0 3', 'add tombstone at 3 0 3',
      'add dead_tree at -10 0 5', 'add dead_tree at 10 0 -5', 'add dead_tree at -8 0 -8',
      'add fence at -14 0 -6', 'add fence at 14 0 -6', 'add fence at 0 0 -8',
      'add lantern at -1 0 0', 'add lantern at 5 0 2',
      'add coffin at -5 0 5', 'add skull at 1 0 -3', 'add skull at -2 0 4',
      'add crow at -4 3 0', 'add bat at 3 4 -2', 'add spider at -1 0 -5',
      'add crypt at 0 0 -12', 'add statue at -8 0 0', 'add statue at 8 0 0',
      'add cobweb at -6 2 3', 'add cobweb at 6 2 -3',
      'time night', 'fog heavy', 'rain'
    ]
  },
  'space station': {
    emoji: '🚀', commands: [
      'clear', 'ground metal', 'sky space',
      'add spaceship at 0 0 0', 'add spaceship at -15 0 10',
      'add satellite_dish at -12 0 -5', 'add satellite_dish at 12 0 -5',
      'add solar_panel at -8 0 8', 'add solar_panel at 8 0 8', 'add solar_panel at 0 0 12',
      'add antenna at -5 0 -10', 'add antenna at 5 0 -10', 'add antenna at 0 0 -12',
      'add astronaut at -2 0 1', 'add astronaut at 3 0 -1', 'add astronaut at -5 0 5',
      'add robot at 0 0 3', 'add robot at 6 0 -3',
      'add crate at -9 0 2', 'add crate at 9 0 2', 'add crate at -7 0 -3',
      'add barrel at -6 0 -7', 'add barrel at 6 0 -7',
      'add console at 3 0 5', 'add monitor at -3 0 5',
      'add rover at 10 0 5', 'add drone at -4 3 0',
    ]
  },
  'pirate island': {
    emoji: '🏴‍☠️', commands: [
      'clear', 'ground sand', 'sky tropical',
      'add palm_tree at -10 0 3', 'add palm_tree at 10 0 -2', 'add palm_tree at -6 0 -7',
      'add palm_tree at 14 0 5', 'add palm_tree at -14 0 -3', 'add palm_tree at 8 0 8',
      'add treasure_chest at 0 0 0', 'add chest at -2 0 1',
      'add ship at -25 0 18', 'add boat at 15 0 15',
      'add barrel at -3 0 2', 'add barrel at 3 0 2', 'add barrel at -1 0 3',
      'add campfire at 5 0 4', 'add tent at -5 0 5',
      'add skeleton at -4 0 -3', 'add skeleton at 6 0 -4',
      'add parrot at 1 2 0', 'add parrot at -8 2 3',
      'add cannon at -7 0 6', 'add cannon at 7 0 6',
      'add rock at 12 0 -10', 'add rock at -12 0 10', 'add rock at 15 0 -5',
      'add anchor at 10 0 12', 'add flag at 0 0 -5',
      'add crab at 4 0 -2', 'add turtle at -6 0 -5',
      'water ocean'
    ]
  },
  'dungeon': {
    emoji: '🐉', commands: [
      'clear', 'ground stone', 'sky dark',
      'add arch at 0 0 -12', 'add arch at 0 0 0', 'add arch at 0 0 12',
      'add wall at -6 0 -10', 'add wall at 6 0 -10', 'add wall at -6 0 -4', 'add wall at 6 0 -4',
      'add wall at -6 0 4', 'add wall at 6 0 4', 'add wall at -6 0 10', 'add wall at 6 0 10',
      'add torch at -6 0 -7', 'add torch at 6 0 -7', 'add torch at -6 0 1', 'add torch at 6 0 1',
      'add torch at -6 0 8', 'add torch at 6 0 8',
      'add chest at 0 0 -8', 'add chest at -4 0 6',
      'add skeleton at -3 0 -3', 'add skeleton at 3 0 -3', 'add skeleton at 0 0 5',
      'add barrel at -5 0 -1', 'add barrel at 5 0 3',
      'add potion at -4 0 0', 'add potion at 4 0 7',
      'add sword at 2 0 1', 'add shield at -2 0 8',
      'add spider at 0 0 10', 'add spider at -3 0 7', 'add rat at 4 0 -6',
      'add cobweb at -5 2 5', 'add cobweb at 5 2 -5', 'add cobweb at -3 2 9',
      'add pillar at -4 0 -7', 'add pillar at 4 0 -7', 'add pillar at -4 0 3', 'add pillar at 4 0 3',
      'fog heavy', 'time night'
    ]
  },
  'racing track': {
    emoji: '🏎️', commands: [
      'clear', 'ground asphalt', 'sky day',
      'add car at -4 0 0', 'add car at -1 0 0', 'add car at 2 0 0', 'add car at 5 0 0',
      'add truck at -4 0 -5', 'add truck at 5 0 -5',
      'add barrier at -12 0 8', 'add barrier at -6 0 8', 'add barrier at 0 0 8',
      'add barrier at 6 0 8', 'add barrier at 12 0 8',
      'add barrier at -12 0 -8', 'add barrier at -6 0 -8', 'add barrier at 0 0 -8',
      'add barrier at 6 0 -8', 'add barrier at 12 0 -8',
      'add tree at -18 0 0', 'add tree at 18 0 0', 'add tree at -18 0 -12', 'add tree at 18 0 -12',
      'add tree at -18 0 12', 'add tree at 18 0 12',
      'add cone at -10 0 5', 'add cone at 10 0 5', 'add cone at -10 0 -5', 'add cone at 10 0 -5',
      'add flag at 0 0 12', 'add flag at -3 0 12', 'add flag at 3 0 12',
      'add tire at -8 0 3', 'add tire at 8 0 3',
      'add spectator at -14 0 3', 'add spectator at 14 0 3',
      'time day'
    ]
  },
  'rpg battle arena': {
    emoji: '⚔️', commands: [
      'clear', 'ground stone', 'sky sunset',
      'add knight at -6 0 0', 'add knight at -4 0 2', 'add knight at -5 0 -2',
      'add archer at -8 0 0', 'add archer at -7 0 3',
      'add dragon at 6 0 0', 'add skeleton at 4 0 3', 'add skeleton at 5 0 -3',
      'add skeleton at 3 0 0', 'add goblin at 7 0 -2',
      'add sword at -9 0 0', 'add shield at -9 0 1', 'add axe at -9 0 -1',
      'add potion at -10 0 0', 'add potion at -10 0 1',
      'add rock at -14 0 6', 'add rock at 14 0 6', 'add rock at -14 0 -6', 'add rock at 14 0 -6',
      'add tower at -16 0 -10', 'add tower at 16 0 -10', 'add tower at -16 0 10', 'add tower at 16 0 10',
      'add campfire at 0 0 0', 'add banner at 0 0 -8', 'add banner at 0 0 8',
      'add wall at -12 0 0', 'add wall at 12 0 0',
      'fog light', 'time sunset'
    ]
  },
  'cyberpunk city': {
    emoji: '🌆', commands: [
      'clear', 'ground metal', 'sky night',
      'add building at -10 0 -5', 'add building at 10 0 -5', 'add building at -5 0 -15',
      'add building at 5 0 -15', 'add building at 0 0 -20', 'add building at -15 0 -12',
      'add building at 15 0 -12', 'add building at -8 0 -25', 'add building at 8 0 -25',
      'add neon_sign at -8 0 -3', 'add neon_sign at 8 0 -3', 'add neon_sign at 0 0 -13',
      'add car at -3 0 3', 'add car at 4 0 3', 'add car at -1 0 6',
      'add motorcycle at 6 0 1', 'add motorcycle at -5 0 5',
      'add robot at -1 0 1', 'add robot at 3 0 -1',
      'add drone at 2 5 0', 'add drone at -4 6 -5', 'add drone at 6 4 -8',
      'add antenna at -12 0 -8', 'add antenna at 12 0 -8',
      'add dumpster at 9 0 1', 'add barrel at -9 0 1',
      'add crate at -7 0 -1', 'add crate at 7 0 -1',
      'add streetlight at -6 0 3', 'add streetlight at 0 0 3', 'add streetlight at 6 0 3',
      'add ac at -9 0 -4', 'add ac at 9 0 -4',
      'add vending_machine at -3 0 -3', 'add monitor at 3 0 -3',
      'rain', 'fog light', 'time night'
    ]
  },
  'farm': {
    emoji: '🌾', commands: [
      'clear', 'ground grass', 'sky day',
      'add barn at 0 0 -10', 'add house at -12 0 0', 'add windmill at 14 0 -7',
      'add fence at -8 0 3', 'add fence at -4 0 3', 'add fence at 0 0 3',
      'add fence at 4 0 3', 'add fence at 8 0 3',
      'add fence at -8 0 8', 'add fence at 8 0 8',
      'add cow at -3 0 5', 'add cow at -1 0 6', 'add horse at 4 0 5',
      'add chicken at -5 0 4', 'add chicken at -4 0 5', 'add chicken at -6 0 5',
      'add pig at 2 0 6', 'add pig at 3 0 7', 'add sheep at 6 0 6',
      'add hay_bale at -10 0 -4', 'add hay_bale at -9 0 -4', 'add hay_bale at -10 0 -3',
      'add cart at 10 0 0', 'add tractor at -8 0 -8',
      'add tree at -18 0 5', 'add tree at 18 0 5', 'add tree at -16 0 -5', 'add tree at 16 0 -5',
      'add well at -6 0 -6', 'add scarecrow at 6 0 -3', 'add scarecrow at -4 0 -5',
      'add pumpkin at 3 0 -4', 'add pumpkin at 4 0 -5', 'add corn at 5 0 -3',
      'add dog at -1 0 1', 'add cat at 1 0 -1',
      'add flower at -14 0 0', 'add flower at -13 0 1', 'add flower at 14 0 0',
      'time day'
    ]
  },
  'underwater': {
    emoji: '🐠', commands: [
      'clear', 'ground sand', 'sky underwater',
      'add coral at -6 0 0', 'add coral at 6 0 0', 'add coral at 0 0 -6',
      'add coral at -8 0 -4', 'add coral at 8 0 -4', 'add coral at -3 0 5',
      'add fish at -4 2 3', 'add fish at 4 3 -2', 'add fish at 0 4 4',
      'add fish at -6 3 -3', 'add fish at 7 2 2', 'add fish at 2 5 -4',
      'add dolphin at -10 5 7', 'add dolphin at 10 4 -7',
      'add shark at 12 4 -10', 'add whale at -15 8 12',
      'add turtle at -3 2 -4', 'add turtle at 5 1 3',
      'add jellyfish at 4 6 1', 'add jellyfish at -5 7 -2', 'add jellyfish at 0 8 5',
      'add starfish at -2 0 2', 'add starfish at 3 0 -1',
      'add seaweed at -8 0 -5', 'add seaweed at 8 0 -5', 'add seaweed at -5 0 6', 'add seaweed at 5 0 6',
      'add treasure_chest at 0 0 0', 'add anchor at 4 0 -8',
      'add shipwreck at -12 0 -10', 'add barrel at -10 0 -8',
      'add clam at 2 0 1', 'add crab at -1 0 -2',
      'add rock at 10 0 5', 'add rock at -10 0 -5',
      'fog heavy'
    ]
  },
  'zombie apocalypse': {
    emoji: '🧟', commands: [
      'clear', 'ground dark', 'sky overcast',
      'add building at -10 0 -5', 'add building at 10 0 -5', 'add building at 0 0 -12',
      'add car at -3 0 3', 'add car at 5 0 1', 'add truck at -8 0 -2',
      'add barrier at -6 0 5', 'add barrier at 6 0 5',
      'add barrel at -4 0 2', 'add barrel at 4 0 -1',
      'add zombie at -2 0 0', 'add zombie at 3 0 -2', 'add zombie at -5 0 -4',
      'add zombie at 7 0 -3', 'add zombie at 0 0 -6', 'add zombie at -8 0 2',
      'add soldier at 0 0 6', 'add soldier at -2 0 7', 'add soldier at 2 0 7',
      'add crate at -1 0 8', 'add crate at 1 0 8',
      'add dumpster at 8 0 3', 'add trash at -7 0 4',
      'add fire at 3 0 -8', 'add smoke at -5 0 -10',
      'add streetlight at -6 0 0', 'add streetlight at 6 0 0',
      'add fence at -10 0 7', 'add fence at 10 0 7',
      'fog heavy', 'time night'
    ]
  },
  'wild west': {
    emoji: '🤠', commands: [
      'clear', 'ground sand', 'sky sunset',
      'add saloon at 0 0 -8', 'add house at -10 0 -5', 'add house at 10 0 -5',
      'add barn at -8 0 5', 'add tower at 12 0 3',
      'add fence at -5 0 0', 'add fence at 5 0 0',
      'add horse at -3 0 2', 'add horse at 3 0 2', 'add horse at -6 0 4',
      'add barrel at -1 0 -5', 'add barrel at 1 0 -5', 'add crate at -3 0 -6',
      'add cart at 7 0 -2', 'add hay_bale at -9 0 3',
      'add cowboy at -2 0 -2', 'add cowboy at 4 0 -3',
      'add cactus at -15 0 0', 'add cactus at 15 0 0', 'add cactus at -12 0 8',
      'add cactus at 12 0 8', 'add cactus at 0 0 10',
      'add rock at -18 0 5', 'add rock at 18 0 -5',
      'add tumbleweed at 6 0 5', 'add vulture at -5 4 3',
      'add well at 0 0 0', 'add lantern at -8 0 -5', 'add lantern at 8 0 -5',
      'time sunset', 'fog light'
    ]
  },
  'japanese garden': {
    emoji: '⛩️', commands: [
      'clear', 'ground grass', 'sky day',
      'add cherry_blossom at -8 0 0', 'add cherry_blossom at 8 0 0',
      'add cherry_blossom at -5 0 -8', 'add cherry_blossom at 5 0 -8',
      'add bamboo at -12 0 5', 'add bamboo at -11 0 4', 'add bamboo at -10 0 5',
      'add bamboo at 12 0 -3', 'add bamboo at 11 0 -4', 'add bamboo at 10 0 -3',
      'add bridge at 0 0 3', 'add lantern at -3 0 1', 'add lantern at 3 0 1',
      'add rock at -6 0 3', 'add rock at 6 0 -3', 'add rock at -2 0 -5',
      'add statue at 0 0 -10', 'add bench at -4 0 5', 'add bench at 4 0 5',
      'add fish at -1 0 3', 'add fish at 1 0 4',
      'add flower at -7 0 -2', 'add flower at 7 0 2', 'add flower at 0 0 7',
      'add bush at -9 0 -6', 'add bush at 9 0 6',
      'add bird at -3 3 -3', 'add butterfly at 2 2 1',
      'water pond', 'fog light'
    ]
  },
  'castle siege': {
    emoji: '🏰', commands: [
      'clear', 'ground grass', 'sky overcast',
      'add castle at 0 0 -15',
      'add wall at -8 0 -10', 'add wall at 8 0 -10', 'add wall at -12 0 -5', 'add wall at 12 0 -5',
      'add tower at -14 0 -10', 'add tower at 14 0 -10', 'add tower at -14 0 0', 'add tower at 14 0 0',
      'add gate at 0 0 -8',
      'add catapult at -8 0 8', 'add catapult at 8 0 8',
      'add cannon at 0 0 10',
      'add knight at -3 0 5', 'add knight at -1 0 5', 'add knight at 1 0 5', 'add knight at 3 0 5',
      'add archer at -5 0 6', 'add archer at 5 0 6',
      'add soldier at -6 0 -12', 'add soldier at 6 0 -12', 'add soldier at 0 0 -12',
      'add horse at -5 0 3', 'add horse at 5 0 3',
      'add banner at -10 0 -8', 'add banner at 10 0 -8', 'add banner at 0 0 -18',
      'add campfire at -10 0 8', 'add campfire at 10 0 8',
      'add barrel at -7 0 7', 'add crate at 7 0 7',
      'add tree at -20 0 0', 'add tree at 20 0 0',
      'add rock at -18 0 -8', 'add rock at 18 0 -8',
      'fog light', 'time overcast'
    ]
  },
  'alien planet': {
    emoji: '👽', commands: [
      'clear', 'ground alien', 'sky space',
      'add crystal at -5 0 0', 'add crystal at 5 0 0', 'add crystal at 0 0 -5',
      'add crystal at -8 0 -8', 'add crystal at 8 0 8',
      'add mushroom at -3 0 3', 'add mushroom at 3 0 -3', 'add mushroom at -7 0 5',
      'add mushroom at 7 0 -5', 'add mushroom at 0 0 7',
      'add rock at -10 0 -3', 'add rock at 10 0 3', 'add rock at -12 0 8',
      'add alien at -2 0 1', 'add alien at 3 0 -2', 'add alien at -6 0 -5',
      'add spaceship at 0 0 -12', 'add rover at 8 0 -8',
      'add satellite_dish at -10 0 -10', 'add antenna at 10 0 -10',
      'add egg at -4 0 -3', 'add egg at 4 0 -3',
      'add cactus at -15 0 0', 'add cactus at 15 0 0',
      'add geyser at 0 0 0', 'add crater at 5 0 5',
      'fog heavy'
    ]
  }
};

// ═══════════════════════════════════════════
// SMART PARSER — understands freeform language
// ═══════════════════════════════════════════
const OBJECT_CATEGORIES = {
  nature: ['tree','pine','oak','bush','rock','flower','mushroom','crystal','cactus','bamboo','seaweed','coral','stump','grass','vine','moss','lily','fern'],
  animals: ['dog','cat','horse','cow','pig','chicken','sheep','duck','fox','wolf','deer','bear','rabbit','bird','fish','dolphin','shark','whale','turtle','frog','snake','spider','bat','crow','parrot','eagle','owl','butterfly','crab','jellyfish','starfish','rat','squirrel','alpaca','donkey','bull','stag','husky'],
  people: ['man','woman','villager','soldier','knight','archer','wizard','king','queen','cowboy','pirate','ninja','samurai','astronaut','zombie','skeleton','ghost','adventurer','guard'],
  vehicles: ['car','truck','boat','ship','tank','helicopter','motorcycle','bicycle','tractor','rover','spaceship','drone','cart','wagon','train'],
  buildings: ['house','castle','tower','barn','church','temple','tavern','shop','fortress','wall','gate','bridge','windmill','lighthouse'],
  weapons: ['sword','axe','bow','shield','spear','hammer','dagger','staff','wand','cannon','catapult','crossbow'],
  furniture: ['chair','table','bench','bed','sofa','lamp','bookshelf','desk','throne','chest','barrel','crate','cabinet'],
  food: ['apple','pumpkin','corn','wheat','carrot','mushroom','bread','cheese','meat','fish','pie'],
  effects: ['campfire','torch','lantern','fire','smoke','fountain','well','flag','banner','sign'],
};

// Parse freeform descriptions into commands
function parseDescription(text) {
  const lower = text.toLowerCase();
  const commands = ['clear'];
  
  // Detect theme/setting
  if (lower.match(/forest|wood|jungle/)) {
    commands.push('ground grass', 'sky day');
    for (let i = 0; i < 12; i++) {
      const x = (Math.random() - 0.5) * 30;
      const z = (Math.random() - 0.5) * 30;
      commands.push(`add ${Math.random() > 0.3 ? 'tree' : 'pine'} at ${x.toFixed(0)} 0 ${z.toFixed(0)}`);
    }
    commands.push('add bush at -3 0 2', 'add bush at 5 0 -3', 'add rock at -8 0 5', 'add flower at 2 0 4');
  }
  if (lower.match(/desert|sahara|dune/)) {
    commands.push('ground sand', 'sky day');
    for (let i = 0; i < 6; i++) {
      const x = (Math.random() - 0.5) * 30;
      const z = (Math.random() - 0.5) * 30;
      commands.push(`add cactus at ${x.toFixed(0)} 0 ${z.toFixed(0)}`);
    }
    commands.push('add rock at -10 0 5', 'add rock at 10 0 -5', 'add skull at 3 0 2');
  }
  if (lower.match(/snow|winter|ice|arctic|frozen/)) {
    commands.push('ground snow', 'sky overcast');
    for (let i = 0; i < 8; i++) {
      const x = (Math.random() - 0.5) * 30;
      const z = (Math.random() - 0.5) * 30;
      commands.push(`add pine at ${x.toFixed(0)} 0 ${z.toFixed(0)}`);
    }
    commands.push('snow', 'fog light');
  }
  if (lower.match(/city|town|urban|street/)) {
    commands.push('ground asphalt', 'sky day');
    for (let i = -2; i <= 2; i++) {
      commands.push(`add building at ${i * 8} 0 -8`);
      commands.push(`add streetlight at ${i * 8} 0 0`);
    }
    commands.push('add car at -3 0 3', 'add car at 4 0 3', 'add tree at -15 0 0', 'add tree at 15 0 0');
  }
  if (lower.match(/ocean|sea|beach/)) {
    commands.push('ground sand', 'sky tropical');
    commands.push('water ocean');
    for (let i = 0; i < 4; i++) {
      const x = (Math.random() - 0.5) * 20;
      commands.push(`add palm_tree at ${x.toFixed(0)} 0 ${(Math.random() * -5 - 2).toFixed(0)}`);
    }
  }
  if (lower.match(/night|dark|spooky|horror|scary/)) {
    commands.push('time night', 'fog heavy');
  }
  if (lower.match(/sunset|dusk|evening/)) {
    commands.push('time sunset');
  }
  
  // More theme detectors
  if (lower.match(/castle|medieval|kingdom|fortress/)) {
    commands.push('ground grass', 'sky day');
    commands.push('add castle at 0 0 -10', 'add wall at -8 0 -5', 'add wall at 8 0 -5');
    commands.push('add tower at -10 0 -8', 'add tower at 10 0 -8');
    commands.push('add banner at 0 0 -8', 'add knight at -2 0 0', 'add knight at 2 0 0');
  }
  if (lower.match(/volcano|lava|hell|inferno/)) {
    commands.push('ground dark', 'sky sunset');
    commands.push('add rock at -8 0 -5', 'add rock at 8 0 -5', 'add rock at 0 0 -8');
    commands.push('add fire at 0 0 -3', 'add fire at -3 0 -5', 'add fire at 3 0 -5');
    commands.push('add skull at -2 0 0', 'add skeleton at 4 0 -2', 'fog heavy');
  }
  if (lower.match(/market|shop|bazaar|trading/)) {
    commands.push('ground stone', 'sky day');
    for (let i = -2; i <= 2; i++) {
      commands.push(`add stall at ${i * 5} 0 -3`);
      commands.push(`add barrel at ${i * 5 + 1} 0 -2`);
    }
    commands.push('add villager at -3 0 1', 'add villager at 5 0 1', 'add cart at -8 0 2');
  }
  if (lower.match(/prison|jail|cell|dungeon/)) {
    commands.push('ground stone', 'sky dark');
    commands.push('add wall at -5 0 -5', 'add wall at 5 0 -5', 'add wall at -5 0 5', 'add wall at 5 0 5');
    commands.push('add arch_bars at 0 0 -5', 'add torch at -5 0 0', 'add torch at 5 0 0');
    commands.push('add skeleton at -2 0 0', 'add chain at 3 0 -3', 'fog heavy', 'time night');
  }
  if (lower.match(/battlefield|war|army|armies/)) {
    commands.push('ground grass', 'sky overcast');
    for (let i = 0; i < 6; i++) {
      commands.push(`add soldier at ${-8 + i * 2} 0 -5`);
      commands.push(`add knight at ${-5 + i * 2} 0 5`);
    }
    commands.push('add cannon at -10 0 -3', 'add cannon at 10 0 3');
    commands.push('add banner at -8 0 -7', 'add banner at 8 0 7', 'add fire at 0 0 0', 'fog light');
  }
  if (lower.match(/park|playground|garden/)) {
    commands.push('ground grass', 'sky day');
    for (let i = 0; i < 6; i++) {
      const x = (Math.random() - 0.5) * 20;
      const z = (Math.random() - 0.5) * 20;
      commands.push(`add tree at ${x.toFixed(0)} 0 ${z.toFixed(0)}`);
    }
    commands.push('add bench at -3 0 0', 'add bench at 3 0 0');
    commands.push('add fountain at 0 0 0', 'add flower at -5 0 3', 'add flower at 5 0 -3');
    commands.push('add bird at -2 3 1', 'add dog at 4 0 2', 'add lamp at -6 0 0', 'add lamp at 6 0 0');
  }
  if (lower.match(/sports|soccer|football|stadium/)) {
    commands.push('ground grass', 'sky day');
    commands.push('add fence at -15 0 -10', 'add fence at 15 0 -10', 'add fence at -15 0 10', 'add fence at 15 0 10');
    for (let i = 0; i < 6; i++) {
      const x = (Math.random() - 0.5) * 20;
      const z = (Math.random() - 0.5) * 15;
      commands.push(`add man at ${x.toFixed(0)} 0 ${z.toFixed(0)}`);
    }
    commands.push('add spectator at -12 0 -8', 'add spectator at 12 0 -8', 'add flag at 0 0 -10', 'add flag at 0 0 10');
  }
  if (lower.match(/treasure|loot|gold/)) {
    commands.push('add chest at 0 0 0', 'add chest at -2 0 1', 'add coin at 1 0 1');
    commands.push('add crown at 0 0 -2', 'add bag at -1 0 -1');
  }
  if (lower.match(/destroy|ruin|apocalypse|destroyed|wasteland|post.?apocal/)) {
    commands.push('ground dark', 'sky overcast');
    commands.push('add building at -8 0 -5', 'add building at 8 0 -5');
    commands.push('add car at -3 0 2', 'add truck at 5 0 0');
    commands.push('add barrel at -4 0 3', 'add fire at 2 0 -3', 'add smoke at -5 0 -5');
    commands.push('add crate at 3 0 4', 'add barrier at -6 0 5', 'add barrier at 6 0 5');
    commands.push('fog heavy');
  }
  
  // Extract specific objects mentioned
  const allObjects = Object.values(OBJECT_CATEGORIES).flat();
  const mentioned = [];
  for (const obj of allObjects) {
    if (lower.includes(obj) && !mentioned.includes(obj)) {
      mentioned.push(obj);
    }
  }
  
  // Count modifiers
  const countMatch = lower.match(/(\d+)\s+([\w]+)/g);
  if (countMatch) {
    for (const m of countMatch) {
      const [_, num, thing] = m.match(/(\d+)\s+([\w]+)/);
      const count = Math.min(parseInt(num), 20);
      const obj = allObjects.find(o => thing.includes(o) || o.includes(thing));
      if (obj) {
        for (let i = 0; i < count; i++) {
          const x = (Math.random() - 0.5) * 25;
          const z = (Math.random() - 0.5) * 25;
          commands.push(`add ${obj} at ${x.toFixed(0)} 0 ${z.toFixed(0)}`);
        }
        const idx = mentioned.indexOf(obj);
        if (idx > -1) mentioned.splice(idx, 1);
      }
    }
  }
  
  // Place remaining mentioned objects
  mentioned.forEach((obj, i) => {
    const angle = (i / mentioned.length) * Math.PI * 2;
    const r = 3 + Math.random() * 5;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    commands.push(`add ${obj} at ${x.toFixed(0)} 0 ${z.toFixed(0)}`);
  });
  
  // Weather
  if (lower.match(/rain/)) commands.push('rain');
  if (lower.match(/snow/)) commands.push('snow');
  if (lower.match(/fog/)) commands.push('fog');
  
  return commands.length > 1 ? commands : null;
}

// ═══════════════════════════════════════════
// TIPS & RESPONSES
// ═══════════════════════════════════════════
const TIPS = [
  "Try describing a whole scene: 'a dark forest with wolves and a campfire'",
  "Use numbers: 'add 10 trees' scatters them around",
  "Quick buttons at the top build entire environments instantly",
  "Click objects in the viewport to select them",
  "Type 'rain', 'snow', 'fog' for instant weather",
  "Try 'time night' or 'time sunset' for mood lighting",
  "Mix themes: 'cyberpunk city with dragons'",
  "Type 'clear' anytime to start fresh",
  "Every object is a real 3D model — 1,339 unique assets",
  "Try 'zombie apocalypse', 'japanese garden', or 'castle siege'",
  "Type 'play' to enter first-person WASD mode — walk through your scene!",
  "Add game logic: 'when touch coin score +10' creates collectibles",
  "Type 'scatter 20 trees' to randomly place objects around the scene",
  "Use 'time sunset' or 'time night' to change lighting instantly",
  "Type 'animations' to see which models have walk/idle/attack cycles",
  "Type 'freeze' to pause all animations, 'unfreeze' to resume",
  "Type 'speed 2' to double animation speed, 'speed 0.5' for slow-mo",
];

function randomTip() { return TIPS[Math.floor(Math.random() * TIPS.length)]; }

// ═══════════════════════════════════════════
// AGENT UI
// ═══════════════════════════════════════════
export class CrateAgent {
  constructor(executeCmd) {
    this.executeCmd = executeCmd;
    this.history = [];
    this.objects = [];
    this.panel = null;
    this.chatLog = null;
    this.input = null;
    this.isOpen = false;
    this.commandCount = 0;
    this.buildUI();
  }

  buildUI() {
    // Toggle button
    const btn = document.createElement('button');
    btn.id = 'agent-toggle';
    btn.innerHTML = '🤖';
    btn.title = 'AI Build Agent';
    Object.assign(btn.style, {
      position: 'fixed', bottom: '20px', right: '20px', zIndex: '300',
      width: '56px', height: '56px', borderRadius: '50%',
      background: 'linear-gradient(135deg, #ff6b35, #f7c948)',
      border: 'none', fontSize: '26px', cursor: 'pointer',
      boxShadow: '0 4px 24px rgba(255,107,53,0.5)',
      transition: 'all 0.3s ease', animation: 'pulse-glow 2s infinite',
    });
    // Add pulse animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse-glow { 0%,100% { box-shadow: 0 4px 24px rgba(255,107,53,0.5); } 50% { box-shadow: 0 4px 32px rgba(255,107,53,0.8); } }
      @keyframes slide-up { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
      @keyframes typing-dot { 0%,60%,100% { opacity:0.3; } 30% { opacity:1; } }
      #agent-panel::-webkit-scrollbar { width: 4px; }
      #agent-panel::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
      .agent-msg { animation: slide-up 0.3s ease; }
    `;
    document.head.appendChild(style);
    btn.onmouseenter = () => { btn.style.transform = 'scale(1.1) rotate(10deg)'; };
    btn.onmouseleave = () => { btn.style.transform = 'scale(1)'; };
    btn.onclick = () => this.toggle();
    document.body.appendChild(btn);

    // Panel
    this.panel = document.createElement('div');
    this.panel.id = 'agent-panel';
    Object.assign(this.panel.style, {
      position: 'fixed', bottom: '84px', right: '20px', zIndex: '250',
      width: '400px', maxHeight: '560px', borderRadius: '16px',
      background: '#0a0a0a', border: '1px solid #1f1f1f',
      boxShadow: '0 12px 48px rgba(0,0,0,0.7)',
      display: 'none', flexDirection: 'column', overflow: 'hidden',
      fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
    });

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      padding: '16px', borderBottom: '1px solid #1a1a1a',
      display: 'flex', alignItems: 'center', gap: '12px',
      background: 'linear-gradient(135deg, rgba(255,107,53,0.08), rgba(247,201,72,0.04))',
    });
    header.innerHTML = `
      <div style="width:36px;height:36px;border-radius:12px;background:linear-gradient(135deg,#ff6b35,#f7c948);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">🤖</div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:0.95rem;color:#fff">Crate Agent</div>
        <div style="font-size:0.7rem;color:#4ade80;display:flex;align-items:center;gap:4px">
          <span style="width:6px;height:6px;background:#4ade80;border-radius:50%;display:inline-block"></span>
          Online — 1,339 models loaded
        </div>
      </div>
      <div id="agent-cmd-count" style="background:#111;border:1px solid #252525;border-radius:8px;padding:4px 10px;font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:#f7c948">0 cmds</div>
      <button id="agent-close" style="background:none;border:none;color:#555;font-size:1.3rem;cursor:pointer;padding:4px;transition:color 0.2s">✕</button>
    `;
    this.panel.appendChild(header);
    header.querySelector('#agent-close').onclick = () => this.toggle();
    header.querySelector('#agent-close').onmouseenter = (e) => e.target.style.color = '#ff6b35';
    header.querySelector('#agent-close').onmouseleave = (e) => e.target.style.color = '#555';

    // Quick actions — scrollable
    const quickBar = document.createElement('div');
    Object.assign(quickBar.style, {
      padding: '10px 12px', display: 'flex', gap: '6px', flexWrap: 'wrap',
      borderBottom: '1px solid #1a1a1a', background: 'rgba(17,17,17,0.8)',
      maxHeight: '80px', overflowY: 'auto',
    });
    for (const [name, recipe] of Object.entries(RECIPES)) {
      const b = document.createElement('button');
      b.textContent = `${recipe.emoji} ${name.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}`;
      Object.assign(b.style, {
        padding: '4px 10px', borderRadius: '20px', border: '1px solid #1f1f1f',
        background: '#0d0d0d', color: '#aaa', fontSize: '0.68rem', cursor: 'pointer',
        transition: 'all 0.2s', whiteSpace: 'nowrap', fontFamily: 'Inter, sans-serif',
      });
      b.onmouseenter = () => { b.style.borderColor = '#ff6b35'; b.style.color = '#ff6b35'; b.style.background = 'rgba(255,107,53,0.08)'; };
      b.onmouseleave = () => { b.style.borderColor = '#1f1f1f'; b.style.color = '#aaa'; b.style.background = '#0d0d0d'; };
      b.onclick = () => this.handleMessage(`build a ${name}`);
      quickBar.appendChild(b);
    }
    this.panel.appendChild(quickBar);

    // Chat log
    this.chatLog = document.createElement('div');
    Object.assign(this.chatLog.style, {
      flex: '1', overflowY: 'auto', padding: '14px', minHeight: '220px', maxHeight: '320px',
    });
    this.panel.appendChild(this.chatLog);

    // Input area
    const inputArea = document.createElement('div');
    Object.assign(inputArea.style, {
      padding: '12px', borderTop: '1px solid #1a1a1a',
      display: 'flex', gap: '8px', alignItems: 'center',
      background: 'rgba(10,10,10,0.95)',
    });
    this.input = document.createElement('input');
    this.input.placeholder = "Describe what you want to build...";
    Object.assign(this.input.style, {
      flex: '1', background: '#111', border: '1px solid #252525', borderRadius: '12px',
      padding: '11px 14px', color: '#e0e0e0', fontSize: '0.85rem', outline: 'none',
      fontFamily: "'Inter', sans-serif", transition: 'border-color 0.2s',
    });
    this.input.onfocus = () => this.input.style.borderColor = '#ff6b35';
    this.input.onblur = () => this.input.style.borderColor = '#252525';
    this.input.onkeydown = (e) => {
      if (e.key === 'Enter' && this.input.value.trim()) {
        e.stopPropagation();
        this.handleMessage(this.input.value.trim());
        this.input.value = '';
      }
    };
    
    const sendBtn = document.createElement('button');
    sendBtn.innerHTML = '↑';
    Object.assign(sendBtn.style, {
      width: '38px', height: '38px', borderRadius: '50%',
      background: 'linear-gradient(135deg, #ff6b35, #f7c948)',
      border: 'none', color: 'white', fontSize: '1.2rem', fontWeight: '700',
      cursor: 'pointer', transition: 'all 0.2s', flexShrink: '0',
    });
    sendBtn.onmouseenter = () => sendBtn.style.transform = 'scale(1.1)';
    sendBtn.onmouseleave = () => sendBtn.style.transform = 'scale(1)';
    sendBtn.onclick = () => { if (this.input.value.trim()) { this.handleMessage(this.input.value.trim()); this.input.value = ''; } };
    
    inputArea.appendChild(this.input);
    inputArea.appendChild(sendBtn);
    this.panel.appendChild(inputArea);
    document.body.appendChild(this.panel);

    // Welcome
    this.addBotMessage("Hey! I'm your build agent. Describe any scene — <strong>'dark forest with wolves'</strong>, <strong>'underwater temple'</strong>, <strong>'10 dragons and a castle'</strong> — or hit a quick button above. Let's build something. 🚀");
  }

  toggle() {
    this.isOpen = !this.isOpen;
    this.panel.style.display = this.isOpen ? 'flex' : 'none';
    if (this.isOpen) {
      this.panel.style.animation = 'slide-up 0.25s ease';
      setTimeout(() => this.input.focus(), 100);
    }
  }

  addUserMessage(text) {
    const msg = document.createElement('div');
    msg.className = 'agent-msg';
    Object.assign(msg.style, { display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' });
    msg.innerHTML = `<div style="background:linear-gradient(135deg,#1a1a2e,#1e1e3a);color:#e0e0e0;padding:10px 14px;border-radius:14px 14px 4px 14px;max-width:80%;font-size:0.82rem;line-height:1.5;border:1px solid #252545">${this.esc(text)}</div>`;
    this.chatLog.appendChild(msg);
    this.scrollToBottom();
  }

  addBotMessage(html, highlight = false) {
    const msg = document.createElement('div');
    msg.className = 'agent-msg';
    Object.assign(msg.style, { display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'flex-start' });
    msg.innerHTML = `
      <div style="width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,#ff6b35,#f7c948);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">🤖</div>
      <div style="background:#111;border:1px solid ${highlight ? '#ff6b35' : '#1a1a1a'};color:#ccc;padding:10px 14px;border-radius:4px 14px 14px 14px;max-width:82%;font-size:0.82rem;line-height:1.6">${html}</div>
    `;
    this.chatLog.appendChild(msg);
    this.scrollToBottom();
    return msg;
  }

  addBuildLog(commands) {
    const container = document.createElement('div');
    container.className = 'agent-msg';
    Object.assign(container.style, { marginBottom: '10px', marginLeft: '34px' });
    const log = document.createElement('div');
    Object.assign(log.style, {
      background: '#080808', border: '1px solid #1a1a1a', borderRadius: '10px',
      padding: '10px 12px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.68rem',
      maxHeight: '140px', overflowY: 'auto', color: '#4ade80',
    });
    const visible = commands.slice(0, 30); // Show max 30 lines
    visible.forEach((cmd, i) => {
      setTimeout(() => {
        const line = document.createElement('div');
        line.style.padding = '1px 0';
        line.style.opacity = '0';
        line.style.animation = 'slide-up 0.2s ease forwards';
        line.innerHTML = `<span style="color:#444">❯</span> <span style="color:#777">${this.esc(cmd)}</span> <span style="color:#4ade80">✓</span>`;
        log.appendChild(line);
        log.scrollTop = log.scrollHeight;
      }, i * 60);
    });
    if (commands.length > 30) {
      setTimeout(() => {
        const more = document.createElement('div');
        more.style.cssText = 'color:#555;padding:2px 0;font-style:italic';
        more.textContent = `... and ${commands.length - 30} more commands`;
        log.appendChild(more);
      }, 30 * 60 + 100);
    }
    container.appendChild(log);
    this.chatLog.appendChild(container);
    this.scrollToBottom();
  }

  showTyping() {
    const msg = document.createElement('div');
    msg.className = 'agent-msg agent-typing';
    Object.assign(msg.style, { display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'flex-start' });
    msg.innerHTML = `
      <div style="width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,#ff6b35,#f7c948);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">🤖</div>
      <div style="background:#111;border:1px solid #1a1a1a;padding:10px 14px;border-radius:4px 14px 14px 14px;display:flex;gap:4px">
        <span style="width:6px;height:6px;background:#555;border-radius:50%;animation:typing-dot 1s infinite 0s"></span>
        <span style="width:6px;height:6px;background:#555;border-radius:50%;animation:typing-dot 1s infinite 0.2s"></span>
        <span style="width:6px;height:6px;background:#555;border-radius:50%;animation:typing-dot 1s infinite 0.4s"></span>
      </div>
    `;
    this.chatLog.appendChild(msg);
    this.scrollToBottom();
    return msg;
  }

  removeTyping() {
    const t = this.chatLog.querySelector('.agent-typing');
    if (t) t.remove();
  }

  scrollToBottom() {
    setTimeout(() => { this.chatLog.scrollTop = this.chatLog.scrollHeight; }, 50);
  }

  esc(text) { return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  updateCmdCount() {
    const el = document.getElementById('agent-cmd-count');
    if (el) el.textContent = `${this.commandCount} cmds`;
  }

  async executeWithDelay(commands) {
    for (let i = 0; i < commands.length; i++) {
      await new Promise(r => setTimeout(r, 80));
      this.executeCmd(commands[i]);
      this.commandCount++;
    }
    this.updateCmdCount();
  }

  _decomposeRequest(lower) {
    const cmds = [];
    
    // "add/give me/I want a player" → play as character
    if (lower.match(/(?:add|give|create|spawn|i want|make)\s+(?:a\s+)?player/)) {
      cmds.push('play as adventurer');
    }
    
    // "with a weapon/sword/gun/rifle that shoots/fires" → equip weapon
    const weaponMatch = lower.match(/(?:with|and|holding|carrying|equip)\s+(?:a\s+)?(\w+)(?:\s+that\s+(?:shoots|fires|attacks))?/);
    if (weaponMatch) {
      const w = weaponMatch[1];
      if (w.match(/gun|rifle|shoot|pistol|blaster|weapon/)) cmds.push('equip rifle');
      else if (w.match(/sword|blade|katana/)) cmds.push('equip sword');
      else if (w.match(/axe|hatchet/)) cmds.push('equip axe');
      else if (w.match(/hammer|mace/)) cmds.push('equip hammer');
      else if (w.match(/spear|lance/)) cmds.push('equip spear');
      else if (w.match(/bow/)) cmds.push('equip bow');
      else if (w.match(/shield/)) cmds.push('equip shield');
      else cmds.push('equip ' + w);
    }
    
    // "that shoots" without weapon specified → equip rifle
    if (lower.match(/(?:that|can|who)\s+(?:shoots|fires|attacks)/) && !weaponMatch) {
      cmds.push('equip rifle');
    }
    
    // "with enemies/monsters/NPCs" → spawn enemies
    if (lower.match(/(?:with|and|add|spawn)\s+(?:some\s+)?(?:enemies|monsters|zombies|hostiles|bad guys)/)) {
      cmds.push('spawn 5 enemies');
    }
    
    // "with NPCs/people/villagers" → spawn NPCs
    if (lower.match(/(?:with|and|add|spawn)\s+(?:some\s+)?(?:npcs?|people|villagers|characters|townsfolk)/)) {
      cmds.push('spawn 5 npcs');
    }
    
    // "in a/on a/with a [world type]" → build world
    const worldMatch = lower.match(/(?:in|on)\s+(?:a\s+)?(\w+\s*\w*?)\s*(?:world|map|level|scene|$)/);
    if (worldMatch) {
      const world = worldMatch[1].trim();
      if (world.match(/medieval|village|town|city|forest|desert|island|pirate|space|haunted|dungeon|zombie|war|ice|frozen/)) {
        cmds.push('build a ' + world);
      }
    }
    
    // "make it rain/snow" → weather
    if (lower.match(/(?:make it|with)\s+(?:rain|snow|fog)/)) {
      const weather = lower.match(/(rain|snow|fog)/)[1];
      cmds.push('make it ' + weather);
    }
    
    // "at night/day/dawn/sunset" → time
    const timeMatch = lower.match(/(?:at|during|in)\s+(?:the\s+)?(night|day|dawn|sunset|sunrise|dusk|noon|midnight)/);
    if (timeMatch) {
      cmds.push('time ' + timeMatch[1]);
    }
    
    return cmds.length > 0 ? cmds : null;
  }

  async handleMessage(text) {
    this.addUserMessage(text);
    const lower = text.toLowerCase().trim();

    // Show typing indicator
    const typing = this.showTyping();
    await new Promise(r => setTimeout(r, 400 + Math.random() * 300));
    this.removeTyping();

    // 0. GODMODE — dynamic behavior creation
    const intent = parseIntent(lower);
    if (intent) {
      const result = executeIntent(intent);
      if (result) {
        this.addBotMessage(`⚡ <strong>GODMODE:</strong> ${this.esc(intent.description)}<br><br>${this.esc(result)}`);
        this.commandCount++;
        this.updateCmdCount();
        return;
      }
    }

    // 1. Check recipe match
    let matchedRecipe = null;
    for (const [name, recipe] of Object.entries(RECIPES)) {
      const words = name.split(' ');
      if (lower.includes(name) || words.every(w => lower.includes(w))) {
        matchedRecipe = { name, ...recipe };
        break;
      }
    }

    if (matchedRecipe) {
      const capName = matchedRecipe.name.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
      // Use engine's TownBuilder (much better layouts than old recipes)
      const townKeywords = /medieval|fantasy|village|town|city|modern|cyberpunk|castle|pirate|port|farm|forest|bandit|camp|desert|fishing|mountain|mining|market|military|fort|harbor|island|space|station|alien|planet|sci.?fi|outpost|zombie|wasteland|apocal|nuclear|frozen|tundra|ice|fortress|winter|haunted|graveyard|mansion|crypt|cathedral|dungeon|jungle|temple|dinosaur|underwater|ocean|shipwreck|neon|alley|arena|platformer|race|enchanted|dark.?forest|oasis|war.?zone|dwarf|mine/;
      if (townKeywords.test(matchedRecipe.name)) {
        this.addBotMessage(`Building <strong>${matchedRecipe.emoji} ${capName}</strong>...`, true);
        this.executeCmd('build a ' + matchedRecipe.name);
        await new Promise(r => setTimeout(r, 3000));
        setTimeout(() => { if (window._autoFrame) window._autoFrame(); }, 1000);
        this.addBotMessage(`${matchedRecipe.emoji} <strong>${capName}</strong> is ready! Type <strong>"play"</strong> to explore, or <strong>"spawn 5 enemies"</strong> to fight!`);
        return;
      }
      // Fallback to old recipe system for non-town scenes
      this.addBotMessage(`Building <strong>${matchedRecipe.emoji} ${capName}</strong>... (${matchedRecipe.commands.length} objects)`, true);
      this.addBuildLog(matchedRecipe.commands);
      await this.executeWithDelay(matchedRecipe.commands);
      setTimeout(() => { if (window._autoFrame) window._autoFrame(); }, 2000);
      await new Promise(r => setTimeout(r, matchedRecipe.commands.length * 60 + 300));
      this.addBotMessage(`${matchedRecipe.emoji} <strong>${capName}</strong> is live! ${matchedRecipe.commands.length} objects placed.`);
      return;
    }

    // 1.5. SMART LLM INTERPRETER — understands ANY natural language
    // First try the smart local parser, which handles most common patterns
    const smartCmds = await interpretWithLLM(text);
    if (smartCmds && smartCmds.length > 0) {
      // Check if it's just passing through the raw input (catch-all)
      const isPassthrough = smartCmds.length === 1 && smartCmds[0] === text;
      if (!isPassthrough) {
        this.addBotMessage('🧠 Running: <code style="background:#1a1a2e;padding:3px 8px;border-radius:6px;color:#f7c948;font-size:0.78rem">' + smartCmds.map(c => this.esc(c)).join(' → ') + '</code>');
        for (const cmd of smartCmds) {
          this.executeCmd(cmd);
          const delay = cmd.match(/^play|^character|^equip/) ? 4000 : 1000;
          await new Promise(r => setTimeout(r, delay));
        }
        this.commandCount++;
        this.updateCmdCount();
        await new Promise(r => setTimeout(r, 1500));
        this.addBotMessage('✅ Done! ' + smartCmds.length + ' commands executed.');
        return;
      }
    }

    // 2. Route build/play/combat/craft/quest commands directly to engine
    const engineCmds = /^(build|play|exit play|spawn|equip|heal|craft|stats|upgrade|talk|quests?|materials|clear|time |make it|rain|snow|fog|delete|remove|move|color|scale|rotate|share|screenshot|change ground|add |scatter|freeze|unfreeze|animate|anim|character |toggle camera|1st person|3rd person|first person|third person|set |ground |sky |speed |v$)/;
    if (engineCmds.test(lower)) {
      this.addBotMessage(`Running: <code style="background:#1a1a2e;padding:3px 8px;border-radius:6px;color:#f7c948;font-size:0.78rem">${this.esc(text)}</code>`);
      this.executeCmd(text);
      this.commandCount++;
      this.updateCmdCount();
      await new Promise(r => setTimeout(r, 1500));
      const objCount = this.objects?.length || 0;
      if (lower.startsWith('build')) {
        setTimeout(() => { if (window._autoFrame) window._autoFrame(); }, 1000);
        this.addBotMessage(`✅ Scene built! ${objCount} objects. Type <strong>"play"</strong> to explore!`);
      } else if (lower.startsWith('play')) {
        this.addBotMessage('🎮 You\'re in! WASD to move, E to attack, Space to jump, ESC to exit.');
      } else if (lower.startsWith('spawn') && lower.includes('enem')) {
        this.addBotMessage('⚔️ Enemies spread across the map in zones. Walk near one to trigger combat!<br><br><strong>Controls:</strong> E = light attack (3-hit combo), Q = heavy attack (AOE), C = dodge roll');
      } else if (lower.startsWith('spawn')) {
        this.addBotMessage('✅ NPCs placed! Walk near them and type <strong>"talk"</strong> to interact.');
      } else if (lower.startsWith('equip')) {
        this.addBotMessage('⚔️ Equipped! Light attack (E) for combos, Heavy attack (Q) for big damage.');
      } else if (lower.startsWith('craft') && !lower.match(/^craft$/)) {
        this.addBotMessage('🔨 Crafted! Check your inventory (bottom-right HUD).');
      } else if (lower === 'craft' || lower === 'recipes') {
        this.addBotMessage('🔨 Recipes shown! Kill enemies for material drops, then craft weapons & potions.');
      } else if (lower.startsWith('stats') || lower.startsWith('upgrade')) {
        this.addBotMessage('📊 Stats updated! Kill enemies for XP → level up → spend skill points.');
      } else if (lower === 'heal') {
        this.addBotMessage('❤️ Fully healed! Health & stamina restored.');
      } else if (lower.startsWith('time')) {
        this.addBotMessage('🌅 Time changed! Try: dawn, sunrise, noon, sunset, dusk, night, midnight');
      } else if (lower.startsWith('add ') || lower.startsWith('scatter')) {
        this.addBotMessage('✅ Added! 1,339 real 3D models available. Try animals, weapons, buildings, vehicles...');
      } else {
        this.addBotMessage(`✅ Done!`);
      }
      return;
    }
    
    // 3. Try freeform parsing
    const freeformCmds = parseDescription(lower);
    if (freeformCmds && freeformCmds.length > 2) {
      this.addBotMessage(`I see what you're going for. Building your scene... (${freeformCmds.length} commands) 🎨`, true);
      this.addBuildLog(freeformCmds);
      await this.executeWithDelay(freeformCmds);
      setTimeout(() => { if (window._autoFrame) window._autoFrame(); }, 2000);
      await new Promise(r => setTimeout(r, freeformCmds.length * 60 + 300));
      this.addBotMessage(`Scene built! ${freeformCmds.length - 1} objects placed. Want me to add more? Just describe it.`);
      return;
    }

    // 3. Help
    if (lower.match(/^(help|h|\?|how|what can|tutorial|guide)/)) {
      this.addBotMessage(`
        <strong>🎮 CRATE ENGINE — Full Command List</strong><br><br>
        <strong>🏗️ Build Worlds</strong> (27+ biome presets):<br>
        <span style="color:#888">medieval village, fantasy town, cyberpunk city, modern city</span><br>
        <span style="color:#888">space base, sci-fi outpost, pirate island, farm</span><br>
        <span style="color:#888">zombie wasteland, zombie city, haunted graveyard, dungeon</span><br>
        <span style="color:#888">frozen tundra, ice fortress, winter village</span><br>
        <span style="color:#888">jungle temple, dinosaur valley, underwater ruins</span><br>
        <span style="color:#888">desert wasteland, oasis, war zone, arena</span><br>
        <span style="color:#888">dark forest, enchanted forest, neon alley, shipwreck cove</span><br>
        <span style="color:#888">→ "build a [name]" (auto ground, sky, fog, weather)</span><br><br>
        <strong>⚔️ Combat System:</strong><br>
        <span style="color:#888">• E / click = Light attack (3-hit combo, each hit stronger)</span><br>
        <span style="color:#888">• Q = Heavy attack (2.5x damage, AOE knockback, screen shake)</span><br>
        <span style="color:#888">• C = Dodge roll (i-frames, cancels attacks)</span><br>
        <span style="color:#888">• "spawn 5 enemies" — zone guards, aggro when you approach</span><br>
        <span style="color:#888">• "equip sword/axe/shield/spear/hammer"</span><br>
        <span style="color:#888">• "heal" — full HP & stamina restore</span><br><br>
        <strong>🧱 Crafting (6 recipes):</strong><br>
        <span style="color:#888">• "craft" — view all recipes + your materials</span><br>
        <span style="color:#888">• Iron Sword (3 iron, 1 wood) → 30 DMG</span><br>
        <span style="color:#888">• Fire Sword (5 iron, 3 crystal) → 45 DMG</span><br>
        <span style="color:#888">• Steel Shield / Diamond Shield / Health Potion / Mega Potion</span><br>
        <span style="color:#888">• Materials drop from killed enemies</span><br><br>
        <strong>📊 RPG Systems:</strong><br>
        <span style="color:#888">• "stats" — level, XP, skill points</span><br>
        <span style="color:#888">• "upgrade strength/vitality/endurance/agility/luck"</span><br>
        <span style="color:#888">• 30 XP per kill → level up → +1 skill point</span><br>
        <span style="color:#888">• "quests" — auto-quests on enemy spawn</span><br>
        <span style="color:#888">• "talk" — NPC dialogue + quest rewards</span><br><br>
        <strong>🎮 Play Mode:</strong><br>
        <span style="color:#888">• "play" — WASD move, mouse look, 3rd person</span><br>
        <span style="color:#888">• "character knight/cyberpunk/soldier"</span><br>
        <span style="color:#888">• "toggle camera" / "1st person" / "3rd person"</span><br>
        <span style="color:#888">• Space=jump, Shift=run, F=interact/enter buildings</span><br><br>
        <strong>🌍 World Building:</strong><br>
        <span style="color:#888">• "add [anything]" — 1,339 real GLB models</span><br>
        <span style="color:#888">• "scatter 20 trees" — spread objects randomly</span><br>
        <span style="color:#888">• "time dawn/noon/sunset/night" — lighting</span><br>
        <span style="color:#888">• "make it rain/snow" — weather FX</span><br>
        <span style="color:#888">• "change ground to sand/snow/lava/ice"</span><br>
        <span style="color:#888">• "make castle bigger" / "rotate tree 90"</span><br>
        <span style="color:#888">• "change dragon to red" — recolor objects</span><br>
        <span style="color:#888">• "clear" — blank canvas, start fresh</span><br>
        <span style="color:#888">• "share" — shareable URL / "screenshot" — F2</span><br><br>
        <strong>🗺️ HUD Features:</strong> minimap, health/stamina bars, XP bar, quest tracker, inventory slots, score
      `);
      return;
    }

    // 4. Scene query
    if (lower.match(/what('s| is).*scene|what.*have|describe|count|how many/)) {
      const count = this.objects.length;
      if (count === 0) {
        this.addBotMessage("Blank canvas — the world is yours! 🌍<br><br>Try:<br>• <strong>build a medieval village</strong> → full town with shops<br>• <strong>build a space base</strong> → alien planet outpost<br>• <strong>build a zombie wasteland</strong> → survival horror<br>• <strong>build a frozen tundra</strong> → snowy wilderness<br>• <strong>add dragon</strong> → single 3D model<br>• <strong>help</strong> → see ALL commands<br><br>Then type <strong>play</strong> to explore in 3rd person!");
      } else {
        this.addBotMessage(`You've got <strong>${count} objects</strong> in the scene. ${randomTip()}`);
      }
      return;
    }

    // 5. Clear
    if (lower.match(/^(clear|reset|start over|new scene|fresh|blank)/)) {
      this.executeCmd('clear');
      this.commandCount++;
      this.updateCmdCount();
      this.addBotMessage("🧹 Fresh start! Blank grass terrain.<br>Build anything: <strong>build a [world]</strong> or <strong>add [object]</strong>");
      return;
    }

    // 6. Suggest
    if (lower.match(/suggest|idea|inspire|random|surprise|bored/)) {
      const names = Object.keys(RECIPES);
      const pick = names[Math.floor(Math.random() * names.length)];
      const recipe = RECIPES[pick];
      const capName = pick.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
      this.addBotMessage(`How about <strong>${recipe.emoji} ${capName}</strong>? Say "build a ${pick}" and I'll set it up instantly!<br><br>Or go freeform — describe anything: <em>"a burning city with robots and rain"</em> 💡`);
      return;
    }

    // 7. Appreciation
    if (lower.match(/^(thanks|thank|cool|nice|awesome|amazing|wow|sick|fire|dope|lit)/)) {
      const responses = [
        "Let's keep building! What's next? 🔥",
        "💪 Want to add more to the scene?",
        "That's just the start — what else should we add?",
        "🚀 Ready for more whenever you are!",
      ];
      this.addBotMessage(responses[Math.floor(Math.random() * responses.length)]);
      return;
    }

    // 8. Share scene
    // Save/Load
    if (lower.match(/^(save|load|list saves|delete save|export scene|import scene|autosave)/)) {
      if (lower.match(/^save\s+(.+)/)) {
        var saveName = text.replace(/^save\s+/i, "").trim();
        this.addBotMessage(window._saves.save(saveName));
      } else if (lower === "save") {
        this.addBotMessage(window._saves.save("Quick Save"));
      } else if (lower.match(/^load\s+(.+)/)) {
        var loadName = text.replace(/^load\s+/i, "").trim();
        var result = await window._saves.load(loadName);
        this.addBotMessage(result);
      } else if (lower === "list saves" || lower === "saves") {
        this.addBotMessage("📁 <strong>Saved Games:</strong><br>" + window._saves.list());
      } else if (lower.match(/^delete save\s+(.+)/)) {
        var delName = text.replace(/^delete save\s+/i, "").trim();
        this.addBotMessage(window._saves.delete(delName));
      } else if (lower === "export scene" || lower === "export") {
        this.addBotMessage(window._saves.export());
      } else if (lower === "import scene" || lower === "import") {
        var r = await window._saves.import();
        this.addBotMessage(r);
      } else if (lower === "autosave" || lower === "load autosave") {
        var r2 = await window._saves.autosave.load();
        this.addBotMessage(r2);
      }
      return;
    }

    // Sound controls
    if (lower.match(/^(mute|unmute|sound|volume|music)/)) {
      if (lower.match(/mute|off|silent/)) { window._sound?.mute(); this.addBotMessage("🔇 Sound muted. Type <strong>unmute</strong> to turn back on."); }
      else if (lower.match(/unmute|on|loud/)) { window._sound?.unmute(); this.addBotMessage("🔊 Sound on!"); }
      else { this.addBotMessage("🔊 Sound controls: <strong>mute</strong> / <strong>unmute</strong> / press <strong>M</strong> in play mode"); }
      return;
    }

    if (lower.match(/^(share|export|link|send|url)/)) {
      this.executeCmd('share');
      this.commandCount++;
      this.updateCmdCount();
      this.addBotMessage("📋 <strong>Share link copied to clipboard!</strong> Send it to anyone — they'll see your exact scene. No account needed.");
      return;
    }

    // 8.5. Screenshot
    if (lower.match(/^(screenshot|capture|photo|snap|ss$)/)) {
      this.executeCmd('screenshot');
      this.commandCount++;
      this.updateCmdCount();
      this.addBotMessage("📸 Screenshot downloading! Check your downloads folder.");
      return;
    }

    // 8.7. Custom Game Logic — AI generates code for user's game
    if (lower.match(/^(script|custom code|code editor|game logic|new script|scripts|custom scripts|game scripts)$/)) {
      if (typeof showScriptManager === 'function') showScriptManager();
      else if (typeof showScriptEditor === 'function') showScriptEditor();
      this.addBotMessage('🧠 <strong>Custom Script Editor</strong> opened! Describe what you want in plain English, and I\'ll generate the code.<br><br>Examples:<br>• "When player touches a coin, add points"<br>• "Make all trees sway in the wind"<br>• "NPCs run away when player gets close"<br><br>The code only affects YOUR saved game — never changes the engine.');
      return;
    }
    
    // Check if user is asking for custom game behavior (AI code generation)
    if (lower.match(/^(make|when|if|every|create a? ?script|add a? ?script|i want|can you make)/i) && 
        lower.match(/(when.*player|on.*touch|collect|score|win|lose|spawn.*every|timer|custom|behavior|mechanic|rule|system)/i)) {
      this.addBotMessage('🤖 Generating custom game logic...');
      
      // Use the sandbox's generateUserScript
      if (typeof generateUserScript === 'function') {
        const generatedCode = await generateUserScript(text);
        if (generatedCode) {
          const scriptObj = {
            id: 'script_' + Date.now(),
            name: text.slice(0, 40),
            description: text,
            code: generatedCode,
            enabled: true,
          };
          if (!window._userScripts) window._userScripts = [];
          window._userScripts.push(scriptObj);
          if (typeof runUserScript === 'function') runUserScript(scriptObj);
          localStorage.setItem('crate-user-scripts', JSON.stringify(
            window._userScripts.map(s => ({id:s.id,name:s.name,description:s.description,code:s.code,enabled:s.enabled}))
          ));
          this.addBotMessage('✅ <strong>Custom script running!</strong> "' + this.esc(scriptObj.name) + '"<br><br>This logic is saved with your game. Type <strong>"scripts"</strong> to manage all custom scripts.');
        } else {
          this.addBotMessage('⚠️ Need an AI API key to generate custom code. Click ⚙️ Settings and add your OpenAI/Claude/Gemini key.<br><br>Or type <strong>"code editor"</strong> to write code manually.');
        }
      } else {
        this.addBotMessage('⚠️ Script sandbox not loaded. Try refreshing the page.');
      }
      return;
    }

    // 9. Pass through as engine command
    this.addBotMessage(`Running: <code style="background:#1a1a2e;padding:3px 8px;border-radius:6px;color:#f7c948;font-size:0.78rem">\${this.esc(text)}</code>`);
    this.executeCmd(text);
    this.commandCount++;
    this.updateCmdCount();
    
    await new Promise(r => setTimeout(r, 200));
    this.addBotMessage(`✓ Done! 💡 ${randomTip()}`);
  }

  updateObjects(objects) { this.objects = objects; }
}
