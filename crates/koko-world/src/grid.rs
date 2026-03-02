//! City grid — zone layout and chunk management.
//!
//! The city is divided into a grid of chunks. Each chunk is assigned a zone
//! (Downtown, Commercial, Suburbs, Industrial, Park) based on distance from
//! center with special overrides. This creates the classic GTA-style city
//! layout: dense downtown core → commercial ring → suburban sprawl.

use crate::rng::SeededRng;
use serde::{Deserialize, Serialize};

/// District zone types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Zone {
    Downtown,
    Commercial,
    Suburbs,
    Industrial,
    Park,
}

impl Zone {
    pub fn as_str(&self) -> &'static str {
        match self {
            Zone::Downtown => "downtown",
            Zone::Commercial => "commercial",
            Zone::Suburbs => "suburbs",
            Zone::Industrial => "industrial",
            Zone::Park => "park",
        }
    }
}

impl std::fmt::Display for Zone {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// The city grid: a 2D array of zone assignments.
pub struct CityGrid {
    pub width: i32,
    pub height: i32,
    pub chunk_size: f32,
    zones: Vec<Vec<Zone>>,
}

impl CityGrid {
    /// Generate a city grid with zone assignments.
    ///
    /// Layout strategy (for 10x10 default):
    /// - Center 2x2 → Downtown (skyscrapers, dense)
    /// - Ring around center → Commercial (shops, medium buildings)
    /// - Outer area → Suburbs (houses, trees, yards)
    /// - 2x2 block near one corner → Park (trees, benches, paths)
    /// - 2x2 block near opposite corner → Industrial (warehouses, trucks)
    pub fn generate(width: i32, height: i32, chunk_size: f32, rng: &mut SeededRng) -> Self {
        let w = width as usize;
        let h = height as usize;
        let mut zones = vec![vec![Zone::Suburbs; h]; w];

        let cx = width as f32 / 2.0;
        let cz = height as f32 / 2.0;

        // Distance-based zone assignment
        for x in 0..width {
            for z in 0..height {
                let dx = (x as f32 + 0.5 - cx).abs();
                let dz = (z as f32 + 0.5 - cz).abs();
                let dist = dx.max(dz);

                zones[x as usize][z as usize] = if dist <= 1.0 {
                    Zone::Downtown
                } else if dist <= 2.5 {
                    Zone::Commercial
                } else {
                    Zone::Suburbs
                };
            }
        }

        // Park: 2x2 block in a random corner
        let park_corner = rng.range_usize(0, 3);
        let (park_x, park_z) = match park_corner {
            0 => (0i32, 0i32),
            1 => (width - 2, 0),
            2 => (0, height - 2),
            _ => (width - 2, height - 2),
        };
        for dx in 0..2 {
            for dz in 0..2 {
                let x = (park_x + dx).clamp(0, width - 1) as usize;
                let z = (park_z + dz).clamp(0, height - 1) as usize;
                zones[x][z] = Zone::Park;
            }
        }

        // Industrial: 2x2 block on opposite side from park
        let (ind_x, ind_z) = match park_corner {
            0 => (width - 2, height - 2),
            1 => (0, height - 2),
            2 => (width - 2, 0),
            _ => (0i32, 0i32),
        };
        for dx in 0..2 {
            for dz in 0..2 {
                let x = (ind_x + dx).clamp(0, width - 1) as usize;
                let z = (ind_z + dz).clamp(0, height - 1) as usize;
                zones[x][z] = Zone::Industrial;
            }
        }

        Self {
            width,
            height,
            chunk_size,
            zones,
        }
    }

    /// Get the zone at grid position (x, z).
    pub fn zone_at(&self, x: i32, z: i32) -> Zone {
        if x >= 0 && x < self.width && z >= 0 && z < self.height {
            self.zones[x as usize][z as usize]
        } else {
            Zone::Suburbs
        }
    }

