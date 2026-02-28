# DAN GREENHECK — Three.js Video Research Index
*YouTube: @dangreenheck | 9.36K subs | 59 videos | threejsroadmap.com*

---

## 🎯 HIGH PRIORITY (Directly Applicable to Crate Engine)

### 1. Three.js Water Pro — Realistic WebGPU Water Simulation (37 min)
- **URL**: https://youtube.com/watch?v=L7K_bfI9iZc
- **Relevance**: Water presets (tropical, storm), rocks in water, underwater effects, caustics
- **Key features**: WebGPU water, wave simulation, underwater rendering, water-rock interaction
- **We need**: Better water system (current is flat plane at y=-0.3)

### 2. Melee and Range Combat ⚔️ Three.js RPG Tutorial Part 9 (50 min)
- **URL**: https://youtube.com/watch?v=_G76WJaCeVQ
- **Relevance**: EXACT combat system implementation in Three.js
- **Key features**: Melee attacks, ranged attacks, hit detection, damage dealing
- **We need**: Polish our combat system

### 3. Player Hit Points ❤️ Three.js RPG Tutorial Part 8 (48 min)
- **URL**: https://youtube.com/watch?v=3UWBsfjGL3M
- **Relevance**: Health system, damage, UI for hit points
- **We need**: Better health/damage feedback

### 4. Player Movement 🏃🏻‍♂️ Three.js RPG Tutorial Part 7 (1h 7min)
- **URL**: https://youtube.com/watch?v=uh8jUmqPnQ4
- **Relevance**: Character movement, animation blending, terrain following
- **We need**: Smoother movement, animation system

### 5. Action System 🏹 Three.js RPG Tutorial Part 6 (47 min)
- **URL**: https://youtube.com/watch?v=HbULOPmgMPY
- **Relevance**: Action system architecture for game mechanics
- **We need**: Better action/ability system

### 6. Pathfinding 🗺️ Three.js RPG Tutorial Part 5 (1h 24min)
- **URL**: https://youtube.com/watch?v=N0fC3CQ4ZbA
- **Relevance**: NPC pathfinding on terrain
- **We need**: Better NPC navigation (they currently wander randomly)

### 7. Creating the Game World 🌎 Three.js RPG Tutorial Part 3 (52 min)
- **URL**: https://youtube.com/watch?v=3qfB0e2QA4Q
- **Relevance**: World building, terrain, object placement
- **We need**: Better world generation

### 8. Creating Low-Poly Assets in Blender 🌲 Part 11 (55 min)
- **URL**: https://youtube.com/watch?v=iZCyZcQzYoo
- **Relevance**: Creating game assets in Blender for Three.js
- **We need**: Better procedural assets or asset pipeline

---

## 🔧 USEFUL REFERENCE

### 9. Trees, Water, Clouds (Minecraft Part 8) (55 min)
- **URL**: https://youtube.com/watch?v=tGtVzXuqI4Y
- **Relevance**: Water implementation, procedural trees, cloud system
- **Simpler water approach**: Good for our current no-WebGPU setup

### 10. Biomes (Minecraft Part 10) (1h 16min)
- **URL**: https://youtube.com/watch?v=8x-hLF57Opc
- **Relevance**: Biome system — terrain colors, vegetation by zone
- **We already have**: Vertex color biomes, but could improve

### 11. Infinite Terrain (Minecraft Part 6) (1h 8min)
- **URL**: https://youtube.com/watch?v=bAkWjggXurE
- **Relevance**: Chunked terrain generation, LOD
- **Future**: When we need larger worlds

### 12. Raycasting Tutorial for Beginners (11 min)
- **URL**: https://youtube.com/watch?v=QATefHrO4kg
- **Relevance**: Foundation for shooting, object picking, terrain detection
- **We use**: Raycasting extensively already

### 13. Realistic Reflections with Environment Mapping (15 min)
- **URL**: https://youtube.com/watch?v=7gtrBJzm2xE
- **Relevance**: Better material quality, reflective surfaces (water, metal)

### 14. Procedural Tree Generator (19 min)
- **URL**: https://youtube.com/watch?v=8zMbJmuwEUc
- **Relevance**: Open-source procedural trees for Three.js
- **GitHub**: Could use his tree generator for better forest scenes

---

