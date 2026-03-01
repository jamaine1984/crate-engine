// === CHARACTER CONTROLLER & TOWN BUILDER ===
// Manages player character, NPCs, vehicles, inventory, and structured building

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { collisionWorld } from './collision.mjs?v=5';

const loader = new GLTFLoader();
// Get terrain height at world position
function _getTerrainY(x, z) {
  const tm = window._terrainMesh;
  if (!tm) return 0;
  const rc = new THREE.Raycaster(
    new THREE.Vector3(x, 500, z),
    new THREE.Vector3(0, -1, 0)
  );
  const hits = rc.intersectObject(tm);
  return hits.length > 0 ? hits[0].point.y : 0;
}

// Extended ground check: terrain + interior floors + solid objects
// Cached raycasters for performance (avoid GC churn)
const _cachedRaycaster = new THREE.Raycaster();
const _cachedOrigin = new THREE.Vector3();
const _downDir = new THREE.Vector3(0, -1, 0);

function _getGroundY(x, z, currentY) {
  const rc = _cachedRaycaster;
  _cachedOrigin.set(x, (currentY || 0) + 2, z);
  rc.set(_cachedOrigin, _downDir);
  rc.near = 0;
  rc.far = 10;
  
  let bestY = -Infinity;
  
  // Check terrain
  const tm = window._terrainMesh;
  if (tm) {
    const hits = rc.intersectObject(tm);
    if (hits.length > 0) bestY = Math.max(bestY, hits[0].point.y);
  }
  
  // Check solid objects (interior floors, stairs, platforms)
  const solids = (window._sceneObjects || []).filter(o => 
    o && o.userData && (o.userData.isSolid || o.userData.isFloor || o.userData.isInterior)
  );
  
  for (const solid of solids) {
    const hits = rc.intersectObject(solid, true); // recursive for groups
    for (const hit of hits) {
      // Only count surfaces we can stand on (normal pointing roughly up)
      if (hit.face && hit.face.normal) {
        const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        if (worldNormal.y > 0.5) { // slope < ~60 degrees
          bestY = Math.max(bestY, hit.point.y);
        }
      } else {
        bestY = Math.max(bestY, hit.point.y);
      }
    }
  }
  
  return bestY > -Infinity ? bestY : 0;
}

// Wall collision check: returns true if movement would hit a wall
function _checkWallCollision(position, direction, distance) {
  const rc = new THREE.Raycaster(
    new THREE.Vector3(position.x, position.y + 0.5, position.z), // chest height
    direction.clone().normalize(),
    0, distance + 0.3 // check slightly ahead
  );
  
  const solids = (window._sceneObjects || []).filter(o => 
    o && o.userData && (o.userData.isSolid || o.userData.isInterior)
  );
  
  for (const solid of solids) {
    const hits = rc.intersectObject(solid, true);
    for (const hit of hits) {
      // Wall = surface with mostly horizontal normal
      if (hit.face && hit.face.normal) {
        const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        if (Math.abs(worldNormal.y) < 0.5) { // mostly vertical surface = wall
          return { hit: true, point: hit.point, normal: worldNormal, distance: hit.distance };
        }
      }
    }
  }
  return { hit: false };
}


// === WEAPON DATABASE ===
// Every weapon defined by data, not hardcoded logic
const WEAPON_DATABASE = {
  // === MELEE ===
  sword: {
    id: 'sword', glb: 'models/sword_iron.glb', name: 'Iron Sword', type: 'melee', subtype: 'one_handed',
    damage: 25, attackSpeed: 1.2, range: 2.5, staminaCost: 15, knockback: 3,
    comboChain: ['slash_r', 'slash_l', 'thrust'], critMultiplier: 1.5, critChance: 0.1,
    blockReduction: 0.5, weight: 3,
    mesh: { type: 'sword', bladeColor: 0xaaaacc, hiltColor: 0x553311, bladeLen: 0.65, bladeW: 0.05 },
    holdOffset: { x: 0, y: 0, z: 0 }, holdRotation: { x: 0, y: 0, z: 0 },
    holsterBone: 'back', holsterOffset: { x: -0.15, y: 0.3, z: -0.05 },
    holsterRotation: { x: Math.PI * 0.7, y: 0, z: 0 }
  },
  axe: {
    id: 'axe', glb: 'models/axe_iron.glb', name: 'Battle Axe', type: 'melee', subtype: 'one_handed',
    damage: 35, attackSpeed: 0.9, range: 2.2, staminaCost: 20, knockback: 5,
    comboChain: ['chop_r', 'chop_l'], critMultiplier: 2.0, critChance: 0.08,
    blockReduction: 0.3, weight: 5,
    mesh: { type: 'axe', handleColor: 0x664422, headColor: 0x888899, handleLen: 0.55 },
    holdOffset: { x: 0, y: 0, z: 0 }, holdRotation: { x: 0, y: 0, z: 0 },
    holsterBone: 'back', holsterOffset: { x: 0.15, y: 0.3, z: -0.05 },
    holsterRotation: { x: Math.PI * 0.7, y: 0, z: Math.PI * 0.2 }
  },
  dagger: {
    id: 'dagger', glb: 'models/dagger_00.glb', name: 'Steel Dagger', type: 'melee', subtype: 'one_handed',
    damage: 15, attackSpeed: 2.0, range: 1.5, staminaCost: 8, knockback: 1,
    comboChain: ['stab', 'stab', 'slash', 'stab'], critMultiplier: 2.5, critChance: 0.2,
    blockReduction: 0.2, weight: 1,
    mesh: { type: 'dagger', bladeColor: 0xbbbbdd, hiltColor: 0x443322, bladeLen: 0.25 },
    holdOffset: { x: 0, y: 0, z: 0 }, holdRotation: { x: 0, y: 0, z: 0 },
    holsterBone: 'hip', holsterOffset: { x: 0.15, y: 0, z: 0 },
    holsterRotation: { x: 0, y: 0, z: Math.PI * 0.5 }
  },
  hammer: {
    id: 'hammer', glb: 'models/hammer_00.glb', name: 'War Hammer', type: 'melee', subtype: 'two_handed',
    damage: 50, attackSpeed: 0.6, range: 2.8, staminaCost: 30, knockback: 8,
    comboChain: ['overhead', 'sweep'], critMultiplier: 1.8, critChance: 0.05,
    blockReduction: 0.4, weight: 8,
    mesh: { type: 'hammer', handleColor: 0x554433, headColor: 0x666677, handleLen: 0.8 },
    holdOffset: { x: 0, y: 0, z: 0 }, holdRotation: { x: 0, y: 0, z: 0 },
    holsterBone: 'back', holsterOffset: { x: 0, y: 0.4, z: -0.1 },
    holsterRotation: { x: Math.PI * 0.6, y: 0, z: 0 }
  },
  spear: {
    id: 'spear', glb: 'models/spear_00.glb', name: 'Iron Spear', type: 'melee', subtype: 'two_handed',
    damage: 30, attackSpeed: 1.0, range: 3.5, staminaCost: 18, knockback: 4,
    comboChain: ['thrust', 'sweep', 'thrust'], critMultiplier: 1.7, critChance: 0.12,
    blockReduction: 0.3, weight: 4,
    mesh: { type: 'spear', shaftColor: 0x664422, tipColor: 0xccccdd, shaftLen: 1.2 },
    holdOffset: { x: 0, y: 0, z: 0 }, holdRotation: { x: 0, y: 0, z: 0 },
    holsterBone: 'back', holsterOffset: { x: 0.1, y: 0.5, z: -0.05 },
    holsterRotation: { x: Math.PI * 0.8, y: 0, z: 0 }
  },
  katana: {
    id: 'katana', glb: 'models/sword_long.glb', name: 'Katana', type: 'melee', subtype: 'one_handed',
    damage: 28, attackSpeed: 1.4, range: 2.8, staminaCost: 12, knockback: 2,
    comboChain: ['slash_r', 'slash_l', 'thrust', 'iai_slash'], critMultiplier: 2.0, critChance: 0.15,
    blockReduction: 0.6, weight: 2.5,
    mesh: { type: 'katana', bladeColor: 0xccccee, hiltColor: 0x221111, bladeLen: 0.7, curved: true },
    holdOffset: { x: 0, y: 0, z: 0 }, holdRotation: { x: 0, y: 0, z: 0 },
    holsterBone: 'hip', holsterOffset: { x: -0.2, y: 0.05, z: 0.1 },
    holsterRotation: { x: 0, y: Math.PI * 0.3, z: Math.PI * 0.5 }
  },
  // === RANGED ===
  pistol: {
    id: 'pistol', glb: 'models/blasterb.glb', name: '9mm Pistol', type: 'ranged', subtype: 'pistol',
    damage: 18, fireRate: 300, range: 50, spread: 3, maxSpread: 12,
    spreadGrowth: 1.5, spreadRecovery: 8,
    recoilV: 2.5, recoilH: 0.5, recoilRecovery: 6,
    magSize: 12, reloadTime: 1.5, bulletSpeed: Infinity,
    headshotMult: 2.0, adsZoom: 1.2, adsSpeed: 0.12, weight: 1.5,
    mesh: { type: 'pistol', bodyColor: 0x222222, gripColor: 0x333333 },
    muzzleFlash: { size: 0.2, duration: 0.04, color: 0xffaa00 },
    tracer: { color: 0xffdd00, width: 0.008, duration: 0.08 },
    holdOffset: { x: 0, y: -0.05, z: -0.1 }, holdRotation: { x: -Math.PI/2, y: 0, z: 0 },
    holsterBone: 'hip', holsterOffset: { x: 0.15, y: -0.05, z: 0 },
    holsterRotation: { x: 0, y: 0, z: Math.PI * 0.4 }
  },
  rifle: {
    id: 'rifle', glb: 'models/blasterf.glb', name: 'Assault Rifle', type: 'ranged', subtype: 'rifle',
    damage: 14, fireRate: 600, range: 100, spread: 2, maxSpread: 10,
    spreadGrowth: 0.8, spreadRecovery: 5,
    recoilV: 1.8, recoilH: 0.4, recoilRecovery: 5,
    magSize: 30, reloadTime: 2.5, bulletSpeed: Infinity,
    headshotMult: 2.5, adsZoom: 1.5, adsSpeed: 0.18, weight: 4,
    mesh: { type: 'rifle', bodyColor: 0x333333, stockColor: 0x553311 },
    muzzleFlash: { size: 0.3, duration: 0.04, color: 0xffaa00 },
    tracer: { color: 0xffdd00, width: 0.01, duration: 0.06 },
    holdOffset: { x: 0, y: -0.05, z: -0.15 }, holdRotation: { x: -Math.PI/2, y: 0, z: 0 },
    holsterBone: 'back', holsterOffset: { x: -0.1, y: 0.2, z: -0.08 },
    holsterRotation: { x: Math.PI * 0.85, y: 0, z: 0 }
  },
  shotgun: {
    id: 'shotgun', glb: 'models/blasterg.glb', name: 'Pump Shotgun', type: 'ranged', subtype: 'shotgun',
    damage: 8, pellets: 8, fireRate: 60, range: 25, spread: 8, maxSpread: 15,
    spreadGrowth: 3, spreadRecovery: 4,
    recoilV: 5, recoilH: 1, recoilRecovery: 3,
    magSize: 6, reloadTime: 3.0, bulletSpeed: Infinity,
    headshotMult: 1.5, adsZoom: 1.1, adsSpeed: 0.2, weight: 5,
    mesh: { type: 'shotgun', bodyColor: 0x333333, stockColor: 0x664422 },
    muzzleFlash: { size: 0.4, duration: 0.06, color: 0xffbb00 },
    tracer: { color: 0xffcc00, width: 0.012, duration: 0.06 },
    holdOffset: { x: 0, y: -0.05, z: -0.15 }, holdRotation: { x: -Math.PI/2, y: 0, z: 0 },
    holsterBone: 'back', holsterOffset: { x: 0.1, y: 0.2, z: -0.08 },
    holsterRotation: { x: Math.PI * 0.85, y: 0, z: 0 }
  },
  smg: {
    id: 'smg', glb: 'models/blasterc.glb', name: 'SMG', type: 'ranged', subtype: 'smg',
    damage: 10, fireRate: 900, range: 40, spread: 4, maxSpread: 16,
    spreadGrowth: 1.2, spreadRecovery: 7,
    recoilV: 1.2, recoilH: 0.8, recoilRecovery: 7,
    magSize: 25, reloadTime: 2.0, bulletSpeed: Infinity,
    headshotMult: 2.0, adsZoom: 1.2, adsSpeed: 0.12, weight: 2.5,
    mesh: { type: 'smg', bodyColor: 0x2a2a2a, gripColor: 0x333333 },
    muzzleFlash: { size: 0.2, duration: 0.03, color: 0xffaa00 },
    tracer: { color: 0xffdd00, width: 0.008, duration: 0.05 },
    holdOffset: { x: 0, y: -0.05, z: -0.1 }, holdRotation: { x: -Math.PI/2, y: 0, z: 0 },
    holsterBone: 'back', holsterOffset: { x: 0, y: 0.15, z: -0.06 },
    holsterRotation: { x: Math.PI * 0.8, y: 0, z: 0 }
  },
  sniper: {
    id: 'sniper', glb: 'models/blasterh.glb', name: 'Sniper Rifle', type: 'ranged', subtype: 'sniper',
    damage: 75, fireRate: 40, range: 200, spread: 0.5, maxSpread: 4,
    spreadGrowth: 3, spreadRecovery: 2,
    recoilV: 8, recoilH: 0.5, recoilRecovery: 2,
    magSize: 5, reloadTime: 3.5, bulletSpeed: Infinity,
    headshotMult: 3.0, adsZoom: 3.0, adsSpeed: 0.25, weight: 6,
    mesh: { type: 'sniper', bodyColor: 0x2a3a2a, stockColor: 0x443322, scopeColor: 0x111111 },
    muzzleFlash: { size: 0.35, duration: 0.05, color: 0xffaa00 },
    tracer: { color: 0xffffff, width: 0.015, duration: 0.1 },
    holdOffset: { x: 0, y: 0, z: 0 }, holdRotation: { x: Math.PI, y: 0, z: Math.PI/2 },
    holsterBone: 'back', holsterOffset: { x: -0.12, y: 0.3, z: -0.08 },
    holsterRotation: { x: Math.PI * 0.85, y: 0, z: 0 }
  },
  bow: {
    id: 'bow', glb: 'models/bow_wood.glb', name: 'Longbow', type: 'ranged', subtype: 'bow',
    damage: 40, fireRate: 60, range: 80, spread: 1, maxSpread: 6,
    spreadGrowth: 0, spreadRecovery: 10,
    recoilV: 0, recoilH: 0, recoilRecovery: 0,
    magSize: 1, reloadTime: 0, bulletSpeed: 60, chargeTime: 1.2,
    headshotMult: 2.5, adsZoom: 1.3, adsSpeed: 0.3, weight: 2,
    mesh: { type: 'bow', woodColor: 0x664422, stringColor: 0xcccccc },
    muzzleFlash: null,
    tracer: null,
    holdOffset: { x: 0, y: 0, z: 0 }, holdRotation: { x: 0, y: Math.PI/2, z: 0 },
    holsterBone: 'back', holsterOffset: { x: 0, y: 0.3, z: -0.1 },
    holsterRotation: { x: 0, y: 0, z: Math.PI * 0.5 }
  }
};

// Weapon mesh factory — creates detailed procedural weapon meshes
function createWeaponMesh(weaponId) {
  const data = WEAPON_DATABASE[weaponId];
  if (!data) return null;
  
  // Return a placeholder group immediately — GLB loads async into it
  const group = new THREE.Group();
  group.userData.weaponId = weaponId;
  group.userData.weaponData = data;
  
  // Try loading real GLB model
  if (data.glb && window._gltfLoader) {
    window._gltfLoader.load(data.glb, (gltf) => {
        const model = gltf.scene;
        // Auto-scale: measure model, normalize so weapon fits procedural size (~0.8 units)
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        // Normalize to same scale as procedural mesh (~0.8 units) so bone scale compensation works
        if (maxDim > 0) model.scale.multiplyScalar(0.8 / maxDim);
        // Center the model at origin
        const box2 = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        box2.getCenter(center);
        model.position.sub(center);
        // Remove procedural children and add GLB
        while (group.children.length > 0) group.remove(group.children[0]);
        group.add(model);
        group.userData.isGLB = true;
      }, undefined, (err) => {
        console.warn('[Weapon] GLB load failed for', data.glb, '- using procedural fallback');
      });
  }
  
  // Build procedural mesh immediately as fallback (shown until GLB loads)
  const m = data.mesh;
  
  if (m.type === 'sword' || m.type === 'katana') {
    const bladeGeo = new THREE.BoxGeometry(m.bladeW || 0.05, m.bladeLen || 0.6, 0.015);
    const bladeMat = new THREE.MeshStandardMaterial({ color: m.bladeColor, metalness: 0.85, roughness: 0.15 });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.y = (m.bladeLen || 0.6) / 2 + 0.06;
    
    // Guard
    const guardGeo = new THREE.BoxGeometry(0.12, 0.025, 0.04);
    const guardMat = new THREE.MeshStandardMaterial({ color: 0x887744, metalness: 0.7 });
    const guard = new THREE.Mesh(guardGeo, guardMat);
    guard.position.y = 0.06;
    
    // Grip
    const gripGeo = new THREE.CylinderGeometry(0.018, 0.02, 0.1, 8);
    const gripMat = new THREE.MeshStandardMaterial({ color: m.hiltColor, roughness: 0.8 });
    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.y = 0;
    
    // Pommel
    const pommelGeo = new THREE.SphereGeometry(0.022, 8, 6);
    const pommel = new THREE.Mesh(pommelGeo, guardMat);
    pommel.position.y = -0.06;
    
    group.add(blade, guard, grip, pommel);
    
  } else if (m.type === 'axe') {
    const handleGeo = new THREE.CylinderGeometry(0.018, 0.02, m.handleLen, 8);
    const handleMat = new THREE.MeshStandardMaterial({ color: m.handleColor, roughness: 0.8 });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.y = m.handleLen / 2 - 0.05;
    
    // Axe head — wedge shape
    const headGeo = new THREE.BoxGeometry(0.18, 0.14, 0.03);
    const headMat = new THREE.MeshStandardMaterial({ color: m.headColor, metalness: 0.75, roughness: 0.25 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0.06, m.handleLen - 0.08, 0);
    
    group.add(handle, head);
    
  } else if (m.type === 'dagger') {
    const bladeGeo = new THREE.BoxGeometry(0.03, m.bladeLen || 0.25, 0.01);
    const bladeMat = new THREE.MeshStandardMaterial({ color: m.bladeColor, metalness: 0.85, roughness: 0.15 });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.y = (m.bladeLen || 0.25) / 2 + 0.04;
    
    const gripGeo = new THREE.CylinderGeometry(0.015, 0.017, 0.08, 8);
    const gripMat = new THREE.MeshStandardMaterial({ color: m.hiltColor, roughness: 0.8 });
    const grip = new THREE.Mesh(gripGeo, gripMat);
    
    const guardGeo = new THREE.BoxGeometry(0.06, 0.015, 0.025);
    const guard = new THREE.Mesh(guardGeo, new THREE.MeshStandardMaterial({ color: 0x887744, metalness: 0.7 }));
    guard.position.y = 0.04;
    
    group.add(blade, grip, guard);
    
  } else if (m.type === 'hammer') {
    const handleGeo = new THREE.CylinderGeometry(0.02, 0.022, m.handleLen, 8);
    const handleMat = new THREE.MeshStandardMaterial({ color: m.handleColor, roughness: 0.8 });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.y = m.handleLen / 2 - 0.05;
    
    const headGeo = new THREE.BoxGeometry(0.12, 0.1, 0.12);
    const headMat = new THREE.MeshStandardMaterial({ color: m.headColor, metalness: 0.6, roughness: 0.3 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = m.handleLen - 0.05;
    
    group.add(handle, head);
    
  } else if (m.type === 'spear') {
    const shaftGeo = new THREE.CylinderGeometry(0.012, 0.015, m.shaftLen, 8);
    const shaftMat = new THREE.MeshStandardMaterial({ color: m.shaftColor, roughness: 0.8 });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.y = m.shaftLen / 2 - 0.05;
    
    const tipGeo = new THREE.ConeGeometry(0.03, 0.12, 4);
    const tipMat = new THREE.MeshStandardMaterial({ color: m.tipColor, metalness: 0.8, roughness: 0.2 });
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.y = m.shaftLen - 0.05;
    
    group.add(shaft, tip);
    
  } else if (m.type === 'pistol') {
    const bodyGeo = new THREE.BoxGeometry(0.03, 0.055, 0.14);
    const bodyMat = new THREE.MeshStandardMaterial({ color: m.bodyColor, metalness: 0.6, roughness: 0.3 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.z = -0.02;
    
    const gripGeo = new THREE.BoxGeometry(0.025, 0.07, 0.035);
    const gripMat = new THREE.MeshStandardMaterial({ color: m.gripColor, roughness: 0.7 });
    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.set(0, -0.05, 0.02);
    grip.rotation.x = 0.2;
    
    const barrelGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8);
    const barrel = new THREE.Mesh(barrelGeo, bodyMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.015, -0.12);
    
    // Muzzle point
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.015, -0.15);
    muzzle.name = 'muzzle';
    
    group.add(body, grip, barrel, muzzle);
    
  } else if (m.type === 'rifle' || m.type === 'smg' || m.type === 'sniper' || m.type === 'shotgun') {
    const barrelLen = m.type === 'sniper' ? 0.45 : m.type === 'shotgun' ? 0.4 : m.type === 'smg' ? 0.25 : 0.35;
    const barrelGeo = new THREE.CylinderGeometry(0.012, 0.014, barrelLen, 8);
    const barrelMat = new THREE.MeshStandardMaterial({ color: m.bodyColor, metalness: 0.6, roughness: 0.3 });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -(barrelLen / 2 + 0.05));
    
    const bodyGeo = new THREE.BoxGeometry(0.04, 0.065, 0.15);
    const body = new THREE.Mesh(bodyGeo, barrelMat);
    body.position.set(0, 0, 0.02);
    
    const stockGeo = new THREE.BoxGeometry(0.035, 0.06, 0.18);
    const stockMat = new THREE.MeshStandardMaterial({ color: m.stockColor || m.bodyColor, roughness: 0.7 });
    const stock = new THREE.Mesh(stockGeo, stockMat);
    stock.position.set(0, -0.01, 0.15);
    
    const magGeo = new THREE.BoxGeometry(0.025, 0.08, 0.03);
    const mag = new THREE.Mesh(magGeo, barrelMat);
    mag.position.set(0, -0.05, 0);
    
    // Scope for sniper
    if (m.type === 'sniper' && m.scopeColor !== undefined) {
      const scopeGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.12, 8);
      const scopeMat = new THREE.MeshStandardMaterial({ color: m.scopeColor, metalness: 0.5 });
      const scope = new THREE.Mesh(scopeGeo, scopeMat);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.05, -0.02);
      group.add(scope);
    }
    
    // Muzzle point
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.02, -(barrelLen + 0.05));
    muzzle.name = 'muzzle';
    
    group.add(barrel, body, stock, mag, muzzle);
    
  } else if (m.type === 'bow') {
    // Bow limb (curved)
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, -0.4, 0),
      new THREE.Vector3(-0.15, 0, 0),
      new THREE.Vector3(0, 0.4, 0)
    );
    const tubeGeo = new THREE.TubeGeometry(curve, 16, 0.01, 6);
    const bowMat = new THREE.MeshStandardMaterial({ color: m.woodColor, roughness: 0.7 });
    const bow = new THREE.Mesh(tubeGeo, bowMat);
    
    // String
    const stringGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.8, 4);
    const stringMat = new THREE.MeshStandardMaterial({ color: m.stringColor });
    const string = new THREE.Mesh(stringGeo, stringMat);
    
    group.add(bow, string);
  }
  
  // Enable shadows on all children
  group.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  
  return group;
}


// === CHARACTER SYSTEM ===

// ═══════════════════════════════════════════════════
// CHARACTER STATE MACHINE (Sketchbook-inspired)
// ═══════════════════════════════════════════════════

const CharacterState = {
  IDLE: 'idle',
  WALK: 'walk', 
  RUN: 'run',
  JUMP: 'jump',
  FALL: 'fall',
  LAND: 'land',
  ROLL: 'roll',
  ATTACK_1: 'attack_1',
  ATTACK_2: 'attack_2',
  ATTACK_3: 'attack_3',
  HEAVY_ATTACK: 'heavy_attack',
  BLOCK: 'block',
  HIT: 'hit',
  DEATH: 'death',
  SWIM: 'swim',
  CLIMB: 'climb',
  AIM: 'aim',
  SHOOT: 'shoot',
};

class CharacterStateMachine {
  constructor(controller) {
    this.controller = controller;
    this.currentState = CharacterState.IDLE;
    this.previousState = null;
    this.stateTime = 0;        // time in current state
    this.locked = false;        // state locked (can't transition during attack anims etc)
    this.lockTimer = 0;
    this.queuedState = null;    // buffered input during lock
  }
  
  get state() { return this.currentState; }
  
  canTransition(newState) {
    if (this.locked && !this._isOverride(newState)) return false;
    if (newState === this.currentState) return false;
    
    // Death blocks everything
    if (this.currentState === CharacterState.DEATH) return false;
    
    // Hit/death can interrupt anything
    if (newState === CharacterState.DEATH || newState === CharacterState.HIT) return true;
    
    // Roll can interrupt idle/walk/run
    if (newState === CharacterState.ROLL) {
      return [CharacterState.IDLE, CharacterState.WALK, CharacterState.RUN].includes(this.currentState);
    }
    
    // Attack combo: attack_2 only from attack_1, attack_3 only from attack_2
    if (newState === CharacterState.ATTACK_2) return this.currentState === CharacterState.ATTACK_1 && this.stateTime > 0.2;
    if (newState === CharacterState.ATTACK_3) return this.currentState === CharacterState.ATTACK_2 && this.stateTime > 0.2;
    
    // Can't attack while jumping/falling (unless we add air attacks later)
    if (newState === CharacterState.ATTACK_1 && [CharacterState.JUMP, CharacterState.FALL].includes(this.currentState)) return false;
    
    return true;
  }
  
  _isOverride(state) {
    return state === CharacterState.DEATH || state === CharacterState.HIT;
  }
  
  transition(newState, lockDuration = 0) {
    if (!this.canTransition(newState)) {
      // Buffer it if locked
      if (this.locked) this.queuedState = newState;
      return false;
    }
    
    this.previousState = this.currentState;
    this.currentState = newState;
    this.stateTime = 0;
    this.queuedState = null;
    
    if (lockDuration > 0) {
      this.locked = true;
      this.lockTimer = lockDuration;
    } else {
      this.locked = false;
    }
    
    // Trigger animation
    this._onEnterState(newState);
    return true;
  }
  
  update(dt) {
    this.stateTime += dt;
    
    // Unlock timer
    if (this.locked) {
      this.lockTimer -= dt;
      if (this.lockTimer <= 0) {
        this.locked = false;
        // Process buffered input
        if (this.queuedState) {
          const q = this.queuedState;
          this.queuedState = null;
          this.transition(q);
        }
      }
    }
    
    // Auto-transitions
    this._autoTransitions(dt);
  }
  
  _autoTransitions(dt) {
    const c = this.controller;
    
    switch (this.currentState) {
      case CharacterState.LAND:
        if (this.stateTime > 0.15) {
          this.transition(c.isMoving ? CharacterState.RUN : CharacterState.IDLE);
        }
        // Landing camera dip
        if (this.stateTime < 0.05 && window._screenShake) {
          window._screenShake.trigger(1.5, 0.15);
        }
        break;
      case CharacterState.FALL:
        if (c.isGrounded) this.transition(CharacterState.LAND, 0.15);
        break;
      case CharacterState.JUMP:
        if (this.stateTime > 0.1 && c.velocity && c.velocity.y < 0) {
          this.transition(CharacterState.FALL);
        }
        break;
      case CharacterState.HIT:
        if (this.stateTime > 0.4) {
          this.transition(c.isMoving ? CharacterState.RUN : CharacterState.IDLE);
        }
        break;
      case CharacterState.IDLE:
      case CharacterState.WALK:
      case CharacterState.RUN:
        if (!c.isGrounded && c.velocity && c.velocity.y < -1) {
          this.transition(CharacterState.FALL);
        }
        break;
    }
  }
  
  _onEnterState(state) {
    const c = this.controller;
    const animMap = {
      [CharacterState.IDLE]: 'idle',
      [CharacterState.WALK]: 'walk',
      [CharacterState.RUN]: 'run',
      [CharacterState.JUMP]: 'jump',
      [CharacterState.FALL]: 'jump',  // reuse jump anim for fall
      [CharacterState.LAND]: 'idle',  // brief landing squat
      [CharacterState.ROLL]: 'roll',
      [CharacterState.ATTACK_1]: 'attack',
      [CharacterState.ATTACK_2]: 'attack',
      [CharacterState.ATTACK_3]: 'swordAttackJump',
      [CharacterState.HEAVY_ATTACK]: 'swordAttackJump',
      [CharacterState.BLOCK]: 'block',
      [CharacterState.HIT]: 'hit',
      [CharacterState.DEATH]: 'death',
      [CharacterState.SWIM]: 'walking', // placeholder
      [CharacterState.AIM]: 'idle_swordRight',
      [CharacterState.SHOOT]: 'idle_swordRight',
    };
    
    const animName = animMap[state];
    if (animName && c.playAnimation) {
      const once = [CharacterState.JUMP, CharacterState.ROLL, CharacterState.ATTACK_1, 
                     CharacterState.ATTACK_2, CharacterState.ATTACK_3, CharacterState.HEAVY_ATTACK,
                     CharacterState.DEATH, CharacterState.HIT, CharacterState.LAND].includes(state);
      c.playAnimation(animName, once);
    }
  }
  
  reset() {
    this.currentState = CharacterState.IDLE;
    this.previousState = null;
    this.stateTime = 0;
    this.locked = false;
    this.lockTimer = 0;
    this.queuedState = null;
  }
}


// === HIT MARKER SYSTEM ===
function _showHitMarker(isKill) {
  let marker = document.getElementById('hit-marker');
  if (!marker) {
    marker = document.createElement('div');
    marker.id = 'hit-marker';
    marker.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'pointer-events:none;z-index:9500;font-size:24px;font-weight:bold;' +
      'text-shadow:0 0 6px rgba(0,0,0,0.8);transition:opacity 0.3s,transform 0.3s;opacity:0;';
    document.body.appendChild(marker);
  }
  
  if (isKill) {
    marker.textContent = '✕';
    marker.style.color = '#ffd700';
    marker.style.fontSize = '32px';
  } else {
    marker.textContent = '×';
    marker.style.color = '#ff4444';
    marker.style.fontSize = '28px';
  }
  
  marker.style.opacity = '1';
  marker.style.transform = 'translate(-50%,-50%) scale(1.3)';
  
  setTimeout(() => {
    marker.style.opacity = '0';
    marker.style.transform = 'translate(-50%,-50%) scale(0.8)';
  }, isKill ? 400 : 200);
}


// === SCREEN SHAKE SYSTEM ===
const _screenShake = {
  intensity: 0,
  decay: 5,        // how fast shake fades
  maxOffset: 0,
  
  trigger(intensity, duration) {
    this.intensity = Math.max(this.intensity, intensity);
    this.maxOffset = intensity * 0.15;
    // Auto-decay over duration
    this.decay = intensity / Math.max(duration, 0.1);
  },
  
  update(dt, camera) {
    if (this.intensity <= 0.01) { this.intensity = 0; return; }
    
    const offset = this.intensity * 0.08;
    camera.position.x += (Math.random() - 0.5) * offset;
    camera.position.y += (Math.random() - 0.5) * offset * 0.7;
    camera.rotation.z += (Math.random() - 0.5) * offset * 0.02;
    
    this.intensity -= this.decay * dt;
    if (this.intensity < 0) this.intensity = 0;
  }
};
window._screenShake = _screenShake;