    /// Convert grid position to world-space position (top-left corner of chunk).
    pub fn world_pos(&self, grid_x: i32, grid_z: i32) -> [f32; 2] {
        [
            grid_x as f32 * self.chunk_size,
            grid_z as f32 * self.chunk_size,
        ]
    }

    /// Get the center of a chunk in world space.
    pub fn chunk_center(&self, grid_x: i32, grid_z: i32) -> [f32; 2] {
        let half = self.chunk_size / 2.0;
        [
            grid_x as f32 * self.chunk_size + half,
            grid_z as f32 * self.chunk_size + half,
        ]
    }

    /// Total world dimensions.
    pub fn world_size(&self) -> [f32; 2] {
        [
            self.width as f32 * self.chunk_size,
            self.height as f32 * self.chunk_size,
        ]
    }

    /// Count chunks per zone.
    pub fn zone_counts(&self) -> std::collections::HashMap<String, usize> {
        let mut counts = std::collections::HashMap::new();
        for x in 0..self.width {
            for z in 0..self.height {
                *counts
                    .entry(self.zone_at(x, z).to_string())
                    .or_insert(0) += 1;
            }
        }
        counts
    }

    /// Is this a major road grid line? Major roads every 3rd line.
    pub fn is_major_road_x(&self, grid_x: i32) -> bool {
        grid_x % 3 == 0 || grid_x == self.width
    }

    pub fn is_major_road_z(&self, grid_z: i32) -> bool {
        grid_z % 3 == 0 || grid_z == self.height
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn center_is_downtown() {
        let mut rng = SeededRng::new(42);
        let grid = CityGrid::generate(10, 10, 50.0, &mut rng);
        // Center of 10x10 grid: positions 4,5
        assert_eq!(grid.zone_at(4, 4), Zone::Downtown);
        assert_eq!(grid.zone_at(5, 5), Zone::Downtown);
    }

    #[test]
    fn ring_is_commercial() {
        let mut rng = SeededRng::new(42);
        let grid = CityGrid::generate(10, 10, 50.0, &mut rng);
        // Position 3,3 should be commercial (distance ~1.5 from center)
        assert_eq!(grid.zone_at(3, 3), Zone::Commercial);
    }

    #[test]
    fn outer_is_suburbs() {
        let mut rng = SeededRng::new(42);
        let grid = CityGrid::generate(10, 10, 50.0, &mut rng);
        // Position 0,5 should be suburbs (far from center)
        // (unless it got overridden by park/industrial)
        let zone = grid.zone_at(1, 5);
        assert!(zone == Zone::Suburbs || zone == Zone::Park || zone == Zone::Industrial);
    }

    #[test]
    fn has_park_and_industrial() {
        let mut rng = SeededRng::new(42);
        let grid = CityGrid::generate(10, 10, 50.0, &mut rng);
        let counts = grid.zone_counts();
        assert!(counts.get("park").copied().unwrap_or(0) >= 4);
        assert!(counts.get("industrial").copied().unwrap_or(0) >= 4);
    }

    #[test]
    fn deterministic() {
        let mut rng1 = SeededRng::new(123);
        let mut rng2 = SeededRng::new(123);
        let g1 = CityGrid::generate(10, 10, 50.0, &mut rng1);
        let g2 = CityGrid::generate(10, 10, 50.0, &mut rng2);
        for x in 0..10 {
            for z in 0..10 {
                assert_eq!(g1.zone_at(x, z), g2.zone_at(x, z));
            }
        }
    }

    #[test]
    fn world_position_correct() {
        let mut rng = SeededRng::new(42);
        let grid = CityGrid::generate(10, 10, 50.0, &mut rng);
        assert_eq!(grid.world_pos(0, 0), [0.0, 0.0]);
        assert_eq!(grid.world_pos(3, 5), [150.0, 250.0]);
        assert_eq!(grid.world_size(), [500.0, 500.0]);
    }
}
