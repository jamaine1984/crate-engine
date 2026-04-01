// === COLLISION SYSTEM — Three.js Octree + Capsule ===
// System 1 of the Crate Engine rebuild
// Replaces raycast-only ground/wall checks with proper capsule collision

import * as THREE from 'three';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';

// Reusable vectors to avoid GC
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

export class CollisionWorld {
  constructor() {
    this.octree = new Octree();
    this.gravity = 30;
    this.built = false;
    this._debugMeshes = [];
    this._scene = null;
  }

  /**
   * Build octree from scene geometry.
   * Call after terrain + buildings + solid objects are loaded.
   * @param {THREE.Object3D} root - Scene root or group containing collidable geometry
   * @param {THREE.Scene} scene - For debug visualization
   */
  build(root, scene) {
    this.octree.clear();
    this.octree.fromGraphNode(root);
    this.built = true;
    this._scene = scene;
    console.log('[Collision] Octree built from scene geometry');
  }

  /**
   * Mark collision as dirty — will rebuild next frame.
   * Call this when objects are added/removed from scene.
   */
  markDirty() {
    this._dirty = true;
  }

  /**
   * Rebuild octree from a group containing all collidable objects.
   * Call once per frame if dirty, or after batch placement.
   * @param {THREE.Group} collisionGroup - Group with all collidable meshes
   */
  rebuildFromGroup(collisionGroup) {
    if (!collisionGroup) return;
    collisionGroup.updateMatrixWorld(true);
    this.octree.clear();
    this.octree.fromGraphNode(collisionGroup);
    this.built = true;
    this._dirty = false;
    console.log('[Collision] Octree rebuilt (' + collisionGroup.children.length + ' objects)');
  }

  /**
   * Check if dirty and rebuild if needed (call in game loop)
   */
  updateIfDirty() {
    if (this._dirty && this._collisionGroup) {
      this.rebuildFromGroup(this._collisionGroup);
    }
  }

  /**
   * Create a player capsule collider
   * @param {number} height - Total character height (default 1.7)
   * @param {number} radius - Capsule radius (default 0.35)
   * @returns {PlayerCollider}
   */
  createPlayerCollider(height = 1.7, radius = 0.35) {
    return new PlayerCollider(this, height, radius);
  }
}

export class PlayerCollider {
  constructor(world, height, radius) {
    this.world = world;
    this.height = height;
    this.radius = radius;

    // Capsule: bottom center at foot level + radius, top at head - radius
    this.capsule = new Capsule(
      new THREE.Vector3(0, radius, 0),          // bottom sphere center
      new THREE.Vector3(0, height - radius, 0),  // top sphere center
      radius
    );

    this.velocity = new THREE.Vector3();
    this.onFloor = false;
    this.onSlope = false;
    this.slopeAngle = 0;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.lastGroundY = 0;

    // Config
    this.maxSlopeAngle = 50; // degrees — steeper = slide
    this.stepHeight = 0.4;   // auto-step up to this height
    this.feetOffset = 0.05;  // small upward offset to prevent feet clipping
  }

  /** Get the world position of the capsule (foot level) */
  get position() {
    _v1.copy(this.capsule.start);
    _v1.y -= this.radius;
    _v1.y += this.feetOffset; // lift to prevent feet clipping into ground
    return _v1;
  }

  /** Set the capsule position from foot position */
  setPosition(x, y, z) {
    const dx = x - this.capsule.start.x;
    const dy = y + this.radius - this.capsule.start.y;
    const dz = z - this.capsule.start.z;
    this.capsule.start.x += dx;
    this.capsule.start.y += dy;
    this.capsule.start.z += dz;
    this.capsule.end.x += dx;
    this.capsule.end.y += dy;
    this.capsule.end.z += dz;
  }

