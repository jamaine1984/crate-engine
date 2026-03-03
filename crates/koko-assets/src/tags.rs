//! Asset tag taxonomy for world generation.
//!
//! Tags describe HOW and WHERE assets are placed by the world compiler.
//! This is separate from AssetMetadata (which describes physics/rendering).
//! The world compiler queries by tags to find assets for each placement slot.

use serde::{Deserialize, Serialize};

/// Full tag set for a world-placeable asset.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetTags {
    /// Asset file identifier (matches catalog key, e.g. "kenney_city/building-a")
    pub id: String,

    /// Primary placement category
    pub category: PlacementCategory,

    /// More specific subcategory
    pub subcategory: String,

    /// Which district zones this asset can appear in
    pub zones: Vec<Zone>,

    /// Architectural/theme style
    pub style: Style,

    /// How this asset is placed relative to its surroundings
    pub placement: PlacementRule,

    /// Approximate footprint in meters (width_x, depth_z)
    pub footprint: [f32; 2],

    /// Approximate height in meters
    pub height: f32,

    /// Snap rules: what this asset attaches to
    pub snap: SnapRule,

    /// Whether multiple variants exist (pick randomly)
    pub variant_group: Option<String>,

    /// LOD group ID (for distance-based swapping)
    pub lod_group: Option<String>,

    /// Density hint: max count per 50x50m chunk (0 = unlimited)
    pub max_per_chunk: u32,

    /// Tags for freeform search (e.g. ["glass", "tall", "commercial"])
    pub search_tags: Vec<String>,
}

/// Primary placement categories.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlacementCategory {
    /// Buildings: houses, offices, skyscrapers, shops, warehouses
    Building,
    /// Road pieces: straight, curve, intersection, ramp
    Road,
    /// Sidewalks, paths, driveways
    Walkway,
    /// Traffic control: stop signs, traffic lights, crosswalks
    TrafficControl,
    /// Street furniture: streetlights, benches, hydrants, mailboxes, trash cans
    StreetFurniture,
    /// Fences, walls, barriers
    Barrier,
    /// Vehicles: cars, trucks, emergency, service
    Vehicle,
    /// Vegetation: trees, bushes, planters, hedges
    Vegetation,
    /// Characters/NPCs
    Character,
    /// Decorative props: barrels, crates, signs, awnings
    Prop,
    /// Water features: pools, fountains
    WaterFeature,
    /// Terrain modifiers
    Terrain,
}

/// District zones where assets can appear.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Zone {
    Downtown,
    Commercial,
    Suburbs,
    Industrial,
    Park,
    Highway,
    Any,
}

/// Theme/style tags.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Style {
    Modern,
    Medieval,
    Fantasy,
    SciFi,
    Western,
    Tropical,
    Desert,
    Industrial,
    Any,
}

/// How the asset is placed in the world.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlacementRule {
    /// Placed on ground, parallel to terrain
    Ground,
    /// Placed along a road edge
    RoadEdge,
    /// Placed on a sidewalk
    Sidewalk,
    /// Placed at a road intersection
    Intersection,
    /// Placed on a road surface (drives on it)
    OnRoad,
    /// Placed on a lot/parcel (building footprint)
    OnLot,
    /// Placed along a fence line
    FenceLine,
    /// Placed in a yard/garden
    Yard,
    /// Floats in water
    Water,
    /// Overhead/sky
    Sky,
}

/// What the asset snaps/aligns to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SnapRule {
    /// No snapping, free placement on ground
    Ground,
    /// Snap to road edge (align rotation with road direction)
    RoadEdge,
    /// Snap to sidewalk edge
    SidewalkEdge,
    /// Snap to intersection center
    IntersectionCenter,
    /// Snap to building wall
    BuildingWall,
    /// Snap to lot boundary
    LotBoundary,
    /// Snap to fence posts
    FencePost,
    /// Snap to road surface (vehicles)
    RoadSurface,
    /// No snap required
    None,
}

impl AssetTags {
    /// Check if this asset fits a given zone.
    pub fn fits_zone(&self, zone: Zone) -> bool {
        self.zones.contains(&Zone::Any) || self.zones.contains(&zone)
    }

    /// Check if this asset matches a search query.
    pub fn matches_query(&self, query: &str) -> bool {
        let q = query.to_lowercase();
        self.id.to_lowercase().contains(&q)
            || self.subcategory.to_lowercase().contains(&q)
            || self.search_tags.iter().any(|t| t.to_lowercase().contains(&q))
    }
}

/// Query filter for searching the asset index.
#[derive(Debug, Clone, Default)]
pub struct AssetQuery {
    pub category: Option<PlacementCategory>,
    pub zone: Option<Zone>,
    pub style: Option<Style>,
    pub placement: Option<PlacementRule>,
    pub subcategory: Option<String>,
    pub search: Option<String>,
    pub max_height: Option<f32>,
    pub min_height: Option<f32>,
}

impl AssetQuery {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn category(mut self, cat: PlacementCategory) -> Self {
        self.category = Some(cat);
        self
    }

