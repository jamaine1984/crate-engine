# 08 — Collision & Physics: Making the World Solid

> No falling through floors. No walking through walls. Ever.

---

## Why Custom Raycasting Isn't Enough

Current Crate Engine uses raycasts for ground detection. Problems:
- Only checks straight down — misses walls
- One ray can slip through mesh cracks
- No sliding along surfaces
- No physics response (bouncing, pushing)
- Performance degrades with many objects

---

## Option A: Three.js Octree (No External Library)

Three.js examples include an Octree-based collision system. It's simple and works well for character movement.

```javascript
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';

class CollisionWorld {
    constructor() {
        this.octree = new Octree();
        this.playerCapsule = new Capsule(
            new THREE.Vector3(0, 0.35, 0),  // bottom
            new THREE.Vector3(0, 1.7, 0),   // top
            0.35                              // radius
        );
        this.playerVelocity = new THREE.Vector3();
        this.playerOnFloor = false;
        this.gravity = 30;
    }
    
    loadLevel(mesh) {
        // Build octree from level geometry
        this.octree.fromGraphNode(mesh);
    }
    
    updatePlayer(dt) {
        // Apply gravity
        if (!this.playerOnFloor) {
            this.playerVelocity.y -= this.gravity * dt;
        }
        
        // Damping
        const damping = Math.exp(-4 * dt) - 1;
        if (this.playerOnFloor) {
            this.playerVelocity.addScaledVector(this.playerVelocity, damping);
        } else {
            this.playerVelocity.addScaledVector(this.playerVelocity, damping * 0.1);
        }
        
        // Move
        const deltaPos = this.playerVelocity.clone().multiplyScalar(dt);
        this.playerCapsule.translate(deltaPos);
        
        // Collision response
        this.playerOnFloor = false;
        const result = this.octree.capsuleIntersect(this.playerCapsule);
        
        if (result) {
            this.playerOnFloor = result.normal.y > 0.5; // standing on something
            
            if (!this.playerOnFloor) {
                // Wall/ceiling — slide along surface
                this.playerVelocity.addScaledVector(
                    result.normal,
                    -result.normal.dot(this.playerVelocity)
                );
            }
            
            // Push capsule out of collision
            this.playerCapsule.translate(
                result.normal.multiplyScalar(result.depth)
            );
        }
    }
    
    getPlayerPosition() {
        const center = new THREE.Vector3();
        this.playerCapsule.getCenter(center);
        return center;
    }
}
```

### Pros
- No external dependencies
- Simple, well-tested
- Works great for character movement
- Part of Three.js examples (games_fps)

### Cons
- No dynamic physics (rigid bodies, ragdolls)
- Manual vehicle collision
- No joints/constraints

---

## Option B: Rapier.js (Recommended for Full Engine)

Rapier is a Rust physics engine compiled to WASM. It handles everything.

```javascript
import RAPIER from '@dimforge/rapier3d-compat';

class PhysicsWorld {
    constructor() {
        this.ready = false;
    }
    
    async init() {
        await RAPIER.init();
        this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
        
        // Character controller (handles stairs, slopes automatically!)
        this.characterController = this.world.createCharacterController(0.01);
        this.characterController.enableAutostep(0.4, 0.2, true);
        this.characterController.enableSnapToGround(0.4);
        this.characterController.setMaxSlopeClimbAngle(45 * Math.PI / 180);
        this.characterController.setMinSlopeSlideAngle(30 * Math.PI / 180);
        
        this.bodies = new Map(); // mesh -> rigidBody mapping
        this.ready = true;
    }
    
    // Add static geometry (terrain, buildings)
    addStatic(mesh) {
        // Extract vertices and indices from Three.js mesh
        const geo = mesh.geometry;
        const positions = geo.attributes.position.array;
        const indices = geo.index ? geo.index.array : null;
        
        const bodyDesc = RAPIER.RigidBodyDesc.fixed();
        const body = this.world.createRigidBody(bodyDesc);
        
        const colliderDesc = RAPIER.ColliderDesc.trimesh(
            new Float32Array(positions),
            indices ? new Uint32Array(indices) : undefined
        );
        this.world.createCollider(colliderDesc, body);
        
        this.bodies.set(mesh, body);
    }
    
    // Add dynamic object (crates, barrels, ragdolls)
    addDynamic(mesh, shape = 'box', mass = 1) {
        const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z);
        const body = this.world.createRigidBody(bodyDesc);
        
        let colliderDesc;
        if (shape === 'box') {
            const box = new THREE.Box3().setFromObject(mesh);
            const size = box.getSize(new THREE.Vector3());
            colliderDesc = RAPIER.ColliderDesc.cuboid(size.x/2, size.y/2, size.z/2);
        } else if (shape === 'sphere') {
            colliderDesc = RAPIER.ColliderDesc.ball(mesh.geometry.parameters.radius);
        } else if (shape === 'capsule') {
            colliderDesc = RAPIER.ColliderDesc.capsule(0.7, 0.35);
        }
        
        colliderDesc.setMass(mass);
        this.world.createCollider(colliderDesc, body);
        this.bodies.set(mesh, body);
        
        return body;
    }
    
    // Add player capsule
    addPlayer(position) {
        const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(position.x, position.y, position.z);
        this.playerBody = this.world.createRigidBody(bodyDesc);
        
        const colliderDesc = RAPIER.ColliderDesc.capsule(0.7, 0.35);
        this.playerCollider = this.world.createCollider(colliderDesc, this.playerBody);
    }
    
    // Move player with collision
    movePlayer(desiredMovement) {
        this.characterController.computeColliderMovement(
            this.playerCollider,
            desiredMovement
        );
        
        const corrected = this.characterController.computedMovement();
        const pos = this.playerBody.translation();
        
        this.playerBody.setNextKinematicTranslation({
            x: pos.x + corrected.x,
            y: pos.y + corrected.y,
            z: pos.z + corrected.z,
        });
        
        // Check if grounded
        this.playerGrounded = this.characterController.computedGrounded();
        
        return new THREE.Vector3(
            pos.x + corrected.x,
            pos.y + corrected.y,
            pos.z + corrected.z
        );
    }
    
    // Step simulation
    update(dt) {
        this.world.timestep = dt;
        this.world.step();
        
        // Sync Three.js meshes with physics bodies
        for (const [mesh, body] of this.bodies) {
            if (body.isDynamic()) {
                const pos = body.translation();
                const rot = body.rotation();
                mesh.position.set(pos.x, pos.y, pos.z);
                mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
            }
        }
    }
}
```

