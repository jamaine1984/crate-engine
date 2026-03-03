# 05 — City Generation: Roads, Buildings, Urban Layouts

> Procedural cities that feel real

---

## The Generation Pipeline

```
1. Road Network → 2. Blocks/Lots → 3. Buildings → 4. Details
```

### Step 1: Road Network

#### Grid-Based (Simplest, Manhattan-style)
```javascript
function generateGridRoads(width, depth, blockSize = 40, roadWidth = 8) {
    const roads = [];
    
    // Horizontal roads
    for (let z = 0; z <= depth; z += blockSize + roadWidth) {
        roads.push({
            type: 'road',
            start: new THREE.Vector3(0, 0, z),
            end: new THREE.Vector3(width, 0, z),
            width: roadWidth,
            lanes: z % ((blockSize + roadWidth) * 3) === 0 ? 4 : 2, // major road every 3 blocks
        });
    }
    
    // Vertical roads
    for (let x = 0; x <= width; x += blockSize + roadWidth) {
        roads.push({
            type: 'road',
            start: new THREE.Vector3(x, 0, 0),
            end: new THREE.Vector3(x, 0, depth),
            width: roadWidth,
            lanes: x % ((blockSize + roadWidth) * 3) === 0 ? 4 : 2,
        });
    }
    
    return roads;
}
```

#### L-System Roads (More Organic)
```javascript
// Produces organic road networks like real cities
class LSystemRoads {
    constructor(config) {
        this.segments = [];
        this.intersections = [];
        this.maxSegments = config.maxSegments || 500;
        this.segmentLength = config.segmentLength || 30;
    }
    
    generate(startPos) {
        const queue = [
            { pos: startPos.clone(), dir: new THREE.Vector2(1, 0), type: 'major' },
            { pos: startPos.clone(), dir: new THREE.Vector2(0, 1), type: 'major' },
        ];
        
        while (queue.length > 0 && this.segments.length < this.maxSegments) {
            const current = queue.shift();
            
            // Extend road
            const end = current.pos.clone().add(
                new THREE.Vector2(current.dir.x, current.dir.y)
                    .multiplyScalar(this.segmentLength)
            );
            
            // Check for intersection with existing roads
            const intersection = this.checkIntersection(current.pos, end);
            if (intersection) {
                // Snap to intersection
                this.segments.push({ start: current.pos, end: intersection.point, type: current.type });
                this.intersections.push(intersection);
                continue;
            }
            
            this.segments.push({ start: current.pos.clone(), end: end.clone(), type: current.type });
            
            // Branch probability
            if (Math.random() < 0.3) {
                // Branch perpendicular
                const branchDir = new THREE.Vector2(-current.dir.y, current.dir.x);
                queue.push({ pos: end.clone(), dir: branchDir, type: 'minor' });
            }
            if (Math.random() < 0.1) {
                // Branch opposite perpendicular
                const branchDir = new THREE.Vector2(current.dir.y, -current.dir.x);
                queue.push({ pos: end.clone(), dir: branchDir, type: 'minor' });
            }
            
            // Continue forward with slight variation
            const newDir = current.dir.clone();
            newDir.rotateAround(new THREE.Vector2(), (Math.random() - 0.5) * 0.2);
            queue.push({ pos: end.clone(), dir: newDir, type: current.type });
        }
    }
}
```

### Step 2: Road Mesh Generation

```javascript
function createRoadMesh(segment) {
    const dir = new THREE.Vector3().subVectors(segment.end, segment.start).normalize();
    const length = segment.start.distanceTo(segment.end);
    const right = new THREE.Vector3(-dir.z, 0, dir.x); // perpendicular
    
    const halfW = segment.width / 2;
    
    // Road surface
    const vertices = [
        segment.start.clone().add(right.clone().multiplyScalar(-halfW)),
        segment.start.clone().add(right.clone().multiplyScalar(halfW)),
        segment.end.clone().add(right.clone().multiplyScalar(-halfW)),
        segment.end.clone().add(right.clone().multiplyScalar(halfW)),
    ];
    
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array([
        ...vertices[0].toArray(), ...vertices[2].toArray(), ...vertices[1].toArray(),
        ...vertices[1].toArray(), ...vertices[2].toArray(), ...vertices[3].toArray(),
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    
    // Road material with lane markings
    const material = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.9,
    });
    
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.y = 0.01; // slightly above terrain
    
    // Add lane markings as decals or textured quads
    addLaneMarkings(mesh, segment);
    
    // Add sidewalks
    addSidewalks(mesh, segment);
    
    return mesh;
}

function addSidewalks(parent, segment) {
    const dir = new THREE.Vector3().subVectors(segment.end, segment.start).normalize();
    const length = segment.start.distanceTo(segment.end);
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    
    const sidewalkWidth = 1.5;
    const sidewalkHeight = 0.15;
    
    for (const side of [-1, 1]) {
        const offset = (segment.width / 2 + sidewalkWidth / 2) * side;
        const geo = new THREE.BoxGeometry(sidewalkWidth, sidewalkHeight, length);
        const mesh = new THREE.Mesh(geo, sidewalkMaterial);
        
        const center = segment.start.clone().add(segment.end).multiplyScalar(0.5);
        mesh.position.copy(center);
        mesh.position.add(right.clone().multiplyScalar(offset));
        mesh.position.y = sidewalkHeight / 2;
        mesh.lookAt(segment.end);
        
        parent.add(mesh);
    }
}
```

