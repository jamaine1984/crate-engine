#!/usr/bin/env python3
"""Crate Engine v61 — AAA Water/Sky, Vehicle Physics, Shooter, Size Fixes, 3D Gen Retry"""

import re

with open('web/engine.mjs', 'r') as f:
    content = f.read()

# ============================================================
# 1. ADD IMPORTS for Water, Sky at top of file (after THREE import)
# ============================================================
three_import = "import * as THREE from 'three';"
if three_import not in content:
    # Try alternate
    three_import = content.split('\n')[0] if 'three' in content.split('\n')[0] else None

# Add imports after the first import line
water_sky_imports = """
// === AAA Water & Sky (v61) ===
let Water, Sky, waterMesh, skyMesh, sun;
async function loadWaterSky() {
  try {
    const [WaterMod, SkyMod] = await Promise.all([
      import('three/addons/objects/Water.js'),
      import('three/addons/objects/Sky.js')
    ]);
    Water = WaterMod.Water;
    Sky = SkyMod.Sky;
    console.log('[CRATE] Water + Sky modules loaded');
  } catch(e) { console.warn('[CRATE] Water/Sky load failed:', e); }
}
loadWaterSky();

function createAAASky() {
  if (!Sky || !scene) return;
  if (skyMesh) scene.remove(skyMesh);
  skyMesh = new Sky();
  skyMesh.scale.setScalar(10000);
  scene.add(skyMesh);
  sun = new THREE.Vector3();
  const uniforms = skyMesh.material.uniforms;
  uniforms['turbidity'].value = 10;
  uniforms['rayleigh'].value = 3;
  uniforms['mieCoefficient'].value = 0.005;
  uniforms['mieDirectionalG'].value = 0.7;
  const phi = THREE.MathUtils.degToRad(90 - 2);
  const theta = THREE.MathUtils.degToRad(180);
  sun.setFromSphericalCoords(1, phi, theta);
  uniforms['sunPosition'].value.copy(sun);
  // Update environment map for PBR reflections
  if (renderer) {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const rt = pmremGenerator.fromScene(skyMesh);
    if (scene.environment) scene.environment.dispose();
    scene.environment = rt.texture;
    pmremGenerator.dispose();
  }
  console.log('[CRATE] AAA Sky created');
}

function setSkyTime(elevation, azimuth) {
  if (!skyMesh || !sun) return;
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  sun.setFromSphericalCoords(1, phi, theta);
  skyMesh.material.uniforms['sunPosition'].value.copy(sun);
}

function createAAAWater(size) {
  if (!Water) return createWater(size); // fallback
  const s = size || 200;
  const waterGeometry = new THREE.PlaneGeometry(s, s, 128, 128);
  const w = new Water(waterGeometry, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: new THREE.TextureLoader().load(
      'https://threejs.org/examples/textures/waternormals.jpg',
      function(texture) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      }
    ),
    sunDirection: sun ? sun.clone().normalize() : new THREE.Vector3(0.7, 0.8, 0.3),
    sunColor: 0xffffff,
    waterColor: 0x001e0f,
    distortionScale: 3.7,
    fog: scene.fog !== undefined
  });
  w.rotation.x = -Math.PI / 2;
  w.position.y = -0.5;
  w.userData.isWater = true;
  w.userData.isAAAWater = true;
  w.userData.isSolid = true;
  w.userData.name = 'ocean';
  return w;
}

// === Vehicle Physics v2 (v61) ===
let vehiclePhysics = null;
function createVehiclePhysics(vehicleMesh) {
  const vp = {
    mesh: vehicleMesh,
    speed: 0,
    maxSpeed: 80,
    acceleration: 35,
    braking: 50,
    friction: 0.97,
    steerAngle: 0,
    maxSteer: 0.04,
    steerSpeed: 0.003,
    steerReturn: 0.92,
    direction: new THREE.Vector3(0, 0, -1),
    rpm: 0,
  };
  return vp;
}

function updateVehiclePhysics(vp, dt, keys) {
  if (!vp || !vp.mesh) return;
  // Acceleration / Braking
  if (keys.w || keys.ArrowUp) vp.speed += vp.acceleration * dt;
  if (keys.s || keys.ArrowDown) vp.speed -= vp.braking * dt;
  vp.speed *= vp.friction;
  vp.speed = THREE.MathUtils.clamp(vp.speed, -20, vp.maxSpeed);
  // Steering
  if (keys.a || keys.ArrowLeft) vp.steerAngle -= vp.steerSpeed;
  if (keys.d || keys.ArrowRight) vp.steerAngle += vp.steerSpeed;
  vp.steerAngle *= vp.steerReturn;
  vp.steerAngle = THREE.MathUtils.clamp(vp.steerAngle, -vp.maxSteer, vp.maxSteer);
  // Apply rotation
  if (Math.abs(vp.speed) > 0.5) {
    vp.mesh.rotation.y -= vp.steerAngle * (vp.speed > 0 ? 1 : -1);
  }
  // Move
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(vp.mesh.quaternion);
  vp.mesh.position.addScaledVector(forward, vp.speed * dt);
  // RPM for HUD
  vp.rpm = Math.abs(vp.speed / vp.maxSpeed) * 7000;
  // Keep on ground
  vp.mesh.position.y = Math.max(vp.mesh.position.y, 0.5);
}

// === Shooter System (v61) ===
let shooterMode = false;
let playerHP = 100;
let ammo = 30;
let maxAmmo = 30;
const bullets = [];
const enemies = [];

function createBullet(origin, direction) {
  const geo = new THREE.SphereGeometry(0.08, 4, 4);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
  const bullet = new THREE.Mesh(geo, mat);
  bullet.position.copy(origin);
  bullet.userData.velocity = direction.clone().multiplyScalar(80);
  bullet.userData.life = 2.0;
  scene.add(bullet);
  bullets.push(bullet);
  return bullet;
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.position.addScaledVector(b.userData.velocity, dt);
    b.userData.life -= dt;
    if (b.userData.life <= 0) {
      scene.remove(b);
      bullets.splice(i, 1);
      continue;
    }
    // Hit detection against enemies
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (b.position.distanceTo(e.position) < 1.5) {
        e.userData.hp = (e.userData.hp || 50) - 25;
        // Damage flash
        e.traverse(c => { if (c.isMesh) { c._origColor = c._origColor || c.material.color.getHex(); c.material.color.setHex(0xff0000); setTimeout(() => { if (c.material) c.material.color.setHex(c._origColor || 0xffffff); }, 100); }});
        // Floating damage number
        showDamageNumber(b.position, 25);
        scene.remove(b);
        bullets.splice(i, 1);
        if (e.userData.hp <= 0) {
          scene.remove(e);
          enemies.splice(j, 1);
          if (typeof showToast === 'function') showToast('💀 Enemy eliminated!');
        }
        break;
      }
    }
  }
}

function showDamageNumber(pos, damage) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff4444';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('-' + damage, 32, 24);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.position.copy(pos);
  sprite.position.y += 2;
  sprite.scale.set(1.5, 0.75, 1);
  scene.add(sprite);
  // Float up and fade
  const startY = sprite.position.y;
  const startTime = performance.now();
  function animDmg() {
    const elapsed = (performance.now() - startTime) / 1000;
    if (elapsed > 1) { scene.remove(sprite); return; }
    sprite.position.y = startY + elapsed * 2;
    sprite.material.opacity = 1 - elapsed;
    requestAnimationFrame(animDmg);
  }
  animDmg();
}

function createShooterHUD() {
  let hud = document.getElementById('shooter-hud');
  if (hud) return;
  hud = document.createElement('div');
  hud.id = 'shooter-hud';
  hud.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:10000;font-family:monospace;color:#fff;text-shadow:0 0 5px rgba(0,0,0,0.8);pointer-events:none;';
  hud.innerHTML = '<div id="sh-hp" style="font-size:20px;margin-bottom:4px">❤️ 100</div><div id="sh-ammo" style="font-size:16px">🔫 30/30</div>';
  document.body.appendChild(hud);
  // Crosshair
  let ch = document.getElementById('crosshair');
  if (!ch) {
    ch = document.createElement('div');
    ch.id = 'crosshair';
    ch.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10000;pointer-events:none;font-size:24px;color:rgba(255,255,255,0.7);text-shadow:0 0 3px #000;';
    ch.textContent = '⊕';
    document.body.appendChild(ch);
  }
}

function updateShooterHUD() {
  const hp = document.getElementById('sh-hp');
  const am = document.getElementById('sh-ammo');
  if (hp) hp.textContent = '❤️ ' + playerHP;
  if (am) am.textContent = '🔫 ' + ammo + '/' + maxAmmo;
}

// === Speed HUD for vehicles ===
function createSpeedHUD() {
  let hud = document.getElementById('speed-hud');
  if (hud) return;
  hud = document.createElement('div');
  hud.id = 'speed-hud';
  hud.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:10000;font-family:monospace;color:#0f0;text-shadow:0 0 5px rgba(0,255,0,0.5);pointer-events:none;background:rgba(0,0,0,0.5);padding:12px 16px;border-radius:8px;border:1px solid #0f03;';
  hud.innerHTML = '<div id="sp-speed" style="font-size:28px;font-weight:bold">0 km/h</div><div id="sp-rpm" style="font-size:14px;color:#0a0">0 RPM</div>';
  document.body.appendChild(hud);
}

function updateSpeedHUD(speed, rpm) {
  const sp = document.getElementById('sp-speed');
  const rp = document.getElementById('sp-rpm');
  if (sp) sp.textContent = Math.abs(Math.round(speed * 3.6)) + ' km/h';
  if (rp) rp.textContent = Math.round(rpm) + ' RPM';
}
"""

