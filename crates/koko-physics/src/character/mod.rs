//! Kinematic character controller — capsule-based with step handling,
//! slope limits, ground snap, coyote jump, and camera rigs.

use glam::{Quat, Vec2, Vec3};
use serde::{Deserialize, Serialize};

/// Character controller config — tunable per-character
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterConfig {
    // Capsule shape
    pub capsule_radius: f32,
    pub capsule_half_height: f32,

    // Ground
    pub ground_snap_distance: f32,
    pub max_slope_degrees: f32,
    pub step_height: f32,

    // Movement
    pub walk_speed: f32,
    pub run_speed: f32,
    pub sprint_speed: f32,
    pub acceleration: f32,
    pub deceleration: f32,
    pub air_control: f32,
    pub friction: f32,

    // Jump
    pub jump_force: f32,
    pub gravity: f32,
    pub coyote_time: f32,
    pub jump_buffer: f32,
}

impl Default for CharacterConfig {
    fn default() -> Self {
        Self {
            capsule_radius: 0.3,
            capsule_half_height: 0.6,
            ground_snap_distance: 0.15,
            max_slope_degrees: 45.0,
            step_height: 0.35,
            walk_speed: 3.0,
            run_speed: 7.0,
            sprint_speed: 10.0,
            acceleration: 50.0,
            deceleration: 40.0,
            air_control: 0.3,
            friction: 8.0,
            jump_force: 7.0,
            gravity: -20.0,
            coyote_time: 0.12,
            jump_buffer: 0.1,
        }
    }
}

/// Input state fed to controller each frame
#[derive(Debug, Clone, Default)]
pub struct CharacterInput {
    /// Normalized XZ move direction (world-relative or camera-relative)
    pub move_direction: Vec2,
    pub run: bool,
    pub sprint: bool,
    pub jump_pressed: bool,
    pub crouch: bool,
    pub interact: bool,
    pub attack: bool,
    pub heavy_attack: bool,
    pub roll: bool,
}

/// Runtime state of a character controller
#[derive(Debug, Clone)]
pub struct CharacterState {
    pub position: Vec3,
    pub velocity: Vec3,
    pub facing: Quat,

    // Ground
    pub grounded: bool,
    pub ground_normal: Vec3,
    pub ground_distance: f32,

    // Timers
    pub time_since_grounded: f32,
    pub time_since_jump_pressed: f32,

    // Flags
    pub is_jumping: bool,
    pub is_rolling: bool,
    pub is_attacking: bool,
    pub is_dead: bool,
}

impl CharacterState {
    pub fn new(spawn_position: Vec3) -> Self {
        Self {
            position: spawn_position,
            velocity: Vec3::ZERO,
            facing: Quat::IDENTITY,
            grounded: false,
            ground_normal: Vec3::Y,
            ground_distance: 0.0,
            time_since_grounded: 1.0,
            time_since_jump_pressed: 1.0,
            is_jumping: false,
            is_rolling: false,
            is_attacking: false,
            is_dead: false,
        }
    }

    /// Total capsule height in world units
    pub fn capsule_height(&self, config: &CharacterConfig) -> f32 {
        config.capsule_half_height * 2.0 + config.capsule_radius * 2.0
    }

    /// Current speed (horizontal only)
    pub fn horizontal_speed(&self) -> f32 {
        Vec2::new(self.velocity.x, self.velocity.z).length()
    }
}

