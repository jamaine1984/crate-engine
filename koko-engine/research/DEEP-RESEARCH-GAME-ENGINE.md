# Deep Research: How Real Game Engines Work
## Compiled from studying Sketchbook, Ecctrl, PlayCanvas, Unity, Babylon.js, Yuka AI

---

## 1. CHARACTER CONTROLLER (Sketchbook Pattern — Gold Standard for Three.js)

### Architecture
- **Character extends THREE.Object3D** — IS a scene object
- **CapsuleCollider** for physics (not bounding box, not mesh)
- **Spring Simulators** for velocity and rotation (VectorSpringSimulator, RelativeSpringSimulator)
- **State Machine** for character states (Idle, Walk, Run, Jump, Fall, etc.)
- **Model Container** — model is placed INSIDE a container, offset by -0.57 to ground it reliably
  - `this.modelContainer.position.y = -0.57` — THIS is how you ground characters!
  - Animation won't affect grounding because model is inside container

### Key Properties
```
height, tiltContainer, modelContainer, materials, mixer, animations
acceleration, velocity, arcadeVelocityInfluence, velocityTarget
moveSpeed (default: 4), angularVelocity, orientation, orientationTarget
characterCapsule (CapsuleCollider — mass:1, height:0.5, radius:0.25)
rayCastLength: 0.57, raySafeOffset: 0.03
groundImpactData (for landing effects)
```

### State Machine Pattern (THIS IS HOW REAL GAMES DO IT)
Each state is a separate class:
- `Idle` — plays 'idle' animation, transitions to Walk on movement, JumpIdle on jump
- `Walk` — plays 'walk' animation, transitions to Run on sprint, Idle on stop
- `Run` — plays 'run', transitions to Sprint
- `JumpIdle` — from standing, plays 'jump'
- `JumpRunning` — from running, different jump animation
- `Falling` — gravity state
- `EnteringVehicle, ExitingVehicle, Driving` — vehicle states!

Each state has:
```typescript
constructor(character) — set velocitySimulator params, play animation
update(timeStep) — physics update
onInputChange() — handle input transitions
```

**OUR PROBLEM**: We don't have a state machine. Our character does everything in one giant update function. That's why animations are janky and state transitions feel wrong.

### Grounding System
- **CapsuleCollider** centered on character
- Raycasts from capsule center downward
- `rayCastLength: 0.57` — matches capsule height
- `raySafeOffset: 0.03` — prevents floating
- Physics body has `fixedRotation = true` — character doesn't tip over!
- **NO manual Y position setting** — physics handles it

**OUR PROBLEM**: We manually set Y position every frame via raycasting. This causes jitter and sinking. Real games let physics handle vertical position.

---

## 2. CAMERA SYSTEM (Sketchbook + Ecctrl Patterns)

### Sketchbook Camera
```typescript
class CameraOperator {
  radius: number = 1           // Distance from target
  theta: number                // Horizontal angle (degrees)
  phi: number                  // Vertical angle (degrees, clamped -85 to 85)
  targetRadius: number = 1     // Desired radius (lerps toward this)
  sensitivity: Vector2         // Mouse sensitivity
  followMode: boolean = false  // Lock to character
}
```

Camera position calculated from spherical coordinates:
```
x = target.x + radius * sin(theta) * cos(phi)
y = target.y + radius * sin(phi)
z = target.z + radius * cos(theta) * cos(phi)
camera.lookAt(target)
```

Radius lerps smoothly: `radius = lerp(radius, targetRadius, 0.1)`

### Ecctrl (Modern React Three.js)
```typescript
camInitDis = -5      // Initial distance
camMaxDis = -7       // Max zoom out
camMinDis = -0.7     // Min zoom in (almost first person!)
camUpLimit = 1.5     // rad — look up limit
camLowLimit = -1.3   // rad — look down limit
camCollision = true  // Camera collision with walls
camCollisionOffset = 0.7
camFollowMult = 11   // How quickly camera follows
camLerpMult = 25     // Camera smoothing
```

### Camera Collision (Critical!)
Both engines raycast from character to camera position:
```
direction = normalize(cameraPosition - characterPosition)
ray = new Raycaster(characterPosition, direction, 0.3, distance)
if (ray hits something) {
  cameraPosition = hitPoint - direction * offset
}
```
This prevents camera going through walls/terrain.