### Step 3: City Blocks → Building Lots

```javascript
function generateLots(block) {
    // Block is the area between 4 roads
    const lots = [];
    const { x, z, w, d } = block;
    
    // Subdivide block into building lots
    // Front lots face the road, back lots are interior
    const lotDepth = 15; // typical building depth
    const minLotWidth = 8;
    const maxLotWidth = 20;
    
    // North side lots (facing north road)
    let currentX = x;
    while (currentX < x + w) {
        const lotW = minLotWidth + Math.random() * (maxLotWidth - minLotWidth);
        const actualW = Math.min(lotW, x + w - currentX);
        if (actualW < minLotWidth) break;
        
        lots.push({
            x: currentX, z: z,
            w: actualW, d: lotDepth,
            facing: 'north',
            zoning: assignZoning(block), // residential, commercial, industrial
        });
        currentX += actualW;
    }
    
    // Repeat for south, east, west sides
    // Interior of block could be parking, courtyard, or alley
    
    return lots;
}
```

### Step 4: Building Generation

```javascript
function generateBuilding(lot) {
    const { zoning, w, d } = lot;
    
    const configs = {
        residential: {
            floors: 1 + Math.floor(Math.random() * 3), // 1-3 floors
            roofType: ['flat', 'gabled', 'hip'][Math.floor(Math.random() * 3)],
            materials: ['brick', 'siding', 'stucco'],
            hasGarage: Math.random() > 0.5,
        },
        commercial: {
            floors: 1 + Math.floor(Math.random() * 5), // 1-5 floors
            roofType: 'flat',
            materials: ['glass', 'concrete', 'metal'],
            hasAwning: Math.random() > 0.3,
        },
        downtown: {
            floors: 5 + Math.floor(Math.random() * 30), // 5-35 floors
            roofType: 'flat',
            materials: ['glass', 'steel'],
            hasLobby: true,
        },
    };
    
    const config = configs[zoning] || configs.residential;
    const floorHeight = 3.0;
    const totalHeight = config.floors * floorHeight;
    
    const group = new THREE.Group();
    
    // Main body
    const bodyGeo = new THREE.BoxGeometry(w - 1, totalHeight, d - 1);
    const bodyMat = new THREE.MeshStandardMaterial({
        color: getBuildingColor(config),
        roughness: 0.7,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = totalHeight / 2;
    group.add(body);
    
    // Windows (instanced for performance!)
    addWindows(group, w, d, config.floors, floorHeight);
    
    // Door
    addDoor(group, w, d, lot.facing);
    
    // Roof
    if (config.roofType === 'gabled') {
        addGabledRoof(group, w, d, totalHeight);
    }
    
    // Position
    group.position.set(lot.x + w / 2, 0, lot.z + d / 2);
    
    return group;
}
```

### Windows with Instancing (Performance!)

