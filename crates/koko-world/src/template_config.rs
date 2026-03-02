//! Template configuration — defines per-template parameters for the world compiler.
//!
//! Each template is a configuration, NOT separate code. The same pipeline
//! (grid → roads → placer) runs for every template using these parameters.

use std::collections::HashMap;

/// Complete template configuration — parameterizes the entire compilation pipeline.
#[derive(Debug, Clone)]
pub struct TemplateConfig {
    pub name: String,
    /// Asset style filter: "modern", "medieval", "zombie", "space"
    pub style: String,
    /// Zone definitions
    pub zones: Vec<ZoneConfig>,
    /// How zones are laid out on the grid
    pub zone_layout: ZoneLayout,
    /// Road generation strategy
    pub road_style: RoadStyle,
    /// Road density: 1.0 = every grid line, 0.5 = half, etc.
    pub road_density: f32,
    /// Which zone the player spawns in
    pub spawn_zone: String,
    /// Per-zone placement rules
    pub zone_rules: HashMap<String, ZonePlacementRule>,
    /// Road subcategory for straight pieces (e.g. "straight" for modern, "path" for medieval)
    pub road_subcategory: String,
    /// Intersection subcategory prefix
    pub intersection_subcategory: String,
}

/// Configuration for a single zone type.
#[derive(Debug, Clone)]
pub struct ZoneConfig {
    pub name: String,
    /// Ring order from center (0 = innermost). None = special placement.
    pub ring_order: Option<u32>,
    /// Max Chebyshev distance for this ring. Infinity (f32::MAX) = fills remaining.
    pub ring_radius: f32,
    /// For zones placed in a corner rather than a ring.
    pub corner_placement: Option<CornerPlacement>,
    /// Grid block size for corner-placed zones.
    pub block_size: (i32, i32),
}

/// How zones map onto the grid.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ZoneLayout {
    /// CITY_MODERN: downtown → commercial → suburbs with corner overrides
    ConcentricRings,
    /// MEDIEVAL: castle center → market ring → cottage → farm corner
    CentralKeep,
    /// ZOMBIELAND: default fill + scattered POI blocks
    ScatteredPOI,
    /// SPACE_STATION: uniform modules with quadrant-based zones
    ModularGrid,
}

/// Road generation strategy.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RoadStyle {
    /// CITY_MODERN: full urban grid on every chunk boundary
    UrbanGrid,
    /// MEDIEVAL: organic dirt paths connecting zone centers
    OrganicPaths,
    /// ZOMBIELAND: urban grid with random segments removed
    DamagedGrid,
    /// SPACE_STATION: corridors only on major grid lines
    Corridors,
}

/// Corner placement options for special zones (park, industrial, farm, hangar).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CornerPlacement {
    /// Random corner
    Random,
    /// Opposite corner from the other special zone
    Opposite,
}

/// Per-zone asset placement rules.
#[derive(Debug, Clone)]
pub struct ZonePlacementRule {
    /// (min, max) buildings per chunk
    pub building_count: (usize, usize),
    /// Spacing between street furniture items
    pub furniture_spacing: f32,
    /// (min, max) vegetation items per chunk
    pub vegetation_density: (usize, usize),
    /// (min, max) vehicles per chunk
    pub vehicle_count: (usize, usize),
    /// (min, max) characters per chunk
    pub character_count: (usize, usize),
}

// ============================================================================
// Factory functions — one per template
// ============================================================================

