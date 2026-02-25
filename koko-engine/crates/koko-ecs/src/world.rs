//! Game world — wraps hecs::World with convenience methods

use hecs::World;
use koko_core::transform::Transform;
use koko_core::Id;
use crate::components::*;

/// The game world containing all entities and components
pub struct GameWorld {
    pub world: World,
    entity_count: usize,
}

impl GameWorld {
    pub fn new() -> Self {
        Self {
            world: World::new(),
            entity_count: 0,
        }
    }

    /// Spawn an entity with a transform and name
    pub fn spawn_named(&mut self, name: &str, transform: Transform) -> hecs::Entity {
        let entity = self.world.spawn((
            Id::new(),
            Name(name.to_string()),
            transform,
            Active(true),
        ));
        self.entity_count += 1;
        entity
    }

    /// Spawn a camera
    pub fn spawn_camera(&mut self, name: &str, transform: Transform, camera: Camera) -> hecs::Entity {
        let entity = self.world.spawn((
            Id::new(),
            Name(name.to_string()),
            transform,
            camera,
            Active(true),
        ));
        self.entity_count += 1;
        entity
    }

    /// Spawn a light
    pub fn spawn_light(&mut self, name: &str, transform: Transform, light: Light) -> hecs::Entity {
        let entity = self.world.spawn((
            Id::new(),
            Name(name.to_string()),
            transform,
            light,
            Active(true),
        ));
        self.entity_count += 1;
        entity
    }

    /// Total entity count
    pub fn entity_count(&self) -> usize {
        self.entity_count
    }

    /// Despawn an entity
    pub fn despawn(&mut self, entity: hecs::Entity) -> Result<(), hecs::NoSuchEntity> {
        self.world.despawn(entity)?;
        self.entity_count -= 1;
        Ok(())
    }

    /// Clear all entities
    pub fn clear(&mut self) {
        self.world.clear();
        self.entity_count = 0;
    }
}

impl Default for GameWorld {
    fn default() -> Self { Self::new() }
}
