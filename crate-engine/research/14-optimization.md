# 14 — Optimization & Performance

> 60fps is not optional

---

## The Big Performance Killers in Three.js

### 1. Draw Calls (Most Common Bottleneck)
Each `mesh.render()` = 1 draw call. GPU hates many small draws.

**Fix: Instanced Mesh** — render 1000 identical objects in 1 draw call:
```javascript
// BAD: 500 draw calls for 500 trees
for (let i = 0; i < 500; i++) {
    const tree = new THREE.Mesh(treeGeo, treeMat);
    scene.add(tree); // 500 draw calls!
}

// GOOD: 1 draw call for 500 trees
const trees = new THREE.InstancedMesh(treeGeo, treeMat, 500);
const matrix = new THREE.Matrix4();
for (let i = 0; i < 500; i++) {
    matrix.makeTranslation(positions[i].x, positions[i].y, positions[i].z);
    trees.setMatrixAt(i, matrix);
}
scene.add(trees); // 1 draw call!
```

**Fix: Merged Geometry** — for non-identical static objects:
```javascript
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Merge all building walls into one mesh
const wallGeometries = buildings.map(b => {
    const geo = b.geometry.clone();
    geo.applyMatrix4(b.matrixWorld);
    return geo;
});
const mergedGeo = mergeGeometries(wallGeometries);
const mergedWalls = new THREE.Mesh(mergedGeo, wallMaterial);
// Hundreds of walls → 1 draw call
```

### 2. Frustum Culling (Free Performance)
Three.js does this automatically IF bounding spheres are correct:
```javascript
// Make sure to call after modifying geometry
mesh.geometry.computeBoundingSphere();
mesh.frustumCulled = true; // default is true
```

### 3. Texture Atlases
Instead of 50 materials (50 draw calls), put all textures in one atlas:
```javascript
// Load atlas
const atlas = textureLoader.load('textures/atlas.png');

// UV mapping per object type
// Building wall: UV 0.0-0.25 x, 0.0-0.5 y
// Road: UV 0.25-0.5 x, 0.0-0.5 y
// etc.
```

### 4. Level of Detail (LOD)
```javascript
const lod = new THREE.LOD();
lod.addLevel(highDetailMesh, 0);     // full detail near
lod.addLevel(medDetailMesh, 30);     // simplified at 30m
lod.addLevel(lowDetailMesh, 80);     // box at 80m
lod.addLevel(new THREE.Object3D(), 200); // invisible at 200m
```

### 5. Object Pooling
Don't create/destroy objects every frame — reuse them:

```javascript
class ObjectPool {
    constructor(factory, initialSize = 20) {
        this.available = [];
        this.factory = factory;
        for (let i = 0; i < initialSize; i++) {
            this.available.push(factory());
        }
    }
    
    get() {
        return this.available.pop() || this.factory();
    }
    
    release(obj) {
        obj.visible = false;
        this.available.push(obj);
    }
}

// Pool for projectiles
const bulletPool = new ObjectPool(() => {
    const geo = new THREE.SphereGeometry(0.05);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    return new THREE.Mesh(geo, mat);
}, 50);
```

### 6. Spatial Hashing (Broad Phase)
For collision/interaction checks, don't check everything against everything:

```javascript
class SpatialHash {
    constructor(cellSize = 10) {
        this.cellSize = cellSize;
        this.cells = new Map();
    }
    
    getKey(x, z) {
        return `${Math.floor(x / this.cellSize)},${Math.floor(z / this.cellSize)}`;
    }
    
    insert(object) {
        const key = this.getKey(object.position.x, object.position.z);
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(object);
    }
    
    query(x, z, radius) {
        const results = [];
        const cellRadius = Math.ceil(radius / this.cellSize);
        const cx = Math.floor(x / this.cellSize);
        const cz = Math.floor(z / this.cellSize);
        
        for (let dx = -cellRadius; dx <= cellRadius; dx++) {
            for (let dz = -cellRadius; dz <= cellRadius; dz++) {
                const key = `${cx + dx},${cz + dz}`;
                const cell = this.cells.get(key);
                if (cell) results.push(...cell);
            }
        }
        return results;
    }
}
```

### 7. Web Workers for Heavy Computation

```javascript
// Main thread
const worker = new Worker('terrain-worker.js');
worker.postMessage({ type: 'generateChunk', cx: 5, cz: 3 });
worker.onmessage = (e) => {
    const { positions, colors, normals } = e.data;
    // Build geometry from transferred arrays
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    // Add to scene
};

// terrain-worker.js
self.onmessage = (e) => {
    const { cx, cz } = e.data;
    const positions = new Float32Array(/* ... */);
    // Generate terrain on worker thread (no jank!)
    // Transfer buffers back (zero-copy)
    self.postMessage({ positions, colors, normals }, [positions.buffer, colors.buffer, normals.buffer]);
};
```

### 8. Shadow Optimization
Shadows are expensive. Strategies:
```javascript
// Only main light casts shadows
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 100;

// Tight shadow frustum (follow player)
function updateShadowCamera(playerPos) {
    const shadowSize = 30;
    sun.shadow.camera.left = playerPos.x - shadowSize;
    sun.shadow.camera.right = playerPos.x + shadowSize;
    sun.shadow.camera.top = playerPos.z + shadowSize;
    sun.shadow.camera.bottom = playerPos.z - shadowSize;
    sun.shadow.camera.updateProjectionMatrix();
}

// Only nearby objects cast shadows
function updateShadowCasters(playerPos) {
    scene.traverse(obj => {
        if (obj.isMesh) {
            obj.castShadow = obj.position.distanceTo(playerPos) < 40;
        }
    });
}
```

---

## Performance Monitoring

```javascript
class PerformanceMonitor {
    constructor(renderer) {
        this.renderer = renderer;
        this.history = [];
    }
    
    sample() {
        return {
            fps: 1 / clock.getDelta(),
            drawCalls: this.renderer.info.render.calls,
            triangles: this.renderer.info.render.triangles,
            textures: this.renderer.info.memory.textures,
            geometries: this.renderer.info.memory.geometries,
            programs: this.renderer.info.programs?.length || 0,
        };
    }
    
    // Auto-adjust quality
    autoQuality(fps) {
        if (fps < 30) {
            // Reduce quality
            renderer.setPixelRatio(1);
            shadowMap.enabled = false;
            postProcessing.bloom.enabled = false;
        } else if (fps < 45) {
            renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
            shadowMap.enabled = true;
        } else {
            renderer.setPixelRatio(Math.min(2, devicePixelRatio));
        }
    }
}
```

---

## GPU Instancing for City Scenes

The biggest win for cities:

```javascript
// All windows in the entire city → 1 draw call
// All street lights → 1 draw call
// All trees → 1 draw call
// All similar building types → 1 draw call each

// Example: 10,000 windows, 1 draw call
const windowMesh = new THREE.InstancedMesh(windowGeo, windowMat, 10000);
let idx = 0;
for (const building of buildings) {
    for (const window of building.windows) {
        matrix.compose(window.position, window.quaternion, window.scale);
        windowMesh.setMatrixAt(idx++, matrix);
    }
}
windowMesh.count = idx;
```

---

*Next: 15-input-system.md*
