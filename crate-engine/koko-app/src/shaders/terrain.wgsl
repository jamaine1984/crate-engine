// Procedural terrain — heightmap with multi-texture splatting

struct CameraUniform {
    view_proj: mat4x4<f32>,
    view: mat4x4<f32>,
    position: vec4<f32>,
};
struct ModelUniform {
    model: mat4x4<f32>,
    color: vec4<f32>,
};
struct TerrainParams {
    time: f32,
    height_scale: f32,
    texture_scale: f32,
    _pad: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraUniform;
@group(1) @binding(0) var<uniform> model: ModelUniform;
@group(2) @binding(0) var<uniform> terrain: TerrainParams;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) color: vec4<f32>,
};
struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_pos: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) height: f32,
};

fn hash(p: vec2<f32>) -> f32 { return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453); }
fn noise(p: vec2<f32>) -> f32 {
    let i = floor(p); let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
fn fbm(p: vec2<f32>) -> f32 {
    var v = 0.0; var a = 0.5; var pp = p;
    let rot = mat2x2<f32>(0.8, 0.6, -0.6, 0.8);
    for (var i = 0; i < 6; i++) { v += a * noise(pp); pp = rot * pp * 2.0; a *= 0.5; }
    return v;
}

fn terrain_height(p: vec2<f32>) -> f32 {
    let h1 = fbm(p * 0.1) * 2.0;  // broad mountains
    let h2 = fbm(p * 0.3 + 5.0) * 0.8;  // hills
    let h3 = fbm(p * 1.0 + 10.0) * 0.15;  // detail
    return (h1 + h2 + h3) - 1.0;
}

fn terrain_normal(p: vec2<f32>) -> vec3<f32> {
    let eps = 0.1;
    let hc = terrain_height(p);
    let hx = terrain_height(p + vec2<f32>(eps, 0.0));
    let hz = terrain_height(p + vec2<f32>(0.0, eps));
    return normalize(vec3<f32>(hc - hx, eps, hc - hz));
}

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var pos = (model.model * vec4<f32>(in.position, 1.0)).xyz;
    let h = terrain_height(pos.xz) * terrain.height_scale;
    pos.y = h;
    var out: VertexOutput;
    out.clip_position = camera.view_proj * vec4<f32>(pos, 1.0);
    out.world_pos = pos;
    out.normal = terrain_normal(pos.xz);
    out.uv = pos.xz * terrain.texture_scale;
    out.height = h;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let N = normalize(in.normal);
    let V = normalize(camera.position.xyz - in.world_pos);
    let sun_dir = normalize(vec3<f32>(0.5, 0.7, 0.4));
    let slope = 1.0 - N.y;  // 0 = flat, 1 = vertical
    
    // Multi-texture splatting by height and slope
    let grass = vec3<f32>(0.2, 0.35, 0.1);
    let dirt = vec3<f32>(0.35, 0.25, 0.15);
    let rock = vec3<f32>(0.4, 0.38, 0.35);
    let snow = vec3<f32>(0.9, 0.92, 0.95);
    let sand = vec3<f32>(0.76, 0.7, 0.5);
    
    // Height zones
    let h = in.height / terrain.height_scale;
    var color: vec3<f32>;
    if h < -0.3 { color = sand; }
    else if h < 0.2 { color = mix(sand, grass, smoothstep(-0.3, 0.2, h)); }
    else if h < 0.6 { color = mix(grass, dirt, smoothstep(0.2, 0.6, h)); }
    else if h < 0.85 { color = mix(dirt, rock, smoothstep(0.6, 0.85, h)); }
    else { color = mix(rock, snow, smoothstep(0.85, 1.0, h)); }
    
    // Slope-based blending (steep = rock)
    color = mix(color, rock, smoothstep(0.4, 0.7, slope));
    
    // Procedural detail variation
    let detail = noise(in.world_pos.xz * 3.0) * 0.1 - 0.05;
    color += detail;
    
    // Lighting
    let ndl = max(dot(N, sun_dir), 0.0);
    let ambient = vec3<f32>(0.15, 0.18, 0.25);
    let diffuse = ndl * vec3<f32>(1.0, 0.95, 0.85) * 1.2;
    let H = normalize(sun_dir + V);
    let spec = pow(max(dot(N, H), 0.0), 32.0) * 0.15;
    color = color * (ambient + diffuse) + spec;
    
    // Fog
    let dist = length(camera.position.xyz - in.world_pos);
    let fog = 1.0 - exp(-dist * dist * 0.0003);
    color = mix(color, vec3<f32>(0.55, 0.7, 0.9), fog);
    
    return vec4<f32>(color, 1.0);
}
