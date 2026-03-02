//! Scene serialization — save to JSON string, load from JSON string.

use crate::scene::SceneData;

/// Serialize a scene to a JSON string.
pub fn save_scene(scene: &SceneData) -> Result<String, String> {
    serde_json::to_string_pretty(scene)
        .map_err(|e| format!("Failed to serialize scene: {e}"))
}

/// Deserialize a scene from a JSON string.
pub fn load_scene(json: &str) -> Result<SceneData, String> {
    let scene: SceneData = serde_json::from_str(json)
        .map_err(|e| format!("Failed to deserialize scene: {e}"))?;

    if scene.version > SceneData::CURRENT_VERSION {
        return Err(format!(
            "Scene version {} is newer than supported version {}",
            scene.version,
            SceneData::CURRENT_VERSION
        ));
    }

    Ok(scene)
}
