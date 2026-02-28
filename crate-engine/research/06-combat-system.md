# 06 — Combat System: Shooting, Melee, Hit Detection, Damage

> Building combat that feels responsive and fair

---

## Architecture Overview

```
Combat System
├── Weapon System (already have basics)
├── Hit Detection
│   ├── Raycasting (guns)
│   ├── Hitbox/Hurtbox (melee)
│   └── Projectile Physics (arrows, grenades)
├── Damage System
│   ├── Health/Shields
│   ├── Damage types
│   └── Resistances
├── Combat Feedback
│   ├── Hit markers
│   ├── Screen shake
│   ├── Blood/particles
│   └── Sound
└── AI Combat (NPCs fighting)
```

---

## Hit Detection

### Raycasting (Hitscan Weapons — Pistols, Rifles)

```javascript
function fireHitscan(origin, direction, weapon, shooter) {
    const raycaster = new THREE.Raycaster(origin, direction, 0, weapon.range);
    
    // Get all intersections, sorted by distance
    const hits = raycaster.intersectObjects(combatTargets, true);
    
    for (const hit of hits) {
        // Skip self
        if (hit.object.userData.owner === shooter) continue;
        
        // Check what we hit
        const target = getEntity(hit.object);
        if (!target) continue;
        
        // Determine hit zone
        const hitZone = getHitZone(hit.point, target);
        
        // Calculate damage
        const damage = calculateDamage(weapon, hitZone, hit.distance);
        
        // Apply
        applyDamage(target, damage, shooter);
        
        // Visual feedback
        spawnHitEffect(hit.point, hit.face.normal, hitZone);
        
        // Only hit first target (no penetration)
        break;
    }
    
    // Muzzle flash
    spawnMuzzleFlash(origin, direction);
    
    // Tracer
    if (weapon.hasTracer) {
        spawnTracer(origin, hits[0]?.point || origin.clone().add(direction.clone().multiplyScalar(weapon.range)));
    }
}
```

### Hitbox System (Melee + Precision)

```javascript
// Each character has hitboxes attached to bones
class HitboxSystem {
    constructor(character) {
        this.hitboxes = {
            head: { bone: 'Head', size: [0.2, 0.25, 0.2], multiplier: 2.0 },
            torso: { bone: 'Spine2', size: [0.4, 0.5, 0.25], multiplier: 1.0 },
            leftArm: { bone: 'LeftArm', size: [0.12, 0.4, 0.12], multiplier: 0.75 },
            rightArm: { bone: 'RightArm', size: [0.12, 0.4, 0.12], multiplier: 0.75 },
            leftLeg: { bone: 'LeftUpLeg', size: [0.15, 0.5, 0.15], multiplier: 0.8 },
            rightLeg: { bone: 'RightUpLeg', size: [0.15, 0.5, 0.15], multiplier: 0.8 },
        };
        
        // Create invisible box meshes for each
        this.boxes = {};
        for (const [zone, config] of Object.entries(this.hitboxes)) {
            const geo = new THREE.BoxGeometry(...config.size);
            const mat = new THREE.MeshBasicMaterial({ visible: false });
            const box = new THREE.Mesh(geo, mat);
            box.userData.hitZone = zone;
            box.userData.multiplier = config.multiplier;
            
            // Attach to bone
            const bone = character.skeleton.getBoneByName(config.bone);
            if (bone) bone.add(box);
            this.boxes[zone] = box;
        }
    }
    
    // Show hitboxes for debugging
    setDebugVisible(visible) {
        for (const box of Object.values(this.boxes)) {
            box.material.visible = visible;
            box.material.wireframe = true;
            box.material.color.set(0xff0000);
        }
    }
}
```

### Melee Hit Detection (Hurtbox / Active Frames)

