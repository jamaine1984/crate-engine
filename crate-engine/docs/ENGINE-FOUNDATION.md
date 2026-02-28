# CRATE ENGINE — Core Gameplay Foundation Spec
## Senior Engineer Design Document

---

# A) NON-NEGOTIABLE CONVENTIONS

## Coordinate System (LOCKED)

```
Right-handed, Y-up (matches glTF spec, Three.js, wgpu NDC)

  +Y (Up)
   |
   |
   +------ +X (Right)
  /
 /
+Z (Forward / "toward camera" in default view)

Handedness: RIGHT-HANDED
Up:      +Y
Forward: -Z (character faces -Z by default, camera looks down -Z)
Right:   +X
Units:   1.0 = 1 meter
```

**Why -Z forward?** glTF spec defines front face as -Z. Three.js default camera looks down -Z. Matching both eliminates a rotation on every import.

## Transform Spec

```rust
// engine/src/core/transform.rs

#[derive(Clone, Debug)]
pub struct Transform {
    pub position: Vec3,    // world meters
    pub rotation: Quat,    // (x, y, z, w) — Hamilton convention
    pub scale: Vec3,       // per-axis scale, usually uniform
}

impl Transform {
    pub const IDENTITY: Self = Self {
        position: Vec3::ZERO,
        rotation: Quat::IDENTITY,
        scale: Vec3::ONE,
    };

    /// Compose: parent * child
    pub fn mul(&self, child: &Transform) -> Transform {
        Transform {
            position: self.position + self.rotation * (self.scale * child.position),
            rotation: self.rotation * child.rotation,
            scale: self.scale * child.scale,
        }
    }

    pub fn forward(&self) -> Vec3 {
        self.rotation * Vec3::NEG_Z  // -Z is forward
    }

    pub fn right(&self) -> Vec3 {
        self.rotation * Vec3::X
    }

    pub fn up(&self) -> Vec3 {
        self.rotation * Vec3::Y
    }
}
```

## Quaternion Convention
- Layout: `(x, y, z, w)` — matches glTF, glam, Rapier
- Multiplication: Hamilton (left-to-right composition: `parent * child`)
- Identity: `(0, 0, 0, 1)`

## Space Pipeline

```
Asset Space (glTF) ──[AssetImporter]──> Engine Space ──[PhysicsSync]──> Physics Space
                                              │
                                              └──[AnimationSystem]──> Bone Space (local)
                                                                          │
                                                                          └──> World Bone Transform
```

- **Asset Space → Engine Space**: Apply `asset_rotation_fix` (usually identity for glTF Y-up). Apply `asset_scale` (usually 1.0 for glTF meters). Bake into metadata once.
- **Engine Space → Physics Space**: Identity transform. Rapier uses same Y-up right-handed convention.
- **Engine Space → Three.js Preview**: Identity. Three.js is Y-up right-handed. No conversion needed.
- **FBX imports**: FBX is Z-up. Apply 90° rotation around X on import. Bake once.

## Transform Validator

```rust
// engine/src/core/transform_validator.rs

pub fn validate_transform(t: &Transform, label: &str) -> Result<(), String> {
    // NaN/Inf guard
    if !t.position.is_finite() { return Err(format!("{}: position NaN/Inf", label)); }
    if !t.rotation.is_finite() { return Err(format!("{}: rotation NaN/Inf", label)); }
    if !t.scale.is_finite()    { return Err(format!("{}: scale NaN/Inf", label)); }

    // Quaternion must be normalized
    let qlen = t.rotation.length();
    if (qlen - 1.0).abs() > 0.01 {
        return Err(format!("{}: quaternion not normalized (len={})", label, qlen));
    }

    // Negative scale = mirror. Forbidden unless explicitly tagged.
    if t.scale.x < 0.0 || t.scale.y < 0.0 || t.scale.z < 0.0 {
        return Err(format!("{}: negative scale {:?}", label, t.scale));
    }

    // Non-uniform scale warning (physics can't handle well)
    let max_s = t.scale.max_element();
    let min_s = t.scale.min_element();
    if max_s > 0.0 && (max_s - min_s) / max_s > 0.05 {
        log::warn!("{}: non-uniform scale {:?} — physics collider will use max axis", label, t.scale);
    }

    Ok(())
}
```

## Non-Uniform Scale Policy
- **Rendering**: Allowed. GPU handles it fine.
- **Physics**: Rapier does NOT support non-uniform scale on colliders. When non-uniform, use `max_element()` as uniform physics scale, log warning.
- **Bone attachment**: Non-uniform scale on bones causes shear. Extract uniform scale before computing socket transforms.

## Golden Cube Test Asset

```
golden_cube.glb:
  - 1m × 1m × 1m box
  - Origin at geometric center
  - +X face = Red, -X = Cyan
  - +Y face = Green, -Y = Magenta
  - +Z face = Blue, -Z = Yellow
  - No skeleton, no animations
```

**Acceptance Tests (A):**
```
[A1] Spawn golden_cube at (0,0.5,0). Bottom face touches y=0 plane. ✓
[A2] Rotate 90° around Y-axis. Red face now faces +Z. ✓
[A3] Rotate 90° around X-axis. Green face now faces -Z. ✓
[A4] Three.js preview of same cube matches engine orientation exactly. ✓
[A5] validate_transform passes for identity transform. ✓
[A6] validate_transform rejects NaN position. ✓
[A7] validate_transform rejects negative scale. ✓
```

## Three.js Enforcement (for web preview consistency)

```javascript
// web/conventions.mjs — import in engine.mjs

export const ENGINE = {
    UP: new THREE.Vector3(0, 1, 0),
    FORWARD: new THREE.Vector3(0, 0, -1),
    RIGHT: new THREE.Vector3(1, 0, 0),
    UNITS_PER_METER: 1.0,
};

// Validate loaded model orientation
export function validateModelOrientation(model, name) {
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Characters should be taller than wide
    if (model.userData.type === 'character' && size.y < size.x) {
        console.error(`[Convention] ${name}: character is wider than tall — likely axis mismatch`);
        return false;
    }

    // Nothing should have zero-volume bounds
    if (size.x < 0.001 || size.y < 0.001 || size.z < 0.001) {
        console.error(`[Convention] ${name}: degenerate bounds ${size.toArray()}`);
        return false;
    }

    return true;
}
```

---

# B) ASSET PIPELINE

## AssetMetadata Schema

```rust
// engine/src/assets/metadata.rs

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AssetMetadata {
    pub id: String,                        // "sword_iron"
    pub display_name: String,              // "Iron Sword"
    pub category: AssetCategory,           // Character, Weapon, Building, Prop, etc.

    // Transform corrections (applied once on import)
    pub import_rotation: [f32; 4],         // quat fix for axis mismatch (usually identity)
    pub import_scale: f32,                 // uniform scale correction (usually 1.0)

    // Pivot / grounding
    pub pivot_policy: PivotPolicy,         // Feet or Center
    pub foot_offset: f32,                  // distance from pivot to bottom of mesh (meters)
    pub aabb_local: Aabb,                  // pre-computed local-space AABB

    // Physics
    pub collider_type: ColliderSpec,       // Auto, ConvexHull, TriMesh, Capsule, Box, None
    pub collision_mesh_name: Option<String>, // e.g., "UCX_Wall" if present in glTF

    // Skeleton / sockets
    pub sockets: HashMap<String, SocketDef>, // "hand_r" -> offset transform
    pub bone_naming: BoneNaming,           // KayKit, Mixamo, Custom

    // LOD
    pub lod_distances: Vec<f32>,           // [0, 20, 50, 100] meters

    // Flags
    pub is_static: bool,                   // buildings, terrain pieces
    pub is_walkable: bool,                 // floors, stairs, ramps
    pub is_climbable: bool,                // tagged surfaces
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum PivotPolicy {
    Feet,    // origin at bottom — characters, NPCs, furniture
    Center,  // origin at geometric center — weapons, projectiles, particles
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum ColliderSpec {
    Auto,        // importer decides based on category
    ConvexHull,
    TriMesh,
    Capsule { radius: f32, half_height: f32 },
    Box { half_extents: Vec3 },
    None,        // no collision (particles, VFX)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SocketDef {
    pub bone_name: String,       // actual bone name in skeleton
    pub offset_position: Vec3,   // local offset from bone
    pub offset_rotation: Quat,   // local rotation offset
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum BoneNaming {
    KayKitDot,     // Hand.R, LowerArm.R
    KayKitNoDot,   // PalmR, LowerArmR (Knight)
    Mixamo,        // mixamorig:RightHand
    Custom(HashMap<String, String>), // explicit map
}
```

