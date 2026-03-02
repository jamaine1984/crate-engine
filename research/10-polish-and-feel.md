# 10 — Polish & Feel: What Makes a Game Feel "Real"

> The difference between a tech demo and a game people want to play

---

## The Juice Checklist

"Juice" = the small details that make everything feel responsive and alive. A game with good juice feels 10x better even with the same mechanics.

### 1. Screen Shake
Every impact, explosion, heavy landing — shake the camera slightly.

```javascript
class ScreenShake {
    constructor(camera) {
        this.camera = camera;
        this.trauma = 0; // 0 to 1
        this.decay = 1.5;
        this.maxAngle = 0.05;
        this.maxOffset = 0.1;
    }
    
    add(amount) {
        this.trauma = Math.min(1, this.trauma + amount);
    }
    
    update(dt) {
        if (this.trauma <= 0) return;
        
        // Shake intensity = trauma squared (feels better than linear)
        const shake = this.trauma * this.trauma;
        
        const offsetX = (Math.random() * 2 - 1) * this.maxOffset * shake;
        const offsetY = (Math.random() * 2 - 1) * this.maxOffset * shake;
        const angle = (Math.random() * 2 - 1) * this.maxAngle * shake;
        
        this.camera.position.x += offsetX;
        this.camera.position.y += offsetY;
        this.camera.rotation.z += angle;
        
        this.trauma = Math.max(0, this.trauma - this.decay * dt);
    }
}

// Usage:
// screenShake.add(0.3);  // light hit
// screenShake.add(0.7);  // explosion
// screenShake.add(0.1);  // footstep (subtle)
```

### 2. Particle Effects

```javascript
class ParticlePool {
    constructor(maxParticles = 1000) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(maxParticles * 3);
        const colors = new Float32Array(maxParticles * 3);
        const sizes = new Float32Array(maxParticles);
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        this.material = new THREE.PointsMaterial({
            size: 0.1,
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        
        this.mesh = new THREE.Points(geometry, this.material);
        this.particles = [];
        this.maxParticles = maxParticles;
    }
    
    emit(config) {
        const { position, count = 10, color, velocity, lifetime = 1, size = 0.1 } = config;
        
        for (let i = 0; i < count; i++) {
            if (this.particles.length >= this.maxParticles) break;
            
            this.particles.push({
                pos: position.clone(),
                vel: new THREE.Vector3(
                    (Math.random() - 0.5) * velocity,
                    Math.random() * velocity,
                    (Math.random() - 0.5) * velocity
                ),
                color: color.clone(),
                size,
                lifetime,
                age: 0,
            });
        }
    }
    
    update(dt) {
        const positions = this.mesh.geometry.attributes.position.array;
        const colors = this.mesh.geometry.attributes.color.array;
        const sizes = this.mesh.geometry.attributes.size.array;
        
        let alive = 0;
        
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.age += dt;
            
            if (p.age >= p.lifetime) {
                this.particles.splice(i, 1);
                continue;
            }
            
            // Gravity
            p.vel.y -= 9.81 * dt;
            p.pos.add(p.vel.clone().multiplyScalar(dt));
            
            const t = p.age / p.lifetime;
            const idx = alive * 3;
            positions[idx] = p.pos.x;
            positions[idx + 1] = p.pos.y;
            positions[idx + 2] = p.pos.z;
            colors[idx] = p.color.r * (1 - t);
            colors[idx + 1] = p.color.g * (1 - t);
            colors[idx + 2] = p.color.b * (1 - t);
            sizes[alive] = p.size * (1 - t);
            
            alive++;
        }
        
        this.mesh.geometry.setDrawRange(0, alive);
        this.mesh.geometry.attributes.position.needsUpdate = true;
        this.mesh.geometry.attributes.color.needsUpdate = true;
        this.mesh.geometry.attributes.size.needsUpdate = true;
    }
}

// Preset effects
const FX = {
    hit: (pos) => particles.emit({ position: pos, count: 15, color: new THREE.Color(1, 0.3, 0), velocity: 5, lifetime: 0.5 }),
    dust: (pos) => particles.emit({ position: pos, count: 8, color: new THREE.Color(0.6, 0.5, 0.4), velocity: 2, lifetime: 0.8 }),
    spark: (pos) => particles.emit({ position: pos, count: 20, color: new THREE.Color(1, 1, 0.5), velocity: 8, lifetime: 0.3, size: 0.05 }),
    blood: (pos) => particles.emit({ position: pos, count: 12, color: new THREE.Color(0.8, 0, 0), velocity: 4, lifetime: 0.6 }),
    water_splash: (pos) => particles.emit({ position: pos, count: 25, color: new THREE.Color(0.5, 0.7, 1), velocity: 3, lifetime: 0.5 }),
};
```

