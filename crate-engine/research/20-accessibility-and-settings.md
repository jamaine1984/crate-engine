# 20 — Accessibility, Settings & Menu System

> The stuff that makes an engine feel complete

---

## Settings Menu

```javascript
const DEFAULT_SETTINGS = {
    // Graphics
    quality: 'medium', // low, medium, high, ultra
    resolution: 1.0,   // render scale
    shadows: true,
    shadowQuality: 'medium',
    bloom: true,
    ssao: false,
    antialiasing: 'smaa',
    fov: 75,
    vsync: true,
    
    // Audio
    masterVolume: 1.0,
    musicVolume: 0.7,
    sfxVolume: 1.0,
    voiceVolume: 1.0,
    
    // Controls
    mouseSensitivity: 1.0,
    invertY: false,
    gamepadSensitivity: 1.0,
    gamepadVibration: true,
    
    // Accessibility
    subtitles: true,
    subtitleSize: 'medium',
    colorblindMode: 'none', // none, protanopia, deuteranopia, tritanopia
    screenShake: 1.0,       // 0 = off, 1 = full
    cameraMotion: 1.0,      // head bob intensity
    fontSize: 1.0,
    highContrast: false,
};

class SettingsManager {
    constructor() {
        this.settings = { ...DEFAULT_SETTINGS };
        this.load();
    }
    
    set(key, value) {
        this.settings[key] = value;
        this.apply(key, value);
        this.save();
    }
    
    apply(key, value) {
        switch (key) {
            case 'quality':
                this.applyQualityPreset(value);
                break;
            case 'resolution':
                renderer.setPixelRatio(window.devicePixelRatio * value);
                break;
            case 'shadows':
                renderer.shadowMap.enabled = value;
                break;
            case 'fov':
                camera.fov = value;
                camera.updateProjectionMatrix();
                break;
            case 'masterVolume':
                audioListener.setMasterVolume(value);
                break;
            case 'mouseSensitivity':
                cameraController.sensitivity = 0.003 * value;
                break;
            case 'screenShake':
                screenShake.maxOffset = 0.1 * value;
                break;
        }
    }
    
    applyQualityPreset(quality) {
        const presets = {
            low: { resolution: 0.5, shadows: false, bloom: false, ssao: false },
            medium: { resolution: 0.75, shadows: true, bloom: true, ssao: false },
            high: { resolution: 1.0, shadows: true, bloom: true, ssao: true },
            ultra: { resolution: 1.5, shadows: true, bloom: true, ssao: true },
        };
        const preset = presets[quality];
        for (const [k, v] of Object.entries(preset)) {
            this.settings[k] = v;
            this.apply(k, v);
        }
    }
    
    save() { localStorage.setItem('settings', JSON.stringify(this.settings)); }
    load() {
        const saved = localStorage.getItem('settings');
        if (saved) Object.assign(this.settings, JSON.parse(saved));
        for (const [k, v] of Object.entries(this.settings)) this.apply(k, v);
    }
}
```

## Pause Menu

```javascript
class PauseMenu {
    constructor() {
        this.element = document.createElement('div');
        this.element.innerHTML = `
            <div style="position:fixed;inset:0;background:rgba(0,0,0,0.8);
                display:flex;flex-direction:column;align-items:center;justify-content:center;
                z-index:1000;font-family:Georgia;color:white;">
                <h1 style="font-size:48px;margin-bottom:40px;">PAUSED</h1>
                <button class="menu-btn" data-action="resume">Resume</button>
                <button class="menu-btn" data-action="settings">Settings</button>
                <button class="menu-btn" data-action="save">Save Game</button>
                <button class="menu-btn" data-action="load">Load Game</button>
                <button class="menu-btn" data-action="quit">Quit to Menu</button>
            </div>
        `;
        this.element.style.display = 'none';
        document.body.appendChild(this.element);
        
        this.element.querySelectorAll('.menu-btn').forEach(btn => {
            btn.style.cssText = `
                background:transparent;border:1px solid rgba(255,255,255,0.3);
                color:white;padding:12px 40px;margin:8px;font-size:18px;
                cursor:pointer;font-family:Georgia;min-width:200px;
            `;
            btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(255,255,255,0.1)');
            btn.addEventListener('mouseleave', () => btn.style.background = 'transparent');
        });
    }
    
    show() {
        this.element.style.display = 'block';
        document.exitPointerLock();
        gameState.paused = true;
    }
    
    hide() {
        this.element.style.display = 'none';
        document.body.requestPointerLock();
        gameState.paused = false;
    }
}
```

## Colorblind Modes

