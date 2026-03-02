//! Multiplayer WebSocket protocol — message types for client ↔ server.

use serde::{Deserialize, Serialize};

/// Messages sent from client to server.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum ClientMessage {
    /// Request to join a room.
    #[serde(rename = "join")]
    Join { room: String, username: String },

    /// Request to leave the current room.
    #[serde(rename = "leave")]
    Leave,

    /// Chat message to current room.
    #[serde(rename = "chat")]
    Chat { message: String },

    /// Player position/state sync.
    #[serde(rename = "sync")]
    Sync { position: [f32; 3], rotation: [f32; 3] },

    /// Engine command to broadcast to other players.
    #[serde(rename = "command")]
    Command { command_type: String, payload: serde_json::Value },

    /// Ping for latency measurement.
    #[serde(rename = "ping")]
    Ping { ts: u64 },
}

/// Messages sent from server to client.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum ServerMessage {
    /// Confirmation of joining a room.
    #[serde(rename = "joined")]
    Joined { room: String, players: Vec<String> },

    /// Another player joined the room.
    #[serde(rename = "player_joined")]
    PlayerJoined { username: String },

    /// Another player left the room.
    #[serde(rename = "player_left")]
    PlayerLeft { username: String },

    /// Chat message from another player.
    #[serde(rename = "chat")]
    Chat { username: String, message: String },

    /// Player state sync from another player.
    #[serde(rename = "sync")]
    Sync { username: String, position: [f32; 3], rotation: [f32; 3] },

    /// Broadcast command from another player.
    #[serde(rename = "command")]
    Command { username: String, command_type: String, payload: serde_json::Value },

    /// Pong response.
    #[serde(rename = "pong")]
    Pong { ts: u64 },

    /// Error from server.
    #[serde(rename = "error")]
    Error { message: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serialize_client_join() {
        let msg = ClientMessage::Join {
            room: "lobby".to_string(),
            username: "player1".to_string(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"type\":\"join\""));
        assert!(json.contains("\"room\":\"lobby\""));
    }

    #[test]
    fn deserialize_server_joined() {
        let json = r#"{"type":"joined","room":"lobby","players":["alice","bob"]}"#;
        let msg: ServerMessage = serde_json::from_str(json).unwrap();
        match msg {
            ServerMessage::Joined { room, players } => {
                assert_eq!(room, "lobby");
                assert_eq!(players.len(), 2);
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn roundtrip_client_chat() {
        let msg = ClientMessage::Chat { message: "hello!".to_string() };
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: ClientMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn roundtrip_server_sync() {
        let msg = ServerMessage::Sync {
            username: "player1".to_string(),
            position: [1.0, 2.0, 3.0],
            rotation: [0.0, 1.57, 0.0],
        };
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: ServerMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn client_command_with_payload() {
        let msg = ClientMessage::Command {
            command_type: "SPAWN_OBJECT".to_string(),
            payload: serde_json::json!({"query": "tree", "position": {"x": 0, "y": 0, "z": 0}}),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("SPAWN_OBJECT"));
        let decoded: ClientMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, decoded);
    }
}
