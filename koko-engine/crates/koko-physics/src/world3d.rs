use rapier3d::prelude::*;

pub struct PhysicsWorld3D {
    pub integration_parameters: IntegrationParameters,
    pub physics_pipeline: PhysicsPipeline,
    pub island_manager: IslandManager,
    pub broad_phase: DefaultBroadPhase,
    pub narrow_phase: NarrowPhase,
    pub rigid_body_set: RigidBodySet,
    pub collider_set: ColliderSet,
    pub impulse_joint_set: ImpulseJointSet,
    pub multibody_joint_set: MultibodyJointSet,
    pub ccd_solver: CCDSolver,
    gravity: glam::Vec3,
}

impl PhysicsWorld3D {
    pub fn new() -> Self {
        Self {
            gravity: glam::Vec3::new(0.0, -9.81, 0.0),
            integration_parameters: IntegrationParameters::default(),
            physics_pipeline: PhysicsPipeline::new(),
            island_manager: IslandManager::new(),
            broad_phase: DefaultBroadPhase::new(),
            narrow_phase: NarrowPhase::new(),
            rigid_body_set: RigidBodySet::new(),
            collider_set: ColliderSet::new(),
            impulse_joint_set: ImpulseJointSet::new(),
            multibody_joint_set: MultibodyJointSet::new(),
            ccd_solver: CCDSolver::new(),
        }
    }

    pub fn step(&mut self) {
        self.physics_pipeline.step(
            self.gravity,
            &self.integration_parameters,
            &mut self.island_manager,
            &mut self.broad_phase,
            &mut self.narrow_phase,
            &mut self.rigid_body_set,
            &mut self.collider_set,
            &mut self.impulse_joint_set,
            &mut self.multibody_joint_set,
            &mut self.ccd_solver,
            &(),
            &(),
        );
    }

    pub fn add_dynamic_body(&mut self, pos: [f32; 3]) -> RigidBodyHandle {
        let body = RigidBodyBuilder::dynamic()
            .translation(glam::Vec3::new(pos[0], pos[1], pos[2]))
            .build();
        self.rigid_body_set.insert(body)
    }

    pub fn add_static_body(&mut self, pos: [f32; 3]) -> RigidBodyHandle {
        let body = RigidBodyBuilder::fixed()
            .translation(glam::Vec3::new(pos[0], pos[1], pos[2]))
            .build();
        self.rigid_body_set.insert(body)
    }

    pub fn add_box_collider(&mut self, body: RigidBodyHandle, he: [f32; 3]) -> ColliderHandle {
        self.collider_set.insert_with_parent(ColliderBuilder::cuboid(he[0], he[1], he[2]).build(), body, &mut self.rigid_body_set)
    }

    pub fn add_sphere_collider(&mut self, body: RigidBodyHandle, r: f32) -> ColliderHandle {
        self.collider_set.insert_with_parent(ColliderBuilder::ball(r).build(), body, &mut self.rigid_body_set)
    }

    pub fn body_position(&self, h: RigidBodyHandle) -> Option<[f32; 3]> {
        self.rigid_body_set.get(h).map(|b| { let p = b.translation(); [p.x, p.y, p.z] })
    }
}
impl Default for PhysicsWorld3D { fn default() -> Self { Self::new() } }
