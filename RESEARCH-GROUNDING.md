# GROUNDING RESEARCH — Characters, Objects, Terrain, Stairs, Interiors
*Making everything look real in Crate Engine*

---

## 1. THE CORE PROBLEM: Why Things Look Wrong

### NPC Feet Clipping Into Ground
**Root cause**: Model origin is NOT at the feet. Most GLB models have their origin at the center of mass or hips. When you set `model.position.y = terrainHeight`, the center goes to terrain level → feet are underground.

**Fix**: Calculate the model's bounding box AFTER loading, then offset by half the height:
```javascript
const box = new THREE.Box3().setFromObject(model);
const modelHeight = box.max.y - box.min.y;
const groundOffset = -box.min.y; // How far feet are below origin
model.position.y = terrainY + groundOffset;
```

### Objects Floating or Buried
Same issue — every object needs its bounding box ground offset calculated after load.

### Characters Don't Follow Hills
Need continuous terrain height sampling + smooth interpolation.

---

## 2. TERRAIN HEIGHT SAMPLING (How Engines Do It)

### Method 1: Raycast Down (Current — our approach)
```javascript
function getTerrainY(x, z) {
  const ray = new THREE.Raycaster(
    new THREE.Vector3(x, 500, z),  // Start high
    new THREE.Vector3(0, -1, 0),    // Shoot down
    0, 1000
  );
  const hits = ray.intersectObject(terrainMesh);
  return hits.length > 0 ? hits[0].point.y : 0;
}
```
**Pros**: Works with any geometry, always accurate
**Cons**: SLOW if called every frame for every entity

### Method 2: Vertex Height Lookup (Fast — Unity/Unreal approach)
```javascript
// Pre-build a height map from terrain vertices
const heightMap = new Float32Array(resolution * resolution);
const positions = terrainMesh.geometry.attributes.position.array;
for (let i = 0; i < positions.length; i += 3) {
  // Map world position to grid cell
  const gx = Math.round((positions[i] + halfSize) / cellSize);
  const gz = Math.round((positions[i+2] + halfSize) / cellSize);
  heightMap[gz * resolution + gx] = positions[i+1]; // y = height
}

// Fast lookup with bilinear interpolation
function getTerrainYFast(x, z) {
  const gx = (x + halfSize) / cellSize;
  const gz = (z + halfSize) / cellSize;
  const x0 = Math.floor(gx), z0 = Math.floor(gz);
  const fx = gx - x0, fz = gz - z0;
  
  const h00 = heightMap[z0 * res + x0];
  const h10 = heightMap[z0 * res + x0 + 1];
  const h01 = heightMap[(z0+1) * res + x0];
  const h11 = heightMap[(z0+1) * res + x0 + 1];
  
  // Bilinear interpolation
  return h00*(1-fx)*(1-fz) + h10*fx*(1-fz) + h01*(1-fx)*fz + h11*fx*fz;
}
```
**Pros**: O(1) lookup, can call 1000x per frame
**Cons**: Only works with heightmap terrain (which is what we have!)

### Method 3: Hybrid (Best for us)
- Build heightmap cache ONCE when terrain is created
- Use fast lookup for player/NPC ground following
- Use raycast only for object placement on non-terrain surfaces (buildings, bridges)

---

## 3. CHARACTER GROUNDING (Walking on Hills Properly)

### Smooth Ground Following
```javascript
// In character update loop:
const targetY = getTerrainYFast(pos.x, pos.z) + groundOffset;
const currentY = model.position.y;

// DON'T snap instantly — lerp for smoothness
model.position.y = THREE.MathUtils.lerp(currentY, targetY, 0.15);

// For downhill, allow slightly faster descent (gravity feel)
if (targetY < currentY) {
  model.position.y = THREE.MathUtils.lerp(currentY, targetY, 0.25);
}
```