## JSON sidecar example

```json
{
    "id": "knight",
    "display_name": "Knight Character",
    "category": "Character",
    "import_rotation": [0, 0, 0, 1],
    "import_scale": 1.0,
    "pivot_policy": "Feet",
    "foot_offset": 0.0,
    "aabb_local": { "min": [-0.3, 0.0, -0.2], "max": [0.3, 1.8, 0.2] },
    "collider_type": { "Capsule": { "radius": 0.3, "half_height": 0.6 } },
    "sockets": {
        "hand_r": { "bone_name": "PalmR", "offset_position": [0, 0, 0], "offset_rotation": [0, 0, 0, 1] },
        "hand_l": { "bone_name": "PalmL", "offset_position": [0, 0, 0], "offset_rotation": [0, 0, 0, 1] },
        "back":   { "bone_name": "Abdomen", "offset_position": [0.05, 0.1, -0.15], "offset_rotation": [0, 0, 0.7, 0.7] }
    },
    "bone_naming": "KayKitNoDot",
    "is_static": false,
    "is_walkable": false,
    "is_climbable": false
}
```

## Import Pipeline

```rust
// engine/src/assets/importer.rs

pub struct ImportResult {
    pub render_meshes: Vec<RenderMesh>,     // GPU-ready mesh data
    pub colliders: Vec<ColliderData>,        // physics shapes
    pub skeleton: Option<Skeleton>,          // bones + bind poses
    pub animations: Vec<AnimationClip>,
    pub metadata: AssetMetadata,             // validated + auto-populated
}

pub fn import_gltf(path: &Path, override_meta: Option<AssetMetadata>) -> Result<ImportResult> {
    let (document, buffers, images) = gltf::import(path)?;

    // 1. Extract all meshes with transforms
    let mut meshes = Vec::new();
    let mut world_aabb = Aabb::EMPTY;
    for node in document.nodes() {
        let local_transform = node_to_transform(&node);
        validate_transform(&local_transform, &format!("node:{}", node.name().unwrap_or("?")))?;

        if let Some(mesh) = node.mesh() {
            let render_mesh = extract_render_mesh(&mesh, &buffers, &local_transform);
            world_aabb = world_aabb.union(&render_mesh.world_aabb);
            meshes.push(render_mesh);
        }
    }

    // 2. Auto-detect axis mismatch
    let mut meta = override_meta.unwrap_or_else(|| auto_detect_metadata(&document, &world_aabb));

    // If model is wider than tall and it's a character, likely Z-up — fix it
    let size = world_aabb.size();
    if meta.category == AssetCategory::Character && size.y < size.x * 0.5 {
        log::warn!("Character {} appears Z-up, applying -90° X rotation", path.display());
        meta.import_rotation = Quat::from_rotation_x(-std::f32::consts::FRAC_PI_2).into();
    }

    // 3. Compute foot offset for grounding
    let corrected_aabb = apply_import_transform(&world_aabb, &meta);
    meta.foot_offset = -corrected_aabb.min.y; // distance from origin to feet
    meta.aabb_local = corrected_aabb;

    // 4. Extract skeleton + detect bone naming
    let skeleton = extract_skeleton(&document, &buffers);
    if let Some(ref skel) = skeleton {
        meta.bone_naming = detect_bone_naming(skel);
        meta.sockets = auto_detect_sockets(skel, &meta.bone_naming);
    }

    // 5. Generate colliders
    let colliders = generate_colliders(&document, &meshes, &meta);

    // 6. Extract animations
    let animations = extract_animations(&document, &buffers);

    Ok(ImportResult { render_meshes: meshes, colliders, skeleton, animations, metadata: meta })
}
```

## Auto-Ground Algorithm

```rust
// engine/src/world/grounding.rs

/// Given a model and target position (x, z), compute the Y so the model
/// rests on the ground surface.
pub fn compute_grounded_position(
    target_xz: Vec2,
    asset_meta: &AssetMetadata,
    terrain: &TerrainQuery,
) -> Vec3 {
    let ground_y = terrain.height_at(target_xz.x, target_xz.y); // raycast or heightmap lookup

    match asset_meta.pivot_policy {
        PivotPolicy::Feet => {
            // Pivot is at feet. Just place at ground height + foot_offset.
            Vec3::new(target_xz.x, ground_y + asset_meta.foot_offset, target_xz.y)
        }
        PivotPolicy::Center => {
            // Pivot is at center. Offset by half AABB height.
            let half_h = asset_meta.aabb_local.size().y * 0.5;
            Vec3::new(target_xz.x, ground_y + half_h, target_xz.y)
        }
    }
}

/// Snap existing entity to ground (for dynamic re-grounding)
pub fn snap_to_ground(
    transform: &mut Transform,
    asset_meta: &AssetMetadata,
    terrain: &TerrainQuery,
    lerp_speed: f32,  // 0.0 = instant, 0.2 = smooth
    dt: f32,
) {
    let target = compute_grounded_position(
        Vec2::new(transform.position.x, transform.position.z),
        asset_meta,
        terrain,
    );

    if lerp_speed <= 0.0 {
        transform.position.y = target.y;
    } else {
        let alpha = 1.0 - (-lerp_speed * dt * 60.0).exp();
        transform.position.y = transform.position.y + (target.y - transform.position.y) * alpha;
    }
}
```

## Three.js Grounding (matching implementation)

```javascript
// web/grounding.mjs

export function computeGroundedY(model, metadata, terrainMesh) {
    const box = new THREE.Box3().setFromObject(model);
    const groundY = getTerrainY(model.position.x, model.position.z, terrainMesh);

    if (metadata.pivot_policy === 'Feet') {
        return groundY + (metadata.foot_offset || 0);
    } else {
        // Center pivot: lift by half height
        const halfH = (box.max.y - box.min.y) * 0.5;
        return groundY + halfH;
    }
}

export function snapToGround(model, metadata, terrainMesh) {
    model.position.y = computeGroundedY(model, metadata, terrainMesh);
}

function getTerrainY(x, z, terrainMesh) {
    if (!terrainMesh) return 0;
    const ray = new THREE.Raycaster(
        new THREE.Vector3(x, 500, z),
        new THREE.Vector3(0, -1, 0)
    );
    const hits = ray.intersectObject(terrainMesh);
    return hits.length > 0 ? hits[0].point.y : 0;
}
```

## Spawn Preview Debug Tool

