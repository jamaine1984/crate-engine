# 02 — Building Interiors: Rooms, Stairs, Doors

> Making buildings you can actually walk through

---

## The Core Problem

Most Three.js "buildings" are just boxes. Real game buildings need:
- Multiple rooms you can walk between
- Doors that open/close
- Interior stairs between floors
- Windows you can look through
- Furniture/props placed correctly
- Proper lighting per room
- Collision that works on every surface

---

## Architecture: How Real Games Build Interiors

### The Modular Piece Approach (Industry Standard)

Buildings are assembled from **snap-together pieces**, not generated as one mesh:

```
Piece Types:
├── floor_tile (2m x 2m or 4m x 4m)
├── wall_segment (1 wall with optional door hole)
├── wall_window (wall with window cutout)
├── wall_corner (L-shaped corner piece)
├── doorframe (wall with door opening)
├── door (animated mesh)
├── stairs_straight (one flight)
├── stairs_L (L-shaped landing)
├── stairs_spiral
├── ceiling_tile
├── roof_flat / roof_peaked
├── balcony_segment
└── railing_segment
```

Each piece is a **GLB model** with:
- Visual mesh (what you see)
- Collision mesh (simplified geometry for physics)
- Snap points (where it connects to other pieces)

### Snap Point System

```javascript
// Each piece defines connection points
const wallPiece = {
    model: 'wall_4m.glb',
    snapPoints: [
        { id: 'left', pos: new THREE.Vector3(-2, 0, 0), dir: new THREE.Vector3(-1, 0, 0) },
        { id: 'right', pos: new THREE.Vector3(2, 0, 0), dir: new THREE.Vector3(1, 0, 0) },
        { id: 'top', pos: new THREE.Vector3(0, 3, 0), dir: new THREE.Vector3(0, 1, 0) },
    ],
    collider: 'box', // or 'mesh' for complex shapes
    colliderSize: new THREE.Vector3(4, 3, 0.2),
};
```

### Room-Based Generation

For procedural buildings (what Crate Engine needs), generate rooms first, then fill with pieces:

```javascript
function generateHouse(config) {
    const rooms = [];
    
    // 1. Generate room layout (BSP tree or grid)
    const layout = generateLayout(config.width, config.depth, config.rooms);
    
    // 2. For each room, create walls
    for (const room of layout) {
        const walls = [];
        
        // Check each edge — is it exterior, interior wall, or doorway?
        for (const edge of room.edges) {
            if (edge.isExterior) {
                walls.push(createExteriorWall(edge, { 
                    hasWindow: Math.random() > 0.5 
                }));
            } else if (edge.hasDoor) {
                walls.push(createDoorway(edge));
            } else {
                walls.push(createInteriorWall(edge));
            }
        }
        
        // 3. Floor and ceiling
        const floor = createFloor(room);
        const ceiling = createCeiling(room);
        
        rooms.push({ walls, floor, ceiling, bounds: room.bounds });
    }
    
    return rooms;
}
```

---

## Room Layout Generation (BSP)

Binary Space Partitioning — the classic algorithm for room layouts:

```javascript
class BSPNode {
    constructor(x, z, w, d) {
        this.x = x; this.z = z;
        this.w = w; this.d = d;
        this.left = null;
        this.right = null;
        this.room = null;
    }
    
    split(minSize = 4) {
        if (this.w < minSize * 2 && this.d < minSize * 2) return;
        
        // Split horizontally or vertically
        const splitH = this.w > this.d ? false : 
                       this.d > this.w ? true : 
                       Math.random() > 0.5;
        
        if (splitH && this.d >= minSize * 2) {
            const split = this.z + minSize + Math.random() * (this.d - minSize * 2);
            this.left = new BSPNode(this.x, this.z, this.w, split - this.z);
            this.right = new BSPNode(this.x, split, this.w, this.z + this.d - split);
        } else if (this.w >= minSize * 2) {
            const split = this.x + minSize + Math.random() * (this.w - minSize * 2);
            this.left = new BSPNode(this.x, this.z, split - this.x, this.d);
            this.right = new BSPNode(split, this.z, this.x + this.w - split, this.d);
        }
        
        if (this.left) this.left.split(minSize);
        if (this.right) this.right.split(minSize);
    }
    
    getRooms() {
        if (!this.left && !this.right) {
            // Leaf node — this is a room
            // Shrink slightly for walls
            this.room = {
                x: this.x + 0.2, z: this.z + 0.2,
                w: this.w - 0.4, d: this.d - 0.4,
                type: assignRoomType() // kitchen, bedroom, etc.
            };
            return [this.room];
        }
        const rooms = [];
        if (this.left) rooms.push(...this.left.getRooms());
        if (this.right) rooms.push(...this.right.getRooms());
        return rooms;
    }
}

// Generate a floor plan
function generateFloorPlan(width, depth, minRoomSize = 4) {
    const root = new BSPNode(0, 0, width, depth);
    root.split(minRoomSize);
    const rooms = root.getRooms();
    
    // Connect adjacent rooms with doors
    connectRooms(rooms);
    
    return rooms;
}
```

