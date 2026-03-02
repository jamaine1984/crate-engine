//! Scene data structures for save/load serialization.

use serde::{Deserialize, Serialize};

/// A complete scene snapshot that can be saved and loaded.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SceneData {
    /// Scene format version for forward compatibility.
    pub version: u32,
    /// Human-readable scene name.
    pub name: String,
    /// Template used to generate the world (e.g. "CITY_MODERN").
    pub template: String,
    /// RNG seed used for world generation.
    pub seed: u64,
    /// World size preset.
    pub size: String,
    /// Environment settings (lighting, fog, sky).
    pub environment: SceneEnvironment,
    /// All placed objects in the scene.
    pub objects: Vec<SceneObject>,
}

impl SceneData {
    pub const CURRENT_VERSION: u32 = 1;

    pub fn new(name: &str, template: &str, seed: u64, size: &str) -> Self {
        Self {
            version: Self::CURRENT_VERSION,
            name: name.to_string(),
            template: template.to_string(),
            seed,
            size: size.to_string(),
            environment: SceneEnvironment::default(),
            objects: Vec::new(),
        }
    }
}

/// A single object placed in the scene.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SceneObject {
    /// Unique object ID within the scene.
    pub id: String,
    /// Asset ID from the catalog (e.g. "building_a").
    pub asset_id: String,
    /// Category (e.g. "building", "vehicle", "vegetation").
    pub category: String,
    /// Position [x, y, z].
    pub position: [f32; 3],
    /// Rotation as euler angles [pitch, yaw, roll] in radians.
    pub rotation: [f32; 3],
    /// Scale [x, y, z].
    pub scale: [f32; 3],
    /// Optional chunk ID this object belongs to.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chunk_id: Option<String>,
    /// Optional zone this object is in.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub zone: Option<String>,
    /// Whether the object is visible.
    #[serde(default = "default_true")]
    pub visible: bool,
}

fn default_true() -> bool {
    true
}

impl SceneObject {
    pub fn new(id: &str, asset_id: &str, category: &str, position: [f32; 3]) -> Self {
        Self {
            id: id.to_string(),
            asset_id: asset_id.to_string(),
            category: category.to_string(),
            position,
            rotation: [0.0; 3],
            scale: [1.0; 3],
            chunk_id: None,
            zone: None,
            visible: true,
        }
    }
}

/// Environment settings for the scene.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SceneEnvironment {
    /// Ambient light color [r, g, b, a].
    pub ambient_color: [f32; 4],
    /// Ambient light intensity.
    pub ambient_intensity: f32,
    /// Directional (sun) light color [r, g, b, a].
    pub sun_color: [f32; 4],
    /// Sun light intensity.
    pub sun_intensity: f32,
    /// Sun direction [x, y, z] (normalized).
    pub sun_direction: [f32; 3],
    /// Whether fog is enabled.
    pub fog_enabled: bool,
    /// Fog color [r, g, b, a].
    pub fog_color: [f32; 4],
    /// Fog density (0.0 to 1.0).
    pub fog_density: f32,
    /// Sky color [r, g, b, a].
    pub sky_color: [f32; 4],
}

impl Default for SceneEnvironment {
    fn default() -> Self {
        Self {
            ambient_color: [1.0, 1.0, 1.0, 1.0],
            ambient_intensity: 0.3,
            sun_color: [1.0, 0.95, 0.9, 1.0],
            sun_intensity: 1.0,
            sun_direction: [0.5, -1.0, 0.3],
            fog_enabled: false,
            fog_color: [0.7, 0.7, 0.8, 1.0],
            fog_density: 0.0,
            sky_color: [0.529, 0.808, 0.922, 1.0],
        }
    }
}