```javascript
// web/debug/spawn-preview.mjs

export function showSpawnPreview(model, metadata) {
    const group = new THREE.Group();

    // 1. AABB wireframe
    const box = new THREE.Box3().setFromObject(model);
    const boxHelper = new THREE.Box3Helper(box, 0x00ff00);
    group.add(boxHelper);

    // 2. Axes gizmo at model origin
    const axes = new THREE.AxesHelper(0.5);
    axes.position.copy(model.position);
    group.add(axes);

    // 3. Pivot point (red sphere)
    const pivotGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const pivotMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const pivot = new THREE.Mesh(pivotGeo, pivotMat);
    pivot.position.copy(model.position);
    group.add(pivot);

    // 4. Ground contact point (green sphere)
    const contactGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const contactMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const contact = new THREE.Mesh(contactGeo, contactMat);
    contact.position.set(model.position.x, box.min.y, model.position.z);
    group.add(contact);

    // 5. Forward direction arrow (blue)
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(model.quaternion);
    const arrow = new THREE.ArrowHelper(dir, model.position, 1.0, 0x0000ff);
    group.add(arrow);

    return group;
}
```

**Acceptance Tests (B):**
```
[B1] Spawn 20 random library assets on flat plane; visually inspect none float/buried. ✓
[B2] Spawn knight character: feet touch ground, stands upright. ✓
[B3] Spawn sword (center pivot): center is at hand height, not buried. ✓
[B4] Import FBX Z-up model: auto-rotated to Y-up, stands correctly. ✓
[B5] AssetMetadata round-trips through JSON serialization. ✓
[B6] Debug preview shows correct AABB, pivot, ground contact, forward arrow. ✓
```

---

# C) PHYSICS FOUNDATION

## Collision Layers

```rust
// engine/src/physics/layers.rs

bitflags! {
    pub struct CollisionLayer: u32 {
        const WORLD_STATIC  = 1 << 0;  // terrain, buildings, floors
        const WORLD_DYNAMIC = 1 << 1;  // crates, barrels, physics props
        const CHARACTER      = 1 << 2;  // player capsule
        const NPC            = 1 << 3;  // NPC capsules
        const WEAPON         = 1 << 4;  // equipped weapon colliders (for melee hit detection)
        const PROJECTILE     = 1 << 5;  // bullets, arrows
        const TRIGGER        = 1 << 6;  // doors, pickups, water volumes, quest zones
        const WATER_VOLUME   = 1 << 7;  // ocean/lake trigger volumes
        const CLIMBABLE      = 1 << 8;  // ledges, ladders
    }
}

/// Who collides with whom (symmetric matrix)
pub fn collision_filter(a: CollisionLayer, b: CollisionLayer) -> bool {
    // Characters collide with: static, dynamic, NPC, trigger, water, climbable
    // Characters do NOT collide with: other characters (avoid stacking), weapons, projectiles (use overlap test)
    // Projectiles collide with: static, dynamic, character, NPC
    // Triggers collide with nothing (sensor only)

    match (a, b) {
        _ if a.contains(CollisionLayer::TRIGGER) || b.contains(CollisionLayer::TRIGGER) => false,
        _ if a.contains(CollisionLayer::WATER_VOLUME) || b.contains(CollisionLayer::WATER_VOLUME) => false,
        _ if a.contains(CollisionLayer::CHARACTER) && b.contains(CollisionLayer::CHARACTER) => false,
        _ if a.contains(CollisionLayer::NPC) && b.contains(CollisionLayer::NPC) => false,
        _ if a.contains(CollisionLayer::PROJECTILE) && b.contains(CollisionLayer::WEAPON) => false,
        _ => true, // default: collide
    }
}

// Rapier integration: use collision groups
// Rapier groups = (membership_bits, filter_bits)
pub fn to_rapier_groups(layer: CollisionLayer) -> InteractionGroups {
    let membership = layer.bits();
    let filter = match layer {
        l if l.contains(CollisionLayer::CHARACTER) =>
            (CollisionLayer::WORLD_STATIC | CollisionLayer::WORLD_DYNAMIC |
             CollisionLayer::NPC | CollisionLayer::CLIMBABLE).bits(),
        l if l.contains(CollisionLayer::PROJECTILE) =>
            (CollisionLayer::WORLD_STATIC | CollisionLayer::WORLD_DYNAMIC |
             CollisionLayer::CHARACTER | CollisionLayer::NPC).bits(),
        l if l.contains(CollisionLayer::TRIGGER) => 0, // sensors handled separately
        l if l.contains(CollisionLayer::WATER_VOLUME) => 0,
        _ => u32::MAX, // default: collide with everything
    };
    InteractionGroups::new(membership.into(), filter.into())
}
```

## Collider Generation

```rust
// engine/src/physics/collider_gen.rs

pub fn generate_colliders(
    document: &gltf::Document,
    meshes: &[RenderMesh],
    meta: &AssetMetadata,
) -> Vec<ColliderData> {
    // 1. Check for explicit collision meshes (UCX_ or COL_ prefix)
    let explicit: Vec<_> = meshes.iter()
        .filter(|m| m.name.starts_with("UCX_") || m.name.starts_with("COL_")
                     || m.extras.get("collision") == Some(&Value::Bool(true)))
        .collect();

    if !explicit.is_empty() {
        return explicit.iter().map(|m| ColliderData::TriMesh(m.vertices.clone(), m.indices.clone())).collect();
    }

    // 2. No explicit collision mesh — use heuristic
    match &meta.collider_type {
        ColliderSpec::None => vec![],
        ColliderSpec::Capsule { radius, half_height } => {
            vec![ColliderData::Capsule { radius: *radius, half_height: *half_height }]
        }
        ColliderSpec::Box { half_extents } => {
            vec![ColliderData::Box { half_extents: *half_extents }]
        }
        ColliderSpec::ConvexHull => {
            let all_verts: Vec<Vec3> = meshes.iter().flat_map(|m| m.vertices.iter().copied()).collect();
            vec![ColliderData::ConvexHull(all_verts)]
        }
        ColliderSpec::TriMesh => {
            // Combine all mesh vertices + indices
            let mut all_verts = Vec::new();
            let mut all_indices = Vec::new();
            let mut offset = 0u32;
            for m in meshes {
                all_verts.extend_from_slice(&m.vertices);
                all_indices.extend(m.indices.iter().map(|i| i + offset));
                offset += m.vertices.len() as u32;
            }
            vec![ColliderData::TriMesh(all_verts, all_indices)]
        }
        ColliderSpec::Auto => {
            match meta.category {
                AssetCategory::Character | AssetCategory::NPC => {
                    // Capsule from AABB
                    let size = meta.aabb_local.size();
                    let radius = size.x.max(size.z) * 0.4;
                    let half_h = (size.y * 0.5 - radius).max(0.1);
                    vec![ColliderData::Capsule { radius, half_height: half_h }]
                }
                AssetCategory::Building | AssetCategory::Terrain => {
                    // TriMesh for accurate static collision
                    let mut all_verts = Vec::new();
                    let mut all_indices = Vec::new();
                    let mut offset = 0u32;
                    for m in meshes.iter().filter(|m| !m.name.starts_with("LOD")) {
                        all_verts.extend_from_slice(&m.vertices);
                        all_indices.extend(m.indices.iter().map(|i| i + offset));
                        offset += m.vertices.len() as u32;
                    }
                    vec![ColliderData::TriMesh(all_verts, all_indices)]
                }
                AssetCategory::Weapon => {
                    // Small box from AABB
                    let he = meta.aabb_local.size() * 0.5;
                    vec![ColliderData::Box { half_extents: he }]
                }
                _ => {
                    // Props: convex hull
                    let all_verts: Vec<Vec3> = meshes.iter().flat_map(|m| m.vertices.iter().copied()).collect();
                    vec![ColliderData::ConvexHull(all_verts)]
                }
            }
        }
    }
}
```

## CCD Policy