**OUR PROBLEM**: Our camera collision exists but is basic. We should use the spherical coordinate system instead of manual offset calculations. The phi/theta approach is much cleaner.

---

## 3. WEAPON SYSTEM — How Real Games Do It

### Bone Socket System (Unity Pattern)
Unity uses **Avatar** system with **HumanBodyBones**:
- `HumanBodyBones.RightHand` — where weapons attach
- `HumanBodyBones.LeftHand` — shield, offhand
- `HumanBodyBones.Spine` — holstered weapons (back)
- `HumanBodyBones.Hips` — holstered pistols

Weapon attachment: `weapon.transform.SetParent(hand.transform)`

### For Three.js (what we should do):
1. **Find bone by name** — GLB models from Mixamo use standard names:
   - `mixamorigRightHand`, `mixamorigLeftHand`
   - `mixamorigSpine2` (upper back for holster)
   - `mixamorigRightForeArm` (fallback if no hand bone)
2. **Attach weapon as child of bone**: `bone.add(weaponMesh)`
3. **Offset & rotation**: Each weapon type has specific holdOffset/holdRotation
4. **Scale weapon to CHARACTER scale, not bounding box**

### Weapon Scale (THE FIX)
The weapon mesh should be designed at a known scale relative to the character.
If character is ~1.8 units tall, a sword blade should be ~0.6 units.
When auto-scaling character (e.g., from raw 100 units → 1.8 units, scale factor = 0.018),
the weapon should scale by the SAME factor:
```
weaponScale = character.model.scale.x
```
NOT `Box3.setFromObject()` which includes bones extending far beyond the mesh!

**OUR EXACT BUG**: We were using bounding box height (which includes armature bones stretching 70+ units) to calculate weapon scale. The bones are NOT visual but Box3 includes them.

---

## 4. ANIMATION SYSTEM

### Blend Trees (How Unity/Unreal do it)
Real engines use animation blend trees:
- **1D Blend**: Speed parameter → blend between idle(0), walk(0.5), run(1.0)
- **2D Blend**: Direction + Speed → 8-directional movement animations
- **Additive**: Layer additons (breathing on top of any state)
- **Override**: Upper body aims gun while lower body walks

### Three.js AnimationMixer Pattern
```javascript
mixer = new THREE.AnimationMixer(model)
// Crossfade between animations
currentAction.crossFadeTo(newAction, duration, warpBoolean)
newAction.reset().play()
```

### State-Based Animation (Sketchbook)
Each CharacterState plays its own animation:
```typescript
// In Idle constructor:
this.playAnimation('idle', 0.1) // name, crossfade duration

// playAnimation resolves to:
mixer.clipAction(clip).reset().setEffectiveTimeScale(1).setEffectiveWeight(1).crossFadeFrom(previous, duration).play()
```

**OUR PROBLEM**: We play animations in the update loop, not in state transitions. This causes constant restarting. Should only change animation when STATE changes.

### Mixamo Animation Names (Standard for KayKit models)
KayKit characters use either:
- No prefix: `idle`, `walk`, `run`, `jump`
- With prefix: `HumanArmature|idle`, `CharacterArmature|Run`

The animation prefix is model-specific. We need to detect it at load time:
```javascript
const clip = gltf.animations[0];
const prefix = clip.name.includes('|') ? clip.name.split('|')[0] + '|' : '';
```

---

## 5. NPC AI SYSTEM (Yuka Library Patterns)

### Steering Behaviors (Professional NPC Movement)
Yuka library provides these steering behaviors:
- **SeekBehavior** — move toward target
- **FleeBehavior** — move away from target  
- **ArriveBehavior** — seek but decelerate on approach
- **PursuitBehavior** — predict target's future position and seek there
- **EvadeBehavior** — predict and flee
- **WanderBehavior** — random exploration (NOT random direction changes!)
- **FollowPathBehavior** — follow waypoints
- **ObstacleAvoidanceBehavior** — avoid collisions
- **SeparationBehavior** — keep distance from others
- **AlignmentBehavior** — match direction of group
- **CohesionBehavior** — stay near group center

### State Machine for NPCs (Yuka Pattern)
```
StateMachine → manages states
  IdleState → stand, look around
  PatrolState → follow patrol path (FollowPathBehavior)
  ChaseState → pursuit player (PursuitBehavior)
  AttackState → stop, play attack animation
  FleeState → run away when low health
```