/// CITY_MODERN — the original GTA-style city.
pub fn city_modern_config() -> TemplateConfig {
    let mut zone_rules = HashMap::new();
    zone_rules.insert("downtown".into(), ZonePlacementRule {
        building_count: (1, 2), furniture_spacing: 20.0,
        vegetation_density: (0, 1), vehicle_count: (3, 6), character_count: (2, 5),
    });
    zone_rules.insert("commercial".into(), ZonePlacementRule {
        building_count: (2, 4), furniture_spacing: 20.0,
        vegetation_density: (1, 3), vehicle_count: (2, 4), character_count: (1, 3),
    });
    zone_rules.insert("suburbs".into(), ZonePlacementRule {
        building_count: (3, 6), furniture_spacing: 30.0,
        vegetation_density: (2, 5), vehicle_count: (1, 2), character_count: (0, 2),
    });
    zone_rules.insert("industrial".into(), ZonePlacementRule {
        building_count: (1, 3), furniture_spacing: 25.0,
        vegetation_density: (0, 1), vehicle_count: (2, 4), character_count: (0, 1),
    });
    zone_rules.insert("park".into(), ZonePlacementRule {
        building_count: (0, 0), furniture_spacing: 15.0,
        vegetation_density: (8, 15), vehicle_count: (0, 1), character_count: (1, 4),
    });

    TemplateConfig {
        name: "CITY_MODERN".into(),
        style: "modern".into(),
        zones: vec![
            ZoneConfig { name: "downtown".into(), ring_order: Some(0), ring_radius: 1.0, corner_placement: None, block_size: (2, 2) },
            ZoneConfig { name: "commercial".into(), ring_order: Some(1), ring_radius: 2.5, corner_placement: None, block_size: (2, 2) },
            ZoneConfig { name: "suburbs".into(), ring_order: Some(2), ring_radius: f32::MAX, corner_placement: None, block_size: (2, 2) },
            ZoneConfig { name: "park".into(), ring_order: None, ring_radius: 0.0, corner_placement: Some(CornerPlacement::Random), block_size: (2, 2) },
            ZoneConfig { name: "industrial".into(), ring_order: None, ring_radius: 0.0, corner_placement: Some(CornerPlacement::Opposite), block_size: (2, 2) },
        ],
        zone_layout: ZoneLayout::ConcentricRings,
        road_style: RoadStyle::UrbanGrid,
        road_density: 1.0,
        spawn_zone: "downtown".into(),
        zone_rules,
        road_subcategory: "straight".into(),
        intersection_subcategory: "4way".into(),
    }
}

/// MEDIEVAL_VILLAGE — castle, market, cottages, farms.
pub fn medieval_village_config() -> TemplateConfig {
    let mut zone_rules = HashMap::new();
    zone_rules.insert("castle".into(), ZonePlacementRule {
        building_count: (1, 2), furniture_spacing: 15.0,
        vegetation_density: (0, 2), vehicle_count: (0, 0), character_count: (1, 3),
    });
    zone_rules.insert("market".into(), ZonePlacementRule {
        building_count: (2, 4), furniture_spacing: 10.0,
        vegetation_density: (1, 2), vehicle_count: (0, 1), character_count: (2, 5),
    });
    zone_rules.insert("cottage".into(), ZonePlacementRule {
        building_count: (2, 5), furniture_spacing: 20.0,
        vegetation_density: (3, 6), vehicle_count: (0, 1), character_count: (1, 3),
    });
    zone_rules.insert("farm".into(), ZonePlacementRule {
        building_count: (1, 2), furniture_spacing: 25.0,
        vegetation_density: (4, 8), vehicle_count: (0, 1), character_count: (0, 2),
    });

    TemplateConfig {
        name: "MEDIEVAL_VILLAGE".into(),
        style: "medieval".into(),
        zones: vec![
            ZoneConfig { name: "castle".into(), ring_order: Some(0), ring_radius: 1.0, corner_placement: None, block_size: (2, 2) },
            ZoneConfig { name: "market".into(), ring_order: Some(1), ring_radius: 2.0, corner_placement: None, block_size: (2, 2) },
            ZoneConfig { name: "cottage".into(), ring_order: Some(2), ring_radius: f32::MAX, corner_placement: None, block_size: (2, 2) },
            ZoneConfig { name: "farm".into(), ring_order: None, ring_radius: 0.0, corner_placement: Some(CornerPlacement::Random), block_size: (2, 2) },
        ],
        zone_layout: ZoneLayout::CentralKeep,
        road_style: RoadStyle::OrganicPaths,
        road_density: 0.4,
        spawn_zone: "market".into(),
        zone_rules,
        road_subcategory: "path".into(),
        intersection_subcategory: "path_square".into(),
    }
}

