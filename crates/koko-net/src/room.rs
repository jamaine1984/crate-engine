//! Room and player state tracking for multiplayer sessions.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Information about a connected player.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PlayerInfo {
    pub username: String,
    pub position: [f32; 3],
    pub rotation: [f32; 3],
    pub connected_at: u64,
}

impl PlayerInfo {
    pub fn new(username: &str, connected_at: u64) -> Self {
        Self {
            username: username.to_string(),
            position: [0.0; 3],
            rotation: [0.0; 3],
            connected_at,
        }
    }

    pub fn update_transform(&mut self, position: [f32; 3], rotation: [f32; 3]) {
        self.position = position;
        self.rotation = rotation;
    }
}

/// A multiplayer room that tracks connected players.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Room {
    pub name: String,
    pub players: HashMap<String, PlayerInfo>,
    pub max_players: usize,
    pub created_at: u64,
}

impl Room {
    pub fn new(name: &str, max_players: usize, created_at: u64) -> Self {
        Self {
            name: name.to_string(),
            players: HashMap::new(),
            max_players,
            created_at,
        }
    }

    /// Add a player to the room. Returns Err if full.
    pub fn add_player(&mut self, info: PlayerInfo) -> Result<(), String> {
        if self.players.len() >= self.max_players {
            return Err(format!("Room '{}' is full ({}/{})", self.name, self.players.len(), self.max_players));
        }
        self.players.insert(info.username.clone(), info);
        Ok(())
    }

    /// Remove a player from the room. Returns the removed player info.
    pub fn remove_player(&mut self, username: &str) -> Option<PlayerInfo> {
        self.players.remove(username)
    }

    /// Check if a player is in this room.
    pub fn has_player(&self, username: &str) -> bool {
        self.players.contains_key(username)
    }

    /// Get the current player count.
    pub fn player_count(&self) -> usize {
        self.players.len()
    }

    /// Get usernames of all players.
    pub fn player_names(&self) -> Vec<String> {
        self.players.keys().cloned().collect()
    }

    /// Check if the room is empty.
    pub fn is_empty(&self) -> bool {
        self.players.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn room_add_remove_players() {
        let mut room = Room::new("test_room", 4, 1000);
        assert!(room.is_empty());

        let player = PlayerInfo::new("alice", 1000);
        room.add_player(player).unwrap();
        assert_eq!(room.player_count(), 1);
        assert!(room.has_player("alice"));

        let removed = room.remove_player("alice");
        assert!(removed.is_some());
        assert!(room.is_empty());
    }

    #[test]
    fn room_full_rejects() {
        let mut room = Room::new("small_room", 2, 1000);
        room.add_player(PlayerInfo::new("alice", 1000)).unwrap();
        room.add_player(PlayerInfo::new("bob", 1001)).unwrap();

        let result = room.add_player(PlayerInfo::new("charlie", 1002));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("full"));
    }

    #[test]
    fn player_transform_update() {
        let mut player = PlayerInfo::new("test", 0);
        assert_eq!(player.position, [0.0; 3]);

        player.update_transform([10.0, 5.0, 20.0], [0.0, 1.57, 0.0]);
        assert_eq!(player.position, [10.0, 5.0, 20.0]);
        assert_eq!(player.rotation, [0.0, 1.57, 0.0]);
    }
}
