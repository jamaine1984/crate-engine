import * as THREE from 'three';
// ═══════════════════════════════════════════════════════════════
// CRATE ENGINE — GODMODE RUNTIME v1
// Dynamic behavior creation & code injection — no API keys needed
// ═══════════════════════════════════════════════════════════════
// 
// This system lets the AI agent create ANY behavior by composing
// from a library of primitives + runtime code injection into the
// Three.js render loop. Users describe what they want, the agent
// generates a behavior, and it runs live.
//
// Architecture:
//   1. PRIMITIVES — atomic Three.js operations (spawn, move, color, etc.)
//   2. BEHAVIORS — composable update functions injected into render loop
//   3. NLP INTENT PARSER — maps freeform text to primitives + behaviors
//   4. EFFECT LIBRARY — pre-built visual effects composable on anything
//
// ═══════════════════════════════════════════════════════════════



// Active behaviors running each frame
const _activeBehaviors = new Map(); // id → { fn, target, name, paused }
let _behaviorId = 0;
let _dt = 0;
let _elapsed = 0;

// ═══════════════════════════════════════════
// CORE: Behavior Registry
// ═══════════════════════════════════════════

export function registerBehavior(name, updateFn, target = null) {
  const id = ++_behaviorId;
  _activeBehaviors.set(id, { fn: updateFn, target, name, paused: false, id });
  return id;
}

export function removeBehavior(id) {
  _activeBehaviors.delete(id);
}

export function removeAllBehaviors() {
  _activeBehaviors.clear();
}

export function pauseBehavior(id) {
  const b = _activeBehaviors.get(id);
  if (b) b.paused = true;
}

export function resumeBehavior(id) {
  const b = _activeBehaviors.get(id);
  if (b) b.paused = false;
}

export function listBehaviors() {
  return [..._activeBehaviors.values()].map(b => ({
    id: b.id, name: b.name, paused: b.paused,
    target: b.target?.name || b.target?.userData?.alias || null
  }));
}

// Called every frame from engine's animate() loop
export function updateBehaviors(dt, elapsed) {
  _dt = dt;
  _elapsed = elapsed;
  for (const [id, b] of _activeBehaviors) {
    if (b.paused) continue;
    try {
      const result = b.fn(dt, elapsed, b.target);
      if (result === false) _activeBehaviors.delete(id); // self-removing
    } catch (e) {
      console.warn(`[Godmode] Behavior "${b.name}" error:`, e);
      _activeBehaviors.delete(id);
    }
  }
}

// ═══════════════════════════════════════════
// PRIMITIVES: Atomic Three.js Operations
// ═══════════════════════════════════════════

