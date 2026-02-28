# Crate Engine — Deep Competitive Research
*February 24, 2026*

## 🎯 Goal: Match Unity/Unreal Quality in a Browser Engine

---

## 1. WHAT UNITY/UNREAL MARKETPLACE MAPS ACTUALLY ARE

### What makes a $300 Unreal map worth $300:
- **Hundreds of hand-placed props** — not randomly scattered, INTENTIONALLY designed layouts
- **Proper roads with intersections** — not floating planes, actual road meshes with curbs, sidewalks, lane markings
- **Building INTERIORS** — every building is enterable with furniture, lighting, props
- **Street lights, signs, trash cans, benches, mailboxes** — environmental storytelling
- **PBR materials everywhere** — brick walls, concrete, wood, metal with proper roughness/metalness/normal maps
- **LOD levels** on every asset (3-5 levels)
- **Lightmapping** — baked lighting for indoor scenes
- **Foliage system** — grass, flowers, bushes painted on terrain with wind animation
- **Navmesh** — AI pathfinding baked into the level
- **Particle effects** — dust, smoke from chimneys, fireflies, water mist
- **Ambient sounds** — birds, wind, water, city noise

### Top-Selling Unity/Unreal Assets (prices from research):
- **Synty Studios POLYGON packs** — $150-$500 each. Low-poly stylized. Fantasy Kingdom, Sci-Fi, Dungeons, Military, Apocalypse
- **Fantastic City Generator** (MasterPixel3D) — $300. Procedural city generation
- **GeNa Pro** (Procedural Worlds) — $149. Level designer with villages, roads, rivers
- **Gaia Pro** — $199. Full terrain/tree/grass/water system
- **Crest Water** — $240. Ocean/river/lake system
- **Ultimate Character Controller** (Opsive) — $249. Full 3rd/1st person controller
- **Final IK** — $90. Inverse kinematics for realistic character animation
- **Animancer Pro** — $90. Animation state machine
- **Human Mega Animations Pack** — $130. 1000+ animations
- **A* Pathfinding Pro** — $140. AI navigation
- **Behavior Designer** — $145. AI behavior trees
- **Urban Traffic & Pedestrian System** — $195. Cars driving on roads, pedestrians walking

### Unreal Marketplace → now Fab.com (Epic):
- In-Game Level Editor — $50
- Procedural Level Generator — $25
- Simulation Game Environments Mega Bundle — $475
- Level Designer tools — $100

---

## 2. ROSEBUD AI — Current State (2.1M games created)

### What Rosebud DOES well:
- **Vibe coding** — describe game, AI generates it
- **2.1 million games created** — massive community
- **Templates**: 3D Multiplayer, Voxel Forest, RPG, Visual Novel, City Builder
- **Fork system** — remix anyone's game (like GitHub for games)
- **Uses Gemini 3 Flash** as their AI model
- **Multiplayer support** — WebSocket-based
- **World Labs integration** — AI-generated 3D environments from images
- **Interactive stories** — their biggest category (romance, horror, fan fiction)
- **Play counts**: Top games get 10K-20K plays

### What Rosebud DOESN'T do well:
- **3D quality is basic** — simple shapes, no PBR, no realistic lighting
- **No proper terrain system** — flat or simple heightmaps
- **No vehicle physics** — cars don't drive realistically
- **No character animation library** — basic animations only
- **No water physics** — flat blue planes
- **No building interiors** — can't enter buildings
- **No combat system** — no swords, guns, damage
- **No inventory system** — no item pickup/management
- **FPS/Voxel/Vampire Survivor** modes are "Coming Soon"
- **Single-file games** — everything in one HTML/JS file, limits complexity
- **No asset marketplace** — can't buy/sell 3D models

### Rosebud's Game Types (available now):
1. Interactive Story ✅
2. RPG ✅
3. City Builder ✅
4. FPS — Coming Soon
5. Vampire Survivor — Coming Soon
6. Voxel — Coming Soon
7. Crowd Rush — Coming Soon
8. 3D Quest — Coming Soon

---

## 3. FEATURE GAP ANALYSIS: Crate Engine vs Top Engines

### ✅ We Have (Advantage):
- 800+ voice/text commands
- AI agent with custom code generation
- 3D model generation (Modal/TripoSR)
- Browser-based, no download
- Real-time multiplayer (Fly.io)
- Post-processing (bloom, SSAO, color grading)
- HDR environment maps
- Save/load scenes
- Play mode with character controller
- Vehicle enter/exit
- NPC wandering AI
- Terrain types
- Day/night cycle
- Weather (rain, snow, fog)
- Ambient particles

