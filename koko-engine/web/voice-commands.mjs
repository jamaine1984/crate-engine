// ═══════════════════════════════════════════════════════════════
// CRATE ENGINE — VOICE & NATURAL LANGUAGE COMMAND SYSTEM v1
// 50,000+ natural language variations → engine actions
// ═══════════════════════════════════════════════════════════════
//
// Architecture:
//   1. INTENT CATEGORIES — groups of related actions
//   2. PATTERN TEMPLATES — parameterized phrase patterns
//   3. SYNONYM EXPANSION — multiplies each pattern by word variants
//   4. FUZZY MATCHER — matches spoken/typed input to closest intent
//   5. VOICE ENGINE — Web Speech API integration
//
// Each base intent has ~50-200 natural language variations generated
// from template expansion. 500 intents × 100 avg variations = 50,000+

// ═══════════════════════════════════════════
// SYNONYM BANKS — natural language variety
// ═══════════════════════════════════════════

const SYN = {
  // Action verbs
  add: ['add','place','put','drop','spawn','create','make','insert','generate','summon','conjure','materialize','bring in','throw in','toss in','set down','lay down','plop','stick','pop in'],
  remove: ['remove','delete','destroy','erase','clear','get rid of','take away','eliminate','wipe','trash','kill','nuke','vanish','disappear','discard','dispose','obliterate','annihilate','yeet'],
  move: ['move','push','slide','shift','drag','nudge','relocate','position','transport','carry','pull','shove','transfer','reposition','place','set','put'],
  rotate: ['rotate','spin','turn','twist','flip','swivel','pivot','roll','orient','angle','tilt'],
  scale: ['scale','resize','make bigger','make smaller','enlarge','shrink','grow','stretch','expand','compress','inflate','deflate','magnify','minimize','size up','size down','bulk up'],
  change: ['change','set','switch','modify','alter','adjust','update','transform','convert','make','turn'],
  show: ['show','display','reveal','unhide','enable','turn on','activate','open','present','expose','make visible'],
  hide: ['hide','conceal','remove','disable','turn off','deactivate','close','dismiss','make invisible','suppress'],

  // Objects
  cube: ['cube','box','block','crate','square'],
  sphere: ['sphere','ball','orb','globe','circle','round thing'],
  cylinder: ['cylinder','tube','pipe','column','pillar','pole','rod','barrel shape'],
  tree: ['tree','oak','elm','maple','birch','willow','timber','woodland'],
  pine: ['pine','pine tree','evergreen','fir','spruce','conifer','christmas tree','cedar'],
  rock: ['rock','stone','boulder','pebble','cobble','mineral','crag'],
  bush: ['bush','shrub','hedge','thicket','undergrowth','bramble','foliage'],
  flower: ['flower','plant','bloom','blossom','rose','daisy','tulip','garden flower'],
  grass: ['grass','lawn','turf','meadow','sod','grassland'],
  house: ['house','home','cabin','cottage','shack','dwelling','hut','bungalow','lodge','residence','building'],
  castle: ['castle','fortress','citadel','stronghold','keep','palace','fort','bastion'],
  tower: ['tower','turret','spire','watchtower','lookout','minaret','obelisk','lighthouse'],
  wall: ['wall','barrier','partition','barricade','rampart','bulwark','fortification'],
  fence: ['fence','railing','picket','barrier','enclosure','palisade','stockade'],
  bridge: ['bridge','overpass','crossing','walkway','span','viaduct','arch bridge'],
  road: ['road','path','trail','street','walkway','sidewalk','highway','lane','track','route'],
  water: ['water','lake','pond','river','stream','ocean','sea','pool','creek','brook','waterfall'],
  mountain: ['mountain','peak','summit','mount','ridge','cliff','crag','bluff'],
  sword: ['sword','blade','longsword','broadsword','rapier','saber','katana','claymore','scimitar'],
  axe: ['axe','hatchet','tomahawk','cleaver','battleaxe','war axe'],
  shield: ['shield','buckler','aegis','ward','defender','guard','barrier shield'],
  bow: ['bow','longbow','shortbow','crossbow','hunting bow','archer bow'],
  staff: ['staff','wand','rod','scepter','cane','walking stick','magic staff','wizard staff'],
  chest: ['chest','treasure chest','box','crate','loot box','strongbox','coffer','trunk'],
  barrel: ['barrel','keg','cask','drum','container','vat','tun'],
  torch: ['torch','lantern','lamp','light source','fire light','sconce','candelabra','brazier'],
  campfire: ['campfire','fire','bonfire','firepit','fire pit','camp fire','hearth','blaze'],
  npc: ['npc','character','person','villager','townsperson','citizen','inhabitant','pedestrian','civilian','folk','people','crowd'],
  enemy: ['enemy','monster','creature','beast','foe','hostile','mob','baddie','villain','opponent','adversary','demon','zombie','skeleton','goblin','orc','dragon','troll','giant','wolf','spider','bat','slime','ghost','wraith','undead','bandit','raider'],
  knight: ['knight','warrior','soldier','paladin','fighter','champion','gladiator','swordsman','guard','sentinel','templar'],
  horse: ['horse','steed','mount','stallion','mare','pony','mustang','charger','destrier'],
  car: ['car','vehicle','automobile','truck','van','jeep','sedan','sports car','suv','pickup'],
  // Avatars
  avatar: ['avatar','character','player','hero','protagonist','me','myself','my character','player character','main character'],

  // Colors
  red: ['red','crimson','scarlet','ruby','cherry','blood red','maroon','vermillion','carmine'],
  blue: ['blue','azure','cobalt','navy','sapphire','cerulean','indigo','cyan','teal','sky blue','royal blue','ocean blue'],
  green: ['green','emerald','lime','olive','forest green','jade','sage','mint','viridian','chartreuse','verdant'],
  yellow: ['yellow','gold','golden','amber','lemon','canary','sunshine','buttercup','saffron'],
  orange: ['orange','tangerine','peach','coral','rust','burnt orange','copper','amber'],
  purple: ['purple','violet','lavender','plum','magenta','amethyst','lilac','mauve','orchid','fuchsia'],
  pink: ['pink','rose','blush','salmon','hot pink','bubblegum','flamingo','fuchsia'],
  white: ['white','ivory','snow','pearl','cream','alabaster','chalk','frost'],
  black: ['black','onyx','obsidian','jet','ebony','charcoal','midnight','pitch black','void'],
  brown: ['brown','chocolate','coffee','mahogany','chestnut','walnut','sienna','umber','tan','bronze','copper'],
  gray: ['gray','grey','silver','ash','slate','pewter','steel','charcoal','gunmetal','smoke'],

  // Sizes
  big: ['big','bigger','large','larger','huge','giant','massive','enormous','gigantic','colossal','immense','oversized','mega','jumbo','titan','towering','gargantuan'],
  small: ['small','smaller','tiny','little','mini','miniature','petite','compact','micro','teeny','itty bitty','pocket-sized','wee','diminutive'],

  // Directions
  left: ['left','to the left','leftward','west','westward'],
  right: ['right','to the right','rightward','east','eastward'],
  up: ['up','upward','higher','above','skyward','overhead'],
  down: ['down','downward','lower','below','beneath','underground'],
  forward: ['forward','ahead','in front','north','northward','onwards'],
  back: ['back','backward','behind','south','southward','retreat'],

  // Weather
  rain: ['rain','rainfall','downpour','drizzle','shower','storm','rainstorm','precipitation','pour','sprinkle'],
  snow: ['snow','snowfall','blizzard','flurries','frost','winter','snowstorm','sleet','hail','ice'],
  fog: ['fog','mist','haze','smog','murky','cloudy','overcast','misty','foggy','dense fog'],
  clear: ['clear','sunny','bright','fair','cloudless','blue sky','nice weather','good weather','pleasant'],

  // Time of day
  day: ['day','daytime','morning','noon','midday','afternoon','bright','daylight','sunrise','dawn','early'],
  night: ['night','nighttime','dark','midnight','evening','dusk','twilight','after dark','starlight','moonlight','late'],
  sunset: ['sunset','dusk','golden hour','sundown','twilight','evening light','magic hour'],

  // Ground types
  grass_ground: ['grass','grassy','green','meadow','lawn','field','pasture','prairie'],
  sand_ground: ['sand','sandy','beach','desert','dunes','arid','sahara'],
  snow_ground: ['snow','snowy','ice','icy','frozen','tundra','arctic','winter','frost'],
  stone_ground: ['stone','rocky','cobblestone','brick','marble','granite','slate','flagstone'],
  dirt_ground: ['dirt','mud','muddy','earth','soil','clay','dusty','terrain'],
  lava_ground: ['lava','magma','volcanic','molten','fire','inferno','hellscape'],
  metal_ground: ['metal','steel','iron','chrome','titanium','aluminum','industrial','sci-fi'],

  // Biomes / scene themes
  medieval: ['medieval','middle ages','fantasy','kingdom','feudal','dark ages','ye olde','lords and ladies'],
  scifi: ['sci-fi','science fiction','futuristic','space','cyber','neon','tech','advanced','starship','alien'],
  horror: ['horror','scary','creepy','spooky','haunted','terrifying','nightmarish','dark','sinister','macabre','evil'],
  nature: ['nature','natural','wilderness','wild','outdoors','forest','woodland','jungle','tropical'],
  urban: ['urban','city','downtown','metropolitan','street','modern','concrete jungle','suburb'],
  desert: ['desert','arid','sahara','wasteland','barren','dry','scorched','dusty','outback'],
  winter: ['winter','arctic','frozen','tundra','ice','snowy','cold','frigid','polar','glacial'],
  underwater: ['underwater','ocean','deep sea','aquatic','marine','submarine','coral','reef','abyss'],
  volcanic: ['volcanic','volcano','lava','magma','eruption','infernal','hellish','fiery','molten'],
};

// ═══════════════════════════════════════════
// INTENT DEFINITIONS — 500+ base intents
// ═══════════════════════════════════════════

