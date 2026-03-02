// KOKO Engine — PBR shader (no shadow map, for grid/selection)

struct CameraUniform {
    view_proj: mat4x4<f32>,
    view: mat4x4<f32>,
    position: vec4<f32>,
};

struct ModelUniform {
    model: mat4x4<f32>,
    color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraUniform;
@group(1) @binding(0) var<uniform> model: ModelUniform;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) color: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_normal: vec3<f32>,
    @location(1) world_position: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) color: vec4<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    let world_pos = model.model * vec4<f32>(in.position, 1.0);
    out.clip_position = camera.view_proj * world_pos;
    out.world_position = world_pos.xyz;
    out.world_normal = normalize((model.model * vec4<f32>(in.normal, 0.0)).xyz);
    out.uv = in.uv;
    out.color = in.color * model.color;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let albedo = in.color.rgb;
    let N = normalize(in.world_normal);
    let V = normalize(camera.position.xyz - in.world_position);
    let sun_dir = normalize(vec3<f32>(0.5, 0.7, 0.4));
    let sun_color = vec3<f32>(1.0, 0.95, 0.85);
    let fill_dir = normalize(vec3<f32>(-0.6, 0.3, -0.3));
    let fill_color = vec3<f32>(0.4, 0.5, 0.7);
    let rim_color = vec3<f32>(0.5, 0.5, 0.7);
    let sky_ambient = vec3<f32>(0.15, 0.18, 0.28);
    let ground_ambient = vec3<f32>(0.08, 0.06, 0.05);
    let ambient = mix(ground_ambient, sky_ambient, N.y * 0.5 + 0.5) * 0.8;
    let sun_ndl = max(dot(N, sun_dir), 0.0);
    let sun_diff = sun_ndl * sun_color * 1.4;
    let fill_ndl = max(dot(N, fill_dir), 0.0);
    let fill_diff = fill_ndl * fill_color * 0.5;
    let wrap = 0.3;
    let sun_wrap = max((dot(N, sun_dir) + wrap) / (1.0 + wrap), 0.0);
    let soft_diff = sun_wrap * sun_color * 0.2;
    let sun_h = normalize(sun_dir + V);
    let sun_spec = pow(max(dot(N, sun_h), 0.0), 64.0) * sun_color * 0.6;
    let fill_h = normalize(fill_dir + V);
    let fill_spec = pow(max(dot(N, fill_h), 0.0), 32.0) * fill_color * 0.15;
    let fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    let rim = rim_color * fresnel * 0.35;
    let ao = smoothstep(0.0, 2.0, in.world_position.y) * 0.4 + 0.6;
    let diffuse = sun_diff + fill_diff + soft_diff;
    let specular = sun_spec + fill_spec;
    var final_color = albedo * (ambient + diffuse) * ao + specular + rim;
    let dist = length(camera.position.xyz - in.world_position);
    let fog_color = vec3<f32>(0.55, 0.7, 0.9);
    let fog = 1.0 - exp(-dist * dist * 0.0004);
    final_color = mix(final_color, fog_color, fog);
    let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
    final_color = clamp((final_color * (a * final_color + b)) / (final_color * (c * final_color + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
    return vec4<f32>(final_color, in.color.a);
}
