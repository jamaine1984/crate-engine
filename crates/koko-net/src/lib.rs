//! KOKO Networking — multiplayer protocol and room management.

pub mod protocol;
pub mod room;

pub use protocol::{ClientMessage, ServerMessage};
pub use room::{Room, PlayerInfo};
