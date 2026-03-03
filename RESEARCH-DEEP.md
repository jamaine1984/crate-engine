# Crate Engine — Deep Research: 100+ Game Engine Demos & Best Practices

## Summary of Findings

After studying Sketchbook (1.7k⭐), SimonDev's character controller, three-fps (214⭐), THREE.Terrain (838⭐), Rapier physics, Krunker.io's weapon system, and 50+ other Three.js game implementations, here is the definitive upgrade plan.

---

## 1. CHARACTER ANIMATION SYSTEM (Current: 3/10 → Target: 9/10)

### What Top Engines Do:
- **Finite State Machine (FSM)** for all character states (Idle, Walk, Run, Sprint, Jump, Fall, Roll, Climb, Swim, Attack, Die)
- **Animation crossfading** via `THREE.AnimationMixer.crossFadeFrom()` with 0.1-0.5s blend times
- **Root motion** — animation drives character position (more natural than code-driven movement)
- **Mixamo animations** — industry standard, free, works with any humanoid rig
- **Animation layers** — upper body can aim/shoot while lower body walks (additive blending)
- **IK (Inverse Kinematics)** — feet conform to terrain slopes, hands grip objects

### Implementation Plan:
```
CharacterStateMachine:
  states: Idle → Walk → Run → Sprint → Jump → Fall → Land → Roll → Climb → Swim → Attack → Die
  transitions: each state defines valid transitions + conditions
  blending: crossFadeFrom(prevAction, blendTime=0.2)
  
Animation Loading (Mixamo FBX/GLB):
  - idle.glb, walk.glb, run.glb, sprint.glb
  - jump.glb, falling.glb, landing.glb
  - roll.glb, dodge_left.glb, dodge_right.glb  
  - climb_up.glb, climb_idle.glb
  - swim.glb, swim_idle.glb
  - attack_1.glb, attack_2.glb, attack_combo.glb
  - die.glb, hit_reaction.glb
  
Key Pattern (from SimonDev):
  const action = mixer.clipAction(clip);
  action.time = 0;
  action.enabled = true;
  action.setEffectiveTimeScale(1.0);
  action.crossFadeFrom(prevAction, 0.2, true);
  action.play();
```

### Estimated Time: 6 hours

---

## 2. MOVEMENT SYSTEM (Current: 4/10 → Target: 9/10)

### What Top Engines Do (Sketchbook Pattern):
- **Spring-based velocity simulation** — smooth acceleration/deceleration curves
- **Capsule collider** for character (not box) — slides along walls naturally
- **Raycast grounding** — detect ground type, slope angle, step height
- **Orientation smoothing** — character rotates to face movement direction with lerp
- **Deceleration vectors** — separate friction per axis (x, y, z)
- **Variable speed**: Walk 4m/s → Run 7m/s → Sprint 10m/s

### Climbing System (Assassin's Creed style):
```
- Raycast forward from chest height → detect wall
- Raycast up from top of head → detect ledge
- If wall + ledge within reach → trigger climb state
- Vertical movement along wall surface normal
- Ledge grab → pull-up animation
```

### Swimming System:
```
- Detect water plane intersection with character Y
- Below water_surface_y - 0.5 → swim mode
- Buoyancy force: push up when below surface
- WASD horizontal, Space = surface, Shift = dive
- Different camera (closer, slight blue tint)
```

### Estimated Time: 8 hours

---

## 3. DRIVING / VEHICLES (Current: 5/10 → Target: 8/10)

### What Top Engines Do:
- **Arcade physics model** (not simulation) — GTA-style fun over realism
- **Suspension simulation** — 4 raycasts from wheel positions, spring force
- **Speed-dependent steering** — tighter at low speed, wider at high (already have this)
- **Drift mechanics** — when turning hard at speed, reduce lateral grip
- **Camera improvements**: 
  - Smooth orbit behind vehicle (slerp, not snap)
  - FOV increases with speed (60° → 75°)
  - Camera shake at high speed
  - Look-ahead offset when turning
- **Vehicle entry/exit animation** (Sketchbook has this)
- **Dashboard HUD**: speedometer, tachometer, gear indicator

### Key Code Pattern (from Sketchbook Car.ts):
```
// Wheel raycasts for suspension
for each wheel:
  rayFrom = wheel.position (world)
  rayTo = rayFrom + down * suspensionLength
  result = physics.raycast(rayFrom, rayTo)
  if hit:
    compression = 1 - (hitDistance / suspensionLength)
    force = springConstant * compression - damping * wheelVelocity
    body.applyForce(up * force, wheelPosition)
```

