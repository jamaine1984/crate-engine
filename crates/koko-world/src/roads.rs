//! Road network generation — streets, intersections, and road hierarchy.
//!
//! Roads are placed along grid lines between chunks. The road style varies
//! by template: UrbanGrid for CITY_MODERN, OrganicPaths for medieval,
//! DamagedGrid for zombie, and Corridors for space station.
//!
//! All styles share the same pipeline:
//! 1. Build an edge-presence set (which grid edges have roads)
//! 2. Place road pieces along present edges
//! 3. Compute intersections from edge connectivity

use std::collections::BTreeSet;

use crate::catalog::{AssetCatalog, AssetFilter};
use crate::grid::CityGrid;
use crate::manifest::{IntersectionPlacement, RoadPlacement};
use crate::rng::SeededRng;
use crate::template_config::{RoadStyle, TemplateConfig};

/// Road piece size in world units (matches asset footprint).
const ROAD_PIECE_SIZE: f32 = 10.0;

/// Generate the complete road network (backward-compatible, UrbanGrid style).
pub fn generate_roads(
    grid: &CityGrid,
    catalog: &AssetCatalog,
    rng: &mut SeededRng,
) -> (Vec<RoadPlacement>, Vec<IntersectionPlacement>) {
    let config = crate::template_config::city_modern_config();
    generate_roads_with_config(grid, catalog, &config, rng)
}

/// Generate roads using template configuration.
pub fn generate_roads_with_config(
    grid: &CityGrid,
    catalog: &AssetCatalog,
    config: &TemplateConfig,
    rng: &mut SeededRng,
) -> (Vec<RoadPlacement>, Vec<IntersectionPlacement>) {
    // Look up road assets using config's subcategories
    let road_sub = &config.road_subcategory;
    let int_sub = &config.intersection_subcategory;

    let straight_filter = AssetFilter::new().category("road").subcategory(road_sub);
    let straight_id = catalog
        .pick(&straight_filter, rng)
        .map(|e| e.id.clone())
        .unwrap_or_else(|| format!("road_{}", road_sub));

    let int_filter = AssetFilter::new().category("road").subcategory(int_sub);
    let fourway_id = catalog
        .pick(&int_filter, rng)
        .map(|e| e.id.clone())
        .unwrap_or_else(|| format!("road_{}", int_sub));

    let threeway_filter = AssetFilter::new().category("road").subcategory("3way");
    let threeway_id = catalog
        .pick(&threeway_filter, rng)
        .map(|e| e.id.clone())
        .unwrap_or_else(|| format!("road_3way_{}", road_sub));

    let deadend_filter = AssetFilter::new().category("road").subcategory("deadend");
    let deadend_id = catalog
        .pick(&deadend_filter, rng)
        .map(|e| e.id.clone())
        .unwrap_or_else(|| format!("road_deadend_{}", road_sub));

    // Build road edge presence based on style
    let (h_edges, v_edges) = match config.road_style {
        RoadStyle::UrbanGrid => build_urban_grid(grid),
        RoadStyle::OrganicPaths => build_organic_paths(grid, config, rng),
        RoadStyle::DamagedGrid => build_damaged_grid(grid, config, rng),
        RoadStyle::Corridors => build_corridors(grid),
    };

    // Place road pieces along present edges
    let roads = place_road_pieces(grid, &h_edges, &v_edges, &straight_id);

    // Place intersections based on edge connectivity
    let intersections = place_intersections(
        grid,
        &h_edges,
        &v_edges,
        &fourway_id,
        &threeway_id,
        &deadend_id,
    );

    (roads, intersections)
}

// ============================================================================
// Edge builders — one per RoadStyle
// ============================================================================

// Edge sets use BTreeSet for deterministic iteration order.
// h_edges: (gx, gz) = E-W road segment across chunk column gx at z-line gz
// v_edges: (gx, gz) = N-S road segment across chunk row gz at x-line gx

/// UrbanGrid: every grid edge gets a road.
fn build_urban_grid(grid: &CityGrid) -> (BTreeSet<(i32, i32)>, BTreeSet<(i32, i32)>) {
    let mut h_edges = BTreeSet::new();
    let mut v_edges = BTreeSet::new();

    for gz in 0..=grid.height {
        for gx in 0..grid.width {
            h_edges.insert((gx, gz));
        }
    }
    for gx in 0..=grid.width {
        for gz in 0..grid.height {
            v_edges.insert((gx, gz));
        }
    }

    (h_edges, v_edges)
}

