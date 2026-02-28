// Blob shadow — soft circular shadow under objects

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

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) local_pos: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> VertexOutput {
    let positions = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
        vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, 1.0),
    );
    let pos = positions[idx];
    let world = model.model * vec4<f32>(pos.x, 0.0, pos.y, 1.0);
    
    var out: VertexOutput;
    out.clip_position = camera.view_proj * world;
    out.local_pos = pos;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let dist = length(in.local_pos);
    // Softer, darker shadow with wider penumbra
    let inner = 1.0 - smoothstep(0.0, 0.4, dist);
    let outer = 1.0 - smoothstep(0.2, 1.0, dist);
    let shadow = inner * 0.7 + outer * 0.3;
    let intensity = model.color.a * shadow * 0.6;
    return vec4<f32>(0.0, 0.0, 0.0, intensity);
}
