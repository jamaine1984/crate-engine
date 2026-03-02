//! Common game components that ship with every KOKO game


use koko_core::color::Color;
use koko_core::handle::Handle;

use serde::{Deserialize, Serialize};
use glam::{Vec2, Vec3};

// === IDENTIFICATION ===

/// Human-readable name
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Name(pub String);

/// Tags for categorization and AI asset selection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tags(pub Vec<String>);

/// Layer for collision/rendering grouping
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Layer(pub u32);

/// Active/inactive toggle
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Active(pub bool);

impl Default for Active {
    fn default() -> Self { Self(true) }
}

// === RENDERING ===

/// Reference to a mesh asset
#[derive(Debug, Clone, Copy)]
pub struct MeshRenderer {
    pub mesh: Handle<()>,     // Handle<Mesh> — generic for now
    pub material: Handle<()>, // Handle<Material>
    pub cast_shadows: bool,
    pub receive_shadows: bool,
    pub visible: bool,
}

/// Sprite for 2D rendering
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sprite {
    pub texture: String,  // asset path
    pub color: Color,
    pub flip_x: bool,
    pub flip_y: bool,
    pub custom_size: Option<Vec2>,
    pub anchor: Vec2, // 0,0 = center; -0.5,-0.5 = bottom-left
}

impl Default for Sprite {
    fn default() -> Self {
        Self {
            texture: String::new(),
            color: Color::WHITE,
            flip_x: false,
            flip_y: false,
            custom_size: None,
            anchor: Vec2::ZERO,
        }
    }
}

/// Animated sprite
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpriteAnimation {
    pub frames: Vec<String>,  // texture paths per frame
    pub fps: f32,
    pub looping: bool,
    pub current_frame: usize,
    pub elapsed: f32,
    pub playing: bool,
}

