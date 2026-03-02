// ============================================================================
// CRATE ENGINE 2.0 — WORLD CLIENT
// Compiles world manifests (client-side) and applies them to the Three.js scene.
// This is the JS fallback that runs in-browser without needing the Rust backend.
// When the Rust API is available, this file calls it instead.
// See research/ENGINE_2_0_SPEC.md — Phase 3.
// ============================================================================

import { assetIndex } from './asset-index.mjs';
import { commandBus } from './command-bus.mjs';
import { simulation, registerSimCommands } from './sim-client.mjs';

// ---------------------------------------------------------------------------
// Seeded RNG — SplitMix64, identical to the Rust implementation.
// Same seed → same output in both JS and Rust.
// ---------------------------------------------------------------------------

class SeededRng {
  constructor(seed) {
    // BigInt for 64-bit precision
    this.state = BigInt(seed) + 0x9E3779B97F4A7C15n;
  }

  nextU64() {
    this.state = (this.state + 0x9E3779B97F4A7C15n) & 0xFFFFFFFFFFFFFFFFn;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & 0xFFFFFFFFFFFFFFFFn;
    z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & 0xFFFFFFFFFFFFFFFFn;
    return z ^ (z >> 31n);
  }

  nextF32() {
    return Number(this.nextU64() >> 40n) / (1 << 24);
  }

  nextBool() {
    return (this.nextU64() & 1n) === 0n;
  }

  rangeUsize(min, max) {
    if (min >= max) return min;
    return min + Number(this.nextU64() % BigInt(max - min + 1));
  }

  rangeF32(min, max) {
    return min + this.nextF32() * (max - min);
  }

  pick(arr) {
    return arr[this.rangeUsize(0, arr.length - 1)];
  }

  pickFrom(values) {
    return values[this.rangeUsize(0, values.length - 1)];
  }
}

// ---------------------------------------------------------------------------
// City Grid — zone assignment (mirrors grid.rs)
// ---------------------------------------------------------------------------

const ZONES = { DOWNTOWN: 'downtown', COMMERCIAL: 'commercial', SUBURBS: 'suburbs', INDUSTRIAL: 'industrial', PARK: 'park' };

function generateGrid(width, height, chunkSize, rng) {
  const zones = Array.from({ length: width }, () => Array(height).fill(ZONES.SUBURBS));
  const cx = width / 2;
  const cz = height / 2;

  // Distance-based zones
  for (let x = 0; x < width; x++) {
    for (let z = 0; z < height; z++) {
      const dx = Math.abs(x + 0.5 - cx);
      const dz = Math.abs(z + 0.5 - cz);
      const dist = Math.max(dx, dz);
      if (dist <= 1.0) zones[x][z] = ZONES.DOWNTOWN;
      else if (dist <= 2.5) zones[x][z] = ZONES.COMMERCIAL;
    }
  }

  // Park in a random corner (2x2)
  const parkCorner = rng.rangeUsize(0, 3);
  const parkPos = [[0, 0], [width - 2, 0], [0, height - 2], [width - 2, height - 2]][parkCorner];
  for (let dx = 0; dx < 2; dx++) {
    for (let dz = 0; dz < 2; dz++) {
      const x = Math.min(Math.max(parkPos[0] + dx, 0), width - 1);
      const z = Math.min(Math.max(parkPos[1] + dz, 0), height - 1);
      zones[x][z] = ZONES.PARK;
    }
  }

  // Industrial opposite the park (2x2)
  const indPos = [[width - 2, height - 2], [0, height - 2], [width - 2, 0], [0, 0]][parkCorner];
  for (let dx = 0; dx < 2; dx++) {
    for (let dz = 0; dz < 2; dz++) {
      const x = Math.min(Math.max(indPos[0] + dx, 0), width - 1);
      const z = Math.min(Math.max(indPos[1] + dz, 0), height - 1);
      zones[x][z] = ZONES.INDUSTRIAL;
    }
  }

  return {
    width, height, chunkSize, zones,
    zoneAt(x, z) {
      if (x >= 0 && x < width && z >= 0 && z < height) return zones[x][z];
      return ZONES.SUBURBS;
    },
    worldPos(gx, gz) { return [gx * chunkSize, gz * chunkSize]; },
    chunkCenter(gx, gz) { return [gx * chunkSize + chunkSize / 2, gz * chunkSize + chunkSize / 2]; },
    worldSize() { return [width * chunkSize, height * chunkSize]; },
    isMajorRoadX(gx) { return gx % 3 === 0 || gx === width; },
    isMajorRoadZ(gz) { return gz % 3 === 0 || gz === height; },
  };
}