```javascript
class MeleeAttack {
    constructor(weapon, character) {
        this.weapon = weapon;
        this.character = character;
        this.activeFrames = weapon.activeFrames; // e.g., { start: 0.2, end: 0.5 }
        this.hitEntities = new Set(); // prevent multi-hit per swing
        
        // Hurtbox — the area the weapon sweeps through
        this.hurtbox = new THREE.Box3();
    }
    
    update(animationProgress, targets) {
        const t = animationProgress; // 0 to 1
        
        // Only check during active frames
        if (t < this.activeFrames.start || t > this.activeFrames.end) return;
        
        // Update hurtbox position based on weapon bone
        const weaponWorldPos = new THREE.Vector3();
        this.weapon.mesh.getWorldPosition(weaponWorldPos);
        
        this.hurtbox.setFromCenterAndSize(
            weaponWorldPos,
            new THREE.Vector3(this.weapon.reach, this.weapon.reach, this.weapon.reach)
        );
        
        // Check against targets
        for (const target of targets) {
            if (this.hitEntities.has(target.id)) continue;
            
            const targetBox = new THREE.Box3().setFromObject(target.mesh);
            
            if (this.hurtbox.intersectsBox(targetBox)) {
                this.hitEntities.add(target.id);
                
                // Determine exact hit zone with raycast
                const dir = new THREE.Vector3().subVectors(
                    target.mesh.position, this.character.position
                ).normalize();
                
                applyDamage(target, this.weapon.damage, this.character);
                spawnHitEffect(weaponWorldPos, dir.negate());
                
                // Hitstop (freeze frames — AAA juice)
                applyHitstop(0.05); // 50ms freeze
            }
        }
    }
}
```

---

## Projectile System (Arrows, Grenades, Rockets)

```javascript
class Projectile {
    constructor(config) {
        this.mesh = createProjectileMesh(config.type);
        this.velocity = config.direction.clone().multiplyScalar(config.speed);
        this.gravity = config.affectedByGravity ? 9.81 : 0;
        this.damage = config.damage;
        this.shooter = config.shooter;
        this.lifetime = config.lifetime || 5;
        this.age = 0;
        this.type = config.type;
    }
    
    update(dt, targets, terrain) {
        this.age += dt;
        if (this.age > this.lifetime) return 'expired';
        
        // Gravity
        this.velocity.y -= this.gravity * dt;
        
        // Move
        const prevPos = this.mesh.position.clone();
        this.mesh.position.add(this.velocity.clone().multiplyScalar(dt));
        
        // Face direction of travel
        this.mesh.lookAt(this.mesh.position.clone().add(this.velocity));
        
        // Collision check (raycast from prev to current position)
        const moveDir = new THREE.Vector3().subVectors(this.mesh.position, prevPos);
        const ray = new THREE.Raycaster(prevPos, moveDir.normalize(), 0, moveDir.length());
        
        // Check terrain
        const terrainHit = ray.intersectObject(terrain);
        if (terrainHit.length > 0) {
            this.mesh.position.copy(terrainHit[0].point);
            if (this.type === 'grenade') {
                this.explode(targets);
            }
            return 'hit_terrain';
        }
        
        // Check targets
        for (const target of targets) {
            if (target === this.shooter) continue;
            const targetHit = ray.intersectObject(target.mesh, true);
            if (targetHit.length > 0) {
                applyDamage(target, this.damage, this.shooter);
                spawnHitEffect(targetHit[0].point, targetHit[0].face.normal);
                return 'hit_target';
            }
        }
        
        return 'alive';
    }
    
    explode(targets) {
        const radius = 5;
        const maxDamage = this.damage;
        
        for (const target of targets) {
            const dist = target.mesh.position.distanceTo(this.mesh.position);
            if (dist < radius) {
                const falloff = 1 - (dist / radius);
                applyDamage(target, maxDamage * falloff, this.shooter);
                
                // Knockback
                const dir = new THREE.Vector3().subVectors(
                    target.mesh.position, this.mesh.position
                ).normalize();
                target.velocity.add(dir.multiplyScalar(falloff * 15));
            }
        }
        
        // Explosion VFX
        spawnExplosion(this.mesh.position, radius);
    }
}
```

---

## Damage System