    pub fn zone(mut self, zone: Zone) -> Self {
        self.zone = Some(zone);
        self
    }

    pub fn style(mut self, style: Style) -> Self {
        self.style = Some(style);
        self
    }

    pub fn placement(mut self, rule: PlacementRule) -> Self {
        self.placement = Some(rule);
        self
    }

    pub fn subcategory(mut self, sub: &str) -> Self {
        self.subcategory = Some(sub.to_string());
        self
    }

    pub fn height_range(mut self, min: f32, max: f32) -> Self {
        self.min_height = Some(min);
        self.max_height = Some(max);
        self
    }

    pub fn search(mut self, query: &str) -> Self {
        self.search = Some(query.to_string());
        self
    }

    /// Test if an asset matches this query.
    pub fn matches(&self, tags: &AssetTags) -> bool {
        if let Some(cat) = self.category {
            if tags.category != cat {
                return false;
            }
        }
        if let Some(zone) = self.zone {
            if !tags.fits_zone(zone) {
                return false;
            }
        }
        if let Some(style) = self.style {
            if tags.style != Style::Any && tags.style != style {
                return false;
            }
        }
        if let Some(rule) = self.placement {
            if tags.placement != rule {
                return false;
            }
        }
        if let Some(ref sub) = self.subcategory {
            if !tags.subcategory.to_lowercase().contains(&sub.to_lowercase()) {
                return false;
            }
        }
        if let Some(min) = self.min_height {
            if tags.height < min {
                return false;
            }
        }
        if let Some(max) = self.max_height {
            if tags.height > max {
                return false;
            }
        }
        if let Some(ref q) = self.search {
            if !tags.matches_query(q) {
                return false;
            }
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_building() -> AssetTags {
        AssetTags {
            id: "kenney_city/building-skyscraper-a".into(),
            category: PlacementCategory::Building,
            subcategory: "skyscraper".into(),
            zones: vec![Zone::Downtown],
            style: Style::Modern,
            placement: PlacementRule::OnLot,
            footprint: [12.0, 12.0],
            height: 40.0,
            snap: SnapRule::LotBoundary,
            variant_group: Some("skyscraper".into()),
            lod_group: Some("kenney_city_skyscraper".into()),
            max_per_chunk: 2,
            search_tags: vec!["glass".into(), "tall".into(), "office".into()],
        }
    }

    fn make_streetlight() -> AssetTags {
        AssetTags {
            id: "street_pack_streetlight_single".into(),
            category: PlacementCategory::StreetFurniture,
            subcategory: "streetlight".into(),
            zones: vec![Zone::Any],
            style: Style::Modern,
            placement: PlacementRule::Sidewalk,
            footprint: [0.5, 0.5],
            height: 5.0,
            snap: SnapRule::SidewalkEdge,
            variant_group: Some("streetlight".into()),
            lod_group: None,
            max_per_chunk: 8,
            search_tags: vec!["light".into(), "lamp".into(), "street".into()],
        }
    }

    #[test]
    fn building_fits_downtown() {
        let b = make_building();
        assert!(b.fits_zone(Zone::Downtown));
        assert!(!b.fits_zone(Zone::Suburbs));
    }

    #[test]
    fn any_zone_fits_everything() {
        let sl = make_streetlight();
        assert!(sl.fits_zone(Zone::Downtown));
        assert!(sl.fits_zone(Zone::Suburbs));
        assert!(sl.fits_zone(Zone::Industrial));
    }

    #[test]
    fn query_by_category_and_zone() {
        let b = make_building();
        let q = AssetQuery::new()
            .category(PlacementCategory::Building)
            .zone(Zone::Downtown);
        assert!(q.matches(&b));

        let q2 = AssetQuery::new()
            .category(PlacementCategory::Building)
            .zone(Zone::Suburbs);
        assert!(!q2.matches(&b));
    }

    #[test]
    fn query_by_height_range() {
        let b = make_building();
        let q = AssetQuery::new().height_range(20.0, 60.0);
        assert!(q.matches(&b));

        let q2 = AssetQuery::new().height_range(50.0, 100.0);
        assert!(!q2.matches(&b));
    }

    #[test]
    fn query_by_search() {
        let b = make_building();
        let q = AssetQuery::new().search("glass");
        assert!(q.matches(&b));

        let q2 = AssetQuery::new().search("medieval");
        assert!(!q2.matches(&b));
    }

    #[test]
    fn combined_query() {
        let sl = make_streetlight();
        let q = AssetQuery::new()
            .category(PlacementCategory::StreetFurniture)
            .zone(Zone::Downtown)
            .style(Style::Modern)
            .placement(PlacementRule::Sidewalk);
        assert!(q.matches(&sl));
    }

    #[test]
    fn json_roundtrip() {
        let b = make_building();
        let json = serde_json::to_string_pretty(&b).unwrap();
        let back: AssetTags = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, b.id);
        assert_eq!(back.category, PlacementCategory::Building);
        assert_eq!(back.zones, vec![Zone::Downtown]);
    }
}
