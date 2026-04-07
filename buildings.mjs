import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const gltfLoader = new GLTFLoader();

// Local copy of makeMat helper (same as engine.mjs)
function makeMat(color, opts = {}) {
  var _r = opts.rough || opts.roughness || 0.5
  var _m = opts.metal || opts.metalness || 0.1
  var _f = opts.flat || opts.flatShading || false
  return new THREE.MeshStandardMaterial({ color, roughness: _r, metalness: _m, flatShading: _f, transparent: opts.transparent || false, opacity: opts.opacity !== undefined ? opts.opacity : 1 });
}

// Scene accessor for functions that need to add to scene directly
let _scene = null;
function setBuildingsScene(s) { _scene = s; }
function _getBuildingsScene() { return _scene || (window._engineBridge && window._engineBridge.scene) || null; }

// === INTERIOR BUILDING SYSTEM (v82) ===
// Buildings with walkable interiors — walls with door cutouts, floors, furniture, lighting

function createWallWithDoor(width, height, depth, doorW, doorH, mat) {
  // Create a wall shape with a rectangular door hole using CSG-like approach (two pieces)
  const g = new THREE.Group();
  // Left wall section
  const leftW = (width - doorW) / 2;
  if (leftW > 0.01) {
    const left = new THREE.Mesh(new THREE.BoxGeometry(leftW, height, depth), mat);
    left.position.set(-(doorW/2 + leftW/2), height/2, 0);
    left.castShadow = true; left.receiveShadow = true; g.add(left);
  }
  // Right wall section
  const rightW = (width - doorW) / 2;
  if (rightW > 0.01) {
    const right = new THREE.Mesh(new THREE.BoxGeometry(rightW, height, depth), mat);
    right.position.set(doorW/2 + rightW/2, height/2, 0);
    right.castShadow = true; right.receiveShadow = true; g.add(right);
  }
  // Top section (above door)
  const topH = height - doorH;
  if (topH > 0.01) {
    const top = new THREE.Mesh(new THREE.BoxGeometry(doorW, topH, depth), mat);
    top.position.set(0, doorH + topH/2, 0);
    top.castShadow = true; top.receiveShadow = true; g.add(top);
  }
  // Add actual door mesh (can be opened with E key)
  const doorMat = makeMat(0x5a3a1a, {rough: 0.85}); // dark wood
  const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.05, doorH - 0.05, 0.05), doorMat);
  // Door pivots from left edge — offset position so rotation looks right
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-doorW/2 + 0.025, 0, 0); // hinge at left side
  doorMesh.position.set(doorW/2 - 0.025, doorH/2, 0);
  doorMesh.castShadow = true;
  doorPivot.add(doorMesh);
  doorPivot.userData.isDoor = true;
  doorPivot.userData.isOpen = false;
  doorPivot.userData.isSolid = true;
  doorPivot.userData.name = 'door';
  g.add(doorPivot);
  g.userData.door = doorPivot; // reference for interaction

  // Door handle
  const handleMat = makeMat(0xc0a060, {metal: 0.8, rough: 0.3});
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.06), handleMat);
  handle.position.set(doorW/2 - 0.15, doorH * 0.45, 0.04);
  doorPivot.add(handle);

  return g;
}

function createSolidWall(width, height, depth, mat) {
  const w = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
  w.position.y = height / 2;
  w.castShadow = true; w.receiveShadow = true;
  w.userData.isSolid = true;
  w.userData.isWall = true;
  return w;
}

function createInteriorHouse(opts) {
  const o = opts || {};
  const w = o.width || 5;      // interior width
  const d = o.depth || 5;      // interior depth
  const h = o.height || 3;     // wall height
  const wallT = 0.15;          // wall thickness
  const doorW = o.doorWidth || 1.0;
  const doorH = o.doorHeight || 2.0;
  const floors = o.floors || 1;
  const color = o.color || 0x8B7355;

  const g = new THREE.Group();
  g.userData.isInterior = true;
  g.userData.interiorBounds = { width: w, depth: d, height: h * floors, floors: floors };

  const wallMat = makeMat(color, {rough: 0.85});
  const wallMatInner = makeMat(0xd4c9a8, {rough: 0.9}); // lighter interior
  const floorMat = makeMat(0x6a4a2a, {rough: 0.9});      // wooden floor
  const roofMat = makeMat(0x8B1A1A, {rough: 0.75});
  const glassMat = makeMat(0x88ccff, {rough: 0.1, metal: 0.3});
  const woodMat = makeMat(0x5a3a1a, {rough: 0.9});
  const ceilingMat = makeMat(0xe8e0d0, {rough: 0.95});

  for (let floor = 0; floor < floors; floor++) {
    const baseY = floor * h;

    // --- FLOOR ---
    const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(w + wallT*2, 0.1, d + wallT*2), floor === 0 ? makeMat(0x666666, {rough: 0.9}) : floorMat);
    floorMesh.position.set(0, baseY + 0.05, 0);
    floorMesh.receiveShadow = true;
    floorMesh.userData.isFloor = true;
    floorMesh.userData.isSolid = true;
    g.add(floorMesh);

    // --- INTERIOR FLOOR (wooden, slightly above foundation) ---
    if (floor === 0) {
      const wood = new THREE.Mesh(new THREE.BoxGeometry(w - 0.05, 0.05, d - 0.05), floorMat);
      wood.position.set(0, baseY + 0.125, 0);
      wood.receiveShadow = true; g.add(wood);
    }

    // --- FRONT WALL (with door on ground floor) ---
    if (floor === 0) {
      const frontDoorWall = createWallWithDoor(w, h, wallT, doorW, doorH, wallMat);
      frontDoorWall.position.set(0, baseY, d/2 + wallT/2);
      g.add(frontDoorWall);
      // Door frame trim
      const frameMat = woodMat;
      const leftFrame = new THREE.Mesh(new THREE.BoxGeometry(0.06, doorH, 0.08), frameMat);
      leftFrame.position.set(-doorW/2, baseY + doorH/2, d/2 + wallT/2);
      g.add(leftFrame);
      const rightFrame = new THREE.Mesh(new THREE.BoxGeometry(0.06, doorH, 0.08), frameMat);
      rightFrame.position.set(doorW/2, baseY + doorH/2, d/2 + wallT/2);
      g.add(rightFrame);
      const topFrame = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.12, 0.06, 0.08), frameMat);
      topFrame.position.set(0, baseY + doorH, d/2 + wallT/2);
      g.add(topFrame);
    } else {
      // Upper floors: solid front wall with window
      const fw = createSolidWall(w, h, wallT, wallMat);
      fw.position.set(0, baseY, d/2 + wallT/2);
      g.add(fw);
    }

    // --- BACK WALL (solid) ---
    const backWall = createSolidWall(w, h, wallT, wallMat);
    backWall.position.set(0, baseY, -(d/2 + wallT/2));
    g.add(backWall);

    // --- LEFT WALL (solid) ---
    const leftWall = createSolidWall(wallT, h, d, wallMat);
    leftWall.position.set(-(w/2 + wallT/2), baseY, 0);
    g.add(leftWall);

    // --- RIGHT WALL (solid) ---
    const rightWall = createSolidWall(wallT, h, d, wallMat);
    rightWall.position.set(w/2 + wallT/2, baseY, 0);
    g.add(rightWall);

    // --- INTERIOR WALLS (inner color panels, Andrew Woan style — lighter inside) ---
    // Front inner
    if (floor > 0 || true) {
      const innerBack = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMatInner);
      innerBack.position.set(0, baseY + h/2, -(d/2));
      innerBack.receiveShadow = true; g.add(innerBack);
      // Left inner
      const innerLeft = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMatInner);
      innerLeft.position.set(-(w/2), baseY + h/2, 0);
      innerLeft.rotation.y = Math.PI/2;
      innerLeft.receiveShadow = true; g.add(innerLeft);
      // Right inner
      const innerRight = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMatInner);
      innerRight.position.set(w/2, baseY + h/2, 0);
      innerRight.rotation.y = -Math.PI/2;
      innerRight.receiveShadow = true; g.add(innerRight);
    }

    // --- WINDOWS ---
    // Back wall windows
    [-w*0.25, w*0.25].forEach(x => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, wallT + 0.04), woodMat);
      frame.position.set(x, baseY + h * 0.6, -(d/2 + wallT/2));
      g.add(frame);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.38), glassMat);
      glass.position.set(x, baseY + h * 0.6, -(d/2 + wallT + 0.01));
      g.add(glass);
    });
    // Side wall windows
    [1, -1].forEach(side => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(wallT + 0.04, 0.5, 0.6), woodMat);
      frame.position.set(side * (w/2 + wallT/2), baseY + h * 0.6, 0);
      g.add(frame);
    });

    // --- CEILING / NEXT FLOOR ---
    if (floor === floors - 1) {
      const ceiling = new THREE.Mesh(new THREE.BoxGeometry(w + wallT*2, 0.1, d + wallT*2), ceilingMat);
      ceiling.position.set(0, baseY + h, 0);
      ceiling.receiveShadow = true;
      ceiling.userData.isSolid = true;
      g.add(ceiling);
    }

    // --- INTERIOR LIGHT (warm point light per floor) ---
    const light = new THREE.PointLight(0xffe4b5, 0.8, w * 2.5);
    light.position.set(0, baseY + h - 0.3, 0);
    light.castShadow = false; // perf
    g.add(light);

    // --- FURNITURE (ground floor) ---
    if (floor === 0) {
      // Table
      const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.6), woodMat);
      tableTop.position.set(w*0.2, baseY + 0.75, -d*0.25);
      tableTop.castShadow = true; g.add(tableTop);
      // Table legs
      [[-0.4, -0.25], [0.4, -0.25], [-0.4, 0.25], [0.4, 0.25]].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), woodMat);
        leg.position.set(w*0.2 + lx*0.5, baseY + 0.35, -d*0.25 + lz*0.6);
        g.add(leg);
      });

      // Chair
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.4), woodMat);
      seat.position.set(w*0.2, baseY + 0.45, -d*0.25 + 0.55);
      g.add(seat);
      const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.04), woodMat);
      chairBack.position.set(w*0.2, baseY + 0.7, -d*0.25 + 0.73);
      g.add(chairBack);

      // Bookshelf against back wall
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.3), woodMat);
      shelf.position.set(-w*0.3, baseY + 0.6, -d/2 + 0.2);
      shelf.castShadow = true; g.add(shelf);
      // Books (colored blocks on shelf)
      [0xcc3333, 0x3333cc, 0x33cc33, 0xcccc33, 0x9933cc].forEach((bc, i) => {
        const book = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.18), makeMat(bc));
        book.position.set(-w*0.3 - 0.25 + i*0.13, baseY + 1.05, -d/2 + 0.2);
        g.add(book);
      });

      // Rug (center floor)
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.5), makeMat(0x993333, {rough: 0.95}));
      rug.rotation.x = -Math.PI/2;
      rug.position.set(0, baseY + 0.13, 0.3);
      g.add(rug);

      // Fireplace (back wall, if wide enough)
      if (w >= 4) {
        const fpBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.35), makeMat(0x884444, {rough: 0.85}));
        fpBase.position.set(w*0.3, baseY + 0.4, -d/2 + 0.2);
        g.add(fpBase);
        const fpTop = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.4), makeMat(0x666666));
        fpTop.position.set(w*0.3, baseY + 0.85, -d/2 + 0.2);
        g.add(fpTop);
        // Fireplace opening (dark)
        const fpHole = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.5), makeMat(0x111111));
        fpHole.position.set(w*0.3, baseY + 0.35, -d/2 + 0.39);
        g.add(fpHole);
        // Fire light
        const fireLight = new THREE.PointLight(0xff6622, 0.6, 3);
        fireLight.position.set(w*0.3, baseY + 0.3, -d/2 + 0.3);
        g.add(fireLight);
      }
    }

    // --- FURNITURE (upper floors — bedroom) ---
    if (floor === 1) {
      // Bed
      const bedBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 2.0), woodMat);
      bedBase.position.set(-w*0.25, baseY + 0.2, 0);
      g.add(bedBase);
      const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.15, 1.9), makeMat(0xeeeedd, {rough: 0.95}));
      mattress.position.set(-w*0.25, baseY + 0.425, 0);
      g.add(mattress);
      const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.3), makeMat(0xffffff, {rough: 0.95}));
      pillow.position.set(-w*0.25, baseY + 0.55, -0.7);
      g.add(pillow);

      // Dresser
      const dresser = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.4), woodMat);
      dresser.position.set(w*0.3, baseY + 0.4, -d/2 + 0.25);
      g.add(dresser);
    }
  }

  // --- STAIRS (multi-floor) ---
  if (floors > 1) {
    const stairW = 0.8;
    const stairSteps = 10;
    const stepH = h / stairSteps;
    const stepD = (d * 0.6) / stairSteps;
    for (let s = 0; s < stairSteps; s++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(stairW, stepH, stepD), woodMat);
      step.position.set(w/2 - stairW/2 - 0.1, s * stepH + stepH/2, d/2 - 0.5 - s * stepD);
      step.receiveShadow = true;
      step.userData.isSolid = true;
      step.userData.isStair = true;
      g.add(step);
    }
    // Stair hole in ceiling (remove ceiling section above stairs)
    // We'll add a second floor opening
    const holeFloor = new THREE.Mesh(new THREE.BoxGeometry(stairW + 0.3, 0.12, d * 0.65), floorMat);
    holeFloor.position.set(w/2 - stairW/2 - 0.1, h - 0.02, d/2 - 0.5 - (stairSteps/2) * stepD);
    holeFloor.visible = false; // invisible — just creating the gap by NOT placing floor there
    // (The floor mesh already covers full area, but we'll cut by making stair area transparent)
  }

  // --- ROOF ---
  const roofPeak = 1.5;
  const roofOverhang = 0.4;
  const totalH = floors * h;
  // Roof ridge (simple pitched roof)
  const roofGeo = new THREE.BufferGeometry();
  const hw = w/2 + wallT + roofOverhang;
  const hd = d/2 + wallT + roofOverhang;
  const rh = roofPeak;
  // Two triangular planes for pitched roof
  const roofLeft = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.sqrt(hw*hw + rh*rh)*2, d + wallT*2 + roofOverhang*2),
    roofMat
  );
  const angle = Math.atan2(rh, hw);
  roofLeft.rotation.set(0, 0, angle);
  roofLeft.position.set(-hw/2, totalH + rh/2, 0);
  roofLeft.castShadow = true; g.add(roofLeft);

  const roofRight = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.sqrt(hw*hw + rh*rh)*2, d + wallT*2 + roofOverhang*2),
    roofMat
  );
  roofRight.rotation.set(0, 0, -angle);
  roofRight.position.set(hw/2, totalH + rh/2, 0);
  roofRight.castShadow = true; g.add(roofRight);

  // Roof overhang flat
  const overhang = new THREE.Mesh(new THREE.BoxGeometry(w + wallT*2 + roofOverhang*2, 0.05, d + wallT*2 + roofOverhang*2), roofMat);
  overhang.position.set(0, totalH, 0); g.add(overhang);

  // --- FRONT STEPS ---
  const step1 = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.4, 0.08, 0.3), makeMat(0x777777));
  step1.position.set(0, 0.04, d/2 + wallT + 0.15); g.add(step1);
  const step2 = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.6, 0.08, 0.3), makeMat(0x777777));
  step2.position.set(0, 0.04, d/2 + wallT + 0.45); g.add(step2);

  g.userData.name = 'interior house';
  g.userData.isInterior = true;
  return g;
}