// ---------------------------------------------------------------------------
// Asset query helpers
// ---------------------------------------------------------------------------

function queryAssets(category, zone, subcategory) {
  const opts = { category };
  if (zone) opts.zone = zone;
  if (subcategory) opts.subcategory = subcategory;
  return assetIndex.query(opts);
}

function pickAsset(category, zone, subcategory, rng) {
  const results = queryAssets(category, zone, subcategory);
  if (results.length === 0) return null;
  return rng.pick(results);
}

// ---------------------------------------------------------------------------
// Road generation (mirrors roads.rs)
// ---------------------------------------------------------------------------

const ROAD_PIECE_SIZE = 10.0;

function generateRoads(grid, rng) {
  const roads = [];
  const intersections = [];
  const piecesPerEdge = Math.round(grid.chunkSize / ROAD_PIECE_SIZE);

  const straightId = pickAsset('road', null, 'straight', rng)?.id || 'street_pack_street_straight';
  const fourwayId = pickAsset('road', null, '4way', rng)?.id || 'street_pack_street_4way';
  const threewayId = pickAsset('road', null, '3way', rng)?.id || 'street_pack_street_3way';
  const deadendId = pickAsset('road', null, 'deadend', rng)?.id || 'street_pack_street_deadend';

  // E-W roads
  for (let gz = 0; gz <= grid.height; gz++) {
    for (let gx = 0; gx < grid.width; gx++) {
      const roadType = grid.isMajorRoadZ(gz) ? 'major' : 'minor';
      const baseX = gx * grid.chunkSize;
      const baseZ = gz * grid.chunkSize;
      for (let p = 0; p < piecesPerEdge; p++) {
        roads.push({
          asset_id: straightId,
          position: [baseX + p * ROAD_PIECE_SIZE + ROAD_PIECE_SIZE / 2, 0, baseZ],
          rotation: 0, scale: 1, road_type: roadType,
        });
      }
    }
  }

  // N-S roads
  for (let gx = 0; gx <= grid.width; gx++) {
    for (let gz = 0; gz < grid.height; gz++) {
      const roadType = grid.isMajorRoadX(gx) ? 'major' : 'minor';
      const baseX = gx * grid.chunkSize;
      const baseZ = gz * grid.chunkSize;
      for (let p = 0; p < piecesPerEdge; p++) {
        roads.push({
          asset_id: straightId,
          position: [baseX, 0, baseZ + p * ROAD_PIECE_SIZE + ROAD_PIECE_SIZE / 2],
          rotation: 90, scale: 1, road_type: roadType,
        });
      }
    }
  }

  // Intersections
  for (let gx = 0; gx <= grid.width; gx++) {
    for (let gz = 0; gz <= grid.height; gz++) {
      const x = gx * grid.chunkSize;
      const z = gz * grid.chunkSize;
      const left = gx > 0, right = gx < grid.width;
      const up = gz > 0, down = gz < grid.height;
      const count = [left, right, up, down].filter(Boolean).length;

      let assetId, itype, rotation = 0;
      if (count === 4) { assetId = fourwayId; itype = '4way'; }
      else if (count === 3) {
        assetId = threewayId; itype = '3way';
        if (!up) rotation = 0;
        else if (!right) rotation = 90;
        else if (!down) rotation = 180;
        else rotation = 270;
      } else if (count === 2) {
        assetId = deadendId; itype = 'deadend';
        if (!up && !left) rotation = 0;
        else if (!up && !right) rotation = 90;
        else if (!down && !right) rotation = 180;
        else rotation = 270;
      } else continue;

      intersections.push({ asset_id: assetId, position: [x, 0, z], rotation, scale: 1, intersection_type: itype });
    }
  }

  return { roads, intersections };
}

