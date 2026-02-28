# COMBAT SYSTEM RESEARCH — Unreal Engine, Unity, & AAA Game Standards
*Deep analysis for Crate Engine implementation*

---

## 1. WEAPON SYSTEM ARCHITECTURE (How Unreal/Unity Do It)

### Unreal Engine: Socket-Based Weapon Attachment
- **Skeletal Mesh Sockets**: Named attachment points on character skeleton bones
  - `hand_r_socket` — right hand (weapon hold position)
  - `back_socket` — back holster (weapon stored)
  - `hip_socket` — holster for pistols
  - `head_socket` — helmets/hats
- **AttachActorToComponent**: Dynamically moves weapon actor between sockets
- **Equip flow**: Spawn weapon actor → attach to `back_socket` → on equip, detach → attach to `hand_r_socket`
- **Unequip flow**: Detach from hand → reattach to back/holster socket OR destroy + add to inventory data

### Unity: Transform Parenting
- Parent weapon GameObject to hand bone Transform
- `weapon.transform.SetParent(handBone)`
- Offset position/rotation per weapon type
- Weapon prefab stores: mesh, fire point, muzzle flash position, stats

### **What We Need in Crate Engine (Three.js equivalent)**:
```
Bone attachment: model.traverse() to find bones → bone.add(weaponMesh)
Socket names: "RightHand", "RightForeArm", "Spine" (for back holster)
Equip: remove from holster bone → add to hand bone
Unequip: remove from hand bone → add to holster bone OR destroy + inventory
```

---

## 2. WEAPON DATA ARCHITECTURE

### ScriptableObject Pattern (Unity) / DataAsset (Unreal)
Every weapon is defined by a data object, NOT hardcoded:

```javascript
const WEAPON_DATABASE = {
  sword: {
    type: 'melee', subtype: 'one_handed',
    damage: 25, attackSpeed: 1.2, range: 2.5,
    staminaCost: 15, knockback: 3,
    comboChain: ['slash_r', 'slash_l', 'thrust', 'heavy_slash'],
    critMultiplier: 1.5, critChance: 0.1,
    blockDamageReduction: 0.5,
    mesh: { blade: {w:0.05, h:0.6, d:0.02}, hilt: {w:0.08, h:0.12, d:0.04} },
    sounds: { swing: 'sword_swing', hit: 'sword_hit', block: 'metal_clang' },
    animations: { idle: 'sword_idle', attack1: 'slash_r', attack2: 'slash_l', block: 'block' }
  },
  rifle: {
    type: 'ranged', subtype: 'automatic',
    damage: 12, fireRate: 600, // rounds per minute
    range: 100, spread: 2, // degrees
    recoilVertical: 1.5, recoilHorizontal: 0.3,
    recoilRecovery: 5, // degrees per second recovery
    magSize: 30, reloadTime: 2.5, // seconds
    bulletSpeed: 200, // m/s (for projectile) or Infinity (hitscan)
    headshotMultiplier: 2.5,
    adsZoom: 1.5, // aim down sights FOV multiplier
    adsSpeed: 0.15, // seconds to ADS
    mesh: { barrel: {...}, stock: {...}, scope: null },
    muzzleFlash: { size: 0.3, duration: 0.05, color: 0xffaa00 },
    tracerConfig: { color: 0xffdd00, width: 0.01, speed: 300, length: 2 }
  }
}
```

### Weapon Categories (Industry Standard):
| Category | Examples | Key Stats |
|----------|----------|-----------|
| **Melee 1H** | Sword, Axe, Dagger, Mace | Damage, Speed, Combo, Stamina |
| **Melee 2H** | Greatsword, Hammer, Spear | High damage, Slow, Wide arc |
| **Pistol** | 9mm, Revolver, Deagle | Low recoil, Fast draw, Medium damage |
| **SMG** | Uzi, MP5, P90 | High fire rate, Low damage, High spread |
| **Rifle** | AK, M4, SCAR | Medium everything, Versatile |
| **Shotgun** | Pump, Auto, Double | Multi-pellet, High close damage, Wide spread |
| **Sniper** | Bolt action, Semi-auto | High damage, Slow fire, Scope, Low spread |
| **Bow** | Longbow, Crossbow | Charge mechanic, Arc trajectory, Silent |
| **Staff/Magic** | Fire staff, Ice wand | Mana cost, AoE, Elemental damage |