/// Camera component
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Camera {
    pub mode: CameraMode,
    pub fov: f32,           // degrees, for perspective
    pub near: f32,
    pub far: f32,
    pub ortho_size: f32,    // for orthographic
    pub clear_color: Color,
    pub priority: i32,      // highest priority camera renders
    pub viewport: Option<Viewport>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum CameraMode {
    Perspective,
    Orthographic,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Viewport {
    pub x: f32, pub y: f32,
    pub width: f32, pub height: f32,
}

impl Default for Camera {
    fn default() -> Self {
        Self {
            mode: CameraMode::Perspective,
            fov: 60.0,
            near: 0.1,
            far: 1000.0,
            ortho_size: 10.0,
            clear_color: Color::CORNFLOWER_BLUE,
            priority: 0,
            viewport: None,
        }
    }
}

// === LIGHT ===

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Light {
    pub kind: LightKind,
    pub color: Color,
    pub intensity: f32,
    pub cast_shadows: bool,
    pub shadow_bias: f32,
    pub range: f32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum LightKind {
    Directional,
    Point,
    Spot { inner_angle: f32, outer_angle: f32 },
    Area { width: f32, height: f32 },
}

impl Default for Light {
    fn default() -> Self {
        Self {
            kind: LightKind::Point,
            color: Color::WHITE,
            intensity: 1.0,
            cast_shadows: true,
            shadow_bias: 0.005,
            range: 20.0,
        }
    }
}

// === PHYSICS ===

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum RigidBodyType {
    Dynamic,
    Static,
    Kinematic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RigidBody {
    pub body_type: RigidBodyType,
    pub mass: f32,
    pub gravity_scale: f32,
    pub linear_damping: f32,
    pub angular_damping: f32,
    pub lock_rotation_x: bool,
    pub lock_rotation_y: bool,
    pub lock_rotation_z: bool,
}

impl Default for RigidBody {
    fn default() -> Self {
        Self {
            body_type: RigidBodyType::Dynamic,
            mass: 1.0,
            gravity_scale: 1.0,
            linear_damping: 0.0,
            angular_damping: 0.05,
            lock_rotation_x: false,
            lock_rotation_y: false,
            lock_rotation_z: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ColliderShape {
    Box { half_extents: Vec3 },
    Sphere { radius: f32 },
    Capsule { radius: f32, half_height: f32 },
    Cylinder { radius: f32, half_height: f32 },
    ConvexHull { points: Vec<Vec3> },
    TriMesh { mesh_asset: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Collider {
    pub shape: ColliderShape,
    pub is_trigger: bool,
    pub friction: f32,
    pub restitution: f32,
    pub collision_layer: u32,
    pub collision_mask: u32,
}

impl Default for Collider {
    fn default() -> Self {
        Self {
            shape: ColliderShape::Box { half_extents: Vec3::splat(0.5) },
            is_trigger: false,
            friction: 0.5,
            restitution: 0.0,
            collision_layer: 1,
            collision_mask: u32::MAX,
        }
    }
}

// === AUDIO ===

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioSource {
    pub clip: String,      // asset path
    pub volume: f32,
    pub pitch: f32,
    pub spatial: bool,
    pub looping: bool,
    pub min_distance: f32,
    pub max_distance: f32,
    pub play_on_awake: bool,
}

impl Default for AudioSource {
    fn default() -> Self {
        Self {
            clip: String::new(),
            volume: 1.0,
            pitch: 1.0,
            spatial: true,
            looping: false,
            min_distance: 1.0,
            max_distance: 50.0,
            play_on_awake: false,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct AudioListener;

// === GAMEPLAY ===

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Health {
    pub current: f32,
    pub max: f32,
}

impl Health {
    pub fn new(max: f32) -> Self { Self { current: max, max } }
    pub fn damage(&mut self, amount: f32) { self.current = (self.current - amount).max(0.0); }
    pub fn heal(&mut self, amount: f32) { self.current = (self.current + amount).min(self.max); }
    pub fn is_dead(&self) -> bool { self.current <= 0.0 }
    pub fn ratio(&self) -> f32 { self.current / self.max }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterStats {
    pub strength: f32,
    pub dexterity: f32,
    pub intelligence: f32,
    pub vitality: f32,
    pub stamina: f32,
    pub luck: f32,
    pub level: u32,
    pub experience: f32,
    pub experience_to_next: f32,
}

impl Default for CharacterStats {
    fn default() -> Self {
        Self {
            strength: 10.0, dexterity: 10.0, intelligence: 10.0,
            vitality: 10.0, stamina: 10.0, luck: 10.0,
            level: 1, experience: 0.0, experience_to_next: 100.0,
        }
    }
}

// === AI ===

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiAgent {
    pub behavior: String,  // behavior tree asset path or preset name
    pub detection_radius: f32,
    pub attack_range: f32,
    pub patrol_points: Vec<Vec3>,
    pub state: AiState,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum AiState {
    Idle,
    Patrol,
    Chase,
    Attack,
    Flee,
    Search,
    Dead,
}

impl Default for AiState {
    fn default() -> Self { Self::Idle }
}

// === SCRIPTING ===

/// Attach a Lua script to an entity
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptComponent {
    pub script: String,  // path to .lua file
    pub enabled: bool,
}

// === NETWORK ===

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct NetworkIdentity {
    pub net_id: u64,
    pub owner: u64,  // player/connection id
    pub authority: NetworkAuthority,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum NetworkAuthority {
    Server,
    Owner,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_new_full() {
        let h = Health::new(100.0);
        assert_eq!(h.current, 100.0);
        assert_eq!(h.max, 100.0);
        assert!(!h.is_dead());
        assert!((h.ratio() - 1.0).abs() < 0.001);
    }

    #[test]
    fn health_damage() {
        let mut h = Health::new(100.0);
        h.damage(30.0);
        assert!((h.current - 70.0).abs() < 0.001);
        assert!((h.ratio() - 0.7).abs() < 0.001);
    }

    #[test]
    fn health_damage_floors_at_zero() {
        let mut h = Health::new(50.0);
        h.damage(999.0);
        assert_eq!(h.current, 0.0);
        assert!(h.is_dead());
    }

    #[test]
    fn health_heal() {
        let mut h = Health::new(100.0);
        h.damage(60.0);
        h.heal(30.0);
        assert!((h.current - 70.0).abs() < 0.001);
    }

    #[test]
    fn health_heal_caps_at_max() {
        let mut h = Health::new(100.0);
        h.damage(10.0);
        h.heal(999.0);
        assert_eq!(h.current, 100.0);
    }

    #[test]
    fn default_active_is_true() {
        assert!(Active::default().0);
    }

    #[test]
    fn camera_default_perspective() {
        let cam = Camera::default();
        assert!(matches!(cam.mode, CameraMode::Perspective));
        assert!((cam.fov - 60.0).abs() < 0.1);
    }

    #[test]
    fn light_default_point() {
        let light = Light::default();
        assert!(matches!(light.kind, LightKind::Point));
        assert!((light.intensity - 1.0).abs() < 0.001);
    }

    #[test]
    fn collider_default_box() {
        let c = Collider::default();
        assert!(matches!(c.shape, ColliderShape::Box { .. }));
        assert!(!c.is_trigger);
    }

    #[test]
    fn character_stats_default() {
        let s = CharacterStats::default();
        assert_eq!(s.level, 1);
        assert_eq!(s.experience, 0.0);
        assert_eq!(s.strength, 10.0);
    }
}
