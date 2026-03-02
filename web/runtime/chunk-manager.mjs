// ============================================================================
// CRATE ENGINE 2.0 — CHUNK MANAGER
// Camera-driven chunk streaming: loads nearby chunks, unloads distant ones.
// Phase 5 — Rendering Upgrades
// ============================================================================

import { InstancePool } from './instance-pool.mjs';

const THREE = () => window.THREE;

/** Chunk lifecycle states */
const CHUNK_STATE = {
  UNLOADED: 0,
  LOADING: 1,
  LOADED: 2,
  UNLOADING: 3,
};

/**
 * ChunkManager — spatial index of all world chunks with streaming lifecycle.
 *
 * Each frame, update() computes which chunks should be loaded (near camera +
 * in frustum) and which should be unloaded (far from camera). Loading is
 * throttled to avoid frame drops.
 */
export class ChunkManager {
  /**
   * @param {object} opts
   * @param {import('./asset-loader.mjs').AssetLoader} opts.assetLoader
   * @param {import('./instance-pool.mjs').InstancePool} opts.instancePool
   * @param {THREE.Scene} opts.scene
   * @param {number} [opts.loadRadius=150] — chunks within this distance start loading
   * @param {number} [opts.unloadRadius=250] — chunks beyond this distance get unloaded
   * @param {number} [opts.maxConcurrentLoads=3]
   * @param {number} [opts.updateInterval=3] — frames between full updates
   */
  constructor({
    assetLoader,
    instancePool,
    scene,
    loadRadius = 150,
    unloadRadius = 250,
    maxConcurrentLoads = 3,
    updateInterval = 3,
  }) {
    this._assetLoader = assetLoader;
    this._instancePool = instancePool;
    this._scene = scene;

    this.loadRadius = loadRadius;
    this.unloadRadius = unloadRadius;
    this.maxConcurrentLoads = maxConcurrentLoads;
    this.updateInterval = updateInterval;

    /** @type {Map<string, ChunkRecord>} chunkId → record */
    this._chunks = new Map();

    /** @type {Set<string>} chunk IDs currently loading */
    this._loadingSet = new Set();

    /** @type {number} */
    this._frame = 0;

    /** stats */
    this._stats = { loaded: 0, loading: 0, visible: 0, total: 0 };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Index all chunks from the manifest.
   * @param {object} manifest — WorldManifest
   */
  init(manifest) {
    const T = THREE();

    for (const chunk of manifest.chunks) {
      const record = {
        id: chunk.id,
        gridX: chunk.grid_x,
        gridZ: chunk.grid_z,
        zone: chunk.zone,
        placements: chunk.placements,
        state: CHUNK_STATE.UNLOADED,
        sceneGroup: null,

        // AABB for frustum testing
        aabb: new T.Box3(
          new T.Vector3(chunk.bounds_min[0], 0, chunk.bounds_min[1]),
          new T.Vector3(chunk.bounds_max[0], 60, chunk.bounds_max[1]) // 60m covers skyscrapers
        ),

        // Center for distance calculations
        center: new T.Vector3(
          (chunk.bounds_min[0] + chunk.bounds_max[0]) / 2,
          0,
          (chunk.bounds_min[1] + chunk.bounds_max[1]) / 2
        ),

        distanceToCamera: Infinity,
      };

      this._chunks.set(chunk.id, record);
    }

    this._stats.total = this._chunks.size;
    console.log(`[ChunkManager] Indexed ${this._chunks.size} chunks`);
  }

  /** Remove all loaded chunks and clean up. */
  dispose() {
    for (const [, record] of this._chunks) {
      if (record.state === CHUNK_STATE.LOADED) {
        this._unloadChunk(record);
      }
    }
    this._chunks.clear();
  }

  // -------------------------------------------------------------------------
  // Per-frame update
  // -------------------------------------------------------------------------

  /**
   * Called each frame. Decides which chunks to load/unload.
   *
   * @param {THREE.Vector3} cameraPos
   * @param {import('./frustum-culler.mjs').FrustumCuller} frustumCuller
   */
  update(cameraPos, frustumCuller) {
    this._frame++;

    // Skip expensive work on most frames
    if (this._frame % this.updateInterval !== 0) return;

    const loadRadiusSq = this.loadRadius * this.loadRadius;
    const unloadRadiusSq = this.unloadRadius * this.unloadRadius;

    const toLoad = [];
    const toUnload = [];
    let visibleCount = 0;

    for (const [, record] of this._chunks) {
      // Distance from camera to chunk center (XZ plane)
      const dx = cameraPos.x - record.center.x;
      const dz = cameraPos.z - record.center.z;
      record.distanceToCamera = dx * dx + dz * dz; // squared

      const inRange = record.distanceToCamera <= loadRadiusSq;
      const inFrustum = frustumCuller.intersectsBox(record.aabb);
      const shouldBeLoaded = inRange; // Load even if not in frustum (player may turn)
      const shouldBeVisible = inRange && inFrustum;

      if (shouldBeVisible && record.state === CHUNK_STATE.LOADED) {
        visibleCount++;
      }

      // Toggle visibility for loaded chunks
      if (record.state === CHUNK_STATE.LOADED && record.sceneGroup) {
        record.sceneGroup.visible = shouldBeVisible;
      }

      // Queue load
      if (shouldBeLoaded && record.state === CHUNK_STATE.UNLOADED) {
        toLoad.push(record);
      }

      // Queue unload
      if (!shouldBeLoaded && record.distanceToCamera > unloadRadiusSq &&
          (record.state === CHUNK_STATE.LOADED || record.state === CHUNK_STATE.LOADING)) {
        toUnload.push(record);
      }
    }

    // Unload distant chunks (immediate)
    for (const record of toUnload) {
      this._unloadChunk(record);
    }

    // Sort load queue by distance (closest first)
    toLoad.sort((a, b) => a.distanceToCamera - b.distanceToCamera);

    // Load nearest chunks (throttled)
    const slotsAvailable = this.maxConcurrentLoads - this._loadingSet.size;
    for (let i = 0; i < Math.min(toLoad.length, slotsAvailable); i++) {
      this._loadChunk(toLoad[i]);
    }

    // Update stats
    this._stats.loaded = 0;
    this._stats.loading = this._loadingSet.size;
    this._stats.visible = visibleCount;
    for (const [, r] of this._chunks) {
      if (r.state === CHUNK_STATE.LOADED) this._stats.loaded++;
    }
  }

  // -------------------------------------------------------------------------
  // Eager road loading
  // -------------------------------------------------------------------------

  /**
   * Load all roads and intersections immediately as instanced meshes.
   * Roads are always visible (ground plane) so they aren't chunk-streamed.
   *
   * @param {object} manifest
   */
  async loadRoads(manifest) {
    // Group by asset_id
    const roadGroups = new Map();

    for (const road of manifest.roads) {
      if (!roadGroups.has(road.asset_id)) roadGroups.set(road.asset_id, []);
      roadGroups.get(road.asset_id).push(road);
    }
    for (const inter of manifest.intersections) {
      if (!roadGroups.has(inter.asset_id)) roadGroups.set(inter.asset_id, []);
      roadGroups.get(inter.asset_id).push(inter);
    }

    // Preload all road GLBs
    const uniqueIds = [...roadGroups.keys()];
    await this._assetLoader.preloadBatch(uniqueIds);

    // Create instanced meshes
    let totalRoadInstances = 0;
    for (const [assetId, placements] of roadGroups) {
      this._instancePool.addGlobalInstances(assetId, placements);
      totalRoadInstances += placements.length;
    }

    console.log(`[ChunkManager] Roads loaded: ${totalRoadInstances} instances in ${uniqueIds.length} pools`);
    return totalRoadInstances;
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  getStats() {
    return { ...this._stats };
  }

  // -------------------------------------------------------------------------
  // Internal — chunk load/unload
  // -------------------------------------------------------------------------

  /** @private */
  async _loadChunk(record) {
    if (record.state !== CHUNK_STATE.UNLOADED) return;
    record.state = CHUNK_STATE.LOADING;
    this._loadingSet.add(record.id);

    try {
      // 1. Gather unique asset IDs for this chunk
      const uniqueIds = [...new Set(record.placements.map(p => p.asset_id))];

      // 2. Preload all GLBs (cache hits are instant)
      await this._assetLoader.preloadBatch(uniqueIds);

      // 3. Separate instanceable vs. cloneable placements
      const instanceable = [];
      const cloneable = [];
      for (const p of record.placements) {
        if (InstancePool.shouldInstance(p.category)) {
          instanceable.push(p);
        } else {
          cloneable.push(p);
        }
      }

      // 4. Add instanceable assets to the pool
      const instanceGroups = InstancePool.groupByAsset(instanceable);
      for (const [assetId, placements] of instanceGroups) {
        this._instancePool.addInstances(record.id, assetId, placements);
      }

      // 5. Create clones for buildings, characters, etc.
      const T = THREE();
      const group = new T.Group();
      group.name = `chunk_${record.id}`;
      group.userData.chunkId = record.id;

      for (const p of cloneable) {
        const clone = this._assetLoader.createInstance(
          p.asset_id, p.position, p.rotation || 0, p.scale || 1
        );
        if (clone) {
          group.add(clone);
        }
      }

      // 6. Add to scene
      this._scene.add(group);
      record.sceneGroup = group;
      record.state = CHUNK_STATE.LOADED;

    } catch (err) {
      console.warn(`[ChunkManager] Failed to load chunk ${record.id}:`, err);
      record.state = CHUNK_STATE.UNLOADED;
    } finally {
      this._loadingSet.delete(record.id);
    }
  }

  /** @private */
  _unloadChunk(record) {
    if (record.state === CHUNK_STATE.LOADING) {
      // Can't cancel in-flight loads, but mark for disposal when done
      record.state = CHUNK_STATE.UNLOADING;
      return;
    }

    if (record.sceneGroup) {
      this._scene.remove(record.sceneGroup);
      // Dispose clone materials/geometry? No — AssetLoader owns shared data.
      // Just remove Object3D references.
      record.sceneGroup = null;
    }

    // Remove instanced entries for this chunk
    this._instancePool.removeChunkInstances(record.id);

    record.state = CHUNK_STATE.UNLOADED;
  }
}

/**
 * @typedef {Object} ChunkRecord
 * @property {string} id
 * @property {number} gridX
 * @property {number} gridZ
 * @property {string} zone
 * @property {Array} placements
 * @property {number} state — CHUNK_STATE value
 * @property {THREE.Group|null} sceneGroup
 * @property {THREE.Box3} aabb
 * @property {THREE.Vector3} center
 * @property {number} distanceToCamera — squared distance
 */
