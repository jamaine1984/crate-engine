// ============================================================================
// CRATE ENGINE 2.0 — RENDER SCHEDULER
// Frame-level orchestrator for all Phase 5 rendering subsystems.
// Runs its own rAF loop, manages chunk streaming + instancing + shadows.
// Phase 5 — Rendering Upgrades
// ============================================================================

import { AssetLoader } from './asset-loader.mjs';
import { FrustumCuller } from './frustum-culler.mjs';
import { InstancePool } from './instance-pool.mjs';
import { ChunkManager } from './chunk-manager.mjs';
import { ShadowManager } from './shadow-manager.mjs';

/**
 * RenderScheduler — the single entry point for Phase 5 rendering.
 *
 * Owns all subsystems and drives them from a requestAnimationFrame loop
 * (same pattern as sim-client.mjs SimulationRunner).
 */
export class RenderScheduler {
  constructor() {
    /** @type {AssetLoader} */
    this.assetLoader = null;
    /** @type {FrustumCuller} */
    this.frustumCuller = null;
    /** @type {InstancePool} */
    this.instancePool = null;
    /** @type {ChunkManager} */
    this.chunkManager = null;
    /** @type {ShadowManager} */
    this.shadowManager = null;

    this._initialized = false;
    this._running = false;
    this._rafId = null;
    this._lastTime = 0;
    this._manifest = null;

    // Frame budget tracking
    this._frameTimes = [];
    this._avgFrameTime = 0;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Initialize all subsystems and eagerly load roads.
   *
   * @param {object} manifest — WorldManifest
   * @returns {Promise<{ roadInstances: number }>}
   */
  async init(manifest) {
    const scene = window._scene;
    const camera = window._cam;

    if (!scene || !camera) {
      throw new Error('[RenderScheduler] Scene or camera not available');
    }

    this._manifest = manifest;

    // 1. Asset Loader
    this.assetLoader = new AssetLoader();
    this.assetLoader.init();

    // 2. Frustum Culler
    this.frustumCuller = new FrustumCuller();

    // 3. Instance Pool
    this.instancePool = new InstancePool();
    this.instancePool.init(scene, this.assetLoader);

    // 4. Chunk Manager
    this.chunkManager = new ChunkManager({
      assetLoader: this.assetLoader,
      instancePool: this.instancePool,
      scene,
    });
    this.chunkManager.init(manifest);

    // 5. Shadow Manager
    this.shadowManager = new ShadowManager();
    this.shadowManager.init();

    // 6. Eagerly load roads (always visible ground plane)
    const roadInstances = await this.chunkManager.loadRoads(manifest);

    this._initialized = true;
    console.log(`[RenderScheduler] Initialized — ${manifest.chunks.length} chunks, ${roadInstances} road instances`);

    return { roadInstances };
  }

  /** Start the per-frame update loop. */
  start() {
    if (!this._initialized || this._running) return;
    this._running = true;
    this._lastTime = performance.now();
    this._tick();
    console.log('[RenderScheduler] Started');
  }

  /** Stop the update loop. */
  stop() {
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /** Dispose all subsystems. */
  dispose() {
    this.stop();
    this.chunkManager?.dispose();
    this.instancePool?.dispose();
    this.assetLoader?.dispose();
    this._initialized = false;
    console.log('[RenderScheduler] Disposed');
  }

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /**
   * Adjust rendering quality level.
   * @param {'low'|'medium'|'high'|'ultra'} level
   */
  setQuality(level) {
    this.shadowManager?.setQuality(level);

    // Adjust streaming radii based on quality
    if (this.chunkManager) {
      switch (level) {
        case 'low':
          this.chunkManager.loadRadius = 100;
          this.chunkManager.unloadRadius = 150;
          break;
        case 'medium':
          this.chunkManager.loadRadius = 150;
          this.chunkManager.unloadRadius = 250;
          break;
        case 'high':
          this.chunkManager.loadRadius = 200;
          this.chunkManager.unloadRadius = 300;
          break;
        case 'ultra':
          this.chunkManager.loadRadius = 300;
          this.chunkManager.unloadRadius = 400;
          break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  getStats() {
    return {
      initialized: this._initialized,
      running: this._running,
      avgFrameTimeMs: Math.round(this._avgFrameTime * 100) / 100,
      chunks: this.chunkManager?.getStats() || {},
      instances: this.instancePool?.getStats() || {},
      assets: this.assetLoader?.getStats() || {},
    };
  }

  // -------------------------------------------------------------------------
  // Internal — frame loop
  // -------------------------------------------------------------------------

  /** @private */
  _tick() {
    if (!this._running) return;

    const now = performance.now();
    const dt = Math.min(now - this._lastTime, 100); // cap at 100ms
    this._lastTime = now;

    const camera = window._cam;
    if (camera) {
      const start = performance.now();

      // 1. Update frustum from camera
      this.frustumCuller.update(camera);

      // 2. Stream chunks based on camera position
      this.chunkManager.update(camera.position, this.frustumCuller);

      // 3. Move shadows to follow camera
      this.shadowManager.update();

      // Track frame time
      const elapsed = performance.now() - start;
      this._frameTimes.push(elapsed);
      if (this._frameTimes.length > 60) this._frameTimes.shift();
      this._avgFrameTime = this._frameTimes.reduce((a, b) => a + b, 0) / this._frameTimes.length;
    }

    this._rafId = requestAnimationFrame(() => this._tick());
  }
}
