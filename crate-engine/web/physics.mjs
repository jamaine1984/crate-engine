// ═══════════════════════════════════════════════════════════════
// CRATE ENGINE — RAPIER PHYSICS MODULE
// Real rigidbody simulation via Rapier.js (Rust/WASM)
// ═══════════════════════════════════════════════════════════════

import * as THREE from 'three';

let RAPIER = null;
let world = null;
const bodies = new Map(); // mesh → { body, collider, type }
let initialized = false;
let _initPromise = null;

// ── Init ────────────────────────────────────────────────────────
export async function init() {
  if (initialized) return true;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      const mod = await import('https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.19.0/+esm');
      RAPIER = mod.default || mod;
      await RAPIER.init();

      world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

      // Static infinite ground plane at y=0
      const groundDesc = RAPIER.ColliderDesc.halfSpace(new RAPIER.Vector3(0, 1, 0));
      world.createCollider(groundDesc);

      initialized = true;
      console.log('[PHYSICS] Rapier 3D initialized ✓');

      const el = document.getElementById('wasm-status');
      if (el) { el.textContent = 'WASM: Rapier ✓'; el.style.color = '#4ade80'; }
      return true;
    } catch (e) {
      console.warn('[PHYSICS] Rapier init failed:', e);
      const el = document.getElementById('wasm-status');
      if (el) { el.textContent = 'WASM: physics unavailable'; el.style.color = '#ef4444'; }
      return false;
    }
  })();

  return _initPromise;
}

// ── Add rigidbody to a Three.js mesh ────────────────────────────
// type: 'dynamic' | 'static' | 'kinematic'
export function addRigidbody(mesh, type = 'dynamic') {
  if (!initialized || !world) { console.warn('[PHYSICS] Call physics.init() first'); return null; }
  if (bodies.has(mesh)) return bodies.get(mesh);

  const pos = mesh.position;
  const quat = mesh.quaternion;

  let bodyDesc;
  switch (type) {
    case 'kinematic':
      bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased(); break;
    case 'static':
      bodyDesc = RAPIER.RigidBodyDesc.fixed(); break;
    default:
      bodyDesc = RAPIER.RigidBodyDesc.dynamic(); break;
  }

  bodyDesc.setTranslation(pos.x, pos.y, pos.z);
  bodyDesc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });

  const body = world.createRigidBody(bodyDesc);

  // Auto-size collider from bounding box
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  // Offset from mesh origin to box center
  const cx = center.x - pos.x;
  const cy = center.y - pos.y;
  const cz = center.z - pos.z;

  const hx = Math.max(size.x / 2, 0.05);
  const hy = Math.max(size.y / 2, 0.05);
  const hz = Math.max(size.z / 2, 0.05);

  const colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
    .setTranslation(cx, cy, cz)
    .setRestitution(0.25)
    .setFriction(0.8);

  const collider = world.createCollider(colliderDesc, body);

  bodies.set(mesh, { body, collider, type });
  mesh.userData.hasPhysics = true;
  mesh.userData.physicsType = type;

  return { body, collider };
}

// ── Remove rigidbody from a mesh ────────────────────────────────
export function removeRigidbody(mesh) {
  if (!initialized || !world) return;
  const entry = bodies.get(mesh);
  if (!entry) return;

  try {
    world.removeCollider(entry.collider, true);
    world.removeRigidBody(entry.body);
  } catch (e) { /* already removed */ }

  bodies.delete(mesh);
  mesh.userData.hasPhysics = false;
  delete mesh.userData.physicsType;
}

// ── Step physics world and sync to Three.js ─────────────────────
export function step(dt) {
  if (!initialized || !world) return;
  world.timestep = Math.min(dt, 1 / 30);
  world.step();

  for (const [mesh, { body, type }] of bodies) {
    if (type === 'static' || type === 'fixed') continue;
    const t = body.translation();
    const r = body.rotation();
    mesh.position.set(t.x, t.y, t.z);
    mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }
}

// ── Apply one-shot impulse to a dynamic mesh ────────────────────
export function applyImpulse(mesh, x, y, z) {
  if (!initialized) return;
  const entry = bodies.get(mesh);
  if (entry && entry.type === 'dynamic') {
    entry.body.applyImpulse({ x, y, z }, true);
  }
}

// ── Apply force every frame ─────────────────────────────────────
export function applyForce(mesh, x, y, z) {
  if (!initialized) return;
  const entry = bodies.get(mesh);
  if (entry && entry.type === 'dynamic') {
    entry.body.addForce({ x, y, z }, true);
  }
}

// ── Wake up a sleeping body ─────────────────────────────────────
export function wake(mesh) {
  if (!initialized) return;
  const entry = bodies.get(mesh);
  if (entry) entry.body.wakeUp();
}

// ── Utilities ───────────────────────────────────────────────────
export function isReady()    { return initialized; }
export function getWorld()   { return world; }
export function getBodies()  { return bodies; }
export function bodyCount()  { return bodies.size; }

// ── Clear all bodies (scene reset) ─────────────────────────────
export function clear() {
  if (!initialized || !world) return;
  for (const [mesh] of bodies) removeRigidbody(mesh);
}

export default { init, addRigidbody, removeRigidbody, step, applyImpulse, applyForce, wake, isReady, getWorld, getBodies, bodyCount, clear };
