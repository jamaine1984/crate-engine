// Selection highlight — bright pulsing overlay for selected objects

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
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    // Push vertices outward along normals (outline effect)
    let expanded = in.position + in.normal * 0.02;
    let world_pos = model.model * vec4<f32>(expanded, 1.0);
    var out: VertexOutput;
    out.clip_position = camera.view_proj * world_pos;
    out.world_normal = normalize((model.model * vec4<f32>(in.normal, 0.0)).xyz);
    out.world_position = world_pos.xyz;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let N = normalize(in.world_normal);
    let V = normalize(camera.position.xyz - in.world_position);
    
    // Edge detection — fresnel-like effect makes edges bright
    let edge = pow(1.0 - max(dot(N, V), 0.0), 2.0);
    let color = model.color.rgb;
    let intensity = edge * 0.8 + 0.2;
    
    return vec4<f32>(color * intensity, edge * 0.6 + 0.1);
}