### 3. Sound Design

```javascript
class SoundManager {
    constructor() {
        this.listener = new THREE.AudioListener();
        this.sounds = new Map();
        this.pool = {}; // pooled audio sources for frequent sounds
    }
    
    async load(name, url, options = {}) {
        const loader = new THREE.AudioLoader();
        const buffer = await loader.loadAsync(url);
        this.sounds.set(name, { buffer, ...options });
    }
    
    play(name, position = null, options = {}) {
        const config = this.sounds.get(name);
        if (!config) return;
        
        let audio;
        if (position) {
            // 3D positional audio
            audio = new THREE.PositionalAudio(this.listener);
            audio.position.copy(position);
            audio.setRefDistance(options.refDistance || 5);
            audio.setMaxDistance(options.maxDistance || 50);
        } else {
            // 2D audio (UI, music)
            audio = new THREE.Audio(this.listener);
        }
        
        audio.setBuffer(config.buffer);
        audio.setVolume(options.volume || config.volume || 1);
        
        // Pitch variation (makes repeated sounds less robotic)
        const pitchVar = options.pitchVariation || config.pitchVariation || 0;
        audio.setPlaybackRate(1 + (Math.random() - 0.5) * pitchVar);
        
        audio.play();
        return audio;
    }
}

// Essential sounds for game feel:
const SOUNDS = {
    // Movement
    footstep_dirt: { url: 'sfx/footstep_dirt.ogg', pitchVariation: 0.2 },
    footstep_stone: { url: 'sfx/footstep_stone.ogg', pitchVariation: 0.2 },
    footstep_wood: { url: 'sfx/footstep_wood.ogg', pitchVariation: 0.2 },
    jump: { url: 'sfx/jump.ogg' },
    land_soft: { url: 'sfx/land_soft.ogg' },
    land_hard: { url: 'sfx/land_hard.ogg' },
    roll: { url: 'sfx/roll.ogg' },
    
    // Combat
    sword_swing: { url: 'sfx/sword_swing.ogg', pitchVariation: 0.15 },
    sword_hit: { url: 'sfx/sword_hit.ogg', pitchVariation: 0.1 },
    shield_block: { url: 'sfx/shield_block.ogg' },
    
    // Environment
    water_splash: { url: 'sfx/water_splash.ogg' },
    door_open: { url: 'sfx/door_open.ogg' },
    door_close: { url: 'sfx/door_close.ogg' },
    
    // UI
    menu_hover: { url: 'sfx/ui_hover.ogg', volume: 0.3 },
    menu_select: { url: 'sfx/ui_select.ogg', volume: 0.5 },
};
```

### 4. Footstep System

