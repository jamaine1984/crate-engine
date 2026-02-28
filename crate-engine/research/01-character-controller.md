# 01 — Character Controller: The Foundation of Feel

> How AAA games handle movement, and how we implement it in Three.js

---

## Why This Matters

The character controller is the #1 thing that makes a game feel "real" or "janky." Every frame, it answers: Where is the player? What can they do? Can they climb this? Are they falling? Every other system (combat, vehicles, interiors) depends on this being rock-solid.

---

## The Real Architecture (How Unity/Unreal Do It)

### Capsule Collider
Every major engine uses a **capsule** (cylinder with rounded ends) for the player — not a box, not a mesh collider.

Why capsule:
- Slides along walls smoothly (no corner snagging)
- Handles stairs via the rounded bottom
- Simple math for collision detection
- Works on slopes naturally

```
    ___
   / _ \    ← hemisphere top
  | | | |   ← cylinder body  
  | | | |
   \_._/    ← hemisphere bottom (slides up stairs)
```

### The Movement Loop (every frame)

```
1. Read input → desired velocity vector
2. Apply gravity (if not grounded)
3. Ground check (raycast down from capsule bottom)
4. Slope check (is ground angle < max slope?)
5. Step check (is obstacle < step height? → auto-step)
6. Move + Slide (project velocity along collision surfaces)
7. Update position
8. Update animation state
```

### Ground Detection
- **Raycast** from capsule center downward, length = capsule half-height + small margin (0.1)
- Also use a **sphere cast** (wider check) to handle edges
- Store: `isGrounded`, `groundNormal`, `groundAngle`, `groundMaterial`

```javascript
// Three.js ground check
const raycaster = new THREE.Raycaster();
const origin = new THREE.Vector3(pos.x, pos.y + 0.5, pos.z);
raycaster.set(origin, new THREE.Vector3(0, -1, 0));
const hits = raycaster.intersectObject(worldCollider, true);

if (hits.length > 0 && hits[0].distance < capsuleHalfHeight + 0.15) {
    isGrounded = true;
    groundNormal = hits[0].face.normal;
    groundY = hits[0].point.y;
}
```

---

## Stair Climbing — The Hard Problem

### Why Stairs Are Hard
Stairs are geometry. Without special handling, the capsule hits the vertical face of each step and stops dead. Players expect to walk up stairs smoothly.

### Solution: Step Offset (How Unreal Does It)

```
1. Try to move forward
2. If blocked by obstacle:
   a. Check obstacle height (raycast up from foot level)
   b. If height < MAX_STEP_HEIGHT (typically 0.35m):
      - Cast ray from elevated position forward
      - If clear above, move up + forward
      - Snap down to surface
   c. If height >= MAX_STEP_HEIGHT: blocked (it's a wall)
```

```javascript
// Three.js stair stepping
const MAX_STEP = 0.4; // max step height in world units

function tryStepUp(position, moveDir, collider) {
    // 1. Lift capsule up by MAX_STEP
    const lifted = position.clone();
    lifted.y += MAX_STEP;
    
    // 2. Try moving forward from lifted position
    const testPos = lifted.clone().add(moveDir);
    
    // 3. Check if lifted+forward position is clear
    if (!checkCollision(testPos, collider)) {
        // 4. Snap down to find the actual step surface
        raycaster.set(testPos, DOWN);
        const hit = raycaster.intersectObject(collider);
        if (hit.length > 0) {
            testPos.y = hit[0].point.y + capsuleHalfHeight;
            return testPos; // stepped up!
        }
    }
    return null; // can't step up
}
```

### Stair Descent
Going DOWN stairs is equally important — without handling, the character "flies" off each step.

```javascript
// Snap-down on stairs
if (isGrounded && !isJumping) {
    raycaster.set(new THREE.Vector3(pos.x, pos.y, pos.z), DOWN);
    const hit = raycaster.intersectObject(collider);
    if (hit.length > 0 && hit[0].distance < MAX_STEP + 0.1) {
        pos.y = hit[0].point.y + capsuleHalfHeight;
        // Don't trigger falling animation
    }
}
```

---

## Slope Handling