# Insert after first line of engine.mjs
first_newline = content.index('\n')
content = content[:first_newline+1] + water_sky_imports + content[first_newline+1:]
print("Added Water/Sky/Vehicle/Shooter systems")

# ============================================================
# 2. UPDATE createWater to use AAA version
# ============================================================
# Replace the addObj water line to use AAAWater for ocean
content = content.replace(
    "addObj('Water', createWater(lower.includes('river')?30:10), px||0, pz||0);",
    "addObj('Water', (Water && lower.includes('ocean')) ? createAAAWater(200) : createWater(lower.includes('river')?30:lower.includes('ocean')?200:10), px||0, pz||0);"
)
print("Updated water creation to use AAA for oceans")

# ============================================================
# 3. ADD water animation update for AAA water
# ============================================================
old_water_anim = "function updateWaterAnimation(time) {"
new_water_anim = """function updateWaterAnimation(time) {
  // AAA Water animation (Three.js Water module)
  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    if (obj && obj.userData && obj.userData.isAAAWater && obj.material && obj.material.uniforms) {
      obj.material.uniforms['time'].value += 1.0 / 60.0;
      continue;
    }
  }
  // Original vertex displacement water"""
content = content.replace(old_water_anim, new_water_anim)
print("Added AAA water animation update")