const INTENTS = [
  // === OBJECT SPAWNING (40 object types × ~20 add verbs = 800+ patterns) ===
  ...['cube','sphere','cylinder','tree','pine','rock','bush','flower','grass','house','castle','tower','wall','fence','bridge','road','water','mountain','sword','axe','shield','bow','staff','chest','barrel','torch','campfire','npc','enemy','knight','horse','car','avatar'].map(obj => ({
    id: `add_${obj}`,
    action: obj === 'pine' ? 'add pine' : obj === 'avatar' ? 'add avatar' : `add ${obj === 'grass_ground' ? 'grass' : obj}`,
    patterns: SYN.add.flatMap(v => SYN[obj].map(o => `${v} ${o}`)),
    // Also: "I want a ___", "give me a ___", "can you place a ___", "put down a ___"
    extras: SYN[obj].flatMap(o => [
      `i want a ${o}`, `i want ${o}`, `give me a ${o}`, `give me ${o}`,
      `i need a ${o}`, `i need ${o}`, `can you add a ${o}`, `can you place a ${o}`,
      `put down a ${o}`, `let me have a ${o}`, `how about a ${o}`,
      `throw in a ${o}`, `we need a ${o}`, `get me a ${o}`,
      `i'd like a ${o}`, `could you add a ${o}`, `please add a ${o}`,
      `yo add a ${o}`, `drop a ${o}`, `pop a ${o} in`,
    ]),
  })),

  // === OBJECT REMOVAL ===
  {id:'remove_last', action:'remove', patterns: SYN.remove.flatMap(v => ['that','the last one','it','last object','previous','the thing','what i just added','the last thing'].map(o => `${v} ${o}`)),
   extras:['undo','go back','ctrl z','take it back','oops','nevermind','undo that','remove it','delete it','get rid of it','i dont want that','take that away']},
  
  // === CLEAR ALL ===
  {id:'clear_all', action:'clear', patterns:['clear everything','clear all','clear the scene','remove everything','delete everything','start over','reset','blank slate','wipe','clean slate','fresh start','new scene','empty the scene','nuke everything','destroy all','remove all objects','get rid of everything','clear it all','wipe it clean','start fresh']},

  // === MOVEMENT (parameterized — object + direction + amount) ===
  ...['left','right','up','down','forward','back'].map(dir => ({
    id: `move_${dir}`,
    action: `move_direction:${dir}`,
    patterns: SYN.move.flatMap(v => SYN[dir].map(d => `${v} it ${d}`)),
    extras: SYN[dir].flatMap(d => [
      `${d}`, `go ${d}`, `push it ${d}`, `slide ${d}`,
      `move that ${d}`, `nudge it ${d}`, `shift it ${d}`,
      `a little ${d}`, `more ${d}`, `keep going ${d}`,
    ]),
  })),

  // === ROTATION ===
  {id:'rotate_object', action:'rotate', patterns: SYN.rotate.flatMap(v => ['it','that','the object','this','the last one','the selected'].map(o => `${v} ${o}`)),
   extras:['turn it around','flip it','rotate 90','rotate 180','spin it','twist it','turn it sideways','rotate clockwise','rotate counterclockwise','turn it left','turn it right']},

  // === SCALING ===
  {id:'scale_up', action:'scale_up', patterns: SYN.scale.filter(s=>s.includes('big')||s==='enlarge'||s==='grow'||s==='expand'||s==='inflate'||s==='magnify').flatMap(v => [v, `${v} it`, `${v} that`]),
   extras: SYN.big.flatMap(s => [`make it ${s}`,`make that ${s}`,`${s}`,`i want it ${s}`,`scale it ${s}`,`size ${s}`])},
  {id:'scale_down', action:'scale_down', patterns: SYN.scale.filter(s=>s.includes('small')||s==='shrink'||s==='compress'||s==='deflate'||s==='minimize').flatMap(v => [v, `${v} it`, `${v} that`]),
   extras: SYN.small.flatMap(s => [`make it ${s}`,`make that ${s}`,`${s}`,`i want it ${s}`,`scale it ${s}`,`size ${s}`])},

  // === COLOR CHANGES ===
  ...['red','blue','green','yellow','orange','purple','pink','white','black','brown','gray'].map(color => ({
    id: `color_${color}`,
    action: `color:${color}`,
    patterns: SYN[color].flatMap(c => SYN.change.flatMap(v => [`${v} it to ${c}`,`${v} color to ${c}`,`${v} the color ${c}`,`make it ${c}`,`paint it ${c}`,`turn it ${c}`])),
    extras: SYN[color].flatMap(c => [`${c}`,`i want ${c}`,`make that ${c}`,`color ${c}`,`paint ${c}`,`turn ${c}`]),
  })),

  // === WEATHER ===
  {id:'weather_rain', action:'rain', patterns: SYN.rain.flatMap(r => [`make it ${r}`,`start ${r}`,`${r}`,`turn on ${r}`,`i want ${r}`,`add ${r}`,`enable ${r}`,`begin ${r}`,`let it ${r}`]),
   extras:['make it storm','thunderstorm','its raining','rainy day','stormy weather','start a storm','heavy rain','light rain']},
  {id:'weather_snow', action:'snow', patterns: SYN.snow.flatMap(s => [`make it ${s}`,`start ${s}`,`${s}`,`turn on ${s}`,`i want ${s}`,`add ${s}`,`enable ${s}`,`begin ${s}`]),
   extras:['let it snow','winter wonderland','cold weather','make it cold','freezing','icy weather']},
  {id:'weather_fog', action:'fog', patterns: SYN.fog.flatMap(f => [`make it ${f}`,`add ${f}`,`${f}`,`turn on ${f}`,`enable ${f}`,`i want ${f}`,`make it ${f}`]),
   extras:['spooky fog','dense fog','thick fog','light fog','heavy fog','atmospheric','moody','eerie']},
  {id:'weather_clear', action:'clear weather', patterns: SYN.clear.flatMap(c => [`make it ${c}`,`${c} weather`,`${c} skies`,`${c}`,`turn off weather`]),
   extras:['stop rain','stop snow','no more rain','no more snow','clear the weather','remove weather','disable weather','weather off','no weather','nice day']},

  // === TIME OF DAY ===
  {id:'time_day', action:'time day', patterns: SYN.day.flatMap(d => [`make it ${d}`,`set time to ${d}`,`${d}`,`switch to ${d}`,`i want ${d}`,`change to ${d}`]),
   extras:['brighten up','lights on','daytime','make it bright','turn up the sun','sunny day','wake up','good morning']},
  {id:'time_night', action:'time night', patterns: SYN.night.flatMap(n => [`make it ${n}`,`set time to ${n}`,`${n}`,`switch to ${n}`,`i want ${n}`,`change to ${n}`]),
   extras:['darken','lights off','make it dark','turn off the sun','stars','moonlit','bedtime','spooky time']},
  {id:'time_sunset', action:'time sunset', patterns: SYN.sunset.flatMap(s => [`make it ${s}`,`set time to ${s}`,`${s}`,`switch to ${s}`,`i want ${s}`]),
   extras:['romantic lighting','warm light','orange sky','beautiful sky','pretty sky','end of day','golden light']},

  // === GROUND / TERRAIN ===
  ...['grass_ground','sand_ground','snow_ground','stone_ground','dirt_ground','lava_ground','metal_ground'].map(gt => {
    const base = gt.replace('_ground','');
    return {
      id: `ground_${base}`, action: `ground ${base}`,
      patterns: SYN[gt].flatMap(g => [`change ground to ${g}`,`make the ground ${g}`,`${g} ground`,`set ground to ${g}`,`floor ${g}`,`terrain ${g}`,`surface ${g}`]),
      extras: SYN[gt].flatMap(g => [`make it ${g}`,`i want ${g} ground`,`switch to ${g}`,`${g} floor`,`${g} terrain`]),
    };
  }),

  // === TERRAIN GENERATION ===
  ...['mountains','hills','canyon','volcano','island','dunes','plateau','cliffs','valley','flat'].map(t => ({
    id: `terrain_${t}`, action: `terrain ${t}`,
    patterns: [`terrain ${t}`,`generate ${t}`,`create ${t} terrain`,`make ${t}`,`add ${t} terrain`,`${t}`,`build ${t}`,`i want ${t}`,`give me ${t}`],
    extras: [`${t} landscape`,`${t} biome`,`${t} world`,`${t} environment`,`generate ${t} landscape`,`create a ${t}`,`build a ${t}`,`make a ${t}`],
  })),

  // === SCENE BUILDING (biome presets) ===
  ...Object.entries({
    'medieval village':SYN.medieval, 'space station':SYN.scifi, 'haunted graveyard':SYN.horror,
    'forest':SYN.nature, 'city':SYN.urban, 'desert wasteland':SYN.desert,
    'frozen tundra':SYN.winter, 'underwater world':SYN.underwater, 'volcanic hellscape':SYN.volcanic,
  }).map(([scene, syns]) => ({
    id: `build_${scene.replace(/\s/g,'_')}`, action: `build ${scene}`,
    patterns: syns.flatMap(s => [`build a ${s} scene`,`build ${s}`,`create a ${s} world`,`make a ${s} scene`,`i want a ${s} world`,`generate ${s}`,`${s} scene`,`${s} world`,`${s} environment`]),
    extras: [`build a ${scene}`,`create ${scene}`,`make ${scene}`,`i want ${scene}`,`let's do ${scene}`,`set up ${scene}`,`design ${scene}`,`craft ${scene}`],
  })),

  // === PLAY MODE ===
  {id:"characters", action:"characters", patterns:["characters","show characters","character select","character menu","who can i play","who can i play as","choose character","pick character","select character","change character","switch character","player select","show me the characters","what characters do you have","what players do we have","show player menu","open character menu","character gallery","pick a character","i want to change character","let me pick a character","show me who i can play as","character list","player list","available characters","playable characters","show heroes","who can i be"],
   extras:["character screen","roster","show roster","open roster","hero select","hero selection","player selection","pick a hero","choose a hero","select a hero","show me heroes","which characters","what characters"]},
  {id:'play', action:'play', patterns:['play','start playing','enter play mode','play mode','start game','begin','go','run','launch','lets play','let me play','start','begin playing','game mode','play the game','test it','try it','run it','execute'],
   extras:['play mode on','enter game','jump in','dive in','lets go','start the game','im ready','ready to play','test the scene','preview','playtest']},
  {id:'stop_play', action:'exit play', patterns:['stop','stop playing','exit play','exit','quit','leave play mode','edit mode','back to edit','stop game','end game','pause','exit game'],
   extras:['im done','done playing','back to editing','edit','stop the game','end','finish','quit game','leave','get out']},

  // === CAMERA ===
  {id:'camera_first', action:'1st person', patterns:['first person','1st person','fps','first person view','fps mode','fps camera','first person camera','pov','point of view','my eyes','through my eyes','look through eyes'],
   extras:['switch to first person','go first person','fps view','i want to see through eyes','immersive view','vr view']},
  {id:'camera_third', action:'3rd person', patterns:['third person','3rd person','over shoulder','behind character','follow camera','chase camera','third person view','orbiting camera'],
   extras:['switch to third person','go third person','behind me','over my shoulder','follow me camera','action camera']},
  {id:'camera_top', action:'top view', patterns:['top view','birds eye','overhead','top down','aerial view','from above','look down','sky view','gods eye','satellite view'],
   extras:['switch to top view','look from above','isometric','strategy view','rts camera','map view']},

  // === COMBAT ===
  {id:'spawn_enemies', action:'spawn enemies', patterns:SYN.enemy.flatMap(e => [`spawn ${e}`,`add ${e}`,`summon ${e}`,`create ${e}`,`bring ${e}`,`release ${e}`]),
   extras:['enemies','i want enemies','add some bad guys','spawn mobs','release the horde','attack me','bring it on','fight','battle','combat','lets fight','arena']},
  {id:'equip_weapon', action:'equip', patterns:['equip','equip sword','equip axe','equip shield','equip bow','equip spear','equip hammer','grab weapon','pick up weapon','arm myself','draw sword','draw weapon','unsheathe','brandish'],
   extras:['give me a weapon','i need a weapon','arm me','lets fight','ready for battle','battle ready','combat ready','sword out','axe out','shield up']},

  // === ANIMATION ===
  {id:'animate_walk', action:'animate walk', patterns:['walk','make it walk','animate walk','walking','start walking','begin walking','stroll','march','stride','pace','wander','roam','patrol'],
   extras:['make them walk','walk around','walking animation','move around','patrol the area','wander around','make it move','get moving']},
  {id:'animate_run', action:'animate run', patterns:['run','make it run','animate run','running','start running','sprint','dash','jog','hurry','rush','charge','bolt','flee'],
   extras:['make them run','run around','running animation','go fast','speed up','hustle','double time']},
  {id:'animate_attack', action:'animate attack', patterns:['attack','make it attack','animate attack','fight','swing','slash','strike','hit','combat','battle','assault'],
   extras:['attack animation','fight animation','swing sword','make them fight','combat mode','battle animation']},
  {id:'animate_idle', action:'animate idle', patterns:['idle','make it idle','stop moving','stand still','rest','wait','hold','freeze','stay','remain','be still','dont move','stay put'],
   extras:['idle animation','standing','stop animation','pause movement','hold position','at ease']},
  {id:'animate_dance', action:'animate dance', patterns:['dance','make it dance','animate dance','dancing','boogie','groove','bust a move','party','celebrate','jig','waltz','salsa'],
   extras:['dance party','everybody dance','make them dance','celebration','victory dance','happy dance','dance animation']},
  {id:'animate_die', action:'animate die', patterns:['die','death','kill it','make it die','fall down','collapse','perish','expire','drop dead','keel over','defeated'],
   extras:['death animation','kill animation','make them die','fall over','knocked out','game over','rip']},

  // === PHYSICS ===
  {id:'physics_on', action:'physics on', patterns:['enable physics','physics on','turn on physics','add physics','start physics','gravity on','realistic','simulate','simulation'],
   extras:['make it realistic','real physics','enable gravity','things should fall','add gravity','ragdoll','physics engine on']},
  {id:'physics_off', action:'physics off', patterns:['disable physics','physics off','turn off physics','remove physics','stop physics','no gravity','float','zero gravity','zero g'],
   extras:['no physics','disable gravity','things should float','remove gravity','static','freeze physics']},

  // === SAVE/LOAD ===
  {id:'save', action:'save', patterns:['save','save scene','save my work','save project','store','backup','keep this','save it','save game','save progress','checkpoint'],
   extras:['save everything','dont lose this','store my work','save the scene','export','save state','quick save']},
  {id:'load', action:'load', patterns:['load','load scene','open','open project','restore','load my work','load save','load game','load progress','continue'],
   extras:['open scene','restore save','load it back','get my save','reload','resume','pick up where i left off']},
  {id:'screenshot', action:'screenshot', patterns:['screenshot','take a screenshot','capture','snap','photo','picture','screen capture','screen grab','print screen','f2'],
   extras:['take a picture','capture the screen','save image','snap a photo','take a photo','screencap','ss']},

  // === UI COMMANDS ===
  {id:'help', action:'help', patterns:['help','commands','what can you do','what can i do','list commands','show commands','how does this work','tutorial','guide','instructions','manual','docs'],
   extras:['how do i','teach me','show me how','what are the commands','help me','assist','i need help','im lost','im confused','explain','how to','whats possible']},

  // === GODMODE / CREATIVE ===
  {id:'godmode_fly', action:'godmode fly', patterns:['fly','make it fly','float','levitate','hover','soar','glide','take flight','lift off','airborne','ascend'],
   extras:['make it float','floating','up in the air','make it hover','defy gravity','fly around','i want to fly','let me fly']},
  {id:'godmode_explode', action:'godmode explode', patterns:['explode','explosion','blow up','detonate','burst','combust','kaboom','boom','blast','erupt'],
   extras:['make it explode','blow it up','destroy it dramatically','fireworks','big boom','catastrophic','demolish','shatter','disintegrate']},
  {id:'godmode_glow', action:'godmode glow', patterns:['glow','make it glow','shine','radiate','illuminate','light up','luminous','luminescent','emit light','glowing'],
   extras:['make it shiny','add glow','neon','bright','bioluminescent','sparkle','shimmer','gleam','twinkle','aura']},
  {id:'godmode_clone', action:'godmode clone', patterns:['clone','duplicate','copy','multiply','replicate','mirror','clone it','make a copy','double it'],
   extras:['make 10 copies','clone 5 times','duplicate it','copy paste','reproduce','spawn copies','lots of them','more of those','give me 10']},
  {id:'godmode_orbit', action:'godmode orbit', patterns:['orbit','circle','revolve','go around','spiral','loop','circulate','circumnavigate'],
   extras:['make it orbit','orbit around','circle around','go in circles','spin around it','revolve around']},
  {id:'godmode_follow', action:'godmode follow', patterns:['follow','follow me','chase','track','pursue','tail','shadow','stalk','accompany'],
   extras:['make it follow me','come with me','follow the player','chase me','tag along','walk with me','companion']},
  {id:'godmode_portal', action:'godmode portal', patterns:['portal','warp','teleport','gateway','rift','wormhole','dimensional door','stargate','vortex'],
   extras:['create a portal','open a portal','make a portal','teleportation','warp gate','dimensional rift','magic portal','portal to','gateway to']},
  {id:'godmode_forcefield', action:'godmode forcefield', patterns:['force field','shield','barrier','dome','bubble','protection','ward','energy shield'],
   extras:['protect me','create a barrier','energy dome','defensive shield','magic barrier','invincible','god mode','immortal']},
  {id:'godmode_earthquake', action:'godmode earthquake', patterns:['earthquake','quake','tremor','shake','shockwave','seismic','rumble','ground shake','earth shake'],
   extras:['shake everything','make the ground shake','seismic activity','ground tremor','shake it up','rock the world','tectonic','earth shatter']},
  {id:'godmode_lightning', action:'godmode lightning', patterns:['lightning','thunder','thunderbolt','bolt','electric','zap','shock','electrify','smite','strike'],
   extras:['lightning strike','call lightning','thunder and lightning','electrocute','zap it','smite them','call down lightning','electric storm','thor','zeus']},
  {id:'godmode_fire', action:'godmode fire', patterns:['fire','flames','burn','ignite','blaze','inferno','set on fire','combust','incinerate'],
   extras:['set it on fire','burn it','add fire','fire everywhere','wall of fire','ring of fire','fire trail','flamethrower','make it burn']},
  {id:'godmode_ice', action:'godmode ice', patterns:['ice','freeze','frozen','frost','glacial','crystal ice','icicle','ice spike','permafrost'],
   extras:['freeze it','turn to ice','ice everything','frozen world','ice blast','deep freeze','absolute zero','cryogenic']},
  {id:'godmode_rainbow', action:'godmode rainbow', patterns:['rainbow','colorful','multicolor','prismatic','chromatic','spectrum','all colors','color changing'],
   extras:['make it rainbow','rainbow colors','all the colors','color cycle','disco','rave','psychedelic','trippy','kaleidoscope']},
  {id:'godmode_slow', action:'godmode slow', patterns:['slow motion','slow mo','bullet time','matrix','time slow','slow down time','slow everything'],
   extras:['slow it down','slowmo','slow time','freeze time','pause time','time stop','slow the world']},
  {id:'godmode_fast', action:'godmode fast', patterns:['speed up','fast forward','hyper speed','turbo','accelerate','fast','faster','warp speed','ludicrous speed'],
   extras:['go fast','speed it up','double speed','triple speed','max speed','fast time','rush','blitz']},
  {id:'godmode_giant', action:'godmode giant', patterns: SYN.big.map(b => `make it ${b}`),
   extras:['size of a building','towering','kaiju','colossus','make me giant','titan size','skyscraper size','enormous']},
  {id:'godmode_tiny', action:'godmode tiny', patterns: SYN.small.map(s => `make it ${s}`),
   extras:['ant size','microscopic','make me tiny','shrink ray','fun size','dollhouse','miniworld']},
];