### Drift Formula:
```
lateralVelocity = velocity.dot(right)
if turnInput && speed > threshold:
  lateralGrip *= 0.3  // reduce grip = drift
  driftAngle = atan2(lateralVelocity, forwardVelocity)
  tire marks = emit particles along wheel contact
```

### Estimated Time: 5 hours

---

## 4. COMBAT / SHOOTING (Current: 1/10 → Target: 8/10)

### FPS Weapon System (from three-fps):
```
WeaponFSM states: Idle → Shoot → Reload
- Idle: weapon sway (sin wave on position)
- Shoot: 
  - Recoil: camera.rotation.x -= recoilAmount (spring back)
  - Muzzle flash: additive blending sprite, 0.05s lifetime
  - Bullet trail: LineGeometry from barrel to hit point, fade 0.2s
  - Impact: particle burst at hit point + decal texture
  - Raycasting: camera forward direction → first hit
  - Spread: add random offset to ray direction (increases over time)
  - Fire rate: timer-based (0.1s for auto, 0.5s for semi)
- Reload: play reload animation, LoopOnce, 2-3s duration
```

### Melee Combat (Dark Souls style):
```
CombatFSM states: Idle → WindUp → Attack → Recovery → Block → Dodge
- Attack hitbox: sphere/box trigger attached to weapon bone
- Damage window: only during active frames (0.2-0.5s of animation)
- Stamina system: attacks/dodges cost stamina, regenerates
- i-frames: during dodge roll, disable hit detection for 0.3s
- Combo system: if attack during recovery → chain to next attack
- Lock-on: orbit camera around target, strafe instead of turn
```

### Damage Numbers:
```
- Sprite text at hit position
- Float upward + fade out over 1s
- Color: white=normal, yellow=crit, red=player damage
- Scale pulse on spawn
```

### Estimated Time: 10 hours

---

## 5. TERRAIN & MAPS (Current: 3/10 → Target: 8/10)

### Procedural Terrain (from THREE.Terrain):
```
Options:
  heightmap: DiamondSquare | Perlin | SimplexLayers
  xSegments: 127, ySegments: 127 (128x128 vertices)
  maxHeight: 50, minHeight: -10
  
Biome Painting:
  - Vertex colors based on height + slope
  - height < 0: water (blue)
  - height < 5: sand (tan) 
  - height < 25 && slope < 30°: grass (green)
  - height < 25 && slope > 30°: cliff (brown/gray)
  - height < 40: rock (gray)
  - height > 40: snow (white)
  
Material: ShaderMaterial with texture splatting
  - 4 textures blended by vertex weights
  - Normal maps for detail
  - Triplanar mapping for cliffs (no stretching)
```

### Map Layout System (replacing current sequential commands):
```json
{
  "name": "Medieval Village",
  "terrain": {
    "type": "perlin",
    "size": 500,
    "maxHeight": 30,
    "biomes": ["grass", "dirt", "stone"]
  },
  "structures": [
    {"type": "castle", "position": [0, 0, 0], "rotation": 0, "scale": 1.5},
    {"type": "house", "position": [20, 0, 15], "count": 5, "spread": 8},
    {"type": "wall", "path": [[−50,0,−50], [50,0,−50], [50,0,50], [−50,0,50]], "height": 5}
  ],
  "npcs": [
    {"type": "villager", "count": 10, "zone": {"center": [0,0,0], "radius": 40}},
    {"type": "knight", "count": 3, "behavior": "patrol", "path": "walls"}
  ],
  "environment": {
    "time": "afternoon",
    "weather": "clear",
    "music": "medieval_ambient"
  }
}
```

### Hills & Mountains:
```
// Perlin noise terrain with multiple octaves
function generateTerrain(width, depth, segments) {
  const geo = new THREE.PlaneGeometry(width, depth, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const vertices = geo.attributes.position.array;
  
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i], z = vertices[i + 2];
    let height = 0;
    // Multiple octaves for natural look
    height += noise.perlin2(x * 0.005, z * 0.005) * 40;  // big hills
    height += noise.perlin2(x * 0.02, z * 0.02) * 10;    // medium detail
    height += noise.perlin2(x * 0.1, z * 0.1) * 2;       // small bumps
    vertices[i + 1] = height;
  }
  geo.computeVertexNormals();
  return geo;
}
```

### Estimated Time: 8 hours

---

## 6. VISUAL POLISH (Current: 5/10 → Target: 9/10)

