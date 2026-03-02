//! KOKO Scene — scene serialization, save/load, environment settings.

pub mod scene;
pub mod serialize;

pub use scene::{SceneData, SceneObject, SceneEnvironment};
pub use serialize::{save_scene, load_scene};

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_scene() -> SceneData {
        let mut scene = SceneData::new("Test Scene", "CITY_MODERN", 42, "small");
        scene.objects.push(SceneObject::new(
            "obj_0",
            "building_a",
            "building",
            [10.0, 0.0, 20.0],
        ));
        scene.objects.push(SceneObject::new(
            "obj_1",
            "tree_a",
            "vegetation",
            [5.0, 0.0, 15.0],
        ));
        scene
    }

    #[test]
    fn scene_data_new() {
        let scene = SceneData::new("My Scene", "MEDIEVAL_VILLAGE", 123, "medium");
        assert_eq!(scene.version, SceneData::CURRENT_VERSION);
        assert_eq!(scene.name, "My Scene");
        assert_eq!(scene.template, "MEDIEVAL_VILLAGE");
        assert_eq!(scene.seed, 123);
        assert_eq!(scene.size, "medium");
        assert!(scene.objects.is_empty());
    }

    #[test]
    fn scene_object_defaults() {
        let obj = SceneObject::new("obj_0", "car_a", "vehicle", [1.0, 2.0, 3.0]);
        assert_eq!(obj.rotation, [0.0; 3]);
        assert_eq!(obj.scale, [1.0; 3]);
        assert!(obj.visible);
        assert!(obj.chunk_id.is_none());
        assert!(obj.zone.is_none());
    }

    #[test]
    fn environment_default() {
        let env = SceneEnvironment::default();
        assert!(!env.fog_enabled);
        assert_eq!(env.fog_density, 0.0);
        assert!(env.ambient_intensity > 0.0);
        assert!(env.sun_intensity > 0.0);
    }

    #[test]
    fn save_load_roundtrip() {
        let scene = sample_scene();
        let json = save_scene(&scene).unwrap();
        let loaded = load_scene(&json).unwrap();
        assert_eq!(scene, loaded);
    }

    #[test]
    fn save_produces_valid_json() {
        let scene = sample_scene();
        let json = save_scene(&scene).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["name"], "Test Scene");
        assert_eq!(parsed["template"], "CITY_MODERN");
        assert_eq!(parsed["seed"], 42);
        assert_eq!(parsed["objects"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn load_invalid_json() {
        let result = load_scene("not valid json");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to deserialize"));
    }

    #[test]
    fn load_future_version_rejected() {
        let mut scene = sample_scene();
        scene.version = 999;
        let json = save_scene(&scene).unwrap();
        let result = load_scene(&json);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("newer than supported"));
    }

    #[test]
    fn roundtrip_with_optional_fields() {
        let mut scene = sample_scene();
        scene.objects[0].chunk_id = Some("chunk_0_0".to_string());
        scene.objects[0].zone = Some("downtown".to_string());
        scene.objects[1].visible = false;
        let json = save_scene(&scene).unwrap();
        let loaded = load_scene(&json).unwrap();
        assert_eq!(loaded.objects[0].chunk_id, Some("chunk_0_0".to_string()));
        assert_eq!(loaded.objects[0].zone, Some("downtown".to_string()));
        assert!(!loaded.objects[1].visible);
    }

    #[test]
    fn roundtrip_custom_environment() {
        let mut scene = sample_scene();
        scene.environment.fog_enabled = true;
        scene.environment.fog_density = 0.5;
        scene.environment.sun_intensity = 2.0;
        let json = save_scene(&scene).unwrap();
        let loaded = load_scene(&json).unwrap();
        assert!(loaded.environment.fog_enabled);
        assert_eq!(loaded.environment.fog_density, 0.5);
        assert_eq!(loaded.environment.sun_intensity, 2.0);
    }

    #[test]
    fn empty_scene_roundtrip() {
        let scene = SceneData::new("Empty", "ZOMBIELAND", 0, "small");
        let json = save_scene(&scene).unwrap();
        let loaded = load_scene(&json).unwrap();
        assert_eq!(scene, loaded);
        assert!(loaded.objects.is_empty());
    }
}
