// ============================================================================
// CRATE ENGINE 2.0 — WASM BRIDGE
// Loads and wraps the koko-wasm WebAssembly module.
// Provides WASM-first functions with null fallback when WASM unavailable.
// See research/ENGINE_2_0_SPEC.md — Phase 7.
// ============================================================================

let wasmModule = null;
let wasmReady = false;
let initPromise = null;

/**
 * Initialize the WASM module. Non-blocking — returns a promise.
 * Safe to call multiple times (deduplicates).
 */
export async function initWasm() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Dynamic import of the wasm-pack generated glue
      const wasm = await import('../pkg/koko_wasm.js');
      await wasm.default();
      wasmModule = wasm;
      wasmReady = true;
      console.log(`[WASM] Initialized koko-wasm v${wasm.get_version()}`);
      return true;
    } catch (err) {
      console.warn('[WASM] Failed to load — using JS fallback:', err.message);
      wasmReady = false;
      return false;
    }
  })();

  return initPromise;
}

/** Check if WASM loaded successfully. */
export function isWasmReady() {
  return wasmReady;
}

/** Get the WASM module version, or null if not loaded. */
export function wasmVersion() {
  if (!wasmReady) return null;
  return wasmModule.get_version();
}

// ---------------------------------------------------------------------------
// World Compilation
// ---------------------------------------------------------------------------

/**
 * Compile a world via WASM.
 * @param {string} template - Template name
 * @param {number} seed - RNG seed
 * @param {string} size - World size preset
 * @param {Array} assets - Asset catalog array
 * @returns {object|null} WorldManifest, or null if WASM unavailable
 */
export function wasmCompileWorld(template, seed, size, assets) {
  if (!wasmReady) return null;
  try {
    const assetsJson = JSON.stringify(assets);
    return wasmModule.compile_world(template, seed, size, assetsJson);
  } catch (err) {
    console.warn('[WASM] compile_world failed:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Command Validation
// ---------------------------------------------------------------------------

/**
 * Validate a command via WASM.
 * @param {string} commandJson - Command JSON string
 * @returns {object|null} { valid, error? }, or null if WASM unavailable
 */
export function wasmValidateCommand(commandJson) {
  if (!wasmReady) return null;
  try {
    return wasmModule.validate_command(commandJson);
  } catch (err) {
    console.warn('[WASM] validate_command failed:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/**
 * Build nav graphs via WASM.
 * @param {string} inputJson - NavBuildInput as JSON string
 * @returns {object|null} NavManifest, or null if WASM unavailable
 */
export function wasmBuildNavGraphs(inputJson) {
  if (!wasmReady) return null;
  try {
    return wasmModule.build_nav_graphs(inputJson);
  } catch (err) {
    console.warn('[WASM] build_nav_graphs failed:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

/**
 * Initialize simulation via WASM (stateful — stored in WASM memory).
 * @param {string} setupJson - JSON with { chunks, nav } data
 * @param {number} seed - RNG seed
 * @returns {object|null} { agent_count, pedestrians, vehicles, snapshots }, or null
 */
export function wasmSimInit(setupJson, seed) {
  if (!wasmReady) return null;
  try {
    return wasmModule.create_simulation(setupJson, seed);
  } catch (err) {
    console.warn('[WASM] create_simulation failed:', err.message);
    return null;
  }
}

/**
 * Advance simulation one tick via WASM.
 * @param {number} dt - Time delta in seconds
 * @returns {object|null} TickResult, or null if WASM unavailable
 */
export function wasmSimTick(dt) {
  if (!wasmReady) return null;
  try {
    return wasmModule.sim_tick(dt);
  } catch (err) {
    console.warn('[WASM] sim_tick failed:', err.message);
    return null;
  }
}

/**
 * Get all agent snapshots from WASM simulation.
 * @returns {Array|null} Agent snapshots, or null
 */
export function wasmSimSnapshots() {
  if (!wasmReady) return null;
  try {
    return wasmModule.sim_snapshots();
  } catch (err) {
    return null;
  }
}

/**
 * Set WASM simulation running/paused.
 * @param {boolean} running
 */
export function wasmSimSetRunning(running) {
  if (!wasmReady) return;
  try {
    wasmModule.sim_set_running(running);
  } catch (err) {
    // ignore
  }
}

/**
 * Set WASM simulation speed.
 * @param {number} speed - Multiplier (0.1 to 10.0)
 */
export function wasmSimSetSpeed(speed) {
  if (!wasmReady) return;
  try {
    wasmModule.sim_set_speed(speed);
  } catch (err) {
    // ignore
  }
}