/// Core update — call once per frame
pub fn update_character(
    state: &mut CharacterState,
    input: &CharacterInput,
    config: &CharacterConfig,
    // ground_query: callback that returns (grounded, normal, distance) for a position
    ground_query: impl Fn(Vec3) -> (bool, Vec3, f32),
    // sweep_move: callback that resolves movement against colliders, returns actual displacement
    sweep_move: impl Fn(Vec3, Vec3) -> Vec3,
    dt: f32,
) {
    if state.is_dead { return; }

    // 1. Ground check
    let (grounded, normal, dist) = ground_query(state.position);
    let slope_angle = normal.angle_between(Vec3::Y).to_degrees();
    let on_valid_ground = grounded && slope_angle <= config.max_slope_degrees;

    if on_valid_ground {
        state.grounded = true;
        state.ground_normal = normal;
        state.ground_distance = dist;
        state.time_since_grounded = 0.0;
        if state.velocity.y < 0.0 {
            state.velocity.y = 0.0;
        }
        state.is_jumping = false;
    } else {
        state.grounded = false;
        state.time_since_grounded += dt;
    }

    // 2. Horizontal movement
    let control = if state.grounded { 1.0 } else { config.air_control };
    let target_speed = if input.sprint && state.grounded {
        config.sprint_speed
    } else if input.run {
        config.run_speed
    } else {
        config.walk_speed
    };

    let has_input = input.move_direction.length_squared() > 0.01;
    let accel = if has_input { config.acceleration } else { config.deceleration };

    let target_vel = if has_input {
        let dir = input.move_direction.normalize();
        Vec3::new(dir.x, 0.0, dir.y) * target_speed
    } else {
        Vec3::ZERO
    };

    // Move toward target horizontal velocity
    let current_h = Vec3::new(state.velocity.x, 0.0, state.velocity.z);
    let diff = target_vel - current_h;
    let max_change = accel * control * dt;
    let clamped = if diff.length() > max_change {
        diff.normalize() * max_change
    } else {
        diff
    };
    state.velocity.x += clamped.x;
    state.velocity.z += clamped.z;

    // 3. Gravity
    if !state.grounded {
        state.velocity.y += config.gravity * dt;
        // Terminal velocity
        state.velocity.y = state.velocity.y.max(-50.0);
    }

    // 4. Jump (coyote time + buffer)
    state.time_since_jump_pressed += dt;
    if input.jump_pressed {
        state.time_since_jump_pressed = 0.0;
    }

    let can_coyote = state.time_since_grounded < config.coyote_time;
    let has_buffer = state.time_since_jump_pressed < config.jump_buffer;

    if (state.grounded || can_coyote) && has_buffer && !state.is_jumping {
        state.velocity.y = config.jump_force;
        state.grounded = false;
        state.is_jumping = true;
        state.time_since_grounded = config.coyote_time + 0.01; // prevent double
        state.time_since_jump_pressed = config.jump_buffer + 0.01;
    }

    // 5. Resolve movement
    let desired = state.velocity * dt;
    let resolved = sweep_move(state.position, desired);
    state.position += resolved;

    // 6. Step handling (if horizontally blocked while grounded)
    let h_desired = Vec3::new(desired.x, 0.0, desired.z);
    let h_resolved = Vec3::new(resolved.x, 0.0, resolved.z);
    let h_blocked = h_desired.length_squared() > 0.0001
        && (h_resolved - h_desired).length() > 0.001 * h_desired.length();

    if h_blocked && state.grounded {
        // Try step up
        let step_up_pos = state.position + Vec3::new(0.0, config.step_height, 0.0);
        let step_forward = sweep_move(step_up_pos, h_desired);
        let step_down_start = step_up_pos + step_forward;

        let (found_ground, _, step_dist) = ground_query(step_down_start);
        if found_ground && step_dist < config.step_height + config.ground_snap_distance {
            // Step succeeded
            state.position = step_down_start - Vec3::new(0.0, step_dist, 0.0);
        }
    }

    // 7. Ground snap (prevent hovering on downslopes)
    if state.grounded && state.velocity.y <= 0.0 && state.ground_distance > 0.001
        && state.ground_distance < config.ground_snap_distance
    {
        state.position.y -= state.ground_distance;
    }

    // 8. Facing
    if has_input {
        let move_dir_3d = Vec3::new(input.move_direction.x, 0.0, input.move_direction.y).normalize();
        let target_yaw = move_dir_3d.z.atan2(move_dir_3d.x) - std::f32::consts::FRAC_PI_2;
        let target_facing = Quat::from_rotation_y(-target_yaw);
        state.facing = state.facing.slerp(target_facing, (10.0 * dt).min(1.0));
    }
}

/// Third-person camera with spring arm and collision
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThirdPersonCamera {
    pub arm_length: f32,
    pub arm_min: f32,
    pub arm_max: f32,
    pub height_offset: f32,
    pub shoulder_offset: f32,
    pub pitch: f32,
    pub yaw: f32,
    pub collision_radius: f32,
}

