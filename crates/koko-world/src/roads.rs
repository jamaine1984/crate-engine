//! Road network generation — streets, intersections, and road hierarchy.
//!
//! Roads are placed along grid lines between chunks. Every chunk boundary
//! gets a road. Major roads (every 3rd line) are wider boulevards.
//! Intersections are placed at grid corners with the appropriate piece
//! (4-way, 3-way, or deadend) based on connecting roads.

use crate::catalog::{AssetCatalog, AssetFilter};
use crate::grid::CityGrid;
use crate::manifest::{IntersectionPlacement, RoadPlacement};
use crate::rng::SeededRng;

/// Road piece size in world units (matches asset footprint).
const ROAD_PIECE_SIZE: f32 = 10.0;

/// Generate the complete road network for the city.
pub fn generate_roads(
    grid: &CityGrid,
    catalog: &AssetCatalog,
    rng: &mut SeededRng,
) -> (Vec<RoadPlacement>, Vec<IntersectionPlacement>) {
    let mut roads = Vec::new();
    let mut intersections = Vec::new();

    let pieces_per_edge = (grid.chunk_size / ROAD_PIECE_SIZE).round() as i32;

    // Find road asset IDs from catalog
    let straight_filter = AssetFilter::new().category("road").subcategory("straight");
    let straight_id = catalog
        .pick(&straight_filter, rng)
        .map(|e| e.id.clone())
        .unwrap_or_else(|| "street_pack_street_straight".to_string());

    let fourway_filter = AssetFilter::new().category("road").subcategory("4way");
    let fourway_id = catalog
        .pick(&fourway_filter, rng)
        .map(|e| e.id.clone())
        .unwrap_or_else(|| "street_pack_street_4way".to_string());

    let threeway_filter = AssetFilter::new().category("road").subcategory("3way");
    let threeway_id = catalog
        .pick(&threeway_filter, rng)
        .map(|e| e.id.clone())
        .unwrap_or_else(|| "street_pack_street_3way".to_string());

    let deadend_filter = AssetFilter::new().category("road").subcategory("deadend");
    let deadend_id = catalog
        .pick(&deadend_filter, rng)
        .map(|e| e.id.clone())
        .unwrap_or_else(|| "street_pack_street_deadend".to_string());

    // Generate E-W roads (along Z grid lines)
    for gz in 0..=grid.height {
        for gx in 0..grid.width {
            let is_major = grid.is_major_road_z(gz);
            let road_type = if is_major { "major" } else { "minor" };
            let base_x = gx as f32 * grid.chunk_size;
            let base_z = gz as f32 * grid.chunk_size;

            for p in 0..pieces_per_edge {
                let x = base_x + p as f32 * ROAD_PIECE_SIZE + ROAD_PIECE_SIZE / 2.0;
                let z = base_z;
                roads.push(RoadPlacement {
                    asset_id: straight_id.clone(),
                    position: [x, 0.0, z],
                    rotation: 0.0, // E-W oriented
                    scale: 1.0,
                    road_type: road_type.to_string(),
                });
            }
        }
    }

    // Generate N-S roads (along X grid lines)
    for gx in 0..=grid.width {
        for gz in 0..grid.height {
            let is_major = grid.is_major_road_x(gx);
            let road_type = if is_major { "major" } else { "minor" };
            let base_x = gx as f32 * grid.chunk_size;
            let base_z = gz as f32 * grid.chunk_size;

            for p in 0..pieces_per_edge {
                let x = base_x;
                let z = base_z + p as f32 * ROAD_PIECE_SIZE + ROAD_PIECE_SIZE / 2.0;
                roads.push(RoadPlacement {
                    asset_id: straight_id.clone(),
                    position: [x, 0.0, z],
                    rotation: 90.0, // N-S oriented
                    scale: 1.0,
                    road_type: road_type.to_string(),
                });
            }
        }
    }

    // Generate intersections at grid corners
    for gx in 0..=grid.width {
        for gz in 0..=grid.height {
            let x = gx as f32 * grid.chunk_size;
            let z = gz as f32 * grid.chunk_size;

            // Count connecting roads (edges vs interior)
            let connects_left = gx > 0;
            let connects_right = gx < grid.width;
            let connects_up = gz > 0;
            let connects_down = gz < grid.height;
            let connection_count =
                connects_left as u8 + connects_right as u8 + connects_up as u8 + connects_down as u8;

            let (asset_id, itype, rotation) = match connection_count {
                4 => (fourway_id.clone(), "4way", 0.0),
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
                    (threeway_id.clone(), "3way", rot)
                }
                2 => {
                    // Corner or straight-through — use deadend for corners
                    let rot = if !connects_up && !connects_left {
                        0.0
                    } else if !connects_up && !connects_right {
                        90.0
                    } else if !connects_down && !connects_right {
                        180.0
                    } else {
                        270.0
                    };
                    (deadend_id.clone(), "deadend", rot)
                }
                _ => continue, // 0 or 1 connections: skip
            };

            intersections.push(IntersectionPlacement {
                asset_id,
                position: [x, 0.0, z],
                rotation,
                scale: 1.0,
                intersection_type: itype.to_string(),
            });
        }
    }

    (roads, intersections)
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
}
