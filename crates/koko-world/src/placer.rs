//! Asset placer — positions buildings, street furniture, vehicles, vegetation.
//!
//! For each chunk in the grid, the placer selects appropriate assets based on
//! the zone and places them within the buildable area (chunk minus road buffers).
//! This creates the GTA-quality city feel: skyscrapers downtown, houses in
//! suburbs, trees in parks, cars everywhere.

use crate::catalog::{AssetCatalog, AssetFilter};
use crate::grid::{CityGrid, Zone};
use crate::manifest::{ChunkManifest, Placement};
use crate::rng::SeededRng;

/// Road buffer: assets are placed this far inside the chunk edge to avoid roads.
const ROAD_BUFFER: f32 = 8.0;
/// Spacing between street furniture items along a road edge.
const FURNITURE_SPACING: f32 = 20.0;
/// Spacing between trees along suburban streets.
const TREE_SPACING: f32 = 15.0;

/// Place all assets for every chunk in the grid.
pub fn place_all_chunks(
    grid: &CityGrid,
    catalog: &AssetCatalog,
    rng: &mut SeededRng,
) -> Vec<ChunkManifest> {
    let mut chunks = Vec::new();

    for gx in 0..grid.width {
        for gz in 0..grid.height {
            let zone = grid.zone_at(gx, gz);
            let [wx, wz] = grid.world_pos(gx, gz);
            let cs = grid.chunk_size;

            let mut placements = Vec::new();

            // Buildable area (inset from roads)
            let build_min_x = wx + ROAD_BUFFER;
            let build_min_z = wz + ROAD_BUFFER;
            let build_max_x = wx + cs - ROAD_BUFFER;
            let build_max_z = wz + cs - ROAD_BUFFER;
            let build_width = build_max_x - build_min_x;
            let build_depth = build_max_z - build_min_z;

            // 1. Place buildings based on zone
            place_buildings(
                zone, catalog, rng,
                build_min_x, build_min_z, build_width, build_depth,
                &mut placements,
            );

            // 2. Street furniture along chunk edges (near roads)
            place_street_furniture(zone, catalog, rng, wx, wz, cs, &mut placements);

            // 3. Vegetation
            place_vegetation(zone, catalog, rng, wx, wz, cs, &mut placements);

            // 4. Vehicles (parked along roads)
            place_vehicles(zone, catalog, rng, wx, wz, cs, &mut placements);

            // 5. Traffic control at chunk corners
            place_traffic_control(zone, grid, gx, gz, catalog, rng, &mut placements);

            // 6. Characters/pedestrians
            place_characters(zone, catalog, rng, wx, wz, cs, &mut placements);

            chunks.push(ChunkManifest {
                id: format!("chunk_{}_{}", gx, gz),
                grid_x: gx,
                grid_z: gz,
                zone: zone.to_string(),
                bounds_min: [wx, wz],
                bounds_max: [wx + cs, wz + cs],
                placements,
            });
        }
    }

    chunks
}

/// Place buildings appropriate to the zone.
fn place_buildings(
    zone: Zone,
    catalog: &AssetCatalog,
    rng: &mut SeededRng,
    min_x: f32,
    min_z: f32,
    width: f32,
    depth: f32,
    out: &mut Vec<Placement>,
) {
    let zone_str = zone.as_str();
    let filter = AssetFilter::new().category("building").zone(zone_str);

    match zone {
        Zone::Downtown => {
            // 1-2 large buildings (skyscrapers)
            let count = rng.range_usize(1, 2);
            place_on_lots(catalog, &filter, rng, min_x, min_z, width, depth, count, out);
        }
        Zone::Commercial => {
            // 2-4 medium buildings
            let count = rng.range_usize(2, 4);
            place_on_lots(catalog, &filter, rng, min_x, min_z, width, depth, count, out);
        }
        Zone::Suburbs => {
            // 3-6 houses
            let count = rng.range_usize(3, 6);
            place_on_lots(catalog, &filter, rng, min_x, min_z, width, depth, count, out);
        }
        Zone::Industrial => {
            // 1-3 warehouses/industrial buildings
            let count = rng.range_usize(1, 3);
            place_on_lots(catalog, &filter, rng, min_x, min_z, width, depth, count, out);
        }
        Zone::Park => {
            // No buildings in parks (maybe a small gazebo)
        }
    }
}

