//! City grid — zone layout and chunk management.
//!
//! The city is divided into a grid of chunks. Each chunk is assigned a zone
//! based on the template configuration. For CITY_MODERN this creates the classic
//! GTA-style layout: dense downtown core → commercial ring → suburban sprawl.
//! Other templates use different zone names but the same concentric + corner algorithm.

use crate::rng::SeededRng;
use crate::template_config::{CornerPlacement, TemplateConfig};
use serde::{Deserialize, Serialize};

/// District zone types.
/// The five CITY_MODERN zones are first-class variants; all other templates
/// use `Custom(String)` for their zone names (castle, market, ruin, command, etc.).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Zone {
    Downtown,
    Commercial,
    Suburbs,
    Industrial,
    Park,
    /// Template-defined zone (medieval castle, zombie ruin, space command, etc.)
    Custom(String),
}

impl Zone {
    pub fn as_str(&self) -> &str {
        match self {
            Zone::Downtown => "downtown",
            Zone::Commercial => "commercial",
            Zone::Suburbs => "suburbs",
            Zone::Industrial => "industrial",
            Zone::Park => "park",
            Zone::Custom(s) => s.as_str(),
        }
    }

    /// Create a Zone from a name string. Known CITY_MODERN names map to
    /// enum variants; everything else becomes Custom.
    pub fn from_name(name: &str) -> Zone {
        match name {
            "downtown" => Zone::Downtown,
            "commercial" => Zone::Commercial,
            "suburbs" => Zone::Suburbs,
            "industrial" => Zone::Industrial,
            "park" => Zone::Park,
            other => Zone::Custom(other.to_string()),
        }
    }
}

impl Serialize for Zone {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.as_str())
    }
}

impl<'de> Deserialize<'de> for Zone {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        Ok(Zone::from_name(&s))
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
    /// Generate a CITY_MODERN grid (backward-compatible entry point).
    ///
    /// Layout strategy (for 10x10 default):
    /// - Center 2x2 → Downtown (skyscrapers, dense)
    /// - Ring around center → Commercial (shops, medium buildings)
    /// - Outer area → Suburbs (houses, trees, yards)
    /// - 2x2 block near one corner → Park (trees, benches, paths)
    /// - 2x2 block near opposite corner → Industrial (warehouses, trucks)
    pub fn generate(width: i32, height: i32, chunk_size: f32, rng: &mut SeededRng) -> Self {
        let config = crate::template_config::city_modern_config();
        Self::generate_from_config(width, height, chunk_size, &config, rng)
    }