// ---------------------------------------------------------------------------
// Asset placement (mirrors placer.rs)
// ---------------------------------------------------------------------------

const ROAD_BUFFER = 8.0;
const FURNITURE_SPACING = 20.0;
const TREE_SPACING = 15.0;

function placeAllChunks(grid, rng) {
  const chunks = [];
  for (let gx = 0; gx < grid.width; gx++) {
    for (let gz = 0; gz < grid.height; gz++) {
      const zone = grid.zoneAt(gx, gz);
      const [wx, wz] = grid.worldPos(gx, gz);
      const cs = grid.chunkSize;
      const placements = [];

      const bMinX = wx + ROAD_BUFFER, bMinZ = wz + ROAD_BUFFER;
      const bW = cs - 2 * ROAD_BUFFER, bD = cs - 2 * ROAD_BUFFER;

      placeBuildings(zone, rng, bMinX, bMinZ, bW, bD, placements);
      placeStreetFurniture(zone, rng, wx, wz, cs, placements);
      placeVegetation(zone, rng, wx, wz, cs, placements);
      placeVehicles(zone, rng, wx, wz, cs, placements);
      placeTrafficControl(zone, grid, gx, gz, rng, placements);
      placeCharacters(zone, rng, wx, wz, cs, placements);

      chunks.push({
        id: `chunk_${gx}_${gz}`, grid_x: gx, grid_z: gz, zone,
        bounds_min: [wx, wz], bounds_max: [wx + cs, wz + cs], placements,
      });
    }
  }
  return chunks;
}

function placeBuildings(zone, rng, minX, minZ, width, depth, out) {
  let count;
  switch (zone) {
    case ZONES.DOWNTOWN: count = rng.rangeUsize(1, 2); break;
    case ZONES.COMMERCIAL: count = rng.rangeUsize(2, 4); break;
    case ZONES.SUBURBS: count = rng.rangeUsize(3, 6); break;
    case ZONES.INDUSTRIAL: count = rng.rangeUsize(1, 3); break;
    default: return;
  }

  const cols = count <= 2 ? 1 : 2;
  const rows = Math.max(Math.ceil(count / cols), 1);
  const lotW = width / cols, lotD = depth / rows;
  let placed = 0;

  for (let row = 0; row < rows && placed < count; row++) {
    for (let col = 0; col < cols && placed < count; col++) {
      const cx = minX + col * lotW + lotW / 2;
      const cz = minZ + row * lotD + lotD / 2;
      const asset = pickAsset('building', zone, null, rng);
      if (!asset) continue;

      const jx = rng.rangeF32(-lotW * 0.15, lotW * 0.15);
      const jz = rng.rangeF32(-lotD * 0.15, lotD * 0.15);
      const rotation = rng.pickFrom([0, 90, 180, 270]);
      const scale = rng.rangeF32(0.9, 1.1);

      out.push({ asset_id: asset.id, position: [cx + jx, 0, cz + jz], rotation, scale, category: 'building' });
      placed++;
    }
  }
}

