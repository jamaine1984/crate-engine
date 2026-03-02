//! Built-in mesh primitives

use crate::vertex::Vertex3D;
use std::f32::consts::PI;

#[derive(Debug)]
pub struct MeshData {
    pub vertices: Vec<Vertex3D>,
    pub indices: Vec<u32>,
}

impl MeshData {
    /// Unit cube centered at origin
    pub fn cube() -> Self {
        let v = |pos: [f32; 3], norm: [f32; 3], uv: [f32; 2]| Vertex3D {
            position: pos, normal: norm, uv, color: [1.0, 1.0, 1.0, 1.0],
        };
        let vertices = vec![
            // Front
            v([-0.5, -0.5,  0.5], [0.0, 0.0, 1.0], [0.0, 1.0]),
            v([ 0.5, -0.5,  0.5], [0.0, 0.0, 1.0], [1.0, 1.0]),
            v([ 0.5,  0.5,  0.5], [0.0, 0.0, 1.0], [1.0, 0.0]),
            v([-0.5,  0.5,  0.5], [0.0, 0.0, 1.0], [0.0, 0.0]),
            // Back
            v([ 0.5, -0.5, -0.5], [0.0, 0.0,-1.0], [0.0, 1.0]),
            v([-0.5, -0.5, -0.5], [0.0, 0.0,-1.0], [1.0, 1.0]),
            v([-0.5,  0.5, -0.5], [0.0, 0.0,-1.0], [1.0, 0.0]),
            v([ 0.5,  0.5, -0.5], [0.0, 0.0,-1.0], [0.0, 0.0]),
            // Right
            v([ 0.5, -0.5,  0.5], [1.0, 0.0, 0.0], [0.0, 1.0]),
            v([ 0.5, -0.5, -0.5], [1.0, 0.0, 0.0], [1.0, 1.0]),
            v([ 0.5,  0.5, -0.5], [1.0, 0.0, 0.0], [1.0, 0.0]),
            v([ 0.5,  0.5,  0.5], [1.0, 0.0, 0.0], [0.0, 0.0]),
            // Left
            v([-0.5, -0.5, -0.5], [-1.0, 0.0, 0.0], [0.0, 1.0]),
            v([-0.5, -0.5,  0.5], [-1.0, 0.0, 0.0], [1.0, 1.0]),
            v([-0.5,  0.5,  0.5], [-1.0, 0.0, 0.0], [1.0, 0.0]),
            v([-0.5,  0.5, -0.5], [-1.0, 0.0, 0.0], [0.0, 0.0]),
            // Top
            v([-0.5,  0.5,  0.5], [0.0, 1.0, 0.0], [0.0, 1.0]),
            v([ 0.5,  0.5,  0.5], [0.0, 1.0, 0.0], [1.0, 1.0]),
            v([ 0.5,  0.5, -0.5], [0.0, 1.0, 0.0], [1.0, 0.0]),
            v([-0.5,  0.5, -0.5], [0.0, 1.0, 0.0], [0.0, 0.0]),
            // Bottom
            v([-0.5, -0.5, -0.5], [0.0,-1.0, 0.0], [0.0, 1.0]),
            v([ 0.5, -0.5, -0.5], [0.0,-1.0, 0.0], [1.0, 1.0]),
            v([ 0.5, -0.5,  0.5], [0.0,-1.0, 0.0], [1.0, 0.0]),
            v([-0.5, -0.5,  0.5], [0.0,-1.0, 0.0], [0.0, 0.0]),
        ];
        let indices: Vec<u32> = (0..6).flat_map(|face| {
            let i = face * 4;
            [i, i+1, i+2, i, i+2, i+3]
        }).collect();
        Self { vertices, indices }
    }

    /// UV sphere
    pub fn sphere(segments: u32, rings: u32) -> Self {
        let mut vertices = Vec::new();
        let mut indices = Vec::new();

        for ring in 0..=rings {
            let phi = PI * ring as f32 / rings as f32;
            for seg in 0..=segments {
                let theta = 2.0 * PI * seg as f32 / segments as f32;
                let x = phi.sin() * theta.cos();
                let y = phi.cos();
                let z = phi.sin() * theta.sin();
                vertices.push(Vertex3D {
                    position: [x * 0.5, y * 0.5, z * 0.5],
                    normal: [x, y, z],
                    uv: [seg as f32 / segments as f32, ring as f32 / rings as f32],
                    color: [1.0, 1.0, 1.0, 1.0],
                });
            }
        }

        for ring in 0..rings {
            for seg in 0..segments {
                let a = ring * (segments + 1) + seg;
                let b = a + segments + 1;
                indices.extend_from_slice(&[a, b, a + 1, b, b + 1, a + 1]);
            }
        }

        Self { vertices, indices }
    }

