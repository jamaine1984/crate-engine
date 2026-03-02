// KOKO Engine — Full PBR: shadow mapping + textures + multiple lights

struct CameraUniform {
    view_proj: mat4x4<f32>,
    view: mat4x4<f32>,
    position: vec4<f32>,
};
struct ModelUniform {
    model: mat4x4<f32>,
    color: vec4<f32>,
};
struct MaterialFlags {
    has_texture: u32,
    has_normal_map: u32,
    metallic: f32,
    roughness: f32,
};

// Point/spot light
struct PointLight {
    position: vec3<f32>,
    radius: f32,
    color: vec3<f32>,
    intensity: f32,
    // Spot light: direction + cutoff
    direction: vec3<f32>,
    spot_cutoff: f32,  // cos(angle), 0 = point light
};
struct LightArray {
    count: u32,
    _pad: u32,
    _pad2: u32,
    _pad3: u32,
    lights: array<PointLight, 32>,
};

@group(0) @binding(0) var<uniform> camera: CameraUniform;
@group(1) @binding(0) var<uniform> model: ModelUniform;
@group(2) @binding(0) var shadow_map: texture_depth_2d;
@group(2) @binding(1) var shadow_sampler: sampler_comparison;
@group(2) @binding(2) var<uniform> light_vp: mat4x4<f32>;
@group(3) @binding(0) var base_texture: texture_2d<f32>;
@group(3) @binding(1) var base_sampler: sampler;
@group(3) @binding(2) var<uniform> mat_flags: MaterialFlags;
@group(3) @binding(3) var<storage, read> light_data: LightArray;
@group(3) @binding(4) var normal_texture: texture_2d<f32>;
@group(3) @binding(5) var normal_sampler: sampler;

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
    @location(4) shadow_coord: vec3<f32>,
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
    let lp = light_vp * world_pos;
    out.shadow_coord = vec3<f32>(lp.x * 0.5 + 0.5, 1.0 - (lp.y * 0.5 + 0.5), lp.z);
    return out;
}

fn calculate_shadow(coord: vec3<f32>) -> f32 {
    if coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0 || coord.z < 0.0 || coord.z > 1.0 { return 1.0; }
    let texel_size = 1.0 / 2048.0;
    var shadow = 0.0;
    let depth = coord.z - 0.002;
    for (var x = -1; x <= 1; x++) {
        for (var y = -1; y <= 1; y++) {
            shadow += textureSampleCompare(shadow_map, shadow_sampler, coord.xy + vec2<f32>(f32(x), f32(y)) * texel_size, depth);
        }
    }
    return shadow / 9.0;
}

fn calculate_point_lights(N: vec3<f32>, V: vec3<f32>, world_pos: vec3<f32>, albedo: vec3<f32>, roughness: f32) -> vec3<f32> {
    var result = vec3<f32>(0.0);
    let count = min(light_data.count, 32u);
    for (var i = 0u; i < count; i++) {
        let light = light_data.lights[i];
        let to_light = light.position - world_pos;
        let dist = length(to_light);
        if dist > light.radius { continue; }
        let L = to_light / dist;
        
        // Attenuation (smooth falloff)
        let att = pow(max(1.0 - dist / light.radius, 0.0), 2.0);
        
        // Spot light cone
        var spot = 1.0;
        if light.spot_cutoff > 0.001 {
            let spot_dot = dot(-L, normalize(light.direction));
            spot = smoothstep(light.spot_cutoff - 0.05, light.spot_cutoff + 0.05, spot_dot);
        }
        
        let ndl = max(dot(N, L), 0.0);
        let H = normalize(L + V);
        let spec_power = mix(128.0, 8.0, roughness);
        let spec = pow(max(dot(N, H), 0.0), spec_power) * 0.5;
        
        result += (albedo * ndl + vec3<f32>(spec)) * light.color * light.intensity * att * spot;
    }
    return result;
}