```javascript
function addWindows(building, width, depth, floors, floorHeight) {
    const windowGeo = new THREE.PlaneGeometry(1.0, 1.4);
    const windowMat = new THREE.MeshStandardMaterial({
        color: 0x88bbdd,
        roughness: 0.1,
        metalness: 0.8,
        emissive: 0x112244, // slight glow at night
    });
    
    const windowSpacing = 2.5;
    const count = Math.floor(width / windowSpacing) * floors * 2; // front + back
    
    const instancedMesh = new THREE.InstancedMesh(windowGeo, windowMat, count);
    const matrix = new THREE.Matrix4();
    let idx = 0;
    
    for (let floor = 0; floor < floors; floor++) {
        const y = floor * floorHeight + floorHeight * 0.6;
        
        for (let wx = windowSpacing; wx < width - 1; wx += windowSpacing) {
            // Front face
            matrix.makeTranslation(wx - width / 2, y, depth / 2 + 0.01);
            instancedMesh.setMatrixAt(idx++, matrix);
            
            // Back face
            matrix.makeTranslation(wx - width / 2, y, -depth / 2 - 0.01);
            instancedMesh.setMatrixAt(idx++, matrix);
        }
    }
    
    instancedMesh.count = idx;
    instancedMesh.instanceMatrix.needsUpdate = true;
    building.add(instancedMesh);
}
```

---

## Street Details

### Traffic Lights
```javascript
function addTrafficLight(intersection) {
    const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 4),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    
    const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.8, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    box.position.y = 3.5;
    
    // Three lights
    const colors = [0xff0000, 0xffaa00, 0x00ff00];
    colors.forEach((c, i) => {
        const light = new THREE.Mesh(
            new THREE.SphereGeometry(0.08),
            new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.5 })
        );
        light.position.set(0, 3.8 - i * 0.25, 0.16);
        pole.add(light);
    });
    
    pole.add(box);
    pole.position.copy(intersection.position);
    return pole;
}
```

### Street Props
- Street lights (every 15-20m along roads)
- Fire hydrants (every ~100m)
- Benches (near sidewalks)
- Trash cans
- Trees (along sidewalks, random spacing)
- Parked cars (along curbs)
- Crosswalks (at intersections)
- Signs (stop signs, street names)

---

## LOD (Level of Detail)

Critical for city performance — far buildings don't need full geometry:

```javascript
function createBuildingLOD(buildingConfig) {
    const lod = new THREE.LOD();
    
    // LOD 0: Full detail (windows, doors, rooftop items)
    lod.addLevel(createDetailedBuilding(buildingConfig), 0);
    
    // LOD 1: Simple box with texture (no individual windows)
    lod.addLevel(createSimpleBuilding(buildingConfig), 50);
    
    // LOD 2: Flat billboard or very simple box
    lod.addLevel(createBillboardBuilding(buildingConfig), 200);
    
    return lod;
}
```

---

## City Zones

```javascript
const CITY_ZONES = {
    downtown: { 
        buildingHeight: [10, 40], 
        density: 0.95,
        types: ['office', 'apartment_high', 'hotel'],
    },
    commercial: {
        buildingHeight: [1, 5],
        density: 0.8,
        types: ['shop', 'restaurant', 'office_small'],
    },
    residential: {
        buildingHeight: [1, 3],
        density: 0.6,
        types: ['house', 'duplex', 'apartment_low'],
    },
    industrial: {
        buildingHeight: [1, 2],
        density: 0.4,
        types: ['warehouse', 'factory', 'storage'],
    },
    suburban: {
        buildingHeight: [1, 2],
        density: 0.3,
        types: ['house', 'house_large'],
        hasYards: true,
    },
};

// Assign zones based on distance from center
function getZone(x, z, cityCenter, cityRadius) {
    const dist = Math.sqrt((x - cityCenter.x) ** 2 + (z - cityCenter.z) ** 2);
    const normalizedDist = dist / cityRadius;
    
    if (normalizedDist < 0.15) return 'downtown';
    if (normalizedDist < 0.35) return 'commercial';
    if (normalizedDist < 0.6) return 'residential';
    if (normalizedDist < 0.8) return 'suburban';
    return 'rural';
}
```

---

## Implementation Plan for Crate Engine

### Phase 1: Grid City
- Grid road generation
- Road meshes with sidewalks
- Simple box buildings with windows

### Phase 2: Variety
- Multiple building types per zone
- Roofs (flat, gabled)
- Street lights, trees

### Phase 3: Detail
- Doors you can enter
- Interior generation (connects to doc 02)
- LOD system
- Traffic lights

### Phase 4: Polish
- L-system roads for organic layouts
- Parks and open spaces
- Parked vehicles
- Day/night window glow

### NL Command Integration
```
"build a city" → generateCity({ size: 'medium', zones: ['downtown', 'residential'] })
"build a small town" → generateCity({ size: 'small', zones: ['residential', 'commercial'] })
"build downtown" → generateCityZone('downtown', { blocks: 4 })
```

---

*Next: 06-combat-system.md — Shooting, melee, hit detection, damage*