// ═══════════════════════════════════════════
// PATTERN EXPANSION & MATCHING
// ═══════════════════════════════════════════

// Build flat lookup: phrase → action
const _phraseMap = new Map();
let _totalPhrases = 0;

for (const intent of INTENTS) {
  const allPhrases = [...(intent.patterns || []), ...(intent.extras || [])];
  for (const phrase of allPhrases) {
    const normalized = phrase.toLowerCase().trim();
    if (normalized && !_phraseMap.has(normalized)) {
      _phraseMap.set(normalized, { action: intent.action, id: intent.id });
      _totalPhrases++;
    }
  }
}

console.log(`[VoiceCommands] ${_totalPhrases} unique phrases mapped to ${INTENTS.length} intents`);

// Fuzzy match: find best matching intent for input

// ═══════════════════════════════════════════
// LONG-FORM NATURAL LANGUAGE PHRASES
// Conversational commands people actually say
// ═══════════════════════════════════════════
const LONG_PHRASES = {
  // CHARACTER/PLAYER
  'characters': [
    'what characters do you have', 'show me all the characters i can play as',
    'i want to see the character options', 'let me pick a different character',
    'can i change my character', 'who are the playable characters',
    'show me the character selection screen', 'i want to choose a new player',
    'pull up the character menu for me', 'what heroes can i play as',
    'give me the roster of characters', 'open up character select please',
    'i need to pick a character first', 'show me who i can be in this game',
    'let me see the character roster', 'which characters are available',
    'i want to switch to a different character', 'can you show me the player options',
  ],
  // WEAPONS
  'weapons': [
    'show me all the weapons', 'i need a weapon', 'what weapons do you have',
    'give me something to fight with', 'i want to see the weapon options',
    'pull up the weapons menu', 'show me swords and axes', 'i need a sword',
    'let me pick a weapon', 'what kind of weapons can i use',
    'show me the weapon gallery', 'i want to browse weapons',
    'can i see the available weapons', 'give me the weapon menu please',
    'open the weapons section', 'i want to add a weapon to my scene',
    'show me all the swords you have', 'i need a shield',
    'what kind of armor and weapons do you have', 'pull up the armory',
  ],
  // BUILDINGS
  'buildings': [
    'show me all the buildings', 'i need a house', 'what buildings do you have',
    'let me see the building options', 'show me houses and structures',
    'i want to add a building to my scene', 'pull up the buildings menu',
    'what kind of houses do you have', 'show me castles',
    'i need a building for my town', 'can i see the available structures',
    'give me the architecture menu', 'let me pick a building',
    'show me medieval buildings', 'i want to build a city',
    'what structures can i place', 'open the buildings gallery',
    'show me all the houses and towers', 'i need some structures for my world',
  ],
  // VEHICLES
  'vehicles': [
    'show me all the vehicles', 'i need a car', 'what vehicles do you have',
    'give me a ride', 'show me cars and trucks', 'i want to add a vehicle',
    'pull up the vehicle menu', 'let me see the transport options',
    'show me boats and ships', 'i need something to drive',
    'what kind of vehicles can i use', 'open the vehicles gallery',
  ],
  // ANIMALS
  'animals': [
    'show me all the animals', 'i want to add some animals',
    'what animals do you have', 'give me some creatures',
    'show me the wildlife options', 'i need a pet', 'add some animals to my scene',
    'let me see the creature gallery', 'show me dragons and monsters',
    'what kind of animals can i place', 'i want some fish',
    'show me the animal models', 'can i add a dragon',
  ],
  // TREES/PLANTS
  'trees': [
    'show me all the trees', 'i need some trees', 'add trees to my scene',
    'what plants do you have', 'show me vegetation options',
    'i want to add some nature', 'give me some bushes and flowers',
    'let me see the plant gallery', 'show me forest elements',
    'i need trees and plants for my world', 'what kind of trees do you have',
    'add some greenery', 'show me the nature models',
  ],
  // ROCKS
  'rocks': [
    'show me all the rocks', 'i need some rocks', 'what stones do you have',
    'show me boulders and crystals', 'add some rocks to my scene',
    'let me see the mineral gallery', 'i want some crystals',
    'give me some rocks and stones', 'show me the geology options',
  ],
  // FURNITURE
  'furniture': [
    'show me all the furniture', 'i need some furniture',
    'what furniture do you have', 'show me tables and chairs',
    'let me see the interior options', 'i want to furnish a room',
    'give me some indoor decorations', 'add furniture to my building',
    'show me beds and shelves', 'pull up the furniture gallery',
  ],
  // FOOD/ITEMS
  'food': [
    'show me all the items', 'i need some items', 'what items do you have',
    'show me food and potions', 'let me see the loot options',
    'i want to add some collectibles', 'give me some treasure chests',
    'show me barrels and crates', 'add some items to my scene',
    'what kind of loot can i place', 'show me the consumables',
  ],
  // DUNGEON
  'dungeon': [
    'show me dungeon stuff', 'i need dungeon decorations',
    'what dungeon items do you have', 'show me torches and skulls',
    'let me see the dungeon gallery', 'i want to build a dungeon',
    'give me some dark fantasy stuff', 'add dungeon elements',
    'show me traps and chains', 'pull up the dungeon menu',
  ],
  // SCI-FI
  'scifi': [
    'show me sci-fi stuff', 'i need some futuristic items',
    'what sci-fi models do you have', 'show me space stuff',
    'let me see the cyber options', 'i want futuristic buildings',
    'give me some tech items', 'add some sci-fi elements',
    'show me robots and drones', 'pull up the sci-fi gallery',
  ],
  // NATURE/SURVIVAL
  'nature': [
    'show me nature stuff', 'i need camping gear',
    'what survival items do you have', 'show me outdoor equipment',
    'let me see the survival gallery', 'i want to build a campsite',
    'give me some wilderness items', 'add nature elements to my scene',
  ],
  // LIBRARY/BROWSE ALL
  'browse': [
    'show me everything', 'open the asset library', 'let me browse all models',
    'show me all the categories', 'what do you have', 'show me the full library',
    'i want to browse all the 3d models', 'pull up the model library',
    'open the asset store', 'let me see everything you have',
    'show me all available assets', 'what can i add to my scene',
    'give me the full catalog', 'i want to see all the options',
    'open the model browser', 'show me the complete asset library',
    'browse the 3d model collection', 'what models are available',
  ],
  // ANIMATIONS
  'animations': [
    'show me the animations', 'what animations do you have',
    'i want to add an animation', 'let me see the animation options',
    'how do i animate something', 'show me animation effects',
    'can i make this move', 'add some movement to this object',
    'i want this to spin', 'make it bounce', 'make it float',
    'how do i make things move', 'show me the animation gallery',
    'apply an animation to this', 'animate the last thing i placed',
  ],
  // PLAY MODE
  'play': [
    'let me play the game', 'start the game', 'i want to play now',
    'enter game mode', 'put me in the game', 'i want to walk around',
    'let me explore', 'start playing', 'enter the world',
    'switch to play mode', 'i want to test my game',
  ],
  // TERRAIN
  'terrain mountains': [
    'add some mountains', 'i want mountains in my scene', 'create a mountain range',
    'give me some big mountains', 'add terrain with mountains',
    'make a mountainous landscape', 'i need a mountain background',
  ],
  'terrain hills': [
    'add some hills', 'make rolling hills', 'create a hilly landscape',
    'i want gentle hills', 'add some rolling terrain',
  ],
  'terrain canyon': [
    'add a canyon', 'create a deep canyon', 'make a grand canyon',
    'i want a canyon landscape', 'dig a canyon in the ground',
  ],
  'terrain volcano': [
    'add a volcano', 'create a volcanic landscape', 'make a volcano',
    'i want a volcano in my scene', 'add an erupting volcano',
  ],
  // WEATHER
  'rain': [
    'make it rain', 'add rain to the scene', 'i want it to rain',
    'turn on the rain', 'start a rainstorm', 'add some rain please',
    'can you make it rain', 'give me some rainfall',
  ],
  'snow': [
    'make it snow', 'add snow', 'i want a winter scene',
    'turn on the snow', 'let it snow', 'add snowfall',
    'make a snowy scene', 'create a winter wonderland',
  ],
  'fog': [
    'add fog', 'make it foggy', 'i want a misty atmosphere',
    'turn on the fog', 'add some mist', 'create a foggy scene',
  ],
  // SCENE BUILDING
  'build a village': [
    'build me a medieval village', 'create a village scene',
    'make a small town', 'i want a village with houses',
    'build a fantasy village', 'create a town for me',
    'set up a medieval town', 'make a village scene with buildings and people',
  ],
  'build a forest': [
    'build me a forest', 'create a dense forest', 'make a woodland scene',
    'i want a forest with lots of trees', 'fill the scene with trees',
    'create a magical forest', 'build an enchanted forest',
  ],
  'clear': [
    'clear everything', 'remove all objects', 'start fresh',
    'clean the scene', 'delete everything', 'wipe the slate clean',
    'clear the whole scene', 'remove everything and start over',
    'i want to start from scratch', 'get rid of everything',
  ],
  // TIME/LIGHTING
  'night': [
    'make it night time', 'set the time to night', 'i want a night scene',
    'turn off the lights', 'make it dark', 'switch to nighttime',
    'create a moonlit scene', 'set it to midnight',
  ],
  'day': [
    'make it daytime', 'set the time to day', 'bring back the sun',
    'turn on the lights', 'make it bright', 'switch to daytime',
    'create a sunny scene', 'set it to noon',
  ],
  'sunset': [
    'give me a sunset', 'make it sunset', 'set the time to evening',
    'create a golden hour scene', 'i want a beautiful sunset',
    'make the sky orange and pink',
  ],
  // SCREENSHOTS/SHARING
  'screenshot': [
    'take a screenshot', 'capture this scene', 'take a picture',
    'save a screenshot', 'snap a photo', 'capture this moment',
    'take a photo of my creation', 'screenshot this please',
  ],
  // HELP
  'help': [
    'what can i do', 'help me', 'show me the commands',
    'what commands are available', 'how do i use this',
    'teach me how to use this', 'give me a tutorial',
    'i dont know what to do', 'show me how this works',
    'what are my options', 'how does this work',
  ],
};