/// Place buildings on a grid of lots within the buildable area.
fn place_on_lots(
    catalog: &AssetCatalog,
    filter: &AssetFilter,
    rng: &mut SeededRng,
    min_x: f32,
    min_z: f32,
    width: f32,
    depth: f32,
    count: usize,
    out: &mut Vec<Placement>,
) {
    if count == 0 {
        return;
    }

    // Subdivide the buildable area into a grid of lots
    let cols = if count <= 2 { 1 } else { 2 };
    let rows = ((count + cols - 1) / cols).max(1);
    let lot_w = width / cols as f32;
    let lot_d = depth / rows as f32;

    let mut placed = 0;
    for row in 0..rows {
        for col in 0..cols {
            if placed >= count {
                break;
            }

            let lot_cx = min_x + col as f32 * lot_w + lot_w / 2.0;
            let lot_cz = min_z + row as f32 * lot_d + lot_d / 2.0;

            if let Some(asset) = catalog.pick(filter, rng) {
                // Randomize position within lot (±20% jitter)
                let jitter_x = rng.range_f32(-lot_w * 0.15, lot_w * 0.15);
                let jitter_z = rng.range_f32(-lot_d * 0.15, lot_d * 0.15);

                // Random rotation: face one of 4 cardinal directions
                let rotation = rng.pick_from(&[0.0_f32, 90.0, 180.0, 270.0]);

                // Slight scale variation (0.9 - 1.1)
                let scale = rng.range_f32(0.9, 1.1);

                out.push(Placement {
                    asset_id: asset.id.clone(),
                    position: [lot_cx + jitter_x, 0.0, lot_cz + jitter_z],
                    rotation,
                    scale,
                    category: "building".to_string(),
                });
                placed += 1;
            }
        }
    }
}

/// Place street furniture (lights, benches, trash cans) along road edges.
fn place_street_furniture(
    zone: Zone,
    catalog: &AssetCatalog,
    rng: &mut SeededRng,
    chunk_x: f32,
    chunk_z: f32,
    chunk_size: f32,
    out: &mut Vec<Placement>,
) {
    let zone_str = zone.as_str();
    let sidewalk_offset = 4.0; // Distance from chunk edge to sidewalk line

    // Streetlights along all road edges
    let light_filter = AssetFilter::new()
        .category("street_furniture")
        .subcategory("streetlight")
        .zone(zone_str);

    // Place lights along north and south edges
    let mut x = chunk_x + FURNITURE_SPACING / 2.0;
    while x < chunk_x + chunk_size {
        // North edge
        if let Some(asset) = catalog.pick(&light_filter, rng) {
            out.push(Placement {
                asset_id: asset.id.clone(),
                position: [x, 0.0, chunk_z + sidewalk_offset],
                rotation: 0.0,
                scale: 1.0,
                category: "street_furniture".to_string(),
            });
        }
        // South edge
        if let Some(asset) = catalog.pick(&light_filter, rng) {
            out.push(Placement {
                asset_id: asset.id.clone(),
                position: [x, 0.0, chunk_z + chunk_size - sidewalk_offset],
                rotation: 180.0,
                scale: 1.0,
                category: "street_furniture".to_string(),
            });
        }
        x += FURNITURE_SPACING;
    }

    // Place lights along west and east edges
    let mut z = chunk_z + FURNITURE_SPACING / 2.0;
    while z < chunk_z + chunk_size {
        // West edge
        if let Some(asset) = catalog.pick(&light_filter, rng) {
            out.push(Placement {
                asset_id: asset.id.clone(),
                position: [chunk_x + sidewalk_offset, 0.0, z],
                rotation: 270.0,
                scale: 1.0,
                category: "street_furniture".to_string(),
            });
        }
        // East edge
        if let Some(asset) = catalog.pick(&light_filter, rng) {
            out.push(Placement {
                asset_id: asset.id.clone(),
                position: [chunk_x + chunk_size - sidewalk_offset, 0.0, z],
                rotation: 90.0,
                scale: 1.0,
                category: "street_furniture".to_string(),
            });
        }
        z += FURNITURE_SPACING;
    }

    // Benches and trash cans in commercial and downtown zones
    if matches!(zone, Zone::Downtown | Zone::Commercial) {
        let bench_filter = AssetFilter::new()
            .category("street_furniture")
            .subcategory("bench")
            .zone(zone_str);

        // Place a few benches along one edge
        let bench_count = rng.range_usize(1, 3);
        for i in 0..bench_count {
            let t = (i as f32 + 1.0) / (bench_count as f32 + 1.0);
            let bx = chunk_x + t * chunk_size;
            if let Some(asset) = catalog.pick(&bench_filter, rng) {
                out.push(Placement {
                    asset_id: asset.id.clone(),
                    position: [bx, 0.0, chunk_z + sidewalk_offset + 1.0],
                    rotation: 0.0,
                    scale: 1.0,
                    category: "street_furniture".to_string(),
                });
            }
        }
    }
}

