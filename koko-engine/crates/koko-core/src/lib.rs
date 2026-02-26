//! KOKO Engine - Core types and utilities
//! The foundation everything else builds on.

pub mod time;
pub mod transform;
pub mod color;
pub mod math;
pub mod handle;
pub mod event;
pub mod resource;

// Re-exports
pub use glam;
pub use uuid::Uuid;

/// Engine-wide unique identifier for entities and assets
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub struct Id(pub Uuid);

impl Id {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

impl Default for Id {
    fn default() -> Self {
        Self::new()
    }
}
pub mod validate;