// === MODERN FURNISHED HOUSE (HD GLB Models) ===
// === PROCEDURAL BUILDING SYSTEM ===


// ═══ KENNEY MODEL HELPERS — Load real GLB models into city generation ═══
const KENNEY_CITY_BUILDINGS = [
  'kenney_city/building-a', 'kenney_city/building-b', 'kenney_city/building-c',
  'kenney_city/building-d', 'kenney_city/building-e', 'kenney_city/building-f',
  'kenney_city/building-g', 'kenney_city/building-h', 'kenney_city/building-i',
  'kenney_city/building-j', 'kenney_city/building-k', 'kenney_city/building-l',
];
const KENNEY_VEHICLES = [
  'kenney_cars/sedan', 'kenney_cars/sedan-sports', 'kenney_cars/suv',
  'kenney_cars/suv-luxury', 'kenney_cars/taxi', 'kenney_cars/van',
  'kenney_cars/hatchback-sports', 'kenney_cars/truck', 'kenney_cars/police',
];
const KENNEY_ROAD_PIECES = [
  'kenney_roads/road-straight', 'kenney_roads/road-curve',
  'kenney_roads/road-intersection', 'kenney_roads/road-end',
];
const KENNEY_FANTASY_PROPS = [
  'kenney_fantasy/fence', 'kenney_fantasy/cart', 'kenney_fantasy/fountain-center',
  'kenney_fantasy/banner-red', 'kenney_fantasy/barrel', 'kenney_fantasy/well',
  'kenney_fantasy/chimney', 'kenney_fantasy/lantern',
];
const KENNEY_GRAVEYARD_PROPS = [
  'kenney_graveyard/grave-cross', 'kenney_graveyard/grave-round',
  'kenney_graveyard/coffin', 'kenney_graveyard/candle',
  'kenney_graveyard/character-skeleton', 'kenney_graveyard/character-ghost',
  'kenney_graveyard/altar-stone', 'kenney_graveyard/bench-damaged',
];

function loadKenneyModel(modelPath, x, y, z, scale, sceneRef) {
  const scene = sceneRef || _getBuildingsScene();
  const s = scale || 3;
  gltfLoader.load('/models/' + modelPath + '.glb', (gltf) => {
    const model = gltf.scene;
    model.scale.setScalar(s);
    model.position.set(x, y, z);
    model.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    model.userData.name = modelPath.split('/').pop();
    if (scene) scene.add(model);
    window._sceneObjects = window._sceneObjects || [];
    window._sceneObjects.push(model);
  });
}

function randomKenneyBuilding(x, z) {
  const model = KENNEY_CITY_BUILDINGS[Math.floor(Math.random() * KENNEY_CITY_BUILDINGS.length)];
  loadKenneyModel(model, x, 0, z, 4 + Math.random() * 2);
}

function randomKenneyVehicle(x, z, rotation) {
  const scene = _getBuildingsScene();
  const model = KENNEY_VEHICLES[Math.floor(Math.random() * KENNEY_VEHICLES.length)];
  gltfLoader.load('/models/' + model + '.glb', (gltf) => {
    const m = gltf.scene;
    m.scale.setScalar(2.5);
    m.position.set(x, 0.1, z);
    if (rotation) m.rotation.y = rotation;
    m.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    m.userData.name = 'parked_car';
    if (scene) scene.add(m);
    window._sceneObjects = window._sceneObjects || [];
    window._sceneObjects.push(m);
  });
}


function createSkyscraper(opts) {
  const o = opts || {};
  const floors = o.floors || (8 + Math.floor(Math.random() * 12)); // 8-20 floors (was 10-30)
  const w = o.width || (10 + Math.random() * 6);
  const d = o.depth || (10 + Math.random() * 6);
  const floorH = 3.5;
  const totalH = floors * floorH;
  const g = new THREE.Group();
  g.userData.name = 'Skyscraper (' + floors + 'F)';
  g.userData.isBuilding = true; g.userData.isSolid = true;
  const style = Math.floor(Math.random() * 4);
  const frameColors = [0x334455, 0x444444, 0x553333, 0x222222];
  const glassColors = [0x88bbdd, 0xaacccc, 0xddccaa, 0x99aabb];
  const frameMat = makeMat(frameColors[style], {rough: 0.3, metal: 0.7});
  const glassMat = new THREE.MeshPhysicalMaterial({color: glassColors[style], roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.35, side: THREE.DoubleSide});
  const floorMat2 = makeMat(0x666666, {rough: 0.6});
  const ledgeMat = makeMat(0x888888, {rough: 0.4, metal: 0.5});

  // Main body — single box with frame material
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, totalH, d), frameMat);
  body.position.y = totalH/2; body.castShadow = true; body.userData.isSolid = true; g.add(body);

  // Glass panels — just 4 large panels (one per side) instead of per-floor
  const glassH = totalH - 1;
  [1,-1].forEach(side => {
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w-0.6, glassH), glassMat);
    front.position.set(0, totalH/2 + 0.2, side*(d/2+0.02));
    if(side<0) front.rotation.y = Math.PI; g.add(front);
  });
  [1,-1].forEach(side => {
    const sideW = new THREE.Mesh(new THREE.PlaneGeometry(d-0.6, glassH), glassMat);
    sideW.position.set(side*(w/2+0.02), totalH/2 + 0.2, 0);
    sideW.rotation.y = side*Math.PI/2; g.add(sideW);
  });

  // Horizontal ledges every 5 floors (not every floor)
  for (let fl = 5; fl < floors; fl += 5) {
    const y = fl * floorH;
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(w+0.4, 0.12, d+0.4), ledgeMat);
    ledge.position.y = y; g.add(ledge);
  }

  // A few vertical mullion lines (not per-floor)
  const mullionCount = Math.floor(w / 3);
  for (let m = 1; m < mullionCount; m++) {
    const mx = -w/2 + 0.3 + m*(w-0.6)/mullionCount;
    [d/2+0.03, -(d/2+0.03)].forEach(z => {
      const mull = new THREE.Mesh(new THREE.BoxGeometry(0.04, totalH-1, 0.04), frameMat);
      mull.position.set(mx, totalH/2, z); g.add(mull);
    });
  }
  // Horizontal floor lines on glass
  for (let fl = 1; fl < floors; fl++) {
    const y = fl * floorH;
    [d/2+0.03, -(d/2+0.03)].forEach(z => {
      const line = new THREE.Mesh(new THREE.BoxGeometry(w-0.4, 0.06, 0.04), frameMat);
      line.position.set(0, y, z); g.add(line);
    });
  }

  // Roof
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w+0.3, 0.25, d+0.3), ledgeMat);
  roof.position.y = totalH+0.12; g.add(roof);
  // AC + antenna
  const ac = new THREE.Mesh(new THREE.BoxGeometry(2,1,1.5), makeMat(0x888888,{rough:0.6}));
  ac.position.set(w*0.2, totalH+0.8, 0); g.add(ac);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,4), makeMat(0xaaaaaa,{rough:0.3,metal:0.8}));
  antenna.position.set(-w*0.2, totalH+2.3, -d*0.2); g.add(antenna);
  // Entrance
  const entrGlass = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), glassMat);
  entrGlass.position.set(0, 1.5, d/2+0.03); g.add(entrGlass);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(4, 0.08, 1.5), ledgeMat);
  awning.position.set(0, 3.2, d/2+0.8); g.add(awning);
  // Interior light (just 2-3, not per floor)
  [totalH*0.25, totalH*0.6].forEach(y => {
    const light = new THREE.PointLight(0xfff5e0, 0.2, w*2);
    light.position.set(0, y, 0); g.add(light);
  });
  return g;
}


