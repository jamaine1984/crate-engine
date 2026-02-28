// Procedural water — animated waves, fake reflections, foam

struct CameraUniform {
    view_proj: mat4x4<f32>,
    view: mat4x4<f32>,
    position: vec4<f32>,
};
struct ModelUniform {
    model: mat4x4<f32>,
    color: vec4<f32>,
};
struct WaterParams {
    time: f32,
    wave_height: f32,
    wave_speed: f32,
    foam_threshold: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraUniform;
@group(1) @binding(0) var<uniform> model: ModelUniform;
@group(2) @binding(0) var<uniform> water: WaterParams;

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
};

fn wave(p: vec2<f32>, t: f32) -> f32 {
    var h = 0.0;
    h += sin(p.x * 0.8 + t * 1.2) * 0.3;
    h += sin(p.y * 0.6 + t * 0.9 + 1.5) * 0.25;
    h += sin((p.x + p.y) * 1.5 + t * 1.8) * 0.15;
    h += sin((p.x - p.y) * 2.5 + t * 2.5) * 0.08;
    h += sin(p.x * 4.0 + p.y * 3.0 + t * 3.0) * 0.04;
    return h;
}

fn wave_normal(p: vec2<f32>, t: f32) -> vec3<f32> {
    let eps = 0.05;
    let hc = wave(p, t);
    let hx = wave(p + vec2<f32>(eps, 0.0), t);
    let hz = wave(p + vec2<f32>(0.0, eps), t);
    return normalize(vec3<f32>(hc - hx, eps * 2.0, hc - hz));
}

fn hash(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}
fn noise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var pos = (model.model * vec4<f32>(in.position, 1.0)).xyz;
    let t = water.time * water.wave_speed;
    pos.y += wave(pos.xz, t) * water.wave_height;
    
    var out: VertexOutput;
    out.clip_position = camera.view_proj * vec4<f32>(pos, 1.0);
    out.world_pos = pos;
    out.normal = wave_normal(pos.xz, t);
    out.uv = pos.xz * 0.1;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let N = normalize(in.normal);
    let V = normalize(camera.position.xyz - in.world_pos);
    let sun_dir = normalize(vec3<f32>(0.5, 0.7, 0.4));
    let t = water.time;
    
    // Base water color (deep → shallow based on viewing angle)
    let deep = vec3<f32>(0.02, 0.08, 0.2);
    let shallow = vec3<f32>(0.05, 0.3, 0.4);
    let fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    var water_color = mix(deep, shallow, fresnel * 0.7);
    
    // Fake sky reflection
    let R = reflect(-V, N);
    let sky_col = mix(vec3<f32>(0.55, 0.7, 0.9), vec3<f32>(0.15, 0.3, 0.75), max(R.y, 0.0));
    water_color = mix(water_color, sky_col, fresnel * 0.6);
    
    // Sun specular highlight
    let H = normalize(sun_dir + V);
    let spec = pow(max(dot(N, H), 0.0), 256.0) * 2.0;
    let spec2 = pow(max(dot(N, H), 0.0), 32.0) * 0.3;
    water_color += vec3<f32>(1.0, 0.95, 0.8) * (spec + spec2);
    
    // Caustics (animated noise pattern)
    let caustic_uv = in.world_pos.xz * 0.5 + vec2<f32>(t * 0.1, t * 0.08);
    let caustic = noise(caustic_uv * 3.0) * noise(caustic_uv * 5.0 + 2.0);
    water_color += vec3<f32>(0.1, 0.2, 0.15) * caustic * 0.5;
    
    // Foam at wave peaks
    let wave_h = wave(in.world_pos.xz, t * water.wave_speed);
    let foam = smoothstep(water.foam_threshold, water.foam_threshold + 0.15, wave_h);
    let foam_noise = noise(in.world_pos.xz * 8.0 + t * 0.5) * noise(in.world_pos.xz * 12.0 - t * 0.3);
    water_color = mix(water_color, vec3<f32>(0.85, 0.9, 0.95), foam * foam_noise * 0.7);
    
    // Fog
    let dist = length(camera.position.xyz - in.world_pos);
    let fog = 1.0 - exp(-dist * dist * 0.0003);
    water_color = mix(water_color, vec3<f32>(0.55, 0.7, 0.9), fog);
    
    return vec4<f32>(water_color, 0.85);
}