// Register all long phrases
Object.entries(LONG_PHRASES).forEach(([intent, phrases]) => {
  phrases.forEach(p => {
    _phraseMap.set(p.toLowerCase(), { action: intent, id: intent });
  });
});

export function matchIntent(input) {
  const lower = input.toLowerCase().trim();
  
  // 1. Exact match
  if (_phraseMap.has(lower)) return _phraseMap.get(lower);
  
  // 2. Substring match (input contains a known phrase)
  let bestMatch = null;
  let bestLen = 0;
  for (const [phrase, intent] of _phraseMap) {
    if (lower.includes(phrase) && phrase.length > bestLen) {
      bestMatch = intent;
      bestLen = phrase.length;
    }
  }
  if (bestMatch && bestLen >= 3) return bestMatch;
  
  // 3. Phrase contains input
  for (const [phrase, intent] of _phraseMap) {
    if (phrase.includes(lower) && lower.length >= 3) return intent;
  }
  
  // 4. Word overlap scoring
  const inputWords = new Set(lower.split(/\s+/));
  let topScore = 0;
  let topIntent = null;
  for (const [phrase, intent] of _phraseMap) {
    const phraseWords = phrase.split(/\s+/);
    let score = 0;
    for (const w of phraseWords) {
      if (inputWords.has(w)) score += w.length;
    }
    if (score > topScore) { topScore = score; topIntent = intent; }
  }
  if (topScore >= 4) return topIntent;
  
  return null; // No match — fall through to godmode/AI
}

// ═══════════════════════════════════════════
// VOICE ENGINE — Web Speech API
// ═══════════════════════════════════════════

let _recognition = null;
let _isListening = false;
let _onCommand = null;
let _onTranscript = null;

export function initVoice(onCommand, onTranscript) {
  _onCommand = onCommand;
  _onTranscript = onTranscript;
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('[Voice] Speech Recognition not supported');
    return false;
  }
  
  _recognition = new SpeechRecognition();
  _recognition.continuous = true;
  _recognition.interimResults = true;
  _recognition.lang = 'en-US';
  _recognition.maxAlternatives = 3;
  
  _recognition.onresult = (event) => {
    let finalTranscript = '';
    let interimTranscript = '';
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }
    
    if (_onTranscript) _onTranscript(interimTranscript, false);
    
    if (finalTranscript) {
      if (_onTranscript) _onTranscript(finalTranscript, true);
      
      // Match to intent
      const intent = matchIntent(finalTranscript);
      if (intent && _onCommand) {
        _onCommand(intent.action, finalTranscript, intent.id);
      } else if (_onCommand) {
        // Pass raw to godmode
        _onCommand(finalTranscript, finalTranscript, 'godmode_raw');
      }
    }
  };
  
  _recognition.onerror = (event) => {
    console.warn('[Voice] Error:', event.error);
    if (event.error === 'no-speech' || event.error === 'aborted') {
      // Auto-restart
      if (_isListening) {
        setTimeout(() => { try { _recognition.start(); } catch(e) {} }, 100);
      }
    }
  };
  
  _recognition.onend = () => {
    if (_isListening) {
      setTimeout(() => { try { _recognition.start(); } catch(e) {} }, 100);
    }
  };
  
  return true;
}

export function startListening() {
  if (!_recognition) return false;
  _isListening = true;
  try { _recognition.start(); } catch(e) {}
  return true;
}

export function stopListening() {
  _isListening = false;
  if (_recognition) try { _recognition.stop(); } catch(e) {}
}

export function isListening() { return _isListening; }

// ═══════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════
export function getStats() {
  return {
    totalPhrases: _totalPhrases,
    totalIntents: INTENTS.length,
    categories: {
      objects: INTENTS.filter(i => i.id.startsWith('add_')).length,
      movement: INTENTS.filter(i => i.id.startsWith('move_')).length,
      colors: INTENTS.filter(i => i.id.startsWith('color_')).length,
      weather: INTENTS.filter(i => i.id.startsWith('weather_')).length,
      terrain: INTENTS.filter(i => i.id.startsWith('terrain_')).length,
      animation: INTENTS.filter(i => i.id.startsWith('animate_')).length,
      godmode: INTENTS.filter(i => i.id.startsWith('godmode_')).length,
      building: INTENTS.filter(i => i.id.startsWith('build_')).length,
    }
  };
}

// ═══════════════════════════════════════════
// EXPANSION PACK — Additional 30K+ phrases
// ═══════════════════════════════════════════

// More objects with full synonym expansion
const EXTRA_OBJECTS = {
  dragon: ['dragon','drake','wyrm','wyvern','serpent','fire breather','flying lizard','beast of fire'],
  wolf: ['wolf','wolves','dire wolf','timber wolf','werewolf','hound','wild dog'],
  bear: ['bear','grizzly','polar bear','brown bear','cave bear','black bear'],
  deer: ['deer','stag','elk','moose','doe','buck','reindeer','caribou'],
  bird: ['bird','eagle','hawk','falcon','raven','crow','owl','parrot','seagull','pigeon','phoenix','sparrow'],
  fish: ['fish','salmon','trout','bass','shark','whale','dolphin','cod','tuna','swordfish'],
  spider: ['spider','tarantula','black widow','arachnid','web spinner'],
  snake: ['snake','serpent','cobra','python','viper','anaconda','rattlesnake'],
  cat: ['cat','kitten','feline','tabby','persian','siamese','panther','lion','tiger','leopard','jaguar','cheetah'],
  dog: ['dog','puppy','canine','hound','mutt','retriever','shepherd','bulldog','poodle','husky','corgi','labrador'],
  boat: ['boat','ship','vessel','yacht','canoe','kayak','raft','sailboat','rowboat','gondola','frigate','galleon','warship','pirate ship'],
  airplane: ['airplane','plane','jet','aircraft','biplane','helicopter','chopper','airship','blimp','zeppelin','drone','ufo','spaceship','rocket'],
  train: ['train','locomotive','railway','railroad','steam engine','bullet train','subway','metro','trolley','monorail'],
  table: ['table','desk','workbench','counter','dining table','coffee table','round table','picnic table'],
  door: ['door','gate','entrance','doorway','portal','arch','archway','gateway'],
  window: ['window','glass','pane','skylight','porthole','bay window','stained glass'],
  stairs: ['stairs','staircase','steps','ladder','ramp','escalator','spiral staircase'],
  lamp: ['lamp','light','lantern','chandelier','spotlight','floodlight','streetlight','neon light','candle','candelabra'],
  bench: ['bench','seat','pew','park bench','stone bench','wooden bench'],
  statue: ['statue','sculpture','monument','figurine','bust','totem','idol','carving','effigy'],
  fountain: ['fountain','water fountain','pond','birdbath','spring','geyser','well'],
  flag: ['flag','banner','pennant','standard','ensign','streamer','windsock'],
  tent: ['tent','canopy','pavilion','marquee','camping tent','circus tent','teepee','yurt'],
  wagon: ['wagon','cart','carriage','chariot','stagecoach','buggy','rickshaw','wheelbarrow'],
  cannon: ['cannon','catapult','trebuchet','ballista','turret','artillery','mortar','siege weapon'],
  potion: ['potion','elixir','tonic','brew','vial','flask','serum','antidote','medicine','remedy'],
  scroll: ['scroll','book','tome','grimoire','manuscript','parchment','map','blueprint','letter','note'],
  coin: ['coin','gold','treasure','loot','money','gems','jewels','diamonds','rubies','emeralds','sapphires','crystals'],
  armor: ['armor','armour','plate armor','chainmail','leather armor','shield','helmet','gauntlets','boots','greaves','breastplate','cuirass'],
  key: ['key','lockpick','skeleton key','golden key','master key','keycard','passkey'],
  rope: ['rope','chain','wire','cable','vine','tendril','string','thread','lasso'],
  crate: ['crate','box','package','cargo','shipping container','wooden box','supply crate','ammo box'],
  pillar: ['pillar','column','obelisk','monolith','totem pole','support beam','marble column','stone pillar'],
  crystal: ['crystal','gem','jewel','diamond','amethyst','quartz','geode','prism','shard','mineral'],
  portal_obj: ['portal','warp gate','stargate','dimensional rift','teleporter','wormhole','magic circle','summoning circle','pentagram'],
  trap: ['trap','spike trap','pit trap','bear trap','snare','tripwire','pressure plate','dart trap','fire trap','ice trap','poison trap'],
  chest_mimic: ['mimic','treasure mimic','fake chest','trap chest','animated chest'],
  skeleton: ['skeleton','bones','skull','ribcage','fossil','remains','skeletal warrior','bone pile'],
  ghost: ['ghost','spirit','phantom','wraith','specter','poltergeist','banshee','apparition','shade','haunt'],
  golem: ['golem','elemental','construct','automaton','mech','robot','iron golem','stone golem','ice golem','fire golem'],
  merchant: ['merchant','shopkeeper','vendor','trader','peddler','salesman','dealer','broker','innkeeper','bartender','blacksmith'],
  king: ['king','queen','prince','princess','emperor','empress','monarch','ruler','lord','lady','noble','duke','duchess','count','baron'],
  wizard: ['wizard','mage','sorcerer','sorceress','witch','warlock','necromancer','druid','shaman','enchanter','alchemist','conjurer'],
  thief: ['thief','rogue','assassin','ninja','spy','bandit','pirate','outlaw','burglar','pickpocket','smuggler','highwayman'],
  healer: ['healer','cleric','priest','priestess','monk','nun','medic','doctor','nurse','herbalist','apothecary','sage'],
};

// Generate intents for all extra objects
const EXTRA_INTENTS = [];
for (const [key, syns] of Object.entries(EXTRA_OBJECTS)) {
  EXTRA_INTENTS.push({
    id: `add_${key}`,
    action: `add ${key}`,
    patterns: SYN.add.flatMap(v => syns.map(o => `${v} ${o}`)),
    extras: syns.flatMap(o => [
      `i want a ${o}`, `give me a ${o}`, `i need a ${o}`, `can you add a ${o}`,
      `put down a ${o}`, `how about a ${o}`, `throw in a ${o}`, `we need a ${o}`,
      `get me a ${o}`, `please add a ${o}`, `yo add a ${o}`, `drop a ${o}`,
      `where's my ${o}`, `bring me a ${o}`, `summon a ${o}`, `conjure a ${o}`,
      `i'd love a ${o}`, `let's add a ${o}`, `create a ${o} please`,
      `one ${o} please`, `another ${o}`, `more ${o}s`,
    ]),
  });
}

// === QUANTITY COMMANDS === (add N of X)
const QUANTITIES = [2,3,4,5,6,7,8,9,10,12,15,20,25,30,50,100];
const QTY_WORDS = {'2':'two','3':'three','4':'four','5':'five','6':'six','7':'seven','8':'eight','9':'nine','10':'ten','12':'twelve','15':'fifteen','20':'twenty','25':'twenty five','30':'thirty','50':'fifty','100':'a hundred'};
const QTY_OBJECTS = ['tree','rock','bush','flower','enemy','npc','house','barrel','torch','crate','crystal','coin','pillar','statue','fence'];

for (const obj of QTY_OBJECTS) {
  const objSyns = SYN[obj] || EXTRA_OBJECTS[obj] || [obj];
  for (const n of QUANTITIES) {
    const nw = QTY_WORDS[String(n)] || String(n);
    EXTRA_INTENTS.push({
      id: `add_${n}_${obj}`,
      action: `add ${n} ${obj}`,
      patterns: objSyns.flatMap(o => [
        `add ${n} ${o}s`, `add ${nw} ${o}s`, `spawn ${n} ${o}s`, `create ${n} ${o}s`,
        `place ${n} ${o}s`, `give me ${n} ${o}s`, `i want ${n} ${o}s`,
        `scatter ${n} ${o}s`, `drop ${n} ${o}s`, `${n} ${o}s please`,
        `${nw} ${o}s`, `put ${n} ${o}s`, `generate ${n} ${o}s`,
      ]),
    });
  }
}

