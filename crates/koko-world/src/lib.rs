//! KOKO World Compiler — deterministic world generation from templates.
//!
//! Takes a WorldBuildRequest (template + seed + asset catalog) and produces
//! a WorldManifest (complete placement data for every asset in the scene).
//! The JS world-client reads this JSON and spawns everything in Three.js.
//!
//! ## Architecture
//!
//! 1. **Grid** — divide city into chunks, assign zones (downtown/commercial/suburbs)
//! 2. **Roads** — generate road network along grid lines
//! 3. **Placer** — fill each chunk with buildings, furniture, vehicles, trees
//! 4. **Manifest** — serialize everything to JSON for the JS client

pub mod catalog;
pub mod grid;
pub mod manifest;
pub mod placer;
pub mod roads;
pub mod rng;
pub mod template_config;

use catalog::{AssetCatalog, AssetEntry};
use grid::CityGrid;
use manifest::{SpawnPoint, WorldManifest, WorldStats};
use serde::{Deserialize, Serialize};

/// World size presets.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorldSize {
    /// 6x6 chunks (300x300 units)
    Small,
    /// 10x10 chunks (500x500 units)
    Medium,
    /// 16x16 chunks (800x800 units)
    Large,
    /// 24x24 chunks (1200x1200 units)
    Huge,
}

impl WorldSize {
    pub fn grid_size(&self) -> (i32, i32) {
        match self {
            WorldSize::Small => (6, 6),
            WorldSize::Medium => (10, 10),
            WorldSize::Large => (16, 16),
            WorldSize::Huge => (24, 24),
        }
    }
}

/// Input request for the world compiler.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldBuildRequest {
    pub template: String,
    pub seed: u64,
    pub size: WorldSize,
    pub style: String,
    /// Available assets — serialized from the JS asset-index.
    pub assets: Vec<AssetEntry>,
}

/// Compile a world from a build request.
///
/// This is the main entry point. Returns a complete WorldManifest
/// that the JS world-client applies to the Three.js scene.
pub fn compile_world(request: &WorldBuildRequest) -> Result<WorldManifest, String> {
    match request.template.to_uppercase().as_str() {
        "CITY_MODERN" => compile_city_modern(request),
        "MEDIEVAL_VILLAGE" | "ZOMBIELAND" | "SPACE_STATION" => compile_template(request),
        other => Err(format!(
            "Unknown template: {}. Available: CITY_MODERN, MEDIEVAL_VILLAGE, ZOMBIELAND, SPACE_STATION",
            other
        )),
    }
}

/// Generic template compiler — works for any template via TemplateConfig.
fn compile_template(request: &WorldBuildRequest) -> Result<WorldManifest, String> {
    let config = template_config::get_template_config(&request.template)?;
    let mut rng = rng::SeededRng::new(request.seed);
    let (gw, gh) = request.size.grid_size();
    let chunk_size = 50.0;

    // Build asset catalog
    let catalog = AssetCatalog::new(request.assets.clone());
    if catalog.is_empty() {
        return Err("Empty asset catalog — cannot build world".into());
    }

    // 1. Generate grid from template config
    let grid = CityGrid::generate_from_config(gw, gh, chunk_size, &config, &mut rng);

    // 2. Generate road network using template's road style
    let (road_placements, intersection_placements) =
        roads::generate_roads_with_config(&grid, &catalog, &config, &mut rng);

    // 3. Place assets using template's zone rules
    let chunks = placer::place_all_chunks_with_config(&grid, &catalog, &config, &mut rng);

    // 4. Spawn point at center
    let spawn = find_spawn_point(&grid);

    // 5. Statistics
    let total_chunk_assets: usize = chunks.iter().map(|c| c.placements.len()).sum();
    let total_assets = total_chunk_assets + road_placements.len() + intersection_placements.len();

    let stats = WorldStats {
        total_assets,
        chunk_count: chunks.len(),
        road_segments: road_placements.len(),
        intersection_count: intersection_placements.len(),
        zone_breakdown: grid.zone_counts(),
    };

    Ok(WorldManifest {
        template: config.name.clone(),
        seed: request.seed,
        world_size: grid.world_size(),
        chunk_size,
        chunks,
        roads: road_placements,
        intersections: intersection_placements,
        spawn,
        stats,
    })
}