/// ZOMBIELAND — ruined city with survival POIs.
pub fn zombieland_config() -> TemplateConfig {
    let mut zone_rules = HashMap::new();
    zone_rules.insert("ruin".into(), ZonePlacementRule {
        building_count: (1, 3), furniture_spacing: 25.0,
        vegetation_density: (2, 4), vehicle_count: (1, 3), character_count: (0, 1),
    });
    zone_rules.insert("barricade".into(), ZonePlacementRule {
        building_count: (0, 1), furniture_spacing: 10.0,
        vegetation_density: (1, 2), vehicle_count: (0, 1), character_count: (0, 2),
    });
    zone_rules.insert("safe_zone".into(), ZonePlacementRule {
        building_count: (1, 2), furniture_spacing: 10.0,
        vegetation_density: (1, 3), vehicle_count: (0, 1), character_count: (1, 3),
    });
    zone_rules.insert("evac_point".into(), ZonePlacementRule {
        building_count: (0, 0), furniture_spacing: 15.0,
        vegetation_density: (0, 1), vehicle_count: (1, 2), character_count: (0, 1),
    });

    TemplateConfig {
        name: "ZOMBIELAND".into(),
        style: "zombie".into(),
        zones: vec![
            ZoneConfig { name: "ruin".into(), ring_order: Some(0), ring_radius: f32::MAX, corner_placement: None, block_size: (2, 2) },
            ZoneConfig { name: "barricade".into(), ring_order: None, ring_radius: 0.0, corner_placement: Some(CornerPlacement::Random), block_size: (2, 2) },
            ZoneConfig { name: "safe_zone".into(), ring_order: None, ring_radius: 0.0, corner_placement: Some(CornerPlacement::Opposite), block_size: (2, 2) },
            ZoneConfig { name: "evac_point".into(), ring_order: None, ring_radius: 0.0, corner_placement: Some(CornerPlacement::Random), block_size: (1, 1) },
        ],
        zone_layout: ZoneLayout::ScatteredPOI,
        road_style: RoadStyle::DamagedGrid,
        road_density: 0.6,
        spawn_zone: "safe_zone".into(),
        zone_rules,
        road_subcategory: "straight".into(),
        intersection_subcategory: "4way".into(),
    }
}

/// SPACE_STATION — modular base with command, labs, hangars, quarters.
pub fn space_station_config() -> TemplateConfig {
    let mut zone_rules = HashMap::new();
    zone_rules.insert("command".into(), ZonePlacementRule {
        building_count: (1, 2), furniture_spacing: 12.0,
        vegetation_density: (0, 1), vehicle_count: (0, 1), character_count: (1, 3),
    });
    zone_rules.insert("lab".into(), ZonePlacementRule {
        building_count: (1, 3), furniture_spacing: 15.0,
        vegetation_density: (1, 3), vehicle_count: (0, 0), character_count: (0, 2),
    });
    zone_rules.insert("quarters".into(), ZonePlacementRule {
        building_count: (2, 4), furniture_spacing: 15.0,
        vegetation_density: (2, 4), vehicle_count: (0, 0), character_count: (1, 3),
    });
    zone_rules.insert("hangar".into(), ZonePlacementRule {
        building_count: (0, 1), furniture_spacing: 20.0,
        vegetation_density: (0, 1), vehicle_count: (1, 3), character_count: (0, 1),
    });

    TemplateConfig {
        name: "SPACE_STATION".into(),
        style: "space".into(),
        zones: vec![
            ZoneConfig { name: "command".into(), ring_order: Some(0), ring_radius: 1.5, corner_placement: None, block_size: (2, 2) },
            ZoneConfig { name: "lab".into(), ring_order: Some(1), ring_radius: 3.0, corner_placement: None, block_size: (2, 2) },
            ZoneConfig { name: "quarters".into(), ring_order: Some(2), ring_radius: f32::MAX, corner_placement: None, block_size: (2, 2) },
            ZoneConfig { name: "hangar".into(), ring_order: None, ring_radius: 0.0, corner_placement: Some(CornerPlacement::Random), block_size: (3, 3) },
        ],
        zone_layout: ZoneLayout::ModularGrid,
        road_style: RoadStyle::Corridors,
        road_density: 0.5,
        spawn_zone: "command".into(),
        zone_rules,
        road_subcategory: "connector".into(),
        intersection_subcategory: "connector".into(),
    }
}