### ❌ Critical Gaps (Must Fix):

#### A. MAP QUALITY (THE #1 GAP)
**Current state:** "generate a city" randomly places objects in a pile
**Target state:** Structured layouts with roads, intersections, building placement on road edges, proper spacing

**What's needed:**
1. **Grid-based placement system** — objects snap to grid, roads follow grid lines
2. **Road network generator** — connected roads with intersections, T-junctions, curves
3. **Building placement along roads** — buildings face roads with proper setback
4. **Zoning system** — residential, commercial, industrial areas
5. **Infrastructure** — street lights every N meters, sidewalks, crosswalks
6. **Procedural city generator** — like Fantastic City Generator ($300 on Unity)
7. **Map templates** — not random commands, but pre-designed JSON layouts with exact positions

#### B. CHARACTER ANIMATION
**Current state:** Procedural bone rotation (arms swing, legs move)
**Target state:** Smooth blend-tree animations like Unity/Unreal

**What's needed:**
1. **Mixamo integration** — free motion-captured animations (walk, run, jump, attack, swim, climb, drive, die, dance, etc.)
2. **Animation blending** — smooth transitions between states
3. **Root motion** — character moves with animation, not sliding
4. **IK (Inverse Kinematics)** — feet plant on terrain, hands grab objects
5. **Ragdoll physics** — on death

#### C. VEHICLE SYSTEM
**Current state:** Character teleports into vehicle, basic WASD movement
**Target state:** GTA-style driving with camera follow, speed, drifting

**What's needed:**
1. **Vehicle physics** — acceleration, braking, steering angle, suspension
2. **Camera follow** — smooth chase cam behind vehicle, switches on enter/exit
3. **Speed/RPM display** — dashboard HUD
4. **Vehicle types** — car, truck, motorcycle, boat, helicopter
5. **Traffic AI** — NPC cars driving on roads
6. **Vehicle damage** — visual deformation on collision

#### D. WATER SYSTEM
**Current state:** Animated plane with vertex displacement
**Target state:** Realistic ocean with shore, depth, buoyancy

**What's needed:**
1. **Ocean shader** — Gerstner waves (not just sine), foam, depth color gradient
2. **Buoyancy physics** — boats float realistically, bob with waves
3. **Swimming** — character swims when in water (different controller)
4. **Underwater** — fog, light rays, different movement
5. **Shore/beach** — where land meets water, wave breaking
6. **Rivers** — flowing water with current that pushes objects/player

#### E. COMBAT/SHOOTING
**Current state:** Basic NPC aggro
**Target state:** Full combat system

**What's needed:**
1. **Melee combat** — sword/axe with hitboxes, combos, block, parry
2. **Ranged combat** — guns with projectiles, recoil, reload, ammo
3. **Health/damage system** — HP bars, damage numbers, death/respawn
4. **Enemy AI** — patrol, chase, attack, flee, group tactics
5. **Hit effects** — blood/sparks particles, screen shake, controller vibration

#### F. CLIMBING/PARKOUR
**Current state:** Basic wall vault mentioned but limited
**Target state:** Assassin's Creed/Breath of the Wild climbing

**What's needed:**
1. **Surface detection** — which surfaces are climbable
2. **Climbing animation** — hands/feet IK on surface
3. **Stamina system** — can't climb forever
4. **Ledge grab** — auto-grab ledges, pull up
5. **Wall run** — temporary horizontal wall movement

#### G. BUILDING INTERIORS
**Current state:** `_generateInterior` exists but untested
**Target state:** Seamless indoor/outdoor transitions

**What's needed:**
1. **Interior meshes** — walls, floors, ceilings, furniture
2. **Door system** — open/close with animation
3. **Interior lighting** — different from outdoor (lamps, windows)
4. **Occlusion culling** — don't render outside when inside
5. **Room types** — house, shop, tavern, dungeon, office

#### H. INVENTORY/CRAFTING
**What's needed:**
1. **Item pickup** — walk over items to collect
2. **Inventory UI** — grid or list with drag/drop
3. **Equipment slots** — weapon, armor, accessory
4. **Crafting recipes** — combine items to make new ones
5. **Item drops** — enemies drop loot

---