### Slope Alignment (Character tilts on hills)
```javascript
// Sample terrain normal for slope
const nx = getTerrainYFast(pos.x + 0.5, pos.z) - getTerrainYFast(pos.x - 0.5, pos.z);
const nz = getTerrainYFast(pos.x, pos.z + 0.5) - getTerrainYFast(pos.x, pos.z - 0.5);
const normal = new THREE.Vector3(-nx, 1, -nz).normalize();

// Align character up vector to terrain normal
const up = new THREE.Vector3(0, 1, 0);
const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normal);

// Blend: mostly upright, slightly tilted
model.quaternion.slerp(quaternion, 0.1);
```

### Speed on Slopes (Unreal/Unity standard)
```javascript
const slopeAngle = Math.acos(normal.y); // 0 = flat, PI/2 = vertical
const slopeFactor = Math.cos(slopeAngle); // 1.0 on flat, 0.0 on cliff

// Going uphill = slower
if (movingUphill) speed *= Math.max(0.3, slopeFactor);
// Going downhill = slightly faster
if (movingDownhill) speed *= Math.min(1.3, 1 + (1 - slopeFactor) * 0.3);

// Too steep = can't walk (slide down)
if (slopeAngle > maxWalkableSlope) {
  // Push character downhill
  const slideDir = new THREE.Vector3(normal.x, 0, normal.z).normalize();
  model.position.add(slideDir.multiplyScalar(slideSpeed * dt));
}
```

---

## 4. OBJECT PLACEMENT ON TERRAIN

### Grounding Algorithm (Place any object correctly)
```javascript
function groundObject(object, terrainMesh) {
  // 1. Get bounding box
  const box = new THREE.Box3().setFromObject(object);
  const bottomY = box.min.y; // Lowest point of object
  const originY = object.position.y;
  const groundOffset = originY - bottomY; // Distance from origin to bottom
  
  // 2. Get terrain height at object's XZ position
  const terrainY = getTerrainY(object.position.x, object.position.z);
  
  // 3. Place object so bottom touches terrain
  object.position.y = terrainY + groundOffset;
}
```

### Object Categories & Placement Rules:
| Category | On Terrain | On Water | Special Rules |
|----------|-----------|----------|---------------|
| **Trees** | ✅ Ground level | ❌ Never | Slight random rotation, scale variation |
| **Buildings** | ✅ Ground level | ❌ Never | Flatten terrain under building, or use foundation |
| **NPCs** | ✅ Ground level | ❌ Never (swim) | Continuous ground following |
| **Vehicles** | ✅ Ground level | ❌ | 4-wheel raycast for proper tilt |
| **Boats** | ❌ Never on land | ✅ Water surface | Float at water.y, bob up/down |
| **Rocks** | ✅ Half-buried | ❌ | Sink 20-40% into terrain |
| **Fences/Walls** | ✅ Ground level | ❌ | Follow terrain contour |
| **Bridges** | ✅ Fixed height | ✅ Over water | Connect two terrain points |
| **Items/Loot** | ✅ On ground | ❌ | Small hover + rotate |

### Building Foundation Problem
Buildings on slopes look terrible if just placed at terrain height — one side floats, other side buried.

**Solution 1: Level the terrain under building**
```javascript
function flattenTerrainUnder(building, terrainMesh, padding = 2) {
  const box = new THREE.Box3().setFromObject(building);
  const positions = terrainMesh.geometry.attributes.position;
  const targetY = getTerrainY(building.position.x, building.position.z);
  
  for (let i = 0; i < positions.count; i++) {
    const vx = positions.getX(i);
    const vz = positions.getZ(i);
    
    if (vx >= box.min.x - padding && vx <= box.max.x + padding &&
        vz >= box.min.z - padding && vz <= box.max.z + padding) {
      positions.setY(i, targetY); // Flatten to building height
    }
  }
  positions.needsUpdate = true;
  terrainMesh.geometry.computeVertexNormals();
}
```

