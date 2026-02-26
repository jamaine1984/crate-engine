// === CHARACTER CONTROLLER & TOWN BUILDER ===
// Manages player character, NPCs, vehicles, inventory, and structured building

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
// Get terrain height at world position
function _getTerrainY(x, z) {
  const tm = window._terrainMesh;
  if (!tm) return 0;
  const rc = new THREE.Raycaster(new THREE.Vector3(x, 500, z), new THREE.Vector3(0, -1, 0));
  const hits = rc.intersectObject(tm);
  return hits.length > 0 ? hits[0].point.y : 0;
}


// === WEAPON DATABASE ===
// Every weapon defined by data, not hardcoded logic
const WEAPON_DATABASE = {
  // === MELEE ===
  sword: {
    id: 'sword', name: 'Iron Sword', type: 'melee', subtype: 'one_handed',
    damage: 25, attackSpeed: 1.2, range: 2.5, staminaCost: 15, knockback: 3,
    comboChain: ['slash_r', 'slash_l', 'thrust'], critMultiplier: 1.5, critChance: 0.1,
    blockReduction: 0.5, weight: 3,
    mesh: { type: 'sword', bladeColor: 0xaaaacc, hiltColor: 0x553311, bladeLen: 0.65, bladeW: 0.05 },
    holdOffset: { x: 0, y: 0, z: 0 }, holdRotation: { x: 0, y: 0, z: 0 },
    holsterBone: 'back', holsterOffset: { x: -0.15, y: 0.3, z: -0.05 },
    holsterRotation: { x: Math.PI * 0.7, y: 0, z: 0 }
  },
  axe: {
    id: 'axe', name: 'Battle Axe', type: 'melee', subtype: 'one_handed',
    damage: 35, attackSpeed: 0.9, range: 2.2, staminaCost: 20, knockback: 5,
    comboChain: ['chop_r', 'chop_l'], critMultiplier: 2.0, critChance: 0.08,
    blockReduction: 0.3, weight: 5,
    mesh: { type: 'axe', handleColor: 0x664422, headColor: 0x888899, handleLen: 0.55 },
    holdOffset: { x: 0, y: 0, z: 0 }, holdRotation: { x: 0, y: 0, z: 0 },
    holsterBone: 'back', holsterOffset: { x: 0.15, y: 0.3, z: -0.05 },
    holsterRotation: { x: Math.PI * 0.7, y: 0, z: Math.PI * 0.2 }
  },
  dagger: {
    id: 'dagger', name: 'Steel Dagger', type: 'melee', subtype: 'one_handed',
    damage: 15, attackSpeed: 2.0, range: 1.5, staminaCost: 8, knockback: 1,
    comboChain: ['stab', 'stab', 'slash', 'stab'], critMultiplier: 2.5, critChance: 0.2,
    blockReduction: 0.2, weight: 1,
    mesh: { type: 'dagger', bladeColor: 0xbbbbdd, hiltColor: 0x443322, bladeLen: 0.25 },
    holdOffset: { x: 0, y: 0, z: 0 }, holdRotation: { x: 0, y: 0, z: 0 },
    holsterBone: 'hip', holsterOffset: { x: 0.15, y: 0, z: 0 },
    holsterRotation: { x: 0, y: 0, z: Math.PI * 0.5 }
  },
  hammer: {
    id: 'hammer', name: 'War Hammer', type: 'melee', subtype: 'two_handed',
    damage: 50, attackSpeed: 0.6, range: 2.8, staminaCost: 30, knockback: 8,
    comboChain: ['overhead', 'sweep'], critMultiplier: 1.8, critChance: 0.05,
    blockReduction: 0.4, weight: 8,
    mesh: { type: 'hammer', handleColor: 0x554433, headColor: 0x666677, handleLen: 0.8 },
    holdOffset: { x: 0, y: 0, z: 0 }, holdRotation: { x: 0, y: 0, z: 0 },
    holsterBone: 'back', holsterOffset: { x: 0, y: 0.4, z: -0.1 },
    holsterRotation: { x: Math.PI * 0.6, y: 0, z: 0 }
  },
  spear: {
    id: 'spear', name: 'Iron Spear', type: 'melee', subtype: 'two_handed',
    damage: 30, attackSpeed: 1.0, range: 3.5, staminaCost: 18, knockback: 4,
    comboChain: ['thrust', 'sweep', 'thrust'], critMultiplier: 1.7, critChance: 0.12,
    blockReduction: 0.3, weight: 4,
    mesh: { type: 'spear', shaftColor: 0x664422, tipColor: 0xccccdd, shaftLen: 1.2 },
    holdOffset: { x: 0, y: 0, z: 0 }, holdRotation: { x: 0, y: 0, z: 0 },
    holsterBone: 'back', holsterOffset: { x: 0.1, y: 0.5, z: -0.05 },
    holsterRotation: { x: Math.PI * 0.8, y: 0, z: 0 }
  },
  katana: {
    id: 'katana', name: 'Katana', type: 'melee', subtype: 'one_handed',
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
    id: 'pistol', name: '9mm Pistol', type: 'ranged', subtype: 'pistol',
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
    id: 'rifle', name: 'Assault Rifle', type: 'ranged', subtype: 'rifle',
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
    id: 'shotgun', name: 'Pump Shotgun', type: 'ranged', subtype: 'shotgun',
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
    id: 'smg', name: 'SMG', type: 'ranged', subtype: 'smg',
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
    id: 'sniper', name: 'Sniper Rifle', type: 'ranged', subtype: 'sniper',
    damage: 75, fireRate: 40, range: 200, spread: 0.5, maxSpread: 4,
    spreadGrowth: 3, spreadRecovery: 2,
    recoilV: 8, recoilH: 0.5, recoilRecovery: 2,
    magSize: 5, reloadTime: 3.5, bulletSpeed: Infinity,
    headshotMult: 3.0, adsZoom: 3.0, adsSpeed: 0.25, weight: 6,
    mesh: { type: 'sniper', bodyColor: 0x2a3a2a, stockColor: 0x443322, scopeColor: 0x111111 },
    muzzleFlash: { size: 0.35, duration: 0.05, color: 0xffaa00 },
    tracer: { color: 0xffffff, width: 0.015, duration: 0.1 },
    holdOffset: { x: 0, y: -0.05, z: -0.2 }, holdRotation: { x: -Math.PI/2, y: 0, z: 0 },
    holsterBone: 'back', holsterOffset: { x: -0.12, y: 0.3, z: -0.08 },
    holsterRotation: { x: Math.PI * 0.85, y: 0, z: 0 }
  },
  bow: {
    id: 'bow', name: 'Longbow', type: 'ranged', subtype: 'bow',
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
  const m = data.mesh;
  const group = new THREE.Group();
  group.userData.weaponId = weaponId;
  group.userData.weaponData = data;
  
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
export class CharacterController {
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
  }
  
  _setupInput() {
    window.addEventListener('keydown', e => {
      this.keys[e.key.toLowerCase()] = true;
      if (e.key === 'Shift') this.isRunning = true;
    });
    window.addEventListener('keyup', e => {
      this.keys[e.key.toLowerCase()] = false;
      if (e.key === 'Shift') this.isRunning = false;
    });
    
    // Mouse look
    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement) {
        this.cameraYaw -= e.movementX * 0.003;
        this.cameraPitch = Math.max(-0.5, Math.min(1.2, this.cameraPitch + e.movementY * 0.003));
      }
    });
  }
  
  async loadCharacter(type = 'adventurer') {
    const config = this.characterModels[type];
    if (!config) return 'Unknown character: ' + type;
    
    // Remove old model
    if (this.model) {
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
        
        // Fix position to ground — calculate groundOffset from bounding box
        const box2 = new THREE.Box3().setFromObject(this.model);
        this.groundOffset = -box2.min.y; // Distance from model origin to feet
        this.position.y = _getTerrainY(this.position.x, this.position.z);
        this.model.position.copy(this.position);
        this.model.position.y = this.position.y + this.groundOffset;
        this.model.userData.groundOffset = this.groundOffset;
        
        this.model.castShadow = true;
        this.model.traverse(child => {
          if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
        });
        this.scene.add(this.model);
        
        // Detect bone sockets for weapon attachment
        this.sockets = {};
        this.model.traverse(node => {
          if (node.isBone || node.type === 'Bone') {
            const n = node.name.toLowerCase();
            // Hand sockets — support Mixamo (RightHand), Wolf3D, and KayKit (PalmR) rigs
            if ((n.includes('righthand') || n.includes('right_hand') || n.includes('r_hand') || n === 'palmr' || n === 'palm_r') && !n.includes('thumb') && !n.includes('middle') && !n.includes('finger') && !this.sockets.hand_r) this.sockets.hand_r = node;
            else if ((n.includes('lefthand') || n.includes('left_hand') || n.includes('l_hand') || n === 'palml' || n === 'palm_l') && !n.includes('thumb') && !n.includes('middle') && !n.includes('finger') && !this.sockets.hand_l) this.sockets.hand_l = node;
            else if ((n.includes('rightforearm') || n.includes('right_forearm') || n.includes('r_forearm') || n === 'lowerarmr' || n === 'lower_arm_r') && !this.sockets.forearm_r) this.sockets.forearm_r = node;
            else if ((n.includes('leftforearm') || n.includes('left_forearm') || n === 'lowerarml' || n === 'lower_arm_l') && !this.sockets.forearm_l) this.sockets.forearm_l = node;
            else if ((n.includes('spine') && (n.includes('2') || n.includes('1')) || n === 'torso' || n === 'abdomen') && !this.sockets.back) this.sockets.back = node;
            else if ((n.includes('rightupleg') || n.includes('righthip') || n.includes('r_thigh') || n === 'upperlegr') && !this.sockets.hip_r) this.sockets.hip_r = node;
            else if ((n.includes('leftupleg') || n.includes('lefthip') || n.includes('l_thigh') || n === 'upperlegl') && !this.sockets.hip_l) this.sockets.hip_l = node;
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
        this.objects.push(this.model);
        this.model.userData.name = 'player_' + type;
        this.model.userData.isPlayer = true;
        
        // Find bones for procedural animation (Wolf3D/Mixamo rig)
        this.proceduralAnim = config.procedural || false;
        if (this.proceduralAnim) {
          this.bones = {};
          this.model.traverse(node => {
            if (node.isBone || node.type === 'Bone') {
              const n = node.name.toLowerCase();
              if (n.includes('hips') && !this.bones.hips) this.bones.hips = node;
              else if (n.includes('spine') && !n.includes('1') && !n.includes('2') && !this.bones.spine) this.bones.spine = node;
              else if (n === 'spine1' || n === 'spine1') this.bones.spine1 = node;
              else if (n.includes('leftupperleg') || n.includes('leftupleg')) this.bones.leftLeg = node;
              else if (n.includes('rightupperleg') || n.includes('rightupleg')) this.bones.rightLeg = node;
              else if (n.includes('leftlowerleg') || n.includes('leftleg')) this.bones.leftKnee = node;
              else if (n.includes('rightlowerleg') || n.includes('rightleg')) this.bones.rightKnee = node;
              else if (n.includes('leftshoulder') && !this.bones.leftShoulder) this.bones.leftShoulder = node;
              else if (n.includes('rightshoulder') && !this.bones.rightShoulder) this.bones.rightShoulder = node;
              else if (n.includes('leftarm') && !n.includes('fore') && !this.bones.leftArm) this.bones.leftArm = node;
              else if (n.includes('rightarm') && !n.includes('fore') && !this.bones.rightArm) this.bones.rightArm = node;
              else if (n.includes('leftforearm')) this.bones.leftForearm = node;
              else if (n.includes('rightforearm')) this.bones.rightForearm = node;
              else if (n.includes('head') && !n.includes('top') && !n.includes('eye') && !this.bones.head) this.bones.head = node;
              else if (n.includes('neck') && !this.bones.neck) this.bones.neck = node;
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
        
        // Setup animations
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
        this.model.position.set(this.position.x, this.position.y + (this.groundOffset || 0), this.position.z);
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
      if (slot < 0) slot = this.activeSlot; // Replace current
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
    
    // If this is the active slot, put in hand
    if (slot === this.activeSlot) {
      this._attachWeaponToHand(weaponId);
    } else {
      this._attachWeaponToHolster(weaponId, slot);
    }
    
    this.equippedWeapon = this.weaponSlots[this.activeSlot];
    return '⚔️ Equipped ' + data.name + ' in slot ' + (slot + 1);
  }
  
  unequipWeapon(slot = -1) {
    if (slot < 0) slot = this.activeSlot;
    const weaponId = this.weaponSlots[slot];
    if (!weaponId) return 'No weapon in slot ' + (slot + 1);
    
    this._removeWeaponMesh(slot);
    this.weaponSlots[slot] = null;
    this.equippedWeapon = this.weaponSlots[this.activeSlot];
    
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
      // Auto-scale weapon to match character size
      // Get character height and scale weapon proportionally
      if (this.model) {
        const charBox = new THREE.Box3().setFromObject(this.model);
        const charHeight = charBox.getSize(new THREE.Vector3()).y;
        // Weapons designed for ~1.8m character, scale accordingly
        const weaponScale = Math.min(charHeight / 1.8, 1.5);
        mesh.scale.setScalar(weaponScale);
      }
      mesh.position.set(data.holdOffset.x, data.holdOffset.y, data.holdOffset.z);
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
    // Hitstop — brief frame pause on hit for impact feel
    if (this._hitstop && this._hitstop > 0) {
      this._hitstop -= dt;
      dt *= 0.1; // Near-freeze during hitstop
    }
    if (!this.model || this.isDead) return;
    if (this.mixer) this.mixer.update(dt);
    if (this.proceduralAnim) this._updateProceduralAnim(dt);
    if (this.inVehicle) return this._updateInVehicle(dt);
    
    // Movement input
    let moveX = 0, moveZ = 0;
    if (this.keys['w']) moveZ = -1;
    if (this.keys['s']) moveZ = 1;
    if (this.keys['a']) moveX = -1;
    if (this.keys['d']) moveX = 1;
    
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
      this.playAnimation('roll', true);
      this.playAnimation('roll', true);
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
    // Light attack: E or left click — fast, can chain 3 hits
    // Heavy attack: Q or right click — slow, big damage, knocks back
    if ((this.keys['e'] || this.keys['mouse0']) && !this.isAttacking && this.stamina > 5) {
      this.isAttacking = true; if (window._sound) window._sound.SFX.swordSwing();
      this._comboCount = (this._comboCount || 0) + 1;
      if (this._comboCount > 3) this._comboCount = 1;
      
      // Combo scaling: each hit in chain is faster + slightly more damage
      const comboDamageMulti = [1.0, 1.15, 1.4][this._comboCount - 1];
      const comboSpeedMulti = [1.0, 0.85, 0.7][this._comboCount - 1];
      const hitTime = Math.floor(150 * comboSpeedMulti);
      const recoveryTime = Math.floor(350 * comboSpeedMulti);
      
      this.stamina = Math.max(0, this.stamina - (8 + this._comboCount * 2));
      this._comboDamageMulti = comboDamageMulti;
      
      // Pick animation based on combo count
      const anims = ['attack', 'punch_right', 'kick_left'];
      const anim = this.animations[anims[this._comboCount - 1]] ? anims[this._comboCount - 1] : 'attack';
      this.playAnimation(anim, true);
      
      // Lunge forward slightly on attack
      this._attackLunge = 3.0 * comboSpeedMulti;
      
      // Damage at peak of swing
      setTimeout(() => {
        this._attackHitFrame = true;
      }, hitTime);
      
      // Recovery — can chain next attack during window
      setTimeout(() => {
        this.isAttacking = false;
        this._attackLunge = 0;
        // Combo window — reset combo if no follow-up within 600ms
        this._comboTimer = setTimeout(() => { this._comboCount = 0; }, 600);
      }, recoveryTime);
    }
    
    // Heavy attack: Q key — slower but massive damage + AOE knockback
    if (this.keys['q'] && !this.isAttacking && this.stamina > 25) {
      this.isAttacking = true; if (window._sound) window._sound.SFX.heavyAttack();
      this._comboCount = 0; // Reset combo
      this.stamina = Math.max(0, this.stamina - 25);
      this._comboDamageMulti = 2.5; // Heavy hit
      this._isHeavyAttack = true;
      
      const anim = this.animations['jump_attack'] ? 'jump_attack' : (this.animations['sword_slash'] ? 'sword_slash' : 'attack');
      this.playAnimation(anim, true);
      
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
      this.jumpVelocity = this.jumpForce; if (window._sound) window._sound.SFX.jump();
      this.isGrounded = false;
      this.playAnimation('jump', true);
    }
    
    // Apply gravity — ground check uses terrain height, not y=0
    if (!this.isGrounded) {
      this.jumpVelocity += this.gravity * dt;
      this.position.y += this.jumpVelocity * dt;
      // Get ground height at current position (terrain or y=0)
      let groundY = 0;
      const tm = window._terrainMesh || (typeof terrainMesh !== 'undefined' ? terrainMesh : null);
      if (tm) {
        const _rc = new THREE.Raycaster(
          new THREE.Vector3(this.position.x, this.position.y + 100, this.position.z),
          new THREE.Vector3(0, -1, 0)
        );
        const _hits = _rc.intersectObject(tm);
        if (_hits.length > 0) groundY = _hits[0].point.y;
      }
      if (this.position.y <= groundY) {
        this.position.y = groundY;
        this.isGrounded = true;
        this.jumpVelocity = 0;
      }
    } else {
      // Even when grounded, snap to terrain (walking uphill/downhill)
      const tm = window._terrainMesh || (typeof terrainMesh !== 'undefined' ? terrainMesh : null);
      if (tm) {
        const _rc = new THREE.Raycaster(
          new THREE.Vector3(this.position.x, this.position.y + 100, this.position.z),
          new THREE.Vector3(0, -1, 0)
        );
        const _hits = _rc.intersectObject(tm);
        if (_hits.length > 0) {
          const groundY = _hits[0].point.y;
          // Snap to ground if close, fall if too far above
          if (Math.abs(this.position.y - groundY) < 0.5) {
            // Smooth ground following on hills
            const _dy = groundY - this.position.y;
            this.position.y += _dy * (_dy > 0 ? 0.25 : 0.35); // Faster downhill
          } else if (this.position.y > groundY + 0.5) {
            // Walking off edge — start falling
            this.isGrounded = false;
            this.jumpVelocity = 0;
          }
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
    
    if (hasInput && !this.isRolling && !this.isAttacking) {
      const cameraAngle = this.cameraYaw;
      const moveAngle = Math.atan2(moveX, moveZ);
      const targetRotation = cameraAngle + moveAngle;
      
      // Smooth rotation
      let diff = targetRotation - this.rotation;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.rotation += diff * Math.min(1, dt * 10);
      
      this.speed = THREE.MathUtils.lerp(this.speed, targetSpeed, dt * 8);
      
      this.position.x += Math.sin(this.rotation) * this.speed * dt;
      this.position.z += Math.cos(this.rotation) * this.speed * dt;
      if (window._sound && this.speed > 0.5) window._sound.updateFootsteps(dt, true, this.isRunning);
    } else if (!this.isRolling) {
      this.speed = THREE.MathUtils.lerp(this.speed, 0, dt * 10);
    }
    
    // Rolling movement
    if (this.isRolling) {
      this.position.x += Math.sin(this.rotation) * this.rollSpeed * dt;
      this.position.z += Math.cos(this.rotation) * this.rollSpeed * dt;
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
      // Door interaction — find nearest door
      const doorObj = this.objects.find(o => {
        if (!o.userData.name || !o.userData.name.toLowerCase().includes('door')) return false;
        return this.position.distanceTo(o.position) < 3;
      });
      if (doorObj) {
        doorObj.rotation.y += Math.PI / 2; // Toggle open/close
        doorObj.userData.isOpen = !doorObj.userData.isOpen;
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
    
    // Update model position/rotation
    this.model.position.set(this.position.x, this.position.y + (this.groundOffset || 0), this.position.z);
    // Keep feet on ground (account for model origin offset)
    const modelBox = new THREE.Box3().setFromObject(this.model);
    if (this.isGrounded) {
      // Only recalc ground offset occasionally to save perf
    }
    this.model.rotation.y = this.rotation;
    
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
    
    // Update camera
    this._updateCamera(dt);
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
      if (window._terrainMesh) {
        const charHead = new THREE.Vector3(this.position.x, this.position.y + 1.6, this.position.z);
        const toCamera = new THREE.Vector3().subVectors(desiredPos, charHead);
        const dist = toCamera.length();
        toCamera.normalize();
        const ray = new THREE.Raycaster(charHead, toCamera, 0.3, dist);
        const hits = ray.intersectObject(window._terrainMesh);
        if (hits.length > 0) {
          // Camera would clip terrain — move it closer
          const safeDist = hits[0].distance - 0.3;
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
      
      // FOV transition for aiming
      const targetFOV = THREE.MathUtils.lerp(this.normalFOV, this.aimFOV, this.aimLerp);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, Math.min(1, 6 * dt));
      this.camera.updateProjectionMatrix();
      
      // Character rotation: face where camera looks when moving or aiming
      if (this.model && (this.isAiming || this.isMoving)) {
        const targetRot = this.cameraYaw + Math.PI;
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
      this.camera.rotation.y = this.cameraYaw + Math.PI;
      this.camera.rotation.x = -this.cameraPitch;
      
      // FOV for sprint
      const sprintFOV = this.isSprinting ? 70 : this.normalFOV;
      const targetFOV = THREE.MathUtils.lerp(sprintFOV, this.aimFOV, this.aimLerp);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, Math.min(1, 6 * dt));
      this.camera.updateProjectionMatrix();
    }
  }
  
  _updateInVehicle(dt) {
    // When in vehicle, move the vehicle instead
    const v = this.inVehicle;
    let moveZ = 0, turn = 0;
    if (this.keys['w']) moveZ = 1;
    if (this.keys['s']) moveZ = -1;
    if (this.keys['a']) turn = 1;
    if (this.keys['d']) turn = -1;
    
    const vehicleSpeed = 15;
    v.userData.rotation = (v.userData.rotation || 0) + turn * 2 * dt;
    v.rotation.y = v.userData.rotation;
    v.position.x += Math.sin(v.userData.rotation) * moveZ * vehicleSpeed * dt;
    v.position.z += Math.cos(v.userData.rotation) * moveZ * vehicleSpeed * dt;
    
    // Camera follows vehicle
    this.position.copy(v.position);
    this._updateCamera(dt);
    
    // Exit vehicle
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
    this.playAnimation('interact', true);
    
    // Hide exterior, show interior
    // Teleport player inside
    this.position.set(building.position.x, 0, building.position.z);
    
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
    
    // Move player outside
    this.position.set(this.inBuilding.position.x + 4, 0, this.inBuilding.position.z);
    
    // Remove interior furniture
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
      ['house_interior_pack_lamp_1', -2, 1, 2],
      // Decor
      ['house_interior_pack_carpet_round', 0, 0, 4],
      ['house_interior_pack_plant_1', 2.5, 2.5, 2],
      ['house_interior_pack_plate_1', 0, 0.8, 1.5],
    ];
    
    const loader = new GLTFLoader();
// Get terrain height at world position
function _getTerrainY(x, z) {
  const tm = window._terrainMesh;
  if (!tm) return 0;
  const rc = new THREE.Raycaster(new THREE.Vector3(x, 500, z), new THREE.Vector3(0, -1, 0));
  const hits = rc.intersectObject(tm);
  return hits.length > 0 ? hits[0].point.y : 0;
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
    this.position.set(
      this.inVehicle.position.x + 3,
      0,
      this.inVehicle.position.z
    );
    this.inVehicle = null;
    if (this.model) {
      this.model.visible = true;
      this.model.position.copy(this.position);
    }
  }
  
  toggleCameraMode() {
    this.cameraMode = this.cameraMode === '3rd' ? '1st' : '3rd';
    if (this.model) this.model.visible = this.cameraMode === '3rd';
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
        }
      }
    }
    
    // Hit feedback — brief slow-mo effect (hitstop)
    if (hitCount > 0) {
      this._hitstop = 0.05; if (window._sound) window._sound.SFX.swordHit();
    }
  }
  
  checkPickups(objects, scene) {
    if (!this.model) return null;
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (!obj.userData.isPickup) continue;
      const dist = this.position.distanceTo(obj.position);
      if (dist < 2) {
        const data = obj.userData.pickupData;
        scene.remove(obj);
        objects.splice(i, 1);
        if (window._sound) window._sound.SFX.pickup(); return this._processPickup(data);
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
    
    // Red screen flash
    let flash = document.getElementById('damage-flash');
    if (!flash) {
      flash = document.createElement('div');
      flash.id = 'damage-flash';
      flash.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,0,0,0.3);pointer-events:none;z-index:9999;opacity:0;transition:opacity 0.15s;';
      document.body.appendChild(flash);
    }
    flash.style.opacity = '1';
    setTimeout(() => { flash.style.opacity = '0'; }, 150);
    
    if (this.health <= 0) {
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
  
  respawn() {
    this.health = this.maxHealth;
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
    // Remove existing dialogue
    const old = document.getElementById('npc-dialogue');
    if (old) old.remove();
    
    const div = document.createElement('div');
    div.id = 'npc-dialogue';
    div.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);max-width:500px;width:90%;background:rgba(0,0,0,0.9);backdrop-filter:blur(10px);border:1px solid #ff6b35;border-radius:12px;padding:16px;z-index:10000;font-family:monospace;color:#e0e0e0;';
    
    const nameEl = document.createElement('div');
    nameEl.style.cssText = 'color:#ff6b35;font-weight:bold;margin-bottom:8px;font-size:0.9rem;';
    nameEl.textContent = (npc.type || 'NPC').charAt(0).toUpperCase() + (npc.type || 'npc').slice(1);
    div.appendChild(nameEl);
    
    const textEl = document.createElement('div');
    textEl.style.cssText = 'font-size:0.8rem;line-height:1.5;min-height:40px;';
    div.appendChild(textEl);
    
    const hint = document.createElement('div');
    hint.style.cssText = 'color:#666;font-size:0.65rem;margin-top:8px;text-align:right;';
    hint.textContent = 'Press E to close';
    div.appendChild(hint);
    
    document.body.appendChild(div);
    
    // Typewriter effect
    const fullText = lines.join('\n\n');
    let charIdx = 0;
    const typeInterval = setInterval(() => {
      if (charIdx < fullText.length) {
        textEl.textContent += fullText[charIdx];
        charIdx++;
      } else {
        clearInterval(typeInterval);
      }
    }, 30);
    
    // Auto-remove after 8 seconds
    setTimeout(() => { if (div.parentNode) div.remove(); clearInterval(typeInterval); }, 8000);
  }

}


export { WEAPON_DATABASE, createWeaponMesh };

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
    const npcModels = {
      'villager': 'modular_men_casual',
      'soldier': 'modular_men_swat',
      'knight': 'modular_men_adventurer',
      'guard': 'modular_men_swat',
      'king': 'modular_men_king',
      'punk': 'modular_men_punk',
      'worker': 'modular_men_worker',
      'farmer': 'modular_men_farmer',
      'woman': 'modular_women_adventurer',
      'witch': 'modular_women_witch',
      'medieval': 'modular_women_medieval',
      'scifi': 'modular_women_scifi',
    };
    
    const file = npcModels[type] || npcModels['villager'];
    
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
        
        // Setup animations
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
              if (n.includes('hips') && !npc.bones.hips) npc.bones.hips = node;
              else if (n.includes('spine') && !n.includes('1') && !n.includes('2') && !npc.bones.spine) npc.bones.spine = node;
              else if (n.includes('leftupperleg') || n.includes('leftupleg')) npc.bones.leftLeg = node;
              else if (n.includes('rightupperleg') || n.includes('rightupleg')) npc.bones.rightLeg = node;
              else if (n.includes('leftlowerleg') || n.includes('leftleg')) npc.bones.leftKnee = node;
              else if (n.includes('rightlowerleg') || n.includes('rightleg')) npc.bones.rightKnee = node;
              else if (n.includes('leftarm') && !n.includes('fore') && !npc.bones.leftArm) npc.bones.leftArm = node;
              else if (n.includes('rightarm') && !n.includes('fore') && !npc.bones.rightArm) npc.bones.rightArm = node;
              else if (n.includes('leftforearm')) npc.bones.leftForearm = node;
              else if (n.includes('rightforearm')) npc.bones.rightForearm = node;
              else if (n.includes('head') && !n.includes('top') && !n.includes('eye') && !npc.bones.head) npc.bones.head = node;
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
        this.npcs.push(npc);
        if (behavior === 'aggro') {
          npc.isAggro = true;
          npc.attackDamage = 3 + Math.floor(Math.random() * 4);
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
      if (slot < 0) slot = this.activeSlot; // Replace current
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
    
    // If this is the active slot, put in hand
    if (slot === this.activeSlot) {
      this._attachWeaponToHand(weaponId);
    } else {
      this._attachWeaponToHolster(weaponId, slot);
    }
    
    this.equippedWeapon = this.weaponSlots[this.activeSlot];
    return '⚔️ Equipped ' + data.name + ' in slot ' + (slot + 1);
  }
  
  unequipWeapon(slot = -1) {
    if (slot < 0) slot = this.activeSlot;
    const weaponId = this.weaponSlots[slot];
    if (!weaponId) return 'No weapon in slot ' + (slot + 1);
    
    this._removeWeaponMesh(slot);
    this.weaponSlots[slot] = null;
    this.equippedWeapon = this.weaponSlots[this.activeSlot];
    
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
      // Auto-scale weapon to match character size
      // Get character height and scale weapon proportionally
      if (this.model) {
        const charBox = new THREE.Box3().setFromObject(this.model);
        const charHeight = charBox.getSize(new THREE.Vector3()).y;
        // Weapons designed for ~1.8m character, scale accordingly
        const weaponScale = Math.min(charHeight / 1.8, 1.5);
        mesh.scale.setScalar(weaponScale);
      }
      mesh.position.set(data.holdOffset.x, data.holdOffset.y, data.holdOffset.z);
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
      
      if (npc.behavior === 'wander') {
        npc.waitTime -= dt;
        if (npc.waitTime <= 0) {
          // Pick new waypoint
          npc.waitTime = 3 + Math.random() * 5;
          const _wx = npc.model.position.x + (Math.random() - 0.5) * 20;
          const _wz = npc.model.position.z + (Math.random() - 0.5) * 20;
          const _wy = _getTerrainY(_wx, _wz);
          // Don't wander into water
          if (_wy < -0.1) {
            // Stay near current position
            npc.waypoint.copy(npc.homePosition);
          } else {
            npc.waypoint.set(_wx, _wy, _wz);
          }
        }
        
        // Move toward waypoint
        const dir = new THREE.Vector3().subVectors(npc.waypoint, npc.model.position);
        dir.y = 0;
        const dist = dir.length();
        if (dist > 1) {
          dir.normalize();
          // Snap NPC Y to terrain surface (using stored groundOffset — no bounding box recalc)
          const _npcTY = _getTerrainY(npc.model.position.x, npc.model.position.z);
          if (_npcTY > -0.1) { // Only snap if on land
            const _go = npc.model.userData.groundOffset || 0;
            const targetY = _npcTY + _go;
            // Smooth lerp for natural hill walking (not instant snap)
            const dy = targetY - npc.model.position.y;
            if (Math.abs(dy) < 2) {
              npc.model.position.y += dy * (dy > 0 ? 0.2 : 0.3); // Faster downhill
            } else {
              npc.model.position.y = targetY; // Teleport if too far
            }
          }
          
          // Vehicle/object collision check — NPCs avoid solid objects
          const nextPos = npc.model.position.clone().addScaledVector(dir, npc.speed * dt);
          let blocked = false;
          for (const obj of this.objects) {
            if (!obj.userData.name || obj === npc.model) continue;
            const n = (obj.userData.name || '').toLowerCase();
            if (n.includes('ground') || n.includes('road') || n.includes('interior')) continue;
            if (obj.userData.isWater) { const wd = nextPos.distanceTo(obj.position); const wb = obj.userData._bbox || (obj.userData._bbox = new THREE.Box3().setFromObject(obj)); const ws = wb.getSize(new THREE.Vector3()); const wr = Math.max(ws.x, ws.z) * 0.5; if (wd < wr) { blocked = true; { const _bx = npc.model.position.x + (Math.random()-0.5)*15; const _bz = npc.model.position.z + (Math.random()-0.5)*15; npc.waypoint.set(_bx, _getTerrainY(_bx, _bz), _bz); } npc.waitTime = 0.5; break; } continue; }
            const d = nextPos.distanceTo(obj.position);
            // Get approx radius from bounding box
            const box = obj.userData._bbox || (obj.userData._bbox = new THREE.Box3().setFromObject(obj));
            const size = box.getSize(new THREE.Vector3());
            const radius = Math.max(size.x, size.z) * 0.5 + 0.5;
            if (d < radius) {
              blocked = true;
              // Pick new waypoint to go around
              npc.waypoint.set(
                npc.model.position.x + (Math.random() - 0.5) * 15,
                0,
                npc.model.position.z + (Math.random() - 0.5) * 15
              );
              npc.waitTime = 0.5;
              break;
            }
          }
          if (!blocked) npc.model.position.addScaledVector(dir, npc.speed * dt);
          npc.model.rotation.y = Math.atan2(dir.x, dir.z);
          
          // Switch to walk anim
          if (npc.animations.walk && npc.currentAnim !== 'walk') {
            if (npc.animations.idle) npc.animations.idle.fadeOut(0.3);
            npc.animations.walk.reset().fadeIn(0.3).play();
            npc.currentAnim = 'walk';
          }
        } else {
          // At waypoint, idle
          if (npc.animations.idle && npc.currentAnim !== 'idle') {
            if (npc.animations.walk) npc.animations.walk.fadeOut(0.3);
            npc.animations.idle.reset().fadeIn(0.3).play();
            npc.currentAnim = 'idle';
          }
        }
      } else if (npc.behavior === 'aggro' && npc.aggroTarget) {
        // Chase and attack player
        const toPlayer = new THREE.Vector3().subVectors(npc.aggroTarget, npc.model.position);
        toPlayer.y = 0;
        const distToPlayer = toPlayer.length();
        npc.attackCooldown = Math.max(0, npc.attackCooldown - dt);
        
        if (distToPlayer > npc.attackRange) {
          // Chase
          toPlayer.normalize();
          npc.model.position.addScaledVector(toPlayer, (npc.speed * 1.5) * dt);
          npc.model.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
          if (npc.animations.run && npc.currentAnim !== 'run') {
            Object.values(npc.animations).forEach(a => a && a.fadeOut(0.2));
            npc.animations.run.reset().fadeIn(0.2).play();
            npc.currentAnim = 'run';
          } else if (!npc.animations.run && npc.animations.walk && npc.currentAnim !== 'walk') {
            Object.values(npc.animations).forEach(a => a && a.fadeOut(0.2));
            npc.animations.walk.reset().fadeIn(0.2).play();
            npc.currentAnim = 'walk';
          }
        } else {
          // In attack range - attack player
          npc.model.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
          npc._attackTimer = (npc._attackTimer || 0) - dt;
          
          if (npc._attackTimer <= 0) {
            npc._attackTimer = npc.isRanged ? 1.5 + Math.random() : 1.2 + Math.random() * 0.8;
            
            // Play attack animation
            if (npc.animations.attack) {
              Object.values(npc.animations).forEach(a => a && a.fadeOut(0.15));
              npc.animations.attack.reset().fadeIn(0.15).play();
              npc.currentAnim = 'attack';
            }
            
            // DEAL DAMAGE to player
            const player = this.characterController;
            if (player && typeof player.health === 'number') {
              const dmg = npc.attackDamage || 5;
              player.health = Math.max(0, player.health - dmg);
              
              // Visual feedback — screen flash red
              if (typeof window._damageFlash === 'function') window._damageFlash();
              
              // Floating damage number on player
              if (typeof window._floatingDamage === 'function') {
                window._floatingDamage(player.position || player.model?.position, dmg, false);
              }
              
              // Ranged — create bullet tracer
              if (npc.isRanged && player.model) {
                const from = npc.model.position.clone(); from.y += 1;
                const to = player.model.position.clone(); to.y += 1;
                this._createBulletTracer(from, to);
                // Muzzle flash
                this._muzzleFlash(npc.model.position, npc.model.rotation.y);
              }
              
              // Check death
              if (player.health <= 0) {
                if (typeof window._playerDeath === 'function') window._playerDeath();
              }
            }
          } else {
            // Idle between attacks
            if (npc.animations.idle && npc.currentAnim !== 'idle' && npc.currentAnim !== 'attack') {
              Object.values(npc.animations).forEach(a => a && a.fadeOut(0.2));
              npc.animations.idle.reset().fadeIn(0.2).play();
              npc.currentAnim = 'idle';
            }
          }
        }
      } else if (npc.behavior === 'patrol') {
        // Walk between waypoints (not orbit)
        npc.waitTime -= dt;
        if (npc.waitTime <= 0) {
          npc.waitTime = 4 + Math.random() * 4;
          const home = npc.homePosition || npc.model.position.clone();
          if (!npc.homePosition) npc.homePosition = npc.model.position.clone();
          const _px = home.x + (Math.random() - 0.5) * 20;
          const _pz = home.z + (Math.random() - 0.5) * 20;
          npc.waypoint.set(_px, _getTerrainY(_px, _pz), _pz);
        }
        const dir = new THREE.Vector3().subVectors(npc.waypoint, npc.model.position);
        dir.y = 0;
        if (dir.length() > 1) {
          dir.normalize();
          npc.model.position.addScaledVector(dir, npc.speed * dt);
          // Terrain snap
          const _pty = _getTerrainY(npc.model.position.x, npc.model.position.z);
          if (_pty > -0.1) { const _pgo = npc.model.userData.groundOffset || 0; npc.model.position.y += ((_pty + _pgo) - npc.model.position.y) * 0.25; }
          npc.model.rotation.y = Math.atan2(dir.x, dir.z);
          if (npc.animations.walk && npc.currentAnim !== 'walk') {
            Object.values(npc.animations).forEach(a => a && a.fadeOut(0.3));
            npc.animations.walk.reset().fadeIn(0.3).play();
            npc.currentAnim = 'walk';
          }
        } else {
          if (npc.animations.idle && npc.currentAnim !== 'idle') {
            Object.values(npc.animations).forEach(a => a && a.fadeOut(0.3));
            npc.animations.idle.reset().fadeIn(0.3).play();
            npc.currentAnim = 'idle';
          }
        }
      } else if (npc.behavior === 'zone_guard') {
        // Idle patrol in small area until player triggers aggro
        if (!npc.isAggro) {
          // Idle patrol — small wander
          npc.waitTime -= dt;
          if (npc.waitTime <= 0) {
            npc.waitTime = 3 + Math.random() * 4;
            const home = npc.homePosition || npc.model.position.clone();
            if (!npc.homePosition) npc.homePosition = npc.model.position.clone();
            const _zgx = home.x + (Math.random() - 0.5) * 8;
            const _zgz = home.z + (Math.random() - 0.5) * 8;
            npc.waypoint.set(_zgx, _getTerrainY(_zgx, _zgz), _zgz);
          }
          const dir = new THREE.Vector3().subVectors(npc.waypoint, npc.model.position);
          dir.y = 0;
          if (dir.length() > 1) {
            dir.normalize();
            npc.model.position.addScaledVector(dir, npc.speed * 0.5 * dt);
            npc.model.rotation.y = Math.atan2(dir.x, dir.z);
            // Snap to terrain
            const _zgy2 = _getTerrainY(npc.model.position.x, npc.model.position.z);
            if (_zgy2 > -0.1) { const _zgo2 = npc.model.userData.groundOffset || 0; npc.model.position.y += ((_zgy2 + _zgo2) - npc.model.position.y) * 0.25; }
            if (npc.animations.walk && npc.currentAnim !== 'walk') {
              Object.values(npc.animations).forEach(a => a && a.fadeOut(0.3));
              npc.animations.walk.reset().fadeIn(0.3).play();
              npc.currentAnim = 'walk';
            }
          } else if (npc.animations.idle && npc.currentAnim !== 'idle') {
            Object.values(npc.animations).forEach(a => a && a.fadeOut(0.3));
            npc.animations.idle.reset().fadeIn(0.3).play();
            npc.currentAnim = 'idle';
          }
        } else {
          // Aggro — chase player
          if (npc.aggroTarget) {
            const toPlayer = new THREE.Vector3().subVectors(npc.aggroTarget, npc.model.position);
            toPlayer.y = 0;
            const distToPlayer = toPlayer.length();
            npc.attackCooldown = Math.max(0, npc.attackCooldown - dt);
            
            if (distToPlayer > 2.5) {
              toPlayer.normalize();
              npc.model.position.addScaledVector(toPlayer, npc.speed * 1.3 * dt);
              // Snap to terrain while chasing
              const _chy = _getTerrainY(npc.model.position.x, npc.model.position.z);
              if (_chy > -0.1) { const _cho = npc.model.userData.groundOffset || 0; npc.model.position.y += ((_chy + _cho) - npc.model.position.y) * 0.25; }
              npc.model.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
              if (npc.animations.run && npc.currentAnim !== 'run') {
                Object.values(npc.animations).forEach(a => a && a.fadeOut(0.2));
                npc.animations.run.reset().fadeIn(0.2).play();
                npc.currentAnim = 'run';
              } else if (!npc.animations.run && npc.animations.walk && npc.currentAnim !== 'walk') {
                Object.values(npc.animations).forEach(a => a && a.fadeOut(0.2));
                npc.animations.walk.reset().fadeIn(0.2).play();
                npc.currentAnim = 'walk';
              }
            } else {
              // In attack range — play attack anim
              npc.model.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
              if (npc.animations.attack && npc.currentAnim !== 'attack') {
                Object.values(npc.animations).forEach(a => a && a.fadeOut(0.15));
                npc.animations.attack.reset().fadeIn(0.15).play();
                npc.currentAnim = 'attack';
              } else if (!npc.animations.attack && npc.animations.idle && npc.currentAnim !== 'idle') {
                Object.values(npc.animations).forEach(a => a && a.fadeOut(0.2));
                npc.animations.idle.reset().fadeIn(0.2).play();
                npc.currentAnim = 'idle';
              }
            }
          }
          
          // Leash — return home if player goes too far
          if (npc.homePosition) {
            const distFromHome = npc.model.position.distanceTo(npc.homePosition);
            if (distFromHome > 35) {
              npc.isAggro = false;
              npc.aggroTarget = null;
              npc.waypoint.copy(npc.homePosition);
            }
          }
        }
      } else if (npc.behavior === 'drive') {
        // Vehicle NPC - drive on roads
        npc.model.position.x += Math.sin(npc.direction) * npc.speed * dt;
        npc.model.position.z += Math.cos(npc.direction) * npc.speed * dt;
        // Snap to terrain
        const _dy = _getTerrainY(npc.model.position.x, npc.model.position.z);
        if (_dy > -0.1) { const _dgo = npc.model.userData.groundOffset || 0; npc.model.position.y = _dy + _dgo; }
        npc.model.rotation.y = npc.direction;
        // Bounce off boundaries
        if (Math.abs(npc.model.position.x) > 80 || Math.abs(npc.model.position.z) > 80) {
          npc.direction += Math.PI;
        }
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
      // Instant remove — no floating corpse
      npc.model.visible = false;
      setTimeout(() => {
        this.scene.remove(npc.model);
        this.npcs = this.npcs.filter(n => n !== npc);
      }, 100);
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
      m.userData.pickupData = loot;
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
  hud.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9998;display:none;font-family:monospace;';
  
  hud.innerHTML = `
    <div id="hud-health" style="position:absolute;top:20px;left:20px;">
      <div style="color:#ff4444;font-size:12px;margin-bottom:4px;">❤️ HEALTH</div>
      <div style="width:200px;height:12px;background:rgba(0,0,0,0.6);border:1px solid #ff4444;border-radius:6px;overflow:hidden;">
        <div id="hud-health-bar" style="width:100%;height:100%;background:linear-gradient(90deg,#ff2222,#ff6644);transition:width 0.3s;"></div>
      </div>
    </div>
    <div id="hud-stamina" style="position:absolute;top:50px;left:20px;">
      <div style="color:#44ff44;font-size:12px;margin-bottom:4px;">⚡ STAMINA</div>
      <div style="width:200px;height:8px;background:rgba(0,0,0,0.6);border:1px solid #44ff44;border-radius:4px;overflow:hidden;">
        <div id="hud-stamina-bar" style="width:100%;height:100%;background:linear-gradient(90deg,#22ff22,#66ff44);transition:width 0.3s;"></div>
      </div>
    </div>
    <div id="hud-score" style="position:absolute;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);padding:6px 20px;border:1px solid #f59e0b;border-radius:8px;color:#f59e0b;font-size:18px;">⭐ 0</div>
    <div id="hud-crosshair" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:rgba(255,255,255,0.5);font-size:24px;display:none;">+</div>
    <div id="hud-controls" style="position:absolute;bottom:20px;left:20px;color:rgba(255,255,255,0.5);font-size:11px;line-height:1.6;">
      WASD — Move | Shift — Run | Space — Jump<br>
      C — Roll | E — Light Attack | Q — Heavy Attack | F — Interact<br>
      V — Toggle 1st/3rd person | ESC — Exit play mode
    </div>
    <div id="hud-inventory" style="position:absolute;bottom:20px;right:20px;display:flex;gap:4px;">
    </div>
  `;
  
  document.body.appendChild(hud);
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
    let el = document.getElementById('xp-bar-container');
    if (el) return;
    el = document.createElement('div');
    el.id = 'xp-bar-container';
    el.style.cssText = 'position:fixed;top:75px;left:20px;width:200px;font-family:monospace;z-index:9998;pointer-events:none;';
    el.innerHTML = `
      <div style="color:#8b5cf6;font-size:10px;margin-bottom:2px;">LVL <span id="xp-level">1</span> — <span id="xp-current">0</span>/<span id="xp-next">100</span> XP</div>
      <div style="width:200px;height:6px;background:rgba(0,0,0,0.6);border:1px solid #8b5cf6;border-radius:3px;overflow:hidden;">
        <div id="xp-bar-fill" style="width:0%;height:100%;background:linear-gradient(90deg,#8b5cf6,#a78bfa);transition:width 0.3s;"></div>
      </div>
    `;
    document.body.appendChild(el);
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
    const lvl = document.getElementById('xp-level');
    const cur = document.getElementById('xp-current');
    const next = document.getElementById('xp-next');
    const fill = document.getElementById('xp-bar-fill');
    if (lvl) lvl.textContent = this.level;
    if (cur) cur.textContent = this.xp;
    if (next) next.textContent = this.xpToNext;
    if (fill) fill.style.width = (this.xp / this.xpToNext * 100) + '%';
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

// === DIALOGUE SYSTEM ===
export class DialogueSystem {
  constructor() {
    this.active = false;
    this.currentDialogue = null;
    this.currentIndex = 0;
    this.el = null;
  }
  
  _ensureUI() {
    if (this.el) return;
    this.el = document.createElement('div');
    this.el.id = 'dialogue-box';
    this.el.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);width:500px;max-width:90vw;background:rgba(0,0,0,0.9);border:2px solid #8b5cf6;border-radius:12px;padding:16px 20px;font-family:monospace;z-index:10001;display:none;';
    this.el.innerHTML = `
      <div id="dlg-speaker" style="color:#8b5cf6;font-size:14px;font-weight:bold;margin-bottom:6px;"></div>
      <div id="dlg-text" style="color:#e0e0e0;font-size:13px;line-height:1.5;min-height:40px;"></div>
      <div style="color:#666;font-size:10px;margin-top:8px;text-align:right;">Press SPACE or click to continue</div>
    `;
    this.el.style.pointerEvents = 'auto';
    this.el.style.cursor = 'pointer';
    this.el.addEventListener('click', () => this.advance());
    document.body.appendChild(this.el);
  }
  
  start(dialogue) {
    // dialogue: { speaker, lines: ['line1', 'line2', ...], onEnd }
    this._ensureUI();
    this.currentDialogue = dialogue;
    this.currentIndex = 0;
    this.active = true;
    this.el.style.display = 'block';
    this._showLine();
  }
  
  _showLine() {
    if (!this.currentDialogue) return;
    const speaker = document.getElementById('dlg-speaker');
    const text = document.getElementById('dlg-text');
    if (speaker) speaker.textContent = this.currentDialogue.speaker || 'NPC';
    if (text) {
      // Typewriter effect
      const line = this.currentDialogue.lines[this.currentIndex];
      text.textContent = '';
      let i = 0;
      const type = () => {
        if (i < line.length) {
          text.textContent += line[i];
          i++;
          setTimeout(type, 20);
        }
      };
      type();
    }
  }
  
  advance() {
    if (!this.active || !this.currentDialogue) return;
    this.currentIndex++;
    if (this.currentIndex >= this.currentDialogue.lines.length) {
      this.end();
    } else {
      this._showLine();
    }
  }
  
  end() {
    this.active = false;
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
  el.style.cssText = 'position:fixed;bottom:20px;left:20px;width:' + size + 'px;height:' + size + 'px;border-radius:50%;border:2px solid rgba(255,255,255,0.3);overflow:hidden;z-index:9998;pointer-events:none;background:rgba(0,0,0,0.5);';
  
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
        ctx.fillStyle = npc.isAggro ? '#ff3333' : '#33aaff';
        ctx.beginPath(); ctx.arc(dx, dz, 3, 0, Math.PI*2); ctx.fill();
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
  if (!hud) return;
  
  const healthBar = document.getElementById('hud-health-bar');
  const staminaBar = document.getElementById('hud-stamina-bar');
  const scoreEl = document.getElementById('hud-score');
  const crosshair = document.getElementById('hud-crosshair');
  
  if (healthBar) healthBar.style.width = (character.health / character.maxHealth * 100) + '%';
  if (staminaBar) staminaBar.style.width = (character.stamina / character.maxStamina * 100) + '%';
  if (scoreEl) scoreEl.textContent = '⭐ ' + score;
  if (crosshair) crosshair.style.display = 'block'; // Show crosshair in both FPS and TPS
}