---

## Interior Stairs

### Types
1. **Straight run** — simplest, takes most space
2. **L-shaped** — turn at landing, common in houses
3. **U-shaped** — two parallel flights with landing
4. **Spiral** — compact, harder to navigate

### Geometry Generation

```javascript
function createStairs(config = {}) {
    const {
        width = 1.2,      // stair width
        height = 3.0,     // total height (floor to floor)
        stepHeight = 0.18, // each step
        stepDepth = 0.28,  // tread depth
        type = 'straight'
    } = config;
    
    const numSteps = Math.ceil(height / stepHeight);
    const group = new THREE.Group();
    const collisionMeshes = [];
    
    for (let i = 0; i < numSteps; i++) {
        // Visual step
        const stepGeo = new THREE.BoxGeometry(width, stepHeight, stepDepth);
        const stepMesh = new THREE.Mesh(stepGeo, stairMaterial);
        stepMesh.position.set(
            0,
            i * stepHeight + stepHeight / 2,
            -i * stepDepth
        );
        group.add(stepMesh);
        
        // Collision — each step is a box collider
        collisionMeshes.push(stepMesh);
    }
    
    // Side rails
    const railGeo = new THREE.BoxGeometry(0.05, 1.0, numSteps * stepDepth);
    // ... add rails
    
    // CRITICAL: Add a ramp collider for smooth walking
    // Instead of colliding with each step individually,
    // add an invisible ramp that the character slides up
    const rampAngle = Math.atan2(height, numSteps * stepDepth);
    const rampLength = Math.sqrt(height * height + (numSteps * stepDepth) ** 2);
    const rampGeo = new THREE.BoxGeometry(width, 0.02, rampLength);
    const rampMesh = new THREE.Mesh(rampGeo, invisibleMaterial);
    rampMesh.rotation.x = rampAngle;
    rampMesh.position.set(0, height / 2, -(numSteps * stepDepth) / 2);
    rampMesh.visible = false;
    rampMesh.userData.isStairRamp = true;
    group.add(rampMesh);
    
    return { visual: group, colliders: collisionMeshes, ramp: rampMesh };
}
```

### The Ramp Trick (Critical!)
Real games don't make you physically step on each stair. They use an **invisible ramp** collider overlaid on the stairs. The player smoothly walks up the ramp while the visual stairs look correct. This is the industry standard approach.

```
Visual:        Collision:
  _|            /
 _|            /
_|            /  ← invisible ramp
|            /
```

---

## Doors

### Door Types
- **Swing door** — rotates on hinge (90° or 180°)
- **Sliding door** — translates sideways
- **Double door** — two panels swing opposite

### Implementation

```javascript
class Door {
    constructor(mesh, hingePosition, openAngle = Math.PI / 2) {
        this.mesh = mesh;
        this.hinge = hingePosition;
        this.openAngle = openAngle;
        this.currentAngle = 0;
        this.targetAngle = 0;
        this.isOpen = false;
        this.speed = 3.0; // radians per second
        
        // Set pivot point to hinge
        // Move geometry so hinge is at origin
        this.mesh.geometry.translate(-hingePosition.x, 0, 0);
        this.pivot = new THREE.Group();
        this.pivot.position.copy(hingePosition);
        this.pivot.add(this.mesh);
    }
    
    toggle() {
        this.isOpen = !this.isOpen;
        this.targetAngle = this.isOpen ? this.openAngle : 0;
    }
    
    update(dt) {
        if (Math.abs(this.currentAngle - this.targetAngle) > 0.01) {
            const dir = Math.sign(this.targetAngle - this.currentAngle);
            this.currentAngle += dir * this.speed * dt;
            
            // Clamp
            if (dir > 0 && this.currentAngle > this.targetAngle) 
                this.currentAngle = this.targetAngle;
            if (dir < 0 && this.currentAngle < this.targetAngle) 
                this.currentAngle = this.targetAngle;
            
            this.pivot.rotation.y = this.currentAngle;
        }
    }
}

// Interaction
function checkDoorInteraction(playerPos, playerForward, doors) {
    for (const door of doors) {
        const dist = playerPos.distanceTo(door.pivot.position);
        if (dist < 2.0) {
            // Show "Press E to open" prompt
            if (input.interact) {
                door.toggle();
            }
        }
    }
}
```

---

## Multi-Floor Buildings

### Floor Holes for Stairs
When generating multi-floor buildings, you need to cut a hole in the ceiling/floor where stairs go:

```javascript
function createFloorWithHole(room, stairArea) {
    // Use CSG (Constructive Solid Geometry) or shape with holes
    const shape = new THREE.Shape();
    shape.moveTo(room.x, room.z);
    shape.lineTo(room.x + room.w, room.z);
    shape.lineTo(room.x + room.w, room.z + room.d);
    shape.lineTo(room.x, room.z + room.d);
    shape.closePath();
    
    if (stairArea) {
        // Cut hole for stairs
        const hole = new THREE.Path();
        hole.moveTo(stairArea.x, stairArea.z);
        hole.lineTo(stairArea.x + stairArea.w, stairArea.z);
        hole.lineTo(stairArea.x + stairArea.w, stairArea.z + stairArea.d);
        hole.lineTo(stairArea.x, stairArea.z + stairArea.d);
        hole.closePath();
        shape.holes.push(hole);
    }
    
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(geo, floorMaterial);
    floor.position.y = room.floorY;
    return floor;
}
```

---

## Room Types & Furnishing

```javascript
const ROOM_CONFIGS = {
    living_room: {
        minSize: 16, // sq meters
        furniture: ['sofa', 'coffee_table', 'tv_stand', 'bookshelf', 'lamp'],
        lighting: { type: 'ceiling', warmth: 0.8 },
        floorMaterial: 'wood',
    },
    kitchen: {
        minSize: 9,
        furniture: ['counter_L', 'fridge', 'stove', 'sink', 'table_small'],
        lighting: { type: 'ceiling', warmth: 0.6 },
        floorMaterial: 'tile',
    },
    bedroom: {
        minSize: 12,
        furniture: ['bed', 'nightstand', 'dresser', 'closet'],
        lighting: { type: 'ceiling', warmth: 0.9 },
        floorMaterial: 'carpet',
    },
    bathroom: {
        minSize: 4,
        furniture: ['toilet', 'sink_vanity', 'bathtub_or_shower'],
        lighting: { type: 'ceiling', warmth: 0.5 },
        floorMaterial: 'tile',
    },
    hallway: {
        minSize: 2,
        furniture: [],
        lighting: { type: 'wall_sconce', warmth: 0.7 },
        floorMaterial: 'wood',
    },
    stairwell: {
        minSize: 4,
        furniture: ['stairs'],
        lighting: { type: 'wall_sconce', warmth: 0.6 },
        floorMaterial: 'wood',
    }
};
```

### Furniture Placement Algorithm

```javascript
function furnishRoom(room, config) {
    const placed = [];
    
    for (const furnitureId of config.furniture) {
        const furniture = FURNITURE_DB[furnitureId];
        
        // Try wall-aligned placement first (most furniture goes against walls)
        if (furniture.wallAligned) {
            for (const wall of room.walls) {
                const pos = findWallPosition(wall, furniture.size, placed);
                if (pos) {
                    placeFurniture(furniture, pos, wall.normal);
                    placed.push({ bounds: getBounds(pos, furniture.size) });
                    break;
                }
            }
        } else {
            // Center or free placement
            const pos = findFreePosition(room, furniture.size, placed);
            if (pos) {
                placeFurniture(furniture, pos);
                placed.push({ bounds: getBounds(pos, furniture.size) });
            }
        }
    }
}
```

---

## Interior Lighting

### Per-Room Lights
Each room gets its own light source. Use baked lighting or limited realtime lights:

```javascript
function lightRoom(room) {
    // One point light per room (keep total lights low for performance)
    const light = new THREE.PointLight(0xffeedd, 1.0, room.w * 2);
    light.position.set(
        room.x + room.w / 2,
        room.floorY + 2.8, // near ceiling
        room.z + room.d / 2
    );
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    
    // Light probe for ambient
    // Or use lightmaps for performance
    
    return light;
}
```

### Performance: Light Culling
With many rooms, you can't have all lights active. Only enable lights for:
- The room the player is in
- Adjacent rooms (through doors/windows)

```javascript
function updateRoomLights(playerPos, rooms) {
    const playerRoom = findRoomContaining(playerPos, rooms);
    
    for (const room of rooms) {
        const isNearby = room === playerRoom || 
                         isAdjacentRoom(room, playerRoom);
        room.light.visible = isNearby;
        room.meshes.forEach(m => m.visible = isNearby || isExteriorVisible(m));
    }
}
```

---

## Implementation Plan for Crate Engine

### Phase 1: Basic Building Shell
- Generate 4-wall box with floor/ceiling
- Door opening (hole in wall + door mesh)
- Walk in and out

### Phase 2: Multi-Room
- BSP room layout
- Interior walls with doorways
- Different floor materials per room

### Phase 3: Multi-Floor
- Stair generation (straight first)
- Floor holes for stairs
- Invisible ramp colliders

### Phase 4: Furnishing
- Furniture placement algorithm
- GLB furniture models
- Per-room lighting

### Phase 5: Polish
- Windows with transparency
- Door open/close animation
- Light switches
- Room-based occlusion culling

---

*Next: 03-vehicle-physics.md — Cars, planes, helicopters, boats*