function createCommercialBuilding(opts) {
  const o = opts || {};
  const type = o.type || ['salon','barber','grocery','clothing','restaurant','pharmacy','bank','cafe','gym','laundry'][Math.floor(Math.random()*10)];
  const w = o.width || 12; const d = o.depth || 10; const h = o.height || 4.5;
  const g = new THREE.Group();
  g.userData.name = type.charAt(0).toUpperCase() + type.slice(1);
  g.userData.isBuilding = true; g.userData.isInterior = true; g.userData.isSolid = true;
  const storeColors = {salon:0xdd88aa, barber:0x4466aa, grocery:0x44aa44, clothing:0xaa4488, restaurant:0xcc6633, pharmacy:0x44aaaa, bank:0x555566, cafe:0x886644, gym:0x444444, laundry:0x6688aa};
  const mainColor = storeColors[type] || 0x888888;
  const wallMat = makeMat(0xe8e0d5, {rough: 0.7});
  const glassMat = new THREE.MeshPhysicalMaterial({color:0x88ccee, roughness:0.05, metalness:0.2, transparent:true, opacity:0.25, side: THREE.DoubleSide});
  const signMat = makeMat(mainColor, {rough: 0.3});
  const trimMat = makeMat(0x333333, {rough: 0.4});
  const floorMat2 = makeMat(0x8B6B4A, {rough: 0.75});
  const intWallMat = makeMat(0xf0ece3, {rough: 0.85});
  const wallT = 0.18;
  // Floor
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w+0.4, 0.15, d+0.4), makeMat(0x888888,{rough:0.7}));
  slab.position.y=0.075; slab.receiveShadow=true; slab.userData.isSolid=true; g.add(slab);
  const ifl = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), floorMat2);
  ifl.position.y=0.165; ifl.receiveShadow=true; g.add(ifl);
  // Walls - front has large store window
  const dw = 1.2, dh = 2.2;
  // Front left wall
  const fL = new THREE.Mesh(new THREE.BoxGeometry(w*0.25, h, wallT), wallMat);
  fL.position.set(-w*0.375, h/2, d/2+wallT/2); fL.castShadow=true; fL.userData.isSolid=true; g.add(fL);
  // Front right (door area)
  const fR = new THREE.Mesh(new THREE.BoxGeometry(w*0.15, h, wallT), wallMat);
  fR.position.set(w*0.425, h/2, d/2+wallT/2); fR.castShadow=true; fR.userData.isSolid=true; g.add(fR);
  // Above store window
  const fT = new THREE.Mesh(new THREE.BoxGeometry(w*0.6, h*0.3, wallT), wallMat);
  fT.position.set(0, h*0.85, d/2+wallT/2); fT.userData.isSolid=true; g.add(fT);
  // Below store window
  const fB = new THREE.Mesh(new THREE.BoxGeometry(w*0.6, 0.5, wallT), wallMat);
  fB.position.set(0, 0.25, d/2+wallT/2); g.add(fB);
  // Large glass storefront
  const storeGlass = new THREE.Mesh(new THREE.PlaneGeometry(w*0.55, h*0.55), glassMat);
  storeGlass.position.set(-w*0.05, h*0.45, d/2+wallT+0.01); g.add(storeGlass);
  // Door
  const door = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.06), makeMat(0x5a3a1a,{rough:0.7}));
  door.position.set(w*0.32, dh/2, d/2+wallT/2); g.add(door);
  // Sign band
  const sign = new THREE.Mesh(new THREE.BoxGeometry(w+0.2, 0.8, 0.15), signMat);
  sign.position.set(0, h-0.2, d/2+0.15); g.add(sign);
  // Awning
  const awn = new THREE.Mesh(new THREE.BoxGeometry(w*0.7, 0.05, 1.8), makeMat(mainColor,{rough:0.6}));
  awn.position.set(0, h*0.65, d/2+1); awn.rotation.x=-0.12; g.add(awn);
  // Back + side walls
  const bw = new THREE.Mesh(new THREE.BoxGeometry(w, h, wallT), wallMat);
  bw.position.set(0, h/2, -(d/2+wallT/2)); bw.castShadow=true; bw.userData.isSolid=true; g.add(bw);
  [-1,1].forEach(side => {
    const sw = new THREE.Mesh(new THREE.BoxGeometry(wallT, h, d), wallMat);
    sw.position.set(side*(w/2+wallT/2), h/2, 0); sw.castShadow=true; sw.userData.isSolid=true; g.add(sw);
  });
  // Interior walls
  [[0,h/2,-(d/2-0.01),w,h,0],[0,h/2,d/2-0.01,w,h,Math.PI],
   [-(w/2-0.01),h/2,0,d,h,Math.PI/2],[w/2-0.01,h/2,0,d,h,-Math.PI/2]].forEach(([x,y,z,sx,sy,ry])=>{
    const p = new THREE.Mesh(new THREE.PlaneGeometry(sx,sy), intWallMat);
    p.position.set(x,y,z); p.rotation.y=ry; p.receiveShadow=true; g.add(p);
  });
  // Ceiling + roof
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(w+wallT*2, 0.12, d+wallT*2), makeMat(0x888888,{rough:0.6}));
  ceil.position.y=h; ceil.receiveShadow=true; ceil.userData.isSolid=true; g.add(ceil);
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(w+0.4, 0.4, d+0.4), makeMat(0x999999,{rough:0.6}));
  parapet.position.y=h+0.2; g.add(parapet);
  // Interior light
  const cL = new THREE.PointLight(0xfff0dd, 1.0, w*2);
  cL.position.set(0, h-0.2, 0); g.add(cL);
  // Furniture based on type
  const furniture = [];
  if (type==='salon'||type==='barber') {
    furniture.push({m:'ph_ArmChair_01',p:[-w*0.2,0.18,0],s:1.5},{m:'ph_ArmChair_01',p:[w*0.1,0.18,0],s:1.5});
    furniture.push({m:'ph_Shelf_01',p:[-w*0.35,0.18,-d*0.35],s:1.3});
  } else if (type==='grocery') {
    furniture.push({m:'ph_Shelf_01',p:[-w*0.25,0.18,-d*0.2],s:1.5},{m:'ph_Shelf_01',p:[w*0.1,0.18,-d*0.2],s:1.5});
    furniture.push({m:'ph_WoodenTable_01',p:[0,0.18,d*0.2],s:1.8});
  } else if (type==='restaurant'||type==='cafe') {
    furniture.push({m:'ph_WoodenTable_01',p:[-w*0.2,0.18,0],s:1.8},{m:'ph_WoodenTable_01',p:[w*0.15,0.18,0],s:1.8});
    furniture.push({m:'ph_WoodenChair_01',p:[-w*0.3,0.18,0.5],r:Math.PI/2,s:1.3},{m:'ph_WoodenChair_01',p:[-w*0.1,0.18,0.5],r:-Math.PI/2,s:1.3});
    furniture.push({m:'ph_WoodenChair_01',p:[w*0.05,0.18,0.5],r:Math.PI/2,s:1.3},{m:'ph_WoodenChair_01',p:[w*0.25,0.18,0.5],r:-Math.PI/2,s:1.3});
  } else if (type==='bank') {
    furniture.push({m:'ph_WoodenTable_01',p:[0,0.18,-d*0.2],s:2.0});
    furniture.push({m:'ph_ArmChair_01',p:[0,0.18,-d*0.05],r:Math.PI,s:1.5});
  } else {
    furniture.push({m:'ph_Shelf_01',p:[-w*0.3,0.18,-d*0.3],s:1.3});
    furniture.push({m:'ph_WoodenTable_01',p:[0,0.18,d*0.1],s:1.8});
  }
  furniture.forEach(f => {
    gltfLoader.load('/models/'+f.m+'.glb',(gltf)=>{
      const obj=gltf.scene; obj.position.set(f.p[0],f.p[1],f.p[2]);
      if(f.r) obj.rotation.y=f.r; if(f.s) obj.scale.setScalar(f.s);
      obj.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true;}}); g.add(obj);
    },null,()=>{});
  });
  return g;
}

function createPitchedRoofHouse(opts) {
  const o = opts || {};
  const w = o.width || 12; const d = o.depth || 10; const wallH = 3.2;
  const floors = o.floors || 2; const totalH = wallH * floors;
  const roofPitch = o.pitch || 0.4; const roofH = (w/2) * roofPitch;
  const wallT = 0.18;
  const style = o.style || ['siding','brick','stucco'][Math.floor(Math.random()*3)];
  const g = new THREE.Group();
  g.userData.name = (o.name||'House')+' ('+style+')';
  g.userData.isBuilding=true; g.userData.isInterior=true; g.userData.isSolid=true;
  g.userData.interiorBounds = {width:w, depth:d, height:totalH, floors};
  const extColors = {brick:0x8B4513, siding:0xd4c9a8, stucco:0xe0d8c8};
  const extMat = makeMat(extColors[style]||0xd4c9a8, {rough: style==='brick'?0.85:0.7});
  const intWallMat = makeMat(0xf0ece3, {rough:0.85});
  const floorMat2 = makeMat(0x8B6B4A, {rough:0.75});
  const roofColors = [0x553333,0x444455,0x335533,0x554433];
  const roofMat = makeMat(roofColors[Math.floor(Math.random()*roofColors.length)], {rough:0.7});
  const glassMat = new THREE.MeshPhysicalMaterial({color:0x88ccee, roughness:0.05, metalness:0.1, transparent:true, opacity:0.25, side:THREE.DoubleSide});
  const trimMat = makeMat(0xf0ece3, {rough:0.6});
  const doorMat = makeMat(0x5a3a1a, {rough:0.7});
  const stairMat = makeMat(0x5a3a1a, {rough:0.8});
  for (let fl = 0; fl < floors; fl++) {
    const by = fl * wallH;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w+wallT*2+0.2, 0.15, d+wallT*2+0.2), fl===0?makeMat(0x888888,{rough:0.7}):floorMat2);
    slab.position.set(0,by+0.075,0); slab.receiveShadow=true; slab.userData.isSolid=true; g.add(slab);
    const ifl = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), floorMat2);
    ifl.position.set(0,by+0.165,0); ifl.receiveShadow=true; g.add(ifl);
    if (fl === 0) {
      const dw=1.2, dh=2.2, halfSide=(w-dw)/2;
      const fL = new THREE.Mesh(new THREE.BoxGeometry(halfSide, wallH, wallT), extMat);
      fL.position.set(-(dw/2+halfSide/2), by+wallH/2, d/2+wallT/2); fL.castShadow=true; fL.userData.isSolid=true; g.add(fL);
      const fR = new THREE.Mesh(new THREE.BoxGeometry(halfSide, wallH, wallT), extMat);
      fR.position.set(dw/2+halfSide/2, by+wallH/2, d/2+wallT/2); fR.castShadow=true; fR.userData.isSolid=true; g.add(fR);
      const fT = new THREE.Mesh(new THREE.BoxGeometry(dw, wallH-dh, wallT), extMat);
      fT.position.set(0, by+dh+(wallH-dh)/2, d/2+wallT/2); fT.userData.isSolid=true; g.add(fT);
      const door = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.06), doorMat);
      door.position.set(0,by+dh/2,d/2+wallT/2); g.add(door);
      [[-(dw/2),dh/2,0.06,dh,0.04],[dw/2,dh/2,0.06,dh,0.04],[0,dh,dw+0.12,0.06,0.04]].forEach(([x,y,sx,sy,sz])=>{
        const fr = new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz), trimMat); fr.position.set(x,by+y,d/2+wallT/2); g.add(fr);
      });
      [-w*0.32, w*0.32].forEach(x => {
        const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.2), glassMat);
        gl.position.set(x, by+wallH*0.55, d/2+wallT+0.01); g.add(gl);
        const wf = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 0.03), trimMat);
        wf.position.set(x, by+wallH*0.55, d/2+wallT/2); g.add(wf);
      });
    } else {
      const fw = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, wallT), extMat);
      fw.position.set(0,by+wallH/2,d/2+wallT/2); fw.castShadow=true; fw.userData.isSolid=true; g.add(fw);
      [-w*0.3,0,w*0.3].forEach(x => {
        const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), glassMat);
        gl.position.set(x,by+wallH*0.55,d/2+wallT+0.01); g.add(gl);
        const wf = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 0.03), trimMat);
        wf.position.set(x,by+wallH*0.55,d/2+wallT/2); g.add(wf);
      });
    }
    const bw = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, wallT), extMat);
    bw.position.set(0,by+wallH/2,-(d/2+wallT/2)); bw.castShadow=true; bw.userData.isSolid=true; g.add(bw);
    [-w*0.25,w*0.25].forEach(x => {
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.2), glassMat);
      gl.position.set(x,by+wallH*0.55,-(d/2+wallT+0.01)); gl.rotation.y=Math.PI; g.add(gl);
      const wf = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 0.03), trimMat);
      wf.position.set(x,by+wallH*0.55,-(d/2+wallT/2)); g.add(wf);
    });
    [-1,1].forEach(side => {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, d), extMat);
      sw.position.set(side*(w/2+wallT/2),by+wallH/2,0); sw.castShadow=true; sw.userData.isSolid=true; g.add(sw);
      [-d*0.25,d*0.25].forEach(z => {
        const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.0), glassMat);
        gl.position.set(side*(w/2+wallT+0.01),by+wallH*0.55,z); gl.rotation.y=side*Math.PI/2; g.add(gl);
      });
    });
    [[0,wallH/2,-(d/2-0.01),w,wallH,0],[0,wallH/2,d/2-0.01,w,wallH,Math.PI],
     [-(w/2-0.01),wallH/2,0,d,wallH,Math.PI/2],[w/2-0.01,wallH/2,0,d,wallH,-Math.PI/2]].forEach(([x,y,z,sx,sy,ry])=>{
      const p = new THREE.Mesh(new THREE.PlaneGeometry(sx,sy), intWallMat);
      p.position.set(x,by+y,z); p.rotation.y=ry; p.receiveShadow=true; g.add(p);
    });
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(w+wallT*2, 0.12, d+wallT*2), fl===floors-1?makeMat(0x8B6B4A,{rough:0.8}):makeMat(0xf5f2ee,{rough:0.9}));
    ceil.position.set(0,by+wallH,0); ceil.receiveShadow=true; ceil.userData.isSolid=true; g.add(ceil);
    const cL = new THREE.PointLight(0xfff0dd, 1.2, w*2);
    cL.position.set(0,by+wallH-0.2,0); g.add(cL);
    const furniture = [];
    if (fl===0) {
      furniture.push({m:'ph_Sofa_01',p:[-w*0.2,0.18,d*0.15],r:Math.PI,s:1.8});
      furniture.push({m:'ph_ArmChair_01',p:[w*0.25,0.18,d*0.2],r:-Math.PI/4,s:1.5});
      furniture.push({m:'ph_CoffeeTable_01',p:[0,0.18,d*0.1],s:1.5});
      furniture.push({m:'ph_Television_01',p:[0,0.9,-d*0.35],s:2.0});
      furniture.push({m:'ph_electric_stove',p:[w*0.3,0.18,-d*0.35],s:1.0});
      furniture.push({m:'ph_WoodenTable_01',p:[-w*0.3,0.18,-d*0.2],s:2.0});
      furniture.push({m:'ph_WoodenChair_01',p:[-w*0.4,0.18,-d*0.1],r:Math.PI/2,s:1.3});
      furniture.push({m:'ph_WoodenChair_01',p:[-w*0.2,0.18,-d*0.1],r:-Math.PI/2,s:1.3});
    }
    if (fl===1) {
      furniture.push({m:'ph_GothicBed_01',p:[-w*0.2,0.18,0],s:1.8});
      furniture.push({m:'ph_drawer_cabinet',p:[w*0.3,0.18,-d*0.35],s:1.3});
      furniture.push({m:'ph_desk_lamp_arm_01',p:[w*0.3,0.9,-d*0.35],s:0.8});
      furniture.push({m:'ph_Rockingchair_01',p:[w*0.25,0.18,d*0.2],r:-Math.PI/3,s:1.3});
    }
    furniture.forEach(f => {
      gltfLoader.load('/models/'+f.m+'.glb',(gltf)=>{
        const obj=gltf.scene; obj.position.set(f.p[0],f.p[1]+by,f.p[2]);
        if(f.r) obj.rotation.y=f.r; if(f.s) obj.scale.setScalar(f.s);
        obj.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true;}}); g.add(obj);
      },null,()=>{});
    });
  }
  if (floors > 1) {
    const sw2=1.0, steps=12, stepH=wallH/steps, stepD=(d*0.5)/steps;
    for (let s=0; s<steps; s++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(sw2, stepH, stepD+0.02), stairMat);
      st.position.set(w/2-sw2/2-0.3, s*stepH+stepH/2, d/2-0.8-s*stepD);
      st.receiveShadow=true; st.userData.isStair=true; st.userData.isSolid=true; g.add(st);
    }
  }
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-w/2-0.5, 0); roofShape.lineTo(0, roofH); roofShape.lineTo(w/2+0.5, 0); roofShape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, {depth:d+1, bevelEnabled:false});
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(0, totalH, -d/2-0.5); roof.castShadow=true; g.add(roof);
  if (Math.random()>0.3) {
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.6, roofH+1.5, 0.6), makeMat(0x884444,{rough:0.8}));
    chimney.position.set(w*0.25, totalH+roofH*0.5+0.5, -d*0.2); chimney.castShadow=true; g.add(chimney);
  }
  const porch = new THREE.Mesh(new THREE.BoxGeometry(4, 0.15, 2), makeMat(0x888888,{rough:0.7}));
  porch.position.set(0,0.075,d/2+1.2); porch.receiveShadow=true; g.add(porch);
  const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.08, 2.5), roofMat);
  porchRoof.position.set(0,2.6,d/2+1.3); g.add(porchRoof);
  [-1.8,1.8].forEach(x => {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,2.5), trimMat);
    col.position.set(x,1.3,d/2+2.2); g.add(col);
  });
  return g;
}