function placeStreetFurniture(zone, rng, cx, cz, cs, out) {
  const swOff = 4.0;

  // Streetlights along edges
  for (let x = cx + FURNITURE_SPACING / 2; x < cx + cs; x += FURNITURE_SPACING) {
    const light = pickAsset('street_furniture', zone, 'streetlight', rng);
    if (light) {
      out.push({ asset_id: light.id, position: [x, 0, cz + swOff], rotation: 0, scale: 1, category: 'street_furniture' });
      out.push({ asset_id: light.id, position: [x, 0, cz + cs - swOff], rotation: 180, scale: 1, category: 'street_furniture' });
    }
  }
  for (let z = cz + FURNITURE_SPACING / 2; z < cz + cs; z += FURNITURE_SPACING) {
    const light = pickAsset('street_furniture', zone, 'streetlight', rng);
    if (light) {
      out.push({ asset_id: light.id, position: [cx + swOff, 0, z], rotation: 270, scale: 1, category: 'street_furniture' });
      out.push({ asset_id: light.id, position: [cx + cs - swOff, 0, z], rotation: 90, scale: 1, category: 'street_furniture' });
    }
  }

  // Benches in commercial/downtown
  if (zone === ZONES.DOWNTOWN || zone === ZONES.COMMERCIAL) {
    const benchCount = rng.rangeUsize(1, 3);
    for (let i = 0; i < benchCount; i++) {
      const t = (i + 1) / (benchCount + 1);
      const bench = pickAsset('street_furniture', zone, 'bench', rng);
      if (bench) {
        out.push({ asset_id: bench.id, position: [cx + t * cs, 0, cz + swOff + 1], rotation: 0, scale: 1, category: 'street_furniture' });
      }
    }
  }
}

function placeVegetation(zone, rng, cx, cz, cs, out) {
  if (zone === ZONES.PARK) {
    const count = rng.rangeUsize(8, 15);
    for (let i = 0; i < count; i++) {
      const tree = pickAsset('vegetation', zone, null, rng);
      if (tree) {
        out.push({
          asset_id: tree.id,
          position: [rng.rangeF32(cx + 5, cx + cs - 5), 0, rng.rangeF32(cz + 5, cz + cs - 5)],
          rotation: rng.rangeF32(0, 360), scale: rng.rangeF32(0.8, 1.3), category: 'vegetation',
        });
      }
    }
  } else if (zone === ZONES.SUBURBS) {
    for (let x = cx + TREE_SPACING / 2; x < cx + cs; x += TREE_SPACING) {
      if (rng.nextBool()) {
        const tree = pickAsset('vegetation', zone, null, rng);
        if (tree) out.push({ asset_id: tree.id, position: [x, 0, cz + 6], rotation: rng.rangeF32(0, 360), scale: rng.rangeF32(0.8, 1.2), category: 'vegetation' });
      }
    }
    const yardTrees = rng.rangeUsize(1, 3);
    for (let i = 0; i < yardTrees; i++) {
      const tree = pickAsset('vegetation', zone, null, rng);
      if (tree) out.push({ asset_id: tree.id, position: [rng.rangeF32(cx + 10, cx + cs - 10), 0, rng.rangeF32(cz + 10, cz + cs - 10)], rotation: rng.rangeF32(0, 360), scale: rng.rangeF32(0.8, 1.1), category: 'vegetation' });
    }
  } else if (zone === ZONES.DOWNTOWN || zone === ZONES.COMMERCIAL) {
    const count = rng.rangeUsize(1, 3);
    for (let i = 0; i < count; i++) {
      const tree = pickAsset('vegetation', zone, 'city', rng) || pickAsset('vegetation', zone, null, rng);
      if (tree) out.push({ asset_id: tree.id, position: [rng.rangeF32(cx + ROAD_BUFFER, cx + cs - ROAD_BUFFER), 0, rng.rangeF32(cz + 5, cz + 7)], rotation: rng.rangeF32(0, 360), scale: 1, category: 'vegetation' });
    }
  }
}

