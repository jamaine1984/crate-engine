// ═══════════════════════════════════════════════════════════════
// CRATE ENGINE — CODE EDITOR
// Full custom scripting system: templates, live editor, console
// ═══════════════════════════════════════════════════════════════

// ── Script Templates ────────────────────────────────────────────
const TEMPLATES = [
  {
    name: 'Coin Collector',
    icon: '🪙',
    desc: 'Spinning coins that give points when touched',
    code: `// Coin Collector — coins spin and give points on pickup
state.score = state.score || 0;

onUpdate = function(dt) {
  const player = getPlayer();
  if (!player) return;

  getObjects().forEach(obj => {
    const n = (obj.userData.name || '').toLowerCase();
    if (!n.includes('coin') && !n.includes('gold')) return;

    // Spin the coin
    obj.rotation.y += dt * 3;

    // Check pickup distance
    if (player.position.distanceTo(obj.position) < 2) {
      state.score += 10;
      showToast('+10 coins! Total: ' + state.score);
      scene.remove(obj);
    }
  });
};`
  },
  {
    name: 'Enemy Patrol AI',
    icon: '👾',
    desc: 'NPCs patrol between waypoints and chase the player',
    code: `// Enemy Patrol — NPCs walk between points, chase player if close
state.waypoints = state.waypoints || [];

onUpdate = function(dt) {
  const player = getPlayer();
  if (!player) return;

  getNPCs().forEach(npc => {
    if (!npc.model || npc.isDead) return;
    const dist = player.position.distanceTo(npc.model.position);

    if (dist < 15) {
      // Chase player
      const dir = player.position.clone().sub(npc.model.position).normalize();
      npc.model.position.add(dir.multiplyScalar(dt * 4));
      npc.model.lookAt(player.position);
    } else {
      // Patrol: slow random walk
      npc.model.position.x += Math.sin(performance.now() * 0.001 + npc.model.id) * dt * 2;
      npc.model.position.z += Math.cos(performance.now() * 0.0007 + npc.model.id) * dt * 2;
    }
  });
};`
  },
  {
    name: 'Day/Night Cycle',
    icon: '🌅',
    desc: 'Smooth sun movement with color transitions',
    code: `// Day/Night Cycle — sun orbits, sky colors change
state.timeOfDay = state.timeOfDay || 0;

onUpdate = function(dt) {
  state.timeOfDay += dt * 0.02; // Full cycle every ~300s
  const t = state.timeOfDay % 1;
  const elevation = Math.sin(t * Math.PI) * 60 + 5; // 5-65 degrees
  const azimuth = t * 360;

  if (window._engineBridge && window._engineBridge.setSkyTime) {
    window._engineBridge.setSkyTime(elevation, azimuth);
  }
};`
  },
  {
    name: 'Physics Playground',
    icon: '🧱',
    desc: 'Add physics to all objects, press Space to launch them',
    code: `// Physics Playground — everything falls! Press F to launch selected object
const phys = window._physics;
if (!phys) { showToast('Loading physics...'); }

(async () => {
  if (!phys) return;
  await phys.init();

  // Make all GLB objects physical
  getObjects().forEach(obj => {
    if (obj.userData.isGLB && !obj.userData.hasPhysics) {
      phys.addRigidbody(obj, 'dynamic');
    }
  });
  showToast('Physics active on ' + phys.bodyCount() + ' objects!');
})();

onKeyPress = function(key) {
  if (key === 'f') {
    const sel = getObjects().find(o => o.userData.hasPhysics);
    if (sel && phys) {
      phys.applyImpulse(sel, 0, 25, 0);
      showToast('Launched ' + (sel.userData.name || 'object') + '!');
    }
  }
};`
  },
  {
    name: 'Score & Health HUD',
    icon: '❤️',
    desc: 'Custom HUD showing score, health, and level',
    code: `// Custom HUD — score, health bar, level display
state.score = state.score || 0;
state.health = state.health || 100;
state.level = state.level || 1;

// Create HUD element
let hud = document.getElementById('custom-hud');
if (!hud) {
  hud = document.createElement('div');
  hud.id = 'custom-hud';
  hud.style.cssText = 'position:fixed;top:60px;left:16px;z-index:500;font-family:monospace;font-size:14px;color:#fff;pointer-events:none;';
  document.body.appendChild(hud);
}

onUpdate = function(dt) {
  // Slowly regen health
  state.health = Math.min(100, state.health + dt * 2);

  const hpColor = state.health > 60 ? '#4ade80' : state.health > 30 ? '#f59e0b' : '#ef4444';
  const hpBar = '█'.repeat(Math.floor(state.health / 5)) + '░'.repeat(20 - Math.floor(state.health / 5));

  hud.innerHTML =
    '<div style="background:rgba(0,0,0,0.6);padding:8px 12px;border-radius:8px;border:1px solid #333">' +
    '<div>⭐ Score: <span style="color:#f7c948">' + state.score + '</span></div>' +
    '<div>❤️ HP: <span style="color:' + hpColor + '">' + hpBar + ' ' + Math.floor(state.health) + '</span></div>' +
    '<div>🏆 Level: <span style="color:#60a5fa">' + state.level + '</span></div>' +
    '</div>';
};`
  },
  {
    name: 'Teleport Portals',
    icon: '🌀',
    desc: 'Create glowing portals that teleport the player',
    code: `// Teleport Portals — walk into a glowing ring to teleport
state.portals = state.portals || [];

// Create two portals if none exist
if (state.portals.length === 0) {
  const portalGeo = new THREE.TorusGeometry(1.5, 0.15, 8, 32);

  const p1 = new THREE.Mesh(portalGeo, new THREE.MeshStandardMaterial({
    color: 0x4a9eff, emissive: 0x2244ff, emissiveIntensity: 2
  }));
  p1.position.set(5, 2, 5);
  p1.userData.name = 'portal_blue';
  scene.add(p1);

  const p2 = new THREE.Mesh(portalGeo, new THREE.MeshStandardMaterial({
    color: 0xff6b35, emissive: 0xff4400, emissiveIntensity: 2
  }));
  p2.position.set(-20, 2, -20);
  p2.userData.name = 'portal_orange';
  scene.add(p2);

  state.portals = [p1, p2];
  state.cooldown = 0;
  showToast('Two portals created! Walk into one to teleport.');
}

onUpdate = function(dt) {
  const player = getPlayer();
  if (!player || state.cooldown > 0) { state.cooldown -= dt; return; }

  // Rotate portals
  state.portals.forEach(p => p.rotation.z += dt * 2);

  // Check teleport
  for (let i = 0; i < state.portals.length; i++) {
    if (player.position.distanceTo(state.portals[i].position) < 2.5) {
      const target = state.portals[(i + 1) % state.portals.length];
      player.position.copy(target.position).add(new THREE.Vector3(3, 0, 0));
      state.cooldown = 2;
      showToast('Teleported!');
      break;
    }
  }
};`
  },
  {
    name: 'Racing Checkpoints',
    icon: '🏁',
    desc: 'Timed checkpoint race with lap counter',
    code: `// Racing Checkpoints — race through rings, lap timer
state.checkpoints = state.checkpoints || [];
state.currentCP = state.currentCP || 0;
state.lapTime = state.lapTime || 0;
state.bestTime = state.bestTime || Infinity;
state.laps = state.laps || 0;

// Create checkpoints in a loop
if (state.checkpoints.length === 0) {
  const positions = [[0,0], [20,10], [30,30], [10,40], [-10,30], [-15,10]];
  positions.forEach(([x,z], i) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3, 0.2, 8, 32),
      new THREE.MeshStandardMaterial({ color: i === 0 ? 0x4ade80 : 0xf7c948, emissive: i === 0 ? 0x228833 : 0x886600, emissiveIntensity: 1 })
    );
    ring.position.set(x, 3, z);
    ring.userData.name = 'checkpoint_' + i;
    scene.add(ring);
    state.checkpoints.push(ring);
  });
  showToast('Race! Pass through all ' + positions.length + ' checkpoints.');
}

onUpdate = function(dt) {
  const player = getPlayer();
  if (!player) return;
  state.lapTime += dt;

  // Rotate current checkpoint
  const cp = state.checkpoints[state.currentCP];
  if (cp) cp.rotation.y += dt * 3;

  // Check if player hit current checkpoint
  if (cp && player.position.distanceTo(cp.position) < 4) {
    state.currentCP++;
    if (state.currentCP >= state.checkpoints.length) {
      state.laps++;
      if (state.lapTime < state.bestTime) state.bestTime = state.lapTime;
      showToast('Lap ' + state.laps + '! Time: ' + state.lapTime.toFixed(1) + 's (Best: ' + state.bestTime.toFixed(1) + 's)');
      state.currentCP = 0;
      state.lapTime = 0;
    } else {
      showToast('Checkpoint ' + state.currentCP + '/' + state.checkpoints.length);
    }
  }
};`
  },
  {
    name: 'Power-Up System',
    icon: '⚡',
    desc: 'Collectible power-ups: speed boost, jump boost, shield',
    code: `// Power-Ups — collect glowing orbs for temporary buffs
state.activeBuffs = state.activeBuffs || {};
state.orbsSpawned = state.orbsSpawned || false;

if (!state.orbsSpawned) {
  const types = [
    { name: 'speed_orb', color: 0x4a9eff, buff: 'speed', label: 'Speed Boost' },
    { name: 'jump_orb', color: 0x4ade80, buff: 'jump', label: 'Jump Boost' },
    { name: 'shield_orb', color: 0xf7c948, buff: 'shield', label: 'Shield' },
  ];
  types.forEach(t => {
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 16, 16),
      new THREE.MeshStandardMaterial({ color: t.color, emissive: t.color, emissiveIntensity: 0.8, transparent: true, opacity: 0.8 })
    );
    orb.position.set(Math.random() * 30 - 15, 1.5, Math.random() * 30 - 15);
    orb.userData.name = t.name;
    orb.userData.buff = t.buff;
    orb.userData.label = t.label;
    scene.add(orb);
  });
  state.orbsSpawned = true;
  showToast('3 power-up orbs spawned! Collect them.');
}

onUpdate = function(dt) {
  const player = getPlayer();
  if (!player) return;

  // Animate and check orbs
  getObjects().forEach(obj => {
    if (!(obj.userData.name || '').includes('_orb')) return;
    obj.position.y = 1.5 + Math.sin(performance.now() * 0.003) * 0.3;
    obj.rotation.y += dt * 2;

    if (player.position.distanceTo(obj.position) < 2) {
      state.activeBuffs[obj.userData.buff] = 5; // 5 seconds
      showToast('⚡ ' + obj.userData.label + ' (5s)');
      scene.remove(obj);
    }
  });

  // Tick down buffs
  for (const [buff, time] of Object.entries(state.activeBuffs)) {
    state.activeBuffs[buff] -= dt;
    if (state.activeBuffs[buff] <= 0) delete state.activeBuffs[buff];
  }
};`
  },

  // ─── NEW TEMPLATES (9-50) ────────────────────────────────────

  // ── Gameplay (9-18) ──────────────────────────────────────────
  {
    name: 'Inventory System',
    icon: '🎒',
    desc: 'Press 1-5 to switch slots, E to pickup nearby objects',
    code: `// Inventory System — 5 slots, press 1-5 to select, E to pick up
state.inventory = state.inventory || [null, null, null, null, null];
state.activeSlot = state.activeSlot || 0;

let invHud = document.getElementById('inv-hud');
if (!invHud) {
  invHud = document.createElement('div');
  invHud.id = 'inv-hud';
  invHud.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:500;display:flex;gap:4px;pointer-events:none;';
  document.body.appendChild(invHud);
}

function renderInventory() {
  invHud.innerHTML = state.inventory.map((item, i) => {
    const active = i === state.activeSlot;
    const border = active ? '2px solid #4ade80' : '2px solid #333';
    const bg = active ? 'rgba(74,222,128,0.15)' : 'rgba(0,0,0,0.7)';
    const label = item ? item.substring(0, 6) : '';
    return '<div style="width:50px;height:50px;background:' + bg + ';border:' + border + ';border-radius:8px;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:monospace;font-size:10px;color:#fff">' +
      '<div style="color:#888;font-size:9px">' + (i + 1) + '</div>' +
      '<div>' + label + '</div></div>';
  }).join('');
}
renderInventory();

onKeyPress = function(key) {
  if (key >= '1' && key <= '5') {
    state.activeSlot = parseInt(key) - 1;
    showToast('Slot ' + key + ': ' + (state.inventory[state.activeSlot] || 'empty'));
    renderInventory();
  }
  if (key === 'e') {
    const player = getPlayer();
    if (!player) return;
    let closest = null, closestDist = 3;
    getObjects().forEach(obj => {
      if (!obj.userData.name) return;
      const d = player.position.distanceTo(obj.position);
      if (d < closestDist) { closest = obj; closestDist = d; }
    });
    if (closest) {
      state.inventory[state.activeSlot] = closest.userData.name;
      scene.remove(closest);
      showToast('Picked up: ' + closest.userData.name);
      renderInventory();
    } else {
      showToast('Nothing nearby to pick up');
    }
  }
};

onUpdate = function(dt) { renderInventory(); };`
  },
  {
    name: 'Quest Tracker',
    icon: '📜',
    desc: 'HUD showing kill/collect quests with progress bars',
    code: `// Quest Tracker — kill and collect quests with progress HUD
state.quests = state.quests || [
  { type: 'kill', label: 'Defeat enemies', current: 0, target: 5, done: false },
  { type: 'collect', label: 'Collect gems', current: 0, target: 10, done: false },
  { type: 'explore', label: 'Visit waypoints', current: 0, target: 3, done: false }
];

let questHud = document.getElementById('quest-hud');
if (!questHud) {
  questHud = document.createElement('div');
  questHud.id = 'quest-hud';
  questHud.style.cssText = 'position:fixed;top:60px;right:500px;z-index:500;font-family:monospace;font-size:12px;color:#fff;pointer-events:none;width:220px;';
  document.body.appendChild(questHud);
}

function renderQuests() {
  questHud.innerHTML = '<div style="background:rgba(0,0,0,0.7);padding:10px;border-radius:8px;border:1px solid #333">' +
    '<div style="color:#f7c948;font-weight:bold;margin-bottom:6px">Active Quests</div>' +
    state.quests.map(q => {
      const pct = Math.min(100, (q.current / q.target) * 100);
      const color = q.done ? '#4ade80' : '#60a5fa';
      return '<div style="margin-bottom:6px">' +
        '<div>' + (q.done ? '✅' : '⬜') + ' ' + q.label + ' (' + q.current + '/' + q.target + ')</div>' +
        '<div style="background:#222;border-radius:4px;height:6px;margin-top:2px">' +
        '<div style="background:' + color + ';height:100%;border-radius:4px;width:' + pct + '%"></div></div></div>';
    }).join('') + '</div>';
}

onUpdate = function(dt) {
  const npcs = getNPCs();
  state.quests[0].current = npcs.filter(n => n.isDead).length;
  state.quests[0].done = state.quests[0].current >= state.quests[0].target;
  state.quests.forEach(q => { if (q.current >= q.target) q.done = true; });
  renderQuests();
};

showToast('Quest tracker active! Complete all quests.');`
  },
  {
    name: 'Loot Drops',
    icon: '💎',
    desc: 'Enemies drop random loot when killed (gems, potions)',
    code: `// Loot Drops — dead NPCs drop random loot items
state.droppedLoot = state.droppedLoot || {};
state.lootCollected = state.lootCollected || 0;
const lootTypes = [
  { name: 'gem', color: 0xff44aa, label: 'Ruby Gem', value: 25 },
  { name: 'potion', color: 0x44ff44, label: 'Health Potion', value: 10 },
  { name: 'coin_drop', color: 0xffcc00, label: 'Gold Coin', value: 5 },
  { name: 'diamond', color: 0x44ffff, label: 'Diamond', value: 50 }
];

function spawnLoot(pos) {
  const type = lootTypes[Math.floor(Math.random() * lootTypes.length)];
  const loot = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.3, 0),
    new THREE.MeshStandardMaterial({ color: type.color, emissive: type.color, emissiveIntensity: 0.6 })
  );
  loot.position.set(pos.x + (Math.random() - 0.5) * 2, 0.5, pos.z + (Math.random() - 0.5) * 2);
  loot.userData.name = 'loot_' + Date.now() + '_' + Math.random();
  loot.userData.lootType = type;
  scene.add(loot);
}

onUpdate = function(dt) {
  const player = getPlayer();
  if (!player) return;

  getNPCs().forEach(npc => {
    if (npc.isDead && npc.model && !state.droppedLoot[npc.model.id]) {
      state.droppedLoot[npc.model.id] = true;
      spawnLoot(npc.model.position);
      spawnLoot(npc.model.position);
    }
  });

  getObjects().forEach(obj => {
    if (!obj.userData.lootType) return;
    obj.rotation.y += dt * 3;
    obj.position.y = 0.5 + Math.sin(performance.now() * 0.004) * 0.2;
    if (player.position.distanceTo(obj.position) < 2) {
      state.lootCollected += obj.userData.lootType.value;
      showToast('+' + obj.userData.lootType.value + ' ' + obj.userData.lootType.label + '! Total: ' + state.lootCollected);
      scene.remove(obj);
    }
  });
};

showToast('Loot system active! Defeat enemies for drops.');`
  },
  {
    name: 'Wave Survival',
    icon: '🧟',
    desc: 'Waves of enemies spawn, wave counter + kill counter',
    code: `// Wave Survival — enemies spawn in waves, track kills
state.wave = state.wave || 1;
state.kills = state.kills || 0;
state.enemiesThisWave = state.enemiesThisWave || 0;
state.waveSpawned = state.waveSpawned || false;
state.waveDelay = state.waveDelay || 0;

let waveHud = document.getElementById('wave-hud');
if (!waveHud) {
  waveHud = document.createElement('div');
  waveHud.id = 'wave-hud';
  waveHud.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:500;font-family:monospace;font-size:16px;color:#fff;pointer-events:none;text-align:center;';
  document.body.appendChild(waveHud);
}

function spawnWave() {
  const count = state.wave * 2 + 1;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const dist = 15 + state.wave * 3;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const enemy = new THREE.Mesh(
      new THREE.BoxGeometry(1, 2, 1),
      new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0x660000, emissiveIntensity: 0.4 })
    );
    enemy.position.set(x, 1, z);
    enemy.userData.name = 'wave_enemy_' + state.wave + '_' + i;
    enemy.userData.isEnemy = true;
    enemy.userData.health = 1;
    scene.add(enemy);
  }
  state.enemiesThisWave = count;
  state.waveSpawned = true;
  showToast('Wave ' + state.wave + ' — ' + count + ' enemies!');
}

if (!state.waveSpawned) spawnWave();

onUpdate = function(dt) {
  const player = getPlayer();
  if (!player) return;
  const alive = getObjects().filter(o => o.userData.isEnemy);

  alive.forEach(e => {
    const dir = player.position.clone().sub(e.position).normalize();
    e.position.add(dir.multiplyScalar(dt * 2));
    if (player.position.distanceTo(e.position) < 1.5) {
      scene.remove(e);
      state.kills++;
    }
  });

  if (alive.length === 0 && state.waveSpawned) {
    state.waveDelay += dt;
    if (state.waveDelay > 3) {
      state.wave++;
      state.waveDelay = 0;
      state.waveSpawned = false;
      spawnWave();
    }
  }

  waveHud.innerHTML = '<div style="background:rgba(0,0,0,0.7);padding:8px 16px;border-radius:8px;border:1px solid #ff3333">' +
    'Wave ' + state.wave + ' | Kills: ' + state.kills + ' | Remaining: ' + alive.length + '</div>';
};`
  },
  {
    name: 'Stealth System',
    icon: '🥷',
    desc: 'NPCs have vision cones, detection meter',
    code: `// Stealth System — NPCs detect you with vision cones
state.detection = state.detection || 0;
state.detected = state.detected || false;

let stealthHud = document.getElementById('stealth-hud');
if (!stealthHud) {
  stealthHud = document.createElement('div');
  stealthHud.id = 'stealth-hud';
  stealthHud.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:500;font-family:monospace;font-size:14px;color:#fff;pointer-events:none;';
  document.body.appendChild(stealthHud);
}

onUpdate = function(dt) {
  const player = getPlayer();
  if (!player) return;
  let maxThreat = 0;

  getNPCs().forEach(npc => {
    if (!npc.model || npc.isDead) return;
    const dist = player.position.distanceTo(npc.model.position);
    if (dist > 20) return;

    const toPlayer = player.position.clone().sub(npc.model.position).normalize();
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(npc.model.quaternion);
    const dot = forward.dot(toPlayer);

    // Vision cone: ~90 degrees forward, closer = more detected
    if (dot > 0.5 && dist < 15) {
      const threat = (1 - dist / 15) * (dot - 0.5) * 4;
      maxThreat = Math.max(maxThreat, threat);
    }
  });

  if (maxThreat > 0) {
    state.detection = Math.min(100, state.detection + maxThreat * dt * 40);
  } else {
    state.detection = Math.max(0, state.detection - dt * 15);
  }

  state.detected = state.detection >= 100;
  const color = state.detection > 70 ? '#ef4444' : state.detection > 30 ? '#f59e0b' : '#4ade80';
  const status = state.detected ? 'DETECTED!' : state.detection > 30 ? 'CAUTION' : 'Hidden';
  const bar = '█'.repeat(Math.floor(state.detection / 5)) + '░'.repeat(20 - Math.floor(state.detection / 5));

  stealthHud.innerHTML = '<div style="background:rgba(0,0,0,0.7);padding:8px 16px;border-radius:8px;border:1px solid ' + color + '">' +
    '<div style="color:' + color + '">' + status + '</div>' +
    '<div style="color:' + color + '">' + bar + ' ' + Math.floor(state.detection) + '%</div></div>';
};

showToast('Stealth mode! Stay out of NPC vision cones.');`
  },
  {
    name: 'Fishing Mini-game',
    icon: '🎣',
    desc: 'Press F near water, timing-based catch mechanic',
    code: `// Fishing Mini-game — press F to cast, time your catch
state.fishing = state.fishing || false;
state.castTime = state.castTime || 0;
state.biteTime = state.biteTime || 0;
state.caught = state.caught || 0;
state.fishPhase = state.fishPhase || 'idle';

const fishTypes = ['Trout', 'Bass', 'Salmon', 'Catfish', 'Goldfish', 'Swordfish'];

let fishHud = document.getElementById('fish-hud');
if (!fishHud) {
  fishHud = document.createElement('div');
  fishHud.id = 'fish-hud';
  fishHud.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:500;font-family:monospace;font-size:14px;color:#fff;pointer-events:none;text-align:center;';
  document.body.appendChild(fishHud);
}

onKeyPress = function(key) {
  if (key === 'f') {
    if (state.fishPhase === 'idle') {
      state.fishPhase = 'casting';
      state.castTime = 0;
      state.biteTime = 2 + Math.random() * 4;
      showToast('Casting line...');
    } else if (state.fishPhase === 'bite') {
      state.caught++;
      const fish = fishTypes[Math.floor(Math.random() * fishTypes.length)];
      showToast('Caught a ' + fish + '! Total: ' + state.caught);
      state.fishPhase = 'idle';
    } else if (state.fishPhase === 'casting') {
      showToast('Wait for a bite!');
    }
  }
};

onUpdate = function(dt) {
  if (state.fishPhase === 'casting') {
    state.castTime += dt;
    if (state.castTime >= state.biteTime) {
      state.fishPhase = 'bite';
      state.castTime = 0;
    }
    fishHud.innerHTML = '<div style="background:rgba(0,0,0,0.7);padding:8px 16px;border-radius:8px">Waiting for bite...</div>';
  } else if (state.fishPhase === 'bite') {
    state.castTime += dt;
    const flash = Math.sin(performance.now() * 0.01) > 0;
    fishHud.innerHTML = '<div style="background:rgba(0,0,0,0.7);padding:8px 16px;border-radius:8px;border:2px solid ' + (flash ? '#f7c948' : '#333') + '">BITE! Press F NOW!</div>';
    if (state.castTime > 2) {
      showToast('Too slow! The fish got away.');
      state.fishPhase = 'idle';
    }
  } else {
    fishHud.innerHTML = '<div style="background:rgba(0,0,0,0.5);padding:6px 12px;border-radius:8px">Press F to fish | Caught: ' + state.caught + '</div>';
  }
};

showToast('Fishing ready! Press F to cast your line.');`
  },
  {
    name: 'Treasure Hunt',
    icon: '🗺️',
    desc: 'Compass arrow points to hidden treasure, hot/cold indicator',
    code: `// Treasure Hunt — compass points to hidden treasure
state.treasurePos = state.treasurePos || {
  x: (Math.random() - 0.5) * 80,
  z: (Math.random() - 0.5) * 80
};
state.treasuresFound = state.treasuresFound || 0;

let compassHud = document.getElementById('compass-hud');
if (!compassHud) {
  compassHud = document.createElement('div');
  compassHud.id = 'compass-hud';
  compassHud.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:500;font-family:monospace;font-size:14px;color:#fff;pointer-events:none;text-align:center;';
  document.body.appendChild(compassHud);
}

// Place a hidden marker
const marker = new THREE.Mesh(
  new THREE.CylinderGeometry(0.3, 0.3, 0.1, 16),
  new THREE.MeshStandardMaterial({ color: 0xf7c948, emissive: 0xf7c948, emissiveIntensity: 0.5 })
);
marker.position.set(state.treasurePos.x, 0.05, state.treasurePos.z);
marker.userData.name = 'treasure_marker';
scene.add(marker);

onUpdate = function(dt) {
  const player = getPlayer();
  if (!player) return;

  const dx = state.treasurePos.x - player.position.x;
  const dz = state.treasurePos.z - player.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz) * (180 / Math.PI);

  const arrows = ['↑','↗','→','↘','↓','↙','←','↖'];
  const idx = Math.round(((angle + 360) % 360) / 45) % 8;

  let temp, color;
  if (dist < 3) { temp = 'BURNING HOT'; color = '#ef4444'; }
  else if (dist < 8) { temp = 'Very Hot'; color = '#f97316'; }
  else if (dist < 15) { temp = 'Warm'; color = '#f59e0b'; }
  else if (dist < 30) { temp = 'Cool'; color = '#60a5fa'; }
  else { temp = 'Freezing'; color = '#3b82f6'; }

  compassHud.innerHTML = '<div style="background:rgba(0,0,0,0.7);padding:8px 16px;border-radius:8px;border:1px solid ' + color + '">' +
    '<div style="font-size:24px">' + arrows[idx] + '</div>' +
    '<div style="color:' + color + '">' + temp + ' (' + Math.floor(dist) + 'm)</div>' +
    '<div>Found: ' + state.treasuresFound + '</div></div>';

  if (dist < 2) {
    state.treasuresFound++;
    state.treasurePos = { x: (Math.random() - 0.5) * 80, z: (Math.random() - 0.5) * 80 };
    marker.position.set(state.treasurePos.x, 0.05, state.treasurePos.z);
    showToast('Treasure found! #' + state.treasuresFound + ' — next one spawned!');
  }
};

showToast('Treasure hidden! Follow the compass arrow.');`
  },
  {
    name: 'Platformer Mode',
    icon: '🏃',
    desc: 'Spawn floating platforms, double-jump, fall detection',
    code: `// Platformer Mode — floating platforms, double jump, fall reset
state.platformsSpawned = state.platformsSpawned || false;
state.jumps = state.jumps || 0;
state.maxJumps = 2;
state.onGround = state.onGround || false;

if (!state.platformsSpawned) {
  const colors = [0x4ade80, 0x60a5fa, 0xf7c948, 0xff6b6b, 0xc084fc];
  for (let i = 0; i < 12; i++) {
    const w = 2 + Math.random() * 3;
    const plat = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.4, w),
      new THREE.MeshStandardMaterial({ color: colors[i % colors.length] })
    );
    plat.position.set(
      (Math.random() - 0.5) * 40,
      2 + i * 2.5 + Math.random() * 2,
      (Math.random() - 0.5) * 40
    );
    plat.userData.name = 'platform_' + i;
    plat.userData.isPlatform = true;
    scene.add(plat);
  }
  state.platformsSpawned = true;
  showToast('Platformer! 12 platforms spawned. Double-jump with Space.');
}

onKeyPress = function(key) {
  if (key === ' ') {
    const player = getPlayer();
    if (!player) return;
    if (state.jumps < state.maxJumps) {
      state.jumps++;
      if (player.velocity) player.velocity.y = 8;
      if (state.jumps === 2) showToast('Double jump!');
    }
  }
};

onUpdate = function(dt) {
  const player = getPlayer();
  if (!player) return;

  // Animate platforms with gentle bob
  getObjects().forEach(obj => {
    if (!obj.userData.isPlatform) return;
    obj.position.y += Math.sin(performance.now() * 0.001 + obj.position.x) * dt * 0.3;
  });

  // Reset jump count when landing
  if (player.position && player.position.y < 1.5) {
    state.jumps = 0;
  }

  // Fall detection — reset if too low
  if (player.position && player.position.y < -20) {
    player.position.set(0, 5, 0);
    showToast('Fell! Respawning...');
    state.jumps = 0;
  }
};`
  },
  {
    name: 'Tower Defense',
    icon: '🏰',
    desc: 'Enemies walk a path, click to place turrets that auto-shoot',
    code: `// Tower Defense — enemies follow path, place turrets with T key
state.turrets = state.turrets || [];
state.tdEnemies = state.tdEnemies || [];
state.gold = state.gold || 100;
state.tdWave = state.tdWave || 0;
state.spawnTimer = state.spawnTimer || 0;

const path = [{x:30,z:0},{x:15,z:0},{x:15,z:15},{x:-15,z:15},{x:-15,z:-15},{x:-30,z:-15}];

let tdHud = document.getElementById('td-hud');
if (!tdHud) {
  tdHud = document.createElement('div');
  tdHud.id = 'td-hud';
  tdHud.style.cssText = 'position:fixed;top:60px;left:16px;z-index:500;font-family:monospace;font-size:13px;color:#fff;pointer-events:none;';
  document.body.appendChild(tdHud);
}

onKeyPress = function(key) {
  if (key === 't') {
    const player = getPlayer();
    if (!player) return;
    if (state.gold < 25) { showToast('Not enough gold! Need 25'); return; }
    state.gold -= 25;
    const turret = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.6, 1.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x60a5fa, emissive: 0x2244aa, emissiveIntensity: 0.4 })
    );
    turret.position.copy(player.position).setY(0.75);
    turret.userData.name = 'turret_' + Date.now();
    turret.userData.isTurret = true;
    turret.userData.cooldown = 0;
    scene.add(turret);
    state.turrets.push(turret);
    showToast('Turret placed! (-25 gold)');
  }
};

onUpdate = function(dt) {
  state.spawnTimer += dt;
  if (state.spawnTimer > 3) {
    state.spawnTimer = 0;
    const e = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xff4444 })
    );
    e.position.set(path[0].x, 0.5, path[0].z);
    e.userData.name = 'td_enemy_' + Date.now();
    e.userData.pathIdx = 0;
    e.userData.hp = 3;
    e.userData.isTdEnemy = true;
    scene.add(e);
  }

  // Move enemies along path
  getObjects().forEach(obj => {
    if (!obj.userData.isTdEnemy) return;
    const target = path[obj.userData.pathIdx + 1];
    if (!target) { scene.remove(obj); return; }
    const dx = target.x - obj.position.x, dz = target.z - obj.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 1) { obj.userData.pathIdx++; }
    else { obj.position.x += (dx / dist) * dt * 4; obj.position.z += (dz / dist) * dt * 4; }
  });

  // Turret shooting
  state.turrets.forEach(t => {
    if (!t.parent) return;
    t.userData.cooldown -= dt;
    if (t.userData.cooldown > 0) return;
    const enemies = getObjects().filter(o => o.userData.isTdEnemy);
    let closest = null, cd = 10;
    enemies.forEach(e => { const d = t.position.distanceTo(e.position); if (d < cd) { cd = d; closest = e; } });
    if (closest) {
      t.userData.cooldown = 1;
      closest.userData.hp--;
      if (closest.userData.hp <= 0) { scene.remove(closest); state.gold += 10; }
    }
  });

  tdHud.innerHTML = '<div style="background:rgba(0,0,0,0.7);padding:8px 12px;border-radius:8px">Gold: ' + state.gold + ' | Turrets: ' + state.turrets.length + ' | Press T to build (25g)</div>';
};

showToast('Tower Defense! Press T near the path to place turrets.');`
  },
  {
    name: 'Survival Stats',
    icon: '🍖',
    desc: 'Hunger/thirst/stamina bars that drain over time',
    code: `// Survival Stats — hunger, thirst, stamina drain over time
state.hunger = state.hunger !== undefined ? state.hunger : 100;
state.thirst = state.thirst !== undefined ? state.thirst : 100;
state.stamina = state.stamina !== undefined ? state.stamina : 100;
state.alive = state.alive !== undefined ? state.alive : true;

let survHud = document.getElementById('surv-hud');
if (!survHud) {
  survHud = document.createElement('div');
  survHud.id = 'surv-hud';
  survHud.style.cssText = 'position:fixed;top:60px;left:16px;z-index:500;font-family:monospace;font-size:12px;color:#fff;pointer-events:none;width:200px;';
  document.body.appendChild(survHud);
}

function bar(label, value, color) {
  const w = Math.max(0, Math.min(100, value));
  return '<div style="margin-bottom:4px"><div>' + label + ': ' + Math.floor(w) + '</div>' +
    '<div style="background:#222;border-radius:3px;height:8px"><div style="background:' + color + ';height:100%;border-radius:3px;width:' + w + '%"></div></div></div>';
}

onKeyPress = function(key) {
  if (key === 'h') { state.hunger = Math.min(100, state.hunger + 30); showToast('Ate food! +30 hunger'); }
  if (key === 'j') { state.thirst = Math.min(100, state.thirst + 30); showToast('Drank water! +30 thirst'); }
};

onUpdate = function(dt) {
  if (!state.alive) return;
  state.hunger = Math.max(0, state.hunger - dt * 1.5);
  state.thirst = Math.max(0, state.thirst - dt * 2);
  state.stamina = state.hunger > 20 && state.thirst > 20
    ? Math.min(100, state.stamina + dt * 5)
    : Math.max(0, state.stamina - dt * 3);

  if (state.hunger <= 0 && state.thirst <= 0) {
    state.alive = false;
    showToast('You perished! Refresh to restart.');
  }

  survHud.innerHTML = '<div style="background:rgba(0,0,0,0.7);padding:8px 12px;border-radius:8px;border:1px solid #333">' +
    bar('Hunger', state.hunger, '#f97316') +
    bar('Thirst', state.thirst, '#3b82f6') +
    bar('Stamina', state.stamina, '#4ade80') +
    '<div style="color:#888;font-size:10px;margin-top:4px">H=eat J=drink</div></div>';
};

showToast('Survival active! Press H to eat, J to drink.');`
  },

  // ── Physics (19-25) ──────────────────────────────────────────
  {
    name: 'Bowling Alley',
    icon: '🎳',
    desc: 'Spawn pins + ball, press space to roll',
    code: `// Bowling Alley — spawn pins and ball, press space to roll
state.bowlingReady = state.bowlingReady || false;
state.score = state.score || 0;

if (!state.bowlingReady) {
  // Create ball
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x2244ff })
  );
  ball.position.set(0, 0.4, -10);
  ball.userData.name = 'bowling_ball';
  scene.add(ball);

  // Create pins in triangle formation
  const rows = 4;
  let pinId = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= r; c++) {
      const pin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.2, 1, 8),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      );
      pin.position.set((c - r / 2) * 0.8, 0.5, r * 0.8);
      pin.userData.name = 'pin_' + pinId++;
      pin.userData.isPin = true;
      pin.userData.standing = true;
      scene.add(pin);
    }
  }
  state.bowlingReady = true;
  state.rolling = false;
  showToast('Bowling! Press Space to roll the ball.');
}

onKeyPress = function(key) {
  if (key === ' ' && !state.rolling) {
    state.rolling = true;
    showToast('Rolling!');
  }
};

onUpdate = function(dt) {
  const ball = getObjectByName('bowling_ball');
  if (!ball) return;

  if (state.rolling) {
    ball.position.z += dt * 12;

    getObjects().forEach(obj => {
      if (!obj.userData.isPin || !obj.userData.standing) return;
      if (ball.position.distanceTo(obj.position) < 0.8) {
        obj.userData.standing = false;
        obj.rotation.x = Math.PI / 2;
        obj.position.y = 0.15;
        state.score++;
        showToast('Pin down! Score: ' + state.score);
      }
    });

    if (ball.position.z > 10) {
      ball.position.set(0, 0.4, -10);
      state.rolling = false;
      showToast('Ball returned. Score: ' + state.score + ' — Space to roll again.');
    }
  }

  ball.rotation.x += state.rolling ? dt * 10 : 0;
};`
  },
  {
    name: 'Domino Chain',
    icon: '🁣',
    desc: 'Spawn a line of dominos, tap first one to trigger chain',
    code: `// Domino Chain — spawn dominos, press D to start chain reaction
state.dominosSpawned = state.dominosSpawned || false;
state.chainStarted = state.chainStarted || false;
state.fallingIndex = state.fallingIndex || 0;

if (!state.dominosSpawned) {
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 1.5;
    const r = 8 + i * 0.3;
    const domino = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 1.5, 0.8),
      new THREE.MeshStandardMaterial({ color: 0xffffff - i * 0x080808 })
    );
    domino.position.set(Math.cos(angle) * r, 0.75, Math.sin(angle) * r);
    domino.rotation.y = angle + Math.PI / 2;
    domino.userData.name = 'domino_' + i;
    domino.userData.isDomino = true;
    domino.userData.fallen = false;
    domino.userData.idx = i;
    scene.add(domino);
  }
  state.dominosSpawned = true;
  showToast('Dominos placed in spiral! Press D to start the chain.');
}

onKeyPress = function(key) {
  if (key === 'd' && !state.chainStarted) {
    state.chainStarted = true;
    state.fallingIndex = 0;
    state.fallTimer = 0;
    showToast('Chain reaction started!');
  }
};

onUpdate = function(dt) {
  if (!state.chainStarted) return;
  state.fallTimer = (state.fallTimer || 0) + dt;

  if (state.fallTimer > 0.15 && state.fallingIndex < 20) {
    const domino = getObjectByName('domino_' + state.fallingIndex);
    if (domino && !domino.userData.fallen) {
      domino.userData.fallen = true;
      domino.userData.fallProgress = 0;
    }
    state.fallingIndex++;
    state.fallTimer = 0;
  }

  getObjects().forEach(obj => {
    if (!obj.userData.isDomino || !obj.userData.fallen) return;
    obj.userData.fallProgress = Math.min(1, (obj.userData.fallProgress || 0) + dt * 4);
    obj.rotation.x = (obj.userData.fallProgress) * Math.PI / 2;
    obj.position.y = 0.75 - obj.userData.fallProgress * 0.4;
  });

  if (state.fallingIndex >= 20) {
    showToast('All dominos fell!');
    state.chainStarted = false;
  }
};`
  },
  {
    name: 'Catapult',
    icon: '🪨',
    desc: 'Build catapult, hold space to charge, release to fire',
    code: `// Catapult — hold Space to charge, release to fire a boulder
state.catapultReady = state.catapultReady || false;
state.charging = false;
state.power = 0;
state.projectiles = state.projectiles || [];

if (!state.catapultReady) {
  // Base
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.5, 3),
    new THREE.MeshStandardMaterial({ color: 0x8B4513 })
  );
  base.position.set(0, 0.25, -5);
  base.userData.name = 'catapult_base';
  scene.add(base);
  // Arm
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 3, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x654321 })
  );
  arm.position.set(0, 1.5, -5);
  arm.userData.name = 'catapult_arm';
  scene.add(arm);
  state.catapultReady = true;
  showToast('Catapult built! Hold Space to charge, release to fire.');
}

let spaceDown = false;
onKeyPress = function(key) {
  if (key === ' ') {
    if (!spaceDown) { spaceDown = true; state.charging = true; state.power = 0; }
  }
};

onUpdate = function(dt) {
  if (state.charging) {
    state.power = Math.min(100, state.power + dt * 50);
    const arm = getObjectByName('catapult_arm');
    if (arm) arm.rotation.x = -(state.power / 100) * 0.8;
    showToast('Power: ' + Math.floor(state.power) + '%');
  }

  if (spaceDown && state.power > 0) {
    // Check if space released (simple toggle)
    spaceDown = false;
    state.charging = false;
    // Fire!
    const rock = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    rock.position.set(0, 3, -5);
    rock.userData.name = 'rock_' + Date.now();
    rock.userData.vel = { x: 0, y: state.power * 0.15, z: state.power * 0.3 };
    scene.add(rock);
    state.projectiles.push(rock);
    const arm = getObjectByName('catapult_arm');
    if (arm) arm.rotation.x = 0;
    showToast('Fired at ' + Math.floor(state.power) + '% power!');
    state.power = 0;
  }

  // Move projectiles
  state.projectiles.forEach(rock => {
    if (!rock.parent) return;
    rock.userData.vel.y -= dt * 15;
    rock.position.x += rock.userData.vel.x * dt;
    rock.position.y += rock.userData.vel.y * dt;
    rock.position.z += rock.userData.vel.z * dt;
    if (rock.position.y < 0) { rock.position.y = 0; rock.userData.vel = {x:0,y:0,z:0}; }
  });
};`
  },
  {
    name: 'Wrecking Ball',
    icon: '⛏️',
    desc: 'Swinging ball on chain demolishes physics objects',
    code: `// Wrecking Ball — swinging heavy ball smashes things
state.wbReady = state.wbReady || false;
state.wbAngle = state.wbAngle || 0;
state.wbDir = state.wbDir || 1;

if (!state.wbReady) {
  // Pivot point
  const pivot = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x444444 })
  );
  pivot.position.set(0, 12, 0);
  pivot.userData.name = 'wb_pivot';
  scene.add(pivot);

  // Chain segments
  for (let i = 0; i < 6; i++) {
    const link = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 1, 6),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    link.position.set(0, 11 - i * 1, 0);
    link.userData.name = 'wb_chain_' + i;
    link.userData.isChain = true;
    link.userData.chainIdx = i;
    scene.add(link);
  }

  // Ball
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.2 })
  );
  ball.position.set(0, 4, 0);
  ball.userData.name = 'wrecking_ball';
  scene.add(ball);

  // Target boxes
  for (let i = 0; i < 8; i++) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xf97316 })
    );
    box.position.set(6 + (i % 4) * 1.2, 0.5 + Math.floor(i / 4) * 1.1, 0);
    box.userData.name = 'target_' + i;
    box.userData.isTarget = true;
    scene.add(box);
  }

  state.wbReady = true;
  showToast('Wrecking ball swinging! Watch it demolish the boxes.');
}

onUpdate = function(dt) {
  state.wbAngle += state.wbDir * dt * 1.5;
  if (Math.abs(state.wbAngle) > 1.2) state.wbDir *= -1;

  const chainLen = 8;
  const bx = Math.sin(state.wbAngle) * chainLen;
  const by = 12 - Math.cos(state.wbAngle) * chainLen;

  const ball = getObjectByName('wrecking_ball');
  if (ball) { ball.position.set(bx, by, 0); }

  // Update chain positions
  for (let i = 0; i < 6; i++) {
    const link = getObjectByName('wb_chain_' + i);
    if (link) {
      const t = (i + 1) / 7;
      link.position.set(Math.sin(state.wbAngle) * chainLen * t, 12 - Math.cos(state.wbAngle) * chainLen * t, 0);
      link.rotation.z = state.wbAngle;
    }
  }

  // Check collisions with targets
  if (ball) {
    getObjects().forEach(obj => {
      if (!obj.userData.isTarget) return;
      if (ball.position.distanceTo(obj.position) < 2) {
        obj.position.x += (obj.position.x - ball.position.x) * 3;
        obj.position.y += 2;
        obj.rotation.x += 0.5;
        obj.rotation.z += 0.3;
      }
    });
  }
};`
  },
  {
    name: 'Stack Tower',
    icon: '📦',
    desc: 'Boxes fall from above, stack as high as you can',
    code: `// Stack Tower — press Space to drop boxes, stack them high
state.stackHeight = state.stackHeight || 0;
state.dropping = state.dropping || false;
state.currentBox = state.currentBox || null;
state.swingX = state.swingX || 0;
state.swingDir = state.swingDir || 1;
state.bestStack = state.bestStack || 0;

function spawnBox() {
  const colors = [0x4ade80, 0x60a5fa, 0xf7c948, 0xff6b6b, 0xc084fc];
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.8, 2),
    new THREE.MeshStandardMaterial({ color: colors[state.stackHeight % colors.length] })
  );
  box.position.set(0, 15, 0);
  box.userData.name = 'stack_box_' + Date.now();
  box.userData.isStackBox = true;
  scene.add(box);
  state.currentBox = box;
  state.dropping = false;
  state.swingX = -5;
  state.swingDir = 1;
}

if (!state.currentBox) spawnBox();

onKeyPress = function(key) {
  if (key === ' ' && !state.dropping && state.currentBox) {
    state.dropping = true;
    showToast('Dropped!');
  }
};

onUpdate = function(dt) {
  if (!state.currentBox || !state.currentBox.parent) { spawnBox(); return; }
  const box = state.currentBox;

  if (!state.dropping) {
    state.swingX += state.swingDir * dt * 6;
    if (Math.abs(state.swingX) > 5) state.swingDir *= -1;
    box.position.x = state.swingX;
    box.position.y = state.stackHeight * 0.8 + 10;
  } else {
    box.position.y -= dt * 12;
    const targetY = state.stackHeight * 0.8 + 0.4;
    if (box.position.y <= targetY) {
      box.position.y = targetY;
      const offset = Math.abs(box.position.x);
      if (offset > 2.5) {
        scene.remove(box);
        showToast('Missed! Stack height: ' + state.stackHeight + ' (Best: ' + state.bestStack + ')');
        state.stackHeight = 0;
        state.currentBox = null;
      } else {
        state.stackHeight++;
        state.bestStack = Math.max(state.bestStack, state.stackHeight);
        showToast('Stacked! Height: ' + state.stackHeight);
        state.currentBox = null;
        spawnBox();
      }
    }
  }
};`
  },
  {
    name: 'Marble Run',
    icon: '🔵',
    desc: 'Ramp track with physics ball, tilt controls',
    code: `// Marble Run — ball rolls on ramp, A/D to tilt
state.marbleReady = state.marbleReady || false;
state.tilt = state.tilt || 0;

if (!state.marbleReady) {
  // Build ramp segments
  for (let i = 0; i < 8; i++) {
    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(6, 0.3, 4),
      new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? 0x4a9eff : 0x60a5fa })
    );
    const zigzag = i % 2 === 0 ? -3 : 3;
    ramp.position.set(zigzag, 10 - i * 1.5, i * 4);
    ramp.rotation.z = i % 2 === 0 ? -0.15 : 0.15;
    ramp.userData.name = 'ramp_' + i;
    scene.add(ramp);
  }

  // Marble
  const marble = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xff4444, metalness: 0.6, roughness: 0.3 })
  );
  marble.position.set(-3, 11, 0);
  marble.userData.name = 'marble';
  marble.userData.vel = { x: 0, y: 0, z: 2 };
  scene.add(marble);

  state.marbleReady = true;
  showToast('Marble Run! Press A/D to tilt the track.');
}

onKeyPress = function(key) {
  if (key === 'a') state.tilt = Math.max(-0.3, state.tilt - 0.05);
  if (key === 'd') state.tilt = Math.min(0.3, state.tilt + 0.05);
};

onUpdate = function(dt) {
  const marble = getObjectByName('marble');
  if (!marble) return;

  marble.userData.vel.y -= dt * 9.8;
  marble.userData.vel.x += state.tilt * dt * 10;
  marble.position.x += marble.userData.vel.x * dt;
  marble.position.y += marble.userData.vel.y * dt;
  marble.position.z += marble.userData.vel.z * dt;
  marble.rotation.x += dt * 5;

  // Simple floor collision
  if (marble.position.y < 0.4) {
    marble.position.y = 0.4;
    marble.userData.vel.y = 0;
  }

  // Reset if out of bounds
  if (marble.position.y < -10 || marble.position.z > 40) {
    marble.position.set(-3, 11, 0);
    marble.userData.vel = { x: 0, y: 0, z: 2 };
    showToast('Marble reset!');
  }

  state.tilt *= 0.95; // Dampen tilt
};`
  },
  {
    name: 'Explosion Chain',
    icon: '💥',
    desc: 'Place explosive barrels, shoot one to trigger chain reaction',
    code: `// Explosion Chain — place barrels with B, press X to ignite nearest
state.barrelsPlaced = state.barrelsPlaced || false;

if (!state.barrelsPlaced) {
  const positions = [
    [0,0],[3,2],[6,1],[4,5],[1,7],[7,7],[-2,4],[-4,2],[-3,6],[2,-3]
  ];
  positions.forEach(([x,z], i) => {
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 1, 8),
      new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0x440000, emissiveIntensity: 0.3 })
    );
    barrel.position.set(x, 0.5, z);
    barrel.userData.name = 'barrel_' + i;
    barrel.userData.isBarrel = true;
    barrel.userData.exploded = false;
    scene.add(barrel);
  });
  state.barrelsPlaced = true;
  showToast('10 barrels placed! Press X to ignite the nearest one.');
}

function explodeBarrel(barrel) {
  if (barrel.userData.exploded) return;
  barrel.userData.exploded = true;
  barrel.material.color.setHex(0x222222);
  barrel.material.emissive.setHex(0xff6600);
  barrel.material.emissiveIntensity = 2;
  barrel.scale.set(1.5, 0.3, 1.5);
  barrel.position.y = 0.15;

  // Create explosion flash
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(2, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.6 })
  );
  flash.position.copy(barrel.position);
  flash.userData.name = 'flash_' + Date.now();
  flash.userData.life = 0.5;
  scene.add(flash);

  // Chain reaction — explode nearby barrels
  setTimeout(() => {
    getObjects().forEach(obj => {
      if (!obj.userData.isBarrel || obj.userData.exploded) return;
      if (barrel.position.distanceTo(obj.position) < 4) {
        explodeBarrel(obj);
      }
    });
  }, 200);
}

onKeyPress = function(key) {
  if (key === 'x') {
    const player = getPlayer();
    if (!player) return;
    let closest = null, cd = 5;
    getObjects().forEach(obj => {
      if (!obj.userData.isBarrel || obj.userData.exploded) return;
      const d = player.position.distanceTo(obj.position);
      if (d < cd) { cd = d; closest = obj; }
    });
    if (closest) { explodeBarrel(closest); showToast('BOOM!'); }
    else showToast('No barrels in range!');
  }
};

onUpdate = function(dt) {
  // Fade out explosion flashes
  getObjects().forEach(obj => {
    if (obj.userData.life !== undefined) {
      obj.userData.life -= dt;
      obj.material.opacity = Math.max(0, obj.userData.life);
      obj.scale.multiplyScalar(1 + dt * 3);
      if (obj.userData.life <= 0) scene.remove(obj);
    }
  });
};`
  },

  // ── AI & NPCs (26-32) ───────────────────────────────────────
  {
    name: 'Friendly Follower',
    icon: '🐕',
    desc: 'NPC follows player at distance, sits when player stops',
    code: `// Friendly Follower — companion follows you, sits when you stop
state.followerSpawned = state.followerSpawned || false;
state.playerLastPos = state.playerLastPos || null;
state.playerIdle = state.playerIdle || 0;

if (!state.followerSpawned) {
  const body = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.4, 1),
    new THREE.MeshStandardMaterial({ color: 0xcc8844 })
  );
  torso.position.y = 0.5;
  body.add(torso);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.4, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xcc8844 })
  );
  head.position.set(0, 0.6, 0.6);
  body.add(head);
  // Eyes
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  eye.position.set(0.1, 0.7, 0.8);
  body.add(eye);
  const eye2 = eye.clone();
  eye2.position.x = -0.1;
  body.add(eye2);

  body.position.set(3, 0, 3);
  body.userData.name = 'companion_dog';
  body.userData.isFollower = true;
  scene.add(body);
  state.followerSpawned = true;
  showToast('A friendly companion appeared! It will follow you.');
}

onUpdate = function(dt) {
  const player = getPlayer();
  const dog = getObjectByName('companion_dog');
  if (!player || !dog) return;

  const dist = player.position.distanceTo(dog.position);

  // Check if player is moving
  if (state.playerLastPos) {
    const moved = player.position.distanceTo(state.playerLastPos);
    state.playerIdle = moved < 0.05 ? state.playerIdle + dt : 0;
  }
  state.playerLastPos = player.position.clone();

  if (state.playerIdle > 2) {
    // Sit: lower the body
    dog.position.y = Math.max(-0.2, dog.position.y - dt * 2);
  } else if (dist > 3) {
    dog.position.y = 0;
    const dir = player.position.clone().sub(dog.position).normalize();
    dog.position.add(dir.multiplyScalar(dt * 5));
    dog.lookAt(player.position);
  }

  // Wag tail (rotate body slightly)
  dog.rotation.y += Math.sin(performance.now() * 0.01) * dt * 0.5;
};`
  },
  {
    name: 'Guard Patrol',
    icon: '💂',
    desc: 'Guards walk routes, spot player with vision cone, alert',
    code: `// Guard Patrol — guards walk a route, detect player in vision cone
state.guards = state.guards || [];
state.alertLevel = state.alertLevel || 0;

if (state.guards.length === 0) {
  const routes = [
    [{x:-10,z:-10},{x:-10,z:10},{x:10,z:10},{x:10,z:-10}],
    [{x:-15,z:0},{x:0,z:15},{x:15,z:0},{x:0,z:-15}]
  ];
  routes.forEach((route, gi) => {
    const guard = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 1.2, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x3355aa })
    );
    guard.position.set(route[0].x, 0.9, route[0].z);
    guard.userData.name = 'guard_' + gi;
    guard.userData.route = route;
    guard.userData.routeIdx = 0;
    guard.userData.isGuard = true;
    scene.add(guard);
    state.guards.push(guard);

    // Vision cone visual
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(4, 8, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.08, side: 2 })
    );
    cone.rotation.x = Math.PI / 2;
    cone.position.z = 4;
    guard.add(cone);
  });
  showToast('Guards on patrol! Stay out of their yellow cones.');
}

onUpdate = function(dt) {
  const player = getPlayer();
  if (!player) return;
  let seen = false;

  state.guards.forEach(guard => {
    if (!guard.parent) return;
    const route = guard.userData.route;
    const target = route[guard.userData.routeIdx];
    const dx = target.x - guard.position.x, dz = target.z - guard.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 1) {
      guard.userData.routeIdx = (guard.userData.routeIdx + 1) % route.length;
    } else {
      guard.position.x += (dx / dist) * dt * 3;
      guard.position.z += (dz / dist) * dt * 3;
      guard.lookAt(new THREE.Vector3(target.x, guard.position.y, target.z));
    }

    // Detection check
    const pDist = player.position.distanceTo(guard.position);
    if (pDist < 10) {
      const toPlayer = player.position.clone().sub(guard.position).normalize();
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(guard.quaternion);
      if (forward.dot(toPlayer) > 0.6) seen = true;
    }
  });

  state.alertLevel = seen
    ? Math.min(100, state.alertLevel + dt * 30)
    : Math.max(0, state.alertLevel - dt * 10);

  if (state.alertLevel >= 100) showToast('ALERT! Guards spotted you!');
};`
  },
  {
    name: 'Merchant NPC',
    icon: '🏪',
    desc: 'Walk up to NPC, opens buy/sell menu overlay',
    code: `// Merchant NPC — press E near merchant to open shop
state.merchantSpawned = state.merchantSpawned || false;
state.gold = state.gold !== undefined ? state.gold : 100;
state.shopOpen = state.shopOpen || false;

const shopItems = [
  { name: 'Health Potion', price: 10, icon: '❤️' },
  { name: 'Speed Boots', price: 25, icon: '👢' },
  { name: 'Shield', price: 30, icon: '🛡️' },
  { name: 'Magic Sword', price: 50, icon: '⚔️' }
];

if (!state.merchantSpawned) {
  const merchant = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4, 1.4, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x9b59b6 })
  );
  merchant.position.set(5, 1, 5);
  merchant.userData.name = 'merchant';
  scene.add(merchant);
  // Sign
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.8, 0.1),
    new THREE.MeshStandardMaterial({ color: 0xf7c948 })
  );
  sign.position.set(5, 3, 5);
  sign.userData.name = 'merchant_sign';
  scene.add(sign);
  state.merchantSpawned = true;
  showToast('Merchant appeared! Walk close and press E to shop.');
}

let shopEl = document.getElementById('shop-ui');

function openShop() {
  if (shopEl) shopEl.remove();
  shopEl = document.createElement('div');
  shopEl.id = 'shop-ui';
  shopEl.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10002;background:rgba(13,13,20,0.95);padding:20px;border-radius:12px;border:2px solid #9b59b6;font-family:monospace;color:#fff;min-width:250px;';
  shopEl.innerHTML = '<div style="font-size:16px;color:#9b59b6;margin-bottom:10px">Merchant Shop (Gold: ' + state.gold + ')</div>' +
    shopItems.map((item, i) =>
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #222">' +
      '<span>' + item.icon + ' ' + item.name + '</span>' +
      '<button onclick="window._buyItem(' + i + ')" style="background:#4ade80;border:none;color:#000;padding:4px 10px;border-radius:4px;cursor:pointer;font-family:inherit">' + item.price + 'g</button></div>'
    ).join('') +
    '<button onclick="document.getElementById(\'shop-ui\').remove()" style="margin-top:10px;background:#ef4444;border:none;color:#fff;padding:6px 16px;border-radius:6px;cursor:pointer;width:100%;font-family:inherit">Close</button>';
  document.body.appendChild(shopEl);
  state.shopOpen = true;
}

window._buyItem = function(idx) {
  const item = shopItems[idx];
  if (state.gold >= item.price) {
    state.gold -= item.price;
    showToast('Bought ' + item.name + '! Gold: ' + state.gold);
    openShop(); // Refresh
  } else { showToast('Not enough gold!'); }
};

onKeyPress = function(key) {
  if (key === 'e') {
    const player = getPlayer();
    const m = getObjectByName('merchant');
    if (player && m && player.position.distanceTo(m.position) < 4) openShop();
  }
};

onUpdate = function(dt) {
  const m = getObjectByName('merchant');
  if (m) m.rotation.y += dt * 0.5;
};`
  },
  {
    name: 'Crowd Simulation',
    icon: '👥',
    desc: 'Spawn 20 agents that avoid each other and wander',
    code: `// Crowd Simulation — 20 agents wander and avoid each other
state.crowdSpawned = state.crowdSpawned || false;

if (!state.crowdSpawned) {
  for (let i = 0; i < 20; i++) {
    const agent = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.25, 0.8, 4, 8),
      new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 20, 0.6, 0.5) })
    );
    agent.position.set((Math.random() - 0.5) * 30, 0.65, (Math.random() - 0.5) * 30);
    agent.userData.name = 'agent_' + i;
    agent.userData.isAgent = true;
    agent.userData.targetX = (Math.random() - 0.5) * 30;
    agent.userData.targetZ = (Math.random() - 0.5) * 30;
    agent.userData.speed = 1.5 + Math.random() * 2;
    scene.add(agent);
  }
  state.crowdSpawned = true;
  showToast('Crowd of 20 agents spawned! Watch them wander.');
}

onUpdate = function(dt) {
  const agents = getObjects().filter(o => o.userData.isAgent);

  agents.forEach(a => {
    // Move toward target
    const dx = a.userData.targetX - a.position.x;
    const dz = a.userData.targetZ - a.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 2) {
      a.userData.targetX = (Math.random() - 0.5) * 30;
      a.userData.targetZ = (Math.random() - 0.5) * 30;
    }

    let moveX = (dx / dist) * a.userData.speed;
    let moveZ = (dz / dist) * a.userData.speed;

    // Avoidance: push away from nearby agents
    agents.forEach(b => {
      if (a === b) return;
      const bx = a.position.x - b.position.x;
      const bz = a.position.z - b.position.z;
      const bd = Math.sqrt(bx * bx + bz * bz);
      if (bd < 2 && bd > 0.01) {
        moveX += (bx / bd) * 3;
        moveZ += (bz / bd) * 3;
      }
    });

    a.position.x += moveX * dt;
    a.position.z += moveZ * dt;
    a.lookAt(new THREE.Vector3(a.position.x + moveX, a.position.y, a.position.z + moveZ));
  });
};`
  },
  {
    name: 'Boss Fight',
    icon: '🐉',
    desc: 'Boss with health bar, attack patterns, weak spots',
    code: `// Boss Fight — big boss with health bar and attack phases
state.bossSpawned = state.bossSpawned || false;
state.bossHP = state.bossHP !== undefined ? state.bossHP : 100;
state.bossPhase = state.bossPhase || 'idle';
state.bossTimer = state.bossTimer || 0;
state.playerHP = state.playerHP !== undefined ? state.playerHP : 100;

if (!state.bossSpawned) {
  const boss = new THREE.Mesh(
    new THREE.BoxGeometry(3, 4, 3),
    new THREE.MeshStandardMaterial({ color: 0x880044, emissive: 0x440022, emissiveIntensity: 0.3 })
  );
  boss.position.set(0, 2, 20);
  boss.userData.name = 'boss';
  scene.add(boss);

  // Weak spot (glowing eye)
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1 })
  );
  eye.position.set(0, 3.5, 18.4);
  eye.userData.name = 'boss_eye';
  eye.userData.isWeakSpot = true;
  scene.add(eye);

  state.bossSpawned = true;
  showToast('BOSS appeared! Get close and press X to attack the glowing eye!');
}

let bossHud = document.getElementById('boss-hud');
if (!bossHud) {
  bossHud = document.createElement('div');
  bossHud.id = 'boss-hud';
  bossHud.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);z-index:500;font-family:monospace;color:#fff;pointer-events:none;text-align:center;width:300px;';
  document.body.appendChild(bossHud);
}

onKeyPress = function(key) {
  if (key === 'x') {
    const player = getPlayer();
    const eye = getObjectByName('boss_eye');
    if (player && eye && player.position.distanceTo(eye.position) < 5) {
      state.bossHP = Math.max(0, state.bossHP - 10);
      showToast('Hit! Boss HP: ' + state.bossHP);
      if (state.bossHP <= 0) showToast('BOSS DEFEATED!');
    }
  }
};

onUpdate = function(dt) {
  const boss = getObjectByName('boss');
  const player = getPlayer();
  if (!boss || !player || state.bossHP <= 0) return;

  state.bossTimer += dt;

  // Boss movement: slowly approach player
  const dir = player.position.clone().sub(boss.position).normalize();
  boss.position.x += dir.x * dt * 1.5;
  boss.position.z += dir.z * dt * 1.5;
  boss.lookAt(player.position);

  // Update eye position
  const eye = getObjectByName('boss_eye');
  if (eye) {
    eye.position.set(boss.position.x, boss.position.y + 1.5, boss.position.z - 1.6);
    eye.material.emissiveIntensity = 0.5 + Math.sin(performance.now() * 0.005) * 0.5;
  }

  // Boss attack every 3s
  if (state.bossTimer > 3) {
    state.bossTimer = 0;
    const dist = player.position.distanceTo(boss.position);
    if (dist < 8) {
      state.playerHP = Math.max(0, state.playerHP - 15);
      showToast('Boss attacked! Your HP: ' + state.playerHP);
    }
  }

  const bossBar = Math.floor(state.bossHP / 5);
  const plBar = Math.floor(state.playerHP / 5);
  bossHud.innerHTML = '<div style="background:rgba(0,0,0,0.7);padding:8px;border-radius:8px">' +
    '<div style="color:#ff4444">BOSS: ' + '█'.repeat(bossBar) + '░'.repeat(20 - bossBar) + ' ' + state.bossHP + '</div>' +
    '<div style="color:#4ade80">YOU: ' + '█'.repeat(plBar) + '░'.repeat(20 - plBar) + ' ' + state.playerHP + '</div></div>';
};`
  },
  {
    name: 'Pet Companion',
    icon: '🐱',
    desc: 'Small creature follows you, does tricks on command',
    code: `// Pet Companion — little creature follows you, tricks with 1/2/3
state.petSpawned = state.petSpawned || false;
state.petTrick = state.petTrick || null;
state.trickTimer = state.trickTimer || 0;

if (!state.petSpawned) {
  const pet = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xff9944 })
  );
  body.position.y = 0.35;
  pet.add(body);
  // Ears
  const ear1 = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 4), new THREE.MeshStandardMaterial({ color: 0xff9944 }));
  ear1.position.set(0.15, 0.7, 0);
  pet.add(ear1);
  const ear2 = ear1.clone();
  ear2.position.x = -0.15;
  pet.add(ear2);
  // Eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), eyeMat);
  e1.position.set(0.12, 0.45, 0.3);
  pet.add(e1);
  const e2 = e1.clone(); e2.position.x = -0.12; pet.add(e2);

  pet.position.set(2, 0, 2);
  pet.userData.name = 'pet_companion';
  scene.add(pet);
  state.petSpawned = true;
  showToast('A pet appeared! Press 1=spin, 2=jump, 3=roll');
}

onKeyPress = function(key) {
  if (key === '1') { state.petTrick = 'spin'; state.trickTimer = 0; showToast('Spin!'); }
  if (key === '2') { state.petTrick = 'jump'; state.trickTimer = 0; showToast('Jump!'); }
  if (key === '3') { state.petTrick = 'roll'; state.trickTimer = 0; showToast('Roll!'); }
};

onUpdate = function(dt) {
  const player = getPlayer();
  const pet = getObjectByName('pet_companion');
  if (!player || !pet) return;

  // Follow player
  const dist = player.position.distanceTo(pet.position);
  if (dist > 2.5) {
    const dir = player.position.clone().sub(pet.position).normalize();
    pet.position.add(dir.multiplyScalar(dt * 6));
    pet.lookAt(player.position);
  }

  // Tricks
  if (state.petTrick) {
    state.trickTimer += dt;
    if (state.petTrick === 'spin') {
      pet.rotation.y += dt * 12;
    } else if (state.petTrick === 'jump') {
      pet.position.y = Math.sin(state.trickTimer * 8) * 1.5;
      if (pet.position.y < 0) pet.position.y = 0;
    } else if (state.petTrick === 'roll') {
      pet.rotation.z += dt * 10;
    }
    if (state.trickTimer > 1.5) {
      state.petTrick = null;
      pet.rotation.z = 0;
      pet.position.y = 0;
    }
  }

  // Idle bounce
  if (!state.petTrick) {
    pet.position.y = Math.abs(Math.sin(performance.now() * 0.003)) * 0.15;
  }
};`
  },
  {
    name: 'NPC Conversations',
    icon: '💬',
    desc: 'Talk to NPCs, branching dialog with choices',
    code: `// NPC Conversations — press E to talk, click choices
state.npcTalkerSpawned = state.npcTalkerSpawned || false;
state.dialogOpen = state.dialogOpen || false;

const dialogTree = {
  start: { text: "Hello traveler! What brings you here?", choices: [
    { label: "I'm on a quest.", next: 'quest' },
    { label: "Just passing through.", next: 'pass' },
    { label: "Got anything for sale?", next: 'shop' }
  ]},
  quest: { text: "A quest, you say? The dragon in the north mountain has been causing trouble. Slay it and I'll reward you handsomely.", choices: [
    { label: "I'll do it!", next: 'accept' },
    { label: "Sounds dangerous...", next: 'start' }
  ]},
  pass: { text: "Safe travels then, friend. The roads can be dangerous at night.", choices: [
    { label: "Thanks for the warning.", next: null }
  ]},
  shop: { text: "I'm no merchant, but old Grimsby down the road might have what you need.", choices: [
    { label: "Where is Grimsby?", next: 'grimsby' },
    { label: "Thanks anyway.", next: null }
  ]},
  accept: { text: "Brave soul! Head north and look for the cave entrance. Good luck!", choices: [
    { label: "Farewell.", next: null }
  ]},
  grimsby: { text: "Follow the path east. You can't miss his shop - big red sign out front.", choices: [
    { label: "Got it, thanks!", next: null }
  ]}
};

if (!state.npcTalkerSpawned) {
  const npc = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 1.2, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x44aa88 })
  );
  npc.position.set(3, 0.95, 0);
  npc.userData.name = 'talker_npc';
  scene.add(npc);
  state.npcTalkerSpawned = true;
  showToast('An NPC appeared! Walk close and press E to talk.');
}

function showDialog(nodeId) {
  let el = document.getElementById('dialog-ui');
  if (el) el.remove();
  if (!nodeId || !dialogTree[nodeId]) { state.dialogOpen = false; return; }
  const node = dialogTree[nodeId];
  el = document.createElement('div');
  el.id = 'dialog-ui';
  el.style.cssText = 'position:fixed;bottom:40px;left:50%;transform:translateX(-50%);z-index:10002;background:rgba(13,13,20,0.95);padding:16px;border-radius:12px;border:2px solid #44aa88;font-family:monospace;color:#fff;max-width:400px;width:90%;';
  el.innerHTML = '<div style="margin-bottom:10px;line-height:1.5">' + node.text + '</div>' +
    node.choices.map((c, i) => '<button onclick="window._dialogChoice(\'' + (c.next || '') + '\')" style="display:block;width:100%;text-align:left;background:#1a1a2e;border:1px solid #333;color:#60a5fa;padding:8px;margin:4px 0;border-radius:6px;cursor:pointer;font-family:inherit">' + (i + 1) + '. ' + c.label + '</button>').join('');
  document.body.appendChild(el);
  state.dialogOpen = true;
}

window._dialogChoice = function(next) {
  if (next) showDialog(next);
  else { const el = document.getElementById('dialog-ui'); if (el) el.remove(); state.dialogOpen = false; showToast('Conversation ended.'); }
};

onKeyPress = function(key) {
  if (key === 'e' && !state.dialogOpen) {
    const player = getPlayer();
    const npc = getObjectByName('talker_npc');
    if (player && npc && player.position.distanceTo(npc.position) < 4) showDialog('start');
  }
};

onUpdate = function(dt) {
  const npc = getObjectByName('talker_npc');
  if (npc) npc.rotation.y += dt * 0.3;
};`
  },

  // ── Environment (33-39) ──────────────────────────────────────
  {
    name: 'Dynamic Weather',
    icon: '🌦️',
    desc: 'Random weather changes every 30s with transitions',
    code: `// Dynamic Weather — cycles through weather every 30s
state.weatherTimer = state.weatherTimer || 0;
state.currentWeather = state.currentWeather || 'clear';
state.particles = state.particles || [];

const weathers = ['clear', 'rain', 'snow', 'fog', 'storm'];

function setWeather(w) {
  state.currentWeather = w;
  // Clear old particles
  state.particles.forEach(p => { if (p.parent) scene.remove(p); });
  state.particles = [];

  if (w === 'rain' || w === 'storm') {
    for (let i = 0; i < 100; i++) {
      const drop = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4),
        new THREE.MeshBasicMaterial({ color: 0x6688cc, transparent: true, opacity: 0.5 })
      );
      drop.position.set((Math.random() - 0.5) * 40, Math.random() * 20, (Math.random() - 0.5) * 40);
      drop.userData.name = 'rain_' + i;
      scene.add(drop);
      state.particles.push(drop);
    }
    exec('set weather rain');
  } else if (w === 'snow') {
    for (let i = 0; i < 80; i++) {
      const flake = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      flake.position.set((Math.random() - 0.5) * 40, Math.random() * 20, (Math.random() - 0.5) * 40);
      flake.userData.name = 'snow_' + i;
      scene.add(flake);
      state.particles.push(flake);
    }
  } else if (w === 'fog') {
    scene.fog = new THREE.FogExp2(0x888888, 0.03);
  } else {
    scene.fog = null;
    exec('set weather clear');
  }
  showToast('Weather: ' + w.toUpperCase());
}

onUpdate = function(dt) {
  state.weatherTimer += dt;
  if (state.weatherTimer > 30) {
    state.weatherTimer = 0;
    const next = weathers[Math.floor(Math.random() * weathers.length)];
    setWeather(next);
  }

  state.particles.forEach(p => {
    if (!p.parent) return;
    if (state.currentWeather === 'rain' || state.currentWeather === 'storm') {
      p.position.y -= dt * 15;
      if (p.position.y < 0) p.position.y = 20;
    } else if (state.currentWeather === 'snow') {
      p.position.y -= dt * 2;
      p.position.x += Math.sin(performance.now() * 0.001 + p.position.z) * dt;
      if (p.position.y < 0) p.position.y = 20;
    }
  });
};

setWeather('rain');`
  },
  {
    name: 'Seasons Cycle',
    icon: '🍂',
    desc: 'Ground color shifts: green, orange, white, green',
    code: `// Seasons Cycle — ground color shifts through seasons
state.seasonTime = state.seasonTime || 0;
state.seasonIndex = state.seasonIndex || 0;

const seasons = [
  { name: 'Spring', ground: new THREE.Color(0x4ade80), sky: new THREE.Color(0x87ceeb) },
  { name: 'Summer', ground: new THREE.Color(0x228833), sky: new THREE.Color(0x4488cc) },
  { name: 'Autumn', ground: new THREE.Color(0xcc8833), sky: new THREE.Color(0xbb8855) },
  { name: 'Winter', ground: new THREE.Color(0xddddee), sky: new THREE.Color(0xaabbcc) }
];

let seasonHud = document.getElementById('season-hud');
if (!seasonHud) {
  seasonHud = document.createElement('div');
  seasonHud.id = 'season-hud';
  seasonHud.style.cssText = 'position:fixed;top:60px;right:500px;z-index:500;font-family:monospace;font-size:14px;color:#fff;pointer-events:none;';
  document.body.appendChild(seasonHud);
}

// Create ground plane for color changes
let ground = getObjectByName('season_ground');
if (!ground) {
  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({ color: 0x4ade80, side: 2 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.01;
  ground.userData.name = 'season_ground';
  scene.add(ground);
}

onUpdate = function(dt) {
  state.seasonTime += dt;
  if (state.seasonTime > 20) {
    state.seasonTime = 0;
    state.seasonIndex = (state.seasonIndex + 1) % 4;
    showToast('Season changed: ' + seasons[state.seasonIndex].name);
  }

  const current = seasons[state.seasonIndex];
  const next = seasons[(state.seasonIndex + 1) % 4];
  const t = state.seasonTime / 20;

  const grd = getObjectByName('season_ground');
  if (grd) {
    grd.material.color.copy(current.ground).lerp(next.ground, t);
  }

  seasonHud.innerHTML = '<div style="background:rgba(0,0,0,0.7);padding:8px 12px;border-radius:8px">' +
    seasons[state.seasonIndex].name + ' (' + Math.floor(20 - state.seasonTime) + 's)</div>';
};`
  },
  {
    name: 'Earthquake',
    icon: '🌋',
    desc: 'Screen shake, objects bounce, cracks in ground',
    code: `// Earthquake — press Q to trigger quake, objects shake
state.quakeActive = state.quakeActive || false;
state.quakeTimer = state.quakeTimer || 0;
state.quakeIntensity = state.quakeIntensity || 0;

// Spawn some boxes to shake
if (!getObjectByName('quake_box_0')) {
  for (let i = 0; i < 10; i++) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    box.position.set((Math.random() - 0.5) * 20, 0.5, (Math.random() - 0.5) * 20);
    box.userData.name = 'quake_box_' + i;
    box.userData.origY = 0.5;
    box.userData.isQuakeObj = true;
    scene.add(box);
  }
}

// Crack lines on ground
function spawnCracks() {
  for (let i = 0; i < 5; i++) {
    const crack = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.02, 3 + Math.random() * 5),
      new THREE.MeshBasicMaterial({ color: 0x222222 })
    );
    crack.position.set((Math.random() - 0.5) * 20, 0.02, (Math.random() - 0.5) * 20);
    crack.rotation.y = Math.random() * Math.PI;
    crack.userData.name = 'crack_' + Date.now() + '_' + i;
    crack.userData.isCrack = true;
    scene.add(crack);
  }
}

onKeyPress = function(key) {
  if (key === 'q') {
    state.quakeActive = true;
    state.quakeTimer = 0;
    state.quakeIntensity = 1;
    spawnCracks();
    showToast('EARTHQUAKE!');
  }
};

onUpdate = function(dt) {
  if (!state.quakeActive) return;
  state.quakeTimer += dt;
  state.quakeIntensity = Math.max(0, 1 - state.quakeTimer / 4);

  if (state.quakeIntensity <= 0) {
    state.quakeActive = false;
    camera.position.x = Math.round(camera.position.x);
    return;
  }

  // Camera shake
  camera.position.x += (Math.random() - 0.5) * state.quakeIntensity * 0.3;
  camera.position.y += (Math.random() - 0.5) * state.quakeIntensity * 0.2;

  // Objects bounce
  getObjects().forEach(obj => {
    if (!obj.userData.isQuakeObj) return;
    obj.position.y = (obj.userData.origY || 0.5) + Math.random() * state.quakeIntensity * 0.5;
    obj.rotation.x += (Math.random() - 0.5) * state.quakeIntensity * 0.1;
    obj.rotation.z += (Math.random() - 0.5) * state.quakeIntensity * 0.1;
  });
};

showToast('Press Q to trigger an earthquake!');`
  },
  {
    name: 'Aurora Borealis',
    icon: '🌌',
    desc: 'Colorful light bands moving across sky',
    code: `// Aurora Borealis — glowing bands wave across the sky
state.auroraSpawned = state.auroraSpawned || false;
state.auroraBands = state.auroraBands || [];

if (!state.auroraSpawned) {
  const colors = [0x00ff88, 0x4488ff, 0xcc44ff, 0x00ffcc, 0x8844ff];
  for (let i = 0; i < 5; i++) {
    const band = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 3, 20, 1),
      new THREE.MeshBasicMaterial({
        color: colors[i],
        transparent: true,
        opacity: 0.25,
        side: 2,
        blending: 2 // AdditiveBlending
      })
    );
    band.position.set(0, 30 + i * 3, -20);
    band.rotation.x = -0.3;
    band.userData.name = 'aurora_' + i;
    band.userData.isAurora = true;
    band.userData.auroraIdx = i;
    scene.add(band);
    state.auroraBands.push(band);
  }
  state.auroraSpawned = true;
  showToast('Aurora Borealis! Look up to see the lights.');
}

onUpdate = function(dt) {
  const time = performance.now() * 0.001;

  state.auroraBands.forEach((band, i) => {
    if (!band.parent) return;
    // Undulate the band
    const geo = band.geometry;
    const pos = geo.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v);
      const wave = Math.sin(x * 0.1 + time * (0.5 + i * 0.2)) * 2;
      pos.setY(v, wave);
    }
    pos.needsUpdate = true;

    // Shift colors over time
    const hue = ((time * 0.02 + i * 0.2) % 1);
    band.material.color.setHSL(hue, 0.8, 0.5);
    band.material.opacity = 0.15 + Math.sin(time * 0.3 + i) * 0.1;

    // Gentle lateral drift
    band.position.x = Math.sin(time * 0.1 + i * 1.5) * 10;
  });
};`
  },
  {
    name: 'Fireflies',
    icon: '✨',
    desc: 'Glowing particles that float around at night',
    code: `// Fireflies — small glowing orbs floating in the air
state.firefliesSpawned = state.firefliesSpawned || false;

if (!state.firefliesSpawned) {
  for (let i = 0; i < 40; i++) {
    const ff = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xeeff44 })
    );
    ff.position.set(
      (Math.random() - 0.5) * 40,
      0.5 + Math.random() * 5,
      (Math.random() - 0.5) * 40
    );
    ff.userData.name = 'firefly_' + i;
    ff.userData.isFirefly = true;
    ff.userData.phase = Math.random() * Math.PI * 2;
    ff.userData.speed = 0.5 + Math.random() * 1.5;
    ff.userData.baseY = ff.position.y;

    // Add point light for glow
    const light = new THREE.PointLight(0xeeff44, 0.3, 4);
    ff.add(light);

    scene.add(ff);
  }
  state.firefliesSpawned = true;
  showToast('40 fireflies released into the night!');
}

onUpdate = function(dt) {
  const time = performance.now() * 0.001;

  getObjects().forEach(obj => {
    if (!obj.userData.isFirefly) return;
    const p = obj.userData.phase;
    const s = obj.userData.speed;

    // Gentle wandering motion
    obj.position.x += Math.sin(time * s + p) * dt * 0.8;
    obj.position.z += Math.cos(time * s * 0.7 + p) * dt * 0.8;
    obj.position.y = obj.userData.baseY + Math.sin(time * 1.5 + p) * 0.8;

    // Pulsing glow
    const brightness = 0.3 + Math.sin(time * 3 + p) * 0.3;
    obj.material.opacity = Math.max(0.2, brightness);
    if (obj.children[0]) obj.children[0].intensity = brightness;

    // Keep in bounds
    if (Math.abs(obj.position.x) > 25) obj.position.x *= 0.99;
    if (Math.abs(obj.position.z) > 25) obj.position.z *= 0.99;
  });
};`
  },
  {
    name: 'Growing Trees',
    icon: '🌱',
    desc: 'Plant seeds that grow into trees over time',
    code: `// Growing Trees — press G to plant, watch them grow
state.trees = state.trees || [];

function plantTree(x, z) {
  const tree = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.15, 0.3, 6),
    new THREE.MeshStandardMaterial({ color: 0x8B4513 })
  );
  trunk.position.y = 0.15;
  tree.add(trunk);

  const leaves = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x228833 })
  );
  leaves.position.y = 0.4;
  tree.add(leaves);

  tree.position.set(x, 0, z);
  tree.scale.set(0.1, 0.1, 0.1);
  tree.userData.name = 'tree_' + Date.now();
  tree.userData.isGrowingTree = true;
  tree.userData.growth = 0;
  tree.userData.maxScale = 1 + Math.random() * 2;
  scene.add(tree);
  state.trees.push(tree);
  showToast('Seed planted! Watch it grow.');
}

onKeyPress = function(key) {
  if (key === 'g') {
    const player = getPlayer();
    if (!player) return;
    plantTree(player.position.x + (Math.random() - 0.5) * 2, player.position.z + (Math.random() - 0.5) * 2);
  }
};

onUpdate = function(dt) {
  state.trees.forEach(tree => {
    if (!tree.parent) return;
    if (tree.userData.growth < 1) {
      tree.userData.growth += dt * 0.05;
      const s = tree.userData.growth * tree.userData.maxScale;
      tree.scale.set(s, s, s);

      // Change leaf color as it grows
      const leaves = tree.children[1];
      if (leaves) {
        const g = tree.userData.growth;
        leaves.material.color.setRGB(0.1 + g * 0.1, 0.3 + g * 0.3, 0.1 + g * 0.1);
      }
    }

    // Gentle sway
    tree.rotation.z = Math.sin(performance.now() * 0.001 + tree.position.x) * 0.03;
  });
};

showToast('Press G to plant a seed! Trees grow over time.');`
  },
  {
    name: 'Tidal System',
    icon: '🌊',
    desc: 'Water level rises and falls on a cycle',
    code: `// Tidal System — water level rises and falls every 30s
state.tidalTime = state.tidalTime || 0;

let water = getObjectByName('tidal_water');
if (!water) {
  water = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80, 32, 32),
    new THREE.MeshStandardMaterial({
      color: 0x2244aa,
      transparent: true,
      opacity: 0.5,
      side: 2,
      metalness: 0.3,
      roughness: 0.1
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.5;
  water.userData.name = 'tidal_water';
  scene.add(water);
}

let tideHud = document.getElementById('tide-hud');
if (!tideHud) {
  tideHud = document.createElement('div');
  tideHud.id = 'tide-hud';
  tideHud.style.cssText = 'position:fixed;bottom:20px;left:16px;z-index:500;font-family:monospace;font-size:12px;color:#fff;pointer-events:none;';
  document.body.appendChild(tideHud);
}

onUpdate = function(dt) {
  state.tidalTime += dt;
  const cycle = Math.sin(state.tidalTime * 0.2) * 0.5 + 0.5; // 0 to 1
  const waterLevel = -1 + cycle * 3; // -1 to 2

  const w = getObjectByName('tidal_water');
  if (w) {
    w.position.y = waterLevel;

    // Animate wave vertices
    const pos = w.geometry.attributes.position;
    const time = performance.now() * 0.001;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const wave = Math.sin(x * 0.3 + time * 2) * 0.2 + Math.cos(z * 0.2 + time * 1.5) * 0.15;
      pos.setY(i, wave);
    }
    pos.needsUpdate = true;
    w.geometry.computeVertexNormals();
  }

  const tideName = cycle > 0.7 ? 'High Tide' : cycle < 0.3 ? 'Low Tide' : 'Mid Tide';
  tideHud.innerHTML = '<div style="background:rgba(0,0,0,0.7);padding:6px 10px;border-radius:8px">' +
    '🌊 ' + tideName + ' (Level: ' + waterLevel.toFixed(1) + 'm)</div>';
};

showToast('Tidal system active! Watch the water rise and fall.');`
  },

  // ── Visual Effects (40-46) ───────────────────────────────────
  {
    name: 'Trail Effect',
    icon: '🌠',
    desc: 'Glowing trail behind player as they move',
    code: `// Trail Effect — glowing dots trail behind the player
state.trail = state.trail || [];
state.trailTimer = state.trailTimer || 0;
const MAX_TRAIL = 50;

onUpdate = function(dt) {
  const player = getPlayer();
  if (!player) return;

  state.trailTimer += dt;
  if (state.trailTimer > 0.05) {
    state.trailTimer = 0;

    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x7c5cff, transparent: true, opacity: 1 })
    );
    dot.position.copy(player.position);
    dot.position.y = 0.5;
    dot.userData.name = 'trail_' + Date.now();
    dot.userData.life = 1;
    scene.add(dot);
    state.trail.push(dot);

    // Remove old trail dots
    while (state.trail.length > MAX_TRAIL) {
      const old = state.trail.shift();
      if (old.parent) scene.remove(old);
    }
  }

  // Fade trail dots
  state.trail.forEach((dot, i) => {
    if (!dot.parent) return;
    dot.userData.life -= dt * 0.8;
    dot.material.opacity = Math.max(0, dot.userData.life);
    dot.scale.multiplyScalar(0.997);

    // Color shift over lifetime
    const hue = (i / state.trail.length) * 0.3 + 0.7;
    dot.material.color.setHSL(hue, 0.8, 0.6);

    if (dot.userData.life <= 0) {
      scene.remove(dot);
    }
  });

  state.trail = state.trail.filter(d => d.parent);
};

showToast('Trail effect active! Move around to see the trail.');`
  },
  {
    name: 'Screen Shake',
    icon: '📳',
    desc: 'Camera shake on explosions/impacts',
    code: `// Screen Shake — press K for small shake, L for big shake
state.shakeIntensity = state.shakeIntensity || 0;
state.shakeDuration = state.shakeDuration || 0;
state.origCamPos = state.origCamPos || null;

function triggerShake(intensity, duration) {
  state.shakeIntensity = intensity;
  state.shakeDuration = duration;
  if (!state.origCamPos) {
    state.origCamPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
  }
}

onKeyPress = function(key) {
  if (key === 'k') { triggerShake(0.3, 0.5); showToast('Small impact!'); }
  if (key === 'l') { triggerShake(1.0, 1.0); showToast('BIG EXPLOSION!'); }
};

onUpdate = function(dt) {
  if (state.shakeDuration > 0) {
    state.shakeDuration -= dt;
    const decay = state.shakeDuration > 0 ? state.shakeIntensity * (state.shakeDuration / 1.0) : 0;

    camera.position.x += (Math.random() - 0.5) * decay;
    camera.position.y += (Math.random() - 0.5) * decay * 0.5;
    camera.rotation.z = (Math.random() - 0.5) * decay * 0.02;

    if (state.shakeDuration <= 0) {
      camera.rotation.z = 0;
      state.shakeIntensity = 0;
    }
  }
};

showToast('Press K for small shake, L for big shake.');`
  },
  {
    name: 'Slow Motion',
    icon: '🕐',
    desc: 'Press T to toggle bullet-time (0.2x speed)',
    code: `// Slow Motion — press T to toggle bullet-time
state.slowMo = state.slowMo || false;
state.timeScale = state.timeScale || 1;

let slowHud = document.getElementById('slow-hud');
if (!slowHud) {
  slowHud = document.createElement('div');
  slowHud.id = 'slow-hud';
  slowHud.style.cssText = 'position:fixed;top:100px;left:50%;transform:translateX(-50%);z-index:500;font-family:monospace;font-size:18px;color:#fff;pointer-events:none;';
  document.body.appendChild(slowHud);
}

onKeyPress = function(key) {
  if (key === 't') {
    state.slowMo = !state.slowMo;
    state.timeScale = state.slowMo ? 0.2 : 1;
    showToast(state.slowMo ? 'BULLET TIME' : 'Normal speed');
  }
};

onUpdate = function(dt) {
  // Apply time scale to all animated objects
  getObjects().forEach(obj => {
    if (obj.rotation) {
      // Slow down any spinning objects
      if (obj.userData._origRotSpeed === undefined && obj.rotation.y !== 0) {
        obj.userData._origRotSpeed = true;
      }
    }
  });

  // Visual feedback
  if (state.slowMo) {
    slowHud.innerHTML = '<div style="background:rgba(0,0,40,0.6);padding:8px 20px;border-radius:8px;border:1px solid #4a9eff;color:#4a9eff">SLOW MOTION x0.2</div>';

    // Radial blur effect via vignette
    let vignette = document.getElementById('slow-vignette');
    if (!vignette) {
      vignette = document.createElement('div');
      vignette.id = 'slow-vignette';
      vignette.style.cssText = 'position:fixed;inset:0;z-index:499;pointer-events:none;background:radial-gradient(circle,transparent 40%,rgba(0,0,40,0.4));';
      document.body.appendChild(vignette);
    }
  } else {
    slowHud.innerHTML = '';
    const v = document.getElementById('slow-vignette');
    if (v) v.remove();
  }
};

showToast('Press T to toggle slow motion!');`
  },
  {
    name: 'Matrix Rain',
    icon: '🟩',
    desc: 'Falling green characters overlay',
    code: `// Matrix Rain — green falling characters overlay
let matrixCanvas = document.getElementById('matrix-canvas');
if (!matrixCanvas) {
  matrixCanvas = document.createElement('canvas');
  matrixCanvas.id = 'matrix-canvas';
  matrixCanvas.style.cssText = 'position:fixed;inset:0;z-index:498;pointer-events:none;opacity:0.3;';
  matrixCanvas.width = window.innerWidth;
  matrixCanvas.height = window.innerHeight;
  document.body.appendChild(matrixCanvas);
}

const ctx = matrixCanvas.getContext('2d');
const cols = Math.floor(matrixCanvas.width / 14);
const drops = new Array(cols).fill(0);
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%^&*()';

function drawMatrix() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
  ctx.fillRect(0, 0, matrixCanvas.width, matrixCanvas.height);
  ctx.fillStyle = '#0f0';
  ctx.font = '14px monospace';

  for (let i = 0; i < drops.length; i++) {
    const char = chars[Math.floor(Math.random() * chars.length)];
    ctx.fillStyle = Math.random() > 0.9 ? '#fff' : '#0f0';
    ctx.fillText(char, i * 14, drops[i] * 14);
    if (drops[i] * 14 > matrixCanvas.height && Math.random() > 0.975) {
      drops[i] = 0;
    }
    drops[i]++;
  }
}

onUpdate = function(dt) {
  drawMatrix();
};

// Cleanup on stop
state._matrixCleanup = function() {
  const c = document.getElementById('matrix-canvas');
  if (c) c.remove();
};

showToast('Matrix rain active! Green characters falling.');`
  },
  {
    name: 'Fireworks Show',
    icon: '🎆',
    desc: 'Launch colorful fireworks into the sky',
    code: `// Fireworks — press Space to launch, auto-show every 3s
state.fwTimer = state.fwTimer || 0;
state.particles = state.particles || [];

function launchFirework(x, z) {
  const color = new THREE.Color().setHSL(Math.random(), 1, 0.6);
  const burstY = 12 + Math.random() * 8;

  // Launch trail
  const trail = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffaa })
  );
  trail.position.set(x, 0, z);
  trail.userData.name = 'fw_trail_' + Date.now();
  trail.userData.targetY = burstY;
  trail.userData.isFWTrail = true;
  trail.userData.burstColor = color;
  trail.userData.burstX = x;
  trail.userData.burstZ = z;
  scene.add(trail);
}

function burst(x, y, z, color) {
  for (let i = 0; i < 30; i++) {
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 4, 4),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1 })
    );
    p.position.set(x, y, z);
    const angle = Math.random() * Math.PI * 2;
    const elev = (Math.random() - 0.5) * Math.PI;
    const speed = 3 + Math.random() * 5;
    p.userData.vel = {
      x: Math.cos(angle) * Math.cos(elev) * speed,
      y: Math.sin(elev) * speed,
      z: Math.sin(angle) * Math.cos(elev) * speed
    };
    p.userData.life = 1.5 + Math.random();
    p.userData.isFWParticle = true;
    p.userData.name = 'fw_p_' + Date.now() + '_' + i;
    scene.add(p);
    state.particles.push(p);
  }
}

onKeyPress = function(key) {
  if (key === ' ') {
    const player = getPlayer();
    const px = player ? player.position.x : 0;
    const pz = player ? player.position.z : 0;
    launchFirework(px + (Math.random() - 0.5) * 10, pz + (Math.random() - 0.5) * 10);
  }
};

onUpdate = function(dt) {
  state.fwTimer += dt;
  if (state.fwTimer > 3) {
    state.fwTimer = 0;
    launchFirework((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
  }

  // Trails rising
  getObjects().forEach(obj => {
    if (obj.userData.isFWTrail) {
      obj.position.y += dt * 15;
      if (obj.position.y >= obj.userData.targetY) {
        burst(obj.userData.burstX, obj.position.y, obj.userData.burstZ, obj.userData.burstColor);
        scene.remove(obj);
      }
    }
  });

  // Particles
  state.particles.forEach(p => {
    if (!p.parent) return;
    p.userData.life -= dt;
    p.userData.vel.y -= dt * 3;
    p.position.x += p.userData.vel.x * dt;
    p.position.y += p.userData.vel.y * dt;
    p.position.z += p.userData.vel.z * dt;
    p.material.opacity = Math.max(0, p.userData.life / 1.5);
    if (p.userData.life <= 0) scene.remove(p);
  });
  state.particles = state.particles.filter(p => p.parent);
};

showToast('Fireworks! Press Space to launch. Auto-fires every 3s.');`
  },
  {
    name: 'Lightning Storm',
    icon: '⛈️',
    desc: 'Periodic lightning flashes with thunder delay',
    code: `// Lightning Storm — random flashes with delayed thunder sound
state.nextFlash = state.nextFlash || 2;
state.flashTimer = state.flashTimer || 0;
state.flashActive = state.flashActive || 0;
state.thunderQueue = state.thunderQueue || [];

let flashOverlay = document.getElementById('flash-overlay');
if (!flashOverlay) {
  flashOverlay = document.createElement('div');
  flashOverlay.id = 'flash-overlay';
  flashOverlay.style.cssText = 'position:fixed;inset:0;z-index:498;pointer-events:none;background:white;opacity:0;transition:opacity 0.05s;';
  document.body.appendChild(flashOverlay);
}

function createBolt() {
  const points = [];
  let x = (Math.random() - 0.5) * 20;
  let y = 25;
  const targetX = (Math.random() - 0.5) * 10;
  for (let i = 0; i < 8; i++) {
    points.push(new THREE.Vector3(x, y, (Math.random() - 0.5) * 5));
    x += (targetX - x) * 0.3 + (Math.random() - 0.5) * 3;
    y -= 3 + Math.random();
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const bolt = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 }));
  bolt.userData.name = 'bolt_' + Date.now();
  bolt.userData.life = 0.3;
  bolt.userData.isBolt = true;
  scene.add(bolt);
}

onUpdate = function(dt) {
  state.flashTimer += dt;

  if (state.flashTimer >= state.nextFlash) {
    state.flashTimer = 0;
    state.nextFlash = 3 + Math.random() * 7;
    state.flashActive = 0.15;
    createBolt();

    // Flash
    flashOverlay.style.opacity = '0.8';
    setTimeout(() => { flashOverlay.style.opacity = '0'; }, 100);
    setTimeout(() => { flashOverlay.style.opacity = '0.4'; }, 150);
    setTimeout(() => { flashOverlay.style.opacity = '0'; }, 200);

    // Thunder after delay (sound = distance)
    const delay = 1 + Math.random() * 3;
    setTimeout(() => { showToast('...rumble...'); }, delay * 1000);
  }

  // Fade bolts
  getObjects().forEach(obj => {
    if (!obj.userData.isBolt) return;
    obj.userData.life -= dt;
    obj.material.opacity = Math.max(0, obj.userData.life / 0.3);
    if (obj.userData.life <= 0) scene.remove(obj);
  });
};

showToast('Lightning storm! Watch for flashes and thunder.');`
  },
  {
    name: 'Object Glow',
    icon: '💡',
    desc: 'Important objects pulse with glow effect',
    code: `// Object Glow — objects pulse with emissive glow, press G to tag nearest
state.glowObjects = state.glowObjects || [];

onKeyPress = function(key) {
  if (key === 'g') {
    const player = getPlayer();
    if (!player) return;
    let closest = null, closestDist = 10;
    getObjects().forEach(obj => {
      if (!obj.userData.name || obj.userData.isGlowing) return;
      const d = player.position.distanceTo(obj.position);
      if (d < closestDist) { closest = obj; closestDist = d; }
    });
    if (closest) {
      closest.userData.isGlowing = true;
      closest.userData.glowPhase = Math.random() * Math.PI * 2;
      // Store original material and create glowing clone
      if (closest.material) {
        closest.userData.origColor = closest.material.color ? closest.material.color.getHex() : 0xffffff;
        closest.material.emissive = closest.material.emissive || new THREE.Color(0x000000);
      }
      state.glowObjects.push(closest);
      showToast('Tagged "' + closest.userData.name + '" with glow!');
    } else {
      showToast('No object nearby to tag.');
    }
  }
};

// Auto-tag some objects at start
if (state.glowObjects.length === 0) {
  getObjects().slice(0, 3).forEach(obj => {
    if (obj.material && obj.userData.name) {
      obj.userData.isGlowing = true;
      obj.userData.glowPhase = Math.random() * Math.PI * 2;
      if (obj.material.emissive === undefined) return;
      obj.userData.origColor = obj.material.color ? obj.material.color.getHex() : 0xffffff;
      state.glowObjects.push(obj);
    }
  });
}

onUpdate = function(dt) {
  const time = performance.now() * 0.001;

  state.glowObjects.forEach(obj => {
    if (!obj.parent || !obj.material || !obj.material.emissive) return;
    const pulse = (Math.sin(time * 3 + (obj.userData.glowPhase || 0)) + 1) * 0.5;
    obj.material.emissive.setHSL(0.55, 0.8, pulse * 0.4);
    obj.material.emissiveIntensity = pulse * 1.5;

    // Slight scale pulse
    const s = 1 + pulse * 0.05;
    obj.scale.set(s, s, s);
  });
};

showToast('Glow effect! Press G to tag nearby objects.');`
  },

  // ── Camera (47-50) ───────────────────────────────────────────
  {
    name: 'Cinematic Camera',
    icon: '🎬',
    desc: 'Smooth camera dolly around a target point',
    code: `// Cinematic Camera — smooth orbit around a focal point
state.cinematic = state.cinematic || false;
state.orbitAngle = state.orbitAngle || 0;
state.orbitRadius = state.orbitRadius || 15;
state.orbitHeight = state.orbitHeight || 8;
state.targetPos = state.targetPos || { x: 0, y: 2, z: 0 };

let cinHud = document.getElementById('cin-hud');
if (!cinHud) {
  cinHud = document.createElement('div');
  cinHud.id = 'cin-hud';
  cinHud.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:500;font-family:monospace;font-size:12px;color:#fff;pointer-events:none;';
  document.body.appendChild(cinHud);
}

onKeyPress = function(key) {
  if (key === 'c') {
    state.cinematic = !state.cinematic;
    if (state.cinematic) {
      const player = getPlayer();
      if (player) {
        state.targetPos = { x: player.position.x, y: player.position.y + 2, z: player.position.z };
      }
    }
    showToast(state.cinematic ? 'Cinematic camera ON' : 'Cinematic camera OFF');
  }
  if (key === 'arrowup') state.orbitRadius = Math.max(5, state.orbitRadius - 2);
  if (key === 'arrowdown') state.orbitRadius = Math.min(40, state.orbitRadius + 2);
  if (key === 'r') state.orbitHeight = state.orbitHeight === 8 ? 20 : 8;
};

onUpdate = function(dt) {
  if (!state.cinematic) {
    cinHud.innerHTML = '<div style="background:rgba(0,0,0,0.5);padding:6px 12px;border-radius:8px">Press C for cinematic camera</div>';
    return;
  }

  state.orbitAngle += dt * 0.3;
  const x = state.targetPos.x + Math.cos(state.orbitAngle) * state.orbitRadius;
  const z = state.targetPos.z + Math.sin(state.orbitAngle) * state.orbitRadius;

  camera.position.x += (x - camera.position.x) * dt * 2;
  camera.position.y += (state.orbitHeight - camera.position.y) * dt * 2;
  camera.position.z += (z - camera.position.z) * dt * 2;
  camera.lookAt(new THREE.Vector3(state.targetPos.x, state.targetPos.y, state.targetPos.z));

  cinHud.innerHTML = '<div style="background:rgba(0,0,0,0.7);padding:6px 12px;border-radius:8px;border:1px solid #7c5cff">🎬 CINEMATIC | C=toggle | ↑↓=zoom | R=height</div>';
};`
  },
  {
    name: 'Security Cameras',
    icon: '📷',
    desc: 'Cycle between fixed camera positions with static overlay',
    code: `// Security Cameras — press V to cycle fixed camera views
state.camIndex = state.camIndex || 0;
state.securityMode = state.securityMode || false;

const camPositions = [
  { pos: { x: 20, y: 15, z: 20 }, look: { x: 0, y: 0, z: 0 }, label: 'CAM 01 — MAIN ENTRANCE' },
  { pos: { x: -20, y: 10, z: 0 }, look: { x: 0, y: 0, z: 0 }, label: 'CAM 02 — WEST WING' },
  { pos: { x: 0, y: 25, z: 0 }, look: { x: 0, y: 0, z: 0 }, label: 'CAM 03 — OVERHEAD' },
  { pos: { x: 10, y: 5, z: -15 }, look: { x: 0, y: 2, z: 0 }, label: 'CAM 04 — SOUTH GATE' }
];

let secHud = document.getElementById('sec-hud');
if (!secHud) {
  secHud = document.createElement('div');
  secHud.id = 'sec-hud';
  secHud.style.cssText = 'position:fixed;inset:0;z-index:498;pointer-events:none;display:none;';
  secHud.innerHTML = '<div style="position:absolute;top:10px;left:10px;font-family:monospace;font-size:12px;color:#0f0" id="sec-label">CAM 01</div>' +
    '<div style="position:absolute;bottom:10px;right:10px;font-family:monospace;font-size:10px;color:#0f0" id="sec-time">REC</div>' +
    '<div style="position:absolute;inset:0;border:3px solid rgba(0,255,0,0.2);border-radius:8px"></div>' +
    '<div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,255,0,0.03) 2px,rgba(0,255,0,0.03) 4px);"></div>';
  document.body.appendChild(secHud);
}

onKeyPress = function(key) {
  if (key === 'v') {
    state.securityMode = !state.securityMode;
    secHud.style.display = state.securityMode ? 'block' : 'none';
    if (state.securityMode) {
      const cam = camPositions[state.camIndex];
      camera.position.set(cam.pos.x, cam.pos.y, cam.pos.z);
      camera.lookAt(new THREE.Vector3(cam.look.x, cam.look.y, cam.look.z));
    }
    showToast(state.securityMode ? 'Security cam mode. V=exit, N=next' : 'Normal view');
  }
  if (key === 'n' && state.securityMode) {
    state.camIndex = (state.camIndex + 1) % camPositions.length;
    const cam = camPositions[state.camIndex];
    camera.position.set(cam.pos.x, cam.pos.y, cam.pos.z);
    camera.lookAt(new THREE.Vector3(cam.look.x, cam.look.y, cam.look.z));
  }
};

onUpdate = function(dt) {
  if (!state.securityMode) return;
  const cam = camPositions[state.camIndex];
  document.getElementById('sec-label').textContent = cam.label;
  const now = new Date();
  document.getElementById('sec-time').textContent = 'REC ' + now.toLocaleTimeString();
  camera.lookAt(new THREE.Vector3(cam.look.x, cam.look.y, cam.look.z));
};

showToast('Press V for security camera view, N to cycle cameras.');`
  },
  {
    name: 'Drone Camera',
    icon: '🚁',
    desc: 'Free-fly WASD camera with altitude controls (Q/E)',
    code: `// Drone Camera — free-fly with WASD + Q/E for altitude
state.droneMode = state.droneMode || false;
state.droneVel = state.droneVel || { x: 0, y: 0, z: 0 };
state.droneSpeed = 15;
state.keys = state.keys || {};

let droneHud = document.getElementById('drone-hud');
if (!droneHud) {
  droneHud = document.createElement('div');
  droneHud.id = 'drone-hud';
  droneHud.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:500;font-family:monospace;font-size:12px;color:#fff;pointer-events:none;';
  document.body.appendChild(droneHud);
}

// Track key states via listeners
document.addEventListener('keydown', function(e) { state.keys[e.key.toLowerCase()] = true; });
document.addEventListener('keyup', function(e) { state.keys[e.key.toLowerCase()] = false; });

onKeyPress = function(key) {
  if (key === 'p') {
    state.droneMode = !state.droneMode;
    showToast(state.droneMode ? 'Drone camera ON — WASD + Q/E' : 'Drone camera OFF');
  }
};

onUpdate = function(dt) {
  if (!state.droneMode) {
    droneHud.innerHTML = '<div style="background:rgba(0,0,0,0.5);padding:4px 10px;border-radius:6px">Press P for drone camera</div>';
    return;
  }

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const speed = state.droneSpeed * dt;

  if (state.keys['w']) { camera.position.add(forward.clone().multiplyScalar(speed)); }
  if (state.keys['s']) { camera.position.add(forward.clone().multiplyScalar(-speed)); }
  if (state.keys['a']) { camera.position.add(right.clone().multiplyScalar(-speed)); }
  if (state.keys['d']) { camera.position.add(right.clone().multiplyScalar(speed)); }
  if (state.keys['e']) { camera.position.y += speed; }
  if (state.keys['q']) { camera.position.y -= speed; }

  // Mouse look is handled by the engine, we just control position
  const alt = camera.position.y.toFixed(1);
  droneHud.innerHTML = '<div style="background:rgba(0,0,0,0.7);padding:6px 12px;border-radius:8px;border:1px solid #4ade80">' +
    '🚁 DRONE | WASD=move Q/E=alt | Alt: ' + alt + 'm | P=exit</div>';
};`
  },
  {
    name: 'Photo Mode',
    icon: '📸',
    desc: 'Freeze time, free camera, filters, take screenshot',
    code: `// Photo Mode — press F5 to enter, free camera, filters
state.photoMode = state.photoMode || false;
state.filterIndex = state.filterIndex || 0;

const filters = [
  { name: 'None', css: '' },
  { name: 'Sepia', css: 'sepia(0.8)' },
  { name: 'B&W', css: 'grayscale(1)' },
  { name: 'Vintage', css: 'sepia(0.4) contrast(1.2) brightness(0.9)' },
  { name: 'Vivid', css: 'saturate(2) contrast(1.1)' },
  { name: 'Cool', css: 'hue-rotate(180deg) saturate(0.7)' },
  { name: 'Noir', css: 'grayscale(1) contrast(1.5) brightness(0.8)' }
];

let photoHud = document.getElementById('photo-hud');
if (!photoHud) {
  photoHud = document.createElement('div');
  photoHud.id = 'photo-hud';
  photoHud.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:500;font-family:monospace;font-size:12px;color:#fff;pointer-events:none;text-align:center;';
  document.body.appendChild(photoHud);
}

onKeyPress = function(key) {
  if (key === 'f5' || key === 'o') {
    state.photoMode = !state.photoMode;
    const canvas = document.querySelector('canvas');
    if (!state.photoMode && canvas) canvas.style.filter = '';
    showToast(state.photoMode ? 'PHOTO MODE — F=filter, P=screenshot, O=exit' : 'Photo mode OFF');
  }
  if (state.photoMode && key === 'f') {
    state.filterIndex = (state.filterIndex + 1) % filters.length;
    const canvas = document.querySelector('canvas');
    if (canvas) canvas.style.filter = filters[state.filterIndex].css;
    showToast('Filter: ' + filters[state.filterIndex].name);
  }
  if (state.photoMode && key === 'p') {
    // Screenshot
    const canvas = document.querySelector('canvas');
    if (canvas) {
      try {
        const link = document.createElement('a');
        link.download = 'crate-photo-' + Date.now() + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('Screenshot saved!');
      } catch (e) {
        showToast('Screenshot failed: ' + e.message);
      }
    }
  }
};

onUpdate = function(dt) {
  if (!state.photoMode) {
    photoHud.innerHTML = '<div style="background:rgba(0,0,0,0.4);padding:4px 10px;border-radius:6px">Press O for photo mode</div>';
    return;
  }

  // Letterbox bars
  photoHud.innerHTML = '<div style="background:rgba(0,0,0,0.7);padding:8px 16px;border-radius:8px;border:1px solid #f7c948">' +
    '📸 PHOTO MODE | Filter: ' + filters[state.filterIndex].name + ' | F=filter P=save O=exit</div>';
};

showToast('Press O to enter Photo Mode!');`
  },
];