```rust
// In physics world setup:
// - Projectiles: CCD enabled (small + fast)
// - Characters: CCD disabled (capsule is large enough, kinematic controller handles sweeps)
// - Props: CCD disabled unless tagged "fast_moving"

pub fn should_enable_ccd(meta: &AssetMetadata) -> bool {
    matches!(meta.category, AssetCategory::Projectile)
}
```

## Physics Debug Overlay (Three.js)

```javascript
// web/debug/physics-debug.mjs

export class PhysicsDebugRenderer {
    constructor(scene) {
        this.scene = scene;
        this.debugGroup = new THREE.Group();
        this.debugGroup.name = 'physics_debug';
        scene.add(this.debugGroup);
        this.enabled = false;
    }

    toggle() {
        this.enabled = !this.enabled;
        this.debugGroup.visible = this.enabled;
        return this.enabled;
    }

    // Called each frame with collider data
    update(colliders) {
        // Clear old
        while (this.debugGroup.children.length) {
            this.debugGroup.remove(this.debugGroup.children[0]);
        }
        if (!this.enabled) return;

        const mat = new THREE.MeshBasicMaterial({
            color: 0x00ff00, wireframe: true, transparent: true, opacity: 0.3
        });

        for (const col of colliders) {
            let geo;
            switch (col.type) {
                case 'capsule':
                    geo = new THREE.CapsuleGeometry(col.radius, col.halfHeight * 2, 8, 16);
                    break;
                case 'box':
                    geo = new THREE.BoxGeometry(col.hx * 2, col.hy * 2, col.hz * 2);
                    break;
                case 'trimesh':
                    // Wireframe of collision mesh
                    geo = new THREE.BufferGeometry();
                    geo.setAttribute('position', new THREE.Float32BufferAttribute(col.vertices, 3));
                    geo.setIndex(col.indices);
                    break;
                default: continue;
            }
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(col.px, col.py, col.pz);
            mesh.quaternion.set(col.qx, col.qy, col.qz, col.qw);
            this.debugGroup.add(mesh);
        }
    }
}
```

**Acceptance Tests (C):**
```
[C1] Character cannot walk through a 10m wall at any speed (including sprint). ✓
[C2] Drop sphere from 2m onto floor: rests stable, no jitter, no sinking. ✓
[C3] Projectile with CCD hits thin wall (0.1m) without tunneling. ✓
[C4] Trigger volume does not block character movement. ✓
[C5] Physics debug wireframes match visual mesh bounds. ✓
[C6] Building trimesh collider prevents all character penetration. ✓
```

---

# D) CHARACTER CONTROLLER

## Core Architecture

```rust
// engine/src/character/controller.rs

pub struct CharacterController {
    // Shape
    pub capsule_radius: f32,       // 0.3m
    pub capsule_half_height: f32,  // 0.6m (total height = 2*0.6 + 2*0.3 = 1.8m)

    // Ground detection
    pub grounded: bool,
    pub ground_normal: Vec3,
    pub ground_distance: f32,
    pub ground_snap_distance: f32, // 0.1m — snap to ground if within this
    pub max_slope_angle: f32,      // 45° in radians

    // Step
    pub step_height: f32,          // 0.35m
    pub step_forward_test: f32,    // 0.05m

    // Movement tuning
    pub walk_speed: f32,           // 3.0 m/s
    pub run_speed: f32,            // 7.0 m/s
    pub sprint_speed: f32,         // 10.0 m/s
    pub acceleration: f32,         // 50.0 m/s²
    pub deceleration: f32,         // 40.0 m/s²
    pub air_control: f32,          // 0.3 (30% of ground control)
    pub friction: f32,             // 8.0

    // Jump
    pub jump_force: f32,           // 7.0 m/s
    pub gravity: f32,              // -20.0 m/s² (tuned heavier than real for game feel)
    pub coyote_time: f32,          // 0.12s
    pub jump_buffer: f32,          // 0.1s

    // State
    pub velocity: Vec3,
    pub position: Vec3,
    pub facing: Quat,

    // Timers
    time_since_grounded: f32,
    time_since_jump_pressed: f32,

    // Camera
    pub camera_mode: CameraMode,
}

#[derive(Clone, Debug)]
pub enum CameraMode {
    ThirdPerson {
        arm_length: f32,        // 3.0m
        arm_min: f32,           // 1.0m
        arm_max: f32,           // 10.0m
        height_offset: f32,     // 1.5m (look at chest, not feet)
        shoulder_offset: f32,   // 0.4m (over-the-shoulder)
        pitch: f32,             // current pitch angle
        yaw: f32,               // current yaw angle
        collision_radius: f32,  // 0.2m (camera collision sphere)
    },
    FirstPerson {
        head_bone: String,      // bone to attach camera to
        height_offset: f32,     // additional Y offset from bone
        pitch: f32,
        yaw: f32,
        weapon_fov: f32,        // separate FOV for viewmodel (60°)
    },
}
```

## Movement Update (per frame)

```rust
impl CharacterController {
    pub fn update(&mut self, input: &InputState, physics: &mut PhysicsWorld, dt: f32) {
        // 1. Ground check
        self.update_ground_state(physics);

        // 2. Compute desired move direction from input
        let move_dir = self.compute_move_direction(input);

        // 3. Apply acceleration / deceleration
        let target_speed = if input.sprint { self.sprint_speed }
                          else if input.run { self.run_speed }
                          else { self.walk_speed };

        let control = if self.grounded { 1.0 } else { self.air_control };
        let accel = if move_dir.length_squared() > 0.01 { self.acceleration } else { self.deceleration };

        let target_vel = move_dir * target_speed;
        let horizontal_vel = Vec3::new(self.velocity.x, 0.0, self.velocity.z);
        let new_horizontal = move_toward_vec3(horizontal_vel, target_vel, accel * control * dt);
        self.velocity.x = new_horizontal.x;
        self.velocity.z = new_horizontal.z;

        // 4. Gravity
        if !self.grounded {
            self.velocity.y += self.gravity * dt;
        }

        // 5. Jump (with coyote time + buffer)
        self.time_since_grounded += dt;
        self.time_since_jump_pressed += dt;

        if input.jump_pressed {
            self.time_since_jump_pressed = 0.0;
        }

        let can_coyote = self.time_since_grounded < self.coyote_time;
        let has_buffered = self.time_since_jump_pressed < self.jump_buffer;

        if (self.grounded || can_coyote) && has_buffered {
            self.velocity.y = self.jump_force;
            self.grounded = false;
            self.time_since_grounded = self.coyote_time; // prevent double jump
            self.time_since_jump_pressed = self.jump_buffer;
        }

        // 6. Move with collision (sweep test)
        let desired_move = self.velocity * dt;
        let resolved = self.sweep_move(physics, desired_move);

        // 7. Step handling (if blocked horizontally)
        let horizontal_blocked =
            (desired_move.x.abs() > 0.001 || desired_move.z.abs() > 0.001) &&
            (resolved.x - desired_move.x).abs() > 0.001;

        if horizontal_blocked && self.grounded {
            if let Some(stepped) = self.try_step_up(physics, desired_move) {
                self.position = stepped;
            } else {
                self.position += resolved;
            }
        } else {
            self.position += resolved;
        }

        // 8. Ground snap (prevent hovering on downslopes)
        if self.grounded && self.velocity.y <= 0.0 {
            self.snap_to_ground(physics);
        }

        // 9. Update facing
        if move_dir.length_squared() > 0.01 {
            let target_yaw = (-move_dir.z).atan2(move_dir.x) - std::f32::consts::FRAC_PI_2;
            let target_quat = Quat::from_rotation_y(target_yaw);
            self.facing = self.facing.slerp(target_quat, 10.0 * dt);
        }
    }

    fn update_ground_state(&mut self, physics: &PhysicsWorld) {
        // Cast capsule downward by ground_snap_distance
        let cast_result = physics.cast_shape(
            &Capsule::new(self.capsule_half_height, self.capsule_radius),
            self.position,
            Vec3::NEG_Y,
            self.ground_snap_distance + 0.02, // small extra for detection
            CollisionLayer::WORLD_STATIC | CollisionLayer::WORLD_DYNAMIC,
        );

        if let Some(hit) = cast_result {
            let slope_angle = hit.normal.angle_between(Vec3::Y);
            if slope_angle <= self.max_slope_angle {
                self.grounded = true;
                self.ground_normal = hit.normal;
                self.ground_distance = hit.distance;
                self.time_since_grounded = 0.0;

                // Kill downward velocity when grounded
                if self.velocity.y < 0.0 {
                    self.velocity.y = 0.0;
                }
            } else {
                // Too steep = slide
                self.grounded = false;
                // Apply slide force along slope
                let slide = (Vec3::NEG_Y - hit.normal * hit.normal.dot(Vec3::NEG_Y)).normalize();
                self.velocity += slide * 15.0 * (1.0 / 60.0); // approximate
            }
        } else {
            self.grounded = false;
        }
    }

    fn try_step_up(&self, physics: &PhysicsWorld, desired: Vec3) -> Option<Vec3> {
        // 1. Move up by step_height
        let step_up_pos = self.position + Vec3::new(0.0, self.step_height, 0.0);

        // Check if we can move up
        let up_clear = physics.cast_shape(
            &Capsule::new(self.capsule_half_height, self.capsule_radius),
            self.position,
            Vec3::Y,
            self.step_height,
            CollisionLayer::WORLD_STATIC,
        ).is_none();

        if !up_clear { return None; }

        // 2. Move forward at elevated position
        let horizontal = Vec3::new(desired.x, 0.0, desired.z);
        let forward_result = physics.sweep_shape(
            &Capsule::new(self.capsule_half_height, self.capsule_radius),
            step_up_pos,
            horizontal.normalize(),
            horizontal.length(),
            CollisionLayer::WORLD_STATIC,
        );

        let forward_pos = step_up_pos + forward_result.resolved_translation;

        // 3. Step down to find ground
        let down_result = physics.cast_shape(
            &Capsule::new(self.capsule_half_height, self.capsule_radius),
            forward_pos,
            Vec3::NEG_Y,
            self.step_height + self.ground_snap_distance,
            CollisionLayer::WORLD_STATIC,
        );

        if let Some(hit) = down_result {
            let final_pos = forward_pos + Vec3::NEG_Y * hit.distance;
            Some(final_pos)
        } else {
            None // no ground found after step
        }
    }

    fn snap_to_ground(&mut self, physics: &PhysicsWorld) {
        if self.ground_distance > 0.001 && self.ground_distance < self.ground_snap_distance {
            self.position.y -= self.ground_distance;
        }
    }
}
```