function createMansion(opts) {
  return createPitchedRoofHouse({width:18, depth:14, floors:2, pitch:0.45, name:'Mansion', style:(opts||{}).style||'brick', ...(opts||{})});
}

function createDuplex(opts) {
  const g = new THREE.Group(); g.userData.name='Duplex'; g.userData.isBuilding=true;
  const left = createPitchedRoofHouse({width:8, depth:8, floors:2, style:'siding'});
  left.position.x=-4.5; g.add(left);
  const right = createPitchedRoofHouse({width:8, depth:8, floors:2, style:'siding'});
  right.position.x=4.5; g.add(right);
  return g;
}

function createRanchHouse(opts) {
  return createPitchedRoofHouse({width:16, depth:10, floors:1, pitch:0.25, name:'Ranch House', style:'siding', ...(opts||{})});
}


function createParkingLot(opts) {
  const o = opts || {};
  const w = o.width || 30, d = o.depth || 20;
  const g = new THREE.Group(); g.userData.name = 'Parking Lot';
  // Asphalt surface
  const asphalt = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), makeMat(0x333333, {rough:0.9}));
  asphalt.receiveShadow = true; g.add(asphalt);
  // Parking lines
  const lineMat = makeMat(0xdddddd, {rough:0.5});
  const spots = Math.floor(w / 3);
  for (let i = 0; i < spots; i++) {
    const x = -w/2 + 1.5 + i * 3;
    // Top row
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 5), lineMat);
    line.position.set(x, 0.04, -d/4); g.add(line);
    // Bottom row
    const line2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 5), lineMat);
    line2.position.set(x, 0.04, d/4); g.add(line2);
  }
  // Horizontal end lines
  const endLine1 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, 0.08), lineMat);
  endLine1.position.set(0, 0.04, -d/4 - 2.5); g.add(endLine1);
  const endLine2 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, 0.08), lineMat);
  endLine2.position.set(0, 0.04, -d/4 + 2.5); g.add(endLine2);
  const endLine3 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, 0.08), lineMat);
  endLine3.position.set(0, 0.04, d/4 - 2.5); g.add(endLine3);
  const endLine4 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, 0.08), lineMat);
  endLine4.position.set(0, 0.04, d/4 + 2.5); g.add(endLine4);
  return g;
}

function createGasStation(opts) {
  const o = opts || {};
  const g = new THREE.Group(); g.userData.name = 'Gas Station';
  // Main building
  const wallMat = makeMat(0xdddddd, {rough:0.5});
  const roofMat = makeMat(0x2244aa, {rough:0.4});
  const building = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 6), wallMat);
  building.position.y = 1.5; building.castShadow = true; g.add(building);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.2, 6.5), roofMat);
  roof.position.y = 3.1; g.add(roof);
  // Canopy over pumps
  const canopyMat = makeMat(0xeeeeee, {rough:0.3});
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(12, 0.15, 8), canopyMat);
  canopy.position.set(0, 4, -6); canopy.castShadow = true; g.add(canopy);
  // Canopy pillars
  const pillarMat = makeMat(0x888888, {rough:0.4, metal:0.5});
  [[-5, -9], [-5, -3], [5, -9], [5, -3]].forEach(([x, z]) => {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 4), pillarMat);
    pillar.position.set(x, 2, z); g.add(pillar);
  });
  // Gas pumps
  const pumpMat = makeMat(0x444444, {rough:0.3});
  [-2, 2].forEach(x => {
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.4), pumpMat);
    pump.position.set(x, 0.9, -6); pump.castShadow = true; g.add(pump);
    // Screen
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), makeMat(0x00ff00, {rough:0.2, emissive:0x00ff00, emissiveIntensity:0.3}));
    screen.position.set(x, 1.4, -5.79); g.add(screen);
  });
  // Sign
  const signPole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6), pillarMat);
  signPole.position.set(-6, 3, -6); g.add(signPole);
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 0.1), roofMat);
  signBoard.position.set(-6, 6.5, -6); g.add(signBoard);
  return g;
}

function createBridge(opts) {
  const o = opts || {};
  const length = o.length || 40, width = o.width || 8;
  const g = new THREE.Group(); g.userData.name = 'Bridge';
  const concreteMat = makeMat(0x999999, {rough:0.7});
  const railMat = makeMat(0x666666, {rough:0.4, metal:0.6});
  // Road deck
  const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 0.3, length), concreteMat);
  deck.position.y = 3; deck.receiveShadow = true; deck.castShadow = true; g.add(deck);
  // Support pillars
  for (let z = -length/3; z <= length/3; z += length/3) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 6, 1.5), concreteMat);
    pillar.position.set(0, 0, z); pillar.castShadow = true; g.add(pillar);
  }
  // Railings
  for (let z = -length/2; z <= length/2; z += 3) {
    [-width/2, width/2].forEach(x => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2), railMat);
      post.position.set(x, 3.75, z); g.add(post);
    });
  }
  // Top rails
  [-width/2, width/2].forEach(x => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, length), railMat);
    rail.position.set(x, 4.4, 0); g.add(rail);
  });
  // Ramps
  const rampGeo = new THREE.BoxGeometry(width, 0.3, 8);
  const ramp1 = new THREE.Mesh(rampGeo, concreteMat);
  ramp1.position.set(0, 1.5, -length/2 - 3); ramp1.rotation.x = 0.35; g.add(ramp1);
  const ramp2 = new THREE.Mesh(rampGeo, concreteMat);
  ramp2.position.set(0, 1.5, length/2 + 3); ramp2.rotation.x = -0.35; g.add(ramp2);
  return g;
}




function createSupermarket(opts) {
  const o = opts || {};
  const g = new THREE.Group(); g.userData.name = 'Supermarket';
  g.userData.isBuilding = true;
  const w = 20, d = 14, h = 5;
  const wallMat = makeMat(0xeeeeee, {rough:0.5});
  const roofMat = makeMat(0x444444, {rough:0.6});
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  body.position.y = h/2; body.castShadow = true; g.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w+0.5, 0.2, d+0.5), roofMat);
  roof.position.y = h+0.1; g.add(roof);
  // Big front windows
  const glassMat = new THREE.MeshPhysicalMaterial({color: 0x88ccee, roughness: 0.05, transparent: true, opacity: 0.25});
  const frontGlass = new THREE.Mesh(new THREE.PlaneGeometry(w*0.8, h*0.6), glassMat);
  frontGlass.position.set(0, h*0.45, d/2+0.01); g.add(frontGlass);
  // Sign band
  const signColors = [0x22aa44, 0x2244aa, 0xcc2222, 0xcc8822];
  const signColor = signColors[Math.floor(Math.random()*signColors.length)];
  const signMat = makeMat(signColor, {rough:0.3});
  const sign = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, 0.15), signMat);
  sign.position.set(0, h-0.4, d/2+0.08); g.add(sign);
  // Automatic doors
  const doorMat = makeMat(0x666666, {rough:0.3, metal:0.5});
  const door = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.5), doorMat);
  door.position.set(0, 1.25, d/2+0.02); g.add(door);
  // Shopping cart corral
  const cartMat = makeMat(0xaaaaaa, {rough:0.3, metal:0.7});
  const corral = new THREE.Mesh(new THREE.BoxGeometry(4, 0.6, 1), cartMat);
  corral.position.set(-6, 0.3, d/2+2); g.add(corral);
  // Parking lot in front
  const asphalt = new THREE.Mesh(new THREE.BoxGeometry(w+4, 0.06, 10), makeMat(0x333333, {rough:0.9}));
  asphalt.position.set(0, 0, d/2+8); asphalt.receiveShadow = true; g.add(asphalt);
  // Parking lines
  const lineMat = makeMat(0xdddddd, {rough:0.5});
  for (let li = -8; li <= 8; li += 2.5) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 4), lineMat);
    line.position.set(li, 0.04, d/2+8); g.add(line);
  }
  return g;
}

function createApartmentBuilding(opts) {
  const o = opts || {};
  const floors = o.floors || (3 + Math.floor(Math.random() * 3));
  const w = o.width || 16, d = o.depth || 10;
  const floorH = 3;
  const totalH = floors * floorH;
  const g = new THREE.Group();
  g.userData.name = 'Apartment (' + floors + 'F)';
  g.userData.isBuilding = true;

  const colors = [0xcc8866, 0xaa7755, 0x998877, 0xbbaa88, 0xddccaa];
  const wallColor = colors[Math.floor(Math.random() * colors.length)];
  const wallMat = makeMat(wallColor, {rough:0.7});
  const roofMat = makeMat(0x555555, {rough:0.6});
  const windowMat = new THREE.MeshPhysicalMaterial({color: 0x88bbdd, roughness: 0.05, transparent: true, opacity: 0.3});
  const frameMat = makeMat(0x444444, {rough:0.4});
  const balconyMat = makeMat(0x777777, {rough:0.5});

  // Main body
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, totalH, d), wallMat);
  body.position.y = totalH/2; body.castShadow = true; body.receiveShadow = true; g.add(body);

  // Roof
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w+0.3, 0.2, d+0.3), roofMat);
  roof.position.y = totalH + 0.1; g.add(roof);

  // Windows per floor
  for (let fl = 0; fl < floors; fl++) {
    const y = fl * floorH + 1.8;
    const windowsPerSide = Math.floor(w / 3);
    for (let wi = 0; wi < windowsPerSide; wi++) {
      const x = -w/2 + 1.5 + wi * 3;
      // Front windows
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.5), windowMat);
      win.position.set(x, y, d/2 + 0.01); g.add(win);
      // Back windows
      const win2 = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.5), windowMat);
      win2.position.set(x, y, -(d/2 + 0.01)); win2.rotation.y = Math.PI; g.add(win2);
    }
    // Balconies on front (every other floor)
    if (fl > 0 && fl % 2 === 0) {
      for (let bi = 0; bi < 2; bi++) {
        const bx = -w/4 + bi * w/2;
        const balcony = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 1.2), balconyMat);
        balcony.position.set(bx, fl * floorH + 0.05, d/2 + 0.6); g.add(balcony);
        // Railing
        const rail = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 0.05), frameMat);
        rail.position.set(bx, fl * floorH + 0.45, d/2 + 1.15); g.add(rail);
      }
    }
  }

  // Entry door
  const doorMat = makeMat(0x664422, {rough:0.6});
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.5), doorMat);
  door.position.set(0, 1.25, d/2 + 0.01); g.add(door);
  // Entry awning
  const awning = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 1.5), roofMat);
  awning.position.set(0, 2.8, d/2 + 0.5); g.add(awning);

  return g;
}