// === ADVANCED BUILDING COMMANDS ===
const BUILDING_PHRASES = {
  'build a dungeon': ['dungeon','labyrinth','maze','catacombs','underground','sewers','tomb','crypt','lair','den','cavern dungeon'],
  'build a beach': ['beach','coast','shore','seaside','tropical beach','sandy beach','ocean shore','coastline','bay','cove'],
  'build a farm': ['farm','farmland','ranch','plantation','homestead','barnyard','cropland','orchard','vineyard','garden'],
  'build a market': ['market','bazaar','marketplace','shopping district','trade post','merchant quarter','souk','fair','flea market','mall'],
  'build a arena': ['arena','colosseum','stadium','fighting pit','battle arena','gladiator arena','combat zone','thunderdome','ring'],
  'build a temple': ['temple','shrine','cathedral','church','chapel','monastery','abbey','pagoda','mosque','sanctuary','holy place'],
  'build a prison': ['prison','jail','dungeon','cell','cage','penitentiary','gulag','stockade','lockup','detention','asylum'],
  'build a port': ['port','harbor','dock','marina','pier','wharf','shipyard','boatyard','jetty','boardwalk','waterfront'],
  'build a camp': ['camp','campsite','campground','outpost','base camp','military camp','refugee camp','nomad camp','encampment'],
  'build a mine': ['mine','quarry','cave','cavern','dig site','excavation','shaft','tunnel','mineshaft','ore deposit'],
  'build a swamp': ['swamp','marsh','bog','wetland','bayou','fen','mire','mangrove','everglades','murky water'],
  'build a floating island': ['floating island','sky island','cloud kingdom','airborne','levitating land','sky castle','floating rock','skylands'],
  'build a ruins': ['ruins','ancient ruins','lost city','abandoned','decrepit','crumbling','forgotten','relic','remains','aftermath'],
  'build a garden': ['garden','zen garden','botanical','greenhouse','conservatory','arboretum','hedge maze','flower garden','secret garden'],
  'build a laboratory': ['laboratory','lab','workshop','factory','forge','foundry','alchemy lab','mad scientist','research facility'],
  'build a library': ['library','archive','study','book room','hall of records','knowledge','scriptorium','reading room'],
  'build a throne room': ['throne room','royal court','great hall','banquet hall','audience chamber','kings court','palace interior'],
  'build a treasure room': ['treasure room','vault','treasury','gold room','dragon hoard','loot room','treasure trove','riches'],
  'build a graveyard': ['cemetery','burial ground','necropolis','memorial','mausoleum','ossuary','bone yard','resting place'],
  'build a battlefield': ['battlefield','war zone','combat area','no mans land','trenches','front line','siege','warground'],
  'build a racetrack': ['racetrack','race course','circuit','speedway','track','drag strip','rally course','go kart track'],
  'build a park': ['park','playground','recreation area','green space','public garden','courtyard','plaza','town square','promenade'],
  'build a bridge scene': ['bridge scene','crossing','river crossing','ravine bridge','canyon bridge','rope bridge','drawbridge','aqueduct'],
  'build a waterfall': ['waterfall','cascade','falls','water feature','river falls','cliff waterfall','niagara','fountain garden'],
  'build a volcano scene': ['active volcano','volcanic landscape','lava field','eruption','volcanic island','fire mountain','magma pool'],
  'build a cyberpunk alley': ['cyberpunk','neon alley','tech street','future slum','blade runner','ghost in shell','akira','cyber city','neon city'],
  'build a pirate cove': ['pirate cove','pirate bay','smugglers cove','pirate hideout','buccaneer bay','pirate island','treasure island'],
  'build a dragon lair': ['dragon lair','dragon cave','dragon den','wyrm nest','drake roost','dragon mountain','hoard cave'],
  'build a wizard tower': ['wizard tower','mage tower','sorcerer spire','arcane tower','magic tower','enchanted tower','mystic spire'],
  'build a space colony': ['space colony','mars base','moon base','space station','orbital','asteroid base','space habitat','colony ship'],
};

for (const [action, syns] of Object.entries(BUILDING_PHRASES)) {
  EXTRA_INTENTS.push({
    id: `build_${action.replace(/\s/g,'_')}`,
    action: action,
    patterns: syns.flatMap(s => [
      `build a ${s}`, `create a ${s}`, `make a ${s}`, `generate a ${s}`,
      `i want a ${s}`, `give me a ${s}`, `design a ${s}`, `construct a ${s}`,
      `set up a ${s}`, `lets make a ${s}`, `lets build a ${s}`, `how about a ${s}`,
      `${s} scene`, `${s} world`, `${s} level`, `${s} map`,
      `build ${s}`, `create ${s}`, `make ${s}`, `${s} please`,
      `i need a ${s}`, `can you build a ${s}`, `build me a ${s}`,
    ]),
  });
}

// === CRAFTING ===
const CRAFTABLE = {
  'iron sword':['iron sword','basic sword','simple sword','crude sword','steel sword','metal sword'],
  'golden sword':['golden sword','gold sword','fancy sword','royal sword','gilded sword','ornate sword'],
  'fire sword':['fire sword','flame sword','burning sword','inferno blade','ember sword','blazing sword'],
  'ice sword':['ice sword','frost sword','frozen sword','glacial sword','cryo sword','winter blade'],
  'health potion':['health potion','healing potion','hp potion','red potion','life potion','restore health','heal potion','cure','medicine'],
  'mana potion':['mana potion','magic potion','mp potion','blue potion','arcane potion','energy potion','spirit potion'],
  'speed potion':['speed potion','haste potion','swift potion','quickness potion','agility potion','dash potion'],
  'strength potion':['strength potion','power potion','might potion','force potion','muscle potion','buff potion'],
  'shield':['wooden shield','iron shield','steel shield','tower shield','magic shield','enchanted shield'],
  'armor':['iron armor','steel armor','plate armor','chainmail','leather armor','magic armor','enchanted armor'],
  'bow':['wooden bow','hunting bow','longbow','composite bow','enchanted bow','fire bow','ice bow'],
  'arrow':['arrows','fire arrows','ice arrows','poison arrows','explosive arrows','magic arrows','steel arrows'],
  'bomb':['bomb','explosive','grenade','dynamite','fire bomb','smoke bomb','flash bomb','sticky bomb'],
  'pickaxe':['pickaxe','mining pick','steel pickaxe','enchanted pickaxe','diamond pickaxe'],
  'fishing rod':['fishing rod','fishing pole','angler rod','enchanted rod','magic fishing rod'],
  'torch_item':['torch','lantern','glowstick','flare','lamp','candle','flashlight'],
  'rope_item':['rope','grappling hook','lasso','climbing rope','chain','wire'],
  'tent_item':['tent','shelter','lean-to','bivouac','camp','sleeping bag'],
  'food':['food','bread','meat','stew','soup','apple','cheese','fish','cooked meat','roasted chicken','pie','cake','mushroom stew'],
};

for (const [item, syns] of Object.entries(CRAFTABLE)) {
  EXTRA_INTENTS.push({
    id: `craft_${item.replace(/\s/g,'_')}`,
    action: `craft ${item}`,
    patterns: syns.flatMap(s => [
      `craft ${s}`, `craft a ${s}`, `make ${s}`, `make a ${s}`,
      `build ${s}`, `forge ${s}`, `create ${s}`, `brew ${s}`,
      `cook ${s}`, `assemble ${s}`, `construct ${s}`, `smith ${s}`,
      `i want to craft ${s}`, `can i craft ${s}`, `how do i make ${s}`,
      `give me ${s}`, `i need ${s}`, `get ${s}`, `produce ${s}`,
    ]),
  });
}

// === NPC INTERACTION ===
const NPC_ACTIONS = {
  'talk':['talk','speak','chat','converse','dialogue','conversation','greet','hello','hey','hi','excuse me','whats up','hail','yo','sup'],
  'trade':['trade','buy','sell','purchase','shop','store','market','exchange','barter','browse','whats for sale','show me your wares','open shop'],
  'quest':['quest','mission','task','job','assignment','adventure','what do you need','any work','got a job','help needed','bounty','contract'],
  'recruit':['recruit','hire','join','follow me','come with me','join my party','be my companion','ally','partner','team up','accompany'],
  'dismiss':['dismiss','leave','go away','goodbye','farewell','see ya','later','bye','get lost','you are free','release','fire'],
  'give':['give','hand over','offer','present','donate','gift','share','pass','deliver','pay','tip','bribe'],
  'steal':['steal','pickpocket','swipe','snatch','take','loot','pilfer','filch','rob','nick','pocket'],
  'attack_npc':['attack','fight','challenge','duel','confront','assault','engage','provoke','aggro','pick a fight','square up'],
  'heal_npc':['heal','cure','mend','restore','revive','resurrect','bandage','treat','patch up','first aid','medicine'],
  'command':['command','order','instruct','direct','tell','ask','request','send','deploy','assign','task','patrol','guard','stand here','go there','wait here','stay','come','follow','stop','hold position'],
};

for (const [action, phrases] of Object.entries(NPC_ACTIONS)) {
  EXTRA_INTENTS.push({
    id: `npc_${action}`,
    action: `npc ${action}`,
    patterns: phrases.flatMap(p => [
      p, `${p} to npc`, `${p} with npc`, `${p} the npc`,
      `i want to ${p}`, `let me ${p}`, `can i ${p}`,
      `${p} them`, `${p} him`, `${p} her`, `${p} it`,
    ]),
  });
}

// === CHARACTER STATS & UPGRADES ===
const STATS = ['strength','vitality','endurance','agility','luck','intelligence','wisdom','charisma','dexterity','perception','constitution','speed','defense','attack','magic','stamina'];
for (const stat of STATS) {
  EXTRA_INTENTS.push({
    id: `upgrade_${stat}`,
    action: `upgrade ${stat}`,
    patterns: [
      `upgrade ${stat}`,`level up ${stat}`,`increase ${stat}`,`boost ${stat}`,
      `improve ${stat}`,`raise ${stat}`,`add to ${stat}`,`put points in ${stat}`,
      `invest in ${stat}`,`more ${stat}`,`${stat} up`,`buff ${stat}`,
      `enhance ${stat}`,`strengthen ${stat}`,`max ${stat}`,`pump ${stat}`,
    ],
  });
}

// === SOUND & MUSIC ===
const AUDIO_COMMANDS = {
  'play music':['play music','music on','background music','soundtrack','bgm','tunes','play a song','start music','jam','beats'],
  'stop music':['stop music','music off','silence','mute music','quiet','turn off music','no music','hush','shh','shut up'],
  'volume up':['volume up','louder','turn up','increase volume','more volume','crank it','blast it','max volume'],
  'volume down':['volume down','quieter','turn down','decrease volume','less volume','lower volume','soften'],
  'battle music':['battle music','combat music','fight music','epic music','intense music','boss music','action music'],
  'calm music':['calm music','peaceful music','ambient','relaxing','chill','serene','tranquil','meditation','zen','lo-fi'],
  'horror music':['horror music','scary music','creepy music','tense music','suspense','ominous','dark music','eerie'],
  'play sound':['play sound','sound effect','sfx','audio','noise'],
  'sword sound':['sword clash','sword swing','blade sound','metal clang','weapon sound'],
  'explosion sound':['explosion sound','boom','blast sound','kaboom sound','bang'],
  'footsteps':['footsteps','walking sound','running sound','step sound'],
};

for (const [action, phrases] of Object.entries(AUDIO_COMMANDS)) {
  EXTRA_INTENTS.push({
    id: `audio_${action.replace(/\s/g,'_')}`,
    action: action,
    patterns: phrases.flatMap(p => [p, `${p} please`, `can you ${p}`, `i want ${p}`]),
  });
}

// === CONVERSATIONAL / NATURAL PHRASES ===
const CONVERSATIONAL = [
  {id:'greeting', action:'help', patterns:['hello','hey','hi','whats up','howdy','yo','sup','greetings','good morning','good evening','good afternoon','hey there','hi there','hola','bonjour','whats good','how are you','hey crate','hey engine','yo crate']},
  {id:'thanks', action:'noop', patterns:['thanks','thank you','thx','ty','appreciate it','cheers','nice','cool','awesome','great','perfect','wonderful','excellent','amazing','fantastic','brilliant','sweet','dope','fire','lit','sick','rad','epic','legendary','clutch','goated']},
  {id:'confused', action:'help', patterns:['what','huh','i dont understand','im confused','what do you mean','how','why','what happened','what is this','whats going on','im lost','help me','explain','i dont get it','what the','bruh']},
  {id:'redo', action:'undo', patterns:['redo','do it again','again','one more time','repeat','retry','try again','once more','do over','take two','another one','encore','more','keep going','continue','next']},
  {id:'yes', action:'confirm', patterns:['yes','yeah','yep','yup','sure','ok','okay','alright','affirmative','correct','right','exactly','indeed','absolutely','definitely','of course','bet','lets go','do it','send it','go ahead','proceed','confirmed','roger','copy that','10-4']},
  {id:'no', action:'cancel', patterns:['no','nah','nope','no thanks','cancel','stop','abort','nevermind','forget it','scratch that','dont','nah fam','negative','no way','pass','skip','nvm','not that']},
  {id:'surprise_me', action:'random scene', patterns:['surprise me','random','anything','whatever','you choose','you decide','dealers choice','idk','i dont know','something cool','something random','do whatever','go crazy','go wild','show me something','amaze me','blow my mind','impress me','your call','freestyle','wing it']},
];

CONVERSATIONAL.forEach(c => EXTRA_INTENTS.push(c));

// === MULTIPLAYER / SOCIAL ===
const MULTIPLAYER = {
  'share':['share','share this','send to friend','export','publish','upload','post','show others','share my creation','show the world'],
  'invite':['invite','invite friend','add player','multiplayer','coop','co-op','join game','host game','create lobby','start server','party up','squad up','team up'],
  'voice chat':['voice chat','voice on','mic on','unmute','talk to players','open mic','push to talk','voice channel','chat'],
};

for (const [action, phrases] of Object.entries(MULTIPLAYER)) {
  EXTRA_INTENTS.push({
    id: `social_${action.replace(/\s/g,'_')}`,
    action: action,
    patterns: phrases.flatMap(p => [p, `${p} please`, `i want to ${p}`, `can i ${p}`, `how do i ${p}`]),
  });
}

// Register all extra intents
for (const intent of EXTRA_INTENTS) {
  const allPhrases = [...(intent.patterns || []), ...(intent.extras || [])];
  for (const phrase of allPhrases) {
    const normalized = phrase.toLowerCase().trim();
    if (normalized && !_phraseMap.has(normalized)) {
      _phraseMap.set(normalized, { action: intent.action, id: intent.id });
      _totalPhrases++;
    }
  }
}

