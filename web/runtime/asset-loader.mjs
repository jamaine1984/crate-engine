// ============================================================================
// CRATE ENGINE 2.0 — ASSET LOADER
// Cached GLB loader: loads each unique model once, provides clones.
// Phase 5 — Rendering Upgrades
// ============================================================================

const THREE = () => window.THREE;

/**
 * Cached GLB asset loader.
 *
 * Loads each unique asset_id once, caches the template scene graph,
 * and serves clones for subsequent placements. Concurrent requests
 * for the same asset share a single HTTP fetch.
 */
export class AssetLoader {
  constructor() {
    /** @type {Map<string, CacheEntry>} assetId → cached template */
    this._cache = new Map();
    /** @type {Map<string, Promise<CacheEntry>>} assetId → in-flight load */
    this._pending = new Map();
    /** @type {object|null} Three.js GLTFLoader instance */
    this._loader = null;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Initialise — grabs the shared GLTFLoader from the engine. */
  init() {
    this._loader = window._gltfLoader;
    if (!this._loader) {
      console.warn('[AssetLoader] GLTFLoader not found — will use fallback');
    }
  }

  /** Dispose all cached geometry and materials. */
  dispose() {
    for (const [, entry] of this._cache) {
      entry.meshes.forEach(m => {
        m.geometry?.dispose();
        if (Array.isArray(m.material)) m.material.forEach(mt => mt.dispose());
        else m.material?.dispose();
      });
    }
    this._cache.clear();
    this._pending.clear();
  }

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------

  /**
   * Load a GLB by asset_id and cache it.
   * Multiple concurrent callers for the same ID share one network request.
   *
   * @param {string} assetId — e.g. 'street_pack_street_straight' or 'kenney_city/building-a'
   * @returns {Promise<CacheEntry>}
   */
  async load(assetId) {
    // Cache hit
    if (this._cache.has(assetId)) return this._cache.get(assetId);

    // Deduplicate concurrent requests
    if (this._pending.has(assetId)) return this._pending.get(assetId);

    const promise = this._doLoad(assetId);
    this._pending.set(assetId, promise);
    return promise;
  }

  /**
   * Preload a batch of asset IDs in parallel.
   * Resolves when all are loaded (or failed silently).
   *
   * @param {string[]} assetIds
   * @returns {Promise<void>}
   */
  async preloadBatch(assetIds) {
    const unique = [...new Set(assetIds)];
    await Promise.allSettled(unique.map(id => this.load(id)));
  }

  /** @returns {boolean} */
  isLoaded(assetId) {
    return this._cache.has(assetId);
  }

  /** @returns {CacheEntry|null} */
  get(assetId) {
    return this._cache.get(assetId) || null;
  }

  // -------------------------------------------------------------------------
  // Instancing helpers
  // -------------------------------------------------------------------------

  /**
   * Create a positioned clone of a cached asset.
   *
   * @param {string} assetId
   * @param {number[]} position — [x, y, z]
   * @param {number} rotation — Y-axis degrees
   * @param {number} scale — uniform scale
   * @returns {THREE.Group|null}
   */
  createInstance(assetId, position, rotation = 0, scale = 1) {
    const entry = this._cache.get(assetId);
    if (!entry) return null;

    const clone = entry.template.clone();

    // Position
    clone.position.set(position[0], position[1], position[2]);

    // Rotation (degrees → radians, Y-axis)
    if (rotation !== 0) {
      clone.rotation.y = rotation * (Math.PI / 180);
    }

    // Scale
    if (scale !== 1) {
      clone.scale.setScalar(scale);
    }

    // Shadows
    clone.traverse(c => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });

    clone.userData.assetId = assetId;
    return clone;
  }

  /**
   * Get extracted mesh data for instanced rendering.
   *
   * @param {string} assetId
   * @returns {{ geometry: BufferGeometry, material: Material }[]|null}
   */
  getMeshData(assetId) {
    return this._cache.get(assetId)?.meshes || null;
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  getStats() {
    return {
      cached: this._cache.size,
      pending: this._pending.size,
    };
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /** @private */
  _doLoad(assetId) {
    return new Promise((resolve, reject) => {
      const loader = this._loader;
      if (!loader) {
        this._pending.delete(assetId);
        reject(new Error('GLTFLoader not available'));
        return;
      }

      // Resolve asset_id to file path: 'models/<id>.glb'
      const cleanId = assetId.endsWith('.glb') ? assetId.slice(0, -4) : assetId;
      const url = 'models/' + cleanId + '.glb';

      loader.load(
        url,
        (gltf) => {
          const template = gltf.scene;

          // Enable shadows on all meshes
          template.traverse(c => {
            if (c.isMesh) {
              c.castShadow = true;
              c.receiveShadow = true;
            }
          });

          // Extract mesh data for instanced rendering
          const meshes = [];
          template.traverse(c => {
            if (c.isMesh) {
              meshes.push({
                geometry: c.geometry,
                material: c.material,
                name: c.name,
              });
            }
          });

          // Compute bounding box
          const T = THREE();
          const boundingBox = new T.Box3().setFromObject(template);

          // Store animations if present
          const animations = gltf.animations || [];

          const entry = {
            template,
            meshes,
            boundingBox,
            animations,
            assetId,
          };

          this._cache.set(assetId, entry);
          this._pending.delete(assetId);
          resolve(entry);
        },
        undefined, // progress
        (err) => {
          console.warn(`[AssetLoader] Failed to load ${assetId}: ${err?.message || err}`);
          this._pending.delete(assetId);

          // Cache a placeholder so we don't retry infinitely
          const T = THREE();
          const placeholder = new T.Group();
          placeholder.userData.placeholder = true;
          const entry = {
            template: placeholder,
            meshes: [],
            boundingBox: new T.Box3(),
            animations: [],
            assetId,
          };
          this._cache.set(assetId, entry);
          resolve(entry); // resolve with placeholder, don't reject
        }
      );
    });
  }
}

/**
 * @typedef {Object} CacheEntry
 * @property {THREE.Group} template — cloneable scene graph
 * @property {{ geometry: BufferGeometry, material: Material, name: string }[]} meshes
 * @property {THREE.Box3} boundingBox
 * @property {AnimationClip[]} animations
 * @property {string} assetId
 */