Transitions based on:
- **Line of sight** — raycast to player
- **Distance** — trigger radius
- **Health** — flee threshold
- **Aggro timer** — time in combat

**OUR PROBLEM**: Our NPCs have simple wander/patrol with random waypoints. They need:
1. Proper steering behaviors (not random direction)
2. State machines (not behavior strings)
3. Line-of-sight detection
4. Group coordination

---

## 6. UI/HUD SYSTEM

### Professional HUD Layout (AAA Standard)
```
┌─────────────────────────────────────────────┐
│ [HP BAR]          [COMPASS]      [MINIMAP]  │
│ [STAMINA]                                   │
│ [Status Effects]                             │
│                                              │
│                                              │
│                  [CROSSHAIR]                 │
│                                              │
│                                              │
│                              [WEAPON ICON]   │
│ [INTERACT]       [AMMO: 30/90]              │
│ [QUEST TRACKER]              [ITEM HOTBAR]  │
└─────────────────────────────────────────────┘
```

Key patterns:
- Health/Stamina bars: top-left, with smooth lerp on damage
- Crosshair: center, changes on aim/spread
- Ammo: bottom-right, near weapon
- Minimap: top-right, rotates with player
- Interact prompt: bottom-center, contextual
- Quest tracker: left side, collapsible
- Damage indicators: screen-edge red flash from damage direction
- Hit markers: center, flash on successful hit
- Kill feed: top-right, recent kills scroll
- Floating damage numbers: pop up from enemies

### Important: UI should be pure HTML/CSS overlays
Don't render UI in WebGL. Use DOM elements:
```html
<div id="hud" style="position:fixed; pointer-events:none;">
  <div id="health-bar">...</div>
  <div id="crosshair">+</div>
  ...
</div>
```
This is faster, sharper, and accessible.

---

## 7. SCENE/WORLD MANAGEMENT

### Loading Pattern (Sketchbook)
- World class manages everything
- `updatables[]` array — everything that needs update registered here
- `updateOrder` property on each updatable for priority:
  - 1: Characters
  - 2: Vehicles  
  - 3: Other
  - 4: Camera (always last!)
- Physics runs at fixed timestep (60Hz) independent of render framerate
- Graphics render as fast as possible

### Entity-Component Pattern
Real engines separate:
- **Entity** — just an ID
- **Transform** — position, rotation, scale
- **Renderer** — mesh, material
- **Collider** — physics shape
- **Script** — behavior logic
- **Animator** — animation state machine

**OUR PROBLEM**: Everything is smashed together. Objects are just meshes with userData. No proper component system.

---

## 8. INPUT SYSTEM (Sketchbook Pattern)

### Key Bindings
```typescript
actions = {
  'up': new KeyBinding('KeyW'),
  'down': new KeyBinding('KeyS'),
  'left': new KeyBinding('KeyA'),
  'right': new KeyBinding('KeyD'),
  'run': new KeyBinding('ShiftLeft'),
  'jump': new KeyBinding('Space'),
  'use': new KeyBinding('KeyE'),
  'enter': new KeyBinding('KeyF'),
  'primary': new KeyBinding('Mouse0'),
  'secondary': new KeyBinding('Mouse1'),
}
```

Each KeyBinding tracks:
- `isPressed` — currently held
- `justPressed` — pressed this frame only (for one-shot actions)
- `justReleased` — released this frame

### Input Receiver Pattern
- `InputManager` receives all raw input
- Current `inputReceiver` (Character, Camera, Vehicle) processes it
- When entering vehicle: `inputManager.setInputReceiver(vehicle)`
- When exiting: `inputManager.setInputReceiver(character)`

**OUR PROBLEM**: We have raw event listeners scattered everywhere. No unified input system. No rebindable keys.

---

## 9. PHYSICS WITHOUT AMMO.JS

### Ecctrl Pattern (Rapier Physics — lightweight)
Uses capsule collider + raycasting:
```
capsuleHalfHeight = 0.35
capsuleRadius = 0.3
floatHeight = 0.3
springK = 1.2        // Spring force pushing character up
dampingC = 0.08      // Damping to prevent oscillation
```

Character "floats" above ground on a spring:
```
if (rayHit) {
  floatingForce = springK * (floatingDis - hitDistance) - dampingC * verticalVelocity
  applyForce(0, floatingForce, 0)
}
```

This eliminates:
- Jitter when standing on surfaces
- Clipping into ground
- Needs for exact Y positioning