function createBusStop() {
  const g = new THREE.Group(); g.userData.name = 'Bus Stop';
  const poleMat = makeMat(0x666666, {rough:0.3, metal:0.6});
  const roofMat = makeMat(0x3366aa, {rough:0.4});
  const glassMat = new THREE.MeshPhysicalMaterial({color: 0x88ccee, roughness: 0.05, transparent: true, opacity: 0.25});
  // Shelter roof
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 1.5), roofMat);
  roof.position.y = 2.5; roof.castShadow = true; g.add(roof);
  // Support poles
  [[-1.3, -0.6], [1.3, -0.6]].forEach(([x, z]) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.5), poleMat);
    pole.position.set(x, 1.25, z); g.add(pole);
  });
  // Back panel (glass)
  const back = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), glassMat);
  back.position.set(0, 1.5, -0.7); g.add(back);
  // Bench
  const benchMat = makeMat(0x885533, {rough:0.7});
  const bench = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 0.4), benchMat);
  bench.position.set(0, 0.5, -0.3); g.add(bench);
  const benchLegs = makeMat(0x555555, {rough:0.4});
  [-0.9, 0.9].forEach(x => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), benchLegs);
    leg.position.set(x, 0.25, -0.3); g.add(leg);
  });
  // Sign
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.02), roofMat);
  sign.position.set(1.5, 2.8, 0); g.add(sign);
  const signPole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3), poleMat);
  signPole.position.set(1.5, 1.5, 0); g.add(signPole);
  return g;
}

function createDumpster() {
  const g = new THREE.Group(); g.userData.name = 'Dumpster';
  const mat = makeMat(0x336633, {rough:0.6, metal:0.3});
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 1.2), mat);
  body.position.y = 0.6; body.castShadow = true; g.add(body);
  // Lid
  const lid = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.08, 1.25), mat);
  lid.position.y = 1.24; g.add(lid);
  // Wheels
  const wheelMat = makeMat(0x222222, {rough:0.8});
  [[-0.8, -0.55], [0.8, -0.55], [-0.8, 0.55], [0.8, 0.55]].forEach(([x, z]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8), wheelMat);
    wheel.rotation.z = Math.PI/2; wheel.position.set(x, 0.12, z); g.add(wheel);
  });
  return g;
}

function createTrashCan() {
  const g = new THREE.Group(); g.userData.name = 'Trash Can';
  const mat = makeMat(0x555555, {rough:0.5, metal:0.4});
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 0.8, 12), mat);
  body.position.y = 0.4; g.add(body);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.04, 12), mat);
  lid.position.y = 0.82; g.add(lid);
  return g;
}

function createSwimmingPool(opts) {
  const o = opts || {}; const w = o.width || 8; const d = o.depth || 4;
  const g = new THREE.Group(); g.userData.name = 'Swimming Pool';
  // ABOVE-GROUND pool — walls go UP from ground, water visible from any angle
  const wallH = 1.2; // Wall height above ground
  const waterH = wallH - 0.15; // Water surface just below rim
  const wallThick = 0.15;
  const tileMat = makeMat(0x1a6680, {rough:0.15});
  const outerMat = makeMat(0x8899aa, {rough:0.4}); // Outer wall color
  const deckMat = makeMat(0xccbbaa, {rough:0.6});
  const waterMat = new THREE.MeshPhysicalMaterial({color:0x2299dd, roughness:0.05, transparent:true, opacity:0.7, side: THREE.DoubleSide});
  // Concrete deck/pad around pool
  const pad = new THREE.Mesh(new THREE.BoxGeometry(w+3, 0.15, d+3), deckMat);
  pad.position.y = 0.075; pad.receiveShadow = true; g.add(pad);
  // Pool walls — rise ABOVE ground
  // Front wall
  const fw = new THREE.Mesh(new THREE.BoxGeometry(w + wallThick*2, wallH, wallThick), outerMat);
  fw.position.set(0, wallH/2, -d/2); fw.castShadow = true; g.add(fw);
  // Back wall
  const bw = new THREE.Mesh(new THREE.BoxGeometry(w + wallThick*2, wallH, wallThick), outerMat);
  bw.position.set(0, wallH/2, d/2); bw.castShadow = true; g.add(bw);
  // Left wall
  const lw = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallH, d), outerMat);
  lw.position.set(-w/2, wallH/2, 0); lw.castShadow = true; g.add(lw);
  // Right wall
  const rw = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallH, d), outerMat);
  rw.position.set(w/2, wallH/2, 0); rw.castShadow = true; g.add(rw);
  // Inner tile lining (slightly smaller, different color)
  [[0, wallH/2, -d/2+wallThick/2, w, wallH-0.05, 0.02],
   [0, wallH/2, d/2-wallThick/2, w, wallH-0.05, 0.02],
   [-w/2+wallThick/2, wallH/2, 0, 0.02, wallH-0.05, d-wallThick*2],
   [w/2-wallThick/2, wallH/2, 0, 0.02, wallH-0.05, d-wallThick*2]].forEach(([x,y,z,sx,sy,sz])=>{
    const tile = new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz), tileMat); tile.position.set(x,y,z); g.add(tile);
  });
  // Pool floor (at ground level, visible through water)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w - wallThick*2, 0.1, d - wallThick*2), tileMat);
  floor.position.y = 0.2; g.add(floor);
  // WATER SURFACE — clearly visible blue water inside the walls
  const water = new THREE.Mesh(new THREE.PlaneGeometry(w - wallThick*2 - 0.1, d - wallThick*2 - 0.1), waterMat);
  water.rotation.x = -Math.PI/2; water.position.y = waterH; water.name = 'poolWater'; g.add(water);
  // White rim/coping around top edge
  const rimMat = makeMat(0xffffff, {rough:0.3});
  const rimH = 0.08; const rimW = 0.25;
  [[0, wallH + rimH/2, -d/2, w + rimW*2, rimH, rimW],
   [0, wallH + rimH/2, d/2, w + rimW*2, rimH, rimW],
   [-w/2, wallH + rimH/2, 0, rimW, rimH, d],
   [w/2, wallH + rimH/2, 0, rimW, rimH, d]].forEach(([x,y,z,sx,sy,sz])=>{
    const rim = new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz), rimMat); rim.position.set(x,y,z); g.add(rim);
  });
  // Pool ladders — INSIDE (descend into pool) + OUTSIDE (climb up to pool)
  const ladderMat = makeMat(0xcccccc, {rough:0.2, metal:0.8});
  const lr = 0.035;
  // Inside ladder (hangs into pool from rim) — front wall, offset right
  const insideX = w/4; const insideZ = -d/2 + wallThick/2;
  [-1, 1].forEach(side => {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(lr, lr, wallH + 0.4), ladderMat);
    rail.position.set(insideX + side*0.2, wallH/2 + 0.1, insideZ + 0.15); g.add(rail);
  });
  for (let i = 0; i < 3; i++) {
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4), ladderMat);
    rung.rotation.z = Math.PI/2;
    rung.position.set(insideX, 0.3 + i*0.35, insideZ + 0.15); g.add(rung);
  }
  // Outside ladder (leans against outer wall) — same X, but on outside of front wall
  const outsideZ = -d/2 - wallThick/2 - 0.1;
  const outerLadderH = wallH + 0.5; // taller to reach over the rim
  [-1, 1].forEach(side => {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(lr, lr, outerLadderH), ladderMat);
    // Lean slightly outward
    rail.rotation.x = 0.15;
    rail.position.set(insideX + side*0.2, outerLadderH/2 - 0.1, outsideZ - 0.1); g.add(rail);
  });
  for (let i = 0; i < 4; i++) {
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4), ladderMat);
    rung.rotation.z = Math.PI/2;
    rung.rotation.x = 0.15;
    rung.position.set(insideX, 0.15 + i*0.3, outsideZ - 0.05 - i*0.04); g.add(rung);
  }
  // Register water zone for swimming detection
  g.userData.registerWaterZone = function() {
    const pos = new THREE.Vector3();
    g.getWorldPosition(pos);
    const halfW = w/2, halfD = d/2;
    const box = new THREE.Box3(
      new THREE.Vector3(pos.x - halfW, pos.y - 1.5, pos.z - halfD),
      new THREE.Vector3(pos.x + halfW, pos.y + 0.1, pos.z + halfD)
    );
    window._waterZones = window._waterZones || [];
    window._waterZones.push(box);
  };
  return g;
}

function createStopSign() {
  const g = new THREE.Group(); g.userData.name='Stop Sign';
  const poleMat = makeMat(0x888888, {rough:0.3,metal:0.7});
  const signMat = makeMat(0xcc0000, {rough:0.5});
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,2.5), poleMat);
  pole.position.y=1.25; g.add(pole);
  const shape = new THREE.Shape();
  const r = 0.35;
  for (let i=0; i<8; i++) {
    const a = (i/8)*Math.PI*2 - Math.PI/8;
    if(i===0) shape.moveTo(Math.cos(a)*r, Math.sin(a)*r);
    else shape.lineTo(Math.cos(a)*r, Math.sin(a)*r);
  }
  shape.closePath();
  const signGeo = new THREE.ExtrudeGeometry(shape, {depth:0.02, bevelEnabled:false});
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.position.set(0,2.5,0); g.add(sign);
  return g;
}

function createTrafficLight() {
  const g = new THREE.Group(); g.userData.name='Traffic Light';
  const poleMat = makeMat(0x555555, {rough:0.3,metal:0.6});
  const bodyMat = makeMat(0x333333, {rough:0.5});
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.08,4), poleMat);
  pole.position.y=2; g.add(pole);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 0.2), bodyMat);
  body.position.set(0,4.2,0); g.add(body);
  [[0xcc0000,0.25],[0xcccc00,0],[0x00cc00,-0.25]].forEach(([color,yOff])=>{
    const light = new THREE.Mesh(new THREE.CircleGeometry(0.08,16), makeMat(color,{rough:0.2,emissive:color,emissiveIntensity:0.3}));
    light.position.set(0,4.2+yOff,0.11); g.add(light);
  });
  return g;
}

function createRoadSegment(opts) {
  const o = opts || {}; const length = o.length || 40;
  const lanes = o.lanes || 2; const laneW = 3.5; const totalW = lanes * laneW;
  const dir = o.direction || 'ns';
  const g = new THREE.Group(); g.userData.name='Road';
  const asphaltMat = makeMat(0x333333, {rough:0.85});
  const lineMat = makeMat(0xdddddd, {rough:0.5});
  const yellowMat = makeMat(0xddcc44, {rough:0.5});
  const sidewalkMat = makeMat(0xaaa898, {rough:0.7});
  const road = new THREE.Mesh(new THREE.BoxGeometry(totalW, 0.08, length), asphaltMat);
  road.position.y=0.04; road.receiveShadow=true; g.add(road);
  [-0.08,0.08].forEach(off => {
    const cl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.01, length), yellowMat);
    cl.position.set(off,0.09,0); g.add(cl);
  });
  for (let z=-length/2+1; z<length/2; z+=4) {
    [laneW/2,-laneW/2].forEach(x => {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.01, 2), lineMat);
      dash.position.set(x,0.09,z); g.add(dash);
    });
  }
  [-1,1].forEach(side => {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.01, length), lineMat);
    edge.position.set(side*(totalW/2-0.3),0.09,0); g.add(edge);
    const sw = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, length), sidewalkMat);
    sw.position.set(side*(totalW/2+1.5),0.06,0); sw.receiveShadow=true; g.add(sw);
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, length), makeMat(0x999999,{rough:0.6}));
    curb.position.set(side*(totalW/2+0.08),0.075,0); g.add(curb);
  });
  [-length/2+2, length/2-2].forEach(z => {
    for (let i=0; i<6; i++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.01, 0.15), lineMat);
      stripe.position.set(-totalW/2+1+i*(totalW-2)/5,0.09,z); g.add(stripe);
    }
  });
  if (dir==='ew') g.rotation.y = Math.PI/2;
  return g;
}