## Camera: Third Person Spring Arm with Collision

```rust
// engine/src/character/camera.rs

pub fn update_third_person_camera(
    player_pos: Vec3,
    config: &ThirdPersonConfig,
    physics: &PhysicsWorld,
) -> (Vec3 /* camera_pos */, Vec3 /* look_at */) {
    let look_at = player_pos + Vec3::new(0.0, config.height_offset, 0.0);

    // Compute ideal camera position from pitch/yaw
    let pitch_rad = config.pitch;
    let yaw_rad = config.yaw;

    let offset = Vec3::new(
        config.arm_length * pitch_rad.cos() * yaw_rad.sin() + config.shoulder_offset,
        config.arm_length * pitch_rad.sin(),
        config.arm_length * pitch_rad.cos() * yaw_rad.cos(),
    );

    let ideal_pos = look_at + offset;

    // Collision test: raycast from look_at to ideal_pos
    let dir = (ideal_pos - look_at).normalize();
    let max_dist = (ideal_pos - look_at).length();

    let actual_dist = if let Some(hit) = physics.raycast(
        look_at,
        dir,
        max_dist,
        CollisionLayer::WORLD_STATIC,
    ) {
        (hit.distance - config.collision_radius).max(0.5)
    } else {
        max_dist
    };

    let camera_pos = look_at + dir * actual_dist;
    (camera_pos, look_at)
}
```

**Acceptance Tests (D):**
```
[D1] Walk up 5-step staircase (step height 0.25m): smooth, no bouncing. ✓
[D2] Walk through 1m-wide doorway at sprint: no snagging on edges. ✓
[D3] Walk down 30° slope: no floating, smooth descent. ✓
[D4] Stand on 50° slope: slides off. ✓
[D5] Jump with coyote time: can jump 0.1s after walking off ledge. ✓
[D6] Camera collision: spring arm shortens when near wall. ✓
[D7] Toggle 1P/3P: smooth transition, no pop. ✓
[D8] Sprint into wall for 10s: no penetration. ✓
```

---

# E) NPC LOCOMOTION + ANIMATION

## NPC Controller (Shared Core)

```rust
// engine/src/npc/controller.rs

pub struct NPCController {
    /// Reuses the same movement core as player
    pub movement: CharacterController,

    /// AI state machine
    pub state: NPCState,

    /// Navigation target
    pub target_position: Option<Vec3>,

    /// Combat target
    pub target_entity: Option<EntityId>,

    /// Config
    pub config: NPCConfig,
}

#[derive(Clone, Debug)]
pub enum NPCState {
    Idle { timer: f32 },
    Patrol { waypoints: Vec<Vec3>, current_index: usize },
    Chase { target: EntityId },
    Attack { target: EntityId, cooldown: f32 },
    Flee { from: Vec3 },
    Dead,
}

pub struct NPCConfig {
    pub detection_range: f32,       // 15m
    pub attack_range: f32,          // melee: 2m, ranged: 20m
    pub patrol_speed: f32,          // 2.0 m/s
    pub chase_speed: f32,           // 6.0 m/s
    pub damage: f32,                // per hit
    pub attack_cooldown: f32,       // 1.0s
    pub leash_range: f32,           // 30m (returns to patrol if too far)
}

impl NPCController {
    pub fn update(&mut self, world: &World, physics: &mut PhysicsWorld, dt: f32) {
        // 1. State transitions
        self.evaluate_state(world);

        // 2. Compute input based on state
        let input = self.state_to_input(world);

        // 3. Same movement update as player
        self.movement.update(&input, physics, dt);

        // 4. Ground snap (critical — prevents floating)
        if let Some(terrain) = world.terrain() {
            snap_to_ground(
                &mut self.movement.position,
                &self.movement.asset_meta,
                terrain,
                0.25, // lerp speed (smooth)
                dt,
            );
        }
    }

    fn state_to_input(&self, world: &World) -> InputState {
        match &self.state {
            NPCState::Idle { .. } => InputState::NONE,
            NPCState::Patrol { waypoints, current_index } => {
                let target = waypoints[*current_index];
                let dir = (target - self.movement.position).normalize();
                InputState { move_direction: Vec2::new(dir.x, dir.z), run: false, sprint: false, ..Default::default() }
            }
            NPCState::Chase { target } => {
                if let Some(target_pos) = world.get_position(*target) {
                    let dir = (target_pos - self.movement.position).normalize();
                    InputState { move_direction: Vec2::new(dir.x, dir.z), run: true, sprint: false, ..Default::default() }
                } else {
                    InputState::NONE
                }
            }
            NPCState::Attack { .. } => InputState::NONE, // stop moving while attacking
            NPCState::Flee { from } => {
                let dir = (self.movement.position - *from).normalize();
                InputState { move_direction: Vec2::new(dir.x, dir.z), run: true, sprint: true, ..Default::default() }
            }
            NPCState::Dead => InputState::NONE,
        }
    }
}
```

