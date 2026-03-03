//! koko-commands — Canonical command schema for Crate Engine 2.0
//!
//! Defines all command types, payloads, validation, and versioning.
//! This crate is the single source of truth for the command protocol
//! that flows between the AI/UX layer and the engine runtime.

pub mod schema;
pub mod validate;
pub mod version;

// Re-exports
pub use schema::{CommandSource, CommandType};
pub use validate::{validate, ValidationError};
pub use version::SCHEMA_VERSION;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A versioned engine command.
///
/// Every action in the engine — spawning objects, changing weather,
/// building worlds — is represented as a Command with a type and payload.
///
/// Commands are created by the UX layer (chat, voice, editor),
/// validated by the command bus, and dispatched to handlers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Command {
    /// Schema version
    pub v: u32,
    /// Unique command ID
    pub id: String,
    /// Unix timestamp in milliseconds
    pub ts: u64,
    /// Where the command originated
    pub source: CommandSource,
    /// The command type
    #[serde(rename = "type")]
    pub command_type: CommandType,
    /// Type-specific payload data
    pub payload: serde_json::Value,
}

impl Command {
    /// Create a new command with auto-generated ID and timestamp.
    pub fn new(command_type: CommandType, payload: serde_json::Value, source: &str) -> Self {
        let source = match source {
            "chat" => CommandSource::Chat,
            "voice" => CommandSource::Voice,
            "editor" => CommandSource::Editor,
            "multiplayer" => CommandSource::Multiplayer,
            "script" => CommandSource::Script,
            _ => CommandSource::System,
        };

        Self {
            v: SCHEMA_VERSION,
            id: format!("cmd_{}", Uuid::new_v4().as_simple()),
            ts: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
            source,
            command_type,
            payload,
        }
    }

    /// Check if this command modifies the scene.
    pub fn is_mutating(&self) -> bool {
        self.command_type.is_mutating()
    }

    /// Check if this command requires Pro subscription.
    pub fn requires_pro(&self) -> bool {
        self.command_type.requires_pro()
    }
}

/// The result of executing a command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResult {
    /// Whether the command succeeded
    pub ok: bool,
    /// Echo of the command ID
    #[serde(rename = "commandId")]
    pub command_id: String,
    /// Human-readable result message
    pub message: String,
    /// Optional result data
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl CommandResult {
    pub fn success(command_id: &str, message: impl Into<String>) -> Self {
        Self {
            ok: true,
            command_id: command_id.to_string(),
            message: message.into(),
            data: None,
        }
    }

    pub fn failure(command_id: &str, message: impl Into<String>) -> Self {
        Self {
            ok: false,
            command_id: command_id.to_string(),
            message: message.into(),
            data: None,
        }
    }

    pub fn with_data(mut self, data: serde_json::Value) -> Self {
        self.data = Some(data);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn command_round_trips_through_json() {
        let cmd = Command::new(
            CommandType::SpawnObject,
            json!({ "query": "dragon", "position": { "x": 10, "y": 0, "z": 5 } }),
            "chat",
        );

        let json_str = serde_json::to_string(&cmd).unwrap();
        let parsed: Command = serde_json::from_str(&json_str).unwrap();

        assert_eq!(parsed.command_type, CommandType::SpawnObject);
        assert_eq!(parsed.v, SCHEMA_VERSION);
        assert_eq!(parsed.payload["query"], "dragon");
    }

    #[test]
    fn command_result_success() {
        let result = CommandResult::success("cmd_123", "Added dragon at (10, 0, 5)")
            .with_data(json!({ "entityId": "ent_456" }));

        assert!(result.ok);
        assert_eq!(result.command_id, "cmd_123");
        assert!(result.data.is_some());
    }

    #[test]
    fn command_result_failure() {
        let result = CommandResult::failure("cmd_789", "No model found for 'unicorn'");

        assert!(!result.ok);
        assert!(result.data.is_none());
    }

    #[test]
    fn command_has_unique_ids() {
        let cmd1 = Command::new(CommandType::ClearScene, json!({}), "chat");
        let cmd2 = Command::new(CommandType::ClearScene, json!({}), "chat");
        assert_ne!(cmd1.id, cmd2.id);
    }
}
