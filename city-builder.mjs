// ═══════════════════════════════════════════════════════════
// CITY BUILDER MODULE — extracted from engine.mjs
// Includes: Gerstner lake, mine interior, asset decomposition,
//           UE building system, city world 3, template presets,
//           city vehicle animation
// ═══════════════════════════════════════════════════════════

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLB_MODELS } from './model-registry.mjs';
import { createGerstnerWaterMaterial } from './weather.mjs';

// ── Module-local scene/objects/engine bridge via setters ──
let _scene = null;
let _objects = null;
let _renderer = null;
let _camera = null;
let _controls = null;
let _currentGround = null;
let _bloomPass = null;
let _showToast = (msg) => console.log('[city-builder]', msg);
let _loadGLBModel = null;
let _parseAndExecute = null;
let _RGBELoader = null;

const gltfLoader = new GLTFLoader();

export function setCityBuilderScene(s) { _scene = s; }
export function setCityBuilderObjects(o) { _objects = o; }
export function setCityBuilderRenderer(r) { _renderer = r; }
export function setCityBuilderCamera(c) { _camera = c; }
export function setCityBuilderControls(c) { _controls = c; }
export function setCityBuilderBloomPass(b) { _bloomPass = b; }
export function setCityBuilderShowToast(fn) { _showToast = fn; }
export function setCityBuilderLoadGLBModel(fn) { _loadGLBModel = fn; }
export function setCityBuilderParseAndExecute(fn) { _parseAndExecute = fn; }
export function setCityBuilderRGBELoader(loader) { _RGBELoader = loader; }

// Convenience accessors
function scene() { return _scene; }
function objects() { return _objects || []; }
function showToast(msg, duration) { _showToast(msg, duration); }
function loadGLBModel(...args) { if (_loadGLBModel) return _loadGLBModel(...args); }

function buildGerstnerLake(radius, preset) {
  // Use the WATER_PRESETS system for consistent, good-looking water
  const presetName = preset || 'calm';
  const segs = 128;
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2, segs, segs);
  // Clip to circle by masking vertices outside radius
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getY(i); // PlaneGeometry uses Y as Z before rotation
    if (Math.sqrt(x*x + z*z) > radius) {
      pos.setXYZ(i, 0, 0, 0); // collapse outside verts to center (hidden under shore ring)
    }
  }
  geo.attributes.position.needsUpdate = true;
  // Use the existing preset material system — calm is clear, low-wave, beautiful
  const mat = createGerstnerWaterMaterial(presetName);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.08;
  mesh.userData.isWater = true;
  mesh.userData.isLake = true;
  mesh.userData.isGerstnerWater = true;
  mesh.userData.isAnimatedWater = true;
  mesh.userData.waterPreset = presetName;
  return mesh;
}
window.buildGerstnerLake = buildGerstnerLake;



// ============================================================
// AFRICAN SLATE QUARRY WORLD — v3 (proper engine clear)
// ============================================================
// [REMOVED] buildQuarryWorld — old world builder deleted



// ============================================================
// CITY WORLD v2 — Downtown + Residential + AI Traffic
// ============================================================
// [REMOVED] buildCityWorld — old world builder deleted

// ============================================================
// OLD MINE CAVE INTERIOR — inside the African Slate Quarry
// ============================================================
function buildMineInterior() {
  const TUNNEL_W = 10;    // tunnel width
  const TUNNEL_H = 8;     // tunnel height
  const TUNNEL_L = 18;    // tunnel segment length
  const WALL_C   = 0x2a1f14; // dark cave rock
  const FLOOR_C  = 0x1e160e;
  const CEIL_C   = 0x221a10;
  const SUPPORT_C= 0x3d2810; // wood support beams

  const caveMat    = new THREE.MeshStandardMaterial({ color: WALL_C, roughness: 1.0 });
  const floorMat   = new THREE.MeshStandardMaterial({ color: FLOOR_C, roughness: 1.0 });
  const ceilMat    = new THREE.MeshStandardMaterial({ color: CEIL_C, roughness: 1.0 });
  const supportMat = new THREE.MeshStandardMaterial({ color: SUPPORT_C, roughness: 1.0 });

  // Add a dim torch-like point light inside a tunnel segment
  function addTorchLight(x, y, z, color=0xff8833, intensity=3, dist=18) {
    const light = new THREE.PointLight(color, intensity, dist);
    light.position.set(x, y, z);
    light.castShadow = false;
    _scene.add(light);
    // Torch visual (small glowing sphere)
    const torch = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 6, 4),
      new THREE.MeshStandardMaterial({ color: 0xffaa22, emissive: 0xff8800, emissiveIntensity: 3 })
    );
    torch.position.set(x, y - 0.4, z);
    _scene.add(torch);
  }

  // Build one tunnel segment (closed box with open ends)
  function buildTunnelSeg(cx, cy, cz, length, angle, isChamber=false) {
    const W = isChamber ? TUNNEL_W * 2.5 : TUNNEL_W;
    const H = isChamber ? TUNNEL_H * 1.8 : TUNNEL_H;
    const L = isChamber ? length * 1.5 : length;
    const group = new THREE.Group();

    // Floor
    const floorSeg = new THREE.Mesh(new THREE.BoxGeometry(W, 0.6, L), floorMat.clone());
    floorSeg.position.y = -H/2 + 0.3;
    group.add(floorSeg);

    // Ceiling with irregular bumps
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(W, 1.5, L), ceilMat.clone());
    ceil.position.y = H/2 - 0.5;
    group.add(ceil);

    // Left wall
    const wallL = new THREE.Mesh(new THREE.BoxGeometry(1.2, H, L), caveMat.clone());
    wallL.position.x = -W/2 + 0.6;
    group.add(wallL);

    // Right wall
    const wallR = new THREE.Mesh(new THREE.BoxGeometry(1.2, H, L), caveMat.clone());
    wallR.position.x = W/2 - 0.6;
    group.add(wallR);

    // Back wall (closed end) — only for dead ends
    if (!isChamber) {
      const backWall = new THREE.Mesh(new THREE.BoxGeometry(W, H, 1.0), caveMat.clone());
      backWall.position.z = L/2 - 0.5;
      // Don't add back wall — tunnels connect
    }

    // Wood support beams every 5 units
    const beamCount = Math.floor(L / 5);
    for (let b = 0; b < beamCount; b++) {
      const bz = -L/2 + 3 + b * 5;
      // Left post
      const postL = new THREE.Mesh(new THREE.BoxGeometry(0.4, H - 1, 0.4), supportMat);
      postL.position.set(-W/2 + 1.8, 0, bz);
      group.add(postL);
      // Right post
      const postR = new THREE.Mesh(new THREE.BoxGeometry(0.4, H - 1, 0.4), supportMat);
      postR.position.set(W/2 - 1.8, 0, bz);
      group.add(postR);
      // Top crossbeam
      const beam = new THREE.Mesh(new THREE.BoxGeometry(W - 2.4, 0.5, 0.4), supportMat);
      beam.position.set(0, H/2 - 1, bz);
      group.add(beam);
    }

    // Torch lights
    addTorchLight(cx + Math.cos(angle + Math.PI/2) * (W/2 - 2), cy + H/2 - 1.5,
      cz + Math.sin(angle + Math.PI/2) * (L * 0.3));

    group.position.set(cx, cy, cz);
    group.rotation.y = angle;
    group.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    _scene.add(group);
    return group;
  }

  // ── CAVE ENTRANCE ─────────────────────────────────────────
  // Carved into the quarry wall at the base — dark opening
  const ENTRY_ANGLE = Math.PI * 0.7; // where on the quarry wall the entrance is
  const WALL_BASE_R = 178; // at the base of the quarry wall
  const entryX = Math.cos(ENTRY_ANGLE) * WALL_BASE_R;
  const entryZ = Math.sin(ENTRY_ANGLE) * WALL_BASE_R;

  // Dark archway entrance
  const archMat = new THREE.MeshStandardMaterial({ color: 0x0d0a07, roughness: 1.0 });
  const archGroup = new THREE.Group();

  // Frame the entrance with dark rock
  const archTop = new THREE.Mesh(new THREE.BoxGeometry(TUNNEL_W + 4, 2, 3), archMat);
  archTop.position.y = TUNNEL_H / 2 + 1;
  archGroup.add(archTop);
  const archLeft = new THREE.Mesh(new THREE.BoxGeometry(2, TUNNEL_H + 2, 3), archMat);
  archLeft.position.set(-(TUNNEL_W/2 + 1), 0, 0);
  archGroup.add(archLeft);
  const archRight = new THREE.Mesh(new THREE.BoxGeometry(2, TUNNEL_H + 2, 3), archMat);
  archRight.position.set(TUNNEL_W/2 + 1, 0, 0);
  archGroup.add(archRight);

  // Darkness fill (so the opening looks deep/dark)
  const darkFill = new THREE.Mesh(
    new THREE.BoxGeometry(TUNNEL_W, TUNNEL_H, 1),
    new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1.0 })
  );
  darkFill.position.z = 1.5;
  archGroup.add(darkFill);

  archGroup.position.set(entryX, TUNNEL_H / 2, entryZ);
  archGroup.rotation.y = ENTRY_ANGLE + Math.PI;
  _scene.add(archGroup);

  // Sign above entrance
  const signMat = new THREE.MeshStandardMaterial({ color: 0x5a3a18, roughness: 1.0 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(8, 1.5, 0.3), signMat);
  sign.position.set(entryX, TUNNEL_H + 3, entryZ);
  sign.rotation.y = ENTRY_ANGLE + Math.PI;
  _scene.add(sign);

  // ── TUNNEL NETWORK ────────────────────────────────────────
  // Main corridor going inward (toward quarry center, underground)
  const tunnelDir = ENTRY_ANGLE + Math.PI; // inward direction
  const UNDERGROUND_Y = -TUNNEL_H / 2; // flush with ground

  // Main shaft goes straight in
  for (let i = 0; i < 5; i++) {
    buildTunnelSeg(
      entryX + Math.cos(tunnelDir) * (TUNNEL_L * i + TUNNEL_L/2),
      UNDERGROUND_Y,
      entryZ + Math.sin(tunnelDir) * (TUNNEL_L * i + TUNNEL_L/2),
      TUNNEL_L, tunnelDir
    );
  }

  // Chamber 1 — main cavern after 5 segments
  const chamber1X = entryX + Math.cos(tunnelDir) * (TUNNEL_L * 5.5);
  const chamber1Z = entryZ + Math.sin(tunnelDir) * (TUNNEL_L * 5.5);
  buildTunnelSeg(chamber1X, UNDERGROUND_Y - 2, chamber1Z, TUNNEL_L * 2, tunnelDir, true);

  // Left branch from chamber
  const leftAngle = tunnelDir - Math.PI / 2.5;
  for (let i = 0; i < 3; i++) {
    buildTunnelSeg(
      chamber1X + Math.cos(leftAngle) * (TUNNEL_L * i + TUNNEL_L/2),
      UNDERGROUND_Y - 2,
      chamber1Z + Math.sin(leftAngle) * (TUNNEL_L * i + TUNNEL_L/2),
      TUNNEL_L, leftAngle
    );
  }

  // Right branch from chamber
  const rightAngle = tunnelDir + Math.PI / 2.5;
  for (let i = 0; i < 4; i++) {
    buildTunnelSeg(
      chamber1X + Math.cos(rightAngle) * (TUNNEL_L * i + TUNNEL_L/2),
      UNDERGROUND_Y - 2,
      chamber1Z + Math.sin(rightAngle) * (TUNNEL_L * i + TUNNEL_L/2),
      TUNNEL_L, rightAngle
    );
  }

  // Deep shaft — goes further down into the earth
  const deepAngle = tunnelDir - Math.PI / 8;
  for (let i = 0; i < 3; i++) {
    buildTunnelSeg(
      chamber1X + Math.cos(deepAngle) * (TUNNEL_L * (i + 2)),
      UNDERGROUND_Y - 2 - i * 3,
      chamber1Z + Math.sin(deepAngle) * (TUNNEL_L * (i + 2)),
      TUNNEL_L, deepAngle
    );
  }

  // Chamber 2 — deeper, bigger
  const chamber2X = chamber1X + Math.cos(deepAngle) * (TUNNEL_L * 5.5);
  const chamber2Z = chamber1Z + Math.sin(deepAngle) * (TUNNEL_L * 5.5);
  buildTunnelSeg(chamber2X, UNDERGROUND_Y - 8, chamber2Z, TUNNEL_L * 2.5, deepAngle, true);

  // Ambient light for the cave (dim, cool)
  const caveAmb = new THREE.AmbientLight(0x221a0a, 0.15);
  _scene.add(caveAmb);

  console.log('[MINE] Cave interior built — entry at:', entryX.toFixed(0), entryZ.toFixed(0));
  return { entryX, entryZ, entryAngle: ENTRY_ANGLE };
}

