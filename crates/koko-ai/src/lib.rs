//! KOKO AI Orchestrator — model-agnostic prompt-to-game system

pub mod provider;
pub mod prompt;
pub mod intent;
pub mod local;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AiProvider {
    Claude { api_key: String, model: String },
    Gemini { api_key: String, model: String },
    OpenAI { api_key: String, model: String },
    Ollama { endpoint: String, model: String },
    Custom { endpoint: String, api_key: Option<String>, model: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    pub providers: Vec<AiProvider>,
    pub default_provider: usize,
    pub max_tokens: u32,
    pub temperature: f32,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            providers: vec![],
            default_provider: 0,
            max_tokens: 4096,
            temperature: 0.7,
        }
    }
}

/// Parsed intent from user prompt
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GameIntent {
    AddEntity { name: String, mesh: String, position: [f32; 3], color: [f32; 4], scale: f32 },
    RemoveEntity { name: String },
    ModifyEntity { name: String, changes: String },
    SetCamera { position: [f32; 3], look_at: [f32; 3] },
    SetLighting { direction: [f32; 3], color: [f32; 3], intensity: f32 },
    AddPhysics { target: String },
    RunScript { code: String },
    ChatResponse { message: String },
    Multiple { intents: Vec<GameIntent> },
    LoadModel { name: String, model_file: String, position: [f32; 3], scale: f32 },
    Unknown { raw: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ai_config_defaults() {
        let cfg = AiConfig::default();
        assert!(cfg.providers.is_empty());
        assert_eq!(cfg.default_provider, 0);
        assert_eq!(cfg.max_tokens, 4096);
        assert!((cfg.temperature - 0.7).abs() < 0.01);
    }

    #[test]
    fn ai_config_serialization_roundtrip() {
        let cfg = AiConfig {
            providers: vec![AiProvider::Ollama {
                endpoint: "http://localhost:11434".into(),
                model: "llama3".into(),
            }],
            default_provider: 0,
            max_tokens: 2048,
            temperature: 0.5,
        };
        let json = serde_json::to_string(&cfg).unwrap();
        let restored: AiConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.max_tokens, 2048);
        assert!((restored.temperature - 0.5).abs() < 0.01);
        assert_eq!(restored.providers.len(), 1);
    }

    #[test]
    fn game_intent_serialization() {
        let intent = GameIntent::AddEntity {
            name: "tree".into(),
            mesh: "tree_model".into(),
            position: [1.0, 0.0, 3.0],
            color: [0.0, 1.0, 0.0, 1.0],
            scale: 1.5,
        };
        let json = serde_json::to_string(&intent).unwrap();
        assert!(json.contains("tree"));
        let restored: GameIntent = serde_json::from_str(&json).unwrap();
        match restored {
            GameIntent::AddEntity { name, scale, .. } => {
                assert_eq!(name, "tree");
                assert!((scale - 1.5).abs() < 0.01);
            }
            _ => panic!("wrong variant"),
        }
    }
}