## 📋 FULL RPG TUTORIAL SERIES (Watch Order)
1. Introduction (8 min) — https://youtube.com/watch?v=Cf6ocQLU1lU
2. Project Setup (19 min) — https://youtube.com/watch?v=DIdHr_ZPeT8
3. Creating the Game World (52 min) — https://youtube.com/watch?v=3qfB0e2QA4Q
4. Point & Click Controls (28 min) — https://youtube.com/watch?v=651VXk4zfDE
5. Pathfinding (1h 24min) — https://youtube.com/watch?v=N0fC3CQ4ZbA
6. Action System (47 min) — https://youtube.com/watch?v=HbULOPmgMPY
7. Player Movement (1h 7min) — https://youtube.com/watch?v=uh8jUmqPnQ4
8. Player Hit Points (48 min) — https://youtube.com/watch?v=3UWBsfjGL3M
9. Melee and Range Combat (50 min) — https://youtube.com/watch?v=_G76WJaCeVQ
10. Code Cleanup (26 min) — https://youtube.com/watch?v=Pw7p1zYCJds
11. Low-Poly Blender Assets (55 min) — https://youtube.com/watch?v=iZCyZcQzYoo

---

## 🌊 WATER RESEARCH (from Dan + others)

### Dan's Water Pro Features (from video):
- **Presets**: Tropical, Storm, Ocean, Lake, Pool
- **Physics**: Gerstner waves, foam generation, edge detection
- **Underwater**: Caustics, god rays, color absorption, fog
- **Interaction**: Water splashing against rocks, ripples from objects
- **WebGPU**: Uses compute shaders for wave simulation

### What We Can Implement (WebGL, no WebGPU):
1. **Gerstner Waves** (vertex shader) — realistic wave shape without physics sim
2. **Foam** at shoreline — white color where water meets terrain (distance-based)
3. **Underwater tint** — blue/green post-processing when camera below water
4. **Caustics** — projected texture on underwater surfaces
5. **Ripples** — expanding ring geometry from player/NPC movement
6. **Reflections** — CubeCamera or screen-space reflection (expensive)
7. **Presets** — Different wave height, color, foam for tropical/storm/lake

