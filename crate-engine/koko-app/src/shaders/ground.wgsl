// Ground shader — grass with real shadow mapping

struct CameraUniform {
    view_proj: mat4x4<f32>,
    view: mat4x4<f32>,
    position: vec4<f32>,
};
struct ModelUniform {
    model: mat4x4<f32>,
    color: vec4<f32>,
};
struct MaterialFlags {
    has_texture: u32,
    has_normal_map: u32,
    metallic: f32,
    roughness: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraUniform;
@group(1) @binding(0) var<uniform> model: ModelUniform;
@group(2) @binding(0) var shadow_map: texture_depth_2d;
@group(2) @binding(1) var shadow_sampler: sampler_comparison;
@group(2) @binding(2) var<uniform> light_vp: mat4x4<f32>;
@group(3) @binding(0) var base_texture: texture_2d<f32>;
@group(3) @binding(1) var base_sampler: sampler;
@group(3) @binding(2) var<uniform> mat_flags: MaterialFlags;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) color: vec4<f32>,
};
struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_pos: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) shadow_coord: vec3<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    let world_pos = (model.model * vec4<f32>(in.position, 1.0)).xyz;
    var out: VertexOutput;
    out.clip_position = camera.view_proj * vec4<f32>(world_pos, 1.0);
    out.world_pos = world_pos;
    out.uv = world_pos.xz;
    let light_pos = light_vp * vec4<f32>(world_pos, 1.0);
    out.shadow_coord = vec3<f32>(light_pos.x * 0.5 + 0.5, 1.0 - (light_pos.y * 0.5 + 0.5), light_pos.z);
    return out;
}

fn hash2(p: vec2<f32>) -> f32 { return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453); }

fn calculate_shadow(coord: vec3<f32>) -> f32 {
    if coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0 || coord.z < 0.0 || coord.z > 1.0 { return 1.0; }
    let texel_size = 1.0 / 2048.0;
    var shadow = 0.0;
    let depth = coord.z - 0.003;
    for (var x = -1; x <= 1; x++) {
        for (var y = -1; y <= 1; y++) {
            shadow += textureSampleCompare(shadow_map, shadow_sampler, coord.xy + vec2<f32>(f32(x), f32(y)) * texel_size, depth);
        }
    }
    return shadow / 9.0;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let pos = in.world_pos;
    let n1 = sin(pos.x * 1.3 + 0.5) * sin(pos.z * 1.7 + 0.3) * 0.03;
    let n2 = sin(pos.x * 3.7 + 1.2) * sin(pos.z * 2.9 + 0.8) * 0.015;
    let grass_base = vec3<f32>(0.2 + n1, 0.38 + n1 * 0.5 + n2, 0.1 + n1 * 0.3);
    let grass_dark = vec3<f32>(0.12, 0.22, 0.06);
    let grass_light = vec3<f32>(0.28, 0.45, 0.15);
    let cell = floor(pos.xz * 0.3);
    let h = hash2(cell);
    var color = mix(mix(grass_dark, grass_light, h * 0.6 + 0.2), grass_base, 0.5);
    let gx = abs(fract(pos.x + 0.5) - 0.5);
    let gz = abs(fract(pos.z + 0.5) - 0.5);
    color = mix(color, color * 0.65, (1.0 - smoothstep(0.01, 0.04, min(gx, gz))) * 0.25);
    let mx = abs(fract(pos.x * 0.2 + 0.5) - 0.5);
    let mz = abs(fract(pos.z * 0.2 + 0.5) - 0.5);
    color = mix(color, color * 0.45, (1.0 - smoothstep(0.008, 0.025, min(mx, mz))) * 0.35);
    let shadow = calculate_shadow(in.shadow_coord);
    let sun_dir = normalize(vec3<f32>(0.5, 0.7, 0.4));
    let light = max(dot(vec3<f32>(0.0, 1.0, 0.0), sun_dir), 0.0) * 0.5 + 0.5;
    color *= light * (shadow * 0.6 + 0.4);
    let dist = length(camera.position.xyz - pos);
    color = mix(color, vec3<f32>(0.5, 0.6, 0.5), smoothstep(25.0, 70.0, dist));
    let fog = 1.0 - exp(-dist * dist * 0.0003);
    color = mix(color, vec3<f32>(0.55, 0.7, 0.9), fog);
    return vec4<f32>(color, 1.0);
}
