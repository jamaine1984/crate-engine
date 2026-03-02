//! KOKO WASM — WebAssembly bridge for browser-side world compilation.
//!
//! Wraps koko-world, koko-commands, koko-nav, and koko-sim for use in
//! the browser via wasm-bindgen. Eliminates the need for a parallel JS
//! implementation — Rust is the single source of truth.

use std::cell::RefCell;

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// ==========================================================================
// compile_world — template + seed + size + assets → WorldManifest
// ==========================================================================

/// Compile a complete world from template parameters and an asset catalog.
///
/// - `template`: Template name (CITY_MODERN, MEDIEVAL_VILLAGE, ZOMBIELAND, SPACE_STATION, TROPICAL_ISLAND, DESERT_OUTPOST)
/// - `seed`: RNG seed for deterministic generation
/// - `size`: World size preset (small, medium, large, huge)
/// - `assets_json`: JSON array of asset entries from the JS asset-index
///
/// Returns a WorldManifest as a JS object.
#[wasm_bindgen]
pub fn compile_world(
    template: &str,
    seed: u32,
    size: &str,
    assets_json: &str,
) -> Result<JsValue, JsError> {
    let world_size = parse_size(size).map_err(|e| JsError::new(&e))?;
    let assets: Vec<koko_world::catalog::AssetEntry> = serde_json::from_str(assets_json)
        .map_err(|e| JsError::new(&format!("Invalid assets JSON: {e}")))?;

    let request = koko_world::WorldBuildRequest {
        template: template.to_string(),
        seed: seed as u64,
        size: world_size,
        style: "any".to_string(),
        assets,
    };

    let manifest =
        koko_world::compile_world(&request).map_err(|e| JsError::new(&e))?;

    serde_wasm_bindgen::to_value(&manifest)
        .map_err(|e| JsError::new(&format!("Serialization error: {e}")))
}

// ==========================================================================
// validate_command — command JSON → { valid, error? }
// ==========================================================================

#[derive(Serialize)]
struct ValidationResult {
    valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// Validate a command JSON string against the schema.
///
/// Returns `{ valid: true }` or `{ valid: false, error: "..." }`.
#[wasm_bindgen]
pub fn validate_command(json: &str) -> Result<JsValue, JsError> {
    let cmd: koko_commands::Command = serde_json::from_str(json)
        .map_err(|e| JsError::new(&format!("Invalid command JSON: {e}")))?;

    let result = match koko_commands::validate(&cmd) {
        Ok(()) => ValidationResult {
            valid: true,
            error: None,
        },
        Err(e) => ValidationResult {
            valid: false,
            error: Some(e.to_string()),
        },
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsError::new(&format!("Serialization error: {e}")))
}

// ==========================================================================
// build_nav_graphs — NavBuildInput JSON → NavManifest
// ==========================================================================

/// Build pedestrian + vehicle navigation graphs from world manifest data.
///
/// Takes a NavBuildInput JSON string (grid dims, chunks, intersections).
/// Returns a NavManifest as a JS object.
#[wasm_bindgen]
pub fn build_nav_graphs(input_json: &str) -> Result<JsValue, JsError> {
    let input: koko_nav::NavBuildInput = serde_json::from_str(input_json)
        .map_err(|e| JsError::new(&format!("Invalid nav input JSON: {e}")))?;

    let nav = koko_nav::build_nav(&input);

    serde_wasm_bindgen::to_value(&nav)
        .map_err(|e| JsError::new(&format!("Serialization error: {e}")))
}

// ==========================================================================
// Simulation — stateful (held in thread-local for efficient ticking)
// ==========================================================================

struct WasmSimState {
    sim: koko_sim::SimState,
    ped_graph: koko_nav::Graph,
    veh_graph: koko_nav::Graph,
}

thread_local! {
    static SIM_STATE: RefCell<Option<WasmSimState>> = const { RefCell::new(None) };
}

/// JSON input for create_simulation: chunks + nav graphs.
#[derive(Deserialize)]
struct SimSetupInput {
    chunks: Vec<SimChunkInput>,
    nav: koko_nav::NavManifest,
}

#[derive(Deserialize)]
struct SimChunkInput {
    id: String,
    zone: String,
    grid_x: i32,
    grid_z: i32,
}

#[derive(Serialize)]
struct SimCreateResult {
    agent_count: usize,
    pedestrians: usize,
    vehicles: usize,
    snapshots: Vec<koko_sim::AgentSnapshot>,
}

/// Initialize the simulation with world data and nav graphs.
///
/// `manifest_json` should contain:
/// ```json
/// {
///   "chunks": [{ "id": "chunk_0_0", "zone": "downtown", "grid_x": 0, "grid_z": 0 }, ...],
///   "nav": { "pedestrian_graph": {...}, "vehicle_graph": {...}, "stats": {...} }
/// }
/// ```
///
/// Returns initial agent snapshots and counts.
#[wasm_bindgen]
pub fn create_simulation(manifest_json: &str, seed: u32) -> Result<JsValue, JsError> {
    let input: SimSetupInput = serde_json::from_str(manifest_json)
        .map_err(|e| JsError::new(&format!("Invalid sim setup JSON: {e}")))?;

    let chunks: Vec<koko_sim::ChunkInfo> = input
        .chunks
        .iter()
        .map(|c| koko_sim::ChunkInfo {
            id: c.id.clone(),
            zone: c.zone.clone(),
            grid_x: c.grid_x,
            grid_z: c.grid_z,
        })
        .collect();

    let population = koko_sim::spawner::default_population();

    let agents = koko_sim::spawn_population(
        &chunks,
        &input.nav.pedestrian_graph,
        &input.nav.vehicle_graph,
        &population,
        seed as u64,
    );

    let sim = koko_sim::SimState::new(agents);
    let snapshots = sim.snapshots();
    let (peds, vehs) = sim.agent_counts();

    let result = SimCreateResult {
        agent_count: snapshots.len(),
        pedestrians: peds,
        vehicles: vehs,
        snapshots,
    };

    SIM_STATE.with(|cell| {
        *cell.borrow_mut() = Some(WasmSimState {
            sim,
            ped_graph: input.nav.pedestrian_graph,
            veh_graph: input.nav.vehicle_graph,
        });
    });

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsError::new(&format!("Serialization error: {e}")))
}