function createIntersection() {
  const laneW = 3.5; const totalW = 2*laneW; const size = totalW+5;
  const g = new THREE.Group(); g.userData.name='Intersection';
  const asphaltMat = makeMat(0x333333, {rough:0.85});
  const lineMat = makeMat(0xdddddd, {rough:0.5});
  const sidewalkMat = makeMat(0xaaa898, {rough:0.7});
  const road = new THREE.Mesh(new THREE.BoxGeometry(size, 0.08, size), asphaltMat);
  road.position.y=0.04; road.receiveShadow=true; g.add(road);
  [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([sx,sz])=>{
    const corner = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 2.5), sidewalkMat);
    corner.position.set(sx*(size/2+0.5),0.06,sz*(size/2+0.5)); g.add(corner);
  });
  // Crosswalk stripes
  const cwMat = makeMat(0xeeeeee, {rough:0.5});
  // North crosswalk
  for (let s = -2; s <= 2; s += 0.8) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 1.5), cwMat);
    stripe.position.set(s, 0.05, size/2 - 0.5); g.add(stripe);
  }
  // South crosswalk
  for (let s = -2; s <= 2; s += 0.8) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 1.5), cwMat);
    stripe.position.set(s, 0.05, -(size/2 - 0.5)); g.add(stripe);
  }
  // East crosswalk
  for (let s = -2; s <= 2; s += 0.8) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.09, 0.5), cwMat);
    stripe.position.set(size/2 - 0.5, 0.05, s); g.add(stripe);
  }
  // West crosswalk
  for (let s = -2; s <= 2; s += 0.8) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.09, 0.5), cwMat);
    stripe.position.set(-(size/2 - 0.5), 0.05, s); g.add(stripe);
  }
  return g;
}




function createGlassOfficeBuilding(opts) {
  const o = opts || {};
  const floors = o.floors || (6 + Math.floor(Math.random() * 8));
  const w = o.width || 14;
  const d = o.depth || 12;
  const floorH = 3.5;
  const totalH = floors * floorH;
  const wallT = 0.15;
  const g = new THREE.Group();
  g.userData.name = 'Office Building (' + floors + 'F)';
  g.userData.isBuilding = true; g.userData.isInterior = true; g.userData.isSolid = true;

  const frameMat = makeMat(0x334455, {rough: 0.3, metal: 0.7});
  const glassMat = new THREE.MeshPhysicalMaterial({color: 0x88bbdd, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.25, side: THREE.DoubleSide});
  const floorMat2 = makeMat(0x888888, {rough: 0.6});
  const carpetMat = makeMat(0x556677, {rough: 0.85});
  const ceilMat2 = makeMat(0xeeeeee, {rough: 0.9});

  for (let fl = 0; fl < floors; fl++) {
    const y = fl * floorH;
    // Floor slab
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w+0.3, 0.15, d+0.3), floorMat2);
    slab.position.y = y+0.075; slab.receiveShadow=true; slab.userData.isSolid=true; g.add(slab);
    // Carpet
    const carpet = new THREE.Mesh(new THREE.BoxGeometry(w-0.5, 0.02, d-0.5), carpetMat);
    carpet.position.y = y+0.16; g.add(carpet);
    // Glass walls (transparent — see through!)
    [1,-1].forEach(side => {
      const gw = new THREE.Mesh(new THREE.PlaneGeometry(w-0.3, floorH-0.3), glassMat);
      gw.position.set(0, y+floorH/2+0.1, side*(d/2)); if(side<0) gw.rotation.y=Math.PI; g.add(gw);
    });
    [1,-1].forEach(side => {
      const gw = new THREE.Mesh(new THREE.PlaneGeometry(d-0.3, floorH-0.3), glassMat);
      gw.position.set(side*(w/2), y+floorH/2+0.1, 0); gw.rotation.y=side*Math.PI/2; g.add(gw);
    });
    // Frame beams (horizontal at each floor)
    [d/2,-d/2].forEach(z => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w+0.3, 0.08, 0.08), frameMat);
      b.position.set(0, y+floorH, z); g.add(b);
    });
    [w/2,-w/2].forEach(x => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, d+0.3), frameMat);
      b.position.set(x, y+floorH, 0); g.add(b);
    });
    // Corner columns
    [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([sx,sz]) => {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.2, floorH, 0.2), frameMat);
      col.position.set(sx*w/2, y+floorH/2, sz*d/2); g.add(col);
    });
    // Ceiling
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), ceilMat2);
    ceil.position.y = y+floorH-0.04; g.add(ceil);
    // Interior light
    const light = new THREE.PointLight(0xfff5e0, 0.6, w*1.5);
    light.position.set(0, y+floorH-0.2, 0); g.add(light);
    // Office furniture on each floor
    const furniture = [
      {m:'ph_WoodenTable_01', p:[-w*0.25, 0.16, 0], s:1.8},
      {m:'ph_WoodenTable_01', p:[w*0.25, 0.16, 0], s:1.8},
      {m:'ph_ArmChair_01', p:[-w*0.25, 0.16, d*0.2], r:Math.PI, s:1.2},
      {m:'ph_ArmChair_01', p:[w*0.25, 0.16, d*0.2], r:Math.PI, s:1.2},
      {m:'ph_ArmChair_01', p:[-w*0.25, 0.16, -d*0.2], s:1.2},
      {m:'ph_ArmChair_01', p:[w*0.25, 0.16, -d*0.2], s:1.2},
    ];
    if (fl === 0) {
      furniture.push({m:'ph_Sofa_01', p:[0, 0.16, d*0.3], r:Math.PI, s:1.5});
    }
    furniture.forEach(f => {
      gltfLoader.load('/models/'+f.m+'.glb',(gltf)=>{
        const obj=gltf.scene; obj.position.set(f.p[0],f.p[1]+y,f.p[2]);
        if(f.r) obj.rotation.y=f.r; if(f.s) obj.scale.setScalar(f.s);
        obj.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true;}}); g.add(obj);
      },null,()=>{});
    });
  }
  // Entrance
  const entrGlass = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), glassMat);
  entrGlass.position.set(0, 1.5, d/2+0.02); g.add(entrGlass);
  // Stairs (internal)
  if (floors > 1) {
    const stairMat = makeMat(0x666666, {rough: 0.6});
    for (let fl = 0; fl < floors-1; fl++) {
      const baseY = fl * floorH;
      const steps = 10;
      for (let s = 0; s < steps; s++) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(1, floorH/steps, d*0.4/steps), stairMat);
        st.position.set(w*0.4, baseY + s*(floorH/steps) + (floorH/steps)/2, d*0.35 - s*(d*0.4/steps));
        st.userData.isStair=true; st.userData.isSolid=true; g.add(st);
      }
    }
  }
  return g;
}

function createStadium(opts) {
  const o = opts || {};
  const w = o.width || 40; const d = o.depth || 30; const h = 12;
  const g = new THREE.Group();
  g.userData.name = 'Stadium'; g.userData.isBuilding = true;
  const concreteMat = makeMat(0xaaa898, {rough: 0.7});
  const seatMat = makeMat(0x2255aa, {rough: 0.5});
  const fieldMat = makeMat(0x228833, {rough: 0.8});
  const trackMat = makeMat(0xcc6644, {rough: 0.6});
  // Outer walls (oval-ish using 4 curved sections)
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w+2, h, d+2), concreteMat);
  wall.position.y = h/2; wall.castShadow=true; g.add(wall);
  // Cut out interior (field)
  const interior = new THREE.Mesh(new THREE.BoxGeometry(w-4, h+1, d-4), new THREE.MeshBasicMaterial({color:0x000000}));
  interior.position.y = h/2+2; interior.material.visible = false; // Placeholder
  // Field (green grass)
  const field = new THREE.Mesh(new THREE.BoxGeometry(w-10, 0.1, d-10), fieldMat);
  field.position.y = 0.05; g.add(field);
  // Track around field
  const track = new THREE.Mesh(new THREE.BoxGeometry(w-6, 0.08, d-6), trackMat);
  track.position.y = 0.04; g.add(track);
  // Seating tiers (4 sides, angled)
  [[-1,0,d/2-2,w-8,h-2,2,0],
   [-1,0,-(d/2-2),w-8,h-2,2,0],
   [-(w/2-2),0,0,2,h-2,d-8,0],
   [w/2-2,0,0,2,h-2,d-8,0]].forEach(([x,_,z,sw,sh,sd,ry]) => {
    const tier = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), seatMat);
    tier.position.set(x === -1 ? 0 : x, sh/2+1, z);
    tier.receiveShadow=true; g.add(tier);
  });
  // Lights (4 tall floodlights)
  [[-w/2,d/2],[w/2,d/2],[-w/2,-d/2],[w/2,-d/2]].forEach(([x,z]) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.2,h+8), makeMat(0x888888,{rough:0.3,metal:0.6}));
    pole.position.set(x, (h+8)/2, z); g.add(pole);
    const light = new THREE.PointLight(0xffffee, 0.5, 60);
    light.position.set(x, h+8, z); g.add(light);
  });
  return g;
}

function createFence(opts) {
  const o = opts || {};
  const length = o.length || 10; const h = o.height || 1.2;
  const g = new THREE.Group(); g.userData.name = 'Fence';
  const woodMat = makeMat(0x8B6B4A, {rough: 0.8});
  // Horizontal rails
  [h*0.3, h*0.8].forEach(y => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.06, 0.04), woodMat);
    rail.position.y = y; g.add(rail);
  });
  // Vertical pickets
  const spacing = 0.15;
  const count = Math.floor(length / spacing);
  for (let i = 0; i <= count; i++) {
    const x = -length/2 + i * spacing;
    const picket = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, 0.03), woodMat);
    picket.position.set(x, h/2, 0); g.add(picket);
  }
  // Posts every 2m
  for (let x = -length/2; x <= length/2; x += 2) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, h+0.15, 0.08), woodMat);
    post.position.set(x, (h+0.15)/2, 0); g.add(post);
  }
  return g;
}

function createPark(opts) {
  const o = opts || {};
  const size = o.size || 30;
  const g = new THREE.Group(); g.userData.name = 'Park';
  // Grass
  const grass = new THREE.Mesh(new THREE.BoxGeometry(size, 0.08, size), makeMat(0x338833, {rough: 0.85}));
  grass.position.y = 0.04; grass.receiveShadow=true; g.add(grass);
  // Walking path (curved)
  for (let i = -5; i <= 5; i++) {
    const path = new THREE.Mesh(new THREE.BoxGeometry(2, 0.02, size*0.08), makeMat(0xbbaa88, {rough: 0.7}));
    path.position.set(i*2, 0.09, i*1.5); g.add(path);
  }
  // Pond
  const pondMat = new THREE.MeshPhysicalMaterial({color:0x2266aa, roughness:0.0, transparent:true, opacity:0.6});
  const pond = new THREE.Mesh(new THREE.CircleGeometry(4, 24), pondMat);
  pond.rotation.x = -Math.PI/2; pond.position.set(size*0.2, 0.05, size*0.15); g.add(pond);
  // Pond edge
  const edgeMat = makeMat(0x888877, {rough:0.7});
  const edge = new THREE.Mesh(new THREE.RingGeometry(3.8, 4.2, 24), edgeMat);
  edge.rotation.x = -Math.PI/2; edge.position.set(size*0.2, 0.06, size*0.15); g.add(edge);
  // Trees around park
  for (let i = 0; i < 8; i++) {
    const angle = (i/8) * Math.PI * 2;
    const r = size * 0.35;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 3), makeMat(0x5a3a1a, {rough:0.8}));
    trunk.position.set(Math.cos(angle)*r, 1.5, Math.sin(angle)*r); g.add(trunk);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 6), makeMat(0x227722, {rough:0.7}));
    canopy.position.set(Math.cos(angle)*r, 3.8, Math.sin(angle)*r); canopy.castShadow=true; g.add(canopy);
  }
  // Benches
  [[-3,0,0],[3,0,Math.PI],[0,-5,Math.PI/2],[0,5,-Math.PI/2]].forEach(([x,z,ry]) => {
    gltfLoader.load('/models/ph_park_bench.glb',(gltf)=>{
      const obj=gltf.scene; obj.position.set(x,0.08,z); obj.rotation.y=ry||0; obj.scale.setScalar(1.5);
      obj.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true;}}); g.add(obj);
    },null,()=>{});
  });
  return g;
}

