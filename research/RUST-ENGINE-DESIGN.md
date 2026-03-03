# Rust Engine System Design — Crate Engine (wgpu + Rapier)

Complete module-by-module design for porting Crate Engine from Three.js to native Rust.

---

## A. Coordinate Conventions & Transform

- **Coordinate system**: Y-up, right-handed, 1 unit = 1 meter
- **Axes**: +X right, +Y up, +Z forward (out of screen), -Z into screen
- **Matches Three.js** — asset pipeline carries over cleanly

```rust
#[derive(Clone, Debug)]
pub struct Transform {
    pub position: Vec3,      // world position
    pub rotation: Quat,      // unit quaternion (validated)
    pub scale: Vec3,         // non-zero, default (1,1,1)
}

impl Transform {
    pub fn forward(&self) -> Vec3 { self.rotation * Vec3::Z }
    pub fn right(&self) -> Vec3   { self.rotation * Vec3::X }
    pub fn up(&self) -> Vec3      { self.rotation * Vec3::NEG_Y }
    
    pub fn matrix(&self) -> Mat4 {
        Mat4::from_scale_rotation_translation(self.scale, self.rotation, self.position)
    }
    
    /// Validate quaternion is unit length, scale is non-zero
    pub fn validate(&mut self) {
        self.rotation = self.rotation.normalize();
        if self.scale.x.abs() < 1e-6 { self.scale.x = 1.0; }
        if self.scale.y.abs() < 1e-6 { self.scale.y = 1.0; }
        if self.scale.z.abs() < 1e-6 { self.scale.z = 1.0; }
    }
}
```

---

## B. Asset Pipeline

### TOML Metadata (per-asset)

```toml
# assets/models/knight.asset.toml
[model]
path = "knight.glb"
pivot_policy = "feet"           # feet | center | origin
axis_fixup = "none"             # none | blender_z_up | max_z_up
scale = 1.0
foot_height_offset = 0.0        # manual ground offset if auto fails

[collision]
mesh = "auto_convex"            # auto_convex | auto_trimesh | custom
custom_path = ""

[sockets]
hand_r = "PalmR"
hand_l = "PalmL"
back = "Abdomen"
hip_r = "UpperLeg.R"
hip_l = "UpperLeg.L"
head = "Head"

[lods]
lod0 = "knight.glb"
lod1 = "knight_lod1.glb"        # optional
lod2 = "knight_lod2.glb"        # optional
```

### AssetImporter

```rust
pub struct AssetImporter;

impl AssetImporter {
    /// Load GLB, apply axis fixup, ground model, extract sockets
    pub fn import(path: &Path, meta: &AssetMetadata) -> ImportedModel {
        let gltf = load_gltf(path);
        let mut scene = gltf.scene;
        
        // 1. Axis fixup
        match meta.axis_fixup {
            AxisFixup::BlenderZUp => scene.apply_rotation(Quat::from_rotation_x(-FRAC_PI_2)),
            AxisFixup::MaxZUp => scene.apply_rotation(Quat::from_rotation_x(-FRAC_PI_2)),
            AxisFixup::None => {}
        }
        
        // 2. Scale
        scene.apply_scale(Vec3::splat(meta.scale));
        
        // 3. Ground (feet at y=0)
        let aabb = scene.compute_aabb();
        match meta.pivot_policy {
            PivotPolicy::Feet => {
                scene.translate(Vec3::new(0.0, -aabb.min.y + meta.foot_height_offset, 0.0));
            }
            PivotPolicy::Center => {
                scene.translate(Vec3::new(0.0, -aabb.center().y, 0.0));
            }
            PivotPolicy::Origin => {}
        }
        
        // 4. Extract bone sockets from metadata
        let sockets = meta.sockets.iter()
            .map(|(slot, bone_name)| (slot.clone(), find_bone(&scene, bone_name)))
            .collect();
        
        ImportedModel { scene, sockets, animations: gltf.animations, aabb }
    }
}
```

---

## C. Collision Layers

```rust
bitflags::bitflags! {
    pub struct CollisionLayer: u32 {
        const WORLD_STATIC  = 1 << 0;
        const WORLD_DYNAMIC = 1 << 1;
        const CHARACTER     = 1 << 2;
        const NPC           = 1 << 3;
        const WEAPON        = 1 << 4;
        const PROJECTILE    = 1 << 5;
        const TRIGGER       = 1 << 6;
        const WATER_VOLUME  = 1 << 7;
    }
}

/// Interaction matrix — what collides with what
pub fn collision_filter(a: CollisionLayer, b: CollisionLayer) -> bool {
    match () {
        _ if a.contains(CollisionLayer::CHARACTER) => {
            b.intersects(CollisionLayer::WORLD_STATIC | CollisionLayer::WORLD_DYNAMIC 
                        | CollisionLayer::NPC | CollisionLayer::TRIGGER | CollisionLayer::WATER_VOLUME)
        }
        _ if a.contains(CollisionLayer::PROJECTILE) => {
            b.intersects(CollisionLayer::WORLD_STATIC | CollisionLayer::CHARACTER 
                        | CollisionLayer::NPC | CollisionLayer::WORLD_DYNAMIC)
        }
        _ if a.contains(CollisionLayer::NPC) => {
            b.intersects(CollisionLayer::WORLD_STATIC | CollisionLayer::CHARACTER 
                        | CollisionLayer::NPC | CollisionLayer::PROJECTILE)
        }
        _ if a.contains(CollisionLayer::TRIGGER) => {
            b.intersects(CollisionLayer::CHARACTER | CollisionLayer::NPC)
        }
        _ => false,
    }
}
```

