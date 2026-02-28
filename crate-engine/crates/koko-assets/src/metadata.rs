//! Asset metadata — pivot, grounding, collider spec, sockets, bone naming

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Per-asset metadata stored as JSON sidecar
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetMetadata {
    pub id: String,
    pub display_name: String,
    pub category: AssetCategory,

    // Import corrections (applied once)
    #[serde(default = "default_quat")]
    pub import_rotation: [f32; 4],
    #[serde(default = "default_one")]
    pub import_scale: f32,

    // Pivot / grounding
    #[serde(default)]
    pub pivot_policy: PivotPolicy,
    #[serde(default)]
    pub foot_offset: f32,
    #[serde(default)]
    pub aabb_min: [f32; 3],
    #[serde(default)]
    pub aabb_max: [f32; 3],

    // Physics
    #[serde(default)]
    pub collider_type: ColliderSpec,
    pub collision_mesh_name: Option<String>,

    // Skeleton / sockets
    #[serde(default)]
    pub sockets: HashMap<String, SocketDef>,
    #[serde(default)]
    pub bone_naming: BoneNaming,

    // Flags
    #[serde(default)]
    pub is_static: bool,
    #[serde(default)]
    pub is_walkable: bool,
    #[serde(default)]
    pub is_climbable: bool,
}

fn default_quat() -> [f32; 4] { [0.0, 0.0, 0.0, 1.0] }
fn default_one() -> f32 { 1.0 }

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum AssetCategory {
    Character,
    NPC,
    Weapon,
    Building,
    Prop,
    Terrain,
    Vehicle,
    Projectile,
    VFX,
    Tree,
    Animal,
    Furniture,
    Food,
}

impl Default for AssetCategory {
    fn default() -> Self { Self::Prop }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum PivotPolicy {
    Feet,   // origin at bottom (characters, NPCs, furniture)
    Center, // origin at geometric center (weapons, projectiles)
}

impl Default for PivotPolicy {
    fn default() -> Self { Self::Feet }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ColliderSpec {
    Auto,
    ConvexHull,
    TriMesh,
    Capsule { radius: f32, half_height: f32 },
    Box { half_extents: [f32; 3] },
    Sphere { radius: f32 },
    None,
}

impl Default for ColliderSpec {
    fn default() -> Self { Self::Auto }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SocketDef {
    pub bone_name: String,
    #[serde(default)]
    pub offset_position: [f32; 3],
    #[serde(default = "default_quat")]
    pub offset_rotation: [f32; 4],
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum BoneNaming {
    KayKitDot,
    KayKitNoDot,
    Mixamo,
    Unknown,
}

impl Default for BoneNaming {
    fn default() -> Self { Self::Unknown }
}

impl AssetMetadata {
    /// Auto-detect category from file name heuristics
    pub fn auto_category_from_name(name: &str) -> AssetCategory {
        let lower = name.to_lowercase();
        if lower.contains("character") || lower.contains("knight") || lower.contains("soldier") {
            AssetCategory::Character
        } else if lower.contains("sword") || lower.contains("axe") || lower.contains("blaster") || lower.contains("bow") {
            AssetCategory::Weapon
        } else if lower.contains("house") || lower.contains("building") || lower.contains("castle") || lower.contains("wall") {
            AssetCategory::Building
        } else if lower.contains("tree") || lower.contains("bush") || lower.contains("grass") {
            AssetCategory::Tree
        } else if lower.contains("car") || lower.contains("boat") || lower.contains("vehicle") {
            AssetCategory::Vehicle
        } else {
            AssetCategory::Prop
        }
    }

    /// Compute grounded Y position for spawning
    pub fn grounded_y(&self, ground_height: f32) -> f32 {
        match self.pivot_policy {
            PivotPolicy::Feet => ground_height + self.foot_offset,
            PivotPolicy::Center => {
                let half_h = (self.aabb_max[1] - self.aabb_min[1]) * 0.5;
                ground_height + half_h
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grounded_y_feet_pivot() {
        let meta = AssetMetadata {
            id: "knight".into(),
            display_name: "Knight".into(),
            category: AssetCategory::Character,
            import_rotation: [0.0, 0.0, 0.0, 1.0],
            import_scale: 1.0,
            pivot_policy: PivotPolicy::Feet,
            foot_offset: 0.0,
            aabb_min: [-0.3, 0.0, -0.2],
            aabb_max: [0.3, 1.8, 0.2],
            collider_type: ColliderSpec::Auto,
            collision_mesh_name: None,
            sockets: HashMap::new(),
            bone_naming: BoneNaming::KayKitNoDot,
            is_static: false,
            is_walkable: false,
            is_climbable: false,
        };
        assert!((meta.grounded_y(5.0) - 5.0).abs() < 0.001);
    }

    #[test]
    fn grounded_y_center_pivot() {
        let meta = AssetMetadata {
            id: "sword".into(),
            display_name: "Sword".into(),
            category: AssetCategory::Weapon,
            import_rotation: [0.0, 0.0, 0.0, 1.0],
            import_scale: 1.0,
            pivot_policy: PivotPolicy::Center,
            foot_offset: 0.0,
            aabb_min: [-0.05, -0.4, -0.02],
            aabb_max: [0.05, 0.4, 0.02],
            collider_type: ColliderSpec::Auto,
            collision_mesh_name: None,
            sockets: HashMap::new(),
            bone_naming: BoneNaming::Unknown,
            is_static: false,
            is_walkable: false,
            is_climbable: false,
        };
        // half height = 0.4, so at ground 5.0, center should be 5.4
        assert!((meta.grounded_y(5.0) - 5.4).abs() < 0.001);
    }

    #[test]
    fn auto_category() {
        assert_eq!(AssetMetadata::auto_category_from_name("knight_character"), AssetCategory::Character);
        assert_eq!(AssetMetadata::auto_category_from_name("sword_iron"), AssetCategory::Weapon);
        assert_eq!(AssetMetadata::auto_category_from_name("house_medieval"), AssetCategory::Building);
        assert_eq!(AssetMetadata::auto_category_from_name("barrel"), AssetCategory::Prop);
    }

    #[test]
    fn json_roundtrip() {
        let meta = AssetMetadata {
            id: "test".into(),
            display_name: "Test".into(),
            category: AssetCategory::Prop,
            import_rotation: [0.0, 0.0, 0.0, 1.0],
            import_scale: 1.0,
            pivot_policy: PivotPolicy::Feet,
            foot_offset: 0.05,
            aabb_min: [-1.0, 0.0, -1.0],
            aabb_max: [1.0, 2.0, 1.0],
            collider_type: ColliderSpec::Auto,
            collision_mesh_name: None,
            sockets: HashMap::new(),
            bone_naming: BoneNaming::Unknown,
            is_static: true,
            is_walkable: false,
            is_climbable: false,
        };
        let json = serde_json::to_string(&meta).unwrap();
        let back: AssetMetadata = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, "test");
        assert_eq!(back.is_static, true);
        assert!((back.foot_offset - 0.05).abs() < 0.001);
    }
}