// === PARKING LOT (v218) ===
function createSidewalk(opts) {
  opts = opts || {};
  var length = opts.length || 60, width = opts.width || 2;
  var g = new THREE.Group();
  var walk = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.15, width),
    new THREE.MeshStandardMaterial({ color: 0xccccbb, roughness: 0.85 })
  );
  walk.position.y = 0.075;
  walk.receiveShadow = true;
  g.add(walk);
  g.userData = { objectType: 'sidewalk', displayName: 'Sidewalk' };
  return g;
}

// === BRIDGE/OVERPASS (v218) ===
function createStreetLamp(opts) {
  opts = opts || {};
  var h = opts.height || 5;
  var g = new THREE.Group();
  // Pole
  var pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, h, 8),
    new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.3 })
  );
  pole.position.y = h/2;
  pole.castShadow = true;
  g.add(pole);
  // Arm
  var arm = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.08, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7 })
  );
  arm.position.set(0.75, h - 0.2, 0);
  g.add(arm);
  // Light housing
  var housing = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.15, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5 })
  );
  housing.position.set(1.5, h - 0.3, 0);
  g.add(housing);
  // Glow bulb
  var bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffdd88 })
  );
  bulb.position.set(1.5, h - 0.4, 0);
  g.add(bulb);
  // Point light
  var light = new THREE.PointLight(0xffdd88, 0.8, 15);
  light.position.set(1.5, h - 0.5, 0);
  light.castShadow = false; // Performance
  g.add(light);
  g.userData = { objectType: 'street_lamp', displayName: 'Street Lamp' };
  return g;
}

// === DUMPSTER (v218) ===
function createBench(opts) {
  var g = new THREE.Group();
  var seat = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.08, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.8 })
  );
  seat.position.set(0, 0.45, 0);
  g.add(seat);
  var back = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.5, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.8 })
  );
  back.position.set(0, 0.7, -0.17);
  g.add(back);
  for (var ls = -0.6; ls <= 0.6; ls += 1.2) {
    var leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.45, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5 })
    );
    leg.position.set(ls, 0.225, 0);
    g.add(leg);
  }
  g.userData = { objectType: 'bench', displayName: 'Park Bench' };
  return g;
}



function createModernHouse(opts) {
  const o = opts || {};
  const w = o.width || 8;
  const d = o.depth || 8;
  const h = o.height || 3.2;
  const floors = o.floors || 1;
  const wallT = 0.18;

  const g = new THREE.Group();
  g.userData.isInterior = true;
  g.userData.isModernHouse = true;
  g.userData.interiorBounds = { width: w, depth: d, height: h * floors, floors };
  g.userData.name = 'Modern House';

  const extWallMat = makeMat(0xd0cec5, {rough: 0.6});
  const intWallMat = makeMat(0xf0ece3, {rough: 0.85});
  const floorMat = makeMat(0x8B6B4A, {rough: 0.75});
  const ceilMat = makeMat(0xf5f2ee, {rough: 0.9});
  const glassMat = new THREE.MeshPhysicalMaterial({color:0x88ccee, roughness:0.05, metalness:0.2, transparent:true, opacity:0.3});
  const trimMat = makeMat(0x333333, {rough: 0.4});
  const roofMat = makeMat(0x444444, {rough: 0.7});
  const stairMat = makeMat(0x5a3a1a, {rough: 0.8});

  for (let fl = 0; fl < floors; fl++) {
    const by = fl * h;

    // Floor slab
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w+wallT*2+0.2, 0.15, d+wallT*2+0.2), fl===0 ? makeMat(0x888888,{rough:0.7}) : floorMat);
    slab.position.set(0, by+0.075, 0);
    slab.receiveShadow = true; slab.userData.isSolid = true; g.add(slab);

    // Interior hardwood
    const ifl = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), floorMat);
    ifl.position.set(0, by+0.165, 0); ifl.receiveShadow = true; g.add(ifl);

    // Front wall with door (ground floor only)
    if (fl === 0) {
      const dw = 1.2, dh = 2.2;
      const halfSide = (w - dw) / 2;
      // Left of door
      const fL = new THREE.Mesh(new THREE.BoxGeometry(halfSide, h, wallT), extWallMat);
      fL.position.set(-(dw/2 + halfSide/2), by+h/2, d/2+wallT/2);
      fL.castShadow=true; fL.userData.isSolid=true; g.add(fL);
      // Right of door
      const fR = new THREE.Mesh(new THREE.BoxGeometry(halfSide, h, wallT), extWallMat);
      fR.position.set(dw/2 + halfSide/2, by+h/2, d/2+wallT/2);
      fR.castShadow=true; fR.userData.isSolid=true; g.add(fR);
      // Above door
      const fT = new THREE.Mesh(new THREE.BoxGeometry(dw, h-dh, wallT), extWallMat);
      fT.position.set(0, by+dh+(h-dh)/2, d/2+wallT/2);
      fT.userData.isSolid=true; g.add(fT);
      // Door frame trim
      [[-(dw/2), dh/2, 0.06, dh, 0.04],[dw/2, dh/2, 0.06, dh, 0.04],[0, dh, dw+0.12, 0.06, 0.04]].forEach(([x,y,sx,sy,sz]) => {
        const fr = new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz), trimMat);
        fr.position.set(x, by+y, d/2+wallT/2); g.add(fr);
      });
    } else {
      const fw = new THREE.Mesh(new THREE.BoxGeometry(w, h, wallT), extWallMat);
      fw.position.set(0, by+h/2, d/2+wallT/2); fw.castShadow=true; fw.userData.isSolid=true; g.add(fw);
    }

    // Back wall
    const bw = new THREE.Mesh(new THREE.BoxGeometry(w, h, wallT), extWallMat);
    bw.position.set(0, by+h/2, -(d/2+wallT/2)); bw.castShadow=true; bw.userData.isSolid=true; g.add(bw);
    // Back picture windows
    [-w*0.25, w*0.25].forEach(x => {
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.2), glassMat);
      gl.position.set(x, by+h*0.55, -(d/2+wallT+0.01)); g.add(gl);
      const wf = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.3, 0.03), trimMat);
      wf.position.set(x, by+h*0.55, -(d/2+wallT/2)); g.add(wf);
    });

    // Side walls with windows
    [-1, 1].forEach(side => {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(wallT, h, d), extWallMat);
      sw.position.set(side*(w/2+wallT/2), by+h/2, 0); sw.castShadow=true; sw.userData.isSolid=true; g.add(sw);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.0), glassMat);
      gl.position.set(side*(w/2+wallT+0.01), by+h*0.55, 0); gl.rotation.y = side*Math.PI/2; g.add(gl);
    });

    // Interior wall panels
    [[0, h/2, -(d/2-0.01), w, h, 0],[0, h/2, d/2-0.01, w, h, Math.PI],
     [-(w/2-0.01), h/2, 0, d, h, Math.PI/2],[w/2-0.01, h/2, 0, d, h, -Math.PI/2]].forEach(([x,y,z,sx,sy,ry]) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(sx,sy), intWallMat);
      p.position.set(x, by+y, z); p.rotation.y = ry; p.receiveShadow=true; g.add(p);
    });

    // Ceiling
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(w+wallT*2, 0.12, d+wallT*2), fl===floors-1 ? roofMat : ceilMat);
    ceil.position.set(0, by+h, 0); ceil.receiveShadow=true; ceil.userData.isSolid=true; g.add(ceil);

    // Lighting
    const cL = new THREE.PointLight(0xfff0dd, 1.2, w*2);
    cL.position.set(0, by+h-0.2, 0); g.add(cL);
    const fL = new THREE.PointLight(0xffe8cc, 0.4, w*1.5);
    fL.position.set(w*0.25, by+h-0.2, d*0.25); g.add(fL);

    // === HD FURNITURE ===
    const furniture = [];
    if (fl === 0) {
      furniture.push({m:'ph_Sofa_01', p:[-w*0.22,0.18,d*0.15], r:Math.PI, s:1.8});
      furniture.push({m:'ph_ArmChair_01', p:[w*0.25,0.18,d*0.2], r:-Math.PI/4, s:1.5});
      furniture.push({m:'ph_CoffeeTable_01', p:[0,0.18,d*0.15], s:1.5});
      furniture.push({m:'ph_Television_01', p:[0,0.9,-d*0.35], s:2.0});
      furniture.push({m:'ph_Shelf_01', p:[-w*0.35,0.18,-d*0.35], s:1.5});
      furniture.push({m:'ph_electric_stove', p:[w*0.3,0.18,-d*0.35], s:1.0});
      furniture.push({m:'ph_bar_chair_round_01', p:[w*0.1,0.18,-d*0.15], s:1.2});
      furniture.push({m:'ph_WoodenTable_01', p:[-w*0.25,0.18,-d*0.2], s:2.0});
      furniture.push({m:'ph_WoodenChair_01', p:[-w*0.35,0.18,-d*0.1], r:Math.PI/2, s:1.3});
      furniture.push({m:'ph_WoodenChair_01', p:[-w*0.15,0.18,-d*0.1], r:-Math.PI/2, s:1.3});
      furniture.push({m:'ph_alarm_clock_01', p:[w*0.35,0.85,d*0.1], s:0.8});
    }
    if (fl === 1) {
      furniture.push({m:'ph_GothicBed_01', p:[-w*0.2,0.18,0], s:1.8});
      furniture.push({m:'ph_drawer_cabinet', p:[w*0.3,0.18,-d*0.35], s:1.3});
      furniture.push({m:'ph_desk_lamp_arm_01', p:[w*0.3,0.9,-d*0.35], s:0.8});
      furniture.push({m:'ph_Rockingchair_01', p:[w*0.25,0.18,d*0.2], r:-Math.PI/3, s:1.3});
      furniture.push({m:'ph_GothicCabinet_01', p:[-w*0.35,0.18,-d*0.35], s:1.2});
    }

    furniture.forEach(f => {
      gltfLoader.load('/models/' + f.m + '.glb', (gltf) => {
        const obj = gltf.scene;
        obj.position.set(f.p[0], f.p[1]+by, f.p[2]);
        if (f.r) obj.rotation.y = f.r;
        if (f.s) obj.scale.setScalar(f.s);
        obj.traverse(c => { if(c.isMesh){c.castShadow=true;c.receiveShadow=true;}});
        g.add(obj);
      }, null, (e) => console.warn('Furniture fail:', f.m, e));
    });
  }

  // Stairs
  if (floors > 1) {
    const sw = 1.0, steps = 12, stepH = h/steps, stepD = (d*0.5)/steps;
    for (let s = 0; s < steps; s++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(sw, stepH, stepD+0.02), stairMat);
      st.position.set(w/2-sw/2-0.3, s*stepH+stepH/2, d/2-0.8-s*stepD);
      st.receiveShadow=true; st.userData.isSolid=true; st.userData.isStair=true; g.add(st);
    }
  }

  // Front porch
  const porch = new THREE.Mesh(new THREE.BoxGeometry(w*0.6, 0.1, 1.0), makeMat(0x777777,{rough:0.7}));
  porch.position.set(0, 0.05, d/2+wallT+0.5); porch.receiveShadow=true; porch.userData.isSolid=true; g.add(porch);

  return g;
}


function createInteriorShop(opts) {
  const o = opts || {};
  const g = createInteriorHouse({ width: o.width || 6, depth: o.depth || 5, height: 3.5, floors: 1, color: o.color || 0x7a6a4a });
  // Add shop counter
  const woodMat = makeMat(0x5a3a1a, {rough: 0.9});
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.0, 0.5), woodMat);
  counter.position.set(0, 0.6, -1);
  counter.castShadow = true;
  g.add(counter);
  // Add shelves on walls
  [-1.5, 0, 1.5].forEach(x => {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.3), woodMat);
    shelf.position.set(x, 1.8, -(o.depth || 5)/2 + 0.2);
    g.add(shelf);
  });
  g.userData.name = 'shop';
  return g;
}

