// ============================================================================
// CRATE ENGINE 2.0 — SHADOW MANAGER
// Camera-following directional shadows + quality levels.
// Phase 5 — Rendering Upgrades
// ============================================================================

const THREE = () => window.THREE;

/**
 * ShadowManager — moves directional shadow lights to follow the camera
 * so shadows always render near the player, not stuck at world origin.
 */
export class ShadowManager {
  constructor() {
    /** @type {THREE.DirectionalLight|null} Main shadow light (4096x4096) */
    this._sunLight = null;
    /** @type {THREE.DirectionalLight|null} Near shadow light (2048x2048) */
    this._nearLight = null;
    /** @type {THREE.Camera|null} */
    this._camera = null;

    // Sun offset relative to camera (matches existing setup)
    this._sunOffset = null;
    this._nearOffset = null;

    this._updateInterval = 5; // update every N frames
    this._frame = 0;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Find existing shadow lights in the scene. */
  init() {
    const T = THREE();
    const scene = window._scene;
    this._camera = window._cam;

    if (!scene || !this._camera) {
      console.warn('[ShadowManager] Scene or camera not available');
      return;
    }

    this._sunOffset = new T.Vector3(30, 40, 20);
    this._nearOffset = new T.Vector3(15, 20, 10);

    // Find shadow-casting directional lights
    scene.traverse(child => {
      if (child.isDirectionalLight && child.castShadow) {
        if (!this._sunLight || child.shadow.mapSize.x > this._sunLight.shadow.mapSize.x) {
          // Largest shadow map is the sun
          if (this._sunLight) this._nearLight = this._sunLight;
          this._sunLight = child;
        } else {
          this._nearLight = child;
        }
      }
    });

    if (this._sunLight) {
      // Capture initial offset (relative to target)
      const target = this._sunLight.target.position.clone();
      this._sunOffset = this._sunLight.position.clone().sub(target);
      console.log('[ShadowManager] Tracking sun light, offset:', this._sunOffset.toArray());
    }

    if (this._nearLight) {
      const target = this._nearLight.target.position.clone();
      this._nearOffset = this._nearLight.position.clone().sub(target);
    }
  }

  // -------------------------------------------------------------------------
  // Per-frame update
  // -------------------------------------------------------------------------

  /** Move shadow lights to follow camera. */
  update() {
    this._frame++;
    if (this._frame % this._updateInterval !== 0) return;
    if (!this._camera || !this._sunLight) return;

    const camPos = this._camera.position;

    // Move sun shadow frustum to follow camera
    this._sunLight.target.position.set(camPos.x, 0, camPos.z);
    this._sunLight.position.set(
      camPos.x + this._sunOffset.x,
      this._sunOffset.y, // keep Y constant (sun height)
      camPos.z + this._sunOffset.z
    );
    this._sunLight.target.updateMatrixWorld();

    // Move near shadow
    if (this._nearLight) {
      this._nearLight.target.position.set(camPos.x, 0, camPos.z);
      this._nearLight.position.set(
        camPos.x + this._nearOffset.x,
        this._nearOffset.y,
        camPos.z + this._nearOffset.z
      );
      this._nearLight.target.updateMatrixWorld();
    }
  }

  // -------------------------------------------------------------------------
  // Quality control
  // -------------------------------------------------------------------------

  /**
   * Adjust shadow quality for performance scaling.
   * @param {'low'|'medium'|'high'|'ultra'} level
   */
  setQuality(level) {
    if (!this._sunLight) return;

    switch (level) {
      case 'low':
        this._setShadowMapSize(this._sunLight, 1024);
        if (this._nearLight) this._nearLight.castShadow = false;
        break;
      case 'medium':
        this._setShadowMapSize(this._sunLight, 2048);
        if (this._nearLight) {
          this._nearLight.castShadow = true;
          this._setShadowMapSize(this._nearLight, 1024);
        }
        break;
      case 'high':
        this._setShadowMapSize(this._sunLight, 4096);
        if (this._nearLight) {
          this._nearLight.castShadow = true;
          this._setShadowMapSize(this._nearLight, 2048);
        }
        break;
      case 'ultra':
        this._setShadowMapSize(this._sunLight, 4096);
        if (this._nearLight) {
          this._nearLight.castShadow = true;
          this._setShadowMapSize(this._nearLight, 4096);
        }
        break;
    }
  }

  /** @private */
  _setShadowMapSize(light, size) {
    light.shadow.mapSize.set(size, size);
    // Force shadow map recreation
    if (light.shadow.map) {
      light.shadow.map.dispose();
      light.shadow.map = null;
    }
  }
}