/// Advance the simulation by one frame.
///
/// `dt` is the time delta in seconds (e.g. 0.016 for 60fps).
/// Returns a TickResult with agent state changes.
///
/// Must call `create_simulation()` first.
#[wasm_bindgen]
pub fn sim_tick(dt: f32) -> Result<JsValue, JsError> {
    SIM_STATE.with(|cell| {
        let mut borrow = cell.borrow_mut();
        let ws = borrow
            .as_mut()
            .ok_or_else(|| JsError::new("Simulation not initialized — call create_simulation first"))?;

        let result = ws.sim.tick(dt, &ws.ped_graph, &ws.veh_graph);

        serde_wasm_bindgen::to_value(&result)
            .map_err(|e| JsError::new(&format!("Serialization error: {e}")))
    })
}

/// Get all current agent snapshots for rendering.
#[wasm_bindgen]
pub fn sim_snapshots() -> Result<JsValue, JsError> {
    SIM_STATE.with(|cell| {
        let borrow = cell.borrow();
        let ws = borrow
            .as_ref()
            .ok_or_else(|| JsError::new("Simulation not initialized"))?;

        serde_wasm_bindgen::to_value(&ws.sim.snapshots())
            .map_err(|e| JsError::new(&format!("Serialization error: {e}")))
    })
}

/// Pause or resume the simulation.
#[wasm_bindgen]
pub fn sim_set_running(running: bool) -> Result<(), JsError> {
    SIM_STATE.with(|cell| {
        let mut borrow = cell.borrow_mut();
        let ws = borrow
            .as_mut()
            .ok_or_else(|| JsError::new("Simulation not initialized"))?;

        if running {
            ws.sim.resume();
        } else {
            ws.sim.pause();
        }
        Ok(())
    })
}

/// Set simulation speed multiplier (0.1 to 10.0).
#[wasm_bindgen]
pub fn sim_set_speed(speed: f32) -> Result<(), JsError> {
    SIM_STATE.with(|cell| {
        let mut borrow = cell.borrow_mut();
        let ws = borrow
            .as_mut()
            .ok_or_else(|| JsError::new("Simulation not initialized"))?;

        ws.sim.set_speed(speed);
        Ok(())
    })
}

// ==========================================================================
// Scene save/load
// ==========================================================================

/// Save a scene to JSON. Takes a scene JSON string and returns a pretty-printed version.
///
/// The input should be a SceneData JSON object. Returns the serialized scene.
#[wasm_bindgen]
pub fn save_scene(scene_json: &str) -> Result<String, JsError> {
    let scene: koko_scene::SceneData = serde_json::from_str(scene_json)
        .map_err(|e| JsError::new(&format!("Invalid scene JSON: {e}")))?;
    koko_scene::save_scene(&scene).map_err(|e| JsError::new(&e))
}