### Implementation Plan:
```javascript
// Gerstner wave shader (vertex displacement)
const waterMaterial = new THREE.ShaderMaterial({
  uniforms: {
    time: { value: 0 },
    waveA: { value: new THREE.Vector4(1, 0, 0.5, 6) }, // dir.x, dir.y, steepness, wavelength
    waveB: { value: new THREE.Vector4(0, 1, 0.25, 3) },
    waterColor: { value: new THREE.Color(0x006994) },
    foamColor: { value: new THREE.Color(0xffffff) },
    opacity: { value: 0.85 }
  },
  vertexShader: `
    uniform float time;
    uniform vec4 waveA, waveB;
    varying vec2 vUv;
    varying float vHeight;
    
    vec3 gerstnerWave(vec4 wave, vec3 p, inout vec3 tangent, inout vec3 binormal) {
      float steepness = wave.z;
      float k = 2.0 * 3.14159 / wave.w;
      float c = sqrt(9.8 / k);
      vec2 d = normalize(wave.xy);
      float f = k * (dot(d, p.xz) - c * time);
      float a = steepness / k;
      
      tangent += vec3(-d.x * d.x * steepness * sin(f), d.x * steepness * cos(f), -d.x * d.y * steepness * sin(f));
      binormal += vec3(-d.x * d.y * steepness * sin(f), d.y * steepness * cos(f), -d.y * d.y * steepness * sin(f));
      
      return vec3(d.x * a * cos(f), a * sin(f), d.y * a * cos(f));
    }
    
    void main() {
      vUv = uv;
      vec3 p = position;
      vec3 tangent = vec3(1, 0, 0);
      vec3 binormal = vec3(0, 0, 1);
      p += gerstnerWave(waveA, position, tangent, binormal);
      p += gerstnerWave(waveB, position, tangent, binormal);
      vHeight = p.y;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 waterColor;
    uniform vec3 foamColor;
    uniform float opacity;
    varying float vHeight;
    varying vec2 vUv;
    
    void main() {
      float foam = smoothstep(0.3, 0.5, vHeight);
      vec3 color = mix(waterColor, foamColor, foam * 0.5);
      gl_FragColor = vec4(color, opacity);
    }
  `,
  transparent: true,
  side: THREE.DoubleSide
});
```

### Water Presets:
```javascript
const WATER_PRESETS = {
  tropical: {
    color: 0x00bcd4, opacity: 0.75,
    waveA: [1, 0.3, 0.15, 8], waveB: [0.3, 1, 0.1, 5],
    foam: true, caustics: true
  },
  storm: {
    color: 0x1a3a4a, opacity: 0.9,
    waveA: [1, 0.5, 0.5, 4], waveB: [0.7, 1, 0.4, 3],
    foam: true, caustics: false
  },
  lake: {
    color: 0x2e5e6e, opacity: 0.8,
    waveA: [1, 0, 0.05, 12], waveB: [0, 1, 0.03, 10],
    foam: false, caustics: true
  },
  ocean: {
    color: 0x004466, opacity: 0.85,
    waveA: [1, 0.2, 0.3, 6], waveB: [0.5, 1, 0.2, 4],
    foam: true, caustics: true
  },
  swamp: {
    color: 0x3a5a1a, opacity: 0.95,
    waveA: [1, 0, 0.02, 20], waveB: [0, 1, 0.01, 15],
    foam: false, caustics: false
  }
};
```

---

## ANDREW WOAN (@andrewwoan — 23.9K subs)
*Focus: Blender → Three.js interior design, room scenes, stylized 3D*

### 🎯 Most Relevant for Crate Engine:

1. **Cute Room Portfolio with Three.js & Blender (freeCodeCamp, 8h 41min)**
   - URL: https://youtube.com/watch?v=AB6sulUMRGE (99K views!)
   - Interior room design, furniture, lighting, Blender to Three.js pipeline
   - **KEY**: How to build detailed interiors for our building system

2. **Multiplayer Game with Three.js and Blender (15 min)**
   - URL: https://youtube.com/watch?v=6QdkIOo-fe0 (45K views)
   - Multiplayer architecture + Blender assets
   
3. **Home Office Portfolio (4h)**
   - URL: https://youtube.com/watch?v=aNJN8h_QsPA (30K views)
   - Detailed interior design, realistic room scene

4. **Mini Tabletop Japanese World with Blender (1h 17min)**
   - URL: https://youtube.com/watch?v=zW8mZbZj4Fs
   - Stylized world building, miniature scale

5. **Lord of the Rings Museum (27 min)**
   - URL: https://youtube.com/watch?v=R6yppleutsQ
   - Museum-style scene, walking through spaces

6. **Intro to Technical Art: Shaders with Three.js, TSL, Blender**
   - URL: https://youtube.com/watch?v=6NYtMRXgCjk
   - Three.js Shading Language (TSL) — advanced material effects

7. **Intro to Creative Web Development (5h 38min)**
   - URL: https://youtube.com/watch?v=X3pPAdQBKHo (45K views)
   - Full beginner-to-advanced Three.js + Blender pipeline

### What We Take From Andrew:
- **Blender workflow** for creating game-ready interiors (rooms, furniture, props)
- **GLB export pipeline** optimized for web
- **Interior lighting** techniques (point lights, area lights, shadows)
- **Stylized art direction** — cute/clean aesthetic that works at any scale
- His Blender techniques can feed our **3D model generator** pipeline

---

## 📝 VIDEO TRANSCRIPT TAKEAWAYS

### Dan Greenheck — Water Pro (Key Insights)
- Complete water SYSTEM, not just a shader — sky, underwater, ocean floor all integrated
- 10 presets: choppy, arctic (foam looks like ice), foggy, tranquil, tropical (transparent to see floor), storm, hurricane
- Wind speed parameter controls wave heights dynamically (storm rolling in effect)
- Underwater: light patterns on ocean floor, boat reflections through surface
- Rocks + shore wave breaking — foam generation at boundaries
- All parameters tunable in real-time via UI
- Uses WebGPU compute shaders (we can't use these, but Gerstner vertex shader approximates it)

### Dan Greenheck — Combat System (Parts 8 & 9 Key Insights)
- **Object map**: Players tracked in world grid for collision (no walking through each other)
- **Raycasting for target selection**: Click → ray into scene → intersect against props group (NOT terrain)
- **Separate groups**: world.players, world.props (trees/rocks/bushes), world.terrain
- **Actions framework**: Movement, MeleeAttack, RangedAttack all extend base Action class
- **Hit points**: Floating above player heads, action bar at bottom for abilities
- **Turn-based combat**: Active player highlighted (yellow), select action → pick target → execute
- **Range check**: Melee = adjacent squares, Ranged = 5 squares distance
- **Collision detection**: Players are now part of world grid, can't overlap

### Dan Greenheck — Player Movement (Part 7 Key Insights)
- **Human vs Computer player split**: HumanPlayer handles input/raycasting, ComputerPlayer has own AI logic
- **Action system architecture**: Base Action class → MovementAction, AttackAction etc.
- **Pathfinding integration**: Movement action calls A* pathfinder, returns square list
- **Animation blending**: Smooth transitions between idle/walk/run states

### Dan Greenheck — Pathfinding (Part 5 Key Insights)
- **A* algorithm coded from scratch** (not library)
- **Dijkstra vs A***: Dijkstra = expanding circle (slow), A* = heuristic-guided (fast)
- **Grid-based**: World divided into squares, obstacles block path
- **Object map tracks all placed objects** — trees, rocks, players all occupy grid squares
- **Visualizer tool** to understand algorithm before implementing

### Dan Greenheck — Game World (Part 3 Key Insights)
- **Overworld + Dungeon model**: Main world for exploration, caves/fortresses as dungeon instances
- **Town → Explore → Dungeon → Return loop**: Classic RPG game loop
- **Terrain as grid**: Each cell can have properties (walkable, obstacle, resource)
- **Git workflow**: Commit often, small commits, meaningful messages

### Dan Greenheck — Action System (Part 6 Key Insights)
- **Extensible action framework**: D&D-style — move, melee, ranged, drink potion, etc.
- **Not hardcoded**: Framework for adding new actions easily
- **Async actions**: Actions that take time (movement animation, attack animation)
- **Directory structure**: Separate files for terrain, trees, rocks, bushes — modular code organization
- **Foundation for combat**: Actions system must be solid before combat layer

---

### Andrew Woan — Cute Room Portfolio (8h 41min Key Insights)
- **Blender → Three.js pipeline**: Model in Blender, export GLB, load in Three.js
- **Interior room construction**: Walls, floor, ceiling, furniture placement, material setup
- **Orbit controls with limits**: Constrain pan/rotation so user doesn't see behind walls
- **Delete back faces**: Optimization — remove faces camera will never see
- **Hover effects**: Raycasting for interactive objects (click desk → show info modal)
- **Custom materials in Blender**: Texture painting, UV unwrapping for stylized look
- **Light to dark mode**: Shader-based theme toggle (advanced)
- **Loading screen + intro animation**: Objects animate in to guide user attention
- **Performance**: Face deletion, limited controls, optimized textures

### Andrew Woan — Home Office (4h Key Insights)
- **Route management**: URL-based navigation between views (desk/work/design)
- **Camera transitions**: Smooth camera path between scene areas
- **State management**: Complex global state for multi-view 3D app
- **Responsive design**: Different experience on mobile vs desktop
- **Page persistence**: Refresh keeps current route/view

### Andrew Woan — Multiplayer Game (15 min Key Insights)
- **Social VR concept**: Campus tour, meeting spaces, educational simulations
- **Workflow overview**: Not step-by-step, more architecture/intuition
- **Inside buildings**: Users can enter buildings, explore interiors (Google Maps can't do this)
- **VR simulations**: Dangerous/expensive scenarios done safely in VR

### Andrew Woan — Technical Art: Shaders (Key Insights)
- **TSL (Three.js Shading Language)**: Blender node logic → Three.js node logic
- **Transfer knowledge**: Blender shader nodes map to TSL concepts
- **Math-heavy**: Technical art is more math than traditional art
- **AI-assisted learning**: Use LLMs to understand shader concepts, validate output
- **Foundational concepts**: Not project-based, teach foundations for self-learning

### Andrew Woan — Japanese World (1h 17min Key Insights)
- **Curve-based modeling**: Start with single vertex → build curves for complex shapes
- **Technique video**: Skip-around format, show thought process not step-by-step
- **Modifiers**: Blender 5.0 has new modifiers that speed up workflow
- **Source files free on GitHub**: Blender files available for reference
- **Extra Mesh Objects addon**: Common Blender addon for single vertex creation

### Andrew Woan — Papercraft Portfolio (Latest, 4h 33min Key Insights)
- **Custom camera path curves**: Updated methodology for scroll-driven camera movement
- **Looping animations**: Scroll → navigate → loop technique
- **AI-assisted workflow**: Use AI/LLMs to speed up development
- **Vibe-coded features**: Quick prototyping with AI, then refine
- **React Three Fiber**: Uses R3F (we use vanilla Three.js, but concepts transfer)