// Place Old Mine assets inside the cave tunnels
function populateMineAssets(caveInfo, aliases) {
  const { entryX, entryZ, entryAngle } = caveInfo;
  const tunnelDir = entryAngle + Math.PI;
  const UNDERGROUND_Y = -4;
  const TUNNEL_L = 18;

  const mineItems = Object.entries(aliases)
    .filter(([k]) => k.startsWith('old_mine_') && /\d$/.test(k))
    .sort(([a],[b]) => a.localeCompare(b));

  mineItems.forEach(([alias, relPath], i) => {
    const fullPath = relPath.startsWith('/models/') ? relPath : '/models/' + relPath;
    // Spread along the main corridor and branches
    const seg = Math.floor(i / 3);
    const side = (i % 3) - 1; // -1, 0, 1
    const branchChoice = i % 5;
    let bx, by, bz;
    if (branchChoice < 2) {
      // Main corridor
      bx = entryX + Math.cos(tunnelDir) * (TUNNEL_L * (seg % 5) + 4);
      bz = entryZ + Math.sin(tunnelDir) * (TUNNEL_L * (seg % 5) + 4);
      bx += Math.cos(tunnelDir + Math.PI/2) * side * 3;
      bz += Math.sin(tunnelDir + Math.PI/2) * side * 3;
      by = UNDERGROUND_Y;
    } else if (branchChoice < 4) {
      // Left branch
      const la = tunnelDir - Math.PI / 2.5;
      const chamber1X = entryX + Math.cos(tunnelDir) * (TUNNEL_L * 5.5);
      const chamber1Z = entryZ + Math.sin(tunnelDir) * (TUNNEL_L * 5.5);
      bx = chamber1X + Math.cos(la) * (TUNNEL_L * (seg % 3) + 4);
      bz = chamber1Z + Math.sin(la) * (TUNNEL_L * (seg % 3) + 4);
      bx += Math.cos(la + Math.PI/2) * side * 3;
      bz += Math.sin(la + Math.PI/2) * side * 3;
      by = UNDERGROUND_Y - 2;
    } else {
      // Right branch
      const ra = tunnelDir + Math.PI / 2.5;
      const chamber1X = entryX + Math.cos(tunnelDir) * (TUNNEL_L * 5.5);
      const chamber1Z = entryZ + Math.sin(tunnelDir) * (TUNNEL_L * 5.5);
      bx = chamber1X + Math.cos(ra) * (TUNNEL_L * (seg % 4) + 4);
      bz = chamber1Z + Math.sin(ra) * (TUNNEL_L * (seg % 4) + 4);
      bx += Math.cos(ra + Math.PI/2) * side * 2.5;
      bz += Math.sin(ra + Math.PI/2) * side * 2.5;
      by = UNDERGROUND_Y - 2;
    }

    setTimeout(() => {
      gltfLoader.load(fullPath, (gltf) => {
        const model = gltf.scene;
        model.traverse(c => {
          if (c.isMesh) {
            c.castShadow = true;
            c.receiveShadow = true;
            // Darken materials slightly for underground feel
            if (c.material) {
              const mats = Array.isArray(c.material) ? c.material : [c.material];
              mats.forEach(m => { if (m.color) m.color.multiplyScalar(0.65); });
            }
          }
        });

        // Scale mine assets to fit in tunnels — medium size
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 0.01);
        const s = (1.5 + Math.random() * 2.0) / maxDim;
        model.scale.setScalar(s);

        const finalBox = new THREE.Box3().setFromObject(model);
        model.position.set(bx, by - finalBox.min.y * model.scale.x, bz);
        model.rotation.y = Math.random() * Math.PI * 2;
        model.userData.isPlaced = true;
        model.userData.isMineAsset = true;
        _scene.add(model);
        _objects.push(model);
      }, null, () => {});
    }, i * 150 + 2000); // stagger after quarry rocks load
  });
}


// ============================================================
// ASSET DECOMPOSITION — extract individual pieces from group GLBs
// ============================================================
const _groupedAssets = {
  'street_props': {
    path: '/models/fab/street_props_streeprops.glb',
    pieces: ['Ad poster','Pole','Power box','Public phone box','Bus stop',
      'street light','Street light','Pole metal','Bike parking','Cone',
      'Water Cannister','Construction asset','Road sign','fence',
      'Road bumper','power pole','cement block','bike1','bike2',
      'air conditioner','box1','box2','Curb','parking place','parking spots',
      'bench','vending machine','Trash bin','Trash bin cover','Cannister',
      'Stop sign','barbwire fence','Road stopper','Road Bunner',
      'traffic light','Construction Cone','Fire hydrant','newspaper stand',
      'Road block','trailer','Wooden pallet','Recycling bin']
  }
};

// Cache loaded group GLB scenes
const _groupCache = {};

function loadGroupedAsset(groupName, pieceName, x, z, onDone) {
  const group = _groupedAssets[groupName];
  if (!group) { console.warn('Unknown group:', groupName); return; }

  const place = (cachedScene) => {
    // Find the named node
    let target = null;
    cachedScene.traverse(o => {
      if (o.name && o.name.toLowerCase() === pieceName.toLowerCase()) target = o;
    });
    if (!target) {
      // Fuzzy match
      cachedScene.traverse(o => {
        if (o.name && o.name.toLowerCase().includes(pieceName.toLowerCase().split(' ')[0])) {
          if (!target) target = o;
        }
      });
    }
    if (!target) { showToast('\u26a0 Piece not found: ' + pieceName); return; }

    const piece = target.clone(true);
    piece.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });

    // Center + place
    const box = new THREE.Box3().setFromObject(piece);
    const center = box.getCenter(new THREE.Vector3());
    piece.position.set(x - center.x, -box.min.y, z - center.z);
    piece.userData.isPlaced = true;
    piece.userData.pieceOf = groupName;
    piece.userData.pieceName = pieceName;
    piece.name = pieceName;
    _scene.add(piece);
    _objects.push(piece);
    showToast('\u2705 Placed: ' + pieceName);
    if (onDone) onDone(piece);
  };

  if (_groupCache[groupName]) {
    place(_groupCache[groupName]);
    return;
  }

  // Load the group GLB once, cache it
  showToast('Loading ' + groupName + '...');
  gltfLoader.load(group.path, (gltf) => {
    _groupCache[groupName] = gltf.scene;
    place(gltf.scene);
  }, null, (e) => showToast('\u274c Failed to load ' + groupName));
}

window.loadGroupedAsset = loadGroupedAsset;
window._groupedAssets = _groupedAssets;

// List all pieces of a group asset
function listGroupPieces(groupName) {
  const group = _groupedAssets[groupName];
  if (!group) return [];
  return group.pieces;
}
window.listGroupPieces = listGroupPieces;


// Build a ground-level showcase of all assets from a named pack
async function buildPackShowcase(packPrefix, packName, count) {
  try {
    const aliases = window._fabAliases || {};
    const waitForAliases = (cb) => {
      if (window._fabAliases && Object.keys(window._fabAliases).length > 50) { cb(window._fabAliases); return; }
      setTimeout(() => waitForAliases(cb), 200);
    };
    waitForAliases(async (aliases) => {
      showToast(`\ud83d\udce6 Loading ${packName}...`);
      // Gather all aliases for this pack
      const items = Object.entries(aliases)
        .filter(([k]) => k.startsWith(packPrefix + '_') && /\d/.test(k))
        .sort(([a],[b]) => a.localeCompare(b));

      const COLS = 8;
      const SPACING = 8;
      const startX = -(Math.min(items.length, COLS) * SPACING) / 2;

      items.forEach(([alias, relPath], i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const x = startX + col * SPACING;
        const z = row * SPACING;
        const fullPath = relPath.startsWith('/models/') ? relPath : '/models/' + relPath;
        const label = alias;
        loadGLBModel(label, label, x, z, null, fullPath);
      });
      showToast(`\u2705 ${packName}: ${items.length} assets placed in a grid`);
    });
  } catch(e) {
    showToast('\u274c ' + e.message);
  }
}
window.buildPackShowcase = buildPackShowcase;

// [REMOVED] buildForestLakeWorld — old world builder deleted

// ════════════════════════════════════════════════════════════════════════════
// CITY WORLD 2 — Advanced procedural city with zones, parks, pools, NPCs
// Command: "city 2" / "city world 2" / "second city"
// ════════════════════════════════════════════════════════════════════════════
// [REMOVED] buildCityWorld2 — old world builder deleted




// ════════════════════════════════════════════════════════════════════════════
// City World 3 v4 — modern skyscrapers (R2), 3 bridges, visible cars+people
// ════════════════════════════════════════════════════════════════════════════

// === UE BUILDING COLOR SYSTEM ===
// UE5 Matrix Awakens pieces are grey (no textures), so we tint them on load
const UE_ZONE_COLORS = {
  downtown: [0x889999, 0xaa9988, 0x8888aa, 0x998877, 0xaabbcc, 0xbbaa99, 0x778899, 0xccbbaa],
  commercial: [0xcc9966, 0xbb8855, 0xaa7744, 0xddaa77, 0xcc8844, 0xbb9977],
  residential: [0xddccbb, 0xccbbaa, 0xeeddcc, 0xbbccdd, 0xccddcc, 0xddcccc, 0xaabbcc],
  industrial: [0x777780, 0x888890, 0x666670, 0x999988],
};
function loadUEBuilding(key, x, y, z, scale, ry, zoneType) {
  const path = GLB_MODELS[key] || key;
  const url = '/models/' + (path.endsWith('.glb') ? path.slice(0,-4) : path) + '.glb';
  const colors = UE_ZONE_COLORS[zoneType] || UE_ZONE_COLORS.residential;
  const color = colors[Math.floor((x*137+z*89+y*53) % colors.length + colors.length) % colors.length];

  return new Promise(res => {
    gltfLoader.load(url, g => {
      const m = g.scene;
      m.position.set(x, y, z);
      m.scale.setScalar(scale);
      if (ry) m.rotation.y = ry;
      // Apply zone color to all meshes (UE pieces are grey)
      m.traverse(n => {
        if (n.isMesh) {
          n.castShadow = true;
          n.receiveShadow = true;
          // Clone material so we don't affect other instances
          if (n.material) {
            n.material = n.material.clone();
            n.material.color = new THREE.Color(color);
            n.material.roughness = 0.85;
            n.material.metalness = zoneType === 'downtown' ? 0.3 : 0.05;
          }
        }
      });
      m.userData = { isGLB: true, isAutoCity: true, isBuilding: true, name: key };
      _scene.add(m);
      _objects.push(m);
      res(m);
    }, undefined, () => res(null));
  });
}

// UE wall piece catalog for city builder
const UE_WALLS = {
  downtown: [
    'ue_sm_bldg_nyg_l01_a_wall_01_n1','ue_sm_bldg_nyg_l03_a_wall_02_n1','ue_sm_bldg_nyg_l05_a_wall_02_n1',
    'ue_sm_bldg_nyg_l07_a_wall_02_n1','ue_sm_bldg_nyg_l08_a_wall_02_n1','ue_sm_bldg_nyg_l10_a_wall_02_n1',
    'ue_sm_bldg_nya_l6_f_wall_02_n1','ue_sm_bldg_nya_l7_f_wall_01_n1',
  ],
  commercial: [
    'ue_sm_bldg_sfb_l1_a_wall_01_n1','ue_sm_bldg_sfb_l2_a_wall_01_n1','ue_sm_bldg_sfb_l3_a_wall_01_n1',
    'ue_sm_bldg_sfe_l1_a1_wall_01_n1','ue_sm_bldg_sfj_l1_a1_wall_01_n1',
  ],
  residential: [
    'ue_sm_bldg_sfa_l1_a_wall_01_n1','ue_sm_bldg_sfa_l2_a_wall_01_n1','ue_sm_bldg_sfa_l3_a_wall_01_n1',
    'ue_sm_bldg_sfc_l1_a1_wall_01_n1','ue_sm_bldg_nyh_l1_a_wall_01_n1',
  ],
  industrial: [
    'ue_sm_bldg_sfd_l01_a_wall_01_n1','ue_sm_bldg_sfd_l01_a_wall_02_n1','ue_sm_bldg_sfd_l02_a_wall_01_n1',
  ],
};