### Bundle Size & Performance
- WASM: ~200KB gzipped
- Can handle 1000+ colliders at 60fps
- CDN: `https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat/rapier.js`

---

## Collision Shapes Guide

| Shape | Use For | Cost |
|-------|---------|------|
| Box | Crates, buildings, furniture | Cheapest |
| Sphere | Balls, simple NPCs | Cheapest |
| Capsule | Characters, humanoids | Cheap |
| Cylinder | Pillars, trees | Cheap |
| Convex Hull | Vehicles, rocks | Medium |
| Triangle Mesh | Terrain, complex buildings | Expensive |
| Heightfield | Terrain | Medium (optimized trimesh) |

**Rule:** Always use the simplest shape that works. A trimesh for every object kills performance.

---

## Common Collision Bugs & Fixes

| Bug | Cause | Fix |
|-----|-------|-----|
| Fall through floor | High velocity tunnels past thin geometry | CCD (continuous collision detection) or thicker floors |
| Stuck in wall | Pushed into geometry, can't escape | Depenetration + max push distance |
| Jittering on ground | Gravity applied when already grounded | Only apply gravity when `!grounded` |
| Objects explode | Overlapping bodies at spawn | Spawn above ground, let gravity settle |
| Sliding on flat | Velocity not zeroed on ground | Zero Y velocity when grounded |
| Stairs = wall | No step-up logic | Use Rapier's `enableAutostep` or manual step |

---

## NavMesh (NPC Pathfinding)

NPCs need to know where they can walk. NavMesh = navigation mesh = a simplified mesh of walkable surfaces.

```javascript
// Using recast-navigation (Recast/Detour WASM port)
import { init as initRecast, NavMeshGenerator } from 'recast-navigation';

async function generateNavMesh(geometry) {
    await initRecast();
    
    const generator = new NavMeshGenerator();
    const navMesh = generator.generate(geometry, {
        cellSize: 0.3,
        cellHeight: 0.2,
        agentHeight: 1.8,
        agentRadius: 0.4,
        agentMaxClimb: 0.4,  // can step up this high
        agentMaxSlope: 45,    // max walkable slope
    });
    
    return navMesh;
}

// Pathfinding
function findPath(navMesh, start, end) {
    const path = navMesh.computePath(start, end);
    return path; // array of Vector3 waypoints
}
```

---

## Implementation Plan for Crate Engine

### Recommended Approach: Hybrid

1. **Phase 1:** Three.js Octree for character (quick win, no dependencies)
2. **Phase 2:** Rapier.js for full physics (vehicles, dynamic objects, ragdolls)
3. **Phase 3:** Recast NavMesh for NPC pathfinding

### Integration Steps
1. Add Octree collision to character controller
2. Build world collision mesh from all static objects
3. Test: walk into walls, up stairs, down slopes
4. Then migrate to Rapier for dynamic physics
5. Add NavMesh for NPC movement

---

*Next: 09-animation-system.md — State machines, blending, Mixamo*