### Post-Processing Stack:
```
1. SSAO (already have) — ambient occlusion in crevices
2. Bloom (already have) — glow on bright surfaces
3. Cascade Shadow Maps — better shadow quality at distance
4. Volumetric Fog — depth-based fog with light scattering
5. God Rays — directional light shafts through trees/buildings
6. Screen-Space Reflections — real-time reflections on wet/shiny surfaces  
7. Motion Blur — subtle on camera movement, strong on sprint
8. Depth of Field — blur background when aiming/in menus
9. Color Grading (already have) — LUT-based
10. FXAA/SMAA (already have) — anti-aliasing
```

### Day/Night Cycle:
```
sunPosition = spherical(radius=100, theta=timeOfDay * PI, phi=0.2)
light.position.copy(sunPosition)
light.color.setHSL(0.1, 0.7, timeOfDay > 0.5 ? 1 : timeOfDay * 2)
sky.material.uniforms.sunPosition = sunPosition
ambientLight.intensity = 0.1 + Math.max(0, Math.sin(timeOfDay * PI)) * 0.5
// Stars appear when sun below horizon
starField.visible = timeOfDay < 0.2 || timeOfDay > 0.8
```

### PBR Material Enhancement:
```
- Normal maps on all surfaces (bumpy stone, wood grain, metal scratches)
- Roughness/metalness maps (shiny metal, rough wood)
- Environment map reflections (HDRI)
- Emissive maps for glowing objects (lava, magic, neon signs)
```

### Estimated Time: 6 hours

---

## 7. UI / HUD (Current: 4/10 → Target: 8/10)

### Health/Mana/Stamina Bars:
```
- Health: Red bar, top-left, pulse animation when low
- Mana/Energy: Blue bar below health
- Stamina: Green bar, depletes on sprint/dodge/attack, regens after 1s delay
- Boss health: Wide bar at top-center, name + title
```

### Mini-Map:
```
- Top-right corner, 150x150px circular
- Orthographic camera looking down at player
- Green dot = player, red dots = enemies, blue = NPCs
- Rotate with player facing
- Fog of war (unexplored areas dark)
```

### Inventory System:
```
- Grid-based (8x4 slots)
- Drag and drop items
- Tooltip on hover (name, stats, description)
- Equipment slots: head, chest, legs, feet, weapon, shield
- Item rarity colors: white/green/blue/purple/gold
```

### Damage Indicators:
```
- Red arc on screen edge showing damage direction
- Screen flash red on hit
- Blood vignette at low health
- Floating damage numbers
- Hit marker (crosshair flash) when you deal damage
```

### Estimated Time: 6 hours

---

## IMPLEMENTATION PRIORITY (Sub-Agent Assignments)

### Agent 1: Animation & Movement System (14 hours)
- Implement FSM-based character states
- Mixamo animation loading + crossfading
- Climbing, swimming, dodge/roll
- Third-person camera improvements
- Sprint with FOV change

### Agent 2: Combat & Weapons (10 hours)
- FPS weapon system (WeaponFSM: idle/shoot/reload)
- Melee combat with hitboxes
- Damage numbers, hit effects
- Stamina system
- Weapon attachment to hand bones (fix current bug)

### Agent 3: Terrain, Maps & World (8 hours)
- Perlin noise terrain with biomes
- JSON map layout system
- Hills, mountains, cliffs
- Rivers/lakes on terrain
- Proper map templates (20+ presets)

### Agent 4: Visual Polish & UI (12 hours)
- Volumetric fog, god rays
- Day/night cycle improvement
- Motion blur, DOF
- Mini-map, health/stamina bars
- Inventory system
- Damage indicators
- Better driving camera + vehicle HUD

### TOTAL: ~44 hours of work → 4 agents = ~11 hours each

---

## KEY REPOS STUDIED
1. swift502/Sketchbook (1.7k⭐) — Character controller, vehicles, FSM, camera
2. simondevyoutube/ThreeJS_Tutorial_CharacterController — FSM, animation blending
3. mohsenheydari/three-fps (214⭐) — FPS weapons, NPC AI, shooting mechanics
4. IceCreamYou/THREE.Terrain (838⭐) — Procedural terrain generation
5. alexanderperrin/threejs-ballooning (558⭐) — Terrain, sky, atmosphere
6. Rapier.rs — WASM physics (10x faster than cannon.js)
7. Krunker.io source patterns — 33 weapon types, weapon data structures
8. Three.js official examples — skinning, blending, water, shadows
9. WesUnwin/three-game-engine (72⭐) — Rapier integration pattern
10. AlaricBaraworWorku/CS-THREE.JS — Krunker-style FPS