async function buildCityWorld3() {
  try {
    showToast('\ud83c\udfd9\ufe0f Building GTA City...');

    const scene = _scene;
    const objects = _objects;
    const renderer = _renderer;
    const camera = _camera;
    const controls = _controls;
    let currentGround = _currentGround;
    const bloomPass = _bloomPass;
    const RGBELoader = _RGBELoader;

    // ═══ CLEANUP — remove previous auto-city objects ═══
    const toRemove = objects.filter(o => o.userData.isAutoCity);
    toRemove.forEach(o => scene.remove(o));
    for (let i = objects.length - 1; i >= 0; i--) {
      if (objects[i].userData.isAutoCity) objects.splice(i, 1);
    }
    scene.children.filter(o => o.userData.isAutoCityLight || o.userData.isAutoCityGround)
      .forEach(o => scene.remove(o));
    if (window._trafficCars) window._trafficCars = window._trafficCars.filter(c => !c.mesh?.userData?.isAutoCity);
    if (window._boatAnimFrame) { cancelAnimationFrame(window._boatAnimFrame); window._boatAnimFrame = null; }
    if (window._oceanWaveFrame) { cancelAnimationFrame(window._oceanWaveFrame); window._oceanWaveFrame = null; }
    // Remove ALL existing ground planes — grass terrain causes green bleed
    const oldGround = objects.filter(o =>
      o.userData.name === 'ground' ||
      o === currentGround ||
      o === window._currentGround ||
      (o.geometry?.parameters?.width >= 400) ||
      (o.material?.color && o.material.color.g > 0.4 && o.material.color.r < 0.5 && o.geometry?.parameters?.width >= 100)
    );
    oldGround.forEach(o => {
      scene.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
      const idx = objects.indexOf(o);
      if (idx >= 0) objects.splice(idx, 1);
    });
    // Also search scene directly for any green planes
    const greenKill = [];
    scene.traverse(o => {
      if (o.isMesh && o.geometry?.parameters?.width >= 400 && !o.userData.isAutoCity) greenKill.push(o);
    });
    greenKill.forEach(o => { scene.remove(o); if(o.geometry) o.geometry.dispose(); });
    currentGround = null; window._currentGround = null;

    // ═══ LOAD ASSET MANIFEST ═══
    const assets = await fetch('city_assets.json').then(r => r.json());

    // ═══ SEEDED PRNG (deterministic layout) ═══
    let _seed = 77731; // Curated seed — produces clean layout
    const rand = () => { _seed = (_seed * 16807) % 2147483647; return (_seed - 1) / 2147483646; };
    const pick = arr => arr[Math.floor(rand() * arr.length)];
    const rr = (lo, hi) => lo + rand() * (hi - lo);

    // ═══ GRID CONSTANTS ═══
    const G = 8;                    // 8×8 city blocks
    const SEG = 10;                 // road piece size (units)
    const BLK = 40;                 // city block size
    const CELL = BLK + SEG;        // 50 — node-to-node spacing
    const HALF = G * CELL / 2;     // 200 — half-city extent

    // Block center & grid-node position helpers
    const bc = (c, r) => ({ x: -HALF + CELL / 2 + c * CELL, z: -HALF + CELL / 2 + r * CELL });
    const np = (c, r) => ({ x: -HALF + c * CELL, z: -HALF + r * CELL });
    const tag = o => { o.userData.isAutoCity = true; return o; };

    // ═══ DISTRICT MAP — GTA-style ring layout ═══
    // Downtown core → Commercial ring → Residential sprawl → Industrial corner
    const getDist = (c, r) => {
      if (c >= 6 && r >= 6) return 'industrial';
      const dx = Math.abs(c - 3.5), dz = Math.abs(r - 3.5);
      if (dx <= 1 && dz <= 1) return 'downtown';
      if (dx <= 2 && dz <= 2) return 'commercial';
      return 'residential';
    };

    // ═══ SCENE SETUP ═══
    // Sky — set solid blue immediately, then load HDRI
    scene.background = new THREE.Color(0x7EC8E3);
    scene.fog = new THREE.FogExp2(0xc0d8f0, 0.0008);
    // Load HDRI sky with clouds (async, will replace blue when ready)
    try {
      if (typeof RGBELoader !== 'undefined' && RGBELoader) {
        new RGBELoader().load(
          'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr',
          (tex) => {
            tex.mapping = THREE.EquirectangularReflectionMapping;
            scene.background = tex;
            scene.environment = tex;
            window._envMap = tex;
            showToast('\u2601\ufe0f HDRI sky loaded!');
          },
          undefined,
          () => { console.warn('[city] HDRI failed, keeping blue sky'); }
        );
      }
    } catch(e) { /* keep blue sky */ }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    scene.children.filter(o => o.isLight).forEach(l => scene.remove(l));

    // Sun — warm key light with shadows
    const sun = new THREE.DirectionalLight(0xfff5e0, 2.5);
    sun.position.set(150, 200, 100);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -400;
    sun.shadow.camera.right = sun.shadow.camera.top = 400;
    sun.shadow.camera.far = 800;
    sun.userData.isAutoCityLight = true;
    scene.add(sun);

    // Ambient sky fill
    const amb = new THREE.AmbientLight(0xd0e8ff, 0.9);
    amb.userData.isAutoCityLight = true;
    scene.add(amb);

    // Cool fill light from opposite side
    const fill = new THREE.DirectionalLight(0xa0c0ff, 0.4);
    fill.position.set(-100, 80, -120);
    fill.userData.isAutoCityLight = true;
    scene.add(fill);

    // ═══ CLOUDS — animated puffy clouds ═══
    const _cloudGrp = new THREE.Group();
    _cloudGrp.userData.isAutoCity = true;
    const _cMat = new THREE.MeshLambertMaterial({color:0xffffff, transparent:true, opacity:0.82});
    for (let ci = 0; ci < 45; ci++) {
      const cg = new THREE.Group();
      const puffs = 3 + Math.floor(Math.random() * 5);
      for (let p = 0; p < puffs; p++) {
        const sz = 8 + Math.random() * 18;
        const pf = new THREE.Mesh(new THREE.SphereGeometry(sz, 7, 5), _cMat);
        pf.scale.set(1 + Math.random(), 0.35 + Math.random()*0.25, 0.8 + Math.random()*0.5);
        pf.position.set(p*14 - puffs*7, Math.random()*5, Math.random()*10 - 5);
        cg.add(pf);
      }
      cg.position.set((Math.random()-0.5)*1000, 150 + Math.random()*80, (Math.random()-0.5)*900);
      cg.userData.cSpd = 0.015 + Math.random()*0.04;
      cg.userData.isAutoCity = true;
      _cloudGrp.add(cg);
    }
    scene.add(_cloudGrp); objects.push(_cloudGrp);
    if (window._cloudAnim) cancelAnimationFrame(window._cloudAnim);
    (function _acl() {
      window._cloudAnim = requestAnimationFrame(_acl);
      for (const c of _cloudGrp.children) {
        c.position.x += c.userData.cSpd;
        if (c.position.x > 500) c.position.x = -500;
      }
    })();

    // ═══ PROCEDURAL WINDOW TEXTURES ═══
    // Generate building facade textures with windows programmatically
    function makeBuildingTexture(baseColor, windowRows, windowCols, width, height) {
      const cv = document.createElement('canvas');
      cv.width = width || 128; cv.height = height || 256;
      const ctx = cv.getContext('2d');
      // Base wall color
      ctx.fillStyle = baseColor || '#c8bca8';
      ctx.fillRect(0, 0, cv.width, cv.height);
      // Add subtle noise/grain
      for (let i = 0; i < 200; i++) {
        const x = Math.random() * cv.width;
        const y = Math.random() * cv.height;
        const brightness = Math.random() * 20 - 10;
        ctx.fillStyle = brightness > 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
        ctx.fillRect(x, y, 2, 2);
      }
      // Windows
      const wRows = windowRows || 6;
      const wCols = windowCols || 4;
      const wMargin = cv.width * 0.12;
      const wGapX = (cv.width - wMargin * 2) / wCols;
      const wGapY = (cv.height - wMargin * 2) / wRows;
      const wW = wGapX * 0.55;
      const wH = wGapY * 0.6;
      for (let r = 0; r < wRows; r++) {
        for (let c = 0; c < wCols; c++) {
          const wx = wMargin + c * wGapX + (wGapX - wW) / 2;
          const wy = wMargin + r * wGapY + (wGapY - wH) / 2;
          // Window frame
          ctx.fillStyle = '#333840';
          ctx.fillRect(wx - 1, wy - 1, wW + 2, wH + 2);
          // Glass — varies between lit and dark
          const isLit = Math.random() > 0.6;
          if (isLit) {
            ctx.fillStyle = Math.random() > 0.5 ? '#ffe8a0' : '#f0d880'; // warm interior light
          } else {
            ctx.fillStyle = Math.random() > 0.5 ? '#6088a8' : '#507090'; // dark reflective glass
          }
          ctx.fillRect(wx, wy, wW, wH);
          // Glass reflection highlight
          ctx.fillStyle = 'rgba(200,220,240,0.15)';
          ctx.fillRect(wx, wy, wW * 0.4, wH * 0.3);
        }
      }
      // Ground floor — different (storefront or entrance)
      const gfY = cv.height - wMargin - wGapY * 0.3;
      ctx.fillStyle = '#555';
      ctx.fillRect(wMargin, gfY, cv.width - wMargin * 2, cv.height - gfY - 4);
      // Door
      ctx.fillStyle = '#3a3a3a';
      const doorW = wGapX * 0.6;
      const doorX = cv.width / 2 - doorW / 2;
      ctx.fillRect(doorX, gfY, doorW, cv.height - gfY - 4);

      const tex = new THREE.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }

    // Pre-generate a few building facade textures
    const facadeTextures = {
      downtown: [
        makeBuildingTexture('#b0aaa0', 12, 6, 256, 512),
        makeBuildingTexture('#a0a8b0', 10, 5, 256, 512),
        makeBuildingTexture('#c0b8a8', 14, 7, 256, 512),
      ],
      commercial: [
        makeBuildingTexture('#c8bca8', 4, 4, 128, 256),
        makeBuildingTexture('#d0c4b0', 3, 3, 128, 256),
        makeBuildingTexture('#b8b0a0', 5, 4, 128, 256),
      ],
      residential: [
        makeBuildingTexture('#d8ccb8', 2, 3, 128, 128),
        makeBuildingTexture('#c8c0b0', 2, 2, 128, 128),
      ],
      industrial: [
        makeBuildingTexture('#888880', 3, 6, 256, 128),
        makeBuildingTexture('#808078', 2, 8, 256, 128),
      ],
    };
    window._facadeTextures = facadeTextures;

    // ═══ GROUND PLANE ═══
    const gndSize = HALF * 2 + 600;
    const gnd = tag(new THREE.Mesh(
      new THREE.PlaneGeometry(gndSize, gndSize),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
    ));
    gnd.rotation.x = -Math.PI / 2;
    gnd.position.y = -0.5;
    gnd.receiveShadow = true;
    gnd.userData.isAutoCityGround = true;
    scene.add(gnd); objects.push(gnd);
    currentGround = gnd; window._currentGround = gnd;

    // ═══ MODEL LOADING SYSTEM ═══
    const cache = {};

    const preload = path => new Promise(resolve => {
      if (cache[path]) return resolve(cache[path]);
      gltfLoader.load('/models/' + path, gltf => {
        cache[path] = gltf.scene;
        resolve(gltf.scene);
      }, undefined, () => {
        console.warn('[city] failed to load:', path);
        resolve(null);
      });
    });

    const batchPreload = async (paths, label) => {
      const uniq = [...new Set(paths.filter(Boolean))];
      for (let i = 0; i < uniq.length; i += 15) {
        showToast('\ud83d\udce6 ' + label + ' ' + Math.round(i / uniq.length * 100) + '%');
        await Promise.all(uniq.slice(i, i + 15).map(preload));
        await new Promise(r => setTimeout(r, 10));
      }
    };

    // Place model grounded (bottom of bounding box touches y=0)
    const placeGround = (path, x, z, sc, ry) => {
      const t = cache[path];
      if (!t) return null;
      const m = t.clone();
      m.scale.setScalar(sc || 1);
      m.rotation.y = ry || 0;
      m.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true;
        if (n.material && n.material.color) { const _c = n.material.color;
          // Desaturate cartoon colors → realistic + detect windows for glass
          const sat = Math.max(_c.r, _c.g, _c.b) - Math.min(_c.r, _c.g, _c.b);
          const matName = (n.material.name || n.name || '').toLowerCase();
          const isGlass = matName.includes('glass') || matName.includes('window') || matName.includes('vitr');
          const isBlueish = _c.b > 0.5 && _c.b > _c.r * 1.3 && _c.b > _c.g * 1.1;
          const isCyanish = _c.b > 0.4 && _c.g > 0.4 && _c.r < 0.3;

          if (isGlass || isBlueish || isCyanish) {
            // This is likely a window — make it glass!
            n.material = new THREE.MeshPhysicalMaterial({
              color: 0x88bbdd,
              metalness: 0.1,
              roughness: 0.05,
              transmission: 0.7,
              thickness: 0.3,
              ior: 1.5,
              transparent: true,
              opacity: 0.6,
              envMapIntensity: 1.5,
            });
          } else if (sat > 0.25 && !n.material.map) {
            // Desaturate cartoon colors by 65%
            n.material = n.material.clone();
            const avg = (_c.r + _c.g + _c.b) / 3;
            n.material.color.setRGB(
              _c.r * 0.2 + avg * 0.8,
              _c.g * 0.2 + avg * 0.8,
              _c.b * 0.2 + avg * 0.8
            );
            n.material.roughness = 0.75;
            n.material.metalness = 0.02;
          }
          if (_c.r > 0.92 && _c.g > 0.92 && _c.b > 0.92 && !n.material.map) {
            n.material = n.material.clone();
            // Apply procedural facade texture if available
            if (window._facadeTextures && n.geometry) {
              const box = new THREE.Box3().setFromObject(n);
              const sz = box.getSize(new THREE.Vector3());
              const isTall = sz.y > 3;
              const districtKey = isTall ? 'downtown' : (sz.y > 1.5 ? 'commercial' : 'residential');
              const texArr = window._facadeTextures[districtKey];
              if (texArr && texArr.length > 0) {
                n.material.map = texArr[Math.floor(Math.random() * texArr.length)];
                n.material.map.needsUpdate = true;
              }
            }
            const _t = [0xd8ccb8,0xc8bca8,0xb8b0a0,0xd0c8b8,0xc0b8a8,0xe0d8c8,0xc8c0b0,0xb0a898,0xd4ccc0,0xc0b4a4,0xa8a098,0xd8d0c0,0xc8c4b8,0xb8b4a8];
            n.material.color.setHex(_t[Math.floor(Math.random()*_t.length)]);
            n.material.roughness = 0.7 + Math.random()*0.2;
            n.material.metalness = 0.05; }}
      } });
      const box = new THREE.Box3().setFromObject(m);
      m.position.set(x, -box.min.y, z);
      m.userData = { isAutoCity: true, isGLB: true, name: path };
      scene.add(m); objects.push(m);
      return m;
    };

    // Place building — auto-scale to target height with footprint cap
    const placeBldg = (path, x, z, tgtH, maxFP, ry) => {
      const t = cache[path];
      if (!t) return null;
      const m = t.clone();
      m.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true;
        if (n.material && n.material.color) { const _c = n.material.color;
          // Desaturate cartoon colors → realistic + detect windows for glass
          const sat = Math.max(_c.r, _c.g, _c.b) - Math.min(_c.r, _c.g, _c.b);
          const matName = (n.material.name || n.name || '').toLowerCase();
          const isGlass = matName.includes('glass') || matName.includes('window') || matName.includes('vitr');
          const isBlueish = _c.b > 0.5 && _c.b > _c.r * 1.3 && _c.b > _c.g * 1.1;
          const isCyanish = _c.b > 0.4 && _c.g > 0.4 && _c.r < 0.3;

          if (isGlass || isBlueish || isCyanish) {
            // This is likely a window — make it glass!
            n.material = new THREE.MeshPhysicalMaterial({
              color: 0x88bbdd,
              metalness: 0.1,
              roughness: 0.05,
              transmission: 0.7,
              thickness: 0.3,
              ior: 1.5,
              transparent: true,
              opacity: 0.6,
              envMapIntensity: 1.5,
            });
          } else if (sat > 0.25 && !n.material.map) {
            // Desaturate cartoon colors by 65%
            n.material = n.material.clone();
            const avg = (_c.r + _c.g + _c.b) / 3;
            n.material.color.setRGB(
              _c.r * 0.2 + avg * 0.8,
              _c.g * 0.2 + avg * 0.8,
              _c.b * 0.2 + avg * 0.8
            );
            n.material.roughness = 0.75;
            n.material.metalness = 0.02;
          }
          if (_c.r > 0.92 && _c.g > 0.92 && _c.b > 0.92 && !n.material.map) {
            n.material = n.material.clone();
            // Apply procedural facade texture if available
            if (window._facadeTextures && n.geometry) {
              const box = new THREE.Box3().setFromObject(n);
              const sz = box.getSize(new THREE.Vector3());
              const isTall = sz.y > 3;
              const districtKey = isTall ? 'downtown' : (sz.y > 1.5 ? 'commercial' : 'residential');
              const texArr = window._facadeTextures[districtKey];
              if (texArr && texArr.length > 0) {
                n.material.map = texArr[Math.floor(Math.random() * texArr.length)];
                n.material.map.needsUpdate = true;
              }
            }
            const _t = [0xd8ccb8,0xc8bca8,0xb8b0a0,0xd0c8b8,0xc0b8a8,0xe0d8c8,0xc8c0b0,0xb0a898,0xd4ccc0,0xc0b4a4,0xa8a098,0xd8d0c0,0xc8c4b8,0xb8b4a8];
            n.material.color.setHex(_t[Math.floor(Math.random()*_t.length)]);
            n.material.roughness = 0.7 + Math.random()*0.2;
            n.material.metalness = 0.05; }}
      } });
      const b1 = new THREE.Box3().setFromObject(m);
      const sz = b1.getSize(new THREE.Vector3());
      let sc = tgtH / Math.max(sz.y, 0.1);
      const fp = Math.max(sz.x, sz.z, 0.1);
      if (fp * sc > (maxFP || 18)) sc = (maxFP || 18) / fp;
      m.scale.setScalar(sc);
      const b2 = new THREE.Box3().setFromObject(m);
      m.position.set(x, -b2.min.y, z);
      m.rotation.y = ry || 0;
      m.userData = { isAutoCity: true, isGLB: true, isBuilding: true, name: path };
      scene.add(m); objects.push(m);
      return m;
    };

    // Place road piece — receive shadow only, slight y-lift to avoid z-fight
    const placeRoad = (path, x, z, sc, ry) => {
      const t = cache[path];
      if (!t) return null;
      const m = t.clone();
      m.scale.setScalar(sc || 1);
      m.rotation.y = ry || 0;
      m.traverse(n => { if (n.isMesh) { n.receiveShadow = true; } });
      const box = new THREE.Box3().setFromObject(m);
      m.position.set(x, -box.min.y + 0.15, z);
      m.userData = { isAutoCity: true, isGLB: true, name: 'road' };
      scene.add(m); objects.push(m);
      return m;
    };

    // ═══ PRELOAD ALL MODELS ═══
    showToast('\ud83d\udce6 Loading city assets...');
    const allPaths = [];
    Object.values(assets.roads).forEach(p => allPaths.push(p));
    Object.values(assets.districts).forEach(d =>
      Object.values(d).forEach(a => { if (Array.isArray(a)) a.forEach(p => allPaths.push(p)); })
    );
    Object.values(assets.props).forEach(p => allPaths.push(p));
    Object.values(assets.nature).forEach(v => {
      if (Array.isArray(v)) v.forEach(p => allPaths.push(p));
    });
    Object.values(assets.vehicles).forEach(v => {
      if (Array.isArray(v)) v.forEach(p => allPaths.push(p));
    });
    Object.values(assets.infrastructure).forEach(p => allPaths.push(p));

    await batchPreload(allPaths, 'Loading models');

    // ═══ ROAD NETWORK (GLB Toon City Pack pieces) ═══
    showToast('\ud83d\udee3\ufe0f Building road network...');

    const R = assets.roads;
    // Measure the straight road piece to determine proper scale
    const stmpl = cache[R.straight];
    let rsc = 1;
    let roadAlongZ = true;
    if (stmpl) {
      const sb = new THREE.Box3().setFromObject(stmpl);
      const ss = sb.getSize(new THREE.Vector3());
      rsc = SEG / Math.max(ss.x, ss.z, 0.1);
      roadAlongZ = ss.z >= ss.x;
    }
    const EW_ROT = roadAlongZ ? Math.PI / 2 : 0;  // rotation for east-west roads
    const NS_ROT = roadAlongZ ? 0 : Math.PI / 2;  // rotation for north-south roads

    // Measure junction piece to compute actual gap between nodes
    const juncTmpl = cache[R.intersection] || cache[R.t_junction];
    let juncAlong = SEG;
    if (juncTmpl) {
      const jb = new THREE.Box3().setFromObject(juncTmpl);
      const js = jb.getSize(new THREE.Vector3());
      juncAlong = Math.max(js.x, js.z) * rsc;
    }
    // Gap to fill: from junction edge to next junction edge
    const gapStart = juncAlong / 2;
    const gapLen = CELL - juncAlong;
    const straightLen = SEG; // straight piece is exactly SEG after rsc scaling
    const fillCount = Math.max(1, Math.ceil(gapLen / straightLen));
    const fillStep = gapLen / fillCount;

    // --- Asphalt fill planes under all intersections and road corridors ---
    const asphaltMat = new THREE.MeshLambertMaterial({ color: 0x333333 });

    // Fill plane at every grid node (covers junction gaps)
    for (let nc = 0; nc <= G; nc++) {
      for (let nr = 0; nr <= G; nr++) {
        const { x, z } = np(nc, nr);
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(SEG + 4, SEG + 4), asphaltMat);
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(x, 0.01, z);
        plane.receiveShadow = true;
        scene.add(tag(plane));
      }
    }

    // E-W road strips between nodes (along each row)
    for (let nr = 0; nr <= G; nr++) {
      for (let nc = 0; nc < G; nc++) {
        const p1 = np(nc, nr);
        const p2 = np(nc + 1, nr);
        const cx = (p1.x + p2.x) / 2;
        const cz = p1.z;
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(CELL, SEG + 2), asphaltMat);
        strip.rotation.x = -Math.PI / 2;
        strip.position.set(cx, 0.01, cz);
        strip.receiveShadow = true;
        scene.add(tag(strip));
      }
    }

    // N-S road strips between nodes (along each column)
    for (let nc = 0; nc <= G; nc++) {
      for (let nr = 0; nr < G; nr++) {
        const p1 = np(nc, nr);
        const p2 = np(nc, nr + 1);
        const cx = p1.x;
        const cz = (p1.z + p2.z) / 2;
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(SEG + 2, CELL), asphaltMat);
        strip.rotation.x = -Math.PI / 2;
        strip.position.set(cx, 0.01, cz);
        strip.receiveShadow = true;
        scene.add(tag(strip));
      }
    }

    // --- Junction pieces at every grid node (9×9 = 81 nodes) ---
    for (let nc = 0; nc <= G; nc++) {
      for (let nr = 0; nr <= G; nr++) {
        const { x, z } = np(nc, nr);
        const top = nr === 0, bot = nr === G, left = nc === 0, right = nc === G;
        const isCorner = (top || bot) && (left || right);
        const isEdge = !isCorner && (top || bot || left || right);

        if (isCorner) {
          if (top && left)       placeRoad(R.l_junction_left,  x, z, rsc, Math.PI / 2);
          else if (top && right) placeRoad(R.l_junction_right, x, z, rsc, 0);
          else if (bot && left)  placeRoad(R.l_junction_right, x, z, rsc, Math.PI);
          else                   placeRoad(R.l_junction_left,  x, z, rsc, -Math.PI / 2);
        } else if (isEdge) {
          if (top)        placeRoad(R.t_junction, x, z, rsc, Math.PI);
          else if (bot)   placeRoad(R.t_junction, x, z, rsc, 0);
          else if (left)  placeRoad(R.t_junction, x, z, rsc, Math.PI / 2);
          else            placeRoad(R.t_junction, x, z, rsc, -Math.PI / 2);
        } else {
          // Interior — full intersections + one central roundabout
          if (nc === 4 && nr === 4) placeRoad(R.roundabout, x, z, rsc, 0);
          else placeRoad(R.intersection, x, z, rsc, 0);
        }
      }
    }

    // --- Straight road segments filling gaps between nodes ---
    // E-W roads (horizontal, constant z per row)
    for (let nr = 0; nr <= G; nr++) {
      const z = np(0, nr).z;
      for (let gap = 0; gap < G; gap++) {
        const startX = np(gap, 0).x;
        for (let s = 0; s < fillCount; s++) {
          const offset = gapStart + fillStep / 2 + s * fillStep;
          placeRoad(R.straight, startX + offset, z, rsc, EW_ROT);
        }
      }
    }
    // N-S roads (vertical, constant x per col)
    for (let nc = 0; nc <= G; nc++) {
      const x = np(nc, 0).x;
      for (let gap = 0; gap < G; gap++) {
        const startZ = np(0, gap).z;
        for (let s = 0; s < fillCount; s++) {
          const offset = gapStart + fillStep / 2 + s * fillStep;
          placeRoad(R.straight, x, startZ + offset, rsc, NS_ROT);
        }
      }
    }

    // ═══ SIDEWALK PADS (concrete base per block) ═══
    const padMat = new THREE.MeshLambertMaterial({ color: 0x999088 });
    for (let c = 0; c < G; c++) {
      for (let r = 0; r < G; r++) {
        const { x, z } = bc(c, r);
        const pad = tag(new THREE.Mesh(new THREE.PlaneGeometry(BLK, BLK), padMat));
        pad.rotation.x = -Math.PI / 2;
        pad.position.set(x, 0.05, z);
        pad.receiveShadow = true;
        scene.add(pad); objects.push(pad);
      }
    }

    // ═══ BUILDINGS BY DISTRICT ═══
    showToast('\ud83c\udfe2 Placing buildings...');

    // Building slot offsets — MUST stay inside the block (±15 max)
    // Block = 40 units, roads at edges (±20), sidewalk ~±17
    // Buildings must stay within ±15 to avoid clipping roads
    const bldgSlots = {
      downtown:    [[-8,-8],[8,-8],[-8,8],[8,8]],                    // 4 slots, well inside block
      commercial:  [[-9,-9],[9,-9],[-9,9],[9,9]],                    // 4 slots, inside block
      residential: [[-10,-10],[10,-10],[-10,10],[10,10]],            // 4 corners, inside block
      industrial:  [[-9,0],[9,0],[0,-9],[0,9]]                       // 4 slots, cross pattern
    };

    // Track placed building positions for overlap check
    const _placedBldgs = [];
    const _minBldgDist = 16; // Minimum distance between building centers

    for (let c = 0; c < G; c++) {
      for (let r = 0; r < G; r++) {
        const d = getDist(c, r);
        const { x: cx, z: cz } = bc(c, r);
        const da = assets.districts[d];
        if (!da) continue;

        // Merge all available building models for this district
        // Prioritize UE buildings (real glass windows) over Kenney/Toon
        const uePool = (da.buildings || []).filter(p =>
          p.includes('ue_sm_bldg') || p.includes('buildings_pack') || p.includes('Flooded_Grounds')
        );
        const otherPool = (da.buildings || []).filter(p =>
          !p.includes('kenney_city') // Skip Kenney cartoon buildings
        );
        const shopPool = (da.shops || []).filter(p => !p.includes('kenney'));
        const pool = [
          ...uePool,
          ...otherPool,
          ...shopPool,
          ...(da.commercial || []),
          ...(da.apartments || [])
        ].filter(Boolean);
        if (!pool.length) continue;

        const slots = bldgSlots[d] || bldgSlots.residential;
        // Fewer buildings per block = cleaner layout
        const count = d === 'downtown'   ? 3 + Math.floor(rand() * 2) :
                      d === 'commercial'  ? 2 + Math.floor(rand() * 2) :
                      d === 'residential' ? 2 + Math.floor(rand() * 1) :
                      1 + Math.floor(rand() * 2);

        for (let i = 0; i < Math.min(count, slots.length); i++) {
          const [ox, oz] = slots[i];
          const bx = cx + ox, bz = cz + oz;

          // Skip if too close to an already-placed building
          const tooClose = _placedBldgs.some(([px,pz]) => {
            const dx = bx - px, dz = bz - pz;
            return Math.sqrt(dx*dx + dz*dz) < _minBldgDist;
          });
          if (tooClose) continue;

          const path = pick(pool);
          const ry = Math.floor(rand() * 4) * Math.PI / 2;
          let tH, mFP;
          // Tight footprint caps — buildings must not exceed slot spacing
          if (d === 'downtown')        { tH = rr(35, 65); mFP = 10; }
          else if (d === 'commercial') { tH = rr(15, 28); mFP = 11; }
          else if (d === 'residential') { tH = rr(8, 16);  mFP = 10; }
          else                          { tH = rr(10, 18); mFP = 12; }
          const placed = placeBldg(path, bx, bz, tH, mFP, ry);
          if (placed) _placedBldgs.push([bx, bz]);
        }
      }
    }

    // ═══ GOVERNMENT / LANDMARK BUILDINGS ═══
    showToast('\ud83c\udfdb\ufe0f Placing landmarks...');
    const gov = assets.districts.government?.buildings || [];
    const landmarks = [
      [0, 3, 2],  // bank — edge of downtown
      [1, 4, 2],  // city hall — across from bank
      [2, 2, 4],  // fire station — commercial belt
      [3, 5, 2],  // museum — east commercial
      [4, 1, 5],  // school — residential south
      [5, 4, 5],  // hospital — south side
      [6, 1, 1],  // church — residential NW
      [7, 5, 5],  // clock tower — south commercial
    ];
    landmarks.forEach(([idx, col, row]) => {
      if (idx < gov.length) {
        const { x, z } = bc(col, row);
        placeBldg(gov[idx], x, z, rr(20, 32), 22, 0);
      }
    });

    // ═══ INFRASTRUCTURE ═══
    showToast('\u26fd Infrastructure...');
    const inf = assets.infrastructure;

    const placeInfra = (path, col, row, footprint, ry) => {
      const { x, z } = bc(col, row);
      const t = cache[path];
      if (!t) return;
      const m = t.clone();
      m.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true;
        if (n.material && n.material.color) { const _c = n.material.color;
          // Desaturate cartoon colors → realistic + detect windows for glass
          const sat = Math.max(_c.r, _c.g, _c.b) - Math.min(_c.r, _c.g, _c.b);
          const matName = (n.material.name || n.name || '').toLowerCase();
          const isGlass = matName.includes('glass') || matName.includes('window') || matName.includes('vitr');
          const isBlueish = _c.b > 0.5 && _c.b > _c.r * 1.3 && _c.b > _c.g * 1.1;
          const isCyanish = _c.b > 0.4 && _c.g > 0.4 && _c.r < 0.3;

          if (isGlass || isBlueish || isCyanish) {
            // This is likely a window — make it glass!
            n.material = new THREE.MeshPhysicalMaterial({
              color: 0x88bbdd,
              metalness: 0.1,
              roughness: 0.05,
              transmission: 0.7,
              thickness: 0.3,
              ior: 1.5,
              transparent: true,
              opacity: 0.6,
              envMapIntensity: 1.5,
            });
          } else if (sat > 0.25 && !n.material.map) {
            // Desaturate cartoon colors by 65%
            n.material = n.material.clone();
            const avg = (_c.r + _c.g + _c.b) / 3;
            n.material.color.setRGB(
              _c.r * 0.2 + avg * 0.8,
              _c.g * 0.2 + avg * 0.8,
              _c.b * 0.2 + avg * 0.8
            );
            n.material.roughness = 0.75;
            n.material.metalness = 0.02;
          }
          if (_c.r > 0.92 && _c.g > 0.92 && _c.b > 0.92 && !n.material.map) {
            n.material = n.material.clone();
            // Apply procedural facade texture if available
            if (window._facadeTextures && n.geometry) {
              const box = new THREE.Box3().setFromObject(n);
              const sz = box.getSize(new THREE.Vector3());
              const isTall = sz.y > 3;
              const districtKey = isTall ? 'downtown' : (sz.y > 1.5 ? 'commercial' : 'residential');
              const texArr = window._facadeTextures[districtKey];
              if (texArr && texArr.length > 0) {
                n.material.map = texArr[Math.floor(Math.random() * texArr.length)];
                n.material.map.needsUpdate = true;
              }
            }
            const _t = [0xd8ccb8,0xc8bca8,0xb8b0a0,0xd0c8b8,0xc0b8a8,0xe0d8c8,0xc8c0b0,0xb0a898,0xd4ccc0,0xc0b4a4,0xa8a098,0xd8d0c0,0xc8c4b8,0xb8b4a8];
            n.material.color.setHex(_t[Math.floor(Math.random()*_t.length)]);
            n.material.roughness = 0.7 + Math.random()*0.2;
            n.material.metalness = 0.05; }}
      } });
      const b = new THREE.Box3().setFromObject(m);
      const s = b.getSize(new THREE.Vector3());
      const sc = (footprint || 20) / Math.max(s.x, s.z, 0.1);
      m.scale.setScalar(sc);
      const b2 = new THREE.Box3().setFromObject(m);
      m.position.set(x, -b2.min.y, z);
      m.rotation.y = ry || 0;
      m.userData = { isAutoCity: true, isGLB: true, name: path };
      scene.add(m); objects.push(m);
    };

    placeInfra(inf.gas_station,   7, 1, 28, 0);               // NE edge
    placeInfra(inf.parking_lot,   1, 3, 32, 0);               // west commercial
    placeInfra(inf.parking_lot,   5, 4, 32, Math.PI / 2);     // east commercial
    placeInfra(inf.park,          0, 0, 36, 0);               // NW residential park
    placeInfra(inf.park,          7, 0, 36, Math.PI);          // NE residential park
    placeInfra(inf.stadium,       0, 7, 36, 0);               // SW corner stadium
    placeInfra(inf.train_station, 7, 3, 28, Math.PI / 2);     // east side
    placeInfra(inf.plaza,         3, 4, 24, 0);               // downtown edge plaza

    // ═══ STREET PROPS ═══
    showToast('\ud83c\udfee Street props...');

    // Street lights — on sidewalk inside blocks, NOT on road grid lines
    for (let c = 0; c < G; c++) {
      for (let r = 0; r < G; r++) {
        const { x: cx, z: cz } = bc(c, r);
        // Two lights per block, on opposite sidewalk edges (inside block at ±15)
        placeGround(assets.props.street_light_double, cx - 15, cz - 10, rsc * 1.2, 0);
        placeGround(assets.props.street_light_single, cx + 15, cz + 10, rsc * 1.2, Math.PI);
      }
    }

    // Traffic lights — at intersection CORNERS (offset diagonally from road center)
    for (let nc = 1; nc < G; nc += 2) {
      for (let nr = 1; nr < G; nr += 2) {
        const { x, z } = np(nc, nr);
        // Place on the sidewalk corner, not in the road
        placeGround(assets.props.traffic_light_single, x + SEG/2 + 2, z + SEG/2 + 2, rsc * 1.0, 0);
        placeGround(assets.props.traffic_light_curved, x - SEG/2 - 2, z - SEG/2 - 2, rsc * 1.0, Math.PI);
      }
    }

    // Stop signs — on sidewalk corners at intersections
    for (let nc = 2; nc < G; nc += 2) {
      for (let nr = 2; nr < G; nr += 2) {
        const { x, z } = np(nc, nr);
        placeGround(assets.props.stop_sign, x - SEG/2 - 2, z + SEG/2 + 2, rsc * 0.9, 0);
      }
    }

    // Per-block sidewalk furniture & district-specific props
    for (let c = 0; c < G; c++) {
      for (let r = 0; r < G; r++) {
        const d = getDist(c, r);
        const { x: cx, z: cz } = bc(c, r);

        // --- Universal sidewalk props (keep at ±16, well inside block edge) ---
        if (rand() > 0.40) placeGround(assets.props.bench,        cx - 16, cz + rr(3, 12), rsc * 0.9, Math.PI / 2);
        if (rand() > 0.50) placeGround(assets.props.fire_hydrant,  cx + 16, cz - rr(3, 12), rsc * 0.7, 0);
        if (rand() > 0.60) placeGround(assets.props.garbage_bin,   cx - rr(14, 16), cz - 16, rsc * 0.7, 0);
        if (rand() > 0.65) placeGround(assets.props.mailbox,       cx + rr(14, 16), cz + 16, rsc * 0.85, 0);

        // --- Downtown: urban furniture on sidewalks (±16 from block center) ---
        if (d === 'downtown') {
          if (rand() > 0.40) placeGround(assets.props.bus_stop,        cx + rr(-4, 4), cz + 16, rsc * 1.0, 0);
          if (rand() > 0.50) placeGround(assets.props.atm,             cx - 15, cz + rr(-4, 4), rsc * 0.7, Math.PI / 2);
          if (rand() > 0.45) placeGround(assets.props.hot_dog_stand,   cx + 15, cz + rr(-3, 3), rsc * 0.8, -Math.PI / 2);
          if (rand() > 0.55) placeGround(assets.props.subway_entrance, cx + rr(-4, 4), cz - 16, rsc * 1.0, Math.PI);
        }

        // --- Commercial: dining, transit on sidewalks ---
        if (d === 'commercial') {
          if (rand() > 0.45) placeGround(assets.props.outdoor_seating,  cx - rr(8, 12), cz + 16, rsc * 0.8, 0);
          if (rand() > 0.50) placeGround(assets.props.bus_stop,         cx + 16, cz + rr(-4, 4), rsc * 1.0, Math.PI / 2);
          if (rand() > 0.55) placeGround(assets.props.speed_limit_sign, cx - 16, cz + rr(4, 10), rsc * 0.8, 0);
        }

        // --- Industrial: fencing inside block edges, not on roads ---
        if (d === 'industrial') {
          for (let f = -14; f <= 14; f += 8) {
            placeGround(assets.props.wired_fence, cx + f, cz - 17, rsc * 0.9, 0);
            placeGround(assets.props.wired_fence, cx + f, cz + 17, rsc * 0.9, Math.PI);
          }
          if (rand() > 0.35) placeGround(assets.props.traffic_cone, cx + rr(-8, 8), cz + rr(-8, 8), rsc * 0.6, 0);
          if (rand() > 0.35) placeGround(assets.props.dumpster,     cx - 13, cz - 13, rsc * 0.9, 0);
          if (rand() > 0.40) placeGround(assets.props.trash_bags,   cx + 13, cz - 13, rsc * 0.7, 0);
          if (rand() > 0.45) placeGround(assets.props.road_block_a, cx + rr(5, 10), cz + 15, rsc * 0.8, 0);
          placeGround(assets.props.electrical_pole, cx + 17, cz, rsc * 1.0, 0);
        }

        // --- Residential: suburban touches ---
        if (d === 'residential') {
          if (rand() > 0.50) placeGround(assets.props.wooden_fence,    cx - 15, cz + rr(-6, 6), rsc * 0.8, 0);
          if (rand() > 0.60) placeGround(assets.props.no_parking_sign, cx + 15, cz - 15, rsc * 0.8, 0);
        }
      }
    }

    // ═══ VEHICLES ═══
    showToast('\ud83d\ude97 Parking vehicles...');
    const civCars = assets.vehicles.civilian;
    const svcCars = assets.vehicles.service;
    const comCars = assets.vehicles.commercial;

    // Parked civilian cars along road edges
    for (let nc = 0; nc <= G; nc++) {
      for (let gap = 0; gap < G; gap++) {
        // Along E-W roads (south side)
        if (rand() > 0.45) {
          const z = np(0, nc).z;
          const x = np(gap, 0).x + CELL / 2;
          placeGround(pick(civCars), x, z + 5.5, rsc * 1.8, EW_ROT + Math.PI);
        }
        // Along N-S roads (east side)
        if (rand() > 0.45) {
          const x = np(nc, 0).x;
          const z = np(0, gap).z + CELL / 2;
          placeGround(pick(civCars), x + 5.5, z, rsc * 1.8, NS_ROT);
        }
      }
    }

    // Emergency vehicles near landmarks — parked inside block
    placeGround(pick(svcCars), bc(2, 4).x + 12, bc(2, 4).z, rsc * 1.8, Math.PI / 4);
    placeGround(pick(svcCars), bc(4, 5).x - 12, bc(4, 5).z, rsc * 1.8, 0);
    placeGround(pick(svcCars), bc(3, 3).x + 10, bc(3, 3).z + 10, rsc * 1.8, Math.PI);

    // Commercial trucks in industrial district
    for (let c = 6; c < G; c++) {
      for (let r = 6; r < G; r++) {
        const { x, z } = bc(c, r);
        placeGround(pick(comCars), x + rr(5, 12), z + rr(5, 12), rsc * 1.8, rand() * Math.PI * 2);
        placeGround(pick(comCars), x - rr(5, 12), z - rr(5, 12), rsc * 1.8, rand() * Math.PI * 2);
      }
    }

    // ═══ TREES & NATURE ═══
    showToast('\ud83c\udf33 Planting trees...');
    const trees = assets.nature.trees;
    const bushes = assets.nature.bushes;
    const palms = assets.nature.palms;

    // Helper: check if position is on a road or intersection
    // Road strips run along every grid line; intersections are where two strips cross.
    // Any point near a grid column X is on a N-S road; near a grid row Z is on an E-W road.
    // Intersections are caught by either check. Buffer of 3 keeps props clear of road edges.
    const ROAD_HALF = SEG / 2 + 3; // road half-width + 3-unit safety buffer
    const isOnRoad = (wx, wz) => {
      for (let nc = 0; nc <= G; nc++) {
        if (Math.abs(wx - np(nc, 0).x) < ROAD_HALF) return true;
      }
      for (let nr = 0; nr <= G; nr++) {
        if (Math.abs(wz - np(0, nr).z) < ROAD_HALF) return true;
      }
      return false;
    };
    window._isOnRoad = isOnRoad;

    for (let c = 0; c < G; c++) {
      for (let r = 0; r < G; r++) {
        const d = getDist(c, r);
        const { x: cx, z: cz } = bc(c, r);

        if (d === 'residential') {
          // Yard trees — stay inside block (±14 max, well clear of roads at ±20)
          const nt = 2 + Math.floor(rand() * 3);
          for (let t = 0; t < nt; t++) {
            const tx = cx + rr(-13, 13), tz = cz + rr(-13, 13);
            if (!isOnRoad(tx, tz)) placeGround(pick(trees), tx, tz, rsc * rr(0.8, 1.3), rand() * 0.3);
          }
          if (rand() > 0.4) {
            const bx = cx + rr(-10, 10), bz = cz + rr(-10, 10);
            if (!isOnRoad(bx, bz)) placeGround(pick(bushes), bx, bz, rsc * 0.8, 0);
          }
        }

        if (d === 'downtown' || d === 'commercial') {
          // Sidewalk palms — place on sidewalk edge (±17), NOT on road (±20+)
          if (rand() > 0.45) {
            const px = cx - 17, pz = cz + rr(-6, 6);
            if (!isOnRoad(px, pz)) placeGround(pick(palms), px, pz, rsc * 1.2, rand() * 0.2);
          }
          if (rand() > 0.45) {
            const px = cx + 17, pz = cz + rr(-6, 6);
            if (!isOnRoad(px, pz)) placeGround(pick(palms), px, pz, rsc * 1.2, rand() * 0.2);
          }
        }

        if (d === 'industrial') {
          if (rand() > 0.75) {
            const tx = cx + rr(-12, 12), tz = cz + rr(-12, 12);
            if (!isOnRoad(tx, tz)) placeGround(pick(trees), tx, tz, rsc * 0.7, 0);
          }
        }
      }
    }

    // Removed: avenue trees that were landing on roads

    // Rocks scattered in residential — inside blocks only
    const rocks = assets.nature.rocks;
    for (let c = 0; c < G; c += 3) {
      for (let r = 0; r < G; r += 3) {
        if (getDist(c, r) === 'residential') {
          const { x, z } = bc(c, r);
          const rx = x + rr(-10, 10), rz2 = z + rr(-10, 10);
          if (!isOnRoad(rx, rz2)) placeGround(pick(rocks), rx, rz2, rsc * 0.6, rand() * Math.PI);
        }
      }
    }

    // Window overlays removed — using procedural textures instead

    // ═══ TRAFFIC LIGHTS at intersections ═══
    // ═══ CURBS — simplified long strips ═══
    const curbMat = new THREE.MeshLambertMaterial({color: 0xaaa898});
    // E-W curbs along each road
    for (let r = 0; r <= G; r++) {
      const rz = -HALF + r * CELL;
      const cn = tag(new THREE.Mesh(new THREE.BoxGeometry(HALF*2, 0.12, 0.25), curbMat));
      cn.position.set(0, 0.06, rz + SEG/2 + 0.3); scene.add(cn); objects.push(cn);
      const cs = tag(new THREE.Mesh(new THREE.BoxGeometry(HALF*2, 0.12, 0.25), curbMat));
      cs.position.set(0, 0.06, rz - SEG/2 - 0.3); scene.add(cs); objects.push(cs);
    }
    // N-S curbs
    for (let c = 0; c <= G; c++) {
      const rx = -HALF + c * CELL;
      const ce = tag(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, HALF*2), curbMat));
      ce.position.set(rx + SEG/2 + 0.3, 0.06, 0); scene.add(ce); objects.push(ce);
      const cw = tag(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, HALF*2), curbMat));
      cw.position.set(rx - SEG/2 - 0.3, 0.06, 0); scene.add(cw); objects.push(cw);
    }

    // ═══ CENTER LINES on roads — solid yellow ═══
    const dashMat = new THREE.MeshLambertMaterial({color: 0xf0d020});
    for (let r = 0; r <= G; r++) {
      const rz = -HALF + r * CELL;
      const line = tag(new THREE.Mesh(new THREE.PlaneGeometry(HALF*2, 0.2), dashMat));
      line.rotation.x = -Math.PI/2; line.position.set(0, 0.07, rz);
      scene.add(line); objects.push(line);
    }
    for (let c = 0; c <= G; c++) {
      const rx = -HALF + c * CELL;
      const line = tag(new THREE.Mesh(new THREE.PlaneGeometry(0.2, HALF*2), dashMat));
      line.rotation.x = -Math.PI/2; line.position.set(rx, 0.07, 0);
      scene.add(line); objects.push(line);
    }

    // ═══ CROSSWALKS — simplified for performance ═══
    const crossMat2 = new THREE.MeshLambertMaterial({color: 0xdddddd});
    for (let c = 0; c <= G; c++) {
      for (let r = 0; r <= G; r++) {
        const ix = -HALF + c * CELL;
        const iz = -HALF + r * CELL;
        // 2 crosswalk strips per intersection (N-S and E-W)
        const cwNS = tag(new THREE.Mesh(new THREE.PlaneGeometry(SEG*0.7, 2.5), crossMat2));
        cwNS.rotation.x = -Math.PI/2; cwNS.position.set(ix, 0.08, iz + SEG/2 + 0.5);
        scene.add(cwNS); objects.push(cwNS);
        const cwEW = tag(new THREE.Mesh(new THREE.PlaneGeometry(2.5, SEG*0.7), crossMat2));
        cwEW.rotation.x = -Math.PI/2; cwEW.position.set(ix + SEG/2 + 0.5, 0.08, iz);
        scene.add(cwEW); objects.push(cwEW);
      }
    }

    showToast('\ud83d\udea6 Setting up traffic lights...');
    window._trafficLights = [];
    const tlPaths = ['unity_assets/unity_assets_temp/unity_assets_temp/Toon_City_Pack/traffic-lights-single.glb'];
    await batchPreload(tlPaths, 'Traffic Lights');
    for (let c = 1; c < G; c += 2) {
      for (let r = 1; r < G; r += 2) {
        const ix = -HALF + c * CELL;
        const iz = -HALF + r * CELL;
        // Place traffic light at intersection corners
        for (let corner = 0; corner < 2; corner++) {
          const ox = corner === 0 ? SEG/2 + 1 : -SEG/2 - 1;
          const oz = corner === 0 ? SEG/2 + 1 : -SEG/2 - 1;
          const tl = placeGround(tlPaths[0], ix + ox, iz + oz, 1, corner * Math.PI);
          if (tl) {
            const tlData = { mesh: tl, x: ix, z: iz, state: rand() > 0.5 ? 'green' : 'red', timer: rand() * 8 };
            window._trafficLights.push(tlData);
          }
        }
      }
    }
    // Traffic light cycle with visual indicators
    // Add colored light indicators to traffic light models
    for (const tl of window._trafficLights) {
      if (!tl.mesh) continue;
      const redLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 8, 6),
        new THREE.MeshBasicMaterial({color: 0xff0000, transparent: true, opacity: 1})
      );
      redLight.position.set(0, 4, 0.4);
      tl.mesh.add(redLight);
      tl.redLight = redLight;
      const greenLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 8, 6),
        new THREE.MeshBasicMaterial({color: 0x00ff00, transparent: true, opacity: 0.2})
      );
      greenLight.position.set(0, 3.2, 0.4);
      tl.mesh.add(greenLight);
      tl.greenLight = greenLight;
    }
    if (window._tlFrame) cancelAnimationFrame(window._tlFrame);
    (function _tlCycle() {
      window._tlFrame = requestAnimationFrame(_tlCycle);
      if (!window._trafficLights) return;
      for (const tl of window._trafficLights) {
        tl.timer += 0.016;
        if (tl.timer > 6) { // 6 second cycle (faster, more visible)
          tl.state = tl.state === 'green' ? 'red' : 'green';
          tl.timer = 0;
        }
        // Update visual lights — just scale and opacity
        if (tl.redLight) {
          tl.redLight.material.opacity = tl.state === 'red' ? 1.0 : 0.2;
          tl.redLight.scale.setScalar(tl.state === 'red' ? 1.3 : 0.6);
        }
        if (tl.greenLight) {
          tl.greenLight.material.opacity = tl.state === 'green' ? 1.0 : 0.2;
          tl.greenLight.scale.setScalar(tl.state === 'green' ? 1.3 : 0.6);
        }
      }
    })();

    // ═══ DRIVING TRAFFIC — cars moving on roads ═══
    showToast('\ud83d\ude97 Starting traffic...');
    window._trafficCars = [];
    const carModels = ['kenney_cars/sedan.glb','kenney_cars/sedan-sports.glb','kenney_cars/suv.glb',
      'kenney_cars/suv-luxury.glb','kenney_cars/van.glb','kenney_cars/taxi.glb','kenney_cars/truck.glb',
      'kenney_cars/hatchback-sports.glb','kenney_cars/police.glb','kenney_cars/delivery.glb'];
    // Preload car models
    await batchPreload(carModels, 'Cars');
    // Place cars on road lanes
    for (let i = 0; i < 50; i++) {
      const isEW = rand() > 0.5;
      const roadIdx = Math.floor(rand() * (G + 1));
      const lane = rand() > 0.5 ? 1 : -1;
      const carPath = carModels[Math.floor(rand() * carModels.length)];
      const carModel = cache[carPath];
      if (!carModel) continue;
      const car = carModel.clone();
      car.scale.setScalar(1.8);
      car.traverse(n => { if(n.isMesh) n.castShadow = true; });
      let cx2, cz2, ry2;
      if (isEW) {
        cx2 = (rand()-0.5) * HALF * 1.6;
        cz2 = -HALF + roadIdx * CELL + lane * 2.5;
        ry2 = lane > 0 ? Math.PI/2 : -Math.PI/2;
      } else {
        cx2 = -HALF + roadIdx * CELL + lane * 2.5;
        cz2 = (rand()-0.5) * HALF * 1.6;
        ry2 = lane > 0 ? 0 : Math.PI;
      }
      car.position.set(cx2, 0.15, cz2);
      car.rotation.y = ry2;
      car.userData.isAutoCity = true;
      scene.add(car); objects.push(car);
      window._trafficCars.push({
        mesh: car, isEW, lane,
        speed: (0.04 + rand() * 0.06) * lane,
        bound: HALF + 30,
        laneZ: isEW ? cz2 : undefined,
        laneX: !isEW ? cx2 : undefined,
      });
    }
    // Traffic animation
    if (window._trafficFrame) cancelAnimationFrame(window._trafficFrame);
    (function _traf() {
      window._trafficFrame = requestAnimationFrame(_traf);
      if (!window._trafficCars) return;
      for (const tc of window._trafficCars) {
        if (!tc.mesh || !tc.mesh.parent) continue;
        // Check traffic lights — stop at red
        let stopped = false;
        if (window._trafficLights) {
          for (const tl of window._trafficLights) {
            if (tl.state !== 'red') continue;
            const dx = tc.mesh.position.x - tl.x;
            const dz = tc.mesh.position.z - tl.z;
            const dist = Math.sqrt(dx*dx + dz*dz);
            if (dist < 20) {
              // Check if car is approaching the light (wider detection cone)
              if (tc.isEW && Math.abs(dz) < 8 && dx * tc.speed > 0 && Math.abs(dx) < 18) { stopped = true; break; }
              if (!tc.isEW && Math.abs(dx) < 8 && dz * tc.speed > 0 && Math.abs(dz) < 18) { stopped = true; break; }
            }
          }
        }
        // Car-to-car collision avoidance
        if (!stopped) {
          for (const oc of window._trafficCars) {
            if (oc === tc || !oc.mesh || !oc.mesh.parent) continue;
            if (oc.isEW !== tc.isEW) continue;
            if (tc.isEW) {
              if (Math.abs(tc.mesh.position.z - oc.mesh.position.z) > 3) continue;
              const ahead = (oc.mesh.position.x - tc.mesh.position.x) * Math.sign(tc.speed);
              if (ahead > 0 && ahead < 8) { stopped = true; break; }
            } else {
              if (Math.abs(tc.mesh.position.x - oc.mesh.position.x) > 3) continue;
              const ahead = (oc.mesh.position.z - tc.mesh.position.z) * Math.sign(tc.speed);
              if (ahead > 0 && ahead < 8) { stopped = true; break; }
            }
          }
        }
        if (!stopped) {
          if (tc.isEW) {
            tc.mesh.position.x += tc.speed;
            // Snap to lane (prevent drift)
            tc.mesh.position.z = tc.laneZ || tc.mesh.position.z;
            if (tc.mesh.position.x > tc.bound) tc.mesh.position.x = -tc.bound;
            if (tc.mesh.position.x < -tc.bound) tc.mesh.position.x = tc.bound;
          } else {
            tc.mesh.position.z += tc.speed;
            // Snap to lane
            tc.mesh.position.x = tc.laneX || tc.mesh.position.x;
            if (tc.mesh.position.z > tc.bound) tc.mesh.position.z = -tc.bound;
            if (tc.mesh.position.z < -tc.bound) tc.mesh.position.z = tc.bound;
          }
        }
      }
    })();
    showToast('\ud83d\ude97 ' + window._trafficCars.length + ' cars driving!');

    // Parked cars along sidewalks
    const parkedCarPaths = ['kenney_cars/sedan.glb','kenney_cars/suv.glb','kenney_cars/van.glb','kenney_cars/hatchback-sports.glb','kenney_cars/truck.glb'];
    for (let c = 0; c < G; c++) {
      for (let r = 0; r < G; r++) {
        if (rand() > 0.6) continue; // not every block
        const bpos = bc(c, r);
        const numParked = 1 + Math.floor(rand() * 2);
        for (let pk = 0; pk < numParked; pk++) {
          const cp = parkedCarPaths[Math.floor(rand()*parkedCarPaths.length)];
          const side = Math.floor(rand()*4);
          const px = bpos.x + (side<2 ? (rand()-0.5)*BLK*0.5 : (side===2?-1:1)*18);
          const pz = bpos.z + (side>=2 ? (rand()-0.5)*BLK*0.5 : (side===0?-1:1)*18);
          const ry = side < 2 ? 0 : Math.PI/2;
          const pc = placeGround(cp, px, pz, 1.8, ry);
        }
      }
    }

    // REMOVED: duplicate sidewalk tree pass (placed at BLK/2+2 which lands on roads)
    // — first pass via assets.nature already handles trees with isOnRoad() checks

    // REMOVED: duplicate street light pass (placed at road edges)
    // — first pass via assets.props.street_light_single/double already places lights inside blocks at ±15

    // District ground overlays removed for performance
    // REMOVED: duplicate extra street props pass (benches, hydrants, mailboxes, etc.)
    // — first pass via assets.props already handles all these at safe ±16 offsets

    // ═══ PEDESTRIANS — walking NPCs ═══
    showToast('\ud83d\udeb6 Adding pedestrians...');
    window._peds = [];
    const skinT = [0xFFDBAC,0xD2A06B,0x8D5524,0xC68642,0xF1C27D,0x4A2912];
    const outfitC = [0xFF6B9D,0x4488CC,0xFFD700,0xFF4500,0x00CED1,0x9D4EDD,0x44AA44,0xEE8833,0xCC3366,0x6688BB];
    for (let c = 0; c < G; c++) {
      for (let r = 0; r < G; r++) {
        const d = getDist(c, r);
        const bpos = bc(c, r);
        let pCount = d === 'downtown' ? 3 : d === 'commercial' ? 2 : d === 'residential' ? 1 : 0;
        for (let p = 0; p < pCount; p++) {
          const g = new THREE.Group();
          const sk = new THREE.MeshLambertMaterial({color: skinT[Math.floor(rand()*skinT.length)]});
          const bd = new THREE.MeshLambertMaterial({color: outfitC[Math.floor(rand()*outfitC.length)]});
          const lg = new THREE.MeshLambertMaterial({color: 0x222233});
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), sk); head.position.y = 1.6; g.add(head);
          const torso = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.25), bd); torso.position.y = 1.15; g.add(torso);
          const la = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), bd); la.position.set(-0.3, 1.1, 0); g.add(la);
          const ra = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), bd); ra.position.set(0.3, 1.1, 0); g.add(ra);
          const ll = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.55, 0.15), lg); ll.position.set(-0.1, 0.45, 0); g.add(ll);
          const rl = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.55, 0.15), lg); rl.position.set(0.1, 0.45, 0); g.add(rl);
          g.traverse(n => { if(n.isMesh) n.castShadow = true; });
          // Place on sidewalk strips (±17 to ±19 from block center)
          const side = rand() > 0.5 ? 1 : -1;
          const swOff = 17 + rand() * 2; // 17-19 from center
          const alongAxis = rand() > 0.5; // which sidewalk edge
          let px, pz, a;
          if (alongAxis) {
            px = bpos.x + side * swOff;
            pz = bpos.z + (rand() - 0.5) * 34;
            a = side > 0 ? Math.PI/2 : -Math.PI/2; // walk along Z
            a += (rand() - 0.5) * 0.3; // slight variation
          } else {
            px = bpos.x + (rand() - 0.5) * 34;
            pz = bpos.z + side * swOff;
            a = side > 0 ? 0 : Math.PI;
            a += (rand() - 0.5) * 0.3;
          }
          g.position.set(px, 0, pz);
          g.rotation.y = a;
          g.userData.isAutoCity = true;
          tag(g); scene.add(g); objects.push(g);
          window._peds.push({g, la, ra, ll, rl, vx:Math.cos(a)*0.03, vz:Math.sin(a)*0.03, ph:rand()*6, tm:0, bx:bpos.x, bz:bpos.z});
        }
      }
    }
    // Ped animation
    if (window._pedFrame) cancelAnimationFrame(window._pedFrame);
    (function _pa() {
      window._pedFrame = requestAnimationFrame(_pa);
      if (!window._peds) return;
      for (const p of window._peds) {
        p.ph += 0.07; p.tm += 0.016;
        // Check if next position would be on a road
        const nx = p.g.position.x + p.vx;
        const nz = p.g.position.z + p.vz;
        if (window._isOnRoad && window._isOnRoad(nx, nz)) {
          p.vx *= -1; p.vz *= -1; p.g.rotation.y += Math.PI; p.tm = 0;
        } else {
          p.g.position.x = nx; p.g.position.z = nz;
        }
        // Keep within block bounds (±17 from block center)
        if (p.bx !== undefined) {
          if (Math.abs(p.g.position.x - p.bx) > 17) { p.vx *= -1; p.g.rotation.y += Math.PI; }
          if (Math.abs(p.g.position.z - p.bz) > 17) { p.vz *= -1; p.g.rotation.y += Math.PI; }
        }
        const sw = Math.sin(p.ph) * 0.35;
        p.la.rotation.x = sw; p.ra.rotation.x = -sw;
        p.ll.rotation.x = -sw*0.5; p.rl.rotation.x = sw*0.5;
        if (p.tm > 3 + Math.random()*4) {
          const a2 = Math.random()*Math.PI*2;
          p.vx = Math.cos(a2)*0.03; p.vz = Math.sin(a2)*0.03;
          p.g.rotation.y = a2; p.tm = 0;
        }
        if (Math.abs(p.g.position.x) > HALF+15 || Math.abs(p.g.position.z) > HALF+15) {
          p.vx *= -1; p.vz *= -1; p.g.rotation.y += Math.PI;
        }
      }
    })();

    // ═══ CAMERA ═══
    camera.position.set(0, 150, 200);
    camera.lookAt(0, 0, 0);
    if (window._cam) { window._cam.position.set(0, 150, 200); window._cam.lookAt(0, 0, 0); }
    if (window._ctrl) { window._ctrl.target.set(0, 0, 0); window._ctrl.update(); window._ctrl.enabled = true; }
    // Re-enable orbit controls so user can look around
    try { controls.enabled = true; controls.update(); } catch(e) {}

    // Freeze static objects for performance
    let frozenCount = 0;
    for (const obj of objects) {
      if (obj.userData.isAutoCity && !obj.userData.isGLB) {
        obj.matrixAutoUpdate = false;
        obj.updateMatrix();
        frozenCount++;
      }
    }
    console.log('[city] Frozen', frozenCount, 'static objects for performance');
    showToast('\u2705 GTA City ready! ' + window._trafficCars.length + ' cars, ' + window._peds.length + ' pedestrians');

    // City minimap removed — use game minimap instead

    // ═══ DAY/NIGHT CYCLE ═══
    window._dayNight = { time: 0.35, speed: 0.0002, enabled: false }; // 0=midnight, 0.25=sunrise, 0.5=noon, 0.75=sunset
    window.toggleDayNight = () => { window._dayNight.enabled = !window._dayNight.enabled; showToast(window._dayNight.enabled ? '\ud83c\udf05 Day/Night ON' : '\u2600\ufe0f Day/Night OFF'); };
    if (window._dnFrame) cancelAnimationFrame(window._dnFrame);
    (function _dn() {
      window._dnFrame = requestAnimationFrame(_dn);
      if (!window._dayNight || !window._dayNight.enabled) return;
      const dn = window._dayNight;
      dn.time = (dn.time + dn.speed) % 1;
      const t = dn.time;
      // Sun position follows time
      const sunAngle = t * Math.PI * 2 - Math.PI/2;
      const sunY = Math.sin(sunAngle);
      const sunX = Math.cos(sunAngle);
      if (sun) {
        sun.position.set(sunX * 200, Math.max(sunY * 200, 5), 100);
        sun.intensity = Math.max(0, sunY * 2.5);
      }
      // Sky color transitions
      const isDay = sunY > 0;
      if (isDay) {
        const dayProgress = sunY;
        const r = 0.49 + dayProgress * 0.1;
        const g = 0.78 + dayProgress * 0.05;
        const b = 0.89 + dayProgress * 0.05;
        if (!scene.background?.isTexture) scene.background = new THREE.Color(r, g, b);
        if (amb) amb.intensity = 0.4 + dayProgress * 0.5;
      } else {
        const nightDepth = Math.abs(sunY);
        const r = 0.05 + (1-nightDepth) * 0.2;
        const g = 0.05 + (1-nightDepth) * 0.15;
        const b = 0.15 + (1-nightDepth) * 0.25;
        if (!scene.background?.isTexture) scene.background = new THREE.Color(r, g, b);
        if (amb) amb.intensity = 0.1 + (1-nightDepth) * 0.2;
      }
      // Street lights glow at night
      if (window._streetLightPts) {
        const nightIntensity = sunY < 0.1 ? Math.max(0, (0.1 - sunY) * 8) : 0;
        for (const pl of window._streetLightPts) pl.intensity = nightIntensity;
      }
      if (window._trafficLights && sunY < 0.1) {
        for (const tl of window._trafficLights) {
          if (tl.mesh) tl.mesh.traverse(n => {
            if (n.isMesh && n.material) {
              if (!n.material._origEmissive) n.material._origEmissive = true;
              n.material.emissive = n.material.emissive || new THREE.Color();
              n.material.emissive.setHex(tl.state === 'red' ? 0xff2200 : 0x00ff44);
              n.material.emissiveIntensity = 0.5;
            }
          });
        }
      }
    })();
  } catch (e) {
    console.error('[buildCityWorld3]', e);
    showToast('\u26a0 City error: ' + e.message);
  }
}

