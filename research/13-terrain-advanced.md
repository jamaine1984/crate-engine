# 13 — Advanced Terrain: Chunks, Caves, LOD, Biomes

> Terrain that scales and looks amazing

---

## Chunked Terrain (Infinite Worlds)

Current Crate Engine: one PlaneGeometry. Problem: can't scale, eats memory for large worlds.

### Chunk System

```javascript
class TerrainChunkManager {
    constructor(scene, chunkSize = 64, viewDistance = 4) {
        this.scene = scene;
        this.chunkSize = chunkSize;
        this.viewDistance = viewDistance; // chunks in each direction
        this.chunks = new Map(); // "x,z" → chunk
        this.resolution = 64; // vertices per chunk edge
    }
    
    update(playerPos) {
        const playerChunkX = Math.floor(playerPos.x / this.chunkSize);
        const playerChunkZ = Math.floor(playerPos.z / this.chunkSize);
        
        // Load needed chunks
        for (let x = playerChunkX - this.viewDistance; x <= playerChunkX + this.viewDistance; x++) {
            for (let z = playerChunkZ - this.viewDistance; z <= playerChunkZ + this.viewDistance; z++) {
                const key = `${x},${z}`;
                if (!this.chunks.has(key)) {
                    this.loadChunk(x, z);
                }
            }
        }
        
        // Unload far chunks
        for (const [key, chunk] of this.chunks) {
            const [cx, cz] = key.split(',').map(Number);
            if (Math.abs(cx - playerChunkX) > this.viewDistance + 1 ||
                Math.abs(cz - playerChunkZ) > this.viewDistance + 1) {
                this.scene.remove(chunk.mesh);
                chunk.mesh.geometry.dispose();
                this.chunks.delete(key);
            }
        }
    }
    
    loadChunk(cx, cz) {
        const geo = new THREE.PlaneGeometry(
            this.chunkSize, this.chunkSize,
            this.resolution, this.resolution
        );
        geo.rotateX(-Math.PI / 2);
        
        const positions = geo.attributes.position.array;
        const colors = new Float32Array(positions.length);
        
        for (let i = 0; i < positions.length; i += 3) {
            const worldX = positions[i] + cx * this.chunkSize;
            const worldZ = positions[i + 2] + cz * this.chunkSize;
            
            // Height from noise
            const height = this.getHeight(worldX, worldZ);
            positions[i + 1] = height;
            
            // Color from biome
            const biome = this.getBiome(worldX, worldZ, height);
            colors[i] = biome.r;
            colors[i + 1] = biome.g;
            colors[i + 2] = biome.b;
        }
        
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();
        
        const mat = new THREE.MeshStandardMaterial({ vertexColors: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(cx * this.chunkSize, 0, cz * this.chunkSize);
        mesh.receiveShadow = true;
        
        this.scene.add(mesh);
        this.chunks.set(`${cx},${cz}`, { mesh, cx, cz });
    }
    
    getHeight(x, z) {
        // Multi-octave noise
        let h = 0;
        h += noise2D(x * 0.005, z * 0.005) * 30;  // large hills
        h += noise2D(x * 0.02, z * 0.02) * 8;      // medium detail
        h += noise2D(x * 0.1, z * 0.1) * 1.5;      // small bumps
        return h;
    }
    
    getBiome(x, z, height) {
        const moisture = noise2D(x * 0.003 + 100, z * 0.003 + 100);
        const temperature = noise2D(x * 0.002 + 200, z * 0.002 + 200);
        
        if (height > 25) return { r: 0.95, g: 0.95, b: 0.97 }; // snow
        if (height > 18) return { r: 0.5, g: 0.5, b: 0.5 };    // rock
        if (height < -2) return { r: 0.76, g: 0.7, b: 0.5 };   // sand/beach
        if (moisture > 0.3) return { r: 0.2, g: 0.6, b: 0.2 };  // forest
        if (temperature > 0.4) return { r: 0.7, g: 0.65, b: 0.3 }; // desert
        return { r: 0.3, g: 0.7, b: 0.3 };                       // grass
    }
}
```

### Noise Library

```javascript
// Use simplex-noise (npm) or implement Perlin noise
// CDN: https://cdn.jsdelivr.net/npm/simplex-noise@4.0.1/dist/esm/simplex-noise.js
import { createNoise2D } from 'simplex-noise';
const noise2D = createNoise2D();
```

---

## Terrain LOD (Geo-Mipmapping)

Far terrain doesn't need full resolution:

```javascript
function createChunkWithLOD(cx, cz, distanceToPlayer) {
    // Resolution drops with distance
    let resolution;
    if (distanceToPlayer < 64) resolution = 64;
    else if (distanceToPlayer < 128) resolution = 32;
    else if (distanceToPlayer < 256) resolution = 16;
    else resolution = 8;
    
    // Same generation, fewer vertices
    const geo = new THREE.PlaneGeometry(chunkSize, chunkSize, resolution, resolution);
    // ... apply heights
}
```

---

## Caves & Overhangs

Flat heightmaps can't do caves (only one Y per XZ). Solutions:

### Marching Cubes (Full 3D Terrain)

```javascript
// For caves, overhangs, arches
// Uses 3D noise field → generates triangle mesh

class MarchingCubesTerrain {
    constructor(size = 64, resolution = 32) {
        this.size = size;
        this.resolution = resolution;
        this.field = new Float32Array(resolution ** 3);
    }
    
    generate() {
        // Fill density field
        for (let x = 0; x < this.resolution; x++) {
            for (let y = 0; y < this.resolution; y++) {
                for (let z = 0; z < this.resolution; z++) {
                    const wx = (x / this.resolution) * this.size;
                    const wy = (y / this.resolution) * this.size;
                    const wz = (z / this.resolution) * this.size;
                    
                    // Base terrain (height)
                    let density = wy - this.getHeight(wx, wz);
                    
                    // Caves (3D noise tunnels)
                    const cave = noise3D(wx * 0.05, wy * 0.05, wz * 0.05);
                    if (cave > 0.6) density += 5; // carve out cave
                    
                    this.field[x + y * this.resolution + z * this.resolution ** 2] = density;
                }
            }
        }
        
        // March cubes to generate mesh
        return marchingCubes(this.field, this.resolution, this.size);
    }
}
```

### Simpler: Prefab Caves
Instead of full marching cubes, place cave GLB models under terrain:

```javascript
function addCave(position, rotation = 0) {
    const cave = loader.load('assets/cave_entrance.glb');
    cave.position.copy(position);
    cave.rotation.y = rotation;
    scene.add(cave);
    worldCollider.add(cave); // add to collision
}
```

---

## Vegetation Scattering

```javascript
class VegetationSystem {
    constructor(terrain) {
        this.terrain = terrain;
        this.trees = [];
        this.grass = null;
    }
    
    scatterTrees(density = 0.01, area = 200) {
        // Instanced mesh for performance
        const treeGeo = new THREE.CylinderGeometry(0, 1.5, 8, 6);
        const treeMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27 });
        const count = Math.floor(area * area * density);
        const instancedTrees = new THREE.InstancedMesh(treeGeo, treeMat, count);
        
        const matrix = new THREE.Matrix4();
        let idx = 0;
        
        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * area;
            const z = (Math.random() - 0.5) * area;
            const y = this.terrain.getHeight(x, z);
            
            // Don't place on water, steep slopes, or above snowline
            if (y < 0 || y > 20) continue;
            const slope = this.terrain.getSlope(x, z);
            if (slope > 30) continue;
            
            // Random size variation
            const scale = 0.7 + Math.random() * 0.6;
            matrix.makeTranslation(x, y + 4 * scale, z);
            matrix.scale(new THREE.Vector3(scale, scale, scale));
            
            instancedTrees.setMatrixAt(idx++, matrix);
        }
        
        instancedTrees.count = idx;
        instancedTrees.instanceMatrix.needsUpdate = true;
        return instancedTrees;
    }
    
    // GPU instanced grass (thousands of blades)
    createGrass(area = 100) {
        const grassGeo = new THREE.PlaneGeometry(0.1, 0.5);
        const grassMat = new THREE.MeshStandardMaterial({
            color: 0x3a7a2a,
            side: THREE.DoubleSide,
            alphaTest: 0.5,
        });
        
        const count = area * area * 2; // 2 blades per sq unit
        const grass = new THREE.InstancedMesh(grassGeo, grassMat, count);
        
        const matrix = new THREE.Matrix4();
        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * area;
            const z = (Math.random() - 0.5) * area;
            const y = this.terrain.getHeight(x, z);
            
            if (y < 0 || y > 15) continue;
            
            matrix.makeTranslation(x, y + 0.25, z);
            matrix.multiply(new THREE.Matrix4().makeRotationY(Math.random() * Math.PI));
            grass.setMatrixAt(i, matrix);
        }
        
        grass.instanceMatrix.needsUpdate = true;
        return grass;
    }
}
```

---

## Implementation Plan

1. **Phase 1:** Chunk loading/unloading around player
2. **Phase 2:** Multi-octave noise for varied terrain
3. **Phase 3:** Biome coloring based on height + moisture
4. **Phase 4:** Instanced trees/vegetation
5. **Phase 5:** Terrain LOD
6. **Phase 6:** Caves (prefab approach first)

---

*Next: 14-optimization.md*
