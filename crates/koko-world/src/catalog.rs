//! Asset catalog — queryable collection of available assets.
//!
//! The catalog is populated from the JS asset-index.mjs data,
//! serialized as JSON and passed into the world compiler.

use crate::rng::SeededRng;
use serde::{Deserialize, Serialize};

/// A single asset entry from the catalog.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetEntry {
    pub id: String,
    pub category: String,
    pub subcategory: String,
    pub zones: Vec<String>,
    pub style: String,
    pub placement: String,
    pub footprint: [f32; 2],
    pub height: f32,
    pub snap: String,
    #[serde(default)]
    pub variant_group: Option<String>,
    #[serde(default)]
    pub max_per_chunk: u32,
}

/// Queryable asset catalog.
pub struct AssetCatalog {
    entries: Vec<AssetEntry>,
}

impl AssetCatalog {
    pub fn new(entries: Vec<AssetEntry>) -> Self {
        Self { entries }
    }

    /// Find all assets matching the given filters.
    /// Empty/None filters are wildcards (match anything).
    pub fn query(&self, filter: &AssetFilter) -> Vec<&AssetEntry> {
        self.entries
            .iter()
            .filter(|e| {
                if let Some(ref cat) = filter.category {
                    if e.category != *cat {
                        return false;
                    }
                }
                if let Some(ref zone) = filter.zone {
                    if !e.zones.contains(&"any".to_string()) && !e.zones.contains(zone) {
                        return false;
                    }
                }
                if let Some(ref style) = filter.style {
                    if e.style != "any" && e.style != *style {
                        return false;
                    }
                }
                if let Some(ref sub) = filter.subcategory {
                    if !e.subcategory.to_lowercase().contains(&sub.to_lowercase()) {
                        return false;
                    }
                }
                if let Some(ref placement) = filter.placement {
                    if e.placement != *placement {
                        return false;
                    }
                }
                if let Some(min_h) = filter.min_height {
                    if e.height < min_h {
                        return false;
                    }
                }
                if let Some(max_h) = filter.max_height {
                    if e.height > max_h {
                        return false;
                    }
                }
                true
            })
            .collect()
    }

    /// Pick a random asset matching the filter using the seeded RNG.
    /// Returns None if no assets match.
    pub fn pick(&self, filter: &AssetFilter, rng: &mut SeededRng) -> Option<&AssetEntry> {
        let matches = self.query(filter);
        if matches.is_empty() {
            return None;
        }
        Some(matches[rng.range_usize(0, matches.len() - 1)])
    }

    /// Pick a random asset from a specific variant group.
    pub fn pick_variant(&self, group: &str, rng: &mut SeededRng) -> Option<&AssetEntry> {
        let matches: Vec<_> = self
            .entries
            .iter()
            .filter(|e| e.variant_group.as_deref() == Some(group))
            .collect();
        if matches.is_empty() {
            return None;
        }
        Some(matches[rng.range_usize(0, matches.len() - 1)])
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

/// Filter criteria for asset queries.
#[derive(Debug, Clone, Default)]
pub struct AssetFilter {
    pub category: Option<String>,
    pub zone: Option<String>,
    pub style: Option<String>,
    pub subcategory: Option<String>,
    pub placement: Option<String>,
    pub min_height: Option<f32>,
    pub max_height: Option<f32>,
}

impl AssetFilter {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn category(mut self, cat: &str) -> Self {
        self.category = Some(cat.to_string());
        self
    }

    pub fn zone(mut self, zone: &str) -> Self {
        self.zone = Some(zone.to_string());
        self
    }

    pub fn style(mut self, style: &str) -> Self {
        self.style = Some(style.to_string());
        self
    }

    pub fn subcategory(mut self, sub: &str) -> Self {
        self.subcategory = Some(sub.to_string());
        self
    }

    pub fn placement(mut self, p: &str) -> Self {
        self.placement = Some(p.to_string());
        self
    }

    pub fn height_range(mut self, min: f32, max: f32) -> Self {
        self.min_height = Some(min);
        self.max_height = Some(max);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_catalog() -> AssetCatalog {
        AssetCatalog::new(vec![
            AssetEntry {
                id: "building-a".into(),
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
                id: "streetlight-a".into(),
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
        ])
    }

    #[test]
    fn query_by_category() {
        let catalog = test_catalog();
        let results = catalog.query(&AssetFilter::new().category("building"));
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn query_by_category_and_zone() {
        let catalog = test_catalog();
        let results = catalog.query(
            &AssetFilter::new()
                .category("building")
                .zone("downtown"),
        );
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "building-a");
    }

    #[test]
    fn any_zone_matches_everything() {
        let catalog = test_catalog();
        let results = catalog.query(
            &AssetFilter::new()
                .category("street_furniture")
                .zone("downtown"),
        );
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "streetlight-a");
    }

    #[test]
    fn height_filter() {
        let catalog = test_catalog();
        let results = catalog.query(
            &AssetFilter::new()
                .category("building")
                .height_range(20.0, 60.0),
        );
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "building-a");
    }

    #[test]
    fn pick_deterministic() {
        let catalog = test_catalog();
        let mut rng1 = SeededRng::new(42);
        let mut rng2 = SeededRng::new(42);
        let filter = AssetFilter::new().category("building");
        let a = catalog.pick(&filter, &mut rng1).unwrap();
        let b = catalog.pick(&filter, &mut rng2).unwrap();
        assert_eq!(a.id, b.id);
    }
}
