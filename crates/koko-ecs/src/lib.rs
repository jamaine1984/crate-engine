//! KOKO ECS — Entity Component System wrapper around hecs
//! Provides game-specific components and world management

pub mod components;
pub mod world;

pub use hecs;
pub use world::GameWorld;