fn get_normal_from_map(world_normal: vec3<f32>, world_pos: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
    // Sample normal map
    let normal_sample = textureSample(normal_texture, normal_sampler, uv).rgb;
    let tangent_normal = normal_sample * 2.0 - 1.0;
    
    // Compute TBN from screen-space derivatives
    let dp1 = dpdx(world_pos);
    let dp2 = dpdy(world_pos);
    let duv1 = dpdx(uv);
    let duv2 = dpdy(uv);
    
    let N = normalize(world_normal);
    let T = normalize(dp1 * duv2.y - dp2 * duv1.y);
    let B = normalize(cross(N, T));
    
    return normalize(T * tangent_normal.x + B * tangent_normal.y + N * tangent_normal.z);
}
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    var albedo: vec3<f32>;
    var alpha: f32;
    if mat_flags.has_texture > 0u {
        let tc = textureSample(base_texture, base_sampler, in.uv);
        albedo = tc.rgb * in.color.rgb;
        alpha = tc.a * in.color.a;
    } else {
        albedo = in.color.rgb;
        alpha = in.color.a;
    }
    
    var N = normalize(in.world_normal);
    if mat_flags.has_normal_map > 0u {
        N = get_normal_from_map(in.world_normal, in.world_position, in.uv);
    }
    let V = normalize(camera.position.xyz - in.world_position);
    let sun_dir = normalize(vec3<f32>(0.5, 0.7, 0.4));
    let sun_color = vec3<f32>(1.0, 0.95, 0.85);
    let fill_dir = normalize(vec3<f32>(-0.6, 0.3, -0.3));
    let fill_color = vec3<f32>(0.4, 0.5, 0.7);
    let rim_color = vec3<f32>(0.5, 0.5, 0.7);
    let sky_ambient = vec3<f32>(0.15, 0.18, 0.28);
    let ground_ambient = vec3<f32>(0.08, 0.06, 0.05);
    let ambient = mix(ground_ambient, sky_ambient, N.y * 0.5 + 0.5) * 0.8;
    let shadow = calculate_shadow(in.shadow_coord);
    let sun_ndl = max(dot(N, sun_dir), 0.0);
    let sun_diff = sun_ndl * sun_color * 1.4 * shadow;
    let fill_diff = max(dot(N, fill_dir), 0.0) * fill_color * 0.5;
    let wrap = 0.3;
    let soft_diff = max((dot(N, sun_dir) + wrap) / (1.0 + wrap), 0.0) * sun_color * 0.2 * shadow;
    let spec_power = mix(128.0, 8.0, mat_flags.roughness);
    let spec_str = mix(0.8, 0.05, mat_flags.roughness);
    let sun_h = normalize(sun_dir + V);
    let sun_spec = pow(max(dot(N, sun_h), 0.0), spec_power) * sun_color * spec_str * shadow;
    let fill_h = normalize(fill_dir + V);
    let fill_spec = pow(max(dot(N, fill_h), 0.0), spec_power * 0.5) * fill_color * 0.15;
    let fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    let rim = rim_color * fresnel * 0.35;
    let metal_color = albedo * fresnel * mat_flags.metallic * 0.5;
    let ao = smoothstep(0.0, 2.0, in.world_position.y) * 0.4 + 0.6;
    let diffuse = sun_diff + fill_diff + soft_diff;
    let specular = sun_spec + fill_spec;
    
    // Point/spot lights contribution
    let point_light = calculate_point_lights(N, V, in.world_position, albedo, mat_flags.roughness);
    
    var final_color = albedo * (ambient + diffuse) * ao + specular + rim + metal_color + point_light;
    let dist = length(camera.position.xyz - in.world_position);
    let fog = 1.0 - exp(-dist * dist * 0.0004);
    final_color = mix(final_color, vec3<f32>(0.55, 0.7, 0.9), fog);
    let a = 2.51; let b = 0.03; let cc = 2.43; let d = 0.59; let e = 0.14;
    final_color = clamp((final_color * (a * final_color + b)) / (final_color * (cc * final_color + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
    return vec4<f32>(final_color, alpha);
}