class CharacterController {
  constructor(scene, camera, objects) {
    this.scene = scene;
    this.camera = camera;
    this.objects = objects;
    this.model = null;
    // Weapon system
    this.sockets = {}; // Bone sockets: hand_r, hand_l, back, hip_r, hip_l
    this.equippedWeapon = null; // Currently equipped weapon ID
    this.equippedWeaponMesh = null; // The 3D mesh in hand
    this.weaponSlots = [null, null, null]; // 3 weapon slots (1,2,3 keys)
    this.activeSlot = 0;
    this.holsteredMeshes = {}; // Weapon meshes on back/hip
    this._twoHandedGrip = false; // Two-handed IK active
    this.ammo = {}; // { weaponId: currentAmmo }
    this.isReloading = false;
    this.reloadTimer = 0;
    this.currentSpread = 0; // Current spread angle (grows with fire)
    this.lastFireTime = 0;
    this.isADS = false; // Aim down sights
    this.comboIndex = 0;
    this.comboTimer = 0;
    this.attackState = 'idle'; // idle, windup, active, recovery
    this.attackTimer = 0;
    this.mixer = null;
    this.animations = {};
    this.currentAnim = 'idle';
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.position = new THREE.Vector3(0, 0, 5); // Default offset from center
    this.rotation = 0; // Y-axis rotation
    this.speed = 0;
    this.isGrounded = true;
    this.jumpVelocity = 0;
    this.gravity = -20;
    
    // Settings
    this.walkSpeed = 4;
    this.runSpeed = 8;
    this.sprintSpeed = 14;
    this.rollSpeed = 12;
    this.jumpForce = 8;
    this.isRunning = false;
    this.isSprinting = false;
    this.isRolling = false;
    this.isAttacking = false;
    this.isBlocking = false;
    this.isDead = false;
    
    // Camera
    this.cameraMode = '3rd'; // '3rd' or '1st'
    // FPS weapon viewmodel
    this._fpScene = new THREE.Scene(); // Separate scene rendered on top
    this._fpScene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const fpLight = new THREE.DirectionalLight(0xfff5e0, 1.2);
    fpLight.position.set(1, 2, 1);
    this._fpScene.add(fpLight);
    this._fpCamera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 10);
    this._fpWeaponGroup = new THREE.Group(); // Holds weapon mesh
    this._fpScene.add(this._fpWeaponGroup);
    this._fpBobTime = 0;
    this._fpSwayX = 0;
    this._fpSwayY = 0;
    this._fpRecoil = 0; // Kick back on shoot
    this.cameraDistance = 10;
    this.cameraHeight = 2.0;
    this.cameraPitch = 0.2;
    this.cameraYaw = 0;
    this.cameraSmoothness = 8;
    // TPS over-the-shoulder
    this.shoulderOffset = 1.0; // Right shoulder offset (positive = right)
    this.shoulderSide = 1; // 1 = right, -1 = left (toggle with T key)
    this.aimCameraDistance = 2.0; // Closer camera when aiming
    this.aimShoulderOffset = 0.8;
    this.isAiming = false; // Right mouse button
    this.aimLerp = 0; // 0 = hip, 1 = ADS (smooth transition)
    this.aimFOV = 45; // Narrower FOV when aiming
    this.normalFOV = 60;
    // Camera collision
    this.actualCameraDistance = 4; // After collision check
    this.mouseSensitivity = 0.003; // Adjustable
    
    // Inventory
    this.inventory = [];
    this.equippedWeapon = null;
    this.equippedShield = null;
    this.groundOffset = 0;
    this.isInvincible = false;
    this._comboCount = 0;
    this._comboDamageMulti = 1.0;
    this._isHeavyAttack = false;
    this._attackLunge = 0;
    this._hitstop = 0;
    this.health = 200;
    this.stateMachine = new CharacterStateMachine(this);
    this.maxHealth = 200;
    this.stamina = 100;
    this.maxStamina = 100;
    
    // Vehicle
    this.inVehicle = null;
    this.inBuilding = null;
    
    // Input
    this.keys = {};
    this.mouseX = 0;
    this.mouseY = 0;
    
    // Available character models — REAL models only, no primitives
    this.characterModels = {
      'adventurer': { file: 'modular_men_adventurer', animPrefix: '' },
      'swat': { file: 'modular_men_swat', animPrefix: '' },
      'king': { file: 'modular_men_king', animPrefix: '' },
      'punk': { file: 'modular_men_punk', animPrefix: '' },
      'knight': { file: 'single_knight_pack_knightcharacter', animPrefix: 'HumanArmature|' },
      'soldier': { file: 'soldier', animPrefix: '' },
      'witch': { file: 'modular_women_witch', animPrefix: '' },
      'medieval': { file: 'modular_women_medieval', animPrefix: '' },
      'casual': { file: 'modular_men_casual', animPrefix: '' },
      'farmer': { file: 'modular_men_farmer', animPrefix: '' },
      'suit': { file: 'modular_men_suit', animPrefix: '' },
      'worker': { file: 'modular_men_worker', animPrefix: '' },
      'scifi': { file: 'modular_women_scifi', animPrefix: '' },
      'formal': { file: 'modular_women_formal', animPrefix: '' },
      'beach': { file: 'modular_men_beach', animPrefix: '' },
      'spacesuit': { file: 'modular_men_spacesuit', animPrefix: '' },
    };
    
    // Procedural animation state
    this.proceduralAnim = false;
    this.animTime = 0;
    this.bones = {};
    
    this._setupInput();
    