function placeVehicles(zone, rng, cx, cz, cs, out) {
  let count;
  switch (zone) {
    case ZONES.DOWNTOWN: count = rng.rangeUsize(3, 6); break;
    case ZONES.COMMERCIAL: count = rng.rangeUsize(2, 5); break;
    case ZONES.SUBURBS: count = rng.rangeUsize(1, 3); break;
    case ZONES.INDUSTRIAL: count = rng.rangeUsize(1, 3); break;
    case ZONES.PARK: count = rng.rangeUsize(0, 1); break;
    default: count = 0;
  }

  const parkOff = 3.0;
  for (let i = 0; i < count; i++) {
    const edge = i % 4;
    const t = rng.rangeF32(0.15, 0.85);
    const along = cx + t * cs, across = cz + t * cs;
    let x, z, rot;
    if (edge === 0) { x = along; z = cz + parkOff; rot = 0; }
    else if (edge === 1) { x = along; z = cz + cs - parkOff; rot = 180; }
    else if (edge === 2) { x = cx + parkOff; z = across; rot = 270; }
    else { x = cx + cs - parkOff; z = across; rot = 90; }

    const vehicle = pickAsset('vehicle', zone, null, rng);
    if (vehicle) out.push({ asset_id: vehicle.id, position: [x, 0, z], rotation: rot, scale: 1, category: 'vehicle' });
  }
}

function placeTrafficControl(zone, grid, gx, gz, rng, out) {
  const corners = [[gx, gz], [gx + 1, gz], [gx, gz + 1], [gx + 1, gz + 1]];
  for (const [cx, cz] of corners) {
    const isMajorX = grid.isMajorRoadX(cx);
    const isMajorZ = grid.isMajorRoadZ(cz);
    const wx = cx * grid.chunkSize, wz = cz * grid.chunkSize;

    if (isMajorX && isMajorZ) {
      const light = pickAsset('traffic_control', zone, 'traffic_light', rng);
      if (light) {
        out.push({ asset_id: light.id, position: [wx + 3, 0, wz + 3], rotation: 0, scale: 1, category: 'traffic_control' });
        out.push({ asset_id: light.id, position: [wx - 3, 0, wz - 3], rotation: 180, scale: 1, category: 'traffic_control' });
      }
    } else if (isMajorX || isMajorZ) {
      const sign = pickAsset('traffic_control', zone, 'stop', rng);
      if (sign) {
        out.push({ asset_id: sign.id, position: [wx + 3, 0, wz + 3], rotation: 0, scale: 1, category: 'traffic_control' });
      }
    }
  }
}

function placeCharacters(zone, rng, cx, cz, cs, out) {
  let count;
  switch (zone) {
    case ZONES.DOWNTOWN: count = rng.rangeUsize(2, 5); break;
    case ZONES.COMMERCIAL: count = rng.rangeUsize(1, 4); break;
    case ZONES.PARK: count = rng.rangeUsize(1, 3); break;
    case ZONES.SUBURBS: count = rng.rangeUsize(0, 2); break;
    case ZONES.INDUSTRIAL: count = rng.rangeUsize(0, 1); break;
    default: count = 0;
  }

  for (let i = 0; i < count; i++) {
    const swZ = rng.nextBool() ? cz + 5 : cz + cs - 5;
    const x = rng.rangeF32(cx + 5, cx + cs - 5);
    const ped = pickAsset('character', zone, null, rng);
    if (ped) out.push({ asset_id: ped.id, position: [x, 0, swZ], rotation: rng.rangeF32(0, 360), scale: 1, category: 'character' });
  }
}

// ---------------------------------------------------------------------------
// compile() — the JS-side world compiler (mirrors Rust compile_world)
// ---------------------------------------------------------------------------

const SIZE_MAP = {
  small: [6, 6], medium: [10, 10], large: [16, 16], huge: [24, 24],
};

/**
 * Compile a CITY_MODERN world entirely in JavaScript.
 *
 * @param {object} opts
 * @param {string} opts.template - Template name (only "CITY_MODERN" supported)
 * @param {number} opts.seed - Deterministic seed
 * @param {string} opts.size - "small" | "medium" | "large" | "huge"
 * @returns {object} WorldManifest JSON
 */