---

## D. Character Controller (Kinematic)

```rust
pub struct CharacterController {
    // Shape
    pub capsule_radius: f32,       // 0.3m
    pub capsule_half_height: f32,  // 0.6m (total height ~1.8m)
    
    // Ground detection
    pub ground_cast_distance: f32, // 0.1m below capsule
    pub max_slope_angle: f32,      // 45°
    pub step_up_height: f32,       // 0.3m
    pub snap_to_ground: f32,       // 0.5m (prevents bouncing on slopes)
    
    // Movement
    pub velocity: Vec3,
    pub gravity: f32,              // -9.81
    pub jump_impulse: f32,         // 5.0
    pub move_speed: f32,           // 5.0 m/s walk, 8.0 run
    
    // Buffers (game feel)
    pub coyote_time: f32,          // 0.15s — can jump briefly after leaving edge
    pub jump_buffer: f32,          // 0.1s — press jump slightly before landing
    
    // State
    pub is_grounded: bool,
    pub ground_normal: Vec3,
    pub time_since_grounded: f32,
    pub time_since_jump_pressed: f32,
}

impl CharacterController {
    pub fn update(&mut self, dt: f32, input: &CharacterInput, physics: &PhysicsWorld) {
        // 1. Ground detection — shape cast downward
        let ground_hit = physics.shape_cast(
            &self.capsule_shape(),
            self.transform.position,
            Vec3::NEG_Y,
            self.ground_cast_distance,
            CollisionLayer::WORLD_STATIC | CollisionLayer::WORLD_DYNAMIC,
        );
        
        self.is_grounded = ground_hit.is_some() && self.slope_ok(&ground_hit);
        if self.is_grounded {
            self.time_since_grounded = 0.0;
            self.ground_normal = ground_hit.unwrap().normal;
        } else {
            self.time_since_grounded += dt;
        }
        
        // 2. Horizontal movement — project onto ground plane
        let wish_dir = input.move_direction(); // normalized XZ from WASD
        let move_dir = if self.is_grounded {
            project_on_plane(wish_dir, self.ground_normal).normalize_or_zero()
        } else {
            wish_dir // air control (reduced)
        };
        
        let speed = if input.sprint { self.move_speed * 1.6 } else { self.move_speed };
        let air_mult = if self.is_grounded { 1.0 } else { 0.3 };
        self.velocity.x = move_dir.x * speed * air_mult;
        self.velocity.z = move_dir.z * speed * air_mult;
        
        // 3. Jump (with coyote time + buffer)
        if input.jump_pressed { self.time_since_jump_pressed = 0.0; }
        else { self.time_since_jump_pressed += dt; }
        
        let can_jump = self.time_since_grounded < self.coyote_time 
                     && self.time_since_jump_pressed < self.jump_buffer;
        if can_jump {
            self.velocity.y = self.jump_impulse;
            self.time_since_grounded = self.coyote_time; // consume
        }
        
        // 4. Gravity
        if !self.is_grounded {
            self.velocity.y += self.gravity * dt;
        } else if self.velocity.y < 0.0 {
            self.velocity.y = 0.0;
        }
        
        // 5. Move + collide (Rapier kinematic move)
        let desired = self.velocity * dt;
        let corrected = physics.move_character(
            &self.capsule_shape(),
            self.transform.position,
            desired,
            self.step_up_height,
            self.max_slope_angle,
        );
        self.transform.position += corrected;
        
        // 6. Snap to ground (prevent bouncing on downhill)
        if self.is_grounded && self.velocity.y <= 0.0 {
            if let Some(snap) = physics.shape_cast(
                &self.capsule_shape(),
                self.transform.position,
                Vec3::NEG_Y,
                self.snap_to_ground,
                CollisionLayer::WORLD_STATIC,
            ) {
                self.transform.position.y -= snap.distance;
            }
        }
    }
}
```

---

## E. Camera Rigs

### TPS (Third-Person Spring Arm)

```rust
pub struct TpsCameraRig {
    pub arm_length: f32,       // 4.0m default
    pub shoulder_offset: Vec3, // (0.5, 0.3, 0.0) — over right shoulder
    pub pitch: f32,            // -15° default
    pub yaw: f32,
    pub collision_radius: f32, // 0.2m sphere cast
    pub spring_speed: f32,     // 8.0 — lerp speed
    pub fov_base: f32,         // 60°
    pub fov_sprint: f32,       // 75°
    pub fov_ads: f32,          // 40°
}

impl TpsCameraRig {
    pub fn update(&mut self, dt: f32, target: Vec3, input: &CameraInput, physics: &PhysicsWorld) -> CameraOutput {
        self.yaw += input.mouse_dx * sensitivity;
        self.pitch = (self.pitch + input.mouse_dy * sensitivity).clamp(-80.0, 80.0);
        
        let rotation = Quat::from_euler(EulerRot::YXZ, self.yaw.to_radians(), self.pitch.to_radians(), 0.0);
        let offset = rotation * Vec3::new(0.0, 0.0, -self.arm_length);
        let shoulder = rotation * self.shoulder_offset;
        let ideal_pos = target + shoulder + offset;
        
        // Collision: sphere cast from target to ideal
        let actual_pos = if let Some(hit) = physics.sphere_cast(
            self.collision_radius, target + shoulder, offset.normalize(), offset.length(),
            CollisionLayer::WORLD_STATIC,
        ) {
            target + shoulder + offset.normalize() * (hit.distance - 0.1)
        } else {
            ideal_pos
        };
        
        // FOV
        let target_fov = if input.ads { self.fov_ads } 
                         else if input.sprint { self.fov_sprint } 
                         else { self.fov_base };
        
        CameraOutput {
            position: actual_pos,
            look_at: target + Vec3::Y * 1.5,
            fov: lerp(current_fov, target_fov, dt * 8.0),
        }
    }
}
```