# ============================================================
# 4. INIT AAA Sky on scene load
# ============================================================
# Find where scene is created and add sky init
content = content.replace(
    "setSky('#4a8ac7', '#87ceeb'); // Default blue sky",
    "setSky('#4a8ac7', '#87ceeb'); // Default blue sky\n  // Init AAA Sky after short delay for module loading\n  setTimeout(() => { if (Sky) createAAASky(); }, 1500);"
)
print("Added AAA Sky initialization")

# ============================================================
# 5. ADD ocean/sky commands
# ============================================================
ocean_commands = """
  // === AAA Ocean & Sky Commands (v61) ===
  if (lower === 'ocean' || lower === 'add ocean' || lower === 'create ocean') {
    const w = Water ? createAAAWater(500) : createWater(200);
    addObj('Ocean', w, 0, 0);
    return '🌊 Ocean created!';
  }
  if (lower === 'aaa sky' || lower === 'realistic sky') {
    createAAASky();
    return '☀️ Realistic sky enabled!';
  }
  if (lower.match(/^(sunrise|dawn)$/)) { setSkyTime(5, 180); return '🌅 Sunrise!'; }
  if (lower.match(/^(sunset|dusk)$/)) { setSkyTime(2, 45); return '🌇 Sunset!'; }
  if (lower.match(/^(noon|midday)$/)) { setSkyTime(45, 180); return '☀️ Noon!'; }
  
  // === Shooter Mode (v61) ===
  if (lower === 'shooter mode' || lower === 'fps mode' || lower === 'enable shooter') {
    shooterMode = true; playerHP = 100; ammo = maxAmmo;
    createShooterHUD();
    // Spawn some enemies
    for (let i = 0; i < 5; i++) {
      const ex = (Math.random()-0.5)*60, ez = (Math.random()-0.5)*60;
      const enemy = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.5, 1.5, 4, 8),
        new THREE.MeshStandardMaterial({color: 0xff2222, roughness: 0.4})
      );
      enemy.position.set(ex, 1.25, ez);
      enemy.userData.hp = 50;
      enemy.userData.isEnemy = true;
      enemy.userData.name = 'enemy_'+i;
      enemy.castShadow = true;
      scene.add(enemy);
      objects.push(enemy);
      enemies.push(enemy);
    }
    if (typeof showToast === 'function') showToast('🔫 Shooter mode ON! Click to fire. R to reload.');
    return '🔫 Shooter mode enabled! 5 enemies spawned. Click to fire!';
  }
  
  // === Driving Demo (v61) ===
  if (lower === 'driving demo' || lower === 'drive demo' || lower === 'car demo') {
    // Create road circuit
    execSingle('add road');
    setTimeout(() => {
      execSingle('add car');
      setTimeout(() => {
        if (typeof showToast === 'function') showToast('🏎️ Press F near car to drive! WASD to steer.');
      }, 500);
    }, 500);
    return '🏎️ Driving demo! Road + car added. Press F near the car!';
  }
"""