impl Default for ThirdPersonCamera {
    fn default() -> Self {
        Self {
            arm_length: 4.0,
            arm_min: 1.0,
            arm_max: 15.0,
            height_offset: 1.4,
            shoulder_offset: 0.4,
            pitch: 0.3,
            yaw: 0.0,
            collision_radius: 0.2,
        }
    }
}

impl ThirdPersonCamera {
    /// Compute camera position + look_at from player position
    /// `raycast_fn` returns hit distance if wall found between look_at and ideal_pos
    pub fn compute(
        &self,
        player_pos: Vec3,
        raycast_fn: impl Fn(Vec3, Vec3, f32) -> Option<f32>,
    ) -> (Vec3, Vec3) {
        let look_at = player_pos + Vec3::new(0.0, self.height_offset, 0.0);

        let offset = Vec3::new(
            self.arm_length * self.pitch.cos() * self.yaw.sin() + self.shoulder_offset,
            self.arm_length * self.pitch.sin(),
            self.arm_length * self.pitch.cos() * self.yaw.cos(),
        );

        let ideal_pos = look_at + offset;
        let dir = (ideal_pos - look_at).normalize();
        let max_dist = (ideal_pos - look_at).length();

        let actual_dist = if let Some(hit_dist) = raycast_fn(look_at, dir, max_dist) {
            (hit_dist - self.collision_radius).max(self.arm_min)
        } else {
            max_dist
        };

        let camera_pos = look_at + dir * actual_dist;
        (camera_pos, look_at)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn character_spawns_at_position() {
        let state = CharacterState::new(Vec3::new(0.0, 5.0, 0.0));
        assert_eq!(state.position.y, 5.0);
        assert!(!state.grounded);
    }

    #[test]
    fn basic_movement() {
        let config = CharacterConfig::default();
        let mut state = CharacterState::new(Vec3::ZERO);
        let input = CharacterInput {
            move_direction: Vec2::new(0.0, -1.0), // forward (-Z)
            ..Default::default()
        };

        // Grounded ground query
        let ground_fn = |_pos: Vec3| (true, Vec3::Y, 0.0);
        let sweep_fn = |_pos: Vec3, desired: Vec3| desired; // no obstacles

        update_character(&mut state, &input, &config, ground_fn, sweep_fn, 1.0 / 60.0);

        assert!(state.velocity.z < 0.0, "Should be moving forward (-Z)");
        assert!(state.position.z < 0.0, "Should have moved forward");
    }

    #[test]
    fn gravity_applies_in_air() {
        let config = CharacterConfig::default();
        let mut state = CharacterState::new(Vec3::new(0.0, 10.0, 0.0));
        let input = CharacterInput::default();

        let ground_fn = |_pos: Vec3| (false, Vec3::Y, 100.0);
        let sweep_fn = |_pos: Vec3, desired: Vec3| desired;

        update_character(&mut state, &input, &config, ground_fn, sweep_fn, 1.0 / 60.0);

        assert!(state.velocity.y < 0.0, "Gravity should pull down");
    }

    #[test]
    fn jump_with_coyote() {
        let config = CharacterConfig::default();
        let mut state = CharacterState::new(Vec3::ZERO);
        state.grounded = false;
        state.time_since_grounded = 0.05; // within coyote time

        let input = CharacterInput {
            jump_pressed: true,
            ..Default::default()
        };

        let ground_fn = |_pos: Vec3| (false, Vec3::Y, 100.0);
        let sweep_fn = |_pos: Vec3, desired: Vec3| desired;

        update_character(&mut state, &input, &config, ground_fn, sweep_fn, 1.0 / 60.0);

        assert!(state.velocity.y > 0.0, "Should have jumped via coyote time");
    }

    #[test]
    fn camera_collision() {
        let cam = ThirdPersonCamera::default();
        let player_pos = Vec3::ZERO;

        // Wall at 2m behind player
        let raycast = |_origin: Vec3, _dir: Vec3, _max: f32| -> Option<f32> {
            Some(2.0)
        };

        let (cam_pos, _look_at) = cam.compute(player_pos, raycast);
        let dist_from_player = (cam_pos - player_pos).length();
        assert!(dist_from_player < 3.0, "Camera should be pulled in by wall collision: got {}", dist_from_player);
    }
}