**Solution 2: Add foundation/stilts procedurally**
```javascript
function addFoundation(building) {
  const box = new THREE.Box3().setFromObject(building);
  const corners = [
    {x: box.min.x, z: box.min.z},
    {x: box.max.x, z: box.min.z},
    {x: box.min.x, z: box.max.z},
    {x: box.max.x, z: box.max.z}
  ];
  
  corners.forEach(c => {
    const terrainY = getTerrainY(c.x, c.z);
    const gap = building.position.y - terrainY;
    if (gap > 0.1) {
      // Add foundation block
      const geo = new THREE.BoxGeometry(1, gap, 1);
      const mat = new THREE.MeshStandardMaterial({color: 0x666666});
      const foundation = new THREE.Mesh(geo, mat);
      foundation.position.set(c.x, terrainY + gap/2, c.z);
      scene.add(foundation);
    }
  });
}
```

---

## 5. WATER OBJECT PLACEMENT

### Rule: Water items float, land items stay dry
```javascript
function placeObject(type, x, z) {
  const terrainY = getTerrainY(x, z);
  const waterY = -0.3; // Our water level
  const isUnderwater = terrainY < waterY;
  
  if (isWaterObject(type)) { // boat, buoy, dock
    if (isUnderwater) {
      // Good — place on water surface
      object.position.y = waterY;
    } else {
      // Bad — find nearest water edge
      const waterPos = findNearestWater(x, z);
      object.position.set(waterPos.x, waterY, waterPos.z);
    }
  } else { // building, tree, NPC
    if (isUnderwater) {
      // Bad — push to nearest dry land
      const landPos = findNearestLand(x, z);
      object.position.set(landPos.x, getTerrainY(landPos.x, landPos.z), landPos.z);
    } else {
      // Good — place on terrain
      object.position.y = terrainY + groundOffset;
    }
  }
}

function findNearestLand(x, z) {
  // Spiral outward until terrain > waterY
  for (let r = 1; r < 50; r++) {
    for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
      const tx = x + Math.cos(angle) * r;
      const tz = z + Math.sin(angle) * r;
      if (getTerrainY(tx, tz) > waterY + 0.1) return {x: tx, z: tz};
    }
  }
  return {x: 0, z: 0}; // Fallback: center
}
```

---

## 6. STAIRS & RAMPS (How FPS Games Do It)

### Method 1: Step Detection (Simple, good for small steps)
```javascript
// In character movement, check for small obstacles ahead
const stepRay = new THREE.Raycaster(
  new THREE.Vector3(pos.x, pos.y + 0.1, pos.z), // Just above feet
  moveDirection,
  0, 0.5 // Check 0.5 units ahead
);

const blocked = stepRay.intersectObjects(colliders);
if (blocked.length > 0) {
  // Check if it's a step we can climb (< maxStepHeight)
  const stepTopRay = new THREE.Raycaster(
    new THREE.Vector3(pos.x + moveDir.x * 0.5, pos.y + maxStepHeight, pos.z + moveDir.z * 0.5),
    new THREE.Vector3(0, -1, 0), 0, maxStepHeight
  );
  const stepTop = stepTopRay.intersectObjects(colliders);
  
  if (stepTop.length > 0 && stepTop[0].point.y - pos.y < maxStepHeight) {
    // Smoothly step up
    targetY = stepTop[0].point.y + groundOffset;
    pos.y = THREE.MathUtils.lerp(pos.y, targetY, 0.3);
  }
}
```

### Method 2: Ramp Collision (What Three.js FPS example uses)
The Footprint Arts demo uses **ammo.js physics** — the environment is a GLB model with collision meshes, and the physics engine handles walking up ramps/stairs automatically because the collision shape follows the geometry.

For our engine (no physics library), we need:
```javascript
// When walking, raycast DOWN from slightly ahead + above
function checkGround(pos, moveDir, speed, dt) {
  const nextPos = pos.clone().add(moveDir.clone().multiplyScalar(speed * dt));
  
  // Cast from above to find ground at next position
  const ray = new THREE.Raycaster(
    new THREE.Vector3(nextPos.x, pos.y + 2, nextPos.z), // 2 units above current
    new THREE.Vector3(0, -1, 0),
    0, 4 // Search 4 units down
  );
  
  // Check BOTH terrain AND building/stair meshes
  const allGround = [...terrainMeshes, ...stairMeshes, ...buildingFloors];
  const hits = ray.intersectObjects(allGround, true);
  
  if (hits.length > 0) {
    const groundY = hits[0].point.y;
    const heightDiff = groundY - pos.y;
    
    if (heightDiff > 0 && heightDiff < maxStepHeight) {
      // Can step up — smooth transition
      return groundY + groundOffset;
    } else if (heightDiff > maxStepHeight) {
      // Wall — can't climb
      return pos.y; // Stay at current height
    } else {
      // Going down or flat
      return groundY + groundOffset;
    }
  }
  return pos.y;
}
```