### FPS (First-Person, Head Bone)

```rust
pub struct FpsCameraRig {
    pub head_bone: BoneId,
    pub eye_offset: Vec3,  // (0.0, 0.08, 0.1) above+forward from head bone
}

impl FpsCameraRig {
    pub fn update(&self, skeleton: &Skeleton, yaw: f32, pitch: f32) -> CameraOutput {
        let head_world = skeleton.bone_world_transform(self.head_bone);
        let pos = head_world.position + head_world.rotation * self.eye_offset;
        let rot = Quat::from_euler(EulerRot::YXZ, yaw, pitch, 0.0);
        CameraOutput { position: pos, rotation: rot, fov: 70.0 }
    }
}
```

---

## F. NPC Locomotion & Animation State Machine

```rust
#[derive(Debug, Clone, PartialEq)]
pub enum LocomotionState {
    Idle,
    Walk,
    Run,
    TurnInPlace(f32),  // target angle
    InAir,
    Landing,
}

pub struct NPCController {
    pub character: CharacterController,
    pub state: LocomotionState,
    pub anim_mixer: AnimationMixer,
    pub bone_map: HumanoidBoneMap,    // retarget mapping
    pub foot_ik: Option<FootIK>,
    
    // AI navigation
    pub nav_target: Option<Vec3>,
    pub waypoints: Vec<Vec3>,
    pub current_waypoint: usize,
}

/// Universal bone retarget mapping
pub struct HumanoidBoneMap {
    pub hips: String,
    pub spine: String,
    pub chest: String,
    pub head: String,
    pub hand_r: String,
    pub hand_l: String,
    pub upper_arm_r: String,
    pub upper_arm_l: String,
    pub lower_arm_r: String,
    pub lower_arm_l: String,
    pub upper_leg_r: String,
    pub upper_leg_l: String,
    pub lower_leg_r: String,
    pub lower_leg_l: String,
    pub foot_r: String,
    pub foot_l: String,
}

impl HumanoidBoneMap {
    /// Auto-detect from bone names (handles KayKit, Mixamo, custom)
    pub fn auto_detect(skeleton: &Skeleton) -> Self {
        // Try patterns: "Hand.R", "mixamorig:RightHand", "PalmR", "hand_r"
        // Score-based matching
        todo!()
    }
}

pub struct FootIK {
    pub foot_r_bone: BoneId,
    pub foot_l_bone: BoneId,
    pub raycast_height: f32,    // 0.5m above foot
    pub raycast_depth: f32,     // 1.0m below foot
    pub hip_offset_blend: f32,  // 0.5 — how much to lower hips
}

impl FootIK {
    pub fn solve(&self, skeleton: &mut Skeleton, physics: &PhysicsWorld) {
        for foot in [self.foot_r_bone, self.foot_l_bone] {
            let foot_world = skeleton.bone_world_transform(foot).position;
            let ray_origin = foot_world + Vec3::Y * self.raycast_height;
            
            if let Some(hit) = physics.raycast(
                ray_origin, Vec3::NEG_Y, 
                self.raycast_height + self.raycast_depth,
                CollisionLayer::WORLD_STATIC,
            ) {
                let target_y = hit.point.y;
                let current_y = foot_world.y;
                let offset = target_y - current_y;
                
                // Offset foot bone in local space
                let local_offset = skeleton.world_to_bone_direction(foot, Vec3::Y * offset);
                skeleton.bone_mut(foot).local_position += local_offset;
                
                // Align foot to ground normal
                let ground_rot = Quat::from_rotation_arc(Vec3::Y, hit.normal);
                skeleton.bone_mut(foot).local_rotation = ground_rot * skeleton.bone(foot).local_rotation;
            }
        }
    }
}
```

---

## G. Water System

```rust
pub struct WaterVolume {
    pub aabb: Aabb,                    // bounding box of water area
    pub surface_y: f32,                // water surface height
    pub wade_depth: f32,               // 0.8m — transition to wading
    pub swim_depth: f32,               // 1.4m — transition to swimming
    pub buoyancy_force: f32,           // 9.81 (counteracts gravity)
    pub drag: f32,                     // 0.95 per frame
    pub current: Vec3,                 // water current direction + speed
    pub wave_preset: WavePreset,       // for rendering (Gerstner params)
}

#[derive(Clone)]
pub enum WavePreset {
    Calm    { amplitude: f32, frequency: f32 },
    Choppy  { amplitude: f32, frequency: f32 },
    Storm   { amplitude: f32, frequency: f32 },
    Custom  { waves: Vec<GerstnerWave> },
}

pub struct GerstnerWave {
    pub direction: Vec2,
    pub steepness: f32,
    pub wavelength: f32,
    pub speed: f32,
}

impl WaterVolume {
    pub fn character_interaction(&self, char: &mut CharacterController, dt: f32) {
        let depth = self.surface_y - char.transform.position.y;
        
        if depth <= 0.0 { return; } // above water
        
        if depth < self.wade_depth {
            // Wading — slow movement
            char.move_speed *= 0.6;
        } else if depth < self.swim_depth {
            // Deep wading — very slow, can still walk
            char.move_speed *= 0.3;
            char.velocity.y += self.buoyancy_force * 0.5 * dt;
        } else {
            // Swimming — full buoyancy, no gravity, swim controls
            char.velocity.y += self.buoyancy_force * dt;
            char.velocity *= self.drag;
            char.is_swimming = true;
            
            // Clamp to surface
            if char.transform.position.y > self.surface_y - 0.3 {
                char.transform.position.y = self.surface_y - 0.3;
                char.velocity.y = char.velocity.y.min(0.0);
            }
        }
        
        // Apply current
        char.velocity += self.current * dt;
    }
}
```