/// TROPICAL_ISLAND — beach ring, village, jungle interior, volcano corner.
pub fn tropical_island_config() -> TemplateConfig {
    let mut zone_rules = HashMap::new();
    zone_rules.insert("beach".into(), ZonePlacementRule {
        building_count: (0, 1), furniture_spacing: 25.0,
        vegetation_density: (3, 6), vehicle_count: (0, 0), character_count: (1, 3),
    });
    zone_rules.insert("village".into(), ZonePlacementRule {
        building_count: (2, 4), furniture_spacing: 15.0,
        vegetation_density: (2, 4), vehicle_count: (0, 1), character_count: (2, 5),
    });
    zone_rules.insert("jungle".into(), ZonePlacementRule {
        building_count: (0, 0), furniture_spacing: 10.0,
        vegetation_density: (10, 20), vehicle_count: (0, 0), character_count: (0, 1),
    });
    zone_rules.insert("volcano".into(), ZonePlacementRule {
        building_count: (0, 0), furniture_spacing: 30.0,
        vegetation_density: (1, 3), vehicle_count: (0, 0), character_count: (0, 0),
    });

    TemplateConfig {
        name: "TROPICAL_ISLAND".into(),
        style: "tropical".into(),
        zones: vec![
            ZoneConfig { name: "beach".into(), ring_order: Some(0), ring_radius: 2.0, corner_placement: None, block_size: (2, 2) },
            ZoneConfig { name: "village".into(), ring_order: Some(1), ring_radius: 3.0, corner_placement: None, block_size: (2, 2) },
            ZoneConfig { name: "jungle".into(), ring_order: Some(2), ring_radius: f32::MAX, corner_placement: None, block_size: (2, 2) },
            ZoneConfig { name: "volcano".into(), ring_order: None, ring_radius: 0.0, corner_placement: Some(CornerPlacement::Random), block_size: (2, 2) },
        ],
        zone_layout: ZoneLayout::ConcentricRings,
        road_style: RoadStyle::OrganicPaths,
        road_density: 0.3,
        spawn_zone: "beach".into(),
        zone_rules,
        road_subcategory: "path".into(),
        intersection_subcategory: "path_square".into(),
    }
}

