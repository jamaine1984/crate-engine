// === SMART TOWN/CITY BUILDER ===
export class TownBuilder {
  constructor(scene, objects, loadGLBModel, engine = { logOutput: () => {} }) {
    this.scene = scene;
    this.objects = objects;
    this.loadGLB = loadGLBModel;
    this.engine = engine;
  }
  
  _place(model, x, z, scale) {
    // Global spread multiplier for more spacious layouts
    x *= 2.5;
    z *= 2.5;
    scale *= 1.15;
    const id = model + '_t' + Math.random().toString(36).slice(2,6);
    this.loadGLB(id, model, x, z, scale || null);
    return 1;
  }
  
  // 20+ town presets
  getPresets() {
    return [
      // Medieval / Fantasy
      'medieval village', 'medieval town', 'medieval city',
      'fantasy village', 'fantasy town',
      'castle', 'castle town',
      'dungeon', 'dungeon crawler',
      // Sci-Fi / Space
      'space station', 'space base', 'alien planet',
      'sci-fi outpost', 'mars colony',
      // Cyberpunk / Neon
      'cyberpunk city', 'cyberpunk district', 'neon alley',
      // Post-Apocalyptic
      'zombie wasteland', 'zombie city', 'zombie survival camp',
      'post apocalyptic', 'wasteland outpost', 'nuclear wasteland',
      // Desert
      'desert outpost', 'desert town', 'desert wasteland', 'oasis',
      // Forest / Nature
      'forest camp', 'bandit camp', 'enchanted forest', 'dark forest',
      'jungle ruins', 'jungle temple',
      // Winter / Arctic
      'frozen tundra', 'ice fortress', 'winter village', 'arctic base',
      // Ocean / Water
      'pirate port', 'pirate island', 'underwater ruins',
      'fishing village', 'harbor town', 'shipwreck cove',
      // Military / War
      'military fort', 'military base', 'war zone', 'battlefield',
      // Farm / Rural
      'farm', 'farmstead', 'ranch',
      // Urban / Modern
      'modern city', 'downtown', 'suburb',
      // Horror / Dark
      'haunted graveyard', 'haunted mansion', 'crypt',
      'dark cathedral', 'bone yard',
      // Mining / Industrial
      'mountain settlement', 'mining town', 'dwarven mine',
      // Market / Social
      'market district', 'trade hub', 'arena', 'colosseum',
      // Dinosaur / Prehistoric
      'dinosaur valley', 'prehistoric jungle',
      // Platformer
      'platformer world', 'obstacle course',
      // Racing
      'race track', 'street circuit',
    ];
  }
  
  async buildTown(type = 'medieval', size = 'medium') {
    const scales = { small: 0.6, medium: 1, large: 1.5, huge: 2 };
    const s = scales[size] || 1;
    const t = type.toLowerCase();
    
    // Sci-Fi / Space
    if (t.includes('space') || t.includes('mars') || t.includes('alien planet')) return this._spaceBase(s);
    if (t.includes('sci-fi') || t.includes('scifi')) return this._sciFiOutpost(s);
    // Post-Apocalyptic / Zombie
    if (t.includes('zombie') && (t.includes('city') || t.includes('town'))) return this._zombieCity(s);
    if (t.includes('zombie')) return this._zombieWasteland(s);
    if (t.includes('apocal') || t.includes('wasteland') && !t.includes('desert') && !t.includes('nuclear')) return this._postApocalyptic(s);
    if (t.includes('nuclear')) return this._nuclearWasteland(s);
    // Winter / Arctic
    if (t.includes('frozen') || t.includes('tundra') || t.includes('arctic')) return this._frozenTundra(s);
    if (t.includes('ice') && t.includes('fortress')) return this._iceFortress(s);
    if (t.includes('winter') || t.includes('snow')) return this._winterVillage(s);
    // Horror / Dark
    if (t.includes('haunted') && t.includes('mansion')) return this._hauntedMansion(s);
    if (t.includes('graveyard') || t.includes('grave') || t.includes('cemetery')) return this._hauntedGraveyard(s);
    if (t.includes('crypt') || t.includes('catacomb')) return this._crypt(s);
    if (t.includes('cathedral')) return this._darkCathedral(s);
    if (t.includes('bone')) return this._boneYard(s);
    // Dungeon
    if (t.includes('dungeon')) return this._dungeon(s);
    // Jungle
    if (t.includes('jungle') && t.includes('temple')) return this._jungleTemple(s);
    if (t.includes('jungle') || t.includes('tropical')) return this._jungleRuins(s);
    // Dinosaur
    if (t.includes('dinosaur') || t.includes('dino') || t.includes('prehistoric')) return this._dinosaurValley(s);
    // Ocean / Underwater
    if (t.includes('underwater') || t.includes('ocean') || t.includes('sea floor')) return this._underwaterRuins(s);
    if (t.includes('shipwreck')) return this._shipwreckCove(s);
    // Urban / Modern
    if (t.includes('downtown') || t.includes('suburb')) return this._modernCity(s);
    if (t.includes('neon') || t.includes('alley')) return this._neonAlley(s);
    // Arena / Colosseum
    if (t.includes('arena') || t.includes('colosseum') || t.includes('gladiator')) return this._arena(s);
    // Platformer
    if (t.includes('platform') || t.includes('obstacle')) return this._platformerWorld(s);
    // Racing
    if (t.includes('race') || t.includes('circuit') || t.includes('track')) return this._raceTrack(s);
    // Enchanted / Dark forest
    if (t.includes('enchanted')) return this._enchantedForest(s);
    if (t.includes('dark forest') || t.includes('dark wood')) return this._darkForest(s);
    // Oasis
    if (t.includes('oasis')) return this._oasis(s);
    // Desert wasteland
    if (t.includes('desert') && t.includes('waste')) return this._desertWasteland(s);
    // War / Battlefield
    if (t.includes('war zone') || t.includes('battlefield')) return this._warZone(s);
    // Dwarven mine
    if (t.includes('dwarf') || t.includes('dwarven') || t.includes('mine')) return this._dwarvenMine(s);
    // Original presets
    if (t.includes('castle') && t.includes('town')) return this._castleTown(s);
    if (t.includes('castle')) return this._castle(s);
    if (t.includes('cyberpunk') || t.includes('modern')) return this._cyberpunkCity(s);
    if (t.includes('pirate') && t.includes('island')) return this._pirateIsland(s);
    if (t.includes('pirate') || t.includes('port') || t.includes('harbor')) return this._piratePort(s);
    if (t.includes('farm') || t.includes('ranch')) return this._farm(s);
    if (t.includes('forest') || t.includes('bandit')) return this._forestCamp(s);
    if (t.includes('desert')) return this._desertTown(s);
    if (t.includes('fish')) return this._fishingVillage(s);
    if (t.includes('mountain') || t.includes('mining')) return this._mountainSettlement(s);
    if (t.includes('market') || t.includes('trade')) return this._marketDistrict(s);
    if (t.includes('military') || t.includes('fort')) return this._militaryFort(s);
    if (t.includes('fantasy')) return this._fantasyTown(s);
    // === NEW WORLD TYPES ===
    if (t.includes('cowboy') || t.includes('western') || t.includes('saloon') || t.includes('wild west')) return this._westernTown(s);
    if (t.includes('samurai') || t.includes('shogun') || t.includes('feudal') || t.includes('japan')) return this._samuraiVillage(s);
    if (t.includes('ninja')) return this._ninjaTemple(s);
    if (t.includes('viking') || t.includes('norse') || t.includes('valhalla')) return this._vikingVillage(s);
    if (t.includes('aztec') || t.includes('mayan')) return this._aztecTemple(s);
    if (t.includes('egypt') || t.includes('pyramid') || t.includes('pharaoh')) return this._egyptianRuins(s);
    if (t.includes('roman') || t.includes('greek') || t.includes('olymp')) return this._romanCity(s);
    if (t.includes('moon') || t.includes('lunar')) return this._moonBase(s);
    if (t.includes('asteroid') || t.includes('meteor')) return this._asteroidBase(s);
    if (t.includes('galaxy') || t.includes('cosmos') || t.includes('nebula') || t.includes('star')) return this._spaceBase(s);
    if (t.includes('portal') || t.includes('rift') || t.includes('dimension')) return this._portalDimension(s);
    if (t.includes('mech') || t.includes('robot') || t.includes('titan')) return this._mechFactory(s);
    if (t.includes('swamp') || t.includes('marsh') || t.includes('bog') || t.includes('bayou')) return this._swampLands(s);
    if (t.includes('volcano') || t.includes('lava') || t.includes('magma')) return this._volcanoLands(s);
    if (t.includes('crystal') || t.includes('gem') || t.includes('diamond')) return this._crystalCavern(s);
    if (t.includes('treasure') || t.includes('vault') || t.includes('gold')) return this._treasureVault(s);
    if (t.includes('prison') || t.includes('jail') || t.includes('asylum')) return this._prisonComplex(s);
    if (t.includes('steam') || t.includes('victorian') || t.includes('airship')) return this._steampunkCity(s);
    if (t.includes('hell') || t.includes('infernal') || t.includes('abyss') || t.includes('demon')) return this._hellscape(s);
    if (t.includes('heaven') || t.includes('paradise') || t.includes('cloud') || t.includes('sky') || t.includes('floating')) return this._skyIslands(s);
    if (t.includes('bamboo') || t.includes('zen') || t.includes('garden') || t.includes('pagoda')) return this._zenGarden(s);
    if (t.includes('circus') || t.includes('carnival') || t.includes('amusement') || t.includes('theme park')) return this._carnivalGrounds(s);
    if (t.includes('laboratory') || t.includes('lab') || t.includes('bunker') || t.includes('silo')) return this._secretLab(s);
    if (t.includes('factory') || t.includes('warehouse') || t.includes('industrial')) return this._industrialZone(s);
    if (t.includes('train') || t.includes('subway') || t.includes('station')) return this._trainStation(s);
    if (t.includes('savanna') || t.includes('safari')) return this._savannaPlains(s);
    if (t.includes('city')) return this._medievalCity(s);
    if (t.includes('village')) return this._medievalVillage(s);
    return this._medievalTown(s);
  }
  
  // === LAYOUT HELPERS ===
  _row(model, startX, startZ, count, spacingX, spacingZ, scale) {
    let c = 0;
    for (let i = 0; i < count; i++) {
      c += this._place(model, startX + i * spacingX, startZ + i * spacingZ, scale);
    }
    return c;
  }
  