```javascript
class HealthSystem {
    constructor(config) {
        this.maxHealth = config.maxHealth || 100;
        this.health = this.maxHealth;
        this.maxShield = config.maxShield || 0;
        this.shield = this.maxShield;
        this.armor = config.armor || 0; // flat damage reduction
        this.isDead = false;
        
        // Regen
        this.healthRegen = config.healthRegen || 0; // per second
        this.shieldRegen = config.shieldRegen || 5;
        this.shieldRegenDelay = 3; // seconds after last damage
        this.lastDamageTime = 0;
    }
    
    takeDamage(amount, type, source) {
        let damage = amount;
        
        // Armor reduction
        damage = Math.max(1, damage - this.armor);
        
        // Type multipliers
        if (type === 'fire' && this.resistances?.fire) {
            damage *= (1 - this.resistances.fire);
        }
        
        // Shield absorbs first
        if (this.shield > 0) {
            const shieldDamage = Math.min(this.shield, damage);
            this.shield -= shieldDamage;
            damage -= shieldDamage;
        }
        
        // Health damage
        this.health -= damage;
        this.lastDamageTime = performance.now() / 1000;
        
        // Emit events
        this.onDamage?.(damage, type, source);
        
        if (this.health <= 0) {
            this.health = 0;
            this.isDead = true;
            this.onDeath?.(source);
        }
        
        return damage;
    }
    
    update(dt) {
        const now = performance.now() / 1000;
        
        // Shield regen after delay
        if (this.shield < this.maxShield && 
            now - this.lastDamageTime > this.shieldRegenDelay) {
            this.shield = Math.min(this.maxShield, this.shield + this.shieldRegen * dt);
        }
        
        // Health regen
        if (this.healthRegen > 0 && this.health < this.maxHealth) {
            this.health = Math.min(this.maxHealth, this.health + this.healthRegen * dt);
        }
    }
}
```

---

## Combat Feedback (The "Juice")

### Hit Markers

```javascript
function showHitMarker(isHeadshot) {
    const marker = document.getElementById('hit-marker');
    marker.style.opacity = '1';
    marker.style.color = isHeadshot ? '#ff4444' : '#ffffff';
    marker.style.transform = isHeadshot ? 'scale(1.5)' : 'scale(1)';
    
    setTimeout(() => { marker.style.opacity = '0'; }, 150);
}
```

### Screen Shake

```javascript
class ScreenShake {
    constructor(camera) {
        this.camera = camera;
        this.offset = new THREE.Vector3();
        this.intensity = 0;
        this.decay = 5;
    }
    
    shake(intensity = 0.3, duration = 0.2) {
        this.intensity = intensity;
        this.duration = duration;
        this.timer = 0;
    }
    
    update(dt) {
        if (this.intensity > 0.001) {
            this.timer += dt;
            const progress = this.timer / this.duration;
            const currentIntensity = this.intensity * (1 - progress);
            
            this.offset.set(
                (Math.random() - 0.5) * currentIntensity,
                (Math.random() - 0.5) * currentIntensity,
                0
            );
            
            this.camera.position.add(this.offset);
            
            if (progress >= 1) this.intensity = 0;
        }
    }
}
```

### Hitstop (Freeze Frames)

```javascript
// When landing a melee hit, freeze the game for a few ms
// This is what makes Dark Souls combat feel HEAVY
let hitstopTimer = 0;

function applyHitstop(duration = 0.05) {
    hitstopTimer = duration;
}

function gameLoop(timestamp) {
    const dt = clock.getDelta();
    
    if (hitstopTimer > 0) {
        hitstopTimer -= dt;
        // Don't update game logic — everything freezes
        renderer.render(scene, camera); // still render
        requestAnimationFrame(gameLoop);
        return;
    }
    
    // Normal update
    updateGame(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(gameLoop);
}
```

### Damage Numbers

```javascript
class DamageNumber {
    constructor(position, amount, isHeadshot) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        ctx.font = isHeadshot ? 'bold 48px Arial' : '36px Arial';
        ctx.fillStyle = isHeadshot ? '#ff4444' : '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeText(amount.toString(), 20, 48);
        ctx.fillText(amount.toString(), 20, 48);
        
        const texture = new THREE.CanvasTexture(canvas);
        const sprite = new THREE.Sprite(
            new THREE.SpriteMaterial({ map: texture, transparent: true })
        );
        sprite.position.copy(position);
        sprite.position.y += 1;
        sprite.scale.set(1, 0.5, 1);
        
        this.sprite = sprite;
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            3,
            (Math.random() - 0.5) * 2
        );
        this.lifetime = 1.0;
        this.age = 0;
    }
    
    update(dt) {
        this.age += dt;
        this.velocity.y -= 5 * dt; // gravity on the number
        this.sprite.position.add(this.velocity.clone().multiplyScalar(dt));
        this.sprite.material.opacity = 1 - (this.age / this.lifetime);
        return this.age < this.lifetime;
    }
}
```

---

## Combo System (Soulslike — important for Crate Engine!)