/// DESERT_OUTPOST — outpost center, bazaar ring, endless dunes, oasis corner.
pub fn desert_outpost_config() -> TemplateConfig {
    let mut zone_rules = HashMap::new();
    zone_rules.insert("outpost".into(), ZonePlacementRule {
        building_count: (1, 3), furniture_spacing: 12.0,
        vegetation_density: (0, 1), vehicle_count: (1, 2), character_count: (2, 4),
    });
    zone_rules.insert("bazaar".into(), ZonePlacementRule {
        building_count: (2, 5), furniture_spacing: 8.0,
        vegetation_density: (0, 2), vehicle_count: (0, 1), character_count: (3, 6),
    });
    zone_rules.insert("dunes".into(), ZonePlacementRule {
        building_count: (0, 0), furniture_spacing: 40.0,
        vegetation_density: (0, 2), vehicle_count: (0, 0), character_count: (0, 1),
    });
    zone_rules.insert("oasis".into(), ZonePlacementRule {
        building_count: (0, 1), furniture_spacing: 15.0,
        vegetation_density: (4, 8), vehicle_count: (0, 0), character_count: (1, 3),
    });

    TemplateConfig {
        name: "DESERT_OUTPOST".into(),
        style: "desert".into(),
        zones: vec![
            ZoneConfig { name: "outpost".into(), ring_order: Some(0), ring_radius: 1.5, corner_placement: None, block_size: (2, 2) },
            ZoneConfig { name: "bazaar".into(), ring_order: Some(1), ring_radius: 2.5, corner_placement: None, block_size: (2, 2) },
            ZoneConfig { name: "dunes".into(), ring_order: Some(2), ring_radius: f32::MAX, corner_placement: None, block_size: (2, 2) },
            ZoneConfig { name: "oasis".into(), ring_order: None, ring_radius: 0.0, corner_placement: Some(CornerPlacement::Random), block_size: (2, 2) },
        ],
        zone_layout: ZoneLayout::ConcentricRings,
        road_style: RoadStyle::OrganicPaths,
        road_density: 0.3,
        spawn_zone: "outpost".into(),
        zone_rules,
        road_subcategory: "path".into(),
        intersection_subcategory: "path_square".into(),
    }
}

/// Get template config by name.
pub fn get_template_config(name: &str) -> Result<TemplateConfig, String> {
    match name.to_uppercase().as_str() {
        "CITY_MODERN" => Ok(city_modern_config()),
        "MEDIEVAL_VILLAGE" => Ok(medieval_village_config()),
        "ZOMBIELAND" => Ok(zombieland_config()),
        "SPACE_STATION" => Ok(space_station_config()),
        "TROPICAL_ISLAND" => Ok(tropical_island_config()),
        "DESERT_OUTPOST" => Ok(desert_outpost_config()),
        other => Err(format!(
            "Unknown template: {}. Available: CITY_MODERN, MEDIEVAL_VILLAGE, ZOMBIELAND, SPACE_STATION, TROPICAL_ISLAND, DESERT_OUTPOST",
            other
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_configs_have_zone_rules() {
        for config in [
            city_modern_config(), medieval_village_config(), zombieland_config(),
            space_station_config(), tropical_island_config(), desert_outpost_config(),
        ] {
            for zone in &config.zones {
                assert!(
                    config.zone_rules.contains_key(&zone.name),
                    "Config {} missing zone rule for '{}'", config.name, zone.name
                );
            }
        }
    }

    #[test]
    fn city_modern_has_5_zones() {
        let cfg = city_modern_config();
        assert_eq!(cfg.zones.len(), 5);
        assert_eq!(cfg.style, "modern");
    }

    #[test]
    fn medieval_has_4_zones() {
        let cfg = medieval_village_config();
        assert_eq!(cfg.zones.len(), 4);
        assert_eq!(cfg.style, "medieval");
    }

    #[test]
    fn tropical_island_has_4_zones() {
        let cfg = tropical_island_config();
        assert_eq!(cfg.zones.len(), 4);
        assert_eq!(cfg.style, "tropical");
        assert_eq!(cfg.road_style, RoadStyle::OrganicPaths);
    }

    #[test]
    fn desert_outpost_has_4_zones() {
        let cfg = desert_outpost_config();
        assert_eq!(cfg.zones.len(), 4);
        assert_eq!(cfg.style, "desert");
        assert_eq!(cfg.spawn_zone, "outpost");
    }

    #[test]
    fn get_config_dispatches_correctly() {
        assert!(get_template_config("CITY_MODERN").is_ok());
        assert!(get_template_config("medieval_village").is_ok());
        assert!(get_template_config("ZOMBIELAND").is_ok());
        assert!(get_template_config("space_station").is_ok());
        assert!(get_template_config("TROPICAL_ISLAND").is_ok());
        assert!(get_template_config("DESERT_OUTPOST").is_ok());
        assert!(get_template_config("UNKNOWN").is_err());
    }
}