## Animation State Machine

```rust
// engine/src/animation/state_machine.rs

pub struct AnimStateMachine {
    pub current: AnimState,
    pub blend_time: f32,
    pub blend_progress: f32,
    pub clips: HashMap<AnimState, AnimClipId>,
}

#[derive(Clone, Copy, Debug, Hash, Eq, PartialEq)]
pub enum AnimState {
    Idle,
    Walk,
    Run,
    Sprint,
    Jump,
    Fall,
    Land,
    Attack,
    HeavyAttack,
    Death,
    Roll,
    Climb,
    Swim,
}

impl AnimStateMachine {
    pub fn transition(&mut self, new_state: AnimState, blend_time: f32) {
        if self.current == new_state { return; }
        self.current = new_state;
        self.blend_time = blend_time;
        self.blend_progress = 0.0;
    }

    pub fn update_from_controller(&mut self, ctrl: &CharacterController) {
        let speed = Vec2::new(ctrl.velocity.x, ctrl.velocity.z).length();

        let new_state = if ctrl.velocity.y > 1.0 { AnimState::Jump }
            else if !ctrl.grounded && ctrl.velocity.y < -1.0 { AnimState::Fall }
            else if speed > 8.0 { AnimState::Sprint }
            else if speed > 4.0 { AnimState::Run }
            else if speed > 0.5 { AnimState::Walk }
            else { AnimState::Idle };

        self.transition(new_state, 0.15); // 150ms blend
    }
}
```

## Bone Name Retarget Map

```rust
// engine/src/animation/retarget.rs

pub struct HumanoidBoneMap {
    pub hips: String,
    pub spine: String,
    pub chest: String,
    pub neck: String,
    pub head: String,
    pub shoulder_l: String,
    pub upper_arm_l: String,
    pub lower_arm_l: String,
    pub hand_l: String,
    pub shoulder_r: String,
    pub upper_arm_r: String,
    pub lower_arm_r: String,
    pub hand_r: String,
    pub upper_leg_l: String,
    pub lower_leg_l: String,
    pub foot_l: String,
    pub upper_leg_r: String,
    pub lower_leg_r: String,
    pub foot_r: String,
}

pub fn detect_bone_map(skeleton: &Skeleton) -> HumanoidBoneMap {
    let names: Vec<&str> = skeleton.bones.iter().map(|b| b.name.as_str()).collect();

    // Detect naming convention by looking for known patterns
    if names.iter().any(|n| n.contains("mixamorig")) {
        mixamo_map()
    } else if names.iter().any(|n| n.contains('.')) {
        // KayKit dot convention: Hand.R, LowerArm.R
        kaykit_dot_map()
    } else if names.iter().any(|n| *n == "PalmR" || *n == "LowerArmR") {
        // KayKit no-dot: PalmR, LowerArmR (Knight)
        kaykit_nodot_map()
    } else {
        // Attempt fuzzy match
        fuzzy_bone_map(&names)
    }
}
```

**Acceptance Tests (E):**
```
[E1] Spawn 10 NPCs on hilly terrain: none floating, none under ground. ✓
[E2] NPCs walk smoothly, feet don't slide (speed matches animation). ✓
[E3] NPC transitions Idle→Walk→Run→Idle with smooth blends. ✓
[E4] NPC chases player and stops at attack range. ✓
[E5] NPC returns to patrol if player escapes leash range. ✓
[E6] Bone map correctly identified for all 3 naming conventions. ✓
```

---

# F) WATER / OCEAN VOLUMES

```rust
// engine/src/world/water.rs

pub struct WaterVolume {
    pub bounds: Aabb,              // world-space volume
    pub surface_y: f32,            // water surface height
    pub current: Vec3,             // water flow direction + strength
    pub swim_threshold: f32,       // 1.2m — depth at which character swims
}

pub enum WaterInteraction {
    None,                          // not in water
    Wading { depth: f32 },         // feet in water, still walking
    Swimming { depth: f32 },       // deep enough to swim
}

pub fn check_water_interaction(
    character_pos: Vec3,
    foot_y: f32,
    water: &WaterVolume,
) -> WaterInteraction {
    if !water.bounds.contains_xz(character_pos.x, character_pos.z) {
        return WaterInteraction::None;
    }

    let depth = water.surface_y - foot_y;

    if depth <= 0.0 {
        WaterInteraction::None
    } else if depth < water.swim_threshold {
        WaterInteraction::Wading { depth }
    } else {
        WaterInteraction::Swimming { depth }
    }
}

// In character controller update:
// match water_interaction {
//     Wading { depth } => {
//         // Slow movement proportional to depth
//         speed_multiplier = 1.0 - (depth / swim_threshold) * 0.5;
//     }
//     Swimming { depth } => {
//         // Switch to swim movement: no gravity, buoyancy, swim controls
//         self.velocity.y = (water.surface_y - 0.3 - self.position.y) * 3.0; // bob at surface
//         // Horizontal: same input but swim speed
//     }
// }
```

**Acceptance Tests (F):**
```
[F1] Walk into shallow water (0.3m): still walking, speed reduced ~15%. ✓
[F2] Walk deeper (1.5m): transitions to swim mode, no flicker. ✓
[F3] Swim to shore: transitions back to walk smoothly. ✓
[F4] Debug shows water volume bounds and depth value. ✓
```

---

# G) WEAPON EQUIP SYSTEM

```rust
// engine/src/equipment/weapon_attach.rs

pub struct WeaponAttachment {
    pub weapon_entity: EntityId,
    pub socket_name: String,          // "hand_r", "back", etc.
    pub grip_offset: Transform,       // per-weapon grip offset
    pub is_drawn: bool,               // true = in hand, false = holstered
}

/// Called AFTER animation update, BEFORE render
pub fn update_weapon_transforms(
    attachments: &[WeaponAttachment],
    skeletons: &SkeletonQuery,
    transforms: &mut TransformQuery,
) {
    for attach in attachments {
        // Get the bone's world transform (computed by animation system)
        let bone_world = skeletons.bone_world_transform(
            attach.weapon_entity,
            &attach.socket_name,
        );

        if let Some(bone_tf) = bone_world {
            // Weapon transform = bone_world * grip_offset
            let weapon_tf = bone_tf.mul(&attach.grip_offset);

            // Validate before applying
            if let Err(e) = validate_transform(&weapon_tf, "weapon") {
                log::error!("Weapon transform invalid: {}", e);
                continue;
            }

            // Compensate for bone scale (extract uniform scale)
            let bone_scale = bone_tf.scale.max_element();
            let corrected = Transform {
                position: weapon_tf.position,
                rotation: weapon_tf.rotation,
                scale: weapon_tf.scale / bone_scale, // cancel bone scale, apply weapon's own
            };

            transforms.set(attach.weapon_entity, corrected);
        }
    }
}

/// Per-weapon grip offset metadata
pub struct WeaponGripData {
    pub hand_offset: Transform,    // offset when held in hand
    pub holster_offset: Transform, // offset when on back/hip
    pub holster_socket: String,    // "back" or "hip_r"
    pub is_two_handed: bool,
    pub left_hand_ik_target: Option<Vec3>, // local-space IK point for off-hand
}
```

## Three.js Weapon Attach (must match Rust exactly)

