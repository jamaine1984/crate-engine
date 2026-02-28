# 04 — Water System: Realistic Water, Waves, Swimming, Buoyancy

> Making water that looks real and interacts with gameplay

---

## Gerstner Waves — The Industry Standard

Every modern game uses Gerstner waves for ocean/water. They create realistic wave shapes where crests are sharp and troughs are wide (unlike simple sine waves).

### The Math

A Gerstner wave moves vertices both **vertically (Y)** and **horizontally (XZ)**:

```
For each wave i:
  x_offset = Qi * Ai * Di.x * cos(wi * dot(Di, P) + φi * t)
  z_offset = Qi * Ai * Di.z * cos(wi * dot(Di, P) + φi * t)
  y_offset = Ai * sin(wi * dot(Di, P) + φi * t)

Where:
  Qi = steepness (0 = sine wave, 1 = max sharpness)
  Ai = amplitude
  Di = wave direction (normalized 2D vector)
  wi = frequency = 2π / wavelength
  φi = phase speed = speed * wi
  P = vertex xz position
  t = time
```

### Three.js Shader Implementation

```glsl
// vertex shader
uniform float uTime;
uniform vec4 uWaves[4]; // xy = direction, z = amplitude, w = frequency

vec3 gerstnerWave(vec3 pos, vec4 wave, float time) {
    float steepness = 0.5;
    vec2 dir = normalize(wave.xy);
    float amp = wave.z;
    float freq = wave.w;
    float phase = sqrt(9.81 / freq) * freq; // deep water dispersion
    
    float d = dot(dir, pos.xz);
    float f = freq * d - phase * time;
    
    return vec3(
        steepness * amp * dir.x * cos(f),
        amp * sin(f),
        steepness * amp * dir.y * cos(f)
    );
}

void main() {
    vec3 pos = position;
    vec3 displacement = vec3(0.0);
    
    // Sum 4 waves with different params
    displacement += gerstnerWave(pos, uWaves[0], uTime);
    displacement += gerstnerWave(pos, uWaves[1], uTime);
    displacement += gerstnerWave(pos, uWaves[2], uTime);
    displacement += gerstnerWave(pos, uWaves[3], uTime);
    
    pos += displacement;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
```

### Fragment Shader (Water Look)

```glsl
// fragment shader
uniform vec3 uDeepColor;    // deep water color
uniform vec3 uShallowColor; // shallow/foam color
uniform float uTime;
uniform sampler2D uNormalMap; // for surface detail

varying vec3 vWorldPos;
varying vec3 vNormal;

void main() {
    // Fresnel effect — more reflective at glancing angles
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);
    
    // Depth-based color (needs depth texture or manual calculation)
    vec3 waterColor = mix(uShallowColor, uDeepColor, fresnel);
    
    // Scrolling normal map for surface detail
    vec2 uv1 = vWorldPos.xz * 0.1 + uTime * 0.02;
    vec2 uv2 = vWorldPos.xz * 0.15 - uTime * 0.015;
    vec3 n1 = texture2D(uNormalMap, uv1).rgb * 2.0 - 1.0;
    vec3 n2 = texture2D(uNormalMap, uv2).rgb * 2.0 - 1.0;
    vec3 detailNormal = normalize(n1 + n2);
    
    // Specular highlight (sun reflection)
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
    vec3 halfVec = normalize(viewDir + lightDir);
    float spec = pow(max(dot(detailNormal, halfVec), 0.0), 256.0);
    
    // Combine
    vec3 color = waterColor + vec3(spec * 0.5);
    
    // Transparency based on fresnel
    float alpha = mix(0.6, 0.95, fresnel);
    
    gl_FragColor = vec4(color, alpha);
}
```

### JavaScript Setup

```javascript
function createWater(size = 200, segments = 128) {
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uWaves: { value: [
                new THREE.Vector4(1.0, 0.3, 0.15, 2.0),  // direction.xy, amplitude, frequency
                new THREE.Vector4(0.5, 0.8, 0.10, 3.5),
                new THREE.Vector4(-0.3, 0.6, 0.08, 5.0),
                new THREE.Vector4(0.7, -0.4, 0.05, 7.0),
            ]},
            uDeepColor: { value: new THREE.Color(0x001e3d) },
            uShallowColor: { value: new THREE.Color(0x0077be) },
        },
        vertexShader: waterVertexShader,
        fragmentShader: waterFragmentShader,
        transparent: true,
        side: THREE.DoubleSide,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0; // water level
    
    return mesh;
}

// In animation loop:
function updateWater(dt) {
    waterMesh.material.uniforms.uTime.value += dt;
}
```

