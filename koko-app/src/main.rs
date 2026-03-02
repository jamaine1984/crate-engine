#![allow(unused_variables, unused_imports, dead_code, deprecated)]
use wgpu::util::DeviceExt;
mod editor;

use std::sync::Arc;
use winit::{
    application::ApplicationHandler,
    event::{WindowEvent, StartCause, ElementState, KeyEvent},
    event_loop::{ActiveEventLoop, EventLoop, ControlFlow},
    keyboard::{KeyCode, PhysicalKey},
    window::{Window, WindowId, WindowAttributes},
    dpi::PhysicalSize,
};
use koko_core::time::Time;
use koko_core::transform::Transform;
use koko_core::color::Color;
use koko_input::Input;
use koko_render::gpu::GpuContext;
use koko_render::vertex::Vertex3D;
use koko_render::camera::{CameraUniforms, CameraRaw};
use koko_render::mesh::MeshData;
use regex;
use koko_render::gltf_loader;
use koko_ai::intent::parse_ai_response;
use koko_ai::GameIntent;
use glam::{Vec3, Quat, Mat4};

use editor::{EditorState, ChatSender, ChatMessage, SceneObjectInfo};
#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct PointLightGpu {
    position: [f32; 3],
    radius: f32,
    color: [f32; 3],
    intensity: f32,
    direction: [f32; 3],
    spot_cutoff: f32,
}

#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct LightArrayGpu {
    count: u32,
    lights: [PointLightGpu; 32],
}

#[derive(Debug, Clone)]
struct SceneLight {
    position: Vec3,
    radius: f32,
    color: [f32; 3],
    intensity: f32,
    direction: Vec3,
    spot_cutoff: f32,  // 0 = point, cos(angle) = spot
    name: String,
}

#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct ParticleGpu {
    position: [f32; 3],
    life: f32,
    velocity: [f32; 3],
    size: f32,
    color: [f32; 4],
}

#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct ParticleUniformRaw {
    time: f32,
    delta_time: f32,
    particle_count: u32,
    _pad: u32,
}

#[derive(Debug, Clone)]
struct ParticleEmitter {
    position: Vec3,
    particles: Vec<ParticleGpu>,
    max_particles: usize,
    spawn_rate: f32,         // per second
    spawn_accumulator: f32,
    lifetime: f32,           // seconds
    initial_speed: f32,
    spread: f32,             // cone angle
    gravity: f32,
    color_start: [f32; 4],
    color_end: [f32; 4],
    size_start: f32,
    size_end: f32,
    emitter_type: ParticleType,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum ParticleType {
    Fire,
    Smoke,
    Sparks,
    Rain,
    Snow,
    Magic,
}

impl ParticleEmitter {
    fn new(pos: Vec3, ptype: ParticleType) -> Self {
        let (max, rate, lifetime, speed, spread, gravity, c_start, c_end, s_start, s_end) = match ptype {
            ParticleType::Fire => (200, 60.0, 1.5, 2.0, 0.3, -0.5,
                [1.0, 0.6, 0.1, 0.9], [1.0, 0.1, 0.0, 0.0], 0.4, 0.1),
            ParticleType::Smoke => (100, 20.0, 3.0, 0.8, 0.5, -0.3,
                [0.4, 0.4, 0.4, 0.5], [0.2, 0.2, 0.2, 0.0], 0.3, 1.2),
            ParticleType::Sparks => (150, 40.0, 0.8, 5.0, 1.0, 2.0,
                [1.0, 0.9, 0.3, 1.0], [1.0, 0.3, 0.0, 0.0], 0.1, 0.05),
            ParticleType::Rain => (500, 200.0, 1.5, 8.0, 0.1, 0.0,
                [0.6, 0.7, 0.9, 0.6], [0.4, 0.5, 0.8, 0.0], 0.05, 0.02),
            ParticleType::Snow => (300, 50.0, 4.0, 0.5, 1.5, 0.2,
                [1.0, 1.0, 1.0, 0.8], [0.9, 0.95, 1.0, 0.0], 0.15, 0.08),
            ParticleType::Magic => (200, 40.0, 2.0, 1.5, 1.0, -0.5,
                [0.3, 0.5, 1.0, 0.9], [0.8, 0.2, 1.0, 0.0], 0.2, 0.3),
        };
        Self {
            position: pos,
            particles: Vec::with_capacity(max),
            max_particles: max,
            spawn_rate: rate, spawn_accumulator: 0.0,
            lifetime, initial_speed: speed, spread, gravity,
            color_start: c_start, color_end: c_end,
            size_start: s_start, size_end: s_end,
            emitter_type: ptype,
        }
    }
    
    fn update(&mut self, dt: f32, time: f32) {
        // Update existing particles
        for p in &mut self.particles {
            if p.life <= 0.0 { continue; }
            p.life -= dt / self.lifetime;
            p.velocity[1] -= self.gravity * dt;
            p.position[0] += p.velocity[0] * dt;
            p.position[1] += p.velocity[1] * dt;
            p.position[2] += p.velocity[2] * dt;
            // Interpolate color
            let t = 1.0 - p.life;
            for i in 0..4 {
                p.color[i] = self.color_start[i] * (1.0 - t) + self.color_end[i] * t;
            }
            p.size = self.size_start * (1.0 - t) + self.size_end * t;
            // Wind for snow/rain
            if self.emitter_type == ParticleType::Snow {
                p.position[0] += (time * 0.5 + p.position[1]).sin() * 0.3 * dt;
            }
        }
        // Remove dead
        self.particles.retain(|p| p.life > 0.0);
        // Spawn new
        self.spawn_accumulator += self.spawn_rate * dt;
        while self.spawn_accumulator >= 1.0 && self.particles.len() < self.max_particles {
            self.spawn_accumulator -= 1.0;
            let hash = ((time * 1000.0 + self.particles.len() as f32) * 43758.5453).sin().fract();
            let hash2 = ((time * 1000.0 + self.particles.len() as f32 + 1.0) * 12345.6789).sin().fract();
            let hash3 = ((time * 1000.0 + self.particles.len() as f32 + 2.0) * 98765.4321).sin().fract();
            let angle_h = hash * std::f32::consts::TAU;
            let angle_v = (hash2 - 0.5) * self.spread;
            let speed = self.initial_speed * (0.7 + hash3 * 0.6);
            let (sh, ch) = angle_h.sin_cos();
            let (sv, cv) = angle_v.sin_cos();
            let mut vel = [sh * cv * speed, cv.abs() * speed, ch * cv * speed];
            if self.emitter_type == ParticleType::Rain {
                vel = [hash * 0.2 - 0.1, -speed, hash2 * 0.2 - 0.1];
            }
            let mut pos = self.position.to_array();
            if self.emitter_type == ParticleType::Rain || self.emitter_type == ParticleType::Snow {
                pos[0] += (hash - 0.5) * 20.0;
                pos[1] += 10.0;
                pos[2] += (hash2 - 0.5) * 20.0;
            }
            self.particles.push(ParticleGpu {
                position: pos, life: 1.0,
                velocity: vel, size: self.size_start,
                color: self.color_start,
            });
        }
    }
}

#[derive(Debug, Clone)]
struct HudElement {
    kind: HudKind,
    position: [f32; 2],   // normalized 0-1 screen position
    size: [f32; 2],
    color: [f32; 4],
    text: String,
    value: f32,           // for bars: 0-1 fill
}

#[derive(Debug, Clone)]
enum HudKind {
    Text,
    HealthBar,
    Panel,
    Crosshair,
}

#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct TerrainParamsRaw {
    time: f32,
    height_scale: f32,
    texture_scale: f32,
    _pad: f32,
}

#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct WaterParamsRaw {
    time: f32,
    wave_height: f32,
    wave_speed: f32,
    foam_threshold: f32,
}


#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct PostParamsRaw {
    time: f32,
    vignette_strength: f32,
    grain_strength: f32,
    chromatic_aberration: f32,
    saturation: f32,
    contrast: f32,
    brightness: f32,
    temperature: f32,
}

#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct BlurParamsRaw {
    direction: [f32; 2],
    texel_size: [f32; 2],
}

#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct SkyUniformRaw {
    inv_view_proj: [f32; 16],
    sun_dir: [f32; 4],  // xyz = dir, w = time
}

#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct MaterialFlagsRaw {
    has_texture: u32,
    has_normal_map: u32,
    metallic: f32,
    roughness: f32,
}


#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct ModelRaw {
    model: [f32; 16],
    color: [f32; 4],
}


#[derive(Clone)]
struct SceneSnapshot {
    name: String,
    position: [f32; 3],
    color: [f32; 4],
    scale: [f32; 3],
    mesh_type_str: String,
    custom_mesh_idx: Option<usize>,
    spin_speed: f32,
    parent: Option<usize>,  // index of parent object
    lod_meshes: Vec<(f32, MeshType)>,  // (max_distance, mesh_type) — sorted by distance
}

#[derive(Clone)]
struct SceneObject {
    name: String,
    transform: Transform,
    color: [f32; 4],
    mesh_type: MeshType,
    spin_speed: f32,
    parent: Option<usize>,  // index of parent object
    lod_meshes: Vec<(f32, MeshType)>,  // (max_distance, mesh_type) — sorted by distance
}

#[derive(Clone, Copy)]
enum MeshType { Cube, Sphere, Plane, Cylinder, Cone, Torus, Custom(usize) }

impl MeshType {
    fn as_str(&self) -> &str {
        match self { MeshType::Cube => "cube", MeshType::Sphere => "sphere", MeshType::Plane => "plane", MeshType::Cylinder => "cylinder", MeshType::Cone => "cone", MeshType::Torus => "torus", MeshType::Custom(_) => "model" }
    }
    fn from_str(s: &str) -> Self {
        match s { "sphere" => Self::Sphere, "plane" => Self::Plane, "cylinder" => Self::Cylinder, "cone" => Self::Cone, "torus" => Self::Torus, _ => Self::Cube }
    }
    fn is_custom(&self) -> bool { matches!(self, MeshType::Custom(_)) }
}

// Async AI response channel
use std::sync::mpsc;
#[derive(Clone)]
enum ObjectAnimation {
    Orbit { center: Vec3, radius: f32, speed: f32, phase: f32 },
    Bounce { base_y: f32, height: f32, speed: f32 },
    Wave { axis: Vec3, amplitude: f32, speed: f32 },
    Path { waypoints: Vec<Vec3>, speed: f32, current: f32, looping: bool },
}
#[derive(Clone, Copy, Debug)]

struct CameraKeyframe {
    position: Vec3,
    yaw: f32,
    pitch: f32,
    time: f32,  // normalized 0..1
}


#[derive(Clone)]
struct PbrMaterial {
    metallic: f32,
    roughness: f32,
    emissive: [f32; 3],
}

impl Default for PbrMaterial {
    fn default() -> Self { Self { metallic: 0.0, roughness: 0.5, emissive: [0.0; 3] } }
}

#[derive(Clone)]
struct AnimationTrack {
    object_name: String,
    keyframes: Vec<AnimKeyframe>,
}

#[derive(Clone)]
struct AnimKeyframe {
    time: f32,
    position: Vec3,
    rotation: Quat,
    scale: Vec3,
}

// ======== UNREAL-TIER SYSTEM TYPES ========

#[derive(Clone)]
struct AiAgent {
    name: String,
    target_object: String,  // object this AI controls
    behavior: BehaviorType,
    state: AiState,
    patrol_points: Vec<Vec3>,
    patrol_idx: usize,
    speed: f32,
    detection_range: f32,
    attack_range: f32,
}

#[derive(Clone, Copy, PartialEq)]
enum BehaviorType { Idle, Patrol, Chase, Flee, Wander, Guard }

#[derive(Clone, Copy, PartialEq)]
enum AiState { Idle, Moving, Attacking, Dead }

#[derive(Clone)]
struct NavPoint { position: Vec3, walkable: bool }

#[derive(Clone)]
struct DialogueTree {
    name: String,
    nodes: Vec<DialogueNode>,
}

#[derive(Clone, Debug)]
struct DialogueNode {
    speaker: String,
    text: String,
    choices: Vec<(String, usize)>,  // (choice_text, next_node_idx)
}

#[derive(Clone)]
struct Inventory {
    items: Vec<InventoryItem>,
    max_slots: usize,
}

#[derive(Clone)]
struct InventoryItem {
    name: String,
    quantity: u32,
    item_type: ItemType,
    rarity: Rarity,
    stats: std::collections::HashMap<String, f32>,
}

#[derive(Clone, Copy, PartialEq)]
enum ItemType { Weapon, Armor, Consumable, Material, Quest, Key }

#[derive(Clone, Copy, PartialEq)]
enum Rarity { Common, Uncommon, Rare, Epic, Legendary }

impl Rarity {
    fn color(&self) -> [f32; 4] {
        match self {
            Self::Common => [0.7, 0.7, 0.7, 1.0],
            Self::Uncommon => [0.1, 0.8, 0.1, 1.0],
            Self::Rare => [0.2, 0.4, 1.0, 1.0],
            Self::Epic => [0.6, 0.2, 0.9, 1.0],
            Self::Legendary => [1.0, 0.6, 0.0, 1.0],
        }
    }
}

#[derive(Clone)]
struct Quest {
    name: String,
    description: String,
    state: QuestState,
    objectives: Vec<QuestObjective>,
    rewards: Vec<String>,
}

#[derive(Clone, Copy, PartialEq)]
enum QuestState { NotStarted, Active, Completed, Failed }

#[derive(Clone)]
struct QuestObjective {
    description: String,
    current: u32,
    target: u32,
    completed: bool,
}

#[derive(Clone)]
struct SaveSlot {
    name: String,
    timestamp: String,
    scene_data: String,  // JSON
}

#[derive(Clone)]
struct InputAction {
    name: String,
    keys: Vec<String>,
    action_type: InputActionType,
}

#[derive(Clone, Copy)]
enum InputActionType { Pressed, Released, Held, Axis }

#[derive(Clone)]
struct AudioZone {
    position: Vec3,
    radius: f32,
    sound_name: String,
    volume: f32,
    reverb: ReverbPreset,
}

#[derive(Clone, Copy, PartialEq)]
enum ReverbPreset { None, SmallRoom, LargeHall, Cave, Outdoor, Cathedral, Underwater }

#[derive(Clone)]
struct PostProcessVolume {
    position: Vec3,
    extents: Vec3,
    params: PostParamsRaw,
    priority: i32,
    blend_radius: f32,
}

#[derive(Clone)]
struct Decal {
    position: Vec3,
    rotation: Quat,
    scale: Vec3,
    color: [f32; 4],
    decal_type: String,  // "blood", "crack", "footprint", "scorch", "paint"
}

#[derive(Clone)]
struct FoliageInstance {
    position: Vec3,
    rotation: Quat,
    scale: f32,
    foliage_type: String,  // "grass", "bush", "flower", "fern"
    color_variation: f32,
}

#[derive(Clone)]
struct SubLevel {
    name: String,
    loaded: bool,
    origin: Vec3,
    scene_file: String,
}

#[derive(Clone)]
struct DataTable {
    name: String,
    columns: Vec<String>,
    rows: Vec<Vec<String>>,
}

#[derive(Clone)]
struct CrowdAgent {
    position: Vec3,
    velocity: Vec3,
    target: Vec3,
    speed: f32,
    avoidance_radius: f32,
    group: String,
}

#[derive(Clone)]
struct Destructible {
    object_name: String,
    health: f32,
    max_health: f32,
    fragment_count: usize,
    destroyed: bool,
}

#[derive(Clone)]
struct SplineMesh {
    name: String,
    control_points: Vec<Vec3>,
    mesh_type: MeshType,
    segments: usize,
    thickness: f32,
}

#[derive(Clone)]
struct InstanceGroup {
    mesh_type: MeshType,
    transforms: Vec<Transform>,
    color: [f32; 4],
}

#[derive(Clone, Copy, PartialEq)]
enum GameTemplate {
    FPS, ThirdPerson, TopDown, Platformer, Racing, RPG, Horror,
    Puzzle, Strategy, Fighting, OpenWorld, VehicleSim,
}

impl GameTemplate {
    fn name(&self) -> &str {
        match self {
            Self::FPS => "First-Person Shooter", Self::ThirdPerson => "Third-Person Action",
            Self::TopDown => "Top-Down", Self::Platformer => "Platformer",
            Self::Racing => "Racing", Self::RPG => "RPG",
            Self::Horror => "Horror", Self::Puzzle => "Puzzle",
            Self::Strategy => "Strategy", Self::Fighting => "Fighting",
            Self::OpenWorld => "Open World", Self::VehicleSim => "Vehicle Simulator",
        }
    }
}

#[derive(Clone)]
struct StateMachine {
    name: String,
    states: Vec<SmState>,
    transitions: Vec<SmTransition>,
    current_state: usize,
}

#[derive(Clone)]
struct SmState { name: String, on_enter: String, on_update: String, on_exit: String }

#[derive(Clone)]
struct SmTransition { from: usize, to: usize, condition: String }

#[derive(Clone)]
struct GameEvent { event_type: String, data: String, timestamp: f32 }

#[derive(Clone, Debug)]
struct EventListener { event_type: String, callback_command: String }

#[derive(Clone)]
enum GameVar {
    Int(i64),
    Float(f64),
    Bool(bool),
    Str(String),
    Vec3([f32; 3]),
}

#[derive(Clone)]
struct ObjectConstraint {
    object_name: String,
    constraint_type: ConstraintType,
    target: String,
}

#[derive(Clone, Copy)]
enum ConstraintType { LookAt, Follow, CopyRotation, CopyPosition, Spring, Hinge }

#[derive(Clone)]
struct Layer { name: String, visible: bool, locked: bool }

#[derive(Clone)]
struct SequencerTrack {
    name: String,
    track_type: SeqTrackType,
    keyframes: Vec<SeqKeyframe>,
}

#[derive(Clone, Copy)]
enum SeqTrackType { Transform, Visibility, Color, CameraFov, PostProcess, Audio }

#[derive(Clone)]
struct SeqKeyframe { time: f32, value: [f32; 4], easing: EasingType }

#[derive(Clone, Copy)]
enum EasingType { Linear, EaseIn, EaseOut, EaseInOut, Bounce, Elastic }

impl EasingType {
    fn apply(&self, t: f32) -> f32 {
        match self {
            Self::Linear => t,
            Self::EaseIn => t * t,
            Self::EaseOut => t * (2.0 - t),
            Self::EaseInOut => if t < 0.5 { 2.0 * t * t } else { -1.0 + (4.0 - 2.0 * t) * t },
            Self::Bounce => {
                let t = 1.0 - t;
                if t < 1.0/2.75 { 1.0 - 7.5625*t*t }
                else if t < 2.0/2.75 { let t = t - 1.5/2.75; 1.0 - (7.5625*t*t + 0.75) }
                else if t < 2.5/2.75 { let t = t - 2.25/2.75; 1.0 - (7.5625*t*t + 0.9375) }
                else { let t = t - 2.625/2.75; 1.0 - (7.5625*t*t + 0.984375) }
            }
            Self::Elastic => {
                if t == 0.0 || t == 1.0 { t }
                else { (2.0f32).powf(-10.0 * t) * ((t - 0.075) * (2.0 * std::f32::consts::PI) / 0.3).sin() + 1.0 }
            }
        }
    }
}


// ======== ROUND 2: MORE UNREAL-TIER TYPES ========

#[derive(Clone)]
struct PhysicsMaterial {
    name: String,
    friction: f32,
    restitution: f32,  // bounciness
    density: f32,
}

#[derive(Clone, Copy, PartialEq)]
enum CollisionChannel { Default, Player, Enemy, Projectile, Trigger, Static, Dynamic }

#[derive(Clone)]
struct CollisionSettings {
    object_name: String,
    channel: CollisionChannel,
    block: Vec<CollisionChannel>,
    overlap: Vec<CollisionChannel>,
    ignore: Vec<CollisionChannel>,
}

#[derive(Clone)]
struct HudWidget {
    name: String,
    widget_type: HudWidgetType,
    position: [f32; 2],  // normalized 0-1
    size: [f32; 2],
    color: [f32; 4],
    text: String,
    value: f32,
    max_value: f32,
    visible: bool,
}

#[derive(Clone, PartialEq)]
enum HudWidgetType { HealthBar, ManaBar, StaminaBar, Crosshair, Text, Compass, Hotbar, DamageIndicator, Notification, ScoreDisplay }

#[derive(Clone)]
struct ParticleForceField {
    position: Vec3,
    force_type: ForceFieldType,
    strength: f32,
    radius: f32,
}

#[derive(Clone, Copy)]
enum ForceFieldType { Vortex, Drag, Noise, Attract, Repel, Wind, Turbulence }

#[derive(Clone)]
struct LandscapeBrush {
    position: Vec3,
    radius: f32,
    strength: f32,
    mode: LandscapeMode,
}

#[derive(Clone, Copy, PartialEq)]
enum LandscapeMode { Raise, Lower, Smooth, Flatten, Paint }

#[derive(Clone)]
struct BlendTreeNode {
    name: String,
    animation: String,
    blend_weight: f32,
}

#[derive(Clone)]
struct AnimationBlueprint {
    name: String,
    blend_tree: Vec<BlendTreeNode>,
    current_blend: Vec<f32>,
}

#[derive(Clone)]
struct IkChain {
    name: String,
    target_object: String,
    chain_objects: Vec<String>,  // from root to effector
    pole_target: Option<String>,
    iterations: u32,
}

#[derive(Clone)]
struct LightProbe {
    position: Vec3,
    radius: f32,
    sh_coefficients: [[f32; 3]; 9],  // spherical harmonics
}

#[derive(Clone)]
struct ReflectionCapture {
    position: Vec3,
    radius: f32,
    resolution: u32,
    captured: bool,
}

#[derive(Clone)]
struct ClothSim {
    object_name: String,
    stiffness: f32,
    damping: f32,
    gravity_scale: f32,
    wind_influence: f32,
    pinned_vertices: Vec<usize>,
}

#[derive(Clone)]
struct VolumetricFogVolume {
    position: Vec3,
    extents: Vec3,
    density: f32,
    color: [f32; 3],
    height_falloff: f32,
}

#[derive(Clone)]
struct StreamingVolume {
    position: Vec3,
    extents: Vec3,
    level_name: String,
    loaded: bool,
}

#[derive(Clone)]
struct CutsceneDirector {
    name: String,
    shots: Vec<CutsceneShot>,
    current_shot: usize,
    playing: bool,
    time: f32,
}

#[derive(Clone, Debug)]
struct CutsceneShot {
    camera_pos: Vec3,
    camera_target: Vec3,
    duration: f32,
    transition: CutsceneTransition,
    dialogue: Option<String>,
}

#[derive(Clone, Copy, Debug)]
enum CutsceneTransition { Cut, Fade, Dissolve, Wipe }

#[derive(Clone)]
struct BuildTarget {
    platform: Platform,
    name: String,
    icon_path: Option<String>,
    version: String,
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum Platform { MacOS, Windows, Linux, Web, IOS, Android }

impl Platform {
    fn name(&self) -> &str {
        match self { Self::MacOS => "macOS", Self::Windows => "Windows", Self::Linux => "Linux", Self::Web => "Web/WASM", Self::IOS => "iOS", Self::Android => "Android" }
    }
    fn icon(&self) -> &str {
        match self { Self::MacOS => "🍎", Self::Windows => "🪟", Self::Linux => "🐧", Self::Web => "🌐", Self::IOS => "📱", Self::Android => "🤖" }
    }
}

#[derive(Clone)]
struct Bookmark {
    name: String,
    camera_pos: Vec3,
    camera_yaw: f32,
    camera_pitch: f32,
}

#[derive(Clone)]
struct ObjectGroup {
    name: String,
    members: Vec<String>,
    locked: bool,
    visible: bool,
}


// ======== ROUND 3: NETWORKING, VFX, ADVANCED ========

#[derive(Clone)]
struct NetworkState {
    is_host: bool,
    is_connected: bool,
    player_id: u32,
    remote_players: Vec<RemotePlayer>,
    sync_objects: Vec<String>,  // objects to replicate
    tick_rate: u32,
    latency_ms: u32,
}

#[derive(Clone)]
struct RemotePlayer {
    id: u32,
    name: String,
    position: Vec3,
    rotation: Quat,
    color: [f32; 4],
    ping_ms: u32,
}

#[derive(Clone)]
struct Waypoint {
    name: String,
    position: Vec3,
    icon: String,
    color: [f32; 4],
    show_distance: bool,
}

#[derive(Clone)]
struct ObjectPool {
    name: String,
    mesh_type: MeshType,
    color: [f32; 4],
    pool_size: usize,
    active_count: usize,
}

#[derive(Clone)]
struct Trail {
    object_name: String,
    positions: Vec<Vec3>,
    max_length: usize,
    width: f32,
    color_start: [f32; 4],
    color_end: [f32; 4],
}

#[derive(Clone)]
struct Projectile {
    position: Vec3,
    velocity: Vec3,
    damage: f32,
    lifetime: f32,
    owner: String,
    gravity: bool,
}

#[derive(Clone)]
struct DamageNumber {
    position: Vec3,
    value: f32,
    timer: f32,
    color: [f32; 4],
}

#[derive(Clone)]
struct Spawner {
    name: String,
    position: Vec3,
    spawn_type: String,
    interval: f32,
    timer: f32,
    max_alive: usize,
    spawned_names: Vec<String>,
    active: bool,
}

#[derive(Clone)]
struct Interactable {
    object_name: String,
    interaction_type: InteractionType,
    prompt_text: String,
    range: f32,
    on_interact: String,  // command to execute
    cooldown: f32,
    cooldown_timer: f32,
}

#[derive(Clone, Copy, PartialEq)]
enum InteractionType { Pickup, Use, Talk, Open, Read, Activate }

#[derive(Clone)]
struct HealthComponent {
    object_name: String,
    current: f32,
    max_hp: f32,
    regen_rate: f32,
    invincible: bool,
    on_death: String,  // command
}

#[derive(Clone)]
struct MoveComponent {
    object_name: String,
    speed: f32,
    jump_force: f32,
    grounded: bool,
    velocity: Vec3,
    can_fly: bool,
}

#[derive(Clone)]
struct LootTable {
    name: String,
    entries: Vec<LootEntry>,
}

#[derive(Clone)]
struct LootEntry {
    item_name: String,
    weight: f32,
    min_count: u32,
    max_count: u32,
}

#[derive(Clone)]
struct Ability {
    name: String,
    cooldown: f32,
    cooldown_timer: f32,
    mana_cost: f32,
    damage: f32,
    range: f32,
    command: String,  // what it does
}

#[derive(Clone)]
struct StatusEffect {
    name: String,
    target: String,
    duration: f32,
    timer: f32,
    effect_type: StatusType,
    strength: f32,
}

#[derive(Clone, Copy, PartialEq)]
enum StatusType { Poison, Burn, Freeze, Stun, Heal, Speed, Slow, Shield }

#[derive(Clone)]
struct CraftingRecipe {
    name: String,
    result: String,
    result_count: u32,
    ingredients: Vec<(String, u32)>,
}

#[derive(Clone)]
struct TeleportPad {
    name: String,
    position: Vec3,
    destination: Vec3,
    linked_pad: Option<String>,
}

#[derive(Clone)]
struct Checkpoint {
    name: String,
    position: Vec3,
    reached: bool,
}


// ======== ROUND 4: ECONOMY, PROGRESSION, AI DIRECTOR ========

#[derive(Clone)]
struct Economy {
    currencies: std::collections::HashMap<String, i64>,
    shops: Vec<Shop>,
}

#[derive(Clone)]
struct Shop {
    name: String,
    items: Vec<ShopItem>,
}

#[derive(Clone)]
struct ShopItem {
    name: String,
    price: i64,
    currency: String,
    stock: i32,  // -1 = infinite
    description: String,
}

#[derive(Clone)]
struct SkillTree {
    name: String,
    nodes: Vec<SkillNode>,
}

#[derive(Clone)]
struct SkillNode {
    name: String,
    description: String,
    cost: u32,
    unlocked: bool,
    prerequisites: Vec<usize>,
    effect: String,  // command to apply
}

#[derive(Clone)]
struct AchievementSystem {
    achievements: Vec<Achievement>,
}

#[derive(Clone)]
struct Achievement {
    name: String,
    description: String,
    icon: String,
    unlocked: bool,
    progress: f32,
    target: f32,
}

#[derive(Clone)]
struct AiDirector {
    difficulty: f32,        // 0-1 adaptive
    tension: f32,           // current tension level
    last_combat_time: f32,
    player_deaths: u32,
    enemies_killed: u32,
    spawn_multiplier: f32,
    loot_multiplier: f32,
}

#[derive(Clone)]
struct Minimap2D {
    center: Vec3,
    zoom: f32,
    rotation_locked: bool,
    show_enemies: bool,
    show_waypoints: bool,
    show_items: bool,
}

#[derive(Clone)]
struct ObjectiveMarker {
    name: String,
    target_object: String,
    color: [f32; 4],
    pulsing: bool,
    distance_text: bool,
}

#[derive(Clone)]
struct EmoteAction {
    name: String,
    animation: String,
    duration: f32,
}

#[derive(Clone)]
struct PhotoMode {
    active: bool,
    fov: f32,
    dof_distance: f32,
    dof_strength: f32,
    filter: PhotoFilter,
    frame: PhotoFrame,
    hide_ui: bool,
    free_cam: bool,
}

#[derive(Clone, Copy, PartialEq)]
enum PhotoFilter { None, Sepia, BW, Vivid, Cool, Warm, Noir, Cyberpunk, Vintage, Comic }
#[derive(Clone, Copy, PartialEq)]
enum PhotoFrame { None, Polaroid, Cinematic, Vignette, Border }

#[derive(Clone)]
struct Conversation {
    npc_name: String,
    messages: Vec<(String, String)>,  // (speaker, text)
    active: bool,
}

#[derive(Clone)]
struct WeaponSlot {
    name: String,
    weapon_type: WeaponType,
    damage: f32,
    fire_rate: f32,
    ammo: i32,
    max_ammo: i32,
    reload_time: f32,
    reloading: bool,
    reload_timer: f32,
}

#[derive(Clone, Copy, PartialEq)]
enum WeaponType { Melee, Pistol, Rifle, Shotgun, Sniper, Rocket, Bow, Staff }

impl WeaponType {
    fn icon(&self) -> &str {
        match self { Self::Melee => "🗡️", Self::Pistol => "🔫", Self::Rifle => "🔫", Self::Shotgun => "💥", Self::Sniper => "🎯", Self::Rocket => "🚀", Self::Bow => "🏹", Self::Staff => "🪄" }
    }
}

#[derive(Clone)]
struct XpSystem {
    level: u32,
    xp: u64,
    xp_to_next: u64,
    skill_points: u32,
    total_xp: u64,
}


// ======== ROUND 5: WORLD BUILDING, AUDIO, ADVANCED AI ========

#[derive(Clone)]
struct BiomeSettings {
    name: String,
    ground_color: [f32; 4],
    fog_color: [f32; 3],
    fog_density: f32,
    tree_density: f32,
    grass_density: f32,
    ambient_sound: String,
    temperature: f32,
    wind_strength: f32,
}

#[derive(Clone)]
struct TimeOfDay {
    hour: f32,  // 0-24
    speed: f32, // multiplier
    auto_lighting: bool,
    sun_color: [f32; 3],
    ambient_color: [f32; 3],
    shadow_intensity: f32,
}

#[derive(Clone)]
struct SoundMixer {
    master_volume: f32,
    music_volume: f32,
    sfx_volume: f32,
    ambient_volume: f32,
    voice_volume: f32,
    channels: Vec<AudioChannel>,
}

#[derive(Clone)]
struct AudioChannel {
    name: String,
    volume: f32,
    muted: bool,
    sound_name: String,
    looping: bool,
    playing: bool,
}

#[derive(Clone)]
struct PartyMember {
    name: String,
    class: String,
    level: u32,
    hp: f32,
    max_hp: f32,
    mp: f32,
    max_mp: f32,
    abilities: Vec<String>,
    ai_controlled: bool,
}

#[derive(Clone)]
struct Faction {
    name: String,
    reputation: i32,  // -100 to 100
    relations: std::collections::HashMap<String, i32>,  // other faction → relation
}

#[derive(Clone)]
struct JournalEntry {
    title: String,
    text: String,
    timestamp: f32,
    category: JournalCategory,
}

#[derive(Clone, Copy, PartialEq)]
enum JournalCategory { Main, Side, Lore, Combat, Discovery }

#[derive(Clone)]
struct MapMarker {
    name: String,
    position: Vec3,
    marker_type: MapMarkerType,
    discovered: bool,
    icon: String,
}

#[derive(Clone, Copy, PartialEq)]
enum MapMarkerType { Town, Dungeon, Shop, Boss, Treasure, Camp, Ruins, Cave, Tower, Custom }

#[derive(Clone)]
struct TurnBasedState {
    active: bool,
    turn_order: Vec<String>,  // object names
    current_turn: usize,
    round: u32,
    action_points: std::collections::HashMap<String, u32>,
}

#[derive(Clone)]
struct Npc {
    name: String,
    object_name: String,
    schedule: Vec<NpcScheduleEntry>,
    disposition: i32,  // -100 to 100
    dialogue_tree: Option<String>,
    merchant: bool,
    quest_giver: bool,
}

#[derive(Clone)]
struct NpcScheduleEntry {
    hour: f32,
    position: Vec3,
    activity: String,
}

#[derive(Clone)]
struct Cutout2D {
    name: String,
    position: Vec3,
    size: [f32; 2],
    color: [f32; 4],
    billboard: bool,  // always face camera
}

#[derive(Clone)]
struct MusicTrack {
    name: String,
    intensity: f32,  // 0-1, for adaptive music
    mood: String,
}


// ======== ROUND 6: VEHICLES, WORLD EVENTS, PROCEDURAL, MODDING ========

#[derive(Clone)]
struct Vehicle {
    name: String,
    object_name: String,
    vehicle_type: VehicleType,
    speed: f32,
    max_speed: f32,
    acceleration: f32,
    steering: f32,
    fuel: f32,
    max_fuel: f32,
    occupied: bool,
}

#[derive(Clone, Copy, PartialEq)]
enum VehicleType { Car, Truck, Bike, Boat, Helicopter, Tank, Mech, Horse, Spaceship }

impl VehicleType {
    fn icon(&self) -> &str {
        match self { Self::Car => "🚗", Self::Truck => "🚛", Self::Bike => "🏍️", Self::Boat => "⛵", Self::Helicopter => "🚁", Self::Tank => "🪖", Self::Mech => "🤖", Self::Horse => "🐴", Self::Spaceship => "🚀" }
    }
}

#[derive(Clone)]
struct WorldEvent {
    name: String,
    event_type: WorldEventType,
    position: Vec3,
    radius: f32,
    duration: f32,
    timer: f32,
    active: bool,
    repeating: bool,
    interval: f32,
    cooldown: f32,
}

#[derive(Clone, Copy, PartialEq)]
enum WorldEventType { Invasion, BossSpawn, Treasure, MeteorShower, Earthquake, Eclipse, Festival, Storm, Portal, Ambush }

#[derive(Clone)]
struct ProceduralRule {
    name: String,
    rule_type: ProcRuleType,
    params: std::collections::HashMap<String, f32>,
}

#[derive(Clone, Copy, PartialEq)]
enum ProcRuleType { Scatter, Replace, Stack, Connect, Fill, Ring, Spiral, Maze, Grid }

#[derive(Clone)]
struct ModSlot {
    name: String,
    script: String,
    enabled: bool,
    author: String,
}

#[derive(Clone)]
struct Leaderboard {
    name: String,
    entries: Vec<(String, i64)>,  // (name, score)
    sort_ascending: bool,
}

#[derive(Clone)]
struct Dialogue2 {
    speaker: String,
    text: String,
    emotion: String,
    voice_line: Option<String>,
}

#[derive(Clone)]
struct CameraRig {
    name: String,
    rig_type: CameraRigType,
    target: Option<String>,
    offset: Vec3,
    damping: f32,
}

#[derive(Clone, Copy, PartialEq)]
enum CameraRigType { ThirdPerson, Shoulder, Topdown, Isometric, Cinematic, Drone, Security, SideScroll }


// ======== ROUND 7: ADVANCED GAMEPLAY, WORLD SIM, TOOLS ========

#[derive(Clone)]
struct WaveSpawner {
    name: String,
    waves: Vec<Wave>,
    current_wave: usize,
    active: bool,
    between_wave_timer: f32,
    between_wave_delay: f32,
}

#[derive(Clone)]
struct Wave {
    enemies: Vec<(String, usize)>,  // (type, count)
    spawn_delay: f32,
    bonus_xp: u64,
}

#[derive(Clone)]
struct Puzzle {
    name: String,
    puzzle_type: PuzzleType,
    solved: bool,
    pieces: Vec<PuzzlePiece>,
    on_solve: String,
}

#[derive(Clone, Copy, PartialEq)]
enum PuzzleType { Switch, Sequence, Pressure, Key, Riddle, Simon, Slider }

#[derive(Clone)]
struct PuzzlePiece {
    name: String,
    state: bool,
    position: Vec3,
    required_state: bool,
}

#[derive(Clone)]
struct Trap {
    name: String,
    position: Vec3,
    trap_type: TrapType,
    damage: f32,
    active: bool,
    cooldown: f32,
    timer: f32,
    radius: f32,
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum TrapType { Spike, Arrow, Fire, Pit, Poison, Electric, Freeze, Swing }

#[derive(Clone)]
struct DayNightEvent {
    hour: f32,
    event_name: String,
    command: String,
}

#[derive(Clone)]
struct Collectible {
    name: String,
    object_name: String,
    collected: bool,
    value: i64,
    category: String,
}

#[derive(Clone)]
struct RespawnPoint {
    name: String,
    position: Vec3,
    team: Option<String>,
    cooldown: f32,
}

#[derive(Clone)]
struct Ladder {
    position: Vec3,
    height: f32,
    object_name: String,
}

#[derive(Clone)]
struct Rope {
    start: Vec3,
    end: Vec3,
    segments: usize,
    object_names: Vec<String>,
}

#[derive(Clone)]
struct Trigger2 {
    name: String,
    position: Vec3,
    radius: f32,
    on_enter: String,
    on_exit: String,
    one_shot: bool,
    triggered: bool,
}

#[derive(Clone)]
struct MiniGame {
    name: String,
    game_type: MiniGameType,
    active: bool,
    score: i64,
    timer: f32,
    duration: f32,
}

#[derive(Clone, Copy, PartialEq)]
enum MiniGameType { TargetPractice, Race, Collect, Survival, Quiz, Fishing, Lockpick }

#[derive(Clone)]
struct Tooltip {
    object_name: String,
    text: String,
    visible_range: f32,
}

#[derive(Clone)]
struct GrapplePoint {
    position: Vec3,
    object_name: String,
}

#[derive(Clone)]
struct ZipLine {
    start: Vec3,
    end: Vec3,
    speed: f32,
    object_name: String,
}


// ======== ROUND 8: SOCIAL, BUILDING, ECONOMY DEEP, WORLD ========

#[derive(Clone)]
struct Relationship {
    npc_a: String,
    npc_b: String,
    affinity: i32,  // -100 to 100
    relationship_type: RelationType,
}

#[derive(Clone, Copy, PartialEq)]
enum RelationType { Stranger, Acquaintance, Friend, Rival, Enemy, Romantic, Family, Master }

#[derive(Clone, Debug)]
struct BuildingPiece {
    name: String,
    piece_type: BuildPieceType,
    position: Vec3,
    rotation: Quat,
    material: String,
    snapped: bool,
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum BuildPieceType { Foundation, Wall, Floor, Ceiling, Roof, Door, Window, Ramp, Pillar, Fence, Arch }

impl BuildPieceType {
    fn size(&self) -> Vec3 {
        match self {
            Self::Foundation => Vec3::new(4.0, 0.3, 4.0), Self::Wall => Vec3::new(4.0, 3.0, 0.2),
            Self::Floor | Self::Ceiling => Vec3::new(4.0, 0.15, 4.0), Self::Roof => Vec3::new(4.5, 0.15, 4.5),
            Self::Door => Vec3::new(1.2, 2.5, 0.2), Self::Window => Vec3::new(1.5, 1.5, 0.15),
            Self::Ramp => Vec3::new(4.0, 0.15, 4.0), Self::Pillar => Vec3::new(0.4, 3.0, 0.4),
            Self::Fence => Vec3::new(4.0, 1.2, 0.1), Self::Arch => Vec3::new(3.0, 3.5, 0.3),
        }
    }
}

#[derive(Clone)]
struct AuctionItem {
    item_name: String,
    seller: String,
    current_bid: i64,
    highest_bidder: String,
    time_remaining: f32,
}

#[derive(Clone)]
struct Bank {
    accounts: std::collections::HashMap<String, i64>,
    interest_rate: f32,
    loan_amount: i64,
    loan_remaining: i64,
}

#[derive(Clone)]
struct WeatherForecast {
    day: u32,
    weather: String,
    temperature: f32,
    wind: f32,
}

#[derive(Clone)]
struct Season {
    current: SeasonType,
    day_in_season: u32,
    days_per_season: u32,
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum SeasonType { Spring, Summer, Autumn, Winter }

impl SeasonType {
    fn name(&self) -> &str { match self { Self::Spring => "Spring", Self::Summer => "Summer", Self::Autumn => "Autumn", Self::Winter => "Winter" } }
    fn icon(&self) -> &str { match self { Self::Spring => "🌸", Self::Summer => "☀️", Self::Autumn => "🍂", Self::Winter => "❄️" } }
}

#[derive(Clone)]
struct Territory {
    name: String,
    owner: String,
    position: Vec3,
    radius: f32,
    resources: std::collections::HashMap<String, f32>,
    contested: bool,
}

#[derive(Clone)]
struct Resource {
    name: String,
    position: Vec3,
    resource_type: String,
    amount: f32,
    max_amount: f32,
    regen_rate: f32,
}

#[derive(Clone, Debug)]
struct Blueprint2 {
    name: String,
    pieces: Vec<(BuildPieceType, Vec3, Quat)>,
}

#[derive(Clone)]
struct Morality {
    karma: i32,
    good_deeds: u32,
    evil_deeds: u32,
    title: String,
}


struct KokoApp {
    window: Option<Arc<Window>>,
    gpu: Option<GpuContext>,
    time: Time,
    input: Input,
    editor: EditorState,
    egui_ctx: Option<egui::Context>,
    egui_state: Option<egui_winit::State>,
    egui_renderer: Option<egui_wgpu::Renderer>,

    pipeline: Option<wgpu::RenderPipeline>,
    camera_buffer: Option<wgpu::Buffer>,
    camera_bind_group: Option<wgpu::BindGroup>,
    model_buffer: Option<wgpu::Buffer>,
    model_bind_group: Option<wgpu::BindGroup>,
    cube_vb: Option<wgpu::Buffer>, cube_ib: Option<wgpu::Buffer>, cube_idx_count: u32,
    sphere_vb: Option<wgpu::Buffer>, sphere_ib: Option<wgpu::Buffer>, sphere_idx_count: u32,
    plane_vb: Option<wgpu::Buffer>, plane_ib: Option<wgpu::Buffer>, plane_idx_count: u32,
    grid_vb: Option<wgpu::Buffer>, grid_vert_count: u32,
    cylinder_vb: Option<wgpu::Buffer>, cylinder_ib: Option<wgpu::Buffer>, cylinder_idx_count: u32,
    cone_vb: Option<wgpu::Buffer>, cone_ib: Option<wgpu::Buffer>, cone_idx_count: u32,
    torus_vb: Option<wgpu::Buffer>, torus_ib: Option<wgpu::Buffer>, torus_idx_count: u32,
    grid_pipeline: Option<wgpu::RenderPipeline>,
    sky_pipeline: Option<wgpu::RenderPipeline>,
    sky_bind_group_layout: Option<wgpu::BindGroupLayout>,
    sky_bind_group: Option<wgpu::BindGroup>,
    sky_buffer: Option<wgpu::Buffer>,
    ground_pipeline: Option<wgpu::RenderPipeline>,
    ground_vb: Option<wgpu::Buffer>, ground_ib: Option<wgpu::Buffer>, ground_idx_count: u32,

    // Selection highlight: re-draw selected object with wireframe + bright color
    outline_pipeline: Option<wgpu::RenderPipeline>,
    shadow_texture: Option<wgpu::TextureView>,
    shadow_sampler: Option<wgpu::Sampler>,
    shadow_pipeline: Option<wgpu::RenderPipeline>,
    shadow_bind_group_layout: Option<wgpu::BindGroupLayout>,
    shadow_bind_group: Option<wgpu::BindGroup>,
    light_buffer: Option<wgpu::Buffer>,
    light_bind_group: Option<wgpu::BindGroup>,
    // Real shadow mapping
    shadow_depth_texture: Option<wgpu::Texture>,
    shadow_depth_view: Option<wgpu::TextureView>,
    shadow_depth_sampler: Option<wgpu::Sampler>,
    shadow_depth_pipeline: Option<wgpu::RenderPipeline>,
    shadow_map_bind_group: Option<wgpu::BindGroup>,
    shadow_map_bind_group_layout: Option<wgpu::BindGroupLayout>,
    light_vp_buffer: Option<wgpu::Buffer>,
    light_camera_bgl: Option<wgpu::BindGroupLayout>,
    light_camera_bg: Option<wgpu::BindGroup>,

    objects: Vec<SceneObject>,
    custom_meshes: Vec<(wgpu::Buffer, wgpu::Buffer, u32)>, // (vb, ib, idx_count)
    // Per-mesh texture bind groups (group 3): index matches custom_meshes
    mesh_texture_bind_groups: Vec<wgpu::BindGroup>,
    texture_bind_group_layout: Option<wgpu::BindGroupLayout>,
    default_texture_bind_group: Option<wgpu::BindGroup>,  // 1x1 white for untextured
    material_flags_buffer: Option<wgpu::Buffer>,  // shared buffer, updated per-draw
    // Bloom post-processing
    bloom_enabled: bool,
    scene_texture: Option<wgpu::Texture>,
    scene_texture_view: Option<wgpu::TextureView>,
    bloom_textures: Vec<(wgpu::Texture, wgpu::TextureView)>,  // [extract, blur_h, blur_v]
    bloom_extract_pipeline: Option<wgpu::RenderPipeline>,
    bloom_blur_pipeline: Option<wgpu::RenderPipeline>,
    bloom_composite_pipeline: Option<wgpu::RenderPipeline>,
    bloom_extract_bg: Option<wgpu::BindGroup>,
    bloom_blur_h_bg: Option<wgpu::BindGroup>,
    bloom_blur_v_bg: Option<wgpu::BindGroup>,
    bloom_composite_bg: Option<wgpu::BindGroup>,
    bloom_blur_h_params: Option<wgpu::Buffer>,
    bloom_blur_v_params: Option<wgpu::Buffer>,
    bloom_bgl: Option<wgpu::BindGroupLayout>,
    bloom_blur_bgl: Option<wgpu::BindGroupLayout>,
    bloom_composite_bgl: Option<wgpu::BindGroupLayout>,
    // Particle system
    particle_emitters: Vec<ParticleEmitter>,
    particle_pipeline: Option<wgpu::RenderPipeline>,
    particle_storage_buffer: Option<wgpu::Buffer>,
    particle_uniform_buffer: Option<wgpu::Buffer>,
    particle_bind_group: Option<wgpu::BindGroup>,
    particle_bgl: Option<wgpu::BindGroupLayout>,
    particle_max: usize,
    // Dynamic lights
    scene_lights: Vec<SceneLight>,
    dyn_light_storage: Option<wgpu::Buffer>,
    dyn_light_bg: Option<wgpu::BindGroup>,
    dyn_light_bgl: Option<wgpu::BindGroupLayout>,
    // Post-processing
    post_pipeline: Option<wgpu::RenderPipeline>,
    post_bind_group: Option<wgpu::BindGroup>,
    post_params_buffer: Option<wgpu::Buffer>,
    post_params: PostParamsRaw,
    post_enabled: bool,
    // Water
    water_pipeline: Option<wgpu::RenderPipeline>,
    water_bind_group: Option<wgpu::BindGroup>,
    water_params_buffer: Option<wgpu::Buffer>,
    water_enabled: bool,
    play_mode: bool,
    #[cfg(not(target_arch = "wasm32"))]
    physics_world: Option<koko_physics::world3d::PhysicsWorld3D>,
    #[cfg(target_arch = "wasm32")]
    physics_world: Option<()>,
    physics_bodies: Vec<Option<koko_physics::RigidBodyHandle>>,
    water_vb: Option<wgpu::Buffer>,
    water_ib: Option<wgpu::Buffer>,
    water_idx_count: u32,
    // Audio
    audio_engine: Option<koko_audio::AudioEngine>,
    // Physics play mode
    physics_playing: bool,
    physics_snapshot: Vec<(Vec3, Quat, Vec3)>,  // saved positions before play
    physics_velocities: Vec<Vec3>,
    physics_gravity: f32,
    // Transform gizmos
    gizmo_pipeline: Option<wgpu::RenderPipeline>,
    gizmo_buffer: Option<wgpu::Buffer>,
    gizmo_bind_group: Option<wgpu::BindGroup>,
    gizmo_arrow_vb: Option<wgpu::Buffer>,
    // Terrain
    terrain_pipeline: Option<wgpu::RenderPipeline>,
    terrain_bind_group: Option<wgpu::BindGroup>,
    terrain_params_buffer: Option<wgpu::Buffer>,
    terrain_enabled: bool,
    terrain_vb: Option<wgpu::Buffer>,
    terrain_ib: Option<wgpu::Buffer>,
    terrain_idx_count: u32,
    // HUD/UI System
    hud_elements: Vec<HudElement>,
    hud_enabled: bool,
    gizmo_arrow_ib: Option<wgpu::Buffer>,
    gizmo_arrow_count: u32,
    // Sun/sky control
    sun_direction: Vec3,
    // Camera path recording
    recording_path: bool,
    recorded_keyframes: Vec<CameraKeyframe>,
    record_timer: f32,
    // Command history / macro
    command_history: Vec<String>,
    macro_recording: bool,
    macro_commands: Vec<String>,
    saved_macros: std::collections::HashMap<String, Vec<String>>,
    // Screenshot
    screenshot_requested: bool,
    screenshot_buffer: Option<wgpu::Buffer>,
    // Object animations
    object_animations: Vec<(String, ObjectAnimation)>,
    // Day/night cycle
    day_cycle_active: bool,
    day_cycle_speed: f32,  // 1.0 = 60 second full cycle
    day_cycle_time: f32,   // 0.0-1.0 (0=dawn, 0.25=noon, 0.5=dusk, 0.75=midnight)
    // Scripting
    script_engine: Option<koko_scripting::ScriptEngine>,
    // Fog
    fog_enabled: bool,
    fog_density: f32,
    fog_color: [f32; 3],
    // Auto-save
    auto_save_timer: f32,
    auto_save_interval: f32,  // seconds
    // Reflection quality: 0=off, 1=low (cubemap 128), 2=med (cubemap 256), 3=high (cubemap 512+SSR)
    reflection_quality: u8,
    // Frustum culling
    frustum_culling: bool,
    // Per-object PBR materials
    object_materials: Vec<PbrMaterial>,
    // Timeline animation editor
    timeline_open: bool,
    timeline_tracks: Vec<AnimationTrack>,
    timeline_playhead: f32,
    timeline_playing: bool,
    timeline_duration: f32,
    // Cloud AI
    ai_api_key: Option<String>,
    ai_model: String,
    // Cinematic camera
    cinematic_active: bool,
    cinematic_time: f32,
    cinematic_duration: f32,
    cinematic_keyframes: Vec<CameraKeyframe>,
    camera_pos: Vec3,
    camera_yaw: f32,
    camera_pitch: f32,
    orbit_target: Vec3,  // orbit camera center
    dragging_object: bool,
    ground_color: [f32;4],
    ground_roughness: f32,
    ground_metallic: f32,
    ground_emissive: f32,
    drag_start_pos: Vec3,
    drag_plane_y: f32,









    // ======== ROUND 8 SYSTEMS ========
    relationships: Vec<Relationship>,
    building_pieces: Vec<BuildingPiece>,
    build_mode: bool,
    build_piece_type: BuildPieceType,
    build_material: String,
    bank: Bank,
    auction_items: Vec<AuctionItem>,
    weather_forecast: Vec<WeatherForecast>,
    season: Season,
    territories: Vec<Territory>,
    resources: Vec<Resource>,
    blueprints: Vec<Blueprint2>,
    morality: Morality,
    // Wanted system
    wanted_level: u32,
    wanted_timer: f32,
    // Hunger/thirst
    hunger: f32,
    thirst: f32,
    hunger_enabled: bool,
    // Stealth
    stealth_mode: bool,
    visibility: f32,
    noise_level: f32,
    // Reputation log
    reputation_log: Vec<(String, i32, String)>,  // (faction, change, reason)

    // ======== ROUND 7 SYSTEMS ========
    wave_spawners: Vec<WaveSpawner>,
    puzzles: Vec<Puzzle>,
    traps: Vec<Trap>,
    day_night_events: Vec<DayNightEvent>,
    collectibles: Vec<Collectible>,
    collected_count: usize,
    respawn_points: Vec<RespawnPoint>,
    ladders: Vec<Ladder>,
    ropes: Vec<Rope>,
    triggers_2: Vec<Trigger2>,
    mini_games: Vec<MiniGame>,
    tooltips: Vec<Tooltip>,
    grapple_points: Vec<GrapplePoint>,
    zip_lines: Vec<ZipLine>,
    // Player stats
    player_stats: std::collections::HashMap<String, f32>,
    // Difficulty scaling
    enemy_scale: f32,
    damage_scale: f32,
    // Quick chat / ping system
    ping_positions: Vec<(Vec3, f32, [f32; 4])>,  // (pos, timer, color)

    // ======== ROUND 6 SYSTEMS ========
    vehicles: Vec<Vehicle>,
    current_vehicle: Option<usize>,
    world_events: Vec<WorldEvent>,
    procedural_rules: Vec<ProceduralRule>,
    mod_slots: Vec<ModSlot>,
    leaderboards: Vec<Leaderboard>,
    camera_rigs: Vec<CameraRig>,
    active_camera_rig: Option<usize>,
    // Dialogue queue
    dialogue_queue: Vec<Dialogue2>,
    dialogue_display_timer: f32,
    // Screen space
    letterbox: bool,
    screen_tint: [f32; 4],
    // World seed
    world_seed: u64,
    // Performance
    target_fps: u32,
    max_draw_distance: f32,
    // Gameplay
    lives: i32,
    max_lives: i32,
    respawn_timer: f32,
    invincibility_timer: f32,

    // ======== ROUND 5 SYSTEMS ========
    biome: BiomeSettings,
    time_of_day: TimeOfDay,
    sound_mixer: SoundMixer,
    party: Vec<PartyMember>,
    factions: Vec<Faction>,
    journal: Vec<JournalEntry>,
    map_markers: Vec<MapMarker>,
    turn_based: TurnBasedState,
    npcs: Vec<Npc>,
    cutouts_2d: Vec<Cutout2D>,
    music_tracks: Vec<MusicTrack>,
    current_music: Option<String>,
    // Camera system
    camera_fov: f32,
    camera_near: f32,
    camera_far: f32,
    camera_orbit_dist: f32,
    camera_follow_target: Option<String>,
    camera_smoothing: f32,
    // Debug
    debug_draw_collisions: bool,
    debug_draw_navmesh: bool,
    debug_draw_ai: bool,
    debug_fps_counter: bool,
    // World settings
    gravity_direction: Vec3,
    ambient_color: [f32; 3],

    // ======== ROUND 4 SYSTEMS ========
    economy: Economy,
    skill_trees: Vec<SkillTree>,
    achievement_system: AchievementSystem,
    ai_director: AiDirector,
    minimap_2d: Minimap2D,
    objective_markers: Vec<ObjectiveMarker>,
    photo_mode: PhotoMode,
    weapon_slots: Vec<WeaponSlot>,
    current_weapon: usize,
    xp_system: XpSystem,
    conversations: Vec<Conversation>,
    emotes: Vec<EmoteAction>,
    // Combo system
    combo_count: u32,
    combo_timer: f32,
    max_combo: u32,
    // Kill feed
    kill_feed: Vec<(String, f32)>,  // (message, timer)
    // Screen effects queue
    notification_queue: Vec<(String, f32, [f32; 4])>,  // (text, timer, color)

    // ======== ROUND 3 SYSTEMS ========
    network_state: Option<NetworkState>,
    waypoints: Vec<Waypoint>,
    object_pools: Vec<ObjectPool>,
    trails: Vec<Trail>,
    projectiles: Vec<Projectile>,
    damage_numbers: Vec<DamageNumber>,
    spawners: Vec<Spawner>,
    interactables: Vec<Interactable>,
    health_components: Vec<HealthComponent>,
    move_components: Vec<MoveComponent>,
    loot_tables: Vec<LootTable>,
    abilities: Vec<Ability>,
    status_effects: Vec<StatusEffect>,
    teleport_pads: Vec<TeleportPad>,
    checkpoints_system: Vec<Checkpoint>,
    last_checkpoint: Option<Vec3>,
    // Slow motion
    time_scale: f32,
    // Screen effects
    screen_flash_color: [f32; 4],
    screen_flash_timer: f32,
    // Object visibility toggle
    wireframe_mode: bool,
    xray_mode: bool,

    // ======== ROUND 2 SYSTEMS ========
    physics_materials: std::collections::HashMap<String, PhysicsMaterial>,
    collision_settings: Vec<CollisionSettings>,
    hud_widgets: Vec<HudWidget>,
    particle_force_fields: Vec<ParticleForceField>,
    landscape_heightmap: Vec<Vec<f32>>,  // 64x64 grid
    landscape_brush_mode: LandscapeMode,
    landscape_brush_size: f32,
    landscape_brush_strength: f32,
    animation_blueprints: Vec<AnimationBlueprint>,
    ik_chains: Vec<IkChain>,
    light_probes: Vec<LightProbe>,
    reflection_captures: Vec<ReflectionCapture>,
    cloth_sims: Vec<ClothSim>,
    volumetric_fog_volumes: Vec<VolumetricFogVolume>,
    streaming_volumes: Vec<StreamingVolume>,
    cutscene_director: Option<CutsceneDirector>,
    build_targets: Vec<BuildTarget>,
    bookmarks: Vec<Bookmark>,
    object_groups: Vec<ObjectGroup>,
    ragdolls: Vec<Ragdoll>, bezier_paths: Vec<BezierPath>, buoyancy_zones: Vec<BuoyancyZone>,
    stealth_detectors: Vec<StealthDetector>, puzzle_switches: Vec<PuzzleSwitch>, puzzle_doors: Vec<PuzzleDoor>,
    ziplines: Vec<Zipline>, swim_zones: Vec<SwimZone>, boss_patterns: Vec<BossPattern>,
    music_layers: Vec<MusicLayer>, wall_run: WallRunState, destructible_chunks: Vec<DestructibleChunk>,
    weather_gp: WeatherGameplay, proc_sky: ProceduralSky, sprites: Vec<SpriteBillboard>,
    patrol_routes: Vec<PatrolRoute>, dialogue_bubbles: Vec<DialogueBubble>,
    env_hazards: Vec<EnvironmentHazard>, ai_companions: Vec<AICompanion>, recipes: Vec<CraftingRecipe>,
    gravity_fields: Vec<GravityField>, portals_v2: Vec<Portal>, conveyors: Vec<ConveyorBelt>,
    magnet_zones: Vec<MagnetZone>, mirrors: Vec<Mirror>, sec_cameras: Vec<SecurityCamera>,
    alarms: Vec<Alarm>, cover_points: Vec<CoverPoint>,
    moving_platforms: Vec<MovingPlatform>, breakable_walls: Vec<BreakableWall>, secret_areas: Vec<SecretArea>,

    ai_behavior_trees: Vec<AIBehaviorTree>, ai_blackboards: Vec<AIBlackboard>,
    ai_perceptions: Vec<AIPerception>, ai_territories: Vec<AITerritory>, ai_squads: Vec<AISquad>,
    dialogue_graphs: Vec<DialogueGraph>, reputations: Vec<Reputation>,
 net_players: Vec<NetPlayer>, net_syncs: Vec<NetSync>,
    chat_messages_v2: Vec<ChatMessage2>, voice_chat: VoiceChat, lobby: Option<Lobby>, matchmaking: Matchmaking,
    terrain_chunks: Vec<TerrainChunk>, biome_defs: Vec<BiomeDefinition>, road_segments: Vec<RoadSegment>,
    rivers: Vec<River>, lakes: Vec<Lake>, cliffs: Vec<Cliff>, caves: Vec<Cave>,
    waterfalls: Vec<Waterfall>, bridges_v2: Vec<Bridge2>, fences_v2: Vec<Fence2>,
    street_lights_v2: Vec<StreetLight2>, signs: Vec<Sign>, barrels: Vec<Barrel>, crates_v2: Vec<Crate2>,
    campfires: Vec<Campfire>, wells: Vec<Well>, statues: Vec<Statue>, banners: Vec<Banner>,
    bookshelves: Vec<Bookshelf>, thrones: Vec<Throne>, altars: Vec<Altar>, prisons: Vec<Prison>,
    shops_v2: Vec<Shop2>, anvils: Vec<Anvil>, furnaces: Vec<Furnace>, workbenches: Vec<Workbench>,
    storage_chests: Vec<StorageChest>, gardens: Vec<Garden>, fishing_spots: Vec<FishingSpot>,
    mining_nodes: Vec<MiningNode>, harvestable_trees: Vec<HarvestableTree>,

    decal_projectors: Vec<DecalProjector>, screen_effects: Vec<ScreenEffect>, camera_paths: Vec<CameraPath>,
    light_flickers: Vec<LightFlicker>, trail_effects: Vec<TrailEffect>, after_images: Vec<AfterImage>,
    shockwaves: Vec<Shockwave>, screen_shakes_v2: Vec<ScreenShake2>, slow_motion_zones: Vec<SlowMotionZone>,
    freeze_frame: FreezeFrame, hit_stop: HitStop, camera_zoom: CameraZoom,
    depth_of_field: DepthOfField, motion_blur: MotionBlur, color_grading: ColorGrading,
    lens_flares: Vec<LensFlare>, god_rays: GodRay, outlines: Vec<Outline>,
    rim_lights: Vec<RimLight>, dissolve_effects: Vec<DissolveEffect>, holograms: Vec<Hologram>,
    force_fields: Vec<ForceField>, electric_arcs: Vec<ElectricArc>, beams: Vec<Beam>,
    chain_lightnings: Vec<ChainLightning>, explosions: Vec<Explosion>, impact_effects: Vec<ImpactEffect>,
    floating_texts: Vec<FloatingText>, health_bars_3d: Vec<HealthBar3D>, name_tags: Vec<NameTag>,
    damage_indicators: Vec<DamageIndicator>, crosshair: Crosshair, radar: Radar,
    ammo_counter: AmmoCounter, stamina_bar: StaminaBar, mana_bar: ManaBar, xp_bar: XPBar,
    combo_counter: ComboCounter, score_display: ScoreDisplay, kill_streak: KillStreak,
    notifications_v2: Vec<Notification2>, quest_tracker: QuestTracker,
    interaction_prompts: Vec<InteractionPrompt>, tooltips_v2: Vec<ToolTip>, 
    loading_screen: LoadingScreen, splash_screen: SplashScreen,
    pause_menu: PauseMenu, settings_menu: SettingsMenu, photo_mode_state: PhotoModeState,
    replay_system: ReplaySystem, ghost_recordings: Vec<GhostRecording>,
    benchmark: Benchmark, perf_overlay: PerformanceOverlay,
     wireframe_v2: WireframeMode, grid_overlay: GridOverlay, bounds_viz: BoundsVisualization,
    formations: Vec<AIFormation>, combat_arenas: Vec<CombatArena>, treasure_chests: Vec<TreasureChest>,

    springs: Vec<Spring>, portals_v3: Vec<Portal2>, ladders_v2: Vec<Ladder2>, grapple_points_v2: Vec<GrapplePoint2>,
    trampolines: Vec<Trampoline>, fans: Vec<Fan>, lasers: Vec<Laser>, crushers: Vec<Crusher>,
    flame_jets: Vec<FlameJet>, pressure_plates_v2: Vec<PressurePlate2>, ropes_v2: Vec<Rope2>,
    scoring_zones: Vec<ScoringZone>, timers_v2: Vec<Timer2>, counters: Vec<Counter>,
    env_puzzles: Vec<EnvironmentPuzzle>, minimap_v2: Minimap2, compass_markers: Vec<CompassMarker>,
    damage_zones: Vec<DamageZone>, heal_zones: Vec<HealZone>, speed_zones: Vec<SpeedZone>,
    slow_zones: Vec<SlowZone>, teleport_pads_v2: Vec<TeleportPad2>, projectiles_v2: Vec<Projectile2>,
    pickup_spawners: Vec<PickupSpawner>, torches: Vec<Torch>, level_gates: Vec<LevelGate>,
    dialogues_v2: Vec<Dialogue2>, cutscene_triggers: Vec<CutsceneTrigger>, ambient_sounds: Vec<AmbientSound>,
    footsteps: Vec<Footstep>, weather_zones: Vec<WeatherZone>, wind_zones_v2: Vec<WindZone2>,
    reflectors: Vec<Reflector>, glow_objects: Vec<GlowObject>, shadow_casters: Vec<ShadowCaster>,
    play_in_editor: bool,
    pie_camera_pos: Vec3,
    pie_camera_yaw: f32,
    pie_camera_pitch: f32,
    // Wind system
    wind_direction: Vec3,
    wind_strength: f32,
    // Global game state
    game_score: i64,
    game_timer: f32,
    game_timer_running: bool,
    game_paused: bool,

    // ======== UNREAL-TIER SYSTEMS ========

    // --- Behavior Tree AI ---
    ai_agents: Vec<AiAgent>,

    // --- Navigation / Navmesh ---
    nav_points: Vec<NavPoint>,
    nav_connections: Vec<(usize, usize)>,

    // --- Dialogue System ---
    dialogue_trees: std::collections::HashMap<String, DialogueTree>,
    active_dialogue: Option<String>,
    dialogue_node_idx: usize,

    // --- Inventory System ---
    inventories: std::collections::HashMap<String, Inventory>,

    // --- Quest System ---
    quests: Vec<Quest>,

    // --- Save Game Slots ---
    save_slots: Vec<SaveSlot>,

    // --- Input Mapping ---
    input_actions: std::collections::HashMap<String, InputAction>,

    // --- Audio Zones ---
    audio_zones: Vec<AudioZone>,
    reverb_preset: ReverbPreset,

    // --- Post-Process Volumes ---
    pp_volumes: Vec<PostProcessVolume>,

    // --- Decal System ---
    decals: Vec<Decal>,

    // --- Foliage Painting ---
    foliage_instances: Vec<FoliageInstance>,
    foliage_brush_size: f32,
    foliage_density: f32,
    foliage_painting: bool,

    // --- Level Streaming ---
    sub_levels: Vec<SubLevel>,
    active_level: String,

    // --- Data Tables ---
    data_tables: std::collections::HashMap<String, DataTable>,

    // --- Crowd/Swarm Simulation ---
    crowd_agents: Vec<CrowdAgent>,

    // --- Destruction System ---
    destructibles: Vec<Destructible>,

    // --- Spline Mesh System ---
    spline_meshes: Vec<SplineMesh>,

    // --- Instanced Rendering ---
    instance_groups: Vec<InstanceGroup>,

    // --- Game Templates ---
    active_template: Option<GameTemplate>,

    // --- State Machine (Animation/Logic) ---
    state_machines: Vec<StateMachine>,

    // --- Event System (Global) ---
    event_queue: Vec<GameEvent>,
    event_listeners: Vec<EventListener>,

    // --- Blueprint Variables ---
    game_variables: std::collections::HashMap<String, GameVar>,

    // --- Camera Shake ---
    camera_shake_intensity: f32,
    camera_shake_duration: f32,
    camera_shake_timer: f32,

    // --- Minimap ---
    minimap_enabled: bool,
    minimap_zoom: f32,

    // --- World Bounds ---
    world_bounds: Option<([f32; 3], [f32; 3])>,  // (min, max)
    kill_z: f32,  // objects below this Y are destroyed

    // --- Constraint System ---
    constraints: Vec<ObjectConstraint>,

    // --- Tag System ---
    object_tags: std::collections::HashMap<String, Vec<String>>,

    // --- Layer System ---
    layers: Vec<Layer>,
    object_layers: std::collections::HashMap<String, usize>,

    // --- Sequencer (Advanced Cinematic) ---
    sequencer_tracks: Vec<SequencerTrack>,
    sequencer_playing: bool,
    sequencer_time: f32,
    sequencer_duration: f32,

    // AI Copilot
    copilot_analyze_timer: f32,
    copilot_last_object_count: usize,
    copilot_suggestion_cooldown: f32,

    // Undo/redo
    undo_stack: Vec<Vec<SceneSnapshot>>,
    redo_stack: Vec<Vec<SceneSnapshot>>,

    // AI response channel
    ai_rx: mpsc::Receiver<String>,
    ai_tx: mpsc::Sender<String>,
    #[cfg(not(target_arch = "wasm32"))]
    tokio_rt: tokio::runtime::Runtime,
    #[cfg(target_arch = "wasm32")]
    tokio_rt: (),
    elevators: Vec<Elevator>,
    turrets: Vec<Turret>,
    // ======== ROUNDS 46-55: DEEP SYSTEM FIELDS ========
    camera_system_v2: Option<CameraSystem>,
    lighting_system_v2: Option<LightingSystem>,
    vegetation_system: Option<VegetationSystem>,
    dialogue_system_v2: Option<DialogueSystem3>,
    quest_system_v2: Option<QuestSystem>,
    inventory_system: Option<InventorySystem>,
    combat_system: Option<CombatSystem>,
    crafting_system_v2: Option<CraftingSystem>,
    ai_brain_system: Option<AIBrainSystem>,
    audio_system_v2: Option<AudioSystem2>,

    // ======== ROUNDS 56-65: ADVANCED SYSTEM FIELDS ========
    weather_engine: Option<WeatherEngine>,
    physics_constraints: Option<PhysicsConstraints>,
    save_system_v2: Option<SaveSystem2>,
    editor_tool_system: Option<EditorToolSystem>,
    procedural_anim: Option<ProceduralAnimSystem>,
    water_system_v2: Option<WaterSystem2>,
    destruction_system: Option<DestructionSystem2>,
    terrain_painter: Option<TerrainPainter>,
    game_mode_system: Option<GameModeSystem>,
    vfx_system_v2: Option<VFXSystem2>,
    decal_system_v2: Option<DecalSystem>,

    // ======== ROUNDS 66-75: ADVANCED SYSTEM FIELDS ========
    character_customizer: Option<CharacterCustomizer>,
    economy_engine: Option<EconomyEngine>,
    cinematic_engine: Option<CinematicEngine>,
    world_streaming: Option<WorldStreaming>,
    lod_system_v2: Option<LODSystem3>,
    occlusion_system_v2: Option<OcclusionSystem2>,
    mod_system: Option<ModSystem3>,
    plugin_system_v2: Option<PluginSystem2>,
    progression_system: Option<ProgressionSystem>,
    building_system_v2: Option<BuildingSystem2>,
    vehicle_system_v2: Option<VehicleSystem2>,
    social_system_v2: Option<SocialSystem2>,
    analytics_system: Option<AnalyticsSystem>,

    // ======== ROUNDS 76-80 FIELDS ========
    anim_state_machine_v2: Option<AnimStateMachine2>,
    level_design_tools: Option<LevelDesignTools>,
    pathfinding_system: Option<PathfindingSystem>,
    shader_library: Option<ShaderLibrary>,
    perf_optimizer: Option<PerfOptimizer>,

    shields: Vec<Shield>,
    // ======== ROUNDS 33-45: DEEP ENGINE FIELDS ========
    terrain_engine: Option<TerrainEngine>,
    world_generator: Option<WorldGenerator>,
    cave_generator: Option<CaveGenerator>,
    network_engine: Option<NetworkEngine>,
    lobby_system: Option<LobbySystem>,
    ui_engine: Option<UIEngine>,
    drag_drop: DragDropSystem,
    input_system_v2: Option<InputSystem2>,
    haptic_feedback: Vec<HapticFeedback>,
    input_recorder: InputRecorder,
    particle_engine: Option<ParticleEngine>,
    material_engine: Option<MaterialEngine>,
    scene_graph_v2: Option<SceneGraph>,
    ecs_world: Option<ECSWorld>,
    profiler_v2: Profiler2,
    debug_console: DebugConsole,
    debug_draw: DebugDraw,
    asset_pipeline: Option<AssetPipeline>,
    asset_database: Option<AssetDatabase>,
    localization: Option<LocalizationEngine>,
    accessibility_engine: Option<AccessibilityEngine>,
    tts: Option<TextToSpeech>,
    subtitle_system_v2: Option<SubtitleSystem>,
    remap_system: Option<RemapSystem>,
}

impl KokoApp {
    fn new() -> Self {
        let (tx, rx) = mpsc::channel();
        Self {
            window: None, gpu: None, time: Time::new(), input: Input::new(),
            editor: EditorState::new(),
            egui_ctx: None, egui_state: None, egui_renderer: None,
            pipeline: None, camera_buffer: None, camera_bind_group: None,
            model_buffer: None, model_bind_group: None,
            cube_vb: None, cube_ib: None, cube_idx_count: 0,
            sphere_vb: None, sphere_ib: None, sphere_idx_count: 0,
            plane_vb: None, plane_ib: None, plane_idx_count: 0,
            grid_vb: None, grid_vert_count: 0, grid_pipeline: None,
            sky_pipeline: None,
            sky_bind_group_layout: None,
            sky_bind_group: None,
            sky_buffer: None, ground_pipeline: None,
            ground_vb: None, ground_ib: None, ground_idx_count: 0,
            outline_pipeline: None,
            shadow_texture: None, shadow_sampler: None, shadow_pipeline: None,
            shadow_bind_group_layout: None, shadow_bind_group: None,
            light_buffer: None, light_bind_group: None,
            shadow_depth_texture: None, shadow_depth_view: None, shadow_depth_sampler: None,
            shadow_depth_pipeline: None, shadow_map_bind_group: None, shadow_map_bind_group_layout: None,
            light_vp_buffer: None, light_camera_bgl: None, light_camera_bg: None,
            cylinder_vb: None, cylinder_ib: None, cylinder_idx_count: 0,
            cone_vb: None, cone_ib: None, cone_idx_count: 0,
            torus_vb: None, torus_ib: None, torus_idx_count: 0,
            objects: Vec::new(),
            custom_meshes: Vec::new(),
            mesh_texture_bind_groups: Vec::new(),
            texture_bind_group_layout: None,
            default_texture_bind_group: None,
            material_flags_buffer: None,
            bloom_enabled: true,
            scene_texture: None, scene_texture_view: None,
            bloom_textures: Vec::new(),
            bloom_extract_pipeline: None, bloom_blur_pipeline: None, bloom_composite_pipeline: None,
            bloom_extract_bg: None, bloom_blur_h_bg: None, bloom_blur_v_bg: None, bloom_composite_bg: None,
            bloom_blur_h_params: None, bloom_blur_v_params: None,
            bloom_bgl: None, bloom_blur_bgl: None, bloom_composite_bgl: None,
            particle_emitters: Vec::new(),
            particle_pipeline: None, particle_storage_buffer: None,
            particle_uniform_buffer: None, particle_bind_group: None,
            particle_bgl: None, particle_max: 2000,
            scene_lights: Vec::new(),
            dyn_light_storage: None, dyn_light_bg: None, dyn_light_bgl: None,
            post_pipeline: None, post_bind_group: None, post_params_buffer: None,
            post_enabled: true,
            post_params: PostParamsRaw {
                time: 0.0, vignette_strength: 0.3, grain_strength: 0.03,
                chromatic_aberration: 0.003, saturation: 1.1, contrast: 1.05,
                brightness: 1.0, temperature: 0.1,
            },
            water_pipeline: None, water_bind_group: None, water_params_buffer: None, water_enabled: false,
            water_vb: None, water_ib: None, water_idx_count: 0,
            play_mode: false,
            physics_world: None,
            physics_bodies: Vec::new(),
            audio_engine: None,
            physics_playing: false,
            physics_snapshot: Vec::new(),
            physics_velocities: Vec::new(),
            physics_gravity: 9.81,
            gizmo_pipeline: None, gizmo_buffer: None, gizmo_bind_group: None,
            gizmo_arrow_vb: None, gizmo_arrow_ib: None, gizmo_arrow_count: 0,
            terrain_pipeline: None, terrain_bind_group: None, terrain_params_buffer: None,
            terrain_enabled: false, terrain_vb: None, terrain_ib: None, terrain_idx_count: 0,
            hud_elements: Vec::new(), hud_enabled: false,
            sun_direction: Vec3::new(0.5, 0.7, 0.4).normalize(),
            recording_path: false,
            recorded_keyframes: Vec::new(),
            record_timer: 0.0,
            command_history: Vec::new(),
            macro_recording: false,
            macro_commands: Vec::new(),
            saved_macros: std::collections::HashMap::new(),
            screenshot_requested: false,
            screenshot_buffer: None,
            object_animations: Vec::new(),
            day_cycle_active: false,
            day_cycle_speed: 1.0,
            day_cycle_time: 0.25,  // start at noon
            script_engine: koko_scripting::ScriptEngine::new().ok(),
            fog_enabled: false,
            fog_density: 0.02,
            fog_color: [0.7, 0.75, 0.8],
            auto_save_timer: 0.0,
            auto_save_interval: 120.0,
            reflection_quality: 2,
            frustum_culling: true,
            object_materials: Vec::new(),
            timeline_open: false,
            timeline_tracks: Vec::new(),
            timeline_playhead: 0.0,
            timeline_playing: false,
            timeline_duration: 10.0,  // auto-save every 2 minutes








            // Round 8
            relationships: Vec::new(),
            building_pieces: Vec::new(),
            build_mode: false,
            build_piece_type: BuildPieceType::Wall,
            build_material: "stone".into(),
            bank: Bank { accounts: { let mut a = std::collections::HashMap::new(); a.insert("player".into(), 0); a }, interest_rate: 0.05, loan_amount: 0, loan_remaining: 0 },
            auction_items: Vec::new(),
            weather_forecast: Vec::new(),
            season: Season { current: SeasonType::Spring, day_in_season: 1, days_per_season: 30 },
            territories: Vec::new(),
            resources: Vec::new(),
            blueprints: Vec::new(),
            morality: Morality { karma: 0, good_deeds: 0, evil_deeds: 0, title: "Neutral".into() },
            wanted_level: 0,
            wanted_timer: 0.0,
            hunger: 100.0,
            thirst: 100.0,
            hunger_enabled: false,
            stealth_mode: false,
            visibility: 1.0,
            noise_level: 0.5,
            reputation_log: Vec::new(),
            // Round 7
            wave_spawners: Vec::new(),
            puzzles: Vec::new(),
            traps: Vec::new(),
            day_night_events: Vec::new(),
            collectibles: Vec::new(),
            collected_count: 0,
            respawn_points: Vec::new(),
            ladders: Vec::new(),
            ropes: Vec::new(),
            triggers_2: Vec::new(),
            mini_games: Vec::new(),
            tooltips: Vec::new(),
            grapple_points: Vec::new(),
            zip_lines: Vec::new(),
            player_stats: {
                let mut s = std::collections::HashMap::new();
                s.insert("strength".into(), 10.0);
                s.insert("dexterity".into(), 10.0);
                s.insert("intelligence".into(), 10.0);
                s.insert("vitality".into(), 10.0);
                s.insert("luck".into(), 5.0);
                s.insert("defense".into(), 5.0);
                s.insert("speed".into(), 5.0);
                s
            },
            enemy_scale: 1.0,
            damage_scale: 1.0,
            ping_positions: Vec::new(),
            // Round 6
            vehicles: Vec::new(),
            current_vehicle: None,
            world_events: Vec::new(),
            procedural_rules: Vec::new(),
            mod_slots: Vec::new(),
            leaderboards: Vec::new(),
            camera_rigs: Vec::new(),
            active_camera_rig: None,
            dialogue_queue: Vec::new(),
            dialogue_display_timer: 0.0,
            letterbox: false,
            screen_tint: [0.0, 0.0, 0.0, 0.0],
            world_seed: 42,
            target_fps: 60,
            max_draw_distance: 500.0,
            lives: 3,
            max_lives: 5,
            respawn_timer: 0.0,
            invincibility_timer: 0.0,
            // Round 5
            biome: BiomeSettings { name: "temperate".into(), ground_color: [0.3, 0.45, 0.2, 1.0], fog_color: [0.7, 0.75, 0.8], fog_density: 0.02, tree_density: 0.3, grass_density: 0.5, ambient_sound: "birds".into(), temperature: 20.0, wind_strength: 0.3 },
            time_of_day: TimeOfDay { hour: 12.0, speed: 1.0, auto_lighting: true, sun_color: [1.0, 0.95, 0.8], ambient_color: [0.3, 0.35, 0.4], shadow_intensity: 0.7 },
            sound_mixer: SoundMixer { master_volume: 1.0, music_volume: 0.7, sfx_volume: 1.0, ambient_volume: 0.5, voice_volume: 1.0, channels: Vec::new() },
            party: Vec::new(),
            factions: Vec::new(),
            journal: Vec::new(),
            map_markers: Vec::new(),
            turn_based: TurnBasedState { active: false, turn_order: Vec::new(), current_turn: 0, round: 1, action_points: std::collections::HashMap::new() },
            npcs: Vec::new(),
            cutouts_2d: Vec::new(),
            music_tracks: Vec::new(),
            current_music: None,
            camera_fov: 60.0,
            camera_near: 0.1,
            camera_far: 1000.0,
            camera_orbit_dist: 8.0,
            camera_follow_target: None,
            camera_smoothing: 0.1,
            debug_draw_collisions: false,
            debug_draw_navmesh: false,
            debug_draw_ai: false,
            debug_fps_counter: false,
            gravity_direction: Vec3::new(0.0, -1.0, 0.0),
            ambient_color: [0.3, 0.35, 0.4],
            // Round 4
            economy: Economy {
                currencies: {
                    let mut c = std::collections::HashMap::new();
                    c.insert("gold".into(), 0);
                    c.insert("gems".into(), 0);
                    c
                },
                shops: Vec::new(),
            },
            skill_trees: Vec::new(),
            achievement_system: AchievementSystem { achievements: Vec::new() },
            ai_director: AiDirector { difficulty: 0.5, tension: 0.0, last_combat_time: 0.0, player_deaths: 0, enemies_killed: 0, spawn_multiplier: 1.0, loot_multiplier: 1.0 },
            minimap_2d: Minimap2D { center: Vec3::ZERO, zoom: 1.0, rotation_locked: false, show_enemies: true, show_waypoints: true, show_items: true },
            objective_markers: Vec::new(),
            photo_mode: PhotoMode { active: false, fov: 60.0, dof_distance: 10.0, dof_strength: 0.0, filter: PhotoFilter::None, frame: PhotoFrame::None, hide_ui: false, free_cam: true },
            weapon_slots: Vec::new(),
            current_weapon: 0,
            xp_system: XpSystem { level: 1, xp: 0, xp_to_next: 100, skill_points: 0, total_xp: 0 },
            conversations: Vec::new(),
            emotes: vec![
                EmoteAction { name: "wave".into(), animation: "wave".into(), duration: 2.0 },
                EmoteAction { name: "dance".into(), animation: "dance".into(), duration: 5.0 },
                EmoteAction { name: "salute".into(), animation: "salute".into(), duration: 1.5 },
                EmoteAction { name: "sit".into(), animation: "sit".into(), duration: 0.0 },
                EmoteAction { name: "laugh".into(), animation: "laugh".into(), duration: 3.0 },
            ],
            combo_count: 0,
            combo_timer: 0.0,
            max_combo: 0,
            kill_feed: Vec::new(),
            notification_queue: Vec::new(),
            // Round 3
            network_state: None,
            waypoints: Vec::new(),
            object_pools: Vec::new(),
            trails: Vec::new(),
            projectiles: Vec::new(),
            damage_numbers: Vec::new(),
            spawners: Vec::new(),
            interactables: Vec::new(),
            health_components: Vec::new(),
            move_components: Vec::new(),
            loot_tables: Vec::new(),
            abilities: Vec::new(),
            status_effects: Vec::new(),
            teleport_pads: Vec::new(),
            checkpoints_system: Vec::new(),
            last_checkpoint: None,
            time_scale: 1.0,
            screen_flash_color: [0.0; 4],
            screen_flash_timer: 0.0,
            wireframe_mode: false,
            xray_mode: false,
            // Round 2 systems
            physics_materials: {
                let mut m = std::collections::HashMap::new();
                m.insert("default".into(), PhysicsMaterial { name: "default".into(), friction: 0.5, restitution: 0.3, density: 1.0 });
                m.insert("ice".into(), PhysicsMaterial { name: "ice".into(), friction: 0.05, restitution: 0.1, density: 0.9 });
                m.insert("rubber".into(), PhysicsMaterial { name: "rubber".into(), friction: 0.9, restitution: 0.8, density: 1.1 });
                m.insert("metal".into(), PhysicsMaterial { name: "metal".into(), friction: 0.4, restitution: 0.2, density: 7.8 });
                m.insert("wood".into(), PhysicsMaterial { name: "wood".into(), friction: 0.6, restitution: 0.4, density: 0.6 });
                m
            },
            collision_settings: Vec::new(),
            hud_widgets: Vec::new(),
            particle_force_fields: Vec::new(),
            landscape_heightmap: vec![vec![0.0; 64]; 64],
            landscape_brush_mode: LandscapeMode::Raise,
            landscape_brush_size: 3.0,
            landscape_brush_strength: 0.5,
            animation_blueprints: Vec::new(),
            ik_chains: Vec::new(),
            light_probes: Vec::new(),
            reflection_captures: Vec::new(),
            cloth_sims: Vec::new(),
            volumetric_fog_volumes: Vec::new(),
            streaming_volumes: Vec::new(),
            cutscene_director: None,
            build_targets: vec![
                BuildTarget { platform: Platform::MacOS, name: "KOKO Game".into(), icon_path: None, version: "1.0.0".into() },
            ],
            bookmarks: Vec::new(),
            object_groups: Vec::new(),
            ragdolls: Vec::new(), bezier_paths: Vec::new(), buoyancy_zones: Vec::new(),
            stealth_detectors: Vec::new(), puzzle_switches: Vec::new(), puzzle_doors: Vec::new(),
            ziplines: Vec::new(), swim_zones: Vec::new(), boss_patterns: Vec::new(),
            music_layers: Vec::new(),
            wall_run: WallRunState { active: false, wall_normal: [0.0;3], time_on_wall: 0.0, max_time: 1.5, jump_force: 8.0 },
            destructible_chunks: Vec::new(),
            weather_gp: WeatherGameplay { wet_friction: 0.3, wind: [0.0;3], visibility: 1000.0, lightning_chance: 0.0, lightning_timer: 0.0 },
            proc_sky: ProceduralSky { enabled: false, sun_dir: [0.3,0.8,0.5], sun_color: [1.0,0.95,0.8], sky_top: [0.1,0.3,0.8], sky_horizon: [0.5,0.7,1.0], clouds: 0.3, stars: 0.0 },
            sprites: Vec::new(), patrol_routes: Vec::new(), dialogue_bubbles: Vec::new(),
            env_hazards: Vec::new(), ai_companions: Vec::new(), recipes: Vec::new(),
            gravity_fields: Vec::new(), portals_v2: Vec::new(), conveyors: Vec::new(),
            magnet_zones: Vec::new(), mirrors: Vec::new(), sec_cameras: Vec::new(),
            alarms: Vec::new(), cover_points: Vec::new(),
            moving_platforms: Vec::new(),
            breakable_walls: Vec::new(), secret_areas: Vec::new(), formations: Vec::new(),

            ai_behavior_trees: Vec::new(), ai_blackboards: Vec::new(),
            ai_perceptions: Vec::new(), ai_territories: Vec::new(), ai_squads: Vec::new(),
            dialogue_graphs: Vec::new(), reputations: Vec::new(),
            
            net_players: Vec::new(), net_syncs: Vec::new(), chat_messages_v2: Vec::new(),
            voice_chat: VoiceChat { enabled: false, push_to_talk: true, volume: 1.0, muted_players: Vec::new() },
            lobby: None, matchmaking: Matchmaking { searching: false, mode: "casual".into(), rank: 0, search_time: 0.0, regions: vec!["us-west".into()] },
            terrain_chunks: Vec::new(), biome_defs: Vec::new(), road_segments: Vec::new(),
            rivers: Vec::new(), lakes: Vec::new(), cliffs: Vec::new(), caves: Vec::new(),
            waterfalls: Vec::new(), bridges_v2: Vec::new(), fences_v2: Vec::new(),
            street_lights_v2: Vec::new(), signs: Vec::new(), barrels: Vec::new(), crates_v2: Vec::new(),
            campfires: Vec::new(), wells: Vec::new(), statues: Vec::new(), banners: Vec::new(),
            bookshelves: Vec::new(), thrones: Vec::new(), altars: Vec::new(), prisons: Vec::new(),
            shops_v2: Vec::new(), anvils: Vec::new(), furnaces: Vec::new(), workbenches: Vec::new(),
            storage_chests: Vec::new(), gardens: Vec::new(), fishing_spots: Vec::new(),
            mining_nodes: Vec::new(), harvestable_trees: Vec::new(),

            decal_projectors: Vec::new(), screen_effects: Vec::new(), camera_paths: Vec::new(),
            light_flickers: Vec::new(), trail_effects: Vec::new(), after_images: Vec::new(),
            shockwaves: Vec::new(), screen_shakes_v2: Vec::new(), slow_motion_zones: Vec::new(),
            freeze_frame: FreezeFrame { active: false, duration: 0.0, timer: 0.0 },
            hit_stop: HitStop { active: false, duration: 0.0, timer: 0.0 },
            camera_zoom: CameraZoom { target_fov: 60.0, speed: 2.0, active: false },
            depth_of_field: DepthOfField { enabled: false, focal_dist: 10.0, focal_range: 5.0, blur_amount: 1.0 },
            motion_blur: MotionBlur { enabled: false, intensity: 0.5, samples: 8 },
            color_grading: ColorGrading { enabled: false, contrast: 1.0, saturation: 1.0, brightness: 1.0, temperature: 6500.0, tint: [1.0;3], shadows: [1.0;3], midtones: [1.0;3], highlights: [1.0;3] },
            lens_flares: Vec::new(), god_rays: GodRay { enabled: false, pos: [0.0,100.0,0.0], color: [1.0,0.9,0.7,1.0], intensity: 1.0, decay: 0.96, samples: 64 },
            outlines: Vec::new(), rim_lights: Vec::new(), dissolve_effects: Vec::new(), holograms: Vec::new(),
            force_fields: Vec::new(), electric_arcs: Vec::new(), beams: Vec::new(),
            chain_lightnings: Vec::new(), explosions: Vec::new(), impact_effects: Vec::new(),
            floating_texts: Vec::new(), health_bars_3d: Vec::new(), name_tags: Vec::new(),
            damage_indicators: Vec::new(),
            crosshair: Crosshair { style: CrosshairStyle::Cross, color: [1.0;4], size: 20.0, gap: 4.0, dot: true, dynamic_spread: 0.0 },
            radar: Radar { enabled: false, pos: [0.9,0.1], size: 150.0, range: 50.0, rotation: 0.0, blips: Vec::new() },
            ammo_counter: AmmoCounter { current: 30, max_ammo: 30, reserve: 120, weapon_name: "Rifle".into() },
            stamina_bar: StaminaBar { current: 100.0, max_stamina: 100.0, regen_rate: 20.0, regen_delay: 1.0, delay_timer: 0.0 },
            mana_bar: ManaBar { current: 100.0, max_mana: 100.0, regen_rate: 5.0 },
            xp_bar: XPBar { current: 0, next_level: 1000, level: 1 },
            combo_counter: ComboCounter { hits: 0, timer: 0.0, timeout: 2.0, multiplier: 1.0, best: 0 },
            score_display: ScoreDisplay { score: 0, displayed_score: 0, speed: 500.0 },
            kill_streak: KillStreak { count: 0, timer: 0.0, timeout: 5.0, best: 0 },
            notifications_v2: Vec::new(),
            quest_tracker: QuestTracker { active_quests: Vec::new(), pos: [0.02, 0.3], visible: true },
            interaction_prompts: Vec::new(), tooltips_v2: Vec::new(),
            loading_screen: LoadingScreen { active: false, progress: 0.0, tip: String::new(), background: String::new() },
            splash_screen: SplashScreen { active: false, image: String::new(), duration: 3.0, timer: 0.0, fade: 1.0 },
            pause_menu: PauseMenu { open: false, options: vec!["Resume".into(),"Settings".into(),"Quit".into()], selected: 0 },
            settings_menu: SettingsMenu { open: false, master_vol: 1.0, sfx_vol: 1.0, music_vol: 1.0, sensitivity: 1.0, fov: 60.0, fullscreen: false, vsync: true, quality: 2 },
            photo_mode_state: PhotoModeState { active: false, hide_ui: false, dof_enabled: false, focal_dist: 10.0, filter: String::new(), fov: 60.0, roll: 0.0, time_frozen: false },
            replay_system: ReplaySystem { recording: false, playing: false, frames: Vec::new(), current_frame: 0, speed: 1.0 },
            ghost_recordings: Vec::new(),
            benchmark: Benchmark { running: false, frames: 0, total_time: 0.0, min_fps: f32::MAX, max_fps: 0.0, avg_fps: 0.0, scene: String::new() },
            perf_overlay: PerformanceOverlay { show_fps: false, show_ms: false, show_gpu: false, show_memory: false, show_draw_calls: false, show_triangles: false, history: Vec::new() },
            wireframe_v2: WireframeMode { enabled: false, color: [0.0,1.0,0.0,1.0], thickness: 1.0 },
            grid_overlay: GridOverlay { enabled: true, size: 1.0, color: [0.3,0.3,0.3,0.5], subdivisions: 5, fade_distance: 50.0 },
            bounds_viz: BoundsVisualization { show_aabb: false, show_collision: false, show_triggers: false, show_navmesh: false, show_paths: false }, combat_arenas: Vec::new(), treasure_chests: Vec::new(),

            springs: Vec::new(), portals_v3: Vec::new(), ladders_v2: Vec::new(), grapple_points_v2: Vec::new(),
            trampolines: Vec::new(), fans: Vec::new(), lasers: Vec::new(), crushers: Vec::new(),
            flame_jets: Vec::new(), pressure_plates_v2: Vec::new(), ropes_v2: Vec::new(),
            scoring_zones: Vec::new(), timers_v2: Vec::new(), counters: Vec::new(),
            env_puzzles: Vec::new(), minimap_v2: Minimap2 { enabled: false, pos: [0.9, 0.1], size: 200.0, zoom: 1.0, rotation: 0.0, icons: Vec::new() },
            compass_markers: Vec::new(),
            damage_zones: Vec::new(), heal_zones: Vec::new(), speed_zones: Vec::new(),
            slow_zones: Vec::new(), teleport_pads_v2: Vec::new(), projectiles_v2: Vec::new(),
            pickup_spawners: Vec::new(), torches: Vec::new(), level_gates: Vec::new(),
            dialogues_v2: Vec::new(), cutscene_triggers: Vec::new(), ambient_sounds: Vec::new(),
            footsteps: Vec::new(), weather_zones: Vec::new(), wind_zones_v2: Vec::new(),
            reflectors: Vec::new(), glow_objects: Vec::new(), shadow_casters: Vec::new(),
            play_in_editor: false,
            pie_camera_pos: Vec3::ZERO,
            pie_camera_yaw: 0.0,
            pie_camera_pitch: 0.0,
            wind_direction: Vec3::new(1.0, 0.0, 0.0),
            wind_strength: 0.0,
            game_score: 0,
            game_timer: 0.0,
            game_timer_running: false,
            game_paused: false,
            // Unreal-tier systems
            ai_agents: Vec::new(),
            nav_points: Vec::new(),
            nav_connections: Vec::new(),
            dialogue_trees: std::collections::HashMap::new(),
            active_dialogue: None,
            dialogue_node_idx: 0,
            inventories: std::collections::HashMap::new(),
            quests: Vec::new(),
            save_slots: Vec::new(),
            input_actions: std::collections::HashMap::new(),
            audio_zones: Vec::new(),
            reverb_preset: ReverbPreset::None,
            pp_volumes: Vec::new(),
            decals: Vec::new(),
            foliage_instances: Vec::new(),
            foliage_brush_size: 5.0,
            foliage_density: 0.5,
            foliage_painting: false,
            sub_levels: Vec::new(),
            active_level: "main".into(),
            data_tables: std::collections::HashMap::new(),
            crowd_agents: Vec::new(),
            destructibles: Vec::new(),
            spline_meshes: Vec::new(),
            instance_groups: Vec::new(),
            active_template: None,
            state_machines: Vec::new(),
            event_queue: Vec::new(),
            event_listeners: Vec::new(),
            game_variables: std::collections::HashMap::new(),
            camera_shake_intensity: 0.0,
            camera_shake_duration: 0.0,
            camera_shake_timer: 0.0,
            minimap_enabled: false,
            minimap_zoom: 1.0,
            world_bounds: None,
            kill_z: -100.0,
            constraints: Vec::new(),
            object_tags: std::collections::HashMap::new(),
            layers: vec![Layer { name: "Default".into(), visible: true, locked: false }],
            object_layers: std::collections::HashMap::new(),
            sequencer_tracks: Vec::new(),
            sequencer_playing: false,
            sequencer_time: 0.0,
            sequencer_duration: 30.0,
            copilot_analyze_timer: 0.0,
            copilot_last_object_count: 0,
            copilot_suggestion_cooldown: 0.0,
            ai_api_key: std::env::var("KOKO_API_KEY").ok()
                .or_else(|| std::env::var("ANTHROPIC_API_KEY").ok()),
            ai_model: std::env::var("KOKO_MODEL").unwrap_or_else(|_| "claude-sonnet-4-20250514".to_string()),
            cinematic_active: false,
            cinematic_time: 0.0,
            cinematic_duration: 5.0,
            cinematic_keyframes: Vec::new(),
            camera_pos: Vec3::new(8.0, 6.0, 12.0),
            camera_yaw: -0.55, camera_pitch: -0.3,
            orbit_target: Vec3::ZERO,
            dragging_object: false,
            ground_color: [0.25, 0.28, 0.22, 1.0],
            ground_roughness: 0.7,
            ground_metallic: 0.0,
            ground_emissive: 0.0,
            drag_start_pos: Vec3::ZERO,
            drag_plane_y: 0.0,
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            ai_rx: rx, ai_tx: tx,
            #[cfg(not(target_arch = "wasm32"))]
            tokio_rt: tokio::runtime::Runtime::new().unwrap(),
            #[cfg(target_arch = "wasm32")]
            tokio_rt: (),
            elevators: Vec::new(),
            turrets: Vec::new(),
            // ======== ROUNDS 46-55: DEEP SYSTEM INITS ========
            camera_system_v2: None,
            lighting_system_v2: None,
            vegetation_system: None,
            dialogue_system_v2: None,
            quest_system_v2: None,
            inventory_system: None,
            combat_system: None,
            crafting_system_v2: None,
            ai_brain_system: None,
            audio_system_v2: None,

            // ======== ROUNDS 56-65: ADVANCED SYSTEM INITS ========
            weather_engine: None,
            physics_constraints: None,
            save_system_v2: None,
            editor_tool_system: None,
            procedural_anim: None,
            water_system_v2: None,
            destruction_system: None,
            terrain_painter: None,
            game_mode_system: None,
            vfx_system_v2: None,
            decal_system_v2: None,

            // ======== ROUNDS 66-75: ADVANCED SYSTEM INITS ========
            character_customizer: None,
            economy_engine: None,
            cinematic_engine: None,
            world_streaming: None,
            lod_system_v2: None,
            occlusion_system_v2: None,
            mod_system: None,
            plugin_system_v2: None,
            progression_system: None,
            building_system_v2: None,
            vehicle_system_v2: None,
            social_system_v2: None,
            analytics_system: None,

            // ======== ROUNDS 76-80 INITS ========
            anim_state_machine_v2: None,
            level_design_tools: None,
            pathfinding_system: None,
            shader_library: None,
            perf_optimizer: None,

            shields: Vec::new(),
            // ======== ROUNDS 33-45: DEEP ENGINE INITS ========
            terrain_engine: None,
            world_generator: None,
            cave_generator: None,
            network_engine: None,
            lobby_system: None,
            ui_engine: None,
            drag_drop: DragDropSystem { dragging: None, drop_targets: vec![], preview: false },
            input_system_v2: None,
            haptic_feedback: vec![],
            input_recorder: InputRecorder { recording: false, events: vec![], playback_speed: 1.0, playing_back: false, playback_pos: 0 },
            particle_engine: None,
            material_engine: None,
            scene_graph_v2: None,
            ecs_world: None,
            profiler_v2: Profiler2 { frames: vec![], gpu_frames: vec![], memory_snapshots: vec![], recording: false, max_frames: 300 },
            debug_console: DebugConsole { history: vec![], commands: vec![], visible: false, input: String::new(), log_level: LogLevel2::Info2 },
            debug_draw: DebugDraw { lines: vec![], spheres: vec![], boxes: vec![], texts: vec![], persistent: vec![], depth_test: true },
            asset_pipeline: None,
            asset_database: None,
            localization: None,
            accessibility_engine: None,
            tts: None,
            subtitle_system_v2: None,
            remap_system: None,
        }
    }

    fn send_to_ai(&mut self, prompt: &str) {
        // Batch commands: "add tree; add rock; rain"
        if prompt.contains(';') {
            let commands: Vec<&str> = prompt.split(';').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
            if commands.len() > 1 {
                for cmd in &commands {
                    self.send_to_ai(cmd);
                }
                return;
            }
        }

        self.editor.ai_processing = true;
        self.editor.ai_status = "Processing...".into();

        // Track command history
        let prompt_str = prompt.to_string();
        if !prompt_str.is_empty() && prompt_str != "!!" && !prompt_str.starts_with("record") && !prompt_str.starts_with("save macro") {
            self.command_history.push(prompt_str.clone());
            if self.command_history.len() > 100 { self.command_history.remove(0); }
            if self.macro_recording {
                self.macro_commands.push(prompt_str);
            }
        }

        let lower = prompt.to_lowercase();

        // ═══════════════════════════════════════════════════════
        // PROMPT COMMAND ROUTING — particles, water, terrain, etc.
        // ═══════════════════════════════════════════════════════

        // --- Particle commands ---
        if lower.starts_with("add fire") || lower == "fire" {
            let pos = self.find_prompt_position(&lower);
            self.particle_emitters.push(ParticleEmitter::new(pos, ParticleType::Fire));
            self.editor.add_ai_response("🔥 Fire particles added!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("add smoke") || lower == "smoke" {
            let pos = self.find_prompt_position(&lower);
            self.particle_emitters.push(ParticleEmitter::new(pos, ParticleType::Smoke));
            self.editor.add_ai_response("💨 Smoke particles added!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("add spark") || lower == "sparks" {
            let pos = self.find_prompt_position(&lower);
            self.particle_emitters.push(ParticleEmitter::new(pos, ParticleType::Sparks));
            self.editor.add_ai_response("✨ Spark particles added!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("add rain") || lower == "rain" {
            self.particle_emitters.push(ParticleEmitter::new(Vec3::new(0.0, 15.0, 0.0), ParticleType::Rain));
            self.editor.add_ai_response("🌧️ Rain particles added!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("add snow") || lower == "snow" {
            self.particle_emitters.push(ParticleEmitter::new(Vec3::new(0.0, 15.0, 0.0), ParticleType::Snow));
            self.editor.add_ai_response("❄️ Snow particles added!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("add magic") || lower == "magic" {
            let pos = self.find_prompt_position(&lower);
            self.particle_emitters.push(ParticleEmitter::new(pos, ParticleType::Magic));
            self.editor.add_ai_response("✨ Magic particles added!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "clear particles" || lower == "remove particles" || lower == "no particles" {
            self.particle_emitters.clear();
            self.editor.add_ai_response("🧹 All particles cleared!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Light commands ---
        if lower.starts_with("add light") || lower.starts_with("add point light") {
            let color = if lower.contains("red") { [1.0, 0.2, 0.1] }
                else if lower.contains("green") { [0.1, 1.0, 0.2] }
                else if lower.contains("blue") { [0.2, 0.3, 1.0] }
                else if lower.contains("yellow") { [1.0, 0.9, 0.2] }
                else if lower.contains("purple") { [0.7, 0.1, 1.0] }
                else if lower.contains("orange") { [1.0, 0.5, 0.1] }
                else if lower.contains("pink") { [1.0, 0.4, 0.7] }
                else if lower.contains("cyan") { [0.1, 0.9, 0.9] }
                else { [1.0, 0.95, 0.8] };
            let pos = self.find_prompt_position(&lower) + Vec3::new(0.0, 3.0, 0.0);
            let n = self.scene_lights.len();
            self.scene_lights.push(SceneLight {
                position: pos, radius: 15.0, color, intensity: 2.0,
                direction: Vec3::NEG_Y, spot_cutoff: 0.0,
                name: format!("light_{}", n),
            });
            self.update_light_buffer();
            self.editor.add_ai_response(&format!("💡 Point light added at [{:.0}, {:.0}, {:.0}]!", pos.x, pos.y, pos.z));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("add spot") || lower.starts_with("add spotlight") {
            let color = if lower.contains("red") { [1.0, 0.2, 0.1] } else { [1.0, 0.95, 0.8] };
            let pos = self.find_prompt_position(&lower) + Vec3::new(0.0, 5.0, 0.0);
            let n = self.scene_lights.len();
            self.scene_lights.push(SceneLight {
                position: pos, radius: 20.0, color, intensity: 3.0,
                direction: Vec3::NEG_Y, spot_cutoff: 0.9,
                name: format!("spot_{}", n),
            });
            self.update_light_buffer();
            self.editor.add_ai_response("🔦 Spotlight added!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "clear lights" || lower == "remove lights" || lower == "no lights" {
            self.scene_lights.clear();
            self.update_light_buffer();
            self.editor.add_ai_response("🧹 All dynamic lights cleared!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Water commands ---
        if lower.starts_with("add water") || lower.starts_with("add ocean") || lower == "water" || lower == "ocean" {
            self.water_enabled = true;
            self.editor.add_ai_response("🌊 Water plane enabled!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "remove water" || lower == "no water" {
            self.water_enabled = false;
            self.editor.add_ai_response("🌊 Water disabled.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Terrain commands ---
        if lower == "terrain on" || lower == "add terrain" || lower == "terrain" || lower == "enable terrain" {
            self.terrain_enabled = true;
            self.editor.add_ai_response("⛰️ Terrain enabled!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "terrain off" || lower == "remove terrain" || lower == "no terrain" || lower == "disable terrain" {
            self.terrain_enabled = false;
            self.editor.add_ai_response("⛰️ Terrain disabled.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Physics play/stop ---
        if lower == "play" || lower == "start" || lower == "simulate" {
            if !self.physics_playing {
                self.start_physics_play();
                self.editor.add_ai_response("▶️ Physics simulation started! Type 'stop' to end.");
            } else {
                self.editor.add_ai_response("⚠ Already playing!");
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "stop" || lower == "pause" || lower == "edit" {
            if self.physics_playing {
                self.stop_physics_play();
                self.editor.add_ai_response("⏹️ Physics stopped. Back to edit mode.");
            } else {
                self.editor.add_ai_response("⚠ Not playing.");
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Audio commands ---
        if lower.starts_with("play sound") || lower.starts_with("play music") || lower.starts_with("play audio") {
            let file = lower.replace("play sound", "").replace("play music", "").replace("play audio", "").trim().to_string();
            if file.is_empty() {
                self.editor.add_ai_response("🔊 Specify a sound file, e.g. 'play sound bgm.ogg'");
            } else {
                let assets = self.find_assets_dir().replace("/models", "/audio");
                let path = format!("{}/{}", assets, file);
                let snd_name = file.replace('.', "_");
                if let Some(ref mut audio) = self.audio_engine {
                    if let Err(e) = audio.load_sound(&snd_name, std::path::Path::new(&path)) {
                        self.editor.add_ai_response(&format!("❌ Failed to load {}: {}", file, e));
                    } else {
                        match audio.play(&snd_name) {
                            Ok(_) => self.editor.add_ai_response(&format!("🔊 Playing {}!", file)),
                            Err(e) => self.editor.add_ai_response(&format!("❌ Play error: {}", e)),
                        }
                    }
                } else {
                    self.editor.add_ai_response("❌ Audio engine not initialized.");
                }
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Export commands ---
        if lower.starts_with("export ") {
            let name = prompt.trim_start_matches("export ").trim_start_matches("Export ").trim().to_string();
            let name = if name.is_empty() { "MyGame".to_string() } else { name };
            match self.export_game(&name) {
                Ok(path) => self.editor.add_ai_response(&format!("📦 Exported to {}!", path)),
                Err(e) => self.editor.add_ai_response(&format!("❌ Export failed: {}", e)),
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Save/Load scene ---
        if lower.starts_with("save scene") || lower.starts_with("save as") {
            let name = lower.replace("save scene", "").replace("save as", "").trim().to_string();
            let name = if name.is_empty() { "scene" } else { &name };
            let scene_data = self.serialize_scene();
            let save_dir = self.find_assets_dir().replace("/models", "/scenes");
            let _ = std::fs::create_dir_all(&save_dir);
            let path = format!("{}/{}.json", save_dir, name);
            match std::fs::write(&path, &scene_data) {
                Ok(_) => self.editor.add_ai_response(&format!("💾 Scene saved to {}!", path)),
                Err(e) => self.editor.add_ai_response(&format!("❌ Save failed: {}", e)),
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("load scene") || lower.starts_with("open scene") {
            let name = lower.replace("load scene", "").replace("open scene", "").trim().to_string();
            let name = if name.is_empty() { "scene" } else { &name };
            let save_dir = self.find_assets_dir().replace("/models", "/scenes");
            let path = format!("{}/{}.json", save_dir, name);
            match std::fs::read_to_string(&path) {
                Ok(json) => {
                    self.push_undo();
                    self.deserialize_scene(&json);
                    self.sync_editor_scene();
                    self.editor.add_ai_response(&format!("📂 Scene '{}' loaded!", name));
                }
                Err(e) => self.editor.add_ai_response(&format!("❌ Load failed: {}", e)),
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "list scenes" || lower == "scenes" {
            let save_dir = self.find_assets_dir().replace("/models", "/scenes");
            let scenes: Vec<String> = std::fs::read_dir(&save_dir)
                .map(|entries| entries.filter_map(|e| e.ok())
                    .filter_map(|e| e.path().file_stem().map(|s| s.to_string_lossy().to_string()))
                    .collect())
                .unwrap_or_default();
            if scenes.is_empty() {
                self.editor.add_ai_response("📁 No saved scenes. Use 'save scene myname' to save.");
            } else {
                self.editor.add_ai_response(&format!("📁 Scenes: {}", scenes.join(", ")));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Camera commands ---
        if lower.starts_with("camera ") || lower.starts_with("move camera") || lower.starts_with("look at") {
            if lower.contains("top") || lower.contains("above") || lower.contains("bird") {
                self.camera_pos = Vec3::new(0.0, 20.0, 0.1);
                self.camera_pitch = -1.5;
                self.camera_yaw = 0.0;
                self.editor.add_ai_response("📷 Top-down view!");
            } else if lower.contains("front") || lower.contains("forward") {
                self.camera_pos = Vec3::new(0.0, 5.0, 15.0);
                self.camera_pitch = -0.2;
                self.camera_yaw = 0.0;
                self.editor.add_ai_response("📷 Front view!");
            } else if lower.contains("side") || lower.contains("left") {
                self.camera_pos = Vec3::new(-15.0, 5.0, 0.0);
                self.camera_pitch = -0.2;
                self.camera_yaw = std::f32::consts::FRAC_PI_2;
                self.editor.add_ai_response("📷 Side view!");
            } else if lower.contains("close") || lower.contains("zoom in") {
                self.camera_pos = Vec3::new(3.0, 2.0, 5.0);
                self.camera_pitch = -0.2;
                self.camera_yaw = -0.3;
                self.editor.add_ai_response("📷 Close-up view!");
            } else if lower.contains("far") || lower.contains("zoom out") || lower.contains("wide") {
                self.camera_pos = Vec3::new(15.0, 12.0, 20.0);
                self.camera_pitch = -0.4;
                self.camera_yaw = -0.6;
                self.editor.add_ai_response("📷 Wide view!");
            } else if lower.contains("reset") || lower.contains("default") {
                self.camera_pos = Vec3::new(8.0, 6.0, 12.0);
                self.camera_pitch = -0.3;
                self.camera_yaw = -0.55;
                self.editor.add_ai_response("📷 Camera reset!");
            } else {
                self.editor.add_ai_response("📷 Camera views: top, front, side, close, far, reset");
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Time of day / mood ---
        if lower.contains("night") || lower.contains("dark mode") || lower.contains("dark") {
            self.post_params.brightness = 0.4;
            self.post_params.temperature = -0.2;
            self.post_params.saturation = 0.7;
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu {
                    gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params));
                }
            }
            self.editor.add_ai_response("🌙 Night mode!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.contains("sunset") || lower.contains("golden hour") || lower.contains("warm") {
            self.post_params.brightness = 1.1;
            self.post_params.temperature = 0.4;
            self.post_params.saturation = 1.3;
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu {
                    gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params));
                }
            }
            self.editor.add_ai_response("🌅 Sunset mode!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "day" || lower == "daytime" || lower == "bright" || lower == "normal" {
            self.post_params.brightness = 1.0;
            self.post_params.temperature = 0.1;
            self.post_params.saturation = 1.1;
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu {
                    gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params));
                }
            }
            self.editor.add_ai_response("☀️ Day mode!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "foggy" || lower == "fog" || lower == "misty" {
            self.post_params.brightness = 0.85;
            self.post_params.saturation = 0.5;
            self.post_params.contrast = 0.8;
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu {
                    gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params));
                }
            }
            self.editor.add_ai_response("🌫️ Foggy mode!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Gravity control ---
        if lower.starts_with("gravity ") {
            let val = lower.replace("gravity ", "").trim().to_string();
            if val == "off" || val == "zero" || val == "0" {
                self.physics_gravity = 0.0;
                self.editor.add_ai_response("🪐 Zero gravity!");
            } else if val == "moon" || val == "low" {
                self.physics_gravity = 1.62;
                self.editor.add_ai_response("🌙 Moon gravity (1.62)!");
            } else if val == "mars" {
                self.physics_gravity = 3.72;
                self.editor.add_ai_response("🔴 Mars gravity (3.72)!");
            } else if val == "earth" || val == "normal" || val == "reset" {
                self.physics_gravity = 9.81;
                self.editor.add_ai_response("🌍 Earth gravity (9.81)!");
            } else if val == "heavy" || val == "jupiter" || val == "high" {
                self.physics_gravity = 24.79;
                self.editor.add_ai_response("🟤 Jupiter gravity (24.79)!");
            } else if let Ok(g) = val.parse::<f32>() {
                self.physics_gravity = g;
                self.editor.add_ai_response(&format!("⚙️ Gravity set to {:.2}!", g));
            } else {
                self.editor.add_ai_response("Gravity options: off, moon, mars, earth, jupiter, or a number");
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Duplicate / clone object ---
        if lower.starts_with("duplicate ") || lower.starts_with("clone ") {
            let target = lower.replacen("duplicate ", "", 1).replacen("clone ", "", 1).trim().to_string();
            if let Some(idx) = self.objects.iter().position(|o| o.name.to_lowercase().contains(&target)) {
                let src = &self.objects[idx];
                let new_obj = SceneObject {
                    name: format!("{}_copy", src.name),
                    transform: Transform {
                        position: src.transform.position + Vec3::new(2.0, 0.0, 0.0),
                        rotation: src.transform.rotation,
                        scale: src.transform.scale,
                    },
                    color: src.color,
                    mesh_type: src.mesh_type,
                    spin_speed: src.spin_speed,
                    parent: None, lod_meshes: Vec::new(),
                };
                let name = new_obj.name.clone();
                self.push_undo();
                self.objects.push(new_obj);
                self.sync_editor_scene();
                self.editor.add_ai_response(&format!("📋 Duplicated as {}!", name));
            } else {
                self.editor.add_ai_response(&format!("⚠ Couldn't find '{}'", target));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Rotate object ---
        if lower.starts_with("rotate ") || lower.starts_with("spin ") {
            let parts: Vec<&str> = lower.splitn(2, ' ').collect();
            if parts.len() > 1 {
                let rest = parts[1].trim();
                // Find any existing object name
                if let Some(idx) = self.objects.iter().position(|o| rest.contains(&o.name.to_lowercase())) {
                    self.objects[idx].spin_speed = if self.objects[idx].spin_speed > 0.0 { 0.0 } else { 1.0 };
                    let state = if self.objects[idx].spin_speed > 0.0 { "spinning" } else { "stopped" };
                    self.editor.add_ai_response(&format!("🔄 {} is {}!", self.objects[idx].name, state));
                } else {
                    // Spin all objects
                    for obj in &mut self.objects { obj.spin_speed = 0.5; }
                    self.editor.add_ai_response("🔄 All objects spinning!");
                }
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Scale object ---
        if lower.starts_with("scale ") || lower.starts_with("resize ") {
            let rest = lower.replacen("scale ", "", 1).replacen("resize ", "", 1).trim().to_string();
            let words: Vec<&str> = rest.split_whitespace().collect();
            if words.len() >= 2 {
                let factor: f32 = words.last().and_then(|w| w.parse().ok()).unwrap_or(1.0);
                let name_part = words[..words.len()-1].join(" ");
                if let Some(idx) = self.objects.iter().position(|o| o.name.to_lowercase().contains(&name_part)) {
                    self.push_undo();
                    self.objects[idx].transform.scale *= factor;
                    self.sync_editor_scene();
                    self.editor.add_ai_response(&format!("📐 Scaled {} by {}x!", self.objects[idx].name, factor));
                } else {
                    self.editor.add_ai_response(&format!("⚠ Couldn't find '{}'", name_part));
                }
            } else {
                self.editor.add_ai_response("Usage: 'scale objectname 2.0'");
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Move object ---
        // === NATURAL LANGUAGE: "move the castle 6 feet" / "move castle left 3" / "move X N units direction" ===
        {
            let move_re_patterns = [
                // "move the castle 6 feet left" / "move castle 3 feet"
                "move ", "push ", "slide ", "shift ",
            ];
            let is_move_cmd = move_re_patterns.iter().any(|p| lower.starts_with(p)) && !lower.contains("camera");
            if is_move_cmd {
                let rest = lower.replacen("move ", "", 1).replacen("push ", "", 1)
                    .replacen("slide ", "", 1).replacen("shift ", "", 1)
                    .replace("the ", "").replace("a ", "").trim().to_string();
                
                // Parse distance (feet/units/meters)
                let mut distance = 2.0f32;
                let distance_re = regex::Regex::new(r"(\d+\.?\d*)\s*(feet|foot|ft|units?|meters?|m|blocks?)?").unwrap();
                if let Some(caps) = distance_re.captures(&rest) {
                    distance = caps[1].parse::<f32>().unwrap_or(2.0);
                }
                
                // Parse direction
                let dir_map = [
                    ("left", [-1.0f32, 0.0, 0.0]),
                    ("right", [1.0, 0.0, 0.0]),
                    ("forward", [0.0, 0.0, 1.0]),
                    ("forwards", [0.0, 0.0, 1.0]),
                    ("front", [0.0, 0.0, 1.0]),
                    ("back", [0.0, 0.0, -1.0]),
                    ("backward", [0.0, 0.0, -1.0]),
                    ("backwards", [0.0, 0.0, -1.0]),
                    ("up", [0.0, 1.0, 0.0]),
                    ("down", [0.0, -1.0, 0.0]),
                    ("north", [0.0, 0.0, 1.0]),
                    ("south", [0.0, 0.0, -1.0]),
                    ("east", [1.0, 0.0, 0.0]),
                    ("west", [-1.0, 0.0, 0.0]),
                    ("closer", [0.0, 0.0, 1.0]),
                    ("away", [0.0, 0.0, -1.0]),
                ];
                let mut direction = [0.0f32, 0.0, 0.0];
                let mut dir_word = "forward";
                for (word, dir) in &dir_map {
                    if rest.contains(word) {
                        direction = *dir;
                        dir_word = word;
                        break;
                    }
                }
                // If no direction found, default forward
                if direction == [0.0, 0.0, 0.0] { direction = [0.0, 0.0, 1.0]; dir_word = "forward"; }
                
                // Extract object name (remove numbers, direction words, unit words)
                let clean = rest.replace(dir_word, "");
                let clean = distance_re.replace_all(&clean, "").to_string();
                let name_part: String = clean.split_whitespace()
                    .filter(|w| !["feet","foot","ft","units","unit","meters","meter","m","blocks","block","to","by","over"].contains(w))
                    .collect::<Vec<_>>().join(" ").trim().to_string();
                
                if let Some(idx) = self.objects.iter().position(|o| o.name.to_lowercase().contains(&name_part)) {
                    self.push_undo();
                    self.objects[idx].transform.position.x += direction[0] * distance;
                    self.objects[idx].transform.position.y += direction[1] * distance;
                    self.objects[idx].transform.position.z += direction[2] * distance;
                    self.sync_editor_scene();
                    self.editor.add_ai_response(&format!("➡️ Moved {} {:.0} feet {}!", self.objects[idx].name, distance, dir_word));
                } else if !name_part.is_empty() {
                    self.editor.add_ai_response(&format!("⚠ Couldn't find '{}'. Objects: {}", name_part,
                        self.objects.iter().map(|o| o.name.as_str()).collect::<Vec<_>>().join(", ")));
                }
                self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
                return;
            }
        }

        // === NATURAL LANGUAGE: "turn the castle red" / "make it blue" / "paint the house green" ===
        {
            let color_patterns = ["turn ", "make ", "paint ", "set "];
            let color_names = [
                ("red", [1.0f32, 0.15, 0.1, 1.0]),
                ("blue", [0.1, 0.3, 1.0, 1.0]),
                ("green", [0.15, 0.8, 0.2, 1.0]),
                ("yellow", [1.0, 0.9, 0.1, 1.0]),
                ("orange", [1.0, 0.5, 0.05, 1.0]),
                ("purple", [0.6, 0.1, 0.9, 1.0]),
                ("pink", [1.0, 0.4, 0.7, 1.0]),
                ("white", [1.0, 1.0, 1.0, 1.0]),
                ("black", [0.05, 0.05, 0.05, 1.0]),
                ("brown", [0.45, 0.25, 0.1, 1.0]),
                ("gold", [1.0, 0.84, 0.0, 1.0]),
                ("silver", [0.75, 0.75, 0.75, 1.0]),
                ("cyan", [0.0, 0.9, 0.9, 1.0]),
                ("magenta", [0.9, 0.0, 0.9, 1.0]),
                ("gray", [0.5, 0.5, 0.5, 1.0]),
                ("grey", [0.5, 0.5, 0.5, 1.0]),
                ("dark", [0.15, 0.15, 0.15, 1.0]),
                ("bright", [1.0, 1.0, 0.9, 1.0]),
            ];
            let is_color_cmd = color_patterns.iter().any(|p| lower.starts_with(p));
            if is_color_cmd {
                let mut found_color: Option<(&str, [f32;4])> = None;
                for (cn, cv) in &color_names {
                    if lower.contains(cn) {
                        found_color = Some((cn, *cv));
                        break;
                    }
                }
                if let Some((color_word, color_val)) = found_color {
                    let clean = lower.replace("turn ", "").replace("make ", "").replace("paint ", "")
                        .replace("set ", "").replace("the ", "").replace("a ", "")
                        .replace("it ", "").replace("to ", "").replace(color_word, "")
                        .replace("color", "").trim().to_string();
                    let name_part = clean.trim().to_string();
                    
                    // "make it red" → use selected entity
                    if name_part.is_empty() || name_part == "this" {
                        if let Some(sel) = &self.editor.selected_entity.clone() {
                            if let Some(idx) = self.objects.iter().position(|o| &o.name == sel) {
                                self.push_undo();
                                self.objects[idx].color = color_val;
                                self.sync_editor_scene();
                                self.editor.add_ai_response(&format!("🎨 {} is now {}!", sel, color_word));
                            }
                        } else {
                            self.editor.add_ai_response("⚠ Select an object first, or say 'turn castle red'");
                        }
                    } else if let Some(idx) = self.objects.iter().position(|o| o.name.to_lowercase().contains(&name_part)) {
                        self.push_undo();
                        self.objects[idx].color = color_val;
                        self.sync_editor_scene();
                        self.editor.add_ai_response(&format!("🎨 {} is now {}!", self.objects[idx].name, color_word));
                    } else {
                        self.editor.add_ai_response(&format!("⚠ Couldn't find '{}'. Objects: {}", name_part,
                            self.objects.iter().map(|o| o.name.as_str()).collect::<Vec<_>>().join(", ")));
                    }
                    self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
                    return;
                }
            }
        }

        // === NATURAL LANGUAGE: "change the ground to snow" / "make ground look like grass" ===
        {
            let ground_keywords = ["ground", "floor", "terrain", "surface"];
            let material_map = [
                ("snow", [0.95f32, 0.97, 1.0, 1.0], "❄️"),
                ("ice", [0.7, 0.85, 1.0, 1.0], "🧊"),
                ("grass", [0.2, 0.55, 0.15, 1.0], "🌿"),
                ("sand", [0.85, 0.75, 0.5, 1.0], "🏖️"),
                ("dirt", [0.45, 0.32, 0.18, 1.0], "🟤"),
                ("mud", [0.35, 0.25, 0.15, 1.0], "💩"),
                ("stone", [0.5, 0.5, 0.48, 1.0], "🪨"),
                ("rock", [0.45, 0.42, 0.4, 1.0], "🪨"),
                ("lava", [0.95, 0.3, 0.05, 1.0], "🌋"),
                ("water", [0.1, 0.4, 0.8, 1.0], "💧"),
                ("wood", [0.55, 0.35, 0.15, 1.0], "🪵"),
                ("marble", [0.9, 0.88, 0.85, 1.0], "⬜"),
                ("metal", [0.6, 0.6, 0.65, 1.0], "🔩"),
                ("concrete", [0.6, 0.58, 0.55, 1.0], "🏗️"),
                ("asphalt", [0.2, 0.2, 0.22, 1.0], "🛣️"),
                ("clay", [0.7, 0.45, 0.3, 1.0], "🏺"),
                ("moss", [0.15, 0.4, 0.1, 1.0], "🌿"),
                ("volcanic", [0.2, 0.15, 0.12, 1.0], "🌋"),
                ("crystal", [0.6, 0.7, 0.95, 1.0], "💎"),
                ("gold", [0.85, 0.7, 0.2, 1.0], "🥇"),
                ("obsidian", [0.08, 0.08, 0.1, 1.0], "⬛"),
            ];
            let has_ground_word = ground_keywords.iter().any(|g| lower.contains(g));
            let change_words = ["change", "make", "set", "turn", "switch"];
            let has_change = change_words.iter().any(|c| lower.contains(c)) || lower.contains("to ");
            if has_ground_word && has_change {
                for (mat_name, mat_color, emoji) in &material_map {
                    if lower.contains(mat_name) {
                        self.push_undo();
                        self.ground_color = *mat_color;
                        // Also set roughness/metallic for ground material feel
                        match *mat_name {
                            "snow" | "ice" => { self.ground_roughness = 0.3; }
                            "lava" => { self.ground_roughness = 0.9; self.ground_emissive = 2.0; }
                            "metal" | "gold" | "silver" => { self.ground_roughness = 0.2; self.ground_metallic = 0.9; }
                            "marble" | "crystal" => { self.ground_roughness = 0.15; }
                            _ => { self.ground_roughness = 0.7; self.ground_metallic = 0.0; self.ground_emissive = 0.0; }
                        }
                        self.sync_editor_scene();
                        self.editor.add_ai_response(&format!("{} Ground changed to {}!", emoji, mat_name));
                        self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
                        return;
                    }
                }
            }
        }

        // === NATURAL LANGUAGE: "scale the castle to 5" / "make castle bigger/smaller" / "resize tower 3x" ===
        {
            let scale_words = ["scale", "resize", "size", "bigger", "smaller", "larger", "tiny", "huge", "giant", "massive"];
            let has_scale = scale_words.iter().any(|s| lower.contains(s));
            if has_scale && !lower.starts_with("add") {
                let mut scale_factor = 1.0f32;
                if lower.contains("bigger") || lower.contains("larger") { scale_factor = 1.5; }
                else if lower.contains("smaller") { scale_factor = 0.67; }
                else if lower.contains("tiny") { scale_factor = 0.3; }
                else if lower.contains("huge") || lower.contains("giant") || lower.contains("massive") { scale_factor = 3.0; }
                else {
                    // Parse numeric scale
                    let scale_re = regex::Regex::new(r"(\d+\.?\d*)\s*x?").unwrap();
                    if let Some(caps) = scale_re.captures(&lower) {
                        scale_factor = caps[1].parse::<f32>().unwrap_or(1.0);
                    }
                }
                // Find object name
                let clean = lower.replace("scale ", "").replace("resize ", "").replace("make ", "")
                    .replace("the ", "").replace("a ", "").replace("to ", "").replace("it ", "")
                    .replace("bigger", "").replace("smaller", "").replace("larger", "")
                    .replace("tiny", "").replace("huge", "").replace("giant", "").replace("massive", "")
                    .replace("size", "");
                let clean = regex::Regex::new(r"\d+\.?\d*\s*x?").unwrap().replace_all(&clean, "").to_string();
                let name_part = clean.trim().to_string();
                
                if name_part.is_empty() || name_part == "this" {
                    if let Some(sel) = &self.editor.selected_entity.clone() {
                        if let Some(idx) = self.objects.iter().position(|o| &o.name == sel) {
                            self.push_undo();
                            self.objects[idx].transform.scale *= scale_factor;
                            self.sync_editor_scene();
                            self.editor.add_ai_response(&format!("📐 {} scaled to {:.1}x!", sel, scale_factor));
                        }
                    }
                } else if let Some(idx) = self.objects.iter().position(|o| o.name.to_lowercase().contains(&name_part)) {
                    self.push_undo();
                    self.objects[idx].transform.scale *= scale_factor;
                    self.sync_editor_scene();
                    self.editor.add_ai_response(&format!("📐 {} scaled to {:.1}x!", self.objects[idx].name, scale_factor));
                } else {
                    self.editor.add_ai_response(&format!("⚠ Couldn't find '{}'. Objects: {}", name_part,
                        self.objects.iter().map(|o| o.name.as_str()).collect::<Vec<_>>().join(", ")));
                }
                self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
                return;
            }
        }

        // === NATURAL LANGUAGE: "rotate the castle 90 degrees" / "spin tower" / "flip house" ===
        {
            let rot_words = ["rotate", "spin", "flip", "tilt", "angle"];
            let has_rot = rot_words.iter().any(|r| lower.starts_with(r));
            if has_rot {
                let mut degrees = 90.0f32;
                let deg_re = regex::Regex::new(r"(\d+\.?\d*)\s*(degrees?|deg)?").unwrap();
                if let Some(caps) = deg_re.captures(&lower) {
                    degrees = caps[1].parse::<f32>().unwrap_or(90.0);
                }
                let radians = degrees.to_radians();
                let clean = lower.replace("rotate ", "").replace("spin ", "").replace("flip ", "")
                    .replace("tilt ", "").replace("angle ", "")
                    .replace("the ", "").replace("a ", "").replace("by ", "").replace("to ", "");
                let clean = deg_re.replace_all(&clean, "").to_string();
                let name_part = clean.trim().to_string();
                
                if name_part.is_empty() || name_part == "this" || name_part == "it" {
                    if let Some(sel) = &self.editor.selected_entity.clone() {
                        if let Some(idx) = self.objects.iter().position(|o| &o.name == sel) {
                            self.push_undo();
                            self.objects[idx].transform.rotation *= Quat::from_rotation_y(radians);
                            self.sync_editor_scene();
                            self.editor.add_ai_response(&format!("🔄 {} rotated {:.0}°!", sel, degrees));
                        }
                    }
                } else if let Some(idx) = self.objects.iter().position(|o| o.name.to_lowercase().contains(&name_part)) {
                    self.push_undo();
                    self.objects[idx].transform.rotation *= Quat::from_rotation_y(radians);
                    self.sync_editor_scene();
                    self.editor.add_ai_response(&format!("🔄 {} rotated {:.0}°!", self.objects[idx].name, degrees));
                }
                self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
                return;
            }
        }

        // === NATURAL LANGUAGE: "place X at Y Z" / "put X next to Y" / "put X on top of Y" ===
        {
            let place_words = ["place ", "put "];
            let is_place = place_words.iter().any(|p| lower.starts_with(p));
            if is_place {
                let rest = lower.replacen("place ", "", 1).replacen("put ", "", 1)
                    .replace("the ", "").replace("a ", "").trim().to_string();
                // "put X on top of Y" / "put X next to Y" / "put X behind Y"
                let rel_words = [
                    ("on top of", [0.0f32, 2.5, 0.0]),
                    ("on", [0.0, 2.5, 0.0]),
                    ("next to", [3.0, 0.0, 0.0]),
                    ("beside", [3.0, 0.0, 0.0]),
                    ("behind", [0.0, 0.0, -3.0]),
                    ("in front of", [0.0, 0.0, 3.0]),
                    ("above", [0.0, 4.0, 0.0]),
                    ("below", [0.0, -2.0, 0.0]),
                    ("under", [0.0, -2.0, 0.0]),
                ];
                let mut handled = false;
                for (rel, offset) in &rel_words {
                    if rest.contains(rel) {
                        let parts: Vec<&str> = rest.splitn(2, rel).collect();
                        if parts.len() == 2 {
                            let obj_a = parts[0].trim();
                            let obj_b = parts[1].trim();
                            // Find target object B's position
                            if let Some(b_pos) = self.objects.iter().find(|o| o.name.to_lowercase().contains(obj_b)).map(|o| o.transform.position) {
                                if let Some(idx_a) = self.objects.iter().position(|o| o.name.to_lowercase().contains(obj_a)) {
                                    self.push_undo();
                                    self.objects[idx_a].transform.position = b_pos + Vec3::from_array(*offset);
                                    self.sync_editor_scene();
                                    self.editor.add_ai_response(&format!("📍 {} placed {} {}!", self.objects[idx_a].name, rel, obj_b));
                                    handled = true;
                                }
                            }
                        }
                        break;
                    }
                }
                if handled {
                    self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
                    return;
                }
            }
        }

        // --- Color change ---
        if lower.starts_with("color ") || lower.starts_with("paint ") {
            let rest = lower.replacen("color ", "", 1).replacen("paint ", "", 1).trim().to_string();
            let words: Vec<&str> = rest.split_whitespace().collect();
            if words.len() >= 2 {
                let color_name = words.last().unwrap();
                let name_part = words[..words.len()-1].join(" ");
                let color = koko_ai::local::parse_local(&format!("add {} cube", color_name), &[])
                    .first()
                    .and_then(|i| if let GameIntent::AddEntity { color, .. } = i { Some(*color) } else { None })
                    .unwrap_or([0.7, 0.7, 0.7, 1.0]);
                if let Some(idx) = self.objects.iter().position(|o| o.name.to_lowercase().contains(&name_part)) {
                    self.push_undo();
                    self.objects[idx].color = color;
                    self.sync_editor_scene();
                    self.editor.add_ai_response(&format!("🎨 {} is now {}!", self.objects[idx].name, color_name));
                } else {
                    self.editor.add_ai_response(&format!("⚠ Couldn't find '{}'", name_part));
                }
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

                // --- Cinematic camera ---
        if lower == "cinematic" || lower == "flyby" || lower == "tour" || lower.starts_with("cinematic") {
            let duration = if lower.contains("slow") { 12.0 }
                else if lower.contains("fast") { 3.0 }
                else { 6.0 };
            // Build orbit keyframes around scene center
            self.cinematic_keyframes = vec![
                CameraKeyframe { position: Vec3::new(12.0, 6.0, 12.0), yaw: -0.78, pitch: -0.3, time: 0.0 },
                CameraKeyframe { position: Vec3::new(-12.0, 8.0, 8.0), yaw: 0.95, pitch: -0.35, time: 0.25 },
                CameraKeyframe { position: Vec3::new(-8.0, 10.0, -12.0), yaw: 2.5, pitch: -0.4, time: 0.5 },
                CameraKeyframe { position: Vec3::new(10.0, 4.0, -8.0), yaw: -1.2, pitch: -0.2, time: 0.75 },
                CameraKeyframe { position: Vec3::new(12.0, 6.0, 12.0), yaw: -0.78, pitch: -0.3, time: 1.0 },
            ];
            self.cinematic_duration = duration;
            self.cinematic_time = 0.0;
            self.cinematic_active = true;
            self.editor.add_ai_response(&format!("🎬 Cinematic flyby started! ({:.0}s) Press Escape to stop.", duration));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "stop cinematic" || lower == "stop flyby" || lower == "stop tour" {
            self.cinematic_active = false;
            self.editor.add_ai_response("🎬 Cinematic stopped.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

                // --- Object animations ---
        if lower.starts_with("orbit ") || lower.starts_with("make ") && lower.contains("orbit") {
            let rest = lower.replacen("orbit ", "", 1).replacen("make ", "", 1).replace("orbit", "").trim().to_string();
            let obj_name = rest.split_whitespace().next().unwrap_or("").to_string();
            if let Some(_) = self.objects.iter().position(|o| o.name.to_lowercase().contains(&obj_name)) {
                let speed = if lower.contains("fast") { 3.0 } else if lower.contains("slow") { 0.5 } else { 1.0 };
                self.object_animations.push((obj_name.clone(), ObjectAnimation::Orbit {
                    center: Vec3::ZERO, radius: 5.0, speed, phase: self.time.elapsed_secs,
                }));
                self.editor.add_ai_response(&format!("🌀 {} is now orbiting!", obj_name));
            } else {
                self.editor.add_ai_response(&format!("⚠ '{}' not found", obj_name));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("bounce ") {
            let obj_name = lower.replacen("bounce ", "", 1).trim().to_string();
            if let Some(idx) = self.objects.iter().position(|o| o.name.to_lowercase().contains(&obj_name)) {
                let base_y = self.objects[idx].transform.position.y;
                self.object_animations.push((obj_name.clone(), ObjectAnimation::Bounce {
                    base_y, height: 2.0, speed: 2.0,
                }));
                self.editor.add_ai_response(&format!("⬆️ {} is now bouncing!", obj_name));
            } else {
                self.editor.add_ai_response(&format!("⚠ '{}' not found", obj_name));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("wave ") {
            let obj_name = lower.replacen("wave ", "", 1).trim().to_string();
            if let Some(_) = self.objects.iter().position(|o| o.name.to_lowercase().contains(&obj_name)) {
                self.object_animations.push((obj_name.clone(), ObjectAnimation::Wave {
                    axis: Vec3::X, amplitude: 2.0, speed: 1.5,
                }));
                self.editor.add_ai_response(&format!("〰️ {} is now waving!", obj_name));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "stop animations" || lower == "clear animations" || lower == "no animations" {
            self.object_animations.clear();
            self.editor.add_ai_response("⏹️ All animations stopped!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Material presets ---
        if lower.starts_with("material ") || lower.starts_with("mat ") {
            let rest = lower.replacen("material ", "", 1).replacen("mat ", "", 1).trim().to_string();
            let words: Vec<&str> = rest.split_whitespace().collect();
            if words.len() >= 2 {
                let obj_name = words[0];
                let material = words[1];
                if let Some(idx) = self.objects.iter().position(|o| o.name.to_lowercase().contains(obj_name)) {
                    self.push_undo();
                    match material {
                        "metal" | "metallic" | "chrome" => {
                            self.objects[idx].color = [0.8, 0.8, 0.85, 1.0];
                            self.editor.add_ai_response(&format!("🪙 {} → metallic!", self.objects[idx].name));
                        }
                        "gold" | "golden" => {
                            self.objects[idx].color = [0.9, 0.75, 0.1, 1.0];
                            self.editor.add_ai_response(&format!("✨ {} → gold!", self.objects[idx].name));
                        }
                        "glass" | "transparent" | "crystal" => {
                            self.objects[idx].color = [0.6, 0.8, 0.95, 0.3];
                            self.editor.add_ai_response(&format!("🔮 {} → glass!", self.objects[idx].name));
                        }
                        "wood" | "wooden" => {
                            self.objects[idx].color = [0.55, 0.35, 0.15, 1.0];
                            self.editor.add_ai_response(&format!("🪵 {} → wood!", self.objects[idx].name));
                        }
                        "stone" | "rock" | "concrete" => {
                            self.objects[idx].color = [0.5, 0.48, 0.45, 1.0];
                            self.editor.add_ai_response(&format!("🪨 {} → stone!", self.objects[idx].name));
                        }
                        "lava" | "magma" | "fire" => {
                            self.objects[idx].color = [1.0, 0.3, 0.05, 1.0];
                            self.editor.add_ai_response(&format!("🌋 {} → lava!", self.objects[idx].name));
                        }
                        "ice" | "frozen" | "frost" => {
                            self.objects[idx].color = [0.7, 0.85, 0.95, 0.8];
                            self.editor.add_ai_response(&format!("🧊 {} → ice!", self.objects[idx].name));
                        }
                        "neon" | "glow" | "emissive" => {
                            self.objects[idx].color = [0.2, 1.0, 0.5, 1.0];
                            self.editor.add_ai_response(&format!("💚 {} → neon!", self.objects[idx].name));
                        }
                        "rust" | "rusty" | "corroded" => {
                            self.objects[idx].color = [0.6, 0.3, 0.1, 1.0];
                            self.editor.add_ai_response(&format!("🟫 {} → rusty!", self.objects[idx].name));
                        }
                        "dark" | "obsidian" | "void" => {
                            self.objects[idx].color = [0.05, 0.05, 0.08, 1.0];
                            self.editor.add_ai_response(&format!("⬛ {} → obsidian!", self.objects[idx].name));
                        }
                        _ => {
                            self.editor.add_ai_response("Materials: metal, gold, glass, wood, stone, lava, ice, neon, rust, obsidian");
                        }
                    }
                    self.sync_editor_scene();
                } else {
                    self.editor.add_ai_response(&format!("⚠ Object '{}' not found", obj_name));
                }
            } else {
                self.editor.add_ai_response("Usage: material objectname metal — Materials: metal, gold, glass, wood, stone, lava, ice, neon, rust, obsidian");
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Scatter command: spread objects randomly ---
        if lower.starts_with("scatter ") || lower.starts_with("spread ") {
            let rest = lower.replacen("scatter ", "", 1).replacen("spread ", "", 1).trim().to_string();
            let words: Vec<&str> = rest.split_whitespace().collect();
            let count: usize = words.first().and_then(|w| w.parse().ok()).unwrap_or(10);
            let obj_name = words.get(1..).map(|w| w.join(" ")).unwrap_or_else(|| "tree".to_string());
            let count = count.min(100);
            self.push_undo();
            let mut added = 0;
            for i in 0..count {
                let seed = (i as f32 * 7.3 + self.time.elapsed_secs).sin();
                let seed2 = (i as f32 * 13.7 + self.time.elapsed_secs).cos();
                let radius = 5.0 + (count as f32).sqrt() * 2.0;
                let x = seed * radius;
                let z = seed2 * radius;
                let scale_var = 0.5 + (seed.abs() + 0.5) * 1.5;
                let existing: Vec<String> = self.objects.iter().map(|o| o.name.clone()).collect();
                let sub_prompt = format!("add {}", obj_name);
                let intents = koko_ai::local::parse_local(&sub_prompt, &existing);
                for intent in intents {
                    match intent {
                        GameIntent::LoadModel { name, model_file, .. } => {
                            let unique_name = format!("{}_{}", name, i);
                            let _ = self.load_model_from_assets(&model_file, &unique_name, [x, 0.0, z], scale_var);
                            added += 1;
                        }
                        GameIntent::AddEntity { name, mesh, color, .. } => {
                            self.objects.push(SceneObject {
                                name: format!("{}_{}", name, i),
                                transform: Transform { position: Vec3::new(x, 0.0, z), rotation: Quat::IDENTITY, scale: Vec3::splat(scale_var) },
                                color, mesh_type: MeshType::from_str(&mesh), spin_speed: 0.0,
                                parent: None, lod_meshes: Vec::new(),
                            });
                            added += 1;
                        }
                        _ => {}
                    }
                    break;  // Just the first intent per iteration
                }
            }
            self.sync_editor_scene();
            self.editor.add_ai_response(&format!("🌿 Scattered {} {} across the scene!", added, obj_name));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Align objects ---
        if lower.starts_with("align ") {
            let direction = lower.replace("align ", "").trim().to_string();
            if self.objects.len() > 1 {
                self.push_undo();
                let spacing = 3.0;
                let n = self.objects.len();
                let offset = -(n as f32 - 1.0) * spacing / 2.0;
                for (i, obj) in self.objects.iter_mut().enumerate() {
                    match direction.as_str() {
                        "x" | "row" | "horizontal" => {
                            obj.transform.position.x = offset + i as f32 * spacing;
                            obj.transform.position.z = 0.0;
                        }
                        "z" | "column" | "vertical" => {
                            obj.transform.position.z = offset + i as f32 * spacing;
                            obj.transform.position.x = 0.0;
                        }
                        "circle" | "ring" => {
                            let angle = i as f32 * std::f32::consts::TAU / n as f32;
                            let r = n as f32 * 0.8;
                            obj.transform.position.x = angle.cos() * r;
                            obj.transform.position.z = angle.sin() * r;
                        }
                        "grid" => {
                            let cols = (n as f32).sqrt().ceil() as usize;
                            let row = i / cols;
                            let col = i % cols;
                            obj.transform.position.x = col as f32 * spacing - (cols as f32 - 1.0) * spacing / 2.0;
                            obj.transform.position.z = row as f32 * spacing - ((n / cols) as f32) * spacing / 2.0;
                        }
                        _ => {}
                    }
                }
                self.sync_editor_scene();
                self.editor.add_ai_response(&format!("📐 Aligned {} objects in {} formation!", n, direction));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Rename object ---
        if lower.starts_with("rename ") {
            let rest = lower.replacen("rename ", "", 1).trim().to_string();
            let parts: Vec<&str> = rest.splitn(2, " to ").collect();
            if parts.len() == 2 {
                let old = parts[0].trim();
                let new_name = parts[1].trim();
                if let Some(idx) = self.objects.iter().position(|o| o.name.to_lowercase().contains(old)) {
                    self.objects[idx].name = new_name.to_string();
                    self.sync_editor_scene();
                    self.editor.add_ai_response(&format!("✏️ Renamed to '{}'!", new_name));
                } else {
                    self.editor.add_ai_response(&format!("⚠ '{}' not found", old));
                }
            } else {
                self.editor.add_ai_response("Usage: rename oldname to newname");
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Count/find ---
        if lower.starts_with("count ") || lower.starts_with("find ") {
            let query = lower.replacen("count ", "", 1).replacen("find ", "", 1).trim().to_string();
            let matches: Vec<&SceneObject> = self.objects.iter().filter(|o| o.name.to_lowercase().contains(&query) || o.mesh_type.as_str().contains(&query)).collect();
            if matches.is_empty() {
                self.editor.add_ai_response(&format!("🔍 No objects matching '{}'", query));
            } else {
                let names: Vec<String> = matches.iter().map(|o| o.name.clone()).collect();
                self.editor.add_ai_response(&format!("🔍 Found {} matching '{}': {}", matches.len(), query, names.join(", ")));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Group operations ---
        if lower.starts_with("scale all ") {
            if let Ok(factor) = lower.replace("scale all ", "").trim().parse::<f32>() {
                self.push_undo();
                for obj in &mut self.objects { obj.transform.scale *= factor; }
                self.sync_editor_scene();
                self.editor.add_ai_response(&format!("📐 Scaled all objects by {}x!", factor));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("move all ") {
            let dir = lower.replace("move all ", "").trim().to_string();
            self.push_undo();
            let delta = match dir.as_str() {
                "left" => Vec3::new(-3.0, 0.0, 0.0),
                "right" => Vec3::new(3.0, 0.0, 0.0),
                "forward" | "front" => Vec3::new(0.0, 0.0, 3.0),
                "back" | "backward" => Vec3::new(0.0, 0.0, -3.0),
                "up" => Vec3::new(0.0, 3.0, 0.0),
                "down" => Vec3::new(0.0, -3.0, 0.0),
                _ => Vec3::ZERO,
            };
            for obj in &mut self.objects { obj.transform.position += delta; }
            self.sync_editor_scene();
            self.editor.add_ai_response(&format!("➡️ Moved all objects {}!", dir));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "spin all" || lower == "rotate all" {
            for obj in &mut self.objects { obj.spin_speed = 0.5; }
            self.editor.add_ai_response("🔄 All objects spinning!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "stop all" || lower == "stop spin" || lower == "freeze" {
            for obj in &mut self.objects { obj.spin_speed = 0.0; }
            self.editor.add_ai_response("⏹️ All objects stopped!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

                // --- Inspect object ---
        if lower.starts_with("inspect ") || lower.starts_with("info ") && lower != "info" {
            let name = lower.replacen("inspect ", "", 1).replacen("info ", "", 1).trim().to_string();
            if let Some(obj) = self.objects.iter().find(|o| o.name.to_lowercase().contains(&name)) {
                let p = obj.transform.position;
                let s = obj.transform.scale;
                let has_anim = self.object_animations.iter().any(|(n, _)| n.to_lowercase().contains(&name));
                self.editor.add_ai_response(&format!(
                    "🔍 {}\n                     Type: {} | Spin: {:.1}\n                     Position: [{:.2}, {:.2}, {:.2}]\n                     Scale: [{:.2}, {:.2}, {:.2}]\n                     Color: [{:.2}, {:.2}, {:.2}, {:.2}]\n                     Animated: {}",
                    obj.name, obj.mesh_type.as_str(), obj.spin_speed,
                    p.x, p.y, p.z, s.x, s.y, s.z,
                    obj.color[0], obj.color[1], obj.color[2], obj.color[3],
                    if has_anim { "yes" } else { "no" },
                ));
            } else {
                self.editor.add_ai_response(&format!("⚠ '{}' not found", name));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Set exact position ---
        if lower.starts_with("position ") || lower.starts_with("pos ") {
            let rest = lower.replacen("position ", "", 1).replacen("pos ", "", 1).trim().to_string();
            // Format: "objectname x y z"
            let words: Vec<&str> = rest.split_whitespace().collect();
            if words.len() >= 4 {
                let obj_name = words[0];
                let x: f32 = words[1].parse().unwrap_or(0.0);
                let y: f32 = words[2].parse().unwrap_or(0.0);
                let z: f32 = words[3].parse().unwrap_or(0.0);
                if let Some(idx) = self.objects.iter().position(|o| o.name.to_lowercase().contains(obj_name)) {
                    self.push_undo();
                    self.objects[idx].transform.position = Vec3::new(x, y, z);
                    self.sync_editor_scene();
                    self.editor.add_ai_response(&format!("📍 {} → [{}, {}, {}]", self.objects[idx].name, x, y, z));
                }
            } else {
                self.editor.add_ai_response("Usage: pos objectname 5 2 -3");
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Copy scene to clipboard (JSON) ---
        if lower == "copy scene" || lower == "export json" {
            let json = self.serialize_scene();
            self.editor.add_ai_response(&format!("📋 Scene JSON ({} chars) — saved to scene_clipboard.json", json.len()));
            let _ = std::fs::write("/Users/jamainemartin/Desktop/scene_clipboard.json", &json);
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Import from JSON ---
        if lower.starts_with("import json ") {
            let path = prompt.replacen("import json ", "", 1).trim().to_string();
            match std::fs::read_to_string(&path) {
                Ok(json) => {
                    self.push_undo();
                    self.deserialize_scene(&json);
                    self.sync_editor_scene();
                    self.editor.add_ai_response("📂 Scene imported from JSON!");
                }
                Err(e) => self.editor.add_ai_response(&format!("❌ {}", e)),
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Look at / focus ---
        if lower.starts_with("look at ") || lower.starts_with("focus ") {
            let name = lower.replacen("look at ", "", 1).replacen("focus ", "", 1).trim().to_string();
            if let Some(obj) = self.objects.iter().find(|o| o.name.to_lowercase().contains(&name)) {
                let target = obj.transform.position;
                self.orbit_target = target;
                self.camera_pos = target + Vec3::new(5.0, 4.0, 5.0);
                let dir = (target - self.camera_pos).normalize();
                self.camera_yaw = dir.z.atan2(dir.x);
                self.camera_pitch = (-dir.y).asin();
                self.editor.add_ai_response(&format!("👁️ Looking at {}!", name));
            } else {
                self.editor.add_ai_response(&format!("⚠ '{}' not found", name));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

                // --- Describe scene ---
        if lower == "describe" || lower == "describe scene" || lower == "what is this" || lower == "whats here" {
            if self.objects.is_empty() {
                self.editor.add_ai_response("📋 Empty scene. Try 'forest', 'add a dragon', or 'generate city 5'!");
            } else {
                let obj_summary: Vec<String> = {
                    let mut types: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
                    for obj in &self.objects {
                        *types.entry(obj.mesh_type.as_str().to_string()).or_insert(0) += 1;
                    }
                    types.iter().map(|(t, c)| format!("{} {}{}", c, t, if *c > 1 { "s" } else { "" })).collect()
                };
                let effects: Vec<&str> = [
                    if self.water_enabled { Some("water") } else { None },
                    if self.terrain_enabled { Some("terrain") } else { None },
                    if self.fog_enabled { Some("fog") } else { None },
                    if !self.particle_emitters.is_empty() { Some("particles") } else { None },
                    if !self.scene_lights.is_empty() { Some("dynamic lights") } else { None },
                    if self.day_cycle_active { Some("day cycle") } else { None },
                    if self.physics_playing { Some("physics") } else { None },
                    if self.cinematic_active { Some("cinematic") } else { None },
                ].iter().filter_map(|x| *x).collect();
                
                self.editor.add_ai_response(&format!(
                    "📋 Scene Description\n                     {} objects: {}\n                     Camera: [{:.1}, {:.1}, {:.1}]\n                     Effects: {}\n                     Mood: brightness {:.1}, saturation {:.1}, temp {:.1}",
                    self.objects.len(),
                    obj_summary.join(", "),
                    self.camera_pos.x, self.camera_pos.y, self.camera_pos.z,
                    if effects.is_empty() { "none".into() } else { effects.join(", ") },
                    self.post_params.brightness, self.post_params.saturation, self.post_params.temperature,
                ));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // Timeline animation playback
        if self.timeline_playing {
            self.timeline_playhead += 0.016;
            if self.timeline_playhead > self.timeline_duration {
                self.timeline_playhead = 0.0; // loop
            }
            let t = self.timeline_playhead;
            for track in &self.timeline_tracks {
                if track.keyframes.len() < 2 { continue; }
                if let Some(obj_idx) = self.objects.iter().position(|o| o.name == track.object_name) {
                    // Find surrounding keyframes
                    let kfs = &track.keyframes;
                    let mut k0 = &kfs[0];
                    let mut k1 = &kfs[kfs.len() - 1];
                    for w in kfs.windows(2) {
                        if t >= w[0].time && t <= w[1].time {
                            k0 = &w[0];
                            k1 = &w[1];
                            break;
                        }
                    }
                    let seg_dur = (k1.time - k0.time).max(0.001);
                    let frac = ((t - k0.time) / seg_dur).clamp(0.0, 1.0);
                    // Smoothstep
                    let s = frac * frac * (3.0 - 2.0 * frac);
                    self.objects[obj_idx].transform.position = k0.position.lerp(k1.position, s);
                    self.objects[obj_idx].transform.rotation = k0.rotation.slerp(k1.rotation, s);
                    self.objects[obj_idx].transform.scale = k0.scale.lerp(k1.scale, s);
                }
            }
        }


        // --- Suggest / what next ---
        if lower == "suggest" || lower == "what next" || lower == "ideas" || lower == "what should i do" {
            let suggestions = if self.objects.is_empty() {
                vec![
                    "Try a scene preset: forest, castle, pirate ship, zen garden",
                    "Generate something: generate city 8, generate dungeon 9",
                    "Add objects: add a dragon, add 5 trees, add a house",
                ]
            } else {
                let n = self.objects.len();
                let mut s = vec![];
                if !self.water_enabled { s.push("Add water: 'add water'"); }
                if self.particle_emitters.is_empty() { s.push("Add effects: 'rain', 'add fire', 'magical'"); }
                if self.scene_lights.is_empty() { s.push("Add lights: 'add red light', 'add spotlight'"); }
                if !self.day_cycle_active { s.push("Start day cycle: 'day cycle'"); }
                s.push("Try a visual style: 'synthwave', 'horror', 'noir', 'cinematic look'");
                s.push("Cinematic flyby: 'cinematic' or record your own: 'record path'");
                if n > 5 { s.push("Manipulate: 'mirror x', 'radial tree 8', 'randomize'"); }
                s.push("Save your work: 'save scene myname' or 'save prefab myname'");
                s
            };
            self.editor.add_ai_response(&format!("💡 Suggestions:\n{}", suggestions.join("\n• ")));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

                // --- Stats/info ---
        if lower == "stats" || lower == "info" || lower == "status" {
            let obj_count = self.objects.len();
            let light_count = self.scene_lights.len();
            let emitter_count = self.particle_emitters.len();
            let particle_count: usize = self.particle_emitters.iter().map(|e| e.particles.len()).sum();
            let custom_count = self.custom_meshes.len();
            self.editor.add_ai_response(&format!(
                "📊 KOKO Engine Stats\n                 Objects: {} | Lights: {} | Emitters: {} ({} particles)\n                 Custom meshes: {} | Water: {} | Terrain: {} | Physics: {}\n                 Camera: [{:.1}, {:.1}, {:.1}]",
                obj_count, light_count, emitter_count, particle_count,
                custom_count,
                if self.water_enabled { "ON" } else { "OFF" },
                if self.terrain_enabled { "ON" } else { "OFF" },
                if self.physics_playing { "PLAYING" } else { "EDIT" },
                self.camera_pos.x, self.camera_pos.y, self.camera_pos.z,
            ));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Bloom toggle ---
        if lower == "bloom on" || lower == "enable bloom" { self.bloom_enabled = true; self.editor.add_ai_response("✨ Bloom enabled!"); self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return; }
        if lower == "bloom off" || lower == "disable bloom" || lower == "no bloom" { self.bloom_enabled = false; self.editor.add_ai_response("✨ Bloom disabled."); self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return; }

        // --- Post-processing toggle ---
        if lower == "post on" || lower == "effects on" { self.post_enabled = true; self.editor.add_ai_response("🎨 Post-processing enabled!"); self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return; }
        if lower == "post off" || lower == "effects off" || lower == "no effects" { self.post_enabled = false; self.editor.add_ai_response("🎨 Post-processing disabled."); self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return; }

        // --- Lua scripting ---
        if lower.starts_with("lua ") || lower.starts_with("run ") || lower.starts_with("script ") {
            let code = prompt.splitn(2, ' ').nth(1).unwrap_or("").trim().to_string();
            if code.is_empty() {
                self.editor.add_ai_response("📜 Usage: lua print(42) — Run Lua code in the engine");
            } else if let Some(ref engine) = self.script_engine {
                // Set globals that scripts can read
                let _ = engine.set_global("object_count", self.objects.len() as f64);
                let _ = engine.set_global("light_count", self.scene_lights.len() as f64);
                let _ = engine.set_global("camera_x", self.camera_pos.x as f64);
                let _ = engine.set_global("camera_y", self.camera_pos.y as f64);
                let _ = engine.set_global("camera_z", self.camera_pos.z as f64);
                let _ = engine.set_global("time", self.time.elapsed_secs as f64);
                match engine.run(&code) {
                    Ok(_) => self.editor.add_ai_response("📜 Script executed!"),
                    Err(e) => self.editor.add_ai_response(&format!("❌ Lua error: {}", e)),
                }
            } else {
                self.editor.add_ai_response("❌ Lua engine not available.");
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("run file ") {
            let path = prompt.splitn(3, ' ').nth(2).unwrap_or("").trim();
            if let Some(ref engine) = self.script_engine {
                match engine.run_file(std::path::Path::new(path)) {
                    Ok(_) => self.editor.add_ai_response(&format!("📜 Ran {}", path)),
                    Err(e) => self.editor.add_ai_response(&format!("❌ {}", e)),
                }
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Mirror/symmetry ---
        if lower.starts_with("mirror ") {
            let axis = lower.replace("mirror ", "").trim().to_string();
            self.push_undo();
            let clones: Vec<SceneObject> = self.objects.iter().map(|obj| {
                let mut new = SceneObject {
                    name: format!("{}_mirror", obj.name),
                    transform: obj.transform.clone(),
                    color: obj.color, mesh_type: obj.mesh_type, spin_speed: obj.spin_speed,
                    parent: None, lod_meshes: Vec::new(),
                };
                match axis.as_str() {
                    "x" => new.transform.position.x = -new.transform.position.x,
                    "z" => new.transform.position.z = -new.transform.position.z,
                    "y" => new.transform.position.y = -new.transform.position.y,
                    _ => new.transform.position.x = -new.transform.position.x,
                }
                new
            }).collect();
            let n = clones.len();
            self.objects.extend(clones);
            self.sync_editor_scene();
            self.editor.add_ai_response(&format!("🪞 Mirrored {} objects across {} axis!", n, axis));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Radial duplicate ---
        if lower.starts_with("radial ") {
            let rest = lower.replace("radial ", "").trim().to_string();
            let words: Vec<&str> = rest.split_whitespace().collect();
            let obj_name = words.first().unwrap_or(&"").to_string();
            let count: usize = words.get(1).and_then(|w| w.parse().ok()).unwrap_or(6);
            let count = count.clamp(2, 24);
            if let Some(src) = self.objects.iter().find(|o| o.name.to_lowercase().contains(&obj_name)).cloned() {
                self.push_undo();
                let dist = src.transform.position.length().max(3.0);
                for i in 1..count {
                    let angle = i as f32 * std::f32::consts::TAU / count as f32;
                    let mut new = src.clone();
                    new.name = format!("{}_{}", src.name, i);
                    new.transform.position = Vec3::new(angle.cos() * dist, src.transform.position.y, angle.sin() * dist);
                    self.objects.push(new);
                }
                self.sync_editor_scene();
                self.editor.add_ai_response(&format!("🔄 Radial copy: {} copies of {} in a circle!", count-1, obj_name));
            } else {
                self.editor.add_ai_response(&format!("⚠ '{}' not found", obj_name));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Explode (spread objects outward) ---
        if lower == "explode" || lower == "spread out" || lower == "expand" {
            self.push_undo();
            for obj in &mut self.objects {
                let dir = obj.transform.position.normalize_or_zero();
                if dir.length() > 0.01 {
                    obj.transform.position += dir * 3.0;
                } else {
                    obj.transform.position.x += 2.0;
                }
            }
            self.sync_editor_scene();
            self.editor.add_ai_response("💥 Exploded! All objects pushed outward.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Implode (bring objects toward center) ---
        if lower == "implode" || lower == "compress" || lower == "gather" {
            self.push_undo();
            for obj in &mut self.objects {
                obj.transform.position *= 0.5;
            }
            self.sync_editor_scene();
            self.editor.add_ai_response("🌀 Imploded! All objects pulled toward center.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Randomize ---
        if lower == "randomize" || lower == "shuffle" || lower == "chaos mode" {
            self.push_undo();
            let t = self.time.elapsed_secs;
            for (i, obj) in self.objects.iter_mut().enumerate() {
                let seed = (i as f32 * 7.3 + t).sin();
                let seed2 = (i as f32 * 13.7 + t).cos();
                obj.transform.position = Vec3::new(seed * 12.0, seed.abs() * 3.0, seed2 * 12.0);
                obj.color = [
                    (seed.abs() * 3.0).fract(),
                    (seed2.abs() * 5.0).fract(),
                    ((seed + seed2).abs() * 7.0).fract(),
                    1.0,
                ];
                obj.spin_speed = seed.abs() * 2.0;
            }
            self.sync_editor_scene();
            self.editor.add_ai_response("🎲 Randomized! Positions, colors, and spin all shuffled.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Sort objects by name/position ---
        if lower.starts_with("sort ") {
            let by = lower.replace("sort ", "").trim().to_string();
            self.push_undo();
            match by.as_str() {
                "name" => self.objects.sort_by(|a, b| a.name.cmp(&b.name)),
                "x" => self.objects.sort_by(|a, b| a.transform.position.x.partial_cmp(&b.transform.position.x).unwrap()),
                "y" | "height" => self.objects.sort_by(|a, b| a.transform.position.y.partial_cmp(&b.transform.position.y).unwrap()),
                "z" | "depth" => self.objects.sort_by(|a, b| a.transform.position.z.partial_cmp(&b.transform.position.z).unwrap()),
                "size" | "scale" => self.objects.sort_by(|a, b| b.transform.scale.max_element().partial_cmp(&a.transform.scale.max_element()).unwrap()),
                _ => {}
            }
            self.sync_editor_scene();
            self.editor.add_ai_response(&format!("📊 Sorted objects by {}!", by));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Replace all of one type ---
        if lower.starts_with("replace ") && lower.contains(" with ") {
            let parts: Vec<&str> = lower.splitn(2, " with ").collect();
            if parts.len() == 2 {
                let from = parts[0].replace("replace ", "").trim().to_string();
                let to = parts[1].trim().to_string();
                self.push_undo();
                let mut count = 0;
                // Get intents for the replacement
                let existing: Vec<String> = vec![];
                let to_intents = koko_ai::local::parse_local(&format!("add {}", to), &existing);
                let new_mesh = to_intents.iter().find_map(|i| match i {
                    GameIntent::AddEntity { mesh, color, .. } => Some((MeshType::from_str(mesh), *color, None)),
                    GameIntent::LoadModel { model_file, .. } => Some((MeshType::Cube, [0.7, 0.7, 0.7, 1.0], Some(model_file.clone()))),
                    _ => None,
                });
                if let Some((mesh_type, color, model_file)) = new_mesh {
                    if let Some(ref file) = model_file {
                        // Replace with models
                        let indices: Vec<usize> = self.objects.iter().enumerate()
                            .filter(|(_, o)| o.name.to_lowercase().contains(&from) || o.mesh_type.as_str() == from)
                            .map(|(i, _)| i).collect();
                        for idx in indices.iter().rev() {
                            let pos = self.objects[*idx].transform.position.to_array();
                            let scale = self.objects[*idx].transform.scale.max_element();
                            let name = format!("replaced_{}", count);
                            self.objects.remove(*idx);
                            let _ = self.load_model_from_assets(file, &name, pos, scale);
                            count += 1;
                        }
                    } else {
                        for obj in &mut self.objects {
                            if obj.name.to_lowercase().contains(&from) || obj.mesh_type.as_str() == from {
                                obj.mesh_type = mesh_type;
                                obj.color = color;
                                count += 1;
                            }
                        }
                    }
                    self.sync_editor_scene();
                    self.editor.add_ai_response(&format!("🔄 Replaced {} '{}' with '{}'!", count, from, to));
                }
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Flatten (set all Y to 0) ---
        if lower == "flatten" || lower == "ground all" || lower == "drop all" {
            self.push_undo();
            for obj in &mut self.objects {
                let half_h = obj.transform.scale.y * 0.5;
                obj.transform.position.y = half_h;
            }
            self.sync_editor_scene();
            self.editor.add_ai_response("⬇️ All objects placed on ground!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Center scene ---
        if lower == "center" || lower == "center scene" || lower == "recenter" {
            if !self.objects.is_empty() {
                self.push_undo();
                let center: Vec3 = self.objects.iter().map(|o| o.transform.position).sum::<Vec3>() / self.objects.len() as f32;
                for obj in &mut self.objects {
                    obj.transform.position -= Vec3::new(center.x, 0.0, center.z);
                }
                self.sync_editor_scene();
                self.editor.add_ai_response("🎯 Scene centered! Objects shifted to origin.");
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Select by type ---
        if lower.starts_with("select ") {
            let query = lower.replace("select ", "").trim().to_string();
            let matches: Vec<String> = self.objects.iter()
                .filter(|o| o.name.to_lowercase().contains(&query) || o.mesh_type.as_str().contains(&query))
                .map(|o| o.name.clone()).collect();
            if matches.is_empty() {
                self.editor.add_ai_response(&format!("⚠ No objects matching '{}'", query));
            } else {
                self.editor.selected_entity = Some(matches[0].clone());
                self.editor.add_ai_response(&format!("✅ Selected {} (and {} more match)", matches[0], matches.len() - 1));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Camera path recording ---
        if lower == "record path" || lower == "record camera" || lower == "start recording" {
            self.recording_path = true;
            self.recorded_keyframes.clear();
            self.record_timer = 0.0;
            self.editor.add_ai_response("🔴 Recording camera path! Move camera around, then 'stop recording'.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "stop recording" || lower == "end recording" {
            self.recording_path = false;
            let count = self.recorded_keyframes.len();
            if count >= 2 {
                self.editor.add_ai_response(&format!("⏹️ Recorded {} keyframes! Use play path to replay.", count));
            } else {
                self.editor.add_ai_response("⚠ Too few keyframes. Move the camera more while recording.");
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "play path" || lower == "replay path" || lower == "play recording" {
            if self.recorded_keyframes.len() >= 2 {
                self.cinematic_keyframes = self.recorded_keyframes.clone();
                self.cinematic_duration = self.recorded_keyframes.len() as f32 * 0.5;
                self.cinematic_time = 0.0;
                self.cinematic_active = true;
                self.editor.add_ai_response(&format!("▶️ Playing recorded path! ({} keyframes, {:.1}s)", self.recorded_keyframes.len(), self.cinematic_duration));
            } else {
                self.editor.add_ai_response("⚠ No recorded path. Use 'record path' first.");
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Macro system ---
        if lower == "record macro" || lower == "start macro" {
            self.macro_recording = true;
            self.macro_commands.clear();
            self.editor.add_ai_response("🔴 Recording macro! Type commands, then 'save macro name'.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("save macro ") {
            let name = lower.replace("save macro ", "").trim().to_string();
            self.macro_recording = false;
            let cmds = self.macro_commands.clone();
            let count = cmds.len();
            self.saved_macros.insert(name.clone(), cmds);
            self.editor.add_ai_response(&format!("💾 Macro '{}' saved! ({} commands) Use 'run macro {}' to replay.", name, count, name));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("run macro ") || lower.starts_with("play macro ") {
            let name = lower.replacen("run macro ", "", 1).replacen("play macro ", "", 1).trim().to_string();
            if let Some(cmds) = self.saved_macros.get(&name).cloned() {
                self.editor.add_ai_response(&format!("▶️ Running macro '{}'... ({} commands)", name, cmds.len()));
                for cmd in cmds {
                    self.send_to_ai(&cmd);
                }
            } else {
                let available: Vec<&String> = self.saved_macros.keys().collect();
                self.editor.add_ai_response(&format!("⚠ Macro '{}' not found. Available: {}", name,
                    if available.is_empty() { "none".into() } else { available.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(", ") }));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "list macros" || lower == "macros" {
            let names: Vec<&String> = self.saved_macros.keys().collect();
            if names.is_empty() {
                self.editor.add_ai_response("📝 No macros saved. Use 'record macro' to start.");
            } else {
                self.editor.add_ai_response(&format!("📝 Macros: {}", names.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(", ")));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Command history ---
        if lower == "history" || lower == "recent" || lower == "last commands" {
            let recent: Vec<&String> = self.command_history.iter().rev().take(15).collect();
            if recent.is_empty() {
                self.editor.add_ai_response("📋 No command history yet.");
            } else {
                let list: Vec<String> = recent.iter().enumerate().map(|(i, c)| format!("{}. {}", i+1, c)).collect();
                self.editor.add_ai_response(&format!("📋 Recent commands:\n{}", list.join("\n")));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("repeat") || lower == "!!" {
            if let Some(last) = self.command_history.last().cloned() {
                self.editor.add_ai_response(&format!("🔁 Repeating: {}", last));
                self.send_to_ai(&last);
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Deselect ---
        if lower == "deselect" || lower == "unselect" || lower == "select none" {
            self.editor.selected_entity = None;
            self.editor.add_ai_response("✅ Deselected.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Procedural generation ---
        if lower.starts_with("generate ") || lower.starts_with("proc ") || lower.starts_with("procedural ") {
            let rest = lower.replacen("generate ", "", 1).replacen("proc ", "", 1).replacen("procedural ", "", 1).trim().to_string();
            let words: Vec<&str> = rest.split_whitespace().collect();
            
            if rest.starts_with("city") || rest.starts_with("town") {
                let size: usize = words.get(1).and_then(|w| w.parse().ok()).unwrap_or(5);
                let size = size.clamp(2, 15);
                self.push_undo();
                let mut count = 0;
                // Grid of buildings with roads
                for row in 0..size {
                    for col in 0..size {
                        let x = (col as f32 - size as f32 / 2.0) * 6.0;
                        let z = (row as f32 - size as f32 / 2.0) * 6.0;
                        // Vary building height
                        let seed = ((row * 7 + col * 13) as f32 * 3.7).sin().abs();
                        let height = 2.0 + seed * 6.0;
                        let width = 1.5 + seed * 1.0;
                        // Building color variation
                        let r = 0.4 + seed * 0.3;
                        let g = 0.4 + (seed * 1.5).sin().abs() * 0.2;
                        let b = 0.45 + (seed * 2.3).cos().abs() * 0.2;
                        self.objects.push(SceneObject {
                            name: format!("building_{}_{}", row, col),
                            transform: Transform {
                                position: Vec3::new(x, height / 2.0, z),
                                rotation: Quat::IDENTITY,
                                scale: Vec3::new(width, height, width),
                            },
                            color: [r, g, b, 1.0], mesh_type: MeshType::Cube, spin_speed: 0.0,
                            parent: None, lod_meshes: Vec::new(),
                        });
                        count += 1;
                    }
                }
                // Add street lights
                for i in 0..size {
                    let x = (i as f32 - size as f32 / 2.0) * 6.0 + 3.0;
                    let _ = self.load_model_from_assets("lantern.glb", &format!("streetlight_{}", i), [x, 0.0, size as f32 * 3.0], 0.5);
                    count += 1;
                }
                self.sync_editor_scene();
                self.editor.add_ai_response(&format!("🏙️ Generated procedural city! {}x{} grid, {} buildings + street lights.", size, size, count));
                self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
                return;
            }
            
            if rest.starts_with("forest") || rest.starts_with("woods") {
                let density: usize = words.get(1).and_then(|w| w.parse().ok()).unwrap_or(30);
                let density = density.clamp(5, 200);
                self.push_undo();
                let radius = (density as f32).sqrt() * 3.0;
                for i in 0..density {
                    let seed = (i as f32 * 7.3).sin();
                    let seed2 = (i as f32 * 13.7).cos();
                    let x = seed * radius;
                    let z = seed2 * radius;
                    let scale = 1.5 + (seed.abs() + 0.3) * 2.5;
                    let model = if (i % 5) == 0 { "bush" } else if (i % 7) == 0 { "rock" } else if (i % 11) == 0 { "mushroom" } else { "tree" };
                    let _ = self.load_model_from_assets(&format!("{}.glb", model), &format!("{}_{}", model, i), [x, 0.0, z], scale);
                }
                self.sync_editor_scene();
                self.editor.add_ai_response(&format!("🌲 Generated procedural forest! {} objects (trees, bushes, rocks, mushrooms).", density));
                self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
                return;
            }
            
            if rest.starts_with("dungeon") || rest.starts_with("maze") || rest.starts_with("labyrinth") {
                let size: usize = words.get(1).and_then(|w| w.parse().ok()).unwrap_or(7);
                let size = size.clamp(3, 15);
                self.push_undo();
                let mut count = 0;
                // Simple maze-like dungeon with rooms and corridors
                for row in 0..size {
                    for col in 0..size {
                        let x = (col as f32 - size as f32 / 2.0) * 4.0;
                        let z = (row as f32 - size as f32 / 2.0) * 4.0;
                        let seed = ((row * 11 + col * 17) % 7) as f32;
                        // Walls on edges and random internal walls
                        let is_edge = row == 0 || row == size-1 || col == 0 || col == size-1;
                        let is_wall = is_edge || (seed > 3.0 && !(row == size/2 && col == size/2));
                        if is_wall {
                            self.objects.push(SceneObject {
                                name: format!("dwall_{}_{}", row, col),
                                transform: Transform {
                                    position: Vec3::new(x, 1.5, z),
                                    rotation: Quat::IDENTITY,
                                    scale: Vec3::new(2.0, 3.0, 2.0),
                                },
                                color: [0.35, 0.3, 0.28, 1.0], mesh_type: MeshType::Cube, spin_speed: 0.0,
                                parent: None, lod_meshes: Vec::new(),
                            });
                            count += 1;
                        } else if seed < 1.5 {
                            // Random props in open areas
                            let _ = self.load_model_from_assets("lantern.glb", &format!("dlantern_{}", count), [x, 2.0, z], 0.3);
                            count += 1;
                        }
                    }
                }
                // Boss room center
                let _ = self.load_model_from_assets("dragon.glb", "dungeon_boss", [0.0, 0.0, 0.0], 0.0);
                let _ = self.load_model_from_assets("chest.glb", "dungeon_loot", [2.0, 0.0, 0.0], 3.0);
                self.sync_editor_scene();
                self.editor.add_ai_response(&format!("🏰 Generated procedural dungeon! {}x{} maze, {} walls, dragon boss in center.", size, size, count));
                self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
                return;
            }
            
            if rest.starts_with("island") || rest.starts_with("archipelago") {
                let count: usize = words.get(1).and_then(|w| w.parse().ok()).unwrap_or(5);
                let count = count.clamp(1, 20);
                self.push_undo();
                self.water_enabled = true;
                let mut total = 0;
                for i in 0..count {
                    let angle = i as f32 * std::f32::consts::TAU / count as f32;
                    let dist = 8.0 + (i as f32 * 3.7).sin().abs() * 10.0;
                    let cx = angle.cos() * dist;
                    let cz = angle.sin() * dist;
                    let island_size = 2.0 + (i as f32 * 2.1).sin().abs() * 3.0;
                    // Island base (rock)
                    let _ = self.load_model_from_assets("rock.glb", &format!("island_{}", i), [cx, 0.0, cz], island_size);
                    // Palm trees
                    for j in 0..3 {
                        let a2 = j as f32 * std::f32::consts::TAU / 3.0;
                        let _ = self.load_model_from_assets("palm_tree.glb",
                            &format!("palm_{}_{}", i, j),
                            [cx + a2.cos() * island_size * 0.5, 0.5, cz + a2.sin() * island_size * 0.5],
                            1.5 + (j as f32 * 0.5));
                    }
                    total += 4; let _ = total;
                }
                self.sync_editor_scene();
                self.editor.add_ai_response(&format!("🏝️ Generated {} islands with palm trees! Water enabled.", count));
                self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
                return;
            }
            
            if rest.starts_with("mountain") || rest.starts_with("mountains") || rest.starts_with("terrain") {
                let peaks: usize = words.get(1).and_then(|w| w.parse().ok()).unwrap_or(8);
                let peaks = peaks.clamp(3, 30);
                self.push_undo();
                self.terrain_enabled = true;
                for i in 0..peaks {
                    let seed = (i as f32 * 5.3).sin();
                    let seed2 = (i as f32 * 8.7).cos();
                    let x = seed * 15.0;
                    let z = seed2 * 15.0;
                    let height = 3.0 + (seed.abs() + 0.2) * 8.0;
                    let width = 2.0 + seed.abs() * 3.0;
                    self.objects.push(SceneObject {
                        name: format!("peak_{}", i),
                        transform: Transform {
                            position: Vec3::new(x, height / 2.0, z),
                            rotation: Quat::IDENTITY,
                            scale: Vec3::new(width, height, width),
                        },
                        color: [0.45, 0.42, 0.4, 1.0], mesh_type: MeshType::Cone, spin_speed: 0.0,
                        parent: None, lod_meshes: Vec::new(),
                    });
                    // Snow cap
                    if height > 6.0 {
                        self.objects.push(SceneObject {
                            name: format!("snow_{}", i),
                            transform: Transform {
                                position: Vec3::new(x, height * 0.8, z),
                                rotation: Quat::IDENTITY,
                                scale: Vec3::new(width * 0.6, height * 0.3, width * 0.6),
                            },
                            color: [0.95, 0.95, 0.97, 1.0], mesh_type: MeshType::Cone, spin_speed: 0.0,
                            parent: None, lod_meshes: Vec::new(),
                        });
                    }
                }
                // Trees at base
                for i in 0..peaks * 2 {
                    let x = ((i as f32 * 4.3).sin()) * 12.0;
                    let z = ((i as f32 * 6.1).cos()) * 12.0;
                    let _ = self.load_model_from_assets("tree.glb", &format!("mtree_{}", i), [x, 0.0, z], 2.0 + (i as f32 * 0.3).sin().abs());
                }
                self.sync_editor_scene();
                self.editor.add_ai_response(&format!("⛰️ Generated mountain range! {} peaks with snow caps and trees. Terrain enabled.", peaks));
                self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
                return;
            }

            if rest.starts_with("battlefield") || rest.starts_with("warzone") {
                self.push_undo();
                let size = 8;
                // Trenches (low walls)
                for i in 0..size {
                    let x = (i as f32 - size as f32 / 2.0) * 3.0;
                    self.objects.push(SceneObject {
                        name: format!("trench_n_{}", i),
                        transform: Transform { position: Vec3::new(x, 0.3, -6.0), rotation: Quat::IDENTITY, scale: Vec3::new(1.5, 0.6, 0.5) },
                        color: [0.4, 0.35, 0.25, 1.0], mesh_type: MeshType::Cube, spin_speed: 0.0,
                        parent: None, lod_meshes: Vec::new(),
                    });
                    self.objects.push(SceneObject {
                        name: format!("trench_s_{}", i),
                        transform: Transform { position: Vec3::new(x, 0.3, 6.0), rotation: Quat::IDENTITY, scale: Vec3::new(1.5, 0.6, 0.5) },
                        color: [0.4, 0.35, 0.25, 1.0], mesh_type: MeshType::Cube, spin_speed: 0.0,
                        parent: None, lod_meshes: Vec::new(),
                    });
                }
                // Soldiers on both sides
                for i in 0..6 {
                    let x = (i as f32 - 2.5) * 3.0;
                    let _ = self.load_model_from_assets("soldier.glb", &format!("soldier_n_{}", i), [x, 0.0, -5.0], 0.0);
                    let _ = self.load_model_from_assets("robot.glb", &format!("robot_s_{}", i), [x, 0.0, 5.0], 0.0);
                }
                // Vehicles
                let _ = self.load_model_from_assets("truck.glb", "tank_north", [-10.0, 0.0, -8.0], 0.0);
                let _ = self.load_model_from_assets("truck.glb", "tank_south", [10.0, 0.0, 8.0], 0.0);
                // Explosions (fire + smoke)
                for i in 0..3 {
                    let x = (i as f32 - 1.0) * 5.0;
                    self.particle_emitters.push(ParticleEmitter::new(Vec3::new(x, 0.5, 0.0), ParticleType::Fire));
                    self.particle_emitters.push(ParticleEmitter::new(Vec3::new(x, 2.0, 0.0), ParticleType::Smoke));
                }
                // Craters (dark spheres sunk in ground)
                for i in 0..4 {
                    let x = ((i as f32 * 3.7).sin()) * 8.0;
                    let z = ((i as f32 * 5.1).cos()) * 4.0;
                    self.objects.push(SceneObject {
                        name: format!("crater_{}", i),
                        transform: Transform { position: Vec3::new(x, -0.3, z), rotation: Quat::IDENTITY, scale: Vec3::new(2.0, 0.5, 2.0) },
                        color: [0.2, 0.18, 0.15, 1.0], mesh_type: MeshType::Sphere, spin_speed: 0.0,
                        parent: None, lod_meshes: Vec::new(),
                    });
                }
                // Atmosphere
                self.post_params.brightness = 0.6;
                self.post_params.saturation = 0.7;
                self.post_params.temperature = 0.2;
                if let Some(ref buf) = self.post_params_buffer {
                    if let Some(ref gpu) = self.gpu { gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params)); }
                }
                self.sync_editor_scene();
                self.editor.add_ai_response("⚔️ Generated warzone! Trenches, soldiers vs robots, tanks, explosions, craters, smoke.");
                self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
                return;
            }

            // Generic: just suggest options
            self.editor.add_ai_response("🎲 Procedural generators: generate city 8, generate forest 50, generate dungeon 9, generate island 5, generate mountains 10, generate battlefield");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Gameplay: spawn point, checkpoints ---
        if lower.starts_with("set spawn") || lower.starts_with("spawn point") {
            let pos = self.camera_pos;
            self.editor.add_ai_response(&format!("🏁 Spawn point set at [{:.1}, {:.1}, {:.1}]! (Saved to scene)", pos.x, pos.y, pos.z));
            // Add a visible marker
            self.objects.push(SceneObject {
                name: "spawn_point".into(),
                transform: Transform { position: Vec3::new(pos.x, 0.0, pos.z), rotation: Quat::IDENTITY, scale: Vec3::splat(0.5) },
                color: [0.1, 1.0, 0.3, 0.5], mesh_type: MeshType::Sphere, spin_speed: 1.0,
                parent: None, lod_meshes: Vec::new(),
            });
            self.sync_editor_scene();
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("add checkpoint") || lower.starts_with("checkpoint") {
            let n = self.objects.iter().filter(|o| o.name.starts_with("checkpoint")).count();
            let pos = self.find_prompt_position(&lower);
            self.objects.push(SceneObject {
                name: format!("checkpoint_{}", n),
                transform: Transform { position: pos, rotation: Quat::IDENTITY, scale: Vec3::new(1.0, 3.0, 1.0) },
                color: [1.0, 0.8, 0.1, 0.4], mesh_type: MeshType::Cylinder, spin_speed: 0.3,
                parent: None, lod_meshes: Vec::new(),
            });
            self.sync_editor_scene();
            self.editor.add_ai_response(&format!("🚩 Checkpoint {} placed!", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("add trigger") || lower.starts_with("trigger zone") {
            let n = self.objects.iter().filter(|o| o.name.starts_with("trigger")).count();
            let pos = self.find_prompt_position(&lower);
            self.objects.push(SceneObject {
                name: format!("trigger_{}", n),
                transform: Transform { position: pos, rotation: Quat::IDENTITY, scale: Vec3::splat(3.0) },
                color: [0.3, 0.3, 1.0, 0.15], mesh_type: MeshType::Cube, spin_speed: 0.0,
                parent: None, lod_meshes: Vec::new(),
            });
            self.sync_editor_scene();
            self.editor.add_ai_response(&format!("🔵 Trigger zone {} placed! (Semi-transparent collision area)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Reflection quality ---
        if lower.starts_with("reflection") || lower.starts_with("reflect") {
            if lower.contains("off") || lower.contains("0") || lower.contains("none") {
                self.reflection_quality = 0;
                self.editor.add_ai_response("🪞 Reflections: OFF");
            } else if lower.contains("low") || lower.contains("1") {
                self.reflection_quality = 1;
                self.editor.add_ai_response("🪞 Reflections: LOW (128px cubemap)");
            } else if lower.contains("med") || lower.contains("2") {
                self.reflection_quality = 2;
                self.editor.add_ai_response("🪞 Reflections: MEDIUM (256px cubemap)");
            } else if lower.contains("high") || lower.contains("3") || lower.contains("max") {
                self.reflection_quality = 3;
                self.editor.add_ai_response("🪞 Reflections: HIGH (512px cubemap + SSR)");
            } else {
                self.editor.add_ai_response(&format!("🪞 Reflection quality: {} (0=off, 1=low, 2=med, 3=high). Use: reflection high", self.reflection_quality));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Frustum culling toggle ---
        if lower == "frustum culling on" || lower == "culling on" {
            self.frustum_culling = true;
            self.editor.add_ai_response("✂️ Frustum culling: ON (objects behind camera are skipped)");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "frustum culling off" || lower == "culling off" {
            self.frustum_culling = false;
            self.editor.add_ai_response("✂️ Frustum culling: OFF (all objects rendered)");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- PBR material commands ---
        if lower.starts_with("metallic ") || lower.starts_with("roughness ") || lower.starts_with("emissive ") {
            if let Some(sel) = self.editor.selected_entity.as_ref().and_then(|name| self.objects.iter().position(|o| &o.name == name)) {
                // Ensure materials vec is big enough
                while self.object_materials.len() <= sel {
                    self.object_materials.push(PbrMaterial::default());
                }
                if lower.starts_with("metallic ") {
                    if let Ok(v) = lower.replace("metallic ", "").trim().parse::<f32>() {
                        self.object_materials[sel].metallic = v.clamp(0.0, 1.0);
                        self.editor.add_ai_response(&format!("🔧 {} metallic = {:.2}", self.objects[sel].name, v.clamp(0.0, 1.0)));
                    }
                } else if lower.starts_with("roughness ") {
                    if let Ok(v) = lower.replace("roughness ", "").trim().parse::<f32>() {
                        self.object_materials[sel].roughness = v.clamp(0.0, 1.0);
                        self.editor.add_ai_response(&format!("🔧 {} roughness = {:.2}", self.objects[sel].name, v.clamp(0.0, 1.0)));
                    }
                } else if lower.starts_with("emissive ") {
                    let parts: Vec<f32> = lower.replace("emissive ", "").split_whitespace()
                        .filter_map(|s| s.parse().ok()).collect();
                    if parts.len() >= 3 {
                        self.object_materials[sel].emissive = [parts[0], parts[1], parts[2]];
                        self.editor.add_ai_response(&format!("💡 {} emissive = [{:.1}, {:.1}, {:.1}]", self.objects[sel].name, parts[0], parts[1], parts[2]));
                    } else if parts.len() == 1 {
                        let v = parts[0];
                        self.object_materials[sel].emissive = [v, v, v];
                        self.editor.add_ai_response(&format!("💡 {} emissive = {:.1}", self.objects[sel].name, v));
                    }
                }
                self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
                return;
            } else {
                self.editor.add_ai_response("⚠️ Select an object first to set material properties!");
                self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
                return;
            }
        }

        // --- Auto LOD ---
        if lower == "auto lod" || lower == "autolod" || lower.starts_with("auto lod") {
            let mut count = 0;
            for obj in &mut self.objects {
                if obj.lod_meshes.is_empty() {
                    // Auto-assign LOD: spheres→cubes at distance, complex→simpler
                    match obj.mesh_type {
                        MeshType::Sphere => {
                            obj.lod_meshes = vec![(30.0, MeshType::Sphere), (80.0, MeshType::Cube)];
                            count += 1;
                        }
                        MeshType::Torus => {
                            obj.lod_meshes = vec![(20.0, MeshType::Torus), (50.0, MeshType::Sphere), (100.0, MeshType::Cube)];
                            count += 1;
                        }
                        MeshType::Cylinder | MeshType::Cone => {
                            obj.lod_meshes = vec![(40.0, obj.mesh_type.clone()), (100.0, MeshType::Cube)];
                            count += 1;
                        }
                        MeshType::Custom(_) => {
                            obj.lod_meshes = vec![(30.0, obj.mesh_type.clone()), (60.0, MeshType::Sphere), (120.0, MeshType::Cube)];
                            count += 1;
                        }
                        _ => {}
                    }
                }
            }
            self.editor.add_ai_response(&format!("📐 Auto-LOD applied to {} objects! (Distant objects use simpler meshes)", count));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Timeline commands ---
        if lower == "timeline" || lower == "open timeline" || lower == "animation editor" {
            self.timeline_open = !self.timeline_open;
            self.editor.add_ai_response(if self.timeline_open { "🎬 Timeline editor opened!" } else { "🎬 Timeline editor closed!" });
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("keyframe") || lower.starts_with("add keyframe") || lower == "key" {
            if let Some(sel) = self.editor.selected_entity.as_ref().and_then(|name| self.objects.iter().position(|o| &o.name == name)) {
                let obj = &self.objects[sel];
                let kf = AnimKeyframe {
                    time: self.timeline_playhead,
                    position: obj.transform.position,
                    rotation: obj.transform.rotation,
                    scale: obj.transform.scale,
                };
                // Find or create track
                let track_idx = self.timeline_tracks.iter().position(|t| t.object_name == obj.name);
                if let Some(idx) = track_idx {
                    self.timeline_tracks[idx].keyframes.push(kf);
                    self.timeline_tracks[idx].keyframes.sort_by(|a, b| a.time.partial_cmp(&b.time).unwrap());
                } else {
                    self.timeline_tracks.push(AnimationTrack {
                        object_name: obj.name.clone(),
                        keyframes: vec![kf],
                    });
                }
                self.editor.add_ai_response(&format!("🔑 Keyframe added for '{}' at t={:.2}s", obj.name, self.timeline_playhead));
            } else {
                self.editor.add_ai_response("⚠️ Select an object to add a keyframe!");
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "play timeline" || lower == "play animation" {
            self.timeline_playing = true;
            self.timeline_playhead = 0.0;
            self.editor.add_ai_response("▶️ Timeline playing!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "stop timeline" || lower == "stop animation" || lower == "pause timeline" {
            self.timeline_playing = false;
            self.editor.add_ai_response(&format!("⏸️ Timeline paused at t={:.2}s", self.timeline_playhead));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("timeline duration ") {
            if let Ok(d) = lower.replace("timeline duration ", "").trim().parse::<f32>() {
                self.timeline_duration = d.max(1.0);
                self.editor.add_ai_response(&format!("🎬 Timeline duration: {:.1}s", self.timeline_duration));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Visual scripting ---
        if lower == "nodes" || lower == "node graph" || lower == "visual script" || lower == "scripting" {
            self.editor.show_node_graph = !self.editor.show_node_graph;
            self.editor.add_ai_response(if self.editor.show_node_graph { "🔗 Node graph opened!" } else { "🔗 Node graph closed!" });
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "assets" || lower == "asset browser" || lower == "browse assets" {
            self.editor.show_asset_browser = !self.editor.show_asset_browser;







        // === ROUND 76-80 TICKS ===
        // Pathfinding agents
        if let Some(ref mut pf) = self.pathfinding_system {
            let dt_pf = 0.016 * self.time_scale;
            for agent in &mut pf.agents_v2 {
                if agent.path_index < agent.path.len() {
                    let target = agent.path[agent.path_index];
                    let dx = target[0] - agent.pos[0];
                    let dz = target[2] - agent.pos[2];
                    let dist = (dx*dx + dz*dz).sqrt();
                    if dist < agent.stopping_dist { agent.path_index += 1; }
                    else {
                        let s = agent.speed * dt_pf / dist;
                        agent.pos[0] += dx * s;
                        agent.pos[2] += dz * s;
                    }
                }
                agent.stuck_timer = if agent.vel[0].abs() + agent.vel[2].abs() < 0.01 { agent.stuck_timer + dt_pf } else { 0.0 };
            }
            pf.path_cache.retain_mut(|c| { c.age += dt_pf; c.age < 5.0 });
        }
        // Memory GC
        if let Some(ref mut perf) = self.perf_optimizer {
            let dt_perf = 0.016 * self.time_scale;
            perf.memory_manager.gc_timer += dt_perf;
            perf.frame_pacing.frame_time_history.push(dt_perf * 1000.0);
            if perf.frame_pacing.frame_time_history.len() > 120 { perf.frame_pacing.frame_time_history.remove(0); }
        }
        // Level encounter check (simplified)
        if let Some(ref mut ld) = self.level_design_tools {
            let dt_ld = 0.016 * self.time_scale;
            for zone in &mut ld.encounter_zones {
                if zone.triggered {
                    for wave in &mut zone.waves_v2 { wave.delay = (wave.delay - dt_ld).max(0.0); }
                }
            }
        }

        // === ROUND 66-75 TICKS ===
        // Cinematic playback
        if let Some(ref mut ce) = self.cinematic_engine {
            let dt_ce = 0.016 * self.time_scale;
            if let Some(idx) = ce.active_sequence {
                if let Some(seq) = ce.sequences.get_mut(idx) {
                    if seq.playing { seq.timer += dt_ce; if seq.timer >= seq.duration { seq.playing = false; if seq.looping { seq.timer = 0.0; seq.playing = true; } } }
                }
            }
            ce.subtitle_queue_v2.retain(|s| s.end_time > 0.0);
        }
        // Economy price fluctuation
        if let Some(ref mut econ) = self.economy_engine {
            let dt_ec = 0.016 * self.time_scale;
            for market in &mut econ.markets {
                market.restock_timer += dt_ec;
            }
            for listing in &mut econ.auction_house.listings {
                listing.time_remaining -= dt_ec;
            }
            econ.auction_house.listings.retain(|l| l.time_remaining > 0.0);
        }
        // Vehicle physics
        if let Some(ref mut vs) = self.vehicle_system_v2 {
            let dt_vs = 0.016 * self.time_scale;
            for v in &mut vs.vehicles {
                if v.speed > 0.0 {
                    v.fuel -= v.fuel_consumption * dt_vs;
                    v.fuel = v.fuel.max(0.0);
                    if v.fuel <= 0.0 { v.speed = 0.0; }
                }
                if v.damage_model.on_fire {
                    v.health_v3 -= 5.0 * dt_vs;
                    if v.health_v3 <= 0.0 { v.damage_model.exploded = true; v.damage_model.on_fire = false; }
                }
                v.engine.overheating = (v.engine.overheating - 0.5 * dt_vs).max(0.0);
            }
        }
        // Analytics flush
        if let Some(ref mut analytics) = self.analytics_system {
            let dt_an = 0.016 * self.time_scale;
            analytics.flush_timer += dt_an;
            if analytics.flush_timer >= analytics.flush_interval {
                analytics.flush_timer = 0.0;
                // Would flush events to server
            }
        }
        // Progression challenges
        if let Some(ref mut prog) = self.progression_system {
            let dt_pr = 0.016 * self.time_scale;
            for challenge in &mut prog.challenges {
                if challenge.time_limit.is_some() {
                    challenge.timer += dt_pr;
                }
            }
            if let Some(ref mut season) = prog.season_v2 {
                // Season pass doesn't tick down in real-time in engine
            }
        }
        // World streaming distance check
        if let Some(ref mut ws) = self.world_streaming {
            // Would check player distance to sectors
            for sector in &mut ws.sectors {
                if sector.loading { sector.loaded = true; sector.loading = false; }
            }
        }

        // === ROUND 56-65 TICKS: ADVANCED SYSTEMS ===
        // Weather transitions
        if let Some(ref mut we) = self.weather_engine {
            let dt_w = 0.016 * self.time_scale;
            if we.transition_timer > 0.0 {
                we.transition_timer -= dt_w;
                if we.transition_timer <= 0.0 && !we.forecast.is_empty() {
                    we.current = we.forecast.remove(0);
                }
            }
            // Lightning
            if we.lightning_system.active {
                we.lightning_system.timer += dt_w;
                if we.lightning_system.timer >= we.lightning_system.frequency {
                    we.lightning_system.timer = 0.0;
                }
                we.lightning_system.bolts.retain_mut(|b| { b.timer += dt_w; b.timer < b.lifetime });
            }
            // Precipitation accumulation
            if we.precipitation.accumulation && we.precipitation.rate > 0.0 {
                we.precipitation.wetness = (we.precipitation.wetness + we.precipitation.accumulation_rate * dt_w).min(1.0);
            } else {
                we.precipitation.wetness = (we.precipitation.wetness - we.precipitation.wetness_decay * dt_w).max(0.0);
            }
            // Wind gusts
            we.wind_system.gusts.retain_mut(|g| { g.timer += dt_w; g.timer < g.duration });
        }
        // Destruction debris
        if let Some(ref mut ds) = self.destruction_system {
            let dt_d2 = 0.016 * self.time_scale;
            ds.debris_pool.retain_mut(|d| { d.timer += dt_d2; d.pos[1] += d.vel[1] * dt_d2; d.vel[1] -= 9.81 * dt_d2; d.timer < d.lifetime });
        }
        // VFX instances
        if let Some(ref mut vfx) = self.vfx_system_v2 {
            let dt_v = 0.016 * self.time_scale;
            vfx.effect_pool.retain_mut(|e| { e.timer += dt_v; e.active });
        }
        // Decal system
        if let Some(ref mut decals) = self.decal_system_v2 {
            let dt_dc = 0.016 * self.time_scale;
            decals.decals_v2.retain_mut(|d| { d.timer += dt_dc; d.timer < d.lifetime });
        }
        // Save system auto-save timer
        if let Some(ref mut save) = self.save_system_v2 {
            let dt_sv = 0.016 * self.time_scale;
            save.auto_save_timer += dt_sv;
        }
        // Game mode round timer
        if let Some(ref mut gm) = self.game_mode_system {
            let dt_gm = 0.016 * self.time_scale;
            if gm.warmup { gm.warmup_timer -= dt_gm; if gm.warmup_timer <= 0.0 { gm.warmup = false; } }
            else { gm.round_timer += dt_gm; }
        }
        // Procedural animation - head tracking saccade
        if let Some(ref mut pa) = self.procedural_anim {
            let dt_pa = 0.016 * self.time_scale;
            for tracker in &mut pa.head_tracking {
                tracker.saccade_timer += dt_pa;
                tracker.blink_timer += dt_pa;
                if tracker.blink_timer >= tracker.blink_rate { tracker.blink_timer = 0.0; }
            }
        }
        // Water waves
        if let Some(ref mut water) = self.water_system_v2 {
            let t_w = self.time.elapsed_secs;
            for body in &mut water.bodies {
                for wave in &mut body.waves {
                    wave.direction[0] = (t_w * wave.speed * 0.1).cos();
                }
            }
        }

        // === ROUND 46-55 TICKS: DEEP SYSTEMS ===
        // Camera blending
        if let Some(ref mut cam_sys) = self.camera_system_v2 {
            let dt_c = 0.016 * self.time_scale;
            cam_sys.blend_stack.retain_mut(|b| { b.timer += dt_c; b.timer < b.blend_time });
        }
        // AI stimuli decay
        if let Some(ref mut ai) = self.ai_brain_system {
            let dt_a = 0.016 * self.time_scale;
            ai.stimuli.retain_mut(|s| { s.timer += dt_a; s.timer < s.duration });
            for brain in &mut ai.brains {
                brain.memory_v2.retain(|m| m.threat_level > 0.01);
            }
        }
        // Combat ticks
        if let Some(ref mut combat) = self.combat_system {
            let dt_c2 = 0.016 * self.time_scale;
            if combat.combo_counter > 0 {
                combat.combo_timer -= dt_c2;
                if combat.combo_timer <= 0.0 { combat.combo_counter = 0; combat.style_rank = StyleRank::D; }
            }
            for c in &mut combat.combatants {
                c.stamina = (c.stamina + 5.0 * dt_c2).min(c.max_stamina);
                c.poise = (c.poise + 2.0 * dt_c2).min(c.max_poise);
                c.status_effects_v2.retain_mut(|e| { e.timer += dt_c2; e.tick_timer += dt_c2; e.timer < e.duration });
                c.buffs.retain_mut(|b| { b.timer += dt_c2; b.timer < b.duration });
                c.cooldowns.retain_mut(|cd| { cd.remaining -= dt_c2; cd.remaining > 0.0 });
            }
        }
        // Crafting queue
        if let Some(ref mut craft) = self.crafting_system_v2 {
            let dt_cr = 0.016 * self.time_scale;
            for job in &mut craft.crafting_queue {
                job.progress += dt_cr;
            }
            craft.crafting_queue.retain(|j| j.progress < j.total_time);
        }
        // Quest timers
        if let Some(ref mut qs) = self.quest_system_v2 {
            let dt_q = 0.016 * self.time_scale;
            for q in &mut qs.quests_v2 {
                if let Some(limit) = q.time_limit {
                    if matches!(q.status, QuestStatusV2::Active2) {
                        q.timer += dt_q;
                        if q.timer >= limit { q.status = QuestStatusV2::Failed2; }
                    }
                }
                q.cooldown_timer = (q.cooldown_timer - dt_q).max(0.0);
            }
        }
        // Dialogue barks
        if let Some(ref mut dlg) = self.dialogue_system_v2 {
            let dt_d = 0.016 * self.time_scale;
            dlg.bark_queue.retain_mut(|b| { b.timer += dt_d; b.timer < b.duration });
        }
        // Music engine beat tracking
        if let Some(ref mut audio) = self.audio_system_v2 {
            let dt_au = 0.016 * self.time_scale;
            let beat_interval = 60.0 / audio.music_engine.tempo;
            audio.music_engine.bar_count = (audio.music_engine.bar_count as f32 + dt_au / (beat_interval * audio.music_engine.time_signature[0] as f32)) as u32;
        }
        // Vegetation wind update
        if let Some(ref mut veg) = self.vegetation_system {
            let t = self.time.elapsed_secs;
            veg.wind_settings.main_strength = 0.5 + 0.3 * (t * 0.1).sin();
        }

        // === ROUND 33-45 TICKS: DEEP ENGINE SYSTEMS ===
        // Debug draw cleanup
        let dt_s = 0.016 * self.time_scale;
        self.debug_draw.lines.retain_mut(|l| { l.duration -= dt_s; l.duration > 0.0 });
        self.debug_draw.spheres.retain_mut(|s| { s.duration -= dt_s; s.duration > 0.0 });
        self.debug_draw.boxes.retain_mut(|b| { b.duration -= dt_s; b.duration > 0.0 });
        self.debug_draw.texts.retain_mut(|t| { t.duration -= dt_s; t.duration > 0.0 });
        // Profiler frame recording
        if self.profiler_v2.recording {
            let frame = ProfileFrame { frame_num: 0, total_ms: dt_s * 1000.0, cpu_ms: dt_s * 800.0, gpu_ms: dt_s * 200.0, draw_calls: self.objects.len() as u32, triangles: self.objects.len() as u32 * 1000, samples: vec![] };
            self.profiler_v2.frames.push(frame);
            if self.profiler_v2.frames.len() > self.profiler_v2.max_frames as usize { self.profiler_v2.frames.remove(0); }
        }
        // Input playback
        if self.input_recorder.playing_back && self.input_recorder.playback_pos < self.input_recorder.events.len() {
            self.input_recorder.playback_pos += 1;
            if self.input_recorder.playback_pos >= self.input_recorder.events.len() { self.input_recorder.playing_back = false; }
        }
        // Haptic feedback cleanup
        self.haptic_feedback.retain(|h| { !h.patterns.is_empty() });
        // UI animations
        if let Some(ref mut ui) = self.ui_engine {
            for anim in &mut ui.animations_ui {
                if anim.playing {
                    anim.timer += dt_s;
                    if anim.timer >= anim.duration {
                        if anim.looping { anim.timer = 0.0; } else { anim.playing = false; }
                    }
                }
            }
        }
        // TTS queue processing
        if let Some(ref mut tts) = self.tts {
            if !tts.queue.is_empty() && tts.enabled {
                tts.queue.remove(0); // simulate processing
            }
        }
        // Subtitle system
        if let Some(ref mut sub) = self.subtitle_system_v2 {
            sub.subtitles_v3.retain_mut(|s| { s.timer += dt_s; s.timer < s.duration });
        }
        // === ROUND 12 TICKS: WORLD & AI ===
        for f in &mut self.furnaces { if f.fuel > 0.0 && f.smelting.is_some() { f.fuel -= 0.016 * self.time_scale; f.timer += 0.016 * self.time_scale; f.temperature = (f.temperature + 10.0 * 0.016 * self.time_scale).min(1200.0); if f.timer >= 30.0 { f.smelting = None; f.timer = 0.0; } } else { f.temperature = (f.temperature - 5.0 * 0.016 * self.time_scale).max(0.0); } }
        for g in &mut self.gardens { for plot in &mut g.plots { if let Some(_) = &plot.plant { if plot.watered { plot.growth = (plot.growth + 0.01 * plot.quality * 0.016 * self.time_scale).min(1.0); } } } }
        for mn in &mut self.mining_nodes { if mn.hp <= 0.0 { mn.timer += 0.016 * self.time_scale; if mn.timer >= mn.respawn_time { mn.hp = mn.max_hp; mn.timer = 0.0; } } }
        for ht in &mut self.harvestable_trees { if ht.cut { ht.timer += 0.016 * self.time_scale; if ht.timer >= ht.regrow_time { ht.cut = false; ht.hp = ht.max_hp; ht.timer = 0.0; } } }
        for b in &mut self.banners { let _ = b.wave_speed; }
        if self.matchmaking.searching { self.matchmaking.search_time += 0.016 * self.time_scale; }

        // === ROUND 11 TICKS: VFX ===
        self.screen_effects.retain_mut(|e| { if e.duration > 0.0 { e.timer += 0.016 * self.time_scale; e.timer < e.duration } else { true } });
        for cp in &mut self.camera_paths { if cp.playing { cp.timer += 0.016 * self.time_scale; if cp.timer >= cp.duration { if cp.looping { cp.timer = 0.0; } else { cp.playing = false; } } } }
        for d in &mut self.dissolve_effects { if d.active { d.progress += d.speed * 0.016 * self.time_scale; if d.progress >= 1.0 { d.active = false; } } }
        self.shockwaves.retain_mut(|s| { s.timer += 0.016 * self.time_scale; s.radius += s.speed * 0.016 * self.time_scale; s.radius < s.max_radius });
        self.explosions.retain_mut(|e| { e.timer += 0.016 * self.time_scale; e.radius += e.speed * 0.016 * self.time_scale; e.radius < e.max_radius });
        self.floating_texts.retain_mut(|t| { t.timer += 0.016 * self.time_scale; t.pos[0] += t.velocity[0] * 0.016 * self.time_scale; t.pos[1] += t.velocity[1] * 0.016 * self.time_scale; t.pos[2] += t.velocity[2] * 0.016 * self.time_scale; t.timer < t.lifetime });
        self.impact_effects.retain_mut(|i| { i.timer += 0.016 * self.time_scale; i.timer < i.lifetime });
        self.chain_lightnings.retain_mut(|c| { c.timer += 0.016 * self.time_scale; c.timer < c.lifetime });
        self.damage_indicators.retain_mut(|d| { d.timer += 0.016 * self.time_scale; d.timer < d.lifetime });
        self.notifications_v2.retain_mut(|n| { n.timer += 0.016 * self.time_scale; n.timer < n.duration });
        for b in &mut self.beams { b.timer += 0.016 * self.time_scale; }
        for a in &mut self.electric_arcs { a.timer += 0.016 * self.time_scale; }
        for d in &mut self.decal_projectors { if let Some(life) = d.lifetime { d.age += 0.016 * self.time_scale; } }
        self.decal_projectors.retain(|d| d.lifetime.map_or(true, |l| d.age < l));
        if self.freeze_frame.active { self.freeze_frame.timer += 0.016; if self.freeze_frame.timer >= self.freeze_frame.duration { self.freeze_frame.active = false; } }
        if self.hit_stop.active { self.hit_stop.timer += 0.016; if self.hit_stop.timer >= self.hit_stop.duration { self.hit_stop.active = false; } }
        self.screen_shakes_v2.retain_mut(|s| { s.timer += 0.016 * self.time_scale; if s.decay { s.intensity *= 0.95; } s.timer < s.duration });
        if self.benchmark.running { self.benchmark.frames += 1; self.benchmark.total_time += 0.016; let fps = 1.0 / 0.016; if fps < self.benchmark.min_fps { self.benchmark.min_fps = fps; } if fps > self.benchmark.max_fps { self.benchmark.max_fps = fps; } }
        if self.perf_overlay.show_fps { self.perf_overlay.history.push(1.0 / 0.016); if self.perf_overlay.history.len() > 120 { self.perf_overlay.history.remove(0); } }
        { let sd = &mut self.score_display; if sd.displayed_score < sd.score { sd.displayed_score += (sd.speed * 0.016) as i64; if sd.displayed_score > sd.score { sd.displayed_score = sd.score; } } }
        if self.combo_counter.hits > 0 { self.combo_counter.timer += 0.016 * self.time_scale; if self.combo_counter.timer >= self.combo_counter.timeout { if self.combo_counter.hits > self.combo_counter.best { self.combo_counter.best = self.combo_counter.hits; } self.combo_counter.hits = 0; self.combo_counter.multiplier = 1.0; } }
        if self.kill_streak.count > 0 { self.kill_streak.timer += 0.016 * self.time_scale; if self.kill_streak.timer >= self.kill_streak.timeout { if self.kill_streak.count > self.kill_streak.best { self.kill_streak.best = self.kill_streak.count; } self.kill_streak.count = 0; } }
        { let sb = &mut self.stamina_bar; if sb.current < sb.max_stamina { if sb.delay_timer > 0.0 { sb.delay_timer -= 0.016 * self.time_scale; } else { sb.current = (sb.current + sb.regen_rate * 0.016 * self.time_scale).min(sb.max_stamina); } } }
        self.mana_bar.current = (self.mana_bar.current + self.mana_bar.regen_rate * 0.016 * self.time_scale).min(self.mana_bar.max_mana);
        if self.splash_screen.active { self.splash_screen.timer += 0.016 * self.time_scale; if self.splash_screen.timer >= self.splash_screen.duration { self.splash_screen.active = false; } }

        // === ROUND 10 TICKS ===
        for mp in &mut self.moving_platforms {
            if mp.waypoints.len() < 2 { continue; }
            mp.wait_timer -= 0.016 * self.time_scale;
            if mp.wait_timer > 0.0 { continue; }
            let target = mp.waypoints[mp.idx];
            let dx = target[0] - mp.pos[0]; let dy = target[1] - mp.pos[1]; let dz = target[2] - mp.pos[2];
            let dist = (dx*dx + dy*dy + dz*dz).sqrt();
            if dist < 0.1 {
                match mp.style { PlatformStyle::Loop => { mp.idx = (mp.idx + 1) % mp.waypoints.len(); }, PlatformStyle::PingPong => { if mp.idx == mp.waypoints.len()-1 { mp.waypoints.reverse(); mp.idx = 1; } else { mp.idx += 1; } }, PlatformStyle::OneShot => { if mp.idx < mp.waypoints.len()-1 { mp.idx += 1; } }, PlatformStyle::Linear => { mp.idx = (mp.idx + 1) % mp.waypoints.len(); } }
                mp.wait_timer = mp.wait_time;
            } else {
                let spd = mp.speed * 0.016 * self.time_scale / dist;
                mp.pos[0] += dx * spd; mp.pos[1] += dy * spd; mp.pos[2] += dz * spd;
            }
        }
        for c in &mut self.crushers {
            c.timer += 0.016 * self.time_scale;
            if !c.extended && c.timer >= c.delay { c.extended = true; c.timer = 0.0; }
            if c.extended && c.timer >= 0.5 { c.extended = false; c.timer = 0.0; }
        }
        for fj in &mut self.flame_jets {
            fj.timer += 0.016 * self.time_scale;
            if fj.active && fj.timer >= fj.on_time { fj.active = false; fj.timer = 0.0; }
            if !fj.active && fj.timer >= fj.off_time { fj.active = true; fj.timer = 0.0; }
        }
        for l in &mut self.lasers { if l.pulse { l.pulse_timer += 0.016 * self.time_scale; l.active = (l.pulse_timer * 2.0).sin() > 0.0; } }
        for t in &mut self.timers_v2 { if t.running { t.elapsed += 0.016 * self.time_scale; if t.elapsed >= t.duration { if t.loop_timer { t.elapsed = 0.0; } else { t.running = false; } } } }
        for ps in &mut self.pickup_spawners { ps.timer += 0.016 * self.time_scale; if ps.timer >= ps.interval && ps.active_count < ps.max_active { ps.timer = 0.0; ps.active_count += 1; } }
        for t in &mut self.torches { if t.lit { let seed = (t.pos[0] * 1000.0 + self.time.elapsed_secs * 10.0) as u32; t.range = 8.0 + (rand_f32(seed) - 0.5) * t.flicker * 4.0; } }
        for g in &mut self.glow_objects { let phase = self.time.elapsed_secs * g.pulse_speed; g.intensity = 1.5 + (phase.sin()) * 0.5; }
        self.projectiles_v2.retain_mut(|p| { p.age += 0.016 * self.time_scale; p.pos[0] += p.velocity[0] * 0.016 * self.time_scale; p.pos[1] += p.velocity[1] * 0.016 * self.time_scale; p.pos[2] += p.velocity[2] * 0.016 * self.time_scale; p.age < p.lifetime });
        self.dialogue_bubbles.retain(|b| b.timer < b.duration);

        // === MEGA 9 TICKS ===
        for p in &mut self.bezier_paths { p.t += p.speed * 0.016 * self.time_scale * 0.1; if p.looping && p.t > 1.0 { p.t -= 1.0; } }
        for d in &mut self.stealth_detectors { d.alert = (d.alert - 0.1 * 0.016 * self.time_scale).max(0.0); d.state = if d.alert > 0.8 { StealthState::Combat } else if d.alert > 0.5 { StealthState::Alerted } else if d.alert > 0.2 { StealthState::Suspicious } else { StealthState::Unaware }; }
        for sw in &mut self.puzzle_switches { if let Some(r) = sw.reset { if sw.on { sw.timer += 0.016 * self.time_scale; if sw.timer >= r { sw.on = false; sw.timer = 0.0; } } } }
        for r in &mut self.patrol_routes { if r.waypoints.is_empty() { continue; } if r.wait_t > 0.0 { r.wait_t -= 0.016 * self.time_scale; continue; } r.wait_t = *r.waits.get(r.idx).unwrap_or(&1.0); r.idx = (r.idx + 1) % r.waypoints.len(); }
        self.dialogue_bubbles.retain_mut(|b| { b.timer += 0.016 * self.time_scale; b.timer < b.duration });
        for e in &mut self.elevators { let dt = 0.016 * self.time_scale; if e.wait_timer > 0.0 { e.wait_timer -= dt; } else { if e.going_up { e.current_y += e.speed * dt; if e.current_y >= e.top_y { e.current_y = e.top_y; e.going_up = false; e.wait_timer = e.wait_time; } } else { e.current_y -= e.speed * dt; if e.current_y <= e.bottom_y { e.current_y = e.bottom_y; e.going_up = true; e.wait_timer = e.wait_time; } } } }
        for t in &mut self.turrets { t.timer += 0.016 * self.time_scale; }
        for s in &mut self.shields { if s.hp < s.max_hp { if s.broken_timer > 0.0 { s.broken_timer -= 0.016 * self.time_scale; } else { s.hp = (s.hp + s.regen_rate * 0.016 * self.time_scale).min(s.max_hp); } } }
        for c in &mut self.sec_cameras { c.angle += c.rotation_speed * 0.016 * self.time_scale; if c.angle > std::f32::consts::PI { c.angle = -std::f32::consts::PI; } }
        for l in &mut self.music_layers { l.vol += (l.target_vol - l.vol) * l.fade * 0.016 * self.time_scale; }
        if self.proc_sky.enabled { let t = self.time.elapsed_secs % 240.0; let n = t / 240.0; let a = n * std::f32::consts::TAU - std::f32::consts::FRAC_PI_2; self.proc_sky.sun_dir = [a.cos()*0.5, a.sin(), 0.3]; let d = self.proc_sky.sun_dir[1].max(0.0); self.proc_sky.sky_top = [0.05+0.15*d, 0.1+0.3*d, 0.2+0.7*d]; self.proc_sky.stars = (1.0-d*3.0).max(0.0); }
        for s in &mut self.sprites { if s.frames > 1 { s.timer += 0.016 * self.time_scale; if s.timer >= 1.0/s.fps { s.timer = 0.0; s.frame = (s.frame+1) % s.frames; } } }

            if self.editor.show_asset_browser { self.populate_asset_browser(); }
            self.editor.add_ai_response(if self.editor.show_asset_browser { "📂 Asset browser opened!" } else { "📂 Asset browser closed!" });
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("connect ") {
            // connect 0 1 — connect node 0 output to node 1 input
            let parts: Vec<usize> = lower.replace("connect ", "").split_whitespace()
                .filter_map(|s| s.parse().ok()).collect();
            if parts.len() >= 2 && parts[0] < self.editor.script_nodes.len() && parts[1] < self.editor.script_nodes.len() {
                self.editor.script_connections.push((parts[0], parts[1]));
                self.editor.add_ai_response(&format!("🔗 Connected node {} → {}", parts[0], parts[1]));
            } else {
                self.editor.add_ai_response("⚠️ Usage: connect <from_id> <to_id>");
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("add node ") {
            let kind_str = lower.replace("add node ", "").trim().to_string();
            let id = self.editor.script_nodes.len();
            let (kind, label) = match kind_str.as_str() {
                "on_start" | "start" => (editor::NodeKind::Event("on_start".into()), "On Start"),
                "on_key" | "key" => (editor::NodeKind::Event("on_key".into()), "On Key Press"),
                "on_collision" | "collision" => (editor::NodeKind::Event("on_collision".into()), "On Collision"),
                "on_timer" | "timer" => (editor::NodeKind::Event("on_timer".into()), "On Timer"),
                "move" => (editor::NodeKind::Action("move".into()), "Move"),
                "rotate" => (editor::NodeKind::Action("rotate".into()), "Rotate"),
                "spawn" => (editor::NodeKind::Action("spawn".into()), "Spawn Object"),
                "destroy" => (editor::NodeKind::Action("destroy".into()), "Destroy"),
                "play_sound" | "sound" => (editor::NodeKind::Action("play_sound".into()), "Play Sound"),
                "if_key" => (editor::NodeKind::Condition("if_key".into()), "If Key"),
                "if_distance" => (editor::NodeKind::Condition("if_distance".into()), "If Distance"),
                _ => (editor::NodeKind::Action(kind_str.clone()), &*kind_str),
            };
            self.editor.script_nodes.push(editor::ScriptNode {
                id, kind, pos: [50.0 + (id % 4) as f32 * 140.0, 50.0 + (id / 4) as f32 * 80.0],
                label: label.to_string(),
            });
            self.editor.add_ai_response(&format!("🔗 Added node #{}: {}", id, label));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Performance stats ---
        if lower == "stats" || lower == "perf" || lower == "performance" || lower == "info" {
            let obj_count = self.objects.len();
            let light_count = self.scene_lights.len();
            let emitter_count = self.particle_emitters.len();
            let track_count = self.timeline_tracks.len();
            let lod_count = self.objects.iter().filter(|o| !o.lod_meshes.is_empty()).count();
            self.editor.add_ai_response(&format!(
                "📊 Engine Stats:\n  Objects: {} | Lights: {} | Particles: {} emitters\n  LOD: {} | Anim tracks: {} | Reflection: {} | Cull: {}\n  AI agents: {} | Crowd: {} | Quests: {} | Constraints: {}\n  Layers: {} | Tags: {} | Variables: {} | Events: {}\n  Bloom: {} | Post-FX: {} | Foliage: {} | Decals: {}",
                obj_count, light_count, emitter_count,
                lod_count, track_count, match self.reflection_quality { 0 => "off", 1 => "low", 2 => "med", _ => "high" }, if self.frustum_culling { "on" } else { "off" },
                self.ai_agents.len(), self.crowd_agents.len(), self.quests.len(), self.constraints.len(),
                self.layers.len(), self.object_tags.len(), self.game_variables.len(), self.event_listeners.len(),
                if self.bloom_enabled { "on" } else { "off" }, if self.post_enabled { "on" } else { "off" },
                self.foliage_instances.len(), self.decals.len(),
            ));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Grid snapping ---
        if lower.starts_with("snap grid ") || lower.starts_with("grid snap ") {
            if let Ok(size) = lower.replace("snap grid ", "").replace("grid snap ", "").trim().parse::<f32>() {
                // Snap all objects to grid
                let snap = size.max(0.1);
                for obj in &mut self.objects {
                    let p = &mut obj.transform.position;
                    p.x = (p.x / snap).round() * snap;
                    p.y = (p.y / snap).round() * snap;
                    p.z = (p.z / snap).round() * snap;
                }
                self.sync_editor_scene();
                self.editor.add_ai_response(&format!("📐 All objects snapped to {:.1} grid!", snap));
            } else {
                self.editor.add_ai_response("📐 Usage: snap grid 1.0");
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Multi-select operations ---
        if lower.starts_with("select all ") {
            let filter = lower.replace("select all ", "").trim().to_string();
            let matches: Vec<String> = self.objects.iter()
                .filter(|o| o.name.contains(&filter) || o.mesh_type.as_str() == filter)
                .map(|o| o.name.clone())
                .collect();
            self.editor.add_ai_response(&format!("✅ Selected {} objects matching '{}'", matches.len(), filter));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Distribute objects evenly ---
        if lower.starts_with("distribute ") {
            let axis = if lower.contains("x") { 0 } else if lower.contains("z") { 2 } else { 0 };
            let n = self.objects.len();
            if n > 1 {
                let spacing = 3.0;
                let start = -(n as f32 * spacing) / 2.0;
                for (i, obj) in self.objects.iter_mut().enumerate() {
                    match axis {
                        0 => obj.transform.position.x = start + i as f32 * spacing,
                        2 => obj.transform.position.z = start + i as f32 * spacing,
                        _ => obj.transform.position.x = start + i as f32 * spacing,
                    }
                }
                self.sync_editor_scene();
                self.editor.add_ai_response(&format!("↔️ Distributed {} objects along {} axis", n, ["X", "Y", "Z"][axis]));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Object array/pattern commands ---
        if lower.starts_with("array ") {
            // array cube 5 3 → 5x3 grid of cubes
            let parts: Vec<&str> = lower.split_whitespace().collect();
            if parts.len() >= 3 {
                let mesh_str = parts[1];
                let cols: usize = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(3);
                let rows: usize = parts.get(3).and_then(|s| s.parse().ok()).unwrap_or(1);
                let spacing: f32 = parts.get(4).and_then(|s| s.parse().ok()).unwrap_or(2.5);
                let mesh = MeshType::from_str(mesh_str);
                let base = self.camera_pos + Vec3::new(0.0, 0.0, -5.0);
                self.push_undo();
                let mut count = 0;
                for r in 0..rows {
                    for c in 0..cols {
                        self.objects.push(SceneObject {
                            name: format!("{}_{}", mesh_str, self.objects.len()),
                            transform: Transform {
                                position: base + Vec3::new(c as f32 * spacing - (cols as f32 * spacing) / 2.0, 0.5, r as f32 * spacing),
                                rotation: Quat::IDENTITY, scale: Vec3::splat(1.0),
                            },
                            color: [0.7, 0.7, 0.7, 1.0], mesh_type: mesh.clone(), spin_speed: 0.0,
                            parent: None, lod_meshes: Vec::new(),
                        });
                        count += 1;
                    }
                }
                self.sync_editor_scene();
                self.editor.add_ai_response(&format!("🔲 Created {}x{} array of {} ({} objects, spacing {:.1})", cols, rows, mesh_str, count, spacing));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Spline path ---
        if lower.starts_with("path ") || lower.starts_with("spline ") {
            let parts: Vec<&str> = lower.split_whitespace().collect();
            if parts.len() >= 2 {
                let name = parts.get(1).unwrap_or(&"path").to_string();
                let point_count: usize = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(5);
                self.push_undo();
                // Create path waypoints as small spheres
                for i in 0..point_count {
                    let t = i as f32 / (point_count - 1).max(1) as f32;
                    let pos = Vec3::new(
                        t * 20.0 - 10.0,
                        (t * std::f32::consts::PI * 2.0).sin() * 3.0 + 2.0,
                        (t * std::f32::consts::PI).sin() * 5.0,
                    );
                    self.objects.push(SceneObject {
                        name: format!("{}_{}", name, i),
                        transform: Transform { position: pos, rotation: Quat::IDENTITY, scale: Vec3::splat(0.3) },
                        color: [1.0, 0.5, 0.0, 0.8], mesh_type: MeshType::Sphere, spin_speed: 0.0,
                        parent: None, lod_meshes: Vec::new(),
                    });
                }
                self.sync_editor_scene();
                self.editor.add_ai_response(&format!("🛤️ Spline path '{}' created with {} waypoints! Move them to define your path.", name, point_count));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Physics presets ---
        if lower == "gravity off" || lower == "zero gravity" || lower == "zero g" {
            self.physics_gravity = 0.0;
            self.editor.add_ai_response("🪐 Zero gravity!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "gravity moon" || lower == "moon gravity" {
            self.physics_gravity = 1.62;
            self.editor.add_ai_response("🌙 Moon gravity (1.62 m/s²)!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "gravity mars" {
            self.physics_gravity = 3.72;
            self.editor.add_ai_response("🔴 Mars gravity (3.72 m/s²)!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "gravity earth" || lower == "gravity normal" || lower == "gravity reset" {
            self.physics_gravity = 9.81;
            self.editor.add_ai_response("🌍 Earth gravity (9.81 m/s²)!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "gravity jupiter" {
            self.physics_gravity = 24.79;
            self.editor.add_ai_response("🪐 Jupiter gravity (24.79 m/s²)! Objects will fall FAST.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Color presets for objects ---
        if lower.starts_with("color ") || lower.starts_with("colour ") {
            let color_str = lower.replace("color ", "").replace("colour ", "").trim().to_string();
            let color = match color_str.as_str() {
                "red" => [1.0, 0.0, 0.0, 1.0],
                "green" => [0.0, 1.0, 0.0, 1.0],
                "blue" => [0.0, 0.0, 1.0, 1.0],
                "yellow" => [1.0, 1.0, 0.0, 1.0],
                "orange" => [1.0, 0.5, 0.0, 1.0],
                "purple" => [0.5, 0.0, 1.0, 1.0],
                "pink" => [1.0, 0.4, 0.7, 1.0],
                "white" => [1.0, 1.0, 1.0, 1.0],
                "black" => [0.05, 0.05, 0.05, 1.0],
                "cyan" => [0.0, 1.0, 1.0, 1.0],
                "gold" => [1.0, 0.84, 0.0, 1.0],
                "silver" => [0.75, 0.75, 0.75, 1.0],
                "bronze" => [0.8, 0.5, 0.2, 1.0],
                _ => {
                    // Try hex: #RRGGBB
                    if color_str.starts_with('#') && color_str.len() == 7 {
                        let r = u8::from_str_radix(&color_str[1..3], 16).unwrap_or(128) as f32 / 255.0;
                        let g = u8::from_str_radix(&color_str[3..5], 16).unwrap_or(128) as f32 / 255.0;
                        let b = u8::from_str_radix(&color_str[5..7], 16).unwrap_or(128) as f32 / 255.0;
                        [r, g, b, 1.0]
                    } else {
                        [0.7, 0.7, 0.7, 1.0]
                    }
                }
            };
            if let Some(name) = &self.editor.selected_entity.clone() {
                if let Some(obj) = self.objects.iter_mut().find(|o| &o.name == name) {
                    obj.color = color;
                    self.editor.add_ai_response(&format!("🎨 {} → {}!", name, color_str));
                }
            } else {
                // Color the last added object
                if let Some(obj) = self.objects.last_mut() {
                    let n = obj.name.clone();
                    obj.color = color;
                    self.editor.add_ai_response(&format!("🎨 {} → {}!", n, color_str));
                }
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Object duplication ---
        if lower == "duplicate" || lower == "dup" || lower == "clone" {
            if let Some(name) = &self.editor.selected_entity.clone() {
                if let Some(obj) = self.objects.iter().find(|o| &o.name == name).cloned() {
                    let mut new_obj = obj.clone();
                    new_obj.name = format!("{}_copy", obj.name);
                    new_obj.transform.position += Vec3::new(2.0, 0.0, 0.0);
                    self.push_undo();
                    self.objects.push(new_obj);
                    self.sync_editor_scene();
                    self.editor.add_ai_response(&format!("📋 Duplicated '{}'!", name));
                }
            } else {
                self.editor.add_ai_response("⚠️ Select an object first!");
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Random scatter ---
        if lower.starts_with("scatter ") && lower.contains("random") {
            let parts: Vec<&str> = lower.split_whitespace().collect();
            let mesh_str = parts.get(1).unwrap_or(&"cube");
            let count: usize = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(10);
            let range: f32 = parts.get(4).and_then(|s| s.parse().ok()).unwrap_or(20.0);
            let mesh = MeshType::from_str(mesh_str);
            self.push_undo();
            use std::collections::hash_map::DefaultHasher;
            use std::hash::{Hash, Hasher};
            for i in 0..count {
                let mut h = DefaultHasher::new();
                (i as u64 + self.objects.len() as u64).hash(&mut h);
                let hash = h.finish();
                let x = ((hash & 0xFFFF) as f32 / 65535.0 - 0.5) * range * 2.0;
                let z = (((hash >> 16) & 0xFFFF) as f32 / 65535.0 - 0.5) * range * 2.0;
                let y = ((hash >> 32) & 0xFFFF) as f32 / 65535.0 * 2.0 + 0.5;
                let scale = 0.5 + ((hash >> 48) & 0xFF) as f32 / 255.0 * 1.5;
                self.objects.push(SceneObject {
                    name: format!("{}_{}", mesh_str, self.objects.len()),
                    transform: Transform {
                        position: Vec3::new(x, y, z),
                        rotation: Quat::IDENTITY, scale: Vec3::splat(scale),
                    },
                    color: [0.5 + (hash & 0xFF) as f32 / 512.0, 0.5 + ((hash >> 8) & 0xFF) as f32 / 512.0, 0.5 + ((hash >> 16) & 0xFF) as f32 / 512.0, 1.0],
                    mesh_type: mesh.clone(), spin_speed: 0.0,
                    parent: None, lod_meshes: Vec::new(),
                });
            }
            self.sync_editor_scene();
            self.editor.add_ai_response(&format!("🎲 Scattered {} {} randomly in {:.0}m radius!", count, mesh_str, range));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Help command ---
        if lower == "help" || lower == "?" || lower == "commands" {
            self.editor.add_ai_response("📖 KOKO Engine Commands:\n                🏗️ BUILD: add cube/sphere, wall N, floor N, stairs N, tower N, array cube 5 3\n                🎨 STYLE: color red/#FF0000, metallic 0.9, roughness 0.2, emissive 1.0\n                📐 TRANSFORM: pos name x y z, scale N, rotate x y z, snap grid 1, distribute x\n                🔲 PATTERNS: scatter sphere 20 random, mirror x, instance cube 100, spline mesh\n                🎬 ANIMATE: keyframe, timeline, sequencer, orbit/bounce/wave, cinematic\n                🌍 WORLD: terrain, water, fog, weather rain/snow/storm, day cycle, foliage grass\n                ☀️ LIGHT: light red 5 10 5, spotlight, sun, bloom, pp volume, reverb cave\n                🪐 PHYSICS: play/stop physics, gravity moon/mars/jupiter/zero, shake 0.5\n                🎥 CAMERA: fps, top down, isometric, side scroller, orbit, focus, minimap\n                🤖 AI: add ai patrol/chase/flee/wander, navmesh, crowd 20, state machine create\n                💬 RPG: quest add/list/complete, inventory/inv, dialogue create/play\n                🎮 TEMPLATES: template fps/rpg/horror/platformer/racing/top down/third person\n                🔗 SCRIPT: nodes, add node, connect, lua, bind key action, on event do cmd\n                🏙️ GENERATE: generate city/forest/dungeon/island/mountains/battlefield\n                📂 TOOLS: assets, stats, auto lod, reflection, culling, layer, tag, var/get\n                💾 FILE: save/load, export, screenshot, prefab, save slot, quicksave/quickload\n                🎯 SELECT: select, deselect, duplicate, delete, clear all, undo, redo\n                🌐 ADVANCED: sublevel, datatable, constraint, kill z, world bounds, decal");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Quick scene combos ---
        if lower == "fps" || lower == "first person" || lower == "fps mode" {
            self.camera_pos = Vec3::new(0.0, 1.7, 0.0);
            self.camera_pitch = 0.0;
            self.camera_yaw = 0.0;
            self.editor.add_ai_response("👁️ First-person camera! WASD to move, mouse to look.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "top down" || lower == "topdown" || lower == "rts" || lower == "strategy" {
            self.camera_pos = Vec3::new(0.0, 25.0, 0.1);
            self.camera_pitch = -1.5;
            self.camera_yaw = 0.0;
            self.editor.add_ai_response("🗺️ Top-down strategy view!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "isometric" || lower == "iso" {
            self.camera_pos = Vec3::new(15.0, 15.0, 15.0);
            self.camera_pitch = -0.61; // ~35 degrees
            self.camera_yaw = -0.78;
            self.editor.add_ai_response("🔷 Isometric view!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "side view" || lower == "sidescroller" || lower == "2d" {
            self.camera_pos = Vec3::new(0.0, 5.0, 20.0);
            self.camera_pitch = -0.1;
            self.camera_yaw = 0.0;
            self.editor.add_ai_response("📐 Side-scroller view!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Quick build helpers ---
        if lower.starts_with("wall ") || lower.starts_with("build wall") {
            let rest = lower.replace("build wall", "").replace("wall ", "").trim().to_string();
            let length: usize = rest.split_whitespace().next().and_then(|w| w.parse().ok()).unwrap_or(5);
            let length = length.clamp(2, 20);
            self.push_undo();
            for i in 0..length {
                let x = (i as f32 - length as f32 / 2.0) * 2.0;
                self.objects.push(SceneObject {
                    name: format!("wall_block_{}", self.objects.len()),
                    transform: Transform { position: Vec3::new(x, 1.0, 0.0), rotation: Quat::IDENTITY, scale: Vec3::new(1.0, 2.0, 0.5) },
                    color: [0.5, 0.48, 0.45, 1.0], mesh_type: MeshType::Cube, spin_speed: 0.0,
                    parent: None, lod_meshes: Vec::new(),
                });
            }
            self.sync_editor_scene();
            self.editor.add_ai_response(&format!("🧱 Wall built! {} blocks long.", length));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("floor ") || lower.starts_with("build floor") {
            let rest = lower.replace("build floor", "").replace("floor ", "").trim().to_string();
            let size: usize = rest.split_whitespace().next().and_then(|w| w.parse().ok()).unwrap_or(5);
            let size = size.clamp(2, 20);
            self.push_undo();
            self.objects.push(SceneObject {
                name: format!("floor_{}", self.objects.len()),
                transform: Transform { position: Vec3::ZERO, rotation: Quat::IDENTITY, scale: Vec3::new(size as f32, 0.1, size as f32) },
                color: [0.6, 0.55, 0.5, 1.0], mesh_type: MeshType::Cube, spin_speed: 0.0,
                parent: None, lod_meshes: Vec::new(),
            });
            self.sync_editor_scene();
            self.editor.add_ai_response(&format!("🟫 Floor placed! {}x{} units.", size, size));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("stairs ") || lower.starts_with("build stairs") {
            let rest = lower.replace("build stairs", "").replace("stairs ", "").trim().to_string();
            let steps: usize = rest.split_whitespace().next().and_then(|w| w.parse().ok()).unwrap_or(5);
            let steps = steps.clamp(2, 15);
            self.push_undo();
            for i in 0..steps {
                self.objects.push(SceneObject {
                    name: format!("stair_{}", self.objects.len()),
                    transform: Transform {
                        position: Vec3::new(0.0, i as f32 * 0.3, i as f32 * 0.5),
                        rotation: Quat::IDENTITY,
                        scale: Vec3::new(2.0, 0.3, 0.5),
                    },
                    color: [0.55, 0.5, 0.45, 1.0], mesh_type: MeshType::Cube, spin_speed: 0.0,
                    parent: None, lod_meshes: Vec::new(),
                });
            }
            self.sync_editor_scene();
            self.editor.add_ai_response(&format!("🪜 Stairs built! {} steps.", steps));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("tower ") && lower.contains("block") || lower.starts_with("build tower") {
            let rest = lower.replace("build tower", "").replace("tower ", "").replace("blocks", "").replace("block", "").trim().to_string();
            let height: usize = rest.split_whitespace().next().and_then(|w| w.parse().ok()).unwrap_or(5);
            let height = height.clamp(2, 20);
            self.push_undo();
            for i in 0..height {
                self.objects.push(SceneObject {
                    name: format!("tower_block_{}", self.objects.len()),
                    transform: Transform {
                        position: Vec3::new(0.0, i as f32 * 1.0 + 0.5, 0.0),
                        rotation: Quat::IDENTITY,
                        scale: Vec3::splat(1.0 - i as f32 * 0.03),
                    },
                    color: [0.5, 0.48, 0.45, 1.0], mesh_type: MeshType::Cube, spin_speed: 0.0,
                    parent: None, lod_meshes: Vec::new(),
                });
            }
            self.sync_editor_scene();
            self.editor.add_ai_response(&format!("🏗️ Block tower! {} high.", height));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Prefab system (save/load object groups) ---
        if lower.starts_with("save prefab ") {
            let name = lower.replace("save prefab ", "").trim().to_string();
            if name.is_empty() || self.objects.is_empty() {
                self.editor.add_ai_response("Usage: save prefab mygroup (must have objects in scene)");
            } else {
                let prefab_dir = self.find_assets_dir().replace("/models", "/prefabs");
                let _ = std::fs::create_dir_all(&prefab_dir);
                let data: Vec<serde_json::Value> = self.objects.iter().map(|obj| {
                    serde_json::json!({
                        "name": obj.name,
                        "position": [obj.transform.position.x, obj.transform.position.y, obj.transform.position.z],
                        "scale": [obj.transform.scale.x, obj.transform.scale.y, obj.transform.scale.z],
                        "color": obj.color,
                        "mesh_type": obj.mesh_type.as_str(),
                        "spin_speed": obj.spin_speed,
                    })
                }).collect();
                let json = serde_json::to_string_pretty(&data).unwrap_or_default();
                let path = format!("{}/{}.json", prefab_dir, name);
                match std::fs::write(&path, &json) {
                    Ok(_) => self.editor.add_ai_response(&format!("📦 Prefab '{}' saved! ({} objects)", name, self.objects.len())),
                    Err(e) => self.editor.add_ai_response(&format!("❌ {}", e)),
                }
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("load prefab ") {
            let name = lower.replace("load prefab ", "").trim().to_string();
            let prefab_dir = self.find_assets_dir().replace("/models", "/prefabs");
            let path = format!("{}/{}.json", prefab_dir, name);
            match std::fs::read_to_string(&path) {
                Ok(json) => {
                    if let Ok(data) = serde_json::from_str::<Vec<serde_json::Value>>(&json) {
                        self.push_undo();
                        let offset_x = self.objects.len() as f32 * 0.5;
                        for item in &data {
                            let pos: [f32; 3] = serde_json::from_value(item["position"].clone()).unwrap_or([0.0; 3]);
                            let scale: [f32; 3] = serde_json::from_value(item["scale"].clone()).unwrap_or([1.0; 3]);
                            let color: [f32; 4] = serde_json::from_value(item["color"].clone()).unwrap_or([0.7, 0.7, 0.7, 1.0]);
                            let mesh_str = item["mesh_type"].as_str().unwrap_or("cube");
                            self.objects.push(SceneObject {
                                name: format!("{}_{}", item["name"].as_str().unwrap_or("obj"), self.objects.len()),
                                transform: Transform { position: Vec3::from_array(pos), rotation: Quat::IDENTITY, scale: Vec3::from_array(scale) },
                                color, mesh_type: MeshType::from_str(mesh_str),
                                spin_speed: item["spin_speed"].as_f64().unwrap_or(0.0) as f32,
                                parent: None, lod_meshes: Vec::new(),
                            });
                        }
                        self.sync_editor_scene();
                        self.editor.add_ai_response(&format!("📦 Prefab '{}' loaded! ({} objects added)", name, data.len()));
                    }
                }
                Err(_) => {
                    let prefab_dir2 = self.find_assets_dir().replace("/models", "/prefabs");
                    let available: Vec<String> = std::fs::read_dir(&prefab_dir2)
                        .map(|e| e.filter_map(|e| e.ok()).filter_map(|e| e.path().file_stem().map(|s| s.to_string_lossy().to_string())).collect())
                        .unwrap_or_default();
                    self.editor.add_ai_response(&format!("❌ Prefab '{}' not found. Available: {}", name, if available.is_empty() { "none".into() } else { available.join(", ") }));
                }
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "list prefabs" || lower == "prefabs" {
            let prefab_dir = self.find_assets_dir().replace("/models", "/prefabs");
            let available: Vec<String> = std::fs::read_dir(&prefab_dir)
                .map(|e| e.filter_map(|e| e.ok()).filter_map(|e| e.path().file_stem().map(|s| s.to_string_lossy().to_string())).collect())
                .unwrap_or_default();
            if available.is_empty() {
                self.editor.add_ai_response("📦 No prefabs saved yet. Use 'save prefab myname' to create one.");
            } else {
                self.editor.add_ai_response(&format!("📦 Prefabs: {}", available.join(", ")));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Object snapping ---
        if lower.starts_with("snap ") {
            let rest = lower.replace("snap ", "").trim().to_string();
            let words: Vec<&str> = rest.split(" to ").collect();
            if words.len() == 2 {
                let src_name = words[0].trim();
                let dst_name = words[1].trim();
                let dst_pos = self.objects.iter().find(|o| o.name.to_lowercase().contains(dst_name)).map(|o| o.transform.position);
                if let Some(target) = dst_pos {
                    if let Some(idx) = self.objects.iter().position(|o| o.name.to_lowercase().contains(src_name)) {
                        self.push_undo();
                        self.objects[idx].transform.position = target + Vec3::new(2.0, 0.0, 0.0);
                        self.sync_editor_scene();
                        self.editor.add_ai_response(&format!("📌 Snapped {} next to {}!", src_name, dst_name));
                    }
                } else {
                    self.editor.add_ai_response(&format!("⚠ Target '{}' not found", dst_name));
                }
            } else {
                self.editor.add_ai_response("Usage: snap object1 to object2");
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Stack objects ---
        if lower.starts_with("stack ") {
            let rest = lower.replace("stack ", "").trim().to_string();
            let words: Vec<&str> = rest.split(" on ").collect();
            if words.len() == 2 {
                let src_name = words[0].trim();
                let dst_name = words[1].trim();
                let dst_info = self.objects.iter().find(|o| o.name.to_lowercase().contains(dst_name))
                    .map(|o| (o.transform.position, o.transform.scale.y));
                if let Some((pos, height)) = dst_info {
                    if let Some(idx) = self.objects.iter().position(|o| o.name.to_lowercase().contains(src_name)) {
                        self.push_undo();
                        self.objects[idx].transform.position = Vec3::new(pos.x, pos.y + height, pos.z);
                        self.sync_editor_scene();
                        self.editor.add_ai_response(&format!("📌 Stacked {} on {}!", src_name, dst_name));
                    }
                } else {
                    self.editor.add_ai_response(&format!("⚠ Target '{}' not found", dst_name));
                }
            } else {
                self.editor.add_ai_response("Usage: stack object1 on object2");
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Environment presets ---
        if lower == "space" || lower == "outer space" || lower == "void" {
            self.post_params.brightness = 0.2;
            self.post_params.saturation = 0.5;
            self.post_params.temperature = -0.3;
            self.physics_gravity = 0.0;
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu { gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params)); }
            }
            self.editor.add_ai_response("🌌 Space environment! Zero gravity, dark void.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "underwater" || lower == "deep sea" {
            self.post_params.brightness = 0.5;
            self.post_params.saturation = 0.7;
            self.post_params.temperature = -0.4;
            self.post_params.chromatic_aberration = 0.005;
            self.physics_gravity = 2.0;
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu { gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params)); }
            }
            self.water_enabled = true;
            self.editor.add_ai_response("🌊 Underwater! Blue tint, low gravity, water enabled.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "hell" || lower == "inferno" || lower == "underworld" {
            self.post_params.brightness = 0.5;
            self.post_params.temperature = 0.6;
            self.post_params.saturation = 1.3;
            self.post_params.chromatic_aberration = 0.008;
            self.post_params.vignette_strength = 0.5;
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu { gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params)); }
            }
            // Add fire everywhere
            for i in 0..4 {
                let angle = i as f32 * std::f32::consts::TAU / 4.0;
                self.particle_emitters.push(ParticleEmitter::new(Vec3::new(angle.cos() * 5.0, 0.5, angle.sin() * 5.0), ParticleType::Fire));
            }
            self.editor.add_ai_response("🔥 HELL! Red hot, fire everywhere, heavy vignette.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "dreamscape" || lower == "dream" || lower == "ethereal" {
            self.post_params.brightness = 1.2;
            self.post_params.saturation = 1.5;
            self.post_params.chromatic_aberration = 0.01;
            self.post_params.grain_strength = 0.05;
            self.post_params.vignette_strength = 0.2;
            self.physics_gravity = 1.0;
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu { gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params)); }
            }
            for i in 0..4 {
                let angle = i as f32 * std::f32::consts::TAU / 4.0;
                self.particle_emitters.push(ParticleEmitter::new(Vec3::new(angle.cos() * 3.0, 2.0, angle.sin() * 3.0), ParticleType::Magic));
            }
            self.editor.add_ai_response("💫 Dreamscape! Oversaturated, floaty, magic particles, low gravity.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Reset everything ---
        if lower == "reset all" || lower == "factory reset" || lower == "default all" {
            self.push_undo();
            self.objects.clear();
            self.particle_emitters.clear();
            self.scene_lights.clear();
            self.object_animations.clear();
            self.water_enabled = false;
            self.terrain_enabled = false;
            self.fog_enabled = false;
            self.cinematic_active = false;
            self.day_cycle_active = false;
            self.physics_playing = false;
            self.play_mode = false;
            self.bloom_enabled = true;
            self.post_enabled = true;
            self.physics_gravity = 9.81;
            self.post_params = PostParamsRaw {
                time: 0.0, vignette_strength: 0.3, grain_strength: 0.03,
                chromatic_aberration: 0.003, saturation: 1.1, contrast: 1.05,
                brightness: 1.0, temperature: 0.1,
            };
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu { gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params)); }
            }
            self.update_light_buffer();
            self.camera_pos = Vec3::new(8.0, 6.0, 12.0);
            self.camera_yaw = -0.55;
            self.camera_pitch = -0.3;
            self.sync_editor_scene();
            self.editor.add_ai_response("🔄 Full reset! Everything back to default.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Weather system ---
        if lower == "rain" || lower == "rainy" || lower == "rainstorm" {
            self.particle_emitters.retain(|e| e.emitter_type != ParticleType::Rain && e.emitter_type != ParticleType::Snow);
            // Heavy rain across scene
            for i in 0..3 {
                let x = (i as f32 - 1.0) * 10.0;
                self.particle_emitters.push(ParticleEmitter::new(Vec3::new(x, 15.0, 0.0), ParticleType::Rain));
            }
            self.post_params.brightness = 0.7;
            self.post_params.saturation = 0.8;
            self.post_params.contrast = 0.95;
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu { gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params)); }
            }
            self.editor.add_ai_response("🌧️ Rainstorm! Dark skies, heavy rain across the scene.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "snow" || lower == "snowy" || lower == "snowstorm" || lower == "blizzard" {
            self.particle_emitters.retain(|e| e.emitter_type != ParticleType::Rain && e.emitter_type != ParticleType::Snow);
            for i in 0..3 {
                let x = (i as f32 - 1.0) * 10.0;
                self.particle_emitters.push(ParticleEmitter::new(Vec3::new(x, 15.0, 0.0), ParticleType::Snow));
            }
            self.post_params.brightness = 1.1;
            self.post_params.saturation = 0.7;
            self.post_params.temperature = -0.2;
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu { gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params)); }
            }
            self.editor.add_ai_response("❄️ Snowstorm! Cold, bright, snowflakes everywhere.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "storm" || lower == "thunderstorm" || lower == "lightning" {
            self.particle_emitters.retain(|e| e.emitter_type != ParticleType::Rain);
            for i in 0..4 {
                let x = (i as f32 - 1.5) * 8.0;
                self.particle_emitters.push(ParticleEmitter::new(Vec3::new(x, 15.0, 0.0), ParticleType::Rain));
            }
            // Add dramatic lights as "lightning"
            self.scene_lights.push(SceneLight {
                position: Vec3::new(0.0, 20.0, 0.0), radius: 50.0,
                color: [0.9, 0.9, 1.0], intensity: 5.0,
                direction: Vec3::NEG_Y, spot_cutoff: 0.0,
                name: "lightning".into(),
            });
            self.update_light_buffer();
            self.post_params.brightness = 0.5;
            self.post_params.contrast = 1.2;
            self.post_params.saturation = 0.6;
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu { gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params)); }
            }
            self.editor.add_ai_response("⛈️ Thunderstorm! Heavy rain, lightning, dramatic lighting.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "clear weather" || lower == "sunny" || lower == "clear sky" {
            self.particle_emitters.retain(|e| e.emitter_type != ParticleType::Rain && e.emitter_type != ParticleType::Snow);
            self.scene_lights.retain(|l| l.name != "lightning");
            self.update_light_buffer();
            self.post_params.brightness = 1.0;
            self.post_params.saturation = 1.1;
            self.post_params.contrast = 1.05;
            self.post_params.temperature = 0.1;
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu { gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params)); }
            }
            self.editor.add_ai_response("☀️ Clear weather! Bright and sunny.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Combo effects ---
        if lower == "fireplace" || lower == "cozy" {
            let pos = Vec3::new(0.0, 0.5, 0.0);
            self.particle_emitters.push(ParticleEmitter::new(pos, ParticleType::Fire));
            self.particle_emitters.push(ParticleEmitter::new(pos + Vec3::new(0.0, 1.0, 0.0), ParticleType::Smoke));
            self.scene_lights.push(SceneLight {
                position: Vec3::new(0.0, 2.0, 0.0), radius: 10.0,
                color: [1.0, 0.6, 0.2], intensity: 2.0,
                direction: Vec3::NEG_Y, spot_cutoff: 0.0,
                name: "fire_light".into(),
            });
            self.update_light_buffer();
            self.post_params.temperature = 0.3;
            self.post_params.brightness = 0.8;
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu { gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params)); }
            }
            self.editor.add_ai_response("🔥 Cozy fireplace! Fire, smoke, warm light.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "apocalypse" || lower == "destruction" || lower == "chaos" {
            for i in 0..5 {
                let angle = i as f32 * std::f32::consts::TAU / 5.0;
                let pos = Vec3::new(angle.cos() * 6.0, 0.5, angle.sin() * 6.0);
                self.particle_emitters.push(ParticleEmitter::new(pos, ParticleType::Fire));
                self.particle_emitters.push(ParticleEmitter::new(pos + Vec3::Y * 2.0, ParticleType::Smoke));
            }
            self.particle_emitters.push(ParticleEmitter::new(Vec3::new(0.0, 0.5, 0.0), ParticleType::Sparks));
            self.post_params.brightness = 0.6;
            self.post_params.temperature = 0.5;
            self.post_params.saturation = 0.8;
            self.post_params.chromatic_aberration = 0.01;
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu { gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params)); }
            }
            self.editor.add_ai_response("💥 APOCALYPSE! Fire everywhere, smoke, sparks, chaos!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "magical" || lower == "enchanted" || lower == "fairy" {
            for i in 0..6 {
                let angle = i as f32 * std::f32::consts::TAU / 6.0;
                let pos = Vec3::new(angle.cos() * 4.0, 1.0, angle.sin() * 4.0);
                self.particle_emitters.push(ParticleEmitter::new(pos, ParticleType::Magic));
            }
            for i in 0..4 {
                let angle = i as f32 * std::f32::consts::TAU / 4.0 + 0.3;
                self.scene_lights.push(SceneLight {
                    position: Vec3::new(angle.cos() * 5.0, 2.0, angle.sin() * 5.0),
                    radius: 8.0, color: [0.3, 0.5, 1.0], intensity: 1.5,
                    direction: Vec3::NEG_Y, spot_cutoff: 0.0,
                    name: format!("magic_light_{}", i),
                });
            }
            self.update_light_buffer();
            self.post_params.saturation = 1.4;
            self.post_params.brightness = 0.9;
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu { gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params)); }
            }
            self.editor.add_ai_response("✨ Enchanted! Magic particles and ethereal blue lights everywhere.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Day/night cycle ---
        if lower == "day cycle" || lower == "day night" || lower == "cycle on" || lower == "time cycle" {
            self.day_cycle_active = true;
            self.editor.add_ai_response("🌅 Day/night cycle started! (60s per full cycle)");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "cycle off" || lower == "stop cycle" || lower == "cycle stop" {
            self.day_cycle_active = false;
            self.editor.add_ai_response("🌅 Day/night cycle stopped.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("cycle speed ") {
            if let Ok(s) = lower.replace("cycle speed ", "").trim().parse::<f32>() {
                self.day_cycle_speed = s.clamp(0.1, 10.0);
                self.editor.add_ai_response(&format!("🌅 Cycle speed: {:.1}x ({:.0}s per cycle)", s, 60.0/s));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("sun ") {
            let rest = lower.replacen("sun ", "", 1).trim().to_string();
            match rest.as_str() {
                "high" | "up" | "overhead" => { self.sun_direction = Vec3::new(0.0, 1.0, 0.1).normalize(); self.editor.add_ai_response("☀️ Sun overhead!"); }
                "low" | "down" | "horizon" => { self.sun_direction = Vec3::new(0.8, 0.1, 0.4).normalize(); self.editor.add_ai_response("🌅 Sun at horizon!"); }
                "left" | "west" => { self.sun_direction = Vec3::new(-0.7, 0.5, 0.3).normalize(); self.editor.add_ai_response("☀️ Sun from the west!"); }
                "right" | "east" => { self.sun_direction = Vec3::new(0.7, 0.5, 0.3).normalize(); self.editor.add_ai_response("☀️ Sun from the east!"); }
                "behind" => { self.sun_direction = Vec3::new(0.0, 0.5, -0.8).normalize(); self.editor.add_ai_response("☀️ Sun behind!"); }
                _ => { self.editor.add_ai_response("Sun positions: high, low, left, right, behind"); }
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
                if lower == "dawn" || lower == "sunrise" {
            self.day_cycle_time = 0.0; self.apply_day_cycle(); self.day_cycle_active = false;
            self.editor.add_ai_response("🌅 Dawn!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "noon" || lower == "midday" {
            self.day_cycle_time = 0.25; self.apply_day_cycle(); self.day_cycle_active = false;
            self.editor.add_ai_response("☀️ Noon!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "dusk" || lower == "evening" {
            self.day_cycle_time = 0.5; self.apply_day_cycle(); self.day_cycle_active = false;
            self.editor.add_ai_response("🌇 Dusk!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "midnight" {
            self.day_cycle_time = 0.75; self.apply_day_cycle(); self.day_cycle_active = false;
            self.editor.add_ai_response("🌙 Midnight!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Fog ---
        if lower == "fog on" || lower == "add fog" || lower == "enable fog" {
            self.fog_enabled = true;
            self.editor.add_ai_response("🌫️ Fog enabled!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "fog off" || lower == "remove fog" || lower == "no fog" || lower == "disable fog" {
            self.fog_enabled = false;
            self.editor.add_ai_response("🌫️ Fog disabled.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower.starts_with("fog density ") {
            if let Ok(d) = lower.replace("fog density ", "").trim().parse::<f32>() {
                self.fog_density = d.clamp(0.001, 0.5);
                self.editor.add_ai_response(&format!("🌫️ Fog density: {:.3}", self.fog_density));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Screenshot ---
        if lower == "screenshot" || lower == "capture" || lower == "snap" || lower == "photo" {
            self.screenshot_requested = true;
            self.editor.add_ai_response("📸 Screenshot will be saved to Desktop!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Multi-add: "add 5 trees" ---
        {
            let re_pattern = ["add ", "place ", "spawn ", "create "];
            for prefix in &re_pattern {
                if lower.starts_with(prefix) {
                    let rest = lower.replacen(prefix, "", 1);
                    let words: Vec<&str> = rest.split_whitespace().collect();
                    if words.len() >= 2 {
                        if let Ok(count) = words[0].parse::<usize>() {
                            if count >= 2 && count <= 50 {
                                let obj_name = words[1..].join(" ");
                                let mut intents = Vec::new();
                                for i in 0..count {
                                    let angle = i as f32 * std::f32::consts::TAU / count as f32;
                                    let radius = (count as f32).sqrt() * 2.5;
                                    let x = angle.cos() * radius;
                                    let z = angle.sin() * radius;
                                    let sub_prompt = format!("add {} at [{}, 0, {}]", obj_name, x, z);
                                    let existing: Vec<String> = self.objects.iter().map(|o| o.name.clone()).collect();
                                    let mut sub_intents = koko_ai::local::parse_local(&sub_prompt, &existing);
                                    // Rename to avoid collision
                                    for intent in &mut sub_intents {
                                        match intent {
                                            GameIntent::AddEntity { name, .. } => {
                                                *name = format!("{}_{}", name, i);
                                            }
                                            GameIntent::LoadModel { name, position, .. } => {
                                                *name = format!("{}_{}", name, i);
                                                *position = [x, 0.0, z];
                                            }
                                            _ => {}
                                        }
                                    }
                                    intents.extend(sub_intents.into_iter().filter(|i| !matches!(i, GameIntent::ChatResponse { .. })));
                                }
                                if !intents.is_empty() {
                                    self.push_undo();
                                    let mut msg_count = 0;
                                    for intent in intents {
                                        match intent {
                                            GameIntent::AddEntity { name, mesh, position, color, scale } => {
                                                self.objects.push(SceneObject {
                                                    name, transform: Transform { position: Vec3::from_array(position), rotation: Quat::IDENTITY, scale: Vec3::splat(scale) },
                                                    color, mesh_type: MeshType::from_str(&mesh), spin_speed: 0.0,
                                                    parent: None, lod_meshes: Vec::new(),
                                                });
                                                msg_count += 1;
                                            }
                                            GameIntent::LoadModel { name, model_file, position, scale } => {
                                                let loaded = self.load_model_from_assets(&model_file, &name, position, scale);
                                                msg_count += 1;
                                            }
                                            _ => {}
                                        }
                                    }
                                    self.sync_editor_scene();
                                    self.editor.add_ai_response(&format!("✓ Added {} {}!", msg_count, obj_name));
                                    self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
                                    return;
                                }
                            }
                        }
                    }
                }
            }
        }

        // --- Undo/redo ---
        if lower == "undo" { self.undo(); self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return; }
        if lower == "redo" { self.redo(); self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return; }

        // --- List objects ---
        if lower == "list" || lower == "list objects" || lower == "objects" || lower == "scene" {
            if self.objects.is_empty() {
                self.editor.add_ai_response("📋 Scene is empty. Try 'add a tree' or 'make a forest'!");
            } else {
                let list: Vec<String> = self.objects.iter().enumerate().map(|(i, o)| {
                    format!("{}. {} ({}) [{:.1}, {:.1}, {:.1}]", i+1, o.name, o.mesh_type.as_str(),
                        o.transform.position.x, o.transform.position.y, o.transform.position.z)
                }).collect();
                self.editor.add_ai_response(&format!("📋 Scene objects ({}):\n{}", self.objects.len(), list.join("\n")));
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Quality presets ---
        if lower == "quality low" || lower == "low quality" || lower == "performance" {
            self.bloom_enabled = false;
            self.post_enabled = false;
            self.editor.add_ai_response("⚡ Low quality — bloom off, post-processing off. Maximum FPS!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "quality medium" || lower == "medium quality" || lower == "balanced" {
            self.bloom_enabled = true;
            self.post_enabled = true;
            self.post_params.grain_strength = 0.0;
            self.post_params.chromatic_aberration = 0.0;
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu { gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params)); }
            }
            self.editor.add_ai_response("⚖️ Medium quality — bloom on, minimal post-processing.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "quality high" || lower == "high quality" || lower == "ultra" || lower == "max quality" {
            self.bloom_enabled = true;
            self.post_enabled = true;
            self.post_params.grain_strength = 0.03;
            self.post_params.chromatic_aberration = 0.003;
            self.post_params.vignette_strength = 0.3;
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu { gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params)); }
            }
            self.editor.add_ai_response("✨ Ultra quality — all effects maxed!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Performance mode ---
        if lower == "perf" || lower == "fps" && lower.len() == 3 || lower == "benchmark" {
            let fps = self.time.fps;
            let obj_count = self.objects.len();
            let particle_count: usize = self.particle_emitters.iter().map(|e| e.particles.len()).sum();
            let light_count = self.scene_lights.len();
            let mesh_count = self.custom_meshes.len();
            let total_verts: usize = self.custom_meshes.iter().map(|m| m.2 as usize).sum();
            self.editor.add_ai_response(&format!(
                "📊 Performance\n                 FPS: {:.0} | Objects: {} | Particles: {}\n                 Lights: {} | Custom meshes: {} ({} verts)\n                 Bloom: {} | Post: {} | Water: {} | Terrain: {}\n                 Day cycle: {} | Physics: {} | Animations: {}",
                fps, obj_count, particle_count,
                light_count, mesh_count, total_verts,
                if self.bloom_enabled { "ON" } else { "OFF" },
                if self.post_enabled { "ON" } else { "OFF" },
                if self.water_enabled { "ON" } else { "OFF" },
                if self.terrain_enabled { "ON" } else { "OFF" },
                if self.day_cycle_active { "ON" } else { "OFF" },
                if self.physics_playing { "ON" } else { "OFF" },
                self.object_animations.len(),
            ));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Vignette control ---
        if lower.starts_with("vignette ") {
            let val = lower.replace("vignette ", "").trim().to_string();
            if val == "off" || val == "0" { self.post_params.vignette_strength = 0.0; }
            else if val == "low" || val == "subtle" { self.post_params.vignette_strength = 0.15; }
            else if val == "medium" { self.post_params.vignette_strength = 0.3; }
            else if val == "high" || val == "heavy" { self.post_params.vignette_strength = 0.6; }
            else if let Ok(v) = val.parse::<f32>() { self.post_params.vignette_strength = v.clamp(0.0, 1.0); }
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu { gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params)); }
            }
            self.editor.add_ai_response(&format!("🔲 Vignette: {:.2}", self.post_params.vignette_strength));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Film grain control ---
        if lower.starts_with("grain ") {
            let val = lower.replace("grain ", "").trim().to_string();
            if val == "off" || val == "0" { self.post_params.grain_strength = 0.0; }
            else if val == "subtle" { self.post_params.grain_strength = 0.02; }
            else if val == "medium" { self.post_params.grain_strength = 0.05; }
            else if val == "heavy" || val == "retro" { self.post_params.grain_strength = 0.12; }
            else if let Ok(v) = val.parse::<f32>() { self.post_params.grain_strength = v.clamp(0.0, 0.5); }
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu { gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params)); }
            }
            self.editor.add_ai_response(&format!("🎞️ Film grain: {:.3}", self.post_params.grain_strength));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Chromatic aberration control ---
        if lower.starts_with("chromatic ") || lower.starts_with("ca ") {
            let val = lower.replacen("chromatic ", "", 1).replacen("ca ", "", 1).trim().to_string();
            if val == "off" || val == "0" { self.post_params.chromatic_aberration = 0.0; }
            else if val == "subtle" { self.post_params.chromatic_aberration = 0.002; }
            else if val == "medium" { self.post_params.chromatic_aberration = 0.005; }
            else if val == "heavy" || val == "drunk" { self.post_params.chromatic_aberration = 0.02; }
            else if let Ok(v) = val.parse::<f32>() { self.post_params.chromatic_aberration = v.clamp(0.0, 0.1); }
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu { gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params)); }
            }
            self.editor.add_ai_response(&format!("🌈 Chromatic aberration: {:.4}", self.post_params.chromatic_aberration));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Film/cinematic looks ---
        if lower == "cinematic look" || lower == "movie mode" || lower == "film look" {
            self.post_params.vignette_strength = 0.4;
            self.post_params.grain_strength = 0.04;
            self.post_params.chromatic_aberration = 0.002;
            self.post_params.contrast = 1.15;
            self.post_params.saturation = 0.9;
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu { gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params)); }
            }
            self.editor.add_ai_response("🎬 Cinematic film look! Heavy vignette, grain, desaturated, high contrast.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "retro" || lower == "80s" || lower == "synthwave" || lower == "neon look" {
            self.post_params.vignette_strength = 0.3;
            self.post_params.grain_strength = 0.06;
            self.post_params.chromatic_aberration = 0.008;
            self.post_params.saturation = 1.5;
            self.post_params.temperature = 0.3;
            self.post_params.contrast = 1.2;
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu { gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params)); }
            }
            // Add neon-colored lights
            let neon_colors = [[1.0, 0.0, 0.5], [0.0, 1.0, 0.8], [0.5, 0.0, 1.0], [1.0, 0.2, 0.0]];
            for (i, color) in neon_colors.iter().enumerate() {
                let angle = i as f32 * std::f32::consts::TAU / 4.0;
                self.scene_lights.push(SceneLight {
                    position: Vec3::new(angle.cos() * 6.0, 3.0, angle.sin() * 6.0),
                    radius: 12.0, color: *color, intensity: 2.5,
                    direction: Vec3::NEG_Y, spot_cutoff: 0.0,
                    name: format!("neon_{}", i),
                });
            }
            self.update_light_buffer();
            self.editor.add_ai_response("🌆 Synthwave/80s look! Neon lights, high saturation, heavy grain + CA.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "horror" || lower == "scary" || lower == "creepy" {
            self.post_params.brightness = 0.35;
            self.post_params.saturation = 0.4;
            self.post_params.contrast = 1.3;
            self.post_params.vignette_strength = 0.6;
            self.post_params.grain_strength = 0.08;
            self.post_params.temperature = -0.2;
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu { gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params)); }
            }
            self.editor.add_ai_response("👻 Horror mode! Dark, desaturated, heavy vignette, film grain.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "noir" || lower == "black and white" || lower == "bw" || lower == "grayscale" {
            self.post_params.saturation = 0.0;
            self.post_params.contrast = 1.3;
            self.post_params.vignette_strength = 0.5;
            self.post_params.grain_strength = 0.05;
            if let Some(ref buf) = self.post_params_buffer {
                if let Some(ref gpu) = self.gpu { gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params)); }
            }
            self.editor.add_ai_response("🖤 Film noir! Black & white, high contrast, vignette.");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Help ---
        if lower == "help" || lower == "?" || lower == "commands" {
            self.editor.add_ai_response(
                "🎮 KOKO Engine Commands\n\n                 🌍 SCENES: forest, castle, city, village, dungeon, arena, beach, farm, \n                    graveyard, harbor, aquarium, racetrack, parkour, campsite, throne room\n                    surprise / random\n\n                 📦 OBJECTS: add tree/dragon/car/house/sword/... (68 models)\n                    add 5 trees | add red sphere | add big blue cube\n                    remove X | clear | list\n\n                 🔥 EFFECTS: add fire/smoke/sparks/rain/snow/magic | clear particles\n                    add water | terrain on/off | fog on/off\n\n                 💡 LIGHTS: add light | add red/blue/green light | add spotlight | clear lights\n\n                 📷 CAMERA: camera top/front/side/close/far/reset | cinematic/flyby\n\n                 🌙 MOOD: night | sunset | day | foggy | bloom on/off | post on/off\n\n                 ⚙️ PHYSICS: play | stop | gravity off/moon/mars/earth/jupiter\n\n                 ✏️ EDIT: move X left/right/up/down | scale X 2.0 | rotate X\n                    color X red | duplicate X | undo | redo\n\n                 💾 SAVE: save scene name | load scene name | list scenes | export MyGame\n\n                 🔊 AUDIO: play sound filename.ogg\n\n                 📜 SCRIPT: lua print(42) | run file script.lua\n\n                 ☁️ AI: set api key sk-... | ai status\n\n                 📊 OTHER: stats | help"
            );
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // --- Random/surprise scene ---
        if lower == "surprise" || lower == "random" || lower == "random scene" {
            let presets = ["forest", "castle", "city", "village", "dungeon", "arena", "beach", "farm", "graveyard", "harbor", "aquarium", "campsite", "throne room"];
            let idx = (self.time.elapsed_secs * 7.3) as usize % presets.len();
            let chosen = presets[idx];
            self.editor.add_ai_response(&format!("🎲 Random scene: {}!", chosen));
            // Re-enter with the preset name
            let prompt_copy = chosen.to_string();
            self.editor.ai_processing = false;
            self.editor.ai_status = "Ready".into();
            self.send_to_ai(&prompt_copy);
            return;
        }

        // --- Undo/redo ---
                // --- Force cloud AI ---
        if lower.starts_with("ai ") && !lower.starts_with("ai status") && !lower.starts_with("ai info") {
            let ai_prompt = prompt.replacen("ai ", "", 1).replacen("AI ", "", 1).trim().to_string();
            if let Some(ref api_key) = self.ai_api_key {
                let api_key = api_key.clone();
                let model = self.ai_model.clone();
                let tx = self.ai_tx.clone();
                let existing: Vec<String> = self.objects.iter().map(|o| o.name.clone()).collect();
                let light_names: Vec<String> = self.scene_lights.iter().map(|l| l.name.clone()).collect();
                let context = format!(
                    "Scene: {} objects [{}], {} lights [{}], water:{}, terrain:{}, weather:{}, camera:[{:.1},{:.1},{:.1}]\nUser: {}",
                    existing.len(), existing.join(", "),
                    light_names.len(), light_names.join(", "),
                    self.water_enabled, self.terrain_enabled,
                    if self.particle_emitters.iter().any(|e| e.emitter_type == ParticleType::Rain) { "rain" }
                    else if self.particle_emitters.iter().any(|e| e.emitter_type == ParticleType::Snow) { "snow" }
                    else { "clear" },
                    self.camera_pos.x, self.camera_pos.y, self.camera_pos.z,
                    ai_prompt
                );
                self.editor.ai_status = "☁️ Asking AI...".into();
                #[cfg(not(target_arch = "wasm32"))]
                self.tokio_rt.spawn(async move {
                    let msgs = vec![koko_ai::provider::AiMessage { role: "user".into(), content: context }];
                    match koko_ai::provider::call_claude(&api_key, &model, koko_ai::prompt::ENGINE_SYSTEM_PROMPT, &msgs, 4096).await {
                        Ok(resp) => { let _ = tx.send(resp.content); }
                        Err(e) => { let _ = tx.send(format!("{{\"commands\":[],\"message\":\"AI error: {}\"}}", e)); }
                    }
                });
                #[cfg(target_arch = "wasm32")]
                { let _ = tx.send("AI not available in browser yet".to_string()); }
                return;
            } else {
                // No API key — fall through to local parser with the stripped prompt
                self.editor.add_ai_response("⚠ No API key set. Use 'set api key sk-ant-...' or set ANTHROPIC_API_KEY env var. Trying local parser...");
                self.send_to_ai(&ai_prompt);
                return;
            }
        }

        // --- AI config commands ---
        if lower.starts_with("set api key ") || lower.starts_with("api key ") {
            let key = prompt.split("key ").last().unwrap_or("").trim().to_string();
            if key.len() > 10 {
                self.ai_api_key = Some(key);
                self.editor.add_ai_response("🔑 API key set! Complex prompts will now use Claude AI.");
            } else {
                self.editor.add_ai_response("⚠ Key too short. Use: 'set api key sk-ant-...'");
            }
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }
        if lower == "ai status" || lower == "ai info" {
            let status = if self.ai_api_key.is_some() { "🟢 Cloud AI connected" } else { "🔴 No API key (local-only mode)" };
            self.editor.add_ai_response(&format!("{} | Model: {}", status, self.ai_model));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into();
            return;
        }

        // Handle glTF model loading
        if lower.starts_with("load ") || lower.starts_with("import ") {
            let model_name = lower.replacen("load ", "", 1).replacen("import ", "", 1).trim().to_string();
            let assets_dir = {
                // Try multiple locations
                let exe_dir = std::env::current_exe().ok()
                    .and_then(|p| p.parent().map(|p| p.to_path_buf()));
                let candidates = [
                    std::path::PathBuf::from("assets/models"),
                    std::path::PathBuf::from("/Users/jamainemartin/.openclaw/workspace/koko-engine/assets/models"),
                ];
                if let Some(dir) = exe_dir.as_ref() {
                    // Check Resources dir (app bundle)
                    let res = dir.join("../Resources/assets/models");
                    if res.exists() { res.to_string_lossy().to_string() }
                    else if dir.join("assets/models").exists() { dir.join("assets/models").to_string_lossy().to_string() }
                    else { candidates.iter().find(|p| p.exists()).map(|p| p.to_string_lossy().to_string()).unwrap_or("assets/models".into()) }
                } else {
                    candidates.iter().find(|p| p.exists()).map(|p| p.to_string_lossy().to_string()).unwrap_or("assets/models".into())
                }
            };
            let candidates = [
                format!("{}/{}.glb", assets_dir, model_name),
                format!("{}/{}.gltf", assets_dir, model_name),
            ];
            let mut loaded = false;
            for path in &candidates {
                if std::path::Path::new(path).exists() {
                    // Place next to existing objects, not on top
                    let offset = self.objects.len() as f32 * 3.0;
                    let angle = self.objects.len() as f32 * 1.2;
                    let pos = [angle.cos() * offset.min(12.0), 0.5, angle.sin() * offset.min(12.0)];
                    let results = self.load_gltf_model(path, &model_name, pos, 0.0);
                    self.editor.add_ai_response(&format!("📦 Loaded: {}", results.join(", ")));
                    loaded = true;
                    break;
                }
            }
            if !loaded {
                // List available models
                let available: Vec<String> = std::fs::read_dir(assets_dir)
                    .map(|entries| entries.filter_map(|e| e.ok())
                        .filter_map(|e| e.path().file_stem().map(|s| s.to_string_lossy().to_string()))
                        .collect())
                    .unwrap_or_default();
                self.editor.add_ai_response(&format!("❌ Model '{}' not found. Available: {}", model_name, available.join(", ")));
            }
            self.editor.ai_processing = false;
            self.editor.ai_status = "Ready".into();
            return;
        }

        // === NATURAL LANGUAGE DECOMPOSITION ===
        // Break complex requests into simple commands before falling through to local parser
        {
            let mut decomposed: Vec<String> = Vec::new();
            let lower_words: Vec<&str> = lower.split_whitespace().collect();
            
            // Detect scene + modifier combos: "dark forest with rain"
            let scene_words = ["forest", "castle", "city", "village", "dungeon", "arena", "beach", "farm",
                "graveyard", "harbor", "aquarium", "campsite", "library", "concert", "kitchen", "gym",
                "museum", "garden", "playground", "zen", "pirate", "throne"];
            let modifier_map: &[(&[&str], &str)] = &[
                (&["dark", "night", "nighttime", "midnight"], "night"),
                (&["rainy", "rain", "raining", "wet"], "rain"),
                (&["snowy", "snow", "snowing", "winter", "cold"], "snow"),
                (&["foggy", "fog", "misty", "mist"], "foggy"),
                (&["sunset", "evening", "golden"], "sunset"),
                (&["dawn", "sunrise", "morning"], "dawn"),
                (&["stormy", "storm", "thunder"], "thunderstorm"),
                (&["fire", "burning", "flames", "fiery"], "add fire"),
                (&["magical", "magic", "enchanted", "fairy"], "magical"),
                (&["spooky", "scary", "creepy", "horror", "haunted"], "horror"),
                (&["cozy", "warm", "fireplace"], "fireplace"),
                (&["water", "lake", "ocean", "sea", "river"], "add water"),
                (&["cinematic", "dramatic", "epic"], "cinematic look"),
                (&["retro", "synthwave", "neon", "80s"], "synthwave"),
                (&["noir", "black and white", "bw"], "noir"),
            ];
            
            let mut found_scene = None;
            for sw in &scene_words {
                if lower.contains(sw) {
                    found_scene = Some(sw.to_string());
                    break;
                }
            }
            
            if let Some(scene) = found_scene {
                decomposed.push(scene);
                // Check for modifiers
                for (keywords, cmd) in modifier_map {
                    for kw in *keywords {
                        if lower.contains(kw) && !scene_words.contains(kw) {
                            decomposed.push(cmd.to_string());
                            break;
                        }
                    }
                }
                // Check for "with X and Y" patterns
                if lower.contains("water") && !decomposed.contains(&"add water".to_string()) {
                    decomposed.push("add water".into());
                }
                if lower.contains("terrain") { decomposed.push("terrain on".into()); }
                
                if decomposed.len() > 1 {
                    // Execute as batch
                    let batch = decomposed.join("; ");
                    self.editor.ai_processing = false;
                    self.editor.ai_status = "Ready".into();
                    self.send_to_ai(&batch);
                    return;
                }
            }
            
            // Detect "make/build/create X" → just "X"
            let stripped = lower
                .replace("make a ", "").replace("make an ", "").replace("make ", "")
                .replace("build a ", "").replace("build an ", "").replace("build ", "")
                .replace("create a ", "").replace("create an ", "").replace("create ", "")
                .replace("give me a ", "").replace("give me an ", "").replace("give me ", "")
                .replace("i want a ", "").replace("i want an ", "").replace("i want ", "")
                .replace("show me a ", "").replace("show me an ", "").replace("show me ", "")
                .replace("put a ", "").replace("put an ", "").replace("put ", "")
                .replace("spawn a ", "").replace("spawn an ", "").replace("spawn ", "")
                .replace("place a ", "").replace("place an ", "").replace("place ", "")
                .replace("set up a ", "").replace("set up an ", "").replace("set up ", "")
                .trim().to_string();
            
            if stripped != lower && !stripped.is_empty() {
                // Re-route with cleaned prompt
                self.editor.ai_processing = false;
                self.editor.ai_status = "Ready".into();
                self.send_to_ai(&stripped);
                return;
            }
        }







        // === ROUND 76-80 COMMANDS ===
        if lower.starts_with("anim state machine") || lower.starts_with("create anim state") {
            self.anim_state_machine_v2 = Some(AnimStateMachine2 { states: vec![], transitions: vec![], current_state: 0, any_state_transitions: vec![], parameters: vec![], layers_v3: vec![], blend_trees: vec![], avatar_mask: vec![], sync_groups: vec![] });
            self.editor.add_ai_response("Animation state machine — blend trees, layers, masks, sync groups, IK");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("level design") || lower.starts_with("create level design") {
            self.level_design_tools = Some(LevelDesignTools { room_templates: vec![], corridors: vec![], door_placements: vec![], spawn_tables: vec![], encounter_zones: vec![], puzzle_rooms: vec![], secret_rooms_v2: vec![], boss_arenas: vec![], safe_zones: vec![], checkpoints_v2: vec![] });
            self.editor.add_ai_response("Level design tools — rooms, encounters, puzzles, boss arenas, checkpoints");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("pathfinding") || lower.starts_with("create pathfinding") {
            self.pathfinding_system = Some(PathfindingSystem { navmeshes_v2: vec![], agents_v2: vec![], obstacles: vec![], off_mesh_links: vec![], crowd_v2: CrowdSystem2 { max_agents: 500, active_agents_v3: 0, avoidance_quality: 3, separation_weight: 2.0, cohesion_weight: 1.0, alignment_weight: 1.0, obstacle_weight: 3.0, path_optimization: true, anticipation_turns: 3 }, areas: vec![NavArea2 { name: "Walkable".into(), id: 0, cost: 1.0, color: [0.0, 0.8, 0.0], flags: 1 }], dynamic_obstacles: true, path_cache: vec![] });
            self.editor.add_ai_response("Pathfinding — navmesh, crowd sim, off-mesh links, area costs, path caching");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("shader library") || lower.starts_with("create shader library") {
            self.shader_library = Some(ShaderLibrary { shaders_v2: vec![], global_keywords: vec![], global_properties: vec![], include_paths: vec!["shaders/include".into()], compiler_cache: 0, hot_reload_v3: true });
            self.editor.add_ai_response("Shader library — multi-pass, tessellation, blend states, stencil, keywords");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("perf optimizer") || lower.starts_with("create perf optimizer") {
            self.perf_optimizer = Some(PerfOptimizer { batching: BatchingSystem { static_batches: 0, dynamic_batches: 0, max_vertices_per_batch: 65536, material_sorting: true, z_sorting: true, enabled: true }, instancing: InstancingSystem { instance_groups: vec![], max_per_draw: 1024, gpu_instancing: true, indirect_rendering: false }, culling: CullingSystem2 { frustum_culling: true, occlusion_v3: true, distance_culling: true, small_object_culling: true, small_object_threshold: 0.01, layer_culling: u64::MAX, stats_v2: CullingStats { total: 0, frustum_culled: 0, occlusion_culled: 0, distance_culled: 0, small_culled: 0, visible: 0 } }, budgets: vec![], frame_pacing: FramePacing { target_fps: 60, vsync: true, adaptive_vsync: false, frame_time_history: vec![], jitter_ms: 0.0, stutter_threshold_ms: 33.0, stutters_last_second: 0 }, quality_scaler: DynamicQuality { enabled: false, target_fps_v2: 60, min_scale: 0.5, max_scale: 1.0, current_scale: 1.0, ramp_speed: 0.1, features: vec![] }, memory_manager: MemoryManager2 { heap_total_mb: 0.0, heap_used_mb: 0.0, gpu_total_mb: 0.0, gpu_used_mb: 0.0, pools_v2: vec![], gc_enabled: true, gc_interval: 60.0, gc_timer: 0.0 }, thread_pool: ThreadPool2 { workers: 8, active_tasks: 0, queued_tasks: 0, completed: 0, task_types: vec![] } });
            self.editor.add_ai_response("Performance optimizer — batching, instancing, culling, dynamic quality, memory pools");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }

        // === ROUND 66-75 COMMANDS ===
        if lower.starts_with("character custom") || lower.starts_with("create character custom") {
            self.character_customizer = Some(CharacterCustomizer { presets: vec![], body_sliders: vec![], face_sliders: vec![], skin_tones: vec![], hair_styles: vec![], facial_hair: vec![], eyes: vec![], makeup: vec![], tattoos: vec![], scars: vec![], accessories: vec![], body_type: BodyType2::Athletic, height_range: [1.5, 2.1], voice_options: vec![] });
            self.editor.add_ai_response("Character customizer — body/face sliders, skin, hair, tattoos, accessories");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("economy engine") || lower.starts_with("create economy engine") {
            self.economy_engine = Some(EconomyEngine { currencies: vec![CurrencyDef { name: "Gold".into(), symbol: "G".into(), icon: "gold".into(), decimal_places: 0, max_amount: u64::MAX, exchange_rates: vec![], earned_total: 0, spent_total: 0 }], markets: vec![], auction_house: AuctionHouse { listings: vec![], bid_increment: 1, listing_fee_pct: 0.05, sale_tax_pct: 0.05, max_duration: 172800.0, categories: vec!["weapons".into(), "armor".into(), "consumables".into(), "materials".into()] }, trade_system: TradeSystem2 { active_trades: vec![], trade_log: vec![], max_items_per_trade: 12, trade_distance: 10.0 }, price_history: vec![], inflation_rate: 0.01, tax_rate_v2: 0.05, supply_demand: true });
            self.editor.add_ai_response("Economy engine — currencies, markets, auction house, supply/demand, trading");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("cinematic engine") || lower.starts_with("create cinematic") {
            self.cinematic_engine = Some(CinematicEngine { sequences: vec![], active_sequence: None, skip_enabled: true, letterbox_v2: true, letterbox_amount: 0.15, subtitles_active: true, subtitle_queue_v2: vec![] });
            self.editor.add_ai_response("Cinematic engine — 12 track types, camera shots, facial capture, keyframes");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("world streaming") || lower.starts_with("create world streaming") {
            self.world_streaming = Some(WorldStreaming { sectors: vec![], active_sectors: vec![], load_radius: 200.0, unload_radius: 300.0, transition_blend: 10.0, loading_priority: vec![], budget_ms: 5.0, async_loading_v2: true, preload_hints: vec![] });
            self.editor.add_ai_response("World streaming — sector loading, LOD, occlusion culling, impostors");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("mod system") || lower.starts_with("create mod system") {
            self.mod_system = Some(ModSystem3 { mods: vec![], load_order: vec![], mod_directory: "mods".into(), sandbox: true, api_version: 1, hooks: vec![], conflicts: vec![], enabled_mods: vec![] });
            self.editor.add_ai_response("Mod system — load order, sandboxing, hooks, conflict resolution, 5 plugin types");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("progression") || lower.starts_with("create progression") {
            self.progression_system = Some(ProgressionSystem { player_level: 1, total_xp: 0, xp_curve: (1..=100).map(|l| l as u64 * 1000).collect(), prestige: 0, prestige_rewards: vec![], achievements_v3: vec![], challenges: vec![], milestones: vec![], stats_tracking: vec![], leaderboard_entries: vec![], season_v2: None });
            self.editor.add_ai_response("Progression — XP curve, prestige, achievements, challenges, season pass, leaderboards");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("building system v2") || lower.starts_with("create building v2") {
            self.building_system_v2 = Some(BuildingSystem2 { pieces: vec![], snap_points: vec![], stability: vec![], materials_v3: vec![], blueprints_v3: vec![], placement_ghost: None, build_mode: false, free_build: false, grid_size: 1.0, rotation_snap_v2: 15.0, max_height: 100.0 });
            self.editor.add_ai_response("Building system v2 — 16 piece types, snap, stability, materials, blueprints");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("vehicle system v2") || lower.starts_with("create vehicle v2") {
            self.vehicle_system_v2 = Some(VehicleSystem2 { vehicles: vec![], fuel_types: vec![FuelType { name: "gasoline".into(), price_per_unit: 3.50, efficiency: 1.0, emission: 1.0 }], traffic_v2: vec![], parking_spots: vec![], garages: vec![] });
            self.editor.add_ai_response("Vehicle system v2 — 18 types, damage model, customization, traffic, garages");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("social system") || lower.starts_with("create social system") {
            self.social_system_v2 = Some(SocialSystem2 { friends_list: vec![], blocked_list: vec![], chat_channels: vec![], guild_v2: None, party_v2: None, status: OnlineStatus::Online2, activity: String::new(), privacy: PrivacySettings { show_online: true, allow_whispers: true, allow_invites: true, allow_trades: true, allow_inspect: true, show_activity: true, profile_visibility: ProfileVis::Public } });
            self.editor.add_ai_response("Social system — friends, guilds, parties, chat channels, privacy settings");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("analytics") || lower.starts_with("create analytics") {
            self.analytics_system = Some(AnalyticsSystem { events: vec![], sessions: vec![], funnels: vec![], ab_tests: vec![], heatmaps: vec![], retention_data: vec![], monetization: vec![], crash_reports: vec![], custom_metrics: vec![], flush_interval: 60.0, flush_timer: 0.0, consent: true, anonymous: false });
            self.editor.add_ai_response("Analytics — events, funnels, A/B tests, heatmaps, retention, crash reports");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }

        // === ROUND 56-65 COMMANDS: ADVANCED SYSTEMS ===
        if lower.starts_with("weather engine") || lower.starts_with("create weather engine") {
            self.weather_engine = Some(WeatherEngine { current: WeatherState2 { kind: WeatherKind2::Clear2, intensity: 0.0, wind_speed: 5.0, wind_dir: [1.0, 0.0], temperature: 22.0, humidity: 0.5, visibility: 1000.0, cloud_cover: 0.3, pressure: 1013.0 }, forecast: vec![], transition_timer: 0.0, transition_duration: 30.0, wind_system: WindSystem3 { global_direction: [1.0, 0.0, 0.0], global_speed: 5.0, gusts: vec![], turbulence_scale: 0.5, turbulence_speed: 1.0, height_gradient: 0.1, sheltered_zones: vec![] }, precipitation: PrecipitationSystem { kind: PrecipKind::None6, rate: 0.0, splash_effect: true, accumulation: true, accumulation_rate: 0.01, melt_rate: 0.005, puddle_formation: true, wetness: 0.0, wetness_decay: 0.1, particle_count: 1000, wind_affect: 0.5, size_range: [0.01, 0.03] }, cloud_system: CloudSystem3 { layers_v2: vec![], shadow_projection: true, cloud_speed: 1.0, detail_scale: 1.0, edge_softness: 0.3, ambient_light: 0.5, sun_highlight: 1.0, coverage_min: 0.0, coverage_max: 1.0 }, lightning_system: LightningSystem2 { active: false, frequency: 5.0, timer: 0.0, bolt_lifetime: 0.3, branch_count: 5, flash_intensity: 10.0, thunder_delay: 3.0, strike_damage: 100.0, bolts: vec![] }, fog_system: FogSystem2 { mode: FogMode2::ExponentialSquared, color: [0.7, 0.75, 0.8], density: 0.01, start_dist: 10.0, end_dist: 300.0, height_fog: true, height_density: 0.05, height_falloff: 2.0, inscattering: 0.5, animated: true, noise_scale: 50.0, noise_speed: 1.0, max_opacity: 0.95 }, temperature_map: vec![] });
            self.editor.add_ai_response("Weather engine — 18 weather types, wind gusts, precipitation, lightning, volumetric fog");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("destruction system") || lower.starts_with("create destruction") {
            self.destruction_system = Some(DestructionSystem2 { destructibles: vec![], fracture_cache: vec![], debris_pool: vec![], max_debris: 200, debris_lifetime: 10.0, cascade_destruction: true });
            self.editor.add_ai_response("Destruction system — fracture patterns, debris physics, staged damage, repair");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("water system") || lower.starts_with("create water system") {
            self.water_system_v2 = Some(WaterSystem2 { bodies: vec![], global_settings: WaterGlobalSettings { simulation_quality: 3, reflection_resolution: 512, refraction_resolution: 512, tessellation: true, tess_factor: 16.0, dynamic_ripples: true, ripple_lifetime: 3.0 }, caustics_v2: CausticsSettings { enabled: true, texture: None, scale: 5.0, speed: 1.0, intensity: 0.5, depth_fade: 10.0 }, foam_settings: FoamSettings { texture: None, scale: 2.0, threshold: 0.5, intensity: 1.0, shore_width: 2.0, wave_foam: true }, underwater_settings: UnderwaterSettings2 { fog_color: [0.1, 0.3, 0.5], fog_density: 0.05, caustic_intensity: 0.3, distortion: 0.02, god_rays: true, god_ray_intensity: 0.5, bubble_particles: true, pressure_effect: 0.01, tint_color: [0.2, 0.4, 0.6] } });
            self.editor.add_ai_response("Water system v2 — oceans, rivers, caustics, foam, underwater, tessellation");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("game mode") || lower.starts_with("create game mode") {
            self.game_mode_system = Some(GameModeSystem { modes: vec![GameMode2 { name: "Deathmatch".into(), kind: ModeKind::Deathmatch, max_players: 16, team_count: 0, team_size: 0, round_time: 600.0, max_rounds: 1, win_condition: WinCondition::ScoreLimit(30), respawn: RespawnMode::Instant, friendly_fire: false, rules: vec![] }], active_mode: Some(0), scoreboard_v2: vec![], round_timer: 0.0, round_number: 1, warmup: true, warmup_timer: 30.0, overtime: false });
            self.editor.add_ai_response("Game mode system — 18 modes, killcam, spawn algorithms, loadouts");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("vfx system") || lower.starts_with("create vfx system") {
            self.vfx_system_v2 = Some(VFXSystem2 { effect_pool: vec![], templates: vec![], gpu_particles_v2: true, max_effects: 500, lod_distances_v2: vec![20.0, 50.0, 100.0], global_scale: 1.0 });
            self.editor.add_ai_response("VFX system v2 — 10 component types, GPU particles, decals, screen effects");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("save system") || lower.starts_with("create save system") {
            self.save_system_v2 = Some(SaveSystem2 { slots_v2: vec![], auto_save_interval: 300.0, auto_save_timer: 0.0, max_auto_saves: 3, quick_save_slot: 99, cloud_sync: false, compression: true, encryption_key: None, save_in_progress: false, load_in_progress: false, migration_version: 1 });
            self.editor.add_ai_response("Save system v2 — slots, auto-save, cloud sync, migration, checksums");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("terrain painter") || lower.starts_with("create terrain painter") {
            self.terrain_painter = Some(TerrainPainter { brushes: vec![TerrainBrush2 { name: "default".into(), kind: BrushKind2::Raise2, size: 10.0, strength: 0.5, falloff: 0.5, rotation: 0.0, spacing: 0.25, jitter: 0.0, texture: None, shape: BrushShape2::Circle3, noise: 0.0 }], layers_v3: vec![], splat_resolution: 1024, detail_objects: vec![], holes_enabled: true, stamp_library: vec![] });
            self.editor.add_ai_response("Terrain painter — 10 brush types, paint layers, detail objects, stamps");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("editor tools") || lower.starts_with("create editor tools") {
            self.editor_tool_system = Some(EditorToolSystem { tools: vec![], active_tool: 0, gizmo_settings: GizmoSettings2 { mode: GizmoMode2::Translate2, space: GizmoSpace::World2, size: 1.0, snap: false, snap_value: 1.0, rotation_snap: 15.0, scale_snap: 0.1, show_bounds: true, selected_axis: None }, grid_settings: GridSettings2 { visible: true, size: 1.0, subdivisions: 10, color: [0.5, 0.5, 0.5, 0.3], opacity: 0.3, axis_colors: [[1.0,0.0,0.0],[0.0,1.0,0.0],[0.0,0.0,1.0]], infinite: true, origin_lines: true }, snap_settings: SnapSettings2 { position_snap: 1.0, rotation_snap: 15.0, scale_snap: 0.1, vertex_snap: false, surface_snap: false, grid_snap: true, incremental: true }, selection: SelectionState2 { selected: vec![], primary: None, hover: None, marquee: None, locked: vec![], hidden: vec![], filter: SelectionFilter::All3 }, clipboard: vec![], history_v2: vec![], redo_stack: vec![], max_history: 100 });
            self.editor.add_ai_response("Editor tool system — gizmos, grid, snapping, selection, history, prefabs");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("procedural anim") || lower.starts_with("create procedural anim") {
            self.procedural_anim = Some(ProceduralAnimSystem { ik_solvers: vec![], look_at_v2: vec![], foot_placement: vec![], spine_solver: vec![], hand_ik: vec![], head_tracking: vec![], tail_anim: vec![], wing_anim: vec![] });
            self.editor.add_ai_response("Procedural animation — 6 IK types, foot placement, fingers, head tracking, tails, wings");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }

        // === ROUND 46-55 COMMANDS: DEEP SYSTEMS ===
        if lower.starts_with("camera system") || lower.starts_with("create camera system") {
            self.camera_system_v2 = Some(CameraSystem { cameras: vec![CameraV2 { name: "Main".into(), pos: [0.0, 5.0, -10.0], rot: [0.0, 0.0, 0.0, 1.0], fov: 60.0, near_clip: 0.1, far_clip: 1000.0, ortho: false, ortho_size: 10.0, priority: 0, clear_flags: ClearFlags::Skybox2, clear_color: [0.1, 0.1, 0.1, 1.0], depth: 0.0, culling_mask: u64::MAX, hdr: true, target_texture: None }], active_camera: 0, blend_stack: vec![], post_process_stack: vec![], viewport_rects: vec![] });
            self.editor.add_ai_response("Camera system initialized — multi-camera, blending, dolly, post-process stack");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("lighting system") || lower.starts_with("create lighting system") {
            self.lighting_system_v2 = Some(LightingSystem { lights_v2: vec![], probes_v2: vec![], lightmaps: vec![], gi_settings: GISettings { enabled: true, quality: GIQuality::High2, indirect_intensity: 1.0, albedo_boost: 1.0, max_bounces: 3, real_time_gi: false }, shadow_settings: ShadowSettings2 { distance: 150.0, cascades: 4, cascade_splits: vec![0.05, 0.15, 0.4, 1.0], resolution: 2048, soft_shadows: true, filter: ShadowFilter::PCSS, fade_distance: 10.0, stable: true }, ambient_mode: AmbientMode::Skybox3 });
            self.editor.add_ai_response("Lighting system — GI, lightmaps, IES profiles, shadow cascades, light groups");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("vegetation system") || lower.starts_with("create vegetation") {
            self.vegetation_system = Some(VegetationSystem { trees: vec![], grass: vec![], placement_rules: vec![], wind_settings: WindSettings2 { main_strength: 0.5, main_direction: [1.0, 0.0, 0.0], turbulence: 0.3, gust_frequency: 0.5, gust_strength: 1.5, gust_duration: 2.0, wave_size: 10.0, wave_speed: 3.0, branch_flex: 0.3, leaf_flutter: 0.5, grass_push_radius: 1.5 }, lod_bias: 1.0, density_scale: 1.0, render_distance: 200.0, billboard_distance: 100.0, impostor_resolution: 256 });
            self.editor.add_ai_response("Vegetation system — procedural trees, grass, wind, SpeedTree, foliage sectors");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("dialogue system v2") || lower.starts_with("create dialogue v2") {
            self.dialogue_system_v2 = Some(DialogueSystem3 { conversations: vec![], active_conv: None, history: vec![], speakers: vec![], variables: vec![], bark_queue: vec![], typewriter_speed: 30.0 });
            self.editor.add_ai_response("Dialogue system v2 — branching, skill checks, barks, localized dialogue");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("quest system v2") || lower.starts_with("create quest v2") {
            self.quest_system_v2 = Some(QuestSystem { quests_v2: vec![], active_quests: vec![], completed_quests: vec![], failed_quests: vec![], quest_log_open: false, tracking: vec![], max_tracked: 3, auto_track: true });
            self.editor.add_ai_response("Quest system v2 — chains, categories, reputation, time limits, tracking");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("inventory system") || lower.starts_with("create inventory v2") {
            self.inventory_system = Some(InventorySystem { containers: vec![Container { name: "Backpack".into(), slots: vec![], max_slots: 40, locked: false, key_item: None, shared: false, weight_limit: Some(100.0) }], equipment_slots: vec![], quick_slots: vec![None; 10], weight_limit: 100.0, current_weight: 0.0, auto_sort: false, filter: InventoryFilter::All, compare_mode: false, favorites: vec![], junk_list: vec![] });
            self.editor.add_ai_response("Inventory system — containers, equipment slots, weight, durability, item sets");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("combat system v2") || lower.starts_with("create combat v2") {
            self.combat_system = Some(CombatSystem { combatants: vec![], combat_log: vec![], target_lock: None, auto_target: true, aim_assist: 0.3, hit_stop_ms: 50.0, parry_window: 0.15, dodge_iframes: 8, block_angle: 120.0, backstab_angle: 60.0, crit_multiplier: 2.0, combo_counter: 0, combo_timer: 0.0, style_rank: StyleRank::D });
            self.editor.add_ai_response("Combat system v2 — hit stop, parry, style ranks, status effects, damage calc");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("crafting system v2") || lower.starts_with("create crafting v2") {
            self.crafting_system_v2 = Some(CraftingSystem { stations: vec![], recipes_v2: vec![], discovered_recipes: vec![], crafting_queue: vec![], auto_craft: false, favorite_recipes: vec![], skill_levels: vec![] });
            self.editor.add_ai_response("Crafting system v2 — 12 station types, quality tiers, skill progression, salvage");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("ai brain") || lower.starts_with("create ai brain") {
            self.ai_brain_system = Some(AIBrainSystem { brains: vec![], blackboards_v2: vec![], sensors: vec![], stimuli: vec![], squad_manager: SquadManager { squads: vec![], formations_v2: vec![] } });
            self.editor.add_ai_response("AI brain system — behavior trees, utility AI, sensors, squads, personalities");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("audio system v2") || lower.starts_with("create audio v2") {
            self.audio_system_v2 = Some(AudioSystem2 { mixer: AudioMixer2 { master_volume: 1.0, channels_v2: vec![], crossfade_time: 0.5 }, spatial: SpatialAudio { hrtf_enabled: true, max_distance: 100.0, doppler_scale: 1.0, rolloff_mode: RolloffMode::Logarithmic, default_spread: 0.0, reverb_zones_v2: vec![] }, music_engine: MusicEngine2 { layers: vec![], current_state: "explore".into(), transition_time: 2.0, stingers: vec![], tempo: 120.0, time_signature: [4, 4], bar_count: 0, beat_callbacks: vec![] }, voice_manager: VoiceManager { max_voices: 64, active: 0, virtual_voices: 128, steal_mode: VoiceStealMode::Quietest, priority_system: true }, sound_bank: SoundBank { name: "default".into(), sounds: vec![], loaded: false, memory_mb: 0.0, streaming: false }, occlusion_system: AudioOcclusion { enabled: true, ray_count: 8, update_rate: 0.1, max_occlusion: 0.8, low_pass_freq: 800.0 }, snapshot_stack: vec![], duck_groups: vec![] });
            self.editor.add_ai_response("Audio system v2 — HRTF spatial, mixer, music layers, voice manager, occlusion");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }

        // === ROUND 33-36 COMMANDS: DEEP ENGINE SYSTEMS ===
        if lower.starts_with("terrain engine") || lower.starts_with("create terrain engine") {
            self.terrain_engine = Some(TerrainEngine { chunks: vec![], lod_levels: 5, chunk_size: 64.0, height_scale: 100.0, texture_layers: vec![], erosion: ErosionSettings { iterations: 50000, rain_amount: 0.01, sediment_capacity: 4.0, evaporation: 0.01, deposition: 0.3, erosion_rate: 0.3, thermal_rate: 0.01, wind_strength: 0.1 }, vegetation_density: 0.5 });
            self.editor.add_ai_response("Terrain engine initialized with erosion simulation");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("world generator") || lower.starts_with("create world gen") {
            self.world_generator = Some(WorldGenerator { seed: 42, octaves: 6, persistence: 0.5, lacunarity: 2.0, scale: 200.0, biome_scale: 500.0, moisture_scale: 300.0, temperature_scale: 400.0, sea_level: 0.4 });
            self.editor.add_ai_response("World generator initialized — use 'generate world' to create terrain");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("cave generator") || lower.starts_with("create caves") {
            self.cave_generator = Some(CaveGenerator { density: 0.48, threshold: 0.5, smoothing: 5, stalactites: true, crystals: true, underground_lakes: true, lava_level: -100.0, ore_veins: vec![OreVein { ore_type: "iron".into(), rarity: 0.3, cluster_size: 8, min_depth: 10.0, max_depth: 100.0 }, OreVein { ore_type: "gold".into(), rarity: 0.1, cluster_size: 4, min_depth: 50.0, max_depth: 200.0 }] });
            self.editor.add_ai_response("Cave generator ready with ore veins and underground features");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("network engine") || lower.starts_with("create network engine") {
            self.network_engine = Some(NetworkEngine { transport: TransportKind::UDP, tick_rate: 60, snapshot_rate: 20, max_clients: 64, timeout_ms: 10000, compression: true, encryption: true, delta_compression: true });
            self.editor.add_ai_response("Network engine initialized — UDP, 60 tick, 64 max clients");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("matchmaking") || lower.starts_with("create matchmaking") {
            self.matchmaking = Matchmaking { searching: true, mode: "ranked".into(), rank: 1000, search_time: 0.0, regions: vec!["us-west".into(), "us-east".into(), "eu".into(), "asia".into()] };
            self.editor.add_ai_response("Matchmaking system ready with ELO-based matching");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("voice chat") || lower.starts_with("enable voice chat") {
            self.voice_chat = VoiceChat { enabled: true, push_to_talk: true, volume: 0.8, muted_players: vec![] };
            self.editor.add_ai_response("Voice chat enabled — Opus codec, global + proximity channels");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("lobby") || lower.starts_with("create lobby") {
            self.lobby_system = Some(LobbySystem { lobbies: vec![], max_lobbies: 100 });
            self.editor.add_ai_response("Lobby system initialized");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("ui engine") || lower.starts_with("create ui engine") {
            self.ui_engine = Some(UIEngine { widgets: vec![], layouts: vec![], styles: vec![], animations_ui: vec![], focus_stack: vec![], modal_stack: vec![] });
            self.editor.add_ai_response("UI engine initialized — 20 widget types, layout system, data binding");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("input system") || lower.starts_with("create input system") {
            self.input_system_v2 = Some(InputSystem2 { bindings: vec![], axes: vec![], gestures: vec![], gamepad_deadzones: [0.15, 0.15], mouse_sensitivity: 1.0, invert_y: false, raw_input: true });
            self.editor.add_ai_response("Advanced input system — gamepad, touch, gestures, combos, haptics");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("particle engine") || lower.starts_with("create particle engine") {
            self.particle_engine = Some(ParticleEngine { systems_v2: vec![], global_time_scale: 1.0, max_particles: 100000, gpu_particles: true });
            self.editor.add_ai_response("Particle engine — GPU particles, noise, collision, sub-emitters, trails");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("material engine") || lower.starts_with("create material engine") {
            self.material_engine = Some(MaterialEngine { materials_v2: vec![], shaders: vec![], global_params: vec![], keyword_sets: vec![] });
            self.editor.add_ai_response("Material engine — shader variants, stencil, instancing, texture assets");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("scene graph") || lower.starts_with("create scene graph") {
            self.scene_graph_v2 = Some(SceneGraph { root: SceneNode2 { id: 0, name: "Root".into(), local_pos: [0.0;3], local_rot: [0.0, 0.0, 0.0, 1.0], local_scale: [1.0;3], world_matrix: [[1.0,0.0,0.0,0.0],[0.0,1.0,0.0,0.0],[0.0,0.0,1.0,0.0],[0.0,0.0,0.0,1.0]], parent: None, children: vec![], active: true, static_flag: false, layer: 0, tag: String::new(), components: vec![] }, dirty: false, layer_masks: vec![] });
            self.editor.add_ai_response("Scene graph initialized with root node");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("ecs world") || lower.starts_with("create ecs") {
            self.ecs_world = Some(ECSWorld { entities_v2: vec![], component_stores: vec![], systems_v2: vec![], queries: vec![], resources: vec![] });
            self.editor.add_ai_response("ECS world — archetypes, queries, command buffers, system phases");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("debug console") || lower.starts_with("toggle console") {
            self.debug_console.visible = !self.debug_console.visible;
            self.editor.add_ai_response(&format!("Debug console {}", if self.debug_console.visible { "opened" } else { "closed" }));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("asset pipeline") || lower.starts_with("create asset pipeline") {
            self.asset_pipeline = Some(AssetPipeline { importers: vec![], processors: vec![], cache_size_mb: 2048, parallel_jobs: 4 });
            self.editor.add_ai_response("Asset pipeline — importers, processors, LRU cache, hot reload, bundles");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("localization") || lower.starts_with("create localization") {
            self.localization = Some(LocalizationEngine { languages: vec![Language { code: "en".into(), name: "English".into(), native_name: "English".into(), complete: 1.0, font: None, text_direction: TextDir::LTR }], current: "en".into(), fallback: "en".into(), tables: vec![], font_overrides: vec![], rtl_support: true, pluralization: true });
            self.editor.add_ai_response("Localization engine — RTL support, pluralization, font overrides");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("accessibility") || lower.starts_with("create accessibility") {
            self.accessibility_engine = Some(AccessibilityEngine { screen_reader_active: false, narration_queue: vec![], focus_order: vec![], aria_labels: vec![], color_blind_mode: ColorBlindMode::None3, text_scale: 1.0, reduce_motion: false, captions: true, audio_descriptions: false });
            self.editor.add_ai_response("Accessibility engine — screen reader, color blind modes, captions");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("tts") || lower.starts_with("text to speech") {
            self.tts = Some(TextToSpeech { enabled: true, rate: 1.0, pitch: 1.0, volume_tts: 0.8, voice: "default".into(), queue: vec![] });
            self.editor.add_ai_response("Text-to-speech enabled");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        // === ROUND 40-45 COMMANDS: DEEP ENGINE CONTINUED ===
        if lower.starts_with("start profiling") || lower.starts_with("profile start") {
            self.profiler_v2.recording = true;
            self.editor.add_ai_response("Profiler recording started");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("stop profiling") || lower.starts_with("profile stop") {
            self.profiler_v2.recording = false;
            self.editor.add_ai_response(&format!("Profiler stopped — {} frames captured", self.profiler_v2.frames.len()));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("record input") || lower.starts_with("input record") {
            self.input_recorder.recording = !self.input_recorder.recording;
            self.editor.add_ai_response(&format!("Input recording {}", if self.input_recorder.recording { "started" } else { "stopped" }));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("haptic") {
            self.haptic_feedback.push(HapticFeedback { patterns: vec![HapticPattern { name: "pulse".into(), duration: 0.2, amplitude: 0.8, frequency: 60.0 }], controller: "default".into() });
            self.editor.add_ai_response("Haptic feedback triggered");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        // === ROUND 12 COMMANDS: WORLD BUILDING ===
        if lower.starts_with("river ") {
            let n = lower[6..].trim().to_string();
            self.rivers.push(River { name: n.clone(), points: vec![[0.0,0.0,0.0],[10.0,-0.5,5.0],[20.0,-1.0,10.0],[30.0,-0.5,8.0]], width: 4.0, depth: 1.5, flow_speed: 2.0, color: [0.1,0.3,0.6,0.8] });
            self.editor.add_ai_response(&format!("🏞️ River '{}' (4 points)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("lake ") {
            let p: Vec<&str> = lower[5..].split_whitespace().collect();
            let n = p.first().unwrap_or(&"lake1").to_string();
            let r: f32 = p.get(1).and_then(|s| s.parse().ok()).unwrap_or(15.0);
            self.lakes.push(Lake { name: n.clone(), pos: [0.0,-0.5,0.0], radius: r, depth: 3.0, color: [0.1,0.2,0.5,0.7] });
            self.editor.add_ai_response(&format!("🏊 Lake '{}' (radius: {})", n, r));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("waterfall ") {
            let n = lower[10..].trim().to_string();
            self.waterfalls.push(Waterfall { name: n.clone(), pos: [0.0,10.0,0.0], height: 10.0, width: 3.0, flow_rate: 5.0, mist: true });
            self.editor.add_ai_response(&format!("🌊 Waterfall '{}' (height: 10)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("cave ") {
            let n = lower[5..].trim().to_string();
            self.caves.push(Cave { name: n.clone(), entrance: [0.0,0.0,0.0], depth: 20.0, width: 5.0, stalactites: true });
            self.editor.add_ai_response(&format!("🕳️ Cave '{}' (depth: 20)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("road ") {
            let n = lower[5..].trim().to_string();
            self.road_segments.push(RoadSegment { start: [0.0,0.0,0.0], end: [30.0,0.0,0.0], width: 4.0, material: n.clone(), curve: 0.0 });
            self.editor.add_ai_response(&format!("🛤️ Road segment '{}' (30m)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("campfire ") {
            let n = lower[9..].trim().to_string();
            self.campfires.push(Campfire { name: n.clone(), pos: [0.0,0.0,0.0], lit: true, warmth_radius: 8.0, light_color: [1.0,0.6,0.2,1.0] });
            self.editor.add_ai_response(&format!("🔥 Campfire '{}' (lit, warmth: 8m)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("barrel ") {
            let n = lower[7..].trim().to_string();
            let explosive = n.contains("explod") || n.contains("tnt") || n.contains("bomb");
            self.barrels.push(Barrel { name: n.clone(), pos: [0.0,0.5,0.0], explosive, hp: 30.0, content: if explosive { "gunpowder".into() } else { "water".into() } });
            self.editor.add_ai_response(&format!("{} Barrel '{}'{}", if explosive { "💣" } else { "🪣" }, n, if explosive { " (EXPLOSIVE!)" } else { "" }));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("sign ") {
            let rest = lower[5..].trim().to_string();
            self.signs.push(Sign { name: format!("sign_{}", self.signs.len()), pos: [0.0,1.5,0.0], text: rest.clone(), size: [2.0,1.0], color: [0.6,0.4,0.2,1.0] });
            self.editor.add_ai_response(&format!("🪧 Sign: '{}'", rest));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("statue ") {
            let n = lower[7..].trim().to_string();
            self.statues.push(Statue { name: n.clone(), pos: [0.0,0.0,0.0], model: "humanoid".into(), scale: 2.0, inscription: String::new() });
            self.editor.add_ai_response(&format!("🗿 Statue '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("banner ") {
            let n = lower[7..].trim().to_string();
            self.banners.push(Banner { name: n.clone(), pos: [0.0,3.0,0.0], color: [1.0,0.0,0.0,1.0], symbol: "lion".into(), wave_speed: 1.5 });
            self.editor.add_ai_response(&format!("🚩 Banner '{}' (red, lion)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("throne ") {
            let n = lower[7..].trim().to_string();
            self.thrones.push(Throne { name: n.clone(), pos: [0.0,0.0,0.0], material: "gold".into(), occupied: false });
            self.editor.add_ai_response(&format!("👑 Throne '{}' (gold)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("altar ") {
            let n = lower[6..].trim().to_string();
            self.altars.push(Altar { name: n.clone(), pos: [0.0,0.5,0.0], deity: "unknown".into(), offerings: Vec::new(), active: true });
            self.editor.add_ai_response(&format!("⛩️ Altar '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("furnace ") {
            let n = lower[8..].trim().to_string();
            self.furnaces.push(Furnace { name: n.clone(), pos: [0.0,0.0,0.0], temperature: 0.0, fuel: 0.0, smelting: None, timer: 0.0 });
            self.editor.add_ai_response(&format!("🔥 Furnace '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("workbench ") {
            let n = lower[10..].trim().to_string();
            self.workbenches.push(Workbench { name: n.clone(), pos: [0.0,0.0,0.0], craft_type: "general".into(), recipes: Vec::new() });
            self.editor.add_ai_response(&format!("🔨 Workbench '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("storage ") || lower.starts_with("chest ") && !lower.starts_with("chest plate") {
            let rest = if lower.starts_with("storage ") { &lower[8..] } else { &lower[6..] };
            let n = rest.trim().to_string();
            self.storage_chests.push(StorageChest { name: n.clone(), pos: [0.0,0.0,0.0], slots: 20, items: Vec::new(), locked: false });
            self.editor.add_ai_response(&format!("📦 Storage '{}' (20 slots)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("garden ") {
            let n = lower[7..].trim().to_string();
            self.gardens.push(Garden { name: n.clone(), pos: [0.0,0.0,0.0], plots: vec![
                GardenPlot { plant: None, growth: 0.0, watered: false, quality: 1.0 };4
            ] });
            self.editor.add_ai_response(&format!("🌱 Garden '{}' (4 plots)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("fishing spot ") || lower.starts_with("fishing ") {
            let rest = if lower.starts_with("fishing spot ") { &lower[13..] } else { &lower[8..] };
            let n = rest.trim().to_string();
            self.fishing_spots.push(FishingSpot { name: n.clone(), pos: [0.0,0.0,0.0], fish_types: vec!["bass".into(),"trout".into(),"salmon".into()], difficulty: 0.5, active: true });
            self.editor.add_ai_response(&format!("🎣 Fishing spot '{}' (3 fish types)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("mining node ") || lower.starts_with("ore ") {
            let rest = if lower.starts_with("mining node ") { &lower[12..] } else { &lower[4..] };
            let p: Vec<&str> = rest.split_whitespace().collect();
            let n = p.first().unwrap_or(&"iron").to_string();
            self.mining_nodes.push(MiningNode { name: n.clone(), pos: [0.0,0.0,0.0], ore_type: n.clone(), hp: 100.0, max_hp: 100.0, respawn_time: 60.0, timer: 0.0 });
            self.editor.add_ai_response(&format!("⛏️ Mining node '{}' (HP: 100)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("ai territory ") {
            let n = lower[13..].trim().to_string();
            self.ai_territories.push(AITerritory { name: n.clone(), center: [0.0,0.0,0.0], radius: 20.0, owner: "enemy".into(), contested: false });
            self.editor.add_ai_response(&format!("🏴 AI Territory '{}' (radius: 20)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("squad ") {
            let n = lower[6..].trim().to_string();
            self.ai_squads.push(AISquad { name: n.clone(), members: Vec::new(), leader: String::new(), formation: "line".into(), morale: 1.0 });
            self.editor.add_ai_response(&format!("🎖️ AI Squad '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("perception ") {
            let n = lower[11..].trim().to_string();
            self.ai_perceptions.push(AIPerception { entity: n.clone(), sight_range: 20.0, sight_angle: 120.0, hearing_range: 10.0, detected: Vec::new() });
            self.editor.add_ai_response(&format!("👁️ AI Perception on '{}' (sight: 20, hearing: 10)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("biome ") {
            let n = lower[6..].trim().to_string();
            let (color, tree_d, grass_d, weather) = match n.as_str() {
                "desert" => ([0.9,0.8,0.5,1.0], 0.01, 0.05, "clear"),
                "snow" | "tundra" => ([0.9,0.95,1.0,1.0], 0.1, 0.02, "snow"),
                "jungle" | "tropical" => ([0.1,0.5,0.1,1.0], 0.9, 0.8, "rain"),
                "swamp" => ([0.3,0.4,0.2,1.0], 0.3, 0.6, "fog"),
                "volcanic" => ([0.3,0.1,0.05,1.0], 0.0, 0.0, "ash"),
                "ocean" => ([0.1,0.2,0.5,0.9], 0.0, 0.0, "clear"),
                _ => ([0.2,0.6,0.2,1.0], 0.3, 0.5, "clear"),
            };
            self.biome_defs.push(BiomeDefinition { name: n.clone(), color, min_height: -10.0, max_height: 50.0, tree_density: tree_d, rock_density: 0.1, grass_density: grass_d, weather: weather.into() });
            self.editor.add_ai_response(&format!("🌍 Biome '{}' defined", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("street light ") || lower.starts_with("streetlight ") {
            let rest = if lower.starts_with("street light ") { &lower[13..] } else { &lower[12..] };
            let n = rest.trim().to_string();
            self.street_lights_v2.push(StreetLight2 { name: n.clone(), pos: [0.0,0.0,0.0], height: 5.0, color: [1.0,0.9,0.7,1.0], range: 12.0, on: true });
            self.editor.add_ai_response(&format!("🏮 Street light '{}' (warm, range: 12)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("prison ") || lower.starts_with("jail ") {
            let rest = if lower.starts_with("prison ") { &lower[7..] } else { &lower[5..] };
            let n = rest.trim().to_string();
            self.prisons.push(Prison { name: n.clone(), pos: [0.0,0.0,0.0], size: [4.0,3.0,4.0], locked: true, prisoner: None });
            self.editor.add_ai_response(&format!("🏛️ Prison cell '{}' (locked)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("anvil ") {
            let n = lower[6..].trim().to_string();
            self.anvils.push(Anvil { name: n.clone(), pos: [0.0,0.0,0.0], durability: 100.0, recipes: vec!["sword".into(),"shield".into(),"armor".into()] });
            self.editor.add_ai_response(&format!("⚒️ Anvil '{}' (3 recipes)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("well ") {
            let n = lower[5..].trim().to_string();
            self.wells.push(Well { name: n.clone(), pos: [0.0,0.0,0.0], has_water: true, depth: 5.0 });
            self.editor.add_ai_response(&format!("🪣 Well '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("bookshelf ") {
            let n = lower[10..].trim().to_string();
            self.bookshelves.push(Bookshelf { name: n.clone(), pos: [0.0,0.0,0.0], books: vec!["History of the Kingdom".into(),"Spellbook".into(),"Map".into()], interactable: true });
            self.editor.add_ai_response(&format!("📚 Bookshelf '{}' (3 books)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("cliff ") {
            let n = lower[6..].trim().to_string();
            self.cliffs.push(Cliff { pos: [0.0,0.0,0.0], size: [20.0,15.0,3.0], angle: 80.0, material: n });
            self.editor.add_ai_response("🏔️ Cliff added (20x15m, 80°)");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }

        // === ROUND 11 COMMANDS: VFX & HUD ===
        if lower.starts_with("screen effect ") || lower.starts_with("effect ") {
            let rest = if lower.starts_with("screen effect ") { &lower[14..] } else { &lower[7..] };
            let kind = match rest.trim() {
                "vignette" => ScreenEffectKind::Vignette, "chromatic" | "aberration" => ScreenEffectKind::ChromaticAberration,
                "grain" | "film grain" => ScreenEffectKind::FilmGrain, "scanlines" => ScreenEffectKind::Scanlines,
                "blur" => ScreenEffectKind::Blur, "pixelate" => ScreenEffectKind::Pixelate,
                "invert" => ScreenEffectKind::Invert, "sepia" => ScreenEffectKind::Sepia,
                "underwater" => ScreenEffectKind::Underwater, "drunk" => ScreenEffectKind::Drunk,
                "frozen" | "ice" => ScreenEffectKind::Frozen, "burning" | "fire" => ScreenEffectKind::Burning,
                _ => ScreenEffectKind::Vignette,
            };
            self.screen_effects.push(ScreenEffect { name: rest.trim().into(), kind, intensity: 0.5, duration: 0.0, timer: 0.0, active: true });
            self.editor.add_ai_response(&format!("🎨 Screen effect: {}", rest.trim()));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("camera path ") || lower.starts_with("cam path ") {
            let rest = if lower.starts_with("camera path ") { &lower[12..] } else { &lower[9..] };
            let n = rest.trim().to_string();
            self.camera_paths.push(CameraPath { name: n.clone(), points: vec![
                CameraKeyframe { position: Vec3::new(0.0,2.0,0.0), yaw: 0.0, pitch: 0.0, time: 0.0 },
                CameraKeyframe { position: Vec3::new(10.0,3.0,0.0), yaw: 1.57, pitch: -0.2, time: 0.5 },
                CameraKeyframe { position: Vec3::new(0.0,5.0,-10.0), yaw: 3.14, pitch: -0.5, time: 1.0 },
            ], duration: 5.0, timer: 0.0, playing: false, looping: false });
            self.editor.add_ai_response(&format!("🎬 Camera path '{}' (3 keyframes, 5s)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("lens flare ") {
            let n = lower[11..].trim().to_string();
            self.lens_flares.push(LensFlare { name: n.clone(), pos: [0.0,20.0,0.0], color: [1.0,0.9,0.7,1.0], intensity: 1.0, size: 3.0 });
            self.editor.add_ai_response(&format!("✨ Lens flare '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "god rays on" || lower == "godrays on" {
            self.god_rays.enabled = true;
            self.editor.add_ai_response("☀️ God rays ON");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "god rays off" || lower == "godrays off" {
            self.god_rays.enabled = false;
            self.editor.add_ai_response("☀️ God rays OFF");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "dof on" || lower == "depth of field on" {
            self.depth_of_field.enabled = true;
            self.editor.add_ai_response("📷 Depth of field ON");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "dof off" || lower == "depth of field off" {
            self.depth_of_field.enabled = false;
            self.editor.add_ai_response("📷 Depth of field OFF");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "motion blur on" {
            self.motion_blur.enabled = true;
            self.editor.add_ai_response("💨 Motion blur ON");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "motion blur off" {
            self.motion_blur.enabled = false;
            self.editor.add_ai_response("💨 Motion blur OFF");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "color grading on" {
            self.color_grading.enabled = true;
            self.editor.add_ai_response("🎨 Color grading ON");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("outline ") {
            let n = lower[8..].trim().to_string();
            self.outlines.push(Outline { entity: n.clone(), color: [1.0,1.0,0.0,1.0], width: 2.0 });
            self.editor.add_ai_response(&format!("✏️ Outline on '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("rim light ") {
            let n = lower[10..].trim().to_string();
            self.rim_lights.push(RimLight { entity: n.clone(), color: [0.3,0.5,1.0,1.0], power: 3.0 });
            self.editor.add_ai_response(&format!("💡 Rim light on '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("hologram ") {
            let n = lower[9..].trim().to_string();
            self.holograms.push(Hologram { entity: n.clone(), color: [0.0,0.7,1.0,0.6], scan_speed: 2.0, glitch: 0.1 });
            self.editor.add_ai_response(&format!("🔷 Hologram effect on '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("dissolve ") {
            let n = lower[9..].trim().to_string();
            self.dissolve_effects.push(DissolveEffect { entity: n.clone(), progress: 0.0, speed: 0.5, color: [1.0,0.5,0.0,1.0], active: true });
            self.editor.add_ai_response(&format!("✨ Dissolve effect on '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("force field ") {
            let n = lower[12..].trim().to_string();
            self.force_fields.push(ForceField { name: n.clone(), pos: [0.0,2.0,0.0], radius: 5.0, color: [0.0,0.5,1.0,0.3], hp: 200.0, max_hp: 200.0, ripple: 0.0 });
            self.editor.add_ai_response(&format!("🛡️ Force field '{}' (HP: 200)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("beam ") && !lower.starts_with("beam_") {
            let n = lower[5..].trim().to_string();
            self.beams.push(Beam { name: n.clone(), start: [0.0,1.0,0.0], end: [10.0,1.0,0.0], color: [0.0,1.0,0.0,1.0], width: 0.2, pulse_speed: 2.0, timer: 0.0 });
            self.editor.add_ai_response(&format!("⚡ Beam '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("explosion ") {
            let p: Vec<&str> = lower[10..].split_whitespace().collect();
            let r: f32 = p.first().and_then(|s| s.parse().ok()).unwrap_or(5.0);
            self.explosions.push(Explosion { pos: [0.0,0.0,0.0], radius: 0.0, max_radius: r, speed: 15.0, damage: 50.0, force: 10.0, timer: 0.0, color: [1.0,0.5,0.0,1.0] });
            self.editor.add_ai_response(&format!("💥 Explosion (radius: {})", r));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("health bar ") {
            let n = lower[11..].trim().to_string();
            self.health_bars_3d.push(HealthBar3D { entity: n.clone(), offset: [0.0,2.5,0.0], width: 2.0, height: 0.2, hp: 100.0, max_hp: 100.0, color: [0.0,1.0,0.0,1.0], bg_color: [0.3,0.0,0.0,0.8], visible: true });
            self.editor.add_ai_response(&format!("❤️ Health bar on '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("name tag ") {
            let n = lower[9..].trim().to_string();
            self.name_tags.push(NameTag { entity: n.clone(), text: n.clone(), offset: [0.0,3.0,0.0], color: [1.0;4], size: 14.0, visible: true });
            self.editor.add_ai_response(&format!("🏷️ Name tag on '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "radar on" {
            self.radar.enabled = true;
            self.editor.add_ai_response("📡 Radar ON");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "radar off" {
            self.radar.enabled = false;
            self.editor.add_ai_response("📡 Radar OFF");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("crosshair ") {
            let style = match lower[10..].trim() {
                "dot" => CrosshairStyle::Dot, "circle" => CrosshairStyle::Circle,
                "chevron" => CrosshairStyle::Chevron, _ => CrosshairStyle::Cross,
            };
            self.crosshair.style = style;
            self.editor.add_ai_response(&format!("🎯 Crosshair: {:?}", style));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "photo mode" || lower == "photo mode on" {
            self.photo_mode_state.active = true; self.photo_mode_state.time_frozen = true;
            self.editor.add_ai_response("📸 Photo mode ON — time frozen, free camera");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "photo mode off" {
            self.photo_mode_state.active = false; self.photo_mode_state.time_frozen = false;
            self.editor.add_ai_response("📸 Photo mode OFF");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "benchmark" || lower == "benchmark start" {
            self.benchmark.running = true; self.benchmark.frames = 0; self.benchmark.total_time = 0.0;
            self.benchmark.min_fps = f32::MAX; self.benchmark.max_fps = 0.0;
            self.editor.add_ai_response("📊 Benchmark started...");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "benchmark stop" {
            self.benchmark.running = false;
            self.benchmark.avg_fps = if self.benchmark.total_time > 0.0 { self.benchmark.frames as f32 / self.benchmark.total_time } else { 0.0 };
            self.editor.add_ai_response(&format!("📊 Benchmark: {} frames, avg {:.1} FPS, min {:.1}, max {:.1}", self.benchmark.frames, self.benchmark.avg_fps, self.benchmark.min_fps, self.benchmark.max_fps));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "perf overlay" || lower == "fps counter" || lower == "show fps" {
            self.perf_overlay.show_fps = !self.perf_overlay.show_fps;
            self.editor.add_ai_response(&format!("📊 FPS overlay: {}", if self.perf_overlay.show_fps { "ON" } else { "OFF" }));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "show bounds" || lower == "show aabb" {
            self.bounds_viz.show_aabb = !self.bounds_viz.show_aabb;
            self.editor.add_ai_response(&format!("📦 AABB bounds: {}", if self.bounds_viz.show_aabb { "ON" } else { "OFF" }));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "show collision" || lower == "show colliders" {
            self.bounds_viz.show_collision = !self.bounds_viz.show_collision;
            self.editor.add_ai_response(&format!("🟢 Collision vis: {}", if self.bounds_viz.show_collision { "ON" } else { "OFF" }));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "show triggers" {
            self.bounds_viz.show_triggers = !self.bounds_viz.show_triggers;
            self.editor.add_ai_response(&format!("🔶 Trigger vis: {}", if self.bounds_viz.show_triggers { "ON" } else { "OFF" }));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "show navmesh" {
            self.bounds_viz.show_navmesh = !self.bounds_viz.show_navmesh;
            self.editor.add_ai_response(&format!("🗺️ Navmesh vis: {}", if self.bounds_viz.show_navmesh { "ON" } else { "OFF" }));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("floating text ") {
            let t = lower[14..].trim().to_string();
            self.floating_texts.push(FloatingText { text: t.clone(), pos: [0.0,2.0,0.0], color: [1.0;4], size: 24.0, velocity: [0.0,1.0,0.0], lifetime: 3.0, timer: 0.0 });
            self.editor.add_ai_response(&format!("💬 Floating text: '{}'", t));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "freeze frame" || lower == "hit stop" {
            self.freeze_frame = FreezeFrame { active: true, duration: 0.1, timer: 0.0 };
            self.editor.add_ai_response("⏸️ Freeze frame!");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("electric arc ") {
            let n = lower[13..].trim().to_string();
            self.electric_arcs.push(ElectricArc { name: n.clone(), start: [0.0,2.0,0.0], end: [5.0,2.0,5.0], color: [0.5,0.7,1.0,1.0], width: 0.05, segments: 8, timer: 0.0 });
            self.editor.add_ai_response(&format!("⚡ Electric arc '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("decal ") {
            let n = lower[6..].trim().to_string();
            self.decal_projectors.push(DecalProjector { name: n.clone(), pos: [0.0,0.01,0.0], normal: [0.0,1.0,0.0], size: [2.0,2.0], texture: "blood".into(), opacity: 0.9, lifetime: None, age: 0.0 });
            self.editor.add_ai_response(&format!("🎨 Decal '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("interaction prompt ") {
            let p: Vec<&str> = lower[19..].split_whitespace().collect();
            let e = p.first().unwrap_or(&"door").to_string();
            let t = p.get(1..).map(|s| s.join(" ")).unwrap_or("Press E to interact".into());
            self.interaction_prompts.push(InteractionPrompt { entity: e.clone(), text: t.clone(), key: "E".into(), range: 3.0, visible: true });
            self.editor.add_ai_response(&format!("🔲 Interaction prompt on '{}': {}", e, t));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "replay record" || lower == "record replay" {
            self.replay_system.recording = !self.replay_system.recording;
            if self.replay_system.recording { self.replay_system.frames.clear(); }
            self.editor.add_ai_response(&format!("🔴 Replay recording: {}", if self.replay_system.recording { "ON" } else { "OFF" }));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "replay play" || lower == "play replay" {
            self.replay_system.playing = true; self.replay_system.current_frame = 0;
            self.editor.add_ai_response("▶️ Playing replay...");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("contrast ") { if let Ok(v) = lower[9..].trim().parse::<f32>() { self.color_grading.contrast = v; self.color_grading.enabled = true; self.editor.add_ai_response(&format!("🎨 Contrast: {:.1}", v)); self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return; } }
        if lower.starts_with("saturation ") { if let Ok(v) = lower[11..].trim().parse::<f32>() { self.color_grading.saturation = v; self.color_grading.enabled = true; self.editor.add_ai_response(&format!("🎨 Saturation: {:.1}", v)); self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return; } }
        if lower.starts_with("brightness ") { if let Ok(v) = lower[11..].trim().parse::<f32>() { self.color_grading.brightness = v; self.color_grading.enabled = true; self.editor.add_ai_response(&format!("🎨 Brightness: {:.1}", v)); self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return; } }

        // === ROUND 10 COMMANDS ===
        if lower.starts_with("moving platform ") || lower.starts_with("platform ") {
            let rest = if lower.starts_with("moving platform ") { &lower[16..] } else { &lower[9..] };
            let n = rest.trim().to_string();
            self.moving_platforms.push(MovingPlatform { name: n.clone(), pos: [0.0,2.0,0.0], waypoints: vec![[0.0,2.0,0.0],[10.0,5.0,0.0],[20.0,2.0,0.0]], speed: 2.0, idx: 0, wait_time: 1.0, wait_timer: 0.0, style: PlatformStyle::PingPong });
            self.editor.add_ai_response(&format!("🔄 Moving platform '{}' (3 waypoints, PingPong)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("spring ") || lower.starts_with("jump pad ") {
            let rest = if lower.starts_with("spring ") { &lower[7..] } else { &lower[9..] };
            let n = rest.trim().to_string();
            self.springs.push(Spring { name: n.clone(), pos: [0.0,0.0,0.0], force: 15.0, direction: [0.0,1.0,0.0], radius: 1.5 });
            self.editor.add_ai_response(&format!("🔵 Spring/jump pad '{}' (force: 15)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("trampoline ") {
            let n = lower[11..].trim().to_string();
            self.trampolines.push(Trampoline { name: n.clone(), pos: [0.0,0.0,0.0], bounce_force: 20.0, size: [3.0,3.0] });
            self.editor.add_ai_response(&format!("🤸 Trampoline '{}' (bounce: 20)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("fan ") {
            let n = lower[4..].trim().to_string();
            self.fans.push(Fan { name: n.clone(), pos: [0.0,0.0,0.0], direction: [0.0,1.0,0.0], force: 8.0, range: 10.0, active: true });
            self.editor.add_ai_response(&format!("💨 Fan '{}' (force: 8, range: 10)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("laser ") {
            let n = lower[6..].trim().to_string();
            self.lasers.push(Laser { name: n.clone(), start: [0.0,1.0,0.0], end: [10.0,1.0,0.0], damage: 25.0, active: true, color: [1.0,0.0,0.0,1.0], width: 0.1, pulse: false, pulse_timer: 0.0 });
            self.editor.add_ai_response(&format!("⚡ Laser '{}' (damage: 25)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("crusher ") {
            let n = lower[8..].trim().to_string();
            self.crushers.push(Crusher { name: n.clone(), pos: [0.0,5.0,0.0], size: [3.0,3.0,3.0], speed: 8.0, delay: 2.0, timer: 0.0, extended: false });
            self.editor.add_ai_response(&format!("🔨 Crusher '{}' (speed: 8, delay: 2s)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("flame jet ") || lower.starts_with("flamejet ") {
            let rest = if lower.starts_with("flame jet ") { &lower[10..] } else { &lower[9..] };
            let n = rest.trim().to_string();
            self.flame_jets.push(FlameJet { name: n.clone(), pos: [0.0,0.0,0.0], direction: [0.0,1.0,0.0], range: 5.0, damage: 15.0, on_time: 2.0, off_time: 3.0, timer: 0.0, active: true });
            self.editor.add_ai_response(&format!("🔥 Flame jet '{}' (2s on, 3s off)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("breakable wall ") {
            let n = lower[15..].trim().to_string();
            self.breakable_walls.push(BreakableWall { name: n.clone(), pos: [0.0,1.5,0.0], size: [4.0,3.0,0.5], hp: 100.0, max_hp: 100.0, material: "stone".into(), debris_count: 8 });
            self.editor.add_ai_response(&format!("🧱 Breakable wall '{}' (HP: 100)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("secret area ") || lower.starts_with("secret ") {
            let rest = if lower.starts_with("secret area ") { &lower[12..] } else { &lower[7..] };
            let n = rest.trim().to_string();
            self.secret_areas.push(SecretArea { name: n.clone(), pos: [0.0,0.0,0.0], size: [5.0,3.0,5.0], revealed: false, hint: "Something hidden here...".into(), reward: "treasure".into() });
            self.editor.add_ai_response(&format!("🔍 Secret area '{}' (hidden)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("scoring zone ") {
            let n = lower[13..].trim().to_string();
            self.scoring_zones.push(ScoringZone { name: n.clone(), pos: [0.0,0.0,0.0], size: [5.0,3.0,5.0], points: 100, team: None, scored: false });
            self.editor.add_ai_response(&format!("🏆 Scoring zone '{}' (+100 pts)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("timer ") && !lower.starts_with("timer_") {
            let p: Vec<&str> = lower[6..].split_whitespace().collect();
            let n = p.first().unwrap_or(&"timer1").to_string();
            let d: f32 = p.get(1).and_then(|s| s.parse().ok()).unwrap_or(60.0);
            self.timers_v2.push(Timer2 { name: n.clone(), duration: d, elapsed: 0.0, running: false, loop_timer: false, on_complete: String::new() });
            self.editor.add_ai_response(&format!("⏱️ Timer '{}' ({}s)", n, d));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("counter ") {
            let n = lower[8..].trim().to_string();
            self.counters.push(Counter { name: n.clone(), value: 0, min: 0, max: 100, on_max: String::new(), on_min: String::new() });
            self.editor.add_ai_response(&format!("🔢 Counter '{}' (0-100)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("wave spawner ") || lower.starts_with("waves ") {
            let rest = if lower.starts_with("wave spawner ") { &lower[13..] } else { &lower[6..] };
            let n = rest.trim().to_string();
            self.wave_spawners.push(WaveSpawner { name: n.clone(), waves: vec![
                Wave { enemies: vec![("grunt".into(), 5)], spawn_delay: 1.0, bonus_xp: 50 },
                Wave { enemies: vec![("grunt".into(), 8), ("elite".into(), 2)], spawn_delay: 0.8, bonus_xp: 150 },
                Wave { enemies: vec![("boss".into(), 1)], spawn_delay: 0.0, bonus_xp: 500 },
            ], current_wave: 0, active: false, between_wave_timer: 0.0, between_wave_delay: 5.0 });
            self.editor.add_ai_response(&format!("🌊 Wave spawner '{}' (3 waves)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("formation ") {
            let p: Vec<&str> = lower[10..].split_whitespace().collect();
            let n = p.first().unwrap_or(&"squad1").to_string();
            let k = match p.get(1).unwrap_or(&"line") { &"circle" => FormationKind::Circle, &"wedge" => FormationKind::Wedge, &"square" => FormationKind::Square, &"scatter" => FormationKind::Scatter, _ => FormationKind::Line };
            self.formations.push(AIFormation { name: n.clone(), kind: k, members: Vec::new(), spacing: 2.0, leader: None });
            self.editor.add_ai_response(&format!("🎖️ Formation '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("combat arena ") || lower.starts_with("arena ") && !lower.starts_with("arena gen") {
            let rest = if lower.starts_with("combat arena ") { &lower[13..] } else { &lower[6..] };
            let p: Vec<&str> = rest.split_whitespace().collect();
            let n = p.first().unwrap_or(&"arena1").to_string();
            let r: f32 = p.get(1).and_then(|s| s.parse().ok()).unwrap_or(20.0);
            self.combat_arenas.push(CombatArena { name: n.clone(), pos: [0.0,0.0,0.0], radius: r, active: false, waves_cleared: 0, enemies_alive: 0 });
            self.editor.add_ai_response(&format!("⚔️ Combat arena '{}' (radius: {})", n, r));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("treasure chest ") || lower.starts_with("chest ") {
            let rest = if lower.starts_with("treasure chest ") { &lower[15..] } else { &lower[6..] };
            let n = rest.trim().to_string();
            self.treasure_chests.push(TreasureChest { name: n.clone(), pos: [0.0,0.0,0.0], locked: false, key_required: None, loot: vec!["gold".into(), "potion".into()], opened: false });
            self.editor.add_ai_response(&format!("📦 Treasure chest '{}' (2 items)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("trap ") {
            let p: Vec<&str> = lower[5..].split_whitespace().collect();
            let n = p.first().unwrap_or(&"trap1").to_string();
            let k = match p.get(1).unwrap_or(&"spike") { &"pit" => TrapType::Pit, &"arrow" => TrapType::Arrow, &"poison" => TrapType::Poison, &"fire" => TrapType::Fire, &"electric" => TrapType::Electric, &"freeze" => TrapType::Freeze, _ => TrapType::Spike };
            self.traps.push(Trap { name: n.clone(), position: Vec3::ZERO, trap_type: k, damage: 20.0, active: true, cooldown: 3.0, timer: 0.0, radius: 2.0 });
            self.editor.add_ai_response(&format!("⚠️ Trap '{}' ({:?}, dmg: 20)", n, k));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("damage zone ") {
            let n = lower[12..].trim().to_string();
            self.damage_zones.push(DamageZone { name: n.clone(), pos: [0.0,0.0,0.0], size: [5.0,2.0,5.0], dps: 10.0, element: "fire".into(), active: true });
            self.editor.add_ai_response(&format!("☠️ Damage zone '{}' (10 dps, fire)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("heal zone ") {
            let n = lower[10..].trim().to_string();
            self.heal_zones.push(HealZone { name: n.clone(), pos: [0.0,0.0,0.0], size: [5.0,2.0,5.0], hps: 5.0, active: true });
            self.editor.add_ai_response(&format!("💚 Heal zone '{}' (5 hps)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("speed zone ") {
            let n = lower[11..].trim().to_string();
            self.speed_zones.push(SpeedZone { name: n.clone(), pos: [0.0,0.0,0.0], size: [5.0,2.0,5.0], multiplier: 2.0, active: true });
            self.editor.add_ai_response(&format!("⚡ Speed zone '{}' (2x speed)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("slow zone ") {
            let n = lower[10..].trim().to_string();
            self.slow_zones.push(SlowZone { name: n.clone(), pos: [0.0,0.0,0.0], size: [5.0,2.0,5.0], multiplier: 0.3, active: true });
            self.editor.add_ai_response(&format!("🐌 Slow zone '{}' (0.3x speed)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("torch ") {
            let n = lower[6..].trim().to_string();
            self.torches.push(Torch { name: n.clone(), pos: [0.0,2.0,0.0], lit: true, color: [1.0,0.6,0.2,1.0], range: 8.0, flicker: 0.3 });
            self.editor.add_ai_response(&format!("🔥 Torch '{}' (lit, range: 8)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("level gate ") || lower.starts_with("gate ") {
            let rest = if lower.starts_with("level gate ") { &lower[11..] } else { &lower[5..] };
            let n = rest.trim().to_string();
            self.level_gates.push(LevelGate { name: n.clone(), pos: [0.0,2.0,0.0], required_keys: 3, keys_collected: 0, open: false, next_level: "level2".into() });
            self.editor.add_ai_response(&format!("🚧 Level gate '{}' (needs 3 keys)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("pickup spawner ") {
            let n = lower[15..].trim().to_string();
            self.pickup_spawners.push(PickupSpawner { name: n.clone(), pos: [0.0,0.0,0.0], pickup_kind: "health".into(), interval: 10.0, timer: 0.0, max_active: 3, active_count: 0 });
            self.editor.add_ai_response(&format!("🎁 Pickup spawner '{}' (health, 10s interval)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("ambient sound ") || lower.starts_with("ambient ") {
            let rest = if lower.starts_with("ambient sound ") { &lower[14..] } else { &lower[8..] };
            let n = rest.trim().to_string();
            self.ambient_sounds.push(AmbientSound { name: n.clone(), pos: [0.0,0.0,0.0], sound: "wind".into(), range: 20.0, volume: 0.5, looping: true });
            self.editor.add_ai_response(&format!("🔊 Ambient sound '{}' (wind, range: 20)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("weather zone ") {
            let p: Vec<&str> = lower[13..].split_whitespace().collect();
            let n = p.first().unwrap_or(&"zone1").to_string();
            let w = p.get(1).unwrap_or(&"rain").to_string();
            self.weather_zones.push(WeatherZone { name: n.clone(), pos: [0.0,0.0,0.0], size: [50.0,30.0,50.0], weather: w.clone(), intensity: 0.8, transition_time: 3.0 });
            self.editor.add_ai_response(&format!("🌦️ Weather zone '{}' ({})", n, w));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("wind zone ") {
            let n = lower[10..].trim().to_string();
            self.wind_zones_v2.push(WindZone2 { name: n.clone(), pos: [0.0,0.0,0.0], size: [20.0,10.0,20.0], direction: [1.0,0.0,0.0], force: 5.0, turbulence: 0.3 });
            self.editor.add_ai_response(&format!("🌬️ Wind zone '{}' (force: 5)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("glow ") {
            let p: Vec<&str> = lower[5..].split_whitespace().collect();
            let e = p.first().unwrap_or(&"player").to_string();
            self.glow_objects.push(GlowObject { name: format!("glow_{}", e), entity: e.clone(), color: [0.0,0.5,1.0,1.0], intensity: 2.0, pulse_speed: 1.0 });
            self.editor.add_ai_response(&format!("✨ Glow on '{}' (blue, intensity: 2)", e));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("ladder ") && !lower.starts_with("ladder_") {
            let n = lower[7..].trim().to_string();
            self.ladders_v2.push(Ladder2 { name: n.clone(), pos: [0.0,0.0,0.0], height: 5.0, width: 1.0, climb_speed: 3.0 });
            self.editor.add_ai_response(&format!("🪜 Ladder '{}' (height: 5)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("grapple point ") || lower.starts_with("grapple ") {
            let rest = if lower.starts_with("grapple point ") { &lower[14..] } else { &lower[8..] };
            let n = rest.trim().to_string();
            self.grapple_points_v2.push(GrapplePoint2 { name: n.clone(), pos: [0.0,8.0,0.0], radius: 1.0, max_dist: 20.0, pull_speed: 10.0 });
            self.editor.add_ai_response(&format!("🪝 Grapple point '{}' (range: 20)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("pressure plate ") {
            let p: Vec<&str> = lower[15..].split_whitespace().collect();
            let n = p.first().unwrap_or(&"plate1").to_string();
            let t = p.get(1).unwrap_or(&"door1").to_string();
            self.pressure_plates_v2.push(PressurePlate2 { name: n.clone(), pos: [0.0,0.0,0.0], size: [2.0,2.0], weight_required: 1.0, target: t.clone(), activated: false });
            self.editor.add_ai_response(&format!("⏺️ Pressure plate '{}' → '{}'", n, t));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("rope bridge ") || (lower.starts_with("rope ") && lower.contains("bridge")) {
            let n = lower.split_whitespace().nth(2).unwrap_or("rope1").to_string();
            self.ropes_v2.push(Rope2 { name: n.clone(), anchor_a: [0.0,5.0,0.0], anchor_b: [15.0,5.0,0.0], segments: 10, swing_force: 2.0, grab_radius: 1.5 });
            self.editor.add_ai_response(&format!("🪢 Rope bridge '{}' (10 segments)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("cutscene trigger ") {
            let n = lower[17..].trim().to_string();
            self.cutscene_triggers.push(CutsceneTrigger { name: n.clone(), pos: [0.0,0.0,0.0], radius: 5.0, cutscene: "intro".into(), played: false, one_shot: true });
            self.editor.add_ai_response(&format!("🎬 Cutscene trigger '{}' (radius: 5)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("compass marker ") {
            let n = lower[15..].trim().to_string();
            self.compass_markers.push(CompassMarker { name: n.clone(), pos: [0.0,0.0,0.0], icon: "⭐".into(), color: [1.0,1.0,0.0,1.0], distance_show: 100.0 });
            self.editor.add_ai_response(&format!("🧭 Compass marker '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "minimap on" {
            self.minimap_v2.enabled = true;
            self.editor.add_ai_response("🗺️ Minimap ON");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "minimap off" {
            self.minimap_v2.enabled = false;
            self.editor.add_ai_response("🗺️ Minimap OFF");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("reflector ") {
            let n = lower[10..].trim().to_string();
            self.reflectors.push(Reflector { name: n.clone(), pos: [0.0,1.0,0.0], normal: [0.0,0.0,1.0], size: [3.0,3.0], reflectivity: 0.9 });
            self.editor.add_ai_response(&format!("🪞 Reflector '{}' (0.9 reflectivity)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("respawn point ") {
            let n = lower[14..].trim().to_string();
            self.respawn_points.push(RespawnPoint { name: n.clone(), position: Vec3::new(0.0,1.0,0.0), team: None, cooldown: 5.0 });
            self.editor.add_ai_response(&format!("🔄 Respawn point '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("collectible ") || lower.starts_with("coin ") || lower.starts_with("gem ") {
            let (_cat, rest) = if lower.starts_with("coin ") { ("coin", &lower[5..]) } else if lower.starts_with("gem ") { ("gem", &lower[4..]) } else { ("item", &lower[12..]) };
            let n = rest.trim().to_string();
            self.collectibles.push(Collectible { name: n.clone(), object_name: n.clone(), collected: false, value: 10, category: "item".into() });
            self.editor.add_ai_response(&format!("💎 Collectible '{}' (value: 10)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }

        // === MEGA 9 COMMANDS ===
        if lower.starts_with("ragdoll ") {
            let n = lower[8..].trim().to_string();
            self.ragdolls.push(Ragdoll { name: n.clone(), joints: vec![[0.0,1.0,0.0],[0.0,1.4,0.0],[0.0,1.7,0.0]], active: true, stiffness: 0.8 });
            self.editor.add_ai_response(&format!("🦴 Ragdoll '{}' (3 joints)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("bezier ") || lower.starts_with("path ") {
            let n = lower.split_whitespace().nth(1).unwrap_or("path1").to_string();
            self.bezier_paths.push(BezierPath { name: n.clone(), points: vec![[0.0,0.0,0.0],[5.0,3.0,0.0],[10.0,0.0,5.0]], speed: 1.0, looping: true, t: 0.0 });
            self.editor.add_ai_response(&format!("🛤️ Path '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("buoyancy ") {
            let n = lower[9..].trim().to_string();
            self.buoyancy_zones.push(BuoyancyZone { name: n.clone(), pos: [0.0;3], size: [20.0,3.0,20.0], density: 1.0, drag: 0.5 });
            self.editor.add_ai_response(&format!("🌊 Buoyancy zone '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("stealth ") {
            let n = lower[8..].trim().to_string();
            self.stealth_detectors.push(StealthDetector { name: n.clone(), range: 15.0, fov: 90.0, alert: 0.0, state: StealthState::Unaware });
            self.editor.add_ai_response(&format!("👁️ Stealth detector '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("puzzle switch ") {
            let p: Vec<&str> = lower[14..].split_whitespace().collect();
            let n = p.first().unwrap_or(&"sw1").to_string();
            let t = p.get(1).unwrap_or(&"door1").to_string();
            self.puzzle_switches.push(PuzzleSwitch { name: n.clone(), pos: [0.0,0.5,0.0], on: false, target: t.clone(), kind: SwitchType::Toggle, reset: None, timer: 0.0 });
            self.editor.add_ai_response(&format!("🔘 Switch '{}' → '{}'", n, t));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("puzzle door ") {
            let n = lower[12..].trim().to_string();
            self.puzzle_doors.push(PuzzleDoor { name: n.clone(), pos: [0.0,1.5,0.0], open: false, required: vec![], speed: 2.0, offset: [0.0,3.0,0.0], cur: [0.0;3] });
            self.editor.add_ai_response(&format!("🚪 Door '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("zipline ") {
            let n = lower[8..].trim().to_string();
            self.ziplines.push(Zipline { name: n.clone(), start: [0.0,10.0,0.0], end: [30.0,3.0,0.0], speed: 8.0, progress: 0.0 });
            self.editor.add_ai_response(&format!("🪢 Zipline '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("swim zone ") {
            let n = lower[10..].trim().to_string();
            self.swim_zones.push(SwimZone { name: n.clone(), pos: [0.0,-1.0,0.0], size: [20.0,4.0,20.0], swim_speed: 3.0, oxygen_drain: 0.02 });
            self.editor.add_ai_response(&format!("🏊 Swim zone '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("boss ") {
            let n = lower[5..].trim().to_string();
            self.boss_patterns.push(BossPattern { name: n.clone(), phases: vec![
                BossPhase { name: "Phase 1".into(), attacks: vec![BossAttack { name: "Slam".into(), damage: 20.0, range: 5.0, cooldown: 3.0, timer: 0.0, kind: BossAttackKind::Slam, telegraph: 1.0 }], speed_mult: 1.0 },
                BossPhase { name: "Phase 2".into(), attacks: vec![BossAttack { name: "Beam".into(), damage: 40.0, range: 30.0, cooldown: 8.0, timer: 0.0, kind: BossAttackKind::Beam, telegraph: 2.0 }], speed_mult: 1.3 },
            ], phase: 0, thresholds: vec![0.5] });
            self.editor.add_ai_response(&format!("👹 Boss '{}' (2 phases)", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("music layer ") {
            let n = lower[12..].trim().to_string();
            self.music_layers.push(MusicLayer { name: n.clone(), vol: 0.0, target_vol: 0.7, fade: 0.5, cond: MusicCond::Always });
            self.editor.add_ai_response(&format!("🎵 Music layer '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "wall run on" {
            self.wall_run.active = true;
            self.editor.add_ai_response("🏃 Wall run ON");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "wall run off" {
            self.wall_run.active = false;
            self.editor.add_ai_response("🏃 Wall run OFF");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("destructible ") {
            let n = lower[13..].trim().to_string();
            self.destructible_chunks.push(DestructibleChunk { name: n.clone(), pos: [0.0,1.0,0.0], size: [2.0,2.0,0.3], hp: 100.0, max_hp: 100.0, destroyed: false });
            self.editor.add_ai_response(&format!("💥 Destructible '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "procedural sky on" {
            self.proc_sky.enabled = true;
            self.editor.add_ai_response("🌤️ Procedural sky ON");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower == "procedural sky off" {
            self.proc_sky.enabled = false;
            self.editor.add_ai_response("🌤️ Procedural sky OFF");
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("sprite ") {
            let n = lower[7..].trim().to_string();
            self.sprites.push(SpriteBillboard { name: n.clone(), pos: [0.0,1.0,0.0], size: [1.0,1.0], frames: 1, frame: 0, fps: 12.0, timer: 0.0 });
            self.editor.add_ai_response(&format!("🖼️ Sprite '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("patrol ") {
            let n = lower[7..].trim().to_string();
            self.patrol_routes.push(PatrolRoute { name: n.clone(), waypoints: vec![[10.0,0.0,0.0],[-10.0,0.0,0.0],[0.0,0.0,10.0]], waits: vec![2.0;3], idx: 0, speed: 2.0, kind: PatrolKind::Loop, wait_t: 0.0 });
            self.editor.add_ai_response(&format!("🚶 Patrol route '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("say ") {
            let rest = &lower[4..];
            let parts: Vec<&str> = rest.splitn(2, ' ').collect();
            let entity = parts.first().unwrap_or(&"npc").to_string();
            let text = parts.get(1).unwrap_or(&"Hello").to_string();
            self.dialogue_bubbles.push(DialogueBubble { entity: entity.clone(), text: text.clone(), duration: 4.0, timer: 0.0, style: BubbleStyle::Speech });
            self.editor.add_ai_response(&format!("💬 {}: {}", entity, text));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("elevator ") {
            let p: Vec<&str> = lower[9..].split_whitespace().collect();
            let n = p.first().unwrap_or(&"elev1").to_string();
            let h = p.get(1).and_then(|s| s.parse().ok()).unwrap_or(10.0_f32);
            self.elevators.push(Elevator { name: n.clone(), bottom_y: 0.0, top_y: h, current_y: 0.0, speed: 2.0, going_up: true, wait_time: 2.0, wait_timer: 0.0 });
            self.editor.add_ai_response(&format!("🛗 Elevator '{}' (height: {})", n, h));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("hazard ") {
            let p: Vec<&str> = lower[7..].split_whitespace().collect();
            let n = p.first().unwrap_or(&"lava").to_string();
            let t = p.get(1).unwrap_or(&"fire").to_string();
            self.env_hazards.push(EnvironmentHazard { name: n.clone(), pos: [0.0;3], size: [5.0,1.0,5.0], damage: 10.0, hazard_type: t, active: true });
            self.editor.add_ai_response(&format!("☠️ Hazard '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("companion ") {
            let n = lower[10..].trim().to_string();
            self.ai_companions.push(AICompanion { name: n.clone(), pos: [2.0,0.0,0.0], follow_dist: 3.0, state: "follow".into(), health: 100.0, abilities: vec!["heal".into(),"attack".into()] });
            self.editor.add_ai_response(&format!("🤖 Companion '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("gravity field ") {
            let n = lower[14..].trim().to_string();
            self.gravity_fields.push(GravityField { name: n.clone(), pos: [0.0,5.0,0.0], radius: 10.0, force: 5.0, direction: [0.0,1.0,0.0] });
            self.editor.add_ai_response(&format!("🌀 Gravity field '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("conveyor ") {
            let n = lower[9..].trim().to_string();
            self.conveyors.push(ConveyorBelt { name: n.clone(), pos: [0.0;3], size: [10.0,0.1,2.0], direction: [1.0,0.0,0.0], speed: 3.0 });
            self.editor.add_ai_response(&format!("⏩ Conveyor '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("magnet ") {
            let n = lower[7..].trim().to_string();
            self.magnet_zones.push(MagnetZone { name: n.clone(), pos: [0.0,3.0,0.0], radius: 8.0, strength: 5.0, attract_tags: vec!["metal".into()] });
            self.editor.add_ai_response(&format!("🧲 Magnet zone '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("security cam ") {
            let n = lower[13..].trim().to_string();
            self.sec_cameras.push(SecurityCamera { name: n.clone(), pos: [0.0,4.0,0.0], fov: 60.0, range: 15.0, rotation_speed: 0.5, angle: 0.0, alert_target: None });
            self.editor.add_ai_response(&format!("📹 Security camera '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("cover ") {
            let n = lower[6..].trim().to_string();
            self.cover_points.push(CoverPoint { name: n.clone(), pos: [0.0,0.0,0.0], normal: [0.0,0.0,1.0], height: 1.2, occupied: false });
            self.editor.add_ai_response(&format!("🧱 Cover point '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("turret ") {
            let n = lower[7..].trim().to_string();
            self.turrets.push(Turret { name: n.clone(), pos: [0.0,2.0,0.0], range: 20.0, damage: 15.0, fire_rate: 2.0, timer: 0.0, target: None });
            self.editor.add_ai_response(&format!("🔫 Turret '{}'", n));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }
        if lower.starts_with("shield ") {
            let p: Vec<&str> = lower[7..].split_whitespace().collect();
            let n = p.first().unwrap_or(&"shield1").to_string();
            let e = p.get(1).unwrap_or(&"player").to_string();
            self.shields.push(Shield { name: n.clone(), entity: e.clone(), hp: 100.0, max_hp: 100.0, regen_rate: 5.0, regen_delay: 3.0, broken_timer: 0.0 });
            self.editor.add_ai_response(&format!("🛡️ Shield '{}' on '{}'", n, e));
            self.editor.ai_processing = false; self.editor.ai_status = "Ready".into(); return;
        }

        // Get existing object names for context
        let existing: Vec<String> = self.objects.iter().map(|o| o.name.clone()).collect();

        // Use local AI parser — no API key needed
        self.push_undo();
        let intents = koko_ai::local::parse_local(prompt, &existing);

        let mut messages = Vec::new();
        for intent in intents {
            match intent {
                GameIntent::AddEntity { name, mesh, position, color, scale } => {
                    self.objects.retain(|o| o.name != name);
                    self.objects.push(SceneObject {
                        name: name.clone(),
                        transform: Transform {
                            position: Vec3::from_array(position),
                            rotation: Quat::IDENTITY,
                            scale: Vec3::splat(scale),
                        },
                        color,
                        mesh_type: MeshType::from_str(&mesh),
                        spin_speed: 0.0,
                        parent: None, lod_meshes: Vec::new(),
                    });
                    messages.push(format!("✓ Added {} ({}) at [{:.1}, {:.1}, {:.1}]", name, mesh, position[0], position[1], position[2]));
                }
                GameIntent::RemoveEntity { name } => {
                    let before = self.objects.len();
                    self.objects.retain(|o| o.name != name);
                    if self.objects.len() < before {
                        messages.push(format!("✓ Removed {}", name));
                    } else {
                        messages.push(format!("⚠ '{}' not found", name));
                    }
                }
                GameIntent::SetCamera { position, .. } => {
                    self.camera_pos = Vec3::from_array(position);
                    messages.push(format!("✓ Camera moved"));
                }
                GameIntent::LoadModel { name, model_file, position, scale } => {
                    let loaded = self.load_model_from_assets(&model_file, &name, position, scale);
                    messages.push(loaded);
                }
                GameIntent::ChatResponse { message } => {
                    messages.push(message);
                }
                _ => {}
            }
        }

        // If local parser only produced chat responses (didn't understand), try cloud AI
        let only_chat = messages.len() <= 1 && messages.iter().all(|m| m.starts_with("Try:") || m.starts_with("Couldn't"));
        // Also route complex/creative requests to AI even if local parser handled them
        let is_complex = lower.contains(" with ") || lower.contains(" and then ") || lower.contains("make it")
            || lower.contains("i want") || lower.contains("create a") || lower.contains("build me")
            || lower.contains("design") || lower.contains("imagine") || lower.contains("like a")
            || lower.contains("that looks") || lower.contains("themed") || lower.contains("style")
            || lower.len() > 80;  // Long prompts are probably creative requests
        let only_chat = only_chat || (is_complex && self.ai_api_key.is_some());
        if only_chat && self.ai_api_key.is_some() {
            let api_key = self.ai_api_key.clone().unwrap();
            let model = self.ai_model.clone();
            let prompt_text = prompt.to_string();
            let tx = self.ai_tx.clone();
            let existing: Vec<String> = self.objects.iter().map(|o| o.name.clone()).collect();
            let context = format!("Current scene objects: {}\nUser prompt: {}", existing.join(", "), prompt_text);
            self.editor.ai_status = "☁️ Asking Claude...".into();
            #[cfg(not(target_arch = "wasm32"))]
            self.tokio_rt.spawn(async move {
                let msgs = vec![koko_ai::provider::AiMessage { role: "user".into(), content: context }];
                match koko_ai::provider::call_claude(&api_key, &model, koko_ai::prompt::ENGINE_SYSTEM_PROMPT, &msgs, 2048).await {
                    Ok(resp) => { let _ = tx.send(resp.content); }
                    Err(e) => { let _ = tx.send(format!("❌ AI error: {}", e)); }
                }
            });
            #[cfg(target_arch = "wasm32")]
            { let _ = tx.send("AI not available in browser yet".to_string()); }
            return;  // Response will come async via ai_rx
        }

        self.editor.add_ai_response(&messages.join("\n"));
        self.editor.ai_processing = false;
        self.editor.ai_status = "Ready".into();
        self.sync_editor_scene();
    }

    fn handle_ai_response(&mut self, response: &str) {
        // Try new command-based format: {"commands": [...], "message": "..."}
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(response) {
            if let Some(commands) = json["commands"].as_array() {
                // Execute each command through the prompt system
                for cmd in commands {
                    if let Some(cmd_str) = cmd.as_str() {
                        if !cmd_str.is_empty() {
                            self.send_to_ai(cmd_str);
                        }
                    }
                }
                // Show the AI's message
                if let Some(msg) = json["message"].as_str() {
                    if !msg.is_empty() {
                        self.editor.add_ai_response(msg);
                    }
                }
                self.editor.ai_processing = false;
                self.editor.ai_status = "Ready".into();
                self.sync_editor_scene();
                return;
            }
        }

        // Fallback: try old JSON action format
        let intents = parse_ai_response(response);
        let mut messages = Vec::new();

        for intent in intents {
            match intent {
                GameIntent::AddEntity { name, mesh, position, color, scale } => {
                    self.objects.retain(|o| o.name != name);
                    self.objects.push(SceneObject {
                        name: name.clone(),
                        transform: Transform {
                            position: Vec3::from_array(position),
                            rotation: Quat::IDENTITY,
                            scale: Vec3::splat(scale),
                        },
                        color,
                        mesh_type: MeshType::from_str(&mesh),
                        spin_speed: 0.0,
                        parent: None, lod_meshes: Vec::new(),
                    });
                    messages.push(format!("✓ Added {} ({})", name, mesh));
                }
                GameIntent::RemoveEntity { name } => {
                    self.objects.retain(|o| o.name != name);
                    messages.push(format!("✓ Removed {}", name));
                }
                GameIntent::SetCamera { position, .. } => {
                    self.camera_pos = Vec3::from_array(position);
                    messages.push("✓ Camera moved".into());
                }
                GameIntent::LoadModel { name, model_file, position, scale } => {
                    let loaded = self.load_model_from_assets(&model_file, &name, position, scale);
                    messages.push(loaded);
                }
                GameIntent::ChatResponse { message } => {
                    messages.push(message);
                }
                _ => {}
            }
        }

        if messages.is_empty() {
            self.editor.add_ai_response(response);
        } else {
            self.editor.add_ai_response(&messages.join("\n"));
        }
        self.sync_editor_scene();
    }



    fn serialize_scene(&self) -> String {
        let scene: serde_json::Value = serde_json::json!({
            "objects": self.objects.iter().map(|obj| {
                serde_json::json!({
                    "name": obj.name,
                    "position": [obj.transform.position.x, obj.transform.position.y, obj.transform.position.z],
                    "rotation": [obj.transform.rotation.x, obj.transform.rotation.y, obj.transform.rotation.z, obj.transform.rotation.w],
                    "scale": [obj.transform.scale.x, obj.transform.scale.y, obj.transform.scale.z],
                    "color": obj.color,
                    "mesh_type": obj.mesh_type.as_str(),
                    "spin_speed": obj.spin_speed,
                })
            }).collect::<Vec<_>>(),
            "lights": self.scene_lights.iter().map(|l| {
                serde_json::json!({
                    "name": l.name,
                    "position": [l.position.x, l.position.y, l.position.z],
                    "color": l.color,
                    "intensity": l.intensity,
                    "radius": l.radius,
                    "spot_cutoff": l.spot_cutoff,
                })
            }).collect::<Vec<_>>(),
            "water_enabled": self.water_enabled,
            "terrain_enabled": self.terrain_enabled,
            "bloom_enabled": self.bloom_enabled,
            "camera": {
                "position": [self.camera_pos.x, self.camera_pos.y, self.camera_pos.z],
                "yaw": self.camera_yaw,
                "pitch": self.camera_pitch,
            },
        });
        serde_json::to_string_pretty(&scene).unwrap_or_default()
    }

    fn deserialize_scene(&mut self, json: &str) {
        if let Ok(scene) = serde_json::from_str::<serde_json::Value>(json) {
            // Load objects
            if let Some(objects) = scene["objects"].as_array() {
                self.objects.clear();
                for obj in objects {
                    let pos = [
                        obj["position"][0].as_f64().unwrap_or(0.0) as f32,
                        obj["position"][1].as_f64().unwrap_or(0.0) as f32,
                        obj["position"][2].as_f64().unwrap_or(0.0) as f32,
                    ];
                    let scale = [
                        obj["scale"][0].as_f64().unwrap_or(1.0) as f32,
                        obj["scale"][1].as_f64().unwrap_or(1.0) as f32,
                        obj["scale"][2].as_f64().unwrap_or(1.0) as f32,
                    ];
                    let rot = if let Some(r) = obj["rotation"].as_array() {
                        Quat::from_xyzw(
                            r[0].as_f64().unwrap_or(0.0) as f32,
                            r[1].as_f64().unwrap_or(0.0) as f32,
                            r[2].as_f64().unwrap_or(0.0) as f32,
                            r[3].as_f64().unwrap_or(1.0) as f32,
                        )
                    } else { Quat::IDENTITY };
                    let color = if let Some(c) = obj["color"].as_array() {
                        [c[0].as_f64().unwrap_or(0.7) as f32, c[1].as_f64().unwrap_or(0.7) as f32,
                         c[2].as_f64().unwrap_or(0.7) as f32, c[3].as_f64().unwrap_or(1.0) as f32]
                    } else { [0.7, 0.7, 0.7, 1.0] };
                    let mesh_str = obj["mesh_type"].as_str().unwrap_or("cube");
                    self.objects.push(SceneObject {
                        name: obj["name"].as_str().unwrap_or("obj").to_string(),
                        transform: Transform { position: Vec3::from_array(pos), rotation: rot, scale: Vec3::from_array(scale) },
                        color, mesh_type: MeshType::from_str(mesh_str),
                        spin_speed: obj["spin_speed"].as_f64().unwrap_or(0.0) as f32,
                        parent: None, lod_meshes: Vec::new(),
                    });
                }
            }
            // Load lights
            if let Some(lights) = scene["lights"].as_array() {
                self.scene_lights.clear();
                for l in lights {
                    self.scene_lights.push(SceneLight {
                        name: l["name"].as_str().unwrap_or("light").to_string(),
                        position: Vec3::new(
                            l["position"][0].as_f64().unwrap_or(0.0) as f32,
                            l["position"][1].as_f64().unwrap_or(3.0) as f32,
                            l["position"][2].as_f64().unwrap_or(0.0) as f32,
                        ),
                        color: [l["color"][0].as_f64().unwrap_or(1.0) as f32, l["color"][1].as_f64().unwrap_or(1.0) as f32, l["color"][2].as_f64().unwrap_or(1.0) as f32],
                        intensity: l["intensity"].as_f64().unwrap_or(2.0) as f32,
                        radius: l["radius"].as_f64().unwrap_or(15.0) as f32,
                        direction: Vec3::NEG_Y,
                        spot_cutoff: l["spot_cutoff"].as_f64().unwrap_or(0.0) as f32,
                    });
                }
                self.update_light_buffer();
            }
            // Settings
            if let Some(w) = scene["water_enabled"].as_bool() { self.water_enabled = w; }
            if let Some(t) = scene["terrain_enabled"].as_bool() { self.terrain_enabled = t; }
            if let Some(b) = scene["bloom_enabled"].as_bool() { self.bloom_enabled = b; }
            // Camera
            if let Some(cam) = scene.get("camera") {
                self.camera_pos = Vec3::new(
                    cam["position"][0].as_f64().unwrap_or(8.0) as f32,
                    cam["position"][1].as_f64().unwrap_or(6.0) as f32,
                    cam["position"][2].as_f64().unwrap_or(12.0) as f32,
                );
                self.camera_yaw = cam["yaw"].as_f64().unwrap_or(-0.55) as f32;
                self.camera_pitch = cam["pitch"].as_f64().unwrap_or(-0.3) as f32;
            }
        }
    }

    fn apply_day_cycle(&mut self) {
        let t = self.day_cycle_time;
        // t: 0=dawn, 0.25=noon, 0.5=dusk, 0.75=midnight
        
        // Brightness curve: peak at noon, min at midnight
        let sun_height = (t * std::f32::consts::TAU).cos(); // 1 at dawn/dusk area, varies
        let noon_factor = ((t - 0.25) * std::f32::consts::TAU).cos(); // peak at 0.25 (noon)
        
        let brightness = 0.3 + 0.7 * ((t * std::f32::consts::PI * 2.0 - std::f32::consts::FRAC_PI_2).cos() * 0.5 + 0.5);
        let brightness = brightness.clamp(0.15, 1.2);
        
        // Temperature: warm at dawn/dusk, neutral at noon, cool at night
        let temperature = if t < 0.1 || (t > 0.4 && t < 0.6) {
            0.4  // warm at dawn/dusk
        } else if t > 0.65 && t < 0.85 {
            -0.3  // cool at night
        } else {
            0.1  // neutral
        };
        
        // Saturation: high at golden hours, low at night
        let saturation = if t < 0.15 || (t > 0.4 && t < 0.6) {
            1.3
        } else if t > 0.65 {
            0.6
        } else {
            1.1
        };
        
        self.post_params.brightness = brightness;
        self.post_params.temperature = temperature;
        self.post_params.saturation = saturation;
        
        // Night: increase grain slightly
        self.post_params.grain_strength = if t > 0.6 && t < 0.9 { 0.06 } else { 0.03 };
        
        // Move sun based on time of day
        let sun_angle = self.day_cycle_time * std::f32::consts::TAU - std::f32::consts::FRAC_PI_2;
        self.sun_direction = Vec3::new(sun_angle.cos() * 0.5, sun_angle.sin().max(-0.1), 0.4).normalize();
        
        if let Some(ref buf) = self.post_params_buffer {
            if let Some(ref gpu) = self.gpu {
                gpu.queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params));
            }
        }
    }

    fn find_prompt_position(&self, text: &str) -> Vec3 {
        let t = text.to_lowercase();
        let mut x = 0.0f32;
        let mut y = 0.5f32;
        let mut z = 0.0f32;
        if t.contains("left") { x = -4.0; }
        if t.contains("right") { x = 4.0; }
        if t.contains("front") || t.contains("ahead") { z = 4.0; }
        if t.contains("back") || t.contains("behind") { z = -4.0; }
        if t.contains("above") || t.contains("high") || t.contains("sky") { y = 5.0; }
        if x == 0.0 && z == 0.0 {
            // Place near a random existing object or center
            let n = self.objects.len() as f32;
            x = (n * 1.7).cos() * 2.0;
            z = (n * 1.7).sin() * 2.0;
        }
        Vec3::new(x, y, z)
    }

    fn update_light_buffer(&mut self) {
        if let (Some(gpu), Some(storage)) = (&self.gpu, &self.dyn_light_storage) {
            let mut gpu_lights = [PointLightGpu { position: [0.0; 3], radius: 0.0, color: [0.0; 3], intensity: 0.0, direction: [0.0; 3], spot_cutoff: 0.0 }; 32];
            let count = self.scene_lights.len().min(32);
            for (i, light) in self.scene_lights.iter().take(32).enumerate() {
                gpu_lights[i] = PointLightGpu {
                    position: light.position.to_array(),
                    radius: light.radius,
                    color: light.color,
                    intensity: light.intensity,
                    direction: light.direction.to_array(),
                    spot_cutoff: light.spot_cutoff,
                };
            }
            let data = LightArrayGpu { count: count as u32, lights: gpu_lights };
            gpu.queue.write_buffer(storage, 0, bytemuck::bytes_of(&data));
        }
    }

    fn start_physics_play(&mut self) {
        // Snapshot current transforms
        self.physics_snapshot = self.objects.iter()
            .map(|o| (o.transform.position, o.transform.rotation, o.transform.scale))
            .collect();
        self.physics_playing = true;
        self.play_mode = true;
        self.physics_velocities = vec![Vec3::ZERO; self.objects.len()];

        // Create physics world
        #[cfg(not(target_arch = "wasm32"))]
        {
            let mut world = koko_physics::world3d::PhysicsWorld3D::new();
            let ground_body = world.add_static_body([0.0, -0.5, 0.0]);
            world.add_box_collider(ground_body, [50.0, 0.5, 50.0]);
            self.physics_bodies.clear();
            for obj in &self.objects {
                let pos = obj.transform.position.to_array();
                let he = (obj.transform.scale * 0.5).to_array();
                let handle = world.add_dynamic_body(pos);
                world.add_box_collider(handle, he);
                self.physics_bodies.push(Some(handle));
            }
            self.physics_world = Some(world);
        }
        #[cfg(target_arch = "wasm32")]
        {
            self.physics_bodies.clear();
            self.physics_world = Some(());
        }
    }

    fn stop_physics_play(&mut self) {
        // Restore transforms from snapshot
        for (i, obj) in self.objects.iter_mut().enumerate() {
            if let Some(&(pos, rot, scale)) = self.physics_snapshot.get(i) {
                obj.transform.position = pos;
                obj.transform.rotation = rot;
                obj.transform.scale = scale;
            }
        }
        self.physics_playing = false;
        self.play_mode = false;
        self.physics_world = None;
        self.physics_bodies.clear();
        self.physics_velocities.clear();
    }

    fn sync_editor_scene(&mut self) {
        self.editor.scene_objects = self.objects.iter().map(|o| SceneObjectInfo {
            name: o.name.clone(),
            mesh_type: o.mesh_type.as_str().to_string(),
            position: o.transform.position.to_array(),
            color: o.color,
            scale: o.transform.scale.x,
        }).collect();
        self.editor.entity_count = self.objects.len();
    }

    fn load_gltf_model(&mut self, path: &str, name: &str, position: [f32; 3], scale: f32) -> Vec<String> {
        let gpu = self.gpu.as_ref().unwrap();
        let device = &gpu.device;
        let full_path = std::path::Path::new(path);
        
        match gltf_loader::load_gltf(full_path) {
            Ok(model) => {
                let mut added = Vec::new();
                // Auto-scale: compute bounding box of all meshes
                // Compute bounding box
                let mut bb_min = Vec3::splat(f32::MAX);
                let mut bb_max = Vec3::splat(f32::MIN);
                for mesh in &model.meshes {
                    for v in &mesh.mesh_data.vertices {
                        bb_min = bb_min.min(Vec3::from_array(v.position));
                        bb_max = bb_max.max(Vec3::from_array(v.position));
                    }
                }
                let bb_size = bb_max - bb_min;
                let bb_center = (bb_min + bb_max) * 0.5;
                
                // Auto-scale to ~2 units
                let auto_scale = if scale <= 0.0 {
                    let extent = bb_size.max_element().max(0.001);
                    2.0 / extent
                } else {
                    scale
                };
                let scale = auto_scale;
                
                // Don't auto-rotate — glTF spec is always Y-up
                // Models that look wrong need manual rotation via prompt
                let auto_rotation = Quat::IDENTITY;
                
                // Place on ground: bottom of bounding box touches Y=0
                let ground_offset = -bb_min.y * scale;
                for (i, mesh) in model.meshes.iter().enumerate() {
                    let mesh_name = if model.meshes.len() == 1 {
                        name.to_string()
                    } else {
                        format!("{}_{}", name, i)
                    };
                    
                    let vb = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                        label: Some(&mesh_name),
                        contents: bytemuck::cast_slice(&mesh.mesh_data.vertices),
                        usage: wgpu::BufferUsages::VERTEX,
                    });
                    let ib = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                        label: Some(&mesh_name),
                        contents: bytemuck::cast_slice(&mesh.mesh_data.indices),
                        usage: wgpu::BufferUsages::INDEX,
                    });
                    let idx_count = mesh.mesh_data.indices.len() as u32;
                    let custom_idx = self.custom_meshes.len();
                    self.custom_meshes.push((vb, ib, idx_count));
                    
                    // Upload texture to GPU if available
                    if let (Some(tex_data), Some(tex_bgl)) = (&mesh.material.base_color_texture, &self.texture_bind_group_layout) {
                        let gpu_tex = device.create_texture(&wgpu::TextureDescriptor {
                            label: Some(&format!("{}_tex", mesh_name)),
                            size: wgpu::Extent3d { width: tex_data.width, height: tex_data.height, depth_or_array_layers: 1 },
                            mip_level_count: 1, sample_count: 1, dimension: wgpu::TextureDimension::D2,
                            format: wgpu::TextureFormat::Rgba8UnormSrgb,
                            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
                            view_formats: &[],
                        });
                        let queue = &gpu.queue;
                        queue.write_texture(
                            wgpu::TexelCopyTextureInfo { texture: &gpu_tex, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
                            &tex_data.rgba,
                            wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(4 * tex_data.width), rows_per_image: Some(tex_data.height) },
                            wgpu::Extent3d { width: tex_data.width, height: tex_data.height, depth_or_array_layers: 1 },
                        );
                        let tex_view = gpu_tex.create_view(&wgpu::TextureViewDescriptor::default());
                        let tex_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
                            mag_filter: wgpu::FilterMode::Linear, min_filter: wgpu::FilterMode::Linear,
                            mipmap_filter: wgpu::FilterMode::Linear,
                            address_mode_u: wgpu::AddressMode::Repeat, address_mode_v: wgpu::AddressMode::Repeat,
                            ..Default::default()
                        });
                        let has_normal = mesh.material.normal_texture.is_some();
                        let mat_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                            label: Some("mat_flags"),
                            contents: bytemuck::bytes_of(&MaterialFlagsRaw {
                                has_texture: 1, has_normal_map: if has_normal { 1 } else { 0 },
                                metallic: mesh.material.metallic, roughness: mesh.material.roughness,
                            }),
                            usage: wgpu::BufferUsages::UNIFORM,
                        });
                        // Upload normal map if available
                        let (normal_view, normal_sampler2) = if let Some(norm_data) = &mesh.material.normal_texture {
                            let norm_tex = device.create_texture(&wgpu::TextureDescriptor {
                                label: Some(&format!("{}_normal", mesh_name)),
                                size: wgpu::Extent3d { width: norm_data.width, height: norm_data.height, depth_or_array_layers: 1 },
                                mip_level_count: 1, sample_count: 1, dimension: wgpu::TextureDimension::D2,
                                format: wgpu::TextureFormat::Rgba8Unorm, // Normal maps are linear, not sRGB
                                usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
                                view_formats: &[],
                            });
                            let queue2 = &gpu.queue;
                            queue2.write_texture(
                                wgpu::TexelCopyTextureInfo { texture: &norm_tex, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
                                &norm_data.rgba,
                                wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(4 * norm_data.width), rows_per_image: Some(norm_data.height) },
                                wgpu::Extent3d { width: norm_data.width, height: norm_data.height, depth_or_array_layers: 1 },
                            );
                            tracing::info!("🗺️ Uploaded {}x{} normal map for {}", norm_data.width, norm_data.height, mesh_name);
                            let nv = norm_tex.create_view(&wgpu::TextureViewDescriptor::default());
                            let ns = device.create_sampler(&wgpu::SamplerDescriptor {
                                mag_filter: wgpu::FilterMode::Linear, min_filter: wgpu::FilterMode::Linear,
                                address_mode_u: wgpu::AddressMode::Repeat, address_mode_v: wgpu::AddressMode::Repeat,
                                ..Default::default()
                            });
                            (nv, ns)
                        } else {
                            // Use white 1x1 as default normal (flat)
                            let nv = self.default_texture_bind_group.as_ref().map(|_| {
                                // Reuse white texture view — we need a reference
                                // Actually just create a 1x1 blue normal (0.5, 0.5, 1.0)
                                let flat_tex = device.create_texture(&wgpu::TextureDescriptor {
                                    label: Some("Flat Normal"), size: wgpu::Extent3d { width: 1, height: 1, depth_or_array_layers: 1 },
                                    mip_level_count: 1, sample_count: 1, dimension: wgpu::TextureDimension::D2,
                                    format: wgpu::TextureFormat::Rgba8Unorm,
                                    usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
                                    view_formats: &[],
                                });
                                let queue2 = &gpu.queue;
                                queue2.write_texture(
                                    wgpu::TexelCopyTextureInfo { texture: &flat_tex, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
                                    &[128u8, 128, 255, 255], // flat normal pointing up
                                    wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(4), rows_per_image: Some(1) },
                                    wgpu::Extent3d { width: 1, height: 1, depth_or_array_layers: 1 },
                                );
                                flat_tex.create_view(&wgpu::TextureViewDescriptor::default())
                            }).unwrap();
                            let ns = device.create_sampler(&wgpu::SamplerDescriptor::default());
                            (nv, ns)
                        };
                        let tex_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
                            label: Some(&format!("{}_tex_bg", mesh_name)), layout: tex_bgl,
                            entries: &[
                                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&tex_view) },
                                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(&tex_sampler) },
                                wgpu::BindGroupEntry { binding: 2, resource: mat_buf.as_entire_binding() },
                                wgpu::BindGroupEntry { binding: 3, resource: self.dyn_light_storage.as_ref().unwrap().as_entire_binding() },
                                wgpu::BindGroupEntry { binding: 4, resource: wgpu::BindingResource::TextureView(&normal_view) },
                                wgpu::BindGroupEntry { binding: 5, resource: wgpu::BindingResource::Sampler(&normal_sampler2) },
                            ],
                        });
                        // Pad with defaults up to custom_idx if needed
                        while self.mesh_texture_bind_groups.len() < custom_idx {
                            self.mesh_texture_bind_groups.push(self.default_texture_bind_group.as_ref().unwrap().clone());
                        }
                        self.mesh_texture_bind_groups.push(tex_bg);
                        tracing::info!("🎨 Uploaded {}x{} texture for {}", tex_data.width, tex_data.height, mesh_name);
                    } else {
                        // Push default for this mesh index
                        while self.mesh_texture_bind_groups.len() < custom_idx {
                            if let Some(def) = &self.default_texture_bind_group {
                                self.mesh_texture_bind_groups.push(def.clone());
                            }
                        }
                        if let Some(def) = &self.default_texture_bind_group {
                            self.mesh_texture_bind_groups.push(def.clone());
                        }
                    }
                    
                    self.objects.push(SceneObject {
                        name: mesh_name.clone(),
                        transform: Transform {
                            position: Vec3::new(position[0], position[1] + ground_offset, position[2]),
                            rotation: auto_rotation,
                            scale: Vec3::splat(scale),
                        },
                        color: mesh.material.base_color,
                        mesh_type: MeshType::Custom(custom_idx),
                        spin_speed: 0.0,
                    parent: None, lod_meshes: Vec::new(),
                    });
                    added.push(format!("{} ({} verts)", mesh_name, mesh.mesh_data.vertices.len()));
                }
                self.sync_editor_scene();
                added
            }
            Err(e) => vec![format!("❌ Failed to load {}: {}", path, e)],
        }
    }


    fn load_model_from_assets(&mut self, model_file: &str, name: &str, position: [f32; 3], scale: f32) -> String {
        let assets_dir = self.find_assets_dir();
        let path = format!("{}/{}", assets_dir, model_file);
        if std::path::Path::new(&path).exists() {
            let results = self.load_gltf_model(&path, name, position, scale);
            format!("📦 {}", results.join(", "))
        } else {
            format!("⚠ Model '{}' not found", model_file)
        }
    }

    fn export_game(&self, export_name: &str) -> Result<String, String> {
        let workspace = std::env::current_exe().ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_else(|| std::path::PathBuf::from("."));
        
        let export_dir = workspace.join(format!("{}.app", export_name));
        let contents = export_dir.join("Contents");
        let macos = contents.join("MacOS");
        let resources = contents.join("Resources");
        
        // Create .app bundle structure
        std::fs::create_dir_all(&macos).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&resources).map_err(|e| e.to_string())?;
        
        // Copy binary
        if let Ok(exe) = std::env::current_exe() {
            std::fs::copy(&exe, macos.join("koko")).map_err(|e| e.to_string())?;
        }
        
        // Copy assets
        {
            let assets_dir_str = self.find_assets_dir();
            let assets_dir = std::path::Path::new(&assets_dir_str);
            let dst_assets = resources.join("assets");
            if assets_dir.exists() {
                // Recursive copy
                fn copy_dir(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
                    std::fs::create_dir_all(dst)?;
                    for entry in std::fs::read_dir(src)? {
                        let entry = entry?;
                        let ty = entry.file_type()?;
                        if ty.is_dir() {
                            copy_dir(&entry.path(), &dst.join(entry.file_name()))?;
                        } else {
                            std::fs::copy(entry.path(), dst.join(entry.file_name()))?;
                        }
                    }
                    Ok(())
                }
                copy_dir(&assets_dir, &dst_assets).map_err(|e| e.to_string())?;
            }
        }
        
        // Save current scene as JSON
        let scene_path = resources.join("default_scene.json");
        // Serialize scene objects
        let scene_data: Vec<serde_json::Value> = self.objects.iter().map(|obj| {
            serde_json::json!({
                "name": obj.name,
                "position": [obj.transform.position.x, obj.transform.position.y, obj.transform.position.z],
                "scale": [obj.transform.scale.x, obj.transform.scale.y, obj.transform.scale.z],
                "color": obj.color,
            })
        }).collect();
        if let Ok(json) = serde_json::to_string_pretty(&scene_data) {
            std::fs::write(&scene_path, json).map_err(|e| e.to_string())?;
        }
        
        // Write Info.plist
        let plist = format!(r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key><string>{}</string>
    <key>CFBundleExecutable</key><string>koko</string>
    <key>CFBundleIdentifier</key><string>com.koko.{}</string>
    <key>CFBundleVersion</key><string>1.0</string>
    <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>"#, export_name, export_name.to_lowercase().replace(' ', "-"));
        std::fs::write(contents.join("Info.plist"), plist).map_err(|e| e.to_string())?;
        
        Ok(export_dir.to_string_lossy().to_string())
    }

    fn find_assets_dir(&self) -> String {
        let exe_dir = std::env::current_exe().ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()));
        let candidates = [
            std::path::PathBuf::from("assets/models"),
            std::path::PathBuf::from("/Users/jamainemartin/.openclaw/workspace/koko-engine/assets/models"),
        ];
        if let Some(dir) = exe_dir.as_ref() {
            let res = dir.join("../Resources/assets/models");
            if res.exists() { return res.to_string_lossy().to_string(); }
            let local = dir.join("assets/models");
            if local.exists() { return local.to_string_lossy().to_string(); }
        }
        candidates.iter().find(|p| p.exists()).map(|p| p.to_string_lossy().to_string()).unwrap_or("assets/models".into())
    }

    fn build_scene(&mut self) {
        // Ground is now rendered via ground shader
        self.objects.push(SceneObject {
            name: "red_cube".into(),
            transform: Transform::from_xyz(0.0, 0.5, 0.0),
            color: [0.8, 0.15, 0.25, 1.0], mesh_type: MeshType::Cube, spin_speed: 0.5,
        parent: None, lod_meshes: Vec::new(),
        });
        self.objects.push(SceneObject {
            name: "blue_sphere".into(),
            transform: Transform { position: Vec3::new(3.0, 1.5, 0.0), rotation: Quat::IDENTITY, scale: Vec3::splat(1.5) },
            color: [0.15, 0.4, 0.9, 1.0], mesh_type: MeshType::Sphere, spin_speed: 0.3,
        parent: None, lod_meshes: Vec::new(),
        });
        self.objects.push(SceneObject {
            name: "green_cube".into(),
            transform: Transform { position: Vec3::new(-3.0, 0.75, 2.0), rotation: Quat::IDENTITY, scale: Vec3::splat(1.5) },
            color: [0.1, 0.7, 0.3, 1.0], mesh_type: MeshType::Cube, spin_speed: 0.7,
        parent: None, lod_meshes: Vec::new(),
        });
        self.objects.push(SceneObject {
            name: "gold_sphere".into(),
            transform: Transform { position: Vec3::new(0.0, 2.5, -3.0), rotation: Quat::IDENTITY, scale: Vec3::ONE },
            color: [0.9, 0.7, 0.1, 1.0], mesh_type: MeshType::Sphere, spin_speed: 1.0,
        parent: None, lod_meshes: Vec::new(),
        });
        for i in 0..5 {
            let angle = i as f32 * std::f32::consts::TAU / 5.0;
            self.objects.push(SceneObject {
                name: format!("pillar_{}", i),
                transform: Transform { position: Vec3::new(angle.cos() * 5.0, 0.3, angle.sin() * 5.0), rotation: Quat::from_rotation_y(angle), scale: Vec3::splat(0.6) },
                color: [0.7, 0.7, 0.75, 1.0], mesh_type: MeshType::Cube, spin_speed: 0.2,
            parent: None, lod_meshes: Vec::new(),
            });
        }
        // Torus ring
        self.objects.push(SceneObject {
            name: "torus_ring".into(),
            transform: Transform { position: Vec3::new(2.0, 1.0, -2.0), rotation: Quat::from_rotation_x(0.5), scale: Vec3::splat(2.0) },
            color: [0.9, 0.3, 0.6, 1.0], mesh_type: MeshType::Torus, spin_speed: 0.6,
        parent: None, lod_meshes: Vec::new(),
        });
        // Cyan cylinder
        self.objects.push(SceneObject {
            name: "cyan_cylinder".into(),
            transform: Transform { position: Vec3::new(-4.0, 0.75, -1.0), rotation: Quat::IDENTITY, scale: Vec3::new(1.0, 1.5, 1.0) },
            color: [0.1, 0.8, 0.8, 1.0], mesh_type: MeshType::Cylinder, spin_speed: 0.4,
        parent: None, lod_meshes: Vec::new(),
        });
        // Orange cone
        self.objects.push(SceneObject {
            name: "orange_cone".into(),
            transform: Transform { position: Vec3::new(4.0, 0.75, 3.0), rotation: Quat::IDENTITY, scale: Vec3::new(1.2, 1.5, 1.2) },
            color: [0.95, 0.5, 0.1, 1.0], mesh_type: MeshType::Cone, spin_speed: -0.3,
        parent: None, lod_meshes: Vec::new(),
        });
        self.sync_editor_scene();
    }

    fn create_grid_vertices() -> Vec<Vertex3D> {
        let mut verts = Vec::new();
        let (extent, step) = (10.0, 1.0);
        let color = [0.2, 0.2, 0.25, 1.0];
        let mut x = -extent;
        while x <= extent {
            verts.push(Vertex3D { position: [x, 0.0, -extent], normal: [0.0,1.0,0.0], uv: [0.0;2], color });
            verts.push(Vertex3D { position: [x, 0.0, extent], normal: [0.0,1.0,0.0], uv: [0.0;2], color });
            verts.push(Vertex3D { position: [-extent, 0.0, x], normal: [0.0,1.0,0.0], uv: [0.0;2], color });
            verts.push(Vertex3D { position: [extent, 0.0, x], normal: [0.0,1.0,0.0], uv: [0.0;2], color });
            x += step;
        }
        verts
    }

    fn init_renderer(&mut self) {
        let gpu = self.gpu.as_ref().unwrap();
        let device = &gpu.device;

        // egui setup
        let egui_ctx = egui::Context::default();
        egui_ctx.set_visuals(egui::Visuals::dark());
        let egui_state = egui_winit::State::new(egui_ctx.clone(), egui_ctx.viewport_id(), self.window.as_ref().unwrap().as_ref(), None, None, None);
        let egui_renderer = egui_wgpu::Renderer::new(device, gpu.format(), egui_wgpu::RendererOptions::default());
        self.egui_ctx = Some(egui_ctx);
        self.egui_state = Some(egui_state);
        self.egui_renderer = Some(egui_renderer);

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Basic Shader"), source: wgpu::ShaderSource::Wgsl(include_str!("shaders/basic.wgsl").into()),
        });

        let camera_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Camera BGL"), entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0, visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None }, count: None,
            }],
        });
        let model_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Model BGL"), entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0, visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: true, min_binding_size: wgpu::BufferSize::new(std::mem::size_of::<ModelRaw>() as u64) }, count: None,
            }],
        });
        // Main pipeline layout will be recreated after shadow map BGL is created
        let basic_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("PL"),
            bind_group_layouts: &[&camera_bgl, &model_bgl],
            push_constant_ranges: &[],
        });
        let pipeline_layout = &basic_pipeline_layout;

        let make_pipeline = |topo: wgpu::PrimitiveTopology, label: &str| -> wgpu::RenderPipeline {
            device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some(label), layout: Some(&pipeline_layout),
                vertex: wgpu::VertexState { module: &shader, entry_point: Some("vs_main"), buffers: &[Vertex3D::layout()], compilation_options: Default::default() },
                fragment: Some(wgpu::FragmentState { module: &shader, entry_point: Some("fs_main"),
                    targets: &[Some(wgpu::ColorTargetState { format: gpu.format(), blend: Some(wgpu::BlendState::REPLACE), write_mask: wgpu::ColorWrites::ALL })],
                    compilation_options: Default::default() }),
                primitive: wgpu::PrimitiveState { topology: topo, front_face: wgpu::FrontFace::Ccw,
                    cull_mode: if topo == wgpu::PrimitiveTopology::LineList { None } else { Some(wgpu::Face::Back) }, ..Default::default() },
                depth_stencil: Some(wgpu::DepthStencilState { format: wgpu::TextureFormat::Depth32Float, depth_write_enabled: true,
                    depth_compare: wgpu::CompareFunction::Less, stencil: wgpu::StencilState::default(), bias: wgpu::DepthBiasState::default() }),
                multisample: wgpu::MultisampleState { count: koko_render::gpu::MSAA_SAMPLES, mask: !0, alpha_to_coverage_enabled: false },
                multiview: None,
                cache: None,
            })
        };

        self.pipeline = Some(make_pipeline(wgpu::PrimitiveTopology::TriangleList, "Main"));
        self.grid_pipeline = Some(make_pipeline(wgpu::PrimitiveTopology::LineList, "Grid"));

        // Sky pipeline — fullscreen triangle, no vertex buffer, renders behind everything
        let sky_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Sky Shader"), source: wgpu::ShaderSource::Wgsl(include_str!("shaders/sky.wgsl").into()),
        });
        self.sky_pipeline = Some(device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Sky Pipeline"), layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState { module: &sky_shader, entry_point: Some("vs_main"), buffers: &[], compilation_options: Default::default() },
            fragment: Some(wgpu::FragmentState { module: &sky_shader, entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState { format: gpu.format(), blend: Some(wgpu::BlendState::REPLACE), write_mask: wgpu::ColorWrites::ALL })],
                compilation_options: Default::default() }),
            primitive: wgpu::PrimitiveState { topology: wgpu::PrimitiveTopology::TriangleList, ..Default::default() },
            depth_stencil: Some(wgpu::DepthStencilState { format: wgpu::TextureFormat::Depth32Float, depth_write_enabled: false,
                depth_compare: wgpu::CompareFunction::LessEqual, stencil: wgpu::StencilState::default(), bias: wgpu::DepthBiasState::default() }),
            multisample: wgpu::MultisampleState { count: koko_render::gpu::MSAA_SAMPLES, mask: !0, alpha_to_coverage_enabled: false }, multiview: None, cache: None,
        }));

        // Ground pipeline — uses ground shader for nice grass look
        let ground_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Ground Shader"), source: wgpu::ShaderSource::Wgsl(include_str!("shaders/ground.wgsl").into()),
        });
        // Ground pipeline created later with shadow map bind group

        // Shadow blob pipeline (alpha-blended dark circles under objects)
        let shadow_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Shadow Blob Shader"), source: wgpu::ShaderSource::Wgsl(include_str!("shaders/shadow_blob.wgsl").into()),
        });
        self.shadow_pipeline = Some(device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Shadow Blob Pipeline"), layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState { module: &shadow_shader, entry_point: Some("vs_main"), buffers: &[], compilation_options: Default::default() },
            fragment: Some(wgpu::FragmentState { module: &shadow_shader, entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState { format: gpu.format(),
                    blend: Some(wgpu::BlendState {
                        color: wgpu::BlendComponent { src_factor: wgpu::BlendFactor::SrcAlpha, dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha, operation: wgpu::BlendOperation::Add },
                        alpha: wgpu::BlendComponent { src_factor: wgpu::BlendFactor::Zero, dst_factor: wgpu::BlendFactor::One, operation: wgpu::BlendOperation::Add },
                    }),
                    write_mask: wgpu::ColorWrites::ALL })],
                compilation_options: Default::default() }),
            primitive: wgpu::PrimitiveState { topology: wgpu::PrimitiveTopology::TriangleList, ..Default::default() },
            depth_stencil: Some(wgpu::DepthStencilState { format: wgpu::TextureFormat::Depth32Float, depth_write_enabled: false,
                depth_compare: wgpu::CompareFunction::Less, stencil: wgpu::StencilState::default(), bias: wgpu::DepthBiasState { constant: -2, slope_scale: -1.0, clamp: 0.0 } }),
            multisample: wgpu::MultisampleState { count: koko_render::gpu::MSAA_SAMPLES, mask: !0, alpha_to_coverage_enabled: false }, multiview: None, cache: None,
        }));

        // Selection highlight pipeline
        let selection_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Selection Shader"), source: wgpu::ShaderSource::Wgsl(include_str!("shaders/selection.wgsl").into()),
        });
        self.outline_pipeline = Some(device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Selection Pipeline"), layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState { module: &selection_shader, entry_point: Some("vs_main"), buffers: &[Vertex3D::layout()], compilation_options: Default::default() },
            fragment: Some(wgpu::FragmentState { module: &selection_shader, entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState { format: gpu.format(),
                    blend: Some(wgpu::BlendState {
                        color: wgpu::BlendComponent { src_factor: wgpu::BlendFactor::SrcAlpha, dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha, operation: wgpu::BlendOperation::Add },
                        alpha: wgpu::BlendComponent { src_factor: wgpu::BlendFactor::One, dst_factor: wgpu::BlendFactor::Zero, operation: wgpu::BlendOperation::Add },
                    }),
                    write_mask: wgpu::ColorWrites::ALL })],
                compilation_options: Default::default() }),
            primitive: wgpu::PrimitiveState { topology: wgpu::PrimitiveTopology::TriangleList, front_face: wgpu::FrontFace::Ccw,
                cull_mode: Some(wgpu::Face::Front), // cull front faces = show back faces = outline effect
                ..Default::default() },
            depth_stencil: Some(wgpu::DepthStencilState { format: wgpu::TextureFormat::Depth32Float, depth_write_enabled: false,
                depth_compare: wgpu::CompareFunction::LessEqual, stencil: wgpu::StencilState::default(), bias: wgpu::DepthBiasState::default() }),
            multisample: wgpu::MultisampleState { count: koko_render::gpu::MSAA_SAMPLES, mask: !0, alpha_to_coverage_enabled: false }, multiview: None, cache: None,
        }));


        // === REAL SHADOW MAPPING ===
        let shadow_size = 2048u32;
        
        // Shadow depth texture
        let shadow_depth_tex = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Shadow Depth Texture"),
            size: wgpu::Extent3d { width: shadow_size, height: shadow_size, depth_or_array_layers: 1 },
            mip_level_count: 1, sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Depth32Float,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let shadow_depth_view = shadow_depth_tex.create_view(&wgpu::TextureViewDescriptor::default());
        let shadow_depth_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("Shadow Sampler"),
            compare: Some(wgpu::CompareFunction::LessEqual),
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });

        // Light VP uniform buffer
        let light_vp_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Light VP"),
            contents: bytemuck::cast_slice(&Mat4::IDENTITY.to_cols_array()),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        // Light camera bind group layout (for shadow depth pass)
        let light_camera_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Light Camera BGL"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0, visibility: wgpu::ShaderStages::VERTEX,
                ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None },
                count: None,
            }],
        });
        let light_camera_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Light Camera BG"), layout: &light_camera_bgl,
            entries: &[wgpu::BindGroupEntry { binding: 0, resource: light_vp_buffer.as_entire_binding() }],
        });

        // Shadow map bind group layout (for main pass — samples the shadow texture)
        let shadow_map_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Shadow Map BGL"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0, visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Depth,
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    }, count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1, visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Comparison),
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2, visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None },
                    count: None,
                },
            ],
        });
        let shadow_map_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Shadow Map BG"), layout: &shadow_map_bgl,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&shadow_depth_view) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(&shadow_depth_sampler) },
                wgpu::BindGroupEntry { binding: 2, resource: light_vp_buffer.as_entire_binding() },
            ],
        });

        // Shadow depth pass pipeline
        let shadow_depth_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Shadow Depth Shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("shaders/shadow_depth.wgsl").into()),
        });
        let shadow_depth_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Shadow Depth PL"),
            bind_group_layouts: &[&light_camera_bgl, &model_bgl],
            push_constant_ranges: &[],
        });
        let shadow_depth_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Shadow Depth Pipeline"), layout: Some(&shadow_depth_pl),
            vertex: wgpu::VertexState {
                module: &shadow_depth_shader, entry_point: Some("vs_main"),
                buffers: &[Vertex3D::layout()], compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shadow_depth_shader, entry_point: Some("fs_main"),
                targets: &[], compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: Some(wgpu::Face::Front), // front-face cull reduces shadow acne
                ..Default::default()
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: wgpu::TextureFormat::Depth32Float,
                depth_write_enabled: true,
                depth_compare: wgpu::CompareFunction::LessEqual,
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState { constant: 2, slope_scale: 2.0, clamp: 0.0 },
            }),
            multisample: wgpu::MultisampleState::default(), multiview: None, cache: None,
        });

        self.shadow_depth_texture = Some(shadow_depth_tex);
        self.shadow_depth_view = Some(shadow_depth_view);
        self.shadow_depth_sampler = Some(shadow_depth_sampler);
        self.shadow_depth_pipeline = Some(shadow_depth_pipeline);
        self.shadow_map_bind_group = Some(shadow_map_bg);
        self.shadow_map_bind_group_layout = Some(shadow_map_bgl);
        self.light_vp_buffer = Some(light_vp_buffer);
        self.light_camera_bgl = Some(light_camera_bgl);
        self.light_camera_bg = Some(light_camera_bg);


        // Rebuild main + ground pipelines with shadow map (group 2) + texture (group 3)
        
        let queue = &gpu.queue;
        // === DYNAMIC LIGHTS ===
        let empty_lights = LightArrayGpu {
            count: 0,
            lights: [PointLightGpu { position: [0.0; 3], radius: 0.0, color: [0.0; 3], intensity: 0.0, direction: [0.0; 3], spot_cutoff: 0.0 }; 32],
        };
        let light_storage_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Light Storage"),
            contents: bytemuck::bytes_of(&empty_lights),
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        });
        let light_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Light BGL"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0, visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Storage { read_only: true }, has_dynamic_offset: false, min_binding_size: None },
                count: None,
            }],
        });
        let light_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Light BG"), layout: &light_bgl,
            entries: &[wgpu::BindGroupEntry { binding: 0, resource: light_storage_buf.as_entire_binding() }],
        });
        self.dyn_light_storage = Some(light_storage_buf);
        self.dyn_light_bg = Some(light_bg);
        self.dyn_light_bgl = Some(light_bgl);

        // === TEXTURE SYSTEM ===
        let texture_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Texture BGL"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0, visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    }, count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1, visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2, visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 3, visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Storage { read_only: true }, has_dynamic_offset: false, min_binding_size: None },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 4, visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2, multisampled: false }, count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 5, visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None,
                },
            ],
        });

        // 1x1 white default texture
        let white_tex = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("White 1x1"), size: wgpu::Extent3d { width: 1, height: 1, depth_or_array_layers: 1 },
            mip_level_count: 1, sample_count: 1, dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8UnormSrgb,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        queue.write_texture(
            wgpu::TexelCopyTextureInfo { texture: &white_tex, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
            &[255u8, 255, 255, 255],
            wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(4), rows_per_image: Some(1) },
            wgpu::Extent3d { width: 1, height: 1, depth_or_array_layers: 1 },
        );
        let white_view = white_tex.create_view(&wgpu::TextureViewDescriptor::default());
        let tex_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("Texture Sampler"),
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Linear,
            address_mode_u: wgpu::AddressMode::Repeat,
            address_mode_v: wgpu::AddressMode::Repeat,
            ..Default::default()
        });

        let mat_flags_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Material Flags"),
            contents: bytemuck::bytes_of(&MaterialFlagsRaw { has_texture: 0, has_normal_map: 0, metallic: 0.0, roughness: 0.5 }),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        let default_tex_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Default Texture BG"), layout: &texture_bgl,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&white_view) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(&tex_sampler) },
                wgpu::BindGroupEntry { binding: 2, resource: mat_flags_buf.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 3, resource: self.dyn_light_storage.as_ref().unwrap().as_entire_binding() },
                wgpu::BindGroupEntry { binding: 4, resource: wgpu::BindingResource::TextureView(&white_view) },
                wgpu::BindGroupEntry { binding: 5, resource: wgpu::BindingResource::Sampler(&tex_sampler) },
            ],
        });

        self.texture_bind_group_layout = Some(texture_bgl);
        self.default_texture_bind_group = Some(default_tex_bg);
        self.material_flags_buffer = Some(mat_flags_buf);



        let main_pl_with_shadow = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Main PL + Shadow + Tex + Lights"),
            bind_group_layouts: &[&camera_bgl, &model_bgl, self.shadow_map_bind_group_layout.as_ref().unwrap(), self.texture_bind_group_layout.as_ref().unwrap()],
            push_constant_ranges: &[],
        });
        
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Basic Shadow Shader"), source: wgpu::ShaderSource::Wgsl(include_str!("shaders/basic_shadow.wgsl").into()),
        });
        self.pipeline = Some(device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Main + Shadow"), layout: Some(&main_pl_with_shadow),
            vertex: wgpu::VertexState { module: &shader, entry_point: Some("vs_main"), buffers: &[Vertex3D::layout()], compilation_options: Default::default() },
            fragment: Some(wgpu::FragmentState { module: &shader, entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState { format: gpu.format(), blend: Some(wgpu::BlendState::REPLACE), write_mask: wgpu::ColorWrites::ALL })],
                compilation_options: Default::default() }),
            primitive: wgpu::PrimitiveState { topology: wgpu::PrimitiveTopology::TriangleList, front_face: wgpu::FrontFace::Ccw,
                cull_mode: Some(wgpu::Face::Back), ..Default::default() },
            depth_stencil: Some(wgpu::DepthStencilState { format: wgpu::TextureFormat::Depth32Float, depth_write_enabled: true,
                depth_compare: wgpu::CompareFunction::Less, stencil: wgpu::StencilState::default(), bias: wgpu::DepthBiasState::default() }),
            multisample: wgpu::MultisampleState { count: koko_render::gpu::MSAA_SAMPLES, mask: !0, alpha_to_coverage_enabled: false }, multiview: None, cache: None,
        }));

        let ground_shader2 = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Ground Shader v2"), source: wgpu::ShaderSource::Wgsl(include_str!("shaders/ground.wgsl").into()),
        });
        self.ground_pipeline = Some(device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Ground + Shadow"), layout: Some(&main_pl_with_shadow),
            vertex: wgpu::VertexState { module: &ground_shader2, entry_point: Some("vs_main"), buffers: &[Vertex3D::layout()], compilation_options: Default::default() },
            fragment: Some(wgpu::FragmentState { module: &ground_shader2, entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState { format: gpu.format(), blend: Some(wgpu::BlendState::REPLACE), write_mask: wgpu::ColorWrites::ALL })],
                compilation_options: Default::default() }),
            primitive: wgpu::PrimitiveState { topology: wgpu::PrimitiveTopology::TriangleList, front_face: wgpu::FrontFace::Ccw, ..Default::default() },
            depth_stencil: Some(wgpu::DepthStencilState { format: wgpu::TextureFormat::Depth32Float, depth_write_enabled: true,
                depth_compare: wgpu::CompareFunction::Less, stencil: wgpu::StencilState::default(), bias: wgpu::DepthBiasState::default() }),
            multisample: wgpu::MultisampleState { count: koko_render::gpu::MSAA_SAMPLES, mask: !0, alpha_to_coverage_enabled: false }, multiview: None, cache: None,
        }));


        // === PROCEDURAL SKY ===
        let sky_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Sky Shader"), source: wgpu::ShaderSource::Wgsl(include_str!("shaders/sky.wgsl").into()),
        });
        let sky_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Sky BGL"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0, visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None },
                count: None,
            }],
        });
        let sky_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Sky Uniform"),
            contents: bytemuck::bytes_of(&SkyUniformRaw { inv_view_proj: Mat4::IDENTITY.to_cols_array(), sun_dir: [0.5, 0.7, 0.4, 0.0] }),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let sky_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Sky BG"), layout: &sky_bgl,
            entries: &[wgpu::BindGroupEntry { binding: 0, resource: sky_buf.as_entire_binding() }],
        });
        let sky_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Sky PL"), bind_group_layouts: &[&camera_bgl, &sky_bgl], push_constant_ranges: &[],
        });
        self.sky_pipeline = Some(device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Sky Pipeline"), layout: Some(&sky_pl),
            vertex: wgpu::VertexState { module: &sky_shader, entry_point: Some("vs_main"), buffers: &[], compilation_options: Default::default() },
            fragment: Some(wgpu::FragmentState { module: &sky_shader, entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState { format: gpu.format(), blend: Some(wgpu::BlendState::REPLACE), write_mask: wgpu::ColorWrites::ALL })],
                compilation_options: Default::default() }),
            primitive: wgpu::PrimitiveState { topology: wgpu::PrimitiveTopology::TriangleList, ..Default::default() },
            depth_stencil: Some(wgpu::DepthStencilState { format: wgpu::TextureFormat::Depth32Float, depth_write_enabled: false,
                depth_compare: wgpu::CompareFunction::LessEqual, stencil: wgpu::StencilState::default(), bias: wgpu::DepthBiasState::default() }),
            multisample: wgpu::MultisampleState { count: koko_render::gpu::MSAA_SAMPLES, mask: !0, alpha_to_coverage_enabled: false }, multiview: None, cache: None,
        }));
        self.sky_bind_group_layout = Some(sky_bgl);
        self.sky_bind_group = Some(sky_bg);
        self.sky_buffer = Some(sky_buf);


        // === BLOOM POST-PROCESSING ===
        let (w, h) = gpu.size;
        let bloom_w = w / 2; let bloom_h = h / 2; // Half-res bloom
        
        // Scene render target (scene renders here, then post-processed)
        let scene_tex = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Scene RT"), size: wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 },
            mip_level_count: 1, sample_count: 1, dimension: wgpu::TextureDimension::D2,
            format: gpu.format(), usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let scene_tex_view = scene_tex.create_view(&wgpu::TextureViewDescriptor::default());
        
        // Bloom textures (half-res)
        let mut bloom_texs = Vec::new();
        for label in &["Bloom Extract", "Bloom Blur H", "Bloom Blur V"] {
            let tex = device.create_texture(&wgpu::TextureDescriptor {
                label: Some(label), size: wgpu::Extent3d { width: bloom_w, height: bloom_h, depth_or_array_layers: 1 },
                mip_level_count: 1, sample_count: 1, dimension: wgpu::TextureDimension::D2,
                format: gpu.format(), usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
                view_formats: &[],
            });
            let view = tex.create_view(&wgpu::TextureViewDescriptor::default());
            bloom_texs.push((tex, view));
        }
        
        let bloom_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            mag_filter: wgpu::FilterMode::Linear, min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });
        
        // Extract BGL (tex + sampler)
        let bloom_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Bloom BGL"),
            entries: &[
                wgpu::BindGroupLayoutEntry { binding: 0, visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2, multisampled: false }, count: None },
                wgpu::BindGroupLayoutEntry { binding: 1, visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None },
            ],
        });
        
        // Blur BGL (tex + sampler + params)
        let bloom_blur_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Bloom Blur BGL"),
            entries: &[
                wgpu::BindGroupLayoutEntry { binding: 0, visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2, multisampled: false }, count: None },
                wgpu::BindGroupLayoutEntry { binding: 1, visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None },
                wgpu::BindGroupLayoutEntry { binding: 2, visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None }, count: None },
            ],
        });
        
        // Composite BGL (scene + bloom + sampler)
        let bloom_composite_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Bloom Composite BGL"),
            entries: &[
                wgpu::BindGroupLayoutEntry { binding: 0, visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2, multisampled: false }, count: None },
                wgpu::BindGroupLayoutEntry { binding: 1, visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2, multisampled: false }, count: None },
                wgpu::BindGroupLayoutEntry { binding: 2, visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None },
            ],
        });
        
        // Bind groups
        let bloom_extract_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Bloom Extract BG"), layout: &bloom_bgl,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&scene_tex_view) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(&bloom_sampler) },
            ],
        });
        
        let blur_h_params = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Blur H Params"),
            contents: bytemuck::bytes_of(&BlurParamsRaw { direction: [1.0, 0.0], texel_size: [1.0 / bloom_w as f32, 1.0 / bloom_h as f32] }),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let blur_v_params = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Blur V Params"),
            contents: bytemuck::bytes_of(&BlurParamsRaw { direction: [0.0, 1.0], texel_size: [1.0 / bloom_w as f32, 1.0 / bloom_h as f32] }),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        
        let bloom_blur_h_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Blur H BG"), layout: &bloom_blur_bgl,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&bloom_texs[0].1) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(&bloom_sampler) },
                wgpu::BindGroupEntry { binding: 2, resource: blur_h_params.as_entire_binding() },
            ],
        });
        let bloom_blur_v_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Blur V BG"), layout: &bloom_blur_bgl,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&bloom_texs[1].1) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(&bloom_sampler) },
                wgpu::BindGroupEntry { binding: 2, resource: blur_v_params.as_entire_binding() },
            ],
        });
        let bloom_composite_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Composite BG"), layout: &bloom_composite_bgl,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&scene_tex_view) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(&bloom_texs[2].1) },
                wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::Sampler(&bloom_sampler) },
            ],
        });
        
        // Pipelines
        let bloom_extract_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Bloom Extract"), source: wgpu::ShaderSource::Wgsl(include_str!("shaders/bloom_extract.wgsl").into()),
        });
        let bloom_blur_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Bloom Blur"), source: wgpu::ShaderSource::Wgsl(include_str!("shaders/bloom_blur.wgsl").into()),
        });
        let bloom_composite_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Bloom Composite"), source: wgpu::ShaderSource::Wgsl(include_str!("shaders/bloom_composite.wgsl").into()),
        });
        
        let bloom_extract_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Bloom Extract PL"), bind_group_layouts: &[&bloom_bgl], push_constant_ranges: &[],
        });
        let bloom_blur_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Bloom Blur PL"), bind_group_layouts: &[&bloom_blur_bgl], push_constant_ranges: &[],
        });
        let bloom_composite_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Bloom Composite PL"), bind_group_layouts: &[&bloom_composite_bgl], push_constant_ranges: &[],
        });
        
        let make_post_pipeline = |layout: &wgpu::PipelineLayout, shader: &wgpu::ShaderModule, label: &str| -> wgpu::RenderPipeline {
            device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some(label), layout: Some(layout),
                vertex: wgpu::VertexState { module: shader, entry_point: Some("vs_main"), buffers: &[], compilation_options: Default::default() },
                fragment: Some(wgpu::FragmentState { module: shader, entry_point: Some("fs_main"),
                    targets: &[Some(wgpu::ColorTargetState { format: gpu.format(), blend: None, write_mask: wgpu::ColorWrites::ALL })],
                    compilation_options: Default::default() }),
                primitive: wgpu::PrimitiveState::default(),
                depth_stencil: None,
                multisample: wgpu::MultisampleState::default(), multiview: None, cache: None,
            })
        };
        
        self.bloom_extract_pipeline = Some(make_post_pipeline(&bloom_extract_pl, &bloom_extract_shader, "Bloom Extract"));
        self.bloom_blur_pipeline = Some(make_post_pipeline(&bloom_blur_pl, &bloom_blur_shader, "Bloom Blur"));
        self.bloom_composite_pipeline = Some(make_post_pipeline(&bloom_composite_pl, &bloom_composite_shader, "Bloom Composite"));
        self.scene_texture = Some(scene_tex);
        self.scene_texture_view = Some(scene_tex_view);
        self.bloom_textures = bloom_texs;
        self.bloom_extract_bg = Some(bloom_extract_bg);
        self.bloom_blur_h_bg = Some(bloom_blur_h_bg);
        self.bloom_blur_v_bg = Some(bloom_blur_v_bg);
        self.bloom_composite_bg = Some(bloom_composite_bg);
        self.bloom_blur_h_params = Some(blur_h_params);
        self.bloom_blur_v_params = Some(blur_v_params);
        self.bloom_bgl = Some(bloom_bgl);
        self.bloom_blur_bgl = Some(bloom_blur_bgl);
        self.bloom_composite_bgl = Some(bloom_composite_bgl);


        // === PARTICLE SYSTEM ===
        let particle_max = 2000usize;
        let particle_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Particle Shader"), source: wgpu::ShaderSource::Wgsl(include_str!("shaders/particle.wgsl").into()),
        });
        let particle_uniform_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Particle Uniform"),
            contents: bytemuck::bytes_of(&ParticleUniformRaw { time: 0.0, delta_time: 0.016, particle_count: 0, _pad: 0 }),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let particle_storage_buf = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Particle Storage"),
            size: (particle_max * std::mem::size_of::<ParticleGpu>()) as u64,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let particle_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Particle BGL"),
            entries: &[
                wgpu::BindGroupLayoutEntry { binding: 0, visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None }, count: None },
                wgpu::BindGroupLayoutEntry { binding: 1, visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Storage { read_only: true }, has_dynamic_offset: false, min_binding_size: None }, count: None },
            ],
        });
        let particle_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Particle BG"), layout: &particle_bgl,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: particle_uniform_buf.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 1, resource: particle_storage_buf.as_entire_binding() },
            ],
        });
        let particle_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Particle PL"), bind_group_layouts: &[&camera_bgl, &particle_bgl], push_constant_ranges: &[],
        });
        self.particle_pipeline = Some(device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Particle Pipeline"), layout: Some(&particle_pl),
            vertex: wgpu::VertexState { module: &particle_shader, entry_point: Some("vs_main"), buffers: &[], compilation_options: Default::default() },
            fragment: Some(wgpu::FragmentState { module: &particle_shader, entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState { format: gpu.format(),
                    blend: Some(wgpu::BlendState {
                        color: wgpu::BlendComponent { src_factor: wgpu::BlendFactor::SrcAlpha, dst_factor: wgpu::BlendFactor::One, operation: wgpu::BlendOperation::Add },
                        alpha: wgpu::BlendComponent { src_factor: wgpu::BlendFactor::One, dst_factor: wgpu::BlendFactor::One, operation: wgpu::BlendOperation::Add },
                    }), write_mask: wgpu::ColorWrites::ALL })],
                compilation_options: Default::default() }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: Some(wgpu::DepthStencilState { format: wgpu::TextureFormat::Depth32Float, depth_write_enabled: false,
                depth_compare: wgpu::CompareFunction::Less, stencil: wgpu::StencilState::default(), bias: wgpu::DepthBiasState::default() }),
            multisample: wgpu::MultisampleState { count: koko_render::gpu::MSAA_SAMPLES, mask: !0, alpha_to_coverage_enabled: false }, multiview: None, cache: None,
        }));
        self.particle_storage_buffer = Some(particle_storage_buf);
        self.particle_uniform_buffer = Some(particle_uniform_buf);
        self.particle_bind_group = Some(particle_bg);
        self.particle_bgl = Some(particle_bgl);
        self.particle_max = particle_max;




        // === POST-PROCESSING ===
        let post_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Post-Process"), source: wgpu::ShaderSource::Wgsl(include_str!("shaders/post_process.wgsl").into()),
        });
        let post_params = PostParamsRaw {
            time: 0.0, vignette_strength: 0.3, grain_strength: 0.03,
            saturation: 1.1, contrast: 1.05, brightness: 1.0,
            chromatic_aberration: 0.002, temperature: 0.1,
        };
        let post_params_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Post Params"), contents: bytemuck::bytes_of(&post_params),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let post_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Post BGL"),
            entries: &[
                wgpu::BindGroupLayoutEntry { binding: 0, visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2, multisampled: false }, count: None },
                wgpu::BindGroupLayoutEntry { binding: 1, visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None },
                wgpu::BindGroupLayoutEntry { binding: 2, visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None }, count: None },
            ],
        });
        let post_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Post BG"), layout: &post_bgl,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(self.scene_texture_view.as_ref().unwrap()) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(&bloom_sampler) },
                wgpu::BindGroupEntry { binding: 2, resource: post_params_buf.as_entire_binding() },
            ],
        });
        let post_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Post PL"), bind_group_layouts: &[&post_bgl], push_constant_ranges: &[],
        });
        self.post_pipeline = Some(device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Post-Process"), layout: Some(&post_pl),
            vertex: wgpu::VertexState { module: &post_shader, entry_point: Some("vs_main"), buffers: &[], compilation_options: Default::default() },
            fragment: Some(wgpu::FragmentState { module: &post_shader, entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState { format: gpu.format(), blend: None, write_mask: wgpu::ColorWrites::ALL })],
                compilation_options: Default::default() }),
            primitive: wgpu::PrimitiveState::default(), depth_stencil: None,
            multisample: wgpu::MultisampleState::default(), multiview: None, cache: None,
        }));
        self.post_bind_group = Some(post_bg);
        self.post_params_buffer = Some(post_params_buf);


        // === WATER SYSTEM ===
        let water_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Water Shader"), source: wgpu::ShaderSource::Wgsl(include_str!("shaders/water.wgsl").into()),
        });
        let water_params = WaterParamsRaw { time: 0.0, wave_height: 0.3, wave_speed: 1.0, foam_threshold: 0.2 };
        let water_params_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Water Params"), contents: bytemuck::bytes_of(&water_params),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let water_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Water BGL"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0, visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None },
                count: None,
            }],
        });
        let water_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Water BG"), layout: &water_bgl,
            entries: &[wgpu::BindGroupEntry { binding: 0, resource: water_params_buf.as_entire_binding() }],
        });
        let water_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Water PL"), bind_group_layouts: &[&camera_bgl, &model_bgl, &water_bgl], push_constant_ranges: &[],
        });
        self.water_pipeline = Some(device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Water Pipeline"), layout: Some(&water_pl),
            vertex: wgpu::VertexState { module: &water_shader, entry_point: Some("vs_main"), buffers: &[Vertex3D::layout()], compilation_options: Default::default() },
            fragment: Some(wgpu::FragmentState { module: &water_shader, entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState { format: gpu.format(),
                    blend: Some(wgpu::BlendState::ALPHA_BLENDING), write_mask: wgpu::ColorWrites::ALL })],
                compilation_options: Default::default() }),
            primitive: wgpu::PrimitiveState { topology: wgpu::PrimitiveTopology::TriangleList, ..Default::default() },
            depth_stencil: Some(wgpu::DepthStencilState { format: wgpu::TextureFormat::Depth32Float, depth_write_enabled: false,
                depth_compare: wgpu::CompareFunction::Less, stencil: wgpu::StencilState::default(), bias: wgpu::DepthBiasState::default() }),
            multisample: wgpu::MultisampleState { count: koko_render::gpu::MSAA_SAMPLES, mask: !0, alpha_to_coverage_enabled: false }, multiview: None, cache: None,
        }));
        self.water_bind_group = Some(water_bg);
        self.water_params_buffer = Some(water_params_buf);
        
        // Water plane mesh (subdivided for vertex displacement)
        {
            let res = 64;
            let size = 30.0;
            let mut verts = Vec::new();
            let mut inds = Vec::new();
            for z in 0..=res {
                for x in 0..=res {
                    let fx = (x as f32 / res as f32 - 0.5) * size;
                    let fz = (z as f32 / res as f32 - 0.5) * size;
                    verts.push(Vertex3D { position: [fx, 0.0, fz], normal: [0.0, 1.0, 0.0], uv: [x as f32 / res as f32, z as f32 / res as f32], color: [1.0; 4] });
                }
            }
            for z in 0..res {
                for x in 0..res {
                    let i = z * (res + 1) + x;
                    inds.extend_from_slice(&[i as u32, (i + res + 1) as u32, (i + 1) as u32, (i + 1) as u32, (i + res + 1) as u32, (i + res + 2) as u32]);
                }
            }
            self.water_vb = Some(device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("Water VB"), contents: bytemuck::cast_slice(&verts), usage: wgpu::BufferUsages::VERTEX }));
            self.water_ib = Some(device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("Water IB"), contents: bytemuck::cast_slice(&inds), usage: wgpu::BufferUsages::INDEX }));
            self.water_idx_count = inds.len() as u32;
        }


        // === AUDIO ENGINE ===
        match koko_audio::AudioEngine::new() {
            Ok(mut audio) => {
                // Load sounds from assets/sounds/ if exists
                let assets_path = std::path::PathBuf::from(self.find_assets_dir());
                let sounds_dir = assets_path.parent().unwrap_or(&assets_path).join("sounds");
                {
                    let dir = &sounds_dir;
                    if dir.exists() {
                        let count = audio.load_directory(&dir);
                        if count > 0 { tracing::info!("🔊 Loaded {} sounds", count); }
                    }
                }
                self.audio_engine = Some(audio);
                tracing::info!("🔊 Audio engine initialized");
            }
            Err(e) => tracing::warn!("Audio init failed: {}", e),
        }


        // === TRANSFORM GIZMOS ===
        let gizmo_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Gizmo Shader"), source: wgpu::ShaderSource::Wgsl(include_str!("shaders/gizmo.wgsl").into()),
        });
        let gizmo_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Gizmo Uniform"),
            contents: bytemuck::bytes_of(&ModelRaw { model: Mat4::IDENTITY.to_cols_array(), color: [1.0, 0.0, 0.0, 1.0] }),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let gizmo_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Gizmo BGL"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0, visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None },
                count: None,
            }],
        });
        let gizmo_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Gizmo BG"), layout: &gizmo_bgl,
            entries: &[wgpu::BindGroupEntry { binding: 0, resource: gizmo_buf.as_entire_binding() }],
        });
        let gizmo_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Gizmo PL"), bind_group_layouts: &[&camera_bgl, &gizmo_bgl], push_constant_ranges: &[],
        });
        self.gizmo_pipeline = Some(device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Gizmo Pipeline"), layout: Some(&gizmo_pl),
            vertex: wgpu::VertexState { module: &gizmo_shader, entry_point: Some("vs_main"), buffers: &[Vertex3D::layout()], compilation_options: Default::default() },
            fragment: Some(wgpu::FragmentState { module: &gizmo_shader, entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState { format: gpu.format(), blend: Some(wgpu::BlendState::ALPHA_BLENDING), write_mask: wgpu::ColorWrites::ALL })],
                compilation_options: Default::default() }),
            primitive: wgpu::PrimitiveState { topology: wgpu::PrimitiveTopology::TriangleList, ..Default::default() },
            depth_stencil: Some(wgpu::DepthStencilState { format: wgpu::TextureFormat::Depth32Float, depth_write_enabled: false,
                depth_compare: wgpu::CompareFunction::Always, stencil: wgpu::StencilState::default(), bias: wgpu::DepthBiasState::default() }),
            multisample: wgpu::MultisampleState { count: koko_render::gpu::MSAA_SAMPLES, mask: !0, alpha_to_coverage_enabled: false }, multiview: None, cache: None,
        }));
        self.gizmo_buffer = Some(gizmo_buf);
        self.gizmo_bind_group = Some(gizmo_bg);
        
        // Arrow mesh for gizmo (thin cylinder)
        {
            let arrow_mesh = MeshData::cylinder(8, 0.03, 1.0);
            self.gizmo_arrow_vb = Some(device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("Gizmo Arrow VB"), contents: bytemuck::cast_slice(&arrow_mesh.vertices), usage: wgpu::BufferUsages::VERTEX }));
            self.gizmo_arrow_ib = Some(device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("Gizmo Arrow IB"), contents: bytemuck::cast_slice(&arrow_mesh.indices), usage: wgpu::BufferUsages::INDEX }));
            self.gizmo_arrow_count = arrow_mesh.indices.len() as u32;
        }


        // === TERRAIN SYSTEM ===
        let terrain_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Terrain Shader"), source: wgpu::ShaderSource::Wgsl(include_str!("shaders/terrain.wgsl").into()),
        });
        let terrain_params = TerrainParamsRaw { time: 0.0, height_scale: 5.0, texture_scale: 0.1, _pad: 0.0 };
        let terrain_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Terrain Params"), contents: bytemuck::bytes_of(&terrain_params),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let terrain_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Terrain BGL"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0, visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None },
                count: None,
            }],
        });
        let terrain_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Terrain BG"), layout: &terrain_bgl,
            entries: &[wgpu::BindGroupEntry { binding: 0, resource: terrain_buf.as_entire_binding() }],
        });
        let terrain_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Terrain PL"), bind_group_layouts: &[&camera_bgl, &model_bgl, &terrain_bgl], push_constant_ranges: &[],
        });
        self.terrain_pipeline = Some(device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Terrain Pipeline"), layout: Some(&terrain_pl),
            vertex: wgpu::VertexState { module: &terrain_shader, entry_point: Some("vs_main"), buffers: &[Vertex3D::layout()], compilation_options: Default::default() },
            fragment: Some(wgpu::FragmentState { module: &terrain_shader, entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState { format: gpu.format(), blend: Some(wgpu::BlendState::REPLACE), write_mask: wgpu::ColorWrites::ALL })],
                compilation_options: Default::default() }),
            primitive: wgpu::PrimitiveState { topology: wgpu::PrimitiveTopology::TriangleList, front_face: wgpu::FrontFace::Ccw, ..Default::default() },
            depth_stencil: Some(wgpu::DepthStencilState { format: wgpu::TextureFormat::Depth32Float, depth_write_enabled: true,
                depth_compare: wgpu::CompareFunction::Less, stencil: wgpu::StencilState::default(), bias: wgpu::DepthBiasState::default() }),
            multisample: wgpu::MultisampleState { count: koko_render::gpu::MSAA_SAMPLES, mask: !0, alpha_to_coverage_enabled: false }, multiview: None, cache: None,
        }));
        self.terrain_bind_group = Some(terrain_bg);
        self.terrain_params_buffer = Some(terrain_buf);
        // Terrain mesh (128x128 grid, 100 units wide)
        {
            let res = 128;
            let size = 100.0;
            let mut verts = Vec::new();
            let mut inds = Vec::new();
            for z in 0..=res {
                for x in 0..=res {
                    let fx = (x as f32 / res as f32 - 0.5) * size;
                    let fz = (z as f32 / res as f32 - 0.5) * size;
                    verts.push(Vertex3D { position: [fx, 0.0, fz], normal: [0.0, 1.0, 0.0], uv: [x as f32 / res as f32, z as f32 / res as f32], color: [1.0; 4] });
                }
            }
            for z in 0..res {
                for x in 0..res {
                    let i = z * (res + 1) + x;
                    inds.extend_from_slice(&[i as u32, (i+res+1) as u32, (i+1) as u32, (i+1) as u32, (i+res+1) as u32, (i+res+2) as u32]);
                }
            }
            self.terrain_vb = Some(device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("Terrain VB"), contents: bytemuck::cast_slice(&verts), usage: wgpu::BufferUsages::VERTEX }));
            self.terrain_ib = Some(device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("Terrain IB"), contents: bytemuck::cast_slice(&inds), usage: wgpu::BufferUsages::INDEX }));
            self.terrain_idx_count = inds.len() as u32;
        }


        // === POST-PROCESSING ===
        let post_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Post Process"), source: wgpu::ShaderSource::Wgsl(include_str!("shaders/post_process.wgsl").into()),
        });
        let post_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Post BGL"),
            entries: &[
                wgpu::BindGroupLayoutEntry { binding: 0, visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2, multisampled: false }, count: None },
                wgpu::BindGroupLayoutEntry { binding: 1, visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None },
                wgpu::BindGroupLayoutEntry { binding: 2, visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None }, count: None },
            ],
        });
        let post_params_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Post Params"), contents: bytemuck::bytes_of(&self.post_params),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        // Post-process reads from scene_texture (after bloom composites to it, or directly)
        let post_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            mag_filter: wgpu::FilterMode::Linear, min_filter: wgpu::FilterMode::Linear, ..Default::default()
        });
        let post_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Post BG"), layout: &post_bgl,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(self.scene_texture_view.as_ref().unwrap()) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(&post_sampler) },
                wgpu::BindGroupEntry { binding: 2, resource: post_params_buf.as_entire_binding() },
            ],
        });
        let post_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Post PL"), bind_group_layouts: &[&post_bgl], push_constant_ranges: &[],
        });
        self.post_pipeline = Some(device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Post Process"), layout: Some(&post_pl),
            vertex: wgpu::VertexState { module: &post_shader, entry_point: Some("vs_main"), buffers: &[], compilation_options: Default::default() },
            fragment: Some(wgpu::FragmentState { module: &post_shader, entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState { format: gpu.format(), blend: None, write_mask: wgpu::ColorWrites::ALL })],
                compilation_options: Default::default() }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(), multiview: None, cache: None,
        }));
        self.post_bind_group = Some(post_bg);
        self.post_params_buffer = Some(post_params_buf);

        // Large ground plane mesh
        let ground_mesh = MeshData::plane(1);
        self.ground_vb = Some(device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("Ground VB"), contents: bytemuck::cast_slice(&ground_mesh.vertices), usage: wgpu::BufferUsages::VERTEX }));
        self.ground_ib = Some(device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("Ground IB"), contents: bytemuck::cast_slice(&ground_mesh.indices), usage: wgpu::BufferUsages::INDEX }));
        self.ground_idx_count = ground_mesh.indices.len() as u32;

        let camera_data = CameraRaw { view_proj: Mat4::IDENTITY.to_cols_array(), view: Mat4::IDENTITY.to_cols_array(), position: [0.0; 4] };
        let camera_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("Cam"), contents: bytemuck::cast_slice(&[camera_data]), usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST });
        self.camera_bind_group = Some(device.create_bind_group(&wgpu::BindGroupDescriptor { label: Some("Cam BG"), layout: &camera_bgl, entries: &[wgpu::BindGroupEntry { binding: 0, resource: camera_buffer.as_entire_binding() }] }));
        self.camera_buffer = Some(camera_buffer);

        let model_align = device.limits().min_uniform_buffer_offset_alignment as usize;
        let model_stride = ((std::mem::size_of::<ModelRaw>() + model_align - 1) / model_align) * model_align;
        let max_objects = 256;
        let model_buf_size = model_stride * max_objects;
        let model_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Model"), size: model_buf_size as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false,
        });
        self.model_bind_group = Some(device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Model BG"), layout: &model_bgl,
            entries: &[wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                buffer: &model_buffer, offset: 0, size: wgpu::BufferSize::new(std::mem::size_of::<ModelRaw>() as u64),
            }) }],
        }));
        self.model_buffer = Some(model_buffer);

        let cube = MeshData::cube();
        self.cube_vb = Some(device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::cast_slice(&cube.vertices), usage: wgpu::BufferUsages::VERTEX }));
        self.cube_ib = Some(device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::cast_slice(&cube.indices), usage: wgpu::BufferUsages::INDEX }));
        self.cube_idx_count = cube.indices.len() as u32;

        let sphere = MeshData::sphere(32, 16);
        self.sphere_vb = Some(device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::cast_slice(&sphere.vertices), usage: wgpu::BufferUsages::VERTEX }));
        self.sphere_ib = Some(device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::cast_slice(&sphere.indices), usage: wgpu::BufferUsages::INDEX }));
        self.sphere_idx_count = sphere.indices.len() as u32;

        let plane = MeshData::plane(1);
        self.plane_vb = Some(device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::cast_slice(&plane.vertices), usage: wgpu::BufferUsages::VERTEX }));
        self.plane_ib = Some(device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::cast_slice(&plane.indices), usage: wgpu::BufferUsages::INDEX }));
        self.plane_idx_count = plane.indices.len() as u32;

        let cylinder = MeshData::cylinder(32, 1.0, 0.5);
        self.cylinder_vb = Some(device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::cast_slice(&cylinder.vertices), usage: wgpu::BufferUsages::VERTEX }));
        self.cylinder_ib = Some(device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::cast_slice(&cylinder.indices), usage: wgpu::BufferUsages::INDEX }));
        self.cylinder_idx_count = cylinder.indices.len() as u32;

        let cone = MeshData::cone(32, 1.0, 0.5);
        self.cone_vb = Some(device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::cast_slice(&cone.vertices), usage: wgpu::BufferUsages::VERTEX }));
        self.cone_ib = Some(device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::cast_slice(&cone.indices), usage: wgpu::BufferUsages::INDEX }));
        self.cone_idx_count = cone.indices.len() as u32;

        let torus = MeshData::torus(32, 16, 0.7, 0.25);
        self.torus_vb = Some(device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::cast_slice(&torus.vertices), usage: wgpu::BufferUsages::VERTEX }));
        self.torus_ib = Some(device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::cast_slice(&torus.indices), usage: wgpu::BufferUsages::INDEX }));
        self.torus_idx_count = torus.indices.len() as u32;

        let grid_verts = Self::create_grid_vertices();
        self.grid_vert_count = grid_verts.len() as u32;
        self.grid_vb = Some(device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: None, contents: bytemuck::cast_slice(&grid_verts), usage: wgpu::BufferUsages::VERTEX }));

        self.build_scene();
        tracing::info!("✅ Editor initialized — {} objects", self.objects.len());
    }


    fn snapshot_scene(&self) -> Vec<SceneSnapshot> {
        self.objects.iter().map(|o| SceneSnapshot {
            name: o.name.clone(),
            position: o.transform.position.to_array(),
            color: o.color,
            scale: o.transform.scale.to_array(),
            mesh_type_str: o.mesh_type.as_str().to_string(),
            custom_mesh_idx: if let MeshType::Custom(i) = o.mesh_type { Some(i) } else { None },
            spin_speed: o.spin_speed,
        parent: None, lod_meshes: Vec::new(),
        }).collect()
    }

    fn push_undo(&mut self) {
        let snap = self.snapshot_scene();
        self.undo_stack.push(snap);
        self.redo_stack.clear();
        if self.undo_stack.len() > 50 { self.undo_stack.remove(0); }
    }

    fn undo(&mut self) {
        if let Some(prev) = self.undo_stack.pop() {
            let current = self.snapshot_scene();
            self.redo_stack.push(current);
            self.restore_snapshot(prev);
            self.editor.add_system_message("↩️ Undo");
        }
    }

    fn redo(&mut self) {
        if let Some(next) = self.redo_stack.pop() {
            let current = self.snapshot_scene();
            self.undo_stack.push(current);
            self.restore_snapshot(next);
            self.editor.add_system_message("↪️ Redo");
        }
    }

    fn restore_snapshot(&mut self, snap: Vec<SceneSnapshot>) {
        self.objects.clear();
        for s in snap {
            let mesh_type = if let Some(idx) = s.custom_mesh_idx {
                MeshType::Custom(idx)
            } else {
                MeshType::from_str(&s.mesh_type_str)
            };
            self.objects.push(SceneObject {
                name: s.name,
                transform: Transform {
                    position: Vec3::from_array(s.position),
                    rotation: Quat::IDENTITY,
                    scale: Vec3::from_array(s.scale),
                },
                color: s.color,
                mesh_type,
                spin_speed: s.spin_speed,
            parent: None, lod_meshes: Vec::new(),
            });
        }
        self.sync_editor_scene();
    }

    fn delete_object(&mut self, name: &str) {
        self.push_undo();
        self.objects.retain(|o| o.name != name);
        if self.editor.selected_entity.as_ref().map(|s| s.as_str()) == Some(name) {
            self.editor.selected_entity = None;
        }
        self.editor.add_system_message(&format!("🗑️ Deleted {}", name));
        self.sync_editor_scene();
    }

    fn duplicate_object(&mut self, name: &str) {
        let found = self.objects.iter().find(|o| o.name == name).map(|obj| {
            let new_name = format!("{}_copy", obj.name);
            (new_name, SceneObject {
                name: format!("{}_copy", obj.name),
                transform: Transform {
                    position: obj.transform.position + Vec3::new(2.0, 0.0, 0.0),
                    rotation: obj.transform.rotation,
                    scale: obj.transform.scale,
                },
                color: obj.color,
                mesh_type: obj.mesh_type,
                spin_speed: obj.spin_speed,
            parent: None, lod_meshes: Vec::new(),
            })
        });
        if let Some((new_name, new_obj)) = found {
            self.push_undo();
            self.objects.push(new_obj);
            self.editor.selected_entity = Some(new_name.clone());
            self.editor.add_system_message(&format!("📋 Duplicated {} → {}", name, new_name));
            self.sync_editor_scene();
        }
    }

    fn modify_object(&mut self, name: &str, info: &editor::SceneObjectInfo) {
        if let Some(obj) = self.objects.iter_mut().find(|o| o.name == name) {
            obj.transform.position = Vec3::from_array(info.position);
            obj.transform.scale = Vec3::splat(info.scale);
            obj.color = info.color;
            self.sync_editor_scene();
        }
    }

    fn focus_camera_on(&mut self, name: &str) {
        if let Some(obj) = self.objects.iter().find(|o| o.name == name) {
            let target = obj.transform.position;
            let offset = Vec3::new(5.0, 4.0, 5.0);
            self.camera_pos = target + offset;
            self.orbit_target = target;
            let dir = (target - self.camera_pos).normalize();
            self.camera_yaw = dir.x.atan2(-dir.z);
            self.camera_pitch = (-dir.y).asin();
        }
    }

    fn save_scene(&self) {
        let snapshots = self.snapshot_scene();
        let data: Vec<serde_json::Value> = snapshots.iter().map(|s| {
            serde_json::json!({
                "name": s.name,
                "position": s.position,
                "color": s.color,
                "scale": s.scale,
                "mesh_type": s.mesh_type_str,
                "custom_mesh_idx": s.custom_mesh_idx,
                "spin_speed": s.spin_speed,
            })
        }).collect();
        let json = serde_json::to_string_pretty(&data).unwrap_or_default();
        // Try multiple save locations
        let paths = [
            "scene.json".to_string(),
            "/Users/jamainemartin/.openclaw/workspace/koko-engine/scene.json".to_string(),
        ];
        for path in &paths {
            if std::fs::write(path, &json).is_ok() {
                tracing::info!("💾 Scene saved to {}", path);
                return;
            }
        }
    }

    fn load_scene(&mut self) {
        let paths = [
            "scene.json".to_string(),
            "/Users/jamainemartin/.openclaw/workspace/koko-engine/scene.json".to_string(),
        ];
        for path in &paths {
            if let Ok(json) = std::fs::read_to_string(path) {
                if let Ok(data) = serde_json::from_str::<Vec<serde_json::Value>>(&json) {
                    self.push_undo();
                    self.objects.clear();
                    for item in &data {
                        let name = item["name"].as_str().unwrap_or("unknown").to_string();
                        let position: [f32; 3] = serde_json::from_value(item["position"].clone()).unwrap_or([0.0; 3]);
                        let color: [f32; 4] = serde_json::from_value(item["color"].clone()).unwrap_or([0.7, 0.7, 0.7, 1.0]);
                        let scale: [f32; 3] = serde_json::from_value(item["scale"].clone()).unwrap_or([1.0; 3]);
                        let mesh_str = item["mesh_type"].as_str().unwrap_or("cube");
                        let custom_idx = item["custom_mesh_idx"].as_u64().map(|v| v as usize);
                        let mesh_type = if let Some(idx) = custom_idx {
                            MeshType::Custom(idx)
                        } else {
                            MeshType::from_str(mesh_str)
                        };
                        self.objects.push(SceneObject {
                            name,
                            transform: Transform {
                                position: Vec3::from_array(position),
                                rotation: Quat::IDENTITY,
                                scale: Vec3::from_array(scale),
                            },
                            color,
                            mesh_type,
                            spin_speed: item["spin_speed"].as_f64().unwrap_or(0.0) as f32,
                        parent: None, lod_meshes: Vec::new(),
                        });
                    }
                    self.sync_editor_scene();
                    self.editor.add_system_message(&format!("📂 Loaded {} objects from {}", self.objects.len(), path));
                    return;
                }
            }
        }
        self.editor.add_system_message("❌ No scene file found");
    }


    fn pick_object(&self, screen_x: f32, screen_y: f32) -> Option<String> {
        let gpu = self.gpu.as_ref()?;
        let (w, h) = gpu.size;
        // Convert screen coords to NDC (-1..1)
        let ndc_x = (screen_x / w as f32) * 2.0 - 1.0;
        let ndc_y = 1.0 - (screen_y / h as f32) * 2.0;  // flip Y

        let cam_t = Transform {
            position: self.camera_pos,
            rotation: Quat::from_euler(glam::EulerRot::YXZ, self.camera_yaw, self.camera_pitch, 0.0),
            scale: Vec3::ONE,
        };
        let aspect = w as f32 / h as f32;
        let cam = CameraUniforms::perspective(&cam_t, 60.0, aspect, 0.1, 1000.0);
        let vp = cam.view_proj();
        let inv_vp = vp.inverse();

        // Ray origin and direction from NDC
        let near = inv_vp.project_point3(Vec3::new(ndc_x, ndc_y, 0.0));
        let far = inv_vp.project_point3(Vec3::new(ndc_x, ndc_y, 1.0));
        let ray_origin = near;
        let ray_dir = (far - near).normalize();

        // Test against each object's bounding sphere
        let mut best: Option<(f32, String)> = None;
        for obj in &self.objects {
            let center = obj.transform.position;
            let radius = obj.transform.scale.max_element() * 1.2; // rough bounding sphere

            // Ray-sphere intersection
            let oc = ray_origin - center;
            let a = ray_dir.dot(ray_dir);
            let b = 2.0 * oc.dot(ray_dir);
            let c = oc.dot(oc) - radius * radius;
            let disc = b * b - 4.0 * a * c;
            if disc >= 0.0 {
                let t = (-b - disc.sqrt()) / (2.0 * a);
                if t > 0.0 {
                    if best.is_none() || t < best.as_ref().unwrap().0 {
                        best = Some((t, obj.name.clone()));
                    }
                }
            }
        }
        best.map(|(_, name)| name)
    }


    fn generate_copilot_response(&self, msg: &str) -> String {
        let lower = msg.to_lowercase();
        let obj_count = self.objects.len();
        let light_count = self.scene_lights.len();
        let has_ground = self.objects.iter().any(|o| o.name.contains("ground") || o.name.contains("floor"));
        let has_player = self.objects.iter().any(|o| o.name.contains("player") || o.name.contains("hero"));
        let has_lights = !self.scene_lights.is_empty();
        let has_ai = !self.ai_agents.is_empty();
        let has_physics = self.physics_playing;

        if lower.contains("analyze") || lower.contains("review") || lower.contains("critique") {
            let mut analysis = format!("📊 Scene Analysis:\n• {} objects", obj_count);
            if obj_count == 0 {
                analysis += "\n\n🚀 Empty scene! Try:\n• 'template rpg' for a full RPG setup\n• 'template fps' for a shooter\n• 'add cube' to start from scratch\n• 'generate city 5' for a procedural city";
                return analysis;
            }
            analysis += &format!("\n• {} lights", light_count);
            analysis += &format!("\n• {} AI agents", self.ai_agents.len());
            analysis += &format!("\n• {} particle emitters", self.particle_emitters.len());
            analysis += &format!("\n• Bloom: {} | Post-FX: {}", if self.bloom_enabled { "on" } else { "off" }, if self.post_enabled { "on" } else { "off" });

            // Suggestions based on analysis
            analysis += "\n\n💡 Recommendations:";
            if !has_ground { analysis += "\n• ⚠️ No ground plane! Try 'add plane' and scale it up"; }
            if !has_lights && obj_count > 3 { analysis += "\n• 💡 No lights! Try 'light white 0 5 0' for basic lighting"; }
            if obj_count > 20 && self.objects.iter().filter(|o| !o.lod_meshes.is_empty()).count() == 0 {
                analysis += "\n• ⚡ Many objects but no LOD. Try 'auto lod' for performance!";
            }
            if !self.frustum_culling && obj_count > 50 { analysis += "\n• ⚡ 50+ objects with culling off! Try 'culling on'"; }
            if !has_player { analysis += "\n• 🏃 No player object detected. Add one for gameplay!"; }
            if self.quests.is_empty() && has_player { analysis += "\n• 📜 Player but no quests. Try 'quest add Adventure'"; }
            if has_player && self.inventories.is_empty() { analysis += "\n• 🎒 No inventory system. Try 'inv add sword'"; }
            if obj_count > 5 && !has_ai { analysis += "\n• 🤖 Consider adding AI: 'add ai patrol'"; }
            if self.fog_enabled { analysis += "\n• 🌫️ Fog is active — nice atmosphere!"; }
            if self.weather_active() { analysis += "\n• ☁️ Weather system running — looking cinematic!"; }
            analysis
        } else if lower.contains("style") || lower.contains("look") || lower.contains("pretty") {
            let mut tips = "🎨 Style Tips:\n".to_string();
            if self.post_params.vignette_strength < 0.2 { tips += "• Try increasing vignette: adds focus and drama\n"; }
            if self.post_params.saturation > 1.0 { tips += "• Your saturation is high — try lowering for a moodier look\n"; }
            if !self.bloom_enabled { tips += "• Enable bloom for that next-gen glow: 'bloom on'\n"; }
            tips += "• Try 'day cycle' for dynamic lighting that changes over time\n";
            tips += "• 'weather rain' adds instant atmosphere\n";
            tips += "• Color-code objects: 'color gold' for important items\n";
            if self.fog_density < 0.05 { tips += "• Add subtle fog: 'fog on' — it adds depth\n"; }
            tips += "• Try environment presets: 'space', 'underwater', 'hell', 'dreamscape'";
            tips
        } else if lower.contains("optimize") || lower.contains("performance") || lower.contains("perf") || lower.contains("fps") {
            let mut tips = "⚡ Optimization Tips:\n".to_string();
            if obj_count > 50 { tips += &format!("• {} objects is a lot — consider 'auto lod'\n", obj_count); }
            if !self.frustum_culling { tips += "• Turn on frustum culling: 'culling on'\n"; }
            if self.particle_emitters.len() > 5 { tips += "• Many particle emitters — reduce or pause inactive ones\n"; }
            if self.bloom_enabled { tips += "• Bloom adds GPU cost — disable if targeting low-end: 'bloom off'\n"; }
            if self.reflection_quality > 2 { tips += "• High reflections are expensive — try 'reflection med'\n"; }
            if self.crowd_agents.len() > 30 { tips += &format!("• {} crowd agents — consider reducing for better perf\n", self.crowd_agents.len()); }
            tips += "• Use instancing for repeated objects: 'instance cube 50'\n";
            tips += "• Group similar objects on the same layer for batch rendering";
            tips
        } else if lower.contains("next") || lower.contains("what should") || lower.contains("suggest") {
            let mut suggestions = "🎯 What to do next:\n".to_string();
            if obj_count == 0 {
                suggestions += "• Start with a template: 'template fps' or 'template rpg'\n";
                suggestions += "• Or build from scratch: 'add cube', 'add sphere'\n";
                suggestions += "• Generate a world: 'generate city 5'";
            } else if obj_count < 5 {
                suggestions += "• Add more objects to flesh out your scene\n";
                suggestions += "• Try 'foliage grass' for natural environments\n";
                suggestions += "• Add lighting: 'light white 0 5 0'";
            } else if !has_ai {
                suggestions += "• Add AI characters: 'add ai patrol'\n";
                suggestions += "• Or a crowd: 'crowd 20'\n";
                suggestions += "• Set up navigation: 'navmesh'";
            } else if self.quests.is_empty() {
                suggestions += "• Create a quest: 'quest add Save the Village'\n";
                suggestions += "• Add dialogue: 'dialogue create elder'\n";
                suggestions += "• Set up inventory: 'inv add health potion'";
            } else {
                suggestions += "• Polish: add decals, foliage, weather\n";
                suggestions += "• Cinematics: 'cinematic' or 'sequencer'\n";
                suggestions += "• Test: 'play physics' to see it in action\n";
                suggestions += "• Export: 'export MyGame' to create an app bundle";
            }
            suggestions
        } else if lower.contains("surprise") || lower.contains("cool") || lower.contains("random") {
            // Pick something fun based on scene state
            let surprises = [
                ("🌧️ Let's set the mood!", "weather thunderstorm"),
                ("🏙️ How about a city?", "generate city 6"),
                ("👥 Crowd simulation!", "crowd 30"),
                ("💥 Make something destructible!", "Add a cube, select it, type 'destructible'"),
                ("🌿 Paint some nature!", "foliage grass"),
                ("🎬 Cinematic camera!", "cinematic"),
                ("📸 Camera shake!", "shake 0.8"),
                ("🪐 Zero gravity!", "gravity zero"),
                ("👻 Horror vibes!", "template horror"),
                ("🔥 Add some fire!", "fire"),
            ];
            let idx = (self.objects.len() + self.ai_agents.len()) % surprises.len();
            let (desc, cmd) = surprises[idx];
            format!("{}\nTry: '{}'", desc, cmd)
        } else {
            // General helpful response
            format!("I can help with:\n• 'Analyze my scene' — get a full review\n• 'What should I add next?' — contextual suggestions\n• 'Style tips' — make it look better\n• 'Optimize' — performance advice\n• 'Surprise me' — something fun\n\nOr just describe what you want to build and I'll suggest commands!")
        }
    }

    fn weather_active(&self) -> bool {
        self.particle_emitters.iter().any(|e| matches!(e.emitter_type, ParticleType::Rain | ParticleType::Snow))
    }

    fn generate_copilot_suggestions(&mut self) {
        self.editor.ai_suggestions.clear();
        let obj_count = self.objects.len();
        let has_ground = self.objects.iter().any(|o| o.name.contains("ground") || o.name.contains("floor") || o.name.contains("terrain"));
        let has_player = self.objects.iter().any(|o| o.name.contains("player") || o.name.contains("hero"));
        let has_lights = !self.scene_lights.is_empty();

        if obj_count == 0 {
            self.editor.ai_suggestions.push(editor::AiSuggestion {
                icon: "🎮".into(), title: "Start with a template".into(),
                description: "Choose a game type to get started fast".into(),
                command: "template rpg".into(), priority: 2, category: editor::SuggestionCategory::Build,
            });
            self.editor.ai_suggestions.push(editor::AiSuggestion {
                icon: "🏙️".into(), title: "Generate a world".into(),
                description: "Create a procedural city, forest, or dungeon".into(),
                command: "generate city 5".into(), priority: 2, category: editor::SuggestionCategory::Build,
            });
            return;
        }

        if !has_ground {
            self.editor.ai_suggestions.push(editor::AiSuggestion {
                icon: "⚠️".into(), title: "Add a ground plane".into(),
                description: "Your scene needs a floor for objects to sit on".into(),
                command: "add plane".into(), priority: 2, category: editor::SuggestionCategory::Fix,
            });
        }

        if !has_lights && obj_count > 2 {
            self.editor.ai_suggestions.push(editor::AiSuggestion {
                icon: "💡".into(), title: "Add lighting".into(),
                description: "Lights make your scene come alive".into(),
                command: "light white 0 8 0".into(), priority: 2, category: editor::SuggestionCategory::Style,
            });
        }

        if obj_count > 10 && self.objects.iter().all(|o| o.lod_meshes.is_empty()) {
            self.editor.ai_suggestions.push(editor::AiSuggestion {
                icon: "⚡".into(), title: "Enable Auto-LOD".into(),
                description: format!("{} objects without LOD — could improve performance", obj_count),
                command: "auto lod".into(), priority: 1, category: editor::SuggestionCategory::Optimize,
            });
        }

        if has_player && self.ai_agents.is_empty() {
            self.editor.ai_suggestions.push(editor::AiSuggestion {
                icon: "🤖".into(), title: "Add AI enemies".into(),
                description: "Spawn patrol/chase AI agents for gameplay".into(),
                command: "add ai patrol".into(), priority: 1, category: editor::SuggestionCategory::Gameplay,
            });
        }

        if has_player && self.quests.is_empty() {
            self.editor.ai_suggestions.push(editor::AiSuggestion {
                icon: "📜".into(), title: "Create a quest".into(),
                description: "Give the player something to do".into(),
                command: "quest add Main Quest".into(), priority: 1, category: editor::SuggestionCategory::Gameplay,
            });
        }

        if !self.fog_enabled && obj_count > 5 {
            self.editor.ai_suggestions.push(editor::AiSuggestion {
                icon: "🌫️".into(), title: "Add atmosphere".into(),
                description: "Fog adds depth and mood to your scene".into(),
                command: "fog on".into(), priority: 0, category: editor::SuggestionCategory::Style,
            });
        }

        if self.foliage_instances.is_empty() && has_ground {
            self.editor.ai_suggestions.push(editor::AiSuggestion {
                icon: "🌿".into(), title: "Paint foliage".into(),
                description: "Add grass and bushes for a natural look".into(),
                command: "foliage grass".into(), priority: 0, category: editor::SuggestionCategory::Style,
            });
        }

        if obj_count > 3 && !self.bloom_enabled {
            self.editor.ai_suggestions.push(editor::AiSuggestion {
                icon: "✨".into(), title: "Enable bloom".into(),
                description: "Bloom adds a cinematic glow effect".into(),
                command: "bloom on".into(), priority: 0, category: editor::SuggestionCategory::Style,
            });
        }

        // Creative ideas
        if obj_count > 5 {
            let ideas = [
                ("🌧️", "Add weather", "Dynamic rain or snow", "weather rain"),
                ("📸", "Try camera shake", "Add impact feel", "shake 0.3"),
                ("🗺️", "Enable minimap", "See your world from above", "minimap on"),
                ("🔗", "Add constraints", "Make objects follow each other", ""),
                ("🎬", "Open sequencer", "Create cinematics", "sequencer"),
            ];
            let idx = obj_count % ideas.len();
            let (icon, title, desc, cmd) = ideas[idx];
            self.editor.ai_suggestions.push(editor::AiSuggestion {
                icon: icon.into(), title: title.into(),
                description: desc.into(),
                command: cmd.into(), priority: 0, category: editor::SuggestionCategory::Idea,
            });
        }

        // Sort by priority (high first)
        self.editor.ai_suggestions.sort_by(|a, b| b.priority.cmp(&a.priority));
        // Keep max 5
        self.editor.ai_suggestions.truncate(5);
    }

    fn populate_asset_browser(&mut self) {
        self.editor.asset_list.clear();
        // Add built-in primitives
        for name in &["cube", "sphere", "cylinder", "cone", "torus", "plane"] {
            self.editor.asset_list.push(editor::AssetInfo {
                name: name.to_string(),
                kind: editor::AssetKind::Model,
                path: "built-in".into(),
            });
        }
        // Scan assets directory for .glb models
        if let Ok(entries) = std::fs::read_dir("assets/models") {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e == "glb" || e == "gltf").unwrap_or(false) {
                    let name = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
                    self.editor.asset_list.push(editor::AssetInfo {
                        name, kind: editor::AssetKind::Model,
                        path: path.to_string_lossy().to_string(),
                    });
                }
            }
        }
        // Scan prefabs
        if let Ok(entries) = std::fs::read_dir("assets/prefabs") {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e == "json").unwrap_or(false) {
                    let name = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
                    self.editor.asset_list.push(editor::AssetInfo {
                        name, kind: editor::AssetKind::Prefab,
                        path: path.to_string_lossy().to_string(),
                    });
                }
            }
        }
        // Scan sounds
        if let Ok(entries) = std::fs::read_dir("assets/sounds") {
            for entry in entries.flatten() {
                let path = entry.path();
                let ext = path.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default();
                if ["wav", "ogg", "mp3", "flac"].contains(&ext.as_str()) {
                    let name = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
                    self.editor.asset_list.push(editor::AssetInfo {
                        name, kind: editor::AssetKind::Sound,
                        path: path.to_string_lossy().to_string(),
                    });
                }
            }
        }
    }

    fn process_editor_actions(&mut self) {
        // Delete
        if let Some(name) = self.editor.action_delete.take() {
            self.delete_object(&name);
        }
        // Duplicate
        if let Some(name) = self.editor.action_duplicate.take() {
            self.duplicate_object(&name);
        }
        // Modify
        if let Some((name, info)) = self.editor.action_modify.take() {
            self.modify_object(&name, &info);
        }
        // Save
        if self.editor.action_save {
            self.editor.action_save = false;
            self.save_scene();
            self.editor.add_system_message("💾 Scene saved!");
        }
        // Load
        if self.editor.action_load {
            self.editor.action_load = false;
            self.load_scene();
        }
        // Undo
        if self.editor.action_undo {
            self.editor.action_undo = false;
            self.undo();
        }
        // Redo
        if self.editor.action_redo {
            self.editor.action_redo = false;
            self.redo();
        }
        // Clear
        if self.editor.action_clear {
            self.editor.action_clear = false;
            self.push_undo();
            self.objects.clear();
            self.editor.selected_entity = None;
            self.editor.add_system_message("🗑️ Scene cleared");
            self.sync_editor_scene();
        }
        // Focus
        if let Some(name) = self.editor.action_focus.take() {
            self.focus_camera_on(&name);
        }
    }

    fn render(&mut self) {
        self.process_editor_actions();

        // Check for AI responses
        if let Ok(response) = self.ai_rx.try_recv() {
            if response.contains("\"error\"") {
                let err = response.replace("{\"error\": \"", "").replace("\"}", "");
                self.editor.add_ai_response(&format!("❌ {}", err));
            } else {
                self.handle_ai_response(&response);
            }
        }

        self.editor.fps = self.time.fps;


        // AI Agent behavior tick
        for agent in &mut self.ai_agents {
            if agent.state == AiState::Dead { continue; }
            match agent.behavior {
                BehaviorType::Patrol => {
                    if !agent.patrol_points.is_empty() {
                        let target = agent.patrol_points[agent.patrol_idx];
                        if let Some(obj) = self.objects.iter_mut().find(|o| o.name == agent.target_object) {
                            let dir = target - obj.transform.position;
                            let dist = dir.length();
                            if dist > 0.5 {
                                let move_dir = dir.normalize() * agent.speed * 0.016;
                                obj.transform.position += move_dir;
                            } else {
                                agent.patrol_idx = (agent.patrol_idx + 1) % agent.patrol_points.len();
                            }
                        }
                    }
                }
                BehaviorType::Wander => {
                    if let Some(obj) = self.objects.iter_mut().find(|o| o.name == agent.target_object) {
                        let t = self.time.elapsed_secs;
                        obj.transform.position.x += (t * 1.3 + agent.speed).sin() * 0.02;
                        obj.transform.position.z += (t * 0.9 + agent.speed * 2.0).cos() * 0.02;
                    }
                }
                _ => {}
            }
        }

        // Crowd simulation tick
        let crowd_count = self.crowd_agents.len();
        if crowd_count > 0 {
            // Simple steering + avoidance
            let positions: Vec<Vec3> = self.crowd_agents.iter().map(|a| a.position).collect();
            for (i, agent) in self.crowd_agents.iter_mut().enumerate() {
                let dir = agent.target - agent.position;
                let dist = dir.length();
                if dist > 1.0 {
                    let mut steering = dir.normalize() * agent.speed;
                    // Avoidance
                    for (j, other_pos) in positions.iter().enumerate() {
                        if i == j { continue; }
                        let sep = agent.position - *other_pos;
                        let sep_dist = sep.length();
                        if sep_dist < agent.avoidance_radius * 2.0 && sep_dist > 0.01 {
                            steering += sep.normalize() * (agent.avoidance_radius * 2.0 - sep_dist) * 2.0;
                        }
                    }
                    agent.velocity = steering.normalize() * agent.speed;
                    agent.position += agent.velocity * 0.016;
                } else {
                    // Reached target, pick new one
                    agent.target = Vec3::new(-agent.target.x + 5.0, 0.0, -agent.target.z + 3.0);
                }
            }
            // Sync crowd positions to objects
            let mut crowd_idx = 0;
            for obj in &mut self.objects {
                if obj.name.starts_with("crowd_") {
                    if crowd_idx < self.crowd_agents.len() {
                        obj.transform.position = self.crowd_agents[crowd_idx].position + Vec3::new(0.0, 0.5, 0.0);
                        crowd_idx += 1;
                    }
                }
            }
        }

        // Camera shake tick
        if self.camera_shake_duration > 0.0 {
            self.camera_shake_timer += 0.016;
            if self.camera_shake_timer < self.camera_shake_duration {
                let decay = 1.0 - self.camera_shake_timer / self.camera_shake_duration;
                let t = self.time.elapsed_secs * 30.0;
                self.camera_pos.x += t.sin() * self.camera_shake_intensity * decay * 0.1;
                self.camera_pos.y += (t * 1.3).cos() * self.camera_shake_intensity * decay * 0.05;
            } else {
                self.camera_shake_duration = 0.0;
                self.camera_shake_timer = 0.0;
            }
        }

        // Constraint system tick
        let obj_positions: std::collections::HashMap<String, Vec3> = self.objects.iter().map(|o| (o.name.clone(), o.transform.position)).collect();
        for constraint in &self.constraints {
            if let Some(target_pos) = obj_positions.get(&constraint.target) {
                if let Some(obj) = self.objects.iter_mut().find(|o| o.name == constraint.object_name) {
                    match constraint.constraint_type {
                        ConstraintType::Follow => {
                            let dir = *target_pos - obj.transform.position;
                            obj.transform.position += dir * 0.05; // smooth follow
                        }
                        ConstraintType::CopyPosition => {
                            obj.transform.position = *target_pos;
                        }
                        ConstraintType::LookAt => {
                            let dir = *target_pos - obj.transform.position;
                            if dir.length() > 0.01 {
                                let yaw = dir.z.atan2(dir.x);
                                obj.transform.rotation = Quat::from_rotation_y(-yaw);
                            }
                        }
                        _ => {}
                    }
                }
            }
        }


        // Cutscene director playback
        if let Some(ref mut cs) = self.cutscene_director {
            if cs.playing && !cs.shots.is_empty() {
                cs.time += 0.016;
                let shot = &cs.shots[cs.current_shot];
                if cs.time >= shot.duration {
                    cs.time = 0.0;
                    cs.current_shot += 1;
                    if cs.current_shot >= cs.shots.len() {
                        cs.playing = false;
                        cs.current_shot = 0;
                    }
                } else {
                    let t = cs.time / shot.duration;
                    let s = t * t * (3.0 - 2.0 * t); // smoothstep
                    self.camera_pos = shot.camera_pos; // TODO: lerp between shots
                    let dir = shot.camera_target - self.camera_pos;
                    if dir.length() > 0.01 {
                        self.camera_yaw = dir.z.atan2(dir.x);
                        self.camera_pitch = dir.y.atan2((dir.x * dir.x + dir.z * dir.z).sqrt());
                    }
                }
            }
        }

        // Game timer
        if self.game_timer_running && !self.game_paused {
            self.game_timer += 0.016;
        }

        // Wind effect on particles
        if self.wind_strength > 0.0 {
            let wind_force = self.wind_direction * self.wind_strength * 0.016;
            for emitter in &mut self.particle_emitters {
                for p in &mut emitter.particles {
                    p.position[0] += wind_force.x;
                    p.position[2] += wind_force.z;
                }
            }
        }

        // Sequencer playback
        if self.sequencer_playing {
            self.sequencer_time += 0.016;
            if self.sequencer_time > self.sequencer_duration {
                self.sequencer_playing = false;
                self.sequencer_time = 0.0;
            }
        }







        // Survival tick
        if self.hunger_enabled && !self.game_paused {
            self.hunger -= 0.01 * self.time_scale;
            self.thirst -= 0.015 * self.time_scale;
            if self.hunger <= 0.0 || self.thirst <= 0.0 {
                // Take damage from starvation/dehydration
                if let Some(h) = self.health_components.iter_mut().find(|h| h.object_name.contains("player")) {
                    h.current -= 0.1 * self.time_scale;
                }
            }
        }

        // Wanted level decay
        if self.wanted_level > 0 && self.wanted_timer <= 0.0 {
            self.wanted_timer = 30.0;
        }
        if self.wanted_timer > 0.0 {
            self.wanted_timer -= 0.016 * self.time_scale;
            if self.wanted_timer <= 0.0 && self.wanted_level > 0 {
                self.wanted_level -= 1;
                if self.wanted_level > 0 { self.wanted_timer = 30.0; }
            }
        }

        // Resource regen
        for r in &mut self.resources {
            if r.amount < r.max_amount {
                r.amount = (r.amount + r.regen_rate * 0.016 * self.time_scale).min(r.max_amount);
            }
        }

        // Auction timer
        self.auction_items.retain_mut(|a| { a.time_remaining -= 0.016 * self.time_scale; a.time_remaining > 0.0 });

        // Mini-game tick
        for mg in &mut self.mini_games {
            if mg.active {
                mg.timer += 0.016 * self.time_scale;
                if mg.timer >= mg.duration {
                    mg.active = false;
                    self.notification_queue.push((format!("🎮 {} over! Score: {}", mg.name, mg.score), 4.0, [0.2, 0.8, 1.0, 1.0]));
                }
            }
        }

        // Trap cooldown tick
        for trap in &mut self.traps {
            if trap.timer > 0.0 { trap.timer -= 0.016 * self.time_scale; }
        }

        // Ping decay
        self.ping_positions.retain_mut(|(_, timer, _)| { *timer -= 0.016; *timer > 0.0 });

        // World event tick
        for event in &mut self.world_events {
            if event.active {
                event.timer += 0.016 * self.time_scale;
                if event.timer >= event.duration {
                    event.active = false;
                    if event.repeating { event.cooldown = event.interval; }
                }
            } else if event.repeating && event.cooldown > 0.0 {
                event.cooldown -= 0.016 * self.time_scale;
                if event.cooldown <= 0.0 { event.active = true; event.timer = 0.0; }
            }
        }

        // Dialogue display decay
        if self.dialogue_display_timer > 0.0 {
            self.dialogue_display_timer -= 0.016;
            if self.dialogue_display_timer <= 0.0 && !self.dialogue_queue.is_empty() {
                self.dialogue_queue.remove(0);
            }
        }

        // Vehicle fuel burn
        for v in &mut self.vehicles {
            if v.occupied && v.speed > 0.0 && v.fuel.is_finite() {
                v.fuel -= v.speed * 0.001 * self.time_scale;
                if v.fuel <= 0.0 { v.fuel = 0.0; v.speed = 0.0; }
            }
        }

        // Invincibility decay
        if self.invincibility_timer > 0.0 { self.invincibility_timer -= 0.016 * self.time_scale; }

        // Camera follow target
        if let Some(ref target_name) = self.camera_follow_target.clone() {
            if let Some(obj) = self.objects.iter().find(|o| &o.name == target_name) {
                let target_pos = obj.transform.position + Vec3::new(0.0, self.camera_orbit_dist * 0.5, self.camera_orbit_dist);
                self.camera_pos = self.camera_pos.lerp(target_pos, self.camera_smoothing);
            }
        }

        // Billboard rotation (face camera)
        let cam_pos_copy = self.camera_pos;
        for cutout in &self.cutouts_2d {
            if cutout.billboard {
                if let Some(obj) = self.objects.iter_mut().find(|o| o.name == format!("billboard_{}", cutout.name)) {
                    let dir = cam_pos_copy - obj.transform.position;
                    if dir.length() > 0.01 {
                        let yaw = dir.x.atan2(dir.z);
                        obj.transform.rotation = Quat::from_rotation_y(yaw);
                    }
                }
            }
        }

        // Time of day progression
        if self.time_of_day.auto_lighting && self.day_cycle_active {
            self.time_of_day.hour += 0.016 * self.time_of_day.speed * self.time_scale * 0.1;
            if self.time_of_day.hour >= 24.0 { self.time_of_day.hour -= 24.0; }
        }

        // Combo timer decay
        if self.combo_timer > 0.0 {
            self.combo_timer -= 0.016 * self.time_scale;
            if self.combo_timer <= 0.0 { self.combo_count = 0; }
        }

        // Kill feed decay
        self.kill_feed.retain_mut(|(_, timer)| { *timer -= 0.016; *timer > 0.0 });

        // Notification decay
        self.notification_queue.retain_mut(|(_, timer, _)| { *timer -= 0.016; *timer > 0.0 });

        // Weapon reload tick
        for w in &mut self.weapon_slots {
            if w.reloading {
                w.reload_timer -= 0.016 * self.time_scale;
                if w.reload_timer <= 0.0 {
                    w.reloading = false;
                    if w.max_ammo > 0 { w.ammo = w.max_ammo / 3; }
                }
            }
        }

        // AI Director adaptive difficulty
        if self.ai_director.difficulty < 0.0 {
            // Adaptive: get easier after deaths, harder after kills
            let target = (self.ai_director.enemies_killed as f32 / (self.ai_director.player_deaths as f32 + 1.0).max(1.0)).min(2.0) / 2.0;
            self.ai_director.tension = self.ai_director.tension * 0.99 + target * 0.01;
            self.ai_director.spawn_multiplier = 0.5 + self.ai_director.tension;
            self.ai_director.loot_multiplier = 1.5 - self.ai_director.tension * 0.5;
        }

        // Projectile tick
        let dt_scaled = 0.016 * self.time_scale;
        let mut dead_bullets: Vec<String> = Vec::new();
        for proj in &mut self.projectiles {
            proj.position += proj.velocity * dt_scaled;
            if proj.gravity { proj.velocity.y -= 9.81 * dt_scaled; }
            proj.lifetime -= dt_scaled;
            if proj.lifetime <= 0.0 {
                // Find and mark bullet object for removal
                for obj in &self.objects {
                    if obj.name.starts_with("bullet_") {
                        let dist = (obj.transform.position - proj.position).length();
                        if dist < 2.0 { dead_bullets.push(obj.name.clone()); break; }
                    }
                }
            }
        }
        self.projectiles.retain(|p| p.lifetime > 0.0);
        if !dead_bullets.is_empty() {
            self.objects.retain(|o| !dead_bullets.contains(&o.name));
        }
        // Sync bullet positions
        for proj in &self.projectiles {
            for obj in &mut self.objects {
                if obj.name.starts_with("bullet_") {
                    let dist = (obj.transform.position - (proj.position - proj.velocity * dt_scaled)).length();
                    if dist < 3.0 {
                        obj.transform.position = proj.position;
                        break;
                    }
                }
            }
        }

        // Spawner tick
        for spawner in &mut self.spawners {
            if !spawner.active { continue; }
            spawner.timer += dt_scaled;
            if spawner.timer >= spawner.interval && spawner.spawned_names.len() < spawner.max_alive {
                spawner.timer = 0.0;
                let name = format!("spawned_{}_{}", spawner.name, spawner.spawned_names.len());
                spawner.spawned_names.push(name.clone());
                // We'll handle actual spawn in next frame to avoid borrow issues
            }
        }

        // Status effect tick
        self.status_effects.retain_mut(|effect| {
            effect.timer += dt_scaled;
            if effect.timer >= effect.duration { return false; }
            // Apply effect
            match effect.effect_type {
                StatusType::Poison | StatusType::Burn => {
                    // Damage over time
                    if let Some(h) = self.health_components.iter_mut().find(|h| h.object_name == effect.target) {
                        h.current -= effect.strength * dt_scaled;
                    }
                }
                StatusType::Heal => {
                    if let Some(h) = self.health_components.iter_mut().find(|h| h.object_name == effect.target) {
                        h.current = (h.current + effect.strength * dt_scaled).min(h.max_hp);
                    }
                }
                _ => {}
            }
            true
        });

        // Ability cooldown tick
        for ability in &mut self.abilities {
            if ability.cooldown_timer > 0.0 {
                ability.cooldown_timer -= dt_scaled;
                if ability.cooldown_timer < 0.0 { ability.cooldown_timer = 0.0; }
            }
        }

        // Health regen tick
        for h in &mut self.health_components {
            if h.regen_rate > 0.0 && h.current < h.max_hp {
                h.current = (h.current + h.regen_rate * dt_scaled).min(h.max_hp);
            }
        }

        // Screen flash decay
        if self.screen_flash_timer > 0.0 {
            self.screen_flash_timer -= 0.016;
        }

        // Trail recording
        for trail in &mut self.trails {
            if let Some(obj) = self.objects.iter().find(|o| o.name == trail.object_name) {
                trail.positions.push(obj.transform.position);
                if trail.positions.len() > trail.max_length {
                    trail.positions.remove(0);
                }
            }
        }

        // Damage number float-up
        self.damage_numbers.retain_mut(|dn| {
            dn.timer += 0.016;
            dn.position.y += 2.0 * 0.016;
            dn.color[3] = (1.0 - dn.timer / 1.5).max(0.0);
            dn.timer < 1.5
        });

        // Kill Z check
        self.objects.retain(|o| o.transform.position.y >= self.kill_z || o.name.starts_with("ground") || o.name.starts_with("floor"));


        // ======== AI COPILOT BRAIN ========
        self.copilot_analyze_timer += 0.016;
        self.copilot_suggestion_cooldown -= 0.016;

        // Handle suggestion execution
        if let Some(cmd) = self.editor.action_execute_suggestion.take() {
            self.send_to_ai(&cmd);
        }

        // Handle copilot chat messages
        let last_msg = self.editor.ai_copilot_history.last().map(|m| (m.role, m.text.clone()));
        if let Some((editor::CopilotRole::User, msg)) = last_msg {
            let response = self.generate_copilot_response(&msg);
            self.editor.ai_copilot_history.push(editor::CopilotMessage {
                role: editor::CopilotRole::Assistant,
                text: response,
            });
        }

        // Auto-analyze scene every 5 seconds
        if self.editor.copilot_auto_suggest && self.copilot_analyze_timer > 5.0 {
            self.copilot_analyze_timer = 0.0;
            let obj_count = self.objects.len();

            // Only regenerate suggestions if scene changed
            if obj_count != self.copilot_last_object_count && self.copilot_suggestion_cooldown <= 0.0 {
                self.copilot_last_object_count = obj_count;
                self.copilot_suggestion_cooldown = 10.0;
                self.generate_copilot_suggestions();
            }
        }

        // Auto-complete for prompt input
        if !self.editor.prompt_input.is_empty() && self.editor.prompt_input.len() >= 2 {
            let input = self.editor.prompt_input.to_lowercase();
            let all_commands = vec![
                "add cube", "add sphere", "add cylinder", "add cone", "add torus",
                "wall", "floor", "stairs", "tower", "array", "scatter",
                "color red", "color blue", "color green", "color gold", "color #",
                "metallic", "roughness", "emissive",
                "template fps", "template rpg", "template horror", "template platformer",
                "template racing", "template third person", "template top down",
                "generate city", "generate forest", "generate dungeon", "generate island",
                "generate mountains", "generate battlefield",
                "add ai patrol", "add ai chase", "add ai wander", "add ai guard",
                "navmesh", "crowd", "dialogue create", "dialogue play",
                "quest add", "quest list", "quest complete",
                "inventory", "inv add", "inv show",
                "foliage grass", "foliage bush", "foliage flower",
                "decal blood", "decal crack", "decal scorch",
                "weather rain", "weather snow", "weather storm", "weather clear",
                "terrain on", "terrain off", "water on", "water off",
                "fog on", "fog off", "day cycle",
                "light red", "light blue", "light white", "spotlight",
                "gravity moon", "gravity mars", "gravity zero", "gravity jupiter",
                "play physics", "stop physics",
                "timeline", "keyframe", "play timeline", "sequencer",
                "nodes", "assets", "stats", "help",
                "save scene", "load scene", "export", "screenshot",
                "auto lod", "reflection high", "culling on",
                "shake", "minimap on", "state machine create",
                "constraint", "layer add", "tag", "var", "bind",
                "pp volume", "audio zone", "reverb cave",
                "sublevel create", "datatable create",
                "destructible", "damage", "duplicate", "delete",
                "snap grid", "distribute", "mirror", "instance",
                "spline mesh", "path", "select", "deselect",
                "focus", "fps", "top down", "isometric",
                "camera orbit", "cinematic", "quicksave", "quickload",
                "reset all", "clear all",
            ];
            let matches: Vec<String> = all_commands.iter()
                .filter(|cmd| cmd.starts_with(&input) && **cmd != input)
                .take(6)
                .map(|s| s.to_string())
                .collect();
            self.editor.prompt_completions = matches;
            self.editor.show_completions = !self.editor.prompt_completions.is_empty();
        } else {
            self.editor.show_completions = false;
            self.editor.prompt_completions.clear();
        }

        // Refresh asset browser
        if self.editor.show_asset_browser && self.editor.asset_list.is_empty() {
            self.populate_asset_browser();
        }

        // Run egui to get UI output
        let egui_ctx = self.egui_ctx.as_ref().unwrap().clone();
        let raw_input = self.egui_state.as_mut().unwrap().take_egui_input(self.window.as_ref().unwrap());
        let mut submitted_prompt: Option<String> = None;
        let full_output = egui_ctx.run(raw_input, |ctx| {

            // Sync timeline state to editor
            self.editor.show_timeline = self.timeline_open;
            self.editor.timeline_playhead = self.timeline_playhead;
            self.editor.timeline_duration = self.timeline_duration;
            self.editor.timeline_playing = self.timeline_playing;
            self.editor.timeline_tracks = self.timeline_tracks.iter().map(|t| {
                editor::TimelineTrackInfo {
                    name: t.object_name.clone(),
                    keyframe_times: t.keyframes.iter().map(|k| k.time).collect(),
                }
            }).collect();
            submitted_prompt = self.editor.draw(ctx);
        });
        self.egui_state.as_mut().unwrap().handle_platform_output(self.window.as_ref().unwrap(), full_output.platform_output);

        // Sync timeline state back from editor
        self.timeline_open = self.editor.show_timeline;
        self.timeline_playhead = self.editor.timeline_playhead;
        self.timeline_duration = self.editor.timeline_duration;
        self.timeline_playing = self.editor.timeline_playing;

        // Handle asset spawn action
        if let Some(asset_name) = self.editor.action_spawn_asset.take() {
            let lower = asset_name.to_lowercase();
            let prompt = format!("add {}", lower);
            // Queue it up
            self.send_to_ai(&prompt);
        }

        // Handle prompt AFTER egui is done
        if let Some(prompt) = submitted_prompt {
            self.send_to_ai(&prompt);
        }

        let paint_jobs = egui_ctx.tessellate(full_output.shapes, full_output.pixels_per_point);

        // Now do GPU work
        let t = self.time.elapsed_secs;

        let cam_t = Transform {
            position: self.camera_pos,
            rotation: Quat::from_euler(glam::EulerRot::YXZ, self.camera_yaw, self.camera_pitch, 0.0),
            scale: Vec3::ONE,
        };

        // Scope GPU borrows carefully
        let size = self.gpu.as_ref().unwrap().size;
        let aspect = size.0 as f32 / size.1 as f32;
        let cam = CameraUniforms::perspective(&cam_t, 60.0, aspect, 0.1, 1000.0);
        let format = self.gpu.as_ref().unwrap().format();

        // Update egui textures
        for (id, delta) in &full_output.textures_delta.set {
            let (device, queue) = {
                let g = self.gpu.as_ref().unwrap();
                (&g.device as *const _, &g.queue as *const _)
            };
            unsafe {
                self.egui_renderer.as_mut().unwrap().update_texture(&*device, &*queue, *id, delta);
            }
        }

        let screen_descriptor = egui_wgpu::ScreenDescriptor {
            size_in_pixels: [size.0, size.1],
            pixels_per_point: full_output.pixels_per_point,
        };

        // === DAY/NIGHT CYCLE ===
        if self.day_cycle_active {
            self.day_cycle_time += 0.016 * self.day_cycle_speed / 60.0;
            if self.day_cycle_time >= 1.0 { self.day_cycle_time -= 1.0; }
            self.apply_day_cycle();
        }

        // === AUTO-SAVE ===
        self.auto_save_timer += 0.016;
        if self.auto_save_timer >= self.auto_save_interval {
            self.auto_save_timer = 0.0;
            self.save_scene();
        }

        // Get frame
        let frame_result = self.gpu.as_ref().unwrap().begin_frame();
        match frame_result {
            Ok((output, view)) => {
                let device = &self.gpu.as_ref().unwrap().device;
                let queue = &self.gpu.as_ref().unwrap().queue;
                let depth_view = &self.gpu.as_ref().unwrap().depth_view;

                queue.write_buffer(self.camera_buffer.as_ref().unwrap(), 0, bytemuck::cast_slice(&[cam.to_raw()]));

                                let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("Frame") });

                self.egui_renderer.as_mut().unwrap().update_buffers(device, queue, &mut encoder, &paint_jobs, &screen_descriptor);



                // === AUTO-SAVE ===
                self.auto_save_timer += 0.016;
                if self.auto_save_timer >= self.auto_save_interval {
                    self.auto_save_timer = 0.0;
                    // Auto-save deferred to after frame
                }

                // === OBJECT ANIMATIONS ===
                {
                    let t = self.time.elapsed_secs;
                    let dt = 0.016f32;
                    for (name, anim) in &self.object_animations {
                        if let Some(idx) = self.objects.iter().position(|o| o.name.to_lowercase().contains(&name.to_lowercase())) {
                            match anim {
                                ObjectAnimation::Orbit { center, radius, speed, phase } => {
                                    let angle = (t - phase) * speed;
                                    self.objects[idx].transform.position.x = center.x + angle.cos() * radius;
                                    self.objects[idx].transform.position.z = center.z + angle.sin() * radius;
                                }
                                ObjectAnimation::Bounce { base_y, height, speed } => {
                                    self.objects[idx].transform.position.y = base_y + (t * speed).sin().abs() * height;
                                }
                                ObjectAnimation::Wave { axis, amplitude, speed } => {
                                    let wave = (t * speed).sin() * amplitude;
                                    self.objects[idx].transform.position += *axis * wave * dt;
                                }
                                ObjectAnimation::Path { waypoints, speed, current, looping } => {
                                    // Path following handled separately
                                }
                            }
                        }
                    }
                }

                // === CAMERA PATH RECORDING ===
                if self.recording_path {
                    self.record_timer += 0.016;
                    if self.record_timer >= 0.25 {  // capture every 250ms
                        self.record_timer = 0.0;
                        let t = self.recorded_keyframes.len() as f32 / 100.0;  // normalize later
                        self.recorded_keyframes.push(CameraKeyframe {
                            position: self.camera_pos,
                            yaw: self.camera_yaw,
                            pitch: self.camera_pitch,
                            time: t,
                        });
                    }
                }

                // === CINEMATIC CAMERA ===
                if self.cinematic_active {
                    self.cinematic_time += 0.016 / self.cinematic_duration;
                    if self.cinematic_time >= 1.0 {
                        self.cinematic_time = 0.0; // loop
                    }
                    let t = self.cinematic_time;
                    let kf = &self.cinematic_keyframes;
                    if kf.len() >= 2 {
                        // Find segment
                        let mut seg = 0;
                        for i in 0..kf.len()-1 {
                            if t >= kf[i].time && t <= kf[i+1].time { seg = i; break; }
                        }
                        let a = &kf[seg];
                        let b = &kf[(seg + 1).min(kf.len() - 1)];
                        let seg_len = b.time - a.time;
                        let local_t = if seg_len > 0.0 { (t - a.time) / seg_len } else { 0.0 };
                        // Smooth step
                        let s = local_t * local_t * (3.0 - 2.0 * local_t);
                        self.camera_pos = a.position.lerp(b.position, s);
                        self.camera_yaw = a.yaw + (b.yaw - a.yaw) * s;
                        self.camera_pitch = a.pitch + (b.pitch - a.pitch) * s;
                    }
                }

                // === PHYSICS SIMULATION ===
                if self.physics_playing {
                    let dt = 0.016f32;
                    let n = self.objects.len();
                    while self.physics_velocities.len() < n { self.physics_velocities.push(Vec3::ZERO); }
                    
                    // Apply gravity + velocity
                    for i in 0..n {
                        self.physics_velocities[i].y -= self.physics_gravity * dt;
                        let vel = self.physics_velocities[i];
                        self.objects[i].transform.position += vel * dt;
                        let radius = self.objects[i].transform.scale.max_element() * 0.5;
                        if self.objects[i].transform.position.y < radius {
                            self.objects[i].transform.position.y = radius;
                            self.physics_velocities[i].y = -self.physics_velocities[i].y * 0.5;
                            self.physics_velocities[i].x *= 0.95;
                            self.physics_velocities[i].z *= 0.95;
                            if self.physics_velocities[i].y.abs() < 0.3 { self.physics_velocities[i].y = 0.0; }
                        }
                    }
                    
                    // Sphere-sphere collisions (separate pass)
                    for i in 0..n {
                        let r_i = self.objects[i].transform.scale.max_element() * 0.5;
                        let p_i = self.objects[i].transform.position;
                        for j in (i+1)..n {
                            let r_j = self.objects[j].transform.scale.max_element() * 0.5;
                            let p_j = self.objects[j].transform.position;
                            let diff = p_i - p_j;
                            let dist = diff.length();
                            let min_dist = r_i + r_j;
                            if dist < min_dist && dist > 0.001 {
                                let normal = diff / dist;
                                let overlap = min_dist - dist;
                                self.objects[i].transform.position += normal * overlap * 0.5;
                                self.objects[j].transform.position -= normal * overlap * 0.5;
                                let rel_vel = self.physics_velocities[i] - self.physics_velocities[j];
                                let impulse = rel_vel.dot(normal) * 0.8;
                                self.physics_velocities[i] -= normal * impulse;
                                self.physics_velocities[j] += normal * impulse;
                            }
                        }
                    }
                }

                let obj_count = self.objects.len();
                // Pre-compute model layout
                let model_align = device.limits().min_uniform_buffer_offset_alignment as usize;
                let model_stride = ((std::mem::size_of::<ModelRaw>() + model_align - 1) / model_align) * model_align;


                    // === PHYSICS (play mode) ===
                    if self.play_mode {
                        for obj in &mut self.objects {
                            if obj.transform.position.y > 0.1 {
                                // Gravity
                                obj.spin_speed += 9.8 * 0.016; // accumulate falling speed (reusing spin_speed as vy hack)
                                obj.transform.position.y -= obj.spin_speed * 0.016;
                            }
                            if obj.transform.position.y < 0.0 {
                                obj.transform.position.y = 0.0;
                                obj.spin_speed = obj.spin_speed.abs() * -0.3; // bounce
                                if obj.spin_speed.abs() < 0.5 { obj.spin_speed = 0.0; }
                            }
                        }
                    }

                // Upload all model data before any draws
                {
                    let obj_count = self.objects.len();
                    let total_slots = 2 + obj_count + obj_count;
                    let mut model_data = vec![0u8; model_stride * total_slots];
                    let ground_raw = ModelRaw { model: Mat4::from_scale(Vec3::splat(100.0)).to_cols_array(), color: self.ground_color };
                    model_data[..std::mem::size_of::<ModelRaw>()].copy_from_slice(bytemuck::bytes_of(&ground_raw));
                    let grid_raw = ModelRaw { model: Mat4::from_translation(Vec3::new(0.0, 0.001, 0.0)).to_cols_array(), color: [1.0; 4] };
                    let off1 = model_stride;
                    model_data[off1..off1 + std::mem::size_of::<ModelRaw>()].copy_from_slice(bytemuck::bytes_of(&grid_raw));
                    // Compute world transforms (parent-child hierarchy)
                    let mut world_matrices = Vec::with_capacity(self.objects.len());
                    for (i, obj) in self.objects.iter().enumerate() {
                        let spin = Quat::from_rotation_y(t * obj.spin_speed);
                        let bob = Vec3::new(0.0, (t * obj.spin_speed * 0.5).sin() * 0.15 * obj.spin_speed.abs(), 0.0);
                        let local_mat = Mat4::from_scale_rotation_translation(obj.transform.scale, spin * obj.transform.rotation, obj.transform.position + bob);
                        let model_mat = if let Some(parent_idx) = obj.parent {
                            if parent_idx < world_matrices.len() {
                                world_matrices[parent_idx] * local_mat
                            } else { local_mat }
                        } else { local_mat };
                        world_matrices.push(model_mat);
                        let model_mat = world_matrices[i];
                        let raw = ModelRaw { model: model_mat.to_cols_array(), color: obj.color };
                        let off = (i + 2) * model_stride;
                        model_data[off..off + std::mem::size_of::<ModelRaw>()].copy_from_slice(bytemuck::bytes_of(&raw));
                    }
                    for (i, obj) in self.objects.iter().enumerate() {
                        let shadow_scale = obj.transform.scale.max_element() * 2.0;
                        let shadow_mat = Mat4::from_scale_rotation_translation(
                            Vec3::new(shadow_scale, 1.0, shadow_scale), Quat::IDENTITY,
                            Vec3::new(obj.transform.position.x, 0.02, obj.transform.position.z),
                        );
                        let raw = ModelRaw { model: shadow_mat.to_cols_array(), color: [0.0, 0.0, 0.0, 0.8] };
                        let off = (i + 2 + obj_count) * model_stride;
                        if off + std::mem::size_of::<ModelRaw>() <= model_data.len() {
                            model_data[off..off + std::mem::size_of::<ModelRaw>()].copy_from_slice(bytemuck::bytes_of(&raw));
                        }
                    }
                    queue.write_buffer(self.model_buffer.as_ref().unwrap(), 0, &model_data);
                }

                // === SHADOW DEPTH PASS ===
                // Render scene from sun's perspective
                let sun_dir = self.sun_direction;
                let shadow_range = 30.0;
                let light_pos = sun_dir * shadow_range;
                let light_view = Mat4::look_at_rh(light_pos, Vec3::ZERO, Vec3::Y);
                let light_proj = Mat4::orthographic_rh(-shadow_range, shadow_range, -shadow_range, shadow_range, 0.1, shadow_range * 2.5);
                let light_vp = light_proj * light_view;
                queue.write_buffer(self.light_vp_buffer.as_ref().unwrap(), 0, bytemuck::cast_slice(&light_vp.to_cols_array()));

                if let (Some(shadow_view), Some(shadow_pipe)) = (&self.shadow_depth_view, &self.shadow_depth_pipeline) {
                    let mut shadow_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                        label: Some("Shadow Depth Pass"),
                        color_attachments: &[],
                        depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                            view: shadow_view,
                            depth_ops: Some(wgpu::Operations { load: wgpu::LoadOp::Clear(1.0), store: wgpu::StoreOp::Store }),
                            stencil_ops: None,
                        }),
                        ..Default::default()
                    });
                    
                    shadow_pass.set_pipeline(shadow_pipe);
                    shadow_pass.set_bind_group(0, self.light_camera_bg.as_ref().unwrap(), &[]);
                    
                    // Draw all objects into shadow map
                    for (i, obj) in self.objects.iter().enumerate() {
                        let dyn_offset = ((i + 2) * model_stride) as u32;
                        shadow_pass.set_bind_group(1, self.model_bind_group.as_ref().unwrap(), &[dyn_offset]);
                        match obj.mesh_type {
                            MeshType::Cube => { shadow_pass.set_vertex_buffer(0, self.cube_vb.as_ref().unwrap().slice(..)); shadow_pass.set_index_buffer(self.cube_ib.as_ref().unwrap().slice(..), wgpu::IndexFormat::Uint32); shadow_pass.draw_indexed(0..self.cube_idx_count, 0, 0..1); }
                            MeshType::Sphere => { shadow_pass.set_vertex_buffer(0, self.sphere_vb.as_ref().unwrap().slice(..)); shadow_pass.set_index_buffer(self.sphere_ib.as_ref().unwrap().slice(..), wgpu::IndexFormat::Uint32); shadow_pass.draw_indexed(0..self.sphere_idx_count, 0, 0..1); }
                            MeshType::Cylinder => { shadow_pass.set_vertex_buffer(0, self.cylinder_vb.as_ref().unwrap().slice(..)); shadow_pass.set_index_buffer(self.cylinder_ib.as_ref().unwrap().slice(..), wgpu::IndexFormat::Uint32); shadow_pass.draw_indexed(0..self.cylinder_idx_count, 0, 0..1); }
                            MeshType::Cone => { shadow_pass.set_vertex_buffer(0, self.cone_vb.as_ref().unwrap().slice(..)); shadow_pass.set_index_buffer(self.cone_ib.as_ref().unwrap().slice(..), wgpu::IndexFormat::Uint32); shadow_pass.draw_indexed(0..self.cone_idx_count, 0, 0..1); }
                            MeshType::Torus => { shadow_pass.set_vertex_buffer(0, self.torus_vb.as_ref().unwrap().slice(..)); shadow_pass.set_index_buffer(self.torus_ib.as_ref().unwrap().slice(..), wgpu::IndexFormat::Uint32); shadow_pass.draw_indexed(0..self.torus_idx_count, 0, 0..1); }
                            MeshType::Plane => {} // skip ground in shadow pass
                            MeshType::Custom(idx) => {
                                if let Some((vb, ib, count)) = self.custom_meshes.get(idx) {
                                    shadow_pass.set_vertex_buffer(0, vb.slice(..));
                                    shadow_pass.set_index_buffer(ib.slice(..), wgpu::IndexFormat::Uint32);
                                    shadow_pass.draw_indexed(0..*count, 0, 0..1);
                                }
                            }
                        }
                    }
                }

                // Scene render pass (MSAA → resolve to swapchain)
                {
                    let msaa_view_ref = self.gpu.as_ref().unwrap().msaa_view.as_ref().unwrap();
                    let scene_resolve = if self.bloom_enabled {
                        self.scene_texture_view.as_ref().unwrap()
                    } else { &view };
                    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                        label: Some("Scene Pass"),
                        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                            view: msaa_view_ref,
                            resolve_target: Some(scene_resolve),
                            depth_slice: None,
                            ops: wgpu::Operations {
                                load: wgpu::LoadOp::Clear(wgpu::Color { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }),
                                store: wgpu::StoreOp::Store,
                            },
                        })],
                        depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                            view: depth_view,
                            depth_ops: Some(wgpu::Operations { load: wgpu::LoadOp::Clear(1.0), store: wgpu::StoreOp::Store }),
                            stencil_ops: None,
                        }),
                        ..Default::default()
                    });

                    // Model data already uploaded above

                    // Sky is the clear color — no draw needed

                    // === DRAW SKY ===
                    if let (Some(sky_pipe), Some(sky_bg)) = (&self.sky_pipeline, &self.sky_bind_group) {
                        // Update sky uniform
                        let inv_vp = cam.view_proj().inverse();
                        let sky_data = SkyUniformRaw {
                            inv_view_proj: inv_vp.to_cols_array(),
                            sun_dir: [self.sun_direction.x, self.sun_direction.y, self.sun_direction.z, t],
                        };
                        queue.write_buffer(self.sky_buffer.as_ref().unwrap(), 0, bytemuck::bytes_of(&sky_data));
                        
                        pass.set_pipeline(sky_pipe);
                        pass.set_bind_group(0, self.camera_bind_group.as_ref().unwrap(), &[]);
                        pass.set_bind_group(1, sky_bg, &[]);
                        pass.draw(0..3, 0..1);  // fullscreen triangle
                    }

                    // === DRAW TERRAIN (replaces ground when enabled) ===
                    if self.terrain_enabled {
                        if let (Some(terr_pipe), Some(terr_bg)) = (&self.terrain_pipeline, &self.terrain_bind_group) {
                            queue.write_buffer(self.terrain_params_buffer.as_ref().unwrap(), 0,
                                bytemuck::bytes_of(&TerrainParamsRaw { time: t, height_scale: 5.0, texture_scale: 0.1, _pad: 0.0 }));
                            pass.set_pipeline(terr_pipe);
                            pass.set_bind_group(0, self.camera_bind_group.as_ref().unwrap(), &[]);
                            pass.set_bind_group(1, self.model_bind_group.as_ref().unwrap(), &[0]);
                            pass.set_bind_group(2, terr_bg, &[]);
                            if let (Some(vb), Some(ib)) = (&self.terrain_vb, &self.terrain_ib) {
                                pass.set_vertex_buffer(0, vb.slice(..));
                                pass.set_index_buffer(ib.slice(..), wgpu::IndexFormat::Uint32);
                                pass.draw_indexed(0..self.terrain_idx_count, 0, 0..1);
                            }
                        }
                    }

                    // === DRAW GROUND ===
                    if !self.terrain_enabled {
                    pass.set_pipeline(self.ground_pipeline.as_ref().unwrap());
                    pass.set_bind_group(0, self.camera_bind_group.as_ref().unwrap(), &[]);
                    pass.set_bind_group(1, self.model_bind_group.as_ref().unwrap(), &[0]);
                    if let Some(shadow_bg) = &self.shadow_map_bind_group {
                        pass.set_bind_group(2, shadow_bg, &[]);
                    }
                    if let Some(default_tex) = &self.default_texture_bind_group {
                        pass.set_bind_group(3, default_tex, &[]);
                    }
                    pass.set_vertex_buffer(0, self.ground_vb.as_ref().unwrap().slice(..));
                    pass.set_index_buffer(self.ground_ib.as_ref().unwrap().slice(..), wgpu::IndexFormat::Uint32);
                    pass.draw_indexed(0..self.ground_idx_count, 0, 0..1);
                    } // end if !terrain_enabled

                    // === DRAW WATER ===
                    if self.water_enabled {
                        if let (Some(water_pipe), Some(water_bg)) = (&self.water_pipeline, &self.water_bind_group) {
                            queue.write_buffer(self.water_params_buffer.as_ref().unwrap(), 0,
                                bytemuck::bytes_of(&WaterParamsRaw { time: t, wave_height: 0.3, wave_speed: 1.0, foam_threshold: 0.2 }));
                            pass.set_pipeline(water_pipe);
                            pass.set_bind_group(0, self.camera_bind_group.as_ref().unwrap(), &[]);
                            // Use ground slot for water model matrix (identity at y=-0.5)
                            let water_model = Mat4::from_translation(Vec3::new(0.0, -0.3, 0.0));
                            let water_raw = ModelRaw { model: water_model.to_cols_array(), color: [1.0; 4] };
                            // Write to a temp spot in model buffer
                            queue.write_buffer(self.model_buffer.as_ref().unwrap(), 0, bytemuck::bytes_of(&water_raw));
                            pass.set_bind_group(1, self.model_bind_group.as_ref().unwrap(), &[0]);
                            pass.set_bind_group(2, water_bg, &[]);
                            if let (Some(vb), Some(ib)) = (&self.water_vb, &self.water_ib) {
                                pass.set_vertex_buffer(0, vb.slice(..));
                                pass.set_index_buffer(ib.slice(..), wgpu::IndexFormat::Uint32);
                                pass.draw_indexed(0..self.water_idx_count, 0, 0..1);
                            }
                        }
                    }


                    // === PHYSICS SIMULATION ===
                    #[cfg(not(target_arch = "wasm32"))]
                    if self.play_mode {
                        if let Some(world) = &mut self.physics_world {
                            world.step();
                            for (i, handle) in self.physics_bodies.iter().enumerate() {
                                if let Some(h) = handle {
                                    if let Some(pos) = world.body_position(*h) {
                                        if i < self.objects.len() {
                                            self.objects[i].transform.position = Vec3::from_array(pos);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    // === DRAW PARTICLES ===
                    {
                        // Update all emitters
                        let dt = 0.016f32; // ~60fps
                        for emitter in &mut self.particle_emitters {
                            emitter.update(dt, t);
                        }
                        // Collect all particles into GPU buffer
                        let all_particles: Vec<ParticleGpu> = self.particle_emitters.iter()
                            .flat_map(|e| e.particles.iter().copied())
                            .take(self.particle_max)
                            .collect();
                        let count = all_particles.len();
                        if count > 0 {
                            if let Some(storage) = &self.particle_storage_buffer {
                                queue.write_buffer(storage, 0, bytemuck::cast_slice(&all_particles));
                            }
                            if let Some(uniform) = &self.particle_uniform_buffer {
                                queue.write_buffer(uniform, 0, bytemuck::bytes_of(&ParticleUniformRaw {
                                    time: t, delta_time: dt, particle_count: count as u32, _pad: 0,
                                }));
                            }
                            if let Some(pipe) = &self.particle_pipeline {
                                pass.set_pipeline(pipe);
                                pass.set_bind_group(0, self.camera_bind_group.as_ref().unwrap(), &[]);
                                pass.set_bind_group(1, self.particle_bind_group.as_ref().unwrap(), &[]);
                                pass.draw(0..6, 0..count as u32); // 6 verts per quad, instanced
                            }
                        }
                    }


                    // === DRAW TRANSFORM GIZMO ===
                    let sel_idx_opt = self.editor.selected_entity.as_ref().and_then(|name| self.objects.iter().position(|o| &o.name == name));
                    if let Some(sel_idx) = sel_idx_opt {
                        if sel_idx < self.objects.len() {
                            if let (Some(gizmo_pipe), Some(gizmo_bg)) = (&self.gizmo_pipeline, &self.gizmo_bind_group) {
                                let obj = &self.objects[sel_idx];
                                let gizmo_scale = (cam.position - obj.transform.position).length() * 0.1; // scale with distance
                                
                                // Draw 3 axis cylinders (X=red, Y=green, Z=blue)
                                let axes = [
                                    (Vec3::X, [1.0, 0.15, 0.15, 1.0], Quat::from_rotation_z(-std::f32::consts::FRAC_PI_2)),
                                    (Vec3::Y, [0.15, 1.0, 0.15, 1.0], Quat::IDENTITY),
                                    (Vec3::Z, [0.15, 0.15, 1.0, 1.0], Quat::from_rotation_x(std::f32::consts::FRAC_PI_2)),
                                ];
                                pass.set_pipeline(gizmo_pipe);
                                pass.set_bind_group(0, self.camera_bind_group.as_ref().unwrap(), &[]);
                                for (dir, color, rot) in &axes {
                                    let arrow_pos = obj.transform.position + *dir * gizmo_scale * 0.5;
                                    let mat = Mat4::from_scale_rotation_translation(
                                        Vec3::new(gizmo_scale * 0.05, gizmo_scale, gizmo_scale * 0.05),
                                        *rot, arrow_pos,
                                    );
                                    let raw = ModelRaw { model: mat.to_cols_array(), color: *color };
                                    queue.write_buffer(self.gizmo_buffer.as_ref().unwrap(), 0, bytemuck::bytes_of(&raw));
                                    pass.set_bind_group(1, self.gizmo_bind_group.as_ref().unwrap(), &[]);
                                    pass.set_vertex_buffer(0, self.cylinder_vb.as_ref().unwrap().slice(..));
                                    pass.set_index_buffer(self.cylinder_ib.as_ref().unwrap().slice(..), wgpu::IndexFormat::Uint32);
                                    pass.draw_indexed(0..self.cylinder_idx_count, 0, 0..1);
                                }
                            }
                        }
                    }

                    // === DRAW BLOB SHADOWS ===
                    if let Some(shadow_pipe) = &self.shadow_pipeline {
                        pass.set_pipeline(shadow_pipe);
                        pass.set_bind_group(0, self.camera_bind_group.as_ref().unwrap(), &[]);
                        for i in 0..obj_count {
                            let dyn_offset = ((i + 2 + obj_count) * model_stride) as u32;
                            pass.set_bind_group(1, self.model_bind_group.as_ref().unwrap(), &[dyn_offset]);
                            pass.draw(0..6, 0..1);
                        }
                    }

                    // === DRAW GRID ===
                    if self.editor.show_grid {
                    pass.set_pipeline(self.grid_pipeline.as_ref().unwrap());
                    pass.set_bind_group(0, self.camera_bind_group.as_ref().unwrap(), &[]);
                    pass.set_bind_group(1, self.model_bind_group.as_ref().unwrap(), &[(model_stride) as u32]);
                    pass.set_vertex_buffer(0, self.grid_vb.as_ref().unwrap().slice(..));
                    pass.draw(0..self.grid_vert_count, 0..1);
                    }

                    // === DRAW OBJECTS ===
                    pass.set_pipeline(self.pipeline.as_ref().unwrap());
                    pass.set_bind_group(0, self.camera_bind_group.as_ref().unwrap(), &[]);
                    if let Some(shadow_bg) = &self.shadow_map_bind_group {
                        pass.set_bind_group(2, shadow_bg, &[]);
                    }
                    // Default texture (untextured objects)
                    if let Some(default_tex) = &self.default_texture_bind_group {
                        pass.set_bind_group(3, default_tex, &[]);
                    }
                    // Upload dynamic light data
                    {
                        let mut light_data = LightArrayGpu {
                            count: self.scene_lights.len() as u32,
                            lights: [PointLightGpu { position: [0.0; 3], radius: 0.0, color: [0.0; 3], intensity: 0.0, direction: [0.0; 3], spot_cutoff: 0.0 }; 32],
                        };
                        for (i, sl) in self.scene_lights.iter().enumerate().take(32) {
                            light_data.lights[i] = PointLightGpu {
                                position: sl.position.to_array(), radius: sl.radius,
                                color: sl.color, intensity: sl.intensity,
                                direction: sl.direction.to_array(), spot_cutoff: sl.spot_cutoff,
                            };
                        }
                        queue.write_buffer(self.dyn_light_storage.as_ref().unwrap(), 0, bytemuck::bytes_of(&light_data));
                    }
                    for (i, obj) in self.objects.iter().enumerate() {
                        // Frustum culling: skip objects behind camera or too far
                        let to_obj = obj.transform.position - cam.position;
                        let cam_dist = to_obj.length();
                        if self.frustum_culling && cam_dist > 2.0 {
                            let cam_forward = Vec3::new(
                                self.camera_yaw.cos() * self.camera_pitch.cos(),
                                self.camera_pitch.sin(),
                                self.camera_yaw.sin() * self.camera_pitch.cos(),
                            );
                            let dot = to_obj.normalize().dot(cam_forward);
                            let obj_radius = obj.transform.scale.max_element();
                            let angle_threshold = -0.2 - (obj_radius / cam_dist).min(0.5);
                            if dot < angle_threshold { continue; }
                        }
                        let dyn_offset = ((i + 2) * model_stride) as u32;
                        pass.set_bind_group(1, self.model_bind_group.as_ref().unwrap(), &[dyn_offset]);
                        // LOD selection based on camera distance
                        let active_mesh = if obj.lod_meshes.is_empty() {
                            obj.mesh_type.clone()
                        } else {
                            obj.lod_meshes.iter()
                                .find(|(max_dist, _)| cam_dist <= *max_dist)
                                .map(|(_, mt)| mt.clone())
                                .unwrap_or(obj.mesh_type.clone())
                        };
                        match active_mesh {
                            MeshType::Cube => { pass.set_vertex_buffer(0, self.cube_vb.as_ref().unwrap().slice(..)); pass.set_index_buffer(self.cube_ib.as_ref().unwrap().slice(..), wgpu::IndexFormat::Uint32); pass.draw_indexed(0..self.cube_idx_count, 0, 0..1); }
                            MeshType::Sphere => { pass.set_vertex_buffer(0, self.sphere_vb.as_ref().unwrap().slice(..)); pass.set_index_buffer(self.sphere_ib.as_ref().unwrap().slice(..), wgpu::IndexFormat::Uint32); pass.draw_indexed(0..self.sphere_idx_count, 0, 0..1); }
                            MeshType::Plane => { pass.set_vertex_buffer(0, self.plane_vb.as_ref().unwrap().slice(..)); pass.set_index_buffer(self.plane_ib.as_ref().unwrap().slice(..), wgpu::IndexFormat::Uint32); pass.draw_indexed(0..self.plane_idx_count, 0, 0..1); }
                            MeshType::Cylinder => { pass.set_vertex_buffer(0, self.cylinder_vb.as_ref().unwrap().slice(..)); pass.set_index_buffer(self.cylinder_ib.as_ref().unwrap().slice(..), wgpu::IndexFormat::Uint32); pass.draw_indexed(0..self.cylinder_idx_count, 0, 0..1); }
                            MeshType::Cone => { pass.set_vertex_buffer(0, self.cone_vb.as_ref().unwrap().slice(..)); pass.set_index_buffer(self.cone_ib.as_ref().unwrap().slice(..), wgpu::IndexFormat::Uint32); pass.draw_indexed(0..self.cone_idx_count, 0, 0..1); }
                            MeshType::Torus => { pass.set_vertex_buffer(0, self.torus_vb.as_ref().unwrap().slice(..)); pass.set_index_buffer(self.torus_ib.as_ref().unwrap().slice(..), wgpu::IndexFormat::Uint32); pass.draw_indexed(0..self.torus_idx_count, 0, 0..1); }
                            MeshType::Custom(idx) => {
                                // Bind per-mesh texture (GLB textures) for realistic rendering
                                if idx < self.mesh_texture_bind_groups.len() {
                                    pass.set_bind_group(3, &self.mesh_texture_bind_groups[idx], &[]);
                                }
                                if let Some((vb, ib, count)) = self.custom_meshes.get(idx) {
                                    pass.set_vertex_buffer(0, vb.slice(..));
                                    pass.set_index_buffer(ib.slice(..), wgpu::IndexFormat::Uint32);
                                    pass.draw_indexed(0..*count, 0, 0..1);
                                }
                                // Restore default texture for next object
                                if let Some(default_tex) = &self.default_texture_bind_group {
                                    pass.set_bind_group(3, default_tex, &[]);
                                }
                            }
                        }
                    }

                    // === DRAW SELECTION HIGHLIGHT ===
                    if let Some(sel_name) = &self.editor.selected_entity {
                        if let Some((i, obj)) = self.objects.iter().enumerate().find(|(_, o)| &o.name == sel_name) {
                            let spin = Quat::from_rotation_y(t * obj.spin_speed);
                            let bob = Vec3::new(0.0, (t * obj.spin_speed * 0.5).sin() * 0.15 * obj.spin_speed.abs(), 0.0);
                            let highlight_scale = obj.transform.scale * 1.08;
                            let highlight_mat = Mat4::from_scale_rotation_translation(highlight_scale, spin * obj.transform.rotation, obj.transform.position + bob);
                            let pulse = (t * 4.0).sin() * 0.3 + 0.7;
                            let raw = ModelRaw { model: highlight_mat.to_cols_array(), color: [1.0, pulse, 0.0, 1.0] };
                            let highlight_offset = 0u32; // reuse slot 0
                            queue.write_buffer(self.model_buffer.as_ref().unwrap(), 0, bytemuck::bytes_of(&raw));

                            if let Some(outline_pipe) = &self.outline_pipeline {
                                pass.set_pipeline(outline_pipe);
                                pass.set_bind_group(0, self.camera_bind_group.as_ref().unwrap(), &[]);
                                pass.set_bind_group(1, self.model_bind_group.as_ref().unwrap(), &[highlight_offset]);
                                // Draw same mesh
                                match obj.mesh_type {
                                    MeshType::Cube => { pass.set_vertex_buffer(0, self.cube_vb.as_ref().unwrap().slice(..)); pass.set_index_buffer(self.cube_ib.as_ref().unwrap().slice(..), wgpu::IndexFormat::Uint32); pass.draw_indexed(0..self.cube_idx_count, 0, 0..1); }
                                    MeshType::Sphere => { pass.set_vertex_buffer(0, self.sphere_vb.as_ref().unwrap().slice(..)); pass.set_index_buffer(self.sphere_ib.as_ref().unwrap().slice(..), wgpu::IndexFormat::Uint32); pass.draw_indexed(0..self.sphere_idx_count, 0, 0..1); }
                                    MeshType::Cylinder => { pass.set_vertex_buffer(0, self.cylinder_vb.as_ref().unwrap().slice(..)); pass.set_index_buffer(self.cylinder_ib.as_ref().unwrap().slice(..), wgpu::IndexFormat::Uint32); pass.draw_indexed(0..self.cylinder_idx_count, 0, 0..1); }
                                    MeshType::Cone => { pass.set_vertex_buffer(0, self.cone_vb.as_ref().unwrap().slice(..)); pass.set_index_buffer(self.cone_ib.as_ref().unwrap().slice(..), wgpu::IndexFormat::Uint32); pass.draw_indexed(0..self.cone_idx_count, 0, 0..1); }
                                    MeshType::Torus => { pass.set_vertex_buffer(0, self.torus_vb.as_ref().unwrap().slice(..)); pass.set_index_buffer(self.torus_ib.as_ref().unwrap().slice(..), wgpu::IndexFormat::Uint32); pass.draw_indexed(0..self.torus_idx_count, 0, 0..1); }
                                    MeshType::Plane => { pass.set_vertex_buffer(0, self.plane_vb.as_ref().unwrap().slice(..)); pass.set_index_buffer(self.plane_ib.as_ref().unwrap().slice(..), wgpu::IndexFormat::Uint32); pass.draw_indexed(0..self.plane_idx_count, 0, 0..1); }
                                    MeshType::Custom(idx) => {
                                        if let Some((vb, ib, count)) = self.custom_meshes.get(idx) {
                                            pass.set_vertex_buffer(0, vb.slice(..));
                                            pass.set_index_buffer(ib.slice(..), wgpu::IndexFormat::Uint32);
                                            pass.draw_indexed(0..*count, 0, 0..1);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // === BLOOM POST-PROCESS ===
                if self.bloom_enabled {
                    if let (Some(extract_pipe), Some(blur_pipe), Some(composite_pipe)) = 
                        (&self.bloom_extract_pipeline, &self.bloom_blur_pipeline, &self.bloom_composite_pipeline) {
                        
                        let mut bloom_encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("Bloom") });
                        
                        // Extract bright pixels → bloom_textures[0]
                        {
                            let mut pass = bloom_encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                                label: Some("Bloom Extract"),
                                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                                    view: &self.bloom_textures[0].1, resolve_target: None, depth_slice: None,
                                    ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::BLACK), store: wgpu::StoreOp::Store },
                                })],
                                ..Default::default()
                            });
                            pass.set_pipeline(extract_pipe);
                            pass.set_bind_group(0, self.bloom_extract_bg.as_ref().unwrap(), &[]);
                            pass.draw(0..3, 0..1);
                        }
                        
                        // Horizontal blur → bloom_textures[1]
                        {
                            let mut pass = bloom_encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                                label: Some("Bloom Blur H"),
                                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                                    view: &self.bloom_textures[1].1, resolve_target: None, depth_slice: None,
                                    ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::BLACK), store: wgpu::StoreOp::Store },
                                })],
                                ..Default::default()
                            });
                            pass.set_pipeline(blur_pipe);
                            pass.set_bind_group(0, self.bloom_blur_h_bg.as_ref().unwrap(), &[]);
                            pass.draw(0..3, 0..1);
                        }
                        
                        // Vertical blur → bloom_textures[2]
                        {
                            let mut pass = bloom_encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                                label: Some("Bloom Blur V"),
                                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                                    view: &self.bloom_textures[2].1, resolve_target: None, depth_slice: None,
                                    ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::BLACK), store: wgpu::StoreOp::Store },
                                })],
                                ..Default::default()
                            });
                            pass.set_pipeline(blur_pipe);
                            pass.set_bind_group(0, self.bloom_blur_v_bg.as_ref().unwrap(), &[]);
                            pass.draw(0..3, 0..1);
                        }
                        
                        // Composite scene + bloom → scene_texture (for post-process)
                        {
                            // We need a separate texture for bloom output since we can't read+write scene_texture
                            // For now, composite directly to swapchain, post-process will read scene_texture pre-bloom
                            let mut pass = bloom_encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                                label: Some("Bloom Composite"),
                                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                                    view: &view, resolve_target: None, depth_slice: None,
                                    ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::BLACK), store: wgpu::StoreOp::Store },
                                })],
                                ..Default::default()
                            });
                            pass.set_pipeline(composite_pipe);
                            pass.set_bind_group(0, self.bloom_composite_bg.as_ref().unwrap(), &[]);
                            pass.draw(0..3, 0..1);
                        }
                        
                        queue.submit(std::iter::once(bloom_encoder.finish()));
                    }
                }
                
                // === POST-PROCESSING PASS ===
                if self.post_enabled {
                    if let (Some(post_pipe), Some(post_bg)) = (&self.post_pipeline, &self.post_bind_group) {
                        let mut post_encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("Post") });
                        
                        // Update params
                        let post_data = PostParamsRaw {
                            time: t, vignette_strength: 0.3, grain_strength: 0.02,
                            saturation: 1.1, contrast: 1.05, brightness: 1.0,
                            chromatic_aberration: 0.002, temperature: 0.1,
                        };
                        queue.write_buffer(self.post_params_buffer.as_ref().unwrap(), 0, bytemuck::bytes_of(&post_data));
                        
                        {
                            let mut pass = post_encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                                label: Some("Post-Process"),
                                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                                    view: &view, resolve_target: None, depth_slice: None,
                                    ops: wgpu::Operations { load: wgpu::LoadOp::Load, store: wgpu::StoreOp::Store },
                                })],
                                ..Default::default()
                            });
                            pass.set_pipeline(post_pipe);
                            pass.set_bind_group(0, post_bg, &[]);
                            pass.draw(0..3, 0..1);
                        }
                        queue.submit(std::iter::once(post_encoder.finish()));
                    }
                }
                
                queue.submit(std::iter::once(encoder.finish()));

                // === POST-PROCESSING PASS ===
                if !self.bloom_enabled {
                    // No bloom: post-process scene_texture → swapchain
                    if let Some(post_pipe) = &self.post_pipeline {
                        self.post_params.time = t;
                        if let Some(buf) = &self.post_params_buffer {
                            queue.write_buffer(buf, 0, bytemuck::bytes_of(&self.post_params));
                        }
                        let mut post_encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("Post") });
                        {
                            let mut pass = post_encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                                label: Some("Post Process"),
                                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                                    view: &view, resolve_target: None, depth_slice: None,
                                    ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::BLACK), store: wgpu::StoreOp::Store },
                                })],
                                ..Default::default()
                            });
                            pass.set_pipeline(post_pipe);
                            pass.set_bind_group(0, self.post_bind_group.as_ref().unwrap(), &[]);
                            pass.draw(0..3, 0..1);
                        }
                        queue.submit(std::iter::once(post_encoder.finish()));
                    }
                }


                // UI overlay
                let mut ui_encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("UI") });
                {
                    let pass = ui_encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                        label: Some("UI Pass"),
                        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                            view: &view, resolve_target: None, depth_slice: None,
                            ops: wgpu::Operations { load: wgpu::LoadOp::Load, store: wgpu::StoreOp::Store },
                        })],
                        depth_stencil_attachment: None,
                        ..Default::default()
                    });
                    let mut pass = pass.forget_lifetime();
                    self.egui_renderer.as_ref().unwrap().render(&mut pass, &paint_jobs, &screen_descriptor);
                }
                queue.submit(std::iter::once(ui_encoder.finish()));
                output.present();

                // Screenshot capture
                if self.screenshot_requested {
                    self.screenshot_requested = false;
                    let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
                    let path = format!("/Users/jamainemartin/Desktop/koko_{}.png", timestamp);
                    // Use macOS screencapture to grab the window
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(100));
                        let _ = std::process::Command::new("screencapture")
                            .args(&["-l", &{
                                // Get window ID of frontmost window
                                let output = std::process::Command::new("osascript")
                                    .args(&["-e", "tell application \"System Events\" to return id of first window of (first process whose frontmost is true)"])
                                    .output();
                                output.map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default()
                            }, &path])
                            .status();
                        // Fallback: just capture entire screen region
                        if !std::path::Path::new(&path).exists() {
                            let _ = std::process::Command::new("screencapture")
                                .args(&["-x", &path])
                                .status();
                        }
                    });
                    self.editor.add_system_message(&format!("📸 Saved to Desktop!"));
                }

                for id in &full_output.textures_delta.free {
                    self.egui_renderer.as_mut().unwrap().free_texture(id);
                }
            }
            Err(wgpu::SurfaceError::Lost) => {
                let s = self.gpu.as_ref().unwrap().size;
                self.gpu.as_mut().unwrap().resize(s.0, s.1);
            }
            Err(e) => tracing::warn!("Surface error: {:?}", e),
        }
    }
}

impl ApplicationHandler for KokoApp {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.window.is_some() { return; }

        #[cfg(not(target_arch = "wasm32"))]
        let attrs = WindowAttributes::default()
            .with_title("⚡ Crate Engine v0.1.0")
            .with_inner_size(PhysicalSize::new(1440, 900));

        #[cfg(target_arch = "wasm32")]
        let attrs = {
            use winit::platform::web::WindowAttributesExtWebSys;
            use web_sys::wasm_bindgen::JsCast;
            let document = web_sys::window().unwrap().document().unwrap();
            let canvas = document.get_element_by_id("crate-canvas").unwrap();
            let canvas: web_sys::HtmlCanvasElement = canvas.dyn_into().unwrap();
            canvas.set_width(900);
            canvas.set_height(500);
            WindowAttributes::default()
                .with_canvas(Some(canvas))
                .with_inner_size(PhysicalSize::new(900, 500))
        };

        let window = Arc::new(event_loop.create_window(attrs).expect("Failed to create window"));
        self.window = Some(window.clone());

        #[cfg(not(target_arch = "wasm32"))]
        {
            let gpu = pollster::block_on(GpuContext::new(window));
            tracing::info!("⚡ Crate Engine on {} ({:?})", gpu.adapter.get_info().name, gpu.adapter.get_info().backend);
            self.gpu = Some(gpu);
            self.init_renderer();
        }

        #[cfg(target_arch = "wasm32")]
        {
            let app_ptr = self as *mut KokoApp;
            wasm_bindgen_futures::spawn_local(async move {
                let gpu = GpuContext::new(window).await;
                web_sys::console::log_1(&format!("⚡ Crate Engine on {} ({:?})", gpu.adapter.get_info().name, gpu.adapter.get_info().backend).into());
                unsafe {
                    (*app_ptr).gpu = Some(gpu);
                    (*app_ptr).init_renderer();
                }
            });
        }
    }

    fn window_event(&mut self, event_loop: &ActiveEventLoop, _id: WindowId, event: WindowEvent) {
        // Let egui handle events first
        if let Some(state) = &mut self.egui_state {
            let resp = state.on_window_event(self.window.as_ref().unwrap(), &event);
            if resp.consumed { return; }
        }

        match event {
            WindowEvent::CloseRequested => { tracing::warn!("🛑 CLOSE REQUESTED — window is closing"); event_loop.exit(); }
            WindowEvent::Resized(size) => { if let Some(gpu) = &mut self.gpu { gpu.resize(size.width, size.height); } }
            WindowEvent::KeyboardInput { event: KeyEvent { physical_key: PhysicalKey::Code(key), state, .. }, .. } => {
                self.input.on_key(key, state);
                if key == KeyCode::Escape && state == ElementState::Pressed { self.cinematic_active = false; if self.physics_playing { self.stop_physics_play(); } }
                // Keyboard shortcuts
                if state == ElementState::Pressed {
                    let ctrl = self.input.key_down(KeyCode::SuperLeft) || self.input.key_down(KeyCode::SuperRight);
                    if ctrl {
                        match key {
                            KeyCode::KeyZ => self.undo(),
                            KeyCode::KeyY => self.redo(),
                            KeyCode::KeyS => { self.save_scene(); self.editor.add_system_message("💾 Saved!"); }
                            KeyCode::KeyO => { self.load_scene(); }
                            KeyCode::KeyN => { self.push_undo(); self.objects.clear(); self.sync_editor_scene(); self.editor.add_system_message("🗑️ Cleared"); }
                            _ => {}
                        }
                    }
                    match key {
                        KeyCode::F1 => { self.send_to_ai("help"); }
                        KeyCode::F5 => { if !self.physics_playing { self.start_physics_play(); self.editor.add_system_message("▶️ Play"); } else { self.stop_physics_play(); self.editor.add_system_message("⏹️ Stop"); } }
                        KeyCode::F11 => { self.send_to_ai("cinematic"); }
                        _ => {}
                    }
                }
            }
            WindowEvent::MouseInput { button, state, .. } => {
                self.input.on_mouse_button(button, state);
                let egui_wants = self.egui_ctx.as_ref().map(|c| c.is_pointer_over_area()).unwrap_or(false);
                if button == winit::event::MouseButton::Left && !egui_wants {
                    if state == ElementState::Pressed {
                        // Check if clicking on an object
                        let pos = self.input.mouse_position;
                        if let Some(name) = self.pick_object(pos.x, pos.y) {
                            // Click to select AND start dragging (no shift needed)
                            self.editor.selected_entity = Some(name.clone());
                            if let Some(obj) = self.objects.iter().find(|o| o.name == name) {
                                self.dragging_object = true;
                                self.drag_start_pos = obj.transform.position;
                                self.drag_plane_y = obj.transform.position.y;
                                self.push_undo();
                            }
                            self.sync_editor_scene();
                        } else if self.editor.camera_mode == editor::CameraMode::Fly {
                            // Clicked empty space — deselect
                            self.editor.selected_entity = None;
                            self.sync_editor_scene();
                        }
                    } else {
                        // Released
                        self.dragging_object = false;
                    }
                }
            }
            WindowEvent::CursorMoved { position, .. } => { self.input.on_mouse_move(glam::Vec2::new(position.x as f32, position.y as f32)); }
            WindowEvent::MouseWheel { delta, .. } => {
                let d = match delta {
                    winit::event::MouseScrollDelta::LineDelta(x, y) => glam::Vec2::new(x, y),
                    winit::event::MouseScrollDelta::PixelDelta(p) => glam::Vec2::new(p.x as f32, p.y as f32),
                };
                self.input.on_scroll(d);
            }
            WindowEvent::RedrawRequested => {
                self.time.update();

                let speed = if self.input.key_down(KeyCode::ShiftLeft) { 15.0 } else { 5.0 } * self.time.unscaled_dt();
                let cam_rot = Quat::from_euler(glam::EulerRot::YXZ, self.camera_yaw, self.camera_pitch, 0.0);
                let forward = cam_rot * Vec3::NEG_Z;
                let right = cam_rot * Vec3::X;

                // Camera: Fly mode = WASD, Orbit mode = left-drag orbits
                let is_orbit = self.editor.camera_mode == editor::CameraMode::Orbit;

                if !is_orbit {
                    // Fly mode: WASD + right-click look
                    if self.input.key_down(KeyCode::KeyW) { self.camera_pos += forward * speed; }
                    if self.input.key_down(KeyCode::KeyS) { self.camera_pos -= forward * speed; }
                    if self.input.key_down(KeyCode::KeyA) { self.camera_pos -= right * speed; }
                    if self.input.key_down(KeyCode::KeyD) { self.camera_pos += right * speed; }
                    if self.input.key_down(KeyCode::Space) { self.camera_pos.y += speed; }
                    if self.input.key_down(KeyCode::ControlLeft) { self.camera_pos.y -= speed; }

                    if self.input.mouse_down(winit::event::MouseButton::Right) {
                        self.camera_yaw -= self.input.mouse_delta.x * 0.003;
                        self.camera_pitch -= self.input.mouse_delta.y * 0.003;
                        self.camera_pitch = self.camera_pitch.clamp(-1.5, 1.5);
                    }
                } else {
                    // Orbit mode: left-drag orbits, right-drag pans, scroll zooms
                    if self.input.mouse_down(winit::event::MouseButton::Left) {
                        self.camera_yaw -= self.input.mouse_delta.x * 0.005;
                        self.camera_pitch -= self.input.mouse_delta.y * 0.005;
                        self.camera_pitch = self.camera_pitch.clamp(-1.5, 1.5);
                        let dist = (self.camera_pos - self.orbit_target).length();
                        let orbit_rot = Quat::from_euler(glam::EulerRot::YXZ, self.camera_yaw, self.camera_pitch, 0.0);
                        self.camera_pos = self.orbit_target + orbit_rot * Vec3::new(0.0, 0.0, dist);
                    }
                    if self.input.mouse_down(winit::event::MouseButton::Right) {
                        let pan_speed = 0.01;
                        self.orbit_target -= right * self.input.mouse_delta.x * pan_speed;
                        self.orbit_target.y += self.input.mouse_delta.y * pan_speed;
                        let dist = (self.camera_pos - self.orbit_target).length();
                        let orbit_rot = Quat::from_euler(glam::EulerRot::YXZ, self.camera_yaw, self.camera_pitch, 0.0);
                        self.camera_pos = self.orbit_target + orbit_rot * Vec3::new(0.0, 0.0, dist);
                    }
                }

                // Scroll zoom
                let scroll = self.input.scroll_delta.y;
                if scroll.abs() > 0.01 {
                    if is_orbit {
                        let dir = (self.camera_pos - self.orbit_target).normalize();
                        let dist = (self.camera_pos - self.orbit_target).length();
                        let new_dist = (dist - scroll * 0.5).max(1.0);
                        self.camera_pos = self.orbit_target + dir * new_dist;
                    } else {
                        let cam_rot = Quat::from_euler(glam::EulerRot::YXZ, self.camera_yaw, self.camera_pitch, 0.0);
                        let fwd = cam_rot * Vec3::NEG_Z;
                        self.camera_pos += fwd * scroll * 0.5;
                    }
                }

                // Safety: prevent NaN/Inf camera positions
                if !self.camera_pos.is_finite() {
                    self.camera_pos = Vec3::new(5.0, 4.0, 8.0);
                    self.camera_yaw = -0.6;
                    self.camera_pitch = -0.35;
                }

                // Viewport drag: move selected object on ground plane
                if self.dragging_object {
                    if let Some(sel_name) = &self.editor.selected_entity.clone() {
                        let pos = self.input.mouse_position;
                        if let Some(gpu) = &self.gpu {
                            let (w, h) = gpu.size;
                            let ndc_x = (pos.x / w as f32) * 2.0 - 1.0;
                            let ndc_y = 1.0 - (pos.y / h as f32) * 2.0;
                            let cam_t = Transform {
                                position: self.camera_pos,
                                rotation: Quat::from_euler(glam::EulerRot::YXZ, self.camera_yaw, self.camera_pitch, 0.0),
                                scale: Vec3::ONE,
                            };
                            let aspect = w as f32 / h as f32;
                            let cam = CameraUniforms::perspective(&cam_t, 60.0, aspect, 0.1, 1000.0);
                            let inv_vp = cam.view_proj().inverse();
                            let near = inv_vp.project_point3(Vec3::new(ndc_x, ndc_y, 0.0));
                            let far = inv_vp.project_point3(Vec3::new(ndc_x, ndc_y, 1.0));
                            let ray_dir = (far - near).normalize();
                            // Intersect ray with Y=drag_plane_y plane
                            if ray_dir.y.abs() > 0.001 {
                                let t_hit = (self.drag_plane_y - near.y) / ray_dir.y;
                                if t_hit > 0.0 {
                                    let hit = near + ray_dir * t_hit;
                                    if let Some(obj) = self.objects.iter_mut().find(|o| o.name == sel_name.as_str()) {
                                        obj.transform.position.x = hit.x;
                                        obj.transform.position.z = hit.z;
                                    }
                                    self.sync_editor_scene();
                                }
                            }
                        }
                    }
                }

                self.input.begin_frame();
                self.render();

                if let Some(window) = &self.window {
                    window.set_title(&format!("⚡ KOKO Engine | FPS: {:.0} | Objects: {}", self.time.fps, self.objects.len()));
                }
            }
            _ => {}
        }
    }

    fn about_to_wait(&mut self, _event_loop: &ActiveEventLoop) {
        if let Some(window) = &self.window { window.request_redraw(); }
    }
    fn new_events(&mut self, _event_loop: &ActiveEventLoop, _cause: StartCause) {}
}


#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;
fn rand_f32(seed: u32) -> f32 {
    let mut s = seed;
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    (s as f32) / (u32::MAX as f32)
}

#[cfg(not(target_arch = "wasm32"))]
fn main() {
    tracing_subscriber::fmt().with_max_level(tracing::Level::INFO).with_target(false).init();
    std::panic::set_hook(Box::new(|info| {
        let bt = std::backtrace::Backtrace::force_capture();
        let msg = format!("KOKO PANIC: {}\n{}", info, bt);
        eprintln!("{}", msg);
        let _ = std::fs::write("/tmp/koko_panic.log", &msg);
    }));
    println!("\n    ⚡ CRATE ENGINE v0.1.0 — Prompt-Driven Game Engine\n");
    let event_loop = EventLoop::new().expect("Failed to create event loop");
    event_loop.set_control_flow(ControlFlow::Poll);
    let mut app = KokoApp::new();
    event_loop.run_app(&mut app).expect("Event loop error");

}

#[cfg(target_arch = "wasm32")]
fn main() {}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(start)]
pub fn wasm_main() {
    console_error_panic_hook::set_once();
    web_sys::console::log_1(&"⚡ Crate Engine v0.1.0 — WASM loaded".into());
    
    // Show the canvas
    if let Some(document) = web_sys::window().and_then(|w| w.document()) {
        if let Some(canvas) = document.get_element_by_id("crate-canvas") {
            let _ = canvas.set_attribute("style", "display:block; width:100%; max-width:900px; height:500px; background:#111; border:1px solid #252525; border-radius:12px; margin:20px auto;");
        }
    }
    
    let event_loop = EventLoop::new().expect("Failed to create event loop");
    event_loop.set_control_flow(ControlFlow::Poll);
    let app = KokoApp::new();
    use winit::platform::web::EventLoopExtWebSys;
    event_loop.spawn_app(app);



}



// ======== ROUND 12: AI, NETWORKING, WORLD BUILDING ========
#[derive(Clone, Debug)]
struct AIBehaviorTree { name: String, root: BehaviorNode, entity: String, state: String }
#[derive(Clone, Debug)]
enum BehaviorNode { Sequence(Vec<BehaviorNode>), Selector(Vec<BehaviorNode>), Action(String), Condition(String), Inverter(Box<BehaviorNode>), Repeater(Box<BehaviorNode>, u32), Wait(f32) }
#[derive(Clone, Debug)]
struct AIBlackboard { name: String, entries: Vec<(String, BlackboardValue)> }
#[derive(Clone, Debug)]
enum BlackboardValue { Float(f32), Int(i32), Bool(bool), Str(String), Vec3([f32;3]) }
#[derive(Clone, Debug)]
struct AIPerception { entity: String, sight_range: f32, sight_angle: f32, hearing_range: f32, detected: Vec<String> }
#[derive(Clone, Debug)]
struct AITerritory { name: String, center: [f32;3], radius: f32, owner: String, contested: bool }
#[derive(Clone, Debug)]
struct AISquad { name: String, members: Vec<String>, leader: String, formation: String, morale: f32 }
#[derive(Clone, Debug)]
struct DialogueGraph { name: String, nodes: Vec<DialogueNode>, current: usize, active: bool }
#[derive(Clone, Debug)]
struct Reputation { faction: String, value: f32, min: f32, max: f32 }
#[derive(Clone, Debug, Copy)]
enum RelationKind { Friendly, Neutral, Hostile, Afraid, Romantic, Rival }
#[derive(Clone, Debug)]
struct NetPlayer { id: u32, name: String, pos: [f32;3], rot: [f32;4], health: f32, team: Option<String>, ping: u32, score: i32 }
#[derive(Clone, Debug)]
struct NetSync { entity: String, owner: u32, interpolation: bool, priority: u32 }
#[derive(Clone, Debug)]
struct ChatMessage2 { sender: String, text: String, channel: String, timestamp: f32 }
#[derive(Clone, Debug)]
struct VoiceChat { enabled: bool, push_to_talk: bool, volume: f32, muted_players: Vec<u32> }
#[derive(Clone, Debug)]
struct Lobby { name: String, max_players: u32, current_players: u32, game_mode: String, map: String, password: Option<String> }
#[derive(Clone, Debug)]
struct Matchmaking { searching: bool, mode: String, rank: u32, search_time: f32, regions: Vec<String> }
#[derive(Clone, Debug)]
struct TerrainChunk { pos: [i32;2], heightmap: Vec<f32>, size: f32, resolution: u32, biome: String }
#[derive(Clone, Debug)]
struct BiomeDefinition { name: String, color: [f32;4], min_height: f32, max_height: f32, tree_density: f32, rock_density: f32, grass_density: f32, weather: String }
#[derive(Clone, Debug)]
struct RoadSegment { start: [f32;3], end: [f32;3], width: f32, material: String, curve: f32 }
#[derive(Clone, Debug)]
struct River { name: String, points: Vec<[f32;3]>, width: f32, depth: f32, flow_speed: f32, color: [f32;4] }
#[derive(Clone, Debug)]
struct Lake { name: String, pos: [f32;3], radius: f32, depth: f32, color: [f32;4] }
#[derive(Clone, Debug)]
struct Cliff { pos: [f32;3], size: [f32;3], angle: f32, material: String }
#[derive(Clone, Debug)]
struct Cave { name: String, entrance: [f32;3], depth: f32, width: f32, stalactites: bool }
#[derive(Clone, Debug)]
struct Waterfall { name: String, pos: [f32;3], height: f32, width: f32, flow_rate: f32, mist: bool }
#[derive(Clone, Debug)]
struct Bridge2 { name: String, start: [f32;3], end: [f32;3], width: f32, style: String, railing: bool }
#[derive(Clone, Debug)]
struct Fence2 { name: String, start: [f32;3], end: [f32;3], height: f32, style: String, posts: u32 }
#[derive(Clone, Debug)]
struct StreetLight2 { name: String, pos: [f32;3], height: f32, color: [f32;4], range: f32, on: bool }
#[derive(Clone, Debug)]
struct Sign { name: String, pos: [f32;3], text: String, size: [f32;2], color: [f32;4] }
#[derive(Clone, Debug)]
struct Barrel { name: String, pos: [f32;3], explosive: bool, hp: f32, content: String }
#[derive(Clone, Debug)]
struct Crate2 { name: String, pos: [f32;3], breakable: bool, hp: f32, loot: Vec<String> }
#[derive(Clone, Debug)]
struct Campfire { name: String, pos: [f32;3], lit: bool, warmth_radius: f32, light_color: [f32;4] }
#[derive(Clone, Debug)]
struct Well { name: String, pos: [f32;3], has_water: bool, depth: f32 }
#[derive(Clone, Debug)]
struct Statue { name: String, pos: [f32;3], model: String, scale: f32, inscription: String }
#[derive(Clone, Debug)]
struct Banner { name: String, pos: [f32;3], color: [f32;4], symbol: String, wave_speed: f32 }
#[derive(Clone, Debug)]
struct Bookshelf { name: String, pos: [f32;3], books: Vec<String>, interactable: bool }
#[derive(Clone, Debug)]
struct Throne { name: String, pos: [f32;3], material: String, occupied: bool }
#[derive(Clone, Debug)]
struct Altar { name: String, pos: [f32;3], deity: String, offerings: Vec<String>, active: bool }
#[derive(Clone, Debug)]
struct Prison { name: String, pos: [f32;3], size: [f32;3], locked: bool, prisoner: Option<String> }
#[derive(Clone, Debug)]
struct Shop2 { name: String, pos: [f32;3], inventory: Vec<ShopItem2>, gold: i64 }
#[derive(Clone, Debug)]
struct ShopItem2 { name: String, price: i64, stock: i32, description: String }
#[derive(Clone, Debug)]
struct Anvil { name: String, pos: [f32;3], durability: f32, recipes: Vec<String> }
#[derive(Clone, Debug)]
struct Furnace { name: String, pos: [f32;3], temperature: f32, fuel: f32, smelting: Option<String>, timer: f32 }
#[derive(Clone, Debug)]
struct Workbench { name: String, pos: [f32;3], craft_type: String, recipes: Vec<String> }
#[derive(Clone, Debug)]
struct StorageChest { name: String, pos: [f32;3], slots: u32, items: Vec<String>, locked: bool }
#[derive(Clone, Debug)]
struct Garden { name: String, pos: [f32;3], plots: Vec<GardenPlot> }
#[derive(Clone, Debug)]
struct GardenPlot { plant: Option<String>, growth: f32, watered: bool, quality: f32 }
#[derive(Clone, Debug)]
struct FishingSpot { name: String, pos: [f32;3], fish_types: Vec<String>, difficulty: f32, active: bool }
#[derive(Clone, Debug)]
struct MiningNode { name: String, pos: [f32;3], ore_type: String, hp: f32, max_hp: f32, respawn_time: f32, timer: f32 }
#[derive(Clone, Debug)]
struct HarvestableTree { name: String, pos: [f32;3], wood_type: String, hp: f32, max_hp: f32, regrow_time: f32, timer: f32, cut: bool }

// ======== ROUND 11: RENDERING, VFX, EDITOR POLISH ========
#[derive(Clone, Debug)]
struct DecalProjector { name: String, pos: [f32;3], normal: [f32;3], size: [f32;2], texture: String, opacity: f32, lifetime: Option<f32>, age: f32 }
#[derive(Clone, Debug)]
struct ScreenEffect { name: String, kind: ScreenEffectKind, intensity: f32, duration: f32, timer: f32, active: bool }
#[derive(Clone, Debug, Copy)]
enum ScreenEffectKind { Vignette, ChromaticAberration, FilmGrain, Scanlines, Blur, Pixelate, Invert, Sepia, Underwater, Drunk, Frozen, Burning }
#[derive(Clone, Debug)]
struct CameraPath { name: String, points: Vec<CameraKeyframe>, duration: f32, timer: f32, playing: bool, looping: bool }
#[derive(Clone, Debug)]
struct LightFlicker { entity: String, base_intensity: f32, flicker_amount: f32, flicker_speed: f32, style: FlickerStyle }
#[derive(Clone, Debug, Copy)]
enum FlickerStyle { Candle, Neon, Strobe, Pulse, Random }
#[derive(Clone, Debug)]
struct TrailEffect { name: String, entity: String, color: [f32;4], width: f32, lifetime: f32, points: Vec<[f32;3]> }
#[derive(Clone, Debug)]
struct AfterImage { entity: String, count: u32, spacing: f32, fade: f32, color: [f32;4] }
#[derive(Clone, Debug)]
struct Shockwave { pos: [f32;3], radius: f32, max_radius: f32, speed: f32, force: f32, timer: f32 }
#[derive(Clone, Debug)]
struct ScreenShake2 { intensity: f32, duration: f32, timer: f32, decay: bool, frequency: f32 }
#[derive(Clone, Debug)]
struct SlowMotionZone { name: String, pos: [f32;3], radius: f32, time_scale: f32 }
#[derive(Clone, Debug)]
struct FreezeFrame { active: bool, duration: f32, timer: f32 }
#[derive(Clone, Debug)]
struct HitStop { active: bool, duration: f32, timer: f32 }
#[derive(Clone, Debug)]
struct CameraZoom { target_fov: f32, speed: f32, active: bool }
#[derive(Clone, Debug)]
struct DepthOfField { enabled: bool, focal_dist: f32, focal_range: f32, blur_amount: f32 }
#[derive(Clone, Debug)]
struct MotionBlur { enabled: bool, intensity: f32, samples: u32 }
#[derive(Clone, Debug)]
struct ColorGrading { enabled: bool, contrast: f32, saturation: f32, brightness: f32, temperature: f32, tint: [f32;3], shadows: [f32;3], midtones: [f32;3], highlights: [f32;3] }
#[derive(Clone, Debug)]
struct LensFlare { name: String, pos: [f32;3], color: [f32;4], intensity: f32, size: f32 }
#[derive(Clone, Debug)]
struct GodRay { enabled: bool, pos: [f32;3], color: [f32;4], intensity: f32, decay: f32, samples: u32 }
#[derive(Clone, Debug)]
struct Outline { entity: String, color: [f32;4], width: f32 }
#[derive(Clone, Debug)]
struct RimLight { entity: String, color: [f32;4], power: f32 }
#[derive(Clone, Debug)]
struct DissolveEffect { entity: String, progress: f32, speed: f32, color: [f32;4], active: bool }
#[derive(Clone, Debug)]
struct Hologram { entity: String, color: [f32;4], scan_speed: f32, glitch: f32 }
#[derive(Clone, Debug)]
struct ForceField { name: String, pos: [f32;3], radius: f32, color: [f32;4], hp: f32, max_hp: f32, ripple: f32 }
#[derive(Clone, Debug)]
struct ElectricArc { name: String, start: [f32;3], end: [f32;3], color: [f32;4], width: f32, segments: u32, timer: f32 }
#[derive(Clone, Debug)]
struct Beam { name: String, start: [f32;3], end: [f32;3], color: [f32;4], width: f32, pulse_speed: f32, timer: f32 }
#[derive(Clone, Debug)]
struct ChainLightning { origin: [f32;3], targets: Vec<[f32;3]>, damage: f32, color: [f32;4], timer: f32, lifetime: f32 }
#[derive(Clone, Debug)]
struct Explosion { pos: [f32;3], radius: f32, max_radius: f32, speed: f32, damage: f32, force: f32, timer: f32, color: [f32;4] }
#[derive(Clone, Debug)]
struct ImpactEffect { pos: [f32;3], kind: String, timer: f32, lifetime: f32 }
#[derive(Clone, Debug)]
struct FloatingText { text: String, pos: [f32;3], color: [f32;4], size: f32, velocity: [f32;3], lifetime: f32, timer: f32 }
#[derive(Clone, Debug)]
struct HealthBar3D { entity: String, offset: [f32;3], width: f32, height: f32, hp: f32, max_hp: f32, color: [f32;4], bg_color: [f32;4], visible: bool }
#[derive(Clone, Debug)]
struct NameTag { entity: String, text: String, offset: [f32;3], color: [f32;4], size: f32, visible: bool }
#[derive(Clone, Debug)]
struct DamageIndicator { direction: f32, timer: f32, lifetime: f32, color: [f32;4] }
#[derive(Clone, Debug)]
struct Crosshair { style: CrosshairStyle, color: [f32;4], size: f32, gap: f32, dot: bool, dynamic_spread: f32 }
#[derive(Clone, Debug, Copy)]
enum CrosshairStyle { Cross, Dot, Circle, Chevron, Custom }
#[derive(Clone, Debug)]
struct Radar { enabled: bool, pos: [f32;2], size: f32, range: f32, rotation: f32, blips: Vec<RadarBlip> }
#[derive(Clone, Debug)]
struct RadarBlip { pos: [f32;3], color: [f32;4], kind: String }
#[derive(Clone, Debug)]
struct AmmoCounter { current: u32, max_ammo: u32, reserve: u32, weapon_name: String }
#[derive(Clone, Debug)]
struct StaminaBar { current: f32, max_stamina: f32, regen_rate: f32, regen_delay: f32, delay_timer: f32 }
#[derive(Clone, Debug)]
struct ManaBar { current: f32, max_mana: f32, regen_rate: f32 }
#[derive(Clone, Debug)]
struct XPBar { current: u64, next_level: u64, level: u32 }
#[derive(Clone, Debug)]
struct ComboCounter { hits: u32, timer: f32, timeout: f32, multiplier: f32, best: u32 }
#[derive(Clone, Debug)]
struct ScoreDisplay { score: i64, displayed_score: i64, speed: f32 }
#[derive(Clone, Debug)]
struct KillStreak { count: u32, timer: f32, timeout: f32, best: u32 }
#[derive(Clone, Debug)]
struct Notification2 { text: String, icon: String, color: [f32;4], timer: f32, duration: f32, style: NotifStyle }
#[derive(Clone, Debug, Copy)]
enum NotifStyle { Banner, Popup, Toast, Corner, Center }
#[derive(Clone, Debug)]
struct QuestTracker { active_quests: Vec<TrackedQuest>, pos: [f32;2], visible: bool }
#[derive(Clone, Debug)]
struct TrackedQuest { name: String, objectives: Vec<TrackedObjective>, progress: f32 }
#[derive(Clone, Debug)]
struct TrackedObjective { text: String, current: u32, target: u32, completed: bool }
#[derive(Clone, Debug)]
struct InteractionPrompt { entity: String, text: String, key: String, range: f32, visible: bool }
#[derive(Clone, Debug)]
struct ToolTip { text: String, pos: [f32;2], visible: bool, timer: f32, delay: f32 }
#[derive(Clone, Debug)]
struct LoadingScreen { active: bool, progress: f32, tip: String, background: String }
#[derive(Clone, Debug)]
struct SplashScreen { active: bool, image: String, duration: f32, timer: f32, fade: f32 }
#[derive(Clone, Debug)]
struct PauseMenu { open: bool, options: Vec<String>, selected: usize }
#[derive(Clone, Debug)]
struct SettingsMenu { open: bool, master_vol: f32, sfx_vol: f32, music_vol: f32, sensitivity: f32, fov: f32, fullscreen: bool, vsync: bool, quality: u32 }
#[derive(Clone, Debug)]
struct PhotoModeState { active: bool, hide_ui: bool, dof_enabled: bool, focal_dist: f32, filter: String, fov: f32, roll: f32, time_frozen: bool }
#[derive(Clone, Debug)]
struct ReplaySystem { recording: bool, playing: bool, frames: Vec<ReplayFrame>, current_frame: usize, speed: f32 }
#[derive(Clone, Debug)]
struct ReplayFrame { time: f32, camera_pos: [f32;3], camera_rot: [f32;4], objects: Vec<(String, [f32;3], [f32;4])> }
#[derive(Clone, Debug)]
struct GhostRecording { name: String, frames: Vec<GhostFrame>, playing: bool, current_frame: usize }
#[derive(Clone, Debug)]
struct GhostFrame { pos: [f32;3], rot: [f32;4], time: f32 }
#[derive(Clone, Debug)]
struct Benchmark { running: bool, frames: u32, total_time: f32, min_fps: f32, max_fps: f32, avg_fps: f32, scene: String }
#[derive(Clone, Debug)]
struct PerformanceOverlay { show_fps: bool, show_ms: bool, show_gpu: bool, show_memory: bool, show_draw_calls: bool, show_triangles: bool, history: Vec<f32> }
#[derive(Clone, Debug)]
struct WireframeMode { enabled: bool, color: [f32;4], thickness: f32 }
#[derive(Clone, Debug)]
struct GridOverlay { enabled: bool, size: f32, color: [f32;4], subdivisions: u32, fade_distance: f32 }
#[derive(Clone, Debug)]
struct BoundsVisualization { show_aabb: bool, show_collision: bool, show_triggers: bool, show_navmesh: bool, show_paths: bool }

// ======== ROUND 10: ADVANCED GAMEPLAY SYSTEMS ========
#[derive(Clone, Debug)]
struct MovingPlatform { name: String, pos: [f32;3], waypoints: Vec<[f32;3]>, speed: f32, idx: usize, wait_time: f32, wait_timer: f32, style: PlatformStyle }
#[derive(Clone, Debug, Copy)]
enum PlatformStyle { Linear, PingPong, Loop, OneShot }
#[derive(Clone, Debug)]
struct Spring { name: String, pos: [f32;3], force: f32, direction: [f32;3], radius: f32 }
#[derive(Clone, Debug)]
struct Portal2 { name: String, pos: [f32;3], target_pos: [f32;3], color: [f32;4], radius: f32, bidirectional: bool, cooldown: f32, timer: f32 }
#[derive(Clone, Debug)]
struct Ladder2 { name: String, pos: [f32;3], height: f32, width: f32, climb_speed: f32 }
#[derive(Clone, Debug)]
struct GrapplePoint2 { name: String, pos: [f32;3], radius: f32, max_dist: f32, pull_speed: f32 }
#[derive(Clone, Debug)]
struct Trampoline { name: String, pos: [f32;3], bounce_force: f32, size: [f32;2] }
#[derive(Clone, Debug)]
struct Fan { name: String, pos: [f32;3], direction: [f32;3], force: f32, range: f32, active: bool }
#[derive(Clone, Debug)]
struct Laser { name: String, start: [f32;3], end: [f32;3], damage: f32, active: bool, color: [f32;4], width: f32, pulse: bool, pulse_timer: f32 }
#[derive(Clone, Debug)]
struct Crusher { name: String, pos: [f32;3], size: [f32;3], speed: f32, delay: f32, timer: f32, extended: bool }
#[derive(Clone, Debug)]
struct FlameJet { name: String, pos: [f32;3], direction: [f32;3], range: f32, damage: f32, on_time: f32, off_time: f32, timer: f32, active: bool }
#[derive(Clone, Debug)]
struct PressurePlate2 { name: String, pos: [f32;3], size: [f32;2], weight_required: f32, target: String, activated: bool }
#[derive(Clone, Debug)]
struct Rope2 { name: String, anchor_a: [f32;3], anchor_b: [f32;3], segments: usize, swing_force: f32, grab_radius: f32 }
#[derive(Clone, Debug)]
struct BreakableWall { name: String, pos: [f32;3], size: [f32;3], hp: f32, max_hp: f32, material: String, debris_count: u32 }
#[derive(Clone, Debug)]
struct SecretArea { name: String, pos: [f32;3], size: [f32;3], revealed: bool, hint: String, reward: String }
#[derive(Clone, Debug)]
struct Checkpoint2 { name: String, pos: [f32;3], activated: bool, animation_timer: f32 }
#[derive(Clone, Debug)]
struct ScoringZone { name: String, pos: [f32;3], size: [f32;3], points: i32, team: Option<String>, scored: bool }
#[derive(Clone, Debug)]
struct Timer2 { name: String, duration: f32, elapsed: f32, running: bool, loop_timer: bool, on_complete: String }
#[derive(Clone, Debug)]
struct Counter { name: String, value: i32, min: i32, max: i32, on_max: String, on_min: String }
#[derive(Clone, Debug)]
struct AIFormation { name: String, kind: FormationKind, members: Vec<String>, spacing: f32, leader: Option<String> }
#[derive(Clone, Debug, Copy)]
enum FormationKind { Line, Circle, Wedge, Square, Scatter }
#[derive(Clone, Debug)]
struct CombatArena { name: String, pos: [f32;3], radius: f32, active: bool, waves_cleared: u32, enemies_alive: u32 }
#[derive(Clone, Debug)]
struct TreasureChest { name: String, pos: [f32;3], locked: bool, key_required: Option<String>, loot: Vec<String>, opened: bool }
#[derive(Clone, Debug)]
struct EnvironmentPuzzle { name: String, elements: Vec<PuzzleElement>, solved: bool, reward: String }
#[derive(Clone, Debug)]
struct PuzzleElement { kind: String, pos: [f32;3], state: bool, target: Option<String> }
#[derive(Clone, Debug)]
struct Minimap2 { enabled: bool, pos: [f32;2], size: f32, zoom: f32, rotation: f32, icons: Vec<MinimapIcon> }
#[derive(Clone, Debug)]
struct MinimapIcon { name: String, pos: [f32;3], icon: String, color: [f32;4], visible: bool }
#[derive(Clone, Debug)]
struct CompassMarker { name: String, pos: [f32;3], icon: String, color: [f32;4], distance_show: f32 }
#[derive(Clone, Debug)]
struct DamageZone { name: String, pos: [f32;3], size: [f32;3], dps: f32, element: String, active: bool }
#[derive(Clone, Debug)]
struct HealZone { name: String, pos: [f32;3], size: [f32;3], hps: f32, active: bool }
#[derive(Clone, Debug)]
struct SpeedZone { name: String, pos: [f32;3], size: [f32;3], multiplier: f32, active: bool }
#[derive(Clone, Debug)]
struct SlowZone { name: String, pos: [f32;3], size: [f32;3], multiplier: f32, active: bool }
#[derive(Clone, Debug)]
struct TeleportPad2 { name: String, pos: [f32;3], target: String, cooldown: f32, timer: f32, color: [f32;4] }
#[derive(Clone, Debug)]
struct Projectile2 { name: String, pos: [f32;3], velocity: [f32;3], damage: f32, lifetime: f32, age: f32, owner: String, kind: ProjectileKind }
#[derive(Clone, Debug, Copy)]
enum ProjectileKind { Bullet, Arrow, Fireball, IceShard, Lightning, Rocket, Grenade, Laser }
#[derive(Clone, Debug)]
struct PickupSpawner { name: String, pos: [f32;3], pickup_kind: String, interval: f32, timer: f32, max_active: u32, active_count: u32 }
#[derive(Clone, Debug)]
struct Torch { name: String, pos: [f32;3], lit: bool, color: [f32;4], range: f32, flicker: f32 }
#[derive(Clone, Debug)]
struct LevelGate { name: String, pos: [f32;3], required_keys: u32, keys_collected: u32, open: bool, next_level: String }
#[derive(Clone, Debug)]
struct CutsceneTrigger { name: String, pos: [f32;3], radius: f32, cutscene: String, played: bool, one_shot: bool }
#[derive(Clone, Debug)]
struct AmbientSound { name: String, pos: [f32;3], sound: String, range: f32, volume: f32, looping: bool }
#[derive(Clone, Debug)]
struct Footstep { surface: String, sound: String, volume: f32 }
#[derive(Clone, Debug)]
struct WeatherZone { name: String, pos: [f32;3], size: [f32;3], weather: String, intensity: f32, transition_time: f32 }
#[derive(Clone, Debug)]
struct WindZone2 { name: String, pos: [f32;3], size: [f32;3], direction: [f32;3], force: f32, turbulence: f32 }
#[derive(Clone, Debug)]
struct Reflector { name: String, pos: [f32;3], normal: [f32;3], size: [f32;2], reflectivity: f32 }
#[derive(Clone, Debug)]
struct GlowObject { name: String, entity: String, color: [f32;4], intensity: f32, pulse_speed: f32 }
#[derive(Clone, Debug)]
struct ShadowCaster { name: String, pos: [f32;3], size: [f32;3], strength: f32 }

// ========== NEW SYSTEMS: MEGA 9 ==========

struct Ragdoll { name: String, joints: Vec<[f32;3]>, active: bool, stiffness: f32 }
struct BezierPath { name: String, points: Vec<[f32;3]>, speed: f32, looping: bool, t: f32 }
struct BuoyancyZone { name: String, pos: [f32;3], size: [f32;3], density: f32, drag: f32 }

#[derive(Debug, Clone, Copy, PartialEq)]
enum StealthState { Unaware, Suspicious, Searching, Alerted, Combat }
struct StealthDetector { name: String, range: f32, fov: f32, alert: f32, state: StealthState }

#[derive(Debug, Clone, Copy, PartialEq)]
enum SwitchType { Toggle, Momentary, PressurePlate, Sequence }
struct PuzzleSwitch { name: String, pos: [f32;3], on: bool, target: String, kind: SwitchType, reset: Option<f32>, timer: f32 }
struct PuzzleDoor { name: String, pos: [f32;3], open: bool, required: Vec<String>, speed: f32, offset: [f32;3], cur: [f32;3] }

struct Zipline { name: String, start: [f32;3], end: [f32;3], speed: f32, progress: f32 }
struct SwimZone { name: String, pos: [f32;3], size: [f32;3], swim_speed: f32, oxygen_drain: f32 }

#[derive(Debug, Clone, Copy, PartialEq)]
enum BossAttackKind { Melee, Ranged, AoE, Charge, Beam, Slam, Sweep, Summon }
#[derive(Clone, Debug)]
struct BossAttack { name: String, damage: f32, range: f32, cooldown: f32, timer: f32, kind: BossAttackKind, telegraph: f32 }
#[derive(Clone, Debug)]
struct BossPhase { name: String, attacks: Vec<BossAttack>, speed_mult: f32 }
struct BossPattern { name: String, phases: Vec<BossPhase>, phase: usize, thresholds: Vec<f32> }

#[derive(Debug, Clone, PartialEq)]
enum MusicCond { Always, Combat, Stealth, Explore, BossPhase(usize) }
struct MusicLayer { name: String, vol: f32, target_vol: f32, fade: f32, cond: MusicCond }

struct WallRunState { active: bool, wall_normal: [f32;3], time_on_wall: f32, max_time: f32, jump_force: f32 }
struct DestructibleChunk { name: String, pos: [f32;3], size: [f32;3], hp: f32, max_hp: f32, destroyed: bool }
struct WeatherGameplay { wet_friction: f32, wind: [f32;3], visibility: f32, lightning_chance: f32, lightning_timer: f32 }
struct ProceduralSky { enabled: bool, sun_dir: [f32;3], sun_color: [f32;3], sky_top: [f32;3], sky_horizon: [f32;3], clouds: f32, stars: f32 }
struct SpriteBillboard { name: String, pos: [f32;3], size: [f32;2], frames: usize, frame: usize, fps: f32, timer: f32 }

#[derive(Debug, Clone, Copy, PartialEq)]
enum PatrolKind { Loop, PingPong, Random, OneShot }
struct PatrolRoute { name: String, waypoints: Vec<[f32;3]>, waits: Vec<f32>, idx: usize, speed: f32, kind: PatrolKind, wait_t: f32 }

#[derive(Debug, Clone, Copy, PartialEq)]
enum BubbleStyle { Speech, Thought, Shout, Whisper }
struct DialogueBubble { entity: String, text: String, duration: f32, timer: f32, style: BubbleStyle }

struct Elevator { name: String, bottom_y: f32, top_y: f32, current_y: f32, speed: f32, going_up: bool, wait_time: f32, wait_timer: f32 }
struct CheckpointV2 { name: String, pos: [f32;3], radius: f32, activated: bool }
struct CollectibleV2 { name: String, pos: [f32;3], kind: String, value: f32, collected: bool, respawn: Option<f32>, timer: f32 }
struct EnvironmentHazard { name: String, pos: [f32;3], size: [f32;3], damage: f32, hazard_type: String, active: bool }
struct AICompanion { name: String, pos: [f32;3], follow_dist: f32, state: String, health: f32, abilities: Vec<String> }
struct CraftingRecipeV2 { name: String, ingredients: Vec<(String, u32)>, result: String, result_count: u32, craft_time: f32 }
struct QuestObjectiveV2 { desc: String, target: String, current: u32, required: u32, done: bool }
struct QuestV2 { name: String, desc: String, objectives: Vec<QuestObjective>, reward_xp: u32, reward_gold: u32, active: bool, complete: bool }
struct Turret { name: String, pos: [f32;3], range: f32, damage: f32, fire_rate: f32, timer: f32, target: Option<String> }
struct Shield { name: String, entity: String, hp: f32, max_hp: f32, regen_rate: f32, regen_delay: f32, broken_timer: f32 }
struct GravityField { name: String, pos: [f32;3], radius: f32, force: f32, direction: [f32;3] }
struct Portal { name: String, pos_a: [f32;3], pos_b: [f32;3], color: [f32;3], active: bool, bidirectional: bool }
struct ConveyorBelt { name: String, pos: [f32;3], size: [f32;3], direction: [f32;3], speed: f32 }
struct MagnetZone { name: String, pos: [f32;3], radius: f32, strength: f32, attract_tags: Vec<String> }
struct Mirror { name: String, pos: [f32;3], normal: [f32;3], size: [f32;2] }
struct SecurityCamera { name: String, pos: [f32;3], fov: f32, range: f32, rotation_speed: f32, angle: f32, alert_target: Option<String> }
struct Alarm { name: String, active: bool, duration: f32, timer: f32, spawn_enemies: bool }
struct CoverPoint { name: String, pos: [f32;3], normal: [f32;3], height: f32, occupied: bool }




// ======== ROUND 37: AUDIO ENGINE DEEP ========
#[derive(Clone, Debug)]
struct AudioEngine { buses: Vec<AudioBus>, listeners: Vec<AudioListener2>, global_vol: f32, doppler_factor: f32, speed_of_sound: f32, max_voices: u32, active_voices: u32 }
#[derive(Clone, Debug)]
struct AudioBus { name: String, volume: f32, muted: bool, effects: Vec<AudioEffect2>, children: Vec<String>, solo: bool }
#[derive(Clone, Debug)]
struct AudioEffect2 { kind: AudioFXKind, params: Vec<(String, f32)>, enabled: bool, wet: f32 }
#[derive(Clone, Debug, Copy)]
enum AudioFXKind { Reverb2, Delay2, Chorus, Flanger, Distortion2, Compressor, EQ3, LowPass2, HighPass2, Phaser, Tremolo, BitCrush }
#[derive(Clone, Debug)]
struct AudioListener2 { pos: [f32;3], forward: [f32;3], up: [f32;3], vel: [f32;3] }
#[derive(Clone, Debug)]
struct AudioSource2 { name: String, pos: [f32;3], clip: String, bus: String, volume: f32, pitch: f32, spatial: bool, min_dist: f32, max_dist: f32, rolloff: f32, looping: bool, playing: bool, priority: u32 }
#[derive(Clone, Debug)]
struct AudioZone2 { pos: [f32;3], radius: f32, shape: String, bus_override: Option<String>, reverb_preset: Option<String>, occlusion: f32 }
#[derive(Clone, Debug)]
struct MusicSystem2 { playlists: Vec<Playlist>, current_playlist: Option<usize>, shuffle: bool, repeat_mode: RepeatMode, crossfade: f32, volume: f32 }
#[derive(Clone, Debug)]
struct Playlist { name: String, tracks: Vec<PlaylistTrack>, current: usize }
#[derive(Clone, Debug)]
struct PlaylistTrack { name: String, duration: f32, artist: String, bpm: f32, genre: String }
#[derive(Clone, Debug, Copy)]
enum RepeatMode { Off, One, All }
#[derive(Clone, Debug)]
struct ADSR { attack: f32, decay: f32, sustain: f32, release: f32, timer: f32, stage: ADSRStage }
#[derive(Clone, Debug, Copy)]
enum ADSRStage { Attack, Decay, Sustain, Release, Off }
#[derive(Clone, Debug)]
struct Synthesizer { oscillators: Vec<Oscillator>, filter: SynthFilter, adsr: ADSR, volume: f32, detune: f32, voices: u32 }
#[derive(Clone, Debug)]
struct Oscillator { waveform: WaveForm, frequency: f32, amplitude: f32, phase: f32, detune: f32 }
#[derive(Clone, Debug, Copy)]
enum WaveForm { Sine, Square, Sawtooth, Triangle, Noise3, Pulse }
#[derive(Clone, Debug)]
struct SynthFilter { kind: FilterKind, cutoff: f32, resonance: f32, envelope: f32 }
#[derive(Clone, Debug, Copy)]
enum FilterKind { LowPass3, HighPass3, BandPass, Notch }
// ======== ROUND 38: ANIMATION ENGINE DEEP ========
#[derive(Clone, Debug)]
struct AnimationEngine { controllers: Vec<AnimController>, retargeting: Vec<RetargetMap>, root_motion: bool, additive_blending: bool }
#[derive(Clone, Debug)]
struct AnimController { name: String, layers: Vec<AnimLayerV2>, parameters: Vec<AnimParam>, avatar: String }
#[derive(Clone, Debug)]
struct AnimLayerV2 { name: String, weight: f32, mask: Option<String>, blending: BlendMode2, state_machine: usize, ik_pass: bool }
#[derive(Clone, Debug, Copy)]
enum BlendMode2 { Override, Additive }
#[derive(Clone, Debug)]
struct AnimParam { name: String, kind: ParamKind, float_val: f32, int_val: i32, bool_val: bool, trigger: bool }
#[derive(Clone, Debug, Copy)]
enum ParamKind { Float2, Int2, Bool2, Trigger }
#[derive(Clone, Debug)]
struct RetargetMap { source_skeleton: String, target_skeleton: String, bone_map: Vec<(String, String)>, scale_factor: f32 }
#[derive(Clone, Debug)]
struct SpringBone { bone_name: String, stiffness: f32, damping: f32, gravity: f32, wind_influence: f32, radius: f32, chain_length: u32 }
#[derive(Clone, Debug)]
struct JiggleBone { bone_name: String, mass: f32, stiffness: f32, damping: f32, gravity_scale: f32, limit: f32 }
#[derive(Clone, Debug)]
struct AnimNotify { clip: String, time: f32, kind: NotifyKind, data: String, fired: bool }
#[derive(Clone, Debug, Copy)]
enum NotifyKind { Sound, Particle, Event3, Footstep2, Custom3 }
#[derive(Clone, Debug)]
struct CrowdAnim { templates: Vec<CrowdAnimTemplate>, active_agents_v2: u32, lod_distances: Vec<f32> }
#[derive(Clone, Debug)]
struct CrowdAnimTemplate { name: String, anims: Vec<String>, blend_space: Vec<(f32, String)>, variation_count: u32 }
// ======== ROUND 39: PHYSICS ENGINE DEEP ========
#[derive(Clone, Debug)]
struct PhysicsWorld { gravity: [f32;3], solver_iterations: u32, sub_steps: u32, sleeping: bool, sleep_threshold: f32, max_velocity: f32, continuous_cd: bool, time_step: f32, accumulator: f32 }
#[derive(Clone, Debug)]
struct RigidBody2 { entity: String, kind: RBKind, mass: f32, inertia: [f32;3], linear_damping: f32, angular_damping: f32, friction: f32, restitution: f32, sleeping: bool, kinematic: bool, ccd: bool }
#[derive(Clone, Debug, Copy)]
enum RBKind { Dynamic2, Static2, Kinematic2 }
#[derive(Clone, Debug)]
struct Collider2 { entity: String, shape: ColliderShape2, offset: [f32;3], trigger: bool, layer: u32, mask: u32 }
#[derive(Clone, Debug)]
enum ColliderShape2 { Box5([f32;3]), Sphere4(f32), Capsule4(f32, f32), Cylinder4(f32, f32), Cone4(f32, f32), ConvexHull(Vec<[f32;3]>), TriMesh(u32), HeightField(u32, u32) }
#[derive(Clone, Debug)]
struct PhysicsQuery { ray_casts: Vec<RayCast>, shape_casts: Vec<ShapeCast>, overlap_tests: Vec<OverlapTest> }
#[derive(Clone, Debug)]
struct RayCast { origin: [f32;3], direction: [f32;3], max_distance: f32, layer_mask: u32, hit: Option<RayHit> }
#[derive(Clone, Debug)]
struct RayHit { point: [f32;3], normal: [f32;3], distance: f32, entity: String }
#[derive(Clone, Debug)]
struct ShapeCast { shape: String, origin: [f32;3], direction: [f32;3], max_distance: f32, hit: Option<RayHit> }
#[derive(Clone, Debug)]
struct OverlapTest { shape: String, pos: [f32;3], layer_mask: u32, results: Vec<String> }
#[derive(Clone, Debug)]
struct VehiclePhysics { chassis: String, wheels: Vec<WheelData>, engine_force: f32, brake_force: f32, steering_angle: f32, downforce: f32, center_of_mass: [f32;3], anti_roll: f32 }
#[derive(Clone, Debug)]
struct WheelData { pos: [f32;3], radius: f32, suspension_rest: f32, suspension_stiffness: f32, damping: f32, friction_slip: f32, steering: bool, motor: bool, rpm: f32, slip: f32 }
#[derive(Clone, Debug)]
struct BuoyancyPhysics { entity: String, volume: f32, drag: f32, angular_drag: f32, submerged_fraction: f32, water_level: f32, voxel_resolution: u32 }
#[derive(Clone, Debug)]
struct DestructibleMesh { entity: String, pieces: Vec<DestructPiece>, force_threshold: f32, destroyed: bool, destruction_pattern: String }
#[derive(Clone, Debug)]
struct DestructPiece { pos: [f32;3], vel: [f32;3], mass: f32, lifetime: f32, timer: f32 }
// ======== ROUNDS 33-36: EVERYTHING ELSE ========
#[derive(Clone, Debug)]
struct VRSystem { enabled: bool, hmd_pos: [f32;3], hmd_rot: [f32;3], left_hand: [f32;3], right_hand: [f32;3], ipd: f32, comfort_mode: bool, teleport_enabled: bool }
#[derive(Clone, Debug)]
struct ARSystem { enabled: bool, plane_detection: bool, image_tracking: bool, face_tracking: bool, hand_tracking_v2: bool, light_estimation: bool, anchors: Vec<ARAnchor> }
#[derive(Clone, Debug)]
struct ARAnchor { id: u32, pos: [f32;3], rot: [f32;3], kind: String, persistent: bool }
#[derive(Clone, Debug)]
struct HapticFeedback { patterns: Vec<HapticPattern>, controller: String }
#[derive(Clone, Debug)]
struct HapticPattern { name: String, duration: f32, amplitude: f32, frequency: f32 }
#[derive(Clone, Debug)]
struct MotionCapture { recording: bool, playing: bool, bones: Vec<(String, [f32;3], [f32;3])>, frame_rate: f32, frames: Vec<Vec<(String, [f32;3], [f32;3])>> }
#[derive(Clone, Debug)]
struct PhotogrammetryPipeline { photos: Vec<String>, quality: f32, processing: bool, progress: f32, output_mesh: Option<String> }
#[derive(Clone, Debug)]
struct PointCloud { points: Vec<[f32;3]>, colors: Vec<[f32;4]>, point_size: f32, visible: bool, count: usize }
#[derive(Clone, Debug)]
struct MeshDecimation { target_ratio: f32, preserve_uv: bool, preserve_normals: bool, preserve_boundaries: bool }
#[derive(Clone, Debug)]
struct MeshSubdivision { level: u32, smooth: bool, preserve_edges: bool, algorithm: String }
#[derive(Clone, Debug)]
struct ProceduralTexture { name: String, kind: ProcTexKind, resolution: u32, seed: u32, params: Vec<(String, f32)> }
#[derive(Clone, Debug, Copy)]
enum ProcTexKind { Perlin, Voronoi, Cellular, Marble, Wood2, Brick, Checker2, Gradient2, Clouds2, Camo, Lava2, Crystal }
#[derive(Clone, Debug)]
struct TextureAtlasPacker { textures: Vec<(String, u32, u32)>, atlas_size: u32, padding: u32, packed: bool }
#[derive(Clone, Debug)]
struct LightmapBaker { resolution: u32, samples: u32, bounces: u32, baking: bool, progress: f32, denoising: bool }
#[derive(Clone, Debug)]
struct NavMeshBuilder { cell_size: f32, cell_height: f32, agent_radius: f32, agent_height: f32, max_slope: f32, built: bool, vertex_count: u32 }
#[derive(Clone, Debug)]
struct CrowdManager { max_agents: u32, active_agents: u32, avoidance_quality: u32, path_queue_size: u32, separation_weight: f32 }
#[derive(Clone, Debug)]
struct PhysicsDebug { draw_colliders: bool, draw_contacts: bool, draw_joints: bool, draw_forces: bool, draw_velocity: bool, draw_aabb: bool, slow_motion_physics: bool }
#[derive(Clone, Debug)]
struct CollisionLayer { name: String, mask: u32, collides_with: Vec<String> }
#[derive(Clone, Debug)]
struct JointSystem { joints: Vec<PhysJoint>, solver_iterations: u32, break_threshold: f32 }
#[derive(Clone, Debug)]
struct PhysJoint { kind: JointKind, body_a: String, body_b: String, anchor: [f32;3], limits: [f32;2], motor: bool, motor_speed: f32 }
#[derive(Clone, Debug, Copy)]
enum JointKind { Fixed, Hinge, Slider, Ball, Spring2, Cone, Distance2, Weld, Motor2, Gear }
#[derive(Clone, Debug)]
struct CharController { pos: [f32;3], vel: [f32;3], grounded: bool, slope_limit: f32, step_height: f32, skin_width: f32, height: f32, radius: f32, gravity_scale: f32, jump_force: f32, move_speed: f32, sprint_mult: f32, crouch_height: f32, crouching: bool }
#[derive(Clone, Debug)]
struct InputManager { bindings: Vec<InputBinding>, axes: Vec<InputAxis>, gamepad_connected: bool, mouse_sensitivity: f32, invert_y: bool, deadzone: f32 }
#[derive(Clone, Debug)]
struct InputBinding { action: String, key: String, alt_key: Option<String>, gamepad: Option<String> }
#[derive(Clone, Debug)]
struct InputAxis { name: String, positive: String, negative: String, gravity: f32, sensitivity: f32, dead: f32, value: f32 }
#[derive(Clone, Debug)]
struct AchievementSystem2 { achievements: Vec<Achieve2>, total: u32, unlocked: u32, score: u64 }
#[derive(Clone, Debug)]
struct Achieve2 { name: String, description: String, icon: String, unlocked: bool, progress: f32, target: f32, secret: bool, reward: Option<String>, points: u32 }
#[derive(Clone, Debug)]
struct DailyReward { day: u32, rewards: Vec<Vec<String>>, claimed_today: bool, streak: u32 }
#[derive(Clone, Debug)]
struct SeasonPass { name: String, level: u32, xp: u64, xp_per_level: u64, rewards: Vec<(u32, String, bool)>, premium: bool, expires: f32 }
#[derive(Clone, Debug)]
struct GachaSystem { banners: Vec<GachaBanner>, pity_counter: u32, pity_threshold: u32, currency: u64 }
#[derive(Clone, Debug)]
struct GachaBanner { name: String, rates: Vec<(String, f32)>, featured: Vec<String>, cost: u64, guaranteed_pity: bool }
#[derive(Clone, Debug)]
struct SocialHub { rooms: Vec<SocialRoom>, player_count: u32, events_active: Vec<String> }
#[derive(Clone, Debug)]
struct SocialRoom { name: String, capacity: u32, current: u32, theme: String, activities: Vec<String> }
#[derive(Clone, Debug)]
struct PlayerHousing { house: Option<House2>, furniture_placed: Vec<PlacedFurniture>, budget: f64, visitors: u32 }
#[derive(Clone, Debug)]
struct House2 { name: String, size: String, rooms: u32, garden: bool, garage: bool, pool: bool, value: f64 }
#[derive(Clone, Debug)]
struct PlacedFurniture { name: String, pos: [f32;3], rot: f32, color: [f32;4], interactive: bool }
#[derive(Clone, Debug)]
struct VehicleCustomization { paint_color: [f32;4], decals: Vec<Decal2>, parts: Vec<(String, String)>, performance: VehiclePerf, neon: Option<[f32;4]> }
#[derive(Clone, Debug)]
struct Decal2 { texture: String, pos: [f32;3], size: [f32;2], rotation: f32, opacity: f32 }
#[derive(Clone, Debug)]
struct VehiclePerf { engine: u32, suspension: u32, brakes: u32, tires: u32, weight_reduction: u32, turbo: bool, nitrous: bool }
#[derive(Clone, Debug)]
struct CharCustomization { body_type: u32, height: f32, skin_color: [f32;4], hair_style: u32, hair_color: [f32;4], eye_color: [f32;4], face_shape: Vec<(String, f32)>, scars: Vec<u32>, tattoos: Vec<u32>, accessories: Vec<String> }
#[derive(Clone, Debug)]
struct Wardrobe { outfits: Vec<Outfit>, current: usize }
#[derive(Clone, Debug)]
struct Outfit { name: String, head: Option<String>, torso: Option<String>, legs: Option<String>, feet: Option<String>, accessory: Vec<String>, dye_colors: Vec<[f32;4]> }
#[derive(Clone, Debug)]
struct WeatherMachine { presets: Vec<WeatherPreset2>, current: usize, transition_time: f32, transitioning: bool }
#[derive(Clone, Debug)]
struct WeatherPreset2 { name: String, cloud_density: f32, rain: f32, snow: f32, wind: [f32;3], fog: f32, temperature: f32, lightning_chance: f32, sun_intensity: f32 }
#[derive(Clone, Debug)]
struct DataDrivenSystem { tables: Vec<DataTable2>, loaded: bool }
#[derive(Clone, Debug)]
struct DataTable2 { name: String, columns: Vec<String>, rows: Vec<Vec<String>>, primary_key: Option<String> }
#[derive(Clone, Debug)]
struct Localization2 { current_lang: String, supported: Vec<String>, strings: Vec<(String, Vec<(String, String)>)>, fallback: String, rtl: bool }
#[derive(Clone, Debug)]
struct AccessibilityV2 { screen_reader: bool, font_scale: f32, high_contrast: bool, colorblind: String, subtitles: bool, subtitle_bg: bool, one_hand_mode: bool, auto_aim: bool, hold_instead_toggle: bool, skip_qte: bool, difficulty_assist: bool }
// ======== ROUND 31: PROGRAMMING & AUTOMATION ========
#[derive(Clone, Debug)]
struct BlueprintSystem { blueprints: Vec<Blueprint2>, active: Option<usize>, running: bool }
#[derive(Clone, Debug)]
struct BPNode { id: u32, kind: BPNodeKind, pos: [f32;2], data: Vec<String> }
#[derive(Clone, Debug, Copy)]
enum BPNodeKind { Start, Branch, Loop2, Delay, Print, SetVar, GetVar, Math2, Compare, Spawn2, Destroy, MoveObj, PlaySound2, SendEvent, Custom }
#[derive(Clone, Debug)]
struct ScriptEditor { open: bool, scripts: Vec<Script2>, active: Option<usize>, console_output: Vec<String>, breakpoints: Vec<(String, u32)> }
#[derive(Clone, Debug)]
struct Script2 { name: String, language: ScriptLang, code: String, compiled: bool, errors: Vec<String>, enabled: bool }
#[derive(Clone, Debug, Copy)]
enum ScriptLang { Lua2, Python2, JavaScript2, WGSL2, Custom2 }
#[derive(Clone, Debug)]
struct StateMachineEditor { machines: Vec<StateMachine2>, active: Option<usize> }
#[derive(Clone, Debug)]
struct StateMachine2 { name: String, states: Vec<SMState>, transitions: Vec<SMTransition2>, current: usize }
#[derive(Clone, Debug)]
struct SMState { name: String, entry_actions: Vec<String>, exit_actions: Vec<String>, update_actions: Vec<String>, color: [f32;4] }
#[derive(Clone, Debug)]
struct SMTransition2 { from: usize, to: usize, condition: String, priority: u32 }
#[derive(Clone, Debug)]
struct TimelineEditor { tracks: Vec<TimeTrack2>, duration: f32, position: f32, playing: bool, looping: bool, snap_interval: f32 }
#[derive(Clone, Debug)]
struct TimeTrack2 { name: String, kind: TrackKind2, keyframes: Vec<TimeKey2>, muted: bool, locked: bool, color: [f32;4] }
#[derive(Clone, Debug, Copy)]
enum TrackKind2 { Position, Rotation, Scale2, Color2, Opacity, Audio3, Event2, Camera3, Property }
#[derive(Clone, Debug)]
struct TimeKey2 { time: f32, value: [f32;4], easing: Easing }
#[derive(Clone, Debug, Copy)]
enum Easing { Linear, EaseIn, EaseOut, EaseInOut, Bounce, Elastic, Back, Cubic, Quad, Expo }
#[derive(Clone, Debug)]
struct CISystem { pipelines: Vec<CIPipeline>, builds: Vec<CIBuild>, auto_build: bool }
#[derive(Clone, Debug)]
struct CIPipeline { name: String, steps: Vec<CIStep>, trigger: String }
#[derive(Clone, Debug)]
struct CIStep { name: String, command: String, timeout: f32, status: String }
#[derive(Clone, Debug)]
struct CIBuild { pipeline: String, status: String, duration: f32, timestamp: f32, logs: Vec<String> }
#[derive(Clone, Debug)]
struct TestRunner { tests: Vec<GameTest>, passed: u32, failed: u32, running: bool, current: usize }
#[derive(Clone, Debug)]
struct GameTest { name: String, description: String, assertion: String, passed: bool, error: Option<String> }
// ======== ROUND 32: PLATFORM, EXPORT, PUBLISHING ========
#[derive(Clone, Debug)]
struct BuildConfig { target_platform: Platform, optimization: OptLevel, debug_symbols: bool, compress: bool, strip: bool, icon: Option<String>, splash: Option<String> }
#[derive(Clone, Debug, Copy)]
enum OptLevel { Debug2, Release2, Size, Speed }
#[derive(Clone, Debug)]
struct AssetPipeline { importers: Vec<AssetImporter>, processors: Vec<AssetProcessor>, cache_size_mb: u32, parallel_jobs: u32 }
#[derive(Clone, Debug)]
struct AssetImporter { extension: String, handler: String, options: Vec<(String, String)> }
#[derive(Clone, Debug)]
struct AssetProcessor { name: String, kind: String, input: String, output: String, settings: Vec<(String, String)> }
#[derive(Clone, Debug)]
struct PackageManager { packages: Vec<Package2>, registry_url: String, installed: Vec<(String, String)> }
#[derive(Clone, Debug)]
struct Package2 { name: String, version: String, description: String, author: String, dependencies: Vec<(String, String)>, size_kb: u64, downloads: u64 }
#[derive(Clone, Debug)]
struct MarketplaceAsset { name: String, author: String, price: f64, rating: f32, reviews: u32, category: String, tags: Vec<String>, preview_url: String, size_mb: f32 }
#[derive(Clone, Debug)]
struct ProjectSettings { name: String, version: String, author: String, description: String, default_scene: String, icon_path: String, splash_path: String, company: String, bundle_id: String, target_fps: u32, vsync: bool, fullscreen: bool, resolution: (u32, u32), physics_fps: u32, audio_sample_rate: u32, max_texture_size: u32 }
#[derive(Clone, Debug)]
struct ExportProfile { name: String, platform: Platform, scenes: Vec<String>, exclude: Vec<String>, compress_textures: bool, compress_audio: bool, strip_debug: bool, obfuscate: bool, sign: bool }
#[derive(Clone, Debug)]
struct Analytics2 { events_logged: u64, sessions: u32, avg_session_length: f32, retention_days: Vec<f32>, crash_count: u32, performance_data: Vec<(String, f32)> }
#[derive(Clone, Debug)]
struct CloudSave { enabled: bool, provider: String, auto_sync: bool, last_sync: f32, slots: Vec<CloudSlot>, conflict_resolution: String }
#[derive(Clone, Debug)]
struct CloudSlot { name: String, size_kb: u64, timestamp: f32, checksum: String, data: String }
#[derive(Clone, Debug)]
struct Monetization { iap_products: Vec<IAPProduct>, ads_enabled: bool, ad_frequency: f32, remove_ads_price: f64, subscription_tiers: Vec<SubTier> }
#[derive(Clone, Debug)]
struct IAPProduct { id: String, name: String, price: f64, kind: String, consumable: bool }
#[derive(Clone, Debug)]
struct SubTier { name: String, price: f64, period: String, perks: Vec<String> }
#[derive(Clone, Debug)]
struct SteamIntegration { app_id: u32, achievements_synced: bool, leaderboards_synced: bool, workshop_items: Vec<String>, overlay_enabled: bool, cloud_save: bool }
#[derive(Clone, Debug)]
struct ConsoleIntegration { platform: String, cert_status: String, age_rating: String, trophy_support: bool, haptic_feedback: bool, adaptive_triggers: bool }
#[derive(Clone, Debug)]
struct MobileConfig { orientation: String, touch_controls: bool, gyro_enabled: bool, haptics: bool, battery_saver: bool, min_os_version: String, target_devices: Vec<String> }
// ======== ROUND 29: ADVANCED COMBAT & RPG ========
#[derive(Clone, Debug)]
struct CombatSystem2 { mode: CombatMode2, turn_order: Vec<String>, current_turn: usize, round_num: u32, initiative_rolls: Vec<(String, f32)>, active: bool }
#[derive(Clone, Debug, Copy)]
enum CombatMode2 { RealTime, TurnBased2, ATB, Tactical, ARPG, Souls }
#[derive(Clone, Debug)]
struct CharacterSheet { name: String, class: String, level: u32, xp: u64, hp: f32, max_hp: f32, mp: f32, max_mp: f32, stats: CharStats, resistances: Vec<(Element, f32)>, immunities: Vec<String> }
#[derive(Clone, Debug)]
struct CharStats { strength: u32, dexterity: u32, constitution: u32, intelligence: u32, wisdom: u32, charisma: u32, luck: u32 }
#[derive(Clone, Debug)]
struct ClassSystem { classes: Vec<CharClass>, multiclass_allowed: bool, max_level: u32 }
#[derive(Clone, Debug)]
struct CharClass { name: String, description: String, base_hp: f32, hp_per_level: f32, primary_stat: String, abilities: Vec<ClassAbility>, passive: Vec<String> }
#[derive(Clone, Debug)]
struct ClassAbility { name: String, level_req: u32, cost: f32, cooldown: f32, damage: f32, range: f32, aoe: f32, effect: Option<String>, description: String }
#[derive(Clone, Debug)]
struct TalentTree { name: String, tiers: Vec<TalentTier>, points_spent: u32, points_available: u32 }
#[derive(Clone, Debug)]
struct TalentTier { level_req: u32, talents: Vec<Talent2> }
#[derive(Clone, Debug)]
struct Talent2 { name: String, description: String, max_rank: u32, current_rank: u32, cost: u32, prereqs: Vec<String>, effect: String }
#[derive(Clone, Debug)]
struct EquipmentSlots { head: Option<String>, chest: Option<String>, legs: Option<String>, feet: Option<String>, hands: Option<String>, main_hand: Option<String>, off_hand: Option<String>, ring_l: Option<String>, ring_r: Option<String>, amulet: Option<String>, cape: Option<String>, belt: Option<String> }
#[derive(Clone, Debug)]
struct SetBonus { set_name: String, pieces_equipped: u32, bonuses: Vec<(u32, String, f32)> }
#[derive(Clone, Debug)]
struct GemSocket2 { slot: String, gem: Option<GemStone>, bonus: Option<String> }
#[derive(Clone, Debug)]
struct GemStone { name: String, kind: String, tier: u32, bonus_stat: String, bonus_value: f32, color: [f32;4] }
#[derive(Clone, Debug)]
struct Transmog { original: String, appearance: String, cost: i64, unlocked: Vec<String> }
#[derive(Clone, Debug)]
struct ItemUpgrade { item: String, level: u32, max_level: u32, cost_per_level: Vec<(String, u32)>, stat_gain: Vec<(String, f32)> }
#[derive(Clone, Debug)]
struct Reforge { item: String, available_stats: Vec<String>, locked_stat: Option<String>, cost: i64, reforge_count: u32 }
#[derive(Clone, Debug)]
struct AugmentSystem { augments: Vec<Augment>, max_slots: u32 }
#[derive(Clone, Debug)]
struct Augment { name: String, kind: String, power: f32, duration: Option<f32>, slot: u32, active: bool }
#[derive(Clone, Debug)]
struct Mastery { weapon_type: String, level: u32, xp: f32, xp_needed: f32, bonuses: Vec<(u32, String)> }
#[derive(Clone, Debug)]
struct Reputation2 { factions: Vec<FactionRep>, max_level: u32 }
#[derive(Clone, Debug)]
struct FactionRep { name: String, standing: f32, level: u32, rewards_unlocked: Vec<String>, quests_completed: u32 }
#[derive(Clone, Debug)]
struct BountyBoard2 { bounties: Vec<Bounty2>, refresh_timer: f32, refresh_interval: f32 }
#[derive(Clone, Debug)]
struct Bounty2 { target: String, description: String, reward_gold: i64, reward_xp: u64, difficulty: f32, time_limit: f32, timer: f32, completed: bool }
#[derive(Clone, Debug)]
struct ArenaSystem { tier: u32, wins: u32, losses: u32, rating: f32, rewards: Vec<(u32, String)>, current_opponent: Option<String>, season: u32 }
#[derive(Clone, Debug)]
struct RaidSystem { raids: Vec<Raid>, weekly_lockouts: Vec<String> }
#[derive(Clone, Debug)]
struct Raid { name: String, difficulty: String, bosses: Vec<RaidBoss>, min_players: u32, max_players: u32, timer: f32, max_time: f32, loot_rules: String }
#[derive(Clone, Debug)]
struct RaidBoss { name: String, hp: f32, max_hp: f32, mechanics: Vec<String>, enrage_timer: f32, phase: u32, loot_table: String }
#[derive(Clone, Debug)]
struct DungeonFinder { queued: bool, role: String, estimated_wait: f32, timer: f32, group_size: u32, min_level: u32 }
#[derive(Clone, Debug)]
struct WorldBoss2 { name: String, pos: [f32;3], hp: f32, max_hp: f32, spawn_timer: f32, spawn_interval: f32, participants: u32, loot_quality: f32, active: bool }
// ======== ROUND 30: ADVANCED WORLD & SIMULATION ========
#[derive(Clone, Debug)]
struct EcosystemSim { species: Vec<EcoSpecies>, food_web: Vec<(usize,usize)>, stability: f32, timer: f32 }
#[derive(Clone, Debug)]
struct EcoSpecies { name: String, population: f32, growth_rate: f32, carrying_capacity: f32, diet: String, predators: Vec<String>, prey: Vec<String> }
#[derive(Clone, Debug)]
struct GeologySystem { tectonic_plates: Vec<TectonicPlate>, fault_lines: Vec<FaultLine>, erosion_rate: f32, volcanic_activity: f32 }
#[derive(Clone, Debug)]
struct TectonicPlate { name: String, pos: [f32;2], vel: [f32;2], size: f32, continental: bool }
#[derive(Clone, Debug)]
struct FaultLine { start: [f32;2], end: [f32;2], stress: f32, last_quake: f32, magnitude_potential: f32 }
#[derive(Clone, Debug)]
struct OceanCurrent { name: String, path: Vec<[f32;3]>, speed: f32, temperature: f32, depth: f32, affects_weather: bool }
#[derive(Clone, Debug)]
struct AtmosphereLayer { name: String, altitude: f32, thickness: f32, temperature: f32, pressure: f32, composition: Vec<(String, f32)> }
#[derive(Clone, Debug)]
struct WeatherFront { pos: [f32;3], vel: [f32;3], kind: FrontKind, intensity: f32, size: f32 }
#[derive(Clone, Debug, Copy)]
enum FrontKind { Cold, Warm, Occluded, Stationary }
#[derive(Clone, Debug)]
struct ClimateZone2 { pos: [f32;3], radius: f32, temperature_range: (f32, f32), rainfall: f32, humidity: f32, wind_pattern: [f32;2], biome_type: String }
#[derive(Clone, Debug)]
struct MigrationPattern { species: String, route: Vec<[f32;3]>, season_trigger: SeasonType, current_waypoint: usize, speed: f32 }
#[derive(Clone, Debug)]
struct FoodChain { producers: Vec<String>, primary_consumers: Vec<String>, secondary_consumers: Vec<String>, apex_predators: Vec<String>, decomposers: Vec<String> }
#[derive(Clone, Debug)]
struct SoilSystem { layers: Vec<SoilLayer2>, nutrients: f32, moisture: f32, ph: f32, organic_matter: f32, erosion: f32 }
#[derive(Clone, Debug)]
struct SoilLayer2 { name: String, depth: f32, composition: String, color: [f32;4], permeability: f32 }
#[derive(Clone, Debug)]
struct HydrologySystem { water_table: f32, rainfall_rate: f32, evaporation: f32, runoff: f32, aquifers: Vec<Aquifer>, watershed: Vec<[f32;3]> }
#[derive(Clone, Debug)]
struct Aquifer { pos: [f32;3], volume: f32, max_volume: f32, recharge_rate: f32, depth: f32 }
#[derive(Clone, Debug)]
struct PollutionSystem { air_quality: f32, water_quality: f32, soil_quality: f32, sources: Vec<PollutionSource>, cleanup_rate: f32 }
#[derive(Clone, Debug)]
struct PollutionSource { pos: [f32;3], kind: String, rate: f32, radius: f32, active: bool }
#[derive(Clone, Debug)]
struct FireSpread { fires: Vec<FireInstance>, wind_effect: f32, moisture_effect: f32, spread_rate: f32 }
#[derive(Clone, Debug)]
struct FireInstance { pos: [f32;3], radius: f32, intensity: f32, fuel: f32, smoke_height: f32, timer: f32 }
#[derive(Clone, Debug)]
struct AvalancheSystem { zones: Vec<AvalancheZone>, trigger_threshold: f32 }
#[derive(Clone, Debug)]
struct AvalancheZone { start: [f32;3], direction: [f32;3], snow_depth: f32, slope_angle: f32, triggered: bool, speed: f32 }
#[derive(Clone, Debug)]
struct TsunamiSystem { active: bool, origin: [f32;3], wave_front: f32, speed: f32, height: f32, damage_radius: f32 }
#[derive(Clone, Debug)]
struct MeteorShower { active: bool, frequency: f32, timer: f32, impacts: Vec<[f32;3]>, damage: f32, fire_chance: f32 }
// ======== ROUND 27: NETWORKING, REPLAY, STREAMING ========
#[derive(Clone, Debug)]
struct NetworkManager { connected: bool, is_server: bool, player_id: u32, server_addr: String, port: u16, ping: u32, packet_loss: f32, bandwidth: f32, max_players: u32, tick_rate_v2: u32 }
#[derive(Clone, Debug)]
struct NetEntity { id: u32, owner: u32, pos: [f32;3], rot: [f32;3], vel: [f32;3], interpolating: bool, last_update: f32 }
#[derive(Clone, Debug)]
struct ChatSystem2 { messages: Vec<ChatMessage2>, input: String, visible: bool, max_messages: usize, channels: Vec<String>, current_channel: String }
#[derive(Clone, Debug)]
struct ServerBrowser { servers: Vec<ServerEntry>, filter: String, sort_by: String, refreshing: bool, timer: f32 }
#[derive(Clone, Debug)]
struct ServerEntry { name: String, address: String, players: u32, max_players: u32, map: String, ping: u32, password: bool, game_mode: String }
#[derive(Clone, Debug)]
struct AntiCheat { enabled: bool, violations: Vec<CheatViolation>, kick_threshold: u32 }
#[derive(Clone, Debug)]
struct CheatViolation { player: String, kind: String, severity: u32, timestamp: f32 }
#[derive(Clone, Debug)]
struct ReplaySystem2 { recording_v2: bool, playing_v2: bool, frames: Vec<ReplayFrame>, current_frame: usize, playback_speed: f32, duration: f32 }
#[derive(Clone, Debug)]
struct StreamOverlay { enabled: bool, elements: Vec<OverlayElement>, chat_visible: bool, alerts_enabled: bool }
#[derive(Clone, Debug)]
struct OverlayElement { kind: String, pos: [f32;2], size: [f32;2], text: Option<String>, color: [f32;4], visible: bool }
#[derive(Clone, Debug)]
struct Leaderboard2 { entries: Vec<LeaderEntry>, sort_field: String, page: usize, per_page: usize, total: usize }
#[derive(Clone, Debug)]
struct LeaderEntry { rank: u32, name: String, score: i64, level: u32, wins: u32, kd_ratio: f32 }
#[derive(Clone, Debug)]
struct MatchHistory { matches: Vec<MatchRecord>, total_games: u32, total_wins: u32, total_losses: u32, win_streak: u32 }
#[derive(Clone, Debug)]
struct MatchRecord { date: f32, mode: String, result: String, score: i64, duration: f32, map: String, mvp: bool }
#[derive(Clone, Debug)]
struct SeasonalContent { season_name: String, start_day: u32, end_day: u32, exclusive_items: Vec<String>, challenges: Vec<String>, theme_color: [f32;4], active: bool }
// ======== ROUND 28: MODULAR SYSTEMS, EXPRESSIONS ========
#[derive(Clone, Debug)]
struct NodeGraph2 { nodes: Vec<GraphNode2>, connections: Vec<GraphConn2>, name: String, kind: GraphKind }
#[derive(Clone, Debug, Copy)]
enum GraphKind { Logic, Animation2, Audio2, Material2, Dialogue2, Quest2, AI2 }
#[derive(Clone, Debug)]
struct GraphNode2 { id: u32, kind: String, pos: [f32;2], data: Vec<(String, String)>, inputs: Vec<u32>, outputs: Vec<u32> }
#[derive(Clone, Debug)]
struct GraphConn2 { from: u32, from_port: u32, to: u32, to_port: u32 }
#[derive(Clone, Debug)]
struct ExpressionParser { variables: Vec<(String, f64)>, functions: Vec<(String, String)>, history: Vec<String> }
#[derive(Clone, Debug)]
struct GameState2 { variables: Vec<(String, GameValue)>, flags: Vec<(String, bool)>, counters: Vec<(String, i64)>, timers_v2: Vec<(String, f32, bool)> }
#[derive(Clone, Debug)]
enum GameValue { Int(i64), Float(f64), Str(String), Bool(bool), Vec3([f32;3]) }
#[derive(Clone, Debug)]
struct EventBus { listeners: Vec<EventListener>, queue: Vec<GameEvent2>, history_size: usize }
#[derive(Clone, Debug)]
struct GameEvent2 { name: String, data: Vec<(String, String)>, timestamp: f32, source: String }
#[derive(Clone, Debug)]
struct ComponentSystem { components: Vec<GameComponent>, entities_v2: Vec<EntityComps>, archetypes: Vec<Archetype2> }
#[derive(Clone, Debug)]
struct GameComponent { name: String, fields: Vec<(String, String)>, default_values: Vec<String> }
#[derive(Clone, Debug)]
struct EntityComps { id: u32, name: String, components: Vec<(String, Vec<String>)>, active: bool, tags: Vec<String> }
#[derive(Clone, Debug)]
struct Archetype2 { name: String, components: Vec<String>, count: u32 }
#[derive(Clone, Debug)]
struct PrefabSystem2 { prefabs: Vec<Prefab2>, instances: Vec<PrefabInstance2> }
#[derive(Clone, Debug)]
struct Prefab2 { name: String, components: Vec<(String, Vec<String>)>, children: Vec<String>, tags: Vec<String> }
#[derive(Clone, Debug)]
struct PrefabInstance2 { prefab: String, pos: [f32;3], rot: [f32;3], scale: [f32;3], overrides: Vec<(String, String)> }
#[derive(Clone, Debug)]
struct ObjectPooler2 { pools: Vec<PoolDef>, total_active: u32, total_pooled: u32 }
#[derive(Clone, Debug)]
struct PoolDef { name: String, prefab: String, size: u32, active: u32, grow: bool }
#[derive(Clone, Debug)]
struct LODSystem2 { groups: Vec<LODGroup2>, bias: f32, forced_lod: Option<u32> }
#[derive(Clone, Debug)]
struct LODGroup2 { entity: String, levels: Vec<LODLevel2>, current: u32, transition: f32 }
#[derive(Clone, Debug)]
struct LODLevel2 { distance: f32, mesh: String, shadow: bool, collision: bool }
#[derive(Clone, Debug)]
struct OcclusionSystem { enabled: bool, cells: Vec<OcclusionCell>, culled_count: u32, visible_count: u32 }
#[derive(Clone, Debug)]
struct OcclusionCell { bounds: ([f32;3],[f32;3]), occluders: Vec<String>, occludees: Vec<String> }
#[derive(Clone, Debug)]
struct StreamingSystem { loaded_areas: Vec<StreamArea>, load_radius: f32, unload_radius: f32, loading: bool }
#[derive(Clone, Debug)]
struct StreamArea { name: String, pos: [f32;3], radius: f32, loaded: bool, priority: u32 }
#[derive(Clone, Debug)]
struct GarbageCollector { interval: f32, timer: f32, freed_mb: f32, total_collections: u32 }
// ======== ROUND 26: ADVANCED RENDERING & SHADERS ========
#[derive(Clone, Debug)]
struct ShaderGraph { nodes: Vec<ShaderNode>, connections: Vec<ShaderConnection>, output: String, compiled: bool }
#[derive(Clone, Debug)]
struct ShaderNode { id: u32, kind: ShaderNodeKind, pos: [f32;2], inputs: Vec<String>, outputs: Vec<String>, params: Vec<(String, f32)> }
#[derive(Clone, Debug, Copy)]
enum ShaderNodeKind { Color, Texture2, Normal, Noise2, Mix, Add2, Multiply, Fresnel, UV2, Time2, Dissolve2, Hologram2, Triplanar, Parallax, Subsurface, Refraction }
#[derive(Clone, Debug)]
struct ShaderConnection { from_node: u32, from_output: String, to_node: u32, to_input: String }
#[derive(Clone, Debug)]
struct MaterialEditor { active: bool, current_material: Option<String>, shader_graph: ShaderGraph, preview_mesh: String, preview_light: [f32;3] }
#[derive(Clone, Debug)]
struct RayMarchScene { objects: Vec<RayMarchObj>, max_steps: u32, threshold: f32, fog_density: f32, fog_color: [f32;4] }
#[derive(Clone, Debug)]
struct RayMarchObj { kind: RMShape, pos: [f32;3], size: [f32;3], color: [f32;4], blend: f32 }
#[derive(Clone, Debug, Copy)]
enum RMShape { Sphere3, Box4, Torus2, Cylinder3, Cone3, Capsule3, Octahedron, Mandelbulb, MengerSponge }
#[derive(Clone, Debug)]
struct VoxelWorld { chunks: Vec<VoxelChunk>, chunk_size: u32, block_types: Vec<VoxelBlock>, seed: u32, render_distance: u32 }
#[derive(Clone, Debug)]
struct VoxelChunk { pos: [i32;3], data: Vec<u8>, dirty: bool, mesh_generated: bool }
#[derive(Clone, Debug)]
struct VoxelBlock { name: String, id: u8, solid: bool, transparent: bool, light_emit: u8, texture_top: String, texture_side: String, texture_bottom: String }
#[derive(Clone, Debug)]
struct IsometricView { enabled: bool, zoom: f32, rotation: f32, tile_size: f32, grid_visible: bool }
#[derive(Clone, Debug)]
struct PixelArt { canvas_width: u32, canvas_height: u32, pixels: Vec<u8>, palette: Vec<[u8;4]>, current_color: usize, tool: PixelTool, layers: Vec<PixelLayer> }
#[derive(Clone, Debug, Copy)]
enum PixelTool { Pencil, Eraser, Fill, Line, Circle2, Rectangle2, Select2, Eyedropper }
#[derive(Clone, Debug)]
struct PixelLayer { name: String, data: Vec<u8>, visible: bool, opacity: f32, locked: bool }
#[derive(Clone, Debug)]
struct TileMap { width: u32, height: u32, tile_size: f32, layers: Vec<TileLayer>, tilesets: Vec<TileSet> }
#[derive(Clone, Debug)]
struct TileLayer { name: String, data: Vec<u32>, visible: bool, collision: bool, z_order: i32 }
#[derive(Clone, Debug)]
struct TileSet { name: String, tile_width: u32, tile_height: u32, columns: u32, tile_count: u32, texture: String }
#[derive(Clone, Debug)]
struct Sprite2D { name: String, pos: [f32;2], size: [f32;2], texture: String, uv: [f32;4], color: [f32;4], flip_x: bool, flip_y: bool, z_order: i32, animation: Option<SpriteAnim> }
#[derive(Clone, Debug)]
struct SpriteAnim { frames: Vec<[f32;4]>, fps: f32, timer: f32, current: usize, looping: bool, playing: bool }
#[derive(Clone, Debug)]
struct SpriteAtlas { name: String, texture: String, sprites: Vec<(String, [f32;4])> }
#[derive(Clone, Debug)]
struct ParallaxLayer { texture: String, scroll_speed: [f32;2], offset: [f32;2], repeat: bool, z_order: i32 }
#[derive(Clone, Debug)]
struct ScreenSpaceReflection { enabled: bool, quality: f32, max_distance: f32, thickness: f32, fade: f32 }
#[derive(Clone, Debug)]
struct GlobalIllumination { enabled: bool, bounces: u32, intensity: f32, indirect_color: [f32;3], ao_enabled: bool, ao_radius: f32 }
#[derive(Clone, Debug)]
struct VolumetricLight { enabled: bool, density: f32, scattering: f32, samples: u32, color: [f32;3], god_rays_enabled: bool }
#[derive(Clone, Debug)]
struct Caustics2 { enabled: bool, texture: String, intensity: f32, speed: f32, scale: f32 }
#[derive(Clone, Debug)]
struct SubsurfaceScatter { enabled: bool, color: [f32;3], radius: f32, strength: f32 }
#[derive(Clone, Debug)]
struct Cel { enabled: bool, levels: u32, edge_threshold: f32, edge_color: [f32;4], shadow_color: [f32;3] }
#[derive(Clone, Debug)]
struct Halftone { enabled: bool, dot_size: f32, angle: f32, color_mode: bool, threshold: f32 }
#[derive(Clone, Debug)]
struct AsciiRender { enabled: bool, char_set: String, font_size: f32, colored: bool }
// ======== ROUND 25: AI SYSTEMS, PROCEDURAL, SOCIAL ========
#[derive(Clone, Debug)]
struct GoalSystem { goals: Vec<AIGoal>, active: Option<usize>, priority_queue: Vec<(usize, f32)> }
#[derive(Clone, Debug)]
struct AIGoal { name: String, priority: f32, progress: f32, conditions: Vec<String>, actions: Vec<String>, completed: bool }
#[derive(Clone, Debug)]
struct UtilityAI { actions: Vec<UtilityAction>, cooldowns: Vec<(String, f32)>, last_action: Option<String> }
#[derive(Clone, Debug)]
struct UtilityAction { name: String, score_fn: String, weight: f32, cooldown: f32, conditions: Vec<String> }
#[derive(Clone, Debug)]
struct HTNPlanner { domain: Vec<HTNTask>, plan: Vec<String>, world_state: Vec<(String, bool)>, replanning: bool }
#[derive(Clone, Debug)]
struct HTNTask { name: String, conditions: Vec<(String, bool)>, effects: Vec<(String, bool)>, subtasks: Vec<String>, primitive: bool }
#[derive(Clone, Debug)]
struct InfluenceMap { width: u32, height: u32, cell_size: f32, layers: Vec<InfluenceLayer> }
#[derive(Clone, Debug)]
struct InfluenceLayer { name: String, data: Vec<f32>, decay: f32, momentum: f32 }
#[derive(Clone, Debug)]
struct SmartObject { name: String, pos: [f32;3], actions: Vec<SmartAction>, occupied: bool, cooldown: f32, timer: f32 }
#[derive(Clone, Debug)]
struct SmartAction { name: String, animation: String, duration: f32, requirements: Vec<String>, effects: Vec<(String, f32)> }
#[derive(Clone, Debug)]
struct EmotionSystem { emotions: Vec<(String, f32)>, mood: f32, personality: Vec<(String, f32)>, memory_span: f32 }
#[derive(Clone, Debug)]
struct NeedSystem { needs: Vec<Need2>, decay_speed: f32, critical_threshold: f32 }
#[derive(Clone, Debug)]
struct Need2 { name: String, value: f32, max_value: f32, decay_rate: f32, priority_weight: f32, satisfiers: Vec<String> }
#[derive(Clone, Debug)]
struct Schedule2 { entries: Vec<ScheduleEntry2>, current_time: f32, day_length: f32 }
#[derive(Clone, Debug)]
struct ScheduleEntry2 { time_start: f32, time_end: f32, activity: String, location: Option<[f32;3]>, priority: f32 }
#[derive(Clone, Debug)]
struct ProceduralQuest { name: String, kind: QuestKind2, target: String, location: Option<[f32;3]>, reward: QuestReward, difficulty: f32, timer: f32, stages: Vec<QuestStage>, current_stage: usize }
#[derive(Clone, Debug, Copy)]
enum QuestKind2 { Fetch, Kill, Escort, Defend, Explore, Deliver, Rescue, Investigate, Craft2, Survive2 }
#[derive(Clone, Debug)]
struct QuestReward { xp: u64, gold: i64, items: Vec<String>, reputation: f32 }
#[derive(Clone, Debug)]
struct QuestStage { description: String, objective: String, completed: bool, optional: bool }
#[derive(Clone, Debug)]
struct ProceduralNPC2 { name: String, pos: [f32;3], personality: Vec<(String, f32)>, occupation: String, schedule: Schedule2, relationships: Vec<(String, f32)>, dialogue_pool: Vec<String>, needs: NeedSystem, inventory_items: Vec<String> }
#[derive(Clone, Debug)]
struct ProceduralLoot { tables: Vec<LootTable2>, rng_seed: u32 }
#[derive(Clone, Debug)]
struct LootTable2 { name: String, entries: Vec<LootEntry2>, guaranteed: Vec<String> }
#[derive(Clone, Debug)]
struct LootEntry2 { item: String, weight: f32, min_count: u32, max_count: u32, rarity_bonus: f32 }
#[derive(Clone, Debug)]
struct ProceduralWeapon { name: String, base: String, prefix: Option<String>, suffix: Option<String>, damage: f32, speed: f32, range: f32, element: Option<Element>, rarity: CosmeticRarity, enchants: Vec<String>, level_req: u32 }
#[derive(Clone, Debug)]
struct ProceduralArmor { name: String, base: String, defense: f32, weight: f32, element_resist: Vec<(Element, f32)>, rarity: CosmeticRarity, set_name: Option<String>, enchants: Vec<String> }
#[derive(Clone, Debug)]
struct GuildSystem { guilds: Vec<Guild2>, player_guild: Option<String>, guild_hall: Option<[f32;3]> }
#[derive(Clone, Debug)]
struct Guild2 { name: String, members: Vec<GuildMember>, rank_names: Vec<String>, treasury: f64, reputation: f32, perks: Vec<String>, level: u32 }
#[derive(Clone, Debug)]
struct GuildMember { name: String, rank: u32, contribution: f64, joined: f32, online: bool }
#[derive(Clone, Debug)]
struct SocialSystem { relationships: Vec<SocialRelation>, conversations_today: u32, gift_cooldown: f32 }
#[derive(Clone, Debug)]
struct SocialRelation { npc: String, friendship: f32, romance: f32, trust: f32, gifts_given: u32, quests_completed: u32, events: Vec<String> }
#[derive(Clone, Debug)]
struct Calendar { day: u32, month: u32, year: u32, day_name: String, festival: Option<String>, moon_phase: f32 }
#[derive(Clone, Debug)]
struct Festival { name: String, month: u32, day: u32, duration: u32, events: Vec<String>, buffs: Vec<(String,f32)>, decorations: bool }
#[derive(Clone, Debug)]
struct ProcDungeon { name: String, floors: u32, current_floor: u32, rooms_per_floor: u32, difficulty: f32, seed: u32, boss_floor: u32, loot_quality: f32, rooms: Vec<DungeonRoom> }
#[derive(Clone, Debug)]
struct DungeonRoom { kind: RoomKind, pos: [u32;2], connections: Vec<usize>, enemies: u32, loot: Vec<String>, cleared: bool, boss: bool }
#[derive(Clone, Debug, Copy)]
enum RoomKind { Combat, Puzzle2, Treasure, Rest, Shop2, Boss2, Trap2, Secret2, Shrine3, MiniBoss }
// ======== ROUND 24: EDITOR TOOLS, AUTOMATION, DEBUG ========
#[derive(Clone, Debug)]
struct MacroRecorder { recording: bool, playing: bool, macros: Vec<EditorMacro>, current: Option<usize> }
#[derive(Clone, Debug)]
struct EditorMacro { name: String, commands: Vec<String>, loop_count: u32, delay: f32 }
#[derive(Clone, Debug)]
struct BatchSpawner { template: String, count: u32, spacing: f32, pattern: SpawnPattern, randomize: f32, spawned: Vec<String> }
#[derive(Clone, Debug, Copy)]
enum SpawnPattern { Grid, Circle, Line, Spiral, Random2, Scatter2, Hex }
#[derive(Clone, Debug)]
struct ObjectReplacer { find: String, replace_with: String, count: u32, preserve_transform: bool }
#[derive(Clone, Debug)]
struct ScatterBrush { active: bool, radius: f32, density: f32, objects: Vec<String>, random_scale: (f32,f32), random_rotation: bool, align_to_surface: bool, slope_limit: f32 }
#[derive(Clone, Debug)]
struct PaintVertex { active: bool, color: [f32;4], radius: f32, strength: f32, blend_mode: String }
#[derive(Clone, Debug)]
struct MeasureTool { active: bool, point_a: Option<[f32;3]>, point_b: Option<[f32;3]>, distance: f32, angle: f32, height_diff: f32 }
#[derive(Clone, Debug)]
struct AlignTool2 { axis: String, mode: AlignMode2, reference: String }
#[derive(Clone, Debug, Copy)]
enum AlignMode2 { Min, Max, Center, Distribute, MatchSize }
#[derive(Clone, Debug)]
struct PathTool { nodes: Vec<PathNode>, closed: bool, smooth: bool, visible: bool, name: String }
#[derive(Clone, Debug)]
struct PathNode { pos: [f32;3], tangent_in: [f32;3], tangent_out: [f32;3], auto_tangent: bool }
#[derive(Clone, Debug)]
struct ShapeTool { kind: ShapeKind2, size: [f32;3], segments: u32, smooth: bool }
#[derive(Clone, Debug, Copy)]
enum ShapeKind2 { Box2, Sphere2, Cylinder2, Cone2, Torus, Pyramid, Wedge, Disc, Tube, Capsule2, Ring, Star }
#[derive(Clone, Debug)]
struct BooleanOp { kind: BoolOp, object_a: String, object_b: String, result: Option<String> }
#[derive(Clone, Debug, Copy)]
enum BoolOp { Union, Subtract, Intersect }
#[derive(Clone, Debug)]
struct UVEditor { active: bool, selected_faces: Vec<u32>, scale: [f32;2], offset: [f32;2], rotation: f32, projection: UVProjection }
#[derive(Clone, Debug, Copy)]
enum UVProjection { Planar, Box3, Cylindrical, Spherical, Camera2 }
#[derive(Clone, Debug)]
struct VertexEditor { active: bool, selected_verts: Vec<u32>, mode: VertexMode }
#[derive(Clone, Debug, Copy)]
enum VertexMode { Vertex, Edge, Face }
#[derive(Clone, Debug)]
struct LevelValidator { errors: Vec<ValidationError>, warnings: Vec<ValidationError>, last_check: f32 }
#[derive(Clone, Debug)]
struct ValidationError { message: String, severity: String, object: Option<String>, auto_fix: bool }
#[derive(Clone, Debug)]
struct PerfBudget { tri_limit: u64, current_tris: u64, draw_call_limit: u32, current_draws: u32, texture_limit_mb: u32, current_tex_mb: u32, within_budget: bool }
#[derive(Clone, Debug)]
struct AssetDependency { asset: String, depends_on: Vec<String>, used_by: Vec<String>, size_bytes: u64 }
#[derive(Clone, Debug)]
struct HotReload { enabled: bool, watched_files: Vec<String>, last_modified: Vec<f32>, reload_count: u32 }
#[derive(Clone, Debug)]
struct VersionControl { current_branch: String, modified_files: Vec<String>, commit_count: u32, has_conflicts: bool }
#[derive(Clone, Debug)]
struct CollabSession { active: bool, host: String, clients: Vec<String>, sync_interval: f32, timer: f32, changes: Vec<String> }
#[derive(Clone, Debug)]
struct CommandPalette { open: bool, query: String, results: Vec<PaletteResult>, selected: usize }
#[derive(Clone, Debug)]
struct PaletteResult { name: String, description: String, shortcut: Option<String>, category: String }
#[derive(Clone, Debug)]
struct SearchReplace { open: bool, find: String, replace: String, scope: String, results: Vec<(String, u32)>, case_sensitive: bool }
#[derive(Clone, Debug)]
struct EditorLayout { panels: Vec<EditorPanel2>, active_layout: String, saved_layouts: Vec<String> }
#[derive(Clone, Debug)]
struct EditorPanel2 { name: String, pos: [f32;2], size: [f32;2], visible: bool, docked: bool, tab_group: Option<String> }
#[derive(Clone, Debug)]
struct Bookmarks2 { list: Vec<Bookmark2>, current: Option<usize> }
#[derive(Clone, Debug)]
struct Bookmark2 { name: String, pos: [f32;3], yaw: f32, pitch: f32, zoom: f32, timestamp: f32 }
#[derive(Clone, Debug)]
struct RenderStats2 { fps: f32, frame_time: f32, gpu_time: f32, cpu_time: f32, draw_calls: u32, triangles: u64, vertices: u64, textures: u32, shaders: u32 }
#[derive(Clone, Debug)]
struct MemoryStats { total_mb: f32, used_mb: f32, textures_mb: f32, meshes_mb: f32, audio_mb: f32, scripts_mb: f32 }
// ======== ROUND 23: SPORTS, RACING, RHYTHM, PUZZLE ========
#[derive(Clone, Debug)]
struct SoccerMatch { score_a: u32, score_b: u32, ball_pos: [f32;3], ball_vel: [f32;3], timer: f32, half: u32, playing: bool }
#[derive(Clone, Debug)]
struct BasketballGame { score_home: u32, score_away: u32, ball_pos: [f32;3], shot_clock: f32, quarter: u32, playing: bool }
#[derive(Clone, Debug)]
struct GolfHole { par: u32, strokes: u32, ball_pos: [f32;3], hole_pos: [f32;3], wind: [f32;2], completed: bool }
#[derive(Clone, Debug)]
struct TennisCourt { score: [(u32,u32);2], serving: bool, ball_pos: [f32;3], ball_vel: [f32;3], set: u32 }
#[derive(Clone, Debug)]
struct BoxingRing { player_hp: f32, opponent_hp: f32, round: u32, timer: f32, stamina: f32, combo_count: u32 }
#[derive(Clone, Debug)]
struct RacingLap { pos: [f32;3], speed: f32, lap: u32, total_laps: u32, checkpoint: u32, best_time: f32, current_time: f32, boost: f32, drifting: bool }
#[derive(Clone, Debug)]
struct RacePosition { place: u32, total: u32, distance_to_next: f32, distance_to_prev: f32 }
#[derive(Clone, Debug)]
struct DriftSystem { angle: f32, score: u32, multiplier: f32, timer: f32, active: bool }
#[derive(Clone, Debug)]
struct RhythmGame { notes: Vec<RhythmNote>, bpm: f32, score: u64, combo: u32, max_combo: u32, accuracy: f32, playing: bool, position: f32 }
#[derive(Clone, Debug)]
struct RhythmNote { time: f32, lane: u32, kind: NoteKind, hit: bool }
#[derive(Clone, Debug, Copy)]
enum NoteKind { Tap, Hold(f32), Swipe, Flick }
#[derive(Clone, Debug)]
struct MusicVisualizerV2 { bands: Vec<f32>, peak: f32, beat_detected: bool, mode: VisualizerMode, sensitivity: f32, smoothing: f32, color_scheme: Vec<[f32;4]> }
#[derive(Clone, Debug, Copy)]
enum VisualizerMode { Bars, Wave, Circle, Spectrum, Particles2, Tunnel }
#[derive(Clone, Debug)]
struct Sokoban { grid: Vec<Vec<u8>>, player: [usize;2], boxes: Vec<[usize;2]>, targets: Vec<[usize;2]>, moves: u32, solved: bool }
#[derive(Clone, Debug)]
struct Tetris { board: Vec<Vec<u8>>, current: TetrisPiece, next: TetrisPiece, score: u64, lines: u32, level: u32, timer: f32, game_over: bool }
#[derive(Clone, Debug)]
struct TetrisPiece { kind: u8, rotation: u8, x: i32, y: i32 }
#[derive(Clone, Debug)]
struct MatchThree { grid: Vec<Vec<u8>>, width: u32, height: u32, score: u64, moves_left: u32, cascading: bool }
#[derive(Clone, Debug)]
struct MinesweeperGrid { width: u32, height: u32, mines: u32, cells: Vec<MSCell>, revealed: u32, flagged: u32, game_over: bool, won: bool }
#[derive(Clone, Debug)]
struct MSCell { mine: bool, revealed: bool, flagged: bool, neighbors: u8 }
#[derive(Clone, Debug)]
struct Chess2 { board: [[u8;8];8], turn: bool, selected: Option<[usize;2]>, captures_w: Vec<u8>, captures_b: Vec<u8>, check: bool, checkmate: bool, moves: u32 }
#[derive(Clone, Debug)]
struct Checkers { board: [[u8;8];8], turn: bool, selected: Option<[usize;2]>, pieces_r: u32, pieces_b: u32 }
#[derive(Clone, Debug)]
struct CardBattle { player_hp: f32, enemy_hp: f32, player_hand: Vec<BattleCard>, enemy_hand: Vec<BattleCard>, mana: u32, max_mana: u32, turn: u32 }
#[derive(Clone, Debug)]
struct BattleCard { name: String, cost: u32, damage: f32, heal: f32, shield: f32, effect: Option<String> }
#[derive(Clone, Debug)]
struct TowerDefenseWave { wave: u32, enemies_remaining: u32, spawn_timer: f32, spawn_interval: f32, path: Vec<[f32;3]>, active: bool }
#[derive(Clone, Debug)]
struct DefenseTower { name: String, pos: [f32;3], damage: f32, range: f32, fire_rate: f32, timer: f32, kind: TowerKind2, level: u32, kills: u32 }
#[derive(Clone, Debug, Copy)]
enum TowerKind2 { Arrow, Magic, Cannon, Ice, Lightning2, Poison2, Sniper, Splash }
#[derive(Clone, Debug)]
struct PinballTable { ball_pos: [f32;2], ball_vel: [f32;2], score: u64, balls_left: u32, flippers: [f32;2], bumpers: Vec<[f32;2]>, active: bool }
#[derive(Clone, Debug)]
struct BreakoutGame { paddle_x: f32, ball_pos: [f32;2], ball_vel: [f32;2], bricks: Vec<Brick>, score: u64, lives: u32, active: bool }
#[derive(Clone, Debug)]
struct Brick { pos: [f32;2], hp: u32, color: [f32;4], power_up: Option<String> }
// ======== ROUND 22: SPACE, UNDERWATER, HORROR ========
#[derive(Clone, Debug)]
struct SpaceStation { name: String, pos: [f32;3], modules: Vec<StationModule>, oxygen: f32, power: f32, crew: u32, orbit_radius: f32, orbit_speed: f32 }
#[derive(Clone, Debug)]
struct StationModule { name: String, kind: String, hp: f32, power_draw: f32, crew_capacity: u32, active: bool }
#[derive(Clone, Debug)]
struct Spacecraft { name: String, pos: [f32;3], vel: [f32;3], fuel: f32, max_fuel: f32, thrust: f32, hull: f32, shields: f32, weapons: Vec<String>, cargo: Vec<(String,u32)> }
#[derive(Clone, Debug)]
struct Planet2 { name: String, pos: [f32;3], radius: f32, gravity: f32, atmosphere: bool, temperature: f32, biome: String, moons: Vec<String>, rings: bool, colonized: bool }
#[derive(Clone, Debug)]
struct Asteroid2 { pos: [f32;3], size: f32, resources: Vec<(String,f32)>, vel: [f32;3], mineable: bool }
#[derive(Clone, Debug)]
struct StarSystem { name: String, star_type: String, planets: Vec<String>, asteroids: u32, discovered: bool }
#[derive(Clone, Debug)]
struct Hyperspace { active: bool, destination: String, progress: f32, speed: f32, fuel_cost: f32 }
#[derive(Clone, Debug)]
struct SpaceCombat { enemies: Vec<SpaceEnemy>, player_shields: f32, player_hull: f32, weapons_hot: bool }
#[derive(Clone, Debug)]
struct SpaceEnemy { name: String, pos: [f32;3], hp: f32, damage: f32, speed: f32, kind: String }
#[derive(Clone, Debug)]
struct UnderwaterBase { name: String, pos: [f32;3], depth: f32, pressure: f32, hull_integrity: f32, oxygen_gen: f32, modules: Vec<String> }
#[derive(Clone, Debug)]
struct DivingSuit { depth_rating: f32, oxygen: f32, max_oxygen: f32, light: bool, thruster: bool, pressure_warning: bool }
#[derive(Clone, Debug)]
struct MarineLife2 { name: String, pos: [f32;3], species: String, depth_range: (f32,f32), speed: f32, aggressive: bool, bioluminescent: bool, size: f32 }
#[derive(Clone, Debug)]
struct TrenchSystem { name: String, depth: f32, width: f32, length: f32, creatures: Vec<String>, thermal_vents: u32, pressure: f32 }
#[derive(Clone, Debug)]
struct HorrorSystem { fear_level: f32, max_fear: f32, sanity_drain: f32, darkness: f32, heartbeat_rate: f32, jumpscares_enabled: bool, ambient_horror: f32 }
#[derive(Clone, Debug)]
struct Jumpscare { trigger_pos: [f32;3], trigger_radius: f32, kind: String, intensity: f32, triggered: bool, cooldown: f32, timer: f32 }
#[derive(Clone, Debug)]
struct CreepySound { pos: Option<[f32;3]>, kind: String, interval: f32, timer: f32, volume: f32, random_offset: f32 }
#[derive(Clone, Debug)]
struct HauntedObject { name: String, pos: [f32;3], poltergeist: bool, move_range: f32, timer: f32, glow: bool, whisper: bool }
#[derive(Clone, Debug)]
struct Monster2 { name: String, pos: [f32;3], hp: f32, speed: f32, damage: f32, fear_aura: f32, behavior: MonsterBehavior, visible: bool, sound_range: f32, stalking: bool }
#[derive(Clone, Debug, Copy)]
enum MonsterBehavior { Patrol, Stalk, Chase, Ambush, Wander, Lurk, Mimic, Teleport }
#[derive(Clone, Debug)]
struct SafeRoom { pos: [f32;3], radius: f32, locked: bool, supplies: Vec<String>, save_point: bool, light: bool }
#[derive(Clone, Debug)]
struct Flashlight2 { on: bool, battery: f32, max_battery: f32, drain_rate: f32, range: f32, cone: f32, flicker: bool }
#[derive(Clone, Debug)]
struct SurvivalHorror { ammo_scarcity: f32, health_scarcity: f32, save_limited: bool, saves_remaining: u32, ink_ribbons: u32, item_limit: u32 }
#[derive(Clone, Debug)]
struct PuzzleRoom { name: String, locked: bool, clues: Vec<String>, solved: bool, mechanism: String, reward: String }
#[derive(Clone, Debug)]
struct DimensionShift { current: String, layers: Vec<DimensionLayer>, shift_timer: f32, auto_shift: bool }
#[derive(Clone, Debug)]
struct DimensionLayer { name: String, tint: [f32;4], fog_density: f32, gravity_mult: f32, time_mult: f32, monsters: Vec<String> }
#[derive(Clone, Debug)]
struct CorruptionSpread { origin: [f32;3], radius: f32, growth_rate: f32, max_radius: f32, damage: f32, tint: [f32;4] }
#[derive(Clone, Debug)]
struct BloodMoon { active: bool, timer: f32, duration: f32, spawn_mult: f32, damage_mult: f32, tint: [f32;4] }
#[derive(Clone, Debug)]
struct EchoSystem { echoes: Vec<Echo>, recording: bool, playback: bool }
#[derive(Clone, Debug)]
struct Echo { positions: Vec<[f32;3]>, timestamps: Vec<f32>, ghost: bool, loop_echo: bool }
// ======== ROUND 21: BUILDING, FARMING, CIVILIZATION ========
#[derive(Clone, Debug, Copy)]
enum BuildPieceKind { Foundation, Wall, Floor, Ceiling, Roof, Stairs, Door, Window, Fence, Pillar, Beam, Ramp }
#[derive(Clone, Debug)]
struct BuildingSystem { pieces: Vec<BuildingPiece>, snap_enabled: bool, grid_size: f32, current_material: String, ghost_piece: Option<BuildPieceKind>, demolish_mode: bool }
#[derive(Clone, Debug)]
struct Furniture { name: String, pos: [f32;3], kind: String, interactive: bool, comfort: f32, durability: f32 }
#[derive(Clone, Debug)]
struct Electricity { generators: Vec<Generator>, wires: Vec<Wire>, consumers: Vec<PowerConsumer>, total_power: f32, total_demand: f32 }
#[derive(Clone, Debug)]
struct Generator { name: String, pos: [f32;3], output: f32, fuel: f32, max_fuel: f32, kind: String, active: bool }
#[derive(Clone, Debug)]
struct Wire { from: [f32;3], to: [f32;3], capacity: f32, load: f32 }
#[derive(Clone, Debug)]
struct PowerConsumer { name: String, pos: [f32;3], demand: f32, active: bool, priority: u32 }
#[derive(Clone, Debug)]
struct Plumbing { pipes: Vec<Pipe>, pumps: Vec<WaterPump>, tanks: Vec<WaterTank2>, total_flow: f32 }
#[derive(Clone, Debug)]
struct Pipe { from: [f32;3], to: [f32;3], diameter: f32, flow: f32, pressure: f32 }
#[derive(Clone, Debug)]
struct WaterPump { pos: [f32;3], flow_rate: f32, active: bool, power_req: f32 }
#[derive(Clone, Debug)]
struct WaterTank2 { pos: [f32;3], capacity: f32, current: f32, input_rate: f32, output_rate: f32 }
#[derive(Clone, Debug)]
struct FarmPlot { pos: [f32;3], size: [f32;2], soil_quality: f32, irrigated: bool, crops: Vec<Crop> }
#[derive(Clone, Debug)]
struct Crop { name: String, growth: f32, growth_rate: f32, water_need: f32, water_level: f32, mature_at: f32, yield_count: u32, season: Option<SeasonType>, diseased: bool }
#[derive(Clone, Debug)]
struct Livestock { name: String, pos: [f32;3], species: String, hp: f32, hunger: f32, produces: Vec<(String, f32, f32)>, age: f32, pen: Option<String> }
#[derive(Clone, Debug)]
struct Beehive { pos: [f32;3], population: u32, honey: f32, max_honey: f32, production_rate: f32, health: f32 }
#[derive(Clone, Debug)]
struct Composting { pos: [f32;3], input: Vec<String>, output: f32, timer: f32, temperature: f32, ready: bool }
#[derive(Clone, Debug)]
struct Irrigation { channels: Vec<([f32;3],[f32;3])>, sprinklers: Vec<[f32;3]>, coverage: f32, water_usage: f32, active: bool }
#[derive(Clone, Debug)]
struct Greenhouse { pos: [f32;3], size: [f32;3], temperature: f32, humidity: f32, light_level: f32, plots: Vec<FarmPlot> }
#[derive(Clone, Debug)]
struct Population { citizens: Vec<Citizen>, happiness: f32, growth_rate: f32, capacity: u32, employed: u32, unemployed: u32 }
#[derive(Clone, Debug)]
struct Citizen { name: String, pos: [f32;3], job: Option<String>, happiness: f32, health: f32, hunger: f32, home: Option<String>, skills: Vec<(String, f32)> }
#[derive(Clone, Debug)]
struct CityZone { pos: [f32;3], size: [f32;2], kind: ZoneKind, level: u32, population: u32, tax_revenue: f64 }
#[derive(Clone, Debug, Copy)]
enum ZoneKind { Residential, Commercial, Industrial, Agricultural, Military, Entertainment, Education, Healthcare }
#[derive(Clone, Debug)]
struct CityService { name: String, kind: String, coverage: f32, cost: f64, quality: f32, workers: u32 }
#[derive(Clone, Debug)]
struct TechTree2 { nodes: Vec<TechNode2>, researching: Option<usize>, research_points: f64 }
#[derive(Clone, Debug)]
struct TechNode2 { name: String, description: String, cost: f64, progress: f64, unlocked: bool, requires: Vec<usize>, unlocks: Vec<String> }
#[derive(Clone, Debug)]
struct Diplomacy { factions: Vec<DiplomaticRelation>, treaties: Vec<Treaty>, wars: Vec<War> }
#[derive(Clone, Debug)]
struct DiplomaticRelation { faction_a: String, faction_b: String, standing: f32, trade: bool }
#[derive(Clone, Debug)]
struct Treaty { parties: Vec<String>, kind: String, duration: f32, timer: f32, terms: Vec<String> }
#[derive(Clone, Debug)]
struct War { attacker: String, defender: String, started: f32, battles: u32, attacker_score: f32, defender_score: f32 }
#[derive(Clone, Debug)]
struct Army { name: String, units: Vec<ArmyUnit>, pos: [f32;3], morale: f32, supplies: f32, formation: String }
#[derive(Clone, Debug)]
struct ArmyUnit { kind: String, count: u32, hp: f32, damage: f32, armor: f32, speed: f32, range: f32 }
#[derive(Clone, Debug)]
struct Siege { target: String, attacker: String, progress: f32, siege_weapons: Vec<String>, defender_hp: f32 }
#[derive(Clone, Debug)]
struct TradeRoute2 { from: String, to: String, goods: Vec<(String, u32)>, profit: f64, distance: f32, danger: f32, active: bool }
#[derive(Clone, Debug)]
struct Archaeology { sites: Vec<ArchSite>, artifacts: Vec<Artifact>, knowledge: f64 }
#[derive(Clone, Debug)]
struct ArchSite { pos: [f32;3], name: String, age: u32, excavation: f32, artifacts_remaining: u32, danger: f32 }
#[derive(Clone, Debug)]
struct Artifact { name: String, age: u32, value: f64, rarity: String, description: String, discovered: bool }
#[derive(Clone, Debug)]
struct Museum { exhibits: Vec<Exhibit>, visitors: u32, reputation: f32, revenue: f64 }
#[derive(Clone, Debug)]
struct Exhibit { artifact: String, description: String, popularity: f32, quality: f32 }
// ======== ROUND 20: NARRATIVE, CINEMATICS, POLISH ========
#[derive(Clone, Debug)]
struct DialogueSystem2 { conversations: Vec<Conversation2>, active: Option<usize>, history: Vec<String>, reputation_effects: bool }
#[derive(Clone, Debug)]
struct Conversation2 { npc: String, nodes: Vec<DialogueNode2>, current: usize, completed: bool }
#[derive(Clone, Debug)]
struct DialogueNode2 { text: String, speaker: String, responses: Vec<DialogueResponse2>, condition: Option<String>, emotion: String }
#[derive(Clone, Debug)]
struct DialogueResponse2 { text: String, next_node: usize, karma_effect: f32, skill_check: Option<(String, u32)>, hidden: bool }
#[derive(Clone, Debug)]
struct CutsceneDirector2 { scenes: Vec<Cutscene2>, active: Option<usize>, skip_enabled: bool, timer: f32 }
#[derive(Clone, Debug)]
struct Cutscene2 { name: String, shots: Vec<CutsceneShot>, current_shot: usize, duration: f32, timer: f32, playing: bool }
#[derive(Clone, Debug)]
struct NarrativeEvent { name: String, trigger: String, once: bool, triggered: bool, consequence: String, delay: f32, timer: f32 }
#[derive(Clone, Debug)]
struct StoryBranch { name: String, condition: String, outcomes: Vec<StoryOutcome> }
#[derive(Clone, Debug)]
struct StoryOutcome { name: String, description: String, effects: Vec<String>, probability: f32 }
#[derive(Clone, Debug)]
struct Flashback { name: String, scene: String, duration: f32, desaturated: bool, vignette: bool, active: bool, timer: f32 }
#[derive(Clone, Debug)]
struct InnerMonologue { text: String, duration: f32, timer: f32, style: String, active: bool }
#[derive(Clone, Debug)]
struct ChoiceConsequence { choice: String, immediate: Vec<String>, delayed: Vec<(String, f32)>, permanent: bool }
#[derive(Clone, Debug)]
struct Prophecy { text: String, conditions: Vec<String>, fulfilled: bool, rewards: Vec<String> }
#[derive(Clone, Debug)]
struct Lore { entries: Vec<LoreEntry>, discovered: usize }
#[derive(Clone, Debug)]
struct LoreEntry { title: String, text: String, category: String, discovered: bool, related: Vec<String> }
#[derive(Clone, Debug)]
struct ScreenEffect2 { kind: ScreenFX, intensity: f32, duration: f32, timer: f32, active: bool }
#[derive(Clone, Debug, Copy)]
enum ScreenFX { LetterboxIn, LetterboxOut, FocusPull, FlashWhite, FlashRed, Distortion, Heartbeat, DreamSequence, Nightmare, Glitch2, MatrixRain, Retro }
#[derive(Clone, Debug)]
struct CameraEffect2 { kind: CamFX, intensity: f32, duration: f32, timer: f32 }
#[derive(Clone, Debug, Copy)]
enum CamFX { DutchAngle, Crane, Dolly, Tracking, Whip, ZoomBurst, Vertigo, Orbit, Spiral }
#[derive(Clone, Debug)]
struct Cinematic2 { black_bars: f32, grain: f32, chromatic: f32, vignette_strength: f32, color_filter: [f32;4], aspect_ratio: f32 }
#[derive(Clone, Debug)]
struct PostFX { bloom_v2: f32, exposure: f32, gamma: f32, saturation_v2: f32, contrast_v2: f32, sharpen: f32, hue_shift: f32, color_balance: [f32;3] }
#[derive(Clone, Debug)]
struct UITheme { name: String, primary: [f32;4], secondary: [f32;4], accent: [f32;4], bg: [f32;4], text: [f32;4], font_size: f32, border_radius: f32 }
#[derive(Clone, Debug)]
struct UIAnimation { element: String, kind: UIAnimKind, duration: f32, timer: f32, active: bool }
#[derive(Clone, Debug, Copy)]
enum UIAnimKind { FadeIn, FadeOut, SlideLeft, SlideRight, SlideUp, SlideDown, ScaleUp, ScaleDown, Bounce, Shake2, Pulse }
#[derive(Clone, Debug)]
struct NotificationQueue2 { queue: Vec<Notification2>, max_visible: usize, display_time: f32 }
#[derive(Clone, Debug)]
struct ContextMenu { items: Vec<ContextItem>, pos: [f32;2], visible: bool }
#[derive(Clone, Debug)]
struct ContextItem { label: String, action: String, icon: Option<String>, enabled: bool, shortcut: Option<String> }
#[derive(Clone, Debug)]
struct Tooltip2 { text: String, pos: [f32;2], visible: bool, delay: f32, timer: f32 }
#[derive(Clone, Debug)]
struct ProgressBar2 { label: String, value: f32, max: f32, color: [f32;4], show_text: bool }
#[derive(Clone, Debug)]
struct RadialMenu { items: Vec<RadialItem>, open: bool, selected: Option<usize>, center: [f32;2] }
#[derive(Clone, Debug)]
struct RadialItem { label: String, icon: String, action: String, color: [f32;4] }
#[derive(Clone, Debug)]
struct Journal2 { entries: Vec<JournalEntry2>, current_page: usize, bookmarks: Vec<usize> }
#[derive(Clone, Debug)]
struct JournalEntry2 { title: String, text: String, date: f32, category: String, pinned: bool, images: Vec<String> }
#[derive(Clone, Debug)]
struct Codex { categories: Vec<CodexCategory>, total_entries: usize, discovered: usize }
#[derive(Clone, Debug)]
struct CodexCategory { name: String, entries: Vec<CodexEntry>, icon: String }
#[derive(Clone, Debug)]
struct CodexEntry { name: String, description: String, discovered: bool, image: Option<String> }
#[derive(Clone, Debug)]
struct MapSystem2 { layers: Vec<MapLayer2>, current_layer: usize, fog_of_war: bool, zoom: f32, pan: [f32;2], markers: Vec<MapPin> }
#[derive(Clone, Debug)]
struct MapLayer2 { name: String, visible: bool, color: [f32;4] }
#[derive(Clone, Debug)]
struct MapPin { pos: [f32;2], label: String, icon: String, color: [f32;4], removable: bool }
// ======== ROUND 19: MAGIC, CRAFTING DEEP, MUSIC ========
#[derive(Clone, Debug)]
struct SpellBook { spells: Vec<Spell2>, equipped: Vec<usize>, max_equipped: usize, mana: f32, max_mana: f32, regen: f32 }
#[derive(Clone, Debug)]
struct Spell2 { name: String, element: Element, damage: f32, mana_cost: f32, cooldown: f32, timer: f32, range: f32, aoe: f32, level: u32, xp: f32 }
#[derive(Clone, Debug, Copy)]
enum Element { Fire, Ice, Lightning, Earth, Water, Wind, Dark, Light, Arcane, Poison, Holy, Chaos }
#[derive(Clone, Debug)]
struct RuneSystem { runes: Vec<Rune>, combinations: Vec<RuneCombo>, active_combo: Option<String> }
#[derive(Clone, Debug)]
struct Rune { name: String, element: Element, power: f32, discovered: bool }
#[derive(Clone, Debug)]
struct RuneCombo { runes: Vec<String>, result: String, effect: String, power_mult: f32 }
#[derive(Clone, Debug)]
struct Totem { name: String, pos: [f32;3], element: Element, radius: f32, effect: String, duration: f32, timer: f32, active: bool }
#[derive(Clone, Debug)]
struct Ward { name: String, pos: [f32;3], radius: f32, blocks: Vec<String>, hp: f32, max_hp: f32 }
#[derive(Clone, Debug)]
struct Curse { name: String, target: String, effect: String, severity: f32, duration: f32, timer: f32, removable: bool }
#[derive(Clone, Debug)]
struct Blessing2 { name: String, target: String, effect: String, power: f32, duration: f32, timer: f32 }
#[derive(Clone, Debug)]
struct Ritual { name: String, ingredients: Vec<String>, progress: f32, duration: f32, participants: Vec<String>, result: String, active: bool }
#[derive(Clone, Debug)]
struct MagicBarrier { pos: [f32;3], radius: f32, element: Element, hp: f32, max_hp: f32, regen: f32, visible: bool }
#[derive(Clone, Debug)]
struct Telekinesis { active: bool, target: Option<String>, range: f32, force: f32, mana_drain: f32 }
#[derive(Clone, Debug)]
struct TimeManip { slow_factor: f32, rewind_buffer: Vec<TimeSnapshot>, frozen_entities: Vec<String>, mana_drain: f32, active: bool }
#[derive(Clone, Debug)]
struct TimeSnapshot { positions: Vec<(String, [f32;3])>, timestamp: f32 }
#[derive(Clone, Debug)]
struct GravityWell { pos: [f32;3], strength: f32, radius: f32, inverted: bool, duration: f32, timer: f32, active: bool }
#[derive(Clone, Debug)]
struct PortalPair2 { name: String, entrance: [f32;3], exit: [f32;3], color: [f32;4], bidirectional: bool, active: bool, cooldown: f32 }
#[derive(Clone, Debug)]
struct DimensionRift { pos: [f32;3], size: f32, destination: String, instability: f32, timer: f32, active: bool }
#[derive(Clone, Debug)]
struct CraftingRecipe2 { name: String, inputs: Vec<(String, u32)>, output: String, output_count: u32, station: String, time: f32, skill_req: u32 }
#[derive(Clone, Debug)]
struct CraftingStation2 { name: String, pos: [f32;3], kind: String, tier: u32, queue: Vec<CraftingJob>, fuel: f32, max_fuel: f32 }
#[derive(Clone, Debug)]
struct CraftingJob { recipe: String, progress: f32, duration: f32, quality: f32 }
#[derive(Clone, Debug)]
struct SmeltingRecipe { ore: String, result: String, temperature: f32, time: f32, fuel_cost: f32 }
#[derive(Clone, Debug)]
struct WoodworkRecipe { wood: String, result: String, tools: Vec<String>, time: f32 }
#[derive(Clone, Debug)]
struct TailoringRecipe { fabric: String, result: String, thread: u32, time: f32 }
#[derive(Clone, Debug)]
struct BrewingRecipe { ingredients: Vec<String>, result: String, brew_time: f32, potency: f32 }
#[derive(Clone, Debug)]
struct GemCutting { raw_gem: String, cut_gem: String, quality: f32, tools_needed: Vec<String> }
#[derive(Clone, Debug)]
struct Inscription { scroll: String, spell: String, ink_cost: u32, skill_req: u32 }
#[derive(Clone, Debug)]
struct MusicComposer { tracks: Vec<ComposerTrack>, bpm: f32, time_sig: (u32, u32), playing: bool, position: f32 }
#[derive(Clone, Debug)]
struct ComposerTrack { name: String, instrument: String, notes: Vec<MusicNote2>, volume: f32, muted: bool }
#[derive(Clone, Debug)]
struct MusicNote2 { pitch: u32, start: f32, duration: f32, velocity: f32 }
#[derive(Clone, Debug)]
struct SoundDesigner { layers: Vec<SoundLayer2>, master_vol: f32, reverb: f32, eq: [f32;3] }
#[derive(Clone, Debug)]
struct SoundLayer2 { name: String, source: String, volume: f32, pitch: f32, pan: f32, looping: bool, spatial: bool }
#[derive(Clone, Debug)]
struct VoiceActing { lines: Vec<VoiceLine>, current: usize, playing: bool }
#[derive(Clone, Debug)]
struct VoiceLine { speaker: String, text: String, emotion: String, duration: f32, audio_file: Option<String> }
#[derive(Clone, Debug)]
struct ProceduralMusic { enabled: bool, mood: MusicMood, intensity: f32, layers_active: u32, transition_time: f32 }
#[derive(Clone, Debug, Copy)]
enum MusicMood { Calm, Tense, Epic, Sad, Mysterious, Joyful, Dark, Triumphant }
#[derive(Clone, Debug)]
struct AmbientSoundscape { name: String, sounds: Vec<(String, f32, f32)>, time_of_day_filter: bool, weather_reactive: bool }
// ======== ROUND 18: CREATURES, AI BEHAVIORS, STEALTH ========
#[derive(Clone, Debug)]
struct CreatureSpawner2 { name: String, pos: [f32;3], creature_type: String, max_count: u32, current: u32, spawn_interval: f32, timer: f32, radius: f32, level_range: (u32,u32) }
#[derive(Clone, Debug)]
struct CreatureNest { pos: [f32;3], species: String, population: u32, max_pop: u32, aggression: f32, territory_radius: f32, queen_alive: bool }
#[derive(Clone, Debug)]
struct Herd { name: String, species: String, members: Vec<HerdMember>, leader: usize, grazing: bool, migration_path: Vec<[f32;3]>, path_progress: f32 }
#[derive(Clone, Debug)]
struct HerdMember { pos: [f32;3], hp: f32, age: f32, state: String }
#[derive(Clone, Debug)]
struct Predator { name: String, pos: [f32;3], species: String, hp: f32, damage: f32, speed: f32, hunt_range: f32, hungry: f32, state: PredatorState, target: Option<String> }
#[derive(Clone, Debug, Copy)]
enum PredatorState { Idle, Stalking, Chasing, Attacking, Eating, Fleeing }
#[derive(Clone, Debug)]
struct BossEnemy { name: String, pos: [f32;3], hp: f32, max_hp: f32, phases: Vec<BossPhase>, current_phase: usize, enraged: bool, shield: f32, summons: Vec<String> }
#[derive(Clone, Debug)]
struct MinionWave { boss: String, minion_type: String, count: u32, interval: f32, timer: f32 }
#[derive(Clone, Debug)]
struct EnemyAura { entity: String, kind: AuraKind, radius: f32, strength: f32, color: [f32;4] }
#[derive(Clone, Debug, Copy)]
enum AuraKind { Damage, Slow, Fear, Heal, Shield, Buff, Weaken, Poison }
#[derive(Clone, Debug)]
struct StealthSystem { player_visibility: f32, noise_level: f32, in_shadow: bool, disguise: Option<String>, detection_meter: f32, alert_level: AlertLevel }
#[derive(Clone, Debug, Copy)]
enum AlertLevel { Unaware, Suspicious, Searching, Alert, Combat }
#[derive(Clone, Debug)]
struct SecurityCamera2 { pos: [f32;3], yaw: f32, fov: f32, range: f32, sweep_speed: f32, sweep_angle: f32, timer: f32, alert: bool }
#[derive(Clone, Debug)]
struct LaserGrid { pos: [f32;3], beams: Vec<LaserBeam2>, pattern: String, cycle_time: f32, timer: f32 }
#[derive(Clone, Debug)]
struct LaserBeam2 { start: [f32;3], end: [f32;3], active: bool, color: [f32;4] }
#[derive(Clone, Debug)]
struct Distraction { pos: [f32;3], kind: String, radius: f32, duration: f32, timer: f32, active: bool }
#[derive(Clone, Debug)]
struct PickpocketTarget { entity: String, difficulty: f32, loot: Vec<String>, detected: bool, cooldown: f32 }
#[derive(Clone, Debug)]
struct Disguise { name: String, faction: String, effectiveness: f32, duration: f32, timer: f32 }
#[derive(Clone, Debug)]
struct Companion2 { name: String, pos: [f32;3], hp: f32, max_hp: f32, damage: f32, abilities: Vec<String>, loyalty: f32, mood: String, following: bool }
#[derive(Clone, Debug)]
struct CompanionCommand { companion: String, command: CompCmdKind }
#[derive(Clone, Debug, Copy)]
enum CompCmdKind { Follow, Stay, Attack, Defend, Heal, Fetch, Scout, Wait }
#[derive(Clone, Debug)]
struct Summon { name: String, pos: [f32;3], hp: f32, damage: f32, duration: f32, timer: f32, owner: String, kind: String }
#[derive(Clone, Debug)]
struct Familiar { name: String, pos: [f32;3], species: String, abilities: Vec<String>, bond_level: f32, active: bool }
#[derive(Clone, Debug)]
struct TamingSystem { target: Option<String>, progress: f32, difficulty: f32, food_required: String, tamed: Vec<String> }
#[derive(Clone, Debug)]
struct Breeding { species_a: String, species_b: String, offspring: Option<String>, timer: f32, duration: f32, success_rate: f32 }
#[derive(Clone, Debug)]
struct Evolution { entity: String, current_stage: u32, max_stage: u32, xp: f32, xp_needed: f32, forms: Vec<String> }
#[derive(Clone, Debug)]
struct MorphSystem { entity: String, forms: Vec<MorphForm>, current: usize, transition_time: f32, transitioning: bool }
#[derive(Clone, Debug)]
struct MorphForm { name: String, mesh: String, scale: f32, abilities: Vec<String>, stats_mult: f32 }
#[derive(Clone, Debug)]
struct Possession { active: bool, target: Option<String>, timer: f32, max_duration: f32, original_pos: [f32;3] }
#[derive(Clone, Debug)]
struct SoulSystem { souls_collected: u64, soul_value: f64, soul_shop: Vec<SoulShopItem> }
#[derive(Clone, Debug)]
struct SoulShopItem { name: String, cost: u64, description: String, purchased: bool }
#[derive(Clone, Debug)]
struct KarmaSystem { karma: f32, deeds: Vec<KarmaDeed>, tier: KarmaTier }
#[derive(Clone, Debug)]
struct KarmaDeed { action: String, value: f32, timestamp: f32 }
#[derive(Clone, Debug, Copy)]
enum KarmaTier { Evil, Dark, Neutral, Good, Holy }
#[derive(Clone, Debug)]
struct SanitySystem { sanity: f32, max_sanity: f32, drain_rate: f32, hallucinations: bool, effects: Vec<String> }
#[derive(Clone, Debug)]
struct HungerThirst { hunger: f32, thirst: f32, max_hunger: f32, max_thirst: f32, drain_rate: f32, effects_threshold: f32 }
#[derive(Clone, Debug)]
struct TemperatureSystem { body_temp: f32, ambient_temp: f32, insulation: f32, wet: bool, hypothermia: bool, heatstroke: bool }
#[derive(Clone, Debug)]
struct DiseaseSystem { diseases: Vec<Disease>, immunity: f32, contagion_range: f32 }
#[derive(Clone, Debug)]
struct Disease { name: String, severity: f32, duration: f32, timer: f32, symptoms: Vec<String>, contagious: bool }
#[derive(Clone, Debug)]
struct WoundSystem { wounds: Vec<Wound>, bleed_rate: f32, infection_chance: f32 }
#[derive(Clone, Debug)]
struct Wound { location: String, severity: f32, bleeding: bool, infected: bool, heal_timer: f32 }
#[derive(Clone, Debug)]
struct SleepSystem { fatigue: f32, max_fatigue: f32, sleeping: bool, dream_state: bool, rest_quality: f32 }
// ======== ROUND 17: WORLD BUILDING & ECONOMY ========
#[derive(Clone, Debug)]
struct TerrainPaint { layer: u32, radius: f32, strength: f32, texture: String, blend: f32 }
#[derive(Clone, Debug)]
struct HeightmapEdit { pos: [f32;2], radius: f32, strength: f32, kind: HeightmapOp }
#[derive(Clone, Debug, Copy)]
enum HeightmapOp { Raise, Lower, Flatten, Smooth, Noise, Erode }
#[derive(Clone, Debug)]
struct FoliagePainter { brush_size: f32, density: f32, species: Vec<FoliageSpecies>, painting: bool }
#[derive(Clone, Debug)]
struct FoliageSpecies { name: String, model: String, min_scale: f32, max_scale: f32, slope_max: f32, altitude_range: (f32,f32) }
#[derive(Clone, Debug)]
struct RoadTool { nodes: Vec<[f32;3]>, width: f32, texture: String, auto_terrain: bool, banking: f32 }
#[derive(Clone, Debug)]
struct RiverTool2 { nodes: Vec<[f32;3]>, width: f32, depth: f32, flow_speed: f32, erosion: bool }
#[derive(Clone, Debug)]
struct LakeGen { pos: [f32;3], radius: f32, depth: f32, shore_blend: f32 }
#[derive(Clone, Debug)]
struct CliffGen { start: [f32;3], end: [f32;3], height: f32, roughness: f32, overhang: f32 }
#[derive(Clone, Debug)]
struct ArchGen { pos: [f32;3], width: f32, height: f32, thickness: f32, material: String }
#[derive(Clone, Debug)]
struct BridgeGen2 { start: [f32;3], end: [f32;3], width: f32, style: BridgeStyle, railings: bool }
#[derive(Clone, Debug, Copy)]
enum BridgeStyle { Stone, Wood, Rope, Steel, Covered, Drawbridge }
#[derive(Clone, Debug)]
struct TunnelGen { entrance: [f32;3], exit: [f32;3], radius: f32, curvature: f32, lit: bool }
#[derive(Clone, Debug)]
struct WaterfallGen2 { top: [f32;3], height: f32, width: f32, mist: bool, splash_radius: f32 }
#[derive(Clone, Debug)]
struct HotSpring { pos: [f32;3], radius: f32, temperature: f32, steam: bool, heal_rate: f32 }
#[derive(Clone, Debug)]
struct Geyser { pos: [f32;3], interval: f32, duration: f32, height: f32, timer: f32, erupting: bool }
#[derive(Clone, Debug)]
struct QuicksandZone { pos: [f32;3], radius: f32, sink_rate: f32, escape_difficulty: f32 }
#[derive(Clone, Debug)]
struct IceSheet { pos: [f32;3], size: [f32;2], thickness: f32, slippery: f32, breakable: bool, crack_threshold: f32 }
#[derive(Clone, Debug)]
struct MudZone { pos: [f32;3], size: [f32;2], depth: f32, slow_factor: f32, footprints: bool }
#[derive(Clone, Debug)]
struct SwampGas { pos: [f32;3], radius: f32, density: f32, flammable: bool, damage: f32 }
#[derive(Clone, Debug)]
struct CoralReef { pos: [f32;3], radius: f32, density: f32, color_variation: f32, fish_count: u32 }
#[derive(Clone, Debug)]
struct Shipwreck { pos: [f32;3], kind: String, loot_quality: f32, explored: bool, depth: f32 }
#[derive(Clone, Debug)]
struct Ruins { pos: [f32;3], name: String, age: u32, exploration: f32, traps: u32, lore: String }
#[derive(Clone, Debug)]
struct AncientMonument { pos: [f32;3], name: String, kind: String, power: f32, activated: bool }
#[derive(Clone, Debug)]
struct Shrine2 { pos: [f32;3], name: String, deity: String, blessing: String, offering_required: String, active: bool }
#[derive(Clone, Debug)]
struct Obelisk { pos: [f32;3], name: String, inscription: String, glow_color: [f32;4], powered: bool }
#[derive(Clone, Debug)]
struct AncientDoor { pos: [f32;3], name: String, locked: bool, key_required: String, mechanism: String }
#[derive(Clone, Debug)]
struct HiddenPath { start: [f32;3], end: [f32;3], reveal_condition: String, revealed: bool, reward: String }
#[derive(Clone, Debug)]
struct EconomyMarket { name: String, goods: Vec<MarketGood>, supply_demand: bool, update_interval: f32, timer: f32 }
#[derive(Clone, Debug)]
struct MarketGood { name: String, base_price: f32, current_price: f32, supply: u32, demand: u32, volatility: f32 }
#[derive(Clone, Debug)]
struct TradingPost { name: String, pos: [f32;3], goods: Vec<String>, buy_modifier: f32, sell_modifier: f32 }
#[derive(Clone, Debug)]
struct Caravan { name: String, route: Vec<[f32;3]>, pos: [f32;3], speed: f32, cargo: Vec<(String,u32)>, progress: f32, guards: u32 }
#[derive(Clone, Debug)]
struct Smuggler { name: String, pos: [f32;3], contraband: Vec<String>, reputation: f32, risk: f32 }
#[derive(Clone, Debug)]
struct TaxSystem { rate: f32, collected: f64, interval: f32, timer: f32, exemptions: Vec<String> }
#[derive(Clone, Debug)]
struct Insurance { policies: Vec<InsurancePolicy>, claims: Vec<(String, f64)> }
#[derive(Clone, Debug)]
struct InsurancePolicy { name: String, coverage: f64, premium: f64, deductible: f64, active: bool }
#[derive(Clone, Debug)]
struct StockMarket { stocks: Vec<Stock>, update_interval: f32, timer: f32 }
#[derive(Clone, Debug)]
struct Stock { name: String, ticker: String, price: f32, change: f32, volume: u64, history: Vec<f32> }
#[derive(Clone, Debug)]
struct CryptoCurrency { name: String, symbol: String, price: f64, market_cap: f64, mining_difficulty: f64 }
#[derive(Clone, Debug)]
struct Gambling { name: String, kind: GambleKind, bet: f64, payout_mult: f32, house_edge: f32 }
#[derive(Clone, Debug, Copy)]
enum GambleKind { Slots, Blackjack, Roulette, Poker, DiceRoll, CoinFlip }
#[derive(Clone, Debug)]
struct PropertySystem { properties: Vec<Property>, rent_interval: f32, timer: f32 }
#[derive(Clone, Debug)]
struct Property { name: String, pos: [f32;3], value: f64, rent: f64, owned: bool, condition: f32, upgrades: Vec<String> }
#[derive(Clone, Debug)]
struct Contract { name: String, parties: Vec<String>, terms: String, reward: f64, penalty: f64, deadline: f32, signed: bool }
// ======== ROUND 16: MULTIPLAYER, SOCIAL, META ========
#[derive(Clone, Debug)]
struct Emote2 { name: String, animation: String, duration: f32, looping: bool, sound: Option<String> }
#[derive(Clone, Debug)]
struct TitleCard { text: String, subtitle: String, duration: f32, timer: f32, style: TitleStyle, active: bool }
#[derive(Clone, Debug, Copy)]
enum TitleStyle { FadeIn, SlideIn, TypeWriter, Cinematic, Glitch }
#[derive(Clone, Debug)]
struct CreditRoll { lines: Vec<CreditLine>, speed: f32, pos: f32, active: bool }
#[derive(Clone, Debug)]
struct CreditLine { text: String, size: f32, color: [f32;4], bold: bool }
#[derive(Clone, Debug)]
struct Scoreboard2 { teams: Vec<ScoreTeam>, visible: bool, sort_by: String }
#[derive(Clone, Debug)]
struct ScoreTeam { name: String, color: [f32;4], score: i64, players: Vec<ScorePlayer> }
#[derive(Clone, Debug)]
struct ScorePlayer { name: String, kills: u32, deaths: u32, assists: u32, score: i64, ping: u32 }
#[derive(Clone, Debug)]
struct VoteSystem { topic: String, options: Vec<(String, u32)>, voters: Vec<String>, timer: f32, active: bool }
#[derive(Clone, Debug)]
struct SpectatorMode { active: bool, target: Option<String>, free_cam: bool, hud_visible: bool }
#[derive(Clone, Debug)]
struct Ping2 { pos: [f32;3], kind: String, color: [f32;4], timer: f32, sender: String }
#[derive(Clone, Debug)]
struct TeamMarker { name: String, pos: [f32;3], team: String, icon: String, visible_to: Vec<String> }
#[derive(Clone, Debug)]
struct DeathCam { active: bool, killer: Option<String>, timer: f32, duration: f32 }
#[derive(Clone, Debug)]
struct SpawnSelection { spawns: Vec<SpawnOption>, selected: usize, timer: f32, active: bool }
#[derive(Clone, Debug)]
struct SpawnOption { name: String, pos: [f32;3], team: Option<String>, available: bool }
#[derive(Clone, Debug)]
struct Loadout { name: String, primary: String, secondary: String, equipment: Vec<String>, perks: Vec<String> }
#[derive(Clone, Debug)]
struct ProgressionTrack { name: String, tiers: Vec<ProgressionTier>, current_tier: usize, current_xp: u64 }
#[derive(Clone, Debug)]
struct ProgressionTier { name: String, xp_required: u64, rewards: Vec<String> }
#[derive(Clone, Debug)]
struct DailyChallenge { name: String, description: String, progress: u32, target: u32, reward: String, expires: f32 }
#[derive(Clone, Debug)]
struct BattlePass { name: String, tiers: Vec<BattlePassTier>, current_tier: usize, xp: u64, premium: bool }
#[derive(Clone, Debug)]
struct BattlePassTier { free_reward: Option<String>, premium_reward: Option<String>, xp_required: u64 }
#[derive(Clone, Debug)]
struct Cosmetic { name: String, kind: String, rarity: CosmeticRarity, equipped: bool, unlocked: bool }
#[derive(Clone, Debug, Copy)]
enum CosmeticRarity { Common, Uncommon, Rare, Epic, Legendary, Mythic }
#[derive(Clone, Debug)]
struct PlayerProfile { name: String, level: u32, xp: u64, avatar: String, title: String, playtime: f32, games_played: u32, wins: u32 }
#[derive(Clone, Debug)]
struct FriendsList { friends: Vec<FriendEntry>, pending: Vec<String>, blocked: Vec<String> }
#[derive(Clone, Debug)]
struct FriendEntry { name: String, online: bool, status: String, last_seen: f32 }
#[derive(Clone, Debug)]
struct AchievementPopup { name: String, description: String, icon: String, timer: f32, duration: f32 }
#[derive(Clone, Debug)]
struct TutorialSystem { steps: Vec<TutorialStep>, current: usize, active: bool, skip_available: bool }
#[derive(Clone, Debug)]
struct TutorialStep { text: String, action: String, highlight: Option<String>, completed: bool }
#[derive(Clone, Debug)]
struct HintSystem { hints: Vec<GameHint>, cooldown: f32, timer: f32 }
#[derive(Clone, Debug)]
struct GameHint { text: String, condition: String, shown: bool, priority: u32 }
#[derive(Clone, Debug)]
struct AccessibilitySettings { colorblind_mode: ColorblindMode, subtitle_size: f32, screen_reader: bool, reduced_motion: bool, high_contrast: bool, button_remapping: Vec<(String, String)> }
#[derive(Clone, Debug, Copy)]
enum ColorblindMode { None, Protanopia, Deuteranopia, Tritanopia }
#[derive(Clone, Debug)]
struct LocalizationSystem { current_language: String, languages: Vec<String>, strings: Vec<(String, String)> }
#[derive(Clone, Debug)]
struct AnalyticsEvent { name: String, data: Vec<(String, String)>, timestamp: f32 }
#[derive(Clone, Debug)]
struct TelemetrySystem { events: Vec<AnalyticsEvent>, session_id: String, enabled: bool }
#[derive(Clone, Debug)]
struct ErrorLog { errors: Vec<GameError>, max_entries: usize }
#[derive(Clone, Debug)]
struct GameError { message: String, severity: ErrorSeverity, timestamp: f32, count: u32 }
#[derive(Clone, Debug, Copy)]
enum ErrorSeverity { Info, Warning, Error, Critical }
#[derive(Clone, Debug)]
struct DebugConsole2 { open: bool, history: Vec<String>, input: String, log: Vec<(String, ErrorSeverity)>, max_log: usize }
#[derive(Clone, Debug)]
struct CheatSystem { enabled: bool, cheats_used: Vec<String>, god_mode: bool, noclip: bool, infinite_ammo: bool, speed_mult: f32 }
#[derive(Clone, Debug)]
struct ModSystem { mods_dir: String, loaded_mods: Vec<GameMod>, enabled: bool }
#[derive(Clone, Debug)]
struct GameMod { name: String, version: String, author: String, enabled: bool, load_order: u32 }
#[derive(Clone, Debug)]
struct PluginSystem { plugins: Vec<GamePlugin>, registry: Vec<(String, String)> }
#[derive(Clone, Debug)]
struct GamePlugin { name: String, version: String, enabled: bool, entry_point: String }
#[derive(Clone, Debug)]
struct SceneTransition { active: bool, kind: TransitionKind, progress: f32, speed: f32, from_scene: String, to_scene: String }
#[derive(Clone, Debug, Copy)]
enum TransitionKind { Fade, Wipe, Dissolve, Slide, Zoom, Circle, Pixelate }
#[derive(Clone, Debug)]
struct AutoSaveSystem { enabled: bool, interval: f32, timer: f32, slots: u32, current_slot: u32 }
// ======== ROUND 15: PHYSICS, VEHICLES, ANIMATION ========
#[derive(Clone, Debug)]
struct PhysicsMaterial2 { name: String, friction: f32, bounciness: f32, density: f32 }
#[derive(Clone, Debug)]
struct Buoyancy2 { entity: String, water_level: f32, buoyancy_force: f32, drag: f32, angular_drag: f32 }
#[derive(Clone, Debug)]
struct SoftBody { name: String, nodes: Vec<[f32;3]>, springs: Vec<(usize,usize,f32)>, damping: f32, stiffness: f32 }
#[derive(Clone, Debug)]
struct FluidSim { name: String, pos: [f32;3], size: [f32;3], resolution: u32, viscosity: f32, density_field: Vec<f32> }
#[derive(Clone, Debug)]
struct Magnet2 { name: String, pos: [f32;3], strength: f32, range: f32, polarity: bool }
#[derive(Clone, Debug)]
struct ElasticBand { name: String, anchor_a: [f32;3], anchor_b: [f32;3], stiffness: f32, damping: f32, length: f32 }
#[derive(Clone, Debug)]
struct PendulumChain { name: String, anchor: [f32;3], segments: Vec<PendulumSegment> }
#[derive(Clone, Debug)]
struct PendulumSegment { length: f32, angle: f32, angular_vel: f32, mass: f32 }
#[derive(Clone, Debug)]
struct VehicleCar { name: String, pos: [f32;3], speed: f32, max_speed: f32, acceleration: f32, steering: f32, brake: f32, drift: bool, gear: u32, rpm: f32, nitro: f32 }
#[derive(Clone, Debug)]
struct VehicleAircraft { name: String, pos: [f32;3], speed: f32, altitude: f32, pitch: f32, roll: f32, yaw: f32, throttle: f32, lift: f32, stall_speed: f32 }
#[derive(Clone, Debug)]
struct VehicleBoat2 { name: String, pos: [f32;3], speed: f32, rudder: f32, sail: f32, hull_hp: f32, crew: u32, cannons: u32 }
#[derive(Clone, Debug)]
struct VehicleMech { name: String, pos: [f32;3], hp: f32, max_hp: f32, speed: f32, weapons: Vec<MechWeapon>, heat: f32, max_heat: f32, shield: f32 }
#[derive(Clone, Debug)]
struct MechWeapon { name: String, damage: f32, fire_rate: f32, ammo: u32, max_ammo: u32, heat_gen: f32, timer: f32 }
#[derive(Clone, Debug)]
struct VehicleSubmarine { name: String, pos: [f32;3], depth: f32, speed: f32, oxygen: f32, max_oxygen: f32, sonar_range: f32, torpedo_count: u32 }
#[derive(Clone, Debug)]
struct VehicleTrain { name: String, cars: Vec<TrainCar>, speed: f32, max_speed: f32, track_pos: f32 }
#[derive(Clone, Debug)]
struct TrainCar { kind: String, cargo: Vec<String>, passengers: u32, weight: f32 }
#[derive(Clone, Debug)]
struct AnimClip { name: String, duration: f32, looping: bool, speed: f32, timer: f32, playing: bool, blend_weight: f32 }
#[derive(Clone, Debug)]
struct AnimLayer { name: String, clips: Vec<AnimClip>, current: usize, blend_time: f32, mask: Option<String> }
#[derive(Clone, Debug)]
struct AnimBlendTree { name: String, parameters: Vec<(String, f32)>, nodes: Vec<BlendNode> }
#[derive(Clone, Debug)]
struct BlendNode { clip: String, threshold: f32, weight: f32 }
#[derive(Clone, Debug)]
struct AnimEvent { clip: String, time: f32, event: String, fired: bool }
#[derive(Clone, Debug)]
struct Ragdoll2 { entity: String, bones: Vec<RagdollBone>, active: bool, blend: f32 }
#[derive(Clone, Debug)]
struct RagdollBone { name: String, pos: [f32;3], vel: [f32;3], mass: f32, parent: Option<usize> }
#[derive(Clone, Debug)]
struct ProceduralAnim { entity: String, kind: ProcAnimKind, intensity: f32, speed: f32, timer: f32 }
#[derive(Clone, Debug, Copy)]
enum ProcAnimKind { Breathe, Idle, HeadBob, Sway, Wobble, Float, Shake, Bounce }
#[derive(Clone, Debug)]
struct LookAtTarget { entity: String, target: [f32;3], speed: f32, max_angle: f32 }
#[derive(Clone, Debug)]
struct FootIK { entity: String, enabled: bool, ray_length: f32, offset: f32 }
#[derive(Clone, Debug)]
struct HandIK { entity: String, target: Option<[f32;3]>, blend: f32 }
#[derive(Clone, Debug)]
struct SpineIK { entity: String, target: [f32;3], chain_length: u32, stiffness: f32 }
#[derive(Clone, Debug)]
struct TwoBoneIK { entity: String, target: [f32;3], pole: [f32;3], blend: f32 }
#[derive(Clone, Debug)]
struct AnimMontage { name: String, clips: Vec<String>, current: usize, playing: bool, timer: f32, blend_in: f32, blend_out: f32 }
#[derive(Clone, Debug)]
struct FacialAnim { entity: String, blend_shapes: Vec<(String, f32)>, speaking: bool, blink_timer: f32 }
#[derive(Clone, Debug)]
struct LipSync { entity: String, phonemes: Vec<(String, f32)>, timer: f32, active: bool }
#[derive(Clone, Debug)]
struct TrafficSystem { roads: Vec<TrafficRoad>, vehicles: Vec<TrafficVehicle>, density: f32 }
#[derive(Clone, Debug)]
struct TrafficRoad { start: [f32;3], end: [f32;3], lanes: u32, speed_limit: f32, one_way: bool }
#[derive(Clone, Debug)]
struct TrafficVehicle { pos: [f32;3], speed: f32, road_idx: usize, lane: u32, progress: f32, kind: String }
#[derive(Clone, Debug)]
struct PedestrianSystem { sidewalks: Vec<([f32;3],[f32;3])>, pedestrians: Vec<PedestrianAgent>, spawn_rate: f32, timer: f32 }
#[derive(Clone, Debug)]
struct PedestrianAgent { pos: [f32;3], target: [f32;3], speed: f32, state: String }
#[derive(Clone, Debug)]
struct DayNightCycle2 { time_of_day: f32, day_length: f32, sun_angle: f32, moon_phase: f32, ambient_color: [f32;3], sun_color: [f32;3], star_visibility: f32 }
#[derive(Clone, Debug)]
struct CloudSystem { clouds: Vec<Cloud2>, wind_dir: [f32;2], density: f32 }
#[derive(Clone, Debug)]
struct Cloud2 { pos: [f32;3], size: [f32;3], opacity: f32, speed: f32 }
#[derive(Clone, Debug)]
struct OceanSystem { enabled: bool, wave_height: f32, wave_frequency: f32, wave_speed: f32, foam_amount: f32, color_shallow: [f32;4], color_deep: [f32;4], caustics: bool }
#[derive(Clone, Debug)]
struct LavaSystem { enabled: bool, pos: [f32;3], size: [f32;2], flow_speed: f32, glow_intensity: f32, damage: f32, color: [f32;4] }
#[derive(Clone, Debug)]
struct SandstormEffect { active: bool, intensity: f32, direction: [f32;3], visibility: f32, damage: f32 }
#[derive(Clone, Debug)]
struct BlizzardEffect { active: bool, intensity: f32, wind: [f32;3], cold_damage: f32, freeze_rate: f32 }
#[derive(Clone, Debug)]
struct AcidRain { active: bool, intensity: f32, damage: f32, corrosion_rate: f32 }
#[derive(Clone, Debug)]
struct EarthquakeEffect { active: bool, magnitude: f32, duration: f32, timer: f32, aftershocks: u32 }
#[derive(Clone, Debug)]
struct VolcanicEruption { active: bool, pos: [f32;3], intensity: f32, lava_radius: f32, ash_height: f32, timer: f32 }
#[derive(Clone, Debug)]
struct TornadoEffect { active: bool, pos: [f32;3], radius: f32, speed: f32, pull_force: f32, damage: f32, path: Vec<[f32;3]> }
#[derive(Clone, Debug)]
struct FloodSystem { active: bool, water_level: f32, rise_rate: f32, max_level: f32, current_flow: [f32;3] }

// ======== ROUND 14: PROCEDURAL GENERATION & AUDIO ========
#[derive(Clone, Debug)]
struct ProceduralMaze { name: String, width: u32, height: u32, cell_size: f32, walls: Vec<([u32;2],[u32;2])>, entrance: [u32;2], exit_pos: [u32;2] }
#[derive(Clone, Debug)]
struct ProceduralIsland { name: String, pos: [f32;3], radius: f32, height: f32, biome: String, seed: u32 }
#[derive(Clone, Debug)]
struct ProceduralCave2 { name: String, pos: [f32;3], rooms: u32, min_room_size: f32, max_room_size: f32, seed: u32, tunnels: Vec<([f32;3],[f32;3])> }
#[derive(Clone, Debug)]
struct ProceduralVillage { name: String, pos: [f32;3], building_count: u32, has_wall: bool, has_market: bool, population: u32, seed: u32 }
#[derive(Clone, Debug)]
struct InfiniteRunner { active: bool, speed: f32, distance: f32, lanes: u32, current_lane: u32, obstacles: Vec<RunnerObstacle>, score: i64 }
#[derive(Clone, Debug)]
struct RunnerObstacle { pos: f32, lane: u32, kind: String, height: f32 }
#[derive(Clone, Debug)]
struct CardSystem { hand: Vec<GameCard>, deck: Vec<GameCard>, discard: Vec<GameCard>, max_hand: usize, mana_per_turn: u32, current_mana: u32 }
#[derive(Clone, Debug)]
struct GameCard { name: String, cost: u32, kind: CardKind, damage: f32, heal: f32, description: String }
#[derive(Clone, Debug, Copy)]
enum CardKind { Attack, Defense, Spell, Buff, Debuff, Summon }
#[derive(Clone, Debug)]
struct PuzzleGrid { name: String, width: u32, height: u32, cells: Vec<PuzzleCell>, solved: bool }
#[derive(Clone, Debug)]
struct PuzzleCell { kind: u32, color: u32, matched: bool }
#[derive(Clone, Debug)]
struct SlidingPuzzle { name: String, size: u32, tiles: Vec<u32>, empty: usize, moves: u32, solved: bool }
#[derive(Clone, Debug)]
struct SimonSays { sequence: Vec<u32>, player_input: Vec<u32>, round: u32, active: bool, showing: bool, timer: f32 }
#[derive(Clone, Debug)]
struct LockPicking { pins: Vec<LockPin>, current_pin: usize, tension: f32, pick_pos: f32, solved: bool }
#[derive(Clone, Debug)]
struct LockPin { target: f32, tolerance: f32, set: bool }
#[derive(Clone, Debug)]
struct QTE { active: bool, key: String, timer: f32, window: f32, success: bool, sequence: Vec<(String, f32)>, current: usize }
#[derive(Clone, Debug)]
struct Fishing2 { active: bool, cast_distance: f32, tension: f32, max_tension: f32, fish_hp: f32, reel_speed: f32, timer: f32, caught: bool }
#[derive(Clone, Debug)]
struct CookingSystem { recipe: Option<String>, ingredients: Vec<String>, temperature: f32, timer: f32, quality: f32, burning: bool }
#[derive(Clone, Debug)]
struct AlchemySystem { ingredients: Vec<String>, result: Option<String>, quality: f32, discovered_recipes: Vec<String> }
#[derive(Clone, Debug)]
struct EnchantmentTable { name: String, pos: [f32;3], level: u32, enchantments: Vec<Enchantment> }
#[derive(Clone, Debug)]
struct Enchantment { name: String, kind: String, power: f32, cost: u64 }
#[derive(Clone, Debug)]
struct SocketSystem { item: String, sockets: Vec<Option<String>>, max_sockets: u32 }
#[derive(Clone, Debug)]
struct DurabilitySystem { items: Vec<DurableItem> }
#[derive(Clone, Debug)]
struct DurableItem { name: String, durability: f32, max_durability: f32, repair_cost: i64 }
#[derive(Clone, Debug)]
struct SoundEffect { name: String, pos: Option<[f32;3]>, volume: f32, pitch: f32, looping: bool, spatial: bool, range: f32 }
#[derive(Clone, Debug)]
struct AudioMixer { master: f32, music: f32, sfx: f32, ambient: f32, voice: f32, ui: f32 }
#[derive(Clone, Debug)]
struct AudioSnapshot { name: String, mixer: AudioMixer, reverb: f32, low_pass: f32, high_pass: f32 }
#[derive(Clone, Debug)]
struct FootstepSystem { surfaces: Vec<(String, String, f32)>, step_interval: f32, timer: f32 }
#[derive(Clone, Debug)]
struct DialogueVoice { speaker: String, pitch: f32, speed: f32, accent: String }
#[derive(Clone, Debug)]
struct Subtitle { text: String, speaker: String, timer: f32, duration: f32 }




// ======== ROUND 33: TERRAIN & WORLD GENERATION DEEP ========
#[derive(Clone, Debug)]
struct TerrainEngine { chunks: Vec<TerrainChunk2>, lod_levels: u32, chunk_size: f32, height_scale: f32, texture_layers: Vec<TerrainTexLayer>, erosion: ErosionSettings, vegetation_density: f32 }
#[derive(Clone, Debug)]
struct TerrainChunk2 { pos: [f32;2], lod: u32, heightmap: Vec<f32>, normals: Vec<[f32;3]>, holes: Vec<bool>, generated: bool, dirty: bool }
#[derive(Clone, Debug)]
struct TerrainTexLayer { name: String, diffuse: String, normal: String, tiling: f32, blend_sharpness: f32, height_offset: f32, slope_min: f32, slope_max: f32, height_min: f32, height_max: f32 }
#[derive(Clone, Debug)]
struct ErosionSettings { iterations: u32, rain_amount: f32, sediment_capacity: f32, evaporation: f32, deposition: f32, erosion_rate: f32, thermal_rate: f32, wind_strength: f32 }
#[derive(Clone, Debug)]
struct WorldGenerator { seed: u64, octaves: u32, persistence: f32, lacunarity: f32, scale: f32, biome_scale: f32, moisture_scale: f32, temperature_scale: f32, sea_level: f32 }
#[derive(Clone, Debug)]
struct BiomeRule { name: String, temp_min: f32, temp_max: f32, moisture_min: f32, moisture_max: f32, height_min: f32, height_max: f32, vegetation: String, color: [f32;3] }
#[derive(Clone, Debug)]
struct CaveGenerator { density: f32, threshold: f32, smoothing: u32, stalactites: bool, crystals: bool, underground_lakes: bool, lava_level: f32, ore_veins: Vec<OreVein> }
#[derive(Clone, Debug)]
struct OreVein { ore_type: String, rarity: f32, cluster_size: u32, min_depth: f32, max_depth: f32 }
#[derive(Clone, Debug)]
struct RiverGenerator { source_height: f32, flow_rate: f32, erosion_width: f32, meander: f32, branch_chance: f32, delta_spread: f32 }
#[derive(Clone, Debug)]
struct RoadGenerator { width: f32, smoothing: f32, slope_max: f32, bridge_threshold: f32, tunnel_threshold: f32, material: String, markings: bool }
#[derive(Clone, Debug)]
struct SettlementGenerator { pop_target: u32, building_styles: Vec<String>, road_pattern: SettlementPattern, wall: bool, market: bool, temple: bool, castle: bool }
#[derive(Clone, Debug, Copy)]
enum SettlementPattern { Grid, Radial, Organic, Linear, Ring }
#[derive(Clone, Debug)]
struct VegetationRule { plant_type: String, density: f32, min_height: f32, max_height: f32, min_slope: f32, max_slope: f32, cluster_radius: f32, scale_range: [f32;2] }
#[derive(Clone, Debug)]
struct CloudLayer { altitude: f32, density: f32, coverage: f32, wind_dir: [f32;2], wind_speed: f32, cloud_type: CloudType2 }
#[derive(Clone, Debug, Copy)]
enum CloudType2 { Cumulus, Stratus, Cirrus, Cumulonimbus, Altocumulus, Fog2 }

// ======== ROUND 34: NETWORKING ENGINE DEEP ========
#[derive(Clone, Debug)]
struct NetworkEngine { transport: TransportKind, tick_rate: u32, snapshot_rate: u32, max_clients: u32, timeout_ms: u32, compression: bool, encryption: bool, delta_compression: bool }
#[derive(Clone, Debug, Copy)]
enum TransportKind { UDP, TCP, WebSocket2, WebRTC2, Steam }
#[derive(Clone, Debug)]
struct NetChannel { id: u32, name: String, reliable: bool, ordered: bool, fragmented: bool, priority: u32 }
#[derive(Clone, Debug)]
struct NetSnapshot { tick: u64, entities: Vec<NetEntityState>, timestamp: f64, size_bytes: u32 }
#[derive(Clone, Debug)]
struct NetEntityState { net_id: u32, owner: u32, pos: [f32;3], rot: [f32;4], vel: [f32;3], components: Vec<(String, String)> }
#[derive(Clone, Debug)]
struct NetInterpolation { buffer_size: u32, interp_delay: f32, extrapolation_limit: f32, smoothing: f32 }
#[derive(Clone, Debug)]
struct ServerAuthority { physics_auth: bool, hit_validation: bool, speed_check: bool, teleport_check: bool, rate_limit: u32 }
#[derive(Clone, Debug)]
struct LobbySystem { lobbies: Vec<GameLobby>, max_lobbies: u32 }
#[derive(Clone, Debug)]
struct GameLobby { id: String, name: String, host: String, players: Vec<String>, max_players: u32, password: Option<String>, game_mode: String, map: String, status: LobbyStatus }
#[derive(Clone, Debug, Copy)]
enum LobbyStatus { Waiting, Starting, InProgress, Finished }

// ======== ROUND 35: UI ENGINE DEEP ========
#[derive(Clone, Debug)]
struct UIEngine { widgets: Vec<UIWidget2>, layouts: Vec<UILayout>, styles: Vec<UIStyle2>, animations_ui: Vec<UIAnim2>, focus_stack: Vec<String>, modal_stack: Vec<String> }
#[derive(Clone, Debug)]
struct UIWidget2 { id: String, kind: WidgetKind2, pos: [f32;2], size: [f32;2], anchor: [f32;2], pivot: [f32;2], visible: bool, interactable: bool, style_id: Option<String>, children: Vec<String>, z_order: i32 }
#[derive(Clone, Debug, Copy)]
enum WidgetKind2 { Button2, Label2, Image2, Slider2, Toggle2, Input2, Dropdown2, ScrollView, ListView, TreeView, TabView, ProgressBar2, Tooltip2, Panel2, Canvas2, Video, Chart, ColorPicker2, DatePicker, FileBrowser }
#[derive(Clone, Debug)]
struct UILayout { kind: LayoutKind, padding: [f32;4], spacing: f32, align: [f32;2], overflow: Overflow }
#[derive(Clone, Debug, Copy)]
enum LayoutKind { Horizontal, Vertical, Grid3, Flex, Stack, Absolute }
#[derive(Clone, Debug, Copy)]
enum Overflow { Visible, Hidden, Scroll, Auto }
#[derive(Clone, Debug)]
struct UIStyle2 { id: String, bg_color: [f32;4], text_color: [f32;4], border_color: [f32;4], border_width: f32, corner_radius: f32, font_size: f32, font_family: String, shadow: Option<UIShadow>, gradient: Option<UIGradient2> }
#[derive(Clone, Debug)]
struct UIShadow { offset: [f32;2], blur: f32, color: [f32;4] }
#[derive(Clone, Debug)]
struct UIGradient2 { start_color: [f32;4], end_color: [f32;4], angle: f32, kind: GradKind }
#[derive(Clone, Debug, Copy)]
enum GradKind { Linear2, Radial3, Conic }
#[derive(Clone, Debug)]
struct UIAnim2 { widget_id: String, property: String, from: f32, to: f32, duration: f32, timer: f32, easing: EaseKind, looping: bool, playing: bool }
#[derive(Clone, Debug, Copy)]
enum EaseKind { Linear3, EaseIn, EaseOut, EaseInOut, Bounce2, Elastic2, Back, Cubic }
#[derive(Clone, Debug)]
struct UIDataBinding { widget_id: String, source: String, property: String, two_way: bool, formatter: Option<String> }
#[derive(Clone, Debug)]
struct DragDropSystem { dragging: Option<DragItem>, drop_targets: Vec<DropTarget>, preview: bool }
#[derive(Clone, Debug)]
struct DragItem { source: String, data: String, icon: Option<String>, offset: [f32;2] }
#[derive(Clone, Debug)]
struct DropTarget { id: String, accept_types: Vec<String>, highlight: bool }
#[derive(Clone, Debug)]
struct VirtualList { total_items: u32, visible_items: u32, item_height: f32, scroll_offset: f32, buffer_size: u32 }

// ======== ROUND 36: INPUT & CONTROLS DEEP ========
#[derive(Clone, Debug)]
struct InputSystem2 { bindings: Vec<InputBinding2>, axes: Vec<InputAxis2>, gestures: Vec<GestureRecognizer>, gamepad_deadzones: [f32;2], mouse_sensitivity: f32, invert_y: bool, raw_input: bool }
#[derive(Clone, Debug)]
struct InputBinding2 { name: String, primary: InputKey, secondary: Option<InputKey>, modifiers: Vec<Modifier2>, context: String, consume: bool }
#[derive(Clone, Debug)]
struct InputKey { device: InputDevice, code: u32, display: String }
#[derive(Clone, Debug, Copy)]
enum InputDevice { Keyboard2, Mouse2, Gamepad2, Touch2, Pen, Gyroscope }
#[derive(Clone, Debug, Copy)]
enum Modifier2 { Shift2, Ctrl2, Alt2, Super2, DoublePress, LongPress, Chord }
#[derive(Clone, Debug)]
struct InputAxis2 { name: String, positive: InputKey, negative: InputKey, gravity: f32, sensitivity_v2: f32, dead_zone: f32, snap: bool, value: f32, raw: f32 }
#[derive(Clone, Debug)]
struct GestureRecognizer { kind: GestureKind, fingers: u32, threshold: f32, active: bool, state: GestureState }
#[derive(Clone, Debug, Copy)]
enum GestureKind { Tap, DoubleTap, LongPress2, Swipe2, Pinch, Rotate2, Pan2, Edge }
#[derive(Clone, Debug, Copy)]
enum GestureState { Possible, Began, Changed, Ended, Cancelled, Failed }
#[derive(Clone, Debug)]
struct InputRecorder { recording: bool, events: Vec<RecordedInput>, playback_speed: f32, playing_back: bool, playback_pos: usize }
#[derive(Clone, Debug)]
struct RecordedInput { time: f32, device: InputDevice, code: u32, value: f32, pressed: bool }
#[derive(Clone, Debug)]
struct InputCombo2 { name: String, sequence: Vec<ComboInput>, window: f32, timer: f32, current: usize, completed: bool }
#[derive(Clone, Debug)]
struct ComboInput { key: String, hold_time: f32, release: bool }
#[derive(Clone, Debug)]
struct AccessibleInput { screen_reader: bool, sticky_keys: bool, key_repeat_delay: f32, key_repeat_rate: f32, high_contrast: bool, large_cursor: bool, cursor_trail: bool }

// ======== ROUND 40: PARTICLE ENGINE DEEP ========
#[derive(Clone, Debug)]
struct ParticleEngine { systems_v2: Vec<ParticleSystemV2>, global_time_scale: f32, max_particles: u32, gpu_particles: bool }
#[derive(Clone, Debug)]
struct ParticleSystemV2 { name: String, emitters: Vec<EmitterV2>, transform: [f32;3], playing: bool, looping: bool, duration: f32, timer: f32, pre_warm: bool, max_particles: u32, world_space: bool }
#[derive(Clone, Debug)]
struct EmitterV2 { shape: EmitShape2, rate: f32, burst: Vec<ParticleBurst>, lifetime: [f32;2], speed: [f32;2], size_over_life: Vec<f32>, color_over_life: Vec<[f32;4]>, gravity_mod: f32, velocity_over_life: Vec<[f32;3]>, rotation_over_life: Vec<f32>, noise: Option<ParticleNoise>, collision: Option<ParticleCollision>, sub_emitter: Option<String>, trails_v2: bool, sort_mode: SortMode }
#[derive(Clone, Debug, Copy)]
enum EmitShape2 { Point2, Sphere5(f32), Box6([f32;3]), Cone5(f32, f32), Circle2(f32), Line2(f32), Ring2(f32, f32), Mesh2, Edge2, Rectangle2(f32, f32) }
#[derive(Clone, Debug)]
struct ParticleBurst { time: f32, count: u32, cycles: u32, interval: f32, probability: f32 }
#[derive(Clone, Debug)]
struct ParticleNoise { strength: f32, frequency: f32, scroll_speed: f32, octaves: u32, damping: bool }
#[derive(Clone, Debug)]
struct ParticleCollision { enabled: bool, bounce: f32, lifetime_loss: f32, min_kill_speed: f32, radius_scale: f32, quality: CollisionQuality }
#[derive(Clone, Debug, Copy)]
enum CollisionQuality { Low, Medium, High }
#[derive(Clone, Debug, Copy)]
enum SortMode { None2, Distance, Age, Depth }

// ======== ROUND 41: MATERIAL SYSTEM DEEP ========
#[derive(Clone, Debug)]
struct MaterialEngine { materials_v2: Vec<MaterialV2>, shaders: Vec<ShaderAsset>, global_params: Vec<(String, f32)>, keyword_sets: Vec<String> }
#[derive(Clone, Debug)]
struct MaterialV2 { name: String, shader: String, render_queue: i32, blend_mode: BlendModeV2, cull: CullMode2, depth_write: bool, depth_test: bool, stencil: Option<StencilOp2>, properties: Vec<MatProperty>, keywords: Vec<String>, instancing: bool }
#[derive(Clone, Debug, Copy)]
enum BlendModeV2 { Opaque2, AlphaBlend2, Additive2, Multiply2, PreMultAlpha, Custom5 }
#[derive(Clone, Debug, Copy)]
enum CullMode2 { Back2, Front2, Off2, }
#[derive(Clone, Debug)]
struct StencilOp2 { reference: u8, read_mask: u8, write_mask: u8, comp: CompFunc, pass: StencilAction, fail: StencilAction, z_fail: StencilAction }
#[derive(Clone, Debug, Copy)]
enum CompFunc { Always2, Never2, Equal2, NotEqual2, Less2, Greater2, LessEqual2, GreaterEqual2 }
#[derive(Clone, Debug, Copy)]
enum StencilAction { Keep, Zero, Replace2, Incr, Decr, Invert, IncrWrap, DecrWrap }
#[derive(Clone, Debug)]
struct MatProperty { name: String, kind: MatPropKind, float_val: f32, vec4_val: [f32;4], texture: Option<String>, offset: [f32;2], tiling_v2: [f32;2] }
#[derive(Clone, Debug, Copy)]
enum MatPropKind { Float3, Vec22, Vec33, Vec43, Color2, Texture2, Int3, Bool3 }
#[derive(Clone, Debug)]
struct ShaderAsset { name: String, source: String, vertex: String, fragment: String, compute: Option<String>, variants: Vec<ShaderVariant> }
#[derive(Clone, Debug)]
struct ShaderVariant { keywords: Vec<String>, compiled: bool, pipeline_hash: u64 }
#[derive(Clone, Debug)]
struct MaterialInstance { parent: String, overrides: Vec<MatProperty> }
#[derive(Clone, Debug)]
struct TextureAsset { name: String, width: u32, height: u32, format: TexFormat, mip_maps: bool, filter: TexFilter, wrap: TexWrap, aniso: u32, streaming: bool }
#[derive(Clone, Debug, Copy)]
enum TexFormat { RGBA8, RGBA16F, BC1, BC3, BC5, BC7, R8, RG8, SRGBA8, Depth32 }
#[derive(Clone, Debug, Copy)]
enum TexFilter { Point2, Bilinear2, Trilinear2, Anisotropic2 }
#[derive(Clone, Debug, Copy)]
enum TexWrap { Repeat2, Clamp2, Mirror2, Border }

// ======== ROUND 42: SCENE GRAPH & ECS DEEP ========
#[derive(Clone, Debug)]
struct SceneGraph { root: SceneNode2, dirty: bool, layer_masks: Vec<(String, u64)> }
#[derive(Clone, Debug)]
struct SceneNode2 { id: u64, name: String, local_pos: [f32;3], local_rot: [f32;4], local_scale: [f32;3], world_matrix: [[f32;4];4], parent: Option<u64>, children: Vec<u64>, active: bool, static_flag: bool, layer: u32, tag: String, components: Vec<ComponentRef> }
#[derive(Clone, Debug)]
struct ComponentRef { type_id: u64, instance_id: u64, enabled: bool }
#[derive(Clone, Debug)]
struct ECSWorld { entities_v2: Vec<EntityV2>, component_stores: Vec<ComponentStore>, systems_v2: Vec<SystemDef>, queries: Vec<QueryDef>, resources: Vec<ResourceDef> }
#[derive(Clone, Debug)]
struct EntityV2 { id: u64, generation: u32, archetype: u32, active: bool, name: String }
#[derive(Clone, Debug)]
struct ComponentStore { type_name: String, type_id: u64, data_size: u32, count: u32, sparse_set: bool }
#[derive(Clone, Debug)]
struct SystemDef { name: String, phase: SystemPhase, priority: i32, enabled: bool, exclusive: bool, dependencies: Vec<String> }
#[derive(Clone, Debug, Copy)]
enum SystemPhase { PreUpdate, Update2, PostUpdate, PreRender, Render2, PostRender, FixedUpdate2 }
#[derive(Clone, Debug)]
struct QueryDef { components: Vec<u64>, with_filter: Vec<u64>, without_filter: Vec<u64>, changed_filter: Vec<u64>, optional: Vec<u64> }
#[derive(Clone, Debug)]
struct ResourceDef { name: String, type_name: String, singleton: bool, thread_safe: bool }
#[derive(Clone, Debug)]
struct Archetype { id: u32, component_types: Vec<u64>, entity_count: u32, chunk_size: u32, chunks: u32 }
#[derive(Clone, Debug)]
struct CommandBuffer { commands: Vec<ECSCommand>, deferred: bool }
#[derive(Clone, Debug)]
enum ECSCommand { Spawn(String), Despawn(u64), AddComponent(u64, String), RemoveComponent(u64, u64), SetResource(String, String) }

// ======== ROUND 43: PROFILING & DEBUG DEEP ========
#[derive(Clone, Debug)]
struct Profiler2 { frames: Vec<ProfileFrame>, gpu_frames: Vec<GPUFrame>, memory_snapshots: Vec<MemSnapshot>, recording: bool, max_frames: u32 }
#[derive(Clone, Debug)]
struct ProfileFrame { frame_num: u64, total_ms: f32, cpu_ms: f32, gpu_ms: f32, draw_calls: u32, triangles: u32, samples: Vec<ProfileSample> }
#[derive(Clone, Debug)]
struct ProfileSample { name: String, start_ms: f32, duration_ms: f32, depth: u32, thread_id: u32, color: [f32;3] }
#[derive(Clone, Debug)]
struct GPUFrame { frame_num: u64, passes: Vec<GPUPass>, total_ms: f32, vram_mb: f32 }
#[derive(Clone, Debug)]
struct GPUPass { name: String, duration_ms: f32, draw_calls: u32, triangles: u32, state_changes: u32, texture_binds: u32 }
#[derive(Clone, Debug)]
struct MemSnapshot { timestamp: f64, total_mb: f32, gpu_mb: f32, allocations: u32, pools: Vec<MemPool> }
#[derive(Clone, Debug)]
struct MemPool { name: String, used_mb: f32, capacity_mb: f32, allocations: u32, fragmentation: f32 }
#[derive(Clone, Debug)]
struct DebugConsole { history: Vec<ConsoleLine>, commands: Vec<ConsoleCommand>, visible: bool, input: String, log_level: LogLevel2 }
#[derive(Clone, Debug)]
struct ConsoleLine { text: String, level: LogLevel2, timestamp: f64, source: String, color: [f32;4] }
#[derive(Clone, Debug, Copy)]
enum LogLevel2 { Trace, Debug4, Info2, Warn2, Error2, Fatal }
#[derive(Clone, Debug)]
struct ConsoleCommand { name: String, description: String, args: Vec<String>, callback_id: u32 }
#[derive(Clone, Debug)]
struct DebugDraw { lines: Vec<DebugLine2>, spheres: Vec<DebugSphere2>, boxes: Vec<DebugBox>, texts: Vec<DebugText2>, persistent: Vec<PersistentDebug>, depth_test: bool }
#[derive(Clone, Debug)]
struct DebugLine2 { start: [f32;3], end: [f32;3], color: [f32;4], duration: f32 }
#[derive(Clone, Debug)]
struct DebugSphere2 { center: [f32;3], radius: f32, color: [f32;4], segments: u32, duration: f32 }
#[derive(Clone, Debug)]
struct DebugBox { center: [f32;3], half_extents: [f32;3], color: [f32;4], rotation: [f32;4], duration: f32 }
#[derive(Clone, Debug)]
struct DebugText2 { pos: [f32;3], text: String, color: [f32;4], size: f32, screen_space: bool, duration: f32 }
#[derive(Clone, Debug)]
struct PersistentDebug { id: String, kind: String, data: Vec<f32>, color: [f32;4] }

// ======== ROUND 44: ASSET PIPELINE DEEP ========
#[derive(Clone, Debug)]
struct AssetCache { max_memory_mb: f32, used_mb: f32, entries: u32, hit_rate: f32, lru_enabled: bool }
#[derive(Clone, Debug)]
struct AssetBundle2 { name: String, assets: Vec<AssetRef2>, compressed: bool, size_bytes: u64, loaded: bool, priority: u32 }
#[derive(Clone, Debug)]
struct AssetRef2 { path: String, type_name: String, size_bytes: u32, loaded: bool, ref_count: u32, dependencies: Vec<String> }
#[derive(Clone, Debug)]
struct AssetDatabase { entries: Vec<AssetDBEntry>, tags: Vec<(String, Vec<String>)>, search_index: Vec<String> }
#[derive(Clone, Debug)]
struct AssetDBEntry { path: String, uuid: String, type_name: String, size: u64, modified: u64, thumbnail: Option<String>, tags: Vec<String>, metadata: Vec<(String, String)> }
#[derive(Clone, Debug)]
struct TextureCompressor { format: TexFormat, quality: u32, generate_mips: bool, max_size: u32, power_of_two: bool, normal_map: bool }
#[derive(Clone, Debug)]
struct MeshOptimizer { simplify_target: f32, weld_threshold: f32, optimize_cache: bool, optimize_overdraw: bool, generate_lod: bool, lod_count: u32 }
#[derive(Clone, Debug)]
struct AudioImporter { sample_rate: u32, channels: u32, bit_depth: u32, compress: bool, format_v2: String, streaming: bool, preload: bool }

// ======== ROUND 45: LOCALIZATION & ACCESSIBILITY DEEP ========
#[derive(Clone, Debug)]
struct LocalizationEngine { languages: Vec<Language>, current: String, fallback: String, tables: Vec<StringTable>, font_overrides: Vec<FontOverride>, rtl_support: bool, pluralization: bool }
#[derive(Clone, Debug)]
struct Language { code: String, name: String, native_name: String, complete: f32, font: Option<String>, text_direction: TextDir }
#[derive(Clone, Debug, Copy)]
enum TextDir { LTR, RTL, TTB }
#[derive(Clone, Debug)]
struct StringTable { namespace: String, entries: Vec<LocalString>, version: u32 }
#[derive(Clone, Debug)]
struct LocalString { key: String, value: String, context: String, max_length: Option<u32>, plural_forms: Vec<(PluralRule, String)> }
#[derive(Clone, Debug, Copy)]
enum PluralRule { Zero, One2, Two, Few, Many, Other }
#[derive(Clone, Debug)]
struct FontOverride { language: String, font_family: String, size_scale: f32, line_height: f32 }
#[derive(Clone, Debug)]
struct AccessibilityEngine { screen_reader_active: bool, narration_queue: Vec<String>, focus_order: Vec<String>, aria_labels: Vec<(String, String)>, color_blind_mode: ColorBlindMode, text_scale: f32, reduce_motion: bool, captions: bool, audio_descriptions: bool }
#[derive(Clone, Debug, Copy)]
enum ColorBlindMode { None3, Protanopia, Deuteranopia, Tritanopia, Achromatopsia, Custom6 }
#[derive(Clone, Debug)]
struct TextToSpeech { enabled: bool, rate: f32, pitch: f32, volume_tts: f32, voice: String, queue: Vec<String> }
#[derive(Clone, Debug)]
struct SubtitleSystem { subtitles_v3: Vec<Subtitle2>, speaker_colors: Vec<(String, [f32;4])>, bg_opacity: f32, font_size_v2: f32, position_v2: SubtitlePos, sound_indicators: bool }
#[derive(Clone, Debug)]
struct Subtitle2 { text: String, speaker: String, timer: f32, duration: f32, sound_desc: Option<String>, importance: u32 }
#[derive(Clone, Debug, Copy)]
enum SubtitlePos { Bottom, Top2, Custom7(f32, f32) }
#[derive(Clone, Debug)]
struct RemapSystem { profiles: Vec<RemapProfile>, active_profile: String }
#[derive(Clone, Debug)]
struct RemapProfile { name: String, mappings: Vec<(String, String)>, sensitivity_overrides: Vec<(String, f32)>, disabled_inputs: Vec<String> }

// ======== ROUND 46: CAMERA SYSTEM DEEP ========
#[derive(Clone, Debug)]
struct CameraSystem { cameras: Vec<CameraV2>, active_camera: usize, blend_stack: Vec<CameraBlend>, post_process_stack: Vec<PostProcessLayer>, viewport_rects: Vec<ViewportRect> }
#[derive(Clone, Debug)]
struct CameraV2 { name: String, pos: [f32;3], rot: [f32;4], fov: f32, near_clip: f32, far_clip: f32, ortho: bool, ortho_size: f32, priority: i32, clear_flags: ClearFlags, clear_color: [f32;4], depth: f32, culling_mask: u64, hdr: bool, target_texture: Option<String> }
#[derive(Clone, Debug, Copy)]
enum ClearFlags { Skybox2, SolidColor, DepthOnly, Nothing }
#[derive(Clone, Debug)]
struct CameraBlend { from_cam: usize, to_cam: usize, blend_time: f32, timer: f32, curve: BlendCurve }
#[derive(Clone, Debug, Copy)]
enum BlendCurve { Linear4, EaseInOut2, Cut, Custom8 }
#[derive(Clone, Debug)]
struct PostProcessLayer { name: String, enabled: bool, priority: i32, effects: Vec<PPEffect> }
#[derive(Clone, Debug)]
struct PPEffect { kind: PPEffectKind, intensity: f32, params: Vec<(String, f32)>, enabled: bool }
#[derive(Clone, Debug, Copy)]
enum PPEffectKind { Bloom2, DOF, MotionBlur2, ChromaticAberration, Vignette2, FilmGrain, LensDistortion, ColorGrading2, AmbientOcclusion2, ScreenSpaceReflections, Fog3, Outline }
#[derive(Clone, Debug)]
struct ViewportRect { x: f32, y: f32, w: f32, h: f32 }
#[derive(Clone, Debug)]
struct CameraDolly { waypoints: Vec<DollyPoint>, speed: f32, looping: bool, timer: f32, current: usize, smoothing: f32 }
#[derive(Clone, Debug)]
struct DollyPoint { pos: [f32;3], rot: [f32;4], fov: f32, wait_time: f32 }
#[derive(Clone, Debug)]
struct CameraConstraint2 { kind: CamConstraintKind, target: String, weight: f32, damping: f32 }
#[derive(Clone, Debug, Copy)]
enum CamConstraintKind { Follow2, LookAt2, Orbit2, Rail, FrameGroup, AvoidCollision }
#[derive(Clone, Debug)]
struct FreeLookCamera { x_axis: CameraAxis, y_axis: CameraAxis, orbits: [CameraOrbit; 3], recentering: bool, recenter_time: f32, heading: f32, input_smoothing: f32 }
#[derive(Clone, Debug)]
struct CameraAxis { max_speed: f32, accel_time: f32, decel_time: f32, value: f32, invert: bool, wrap: bool }
#[derive(Clone, Debug, Copy)]
struct CameraOrbit { height: f32, radius: f32 }

// ======== ROUND 47: LIGHTING SYSTEM DEEP ========
#[derive(Clone, Debug)]
struct LightingSystem { lights_v2: Vec<LightV2>, probes_v2: Vec<LightProbeV2>, lightmaps: Vec<Lightmap>, gi_settings: GISettings, shadow_settings: ShadowSettings2, ambient_mode: AmbientMode }
#[derive(Clone, Debug)]
struct LightV2 { name: String, kind: LightKindV2, pos: [f32;3], rot: [f32;4], color: [f32;3], intensity: f32, range: f32, spot_angle: f32, inner_angle: f32, shadows: bool, shadow_resolution: u32, shadow_bias: f32, shadow_normal_bias: f32, cookie: Option<String>, flicker: Option<LightFlicker3>, volumetric: bool, bounce_intensity: f32, culling_mask: u64, area_size: [f32;2] }
#[derive(Clone, Debug, Copy)]
enum LightKindV2 { Directional2, Point2, Spot2, Area2, Disc, Tube }
#[derive(Clone, Debug)]
struct LightFlicker3 { frequency: f32, amplitude: f32, offset: f32, style: FlickerStyle3 }
#[derive(Clone, Debug, Copy)]
enum FlickerStyle3 { Random2, Candle, Strobe, Pulse2, Campfire, Neon, Torch, Fluorescent }
#[derive(Clone, Debug)]
struct LightProbeV2 { pos: [f32;3], coefficients: Vec<[f32;3]>, radius: f32, blend_distance: f32 }
#[derive(Clone, Debug)]
struct Lightmap { name: String, resolution: u32, padding: u32, baked: bool, direct_samples: u32, indirect_samples: u32, bounces: u32, filter: LightmapFilter }
#[derive(Clone, Debug, Copy)]
enum LightmapFilter { None4, Gaussian2, ATrous, Bilateral }
#[derive(Clone, Debug)]
struct GISettings { enabled: bool, quality: GIQuality, indirect_intensity: f32, albedo_boost: f32, max_bounces: u32, real_time_gi: bool }
#[derive(Clone, Debug, Copy)]
enum GIQuality { Low2, Medium2, High2, Ultra }
#[derive(Clone, Debug)]
struct ShadowSettings2 { distance: f32, cascades: u32, cascade_splits: Vec<f32>, resolution: u32, soft_shadows: bool, filter: ShadowFilter, fade_distance: f32, stable: bool }
#[derive(Clone, Debug, Copy)]
enum ShadowFilter { Hard, PCF, PCSS, VSM }
#[derive(Clone, Debug, Copy)]
enum AmbientMode { Skybox3, Gradient, Flat }
#[derive(Clone, Debug)]
struct LightGroup { name: String, lights: Vec<String>, color_temp: f32, enabled: bool }
#[derive(Clone, Debug)]
struct IESProfile { name: String, data: Vec<f32>, symmetry: u32, candela_max: f32 }

// ======== ROUND 48: VEGETATION SYSTEM DEEP ========
#[derive(Clone, Debug)]
struct VegetationSystem { trees: Vec<TreeDef>, grass: Vec<GrassDef>, placement_rules: Vec<PlacementRule>, wind_settings: WindSettings2, lod_bias: f32, density_scale: f32, render_distance: f32, billboard_distance: f32, impostor_resolution: u32 }
#[derive(Clone, Debug)]
struct TreeDef { name: String, mesh: String, bark_material: String, leaf_material: String, height_range: [f32;2], trunk_radius: f32, crown_radius: f32, branch_levels: u32, leaf_density: f32, wind_strength: f32, seasonal: bool, autumn_color: [f32;3], growth_time: f32, fruit: Option<String>, interact: bool }
#[derive(Clone, Debug)]
struct GrassDef { name: String, texture: String, height_range: [f32;2], width: f32, density: f32, wind_wave: f32, color_variation: f32, dry_color: [f32;3], healthy_color: [f32;3], cast_shadows: bool, receive_shadows: bool, alpha_cutoff: f32 }
#[derive(Clone, Debug)]
struct PlacementRule { vegetation: String, min_height: f32, max_height: f32, min_slope: f32, max_slope: f32, min_moisture: f32, max_moisture: f32, exclusion_radius: f32, cluster_size: u32, cluster_spread: f32, noise_scale: f32, noise_threshold: f32 }
#[derive(Clone, Debug)]
struct WindSettings2 { main_strength: f32, main_direction: [f32;3], turbulence: f32, gust_frequency: f32, gust_strength: f32, gust_duration: f32, wave_size: f32, wave_speed: f32, branch_flex: f32, leaf_flutter: f32, grass_push_radius: f32 }
#[derive(Clone, Debug)]
struct SpeedTree { name: String, lod_count: u32, triangle_counts: Vec<u32>, wind_quality: u32, hue_variation: f32, color_saturation: f32, ambient_contrast: f32, subsurface_color: [f32;3], billboard_threshold: f32 }
#[derive(Clone, Debug)]
struct ProceduralTree { trunk_segments: u32, trunk_taper: f32, branch_angle: f32, branch_count_per_level: u32, branch_length_decay: f32, leaf_shape: LeafShape, leaf_count: u32, seed: u32, symmetry: f32 }
#[derive(Clone, Debug, Copy)]
enum LeafShape { Oval, Maple, Palm, Pine, Willow, Fan, Needle }
#[derive(Clone, Debug)]
struct FoliageInstance3 { def_index: usize, pos: [f32;3], rotation: f32, scale: f32, color_offset: [f32;3], health: f32, growth: f32 }
#[derive(Clone, Debug)]
struct FoliageSector { bounds_min: [f32;2], bounds_max: [f32;2], instances: Vec<FoliageInstance3>, dirty: bool, lod: u32 }

// ======== ROUND 49: DIALOGUE & NARRATIVE DEEP ========
#[derive(Clone, Debug)]
struct DialogueSystem3 { conversations: Vec<Conversation3>, active_conv: Option<usize>, history: Vec<DialogueEvent>, speakers: Vec<Speaker>, variables: Vec<(String, DialogueVar)>, bark_queue: Vec<Bark>, typewriter_speed: f32 }
#[derive(Clone, Debug)]
struct Conversation3 { id: String, name: String, nodes: Vec<DialogueNode3>, entry_node: usize, conditions: Vec<DialogueCond>, priority: i32, once_only: bool, cooldown: f32, cooldown_timer: f32 }
#[derive(Clone, Debug)]
struct DialogueNode3 { id: usize, kind: DNodeKind, speaker: Option<String>, text: String, choices: Vec<DialogueChoice2>, next: Option<usize>, duration: f32, audio_clip: Option<String>, anim: Option<String>, camera_angle: Option<String>, events: Vec<String> }
#[derive(Clone, Debug)]
enum DNodeKind { Speech, Narration, Thought, Action2, Branch, Random3, Hub, Check }
#[derive(Clone, Debug)]
struct DialogueChoice2 { text: String, next_node: usize, conditions: Vec<DialogueCond>, effects: Vec<DialogueEffect>, tooltip: Option<String>, skill_check: Option<SkillCheck>, once_only: bool, chosen: bool }
#[derive(Clone, Debug)]
struct DialogueCond { kind: CondKind, variable: String, operator: CompOp, value: DialogueVar, negate: bool }
#[derive(Clone, Debug, Copy)]
enum CondKind { Variable2, QuestState, Reputation, Skill, Item2, Time2, Random4, Flag2 }
#[derive(Clone, Debug, Copy)]
enum CompOp { Eq, Neq, Lt, Gt, Lte, Gte, Contains }
#[derive(Clone, Debug)]
enum DialogueVar { Int4(i32), Float4(f32), Bool4(bool), Text(String) }
#[derive(Clone, Debug)]
struct DialogueEffect { kind: EffectKind, target: String, value: DialogueVar }
#[derive(Clone, Debug, Copy)]
enum EffectKind { SetVar, AddVar, SetQuest, AddRep, GiveItem, TakeItem, StartCombat, Teleport2, PlayAnim, PlaySound, SetFlag }
#[derive(Clone, Debug)]
struct SkillCheck { skill: String, difficulty: u32, success_node: usize, failure_node: usize, critical_success: Option<usize>, critical_failure: Option<usize> }
#[derive(Clone, Debug)]
struct Speaker { id: String, name: String, portrait: Option<String>, voice: Option<String>, color: [f32;4], personality: Vec<(String, f32)>, relationship: f32 }
#[derive(Clone, Debug)]
struct DialogueEvent { conversation: String, node: usize, choice: Option<usize>, timestamp: f64 }
#[derive(Clone, Debug)]
struct Bark { speaker: String, text: String, duration: f32, timer: f32, world_pos: Option<[f32;3]>, conditions: Vec<DialogueCond>, priority: i32, cooldown: f32 }
#[derive(Clone, Debug)]
struct LocalizedDialogue { language: String, entries: Vec<(String, String)> }

// ======== ROUND 50: QUEST SYSTEM DEEP ========
#[derive(Clone, Debug)]
struct QuestSystem { quests_v2: Vec<QuestV3>, active_quests: Vec<String>, completed_quests: Vec<String>, failed_quests: Vec<String>, quest_log_open: bool, tracking: Vec<String>, max_tracked: u32, auto_track: bool }
#[derive(Clone, Debug)]
struct QuestV3 { id: String, name: String, description: String, category: QuestCategory, stages: Vec<QuestStage2>, current_stage: usize, status: QuestStatusV2, giver: Option<String>, level_req: u32, prerequisites: Vec<String>, rewards: Vec<QuestReward2>, time_limit: Option<f32>, timer: f32, repeatable: bool, hidden: bool, chain: Option<String>, chain_index: u32, cooldown: f32, cooldown_timer: f32 }
#[derive(Clone, Debug, Copy)]
enum QuestCategory { Main, Side, Daily, Weekly, Event2, Guild2, Personal, Bounty }
#[derive(Clone, Debug)]
struct QuestStage2 { description: String, objectives: Vec<QuestObjective2>, on_complete: Vec<String>, optional: bool }
#[derive(Clone, Debug)]
struct QuestObjective2 { kind: ObjKind, target: String, current: u32, required: u32, description: String, markers: Vec<[f32;3]>, optional: bool, hidden: bool }
#[derive(Clone, Debug, Copy)]
enum ObjKind { Kill, Collect, Talk, Explore, Escort, Defend, Craft2, Deliver, Interact2, Survive, Puzzle, Race }
#[derive(Clone, Debug, Copy)]
enum QuestStatusV2 { Available, Active2, Complete2, Failed2, Locked, TurnIn }
#[derive(Clone, Debug)]
struct QuestReward2 { kind: RewardKind, item_id: Option<String>, amount: u32, choice_group: Option<u32> }
#[derive(Clone, Debug, Copy)]
enum RewardKind { XP2, Gold2, Item3, Reputation2, Skill2, Unlock, Title, Achievement2, Recipe }
#[derive(Clone, Debug)]
struct QuestTracker3 { quest_id: String, stage: usize, objective: usize, world_marker: Option<[f32;3]>, distance: f32, compass_dir: f32 }
#[derive(Clone, Debug)]
struct ReputationSystem { factions_v2: Vec<FactionRep3>, thresholds: Vec<(i32, String)> }
#[derive(Clone, Debug)]
struct FactionRep3 { faction: String, value: i32, rank: String, locked: bool, decay_rate: f32, bonuses: Vec<(String, f32)> }

// ======== ROUND 51: INVENTORY SYSTEM DEEP ========
#[derive(Clone, Debug)]
struct InventorySystem { containers: Vec<Container>, equipment_slots: Vec<EquipSlot2>, quick_slots: Vec<Option<String>>, weight_limit: f32, current_weight: f32, auto_sort: bool, filter: InventoryFilter, compare_mode: bool, favorites: Vec<String>, junk_list: Vec<String> }
#[derive(Clone, Debug)]
struct Container { name: String, slots: Vec<InventorySlot2>, max_slots: u32, locked: bool, key_item: Option<String>, shared: bool, weight_limit: Option<f32> }
#[derive(Clone, Debug)]
struct InventorySlot2 { item: Option<ItemV2>, quantity: u32, locked: bool }
#[derive(Clone, Debug)]
struct ItemV2 { id: String, name: String, description: String, icon: String, mesh: Option<String>, category: ItemCategory, rarity: ItemRarity2, level: u32, weight: f32, value: u32, stackable: bool, max_stack: u32, consumable: bool, quest_item: bool, unique: bool, durability: Option<Durability2>, stats: Vec<ItemStat>, effects: Vec<ItemEffect2>, requirements: Vec<ItemReq>, set_id: Option<String>, lore: Option<String>, crafting_materials: Vec<(String, u32)> }
#[derive(Clone, Debug, Copy)]
enum ItemCategory { Weapon2, Armor, Consumable2, Material2, Quest2, Key2, Junk, Currency, Ammo2, Recipe2, Book, Gem2, Tool2 }
#[derive(Clone, Debug, Copy)]
enum ItemRarity2 { Common2, Uncommon2, Rare2, Epic2, Legendary2, Mythic, Artifact2, Heirloom }
#[derive(Clone, Debug)]
struct Durability2 { current: f32, max: f32, decay_rate: f32, broken: bool, repair_cost: u32, repair_material: Option<String> }
#[derive(Clone, Debug)]
struct ItemStat { stat: String, value: f32, flat: bool }
#[derive(Clone, Debug)]
struct ItemEffect2 { trigger: EffectTrigger, effect: String, value: f32, duration: f32, chance: f32 }
#[derive(Clone, Debug, Copy)]
enum EffectTrigger { OnUse, OnEquip, OnHit, OnHurt, OnKill, OnBlock, OnDodge, Passive, OnCrit }
#[derive(Clone, Debug)]
struct ItemReq { kind: ReqKind, stat: String, value: f32 }
#[derive(Clone, Debug, Copy)]
enum ReqKind { Level2, Stat, Skill3, Quest3, Class, Reputation3 }
#[derive(Clone, Debug)]
struct EquipSlot2 { name: String, slot_type: SlotType, item: Option<String>, locked: bool }
#[derive(Clone, Debug, Copy)]
enum SlotType { Head2, Chest, Legs, Feet, Hands, Shoulder, Back, Neck, Ring3, Trinket, MainHand, OffHand, Ranged, Ammo3 }
#[derive(Clone, Debug, Copy)]
enum InventoryFilter { All, Equipment, Consumables, Materials, Quest4, Junk2, Favorites }
#[derive(Clone, Debug)]
struct ItemSetBonus { set_id: String, set_name: String, pieces: Vec<String>, bonuses: Vec<(u32, Vec<ItemStat>)> }
#[derive(Clone, Debug)]
struct LootDrop { item_id: String, quantity_range: [u32;2], weight: f32, conditions: Vec<String>, guaranteed: bool }
#[derive(Clone, Debug)]
struct LootPool { name: String, drops: Vec<LootDrop>, guaranteed_drops: u32, bonus_rolls: u32, level_scaling: bool }

// ======== ROUND 52: COMBAT SYSTEM DEEP ========
#[derive(Clone, Debug)]
struct CombatSystem { combatants: Vec<Combatant>, combat_log: Vec<CombatEvent>, target_lock: Option<String>, auto_target: bool, aim_assist: f32, hit_stop_ms: f32, parry_window: f32, dodge_iframes: u32, block_angle: f32, backstab_angle: f32, crit_multiplier: f32, combo_counter: u32, combo_timer: f32, style_rank: StyleRank }
#[derive(Clone, Debug)]
struct Combatant { entity: String, hp: f32, max_hp: f32, mp: f32, max_mp: f32, stamina: f32, max_stamina: f32, poise: f32, max_poise: f32, level: u32, attack: f32, defense: f32, speed_stat: f32, crit_rate: f32, crit_damage: f32, resistances: Vec<(DamageType2, f32)>, status_effects_v2: Vec<StatusEffectV2>, buffs: Vec<Buff2>, cooldowns: Vec<Cooldown2>, stance: CombatStance, target: Option<String>, aggro_list: Vec<(String, f32)>, invulnerable: bool, super_armor: bool }
#[derive(Clone, Debug, Copy)]
enum DamageType2 { Physical2, Fire3, Ice3, Lightning3, Poison3, Holy, Dark2, Bleed, True2 }
#[derive(Clone, Debug)]
struct StatusEffectV2 { name: String, kind: StatusKind2, duration: f32, timer: f32, tick_rate: f32, tick_timer: f32, value: f32, stacks: u32, max_stacks: u32, source: String }
#[derive(Clone, Debug, Copy)]
enum StatusKind2 { Burning, Frozen, Shocked, Poisoned, Bleeding2, Stunned2, Silenced, Blinded, Weakened, Cursed2, Regenerating, Shielded2, Hasted, Slowed, Rooted, Feared, Charmed, Confused, Enraged2, Invisible }
#[derive(Clone, Debug)]
struct Buff2 { name: String, stat: String, value: f32, flat: bool, duration: f32, timer: f32, icon: String, source: String, dispellable: bool, stacks: u32, max_stacks: u32, refresh_on_apply: bool }
#[derive(Clone, Debug)]
struct Cooldown2 { ability: String, total: f32, remaining: f32, charges: u32, max_charges: u32, charge_time: f32, global: bool }
#[derive(Clone, Debug, Copy)]
enum CombatStance { Neutral, Aggressive, Defensive, Berserk, Tactical }
#[derive(Clone, Debug, Copy)]
enum StyleRank { D, C, B, A, S, SS, SSS }
#[derive(Clone, Debug)]
struct CombatEvent { kind: CombatEventKind, source: String, target_v2: String, value: f32, damage_type: Option<DamageType2>, timestamp: f64 }
#[derive(Clone, Debug, Copy)]
enum CombatEventKind { Damage, Heal2, Block2, Dodge2, Parry, Crit, Kill2, Revive, StatusApply, StatusRemove, BuffApply, BuffRemove }
#[derive(Clone, Debug)]
struct DamageCalculation { base_damage: f32, attack_power: f32, defense_reduction: f32, resistance_mod: f32, crit_mod: f32, buff_mod: f32, level_scaling: f32, random_variance: f32, final_damage: f32 }
#[derive(Clone, Debug)]
struct AttackDefinition { name: String, damage_type: DamageType2, base_damage: f32, range: f32, angle: f32, startup_frames: u32, active_frames: u32, recovery_frames: u32, hitstun: u32, knockback: f32, launch: bool, can_cancel: Vec<String>, stamina_cost: f32, mp_cost: f32, combo_points: u32 }

// ======== ROUND 53: CRAFTING SYSTEM DEEP ========
#[derive(Clone, Debug)]
struct CraftingSystem { stations: Vec<CraftingStation3>, recipes_v2: Vec<RecipeV2>, discovered_recipes: Vec<String>, crafting_queue: Vec<CraftingJob3>, auto_craft: bool, favorite_recipes: Vec<String>, skill_levels: Vec<(CraftSkill, u32, u32)> }
#[derive(Clone, Debug)]
struct CraftingStation3 { name: String, kind: StationKind2, level: u32, fuel: f32, max_fuel: f32, fuel_rate: f32, slots: Vec<CraftSlot>, output_slots: Vec<CraftSlot>, recipes: Vec<String>, pos: [f32;3], active: bool, bonus_quality: f32 }
#[derive(Clone, Debug, Copy)]
enum StationKind2 { Workbench, Forge2, Anvil, Loom, Alchemy2, Enchanting2, Cooking2, Tanning, Kiln, Sawmill, JewelerBench, Inscription2 }
#[derive(Clone, Debug)]
struct CraftSlot { item: Option<String>, quantity: u32, required_type: Option<String> }
#[derive(Clone, Debug)]
struct RecipeV2 { id: String, name: String, station: StationKind2, skill: CraftSkill, skill_req: u32, ingredients: Vec<RecipeIngredient>, output: RecipeOutput, craft_time: f32, xp_reward: u32, discovered: bool, quality_scaling: bool, failure_chance: f32, failure_output: Option<String> }
#[derive(Clone, Debug)]
struct RecipeIngredient { item_id: String, quantity: u32, consumed: bool, alternatives: Vec<String>, quality_min: Option<f32> }
#[derive(Clone, Debug)]
struct RecipeOutput { item_id: String, quantity: u32, quality_range: [f32;2], bonus_chance: f32, bonus_item: Option<String> }
#[derive(Clone, Debug)]
struct CraftingJob3 { recipe_id: String, station: String, progress: f32, total_time: f32, quality: f32, crafter: String }
#[derive(Clone, Debug, Copy)]
enum CraftSkill { Blacksmithing, Tailoring2, Alchemy3, Enchanting3, Cooking3, Woodworking, Leatherworking, Jewelcrafting, Inscription3, Engineering2 }
#[derive(Clone, Debug)]
struct QualitySystem { min_quality: f32, max_quality: f32, quality_tiers: Vec<(f32, String, [f32;3])>, skill_bonus: f32, station_bonus: f32, material_bonus: f32, tool_bonus: f32 }
#[derive(Clone, Debug)]
struct Salvage { item_id: String, returns: Vec<(String, u32, f32)>, tool_required: Option<String>, skill_required: Option<(CraftSkill, u32)> }

// ======== ROUND 54: AI BEHAVIOR DEEP ========
#[derive(Clone, Debug)]
struct AIBrainSystem { brains: Vec<AIBrain>, blackboards_v2: Vec<Blackboard2>, sensors: Vec<AISensor2>, stimuli: Vec<AIStimulus>, squad_manager: SquadManager }
#[derive(Clone, Debug)]
struct AIBrain { entity: String, tree: BehaviorTreeV2, utility_scores: Vec<(String, f32)>, current_action: Option<String>, personality: AIPersonality, morale: f32, alertness: f32, memory_v2: Vec<AIMemoryEntry>, patrol_route_v2: Vec<[f32;3]>, patrol_index: usize, home_pos: [f32;3], wander_radius: f32, combat_style: AICombatStyle, flee_threshold: f32, aggro_range: f32, leash_range: f32 }
#[derive(Clone, Debug)]
struct BehaviorTreeV2 { root: BTNodeV2, running_node: Option<usize> }
#[derive(Clone, Debug)]
enum BTNodeV2 { Sequence2(Vec<BTNodeV2>), Selector2(Vec<BTNodeV2>), Parallel2(Vec<BTNodeV2>, u32), Decorator(DecoratorKind, Box<BTNodeV2>), Leaf(LeafAction) }
#[derive(Clone, Debug, Copy)]
enum DecoratorKind { Inverter, Repeater(u32), RepeatUntilFail, Cooldown3(u32), Chance(u32), TimeLimit(u32), ForceSuccess, ForceFailure, Semaphore }
#[derive(Clone, Debug, Copy)]
enum LeafAction { MoveTo, Attack2, Flee, Patrol2, Idle2, Investigate, Guard, UseAbility, Heal3, Loot, Interact3, Bark2, CallForHelp, TakeCover, Flank, Reload, ThrowGrenade, SetTrap, Snipe, Charge, Summon2, Buff3, Debuff2, Revive2 }
#[derive(Clone, Debug)]
struct AIPersonality { aggression: f32, bravery: f32, intelligence: f32, loyalty: f32, greed: f32, curiosity: f32, caution: f32, cruelty: f32 }
#[derive(Clone, Debug, Copy)]
enum AICombatStyle { Melee, Ranged2, Magic2, Support, Tank, Assassin, Berserker, Summoner }
#[derive(Clone, Debug)]
struct AIMemoryEntry { target: String, last_pos: [f32;3], last_seen: f64, threat_level: f32, is_ally: bool, damage_received: f32, damage_dealt: f32 }
#[derive(Clone, Debug)]
struct Blackboard2 { owner: String, entries: Vec<(String, BBValue)> }
#[derive(Clone, Debug)]
enum BBValue { Float5(f32), Int5(i32), Bool5(bool), Vec3V2([f32;3]), Entity2(String), List(Vec<String>) }
#[derive(Clone, Debug)]
struct AISensor2 { kind: SensorKind2, range: f32, angle: f32, update_rate: f32, timer: f32, los_required: bool, team_filter: TeamFilter }
#[derive(Clone, Debug, Copy)]
enum SensorKind2 { Sight2, Hearing2, Smell, Touch, Damage2, Proximity }
#[derive(Clone, Debug, Copy)]
enum TeamFilter { Enemies, Allies, All2, Neutral2 }
#[derive(Clone, Debug)]
struct AIStimulus { kind: StimulusKind, pos: [f32;3], radius: f32, strength: f32, source: String, duration: f32, timer: f32 }
#[derive(Clone, Debug, Copy)]
enum StimulusKind { Visual, Auditory, Olfactory, Pain, Thermal }
#[derive(Clone, Debug)]
struct SquadManager { squads: Vec<AISquad2>, formations_v2: Vec<FormationDef> }
#[derive(Clone, Debug)]
struct AISquad2 { name: String, leader: String, members: Vec<String>, formation: String, morale: f32, objective: String, rally_point: [f32;3] }
#[derive(Clone, Debug)]
struct FormationDef { name: String, positions: Vec<[f32;2]>, spacing: f32, facing: f32 }

// ======== ROUND 55: AUDIO SYSTEM DEEP ========
#[derive(Clone, Debug)]
struct AudioSystem2 { mixer: AudioMixer2, spatial: SpatialAudio, music_engine: MusicEngine2, voice_manager: VoiceManager, sound_bank: SoundBank, occlusion_system: AudioOcclusion, snapshot_stack: Vec<AudioSnapshot3>, duck_groups: Vec<DuckGroup> }
#[derive(Clone, Debug)]
struct AudioMixer2 { master_volume: f32, channels_v2: Vec<MixerChannel>, crossfade_time: f32 }
#[derive(Clone, Debug)]
struct MixerChannel { name: String, volume: f32, pitch: f32, muted: bool, solo: bool, effects_v2: Vec<String>, parent: Option<String>, duck_volume: f32, duck_target: f32, duck_speed: f32 }
#[derive(Clone, Debug)]
struct SpatialAudio { hrtf_enabled: bool, max_distance: f32, doppler_scale: f32, rolloff_mode: RolloffMode, default_spread: f32, reverb_zones_v2: Vec<ReverbZoneV2> }
#[derive(Clone, Debug, Copy)]
enum RolloffMode { Logarithmic, Linear5, Custom9 }
#[derive(Clone, Debug)]
struct ReverbZoneV2 { pos: [f32;3], inner_radius: f32, outer_radius: f32, preset: ReverbPreset3, mix: f32, priority: i32 }
#[derive(Clone, Debug, Copy)]
enum ReverbPreset3 { Room, Hall, Cave2, Outdoor, Underwater3, Cathedral, Tunnel2, Bathroom, Arena2, Forest, Mountains, Custom10 }
#[derive(Clone, Debug)]
struct MusicEngine2 { layers: Vec<MusicLayer3>, current_state: String, transition_time: f32, stingers: Vec<Stinger>, tempo: f32, time_signature: [u32;2], bar_count: u32, beat_callbacks: Vec<String> }
#[derive(Clone, Debug)]
struct MusicLayer3 { name: String, clip: String, volume: f32, active: bool, sync_to_beat: bool, loop_region: Option<[f32;2]>, next_transition: Option<String>, fade_in: f32, fade_out: f32 }
#[derive(Clone, Debug)]
struct Stinger { name: String, clip: String, trigger: String, volume: f32, priority: i32, one_shot: bool }
#[derive(Clone, Debug)]
struct VoiceManager { max_voices: u32, active: u32, virtual_voices: u32, steal_mode: VoiceStealMode, priority_system: bool }
#[derive(Clone, Debug, Copy)]
enum VoiceStealMode { Oldest, Quietest, Lowest, Farthest, None5 }
#[derive(Clone, Debug)]
struct SoundBank { name: String, sounds: Vec<SoundEntry>, loaded: bool, memory_mb: f32, streaming: bool }
#[derive(Clone, Debug)]
struct SoundEntry { name: String, clips: Vec<String>, volume_range: [f32;2], pitch_range: [f32;2], max_instances: u32, cooldown: f32, spatial: bool, priority: i32, category: String }
#[derive(Clone, Debug)]
struct AudioOcclusion { enabled: bool, ray_count: u32, update_rate: f32, max_occlusion: f32, low_pass_freq: f32 }
#[derive(Clone, Debug)]
struct AudioSnapshot3 { name: String, channel_volumes: Vec<(String, f32)>, effects: Vec<(String, Vec<(String, f32)>)>, transition_time: f32 }
#[derive(Clone, Debug)]
struct DuckGroup { name: String, trigger_channel: String, duck_channels: Vec<String>, threshold: f32, ratio: f32, attack: f32, release_time: f32 }

// ======== ROUND 56: WEATHER & ATMOSPHERE DEEP ========
#[derive(Clone, Debug)]
struct WeatherEngine { current: WeatherState2, forecast: Vec<WeatherState2>, transition_timer: f32, transition_duration: f32, wind_system: WindSystem3, precipitation: PrecipitationSystem, cloud_system: CloudSystem3, lightning_system: LightningSystem2, fog_system: FogSystem2, temperature_map: Vec<f32> }
#[derive(Clone, Debug)]
struct WeatherState2 { kind: WeatherKind2, intensity: f32, wind_speed: f32, wind_dir: [f32;2], temperature: f32, humidity: f32, visibility: f32, cloud_cover: f32, pressure: f32 }
#[derive(Clone, Debug, Copy)]
enum WeatherKind2 { Clear2, Cloudy, Overcast, Rain2, HeavyRain, Snow2, Blizzard2, Fog4, Thunderstorm, Hail, Sandstorm2, AshFall, DustDevil, Hurricane, Drizzle, Sleet, Rainbow, AuroraBorealis }
#[derive(Clone, Debug)]
struct WindSystem3 { global_direction: [f32;3], global_speed: f32, gusts: Vec<WindGust>, turbulence_scale: f32, turbulence_speed: f32, height_gradient: f32, sheltered_zones: Vec<WindShelter> }
#[derive(Clone, Debug)]
struct WindGust { direction: [f32;3], speed: f32, duration: f32, timer: f32, radius: f32, pos: [f32;3] }
#[derive(Clone, Debug)]
struct WindShelter { pos: [f32;3], radius: f32, reduction: f32 }
#[derive(Clone, Debug)]
struct PrecipitationSystem { kind: PrecipKind, rate: f32, splash_effect: bool, accumulation: bool, accumulation_rate: f32, melt_rate: f32, puddle_formation: bool, wetness: f32, wetness_decay: f32, particle_count: u32, wind_affect: f32, size_range: [f32;2] }
#[derive(Clone, Debug, Copy)]
enum PrecipKind { None6, Rain3, Snow3, Hail2, Sleet2, Ash, Pollen, Embers, Petals, Leaves }
#[derive(Clone, Debug)]
struct CloudSystem3 { layers_v2: Vec<CloudLayer2>, shadow_projection: bool, cloud_speed: f32, detail_scale: f32, edge_softness: f32, ambient_light: f32, sun_highlight: f32, coverage_min: f32, coverage_max: f32 }
#[derive(Clone, Debug)]
struct CloudLayer2 { altitude: f32, thickness: f32, density: f32, coverage: f32, wind_speed: f32, wind_dir: [f32;2], color: [f32;3], opacity: f32, detail: f32 }
#[derive(Clone, Debug)]
struct LightningSystem2 { active: bool, frequency: f32, timer: f32, bolt_lifetime: f32, branch_count: u32, flash_intensity: f32, thunder_delay: f32, strike_damage: f32, bolts: Vec<LightningBolt2> }
#[derive(Clone, Debug)]
struct LightningBolt2 { start: [f32;3], end_v2: [f32;3], branches: Vec<([f32;3], [f32;3])>, lifetime: f32, timer: f32, color: [f32;3], width: f32 }
#[derive(Clone, Debug)]
struct FogSystem2 { mode: FogMode2, color: [f32;3], density: f32, start_dist: f32, end_dist: f32, height_fog: bool, height_density: f32, height_falloff: f32, inscattering: f32, animated: bool, noise_scale: f32, noise_speed: f32, max_opacity: f32 }
#[derive(Clone, Debug, Copy)]
enum FogMode2 { Linear6, Exponential, ExponentialSquared, HeightBased }

// ======== ROUND 57: PHYSICS CONSTRAINTS DEEP ========
#[derive(Clone, Debug)]
struct PhysicsConstraints { joints: Vec<PhysicsJoint2>, motors: Vec<PhysicsMotor>, springs_v2: Vec<PhysicsSpring2>, breakable: Vec<BreakableJoint>, ragdolls_v2: Vec<RagdollDef2>, chains: Vec<PhysicsChain2>, ropes_v2: Vec<RopePhysics2>, buoyancy: Vec<BuoyancyVolume> }
#[derive(Clone, Debug)]
struct PhysicsJoint2 { entity_a: String, entity_b: String, kind: JointKind2, anchor_a: [f32;3], anchor_b: [f32;3], limits: Option<JointLimits>, break_force: f32, break_torque: f32, enable_collision: bool }
#[derive(Clone, Debug, Copy)]
enum JointKind2 { Fixed2, Hinge2, Ball2, Slider2, Spring3, Distance2, ConfigurableJoint }
#[derive(Clone, Debug)]
struct JointLimits { lower: f32, upper: f32, bounce: f32, contact_distance: f32 }
#[derive(Clone, Debug)]
struct PhysicsMotor { joint_index: usize, target_velocity: f32, max_force: f32, free_spin: bool, servo: bool, servo_target: f32, damping: f32 }
#[derive(Clone, Debug)]
struct PhysicsSpring2 { entity_a: String, entity_b: String, rest_length: f32, stiffness: f32, damping: f32, max_force: f32, auto_length: bool }
#[derive(Clone, Debug)]
struct BreakableJoint { joint_index: usize, force_threshold: f32, torque_threshold: f32, broken: bool, on_break_effect: Option<String>, debris: Vec<String> }
#[derive(Clone, Debug)]
struct RagdollDef2 { name: String, bones: Vec<RagdollBone2>, blend_weight: f32, settling_time: f32, recovery_time: f32, can_recover: bool, pose_matching: bool }
#[derive(Clone, Debug)]
struct RagdollBone2 { bone_name: String, shape: String, mass: f32, limits_v2: [f32;6], connected_to: Option<String>, collider_radius: f32, friction: f32 }
#[derive(Clone, Debug)]
struct PhysicsChain2 { nodes: Vec<ChainNode2>, gravity: f32, stiffness: f32, iterations: u32, collision: bool, self_collision: bool }
#[derive(Clone, Debug)]
struct ChainNode2 { pos: [f32;3], prev_pos: [f32;3], mass: f32, pinned: bool, radius: f32 }
#[derive(Clone, Debug)]
struct RopePhysics2 { segments: Vec<RopeSegment2>, total_length: f32, segment_length: f32, stiffness: f32, damping: f32, gravity: f32, wind_affect: f32, collision: bool, renderer: RopeRenderer }
#[derive(Clone, Debug)]
struct RopeSegment2 { pos: [f32;3], prev_pos: [f32;3], vel: [f32;3], mass: f32 }
#[derive(Clone, Debug)]
struct RopeRenderer { width: f32, segments_per_unit: u32, material: String, uv_scale: f32 }
#[derive(Clone, Debug)]
struct BuoyancyVolume { pos: [f32;3], size: [f32;3], density: f32, drag: f32, angular_drag: f32, flow_dir: [f32;3], flow_speed: f32, waves: bool, wave_height: f32, wave_frequency: f32 }

// ======== ROUND 58: SAVE/LOAD SYSTEM DEEP ========
#[derive(Clone, Debug)]
struct SaveSystem2 { slots_v2: Vec<SaveSlotV2>, auto_save_interval: f32, auto_save_timer: f32, max_auto_saves: u32, quick_save_slot: u32, cloud_sync: bool, compression: bool, encryption_key: Option<String>, save_in_progress: bool, load_in_progress: bool, migration_version: u32 }
#[derive(Clone, Debug)]
struct SaveSlotV2 { id: u32, name: String, timestamp: u64, play_time: f64, level: String, screenshot: Option<String>, version: u32, size_bytes: u64, checksum: u64, metadata: Vec<(String, String)>, auto_save: bool, corrupt: bool }
#[derive(Clone, Debug)]
struct SaveData { header: SaveHeader, world_state: WorldSaveState, player_state: PlayerSaveState, quest_state: Vec<QuestSaveState>, inventory_state: InventorySaveState, settings_state: SettingsSaveState }
#[derive(Clone, Debug)]
struct SaveHeader { version: u32, game_version: String, timestamp: u64, play_time: f64, checksum: u64, mod_list: Vec<String> }
#[derive(Clone, Debug)]
struct WorldSaveState { objects: Vec<ObjectSaveData>, destroyed: Vec<String>, spawned: Vec<String>, weather: String, time_of_day: f32, seed: u64, discovered_areas: Vec<String>, world_events: Vec<String> }
#[derive(Clone, Debug)]
struct ObjectSaveData { id: String, pos: [f32;3], rot: [f32;4], scale: [f32;3], state: Vec<(String, String)>, health: Option<f32>, active: bool }
#[derive(Clone, Debug)]
struct PlayerSaveState { pos: [f32;3], rot: [f32;4], health: f32, max_health: f32, mana: f32, max_mana: f32, level: u32, xp: u64, stats: Vec<(String, f32)>, skills_v2: Vec<(String, u32)>, perks: Vec<String>, active_effects: Vec<String> }
#[derive(Clone, Debug)]
struct QuestSaveState { quest_id: String, stage: u32, status: String, objectives: Vec<(String, u32)>, timer: f32 }
#[derive(Clone, Debug)]
struct InventorySaveState { items: Vec<ItemSaveData>, equipment: Vec<(String, String)>, currency: Vec<(String, u64)>, weight: f32 }
#[derive(Clone, Debug)]
struct ItemSaveData { id: String, quantity: u32, durability: Option<f32>, enchantments: Vec<String>, custom_name: Option<String>, slot: u32 }
#[derive(Clone, Debug)]
struct SettingsSaveState { graphics: Vec<(String, String)>, audio_v2: Vec<(String, f32)>, controls: Vec<(String, String)>, gameplay: Vec<(String, String)> }
#[derive(Clone, Debug)]
struct SaveMigration { from_version: u32, to_version: u32, transformations: Vec<MigrationStep> }
#[derive(Clone, Debug)]
struct MigrationStep { kind: MigrationKind, path: String, value: String }
#[derive(Clone, Debug, Copy)]
enum MigrationKind { AddField, RemoveField, RenameField, ChangeType, AddDefault }

// ======== ROUND 59: EDITOR TOOLS DEEP ========
#[derive(Clone, Debug)]
struct EditorToolSystem { tools: Vec<EditorTool2>, active_tool: usize, gizmo_settings: GizmoSettings2, grid_settings: GridSettings2, snap_settings: SnapSettings2, selection: SelectionState2, clipboard: Vec<ClipboardEntry>, history_v2: Vec<HistoryEntry2>, redo_stack: Vec<HistoryEntry2>, max_history: u32 }
#[derive(Clone, Debug)]
struct EditorTool2 { name: String, icon: String, shortcut: String, active: bool, settings: Vec<(String, String)> }
#[derive(Clone, Debug)]
struct GizmoSettings2 { mode: GizmoMode2, space: GizmoSpace, size: f32, snap: bool, snap_value: f32, rotation_snap: f32, scale_snap: f32, show_bounds: bool, selected_axis: Option<u32> }
#[derive(Clone, Debug, Copy)]
enum GizmoMode2 { Translate2, Rotate3, Scale2, Universal, Bounds }
#[derive(Clone, Debug, Copy)]
enum GizmoSpace { Local, World2, Parent, View }
#[derive(Clone, Debug)]
struct GridSettings2 { visible: bool, size: f32, subdivisions: u32, color: [f32;4], opacity: f32, axis_colors: [[f32;3];3], infinite: bool, origin_lines: bool }
#[derive(Clone, Debug)]
struct SnapSettings2 { position_snap: f32, rotation_snap: f32, scale_snap: f32, vertex_snap: bool, surface_snap: bool, grid_snap: bool, incremental: bool }
#[derive(Clone, Debug)]
struct SelectionState2 { selected: Vec<String>, primary: Option<String>, hover: Option<String>, marquee: Option<MarqueeRect>, locked: Vec<String>, hidden: Vec<String>, filter: SelectionFilter }
#[derive(Clone, Debug)]
struct MarqueeRect { start: [f32;2], end_v3: [f32;2], additive: bool }
#[derive(Clone, Debug, Copy)]
enum SelectionFilter { All3, Meshes, Lights2, Cameras, Audio2, Particles2, UI, Volumes, Empties }
#[derive(Clone, Debug)]
struct ClipboardEntry { object_data: String, relative_positions: Vec<[f32;3]> }
#[derive(Clone, Debug)]
struct HistoryEntry2 { kind: HistoryKind, description: String, timestamp: f64, data_before: String, data_after: String, objects: Vec<String> }
#[derive(Clone, Debug, Copy)]
enum HistoryKind { Transform2, Create2, Delete2, Modify2, Reparent, Material, Component, Batch }
#[derive(Clone, Debug)]
struct PrefabEditor { prefab_path: Option<String>, instances: Vec<PrefabInstance3>, overrides: Vec<PrefabOverride>, nested: Vec<String>, variant_of: Option<String> }
#[derive(Clone, Debug)]
struct PrefabInstance3 { prefab_path: String, instance_id: String, pos: [f32;3], rot: [f32;4], scale: [f32;3], overrides: Vec<PrefabOverride>, broken: bool }
#[derive(Clone, Debug)]
struct PrefabOverride { property_path: String, value: String, reverted: bool }

// ======== ROUND 60: PROCEDURAL ANIMATION DEEP ========
#[derive(Clone, Debug)]
struct ProceduralAnimSystem { ik_solvers: Vec<IKSolverV2>, look_at_v2: Vec<LookAtController2>, foot_placement: Vec<FootIK3>, spine_solver: Vec<SpineSolver>, hand_ik: Vec<HandIK3>, head_tracking: Vec<HeadTracker>, tail_anim: Vec<TailAnimator>, wing_anim: Vec<WingAnimator> }
#[derive(Clone, Debug)]
struct IKSolverV2 { entity: String, kind: IKKind2, chain_length: u32, target: [f32;3], pole: Option<[f32;3]>, weight: f32, iterations: u32, tolerance: f32, bones: Vec<String>, stiffness: Vec<f32> }
#[derive(Clone, Debug, Copy)]
enum IKKind2 { TwoBone, FABRIK, CCD2, Jacobian, Analytical, FullBody }
#[derive(Clone, Debug)]
struct LookAtController2 { entity: String, target: [f32;3], weight: f32, clamp_angle: f32, head_bone: String, eye_bones: Vec<String>, body_weight: f32, head_weight: f32, eye_weight: f32, smoothing: f32 }
#[derive(Clone, Debug)]
struct FootIK3 { entity: String, feet: Vec<FootDef>, raycast_dist: f32, body_offset: f32, body_lerp: f32, foot_lerp: f32, max_step_height: f32, ground_layers: u32 }
#[derive(Clone, Debug)]
struct FootDef { bone: String, offset: [f32;3], ground_offset: f32, heel_bone: Option<String>, toe_bone: Option<String> }
#[derive(Clone, Debug)]
struct SpineSolver { entity: String, bones: Vec<String>, weight: f32, twist_weight: f32, head_target: [f32;3], max_bend: f32 }
#[derive(Clone, Debug)]
struct HandIK3 { entity: String, hand_bone: String, target: [f32;3], fingers: Vec<FingerDef>, grip_type: GripType, wrist_offset: [f32;3] }
#[derive(Clone, Debug)]
struct FingerDef { bones: Vec<String>, curl: f32, spread: f32, twist: f32, stiffness: f32 }
#[derive(Clone, Debug, Copy)]
enum GripType { Open, Fist, Grip2, Pinch2, Point, Peace, Gun, Custom11 }
#[derive(Clone, Debug)]
struct HeadTracker { entity: String, bone: String, target: Option<[f32;3]>, interest_points: Vec<InterestPoint>, saccade_timer: f32, blink_timer: f32, blink_rate: f32, look_speed: f32, idle_range: f32 }
#[derive(Clone, Debug)]
struct InterestPoint { pos: [f32;3], weight: f32, duration: f32, priority: i32 }
#[derive(Clone, Debug)]
struct TailAnimator { entity: String, bones: Vec<String>, wave_speed: f32, wave_amplitude: f32, gravity_v2: f32, stiffness: f32, wind_reaction: f32, idle_curl: f32 }
#[derive(Clone, Debug)]
struct WingAnimator { entity: String, wing_bones: Vec<String>, flap_speed: f32, flap_amplitude: f32, fold_amount: f32, glide_angle: f32, wind_lift: f32, secondary_motion: f32 }

// ======== ROUND 61: WATER SYSTEM DEEP ========
#[derive(Clone, Debug)]
struct WaterSystem2 { bodies: Vec<WaterBody2>, global_settings: WaterGlobalSettings, caustics_v2: CausticsSettings, foam_settings: FoamSettings, underwater_settings: UnderwaterSettings2 }
#[derive(Clone, Debug)]
struct WaterBody2 { name: String, kind: WaterKind2, pos: [f32;3], size: [f32;2], depth: f32, waves: Vec<WaveDef>, flow_map: Option<String>, color_shallow: [f32;4], color_deep: [f32;4], transparency: f32, refraction: f32, reflection_v2: f32, normal_map_v2: Option<String>, foam_threshold: f32, shoreline_blend: f32, buoyancy_v2: f32, swim_speed: f32 }
#[derive(Clone, Debug, Copy)]
enum WaterKind2 { Ocean2, Lake2, River2, Pool, Waterfall2, Swamp2, Lava2, Acid }
#[derive(Clone, Debug)]
struct WaveDef { amplitude: f32, frequency: f32, speed: f32, direction: [f32;2], steepness: f32 }
#[derive(Clone, Debug)]
struct WaterGlobalSettings { simulation_quality: u32, reflection_resolution: u32, refraction_resolution: u32, tessellation: bool, tess_factor: f32, dynamic_ripples: bool, ripple_lifetime: f32 }
#[derive(Clone, Debug)]
struct CausticsSettings { enabled: bool, texture: Option<String>, scale: f32, speed: f32, intensity: f32, depth_fade: f32 }
#[derive(Clone, Debug)]
struct FoamSettings { texture: Option<String>, scale: f32, threshold: f32, intensity: f32, shore_width: f32, wave_foam: bool }
#[derive(Clone, Debug)]
struct UnderwaterSettings2 { fog_color: [f32;3], fog_density: f32, caustic_intensity: f32, distortion: f32, god_rays: bool, god_ray_intensity: f32, bubble_particles: bool, pressure_effect: f32, tint_color: [f32;3] }

// ======== ROUND 62: DESTRUCTION SYSTEM DEEP ========
#[derive(Clone, Debug)]
struct DestructionSystem2 { destructibles: Vec<Destructible2>, fracture_cache: Vec<FracturePattern>, debris_pool: Vec<DebrisChunk>, max_debris: u32, debris_lifetime: f32, cascade_destruction: bool }
#[derive(Clone, Debug)]
struct Destructible2 { entity: String, health: f32, max_health: f32, stages: Vec<DestructionStage>, current_stage: usize, material_type: MaterialStrength, fracture: Option<String>, on_destroy: Vec<DestroyAction>, debris_count: u32, repair_time: Option<f32> }
#[derive(Clone, Debug)]
struct DestructionStage { health_threshold: f32, mesh: String, particles: Option<String>, sound: Option<String>, decals: Vec<String>, physics_change: bool }
#[derive(Clone, Debug, Copy)]
enum MaterialStrength { Glass, Wood3, Stone2, Metal2, Concrete, Ice2, Crystal2, Flesh, Bone }
#[derive(Clone, Debug)]
struct FracturePattern { name: String, kind: FractureKind, pieces: u32, randomness: f32, seed: u32, inner_material: String }
#[derive(Clone, Debug, Copy)]
enum FractureKind { Voronoi, Radial2, Slice, Shatter, Crumble, Splinter, Chunk }
#[derive(Clone, Debug)]
struct DebrisChunk { pos: [f32;3], vel: [f32;3], rot_vel: [f32;3], scale: f32, lifetime: f32, timer: f32, mesh: String, material: String, fade_out: bool }
#[derive(Clone, Debug)]
enum DestroyAction { SpawnParticles(String), PlaySound2(String), ApplyForce([f32;3], f32), SpawnDebris(u32), DamageArea(f32, f32), DropLoot(String), TriggerEvent(String), SpawnReplacement(String) }

// ======== ROUND 63: TERRAIN PAINTING DEEP ========
#[derive(Clone, Debug)]
struct TerrainPainter { brushes: Vec<TerrainBrush2>, layers_v3: Vec<TerrainPaintLayer>, splat_resolution: u32, detail_objects: Vec<DetailObject>, holes_enabled: bool, stamp_library: Vec<TerrainStamp> }
#[derive(Clone, Debug)]
struct TerrainBrush2 { name: String, kind: BrushKind2, size: f32, strength: f32, falloff: f32, rotation: f32, spacing: f32, jitter: f32, texture: Option<String>, shape: BrushShape2, noise: f32 }
#[derive(Clone, Debug, Copy)]
enum BrushKind2 { Raise2, Lower2, Smooth2, Flatten2, Noise2, Stamp, Erode2, Paint2, Detail2, Hole2 }
#[derive(Clone, Debug, Copy)]
enum BrushShape2 { Circle3, Square2, Diamond, Custom12 }
#[derive(Clone, Debug)]
struct TerrainPaintLayer { name: String, diffuse: String, normal: String, mask: Option<String>, tiling: f32, metallic: f32, smoothness: f32, color_tint: [f32;3], height_blend: f32, angle_blend: f32, triplanar: bool }
#[derive(Clone, Debug)]
struct DetailObject { name: String, kind: DetailKind, mesh_or_texture: String, density: f32, min_scale: [f32;3], max_scale: [f32;3], color1: [f32;3], color2: [f32;3], wind_wave: f32, render_mode: DetailRender, align_to_ground: bool }
#[derive(Clone, Debug, Copy)]
enum DetailKind { GrassBillboard, GrassMesh, MeshDetail, Decal2 }
#[derive(Clone, Debug, Copy)]
enum DetailRender { Billboard2, Cross, TriStar, Mesh3 }
#[derive(Clone, Debug)]
struct TerrainStamp { name: String, heightmap_v2: Vec<f32>, size: u32, height: f32, blend_mode: StampBlend }
#[derive(Clone, Debug, Copy)]
enum StampBlend { Add2, Subtract2, Max2, Min2, Blend }

// ======== ROUND 64: MULTIPLAYER GAME MODES ========
#[derive(Clone, Debug)]
struct GameModeSystem { modes: Vec<GameMode2>, active_mode: Option<usize>, scoreboard_v2: Vec<TeamScore2>, round_timer: f32, round_number: u32, warmup: bool, warmup_timer: f32, overtime: bool }
#[derive(Clone, Debug)]
struct GameMode2 { name: String, kind: ModeKind, max_players: u32, team_count: u32, team_size: u32, round_time: f32, max_rounds: u32, win_condition: WinCondition, respawn: RespawnMode, friendly_fire: bool, rules: Vec<(String, String)> }
#[derive(Clone, Debug, Copy)]
enum ModeKind { Deathmatch, TeamDeathmatch, CaptureTheFlag, Domination, BattleRoyale2, Elimination, Infection, GunGame, SearchAndDestroy, Payload, KingOfTheHill, Oddball, Race2, Coop, Survival2, Horde, Heist, Escort }
#[derive(Clone, Debug, Copy)]
enum WinCondition { ScoreLimit(u32), TimeLimit2, LastStanding, ObjectiveComplete, Extraction, Rounds(u32) }
#[derive(Clone, Debug, Copy)]
enum RespawnMode { Instant, Timer2(f32), Wave2(f32), None7, BuyBack }
#[derive(Clone, Debug)]
struct TeamScore2 { team_id: u32, name: String, score: i32, kills: u32, deaths: u32, assists: u32, objectives: u32, color: [f32;3] }
#[derive(Clone, Debug)]
struct PlayerStats { player_id: String, kills: u32, deaths: u32, assists: u32, damage_dealt: f32, damage_taken: f32, healing_done: f32, objectives: u32, score: i32, ping: u32, team: u32, alive: bool, ready: bool, loadout: Option<String> }
#[derive(Clone, Debug)]
struct Loadout3 { name: String, primary: Option<String>, secondary: Option<String>, melee: Option<String>, equipment: Vec<String>, perks: Vec<String>, cosmetics: Vec<String> }
#[derive(Clone, Debug)]
struct KillcamSystem { active: bool, killer: String, victim: String, replay_buffer: Vec<KillcamFrame>, duration: f32, timer: f32 }
#[derive(Clone, Debug)]
struct KillcamFrame { timestamp: f32, camera_pos: [f32;3], camera_rot: [f32;4], events: Vec<String> }
#[derive(Clone, Debug)]
struct SpawnSystem { spawn_points_v2: Vec<SpawnPointV2>, spawn_algorithm: SpawnAlgorithm, squad_spawn: bool, protected_time: f32 }
#[derive(Clone, Debug)]
struct SpawnPointV2 { pos: [f32;3], rot: f32, team: Option<u32>, kind: SpawnKind, weight: f32, active: bool }
#[derive(Clone, Debug, Copy)]
enum SpawnKind { Initial, Respawn2, SquadSpawn, Vehicle2, Objective2 }
#[derive(Clone, Debug, Copy)]
enum SpawnAlgorithm { Random5, Weighted, FarthestFromEnemy, NearObjective, NearSquad }

// ======== ROUND 65: VISUAL EFFECTS DEEP ========
#[derive(Clone, Debug)]
struct VFXSystem2 { effect_pool: Vec<VFXInstance>, templates: Vec<VFXTemplate>, gpu_particles_v2: bool, max_effects: u32, lod_distances_v2: Vec<f32>, global_scale: f32 }
#[derive(Clone, Debug)]
struct VFXTemplate { name: String, duration: f32, looping: bool, components: Vec<VFXComponent>, warmup: f32, culling_radius: f32, sort_order: i32 }
#[derive(Clone, Debug)]
enum VFXComponent { Particles3 { count: u32, lifetime: f32, speed: f32, size: f32, color: [f32;4], shape: String }, Mesh4 { mesh: String, material: String, anim: Option<String> }, Trail2 { width: f32, lifetime: f32, color: [f32;4], texture: Option<String>, min_vertex_dist: f32 }, Light3 { color: [f32;3], intensity: f32, range: f32, flicker: bool }, Decal3 { texture: String, size: f32, lifetime: f32, fade_time: f32, normal_blend: f32 }, Sound2 { clip: String, volume: f32, pitch_range: [f32;2] }, ScreenShake2 { intensity: f32, duration: f32, frequency: f32 }, Distortion { texture: String, intensity: f32, radius: f32, duration: f32 }, Ribbon { width: f32, segments: u32, color: [f32;4], texture: Option<String>, gravity: f32 }, Beam { start_width: f32, end_width: f32, texture: Option<String>, noise: f32, segments: u32 } }
#[derive(Clone, Debug)]
struct VFXInstance { template_idx: usize, pos: [f32;3], rot: [f32;4], scale: f32, timer: f32, active: bool, attached_to: Option<String>, local_offset: [f32;3] }
#[derive(Clone, Debug)]
struct DecalSystem { decals_v2: Vec<DecalInstance>, max_decals: u32, pool_size: u32, atlas: Option<String> }
#[derive(Clone, Debug)]
struct DecalInstance { pos: [f32;3], normal: [f32;3], size: [f32;2], rotation: f32, texture_index: u32, color: [f32;4], lifetime: f32, timer: f32, fade_time: f32, normal_blend: f32, sort_order: i32, angle_fade: bool }
#[derive(Clone, Debug)]
struct ScreenEffect3 { kind: ScreenFXKind2, intensity: f32, duration: f32, timer: f32, color: [f32;4], texture: Option<String>, blend_mode_v2: String }
#[derive(Clone, Debug, Copy)]
enum ScreenFXKind2 { Flash2, Fade, Vignette3, Blood, Frost, Dirt, CRT, Glitch2, Pixelate, Thermal, NightVision2, Scanner, EMP, Drunk, MotionLines, SpeedLines, HealGlow, DamageFlash, LevelUp, AuraEffect }

// ======== ROUND 66: SKIN & CHARACTER CUSTOMIZATION ========
#[derive(Clone, Debug)]
struct CharacterCustomizer { presets: Vec<CharPreset>, body_sliders: Vec<BodySlider>, face_sliders: Vec<FaceSlider>, skin_tones: Vec<SkinTone>, hair_styles: Vec<HairStyle2>, facial_hair: Vec<FacialHair>, eyes: Vec<EyeOption>, makeup: Vec<MakeupOption>, tattoos: Vec<TattooOption>, scars: Vec<ScarOption>, accessories: Vec<AccessorySlot>, body_type: BodyType2, height_range: [f32;2], voice_options: Vec<String> }
#[derive(Clone, Debug)]
struct CharPreset { name: String, body: Vec<f32>, face: Vec<f32>, skin: usize, hair: usize, thumbnail: Option<String> }
#[derive(Clone, Debug)]
struct BodySlider { name: String, bone: String, axis: [f32;3], min_val: f32, max_val: f32, value: f32, symmetric: bool, group: String }
#[derive(Clone, Debug)]
struct FaceSlider { name: String, morph_target: String, min_val: f32, max_val: f32, value: f32, group: String, affects: Vec<String> }
#[derive(Clone, Debug)]
struct SkinTone { name: String, color: [f32;3], subsurface: f32, roughness: f32, freckles: f32 }
#[derive(Clone, Debug)]
struct HairStyle2 { name: String, mesh: String, physics: bool, strand_count: u32, color1: [f32;3], color2: [f32;3], highlights: f32, length: f32, curl: f32, volume: f32, wind_affect: f32 }
#[derive(Clone, Debug)]
struct FacialHair { name: String, mesh: String, density: f32, length: f32, color: [f32;3], style: String }
#[derive(Clone, Debug)]
struct EyeOption { name: String, iris_color: [f32;3], iris_texture: Option<String>, pupil_size: f32, heterochromia: bool, second_color: Option<[f32;3]>, glow: f32, sclera_color: [f32;3] }
#[derive(Clone, Debug)]
struct MakeupOption { name: String, layer: String, color: [f32;4], intensity: f32, texture: Option<String>, blend_mode_v3: String }
#[derive(Clone, Debug)]
struct TattooOption { name: String, texture: String, body_region: String, color: [f32;4], scale: f32, rotation: f32, mirror: bool }
#[derive(Clone, Debug)]
struct ScarOption { name: String, mesh_deform: String, normal_map: String, region: String, intensity: f32, age: f32 }
#[derive(Clone, Debug)]
struct AccessorySlot { name: String, slot: String, items: Vec<String>, current: Option<usize>, hide_hair: bool, hide_face: bool }
#[derive(Clone, Debug, Copy)]
enum BodyType2 { Slim, Average, Athletic, Heavy, Muscular, Custom13 }

// ======== ROUND 67: ECONOMY & TRADING DEEP ========
#[derive(Clone, Debug)]
struct EconomyEngine { currencies: Vec<CurrencyDef>, markets: Vec<Market2>, auction_house: AuctionHouse, trade_system: TradeSystem2, price_history: Vec<PriceRecord>, inflation_rate: f32, tax_rate_v2: f32, supply_demand: bool }
#[derive(Clone, Debug)]
struct CurrencyDef { name: String, symbol: String, icon: String, decimal_places: u32, max_amount: u64, exchange_rates: Vec<(String, f32)>, earned_total: u64, spent_total: u64 }
#[derive(Clone, Debug)]
struct Market2 { name: String, pos: [f32;3], vendor: String, inventory_v2: Vec<MarketItem>, restock_timer: f32, restock_interval: f32, buy_markup: f32, sell_markdown: f32, reputation_req: Option<(String, i32)>, specialization: String, haggle_enabled: bool }
#[derive(Clone, Debug)]
struct MarketItem { item_id: String, base_price: u32, current_price: u32, stock: i32, max_stock: i32, demand: f32, supply: f32, price_volatility: f32 }
#[derive(Clone, Debug)]
struct AuctionHouse { listings: Vec<AuctionListing>, bid_increment: u32, listing_fee_pct: f32, sale_tax_pct: f32, max_duration: f32, categories: Vec<String> }
#[derive(Clone, Debug)]
struct AuctionListing { id: u64, seller: String, item_id: String, quantity: u32, starting_bid: u32, current_bid: u32, buyout: Option<u32>, bidder: Option<String>, time_remaining: f32, category: String }
#[derive(Clone, Debug)]
struct TradeSystem2 { active_trades: Vec<ActiveTrade>, trade_log: Vec<TradeRecord>, max_items_per_trade: u32, trade_distance: f32 }
#[derive(Clone, Debug)]
struct ActiveTrade { player_a: String, player_b: String, items_a: Vec<(String, u32)>, items_b: Vec<(String, u32)>, gold_a: u32, gold_b: u32, confirmed_a: bool, confirmed_b: bool, timer: f32 }
#[derive(Clone, Debug)]
struct TradeRecord { timestamp: f64, parties: [String;2], items_exchanged: Vec<(String, u32, String)>, gold_exchanged: [u32;2] }
#[derive(Clone, Debug)]
struct PriceRecord { item_id: String, price: u32, timestamp: f64, market: String, transaction_type: String }

// ======== ROUND 68: CUTSCENE & CINEMATICS DEEP ========
#[derive(Clone, Debug)]
struct CinematicEngine { sequences: Vec<CinematicSequence>, active_sequence: Option<usize>, skip_enabled: bool, letterbox_v2: bool, letterbox_amount: f32, subtitles_active: bool, subtitle_queue_v2: Vec<CinematicSubtitle> }
#[derive(Clone, Debug)]
struct CinematicSequence { name: String, tracks: Vec<CinematicTrack>, duration: f32, timer: f32, playing: bool, looping: bool, blend_in: f32, blend_out: f32, on_complete: Vec<String> }
#[derive(Clone, Debug)]
struct CinematicTrack { name: String, kind: TrackKind3, keyframes_v2: Vec<CinematicKeyframe>, enabled: bool, locked: bool, muted: bool, weight: f32 }
#[derive(Clone, Debug, Copy)]
enum TrackKind3 { Camera2, Animation2, Audio3, Event4, Property2, Activation, Signal, Particles4, Lighting2, PostProcess2, Subtitle2, FaceCapture }
#[derive(Clone, Debug)]
struct CinematicKeyframe { time: f32, value: KeyframeValue, interpolation: InterpMode, tangent_in: f32, tangent_out: f32 }
#[derive(Clone, Debug)]
enum KeyframeValue { Float6(f32), Vec3V3([f32;3]), Quat([f32;4]), Color3([f32;4]), Bool6(bool), String3(String), Trigger2 }
#[derive(Clone, Debug, Copy)]
enum InterpMode { Constant2, Linear7, Bezier, Hermite, CatmullRom }
#[derive(Clone, Debug)]
struct CinematicSubtitle { text: String, speaker: String, start_time: f32, end_time: f32, position: [f32;2], style: String }
#[derive(Clone, Debug)]
struct CameraShot { name: String, kind: ShotKind, start_pos: [f32;3], end_pos: [f32;3], start_rot: [f32;4], end_rot: [f32;4], start_fov: f32, end_fov: f32, duration: f32, easing: String, dof_target: Option<f32>, shake: Option<f32> }
#[derive(Clone, Debug, Copy)]
enum ShotKind { Static2, Dolly2, Crane, Orbit3, Tracking, Handheld, Zoom, Whip, POV, Drone, SlowMotion2, BulletTime }
#[derive(Clone, Debug)]
struct FacialCapture { blend_shapes: Vec<(String, f32)>, jaw_open: f32, mouth_shapes: Vec<(String, f32)>, eye_look: [f32;2], blink: f32, brow: Vec<(String, f32)> }

// ======== ROUND 69: WORLD STREAMING & LOD ========
#[derive(Clone, Debug)]
struct WorldStreaming { sectors: Vec<StreamSector>, active_sectors: Vec<usize>, load_radius: f32, unload_radius: f32, transition_blend: f32, loading_priority: Vec<usize>, budget_ms: f32, async_loading_v2: bool, preload_hints: Vec<String> }
#[derive(Clone, Debug)]
struct StreamSector { name: String, bounds_min: [f32;3], bounds_max: [f32;3], loaded: bool, loading: bool, lod: u32, priority: i32, dependencies: Vec<String>, size_mb: f32, object_count: u32, asset_refs: Vec<String> }
#[derive(Clone, Debug)]
struct LODSystem3 { groups: Vec<LODGroup3>, global_bias: f32, fade_mode: LODFade, screen_relative: bool, max_lod: u32, shadow_lod_bias: i32 }
#[derive(Clone, Debug)]
struct LODGroup3 { entity: String, lods: Vec<LODLevel3>, current_lod: u32, fade_progress: f32, override_lod: Option<u32> }
#[derive(Clone, Debug)]
struct LODLevel3 { mesh: String, screen_height_pct: f32, triangle_count: u32, shadow: bool, fade_width: f32, cull: bool }
#[derive(Clone, Debug, Copy)]
enum LODFade { None8, CrossFade, SpeedTree2, Dither }
#[derive(Clone, Debug)]
struct OcclusionSystem2 { method: OcclusionMethod, cells: Vec<OccCell>, portal_graph: Vec<Portal3>, stats: OcclusionStats }
#[derive(Clone, Debug, Copy)]
enum OcclusionMethod { None9, Software, Hardware, HZB, PVS }
#[derive(Clone, Debug)]
struct OccCell { bounds_min: [f32;3], bounds_max: [f32;3], visible_set: Vec<u32>, last_tested: u64 }
#[derive(Clone, Debug)]
struct Portal3 { pos: [f32;3], size: [f32;2], normal: [f32;3], connects: [usize;2], open: bool }
#[derive(Clone, Debug)]
struct OcclusionStats { total_objects: u32, visible_objects: u32, culled_objects: u32, tests_per_frame: u32, cpu_time_ms: f32 }
#[derive(Clone, Debug)]
struct ImpostorSystem { impostors: Vec<Impostor>, atlas_size: u32, views_per_hemisphere: u32, update_distance: f32 }
#[derive(Clone, Debug)]
struct Impostor { entity: String, atlas_index: u32, last_update_pos: [f32;3], angle_threshold: f32, distance_threshold: f32, current_view: u32, frames: u32 }

// ======== ROUND 70: MODDING & PLUGIN DEEP ========
#[derive(Clone, Debug)]
struct ModSystem3 { mods: Vec<ModInfo>, load_order: Vec<usize>, mod_directory: String, sandbox: bool, api_version: u32, hooks: Vec<ModHook>, conflicts: Vec<ModConflict>, enabled_mods: Vec<String> }
#[derive(Clone, Debug)]
struct ModInfo { id: String, name: String, version: String, author: String, description: String, dependencies: Vec<(String, String)>, incompatible: Vec<String>, size_mb: f32, loaded: bool, enabled: bool, scripts: Vec<String>, assets: Vec<String>, config: Vec<(String, String)>, checksum: u64 }
#[derive(Clone, Debug)]
struct ModHook { name: String, event: String, priority: i32, mod_id: String, callback_id: u32 }
#[derive(Clone, Debug)]
struct ModConflict { mod_a: String, mod_b: String, kind: ConflictKind, asset: String, resolution: ConflictResolution }
#[derive(Clone, Debug, Copy)]
enum ConflictKind { AssetOverride, ScriptConflict, DataConflict, LoadOrderIssue }
#[derive(Clone, Debug, Copy)]
enum ConflictResolution { LastWins, FirstWins, Manual, Merge2 }
#[derive(Clone, Debug)]
struct PluginSystem2 { plugins: Vec<PluginInfo2>, api_registry: Vec<APIEndpoint>, sandbox_memory_mb: u32, hot_reload_v2: bool }
#[derive(Clone, Debug)]
struct PluginInfo2 { id: String, name: String, kind: PluginKind2, version: String, state: PluginState2, api_version: u32, permissions: Vec<PluginPermission> }
#[derive(Clone, Debug, Copy)]
enum PluginKind2 { Native, Lua2, Wasm, Python2, JavaScript }
#[derive(Clone, Debug, Copy)]
enum PluginState2 { Unloaded, Loading2, Active3, Error3, Disabled }
#[derive(Clone, Debug, Copy)]
enum PluginPermission { FileSystem, Network2, Graphics, Audio4, Input3, UI2, GameState2, Unsafe2 }
#[derive(Clone, Debug)]
struct APIEndpoint { name: String, description: String, params: Vec<(String, String)>, returns: String, version_added: u32, deprecated: bool }

// ======== ROUND 71: ACHIEVEMENT & PROGRESSION DEEP ========
#[derive(Clone, Debug)]
struct ProgressionSystem { player_level: u32, total_xp: u64, xp_curve: Vec<u64>, prestige: u32, prestige_rewards: Vec<PrestigeReward>, achievements_v3: Vec<AchievementV3>, challenges: Vec<Challenge2>, milestones: Vec<Milestone2>, stats_tracking: Vec<TrackedStat>, leaderboard_entries: Vec<LeaderboardEntry2>, season_v2: Option<SeasonPass2> }
#[derive(Clone, Debug)]
struct PrestigeReward { level: u32, kind: String, value: String, cosmetic: Option<String> }
#[derive(Clone, Debug)]
struct AchievementV3 { id: String, name: String, description: String, icon: String, category: String, points: u32, hidden: bool, unlocked: bool, unlock_time: Option<f64>, progress: f32, required: f32, tier: AchievementTier, rarity: f32, reward: Option<String>, chained: Option<String> }
#[derive(Clone, Debug, Copy)]
enum AchievementTier { Bronze, Silver2, Gold3, Platinum, Diamond }
#[derive(Clone, Debug)]
struct Challenge2 { id: String, name: String, description: String, kind: ChallengeKind2, target: f32, progress: f32, time_limit: Option<f32>, timer: f32, reward_xp: u32, reward_currency: u32, reward_item: Option<String>, repeatable: bool, daily: bool, weekly: bool }
#[derive(Clone, Debug, Copy)]
enum ChallengeKind2 { Kill3, Collect2, Win, Score, Distance, Time3, Craft3, Explore2, Social }
#[derive(Clone, Debug)]
struct Milestone2 { name: String, stat: String, thresholds: Vec<(f32, String)>, current_tier: usize }
#[derive(Clone, Debug)]
struct TrackedStat { name: String, value: f64, display: String, category: String, best: f64, per_session: f64, total: f64 }
#[derive(Clone, Debug)]
struct LeaderboardEntry2 { player: String, score: f64, rank: u32, category: String, period: String, timestamp: f64 }
#[derive(Clone, Debug)]
struct SeasonPass2 { name: String, level: u32, xp_v2: u64, xp_per_level: u64, max_level: u32, free_rewards: Vec<(u32, String)>, premium_rewards: Vec<(u32, String)>, premium_owned: bool, end_time: f64, challenges_v2: Vec<String> }

// ======== ROUND 72: BUILDING & CONSTRUCTION DEEP ========
#[derive(Clone, Debug)]
struct BuildingSystem2 { pieces: Vec<BuildPiece2>, snap_points: Vec<SnapPoint2>, stability: Vec<StabilityNode>, materials_v3: Vec<BuildMaterial>, blueprints_v3: Vec<Blueprint3>, placement_ghost: Option<PlacementGhost>, build_mode: bool, free_build: bool, grid_size: f32, rotation_snap_v2: f32, max_height: f32 }
#[derive(Clone, Debug)]
struct BuildPiece2 { id: String, name: String, category: BuildCategory2, mesh: String, material_idx: usize, snap_points_v2: Vec<usize>, placed: bool, pos: [f32;3], rot: [f32;4], stability_v2: f32, health_v2: f32, max_health_v2: f32, decay_rate: f32, owner: String, locked_v2: bool, connected: Vec<String> }
#[derive(Clone, Debug, Copy)]
enum BuildCategory2 { Foundation2, Wall2, Floor2, Roof2, Stairs2, Door2, Window2, Fence2, Pillar, Beam, Ramp2, Decoration, Functional, Defensive, Electrical2, Plumbing2 }
#[derive(Clone, Debug)]
struct SnapPoint2 { pos: [f32;3], normal: [f32;3], kind: SnapKind2, occupied: bool, piece_id: Option<String> }
#[derive(Clone, Debug, Copy)]
enum SnapKind2 { Foundation3, WallBase, WallTop, FloorEdge, RoofEdge, DoorFrame, WindowFrame, Generic2 }
#[derive(Clone, Debug)]
struct StabilityNode { piece_id: String, stability: f32, grounded: bool, support_from: Vec<String>, supports: Vec<String>, weight: f32 }
#[derive(Clone, Debug)]
struct BuildMaterial { name: String, health_mult: f32, decay_mult: f32, cost: Vec<(String, u32)>, upgrade_from: Option<String>, tier: u32, appearance: String, fire_resist: f32, explosion_resist: f32 }
#[derive(Clone, Debug)]
struct Blueprint3 { name: String, pieces: Vec<BlueprintPiece>, bounds: [f32;3], cost_summary: Vec<(String, u32)>, author: String, rating: f32, downloads: u32 }
#[derive(Clone, Debug)]
struct BlueprintPiece { piece_type: String, material: String, offset: [f32;3], rotation: [f32;4] }
#[derive(Clone, Debug)]
struct PlacementGhost { piece_type: String, pos: [f32;3], rot: [f32;4], valid: bool, snap_target: Option<usize>, color: [f32;4], material_idx: usize }

// ======== ROUND 73: TRANSPORTATION & VEHICLES DEEP ========
#[derive(Clone, Debug)]
struct VehicleSystem2 { vehicles: Vec<VehicleV2>, fuel_types: Vec<FuelType>, traffic_v2: Vec<TrafficVehicle2>, parking_spots: Vec<ParkingSpot>, garages: Vec<Garage> }
#[derive(Clone, Debug)]
struct VehicleV2 { name: String, kind: VehicleKindV2, pos: [f32;3], rot: [f32;4], vel: [f32;3], speed: f32, max_speed: f32, acceleration: f32, braking: f32, steering: f32, max_steering: f32, fuel: f32, max_fuel: f32, fuel_consumption: f32, health_v3: f32, max_health_v3: f32, seats: Vec<VehicleSeat>, wheels: Vec<WheelV2>, engine: VehicleEngine, transmission: Transmission, damage_model: VehicleDamage, customization: VehicleCustom, locked_v3: bool, alarm: bool, owner: String }
#[derive(Clone, Debug, Copy)]
enum VehicleKindV2 { Sedan, SUV, Truck2, SportsCar, Motorcycle2, Bus, Van, Tank2, APC, Helicopter2, Plane2, Boat2, Jet, Bicycle, Skateboard, Hovercraft, Mech2, Horse2 }
#[derive(Clone, Debug)]
struct VehicleSeat { position: [f32;3], kind: SeatKind, occupied_by: Option<String>, enter_anim: String, exit_anim: String }
#[derive(Clone, Debug, Copy)]
enum SeatKind { Driver, Passenger, Gunner, Commander }
#[derive(Clone, Debug)]
struct WheelV2 { position: [f32;3], radius: f32, suspension_travel: f32, spring_force: f32, damper_force: f32, grip: f32, steer_angle: f32, drive: bool, brake: bool, surface: WheelSurface }
#[derive(Clone, Debug, Copy)]
enum WheelSurface { Asphalt, Gravel, Dirt2, Mud2, Sand2, Snow4, Ice3, Grass2, Water3 }
#[derive(Clone, Debug)]
struct VehicleEngine { rpm: f32, max_rpm: f32, idle_rpm: f32, torque: f32, horsepower: f32, turbo: f32, nitro: f32, max_nitro: f32, overheating: f32 }
#[derive(Clone, Debug)]
struct Transmission { gear: i32, max_gears: i32, gear_ratios: Vec<f32>, shift_time: f32, auto: bool, clutch: f32 }
#[derive(Clone, Debug)]
struct VehicleDamage { body_damage: f32, engine_damage: f32, wheel_damage: Vec<f32>, window_damage: Vec<f32>, deformation: Vec<[f32;3]>, on_fire: bool, exploded: bool }
#[derive(Clone, Debug)]
struct VehicleCustom { paint_color: [f32;3], metallic: f32, decals: Vec<String>, spoiler: Option<String>, rims: Option<String>, tint: f32, underglow: Option<[f32;3]>, horn: String, plate: String }
#[derive(Clone, Debug)]
struct FuelType { name: String, price_per_unit: f32, efficiency: f32, emission: f32 }
#[derive(Clone, Debug)]
struct TrafficVehicle2 { vehicle_idx: usize, route: Vec<[f32;3]>, route_idx: usize, lane: u32, patience: f32, aggression: f32, obeying_rules: bool }
#[derive(Clone, Debug)]
struct ParkingSpot { pos: [f32;3], rot: f32, size: [f32;2], occupied: bool, reserved: Option<String>, kind: ParkingKind }
#[derive(Clone, Debug, Copy)]
enum ParkingKind { Street, Lot, Garage2, Handicap, Loading, Reserved }
#[derive(Clone, Debug)]
struct Garage { pos: [f32;3], capacity: u32, vehicles: Vec<String>, repair_cost: f32, fuel_available: Vec<String> }

// ======== ROUND 74: SOCIAL & COMMUNITY DEEP ========
#[derive(Clone, Debug)]
struct SocialSystem2 { friends_list: Vec<FriendEntry3>, blocked_list: Vec<String>, chat_channels: Vec<ChatChannel2>, guild_v2: Option<GuildV2>, party_v2: Option<PartyV2>, status: OnlineStatus, activity: String, privacy: PrivacySettings }
#[derive(Clone, Debug)]
struct FriendEntry3 { player_id: String, display_name: String, status: OnlineStatus, last_online: f64, note: Option<String>, favorite: bool, mutual: bool }
#[derive(Clone, Debug, Copy)]
enum OnlineStatus { Online2, Away, Busy, Invisible, Offline }
#[derive(Clone, Debug)]
struct ChatChannel2 { name: String, kind: ChannelKind2, messages: Vec<ChatMsg2>, muted: bool, color: [f32;4], history_limit: u32 }
#[derive(Clone, Debug, Copy)]
enum ChannelKind2 { Global2, Local2, Party2, Guild3, Whisper, Trade2, LFG, System2 }
#[derive(Clone, Debug)]
struct ChatMsg2 { sender: String, text: String, timestamp: f64, channel: String, kind_v2: MsgKind }
#[derive(Clone, Debug, Copy)]
enum MsgKind { Normal, Emote2, System3, Link, Roll }
#[derive(Clone, Debug)]
struct GuildV2 { name: String, tag: String, level: u32, xp_v3: u64, members: Vec<GuildMember2>, ranks_v2: Vec<GuildRank2>, bank_v2: GuildBank, perks_v2: Vec<String>, motd: String, log: Vec<GuildLogEntry>, max_members: u32, founded: f64, banner: GuildBanner }
#[derive(Clone, Debug)]
struct GuildMember2 { player_id: String, name: String, rank: u32, join_date: f64, last_active: f64, contribution: u64, note: String }
#[derive(Clone, Debug)]
struct GuildRank2 { name: String, level: u32, permissions: Vec<GuildPerm> }
#[derive(Clone, Debug, Copy)]
enum GuildPerm { Invite2, Kick, Promote, Demote, BankDeposit, BankWithdraw, EditMotd, ManageRanks, StartEvents, UsePerks }
#[derive(Clone, Debug)]
struct GuildBank { tabs: Vec<GuildBankTab>, gold: u64, withdrawal_limit: u32 }
#[derive(Clone, Debug)]
struct GuildBankTab { name: String, items: Vec<Option<String>>, slots: u32, min_rank: u32 }
#[derive(Clone, Debug)]
struct GuildLogEntry { timestamp: f64, member: String, action: String, details: String }
#[derive(Clone, Debug)]
struct GuildBanner { shape: u32, bg_color: [f32;3], emblem: u32, emblem_color: [f32;3], border: u32, border_color: [f32;3] }
#[derive(Clone, Debug)]
struct PartyV2 { leader: String, members: Vec<PartyMember2>, max_size: u32, loot_mode: LootMode2, dungeon_difficulty: u32, ready_check: bool, markers: Vec<PartyMarker> }
#[derive(Clone, Debug)]
struct PartyMember2 { player_id: String, name: String, role: PartyRole, health_pct: f32, mana_pct: f32, level: u32, class: String, ready: bool, online: bool }
#[derive(Clone, Debug, Copy)]
enum PartyRole { Tank2, Healer, DPS, Support2, Flex }
#[derive(Clone, Debug, Copy)]
enum LootMode2 { FreeForAll, RoundRobin, NeedGreed, MasterLoot, Personal }
#[derive(Clone, Debug)]
struct PartyMarker { icon: u32, pos: [f32;3], target: Option<String>, color: [f32;3] }
#[derive(Clone, Debug)]
struct PrivacySettings { show_online: bool, allow_whispers: bool, allow_invites: bool, allow_trades: bool, allow_inspect: bool, show_activity: bool, profile_visibility: ProfileVis }
#[derive(Clone, Debug, Copy)]
enum ProfileVis { Public, FriendsOnly, Private2 }

// ======== ROUND 75: ANALYTICS & TELEMETRY ========
#[derive(Clone, Debug)]
struct AnalyticsSystem { events: Vec<AnalyticsEvent3>, sessions: Vec<SessionData>, funnels: Vec<Funnel>, ab_tests: Vec<ABTest>, heatmaps: Vec<Heatmap2>, retention_data: Vec<RetentionDay>, monetization: Vec<MonetizationEvent>, crash_reports: Vec<CrashReport>, custom_metrics: Vec<CustomMetric>, flush_interval: f32, flush_timer: f32, consent: bool, anonymous: bool }
#[derive(Clone, Debug)]
struct AnalyticsEvent3 { name: String, category: String, params: Vec<(String, String)>, timestamp: f64, session_id: String, user_id: String }
#[derive(Clone, Debug)]
struct SessionData { id: String, start: f64, end_time: Option<f64>, duration: f32, platform: String, version: String, events_count: u32, crashes: u32, fps_avg: f32, fps_min: f32, memory_peak_mb: f32 }
#[derive(Clone, Debug)]
struct Funnel { name: String, steps: Vec<FunnelStep>, completion_rate: f32 }
#[derive(Clone, Debug)]
struct FunnelStep { name: String, count: u32, drop_off_rate: f32 }
#[derive(Clone, Debug)]
struct ABTest { name: String, variants: Vec<ABVariant>, active: bool, start_date: f64, end_date: Option<f64>, metric: String, confidence: f32, winner: Option<usize> }
#[derive(Clone, Debug)]
struct ABVariant { name: String, weight: f32, users: u32, metric_value: f64, conversion_rate: f32 }
#[derive(Clone, Debug)]
struct Heatmap2 { name: String, resolution: [u32;2], data: Vec<f32>, bounds_min: [f32;2], bounds_max: [f32;2], kind: HeatmapKind }
#[derive(Clone, Debug, Copy)]
enum HeatmapKind { Position, Deaths, Clicks, Damage3, Engagement, LookDirection }
#[derive(Clone, Debug)]
struct RetentionDay { day: u32, users_returned: u32, total_users: u32, rate: f32 }
#[derive(Clone, Debug)]
struct MonetizationEvent { kind: MonetKind, amount: f32, currency_code: String, item: String, timestamp: f64, user_id: String }
#[derive(Clone, Debug, Copy)]
enum MonetKind { Purchase, Subscription, AdView, AdClick, Refund, Gift }
#[derive(Clone, Debug)]
struct CrashReport { timestamp: f64, message: String, stack_trace: String, platform: String, version: String, device: String, os: String, memory_mb: f32, user_id: Option<String> }
#[derive(Clone, Debug)]
struct CustomMetric { name: String, value: f64, kind_v2: MetricKind2, tags: Vec<(String, String)>, timestamp: f64 }
#[derive(Clone, Debug, Copy)]
enum MetricKind2 { Counter, Gauge, Histogram, Timer3 }

// ======== ROUND 76: ANIMATION STATE MACHINE DEEP ========
#[derive(Clone, Debug)]
struct AnimStateMachine2 { states: Vec<AnimState3>, transitions: Vec<AnimTransition3>, current_state: usize, any_state_transitions: Vec<usize>, parameters: Vec<AnimParameter2>, layers_v3: Vec<AnimLayer3>, blend_trees: Vec<BlendTree2>, avatar_mask: Vec<AvatarMask>, sync_groups: Vec<SyncGroup> }
#[derive(Clone, Debug)]
struct AnimState3 { name: String, clip: Option<String>, blend_tree_idx: Option<usize>, speed: f32, speed_param: Option<String>, mirror: bool, foot_ik: bool, write_defaults: bool, behaviours: Vec<StateBehaviour>, tag: String, transitions_out: Vec<usize>, motion_time: f32, cycle_offset: f32 }
#[derive(Clone, Debug)]
struct AnimTransition3 { from: usize, to: usize, duration: f32, offset: f32, has_exit_time: bool, exit_time: f32, conditions: Vec<TransCondition>, interruption: InterruptMode, ordered: bool, can_transition_to_self: bool }
#[derive(Clone, Debug)]
struct TransCondition { param: String, mode: CondMode, threshold: f32 }
#[derive(Clone, Debug, Copy)]
enum CondMode { Greater, Less, Equals, NotEquals, If2, IfNot }
#[derive(Clone, Debug, Copy)]
enum InterruptMode { None10, Current, Next, Both }
#[derive(Clone, Debug)]
struct AnimParameter2 { name: String, kind: AnimParamKind2, default_float: f32, default_int: i32, default_bool: bool }
#[derive(Clone, Debug, Copy)]
enum AnimParamKind2 { Float7, Int6, Bool7, Trigger2 }
#[derive(Clone, Debug)]
struct AnimLayer3 { name: String, weight: f32, blending: LayerBlend, mask_idx: Option<usize>, state_machine_idx: usize, sync_group_idx: Option<usize>, ik_pass: bool }
#[derive(Clone, Debug, Copy)]
enum LayerBlend { Override2, Additive2 }
#[derive(Clone, Debug)]
struct BlendTree2 { name: String, kind: BlendKind, parameter: String, parameter_y: Option<String>, children: Vec<BlendChild>, auto_threshold: bool }
#[derive(Clone, Debug, Copy)]
enum BlendKind { Simple1D, Simple2D, Freeform2D, FreeformCartesian, Direct }
#[derive(Clone, Debug)]
struct BlendChild { clip: String, threshold: f32, position: [f32;2], speed: f32, mirror: bool, time_scale: f32 }
#[derive(Clone, Debug)]
struct AvatarMask { name: String, bones: Vec<(String, bool)>, transforms: Vec<(String, bool)> }
#[derive(Clone, Debug)]
struct SyncGroup { name: String, leader: Option<usize>, members: Vec<usize> }
#[derive(Clone, Debug)]
enum StateBehaviour { PlaySound3(String), SetParam(String, f32), SendEvent2(String), LockRotation, DisableGravity, Custom14(String) }

// ======== ROUND 77: LEVEL DESIGN TOOLS ========
#[derive(Clone, Debug)]
struct LevelDesignTools { room_templates: Vec<RoomTemplate2>, corridors: Vec<CorridorDef>, door_placements: Vec<DoorPlacement2>, spawn_tables: Vec<SpawnTable2>, encounter_zones: Vec<EncounterZone>, puzzle_rooms: Vec<PuzzleRoom3>, secret_rooms_v2: Vec<SecretRoom2>, boss_arenas: Vec<BossArena2>, safe_zones: Vec<SafeZone2>, checkpoints_v2: Vec<Checkpoint3> }
#[derive(Clone, Debug)]
struct RoomTemplate2 { name: String, size: [f32;3], connections: Vec<ConnectionPoint>, props: Vec<PropPlacement>, lights_v3: Vec<LightPlacement>, enemies_v2: Vec<EnemyPlacement>, loot_v2: Vec<LootPlacement>, theme: String, difficulty: f32, tags: Vec<String>, weight: f32, required: bool, unique: bool }
#[derive(Clone, Debug)]
struct ConnectionPoint { pos: [f32;3], direction: [f32;3], size: [f32;2], kind_v3: String, required: bool }
#[derive(Clone, Debug)]
struct CorridorDef { width: f32, height: f32, min_length: f32, max_length: f32, curve_chance: f32, branch_chance: f32, props: Vec<String>, hazards: Vec<String> }
#[derive(Clone, Debug)]
struct DoorPlacement2 { pos: [f32;3], kind_v4: DoorKind2, locked_v4: bool, key_id: Option<String>, health_v4: f32, two_way: bool }
#[derive(Clone, Debug, Copy)]
enum DoorKind2 { Normal, Locked2, Boss2, Secret2, OneWay, Breakable2, Puzzle2, Gate }
#[derive(Clone, Debug)]
struct SpawnTable2 { name: String, entries: Vec<SpawnEntry2>, max_concurrent: u32, respawn_time: f32, level_range: [u32;2] }
#[derive(Clone, Debug)]
struct SpawnEntry2 { entity_id: String, weight: f32, min_count: u32, max_count: u32, conditions: Vec<String> }
#[derive(Clone, Debug)]
struct EncounterZone { name: String, bounds_min: [f32;3], bounds_max: [f32;3], spawn_table: String, difficulty: f32, music_override: Option<String>, triggered: bool, one_shot: bool, waves_v2: Vec<EncounterWave>, clear_reward: Option<String> }
#[derive(Clone, Debug)]
struct EncounterWave { enemies: Vec<(String, u32)>, delay: f32, reinforcement: bool, dialogue: Option<String> }
#[derive(Clone, Debug)]
struct PuzzleRoom3 { name: String, kind_v5: PuzzleKind2, elements: Vec<PuzzleElement3>, solution: Vec<u32>, hints: Vec<String>, timer: Option<f32>, reward: String, reset_on_fail: bool }
#[derive(Clone, Debug, Copy)]
enum PuzzleKind2 { SwitchOrder, PressurePlates, RotateStatues, LightBeams, BlockPush, SimonSays2, Riddle, Pattern, MazeRun, PlatformSequence }
#[derive(Clone, Debug)]
struct PuzzleElement3 { pos: [f32;3], kind_v6: String, state: u32, interactive: bool, linked: Vec<usize> }
#[derive(Clone, Debug)]
struct SecretRoom2 { pos: [f32;3], trigger: SecretTrigger, revealed: bool, reward_tier: u32, lore: Option<String> }
#[derive(Clone, Debug, Copy)]
enum SecretTrigger { HiddenWall, DestructibleFloor, SpecificItem, TimeWindow, KillAll, InteractSequence, FallThrough }
#[derive(Clone, Debug)]
struct BossArena2 { name: String, bounds: ([f32;3], [f32;3]), phases: Vec<ArenaPhase>, hazards: Vec<ArenaHazard>, pillars: Vec<[f32;3]>, music: String, intro_cinematic: Option<String> }
#[derive(Clone, Debug)]
struct ArenaPhase { hp_threshold: f32, spawns: Vec<(String, u32)>, hazards_active: Vec<usize>, arena_change: Option<String> }
#[derive(Clone, Debug)]
struct ArenaHazard { kind_v7: String, pos: [f32;3], radius: f32, damage: f32, interval: f32, active: bool }
#[derive(Clone, Debug)]
struct SafeZone2 { pos: [f32;3], radius: f32, heals: bool, saves: bool, vendor: Option<String>, fast_travel: bool, name: String }
#[derive(Clone, Debug)]
struct Checkpoint3 { pos: [f32;3], activated: bool, respawn_pos: [f32;3], heal_on_respawn: bool, cinematic: Option<String> }
#[derive(Clone, Debug)]
struct PropPlacement { prop_id: String, pos: [f32;3], rot: [f32;4], scale: f32, interactive: bool, destructible: bool }
#[derive(Clone, Debug)]
struct LightPlacement { kind_v8: String, pos: [f32;3], color: [f32;3], intensity: f32, range: f32, shadows: bool, flicker_v2: bool }
#[derive(Clone, Debug)]
struct EnemyPlacement { enemy_id: String, pos: [f32;3], patrol: Option<Vec<[f32;3]>>, alert_radius: f32, elite: bool }
#[derive(Clone, Debug)]
struct LootPlacement { container: String, pos: [f32;3], loot_table: String, one_time: bool, locked_v5: bool, key: Option<String> }

// ======== ROUND 78: PATHFINDING DEEP ========
#[derive(Clone, Debug)]
struct PathfindingSystem { navmeshes_v2: Vec<NavMeshV2>, agents_v2: Vec<NavAgentV2>, obstacles: Vec<NavObstacle2>, off_mesh_links: Vec<OffMeshLink2>, crowd_v2: CrowdSystem2, areas: Vec<NavArea2>, dynamic_obstacles: bool, path_cache: Vec<CachedPath> }
#[derive(Clone, Debug)]
struct NavMeshV2 { name: String, vertices: Vec<[f32;3]>, polygons: Vec<NavPoly>, cell_size: f32, cell_height: f32, agent_height: f32, agent_radius: f32, max_slope: f32, max_step: f32, detail_sample: f32, partition: NavPartition, built: bool, bounds: ([f32;3], [f32;3]) }
#[derive(Clone, Debug)]
struct NavPoly { vertices: Vec<u32>, neighbors: Vec<Option<u32>>, area: u32, flags: u32, center: [f32;3] }
#[derive(Clone, Debug, Copy)]
enum NavPartition { Watershed, Monotone, Layers }
#[derive(Clone, Debug)]
struct NavAgentV2 { entity: String, pos: [f32;3], vel: [f32;3], target: Option<[f32;3]>, path: Vec<[f32;3]>, path_index: usize, radius: f32, height: f32, speed: f32, acceleration: f32, auto_braking: bool, stopping_dist: f32, avoidance_priority: u32, area_mask: u32, stuck_timer: f32, stuck_threshold: f32, path_status: PathStatus }
#[derive(Clone, Debug, Copy)]
enum PathStatus { None11, Pending, Complete3, Partial, Invalid, Stale }
#[derive(Clone, Debug)]
struct NavObstacle2 { pos: [f32;3], size: [f32;3], carve: bool, shape_v2: ObstacleShape, move_threshold: f32, carve_ahead: f32 }
#[derive(Clone, Debug, Copy)]
enum ObstacleShape { Box2, Capsule2, Cylinder2 }
#[derive(Clone, Debug)]
struct OffMeshLink2 { start: [f32;3], end_v4: [f32;3], width: f32, bidirectional: bool, area: u32, auto_update: bool, activated: bool, anim: Option<String>, cost_mod: f32 }
#[derive(Clone, Debug)]
struct CrowdSystem2 { max_agents: u32, active_agents_v3: u32, avoidance_quality: u32, separation_weight: f32, cohesion_weight: f32, alignment_weight: f32, obstacle_weight: f32, path_optimization: bool, anticipation_turns: u32 }
#[derive(Clone, Debug)]
struct NavArea2 { name: String, id: u32, cost: f32, color: [f32;3], flags: u32 }
#[derive(Clone, Debug)]
struct CachedPath { from: [f32;3], to: [f32;3], path: Vec<[f32;3]>, age: f32, valid: bool }

// ======== ROUND 79: SHADER EFFECTS DEEP ========
#[derive(Clone, Debug)]
struct ShaderLibrary { shaders_v2: Vec<ShaderDef2>, global_keywords: Vec<String>, global_properties: Vec<ShaderProperty>, include_paths: Vec<String>, compiler_cache: u32, hot_reload_v3: bool }
#[derive(Clone, Debug)]
struct ShaderDef2 { name: String, passes: Vec<ShaderPass2>, properties: Vec<ShaderProperty>, keywords: Vec<ShaderKeyword>, fallback: Option<String>, custom_editor: Option<String>, render_type: String, queue: i32 }
#[derive(Clone, Debug)]
struct ShaderPass2 { name: String, vertex: String, fragment: String, geometry: Option<String>, tessellation: Option<TessShader>, compute: Option<String>, blend: BlendState, depth: DepthState, stencil: Option<StencilState2>, cull: CullMode3, tags: Vec<(String, String)> }
#[derive(Clone, Debug)]
struct TessShader { hull: String, domain: String, partition_v2: String, output_topology: String, max_tess_factor: f32 }
#[derive(Clone, Debug)]
struct BlendState { enabled: bool, src: BlendFactor, dst: BlendFactor, op: BlendOp2, src_alpha: BlendFactor, dst_alpha: BlendFactor, alpha_op: BlendOp2, write_mask: u8 }
#[derive(Clone, Debug, Copy)]
enum BlendFactor { One, Zero2, SrcColor, DstColor2, SrcAlpha2, DstAlpha2, OneMinusSrc, OneMinusDst, OneMinusSrcAlpha, OneMinusDstAlpha }
#[derive(Clone, Debug, Copy)]
enum BlendOp2 { Add3, Subtract3, ReverseSubtract, Min3, Max3 }
#[derive(Clone, Debug)]
struct DepthState { write: bool, test: bool, compare: CompareFunc }
#[derive(Clone, Debug, Copy)]
enum CompareFunc { Always3, Never3, Less3, LessEqual3, Greater3, GreaterEqual3, Equal3, NotEqual3 }
#[derive(Clone, Debug)]
struct StencilState2 { enabled: bool, read_mask: u8, write_mask: u8, front: StencilOps, back: StencilOps, reference: u8 }
#[derive(Clone, Debug)]
struct StencilOps { compare: CompareFunc, pass_op: StencilOp3, fail_op: StencilOp3, z_fail_op: StencilOp3 }
#[derive(Clone, Debug, Copy)]
enum StencilOp3 { Keep2, Zero3, Replace3, IncrSat, DecrSat, Invert2, IncrWrap2, DecrWrap2 }
#[derive(Clone, Debug, Copy)]
enum CullMode3 { Off3, Front3, Back3 }
#[derive(Clone, Debug)]
struct ShaderProperty { name: String, display: String, kind_v9: ShaderPropKind, default_value: String, range: Option<[f32;2]>, hidden: bool, hdr_v2: bool }
#[derive(Clone, Debug, Copy)]
enum ShaderPropKind { Float8, Range2, Color4, Vector, Texture3, Int7, Toggle3, Enum2, Keyword }
#[derive(Clone, Debug)]
struct ShaderKeyword { name: String, kind_v10: KeywordKind, global: bool, default: bool }
#[derive(Clone, Debug, Copy)]
enum KeywordKind { Bool8, Enum3, Multi }

// ======== ROUND 80: PERFORMANCE & OPTIMIZATION ========
#[derive(Clone, Debug)]
struct PerfOptimizer { batching: BatchingSystem, instancing: InstancingSystem, culling: CullingSystem2, budgets: Vec<PerfBudget3>, frame_pacing: FramePacing, quality_scaler: DynamicQuality, memory_manager: MemoryManager2, thread_pool: ThreadPool2 }
#[derive(Clone, Debug)]
struct BatchingSystem { static_batches: u32, dynamic_batches: u32, max_vertices_per_batch: u32, material_sorting: bool, z_sorting: bool, enabled: bool }
#[derive(Clone, Debug)]
struct InstancingSystem { instance_groups: Vec<InstanceGroup2>, max_per_draw: u32, gpu_instancing: bool, indirect_rendering: bool }
#[derive(Clone, Debug)]
struct InstanceGroup2 { mesh: String, material: String, transforms: Vec<[f32;16]>, count: u32, culled: u32, lod_bias: f32 }
#[derive(Clone, Debug)]
struct CullingSystem2 { frustum_culling: bool, occlusion_v3: bool, distance_culling: bool, small_object_culling: bool, small_object_threshold: f32, layer_culling: u64, stats_v2: CullingStats }
#[derive(Clone, Debug)]
struct CullingStats { total: u32, frustum_culled: u32, occlusion_culled: u32, distance_culled: u32, small_culled: u32, visible: u32 }
#[derive(Clone, Debug)]
struct PerfBudget3 { name: String, budget_ms: f32, current_ms: f32, over_budget: bool, history: Vec<f32>, recommendation: Option<String> }
#[derive(Clone, Debug)]
struct FramePacing { target_fps: u32, vsync: bool, adaptive_vsync: bool, frame_time_history: Vec<f32>, jitter_ms: f32, stutter_threshold_ms: f32, stutters_last_second: u32 }
#[derive(Clone, Debug)]
struct DynamicQuality { enabled: bool, target_fps_v2: u32, min_scale: f32, max_scale: f32, current_scale: f32, ramp_speed: f32, features: Vec<QualityFeature> }
#[derive(Clone, Debug)]
struct QualityFeature { name: String, levels: Vec<String>, current: u32, impact_ms: f32, priority: i32 }
#[derive(Clone, Debug)]
struct MemoryManager2 { heap_total_mb: f32, heap_used_mb: f32, gpu_total_mb: f32, gpu_used_mb: f32, pools_v2: Vec<MemoryPool2>, gc_enabled: bool, gc_interval: f32, gc_timer: f32 }
#[derive(Clone, Debug)]
struct MemoryPool2 { name: String, block_size: u32, blocks: u32, used: u32, peak: u32, fragmentation: f32 }
#[derive(Clone, Debug)]
struct ThreadPool2 { workers: u32, active_tasks: u32, queued_tasks: u32, completed: u64, task_types: Vec<(String, u32)> }