```javascript
// web/weapon-attach.mjs

export function updateWeaponTransform(weaponMesh, skeleton, socketName, gripOffset) {
    const bone = findBone(skeleton, socketName);
    if (!bone) return;

    // Get bone world transform
    bone.updateWorldMatrix(true, false);

    // Extract bone world scale (for compensation)
    const boneWorldScale = new THREE.Vector3();
    bone.getWorldScale(boneWorldScale);
    const uniformScale = Math.max(boneWorldScale.x, 0.001);

    // Apply grip offset in bone-local space
    // weapon_world = bone_world * grip_offset
    weaponMesh.position.copy(gripOffset.position);
    weaponMesh.quaternion.copy(gripOffset.quaternion);
    weaponMesh.scale.copy(gripOffset.scale).divideScalar(uniformScale);

    // Parent to bone (Three.js handles the world transform automatically)
    if (weaponMesh.parent !== bone) {
        bone.add(weaponMesh);
    }
}

function findBone(skeleton, socketName) {
    // Try all naming conventions
    const SOCKET_NAMES = {
        'hand_r': ['PalmR', 'Hand.R', 'mixamorig:RightHand', 'RightHand', 'hand_r'],
        'hand_l': ['PalmL', 'Hand.L', 'mixamorig:LeftHand', 'LeftHand', 'hand_l'],
        'back':   ['Abdomen', 'Spine1', 'Torso', 'mixamorig:Spine1'],
        'hip_r':  ['UpperLegR', 'UpperLeg.R', 'mixamorig:RightUpLeg'],
        'hip_l':  ['UpperLegL', 'UpperLeg.L', 'mixamorig:LeftUpLeg'],
    };

    const candidates = SOCKET_NAMES[socketName] || [socketName];
    let found = null;
    skeleton.traverse(function(node) {
        if (!found && node.isBone) {
            const name = node.name;
            for (const c of candidates) {
                if (name === c || name.toLowerCase() === c.toLowerCase()) {
                    found = node;
                    break;
                }
            }
        }
    });
    return found;
}
```

**Acceptance Tests (G):**
```
[G1] Equip iron_sword on knight: grip at hilt, blade forward. ✓
[G2] Equip iron_sword on adventurer (different skeleton): same visual result. ✓
[G3] Equip blaster on soldier (Mixamo bones): gun in hand, barrel forward. ✓
[G4] Holster sword: appears on back, angled correctly. ✓
[G5] Draw weapon: smooth transition from back to hand (over 0.3s). ✓
[G6] No jitter: weapon stays locked to hand during walk/run animation. ✓
[G7] Bone axes debug gizmo shows correct socket position. ✓
```

---

# H) CLIMBING / LEDGE GRAB

```rust
// engine/src/traversal/climbing.rs

pub struct ClimbDetector {
    pub wall_check_height: f32,    // 1.0m (chest height)
    pub ledge_check_offset: f32,   // 0.1m above wall top
    pub max_grab_distance: f32,    // 0.8m
    pub max_grab_angle: f32,       // 60° from forward
    pub min_clearance: f32,        // 0.6m above ledge (room to stand)
}

pub struct LedgeInfo {
    pub edge_position: Vec3,       // world position of ledge edge
    pub surface_normal: Vec3,      // wall face normal (away from wall)
    pub ledge_normal: Vec3,        // top surface normal (usually Y-up)
}

impl ClimbDetector {
    pub fn detect_ledge(
        &self,
        character_pos: Vec3,
        character_forward: Vec3,
        physics: &PhysicsWorld,
    ) -> Option<LedgeInfo> {
        // 1. Forward raycast at chest height — find wall
        let chest_pos = character_pos + Vec3::new(0.0, self.wall_check_height, 0.0);
        let wall_hit = physics.raycast(
            chest_pos,
            character_forward,
            self.max_grab_distance,
            CollisionLayer::WORLD_STATIC | CollisionLayer::CLIMBABLE,
        )?;

        // Check angle — must be facing roughly toward wall
        let angle = wall_hit.normal.angle_between(-character_forward);
        if angle > self.max_grab_angle { return None; }

        // 2. Upward raycast from wall hit to find top of wall
        let above_wall = wall_hit.point + Vec3::new(0.0, 3.0, 0.0); // cast from well above
        let top_hit = physics.raycast(
            above_wall,
            Vec3::NEG_Y,
            3.5,
            CollisionLayer::WORLD_STATIC,
        )?;

        // Ledge must be above character head
        if top_hit.point.y < character_pos.y + 1.5 { return None; }

        // 3. Check clearance above ledge (can character stand there?)
        let ledge_pos = top_hit.point + Vec3::new(0.0, 0.01, 0.0);
        let clearance_blocked = physics.raycast(
            ledge_pos,
            Vec3::Y,
            self.min_clearance,
            CollisionLayer::WORLD_STATIC,
        ).is_some();

        if clearance_blocked { return None; }

        Some(LedgeInfo {
            edge_position: top_hit.point,
            surface_normal: wall_hit.normal,
            ledge_normal: top_hit.normal,
        })
    }
}

pub enum ClimbState {
    None,
    LedgeGrab {
        ledge: LedgeInfo,
        grab_timer: f32,        // time hanging
    },
    ClimbingUp {
        start_pos: Vec3,
        end_pos: Vec3,
        progress: f32,          // 0..1
        duration: f32,          // 0.5s
    },
}
```

**Acceptance Tests (H):**
```
[H1] Detect ledge at correct height (2m wall): grab triggers. ✓
[H2] No grab on angled surfaces (> 60° from facing). ✓
[H3] Climb up completes with character grounded on top. ✓
[H4] No grab when ceiling blocks clearance above ledge. ✓
```

---

# I) FRAME UPDATE ORDER

```
┌─────────────────────────────────────────┐
│           FRAME UPDATE ORDER            │
├────┬────────────────────────────────────┤
│  1 │ Input polling + AI decisions       │
│  2 │ Character controller movement      │
│    │  → compute desired velocity        │
│  3 │ NPC controllers movement           │
│    │  → compute desired velocity        │
│  4 │ Physics step (Rapier)              │
│    │  → sweep tests, resolve contacts   │
│    │  → apply final positions           │
│  5 │ Ground snap pass                   │
│    │  → all entities snapped to terrain │
│  6 │ Animation update                   │
│    │  → state machine transitions       │
│    │  → mixer update (bone poses)       │
│  7 │ Attachment update                  │
│    │  → weapons follow bone transforms  │
│    │  → IK pass (foot IK, hand IK)      │
│  8 │ Camera update                      │
│    │  → spring arm + collision          │
│  9 │ Render                             │
│    │  → opaque pass                     │
│    │  → water pass                      │
│    │  → transparent pass                │
│    │  → viewmodel pass (1P weapons)     │
│    │  → UI/HUD pass                     │
│ 10 │ Debug draw (if enabled)            │
│    │  → collider wireframes             │
│    │  → bone gizmos                     │
│    │  → socket markers                  │
│    │  → ground contact points           │
└────┴────────────────────────────────────┘
```

**Critical ordering rules:**
- Animation MUST run after position is finalized (step 5) — otherwise bones jitter
- Weapons MUST update after animation (step 7) — otherwise lag by one frame
- Camera MUST update after attachments (step 8) — otherwise camera follows stale position
- Render after everything (step 9)

---

# J) TOOLING + QA

## Automated Test Scenes