/// OrganicPaths: major grid roads plus random connecting paths (density-controlled).
fn build_organic_paths(
    grid: &CityGrid,
    config: &TemplateConfig,
    rng: &mut SeededRng,
) -> (BTreeSet<(i32, i32)>, BTreeSet<(i32, i32)>) {
    let mut h_edges = BTreeSet::new();
    let mut v_edges = BTreeSet::new();

    // Always include major roads
    for gz in 0..=grid.height {
        if grid.is_major_road_z(gz) {
            for gx in 0..grid.width {
                h_edges.insert((gx, gz));
            }
        }
    }
    for gx in 0..=grid.width {
        if grid.is_major_road_x(gx) {
            for gz in 0..grid.height {
                v_edges.insert((gx, gz));
            }
        }
    }

    // Add random minor paths based on density
    for gz in 0..=grid.height {
        if !grid.is_major_road_z(gz) {
            for gx in 0..grid.width {
                if rng.range_f32(0.0, 1.0) < config.road_density {
                    h_edges.insert((gx, gz));
                }
            }
        }
    }
    for gx in 0..=grid.width {
        if !grid.is_major_road_x(gx) {
            for gz in 0..grid.height {
                if rng.range_f32(0.0, 1.0) < config.road_density {
                    v_edges.insert((gx, gz));
                }
            }
        }
    }

    (h_edges, v_edges)
}

/// DamagedGrid: full urban grid with random minor segments removed.
fn build_damaged_grid(
    grid: &CityGrid,
    config: &TemplateConfig,
    rng: &mut SeededRng,
) -> (BTreeSet<(i32, i32)>, BTreeSet<(i32, i32)>) {
    let (mut h_edges, mut v_edges) = build_urban_grid(grid);

    // Remove minor road segments randomly; major roads always stay
    let remove_chance = 1.0 - config.road_density; // density 0.6 → remove ~40%

    let h_to_remove: Vec<_> = h_edges
        .iter()
        .filter(|&&(_, gz)| !grid.is_major_road_z(gz))
        .filter(|_| rng.range_f32(0.0, 1.0) < remove_chance)
        .copied()
        .collect();

    let v_to_remove: Vec<_> = v_edges
        .iter()
        .filter(|&&(gx, _)| !grid.is_major_road_x(gx))
        .filter(|_| rng.range_f32(0.0, 1.0) < remove_chance)
        .copied()
        .collect();

    for edge in h_to_remove {
        h_edges.remove(&edge);
    }
    for edge in v_to_remove {
        v_edges.remove(&edge);
    }

    (h_edges, v_edges)
}

/// Corridors: only major grid lines get road pieces.
fn build_corridors(grid: &CityGrid) -> (BTreeSet<(i32, i32)>, BTreeSet<(i32, i32)>) {
    let mut h_edges = BTreeSet::new();
    let mut v_edges = BTreeSet::new();

    for gz in 0..=grid.height {
        if grid.is_major_road_z(gz) {
            for gx in 0..grid.width {
                h_edges.insert((gx, gz));
            }
        }
    }
    for gx in 0..=grid.width {
        if grid.is_major_road_x(gx) {
            for gz in 0..grid.height {
                v_edges.insert((gx, gz));
            }
        }
    }

    (h_edges, v_edges)
}

// ============================================================================
// Common placement — shared by all styles
// ============================================================================

/// Place road pieces along all present edges.
fn place_road_pieces(
    grid: &CityGrid,
    h_edges: &BTreeSet<(i32, i32)>,
    v_edges: &BTreeSet<(i32, i32)>,
    straight_id: &str,
) -> Vec<RoadPlacement> {
    let mut roads = Vec::new();
    let pieces_per_edge = (grid.chunk_size / ROAD_PIECE_SIZE).round() as i32;

    // E-W roads (horizontal edges)
    for &(gx, gz) in h_edges {
        let is_major = grid.is_major_road_z(gz);
        let road_type = if is_major { "major" } else { "minor" };
        let base_x = gx as f32 * grid.chunk_size;
        let base_z = gz as f32 * grid.chunk_size;

        for p in 0..pieces_per_edge {
            let x = base_x + p as f32 * ROAD_PIECE_SIZE + ROAD_PIECE_SIZE / 2.0;
            roads.push(RoadPlacement {
                asset_id: straight_id.to_string(),
                position: [x, 0.0, base_z],
                rotation: 0.0,
                scale: 1.0,
                road_type: road_type.to_string(),
            });
        }
    }

    // N-S roads (vertical edges)
    for &(gx, gz) in v_edges {
        let is_major = grid.is_major_road_x(gx);
        let road_type = if is_major { "major" } else { "minor" };
        let base_x = gx as f32 * grid.chunk_size;
        let base_z = gz as f32 * grid.chunk_size;

        for p in 0..pieces_per_edge {
            let z = base_z + p as f32 * ROAD_PIECE_SIZE + ROAD_PIECE_SIZE / 2.0;
            roads.push(RoadPlacement {
                asset_id: straight_id.to_string(),
                position: [base_x, 0.0, z],
                rotation: 90.0,
                scale: 1.0,
                road_type: road_type.to_string(),
            });
        }
    }

    roads
}