---

## H. Climbing & Ledge Grab

```rust
#[derive(Debug, Clone, PartialEq)]
pub enum ClimbState {
    None,
    Approaching,       // moving toward wall
    Grabbing(LedgeInfo), // hanging from ledge
    Pulling,           // pulling up animation
    Mantling,          // final hop over ledge
    Climbing(WallInfo), // vertical surface climbing (ladders, vines)
}

pub struct LedgeInfo {
    pub edge_point: Vec3,      // world position of ledge edge
    pub wall_normal: Vec3,     // outward normal of the wall face
    pub surface_y: f32,        // top of the ledge (where we end up)
    pub width: f32,            // how wide the ledge is (for shimmy)
}

pub struct WallInfo {
    pub surface_normal: Vec3,
    pub climbable: bool,       // tagged in collision layer or material
}

pub struct ClimbSystem {
    pub state: ClimbState,
    
    // Detection params
    pub ledge_detect_range: f32,      // 0.6m forward
    pub ledge_detect_height: Vec2,    // (1.5, 2.5) — min/max height above feet
    pub wall_detect_range: f32,       // 0.4m forward
    pub grab_reach: f32,              // 0.8m — how far hands can reach up
    
    // Movement params  
    pub climb_speed: f32,             // 2.0 m/s vertical
    pub shimmy_speed: f32,            // 1.5 m/s horizontal along ledge
    pub mantle_duration: f32,         // 0.4s
    pub pull_up_duration: f32,        // 0.6s
}

impl ClimbSystem {
    /// Called each frame when near geometry
    pub fn detect_ledge(
        &self,
        char_pos: Vec3,
        char_forward: Vec3,
        physics: &PhysicsWorld,
    ) -> Option<LedgeInfo> {
        // Step 1: Forward ray at chest height — must HIT a wall
        let chest_y = char_pos.y + 1.2;
        let wall_hit = physics.raycast(
            Vec3::new(char_pos.x, chest_y, char_pos.z),
            char_forward,
            self.ledge_detect_range,
            CollisionLayer::WORLD_STATIC,
        )?;
        
        // Step 2: Downward ray from above the wall — find the top edge
        // Cast from high above, slightly past the wall
        let over_wall = wall_hit.point + char_forward * 0.1;
        for probe_y in [2.5, 2.2, 1.9, 1.6] {
            let origin = Vec3::new(over_wall.x, char_pos.y + probe_y, over_wall.z);
            if let Some(top_hit) = physics.raycast(
                origin, Vec3::NEG_Y, probe_y,
                CollisionLayer::WORLD_STATIC,
            ) {
                let ledge_y = top_hit.point.y;
                let height_above_feet = ledge_y - char_pos.y;
                
                // Must be within reachable range
                if height_above_feet >= self.ledge_detect_height.x 
                   && height_above_feet <= self.ledge_detect_height.y {
                    return Some(LedgeInfo {
                        edge_point: Vec3::new(wall_hit.point.x, ledge_y, wall_hit.point.z),
                        wall_normal: wall_hit.normal,
                        surface_y: ledge_y,
                        width: 2.0, // could probe sideways
                    });
                }
            }
        }
        None
    }
    
    pub fn update(
        &mut self,
        char: &mut CharacterController,
        input: &CharacterInput,
        physics: &PhysicsWorld,
        dt: f32,
    ) {
        match &self.state {
            ClimbState::None => {
                // Auto-detect when jumping near a ledge
                if !char.is_grounded && char.velocity.y < 0.5 {
                    if let Some(ledge) = self.detect_ledge(
                        char.transform.position, char.transform.forward(), physics
                    ) {
                        // Grab if jump button held or within auto-grab window
                        if input.jump_held {
                            self.state = ClimbState::Grabbing(ledge);
                            char.velocity = Vec3::ZERO;
                        }
                    }
                }
            }
            
            ClimbState::Grabbing(ledge) => {
                // Hang position: hands at ledge, body against wall
                let hang_pos = ledge.edge_point 
                    + ledge.wall_normal * 0.3  // offset from wall
                    + Vec3::NEG_Y * 1.6;       // hands above head
                char.transform.position = char.transform.position.lerp(hang_pos, dt * 10.0);
                
                // Face wall
                let face_dir = -ledge.wall_normal;
                char.transform.rotation = Quat::from_rotation_arc(Vec3::Z, face_dir);
                
                // Shimmy left/right
                if input.move_direction().x.abs() > 0.1 {
                    let right = Vec3::Y.cross(ledge.wall_normal).normalize();
                    char.transform.position += right * input.move_direction().x * self.shimmy_speed * dt;
                }
                
                // Pull up
                if input.jump_pressed || input.move_direction().z > 0.5 {
                    self.state = ClimbState::Pulling;
                }
                
                // Drop
                if input.crouch_pressed {
                    self.state = ClimbState::None;
                }
            }
            
            ClimbState::Pulling => {
                // Animate character up and over the ledge
                // Lerp position from hang to top of ledge
                let target = Vec3::new(
                    char.transform.position.x - char.transform.forward().x * 0.5,
                    self.current_ledge_y() + 0.1,
                    char.transform.position.z - char.transform.forward().z * 0.5,
                );
                char.transform.position = char.transform.position.lerp(target, dt * 4.0);
                
                if (char.transform.position.y - target.y).abs() < 0.1 {
                    self.state = ClimbState::None;
                }
            }
            
            ClimbState::Climbing(wall) => {
                // Vertical climbing (ladder/vine)
                char.velocity = Vec3::ZERO;
                
                if input.move_direction().z > 0.1 {
                    char.transform.position.y += self.climb_speed * dt;
                } else if input.move_direction().z < -0.1 {
                    char.transform.position.y -= self.climb_speed * dt;
                }
                
                // Stick to wall
                let to_wall = physics.raycast(
                    char.transform.position, -wall.surface_normal, 1.0,
                    CollisionLayer::WORLD_STATIC,
                );
                if let Some(hit) = to_wall {
                    char.transform.position = hit.point + wall.surface_normal * 0.35;
                }
                
                // Jump off wall
                if input.jump_pressed {
                    char.velocity = wall.surface_normal * 3.0 + Vec3::Y * 4.0;
                    self.state = ClimbState::None;
                }
                
                // Reach top → mantle
                if let Some(ledge) = self.detect_ledge(
                    char.transform.position, -wall.surface_normal, physics
                ) {
                    if ledge.surface_y - char.transform.position.y < 0.3 {
                        self.state = ClimbState::Grabbing(ledge);
                    }
                }
            }
            
            _ => {}
        }
    }
    
    fn current_ledge_y(&self) -> f32 {
        match &self.state {
            ClimbState::Grabbing(l) | ClimbState::Pulling => {
                if let ClimbState::Grabbing(l) = &self.state { l.surface_y }
                else { 0.0 } // shouldn't happen
            }
            _ => 0.0,
        }
    }
}
```