```javascript
class ComboSystem {
    constructor() {
        this.comboWindow = 0.8; // seconds to input next attack
        this.comboTimer = 0;
        this.comboIndex = 0;
        this.maxCombo = 3; // light-light-heavy
        this.isAttacking = false;
        
        this.combos = {
            // [light, light, heavy] = special finisher
            'LLH': { damage: 2.5, animation: 'combo_finisher_overhead' },
            'LLL': { damage: 1.5, animation: 'combo_3_slash' },
            'HH': { damage: 3.0, animation: 'combo_heavy_slam' },
        };
        this.inputBuffer = [];
    }
    
    attack(type) { // 'light' or 'heavy'
        if (this.isAttacking && this.comboTimer > 0) {
            // Buffer next attack
            this.inputBuffer.push(type);
        } else {
            this.executeAttack(type);
        }
    }
    
    executeAttack(type) {
        this.isAttacking = true;
        this.inputBuffer = [];
        this.comboIndex++;
        
        const key = this.getComboKey();
        const combo = this.combos[key];
        
        if (combo) {
            // Special combo move!
            playAnimation(combo.animation);
            this.pendingDamage = combo.damage;
        } else {
            // Normal attack
            playAnimation(type === 'light' ? 'attack_light' : 'attack_heavy');
            this.pendingDamage = type === 'light' ? 1.0 : 2.0;
        }
    }
    
    onAttackAnimComplete() {
        this.isAttacking = false;
        this.comboTimer = this.comboWindow;
        
        if (this.inputBuffer.length > 0) {
            this.executeAttack(this.inputBuffer.shift());
        }
    }
    
    update(dt) {
        if (this.comboTimer > 0) {
            this.comboTimer -= dt;
            if (this.comboTimer <= 0) {
                // Combo window expired — reset
                this.comboIndex = 0;
                this.inputBuffer = [];
            }
        }
    }
}
```

---

## Lock-On System (Soulslike)

```javascript
class LockOnSystem {
    constructor(camera, player) {
        this.camera = camera;
        this.player = player;
        this.target = null;
        this.maxRange = 20;
        this.isLocked = false;
    }
    
    toggle() {
        if (this.isLocked) {
            this.unlock();
        } else {
            this.lockNearest();
        }
    }
    
    lockNearest() {
        const enemies = getEnemiesInRange(this.player.position, this.maxRange);
        
        // Find enemy closest to screen center
        let bestTarget = null;
        let bestScore = Infinity;
        
        for (const enemy of enemies) {
            const screenPos = enemy.position.clone().project(this.camera);
            const distFromCenter = Math.sqrt(screenPos.x ** 2 + screenPos.y ** 2);
            
            if (distFromCenter < bestScore) {
                bestScore = distFromCenter;
                bestTarget = enemy;
            }
        }
        
        if (bestTarget) {
            this.target = bestTarget;
            this.isLocked = true;
            showLockOnIndicator(bestTarget);
        }
    }
    
    update(dt) {
        if (!this.isLocked || !this.target) return;
        
        // Check if target still valid
        if (this.target.isDead || 
            this.player.position.distanceTo(this.target.position) > this.maxRange) {
            this.unlock();
            return;
        }
        
        // Rotate player to face target
        const dir = new THREE.Vector3().subVectors(
            this.target.position, this.player.position
        );
        dir.y = 0;
        const targetAngle = Math.atan2(dir.x, dir.z);
        this.player.rotation.y = THREE.MathUtils.lerp(
            this.player.rotation.y, targetAngle, 10 * dt
        );
        
        // Camera orbits around target/player midpoint
        const midpoint = this.player.position.clone()
            .add(this.target.position).multiplyScalar(0.5);
        // ... camera positioning
    }
}
```

---

## Implementation Plan for Crate Engine

### Already Have
- Weapon database (12 weapons)
- Bone socket system
- Equip/swap mechanics
- GLB weapon models

### Need to Build
1. **Hit detection** — raycasting for guns, hurtboxes for melee
2. **Health system** — HP bar, damage, death
3. **Combat feedback** — hit markers, screen shake, damage numbers
4. **Combo system** — light/heavy chains (soulslike feel)
5. **Lock-on** — target lock for melee combat
6. **Enemy AI combat** — NPCs that fight back (see doc 08)
7. **Blocking/parrying** — shield/weapon block, timed parry

### Soulslike Priority
Since this is a soulslike game engine, prioritize:
- **Stamina system** (attacks/rolls/blocks cost stamina)
- **I-frames on dodge roll**
- **Hitstop on melee hits**
- **Poise/stagger** (heavy hits stagger enemies)
- **Lock-on camera**

---

*Next: 07-camera-system.md — 3rd person, 1st person, smooth transitions*
