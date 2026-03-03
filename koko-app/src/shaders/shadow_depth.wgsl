// Shadow depth pass — renders scene from light's POV into depth texture

struct LightUniform {
    light_view_proj: mat4x4<f32>,
};

struct ModelUniform {
    model: mat4x4<f32>,
    color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> light: LightUniform;
@group(1) @binding(0) var<uniform> model: ModelUniform;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) color: vec4<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> @builtin(position) vec4<f32> {
    let world_pos = model.model * vec4<f32>(in.position, 1.0);
    return light.light_view_proj * world_pos;
}

// No fragment shader needed — depth-only pass
// But wgpu requires one for validation on some backends
@fragment
fn fs_main() {}