## 4. MAP GENERATOR — THE REAL WAY

### Current approach (broken):
```
"generate a city" → executes 30 sequential "add X" commands → random pile of objects
```

### Correct approach (what Unity/Unreal marketplace maps are):
```
"generate a city" → reads JSON layout → places objects at EXACT coordinates with EXACT rotations
```

### Implementation plan:

**Phase 1: JSON Map Templates**
- Maps defined as JSON with exact positions, rotations, scales
- Road network as connected line segments
- Buildings placed along roads
- Props placed contextually (lights near roads, trees in parks)

**Phase 2: Procedural Generation**
- Use Wave Function Collapse (WFC) for tile-based city generation
- Road network from L-system or agent-based simulation
- Building placement rules (commercial near intersections, residential on side streets)
- Height variation (downtown = tall buildings, suburbs = houses)

**Phase 3: AI-Enhanced Generation**
- LLM generates the JSON layout from description
- "Medieval village with a central marketplace, church on a hill, river on the east side"
- AI understands spatial relationships and generates coherent layouts

### Map Template Format:
```json
{
  "name": "Medieval Town",
  "size": [200, 200],
  "terrain": "grass",
  "roads": [
    {"from": [0, 0], "to": [200, 0], "width": 6, "type": "cobblestone"},
    {"from": [100, -100], "to": [100, 100], "width": 6, "type": "cobblestone"}
  ],
  "buildings": [
    {"type": "castle", "pos": [100, -80], "rot": 0, "scale": 1.5},
    {"type": "tavern", "pos": [85, -10], "rot": 90, "facing": "road"},
    {"type": "house", "pos": [115, -10], "rot": -90, "facing": "road"}
  ],
  "props": [
    {"type": "torch", "pos": [90, 0], "interval": 10, "along": "road"},
    {"type": "tree", "scatter": true, "count": 30, "zone": "outside_walls"}
  ],
  "npcs": [
    {"type": "guard", "patrol": [[80, -70], [120, -70]], "count": 2},
    {"type": "villager", "wander": {"center": [100, 0], "radius": 40}, "count": 8}
  ],
  "lights": [
    {"type": "point", "color": "#ff9944", "pos": [90, 0], "interval": 10}
  ]
}
```

---

## 5. PRIORITY ROADMAP

### Phase 1: Foundation (This Week)
1. ~~Fix 3D generator endpoint~~ (cold start timeout — need to add warmup/keep-alive)
2. **JSON map system** — replace random command execution with structured layouts
3. **5 polished map templates** — medieval town, modern city, forest village, pirate cove, sci-fi base
4. **Road system** — proper road meshes with width, material, lane markings
5. **Building placement** — buildings face roads, proper spacing

### Phase 2: Game Feel (Next Week)
6. **Mixamo animations** — import FBX, blend walk/run/jump/attack/swim/climb
7. **Vehicle physics v2** — acceleration, steering angle, chase camera
8. **Water shader v2** — Gerstner waves, depth color, shore foam
9. **Swimming controller** — auto-switch when player enters water
10. **Melee combat** — sword swing, hitbox, damage, enemy HP

### Phase 3: World Building (Week 3)
11. **Building interiors** — enter/exit, furniture, interior lighting
12. **Inventory system** — pickup, equip, use
13. **Climbing system** — surface detection, stamina, ledge grab
14. **NPC schedules** — NPCs go to work, eat, sleep
15. **Quest system** — objectives, dialogue trees, rewards

### Phase 4: Polish (Week 4)
16. **Procedural city generator** — WFC or L-system based
17. **Traffic AI** — NPC cars on roads
18. **Map marketplace** — users sell their maps for credits
19. **Export as standalone** — package scene as single HTML
20. **Mobile optimization** — touch controls, performance tuning

---

## 6. 3D GENERATOR FIX

The Modal endpoint is timing out on cold starts because:
- L4 GPU container takes 30-60 seconds to spin up
- TripoSR model needs to load into VRAM
- First request always fails if container was scaled to zero

**Fix options:**
1. **Keep-alive ping** — cron job hits health endpoint every 5 minutes ($0.50/month extra)
2. **Warm pool** — `min_containers=1` in Modal config ($40/month for always-on L4)
3. **Loading UI** — show "Warming up GPU..." for first request, retry automatically
4. **Fallback to Meshy API** — use Meshy for first request while Modal warms up

**Recommended: Option 3** — client-side retry with loading UI. Cheapest, user just waits 30s extra on first generation.

