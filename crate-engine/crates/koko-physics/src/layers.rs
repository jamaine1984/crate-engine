//! Collision layers — single source of truth for who collides with whom

use rapier3d::prelude::*;

bitflags::bitflags! {
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub struct CollisionLayer: u32 {
        const WORLD_STATIC  = 1 << 0;
        const WORLD_DYNAMIC = 1 << 1;
        const CHARACTER     = 1 << 2;
        const NPC           = 1 << 3;
        const WEAPON        = 1 << 4;
        const PROJECTILE    = 1 << 5;
        const TRIGGER       = 1 << 6;
        const WATER_VOLUME  = 1 << 7;
        const CLIMBABLE     = 1 << 8;
    }
}

impl CollisionLayer {
    /// Convert to Rapier InteractionGroups.
    /// membership = what layer this object IS
    /// filter = what layers this object COLLIDES WITH
    pub fn to_rapier_groups(self) -> InteractionGroups {
        let membership = self.bits();
        let filter = self.collision_mask().bits();
        InteractionGroups::new(
            Group::from(membership),
            Group::from(filter),
            InteractionTestMode::default(),
        )
    }

    /// What does this layer collide with?
    pub fn collision_mask(self) -> CollisionLayer {
        if self.contains(Self::TRIGGER) || self.contains(Self::WATER_VOLUME) {
            // Sensors: don't block anything (handled via intersection events)
            return CollisionLayer::empty();
        }

        match () {
            _ if self.contains(Self::CHARACTER) => {
                Self::WORLD_STATIC | Self::WORLD_DYNAMIC | Self::NPC | Self::CLIMBABLE
            }
            _ if self.contains(Self::NPC) => {
                Self::WORLD_STATIC | Self::WORLD_DYNAMIC | Self::CHARACTER | Self::CLIMBABLE
            }
            _ if self.contains(Self::PROJECTILE) => {
                Self::WORLD_STATIC | Self::WORLD_DYNAMIC | Self::CHARACTER | Self::NPC
            }
            _ if self.contains(Self::WEAPON) => {
                Self::CHARACTER | Self::NPC
            }
            _ if self.contains(Self::WORLD_STATIC) => {
                // Static collides with everything that moves
                Self::CHARACTER | Self::NPC | Self::WORLD_DYNAMIC | Self::PROJECTILE
            }
            _ if self.contains(Self::WORLD_DYNAMIC) => {
                Self::WORLD_STATIC | Self::WORLD_DYNAMIC | Self::CHARACTER | Self::NPC | Self::PROJECTILE
            }
            _ => CollisionLayer::all(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn character_collides_with_static() {
        let mask = CollisionLayer::CHARACTER.collision_mask();
        assert!(mask.contains(CollisionLayer::WORLD_STATIC));
    }

    #[test]
    fn character_does_not_collide_with_character() {
        let mask = CollisionLayer::CHARACTER.collision_mask();
        assert!(!mask.contains(CollisionLayer::CHARACTER));
    }

    #[test]
    fn trigger_collides_with_nothing() {
        let mask = CollisionLayer::TRIGGER.collision_mask();
        assert!(mask.is_empty());
    }

    #[test]
    fn projectile_hits_characters_and_npcs() {
        let mask = CollisionLayer::PROJECTILE.collision_mask();
        assert!(mask.contains(CollisionLayer::CHARACTER));
        assert!(mask.contains(CollisionLayer::NPC));
        assert!(mask.contains(CollisionLayer::WORLD_STATIC));
    }
}