export function compileWorld({ template = 'CITY_MODERN', seed = 42, size = 'medium' } = {}) {
  if (template.toUpperCase() !== 'CITY_MODERN') {
    throw new Error(`Unknown template: ${template}. Available: CITY_MODERN`);
  }

  const rng = new SeededRng(seed);
  const [gw, gh] = SIZE_MAP[size] || SIZE_MAP.medium;
  const chunkSize = 50.0;

  // 1. Grid
  const grid = generateGrid(gw, gh, chunkSize, rng);

  // 2. Roads
  const { roads, intersections } = generateRoads(grid, rng);

  // 3. Chunks
  const chunks = placeAllChunks(grid, rng);

  // 4. Spawn
  const [worldW, worldH] = grid.worldSize();
  const spawn = { position: [worldW / 2, 0, worldH / 2], rotation: 0 };

  // 5. Stats
  const totalChunkAssets = chunks.reduce((sum, c) => sum + c.placements.length, 0);
  const totalAssets = totalChunkAssets + roads.length + intersections.length;

  const zoneCounts = {};
  for (let x = 0; x < gw; x++) {
    for (let z = 0; z < gh; z++) {
      const zone = grid.zoneAt(x, z);
      zoneCounts[zone] = (zoneCounts[zone] || 0) + 1;
    }
  }

  return {
    template: 'CITY_MODERN', seed, world_size: [worldW, worldH], chunk_size: chunkSize,
    chunks, roads, intersections, spawn,
    stats: { total_assets: totalAssets, chunk_count: chunks.length, road_segments: roads.length, intersection_count: intersections.length, zone_breakdown: zoneCounts },
  };
}

// ---------------------------------------------------------------------------
// applyManifest() — spawn world assets using streaming renderer
// ---------------------------------------------------------------------------

/**
 * Apply a WorldManifest to the Three.js scene.
 *
 * Default mode (streaming=true): Uses the Phase 5 RenderScheduler for
 * chunk-based streaming, instanced rendering, and camera-following shadows.
 * Only loads chunks near the camera; streams in/out as camera moves.
 *
 * Legacy mode (streaming=false): Spawns ALL assets sequentially via
 * parseAndExecute (the Phase 3 behaviour).
 *
 * @param {object} manifest - WorldManifest JSON
 * @param {object} opts
 * @param {function} opts.onProgress - callback(current, total)
 * @param {boolean} opts.streaming - use chunk streaming (default true)
 * @returns {Promise<object>} stats
 */
export async function applyManifest(manifest, { onProgress, streaming = true } = {}) {
  if (!streaming) {
    return applyManifestLegacy(manifest, { onProgress });
  }

  // Phase 5: RenderScheduler-driven streaming
  const { RenderScheduler } = await import('./render-scheduler.mjs');
  const scheduler = new RenderScheduler();
  await scheduler.init(manifest);

  // Stash globally so engine-bridge can query stats
  window._renderScheduler = scheduler;

  // Start the streaming loop
  scheduler.start();

  const totalAssets = manifest.stats.total_assets;
  const roadCount = manifest.roads.length + manifest.intersections.length;

  if (onProgress) onProgress(roadCount, totalAssets);

  console.log(`[WorldClient] Streaming mode: ${roadCount} roads loaded eagerly, ${manifest.chunks.length} chunks streaming on demand`);

  return {
    placed: roadCount,
    total: totalAssets,
    streaming: true,
    scheduler,
    manifest: manifest.stats,
  };
}

/**
 * Legacy applyManifest — spawns all assets sequentially.
 * Preserved for backwards compatibility (streaming=false).
 * @private
 */