/// Place vegetation (trees, bushes) appropriate to the zone.
fn place_vegetation(
    zone: Zone,
    catalog: &AssetCatalog,
    rng: &mut SeededRng,
    chunk_x: f32,
    chunk_z: f32,
    chunk_size: f32,
    out: &mut Vec<Placement>,
) {
    let zone_str = zone.as_str();
    let tree_filter = AssetFilter::new()
        .category("vegetation")
        .zone(zone_str);

    match zone {
        Zone::Park => {
            // Dense trees and bushes
            let tree_count = rng.range_usize(8, 15);
            for _ in 0..tree_count {
                let x = rng.range_f32(chunk_x + 5.0, chunk_x + chunk_size - 5.0);
                let z = rng.range_f32(chunk_z + 5.0, chunk_z + chunk_size - 5.0);
                let scale = rng.range_f32(0.8, 1.3);
                let rotation = rng.range_f32(0.0, 360.0);
                if let Some(asset) = catalog.pick(&tree_filter, rng) {
                    out.push(Placement {
                        asset_id: asset.id.clone(),
                        position: [x, 0.0, z],
                        rotation,
                        scale,
                        category: "vegetation".to_string(),
                    });
                }
            }
        }
        Zone::Suburbs => {
            // Trees along streets and in yards
            let mut x = chunk_x + TREE_SPACING / 2.0;
            while x < chunk_x + chunk_size {
                if rng.next_bool() {
                    // Tree on north sidewalk
                    if let Some(asset) = catalog.pick(&tree_filter, rng) {
                        out.push(Placement {
                            asset_id: asset.id.clone(),
                            position: [x, 0.0, chunk_z + 6.0],
                            rotation: rng.range_f32(0.0, 360.0),
                            scale: rng.range_f32(0.8, 1.2),
                            category: "vegetation".to_string(),
                        });
                    }
                }
                x += TREE_SPACING;
            }
            // A few yard trees
            let yard_trees = rng.range_usize(1, 3);
            for _ in 0..yard_trees {
                let x = rng.range_f32(chunk_x + 10.0, chunk_x + chunk_size - 10.0);
                let z = rng.range_f32(chunk_z + 10.0, chunk_z + chunk_size - 10.0);
                if let Some(asset) = catalog.pick(&tree_filter, rng) {
                    out.push(Placement {
                        asset_id: asset.id.clone(),
                        position: [x, 0.0, z],
                        rotation: rng.range_f32(0.0, 360.0),
                        scale: rng.range_f32(0.8, 1.1),
                        category: "vegetation".to_string(),
                    });
                }
            }
        }
        Zone::Downtown | Zone::Commercial => {
            // Occasional city trees / planters
            let city_tree_filter = AssetFilter::new()
                .category("vegetation")
                .subcategory("city")
                .zone(zone_str);
            let count = rng.range_usize(1, 3);
            for _ in 0..count {
                let x = rng.range_f32(chunk_x + ROAD_BUFFER, chunk_x + chunk_size - ROAD_BUFFER);
                let z = rng.range_f32(chunk_z + 5.0, chunk_z + 7.0);
                let filter = if catalog.query(&city_tree_filter).is_empty() {
                    &tree_filter
                } else {
                    &city_tree_filter
                };
                if let Some(asset) = catalog.pick(filter, rng) {
                    out.push(Placement {
                        asset_id: asset.id.clone(),
                        position: [x, 0.0, z],
                        rotation: rng.range_f32(0.0, 360.0),
                        scale: 1.0,
                        category: "vegetation".to_string(),
                    });
                }
            }
        }
        _ => {}
    }
}