---

## 7. KEY TAKEAWAYS

1. **Maps need STRUCTURE, not random placement.** This is the single biggest gap.
2. **Animations need Mixamo** — procedural bone rotation looks amateur vs motion-captured anims.
3. **Vehicle physics need real simulation** — acceleration curves, steering angle, suspension.
4. **Water needs Gerstner waves** — sine waves look flat and fake.
5. **Combat needs hitboxes and HP** — can't ship a game engine without combat.
6. **Rosebud is NOT our real competitor** — they do 2D/interactive stories. Our real competitors are Unity/Unreal for 3D world-building in the browser.
7. **The marketplace opportunity is real** — Synty makes millions selling POLYGON packs. We can sell AI-generated map packs for 1/10th the price.

---

## 8. YOUTUBE DEMO RESEARCH — What Quality Looks Like

### Unity Asset Store Map Demos (YouTube)
- **DownTown Promo** (PolyPixel) — 5.6K views. Full city walkthrough with buildings, roads, sidewalks, traffic lights, detailed storefronts. Every building modeled inside and out.
- **Industrial City** (PolyPixel) — 7.3K views. 300+ assets including factories, pipes, smokestacks, cranes, forklifts, containers. Full industrial zone.
- **Urban City Pack** (PolyPixel) — 35K views. "Fully realized environment" with residential and commercial zones, parks, parking lots.
- **Desert Town** (PolyPixel) — 5.8K views. 200+ assets: adobe buildings, cacti, tumbleweeds, market stalls, water wells.
- **"I Made a Game using AI Assets"** (Dog's Dream) — 681K views. Key insight: used AI for concept art → 3D models → textures → animations. Shows the pipeline we need.
- **Beautiful Terrain tutorial** (UGuruz) — 3.3M views. Shows Unity terrain painting: height sculpting, texture layers (grass, rock, snow, dirt), tree/grass painting, water planes.
- **Road Architect tutorial** (UGuruz) — 300K views. Shows procedural road creation: spline-based roads, auto-terrain deformation, guardrails, intersections.

### Key Observations from Demos:

**What makes maps look REAL:**
1. **Density** — Not 10 objects, HUNDREDS. Trees every few meters. Props on every corner.
2. **Variety** — Not 5 "add house" copies. 10-20 unique building variants, each with different textures/shapes.
3. **Ground detail** — Grass blades, puddles, cracks in pavement, leaves, dirt patches. Not flat green.
4. **Vertical layering** — Power lines overhead, underground tunnels, multi-story buildings, rooftop details.
5. **Context** — Things belong where they are. Fire hydrants near buildings, benches near parks, dumpsters behind restaurants.
6. **Lighting** — Baked lightmaps for interiors, volumetric fog/god rays, colored point lights from signs/windows.
7. **Sound zones** — Different ambient sounds in different areas (city noise, forest birds, water rushing).

### Rosebud AI 3D Games (from browsing):
- **3D Multiplayer Template** — 6.6K forks, 19K plays. Basic 3D arena with multiplayer. Simple geometry, no PBR.
- **Crystal Seeker FPS** — 1.6K forks, 8K plays. FPS shooter in browser. Uses Three.js primitives, not GLB models.
- **Cozy Adventure** — 2.2K forks, 7.6K plays. Most forked 3D template. Voxel-style world with character movement.
- **KARTKART** — 23 forks, 12.6K plays. Racing game in browser. Basic kart physics.
- **Cavernous Caution** — 7 forks, 21.3K plays. Most played. Horror cave exploration.

### What Rosebud 3D ACTUALLY looks like:
- Mostly primitives (boxes, spheres) with textures
- Flat lighting, no shadows or PBR
- No terrain system — flat planes or simple heightmaps
- No weather effects
- No animated characters — static models or simple bobbing
- Basic collision — often walk through objects
- Maximum ~50 objects before performance dies

### Three.js Browser Game State-of-the-Art:
- **Bruno Simon's portfolio** (bruno-simon.com) — Gold standard for Three.js. Full 3D scene with vehicle physics, ramps, obstacles. Shows what's POSSIBLE in browser.
- **Sketchfab viewer** — Handles 50M+ poly models in browser with PBR, IBL, post-processing
- **PlayCanvas** — WebGL engine with full editor. GTA-like driving demos, character controllers, physics
- **Babylon.js** — Microsoft's WebGL engine. Has full terrain, water, physics, particle systems

### What We Need to Match PlayCanvas/Babylon Quality:
1. **PBR material system** — We have basic roughness/metalness but need proper texture maps (albedo, normal, roughness, metalness, AO, emissive)
2. **Shadow cascades** — We have dual shadows but need proper CSM with soft edges
3. **Terrain painting** — Multi-texture terrain (grass/dirt/rock/snow blend based on height/slope)
4. **Foliage system** — GPU-instanced grass blades with wind animation
5. **NavMesh** — Proper pathfinding grid, not random wander
6. **Animation system** — State machine with blend trees, not procedural bone rotation
7. **Audio system** — Spatial audio with reverb zones, ambient layers
8. **Physics engine** — Cannon.js or Rapier.js for proper rigid body + vehicle physics

---

## 9. SPECIFIC FEATURE DEMOS TO STUDY

### Driving / Vehicle Physics:
- PlayCanvas has a car demo: proper suspension, wheel rotation, skid marks
- Cannon.js vehicle example: spring/damper system, engine force, steering
- Three.js + Ammo.js vehicle: full raycast vehicle with proper tire physics

### Water / Ocean:
- Three.js Ocean example: FFT-based ocean with Gerstner waves, sun reflection, foam
- Babylon.js Water Material: refraction, reflection, shore foam, caustics
- PlayCanvas Water: planar reflection + refraction, animated shore

### Character Animation:
- Mixamo.com: 2,500+ FREE motion-captured animations, export as FBX/GLB
- Three.js AnimationMixer: blend walk/run/jump/attack, crossfade between clips
- Ready Player Me: full avatar system with Mixamo animation support

### Combat:
- Most Three.js combat games use raycasting for hit detection
- Hitbox approach: attach invisible collision boxes to weapon bones
- Damage numbers: floating text sprites above hit targets

### City Generation:
- Wave Function Collapse (WFC): tile-based procedural generation
- L-systems: road network generation
- Voronoi diagrams: district/zone generation
- Perlin noise: building height variation

### Map Marketplace Revenue ($$$):
- Synty Studios (Unity): $10M+ annual revenue selling POLYGON packs at $150-500 each
- Environment packs outsell all other asset types 3:1
- Average price for a "complete game level": $50-200
- Free demos with premium full versions = best conversion model


---

## 10. VISUAL REFERENCE SCREENSHOTS (Captured)

### Rosebud AI - 3D Multiplayer Template
- Simple colored circles as avatars, dark blue gradient background
- Username + color picker join screen. Very basic 3D.
- **Our engine already beats this visually**

### Rosebud AI - Crystal Seeker FPS  
- Cyberpunk cityscape BACKGROUND IMAGE (2D), not actual 3D
- Gun model in bottom right (likely a sprite/image overlay)
- HUD: Shield 100, Energy 50, Enemies 10
- **It's faking 3D with 2D images + overlays. We're already ahead.**

### PlayCanvas Explore Page
- **Fields of Fury** — isometric 3D battle game, real PBR lighting, proper shadows
- **DAB Motors Configurator** — photorealistic motorcycle viewer
- **BMW i8** — car configurator with real reflections
- **Seemore** — tech demo with foliage, volumetric lighting, PBR materials
- **This is our real target quality level** — PlayCanvas proves browser 3D can look AAA

### Bruno Simon Portfolio
- Loading screen — stylized neon portal design
- Known for: full 3D scene where you drive a toy car through obstacles, physics-based, fully interactive

### Three.js Animation Blending Example
- Soldier model with idle/walk/run crossfading
- 100 FPS, smooth animation blending with weight controls
- **This is EXACTLY what we need for character animation** — AnimationMixer + clipActions with crossfade

### Three.js Ocean Shader
- **STUNNING** — realistic ocean with Gerstner waves, sun reflection, sky gradient, clouds
- 100 FPS at full quality
- Controls: sky elevation/azimuth, water distortion/size, bloom, cloud coverage/density
- **This is the water quality we need** — Three.js has this built in via `Water` class from examples

---

## 11. EXACT THREE.JS FEATURES TO IMPLEMENT

Based on screenshots and demos, here are the specific Three.js classes/examples to port into our engine:

### Water (from three/examples/jsm/objects/Water.js):
```
import { Water } from 'three/examples/jsm/objects/Water.js';
// Creates reflective/refractive water with animated normals
```

### Sky (from three/examples/jsm/objects/Sky.js):
```
import { Sky } from 'three/examples/jsm/objects/Sky.js';
// Procedural sky with sun position, Rayleigh/Mie scattering
```

### Animation Blending (built-in):
```
const mixer = new THREE.AnimationMixer(model);
const idleAction = mixer.clipAction(idleClip);
const walkAction = mixer.clipAction(walkClip);
const runAction = mixer.clipAction(runClip);
// Crossfade between actions with weight blending
```

### Vehicle Physics (cannon-es or rapier):
```
import * as CANNON from 'cannon-es';
// RaycastVehicle with suspension, engine force, steering
```

### Terrain (custom or from community):
- Multi-texture splatmap blending (grass/rock/dirt/snow)
- Height-based texture assignment
- Slope-based texture (steep = rock, flat = grass)
- GPU instanced grass blades with wind

---

## FPS / Weapon System Deep Research (Feb 25, 2026)

### Reference Implementations Studied

#### 1. Three.js Official FPS Example (`games_fps.html`)
- Uses **Octree** for static triangle mesh collision (not bounding boxes)
- WASD movement, SPACE jump, mouse look + throw balls
- No actual weapon model — just ball projectiles
- Good for collision/physics reference, weak for actual FPS gameplay

#### 2. mohsenheydari/three-fps (214 stars, best open-source Three.js FPS)
**Architecture:** Entity/Component system + Finite State Machine (FSM)
- **Weapon.js** — Full weapon component:
  - Attached to camera as child: `this.camera.add(scene)` (first-person view weapon)
  - AK47 model scaled to 0.05, positioned at (0.04, -0.02, 0.0)
  - `AnimationMixer` for idle/reload/shoot animations
  - **WeaponFSM** — state machine for weapon states (idle → shoot → reload)
  - `fireRate: 0.1` (100ms between shots)
  - `magAmmo: 30`, `ammoPerMag: 30`, `ammo: 100`, `damage: 2`
  - **Muzzle flash:** Child of weapon model, additive blending, random rotation/scale per shot, fades with `life` timer
  - **Sound:** `THREE.Audio` with positional sound buffer
  - **Raycasting for hit detection:** Unprojects from camera center (0,0,-1) to (0,0,1), casts through ammo.js physics world
  - **Ammo pickup events:** Entity event system `RegisterEventHandler`
  - **Auto-reload** when mag empty

- **CharacterController.js (NPC)** — Full enemy AI:
  - **FSM states:** idle → patrol → chase → attack → dead
  - **Root motion:** Extracts bone movement from animation, applies to model position
  - **NavMesh pathfinding:** Uses `three-pathfinding` library for nav mesh navigation
  - **Vision cone:** `viewAngle = cos(π/4)` (45° half-angle), `maxViewDistance = 20`, raycasts to check line-of-sight
  - **Attack trigger:** Ghost object (ammo.js) for melee hitbox detection
  - **Health system:** Takes damage from player raycasts, broadcasts 'hit' events
  - **Smooth rotation:** `quaternion.rotateTowards()` for facing player

- **CharacterFSM states:**
  - **Idle:** Wait 1-5s random, check if can see player → chase
  - **Patrol:** Navigate to random NavMesh point, check for player
  - **Chase:** Navigate to player every 0.5s, run animation at 1.5x speed, switch to attack when close
  - **Attack:** Face player, play attack animation, check hitbox overlap, deal damage at 85% of animation
  - **Dead:** Play death animation once, clamp when finished

- **Physics:** ammo.js (Bullet physics compiled to WASM) — collision masks, ghost objects for triggers, rigidbodies

#### 3. Krunker.io Weapon System Analysis
**33 weapons total:** 16 primary, 12 secondary, 2 melee, 6 killstreak
**Weapon categories:**
- **Assault Rifle (Triggerman)** — Full auto, medium damage, ADS
- **Sniper (Hunter)** — Bolt-action, high damage, scope ADS
- **SMG (Run N Gun)** — Fast fire rate, low damage, fast movement
- **Shotgun (Vince)** — Pump action, pellet spread, high close-range damage
- **LMG (Spray N Pray)** — High ammo, slow movement, suppressive fire
- **Semi-auto (Marksman)** — Single tap, medium-high damage
- **Revolver (Detective)** — 6 shots, high damage, slow fire rate
- **Rocket Launcher (Rocketeer)** — Projectile-based, AoE damage
- **Akimbo Uzi (Bowman/Runner)** — Dual-wield, spray pattern
- **Crossbow (Bowman)** — Projectile, one-shot potential
- **Melee (Knife/Fists)** — Close range, instant kill from behind
- **Charge Rifle** — Hold to charge, release for damage

**Key mechanics per weapon:**
- Fire rate (RPM)
- Damage (body/head multipliers — headshot 1.5-2.5x)
- Spread (hipfire vs ADS)
- Reload time
- Movement speed modifier
- Magazine size
- ADS zoom level
- Recoil pattern (vertical + horizontal)
- Swap speed

#### 4. Weapon Attachment to Bones (Three.js)
**The standard approach for equipping weapons on NPCs:**
```javascript
// Find the hand bone in the skeleton
const handBone = model.skeleton.bones.find(b => b.name === 'RightHand');
// OR traverse the scene graph
model.traverse(child => {
  if (child.isBone && child.name === 'mixamorigRightHand') {
    handBone = child;
  }
});

// Attach weapon as child of bone
handBone.add(weaponModel);
weaponModel.position.set(0, 0, 0); // Adjust offset
weaponModel.rotation.set(0, 0, 0); // Adjust rotation
weaponModel.scale.set(1, 1, 1);    // Adjust scale
```

**Common bone names (Mixamo standard):**
- `mixamorigRightHand` / `mixamorigLeftHand`
- `mixamorigRightHandIndex1` (for pistol grips)
- `mixamorigSpine2` (back-mounted weapons)
- `mixamorigHead` (helmets)

**Socket system (Unity-style):**
- Add empty `THREE.Object3D` as "socket" child of hand bone
- Weapons attach to socket, socket has pre-configured offset/rotation
- Allows hot-swapping weapons without recalculating positions

### What Crate Engine Needs (Gap Analysis)

#### Current State (v63)
- Basic `shooterMode` with red capsule enemies
- Raycasting bullet hits
- HP/ammo/reload
- No actual weapon models
- No weapon attachment to character bones
- No NPC weapons (NPCs can't shoot back)
- No weapon switching
- No ADS (aim down sights)
- No recoil
- No weapon categories
- No muzzle flash
- No sound effects
- No melee weapons

#### Required Systems (Priority Order)

**1. Weapon Definition System**
```javascript
const WEAPONS = {
  pistol:    { type: 'semi', damage: 25, fireRate: 0.3, magSize: 12, reloadTime: 1.5, spread: 0.02, recoil: 0.03, range: 50, headshotMult: 2.0, model: 'pistol.glb' },
  rifle:     { type: 'auto', damage: 18, fireRate: 0.1, magSize: 30, reloadTime: 2.2, spread: 0.03, recoil: 0.04, range: 80, headshotMult: 1.5, model: 'ak47.glb' },
  shotgun:   { type: 'pump', damage: 12, fireRate: 0.8, magSize: 6,  reloadTime: 3.0, spread: 0.15, recoil: 0.08, range: 15, pellets: 8, headshotMult: 1.5, model: 'shotgun.glb' },
  sniper:    { type: 'bolt', damage: 90, fireRate: 1.2, magSize: 5,  reloadTime: 3.5, spread: 0.0,  recoil: 0.12, range: 200, headshotMult: 2.5, adsZoom: 4, model: 'sniper.glb' },
  smg:       { type: 'auto', damage: 12, fireRate: 0.06, magSize: 35, reloadTime: 1.8, spread: 0.04, recoil: 0.02, range: 40, headshotMult: 1.5, model: 'smg.glb' },
  rpg:       { type: 'projectile', damage: 100, fireRate: 2.0, magSize: 1, reloadTime: 3.0, blastRadius: 5, model: 'rpg.glb' },
  sword:     { type: 'melee', damage: 40, fireRate: 0.5, range: 3, model: 'sword.glb' },
  bow:       { type: 'charge', damage: 60, chargeTime: 1.5, range: 100, model: 'bow.glb' },
};
```

**2. Weapon Equip System (Bone Attachment)**
- Find hand bone on any SkinnedMesh NPC/character
- Attach weapon GLB model as child of hand bone
- Pre-configured socket offsets per weapon type
- Hot-swap: `equipWeapon(npc, 'rifle')` / `unequipWeapon(npc)`
- Visual: weapon moves with character animations naturally
- Commands: `"give npc rifle"`, `"equip sword"`, `"arm npc with shotgun"`

**3. First-Person Weapon View**
- Weapon model attached to camera (like three-fps)
- Weapon sway on movement (procedural)
- ADS: lerp weapon position + camera FOV
- Muzzle flash (additive blending sprite at barrel tip)
- Shell ejection particles
- Weapon bob while walking

**4. NPC Weapon AI**
- NPCs with weapons use FSM: idle → patrol → alert → engage → retreat → dead
- **Engage state:** Face player, aim weapon, fire at intervals based on weapon fireRate
- **Accuracy system:** NPC spread increases with distance, decreases with time aiming
- **Cover system (advanced):** NPCs seek cover objects, peek-shoot pattern
- **Ammo awareness:** NPCs reload, switch to secondary when out
- Commands: `"add enemy with rifle"`, `"spawn friendly npc with sword"`, `"add guard with shotgun"`

**5. Hit Detection & Damage**
- **Raycasting** for hitscan weapons (pistol, rifle, sniper, shotgun)
- **Projectile physics** for RPG, bow (actual moving mesh with velocity)
- **Headshot detection:** Check ray intersection against head bounding sphere
- **Damage falloff:** Reduce damage at range (except sniper)
- **Armor/shield system** (future)

**6. Weapon Pickup System**
- Weapons spawn as ground objects with glow/outline
- Walk over to pickup (trigger volume)
- Hold max 2 weapons (primary + secondary) + melee
- Drop current weapon on swap
- Commands: `"add weapon pickup rifle at 10 20"`, `"drop weapon"`

**7. HUD System**
- Crosshair (dynamic — expands with movement/firing)
- Health bar + armor bar
- Ammo counter (mag / reserve)
- Weapon icon
- Hit marker (flash on successful hit)
- Damage direction indicator
- Kill feed
- Minimap with enemy dots

### Free Weapon Models (GLB Sources)
- **Sketchfab CC0/CC-BY:** AK47, pistol, shotgun, sniper, sword, bow
- **Kenney.nl:** Low-poly weapon pack (free, CC0)
- **Poly Pizza:** Various weapon models
- **Mixamo:** Character + weapon combo animations (rifle idle, rifle walk, pistol shoot)

### Implementation Priority for Crate Engine
1. **Weapon data definitions** (just the JSON config) — 30 min
2. **Bone attachment utility** (`equipWeapon(mesh, weaponDef)`) — 2 hours
3. **First-person weapon view** (camera child, sway, ADS) — 4 hours
4. **Upgrade shooter system** (replace red capsules with actual weapon raycasting + muzzle flash) — 3 hours
5. **NPC weapon equip** (any NPC can hold any weapon visually) — 2 hours
6. **NPC shooting AI** (engage state, fire at player) — 4 hours
7. **Weapon switching** (1-3 keys, scroll wheel) — 1 hour
8. **Weapon pickups** — 2 hours
9. **Enhanced HUD** — 3 hours
10. **Sound effects** — 2 hours

**Total estimate: ~23 hours of focused dev work**

### Commands to Support
- `"equip rifle"` / `"equip sword"` / `"equip sniper"` — player weapon
- `"give npc rifle"` / `"arm npc with shotgun"` — NPC weapon
- `"add enemy with rifle"` / `"spawn guard with sword"` — spawn armed NPC
- `"add weapon pickup pistol"` — ground weapon
- `"switch weapon"` / `"weapon 1"` / `"weapon 2"` — swap
- `"drop weapon"` — drop current
- `"ads on"` / `"ads off"` — aim down sights toggle

### Key Takeaways
1. **Krunker proves browser FPS works** — millions of players, complex weapon systems, all in browser
2. **Bone attachment is THE way** to equip weapons on characters — `bone.add(weaponModel)`, standard Three.js
3. **Weapon FSM is essential** — idle/shoot/reload states, not just "click = damage"
4. **NPC AI needs proper FSM** — our current NPC wander is too simple. Need vision cone, alert/engage/retreat states
5. **Raycasting is fine for hitscan** — no need for ammo.js/cannon.js just for bullets. Only projectile weapons (RPG, bow) need physics
6. **Muzzle flash + sound = 80% of the feel** — even with simple geometry, good VFX makes it feel real
7. **Headshot detection** — just check if ray intersects with a sphere at head bone position
8. **Mixamo has weapon animations** — rifle idle, rifle walk, pistol shoot etc. already rigged for standard skeleton