```javascript
class FootstepSystem {
    constructor(soundManager) {
        this.sound = soundManager;
        this.stepTimer = 0;
        this.lastMaterial = null;
    }
    
    update(character, dt) {
        if (!character.isGrounded || character.horizontalSpeed < 0.5) {
            this.stepTimer = 0;
            return;
        }
        
        // Step interval decreases with speed
        const stepInterval = character.isSprinting ? 0.3 :
                           character.isRunning ? 0.4 : 0.55;
        
        this.stepTimer += dt;
        if (this.stepTimer >= stepInterval) {
            this.stepTimer = 0;
            
            // Determine ground material
            const material = getGroundMaterial(character.position);
            this.sound.play(`footstep_${material}`, character.position, {
                volume: character.isSprinting ? 0.8 : 0.4,
                pitchVariation: 0.2,
            });
            
            // Dust particles on dirt/sand
            if (material === 'dirt' || material === 'sand') {
                FX.dust(character.position);
            }
        }
    }
}

function getGroundMaterial(position) {
    // Raycast down, check hit object's userData.material
    // Or use terrain vertex colors / biome data
    // Default to 'dirt'
    raycaster.set(position.clone().add(UP_SMALL), DOWN);
    const hit = raycaster.intersectObject(worldCollider);
    if (hit.length > 0 && hit[0].object.userData.material) {
        return hit[0].object.userData.material;
    }
    return 'dirt';
}
```

### 5. Post-Processing

```javascript
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

function setupPostProcessing(renderer, scene, camera) {
    const composer = new EffectComposer(renderer);
    
    // Base render
    composer.addPass(new RenderPass(scene, camera));
    
    // Bloom (glowing lights, fire, magic)
    const bloom = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.3,  // strength
        0.4,  // radius
        0.85  // threshold
    );
    composer.addPass(bloom);
    
    // Anti-aliasing
    const smaa = new SMAAPass(window.innerWidth, window.innerHeight);
    composer.addPass(smaa);
    
    return composer;
}

// In render loop: composer.render() instead of renderer.render()
```

### 6. Day/Night Cycle

```javascript
class DayNightCycle {
    constructor(scene) {
        this.scene = scene;
        this.sun = new THREE.DirectionalLight(0xffffff, 1);
        this.sun.castShadow = true;
        this.ambient = new THREE.AmbientLight(0x404040, 0.3);
        
        this.timeOfDay = 0.3; // 0=midnight, 0.25=sunrise, 0.5=noon, 0.75=sunset
        this.daySpeed = 0.001; // full cycle time
        
        scene.add(this.sun);
        scene.add(this.ambient);
    }
    
    update(dt) {
        this.timeOfDay = (this.timeOfDay + this.daySpeed * dt) % 1;
        
        // Sun position
        const sunAngle = this.timeOfDay * Math.PI * 2 - Math.PI / 2;
        this.sun.position.set(
            Math.cos(sunAngle) * 100,
            Math.sin(sunAngle) * 100,
            50
        );
        
        // Color temperature
        const isDay = this.timeOfDay > 0.2 && this.timeOfDay < 0.8;
        const isSunrise = this.timeOfDay > 0.2 && this.timeOfDay < 0.3;
        const isSunset = this.timeOfDay > 0.7 && this.timeOfDay < 0.8;
        
        if (isSunrise || isSunset) {
            this.sun.color.setHex(0xff8844); // warm orange
            this.sun.intensity = 0.7;
            this.ambient.intensity = 0.2;
        } else if (isDay) {
            this.sun.color.setHex(0xffffff);
            this.sun.intensity = 1.0;
            this.ambient.intensity = 0.3;
        } else {
            // Night
            this.sun.intensity = 0.05;
            this.ambient.color.setHex(0x112244); // blue moonlight
            this.ambient.intensity = 0.15;
        }
        
        // Sky color
        const skyColors = {
            night: new THREE.Color(0x0a0a2e),
            sunrise: new THREE.Color(0xff6633),
            day: new THREE.Color(0x87ceeb),
            sunset: new THREE.Color(0xff4422),
        };
        
        // Blend sky based on time
        if (this.scene.background instanceof THREE.Color) {
            // lerp to appropriate color
        }
    }
}
```

### 7. HUD & UI