/// Place vehicles parked along roads.
fn place_vehicles(
    zone: Zone,
    catalog: &AssetCatalog,
    rng: &mut SeededRng,
    chunk_x: f32,
    chunk_z: f32,
    chunk_size: f32,
    out: &mut Vec<Placement>,
) {
    let zone_str = zone.as_str();
    let vehicle_filter = AssetFilter::new().category("vehicle").zone(zone_str);

    // Determine vehicle density based on zone
    let count = match zone {
        Zone::Downtown => rng.range_usize(3, 6),
        Zone::Commercial => rng.range_usize(2, 5),
        Zone::Suburbs => rng.range_usize(1, 3),
        Zone::Industrial => rng.range_usize(1, 3),
        Zone::Park => rng.range_usize(0, 1),
    };

    let parking_offset = 3.0; // Distance from road edge for parked cars

    for i in 0..count {
        // Alternate between edges
        let edge = i % 4;
        let t = rng.range_f32(0.15, 0.85);
        let pos_along = chunk_x + t * chunk_size;
        let pos_across = chunk_z + t * chunk_size;

        let (x, z, rotation) = match edge {
            0 => (pos_along, chunk_z + parking_offset, 0.0),          // North edge
            1 => (pos_along, chunk_z + chunk_size - parking_offset, 180.0), // South edge
            2 => (chunk_x + parking_offset, pos_across, 270.0),       // West edge
            _ => (chunk_x + chunk_size - parking_offset, pos_across, 90.0), // East edge
        };

        if let Some(asset) = catalog.pick(&vehicle_filter, rng) {
            out.push(Placement {
                asset_id: asset.id.clone(),
                position: [x, 0.0, z],
                rotation,
                scale: 1.0,
                category: "vehicle".to_string(),
            });
        }
    }
}

/// Place traffic control at chunk corners (traffic lights, stop signs).
fn place_traffic_control(
    zone: Zone,
    grid: &CityGrid,
    gx: i32,
    gz: i32,
    catalog: &AssetCatalog,
    rng: &mut SeededRng,
    out: &mut Vec<Placement>,
) {
    let zone_str = zone.as_str();

    // Traffic lights at major intersections, stop signs at minor ones
    let corners = [
        (gx, gz),                 // NW corner
        (gx + 1, gz),             // NE corner
        (gx, gz + 1),             // SW corner
        (gx + 1, gz + 1),         // SE corner
    ];

    for &(cx, cz) in &corners {
        let is_major_x = grid.is_major_road_x(cx);
        let is_major_z = grid.is_major_road_z(cz);
        let world_x = cx as f32 * grid.chunk_size;
        let world_z = cz as f32 * grid.chunk_size;

        if is_major_x && is_major_z {
            // Major intersection: traffic lights
            let filter = AssetFilter::new()
                .category("traffic_control")
                .subcategory("traffic_light")
                .zone(zone_str);
            if let Some(asset) = catalog.pick(&filter, rng) {
                // Place 2 traffic lights per major intersection (opposite corners)
                for offset in &[3.0_f32, -3.0] {
                    out.push(Placement {
                        asset_id: asset.id.clone(),
                        position: [world_x + offset, 0.0, world_z + offset],
                        rotation: if *offset > 0.0 { 0.0 } else { 180.0 },
                        scale: 1.0,
                        category: "traffic_control".to_string(),
                    });
                }
            }
        } else if is_major_x || is_major_z {
            // Minor intersection with a major road: stop sign
            let filter = AssetFilter::new()
                .category("traffic_control")
                .subcategory("stop")
                .zone(zone_str);
            if let Some(asset) = catalog.pick(&filter, rng) {
                out.push(Placement {
                    asset_id: asset.id.clone(),
                    position: [world_x + 3.0, 0.0, world_z + 3.0],
                    rotation: 0.0,
                    scale: 1.0,
                    category: "traffic_control".to_string(),
                });
            }
        }
    }
}