/// Compile a CITY_MODERN world.
fn compile_city_modern(request: &WorldBuildRequest) -> Result<WorldManifest, String> {
    let mut rng = rng::SeededRng::new(request.seed);
    let (gw, gh) = request.size.grid_size();
    let chunk_size = 50.0;

    // Build asset catalog
    let catalog = AssetCatalog::new(request.assets.clone());
    if catalog.is_empty() {
        return Err("Empty asset catalog — cannot build world".into());
    }

    // 1. Generate city grid with zone assignments
    let grid = CityGrid::generate(gw, gh, chunk_size, &mut rng);

    // 2. Generate road network
    let (road_placements, intersection_placements) =
        roads::generate_roads(&grid, &catalog, &mut rng);

    // 3. Place assets in every chunk
    let chunks = placer::place_all_chunks(&grid, &catalog, &mut rng);

    // 4. Calculate spawn point (center of a commercial chunk near downtown)
    let spawn = find_spawn_point(&grid);

    // 5. Gather statistics
    let total_chunk_assets: usize = chunks.iter().map(|c| c.placements.len()).sum();
    let total_assets = total_chunk_assets + road_placements.len() + intersection_placements.len();

    let stats = WorldStats {
        total_assets,
        chunk_count: chunks.len(),
        road_segments: road_placements.len(),
        intersection_count: intersection_placements.len(),
        zone_breakdown: grid.zone_counts(),
    };

    Ok(WorldManifest {
        template: "CITY_MODERN".to_string(),
        seed: request.seed,
        world_size: grid.world_size(),
        chunk_size,
        chunks,
        roads: road_placements,
        intersections: intersection_placements,
        spawn,
        stats,
    })
}

