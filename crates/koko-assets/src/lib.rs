//! KOKO Asset System — loading, caching, hot-reload, user imports

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetMeta {
    pub id: String,
    pub name: String,
    pub asset_type: AssetType,
    pub tags: Vec<String>,
    pub description: String,
    pub path: PathBuf,
    pub builtin: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AssetType {
    Mesh, Texture, Material, Animation, Sound, Music, Script, Scene, Font, Shader, VFX, Tilemap, Prefab,
}

pub struct AssetManager {
    registry: HashMap<String, AssetMeta>,
    search_paths: Vec<PathBuf>,
    user_assets_path: PathBuf,
}

impl AssetManager {
    pub fn new(project_path: &Path) -> Self {
        let user_assets = project_path.join("assets");
        std::fs::create_dir_all(&user_assets).ok();
        Self {
            registry: HashMap::new(),
            search_paths: vec![project_path.join("assets")],
            user_assets_path: user_assets,
        }
    }

    pub fn scan(&mut self) {
        for path in self.search_paths.clone() {
            if path.exists() {
                let is_user = path == self.user_assets_path;
                self.scan_directory(&path, is_user);
            }
        }
        tracing::info!("Asset registry: {} assets found", self.registry.len());
    }

    fn scan_directory(&mut self, dir: &Path, user_imported: bool) {
        for entry in walkdir::WalkDir::new(dir).into_iter().flatten() {
            if entry.file_type().is_file() {
                if let Some(asset_type) = Self::detect_type(entry.path()) {
                    let name = entry.path().file_stem()
                        .and_then(|s: &std::ffi::OsStr| s.to_str())
                        .unwrap_or("unknown")
                        .to_string();
                    let id = format!("{}:{}", if user_imported { "user" } else { "builtin" }, name);
                    let meta = AssetMeta {
                        id: id.clone(), name, asset_type,
                        tags: Vec::new(), description: String::new(),
                        path: entry.path().to_owned(), builtin: !user_imported,
                    };
                    self.registry.insert(id, meta);
                }
            }
        }
    }

    fn detect_type(path: &Path) -> Option<AssetType> {
        match path.extension()?.to_str()? {
            "glb" | "gltf" | "obj" | "fbx" => Some(AssetType::Mesh),
            "png" | "jpg" | "jpeg" | "tga" | "bmp" | "hdr" | "exr" => Some(AssetType::Texture),
            "wav" | "ogg" | "mp3" | "flac" => Some(AssetType::Sound),
            "lua" => Some(AssetType::Script),
            "ttf" | "otf" => Some(AssetType::Font),
            "wgsl" | "glsl" => Some(AssetType::Shader),
            "json" | "scene" => Some(AssetType::Scene),
            _ => None,
        }
    }

    pub fn search(&self, query: &str, asset_type: Option<AssetType>) -> Vec<&AssetMeta> {
        let q = query.to_lowercase();
        self.registry.values().filter(|m| {
            if let Some(t) = asset_type { if m.asset_type != t { return false; } }
            m.name.to_lowercase().contains(&q) || m.tags.iter().any(|t| t.to_lowercase().contains(&q))
        }).collect()
    }

    pub fn import(&mut self, source: &Path) -> Result<String, std::io::Error> {
        let filename = source.file_name().ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "No filename"))?;
        let dest = self.user_assets_path.join(filename);
        std::fs::copy(source, &dest)?;
        if let Some(asset_type) = Self::detect_type(&dest) {
            let name = dest.file_stem().and_then(|s: &std::ffi::OsStr| s.to_str()).unwrap_or("imported").to_string();
            let id = format!("user:{}", name);
            self.registry.insert(id.clone(), AssetMeta {
                id: id.clone(), name, asset_type, tags: vec!["imported".into()],
                description: "User-imported asset".into(), path: dest, builtin: false,
            });
            Ok(id)
        } else {
            Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "Unknown asset type"))
        }
    }

    pub fn get(&self, id: &str) -> Option<&AssetMeta> { self.registry.get(id) }
    pub fn list(&self, asset_type: AssetType) -> Vec<&AssetMeta> { self.registry.values().filter(|m| m.asset_type == asset_type).collect() }
    pub fn count(&self) -> usize { self.registry.len() }
}
pub mod metadata;
pub mod tags;