    /// Flat plane (XZ) with subdivisions
    pub fn plane(subdivisions: u32) -> Self {
        let mut vertices = Vec::new();
        let mut indices = Vec::new();
        let count = subdivisions + 1;

        for z in 0..count {
            for x in 0..count {
                let fx = x as f32 / subdivisions as f32 - 0.5;
                let fz = z as f32 / subdivisions as f32 - 0.5;
                vertices.push(Vertex3D {
                    position: [fx, 0.0, fz],
                    normal: [0.0, 1.0, 0.0],
                    uv: [x as f32 / subdivisions as f32, z as f32 / subdivisions as f32],
                    color: [1.0, 1.0, 1.0, 1.0],
                });
            }
        }

        for z in 0..subdivisions {
            for x in 0..subdivisions {
                let a = z * count + x;
                let b = a + count;
                indices.extend_from_slice(&[a, b, a + 1, b, b + 1, a + 1]);
            }
        }

        Self { vertices, indices }
    }
}

impl MeshData {
    /// Cylinder along Y axis
    pub fn cylinder(segments: u32, height: f32, radius: f32) -> Self {
        let mut vertices = Vec::new();
        let mut indices = Vec::new();
        let half_h = height * 0.5;

        // Side
        for i in 0..=segments {
            let theta = std::f32::consts::TAU * i as f32 / segments as f32;
            let (s, c) = (theta.sin(), theta.cos());
            let nx = c; let nz = s;
            // Bottom
            vertices.push(Vertex3D { position: [c * radius, -half_h, s * radius], normal: [nx, 0.0, nz], uv: [i as f32 / segments as f32, 1.0], color: [1.0; 4] });
            // Top
            vertices.push(Vertex3D { position: [c * radius, half_h, s * radius], normal: [nx, 0.0, nz], uv: [i as f32 / segments as f32, 0.0], color: [1.0; 4] });
        }
        for i in 0..segments {
            let b = i * 2;
            indices.extend_from_slice(&[b, b + 1, b + 2, b + 1, b + 3, b + 2]);
        }

        // Top cap
        let top_center = vertices.len() as u32;
        vertices.push(Vertex3D { position: [0.0, half_h, 0.0], normal: [0.0, 1.0, 0.0], uv: [0.5, 0.5], color: [1.0; 4] });
        for i in 0..=segments {
            let theta = std::f32::consts::TAU * i as f32 / segments as f32;
            vertices.push(Vertex3D { position: [theta.cos() * radius, half_h, theta.sin() * radius], normal: [0.0, 1.0, 0.0], uv: [0.5 + theta.cos() * 0.5, 0.5 + theta.sin() * 0.5], color: [1.0; 4] });
        }
        for i in 0..segments {
            indices.extend_from_slice(&[top_center, top_center + 1 + i, top_center + 2 + i]);
        }

        // Bottom cap
        let bot_center = vertices.len() as u32;
        vertices.push(Vertex3D { position: [0.0, -half_h, 0.0], normal: [0.0, -1.0, 0.0], uv: [0.5, 0.5], color: [1.0; 4] });
        for i in 0..=segments {
            let theta = std::f32::consts::TAU * i as f32 / segments as f32;
            vertices.push(Vertex3D { position: [theta.cos() * radius, -half_h, theta.sin() * radius], normal: [0.0, -1.0, 0.0], uv: [0.5 + theta.cos() * 0.5, 0.5 + theta.sin() * 0.5], color: [1.0; 4] });
        }
        for i in 0..segments {
            indices.extend_from_slice(&[bot_center, bot_center + 2 + i, bot_center + 1 + i]);
        }

        Self { vertices, indices }
    }