### Climbing Animations Required

| State | Animation | Notes |
|-------|-----------|-------|
| Grabbing | `ledge_hang_idle` | Hands gripping edge, feet dangling |
| Grabbing + move | `ledge_shimmy` | Side-to-side along ledge |
| Pulling | `ledge_climb_up` | Pull-up → mantle over |
| Climbing | `wall_climb` | Vertical climb loop |
| Wall jump | `wall_jump` | Push off wall, backflip optional |

---

## I. Update Order & Frame Scheduler

**Order matters.** Wrong order = jitter, one-frame-late cameras, physics desync.

```rust
pub struct FrameScheduler {
    pub fixed_timestep: f32,       // 1/60 = 0.01667s
    pub accumulator: f32,
    pub max_substeps: u32,         // 4 — prevent spiral of death
    pub interpolation_alpha: f32,  // for render interpolation
}

impl FrameScheduler {
    /// Main game loop — called once per frame
    pub fn tick(&mut self, dt: f32, world: &mut World) {
        // ╔══════════════════════════════════════╗
        // ║  FRAME START                          ║
        // ╚══════════════════════════════════════╝
        
        // 1. INPUT (gather all input first)
        world.input_system.poll();
        
        // 2. AI / DECISION (NPCs decide what to do)
        world.npc_ai_system.update(dt);         // pathfinding, target selection
        world.agent_system.update(dt);           // player AI agent commands
        
        // ╔══════════════════════════════════════╗
        // ║  FIXED UPDATE (physics timestep)      ║
        // ╚══════════════════════════════════════╝
        self.accumulator += dt;
        let mut steps = 0;
        while self.accumulator >= self.fixed_timestep && steps < self.max_substeps {
            self.accumulator -= self.fixed_timestep;
            steps += 1;
            let fdt = self.fixed_timestep;
            
            // 3. CHARACTER CONTROLLERS (kinematic movement)
            world.player_controller.update(fdt, &world.input, &world.physics);
            for npc in &mut world.npcs {
                npc.controller.update(fdt, &npc.ai_input, &world.physics);
            }
            
            // 4. VEHICLE PHYSICS
            world.vehicle_system.update(fdt, &world.physics);
            
            // 5. WATER INTERACTION
            for water in &world.water_volumes {
                water.character_interaction(&mut world.player_controller, fdt);
                for npc in &mut world.npcs {
                    water.character_interaction(&mut npc.controller, fdt);
                }
            }
            
            // 6. CLIMBING
            world.climb_system.update(
                &mut world.player_controller, &world.input, &world.physics, fdt
            );
            
            // 7. PHYSICS STEP (Rapier)
            world.physics.step(fdt);
            
            // 8. COLLISION EVENTS (triggers, damage)
            world.collision_events.process(&world.physics);
            world.damage_system.update(fdt);
        }
        self.interpolation_alpha = self.accumulator / self.fixed_timestep;
        
        // ╔══════════════════════════════════════╗
        // ║  VARIABLE UPDATE (per-frame)          ║
        // ╚══════════════════════════════════════╝
        
        // 9. ANIMATION (after physics positions are final)
        world.animation_system.update(dt);       // advance all mixers
        
        // 10. IK (after animation, before camera)
        world.weapon_system.apply_two_handed_ik(dt);  // left hand → weapon grip
        for npc in &mut world.npcs {
            if let Some(ik) = &npc.foot_ik {
                ik.solve(&mut npc.skeleton, &world.physics);
            }
        }
        
        // 11. WEAPON EQUIP (update positions after IK)
        world.weapon_system.update_socket_positions();
        
        // 12. CAMERA (ALWAYS LAST before render)
        world.camera.update(dt, world.player_controller.transform.position, &world.input);
        
        // 13. VFX / PARTICLES
        world.particle_system.update(dt);
        world.weather_system.update(dt);
        
        // 14. UI / HUD
        world.hud.update(&world.player_controller, &world.weapon_system);
        
        // 15. RENDER
        world.renderer.render(
            &world.scene,
            &world.camera,
            self.interpolation_alpha,
        );
        
        // 16. CLEANUP
        world.despawn_queue.process();
    }
}
```

