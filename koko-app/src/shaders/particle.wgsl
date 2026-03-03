// GPU Particle System — billboard quads facing camera

struct CameraUniform {
    view_proj: mat4x4<f32>,
    view: mat4x4<f32>,
    position: vec4<f32>,
};

struct ParticleUniform {
    time: f32,
    delta_time: f32,
    particle_count: u32,
    _pad: u32,
};

@group(0) @binding(0) var<uniform> camera: CameraUniform;
@group(1) @binding(0) var<uniform> params: ParticleUniform;
@group(1) @binding(1) var<storage, read> particles: array<Particle>;

struct Particle {
    position: vec3<f32>,
    life: f32,        // 0..1 (1 = just born, 0 = dead)
    velocity: vec3<f32>,
    size: f32,
    color: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) color: vec4<f32>,
    @location(2) life: f32,
};

@vertex
fn vs_main(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VertexOutput {
    let p = particles[ii];
    var out: VertexOutput;
    
    if p.life <= 0.0 {
        out.clip_position = vec4<f32>(0.0, 0.0, -2.0, 1.0); // cull dead
        return out;
    }
    
    // Billboard quad corners
    let corner_idx = vi % 6u;
    var offset: vec2<f32>;
    switch corner_idx {
        case 0u: { offset = vec2<f32>(-0.5, -0.5); }
        case 1u: { offset = vec2<f32>( 0.5, -0.5); }
        case 2u: { offset = vec2<f32>(-0.5,  0.5); }
        case 3u: { offset = vec2<f32>( 0.5, -0.5); }
        case 4u: { offset = vec2<f32>( 0.5,  0.5); }
        case 5u: { offset = vec2<f32>(-0.5,  0.5); }
        default: { offset = vec2<f32>(0.0); }
    }
    
    // Extract camera right/up from view matrix
    let right = vec3<f32>(camera.view[0][0], camera.view[1][0], camera.view[2][0]);
    let up = vec3<f32>(camera.view[0][1], camera.view[1][1], camera.view[2][1]);
    
    let size = p.size * p.life; // shrink as dying
    let world_pos = p.position + (right * offset.x + up * offset.y) * size;
    
    out.clip_position = camera.view_proj * vec4<f32>(world_pos, 1.0);
    out.uv = offset + 0.5;
    out.color = p.color;
    out.life = p.life;
    
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Soft circle
    let dist = length(in.uv - 0.5) * 2.0;
    let alpha = smoothstep(1.0, 0.3, dist) * in.life;
    
    // Color fades with life
    var color = in.color.rgb;
    color = mix(color * 0.3, color, in.life); // darken as dying
    
    return vec4<f32>(color, alpha * in.color.a);
}