    // Capsule collider for Octree physics
    this.collider = collisionWorld.createPlayerCollider(1.7, 0.35);
  }
  

  async _loadSharedAnimations(charType) {
    // Load knight model just for its animations, apply to current character
    const knightFile = 'models/single_knight_pack_knightcharacter.glb';
    const loader = window._gltfLoader;
    if (!loader || !this.model) return;
    
    return new Promise((resolve) => {
      loader.load(knightFile, (gltf) => {
        if (!gltf.animations || gltf.animations.length === 0) {
          console.warn('[Char] Knight has no animations to share');
          resolve();
          return;
        }
        
        console.log('[Char] Loaded', gltf.animations.length, 'shared animations');
        
        // Create mixer for current model
        if (!this.mixer) {
          this.mixer = new THREE.AnimationMixer(this.model);
        }
        
        // Retarget: knight bone names use same KayKit convention
        // but tracks are prefixed with "HumanArmature|"
        // We need to remap track names if bone names differ
        
        this.animations = {};
        const prefix = 'HumanArmature|';
        
        gltf.animations.forEach(clip => {
          let name = clip.name.replace(prefix, '').toLowerCase();
          
          // Map to standard names
          const nameMap = {
            'idle': 'idle', 'idle_neutral': 'idle',
            'walking': 'walk', 'walk': 'walk',
            'run': 'run', 'running': 'run',
            'jump': 'jump', 'jump_full_short': 'jump',
            'roll': 'roll', 'roll_sword': 'roll', 'dodge': 'roll',
            'death': 'death', 'die': 'death',
            'idle_swordleft': 'idle_swordLeft', 'idle_swordright': 'idle_swordRight',
            'run_swordattack': 'attack', 'run_swordright': 'run_attack',
            'swordattack': 'attack', 'sword_attack': 'attack',
            'swordattackjump': 'swordAttackJump',
            'hit': 'hit', 'gethit': 'hit', 'get_hit': 'hit',
            'block': 'block', 'shield_block': 'block',
          };
          const stdName = nameMap[name] || name;
          
          // Retarget track names: remove "HumanArmature|" prefix from track targets
          // Knight tracks: "HumanArmature|Hips.position" → need "Hips.position" for other chars
          const retargetedTracks = [];
          for (const track of clip.tracks) {
            let newName = track.name;
            // Strip HumanArmature prefix
            if (newName.includes(prefix)) {
              newName = newName.replace(prefix, '');
            }
            
            // Extract bone name and property from track name
            // Format: "BoneName.property" (e.g., "Hips.position", "UpperArmL.quaternion")
            const dotIdx = newName.lastIndexOf('.');
            const boneName = dotIdx >= 0 ? newName.substring(0, dotIdx) : newName;
            const prop = dotIdx >= 0 ? newName.substring(dotIdx + 1) : '';
            
            // FILTER: Skip position tracks for all bones except Hips
            // Different skeleton proportions make position anims destructive (limb detachment)
            if (prop === 'position' && boneName !== 'Hips') continue;
            
            // FILTER: Skip scale tracks (rarely useful in retargeting)
            if (prop === 'scale') continue;
            
            // Bone name mapping: knight → modular character differences
            const boneMap = {
              'Body': 'Root',           // Knight uses "Body" as root, modular uses "Root"  
              'MiddleHandR': 'HandR',   // Knight hand naming
              'MiddleHandL': 'HandL',
              'PalmR': 'HandR',
              'PalmL': 'HandL',
              'FingersR': 'Index2R',
              'FingersL': 'Index2L',
            };
            const mappedBone = boneMap[boneName] || boneName;
            const finalName = mappedBone + '.' + prop;
            
            retargetedTracks.push(new THREE.KeyframeTrack(
              finalName,
              track.times,
              track.values,
              track.interpolation
            ));
          }
          
          const retargetedClip = new THREE.AnimationClip(stdName, clip.duration, retargetedTracks);
          
          try {
            const action = this.mixer.clipAction(retargetedClip);
            this.animations[stdName] = action;
          } catch(e) {
            // Bone name mismatch — skip this animation
            console.warn('[Char] Could not apply animation', stdName, ':', e.message);
          }
        });
        
        console.log('[Char] Shared animations loaded:', Object.keys(this.animations).join(', '));
        
        // Start idle
        if (this.animations.idle) {
          this.animations.idle.play();
          this.currentAnim = 'idle';
        }
        
        resolve();
      }, undefined, (err) => {
        console.warn('[Char] Failed to load shared animations:', err);
        resolve();
      });
    });
  }

  _setupInput() {
    window.addEventListener('keydown', e => {
      this.keys[e.key.toLowerCase()] = true;
      if (e.key === 'Shift') this.isRunning = true;
      
      // Weapon controls: 1 = draw/sheathe, 2/3 = swap slots
      if (e.key === '1' && this.weaponSlots[0]) {
        this.activeSlot = 0;
        this.toggleWeapon();
      }
      if (e.key === '2' && this.weaponSlots[1]) {
        this.activeSlot = 1;
        this.toggleWeapon();
      }
      if (e.key === '3' && this.weaponSlots[2]) {
        this.activeSlot = 2;
        this.toggleWeapon();
      }
    });
    window.addEventListener('keyup', e => {
      this.keys[e.key.toLowerCase()] = false;
      if (e.key === 'Shift') this.isRunning = false;
    });
    
    // Mouse look
    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement) {
        const sens = this.mouseSensitivity || 0.003;
        this.cameraYaw -= e.movementX * sens;
        this.cameraPitch = Math.max(-0.5, Math.min(1.2, this.cameraPitch + e.movementY * (this.mouseSensitivity || 0.003)));
      }
    });
  }
  
  async loadCharacter(type = 'knight') {
    const config = this.characterModels[type];
    if (!config) return 'Unknown character: ' + type;
    
    // Remove old model + container
    if (this.modelContainer) {
      this.scene.remove(this.modelContainer);
      const idx = this.objects.indexOf(this.modelContainer);
      if (idx >= 0) this.objects.splice(idx, 1);
    } else if (this.model) {
      this.scene.remove(this.model);
      const idx = this.objects.indexOf(this.model);
      if (idx >= 0) this.objects.splice(idx, 1);
    }
    
    return new Promise((resolve) => {
      loader.load('models/' + config.file + '.glb', (gltf) => {
        this.model = gltf.scene;
        
        // Auto-scale to human height (~1.8 units)
        const box = new THREE.Box3().setFromObject(this.model);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const targetHeight = 1.8;
        const autoScale = targetHeight / Math.max(maxDim, 0.001);
        this.model.scale.setScalar(autoScale);
        
        // MODEL CONTAINER PATTERN (Sketchbook-inspired)
        // Container sits at feet level, model offset inside so feet = y=0 of container
        const box2 = new THREE.Box3().setFromObject(this.model);
        this.groundOffset = -box2.min.y;
        this.model.position.set(0, this.groundOffset, 0); // offset inside container
        
        // Create container group
        if (this.modelContainer) {
          this.scene.remove(this.modelContainer);
          const ci = this.objects.indexOf(this.modelContainer);
          if (ci >= 0) this.objects.splice(ci, 1);
        }
        this.modelContainer = new THREE.Group();
        this.modelContainer.add(this.model);
        
        // Blob shadow removed — real shadow maps handle this now
        this.modelContainer.userData.groundOffset = this.groundOffset;
        this.modelContainer.userData.isPlayer = true;
        this.modelContainer.userData.name = 'player_' + type;
        
        // Position at terrain level
        this.position.y = _getTerrainY(this.position.x, this.position.z);
        this.modelContainer.position.copy(this.position);
        
        this.model.castShadow = true;
        this.model.traverse(child => {
          if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
        });
        this.scene.add(this.modelContainer);
        
        // Detect bone sockets for weapon attachment
        this.sockets = {};
        this.model.traverse(node => {
          if (node.isBone || node.type === 'Bone') {
            const n = node.name.toLowerCase();
            // Hand sockets — support all naming conventions:
            // Mixamo: mixamorig:RightHand → righthand
            // KayKit Characters: Hand.R → hand.r  
            // KayKit Knight: MiddleHand.R → middlehand.r
            const isHand = !n.includes('thumb') && !n.includes('index') && !n.includes('pinky') && !n.includes('ring') && !n.includes('finger');
            // Right hand: Hand.R, MiddleHand.R, PalmR, MiddleHandR, mixamorig:RightHand
            if (isHand && (n === 'palmr' || n === 'hand.r' || n === 'middlehand.r' || n === 'middlehandr' || n.includes('righthand') || n.includes('right_hand') || n.includes('r_hand')) && !this.sockets.hand_r) this.sockets.hand_r = node;
            // Left hand
            else if (isHand && (n === 'palml' || n === 'hand.l' || n === 'middlehand.l' || n === 'middlehandl' || n.includes('lefthand') || n.includes('left_hand') || n.includes('l_hand')) && !this.sockets.hand_l) this.sockets.hand_l = node;
            // Right upper arm: UpperArm.R, UpperArmR, mixamorig:RightArm
            else if ((n === 'upperarm.r' || n === 'upperarmr' || n.includes('rightarm') && !n.includes('forearm')) && !this.sockets.upperarm_r) this.sockets.upperarm_r = node;
            // Left upper arm
            else if ((n === 'upperarm.l' || n === 'upperarml' || n.includes('leftarm') && !n.includes('forearm')) && !this.sockets.upperarm_l) this.sockets.upperarm_l = node;
            // Right forearm: LowerArm.R, LowerArmR, mixamorig:RightForeArm
            else if ((n === 'lowerarm.r' || n === 'lowerarmr' || n.includes('rightforearm') || n.includes('right_forearm') || n.includes('r_forearm')) && !this.sockets.forearm_r) this.sockets.forearm_r = node;
            // Left forearm
            else if ((n === 'lowerarm.l' || n === 'lowerarml' || n.includes('leftforearm') || n.includes('left_forearm')) && !this.sockets.forearm_l) this.sockets.forearm_l = node;
            // Back/spine
            else if ((n === 'torso' || n === 'chest' || n === 'abdomen' || (n.includes('spine') && (n.includes('2') || n.includes('1')))) && !this.sockets.back) this.sockets.back = node;
            // Right hip
            else if ((n === 'upperleg.r' || n === 'upperlegr' || n.includes('rightupleg') || n.includes('righthip')) && !this.sockets.hip_r) this.sockets.hip_r = node;
            // Left hip
            else if ((n === 'upperleg.l' || n === 'upperlegl' || n.includes('leftupleg') || n.includes('lefthip')) && !this.sockets.hip_l) this.sockets.hip_l = node;
          }
        });
        // Fallback: use forearm if no hand bone found
        if (!this.sockets.hand_r && this.sockets.forearm_r) this.sockets.hand_r = this.sockets.forearm_r;
        
        // Re-equip weapons after model reload
        if (this.weaponSlots[this.activeSlot]) {
          this._attachWeaponToHand(this.weaponSlots[this.activeSlot]);
        }
        // Show holstered weapons
        for (let i = 0; i < this.weaponSlots.length; i++) {
          if (i !== this.activeSlot && this.weaponSlots[i]) {
            this._attachWeaponToHolster(this.weaponSlots[i], i);
          }
        }
        this.objects.push(this.modelContainer);
        
        // Find bones for procedural animation (Wolf3D/Mixamo rig)
        this.proceduralAnim = config.procedural || false;
        if (this.proceduralAnim) {
          this.bones = {};
          this.model.traverse(node => {
            if (node.isBone || node.type === 'Bone') {
              const n = node.name.toLowerCase();
              const isLeft = n.endsWith('l') || n.includes('.l') || n.includes('left');
              const isRight = n.endsWith('r') || n.includes('.r') || n.includes('right');
              if (n.includes('hips') && !npc.bones.hips) npc.bones.hips = node;
              else if ((n.includes('spine') || n.includes('abdomen') || n.includes('torso')) && !npc.bones.spine) npc.bones.spine = node;
              else if ((n.includes('upperleg') || n.includes('upleg') || n.includes('thigh')) && isLeft && !npc.bones.leftLeg) npc.bones.leftLeg = node;
              else if ((n.includes('upperleg') || n.includes('upleg') || n.includes('thigh')) && isRight && !npc.bones.rightLeg) npc.bones.rightLeg = node;
              else if ((n.includes('lowerleg') || n.includes('calf') || n.includes('shin')) && isLeft && !npc.bones.leftKnee) npc.bones.leftKnee = node;
              else if ((n.includes('lowerleg') || n.includes('calf') || n.includes('shin')) && isRight && !npc.bones.rightKnee) npc.bones.rightKnee = node;
              else if ((n.includes('upperarm') || (n.includes('arm') && !n.includes('lower') && !n.includes('fore'))) && isLeft && !npc.bones.leftArm) npc.bones.leftArm = node;
              else if ((n.includes('upperarm') || (n.includes('arm') && !n.includes('lower') && !n.includes('fore'))) && isRight && !npc.bones.rightArm) npc.bones.rightArm = node;
              else if ((n.includes('lowerarm') || n.includes('forearm')) && isLeft && !npc.bones.leftForearm) npc.bones.leftForearm = node;
              else if ((n.includes('lowerarm') || n.includes('forearm')) && isRight && !npc.bones.rightForearm) npc.bones.rightForearm = node;
              else if (n.includes('head') && !n.includes('top') && !n.includes('eye') && !n.includes('_end') && !npc.bones.head) npc.bones.head = node;
              else if (n.includes('neck') && !npc.bones.neck) npc.bones.neck = node;
            }
          });
          console.log('Procedural bones found:', Object.keys(this.bones).join(', '));
          // Save original bone rotations as rest pose
          Object.entries(this.bones).forEach(([key, bone]) => {
            if (bone) {
              bone.userData.origRot = { x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z };
              bone.userData.origPos = bone.position.clone();
            }
          });
        }
        
        // Setup animations — load from model or shared animation source
        const hasAnims = gltf.animations.length > 0;
        if (hasAnims) {
          // Model has built-in animations (Quaternius characters)
          npc.mixer = new THREE.AnimationMixer(model);
          const prefix = 'HumanArmature|HumanArmature|';
          for (const clip of gltf.animations) {
            const rawName = clip.name.replace(prefix, '').toLowerCase();
            let stdName = null;
            if (rawName.includes('walk')) stdName = 'walk';
            else if (rawName.includes('idle') || rawName.includes('standing')) stdName = 'idle';
            else if (rawName.includes('run') && !rawName.includes('jump')) stdName = 'run';
            else if (rawName.includes('punch')) stdName = 'punch';
            else if (rawName.includes('death')) stdName = 'death';
            else if (rawName.includes('jump') && !rawName.includes('running')) stdName = 'jump';
            else if (rawName.includes('sword')) stdName = 'attack';
            else if (rawName.includes('sit')) stdName = 'sit';
            else if (rawName.includes('clap')) stdName = 'clap';
            
            if (stdName && !npc.animations[stdName]) {
              const action = npc.mixer.clipAction(clip);
              npc.animations[stdName] = action;
            }
          }
          
          // Play walk or idle
          if (npc.animations.walk && npc.behavior === 'wander') {
            npc.animations.walk.play();
            npc.currentAnim = 'walk';
          } else if (npc.animations.idle) {
            npc.animations.idle.play();
            npc.currentAnim = 'idle';
          }
          
          npc.proceduralAnim = false;
          console.log('[NPC] Built-in anims:', Object.keys(npc.animations).join(', '));
        } else {
          // Fallback: load Soldier animations
          console.log('[NPC] No embedded anims, loading Soldier animations');
          const _loader = window._gltfLoader || loader;
          _loader.load('models/anim_idle.glb', (animGltf) => {
            if (!animGltf.animations || animGltf.animations.length === 0) return;
            npc.mixer = new THREE.AnimationMixer(model);
            animGltf.animations.forEach(clip => {
              const name = clip.name.toLowerCase();
              if (name === 'tpose') return;
              const rotTracks = clip.tracks.filter(t => t.name.endsWith('.quaternion'));
              if (rotTracks.length > 0) {
                const rotClip = new THREE.AnimationClip(clip.name, clip.duration, rotTracks);
                const action = npc.mixer.clipAction(rotClip);
                if (name === 'idle') npc.animations.idle = action;
                else if (name === 'walk') npc.animations.walk = action;
                else if (name === 'run') npc.animations.run = action;
              }
            });
            if (npc.animations.walk && npc.behavior === 'wander') {
              npc.animations.walk.play();
              npc.currentAnim = 'walk';
            } else if (npc.animations.idle) {
              npc.animations.idle.play();
              npc.currentAnim = 'idle';
            }
            npc.proceduralAnim = false;
          }, null, (e) => console.warn('[NPC] Failed to load anims:', e));
        }
        if (gltf.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(this.model);
          this.animations = {};
          gltf.animations.forEach(clip => {
            // Normalize animation names
            let name = clip.name.replace(config.animPrefix, '').toLowerCase();
            // Map to standard names
            const map = {
              'idle_neutral': 'idle', 'idle': 'idle', 'idle_sword': 'idle_sword',
              'idle_gun_pointing': 'idle_gun', 'idle_gun_shoot': 'idle_gun_shoot',
              'walking': 'walk', 'walk': 'walk',
              'run': 'run', 'run_back': 'run_back', 'run_left': 'run_left', 'run_right': 'run_right',
              'run_shoot': 'run_shoot',
              'jump': 'jump',
              'roll': 'roll', 'roll_sword': 'roll',
              'death': 'death', 'die': 'death',
              'sword_slash': 'attack', 'swordattackjump': 'jump_attack',
              'run_swordattack': 'run_attack', 'run_swordright': 'run_attack',
              'gun_shoot': 'shoot',
              'punch_left': 'punch_left', 'punch_right': 'punch_right',
              'kick_left': 'kick_left', 'kick_right': 'kick_right',
              'hitrecieve': 'hit', 'hitrecieve_2': 'hit2',
              'interact': 'interact', 'wave': 'wave',
            };
            name = map[name] || name;
            
            this.animations[name] = this.mixer.clipAction(clip);
          });
          
          // Start idle
          this.playAnimation('idle');
        }
        
        // Find clear spawn point away from objects
        this._findClearSpawn();
        (this.modelContainer || this.model).position.set(this.position.x, this.position.y + (this.modelContainer ? 0 : (this.groundOffset || 0)), this.position.z);
        resolve('✓ Character loaded: ' + type + ' (' + Object.keys(this.animations).join(', ') + ')');
      });
    });
  }
  
  _findClearSpawn() {
    // Try positions in expanding ring until we find one with no nearby objects
    const testPositions = [
      [0, 8], [0, -8], [8, 0], [-8, 0],    // Near center but offset
      [0, 12], [0, -12], [12, 0], [-12, 0],  // Further out
      [5, 5], [-5, 5], [5, -5], [-5, -5],    // Diagonals
      [0, 16], [0, -16], [16, 0], [-16, 0],  // Even further
    ];
    
    for (const [tx, tz] of testPositions) {
      const testPos = new THREE.Vector3(tx, 0, tz);
      let clear = true;
      
      for (const obj of this.objects) {
        if (obj === this.model) continue;
        // Collide with ALL objects (GLB + procedural)
        const dist = testPos.distanceTo(obj.position);
        if (dist < 3) { clear = false; break; }
      }
      
      if (clear) {
        this.position.set(tx, 0, tz);
        return;
      }
    }
    
    // Fallback: just offset from center
    this.position.set(3, 0, 8);
  }

    playAnimation(name, once = false) {
    if (!this.animations[name]) return;
    if (this.currentAnim === name && !once) return;
    
    // Fade out current
    const current = this.animations[this.currentAnim];
    const next = this.animations[name];
    
    if (current) current.fadeOut(0.2);
    next.reset().fadeIn(0.2);
    if (once) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat);
    }
    next.play();
    this.currentAnim = name;
  }
  

  // === WEAPON SYSTEM METHODS ===
  
  equipWeapon(weaponId, slot = -1) {
    const data = WEAPON_DATABASE[weaponId];
    if (!data) return 'Unknown weapon: ' + weaponId;
    
    // Find available slot or use specified
    if (slot < 0) {
      slot = this.weaponSlots.indexOf(null);
      if (slot < 0) slot = this.activeSlot;
    }
    
    // Remove old weapon from slot
    if (this.weaponSlots[slot]) {
      this._removeWeaponMesh(slot);
    }
    
    this.weaponSlots[slot] = weaponId;
    
    // Initialize ammo for ranged
    if (data.type === 'ranged' && this.ammo[weaponId] === undefined) {
      this.ammo[weaponId] = data.magSize;
    }
    
    // ALWAYS holster on back first — player draws with key press
    this._attachWeaponToBack(weaponId);
    this.weaponDrawn = false;
    
    this.equippedWeapon = this.weaponSlots[this.activeSlot];
    if (this.cameraMode === '1st') this._setupFPWeapon();
    return '⚔️ ' + data.name + ' equipped on back — press 1 to draw';
  }
  
  // Draw weapon from back to hands (two-handed grip)
  drawWeapon() {
    const weaponId = this.weaponSlots[this.activeSlot];
    if (!weaponId) return 'No weapon equipped';
    if (this.weaponDrawn) return 'Weapon already drawn';
    
    this._removeFromBack();
    this._attachWeaponToHand(weaponId);
    this.weaponDrawn = true;
    
    const data = WEAPON_DATABASE[weaponId];
    return '⚔️ Drew ' + (data?.name || weaponId) + ' — ready to fight!';
  }
  
  // Sheathe weapon back to back
  sheatheWeapon() {
    const weaponId = this.weaponSlots[this.activeSlot];
    if (!weaponId) return 'No weapon equipped';
    if (!this.weaponDrawn) return 'Weapon already sheathed';
    
    this._removeFromHand();
    this._attachWeaponToBack(weaponId);
    this.weaponDrawn = false;
    
    const data = WEAPON_DATABASE[weaponId];
    return '🔙 Sheathed ' + (data?.name || weaponId);
  }
  
  // Toggle draw/sheathe
  toggleWeapon() {
    if (this.weaponDrawn) return this.sheatheWeapon();
    return this.drawWeapon();
  }
  
  unequipWeapon(slot = -1) {
    if (slot < 0) slot = this.activeSlot;
    const weaponId = this.weaponSlots[slot];
    if (!weaponId) return 'No weapon in slot ' + (slot + 1);
    
    this._removeWeaponMesh(slot);
    this._removeFromBack();
    this._removeFromHand();
    this.weaponSlots[slot] = null;
    this.equippedWeapon = this.weaponSlots[this.activeSlot];
    this.weaponDrawn = false;
    
    return '🗑️ Unequipped ' + (WEAPON_DATABASE[weaponId]?.name || weaponId);
  }
  
  swapToSlot(slot) {
    if (slot === this.activeSlot) return;
    if (slot < 0 || slot > 2) return;
    
    // Holster current weapon
    const currentId = this.weaponSlots[this.activeSlot];
    if (currentId && this.equippedWeaponMesh) {
      this._removeFromHand();
      this._attachWeaponToHolster(currentId, this.activeSlot);
    }
    
    this.activeSlot = slot;
    
    // Draw new weapon
    const newId = this.weaponSlots[slot];
    if (newId) {
      // Remove from holster
      if (this.holsteredMeshes[slot]) {
        this.holsteredMeshes[slot].parent?.remove(this.holsteredMeshes[slot]);
        delete this.holsteredMeshes[slot];
      }
      this._attachWeaponToHand(newId);
    } else {
      this.equippedWeaponMesh = null;
    }
    
    this.equippedWeapon = this.weaponSlots[this.activeSlot];
    this.currentSpread = 0;
    this.comboIndex = 0;
  }
  
  _attachWeaponToBack(weaponId) {
    const data = WEAPON_DATABASE[weaponId];
    if (!data) return;
    
    this._removeFromBack();
    
    const mesh = createWeaponMesh(weaponId);
    if (!mesh) return;
    
    // Attach to model root — simpler and more predictable than bone attachment
    // Model is scaled (e.g. 0.3222 for knight), so divide world offsets by model scale
    if (this.model) {
      const modelScale = this.model.scale.x || 1;
      // Sword geo is ~0.72 units tall. We want ~0.8 world units.
      // worldSize = meshScale * geoSize * modelScale
      // meshScale = 0.8 / (0.72 * modelScale)
      // Sword should be ~60% of character height for visual impact
      const charHeight = 1.8; // approximate world height
      const targetSwordH = charHeight * 0.55; // ~1.0 world units
      const meshScale = targetSwordH / (0.72 * modelScale);
      mesh.scale.setScalar(meshScale);
      // Position: behind character, upper back, shifted right so it sticks out over right shoulder
      const px = 0.25 / modelScale;  // far right — sticks out past shoulder
      const py = 1.1 / modelScale;   // upper back — handle above shoulder
      const pz = -0.12 / modelScale; // just behind torso (not too far)
      mesh.position.set(px, py, pz);
      // Rotation: vertical sword on back, blade pointing up, slight lean
      // The blade should visibly poke up above the right shoulder from behind
      mesh.rotation.set(0, 0, Math.PI); // flip upside down so blade points up
      this.model.add(mesh);
    }
    
    this.backWeaponMesh = mesh;
  }
  
  _removeFromBack() {
    if (this.backWeaponMesh) {
      if (this.backWeaponMesh.parent) this.backWeaponMesh.parent.remove(this.backWeaponMesh);
      this.backWeaponMesh = null;
    }
  }
  
  _attachWeaponToHand(weaponId) {
    const data = WEAPON_DATABASE[weaponId];
    if (!data) return;
    
    // Remove existing hand weapon
    this._removeFromHand();
    
    const mesh = createWeaponMesh(weaponId);
    if (!mesh) return;
    
    const bone = this.sockets.hand_r || this.sockets.forearm_r;
    if (bone) {
      // Scale weapon correctly — compensate for bone's world scale
      // Bones have massive internal scale (e.g. 32x). Calculate local scale so
      // weapon appears ~40% of character height in world space.
      bone.updateWorldMatrix(true, false);
      const _bws = new THREE.Vector3();
      bone.getWorldScale(_bws);
      // Character ~0.58 world units tall, want sword ~0.25 world units
      // Weapon geometry is ~0.8 units total height
      // localScale = desiredWorldSize / (geometrySize * boneWorldScale)
      // Scale based on weapon type — guns shorter than melee
      const isRanged = data.type === 'ranged';
      const _desiredWorld = isRanged ? 0.9 : 1.1; // guns ~0.9, melee ~1.1 world units
      const _weaponGeoSize = 0.8;
      const _localScale = _desiredWorld / (_weaponGeoSize * Math.max(_bws.x, 0.001));
      mesh.scale.setScalar(_localScale);
      // Hold offset must be in bone-local units (divide world-space offset by bone world scale)
      const _bsi = 1 / Math.max(_bws.x, 0.001);
      mesh.position.set(data.holdOffset.x * _bsi, data.holdOffset.y * _bsi, data.holdOffset.z * _bsi);
      mesh.rotation.set(data.holdRotation.x, data.holdRotation.y, data.holdRotation.z);
      bone.add(mesh);
      
      // Two-handed grip: move left hand toward weapon (IK hint via bone position)
      // This gives the visual impression of two-handed holding
      if (this.sockets.hand_l) {
        this._twoHandedGrip = true;
      }
    } else {
      // Fallback: attach to model
      mesh.position.set(0.15, 0.5, 0.05);
      mesh.rotation.set(0, 0, -0.3);
      this.model.add(mesh);
    }
    
    this.equippedWeaponMesh = mesh;
  }
  
  // Two-handed IK: position left hand on weapon's secondary grip point
  _applyTwoHandedIK() {
    const handL = this.sockets.hand_l;
    const weaponMesh = this.equippedWeaponMesh;
    if (!handL || !weaponMesh) return;
    
    // For ranged weapons: raise right upper arm so gun points forward at chest height
    const weaponId = this.weaponSlots[this.activeSlot];
    const _ikData = WEAPON_DATABASE[weaponId];
    if (_ikData && _ikData.type === 'ranged' && this.sockets.upperarm_r) {
      const ua = this.sockets.upperarm_r;
      // Rotate upper arm forward and up to bring hand to chest-aim position
      // Save original rotation on first call
      if (!ua.userData._origRot) {
        ua.userData._origRot = ua.rotation.clone();
      }
      // Blend toward aim pose — rotate X to raise arm forward
      ua.rotation.x = THREE.MathUtils.lerp(ua.rotation.x, ua.userData._origRot.x - 1.2, 0.3);
      // Also raise left arm
      if (this.sockets.upperarm_l) {
        const ual = this.sockets.upperarm_l;
        if (!ual.userData._origRot) ual.userData._origRot = ual.rotation.clone();
        ual.rotation.x = THREE.MathUtils.lerp(ual.rotation.x, ual.userData._origRot.x - 1.0, 0.3);
      }
    }
    
    // Get weapon's world-space grip position
    // weaponId already obtained above in arm-raise block
    if (!_ikData) return;
    const data = _ikData;
    if (!data) return;
    
    // Secondary grip offset in weapon-local space
    // Swords: left hand near pommel/crossguard (below right hand)
    // Guns: left hand on foregrip (forward of right hand)
    const isGun = data.type === 'ranged';
    const gripLocal = new THREE.Vector3();
    if (isGun) {
      gripLocal.set(0, 0.15, 0); // foregrip: forward along barrel
    } else {
      gripLocal.set(0, -0.06, 0); // below right hand on hilt/guard
    }
    
    // Transform grip point to world space
    const gripWorld = gripLocal.clone();
    weaponMesh.updateWorldMatrix(true, false);
    gripWorld.applyMatrix4(weaponMesh.matrixWorld);
    
    // Convert world position to left hand's parent bone space
    const handParent = handL.parent;
    if (handParent) {
      handParent.updateWorldMatrix(true, false);
      const parentInverse = new THREE.Matrix4().copy(handParent.matrixWorld).invert();
      gripWorld.applyMatrix4(parentInverse);
      
      // Lerp for smooth transition
      handL.position.lerp(gripWorld, 0.4);
    }
  }

  _fireBulletTracer(weaponData) {
    // Fire a short animated bullet tracer (not a full-length laser)
    const start = this.position.clone();
    start.y += 1.2; // chest height
    
    // Direction: use camera unproject for accuracy
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(this.camera.quaternion);
    dir.normalize();
    
    // Muzzle position slightly in front
    const muzzle = start.clone().add(dir.clone().multiplyScalar(1.0));
    
    // Short tracer (3-4 units long) that travels forward
    const tData = weaponData.tracer;
    const tracerLen = 3;
    const tracerSpeed = 120; // units/sec
    const maxDist = 80;
    
    if (tData) {
      // Cylinder tracer (thicker than a line)
      const geo = new THREE.CylinderGeometry(0.02, 0.02, tracerLen, 4);
      geo.rotateX(Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: tData.color || 0xffdd00, transparent: true, opacity: 0.9 });
      const bullet = new THREE.Mesh(geo, mat);
      bullet.position.copy(muzzle);
      bullet.lookAt(muzzle.clone().add(dir));
      this.scene.add(bullet);
      
      // Animate bullet travel
      let dist = 0;
      const animBullet = () => {
        dist += tracerSpeed * 0.016; // ~60fps
        if (dist > maxDist) {
          this.scene.remove(bullet); geo.dispose(); mat.dispose();
          return;
        }
        bullet.position.copy(muzzle.clone().add(dir.clone().multiplyScalar(dist)));
        requestAnimationFrame(animBullet);
      };
      requestAnimationFrame(animBullet);
    }
    
    // Muzzle flash — brief bright light
    const flash = new THREE.PointLight(0xffaa00, 5, 8);
    flash.position.copy(muzzle);
    this.scene.add(flash);
    setTimeout(() => { this.scene.remove(flash); }, 50);
    
    // Small muzzle flash sprite
    const flashGeo = new THREE.SphereGeometry(0.15, 6, 6);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.8 });
    const flashMesh = new THREE.Mesh(flashGeo, flashMat);
    flashMesh.position.copy(muzzle);
    this.scene.add(flashMesh);
    setTimeout(() => { this.scene.remove(flashMesh); flashGeo.dispose(); flashMat.dispose(); }, 40);
  }
  
  _attachWeaponToHolster(weaponId, slotIndex) {
    const data = WEAPON_DATABASE[weaponId];
    if (!data) return;
    
    const mesh = createWeaponMesh(weaponId);
    if (!mesh) return;
    
    const holsterBone = data.holsterBone === 'hip' 
      ? (this.sockets.hip_r || this.sockets.hip_l)
      : (this.sockets.back || this.sockets.forearm_r);
    
    if (holsterBone) {
      mesh.position.set(data.holsterOffset.x, data.holsterOffset.y, data.holsterOffset.z);
      mesh.rotation.set(data.holsterRotation.x, data.holsterRotation.y, data.holsterRotation.z);
      holsterBone.add(mesh);
    }
    
    this.holsteredMeshes[slotIndex] = mesh;
  }
  
  _removeFromHand() {
    this._twoHandedGrip = false;
    if (this.equippedWeaponMesh) {
      this.equippedWeaponMesh.parent?.remove(this.equippedWeaponMesh);
      this.equippedWeaponMesh = null;
    }
  }
  
  _removeWeaponMesh(slot) {
    // Remove from hand if active
    if (slot === this.activeSlot) {
      this._removeFromHand();
    }
    // Remove from holster
    if (this.holsteredMeshes[slot]) {
      this.holsteredMeshes[slot].parent?.remove(this.holsteredMeshes[slot]);
      delete this.holsteredMeshes[slot];
    }
  }
  
  toggleShoulder() {
    this.shoulderSide *= -1;
    return '✓ Shoulder: ' + (this.shoulderSide > 0 ? 'Right' : 'Left');
  }
  
  startAim() {
    this.isAiming = true;
  }
  
  stopAim() {
    this.isAiming = false;
  }

  getWeaponData() {
    if (!this.equippedWeapon) return null;
    return WEAPON_DATABASE[this.equippedWeapon];
  }

    update(dt) {
    // Hitstop — brief frame pause on hit for impact feel
    if (this._hitstop && this._hitstop > 0) {
      this._hitstop -= dt;
      dt *= 0.1; // Near-freeze during hitstop
    }
    if (!this.model || this.isDead) return;
    if (this.mixer) this.mixer.update(dt);
    
    // Update state machine
    this.stateMachine.update(dt);
    // Two-handed weapon IK: after animation, move left hand to weapon grip
    if (this._twoHandedGrip && this.weaponDrawn && this.equippedWeaponMesh && this.sockets.hand_l) {
      this._applyTwoHandedIK();
    }
    if (this.proceduralAnim) this._updateProceduralAnim(dt);
    if (this.inVehicle) return this._updateInVehicle(dt);
    
    // Movement input
    let moveX = 0, moveZ = 0;
    if (this.keys['w']) moveZ = 1;
    if (this.keys['s']) moveZ = -1;
    if (this.keys['a']) moveX = -1;
    if (this.keys['d']) moveX = 1;
    
    // Gamepad support
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of gamepads) {
      if (!gp) continue;
      // Left stick — movement (axes 0,1)
      const lx = Math.abs(gp.axes[0]) > 0.15 ? gp.axes[0] : 0;
      const ly = Math.abs(gp.axes[1]) > 0.15 ? gp.axes[1] : 0;
      if (lx) moveX = lx;
      if (ly) moveZ = -ly;
      // Right stick — camera (axes 2,3)
      const rx = Math.abs(gp.axes[2]) > 0.15 ? gp.axes[2] : 0;
      const ry = Math.abs(gp.axes[3]) > 0.15 ? gp.axes[3] : 0;
      if (rx) this.cameraYaw -= rx * 0.04;
      if (ry) this.cameraPitch = Math.max(-0.5, Math.min(1.2, this.cameraPitch + ry * 0.03));
      // Buttons: A=jump, B=roll, X=attack, Y=interact, LB=block, RT=sprint
      if (gp.buttons[0]?.pressed) this.keys[' '] = true;  // A = jump
      if (gp.buttons[1]?.pressed) this.keys['c'] = true;  // B = roll
      if (gp.buttons[2]?.pressed) this.keys['e'] = true;  // X = attack
      if (gp.buttons[3]?.pressed) this.keys['f'] = true;  // Y = interact
      if (gp.buttons[4]?.pressed) this.isBlocking = true;  // LB = block
      if (gp.buttons[7]?.pressed) { this.isRunning = true; this.keys['shift'] = true; } // RT = sprint
      break; // use first connected gamepad
    }
    
    const hasInput = moveX !== 0 || moveZ !== 0;
    
    // Determine speed
    let targetSpeed = 0;
    if (hasInput) {
      if (this.keys['control'] || this.isSprinting) targetSpeed = this.sprintSpeed;
      else if (this.isRunning || this.keys['shift']) targetSpeed = this.runSpeed;
      else targetSpeed = this.walkSpeed;
    }
    
    // Roll
    if (this.keys['c'] && !this.isRolling && this.stamina > 15) {
      this.isRolling = true;
      this.isAttacking = false; // Cancel attack with dodge
      this._attackLunge = 0;
      this.stamina -= 15;
      this.isInvincible = true;
      this.rollSpeed = 18; if (window._sound) window._sound.SFX.dodge();
      this.stateMachine.transition(CharacterState.ROLL, 0.5);
      setTimeout(() => { this.isInvincible = false;
    this._comboCount = 0;
    this._comboDamageMulti = 1.0;
    this._isHeavyAttack = false;
    this._attackLunge = 0;
    this._hitstop = 0; }, 400);
      setTimeout(() => { this.isRolling = false; this.rollSpeed = 12; }, 500);
    }
    
    // Interact (F key) — enter buildings, open doors
    if (this.keys['f'] && !this._interactCooldown) {
      this._interactCooldown = true;
      setTimeout(() => { this._interactCooldown = false; }, 500);
      
      const nearby = this.objects.filter(o => {
        if (!o.userData.name || !o.userData.isGLB) return false;
        const d = this.position.distanceTo(o.position);
        return d < 10;
      });
      
      // Find nearest building
      const building = nearby.find(o => { const n = o.userData.name.toLowerCase(); return n.includes('building') || n.includes('house') || n.includes('story') || n.includes('1story') || n.includes('2story') || n.includes('3story'); });
      if (building && !this.inBuilding) {
        this._enterBuilding(building);
      } else if (this.inBuilding) {
        this._exitBuilding();
      }
    }
    
    // === COMBO ATTACK SYSTEM ===
    // Light attack: E or left click — melee combo OR ranged shooting
    if ((this.keys['e'] || this.keys['mouse0']) && !this.isAttacking && this.stamina > 3) {
      const _atkWeapon = this.equippedWeapon ? WEAPON_DATABASE[this.equippedWeapon] : null;
      const _isRangedAttack = _atkWeapon && _atkWeapon.type === 'ranged' && this.weaponDrawn;
      
      if (_isRangedAttack) {
        // === RANGED SHOOTING ===
        const wid = this.equippedWeapon;
        if ((this.ammo[wid] || 0) <= 0) {
          // Reload
          if (!this._reloading) {
            this._reloading = true;
            if (window._sound) window._sound.SFX.reload();
            setTimeout(() => { this.ammo[wid] = _atkWeapon.magSize; this._reloading = false; }, (_atkWeapon.reloadTime || 2) * 1000);
          }
        } else {
          this.isAttacking = true;
          this.ammo[wid]--;
          this._fpRecoil = 1.5;
          this.stamina = Math.max(0, this.stamina - 3);
          if (window._sound) window._sound.SFX.gunshot();
          
          // Play shoot animation if available, else use attack
          if (this.animations['shoot']) this.playAnimation('shoot', true);
          else if (this.animations['idle_gun_shoot']) this.playAnimation('idle_gun_shoot', true);
          else this.stateMachine.transition(CharacterState.ATTACK_1, 0.15);
          
          // Fire bullet tracer from muzzle toward camera center
          this._fireBulletTracer(_atkWeapon);
          
          // Damage check via raycast
          setTimeout(() => { this._attackHitFrame = true; }, 50);
          
          // Auto-fire rate
          const fireDelay = 1000 / (_atkWeapon.fireRate || 5);
          setTimeout(() => { this.isAttacking = false; }, fireDelay);
        }
      } else {
        // === MELEE COMBO ATTACK ===
        this.isAttacking = true; if (window._sound) window._sound.SFX.swordSwing();
        this._fpRecoil = 1.0;
        this._comboCount = (this._comboCount || 0) + 1;
        if (this._comboCount > 3) this._comboCount = 1;
        
        const comboDamageMulti = [1.0, 1.15, 1.4][this._comboCount - 1];
        const comboSpeedMulti = [1.0, 0.85, 0.7][this._comboCount - 1];
        const hitTime = Math.floor(150 * comboSpeedMulti);
        const recoveryTime = Math.floor(350 * comboSpeedMulti);
        
        this.stamina = Math.max(0, this.stamina - (8 + this._comboCount * 2));
        this._comboDamageMulti = comboDamageMulti;
        
        const comboStates = [CharacterState.ATTACK_1, CharacterState.ATTACK_2, CharacterState.ATTACK_3];
        this.stateMachine.transition(comboStates[this._comboCount - 1], recoveryTime / 1000);
        this._attackLunge = 3.0 * comboSpeedMulti;
        
        setTimeout(() => { this._attackHitFrame = true; }, hitTime);
        setTimeout(() => {
          this.isAttacking = false;
          this._attackLunge = 0;
          this._comboTimer = setTimeout(() => { this._comboCount = 0; }, 600);
        }, recoveryTime);
      }
    }
    
    // Heavy attack: Q key — slower but massive damage + AOE knockback
    if (this.keys['q'] && !this.isAttacking && this.stamina > 25) {
      this.isAttacking = true; if (window._sound) window._sound.SFX.heavyAttack();
      this._fpRecoil = 1.5; // FPS heavy recoil
      this._comboCount = 0; // Reset combo
      this.stamina = Math.max(0, this.stamina - 25);
      this._comboDamageMulti = 2.5; // Heavy hit
      this._isHeavyAttack = true;
      
      this.stateMachine.transition(CharacterState.HEAVY_ATTACK, 0.7);
      
      // Slam lunge
      this._attackLunge = 5.0;
      
      setTimeout(() => {
        this._attackHitFrame = true;
        // Screen shake on heavy hit
        if (this.camera) {
          const origPos = this.camera.position.clone();
          const shake = () => {
            this.camera.position.x += (Math.random() - 0.5) * 0.15;
            this.camera.position.y += (Math.random() - 0.5) * 0.1;
          };
          shake();
          setTimeout(shake, 50);
          setTimeout(shake, 100);
          setTimeout(() => { /* camera returns via normal update */ }, 150);
        }
      }, 300);
      
      setTimeout(() => {
        this.isAttacking = false;
        this._attackLunge = 0;
        this._isHeavyAttack = false;
      }, 700);
    }
    
    // Jump
    if ((this.keys[' '] || this.keys['space']) && this.isGrounded) {
      if (this.collider && this.collider.world.built) {
        this.collider.jump(this.jumpForce);
      } else {
        this.jumpVelocity = this.jumpForce;
      }
      if (window._sound) window._sound.SFX.jump();
      this.isGrounded = false;
      this.stateMachine.transition(CharacterState.JUMP);
    }
    
    // === PHYSICS: Octree capsule (preferred) or legacy raycast fallback ===
    if (this.collider && this.collider.world.built) {
      // Octree handles gravity + collision — sync only XZ from character movement
      // Y is owned by the collider (gravity + floor detection)
      // (post-physics section below handles the full update)
    } else {
      // Legacy raycast ground check
      if (!this.isGrounded) {
        this.jumpVelocity += this.gravity * dt;
        if (!this._wasFalling && this.jumpVelocity < -2) { this._wasFalling = true; this._fallStartY = this.position.y; }
        this.position.y += this.jumpVelocity * dt;
        const groundY = _getGroundY(this.position.x, this.position.z, this.position.y);
        if (this.position.y <= groundY) {
          this.position.y = groundY;
          this.isGrounded = true;
          this.jumpVelocity = 0;
          if (this._wasFalling && this._fallStartY !== undefined) {
            const fallDist = this._fallStartY - this.position.y;
            if (fallDist > 2 && window._screenShake) window._screenShake.trigger(Math.min(fallDist * 0.5, 4), 0.2);
            if (fallDist > 1) this._createSprintDust();
          }
          this._wasFalling = false;
        }
      } else {
        const groundY = _getGroundY(this.position.x, this.position.z, this.position.y);
        if (Math.abs(this.position.y - groundY) < 1.5) {
          const _dy = groundY - this.position.y;
          if (Math.abs(_dy) < 0.5) {
            this.position.y += _dy * (_dy > 0 ? 0.25 : 0.35);
          } else if (_dy > 0) {
            if (_dy < 0.4) this.position.y += _dy * 0.5;
            else { this.isGrounded = false; this.jumpVelocity = 0; }
          }
        } else if (this.position.y > groundY + 1.5) {
          this.isGrounded = false;
          this.jumpVelocity = 0;
        }
      }
    }
    
    // Calculate movement direction relative to camera
    // Attack lunge — slide forward during attack
    if (this._attackLunge && this._attackLunge > 0 && this.isAttacking) {
      this.position.x += Math.sin(this.rotation) * this._attackLunge * dt;
      this.position.z += Math.cos(this.rotation) * this._attackLunge * dt;
      this._attackLunge *= 0.9; // Decelerate lunge
    }
    
    // Track isMoving for state machine
    this.isMoving = hasInput && !this.isRolling && !this.isAttacking;
    
    if (hasInput && !this.isRolling && !this.isAttacking) {
      // Drive locomotion state
      const sm = this.stateMachine;
      if (this.isSprinting || this.keys['control']) {
        sm.transition(CharacterState.RUN);
      } else if (this.isRunning || this.keys['shift']) {
        sm.transition(CharacterState.RUN);
      } else {
        sm.transition(CharacterState.WALK);
      }
      
      const cameraAngle = this.cameraYaw;
      const moveAngle = Math.atan2(moveX, moveZ);
      const targetRotation = cameraAngle + moveAngle + Math.PI;
      
      // Smooth rotation
      let diff = targetRotation - this.rotation;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.rotation += diff * Math.min(1, dt * 10);
      
      this.speed = THREE.MathUtils.lerp(this.speed, targetSpeed, dt * 8);
      
      // Movement + collision
      const moveDir = new THREE.Vector3(Math.sin(this.rotation), 0, Math.cos(this.rotation));
      const moveDist = this.speed * dt;
      
      if (this.collider && this.collider.world.built) {
        // Octree handles wall sliding automatically
        this.position.x += moveDir.x * moveDist;
        this.position.z += moveDir.z * moveDist;
      } else {
        // Legacy wall collision check
        this._wallFrame = ((this._wallFrame || 0) + 1) % 2;
        const wallCheck = this._wallFrame === 0 ? _checkWallCollision(this.position, moveDir, moveDist) : (this._lastWallCheck || {hit: false});
        if (this._wallFrame === 0) this._lastWallCheck = wallCheck;
        if (!wallCheck.hit) {
          this.position.x += moveDir.x * moveDist;
          this.position.z += moveDir.z * moveDist;
        } else {
          const slide = moveDir.clone().sub(wallCheck.normal.clone().multiplyScalar(moveDir.dot(wallCheck.normal)));
          this.position.x += slide.x * moveDist * 0.7;
          this.position.z += slide.z * moveDist * 0.7;
        }
      }
      if (window._sound && this.speed > 0.5) window._sound.updateFootsteps(dt, true, this.isRunning);
      // Sprint dust particles
      if (this.isRunning && this.isGrounded) {
        this._dustTimer = (this._dustTimer || 0) + dt;
        if (this._dustTimer > 0.3) { this._dustTimer = 0; this._createSprintDust(); }
      }
    } else if (!this.isRolling) {
      this.speed = THREE.MathUtils.lerp(this.speed, 0, dt * 10);
      // Return to idle when stopped
      if (!this.isAttacking && !this.isRolling && this.isGrounded) {
        this.stateMachine.transition(CharacterState.IDLE);
      }
    }
    
    // Rolling movement
    if (this.isRolling) {
      this.position.x += Math.sin(this.rotation) * this.rollSpeed * dt;
      this.position.z += Math.cos(this.rotation) * this.rollSpeed * dt;
    }
    

    // === OCTREE POST-PHYSICS: resolve collisions after all movement ===
    if (this.collider && this.collider.world.built && !this.isClimbing) {
      // Sync XZ from character movement, keep collider's Y (gravity-managed)
      const curPos = this.collider.position;
      this.collider.setPosition(this.position.x, curPos.y, this.position.z);
      this.collider.update(dt, null); // gravity + collision resolution
      // Read back fully resolved position
      const resolvedPos = this.collider.position;
      this.position.x = resolvedPos.x;
      this.position.y = resolvedPos.y;
      this.position.z = resolvedPos.z;
      // Sync grounded state
      const wasGrounded = this.isGrounded;
      this.isGrounded = this.collider.onFloor;
      // Landing effects
      if (!wasGrounded && this.isGrounded) {
        if (this._wasFalling && this._fallStartY !== undefined) {
          const fallDist = this._fallStartY - this.position.y;
          if (fallDist > 2 && window._screenShake) window._screenShake.trigger(Math.min(fallDist * 0.5, 4), 0.2);
          if (fallDist > 1) this._createSprintDust();
        }
        this._wasFalling = false;
        this.jumpVelocity = 0;
      }
      if (!this.isGrounded && !this._wasFalling && this.collider.velocity.y < -2) {
        this._wasFalling = true;
        this._fallStartY = this.position.y;
      }
    }

    // === SWIMMING SYSTEM ===
    const WATER_LEVEL = -0.3;
    // Check water zones (pools, lakes, etc.)
    let inWaterZone = false;
    let waterZoneTop = WATER_LEVEL;
    if (window._waterZones) {
      const pp = this.position;
      for (let i = 0; i < window._waterZones.length; i++) {
        const wz = window._waterZones[i];
        if (pp.x >= wz.min.x && pp.x <= wz.max.x && pp.z >= wz.min.z && pp.z <= wz.max.z && pp.y <= wz.max.y + 0.5) {
          inWaterZone = true;
          waterZoneTop = wz.max.y;
          break;
        }
      }
    }
    const isInWater = inWaterZone || this.position.y < WATER_LEVEL + 0.5;
    const isDeepWater = inWaterZone ? this.position.y < waterZoneTop - 0.3 : this.position.y < WATER_LEVEL - 0.3;
    const effectiveWaterLevel = inWaterZone ? waterZoneTop : WATER_LEVEL;
    
    if (isInWater && !this.isClimbing && !this.inVehicle) {
      if (!this._isSwimming) {
        this._isSwimming = true;
        this.stateMachine.transition(CharacterState.SWIM);
        if (window._sound) window._sound.SFX.splash && window._sound.SFX.splash();
      }
      
      // Buoyancy — float at water level
      if (this.collider && this.collider.world.built) {
        if (this.position.y < effectiveWaterLevel) {
          this.collider.velocity.y = Math.max(this.collider.velocity.y, 2); // float up
        }
        // Clamp at water surface
        if (this.position.y > effectiveWaterLevel - 0.2 && this.position.y < effectiveWaterLevel + 0.3) {
          this.collider.velocity.y *= 0.8; // dampen vertical at surface
        }
      } else {
        // Legacy: float at water level
        if (this.position.y < effectiveWaterLevel) {
          this.position.y += 3 * dt;
          this.jumpVelocity = 0;
        }
      }
      
      // Slower movement in water
      this.speed *= 0.5;
      
      // Space to swim up, Shift to dive
      if (this.keys[' ']) {
        if (this.collider) this.collider.velocity.y = 3;
        else this.position.y += 3 * dt;
      }
      if (this.keys['shift']) {
        if (this.collider) this.collider.velocity.y = -2;
        else this.position.y -= 2 * dt;
      }
    } else if (this._isSwimming) {
      this._isSwimming = false;
      this.stateMachine.transition(this.isMoving ? CharacterState.RUN : CharacterState.IDLE);
    }

    // === CLIMBING SYSTEM ===
    // Detect ladders, vines, climbable walls nearby
    if (!this._climbCooldown) {
      const climbable = this.objects.find(o => {
        if (!o.userData.name) return false;
        const n = o.userData.name.toLowerCase();
        const isClimbable = n.includes('ladder') || n.includes('vine') || n.includes('climb') || 
                           n.includes('rope') || n.includes('chain') || n.includes('lattice') ||
                           n.includes('trellis') || n.includes('scaffold');
        if (!isClimbable) return false;
        const d = this.position.distanceTo(o.position);
        return d < 3;
      });
      
      if (climbable) {
        this.isClimbing = true;
        this._climbTarget = climbable;
        
        // Climbing movement: W/S = up/down, A/D = left/right
        if (this.keys['w'] || this.keys['arrowup']) {
          this.position.y += this.walkSpeed * dt * 0.6;
          this.playAnimation(this.animations['climb'] || 'walk');
        }
        if (this.keys['s'] || this.keys['arrowdown']) {
          this.position.y -= this.walkSpeed * dt * 0.6;
          this.position.y = Math.max(0, this.position.y);
          this.playAnimation(this.animations['climb'] || 'walk');
        }
        
        // Jump off ladder
        if (this.keys[' '] && this.position.y > 0.5) {
          this.isClimbing = false;
          this.jumpVelocity = this.jumpForce * 0.7;
          this._climbCooldown = true;
          setTimeout(() => { this._climbCooldown = false; }, 500);
        }
        
        // Snap to ladder position (XZ)
        this.position.x += (climbable.position.x - this.position.x) * 0.1;
        this.position.z += (climbable.position.z - this.position.z) * 0.1;
        
        // Disable gravity while climbing
        this.jumpVelocity = 0;
      } else {
        this.isClimbing = false;
      }
    }
    
    let blocked = false; // pre-declare for wall climbing check
    // === NPC INTERACTION (press E near NPC) ===
    if (this.keys['e'] && !this._interactCooldown) {
      this._interactCooldown = true;
      setTimeout(() => { this._interactCooldown = false; }, 1000);
      // Find nearest NPC
      if (window.npcController) {
        let nearestNPC = null, nearestDist = 5; // 5 unit interact range
        for (const npc of window.npcController.npcs) {
          const d = this.position.distanceTo(npc.model.position);
          if (d < nearestDist) { nearestDist = d; nearestNPC = npc; }
        }
        if (nearestNPC) {
          // Face player
          const toPlayer = new THREE.Vector3().subVectors(this.position, nearestNPC.model.position);
          nearestNPC.model.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
          // Get dialogue
          const lines = NPCController.getDialogue(nearestNPC.type, 'greetings');
          this._showDialogue(nearestNPC, lines);
        }
      }
      // Door interaction — use engine door system
      if (window._toggleNearestDoor) {
        const doorResult = window._toggleNearestDoor(this.position);
        if (doorResult) console.log(doorResult);
      }
      // Vehicle interaction — find nearest vehicle
      if (!this._inVehicle) {
        const vehicle = this.objects.find(o => {
          if (!o.userData.name) return false;
          const n = o.userData.name.toLowerCase();
          const isVehicle = n.includes('car') || n.includes('truck') || n.includes('vehicle') || n.includes('boat') || n.includes('ship') || n.includes('horse');
          return isVehicle && this.position.distanceTo(o.position) < 5;
        });
        if (vehicle) {
          this._inVehicle = vehicle;
          this.model.visible = false;
          this._vehicleOffset = this.position.clone().sub(vehicle.position);
        }
      } else {
        // Exit vehicle
        this.model.visible = true;
        this.position.copy(this._inVehicle.position).add(new THREE.Vector3(3, 0, 0));
        this._inVehicle = null;
      }
    }
    // Vehicle driving
    if (this._inVehicle) {
      const v = this._inVehicle;
      const speed = v.userData.name.toLowerCase().includes('boat') ? 8 : 15;
      this.isMoving = !!(this.keys['w'] || this.keys['s'] || this.keys['a'] || this.keys['d']);
    if (this.keys['w']) { v.position.x += Math.sin(v.rotation.y) * speed * dt; v.position.z += Math.cos(v.rotation.y) * speed * dt; }
      if (this.keys['s']) { v.position.x -= Math.sin(v.rotation.y) * speed * dt; v.position.z -= Math.cos(v.rotation.y) * speed * dt; }
      if (this.keys['a']) v.rotation.y += 2 * dt;
      if (this.keys['d']) v.rotation.y -= 2 * dt;
      this.position.copy(v.position).add(new THREE.Vector3(0, 2, 0));
    }

    // === WALL CLIMBING (hold W against tall objects) ===
    if (!this.isClimbing && this.keys['w'] && blocked && !this.isGrounded === false) {
      // Check if the blocking object is tall enough to climb
      const wallObj = this.objects.find(o => {
        if (!o.userData.isGLB || o === this.model) return false;
        const box = new THREE.Box3().setFromObject(o);
        const size = box.getSize(new THREE.Vector3());
        const center = new THREE.Vector3();
        box.getCenter(center);
        const dist = new THREE.Vector2(this.position.x - center.x, this.position.z - center.z).length();
        const footprint = Math.max(size.x, size.z);
        return dist < footprint * 0.5 + 1 && size.y > 1.5 && size.y < 15;
      });
      
      if (wallObj && this.keys[' ']) {
        // Vault/climb over: boost player up
        this.position.y += 4 * dt;
        this.jumpVelocity = 0;
        this.playAnimation(this.animations['climb'] || 'jump');
      }
    }

    // === AUTO DOOR ENTRY ===
    // Walk into doors to automatically enter buildings
    if (!this.inBuilding && !this._doorCooldown) {
      const door = this.objects.find(o => {
        if (!o.userData.name) return false;
        const n = o.userData.name.toLowerCase();
        const isDoor = n.includes('door') || n.includes('entrance') || n.includes('gateway') || n.includes('archway');
        if (!isDoor) return false;
        return this.position.distanceTo(o.position) < 2.5;
      });
      
      if (door) {
        // Find the parent building near this door
        const building = this.objects.find(o => {
          if (!o.userData.name || !o.userData.isGLB) return false;
          const n = o.userData.name.toLowerCase();
          const isBldg = n.includes('building') || n.includes('house') || n.includes('story') || 
                        n.includes('tavern') || n.includes('shop') || n.includes('inn') || 
                        n.includes('castle') || n.includes('temple') || n.includes('church');
          return isBldg && o.position.distanceTo(door.position) < 15;
        });
        
        if (building) {
          this._doorCooldown = true;
          setTimeout(() => { this._doorCooldown = false; }, 2000);
          this._enterBuilding(building);
        }
      }
    }


    // === NPC PROXIMITY DIALOGUE ===
    // Show interact prompt when near NPCs (check every 10 frames to save CPU)
    this._npcCheckFrame = (this._npcCheckFrame || 0) + 1;
    if (this._npcCheckFrame % 5 === 0) this._updateThreatIndicator(dt);
    if (!this.inBuilding && !this._talkCooldown && this._npcCheckFrame % 10 === 0) {
      const nearbyNPC = this.objects.find(o => {
        if (!o.userData.isNPC && !o.userData.name) return false;
        const n = (o.userData.name || '').toLowerCase();
        const isNPC = o.userData.isNPC || n.includes('villager') || n.includes('npc') || 
                     n.includes('merchant') || n.includes('guard') || n.includes('wizard') ||
                     n.includes('blacksmith') || n.includes('innkeeper') || n.includes('bartender') ||
                     n.includes('trader') || n.includes('priest') || n.includes('elder');
        return isNPC && this.position.distanceTo(o.position) < 4;
      });
      
      if (nearbyNPC && !this._showingPrompt) {
        this._showingPrompt = true;
        this._promptNPC = nearbyNPC;
        // Show "Press F to talk" prompt
        if (!this._interactPrompt) {
          this._interactPrompt = document.createElement('div');
          this._interactPrompt.style.cssText = 'position:fixed;bottom:160px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);border:1px solid #8b5cf6;border-radius:8px;padding:8px 16px;color:#e0e0e0;font-family:monospace;font-size:13px;z-index:9999;pointer-events:none;';
          document.body.appendChild(this._interactPrompt);
        }
        const npcName = nearbyNPC.userData.name || 'NPC';
        this._interactPrompt.textContent = '🗣️ Press F to talk to ' + npcName;
        this._interactPrompt.style.display = 'block';
        
        // F key triggers dialogue
        if (this.keys['f'] && !this._interactCooldown) {
          this._interactCooldown = true;
          this._talkCooldown = true;
          setTimeout(() => { this._interactCooldown = false; }, 500);
          setTimeout(() => { this._talkCooldown = false; }, 3000);
          
          // Get contextual dialogue
          const lines = NPCController.getDialogue(npcName, 'greetings');
          if (this.dialogueSystem) {
            this.dialogueSystem.start({
              speaker: npcName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
              lines: lines,
              onEnd: () => { this._showingPrompt = false; }
            });
          }
        }
      } else if (!nearbyNPC && this._showingPrompt) {
        this._showingPrompt = false;
        if (this._interactPrompt) this._interactPrompt.style.display = 'none';
      }
    }

    // === COLLISION CHECK (cached bounding data) ===
    const playerRadius = 0.3;
    blocked = false;
    
    // Rebuild collision cache every 60 frames or when objects change
    if (!this._collisionCache || this._collisionCacheFrame !== this.objects.length) {
      this._collisionCache = [];
      this._collisionCacheFrame = this.objects.length;
      for (const obj of this.objects) {
        if (obj === this.model) continue;
        if (obj.userData.isPlayer || obj.userData.isNPC) continue;
        // Collide with ALL objects (GLB + procedural)
        if (obj.userData.noCollision || obj.userData.isInterior || obj.userData.isGround || obj.userData.isRoad || obj.userData.isWater) continue;
        
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        
        if (size.y < 0.3 && size.x < 0.3 && size.z < 0.3) continue;
        const n = (obj.userData.name || '').toLowerCase();
        const isFlat = n.includes('path') || n.includes('floor') || n.includes('carpet') || n.includes('street') || n.includes('lilypad') || n.includes('grass');
        if (isFlat || (size.y < 0.15 && Math.max(size.x, size.z) > 1)) continue;
        
        const footprint = Math.max(size.x, size.z);
        const objRadius = footprint < 1 ? footprint * 0.3 : footprint * 0.35;
        const center = new THREE.Vector3();
        box.getCenter(center);
        center.y = 0;
        
        this._collisionCache.push({ obj, cx: center.x, cz: center.z, radius: objRadius });
      }
    }
    
    for (const c of this._collisionCache) {
      const dx = this.position.x - c.cx;
      const dz = this.position.z - c.cz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      
      if (dist < c.radius + playerRadius) {
        blocked = true;
        let px = dx, pz = dz;
        const len = Math.sqrt(px * px + pz * pz);
        if (len < 0.01) { px = 1; pz = 0; } else { px /= len; pz /= len; }
        this.position.x = c.cx + px * (c.radius + playerRadius + 0.05);
        this.position.z = c.cz + pz * (c.radius + playerRadius + 0.05);
        this.speed *= 0.2;
      }
    }
    
    if (!this._lastSafePos) this._lastSafePos = new THREE.Vector3();
    if (!blocked) this._lastSafePos.copy(this.position);
    
    // Update container position (feet level) — model inside is already offset
    const container = this.modelContainer || this.model;
    if (this.modelContainer) {
      this.modelContainer.position.copy(this.position);
      this.modelContainer.rotation.y = this.rotation;
    } else {
      (this.modelContainer || this.model).position.set(this.position.x, this.position.y + (this.modelContainer ? 0 : (this.groundOffset || 0)), this.position.z);
      this.model.rotation.y = this.rotation;
    }
    
    // Animation state
    if (!this.isRolling && !this.isAttacking && this.isGrounded) {
      if (this.speed > this.runSpeed * 0.8) this.playAnimation('run');
      else if (this.speed > this.walkSpeed * 0.5) this.playAnimation('walk');
      else this.playAnimation(this.animations['idle_sword'] ? 'idle_sword' : 'idle');
    }
    
    // Stamina regen
    if (this.stamina < this.maxStamina) {
      this.stamina = Math.min(this.maxStamina, this.stamina + 15 * dt);
    }
    
    // Low health warning — red vignette pulse
    const healthPct = this.health / this.maxHealth;
    let vignette = document.getElementById('low-health-vignette');
    if (healthPct < 0.3 && !this.isDead) {
      if (!vignette) {
        vignette = document.createElement('div');
        vignette.id = 'low-health-vignette';
        vignette.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
          'pointer-events:none;z-index:9400;' +
          'background:radial-gradient(ellipse at center, transparent 50%, rgba(180,0,0,0.3) 100%);';
        document.body.appendChild(vignette);
      }
      // Pulse effect
      this._healthPulse = (this._healthPulse || 0) + dt * 3;
      const pulse = 0.2 + Math.sin(this._healthPulse) * 0.15;
      vignette.style.background = 'radial-gradient(ellipse at center, transparent 50%, rgba(180,0,0,' + pulse + ') 100%)';
      vignette.style.display = 'block';
    } else if (vignette) {
      vignette.style.display = 'none';
    }
    
    // Update camera
    this._updateCamera(dt);
    
    // === INTERACTION PROMPT ===
    // Show prompt when near interactable objects
    this._updateInteractionPrompt();
  }
  
  _updateInteractionPrompt() {
    let promptEl = document.getElementById('interact-prompt');
    
    // Check for nearby interactables
    let promptText = null;
    const pos = this.position;
    
    // Doors
    if (window._sceneObjects) {
      for (const obj of window._sceneObjects) {
        if (!obj) continue;
        let hasDoor = false;
        obj.traverse(child => {
          if (child.userData && child.userData.isDoor) {
            const wp = new THREE.Vector3();
            child.getWorldPosition(wp);
            if (pos.distanceTo(wp) < 3) {
              promptText = child.userData.isOpen ? '[E] Close Door' : '[E] Open Door';
              hasDoor = true;
            }
          }
        });
        if (hasDoor) break;
      }
    }
    
    // NPCs
    if (!promptText && window.npcController) {
      for (const npc of window.npcController.npcs) {
        if (npc.isDead) {
        // Death tilt for NPCs without death animation
        if (npc._deathTilt && npc.model.rotation.x > -Math.PI/2) {
          npc.model.rotation.x -= dt * 3;
          if (npc.model.rotation.x < -Math.PI/2) npc.model.rotation.x = -Math.PI/2;
        }
        if (npc.mixer) npc.mixer.update(dt);
        continue;
      }
        const d = pos.distanceTo(npc.model.position);
        if (d < 5) {
          promptText = '[E] Talk to ' + (npc.type || 'NPC');
          break;
        }
      }
    }
    
    // Vehicles
    if (!promptText && window._sceneObjects) {
      for (const obj of window._sceneObjects) {
        if (!obj || !obj.userData || !obj.userData.name) continue;
        const n = obj.userData.name.toLowerCase();
        const isVehicle = n.includes('car') || n.includes('truck') || n.includes('boat') || n.includes('horse');
        if (isVehicle && pos.distanceTo(obj.position) < 5) {
          promptText = '[F] Enter ' + obj.userData.name;
          break;
        }
      }
    }
    
    // Highlight nearest interactable object
    if (this._lastHighlight && this._lastHighlight.material) {
      this._lastHighlight.material.emissive?.setHex(0x000000);
      this._lastHighlight = null;
    }
    
    // Find object player is looking at (center screen raycast)
    if (this.camera && window._sceneObjects) {
      const raycaster = _cachedRaycaster;
      const center = new THREE.Vector2(0, 0);
      raycaster.setFromCamera(center, this.camera);
      raycaster.far = 8;
      
      const interactables = window._sceneObjects.filter(o => 
        o && o.userData && (o.userData.isDoor || o.userData.isPickup || 
         (o.userData.name && (o.userData.name.toLowerCase().includes('car') || 
          o.userData.name.toLowerCase().includes('chest') ||
          o.userData.name.toLowerCase().includes('door'))))
      );
      
      const hits = raycaster.intersectObjects(interactables, true);
      if (hits.length > 0) {
        const hit = hits[0].object;
        if (hit.material && hit.material.emissive) {
          hit.material.emissive.setHex(0x222222);
          this._lastHighlight = hit;
        }
      }
    }
    
    // Show/hide prompt
    if (promptText) {
      if (!promptEl) {
        promptEl = document.createElement('div');
        promptEl.id = 'interact-prompt';
        promptEl.style.cssText = 'position:fixed;bottom:25%;left:50%;transform:translateX(-50%);' +
          'background:rgba(0,0,0,0.75);color:#fff;padding:8px 20px;border-radius:8px;' +
          'font-family:monospace;font-size:14px;z-index:9000;pointer-events:none;' +
          'border:1px solid rgba(255,255,255,0.15);backdrop-filter:blur(4px);' +
          'transition:opacity 0.2s;';
        document.body.appendChild(promptEl);
      }
      promptEl.textContent = promptText;
      promptEl.style.opacity = '1';
      promptEl.style.display = 'block';
    } else if (promptEl) {
      promptEl.style.opacity = '0';
      setTimeout(() => { if (promptEl && promptEl.style.opacity === '0') promptEl.style.display = 'none'; }, 200);
    }
  }
  
  _updateProceduralAnim(dt) {
    this.animTime += dt;
    const t = this.animTime;
    const b = this.bones;
    if (!b.hips) return;
    
    const L = THREE.MathUtils.lerp;
    const blend = 0.12; // Smooth blend factor
    
    const isMoving = this.speed > 0.5;
    const isRunningAnim = this.speed > this.walkSpeed * 1.5;
    const isSprinting = this.speed > this.runSpeed * 1.2;
    
    // Helper: smoothly lerp bone rotation toward target
    const lerpBone = (bone, axis, target) => {
      if (!bone) return;
      bone.rotation[axis] = L(bone.rotation[axis], target, blend);
    };
    
    // ─── JUMP ───
    if (!this.isGrounded) {
      const jumpPhase = this.jumpVelocity; // positive=rising, negative=falling
      if (jumpPhase > 2) {
        // Launch — legs extend, arms up
        lerpBone(b.leftLeg, 'x', -0.2);
        lerpBone(b.rightLeg, 'x', -0.15);
        lerpBone(b.leftKnee, 'x', 0);
        lerpBone(b.rightKnee, 'x', 0);
        lerpBone(b.leftArm, 'x', -1.2);
        lerpBone(b.rightArm, 'x', -1.2);
        lerpBone(b.leftArm, 'z', 0.5);
        lerpBone(b.rightArm, 'z', -0.5);
      } else if (jumpPhase < -2) {
        // Falling — tuck knees
        lerpBone(b.leftLeg, 'x', -0.5);
        lerpBone(b.rightLeg, 'x', -0.4);
        lerpBone(b.leftKnee, 'x', 0.9);
        lerpBone(b.rightKnee, 'x', 0.9);
        lerpBone(b.leftArm, 'x', -0.3);
        lerpBone(b.rightArm, 'x', -0.3);
        lerpBone(b.leftArm, 'z', 0.6);
        lerpBone(b.rightArm, 'z', -0.6);
      } else {
        // Apex — slight tuck
        lerpBone(b.leftLeg, 'x', -0.3);
        lerpBone(b.rightLeg, 'x', -0.25);
        lerpBone(b.leftKnee, 'x', 0.5);
        lerpBone(b.rightKnee, 'x', 0.5);
        lerpBone(b.leftArm, 'z', 0.5);
        lerpBone(b.rightArm, 'z', -0.5);
      }
      lerpBone(b.spine, 'x', -0.1);
      return;
    }
    
    // ─── ROLL ───
    if (this.isRolling) {
      const rollT = (t * 12) % (Math.PI * 2);
      // Full body tuck and rotate
      if (b.spine) b.spine.rotation.x = L(b.spine.rotation.x, -0.8 + Math.sin(rollT) * 1.5, 0.25);
      lerpBone(b.leftLeg, 'x', -1.2);
      lerpBone(b.rightLeg, 'x', -1.2);
      lerpBone(b.leftKnee, 'x', 1.5);
      lerpBone(b.rightKnee, 'x', 1.5);
      lerpBone(b.leftArm, 'x', -0.8);
      lerpBone(b.rightArm, 'x', -0.8);
      lerpBone(b.leftArm, 'z', 0.5);
      lerpBone(b.rightArm, 'z', -0.5);
      lerpBone(b.leftForearm, 'x', -1.0);
      lerpBone(b.rightForearm, 'x', -1.0);
      if (b.head) lerpBone(b.head, 'x', 0.4);
      return;
    }
    
    // ─── ATTACK ───
    if (this.isAttacking) {
      const atkT = (t * 10) % (Math.PI * 2);
      lerpBone(b.rightArm, 'x', -2.2 + Math.sin(atkT) * 0.3);
      lerpBone(b.rightForearm, 'x', -0.6);
      lerpBone(b.leftArm, 'x', -0.3);
      lerpBone(b.leftArm, 'z', 0.4);
      lerpBone(b.spine, 'y', 0.35);
      lerpBone(b.spine, 'x', -0.1);
      return;
    }
    
    if (isMoving) {
      // ─── WALK / RUN CYCLE ───
      const freq = isSprinting ? 12 : isRunningAnim ? 9 : 6;
      const legAmp = isSprinting ? 0.9 : isRunningAnim ? 0.7 : 0.4;
      const armAmp = isSprinting ? 0.9 : isRunningAnim ? 0.75 : 0.45;
      const kneeAmp = isSprinting ? 1.1 : isRunningAnim ? 0.9 : 0.6;
      const phase = t * freq;
      
      // Legs — forward/back swing
      lerpBone(b.leftLeg, 'x', Math.sin(phase) * legAmp);
      lerpBone(b.rightLeg, 'x', Math.sin(phase + Math.PI) * legAmp);
      
      // Knees — bend on back-swing (heel strike / toe push)
      lerpBone(b.leftKnee, 'x', Math.max(0, -Math.sin(phase - 0.4)) * kneeAmp);
      lerpBone(b.rightKnee, 'x', Math.max(0, -Math.sin(phase + Math.PI - 0.4)) * kneeAmp);
      
      // Arms — swing opposite to legs, naturally at sides
      lerpBone(b.leftArm, 'x', Math.sin(phase + Math.PI) * armAmp);
      lerpBone(b.rightArm, 'x', Math.sin(phase) * armAmp);
      lerpBone(b.leftArm, 'z', 0.08); // Arms at sides, not T-pose
      lerpBone(b.rightArm, 'z', -0.08);
      
      // Forearms — slight bend while swinging
      lerpBone(b.leftForearm, 'x', -0.35 - Math.max(0, Math.sin(phase + Math.PI)) * 0.35);
      lerpBone(b.rightForearm, 'x', -0.35 - Math.max(0, Math.sin(phase)) * 0.35);
      
      // Spine — counter-rotation (shoulder twist) + forward lean when running
      const spineYTarget = Math.sin(phase) * (isRunningAnim ? 0.08 : 0.04);
      const spineLean = isSprinting ? -0.2 : isRunningAnim ? -0.12 : 0;
      lerpBone(b.spine, 'y', spineYTarget);
      lerpBone(b.spine, 'x', spineLean);
      
      // Hips — vertical bob + lateral sway
      if (b.hips) {
        if (!b.hips.userData.origY) b.hips.userData.origY = b.hips.position.y;
        const bob = Math.abs(Math.sin(phase * 2)) * (isRunningAnim ? 0.04 : 0.02);
        const sway = Math.sin(phase) * (isRunningAnim ? 0.015 : 0.008);
        b.hips.position.y = L(b.hips.position.y, b.hips.userData.origY + bob, blend);
        b.hips.position.x = L(b.hips.position.x, (b.hips.userData.origPos?.x || 0) + sway, blend);
      }
      
      // Head — stays stable, slight counter to spine
      lerpBone(b.head, 'y', -spineYTarget * 0.5);
      
      // Neck subtle
      lerpBone(b.neck, 'x', spineLean * 0.3);
      
    } else {
      // ─── IDLE — BREATHING + NATURAL REST POSE ───
      const breathe = Math.sin(t * 1.5);
      const microMove = Math.sin(t * 0.7) * 0.02;
      
      // Legs — straight, very slight sway
      lerpBone(b.leftLeg, 'x', microMove);
      lerpBone(b.rightLeg, 'x', -microMove * 0.5);
      lerpBone(b.leftKnee, 'x', 0.02);
      lerpBone(b.rightKnee, 'x', 0.02);
      
      // Arms — NATURAL REST AT SIDES (not T-pose!)
      lerpBone(b.leftArm, 'x', breathe * 0.02);
      lerpBone(b.rightArm, 'x', -breathe * 0.015);
      lerpBone(b.leftArm, 'z', 0.15);  // Arms hang at sides
      lerpBone(b.rightArm, 'z', -0.15); // Arms hang at sides
      
      // Forearms — relaxed slight bend
      lerpBone(b.leftForearm, 'x', -0.12);
      lerpBone(b.rightForearm, 'x', -0.12);
      
      // Spine — breathing expansion
      lerpBone(b.spine, 'x', breathe * 0.015);
      lerpBone(b.spine, 'y', 0);
      
      // Hips — breathing + subtle weight shift
      if (b.hips) {
        if (!b.hips.userData.origY) b.hips.userData.origY = b.hips.position.y;
        b.hips.position.y = L(b.hips.position.y, b.hips.userData.origY + breathe * 0.005, blend);
      }
      
      // Head — subtle look-around
      lerpBone(b.head, 'y', Math.sin(t * 0.3) * 0.04);
      lerpBone(b.head, 'x', Math.sin(t * 0.2) * 0.02);
    }
  }

  
    _updateCamera(dt) {
    // Smooth ADS transition
    const aimTarget = this.isAiming ? 1 : 0;
    this.aimLerp += (aimTarget - this.aimLerp) * Math.min(1, 8 * dt);
    
    if (this.cameraMode === '3rd') {
      // === THIRD PERSON — OVER-THE-SHOULDER ===
      const baseDist = THREE.MathUtils.lerp(this.cameraDistance, this.aimCameraDistance, this.aimLerp);
      const baseShoulder = THREE.MathUtils.lerp(this.shoulderOffset, this.aimShoulderOffset, this.aimLerp) * this.shoulderSide;
      const baseHeight = THREE.MathUtils.lerp(this.cameraHeight, 1.6, this.aimLerp);
      
      // Camera position behind and to the side of character
      const camOffsetX = Math.sin(this.cameraYaw) * baseDist + Math.cos(this.cameraYaw) * baseShoulder;
      const camOffsetZ = Math.cos(this.cameraYaw) * baseDist - Math.sin(this.cameraYaw) * baseShoulder;
      const camOffsetY = baseHeight + this.cameraPitch * baseDist * 0.4;
      
      const desiredPos = new THREE.Vector3(
        this.position.x + camOffsetX,
        this.position.y + camOffsetY,
        this.position.z + camOffsetZ
      );
      
      // Camera collision: raycast from character to desired camera position
      {
        const charHead = new THREE.Vector3(this.position.x, this.position.y + 1.6, this.position.z);
        const toCamera = new THREE.Vector3().subVectors(desiredPos, charHead);
        const dist = toCamera.length();
        toCamera.normalize();
        const ray = new THREE.Raycaster(charHead, toCamera, 0.3, dist);
        
        let closestHit = dist;
        
        // Use Octree for camera collision (fast single check)
        if (this.collider && this.collider.world.built) {
          const octreeHit = this.collider.world.octree.rayIntersect(ray.ray);
          if (octreeHit && octreeHit.distance < dist) closestHit = octreeHit.distance;
        } else {
          // Fallback: raycast terrain + objects
          if (window._terrainMesh) {
            const hits = ray.intersectObject(window._terrainMesh);
            if (hits.length > 0) closestHit = Math.min(closestHit, hits[0].distance);
          }
          if (window._sceneObjects) {
            const solids = window._sceneObjects.filter(o => o && o.userData && (o.userData.isSolid || o.userData.isInterior || o.userData.isGLB));
            for (const obj of solids) {
              try {
                const hits = ray.intersectObject(obj, true);
                if (hits.length > 0) closestHit = Math.min(closestHit, hits[0].distance);
              } catch(e) {}
            }
          }
        }
        if (closestHit < dist) {
          const safeDist = closestHit - 0.3;
          desiredPos.copy(charHead).addScaledVector(toCamera, Math.max(0.5, safeDist));
        }
      }
      
      // Smooth camera follow
      this.camera.position.lerp(desiredPos, Math.min(1, this.cameraSmoothness * dt));
      
      // Look at point: slightly ahead of character (in aim direction) and at head height
      const lookAheadDist = THREE.MathUtils.lerp(0, 2, this.aimLerp);
      const lookAt = new THREE.Vector3(
        this.position.x - Math.sin(this.cameraYaw) * lookAheadDist,
        this.position.y + THREE.MathUtils.lerp(1.5, 1.65, this.aimLerp),
        this.position.z - Math.cos(this.cameraYaw) * lookAheadDist
      );
      this.camera.lookAt(lookAt);
      
      // Camera roll during dodge
      if (this.isRolling) {
        this.camera.rotation.z = THREE.MathUtils.lerp(this.camera.rotation.z, 0.15 * this.shoulderSide, dt * 8);
      } else {
        this.camera.rotation.z = THREE.MathUtils.lerp(this.camera.rotation.z, 0, dt * 6);
      }
      
      // FOV transition — sprint widens, aim narrows
      let targetFOV = this.normalFOV;
      if (this.aimLerp > 0.1) {
        targetFOV = THREE.MathUtils.lerp(this.normalFOV, this.aimFOV, this.aimLerp);
      } else if (this.isSprinting || this.keys['control']) {
        targetFOV = this.normalFOV + 12; // Sprint FOV boost
      } else if (this.speed > this.runSpeed * 0.8) {
        targetFOV = this.normalFOV + 5; // Slight FOV when running
      }
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, Math.min(1, 6 * dt));
      this.camera.updateProjectionMatrix();
      
      // Character rotation: face where camera looks when moving or aiming
      if (this.model && (this.isAiming || this.isMoving) && !this.modelContainer) {
        const targetRot = this.rotation;
        const currentRot = this.model.rotation.y;
        let diff = targetRot - currentRot;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.model.rotation.y += diff * Math.min(1, 10 * dt);
      }
      
    } else {
      // === FIRST PERSON ===
      this.camera.position.set(this.position.x, this.position.y + 1.7, this.position.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.cameraYaw;
      this.camera.rotation.x = -this.cameraPitch;
      
      // FOV for sprint
      const sprintFOV = this.isSprinting ? 70 : this.normalFOV;
      const targetFOV = THREE.MathUtils.lerp(sprintFOV, this.aimFOV, this.aimLerp);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, Math.min(1, 6 * dt));
      this.camera.updateProjectionMatrix();
    }
    
    // FPS weapon viewmodel update
    if (this.cameraMode === '1st') {
      this._updateFPWeapon(dt);
    }
  }
  
  _updateFPWeapon(dt) {
    const group = this._fpWeaponGroup;
    if (!group || group.children.length === 0) return;
    
    // Bob when moving
    const moving = this.isMoving;
    const sprinting = this.isSprinting;
    const bobSpeed = sprinting ? 14 : moving ? 8 : 1.5;
    const bobAmtX = sprinting ? 0.04 : moving ? 0.025 : 0.005;
    const bobAmtY = sprinting ? 0.03 : moving ? 0.02 : 0.003;
    this._fpBobTime += dt * bobSpeed;
    
    // Base position: right side, slightly down
    const baseX = 0.25;
    const baseY = -0.22;
    const baseZ = -0.45;
    
    // Aim offset
    const aimX = THREE.MathUtils.lerp(baseX, 0.0, this.aimLerp); // Center when aiming
    const aimY = THREE.MathUtils.lerp(baseY, -0.15, this.aimLerp);
    const aimZ = THREE.MathUtils.lerp(baseZ, -0.35, this.aimLerp);
    
    // Bob
    const bobX = Math.sin(this._fpBobTime) * bobAmtX * (1 - this.aimLerp * 0.8);
    const bobY = Math.abs(Math.cos(this._fpBobTime)) * bobAmtY * (1 - this.aimLerp * 0.8);
    
    // Sway from mouse movement (uses camera delta)
    this._fpSwayX = THREE.MathUtils.lerp(this._fpSwayX, 0, dt * 5);
    this._fpSwayY = THREE.MathUtils.lerp(this._fpSwayY, 0, dt * 5);
    const swayX = this._fpSwayX * 0.02 * (1 - this.aimLerp * 0.7);
    const swayY = this._fpSwayY * 0.01 * (1 - this.aimLerp * 0.7);
    
    // Recoil recovery
    this._fpRecoil = THREE.MathUtils.lerp(this._fpRecoil, 0, dt * 10);
    
    group.position.set(
      aimX + bobX + swayX,
      aimY + bobY + swayY,
      aimZ + this._fpRecoil * 0.08
    );
    
    // Slight tilt on movement
    group.rotation.set(
      this._fpRecoil * -0.15,
      bobX * -1.5,
      bobX * 0.8
    );
  }
  
  _setupFPWeapon() {
    // Clear old
    while (this._fpWeaponGroup.children.length > 0) {
      this._fpWeaponGroup.remove(this._fpWeaponGroup.children[0]);
    }
    
    const weaponId = this.weaponSlots && this.weaponSlots[this.activeSlot];
    if (!weaponId) return;
    
    const data = WEAPON_DATABASE[weaponId];
    if (!data) return;
    
    // Create weapon mesh (returns Group immediately, GLB loads async into it)
    const fpMesh = createWeaponMesh(weaponId);
    if (!fpMesh) return;
    // Scale for FP view (bigger, closer to camera)
    fpMesh.scale.setScalar(0.4);
    
    if (data.type === 'ranged') {
      // Gun: lower-right like COD/Halo, barrel pointing forward
      fpMesh.scale.setScalar(1.5);
      fpMesh.rotation.set(0, Math.PI * 0.5, 0);
      fpMesh.position.set(0.25, -0.25, -0.5);
    } else {
      // Melee: lower-right, angled like holding a sword
      fpMesh.scale.setScalar(1.2);
      fpMesh.rotation.set(-0.4, 0.1, 0.15);
      fpMesh.position.set(0.3, -0.3, -0.4);
    }
    
    this._fpWeaponGroup.add(fpMesh);
  }
  
  renderFPWeapon(renderer) {
    // Call this AFTER main scene render, with autoClear=false
    if (this.cameraMode !== '1st') return;
    if (this._fpWeaponGroup.children.length === 0) return;
    
    renderer.autoClear = false;
    renderer.clearDepth();
    this._fpCamera.aspect = this.camera.aspect;
    this._fpCamera.updateProjectionMatrix();
    renderer.render(this._fpScene, this._fpCamera);
    renderer.autoClear = true;
  }
  
  _updateInVehicle(dt) {
    const v = this.inVehicle;
    if (!v) return;
    
    // Initialize vehicle state
    if (!v.userData._vSpeed) v.userData._vSpeed = 0;
    if (!v.userData._vRot) v.userData._vRot = v.rotation.y || 0;
    
    let throttle = 0, steer = 0, brake = false;
    if (this.keys['w']) throttle = 1;
    if (this.keys['s']) throttle = -0.5; // reverse is slower
    if (this.keys['a']) steer = 1;
    if (this.keys['d']) steer = -1;
    if (this.keys[' ']) brake = true;
    
    const n = (v.userData.name || '').toLowerCase();
    const isBoat = n.includes('boat') || n.includes('ship') || n.includes('canoe');
    const isTank = n.includes('tank');
    const maxSpeed = isBoat ? 12 : isTank ? 10 : 25;
    const accel = isBoat ? 6 : isTank ? 8 : 18;
    const decel = brake ? 30 : 8;
    const turnRate = isBoat ? 1.5 : isTank ? 2.5 : 3.0;
    
    // Acceleration / deceleration
    if (throttle !== 0) {
      v.userData._vSpeed += throttle * accel * dt;
      v.userData._vSpeed = Math.max(-maxSpeed * 0.4, Math.min(maxSpeed, v.userData._vSpeed));
    } else {
      // Natural deceleration
      if (Math.abs(v.userData._vSpeed) < 0.5) v.userData._vSpeed = 0;
      else v.userData._vSpeed -= Math.sign(v.userData._vSpeed) * decel * dt;
    }
    if (brake) {
      v.userData._vSpeed *= (1 - 5 * dt);
    }
    
    // Steering (only when moving)
    const speedFactor = Math.min(1, Math.abs(v.userData._vSpeed) / 5);
    v.userData._vRot += steer * turnRate * speedFactor * dt;
    v.rotation.y = v.userData._vRot;
    
    // Move
    v.position.x += Math.sin(v.userData._vRot) * v.userData._vSpeed * dt;
    v.position.z += Math.cos(v.userData._vRot) * v.userData._vSpeed * dt;
    
    // Ground follow
    if (window._terrainMesh && !isBoat) {
      const ty = _getTerrainY(v.position.x, v.position.z);
      v.position.y += (ty - v.position.y) * Math.min(1, 8 * dt);
    }
    
    // Tilt on acceleration (visual only)
    v.rotation.x = THREE.MathUtils.lerp(v.rotation.x || 0, -throttle * 0.05 * speedFactor, 4 * dt);
    v.rotation.z = THREE.MathUtils.lerp(v.rotation.z || 0, steer * 0.08 * speedFactor, 4 * dt);
    
    // Camera follows vehicle
    this.position.copy(v.position);
    this.position.y += 1;
    this.rotation = v.userData._vRot;
    this._updateCamera(dt);
    
    // Speed HUD
    const kmh = Math.abs(Math.round(v.userData._vSpeed * 3.6));
    if (!this._speedEl) {
      this._speedEl = document.createElement('div');
      this._speedEl.style.cssText = 'position:fixed;bottom:120px;right:20px;color:#4ade80;font-family:monospace;font-size:1.5rem;font-weight:bold;z-index:9999;text-shadow:0 0 10px rgba(74,222,128,0.5);';
      document.body.appendChild(this._speedEl);
    }
    this._speedEl.textContent = kmh + ' km/h';
    this._speedEl.style.display = 'block';
    
    // Exit vehicle (F key)
    if (this.keys['f']) {
      this.exitVehicle();
    }
  }
  
  enterVehicle(vehicle) {
    this.inVehicle = vehicle;
    if (this.model) this.model.visible = false;
    return '✓ Entered vehicle';
  }
  
  _enterBuilding(building) {
    this.inBuilding = building;
    
    // Get building bounds for floor size
    const bbox = new THREE.Box3().setFromObject(building);
    const bsize = bbox.getSize(new THREE.Vector3());
    const floorW = Math.max(bsize.x, 8);
    const floorD = Math.max(bsize.z, 8);
    const floorY = bbox.min.y + 0.05;
    
    // Create interior floor
    const floorGeo = new THREE.PlaneGeometry(floorW, floorD);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.9 }); // wood floor
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(building.position.x, floorY, building.position.z);
    floor.receiveShadow = true;
    floor.userData.name = 'interior_floor';
    floor.userData.isInterior = true;
    floor.userData.isFloor = true;
    floor.userData.isSolid = true;
    this.scene.add(floor);
    this.objects.push(floor);
    
    // Add interior point light
    const light = new THREE.PointLight(0xffe4b5, 1.5, 15);
    light.position.set(building.position.x, floorY + 2.5, building.position.z);
    light.userData.isInterior = true;
    this.scene.add(light);
    this._interiorLight = light;
    
    // Teleport player inside
    this.position.set(building.position.x, floorY + 0.5, building.position.z + 2);
    
    // Generate furniture inside
    this._generateInterior(building.position.x, building.position.z);
    
    // Hide the building exterior (make transparent)
    building.traverse(c => {
      if (c.isMesh && c.material) {
        c.userData.origOpacity = c.material.opacity;
        c.material.transparent = true;
        c.material.opacity = 0.15;
        c.material.needsUpdate = true;
      }
    });
  }
  
  _exitBuilding() {
    if (!this.inBuilding) return;
    
    // Restore building exterior
    this.inBuilding.traverse(c => {
      if (c.isMesh && c.material && c.userData.origOpacity !== undefined) {
        c.material.opacity = c.userData.origOpacity || 1;
        c.material.transparent = c.userData.origOpacity < 1;
        c.material.needsUpdate = true;
      }
    });
    
    // Move player outside (terrain height)
    const exitX = this.inBuilding.position.x + 5;
    const exitZ = this.inBuilding.position.z;
    const exitY = _getTerrainY(exitX, exitZ) + 0.5;
    this.position.set(exitX, exitY, exitZ);
    
    // Remove interior light
    if (this._interiorLight) {
      this.scene.remove(this._interiorLight);
      this._interiorLight = null;
    }
    
    // Remove interior furniture + floor
    const interiorObjs = this.objects.filter(o => o.userData.isInterior);
    interiorObjs.forEach(o => {
      this.scene.remove(o);
      const idx = this.objects.indexOf(o);
      if (idx >= 0) this.objects.splice(idx, 1);
    });
    
    this.inBuilding = null;
  }
  
  _generateInterior(cx, cz) {
    const furniture = [
      // Living room
      ['house_interior_pack_couch_large1', 0, -2, 3],
      ['house_interior_pack_table_roundlarge', 0, 0, 2],
      ['house_interior_pack_chair_1', -1.5, 0, 2],
      ['house_interior_pack_chair_1', 1.5, 0, 2],
      ['house_interior_pack_fireplace', 0, -3.5, 3],
      ['house_interior_pack_bookshelf', -3, -1, 3],
      // Kitchen
      ['house_interior_pack_kitchen_fridge', 3, -3, 3],
      ['house_interior_pack_kitchen_oven', 3, -1.5, 2.5],
      ['house_interior_pack_kitchen_sink', 3, 0, 2.5],
      // Bedroom
      ['house_interior_pack_bed_king', -3, 2, 3],
      ['house_interior_pack_light_floor1', -2, 1, 2],
      // Decor
      ['house_interior_pack_carpet_round', 0, 0, 4],
      ['house_interior_pack_houseplant_1', 2.5, 2.5, 2],
      ['house_interior_pack_plate_1', 0, 0.8, 1.5],
    ];
    
    const loader = new GLTFLoader();
// Get terrain height at world position
function _getTerrainY(x, z) {
  const tm = window._terrainMesh;
  if (!tm) return 0;
  const rc = new THREE.Raycaster(
    new THREE.Vector3(x, 500, z),
    new THREE.Vector3(0, -1, 0)
  );
  const hits = rc.intersectObject(tm);
  return hits.length > 0 ? hits[0].point.y : 0;
}

// Extended ground check: terrain + interior floors + solid objects
// Cached raycasters for performance (avoid GC churn)
const _cachedRaycaster = new THREE.Raycaster();
const _cachedOrigin = new THREE.Vector3();
const _downDir = new THREE.Vector3(0, -1, 0);

function _getGroundY(x, z, currentY) {
  const rc = _cachedRaycaster;
  _cachedOrigin.set(x, (currentY || 0) + 2, z);
  rc.set(_cachedOrigin, _downDir);
  rc.near = 0;
  rc.far = 10;
  
  let bestY = -Infinity;
  
  // Check terrain
  const tm = window._terrainMesh;
  if (tm) {
    const hits = rc.intersectObject(tm);
    if (hits.length > 0) bestY = Math.max(bestY, hits[0].point.y);
  }
  
  // Check solid objects (interior floors, stairs, platforms)
  const solids = (window._sceneObjects || []).filter(o => 
    o && o.userData && (o.userData.isSolid || o.userData.isFloor || o.userData.isInterior)
  );
  
  for (const solid of solids) {
    const hits = rc.intersectObject(solid, true); // recursive for groups
    for (const hit of hits) {
      // Only count surfaces we can stand on (normal pointing roughly up)
      if (hit.face && hit.face.normal) {
        const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        if (worldNormal.y > 0.5) { // slope < ~60 degrees
          bestY = Math.max(bestY, hit.point.y);
        }
      } else {
        bestY = Math.max(bestY, hit.point.y);
      }
    }
  }
  
  return bestY > -Infinity ? bestY : 0;
}

// Wall collision check: returns true if movement would hit a wall
function _checkWallCollision(position, direction, distance) {
  const rc = new THREE.Raycaster(
    new THREE.Vector3(position.x, position.y + 0.5, position.z), // chest height
    direction.clone().normalize(),
    0, distance + 0.3 // check slightly ahead
  );
  
  const solids = (window._sceneObjects || []).filter(o => 
    o && o.userData && (o.userData.isSolid || o.userData.isInterior)
  );
  
  for (const solid of solids) {
    const hits = rc.intersectObject(solid, true);
    for (const hit of hits) {
      // Wall = surface with mostly horizontal normal
      if (hit.face && hit.face.normal) {
        const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        if (Math.abs(worldNormal.y) < 0.5) { // mostly vertical surface = wall
          return { hit: true, point: hit.point, normal: worldNormal, distance: hit.distance };
        }
      }
    }
  }
  return { hit: false };
}

    for (const [model, ox, oz, scale] of furniture) {
      const url = 'models/' + model + '.glb';
      loader.load(url, (gltf) => {
        const m = gltf.scene;
        const box = new THREE.Box3().setFromObject(m);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        m.scale.setScalar((scale || 2) / Math.max(maxDim, 0.001));
        
        const box2 = new THREE.Box3().setFromObject(m);
        m.position.set(cx + ox, -box2.min.y, cz + oz);
        m.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        m.userData.name = 'interior_' + model;
        m.userData.isGLB = true;
        m.userData.isInterior = true;
        m.userData.noCollision = true; // Don't block player inside house
        this.scene.add(m);
        this.objects.push(m);
      });
    }
  }
  
    exitVehicle() {
    if (!this.inVehicle) return;
    const vy = this.inVehicle.position.y || 0;
    this.position.set(
      this.inVehicle.position.x + 3,
      vy + 0.5,
      this.inVehicle.position.z
    );
    if (this.collider) this.collider.teleport(this.position.x, this.position.y, this.position.z);
    this.inVehicle = null;
    if (this.model) {
      this.model.visible = true;
    }
    // Hide speed HUD
    if (this._speedEl) this._speedEl.style.display = 'none';
  }
  
  toggleCameraMode() {
    this.cameraMode = this.cameraMode === '3rd' ? '1st' : '3rd';
    if (this.model) this.model.visible = this.cameraMode === '3rd';
    if (this.cameraMode === '1st') this._setupFPWeapon();
    // Reset aim when switching
    this.isAiming = false;
    this.aimLerp = 0;
    return '✓ Camera: ' + (this.cameraMode === '3rd' ? '3rd Person (Over-Shoulder)' : '1st Person');
  }
  
  // === COMBAT & INVENTORY ===
  checkAttackHit(npcController) {
    if (!this._attackHitFrame || !this.model) return;
    this._attackHitFrame = false;
    
    const baseRange = this.equippedWeapon ? 3.5 : 2.5;
    const baseDamage = this.equippedWeapon ? this.equippedWeapon.damage : 15;
    const multi = this._comboDamageMulti || 1.0;
    const isHeavy = this._isHeavyAttack || false;
    
    // Heavy attacks have wider range + AOE
    const range = isHeavy ? baseRange * 1.5 : baseRange;
    const damage = Math.floor(baseDamage * multi);
    const nearby = npcController.getNearbyNPCs(this.position, range);
    
    const forward = new THREE.Vector3(Math.sin(this.rotation), 0, Math.cos(this.rotation));
    
    // Heavy = 360° AOE, Light = forward cone
    const coneThreshold = isHeavy ? -0.3 : 0.2;
    
    let hitCount = 0;
    for (const npc of nearby) {
      const toNPC = new THREE.Vector3().subVectors(npc.model.position, this.position).normalize();
      const dot = forward.dot(toNPC);
      if (dot > coneThreshold) {
        // Extra knockback on heavy
        const knockbackForce = isHeavy ? 3.0 : 1.5;
        const killed = npcController.damageNPC(npc, damage, this.position);
        // Extra knockback push
        if (!killed && isHeavy) {
          const kb = new THREE.Vector3().subVectors(npc.model.position, this.position).normalize().multiplyScalar(knockbackForce);
          npc.model.position.add(kb);
        }
        hitCount++;
        if (killed) {
          this._lastKillTime = Date.now(); if (window._sound) window._sound.SFX.enemyDeath();
          _showHitMarker(true); // gold kill marker
        }
      }
    }
    
    // Hit feedback — brief slow-mo effect (hitstop) + hit marker
    if (hitCount > 0) {
      this._hitstop = 0.05; if (window._sound) window._sound.SFX.swordHit();
      // Hit marker + screen shake
      _showHitMarker(false);
      if (this._isHeavyAttack && window._screenShake) window._screenShake.trigger(3, 0.2);
      else if (window._screenShake) window._screenShake.trigger(1, 0.1);
    }
  }
  
  checkPickups(objects, scene) {
    if (!this.model) return null;
    const t = performance.now() * 0.001;
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (!obj.userData.isPickup) continue;
      // Bobbing animation
      if (obj.userData.bobBaseY !== undefined) {
        obj.position.y = obj.userData.bobBaseY + Math.sin(t * 2 + (obj.userData.bobPhase || 0)) * 0.15;
        obj.rotation.y += 0.02;
        if (obj.userData.glowRing) obj.userData.glowRing.material.opacity = 0.2 + Math.sin(t * 3) * 0.2;
      }
      const dist = this.position.distanceTo(obj.position);
      if (dist < 2) {
        const data = obj.userData.pickupData;
        scene.remove(obj);
        objects.splice(i, 1);
        if (window._sound) window._sound.SFX.pickup();
        // Floating pickup text
        if (typeof window._floatingDamage === 'function' && data) {
          const label = data.type === 'health_potion' ? '+' + (data.value||25) + ' HP' : data.type === 'gem' ? '+' + (data.value||50) : data.type;
          window._floatingDamage(obj.position, label, true);
        }
        return this._processPickup(data);
      }
    }
    return null;
  }
  
  _processPickup(data) {
    if (!data) return null;
    if (data.type === 'health_potion') {
      this.health = Math.min(this.maxHealth, this.health + (data.value || 25));
      return '❤️ +' + data.value + ' Health!';
    } else if (data.type === 'gem') {
      return '💎 +' + (data.value || 50) + ' Score!';
    } else if (data.type === 'weapon') {
      this.equippedWeapon = { name: data.subtype, damage: data.damage || 25 };
      this._updateInventoryHUD();
      return '⚔️ Equipped ' + data.subtype + '!';
    } else if (data.type === 'shield') {
      this.equippedShield = { name: data.subtype, defense: data.defense || 15 };
      this._updateInventoryHUD();
      return '🛡️ Equipped ' + data.subtype + '!';
    }
    if (data.type === 'material') {
      return '🧱 +' + (data.amount||1) + ' ' + data.material + ' material:' + data.material + ':' + (data.amount||1);
    }
    this.inventory.push(data);
    return '📦 Picked up ' + data.type;
  }
  
  takeDamage(amount) {
    if (this.isInvincible) return 'dodged';
    const defense = this.equippedShield ? this.equippedShield.defense : 0;
    const actual = Math.max(1, amount - defense);
    this.health = Math.max(0, this.health - actual); if (window._sound) window._sound.SFX.playerHit();
    this.stateMachine.transition(CharacterState.HIT, 0.4);
    if (window._screenShake) window._screenShake.trigger(2, 0.15);
    
    // Damage vignette flash
    if (window._hudUpdate) window._hudUpdate.damageFlash();
    
    if (this.health <= 0) {
      this.stateMachine.transition(CharacterState.DEATH);
      if (window._sound) window._sound.SFX.playerDeath(); return 'dead';
    }
    return 'hit';
  }
  
  _updateInventoryHUD() {
    const inv = document.getElementById('hud-inventory');
    if (!inv) return;
    inv.innerHTML = '';
    const items = [];
    if (this.equippedWeapon) items.push({ icon: '⚔️', label: this.equippedWeapon.name });
    if (this.equippedShield) items.push({ icon: '🛡️', label: this.equippedShield.name });
    for (const it of this.inventory.slice(0, 6)) {
      items.push({ icon: '📦', label: it.type });
    }
    items.forEach((item, i) => {
      const slot = document.createElement('div');
      slot.style.cssText = 'width:48px;height:48px;background:rgba(0,0,0,0.7);border:1px solid ' + (i < 2 ? '#f59e0b' : '#555') + ';border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:20px;position:relative;';
      slot.innerHTML = item.icon + '<span style="position:absolute;bottom:1px;font-size:8px;color:#aaa;">' + (i+1) + '</span>';
      slot.title = item.label;
      inv.appendChild(slot);
    });
  }

  toggleInventoryPanel() {
    let panel = document.getElementById('inventory-panel');
    if (panel) { panel.remove(); return; }
    
    panel = document.createElement('div');
    panel.id = 'inventory-panel';
    panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10003;display:flex;align-items:center;justify-content:center;font-family:system-ui;backdrop-filter:blur(4px);';
    
    const container = document.createElement('div');
    container.style.cssText = 'background:rgba(15,15,20,0.95);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:30px;width:600px;max-height:80vh;overflow-y:auto;';
    
    // Header
    container.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;"><div style="font-size:20px;font-weight:700;color:#fff;">🎒 Inventory</div><div style="color:rgba(255,255,255,0.3);font-size:11px;">TAB to close</div></div>';
    
    // Stats section
    const stats = document.createElement('div');
    stats.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;font-size:12px;color:rgba(255,255,255,0.6);';
    stats.innerHTML = `
      <div>❤️ Health: <span style="color:#e05050">${Math.round(this.health)}/${this.maxHealth}</span></div>
      <div>⚡ Stamina: <span style="color:#50c070">${Math.round(this.stamina)}/${this.maxStamina}</span></div>
      <div>⚔️ Weapon: <span style="color:#f59e0b">${this.equippedWeapon || 'None'}</span></div>
      <div>🛡️ Shield: <span style="color:#3b82f6">${this.equippedShield ? this.equippedShield.name : 'None'}</span></div>
    `;
    container.appendChild(stats);
    
    // Weapon slots
    const slotsLabel = document.createElement('div');
    slotsLabel.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.4);margin-bottom:8px;letter-spacing:1px;text-transform:uppercase;';
    slotsLabel.textContent = 'Weapon Slots';
    container.appendChild(slotsLabel);
    
    const slotsRow = document.createElement('div');
    slotsRow.style.cssText = 'display:flex;gap:8px;margin-bottom:20px;';
    for (let i = 0; i < 3; i++) {
      const wid = this.weaponSlots ? this.weaponSlots[i] : null;
      const wpn = wid ? WEAPON_DATABASE[wid] : null;
      const isActive = this.activeSlot === i && this.weaponDrawn;
      const slot = document.createElement('div');
      slot.style.cssText = 'width:80px;height:80px;background:rgba(255,255,255,' + (isActive ? '0.08' : '0.03') + ');border:1px solid ' + (isActive ? 'rgba(255,200,60,0.5)' : 'rgba(255,255,255,0.06)') + ';border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:10px;color:rgba(255,255,255,0.5);';
      slot.innerHTML = '<div style="font-size:9px;color:rgba(255,255,255,0.2);margin-bottom:4px;">' + (i+1) + '</div>' + 
        (wpn ? '<div style="font-size:24px;">' + (wpn.type === 'ranged' ? '🔫' : '⚔️') + '</div><div style="margin-top:2px;">' + wpn.name + '</div>' : '<div style="font-size:18px;color:rgba(255,255,255,0.1);">—</div>');
      slotsRow.appendChild(slot);
    }
    container.appendChild(slotsRow);
    
    // Items grid
    const itemsLabel = document.createElement('div');
    itemsLabel.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.4);margin-bottom:8px;letter-spacing:1px;text-transform:uppercase;';
    itemsLabel.textContent = 'Items (' + this.inventory.length + ')';
    container.appendChild(itemsLabel);
    
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(8,1fr);gap:4px;';
    const iconMap = { health_potion: '❤️', gem: '💎', weapon: '⚔️', shield: '🛡️', material: '🧱', crystal: '💠', iron: '⚙️', gold: '🪙', wood: '🪵' };
    for (let i = 0; i < 32; i++) {
      const item = this.inventory[i];
      const cell = document.createElement('div');
      cell.style.cssText = 'aspect-ratio:1;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.04);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:18px;' + (item ? 'cursor:pointer;' : '');
      if (item) {
        cell.textContent = iconMap[item.type] || iconMap[item.material] || '📦';
        cell.title = item.type + (item.value ? ' (+' + item.value + ')' : '') + (item.amount ? ' x' + item.amount : '');
        cell.onmouseenter = () => { cell.style.borderColor = 'rgba(255,200,60,0.4)'; };
        cell.onmouseleave = () => { cell.style.borderColor = 'rgba(255,255,255,0.04)'; };
      }
      grid.appendChild(cell);
    }
    container.appendChild(grid);
    
    // Materials
    if (this.craftingSystem && this.craftingSystem.materials) {
      const matLabel = document.createElement('div');
      matLabel.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.4);margin:16px 0 8px;letter-spacing:1px;text-transform:uppercase;';
      matLabel.textContent = 'Materials';
      container.appendChild(matLabel);
      const matGrid = document.createElement('div');
      matGrid.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;';
      const matIcons = { wood: '🪵', stone: '🪨', iron: '⚙️', crystal: '💠', gold: '🪙', leather: '🧶', herb: '🌿' };
      Object.entries(this.craftingSystem.materials).forEach(([mat, count]) => {
        const el = document.createElement('div');
        el.style.cssText = 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:6px;padding:6px 12px;font-size:12px;color:rgba(255,255,255,0.6);';
        el.textContent = (matIcons[mat] || '📦') + ' ' + mat + ': ' + count;
        matGrid.appendChild(el);
      });
      container.appendChild(matGrid);
    }
    
    panel.appendChild(container);
    panel.onclick = (e) => { if (e.target === panel) panel.remove(); };
    document.body.appendChild(panel);
  }



  _updateThreatIndicator(dt) {
    if (!this.camera || !window._npcController) return;
    const npcs = window._npcController.npcs;
    if (!npcs || !npcs.length) return;
    
    // Find nearest hostile NPC
    let nearestHostile = null;
    let nearestDist = Infinity;
    for (const npc of npcs) {
      if (npc.isDead || !npc.isAggro) continue;
      const d = this.position.distanceTo(npc.model.position);
      if (d < nearestDist && d < 50) { nearestDist = d; nearestHostile = npc; }
    }
    
    if (!nearestHostile) {
      if (this._threatArrow) this._threatArrow.style.display = 'none';
      return;
    }
    
    // Create arrow if needed
    if (!this._threatArrow) {
      this._threatArrow = document.createElement('div');
      this._threatArrow.style.cssText = 'position:fixed;width:24px;height:24px;z-index:9997;pointer-events:none;font-size:20px;text-align:center;filter:drop-shadow(0 0 4px rgba(255,50,50,0.6));';
      this._threatArrow.textContent = '⚠';
      document.body.appendChild(this._threatArrow);
    }
    
    // Project NPC position to screen
    const npcScreen = nearestHostile.model.position.clone();
    npcScreen.y += 1;
    npcScreen.project(this.camera);
    
    const hw = window.innerWidth / 2;
    const hh = window.innerHeight / 2;
    const sx = npcScreen.x * hw + hw;
    const sy = -npcScreen.y * hh + hh;
    
    // If on screen and close, hide indicator
    if (npcScreen.z < 1 && sx > 50 && sx < window.innerWidth - 50 && sy > 50 && sy < window.innerHeight - 50) {
      this._threatArrow.style.display = 'none';
      return;
    }
    
    // Position at edge of screen pointing toward enemy
    const angle = Math.atan2(sy - hh, sx - hw);
    const edgeX = hw + Math.cos(angle) * (hw - 40);
    const edgeY = hh + Math.sin(angle) * (hh - 40);
    
    this._threatArrow.style.display = 'block';
    this._threatArrow.style.left = edgeX + 'px';
    this._threatArrow.style.top = edgeY + 'px';
    this._threatArrow.style.transform = 'translate(-50%,-50%) rotate(' + (angle + Math.PI/2) + 'rad)';
    this._threatArrow.style.opacity = Math.max(0.3, 1 - nearestDist / 50);
  }

  _createSprintDust() {
    if (!this.scene || !this.model) return;
    const pos = this.position.clone();
    pos.y += 0.1;
    
    const geo = new THREE.BufferGeometry();
    const count = 5;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i*3] = pos.x + (Math.random()-0.5)*0.3;
      positions[i*3+1] = pos.y + Math.random()*0.2;
      positions[i*3+2] = pos.z + (Math.random()-0.5)*0.3;
      sizes[i] = 0.1 + Math.random()*0.15;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    const mat = new THREE.PointsMaterial({ color: 0x998866, size: 0.15, transparent: true, opacity: 0.4, sizeAttenuation: true, depthWrite: false });
    const dust = new THREE.Points(geo, mat);
    this.scene.add(dust);
    
    // Fade out and rise
    let life = 0;
    const animate = () => {
      life += 0.016;
      mat.opacity = 0.4 * (1 - life / 0.5);
      const posArr = geo.attributes.position.array;
      for (let i = 0; i < count; i++) {
        posArr[i*3+1] += 0.02;
        posArr[i*3] += (Math.random()-0.5)*0.01;
        posArr[i*3+2] += (Math.random()-0.5)*0.01;
      }
      geo.attributes.position.needsUpdate = true;
      if (life < 0.5) requestAnimationFrame(animate);
      else { this.scene.remove(dust); geo.dispose(); mat.dispose(); }
    };
    requestAnimationFrame(animate);
  }

  respawn() {
    this.health = this.maxHealth;
    this.isInvincible = true;
    setTimeout(() => { this.isInvincible = false; }, 3000); // 3s spawn protection
    this.stamina = this.maxStamina;
    this.position.set(0, 0, 0);
    if (this.model) this.model.position.set(0, 0, 0);
  }
  
  setSpeed(type, value) {
    if (type === 'walk') this.walkSpeed = value;
    else if (type === 'run') this.runSpeed = value;
    else if (type === 'sprint') this.sprintSpeed = value;
    return '✓ ' + type + ' speed set to ' + value;
  }

  _showDialogue(npc, lines) {
    // Use DialogueSystem for rich NPC dialogue with choices
    if (this.dialogueSystem) {
      const npcType = (npc.type || 'villager').toLowerCase();
      const questLines = NPCController.DIALOGUE_BANK[npcType]?.quests || [];
      const tradeLines = NPCController.DIALOGUE_BANK[npcType]?.trade || [];
      const hasQuest = questLines.length > 0;
      const hasTrade = tradeLines.length > 0;
      
      // Build dialogue with choices
      const dialogueLines = [...lines.map(l => l)];
      
      // Add choice node at the end
      const choices = [];
      if (hasQuest) choices.push({ label: '📜 Do you have any work for me?', action: () => {
        const questLine = questLines[Math.floor(Math.random() * questLines.length)];
        // Auto-generate a quest from dialogue
        if (window.questSystem) {
          const questTypes = ['kill', 'collect', 'explore'];
          const qType = questTypes[Math.floor(Math.random() * questTypes.length)];
          window.questSystem.addQuest({
            id: 'npc_quest_' + Date.now(),
            title: questLine.substring(0, 40) + '...',
            description: questLine,
            type: qType,
            target: qType,
            targetCount: 3 + Math.floor(Math.random() * 5),
            reward: (50 + Math.floor(Math.random() * 200)) + ' gold'
          });
        }
        this.dialogueSystem.start({ speaker: npc.type || 'NPC', lines: [questLine, 'Good luck out there! Come back when it\'s done.'] });
      }});
      if (hasTrade) choices.push({ label: '🛒 Show me what you have', action: () => {
        const tradeLine = tradeLines[Math.floor(Math.random() * tradeLines.length)];
        this.dialogueSystem.start({ speaker: npc.type || 'NPC', lines: [tradeLine] });
      }});
      choices.push({ label: '👋 Farewell', action: () => {} });
      
      if (choices.length > 1) {
        dialogueLines.push({ text: 'Is there something you need from me?', choices: choices });
      }
      
      this.dialogueSystem.start({ speaker: (npc.type || 'NPC').charAt(0).toUpperCase() + (npc.type || 'npc').slice(1), lines: dialogueLines });
    } else {
      // Fallback: simple div
      const old2 = document.getElementById('npc-dialogue');
      if (old2) old2.remove();
      const div = document.createElement('div');
      div.id = 'npc-dialogue';
      div.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);max-width:500px;width:90%;background:rgba(0,0,0,0.9);border:1px solid #ff6b35;border-radius:12px;padding:16px;z-index:10000;font-family:monospace;color:#e0e0e0;';
      div.textContent = lines.join(' ');
      document.body.appendChild(div);
      setTimeout(() => div.remove(), 6000);
    }
  }

}


