// Procedural sky — fullscreen quad rendered behind everything
// Sun disc, atmospheric scattering, wispy clouds

struct CameraUniform {
    view_proj: mat4x4<f32>,
    view: mat4x4<f32>,
    position: vec4<f32>,
};

struct SkyUniform {
    inv_view_proj: mat4x4<f32>,
    sun_dir: vec4<f32>,  // xyz = direction, w = time
};

@group(0) @binding(0) var<uniform> camera: CameraUniform;
@group(1) @binding(0) var<uniform> sky: SkyUniform;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOutput {
    // Fullscreen triangle
    var out: VertexOutput;
    let x = f32(i32(vi) / 2) * 4.0 - 1.0;
    let y = f32(i32(vi) % 2) * 4.0 - 1.0;
    out.position = vec4<f32>(x, y, 0.99999, 1.0);
    out.uv = vec2<f32>(x, -y);
    return out;
}

fn hash(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453123);
}

fn noise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

fn fbm(p: vec2<f32>) -> f32 {
    var v = 0.0;
    var a = 0.5;
    var pp = p;
    let rot = mat2x2<f32>(0.8, 0.6, -0.6, 0.8);
    for (var i = 0; i < 5; i++) {
        v += a * noise(pp);
        pp = rot * pp * 2.0;
        a *= 0.5;
    }
    return v;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Reconstruct view ray from UV
    let ndc = vec4<f32>(in.uv, 1.0, 1.0);
    let world = sky.inv_view_proj * ndc;
    let ray = normalize(world.xyz / world.w - camera.position.xyz);
    
    let sun_dir = normalize(sky.sun_dir.xyz);
    let t = sky.sun_dir.w;
    
    // === Atmospheric gradient ===
    let up = max(ray.y, 0.0);
    let zenith = vec3<f32>(0.15, 0.3, 0.75);   // deep blue overhead
    let horizon_col = vec3<f32>(0.55, 0.7, 0.92); // light blue at horizon
    var sky_color = mix(horizon_col, zenith, pow(up, 0.45));
    
    // Below horizon — darker
    if ray.y < 0.0 {
        let below = vec3<f32>(0.4, 0.5, 0.55);
        sky_color = mix(horizon_col, below, min(-ray.y * 3.0, 1.0));
    }
    
    // === Sun disc ===
    let sun_dot = dot(ray, sun_dir);
    let sun_disc = smoothstep(0.9997, 0.9999, sun_dot);  // sharp sun
    let sun_glow = pow(max(sun_dot, 0.0), 256.0) * 1.5;  // tight glow
    let sun_halo = pow(max(sun_dot, 0.0), 8.0) * 0.15;   // wide warm halo
    let sun_color = vec3<f32>(1.0, 0.95, 0.8);
    sky_color += sun_color * (sun_disc * 3.0 + sun_glow + sun_halo);
    
    // === Clouds ===
    if ray.y > 0.01 {
        let cloud_height = 8.0;
        let cloud_pos = camera.position.xz + ray.xz * (cloud_height / max(ray.y, 0.01));
        let cloud_uv = cloud_pos * 0.003 + vec2<f32>(t * 0.01, t * 0.005);
        
        let cloud_density = fbm(cloud_uv) * 1.2 - 0.35;
        let cloud_sharp = smoothstep(0.0, 0.4, cloud_density);
        
        // Cloud lighting — brighter facing sun
        let cloud_light = 0.7 + 0.3 * max(dot(normalize(vec3<f32>(ray.x, 0.3, ray.z)), sun_dir), 0.0);
        let cloud_color = vec3<f32>(0.95, 0.95, 0.97) * cloud_light;
        
        // Fade clouds near horizon
        let cloud_fade = smoothstep(0.01, 0.15, ray.y);
        sky_color = mix(sky_color, cloud_color, cloud_sharp * cloud_fade * 0.7);
    }
    
    // === Sunset tint near horizon ===
    let horizon_factor = exp(-abs(ray.y) * 5.0);
    let sunset_dot = max(dot(normalize(vec3<f32>(ray.x, 0.0, ray.z)), normalize(vec3<f32>(sun_dir.x, 0.0, sun_dir.z))), 0.0);
    let sunset = vec3<f32>(1.0, 0.6, 0.3) * pow(sunset_dot, 4.0) * horizon_factor * 0.3;
    sky_color += sunset;
    
    return vec4<f32>(sky_color, 1.0);
}