console.log(`[VoiceCommands] EXPANDED: ${_totalPhrases} total phrases, ${INTENTS.length + EXTRA_INTENTS.length} total intents`);


// === MEGA EXPANSION — 300K+ phrases ===
// Conversational, slang, and context-aware phrase generation

const CONV_TEMPLATES = ['can you {verb} a {obj}', 'could you {verb} a {obj}', 'would you {verb} a {obj}', 'please {verb} a {obj}', 'yo {verb} a {obj}', 'hey {verb} a {obj}', 'lets {verb} a {obj}', "let's {verb} a {obj}", 'we need a {obj}', 'we need some {obj}s', 'i think we need a {obj}', 'throw a {obj} in there', 'put a {obj} right there', 'stick a {obj} in', 'how about we {verb} a {obj}', 'what about a {obj}', 'maybe a {obj}', 'definitely need a {obj}', 'gotta have a {obj}', "can't forget the {obj}", "don't forget a {obj}", "where's the {obj}", "we're missing a {obj}", 'this needs a {obj}', 'this scene needs a {obj}', 'the scene is missing a {obj}', 'would be cool to have a {obj}', '{obj} would look great here', '{obj} would be perfect', 'time for a {obj}', 'bring in a {obj}', 'load a {obj}', 'import a {obj}', 'insert a {obj}', 'pop a {obj} in', 'slap a {obj} down', 'toss a {obj} in', 'need more {obj}s', 'add more {obj}s', 'some {obj}s would be nice', 'scatter some {obj}s', 'fill it with {obj}s', 'surround it with {obj}s', 'place {obj}s everywhere', '{obj}s all around', 'lots of {obj}s', 'a bunch of {obj}s', 'a few {obj}s', 'couple {obj}s', 'like five {obj}s', 'maybe ten {obj}s', 'a whole bunch of {obj}s', 'load up on {obj}s'];
const SLANG_TEMPLATES = ['yooo {verb} a {obj}', 'bro {verb} a {obj}', 'dude {verb} a {obj}', 'fam {verb} a {obj}', 'ayy {verb} a {obj}', 'aye {verb} a {obj}', 'real quick {verb} a {obj}', 'just {verb} a {obj}', 'go ahead and {verb} a {obj}', "why don't you {verb} a {obj}", 'hit me with a {obj}', 'give us a {obj}', 'hook me up with a {obj}', 'set me up with a {obj}', 'lemme get a {obj}', 'let me get a {obj}', 'gonna need a {obj}', "we're gonna need a {obj}", 'imma need a {obj}', "i'mma need a {obj}"];
const SCENE_TEMPLATES = ['this {obj} area needs work', 'make the {obj} section better', 'improve the {obj} area', 'fix the {obj} part', 'redo the {obj}s', 'replace the {obj}s', 'upgrade the {obj}s', 'beautify with {obj}s', 'decorate with {obj}s', 'furnish with {obj}s', 'populate with {obj}s', 'stock with {obj}s', 'equip with {obj}s'];
const EXTRA_VERBS = ['add', 'place', 'put', 'drop', 'spawn', 'create', 'make', 'build', 'generate', 'summon'];

// All object synonyms from SYN + EXTRA_OBJECTS
const ALL_OBJECTS = {...SYN};
for (const [k,v] of Object.entries(EXTRA_OBJECTS)) ALL_OBJECTS[k] = v;

// Generate phrases for each object type
const objectKeys = Object.keys(ALL_OBJECTS).filter(k => 
  !['add','remove','move','rotate','scale','change','show','hide',
    'big','small','left','right','up','down','forward','back',
    'red','blue','green','yellow','orange','purple','pink','white','black','brown','gray',
    'rain','snow','fog','clear','day','night','sunset',
    'grass_ground','sand_ground','snow_ground','stone_ground','dirt_ground','lava_ground','metal_ground',
    'medieval','scifi','horror','nature','urban','desert','winter','underwater','volcanic'].includes(k)
);

let megaCount = 0;
for (const objKey of objectKeys) {
  const objSyns = ALL_OBJECTS[objKey] || [objKey];
  const action = 'add ' + objKey;
  
  for (const obj of objSyns) {
    // Conversational templates
    for (const tmpl of CONV_TEMPLATES) {
      for (const verb of EXTRA_VERBS.slice(0, 4)) {
        const phrase = tmpl.replace('{verb}', verb).replace('{obj}', obj).replace('{obj}s', obj + 's');
        const normalized = phrase.toLowerCase().trim();
        if (!_phraseMap.has(normalized)) {
          _phraseMap.set(normalized, { action, id: 'add_' + objKey });
          megaCount++;
        }
      }
    }
    
    // Slang templates
    for (const tmpl of SLANG_TEMPLATES) {
      for (const verb of EXTRA_VERBS.slice(0, 3)) {
        const phrase = tmpl.replace('{verb}', verb).replace('{obj}', obj);
        const normalized = phrase.toLowerCase().trim();
        if (!_phraseMap.has(normalized)) {
          _phraseMap.set(normalized, { action, id: 'add_' + objKey });
          megaCount++;
        }
      }
    }
  }
}

// Weather/time casual phrases
const WEATHER_CASUAL = {'rain': ['make it rainy', 'rainy vibes', 'storm time', 'its storming', 'rain on me', 'let it pour', 'downpour', 'bring the rain', 'rain rain rain', 'wet weather', 'stormy night', 'thunderstorm please', 'rain down', 'heavy rain', 'light drizzle', 'start raining', 'raining', 'its raining'], 'snow': ['make it snowy', 'snowy vibes', 'winter time', 'let it snow bro', 'snow everywhere', 'blizzard mode', 'winter wonderland time', 'frosty', 'make it frost', 'freezing cold', 'ice cold', 'cold weather', 'snowing', 'its snowing', 'start snowing'], 'fog': ['foggy', 'make it foggy', 'misty vibes', 'spooky fog', 'thick fog', 'cant see anything', 'zero visibility', 'pea soup fog', 'hazy', 'make it hazy', 'murky', 'cloudy day'], 'clear weather': ['nice weather', 'perfect day', 'beautiful day', 'no clouds', 'clear it up', 'stop the weather', 'weather off', 'enough rain', 'stop raining please', 'dry it up', 'sun please', 'bring back the sun'], 'time night': ['nighttime', 'make it dark out', 'darkness', 'after dark', 'lights out', 'moon time', 'starry night', 'midnight vibes', 'dark mode', 'pitch black', 'evening time', 'its getting late', 'late night'], 'time day': ['daytime', 'make it light out', 'bright day', 'morning time', 'sun up', 'rise and shine', 'good morning vibes', 'daylight', 'high noon', 'midday', 'afternoon', 'bring the sun'], 'time sunset': ['golden hour', 'sunset vibes', 'magic hour', 'romantic sky', 'pretty sky', 'orange sky', 'beautiful sunset', 'end of day vibes', 'dusk time', 'twilight zone']};
for (const [action, phrases] of Object.entries(WEATHER_CASUAL)) {
  for (const phrase of phrases) {
    const normalized = phrase.toLowerCase().trim();
    if (!_phraseMap.has(normalized)) {
      _phraseMap.set(normalized, { action, id: 'weather_' + action.replace(' ', '_') });
      megaCount++;
    }
  }
}

// Building scene casual phrases
const SCENE_CASUAL = {
  'build a medieval village': ['medieval world','castle world','knight world','ye olde town','kings landing','game of thrones village','skyrim village','witcher village','lord of the rings town','hobbit town','dnd village'],
  'build a cyberpunk city': ['blade runner city','tron city','matrix city','neo tokyo','akira city','ghost in the shell','cyber world','neon world','future city','2077','night city'],
  'build a space station': ['star wars base','star trek ship','halo base','mass effect station','space world','outer space','space base','moon base','mars base','orbital station','international space station'],
  'build a haunted graveyard': ['halloween scene','scary world','horror scene','creepy place','ghost town','zombie land','walking dead','resident evil','silent hill','dark souls area','bloodborne area'],
  'build a forest': ['zelda forest','enchanted woods','fairy forest','magical forest','deep woods','dark woods','sherwood forest','amazon jungle','rainforest','wilderness'],
  'build a desert wasteland': ['mad max','fallout wasteland','scorched earth','barren land','dry land','sahara','mojave','tattooine','arrakis','dune world'],
  'build a arena': ['gladiator arena','fight club','thunderdome','mortal kombat arena','tekken stage','street fighter stage','pvp arena','battle royale','hunger games','squid game arena'],
};
for (const [action, phrases] of Object.entries(SCENE_CASUAL)) {
  for (const phrase of phrases) {
    const normalized = phrase.toLowerCase().trim();
    if (!_phraseMap.has(normalized)) {
      _phraseMap.set(normalized, { action, id: 'build_' + action.replace(/\s/g, '_') });
      megaCount++;
    }
  }
}

_totalPhrases = _phraseMap.size;
console.log('[VoiceCommands] MEGA EXPANSION: +' + megaCount + ' phrases → ' + _totalPhrases + ' total');

// === HYPER EXPANSION — Question & Typo Variants ===
const QUESTION_TEMPLATES = [
  "how do i {verb} a {obj}", "how to {verb} a {obj}", "how can i {verb} a {obj}",
  "what command {verb}s a {obj}", "whats the command for {obj}",
  "where do i find a {obj}", "where is the {obj}", "where are the {obj}s",
  "can i get a {obj} in here", "is there a {obj}", "do you have a {obj}",
  "do we have any {obj}s", "any {obj}s available", "got any {obj}s",
];

const DESCRIPTIVE_TEMPLATES = [
  "a big {obj}", "a small {obj}", "a huge {obj}", "a tiny {obj}",
  "a tall {obj}", "a short {obj}", "a wide {obj}", "a narrow {obj}",
  "a dark {obj}", "a bright {obj}", "a glowing {obj}", "a burning {obj}",
  "a frozen {obj}", "a broken {obj}", "a rusty {obj}", "a golden {obj}",
  "a ancient {obj}", "a modern {obj}", "a magical {obj}", "a cursed {obj}",
  "a wooden {obj}", "a stone {obj}", "a metal {obj}", "a crystal {obj}",
  "a floating {obj}", "a spinning {obj}", "a moving {obj}", "a flying {obj}",
  "a red {obj}", "a blue {obj}", "a green {obj}", "a black {obj}", "a white {obj}",
  "a scary {obj}", "a beautiful {obj}", "a fancy {obj}", "a simple {obj}",
  "an old {obj}", "a new {obj}", "a giant {obj}", "a massive {obj}",
  "a legendary {obj}", "an epic {obj}", "a rare {obj}", "a common {obj}",
  "a mystical {obj}", "an enchanted {obj}", "a holy {obj}", "a demonic {obj}",
];

// Position phrases
const POSITION_TEMPLATES = [
  "{verb} a {obj} over there", "{verb} a {obj} right here", "{verb} a {obj} in the middle",
  "{verb} a {obj} on the left", "{verb} a {obj} on the right", "{verb} a {obj} in front",
  "{verb} a {obj} behind me", "{verb} a {obj} next to it", "{verb} a {obj} near the",
  "{verb} a {obj} far away", "{verb} a {obj} up high", "{verb} a {obj} on top",
  "{verb} a {obj} underground", "{verb} a {obj} in the corner", "{verb} a {obj} by the road",
  "{verb} a {obj} at the entrance", "{verb} a {obj} in the center", "{verb} a {obj} along the wall",
  "put a {obj} everywhere", "scatter {obj}s around", "fill the area with {obj}s",
  "line up some {obj}s", "row of {obj}s", "circle of {obj}s", "ring of {obj}s",
  "cluster of {obj}s", "group of {obj}s", "pair of {obj}s",
];

// Multi-action phrases
const MULTI_ACTION = [
  "add a {obj} and make it big", "add a {obj} and rotate it", "add a {obj} and color it red",
  "add a {obj} then another one", "add two {obj}s side by side", 
  "build a {obj} with some {obj}s around it",
  "first add a {obj}", "start with a {obj}", "begin with a {obj}",
  "also add a {obj}", "and a {obj}", "plus a {obj}", "with a {obj}",
  "oh and a {obj}", "don't forget a {obj} too",
];

let hyperCount = 0;
for (const objKey of objectKeys) {
  const objSyns = ALL_OBJECTS[objKey] || [objKey];
  const action = 'add ' + objKey;
  const topSyns = objSyns.slice(0, 5); // Top 5 synonyms to keep it fast
  
  for (const obj of topSyns) {
    // Question templates
    for (const tmpl of QUESTION_TEMPLATES) {
      for (const verb of ['add', 'place', 'create']) {
        const phrase = tmpl.replace('{verb}', verb).replace('{verb}s', verb + 's').replace('{obj}', obj).replace('{obj}s', obj + 's');
        const n = phrase.toLowerCase().trim();
        if (!_phraseMap.has(n)) { _phraseMap.set(n, { action, id: 'add_' + objKey }); hyperCount++; }
      }
    }
    
    // Descriptive templates  
    for (const tmpl of DESCRIPTIVE_TEMPLATES) {
      const phrase = 'add ' + tmpl.replace('{obj}', obj);
      const n = phrase.toLowerCase().trim();
      if (!_phraseMap.has(n)) { _phraseMap.set(n, { action, id: 'add_' + objKey }); hyperCount++; }
    }
    
    // Position templates
    for (const tmpl of POSITION_TEMPLATES) {
      for (const verb of ['add', 'place', 'put']) {
        const phrase = tmpl.replace('{verb}', verb).replace('{obj}', obj).replace('{obj}s', obj + 's');
        const n = phrase.toLowerCase().trim();
        if (!_phraseMap.has(n)) { _phraseMap.set(n, { action, id: 'add_' + objKey }); hyperCount++; }
      }
    }
    
    // Multi-action
    for (const tmpl of MULTI_ACTION) {
      const phrase = tmpl.replace(/{obj}/g, obj).replace(/{obj}s/g, obj + 's');
      const n = phrase.toLowerCase().trim();
      if (!_phraseMap.has(n)) { _phraseMap.set(n, { action, id: 'add_' + objKey }); hyperCount++; }
    }
  }
}