// === MIXAMO ANIMATION LOADER ===
// Load animation from any GLB/FBX URL and apply to current character
CharacterController.prototype.loadAnimation = async function(url, animName) {
  if (!this.model) return '❌ No character loaded';
  
  try {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js');
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader.setDRACOLoader(draco);
    
    return new Promise((resolve, reject) => {
      loader.load(url, (gltf) => {
        if (!gltf.animations || gltf.animations.length === 0) {
          resolve('❌ No animations found in file');
          return;
        }
        
        for (const clip of gltf.animations) {
          const name = animName || clip.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
          // Retarget: try to match bone names
          this.mixer.clipAction(clip, this.model).reset();
          this.animations[name] = clip;
          console.log('[Animation] Loaded: ' + name + ' (' + clip.duration.toFixed(1) + 's)');
        }
        
        resolve('✓ Loaded ' + gltf.animations.length + ' animation(s): ' + gltf.animations.map(c => c.name).join(', '));
      }, undefined, (err) => {
        reject('❌ Failed to load animation: ' + err.message);
      });
    });
  } catch(e) {
    return '❌ Animation load error: ' + e.message;
  }
};

// Common Mixamo animation URLs (free, hosted)
CharacterController.MIXAMO_ANIMS = {
  dance: 'Dancing',
  wave: 'Waving',
  clap: 'Clapping',
  sit: 'Sitting',
  crouch: 'Crouching',
  crawl: 'Crawling',
  climb: 'Climbing',
  swim: 'Swimming',
  punch: 'Punching',
  kick: 'Kicking',
};