### Why This Order

| Step | Why here |
|------|----------|
| Input first | Everything else reacts to input |
| AI before physics | NPCs need decisions before movement |
| Characters before physics step | Kinematic bodies set positions, then Rapier resolves |
| Water after movement | Modifies velocity after character moves |
| Climbing after water | Can override character position entirely |
| Animation after physics | Skeleton needs final world positions |
| IK after animation | Overrides specific bones post-animation |
| Camera LAST | Must see final character position — one frame of lag is visible |
| Render after camera | Obviously |

### Fixed vs Variable Timestep

- **Fixed (physics, movement, collision)**: Deterministic, reproducible, no dt-dependent bugs
- **Variable (animation, camera, VFX, UI)**: Smooth at any framerate, no wasted work
- **Interpolation alpha**: Render between last and current physics state for sub-frame smoothness

---

## J. Tooling, QA & File Layout

### Project Structure

```
crate-engine-rs/
├── Cargo.toml
├── assets/
│   ├── models/
│   │   ├── characters/
│   │   │   ├── knight.glb
│   │   │   └── knight.asset.toml
│   │   ├── weapons/
│   │   │   ├── sword_iron.glb
│   │   │   └── sword_iron.asset.toml
│   │   ├── buildings/
│   │   └── environment/
│   ├── animations/
│   │   ├── humanoid/          # shared Mixamo anims
│   │   └── overrides/         # per-character overrides
│   ├── shaders/
│   │   ├── terrain.wgsl
│   │   ├── water_gerstner.wgsl
│   │   └── pbr.wgsl
│   └── ui/
├── src/
│   ├── main.rs
│   ├── lib.rs
│   ├── app.rs                 # winit event loop, frame scheduler
│   ├── input.rs               # keyboard/mouse/gamepad
│   ├── renderer/
│   │   ├── mod.rs
│   │   ├── pipeline.rs        # wgpu render pipelines
│   │   ├── mesh.rs
│   │   ├── material.rs
│   │   ├── terrain.rs
│   │   ├── water.rs           # Gerstner wave shader
│   │   ├── particles.rs
│   │   ├── skybox.rs
│   │   └── ui_overlay.rs      # HUD, menus
│   ├── physics/
│   │   ├── mod.rs             # Rapier world wrapper
│   │   ├── collision_layers.rs
│   │   └── queries.rs         # raycast, shape cast helpers
│   ├── character/
│   │   ├── mod.rs
│   │   ├── controller.rs      # CharacterController
│   │   ├── states.rs          # state machine
│   │   ├── climbing.rs        # ClimbSystem
│   │   └── swimming.rs
│   ├── npc/
│   │   ├── mod.rs
│   │   ├── controller.rs      # NPCController
│   │   ├── ai.rs              # behavior trees / state machines
│   │   └── locomotion.rs      # animation state machine
│   ├── animation/
│   │   ├── mod.rs
│   │   ├── mixer.rs           # blend tree
│   │   ├── retarget.rs        # HumanoidBoneMap
│   │   ├── ik.rs              # foot IK, two-handed weapon IK
│   │   └── skeleton.rs
│   ├── weapon/
│   │   ├── mod.rs
│   │   ├── database.rs        # weapon stats
│   │   ├── equip.rs           # socket attachment, holster
│   │   └── combat.rs          # damage, hit detection
│   ├── camera/
│   │   ├── mod.rs
│   │   ├── tps.rs             # third-person spring arm
│   │   └── fps.rs             # first-person
│   ├── world/
│   │   ├── mod.rs
│   │   ├── terrain.rs         # heightmap, vertex colors
│   │   ├── water_volume.rs
│   │   ├── interior.rs        # buildings, doors
│   │   └── templates.rs       # JSON map templates
│   ├── asset/
│   │   ├── mod.rs
│   │   ├── importer.rs        # AssetImporter
│   │   ├── catalog.rs         # runtime asset registry
│   │   └── loader.rs          # async GLB/texture loading
│   ├── agent/
│   │   ├── mod.rs
│   │   ├── interpreter.rs     # NL → intent
│   │   ├── actions.rs         # intent → engine calls
│   │   └── llm.rs             # LLM API client
│   └── net/
│       ├── mod.rs
│       └── multiplayer.rs     # WebSocket client/server
├── tests/
│   ├── character_tests.rs
│   ├── physics_tests.rs
│   ├── climb_tests.rs
│   └── integration/
│       └── smoke_test.rs
└── tools/
    ├── asset_validator.rs     # CLI: validate all .asset.toml + GLBs
    └── bone_inspector.rs      # CLI: dump skeleton hierarchy of a GLB
```

### Tooling

#### Asset Validator (`cargo run --bin asset_validator`)