async function applyManifestLegacy(manifest, { onProgress, batchSize = 10, batchDelay = 16 } = {}) {
  const execCmd = window._parseAndExecute;
  if (!execCmd) throw new Error('Engine not loaded — window._parseAndExecute not available');

  const allPlacements = [];

  for (const road of manifest.roads) {
    allPlacements.push({ asset_id: road.asset_id, position: road.position, rotation: road.rotation, scale: road.scale });
  }
  for (const inter of manifest.intersections) {
    allPlacements.push({ asset_id: inter.asset_id, position: inter.position, rotation: inter.rotation, scale: inter.scale });
  }

  const sx = manifest.spawn.position[0];
  const sz = manifest.spawn.position[2];
  const sortedChunks = [...manifest.chunks].sort((a, b) => {
    const da = (a.bounds_min[0] - sx) ** 2 + (a.bounds_min[1] - sz) ** 2;
    const db = (b.bounds_min[0] - sx) ** 2 + (b.bounds_min[1] - sz) ** 2;
    return da - db;
  });

  for (const chunk of sortedChunks) {
    for (const p of chunk.placements) allPlacements.push(p);
  }

  const total = allPlacements.length;
  let placed = 0;

  console.log(`[WorldClient] Legacy mode: ${total} assets to place`);

  for (let i = 0; i < allPlacements.length; i += batchSize) {
    const batch = allPlacements.slice(i, i + batchSize);
    for (const p of batch) {
      const [x, y, z] = p.position;
      try {
        await execCmd(`add ${p.asset_id} at ${x} ${y} ${z}`);
        if (p.rotation && p.rotation !== 0) await execCmd(`rotate last ${p.rotation}`);
        if (p.scale && p.scale !== 1) await execCmd(`scale last ${p.scale}`);
      } catch (err) {
        console.warn(`[WorldClient] Failed to place ${p.asset_id}:`, err.message);
      }
      placed++;
    }
    if (onProgress) onProgress(placed, total);
    if (batchDelay > 0 && i + batchSize < allPlacements.length) {
      await new Promise(resolve => setTimeout(resolve, batchDelay));
    }
  }

  console.log(`[WorldClient] Legacy done: ${placed}/${total} assets placed`);
  return { placed, total, manifest: manifest.stats };
}

// ---------------------------------------------------------------------------
// buildAndApply() — compile + apply in one call
// ---------------------------------------------------------------------------

/**
 * Compile a world and apply it to the scene.
 * This is the main entry point called by the WORLD_BUILD command handler.
 *
 * @param {object} opts
 * @param {string} opts.template
 * @param {number} opts.seed
 * @param {string} opts.size
 * @param {function} opts.onProgress
 * @returns {Promise<object>} result
 */
export async function buildAndApply({ template = 'CITY_MODERN', seed, size = 'medium', onProgress } = {}) {
  // Generate seed from timestamp if not provided
  if (seed === undefined) seed = Date.now() % 1000000;

  console.log(`[WorldClient] Building ${template} (seed=${seed}, size=${size})`);

  // Compile the world
  const manifest = compileWorld({ template, seed, size });

  console.log(`[WorldClient] Compiled: ${manifest.stats.total_assets} assets, ${manifest.stats.chunk_count} chunks`);
  console.log(`[WorldClient] Zones:`, manifest.stats.zone_breakdown);

  // Dispose previous render scheduler if any
  if (window._renderScheduler) {
    window._renderScheduler.dispose();
    window._renderScheduler = null;
  }

  // Clear existing scene first
  const execCmd = window._parseAndExecute;
  if (execCmd) {
    await execCmd('clear');
  }

  // Apply to scene (streaming by default)
  const result = await applyManifest(manifest, { onProgress });

  // Initialize simulation (NPCs + vehicles)
  try {
    registerSimCommands();
    await simulation.init(manifest, seed);
    simulation.start();
    console.log(`[WorldClient] Simulation started: ${simulation.getStats().total} agents`);
  } catch (err) {
    console.warn('[WorldClient] Simulation init failed:', err.message);
  }

  // Notify command bus listeners
  commandBus.notify?.({
    type: 'WORLD_BUILD_COMPLETE',
    data: { template, seed, size, stats: manifest.stats },
  });

  return {
    ok: true,
    message: `Built ${template}: ${result.placed} assets, ${manifest.chunks.length} chunks streaming`,
    data: { seed, size, manifest: manifest.stats, sim: simulation.getStats(), streaming: result.streaming },
  };
}