function createInteriorTavern(opts) {
  const o = opts || {};
  const g = createInteriorHouse({ width: o.width || 8, depth: o.depth || 6, height: 3.5, floors: 2, color: o.color || 0x6a4a2a });
  const woodMat = makeMat(0x5a3a1a, {rough: 0.9});
  // Bar counter
  const bar = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 0.5), woodMat);
  bar.position.set(-1, 0.65, -(o.depth||6)/2 + 0.8);
  bar.castShadow = true; g.add(bar);
  // Bar stools
  [-2, -1, 0].forEach(x => {
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.6, 8), woodMat);
    stool.position.set(x, 0.4, -(o.depth||6)/2 + 1.4);
    g.add(stool);
  });
  // Tables with chairs
  [[-1.5, 1.5], [1.5, 1.5], [1.5, -0.5]].forEach(([tx, tz]) => {
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.35, 0.05, 8), woodMat);
    table.position.set(tx, 0.75, tz);
    g.add(table);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), woodMat);
    leg.position.set(tx, 0.35, tz);
    g.add(leg);
  });
  g.userData.name = 'tavern';
  return g;
}

function createCastle() {
  const g = new THREE.Group();
  const stoneMat = makeMat(0x8a8a8f, {rough:0.75});
  const darkStone = makeMat(0x666670, {rough:0.8});
  const roofMat = makeMat(0x7a2020, {rough:0.6});
  const woodMat = makeMat(0x5a3a1a, {rough:0.9});
  // Base/foundation
  const base = new THREE.Mesh(new THREE.BoxGeometry(7,0.4,7), darkStone);
  base.position.y = 0.2; base.receiveShadow=true; g.add(base);
  // Walls (4 sides, individual for detail)
  [[-3.3,0,0,'x'],[3.3,0,0,'x'],[0,0,-3.3,'z'],[0,0,3.3,'z']].forEach(([x,y,z,axis]) => {
    const w = axis==='x' ? new THREE.BoxGeometry(0.4,3.2,6.2) : new THREE.BoxGeometry(6.2,3.2,0.4);
    const wall = new THREE.Mesh(w, stoneMat); wall.position.set(x,1.8,z); wall.castShadow=true; wall.receiveShadow=true; g.add(wall);
  });
  // Inner courtyard floor
  const court = new THREE.Mesh(new THREE.PlaneGeometry(5.5,5.5), makeMat(0x555550, {rough:0.95}));
  court.rotation.x=-Math.PI/2; court.position.y=0.42; court.receiveShadow=true; g.add(court);
  // 4 corner towers (high-poly cylinders)
  [[-3.3,-3.3],[3.3,-3.3],[3.3,3.3],[-3.3,3.3]].forEach(([x,z]) => {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.8,0.9,5.5,24), stoneMat);
    tower.position.set(x,2.75,z); tower.castShadow=true; tower.receiveShadow=true; g.add(tower);
    // Tower cap ring
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.95,0.95,0.2,24), darkStone);
    ring.position.set(x,5.55,z); g.add(ring);
    // Conical roof (smooth)
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.1,2,24), roofMat);
    roof.position.set(x,6.65,z); roof.castShadow=true; g.add(roof);
    // Tower battlements
    for (let b=0;b<8;b++) {
      const a=b/8*Math.PI*2;
      const bm = new THREE.Mesh(new THREE.BoxGeometry(0.25,0.45,0.25), stoneMat);
      bm.position.set(x+Math.cos(a)*0.9,5.75,z+Math.sin(a)*0.9); bm.castShadow=true; g.add(bm);
    }
  });
  // Wall battlements (merlons)
  for (let i=-2;i<=2;i++) {
    [3.3,-3.3].forEach(z => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.6,0.5), stoneMat);
      b.position.set(i*1.3,3.6,z); b.castShadow=true; g.add(b);
    });
    [-3.3,3.3].forEach(x => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.6,0.5), stoneMat);
      b.position.set(x,3.6,i*1.3); b.castShadow=true; g.add(b);
    });
  }
  // Gatehouse (front)
  const gh = new THREE.Mesh(new THREE.BoxGeometry(2,4,1.2), stoneMat);
  gh.position.set(0,2,3.6); gh.castShadow=true; g.add(gh);
  // Gate arch (dark opening)
  const gateOpen = new THREE.Mesh(new THREE.BoxGeometry(1,2.2,1.3), makeMat(0x111111));
  gateOpen.position.set(0,1.1,3.6); g.add(gateOpen);
  // Portcullis bars
  for (let i=-2;i<=2;i++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,2.2,6), makeMat(0x444444,{metal:0.8}));
    bar.position.set(i*0.2,1.1,3.6); g.add(bar);
  }
  // Keep (central tower)
  const keep = new THREE.Mesh(new THREE.BoxGeometry(2.5,4.5,2.5), stoneMat);
  keep.position.set(0,2.65,0); keep.castShadow=true; keep.receiveShadow=true; g.add(keep);
  const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(2,1.5,4), roofMat);
  keepRoof.position.set(0,5.65,0); keepRoof.rotation.y=Math.PI/4; keepRoof.castShadow=true; g.add(keepRoof);
  // Windows on keep
  [[-0.8,3.5,1.26],[0.8,3.5,1.26],[-0.8,3.5,-1.26],[0.8,3.5,-1.26]].forEach(([x,y,z]) => {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.25,0.5), makeMat(0xaaaa55,{rough:0.1}));
    win.position.set(x,y,z); win.lookAt(x*2,y,z*2); g.add(win);
  });
  // Wooden door
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.6,1.2,0.08), woodMat);
  door.position.set(0,1,1.3); g.add(door);
  return g;
}

function createRoad(length, dir) {
  const l = length || 20;
  const geo = new THREE.PlaneGeometry(2.5, l);
  const mat = makeMat(0x333333, {rough:0.95});
  const road = new THREE.Mesh(geo, mat);
  road.rotation.x = -Math.PI/2;
  road.position.y = 0.03;
  road.receiveShadow = true;
  // Center line
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.08, l), makeMat(0xcccc44));
  line.rotation.x = -Math.PI/2;
  line.position.y = 0.04;
  const g = new THREE.Group();
  g.add(road); g.add(line);
  if (dir === 'x') g.rotation.y = Math.PI/2;
  return g;
}

function createAvatar(gender) {
  const g = new THREE.Group();
  const skinTones = [0xc68642, 0x8d5524, 0xe0ac69, 0xf1c27d, 0x6b4226, 0xffdbac, 0xd2946b];
  const skinColor = skinTones[Math.floor(Math.random()*skinTones.length)];
  const skinMat = makeMat(skinColor, {rough:0.65});
  const isFemale = gender === 'f';
  const clothColor = isFemale ? [0x4444aa, 0xaa2244, 0x44aa88, 0x8844aa][Math.floor(Math.random()*4)] : [0x2a5a2a, 0x3a3a6a, 0x5a3a2a, 0x333344][Math.floor(Math.random()*4)];
  const clothMat = makeMat(clothColor, {rough:0.8});
  const pantsMat = makeMat(0x2a2a3a, {rough:0.85});
  // Torso
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(isFemale?0.18:0.22, isFemale?0.15:0.18, 0.6, 12), clothMat);
  torso.position.y = 1.0; torso.castShadow=true; g.add(torso);
  // Shoulders
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(isFemale?0.2:0.25, 12, 8), clothMat);
  shoulders.position.y = 1.3; shoulders.scale.set(1.2, 0.5, 0.8); g.add(shoulders);
  // Hips
  const hips = new THREE.Mesh(new THREE.CylinderGeometry(isFemale?0.2:0.18, isFemale?0.18:0.16, 0.15, 12), pantsMat);
  hips.position.y = 0.65; g.add(hips);
  // Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 10), skinMat);
  neck.position.y = 1.38; g.add(neck);
  // Head (slightly oval)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 16), skinMat);
  head.position.y = 1.55; head.scale.set(1, 1.1, 0.95); head.castShadow=true; g.add(head);
  // Eyes
  const eyeMat = makeMat(0xffffff);
  const pupilMat = makeMat(0x222222);
  [-0.06, 0.06].forEach(x => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), eyeMat);
    eye.position.set(x, 1.57, 0.15); g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 8), pupilMat);
    pupil.position.set(x, 1.57, 0.17); g.add(pupil);
  });
  // Nose
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), skinMat);
  nose.position.set(0, 1.52, 0.17); nose.scale.set(0.7, 1, 1); g.add(nose);
  // Mouth
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.02), makeMat(0x994444));
  mouth.position.set(0, 1.47, 0.16); g.add(mouth);
  // Hair
  const hairColors = [0x1a1a1a, 0x3a2a1a, 0x8B6914, 0xaa4444, 0x222222, 0x664422];
  const hairMat = makeMat(hairColors[Math.floor(Math.random()*hairColors.length)]);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), hairMat);
  hair.position.y = 1.6; hair.scale.set(1.05, isFemale?1.15:0.85, 1.05); g.add(hair);
  if (isFemale && Math.random()>0.3) { // Long hair
    const long = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.06, 0.5, 10), hairMat);
    long.position.set(0, 1.3, -0.08); g.add(long);
  }
  // Ears
  [-0.18, 0.18].forEach(x => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), skinMat);
    ear.position.set(x, 1.55, 0); g.add(ear);
  });
  // Arms (upper + lower)
  [-1, 1].forEach(side => {
    const x = side * 0.28;
    const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.35, 10), side===-1?clothMat:clothMat);
    upperArm.position.set(x, 1.1, 0); upperArm.rotation.z = side*0.15; upperArm.castShadow=true; g.add(upperArm);
    const lowerArm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.3, 10), skinMat);
    lowerArm.position.set(x*1.05, 0.8, 0); lowerArm.castShadow=true; g.add(lowerArm);
    // Hand
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), skinMat);
    hand.position.set(x*1.05, 0.63, 0); g.add(hand);
  });
  // Legs (upper + lower)
  [-0.09, 0.09].forEach(x => {
    const upperLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.4, 10), pantsMat);
    upperLeg.position.set(x, 0.43, 0); upperLeg.castShadow=true; g.add(upperLeg);
    const lowerLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.35, 10), pantsMat);
    lowerLeg.position.set(x, 0.1, 0); lowerLeg.castShadow=true; g.add(lowerLeg);
    // Shoe
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.14), makeMat(0x222222, {rough:0.7}));
    shoe.position.set(x, -0.02, 0.02); g.add(shoe);
  });
  return g;
}

function createSword() {
  const g = new THREE.Group();
  const metalMat = makeMat(0xccccdd, {rough:0.15,metal:0.9});
  const darkMetal = makeMat(0x555566, {rough:0.3,metal:0.8});
  const leatherMat = makeMat(0x5a3a1a, {rough:0.9});
  const goldMat = makeMat(0xccaa22, {rough:0.2,metal:0.7});
  // Blade
  const bladeGeo = new THREE.BoxGeometry(0.06, 1.0, 0.015);
  const blade = new THREE.Mesh(bladeGeo, metalMat);
  blade.position.y = 0.9; blade.castShadow=true; g.add(blade);
  // Blade edge taper (triangular tip)
  const tipGeo = new THREE.ConeGeometry(0.04, 0.2, 4);
  const tip = new THREE.Mesh(tipGeo, metalMat);
  tip.position.y = 1.5; tip.rotation.y = Math.PI/4; g.add(tip);
  // Fuller (groove in blade)
  const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.7, 0.02), darkMetal);
  fuller.position.set(0, 0.85, 0); g.add(fuller);
  // Crossguard
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.06), goldMat);
  guard.position.y = 0.38; guard.castShadow=true; g.add(guard);
  // Guard ends (decorative)
  [-0.15, 0.15].forEach(x => {
    const end = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), goldMat);
    end.position.set(x, 0.38, 0); g.add(end);
  });
  // Grip (wrapped leather)
  for (let i=0;i<5;i++) {
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.04, 8), i%2===0?leatherMat:makeMat(0x4a2a10,{rough:0.9}));
    wrap.position.y = 0.17+i*0.04; g.add(wrap);
  }
  // Pommel
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), goldMat);
  pommel.position.y = 0.02; g.add(pommel);
  return g;
}

export {
  setBuildingsScene,
  createWallWithDoor, createSolidWall, createInteriorHouse,
  KENNEY_CITY_BUILDINGS, KENNEY_VEHICLES, KENNEY_ROAD_PIECES, KENNEY_FANTASY_PROPS, KENNEY_GRAVEYARD_PROPS,
  loadKenneyModel, randomKenneyBuilding, randomKenneyVehicle,
  createSkyscraper, createCommercialBuilding, createPitchedRoofHouse,
  createMansion, createDuplex, createRanchHouse,
  createParkingLot, createGasStation, createBridge, createSupermarket,
  createApartmentBuilding, createBusStop, createDumpster, createTrashCan,
  createSwimmingPool, createStopSign, createTrafficLight,
  createRoadSegment, createIntersection, createGlassOfficeBuilding,
  createStadium, createFence, createPark, createSidewalk, createStreetLamp, createBench,
  createModernHouse, createInteriorShop, createInteriorTavern,
  createCastle, createRoad, createAvatar, createSword
};