### Method 3: Stair Geometry (Procedural)
```javascript
function createStaircase(startPos, endPos, width, steps) {
  const group = new THREE.Group();
  const totalHeight = endPos.y - startPos.y;
  const totalLength = new THREE.Vector2(endPos.x - startPos.x, endPos.z - startPos.z).length();
  const stepHeight = totalHeight / steps;
  const stepDepth = totalLength / steps;
  
  const dir = new THREE.Vector3().subVectors(endPos, startPos).normalize();
  const flatDir = new THREE.Vector2(dir.x, dir.z).normalize();
  
  for (let i = 0; i < steps; i++) {
    const geo = new THREE.BoxGeometry(width, stepHeight, stepDepth);
    const mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const step = new THREE.Mesh(geo, mat);
    
    step.position.set(
      startPos.x + flatDir.x * stepDepth * (i + 0.5),
      startPos.y + stepHeight * (i + 0.5),
      startPos.z + flatDir.y * stepDepth * (i + 0.5)
    );
    
    step.castShadow = true;
    step.receiveShadow = true;
    step.userData.isStair = true;
    step.userData.isCollider = true;
    group.add(step);
  }
  
  return group;
}
```

---

## 7. BUILDING INTERIORS

### How Real Games Handle Interiors
1. **Separate interior/exterior meshes** — exterior visible from outside, interior loads when entering
2. **Collision mesh** — invisible simplified geometry for walking on floors, against walls
3. **Multiple floors** — each floor is a plane mesh at the right height
4. **Doorways** — trigger zones that switch camera/rendering mode

### For Crate Engine:
```javascript
function createBuildingWithInterior(config) {
  const building = new THREE.Group();
  
  // Exterior walls
  const wallMat = new THREE.MeshStandardMaterial({ color: config.wallColor, side: THREE.DoubleSide });
  
  // Floor
  const floorGeo = new THREE.PlaneGeometry(config.width, config.depth);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x555555, side: THREE.DoubleSide });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01;
  floor.userData.isFloor = true;
  floor.userData.isCollider = true;
  building.add(floor);
  
  // Walls with door opening
  // Front wall (with door hole)
  const doorWidth = 1.2, doorHeight = 2.2;
  const frontWallShape = new THREE.Shape();
  frontWallShape.moveTo(-config.width/2, 0);
  frontWallShape.lineTo(-config.width/2, config.height);
  frontWallShape.lineTo(config.width/2, config.height);
  frontWallShape.lineTo(config.width/2, 0);
  frontWallShape.lineTo(doorWidth/2, 0);
  frontWallShape.lineTo(doorWidth/2, doorHeight);
  frontWallShape.lineTo(-doorWidth/2, doorHeight);
  frontWallShape.lineTo(-doorWidth/2, 0);
  frontWallShape.lineTo(-config.width/2, 0);
  
  const wallGeo = new THREE.ExtrudeGeometry(frontWallShape, { depth: 0.2, bevelEnabled: false });
  const frontWall = new THREE.Mesh(wallGeo, wallMat);
  frontWall.position.z = config.depth / 2;
  frontWall.userData.isWall = true;
  frontWall.userData.isCollider = true;
  building.add(frontWall);
  
  // Second floor
  if (config.floors > 1) {
    const floor2 = floor.clone();
    floor2.position.y = config.floorHeight;
    building.add(floor2);
    
    // Interior stairs
    const stairs = createStaircase(
      new THREE.Vector3(-config.width/2 + 1, 0, -config.depth/2 + 1),
      new THREE.Vector3(-config.width/2 + 1, config.floorHeight, -config.depth/2 + 3),
      1.2, 10
    );
    building.add(stairs);
  }
  
  // Ceiling
  const ceiling = floor.clone();
  ceiling.position.y = config.height;
  building.add(ceiling);
  
  return building;
}
```

