//! glTF / GLB model loader — loads 3D models with textures

use crate::vertex::Vertex3D;
use crate::mesh::MeshData;
use std::path::Path;

/// A loaded glTF model with multiple meshes
#[derive(Debug)]
pub struct GltfModel {
    pub name: String,
    pub meshes: Vec<GltfMesh>,
}

#[derive(Debug)]
pub struct GltfMesh {
    pub name: String,
    pub mesh_data: MeshData,
    pub material: GltfMaterial,
}

#[derive(Debug, Clone)]
pub struct GltfMaterial {
    pub base_color: [f32; 4],
    pub metallic: f32,
    pub roughness: f32,
    /// RGBA texture data if present
    pub base_color_texture: Option<TextureData>,
    pub normal_texture: Option<TextureData>,
    pub metallic_roughness_texture: Option<TextureData>,
    pub emissive_texture: Option<TextureData>,
    pub emissive_factor: [f32; 3],
}

#[derive(Debug, Clone)]
pub struct TextureData {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

impl Default for GltfMaterial {
    fn default() -> Self {
        Self {
            base_color: [0.8, 0.8, 0.8, 1.0],
            metallic: 0.0,
            roughness: 0.5,
            base_color_texture: None,
            normal_texture: None,
            metallic_roughness_texture: None,
            emissive_texture: None,
            emissive_factor: [0.0, 0.0, 0.0],
        }
    }
}

fn extract_texture(images: &[gltf::image::Data], tex_info_idx: usize) -> Option<TextureData> {
    let img = images.get(tex_info_idx)?;
    let width = img.width;
    let height = img.height;
    
    let rgba: Vec<u8> = match img.format {
        gltf::image::Format::R8G8B8A8 => img.pixels.clone(),
        gltf::image::Format::R8G8B8 => {
            let mut rgba = Vec::with_capacity(img.pixels.len() / 3 * 4);
            for chunk in img.pixels.chunks(3) {
                rgba.extend_from_slice(chunk);
                rgba.push(255);
            }
            rgba
        }
        gltf::image::Format::R8 => {
            img.pixels.iter().flat_map(|&r| [r, r, r, 255]).collect()
        }
        gltf::image::Format::R8G8 => {
            img.pixels.chunks(2).flat_map(|rg| [rg[0], rg[1], 0, 255]).collect()
        }
        gltf::image::Format::R16 => {
            img.pixels.chunks(2).flat_map(|c| {
                let v = (u16::from_le_bytes([c[0], c[1]]) >> 8) as u8;
                [v, v, v, 255]
            }).collect()
        }
        gltf::image::Format::R16G16 => {
            img.pixels.chunks(4).flat_map(|c| {
                let r = (u16::from_le_bytes([c[0], c[1]]) >> 8) as u8;
                let g = (u16::from_le_bytes([c[2], c[3]]) >> 8) as u8;
                [r, g, 0, 255]
            }).collect()
        }
        gltf::image::Format::R16G16B16 => {
            img.pixels.chunks(6).flat_map(|c| {
                let r = (u16::from_le_bytes([c[0], c[1]]) >> 8) as u8;
                let g = (u16::from_le_bytes([c[2], c[3]]) >> 8) as u8;
                let b = (u16::from_le_bytes([c[4], c[5]]) >> 8) as u8;
                [r, g, b, 255]
            }).collect()
        }
        gltf::image::Format::R16G16B16A16 => {
            img.pixels.chunks(8).flat_map(|c| {
                let r = (u16::from_le_bytes([c[0], c[1]]) >> 8) as u8;
                let g = (u16::from_le_bytes([c[2], c[3]]) >> 8) as u8;
                let b = (u16::from_le_bytes([c[4], c[5]]) >> 8) as u8;
                let a = (u16::from_le_bytes([c[6], c[7]]) >> 8) as u8;
                [r, g, b, a]
            }).collect()
        }
        gltf::image::Format::R32G32B32FLOAT => {
            img.pixels.chunks(12).flat_map(|c| {
                let r = (f32::from_le_bytes([c[0], c[1], c[2], c[3]]).clamp(0.0, 1.0) * 255.0) as u8;
                let g = (f32::from_le_bytes([c[4], c[5], c[6], c[7]]).clamp(0.0, 1.0) * 255.0) as u8;
                let b = (f32::from_le_bytes([c[8], c[9], c[10], c[11]]).clamp(0.0, 1.0) * 255.0) as u8;
                [r, g, b, 255]
            }).collect()
        }
        gltf::image::Format::R32G32B32A32FLOAT => {
            img.pixels.chunks(16).flat_map(|c| {
                let r = (f32::from_le_bytes([c[0], c[1], c[2], c[3]]).clamp(0.0, 1.0) * 255.0) as u8;
                let g = (f32::from_le_bytes([c[4], c[5], c[6], c[7]]).clamp(0.0, 1.0) * 255.0) as u8;
                let b = (f32::from_le_bytes([c[8], c[9], c[10], c[11]]).clamp(0.0, 1.0) * 255.0) as u8;
                let a = (f32::from_le_bytes([c[12], c[13], c[14], c[15]]).clamp(0.0, 1.0) * 255.0) as u8;
                [r, g, b, a]
            }).collect()
        }
    };
    
    if rgba.len() == (width * height * 4) as usize {
        Some(TextureData { width, height, rgba })
    } else {
        tracing::warn!("Texture size mismatch: {}x{} expected {} got {}", width, height, width * height * 4, rgba.len());
        None
    }
}

/// Load a glTF or GLB file from disk
pub fn load_gltf(path: &Path) -> Result<GltfModel, Box<dyn std::error::Error>> {
    let (document, buffers, images) = gltf::import(path)?;
    
    let model_name = path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("model")
        .to_string();
    
    let mut meshes = Vec::new();
    
    for mesh in document.meshes() {
        for primitive in mesh.primitives() {
            let reader = primitive.reader(|buffer| Some(&buffers[buffer.index()]));
            
            let positions: Vec<[f32; 3]> = reader.read_positions()
                .ok_or("No positions in mesh")?
                .collect();
            
            let normals: Vec<[f32; 3]> = reader.read_normals()
                .map(|n| n.collect())
                .unwrap_or_else(|| vec![[0.0, 1.0, 0.0]; positions.len()]);
            
            let uvs: Vec<[f32; 2]> = reader.read_tex_coords(0)
                .map(|tc| tc.into_f32().collect())
                .unwrap_or_else(|| vec![[0.0, 0.0]; positions.len()]);
            
            let colors: Vec<[f32; 4]> = reader.read_colors(0)
                .map(|c| c.into_rgba_f32().collect())
                .unwrap_or_else(|| vec![[1.0, 1.0, 1.0, 1.0]; positions.len()]);
            
            let vertices: Vec<Vertex3D> = positions.iter().enumerate().map(|(i, pos)| {
                Vertex3D {
                    position: *pos,
                    normal: normals[i],
                    uv: uvs[i],
                    color: colors[i],
                }
            }).collect();
            
            let indices: Vec<u32> = reader.read_indices()
                .map(|idx| idx.into_u32().collect())
                .unwrap_or_else(|| (0..vertices.len() as u32).collect());
            
            let mat = primitive.material();
            let pbr = mat.pbr_metallic_roughness();
            
            // Extract textures
            let base_color_texture = pbr.base_color_texture()
                .and_then(|info| extract_texture(&images, info.texture().source().index()));
            let normal_texture = mat.normal_texture()
                .and_then(|info| extract_texture(&images, info.texture().source().index()));
            let metallic_roughness_texture = pbr.metallic_roughness_texture()
                .and_then(|info| extract_texture(&images, info.texture().source().index()));
            let emissive_texture = mat.emissive_texture()
                .and_then(|info| extract_texture(&images, info.texture().source().index()));
            
            let has_tex = base_color_texture.is_some();
            let material = GltfMaterial {
                base_color: pbr.base_color_factor(),
                metallic: pbr.metallic_factor(),
                roughness: pbr.roughness_factor(),
                base_color_texture,
                normal_texture,
                metallic_roughness_texture,
                emissive_texture,
                emissive_factor: mat.emissive_factor(),
            };
            
            let mesh_name = mesh.name()
                .unwrap_or(&format!("mesh_{}", meshes.len()))
                .to_string();
            
            if has_tex {
                tracing::info!("  🎨 Mesh '{}' has base color texture", mesh_name);
            }
            
            meshes.push(GltfMesh {
                name: mesh_name,
                mesh_data: MeshData { vertices, indices },
                material,
            });
        }
    }
    
    let tex_count = meshes.iter().filter(|m| m.material.base_color_texture.is_some()).count();
    tracing::info!("📦 Loaded glTF '{}': {} meshes ({} textured), {} total verts", 
        model_name, meshes.len(), tex_count,
        meshes.iter().map(|m| m.mesh_data.vertices.len()).sum::<usize>());
    
    Ok(GltfModel { name: model_name, meshes })
}

/// Load from bytes (for embedded/bundled models)
pub fn load_gltf_from_bytes(bytes: &[u8], name: &str) -> Result<GltfModel, Box<dyn std::error::Error>> {
    let (document, buffers, images) = gltf::import_slice(bytes)?;
    
    let mut meshes = Vec::new();
    
    for mesh in document.meshes() {
        for primitive in mesh.primitives() {
            let reader = primitive.reader(|buffer| Some(&buffers[buffer.index()]));
            
            let positions: Vec<[f32; 3]> = reader.read_positions()
                .ok_or("No positions")?
                .collect();
            let normals: Vec<[f32; 3]> = reader.read_normals()
                .map(|n| n.collect())
                .unwrap_or_else(|| vec![[0.0, 1.0, 0.0]; positions.len()]);
            let uvs: Vec<[f32; 2]> = reader.read_tex_coords(0)
                .map(|tc| tc.into_f32().collect())
                .unwrap_or_else(|| vec![[0.0, 0.0]; positions.len()]);
            let colors: Vec<[f32; 4]> = reader.read_colors(0)
                .map(|c| c.into_rgba_f32().collect())
                .unwrap_or_else(|| vec![[1.0, 1.0, 1.0, 1.0]; positions.len()]);
            
            let vertices: Vec<Vertex3D> = positions.iter().enumerate().map(|(i, pos)| {
                Vertex3D { position: *pos, normal: normals[i], uv: uvs[i], color: colors[i] }
            }).collect();
            let indices: Vec<u32> = reader.read_indices()
                .map(|idx| idx.into_u32().collect())
                .unwrap_or_else(|| (0..vertices.len() as u32).collect());
            
            let mat = primitive.material();
            let pbr = mat.pbr_metallic_roughness();
            let base_color_texture = pbr.base_color_texture()
                .and_then(|info| extract_texture(&images, info.texture().source().index()));
            let normal_texture = mat.normal_texture()
                .and_then(|info| extract_texture(&images, info.texture().source().index()));
            let metallic_roughness_texture = pbr.metallic_roughness_texture()
                .and_then(|info| extract_texture(&images, info.texture().source().index()));
            let emissive_texture = mat.emissive_texture()
                .and_then(|info| extract_texture(&images, info.texture().source().index()));
            
            meshes.push(GltfMesh {
                name: mesh.name().unwrap_or("mesh").to_string(),
                mesh_data: MeshData { vertices, indices },
                material: GltfMaterial {
                    base_color: pbr.base_color_factor(),
                    metallic: pbr.metallic_factor(),
                    roughness: pbr.roughness_factor(),
                    base_color_texture,
                    normal_texture,
                    metallic_roughness_texture,
                    emissive_texture,
                    emissive_factor: mat.emissive_factor(),
                },
            });
        }
    }
    
    Ok(GltfModel { name: name.to_string(), meshes })
}