```rust
// engine/src/testing/test_scenes.rs

pub fn grounding_test(world: &mut World) {
    // Spawn 20 random assets on flat plane
    let library = world.asset_library();
    for i in 0..20 {
        let asset = library.random_asset();
        let x = (i % 5) as f32 * 3.0 - 6.0;
        let z = (i / 5) as f32 * 3.0 - 6.0;
        world.spawn_grounded(asset, Vec2::new(x, z));
    }

    // Validate: no entity more than 0.05m above ground
    for entity in world.entities_with::<AssetMetadata>() {
        let pos = world.position(entity);
        let expected_y = compute_grounded_position(
            Vec2::new(pos.x, pos.z),
            world.metadata(entity),
            world.terrain(),
        ).y;
        let error = (pos.y - expected_y).abs();
        assert!(error < 0.05, "Entity {:?} floating: error={:.3}m", entity, error);
    }
}

pub fn collision_tunnel_test(world: &mut World) {
    // Place character facing a wall, sprint into it for 10 seconds
    let wall_pos = Vec3::new(5.0, 0.0, 0.0);
    world.spawn_wall(wall_pos, Vec3::new(0.2, 3.0, 5.0));

    let player = world.spawn_player(Vec3::new(0.0, 0.0, 0.0));
    let input = InputState { move_direction: Vec2::X, sprint: true, ..Default::default() };

    for _ in 0..600 { // 10s at 60fps
        world.update_with_input(&input, 1.0 / 60.0);
        let pos = world.position(player);
        assert!(pos.x < wall_pos.x - 0.1,
            "Character penetrated wall! pos.x={:.3}, wall.x={:.3}", pos.x, wall_pos.x);
    }
}

pub fn weapon_socket_test(world: &mut World) {
    let weapons = ["iron_sword", "rifle", "dagger", "bow", "spear"];
    let characters = ["knight", "adventurer", "soldier", "casual", "swat"];

    for char_id in &characters {
        let entity = world.spawn_character(char_id, Vec3::ZERO);
        for weapon_id in &weapons {
            world.equip_weapon(entity, weapon_id, "hand_r");
            world.update(1.0 / 60.0); // one frame

            let weapon_pos = world.weapon_world_position(entity);
            let hand_pos = world.bone_world_position(entity, "hand_r");

            let distance = (weapon_pos - hand_pos).length();
            assert!(distance < 0.3,
                "Weapon {} on {}: distance from hand = {:.3}m (should be < 0.3)",
                weapon_id, char_id, distance);
        }
    }
}

pub fn stair_walk_test(world: &mut World) {
    // Build a 5-step staircase, each step 0.25m high, 0.3m deep
    for i in 0..5 {
        let step_pos = Vec3::new(0.0, i as f32 * 0.25, -(i as f32 * 0.3));
        world.spawn_box(step_pos, Vec3::new(2.0, 0.25, 0.3));
    }

    let player = world.spawn_player(Vec3::new(0.0, 0.0, 1.0));
    let input = InputState { move_direction: Vec2::new(0.0, -1.0), ..Default::default() };

    let mut max_y_delta = 0.0f32;
    let mut prev_y = 0.0f32;

    for frame in 0..300 { // 5s
        world.update_with_input(&input, 1.0 / 60.0);
        let pos = world.position(player);
        let delta = (pos.y - prev_y).abs();
        max_y_delta = max_y_delta.max(delta);
        prev_y = pos.y;

        // Should never bounce more than step_height per frame
        assert!(delta < 0.4,
            "Frame {}: Y delta {:.3} too large (bouncing on stairs)", frame, delta);
    }

    let final_pos = world.position(player);
    // Should have climbed ~1.25m (5 * 0.25)
    assert!(final_pos.y > 1.0, "Didn't climb stairs: final Y = {:.3}", final_pos.y);
}
```

## Runtime Assert / Logging

```rust
// engine/src/debug/asserts.rs

pub fn frame_validation(world: &World) {
    for entity in world.entities_with::<CharacterController>() {
        let ctrl = world.get::<CharacterController>(entity);
        let pos = ctrl.position;

        // Grounded but floating
        if ctrl.grounded && ctrl.ground_distance > 0.1 {
            log::warn!("[FLOAT] Entity {:?} grounded but {:.3}m above ground", entity, ctrl.ground_distance);
        }

        // Under terrain
        let terrain_y = world.terrain().height_at(pos.x, pos.z);
        if pos.y < terrain_y - 0.5 {
            log::error!("[BURIED] Entity {:?} is {:.3}m below terrain!", entity, terrain_y - pos.y);
        }

        // Moving too fast (possible physics explosion)
        let speed = ctrl.velocity.length();
        if speed > 100.0 {
            log::error!("[EXPLOSION] Entity {:?} velocity {:.1} m/s!", entity, speed);
        }

        // NaN position
        if !pos.is_finite() {
            log::error!("[NaN] Entity {:?} has NaN/Inf position!", entity);
        }
    }

    // Missing colliders on buildings
    for entity in world.entities_with::<Building>() {
        if !world.has::<Collider>(entity) {
            log::error!("[NO_COLLIDER] Building {:?} has no physics collider!", entity);
        }
    }
}
```

---

# IMPLEMENTATION PLAN

## Phase 1: Conventions + Import + Static Collisions + Character Controller
*Target: 2 weeks. Gets us to "walk around a solid world."*

```
Week 1:
  ├── Day 1-2: Transform spec, validator, golden cube test
  ├── Day 3-4: Asset importer (glTF → meshes + AABB + metadata)
  ├── Day 5: Grounding system (auto-ground on spawn)
  └── Day 6-7: Physics layers + static colliders for buildings

Week 2:
  ├── Day 1-3: Character controller (capsule, ground detect, step handling)
  ├── Day 4-5: Camera rigs (3P spring arm + 1P)
  ├── Day 6: Demo map (flat + stairs + doorway + corridor)
  └── Day 7: Acceptance tests A, B, C, D
```

## Phase 2: NPC Controller + Weapons Equip
*Target: 1.5 weeks. Gets us to "combat with NPCs holding weapons."*

```
Week 3:
  ├── Day 1-2: NPC controller (reuses character core + AI state machine)
  ├── Day 3-4: Animation state machine + bone retarget
  ├── Day 5: Weapon socket system (equip/draw/holster)
  └── Day 6-7: Acceptance tests E, G + weapon socket test across 5 skeletons

Week 4 (half):
  ├── Day 1-2: NPC combat (attack range, cooldown, damage)
  └── Day 3: Polish + bug fixes from automated tests
```

## Phase 3: Climbing + Water + IK
*Target: 1.5 weeks. Gets us to "full traversal."*

```
Week 4 (second half):
  ├── Day 4-5: Water volumes (wade/swim transition)

Week 5:
  ├── Day 1-3: Climbing system (ledge detect, grab, climb-up)
  ├── Day 4-5: Foot IK (optional but huge visual improvement)
  └── Day 6-7: Full regression test suite, final acceptance
```

---

# COMMON FAILURE MODES + DETECTION

| Failure | Cause | Detection |
|---------|-------|-----------|
| Character floating | Ground snap distance too small, or terrain raycast misses | Log: `[FLOAT]` warning when grounded + distance > 0.1 |
| Walking through walls | Missing collider, or tunneling at high speed | `collision_tunnel_test`, log `[NO_COLLIDER]` |
| NPC "swimming" on ground | Root motion applied without ground projection, or wrong animation | Visual: check if hips are oscillating vertically. Log: Y velocity oscillation |
| Weapon in wrong place | Wrong bone name, or non-uniform bone scale not compensated | `weapon_socket_test`. Debug: bone gizmos |
| Model laying flat | Z-up model loaded without axis fix | Importer auto-detect: if height < width, warn + apply rotation |
| Jittery weapon | Attachment updated before animation | Frame order: attachment at step 7, after animation at step 6 |
| Camera clip through wall | Spring arm collision sphere too small, or no collision test | 3P camera collision test. Min distance clamp = 0.5m |
| Character snagging on doorframes | Capsule radius too large for narrow openings | Doorway test. Tune radius vs opening width. |
| Stair bouncing | Step height too small, or no step-up logic | `stair_walk_test`. Max Y-delta per frame assert. |
| Physics explosion | NaN propagation, or extreme forces | Speed > 100 m/s assert. NaN position assert. |

---

*This document is the single source of truth. Every subsystem references back to the conventions in Section A. No exceptions.*