export { WEAPON_DATABASE, createWeaponMesh, CharacterState, CharacterStateMachine, CharacterController, NPCState, NPCAIStateMachine };


// ═══════════════════════════════════════════════════
// NPC AI STATE MACHINE
// ═══════════════════════════════════════════════════

const NPCState = {
  IDLE: 'idle',
  PATROL: 'patrol',
  CHASE: 'chase',
  ATTACK: 'attack',
  FLEE: 'flee',
  DEAD: 'dead',
  STUNNED: 'stunned',
  RETURN: 'return',     // returning to patrol after losing player
  SEARCH: 'search',     // searching last known position
};

class NPCAIStateMachine {
  constructor(npc) {
    this.npc = npc;
    this.state = NPCState.IDLE;
    this.stateTime = 0;
    this.alertLevel = 0;          // 0-100, builds when player is nearby
    this.lastKnownPlayerPos = null;
    this.searchTimer = 0;
    this.fleeHealth = 0.2;       // flee at 20% HP
    this.aggroRange = 15;         // detection range
    this.attackRange = 2.5;       // melee range
    this.leashRange = 40;         // max chase distance from home
    this.searchDuration = 5;      // seconds to search before giving up
  }
  
  update(dt, playerPos, distToPlayer) {
    this.stateTime += dt;
    const npc = this.npc;
    const healthPct = (npc.health || 100) / (npc.maxHealth || 100);
    
    switch (this.state) {
      case NPCState.IDLE:
        // Transition: player enters aggro range → CHASE
        if (npc.isAggro && distToPlayer < this.aggroRange) {
          this.alertLevel += dt * 30;
          if (this.alertLevel > 50) {
            this._transition(NPCState.CHASE);
            this.lastKnownPlayerPos = playerPos.clone();
          }
        } else {
          this.alertLevel = Math.max(0, this.alertLevel - dt * 10);
          // Transition to PATROL after idle time
          if (this.stateTime > 2 + Math.random() * 3) {
            this._transition(NPCState.PATROL);
          }
        }
        break;
        
      case NPCState.PATROL:
        // Transition: player enters aggro range → CHASE
        if (npc.isAggro && distToPlayer < this.aggroRange) {
          this.alertLevel += dt * 40;
          if (this.alertLevel > 30) {
            this._transition(NPCState.CHASE);
            this.lastKnownPlayerPos = playerPos.clone();
          }
        }
        // Transition: arrived at waypoint → IDLE
        if (npc.waypoint) {
          const d = npc.model.position.distanceTo(npc.waypoint);
          if (d < 1.5) this._transition(NPCState.IDLE);
        }
        break;
        
      case NPCState.CHASE:
        this.lastKnownPlayerPos = playerPos.clone();
        
        // Transition: low health → FLEE
        if (healthPct < this.fleeHealth) {
          this._transition(NPCState.FLEE);
          break;
        }
        // Transition: in attack range → ATTACK
        if (distToPlayer < (npc.isRanged ? 20 : this.attackRange)) {
          this._transition(NPCState.ATTACK);
          break;
        }
        // Transition: too far from home → RETURN
        if (npc.homePosition) {
          const homeD = npc.model.position.distanceTo(npc.homePosition);
          if (homeD > this.leashRange) {
            this._transition(NPCState.RETURN);
            break;
          }
        }
        // Transition: lost sight (player too far) → SEARCH
        if (distToPlayer > this.aggroRange * 2) {
          this._transition(NPCState.SEARCH);
        }
        break;
        
      case NPCState.ATTACK:
        // Transition: player out of range → CHASE
        const atkRange = npc.isRanged ? 22 : this.attackRange + 1;
        if (distToPlayer > atkRange) {
          this._transition(NPCState.CHASE);
        }
        // Transition: low health → FLEE
        if (healthPct < this.fleeHealth) {
          this._transition(NPCState.FLEE);
        }
        break;
        
      case NPCState.FLEE:
        // Flee for 3-5 seconds then try to return
        if (this.stateTime > 3 + Math.random() * 2) {
          if (healthPct > this.fleeHealth + 0.1) {
            this._transition(NPCState.RETURN);
          }
        }
        // If player is very far, go back to patrol
        if (distToPlayer > this.leashRange) {
          this._transition(NPCState.RETURN);
        }
        break;
        
      case NPCState.SEARCH:
        this.searchTimer += dt;
        // Look around last known position
        if (distToPlayer < this.aggroRange) {
          // Found player again!
          this._transition(NPCState.CHASE);
          break;
        }
        if (this.searchTimer > this.searchDuration) {
          this._transition(NPCState.RETURN);
        }
        break;
        
      case NPCState.RETURN:
        if (npc.homePosition) {
          const d = npc.model.position.distanceTo(npc.homePosition);
          if (d < 3) {
            this.alertLevel = 0;
            this._transition(NPCState.IDLE);
          }
        } else {
          this._transition(NPCState.IDLE);
        }
        // Re-aggro if player comes close during return
        if (npc.isAggro && distToPlayer < this.aggroRange * 0.7) {
          this._transition(NPCState.CHASE);
        }
        break;
        
      case NPCState.DEAD:
        break; // permanent
        
      case NPCState.STUNNED:
        if (this.stateTime > 1.5) {
          this._transition(NPCState.CHASE); // recover and re-engage
        }
        break;
    }
  }
  