  _ring(model, cx, cz, radius, count, scale) {
    let c = 0;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      c += this._place(model, cx + Math.cos(a) * (radius + Math.random()*3), cz + Math.sin(a) * (radius + Math.random()*3), scale + Math.random());
      }
    return c;
  }
  
  _shopDistrict(cx, cz, scale) {
    let c = 0;
    const S = scale;
    // Town square — open area with fountain/well
    c += this._place('medieval_village_pack_well', cx, cz, 6);
    c += this._place('medieval_village_pack_gazebo', cx - 12, cz, 6);
    
    // Weapon Shop (blacksmith)
    c += this._place('medieval_village_pack_blacksmith', cx - 32, cz - 20, 8);
    c += this._place('medieval_weapons_pack_claymore', cx - 35, cz - 14, 4);
    c += this._place('medieval_weapons_pack_shield_celtic_golden', cx - 29, cz - 14, 4);
    c += this._place('medieval_village_pack_bonfire_lit', cx - 32, cz - 14, 5);
    
    // Potion/Alchemy Shop
    c += this._place('medieval_village_pack_house_3', cx + 32, cz - 20, 8);
    c += this._place('medieval_village_pack_cauldron', cx + 29, cz - 14, 5);
    c += this._place('rpg_items_pack_crystal1', cx + 35, cz - 14, 4);
    c += this._place('rpg_items_pack_potion_1', cx + 32, cz - 14, 3);
    
    // General Store
    c += this._place('medieval_village_pack_house_1', cx - 32, cz + 20, 8);
    c += this._place('medieval_village_pack_marketstand_1', cx - 29, cz + 14, 5);
    c += this._place('medieval_village_pack_crate', cx - 26, cz + 15, 4);
    c += this._place('medieval_village_pack_barrel', cx - 35, cz + 15, 4);
    
    // Inn/Tavern
    c += this._place('medieval_village_pack_inn', cx + 32, cz + 20, 8);
    c += this._place('medieval_village_pack_bench_1', cx + 26, cz + 14, 4);
    c += this._place('medieval_village_pack_bench_2', cx + 38, cz + 14, 4);
    c += this._place('medieval_village_pack_bonfire_lit', cx + 32, cz + 14, 5);
    
    // Market stands in the square
    c += this._place('medieval_village_pack_marketstand_1', cx - 8, cz - 8, 5);
    c += this._place('medieval_village_pack_marketstand_2', cx + 8, cz - 8, 5);
    c += this._place('medieval_village_pack_marketstand_1', cx - 8, cz + 8, 5);
    c += this._place('medieval_village_pack_marketstand_2', cx + 8, cz + 8, 5);
    
    return c;
  }
  
  // === 1. MEDIEVAL VILLAGE (small, cozy) ===
  _medievalVillage(s) {
    let c = 0;
    const sp = 30 * s; // Building spacing
    
    // Town square with shops
    c += this._shopDistrict(0, 0, s);
    
    // Residential houses — spread out along paths
    const houses = ['medieval_village_pack_house_1','medieval_village_pack_house_2','medieval_village_pack_house_3','medieval_village_pack_house_4'];
    let hi = 0;
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      c += this._place(houses[hi%4], -55, i * sp, 8); hi++;
      c += this._place(houses[hi%4], 55, i * sp, 8); hi++;
    }
    
    // Paths
    for (let z = -60*s; z <= 60*s; z += 6) {
      c += this._place('medieval_village_pack_path_straight', 0, z, 5);
    }
    for (let x = -55; x <= 55; x += 6) {
      c += this._place('medieval_village_pack_path_straight', x, 0, 5);
    }
    
    // Lanterns along path
    for (let z = -50*s; z <= 50*s; z += 20) {
      c += this._place('medieval_village_pack_bonfire_lit', -6, z, 5);
      c += this._place('medieval_village_pack_bonfire_lit', 6, z, 5);
    }
    
    // Trees around
    c += this._ring('simple_nature_pack_tree1', 0, 0, 75 * s, Math.floor(25 * s), 6);
    
    // Fences at entrance
    for (let x = -25; x <= 25; x += 4) {
      c += this._place('medieval_village_pack_fence', x, 65 * s, 4);
      c += this._place('medieval_village_pack_fence', x, -65 * s, 4);
    }
    
    return ['✓ Medieval village — ' + c + ' objects (town square, blacksmith, potion shop, inn, general store, ' + (hi) + ' houses)'];
  }
  
  // === 2. MEDIEVAL TOWN (bigger, more buildings) ===
  _medievalTown(s) {
    let c = 0;
    const sp = 22;
    
    c += this._shopDistrict(0, 0, s);
    
    // Stable
    c += this._place('medieval_village_pack_stable', -40, -40, 7);
    
    // Mill
    c += this._place('medieval_village_pack_mill', 40, -40, 7);
    
    // Sawmill
    c += this._place('medieval_village_pack_sawmill', 40, 40, 7);
    
    // Church (bell tower)
    c += this._place('medieval_village_pack_bell_tower', 0, -50 * s, 8);
    
    // Houses along 4 roads
    const houses = ['medieval_village_pack_house_1','medieval_village_pack_house_2','medieval_village_pack_house_3','medieval_village_pack_house_4',
                    'buildings_pack_2_house1','buildings_pack_2_house2'];
    let hi = 0;
    // North road
    for (let z = -25; z >= -60*s; z -= sp) {
      c += this._place(houses[hi%6], -15, z, 7); hi++;
      c += this._place(houses[hi%6], 15, z, 7); hi++;
    }
    // South road
    for (let z = 25; z <= 60*s; z += sp) {
      c += this._place(houses[hi%6], -15, z, 7); hi++;
      c += this._place(houses[hi%6], 15, z, 7); hi++;
    }
    // East road
    for (let x = 30; x <= 60*s; x += sp) {
      c += this._place(houses[hi%6], x, -10, 7); hi++;
      c += this._place(houses[hi%6], x, 10, 7); hi++;
    }
    // West road  
    for (let x = -30; x >= -60*s; x -= sp) {
      c += this._place(houses[hi%6], x, -10, 7); hi++;
      c += this._place(houses[hi%6], x, 10, 7); hi++;
    }
    
    // Paths
    for (let z = -60*s; z <= 60*s; z += 6) c += this._place('medieval_village_pack_path_straight', 0, z, 5);
    for (let x = -60*s; x <= 60*s; x += 6) c += this._place('medieval_village_pack_path_straight', x, 0, 5);
    c += this._place('medieval_village_pack_path_square', 0, 0, 6);
    
    // Lanterns
    for (let z = -50*s; z <= 50*s; z += 20) {
      c += this._place('medieval_village_pack_bonfire_lit', -5, z, 4);
      c += this._place('medieval_village_pack_bonfire_lit', 5, z, 4);
    }
    
    // Trees and rocks
    c += this._ring('simple_nature_pack_tree1', 0, 0, 70*s, Math.floor(30*s), 5);
    c += this._ring('medieval_village_pack_rock_1', 0, 0, 65*s, Math.floor(10*s), 3);
    
    return ['✓ Medieval town — ' + c + ' objects (shops, church, stable, mill, sawmill, ' + hi + ' houses)'];
  }
  
  // === 3. MEDIEVAL CITY ===
  _medievalCity(s) {
    let c = 0;
    // Start with town
    const townResult = this._medievalTown(s * 1.3);
    c += parseInt(townResult[0].match(/(\d+)/)[1]);
    
    // Add walls with towers
    const wallDist = 80 * s;
    const towers = ['modular_medieval_buildings_pack_largetower','modular_medieval_buildings_pack_simpletower'];
    // Corner towers
    c += this._place(towers[0], -wallDist, -wallDist, 8);
    c += this._place(towers[0], wallDist, -wallDist, 8);
    c += this._place(towers[0], -wallDist, wallDist, 8);
    c += this._place(towers[0], wallDist, wallDist, 8);
    // Mid-wall towers
    c += this._place(towers[1], 0, -wallDist, 7);
    c += this._place(towers[1], 0, wallDist, 7);
    c += this._place(towers[1], -wallDist, 0, 7);
    c += this._place(towers[1], wallDist, 0, 7);
    // Walls
    for (let i = -70*s; i <= 70*s; i += 8) {
      c += this._place('modular_medieval_buildings_pack_tallwall', i, -wallDist, 6);
      c += this._place('modular_medieval_buildings_pack_tallwall', i, wallDist, 6);
      c += this._place('modular_medieval_buildings_pack_tallwall', -wallDist, i, 6);
      c += this._place('modular_medieval_buildings_pack_tallwall', wallDist, i, 6);
    }
    // Gate
    c += this._place('modular_medieval_buildings_pack_tallwallentrance', 0, wallDist, 7);
    
    return ['✓ Medieval city — ' + c + ' objects (walled, 8 towers, gate, full town inside)'];
  }
  
  // === 4. FANTASY TOWN ===
  _fantasyTown(s) {
    let c = 0;
    const townResult = this._medievalVillage(s);
    c += parseInt(townResult[0].match(/(\d+)/)[1]);
    
    // Crystals at entrances
    c += this._place('rpg_items_pack_crystal1', -10, 45*s, 5);
    c += this._place('rpg_items_pack_crystal1', 10, 45*s, 5);
    c += this._place('modular_dungeon_2_crystal_blue', -10, -45*s, 5);
    c += this._place('modular_dungeon_2_crystal_blue', 10, -45*s, 5);
    
    // Mushroom ring
    c += this._ring('simple_nature_pack_bush1', 0, 30, 8, 6, 3);
    
    // Enchanted grove
    c += this._ring('nature_pack_willow_1', 30, 30, 12, 5, 6);
    
    return ['✓ Fantasy town — ' + c + ' objects (village + crystals, mushroom ring, enchanted grove)'];
  }
  
  // === 5. CASTLE ===
  _castle(s) {
    let c = 0;
    const cs = 30 * s;
    
    // Main keep
    c += this._place('modular_medieval_buildings_pack_largesquaretower', 0, 0, 12);
    
    // Corner towers
    c += this._place('modular_medieval_buildings_pack_largetower', -cs, -cs, 9);
    c += this._place('modular_medieval_buildings_pack_largetower', cs, -cs, 9);
    c += this._place('modular_medieval_buildings_pack_largetower', -cs, cs, 9);
    c += this._place('modular_medieval_buildings_pack_largetower', cs, cs, 9);
    
    // Walls
    for (let i = -cs+5; i <= cs-5; i += 7) {
      c += this._place('modular_medieval_buildings_pack_tallwall', i, -cs, 7);
      c += this._place('modular_medieval_buildings_pack_tallwall', i, cs, 7);
      c += this._place('modular_medieval_buildings_pack_tallwall', -cs, i, 7);
      c += this._place('modular_medieval_buildings_pack_tallwall', cs, i, 7);
    }
    
    // Gate
    c += this._place('modular_medieval_buildings_pack_tallwallentrance', 0, cs, 8);
    
    // Courtyard
    c += this._place('medieval_village_pack_well', -10, 10, 5);
    c += this._place('medieval_village_pack_stable', 15, 10, 6);
    c += this._place('medieval_village_pack_blacksmith', -15, -10, 6);
    c += this._place('modular_medieval_buildings_pack_target', 10, -15, 5);
    c += this._place('modular_medieval_buildings_pack_dummy', 12, -15, 4);
    
    // Bridge approach
    c += this._place('modular_medieval_buildings_pack_bridge', 0, cs + 15, 8);
    
    // Banners
    c += this._place('modular_medieval_buildings_pack_banner', -5, cs, 5);
    c += this._place('modular_medieval_buildings_pack_banner', 5, cs, 5);
    
    return ['✓ Castle — ' + c + ' objects (keep, 4 towers, walls, gate, bridge, courtyard)'];
  }
  
  // === 6. CASTLE TOWN ===
  _castleTown(s) {
    let c = 0;
    const castleResult = this._castle(s * 0.8);
    c += parseInt(castleResult[0].match(/(\d+)/)[1]);
    
    // Town outside castle walls
    const offset = 50 * s;
    c += this._shopDistrict(0, offset, s);
    
    const houses = ['medieval_village_pack_house_1','medieval_village_pack_house_2','medieval_village_pack_house_3'];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI + Math.PI/2;
      const r = 40 + Math.random() * 15;
      c += this._place(houses[i%3], Math.cos(angle)*r, offset + Math.sin(angle)*r, 7);
    }
    
    c += this._ring('simple_nature_pack_tree1', 0, offset, 60, 15, 5);
    
    return ['✓ Castle town — ' + c + ' objects (castle + town with shops)'];
  }
  
  // === 7. PIRATE PORT ===
  _piratePort(s) {
    let c = 0;
    
    // Docks
    for (let x = -30*s; x <= 30*s; x += 15) {
      c += this._place('pirate_pack_dock', x, -5, 6);
    }
    
    // Ships
    c += this._place('pirate_pack_ship', -20, -20, 8);
    c += this._place('pirate_pack_ship', 20, -20, 8);
    c += this._place('cute_fish_pack_boat', 0, -15, 5);
    
    // Port buildings
    c += this._place('medieval_village_pack_inn', -25, 15, 7);
    c += this._place('medieval_village_pack_house_1', 25, 15, 7);
    c += this._place('medieval_village_pack_blacksmith', 0, 25, 7);
    c += this._place('medieval_village_pack_marketstand_1', -10, 10, 4);
    c += this._place('medieval_village_pack_marketstand_2', 10, 10, 4);
    
    // Barrels and crates everywhere
    for (let i = 0; i < 15; i++) {
      c += this._place(Math.random()>0.5?'pirate_pack_barrel':'pirate_pack_crate', (Math.random()-0.5)*50, (Math.random()-0.5)*20+10, 3);
    }
    
    // Palm trees
    c += this._ring('nature_pack_palm_1', 0, 20, 40, Math.floor(12*s), 5);
    
    return ['✓ Pirate port — ' + c + ' objects (docks, ships, tavern, market, palm trees)'];
  }
  
  // === 8. PIRATE ISLAND ===
  _pirateIsland(s) {
    let c = 0;
    const portResult = this._piratePort(s);
    c += parseInt(portResult[0].match(/(\d+)/)[1]);
    
    // Interior island
    c += this._place('pirate_pack_chest', 0, 50, 4);
    c += this._place('rpg_items_pack_skull', -3, 50, 3);
    c += this._ring('nature_pack_palm_1', 0, 40, 25, 10, 5);
    c += this._ring('medieval_village_pack_rock_1', 0, 0, 55, 15, 4);
    c += this._place('survival_pack_campfire', 0, 40, 4);
    
    return ['✓ Pirate island — ' + c + ' objects (port + treasure, campfire, rock ring)'];
  }
  
  // === 9. FARM ===
  _farm(s) {
    let c = 0;
    
    // Farmhouse
    c += this._place('medieval_village_pack_house_1', 0, 0, 8);
    
    // Barn
    c += this._place('buildings_pack_2_building3_big', 25, 0, 8);
    
    // Stable
    c += this._place('medieval_village_pack_stable', -25, 0, 7);
    
    // Mill
    c += this._place('medieval_village_pack_mill', 0, -35, 8);
    
    // Crop fields
    const crops = ['crops_pack_corn_1','crops_pack_wheat_1','crops_pack_carrot_1','crops_pack_watermelon_1'];
    for (let fx = -3; fx <= 3; fx++) {
      for (let fz = 1; fz <= 4; fz++) {
        c += this._place(crops[(fx+fz)%4], -20 + fx*5, 15 + fz*5, 3);
      }
    }
    
    // Animals (if available)
    c += this._place('animals_pack_cow', 30, 15, 2);
    c += this._place('animals_pack_horse', 30, 25, 2);
    c += this._place('animals_pack_alpaca', -30, 15, 2);
    
    // Fences around fields
    for (let x = -25; x <= 25; x += 4) {
      c += this._place('medieval_village_pack_fence', x, 12, 3);
      c += this._place('medieval_village_pack_fence', x, 38, 3);
    }
    
    // Well
    c += this._place('medieval_village_pack_well', 10, 5, 4);
    
    // Cart
    c += this._place('medieval_village_pack_cart', -10, 5, 5);
    
    // Trees
    c += this._ring('simple_nature_pack_tree1', 0, 10, 50, Math.floor(15*s), 5);
    
    return ['✓ Farm — ' + c + ' objects (farmhouse, barn, stable, mill, crop fields, animals)'];
  }
  
  // === 10. FOREST CAMP ===
  _forestCamp(s) {
    let c = 0;
    
    // Dense trees
    c += this._ring('simple_nature_pack_tree1', 0, 0, 15, 15, 5);
    c += this._ring('simple_nature_pack_tree1', 0, 0, 30, 25, 6);
    c += this._ring('nature_pack_willow_1', 0, 0, 22, 8, 5);
    
    // Central camp
    c += this._place('survival_pack_campfire', 0, 0, 4);
    c += this._place('survival_pack_tent', -6, -4, 5);
    c += this._place('survival_pack_tent', 6, -4, 5);
    c += this._place('survival_pack_woodlog', -3, 3, 3);
    c += this._place('survival_pack_woodlog', 3, 3, 3);
    
    // Supplies
    c += this._place('medieval_village_pack_crate', -8, 2, 3);
    c += this._place('medieval_village_pack_barrel', 8, 2, 3);
    c += this._place('medieval_weapons_pack_bow_wooden', 5, -6, 2);
    
    // Rocks
    c += this._ring('medieval_village_pack_rock_1', 0, 0, 10, 6, 3);
    
    return ['✓ Forest camp — ' + c + ' objects (tents, campfire, dense forest)'];
  }
  
  // === 11. DESERT TOWN ===
  _desertTown(s) {
    let c = 0;
    
    c += this._shopDistrict(0, 0, s);
    
    // Sand-colored buildings
    const bldgs = ['buildings_pack_3_1story_mat','buildings_pack_3_1story_gableroof_mat','buildings_pack_3_2story_mat'];
    for (let i = 0; i < 8*s; i++) {
      const angle = (i / (8*s)) * Math.PI * 2;
      const r = 35 + Math.random() * 15;
      c += this._place(bldgs[i%3], Math.cos(angle)*r, Math.sin(angle)*r, 7);
    }
    
    // Rocks instead of trees
    c += this._ring('medieval_village_pack_rock_1', 0, 0, 55, Math.floor(20*s), 4);
    c += this._ring('medieval_village_pack_rock_2', 0, 0, 45, Math.floor(10*s), 5);
    
    // Few palms at oasis
    c += this._ring('nature_pack_palm_1', 30, 30, 8, 5, 5);
    c += this._place('medieval_village_pack_well', 30, 30, 5);
    
    return ['✓ Desert town — ' + c + ' objects (shops, oasis, scattered buildings)'];
  }
  
  // === 12. FISHING VILLAGE ===
  _fishingVillage(s) {
    let c = 0;
    
    // Waterfront houses
    const houses = ['medieval_village_pack_house_1','medieval_village_pack_house_2','medieval_village_pack_house_3'];
    for (let x = -30*s; x <= 30*s; x += 20) {
      c += this._place(houses[Math.abs(x/20)%3|0], x, 0, 7);
    }
    
    // Docks
    for (let x = -20*s; x <= 20*s; x += 15) {
      c += this._place('pirate_pack_dock', x, -10, 5);
    }
    
    // Boats
    c += this._place('cute_fish_pack_boat', -15, -20, 5);
    c += this._place('cute_fish_pack_boat', 15, -20, 5);
    
    // Market
    c += this._place('medieval_village_pack_marketstand_1', -5, 10, 4);
    c += this._place('medieval_village_pack_marketstand_2', 5, 10, 4);
    c += this._place('medieval_village_pack_barrel', -8, 5, 3);
    c += this._place('medieval_village_pack_crate', 8, 5, 3);
    
    // Trees
    c += this._ring('simple_nature_pack_tree1', 0, 20, 30, Math.floor(12*s), 5);
    
    return ['✓ Fishing village — ' + c + ' objects (waterfront houses, docks, boats, market)'];
  }
  
  // === 13. MOUNTAIN SETTLEMENT ===
  _mountainSettlement(s) {
    let c = 0;
    
    // Big rocks as "mountains"
    for (let i = 0; i < 10; i++) {
      c += this._place('medieval_village_pack_rock_'+((i%3)+1), (Math.random()-0.5)*80, (Math.random()-0.5)*80, 10+Math.random()*8);
    }
    
    // Settlement in a valley
    c += this._shopDistrict(0, 0, s * 0.8);
    
    // Mine entrance
    c += this._place('modular_dungeon_pack_doorway', 30, -20, 6);
    c += this._place('medieval_village_pack_cart', 25, -18, 5);
    c += this._place('medieval_village_pack_crate', 27, -16, 3);
    
    // Pine trees
    c += this._ring('simple_nature_pack_tree1', 0, 0, 50, Math.floor(15*s), 6);
    
    return ['✓ Mountain settlement — ' + c + ' objects (rocky terrain, mine, shops, pines)'];
  }
  
  // === 14. MARKET DISTRICT ===
  _marketDistrict(s) {
    let c = 0;
    
    // Dense market stalls in rows
    for (let x = -25*s; x <= 25*s; x += 12) {
      for (let z = -15*s; z <= 15*s; z += 12) {
        c += this._place(Math.random()>0.5?'medieval_village_pack_marketstand_1':'medieval_village_pack_marketstand_2', x, z, 5);
        // Random goods near each stall
        c += this._place(Math.random()>0.5?'medieval_village_pack_crate':'medieval_village_pack_barrel', x+3, z+2, 3);
      }
    }
    
    // Surrounding buildings
    for (let x = -35*s; x <= 35*s; x += 20) {
      c += this._place('buildings_pack_3_2story_mat', x, -25*s, 7);
      c += this._place('buildings_pack_3_2story_mat', x, 25*s, 7);
    }
    
    // Fountain center
    c += this._place('medieval_village_pack_well', 0, 0, 5);
    
    // Lanterns
    for (let x = -25*s; x <= 25*s; x += 12) {
      c += this._place('medieval_village_pack_bonfire_lit', x, -20*s, 4);
      c += this._place('medieval_village_pack_bonfire_lit', x, 20*s, 4);
    }
    
    return ['✓ Market district — ' + c + ' objects (market stalls, shops, fountain)'];
  }
  
  // === 15. MILITARY FORT ===
  _militaryFort(s) {
    let c = 0;
    const fs = 35 * s;
    
    // Walls
    for (let i = -fs; i <= fs; i += 7) {
      c += this._place('modular_medieval_buildings_pack_tallwall', i, -fs, 6);
      c += this._place('modular_medieval_buildings_pack_tallwall', i, fs, 6);
      c += this._place('modular_medieval_buildings_pack_tallwall', -fs, i, 6);
      c += this._place('modular_medieval_buildings_pack_tallwall', fs, i, 6);
    }
    
    // Corner towers
    c += this._place('modular_medieval_buildings_pack_simpletower', -fs, -fs, 8);
    c += this._place('modular_medieval_buildings_pack_simpletower', fs, -fs, 8);
    c += this._place('modular_medieval_buildings_pack_simpletower', -fs, fs, 8);
    c += this._place('modular_medieval_buildings_pack_simpletower', fs, fs, 8);
    
    // Gate
    c += this._place('modular_medieval_buildings_pack_tallwallentrance', 0, fs, 7);
    
    // Barracks
    c += this._place('buildings_pack_3_2story_mat', -15, -10, 7);
    c += this._place('buildings_pack_3_2story_mat', 15, -10, 7);
    
    // Training area
    c += this._place('modular_medieval_buildings_pack_target', -5, 15, 5);
    c += this._place('modular_medieval_buildings_pack_target', 0, 15, 5);
    c += this._place('modular_medieval_buildings_pack_target', 5, 15, 5);
    c += this._place('modular_medieval_buildings_pack_dummy', -5, 10, 4);
    c += this._place('modular_medieval_buildings_pack_dummy', 5, 10, 4);
    
    // Armory
    c += this._place('medieval_village_pack_blacksmith', 0, -20, 7);
    c += this._place('medieval_weapons_pack_claymore', -3, -16, 3);
    c += this._place('medieval_weapons_pack_shield_celtic_golden', 3, -16, 3);
    
    // Supplies
    c += this._place('medieval_village_pack_crate', -20, 5, 3);
    c += this._place('medieval_village_pack_crate', -20, 8, 3);
    c += this._place('medieval_village_pack_barrel', 20, 5, 3);
    c += this._place('medieval_village_pack_barrel', 20, 8, 3);
    
    return ['✓ Military fort — ' + c + ' objects (walled, towers, barracks, training, armory)'];
  }
  
  // === 16. CYBERPUNK CITY ===
  _cyberpunkCity(s) {
    let c = 0;
    const blockSize = 30 * s;
    const gridSize = Math.floor(2 * s);
    
    const buildings = [
      'buildings_pack_2_building1_large','buildings_pack_2_building2_large',
      'buildings_pack_2_building3_big','buildings_pack_2_building4',
    ];
    
    for (let bx = -gridSize; bx <= gridSize; bx++) {
      for (let bz = -gridSize; bz <= gridSize; bz++) {
        const cx = bx * (blockSize + 10);
        const cz = bz * (blockSize + 10);
        
        // Buildings at block corners
        c += this._place(buildings[(bx+bz+4)%4], cx - blockSize/3, cz - blockSize/3, 10 + Math.random()*5);
        c += this._place(buildings[(bx+bz+5)%4], cx + blockSize/3, cz - blockSize/3, 8 + Math.random()*5);
        c += this._place(buildings[(bx+bz+6)%4], cx - blockSize/3, cz + blockSize/3, 9 + Math.random()*4);
        
        // Street stuff
        c += this._place('street_pack_street_4way', cx, cz, 8);
        c += this._place('street_pack_trafficlight', cx + 4, cz + 4, 4);
        c += this._place('street_pack_streetlight_double', cx + blockSize/2, cz, 5);
      }
    }
    
    // Vehicles
    for (let i = 0; i < 8*s; i++) {
      c += this._place(Math.random()>0.5?'car':'truck', (Math.random()-0.5)*80*s, (Math.random()-0.5)*80*s, 4);
    }
    
    // Cyberpunk props
    c += this._place('cyberpunk_pack_computer_large', 5, 5, 4);
    c += this._place('cyberpunk_pack_antenna_1', 20, -20, 5);
    
    return ['✓ Cyberpunk city — ' + c + ' objects (' + ((gridSize*2+1)**2) + ' blocks, traffic, vehicles)'];
  }

  // ===========================
  // NEW GENRE PRESETS (20+ new)
  // ===========================

  // === SPACE BASE / ALIEN PLANET ===
  _spaceBase(s) {
    let c = 0;
    // Main base buildings
    c += this._place('ultimate_space_pack_base_large-transformed', 0, 0, 8);
    c += this._place('ultimate_space_pack_building_l-transformed', -25, 0, 7);
    c += this._place('ultimate_space_pack_building_l-transformed', 25, 0, 7);
    c += this._place('ultimate_space_pack_house_cylinder-transformed', -15, -25, 6);
    c += this._place('ultimate_space_pack_house_long-transformed', 15, -25, 6);
    c += this._place('ultimate_space_pack_house_single-transformed', -15, 25, 6);
    c += this._place('ultimate_space_pack_house_open-transformed', 15, 25, 6);
    c += this._place('ultimate_space_pack_geodesicdome-transformed', 0, -40, 8);
    // Solar panels & infrastructure
    for (let i = -2; i <= 2; i++) {
      c += this._place('ultimate_space_pack_solarpanel_structure-transformed', 40, i * 12, 5);
      c += this._place('ultimate_space_pack_solarpanel_ground-transformed', -40, i * 12, 5);
    }
    // Connectors & ramps
    c += this._place('ultimate_space_pack_connector-transformed', -8, 0, 5);
    c += this._place('ultimate_space_pack_connector-transformed', 8, 0, 5);
    c += this._place('ultimate_space_pack_ramp-transformed', 0, 15, 5);
    c += this._place('ultimate_space_pack_stairs-transformed', 0, -15, 5);
    // Roof equipment
    c += this._place('ultimate_space_pack_roof_antenna-transformed', -25, -15, 4);
    c += this._place('ultimate_space_pack_roof_radar-transformed', 25, -15, 5);
    // Rovers
    c += this._place('ultimate_space_pack_rover_1-transformed', 30, 30, 5);
    c += this._place('ultimate_space_pack_rover_2-transformed', 35, 35, 5);
    c += this._place('ultimate_space_pack_rover_round-transformed', -30, 30, 5);
    // Spaceships on landing pads
    c += this._place('spaceships_pack_striker', 50, 0, 6);
    c += this._place('spaceships_pack_dispatcher', -50, 0, 6);
    c += this._place('ultimate_space_pack_spaceship_barbarathebee-transformed', 0, 55, 6);
    // Alien vegetation
    const alienTrees = ['ultimate_space_pack_tree_blob_1-transformed','ultimate_space_pack_tree_blob_2-transformed','ultimate_space_pack_tree_blob_3-transformed','ultimate_space_pack_tree_floating_1-transformed','ultimate_space_pack_tree_floating_2-transformed','ultimate_space_pack_tree_lava_1-transformed','ultimate_space_pack_tree_spikes_1-transformed','ultimate_space_pack_tree_spiral_1-transformed','ultimate_space_pack_tree_swirl_1-transformed'];
    c += this._ring(alienTrees[Math.floor(Math.random()*alienTrees.length)], 0, 0, 60 * s, Math.floor(15 * s), 4);
    // Alien rocks
    for (let i = 0; i < 12; i++) {
      const r = ['ultimate_space_pack_rock_1-transformed','ultimate_space_pack_rock_2-transformed','ultimate_space_pack_rock_3-transformed','ultimate_space_pack_rock_large_1-transformed'][i%4];
      c += this._place(r, (Math.random()-0.5)*100*s, (Math.random()-0.5)*100*s, 3+Math.random()*4);
    }
    // Alien bushes
    for (let i = 0; i < 10; i++) {
      c += this._place('ultimate_space_pack_bush_'+(1+i%3)+'-transformed', (Math.random()-0.5)*80*s, (Math.random()-0.5)*80*s, 3);
    }
    // Enemies
    c += this._place('ultimate_space_pack_enemy_large-transformed', 40, -40, 5);
    c += this._place('ultimate_space_pack_enemy_flying-transformed', -35, 40, 4);
    c += this._place('ultimate_space_pack_enemy_small-transformed', 20, -50, 3);
    // Astronauts
    c += this._place('ultimate_space_pack_astronaut_barbarathebee-transformed', 5, 10, 4);
    c += this._place('modular_men_spacesuit', -5, 10, 4);
    // Pickups
    c += this._place('ultimate_space_pack_pickup_crate-transformed', 10, 5, 3);
    c += this._place('ultimate_space_pack_pickup_health-transformed', -10, 5, 2);
    // Planets in sky (decorative, placed high)
    c += this._place('ultimate_space_pack_planet_1-transformed', 80, 0, 20);
    c += this._place('ultimate_space_pack_planet_5-transformed', -60, 80, 15);
    return ['✓ Space base on alien planet — ' + c + ' objects (base, dome, solar arrays, rovers, spaceships, alien flora, enemies)'];
  }

  _sciFiOutpost(s) {
    let c = 0;
    // Small frontier outpost
    c += this._place('ultimate_space_pack_house_single-transformed', 0, 0, 7);
    c += this._place('ultimate_space_pack_house_cylinder-transformed', -20, 0, 6);
    c += this._place('ultimate_space_pack_house_openback-transformed', 20, 0, 6);
    c += this._place('ultimate_space_pack_connector-transformed', -10, 0, 5);
    c += this._place('ultimate_space_pack_connector-transformed', 10, 0, 5);
    c += this._place('ultimate_space_pack_solarpanel_structure-transformed', 0, -20, 5);
    c += this._place('ultimate_space_pack_roof_antenna-transformed', 0, 20, 5);
    c += this._place('ultimate_space_pack_rover_1-transformed', 15, 15, 5);
    c += this._place('cyberpunk_pack_fence', -25, -10, 4);
    c += this._place('cyberpunk_pack_fence', 25, -10, 4);
    // Defensive turrets (using cyberpunk enemies as turrets)
    c += this._place('cyberpunk_pack_enemy_2legs_gun', -30, 0, 5);
    c += this._place('cyberpunk_pack_enemy_2legs_gun', 30, 0, 5);
    // Sci-fi guns on racks
    c += this._place('modular_sci_fi_guns_pack_ar_1', 5, -5, 3);
    c += this._place('modular_sci_fi_guns_pack_ar_3', -5, -5, 3);
    // Alien environment
    c += this._ring('ultimate_space_pack_rock_large_1-transformed', 0, 0, 40*s, 8, 5);
    c += this._ring('ultimate_space_pack_tree_spiral_1-transformed', 0, 0, 35*s, 6, 4);
    c += this._place('spaceships_pack_insurgent', 0, 35, 6);
    return ['✓ Sci-fi outpost — ' + c + ' objects (hab modules, solar, rover, defenses, alien terrain)'];
  }

  // === ZOMBIE WASTELAND ===
  _zombieWasteland(s) {
    let c = 0;
    // Destroyed/abandoned buildings
    const bldgs = ['buildings_pack_2_building1_large','buildings_pack_2_building2_large','buildings_pack_2_building3_big','buildings_pack_2_house1','buildings_pack_2_house2'];
    for (let i = 0; i < 6; i++) {
      const x = (Math.random()-0.5) * 80 * s;
      const z = (Math.random()-0.5) * 80 * s;
      c += this._place(bldgs[i%bldgs.length], x, z, 6+Math.random()*3);
    }
    // Barricades & survival gear
    for (let i = 0; i < 8; i++) {
      c += this._place('survival_pack_woodlog', (Math.random()-0.5)*60*s, (Math.random()-0.5)*60*s, 4);
    }
    c += this._place('survival_pack_tent', 0, 0, 6);
    c += this._place('survival_pack_bonfire_fire', 3, 3, 4);
    c += this._place('survival_pack_beartrap_open', 15, 10, 3);
    c += this._place('survival_pack_beartrap_open', -15, -10, 3);
    c += this._place('survival_pack_beartrap_closed', 20, -15, 3);
    // Weapons scattered
    c += this._place('survival_pack_shotgun_1', 5, -2, 3);
    c += this._place('survival_pack_pistol_1', -5, 2, 2);
    c += this._place('survival_pack_revolver_1', 8, 5, 2);
    c += this._place('survival_pack_axe', -8, -3, 3);
    // Supplies
    c += this._place('survival_pack_firstaidkit', 2, -5, 2);
    c += this._place('survival_pack_can_closed', -3, -4, 2);
    c += this._place('survival_pack_waterbottle_1', 4, -3, 2);
    c += this._place('survival_pack_radio', -2, 6, 2);
    c += this._place('survival_pack_gascan', 10, 8, 3);
    // Abandoned vehicles
    c += this._place('car', 25, -20, 5);
    c += this._place('truck', -30, 25, 6);
    c += this._place('milk_truck', 35, 15, 5);
    // Dead trees & desolation
    c += this._ring('nature_pack_commontree_dead_1', 0, 0, 50*s, 10, 5);
    c += this._ring('nature_pack_commontree_dead_2', 0, 0, 55*s, 8, 4);
    // Skeletons & bones
    for (let i = 0; i < 6; i++) {
      c += this._place('recursive_skeletons', (Math.random()-0.5)*70*s, (Math.random()-0.5)*70*s, 3);
    }
    c += this._place('modular_dungeon_pack_bones', 12, -8, 3);
    c += this._place('modular_dungeon_pack_bones2', -12, 8, 3);
    c += this._place('modular_dungeon_1_skull', 18, 5, 3);
    // Trash cans & debris
    for (let i = 0; i < 5; i++) {
      c += this._place('survival_pack_trashcan', (Math.random()-0.5)*50*s, (Math.random()-0.5)*50*s, 4);
      c += this._place('survival_pack_can_broken', (Math.random()-0.5)*40*s, (Math.random()-0.5)*40*s, 2);
    }
    // Street elements
    c += this._place('street_pack_sign_stop', 20, 0, 4);
    c += this._place('street_pack_trafficlight', -25, 5, 5);
    c += this._place('street_pack_streetlight_single', 30, -10, 5);
    return ['✓ Zombie wasteland — ' + c + ' objects (ruins, survival camp, weapons, bear traps, dead trees, skeletons, abandoned vehicles)'];
  }

  _zombieCity(s) {
    let c = 0;
    // Dense ruined city blocks
    const bldgs = ['buildings_pack_3_4story_mat','buildings_pack_3_3story_balcony_mat','buildings_pack_3_2story_double_mat','buildings_pack_3_6story_stack_mat','buildings_pack_3_2story_wide_mat','buildings_pack_2_building3_big'];
    for (let row = -2; row <= 2; row++) {
      for (let col = -2; col <= 2; col++) {
        if (Math.abs(row) <= 1 && Math.abs(col) <= 1 && row === 0 && col === 0) continue; // leave center open
        c += this._place(bldgs[Math.floor(Math.random()*bldgs.length)], col * 25 * s, row * 25 * s, 7+Math.random()*3);
      }
    }
    // Streets
    for (let i = -60*s; i <= 60*s; i += 8) {
      c += this._place('street_pack_street_straight', i, 0, 5);
      c += this._place('street_pack_street_straight', 0, i, 5);
    }
    c += this._place('street_pack_street_4way', 0, 0, 5);
    // Abandoned cars blocking streets
    for (let i = 0; i < 8; i++) {
      c += this._place('car', (Math.random()-0.5)*50*s, (Math.random()-0.5)*50*s, 4);
    }
    // Fire barrels / barricades
    for (let i = 0; i < 6; i++) {
      c += this._place('survival_pack_bonfire_fire', (Math.random()-0.5)*40*s, (Math.random()-0.5)*40*s, 3);
    }
    // Skeletons everywhere
    for (let i = 0; i < 10; i++) {
      c += this._place('recursive_skeletons', (Math.random()-0.5)*60*s, (Math.random()-0.5)*60*s, 3);
    }
    // Weapons & supplies
    c += this._place('survival_pack_shotgun_2', 5, 5, 3);
    c += this._place('survival_pack_pistol_2', -8, 3, 2);
    c += this._place('survival_pack_firstaidkit_hard', 0, 8, 2);
    // Traffic lights tilted, signs
    c += this._place('street_pack_trafficlight', 15, 15, 5);
    c += this._place('street_pack_trafficlight_2', -15, -15, 5);
    c += this._place('street_pack_sign_stop', 20, -20, 4);
    // Dead trees
    c += this._ring('nature_pack_commontree_dead_3', 0, 0, 70*s, 12, 4);
    return ['✓ Zombie-infested city — ' + c + ' objects (ruined buildings, blocked streets, skeletons, abandoned cars, fires)'];
  }

  // === POST-APOCALYPTIC ===
  _postApocalyptic(s) {
    let c = 0;
    // Scattered ruined buildings
    const ruins = ['buildings_pack_2_building1_small','buildings_pack_2_building2_small','buildings_pack_2_building3_small','buildings_pack_2_house1'];
    for (let i = 0; i < 8; i++) {
      c += this._place(ruins[i%ruins.length], (Math.random()-0.5)*100*s, (Math.random()-0.5)*100*s, 5+Math.random()*3);
    }
    // Survival camp in center
    c += this._place('survival_pack_tent', 0, 0, 7);
    c += this._place('survival_pack_tent', 8, 5, 6);
    c += this._place('survival_pack_bonfire_fire', 4, 2, 4);
    c += this._place('survival_pack_raft', -5, 8, 4);
    // Weapon stash
    c += this._place('survival_pack_shotgun_sawedoff', 2, -3, 3);
    c += this._place('survival_pack_revolver_2', -2, -4, 2);
    c += this._place('survival_pack_knife', 0, -5, 2);
    // Resources
    for (let i = 0; i < 5; i++) {
      c += this._place('survival_pack_propanetank', (Math.random()-0.5)*30, (Math.random()-0.5)*30, 3);
      c += this._place('survival_pack_battery_big', (Math.random()-0.5)*20, (Math.random()-0.5)*20, 2);
    }
    // Vehicles
    c += this._place('tank_pack_tank', 40, -30, 6);
    c += this._place('car', -35, 20, 5);
    c += this._place('truck', 30, 40, 6);
    // Dead nature
    c += this._ring('nature_pack_commontree_dead_4', 0, 0, 60*s, 15, 4);
    c += this._ring('nature_pack_rock_5', 0, 0, 50*s, 10, 5);
    // Bones
    for (let i = 0; i < 5; i++) {
      c += this._place('modular_dungeon_pack_bones', (Math.random()-0.5)*60*s, (Math.random()-0.5)*60*s, 3);
    }
    c += this._place('street_pack_sign_stop', 25, 0, 4);
    c += this._place('street_pack_streetlight_single', -20, -15, 5);
    return ['✓ Post-apocalyptic wasteland — ' + c + ' objects (ruins, survival camp, weapons, tank, dead trees, scattered bones)'];
  }

  _nuclearWasteland(s) {
    let c = 0;
    // Cratered landscape — rocks everywhere
    for (let i = 0; i < 20; i++) {
      const r = ['nature_pack_rock_'+((i%7)+1), 'simple_nature_pack_rock'+((i%3)+1)][i%2];
      c += this._place(r, (Math.random()-0.5)*120*s, (Math.random()-0.5)*120*s, 3+Math.random()*5);
    }
    // Few ruined structures
    c += this._place('buildings_pack_2_building1_small', 0, 0, 6);
    c += this._place('buildings_pack_2_house2', -30, 20, 5);
    // Dead trees — sparse
    for (let i = 0; i < 8; i++) {
      c += this._place('nature_pack_commontree_dead_'+(1+i%5), (Math.random()-0.5)*100*s, (Math.random()-0.5)*100*s, 4);
    }
    // Survival supplies
    c += this._place('survival_pack_tent', 10, 10, 6);
    c += this._place('survival_pack_bonfire_fire', 13, 13, 3);
    c += this._place('survival_pack_gascan', 8, 12, 3);
    c += this._place('survival_pack_flaregun', 12, 8, 2);
    // Skeletons
    for (let i = 0; i < 4; i++) {
      c += this._place('recursive_skeletons', (Math.random()-0.5)*80*s, (Math.random()-0.5)*80*s, 3);
    }
    // Abandoned tank
    c += this._place('tank_pack_tank2', -20, -30, 7);
    return ['✓ Nuclear wasteland — ' + c + ' objects (irradiated ruins, craters, dead trees, survival gear, abandoned tank)'];
  }

  // === FROZEN TUNDRA / WINTER ===
  _frozenTundra(s) {
    let c = 0;
    // Snow-covered trees
    const snowTrees = ['nature_pack_commontree_snow_1','nature_pack_commontree_snow_2','nature_pack_commontree_snow_3','nature_pack_birchtree_snow_1','nature_pack_birchtree_snow_2','nature_pack_birchtree_snow_3'];
    for (let i = 0; i < 25 * s; i++) {
      c += this._place(snowTrees[i%snowTrees.length], (Math.random()-0.5)*120*s, (Math.random()-0.5)*120*s, 4+Math.random()*3);
    }
    // Dead snow trees
    const deadSnow = ['nature_pack_commontree_dead_snow_1','nature_pack_commontree_dead_snow_2','nature_pack_birchtree_dead_snow_1','nature_pack_birchtree_dead_snow_2'];
    for (let i = 0; i < 10; i++) {
      c += this._place(deadSnow[i%deadSnow.length], (Math.random()-0.5)*100*s, (Math.random()-0.5)*100*s, 4);
    }
    // Snow bushes
    c += this._ring('nature_pack_bush_snow_1', 0, 0, 40*s, 8, 3);
    // Rocks
    for (let i = 0; i < 12; i++) {
      c += this._place('nature_pack_rock_'+(1+i%7), (Math.random()-0.5)*100*s, (Math.random()-0.5)*100*s, 4+Math.random()*3);
    }
    // Small camp
    c += this._place('survival_pack_tent', 0, 0, 7);
    c += this._place('survival_pack_bonfire_fire', 5, 3, 4);
    c += this._place('survival_pack_woodlog', -3, 5, 3);
    c += this._place('survival_pack_axe', 2, -2, 3);
    // Animals
    c += this._place('animals_pack_wolf', 30, 20, 1.5);
    c += this._place('animals_pack_wolf', 33, 23, 1.5);
    c += this._place('animals_pack_deer', -25, -30, 2);
    c += this._place('animals_pack_stag', -30, -25, 2);
    return ['✓ Frozen tundra — ' + c + ' objects (snow forests, dead trees, camp, wolves, deer, rocks)'];
  }

  _iceFortress(s) {
    let c = 0;
    // Castle walls made of medieval towers (representing ice)
    const wallDist = 40 * s;
    for (let i = -wallDist; i <= wallDist; i += 10) {
      c += this._place('modular_medieval_buildings_pack_tallwall', i, -wallDist, 7);
      c += this._place('modular_medieval_buildings_pack_tallwall', i, wallDist, 7);
      c += this._place('modular_medieval_buildings_pack_tallwall', -wallDist, i, 7);
      c += this._place('modular_medieval_buildings_pack_tallwall', wallDist, i, 7);
    }
    // Corner towers
    c += this._place('modular_medieval_buildings_pack_largetower', -wallDist, -wallDist, 8);
    c += this._place('modular_medieval_buildings_pack_largetower', wallDist, -wallDist, 8);
    c += this._place('modular_medieval_buildings_pack_largetower', -wallDist, wallDist, 8);
    c += this._place('modular_medieval_buildings_pack_largetower', wallDist, wallDist, 8);
    // Inner keep
    c += this._place('modular_medieval_buildings_pack_largesquaretower', 0, 0, 10);
    c += this._place('modular_medieval_buildings_pack_pointytower', -15, -15, 8);
    c += this._place('modular_medieval_buildings_pack_pointytower', 15, -15, 8);
    // Surrounding snow landscape
    const snowTrees = ['nature_pack_commontree_snow_1','nature_pack_commontree_snow_2','nature_pack_birchtree_snow_3'];
    c += this._ring(snowTrees[0], 0, 0, 55*s, 12, 5);
    c += this._ring('nature_pack_bush_snow_2', 0, 0, 50*s, 8, 3);
    // Crystals (ice shards)
    for (let i = 0; i < 8; i++) {
      c += this._place('rpg_items_pack_crystal'+(1+i%5), (Math.random()-0.5)*30, (Math.random()-0.5)*30, 4+Math.random()*3);
    }
    return ['✓ Ice fortress — ' + c + ' objects (walled fortress, towers, keep, snow forest, ice crystals)'];
  }

  _winterVillage(s) {
    let c = 0;
    // Houses
    const houses = ['medieval_village_pack_house_1','medieval_village_pack_house_2','medieval_village_pack_house_3','medieval_village_pack_house_4'];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      c += this._place(houses[i%4], Math.cos(angle)*25*s, Math.sin(angle)*25*s, 7);
    }
    // Center well & bonfire
    c += this._place('medieval_village_pack_well', 0, 0, 5);
    c += this._place('survival_pack_bonfire_fire', 5, 0, 4);
    // Snow trees everywhere
    const snowTrees = ['nature_pack_commontree_snow_1','nature_pack_commontree_snow_2','nature_pack_commontree_snow_3','nature_pack_commontree_snow_4','nature_pack_commontree_snow_5'];
    c += this._ring(snowTrees[0], 0, 0, 45*s, 15, 5);
    c += this._ring(snowTrees[2], 0, 0, 50*s, 10, 4);
    // Birch snow trees
    c += this._ring('nature_pack_birchtree_snow_1', 0, 0, 40*s, 8, 4);
    // Snow bushes
    for (let i = 0; i < 10; i++) {
      c += this._place('nature_pack_bush_snow_'+(1+i%2), (Math.random()-0.5)*60*s, (Math.random()-0.5)*60*s, 3);
    }
    // Animals
    c += this._place('animals_pack_deer', 20, 35, 2);
    c += this._place('animals_pack_horse_white', -15, -30, 2);
    // Lanterns
    for (let i = 0; i < 6; i++) {
      const a2 = (i / 6) * Math.PI * 2;
      c += this._place('medieval_village_pack_bonfire_lit', Math.cos(a2)*18*s, Math.sin(a2)*18*s, 3);
    }
    return ['✓ Winter village — ' + c + ' objects (snow-covered houses, bonfire, snow forests, lanterns, wildlife)'];
  }

  // === HORROR / DARK ===
  _hauntedGraveyard(s) {
    let c = 0;
    // Dungeon entrance as mausoleum
    c += this._place('modular_dungeon_pack_entrance', 0, 0, 8);
    c += this._place('modular_dungeon_pack_entrance2', 0, -20, 8);
    // Tombstones & graves in rows
    for (let row = -3; row <= 3; row++) {
      for (let col = -3; col <= 3; col++) {
        if (Math.random() > 0.6) {
          c += this._place('modular_dungeon_pack_column_broken', col * 8, row * 8 + 20, 4);
        }
      }
    }
    // Skulls & bones scattered
    for (let i = 0; i < 10; i++) {
      c += this._place(i%2 ? 'modular_dungeon_1_skull' : 'modular_dungeon_pack_bones', (Math.random()-0.5)*60*s, (Math.random()-0.5)*60*s, 2+Math.random());
    }
    // Dead trees
    c += this._ring('nature_pack_commontree_dead_1', 0, 0, 45*s, 12, 5);
    c += this._ring('nature_pack_birchtree_dead_2', 0, 0, 40*s, 8, 4);
    // Cobwebs on structures
    c += this._place('modular_dungeon_1_cobweb', 5, 5, 4);
    c += this._place('modular_dungeon_1_cobweb2', -5, -5, 4);
    // Torches flickering
    for (let i = 0; i < 6; i++) {
      c += this._place('modular_dungeon_1_torch', (Math.random()-0.5)*40*s, (Math.random()-0.5)*40*s, 4);
    }
    // Skeletons rising
    for (let i = 0; i < 5; i++) {
      c += this._place('recursive_skeletons', (Math.random()-0.5)*50*s, (Math.random()-0.5)*50*s, 3);
    }
    // Iron fences
    for (let x = -35; x <= 35; x += 5) {
      c += this._place('modular_dungeon_1_fence_straight_modular', x, 50*s, 4);
      c += this._place('modular_dungeon_1_fence_straight_modular', x, -50*s, 4);
    }
    // Spiders
    c += this._place('easy_enemies_pack_spider', 15, 10, 0.8);
    c += this._place('easy_enemies_pack_spider', -20, -15, 0.8);
    return ['✓ Haunted graveyard — ' + c + ' objects (mausoleums, graves, skulls, dead trees, skeletons, cobwebs, iron fences)'];
  }

  _hauntedMansion(s) {
    let c = 0;
    // Main mansion (large building)
    c += this._place('buildings_pack_3_4story_wide_2doors_roof_mat', 0, 0, 10);
    // Side wings
    c += this._place('buildings_pack_3_2story_wide_mat', -25, 0, 8);
    c += this._place('buildings_pack_3_2story_wide_mat', 25, 0, 8);
    // Entrance columns
    c += this._place('modular_dungeon_pack_column', -5, 15, 6);
    c += this._place('modular_dungeon_pack_column', 5, 15, 6);
    // Garden — dead trees & bushes
    c += this._ring('nature_pack_commontree_dead_3', 0, 0, 40*s, 10, 5);
    c += this._ring('nature_pack_commontree_dead_4', 0, 0, 35*s, 6, 4);
    // Cobwebs
    c += this._place('modular_dungeon_1_cobweb', 0, 10, 5);
    c += this._place('modular_dungeon_1_cobweb2', -10, 5, 4);
    // Interior visible items
    c += this._place('modular_dungeon_pack_candelabrum_tall', -3, 5, 5);
    c += this._place('modular_dungeon_pack_candelabrum_tall', 3, 5, 5);
    c += this._place('modular_dungeon_pack_carpet', 0, 8, 6);
    // Iron fence perimeter
    for (let x = -40; x <= 40; x += 5) {
      c += this._place('modular_dungeon_1_fence_straight_modular', x, 35*s, 4);
      c += this._place('modular_dungeon_1_fence_straight_modular', x, -35*s, 4);
    }
    // Graveyard in back
    for (let i = 0; i < 8; i++) {
      c += this._place('modular_dungeon_pack_column_broken', -20+i*5, -25, 3);
    }
    // Bats & spiders
    c += this._place('easy_enemies_pack_spider', 20, 15, 0.8);
    c += this._place('easy_enemies_pack_spider', -20, -20, 0.8);
    // Skeletons in garden
    c += this._place('recursive_skeletons', 15, 25, 3);
    c += this._place('recursive_skeletons', -15, -20, 3);
    return ['✓ Haunted mansion — ' + c + ' objects (gothic mansion, dead garden, cobwebs, graveyard, iron fences, skeletons)'];
  }

  _crypt(s) {
    let c = 0;
    // Underground dungeon layout
    // Walls forming corridors
    for (let z = -30; z <= 30; z += 4) {
      c += this._place('modular_dungeon_pack_modularstonewall', -15, z, 5);
      c += this._place('modular_dungeon_pack_modularstonewall', 15, z, 5);
    }
    for (let x = -15; x <= 15; x += 4) {
      c += this._place('modular_dungeon_pack_modularstonewall', x, -30, 5);
    }
    // Floor
    for (let x = -12; x <= 12; x += 4) {
      for (let z = -28; z <= 28; z += 4) {
        // floor removed for clean ground
      }
    }
    // Entrance
    c += this._place('modular_dungeon_pack_entrance', 0, 30, 7);
    // Columns
    c += this._place('modular_dungeon_1_column', -8, -10, 6);
    c += this._place('modular_dungeon_1_column', 8, -10, 6);
    c += this._place('modular_dungeon_1_column2', -8, 10, 6);
    c += this._place('modular_dungeon_1_column2', 8, 10, 6);
    // Treasures
    c += this._place('modular_dungeon_1_chest_gold', 0, -25, 5);
    c += this._place('modular_dungeon_1_bag_coins', -5, -22, 3);
    c += this._place('modular_dungeon_1_coin_pile', 5, -22, 3);
    // Torches on walls
    for (let z = -25; z <= 25; z += 10) {
      c += this._place('modular_dungeon_pack_torch_wall', -13, z, 3);
      c += this._place('modular_dungeon_pack_torch_wall', 13, z, 3);
    }
    // Traps
    c += this._place('modular_dungeon_1_trap_spikes', 0, 0, 4);
    c += this._place('modular_dungeon_1_spikes', -5, 5, 3);
    // Skulls & bones
    c += this._place('modular_dungeon_1_skull', -10, -15, 2);
    c += this._place('modular_dungeon_pack_bones', 10, 15, 3);
    c += this._place('modular_dungeon_pack_bones2', -10, 20, 3);
    // Potions
    c += this._place('modular_dungeon_pack_potion', 3, -20, 2);
    c += this._place('modular_dungeon_pack_potion3', -3, -20, 2);
    // Cobwebs
    c += this._place('modular_dungeon_1_cobweb', 12, -5, 4);
    c += this._place('modular_dungeon_1_cobweb2', -12, 5, 4);
    return ['✓ Crypt dungeon — ' + c + ' objects (stone corridors, columns, treasure, traps, torches, bones, potions)'];
  }

  _darkCathedral(s) {
    let c = 0;
    // Main cathedral (tall building)
    c += this._place('buildings_pack_3_6story_stack_mat', 0, 0, 12);
    // Bell towers
    c += this._place('medieval_village_pack_bell_tower', -20, 0, 10);
    c += this._place('medieval_village_pack_bell_tower', 20, 0, 10);
    // Columns along nave
    for (let z = -25; z <= 25; z += 8) {
      c += this._place('modular_dungeon_pack_column', -10, z, 7);
      c += this._place('modular_dungeon_pack_column', 10, z, 7);
    }
    // Candelabras
    for (let z = -20; z <= 20; z += 10) {
      c += this._place('modular_dungeon_pack_candelabrum_tall', -8, z, 5);
      c += this._place('modular_dungeon_pack_candelabrum_tall', 8, z, 5);
    }
    // Carpet
    c += this._place('modular_dungeon_pack_carpet', 0, 0, 8);
    // Banners
    c += this._place('modular_dungeon_1_banner_wall', -10, 0, 5);
    c += this._place('modular_dungeon_1_banner_wall', 10, 0, 5);
    // Dead trees around exterior
    c += this._ring('nature_pack_commontree_dead_2', 0, 0, 40*s, 10, 5);
    // Graveyard beside
    for (let i = 0; i < 6; i++) {
      c += this._place('modular_dungeon_pack_column_broken2', -35+i*5, -15, 3);
    }
    // Skeletons
    c += this._place('recursive_skeletons', -25, 10, 3);
    c += this._place('recursive_skeletons', 25, -10, 3);
    return ['✓ Dark cathedral — ' + c + ' objects (gothic cathedral, bell towers, columns, candelabras, graveyard, dead trees)'];
  }

  _boneYard(s) {
    let c = 0;
    // Massive bone field
    for (let i = 0; i < 30; i++) {
      c += this._place(i%3===0 ? 'modular_dungeon_1_skull' : i%3===1 ? 'modular_dungeon_pack_bones' : 'modular_dungeon_pack_bones2', 
        (Math.random()-0.5)*80*s, (Math.random()-0.5)*80*s, 2+Math.random()*3);
    }
    // Skeleton warriors
    for (let i = 0; i < 8; i++) {
      c += this._place('recursive_skeletons', (Math.random()-0.5)*60*s, (Math.random()-0.5)*60*s, 4);
    }
    // Dead trees
    c += this._ring('nature_pack_commontree_dead_5', 0, 0, 50*s, 10, 5);
    // Broken columns (ruins)
    for (let i = 0; i < 6; i++) {
      c += this._place('modular_dungeon_pack_column_broken', (Math.random()-0.5)*50*s, (Math.random()-0.5)*50*s, 5);
    }
    // Dark entrance
    c += this._place('modular_dungeon_pack_entrance', 0, 0, 8);
    // Spikes
    for (let i = 0; i < 5; i++) {
      c += this._place('modular_dungeon_1_spikes', (Math.random()-0.5)*40*s, (Math.random()-0.5)*40*s, 4);
    }
    return ['✓ Bone yard — ' + c + ' objects (skulls, bones, skeleton warriors, dead trees, ancient ruins, spike traps)'];
  }

  // === DUNGEON ===
  _dungeon(s) {
    let c = 0;
    // Full dungeon layout with rooms
    const wallM = 'modular_dungeon_pack_modularstonewall';
    const floorM = 'modular_dungeon_pack_modularfloor';
    // Main hall
    for (let z = -40; z <= 40; z += 4) {
      c += this._place(wallM, -20, z, 5);
      c += this._place(wallM, 20, z, 5);
    }
    // Cross corridors
    for (let x = -20; x <= 20; x += 4) {
      c += this._place(wallM, x, -40, 5);
      c += this._place(wallM, x, 40, 5);
    }
    // Side rooms
    for (let z = -15; z <= -5; z += 4) {
      c += this._place(wallM, -35, z, 5);
      c += this._place(wallM, 35, z, 5);
    }
    for (let x = -35; x <= -20; x += 4) c += this._place(wallM, x, -15, 5);
    for (let x = -35; x <= -20; x += 4) c += this._place(wallM, x, -5, 5);
    for (let x = 20; x <= 35; x += 4) c += this._place(wallM, x, -15, 5);
    for (let x = 20; x <= 35; x += 4) c += this._place(wallM, x, -5, 5);
    // Entrance
    c += this._place('modular_dungeon_pack_entrance', 0, 40, 8);
    // Boss room entrance
    c += this._place('modular_dungeon_pack_entrance2', 0, -40, 8);
    // Columns
    for (let z = -30; z <= 30; z += 12) {
      c += this._place('modular_dungeon_1_column', -15, z, 6);
      c += this._place('modular_dungeon_1_column2', 15, z, 6);
    }
    // Torches
    for (let z = -35; z <= 35; z += 8) {
      c += this._place('modular_dungeon_pack_torch_wall', -18, z, 3);
      c += this._place('modular_dungeon_pack_torch_wall', 18, z, 3);
    }
    // Treasure room (back)
    c += this._place('modular_dungeon_1_chest_gold', 0, -35, 5);
    c += this._place('modular_dungeon_1_bag_coins', -3, -33, 3);
    c += this._place('modular_dungeon_1_coin_pile', 3, -33, 3);
    // Traps
    c += this._place('modular_dungeon_1_trap_spikes', -5, 0, 4);
    c += this._place('modular_dungeon_1_trap_spikes', 5, 15, 4);
    c += this._place('modular_dungeon_1_trapdoor', 0, -10, 4);
    // Side room treasures
    c += this._place('modular_dungeon_pack_chest', -28, -10, 5);
    c += this._place('modular_dungeon_pack_chest_gold', 28, -10, 5);
    // Decorations
    c += this._place('modular_dungeon_pack_candelabrum_tall', 0, 20, 5);
    c += this._place('modular_dungeon_1_banner', -15, -20, 4);
    c += this._place('modular_dungeon_1_banner', 15, -20, 4);
    c += this._place('modular_dungeon_1_vase', -10, 25, 3);
    c += this._place('modular_dungeon_1_barrel', 10, 25, 3);
    // Enemies
    c += this._place('recursive_skeletons', 5, -20, 4);
    c += this._place('recursive_skeletons', -5, 10, 4);
    c += this._place('easy_enemies_pack_rat', 12, -5, 0.8);
    c += this._place('easy_enemies_pack_spider', -12, 5, 0.8);
    c += this._place('easy_enemies_pack_snake', 0, -25, 0.8);
    // Potions & books
    c += this._place('modular_dungeon_pack_potion', -28, -8, 2);
    c += this._place('modular_dungeon_pack_potion4', 28, -8, 2);
    c += this._place('modular_dungeon_pack_book_open', -10, -30, 2);
    return ['✓ Dungeon crawler — ' + c + ' objects (stone halls, side rooms, traps, treasure, skeletons, spiders, potions)'];
  }

  // === JUNGLE ===
  _jungleRuins(s) {
    let c = 0;
    // Dense tropical trees
    const tropicalTrees = ['nature_pack_palmtree_1','nature_pack_palmtree_2','nature_pack_palmtree_3','nature_pack_palmtree_4','nature_pack_palmtree_5'];
    for (let i = 0; i < 30*s; i++) {
      c += this._place(tropicalTrees[i%tropicalTrees.length], (Math.random()-0.5)*120*s, (Math.random()-0.5)*120*s, 5+Math.random()*4);
    }
    // Regular trees mixed in
    for (let i = 0; i < 15*s; i++) {
      c += this._place('nature_pack_commontree_'+(1+i%5), (Math.random()-0.5)*100*s, (Math.random()-0.5)*100*s, 5+Math.random()*3);
    }
    // Ancient ruins — broken columns
    for (let i = 0; i < 10; i++) {
      c += this._place(i%2 ? 'modular_dungeon_pack_column_broken' : 'modular_dungeon_pack_column_broken2', (Math.random()-0.5)*50*s, (Math.random()-0.5)*50*s, 5+Math.random()*2);
    }
    // Temple entrance
    c += this._place('modular_dungeon_pack_entrance', 0, 0, 9);
    c += this._place('modular_dungeon_pack_column', -8, 5, 7);
    c += this._place('modular_dungeon_pack_column', 8, 5, 7);
    // Treasure
    c += this._place('modular_dungeon_1_chest_gold', 0, -5, 5);
    c += this._place('rpg_items_pack_crown', 0, -8, 3);
    // Bushes & undergrowth
    for (let i = 0; i < 15; i++) {
      c += this._place('nature_pack_bush_'+(1+i%2), (Math.random()-0.5)*90*s, (Math.random()-0.5)*90*s, 3+Math.random()*2);
    }
    // Bamboo
    for (let i = 0; i < 8; i++) {
      c += this._place('crops_pack_bamboo', (Math.random()-0.5)*40, (Math.random()-0.5)*40, 5);
    }
    // Snakes & frogs
    c += this._place('easy_enemies_pack_snake', 10, 15, 0.8);
    c += this._place('easy_enemies_pack_snake_angry', -10, -15, 0.8);
    c += this._place('easy_enemies_pack_frog', 20, -5, 0.8);
    // Mossy rocks
    for (let i = 0; i < 8; i++) {
      c += this._place('nature_pack_rock_moss_'+(1+i%7), (Math.random()-0.5)*70*s, (Math.random()-0.5)*70*s, 4+Math.random()*3);
    }
    // Dinosaurs!
    c += this._place('dinosaurs_pack_velociraptor', 30, 30, 5);
    c += this._place('dinosaurs_pack_triceratops', -40, -20, 6);
    return ['✓ Jungle ruins — ' + c + ' objects (tropical jungle, ancient temple, broken columns, treasure, snakes, dinosaurs)'];
  }

  _jungleTemple(s) {
    let c = 0;
    // Stepped pyramid (stacked platforms)
    for (let level = 0; level < 5; level++) {
      const size = 20 - level * 3;
      for (let x = -size; x <= size; x += 4) {
        // floor removed for clean ground
        // floor removed for clean ground
      }
    }
    // Temple top
    c += this._place('modular_dungeon_pack_entrance', 0, 0, 8);
    c += this._place('modular_dungeon_1_chest_gold', 0, -3, 4);
    // Columns at base
    for (let i = 0; i < 8; i++) {
      const a = (i/8) * Math.PI * 2;
      c += this._place('modular_dungeon_pack_column', Math.cos(a)*22, Math.sin(a)*22, 7);
    }
    // Surrounding jungle
    const palms = ['nature_pack_palmtree_1','nature_pack_palmtree_2','nature_pack_palmtree_3'];
    c += this._ring(palms[0], 0, 0, 50*s, 20, 6);
    c += this._ring('nature_pack_commontree_1', 0, 0, 55*s, 12, 5);
    // Undergrowth
    for (let i = 0; i < 15; i++) {
      c += this._place('nature_pack_bush_'+(1+i%2), (Math.random()-0.5)*80*s, (Math.random()-0.5)*80*s, 3);
    }
    // Torches leading up
    for (let z = 25; z >= -25; z -= 8) {
      c += this._place('modular_dungeon_1_torch', -12, z, 4);
      c += this._place('modular_dungeon_1_torch', 12, z, 4);
    }
    // Guardian statues
    c += this._place('modular_dungeon_1_statue_horse', -15, 20, 6);
    c += this._place('modular_dungeon_1_statue_horse', 15, 20, 6);
    return ['✓ Jungle temple — ' + c + ' objects (stepped pyramid, columns, treasure, torches, jungle canopy, guardian statues)'];
  }

  // === DINOSAUR VALLEY ===
  _dinosaurValley(s) {
    let c = 0;
    // All dinosaurs
    c += this._place('dinosaurs_pack_trex', 0, 0, 8);
    c += this._place('dinosaurs_pack_triceratops', -30, 20, 7);
    c += this._place('dinosaurs_pack_stegosaurus', 30, -20, 7);
    c += this._place('dinosaurs_pack_velociraptor', -15, -30, 5);
    c += this._place('dinosaurs_pack_velociraptor', -10, -35, 5);
    c += this._place('dinosaurs_pack_velociraptor', -20, -32, 5);
    c += this._place('dinosaurs_pack_apatosaurus', 40, 40, 10);
    c += this._place('dinosaurs_pack_parasaurolophus', -40, -40, 7);
    // Lush prehistoric vegetation
    const trees = ['nature_pack_commontree_1','nature_pack_commontree_2','nature_pack_commontree_3','nature_pack_commontree_4','nature_pack_commontree_5'];
    for (let i = 0; i < 25*s; i++) {
      c += this._place(trees[i%5], (Math.random()-0.5)*120*s, (Math.random()-0.5)*120*s, 6+Math.random()*4);
    }
    // Palm trees
    for (let i = 0; i < 10; i++) {
      c += this._place('nature_pack_palmtree_'+(1+i%5), (Math.random()-0.5)*100*s, (Math.random()-0.5)*100*s, 5+Math.random()*3);
    }
    // Giant ferns/bushes
    for (let i = 0; i < 15; i++) {
      c += this._place('nature_pack_bush_'+(1+i%2), (Math.random()-0.5)*100*s, (Math.random()-0.5)*100*s, 4+Math.random()*3);
    }
    // Rocks (boulders)
    for (let i = 0; i < 10; i++) {
      c += this._place('nature_pack_rock_moss_'+(1+i%7), (Math.random()-0.5)*90*s, (Math.random()-0.5)*90*s, 5+Math.random()*5);
    }
    // Mushrooms
    for (let i = 0; i < 8; i++) {
      c += this._place('crops_pack_mushroom', (Math.random()-0.5)*60*s, (Math.random()-0.5)*60*s, 4);
    }
    // Water features (plants near "water")
    c += this._place('nature_pack_lilypad', 25, 25, 5);
    // Eggs/nests
    c += this._place('rpg_items_pack_mineral', -5, 5, 4);
    return ['✓ Dinosaur valley — ' + c + ' objects (T-Rex, triceratops, raptors, apatosaurus, prehistoric jungle, giant ferns)'];
  }

  // === UNDERWATER RUINS ===
  _underwaterRuins(s) {
    let c = 0;
    // Ancient broken columns & structures
    for (let i = 0; i < 12; i++) {
      c += this._place(i%2 ? 'modular_dungeon_pack_column_broken' : 'modular_dungeon_pack_column_broken2', (Math.random()-0.5)*80*s, (Math.random()-0.5)*80*s, 5+Math.random()*3);
    }
    // Standing columns (partial temple)
    for (let i = 0; i < 6; i++) {
      const a = (i/6)*Math.PI*2;
      c += this._place('modular_dungeon_pack_column', Math.cos(a)*20, Math.sin(a)*20, 7);
    }
    // Treasure
    c += this._place('modular_dungeon_1_chest_gold', 0, 0, 5);
    c += this._place('rpg_items_pack_crown', 0, -3, 3);
    c += this._place('modular_dungeon_1_coin_pile', 3, 2, 3);
    // Fish everywhere
    const fish = ['cute_fish_pack_clownfish','cute_fish_pack_bluetang','cute_fish_pack_butterflyfish','cute_fish_pack_lionfish','cute_fish_pack_mandarinfish','cute_fish_pack_puffer','cute_fish_pack_koi','cute_fish_pack_goldfish','cute_fish_pack_piranha','cute_fish_pack_angelfish'];
    for (let i = 0; i < 20; i++) {
      c += this._place(fish[i%fish.length], (Math.random()-0.5)*70*s, (Math.random()-0.5)*70*s, 3+Math.random()*2);
    }
    // Big fish
    c += this._place('fish_pack_shark', 40, 0, 7);
    c += this._place('fish_pack_whale', -50, -30, 10);
    c += this._place('fish_pack_manta_ray', 30, 30, 6);
    c += this._place('fish_pack_dolphin', -20, 40, 5);
    // Coral / plants (using nature plants)
    for (let i = 0; i < 15; i++) {
      c += this._place('nature_pack_plant_'+(1+i%5), (Math.random()-0.5)*80*s, (Math.random()-0.5)*80*s, 4+Math.random()*3);
    }
    // Rocks
    for (let i = 0; i < 10; i++) {
      c += this._place('nature_pack_rock_moss_'+(1+i%7), (Math.random()-0.5)*70*s, (Math.random()-0.5)*70*s, 4+Math.random()*4);
    }
    // Shipwreck
    c += this._place('ships_pack_sail_ship', 35, -25, 8);
    // Crystals (representing coral formations)
    for (let i = 0; i < 8; i++) {
      c += this._place('rpg_items_pack_crystal'+(1+i%5), (Math.random()-0.5)*50*s, (Math.random()-0.5)*50*s, 4+Math.random()*3);
    }
    return ['✓ Underwater ruins — ' + c + ' objects (sunken temple, treasure, sharks, whales, tropical fish, shipwreck, coral)'];
  }

  _shipwreckCove(s) {
    let c = 0;
    // Multiple shipwrecks
    c += this._place('ships_pack_sail_ship', 0, 0, 8);
    c += this._place('ships_pack_viking_boat', -30, 20, 7);
    c += this._place('ships_pack_boatwsail', 25, -25, 6);
    c += this._place('ships_pack_lifeboat', 10, 15, 4);
    c += this._place('cute_fish_pack_boat', -15, -15, 5);
    // Rocky shore
    for (let i = 0; i < 15; i++) {
      c += this._place('nature_pack_rock_'+(1+i%7), (Math.random()-0.5)*80*s, (Math.random()-0.5)*80*s, 5+Math.random()*5);
    }
    // Palm trees (tropical cove)
    c += this._ring('nature_pack_palmtree_1', 0, 0, 50*s, 10, 5);
    // Treasure scattered on beach
    c += this._place('modular_dungeon_1_chest_gold', 5, -5, 5);
    c += this._place('rpg_items_pack_chest_open', -5, 8, 4);
    c += this._place('modular_dungeon_1_coin_pile', 8, -3, 3);
    c += this._place('rpg_items_pack_gold_ingots', -8, 5, 3);
    // Skeletons (drowned sailors)
    for (let i = 0; i < 4; i++) {
      c += this._place('recursive_skeletons', (Math.random()-0.5)*40*s, (Math.random()-0.5)*40*s, 3);
    }
    // Dock
    c += this._place('cute_fish_pack_dock_long', 0, 25, 6);
    c += this._place('cute_fish_pack_dock_stairs', 5, 25, 5);
    // Fish in water
    for (let i = 0; i < 8; i++) {
      c += this._place('cute_fish_pack_clownfish', (Math.random()-0.5)*60*s, 30+(Math.random()*20), 3);
    }
    return ['✓ Shipwreck cove — ' + c + ' objects (wrecked ships, rocky shore, treasure, docks, skeletons, tropical palms)'];
  }

  // === MODERN CITY ===
  _modernCity(s) {
    let c = 0;
    // City grid with modern buildings
    const bldgs = ['buildings_pack_3_4story_mat','buildings_pack_3_4story_wide_2doors_mat','buildings_pack_3_6story_stack_mat','buildings_pack_3_3story_balcony_mat','buildings_pack_3_3story_slim_mat','buildings_pack_3_2story_double_mat','buildings_pack_3_2story_wide_2doors_mat','buildings_pack_3_4story_center_mat'];
    // 5x5 city grid
    for (let row = -2; row <= 2; row++) {
      for (let col = -2; col <= 2; col++) {
        if (Math.abs(row) <= 0 && Math.abs(col) <= 0) continue; // center is plaza
        c += this._place(bldgs[Math.floor(Math.random()*bldgs.length)], col * 30 * s, row * 30 * s, 8+Math.random()*4);
      }
    }
    // Streets
    for (let i = -75*s; i <= 75*s; i += 8) {
      c += this._place('street_pack_street_straight', i, 0, 5);
      c += this._place('street_pack_street_straight', 0, i, 5);
    }
    // Intersections
    c += this._place('street_pack_street_4way', 0, 0, 5);
    // Traffic lights
    for (let i = -2; i <= 2; i++) {
      c += this._place('street_pack_trafficlight', i*30*s, 10, 5);
    }
    // Street lights
    for (let i = -60*s; i <= 60*s; i += 15) {
      c += this._place('street_pack_streetlight_double', i, 5, 5);
      c += this._place('street_pack_streetlight_double', 5, i, 5);
    }
    // Cars
    for (let i = 0; i < 10; i++) {
      c += this._place('car', (Math.random()-0.5)*80*s, (Math.random()-0.5)*80*s, 4);
    }
    c += this._place('truck', 20, -30, 5);
    c += this._place('milk_truck', -25, 40, 5);
    // Trees along sidewalks
    for (let i = -60*s; i <= 60*s; i += 20) {
      c += this._place('nature_pack_commontree_1', i, 12, 4);
      c += this._place('nature_pack_commontree_2', 12, i, 4);
    }
    // Signs
    c += this._place('street_pack_sign_stop', 20, 8, 4);
    c += this._place('street_pack_sign_noparking', -20, 8, 4);
    // People
    c += this._place('modular_men_casual', 5, 5, 4);
    c += this._place('modular_women_casual', -5, 5, 4);
    c += this._place('modular_men_suit', 10, -5, 4);
    c += this._place('modular_women_formal', -10, -5, 4);
    return ['✓ Modern city — ' + c + ' objects (skyscrapers, streets, traffic lights, cars, pedestrians, trees)'];
  }

  _neonAlley(s) {
    let c = 0;
    // Narrow cyberpunk alley — buildings on both sides
    for (let z = -40*s; z <= 40*s; z += 12) {
      c += this._place('buildings_pack_3_4story_mat', -15, z, 9);
      c += this._place('buildings_pack_3_3story_slim_mat', 15, z, 9);
    }
    // Neon signs
    for (let z = -35*s; z <= 35*s; z += 8) {
      const signs = ['cyberpunk_pack_sign_1','cyberpunk_pack_sign_2','cyberpunk_pack_sign_3','cyberpunk_pack_sign_4'];
      c += this._place(signs[Math.floor(Math.random()*4)], -12, z, 4);
      c += this._place(signs[Math.floor(Math.random()*4)], 12, z, 4);
    }
    // Pipes & cables
    for (let z = -30; z <= 30; z += 15) {
      c += this._place('cyberpunk_pack_pipe_1', -13, z, 4);
      c += this._place('cyberpunk_pack_cable_long', 13, z, 4);
    }
    // Street lights
    for (let z = -35*s; z <= 35*s; z += 12) {
      c += this._place('cyberpunk_pack_light_street_1', -8, z, 5);
      c += this._place('cyberpunk_pack_light_street_2', 8, z, 5);
    }
    // Loot boxes & pickups
    c += this._place('cyberpunk_pack_lootbox', 0, 0, 3);
    c += this._place('cyberpunk_pack_pickup_health', 3, 10, 2);
    c += this._place('cyberpunk_pack_pickup_heart', -3, -10, 2);
    // AC units
    c += this._place('cyberpunk_pack_ac_stacked', -13, 0, 4);
    c += this._place('cyberpunk_pack_ac_side', 13, 5, 3);
    // Enemies lurking
    c += this._place('cyberpunk_pack_enemy_2legs', 5, -20, 4);
    c += this._place('cyberpunk_pack_enemy_flying', -5, 20, 4);
    c += this._place('cyberpunk_pack_character', 0, 15, 4);
    // Fences blocking
    c += this._place('cyberpunk_pack_fence', 0, 42*s, 5);
    c += this._place('cyberpunk_pack_fence', 0, -42*s, 5);
    // Computer terminal
    c += this._place('cyberpunk_pack_computer', -5, 0, 3);
    return ['✓ Neon alley — ' + c + ' objects (towering buildings, neon signs, pipes, street lights, enemies, loot)'];
  }

  // === ARENA / COLOSSEUM ===
  _arena(s) {
    let c = 0;
    // Circular arena walls
    const radius = 35 * s;
    const wallCount = Math.floor(24 * s);
    for (let i = 0; i < wallCount; i++) {
      const a = (i / wallCount) * Math.PI * 2;
      c += this._place('modular_medieval_buildings_pack_tallwall', Math.cos(a)*radius, Math.sin(a)*radius, 7);
    }
    // Tower corners (4 towers)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      c += this._place('modular_medieval_buildings_pack_watchtowerwroof', Math.cos(a)*radius, Math.sin(a)*radius, 8);
    }
    // Central fighting pit
    // floor removed for clean ground
    // Weapon racks around edge
    const weapons = ['medieval_weapons_pack_sword','medieval_weapons_pack_axe','medieval_weapons_pack_spear','medieval_weapons_pack_hammer_double','medieval_weapons_pack_shield_round'];
    for (let i = 0; i < 8; i++) {
      const a = (i/8)*Math.PI*2;
      c += this._place(weapons[i%weapons.length], Math.cos(a)*15, Math.sin(a)*15, 3);
    }
    // Knight combatants
    c += this._place('single_knight_pack_knightcharacter', -5, 0, 5);
    c += this._place('single_knight_pack_knightcharacter', 5, 0, 5);
    // Banners
    for (let i = 0; i < 6; i++) {
      const a = (i/6)*Math.PI*2;
      c += this._place('modular_medieval_buildings_pack_banner', Math.cos(a)*(radius-5), Math.sin(a)*(radius-5), 5);
    }
    // Torches
    for (let i = 0; i < 8; i++) {
      const a = (i/8)*Math.PI*2;
      c += this._place('modular_dungeon_1_torch', Math.cos(a)*25, Math.sin(a)*25, 4);
    }
    // Audience (modular characters)
    const audience = ['modular_men_casual','modular_men_farmer','modular_women_medieval','modular_men_king','modular_women_adventurer'];
    for (let i = 0; i < 10; i++) {
      const a = (i/10)*Math.PI*2;
      c += this._place(audience[i%audience.length], Math.cos(a)*(radius-3), Math.sin(a)*(radius-3), 4);
    }
    return ['✓ Arena — ' + c + ' objects (colosseum walls, towers, weapon racks, knights, banners, torches, audience)'];
  }

  // === PLATFORMER WORLD ===
  _platformerWorld(s) {
    let c = 0;
    // Floating platforms at various heights
    const platforms = ['platformer_game_pack_cube_grass_single','platformer_game_pack_cube_bricks','platformer_game_pack_cube_crate','platformer_game_pack_cube_dirt_single'];
    // Ground level platforms
    for (let x = -40; x <= 40; x += 6) {
      c += this._place(platforms[0], x, 0, 5);
    }
    // Gaps and elevated platforms
    for (let x = -30; x <= 30; x += 12) {
      c += this._place(platforms[1], x, -15, 5);
      c += this._place(platforms[2], x+6, -25, 5);
    }
    // Coins
    for (let i = 0; i < 15; i++) {
      c += this._place('platformer_game_pack_coin', (Math.random()-0.5)*60, (Math.random()-0.5)*40, 3);
    }
    // Gems
    c += this._place('platformer_game_pack_gem_blue', 20, -10, 3);
    c += this._place('platformer_game_pack_gem_green', -20, -20, 3);
    c += this._place('platformer_game_pack_gem_pink', 0, -30, 3);
    // Enemies
    c += this._place('platformer_game_pack_enemy', 10, -5, 4);
    c += this._place('platformer_game_pack_bee', -15, -12, 3);
    c += this._place('platformer_game_pack_crab', 25, 5, 4);
    // Character
    c += this._place('platformer_game_pack_character', 0, 5, 4);
    // Hazards
    c += this._place('platformer_game_pack_hazard_saw', 15, -20, 4);
    c += this._place('platformer_game_pack_hazard_spiketrap', -10, -15, 3);
    c += this._place('platformer_game_pack_cube_spikes', 5, -25, 4);
    // Bouncer
    c += this._place('platformer_game_pack_bouncer', 0, -10, 4);
    // Cannon
    c += this._place('platformer_game_pack_cannon', 30, 0, 5);
    // Goal flag
    c += this._place('platformer_game_pack_goal_flag', 35, -30, 5);
    // Chest
    c += this._place('platformer_game_pack_chest', -30, -25, 4);
    // Key
    c += this._place('platformer_game_pack_key', -25, -10, 3);
    // Clouds (decorative)
    c += this._place('platformer_game_pack_cloud_1', -20, -35, 6);
    c += this._place('platformer_game_pack_cloud_2', 15, -40, 5);
    c += this._place('platformer_game_pack_cloud_3', 0, -45, 7);
    // Plants
    c += this._place('platformer_game_pack_plant_large', -15, 3, 4);
    c += this._place('platformer_game_pack_plant_small', 20, 3, 3);
    c += this._place('platformer_game_pack_bush', 10, 3, 3);
    // Bridge
    c += this._place('platformer_game_pack_bridge_modular', -5, -18, 5);
    c += this._place('platformer_game_pack_bridge_modular_center', 0, -18, 5);
    c += this._place('platformer_game_pack_bridge_small', 5, -18, 5);
    return ['✓ Platformer world — ' + c + ' objects (platforms, coins, gems, enemies, hazards, bouncer, cannon, goal flag)'];
  }

  // === RACE TRACK ===
  _raceTrack(s) {
    let c = 0;
    // Oval track using street pieces
    const trackRadius = 50 * s;
    // Straight sections
    for (let x = -30*s; x <= 30*s; x += 8) {
      c += this._place('street_pack_street_straight', x, trackRadius * 0.5, 5);
      c += this._place('street_pack_street_straight', x, -trackRadius * 0.5, 5);
    }
    // Curves at ends
    c += this._place('street_pack_street_curve', 30*s, trackRadius*0.4, 5);
    c += this._place('street_pack_street_curve', 30*s, -trackRadius*0.4, 5);
    c += this._place('street_pack_street_curve', -30*s, trackRadius*0.4, 5);
    c += this._place('street_pack_street_curve', -30*s, -trackRadius*0.4, 5);
    // Cars on track
    for (let i = 0; i < 6; i++) {
      const a = (i/6)*Math.PI*2;
      c += this._place('car', Math.cos(a)*30*s, Math.sin(a)*20*s, 4);
    }
    // Spectator stands (buildings as bleachers)
    c += this._place('buildings_pack_3_2story_wide_mat', 0, trackRadius*0.8, 7);
    c += this._place('buildings_pack_3_2story_wide_mat', 0, -trackRadius*0.8, 7);
    // Traffic cones (using barrels)
    for (let x = -25*s; x <= 25*s; x += 10) {
      c += this._place('medieval_village_pack_barrel', x, trackRadius*0.5+5, 2);
      c += this._place('medieval_village_pack_barrel', x, -trackRadius*0.5-5, 2);
    }
    // Start/finish
    c += this._place('street_pack_trafficlight', 0, trackRadius*0.5-5, 6);
    // Street lights around track
    for (let i = 0; i < 8; i++) {
      const a = (i/8)*Math.PI*2;
      c += this._place('street_pack_streetlight_triple', Math.cos(a)*40*s, Math.sin(a)*30*s, 6);
    }
    // Trees outside track
    c += this._ring('nature_pack_commontree_1', 0, 0, 55*s, 15, 4);
    // Truck & special vehicles
    c += this._place('truck', -20*s, 0, 5);
    c += this._place('tank_pack_tank3', 20*s, 0, 5); // hidden easter egg!
    return ['✓ Race track — ' + c + ' objects (oval circuit, 6 cars, spectator stands, traffic lights, barriers, trees)'];
  }

  // === ENCHANTED FOREST ===
  _enchantedForest(s) {
    let c = 0;
    // Dense magical forest
    const trees = ['nature_pack_commontree_1','nature_pack_commontree_2','nature_pack_commontree_3','nature_pack_commontree_4','nature_pack_commontree_5','nature_pack_birchtree_1','nature_pack_birchtree_2','nature_pack_birchtree_3'];
    for (let i = 0; i < 35*s; i++) {
      c += this._place(trees[i%trees.length], (Math.random()-0.5)*120*s, (Math.random()-0.5)*120*s, 5+Math.random()*5);
    }
    // Mushrooms (magical, large)
    for (let i = 0; i < 12; i++) {
      c += this._place('crops_pack_mushroom', (Math.random()-0.5)*80*s, (Math.random()-0.5)*80*s, 4+Math.random()*4);
    }
    // Glowing crystals
    for (let i = 0; i < 10; i++) {
      c += this._place('rpg_items_pack_crystal'+(1+i%5), (Math.random()-0.5)*60*s, (Math.random()-0.5)*60*s, 3+Math.random()*3);
    }
    // Flower patches
    for (let i = 0; i < 10; i++) {
      c += this._place('crops_pack_flower', (Math.random()-0.5)*70*s, (Math.random()-0.5)*70*s, 3);
    }
    // Fairy ring (mushroom circle)
    for (let i = 0; i < 8; i++) {
      const a = (i/8)*Math.PI*2;
      c += this._place('crops_pack_mushroom', Math.cos(a)*10, Math.sin(a)*10, 5);
    }
    // Mossy rocks
    for (let i = 0; i < 8; i++) {
      c += this._place('nature_pack_rock_moss_'+(1+i%7), (Math.random()-0.5)*70*s, (Math.random()-0.5)*70*s, 4+Math.random()*3);
    }
    // Bush undergrowth
    for (let i = 0; i < 15; i++) {
      c += this._place(i%3===0 ? 'nature_pack_bushberries_1' : 'nature_pack_bush_'+(1+i%2), (Math.random()-0.5)*80*s, (Math.random()-0.5)*80*s, 3+Math.random()*2);
    }
    // Animals
    c += this._place('animals_pack_deer', 20, 15, 2);
    c += this._place('animals_pack_fox', -15, 20, 1.5);
    c += this._place('animals_pack_stag', 30, -25, 2);
    c += this._place('easy_enemies_pack_frog', -5, 10, 0.8);
    c += this._place('parrot', 0, -15, 1);
    // Treasure hidden in forest
    c += this._place('rpg_items_pack_chest_closed', 25, -30, 4);
    c += this._place('rpg_items_pack_potion3_filled', 26, -28, 2);
    return ['✓ Enchanted forest — ' + c + ' objects (magical trees, giant mushrooms, crystals, fairy ring, woodland creatures, hidden treasure)'];
  }

  _darkForest(s) {
    let c = 0;
    // Dense dead/dark trees
    const deadTrees = ['nature_pack_commontree_dead_1','nature_pack_commontree_dead_2','nature_pack_commontree_dead_3','nature_pack_commontree_dead_4','nature_pack_commontree_dead_5','nature_pack_birchtree_dead_1','nature_pack_birchtree_dead_2','nature_pack_birchtree_dead_3'];
    for (let i = 0; i < 30*s; i++) {
      c += this._place(deadTrees[i%deadTrees.length], (Math.random()-0.5)*120*s, (Math.random()-0.5)*120*s, 5+Math.random()*5);
    }
    // Some live trees mixed in (sparse)
    for (let i = 0; i < 5; i++) {
      c += this._place('nature_pack_commontree_'+(1+i), (Math.random()-0.5)*80*s, (Math.random()-0.5)*80*s, 6);
    }
    // Cobwebs between trees
    for (let i = 0; i < 8; i++) {
      c += this._place(i%2 ? 'modular_dungeon_1_cobweb' : 'modular_dungeon_1_cobweb2', (Math.random()-0.5)*60*s, (Math.random()-0.5)*60*s, 4);
    }
    // Spiders & snakes
    for (let i = 0; i < 5; i++) {
      c += this._place('easy_enemies_pack_spider', (Math.random()-0.5)*50*s, (Math.random()-0.5)*50*s, 0.8);
    }
    c += this._place('easy_enemies_pack_snake_angry', 10, -10, 0.8);
    c += this._place('easy_enemies_pack_snake', -15, 15, 0.8);
    // Wolves
    c += this._place('animals_pack_wolf', 25, 0, 1.5);
    c += this._place('animals_pack_wolf', 28, 3, 1.5);
    c += this._place('animals_pack_wolf', 22, -3, 1.5);
    // Rocks
    for (let i = 0; i < 8; i++) {
      c += this._place('nature_pack_rock_'+(1+i%7), (Math.random()-0.5)*80*s, (Math.random()-0.5)*80*s, 4+Math.random()*3);
    }
    // Abandoned camp
    c += this._place('survival_pack_tent', 0, 0, 5);
    c += this._place('survival_pack_bonfire', 3, 2, 3);
    c += this._place('modular_dungeon_pack_bones', -3, 3, 3);
    c += this._place('modular_dungeon_1_skull', 5, -2, 2);
    // Skeleton warning
    c += this._place('recursive_skeletons', -20, -20, 4);
    return ['✓ Dark forest — ' + c + ' objects (dead trees, cobwebs, spiders, wolves, abandoned camp, skeletons)'];
  }

  // === DESERT WASTELAND ===
  _desertWasteland(s) {
    let c = 0;
    // Cacti everywhere
    const cacti = ['nature_pack_cactus_1','nature_pack_cactus_2','nature_pack_cactus_3','nature_pack_cactus_4','nature_pack_cactus_5','nature_pack_cactusflower_1','nature_pack_cactusflowers_2'];
    for (let i = 0; i < 20*s; i++) {
      c += this._place(cacti[i%cacti.length], (Math.random()-0.5)*120*s, (Math.random()-0.5)*120*s, 4+Math.random()*3);
    }
    // Rocks & boulders
    for (let i = 0; i < 15; i++) {
      c += this._place('nature_pack_rock_'+(1+i%7), (Math.random()-0.5)*100*s, (Math.random()-0.5)*100*s, 5+Math.random()*6);
    }
    // Ruins
    for (let i = 0; i < 6; i++) {
      c += this._place('modular_dungeon_pack_column_broken', (Math.random()-0.5)*60*s, (Math.random()-0.5)*60*s, 5);
    }
    // Abandoned vehicles
    c += this._place('car', 20, -15, 4);
    c += this._place('tank_pack_tank4', -30, 25, 6);
    // Survival gear
    c += this._place('survival_pack_tent', 0, 0, 6);
    c += this._place('survival_pack_bonfire_fire', 5, 3, 3);
    c += this._place('survival_pack_gascan', -3, 5, 3);
    c += this._place('survival_pack_waterbottle_2', 2, -2, 2);
    // Skeletons (died in desert)
    for (let i = 0; i < 4; i++) {
      c += this._place('recursive_skeletons', (Math.random()-0.5)*80*s, (Math.random()-0.5)*80*s, 3);
      c += this._place('modular_dungeon_pack_bones', (Math.random()-0.5)*70*s, (Math.random()-0.5)*70*s, 2);
    }
    // Dead trees
    for (let i = 0; i < 6; i++) {
      c += this._place('nature_pack_commontree_dead_'+(1+i%5), (Math.random()-0.5)*100*s, (Math.random()-0.5)*100*s, 4);
    }
    // Scorpion / snake enemies
    c += this._place('easy_enemies_pack_snake', 15, 20, 0.8);
    c += this._place('easy_enemies_pack_snake_angry', -20, -15, 0.8);
    return ['✓ Desert wasteland — ' + c + ' objects (cacti, boulders, ruins, abandoned tank, survival camp, skeletons, snakes)'];
  }

  _oasis(s) {
    let c = 0;
    // Central water area (represented by lily pads)
    for (let i = 0; i < 8; i++) {
      c += this._place('nature_pack_lilypad', (Math.random()-0.5)*15, (Math.random()-0.5)*15, 4);
    }
    // Palm trees around oasis
    c += this._ring('nature_pack_palmtree_1', 0, 0, 15, 8, 6);
    c += this._ring('nature_pack_palmtree_3', 0, 0, 20, 6, 5);
    // Lush bushes near water
    for (let i = 0; i < 10; i++) {
      c += this._place('nature_pack_bush_'+(1+i%2), (Math.random()-0.5)*25, (Math.random()-0.5)*25, 3+Math.random()*2);
    }
    // Desert surroundings
    const cacti = ['nature_pack_cactus_1','nature_pack_cactus_2','nature_pack_cactus_3'];
    for (let i = 0; i < 15*s; i++) {
      c += this._place(cacti[i%3], (Math.random()-0.5)*100*s, (Math.random()-0.5)*100*s, 4+Math.random()*2);
    }
    // Rocks
    for (let i = 0; i < 10; i++) {
      c += this._place('nature_pack_rock_'+(1+i%7), (Math.random()-0.5)*80*s, (Math.random()-0.5)*80*s, 4+Math.random()*4);
    }
    // Camp
    c += this._place('survival_pack_tent', 20, 5, 6);
    c += this._place('survival_pack_bonfire_fire', 23, 8, 3);
    // Animals
    c += this._place('animals_pack_horse', -20, 10, 2);
    c += this._place('animals_pack_donkey', -25, 8, 2);
    c += this._place('flamingo', 5, -5, 1.5);
    // Treasure chest hidden
    c += this._place('rpg_items_pack_chest_closed', 8, -18, 4);
    return ['✓ Desert oasis — ' + c + ' objects (palm trees, lily pads, lush bushes, cacti, camp, animals, hidden treasure)'];
  }

  // === WAR ZONE / BATTLEFIELD ===
  _warZone(s) {
    let c = 0;
    // Tanks!
    c += this._place('tank_pack_tank', -20, 0, 7);
    c += this._place('tank_pack_tank2', 25, 15, 7);
    c += this._place('tank_pack_tank3', -30, -25, 6);
    c += this._place('tank_pack_tank4', 35, -20, 6);
    // Military vehicles
    c += this._place('truck', 0, 25, 6);
    c += this._place('truck', -15, 30, 5);
    c += this._place('car', 10, -30, 4);
    // Ruined buildings
    const ruins = ['buildings_pack_2_building1_small','buildings_pack_2_building2_small','buildings_pack_2_building3_small'];
    for (let i = 0; i < 6; i++) {
      c += this._place(ruins[i%3], (Math.random()-0.5)*80*s, (Math.random()-0.5)*80*s, 6);
    }
    // Barricades (wooden logs)
    for (let i = 0; i < 10; i++) {
      c += this._place('survival_pack_woodlog', (Math.random()-0.5)*60*s, (Math.random()-0.5)*60*s, 4);
    }
    // Bear traps / mines
    for (let i = 0; i < 5; i++) {
      c += this._place('survival_pack_beartrap_open', (Math.random()-0.5)*50*s, (Math.random()-0.5)*50*s, 3);
    }
    // Soldiers
    c += this._place('modular_men_swat', 5, 5, 4);
    c += this._place('modular_men_swat', -5, -5, 4);
    c += this._place('modular_women_soldier', 10, -10, 4);
    c += this._place('soldier', -10, 10, 5);
    // Weapons on ground
    c += this._place('modular_sci_fi_guns_pack_ar_1', 3, -2, 3);
    c += this._place('survival_pack_shotgun_1', -3, 2, 3);
    c += this._place('modular_sci_fi_guns_pack_grenade', 8, 0, 2);
    // Dead trees & craters (rocks)
    for (let i = 0; i < 8; i++) {
      c += this._place('nature_pack_commontree_dead_'+(1+i%5), (Math.random()-0.5)*70*s, (Math.random()-0.5)*70*s, 4);
    }
    for (let i = 0; i < 10; i++) {
      c += this._place('nature_pack_rock_'+(1+i%7), (Math.random()-0.5)*80*s, (Math.random()-0.5)*80*s, 3+Math.random()*3);
    }
    // Supply crates
    c += this._place('modular_dungeon_1_crate', 0, 0, 4);
    c += this._place('modular_dungeon_1_crate', 2, 2, 4);
    c += this._place('survival_pack_firstaidkit_hard', 0, 3, 2);
    return ['✓ War zone — ' + c + ' objects (4 tanks, military vehicles, ruins, soldiers, weapons, barricades, mines)'];
  }

  // === DWARVEN MINE ===
  _dwarvenMine(s) {
    let c = 0;
    // Mine entrance
    c += this._place('modular_dungeon_pack_entrance', 0, 30, 8);
    // Tunnel walls
    for (let z = -30; z <= 30; z += 4) {
      c += this._place('modular_dungeon_pack_modularstonewall', -12, z, 5);
      c += this._place('modular_dungeon_pack_modularstonewall', 12, z, 5);
    }
    // Mine supports (wooden)
    for (let z = -25; z <= 25; z += 8) {
      c += this._place('modular_dungeon_1_column', -10, z, 6);
      c += this._place('modular_dungeon_1_column2', 10, z, 6);
    }
    // Ore veins (crystals)
    for (let i = 0; i < 12; i++) {
      c += this._place('rpg_items_pack_crystal'+(1+i%5), (Math.random()-0.5)*20, (Math.random()-0.5)*50, 3+Math.random()*3);
    }
    // Minerals
    for (let i = 0; i < 6; i++) {
      c += this._place('rpg_items_pack_mineral', (Math.random()-0.5)*20, (Math.random()-0.5)*50, 3);
    }
    // Mine carts (barrels as substitute)
    c += this._place('modular_dungeon_1_barrel', -5, -10, 4);
    c += this._place('modular_dungeon_1_barrel2', 5, 10, 4);
    // Torches
    for (let z = -25; z <= 25; z += 8) {
      c += this._place('modular_dungeon_pack_torch_wall', -10, z, 3);
      c += this._place('modular_dungeon_pack_torch_wall', 10, z, 3);
    }
    // Gold & treasure in deep section
    c += this._place('rpg_items_pack_gold_ingots', 0, -25, 4);
    c += this._place('modular_dungeon_1_bag_coins', 3, -23, 3);
    c += this._place('rpg_items_pack_chest_ingots', -3, -23, 4);
    // Rocks
    for (let i = 0; i < 8; i++) {
      c += this._place('modular_dungeon_pack_rock'+(1+i%5), (Math.random()-0.5)*22, (Math.random()-0.5)*55, 3+Math.random()*2);
    }
    // Tools
    c += this._place('survival_pack_axe', -4, 0, 3);
    c += this._place('survival_pack_shovel', 4, 0, 3);
    // Stairs going deeper
    c += this._place('modular_dungeon_pack_stairs', 0, -15, 5);
    return ['✓ Dwarven mine — ' + c + ' objects (mine tunnels, ore crystals, gold, torches, mining tools, treasure)'];
  }



  // === NEW WORLD BUILDERS ===

  _westernTown(s) {
    let c = 0; const cx = 0, cz = 0;
    c += this._place('buildings_houses_1', cx, cz, 5*s);
    c += this._place('buildings_houses_2', cx+15, cz, 5*s);
    c += this._place('buildings_houses_3', cx-15, cz, 5*s);
    c += this._place('buildings_houses_1', cx+30, cz+5, 4*s);
    c += this._place('buildings_houses_2', cx-30, cz+5, 4*s);
    // Saloon
    c += this._place('buildings_houses_3', cx, cz-20, 7*s);
    // Stables
    c += this._place('vehicles_carts_1', cx+20, cz-15, 4*s);
    c += this._place('vehicles_carts_2', cx-20, cz-15, 4*s);
    // Barrels & crates
    for (let i=0;i<8;i++) c += this._place('containers_crates_'+(1+i%3), cx+(Math.random()-0.5)*50, cz+(Math.random()-0.5)*40, 3*s);
    // Weapons rack
    c += this._place('weapons_bows_1', cx+8, cz-10, 3*s);
    c += this._place('weapons_axes_1', cx-8, cz-10, 3*s);
    // Trees sparse
    for (let i=0;i<6;i++) c += this._place('nature_trees_'+(1+i%3), cx+(Math.random()-0.5)*80, cz+(Math.random()-0.5)*80, 5*s);
    // Rocks
    for (let i=0;i<5;i++) c += this._place('nature_rocks_'+(1+i%3), cx+(Math.random()-0.5)*60, cz+(Math.random()-0.5)*60, 4*s);
    this.engine.logOutput('ok', '🤠 Western town built — ' + c + ' objects');
    return c;
  }

  _samuraiVillage(s) {
    let c = 0; const cx = 0, cz = 0;
    // Main dojo
    c += this._place('buildings_houses_1', cx, cz, 6*s);
    // Houses
    for (let i=0;i<6;i++) {
      const a = (i/6)*Math.PI*2;
      c += this._place('buildings_houses_'+(1+i%3), cx+Math.cos(a)*25, cz+Math.sin(a)*25, 4*s);
    }
    // Cherry trees / nature
    for (let i=0;i<10;i++) c += this._place('nature_trees_'+(1+i%3), cx+(Math.random()-0.5)*60, cz+(Math.random()-0.5)*60, 5*s);
    // Weapons
    c += this._place('weapons_swords_1', cx+5, cz-8, 3*s);
    c += this._place('weapons_swords_2', cx-5, cz-8, 3*s);
    // Bridges
    c += this._place('buildings_bridges_1', cx+35, cz, 5*s);
    // Lanterns/torches
    for (let i=0;i<6;i++) c += this._place('torch_sconces_'+(1+i%3), cx+(Math.random()-0.5)*40, cz+(Math.random()-0.5)*40, 3*s);
    c += this._place('nature_flowers_1', cx-10, cz+10, 3*s);
    c += this._place('nature_flowers_2', cx+10, cz+10, 3*s);
    this.engine.logOutput('ok', '⛩️ Samurai village built — ' + c + ' objects');
    return c;
  }

  _ninjaTemple(s) {
    let c = 0; const cx = 0, cz = 0;
    c += this._place('buildings_towers_1', cx, cz, 8*s);
    c += this._place('buildings_towers_2', cx+20, cz+20, 6*s);
    c += this._place('buildings_towers_3', cx-20, cz+20, 6*s);
    c += this._place('buildings_walls_1', cx+15, cz-10, 5*s);
    c += this._place('buildings_walls_2', cx-15, cz-10, 5*s);
    c += this._place('traps_spikes_1', cx+10, cz+5, 3*s);
    c += this._place('traps_spikes_2', cx-10, cz+5, 3*s);
    for (let i=0;i<8;i++) c += this._place('nature_trees_'+(1+i%3), cx+(Math.random()-0.5)*50, cz+(Math.random()-0.5)*50, 6*s);
    c += this._place('weapons_swords_1', cx, cz-5, 3*s);
    c += this._place('nature_rocks_1', cx+30, cz-20, 5*s);
    this.engine.logOutput('ok', '🏯 Ninja temple built — ' + c + ' objects');
    return c;
  }

  _vikingVillage(s) {
    let c = 0; const cx = 0, cz = 0;
    // Longhouses
    for (let i=0;i<4;i++) c += this._place('buildings_houses_'+(1+i%3), cx+(i-2)*18, cz, 5*s);
    // Great hall
    c += this._place('buildings_castles_1', cx, cz-25, 7*s);
    // Ships
    c += this._place('vehicles_boats_1', cx+35, cz+20, 6*s);
    c += this._place('vehicles_boats_2', cx+50, cz+25, 5*s);
    // Weapons & shields
    c += this._place('shields_round_1', cx+5, cz-10, 3*s);
    c += this._place('shields_round_2', cx-5, cz-10, 3*s);
    c += this._place('weapons_axes_1', cx+8, cz-15, 3*s);
    c += this._place('weapons_axes_2', cx-8, cz-15, 3*s);
    // Campfires
    for (let i=0;i<3;i++) c += this._place('torch_sconces_'+(1+i%3), cx+(Math.random()-0.5)*40, cz+(Math.random()-0.5)*30, 3*s);
    // Trees
    for (let i=0;i<8;i++) c += this._place('nature_trees_'+(1+i%3), cx+(Math.random()-0.5)*70, cz+(Math.random()-0.5)*70, 5*s);
    c += this._place('nature_rocks_1', cx-25, cz+15, 6*s);
    this.engine.logOutput('ok', '🗡️ Viking village built — ' + c + ' objects');
    return c;
  }

  _aztecTemple(s) {
    let c = 0; const cx = 0, cz = 0;
    c += this._place('structures_stairs_1', cx, cz, 10*s);
    c += this._place('structures_pillars_1', cx+8, cz-5, 7*s);
    c += this._place('structures_pillars_2', cx-8, cz-5, 7*s);
    c += this._place('structures_arches_1', cx, cz-15, 6*s);
    for (let i=0;i<6;i++) c += this._place('structures_pillars_'+(1+i%3), cx+Math.cos(i)*20, cz+Math.sin(i)*20, 5*s);
    for (let i=0;i<12;i++) c += this._place('nature_trees_'+(1+i%3), cx+(Math.random()-0.5)*80, cz+(Math.random()-0.5)*80, 6*s);
    c += this._place('nature_flowers_1', cx+15, cz+15, 3*s);
    c += this._place('crystals_gems_1', cx, cz+5, 4*s);
    c += this._place('nature_rocks_2', cx+30, cz-30, 5*s);
    this.engine.logOutput('ok', '🏛️ Aztec temple built — ' + c + ' objects');
    return c;
  }

  _egyptianRuins(s) {
    let c = 0; const cx = 0, cz = 0;
    // Pyramid shapes using stairs/structures
    c += this._place('structures_stairs_1', cx, cz, 12*s);
    c += this._place('structures_stairs_2', cx+40, cz, 10*s);
    c += this._place('structures_stairs_3', cx-40, cz, 8*s);
    c += this._place('structures_pillars_1', cx+15, cz-15, 8*s);
    c += this._place('structures_pillars_2', cx-15, cz-15, 8*s);
    c += this._place('structures_arches_1', cx, cz-25, 7*s);
    // Sphinx-like structures
    c += this._place('nature_rocks_1', cx+25, cz+20, 8*s);
    c += this._place('containers_chests_1', cx+5, cz-5, 3*s);
    c += this._place('crystals_gems_2', cx-5, cz-5, 3*s);
    c += this._place('torch_sconces_1', cx+10, cz-20, 4*s);
    c += this._place('torch_sconces_2', cx-10, cz-20, 4*s);
    this.engine.logOutput('ok', '🏜️ Egyptian ruins built — ' + c + ' objects');
    return c;
  }

  _romanCity(s) {
    let c = 0; const cx = 0, cz = 0;
    c += this._place('structures_arches_1', cx, cz, 8*s);
    c += this._place('structures_arches_2', cx+20, cz, 7*s);
    c += this._place('structures_arches_3', cx-20, cz, 7*s);
    c += this._place('structures_pillars_1', cx+10, cz-15, 7*s);
    c += this._place('structures_pillars_2', cx-10, cz-15, 7*s);
    c += this._place('structures_pillars_3', cx+10, cz+15, 7*s);
    c += this._place('structures_fountains_1', cx, cz+20, 5*s);
    for (let i=0;i<4;i++) c += this._place('buildings_houses_'+(1+i%3), cx+(i-2)*20, cz-30, 5*s);
    c += this._place('buildings_bridges_1', cx+40, cz+10, 5*s);
    c += this._place('structures_stairs_1', cx, cz-20, 6*s);
    this.engine.logOutput('ok', '🏛️ Roman city built — ' + c + ' objects');
    return c;
  }

  _moonBase(s) {
    let c = 0; const cx = 0, cz = 0;
    c += this._place('scifi_consoles_1', cx, cz, 5*s);
    c += this._place('scifi_consoles_2', cx+15, cz, 5*s);
    c += this._place('scifi_consoles_3', cx-15, cz, 5*s);
    c += this._place('scifi_mechs_1', cx+30, cz+10, 6*s);
    for (let i=0;i<5;i++) c += this._place('nature_rocks_'+(1+i%3), cx+(Math.random()-0.5)*80, cz+(Math.random()-0.5)*80, 6*s);
    c += this._place('containers_crates_1', cx+10, cz-10, 3*s);
    c += this._place('containers_crates_2', cx-10, cz-10, 3*s);
    this.engine.logOutput('ok', '🌙 Moon base built — ' + c + ' objects');
    return c;
  }

  _asteroidBase(s) {
    let c = 0; const cx = 0, cz = 0;
    for (let i=0;i<15;i++) c += this._place('nature_rocks_'+(1+i%3), cx+(Math.random()-0.5)*100, cz+(Math.random()-0.5)*100, 4+Math.random()*6);
    c += this._place('scifi_consoles_1', cx, cz, 4*s);
    c += this._place('scifi_mechs_1', cx+20, cz, 5*s);
    c += this._place('crystals_gems_1', cx-15, cz+10, 4*s);
    c += this._place('crystals_gems_2', cx+15, cz-10, 3*s);
    this.engine.logOutput('ok', '☄️ Asteroid base built — ' + c + ' objects');
    return c;
  }

  _portalDimension(s) {
    let c = 0; const cx = 0, cz = 0;
    c += this._place('structures_arches_1', cx, cz, 10*s);
    c += this._place('crystals_gems_1', cx+10, cz, 5*s);
    c += this._place('crystals_gems_2', cx-10, cz, 5*s);
    c += this._place('crystals_gems_3', cx, cz+10, 5*s);
    for (let i=0;i<8;i++) c += this._place('structures_pillars_'+(1+i%3), cx+Math.cos(i*0.8)*20, cz+Math.sin(i*0.8)*20, 6*s);
    for (let i=0;i<6;i++) c += this._place('nature_rocks_'+(1+i%3), cx+(Math.random()-0.5)*50, cz+(Math.random()-0.5)*50, 3*s);
    c += this._place('nature_mushrooms_1', cx+15, cz+15, 4*s);
    this.engine.logOutput('ok', '🌀 Portal dimension built — ' + c + ' objects');
    return c;
  }

  _mechFactory(s) {
    let c = 0; const cx = 0, cz = 0;
    c += this._place('scifi_mechs_1', cx, cz, 8*s);
    c += this._place('scifi_mechs_2', cx+25, cz, 7*s);
    c += this._place('scifi_mechs_3', cx-25, cz, 7*s);
    c += this._place('scifi_consoles_1', cx+10, cz-15, 4*s);
    c += this._place('scifi_consoles_2', cx-10, cz-15, 4*s);
    for (let i=0;i<6;i++) c += this._place('containers_crates_'+(1+i%3), cx+(Math.random()-0.5)*40, cz+(Math.random()-0.5)*40, 3*s);
    c += this._place('buildings_walls_1', cx+30, cz-20, 5*s);
    c += this._place('buildings_walls_2', cx-30, cz-20, 5*s);
    this.engine.logOutput('ok', '🤖 Mech factory built — ' + c + ' objects');
    return c;
  }

  _swampLands(s) {
    let c = 0; const cx = 0, cz = 0;
    for (let i=0;i<15;i++) c += this._place('nature_trees_'+(1+i%3), cx+(Math.random()-0.5)*80, cz+(Math.random()-0.5)*80, 5+Math.random()*3);
    for (let i=0;i<10;i++) c += this._place('nature_mushrooms_'+(1+i%3), cx+(Math.random()-0.5)*60, cz+(Math.random()-0.5)*60, 3*s);
    for (let i=0;i<8;i++) c += this._place('nature_rocks_'+(1+i%3), cx+(Math.random()-0.5)*70, cz+(Math.random()-0.5)*70, 3*s);
    c += this._place('nature_flowers_1', cx+10, cz, 2*s);
    c += this._place('buildings_bridges_1', cx+20, cz+15, 4*s);
    this.engine.logOutput('ok', '🐊 Swamp lands built — ' + c + ' objects');
    return c;
  }

  _volcanoLands(s) {
    let c = 0; const cx = 0, cz = 0;
    for (let i=0;i<12;i++) c += this._place('nature_rocks_'+(1+i%3), cx+(Math.random()-0.5)*80, cz+(Math.random()-0.5)*80, 4+Math.random()*5);
    c += this._place('terrain_mountains_1', cx, cz+30, 8*s);
    c += this._place('crystals_gems_1', cx+20, cz-10, 4*s);
    c += this._place('crystals_gems_3', cx-20, cz-10, 4*s);
    c += this._place('torch_sconces_1', cx+5, cz, 4*s);
    c += this._place('torch_sconces_2', cx-5, cz, 4*s);
    c += this._place('torch_sconces_3', cx, cz+10, 4*s);
    this.engine.logOutput('ok', '🌋 Volcanic lands built — ' + c + ' objects');
    return c;
  }

  _crystalCavern(s) {
    let c = 0; const cx = 0, cz = 0;
    for (let i=0;i<20;i++) c += this._place('crystals_gems_'+(1+i%3), cx+(Math.random()-0.5)*60, cz+(Math.random()-0.5)*60, 3+Math.random()*5);
    for (let i=0;i<8;i++) c += this._place('nature_rocks_'+(1+i%3), cx+(Math.random()-0.5)*70, cz+(Math.random()-0.5)*70, 4*s);
    c += this._place('torch_sconces_1', cx+15, cz, 4*s);
    c += this._place('torch_sconces_2', cx-15, cz, 4*s);
    c += this._place('containers_chests_1', cx, cz+10, 3*s);
    this.engine.logOutput('ok', '💎 Crystal cavern built — ' + c + ' objects');
    return c;
  }

  _treasureVault(s) {
    let c = 0; const cx = 0, cz = 0;
    for (let i=0;i<8;i++) c += this._place('containers_chests_'+(1+i%3), cx+(Math.random()-0.5)*30, cz+(Math.random()-0.5)*30, 3*s);
    for (let i=0;i<12;i++) c += this._place('crystals_gems_'+(1+i%3), cx+(Math.random()-0.5)*40, cz+(Math.random()-0.5)*40, 2+Math.random()*3);
    c += this._place('structures_pillars_1', cx+15, cz+15, 6*s);
    c += this._place('structures_pillars_2', cx-15, cz+15, 6*s);
    c += this._place('structures_pillars_3', cx+15, cz-15, 6*s);
    c += this._place('torch_sconces_1', cx+10, cz, 4*s);
    c += this._place('torch_sconces_2', cx-10, cz, 4*s);
    c += this._place('potions_bottles_1', cx+3, cz+3, 2*s);
    this.engine.logOutput('ok', '💰 Treasure vault built — ' + c + ' objects');
    return c;
  }

  _prisonComplex(s) {
    let c = 0; const cx = 0, cz = 0;
    for (let i=0;i<8;i++) c += this._place('buildings_walls_'+(1+i%3), cx+(i-4)*10, cz-20, 6*s);
    for (let i=0;i<8;i++) c += this._place('buildings_walls_'+(1+i%3), cx+(i-4)*10, cz+20, 6*s);
    c += this._place('buildings_towers_1', cx+35, cz-20, 7*s);
    c += this._place('buildings_towers_2', cx-35, cz-20, 7*s);
    c += this._place('buildings_towers_3', cx+35, cz+20, 7*s);
    for (let i=0;i<4;i++) c += this._place('buildings_houses_'+(1+i%3), cx+(i-2)*15, cz, 4*s);
    c += this._place('torch_sconces_1', cx, cz-15, 3*s);
    this.engine.logOutput('ok', '🔒 Prison complex built — ' + c + ' objects');
    return c;
  }

  _steampunkCity(s) {
    let c = 0; const cx = 0, cz = 0;
    for (let i=0;i<5;i++) c += this._place('buildings_towers_'+(1+i%3), cx+(i-2)*20, cz, 7*s);
    c += this._place('vehicles_airships_1', cx, cz+30, 6*s);
    c += this._place('vehicles_airships_2', cx+30, cz+25, 5*s);
    c += this._place('scifi_consoles_1', cx+10, cz-10, 4*s);
    c += this._place('buildings_bridges_1', cx+25, cz, 5*s);
    for (let i=0;i<4;i++) c += this._place('buildings_houses_'+(1+i%3), cx+(Math.random()-0.5)*50, cz-20+(Math.random()-0.5)*20, 5*s);
    c += this._place('containers_crates_1', cx-15, cz+10, 3*s);
    this.engine.logOutput('ok', '⚙️ Steampunk city built — ' + c + ' objects');
    return c;
  }

  _hellscape(s) {
    let c = 0; const cx = 0, cz = 0;
    for (let i=0;i<10;i++) c += this._place('nature_rocks_'+(1+i%3), cx+(Math.random()-0.5)*80, cz+(Math.random()-0.5)*80, 5+Math.random()*5);
    for (let i=0;i<6;i++) c += this._place('torch_sconces_'+(1+i%3), cx+(Math.random()-0.5)*50, cz+(Math.random()-0.5)*50, 5*s);
    c += this._place('structures_arches_1', cx, cz, 10*s);
    c += this._place('structures_pillars_1', cx+15, cz, 8*s);
    c += this._place('structures_pillars_2', cx-15, cz, 8*s);
    c += this._place('traps_spikes_1', cx+20, cz+20, 4*s);
    c += this._place('traps_spikes_2', cx-20, cz+20, 4*s);
    c += this._place('crystals_gems_1', cx, cz-15, 5*s);
    this.engine.logOutput('ok', '🔥 Hellscape built — ' + c + ' objects');
    return c;
  }

  _skyIslands(s) {
    let c = 0; const cx = 0, cz = 0;
    c += this._place('terrain_hills_1', cx, cz, 8*s);
    c += this._place('terrain_hills_2', cx+40, cz+20, 6*s);
    c += this._place('terrain_hills_3', cx-40, cz-20, 6*s);
    for (let i=0;i<8;i++) c += this._place('nature_trees_'+(1+i%3), cx+(Math.random()-0.5)*50, cz+(Math.random()-0.5)*50, 5*s);
    for (let i=0;i<6;i++) c += this._place('nature_flowers_'+(1+i%3), cx+(Math.random()-0.5)*40, cz+(Math.random()-0.5)*40, 3*s);
    c += this._place('buildings_bridges_1', cx+20, cz, 5*s);
    c += this._place('structures_fountains_1', cx, cz+15, 4*s);
    c += this._place('crystals_gems_1', cx-15, cz+10, 4*s);
    this.engine.logOutput('ok', '☁️ Sky islands built — ' + c + ' objects');
    return c;
  }

  _zenGarden(s) {
    let c = 0; const cx = 0, cz = 0;
    for (let i=0;i<10;i++) c += this._place('nature_trees_'+(1+i%3), cx+(Math.random()-0.5)*60, cz+(Math.random()-0.5)*60, 5*s);
    for (let i=0;i<12;i++) c += this._place('nature_flowers_'+(1+i%3), cx+(Math.random()-0.5)*50, cz+(Math.random()-0.5)*50, 2*s);
    for (let i=0;i<6;i++) c += this._place('nature_rocks_'+(1+i%3), cx+(Math.random()-0.5)*40, cz+(Math.random()-0.5)*40, 3*s);
    c += this._place('structures_fountains_1', cx, cz, 5*s);
    c += this._place('buildings_bridges_1', cx+25, cz+10, 4*s);
    c += this._place('torch_sconces_1', cx+8, cz-8, 3*s);
    c += this._place('torch_sconces_2', cx-8, cz-8, 3*s);
    this.engine.logOutput('ok', '🎋 Zen garden built — ' + c + ' objects');
    return c;
  }

  _carnivalGrounds(s) {
    let c = 0; const cx = 0, cz = 0;
    for (let i=0;i<6;i++) c += this._place('buildings_houses_'+(1+i%3), cx+(i-3)*18, cz, 5*s);
    c += this._place('buildings_towers_1', cx, cz+25, 8*s);
    c += this._place('structures_arches_1', cx, cz-15, 6*s);
    for (let i=0;i<8;i++) c += this._place('torch_sconces_'+(1+i%3), cx+(Math.random()-0.5)*50, cz+(Math.random()-0.5)*50, 3*s);
    c += this._place('containers_crates_1', cx+20, cz+10, 3*s);
    c += this._place('furniture_chairs_1', cx-10, cz+15, 3*s);
    c += this._place('furniture_tables_1', cx+10, cz+15, 3*s);
    this.engine.logOutput('ok', '🎪 Carnival grounds built — ' + c + ' objects');
    return c;
  }

  _secretLab(s) {
    let c = 0; const cx = 0, cz = 0;
    c += this._place('scifi_consoles_1', cx, cz, 5*s);
    c += this._place('scifi_consoles_2', cx+12, cz, 5*s);
    c += this._place('scifi_consoles_3', cx-12, cz, 5*s);
    c += this._place('containers_crates_1', cx+20, cz-10, 3*s);
    c += this._place('containers_crates_2', cx-20, cz-10, 3*s);
    c += this._place('potions_bottles_1', cx+5, cz+5, 2*s);
    c += this._place('potions_bottles_2', cx-5, cz+5, 2*s);
    c += this._place('buildings_walls_1', cx+25, cz, 5*s);
    c += this._place('buildings_walls_2', cx-25, cz, 5*s);
    c += this._place('scifi_mechs_1', cx, cz-20, 6*s);
    this.engine.logOutput('ok', '🔬 Secret lab built — ' + c + ' objects');
    return c;
  }

  _industrialZone(s) {
    let c = 0; const cx = 0, cz = 0;
    for (let i=0;i<4;i++) c += this._place('buildings_houses_'+(1+i%3), cx+(i-2)*20, cz, 6*s);
    for (let i=0;i<8;i++) c += this._place('containers_crates_'+(1+i%3), cx+(Math.random()-0.5)*50, cz+(Math.random()-0.5)*40, 3*s);
    c += this._place('buildings_towers_1', cx+35, cz-15, 8*s);
    c += this._place('scifi_consoles_1', cx, cz-20, 4*s);
    c += this._place('vehicles_carts_1', cx-20, cz+15, 4*s);
    c += this._place('buildings_walls_1', cx+40, cz, 5*s);
    this.engine.logOutput('ok', '🏭 Industrial zone built — ' + c + ' objects');
    return c;
  }

  _trainStation(s) {
    let c = 0; const cx = 0, cz = 0;
    c += this._place('buildings_houses_1', cx, cz, 7*s);
    c += this._place('buildings_bridges_1', cx+20, cz, 5*s);
    c += this._place('buildings_bridges_2', cx-20, cz, 5*s);
    for (let i=0;i<6;i++) c += this._place('structures_pillars_'+(1+i%3), cx+(i-3)*8, cz-10, 5*s);
    c += this._place('furniture_chairs_1', cx+5, cz+5, 3*s);
    c += this._place('furniture_chairs_2', cx-5, cz+5, 3*s);
    c += this._place('containers_crates_1', cx+15, cz+10, 3*s);
    c += this._place('torch_sconces_1', cx+10, cz-5, 3*s);
    c += this._place('torch_sconces_2', cx-10, cz-5, 3*s);
    this.engine.logOutput('ok', '🚂 Train station built — ' + c + ' objects');
    return c;
  }

  _savannaPlains(s) {
    let c = 0; const cx = 0, cz = 0;
    for (let i=0;i<12;i++) c += this._place('nature_trees_'+(1+i%3), cx+(Math.random()-0.5)*120, cz+(Math.random()-0.5)*120, 6+Math.random()*4);
    for (let i=0;i<8;i++) c += this._place('nature_rocks_'+(1+i%3), cx+(Math.random()-0.5)*100, cz+(Math.random()-0.5)*100, 3*s);
    for (let i=0;i<5;i++) c += this._place('creatures_horses_'+(1+i%3), cx+(Math.random()-0.5)*60, cz+(Math.random()-0.5)*60, 4*s);
    c += this._place('nature_flowers_1', cx+20, cz+20, 2*s);
    c += this._place('nature_flowers_2', cx-20, cz-20, 2*s);
    this.engine.logOutput('ok', '🦁 Savanna plains built — ' + c + ' objects');
    return c;
  }

}