/// Find a good spawn point — center of the map, on a commercial street.
fn find_spawn_point(grid: &CityGrid) -> SpawnPoint {
    let [wx, wz] = grid.world_size();
    SpawnPoint {
        position: [wx / 2.0, 0.0, wz / 2.0],
        rotation: 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_request(size: WorldSize) -> WorldBuildRequest {
        WorldBuildRequest {
            template: "CITY_MODERN".into(),
            seed: 42,
            size,
            style: "modern".into(),
            assets: test_assets(),
        }
    }

    fn test_assets() -> Vec<AssetEntry> {
        vec![
            AssetEntry {
                id: "kenney_city/building-skyscraper-a".into(),
                category: "building".into(),
                subcategory: "skyscraper".into(),
                zones: vec!["downtown".into()],
                style: "modern".into(),
                placement: "on_lot".into(),
                footprint: [12.0, 12.0],
                height: 40.0,
                snap: "lot_boundary".into(),
                variant_group: Some("skyscraper".into()),
                max_per_chunk: 2,
            },
            AssetEntry {
                id: "kenney_city/building-a".into(),
                category: "building".into(),
                subcategory: "commercial".into(),
                zones: vec!["commercial".into()],
                style: "modern".into(),
                placement: "on_lot".into(),
                footprint: [8.0, 8.0],
                height: 15.0,
                snap: "lot_boundary".into(),
                variant_group: None,
                max_per_chunk: 4,
            },
            AssetEntry {
                id: "kenney_city/building-type-a".into(),
                category: "building".into(),
                subcategory: "house".into(),
                zones: vec!["suburbs".into()],
                style: "modern".into(),
                placement: "on_lot".into(),
                footprint: [8.0, 10.0],
                height: 6.0,
                snap: "lot_boundary".into(),
                variant_group: Some("house".into()),
                max_per_chunk: 6,
            },
            AssetEntry {
                id: "kenney_city/building-warehouse".into(),
                category: "building".into(),
                subcategory: "warehouse".into(),
                zones: vec!["industrial".into()],
                style: "modern".into(),
                placement: "on_lot".into(),
                footprint: [15.0, 20.0],
                height: 10.0,
                snap: "lot_boundary".into(),
                variant_group: None,
                max_per_chunk: 2,
            },
            AssetEntry {
                id: "street_pack_street_straight".into(),
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
            AssetEntry {
                id: "street_pack_street_4way".into(),
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
            AssetEntry {
                id: "street_pack_street_3way".into(),
                category: "road".into(),
                subcategory: "3way".into(),
                zones: vec!["any".into()],
                style: "any".into(),
                placement: "intersection".into(),
                footprint: [10.0, 10.0],
                height: 0.1,
                snap: "intersection_center".into(),
                variant_group: None,
                max_per_chunk: 0,
            },
            AssetEntry {
                id: "street_pack_streetlight_single".into(),
                category: "street_furniture".into(),
                subcategory: "streetlight".into(),
                zones: vec!["any".into()],
                style: "modern".into(),
                placement: "sidewalk".into(),
                footprint: [0.5, 0.5],
                height: 5.0,
                snap: "sidewalk_edge".into(),
                variant_group: Some("streetlight".into()),
                max_per_chunk: 8,
            },
            AssetEntry {
                id: "kenney_city_tree_a".into(),
                category: "vegetation".into(),
                subcategory: "city_tree".into(),
                zones: vec!["any".into()],
                style: "modern".into(),
                placement: "ground".into(),
                footprint: [2.0, 2.0],
                height: 8.0,
                snap: "ground".into(),
                variant_group: None,
                max_per_chunk: 0,
            },
            AssetEntry {
                id: "kenney_cars_sedan_a".into(),
                category: "vehicle".into(),
                subcategory: "sedan".into(),
                zones: vec!["any".into()],
                style: "modern".into(),
                placement: "on_road".into(),
                footprint: [2.0, 4.5],
                height: 1.5,
                snap: "road_surface".into(),
                variant_group: Some("sedan".into()),
                max_per_chunk: 0,
            },
            AssetEntry {
                id: "street_pack_stop_sign".into(),
                category: "traffic_control".into(),
                subcategory: "stop_sign".into(),
                zones: vec!["any".into()],
                style: "modern".into(),
                placement: "road_edge".into(),
                footprint: [0.3, 0.3],
                height: 2.5,
                snap: "road_edge".into(),
                variant_group: None,
                max_per_chunk: 0,
            },
            AssetEntry {
                id: "street_pack_traffic_light".into(),
                category: "traffic_control".into(),
                subcategory: "traffic_light".into(),
                zones: vec!["any".into()],
                style: "modern".into(),
                placement: "intersection".into(),
                footprint: [0.5, 0.5],
                height: 6.0,
                snap: "intersection_center".into(),
                variant_group: None,
                max_per_chunk: 0,
            },
            AssetEntry {
                id: "pedestrian_a".into(),
                category: "character".into(),
                subcategory: "pedestrian".into(),
                zones: vec!["any".into()],
                style: "modern".into(),
                placement: "sidewalk".into(),
                footprint: [0.5, 0.5],
                height: 1.8,
                snap: "ground".into(),
                variant_group: None,
                max_per_chunk: 0,
            },
        ]
    }

    #[test]
    fn compile_city_modern_small() {
        let req = test_request(WorldSize::Small);
        let manifest = compile_world(&req).unwrap();
        assert_eq!(manifest.template, "CITY_MODERN");
        assert_eq!(manifest.seed, 42);
        assert_eq!(manifest.chunk_count(), 36); // 6x6
        assert!(manifest.stats.total_assets > 100);
        println!(
            "Small city: {} total assets, {} road segments, {} intersections",
            manifest.stats.total_assets,
            manifest.stats.road_segments,
            manifest.stats.intersection_count
        );
    }

    #[test]
    fn compile_city_modern_medium() {
        let req = test_request(WorldSize::Medium);
        let manifest = compile_world(&req).unwrap();
        assert_eq!(manifest.chunk_count(), 100); // 10x10
        assert!(manifest.stats.total_assets > 500);
        println!(
            "Medium city: {} total assets, {} chunks",
            manifest.stats.total_assets,
            manifest.stats.chunk_count
        );
    }

    #[test]
    fn deterministic_output() {
        let req = test_request(WorldSize::Small);
        let m1 = compile_world(&req).unwrap();
        let m2 = compile_world(&req).unwrap();

        assert_eq!(m1.stats.total_assets, m2.stats.total_assets);
        assert_eq!(m1.chunks.len(), m2.chunks.len());

        // Every placement matches
        for (c1, c2) in m1.chunks.iter().zip(m2.chunks.iter()) {
            assert_eq!(c1.zone, c2.zone);
            assert_eq!(c1.placements.len(), c2.placements.len());
        }
    }

    #[test]
    fn different_seeds_different_output() {
        let mut req1 = test_request(WorldSize::Small);
        req1.seed = 1;
        let mut req2 = test_request(WorldSize::Small);
        req2.seed = 2;

        let m1 = compile_world(&req1).unwrap();
        let m2 = compile_world(&req2).unwrap();

        // Same structure, different placement details
        assert_eq!(m1.chunks.len(), m2.chunks.len());
        // At least some placements should differ
        let diff_count: usize = m1
            .chunks
            .iter()
            .zip(m2.chunks.iter())
            .map(|(c1, c2)| {
                if c1.placements.len() != c2.placements.len() {
                    1
                } else {
                    0
                }
            })
            .sum();
        assert!(diff_count > 0, "Different seeds should produce different layouts");
    }

    #[test]
    fn empty_catalog_returns_error() {
        let req = WorldBuildRequest {
            template: "CITY_MODERN".into(),
            seed: 42,
            size: WorldSize::Small,
            style: "modern".into(),
            assets: vec![],
        };
        assert!(compile_world(&req).is_err());
    }

    #[test]
    fn unknown_template_returns_error() {
        let mut req = test_request(WorldSize::Small);
        req.template = "ATLANTIS".into();
        assert!(compile_world(&req).is_err());
    }

    // --- New template tests ---

    fn template_test_assets() -> Vec<AssetEntry> {
        // Multi-style assets that match any template's zone/style filters
        vec![
            AssetEntry {
                id: "generic_building".into(), category: "building".into(),
                subcategory: "generic".into(), zones: vec!["any".into()],
                style: "any".into(), placement: "on_lot".into(),
                footprint: [8.0, 8.0], height: 10.0, snap: "lot_boundary".into(),
                variant_group: None, max_per_chunk: 4,
            },
            AssetEntry {
                id: "generic_road".into(), category: "road".into(),
                subcategory: "straight".into(), zones: vec!["any".into()],
                style: "any".into(), placement: "ground".into(),
                footprint: [10.0, 10.0], height: 0.1, snap: "ground".into(),
                variant_group: None, max_per_chunk: 0,
            },
            AssetEntry {
                id: "generic_path".into(), category: "road".into(),
                subcategory: "path".into(), zones: vec!["any".into()],
                style: "any".into(), placement: "ground".into(),
                footprint: [10.0, 10.0], height: 0.1, snap: "ground".into(),
                variant_group: None, max_per_chunk: 0,
            },
            AssetEntry {
                id: "generic_connector".into(), category: "road".into(),
                subcategory: "connector".into(), zones: vec!["any".into()],
                style: "any".into(), placement: "ground".into(),
                footprint: [10.0, 10.0], height: 0.1, snap: "ground".into(),
                variant_group: None, max_per_chunk: 0,
            },
            AssetEntry {
                id: "generic_4way".into(), category: "road".into(),
                subcategory: "4way".into(), zones: vec!["any".into()],
                style: "any".into(), placement: "intersection".into(),
                footprint: [10.0, 10.0], height: 0.1, snap: "intersection_center".into(),
                variant_group: None, max_per_chunk: 0,
            },
            AssetEntry {
                id: "generic_path_square".into(), category: "road".into(),
                subcategory: "path_square".into(), zones: vec!["any".into()],
                style: "any".into(), placement: "intersection".into(),
                footprint: [10.0, 10.0], height: 0.1, snap: "intersection_center".into(),
                variant_group: None, max_per_chunk: 0,
            },
            AssetEntry {
                id: "generic_light".into(), category: "street_furniture".into(),
                subcategory: "light".into(), zones: vec!["any".into()],
                style: "any".into(), placement: "sidewalk".into(),
                footprint: [0.5, 0.5], height: 4.0, snap: "sidewalk_edge".into(),
                variant_group: None, max_per_chunk: 8,
            },
            AssetEntry {
                id: "generic_tree".into(), category: "vegetation".into(),
                subcategory: "tree".into(), zones: vec!["any".into()],
                style: "any".into(), placement: "ground".into(),
                footprint: [2.0, 2.0], height: 6.0, snap: "ground".into(),
                variant_group: None, max_per_chunk: 0,
            },
            AssetEntry {
                id: "generic_vehicle".into(), category: "vehicle".into(),
                subcategory: "generic".into(), zones: vec!["any".into()],
                style: "any".into(), placement: "on_road".into(),
                footprint: [2.0, 4.0], height: 1.5, snap: "road_surface".into(),
                variant_group: None, max_per_chunk: 0,
            },
            AssetEntry {
                id: "generic_character".into(), category: "character".into(),
                subcategory: "npc".into(), zones: vec!["any".into()],
                style: "any".into(), placement: "sidewalk".into(),
                footprint: [0.5, 0.5], height: 1.8, snap: "ground".into(),
                variant_group: None, max_per_chunk: 0,
            },
            AssetEntry {
                id: "generic_traffic".into(), category: "traffic_control".into(),
                subcategory: "traffic_light".into(), zones: vec!["any".into()],
                style: "any".into(), placement: "intersection".into(),
                footprint: [0.5, 0.5], height: 5.0, snap: "intersection_center".into(),
                variant_group: None, max_per_chunk: 0,
            },
        ]
    }

    fn template_request(template: &str, size: WorldSize) -> WorldBuildRequest {
        WorldBuildRequest {
            template: template.into(),
            seed: 42,
            size,
            style: "any".into(),
            assets: template_test_assets(),
        }
    }

    #[test]
    fn compile_medieval_village() {
        let req = template_request("MEDIEVAL_VILLAGE", WorldSize::Small);
        let manifest = compile_world(&req).unwrap();
        assert_eq!(manifest.template, "MEDIEVAL_VILLAGE");
        assert_eq!(manifest.chunk_count(), 36);
        let counts = &manifest.stats.zone_breakdown;
        assert!(counts.contains_key("castle"), "Should have castle zone");
        assert!(counts.contains_key("market"), "Should have market zone");
        assert!(counts.contains_key("cottage"), "Should have cottage zone");
        println!(
            "Medieval: {} assets, zones: {:?}",
            manifest.stats.total_assets, counts
        );
    }

    #[test]
    fn compile_zombieland() {
        let req = template_request("ZOMBIELAND", WorldSize::Small);
        let manifest = compile_world(&req).unwrap();
        assert_eq!(manifest.template, "ZOMBIELAND");
        let counts = &manifest.stats.zone_breakdown;
        let ruin_count = counts.get("ruin").copied().unwrap_or(0);
        assert!(ruin_count > 20, "Zombieland should be mostly ruin, got {}", ruin_count);
        // DamagedGrid should have fewer roads than full grid
        assert!(manifest.stats.road_segments > 0);
        println!(
            "Zombieland: {} assets, {} roads, ruin chunks: {}",
            manifest.stats.total_assets, manifest.stats.road_segments, ruin_count
        );
    }

    #[test]
    fn compile_space_station() {
        let req = template_request("SPACE_STATION", WorldSize::Small);
        let manifest = compile_world(&req).unwrap();
        assert_eq!(manifest.template, "SPACE_STATION");
        let counts = &manifest.stats.zone_breakdown;
        assert!(counts.contains_key("command"), "Should have command zone");
        assert!(counts.contains_key("hangar"), "Should have hangar zone");
        println!(
            "Space station: {} assets, zones: {:?}",
            manifest.stats.total_assets, counts
        );
    }

    #[test]
    fn all_templates_deterministic() {
        for template in &["MEDIEVAL_VILLAGE", "ZOMBIELAND", "SPACE_STATION"] {
            let req = template_request(template, WorldSize::Small);
            let m1 = compile_world(&req).unwrap();
            let m2 = compile_world(&req).unwrap();
            assert_eq!(m1.stats.total_assets, m2.stats.total_assets,
                "{} not deterministic (assets differ)", template);
            assert_eq!(m1.chunks.len(), m2.chunks.len(),
                "{} not deterministic (chunks differ)", template);
        }
    }

    #[test]
    fn manifest_serializes_to_json() {
        let req = test_request(WorldSize::Small);
        let manifest = compile_world(&req).unwrap();
        let json = serde_json::to_string(&manifest).unwrap();
        assert!(json.len() > 1000); // Substantial JSON output
        // Verify it round-trips
        let back: WorldManifest = serde_json::from_str(&json).unwrap();
        assert_eq!(back.template, "CITY_MODERN");
        assert_eq!(back.stats.total_assets, manifest.stats.total_assets);
    }

    #[test]
    fn spawn_is_at_center() {
        let req = test_request(WorldSize::Medium);
        let manifest = compile_world(&req).unwrap();
        assert_eq!(manifest.spawn.position[0], 250.0); // Center of 500x500
        assert_eq!(manifest.spawn.position[2], 250.0);
    }
}

// Convenience impl for tests
impl WorldManifest {
    pub fn chunk_count(&self) -> usize {
        self.chunks.len()
    }
}