```javascript
// Post-processing filter for colorblind support
const colorblindShader = {
    uniforms: {
        tDiffuse: { value: null },
        uMode: { value: 0 }, // 0=normal, 1=protanopia, 2=deuteranopia, 3=tritanopia
    },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform int uMode;
        varying vec2 vUv;
        
        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            
            if (uMode == 1) { // Protanopia
                float r = 0.567*color.r + 0.433*color.g;
                float g = 0.558*color.r + 0.442*color.g;
                float b = 0.242*color.g + 0.758*color.b;
                color = vec4(r, g, b, color.a);
            } else if (uMode == 2) { // Deuteranopia
                float r = 0.625*color.r + 0.375*color.g;
                float g = 0.700*color.r + 0.300*color.g;
                float b = 0.300*color.g + 0.700*color.b;
                color = vec4(r, g, b, color.a);
            } else if (uMode == 3) { // Tritanopia
                float r = 0.950*color.r + 0.050*color.g;
                float g = 0.433*color.g + 0.567*color.b;
                float b = 0.475*color.g + 0.525*color.b;
                color = vec4(r, g, b, color.a);
            }
            
            gl_FragColor = color;
        }
    `,
};
```

## Subtitles

```javascript
class SubtitleSystem {
    constructor() {
        this.container = document.createElement('div');
        this.container.style.cssText = `
            position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
            max-width:600px;text-align:center;z-index:500;pointer-events:none;
        `;
        document.body.appendChild(this.container);
    }
    
    show(speaker, text, duration = 3) {
        const el = document.createElement('div');
        const size = { small: '14px', medium: '18px', large: '24px' }[settings.subtitleSize];
        el.style.cssText = `
            background:rgba(0,0,0,0.7);color:white;padding:8px 16px;
            margin:4px;border-radius:4px;font-size:${size};font-family:sans-serif;
        `;
        el.innerHTML = speaker ? `<b>${speaker}:</b> ${text}` : text;
        this.container.appendChild(el);
        
        setTimeout(() => el.remove(), duration * 1000);
    }
}
```

---

## Main Menu

```javascript
function createMainMenu() {
    return `
    <div id="main-menu" style="position:fixed;inset:0;background:#0a0a0a;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        font-family:Georgia;color:white;z-index:2000;">
        
        <h1 style="font-size:72px;letter-spacing:8px;margin-bottom:60px;
            text-shadow:0 0 20px rgba(255,255,255,0.3);">
            CRATE ENGINE
        </h1>
        
        <button onclick="startNewGame()" class="main-btn">New Game</button>
        <button onclick="continueGame()" class="main-btn">Continue</button>
        <button onclick="openBuildMode()" class="main-btn">Build Mode</button>
        <button onclick="openMultiplayer()" class="main-btn">Multiplayer</button>
        <button onclick="openSettings()" class="main-btn">Settings</button>
        
        <p style="position:absolute;bottom:20px;opacity:0.3;font-size:12px;">
            Crateship Games — Built with Crate Engine
        </p>
    </div>`;
}
```

---

## Implementation Plan

1. **Phase 1:** Pause menu (Esc key)
2. **Phase 2:** Settings system with localStorage persistence
3. **Phase 3:** Quality presets (auto-detect + manual)
4. **Phase 4:** Main menu
5. **Phase 5:** Accessibility (colorblind, subtitles, screen shake toggle)

---

# 🏁 Research Sprint Complete — Full Index

| # | Document | Topic |
|---|----------|-------|
| 01 | character-controller.md | Movement, stairs, slopes, climbing, swimming |
| 02 | building-interiors.md | Rooms, stairs, doors, multi-floor, furniture |
| 03 | vehicle-physics.md | Cars, planes, helicopters, boats |
| 04 | water-system.md | Gerstner waves, foam, buoyancy, underwater |
| 05 | city-generation.md | Roads, buildings, zoning, LOD |
| 06 | combat-system.md | Hitboxes, combos, lock-on, soulslike |
| 07 | camera-system.md | 3rd/1st person, collision, transitions |
| 08 | collision-physics.md | Octree, Rapier.js, NavMesh |
| 09 | animation-system.md | State machines, Mixamo, blend trees |
| 10 | polish-and-feel.md | Particles, sound, screen shake, HUD |
| 11 | npc-ai-system.md | Behavior trees, perception, squads, dialogue |
| 12 | save-load-system.md | Serialization, undo/redo, export/share |
| 13 | terrain-advanced.md | Chunks, caves, biomes, vegetation |
| 14 | optimization.md | Instancing, pooling, LOD, workers |
| 15 | input-system.md | Gamepad, touch, rebinding |
| 16 | lighting-shadows.md | CSM, HDRI, SSAO, fog |
| 17 | weather-system.md | Rain, snow, storms, lightning |
| 18 | quest-progression.md | Quests, XP, leveling |
| 19 | networking-multiplayer.md | Prediction, interpolation, rooms |
| 20 | accessibility-and-settings.md | Settings, menus, colorblind, subtitles |