  /**
   * Main physics update — call once per frame
   * @param {number} dt - Delta time in seconds
   * @param {THREE.Vector3} inputVelocity - Desired horizontal movement (world space)
   */
  update(dt, inputVelocity) {
    if (!this.world.built) return;

    // Apply gravity
    if (!this.onFloor) {
      this.velocity.y -= this.world.gravity * dt;
    }

    // Apply horizontal input
    if (inputVelocity) {
      this.velocity.x = inputVelocity.x;
      this.velocity.z = inputVelocity.z;
    }

    // Damping
    const damping = Math.exp(-4 * dt) - 1;
    if (this.onFloor) {
      this.velocity.addScaledVector(this.velocity, damping);
    } else {
      // Less damping in air (preserve momentum)
      this.velocity.x += this.velocity.x * damping * 0.1;
      this.velocity.z += this.velocity.z * damping * 0.1;
    }

    // Move capsule
    const deltaPos = _v1.copy(this.velocity).multiplyScalar(dt);
    this.capsule.translate(deltaPos);

    // Resolve collisions
    this._resolveCollisions();
  }

  /** Check capsule against octree and resolve penetration */
  _resolveCollisions() {
    this.onFloor = false;
    this.onSlope = false;

    const result = this.world.octree.capsuleIntersect(this.capsule);
    
    // Fallback: terrain raycast when octree misses (thin geometry like ground planes)
    if (!result && this.velocity.y <= 0) {
      const footY = this.capsule.start.y - this.radius;
      // Raycast down from capsule center to find ground
      const terrainMesh = window._terrainMesh;
      const groundMeshes = terrainMesh ? [terrainMesh] : [];
      // Also check default ground
      const sceneGround = window._currentGround;
      if (sceneGround) groundMeshes.push(sceneGround);
      
      if (groundMeshes.length > 0) {
        const ray = new THREE.Raycaster(
          new THREE.Vector3(this.capsule.start.x, this.capsule.start.y + 5, this.capsule.start.z),
          new THREE.Vector3(0, -1, 0), 0, 20
        );
        for (const gm of groundMeshes) {
          const hits = ray.intersectObject(gm);
          if (hits.length > 0) {
            const groundY = hits[0].point.y;
            if (footY <= groundY + 0.05) {
              const dy = groundY - footY;
              this.capsule.start.y += dy;
              this.capsule.end.y += dy;
              this.velocity.y = 0;
              this.onFloor = true;
              this.groundNormal.set(0, 1, 0);
              this.lastGroundY = groundY;
              return;
            }
          }
        }
      }
    }

    if (result) {
      const angle = Math.acos(result.normal.y) * (180 / Math.PI);
      this.slopeAngle = angle;
      this.groundNormal.copy(result.normal);

      if (result.normal.y > 0.5) {
        // Standing on something
        this.onFloor = true;

        if (angle > 5 && angle < this.maxSlopeAngle) {
          this.onSlope = true;
        }

        if (angle >= this.maxSlopeAngle) {
          // Too steep — slide down
          this.onFloor = false;
          this.onSlope = true;
          // Project velocity onto slope to slide
          this.velocity.addScaledVector(
            result.normal,
            -result.normal.dot(this.velocity)
          );
        }
      }

      if (this.onFloor) {
        // Kill vertical velocity when landing
        this.velocity.y = Math.max(0, this.velocity.y);
        this.lastGroundY = this.position.y;
      } else {
        // Wall or ceiling — slide along surface
        this.velocity.addScaledVector(
          result.normal,
          -result.normal.dot(this.velocity)
        );
      }

      // Push capsule out of collision
      this.capsule.translate(result.normal.multiplyScalar(result.depth));
    }
  }

  /**
   * Apply a jump impulse
   * @param {number} force - Jump velocity (default 10)
   */
  jump(force = 10) {
    if (this.onFloor) {
      this.velocity.y = force;
      this.onFloor = false;
    }
  }

  /**
   * Teleport to position (no collision check)
   */
  teleport(x, y, z) {
    this.setPosition(x, y, z);
    this.velocity.set(0, 0, 0);
    this.onFloor = false;
  }
}

// Singleton for global access
export const collisionWorld = new CollisionWorld();

// Expose globally for engine.mjs integration
window._collisionWorld = collisionWorld;