### Interior Detection (Am I inside a building?)
```javascript
function isInsideBuilding(playerPos, buildings) {
  for (const b of buildings) {
    const box = new THREE.Box3().setFromObject(b);
    if (box.containsPoint(playerPos)) {
      return b; // Return which building
    }
  }
  return null;
}

// Use for:
// - Switching to interior lighting
// - Enabling floor collision instead of terrain
// - Hiding roof for top-down view
// - Rain/weather occlusion
```

---

## 8. WHAT CRATE ENGINE NEEDS (Priority Fix List)

### Phase 1 — Fix NPC Feet Clipping (IMMEDIATE)
- [ ] Calculate `groundOffset` from bounding box after model load
- [ ] Apply: `model.position.y = terrainY + groundOffset`
- [ ] Store groundOffset on CharacterController/NPCController
- [ ] Test with Mixamo models (origin usually at feet, so offset ≈ 0)
- [ ] Test with other GLB models (origin varies)

### Phase 2 — Object Grounding
- [ ] All placed objects get bounding box ground check
- [ ] Rocks sink 20-40% into terrain
- [ ] Trees/buildings sit on surface
- [ ] Water objects (boats) snap to water level
- [ ] Land objects pushed to dry land if underwater

### Phase 3 — Smooth Hill Walking  
- [ ] Lerp character Y position (not snap)
- [ ] Faster descent lerp (gravity feel)
- [ ] Slope speed modifier (slower uphill, faster downhill)
- [ ] Max walkable slope angle (slide on cliffs)

### Phase 4 — Stairs & Ramps
- [ ] Step detection raycast (check ahead + above)
- [ ] maxStepHeight = 0.5 (can climb steps)
- [ ] Smooth Y transition when stepping up
- [ ] Procedural staircase creation command
- [ ] Stair meshes added to collision check list

### Phase 5 — Building Interiors
- [ ] Buildings with door openings (Shape + ExtrudeGeometry)
- [ ] Interior floors as collision surfaces
- [ ] Interior stairs connecting floors
- [ ] Interior detection (player inside building → use floor collision)
- [ ] Interior lighting (point lights inside)

---

## 9. FOOTPRINT ARTS FPS DEMO — Key Takeaways

From the video transcript and code analysis:
1. **Based on Three.js official FPS example** — refactored from monolithic to modular files
2. **Uses ammo.js** for physics (collision, gravity, walking on surfaces)
3. **GLB environment model** — Blender-made level with stairs built into the mesh
4. **physics.js is the core** — handles all collision, movement, ball throwing
5. **FPS rig attached to camera** — weapon model follows camera for immersive feel
6. **Sound system** — ambient layers + shooting sounds synced to animations
7. **Modular architecture**: main.js → environment.js, physics.js, sounds.js, etc.

**Key insight for us**: Their stairs work because **ammo.js handles walking on any surface shape**. Without a physics engine, we need step detection raycasting (Method 1 above). Our approach of raycasting down is correct — we just need to also check ahead for steps.

---

## REFERENCES
- Three.js official FPS example (three.js/examples/physics_ammo_break.html)
- Footprint Arts: "Three.js FPS Game Template" (YouTube)
- mohsenheydari/three-fps (GitHub) — ammo.js entity/component FPS
- Unity CharacterController.stepOffset documentation
- Unreal Engine: Character Movement Component (MaxStepHeight, WalkableFloorAngle)
- Three.js discourse: terrain height sampling techniques

---

## 10. mohsenheydari/three-fps — CODE ANALYSIS

