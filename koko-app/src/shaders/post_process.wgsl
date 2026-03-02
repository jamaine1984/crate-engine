// Post-processing: vignette, color grading, film grain, chromatic aberration, fog

struct PostParams {
    time: f32,
    vignette_strength: f32,
    grain_strength: f32,
    chromatic_aberration: f32,
    saturation: f32,
    contrast: f32,
    brightness: f32,
    temperature: f32,  // -1 cool to +1 warm
};

@group(0) @binding(0) var input_tex: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(0) @binding(2) var<uniform> params: PostParams;

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

fn hash_noise(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(12.9898, 78.233))) * 43758.5453);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    var uv = in.uv;
    
    // === Chromatic Aberration ===
    let ca = params.chromatic_aberration;
    let center = uv - 0.5;
    let dist_sq = dot(center, center);
    let offset = center * dist_sq * ca;
    let r = textureSample(input_tex, input_sampler, uv + offset).r;
    let g = textureSample(input_tex, input_sampler, uv).g;
    let b = textureSample(input_tex, input_sampler, uv - offset).b;
    var color = vec3<f32>(r, g, b);
    
    // === Color Grading ===
    color *= params.brightness;
    color = (color - 0.5) * params.contrast + 0.5;
    let luma = dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
    color = mix(vec3<f32>(luma), color, params.saturation);
    
    // Temperature shift
    if params.temperature > 0.0 {
        color.r += params.temperature * 0.1;
        color.b -= params.temperature * 0.05;
    } else {
        color.b -= params.temperature * 0.1;
        color.r += params.temperature * 0.05;
    }
    
    // === Tone mapping (ACES approximation) ===
    let a = 2.51;
    let b2 = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    color = clamp((color * (a * color + b2)) / (color * (c * color + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
    
    // === Film Grain ===
    let grain = (hash_noise(uv * 1000.0 + params.time * 100.0) - 0.5) * params.grain_strength;
    color += grain;
    
    // === Vignette ===
    let vig_dist = length(center) * 1.4;
    let vignette = 1.0 - smoothstep(0.4, 1.2, vig_dist) * params.vignette_strength;
    color *= vignette;
    
    return vec4<f32>(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