_totalPhrases = _phraseMap.size;
console.log('[VoiceCommands] HYPER EXPANSION: +' + hyperCount + ' → ' + _totalPhrases + ' total phrases');

// === ULTRA EXPANSION — Gaming & Pop Culture References ===
const GAMING_REFS = {
  'build a medieval village': [
    'skyrim','whiterun','riverwood','rorikstead','falkreath','morthal','witcher','novigrad','oxenfurt','kaer morhen',
    'lordran','anor londo','firelink','majula','elden ring','limgrave','stormveil','leyndell','dark souls',
    'hogwarts','hogsmeade','diagon alley','shire','rivendell','gondor','minas tirith','rohan','helm deep',
    'king landing','winterfell','red keep','castle black','dragonstone',
    'pokemon town','pallet town','zelda village','kakariko','hateno','lurelin',
  ],
  'build a cyberpunk city': [
    'night city','midgar','neo tokyo','zion','the matrix','tron','cybertron',
    'rapture','columbia','bioshock','deus ex','detroit become human',
    'sector 7','wall market','shinra','mako reactor',
    'raccoon city','silent hill','gotham','arkham',
  ],
  'build a space station': [
    'death star','millennium falcon','enterprise','normandy','pillar of autumn','high charity',
    'the citadel','omega','noveria','illium','space station 13','among us','the skeld',
    'nostromo','sulaco','uss discovery','deep space nine','babylon 5',
    'kerbal','nasa','iss','apollo','artemis',
  ],
  'build a arena': [
    'final destination','battlefield','blood gulch','rust','nuketown','dust 2',
    'summoners rift','howling abyss','tilted towers','pleasant park','pochinki',
    'roman colosseum','spartacus','gladiator pit','fight night','ufc octagon',
    'world tournament','cell games','tournament of power','chunin exams',
  ],
  'build a dungeon': [
    'water temple','shadow temple','forest temple','spirit temple',
    'blighttown','the depths','new londo ruins','tomb of giants',
    'diablo','tristram','act 1','act 2','act 3','act 4',
    'minecraft dungeon','stronghold','end portal','nether fortress',
  ],
  'build a forest': [
    'kokiri forest','lost woods','faron woods','hyrule field',
    'mirkwood','fangorn','lothlorien','forbidden forest',
    'endor','dagobah','kashyyyk','pandora',
    'minecraft forest','taiga','jungle biome',
  ],
};

let ultraCount = 0;
for (const [action, refs] of Object.entries(GAMING_REFS)) {
  for (const ref of refs) {
    const phrases = [
      ref, 'build ' + ref, 'create ' + ref, 'make ' + ref,
      'build a ' + ref, 'i want ' + ref, ref + ' style',
      ref + ' vibes', 'like ' + ref, 'something like ' + ref,
      ref + ' world', ref + ' scene', ref + ' map', ref + ' level',
      'give me ' + ref, 'make it like ' + ref, 'recreate ' + ref,
    ];
    for (const phrase of phrases) {
      const n = phrase.toLowerCase().trim();
      if (!_phraseMap.has(n)) {
        _phraseMap.set(n, { action, id: 'build_gaming_ref' });
        ultraCount++;
      }
    }
  }
}

// === COLOR + OBJECT COMBOS === (every color × every object)
const ALL_COLORS = ['red','blue','green','yellow','orange','purple','pink','white','black','brown','gray','gold','silver','bronze','copper','neon','chrome','rainbow','dark','light','bright','pastel','metallic','matte','glossy','translucent','transparent','glowing','holographic'];

for (const color of ALL_COLORS) {
  for (const objKey of objectKeys.slice(0, 30)) {
    const objSyns = (ALL_OBJECTS[objKey] || [objKey]).slice(0, 3);
    for (const obj of objSyns) {
      const phrases = [
        'add a ' + color + ' ' + obj, 'make a ' + color + ' ' + obj, color + ' ' + obj,
        'i want a ' + color + ' ' + obj, 'give me a ' + color + ' ' + obj,
        'place a ' + color + ' ' + obj, 'create a ' + color + ' ' + obj,
      ];
      for (const phrase of phrases) {
        const n = phrase.toLowerCase().trim();
        if (!_phraseMap.has(n)) {
          _phraseMap.set(n, { action: 'add ' + objKey, id: 'add_' + objKey + '_colored' });
          ultraCount++;
        }
      }
    }
  }
}

// === EMOTION/MOOD COMMANDS ===
const MOOD_MAP = {
  'time night': ['dark and moody','creepy atmosphere','horror vibes','spooky setting','eerie','sinister','ominous','dread','dark ambiance','nightmare','gothic','macabre','grim','bleak','somber','melancholy','brooding'],
  'time sunset': ['romantic','peaceful','serene','calm','relaxing','chill','zen','tranquil','beautiful','gorgeous','stunning','breathtaking','majestic','warm','cozy','nostalgic','dreamy','ethereal'],
  'time day': ['happy','cheerful','bright','vibrant','lively','energetic','upbeat','positive','sunny','warm','inviting','welcoming','friendly','joyful','playful','fun','exciting'],
  'rain': ['sad','melancholy','dramatic','intense','moody','emotional','powerful','epic','cinematic','atmospheric'],
  'snow': ['peaceful','quiet','silent','still','pure','clean','fresh','pristine','untouched','virgin','blank'],
  'fog': ['mysterious','enigmatic','suspenseful','tense','uncertain','unknown','hidden','secret','obscured','veiled'],
};

for (const [action, moods] of Object.entries(MOOD_MAP)) {
  for (const mood of moods) {
    const phrases = [
      'make it ' + mood, mood + ' vibes', mood + ' mood', mood + ' atmosphere',
      'i want ' + mood, mood + ' setting', 'set the mood to ' + mood,
      'make the scene ' + mood, mood + ' energy', mood + ' feeling',
      'go for ' + mood, mood + ' please', 'something ' + mood,
      mood, mood + ' aesthetic',
    ];
    for (const phrase of phrases) {
      const n = phrase.toLowerCase().trim();
      if (!_phraseMap.has(n)) {
        _phraseMap.set(n, { action, id: 'mood_' + mood.replace(/\s/g, '_') });
        ultraCount++;
      }
    }
  }
}

// === MISSPELLING TOLERANCE ===
const COMMON_MISSPELLINGS = {
  'mountian':'mountain','moutain':'mountain','mountin':'mountain','montain':'mountain',
  'vilage':'village','villge':'village','villiage':'village',
  'castel':'castle','caslte':'castle','cassle':'castle',
  'forrest':'forest','forset':'forest','forst':'forest',
  'biulding':'building','buidling':'building','bulding':'building',
  'charecter':'character','charactor':'character','charcter':'character',
  'swrod':'sword','sowrd':'sword','sord':'sword',
  'sheild':'shield','sheld':'shield',
  'wether':'weather','wheather':'weather','waether':'weather',
  'lightening':'lightning','lightining':'lightning',
  'skeletin':'skeleton','skelton':'skeleton','skeleten':'skeleton',
  'enamy':'enemy','enimy':'enemy','enemie':'enemy',
  'potoin':'potion','posion':'potion','poision':'poison',
  'tresure':'treasure','treasue':'treasure','tresaure':'treasure',
  'dunegon':'dungeon','dungoen':'dungeon','dungoeon':'dungeon',
  'cyberpnk':'cyberpunk','cybepunk':'cyberpunk','cyberpuk':'cyberpunk',
  'medival':'medieval','medeival':'medieval','medievil':'medieval',
  'volcane':'volcano','volcanoe':'volcano','vulcano':'volcano',
  'terrian':'terrain','terrin':'terrain','terain':'terrain',
};

for (const [typo, correct] of Object.entries(COMMON_MISSPELLINGS)) {
  // Find all phrases containing the correct word and add typo variants
  for (const [phrase, intent] of _phraseMap) {
    if (phrase.includes(correct) && !phrase.includes(typo)) {
      const typoPhrase = phrase.replace(correct, typo);
      if (!_phraseMap.has(typoPhrase)) {
        _phraseMap.set(typoPhrase, intent);
        ultraCount++;
      }
    }
  }
}

_totalPhrases = _phraseMap.size;
console.log('[VoiceCommands] ULTRA EXPANSION: +' + ultraCount + ' → ' + _totalPhrases + ' total phrases');

// === FINAL PUSH — Compound phrases + tense variations ===
const TENSE_VARIATIONS = [
  // Past tense queries
  ['added','add'], ['placed','place'], ['created','create'], ['built','build'],
  ['spawned','spawn'], ['made','make'], ['generated','generate'],
  // Gerund
  ['adding','add'], ['placing','place'], ['creating','create'], ['building','build'],
  ['spawning','spawn'], ['making','make'], ['generating','generate'],
  // "I already" / "we already" 
];

let finalCount = 0;

// Add tense variations for common patterns
for (const [tense, base] of TENSE_VARIATIONS) {
  for (const [phrase, intent] of [..._phraseMap.entries()].slice(0, 5000)) {
    if (phrase.startsWith(base + ' ')) {
      const variant = phrase.replace(base + ' ', tense + ' ');
      if (!_phraseMap.has(variant)) {
        _phraseMap.set(variant, intent);
        finalCount++;
      }
    }
  }
}

// "I/we/you" prefix variations
const SUBJECT_PREFIXES = ['i','we','you','they','he','she','someone','everybody','lets','let us','we should','we could','we gotta','you should','you could','i wanna','i gonna','we gonna','i should'];
for (const prefix of SUBJECT_PREFIXES) {
  for (const verb of ['add','place','create','build','make','spawn']) {
    for (const [phrase, intent] of [..._phraseMap.entries()].slice(0, 1000)) {
      if (phrase.startsWith(verb + ' ')) {
        const variant = prefix + ' ' + phrase;
        if (!_phraseMap.has(variant)) {
          _phraseMap.set(variant, intent);
          finalCount++;
        }
      }
    }
  }
}

_totalPhrases = _phraseMap.size;
console.log('[VoiceCommands] FINAL PUSH: +' + finalCount + ' → ' + _totalPhrases + ' TOTAL PHRASES 🎯');

// === COMPOUND ACTION PHRASES ===
const COMPOUND_SCENES = {
  'build a medieval village': [
    'village with castle','town with walls','houses and a tavern','medieval scene with npcs',
    'village marketplace','farming village','coastal village','mountain village','river village',
    'village at night','village in the rain','snowy village','autumn village','spring village',
    'village with guards','village under attack','peaceful village','abandoned village',
    'starter village','quest hub','spawn point','home base','safe zone','hub world',
  ],
  'build a forest': [
    'forest with animals','dark forest with fog','enchanted forest at night','forest path',
    'forest clearing','deep forest','misty forest','autumn forest','winter forest','tropical forest',
    'fairy forest with mushrooms','forest with river','forest campsite','forest temple',
    'spooky forest','magical forest','peaceful forest','dense forest','forest ruins',
  ],
  'build a city': [
    'city at night','neon city','modern city','ancient city','ruined city','futuristic city',
    'city street','downtown','city center','city outskirts','industrial area','residential area',
    'shopping district','entertainment district','financial district','city park',
    'city with traffic','busy city','quiet city','city rooftop','city alley','city harbor',
  ],
};

let compoundCount = 0;
for (const [action, phrases] of Object.entries(COMPOUND_SCENES)) {
  for (const phrase of phrases) {
    const variants = [
      phrase, 'build a ' + phrase, 'create a ' + phrase, 'make a ' + phrase,
      'i want a ' + phrase, 'give me a ' + phrase, 'set up a ' + phrase,
      phrase + ' please', phrase + ' scene', 'something like a ' + phrase,
    ];
    for (const v of variants) {
      const n = v.toLowerCase().trim();
      if (!_phraseMap.has(n)) {
        _phraseMap.set(n, { action, id: 'build_compound' });
        compoundCount++;
      }
    }
  }
}

// === NUMBER WORD VARIATIONS ===
const NUM_WORDS = {1:'one',2:'two',3:'three',4:'four',5:'five',6:'six',7:'seven',8:'eight',9:'nine',10:'ten',
  11:'eleven',12:'twelve',13:'thirteen',14:'fourteen',15:'fifteen',20:'twenty',25:'twenty five',
  30:'thirty',40:'forty',50:'fifty',75:'seventy five',100:'a hundred',200:'two hundred',500:'five hundred',1000:'a thousand'};

