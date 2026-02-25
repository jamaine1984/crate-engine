// Screen-Space Ambient Occlusion (SSAO)
// Samples depth buffer around each pixel to estimate occlusion

struct SSAOParams {
    projection: mat4x4<f32>,
    inv_projection: mat4x4<f32>,
    radius: f32,
    bias: f32,
    intensity: f32,
    _pad: f32,
    samples: array<vec4<f32>, 16>,
};

@group(0) @binding(0) var depth_tex: texture_depth_2d;
@group(0) @binding(1) var depth_sampler: sampler;
@group(0) @binding(2) var<uniform> params: SSAOParams;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOutput {
    var out: VertexOutput;
    let x = f32(i32(vi) / 2) * 4.0 - 1.0;
    let y = f32(i32(vi) % 2) * 4.0 - 1.0;
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.uv = vec2<f32>(x * 0.5 + 0.5, -y * 0.5 + 0.5);
    return out;
}

fn linearize_depth(d: f32) -> f32 {
    let near = 0.1;
    let far = 200.0;
    return near * far / (far - d * (far - near));
}

fn hash(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let depth = textureSample(depth_tex, depth_sampler, in.uv);
    let linear_depth = linearize_depth(depth);
    
    if depth >= 0.999 { return vec4<f32>(1.0); } // skip sky
    
    // Reconstruct view-space position
    let ndc = vec4<f32>(in.uv.x * 2.0 - 1.0, (1.0 - in.uv.y) * 2.0 - 1.0, depth, 1.0);
    let view_pos_h = params.inv_projection * ndc;
    let view_pos = view_pos_h.xyz / view_pos_h.w;
    
    // Random rotation per-pixel
    let noise_angle = hash(in.uv * 1000.0) * 6.283;
    let cos_n = cos(noise_angle);
    let sin_n = sin(noise_angle);
    
    var occlusion = 0.0;
    let sample_count = 16;
    
    for (var i = 0; i < sample_count; i++) {
        var sample_offset = params.samples[i].xyz;
        // Rotate sample
        let rotated = vec3<f32>(
            sample_offset.x * cos_n - sample_offset.y * sin_n,
            sample_offset.x * sin_n + sample_offset.y * cos_n,
            sample_offset.z
        );
        
        let sample_pos = view_pos + rotated * params.radius;
        
        // Project to screen
        let proj = params.projection * vec4<f32>(sample_pos, 1.0);
        let screen_uv = vec2<f32>(proj.x / proj.w * 0.5 + 0.5, 1.0 - (proj.y / proj.w * 0.5 + 0.5));
        
        if screen_uv.x < 0.0 || screen_uv.x > 1.0 || screen_uv.y < 0.0 || screen_uv.y > 1.0 { continue; }
        
        let sample_depth = textureSample(depth_tex, depth_sampler, screen_uv);
        let sample_linear = linearize_depth(sample_depth);
        
        let range_check = smoothstep(0.0, 1.0, params.radius / abs(linear_depth - sample_linear));
        occlusion += select(0.0, 1.0, sample_linear <= linearize_depth(proj.z / proj.w) - params.bias) * range_check;
    }
    
    let ao = 1.0 - (occlusion / f32(sample_count)) * params.intensity;
    return vec4<f32>(ao, ao, ao, 1.0);
}