const Prim = {
  // Find objects by name/alias (fuzzy)
  find(query) {
    const e = window._engine;
    if (!e) return [];
    const q = query.toLowerCase();
    return e.objects.filter(o => {
      const n = (o.name || '').toLowerCase();
      const a = (o.userData?.alias || '').toLowerCase();
      return n.includes(q) || a.includes(q) || q.includes(n) || q.includes(a);
    });
  },

  findOne(query) {
    return this.find(query)[0] || null;
  },

  // Get all objects
  all() { return window._engine?.objects || []; },

  // Get scene
  scene() { return window._engine?.scene; },

  // Get camera
  camera() { return window._engine?.camera; },

  // Get character controller
  character() { return window._engine?.character; },

  // Spawn a primitive mesh (not GLB — for dynamic geometry)
  spawnMesh(type, { x = 0, y = 0, z = 0, color = 0xffffff, size = 1, name = '' } = {}) {
    let geo;
    switch (type) {
      case 'sphere': geo = new THREE.SphereGeometry(size * 0.5, 16, 16); break;
      case 'box': case 'cube': geo = new THREE.BoxGeometry(size, size, size); break;
      case 'cylinder': geo = new THREE.CylinderGeometry(size * 0.3, size * 0.3, size, 16); break;
      case 'cone': geo = new THREE.ConeGeometry(size * 0.4, size, 16); break;
      case 'torus': geo = new THREE.TorusGeometry(size * 0.4, size * 0.12, 12, 32); break;
      case 'ring': geo = new THREE.RingGeometry(size * 0.3, size * 0.5, 32); break;
      case 'plane': geo = new THREE.PlaneGeometry(size, size); break;
      case 'capsule': geo = new THREE.CapsuleGeometry(size * 0.3, size * 0.6, 8, 16); break;
      default: geo = new THREE.SphereGeometry(size * 0.5, 16, 16);
    }
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (name) mesh.name = name;
    window._engine?.scene?.add(mesh);
    return mesh;
  },

  // Create a particle system
  particles({ count = 100, x = 0, y = 0, z = 0, spread = 5, color = 0xff6600, size = 0.15, name = 'particles' } = {}) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = x + (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = y + Math.random() * spread;
      positions[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
      velocities[i * 3] = (Math.random() - 0.5) * 2;
      velocities[i * 3 + 1] = Math.random() * 3 + 1;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 2;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.userData = { velocities, baseY: y, spread };
    const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    const points = new THREE.Points(geo, mat);
    points.name = name;
    window._engine?.scene?.add(points);
    return points;
  },

  // Create a light
  light(type, { x = 0, y = 5, z = 0, color = 0xffffff, intensity = 2, distance = 20, name = 'light' } = {}) {
    let light;
    switch (type) {
      case 'point': light = new THREE.PointLight(color, intensity, distance); break;
      case 'spot': light = new THREE.SpotLight(color, intensity, distance); break;
      case 'directional': light = new THREE.DirectionalLight(color, intensity); break;
      default: light = new THREE.PointLight(color, intensity, distance);
    }
    light.position.set(x, y, z);
    light.name = name;
    window._engine?.scene?.add(light);
    return light;
  },

  // Create a line/trail
  trail({ color = 0x00ff88, maxPoints = 50, name = 'trail' } = {}) {
    const positions = new Float32Array(maxPoints * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 });
    const line = new THREE.Line(geo, mat);
    line.name = name;
    line.userData._trailIndex = 0;
    line.userData._maxPoints = maxPoints;
    window._engine?.scene?.add(line);
    return line;
  },

  // Add point to trail
  trailPush(trail, x, y, z) {
    const pos = trail.geometry.attributes.position;
    const idx = trail.userData._trailIndex;
    const max = trail.userData._maxPoints;
    // Shift all points back
    for (let i = max - 1; i > 0; i--) {
      pos.array[i * 3] = pos.array[(i - 1) * 3];
      pos.array[i * 3 + 1] = pos.array[(i - 1) * 3 + 1];
      pos.array[i * 3 + 2] = pos.array[(i - 1) * 3 + 2];
    }
    pos.array[0] = x; pos.array[1] = y; pos.array[2] = z;
    if (trail.userData._trailIndex < max) trail.userData._trailIndex++;
    trail.geometry.setDrawRange(0, trail.userData._trailIndex);
    pos.needsUpdate = true;
  },

  // Create text sprite
  text(str, { x = 0, y = 2, z = 0, color = '#ffffff', bg = 'rgba(0,0,0,0.7)', fontSize = 48, name = 'text' } = {}) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512; canvas.height = 128;
    ctx.fillStyle = bg;
    ctx.roundRect(0, 0, 512, 128, 16);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, 256, 64);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, y, z);
    sprite.scale.set(4, 1, 1);
    sprite.name = name;
    window._engine?.scene?.add(sprite);
    return sprite;
  },

  // Remove object from scene
  remove(obj) {
    if (!obj) return;
    window._engine?.scene?.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      else obj.material.dispose();
    }
  },

  // Color an object
  setColor(obj, color) {
    if (!obj) return;
    obj.traverse(child => {
      if (child.isMesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => { m.color = new THREE.Color(color); });
        } else {
          child.material.color = new THREE.Color(color);
        }
      }
    });
  },

  // Make object emissive (glow)
  setGlow(obj, color, intensity = 0.5) {
    if (!obj) return;
    obj.traverse(child => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(m => {
          m.emissive = new THREE.Color(color);
          m.emissiveIntensity = intensity;
        });
      }
    });
  },

  // Make object transparent
  setOpacity(obj, opacity) {
    if (!obj) return;
    obj.traverse(child => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(m => { m.transparent = true; m.opacity = opacity; });
      }
    });
  },

  // Scale object
  setScale(obj, s) {
    if (!obj) return;
    if (typeof s === 'number') obj.scale.set(s, s, s);
    else obj.scale.set(s.x || 1, s.y || 1, s.z || 1);
  },

  // Screen shake
  shake(intensity = 0.3, duration = 0.3) {
    const cam = window._engine?.camera;
    if (!cam) return;
    const origPos = cam.position.clone();
    const startEl = _elapsed; registerBehavior('shake', (dt, el) => {
      const remaining = duration - (el - startEl);
      if (remaining <= 0) {
        cam.position.copy(origPos);
        return false; // remove
      }
      const factor = remaining / duration;
      cam.position.x = origPos.x + (Math.random() - 0.5) * intensity * factor;
      cam.position.y = origPos.y + (Math.random() - 0.5) * intensity * factor;
      cam.position.z = origPos.z + (Math.random() - 0.5) * intensity * factor;
    });
    // startEl moved
  },

  // Slow motion
  slowmo(factor = 0.25, duration = 2) {
    // We can't change clock speed, but we can scale dt in behaviors
    const startEl = _elapsed;
    registerBehavior('slowmo', (dt, el) => {
      if (el - startEl > duration) return false;
    });
  },

  // Flash the screen
  flash(color = '#ffffff', duration = 0.3) {
    const div = document.createElement('div');
    div.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:${color};opacity:0.8;pointer-events:none;z-index:9999;transition:opacity ${duration}s`;
    document.body.appendChild(div);
    requestAnimationFrame(() => div.style.opacity = '0');
    setTimeout(() => div.remove(), duration * 1000 + 100);
  },

  // Show floating text at world position (damage numbers, etc.)
  floatingText(str, worldPos, { color = '#ffcc00', duration = 1.5, rise = 2 } = {}) {
    const sprite = Prim.text(str, { x: worldPos.x, y: worldPos.y + 1, z: worldPos.z, color, fontSize: 64, name: '_floatText' });
    const startY = worldPos.y + 1;
    const startEl = _elapsed;
    registerBehavior('floatText', (dt, el) => {
      const t = (el - startEl) / duration;
      if (t >= 1) { Prim.remove(sprite); return false; }
      sprite.position.y = startY + t * rise;
      sprite.material.opacity = 1 - t;
    });
    return sprite;
  },

  // Get player position
  playerPos() {
    const char = window._engine?.character;
    if (char?.model) return char.model.position.clone();
    return window._engine?.camera?.position?.clone() || new THREE.Vector3();
  },

  // Distance between two objects/positions
  dist(a, b) {
    const pa = a.position || a;
    const pb = b.position || b;
    return pa.distanceTo(pb);
  },
};

// ═══════════════════════════════════════════
// EFFECT LIBRARY: Pre-built Composable Effects
// ═══════════════════════════════════════════

const Effects = {
  // Make object orbit around a point
  orbit(obj, { center = null, radius = 5, speed = 1, axis = 'y' } = {}) {
    const cx = center?.x || obj.position.x;
    const cy = center?.y || obj.position.y;
    const cz = center?.z || obj.position.z;
    return registerBehavior(`orbit_${obj.name}`, (dt, el) => {
      if (!obj.parent) return false;
      const angle = el * speed;
      if (axis === 'y') {
        obj.position.x = cx + Math.cos(angle) * radius;
        obj.position.z = cz + Math.sin(angle) * radius;
      } else if (axis === 'x') {
        obj.position.y = cy + Math.cos(angle) * radius;
        obj.position.z = cz + Math.sin(angle) * radius;
      }
    }, obj);
  },

  // Make object bob up and down
  bob(obj, { amplitude = 0.5, speed = 2 } = {}) {
    const baseY = obj.position.y;
    return registerBehavior(`bob_${obj.name}`, (dt, el) => {
      if (!obj.parent) return false;
      obj.position.y = baseY + Math.sin(el * speed) * amplitude;
    }, obj);
  },

  // Spin object
  spin(obj, { speed = 1, axis = 'y' } = {}) {
    return registerBehavior(`spin_${obj.name}`, (dt, el) => {
      if (!obj.parent) return false;
      obj.rotation[axis] += dt * speed;
    }, obj);
  },

  // Pulse scale
  pulse(obj, { min = 0.8, max = 1.2, speed = 2 } = {}) {
    return registerBehavior(`pulse_${obj.name}`, (dt, el) => {
      if (!obj.parent) return false;
      const s = min + (max - min) * (0.5 + 0.5 * Math.sin(el * speed));
      obj.scale.set(s, s, s);
    }, obj);
  },

  // Color cycle (rainbow)
  rainbow(obj, { speed = 1 } = {}) {
    return registerBehavior(`rainbow_${obj.name}`, (dt, el) => {
      if (!obj.parent) return false;
      const hue = (el * speed) % 1;
      Prim.setColor(obj, new THREE.Color().setHSL(hue, 1, 0.5));
    }, obj);
  },

  // Flicker (like fire/torches)
  flicker(obj, { color1 = 0xff6600, color2 = 0xff2200, speed = 10 } = {}) {
    return registerBehavior(`flicker_${obj.name}`, (dt, el) => {
      if (!obj.parent) return false;
      const t = Math.sin(el * speed) * 0.5 + 0.5 + Math.random() * 0.2;
      const c = new THREE.Color(color1).lerp(new THREE.Color(color2), t);
      Prim.setGlow(obj, c, 0.3 + t * 0.5);
    }, obj);
  },

  // Follow target (chase)
  follow(obj, target, { speed = 3, offset = new THREE.Vector3(0, 0, 0) } = {}) {
    return registerBehavior(`follow_${obj.name}`, (dt, el) => {
      if (!obj.parent || !target.parent) return false;
      const targetPos = target.position.clone().add(offset);
      const dir = targetPos.sub(obj.position);
      if (dir.length() > 0.1) {
        dir.normalize().multiplyScalar(speed * dt);
        obj.position.add(dir);
      }
    }, obj);
  },

  // Patrol between waypoints
  patrol(obj, waypoints, { speed = 2, loop = true } = {}) {
    let wpIdx = 0;
    return registerBehavior(`patrol_${obj.name}`, (dt, el) => {
      if (!obj.parent) return false;
      const wp = waypoints[wpIdx];
      const dir = new THREE.Vector3(wp.x - obj.position.x, 0, wp.z - obj.position.z);
      if (dir.length() < 0.5) {
        wpIdx++;
        if (wpIdx >= waypoints.length) {
          if (loop) wpIdx = 0; else return false;
        }
      } else {
        dir.normalize().multiplyScalar(speed * dt);
        obj.position.add(dir);
        obj.lookAt(wp.x, obj.position.y, wp.z);
      }
    }, obj);
  },

  // Gravity (fall)
  gravity(obj, { strength = 9.8, groundY = 0 } = {}) {
    let vy = 0;
    return registerBehavior(`gravity_${obj.name}`, (dt, el) => {
      if (!obj.parent) return false;
      vy -= strength * dt;
      obj.position.y += vy * dt;
      if (obj.position.y <= groundY) {
        obj.position.y = groundY;
        vy = 0;
      }
    }, obj);
  },

  // Launch upward then fall
  launch(obj, { velocity = 10, gravity = 9.8, groundY = 0 } = {}) {
    let vy = velocity;
    return registerBehavior(`launch_${obj.name}`, (dt, el) => {
      if (!obj.parent) return false;
      vy -= gravity * dt;
      obj.position.y += vy * dt;
      if (obj.position.y <= groundY && vy < 0) {
        Prim.remove(obj);
        return false;
      }
    }, obj);
  },

  // Fireball rain from sky
  fireballRain({ x = 0, z = 0, spread = 30, rate = 3, damage = 10, color = 0xff4400 } = {}) {
    let timer = 0;
    return registerBehavior('fireballRain', (dt, el) => {
      timer += dt;
      if (timer < 1 / rate) return;
      timer = 0;
      const fx = x + (Math.random() - 0.5) * spread;
      const fz = z + (Math.random() - 0.5) * spread;
      const ball = Prim.spawnMesh('sphere', { x: fx, y: 30, z: fz, color, size: 0.6, name: '_fireball' });
      Prim.setGlow(ball, color, 1);
      const light = Prim.light('point', { x: fx, y: 30, z: fz, color, intensity: 3, distance: 10, name: '_fbLight' });
      let vy = 0;
      registerBehavior('fb_fall', (dt2, el2) => {
        vy += 15 * dt2;
        ball.position.y -= vy * dt2;
        light.position.copy(ball.position);
        if (ball.position.y <= 0.3) {
          // Explosion on impact
          const exp = Prim.particles({ count: 30, x: ball.position.x, y: 0.5, z: ball.position.z, spread: 2, color, size: 0.2, name: '_fbExplode' });
          registerBehavior('fbExpFade', (dt3, el3, target) => {
            target.material.opacity -= dt3 * 2;
            if (target.material.opacity <= 0) { Prim.remove(target); return false; }
          }, exp);
          Prim.remove(ball);
          Prim.remove(light);
          Prim.flash('#ff4400', 0.1);
          // Damage player if near
          const ppos = Prim.playerPos();
          if (ppos.distanceTo(new THREE.Vector3(ball.position.x, 0, ball.position.z)) < 3) {
            const char = Prim.character();
            if (char) char.hp = Math.max(0, (char.hp || 100) - damage);
          }
          return false;
        }
      }, ball);
    });
  },

  // Lightning strike
  lightning({ x = 0, z = 0, color = 0x88ccff, damage = 25 } = {}) {
    Prim.flash('#88ccff', 0.15);
    const bolt = Prim.spawnMesh('cylinder', { x, y: 15, z, color, size: 0.15, name: '_bolt' });
    bolt.scale.set(0.15, 30, 0.15);
    Prim.setGlow(bolt, color, 2);
    const light = Prim.light('point', { x, y: 1, z, color, intensity: 10, distance: 30, name: '_boltLight' });
    // Impact particles
    const sparks = Prim.particles({ count: 50, x, y: 0.5, z, spread: 3, color, size: 0.1, name: '_sparks' });
    setTimeout(() => {
      Prim.remove(bolt);
      Prim.remove(light);
      registerBehavior('sparkFade', (dt, el, target) => {
        target.material.opacity -= dt * 3;
        if (target.material.opacity <= 0) { Prim.remove(target); return false; }
      }, sparks);
    }, 150);
    // Damage
    const ppos = Prim.playerPos();
    if (ppos.distanceTo(new THREE.Vector3(x, 0, z)) < 4) {
      const char = Prim.character();
      if (char) char.hp = Math.max(0, (char.hp || 100) - damage);
    }
  },

  // Tornado / vortex that pulls objects
  tornado({ x = 0, z = 0, radius = 10, strength = 5, height = 15 } = {}) {
    // Visual: spinning particles
    const particles = Prim.particles({ count: 200, x, y: 0, z, spread: radius, color: 0x888888, size: 0.15, name: '_tornado' });
    return registerBehavior('tornado', (dt, el) => {
      if (!particles.parent) return false;
      const pos = particles.geometry.attributes.position;
      const vel = particles.geometry.userData.velocities;
      for (let i = 0; i < pos.count; i++) {
        const px = pos.array[i * 3] - x;
        const py = pos.array[i * 3 + 1];
        const pz = pos.array[i * 3 + 2] - z;
        const dist = Math.sqrt(px * px + pz * pz);
        // Spiral upward
        const angle = Math.atan2(pz, px) + dt * 3;
        const newDist = dist + (radius * 0.3 - dist) * dt * 2;
        pos.array[i * 3] = x + Math.cos(angle) * newDist;
        pos.array[i * 3 + 1] = (py + dt * 4) % height;
        pos.array[i * 3 + 2] = z + Math.sin(angle) * newDist;
      }
      pos.needsUpdate = true;
      // Pull nearby objects
      const objs = Prim.all();
      for (const obj of objs) {
        if (obj.name?.startsWith('_')) continue;
        const d = new THREE.Vector3(x - obj.position.x, 0, z - obj.position.z).length();
        if (d < radius && d > 1) {
          const pull = new THREE.Vector3(x - obj.position.x, 0, z - obj.position.z).normalize().multiplyScalar(strength * dt / d);
          obj.position.add(pull);
          obj.rotation.y += dt * 2;
        }
      }
    });
  },

  // Portal (swirling ring)
  portal({ x = 0, y = 1.5, z = 0, color = 0x8844ff, size = 2, targetX = 0, targetY = 0, targetZ = 20 } = {}) {
    const ring = Prim.spawnMesh('torus', { x, y, z, color, size, name: '_portal' });
    Prim.setGlow(ring, color, 1);
    Effects.spin(ring, { speed: 2, axis: 'z' });
    Effects.pulse(ring, { min: 0.9, max: 1.1, speed: 3 });
    // Teleport on proximity
    registerBehavior('portalCheck', (dt, el) => {
      if (!ring.parent) return false;
      const ppos = Prim.playerPos();
      if (Prim.dist(ppos, ring) < size) {
        const char = Prim.character();
        if (char?.model) {
          char.model.position.set(targetX, targetY, targetZ);
          Prim.flash('#8844ff', 0.2);
        }
      }
    });
    return ring;
  },

  // Floating island
  floatingIsland({ x = 0, y = 8, z = 0, size = 5 } = {}) {
    const island = Prim.spawnMesh('cylinder', { x, y, z, color: 0x44aa44, size, name: '_island' });
    island.scale.set(size, 0.5, size);
    // Add some rocks and trees on top
    for (let i = 0; i < 3; i++) {
      const rx = x + (Math.random() - 0.5) * size * 0.6;
      const rz = z + (Math.random() - 0.5) * size * 0.6;
      window._engine?.exec?.(`add tree at ${rx} ${y + 0.5} ${rz}`);
    }
    Effects.bob(island, { amplitude: 0.3, speed: 0.5 });
    return island;
  },

  // Water plane (animated)
  water({ y = -0.1, size = 300, color = 0x1166aa, opacity = 0.6 } = {}) {
    const geo = new THREE.PlaneGeometry(size, size, 64, 64);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color, transparent: true, opacity,
      roughness: 0.1, metalness: 0.5,
      side: THREE.DoubleSide
    });
    const water = new THREE.Mesh(geo, mat);
    water.position.y = y;
    water.name = '_water';
    window._engine?.scene?.add(water);
    registerBehavior('waterWave', (dt, el) => {
      if (!water.parent) return false;
      const pos = water.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.array[i * 3];
        const z = pos.array[i * 3 + 2];
        pos.array[i * 3 + 1] = Math.sin(x * 0.1 + el * 2) * 0.2 + Math.cos(z * 0.15 + el * 1.5) * 0.15;
      }
      pos.needsUpdate = true;
    });
    return water;
  },

  // Explosion at position
  explode({ x = 0, y = 0, z = 0, radius = 5, color = 0xff6600, force = 10 } = {}) {
    Prim.flash('#ff4400', 0.15);
    Prim.shake(0.4, 0.3);
    // Fireball
    const fireball = Prim.spawnMesh('sphere', { x, y: y + 1, z, color, size: 2, name: '_explosion' });
    Prim.setGlow(fireball, color, 2);
    // Expand + fade
    registerBehavior('expGrow', (dt, el, target) => {
      target.scale.multiplyScalar(1 + dt * 5);
      target.material.opacity -= dt * 2;
      target.material.transparent = true;
      if (target.material.opacity <= 0) { Prim.remove(target); return false; }
    }, fireball);
    // Particles
    const sparks = Prim.particles({ count: 80, x, y: y + 1, z, spread: 1, color, size: 0.2, name: '_expSparks' });
    registerBehavior('expSparks', (dt, el, target) => {
      const pos = target.geometry.attributes.position;
      const vel = target.geometry.userData.velocities;
      for (let i = 0; i < pos.count; i++) {
        pos.array[i * 3] += vel[i * 3] * dt * 8;
        pos.array[i * 3 + 1] += vel[i * 3 + 1] * dt * 5 - 5 * dt;
        pos.array[i * 3 + 2] += vel[i * 3 + 2] * dt * 8;
      }
      pos.needsUpdate = true;
      target.material.opacity -= dt * 1.5;
      if (target.material.opacity <= 0) { Prim.remove(target); return false; }
    }, sparks);
    // Push nearby objects
    const objs = Prim.all();
    const center = new THREE.Vector3(x, y, z);
    for (const obj of objs) {
      const d = obj.position.distanceTo(center);
      if (d < radius && d > 0.1) {
        const dir = obj.position.clone().sub(center).normalize().multiplyScalar(force / d);
        obj.position.add(dir);
      }
    }
    // Damage player
    const ppos = Prim.playerPos();
    if (ppos.distanceTo(center) < radius) {
      const char = Prim.character();
      if (char) char.hp = Math.max(0, (char.hp || 100) - 30);
    }
  },

  // Force field (shield bubble)
  forceField({ x = 0, y = 1.5, z = 0, radius = 3, color = 0x00aaff, followPlayer = false } = {}) {
    const geo = new THREE.SphereGeometry(radius, 32, 32);
    const mat = new THREE.MeshStandardMaterial({
      color, transparent: true, opacity: 0.15,
      emissive: new THREE.Color(color), emissiveIntensity: 0.3,
      side: THREE.DoubleSide, wireframe: false
    });
    const shield = new THREE.Mesh(geo, mat);
    shield.position.set(x, y, z);
    shield.name = '_forceField';
    window._engine?.scene?.add(shield);
    registerBehavior('forceField', (dt, el) => {
      if (!shield.parent) return false;
      mat.opacity = 0.1 + Math.sin(el * 3) * 0.05;
      mat.emissiveIntensity = 0.2 + Math.sin(el * 5) * 0.1;
      if (followPlayer) {
        const pp = Prim.playerPos();
        shield.position.set(pp.x, pp.y + 1.5, pp.z);
      }
    });
    return shield;
  },

  // Day/night cycle
  dayNightCycle({ speed = 0.1 } = {}) {
    return registerBehavior('dayNight', (dt, el) => {
      const t = (el * speed) % 1; // 0-1 cycle
      const hour = t * 24;
      if (hour < 6 || hour > 20) {
        window._engine?.exec?.('time night');
      } else if (hour < 8) {
        window._engine?.exec?.('time dawn');
      } else if (hour < 17) {
        // daytime — adjust sun position
      } else {
        window._engine?.exec?.('time sunset');
      }
    });
  },
};

// ═══════════════════════════════════════════
// NLP INTENT PARSER — Maps freeform text to primitives + behaviors
// ═══════════════════════════════════════════

// Intent patterns: regex → handler function
const INTENT_PATTERNS = [
  // ── RAIN / FALL FROM SKY ──
  {
    match: /(?:make|let)\s+it\s+rain\s+(\w[\w\s]*?)(?:\s+from\s+(?:the\s+)?sky)?$/i,
    alt: /rain(?:ing)?\s+(\w[\w\s]*?)(?:\s+from\s+(?:the\s+)?sky)?$/i,
    handler: (m) => {
      const thing = m[1].trim();
      return { type: 'rain_objects', thing, description: `Raining ${thing} from the sky` };
    }
  },
  // ── FIREBALL RAIN ──
  {
    match: /(?:rain|shower|storm)\s*(?:of\s+)?fire\s*balls?|fire\s*balls?\s+(?:rain|fall|from)/i,
    handler: () => ({ type: 'fireball_rain', description: 'Fireballs raining from the sky' })
  },
  // ── LIGHTNING ──
  {
    match: /lightning\s*(?:strike|bolt)?|strike\s*(?:with\s+)?lightning|thunder\s*(?:bolt|strike)/i,
    handler: () => ({ type: 'lightning', description: 'Lightning strike' })
  },
  // ── TORNADO ──
  {
    match: /tornado|cyclone|whirlwind|vortex|twister/i,
    handler: () => ({ type: 'tornado', description: 'Tornado vortex' })
  },
  // ── EXPLOSION ──
  {
    match: /explo(?:de|sion)|blow\s*up|detonate|boom/i,
    handler: (m, text) => {
      const target = text.match(/(?:explo(?:de|sion)|blow\s*up)\s+(?:the\s+)?(\w+)/i);
      return { type: 'explosion', target: target?.[1], description: 'Explosion' };
    }
  },
  // ── MAKE OBJECT ORBIT ──
  {
    match: /(?:make|let)\s+(?:the\s+)?(\w+)\s+(?:orbit|circle|revolve|go\s+around)/i,
    handler: (m) => ({ type: 'orbit', target: m[1], description: `${m[1]} orbiting` })
  },
  // ── MAKE OBJECT FLOAT / BOB ──
  {
    match: /(?:make|let)\s+(?:the\s+)?(\w+)\s+(?:float|bob|hover|levitate)/i,
    handler: (m) => ({ type: 'bob', target: m[1], description: `${m[1]} floating` })
  },
  // ── MAKE OBJECT SPIN ──
  {
    match: /(?:make|let|spin)\s+(?:the\s+)?(\w+)\s*(?:spin|rotate|turn)/i,
    alt: /spin\s+(?:the\s+)?(\w+)/i,
    handler: (m) => ({ type: 'spin', target: m[1], description: `${m[1]} spinning` })
  },
  // ── MAKE OBJECT GLOW ──
  {
    match: /(?:make|let)\s+(?:the\s+)?(\w+)\s+(?:glow|shine|light\s+up|illuminate)/i,
    handler: (m) => {
      const colorMatch = m.input.match(/(?:glow|shine)\s+(red|blue|green|purple|gold|orange|white|pink|cyan|yellow)/i);
      return { type: 'glow', target: m[1], color: colorMatch?.[1] || 'gold', description: `${m[1]} glowing` };
    }
  },
  // ── MAKE OBJECT RAINBOW ──
  {
    match: /(?:make|let)\s+(?:the\s+)?(\w+)\s+(?:rainbow|color\s*cycle|disco)/i,
    handler: (m) => ({ type: 'rainbow', target: m[1], description: `${m[1]} rainbow` })
  },
  // ── MAKE OBJECT FOLLOW ──
  {
    match: /(?:make|let)\s+(?:the\s+)?(\w+)\s+(?:follow|chase|track|pursue)\s+(?:the\s+)?(?:me|player|(\w+))/i,
    handler: (m) => ({ type: 'follow', source: m[1], target: m[2] || 'player', description: `${m[1]} following` })
  },
  // ── MAKE OBJECT PATROL ──
  {
    match: /(?:make|let)\s+(?:the\s+)?(\w+)\s+(?:patrol|walk\s+around|wander|pace|march)/i,
    handler: (m) => ({ type: 'patrol', target: m[1], description: `${m[1]} patrolling` })
  },
  // ── PORTAL ──
  {
    match: /(?:create|make|add|open|spawn)\s+(?:a\s+)?portal/i,
    handler: () => ({ type: 'portal', description: 'Portal' })
  },
  // ── FORCE FIELD / SHIELD ──
  {
    match: /(?:create|make|add|activate)\s+(?:a\s+)?(?:force\s*field|shield|bubble|barrier)/i,
    handler: (m, text) => {
      const fp = text.match(/follow|on\s+(?:me|player)/i);
      return { type: 'force_field', followPlayer: !!fp, description: 'Force field' };
    }
  },
  // ── WATER / OCEAN / LAKE / RIVER ──
  {
    match: /(?:add|create|make|fill)\s+(?:a\s+)?(?:water|ocean|lake|sea|river|flood)/i,
    handler: () => ({ type: 'water', description: 'Water plane' })
  },
  // ── FLOATING ISLAND ──
  {
    match: /(?:create|make|add)\s+(?:a\s+)?floating\s+island/i,
    handler: () => ({ type: 'floating_island', description: 'Floating island' })
  },
  // ── DAY/NIGHT CYCLE ──
  {
    match: /(?:day\s*[\/&]\s*night|dynamic\s+time|time\s+cycle|day\s+night)\s*cycle/i,
    handler: () => ({ type: 'day_night_cycle', description: 'Day/night cycle' })
  },
  // ── MAKE OBJECT PULSE ──
  {
    match: /(?:make|let)\s+(?:the\s+)?(\w+)\s+(?:pulse|throb|beat|breathe)/i,
    handler: (m) => ({ type: 'pulse', target: m[1], description: `${m[1]} pulsing` })
  },
  // ── MAKE OBJECT FLICKER ──
  {
    match: /(?:make|let)\s+(?:the\s+)?(\w+)\s+(?:flicker|strobe|blink|flash)/i,
    handler: (m) => ({ type: 'flicker', target: m[1], description: `${m[1]} flickering` })
  },
  // ── TRAIL / LEAVE TRAIL ──
  {
    match: /(?:leave|add|create|make)\s+(?:a\s+)?trail|(?:make|let)\s+(?:the\s+)?(\w+)\s+leave\s+(?:a\s+)?trail/i,
    handler: (m) => ({ type: 'trail', target: m?.[1] || 'player', description: 'Trail effect' })
  },
  // ── GRAVITY ON/OFF ──
  {
    match: /(?:add|enable|turn\s+on)\s+(?:gravity|physics)\s+(?:to|on|for)\s+(?:the\s+)?(\w+)|(?:make)\s+(?:the\s+)?(\w+)\s+fall/i,
    handler: (m) => ({ type: 'gravity', target: m[1] || m[2], description: 'Gravity' })
  },
  // ── LAUNCH / THROW ──
  {
    match: /(?:launch|throw|yeet|toss|fling)\s+(?:the\s+)?(\w+)/i,
    handler: (m) => ({ type: 'launch', target: m[1], description: `Launching ${m[1]}` })
  },
  // ── SCREEN SHAKE ──
  {
    match: /(?:screen\s*)?shake|earthquake|quake|tremor/i,
    handler: () => ({ type: 'shake', description: 'Screen shake' })
  },
  // ── SLOW MOTION ──
  {
    match: /slow\s*(?:mo(?:tion)?)|bullet\s*time|time\s*slow/i,
    handler: () => ({ type: 'slowmo', description: 'Slow motion' })
  },
  // ── STOP BEHAVIORS ──
  {
    match: /stop\s+(?:all\s+)?(?:behaviors?|effects?|everything)|reset\s+(?:behaviors?|effects?)/i,
    handler: () => ({ type: 'stop_all', description: 'Stop all behaviors' })
  },
  // ── LIST BEHAVIORS ──
  {
    match: /(?:list|show|what)\s+(?:active\s+)?behaviors?|what(?:'s|\s+is)\s+running/i,
    handler: () => ({ type: 'list_behaviors', description: 'List behaviors' })
  },
  // ── MAKE OBJECT TRANSPARENT / INVISIBLE ──
  {
    match: /(?:make)\s+(?:the\s+)?(\w+)\s+(?:transparent|invisible|see.?through|ghost)/i,
    handler: (m) => ({ type: 'transparent', target: m[1], description: `${m[1]} transparent` })
  },
  // ── MAKE OBJECT BIGGER / GIANT ──
  {
    match: /(?:make)\s+(?:the\s+)?(\w+)\s+(?:giant|huge|massive|enormous|gigantic)/i,
    handler: (m) => ({ type: 'scale_up', target: m[1], scale: 5, description: `Giant ${m[1]}` })
  },
  // ── MAKE OBJECT TINY ──
  {
    match: /(?:make)\s+(?:the\s+)?(\w+)\s+(?:tiny|small|miniature|mini|shrink)/i,
    handler: (m) => ({ type: 'scale_down', target: m[1], scale: 0.2, description: `Tiny ${m[1]}` })
  },
  // ── CLONE / DUPLICATE MANY ──
  {
    match: /(?:clone|duplicate|copy|multiply)\s+(?:the\s+)?(\w+)\s*(?:(\d+)\s*times?)?/i,
    handler: (m) => ({ type: 'clone_many', target: m[1], count: parseInt(m[2]) || 5, description: `Cloning ${m[1]}` })
  },
  // ── ATTACH / MOUNT ──
  {
    match: /(?:attach|put|mount|stick)\s+(?:a\s+)?(\w+)\s+(?:on|to)\s+(?:the\s+)?(\w+)/i,
    handler: (m) => ({ type: 'attach', source: m[1], target: m[2], description: `Attaching ${m[1]} to ${m[2]}` })
  },
  // ── RAIN GENERIC OBJECTS ──
  {
    match: /(?:make\s+it\s+)?rain\s+(\w+)/i,
    handler: (m) => ({ type: 'rain_objects', thing: m[1], description: `Raining ${m[1]}` })
  },
];

const COLOR_MAP = {
  red: 0xff0000, blue: 0x0066ff, green: 0x00cc44, yellow: 0xffcc00,
  orange: 0xff6600, purple: 0x8844ff, pink: 0xff44aa, cyan: 0x00ccff,
  white: 0xffffff, gold: 0xffd700, black: 0x111111, silver: 0xcccccc,
};

// Parse user input into an intent
export function parseIntent(text) {
  const lower = text.toLowerCase().trim();
  for (const pattern of INTENT_PATTERNS) {
    let m = lower.match(pattern.match);
    if (!m && pattern.alt) m = lower.match(pattern.alt);
    if (m) return pattern.handler(m, lower);
  }
  return null;
}

// Execute an intent
export function executeIntent(intent) {
  if (!intent) return null;

  const findTarget = (name) => {
    if (name === 'player') return Prim.character()?.model;
    return Prim.findOne(name);
  };

  switch (intent.type) {
    case 'fireball_rain': {
      const pp = Prim.playerPos();
      const id = Effects.fireballRain({ x: pp.x, z: pp.z, spread: 40 });
      return `🔥 Fireballs raining from the sky! (behavior #${id})`;
    }
    case 'lightning': {
      const pp = Prim.playerPos();
      const x = pp.x + (Math.random() - 0.5) * 20;
      const z = pp.z + (Math.random() - 0.5) * 20;
      if (window._sound) window._sound.SFX.lightning(); Effects.lightning({ x, z });
      // Strike multiple times
      for (let i = 1; i < 4; i++) {
        setTimeout(() => {
          if (window._sound) window._sound.SFX.lightning(); Effects.lightning({
            x: pp.x + (Math.random() - 0.5) * 25,
            z: pp.z + (Math.random() - 0.5) * 25
          });
        }, i * 400);
      }
      return '⚡ Lightning strikes!';
    }
    case 'tornado': {
      const pp = Prim.playerPos();
      const id = Effects.tornado({ x: pp.x + 15, z: pp.z + 15 });
      return `🌪️ Tornado spawned! It pulls nearby objects. (behavior #${id})`;
    }
    case 'explosion': {
      let pos = Prim.playerPos();
      if (intent.target) {
        const obj = findTarget(intent.target);
        if (obj) pos = obj.position.clone();
      }
      if (window._sound) window._sound.SFX.explosion(); Effects.explode({ x: pos.x, y: pos.y, z: pos.z });
      return '💥 BOOM! Explosion!';
    }
    case 'orbit': {
      const obj = findTarget(intent.target);
      if (!obj) return `Can't find "${intent.target}" to orbit`;
      Effects.orbit(obj);
      return `🔄 ${intent.target} is now orbiting!`;
    }
    case 'bob': {
      const obj = findTarget(intent.target);
      if (!obj) return `Can't find "${intent.target}"`;
      Effects.bob(obj);
      return `✨ ${intent.target} is now floating!`;
    }
    case 'spin': {
      const obj = findTarget(intent.target);
      if (!obj) return `Can't find "${intent.target}"`;
      Effects.spin(obj, { speed: 3 });
      return `🔄 ${intent.target} is spinning!`;
    }
    case 'glow': {
      const obj = findTarget(intent.target);
      if (!obj) return `Can't find "${intent.target}"`;
      const c = COLOR_MAP[intent.color] || 0xffd700;
      Prim.setGlow(obj, c, 0.8);
      return `✨ ${intent.target} is glowing ${intent.color}!`;
    }
    case 'rainbow': {
      const obj = findTarget(intent.target);
      if (!obj) return `Can't find "${intent.target}"`;
      Effects.rainbow(obj);
      return `🌈 ${intent.target} is cycling colors!`;
    }
    case 'follow': {
      const src = findTarget(intent.source);
      if (!src) return `Can't find "${intent.source}"`;
      let tgt;
      if (intent.target === 'player') {
        tgt = Prim.character()?.model;
      } else {
        tgt = findTarget(intent.target);
      }
      if (!tgt) return `Can't find target to follow`;
      Effects.follow(src, tgt);
      return `🏃 ${intent.source} is now following ${intent.target}!`;
    }
    case 'patrol': {
      const obj = findTarget(intent.target);
      if (!obj) return `Can't find "${intent.target}"`;
      const cx = obj.position.x, cz = obj.position.z;
      const waypoints = [
        { x: cx - 8, z: cz }, { x: cx - 8, z: cz + 8 },
        { x: cx + 8, z: cz + 8 }, { x: cx + 8, z: cz },
      ];
      Effects.patrol(obj, waypoints);
      return `🚶 ${intent.target} is patrolling!`;
    }
    case 'portal': {
      const pp = Prim.playerPos();
      Effects.portal({ x: pp.x + 5, y: 1.5, z: pp.z, targetX: pp.x + 50, targetZ: pp.z + 50 });
      return '🌀 Portal opened! Walk through to teleport!';
    }
    case 'force_field': {
      if (intent.followPlayer) {
        Effects.forceField({ followPlayer: true });
        return '🛡️ Force field activated! It follows you!';
      } else {
        const pp = Prim.playerPos();
        Effects.forceField({ x: pp.x, y: 1.5, z: pp.z });
        return '🛡️ Force field deployed!';
      }
    }
    case 'water': {
      Effects.water();
      return '🌊 Water added! Waves are rolling.';
    }
    case 'floating_island': {
      Effects.floatingIsland({ x: 0, y: 10, z: -15 });
      return '🏝️ Floating island created!';
    }
    case 'day_night_cycle': {
      const id = Effects.dayNightCycle();
      return `🌅 Day/night cycle active! (behavior #${id})`;
    }
    case 'pulse': {
      const obj = findTarget(intent.target);
      if (!obj) return `Can't find "${intent.target}"`;
      Effects.pulse(obj);
      return `💫 ${intent.target} is pulsing!`;
    }
    case 'flicker': {
      const obj = findTarget(intent.target);
      if (!obj) return `Can't find "${intent.target}"`;
      Effects.flicker(obj);
      return `🔥 ${intent.target} is flickering!`;
    }
    case 'trail': {
      const trail = Prim.trail({ color: 0x00ff88 });
      registerBehavior('playerTrail', (dt, el) => {
        const pp = Prim.playerPos();
        Prim.trailPush(trail, pp.x, pp.y + 0.5, pp.z);
      });
      return '✨ Trail active! Move to see it.';
    }
    case 'gravity': {
      const obj = findTarget(intent.target);
      if (!obj) return `Can't find "${intent.target}"`;
      obj.position.y += 10; // lift up first
      Effects.gravity(obj);
      return `🍎 ${intent.target} now has gravity!`;
    }
    case 'launch': {
      const obj = findTarget(intent.target);
      if (!obj) return `Can't find "${intent.target}"`;
      Effects.launch(obj, { velocity: 15 });
      return `🚀 ${intent.target} LAUNCHED!`;
    }
    case 'shake': {
      Prim.shake(0.5, 0.5);
      return '📳 EARTHQUAKE!';
    }
    case 'slowmo': {
      Prim.flash('#4488ff', 0.2);
      return '⏱️ Slow motion activated!';
    }
    case 'stop_all': {
      const count = _activeBehaviors.size;
      removeAllBehaviors();
      return `⏹️ Stopped ${count} active behaviors.`;
    }
    case 'list_behaviors': {
      const behaviors = listBehaviors();
      if (behaviors.length === 0) return 'No active behaviors running.';
      return '🔄 Active behaviors:\n' + behaviors.map(b => `  #${b.id}: ${b.name}${b.paused ? ' (paused)' : ''}`).join('\n');
    }
    case 'transparent': {
      const obj = findTarget(intent.target);
      if (!obj) return `Can't find "${intent.target}"`;
      Prim.setOpacity(obj, 0.3);
      return `👻 ${intent.target} is now see-through!`;
    }
    case 'scale_up': {
      const obj = findTarget(intent.target);
      if (!obj) return `Can't find "${intent.target}"`;
      Prim.setScale(obj, intent.scale);
      return `🦕 ${intent.target} is now GIANT!`;
    }
    case 'scale_down': {
      const obj = findTarget(intent.target);
      if (!obj) return `Can't find "${intent.target}"`;
      Prim.setScale(obj, intent.scale);
      return `🐜 ${intent.target} is now tiny!`;
    }
    case 'clone_many': {
      const obj = findTarget(intent.target);
      if (!obj) return `Can't find "${intent.target}"`;
      for (let i = 0; i < intent.count; i++) {
        const clone = obj.clone();
        clone.position.x += (Math.random() - 0.5) * 20;
        clone.position.z += (Math.random() - 0.5) * 20;
        window._engine?.scene?.add(clone);
      }
      return `📋 Cloned ${intent.target} ${intent.count} times!`;
    }
    case 'attach': {
      const src = Prim.findOne(intent.source);
      const tgt = findTarget(intent.target);
      if (!src) return `Can't find "${intent.source}"`;
      if (!tgt) return `Can't find "${intent.target}"`;
      tgt.add(src);
      src.position.set(0, 2, 0); // on top
      return `📎 ${intent.source} attached to ${intent.target}!`;
    }
    case 'rain_objects': {
      const thing = intent.thing;
      let timer = 0;
      registerBehavior('rainObj', (dt, el) => {
        timer += dt;
        if (timer < 0.3) return;
        timer = 0;
        const pp = Prim.playerPos();
        const x = pp.x + (Math.random() - 0.5) * 40;
        const z = pp.z + (Math.random() - 0.5) * 40;
        // Use engine exec to spawn real GLB models
        window._engine?.exec?.(`add ${thing} at ${x.toFixed(1)} 25 ${z.toFixed(1)}`);
        // Add gravity to the last spawned object after a short delay
        setTimeout(() => {
          const objs = Prim.all();
          const latest = objs[objs.length - 1];
          if (latest && latest.position.y > 20) {
            Effects.gravity(latest, { strength: 12 });
          }
        }, 200);
      });
      return `🌧️ It's raining ${thing}! Real 3D models falling from the sky!`;
    }

    default:
      return null;
  }
}

// ═══════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════

// Expose globally for engine integration
window._godmode = {
  Prim,
  Effects,
  registerBehavior,
  removeBehavior,
  removeAllBehaviors,
  pauseBehavior,
  resumeBehavior,
  listBehaviors,
  updateBehaviors,
  parseIntent,
  executeIntent,
};

export { Prim, Effects };
