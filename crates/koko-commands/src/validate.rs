//! Command validation — ensures commands are well-formed before dispatch.

use crate::{Command, CommandType};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ValidationError {
    #[error("unsupported schema version: {0} (current: {1})")]
    UnsupportedVersion(u32, u32),

    #[error("missing required payload field: {0}")]
    MissingField(String),

    #[error("invalid payload value for field '{field}': {reason}")]
    InvalidValue { field: String, reason: String },

    #[error("empty payload for command type that requires data")]
    EmptyPayload,
}

/// Validate a command against the schema.
/// Returns Ok(()) if valid, Err(ValidationError) if not.
pub fn validate(cmd: &Command) -> Result<(), ValidationError> {
    // Check schema version
    if cmd.v != crate::SCHEMA_VERSION {
        return Err(ValidationError::UnsupportedVersion(
            cmd.v,
            crate::SCHEMA_VERSION,
        ));
    }

    // Type-specific validation
    validate_payload(cmd.command_type, &cmd.payload)?;

    Ok(())
}

fn validate_payload(
    ct: CommandType,
    payload: &serde_json::Value,
) -> Result<(), ValidationError> {
    let obj = payload.as_object();

    match ct {
        // Commands that require specific fields
        CommandType::SpawnObject => {
            require_field(obj, "query")?;
        }
        CommandType::ScatterObjects => {
            require_field(obj, "query")?;
            require_field(obj, "count")?;
        }
        CommandType::RemoveObject => {
            require_field(obj, "target")?;
        }
        CommandType::TransformObject => {
            let o = obj.ok_or(ValidationError::EmptyPayload)?;
            if !o.contains_key("position")
                && !o.contains_key("rotation")
                && !o.contains_key("scale")
            {
                return Err(ValidationError::MissingField(
                    "position, rotation, or scale (at least one required)".into(),
                ));
            }
        }
        CommandType::ColorObject => {
            require_field(obj, "target")?;
            require_field(obj, "color")?;
        }
        CommandType::SetTerrain => {
            require_field(obj, "type")?;
            if let Some(o) = obj {
                if let Some(t) = o.get("type").and_then(|v| v.as_str()) {
                    let valid = [
                        "flat",
                        "hills",
                        "mountains",
                        "canyon",
                        "island",
                        "dunes",
                        "volcano",
                        "mesa",
                        "archipelago",
                    ];
                    if !valid.contains(&t) {
                        return Err(ValidationError::InvalidValue {
                            field: "type".into(),
                            reason: format!("must be one of: {}", valid.join(", ")),
                        });
                    }
                }
            }
        }
        CommandType::SetWeather => {
            require_field(obj, "type")?;
        }
        CommandType::SetTime => {
            require_field(obj, "time")?;
        }
        CommandType::SetWater => {
            require_field(obj, "preset")?;
        }
        CommandType::SetParticles => {
            require_field(obj, "type")?;
        }
        CommandType::SetCharacter => {
            require_field(obj, "id")?;
        }
        CommandType::EquipWeapon => {
            require_field(obj, "weaponId")?;
        }
        CommandType::SetGraphics => {
            require_field(obj, "level")?;
        }
        CommandType::BuildWorld => {
            require_field(obj, "template")?;
        }
        CommandType::WorldBuild => {
            require_field(obj, "template")?;
        }
        CommandType::JoinRoom => {
            require_field(obj, "room")?;
        }
        CommandType::ChatMessage => {
            require_field(obj, "message")?;
        }
        CommandType::ExecRaw => {
            require_field(obj, "input")?;
        }
        CommandType::QuickPlay => {
            require_field(obj, "mode")?;
        }
        CommandType::SaveScene => {
            // name is optional (auto-generates if missing)
        }

        // Commands with no required payload fields
        CommandType::ClearScene
        | CommandType::LoadScene
        | CommandType::ExportScene
        | CommandType::ShareScene
        | CommandType::Screenshot
        | CommandType::Undo
        | CommandType::EnterPlayMode
        | CommandType::ExitPlayMode
        | CommandType::UnequipWeapon
        | CommandType::ToggleCamera
        | CommandType::ToggleInventory
        | CommandType::ExitVehicle
        | CommandType::ShowHelp
        | CommandType::ShowGenerator
        | CommandType::AiSettings
        | CommandType::ScriptManager
        | CommandType::JoinMultiplayer
        | CommandType::LeaveMultiplayer
        | CommandType::AaaSky
        | CommandType::ToggleDayNight
        | CommandType::ShooterMode
        | CommandType::DrivingDemo => {}

        // Asset query — all filter fields are optional
        CommandType::QueryAssets => {}

        // Simulation commands — no required fields
        CommandType::SimStart
        | CommandType::SimStop
        | CommandType::SimStats => {}

        // Simulation speed has optional speed field
        CommandType::SimSpeed => {}

        // Rendering commands (Phase 5)
        CommandType::RenderStats => {}
        CommandType::RenderQuality => {
            require_field(obj, "level")?;
        }

        // Remaining commands with optional validation
        CommandType::SetFog
        | CommandType::SetWetness
        | CommandType::SetSensitivity
        | CommandType::SpawnNpc
        | CommandType::DriveVehicle
        | CommandType::AddInterior
        | CommandType::SetBloom
        | CommandType::SetSsao
        | CommandType::SetPostfx
        | CommandType::SetVignette
        | CommandType::SetGrain
        | CommandType::OpenLibrary
        | CommandType::PlayAnimation
        | CommandType::StopAnimation => {}
    }

    Ok(())
}