### Slope Handling
```
slopeMaxAngle = 1.0 rad (~57 degrees)
slopeUpExtraForce = 0.1    // Push harder going uphill
slopeDownExtraForce = 0.2  // Gravity assist downhill
```

Raycast checks slope angle. If too steep, character slides down.

### Stairs
- Multiple raycasts at different heights
- If low raycast blocked but high raycast clear → step up
- Smooth vertical interpolation during step

---

## 10. WHAT WE NEED TO FIX (Priority Order)

### CRITICAL (Do First)
1. **Character State Machine** — Idle/Walk/Run/Jump/Fall/Attack states with proper transitions
2. **Model Container pattern** — `modelContainer.position.y = -offset` for reliable grounding
3. **Weapon scale from model.scale, not bounding box**
4. **Spherical coordinate camera** — theta/phi system, not manual offset
5. **Animation crossfade on state change only** — not in update loop

### HIGH PRIORITY
6. **Capsule collider** (raycast-based, no physics lib needed) for character
7. **Input system** — unified KeyBinding with justPressed/justReleased
8. **NPC State Machine** — Idle/Patrol/Chase/Attack/Flee
9. **Proper bone detection** — traverse skeleton for standard bone names
10. **Camera collision** — raycast from character to camera, pull camera forward if hit

### MEDIUM
11. **Update order system** — characters first, camera last
12. **Fixed timestep physics** — decouple physics from render framerate
13. **Spring-based ground following** — eliminate jitter
14. **Slope handling** — angle check, slide if too steep
15. **Steering behaviors for NPCs** — seek, flee, wander, pursue

### NICE TO HAVE
16. **Entity-Component system** — separate concerns
17. **Animation blend trees** — smooth transitions
18. **IK (Inverse Kinematics)** — feet on uneven ground, look-at target
19. **Ragdoll on death** — disable animator, enable physics
20. **Vehicle system** — character enters/exits, camera switches

---

## 11. APPLYING EXTERNAL ANIMATIONS TO CHARACTERS (Critical Finding!)

### The Problem
KayKit modular characters (Adventurer, SWAT, King, etc.) have:
- Full 49-joint skeleton (Hand.R, Hips, Chest, Fingers, etc.)
- ZERO embedded animations
- Need external animation files applied via AnimationMixer

Knight character has:
- Full skeleton + 12 embedded animations (Idle, Walk, Run, Attack, Death, Roll, Jump)
- Proper combat animations including sword attacks!

Soldier character has:
- Mixamo skeleton (mixamorig: prefix) + 4 animations (Idle, Run, TPose, Walk)

### Solution: Animation Retargeting
To apply animations from one skeleton to another in Three.js:

#### Option A: Same Skeleton Structure (Best)
If source and target have matching bone names, just:
```javascript
const mixer = new THREE.AnimationMixer(targetModel);
const clip = sourceAnimation.clone(); // Clone the animation clip
mixer.clipAction(clip).play();
```

#### Option B: Name Mapping (When names differ)
Map bone names between skeletons:
```javascript
const boneMap = {
  'mixamorig:Hips': 'Hips',
  'mixamorig:Spine': 'Abdomen',
  'mixamorig:Spine1': 'Torso',
  'mixamorig:Spine2': 'Chest',
  'mixamorig:RightHand': 'Hand.R',
  'mixamorig:LeftHand': 'Hand.L',
  // etc.
};

// Rename tracks in the animation clip
clip.tracks.forEach(track => {
  const dotIndex = track.name.indexOf('.');
  const boneName = track.name.substring(0, dotIndex);
  const property = track.name.substring(dotIndex);
  if (boneMap[boneName]) {
    track.name = boneMap[boneName] + property;
  }
});
```

#### Option C: Load separate animation GLBs
Download Mixamo animations as separate GLB files, load them, extract clips:
```javascript
const animGLTF = await loader.loadAsync('animations/idle.glb');
const idleClip = animGLTF.animations[0];
// Apply to character
const action = mixer.clipAction(idleClip);
action.play();
```