window.buildCityWorld3=buildCityWorld3;


// ═══════════════════════════════════════════════════
// HORROR WORLD — kenney_graveyard kit
// ═══════════════════════════════════════════════════
// [REMOVED] buildHorrorWorld — old world builder deleted


// ═══════════════════════════════════════════════════
// SPACE WORLD — kenney_space modular station kit
// ═══════════════════════════════════════════════════
// [REMOVED] buildSpaceWorld — old world builder deleted

// [REMOVED] buildSpaceCombatGame — old world builder deleted












// ══════════════════════════════════════════════════════
// TEMPLATE PRESET SYSTEM — direct Three.js, no command chain
// ══════════════════════════════════════════════════════
async function applyTemplatePreset(mode) {
  if (!mode) return;

  const scene = _scene;
  const objects = _objects;
  const renderer = _renderer;
  const bloomPass = _bloomPass;
  const currentGround = _currentGround;
  const parseAndExecute = _parseAndExecute;

  const darkenGround = (color, roughness = 0.95) => {
    if (currentGround?.material) {
      currentGround.material.color.setHex(color);
      currentGround.material.roughness = roughness;
      if (currentGround.material.map) currentGround.material.map = null;
      currentGround.material.needsUpdate = true;
    }
  };
  const setNight = () => {
    renderer.setClearColor(0x0a0a1a);
    scene.fog = new THREE.FogExp2(0x080810, 0.018);
    scene.traverse(c => {
      if (c.isAmbientLight) c.intensity = 0.12;
      if (c.isDirectionalLight) { c.intensity = 0.05; c.color.setHex(0x334466); }
    });
    // Horror vignette + desaturate
    if (window._colorPass) {
      window._colorPass.uniforms.vignetteStrength.value = 0.85;
      window._colorPass.uniforms.saturation.value = 0.25;
      window._colorPass.uniforms.brightness.value = 0.82;
      window._colorPass.uniforms.contrast.value = 1.35;
      window._colorPass.uniforms.vignetteColor.value = new THREE.Color(0.4, 0.0, 0.0);
    }
    if (bloomPass) bloomPass.strength = 0.6;
    darkenGround(0x111a11, 0.98); // dark grass at night
  };

  const setAfternoon = () => {
    renderer.setClearColor(0x87ceeb);
    scene.fog = null;
    scene.traverse(c => {
      if (c.isAmbientLight) c.intensity = 1.0;
      if (c.isDirectionalLight) { c.intensity = 1.4; c.color.setHex(0xfff5e0); }
    });
    if (window._colorPass) {
      window._colorPass.uniforms.vignetteStrength.value = 0.2;
      window._colorPass.uniforms.saturation.value = 1.15;
      window._colorPass.uniforms.brightness.value = 1.05;
      window._colorPass.uniforms.contrast.value = 1.1;
    }
  };

  const setSpace = () => {
    renderer.setClearColor(0x020208);
    scene.fog = null;
    scene.traverse(c => {
      if (c.isAmbientLight) c.intensity = 0.25;
      if (c.isDirectionalLight) { c.intensity = 1.8; c.color.setHex(0xc0d0ff); }
    });
    if (window._colorPass) {
      window._colorPass.uniforms.vignetteStrength.value = 0.5;
      window._colorPass.uniforms.saturation.value = 0.85;
      window._colorPass.uniforms.brightness.value = 0.9;
      window._colorPass.uniforms.contrast.value = 1.4;
    }
    if (bloomPass) bloomPass.strength = 1.2;
    // Star field
    const starGeo = new THREE.BufferGeometry();
    const sv = new Float32Array(3000 * 3);
    for (let i = 0; i < sv.length; i++) sv[i] = (Math.random() - 0.5) * 2000;
    starGeo.setAttribute('position', new THREE.BufferAttribute(sv, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({color:0xffffff, size:0.8}));
    scene.add(stars);
  };

  const setSunset = () => {
    renderer.setClearColor(0xff6b35);
    scene.fog = new THREE.FogExp2(0x443322, 0.01);
    scene.traverse(c => {
      if (c.isAmbientLight) c.intensity = 0.55;
      if (c.isDirectionalLight) { c.intensity = 0.9; c.color.setHex(0xff8844); }
    });
    if (window._colorPass) {
      window._colorPass.uniforms.vignetteStrength.value = 0.45;
      window._colorPass.uniforms.saturation.value = 1.3;
      window._colorPass.uniforms.brightness.value = 0.95;
    }
    if (bloomPass) bloomPass.strength = 0.7;
    darkenGround(0x2a3a1a, 0.9); // forest floor at sunset
  };

  // Spawn helper — place models in a grid/arc around spawn point
  const spawnGrid = async (models, spacing = 18, baseZ = -25) => {
    for (let i = 0; i < models.length; i++) {
      const col = i % 3, row = Math.floor(i / 3);
      const x = (col - 1) * spacing, z = -(baseZ + row * spacing);
      const glbKey = models[i];
      const glbPath = GLB_MODELS[glbKey];
      if (!glbPath) continue;
      await new Promise(resolve => {
        gltfLoader.load(glbPath, gltf => {
          const m = gltf.scene;
          m.position.set(x, 0, z);
          m.userData = { name: glbKey, glbPath, isGLB: true };
          scene.add(m); objects.push(m); resolve();
        }, undefined, resolve);
      });
    }
  };

  const spawnLine = async (models, startX = -40, stepX = 15, z = -30) => {
    for (let i = 0; i < models.length; i++) {
      const glbKey = models[i];
      const glbPath = GLB_MODELS[glbKey];
      if (!glbPath) continue;
      await new Promise(resolve => {
        gltfLoader.load(glbPath, gltf => {
          const m = gltf.scene;
          m.position.set(startX + i * stepX, 0, z);
          m.userData = { name: glbKey, glbPath, isGLB: true };
          scene.add(m); objects.push(m); resolve();
        }, undefined, resolve);
      });
    }
  };

  if (mode === 'horror') {
    setNight();
    const _hcmds = ['add horror_house','add horror_house','add horror_house','add horror_house',
                    'add horror_car','add street_light_horror','add street_light_horror','add street_light_horror',
                    'add killer_character','add medkit','add medkit'];
    (async () => { for(const c of _hcmds){ await parseAndExecute(c); await new Promise(r=>setTimeout(r,80)); } })();
    if (typeof addQuest === 'function') setTimeout(() => addQuest('Survive the Night'), 2500);

  } else if (mode === 'city') {
    // City 2 — nice city with driving cars
    setTimeout(() => { if (window.buildCityWorld2) true; }, 600);
    return;
    buildCityWorld3();

  } else if (mode === 'space') {
    // Space Combat Game — auto-launch
    setTimeout(() => { if (window.buildSpaceCombatGame) true; }, 600);
    return;

  } else if (mode === 'rpg') {
    setSunset();
    darkenGround(0x2a3a1a, 0.9);
    const _rcmds = ['add dark_knight','add zombie','add zombie','add zombie',
                    'add fantasy_tree','add fantasy_tree','add fantasy_tree','add fantasy_tree',
                    'add treasure chest','add treasure chest',
                    'add kite_shield','add kite_shield'];
    (async () => { for(const c of _rcmds){ await parseAndExecute(c); await new Promise(r=>setTimeout(r,80)); } })();
    if (typeof addQuest === 'function') setTimeout(() => addQuest('Defeat the Dark Knight'), 2500);
  }
}
// ═══════════════════════════════════════════════════════════
// FULL CITY WORLD BUILDER v1.0
// Zones: Downtown Core → Midtown → Residential → Castle Outskirts
// ═══════════════════════════════════════════════════════════
window._cityVehicles = [];
window._cityVehicleRAF = null;

function _stopCityVehicles() {
  if (window._cityVehicleRAF) { cancelAnimationFrame(window._cityVehicleRAF); window._cityVehicleRAF = null; }
  window._cityVehicles = [];
}

function _startCityVehicles() {
  _stopCityVehicles();
  function tick() {
    for (const v of window._cityVehicles) {
      if (!v.mesh) continue;
      const wp = v.path[v.wpIdx];
      const dx = wp[0] - v.mesh.position.x;
      const dz = wp[1] - v.mesh.position.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      if (dist < 1.5) {
        v.wpIdx = (v.wpIdx + 1) % v.path.length;
      } else {
        const nx = dx/dist, nz = dz/dist;
        v.mesh.position.x += nx * v.spd;
        v.mesh.position.z += nz * v.spd;
        v.mesh.rotation.y = Math.atan2(nx, nz);
      }
    }
    window._cityVehicleRAF = requestAnimationFrame(tick);
  }
  tick();
}

// [REMOVED] buildFullCity — old world builder deleted

export { buildGerstnerLake, buildMineInterior, populateMineAssets, loadGroupedAsset, listGroupPieces, buildPackShowcase, loadUEBuilding, buildCityWorld3, applyTemplatePreset, _stopCityVehicles, _startCityVehicles };
