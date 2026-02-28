// Gaussian blur for bloom (dual pass: horizontal then vertical)

struct BlurParams {
    direction: vec2<f32>,  // (1,0) for horizontal, (0,1) for vertical
    texel_size: vec2<f32>,
};

@group(0) @binding(0) var input_tex: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(0) @binding(2) var<uniform> params: BlurParams;

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

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // 9-tap gaussian
    let weights = array<f32, 5>(0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
    var result = textureSample(input_tex, input_sampler, in.uv).rgb * weights[0];
    let step = params.direction * params.texel_size;
    for (var i = 1; i < 5; i++) {
        let offset = step * f32(i);
        result += textureSample(input_tex, input_sampler, in.uv + offset).rgb * weights[i];
        result += textureSample(input_tex, input_sampler, in.uv - offset).rgb * weights[i];
    }
    return vec4<f32>(result, 1.0);
}
