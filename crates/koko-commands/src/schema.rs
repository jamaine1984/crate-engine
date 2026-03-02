//! Command type definitions — every engine action has a type.

use serde::{Deserialize, Serialize};

/// All valid command types in the engine.
/// Maps 1:1 to COMMAND_SCHEMA.md Section 3.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CommandType {
    // Scene
    ClearScene,
    SaveScene,
    LoadScene,
    ExportScene,
    ShareScene,
    Screenshot,

    // Objects
    SpawnObject,
    ScatterObjects,
    RemoveObject,
    TransformObject,
    ColorObject,
    Undo,

    // Environment
    SetTerrain,
    SetWeather,
    SetTime,
    SetFog,
    SetWater,
    SetParticles,
    SetWetness,

    // Player
    EnterPlayMode,
    ExitPlayMode,
    SetCharacter,
    EquipWeapon,
    UnequipWeapon,
    ToggleCamera,
    ToggleInventory,
    SetSensitivity,

    // NPCs
    SpawnNpc,

    // Vehicles
    DriveVehicle,
    ExitVehicle,

    // Buildings
    AddInterior,

    // Graphics
    SetGraphics,
    SetBloom,
    SetSsao,
    SetPostfx,
    SetVignette,
    SetGrain,

    // World Build (simple presets)
    BuildWorld,
    // World Build (advanced — Rust compiler, Phase 2+)
    WorldBuild,

    // UI
    ShowHelp,
    OpenLibrary,
    ShowGenerator,
    AiSettings,
    ScriptManager,

    // Multiplayer
    JoinMultiplayer,
    JoinRoom,
    LeaveMultiplayer,
    ChatMessage,

    // Animation
    PlayAnimation,
    StopAnimation,

    // Quick Play
    QuickPlay,

    // Asset Queries (Phase 2 — world compiler feeds)
    QueryAssets,

    // Simulation (Phase 4 — NPC/traffic)
    SimStart,
    SimStop,
    SimSpeed,
    SimStats,

    // Rendering (Phase 5 — streaming + instancing)
    RenderStats,
    RenderQuality,

    // Special
    ExecRaw,
    AaaSky,
    ToggleDayNight,
    ShooterMode,
    DrivingDemo,
}

impl CommandType {
    /// Returns true if this command type modifies the scene (used for undo tracking).
    pub fn is_mutating(&self) -> bool {
        matches!(
            self,
            CommandType::ClearScene
                | CommandType::SpawnObject
                | CommandType::ScatterObjects
                | CommandType::RemoveObject
                | CommandType::TransformObject
                | CommandType::ColorObject
                | CommandType::SetTerrain
                | CommandType::SetWeather
                | CommandType::SetTime
                | CommandType::SetFog
                | CommandType::SetWater
                | CommandType::SetParticles
                | CommandType::SetWetness
                | CommandType::SpawnNpc
                | CommandType::AddInterior
                | CommandType::BuildWorld
                | CommandType::WorldBuild
                | CommandType::ExecRaw
        )
    }

    /// Returns true if this command requires Pro subscription.
    pub fn requires_pro(&self) -> bool {
        matches!(self, CommandType::ExportScene | CommandType::WorldBuild)
    }
}

/// Valid command sources.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CommandSource {
    Chat,
    Voice,
    Editor,
    Multiplayer,
    Script,
    System,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_type_serializes_to_screaming_snake() {
        let json = serde_json::to_string(&CommandType::SpawnObject).unwrap();
        assert_eq!(json, "\"SPAWN_OBJECT\"");
    }

    #[test]
    fn command_type_deserializes_from_screaming_snake() {
        let ct: CommandType = serde_json::from_str("\"SET_WEATHER\"").unwrap();
        assert_eq!(ct, CommandType::SetWeather);
    }

    #[test]
    fn spawn_object_is_mutating() {
        assert!(CommandType::SpawnObject.is_mutating());
    }

    #[test]
    fn show_help_is_not_mutating() {
        assert!(!CommandType::ShowHelp.is_mutating());
    }

    #[test]
    fn export_requires_pro() {
        assert!(CommandType::ExportScene.requires_pro());
    }

    #[test]
    fn spawn_does_not_require_pro() {
        assert!(!CommandType::SpawnObject.requires_pro());
    }
}