fn require_field(
    obj: Option<&serde_json::Map<String, serde_json::Value>>,
    field: &str,
) -> Result<(), ValidationError> {
    let o = obj.ok_or(ValidationError::EmptyPayload)?;
    if !o.contains_key(field) {
        return Err(ValidationError::MissingField(field.into()));
    }
    // Check for null values
    if o.get(field).map_or(false, |v| v.is_null()) {
        return Err(ValidationError::MissingField(field.into()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Command;
    use serde_json::json;

    #[test]
    fn valid_spawn_object_passes() {
        let cmd = Command::new(
            CommandType::SpawnObject,
            json!({ "query": "dragon" }),
            "chat",
        );
        assert!(validate(&cmd).is_ok());
    }

    #[test]
    fn spawn_object_missing_query_fails() {
        let cmd = Command::new(
            CommandType::SpawnObject,
            json!({ "position": { "x": 0 } }),
            "chat",
        );
        assert!(validate(&cmd).is_err());
    }

    #[test]
    fn empty_clear_scene_passes() {
        let cmd = Command::new(CommandType::ClearScene, json!({}), "chat");
        assert!(validate(&cmd).is_ok());
    }

    #[test]
    fn invalid_terrain_type_fails() {
        let cmd = Command::new(
            CommandType::SetTerrain,
            json!({ "type": "lava_planet" }),
            "chat",
        );
        assert!(validate(&cmd).is_err());
    }

    #[test]
    fn valid_terrain_type_passes() {
        let cmd = Command::new(
            CommandType::SetTerrain,
            json!({ "type": "mountains" }),
            "chat",
        );
        assert!(validate(&cmd).is_ok());
    }

    #[test]
    fn transform_requires_at_least_one_field() {
        let cmd = Command::new(
            CommandType::TransformObject,
            json!({ "target": "tree" }),
            "chat",
        );
        assert!(validate(&cmd).is_err());

        let cmd2 = Command::new(
            CommandType::TransformObject,
            json!({ "target": "tree", "scale": 2.0 }),
            "chat",
        );
        assert!(validate(&cmd2).is_ok());
    }

    #[test]
    fn wrong_schema_version_fails() {
        let mut cmd = Command::new(CommandType::ClearScene, json!({}), "chat");
        cmd.v = 999;
        assert!(validate(&cmd).is_err());
    }
}
