//! World manifest — the complete output of the world compiler.
//!
//! The JS world-client reads this JSON and spawns every asset in the scene.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Complete world build output.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldManifest {
    pub template: String,
    pub seed: u64,
    /// Total world dimensions [width_x, depth_z] in engine units.
    pub world_size: [f32; 2],
    /// Size of each chunk in engine units.
    pub chunk_size: f32,
    /// All chunks with their zone and placed assets.
    pub chunks: Vec<ChunkManifest>,
    /// Road network segments.
    pub roads: Vec<RoadPlacement>,
    /// Intersection pieces.
    pub intersections: Vec<IntersectionPlacement>,
    /// Player spawn point.
    pub spawn: SpawnPoint,
    /// Build statistics.
    pub stats: WorldStats,
}

/// One chunk of the world grid.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkManifest {
    pub id: String,
    pub grid_x: i32,
    pub grid_z: i32,
    pub zone: String,
    pub bounds_min: [f32; 2],
    pub bounds_max: [f32; 2],
    pub placements: Vec<Placement>,
}

/// A single asset placement in the world.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Placement {
    /// Asset ID from the catalog (e.g. "kenney_city/building-skyscraper-a").
    pub asset_id: String,
    /// World-space position [x, y, z]. Y is up.
    pub position: [f32; 3],
    /// Y-axis rotation in degrees.
    pub rotation: f32,
    /// Uniform scale factor.
    pub scale: f32,
    /// Category for debug/filtering.
    pub category: String,
}

/// A road segment placement.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoadPlacement {
    pub asset_id: String,
    pub position: [f32; 3],
    pub rotation: f32,
    pub scale: f32,
    /// "major" or "minor"
    pub road_type: String,
}

/// An intersection placement.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntersectionPlacement {
    pub asset_id: String,
    pub position: [f32; 3],
    pub rotation: f32,
    pub scale: f32,
    /// "4way", "3way", "deadend"
    pub intersection_type: String,
}

/// Player spawn location.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpawnPoint {
    pub position: [f32; 3],
    pub rotation: f32,
}

/// Build statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldStats {
    pub total_assets: usize,
    pub chunk_count: usize,
    pub road_segments: usize,
    pub intersection_count: usize,
    pub zone_breakdown: HashMap<String, usize>,
}