```javascript
// Minimal soulslike HUD
function createHUD() {
    const hud = document.createElement('div');
    hud.id = 'game-hud';
    hud.innerHTML = `
        <style>
            #game-hud {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                pointer-events: none;
                font-family: 'Georgia', serif;
                color: white;
            }
            .health-bar {
                position: absolute;
                bottom: 80px; left: 40px;
                width: 250px; height: 12px;
                background: rgba(0,0,0,0.6);
                border: 1px solid rgba(255,255,255,0.2);
            }
            .health-fill {
                height: 100%;
                background: linear-gradient(to right, #8b0000, #cc2222);
                transition: width 0.3s ease;
            }
            .stamina-bar {
                position: absolute;
                bottom: 60px; left: 40px;
                width: 200px; height: 8px;
                background: rgba(0,0,0,0.6);
                border: 1px solid rgba(255,255,255,0.2);
            }
            .stamina-fill {
                height: 100%;
                background: linear-gradient(to right, #1a5c1a, #33aa33);
                transition: width 0.1s ease;
            }
            .crosshair {
                position: absolute;
                top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                width: 4px; height: 4px;
                border: 1px solid rgba(255,255,255,0.5);
                border-radius: 50%;
            }
            .interaction-prompt {
                position: absolute;
                bottom: 150px;
                left: 50%;
                transform: translateX(-50%);
                font-size: 16px;
                opacity: 0;
                transition: opacity 0.2s;
                text-shadow: 0 0 4px black;
            }
            .damage-vignette {
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                background: radial-gradient(ellipse, transparent 60%, rgba(139,0,0,0.4) 100%);
                opacity: 0;
                transition: opacity 0.3s;
            }
        </style>
        <div class="health-bar"><div class="health-fill" id="health-fill"></div></div>
        <div class="stamina-bar"><div class="stamina-fill" id="stamina-fill"></div></div>
        <div class="crosshair"></div>
        <div class="interaction-prompt" id="interaction-prompt">Press E to interact</div>
        <div class="damage-vignette" id="damage-vignette"></div>
    `;
    document.body.appendChild(hud);
}

function updateHUD(player) {
    document.getElementById('health-fill').style.width = 
        (player.health / player.maxHealth * 100) + '%';
    document.getElementById('stamina-fill').style.width = 
        (player.stamina / player.maxStamina * 100) + '%';
}

function flashDamageVignette() {
    const v = document.getElementById('damage-vignette');
    v.style.opacity = '1';
    setTimeout(() => v.style.opacity = '0', 300);
}
```

### 8. Loading & Transitions

```javascript
// Smooth loading screen
function showLoadingScreen(message = 'Loading...') {
    const screen = document.createElement('div');
    screen.id = 'loading-screen';
    screen.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: #0a0a0a; display: flex; flex-direction: column;
        align-items: center; justify-content: center; z-index: 9999;
        transition: opacity 0.5s;
    `;
    screen.innerHTML = `
        <div style="color: #ccc; font-size: 24px; font-family: Georgia;">${message}</div>
        <div style="width: 200px; height: 3px; background: #333; margin-top: 20px; border-radius: 2px;">
            <div id="load-progress" style="width: 0%; height: 100%; background: #888; transition: width 0.3s;"></div>
        </div>
    `;
    document.body.appendChild(screen);
}

function updateLoadProgress(percent) {
    const bar = document.getElementById('load-progress');
    if (bar) bar.style.width = percent + '%';
}

function hideLoadingScreen() {
    const screen = document.getElementById('loading-screen');
    if (screen) {
        screen.style.opacity = '0';
        setTimeout(() => screen.remove(), 500);
    }
}
```

---

## The Feel Checklist

Before shipping any feature, run through this:

- [ ] **Does it have sound?** Even subtle sounds make a huge difference
- [ ] **Does it have particles?** Dust, sparks, splashes — visual feedback
- [ ] **Does the camera react?** Shake on impacts, zoom on sprint
- [ ] **Is there animation?** Everything should animate, nothing should teleport
- [ ] **Is there easing?** Linear motion looks robotic — use smoothstep/lerp
- [ ] **Is there weight?** Heavy things should feel heavy (slower, more shake)
- [ ] **Does it respond to input instantly?** <100ms from button press to visual response
- [ ] **Are there edge cases?** What happens at boundaries, extremes, weird inputs?

---

## Performance Budget

For 60fps on mid-range hardware:

| System | Budget |
|--------|--------|
| Draw calls | < 200 per frame |
| Triangles | < 500K visible |
| Lights | < 8 realtime (use baked) |
| Shadow maps | 1-2 directional, 2-3 point |
| Texture memory | < 256MB |
| Physics bodies | < 500 active |
| Particles | < 5000 active |

### Performance Tools
```javascript
// Simple FPS counter
let frames = 0, lastFPSTime = 0;
function updateFPS(time) {
    frames++;
    if (time - lastFPSTime >= 1000) {
        console.log('FPS:', frames);
        frames = 0;
        lastFPSTime = time;
    }
}

// Three.js stats
import Stats from 'three/examples/jsm/libs/stats.module.js';
const stats = new Stats();
document.body.appendChild(stats.dom);
// In loop: stats.update();

// Draw call count
console.log('Draw calls:', renderer.info.render.calls);
console.log('Triangles:', renderer.info.render.triangles);
console.log('Textures:', renderer.info.memory.textures);
console.log('Geometries:', renderer.info.memory.geometries);
```

### LOD Strategy
```javascript
// Auto-LOD for all objects
function setupLOD(object, position) {
    const lod = new THREE.LOD();
    
    // Full detail
    lod.addLevel(object, 0);
    
    // Simplified (merge geometries, remove small parts)
    const simplified = simplifyMesh(object, 0.5); // 50% triangles
    lod.addLevel(simplified, 30);
    
    // Billboard (flat image)
    const billboard = createBillboard(object);
    lod.addLevel(billboard, 100);
    
    // Nothing (culled)
    lod.addLevel(new THREE.Object3D(), 300);
    
    lod.position.copy(position);
    return lod;
}
```

---

## Implementation Priority for Crate Engine

### Must Have (Week 1)
1. Particle system (pooled, reusable)
2. Screen shake
3. Basic HUD (health, stamina)
4. Post-processing (bloom + SMAA)

### Should Have (Week 2)
5. Sound manager + footsteps
6. Day/night cycle
7. Damage vignette + hit feedback
8. Loading screen

### Nice to Have (Week 3+)
9. Ambient sounds (birds, wind, water)
10. Weather (rain particles, fog changes)
11. NPC dialogue UI
12. Minimap

---

## Summary: The 10 Pillars

Looking across all 10 research docs, here's what Crate Engine needs to feel like a real engine:

| # | System | Key Tech | Status |
|---|--------|----------|--------|
| 1 | Character Controller | Capsule + Octree/Rapier | Partial |
| 2 | Building Interiors | BSP + modular pieces | Not started |
| 3 | Vehicle Physics | Arcade car/heli/boat | Not started |
| 4 | Water System | Gerstner shader | Basic (flat) |
| 5 | City Generation | Grid roads + zoning | Partial (templates) |
| 6 | Combat System | Hitboxes + combos | Partial (weapons) |
| 7 | Camera System | 3rd/1st + collision | Basic |
| 8 | Collision & Physics | Rapier.js WASM | Raycasts only |
| 9 | Animation System | State machine + Mixamo | Basic |
| 10 | Polish & Feel | Particles + sound + juice | Minimal |

**The single biggest upgrade:** Integrating Rapier.js — it solves collision, stairs, slopes, and vehicle physics in one shot.

---

*Research sprint complete. Ready to build.* 🔥
