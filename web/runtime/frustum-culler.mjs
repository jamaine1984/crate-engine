// ============================================================================
// CRATE ENGINE 2.0 — FRUSTUM CULLER
// Thin wrapper around THREE.Frustum for chunk-level visibility testing.
// Phase 5 — Rendering Upgrades
// ============================================================================

const THREE = () => window.THREE;

/**
 * Frustum culler — computes camera frustum each frame and tests
 * axis-aligned bounding boxes against it.
 */
export class FrustumCuller {
  constructor() {
    const T = THREE();
    this._frustum = new T.Frustum();
    this._projScreenMatrix = new T.Matrix4();
  }

  /**
   * Recompute frustum from the current camera matrices.
   * Call once per frame before any intersection tests.
   *
   * @param {THREE.Camera} camera
   */
  update(camera) {
    camera.updateMatrixWorld();
    this._projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    this._frustum.setFromProjectionMatrix(this._projScreenMatrix);
  }

  /**
   * Test if an axis-aligned bounding box intersects the frustum.
   *
   * @param {THREE.Box3} box3
   * @returns {boolean}
   */
  intersectsBox(box3) {
    return this._frustum.intersectsBox(box3);
  }

  /**
   * Test if a bounding sphere intersects the frustum.
   *
   * @param {THREE.Sphere} sphere
   * @returns {boolean}
   */
  intersectsSphere(sphere) {
    return this._frustum.intersectsSphere(sphere);
  }

  /** Raw frustum for advanced queries. */
  get frustum() {
    return this._frustum;
  }
}