```rust
/// Validates every .asset.toml has a matching .glb, sockets reference real bones,
/// collision shapes are reasonable, LODs exist if referenced.
fn validate_all_assets(asset_dir: &Path) -> Vec<ValidationError> {
    let mut errors = vec![];
    
    for toml_path in glob(asset_dir, "**/*.asset.toml") {
        let meta: AssetMetadata = load_toml(&toml_path);
        let glb_path = toml_path.parent().join(&meta.model.path);
        
        // GLB exists?
        if !glb_path.exists() {
            errors.push(ValidationError::MissingGlb(glb_path));
            continue;
        }
        
        let gltf = load_gltf(&glb_path);
        let skeleton = extract_skeleton(&gltf);
        
        // Sockets reference real bones?
        for (slot, bone_name) in &meta.sockets {
            if !skeleton.has_bone(bone_name) {
                errors.push(ValidationError::MissingBone {
                    asset: toml_path.clone(),
                    slot: slot.clone(),
                    bone: bone_name.clone(),
                    available: skeleton.bone_names(),
                });
            }
        }
        
        // Scale sanity (character should be ~1.5-2.5m tall after import)
        let imported = AssetImporter::import(&glb_path, &meta);
        let height = imported.aabb.max.y - imported.aabb.min.y;
        if height < 0.5 || height > 5.0 {
            errors.push(ValidationError::SuspiciousScale {
                asset: toml_path.clone(),
                height,
            });
        }
        
        // LODs exist?
        for lod_path in meta.lods.values() {
            let full = asset_dir.join(lod_path);
            if !full.exists() {
                errors.push(ValidationError::MissingLod(full));
            }
        }
    }
    
    errors
}
```

#### Bone Inspector (`cargo run --bin bone_inspector -- knight.glb`)

```
$ bone_inspector assets/models/characters/knight.glb
Skeleton: 24 joints
├── Armature (root)
│   └── Hips
│       ├── Torso
│       │   ├── Chest
│       │   │   ├── Neck → Head
│       │   │   ├── Shoulder.R → UpperArm.R → LowerArm.R → PalmR
│       │   │   │   └── MiddleHandR
│       │   │   └── Shoulder.L → UpperArm.L → LowerArm.L → PalmL
│       │   │       └── MiddleHandL
│       │   └── Abdomen
│       ├── UpperLeg.R → LowerLeg.R → Foot.R
│       └── UpperLeg.L → LowerLeg.L → Foot.L

Animations: 12
  HumanArmature|Idle (2.0s, 48 frames)
  HumanArmature|Walking (1.0s, 24 frames)
  HumanArmature|Run (0.67s, 16 frames)
  ...

Auto-detected HumanoidBoneMap:
  hips: Hips
  hand_r: PalmR
  hand_l: PalmL
  foot_r: Foot.R
  foot_l: Foot.L
```

### Acceptance Tests

```rust
#[cfg(test)]
mod tests {
    /// Character spawns at terrain height, not at y=0
    #[test]
    fn character_spawns_on_terrain() {
        let mut world = TestWorld::with_terrain(/* hills */);
        let spawn = Vec3::new(10.0, 100.0, 10.0); // intentionally high
        world.spawn_player(spawn);
        world.tick(0.5); // let gravity settle
        
        let terrain_y = world.terrain_height_at(10.0, 10.0);
        let player_y = world.player_position().y;
        assert!((player_y - terrain_y).abs() < 0.1, 
            "Player should be on terrain (expected ~{terrain_y}, got {player_y})");
    }
    
    /// Character can walk up 0.25m steps without jumping
    #[test]
    fn step_up_small_steps() {
        let mut world = TestWorld::with_stairs(step_height: 0.25);
        world.spawn_player(Vec3::new(0.0, 0.0, -1.0));
        
        // Walk forward into stairs
        for _ in 0..120 { // 2 seconds at 60fps
            world.set_input(CharacterInput { forward: true, ..default() });
            world.tick(1.0 / 60.0);
        }
        
        assert!(world.player_position().y > 0.2, "Player should have stepped up");
        assert!(world.player_position().z > 0.0, "Player should have moved forward");
    }
    
    /// Character cannot walk up steep slopes (>45°)
    #[test]
    fn blocked_by_steep_slope() {
        let mut world = TestWorld::with_slope(angle_degrees: 60.0);
        world.spawn_player(Vec3::ZERO);
        let start_y = world.player_position().y;
        
        for _ in 0..120 {
            world.set_input(CharacterInput { forward: true, ..default() });
            world.tick(1.0 / 60.0);
        }
        
        assert!((world.player_position().y - start_y).abs() < 0.5, 
            "Player should not climb 60° slope");
    }
    
    /// Ledge grab activates when jumping near a wall edge
    #[test]
    fn ledge_grab_detection() {
        let mut world = TestWorld::with_wall(height: 2.5);
        world.spawn_player(Vec3::new(0.0, 0.0, -1.0));
        
        // Jump toward wall
        world.set_input(CharacterInput { forward: true, jump_pressed: true, jump_held: true, ..default() });
        world.tick(1.0 / 60.0);
        
        // Continue forward + holding jump for 1 second
        for _ in 0..60 {
            world.set_input(CharacterInput { forward: true, jump_held: true, ..default() });
            world.tick(1.0 / 60.0);
        }
        
        assert!(matches!(world.climb_state(), ClimbState::Grabbing(_)), 
            "Should grab ledge");
    }
    
    /// Weapons attach to correct socket bone
    #[test]
    fn weapon_socket_attachment() {
        let mut world = TestWorld::new();
        world.spawn_player_with_model("knight");
        world.equip_weapon("sword_iron", EquipSlot::HandR);
        world.tick(1.0 / 60.0);
        
        let weapon_pos = world.weapon_world_position("sword_iron");
        let hand_pos = world.bone_world_position("PalmR");
        let distance = (weapon_pos - hand_pos).length();
        
        assert!(distance < 0.3, "Weapon should be near hand bone (distance: {distance})");
    }
    
    /// Water volume applies buoyancy
    #[test]
    fn water_buoyancy() {
        let mut world = TestWorld::with_water(surface_y: 2.0);
        world.spawn_player(Vec3::new(0.0, 5.0, 0.0)); // above water
        
        // Fall into water
        for _ in 0..300 { // 5 seconds
            world.tick(1.0 / 60.0);
        }
        
        let y = world.player_position().y;
        assert!(y > 1.0 && y < 2.5, "Player should float near surface (y={y})");
    }
    
    /// Camera doesn't clip through walls
    #[test]
    fn camera_collision() {
        let mut world = TestWorld::with_wall_behind_player();
        world.spawn_player(Vec3::ZERO);
        world.set_camera_mode(CameraMode::TPS { arm_length: 4.0 });
        world.tick(1.0 / 60.0);
        
        let cam_pos = world.camera_position();
        // Camera should be pushed forward (closer to player) by wall
        let distance = (cam_pos - world.player_position()).length();
        assert!(distance < 4.0, "Camera should be closer due to wall collision");
    }
    
    /// NPC foot IK adjusts to terrain
    #[test]
    fn npc_foot_ik_on_slope() {
        let mut world = TestWorld::with_slope(angle_degrees: 20.0);
        let npc = world.spawn_npc("knight", Vec3::new(0.0, 0.0, 0.0));
        world.tick(1.0 / 60.0);
        
        let foot_r = world.npc_bone_position(npc, "Foot.R");
        let foot_l = world.npc_bone_position(npc, "Foot.L");
        let terrain_r = world.terrain_height_at(foot_r.x, foot_r.z);
        let terrain_l = world.terrain_height_at(foot_l.x, foot_l.z);
        
        assert!((foot_r.y - terrain_r).abs() < 0.15, "Right foot should be on terrain");
        assert!((foot_l.y - terrain_l).abs() < 0.15, "Left foot should be on terrain");
    }
}
```