  _transition(newState) {
    if (this.state === NPCState.DEAD) return; // can't leave dead
    this.state = newState;
    this.stateTime = 0;
    if (newState === NPCState.SEARCH) this.searchTimer = 0;
  }
  
  die() {
    this._transition(NPCState.DEAD);
  }
  
  stun() {
    if (this.state !== NPCState.DEAD) {
      this._transition(NPCState.STUNNED);
    }
  }
  
  get isChasing() { return this.state === NPCState.CHASE; }
  get isAttacking() { return this.state === NPCState.ATTACK; }
  get isFleeing() { return this.state === NPCState.FLEE; }
  get isSearching() { return this.state === NPCState.SEARCH; }
}


export class NPCController {

  // === AI DIALOGUE BANK ===
  // Rich, contextual dialogue for NPCs based on their type/role
  static DIALOGUE_BANK = {
    villager: {
      greetings: [
        "Well met, traveler! These roads can be dangerous.",
        "Haven't seen a new face around here in ages!",
        "Welcome to our humble village. Watch out for wolves at night.",
        "Ah, another adventurer! The tavern's got warm ale if you need it.",
        "Morning! The crops are coming in nicely this season.",
        "Be careful near the old ruins to the east. Strange lights at night.",
        "The blacksmith's been looking for someone brave. Maybe talk to him?",
        "My grandmother says a dragon used to live in those mountains...",
      ],
      quests: [
        "Could you help me? Wolves have been stealing my chickens at night.",
        "I lost my wedding ring somewhere near the river. I'd pay well for its return.",
        "The merchant's caravan is overdue. Something may have happened on the road.",
        "Strange mushrooms are growing in my cellar. Can you investigate?",
        "My son went to explore the caves three days ago. He hasn't returned...",
      ],
      trade: [
        "I've got fresh bread, cheese, and some herbs if you need supplies.",
        "Not much to sell, but I can spare some rope and torches.",
        "I found this old map in my attic. Might be worth something to you.",
      ],
      farewell: [
        "Safe travels, friend!", "May the road rise to meet you!",
        "Come back anytime!", "Watch your back out there!",
        "Good luck on your journey!", "Stay safe, traveler!",
      ],
    },
    merchant: {
      greetings: [
        "Welcome, welcome! Best prices in the realm!",
        "Ah, a customer! Come, see my wares!",
        "Looking to buy or sell? I deal in everything!",
        "Step right up! Enchanted items, rare potions, exotic goods!",
        "You look like someone who appreciates quality merchandise.",
      ],
      trade: [
        "I've got health potions, half off today only!",
        "This enchanted blade was forged by elven smiths. A steal at this price!",
        "Rare armor from the northern kingdoms. Interested?",
        "Maps, scrolls, spell components — name your need!",
        "I'll buy any loot you've found. Fair prices, I promise!",
        "This amulet? Protects against dark magic. Very useful in dungeons.",
      ],
      haggle: [
        "You drive a hard bargain! Fine, I'll lower the price a bit.",
        "That's my final offer. Take it or leave it, friend.",
        "For you? Special discount. But don't tell anyone!",
      ],
      farewell: [
        "Come back when your pockets are full!", "Pleasure doing business!",
        "Tell your friends about my shop!", "May profit find us both!",
      ],
    },
    guard: {
      greetings: [
        "Halt! State your business, traveler.",
        "Keep your weapons sheathed within the walls.",
        "Another adventurer... just don't cause trouble.",
        "The city gates close at sundown. Don't be late.",
        "I used to be an adventurer like you... then I took this job.",
      ],
      info: [
        "Bandits have been spotted on the northern road. Travel with caution.",
        "The king's tournament begins next week. Warriors from all lands are coming.",
        "There's a bounty on the dragon terrorizing the eastern villages.",
        "The sewers beneath the city? Stay out. Monsters down there.",
        "The old wizard in the tower might have work for someone like you.",
      ],
      warning: [
        "No fighting in the streets! Take it outside the walls.",
        "I've got my eye on you, adventurer.",
        "The jail's got room for troublemakers. Just saying.",
      ],
    },
    wizard: {
      greetings: [
        "Ah, I sensed your arrival. The stars foretold it.",
        "Welcome, young one. You carry an interesting aura...",
        "Few dare to seek me out. You must need something important.",
        "The arcane arts are not for the faint of heart. But you seem... capable.",
      ],
      quests: [
        "I need rare ingredients: moonstone, dragon scale, and phoenix feather.",
        "An ancient spell book was stolen. Retrieve it from the thieves' guild.",
        "A dark portal has opened in the forest. It must be sealed.",
        "My apprentice has gone rogue. Find them before they cause harm.",
        "The crystal in the mountain is losing power. It must be recharged.",
      ],
      lore: [
        "Long ago, this land was ruled by elemental titans. Their power still lingers.",
        "The ancient prophecy speaks of one who will unite the shattered realms.",
        "Magic flows through ley lines beneath the earth. The nexus points hold great power.",
        "Beware the shadow realm. Those who enter rarely return unchanged.",
      ],
      farewell: [
        "The stars will guide your path.", "May wisdom light your way.",
        "Return when you seek knowledge.", "The arcane watches over you.",
      ],
    },
    blacksmith: {
      greetings: [
        "*CLANG CLANG* Oh! Didn't see you there. What do you need?",
        "Looking for weapons? Armor? I forge the finest in the land!",
        "Step up to the anvil, friend. What can I hammer out for you?",
        "My blades have slain dragons. Well... so the owners claim.",
      ],
      trade: [
        "Iron sword? 50 gold. Steel? 150. Enchanted? We'll talk.",
        "This shield can stop a troll's club. Tested it myself!",
        "Need repairs? Bring your gear. I'll make it good as new.",
        "I can reinforce your armor. Won't be cheap, but you'll thank me.",
      ],
      quests: [
        "I need rare ore from the abandoned mine. Too dangerous for me alone.",
        "Bring me a dragon's fang and I'll forge you a legendary weapon.",
        "The old forge in the mountains... if you could bring back its fire crystal...",
      ],
    },
    innkeeper: {
      greetings: [
        "Welcome to my humble inn! Ale, food, or a room?",
        "Come in, come in! You look like you could use a warm meal.",
        "Traveler! Best stew in the kingdom, right here.",
        "A room for the night? 10 gold. Includes breakfast!",
      ],
      rumors: [
        "I heard the king's treasure was stolen last week. Guards everywhere.",
        "A stranger in a dark cloak was asking about ancient artifacts...",
        "The bards are singing about a hero who slew the mountain beast.",
        "Ships from the east brought strange goods. And stranger tales.",
        "They say the old cemetery glows blue on moonless nights...",
      ],
    },
    enemy: {
      taunt: [
        "You dare challenge me?! Prepare to fall!",
        "Your bones will decorate my throne!",
        "Foolish mortal! You know not what you face!",
        "Another hero come to die? How boring.",
        "I've crushed armies. You'll be a warm-up.",
      ],
      defeated: [
        "Impossible... how could I lose to...",
        "This isn't... over... *collapses*",
        "You're... stronger than I expected...",
        "My master... will avenge me...",
      ],
    },
  };

  // Get contextual dialogue based on NPC type and interaction
  static getDialogue(npcName, interactionType = 'greetings') {
    // Determine NPC type from name
    const name = (npcName || '').toLowerCase();
    let type = 'villager'; // default
    
    if (name.includes('merchant') || name.includes('trader') || name.includes('vendor') || name.includes('shop')) type = 'merchant';
    else if (name.includes('guard') || name.includes('soldier') || name.includes('knight') || name.includes('warrior')) type = 'guard';
    else if (name.includes('wizard') || name.includes('mage') || name.includes('sorcerer') || name.includes('witch')) type = 'wizard';
    else if (name.includes('blacksmith') || name.includes('smith') || name.includes('forge')) type = 'blacksmith';
    else if (name.includes('innkeeper') || name.includes('bartender') || name.includes('tavern')) type = 'innkeeper';
    else if (name.includes('enemy') || name.includes('goblin') || name.includes('orc') || name.includes('skeleton') || name.includes('demon') || name.includes('boss')) type = 'enemy';
    
    const bank = NPCController.DIALOGUE_BANK[type] || NPCController.DIALOGUE_BANK.villager;
    
    // Pick random lines from the appropriate category
    let category = bank[interactionType] || bank.greetings || bank.taunt || [];
    if (!category.length) category = Object.values(bank).flat();
    
    // Pick 2-4 random lines
    const shuffled = [...category].sort(() => Math.random() - 0.5);
    const lineCount = Math.min(shuffled.length, 2 + Math.floor(Math.random() * 3));
    return shuffled.slice(0, lineCount);
  }

  constructor(scene, camera, objects, characterController) {
    this.scene = scene;
    this.objects = objects;
    this.camera = camera;
    this.characterController = characterController;
    this.npcs = [];
  }
  
  async spawnNPC(type, x, z, behavior = 'wander') {
    // Quaternius animated character models — each has 11 built-in animations!
    // (Walk, Run, Idle, Jump, Punch, Death, SwordSlash, Clapping, Sitting, Standing, RunningJump)
    const npcModelsMen = [
      'smooth_male_casual', 'smooth_male_longsleeve', 'smooth_male_shirt', 'smooth_male_suit',
      'male_casual', 'male_longsleeve', 'male_shirt', 'male_suit', 'animated_human'
    ];
    const npcModelsWomen = [
      'smooth_female_casual', 'smooth_female_dress', 'smooth_female_tanktop', 'smooth_female_alternative',
      'female_casual', 'female_dress', 'female_tanktop', 'female_alternative',
      'animated_woman_smooth', 'animated_woman'
    ];
    const allNpcModels = [...npcModelsMen, ...npcModelsWomen];
    
    let file;
    if (type === 'woman' || type === 'female' || type === 'girl') {
      file = 'npcs/' + npcModelsWomen[Math.floor(Math.random() * npcModelsWomen.length)];
    } else if (type === 'man' || type === 'male' || type === 'guy') {
      file = 'npcs/' + npcModelsMen[Math.floor(Math.random() * npcModelsMen.length)];
    } else {
      file = 'npcs/' + allNpcModels[Math.floor(Math.random() * allNpcModels.length)];
    }
    
    return new Promise(resolve => {
      loader.load('models/' + file + '.glb', (gltf) => {
        const model = gltf.scene;
        // Auto-scale NPC to human height
        const npcBox = new THREE.Box3().setFromObject(model);
        const npcSize = npcBox.getSize(new THREE.Vector3());
        const npcMaxDim = Math.max(npcSize.x, npcSize.y, npcSize.z);
        model.scale.setScalar(1.8 / Math.max(npcMaxDim, 0.001));
        // Ground the model — calculate groundOffset once
        const npcBox2 = new THREE.Box3().setFromObject(model);
        const _npcGroundOffset = -npcBox2.min.y; // Distance from origin to feet
        const _npcTerrainY = _getTerrainY(x, z);
        model.position.set(x, _npcTerrainY + _npcGroundOffset + 0.05, z);
        model.castShadow = true;
        model.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        this.scene.add(model);
        this.objects.push(model);
        model.userData.name = 'npc_' + type;
        model.userData.isNPC = true;
        
        model.userData.groundOffset = _npcGroundOffset;
        const npc = {
          model, type, behavior,
          mixer: null, animations: {},
          waypoint: new THREE.Vector3(x, _npcTerrainY, z),
          speed: 2 + Math.random() * 2,
          waitTime: 0,
          direction: Math.random() * Math.PI * 2,
          health: 100,
          maxHealth: 100,
          isDead: false,
          isAggro: false,
          aggroTarget: null,
          aggroRange: 15,
          attackRange: 2.5,
          attackCooldown: 2,
          attackDamage: 3,
          healthBar: null,
        };
        
        // Create floating health bar
        npc.healthBar = this._createHealthBar();
        model.add(npc.healthBar);
        
        // Setup animations — load from model or shared animation source
        const hasAnims = gltf.animations.length > 0;
        if (!hasAnims) {
          // No embedded animations — replace with Soldier model (has Mixamo walk/idle/run)
          console.log('[NPC] Replacing with Soldier model for', type);
          const soldierFile = 'models/anim_idle.glb';
          const _loader = window._gltfLoader || loader;
          _loader.load(soldierFile, (soldierGltf) => {
            if (!soldierGltf.animations || soldierGltf.animations.length === 0) return;
            
            // Replace KayKit mesh with Soldier mesh (same skeleton = perfect animation)
            const soldierScene = soldierGltf.scene;
            // Remove old children from model group
            while (model.children.length > 0) model.remove(model.children[0]);
            // Add Soldier children
            while (soldierScene.children.length > 0) {
              const child = soldierScene.children[0];
              soldierScene.remove(child);
              model.add(child);
            }
            
            // Animations work directly — no retargeting needed
            npc.mixer = new THREE.AnimationMixer(model);
            soldierGltf.animations.forEach(clip => {
              const name = clip.name.toLowerCase();
              if (name === 'tpose') return;
              const action = npc.mixer.clipAction(clip);
              if (name === 'idle') npc.animations.idle = action;
              else if (name === 'walk' || name === 'walking') npc.animations.walk = action;
              else if (name === 'run' || name === 'running') npc.animations.run = action;
            });
            
            // Play animation
            if (npc.behavior === 'wander' && npc.animations.walk) {
              npc.animations.walk.play();
              npc.currentAnim = 'walk';
            } else if (npc.animations.idle) {
              npc.animations.idle.play();
              npc.currentAnim = 'idle';
            }
            npc.proceduralAnim = false;
            console.log('[NPC] Soldier model loaded, anims:', Object.keys(npc.animations).join(', '));
          }, null, (e) => console.warn('[NPC] Failed to load Soldier model:', e));
        }
        if (gltf.animations.length > 0) {
          npc.mixer = new THREE.AnimationMixer(model);
          gltf.animations.forEach(clip => {
            let name = clip.name.toLowerCase();
            if (name.includes('walk')) { npc.animations.walk = npc.mixer.clipAction(clip); }
            else if (name.includes('idle') && !name.includes('sword')) { npc.animations.idle = npc.mixer.clipAction(clip); }
            else if (name.includes('run')) { npc.animations.run = npc.mixer.clipAction(clip); }
            else if (name.includes('attack') || name.includes('slash') || name.includes('sword') || name.includes('punch')) { npc.animations.attack = npc.mixer.clipAction(clip); }
          });
          if (npc.animations.idle) npc.animations.idle.play();
          else if (npc.animations.walk) npc.animations.walk.play();
        }
        
        // Procedural animation fallback for models without embedded anims
        if (!npc.animations.idle && !npc.animations.walk) {
          npc.proceduralAnim = true;
          npc.animTime = Math.random() * 10; // Random phase offset
          npc.bones = {};
          model.traverse(node => {
            if (node.isBone || node.type === 'Bone') {
              const n = node.name.toLowerCase();
              const nm = node.name; // original case for .L/.R matching
              if (n.includes('hips') && !npc.bones.hips) npc.bones.hips = node;
              else if (n.includes('spine') && !n.includes('1') && !n.includes('2') && !npc.bones.spine) npc.bones.spine = node;
              else if ((n.includes('leftupperleg') || n.includes('leftupleg') || nm === 'UpperLeg.L' || (n.includes('upperleg') && n.includes('.l'))) && !npc.bones.leftLeg) npc.bones.leftLeg = node;
              else if ((n.includes('rightupperleg') || n.includes('rightupleg') || nm === 'UpperLeg.R' || (n.includes('upperleg') && n.includes('.r'))) && !npc.bones.rightLeg) npc.bones.rightLeg = node;
              else if ((n.includes('leftlowerleg') || n.includes('leftleg') || nm === 'LowerLeg.L' || (n.includes('lowerleg') && n.includes('.l'))) && !npc.bones.leftKnee) npc.bones.leftKnee = node;
              else if ((n.includes('rightlowerleg') || n.includes('rightleg') || nm === 'LowerLeg.R' || (n.includes('lowerleg') && n.includes('.r'))) && !npc.bones.rightKnee) npc.bones.rightKnee = node;
              else if ((n.includes('leftarm') || nm === 'UpperArm.L' || (n.includes('upperarm') && n.includes('.l'))) && !n.includes('fore') && !n.includes('lower') && !npc.bones.leftArm) npc.bones.leftArm = node;
              else if ((n.includes('rightarm') || nm === 'UpperArm.R' || (n.includes('upperarm') && n.includes('.r'))) && !n.includes('fore') && !n.includes('lower') && !npc.bones.rightArm) npc.bones.rightArm = node;
              else if ((n.includes('leftforearm') || nm === 'LowerArm.L' || (n.includes('lowerarm') && n.includes('.l'))) && !npc.bones.leftForearm) npc.bones.leftForearm = node;
              else if ((n.includes('rightforearm') || nm === 'LowerArm.R' || (n.includes('lowerarm') && n.includes('.r'))) && !npc.bones.rightForearm) npc.bones.rightForearm = node;
              else if (n.includes('head') && !n.includes('top') && !n.includes('eye') && !n.includes('_end') && !npc.bones.head) npc.bones.head = node;
              else if (n.includes('neck') && !npc.bones.neck) npc.bones.neck = node;
            }
          });
          // Save original bone rotations & fix T-pose immediately
          Object.values(npc.bones).forEach(bone => {
            if (bone) bone.userData.origRot = { x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z };
          });
          // Arms down immediately — no T-pose on spawn
          if (npc.bones.leftArm) npc.bones.leftArm.rotation.z = 0.15;
          if (npc.bones.rightArm) npc.bones.rightArm.rotation.z = -0.15;
          if (npc.bones.leftForearm) npc.bones.leftForearm.rotation.x = -0.12;
          if (npc.bones.rightForearm) npc.bones.rightForearm.rotation.x = -0.12;
        }
        
        // Give NPC a weapon
        const weaponTypes = ['sword', 'axe', 'spear', 'rifle', 'pistol'];
        const npcWeapon = weaponTypes[Math.floor(Math.random() * weaponTypes.length)];
        npc.weaponType = npcWeapon;
        npc.isRanged = (npcWeapon === 'rifle' || npcWeapon === 'pistol');
        npc.attackRange = npc.isRanged ? 20 : 2.5;
        npc.attackCooldown = npc.isRanged ? 1.5 : 2;
        npc._attackTimer = 0;
        
        // Create weapon mesh and attach to hand
        let weaponMesh;
        if (npcWeapon === 'sword') {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.02), new THREE.MeshStandardMaterial({color: 0xaaaacc, metalness: 0.8, roughness: 0.2}));
          const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.04), new THREE.MeshStandardMaterial({color: 0x553311}));
          weaponMesh = new THREE.Group();
          blade.position.y = 0.35; hilt.position.y = 0;
          weaponMesh.add(blade); weaponMesh.add(hilt);
        } else if (npcWeapon === 'axe') {
          const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5), new THREE.MeshStandardMaterial({color: 0x664422}));
          const head = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.03), new THREE.MeshStandardMaterial({color: 0x888899, metalness: 0.7}));
          weaponMesh = new THREE.Group();
          handle.position.y = 0.2; head.position.set(0.05, 0.45, 0);
          weaponMesh.add(handle); weaponMesh.add(head);
        } else if (npcWeapon === 'spear') {
          const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9), new THREE.MeshStandardMaterial({color: 0x664422}));
          const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), new THREE.MeshStandardMaterial({color: 0xccccdd, metalness: 0.8}));
          weaponMesh = new THREE.Group();
          shaft.position.y = 0.4; tip.position.y = 0.9;
          weaponMesh.add(shaft); weaponMesh.add(tip);
        } else if (npcWeapon === 'rifle') {
          const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5), new THREE.MeshStandardMaterial({color: 0x333333}));
          const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.25), new THREE.MeshStandardMaterial({color: 0x553311}));
          weaponMesh = new THREE.Group();
          barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.3;
          stock.position.z = 0.05;
          weaponMesh.add(barrel); weaponMesh.add(stock);
        } else { // pistol
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.12), new THREE.MeshStandardMaterial({color: 0x222222}));
          const grip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.07, 0.03), new THREE.MeshStandardMaterial({color: 0x333333}));
          weaponMesh = new THREE.Group();
          grip.position.y = -0.05; body.position.z = -0.03;
          weaponMesh.add(body); weaponMesh.add(grip);
        }
        
        // Attach to right hand bone
        if (npc.bones && npc.bones.rightForearm) {
          weaponMesh.position.set(0, -0.15, 0);
          npc.bones.rightForearm.add(weaponMesh);
        } else {
          // Fallback — attach to model
          weaponMesh.position.set(0.2, 0.5, 0);
          model.add(weaponMesh);
        }
        npc.weaponMesh = weaponMesh;
        
        npc.homePosition = npc.model.position.clone();
        npc.waitTime = 0; // Start moving immediately
        npc.ai = new NPCAIStateMachine(npc);
        this.npcs.push(npc);
        if (behavior === 'aggro') {
          npc.isAggro = true;
          npc.attackDamage = 2 + Math.floor(Math.random() * 3);
        }
        resolve('✓ NPC spawned: ' + type + ' at (' + x + ', ' + z + ')');
      });
    });
  }
  

  // === WEAPON SYSTEM METHODS ===
  
  equipWeapon(weaponId, slot = -1) {
    const data = WEAPON_DATABASE[weaponId];
    if (!data) return 'Unknown weapon: ' + weaponId;
    
    // Find available slot or use specified
    if (slot < 0) {
      slot = this.weaponSlots.indexOf(null);
      if (slot < 0) slot = this.activeSlot;
    }
    
    // Remove old weapon from slot
    if (this.weaponSlots[slot]) {
      this._removeWeaponMesh(slot);
    }
    
    this.weaponSlots[slot] = weaponId;
    
    // Initialize ammo for ranged
    if (data.type === 'ranged' && this.ammo[weaponId] === undefined) {
      this.ammo[weaponId] = data.magSize;
    }
    
    // ALWAYS holster on back first — player draws with key press
    this._attachWeaponToBack(weaponId);
    this.weaponDrawn = false;
    
    this.equippedWeapon = this.weaponSlots[this.activeSlot];
    return '⚔️ ' + data.name + ' equipped on back — press 1 to draw';
  }
  
  // Draw weapon from back to hands (two-handed grip)
  drawWeapon() {
    const weaponId = this.weaponSlots[this.activeSlot];
    if (!weaponId) return 'No weapon equipped';
    if (this.weaponDrawn) return 'Weapon already drawn';
    
    this._removeFromBack();
    this._attachWeaponToHand(weaponId);
    this.weaponDrawn = true;
    
    const data = WEAPON_DATABASE[weaponId];
    return '⚔️ Drew ' + (data?.name || weaponId) + ' — ready to fight!';
  }
  
  // Sheathe weapon back to back
  sheatheWeapon() {
    const weaponId = this.weaponSlots[this.activeSlot];
    if (!weaponId) return 'No weapon equipped';
    if (!this.weaponDrawn) return 'Weapon already sheathed';
    
    this._removeFromHand();
    this._attachWeaponToBack(weaponId);
    this.weaponDrawn = false;
    
    const data = WEAPON_DATABASE[weaponId];
    return '🔙 Sheathed ' + (data?.name || weaponId);
  }
  
  // Toggle draw/sheathe
  toggleWeapon() {
    if (this.weaponDrawn) return this.sheatheWeapon();
    return this.drawWeapon();
  }
  
  unequipWeapon(slot = -1) {
    if (slot < 0) slot = this.activeSlot;
    const weaponId = this.weaponSlots[slot];
    if (!weaponId) return 'No weapon in slot ' + (slot + 1);
    
    this._removeWeaponMesh(slot);
    this._removeFromBack();
    this._removeFromHand();
    this.weaponSlots[slot] = null;
    this.equippedWeapon = this.weaponSlots[this.activeSlot];
    this.weaponDrawn = false;
    
    return '🗑️ Unequipped ' + (WEAPON_DATABASE[weaponId]?.name || weaponId);
  }
  
  swapToSlot(slot) {
    if (slot === this.activeSlot) return;
    if (slot < 0 || slot > 2) return;
    
    // Holster current weapon
    const currentId = this.weaponSlots[this.activeSlot];
    if (currentId && this.equippedWeaponMesh) {
      this._removeFromHand();
      this._attachWeaponToHolster(currentId, this.activeSlot);
    }
    
    this.activeSlot = slot;
    
    // Draw new weapon
    const newId = this.weaponSlots[slot];
    if (newId) {
      // Remove from holster
      if (this.holsteredMeshes[slot]) {
        this.holsteredMeshes[slot].parent?.remove(this.holsteredMeshes[slot]);
        delete this.holsteredMeshes[slot];
      }
      this._attachWeaponToHand(newId);
    } else {
      this.equippedWeaponMesh = null;
    }
    
    this.equippedWeapon = this.weaponSlots[this.activeSlot];
    this.currentSpread = 0;
    this.comboIndex = 0;
  }
  
  _attachWeaponToHand(weaponId) {
    const data = WEAPON_DATABASE[weaponId];
    if (!data) return;
    
    // Remove existing hand weapon
    this._removeFromHand();
    
    const mesh = createWeaponMesh(weaponId);
    if (!mesh) return;
    
    const bone = this.sockets.hand_r || this.sockets.forearm_r;
    if (bone) {
      // Scale weapon correctly — compensate for bone's world scale
      // Bones have massive internal scale (e.g. 32x). Calculate local scale so
      // weapon appears ~40% of character height in world space.
      bone.updateWorldMatrix(true, false);
      const _bws = new THREE.Vector3();
      bone.getWorldScale(_bws);
      // Character ~0.58 world units tall, want sword ~0.25 world units
      // Weapon geometry is ~0.8 units total height
      // localScale = desiredWorldSize / (geometrySize * boneWorldScale)
      const _isRanged = data.type === 'ranged';
      const _desiredWorld = _isRanged ? 0.9 : 1.1; // Same as player weapon scale
      const _weaponGeoSize = 0.8; // approximate weapon geometry height
      const _localScale = _desiredWorld / (_weaponGeoSize * Math.max(_bws.x, 0.001));
      mesh.scale.setScalar(_localScale);
      // Hold offset must be in bone-local units (divide world-space offset by bone world scale)
      const _bsi = 1 / Math.max(_bws.x, 0.001);
      mesh.position.set(data.holdOffset.x * _bsi, data.holdOffset.y * _bsi, data.holdOffset.z * _bsi);
      mesh.rotation.set(data.holdRotation.x, data.holdRotation.y, data.holdRotation.z);
      bone.add(mesh);
    } else {
      // Fallback: attach to model
      mesh.position.set(0.25, 0.6, 0);
      this.model.add(mesh);
    }
    
    this.equippedWeaponMesh = mesh;
  }
  
  _attachWeaponToHolster(weaponId, slotIndex) {
    const data = WEAPON_DATABASE[weaponId];
    if (!data) return;
    
    const mesh = createWeaponMesh(weaponId);
    if (!mesh) return;
    
    const holsterBone = data.holsterBone === 'hip' 
      ? (this.sockets.hip_r || this.sockets.hip_l)
      : (this.sockets.back || this.sockets.forearm_r);
    
    if (holsterBone) {
      mesh.position.set(data.holsterOffset.x, data.holsterOffset.y, data.holsterOffset.z);
      mesh.rotation.set(data.holsterRotation.x, data.holsterRotation.y, data.holsterRotation.z);
      holsterBone.add(mesh);
    }
    
    this.holsteredMeshes[slotIndex] = mesh;
  }
  
  _removeFromHand() {
    if (this.equippedWeaponMesh) {
      this.equippedWeaponMesh.parent?.remove(this.equippedWeaponMesh);
      this.equippedWeaponMesh = null;
    }
  }
  
  _removeWeaponMesh(slot) {
    // Remove from hand if active
    if (slot === this.activeSlot) {
      this._removeFromHand();
    }
    // Remove from holster
    if (this.holsteredMeshes[slot]) {
      this.holsteredMeshes[slot].parent?.remove(this.holsteredMeshes[slot]);
      delete this.holsteredMeshes[slot];
    }
  }
  
  toggleShoulder() {
    this.shoulderSide *= -1;
    return '✓ Shoulder: ' + (this.shoulderSide > 0 ? 'Right' : 'Left');
  }
  
  startAim() {
    this.isAiming = true;
  }
  
  stopAim() {
    this.isAiming = false;
  }

  getWeaponData() {
    if (!this.equippedWeapon) return null;
    return WEAPON_DATABASE[this.equippedWeapon];
  }

    update(dt) {
    this._separateNPCs();
    for (const npc of this.npcs) {
      if (npc.mixer) npc.mixer.update(dt);
      
      // AI State Machine update
      if (npc.ai && !npc.isDead) {
        const playerPos = this.characterController ? this.characterController.position : new THREE.Vector3();
        const dist = npc.model.position.distanceTo(playerPos);
        npc.ai.update(dt, playerPos, dist);
      }
      
      // Procedural animation for NPCs without embedded animations
      if (npc.proceduralAnim && npc.bones) {
        npc.animTime += dt;
        const t = npc.animTime;
        const b = npc.bones;
        const L = THREE.MathUtils.lerp;
        const blend = 0.1;
        const distToWP = npc.waypoint ? npc.model.position.distanceTo(npc.waypoint) : 0;
        const isMoving = npc.behavior === 'wander' && distToWP > 1;
        
        // Helper
        const lb = (bone, axis, target) => { if (bone) bone.rotation[axis] = L(bone.rotation[axis], target, blend); };
        
        if (isMoving) {
          const freq = 6; const amp = 0.4;
          const phase = t * freq;
          lb(b.leftLeg, 'x', Math.sin(phase) * amp);
          lb(b.rightLeg, 'x', Math.sin(phase + Math.PI) * amp);
          lb(b.leftKnee, 'x', Math.max(0, -Math.sin(phase - 0.4)) * amp * 0.8);
          lb(b.rightKnee, 'x', Math.max(0, -Math.sin(phase + Math.PI - 0.4)) * amp * 0.8);
          lb(b.leftArm, 'x', Math.sin(phase + Math.PI) * amp * 0.7);
          lb(b.rightArm, 'x', Math.sin(phase) * amp * 0.7);
          lb(b.leftArm, 'z', 0.08);
          lb(b.rightArm, 'z', -0.08);
          lb(b.leftForearm, 'x', -0.3);
          lb(b.rightForearm, 'x', -0.3);
          lb(b.spine, 'y', Math.sin(phase) * 0.04);
        } else {
          // Idle — relaxed pose, breathing
          const breathe = Math.sin(t * 1.5);
          lb(b.leftLeg, 'x', 0);
          lb(b.rightLeg, 'x', 0);
          lb(b.leftKnee, 'x', 0.02);
          lb(b.rightKnee, 'x', 0.02);
          lb(b.leftArm, 'x', breathe * 0.02);
          lb(b.rightArm, 'x', -breathe * 0.015);
          lb(b.leftArm, 'z', 0.15);   // Arms at sides, NOT T-pose
          lb(b.rightArm, 'z', -0.15);  // Arms at sides, NOT T-pose
          lb(b.leftForearm, 'x', -0.12);
          lb(b.rightForearm, 'x', -0.12);
          lb(b.spine, 'x', breathe * 0.01);
          lb(b.head, 'y', Math.sin(t * 0.4 + npc.animTime) * 0.06);
        }
      }
      
      // === AI STATE-DRIVEN BEHAVIOR ===
      const aiState = npc.ai ? npc.ai.state : (npc.behavior === 'aggro' ? 'chase' : 'patrol');
      const playerPos = this.characterController ? this.characterController.position : new THREE.Vector3();
      const distToPlayer = npc.model.position.distanceTo(playerPos);
      
      // Helper: move NPC toward a target position
      const _moveToward = (target, speed) => {
        const dir = new THREE.Vector3().subVectors(target, npc.model.position);
        dir.y = 0;
        const dist = dir.length();
        if (dist < 1) return false; // arrived
        dir.normalize();
        npc.model.position.addScaledVector(dir, speed * dt);
        npc.model.rotation.y = Math.atan2(dir.x, dir.z);
        // Terrain snap (throttled — every 3rd frame per NPC)
        npc._groundFrame = ((npc._groundFrame || 0) + 1) % 3;
        const ty = npc._groundFrame === 0 ? _getTerrainY(npc.model.position.x, npc.model.position.z) : (npc._lastGroundY || 0);
        if (npc._groundFrame === 0) npc._lastGroundY = ty;
        if (ty > -0.1) {
          const go = npc.model.userData.groundOffset || 0;
          const targetY = ty + go;
          const dy = targetY - npc.model.position.y;
          npc.model.position.y += dy * (Math.abs(dy) < 2 ? (dy > 0 ? 0.2 : 0.3) : 1);
        }
        return true; // still moving
      };
      
      // Helper: play NPC animation if not already playing
      const _playAnim = (name) => {
        if (npc.currentAnim === name) return;
        Object.values(npc.animations).forEach(a => a && a.fadeOut(0.25));
        if (npc.animations[name]) { npc.animations[name].reset().fadeIn(0.25).play(); }
        npc.currentAnim = name;
      };
      
      // Helper: pick random waypoint near home
      const _pickWaypoint = (range) => {
        const home = npc.homePosition || npc.model.position.clone();
        let wx = home.x + (Math.random() - 0.5) * range;
        let wz = home.z + (Math.random() - 0.5) * range;
        // Snap to sidewalk — keep NPCs off the road center
        // Roads are at x=0 (main avenue), sidewalks at x=±5 to ±8
        // Cross streets at various z values, sidewalks at z offsets
        const roadHalfWidth = 4; // half of road width
        const sidewalkOffset = 6; // distance from road center to sidewalk
        // If near main avenue (x near 0), push to sidewalk
        if (Math.abs(wx) < roadHalfWidth) {
          wx = (wx >= 0 ? 1 : -1) * (sidewalkOffset + Math.random() * 2);
        }
        const wy = _getTerrainY(wx, wz);
        if (wy < -0.1) npc.waypoint.copy(home);
        else npc.waypoint.set(wx, wy, wz);
      };
      
      switch (aiState) {
        case 'idle':
          _playAnim('idle');
          npc.waitTime = (npc.waitTime || 0) - dt;
          if (npc.waitTime <= 0) {
            npc.waitTime = 3 + Math.random() * 5;
            _pickWaypoint(20);
          }
          break;
          
        case 'patrol':
          npc.waitTime = (npc.waitTime || 0) - dt;
          if (npc.waitTime <= 0) {
            npc.waitTime = 4 + Math.random() * 4;
            _pickWaypoint(20);
          }
          if (npc.waypoint && _moveToward(npc.waypoint, npc.speed)) {
            _playAnim('walk');
          } else {
            _playAnim('idle');
          }
          break;
          
        case 'chase':
          if (_moveToward(playerPos, npc.speed * 1.5)) {
            _playAnim(npc.animations.run ? 'run' : 'walk');
          }
          break;
          
        case 'attack':
          // Face player
          const toP = new THREE.Vector3().subVectors(playerPos, npc.model.position);
          npc.model.rotation.y = Math.atan2(toP.x, toP.z);
          npc.attackCooldown = Math.max(0, (npc.attackCooldown || 0) - dt);
          
          if (npc.attackCooldown <= 0) {
            npc.attackCooldown = npc.isRanged ? 1.5 + Math.random() : 1.2 + Math.random() * 0.8;
            _playAnim('attack');
            
            // Deal damage to player
            const player = this.characterController;
            if (player && typeof player.takeDamage === 'function') {
              const dmg = npc.attackDamage || 5;
              const result = player.takeDamage(dmg);
              if (typeof window._damageFlash === 'function') window._damageFlash();
              if (typeof window._floatingDamage === 'function') {
                window._floatingDamage(player.position || player.model?.position, dmg, false);
              }
              // Ranged tracer
              if (npc.isRanged && player.model) {
                const from = npc.model.position.clone(); from.y += 1;
                const to = (player.modelContainer || player.model).position.clone(); to.y += 1;
                this._createBulletTracer(from, to);
                this._muzzleFlash(npc.model.position, npc.model.rotation.y);
              }
              if (player.health <= 0 && typeof window._playerDeath === 'function') window._playerDeath();
            }
          } else {
            // Idle between attacks
            if (npc.currentAnim !== 'attack') _playAnim('idle');
          }
          break;
          
        case 'flee':
          // Run away from player
          const fleeDir = new THREE.Vector3().subVectors(npc.model.position, playerPos);
          fleeDir.y = 0;
          if (fleeDir.lengthSq() > 0.01) {
            fleeDir.normalize();
            const fleeTarget = npc.model.position.clone().addScaledVector(fleeDir, 10);
            _moveToward(fleeTarget, npc.speed * 2);
            _playAnim(npc.animations.run ? 'run' : 'walk');
          }
          break;
          
        case 'search':
          // Go to last known position, look around
          if (npc.ai && npc.ai.lastKnownPlayerPos) {
            if (_moveToward(npc.ai.lastKnownPlayerPos, npc.speed)) {
              _playAnim('walk');
            } else {
              _playAnim('idle');
              // Look around (slow rotation)
              npc.model.rotation.y += dt * 1.5;
            }
          } else {
            _playAnim('idle');
          }
          break;
          
        case 'return':
          // Walk back home
          if (npc.homePosition && _moveToward(npc.homePosition, npc.speed)) {
            _playAnim('walk');
          } else {
            _playAnim('idle');
          }
          break;
          
        case 'stunned':
          // Stagger: wobble rotation during stun
          if (npc.model) npc.model.rotation.y += Math.sin(Date.now() * 0.008) * 0.02;
          _playAnim('idle');
          break;
          
        case 'dead':
          _playAnim('death');
          break;
      }
    }
  }
  
  _createHealthBar() {
    const group = new THREE.Group();
    // Background
    const bgGeo = new THREE.PlaneGeometry(1.2, 0.12);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false });
    const bg = new THREE.Mesh(bgGeo, bgMat);
    bg.position.set(0, 2.2, 0);
    bg.renderOrder = 999;
    group.add(bg);
    // Fill
    const fillGeo = new THREE.PlaneGeometry(1.18, 0.1);
    const fillMat = new THREE.MeshBasicMaterial({ color: 0x44ff44, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.position.set(0, 2.2, 0.001);
    fill.renderOrder = 1000;
    fill.name = 'healthFill';
    group.add(fill);
    group.visible = false; // Hidden until damaged
    return group;
  }
  
  _createBulletTracer(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(0.01, 0.01, len);
    const mat = new THREE.MeshBasicMaterial({color: 0xffaa00, transparent: true, opacity: 0.8});
    const tracer = new THREE.Mesh(geo, mat);
    tracer.position.copy(from).add(dir.multiplyScalar(0.5));
    tracer.lookAt(to);
    tracer.rotateX(Math.PI / 2);
    this.scene.add(tracer);
    // Fade out
    setTimeout(() => { this.scene.remove(tracer); geo.dispose(); mat.dispose(); }, 100);
  }
  
  _muzzleFlash(pos, rotY) {
    const flash = new THREE.PointLight(0xffaa00, 5, 5);
    flash.position.set(pos.x + Math.sin(rotY) * 0.5, pos.y + 1.2, pos.z + Math.cos(rotY) * 0.5);
    this.scene.add(flash);
    setTimeout(() => this.scene.remove(flash), 80);
  }
  
  damageNPC(npc, amount, attackerPos) {
    if (npc.isDead) return;
    npc.health = Math.max(0, npc.health - amount);
    
    // Floating damage number
    if (typeof window._floatingDamage === 'function') {
      window._floatingDamage(npc.model.position, amount, amount >= 20);
    }
    
    // Show & update health bar
    if (npc.healthBar) {
      npc.healthBar.visible = true;
      const fill = npc.healthBar.getObjectByName('healthFill');
      if (fill) {
        const pct = npc.health / npc.maxHealth;
        fill.scale.x = Math.max(pct, 0.001);
        fill.position.x = -(1.18 * (1 - pct)) / 2;
        // Color: green → yellow → red
        if (pct > 0.5) fill.material.color.setHex(0x44ff44);
        else if (pct > 0.25) fill.material.color.setHex(0xffaa00);
        else fill.material.color.setHex(0xff2222);
      }
      // Billboard health bar toward camera
    }
    
    // Damage flash (red tint)
    npc.model.traverse(c => {
      if (c.isMesh && c.material) {
        const mat = c.material;
        if (!mat._origColor) mat._origColor = mat.color.clone();
        mat.color.set(0xff0000);
        setTimeout(() => { mat.color.copy(mat._origColor); }, 150);
      }
    });
    
    // Knockback
    if (attackerPos) {
      const kb = new THREE.Vector3().subVectors(npc.model.position, attackerPos).normalize().multiplyScalar(1.5);
      npc.model.position.add(kb);
    }
    
    // Stun on heavy attacks (30% chance on normal, 100% on heavy)
    if (npc.ai && amount >= 20) {
      npc.ai.stun();
    } else if (npc.ai && Math.random() < 0.15) {
      npc.ai.stun();
    }
    
    // Aggro on attacker
    npc.isAggro = true;
    npc.aggroTarget = attackerPos;
    npc.behavior = 'aggro';
    
    // Death
    if (npc.health <= 0) {
      npc.isDead = true;
      if (npc.mixer) npc.mixer.stopAllAction();
      if (npc.healthBar) npc.healthBar.visible = false;
      this._dropLoot(npc);
      // Play death animation, then fade out
      if (npc.animations.death) {
        const deathAction = npc.animations.death;
        deathAction.reset();
        deathAction.setLoop(THREE.LoopOnce, 1);
        deathAction.clampWhenFinished = true;
        deathAction.play();
      } else {
        // Fallback: tip over
        npc._deathTilt = true;
      }
      // Fade out after 2s, remove after 3s
      setTimeout(() => {
        npc.model.traverse(c => {
          if (c.isMesh && c.material) {
            c.material.transparent = true;
            c.material.opacity = 0.5;
          }
        });
      }, 2000);
      setTimeout(() => {
        this.scene.remove(npc.model);
        this.npcs = this.npcs.filter(n => n !== npc);
      }, 3000);
      return true; // killed
    }
    return false;
  }
  
  _dropLoot(npc) {
    // Spawn a pickup item at NPC death location
    const lootItems = [
      { model: 'rpg_items_pack_crystalRound', type: 'health_potion', value: 25 },
      { model: 'rpg_items_pack_gemRound', type: 'gem', value: 50 },
      { model: 'medieval_weapons_pack_sword', type: 'weapon', subtype: 'sword', damage: 25 },
      { model: 'medieval_weapons_pack_shield_round', type: 'shield', subtype: 'shield', defense: 15 },
      { model: 'rpg_items_pack_crystal1', type: 'material', material: 'crystal', amount: 2 },
      { model: 'medieval_village_pack_crate', type: 'material', material: 'iron', amount: 2 },
      { model: 'rpg_items_pack_gemRound', type: 'material', material: 'gold', amount: 1 },
      { model: 'simple_nature_pack_tree1', type: 'material', material: 'wood', amount: 3 },
    ];
    const loot = lootItems[Math.floor(Math.random() * lootItems.length)];
    const pos = npc.model.position.clone();
    
    loader.load('models/' + loot.model + '.glb', (gltf) => {
      const m = gltf.scene;
      const box = new THREE.Box3().setFromObject(m);
      const size = box.getSize(new THREE.Vector3());
      m.scale.setScalar(0.8 / Math.max(size.x, size.y, size.z, 0.001));
      m.position.set(pos.x, 0.5, pos.z);
      m.userData.name = 'loot_' + loot.type;
      m.userData.isPickup = true;
      // Glow ring under loot
      const ringGeo = new THREE.RingGeometry(0.3, 0.5, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      m.add(ring);
      m.userData.glowRing = ring;
      m.userData.pickupData = loot;
      m.userData.bobPhase = Math.random() * Math.PI * 2;
      m.userData.bobBaseY = pos.y + 0.5;
      // Floating + spinning animation
      m.userData.baseY = 0.5;
      this.scene.add(m);
      this.objects.push(m);
    }, undefined, () => {
      // If model fails, create a glowing orb
      const geo = new THREE.SphereGeometry(0.3, 8, 8);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.8 });
      const orb = new THREE.Mesh(geo, mat);
      orb.position.set(pos.x, 0.5, pos.z);
      orb.userData.name = 'loot_gem';
      orb.userData.isPickup = true;
      orb.userData.pickupData = { type: 'gem', value: 25 };
      orb.userData.baseY = 0.5;
      this.scene.add(orb);
      this.objects.push(orb);
    });
  }
  
  // Separate NPCs so they don't stack on top of each other
  _separateNPCs() {
    const minDist = 2.5;
    for (let i = 0; i < this.npcs.length; i++) {
      if (this.npcs[i].isDead) continue;
      for (let j = i + 1; j < this.npcs.length; j++) {
        if (this.npcs[j].isDead) continue;
        const a = this.npcs[i].model.position;
        const b = this.npcs[j].model.position;
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < minDist && dist > 0.01) {
          const push = (minDist - dist) * 0.5;
          const nx = dx / dist * push;
          const nz = dz / dist * push;
          a.x += nx; a.z += nz;
          b.x -= nx; b.z -= nz;
        }
      }
    }
  }
  
  // Billboard health bars toward camera
  updateHealthBarFacing(camera) {
    for (const npc of this.npcs) {
      if (npc.healthBar && npc.healthBar.visible) {
        npc.healthBar.lookAt(camera.position);
      }
    }
  }
  
  getNearbyNPCs(position, range) {
    return this.npcs.filter(n => !n.isDead && n.model.position.distanceTo(position) < range);
  }
}

