# 16 — Lighting & Shadows: Making Scenes Look Professional

> Light is what makes 3D look real

---

## Light Types & When to Use Them

| Light | Cost | Use For |
|-------|------|---------|
| DirectionalLight | Low | Sun/moon — one per scene |
| AmbientLight | Cheapest | Base fill — prevents pure black shadows |
| HemisphereLight | Cheap | Sky/ground gradient — better than ambient |
| PointLight | Medium | Lamps, torches, explosions |
| SpotLight | Medium | Flashlights, streetlights |
| RectAreaLight | High | Windows, screens, area lighting |

### The Standard Outdoor Setup

```javascript
function setupOutdoorLighting(scene) {
    // Sun
    const sun = new THREE.DirectionalLight(0xffeedd, 1.2);
    sun.position.set(50, 80, 30);
    sun.castShadow = true;
    
    // Shadow quality
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 200;
    sun.shadow.bias = -0.0001; // prevents shadow acne
    sun.shadow.normalBias = 0.02;
    
    // Sky/ground ambient
    const hemi = new THREE.HemisphereLight(
        0x87ceeb, // sky color
        0x362907, // ground color
        0.4
    );
    
    scene.add(sun);
    scene.add(hemi);
    
    return { sun, hemi };
}
```

### Cascaded Shadow Maps (CSM)

For large outdoor scenes, standard shadows look pixelated far away. CSM splits the view into distance ranges with separate shadow maps:

```javascript
import { CSM } from 'three/examples/jsm/csm/CSM.js';

const csm = new CSM({
    maxFar: 200,
    cascades: 3,
    mode: 'practical',
    parent: scene,
    shadowMapSize: 2048,
    lightDirection: new THREE.Vector3(-1, -1, -1).normalize(),
    camera: camera,
});

// In render loop:
csm.update();

// Apply to materials:
csm.setupMaterial(groundMaterial);
```

---

## Environment Maps (Reflections & Ambient)

```javascript
// HDRI environment map — instant professional look
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

const rgbeLoader = new RGBELoader();
rgbeLoader.load('textures/environment.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture; // affects ALL PBR materials
    scene.background = texture;  // optional: use as skybox
});
```

Free HDRIs: https://polyhaven.com/hdris

---

## Baked Lighting (Best Performance)

For static scenes, bake lighting into textures:

```javascript
// Lightmap UV channel (UV2)
// Three.js supports lightmaps natively
const material = new THREE.MeshStandardMaterial({
    map: diffuseTexture,
    lightMap: lightmapTexture,     // baked lighting
    lightMapIntensity: 1.0,
    aoMap: aoTexture,              // baked ambient occlusion
    aoMapIntensity: 1.0,
});

// Mesh needs UV2 channel for lightmap
mesh.geometry.setAttribute('uv2', mesh.geometry.attributes.uv);
```

### Screen Space Ambient Occlusion (SSAO)

Real-time AO approximation — makes corners and crevices darker:

```javascript
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';

const ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
ssaoPass.kernelRadius = 0.5;
ssaoPass.minDistance = 0.001;
ssaoPass.maxDistance = 0.1;
composer.addPass(ssaoPass);
```

---

## Emissive Materials (Glowing Objects)

```javascript
// Neon signs, lava, magic effects, windows at night
const neonMaterial = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xff0088,
    emissiveIntensity: 2.0, // > 1 for bloom to pick up
});

// Pair with UnrealBloomPass for glow effect
```

---

## Fog

```javascript
// Linear fog (simple)
scene.fog = new THREE.Fog(0xcccccc, 50, 300);

// Exponential fog (more natural)
scene.fog = new THREE.FogExp2(0x88aacc, 0.005);

// Dynamic fog for atmosphere
function updateFog(timeOfDay) {
    if (timeOfDay < 0.25) {
        // Dawn: thick fog
        scene.fog.color.setHex(0xddccaa);
        scene.fog.density = 0.01;
    } else if (timeOfDay < 0.5) {
        // Day: light haze
        scene.fog.color.setHex(0x88aacc);
        scene.fog.density = 0.003;
    } else {
        // Night: dark fog
        scene.fog.color.setHex(0x111122);
        scene.fog.density = 0.008;
    }
}
```

---

## Volumetric Light (God Rays)

```javascript
// Cheap god rays using radial blur post-process
import { GodRaysEffect } from 'postprocessing';

// Or simpler: use a cone mesh with additive blending
function createGodRay(lightPos, direction) {
    const geo = new THREE.ConeGeometry(5, 30, 16, 1, true);
    const mat = new THREE.MeshBasicMaterial({
        color: 0xffeedd,
        transparent: true,
        opacity: 0.05,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    const cone = new THREE.Mesh(geo, mat);
    cone.position.copy(lightPos);
    cone.lookAt(lightPos.clone().add(direction));
    return cone;
}
```

---

## Implementation Plan

1. **Phase 1:** Hemisphere light + directional with shadows (replace current)
2. **Phase 2:** HDRI environment maps
3. **Phase 3:** CSM for large scenes
4. **Phase 4:** SSAO post-processing
5. **Phase 5:** Fog + day/night color shifting
6. **Phase 6:** Emissive materials + bloom

---

*Next: 17-weather-system.md*