### Bone Name Mapping (Our 3 Conventions)
```
KayKit Characters    | KayKit Knight       | Mixamo Soldier
---------------------|---------------------|-----------------------
Hips                 | Hips                | mixamorig:Hips
Abdomen              | Spine               | mixamorig:Spine  
Torso                | Spine1              | mixamorig:Spine1
Chest                | Spine2              | mixamorig:Spine2
Neck                 | Neck                | mixamorig:Neck
Head                 | Head                | mixamorig:Head
Shoulder.R           | Shoulder.R          | mixamorig:RightShoulder
UpperArm.R           | UpperArm.R          | mixamorig:RightArm
LowerArm.R           | LowerArm.R          | mixamorig:RightForeArm
Hand.R               | MiddleHand.R        | mixamorig:RightHand
Shoulder.L           | Shoulder.L          | mixamorig:LeftShoulder
UpperArm.L           | UpperArm.L          | mixamorig:LeftArm
LowerArm.L           | LowerArm.L          | mixamorig:LeftForeArm
Hand.L               | MiddleHand.L        | mixamorig:LeftHand
UpperLeg.R           | UpperLeg.R          | mixamorig:RightUpLeg
LowerLeg.R           | LowerLeg.R          | mixamorig:RightLeg
Foot.R               | Foot.R              | mixamorig:RightFoot
UpperLeg.L           | UpperLeg.L          | mixamorig:LeftUpLeg
LowerLeg.L           | LowerLeg.L          | mixamorig:LeftLeg
Foot.L               | Foot.L              | mixamorig:LeftFoot
```

### Updated Bone Socket Detection (Universal)
```javascript
function findBone(model, type) {
  let bone = null;
  model.traverse(node => {
    if (!node.isBone) return;
    const name = node.name.toLowerCase();
    switch(type) {
      case 'hand_r':
        if (name.match(/hand\.?r$|righthand$|middlehand\.?r$/i)) bone = node;
        break;
      case 'hand_l':
        if (name.match(/hand\.?l$|lefthand$|middlehand\.?l$/i)) bone = node;
        break;
      case 'forearm_r':
        if (name.match(/lowerarm\.?r$|rightforearm$|forearm\.?r$/i)) bone = node;
        break;
      case 'hips':
        if (name.match(/^hips$/i)) bone = node;
        break;
      case 'spine':
        if (name.match(/^(torso|spine1|chest)$/i)) bone = node;
        break;
    }
  });
  return bone;
}
```

---

## 12. CRITICAL ACTION ITEMS FOR CRATE ENGINE

### Phase 1: Fix What's Broken (Do Now)
1. **Use knight as default player** — has 12 animations INCLUDING sword attacks
2. **Fix bone detection** — use universal matcher (Hand.R / MiddleHand.R / mixamorig:RightHand)
3. **Weapon scale = model.scale.x * 0.5** (already done in v100)
4. **Model container for grounding** — wrap model in Group, offset Y by -boundingBox.min.y
5. **Camera: spherical coordinates** — theta/phi system, not manual XYZ offsets

### Phase 2: Animation System
6. **Character state machine** — Idle/Walk/Run/Jump/Attack states
7. **Animation crossfade** — only change animation on state transition
8. **Load Mixamo anims for KayKit characters** — idle/walk/run/attack as separate GLBs
9. **Bone name mapping** — support all three naming conventions

### Phase 3: Polish
10. **Spring-based camera** — smooth follow, collision avoidance
11. **NPC state machines** — Idle/Patrol/Chase/Attack/Flee
12. **Unified input system** — KeyBinding class with justPressed
13. **Capsule-based character collision**
14. **Slope detection and handling**

---

## 13. IMPLEMENTATION PLAN — Rewriting Character System

### New character.mjs Architecture

```javascript
// === CHARACTER STATE MACHINE ===
class CharacterState {
  constructor(character) { this.character = character; }
  enter() {}        // Called when entering state
  execute(dt) {}    // Called every frame
  exit() {}         // Called when leaving state
}

class IdleState extends CharacterState {
  enter() { this.character.playAnimation('idle', 0.2); }
  execute(dt) {
    if (this.character.input.anyDirection) this.character.setState('walk');
    if (this.character.input.jump.justPressed) this.character.setState('jumpIdle');
  }
}

class WalkState extends CharacterState {
  enter() { this.character.playAnimation('walk', 0.2); }
  execute(dt) {
    if (!this.character.input.anyDirection) this.character.setState('idle');
    if (this.character.input.sprint) this.character.setState('run');
    if (this.character.input.jump.justPressed) this.character.setState('jumpRunning');
    if (this.character.input.attack.justPressed) this.character.setState('attack');
  }
}

class RunState extends CharacterState {
  enter() { this.character.playAnimation('run', 0.15); }
  execute(dt) {
    if (!this.character.input.sprint) this.character.setState('walk');
    if (!this.character.input.anyDirection) this.character.setState('idle');
  }
}

class AttackState extends CharacterState {
  enter() {
    this.character.playAnimation('attack', 0.1);
    this.timer = 0;
  }
  execute(dt) {
    this.timer += dt;
    // Attack animation is ~0.8s
    if (this.timer > 0.8) this.character.setState('idle');
  }
}

// ... JumpState, FallState, RollState, DeathState
```