    /// Generate a grid from any template configuration.
    ///
    /// Algorithm:
    /// 1. Collect ring zones (those with ring_order), sort ascending
    /// 2. For each cell, assign the innermost ring whose radius covers it
    ///    (Chebyshev distance from center)
    /// 3. Overlay corner-placed zones (park, industrial, farm, hangar, etc.)
    pub fn generate_from_config(
        width: i32,
        height: i32,
        chunk_size: f32,
        config: &TemplateConfig,
        rng: &mut SeededRng,
    ) -> Self {
        let h = height as usize;

        // Collect ring zones sorted by ring_order (ascending)
        let mut ring_zones: Vec<_> = config
            .zones
            .iter()
            .filter(|z| z.ring_order.is_some())
            .collect();
        ring_zones.sort_by_key(|z| z.ring_order.unwrap());

        // Default zone is the outermost ring (highest ring_order, usually radius=MAX)
        let default_zone = ring_zones
            .last()
            .map(|z| Zone::from_name(&z.name))
            .unwrap_or(Zone::Suburbs);

        let mut zones = vec![vec![default_zone; h]; width as usize];

        let cx = width as f32 / 2.0;
        let cz = height as f32 / 2.0;

        // Assign ring zones by Chebyshev distance from center
        for x in 0..width {
            for z in 0..height {
                let dx = (x as f32 + 0.5 - cx).abs();
                let dz = (z as f32 + 0.5 - cz).abs();
                let dist = dx.max(dz);

                // Find innermost ring that contains this cell
                for zone_cfg in &ring_zones {
                    if dist <= zone_cfg.ring_radius {
                        zones[x as usize][z as usize] = Zone::from_name(&zone_cfg.name);
                        break;
                    }
                }
            }
        }

        // Handle corner-placed zones (park, industrial, farm, hangar, etc.)
        let corner_zones: Vec<_> = config
            .zones
            .iter()
            .filter(|z| z.corner_placement.is_some())
            .collect();

        let mut used_corners: Vec<usize> = Vec::new();

        for zone_cfg in &corner_zones {
            let corner = match zone_cfg.corner_placement.unwrap() {
                CornerPlacement::Random => {
                    let available: Vec<usize> =
                        (0..4).filter(|c| !used_corners.contains(c)).collect();
                    if available.is_empty() {
                        continue;
                    }
                    available[rng.range_usize(0, available.len() - 1)]
                }
                CornerPlacement::Opposite => {
                    if let Some(&last) = used_corners.last() {
                        match last {
                            0 => 3,
                            1 => 2,
                            2 => 1,
                            _ => 0,
                        }
                    } else {
                        rng.range_usize(0, 3)
                    }
                }
            };

            let (bw, bh) = zone_cfg.block_size;
            let (base_x, base_z) = match corner {
                0 => (0i32, 0i32),
                1 => (width - bw, 0),
                2 => (0, height - bh),
                _ => (width - bw, height - bh),
            };

            for dx in 0..bw {
                for dz in 0..bh {
                    let x = (base_x + dx).clamp(0, width - 1) as usize;
                    let z = (base_z + dz).clamp(0, height - 1) as usize;
                    zones[x][z] = Zone::from_name(&zone_cfg.name);
                }
            }

            used_corners.push(corner);
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
            self.zones[x as usize][z as usize].clone()
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

    // --- New template tests ---

    #[test]
    fn medieval_has_castle_center() {
        let config = crate::template_config::medieval_village_config();
        let mut rng = SeededRng::new(42);
        let grid = CityGrid::generate_from_config(10, 10, 50.0, &config, &mut rng);
        assert_eq!(grid.zone_at(4, 4), Zone::Custom("castle".into()));
        assert_eq!(grid.zone_at(5, 5), Zone::Custom("castle".into()));
    }

    #[test]
    fn medieval_has_market_ring() {
        let config = crate::template_config::medieval_village_config();
        let mut rng = SeededRng::new(42);
        let grid = CityGrid::generate_from_config(10, 10, 50.0, &config, &mut rng);
        assert_eq!(grid.zone_at(3, 3), Zone::Custom("market".into()));
    }

    #[test]
    fn medieval_has_farm_corner() {
        let config = crate::template_config::medieval_village_config();
        let mut rng = SeededRng::new(42);
        let grid = CityGrid::generate_from_config(10, 10, 50.0, &config, &mut rng);
        let counts = grid.zone_counts();
        assert!(counts.get("farm").copied().unwrap_or(0) >= 4);
    }

    #[test]
    fn zombieland_mostly_ruin() {
        let config = crate::template_config::zombieland_config();
        let mut rng = SeededRng::new(42);
        let grid = CityGrid::generate_from_config(10, 10, 50.0, &config, &mut rng);
        let counts = grid.zone_counts();
        let ruin = counts.get("ruin").copied().unwrap_or(0);
        assert!(ruin > 80, "Expected >80 ruin chunks in 10x10, got {}", ruin);
    }

    #[test]
    fn space_station_has_command_center() {
        let config = crate::template_config::space_station_config();
        let mut rng = SeededRng::new(42);
        let grid = CityGrid::generate_from_config(10, 10, 50.0, &config, &mut rng);
        assert_eq!(grid.zone_at(4, 4), Zone::Custom("command".into()));
    }

    #[test]
    fn space_station_has_hangar_corner() {
        let config = crate::template_config::space_station_config();
        let mut rng = SeededRng::new(42);
        let grid = CityGrid::generate_from_config(10, 10, 50.0, &config, &mut rng);
        let counts = grid.zone_counts();
        // Hangar is 3x3 = 9 chunks
        assert!(counts.get("hangar").copied().unwrap_or(0) >= 9);
    }

    #[test]
    fn config_grid_deterministic() {
        let config = crate::template_config::medieval_village_config();
        let mut rng1 = SeededRng::new(77);
        let mut rng2 = SeededRng::new(77);
        let g1 = CityGrid::generate_from_config(8, 8, 50.0, &config, &mut rng1);
        let g2 = CityGrid::generate_from_config(8, 8, 50.0, &config, &mut rng2);
        for x in 0..8 {
            for z in 0..8 {
                assert_eq!(g1.zone_at(x, z), g2.zone_at(x, z));
            }
        }
    }
}
