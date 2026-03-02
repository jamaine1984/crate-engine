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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_world_empty() {
        let w = GameWorld::new();
        assert_eq!(w.entity_count(), 0);
    }

    #[test]
    fn spawn_named_increments_count() {
        let mut w = GameWorld::new();
        w.spawn_named("tree", Transform::IDENTITY);
        assert_eq!(w.entity_count(), 1);
        w.spawn_named("rock", Transform::IDENTITY);
        assert_eq!(w.entity_count(), 2);
    }

    #[test]
    fn despawn_decrements_count() {
        let mut w = GameWorld::new();
        let e = w.spawn_named("tree", Transform::IDENTITY);
        assert_eq!(w.entity_count(), 1);
        w.despawn(e).unwrap();
        assert_eq!(w.entity_count(), 0);
    }

    #[test]
    fn clear_resets_to_zero() {
        let mut w = GameWorld::new();
        w.spawn_named("a", Transform::IDENTITY);
        w.spawn_named("b", Transform::IDENTITY);
        w.spawn_named("c", Transform::IDENTITY);
        assert_eq!(w.entity_count(), 3);
        w.clear();
        assert_eq!(w.entity_count(), 0);
    }

    #[test]
    fn spawn_camera_has_camera_component() {
        let mut w = GameWorld::new();
        let cam = crate::components::Camera::default();
        let e = w.spawn_camera("main_cam", Transform::IDENTITY, cam);
        assert!(w.world.get::<&crate::components::Camera>(e).is_ok());
    }

    #[test]
    fn spawn_light_has_light_component() {
        let mut w = GameWorld::new();
        let light = crate::components::Light::default();
        let e = w.spawn_light("sun", Transform::IDENTITY, light);
        assert!(w.world.get::<&crate::components::Light>(e).is_ok());
    }

    #[test]
    fn spawned_entity_has_name() {
        let mut w = GameWorld::new();
        let e = w.spawn_named("hello", Transform::IDENTITY);
        let name = w.world.get::<&Name>(e).unwrap();
        assert_eq!(name.0, "hello");
    }
}