---

## 3. FPS/TPS SHOOTING MECHANICS

### Hitscan vs Projectile (THE fundamental choice)
- **Hitscan**: Instant raycast from muzzle to target. Used by: CS:GO, Valorant, Overwatch (most weapons)
  - `THREE.Raycaster` from camera center (FPS) or character aim point (TPS)
  - Apply spread: random offset within cone angle
  - Check: distance, obstacles, target health
- **Projectile**: Physical bullet object travels over time. Used by: Fortnite, Battlefield
  - Spawn bullet mesh at muzzle → velocity toward target → check collision each frame
  - Bullet drop (gravity), travel time, leading targets
  - More expensive but more tactical

### Spread Pattern (How recoil works)
```
First bullet:  perfectly accurate (or near)
Sustained fire: spread increases per shot
                 ↑ vertical recoil (dominant)
                 ← → horizontal recoil (random)
Recovery:       when not firing, spread decreases back to 0

Implementation:
  spreadAngle += recoilPerShot
  spreadAngle = min(spreadAngle, maxSpread)
  if (!firing) spreadAngle = max(0, spreadAngle - recovery * dt)
  
  bulletDir = aimDir + randomInCone(spreadAngle)
```

### ADS (Aim Down Sights)
- FOV zooms from 60° → 45° (or weapon-specific)
- Spread reduced by 50-70%
- Movement speed reduced by 30-50%
- Crosshair changes to scope overlay (snipers)
- Camera smoothly transitions (0.15-0.25s lerp)

### Recoil Visual
- Camera kicks UP per shot (vertical recoil)
- Small random LEFT/RIGHT per shot (horizontal recoil)
- Recovery: camera slowly returns to pre-recoil position
- Weapon model kicks back and recovers (procedural animation)

### TPS (Third Person) Specific
- Crosshair at screen center, raycast from CAMERA not character
- **Over-the-shoulder aim**: camera shifts left/right for ADS
- Character model rotates upper body toward aim point (IK/rotation blend)
- **Camera offset**: slight right offset (Gears of War style) or centered

---

## 4. MELEE COMBAT (Soulslike / Action Game Style)

### Combo System (Dark Souls / Elden Ring / God of War)
```
Light Attack (E):  Fast, low damage, chains into combos
Heavy Attack (Q):  Slow wind-up, high damage, staggers
Combo chain:       E → E → E → different finisher each time
Mixed combo:       E → E → Q → special finisher
```

### Combat States (Animation State Machine)
```
IDLE → (press attack) → WINDUP → ACTIVE → RECOVERY → IDLE
                                    ↓
                              HIT DETECTED → apply damage
                                    
States:
  WINDUP:   0.1-0.3s, can cancel into dodge
  ACTIVE:   0.1-0.2s, hitbox active, damage on contact
  RECOVERY: 0.2-0.5s, vulnerable, can't attack or dodge
  
Dodge/Roll:
  IDLE → (press dodge) → DODGE_START → I-FRAMES → DODGE_END → IDLE
  I-FRAMES: 0.15-0.3s of invincibility during roll
```

### Hitbox System
- **Weapon hitbox**: Invisible box/sphere attached to weapon mesh
- During ACTIVE frame: check weapon hitbox vs enemy collider
- Each swing can only hit each enemy ONCE (prevent multi-hit per swing)
- **Directional attacks**: forward thrust, left/right slash, overhead

### Parry / Block
- **Block**: Hold button, reduce incoming damage by weapon's block %
- **Parry**: Precise timing (0.1-0.2s window), deflects attack, staggers attacker
- **Perfect dodge**: Dodge within 0.15s of attack hitting → slow-mo counter window (Bayonetta/Witch Time)