    /// Cone along Y axis
    pub fn cone(segments: u32, height: f32, radius: f32) -> Self {
        let mut vertices = Vec::new();
        let mut indices = Vec::new();
        let half_h = height * 0.5;
        let slope = radius / height;

        // Tip
        let tip_idx = 0u32;
        vertices.push(Vertex3D { position: [0.0, half_h, 0.0], normal: [0.0, 1.0, 0.0], uv: [0.5, 0.0], color: [1.0; 4] });

        // Base ring
        for i in 0..=segments {
            let theta = std::f32::consts::TAU * i as f32 / segments as f32;
            let (s, c) = (theta.sin(), theta.cos());
            let ny = slope;
            let nxz = (1.0 - ny * ny).max(0.0).sqrt();
            vertices.push(Vertex3D { position: [c * radius, -half_h, s * radius], normal: [c * nxz, ny, s * nxz], uv: [i as f32 / segments as f32, 1.0], color: [1.0; 4] });
        }
        for i in 0..segments {
            indices.extend_from_slice(&[tip_idx, 1 + i, 2 + i]);
        }

        // Base cap
        let center = vertices.len() as u32;
        vertices.push(Vertex3D { position: [0.0, -half_h, 0.0], normal: [0.0, -1.0, 0.0], uv: [0.5, 0.5], color: [1.0; 4] });
        for i in 0..=segments {
            let theta = std::f32::consts::TAU * i as f32 / segments as f32;
            vertices.push(Vertex3D { position: [theta.cos() * radius, -half_h, theta.sin() * radius], normal: [0.0, -1.0, 0.0], uv: [0.5 + theta.cos() * 0.5, 0.5 + theta.sin() * 0.5], color: [1.0; 4] });
        }
        for i in 0..segments {
            indices.extend_from_slice(&[center, center + 2 + i, center + 1 + i]);
        }

        Self { vertices, indices }
    }

    /// Torus (ring around Y axis)
    pub fn torus(ring_segments: u32, tube_segments: u32, ring_radius: f32, tube_radius: f32) -> Self {
        let mut vertices = Vec::new();
        let mut indices = Vec::new();

        for i in 0..=ring_segments {
            let u = std::f32::consts::TAU * i as f32 / ring_segments as f32;
            let (su, cu) = (u.sin(), u.cos());

            for j in 0..=tube_segments {
                let v = std::f32::consts::TAU * j as f32 / tube_segments as f32;
                let (sv, cv) = (v.sin(), v.cos());

                let x = (ring_radius + tube_radius * cv) * cu;
                let y = tube_radius * sv;
                let z = (ring_radius + tube_radius * cv) * su;

                let nx = cv * cu;
                let ny = sv;
                let nz = cv * su;

                vertices.push(Vertex3D {
                    position: [x, y, z],
                    normal: [nx, ny, nz],
                    uv: [i as f32 / ring_segments as f32, j as f32 / tube_segments as f32],
                    color: [1.0; 4],
                });
            }
        }

        for i in 0..ring_segments {
            for j in 0..tube_segments {
                let a = i * (tube_segments + 1) + j;
                let b = a + tube_segments + 1;
                indices.extend_from_slice(&[a, b, a + 1, b, b + 1, a + 1]);
            }
        }

        Self { vertices, indices }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cube_has_24_vertices_36_indices() {
        let cube = MeshData::cube();
        assert_eq!(cube.vertices.len(), 24);
        assert_eq!(cube.indices.len(), 36);
    }

    #[test]
    fn cube_normals_are_unit() {
        let cube = MeshData::cube();
        for v in &cube.vertices {
            let len = (v.normal[0].powi(2) + v.normal[1].powi(2) + v.normal[2].powi(2)).sqrt();
            assert!((len - 1.0).abs() < 0.001);
        }
    }

    #[test]
    fn sphere_vertex_count() {
        let sphere = MeshData::sphere(16, 8);
        assert_eq!(sphere.vertices.len(), 17 * 9);
    }

    #[test]
    fn plane_subdivisions() {
        let p1 = MeshData::plane(1);
        assert_eq!(p1.vertices.len(), 4);
        assert_eq!(p1.indices.len(), 6);
        let p4 = MeshData::plane(4);
        assert_eq!(p4.vertices.len(), 25);
    }

    #[test]
    fn cylinder_nonempty() {
        let c = MeshData::cylinder(8, 2.0, 0.5);
        assert!(!c.vertices.is_empty());
        assert!(!c.indices.is_empty());
    }

    #[test]
    fn cone_nonempty() {
        let c = MeshData::cone(8, 2.0, 0.5);
        assert!(!c.vertices.is_empty());
    }

    #[test]
    fn torus_nonempty() {
        let t = MeshData::torus(16, 8, 1.0, 0.3);
        assert!(!t.vertices.is_empty());
    }
}