### Max Slope Angle
- Walkable: 0° to ~45° (configurable)
- Slide: 45° to 70° (player slides down)
- Wall: 70°+ (treated as wall, can't walk up)

```javascript
const MAX_SLOPE_ANGLE = 45; // degrees
const groundAngle = Math.acos(groundNormal.dot(UP)) * (180 / Math.PI);

if (groundAngle > MAX_SLOPE_ANGLE) {
    // Apply slide force along slope
    const slideDir = new THREE.Vector3()
        .copy(groundNormal)
        .projectOnPlane(UP)  // nope — project gravity onto slope
        .normalize();
    velocity.add(slideDir.multiplyScalar(slideForce * dt));
}
```

---

## Movement States

A proper character controller is a **state machine**:

```
IDLE → WALKING → RUNNING → SPRINTING
  ↕       ↕        ↕         ↕
JUMPING  JUMPING  JUMPING  JUMPING
  ↓       ↓        ↓         ↓
FALLING  FALLING  FALLING  FALLING
  ↓
LANDING
  
IDLE ↔ CROUCHING → CROUCH_WALKING
IDLE → ROLLING (dodge)
IDLE → CLIMBING (near ladder/wall)
SWIMMING_IDLE ↔ SWIMMING_FORWARD
DRIVING (in vehicle)
```

```javascript
class CharacterStateMachine {
    constructor() {
        this.states = {
            idle: new IdleState(),
            walk: new WalkState(),
            run: new RunState(),
            sprint: new SprintState(),
            jump: new JumpState(),
            fall: new FallState(),
            climb: new ClimbState(),
            swim: new SwimState(),
            roll: new RollState(),
            drive: new DriveState(),
        };
        this.current = this.states.idle;
    }
    
    update(input, dt) {
        const next = this.current.check(input); // check transitions
        if (next && this.states[next]) {
            this.current.exit();
            this.current = this.states[next];
            this.current.enter();
        }
        this.current.update(input, dt);
    }
}
```

---

## Sprint / Roll / Crouch

### Sprint
- Hold Shift → multiply speed (walk 4 → run 7 → sprint 10)
- Drain stamina bar
- Camera FOV widens slightly (65° → 72°) for speed feel

### Roll (Dodge)
- Press Space + Direction while grounded
- Invincibility frames (i-frames) during roll
- Fixed distance, fixed duration (~0.5s)
- Cannot interrupt mid-roll
- Cooldown (0.3s)

```javascript
class RollState {
    enter(character) {
        this.timer = 0;
        this.duration = 0.5;
        this.direction = character.moveDir.clone().normalize();
        this.speed = 12;
        character.invulnerable = true;
        character.playAnimation('roll');
    }
    
    update(character, dt) {
        this.timer += dt;
        character.position.add(
            this.direction.clone().multiplyScalar(this.speed * dt)
        );
        if (this.timer >= this.duration) {
            character.invulnerable = false;
            return 'idle';
        }
    }
}
```

### Crouch
- Hold Ctrl → shrink capsule height by 50%
- Slower movement
- Can fit through low spaces
- Smooth camera height transition

---

## Climbing System

### Ladder Climbing
```
1. Player approaches ladder → detect via trigger zone
2. Press E → enter climb state
3. Snap to ladder center, face ladder
4. W/S = climb up/down (fixed speed)
5. Reach top → auto-mantle animation
6. Press E or jump → exit climb
```

### Ledge Grab / Mantle
```
1. While falling/jumping, raycast forward from chest height
2. If hit wall, raycast DOWN from above hit point
3. If find ledge surface within reach:
   a. Snap hands to ledge
   b. Play hang animation
   c. Press W or Space → pull-up animation → land on top
```

```javascript
function checkLedgeGrab(position, forward) {
    // Cast forward from chest
    const chestHeight = position.y + 1.2;
    const ray = new THREE.Raycaster(
        new THREE.Vector3(position.x, chestHeight, position.z),
        forward, 0, 1.0
    );
    const wallHit = ray.intersectObject(worldCollider);
    
    if (wallHit.length > 0) {
        // Cast down from above to find ledge top
        const above = wallHit[0].point.clone();
        above.y += 2.0;
        above.add(forward.clone().multiplyScalar(0.3));
        
        const downRay = new THREE.Raycaster(above, DOWN);
        const ledgeHit = downRay.intersectObject(worldCollider);
        
        if (ledgeHit.length > 0) {
            const ledgeY = ledgeHit[0].point.y;
            const reachHeight = position.y + 2.2; // max reach
            if (ledgeY < reachHeight && ledgeY > chestHeight) {
                return ledgeHit[0].point; // found climbable ledge!
            }
        }
    }
    return null;
}
```

---

## Swimming

### Water Detection
```javascript
const WATER_LEVEL = waterMesh.position.y; // or dynamic per-area

function checkSwimming(position) {
    if (position.y < WATER_LEVEL - 0.3) {
        return 'underwater';
    } else if (position.y < WATER_LEVEL + 0.5) {
        return 'surface';
    }
    return 'above';
}
```

### Swimming Movement
- On surface: WASD moves horizontally, gravity OFF, bob up/down slightly
- Underwater: mouse look controls full 3D movement direction
- Space = ascend, Ctrl/Shift = descend
- Stamina drains underwater → damage when empty (drowning)
- Exit water: auto-mantle onto ledge when swimming toward shoreline

```javascript
class SwimState {
    update(character, input, dt) {
        // No gravity
        character.velocity.y = 0;
        
        // Buoyancy — gently push toward surface
        const depth = WATER_LEVEL - character.position.y;
        if (depth > 0) {
            character.velocity.y += depth * 2.0 * dt; // buoyancy
        }
        
        // Input
        if (input.jump) character.velocity.y += 3.0 * dt;
        if (input.crouch) character.velocity.y -= 3.0 * dt;
        
        // Horizontal swim (slower than walk)
        const swimSpeed = 3.0;
        const moveDir = getInputDirection(input, character.camera);
        character.velocity.x = moveDir.x * swimSpeed;
        character.velocity.z = moveDir.z * swimSpeed;
        
        // Surface snap — don't go above water
        if (character.position.y > WATER_LEVEL) {
            character.position.y = WATER_LEVEL;
            character.velocity.y = Math.min(0, character.velocity.y);
        }
    }
}
```

---

## Implementation Plan for Crate Engine

### Priority Order
1. **Capsule collider + ground detection** (replace current raycasting)
2. **State machine** (replace if/else chain)
3. **Stair stepping** (MAX_STEP auto-climb)
4. **Slope handling** (slide on steep, block on wall)
5. **Sprint + stamina**
6. **Roll/dodge**
7. **Crouch**
8. **Swimming** (tie into water system)
9. **Climbing** (ladders first, then ledge grab)

### Key Three.js Libraries to Use
- **three-mesh-bvh** — fast raycasting against complex meshes (CRITICAL for performance)
- **Capsule geometry** — `THREE.CapsuleGeometry` exists in modern Three.js
- **Octree** — Three.js examples include `Octree` for spatial collision

### Reference Implementations
- Three.js official example: `games_fps` — has capsule + octree collision
- Three.js example: `physics_ammo_character` — Ammo.js character controller
- PlayCanvas engine source — excellent character controller reference
- Rapier.js — Rust physics engine with WASM, has character controller built-in

### Rapier.js (Strong Recommendation)
Rapier is a physics engine compiled to WASM. It has:
- Built-in character controller with step handling
- Capsule colliders
- Vehicle physics (for cars/planes later)
- 60fps on complex scenes
- ~200KB WASM bundle

```javascript
import RAPIER from '@dimforge/rapier3d-compat';

// Create character controller
const controller = world.createCharacterController(0.01);
controller.setMaxSlopeClimbAngle(45 * Math.PI / 180);
controller.setMaxSlopeSlideAngle(30 * Math.PI / 180);
controller.enableAutostep(0.4, 0.2, true); // maxHeight, minWidth, includeDynamic
controller.enableSnapToGround(0.4);

// Each frame:
controller.computeColliderMovement(collider, desiredMovement);
const corrected = controller.computedMovement();
body.setTranslation({
    x: pos.x + corrected.x,
    y: pos.y + corrected.y,
    z: pos.z + corrected.z
});
```

**Rapier solves stairs, slopes, collision, and physics in one package.** Strongly recommend integrating it.

---

## Common Bugs & How to Avoid Them

| Bug | Cause | Fix |
|-----|-------|-----|
| Fall through floor | Tunneling at high speed | Use CCD (continuous collision detection) or limit max velocity |
| Stuck on wall seams | Mesh gaps | Use BVH or physics engine (handles edge cases) |
| Jitter on slopes | Fighting between gravity and ground snap | Only apply gravity when NOT grounded |
| Float above ground | Capsule bottom doesn't reach surface | Offset position by capsule half-height |
| Stairs = wall | No step-up logic | Implement auto-step (see above) |
| Moon jumps | Gravity not frame-rate independent | Use `velocity.y += gravity * deltaTime` not fixed values |
| Slide on flat ground | Floating point slope angle ≠ 0 | Dead zone: treat angles < 2° as flat |

---

*Next: 02-building-interiors.md — Multi-room houses, stairs, doors, room navigation*