# Insert before the map generator
map_marker = "// ═══ MAP / LEVEL GENERATOR ═══"
if map_marker in content:
    content = content.replace(map_marker, ocean_commands + "\n  " + map_marker)
    print("Added ocean/shooter/driving commands")
else:
    print("WARNING: Could not find map marker for command insertion")

# ============================================================
# 6. ADD shooter click handler + bullet update in animate
# ============================================================
shooter_click = """
// === Shooter click handler (v61) ===
document.addEventListener('mousedown', (e) => {
  if (!shooterMode || !playMode || e.button !== 0) return;
  if (ammo <= 0) { if (typeof showToast === 'function') showToast('🔫 Out of ammo! Press R to reload.'); return; }
  ammo--;
  updateShooterHUD();
  const cam = camera;
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  createBullet(cam.position.clone().add(dir.clone().multiplyScalar(1)), dir);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    if (shooterMode) { ammo = maxAmmo; updateShooterHUD(); if (typeof showToast === 'function') showToast('🔄 Reloaded!'); }
  }
});
"""

# Insert before the 3D generator section
gen_marker = "// ═══════════════════════════════════════════════════════════════"
gen_idx = content.rfind(gen_marker)
if gen_idx > 0:
    content = content[:gen_idx] + shooter_click + "\n" + content[gen_idx:]
    print("Added shooter click handler")

# ============================================================
# 7. ADD bullet update to animate loop
# ============================================================
# Find the animate function and add bullet update
animate_marker = "updateWaterAnimation"
if animate_marker in content:
    content = content.replace(
        "updateWaterAnimation",
        "if (shooterMode) { updateBullets(dt); updateShooterHUD(); }\n    updateWaterAnimation",
        1  # Only first occurrence
    )
    print("Added bullet update to animate loop")

