//! Camera matrices and projection

use glam::{Mat4, Vec3};
use koko_core::transform::Transform;

/// Computed camera matrices ready for GPU upload
#[derive(Debug, Clone, Copy)]
pub struct CameraUniforms {
    pub view: Mat4,
    pub projection: Mat4,
    pub view_projection: Mat4,
    pub inverse_view: Mat4,
    pub inverse_projection: Mat4,
    pub position: Vec3,
    pub near: f32,
    pub far: f32,
}

impl CameraUniforms {
    pub fn view_proj(&self) -> Mat4 {
        self.view_projection
    }

    pub fn perspective(transform: &Transform, fov_degrees: f32, aspect: f32, near: f32, far: f32) -> Self {
        let view = Mat4::look_at_rh(
            transform.position,
            transform.position + transform.forward(),
            transform.up(),
        );
        let projection = Mat4::perspective_rh(fov_degrees.to_radians(), aspect, near, far);
        let view_projection = projection * view;

        Self {
            view, projection, view_projection,
            inverse_view: view.inverse(),
            inverse_projection: projection.inverse(),
            position: transform.position,
            near, far,
        }
    }

    pub fn orthographic(transform: &Transform, size: f32, aspect: f32, near: f32, far: f32) -> Self {
        let half_w = size * aspect * 0.5;
        let half_h = size * 0.5;
        let view = Mat4::look_at_rh(
            transform.position,
            transform.position + transform.forward(),
            transform.up(),
        );
        let projection = Mat4::orthographic_rh(-half_w, half_w, -half_h, half_h, near, far);
        let view_projection = projection * view;

        Self {
            view, projection, view_projection,
            inverse_view: view.inverse(),
            inverse_projection: projection.inverse(),
            position: transform.position,
            near, far,
        }
    }

    pub fn projection(&self) -> Mat4 { self.projection }
    pub fn view(&self) -> Mat4 { self.view }

    /// GPU-ready bytes
    pub fn to_raw(&self) -> CameraRaw {
        CameraRaw {
            view_proj: self.view_projection.to_cols_array(),
            view: self.view.to_cols_array(),
            position: [self.position.x, self.position.y, self.position.z, 1.0],
        }
    }
}

#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
pub struct CameraRaw {
    pub view_proj: [f32; 16],
    pub view: [f32; 16],
    pub position: [f32; 4],
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn perspective_at_origin() {
        let t = Transform::IDENTITY;
        let cam = CameraUniforms::perspective(&t, 60.0, 1.0, 0.1, 100.0);
        assert_eq!(cam.position, Vec3::ZERO);
        assert!((cam.near - 0.1).abs() < 0.001);
        assert!((cam.far - 100.0).abs() < 0.001);
    }

    #[test]
    fn view_proj_equals_product() {
        let t = Transform::from_xyz(0.0, 5.0, 10.0);
        let cam = CameraUniforms::perspective(&t, 60.0, 16.0 / 9.0, 0.1, 1000.0);
        let product = cam.projection * cam.view;
        assert!((cam.view_projection - product).abs_diff_eq(Mat4::ZERO, 0.001));
    }

    #[test]
    fn orthographic_has_matrices() {
        let t = Transform::IDENTITY;
        let cam = CameraUniforms::orthographic(&t, 10.0, 1.0, 0.1, 100.0);
        assert_ne!(cam.projection, Mat4::ZERO);
        assert_ne!(cam.view, Mat4::ZERO);
    }

    #[test]
    fn to_raw_position() {
        let t = Transform::from_xyz(1.0, 2.0, 3.0);
        let cam = CameraUniforms::perspective(&t, 60.0, 1.0, 0.1, 100.0);
        let raw = cam.to_raw();
        assert!((raw.position[0] - 1.0).abs() < 0.001);
        assert!((raw.position[1] - 2.0).abs() < 0.001);
        assert!((raw.position[2] - 3.0).abs() < 0.001);
    }
}