// === SMART TOWN/CITY BUILDER ===
export class TownBuilder {
  constructor(scene, objects, loadGLBModel) {
    this.scene = scene;
    this.objects = objects;
    this.loadGLB = loadGLBModel;
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

// === HUD OVERLAY ===
export function createGameHUD() {
  const hud = document.createElement('div');
  hud.id = 'game-hud-full';
  hud.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9998;display:none;font-family:"Segoe UI",system-ui,sans-serif;';
  
  // Inject HUD styles
  if (!document.getElementById('hud-styles')) {
    const style = document.createElement('style');
    style.id = 'hud-styles';
    style.textContent = `
      @keyframes hud-damage-flash { 0%{opacity:0.8} 100%{opacity:0} }
      @keyframes hud-pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }
      @keyframes hud-slide-in { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }
      @keyframes hud-fade-out { to{opacity:0} }
      .hud-bar-container {
        position:relative;width:240px;height:10px;
        background:rgba(10,10,15,0.85);border-radius:2px;
        overflow:hidden;box-shadow:0 0 8px rgba(0,0,0,0.5);
      }
      .hud-bar-fill {
        height:100%;border-radius:2px;transition:width 0.25s ease-out;
        position:relative;
      }
      .hud-bar-fill::after {
        content:'';position:absolute;top:0;left:0;right:0;height:40%;
        background:linear-gradient(180deg,rgba(255,255,255,0.15),transparent);
        border-radius:2px 2px 0 0;
      }
      .hud-label {
        font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;
        margin-bottom:3px;display:flex;align-items:center;gap:6px;
      }
      .hud-label-value {
        font-size:10px;font-weight:400;opacity:0.7;margin-left:auto;font-variant-numeric:tabular-nums;
      }
      .weapon-slot {
        width:56px;height:56px;background:rgba(10,10,15,0.75);
        border:1px solid rgba(255,255,255,0.08);border-radius:4px;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        position:relative;transition:all 0.2s;
      }
      .weapon-slot.active {
        border-color:rgba(255,200,60,0.6);
        box-shadow:0 0 12px rgba(255,200,60,0.15),inset 0 0 12px rgba(255,200,60,0.05);
        background:rgba(20,18,10,0.85);
      }
      .weapon-slot-key {
        position:absolute;top:2px;left:4px;font-size:9px;color:rgba(255,255,255,0.3);
        font-weight:700;
      }
      .weapon-slot-icon { font-size:22px;margin-top:2px; }
      .weapon-slot-name {
        font-size:7px;color:rgba(255,255,255,0.4);margin-top:1px;
        text-transform:uppercase;letter-spacing:0.5px;max-width:50px;
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
      }
      .hud-ammo {
        font-size:28px;font-weight:200;color:rgba(255,255,255,0.85);
        font-variant-numeric:tabular-nums;letter-spacing:-1px;
      }
      .hud-ammo-label {
        font-size:9px;color:rgba(255,255,255,0.3);letter-spacing:2px;
        text-transform:uppercase;
      }
      #hud-controls-hint {
        animation: hud-slide-in 0.5s ease-out, hud-fade-out 1s ease-in 6s forwards;
      }
    `;
    document.head.appendChild(style);
  }

  hud.innerHTML = `
    <!-- DAMAGE VIGNETTE -->
    <div id="hud-damage-vignette" style="position:absolute;inset:0;pointer-events:none;opacity:0;
      box-shadow:inset 0 0 100px 40px rgba(180,20,20,0.5);"></div>

    <!-- HEALTH + STAMINA + XP (bottom-left) -->
    <div style="position:absolute;bottom:28px;left:24px;display:flex;flex-direction:column;gap:6px;">
      <div>
        <div class="hud-label" style="color:#c43c3c;">
          <span style="font-size:8px;">■</span> HP
          <span class="hud-label-value" id="hud-hp-text">200 / 200</span>
        </div>
        <div class="hud-bar-container" style="height:12px;">
          <div id="hud-health-bar" class="hud-bar-fill" style="width:100%;background:linear-gradient(90deg,#8b1a1a,#c43c3c,#e05050);"></div>
          <div id="hud-health-damage" style="position:absolute;top:0;right:0;height:100%;background:rgba(255,80,80,0.4);width:0;transition:width 0.5s 0.2s;border-radius:2px;"></div>
        </div>
      </div>
      <div>
        <div class="hud-label" style="color:#3c9c5c;">
          <span style="font-size:8px;">■</span> STAMINA
          <span class="hud-label-value" id="hud-stam-text">100 / 100</span>
        </div>
        <div class="hud-bar-container" style="height:7px;">
          <div id="hud-stamina-bar" class="hud-bar-fill" style="width:100%;background:linear-gradient(90deg,#1a5c2a,#3c9c5c,#50c070);"></div>
        </div>
      </div>
      <div>
        <div class="hud-label" style="color:#7c5cbf;">
          <span style="font-size:8px;">■</span> LVL <span id="hud-xp-level">1</span>
          <span class="hud-label-value" id="hud-xp-text">0 / 100</span>
        </div>
        <div class="hud-bar-container" style="height:5px;">
          <div id="hud-xp-bar" class="hud-bar-fill" style="width:0%;background:linear-gradient(90deg,#5b3a9c,#7c5cbf,#9c7cdf);"></div>
        </div>
      </div>
    </div>

    <!-- CROSSHAIR (center) -->
    <div id="hud-crosshair" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:none;pointer-events:none;">
      <svg width="24" height="24" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="1.5" fill="rgba(255,255,255,0.5)"/>
        <line x1="12" y1="3" x2="12" y2="9" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="12" y1="15" x2="12" y2="21" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="3" y1="12" x2="9" y2="12" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="15" y1="12" x2="21" y2="12" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </div>

    <!-- COMPASS (top-center) -->
    <div id="hud-compass" style="position:absolute;top:10px;left:50%;transform:translateX(-50%);width:280px;height:22px;
      background:rgba(10,10,15,0.6);border-radius:3px;border:1px solid rgba(255,255,255,0.06);overflow:hidden;">
      <canvas id="compass-canvas" width="280" height="22" style="width:100%;height:100%;"></canvas>
      <div style="position:absolute;top:0;left:50%;width:1px;height:100%;background:rgba(255,200,60,0.5);"></div>
    </div>

    <!-- SCORE (top-center below compass) -->
    <div id="hud-score" style="position:absolute;top:38px;left:50%;transform:translateX(-50%);
      color:rgba(255,200,60,0.7);font-size:13px;font-weight:600;letter-spacing:1px;">⭐ 0</div>

    <!-- WEAPON SLOTS + AMMO (bottom-right) -->
    <div style="position:absolute;bottom:28px;right:24px;display:flex;align-items:flex-end;gap:12px;">
      <div id="hud-ammo-display" style="text-align:right;margin-right:4px;display:none;">
        <div class="hud-ammo" id="hud-ammo-count">30</div>
        <div class="hud-ammo-label">AMMO</div>
      </div>
      <div id="hud-weapon-slots" style="display:flex;gap:4px;">
        <div class="weapon-slot" id="hud-slot-1"><span class="weapon-slot-key">1</span><span class="weapon-slot-icon">—</span><span class="weapon-slot-name">Empty</span></div>
        <div class="weapon-slot" id="hud-slot-2"><span class="weapon-slot-key">2</span><span class="weapon-slot-icon">—</span><span class="weapon-slot-name">Empty</span></div>
        <div class="weapon-slot" id="hud-slot-3"><span class="weapon-slot-key">3</span><span class="weapon-slot-icon">—</span><span class="weapon-slot-name">Empty</span></div>
      </div>
    </div>

    <!-- CONTROLS HINT (bottom-center, fades out) -->
    <div id="hud-controls-hint" style="position:absolute;bottom:24px;left:50%;transform:translateX(-50%);
      color:rgba(255,255,255,0.35);font-size:10px;text-align:center;line-height:1.7;letter-spacing:0.5px;">
      WASD Move &nbsp;·&nbsp; SHIFT Sprint &nbsp;·&nbsp; SPACE Jump &nbsp;·&nbsp; C Roll<br>
      E Attack &nbsp;·&nbsp; Q Heavy &nbsp;·&nbsp; F Interact &nbsp;·&nbsp; V Camera &nbsp;·&nbsp; ESC Exit
    </div>

    <!-- INTERACTION PROMPT (center-bottom) -->
    <div id="hud-interact-prompt" style="position:absolute;bottom:100px;left:50%;transform:translateX(-50%);
      display:none;background:rgba(10,10,15,0.8);border:1px solid rgba(255,255,255,0.1);
      border-radius:4px;padding:6px 16px;color:rgba(255,255,255,0.7);font-size:12px;
      letter-spacing:0.5px;"></div>
  `;
  
  document.body.appendChild(hud);
  
  // Set up HUD update functions
  window._hudUpdate = {
    health(current, max) {
      const pct = Math.max(0, current / max * 100);
      const bar = document.getElementById('hud-health-bar');
      const txt = document.getElementById('hud-hp-text');
      if (bar) bar.style.width = pct + '%';
      if (txt) txt.textContent = Math.round(current) + ' / ' + max;
      // Low health pulse
      if (bar) bar.style.animation = pct < 25 ? 'hud-pulse 1s infinite' : 'none';
    },
    stamina(current, max) {
      const pct = Math.max(0, current / max * 100);
      const bar = document.getElementById('hud-stamina-bar');
      const txt = document.getElementById('hud-stam-text');
      if (bar) bar.style.width = pct + '%';
      if (txt) txt.textContent = Math.round(current) + ' / ' + max;
    },
    xp(current, next, level) {
      const pct = Math.max(0, current / next * 100);
      const bar = document.getElementById('hud-xp-bar');
      const txt = document.getElementById('hud-xp-text');
      const lvl = document.getElementById('hud-xp-level');
      if (bar) bar.style.width = pct + '%';
      if (txt) txt.textContent = current + ' / ' + next;
      if (lvl) lvl.textContent = level;
    },
    weapon(slot, icon, name, active) {
      const el = document.getElementById('hud-slot-' + slot);
      if (!el) return;
      el.querySelector('.weapon-slot-icon').textContent = icon || '—';
      el.querySelector('.weapon-slot-name').textContent = name || 'Empty';
      el.classList.toggle('active', !!active);
    },
    ammo(count, show) {
      const el = document.getElementById('hud-ammo-display');
      const ct = document.getElementById('hud-ammo-count');
      if (el) el.style.display = show ? 'block' : 'none';
      if (ct) ct.textContent = count;
    },
    damageFlash() {
      const v = document.getElementById('hud-damage-vignette');
      if (v) { v.style.animation = 'none'; v.offsetHeight; v.style.animation = 'hud-damage-flash 0.6s ease-out'; }
    },
    interact(text) {
      const el = document.getElementById('hud-interact-prompt');
      if (!el) return;
      if (text) { el.textContent = text; el.style.display = 'block'; }
      else { el.style.display = 'none'; }
    }
  };
  
  return hud;
}


// === XP & LEVEL SYSTEM ===
export class LevelSystem {
  constructor(character) {
    this.character = character;
    this.xp = 0;
    this.level = 1;
    this.xpToNext = 100;
    this.skillPoints = 0;
    this.skills = {
      strength: 0,    // +5 damage per level
      vitality: 0,    // +25 HP per level
      endurance: 0,   // +15 stamina per level
      agility: 0,     // +0.5 speed per level
      luck: 0,        // +10% loot chance per level
    };
    this._createUI();
  }
  
  _createUI() {
    // XP bar is now integrated into main game HUD
  }
  
  addXP(amount) {
    this.xp += amount;
    let leveledUp = false;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.xpToNext = Math.floor(100 * Math.pow(1.5, this.level - 1));
      this.skillPoints++;
      leveledUp = true;
      
      // Apply level bonuses
      this.character.maxHealth = 200 + this.skills.vitality * 25;
      this.character.health = this.character.maxHealth;
      this.character.maxStamina = 100 + this.skills.endurance * 15;
      this.character.stamina = this.character.maxStamina;
    }
    
    this._updateUI();
    
    if (leveledUp) {
      this._showLevelUp();
    }
    return leveledUp;
  }
  
  upgradeSkill(skillName) {
    if (this.skillPoints <= 0) return '⚠ No skill points available';
    if (!this.skills.hasOwnProperty(skillName)) return '⚠ Unknown skill: ' + skillName;
    this.skills[skillName]++;
    this.skillPoints--;
    
    // Apply stat changes
    this.character.maxHealth = 200 + this.skills.vitality * 25;
    this.character.maxStamina = 100 + this.skills.endurance * 15;
    this.character.walkSpeed = 5 + this.skills.agility * 0.5;
    this.character.runSpeed = 10 + this.skills.agility * 1;
    
    const desc = {
      strength: 'DMG +5',
      vitality: 'HP +25 (now ' + this.character.maxHealth + ')',
      endurance: 'Stamina +15 (now ' + this.character.maxStamina + ')',
      agility: 'Speed +0.5',
      luck: 'Loot +10%',
    };
    
    this._updateUI();
    return '⬆️ ' + skillName + ' → ' + this.skills[skillName] + ' | ' + desc[skillName] + ' | Points left: ' + this.skillPoints;
  }
  
  getStats() {
    return 'Level ' + this.level + ' | XP: ' + this.xp + '/' + this.xpToNext + ' | Points: ' + this.skillPoints + '\n' +
      Object.entries(this.skills).map(([k, v]) => '  ' + k + ': ' + v).join('\n');
  }
  
  getDamageBonus() {
    return this.skills.strength * 5;
  }
  
  _updateUI() {
    if (window._hudUpdate) {
      window._hudUpdate.xp(this.xp, this.xpToNext, this.level);
    }
  }
  
  _showLevelUp() { if (window._sound) window._sound.SFX.levelUp();
    let el = document.getElementById('level-up-msg');
    if (!el) {
      el = document.createElement('div');
      el.id = 'level-up-msg';
      el.style.cssText = 'position:fixed;top:25%;left:50%;transform:translateX(-50%);font-family:monospace;z-index:10001;text-align:center;transition:opacity 1s;pointer-events:none;';
      document.body.appendChild(el);
    }
    el.innerHTML = '<div style="color:#f59e0b;font-size:36px;text-shadow:0 0 20px #f59e0b;">⬆️ LEVEL UP!</div>' +
      '<div style="color:#ddd;font-size:18px;margin-top:8px;">Level ' + this.level + '</div>' +
      '<div style="color:#8b5cf6;font-size:14px;margin-top:4px;">+1 Skill Point</div>';
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 3000);
  }
}

// === CRAFTING SYSTEM ===
export class CraftingSystem {
  constructor(character) {
    this.character = character;
    this.materials = { wood: 0, stone: 0, iron: 0, crystal: 0, gold: 0, leather: 0, herb: 0 };
    this.recipes = [
      { name: 'Iron Sword', icon: '⚔️', requires: { iron: 3, wood: 1 }, result: { type: 'weapon', name: 'iron_sword', damage: 30 } },
      { name: 'Steel Shield', icon: '🛡️', requires: { iron: 4, leather: 2 }, result: { type: 'shield', name: 'steel_shield', defense: 20 } },
      { name: 'Health Potion', icon: '❤️', requires: { herb: 2, crystal: 1 }, result: { type: 'heal', value: 50 } },
      { name: 'Fire Sword', icon: '🔥', requires: { iron: 5, crystal: 3 }, result: { type: 'weapon', name: 'fire_sword', damage: 45 } },
      { name: 'Diamond Shield', icon: '💎', requires: { crystal: 5, gold: 2 }, result: { type: 'shield', name: 'diamond_shield', defense: 35 } },
      { name: 'Mega Potion', icon: '💊', requires: { herb: 4, crystal: 2, gold: 1 }, result: { type: 'heal', value: 100 } },
    ];
    this.el = null;
  }
  
  addMaterial(type, amount = 1) {
    if (this.materials[type] !== undefined) {
      this.materials[type] += amount;
      return true;
    }
    return false;
  }
  
  canCraft(recipe) {
    return Object.entries(recipe.requires).every(([mat, amt]) => (this.materials[mat] || 0) >= amt);
  }
  
