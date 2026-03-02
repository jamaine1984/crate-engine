//! Transform component — position, rotation, scale in 2D and 3D

use glam::{Mat4, Quat, Vec2, Vec3, Affine3A};
use serde::{Deserialize, Serialize};

/// 3D Transform
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Transform {
    pub position: Vec3,
    pub rotation: Quat,
    pub scale: Vec3,
}

impl Transform {
    pub const IDENTITY: Self = Self {
        position: Vec3::ZERO,
        rotation: Quat::IDENTITY,
        scale: Vec3::ONE,
    };

    pub fn new(position: Vec3, rotation: Quat, scale: Vec3) -> Self {
        Self { position, rotation, scale }
    }

    pub fn from_position(position: Vec3) -> Self {
        Self { position, ..Self::IDENTITY }
    }

    pub fn from_xyz(x: f32, y: f32, z: f32) -> Self {
        Self::from_position(Vec3::new(x, y, z))
    }

    /// Local-space matrix
    pub fn matrix(&self) -> Mat4 {
        Mat4::from_scale_rotation_translation(self.scale, self.rotation, self.position)
    }

    pub fn affine(&self) -> Affine3A {
        Affine3A::from_scale_rotation_translation(self.scale, self.rotation, self.position)
    }

    /// Forward direction (-Z in right-handed)
    pub fn forward(&self) -> Vec3 {
        self.rotation * Vec3::NEG_Z
    }

    /// Right direction (+X)
    pub fn right(&self) -> Vec3 {
        self.rotation * Vec3::X
    }

    /// Up direction (+Y)
    pub fn up(&self) -> Vec3 {
        self.rotation * Vec3::Y
    }

    pub fn look_at(&mut self, target: Vec3, up: Vec3) {
        let forward = (target - self.position).normalize();
        if forward.length_squared() > 0.0001 {
            self.rotation = Quat::from_mat4(&Mat4::look_at_rh(self.position, target, up)).conjugate();
        }
    }

    pub fn translate(&mut self, offset: Vec3) {
        self.position += offset;
    }

    pub fn rotate(&mut self, rotation: Quat) {
        self.rotation = rotation * self.rotation;
    }

    /// Linearly interpolate between two transforms
    pub fn lerp(&self, other: &Transform, t: f32) -> Transform {
        Transform {
            position: self.position.lerp(other.position, t),
            rotation: self.rotation.slerp(other.rotation, t),
            scale: self.scale.lerp(other.scale, t),
        }
    }
}

impl Default for Transform {
    fn default() -> Self {
        Self::IDENTITY
    }
}

/// 2D Transform (for 2D games)
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Transform2D {
    pub position: Vec2,
    pub rotation: f32, // radians
    pub scale: Vec2,
    pub z_order: f32,  // depth sorting
}

impl Transform2D {
    pub const IDENTITY: Self = Self {
        position: Vec2::ZERO,
        rotation: 0.0,
        scale: Vec2::ONE,
        z_order: 0.0,
    };

    pub fn from_position(position: Vec2) -> Self {
        Self { position, ..Self::IDENTITY }
    }

    pub fn from_xy(x: f32, y: f32) -> Self {
        Self::from_position(Vec2::new(x, y))
    }

    /// Convert to 3D transform for rendering
    pub fn to_3d(&self) -> Transform {
        Transform {
            position: Vec3::new(self.position.x, self.position.y, self.z_order),
            rotation: Quat::from_rotation_z(self.rotation),
            scale: Vec3::new(self.scale.x, self.scale.y, 1.0),
        }
    }
}

impl Default for Transform2D {
    fn default() -> Self {
        Self::IDENTITY
    }
}

/// Hierarchical transform — tracks parent-child for world matrix computation
#[derive(Debug, Clone)]
pub struct TransformHierarchy {
    pub local: Transform,
    pub world: Transform,
    pub parent: Option<crate::Id>,
    pub children: Vec<crate::Id>,
    pub dirty: bool,
}

impl TransformHierarchy {
    pub fn new(local: Transform) -> Self {
        Self {
            local,
            world: local,
            parent: None,
            children: Vec::new(),
            dirty: true,
        }
    }

    pub fn compute_world(&mut self, parent_world: Option<&Transform>) {
        if let Some(parent) = parent_world {
            let parent_mat = parent.matrix();
            let local_mat = self.local.matrix();
            let world_mat = parent_mat * local_mat;
            // Decompose back — simplified, proper decomposition needed for skew
            self.world.position = world_mat.w_axis.truncate().into();
            self.world.scale = Vec3::new(
                world_mat.x_axis.truncate().length(),
                world_mat.y_axis.truncate().length(),
                world_mat.z_axis.truncate().length(),
            );
            self.world.rotation = Quat::from_mat4(&world_mat);
        } else {
            self.world = self.local;
        }
        self.dirty = false;
    }
}