// ── Enhanced Sandbox API ────────────────────────────────────────
export function createSandboxAPI(engine) {
  const { scene, camera, objects, characterController, npcController, playMode } = engine;

  return {
    // Three.js core
    scene, camera, objects,
    THREE: window.THREE,

    // Player
    getPlayer: () => characterController,
    getNPCs: () => npcController ? npcController.npcs : [],
    getObjects: () => objects,
    getObjectByName: (name) => objects.find(o => o.userData.name && o.userData.name.toLowerCase().includes(name.toLowerCase())),
    playMode: () => playMode,

    // Spawning
    spawn: (name, x, z) => {
      if (window._engineBridge && window._engineBridge.loadGLBModel) {
        window._engineBridge.loadGLBModel(name, name, x || 0, z || 0);
        return true;
      }
      return false;
    },
    remove: (name) => {
      const obj = objects.find(o => o.userData.name && o.userData.name.toLowerCase().includes(name.toLowerCase()));
      if (obj) { scene.remove(obj); objects.splice(objects.indexOf(obj), 1); return true; }
      return false;
    },

    // Physics
    physics: window._physics || null,
    addPhysics: async (obj, type) => {
      const p = window._physics;
      if (!p) return false;
      await p.init();
      window._physicsEnabled = true;
      return p.addRigidbody(obj, type || 'dynamic');
    },
    removePhysics: (obj) => { if (window._physics) window._physics.removeRigidbody(obj); },
    impulse: (obj, x, y, z) => { if (window._physics) window._physics.applyImpulse(obj, x, y, z); },

    // Environment
    exec: (cmd) => { if (window._parseAndExecute) window._parseAndExecute(cmd); },

    // UI
    showToast: (msg) => {
      const t = document.createElement('div');
      t.style.cssText = 'position:fixed;top:20%;left:50%;transform:translateX(-50%);color:#4ade80;font-family:monospace;font-size:18px;z-index:10001;pointer-events:none;background:rgba(0,0,0,0.8);padding:10px 20px;border-radius:8px;border:1px solid #333;';
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.5s'; }, 2000);
      setTimeout(() => t.remove(), 2500);
    },

    // Callbacks
    onUpdate: null,
    onKeyPress: null,
    onCollision: null,

    // Shared state
    state: window._userScriptScope || {},
    dt: 0,
    time: 0,
    keys: {},

    // Builtins
    console: {
      log: (...args) => { console.log('[Script]', ...args); _appendConsole(args.join(' '), '#4ade80'); },
      warn: (...args) => { console.warn('[Script]', ...args); _appendConsole(args.join(' '), '#f59e0b'); },
      error: (...args) => { console.error('[Script]', ...args); _appendConsole(args.join(' '), '#ef4444'); },
    },
    Math, JSON, Array, Object, String, Number, Boolean, Date,
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 30000)),
    setInterval: (fn, ms) => setInterval(fn, Math.max(ms, 100)),
    clearTimeout, clearInterval,
    performance: { now: () => performance.now() },
  };
}