/// Place intersections based on edge connectivity at each grid point.
fn place_intersections(
    grid: &CityGrid,
    h_edges: &BTreeSet<(i32, i32)>,
    v_edges: &BTreeSet<(i32, i32)>,
    fourway_id: &str,
    threeway_id: &str,
    deadend_id: &str,
) -> Vec<IntersectionPlacement> {
    let mut intersections = Vec::new();

    for gx in 0..=grid.width {
        for gz in 0..=grid.height {
            let x = gx as f32 * grid.chunk_size;
            let z = gz as f32 * grid.chunk_size;

            // Check which directions connect at this grid point
            let connects_left = gx > 0 && h_edges.contains(&(gx - 1, gz));
            let connects_right = gx < grid.width && h_edges.contains(&(gx, gz));
            let connects_up = gz > 0 && v_edges.contains(&(gx, gz - 1));
            let connects_down = gz < grid.height && v_edges.contains(&(gx, gz));

            let connection_count = connects_left as u8
                + connects_right as u8
                + connects_up as u8
                + connects_down as u8;

            let (asset_id, itype, rotation) = match connection_count {
                4 => (fourway_id, "4way", 0.0),
                3 => {
                    // T-intersection: rotation depends on which side is missing
                    let rot = if !connects_up {
                        0.0
                    } else if !connects_right {
                        90.0
                    } else if !connects_down {
                        180.0
                    } else {
                        270.0
                    };
                    (threeway_id, "3way", rot)
                }
                2 => {
                    // Corner or deadend
                    let rot = if !connects_up && !connects_left {
                        0.0
                    } else if !connects_up && !connects_right {
                        90.0
                    } else if !connects_down && !connects_right {
                        180.0
                    } else {
                        270.0
                    };
                    (deadend_id, "deadend", rot)
                }
                _ => continue, // 0 or 1 connections: skip
            };

            intersections.push(IntersectionPlacement {
                asset_id: asset_id.to_string(),
                position: [x, 0.0, z],
                rotation,
                scale: 1.0,
                intersection_type: itype.to_string(),
            });
        }
    }

    intersections
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::AssetEntry;

    fn test_catalog() -> AssetCatalog {
        AssetCatalog::new(vec![
            AssetEntry {
                id: "street_straight".into(),
                category: "road".into(),
                subcategory: "straight".into(),
                zones: vec!["any".into()],
                style: "modern".into(),
                placement: "ground".into(),
                footprint: [10.0, 10.0],
                height: 0.1,
                snap: "ground".into(),
                variant_group: None,
                max_per_chunk: 0,
            },
            AssetEntry {
                id: "street_4way".into(),
                category: "road".into(),
                subcategory: "4way".into(),
                zones: vec!["any".into()],
                style: "modern".into(),
                placement: "intersection".into(),
                footprint: [10.0, 10.0],
                height: 0.1,
                snap: "intersection_center".into(),
                variant_group: None,
                max_per_chunk: 0,
            },
        ])
    }

    #[test]
    fn generates_roads() {
        let mut rng = SeededRng::new(42);
        let grid = CityGrid::generate(4, 4, 50.0, &mut rng);
        let catalog = test_catalog();
        let (roads, intersections) = generate_roads(&grid, &catalog, &mut rng);
        assert!(!roads.is_empty());
        assert!(!intersections.is_empty());
    }

    #[test]
    fn interior_intersections_are_4way() {
        let mut rng = SeededRng::new(42);
        let grid = CityGrid::generate(4, 4, 50.0, &mut rng);
        let catalog = test_catalog();
        let (_, intersections) = generate_roads(&grid, &catalog, &mut rng);
        // Interior intersections (not on edges) should be 4-way
        let interior: Vec<_> = intersections
            .iter()
            .filter(|i| {
                i.position[0] > 0.0
                    && i.position[0] < 200.0
                    && i.position[2] > 0.0
                    && i.position[2] < 200.0
            })
            .collect();
        for i in &interior {
            assert_eq!(i.intersection_type, "4way");
        }
    }

    #[test]
    fn road_count_scales_with_grid() {
        let mut rng = SeededRng::new(42);
        let small = CityGrid::generate(4, 4, 50.0, &mut rng);
        let catalog = test_catalog();
        let (roads_small, _) = generate_roads(&small, &catalog, &mut rng);

        let mut rng2 = SeededRng::new(42);
        let large = CityGrid::generate(8, 8, 50.0, &mut rng2);
        let (roads_large, _) = generate_roads(&large, &catalog, &mut rng2);

        assert!(roads_large.len() > roads_small.len());
    }

    // --- New style tests ---

    #[test]
    fn corridors_fewer_roads_than_urban() {
        let mut rng = SeededRng::new(42);
        let grid = CityGrid::generate(8, 8, 50.0, &mut rng);
        let catalog = test_catalog();

        let urban = crate::template_config::city_modern_config();
        let (urban_roads, _) =
            generate_roads_with_config(&grid, &catalog, &urban, &mut rng);

        let mut rng2 = SeededRng::new(42);
        let grid2 = CityGrid::generate(8, 8, 50.0, &mut rng2);
        let space = crate::template_config::space_station_config();
        let (corridor_roads, _) =
            generate_roads_with_config(&grid2, &catalog, &space, &mut rng2);

        assert!(
            corridor_roads.len() < urban_roads.len(),
            "Corridors ({}) should have fewer roads than UrbanGrid ({})",
            corridor_roads.len(),
            urban_roads.len()
        );
    }

    #[test]
    fn damaged_grid_fewer_roads_than_urban() {
        let mut rng = SeededRng::new(42);
        let grid = CityGrid::generate(8, 8, 50.0, &mut rng);
        let catalog = test_catalog();

        let urban = crate::template_config::city_modern_config();
        let (urban_roads, _) =
            generate_roads_with_config(&grid, &catalog, &urban, &mut rng);

        let mut rng2 = SeededRng::new(42);
        let grid2 = CityGrid::generate(8, 8, 50.0, &mut rng2);
        let zombie = crate::template_config::zombieland_config();
        let (damaged_roads, _) =
            generate_roads_with_config(&grid2, &catalog, &zombie, &mut rng2);

        assert!(
            damaged_roads.len() < urban_roads.len(),
            "DamagedGrid ({}) should have fewer roads than UrbanGrid ({})",
            damaged_roads.len(),
            urban_roads.len()
        );
    }

    #[test]
    fn organic_paths_fewer_roads_than_urban() {
        let mut rng = SeededRng::new(42);
        let grid = CityGrid::generate(8, 8, 50.0, &mut rng);
        let catalog = test_catalog();

        let urban = crate::template_config::city_modern_config();
        let (urban_roads, _) =
            generate_roads_with_config(&grid, &catalog, &urban, &mut rng);

        let mut rng2 = SeededRng::new(42);
        let grid2 = CityGrid::generate(8, 8, 50.0, &mut rng2);
        let medieval = crate::template_config::medieval_village_config();
        let (path_roads, _) =
            generate_roads_with_config(&grid2, &catalog, &medieval, &mut rng2);

        assert!(
            path_roads.len() < urban_roads.len(),
            "OrganicPaths ({}) should have fewer roads than UrbanGrid ({})",
            path_roads.len(),
            urban_roads.len()
        );
    }

    #[test]
    fn road_style_deterministic() {
        let catalog = test_catalog();
        let zombie = crate::template_config::zombieland_config();

        let mut rng1 = SeededRng::new(55);
        let grid1 = CityGrid::generate(6, 6, 50.0, &mut rng1);
        let (r1, i1) = generate_roads_with_config(&grid1, &catalog, &zombie, &mut rng1);

        let mut rng2 = SeededRng::new(55);
        let grid2 = CityGrid::generate(6, 6, 50.0, &mut rng2);
        let (r2, i2) = generate_roads_with_config(&grid2, &catalog, &zombie, &mut rng2);

        assert_eq!(r1.len(), r2.len());
        assert_eq!(i1.len(), i2.len());
    }
}