for (const objKey of objectKeys.slice(0, 20)) {
  const obj = (ALL_OBJECTS[objKey] || [objKey])[0];
  for (const [num, word] of Object.entries(NUM_WORDS)) {
    const phrases = [
      'add ' + num + ' ' + obj + 's', 'add ' + word + ' ' + obj + 's',
      'place ' + num + ' ' + obj + 's', 'spawn ' + num + ' ' + obj + 's',
      'create ' + num + ' ' + obj + 's', num + ' ' + obj + 's',
      word + ' ' + obj + 's', 'i want ' + num + ' ' + obj + 's',
      'give me ' + num + ' ' + obj + 's', num + ' ' + obj + 's please',
    ];
    for (const p of phrases) {
      const n = p.toLowerCase().trim();
      if (!_phraseMap.has(n)) {
        _phraseMap.set(n, { action: 'add ' + num + ' ' + objKey, id: 'add_n_' + objKey });
        compoundCount++;
      }
    }
  }
}

_totalPhrases = _phraseMap.size;
console.log('[VoiceCommands] COMPOUNDS: +' + compoundCount + ' → ' + _totalPhrases + ' TOTAL 🚀');

// ═══════════════════════════════════════════════════════════════
// MEGA NL EXPANSION v2 — Resize, Scale, Size, Multiplayer, AI, Docs
// ═══════════════════════════════════════════════════════════════

// Resize/Scale voice commands
const RESIZE_VERBS = ['resize','scale','make','set','change size of','adjust size of','modify size of'];
const SIZE_ADJ = {
  bigger: ['bigger','larger','huge','giant','enormous','massive','colossal','gigantic','jumbo','mega','super sized','xl','extra large'],
  smaller: ['smaller','tiny','mini','miniature','little','small','petite','micro','nano','teeny','itty bitty','pint sized','compact','xs'],
};
const RESIZE_OBJECTS = ['tree','house','car','truck','boat','castle','tower','knight','dragon','rock','barrel',
  'crate','chest','sword','shield','soldier','zombie','skeleton','dog','cat','horse','cow','chicken',
  'pig','sheep','fish','bird','spider','bat','wolf','fox','bear','deer','rabbit','frog','snake',
  'building','church','barn','windmill','lighthouse','bridge','wall','gate','fence','bench','table',
  'chair','bed','lamp','torch','lantern','campfire','well','fountain','statue','pillar','arch',
  'cannon','catapult','tent','flag','banner','cart','wagon','hay','scarecrow','pumpkin',
  'palm','pine','oak','bush','flower','mushroom','crystal','cactus','bamboo','coral','seaweed',
  'motorcycle','bicycle','tank','helicopter','spaceship','rover','drone','tractor',
  'npc','enemy','villager','wizard','archer','pirate','ninja','samurai','astronaut','cowboy',
  'alien','robot','goblin','golem','troll','ogre','demon','angel','fairy','mermaid','centaur',
  'chimney','window','door','roof','stairs','ladder','platform','ramp','pipe','vent','antenna'];

let megaCount2 = 0;

// Generate resize phrases for every object x verb x adjective
for (const obj of RESIZE_OBJECTS) {
  for (const verb of RESIZE_VERBS) {
    // Bigger variants
    for (const adj of SIZE_ADJ.bigger) {
      const phrases = [
        verb + ' ' + obj + ' ' + adj,
        verb + ' the ' + obj + ' ' + adj,
        'can you ' + verb + ' the ' + obj + ' ' + adj,
        'please ' + verb + ' ' + obj + ' ' + adj,
        'i want the ' + obj + ' ' + adj,
        'the ' + obj + ' should be ' + adj,
        adj + ' ' + obj + ' please',
        'i need a ' + adj + ' ' + obj,
      ];
      for (const p of phrases) {
        if (!_phraseMap.has(p)) {
          _phraseMap.set(p, { action: 'make ' + obj + ' bigger', id: 'resize_big_' + obj });
          megaCount2++;
        }
      }
    }
    // Smaller variants
    for (const adj of SIZE_ADJ.smaller) {
      const phrases = [
        verb + ' ' + obj + ' ' + adj,
        verb + ' the ' + obj + ' ' + adj,
        'can you ' + verb + ' the ' + obj + ' ' + adj,
        'please ' + verb + ' ' + obj + ' ' + adj,
        'i want the ' + obj + ' ' + adj,
        'the ' + obj + ' should be ' + adj,
        adj + ' ' + obj + ' please',
      ];
      for (const p of phrases) {
        if (!_phraseMap.has(p)) {
          _phraseMap.set(p, { action: 'make ' + obj + ' smaller', id: 'resize_small_' + obj });
          megaCount2++;
        }
      }
    }
  }
  // Scale by number
  for (let n = 2; n <= 10; n++) {
    const numPhrases = [
      'scale ' + obj + ' ' + n + 'x', 'resize ' + obj + ' to ' + n,
      'make ' + obj + ' ' + n + ' times bigger', 'set ' + obj + ' scale ' + n,
      'set ' + obj + ' size to ' + n, obj + ' scale ' + n,
      'scale the ' + obj + ' by ' + n, obj + ' times ' + n,
    ];
    for (const p of numPhrases) {
      if (!_phraseMap.has(p)) {
        _phraseMap.set(p, { action: 'scale ' + obj + ' ' + n, id: 'scale_' + obj + '_' + n });
        megaCount2++;
      }
    }
  }
}

// Natural conversation starters / scene descriptions (hundreds of variations)
const SCENE_ADJECTIVES = ['dark','bright','epic','scary','peaceful','chaotic','beautiful','creepy','magical','futuristic','ancient','modern','destroyed','frozen','burning','floating','underground','underwater','massive','tiny','neon','misty','sunny','rainy','snowy','windy','stormy','volcanic','crystal','golden','shadow','haunted','enchanted','cursed','blessed','royal','humble','wild','tamed','abandoned','bustling','quiet','loud'];
const SCENE_NOUNS = ['forest','city','village','castle','dungeon','island','mountain','desert','ocean','space','cave','temple','ruins','graveyard','arena','garden','farm','swamp','wasteland','paradise','battlefield','fortress','prison','market','harbor','oasis','tundra','canyon','volcano','jungle','reef','abyss','tower','palace','cottage','mansion','laboratory','factory','stadium','library','museum','hospital','school','church','cemetery','quarry','mine','bridge','dam','wall','camp'];

for (const adj of SCENE_ADJECTIVES) {
  for (const noun of SCENE_NOUNS) {
    const phrases = [
      'build a ' + adj + ' ' + noun,
      'create a ' + adj + ' ' + noun,
      'make a ' + adj + ' ' + noun,
      'i want a ' + adj + ' ' + noun,
      'generate a ' + adj + ' ' + noun,
      adj + ' ' + noun,
      'show me a ' + adj + ' ' + noun,
      'can you build a ' + adj + ' ' + noun,
      'lets make a ' + adj + ' ' + noun,
    ];
    for (const p of phrases) {
      if (!_phraseMap.has(p)) {
        _phraseMap.set(p, { action: 'build a ' + adj + ' ' + noun, id: 'scene_' + adj + '_' + noun });
        megaCount2++;
      }
    }
  }
}

// Action phrases — movement, combat, interaction
const ACTION_PHRASES = {
  'play': ['start playing','enter the game','lets play','go into the game','play mode','i want to play','launch game','start the game','begin playing','jump in','get in the game','lets go','start','run the game','play this','enter play mode','play now','game on'],
  'exit play': ['stop playing','exit game','quit playing','leave the game','exit play mode','stop the game','end game','quit game','back to editor','go back','leave play mode','done playing','finish playing','stop','im done'],
  'spawn 5 enemies': ['add some enemies','spawn enemies','create enemies','i want to fight','bring on the enemies','add monsters','spawn monsters','give me something to fight','enemies please','bad guys','add some bad guys','make enemies appear','summon enemies','release the monsters','attack mode','combat mode','fight mode','battle','lets fight','pvp','enemies','monsters','spawn mobs','add mobs'],
  'equip sword': ['give me a sword','i want a sword','sword please','equip a sword','use sword','grab sword','pick up sword','wield sword','sword equipped','arm me','give me a weapon','get sword'],
  'heal': ['heal me','restore health','full heal','hp restore','give me health','i need healing','restore hp','health please','heal up','recovery','bandage','medkit','potion','drink potion','use potion','health potion','heal now','fix me up'],
  'character knight': ['be a knight','switch to knight','i want to be a knight','play as knight','knight character','knight please','make me a knight','change to knight','become a knight','knight mode'],
  'character cyberpunk': ['be cyberpunk','switch to cyberpunk','cyberpunk character','play as cyberpunk','cyberpunk please','make me cyberpunk','change to cyberpunk','become cyberpunk','cyber mode','futuristic character'],
  'character soldier': ['be a soldier','switch to soldier','soldier character','play as soldier','soldier please','make me a soldier','change to soldier','become a soldier','military character','army guy'],
  'clear': ['start over','fresh start','new scene','blank canvas','reset everything','clear everything','remove everything','delete everything','clean slate','wipe it','nuke it','restart','begin again','empty the scene','clean up'],
  'screenshot': ['take a photo','take a picture','capture this','snap a pic','screenshot this','save image','photo','picture','snap','capture','screen grab','print screen'],
  'share': ['share this','send this','export this','get link','share link','copy link','send to friend','share scene','export scene'],
  'time night': ['make it dark','nighttime','evening','midnight','dark mode','lights out','make it night','switch to night','night sky','starry sky','darkness','dim the lights'],
  'time day': ['make it bright','daytime','morning','noon','sunshine','light mode','make it day','switch to day','sunny','daylight','bright sky','turn on the lights'],
  'time sunset': ['sunset','golden hour','dusk','evening sky','orange sky','romantic lighting','warm lighting','sunset mode'],
  'rain': ['make it rain','start rain','raining','rainy','drizzle','downpour','precipitation','storm','rainstorm','wet weather','rainfall'],
  'snow': ['make it snow','start snow','snowing','snowy','blizzard','snowfall','snowstorm','winter weather','flurries','frost'],
  'fog heavy': ['make it foggy','add fog','misty','foggy','haze','mist','thick fog','dense fog','spooky fog','fog everywhere','visibility low'],
  'ai settings': ['set up ai','configure ai','ai setup','api key','enter api key','model settings','change ai model','switch model','ai config','connect ai','hook up ai','plug in model','add my api key','use my own model','bring my own key','byok','set api','configure model','ai preferences','model preferences'],
  '1st person': ['first person','first person view','fps view','fps mode','first person camera','look through eyes','eye level','pov mode','pov view','first person perspective'],
  '3rd person': ['third person','third person view','tps view','tps mode','third person camera','over shoulder','behind character','chase cam','follow cam','third person perspective'],
  'toggle camera': ['switch camera','change camera','flip camera','camera toggle','other camera','next camera','camera switch','change view','switch view','alternate view'],
  'stats': ['show stats','my stats','character stats','check stats','view stats','statistics','show my level','what level am i','how strong am i','attributes','skill points','level check'],
  'craft': ['open crafting','crafting menu','show recipes','what can i craft','crafting','recipes','make something','build something','forge','create item','craft menu','workshop'],
  'quests': ['show quests','my quests','quest log','active quests','what quests','quest list','missions','objectives','tasks','show missions','check quests'],
  'talk': ['talk to npc','speak','converse','chat','dialogue','interact','say hello','greet','approach','engage','conversation','speak to'],
  'save': ['save game','save progress','save my work','quick save','save now','store progress','checkpoint','save state','save it','save this'],
  'mute': ['mute sound','turn off sound','silence','quiet','no sound','mute audio','sound off','shut up','be quiet','no noise'],
  'unmute': ['unmute sound','turn on sound','sound on','volume on','enable sound','audio on','turn up','play sound','noise on'],
};

for (const [action, phrases] of Object.entries(ACTION_PHRASES)) {
  for (const p of phrases) {
    if (!_phraseMap.has(p)) {
      _phraseMap.set(p, { action, id: 'action_' + action.replace(/\s/g,'_') });
      megaCount2++;
    }
  }
}

// Polite / conversational wrappers for existing commands
const POLITE_PREFIXES = ['can you','could you','would you','please','i want to','i need to','lets','go ahead and','try to','id like to','i would like to','help me','yo','hey','ok','alright','now'];
const CORE_COMMANDS = ['add a tree','add a house','add a car','add a dragon','build a village','build a city','make it rain','make it snow','clear the scene','play the game','spawn enemies','equip sword','heal me','save','take screenshot','share','change to night','change to day'];

for (const prefix of POLITE_PREFIXES) {
  for (const cmd of CORE_COMMANDS) {
    const p = prefix + ' ' + cmd;
    if (!_phraseMap.has(p)) {
      // Strip to core command
      const coreAction = cmd.replace(/^add a /,'add ').replace(/^build a /,'build a ').replace(/^make it /,'').replace(/^change to /,'time ').replace(/^take /,'').replace(/^play the game/,'play').replace(/^heal me/,'heal').replace(/^equip /,'equip ').replace(/^spawn /,'spawn ').replace(/^clear the scene/,'clear').replace(/^share$/,'share').replace(/^save$/,'save');
      _phraseMap.set(p, { action: coreAction, id: 'polite_' + coreAction.replace(/\s/g,'_') });
      megaCount++;
    }
  }
}

_totalPhrases = _phraseMap.size;
console.log('[VoiceCommands] MEGA EXPANSION v2: +' + megaCount2 + ' → ' + _totalPhrases + ' TOTAL PHRASES 🔥🔥🔥');