### Stagger / Poise
- Each hit adds to target's stagger meter
- When full: target enters STAGGER state (can't act for 1-2s)
- Heavy weapons build stagger faster
- Bosses have high poise (resist stagger)

---

## 5. EQUIP/UNEQUIP/SWAP SYSTEM

### Inventory → Equipment Flow (Industry Standard)
```
INVENTORY GRID (Tab/I to open)
  ┌──────────────────────────┐
  │ [Head] [Chest] [Legs]    │  ← Equipment Slots
  │ [Weapon1] [Weapon2]      │  ← Weapon Slots (1/2 key to swap)
  │ [Shield] [Accessory]     │
  ├──────────────────────────┤
  │ □ □ □ □ □ □ □ □          │  ← Inventory Grid
  │ □ □ □ □ □ □ □ □          │
  │ □ □ □ □ □ □ □ □          │
  │ □ □ □ □ □ □ □ □          │
  └──────────────────────────┘

Actions:
  Click item in grid → options: Equip / Drop / Use / Inspect
  Drag to equipment slot → equip (swap if slot occupied)
  Right-click → quick equip
  1/2/3 keys → weapon quick-swap
  G key → drop equipped weapon on ground
```

### Weapon Swap Animation
1. Current weapon: play "unequip" anim (0.3s) — hand moves to holster
2. Brief pause (0.1s)
3. New weapon: play "equip" anim (0.3s) — hand reaches to holster, brings weapon up
4. Ready — can fire/attack

### Hot Swap (Number Keys)
- **1**: Primary weapon (rifle/sword)
- **2**: Secondary (pistol/dagger)
- **3**: Melee (if carrying ranged)
- **4**: Throwable/special (grenade, magic)
- Swap time: 0.3-0.8s depending on weapon weight

---

## 6. DAMAGE SYSTEM

### Damage Calculation (Industry Standard)
```
finalDamage = baseDamage 
  * weaponMultiplier
  * critMultiplier (if crit)
  * headshotMultiplier (if headshot)
  * elementalMultiplier (fire vs ice etc)
  * (1 - armorReduction)
  * distanceFalloff (ranged only)
  * randomVariance (0.9 - 1.1)
```

### Damage Types
- **Physical**: Reduced by armor
- **Fire**: DoT (damage over time), ignite effect
- **Ice**: Slow effect, freeze at threshold
- **Lightning**: Chain to nearby enemies, stun
- **Poison**: DoT, reduce healing
- **Holy**: Extra vs undead
- **Dark**: Lifesteal %

### Hit Feedback (CRITICAL for game feel)
1. **Screen shake**: Small camera shake on hit (0.1s, 2-5px)
2. **Hit marker**: White X at crosshair for 0.1s
3. **Damage numbers**: Float up from target (white normal, gold crit, red player damage)
4. **Blood/sparks**: Particle effect at hit point
5. **Sound**: Distinct hit sound per material (flesh, metal, wood)
6. **Hitstop**: 0.03-0.05s pause on melee hit (game freeze frame, HUGE for impact feel)
7. **Vignette**: Red screen edges when taking damage
8. **Knockback**: Push target in hit direction

---

## 7. NPC AI COMBAT BEHAVIOR

### State Machine
```
IDLE → PATROL → ALERT → CHASE → ATTACK → FLEE → DEAD

PATROL: Walk waypoints, look around
ALERT:  Heard/saw something, investigate
CHASE:  Player spotted, run toward at 1.5x speed
ATTACK: In range, execute attack pattern
FLEE:   Health < 20%, run away, find cover
DEAD:   Ragdoll, drop loot
```

### Attack Patterns (per NPC type)
- **Melee grunt**: Run in → swing → back up → repeat
- **Ranged soldier**: Find cover → peek → shoot 2-3 rounds → duck → repeat
- **Berserker**: Sprint → leap attack → wild swings → short pause
- **Sniper**: Stay far → aim (laser sight visible) → shoot → relocate
- **Boss**: Phase-based (health thresholds trigger new moves)

### Aggro System
- **Threat table**: Each player action generates "threat"
- Attacking = high threat, healing = medium, standing = low
- NPC targets highest threat player
- **Leash range**: If player runs too far, NPC returns to home position

---

## 8. WHAT CRATE ENGINE NEEDS (Priority Implementation)

### Phase 1 — WEAPON EQUIP SYSTEM (Immediate)
- [ ] Weapon database (WEAPON_DATABASE object with all stats)
- [ ] Bone-based socket system (hand_r, hand_l, back, hip)
- [ ] Equip/unequip with bone swap animation
- [ ] Number keys (1,2,3) for weapon quick-swap
- [ ] Weapon pickup from ground (walk over + F)
- [ ] Visual weapon on character model

### Phase 2 — SHOOTING MECHANICS
- [ ] Hitscan raycast from camera center
- [ ] Spread cone (increases with sustained fire)
- [ ] Recoil (camera kick up, weapon model kick)
- [ ] ADS zoom (right-click hold)
- [ ] Bullet tracers (thin line from muzzle to hit point)
- [ ] Muzzle flash (point light + sprite, 0.05s)
- [ ] Shell casings (tiny particle, optional)
- [ ] Reload animation + timing

### Phase 3 — MELEE COMBAT
- [ ] Combo chains (E,E,E → different finisher)
- [ ] Heavy attack wind-up (Q hold → release)
- [ ] Hitbox on weapon during ACTIVE frames only
- [ ] Hitstop (freeze frame 0.03s on hit)
- [ ] Dodge i-frames (invincible during roll middle)
- [ ] Parry window (precise block timing → counter)
- [ ] Stagger meter

### Phase 4 — GAME FEEL
- [ ] Screen shake on hit/explosion
- [ ] Hit markers (white X)
- [ ] Damage numbers with physics (float up, fade)
- [ ] Red vignette when taking damage
- [ ] Low health heartbeat sound + visual
- [ ] Kill feed (top right, scrolling)
- [ ] XP popup on kill

---

## 9. THREE.JS SPECIFIC IMPLEMENTATION NOTES

### Bone Finding (Our skeleton structure)
```javascript
// GLB models use Mixamo bone names:
// "mixamorigRightHand", "mixamorigRightForeArm", "mixamorigSpine2"
// Or simplified: "RightHand", "RightForeArm", "Spine"
model.traverse(bone => {
  if (bone.isBone) {
    const n = bone.name.toLowerCase();
    if (n.includes('righthand') && !n.includes('thumb')) sockets.hand_r = bone;
    if (n.includes('lefthand') && !n.includes('thumb')) sockets.hand_l = bone;
    if (n.includes('spine') && !n.includes('1')) sockets.back = bone;
    if (n.includes('righthip') || n.includes('rightupleg')) sockets.hip_r = bone;
  }
});
```

### Raycasting for Shooting
```javascript
// TPS: raycast from camera through crosshair
const raycaster = new THREE.Raycaster();
raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

// Apply spread
const spreadRad = spreadAngle * Math.PI / 180;
const dir = raycaster.ray.direction.clone();
dir.x += (Math.random() - 0.5) * spreadRad;
dir.y += (Math.random() - 0.5) * spreadRad;
raycaster.ray.direction.copy(dir.normalize());

// Check hits (NPCs only, not terrain for bullets)
const hits = raycaster.intersectObjects(npcMeshes, true);
```

### Performance Considerations
- Max 10 bullet tracers active at once (pool and reuse)
- Muzzle flash: reuse single PointLight, just move it
- Damage numbers: DOM elements, not 3D (cheaper)
- NPC AI: update every 2-3 frames, not every frame
- Hitbox checks: only during ACTIVE animation frames

---

## REFERENCES
- Epic Games: "Implementing Weapon Systems" (dev.epicgames.com)
- mohsenheydari/three-fps (GitHub) — Three.js FPS with ammo.js
- iErcann/enari-engine (GitHub) — Three.js FPS playground
- LlamAcademy: "Shooting, Spread, and Bullet Trails" (Unity tutorial)
- three.js discourse: "Game AI: Basic Deathmatch Shooter"
- Unreal Art of Combat: Melee combat system architecture
- SimonDev: Three.js character controller patterns