  craft(recipeName) {
    const recipe = this.recipes.find(r => r.name.toLowerCase() === recipeName.toLowerCase());
    if (!recipe) return '⚠ Unknown recipe: ' + recipeName;
    if (!this.canCraft(recipe)) {
      const missing = Object.entries(recipe.requires).filter(([m, a]) => (this.materials[m]||0) < a).map(([m, a]) => m + ' (' + (a - (this.materials[m]||0)) + ' more)').join(', ');
      return '⚠ Need: ' + missing;
    }
    // Consume materials
    Object.entries(recipe.requires).forEach(([m, a]) => { this.materials[m] -= a; });
    // Apply result
    const r = recipe.result;
    if (r.type === 'weapon') {
      this.character.equippedWeapon = { name: r.name, damage: r.damage };
      this.character._updateInventoryHUD();
      return '🔨 Crafted ' + recipe.icon + ' ' + recipe.name + '! (DMG: ' + r.damage + ')';
    } else if (r.type === 'shield') {
      this.character.equippedShield = { name: r.name, defense: r.defense };
      this.character._updateInventoryHUD();
      return '🔨 Crafted ' + recipe.icon + ' ' + recipe.name + '! (DEF: ' + r.defense + ')';
    } else if (r.type === 'heal') {
      this.character.health = Math.min(this.character.maxHealth, this.character.health + r.value);
      return '🔨 Crafted ' + recipe.icon + ' ' + recipe.name + '! (+' + r.value + ' HP)';
    }
    if (window._sound) window._sound.SFX.craft(); return '🔨 Crafted ' + recipe.name;
  }
  
  listRecipes() {
    return this.recipes.map(r => {
      const can = this.canCraft(r) ? '✅' : '❌';
      const mats = Object.entries(r.requires).map(([m, a]) => m + ':' + (this.materials[m]||0) + '/' + a).join(' ');
      return can + ' ' + r.icon + ' ' + r.name + ' — ' + mats;
    }).join('\n');
  }
  
  getMaterialString() {
    return Object.entries(this.materials).filter(([k,v]) => v > 0).map(([k,v]) => k + ':' + v).join(', ') || 'none';
  }
}

// === QUEST SYSTEM ===
export class QuestSystem {
  constructor() {
    this.quests = [];
    this.activeQuest = null;
    this.completedQuests = [];
    this.questLog = [];
  }
  
  addQuest(quest) {
    // quest: { id, title, description, type, target, targetCount, current, reward, marker }
    quest.current = quest.current || 0;
    quest.completed = false;
    this.quests.push(quest);
    if (!this.activeQuest) this.activeQuest = quest;
    this._updateUI();
    return quest;
  }
  
  progress(type, amount = 1) {
    let completed = [];
    for (const q of this.quests) {
      if (q.completed) continue;
      if (q.type === type) {
        q.current = Math.min(q.targetCount, q.current + amount);
        if (q.current >= q.targetCount) {
          q.completed = true;
          this.completedQuests.push(q);
          completed.push(q);
        }
      }
    }
    this._updateUI();
    return completed;
  }
  
  _updateUI() {
    let el = document.getElementById('quest-tracker');
    if (!el) {
      el = document.createElement('div');
      el.id = 'quest-tracker';
      el.style.cssText = 'position:fixed;top:80px;right:20px;width:220px;background:rgba(0,0,0,0.75);border:1px solid #f59e0b;border-radius:8px;padding:10px;font-family:monospace;font-size:11px;color:#e0e0e0;z-index:9998;pointer-events:none;';
      document.body.appendChild(el);
    }
    
    const active = this.quests.filter(q => !q.completed).slice(0, 3);
    if (active.length === 0) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    el.innerHTML = '<div style="color:#f59e0b;font-size:12px;margin-bottom:6px;border-bottom:1px solid #333;padding-bottom:4px;">📜 QUESTS</div>' +
      active.map(q => {
        const pct = (q.current / q.targetCount * 100).toFixed(0);
        return '<div style="margin-bottom:6px;">' +
          '<div style="color:#ddd;">' + q.title + '</div>' +
          '<div style="color:#888;font-size:10px;">' + q.description + '</div>' +
          '<div style="margin-top:3px;height:4px;background:#333;border-radius:2px;overflow:hidden;">' +
          '<div style="width:' + pct + '%;height:100%;background:' + (pct >= 100 ? '#44ff44' : '#f59e0b') + ';"></div></div>' +
          '<div style="color:#888;font-size:9px;text-align:right;">' + q.current + '/' + q.targetCount + '</div>' +
        '</div>';
      }).join('');
  }
  
  showCompletion(quest) {
    let el = document.getElementById('quest-complete');
    if (!el) {
      el = document.createElement('div');
      el.id = 'quest-complete';
      el.style.cssText = 'position:fixed;top:30%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);border:2px solid #44ff44;border-radius:12px;padding:20px 40px;font-family:monospace;z-index:10001;text-align:center;transition:opacity 0.5s;';
      document.body.appendChild(el);
    }
    el.innerHTML = '<div style="color:#44ff44;font-size:24px;">✅ QUEST COMPLETE</div>' +
      '<div style="color:#ddd;font-size:14px;margin-top:8px;">' + quest.title + '</div>' +
      (quest.reward ? '<div style="color:#f59e0b;font-size:12px;margin-top:6px;">Reward: ' + quest.reward + '</div>' : '');
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 3000);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 3500);
  }
}

// === DIALOGUE SYSTEM (Enhanced with choices + quest integration) ===
export class DialogueSystem {
  constructor() {
    this.active = false;
    this.currentDialogue = null;
    this.currentIndex = 0;
    this.el = null;
    this._typeTimer = null;
    this._typeComplete = false;
  }
  
  _ensureUI() {
    if (this.el) return;
    this.el = document.createElement('div');
    this.el.id = 'dialogue-box';
    this.el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);width:560px;max-width:92vw;background:linear-gradient(180deg,rgba(15,10,30,0.95),rgba(5,5,15,0.98));border:2px solid #8b5cf6;border-radius:16px;padding:0;z-index:10001;display:none;font-family:-apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 0 40px rgba(139,92,246,0.3);pointer-events:auto;';
    this.el.innerHTML = `
      <div style="padding:16px 20px 0;">
        <div id="dlg-portrait" style="display:inline-block;width:40px;height:40px;border-radius:50%;background:#8b5cf6;text-align:center;line-height:40px;font-size:20px;vertical-align:middle;margin-right:10px;">👤</div>
        <span id="dlg-speaker" style="color:#8b5cf6;font-size:15px;font-weight:700;vertical-align:middle;"></span>
      </div>
      <div id="dlg-text" style="color:#e0e0e0;font-size:14px;line-height:1.6;padding:12px 20px;min-height:50px;"></div>
      <div id="dlg-choices" style="padding:0 20px 16px;display:none;"></div>
      <div id="dlg-continue" style="color:#555;font-size:11px;padding:0 20px 12px;text-align:right;">▶ Click or SPACE to continue</div>
    `;
    this.el.addEventListener('click', (e) => {
      if (e.target.closest('.dlg-choice')) return; // Don't advance on choice click
      this.advance();
    });
    document.body.appendChild(this.el);
  }
  
  start(dialogue) {
    // dialogue: { speaker, portrait?, lines: [string | {text, choices: [{label, action?, questId?}]}], onEnd? }
    this._ensureUI();
    this.currentDialogue = dialogue;
    this.currentIndex = 0;
    this.active = true;
    this.el.style.display = 'block';
    
    // Set portrait
    const portrait = document.getElementById('dlg-portrait');
    if (portrait) {
      const type = (dialogue.speaker || '').toLowerCase();
      const icons = { merchant:'🏪', guard:'⚔️', wizard:'🔮', blacksmith:'🔨', innkeeper:'🍺', king:'👑', witch:'🧙‍♀️', villager:'🧑‍🌾', soldier:'🛡️', enemy:'💀' };
      let icon = '👤';
      for (const [k, v] of Object.entries(icons)) { if (type.includes(k)) { icon = v; break; } }
      portrait.textContent = dialogue.portrait || icon;
    }
    
    this._showLine();
  }
  
  _showLine() {
    if (!this.currentDialogue) return;
    const speaker = document.getElementById('dlg-speaker');
    const text = document.getElementById('dlg-text');
    const choicesEl = document.getElementById('dlg-choices');
    const continueEl = document.getElementById('dlg-continue');
    if (speaker) speaker.textContent = this.currentDialogue.speaker || 'NPC';
    
    const lineData = this.currentDialogue.lines[this.currentIndex];
    const lineText = typeof lineData === 'string' ? lineData : lineData.text;
    const choices = typeof lineData === 'object' ? lineData.choices : null;
    
    // Hide choices initially
    if (choicesEl) { choicesEl.style.display = 'none'; choicesEl.innerHTML = ''; }
    if (continueEl) continueEl.style.display = 'block';
    
    // Typewriter
    if (text) {
      text.textContent = '';
      this._typeComplete = false;
      let i = 0;
      clearInterval(this._typeTimer);
      this._typeTimer = setInterval(() => {
        if (i < lineText.length) {
          text.textContent += lineText[i];
          i++;
        } else {
          clearInterval(this._typeTimer);
          this._typeComplete = true;
          // Show choices if any
          if (choices && choicesEl) {
            choicesEl.style.display = 'block';
            if (continueEl) continueEl.style.display = 'none';
            choices.forEach((c, idx) => {
              const btn = document.createElement('button');
              btn.className = 'dlg-choice';
              btn.style.cssText = 'display:block;width:100%;padding:10px 14px;margin-top:6px;background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.4);border-radius:8px;color:#d4bfff;font-size:13px;cursor:pointer;text-align:left;font-family:inherit;transition:all 0.2s;';
              btn.textContent = (idx + 1) + '. ' + c.label;
              btn.onmouseenter = () => { btn.style.background = 'rgba(139,92,246,0.35)'; btn.style.borderColor = '#8b5cf6'; };
              btn.onmouseleave = () => { btn.style.background = 'rgba(139,92,246,0.15)'; btn.style.borderColor = 'rgba(139,92,246,0.4)'; };
              btn.onclick = () => {
                if (c.action) c.action();
                if (c.nextLine !== undefined) {
                  this.currentIndex = c.nextLine - 1; // advance() will +1
                  this.advance();
                } else {
                  this.advance();
                }
              };
              choicesEl.appendChild(btn);
            });
          }
        }
      }, 25);
    }
  }
  
  advance() {
    if (!this.active || !this.currentDialogue) return;
    // If typing, complete instantly
    if (!this._typeComplete) {
      clearInterval(this._typeTimer);
      const lineData = this.currentDialogue.lines[this.currentIndex];
      const lineText = typeof lineData === 'string' ? lineData : lineData.text;
      const text = document.getElementById('dlg-text');
      if (text) text.textContent = lineText;
      this._typeComplete = true;
      
      // Show choices if present
      const choices = typeof lineData === 'object' ? lineData.choices : null;
      if (choices) {
        const choicesEl = document.getElementById('dlg-choices');
        const continueEl = document.getElementById('dlg-continue');
        if (choicesEl) {
          choicesEl.style.display = 'block';
          if (continueEl) continueEl.style.display = 'none';
          choicesEl.innerHTML = '';
          choices.forEach((c, idx) => {
            const btn = document.createElement('button');
            btn.className = 'dlg-choice';
            btn.style.cssText = 'display:block;width:100%;padding:10px 14px;margin-top:6px;background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.4);border-radius:8px;color:#d4bfff;font-size:13px;cursor:pointer;text-align:left;font-family:inherit;transition:all 0.2s;';
            btn.textContent = (idx + 1) + '. ' + c.label;
            btn.onmouseenter = () => { btn.style.background = 'rgba(139,92,246,0.35)'; };
            btn.onmouseleave = () => { btn.style.background = 'rgba(139,92,246,0.15)'; };
            btn.onclick = () => {
              if (c.action) c.action();
              if (c.nextLine !== undefined) {
                this.currentIndex = c.nextLine - 1;
                this.advance();
              } else {
                this.advance();
              }
            };
            choicesEl.appendChild(btn);
          });
        }
      }
      return;
    }
    
    // Check for choices — don't auto-advance past choices
    const lineData = this.currentDialogue.lines[this.currentIndex];
    const choices = typeof lineData === 'object' ? lineData.choices : null;
    if (choices) return; // Must click a choice
    
    this.currentIndex++;
    if (this.currentIndex >= this.currentDialogue.lines.length) {
      this.end();
    } else {
      this._showLine();
    }
  }
  
  end() {
    this.active = false;
    clearInterval(this._typeTimer);
    if (this.el) this.el.style.display = 'none';
    if (this.currentDialogue && this.currentDialogue.onEnd) {
      this.currentDialogue.onEnd();
    }
    this.currentDialogue = null;
  }
}

// === MINIMAP ===
export function createMinimap(scene, camera, character, objects) {
  const size = 150;
  const el = document.createElement('div');
  el.id = 'minimap';
  el.style.cssText = 'position:fixed;top:60px;right:20px;width:' + size + 'px;height:' + size + 'px;border-radius:50%;border:2px solid rgba(255,255,255,0.12);overflow:hidden;z-index:9998;pointer-events:none;background:rgba(0,0,0,0.6);box-shadow:0 0 20px rgba(0,0,0,0.5);';
  
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.style.cssText = 'width:100%;height:100%;';
  el.appendChild(canvas);
  document.body.appendChild(el);
  
  const ctx = canvas.getContext('2d');
  
  function update(npcs) {
    ctx.clearRect(0, 0, size, size);
    
    // Background
    ctx.fillStyle = 'rgba(20,25,20,0.8)';
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2, 0, Math.PI*2);
    ctx.fill();
    
    const scale = 1.5; // 1 unit = 1.5 pixels
    const cx = character.position.x;
    const cz = character.position.z;
    
    // Draw objects (buildings, trees, etc.)
    for (const obj of objects) {
      if (!obj.userData.name) continue;
      const dx = (obj.position.x - cx) * scale + size/2;
      const dz = (obj.position.z - cz) * scale + size/2;
      if (dx < -5 || dx > size+5 || dz < -5 || dz > size+5) continue;
      
      const name = obj.userData.name.toLowerCase();
      if (name.includes('building') || name.includes('house') || name.includes('inn') || name.includes('blacksmith') || name.includes('shop') || name.includes('story')) {
        ctx.fillStyle = '#666';
        ctx.fillRect(dx-3, dz-3, 6, 6);
      } else if (name.includes('tree') || name.includes('bush')) {
        ctx.fillStyle = '#2a5a2a';
        ctx.beginPath(); ctx.arc(dx, dz, 2, 0, Math.PI*2); ctx.fill();
      } else if (obj.userData.isPickup) {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath(); ctx.arc(dx, dz, 2, 0, Math.PI*2); ctx.fill();
      }
    }
    
    // Draw NPCs
    if (npcs) {
      for (const npc of npcs) {
        if (npc.isDead) continue;
        const dx = (npc.model.position.x - cx) * scale + size/2;
        const dz = (npc.model.position.z - cz) * scale + size/2;
        if (dx < 0 || dx > size || dz < 0 || dz > size) continue;
        // Color by AI state
        const aiS = npc.ai ? npc.ai.state : 'idle';
        if (aiS === 'dead') continue; // don't show dead NPCs
        const npcColors = {idle:'#3b82f6', patrol:'#3b82f6', chase:'#ef4444', attack:'#ff0000', flee:'#f59e0b', search:'#f97316', return:'#6b7280', stunned:'#8b5cf6'};
        ctx.fillStyle = npcColors[aiS] || (npc.isAggro ? '#ef4444' : '#3b82f6');
        const npcSize = aiS === 'chase' || aiS === 'attack' ? 4 : 3;
        ctx.beginPath(); ctx.arc(dx, dz, npcSize, 0, Math.PI*2); ctx.fill();
        // Alert ring for chasing/attacking
        if (aiS === 'chase' || aiS === 'attack') {
          ctx.strokeStyle = '#ff000066';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(dx, dz, 6, 0, Math.PI*2); ctx.stroke();
        }
      }
    }
    
    // Draw player (center, with direction arrow)
    ctx.fillStyle = '#44ff44';
    ctx.beginPath(); ctx.arc(size/2, size/2, 4, 0, Math.PI*2); ctx.fill();
    
    // Direction indicator
    if (character.rotation !== undefined) {
      const ax = Math.sin(character.rotation) * 8;
      const az = -Math.cos(character.rotation) * 8;
      ctx.strokeStyle = '#44ff44';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(size/2, size/2);
      ctx.lineTo(size/2 + ax, size/2 + az);
      ctx.stroke();
    }
    
    // Circle border
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(size/2, size/2, size/2-1, 0, Math.PI*2); ctx.stroke();
    
    // N indicator
    ctx.fillStyle = '#ff4444';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', size/2, 12);
  }
  
  return { el, update };
}

export function updateGameHUD(character, score) {
  const hud = document.getElementById('game-hud-full');
  if (!hud || !window._hudUpdate) return;
  
  const hu = window._hudUpdate;
  
  // Health (with color shift)
  hu.health(character.health, character.maxHealth);
  const healthBar = document.getElementById('hud-health-bar');
  if (healthBar) {
    const pct = character.health / character.maxHealth * 100;
    if (pct > 60) healthBar.style.background = 'linear-gradient(90deg,#8b1a1a,#c43c3c,#e05050)';
    else if (pct > 30) healthBar.style.background = 'linear-gradient(90deg,#8b6b1a,#c4963c,#e0b050)';
    else healthBar.style.background = 'linear-gradient(90deg,#8b1a1a,#c43c3c,#ff4444)';
  }
  
  // Stamina
  hu.stamina(character.stamina, character.maxStamina);
  
  // Score
  const scoreEl = document.getElementById('hud-score');
  if (scoreEl) scoreEl.textContent = '\u2b50 ' + score;
  
  // Crosshair
  const crosshair = document.getElementById('hud-crosshair');
  if (crosshair) crosshair.style.display = 'block';
  
  // Weapon slots
  for (let i = 0; i < 3; i++) {
    const weaponId = character.weaponSlots ? character.weaponSlots[i] : null;
    const isActive = character.activeSlot === i && character.weaponDrawn;
    const weapon = weaponId ? WEAPON_DATABASE[weaponId] : null;
    const icon = weapon ? (weapon.type === 'ranged' ? '\ud83d\udd2b' : '\u2694\ufe0f') : '\u2014';
    const name = weapon ? weapon.name.split(' ')[0] : 'Empty';
    hu.weapon(i + 1, icon, name, isActive);
  }
  
  // Ammo
  if (character.equippedWeapon && WEAPON_DATABASE[character.equippedWeapon]?.type === 'ranged') {
    const wpn = WEAPON_DATABASE[character.equippedWeapon];
    const current = character.ammo?.[character.equippedWeapon] ?? wpn.magSize;
    hu.ammo(current + ' / ' + wpn.magSize, true);
  } else {
    hu.ammo('', false);
  }
  
  // Compass
  const compassCanvas = document.getElementById('compass-canvas');
  if (compassCanvas && character.cameraYaw !== undefined) {
    const cctx = compassCanvas.getContext('2d');
    cctx.clearRect(0, 0, 280, 22);
    const yaw = character.cameraYaw;
    const dirs = [
      { angle: 0, label: 'N', color: '#e05050', bold: true },
      { angle: Math.PI/4, label: 'NE', color: '#555' },
      { angle: Math.PI/2, label: 'E', color: '#aaa' },
      { angle: 3*Math.PI/4, label: 'SE', color: '#555' },
      { angle: Math.PI, label: 'S', color: '#aaa' },
      { angle: -3*Math.PI/4, label: 'SW', color: '#555' },
      { angle: -Math.PI/2, label: 'W', color: '#aaa' },
      { angle: -Math.PI/4, label: 'NW', color: '#555' },
    ];
    for (const d of dirs) {
      let offset = d.angle - yaw;
      while (offset > Math.PI) offset -= Math.PI * 2;
      while (offset < -Math.PI) offset += Math.PI * 2;
      const px = 140 + offset * (280 / Math.PI);
      if (px > -20 && px < 300) {
        cctx.font = (d.bold ? '600 ' : '') + '10px system-ui,sans-serif';
        cctx.fillStyle = d.color;
        cctx.textAlign = 'center';
        cctx.fillText(d.label, px, 14);
        cctx.fillRect(px - 0.5, 18, 1, 3);
      }
    }
  }
  
  // State debug (small, top-right)
  if (character.stateMachine) {
    let stateEl = document.getElementById('hud-state');
    if (!stateEl) {
      stateEl = document.createElement('div');
      stateEl.id = 'hud-state';
      stateEl.style.cssText = 'position:fixed;top:20px;right:16px;color:rgba(255,255,255,0.25);font-family:system-ui;font-size:9px;z-index:9000;pointer-events:none;letter-spacing:1px;';
      document.body.appendChild(stateEl);
    }
    stateEl.textContent = character.stateMachine.state.toUpperCase();
  }
}

// === GAMEPAD SUPPORT ===
// Polls connected gamepads each frame, maps to character keys
class GamepadManager {
  constructor(characterController) {
    this.cc = characterController;
    this.deadzone = 0.15;
    this.connected = false;
    
    window.addEventListener('gamepadconnected', (e) => {
      this.connected = true;
      console.log('[Gamepad] Connected:', e.gamepad.id);
      this._showToast('🎮 Gamepad connected: ' + e.gamepad.id.split('(')[0].trim());
    });
    window.addEventListener('gamepaddisconnected', () => {
      this.connected = false;
      console.log('[Gamepad] Disconnected');
    });
  }
  
  _showToast(msg) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:15%;left:50%;transform:translateX(-50%);color:#4ade80;font-family:monospace;font-size:18px;z-index:10001;pointer-events:none;background:rgba(0,0,0,0.7);padding:8px 16px;border-radius:8px;transition:opacity 1s;';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; }, 2000);
    setTimeout(() => el.remove(), 3000);
  }
  
  update() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[0] || gamepads[1] || gamepads[2] || gamepads[3];
    if (!gp) return;
    
    const cc = this.cc;
    const dz = this.deadzone;
    
    // Left stick → movement (WASD)
    const lx = Math.abs(gp.axes[0]) > dz ? gp.axes[0] : 0;
    const ly = Math.abs(gp.axes[1]) > dz ? gp.axes[1] : 0;
    cc.keys['a'] = lx < -dz;
    cc.keys['d'] = lx > dz;
    cc.keys['w'] = ly < -dz;
    cc.keys['s'] = ly > dz;
    
    // Right stick → camera
    const rx = Math.abs(gp.axes[2]) > dz ? gp.axes[2] : 0;
    const ry = Math.abs(gp.axes[3]) > dz ? gp.axes[3] : 0;
    if (rx || ry) {
      cc.cameraYaw -= rx * 0.05;
      cc.cameraPitch = Math.max(-0.5, Math.min(1.2, cc.cameraPitch + ry * 0.03));
    }
    
    // Buttons — standard mapping:
    // 0=A(south) 1=B(east) 2=X(west) 3=Y(north)
    // 4=LB 5=RB 6=LT 7=RT
    // 8=Back 9=Start 10=L3 11=R3
    // 12=DUp 13=DDown 14=DLeft 15=DRight
    
    // A = Jump
    if (gp.buttons[0] && gp.buttons[0].pressed) cc.keys[' '] = true;
    else cc.keys[' '] = cc.keys[' '] || false; // don't override keyboard
    
    // B = Roll/Dodge
    if (gp.buttons[1] && gp.buttons[1].pressed) cc.keys['c'] = true;
    else if (!cc._kbKeys?.c) cc.keys['c'] = false;
    
    // X = Attack
    if (gp.buttons[2] && gp.buttons[2].pressed) cc.keys['e'] = true;
    else if (!cc._kbKeys?.e) cc.keys['e'] = false;
    
    // Y = Interact
    if (gp.buttons[3] && gp.buttons[3].pressed) cc.keys['f'] = true;
    else if (!cc._kbKeys?.f) cc.keys['f'] = false;
    
    // LB = Block
    if (gp.buttons[4] && gp.buttons[4].pressed) cc.keys['q'] = true;
    else if (!cc._kbKeys?.q) cc.keys['q'] = false;
    
    // RB = Heavy attack  
    if (gp.buttons[5] && gp.buttons[5].pressed) cc.keys['mouse0'] = true;
    else if (!cc._kbKeys?.mouse0) cc.keys['mouse0'] = false;
    
    // LT = Sprint
    const ltPressed = gp.buttons[6] && (gp.buttons[6].pressed || gp.buttons[6].value > 0.5);
    cc.isRunning = ltPressed || cc._kbRunning || false;
    cc.keys['shift'] = ltPressed;
    
    // RT = Aim
    const rtPressed = gp.buttons[7] && (gp.buttons[7].pressed || gp.buttons[7].value > 0.5);
    if (rtPressed && !cc.isAiming) cc.startAim && cc.startAim();
    if (!rtPressed && cc.isAiming && !cc._kbAim) cc.stopAim && cc.stopAim();
    
    // Start = Pause (ESC)
    if (gp.buttons[9] && gp.buttons[9].pressed && !this._startPressed) {
      this._startPressed = true;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    } else if (gp.buttons[9] && !gp.buttons[9].pressed) {
      this._startPressed = false;
    }
    
    // L3 (click left stick) = Sprint toggle
    if (gp.buttons[10] && gp.buttons[10].pressed && !this._l3Pressed) {
      this._l3Pressed = true;
      cc.isSprinting = !cc.isSprinting;
    } else if (gp.buttons[10] && !gp.buttons[10].pressed) {
      this._l3Pressed = false;
    }
    
    // D-pad: weapon swap
    if (gp.buttons[14] && gp.buttons[14].pressed) { cc.activeSlot = 0; cc.toggleWeapon && cc.toggleWeapon(); }
    if (gp.buttons[15] && gp.buttons[15].pressed) { cc.activeSlot = 1; cc.toggleWeapon && cc.toggleWeapon(); }
    if (gp.buttons[12] && gp.buttons[12].pressed) { cc.activeSlot = 2; cc.toggleWeapon && cc.toggleWeapon(); }
    
    // Tab/Inventory = Back button
    if (gp.buttons[8] && gp.buttons[8].pressed && !this._backPressed) {
      this._backPressed = true;
      cc.toggleInventoryPanel && cc.toggleInventoryPanel();
    } else if (gp.buttons[8] && !gp.buttons[8].pressed) {
      this._backPressed = false;
    }
  }
}

export { GamepadManager };

// === MOBILE TOUCH CONTROLS ===
class MobileControls {
  constructor(characterController) {
    this.cc = characterController;
    this.active = false;
    this._stickTouch = null;
    this._lookTouch = null;
    
    // Only activate on touch devices
    if (!('ontouchstart' in window)) return;
    this.active = true;
    this._createUI();
  }
  
  _createUI() {
    // Left joystick area (movement)
    this.stickArea = document.createElement('div');
    this.stickArea.style.cssText = 'position:fixed;left:0;bottom:0;width:40vw;height:50vh;z-index:9990;touch-action:none;';
    
    this.stickBase = document.createElement('div');
    this.stickBase.style.cssText = 'position:absolute;left:15vw;bottom:15vh;width:100px;height:100px;border-radius:50%;background:rgba(255,255,255,0.15);border:2px solid rgba(255,255,255,0.3);transform:translate(-50%,-50%);display:none;';
    
    this.stickKnob = document.createElement('div');
    this.stickKnob.style.cssText = 'position:absolute;left:50%;top:50%;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.5);transform:translate(-50%,-50%);';
    
    this.stickBase.appendChild(this.stickKnob);
    this.stickArea.appendChild(this.stickBase);
    document.body.appendChild(this.stickArea);
    
    // Right side = camera look (touch drag)
    this.lookArea = document.createElement('div');
    this.lookArea.style.cssText = 'position:fixed;right:0;bottom:0;width:60vw;height:50vh;z-index:9990;touch-action:none;';
    document.body.appendChild(this.lookArea);
    
    // Action buttons (right side)
    const btnCSS = 'position:fixed;z-index:9991;width:56px;height:56px;border-radius:50%;font-size:22px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.2);border:2px solid rgba(255,255,255,0.4);color:white;touch-action:none;user-select:none;';
    
    this._addBtn('⚔️', 'right:20px;bottom:120px;', () => { this.cc.keys['e'] = true; setTimeout(() => { this.cc.keys['e'] = false; }, 100); }, btnCSS);
    this._addBtn('🛡️', 'right:80px;bottom:80px;', () => { this.cc.keys['q'] = true; setTimeout(() => { this.cc.keys['q'] = false; }, 100); }, btnCSS);
    this._addBtn('⬆️', 'right:20px;bottom:190px;', () => { this.cc.keys[' '] = true; setTimeout(() => { this.cc.keys[' '] = false; }, 150); }, btnCSS);
    this._addBtn('🔄', 'right:80px;bottom:160px;', () => { this.cc.keys['c'] = true; setTimeout(() => { this.cc.keys['c'] = false; }, 100); }, btnCSS);
    this._addBtn('🤝', 'right:140px;bottom:120px;', () => { this.cc.keys['f'] = true; setTimeout(() => { this.cc.keys['f'] = false; }, 100); }, btnCSS);
    
    // Joystick touch handling
    this.stickArea.addEventListener('touchstart', (e) => this._onStickStart(e), { passive: false });
    this.stickArea.addEventListener('touchmove', (e) => this._onStickMove(e), { passive: false });
    this.stickArea.addEventListener('touchend', (e) => this._onStickEnd(e), { passive: false });
    
    // Camera look handling
    this.lookArea.addEventListener('touchstart', (e) => this._onLookStart(e), { passive: false });
    this.lookArea.addEventListener('touchmove', (e) => this._onLookMove(e), { passive: false });
    this.lookArea.addEventListener('touchend', (e) => this._onLookEnd(e), { passive: false });
  }
  
  _addBtn(label, posCSS, onTap, baseCSS) {
    const btn = document.createElement('div');
    btn.style.cssText = baseCSS + posCSS;
    btn.textContent = label;
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); onTap(); });
    document.body.appendChild(btn);
  }
  
  _onStickStart(e) {
    e.preventDefault();
    const t = e.changedTouches[0];
    this._stickTouch = t.identifier;
    this._stickOrigin = { x: t.clientX, y: t.clientY };
    this.stickBase.style.display = 'block';
    this.stickBase.style.left = t.clientX + 'px';
    this.stickBase.style.bottom = (window.innerHeight - t.clientY) + 'px';
  }
  
  _onStickMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== this._stickTouch) continue;
      const dx = t.clientX - this._stickOrigin.x;
      const dy = t.clientY - this._stickOrigin.y;
      const dist = Math.min(Math.sqrt(dx * dx + dy * dy), 50);
      const angle = Math.atan2(dy, dx);
      const nx = Math.cos(angle) * dist;
      const ny = Math.sin(angle) * dist;
      
      this.stickKnob.style.left = (50 + nx) + 'px';
      this.stickKnob.style.top = (50 + ny) + 'px';
      
      // Map to keys
      const threshold = 15;
      this.cc.keys['w'] = dy < -threshold;
      this.cc.keys['s'] = dy > threshold;
      this.cc.keys['a'] = dx < -threshold;
      this.cc.keys['d'] = dx > threshold;
      // Sprint if pushed far
      this.cc.isRunning = dist > 40;
    }
  }
  
  _onStickEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier !== this._stickTouch) continue;
      this._stickTouch = null;
      this.stickBase.style.display = 'none';
      this.stickKnob.style.left = '50%';
      this.stickKnob.style.top = '50%';
      this.cc.keys['w'] = false;
      this.cc.keys['s'] = false;
      this.cc.keys['a'] = false;
      this.cc.keys['d'] = false;
      this.cc.isRunning = false;
    }
  }
  
  _onLookStart(e) {
    e.preventDefault();
    const t = e.changedTouches[0];
    this._lookTouch = t.identifier;
    this._lookLast = { x: t.clientX, y: t.clientY };
  }
  
  _onLookMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== this._lookTouch) continue;
      const dx = t.clientX - this._lookLast.x;
      const dy = t.clientY - this._lookLast.y;
      this._lookLast = { x: t.clientX, y: t.clientY };
      
      this.cc.cameraYaw -= dx * 0.005;
      this.cc.cameraPitch = Math.max(-0.5, Math.min(1.2, this.cc.cameraPitch + dy * 0.005));
    }
  }
  
  _onLookEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier !== this._lookTouch) continue;
      this._lookTouch = null;
    }
  }
}

export { MobileControls };