### Common Failure Modes & Mitigations

| Failure | Cause | Mitigation |
|---------|-------|------------|
| Character falls through terrain | Raycast misses thin geometry / wrong direction | Use shape cast (capsule) instead of ray; snap-to-ground after physics step |
| One-frame camera jitter | Camera reads position before character updates | Enforce update order: character → IK → camera (Section I) |
| Weapon floats away from hand | Bone world scale not accounted for | Always compute world transform of socket bone, attach in world space |
| NPC moonwalking | Animation speed doesn't match move speed | `anim_speed = velocity.length() / reference_speed` per animation |
| Spiral of death (FPS drops → more physics → more drops) | Unbounded physics substeps | Cap at `max_substeps` (4), accept slowdown over explosion |
| Swimming oscillation | Buoyancy overshoots surface | Clamp position to surface, zero upward velocity when at surface |
| Ledge grab on wrong geometry | Detects any wall edge including fences, thin walls | Tag climbable surfaces with collision layer or material flag |
| Weapon clips through body during holster | Back-mount position doesn't account for all body types | Per-character holster offset in `.asset.toml` sockets section |
| Animations T-pose flash on spawn | Animation not loaded/playing before first render | Load animations with model, start Idle immediately, skip first frame render |
| Physics tunneling (fast projectiles) | Bullet passes through wall in one step | CCD (continuous collision detection) on projectiles, or use raycasts for hitscan |

---

## Phased Implementation Plan

### Phase 1: Foundation (Weeks 1-3)
- [ ] Window + wgpu renderer (triangle on screen)
- [ ] GLB loader with asset metadata pipeline
- [ ] Basic terrain (heightmap + vertex colors)
- [ ] Character controller (capsule, ground detection, movement)
- [ ] TPS camera with collision
- [ ] Input system (keyboard + mouse)

### Phase 2: Core Gameplay (Weeks 4-6)
- [ ] Animation system (mixer, blend tree, state machine)
- [ ] Bone retarget (HumanoidBoneMap auto-detect)
- [ ] Weapon equip (socket attachment, holster, draw/sheathe)
- [ ] Two-handed IK
- [ ] Combat (melee + ranged, hit detection, damage)
- [ ] FPS mode + weapon viewmodel

### Phase 3: World (Weeks 7-9)
- [ ] Gerstner wave water (WGSL shader)
- [ ] Water volumes (buoyancy, swimming)
- [ ] Interior buildings (floors, walls, doors)
- [ ] NPC controller + AI (patrol, chase, attack)
- [ ] Foot IK for NPCs
- [ ] JSON map templates

### Phase 4: Advanced (Weeks 10-12)
- [ ] Climbing & ledge grab
- [ ] Stairs & slopes (step-up)
- [ ] Vehicle physics
- [ ] Particle system (rain, snow, fire, embers)
- [ ] Skybox + time-of-day lighting
- [ ] Fog + weather system

### Phase 5: Polish & Integration (Weeks 13-15)
- [ ] HUD (health, stamina, ammo, minimap, crosshair)
- [ ] Inventory system (32-slot grid)
- [ ] AI agent (NL interpreter → action API)
- [ ] Multiplayer (WebSocket sync)
- [ ] Asset validator + bone inspector tools
- [ ] Performance profiling & optimization

### Phase 6: Ship (Week 16+)
- [ ] WASM build for browser deployment
- [ ] Native builds (macOS, Windows, Linux)
- [ ] 3D model generator integration
- [ ] Marketplace
- [ ] Documentation & examples

---

*Design complete. All 10 sections (A-J) covered. Ready to implement.*