// ── Console Output ──────────────────────────────────────────────
let _consoleEl = null;
function _appendConsole(msg, color = '#ccc') {
  if (!_consoleEl) return;
  const line = document.createElement('div');
  line.style.cssText = `color:${color};font-size:12px;padding:2px 0;border-bottom:1px solid #1a1a2e;`;
  line.textContent = '> ' + msg;
  _consoleEl.appendChild(line);
  _consoleEl.scrollTop = _consoleEl.scrollHeight;
  // Keep max 100 lines
  while (_consoleEl.children.length > 100) _consoleEl.removeChild(_consoleEl.firstChild);
}

// ── Main Editor Panel ───────────────────────────────────────────
export function showCodeEditor(engine) {
  // Remove existing editor if open
  const existing = document.getElementById('code-editor-panel');
  if (existing) { existing.remove(); return; }

  const panel = document.createElement('div');
  panel.id = 'code-editor-panel';
  panel.style.cssText = `
    position:fixed; right:0; top:36px; bottom:0; width:480px; max-width:50vw;
    background:#0d0d14; border-left:2px solid #7c5cff; z-index:10000;
    display:flex; flex-direction:column; font-family:'JetBrains Mono','Fira Code',monospace;
    box-shadow:-4px 0 24px rgba(0,0,0,0.5); transition:transform 0.2s;
  `;

  panel.innerHTML = `
    <div style="display:flex;align-items:center;padding:10px 14px;background:#111;border-bottom:1px solid #1a1a2e;gap:8px;flex-shrink:0">
      <span style="font-size:14px">🧠</span>
      <span style="color:#7c5cff;font-weight:700;font-size:13px;flex:1">Code Editor</span>
      <select id="ce-templates" style="background:#1a1a2e;border:1px solid #333;color:#aaa;padding:4px 8px;border-radius:4px;font-size:11px;font-family:inherit;cursor:pointer">
        <option value="">Templates...</option>
        ${TEMPLATES.map((t, i) => `<option value="${i}">${t.icon} ${t.name}</option>`).join('')}
      </select>
      <button id="ce-close" style="background:none;border:none;color:#666;font-size:18px;cursor:pointer;padding:0 4px">✕</button>
    </div>

    <div style="display:flex;gap:4px;padding:8px 10px;background:#0f0f18;border-bottom:1px solid #1a1a2e;flex-shrink:0">
      <button id="ce-run" style="flex:1;padding:6px;background:#16a34a;border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit">▶ Run</button>
      <button id="ce-stop" style="flex:1;padding:6px;background:#dc2626;border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit">⏹ Stop</button>
      <button id="ce-save" style="flex:1;padding:6px;background:#7c5cff;border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit">💾 Save</button>
      <button id="ce-list" style="padding:6px 10px;background:#1a1a2e;border:1px solid #333;color:#aaa;border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit">📋</button>
    </div>

    <div style="padding:6px 10px;background:#0f0f18;border-bottom:1px solid #1a1a2e;flex-shrink:0">
      <input id="ce-name" value="" placeholder="Script name..." style="width:100%;background:#1a1a2e;border:1px solid #252525;border-radius:4px;padding:5px 8px;color:#ddd;font-size:12px;font-family:inherit">
    </div>

    <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0">
      <div style="color:#555;font-size:10px;padding:4px 10px;text-transform:uppercase;letter-spacing:1px;background:#0a0a12;flex-shrink:0">JavaScript</div>
      <textarea id="ce-code" spellcheck="false" style="
        flex:1; width:100%; background:#0a0a14; color:#c9d1d9; border:none; padding:12px;
        font-family:'JetBrains Mono','Fira Code',monospace; font-size:13px; line-height:1.6;
        resize:none; tab-size:2; outline:none; min-height:200px;
      ">// Your custom game logic here
// Available APIs:
//   getPlayer()    — player character controller
//   getNPCs()      — all NPCs in scene
//   getObjects()   — all scene objects
//   spawn(name, x, z) — add a 3D model
//   remove(name)   — remove an object
//   physics        — window._physics (Rapier)
//   addPhysics(obj) — make object physical
//   impulse(obj, x, y, z) — push an object
//   exec(cmd)      — run engine command
//   showToast(msg) — show message
//   state          — persistent data between frames
//
// Set callbacks:
//   onUpdate = function(dt, time) {}  — per-frame logic
//   onKeyPress = function(key) {}     — keyboard input
//
// Press ▶ Run to execute!</textarea>
    </div>

    <div style="flex-shrink:0;border-top:1px solid #1a1a2e">
      <div style="color:#555;font-size:10px;padding:4px 10px;text-transform:uppercase;letter-spacing:1px;background:#0a0a12;display:flex;justify-content:space-between">
        <span>Console</span>
        <button id="ce-clear-console" style="background:none;border:none;color:#555;cursor:pointer;font-size:10px;font-family:inherit">Clear</button>
      </div>
      <div id="ce-console" style="height:100px;overflow-y:auto;padding:6px 10px;background:#08080f;font-size:12px;color:#888"></div>
    </div>
  `;

  document.body.appendChild(panel);
  _consoleEl = document.getElementById('ce-console');

  // Resize the canvas to make room
  const vw = document.querySelector('.viewport-wrapper');
  if (vw) vw.style.marginRight = '480px';

  // Wire up buttons
  document.getElementById('ce-close').onclick = () => {
    panel.remove();
    if (vw) vw.style.marginRight = '0';
    _consoleEl = null;
    if (window._engine && window._engine.scene) {
      // Trigger resize
      window.dispatchEvent(new Event('resize'));
    }
  };

  // Tab key inserts spaces in textarea
  const codeArea = document.getElementById('ce-code');
  codeArea.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = codeArea.selectionStart;
      codeArea.value = codeArea.value.substring(0, start) + '  ' + codeArea.value.substring(codeArea.selectionEnd);
      codeArea.selectionStart = codeArea.selectionEnd = start + 2;
    }
  });

  // Templates dropdown
  document.getElementById('ce-templates').onchange = (e) => {
    const idx = parseInt(e.target.value);
    if (isNaN(idx)) return;
    const t = TEMPLATES[idx];
    codeArea.value = t.code;
    document.getElementById('ce-name').value = t.name;
    _appendConsole('Loaded template: ' + t.name, '#7c5cff');
    e.target.value = '';
  };

  // Run
  let _currentScriptId = null;
  document.getElementById('ce-run').onclick = () => {
    const code = codeArea.value;
    const name = document.getElementById('ce-name').value || 'Untitled';
    const id = _currentScriptId || 'script_' + Date.now();
    _currentScriptId = id;

    // Stop previous version
    window._userScripts = (window._userScripts || []).filter(s => s.id !== id);

    const scriptObj = { id, name, description: '', code, enabled: true };

    try {
      const sandbox = createSandboxAPI(engine);
      const wrappedCode = '"use strict";\n' + code;
      const fn = new Function(...Object.keys(sandbox), wrappedCode);
      fn(...Object.values(sandbox));

      scriptObj._onUpdate = sandbox.onUpdate;
      scriptObj._onKeyPress = sandbox.onKeyPress;
      scriptObj._onCollision = sandbox.onCollision;
      scriptObj._running = true;

      window._userScripts.push(scriptObj);
      _appendConsole('Script "' + name + '" running', '#4ade80');
    } catch (err) {
      _appendConsole('Error: ' + err.message, '#ef4444');
      scriptObj._running = false;
    }
  };

  // Stop
  document.getElementById('ce-stop').onclick = () => {
    if (_currentScriptId) {
      const s = (window._userScripts || []).find(s => s.id === _currentScriptId);
      if (s) { s._running = false; s.enabled = false; }
      _appendConsole('Script stopped', '#f59e0b');
    }
  };

  // Save
  document.getElementById('ce-save').onclick = () => {
    const code = codeArea.value;
    const name = document.getElementById('ce-name').value || 'Untitled';
    const id = _currentScriptId || 'script_' + Date.now();
    _currentScriptId = id;

    window._userScripts = (window._userScripts || []).filter(s => s.id !== id);
    window._userScripts.push({ id, name, description: '', code, enabled: true });

    const saved = window._userScripts.map(s => ({ id: s.id, name: s.name, description: s.description, code: s.code, enabled: s.enabled }));
    localStorage.setItem('crate-user-scripts', JSON.stringify(saved));
    _appendConsole('Saved "' + name + '"', '#7c5cff');
  };

  // List saved scripts
  document.getElementById('ce-list').onclick = () => {
    const scripts = window._userScripts || [];
    if (!scripts.length) { _appendConsole('No saved scripts', '#666'); return; }
    scripts.forEach(s => {
      _appendConsole((s._running ? '🟢' : '⚪') + ' ' + s.name + ' [' + s.id + ']', s._running ? '#4ade80' : '#888');
    });
  };

  // Clear console
  document.getElementById('ce-clear-console').onclick = () => {
    if (_consoleEl) _consoleEl.innerHTML = '';
  };

  // Show welcome
  _appendConsole('Crate Engine Code Editor ready', '#7c5cff');
  _appendConsole('Use Templates dropdown for examples', '#555');
  _appendConsole('Type code and press ▶ Run', '#555');

  window.dispatchEvent(new Event('resize'));
}

export { TEMPLATES };