/// Load a scene from JSON. Validates the version and returns the parsed scene as a JS object.
#[wasm_bindgen]
pub fn load_scene(json: &str) -> Result<JsValue, JsError> {
    let scene = koko_scene::load_scene(json).map_err(|e| JsError::new(&e))?;
    serde_wasm_bindgen::to_value(&scene)
        .map_err(|e| JsError::new(&format!("Serialization error: {e}")))
}

// ==========================================================================
// get_version
// ==========================================================================

/// Returns the koko-wasm crate version (for cache busting).
#[wasm_bindgen]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// ==========================================================================
// Helpers
// ==========================================================================

fn parse_size(s: &str) -> Result<koko_world::WorldSize, String> {
    match s.to_lowercase().as_str() {
        "small" => Ok(koko_world::WorldSize::Small),
        "medium" => Ok(koko_world::WorldSize::Medium),
        "large" => Ok(koko_world::WorldSize::Large),
        "huge" => Ok(koko_world::WorldSize::Huge),
        _ => Err(format!(
            "Unknown world size: '{s}'. Use: small, medium, large, huge"
        )),
    }
}

// ==========================================================================
// Tests (run via cargo test, not WASM)
// ==========================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn test_assets_json() -> String {
        serde_json::to_string(&vec![
            koko_world::catalog::AssetEntry {
                id: "building_a".into(),
                category: "building".into(),
                subcategory: "generic".into(),
                zones: vec!["any".into()],
                style: "any".into(),
                placement: "on_lot".into(),
                footprint: [8.0, 8.0],
                height: 10.0,
                snap: "lot_boundary".into(),
                variant_group: None,
                max_per_chunk: 4,
            },
            koko_world::catalog::AssetEntry {
                id: "road_straight".into(),
                category: "road".into(),
                subcategory: "straight".into(),
                zones: vec!["any".into()],
                style: "any".into(),
                placement: "ground".into(),
                footprint: [10.0, 10.0],
                height: 0.1,
                snap: "ground".into(),
                variant_group: None,
                max_per_chunk: 0,
            },
            koko_world::catalog::AssetEntry {
                id: "road_path".into(),
                category: "road".into(),
                subcategory: "path".into(),
                zones: vec!["any".into()],
                style: "any".into(),
                placement: "ground".into(),
                footprint: [10.0, 10.0],
                height: 0.1,
                snap: "ground".into(),
                variant_group: None,
                max_per_chunk: 0,
            },
            koko_world::catalog::AssetEntry {
                id: "road_connector".into(),
                category: "road".into(),
                subcategory: "connector".into(),
                zones: vec!["any".into()],
                style: "any".into(),
                placement: "ground".into(),
                footprint: [10.0, 10.0],
                height: 0.1,
                snap: "ground".into(),
                variant_group: None,
                max_per_chunk: 0,
            },
            koko_world::catalog::AssetEntry {
                id: "road_4way".into(),
                category: "road".into(),
                subcategory: "4way".into(),
                zones: vec!["any".into()],
                style: "any".into(),
                placement: "intersection".into(),
                footprint: [10.0, 10.0],
                height: 0.1,
                snap: "intersection_center".into(),
                variant_group: None,
                max_per_chunk: 0,
            },
            koko_world::catalog::AssetEntry {
                id: "road_path_square".into(),
                category: "road".into(),
                subcategory: "path_square".into(),
                zones: vec!["any".into()],
                style: "any".into(),
                placement: "intersection".into(),
                footprint: [10.0, 10.0],
                height: 0.1,
                snap: "intersection_center".into(),
                variant_group: None,
                max_per_chunk: 0,
            },
            koko_world::catalog::AssetEntry {
                id: "light_a".into(),
                category: "street_furniture".into(),
                subcategory: "light".into(),
                zones: vec!["any".into()],
                style: "any".into(),
                placement: "sidewalk".into(),
                footprint: [0.5, 0.5],
                height: 4.0,
                snap: "sidewalk_edge".into(),
                variant_group: None,
                max_per_chunk: 8,
            },
            koko_world::catalog::AssetEntry {
                id: "tree_a".into(),
                category: "vegetation".into(),
                subcategory: "tree".into(),
                zones: vec!["any".into()],
                style: "any".into(),
                placement: "ground".into(),
                footprint: [2.0, 2.0],
                height: 6.0,
                snap: "ground".into(),
                variant_group: None,
                max_per_chunk: 0,
            },
            koko_world::catalog::AssetEntry {
                id: "car_a".into(),
                category: "vehicle".into(),
                subcategory: "generic".into(),
                zones: vec!["any".into()],
                style: "any".into(),
                placement: "on_road".into(),
                footprint: [2.0, 4.0],
                height: 1.5,
                snap: "road_surface".into(),
                variant_group: None,
                max_per_chunk: 0,
            },
            koko_world::catalog::AssetEntry {
                id: "ped_a".into(),
                category: "character".into(),
                subcategory: "npc".into(),
                zones: vec!["any".into()],
                style: "any".into(),
                placement: "sidewalk".into(),
                footprint: [0.5, 0.5],
                height: 1.8,
                snap: "ground".into(),
                variant_group: None,
                max_per_chunk: 0,
            },
            koko_world::catalog::AssetEntry {
                id: "traffic_light".into(),
                category: "traffic_control".into(),
                subcategory: "traffic_light".into(),
                zones: vec!["any".into()],
                style: "any".into(),
                placement: "intersection".into(),
                footprint: [0.5, 0.5],
                height: 5.0,
                snap: "intersection_center".into(),
                variant_group: None,
                max_per_chunk: 0,
            },
        ])
        .unwrap()
    }

    #[test]
    fn parse_size_valid() {
        assert!(parse_size("small").is_ok());
        assert!(parse_size("Medium").is_ok());
        assert!(parse_size("LARGE").is_ok());
        assert!(parse_size("huge").is_ok());
    }

    #[test]
    fn parse_size_invalid() {
        assert!(parse_size("tiny").is_err());
        assert!(parse_size("").is_err());
        assert!(parse_size("tiny").unwrap_err().contains("Unknown world size"));
    }

    #[test]
    fn compile_world_native() {
        let assets = test_assets_json();
        let request = koko_world::WorldBuildRequest {
            template: "CITY_MODERN".into(),
            seed: 42,
            size: koko_world::WorldSize::Small,
            style: "any".into(),
            assets: serde_json::from_str(&assets).unwrap(),
        };
        let manifest = koko_world::compile_world(&request).unwrap();
        assert_eq!(manifest.template, "CITY_MODERN");
        assert!(manifest.stats.total_assets > 0);
    }

    #[test]
    fn compile_all_templates_native() {
        let assets = test_assets_json();
        for template in &["CITY_MODERN", "MEDIEVAL_VILLAGE", "ZOMBIELAND", "SPACE_STATION", "TROPICAL_ISLAND", "DESERT_OUTPOST"] {
            let request = koko_world::WorldBuildRequest {
                template: template.to_string(),
                seed: 42,
                size: koko_world::WorldSize::Small,
                style: "any".into(),
                assets: serde_json::from_str(&assets).unwrap(),
            };
            let manifest = koko_world::compile_world(&request).unwrap();
            assert_eq!(manifest.template.to_uppercase(), template.to_uppercase());
        }
    }

    #[test]
    fn validate_valid_command_native() {
        let cmd = koko_commands::Command::new(
            koko_commands::CommandType::ClearScene,
            serde_json::json!({}),
            "chat",
        );
        assert!(koko_commands::validate(&cmd).is_ok());
    }

    #[test]
    fn validate_invalid_command_native() {
        let cmd = koko_commands::Command::new(
            koko_commands::CommandType::SpawnObject,
            serde_json::json!({}),
            "chat",
        );
        assert!(koko_commands::validate(&cmd).is_err());
    }

    #[test]
    fn build_nav_native() {
        let input = koko_nav::NavBuildInput {
            grid_width: 2,
            grid_height: 2,
            chunk_size: 50.0,
            chunks: vec![
                koko_nav::NavChunkInput {
                    id: "c_0_0".into(),
                    grid_x: 0,
                    grid_z: 0,
                    zone: "downtown".into(),
                    building_positions: vec![[25.0, 0.0, 25.0]],
                },
                koko_nav::NavChunkInput {
                    id: "c_1_0".into(),
                    grid_x: 1,
                    grid_z: 0,
                    zone: "suburbs".into(),
                    building_positions: vec![[75.0, 0.0, 25.0]],
                },
            ],
            intersections: vec![
                koko_nav::NavIntersectionInput {
                    position: [0.0, 0.0, 0.0],
                    intersection_type: "4way".into(),
                },
                koko_nav::NavIntersectionInput {
                    position: [50.0, 0.0, 0.0],
                    intersection_type: "4way".into(),
                },
                koko_nav::NavIntersectionInput {
                    position: [100.0, 0.0, 0.0],
                    intersection_type: "4way".into(),
                },
            ],
        };
        let nav = koko_nav::build_nav(&input);
        assert!(nav.stats.pedestrian_nodes > 0);
        assert!(nav.stats.vehicle_nodes > 0);
    }

    #[test]
    fn get_version_returns_something() {
        let v = get_version();
        assert!(!v.is_empty());
        assert!(v.starts_with("0."));
    }
}
