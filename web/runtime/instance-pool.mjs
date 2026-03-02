// ============================================================================
// CRATE ENGINE 2.0 — INSTANCE POOL
// Manages THREE.InstancedMesh objects for repeated world assets.
// Turns thousands of draw calls into dozens.
// Phase 5 — Rendering Upgrades
// ============================================================================

const THREE = () => window.THREE;

// Categories that benefit from instancing (many identical copies)
const INSTANCEABLE_CATEGORIES = new Set([
  'road', 'traffic_control', 'street_furniture', 'vegetation',
  'vehicle', 'walkway', 'barrier',
]);

/**
 * InstancePool — groups identical assets into THREE.InstancedMesh objects.
 *
 * Typical impact: 3,400+ draw calls → ~50-80 for a medium city.
 */
export class InstancePool {
  constructor() {
    /** @type {Map<string, PoolEntry>} assetId → pool entry */
    this._pools = new Map();
    /** @type {THREE.Scene|null} */
    this._scene = null;
    /** @type {import('./asset-loader.mjs').AssetLoader|null} */
    this._assetLoader = null;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * @param {THREE.Scene} scene
   * @param {import('./asset-loader.mjs').AssetLoader} assetLoader
   */
  init(scene, assetLoader) {
    this._scene = scene;
    this._assetLoader = assetLoader;
  }

  /** Remove all instanced meshes from scene and dispose. */
  dispose() {
    for (const [, pool] of this._pools) {
      for (const im of pool.instancedMeshes) {
        this._scene.remove(im);
        // Don't dispose shared geometry — AssetLoader owns it
      }
    }
    this._pools.clear();
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /**
   * Should this asset category use instancing?
   * Buildings and characters are excluded (few repeats, need LOD/animation).
   */
  static shouldInstance(category) {
    return INSTANCEABLE_CATEGORIES.has(category);
  }

  /**
   * Group placements by asset_id.
   * @param {Array} placements — from ChunkManifest.placements
   * @returns {Map<string, Array>} assetId → placements
   */
  static groupByAsset(placements) {
    const groups = new Map();
    for (const p of placements) {
      if (!groups.has(p.asset_id)) groups.set(p.asset_id, []);
      groups.get(p.asset_id).push(p);
    }
    return groups;
  }

  // -------------------------------------------------------------------------
  // Adding instances
  // -------------------------------------------------------------------------

  /**
   * Add instances for a set of placements belonging to a chunk.
   * Creates or extends the InstancedMesh pool for each asset.
   *
   * @param {string} chunkId
   * @param {string} assetId
   * @param {Array} placements — [{ position, rotation, scale }]
   * @returns {boolean} true if instances were added
   */
  addInstances(chunkId, assetId, placements) {
    if (placements.length === 0) return false;

    const meshData = this._assetLoader.getMeshData(assetId);
    if (!meshData || meshData.length === 0) return false;

    const T = THREE();

    if (this._pools.has(assetId)) {
      return this._extendPool(assetId, chunkId, placements);
    }

    // Create new pool
    return this._createPool(assetId, chunkId, placements);
  }

  /**
   * Add instances for road/intersection placements (eagerly loaded, no chunk).
   *
   * @param {string} assetId
   * @param {Array} placements
   */
  addGlobalInstances(assetId, placements) {
    if (placements.length === 0) return false;
    const meshData = this._assetLoader.getMeshData(assetId);
    if (!meshData || meshData.length === 0) return false;

    return this._createPool(assetId, '__global__', placements);
  }

  // -------------------------------------------------------------------------
  // Removing instances (chunk unload)
  // -------------------------------------------------------------------------

  /**
   * Remove all instances that belong to a specific chunk.
   * Rebuilds affected InstancedMeshes without that chunk's data.
   *
   * @param {string} chunkId
   */
  removeChunkInstances(chunkId) {
    for (const [assetId, pool] of this._pools) {
      if (!pool.chunkData.has(chunkId)) continue;

      // Remove this chunk's data
      pool.chunkData.delete(chunkId);

      // If no chunks left, remove entire pool
      if (pool.chunkData.size === 0) {
        for (const im of pool.instancedMeshes) {
          this._scene.remove(im);
        }
        this._pools.delete(assetId);
        continue;
      }

      // Rebuild with remaining chunks
      this._rebuildPool(assetId, pool);
    }
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  getStats() {
    let totalInstances = 0;
    let totalDrawCalls = 0;
    for (const [, pool] of this._pools) {
      totalInstances += pool.totalCount;
      totalDrawCalls += pool.instancedMeshes.length;
    }
    return {
      pools: this._pools.size,
      instances: totalInstances,
      drawCalls: totalDrawCalls,
    };
  }

  // -------------------------------------------------------------------------
  // Internal — pool creation
  // -------------------------------------------------------------------------

  /** @private */
  _createPool(assetId, chunkId, placements) {
    const meshData = this._assetLoader.getMeshData(assetId);
    const T = THREE();

    const maxCount = Math.max(placements.length * 2, 64); // headroom for growth

    // One InstancedMesh per sub-mesh in the GLB
    const instancedMeshes = [];
    for (const md of meshData) {
      const im = new T.InstancedMesh(md.geometry, md.material, maxCount);
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false; // We do chunk-level culling
      im.userData.assetId = assetId;
      im.userData.pooled = true;
      im.count = 0;
      instancedMeshes.push(im);
    }

    const pool = {
      assetId,
      instancedMeshes,
      maxCount,
      totalCount: 0,
      chunkData: new Map(), // chunkId → placements
    };

    pool.chunkData.set(chunkId, placements);
    this._pools.set(assetId, pool);

    // Write instance matrices
    this._writeMatrices(pool);

    // Add to scene
    for (const im of instancedMeshes) {
      this._scene.add(im);
    }

    return true;
  }

  /** @private — extend existing pool with a new chunk's placements */
  _extendPool(assetId, chunkId, placements) {
    const pool = this._pools.get(assetId);
    pool.chunkData.set(chunkId, placements);

    // Check if we need to grow
    const totalNeeded = this._countTotal(pool);
    if (totalNeeded > pool.maxCount) {
      // Grow: remove old meshes, create bigger ones
      this._growPool(pool, totalNeeded * 2);
    }

    // Rewrite all matrices
    this._writeMatrices(pool);
    return true;
  }

  /** @private — rebuild pool after chunk removal */
  _rebuildPool(assetId, pool) {
    this._writeMatrices(pool);
  }

  /** @private — grow InstancedMesh capacity */
  _growPool(pool, newMax) {
    const T = THREE();
    const meshData = this._assetLoader.getMeshData(pool.assetId);

    // Remove old from scene
    for (const im of pool.instancedMeshes) {
      this._scene.remove(im);
    }

    // Create bigger meshes
    pool.instancedMeshes = [];
    for (const md of meshData) {
      const im = new T.InstancedMesh(md.geometry, md.material, newMax);
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      im.userData.assetId = pool.assetId;
      im.userData.pooled = true;
      im.count = 0;
      pool.instancedMeshes.push(im);
    }

    pool.maxCount = newMax;

    // Add new to scene
    for (const im of pool.instancedMeshes) {
      this._scene.add(im);
    }
  }

  /** @private — write all instance matrices from chunk data */
  _writeMatrices(pool) {
    const T = THREE();
    const matrix = new T.Matrix4();
    const position = new T.Vector3();
    const quaternion = new T.Quaternion();
    const euler = new T.Euler();
    const scaleVec = new T.Vector3();

    let idx = 0;

    for (const [, placements] of pool.chunkData) {
      for (const p of placements) {
        position.set(p.position[0], p.position[1], p.position[2]);
        euler.set(0, (p.rotation || 0) * Math.PI / 180, 0);
        quaternion.setFromEuler(euler);
        const s = p.scale || 1;
        scaleVec.set(s, s, s);
        matrix.compose(position, quaternion, scaleVec);

        // Write to every sub-mesh InstancedMesh (synchronized)
        for (const im of pool.instancedMeshes) {
          im.setMatrixAt(idx, matrix);
        }
        idx++;
      }
    }

    // Update counts
    pool.totalCount = idx;
    for (const im of pool.instancedMeshes) {
      im.count = idx;
      im.instanceMatrix.needsUpdate = true;
    }
  }

  /** @private */
  _countTotal(pool) {
    let count = 0;
    for (const [, placements] of pool.chunkData) {
      count += placements.length;
    }
    return count;
  }
}

/**
 * @typedef {Object} PoolEntry
 * @property {string} assetId
 * @property {THREE.InstancedMesh[]} instancedMeshes — one per sub-mesh in the GLB
 * @property {number} maxCount — allocated capacity
 * @property {number} totalCount — current live instance count
 * @property {Map<string, Array>} chunkData — chunkId → placements for rebuild
 */
