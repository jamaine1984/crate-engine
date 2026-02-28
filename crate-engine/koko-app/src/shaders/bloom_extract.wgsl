// Extract bright pixels for bloom

@group(0) @binding(0) var input_tex: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;

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
    let color = textureSample(input_tex, input_sampler, in.uv);
    let brightness = dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    let threshold = 0.8;
    let soft_threshold = 0.3;
    let knee = threshold * soft_threshold;
    let contribution = max(brightness - threshold + knee, 0.0);
    let factor = contribution * contribution / (4.0 * knee + 0.00001);
    let bloom_factor = select(factor / max(brightness, 0.00001), 0.0, brightness < threshold - knee);
    return vec4<f32>(color.rgb * bloom_factor, 1.0);
}