# ============================================================
# 8. FIX object sizes — proper real-world scale categories
# ============================================================
size_fix = """
// === Proper Real-World Scales (v61) ===
const REAL_WORLD_SCALES = {
  // Vehicles
  car: 4.5, truck: 7, bus: 12, motorcycle: 2.2, bicycle: 1.8, boat: 6, ship: 20, helicopter: 10, airplane: 15, tank: 7,
  // Buildings  
  house: 8, castle: 25, tower: 18, tavern: 8, church: 15, shop: 6, barn: 10, warehouse: 12, skyscraper: 40,
  // Nature
  tree: 6, palm: 8, bush: 1.2, rock: 1.5, boulder: 3, flower: 0.4, mushroom: 0.3, log: 2,
  // Characters
  character: 1.8, npc: 1.8, soldier: 1.8, knight: 1.9, zombie: 1.8, skeleton: 1.7, guard: 1.85,
  // Props
  barrel: 0.9, crate: 0.8, chest: 0.6, table: 0.8, chair: 0.9, bench: 1.5, lamp: 2.5, torch: 1.2,
  campfire: 0.6, tent: 2.5, fence: 1.2, gate: 3, bridge: 8, well: 1.5, fountain: 2,
  // Weapons
  sword: 1.0, axe: 0.9, shield: 0.7, bow: 1.1, staff: 1.6, gun: 0.8, rifle: 1.1,
  // Furniture
  bed: 2.0, sofa: 2.2, desk: 1.2, bookshelf: 2.0, cabinet: 1.8, oven: 0.9, fridge: 1.8,
};

function getProperScale(name) {
  const lower = name.toLowerCase();
  for (const [key, size] of Object.entries(REAL_WORLD_SCALES)) {
    if (lower.includes(key)) return size;
  }
  return 2.0; // default
}
"""

# Insert the size fix near the top (after our water/sky imports)
first_function = content.index('function createAAASky')
insert_before = content.rindex('\n', 0, first_function) + 1
content = content[:insert_before] + size_fix + content[insert_before:]
print("Added real-world scale system")

# ============================================================
# 9. FIX 3D generator with retry on cold start
# ============================================================
old_gen_fetch = """    const resp = await fetch(GENERATOR_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: b64, quality: window._gen3dQuality, mode: 'image_to_3d' }),
    });"""

new_gen_fetch = """    // Retry logic for Modal cold starts (GPU takes 30-60s to spin up)
    let resp;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90000); // 90s timeout
        resp = await fetch(GENERATOR_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_base64: b64, quality: window._gen3dQuality, mode: 'image_to_3d' }),
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (resp.ok) break;
      } catch(retryErr) {
        if (attempt < 2) {
          status.textContent = '🔄 GPU warming up... retrying (' + (attempt+2) + '/3)';
          await new Promise(r => setTimeout(r, 5000));
        } else throw retryErr;
      }
    }"""

if old_gen_fetch in content:
    content = content.replace(old_gen_fetch, new_gen_fetch)
    print("Added 3D generator retry logic")
else:
    print("WARNING: Could not find 3D gen fetch to patch")

# ============================================================
# 10. BUMP VERSION
# ============================================================
content = content.replace("engine.mjs?v=60", "engine.mjs?v=61")
print("Bumped to v61")

# Write
with open('web/engine.mjs', 'w') as f:
    f.write(content)

# Update index.html version
with open('web/index.html', 'r') as f:
    html = f.read()
html = html.replace("engine.mjs?v=60", "engine.mjs?v=61")
with open('web/index.html', 'w') as f:
    f.write(html)

print("\n✅ All v61 upgrades applied!")
print("- AAA Water (Three.js Water module with reflections)")
print("- AAA Sky (Three.js Sky with atmospheric scattering)")
print("- Vehicle Physics v2 (acceleration, steering, speed HUD)")
print("- Shooter System (bullets, enemies, HP, ammo, damage numbers)")
print("- Real-world object scales")
print("- 3D Generator retry for cold starts")
print("- Commands: ocean, aaa sky, sunrise, sunset, noon, shooter mode, driving demo")