### Getting Water Height at Any Point (for boats, swimming)

```javascript
// CPU-side Gerstner evaluation (mirrors shader)
function getWaterHeight(x, z, time) {
    const waves = [
        { dir: [1.0, 0.3], amp: 0.15, freq: 2.0 },
        { dir: [0.5, 0.8], amp: 0.10, freq: 3.5 },
        { dir: [-0.3, 0.6], amp: 0.08, freq: 5.0 },
        { dir: [0.7, -0.4], amp: 0.05, freq: 7.0 },
    ];
    
    let y = 0; // base water level
    
    for (const w of waves) {
        const len = Math.sqrt(w.dir[0] ** 2 + w.dir[1] ** 2);
        const dx = w.dir[0] / len, dz = w.dir[1] / len;
        const phase = Math.sqrt(9.81 / w.freq) * w.freq;
        const d = dx * x + dz * z;
        y += w.amp * Math.sin(w.freq * d - phase * time);
    }
    
    return y;
}
```

---

## Foam

### Shore Foam
Where water meets terrain, add foam based on depth:

```glsl
// In fragment shader, if you have depth info:
float depth = terrainY - waterY; // how deep is water here
float foamFactor = smoothstep(0.0, 1.0, 1.0 - depth);
// Add animated foam texture where foamFactor > 0
vec3 foam = texture2D(uFoamTexture, vWorldPos.xz * 0.5 + uTime * 0.1).rgb;
color = mix(color, vec3(1.0), foamFactor * foam.r);
```

### Wave Crest Foam
Foam appears at wave peaks based on steepness:

```glsl
// Foam where wave height exceeds threshold
float crestFoam = smoothstep(0.05, 0.15, displacement.y);
color = mix(color, vec3(0.9, 0.95, 1.0), crestFoam * 0.3);
```

---

## Reflections & Refractions

### Planar Reflections (Best Quality)
Render scene upside-down from reflected camera → use as texture.
Expensive but looks amazing.

### Screen Space Reflections (SSR)
Post-processing effect. Cheaper, but has artifacts.

### Cube Map Reflections (Cheapest)
Use environment map. Good enough for many games.

```javascript
// Simple cubemap reflection for water
const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
const cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);

// Update periodically (not every frame — expensive)
let reflectionTimer = 0;
function updateReflections(dt) {
    reflectionTimer += dt;
    if (reflectionTimer > 0.5) { // update every 0.5s
        cubeCamera.position.copy(waterMesh.position);
        cubeCamera.update(renderer, scene);
        waterMesh.material.uniforms.uEnvMap = { value: cubeRenderTarget.texture };
        reflectionTimer = 0;
    }
}
```

---

## Underwater Effects

When camera goes below water surface:

```javascript
function updateUnderwaterFX(camera, waterLevel) {
    const isUnderwater = camera.position.y < waterLevel;
    
    if (isUnderwater) {
        // Tint everything blue-green
        scene.fog = underwaterFog; // new THREE.FogExp2(0x003355, 0.04)
        // Blur/distortion post-processing
        // Caustics on terrain (animated light cookie)
        // Muffle audio
        // Particle bubbles
    } else {
        scene.fog = normalFog;
    }
}
```

---

## Buoyancy for Objects

```javascript
function applyBuoyancy(object, waterHeight, dt) {
    const submergedDepth = waterHeight - object.position.y;
    
    if (submergedDepth > 0) {
        // Buoyancy force proportional to submerged volume
        const buoyancy = Math.min(submergedDepth, 1.0) * 15; // tunable
        object.velocity.y += buoyancy * dt;
        
        // Water drag
        object.velocity.multiplyScalar(0.98);
    }
}
```

---

## Implementation Plan for Crate Engine

### Phase 1: Visual Water
- Replace flat ocean plane with Gerstner wave shader
- 4 wave layers for nice look
- Fresnel + color

### Phase 2: Interaction
- `getWaterHeight(x, z, t)` CPU function
- Boat follows waves
- Player enters swimming state at water level

### Phase 3: Polish
- Shore foam
- Normal map detail scrolling
- Underwater tint when camera submerges
- Caustic light patterns on seabed

### Assets Needed
- Water normal map (tileable) — many free ones online
- Foam texture (tileable)
- Caustic texture (animated)

---

*Next: 05-city-generation.md — Roads, intersections, building placement*