### Input System
```javascript
class InputBinding {
  constructor(code) {
    this.code = code;
    this.isPressed = false;
    this.justPressed = false;
    this.justReleased = false;
  }
  // Reset justPressed/justReleased each frame
  resetFrame() {
    this.justPressed = false;
    this.justReleased = false;
  }
}
```

### Animation System
```javascript
playAnimation(name, crossfadeDuration = 0.2) {
  const prefix = this.animPrefix; // 'HumanArmature|' or '' or 'CharacterArmature|'
  const clipName = prefix + name;
  const clip = THREE.AnimationClip.findByName(this.animations, clipName);
  if (!clip) return;
  
  const newAction = this.mixer.clipAction(clip);
  if (this.currentAction && this.currentAction !== newAction) {
    this.currentAction.crossFadeTo(newAction, crossfadeDuration, true);
  }
  newAction.reset().play();
  this.currentAction = newAction;
}
```

### Bone Detection (Universal)
```javascript
detectSockets(model) {
  const sockets = {};
  model.traverse(node => {
    if (!node.isBone) return;
    const n = node.name;
    // Right hand — weapon
    if (n.match(/^(Hand\.R|MiddleHand\.R|mixamorig:RightHand)$/)) sockets.hand_r = node;
    // Left hand — shield
    if (n.match(/^(Hand\.L|MiddleHand\.L|mixamorig:LeftHand)$/)) sockets.hand_l = node;
    // Right forearm — fallback
    if (n.match(/^(LowerArm\.R|mixamorig:RightForeArm)$/)) sockets.forearm_r = node;
    // Back/spine — holster
    if (n.match(/^(Torso|Spine1|Chest|mixamorig:Spine2)$/)) sockets.back = node;
    // Hips — pistol holster
    if (n.match(/^(Hips|mixamorig:Hips)$/)) sockets.hips = node;
    // Head — for headshot tracking
    if (n.match(/^(Head|mixamorig:Head)$/)) sockets.head = node;
  });
  return sockets;
}
```

### Model Container Pattern (Sketchbook)
```javascript
// After loading model:
this.modelContainer = new THREE.Group();
this.add(this.modelContainer);

// Calculate ground offset from bounding box
const box = new THREE.Box3().setFromObject(model);
this.modelContainer.position.y = -box.min.y; // Pushes model up so feet touch 0

this.modelContainer.add(model);
```

This way, the character's position Y = terrain height, and the model container handles the offset. No per-frame ground offset calculations needed.

---

## 14. KEY TAKEAWAYS FROM RESEARCH

### What Real Game Engines Get Right That We Don't:

1. **State machines for EVERYTHING** — characters, NPCs, game flow, UI
2. **Model container pattern** — never directly position the model, use a wrapper
3. **Spring simulators** — velocity, rotation, camera all use springs for smooth motion
4. **Separation of concerns** — Input system separate from character, camera separate from movement
5. **Fixed physics timestep** — don't tie physics to framerate
6. **Animation only changes on state transition** — not every frame
7. **Bone detection is standardized** — know the naming conventions, handle all of them
8. **Capsule colliders** — not bounding boxes, not mesh colliders
9. **Update ordering** — characters first, then vehicles, then camera (always last)
10. **Debug visualization** — raycasts, colliders, paths visible in debug mode

### Our Biggest Mistakes:
1. Everything in one giant update function (no states)
2. Setting Y position manually every frame (should use physics/container)
3. Using Box3 for things it's not designed for (weapon scale, ground offset)
4. No animation state management (restart animations every frame)
5. Weapon scale based on bounding box that includes invisible bones
6. No input abstraction (raw event listeners everywhere)
7. Camera using manual offsets instead of spherical coordinates
8. NPCs with random behavior instead of state machines + steering