### Architecture (Entity/Component System)
```
src/
  entry.js          — Main app, game loop, asset loading
  Entity.js         — Base entity (position, rotation, components)
  EntityManager.js  — Manages all entities
  Component.js      — Base component class
  FiniteStateMachine.js — FSM for NPC/weapon states
  AmmoLib.js        — ammo.js physics wrapper + raycast helpers
  Input.js          — Keyboard/mouse input manager
  entities/
    Player/
      PlayerControls.js  — Mouse look + WASD movement
      PlayerPhysics.js   — Capsule rigid body (ammo.js)
      PlayerHealth.js    — Health system
      Weapon.js          — AK47 weapon (shoot, reload, muzzle flash)
      WeaponFSM.js       — Weapon state machine (idle/shoot/reload)
    NPC/
      CharacterController.js — NPC movement + root-motion
      CharacterCollision.js  — NPC physics body
      CharacterFSM.js        — NPC AI states
      AttackTrigger.js       — Ghost object for attack range detection
    Level/
      LevelSetup.js    — GLB level loading + physics mesh
      BulletDecals.js  — Decals on walls from bullets
      Navmesh.js       — three-pathfinding for NPC navigation
```

### How Stairs/Walking Works (PlayerPhysics.js + PlayerControls.js)
1. **Player is a capsule rigid body** (height=1.3, radius=0.3, mass=5)
2. **ammo.js Bullet Physics** simulates gravity + collision
3. **Movement**: Sets linear velocity on rigid body (not position directly)
4. **Camera follows physics body**: `camera.position.set(p.x(), p.y() + yOffset, p.z())`
5. **Jump detection**: Checks contact manifold normals — if contact normal dot up > 0.5, can jump
6. **Stairs work automatically** because capsule slides up small steps (Bullet physics maxStepHeight)

### How Shooting Works (Weapon.js)
1. **Raycast from camera center**: Unproject (0,0,-1) and (0,0,1) to get world-space ray
2. **AmmoHelper.CastRay** — physics raycast through Bullet physics world
3. **On hit**: Broadcast 'hit' event to the hit entity with damage amount
4. **Muzzle flash**: Model attached to gun, opacity fades based on life/fireRate ratio
5. **Sound**: THREE.Audio plays shot sound, stops previous if still playing
6. **Fire rate**: Timer-based (0.1s between shots)
7. **Reload**: 'R' key, state machine transitions to reload anim, then refills mag from reserve

### Key Insights for Crate Engine
- Their weapon model is **attached to camera** (FPS view), not to character model
- Weapon position: `(0.04, -0.02, 0.0)` relative to camera, scale 0.05
- Muzzle flash position: `(-0.3, -0.5, 8.3)` relative to weapon (at barrel tip)
- Shooting raycast uses **physics world raycast** not THREE.Raycaster
- Mouse sensitivity: 0.002
- Max speed: 7.0, acceleration time: 0.08s (snappy response)
- Jump velocity: 5.0
- Camera yOffset from physics body: 0.5

### What We Can Adapt (No ammo.js needed)
For stairs without a physics engine:
```javascript
// Our approach: Step detection + smooth Y transition
const MAX_STEP_HEIGHT = 0.5;

function moveWithStepDetection(pos, moveDir, speed, dt, colliders) {
  const nextXZ = pos.clone();
  nextXZ.x += moveDir.x * speed * dt;
  nextXZ.z += moveDir.z * speed * dt;
  
  // Cast down from above next position to find ground
  const ray = new THREE.Raycaster(
    new THREE.Vector3(nextXZ.x, pos.y + MAX_STEP_HEIGHT + 0.1, nextXZ.z),
    new THREE.Vector3(0, -1, 0),
    0, MAX_STEP_HEIGHT * 2 + 2
  );
  
  const hits = ray.intersectObjects([terrainMesh, ...colliders], true);
  
  if (hits.length > 0) {
    const groundY = hits[0].point.y;
    const heightDiff = groundY - pos.y;
    
    if (heightDiff <= MAX_STEP_HEIGHT) {
      // Can walk here (flat, uphill, or step)
      pos.x = nextXZ.x;
      pos.z = nextXZ.z;
      pos.y = THREE.MathUtils.lerp(pos.y, groundY, heightDiff > 0.05 ? 0.3 : 0.15);
    }
    // else: wall/cliff — don't move
  }
}
```