/// Place pedestrian characters.
fn place_characters(
    zone: Zone,
    catalog: &AssetCatalog,
    rng: &mut SeededRng,
    chunk_x: f32,
    chunk_z: f32,
    chunk_size: f32,
    out: &mut Vec<Placement>,
) {
    let zone_str = zone.as_str();
    let char_filter = AssetFilter::new().category("character").zone(zone_str);

    let count = match zone {
        Zone::Downtown => rng.range_usize(2, 5),
        Zone::Commercial => rng.range_usize(1, 4),
        Zone::Park => rng.range_usize(1, 3),
        Zone::Suburbs => rng.range_usize(0, 2),
        Zone::Industrial => rng.range_usize(0, 1),
    };

    for _ in 0..count {
        let sidewalk_z = if rng.next_bool() {
            chunk_z + 5.0
        } else {
            chunk_z + chunk_size - 5.0
        };
        let x = rng.range_f32(chunk_x + 5.0, chunk_x + chunk_size - 5.0);

        if let Some(asset) = catalog.pick(&char_filter, rng) {
            out.push(Placement {
                asset_id: asset.id.clone(),
                position: [x, 0.0, sidewalk_z],
                rotation: rng.range_f32(0.0, 360.0),
                scale: 1.0,
                category: "character".to_string(),
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::AssetEntry;

    fn full_catalog() -> AssetCatalog {
        AssetCatalog::new(vec![
            AssetEntry {
                id: "skyscraper-a".into(),
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
                id: "shop-a".into(),
                category: "building".into(),
                subcategory: "shop".into(),
                zones: vec!["commercial".into()],
                style: "modern".into(),
                placement: "on_lot".into(),
                footprint: [8.0, 8.0],
                height: 12.0,
                snap: "lot_boundary".into(),
                variant_group: None,
                max_per_chunk: 4,
            },
            AssetEntry {
                id: "house-a".into(),
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
                id: "streetlight".into(),
                category: "street_furniture".into(),
                subcategory: "streetlight".into(),
                zones: vec!["any".into()],
                style: "modern".into(),
                placement: "sidewalk".into(),
                footprint: [0.5, 0.5],
                height: 5.0,
                snap: "sidewalk_edge".into(),
                variant_group: None,
                max_per_chunk: 8,
            },
            AssetEntry {
                id: "city-tree".into(),
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
                id: "sedan-a".into(),
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
                id: "pedestrian-a".into(),
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
        ])
    }

    #[test]
    fn places_buildings_in_all_zones() {
        let mut rng = SeededRng::new(42);
        let grid = CityGrid::generate(6, 6, 50.0, &mut rng);
        let catalog = full_catalog();
        let chunks = place_all_chunks(&grid, &catalog, &mut rng);

        assert_eq!(chunks.len(), 36);

        let total: usize = chunks.iter().map(|c| c.placements.len()).sum();
        assert!(total > 50, "Expected >50 placements, got {}", total);
    }

    #[test]
    fn downtown_has_more_vehicles_than_park() {
        let mut rng = SeededRng::new(42);
        let grid = CityGrid::generate(10, 10, 50.0, &mut rng);
        let catalog = full_catalog();
        let chunks = place_all_chunks(&grid, &catalog, &mut rng);

        let dt_vehicles: usize = chunks
            .iter()
            .filter(|c| c.zone == "downtown")
            .flat_map(|c| &c.placements)
            .filter(|p| p.category == "vehicle")
            .count();
        let pk_vehicles: usize = chunks
            .iter()
            .filter(|c| c.zone == "park")
            .flat_map(|c| &c.placements)
            .filter(|p| p.category == "vehicle")
            .count();

        assert!(dt_vehicles > pk_vehicles);
    }

    #[test]
    fn park_has_more_vegetation() {
        let mut rng = SeededRng::new(42);
        let grid = CityGrid::generate(10, 10, 50.0, &mut rng);
        let catalog = full_catalog();
        let chunks = place_all_chunks(&grid, &catalog, &mut rng);

        let park_trees: usize = chunks
            .iter()
            .filter(|c| c.zone == "park")
            .flat_map(|c| &c.placements)
            .filter(|p| p.category == "vegetation")
            .count();

        // Parks should have significant vegetation
        assert!(park_trees > 10, "Expected >10 park trees, got {}", park_trees);
    }

    #[test]
    fn deterministic_placement() {
        let catalog = full_catalog();

        let mut rng1 = SeededRng::new(99);
        let grid1 = CityGrid::generate(6, 6, 50.0, &mut rng1);
        let chunks1 = place_all_chunks(&grid1, &catalog, &mut rng1);

        let mut rng2 = SeededRng::new(99);
        let grid2 = CityGrid::generate(6, 6, 50.0, &mut rng2);
        let chunks2 = place_all_chunks(&grid2, &catalog, &mut rng2);

        assert_eq!(chunks1.len(), chunks2.len());
        for (c1, c2) in chunks1.iter().zip(chunks2.iter()) {
            assert_eq!(c1.placements.len(), c2.placements.len());
            for (p1, p2) in c1.placements.iter().zip(c2.placements.iter()) {
                assert_eq!(p1.asset_id, p2.asset_id);
                assert_eq!(p1.position, p2.position);
            }
        }
    }
}
