const STORAGE_KEY = 'crate-game-builder-open';
const BLUEPRINT_STORAGE_KEY = 'crate-game-builder-blueprints';
const PROJECT_SAVE_KEY = 'crate-saves';

const SCRIPT_PRESETS = {
  inventory: {
    id: 'gb_inventory_hotbar',
    name: 'Inventory + Equipment',
    description: 'Five-slot inventory, equipment slots, and player stat display.',
    code: `state.gbInventory = Array.isArray(state.gbInventory) ? state.gbInventory : [null, null, null, null, null];
while (state.gbInventory.length < 5) state.gbInventory.push(null);
state.gbInventory = state.gbInventory.slice(0, 5);
state.gbInventoryItems = Array.isArray(state.gbInventoryItems) ? state.gbInventoryItems : [];
state.gbInventorySlot = state.gbInventorySlot || 0;
state.gbEquipment = state.gbEquipment || { weapon: null, armor: null, trinket: null };
state.gbPlayerStats = state.gbPlayerStats || { level: 1, xp: 0, attack: 10, defense: 0, speed: 1, attackRange: 4 };

function escapeInventory(value) {
  return String(value || '').replace(/[&<>"']/g, function(ch) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
  });
}

function normalizeInventoryItem(raw, fallbackName) {
  if (raw && typeof raw === 'object') {
    return {
      id: raw.id || ('item_' + Date.now() + '_' + Math.floor(Math.random() * 1000)),
      name: raw.name || raw.item || fallbackName || 'Item',
      type: raw.type || 'item',
      slot: raw.slot || '',
      power: Number(raw.power) || 0,
      score: Number(raw.score) || 0,
      xp: Number(raw.xp) || 0,
    };
  }
  return {
    id: 'item_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    name: raw || fallbackName || 'Item',
    type: 'item',
    slot: '',
    power: 0,
    score: 0,
    xp: 0,
  };
}

function getEquippedBonus(slot) {
  const item = state.gbEquipment && state.gbEquipment[slot];
  return item && Number(item.power) ? Number(item.power) : 0;
}

function getStats() {
  const stats = state.gbPlayerStats || {};
  return {
    level: Math.max(1, Number(stats.level) || 1),
    xp: Math.max(0, Number(stats.xp) || 0),
    attack: Math.max(0, Number(stats.attack) || 10) + getEquippedBonus('weapon') + getEquippedBonus('trinket'),
    defense: Math.max(0, Number(stats.defense) || 0) + getEquippedBonus('armor'),
    speed: Math.max(0.1, Number(stats.speed) || 1),
    attackRange: Math.max(1, Number(stats.attackRange) || 4),
  };
}

function addPlayerXp(amount) {
  const gain = Math.max(0, Number(amount) || 0);
  if (!gain) return;
  state.gbPlayerStats.xp = Math.max(0, Number(state.gbPlayerStats.xp) || 0) + gain;
  while (state.gbPlayerStats.xp >= state.gbPlayerStats.level * 100) {
    state.gbPlayerStats.xp -= state.gbPlayerStats.level * 100;
    state.gbPlayerStats.level += 1;
    state.gbPlayerStats.attack += 2;
    state.gbPlayerStats.defense += 1;
    showToast('Level up: ' + state.gbPlayerStats.level);
  }
}

function equipInventoryItem(item) {
  if (!item || !item.slot) return false;
  if (!['weapon', 'armor', 'trinket'].includes(item.slot)) return false;
  state.gbEquipment[item.slot] = item;
  state.gbRuntime = state.gbRuntime || {};
  state.gbRuntime.lastEquippedItem = { name: item.name, slot: item.slot, power: item.power };
  showToast('Equipped ' + item.slot + ': ' + item.name);
  return true;
}

function addInventoryItem(raw, options) {
  const item = normalizeInventoryItem(raw, options && options.name);
  state.gbInventoryItems.push(item);
  const preferred = Math.max(0, Math.min(4, Number(state.gbInventorySlot) || 0));
  let slot = state.gbInventory.findIndex((entry) => !entry);
  if (slot < 0) slot = preferred;
  state.gbInventory[slot] = item;
  state.gbInventorySlot = slot;
  if (item.xp) addPlayerXp(item.xp);
  if (item.slot) equipInventoryItem(item);
  state.gbRuntime = state.gbRuntime || {};
  state.gbRuntime.lastInventoryItem = { name: item.name, slot: item.slot || '', power: item.power || 0, xp: item.xp || 0 };
  showToast('Added item: ' + item.name);
  return item;
}

let hotbar = document.getElementById('gb-hotbar');
if (!hotbar) {
  hotbar = document.createElement('div');
  hotbar.id = 'gb-hotbar';
  hotbar.style.cssText = 'position:fixed;bottom:48px;left:50%;transform:translateX(-50%);z-index:760;display:flex;gap:6px;pointer-events:none;font-family:monospace';
  document.body.appendChild(hotbar);
}

function renderHotbar() {
  hotbar.innerHTML = state.gbInventory.map((item, index) => {
    item = normalizeInventoryItem(item, '');
    const active = index === state.gbInventorySlot;
    const label = state.gbInventory[index] ? escapeInventory(item.name).slice(0, 8) : '';
    const slot = item && item.slot ? escapeInventory(item.slot).slice(0, 5) : '';
    return '<div style="width:58px;height:56px;border:' + (active ? '2px solid #59d987' : '1px solid #333') + ';background:' + (active ? 'rgba(89,217,135,0.14)' : 'rgba(5,5,5,0.78)') + ';border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#f5f5f5;font-size:10px;line-height:13px"><span style="color:#888">' + (index + 1) + '</span><span>' + label + '</span><span style="color:#9ee7ff">' + slot + '</span></div>';
  }).join('');
  const stats = getStats();
  const equipment = state.gbEquipment || {};
  const equipmentRows = ['weapon', 'armor', 'trinket'].map((slot) => {
    const item = equipment[slot];
    return '<div style="display:flex;justify-content:space-between;gap:8px"><span>' + slot + '</span><strong>' + escapeInventory(item ? item.name : '-') + '</strong></div>';
  }).join('');
  hotbar.innerHTML += '<div style="min-width:172px;border:1px solid #2f3536;background:rgba(5,5,5,0.78);border-radius:8px;padding:7px 8px;color:#dfe6ea;font-size:10px;line-height:14px">' +
    '<div style="display:flex;justify-content:space-between;color:#59d987"><strong>Stats</strong><span>Lv ' + stats.level + '</span></div>' +
    '<div style="display:flex;justify-content:space-between"><span>ATK</span><strong>' + stats.attack + '</strong><span>DEF</span><strong>' + stats.defense + '</strong></div>' +
    '<div style="display:flex;justify-content:space-between"><span>XP</span><strong>' + Math.round(stats.xp) + '/' + (stats.level * 100) + '</strong></div>' +
    equipmentRows +
    '</div>';
}

onKeyPress = function(key) {
  if (key >= '1' && key <= '5') {
    state.gbInventorySlot = Number(key) - 1;
    renderHotbar();
  }
  if (key === 'q') {
    const item = state.gbInventory[state.gbInventorySlot];
    if (item) equipInventoryItem(normalizeInventoryItem(item, 'Item'));
    renderHotbar();
  }
  if (key === 'e' && !playMode()) {
    const player = getPlayer();
    if (!player) return;
    let closest = null;
    let closestDistance = 3;
    getObjects().forEach((obj) => {
      if (!obj.userData || !obj.userData.name) return;
      const distance = player.position.distanceTo(obj.position);
      if (distance < closestDistance) {
        closest = obj;
        closestDistance = distance;
      }
    });
    if (closest) {
      addInventoryItem({ name: closest.userData.name || 'Item', type: 'world' });
      scene.remove(closest);
      renderHotbar();
    }
  }
};

onUpdate = function() {
  renderHotbar();
};`,
  },
  hud: {
    id: 'gb_game_hud',
    name: 'Game HUD',
    description: 'Health, score, and level display.',
    code: `state.gbHealth = state.gbHealth || 100;
state.gbScore = state.gbScore || 0;
state.gbLevel = state.gbLevel || 1;

let hud = document.getElementById('gb-game-hud');
if (!hud) {
  hud = document.createElement('div');
  hud.id = 'gb-game-hud';
  hud.style.cssText = 'position:fixed;top:76px;right:18px;z-index:740;width:190px;background:rgba(8,8,10,0.82);border:1px solid #2f3536;border-radius:8px;padding:10px 12px;color:#f5f5f5;font-family:monospace;font-size:12px;pointer-events:none';
  document.body.appendChild(hud);
}

onUpdate = function(dt) {
  state.gbHealth = Math.min(100, state.gbHealth + dt * 1.5);
  const health = Math.max(0, Math.round(state.gbHealth));
  const fill = Math.max(0, Math.min(100, health));
  hud.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>HP</span><span>' + health + '</span></div>' +
    '<div style="height:7px;background:#1c2021;border-radius:6px;overflow:hidden;margin-bottom:8px"><div style="height:100%;width:' + fill + '%;background:#59d987"></div></div>' +
    '<div style="display:flex;justify-content:space-between"><span>Score</span><span>' + state.gbScore + '</span></div>' +
    '<div style="display:flex;justify-content:space-between"><span>Level</span><span>' + state.gbLevel + '</span></div>';
};`,
  },
  quest: {
    id: 'gb_quest_tracker',
    name: 'Quest Tracker',
    description: 'Basic objective tracker.',
    code: `state.gbQuests = state.gbQuests || [
  { name: 'Find supplies', current: 0, target: 3 },
  { name: 'Reach the marker', current: 0, target: 1 }
];

let panel = document.getElementById('gb-quest-tracker');
if (!panel) {
  panel = document.createElement('div');
  panel.id = 'gb-quest-tracker';
  panel.style.cssText = 'position:fixed;top:210px;right:18px;z-index:740;width:210px;background:rgba(8,8,10,0.82);border:1px solid #2f3536;border-radius:8px;padding:10px 12px;color:#f5f5f5;font-family:monospace;font-size:12px;pointer-events:none';
  document.body.appendChild(panel);
}

onUpdate = function() {
  panel.innerHTML = '<div style="color:#80b7ff;margin-bottom:8px;font-weight:700">Objectives</div>' +
    state.gbQuests.map((quest) => {
      const done = quest.current >= quest.target;
      return '<div style="margin-bottom:7px;color:' + (done ? '#59d987' : '#e5e5e5') + '">' + (done ? '[x] ' : '[ ] ') + quest.name + '<div style="height:4px;background:#1c2021;border-radius:4px;margin-top:3px;overflow:hidden"><div style="height:100%;width:' + Math.min(100, quest.current / quest.target * 100) + '%;background:#80b7ff"></div></div></div>';
    }).join('');
};`,
  },
  pickups: {
    id: 'gb_coin_pickups',
    name: 'Pickup Loop',
    description: 'Collectible objects that add score.',
    code: `state.gbPickupScore = state.gbPickupScore || 0;
state.gbPickupsReady = state.gbPickupsReady || false;

if (!state.gbPickupsReady) {
  for (let i = 0; i < 12; i++) {
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 0.08, 24),
      new THREE.MeshStandardMaterial({ color: 0xf6c34a, emissive: 0x6b4700, emissiveIntensity: 0.5 })
    );
    coin.position.set((Math.random() - 0.5) * 34, 1, (Math.random() - 0.5) * 34);
    coin.rotation.x = Math.PI / 2;
    coin.userData.name = 'coin_pickup';
    scene.add(coin);
  }
  state.gbPickupsReady = true;
  showToast('Pickups added');
}

onUpdate = function(dt) {
  const player = getPlayer();
  getObjects().forEach((obj) => {
    if (obj.userData.name !== 'coin_pickup') return;
    obj.rotation.z += dt * 2.8;
    if (player && player.position.distanceTo(obj.position) < 2) {
      scene.remove(obj);
      state.gbPickupScore += 10;
      showToast('+10 score');
    }
  });
};`,
  },
  components: {
    id: 'gb_component_runtime',
    name: 'Component Runtime',
    description: 'Runs pickup, equipment, NPC, merchant, damage, mission, reward, gate, enemy, objective, checkpoint, spawn, win, and motion tags from Game Builder.',
    code: `state.gbRuntime = state.gbRuntime || {};
state.gbRuntime.health = state.gbRuntime.health ?? 100;
state.gbRuntime.score = state.gbRuntime.score || 0;
state.gbRuntime.objectives = state.gbRuntime.objectives || {};
state.gbRuntime.checkpoints = state.gbRuntime.checkpoints || {};
state.gbRuntime.spawnPoints = state.gbRuntime.spawnPoints || {};
state.gbRuntime.doors = state.gbRuntime.doors || {};
state.gbRuntime.triggers = state.gbRuntime.triggers || {};
state.gbRuntime.missionSteps = state.gbRuntime.missionSteps || {};
state.gbRuntime.rewards = state.gbRuntime.rewards || {};
state.gbRuntime.gates = state.gbRuntime.gates || {};
state.gbRuntime.enemySpawns = state.gbRuntime.enemySpawns || {};
state.gbRuntime.waves = state.gbRuntime.waves || {};
state.gbRuntime.enemies = state.gbRuntime.enemies || {};
state.gbRuntime.npcs = state.gbRuntime.npcs || {};
state.gbRuntime.merchants = state.gbRuntime.merchants || {};
state.gbRuntime.dialogue = state.gbRuntime.dialogue || null;
state.gbRuntime.winConditions = state.gbRuntime.winConditions || {};
state.gbInventory = Array.isArray(state.gbInventory) ? state.gbInventory : [null, null, null, null, null];
while (state.gbInventory.length < 5) state.gbInventory.push(null);
state.gbInventory = state.gbInventory.slice(0, 5);
state.gbInventoryItems = Array.isArray(state.gbInventoryItems) ? state.gbInventoryItems : [];
state.gbInventorySlot = state.gbInventorySlot || 0;
state.gbEquipment = state.gbEquipment || { weapon: null, armor: null, trinket: null };
state.gbPlayerStats = state.gbPlayerStats || { level: 1, xp: 0, attack: 10, defense: 0, speed: 1, attackRange: 4 };
state.gbRuntime.playerStats = state.gbPlayerStats;
state.gbRuntime.gameComplete = state.gbRuntime.gameComplete || false;
state.gbRuntime.gameOver = state.gbRuntime.gameOver || false;
state.gbRuntime.respawns = state.gbRuntime.respawns || 0;
state.gbRuntime.lastRespawnAt = state.gbRuntime.lastRespawnAt || -999;
state.gbRuntime.spawnActivated = state.gbRuntime.spawnActivated || false;

function escapeHud(value) {
  return String(value || '').replace(/[&<>"']/g, function(ch) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
  });
}

function getPlayerPosition() {
  const player = getPlayer();
  if (player && player.position) return player.position;
  if (player && player.model && player.model.position) return player.model.position;
  if (camera && camera.position) return camera.position;
  return null;
}

function copyPosition(pos, yOffset) {
  return {
    x: Number(pos && pos.x) || 0,
    y: (Number(pos && pos.y) || 0) + (Number(yOffset) || 0),
    z: Number(pos && pos.z) || 0,
  };
}

function distanceBetween(a, b) {
  if (!a || !b) return Infinity;
  const dx = (Number(a.x) || 0) - (Number(b.x) || 0);
  const dy = (Number(a.y) || 0) - (Number(b.y) || 0);
  const dz = (Number(a.z) || 0) - (Number(b.z) || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function getDoorOpenPosition(closed, door) {
  const axis = String(door.axis || 'y').toLowerCase();
  const distance = Number(door.distance) || 3;
  const open = { x: closed.x, y: closed.y, z: closed.z };
  if (axis === 'x') open.x += distance;
  else if (axis === 'z') open.z += distance;
  else open.y += distance;
  return open;
}

function setObjectPosition(obj, pos) {
  if (!obj || !obj.position || typeof obj.position.set !== 'function') return;
  obj.position.set(pos.x, pos.y, pos.z);
}

function getGateOpenPosition(closed, gate) {
  return getDoorOpenPosition(closed, { axis: gate.axis || 'y', distance: gate.distance || 3 });
}

function isRequirementMet(requiredStepId, steps) {
  const required = String(requiredStepId || '').trim();
  const rows = Object.values(steps || {});
  if (!required || required === 'none') return true;
  if (required === 'all') return rows.length > 0 && rows.every((item) => item.done);
  if (required === 'any') return rows.some((item) => item.done);
  return !!steps?.[required]?.done;
}

function normalizeRuntimeItem(config, fallbackName) {
  const source = config || {};
  const name = source.name || source.item || fallbackName || 'Item';
  return {
    id: source.id || ('item_' + Date.now() + '_' + Math.floor(Math.random() * 1000)),
    name,
    type: source.type || (source.slot ? 'equipment' : 'item'),
    slot: source.slot || '',
    power: Number(source.power) || 0,
    score: Number(source.score) || 0,
    xp: Number(source.xp) || 0,
  };
}

function getEquippedBonus(slot) {
  const item = state.gbEquipment && state.gbEquipment[slot];
  return item && Number(item.power) ? Number(item.power) : 0;
}

function getRuntimeStats() {
  const stats = state.gbPlayerStats || {};
  return {
    level: Math.max(1, Number(stats.level) || 1),
    xp: Math.max(0, Number(stats.xp) || 0),
    attack: Math.max(0, Number(stats.attack) || 10) + getEquippedBonus('weapon') + getEquippedBonus('trinket'),
    defense: Math.max(0, Number(stats.defense) || 0) + getEquippedBonus('armor'),
    speed: Math.max(0.1, Number(stats.speed) || 1),
    attackRange: Math.max(1, Number(stats.attackRange) || 4),
  };
}

function addPlayerXp(amount) {
  const gain = Math.max(0, Number(amount) || 0);
  if (!gain) return;
  state.gbPlayerStats.xp = Math.max(0, Number(state.gbPlayerStats.xp) || 0) + gain;
  while (state.gbPlayerStats.xp >= state.gbPlayerStats.level * 100) {
    state.gbPlayerStats.xp -= state.gbPlayerStats.level * 100;
    state.gbPlayerStats.level += 1;
    state.gbPlayerStats.attack += 2;
    state.gbPlayerStats.defense += 1;
    showToast('Level up: ' + state.gbPlayerStats.level);
  }
  state.gbRuntime.playerStats = state.gbPlayerStats;
}

function equipRuntimeItem(item) {
  if (!item || !item.slot) return false;
  if (!['weapon', 'armor', 'trinket'].includes(item.slot)) return false;
  state.gbEquipment[item.slot] = item;
  state.gbRuntime.lastEquippedItem = { name: item.name, slot: item.slot, power: item.power || 0 };
  return true;
}

function addInventoryItem(item) {
  state.gbInventoryItems.push(item);
  const preferred = Math.max(0, Math.min(4, Number(state.gbInventorySlot) || 0));
  let slotIndex = state.gbInventory.findIndex((entry) => !entry);
  if (slotIndex < 0) slotIndex = preferred;
  state.gbInventory[slotIndex] = item;
  state.gbInventorySlot = slotIndex;
  if (item.xp) addPlayerXp(item.xp);
  if (item.slot) equipRuntimeItem(item);
  state.gbRuntime.lastInventoryItem = { name: item.name, slot: item.slot || '', power: item.power || 0, xp: item.xp || 0 };
  return item;
}

function grantRuntimeItem(config, fallbackName, source) {
  const item = normalizeRuntimeItem(config, fallbackName);
  if (item.score) state.gbRuntime.score += item.score;
  addInventoryItem(item);
  state.gbRuntime.lastItemGrant = {
    name: item.name,
    slot: item.slot || '',
    power: item.power || 0,
    score: item.score || 0,
    xp: item.xp || 0,
    source: source || 'gameplay',
  };
  showToast('Item: ' + item.name);
  return item;
}

function getAttackDamage() {
  return Math.max(1, Math.round(getRuntimeStats().attack));
}

function getAttackRange() {
  return Math.max(1, Number(getRuntimeStats().attackRange) || 4);
}

function findClosestRuntimeRecord(records, playerPos) {
  const rows = Object.values(records || {}).filter((record) => record && record.position);
  let closest = null;
  let closestDistance = Infinity;
  rows.forEach((record) => {
    if (record.available === false) return;
    const radius = Math.max(0.5, Number(record.radius) || 3);
    const distance = distanceBetween(playerPos, record.position);
    if (distance <= radius && distance < closestDistance) {
      closest = record;
      closestDistance = distance;
    }
  });
  return closest;
}

function setRuntimeDialogue(type, speaker, text, time) {
  const dialogue = {
    type: type || 'dialogue',
    speaker: speaker || 'NPC',
    text: text || '',
    at: time || Date.now() * 0.001,
  };
  state.gbRuntime.dialogue = dialogue;
  state.gbRuntime.lastDialogue = dialogue;
  showToast(dialogue.speaker + ': ' + String(dialogue.text || '').slice(0, 52));
  return dialogue;
}

function interactClosestNpc(time) {
  const playerPos = getPlayerPosition();
  if (!playerPos) return false;
  const npc = findClosestRuntimeRecord(state.gbRuntime.npcs, playerPos);
  if (!npc) return false;
  npc.talked = true;
  npc.talkCount = (Number(npc.talkCount) || 0) + 1;
  npc.lastTalkedAt = time || Date.now() * 0.001;
  setRuntimeDialogue('npc', npc.name || 'NPC', npc.dialogue || 'Hello.', npc.lastTalkedAt);
  const hasReward = !!npc.rewardItem || Number(npc.rewardScore) > 0 || Number(npc.rewardXp) > 0;
  if (hasReward && !npc.rewardClaimed) {
    if (npc.rewardItem) {
      grantRuntimeItem({
        name: npc.rewardItem,
        item: npc.rewardItem,
        type: npc.rewardSlot ? 'equipment' : 'npcReward',
        slot: npc.rewardSlot || '',
        power: Number(npc.rewardPower) || 0,
        score: Number(npc.rewardScore) || 0,
        xp: Number(npc.rewardXp) || 0,
      }, npc.rewardItem, 'npcReward');
    } else {
      state.gbRuntime.score += Math.max(0, Number(npc.rewardScore) || 0);
      addPlayerXp(Math.max(0, Number(npc.rewardXp) || 0));
    }
    npc.rewardClaimed = true;
  }
  state.gbRuntime.npcs[npc.id] = npc;
  state.gbRuntime.activeNpc = npc;
  return true;
}

function interactClosestMerchant(time) {
  const playerPos = getPlayerPosition();
  if (!playerPos) return false;
  const merchant = findClosestRuntimeRecord(state.gbRuntime.merchants, playerPos);
  if (!merchant) return false;
  merchant.visited = true;
  merchant.lastVisitedAt = time || Date.now() * 0.001;
  const stock = Math.max(0, Number(merchant.stock) || 0);
  const sold = Math.max(0, Number(merchant.sold) || 0);
  if (stock > 0 && sold >= stock) {
    setRuntimeDialogue('merchant', merchant.name || 'Merchant', 'Sold out: ' + merchant.item, merchant.lastVisitedAt);
    state.gbRuntime.merchants[merchant.id] = merchant;
    return true;
  }
  const price = Math.max(0, Number(merchant.price) || 0);
  if ((Number(state.gbRuntime.score) || 0) < price) {
    setRuntimeDialogue('merchant', merchant.name || 'Merchant', 'Need ' + price + ' score for ' + merchant.item, merchant.lastVisitedAt);
    state.gbRuntime.merchants[merchant.id] = merchant;
    return true;
  }
  state.gbRuntime.score = Math.max(0, (Number(state.gbRuntime.score) || 0) - price);
  const item = grantRuntimeItem({
    name: merchant.item || 'Merchant item',
    item: merchant.item || 'Merchant item',
    type: merchant.slot ? 'equipment' : 'merchant',
    slot: merchant.slot || '',
    power: Number(merchant.power) || 0,
    score: 0,
    xp: Number(merchant.xp) || 0,
  }, merchant.item || 'Merchant item', 'merchant');
  merchant.sold = sold + 1;
  merchant.lastPurchase = item.name;
  state.gbRuntime.lastPurchase = {
    merchant: merchant.name || 'Merchant',
    item: item.name,
    price,
    sold: merchant.sold,
    purchasedAt: merchant.lastVisitedAt,
  };
  setRuntimeDialogue('merchant', merchant.name || 'Merchant', 'Purchased ' + item.name, merchant.lastVisitedAt);
  state.gbRuntime.merchants[merchant.id] = merchant;
  state.gbRuntime.activeMerchant = merchant;
  return true;
}

function movePlayerTo(target) {
  if (!target || !target.position) return false;
  const pos = target.position;
  const player = getPlayer();
  const y = Number(pos.y) || 0;
  if (player && player.position && typeof player.position.set === 'function') {
    player.position.set(pos.x, y, pos.z);
  }
  if (player && player.model && player.model.position && typeof player.model.position.set === 'function') {
    player.model.position.set(pos.x, y, pos.z);
  }
  if (player && player.collider && typeof player.collider.teleport === 'function') {
    player.collider.teleport(pos.x, y, pos.z);
  }
  if ((!player || !player.model) && camera && camera.position && typeof camera.position.set === 'function') {
    camera.position.set(pos.x, y + 1.6, pos.z);
  }
  return true;
}

function getRespawnTarget() {
  return state.gbRuntime.activeCheckpoint || state.gbRuntime.activeSpawn || null;
}

function respawnPlayer(time) {
  const target = getRespawnTarget();
  if (!target || !target.position) return false;
  if (time - (state.gbRuntime.lastRespawnAt || -999) < 1.25) return false;
  state.gbRuntime.lastRespawnAt = time;
  state.gbRuntime.respawns += 1;
  state.gbRuntime.health = 100;
  state.gbRuntime.gameOver = false;
  movePlayerTo(target);
  showToast('Respawned at: ' + target.label);
  return true;
}

function getObjectRegistry() {
  const objects = getObjects();
  return Array.isArray(objects) ? objects : [];
}

function addRuntimeObject(obj) {
  const objects = getObjectRegistry();
  if (obj && !objects.includes(obj)) objects.push(obj);
}

function removeRuntimeObject(obj) {
  const objects = getObjectRegistry();
  const index = objects.indexOf(obj);
  if (index >= 0) objects.splice(index, 1);
}

function removeEnemyRecord(record) {
  if (!record || !record.mesh) return;
  if (record.mesh.parent) record.mesh.parent.remove(record.mesh);
  else scene.remove(record.mesh);
  removeRuntimeObject(record.mesh);
}

function clearRuntimeEnemies() {
  Object.values(state.gbRuntime.enemies || {}).forEach((record) => removeEnemyRecord(record));
  state.gbRuntime.enemies = {};
}

function getEnemySpawnForWave(wave, spawns) {
  const rows = Object.values(spawns || {});
  if (!rows.length) return null;
  const target = String(wave.spawnGroup || 'nearest').trim().toLowerCase();
  if (target && target !== 'nearest' && target !== 'all') {
    const exact = rows.find((spawn) => String(spawn.id || '').toLowerCase() === target || String(spawn.label || '').toLowerCase() === target);
    if (exact) return exact;
  }
  return rows[0];
}

function createRuntimeEnemy(spawn, wave, index) {
  const waveId = wave.id || 'wave';
  const id = waveId + '_enemy_' + index;
  const existing = state.gbRuntime.enemies[id];
  if (existing && existing.mesh && existing.mesh.parent) return existing;
  if (existing && existing.mesh) removeRuntimeObject(existing.mesh);
  const geometry = THREE.CapsuleGeometry
    ? new THREE.CapsuleGeometry(0.45, 1.15, 4, 8)
    : new THREE.BoxGeometry(0.9, 1.6, 0.9);
  const material = new THREE.MeshStandardMaterial({ color: 0xb84a4a, emissive: 0x421010, emissiveIntensity: 0.45, roughness: 0.75 });
  const mesh = new THREE.Mesh(geometry, material);
  const radius = Math.max(0, Number(spawn.radius) || 2);
  const count = Math.max(1, Number(wave.count) || Number(spawn.count) || 1);
  const angle = count > 1 ? index / count * Math.PI * 2 : 0;
  const base = spawn.position || { x: 0, y: 0, z: 0 };
  mesh.position.set(
    (Number(base.x) || 0) + Math.cos(angle) * radius,
    (Number(base.y) || 0) + 0.85,
    (Number(base.z) || 0) + Math.sin(angle) * radius
  );
  mesh.userData = mesh.userData || {};
  mesh.userData.name = (wave.label || 'Wave') + ' enemy ' + (index + 1);
  mesh.userData.gbRuntimeEnemy = true;
  mesh.userData.gbEnemyId = id;
  mesh.userData.interactable = false;
  scene.add(mesh);
  addRuntimeObject(mesh);
  const health = Math.max(1, Number(wave.enemyHealth) || Number(spawn.health) || 30);
  const record = {
    id,
    waveId,
    spawnId: spawn.id || '',
    label: mesh.userData.name,
    mesh,
    alive: true,
    health,
    maxHealth: health,
    speed: Math.max(0, Number(wave.enemySpeed) || Number(spawn.speed) || 1.2),
    damage: Math.max(0, Number(wave.enemyDamage) || Number(spawn.damage) || 5),
    attackRadius: Math.max(0.25, Number(wave.attackRadius) || Number(spawn.attackRadius) || 2.3),
    attackCooldown: Math.max(0.15, Number(wave.attackCooldown) || Number(spawn.attackCooldown) || 1.2),
    dropItem: wave.dropItem || spawn.dropItem || 'Enemy scrap',
    dropSlot: wave.dropSlot || spawn.dropSlot || '',
    dropPower: Math.max(0, Number(wave.dropPower) || Number(spawn.dropPower) || 0),
    dropScore: Math.max(0, Number(wave.dropScore) || Number(spawn.dropScore) || 5),
    dropXp: Math.max(0, Number(wave.dropXp) || Number(spawn.dropXp) || 10),
    dropChance: Math.max(0, Math.min(1, Number(wave.dropChance) > 0 ? Number(wave.dropChance) : Number(spawn.dropChance ?? 1))),
    lastAttackAt: -999,
    position: copyPosition(mesh.position, 0),
  };
  state.gbRuntime.enemies[id] = record;
  return record;
}

function defeatEnemy(record, time) {
  if (!record || !record.alive) return false;
  record.alive = false;
  record.defeatedAt = time;
  record.health = 0;
  removeEnemyRecord(record);
  record.mesh = null;
  state.gbRuntime.lastEnemyDefeated = { id: record.id, label: record.label, waveId: record.waveId, defeatedAt: time };
  const chance = Math.max(0, Math.min(1, Number(record.dropChance) || 0));
  if (chance > 0 && (chance >= 1 || Math.random() <= chance)) {
    grantRuntimeItem({
      name: record.dropItem || 'Enemy scrap',
      item: record.dropItem || 'Enemy scrap',
      type: record.dropSlot ? 'equipment' : 'drop',
      slot: record.dropSlot || '',
      power: record.dropPower || 0,
      score: record.dropScore || 0,
      xp: record.dropXp || 0,
    }, record.dropItem || 'Enemy scrap', 'enemyDrop');
  }
  showToast('Enemy defeated: ' + record.label);
  return true;
}

function damageClosestEnemy(amount, radius, time) {
  const playerPos = getPlayerPosition();
  if (!playerPos) return false;
  const enemies = Object.values(state.gbRuntime.enemies || {}).filter((record) => record && record.alive && record.mesh && record.mesh.position);
  let closest = null;
  let closestDistance = Math.max(0.5, Number(radius) || 4);
  enemies.forEach((record) => {
    const distance = distanceBetween(playerPos, record.mesh.position);
    if (distance < closestDistance) {
      closest = record;
      closestDistance = distance;
    }
  });
  if (!closest) return false;
  closest.health = Math.max(0, (Number(closest.health) || 0) - (Number(amount) || 20));
  if (closest.health <= 0) return defeatEnemy(closest, time);
  showToast('Enemy hit: ' + closest.label);
  return true;
}

function updateRuntimeEnemy(record, dt, playerPos, time) {
  if (!record || !record.alive || !record.mesh || !record.mesh.position) return;
  if (playerPos) {
    const distance = distanceBetween(record.mesh.position, playerPos);
    if (distance > 0.05 && record.speed > 0) {
      const step = Math.min(distance, record.speed * dt);
      record.mesh.position.x += ((Number(playerPos.x) || 0) - record.mesh.position.x) / distance * step;
      record.mesh.position.z += ((Number(playerPos.z) || 0) - record.mesh.position.z) / distance * step;
      if (typeof record.mesh.lookAt === 'function') record.mesh.lookAt(playerPos.x, record.mesh.position.y, playerPos.z);
    }
    if (distance < record.attackRadius && time - (record.lastAttackAt || -999) > record.attackCooldown) {
      record.lastAttackAt = time;
      if (record.damage > 0) {
        state.gbRuntime.health = Math.max(0, state.gbRuntime.health - record.damage);
        showToast('Enemy hit: -' + record.damage);
      }
    }
  }
  record.position = copyPosition(record.mesh.position, 0);
}

function startWaveIfReady(wave, spawns, time) {
  if (!wave || wave.spawned || wave.complete) return;
  const spawn = getEnemySpawnForWave(wave, spawns);
  if (!spawn) return;
  const count = Math.max(1, Number(wave.count) || Number(spawn.count) || 3);
  for (let i = 0; i < count; i += 1) createRuntimeEnemy(spawn, wave, i);
  wave.spawned = true;
  wave.startedAt = time;
  wave.active = true;
  wave.complete = false;
  showToast('Wave started: ' + wave.label);
}

function updateWaveSummary(wave, time) {
  if (!wave) return;
  const enemies = Object.values(state.gbRuntime.enemies || {}).filter((record) => record && record.waveId === wave.id);
  const alive = enemies.filter((record) => record.alive).length;
  const defeated = enemies.filter((record) => !record.alive).length;
  const wasComplete = wave.complete === true;
  wave.alive = alive;
  wave.defeated = defeated;
  wave.active = wave.spawned && alive > 0;
  wave.complete = wave.spawned && enemies.length > 0 && alive === 0;
  if (!wasComplete && wave.complete) {
    const score = Math.max(0, Number(wave.rewardScore) || 0);
    if (score > 0) state.gbRuntime.score += score;
    state.gbRuntime.lastWaveComplete = { id: wave.id, label: wave.label, defeated, completedAt: time };
    showToast('Wave cleared: ' + wave.label);
  }
}

function getComponentHud() {
  let hud = document.getElementById('gb-component-hud');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'gb-component-hud';
    hud.style.cssText = 'position:fixed;right:18px;bottom:48px;z-index:735;width:220px;background:rgba(8,8,10,0.82);border:1px solid #2f3536;border-radius:8px;padding:10px 12px;color:#f5f5f5;font-family:monospace;font-size:12px;pointer-events:none';
    document.body.appendChild(hud);
  }
  return hud;
}

function renderComponentHud() {
  const objectiveRows = Object.values(state.gbRuntime.objectives || {});
  const objectives = objectiveRows.length ? objectiveRows.map((item) => {
    return '<div style="color:' + (item.done ? '#59d987' : '#d6e0e6') + '">' + (item.done ? '[x] ' : '[ ] ') + escapeHud(item.label) + '</div>';
  }).join('') : '<div style="color:#7d878e">No objectives tagged</div>';
  const spawn = state.gbRuntime.activeSpawn ? '<div style="color:#9ee7ff;margin-top:6px">Spawn: ' + escapeHud(state.gbRuntime.activeSpawn.label) + '</div>' : '';
  const checkpoint = state.gbRuntime.activeCheckpoint ? '<div style="color:#f6c34a;margin-top:6px">Checkpoint: ' + escapeHud(state.gbRuntime.activeCheckpoint.label) + '</div>' : '';
  const wins = Object.values(state.gbRuntime.winConditions || {});
  const winRows = wins.length ? '<div style="color:#80b7ff;margin-top:6px;margin-bottom:5px;font-weight:700">Win Goals</div>' + wins.map((item) => {
    return '<div style="color:' + (item.done ? '#59d987' : '#d6e0e6') + '">' + (item.done ? '[x] ' : '[ ] ') + escapeHud(item.label) + '</div>';
  }).join('') : '';
  const doors = Object.values(state.gbRuntime.doors || {});
  const doorRows = doors.length ? '<div style="color:#80b7ff;margin-top:6px;margin-bottom:5px;font-weight:700">Doors</div>' + doors.slice(0, 3).map((item) => {
    return '<div style="color:' + (item.open ? '#59d987' : '#d6e0e6') + '">' + (item.open ? '[open] ' : '[closed] ') + escapeHud(item.label) + '</div>';
  }).join('') : '';
  const trigger = state.gbRuntime.lastTrigger ? '<div style="color:#f6c34a;margin-top:6px">Trigger: ' + escapeHud(state.gbRuntime.lastTrigger.label) + '</div>' : '';
  const missionSteps = Object.values(state.gbRuntime.missionSteps || {}).sort((a, b) => (a.order || 0) - (b.order || 0));
  const missionRows = missionSteps.length ? '<div style="color:#80b7ff;margin-top:6px;margin-bottom:5px;font-weight:700">Mission</div>' + missionSteps.slice(0, 4).map((item) => {
    return '<div style="color:' + (item.done ? '#59d987' : '#d6e0e6') + '">' + (item.done ? '[x] ' : '[ ] ') + escapeHud(item.label) + '</div>';
  }).join('') : '';
  const reward = state.gbRuntime.lastReward ? '<div style="color:#59d987;margin-top:6px">Reward: ' + escapeHud(state.gbRuntime.lastReward.label) + '</div>' : '';
  const dialogue = state.gbRuntime.dialogue;
  const npcCount = Object.values(state.gbRuntime.npcs || {}).length;
  const merchantCount = Object.values(state.gbRuntime.merchants || {}).length;
  const npcRows = (npcCount || merchantCount || dialogue) ? '<div style="color:#80b7ff;margin-top:6px;margin-bottom:5px;font-weight:700">NPCs</div>' +
    (state.gbRuntime.activeNpc ? '<div style="color:#d6e0e6">Talk: ' + escapeHud(state.gbRuntime.activeNpc.name) + ' [T]</div>' : '') +
    (state.gbRuntime.activeMerchant ? '<div style="color:#d6e0e6">Buy: ' + escapeHud(state.gbRuntime.activeMerchant.item) + ' [E]</div>' : '') +
    (dialogue ? '<div style="color:#f6c34a;margin-top:4px">' + escapeHud(dialogue.speaker) + ': ' + escapeHud(dialogue.text) + '</div>' : '') +
    (state.gbRuntime.lastPurchase ? '<div style="color:#59d987;margin-top:4px">Bought: ' + escapeHud(state.gbRuntime.lastPurchase.item) + '</div>' : '') : '';
  const stats = getRuntimeStats();
  const equipment = state.gbEquipment || {};
  const statRows = '<div style="color:#80b7ff;margin-top:6px;margin-bottom:5px;font-weight:700">Player</div>' +
    '<div style="display:flex;justify-content:space-between;color:#d6e0e6"><span>Level ' + stats.level + '</span><span>ATK ' + stats.attack + ' | DEF ' + stats.defense + '</span></div>' +
    '<div style="color:#a9b3b8">Weapon: ' + escapeHud(equipment.weapon?.name || '-') + '</div>' +
    '<div style="color:#a9b3b8">Armor: ' + escapeHud(equipment.armor?.name || '-') + '</div>';
  const waves = Object.values(state.gbRuntime.waves || {});
  const enemies = Object.values(state.gbRuntime.enemies || {});
  const aliveEnemies = enemies.filter((item) => item && item.alive).length;
  const waveRows = waves.length ? '<div style="color:#80b7ff;margin-top:6px;margin-bottom:5px;font-weight:700">Waves</div>' + waves.slice(0, 3).map((item) => {
    const status = item.complete ? 'cleared' : item.active ? 'active' : item.spawned ? 'spawned' : 'ready';
    return '<div style="color:' + (item.complete ? '#59d987' : item.active ? '#ffb36b' : '#d6e0e6') + '">' + escapeHud(item.label) + ': ' + status + ' (' + (item.alive || 0) + '/' + (item.count || 0) + ')</div>';
  }).join('') : '';
  const enemyRows = aliveEnemies ? '<div style="color:#ffb36b;margin-top:6px">Enemies: ' + aliveEnemies + ' alive</div>' : '';
  const gameState = state.gbRuntime.gameComplete ? '<div style="margin-top:8px;color:#59d987;font-weight:700">Game Complete</div>' : state.gbRuntime.gameOver ? '<div style="margin-top:8px;color:#ff9b9b;font-weight:700">Game Over</div>' : '';
  getComponentHud().innerHTML =
    '<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>HP</span><span>' + Math.round(state.gbRuntime.health) + '</span></div>' +
    '<div style="height:7px;background:#1c2021;border-radius:6px;overflow:hidden;margin-bottom:8px"><div style="height:100%;width:' + Math.max(0, Math.min(100, state.gbRuntime.health)) + '%;background:#59d987"></div></div>' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Score</span><span>' + state.gbRuntime.score + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:8px;color:#a9b3b8"><span>Respawns</span><span>' + state.gbRuntime.respawns + '</span></div>' +
    '<div style="color:#80b7ff;margin-bottom:5px;font-weight:700">Objectives</div>' + objectives + missionRows + reward + npcRows + statRows + spawn + checkpoint + winRows + doorRows + trigger + waveRows + enemyRows + gameState;
}

onKeyPress = function(key) {
  if (!playMode()) return;
  const time = Date.now() * 0.001;
  if (key === 't') {
    if (interactClosestNpc(time)) return;
  }
  if (key === 'e') {
    if (interactClosestMerchant(time)) return;
    if (interactClosestNpc(time)) return;
  }
  if (key === 'f' || key === 'e' || key === ' ') {
    damageClosestEnemy(getAttackDamage(), getAttackRange(), Date.now() * 0.001);
  }
};

onUpdate = function(dt, time) {
  const playerPos = getPlayerPosition();
  const isPlaying = playMode();
  if (!isPlaying) {
    state.gbRuntime.spawnActivated = false;
    clearRuntimeEnemies();
  }
  const nextSpawnPoints = {};
  const nextDoors = {};
  const nextTriggers = {};
  const nextMissionSteps = {};
  const nextRewards = {};
  const nextGates = {};
  const nextEnemySpawns = {};
  const nextWaves = {};
  const nextNpcs = {};
  const nextMerchants = {};
  const triggerQueue = [];
  let firstPlayerSpawn = null;
  getObjects().forEach((obj) => {
    const components = obj && obj.userData && obj.userData.gbComponents;
    if (!components) return;

    if (isPlaying && components.spin) obj.rotation.y += dt * (components.spin.speed || 1.2);
    if (isPlaying && components.float) {
      const baseY = components.float.baseY ?? obj.position.y;
      components.float.baseY = baseY;
      obj.position.y = baseY + Math.sin(time * (components.float.speed || 1.8)) * (components.float.height || 0.45);
    }

    if (components.spawnPoint && obj.position) {
      const id = components.spawnPoint.id || obj.uuid;
      const kind = components.spawnPoint.kind || 'player';
      const label = components.spawnPoint.label || (kind === 'player' ? 'Player spawn' : 'Spawn point');
      const spawnRecord = {
        id,
        kind,
        label,
        radius: components.spawnPoint.radius || 1.5,
        position: copyPosition(obj.position, kind === 'player' ? 1.5 : 0),
      };
      nextSpawnPoints[id] = spawnRecord;
      if (kind === 'player' && !firstPlayerSpawn) firstPlayerSpawn = spawnRecord;
    }

    if (components.enemySpawn && obj.position) {
      const id = components.enemySpawn.id || obj.uuid;
      nextEnemySpawns[id] = {
        id,
        label: components.enemySpawn.label || obj.userData.name || 'Enemy spawn',
        enemyType: components.enemySpawn.enemyType || 'crawler',
        count: Math.max(1, Number(components.enemySpawn.count) || 3),
        radius: Math.max(0, Number(components.enemySpawn.radius) || 2),
        speed: Math.max(0, Number(components.enemySpawn.speed) || 1.2),
        damage: Math.max(0, Number(components.enemySpawn.damage) || 5),
        health: Math.max(1, Number(components.enemySpawn.health) || 30),
        attackRadius: Math.max(0.25, Number(components.enemySpawn.attackRadius) || 2.3),
        attackCooldown: Math.max(0.15, Number(components.enemySpawn.attackCooldown) || 1.2),
        dropItem: components.enemySpawn.dropItem || 'Enemy scrap',
        dropSlot: components.enemySpawn.dropSlot || '',
        dropPower: Math.max(0, Number(components.enemySpawn.dropPower) || 0),
        dropScore: Math.max(0, Number(components.enemySpawn.dropScore) || 5),
        dropXp: Math.max(0, Number(components.enemySpawn.dropXp) || 10),
        dropChance: Math.max(0, Math.min(1, Number(components.enemySpawn.dropChance ?? 1))),
        position: copyPosition(obj.position, 0),
      };
    }

    if (components.waveController) {
      const id = components.waveController.id || obj.uuid;
      const previous = state.gbRuntime.waves[id] || {};
      nextWaves[id] = {
        id,
        label: components.waveController.label || 'Wave ' + (components.waveController.wave || 1),
        wave: Number(components.waveController.wave) || 1,
        count: Math.max(1, Number(components.waveController.count) || 3),
        spawnGroup: components.waveController.spawnGroup || 'nearest',
        enemySpeed: Math.max(0, Number(components.waveController.enemySpeed) || 0),
        enemyDamage: Math.max(0, Number(components.waveController.enemyDamage) || 0),
        enemyHealth: Math.max(0, Number(components.waveController.enemyHealth) || 0),
        attackRadius: Math.max(0, Number(components.waveController.attackRadius) || 0),
        attackCooldown: Math.max(0, Number(components.waveController.attackCooldown) || 0),
        rewardScore: Math.max(0, Number(components.waveController.rewardScore) || 0),
        dropItem: components.waveController.dropItem || '',
        dropSlot: components.waveController.dropSlot || '',
        dropPower: Math.max(0, Number(components.waveController.dropPower) || 0),
        dropScore: Math.max(0, Number(components.waveController.dropScore) || 0),
        dropXp: Math.max(0, Number(components.waveController.dropXp) || 0),
        dropChance: Math.max(0, Math.min(1, Number(components.waveController.dropChance ?? 0))),
        spawned: isPlaying ? previous.spawned === true : false,
        startedAt: previous.startedAt || 0,
        alive: isPlaying ? previous.alive || 0 : 0,
        defeated: isPlaying ? previous.defeated || 0 : 0,
        active: isPlaying ? previous.active === true : false,
        complete: isPlaying ? previous.complete === true : false,
      };
    }

    if (components.npc && obj.position) {
      const id = components.npc.id || obj.uuid;
      const previous = state.gbRuntime.npcs[id] || {};
      const steps = { ...state.gbRuntime.missionSteps, ...nextMissionSteps };
      const available = isRequirementMet(components.npc.requiredStepId || 'none', steps);
      nextNpcs[id] = {
        id,
        name: components.npc.name || components.npc.label || obj.userData.name || 'NPC',
        role: components.npc.role || 'Guide',
        dialogue: components.npc.dialogue || 'Hello, builder.',
        questId: components.npc.questId || '',
        requiredStepId: components.npc.requiredStepId || 'none',
        rewardItem: components.npc.rewardItem || '',
        rewardSlot: components.npc.rewardSlot || '',
        rewardPower: Math.max(0, Number(components.npc.rewardPower) || 0),
        rewardScore: Math.max(0, Number(components.npc.rewardScore) || 0),
        rewardXp: Math.max(0, Number(components.npc.rewardXp) || 0),
        radius: Math.max(0.5, Number(components.npc.radius) || 3),
        talked: previous.talked === true,
        talkCount: Number(previous.talkCount) || 0,
        rewardClaimed: previous.rewardClaimed === true,
        available,
        position: copyPosition(obj.position, 0),
      };
    }

    if (components.merchant && obj.position) {
      const id = components.merchant.id || obj.uuid;
      const previous = state.gbRuntime.merchants[id] || {};
      nextMerchants[id] = {
        id,
        name: components.merchant.name || components.merchant.label || obj.userData.name || 'Merchant',
        item: components.merchant.item || 'Shop item',
        price: Math.max(0, Number(components.merchant.price) || 25),
        slot: components.merchant.slot || '',
        power: Math.max(0, Number(components.merchant.power) || 0),
        xp: Math.max(0, Number(components.merchant.xp) || 0),
        stock: Math.max(0, Number(components.merchant.stock) || 1),
        radius: Math.max(0.5, Number(components.merchant.radius) || 3),
        sold: Number(previous.sold) || 0,
        visited: previous.visited === true,
        lastPurchase: previous.lastPurchase || '',
        position: copyPosition(obj.position, 0),
      };
    }

    if (components.door && obj.position) {
      const id = components.door.id || obj.uuid;
      const previous = state.gbRuntime.doors[id] || {};
      const label = components.door.label || obj.userData.name || 'Door';
      const speed = Math.max(0.1, Number(components.door.speed) || 2.5);
      const closed = isPlaying && previous.closed ? previous.closed : copyPosition(obj.position, 0);
      const openPosition = getDoorOpenPosition(closed, components.door);
      const open = isPlaying
        ? (components.door.open === true || previous.open === true)
        : components.door.open === true;
      const targetProgress = open ? 1 : 0;
      const progress = isPlaying
        ? (previous.progress === undefined ? (open ? 1 : 0) : previous.progress)
        : targetProgress;
      const nextProgress = !isPlaying ? targetProgress : progress < targetProgress
        ? Math.min(targetProgress, progress + dt * speed)
        : Math.max(targetProgress, progress - dt * speed);
      const doorRecord = {
        id,
        label,
        open,
        progress: nextProgress,
        axis: components.door.axis || 'y',
        distance: Number(components.door.distance) || 3,
        speed,
        closed,
        openPosition,
        sourcePosition: copyPosition(obj.position, 0),
      };
      const nextPos = {
        x: lerp(closed.x, openPosition.x, nextProgress),
        y: lerp(closed.y, openPosition.y, nextProgress),
        z: lerp(closed.z, openPosition.z, nextProgress),
      };
      if (isPlaying || components.door.open === true) setObjectPosition(obj, nextPos);
      nextDoors[id] = doorRecord;
    }

    if (!playerPos || !obj.position) return;
    const distance = obj.position.distanceTo(playerPos);

    if (isPlaying && components.triggerZone) {
      const id = components.triggerZone.id || obj.uuid;
      const previous = state.gbRuntime.triggers[id] || {};
      const radius = Number(components.triggerZone.radius) || 4;
      const inside = distance < radius;
      const once = components.triggerZone.once !== false && components.triggerZone.once !== 'false';
      const entered = inside && !previous.inside;
      const canFire = entered && (!once || !previous.fired);
      const triggerRecord = {
        id,
        label: components.triggerZone.label || 'Trigger',
        action: components.triggerZone.action || 'openDoor',
        targetDoorId: components.triggerZone.targetDoorId || 'nearest',
        message: components.triggerZone.message || '',
        radius,
        once,
        fired: previous.fired || canFire,
        inside,
        fireCount: previous.fireCount || 0,
        position: copyPosition(obj.position, 0),
      };
      if (canFire) triggerQueue.push(triggerRecord);
      nextTriggers[id] = triggerRecord;
    }

    if (components.missionStep) {
      const id = components.missionStep.id || obj.uuid;
      const previous = state.gbRuntime.missionSteps[id] || {};
      const radius = Number(components.missionStep.radius) || 3;
      const steps = { ...state.gbRuntime.missionSteps, ...nextMissionSteps };
      const requirementMet = isRequirementMet(components.missionStep.requiredStepId || 'none', steps);
      const done = previous.done || (isPlaying && requirementMet && distance < radius);
      const stepRecord = {
        id,
        label: components.missionStep.label || 'Mission step',
        order: Number(components.missionStep.order) || 1,
        radius,
        requiredStepId: components.missionStep.requiredStepId || 'none',
        done,
        position: copyPosition(obj.position, 0),
      };
      if (!previous.done && done) showToast('Mission step complete: ' + stepRecord.label);
      nextMissionSteps[id] = stepRecord;
    }

    if (components.missionReward) {
      const id = components.missionReward.id || obj.uuid;
      const previous = state.gbRuntime.rewards[id] || {};
      const radius = Number(components.missionReward.radius) || 3;
      const score = Number(components.missionReward.score) || 25;
      const item = components.missionReward.item || 'Reward';
      const slot = components.missionReward.slot || '';
      const power = Math.max(0, Number(components.missionReward.power) || 0);
      const xp = Math.max(0, Number(components.missionReward.xp) || 0);
      const requiredStepId = components.missionReward.requiredStepId || 'all';
      const steps = { ...state.gbRuntime.missionSteps, ...nextMissionSteps };
      const canClaim = isPlaying && isRequirementMet(requiredStepId, steps);
      const claimed = previous.claimed || (canClaim && distance < radius);
      const rewardRecord = {
        id,
        label: components.missionReward.label || item,
        item,
        score,
        slot,
        power,
        xp,
        radius,
        requiredStepId,
        claimed,
        position: copyPosition(obj.position, 0),
      };
      if (!previous.claimed && claimed) {
        grantRuntimeItem({ name: item, item, type: slot ? 'equipment' : 'reward', slot, power, score, xp }, item, 'missionReward');
        state.gbRuntime.lastReward = { id, label: rewardRecord.label, item, score, slot, power, xp, claimedAt: time };
        showToast('Reward: ' + rewardRecord.label + ' +' + score);
      }
      nextRewards[id] = rewardRecord;
    }

    if (components.missionGate && obj.position) {
      const id = components.missionGate.id || obj.uuid;
      const previous = state.gbRuntime.gates[id] || {};
      const steps = { ...state.gbRuntime.missionSteps, ...nextMissionSteps };
      const unlocked = isPlaying && isRequirementMet(components.missionGate.requiredStepId || 'all', steps);
      const speed = Math.max(0.1, Number(components.missionGate.speed) || 2.5);
      const closed = isPlaying && previous.closed ? previous.closed : copyPosition(obj.position, 0);
      const openPosition = getGateOpenPosition(closed, components.missionGate);
      const targetProgress = unlocked ? 1 : 0;
      const progress = isPlaying ? (previous.progress === undefined ? targetProgress : previous.progress) : 0;
      const nextProgress = !isPlaying ? targetProgress : progress < targetProgress
        ? Math.min(targetProgress, progress + dt * speed)
        : Math.max(targetProgress, progress - dt * speed);
      const gateRecord = {
        id,
        label: components.missionGate.label || 'Mission gate',
        requiredStepId: components.missionGate.requiredStepId || 'all',
        unlocked,
        progress: nextProgress,
        axis: components.missionGate.axis || 'y',
        distance: Number(components.missionGate.distance) || 3,
        speed,
        closed,
        openPosition,
        position: copyPosition(obj.position, 0),
      };
      if (isPlaying) {
        setObjectPosition(obj, {
          x: lerp(closed.x, openPosition.x, nextProgress),
          y: lerp(closed.y, openPosition.y, nextProgress),
          z: lerp(closed.z, openPosition.z, nextProgress),
        });
      }
      if (!previous.unlocked && unlocked) showToast('Gate unlocked: ' + gateRecord.label);
      nextGates[id] = gateRecord;
    }

    if (components.objective) {
      const id = components.objective.id || obj.uuid;
      if (!state.gbRuntime.objectives[id]) {
        state.gbRuntime.objectives[id] = { label: components.objective.label || 'Reach objective', done: false };
      }
      if (!state.gbRuntime.objectives[id].done && distance < (components.objective.radius || 3)) {
        state.gbRuntime.objectives[id].done = true;
        showToast('Objective complete: ' + state.gbRuntime.objectives[id].label);
      }
    }

    if (components.checkpoint) {
      const id = components.checkpoint.id || obj.uuid;
      if (!state.gbRuntime.checkpoints[id]) {
        state.gbRuntime.checkpoints[id] = { label: components.checkpoint.label || 'Checkpoint', reached: false };
      }
      if (!state.gbRuntime.checkpoints[id].reached && distance < (components.checkpoint.radius || 3)) {
        state.gbRuntime.checkpoints[id].reached = true;
        state.gbRuntime.activeCheckpoint = { id, label: state.gbRuntime.checkpoints[id].label, position: copyPosition(obj.position, 1.5) };
        showToast('Checkpoint reached: ' + state.gbRuntime.checkpoints[id].label);
      }
    }

    if (components.winCondition) {
      const id = components.winCondition.id || obj.uuid;
      if (!state.gbRuntime.winConditions[id]) {
        state.gbRuntime.winConditions[id] = { label: components.winCondition.label || 'Reach win goal', done: false };
      }
      if (!state.gbRuntime.winConditions[id].done && distance < (components.winCondition.radius || 3)) {
        state.gbRuntime.winConditions[id].done = true;
        showToast('Win goal complete: ' + state.gbRuntime.winConditions[id].label);
      }
    }

    if (components.pickup && !obj.userData.gbCollected && distance < (components.pickup.radius || 2.5)) {
      obj.userData.gbCollected = true;
      const item = components.pickup.item || obj.userData.name || 'item';
      grantRuntimeItem({
        name: item,
        item,
        type: components.pickup.slot ? 'equipment' : 'pickup',
        slot: components.pickup.slot || '',
        power: Math.max(0, Number(components.pickup.power) || 0),
        score: components.pickup.score || 10,
        xp: Math.max(0, Number(components.pickup.xp) || 0),
      }, item, 'pickup');
      scene.remove(obj);
      showToast('Collected: ' + item);
    }

    if (components.equipmentItem && !obj.userData.gbCollected && distance < (components.equipmentItem.radius || 2.5)) {
      obj.userData.gbCollected = true;
      const item = components.equipmentItem.item || obj.userData.name || 'equipment';
      grantRuntimeItem({
        name: item,
        item,
        type: 'equipment',
        slot: components.equipmentItem.slot || 'weapon',
        power: Math.max(0, Number(components.equipmentItem.power) || 1),
        score: Math.max(0, Number(components.equipmentItem.score) || 0),
        xp: Math.max(0, Number(components.equipmentItem.xp) || 0),
      }, item, 'equipment');
      scene.remove(obj);
      showToast('Equipped item: ' + item);
    }

    if (components.damage && distance < (components.damage.radius || 2.5)) {
      const lastHit = components.damage.lastHit || 0;
      const cooldown = components.damage.cooldown || 1.2;
      if (time - lastHit > cooldown) {
        components.damage.lastHit = time;
        state.gbRuntime.health = Math.max(0, state.gbRuntime.health - (components.damage.amount || 10));
        showToast('Damage: -' + (components.damage.amount || 10));
      }
    }
  });
  const winRows = Object.values(state.gbRuntime.winConditions || {});
  state.gbRuntime.spawnPoints = nextSpawnPoints;
  state.gbRuntime.doors = nextDoors;
  state.gbRuntime.triggers = nextTriggers;
  state.gbRuntime.missionSteps = nextMissionSteps;
  state.gbRuntime.rewards = nextRewards;
  state.gbRuntime.gates = nextGates;
  state.gbRuntime.enemySpawns = nextEnemySpawns;
  state.gbRuntime.waves = nextWaves;
  state.gbRuntime.npcs = nextNpcs;
  state.gbRuntime.merchants = nextMerchants;
  state.gbRuntime.activeNpc = isPlaying && playerPos ? findClosestRuntimeRecord(nextNpcs, playerPos) : null;
  state.gbRuntime.activeMerchant = isPlaying && playerPos ? findClosestRuntimeRecord(nextMerchants, playerPos) : null;
  if (isPlaying) {
    Object.values(nextWaves)
      .sort((a, b) => (a.wave || 0) - (b.wave || 0))
      .forEach((wave) => startWaveIfReady(wave, nextEnemySpawns, time));
    Object.values(state.gbRuntime.enemies || {}).forEach((record) => {
      if (!nextWaves[record.waveId]) {
        removeEnemyRecord(record);
        delete state.gbRuntime.enemies[record.id];
        return;
      }
      updateRuntimeEnemy(record, dt, playerPos, time);
    });
    Object.values(nextWaves).forEach((wave) => updateWaveSummary(wave, time));
  }
  if (state.gbRuntime.activeSpawn && nextSpawnPoints[state.gbRuntime.activeSpawn.id]) {
    state.gbRuntime.activeSpawn = nextSpawnPoints[state.gbRuntime.activeSpawn.id];
  } else if (firstPlayerSpawn) {
    state.gbRuntime.activeSpawn = firstPlayerSpawn;
  } else {
    state.gbRuntime.activeSpawn = null;
  }
  if (!state.gbRuntime.gameComplete && winRows.length && winRows.every((item) => item.done)) {
    state.gbRuntime.gameComplete = true;
    showToast('Game complete');
  }
  triggerQueue.forEach((trigger) => {
    const doors = Object.values(state.gbRuntime.doors || {});
    let door = null;
    if (trigger.targetDoorId && trigger.targetDoorId !== 'nearest') {
      door = state.gbRuntime.doors[trigger.targetDoorId] || doors.find((item) => item.label === trigger.targetDoorId);
    }
    if (!door && doors.length) {
      door = doors.reduce((nearest, item) => {
        return distanceBetween(trigger.position, item.closed) < distanceBetween(trigger.position, nearest.closed) ? item : nearest;
      }, doors[0]);
    }
    if (trigger.action === 'openDoor' && door) {
      door.open = true;
      door.progress = Math.max(door.progress || 0, 0.02);
      state.gbRuntime.doors[door.id] = door;
      state.gbRuntime.triggers[trigger.id].fireCount += 1;
      state.gbRuntime.lastTrigger = { id: trigger.id, label: trigger.label, action: trigger.action, targetDoor: door.label, firedAt: time };
      showToast(trigger.message || ('Opened: ' + door.label));
    } else if (trigger.action === 'message') {
      state.gbRuntime.triggers[trigger.id].fireCount += 1;
      state.gbRuntime.lastTrigger = { id: trigger.id, label: trigger.label, action: trigger.action, targetDoor: '', firedAt: time };
      showToast(trigger.message || ('Triggered: ' + trigger.label));
    }
  });
  if (isPlaying && !state.gbRuntime.spawnActivated && state.gbRuntime.activeSpawn) {
    state.gbRuntime.spawnActivated = true;
    movePlayerTo(state.gbRuntime.activeSpawn);
    showToast('Started at: ' + state.gbRuntime.activeSpawn.label);
  }
  if (!state.gbRuntime.gameOver && state.gbRuntime.health <= 0) {
    if (!respawnPlayer(time)) {
      state.gbRuntime.gameOver = true;
      showToast('Game over');
    }
  }
  renderComponentHud();
};`,
  },
};

const PRESET_GROUPS = [
  {
    label: 'World',
    presets: [
      { label: 'Modern City', command: 'build city' },
      { label: 'Medieval Village', command: 'build medieval village' },
      { label: 'Zombie Survival', command: 'zombie game' },
      { label: 'Space Station', command: 'build space station' },
      { label: 'Pirate Cove', command: 'build pirate cove' },
      { label: 'Forest Camp', command: 'build forest' },
    ],
  },
  {
    label: 'Systems',
    presets: [
      { label: 'Inventory', script: 'inventory' },
      { label: 'Game HUD', script: 'hud' },
      { label: 'Quest Tracker', script: 'quest' },
      { label: 'Pickups', script: 'pickups' },
      { label: 'Components', script: 'components' },
      { label: 'FPS Combat', command: 'fps mode' },
      { label: 'Dialogue NPC', command: 'dialogue editor' },
      { label: 'Autosave', command: 'autosave on' },
      { label: 'Day/Night', command: 'day night cycle' },
    ],
  },
  {
    label: 'Assets',
    presets: [
      { label: 'Asset Library', action: 'assets' },
      { label: 'Characters', command: 'characters' },
      { label: 'Vehicles', command: 'show vehicles' },
      { label: 'Weapons', command: 'show weapons' },
      { label: 'Buildings', command: 'show buildings' },
      { label: 'Trees', command: 'show trees' },
    ],
  },
  {
    label: 'Ship',
    presets: [
      { label: 'Play Mode', action: 'play' },
      { label: 'Save', action: 'save' },
      { label: 'Load', action: 'load' },
      { label: 'Import', action: 'import' },
      { label: 'Export', action: 'export' },
      { label: 'Share', action: 'share' },
      { label: 'Scripts', action: 'scripts' },
      { label: 'Settings', action: 'settings' },
    ],
  },
];

const PROJECT_ACTIONS = [
  { label: 'Save', action: 'save', title: 'Save or load named project slots.' },
  { label: 'Load', action: 'load', title: 'Open saved project slots.' },
  { label: 'Import', action: 'import', title: 'Import GLB, GLTF, or .crate files.' },
  { label: 'Export', action: 'export', title: 'Export, download, or share the current project.' },
  { label: 'Published', action: 'published', title: 'Open published cloud and browser game links.' },
  { label: 'Share', action: 'share', title: 'Create a share URL for the current project.' },
  { label: 'Settings', action: 'settings', title: 'Open engine settings.' },
];

const GRAPHICS_QUALITY_LEVELS = [
  { id: 'low', label: 'Low', detail: 'Best for laptops and heavy worlds.' },
  { id: 'medium', label: 'Medium', detail: 'Balanced default for editing.' },
  { id: 'high', label: 'High', detail: 'Sharper shadows and effects.' },
  { id: 'ultra', label: 'Ultra', detail: 'Maximum visual fidelity.' },
];

const GENRE_TEMPLATES = [
  {
    id: 'survival',
    name: 'Survival Quest',
    detail: 'Forest world, inventory, HUD, quests, pickups, and component runtime.',
    commands: ['build forest', 'zombie game'],
    scripts: ['inventory', 'hud', 'quest', 'pickups', 'components'],
  },
  {
    id: 'shooter',
    name: 'Shooter Arena',
    detail: 'Combat controls, HUD, runtime components, and arena-friendly setup.',
    commands: ['build arena', 'fps mode'],
    scripts: ['hud', 'components'],
  },
  {
    id: 'rpg',
    name: 'RPG Village',
    detail: 'Village world with inventory, quest tracker, NPC flow, and rewards.',
    commands: ['build medieval village', 'dialogue editor'],
    scripts: ['inventory', 'hud', 'quest', 'components'],
  },
  {
    id: 'racing',
    name: 'City Racer',
    detail: 'City layout with vehicle catalog entry points and readable HUD.',
    commands: ['build city', 'show vehicles'],
    scripts: ['hud', 'components'],
  },
  {
    id: 'space',
    name: 'Space Adventure',
    detail: 'Space station world with quest, HUD, inventory, and runtime systems.',
    commands: ['build space station'],
    scripts: ['inventory', 'hud', 'quest', 'components'],
  },
  {
    id: 'tycoon',
    name: 'Tycoon Starter',
    detail: 'City base with inventory, objectives, rewards, and save-ready systems.',
    commands: ['build city', 'autosave on'],
    scripts: ['inventory', 'hud', 'quest', 'components'],
  },
];

const GAME_SYSTEMS = [
  {
    id: 'inventory',
    name: 'Inventory + Equipment',
    detail: 'Five-slot hotbar, equipment slots, and player stats.',
    script: 'inventory',
    scriptId: 'gb_inventory_hotbar',
    actionLabel: 'Install',
  },
  {
    id: 'hud',
    name: 'Game HUD',
    detail: 'Health, score, and level display.',
    script: 'hud',
    scriptId: 'gb_game_hud',
    actionLabel: 'Install',
  },
  {
    id: 'quest',
    name: 'Quest Tracker',
    detail: 'Objective panel for directed gameplay.',
    script: 'quest',
    scriptId: 'gb_quest_tracker',
    actionLabel: 'Install',
  },
  {
    id: 'runtime',
    name: 'Component Runtime',
    detail: 'Runs pickup, equipment, NPC, merchant, damage, mission, gate, enemy, objective, spawn, checkpoint, win, spin, and float tags.',
    script: 'components',
    scriptId: 'gb_component_runtime',
    actionLabel: 'Install',
  },
  {
    id: 'pickups',
    name: 'Pickup System',
    detail: 'Make selected objects collectible.',
    component: 'pickup',
    countKey: 'pickup',
    actionLabel: 'Tag Selected',
  },
  {
    id: 'equipment',
    name: 'Equipment Item',
    detail: 'Make selected objects equippable inventory items.',
    component: 'equipmentItem',
    countKey: 'equipmentItem',
    actionLabel: 'Tag Selected',
  },
  {
    id: 'npcs',
    name: 'Dialogue NPC',
    detail: 'Make selected objects talk, give quest hints, and grant optional rewards.',
    component: 'npc',
    countKey: 'npc',
    actionLabel: 'Tag Selected',
  },
  {
    id: 'merchants',
    name: 'Merchant',
    detail: 'Make selected objects sell inventory or equipment for score.',
    component: 'merchant',
    countKey: 'merchant',
    actionLabel: 'Tag Selected',
  },
  {
    id: 'objectives',
    name: 'Objective System',
    detail: 'Make selected objects complete objectives.',
    component: 'objective',
    countKey: 'objective',
    actionLabel: 'Tag Selected',
  },
  {
    id: 'missions',
    name: 'Mission Flow',
    detail: 'Make selected objects advance mission progress.',
    component: 'missionStep',
    countKey: 'missionStep',
    actionLabel: 'Tag Selected',
  },
  {
    id: 'rewards',
    name: 'Rewards',
    detail: 'Grant score and inventory after mission progress.',
    component: 'missionReward',
    countKey: 'missionReward',
    actionLabel: 'Tag Selected',
  },
  {
    id: 'gates',
    name: 'Mission Gates',
    detail: 'Open selected gates after mission requirements.',
    component: 'missionGate',
    countKey: 'missionGate',
    actionLabel: 'Tag Selected',
  },
  {
    id: 'enemySpawns',
    name: 'Enemy Spawns',
    detail: 'Mark selected objects as enemy spawn anchors.',
    component: 'enemySpawn',
    countKey: 'enemySpawn',
    actionLabel: 'Tag Selected',
  },
  {
    id: 'waves',
    name: 'Wave Controller',
    detail: 'Spawn and track enemy waves during Play mode.',
    component: 'waveController',
    countKey: 'waveController',
    actionLabel: 'Tag Selected',
  },
  {
    id: 'checkpoints',
    name: 'Checkpoints',
    detail: 'Save player progress at selected objects.',
    component: 'checkpoint',
    countKey: 'checkpoint',
    actionLabel: 'Tag Selected',
  },
  {
    id: 'win',
    name: 'Win Condition',
    detail: 'Mark selected objects as game-finish goals.',
    component: 'winCondition',
    countKey: 'winCondition',
    actionLabel: 'Tag Selected',
  },
  {
    id: 'doors',
    name: 'Doors',
    detail: 'Make selected objects open when triggered.',
    component: 'door',
    countKey: 'door',
    actionLabel: 'Tag Selected',
  },
  {
    id: 'triggers',
    name: 'Triggers',
    detail: 'Make selected objects fire zone actions.',
    component: 'triggerZone',
    countKey: 'triggerZone',
    actionLabel: 'Tag Selected',
  },
  {
    id: 'spawns',
    name: 'Spawn Points',
    detail: 'Mark selected objects as player or enemy starts.',
    component: 'spawnPoint',
    countKey: 'spawnPoint',
    actionLabel: 'Tag Selected',
  },
  {
    id: 'damage',
    name: 'Damage Zones',
    detail: 'Make selected objects damage nearby players.',
    component: 'damage',
    countKey: 'damage',
    actionLabel: 'Tag Selected',
  },
];

const EDIT_ONLY_ACTIONS = new Set(['assets', 'import', 'load', 'save', 'scripts']);

const COMPONENT_PRESETS = [
  { label: 'Collider', component: 'collider', title: 'Tag the current object as solid scene geometry.' },
  { label: 'Pickup', component: 'pickup', title: 'Make the current object collectible.' },
  { label: 'Equip Item', component: 'equipmentItem', title: 'Make the current object an equippable inventory item.' },
  { label: 'NPC', component: 'npc', title: 'Make the current object a talking NPC with optional quest reward.' },
  { label: 'Merchant', component: 'merchant', title: 'Make the current object sell inventory or equipment for score.' },
  { label: 'Damage', component: 'damage', title: 'Make the current object damage the player nearby.' },
  { label: 'Objective', component: 'objective', title: 'Make the current object complete an objective when reached.' },
  { label: 'Mission', component: 'missionStep', title: 'Make the current object advance mission progress.' },
  { label: 'Reward', component: 'missionReward', title: 'Grant score or inventory after mission progress.' },
  { label: 'Gate', component: 'missionGate', title: 'Open the current object after a mission requirement.' },
  { label: 'Enemy Spawn', component: 'enemySpawn', title: 'Make the current object spawn enemies during waves.' },
  { label: 'Wave', component: 'waveController', title: 'Make the current object control an enemy wave.' },
  { label: 'Checkpoint', component: 'checkpoint', title: 'Mark the current object as a checkpoint.' },
  { label: 'Win Goal', component: 'winCondition', title: 'Mark the current object as a win condition.' },
  { label: 'Door', component: 'door', title: 'Make the current object open when a trigger fires.' },
  { label: 'Trigger', component: 'triggerZone', title: 'Make the current object fire a gameplay action nearby.' },
  { label: 'Spin', component: 'spin', title: 'Give the current object a runtime spin behavior.' },
  { label: 'Float', component: 'float', title: 'Give the current object a gentle floating behavior.' },
  { label: 'Spawn Pt', component: 'spawnPoint', title: 'Mark the current object as a player or enemy spawn point.' },
  { label: 'Focus', action: 'focus', title: 'Move the camera toward the current object.' },
];

const COMPONENT_FIELDS = {
  collider: [
    { key: 'type', label: 'Type', kind: 'text' },
  ],
  pickup: [
    { key: 'item', label: 'Item', kind: 'text' },
    { key: 'score', label: 'Score', kind: 'number', step: 1 },
    { key: 'xp', label: 'XP', kind: 'number', step: 1 },
    { key: 'slot', label: 'Equip Slot', kind: 'text' },
    { key: 'power', label: 'Power', kind: 'number', step: 1 },
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.1 },
  ],
  equipmentItem: [
    { key: 'item', label: 'Item', kind: 'text' },
    { key: 'slot', label: 'Slot', kind: 'text' },
    { key: 'power', label: 'Power', kind: 'number', step: 1 },
    { key: 'score', label: 'Score', kind: 'number', step: 1 },
    { key: 'xp', label: 'XP', kind: 'number', step: 1 },
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.1 },
  ],
  npc: [
    { key: 'name', label: 'Name', kind: 'text' },
    { key: 'role', label: 'Role', kind: 'text' },
    { key: 'dialogue', label: 'Dialogue', kind: 'text' },
    { key: 'questId', label: 'Quest ID', kind: 'text' },
    { key: 'requiredStepId', label: 'Requires', kind: 'text' },
    { key: 'rewardItem', label: 'Reward', kind: 'text' },
    { key: 'rewardSlot', label: 'Reward Slot', kind: 'text' },
    { key: 'rewardPower', label: 'Power', kind: 'number', step: 1 },
    { key: 'rewardScore', label: 'Score', kind: 'number', step: 1 },
    { key: 'rewardXp', label: 'XP', kind: 'number', step: 1 },
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.1 },
  ],
  merchant: [
    { key: 'name', label: 'Name', kind: 'text' },
    { key: 'item', label: 'Item', kind: 'text' },
    { key: 'price', label: 'Price', kind: 'number', step: 1 },
    { key: 'slot', label: 'Slot', kind: 'text' },
    { key: 'power', label: 'Power', kind: 'number', step: 1 },
    { key: 'xp', label: 'XP', kind: 'number', step: 1 },
    { key: 'stock', label: 'Stock', kind: 'number', step: 1 },
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.1 },
  ],
  damage: [
    { key: 'amount', label: 'Damage', kind: 'number', step: 1 },
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.1 },
    { key: 'cooldown', label: 'Cooldown', kind: 'number', step: 0.1 },
  ],
  objective: [
    { key: 'label', label: 'Label', kind: 'text' },
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.1 },
  ],
  missionStep: [
    { key: 'label', label: 'Label', kind: 'text' },
    { key: 'order', label: 'Order', kind: 'number', step: 1 },
    { key: 'requiredStepId', label: 'Requires', kind: 'text' },
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.1 },
  ],
  missionReward: [
    { key: 'label', label: 'Label', kind: 'text' },
    { key: 'item', label: 'Item', kind: 'text' },
    { key: 'score', label: 'Score', kind: 'number', step: 1 },
    { key: 'xp', label: 'XP', kind: 'number', step: 1 },
    { key: 'slot', label: 'Equip Slot', kind: 'text' },
    { key: 'power', label: 'Power', kind: 'number', step: 1 },
    { key: 'requiredStepId', label: 'Requires', kind: 'text' },
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.1 },
  ],
  missionGate: [
    { key: 'label', label: 'Label', kind: 'text' },
    { key: 'requiredStepId', label: 'Requires', kind: 'text' },
    { key: 'axis', label: 'Axis', kind: 'text' },
    { key: 'distance', label: 'Distance', kind: 'number', step: 0.1 },
    { key: 'speed', label: 'Speed', kind: 'number', step: 0.1 },
  ],
  enemySpawn: [
    { key: 'label', label: 'Label', kind: 'text' },
    { key: 'enemyType', label: 'Type', kind: 'text' },
    { key: 'count', label: 'Count', kind: 'number', step: 1 },
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.1 },
    { key: 'speed', label: 'Speed', kind: 'number', step: 0.1 },
    { key: 'damage', label: 'Damage', kind: 'number', step: 1 },
    { key: 'health', label: 'Health', kind: 'number', step: 1 },
    { key: 'attackRadius', label: 'Attack', kind: 'number', step: 0.1 },
    { key: 'attackCooldown', label: 'Cooldown', kind: 'number', step: 0.1 },
    { key: 'dropItem', label: 'Drop', kind: 'text' },
    { key: 'dropSlot', label: 'Drop Slot', kind: 'text' },
    { key: 'dropPower', label: 'Drop Power', kind: 'number', step: 1 },
    { key: 'dropXp', label: 'Drop XP', kind: 'number', step: 1 },
    { key: 'dropScore', label: 'Drop Score', kind: 'number', step: 1 },
    { key: 'dropChance', label: 'Drop Chance', kind: 'number', step: 0.1 },
  ],
  waveController: [
    { key: 'label', label: 'Label', kind: 'text' },
    { key: 'wave', label: 'Wave', kind: 'number', step: 1 },
    { key: 'count', label: 'Count', kind: 'number', step: 1 },
    { key: 'spawnGroup', label: 'Spawn', kind: 'text' },
    { key: 'enemySpeed', label: 'Speed', kind: 'number', step: 0.1 },
    { key: 'enemyDamage', label: 'Damage', kind: 'number', step: 1 },
    { key: 'enemyHealth', label: 'Health', kind: 'number', step: 1 },
    { key: 'rewardScore', label: 'Reward', kind: 'number', step: 1 },
    { key: 'dropItem', label: 'Drop', kind: 'text' },
    { key: 'dropSlot', label: 'Drop Slot', kind: 'text' },
    { key: 'dropPower', label: 'Drop Power', kind: 'number', step: 1 },
    { key: 'dropXp', label: 'Drop XP', kind: 'number', step: 1 },
    { key: 'dropScore', label: 'Drop Score', kind: 'number', step: 1 },
    { key: 'dropChance', label: 'Drop Chance', kind: 'number', step: 0.1 },
  ],
  checkpoint: [
    { key: 'label', label: 'Label', kind: 'text' },
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.1 },
  ],
  winCondition: [
    { key: 'label', label: 'Label', kind: 'text' },
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.1 },
  ],
  door: [
    { key: 'label', label: 'Label', kind: 'text' },
    { key: 'axis', label: 'Axis', kind: 'text' },
    { key: 'distance', label: 'Distance', kind: 'number', step: 0.1 },
    { key: 'speed', label: 'Speed', kind: 'number', step: 0.1 },
  ],
  triggerZone: [
    { key: 'label', label: 'Label', kind: 'text' },
    { key: 'action', label: 'Action', kind: 'text' },
    { key: 'targetDoorId', label: 'Door Id', kind: 'text' },
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.1 },
    { key: 'message', label: 'Message', kind: 'text' },
  ],
  spin: [
    { key: 'speed', label: 'Speed', kind: 'number', step: 0.1 },
  ],
  float: [
    { key: 'speed', label: 'Speed', kind: 'number', step: 0.1 },
    { key: 'height', label: 'Height', kind: 'number', step: 0.1 },
  ],
  spawnPoint: [
    { key: 'label', label: 'Label', kind: 'text' },
    { key: 'kind', label: 'Kind', kind: 'text' },
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.1 },
  ],
};

let lastSceneSignature = '';
let lastInspectorSignature = '';
let lastBlueprintSignature = '';
let lastPlacementSignature = '';
let lastAssetPackSignature = '';
let lastReadinessSignature = '';
let lastValidationSignature = '';
let lastPerformanceSignature = '';
let lastGameSystemsSignature = '';
let assetManifestLoadStarted = false;
let pendingValidationFix = null;
let performanceProbeStarted = false;
let performanceLastFrame = 0;
let performanceSamples = [];

function isSmallScreen() {
  return window.matchMedia('(max-width: 900px)').matches;
}

function notify(message) {
  if (typeof window.showToast === 'function') window.showToast(message);
  else console.log('[Game Builder]', message);
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value || {}));
  } catch {
    return {};
  }
}

function readBlueprints() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BLUEPRINT_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.id && item.name) : [];
  } catch {
    return [];
  }
}

function writeBlueprints(items) {
  localStorage.setItem(BLUEPRINT_STORAGE_KEY, JSON.stringify(items.slice(0, 24)));
  lastBlueprintSignature = '';
}

function readProjectSaves() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECT_SAVE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item && (item.commands || item.name)) : [];
  } catch {
    return [];
  }
}

function formatComponentLabel(name) {
  return String(name || 'component').replace(/([A-Z])/g, ' $1').replace(/[_-]+/g, ' ').trim();
}

function parseNumber(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function runCommand(command) {
  const runner = window._runCommand || window._parseAndExecute || window._engine?.exec;
  if (!runner) {
    notify('Engine is still loading');
    return Promise.resolve(null);
  }
  return Promise.resolve(runner(command)).catch((err) => {
    notify(err.message || 'Command failed');
    return null;
  });
}

async function installScript(key) {
  const script = SCRIPT_PRESETS[key];
  if (!script) return;
  if (!window._installUserScriptPreset) {
    notify('Script tools are still loading');
    return;
  }
  try {
    await window._installUserScriptPreset(script);
  } catch (err) {
    notify(err.message || 'Script install failed');
  }
}

function normalizeQualityLevel(level) {
  const next = String(level || window._crateGraphicsQuality || 'medium').toLowerCase();
  return GRAPHICS_QUALITY_LEVELS.some((item) => item.id === next) ? next : 'medium';
}

function getQualityLabel(level) {
  const item = GRAPHICS_QUALITY_LEVELS.find((entry) => entry.id === normalizeQualityLevel(level));
  return item ? item.label : 'Medium';
}

async function setBuilderGraphicsQuality(level) {
  const next = normalizeQualityLevel(level);
  let result = null;
  if (typeof window._setCrateGraphicsQuality === 'function') {
    result = window._setCrateGraphicsQuality(next);
  } else {
    result = await runCommand('graphics ' + next);
  }
  window._crateGraphicsQuality = next;
  window._lastGameBuilderQuality = {
    quality: next,
    result: String(result || ''),
    changedAt: Date.now(),
  };
  lastPerformanceSignature = '';
  renderPerformanceStatus();
  notify('Graphics quality: ' + getQualityLabel(next));
  return result;
}

async function applyGenreTemplate(template) {
  if (!template || !requireEditAction('apply templates')) return null;
  const state = {
    id: template.id,
    name: template.name,
    status: 'running',
    commands: [],
    scripts: [],
    startedAt: Date.now(),
  };
  window._lastGameBuilderTemplate = state;
  try {
    for (const script of template.scripts || []) {
      await installScript(script);
      state.scripts.push(script);
    }
    for (const command of template.commands || []) {
      await runCommand(command);
      state.commands.push(command);
    }
    state.status = 'done';
    state.finishedAt = Date.now();
    notify('Template applied: ' + template.name);
  } catch (err) {
    state.status = 'failed';
    state.error = err?.message || String(err || 'Template failed');
    notify(state.error);
  }
  lastGameSystemsSignature = '';
  resetValidationUiState();
  updateBuilderUi();
  return state;
}

function getSceneObjects() {
  const candidates = window._engineBridge?.objects || window._engine?.objects || window._sceneObjects || [];
  return Array.isArray(candidates) ? candidates.filter((obj) => obj && obj.position && obj.userData) : [];
}

function normalizeSceneObject(obj) {
  if (!obj) return null;
  const objects = getSceneObjects();
  let target = obj;
  while (target.parent && !objects.includes(target)) target = target.parent;
  return objects.includes(target) ? target : null;
}

function getObjectName(obj, index) {
  const name = obj?.userData?.name || obj?.name || obj?.type || 'Object';
  return String(name).replace(/[_-]+/g, ' ').trim() || 'Object ' + (index + 1);
}

function getObjectStableId(obj, index = 0) {
  return obj?.uuid || obj?.id || obj?.userData?.id || obj?.userData?.name || ('object_' + index);
}

function getTargetObject() {
  const selected = normalizeSceneObject(window._engineBridge?.getSelected?.() || window._engine?.selectedObject);
  if (selected) return selected;
  const lastPlaced = normalizeSceneObject(window._lastPlacedObj);
  if (lastPlaced) return lastPlaced;
  const objects = getSceneObjects();
  return objects[objects.length - 1] || null;
}

function selectObject(obj, options = {}) {
  if (!options.readOnly && !requireEditAction('select objects')) return null;
  const target = normalizeSceneObject(obj) || getTargetObject();
  if (!target) {
    notify('Select or add an object first');
    return null;
  }
  const selected = window._engineBridge?.selectObject?.(target) || window._engine?.selectObject?.(target) || target;
  window._lastPlacedObj = selected;
  updateBuilderUi();
  return selected;
}

function focusObject(obj) {
  const target = obj || getTargetObject();
  const camera = window._engine?.camera || window._engineBridge?.camera;
  const controls = window._engine?.controls;
  if (!target || !target.position || !camera) {
    notify('Select or add an object first');
    return;
  }
  const pos = target.position;
  camera.position.set(pos.x + 10, pos.y + 7, pos.z + 10);
  if (camera.lookAt) camera.lookAt(pos.x, pos.y, pos.z);
  if (controls?.target?.copy) {
    controls.target.copy(pos);
    controls.update?.();
  }
  if (isEditMode()) selectObject(target);
  notify('Focused: ' + getObjectName(target, 0));
}

function duplicateTarget(obj) {
  if (!requireEditAction('clone objects')) return null;
  const target = selectObject(obj || getTargetObject());
  if (!target) return null;
  if (typeof window._duplicateSelected === 'function') {
    window._duplicateSelected();
    const clone = normalizeSceneObject(window._lastPlacedObj);
    if (clone && clone !== target) {
      selectObject(clone);
      notify('Cloned: ' + getObjectName(clone, 0));
      return clone;
    }
  }

  const scene = window._engineBridge?.scene || window._engine?.scene;
  const objects = getSceneObjects();
  if (!scene || !target.clone) return null;
  const clone = target.clone(true);
  clone.position.x += 2;
  clone.userData = { ...cloneJson(target.userData), name: (target.userData?.name || 'object') + '_copy' };
  scene.add(clone);
  objects.push(clone);
  window._lastPlacedObj = clone;
  selectObject(clone);
  notify('Cloned: ' + getObjectName(clone, 0));
  return clone;
}

function deleteTarget(obj) {
  if (!requireEditAction('delete objects')) return;
  const target = selectObject(obj || getTargetObject());
  if (!target) return;
  const label = getObjectName(target, 0);
  if (typeof window._deleteSelected === 'function') {
    window._deleteSelected();
  } else {
    window._engineBridge?.removeObject?.(target);
  }
  window._lastPlacedObj = null;
  lastSceneSignature = '';
  lastInspectorSignature = '';
  notify('Deleted: ' + label);
  updateBuilderUi();
}

function getComponentStore(obj) {
  obj.userData = obj.userData || {};
  obj.userData.gbComponents = obj.userData.gbComponents || {};
  return obj.userData.gbComponents;
}

async function ensureComponentRuntime() {
  await installScript('components');
}

async function ensureRuntimeForComponents(components) {
  const keys = Object.keys(components || {});
  if (keys.some((key) => ['pickup', 'equipmentItem', 'missionReward', 'enemySpawn', 'waveController', 'npc', 'merchant'].includes(key))) await installScript('inventory');
  if (keys.some((key) => ['pickup', 'equipmentItem', 'npc', 'merchant', 'damage', 'objective', 'missionStep', 'missionReward', 'missionGate', 'enemySpawn', 'waveController', 'checkpoint', 'winCondition', 'door', 'triggerZone', 'spawnPoint', 'spin', 'float'].includes(key))) {
    await ensureComponentRuntime();
  }
}

async function markComponent(component) {
  if (!requireEditAction('add components')) return;
  const target = selectObject(getTargetObject());
  if (!target) return;
  const components = getComponentStore(target);
  const cleanName = getObjectName(target, 0);
  const id = target.uuid || ('object_' + Date.now());

  if (component === 'collider') {
    components.collider = { type: 'solid', createdAt: Date.now() };
    target.userData.interactable = true;
    target.userData.interactLabel = target.userData.interactLabel || 'Inspect';
  } else if (component === 'pickup') {
    components.pickup = { item: cleanName, score: 10, xp: 0, slot: '', power: 0, radius: 2.5 };
    await installScript('inventory');
    await ensureComponentRuntime();
  } else if (component === 'equipmentItem') {
    components.equipmentItem = { item: cleanName, slot: 'weapon', power: 2, score: 0, xp: 10, radius: 2.5 };
    target.userData.interactable = true;
    target.userData.interactLabel = target.userData.interactLabel || 'Equip';
    await installScript('inventory');
    await ensureComponentRuntime();
  } else if (component === 'npc') {
    components.npc = { id: 'npc_' + id, name: cleanName + ' guide', role: 'Guide', dialogue: 'I can point you toward the next objective.', questId: 'quest_' + id, requiredStepId: 'none', rewardItem: cleanName + ' note', rewardSlot: '', rewardPower: 0, rewardScore: 10, rewardXp: 10, radius: 3 };
    target.userData.interactable = true;
    target.userData.interactLabel = target.userData.interactLabel || 'Talk';
    await installScript('inventory');
    await ensureComponentRuntime();
  } else if (component === 'merchant') {
    components.merchant = { id: 'merchant_' + id, name: cleanName + ' vendor', item: cleanName + ' gear', price: 25, slot: 'trinket', power: 1, xp: 5, stock: 1, radius: 3 };
    target.userData.interactable = true;
    target.userData.interactLabel = target.userData.interactLabel || 'Shop';
    await installScript('inventory');
    await ensureComponentRuntime();
  } else if (component === 'damage') {
    components.damage = { amount: 10, radius: 2.5, cooldown: 1.2 };
    await ensureComponentRuntime();
  } else if (component === 'objective') {
    components.objective = { id: 'objective_' + id, label: 'Reach ' + cleanName, radius: 3 };
    await ensureComponentRuntime();
  } else if (component === 'missionStep') {
    components.missionStep = { id: 'mission_' + id, label: 'Complete ' + cleanName, order: 1, requiredStepId: 'none', radius: 3 };
    target.userData.interactable = true;
    target.userData.interactLabel = target.userData.interactLabel || 'Mission';
    await ensureComponentRuntime();
  } else if (component === 'missionReward') {
    components.missionReward = { id: 'reward_' + id, label: cleanName + ' reward', item: cleanName + ' token', score: 25, xp: 10, slot: '', power: 0, requiredStepId: 'all', radius: 3 };
    target.userData.interactable = true;
    target.userData.interactLabel = target.userData.interactLabel || 'Reward';
    await installScript('inventory');
    await ensureComponentRuntime();
  } else if (component === 'missionGate') {
    components.missionGate = { id: 'gate_' + id, label: cleanName + ' gate', requiredStepId: 'all', axis: 'y', distance: 3, speed: 2.5 };
    target.userData.interactable = true;
    target.userData.interactLabel = target.userData.interactLabel || 'Gate';
    await ensureComponentRuntime();
  } else if (component === 'enemySpawn') {
    components.enemySpawn = { id: 'enemy_spawn_' + id, label: cleanName + ' enemy spawn', enemyType: 'crawler', count: 3, radius: 2, speed: 1.2, damage: 5, health: 30, attackRadius: 2.3, attackCooldown: 1.2, dropItem: cleanName + ' scrap', dropSlot: '', dropPower: 0, dropXp: 10, dropScore: 5, dropChance: 1 };
    target.userData.interactable = true;
    target.userData.interactLabel = target.userData.interactLabel || 'Enemy spawn';
    await installScript('inventory');
    await ensureComponentRuntime();
  } else if (component === 'waveController') {
    components.waveController = { id: 'wave_' + id, label: 'Wave 1', wave: 1, count: 3, spawnGroup: 'nearest', enemySpeed: 0, enemyDamage: 0, enemyHealth: 0, rewardScore: 50, dropItem: '', dropSlot: '', dropPower: 0, dropXp: 0, dropScore: 0, dropChance: 0 };
    target.userData.interactable = true;
    target.userData.interactLabel = target.userData.interactLabel || 'Wave';
    await installScript('inventory');
    await ensureComponentRuntime();
  } else if (component === 'checkpoint') {
    components.checkpoint = { id: 'checkpoint_' + id, label: cleanName + ' checkpoint', radius: 3 };
    target.userData.interactable = true;
    target.userData.interactLabel = target.userData.interactLabel || 'Checkpoint';
    await ensureComponentRuntime();
  } else if (component === 'winCondition') {
    components.winCondition = { id: 'win_' + id, label: 'Finish at ' + cleanName, radius: 3 };
    target.userData.interactable = true;
    target.userData.interactLabel = target.userData.interactLabel || 'Finish';
    await ensureComponentRuntime();
  } else if (component === 'door') {
    components.door = { id: 'door_' + id, label: cleanName + ' door', axis: 'y', distance: 3, speed: 2.5, open: false };
    target.userData.interactable = true;
    target.userData.interactLabel = target.userData.interactLabel || 'Door';
    await ensureComponentRuntime();
  } else if (component === 'triggerZone') {
    components.triggerZone = { id: 'trigger_' + id, label: cleanName + ' trigger', action: 'openDoor', targetDoorId: 'nearest', radius: 4, message: 'Door opened', once: true };
    target.userData.interactable = true;
    target.userData.interactLabel = target.userData.interactLabel || 'Trigger';
    await ensureComponentRuntime();
  } else if (component === 'spin') {
    components.spin = { speed: 1.2 };
    await ensureComponentRuntime();
  } else if (component === 'float') {
    components.float = { speed: 1.8, height: 0.45, baseY: target.position.y };
    await ensureComponentRuntime();
  } else if (component === 'spawnPoint') {
    components.spawnPoint = { id: 'spawn_' + id, label: cleanName + ' spawn', kind: 'player', radius: 1.5 };
    target.userData.interactable = true;
    target.userData.interactLabel = target.userData.interactLabel || 'Spawn point';
    await ensureComponentRuntime();
  }

  notify(component.replace(/([A-Z])/g, ' $1') + ' added to ' + cleanName);
  updateBuilderUi();
}

async function markComponentOnObject(obj, component) {
  if (!obj) return null;
  selectObject(obj);
  await markComponent(component);
  return obj.userData?.gbComponents?.[component] || null;
}

function firstFixTarget(preferredComponents = []) {
  return getFirstObjectWithAnyComponent(preferredComponents) || getTargetObject() || getSceneObjects()[0] || null;
}

function recordValidationFix(action, detail, applied) {
  const result = { action, detail, applied, fixedAt: Date.now() };
  window._lastGameBuilderValidationFix = result;
  window._gameBuilderValidationFixHistory = Array.isArray(window._gameBuilderValidationFixHistory)
    ? window._gameBuilderValidationFixHistory.concat(result).slice(-20)
    : [result];
  return result;
}

function collectValidationUndoSnapshot() {
  return getSceneObjects().map((obj, index) => {
    const data = obj.userData || {};
    return {
      id: getObjectStableId(obj, index),
      components: cloneJson(data.gbComponents || {}),
      hadComponents: Object.prototype.hasOwnProperty.call(data, 'gbComponents'),
      interactable: data.interactable,
      hadInteractable: Object.prototype.hasOwnProperty.call(data, 'interactable'),
      interactLabel: data.interactLabel,
      hadInteractLabel: Object.prototype.hasOwnProperty.call(data, 'interactLabel'),
    };
  });
}

function restoreValidationUndoSnapshot(snapshot) {
  const objects = getSceneObjects();
  const byId = new Map(objects.map((obj, index) => [getObjectStableId(obj, index), obj]));
  (snapshot || []).forEach((item) => {
    const obj = byId.get(item.id);
    if (!obj) return;
    obj.userData = obj.userData || {};
    if (item.hadComponents) obj.userData.gbComponents = cloneJson(item.components || {});
    else delete obj.userData.gbComponents;
    if (item.hadInteractable) obj.userData.interactable = item.interactable;
    else delete obj.userData.interactable;
    if (item.hadInteractLabel) obj.userData.interactLabel = item.interactLabel;
    else delete obj.userData.interactLabel;
  });
}

function getValidationUndoStack() {
  window._gameBuilderValidationUndoStack = window._gameBuilderValidationUndoStack || {};
  return window._gameBuilderValidationUndoStack;
}

function recordValidationFixWithUndo(action, detail, applied, snapshot) {
  const result = recordValidationFix(action, detail, applied);
  if (applied > 0 && snapshot && snapshot.length) {
    const undoId = 'gb_fix_' + Date.now().toString(36);
    getValidationUndoStack()[undoId] = snapshot;
    result.undoId = undoId;
    result.undoAvailable = true;
  }
  return result;
}

function undoValidationFix(undoId) {
  if (!requireEditAction('undo validation fixes')) return null;
  const stack = getValidationUndoStack();
  const id = undoId || window._lastGameBuilderValidationFix?.undoId;
  const snapshot = id ? stack[id] : null;
  if (!snapshot) {
    notify('No validation fix undo available');
    return null;
  }
  restoreValidationUndoSnapshot(snapshot);
  delete stack[id];
  if (window._lastGameBuilderValidationFix && window._lastGameBuilderValidationFix.undoId === id) {
    window._lastGameBuilderValidationFix.undoAvailable = false;
    window._lastGameBuilderValidationFix.undone = true;
  }
  window._lastGameBuilderValidationUndo = { undoId: id, restoredAt: Date.now(), restoredObjects: snapshot.length };
  pendingValidationFix = null;
  window._pendingGameBuilderValidationFix = null;
  resetValidationUiState();
  updateBuilderUi();
  notify('Validation fix undone');
  return window._lastGameBuilderValidationUndo;
}

function getValidationFixPreview(action) {
  const targetNames = [];
  let title = 'Validation fix';
  let detail = 'Review this automatic fix before it changes the scene.';
  let count = 0;
  const pushObject = (obj) => {
    if (!obj) return;
    targetNames.push(getObjectName(obj, targetNames.length));
  };

  if (action === 'install-inventory-runtime') {
    title = 'Install inventory runtime';
    detail = 'Install inventory and component runtime scripts for inventory-related components.';
    count = 1;
  } else if (action === 'add-colliders') {
    const targets = findColliderTargets();
    targets.slice(0, 8).forEach(pushObject);
    title = 'Tag colliders';
    detail = 'Tag likely solid scene objects so runtime checks know what should behave like collision geometry.';
    count = targets.length;
  } else if (action === 'link-missions') {
    const issues = collectMissionLinkIssues();
    issues.slice(0, 8).forEach((entry) => pushObject(entry.obj));
    title = 'Link mission targets';
    detail = 'Point rewards and gates with missing requirements to the first mission step.';
    count = issues.length;
  } else if (action === 'link-waves') {
    const issues = collectWaveLinkIssues();
    issues.slice(0, 8).forEach((entry) => pushObject(entry.obj));
    title = 'Link wave targets';
    detail = 'Point wave controllers with missing spawn groups to the first enemy spawn.';
    count = issues.length;
  } else if (action === 'link-doors') {
    const issues = collectTriggerLinkIssues();
    issues.slice(0, 8).forEach((entry) => pushObject(entry.obj));
    title = 'Link trigger targets';
    detail = 'Point triggers with missing door IDs to the first door.';
    count = issues.length;
  } else if (action === 'add-spawn-point') {
    const target = firstFixTarget(['spawnPoint', 'checkpoint', 'winCondition', 'pickup']);
    pushObject(target);
    title = 'Add spawn point';
    detail = 'Add a player spawn point to the selected or most relevant object.';
    count = target ? 1 : 0;
  } else if (action === 'add-checkpoint') {
    const target = firstFixTarget(['spawnPoint', 'checkpoint', 'pickup']);
    pushObject(target);
    title = 'Add checkpoint';
    detail = 'Add a checkpoint so Play mode can recover progress.';
    count = target ? 1 : 0;
  } else if (action === 'add-win-condition') {
    const target = firstFixTarget(['winCondition', 'checkpoint', 'objective']);
    pushObject(target);
    title = 'Add win condition';
    detail = 'Add a finish goal to the selected or most relevant object.';
    count = target ? 1 : 0;
  } else if (action === 'add-trigger-zone') {
    const target = firstFixTarget(['door']);
    pushObject(target);
    title = 'Add trigger zone';
    detail = 'Add a trigger and link it to the first door when possible.';
    count = target ? 1 : 0;
  } else if (action === 'add-door') {
    const target = firstFixTarget(['triggerZone']);
    pushObject(target);
    title = 'Add door';
    detail = 'Add a door and link the first trigger to it when possible.';
    count = target ? 1 : 0;
  } else if (action === 'add-mission-step') {
    const target = firstFixTarget(['missionReward', 'missionGate', 'missionStep']);
    pushObject(target);
    title = 'Add mission step';
    detail = 'Add a mission step required by rewards or gates.';
    count = target ? 1 : 0;
  } else if (action === 'add-mission-reward') {
    const target = firstFixTarget(['missionStep']);
    pushObject(target);
    title = 'Add mission reward';
    detail = 'Add a reward linked to the first mission step.';
    count = target ? 1 : 0;
  } else if (action === 'add-enemy-spawn') {
    const target = firstFixTarget(['waveController']);
    pushObject(target);
    title = 'Add enemy spawn';
    detail = 'Add an enemy spawn and link the first wave controller.';
    count = target ? 1 : 0;
  } else if (action === 'add-wave-controller') {
    const target = firstFixTarget(['enemySpawn']);
    pushObject(target);
    title = 'Add wave controller';
    detail = 'Add a wave controller linked to the first enemy spawn.';
    count = target ? 1 : 0;
  }

  return {
    action,
    title,
    detail,
    count,
    targets: targetNames,
    createdAt: Date.now(),
  };
}

function openValidationFixPreview(action) {
  if (!requireEditAction('review validation fixes')) return null;
  pendingValidationFix = getValidationFixPreview(action);
  window._pendingGameBuilderValidationFix = pendingValidationFix;
  lastValidationSignature = '';
  renderValidationStatus();
  notify('Review fix: ' + pendingValidationFix.title);
  return pendingValidationFix;
}

function cancelValidationFixPreview() {
  pendingValidationFix = null;
  window._pendingGameBuilderValidationFix = null;
  lastValidationSignature = '';
  renderValidationStatus();
}

async function applyPendingValidationFix() {
  const action = pendingValidationFix?.action;
  if (!action) return null;
  pendingValidationFix = null;
  window._pendingGameBuilderValidationFix = null;
  return applyValidationFix(action);
}

async function applyValidationFix(action) {
  if (!requireEditAction('apply validation fixes')) return null;
  let applied = 0;
  let detail = 'No safe fix was available';
  const undoSnapshot = collectValidationUndoSnapshot();

  if (action === 'install-inventory-runtime') {
    await installScript('inventory');
    await ensureComponentRuntime();
    applied = 1;
    detail = 'Installed inventory and component runtime scripts';
  } else if (action === 'add-colliders') {
    const targets = findColliderTargets();
    targets.forEach((obj) => {
      const components = getComponentStore(obj);
      components.collider = components.collider || { type: 'solid', createdAt: Date.now() };
      applied += 1;
    });
    detail = 'Tagged ' + applied + ' likely solid object' + (applied === 1 ? '' : 's') + ' as colliders';
  } else if (action === 'add-spawn-point') {
    const target = firstFixTarget(['spawnPoint', 'checkpoint', 'winCondition', 'pickup']);
    const component = await markComponentOnObject(target, 'spawnPoint');
    if (component) {
      applied = 1;
      detail = 'Added a player spawn point';
    }
  } else if (action === 'add-checkpoint') {
    const target = firstFixTarget(['spawnPoint', 'checkpoint', 'pickup']);
    const component = await markComponentOnObject(target, 'checkpoint');
    if (component) {
      applied = 1;
      detail = 'Added a checkpoint';
    }
  } else if (action === 'add-win-condition') {
    const target = firstFixTarget(['winCondition', 'checkpoint', 'objective']);
    const component = await markComponentOnObject(target, 'winCondition');
    if (component) {
      applied = 1;
      detail = 'Added a win condition';
    }
  } else if (action === 'add-trigger-zone') {
    const target = firstFixTarget(['door']);
    const component = await markComponentOnObject(target, 'triggerZone');
    const door = getObjectsWithComponent('door')[0]?.data;
    if (component && door?.id) component.targetDoorId = door.id;
    if (component) {
      applied = 1;
      detail = 'Added a trigger zone for the first door';
    }
  } else if (action === 'add-door') {
    const target = firstFixTarget(['triggerZone']);
    const component = await markComponentOnObject(target, 'door');
    const trigger = getObjectsWithComponent('triggerZone')[0]?.data;
    if (component && trigger) trigger.targetDoorId = component.id || 'nearest';
    if (component) {
      applied = 1;
      detail = 'Added a door and linked the first trigger';
    }
  } else if (action === 'link-doors') {
    const door = getObjectsWithComponent('door')[0]?.data;
    if (door?.id) {
      collectTriggerLinkIssues().forEach((entry) => {
        entry.data.targetDoorId = door.id;
        applied += 1;
      });
    }
    detail = 'Linked ' + applied + ' trigger target' + (applied === 1 ? '' : 's');
  } else if (action === 'add-mission-step') {
    const target = firstFixTarget(['missionReward', 'missionGate', 'missionStep']);
    const component = await markComponentOnObject(target, 'missionStep');
    if (component) {
      applied = 1;
      detail = 'Added a mission step';
    }
  } else if (action === 'add-mission-reward') {
    const target = firstFixTarget(['missionStep']);
    const component = await markComponentOnObject(target, 'missionReward');
    const step = target?.userData?.gbComponents?.missionStep;
    if (component && step?.id) component.requiredStepId = step.id;
    if (component) {
      applied = 1;
      detail = 'Added a mission reward linked to the first step';
    }
  } else if (action === 'link-missions') {
    const step = getObjectsWithComponent('missionStep')[0]?.data;
    if (step?.id) {
      collectMissionLinkIssues().forEach((entry) => {
        entry.data.requiredStepId = step.id;
        applied += 1;
      });
    }
    detail = 'Linked ' + applied + ' mission target' + (applied === 1 ? '' : 's');
  } else if (action === 'add-enemy-spawn') {
    const target = firstFixTarget(['waveController']);
    const component = await markComponentOnObject(target, 'enemySpawn');
    const wave = target?.userData?.gbComponents?.waveController;
    if (component && wave) wave.spawnGroup = component.id || 'nearest';
    if (component) {
      applied = 1;
      detail = 'Added an enemy spawn and linked the first wave';
    }
  } else if (action === 'add-wave-controller') {
    const target = firstFixTarget(['enemySpawn']);
    const component = await markComponentOnObject(target, 'waveController');
    const spawn = target?.userData?.gbComponents?.enemySpawn;
    if (component && spawn?.id) component.spawnGroup = spawn.id;
    if (component) {
      applied = 1;
      detail = 'Added a wave controller linked to the first enemy spawn';
    }
  } else if (action === 'link-waves') {
    const spawn = getObjectsWithComponent('enemySpawn')[0]?.data;
    if (spawn?.id) {
      collectWaveLinkIssues().forEach((entry) => {
        entry.data.spawnGroup = spawn.id;
        applied += 1;
      });
    }
    detail = 'Linked ' + applied + ' wave target' + (applied === 1 ? '' : 's');
  }

  const result = recordValidationFixWithUndo(action, detail, applied, action === 'install-inventory-runtime' ? null : undoSnapshot);
  resetValidationUiState();
  updateBuilderUi();
  notify(applied ? detail : 'No validation fix applied');
  return result;
}

function runAction(action) {
  if (action === 'play') {
    setBuilderMode('play');
    return null;
  }
  if (action === 'assets') {
    if (!requireEditAction('place assets')) return null;
    if (window._showCategoryPicker) return window._showCategoryPicker();
    return runCommand('browse');
  }
  if (action === 'save') {
    if (!requireEditAction('save or load projects')) return null;
    if (window._showSaveLoad) return window._showSaveLoad();
    return runCommand('save world');
  }
  if (action === 'load') {
    if (!requireEditAction('load projects')) return null;
    if (window._showSaveLoad) return window._showSaveLoad();
    return runCommand('load world');
  }
  if (action === 'import') {
    if (!requireEditAction('import assets or scenes')) return null;
    if (window._showImportExport) return window._showImportExport('import');
    return null;
  }
  if (action === 'export') {
    if (window._showImportExport) return window._showImportExport('export');
    return runCommand('export world');
  }
  if (action === 'published') {
    if (window._showPublishedGames) return window._showPublishedGames();
    return null;
  }
  if (action === 'share') {
    return runCommand('share world');
  }
  if (action === 'scripts') {
    if (!requireEditAction('edit scripts')) return null;
    if (window._showScriptManager) return window._showScriptManager();
    if (window._openCodeEditor) return window._openCodeEditor();
  }
  if (action === 'settings') {
    if (window.showSettings) return window.showSettings();
    if (window.showAISettingsModal) return window.showAISettingsModal();
  }
  return null;
}

function createButton(preset) {
  const button = document.createElement('button');
  button.className = 'gb-preset';
  button.type = 'button';
  button.textContent = preset.label;
  button.title = preset.title || preset.command || preset.label;
  if (preset.action) button.dataset.gbAction = preset.action;
  const editOnly = !!(preset.editOnly === true || preset.script || (preset.command && preset.editOnly !== false) || EDIT_ONLY_ACTIONS.has(preset.action));
  if (editOnly) markEditOnly(button, preset.action === 'assets' ? 'place assets' : preset.action === 'import' ? 'import assets or scenes' : preset.action === 'load' ? 'load projects' : preset.action === 'save' ? 'save or load projects' : preset.action === 'scripts' ? 'edit scripts' : 'run builder presets');
  button.addEventListener('click', async () => {
    if (editOnly && !requireEditAction(button.dataset.gbEditAction || 'edit this')) return;
    setBusy(button, true);
    if (preset.command) await runCommand(preset.command);
    else if (preset.script) await installScript(preset.script);
    else if (preset.action) await runAction(preset.action);
    setBusy(button, false);
    updateBuilderUi();
  });
  return button;
}

function createComponentButton(preset) {
  const button = document.createElement('button');
  button.className = 'gb-preset gb-component-btn';
  button.type = 'button';
  button.dataset.gbComponent = preset.component || preset.action || preset.label;
  button.textContent = preset.label;
  button.title = preset.title || preset.label;
  if (preset.action !== 'focus') markEditOnly(button, 'add components');
  button.addEventListener('click', async () => {
    if (preset.action !== 'focus' && !requireEditAction('add components')) return;
    setBusy(button, true);
    if (preset.action === 'focus') focusObject();
    else await markComponent(preset.component);
    setBusy(button, false);
  });
  return button;
}

function setBusy(button, busy) {
  button.disabled = busy;
  button.dataset.busy = busy ? 'true' : 'false';
  if (!busy) updateEditorControlState();
}

function updateStats() {
  const stats = document.getElementById('gb-stats');
  if (!stats) return;
  const objects = getSceneObjects();
  const objectCount = objects.length;
  const componentCount = objects.reduce((count, obj) => count + Object.keys(obj.userData?.gbComponents || {}).length, 0);
  const scriptCount = Array.isArray(window._userScripts) ? window._userScripts.length : 0;
  const mode = formatModeLabel(getCurrentMode());
  const summary = objectCount + ' objects, ' + componentCount + ' components, ' + scriptCount + ' scripts, ' + mode + ' mode';
  stats.dataset.summary = summary;
  stats.setAttribute('aria-label', summary);
  stats.replaceChildren(
    createStatPill(objectCount + ' objects'),
    createStatPill(componentCount + ' components'),
    createStatPill(scriptCount + ' scripts'),
    createStatPill(mode + ' mode')
  );
}

function createStatPill(label) {
  const pill = document.createElement('span');
  pill.textContent = label;
  return pill;
}

function updateProjectStatus() {
  const status = document.getElementById('gb-project-status');
  if (!status) return;
  const saves = readProjectSaves();
  const assetVersion = window._assetManifestVersion || window._crateAssetManifest?.version || '';
  const saveText = saves.length === 1 ? '1 saved project' : saves.length + ' saved projects';
  status.textContent = saveText + (assetVersion ? ' | assets ' + assetVersion : '');
}

function getInstalledScriptIds() {
  return new Set((Array.isArray(window._userScripts) ? window._userScripts : [])
    .filter((script) => script && script.enabled !== false)
    .map((script) => script.id || script.name || ''));
}

function countComponents(objects) {
  return objects.reduce((counts, obj) => {
    const components = obj?.userData?.gbComponents || {};
    Object.keys(components).forEach((key) => {
      counts.total += 1;
      counts.byType[key] = (counts.byType[key] || 0) + 1;
    });
    return counts;
  }, { total: 0, byType: {} });
}

function getObjectsWithComponent(component) {
  return getSceneObjects()
    .filter((obj) => obj?.userData?.gbComponents?.[component])
    .map((obj) => ({ obj, data: obj.userData.gbComponents[component] }));
}

function getFirstObjectWithAnyComponent(components) {
  return getSceneObjects().find((obj) => {
    const store = obj?.userData?.gbComponents || {};
    return components.some((component) => store[component]);
  }) || null;
}

function resetValidationUiState() {
  lastReadinessSignature = '';
  lastValidationSignature = '';
  lastPerformanceSignature = '';
  lastGameSystemsSignature = '';
  lastInspectorSignature = '';
  lastSceneSignature = '';
}

function collectMissionLinkIssues() {
  const steps = getObjectsWithComponent('missionStep');
  const stepIds = new Set(steps.map((entry) => entry.data?.id).filter(Boolean));
  const dependents = [
    ...getObjectsWithComponent('missionReward').map((entry) => ({ ...entry, component: 'missionReward' })),
    ...getObjectsWithComponent('missionGate').map((entry) => ({ ...entry, component: 'missionGate' })),
  ];
  return dependents.filter((entry) => {
    const required = String(entry.data?.requiredStepId || '').trim();
    return required && required !== 'all' && required !== 'none' && !stepIds.has(required);
  });
}

function collectWaveLinkIssues() {
  const spawns = getObjectsWithComponent('enemySpawn');
  const spawnKeys = new Set();
  spawns.forEach((entry) => {
    [entry.data?.id, entry.data?.label].filter(Boolean).forEach((value) => spawnKeys.add(String(value).trim().toLowerCase()));
  });
  return getObjectsWithComponent('waveController').filter((entry) => {
    const target = String(entry.data?.spawnGroup || '').trim().toLowerCase();
    return target && target !== 'nearest' && !spawnKeys.has(target);
  });
}

function collectTriggerLinkIssues() {
  const doors = getObjectsWithComponent('door');
  const doorKeys = new Set();
  doors.forEach((entry) => {
    [entry.data?.id, entry.data?.label].filter(Boolean).forEach((value) => doorKeys.add(String(value).trim().toLowerCase()));
  });
  return getObjectsWithComponent('triggerZone').filter((entry) => {
    if (entry.data?.action && entry.data.action !== 'openDoor') return false;
    const target = String(entry.data?.targetDoorId || '').trim().toLowerCase();
    return target && target !== 'nearest' && !doorKeys.has(target);
  });
}

function findColliderTargets() {
  const names = ['ground', 'floor', 'wall', 'road', 'street', 'building', 'house', 'terrain', 'sidewalk', 'roof', 'door', 'gate', 'prop'];
  const objects = getSceneObjects().filter((obj) => {
    const components = obj?.userData?.gbComponents || {};
    return !components.collider && !obj?.userData?.gbRuntimeEnemy;
  });
  const likely = objects.filter((obj) => {
    const name = getObjectName(obj, 0).toLowerCase();
    return names.some((token) => name.includes(token));
  });
  return (likely.length ? likely : objects).slice(0, 24);
}

function collectReadiness() {
  const objects = getSceneObjects();
  const scripts = Array.isArray(window._userScripts) ? window._userScripts.filter((script) => script && script.enabled !== false) : [];
  const componentCounts = countComponents(objects);
  const saves = readProjectSaves();
  const assetStatus = window._crateAssetManifestStatus?.status || (window._crateAssetManifest?.version ? 'loaded' : 'idle');
  const mode = formatModeLabel(getCurrentMode());
  const spawnCount = componentCounts.byType.spawnPoint || 0;
  const pickupCount = componentCounts.byType.pickup || 0;
  const equipmentCount = componentCounts.byType.equipmentItem || 0;
  const npcCount = componentCounts.byType.npc || 0;
  const merchantCount = componentCounts.byType.merchant || 0;
  const objectiveCount = componentCounts.byType.objective || 0;
  const checkpointCount = componentCounts.byType.checkpoint || 0;
  const winConditionCount = componentCounts.byType.winCondition || 0;
  const doorCount = componentCounts.byType.door || 0;
  const triggerCount = componentCounts.byType.triggerZone || 0;
  const missionStepCount = componentCounts.byType.missionStep || 0;
  const rewardCount = componentCounts.byType.missionReward || 0;
  const gateCount = componentCounts.byType.missionGate || 0;
  const enemySpawnCount = componentCounts.byType.enemySpawn || 0;
  const waveCount = componentCounts.byType.waveController || 0;
  const hasWorld = objects.length > 0;
  const hasGameplay = scripts.length > 0 || componentCounts.total > 0;
  let status = 'Needs world';
  let tone = 'warn';
  if (assetStatus === 'failed') {
    status = 'Asset issue';
    tone = 'blocked';
  } else if (hasWorld && hasGameplay) {
    status = getCurrentMode() === 'play' ? 'Playing' : 'Ready to test';
    tone = 'ready';
  } else if (hasWorld) {
    status = 'Add gameplay';
    tone = 'warn';
  }
  const summary = [
    status,
    objects.length + ' objects',
    scripts.length + ' scripts',
    componentCounts.total + ' components',
    mode + ' mode',
  ].join(', ');
  return {
    status,
    tone,
    summary,
    mode,
    objectCount: objects.length,
    scriptCount: scripts.length,
    componentCount: componentCounts.total,
    spawnCount,
    pickupCount,
    equipmentCount,
    npcCount,
    merchantCount,
    objectiveCount,
    checkpointCount,
    winConditionCount,
    doorCount,
    triggerCount,
    missionStepCount,
    rewardCount,
    gateCount,
    enemySpawnCount,
    waveCount,
    saveCount: saves.length,
    assetStatus,
    assetVersion: window._crateAssetManifest?.version || window._assetManifestVersion || '',
  };
}

function createReadinessSection() {
  const section = document.createElement('section');
  section.className = 'gb-section';
  section.id = 'gb-readiness';
  const heading = document.createElement('h3');
  heading.textContent = 'Readiness';
  const status = document.createElement('div');
  status.id = 'gb-readiness-status';
  status.className = 'gb-readiness-status';
  const list = document.createElement('div');
  list.id = 'gb-readiness-list';
  list.className = 'gb-readiness-list';
  section.append(heading, status, list);
  return section;
}

function renderReadinessStatus() {
  const status = document.getElementById('gb-readiness-status');
  const list = document.getElementById('gb-readiness-list');
  if (!status || !list) return;
  const readiness = collectReadiness();
  const signature = JSON.stringify(readiness);
  window._gameBuilderReadiness = readiness;
  if (signature === lastReadinessSignature) return;
  lastReadinessSignature = signature;
  status.dataset.status = readiness.tone;
  status.dataset.summary = readiness.summary;
  status.setAttribute('aria-label', readiness.summary);
  status.replaceChildren(
    createTextElement('strong', '', readiness.status),
    createTextElement('span', '', readiness.mode + ' mode')
  );
  list.replaceChildren(
    createReadinessRow('World', readiness.objectCount + ' objects'),
    createReadinessRow('Gameplay', readiness.scriptCount + ' scripts | ' + readiness.componentCount + ' components'),
    createReadinessRow('Progress', readiness.pickupCount + ' pickups | ' + readiness.equipmentCount + ' equipment | ' + readiness.checkpointCount + ' checkpoints'),
    createReadinessRow('NPCs', readiness.npcCount + ' dialogue | ' + readiness.merchantCount + ' merchants'),
    createReadinessRow('Goals', readiness.objectiveCount + ' objectives | ' + readiness.winConditionCount + ' wins'),
    createReadinessRow('Missions', readiness.missionStepCount + ' steps | ' + readiness.rewardCount + ' rewards | ' + readiness.gateCount + ' gates'),
    createReadinessRow('Enemies', readiness.enemySpawnCount + ' spawns | ' + readiness.waveCount + ' waves'),
    createReadinessRow('Triggers', readiness.triggerCount + ' triggers | ' + readiness.doorCount + ' doors'),
    createReadinessRow('Spawns', readiness.spawnCount + ' spawns'),
    createReadinessRow('Project', readiness.saveCount + (readiness.saveCount === 1 ? ' save' : ' saves')),
    createReadinessRow('Assets', readiness.assetStatus === 'loaded' ? shortAssetValue(readiness.assetVersion) : readiness.assetStatus)
  );
}

function createReadinessRow(label, value) {
  const row = document.createElement('div');
  row.className = 'gb-readiness-row';
  row.append(createTextElement('span', '', label), createTextElement('strong', '', value));
  return row;
}

function startPerformanceProbe() {
  if (performanceProbeStarted) return;
  performanceProbeStarted = true;
  const tick = (now) => {
    if (performanceLastFrame) {
      const frameMs = Math.max(0, now - performanceLastFrame);
      if (Number.isFinite(frameMs) && frameMs < 1000) {
        performanceSamples.push(frameMs);
        if (performanceSamples.length > 90) performanceSamples.shift();
      }
    }
    performanceLastFrame = now;
    window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
}

function collectPerformanceMetrics() {
  const renderer = window._renderer || window._engineBridge?.renderer;
  const renderInfo = renderer?.info?.render || {};
  const memoryInfo = renderer?.info?.memory || {};
  const engineProfile = window._crateFrameProfile || {};
  const graphicsQuality = normalizeQualityLevel(window._crateGraphicsQuality);
  const rendererBudget = window._crateRendererBudget || {};
  const performanceBudget = window._cratePerformanceBudget || {};
  const pixelRatio = Number(renderer?.getPixelRatio?.()) || Number(rendererBudget.pixelRatio) || 0;
  const samples = performanceSamples.length ? performanceSamples : [16.7];
  const sampledAvgFrameMs = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const sampledWorstFrameMs = Math.max(...samples);
  const avgFrameMs = Number(engineProfile.avgFrameMs) || sampledAvgFrameMs;
  const worstFrameMs = Number(engineProfile.worstFrameMs) || sampledWorstFrameMs;
  const fps = Number(engineProfile.fps) || (avgFrameMs > 0 ? 1000 / avgFrameMs : 0);
  const objects = getSceneObjects();
  const componentCounts = countComponents(objects);
  const triangleEstimate = Number(renderInfo.triangles) || objects.slice(0, 180).reduce((sum, obj) => sum + countRenderableStats(obj).triangles, 0);
  const calls = Number(renderInfo.calls) || 0;
  const textures = Number(memoryInfo.textures) || 0;
  const geometries = Number(memoryInfo.geometries) || 0;
  const assetStatus = window._crateAssetManifestStatus?.status || (window._crateAssetManifest?.version ? 'loaded' : 'idle');
  const status = fps && fps < 28 ? 'blocked' : (fps < 45 || calls > 900 || triangleEstimate > 2000000 ? 'warn' : 'ready');
  const summary = fps ? Math.round(fps) + ' FPS | ' + Math.round(avgFrameMs * 10) / 10 + ' ms' : 'Collecting frame data';
  const warnings = [];
  if (fps && fps < 45) warnings.push('Low FPS');
  if (calls > 900) warnings.push('High draw calls');
  if (triangleEstimate > 2000000) warnings.push('High triangles');
  if (textures > 250) warnings.push('High texture count');
  return {
    status,
    summary,
    fps: Math.round(fps * 10) / 10,
    frameMs: Math.round(avgFrameMs * 10) / 10,
    worstFrameMs: Math.round(worstFrameMs * 10) / 10,
    calls,
    triangles: triangleEstimate,
    textures,
    geometries,
    objects: objects.length,
    components: componentCounts.total,
    engineUpdateMs: Number(engineProfile.avgUpdateMs) || 0,
    engineRenderMs: Number(engineProfile.avgRenderMs) || 0,
    engineSamples: Array.isArray(engineProfile.samples) ? engineProfile.samples.length : 0,
    assetStatus,
    graphicsQuality,
    graphicsLabel: getQualityLabel(graphicsQuality),
    pixelRatio: Math.round(pixelRatio * 100) / 100,
    renderScale: Math.round((Number(rendererBudget.scale) || 1) * 100) + '%',
    renderPixels: Number(rendererBudget.pixels) || 0,
    shadowMapSize: Number(performanceBudget.shadowMapSize) || 0,
    shadowDistance: Number(performanceBudget.shadowDistance) || 0,
    warnings,
  };
}

function createPerformanceQualityControls() {
  const wrap = document.createElement('div');
  wrap.id = 'gb-quality-controls';
  wrap.className = 'gb-quality-controls';
  GRAPHICS_QUALITY_LEVELS.forEach((level) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gb-quality-btn';
    button.dataset.gbQuality = level.id;
    button.textContent = level.label;
    button.title = level.detail;
    button.addEventListener('click', async () => {
      setBusy(button, true);
      await setBuilderGraphicsQuality(level.id);
      setBusy(button, false);
    });
    wrap.appendChild(button);
  });
  return wrap;
}

function renderPerformanceQualityControls(metrics) {
  const quality = normalizeQualityLevel(metrics?.graphicsQuality);
  const wrap = document.getElementById('gb-quality-controls');
  if (wrap) {
    wrap.dataset.quality = quality;
    wrap.querySelectorAll('[data-gb-quality]').forEach((button) => {
      const selected = button.dataset.gbQuality === quality;
      button.dataset.selected = selected ? 'true' : 'false';
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }
  const status = document.getElementById('gb-quality-summary');
  if (status && metrics) {
    const renderScale = metrics.renderScale || '100%';
    const shadow = metrics.shadowMapSize ? metrics.shadowMapSize + ' shadows' : 'shadows off';
    status.textContent = metrics.graphicsLabel + ' | ' + renderScale + ' render | ' + shadow;
  }
}

function createPerformanceSection() {
  const section = document.createElement('section');
  section.className = 'gb-section';
  section.id = 'gb-performance';
  const heading = document.createElement('h3');
  heading.textContent = 'Performance';
  const status = document.createElement('div');
  status.id = 'gb-performance-status';
  status.className = 'gb-performance-status';
  const list = document.createElement('div');
  list.id = 'gb-performance-list';
  list.className = 'gb-performance-list';
  const controls = createPerformanceQualityControls();
  const qualitySummary = document.createElement('div');
  qualitySummary.id = 'gb-quality-summary';
  qualitySummary.className = 'gb-quality-summary';
  section.append(heading, status, controls, qualitySummary, list);
  return section;
}

function createPerformanceRow(label, value) {
  const row = document.createElement('div');
  row.className = 'gb-performance-row';
  row.append(createTextElement('span', '', label), createTextElement('strong', '', value));
  return row;
}

function renderPerformanceStatus() {
  const status = document.getElementById('gb-performance-status');
  const list = document.getElementById('gb-performance-list');
  if (!status || !list) return;
  const metrics = collectPerformanceMetrics();
  const signature = JSON.stringify(metrics);
  window._gameBuilderPerformance = metrics;
  if (signature === lastPerformanceSignature) return;
  lastPerformanceSignature = signature;
  status.dataset.status = metrics.status;
  status.dataset.fps = String(metrics.fps);
  status.dataset.frameMs = String(metrics.frameMs);
  status.dataset.calls = String(metrics.calls);
  status.dataset.triangles = String(metrics.triangles);
  status.dataset.textures = String(metrics.textures);
  status.dataset.engineUpdateMs = String(metrics.engineUpdateMs);
  status.dataset.engineRenderMs = String(metrics.engineRenderMs);
  status.dataset.engineSamples = String(metrics.engineSamples);
  status.dataset.summary = metrics.summary;
  status.setAttribute('aria-label', metrics.summary);
  status.replaceChildren(
    createTextElement('strong', '', metrics.status === 'ready' ? 'Smooth' : metrics.status === 'warn' ? 'Watch' : 'Heavy'),
    createTextElement('span', '', metrics.summary)
  );
  list.replaceChildren(
    createPerformanceRow('Frame', metrics.frameMs + ' ms | worst ' + metrics.worstFrameMs + ' ms'),
    createPerformanceRow('Loop', metrics.engineUpdateMs + ' ms update | ' + metrics.engineRenderMs + ' ms render'),
    createPerformanceRow('Renderer', formatNumberShort(metrics.calls) + ' calls | ' + formatNumberShort(metrics.triangles) + ' tris'),
    createPerformanceRow('Quality', metrics.graphicsLabel + ' | ' + metrics.renderScale + ' | DPR ' + metrics.pixelRatio),
    createPerformanceRow('GPU memory', formatNumberShort(metrics.geometries) + ' geo | ' + formatNumberShort(metrics.textures) + ' tex'),
    createPerformanceRow('Scene', formatNumberShort(metrics.objects) + ' objects | ' + formatNumberShort(metrics.components) + ' comps'),
    createPerformanceRow('Assets', metrics.assetStatus),
    createPerformanceRow('Warnings', metrics.warnings.length ? metrics.warnings.join(', ') : 'None')
  );
  renderPerformanceQualityControls(metrics);
}

function createValidationSection() {
  const section = document.createElement('section');
  section.className = 'gb-section';
  section.id = 'gb-validation';
  const heading = document.createElement('h3');
  heading.textContent = 'Validation';
  const status = document.createElement('div');
  status.id = 'gb-validation-status';
  status.className = 'gb-validation-status';
  const list = document.createElement('div');
  list.id = 'gb-validation-list';
  list.className = 'gb-validation-list';
  const review = document.createElement('div');
  review.id = 'gb-validation-review';
  review.className = 'gb-validation-review';
  section.append(heading, status, review, list);
  return section;
}

function getRenderableHotspots(objects) {
  const hotspots = [];
  const limit = Math.min(objects.length, 160);
  for (let i = 0; i < limit; i += 1) {
    const obj = objects[i];
    const stats = countRenderableStats(obj);
    if (stats.triangles >= 120000) {
      hotspots.push({
        name: getObjectName(obj, i),
        triangles: stats.triangles,
      });
    }
    if (hotspots.length >= 3) break;
  }
  return hotspots;
}

function collectSceneValidation(readinessInput) {
  const readiness = readinessInput || collectReadiness();
  const objects = getSceneObjects();
  const scriptIds = getInstalledScriptIds();
  const checks = [];
  const addCheck = (level, label, detail, action, actionLabel) => checks.push({ level, label, detail, action, actionLabel });
  const missionLinkIssues = collectMissionLinkIssues();
  const waveLinkIssues = collectWaveLinkIssues();
  const triggerLinkIssues = collectTriggerLinkIssues();

  if (readiness.assetStatus === 'failed') addCheck('error', 'Asset host', 'Manifest or remote asset host is not available.');
  if (!readiness.objectCount) addCheck('error', 'World', 'Build a world or import scene objects.');
  if (!readiness.scriptCount && !readiness.componentCount) addCheck('warning', 'Gameplay', 'Install a system or tag objects with components.');
  if (readiness.objectCount && !readiness.spawnCount) addCheck('warning', 'Spawn', 'Add at least one player spawn point.', 'add-spawn-point');
  if (readiness.componentCount && !readiness.checkpointCount) addCheck('suggestion', 'Checkpoint', 'Add a checkpoint so Play mode can recover progress.', 'add-checkpoint');
  if (readiness.componentCount && !readiness.winConditionCount) addCheck('warning', 'Win goal', 'Add a win condition so exported games have an end state.', 'add-win-condition');
  if (readiness.doorCount && !readiness.triggerCount) addCheck('warning', 'Door link', 'Doors need trigger zones.', 'add-trigger-zone');
  if (readiness.triggerCount && !readiness.doorCount) addCheck('warning', 'Trigger link', 'Triggers need a door or explicit target.', 'add-door');
  if (triggerLinkIssues.length) addCheck('warning', 'Trigger target', triggerLinkIssues.length + ' trigger target' + (triggerLinkIssues.length === 1 ? '' : 's') + ' point at missing doors.', 'link-doors', 'Link');
  if ((readiness.rewardCount || readiness.gateCount) && !readiness.missionStepCount) addCheck('warning', 'Mission link', 'Rewards and gates need a mission step.', 'add-mission-step');
  if (readiness.missionStepCount && !readiness.rewardCount) addCheck('suggestion', 'Mission reward', 'Add a reward so mission progress gives feedback.', 'add-mission-reward');
  if (missionLinkIssues.length) addCheck('warning', 'Mission target', missionLinkIssues.length + ' mission target' + (missionLinkIssues.length === 1 ? '' : 's') + ' point at missing steps.', 'link-missions', 'Link');
  if (readiness.waveCount && !readiness.enemySpawnCount) addCheck('warning', 'Wave link', 'Wave controllers need enemy spawns.', 'add-enemy-spawn');
  if (readiness.enemySpawnCount && !readiness.waveCount) addCheck('warning', 'Enemy wave', 'Enemy spawns need a wave controller.', 'add-wave-controller');
  if (waveLinkIssues.length) addCheck('warning', 'Wave target', waveLinkIssues.length + ' wave controller' + (waveLinkIssues.length === 1 ? '' : 's') + ' point at missing spawns.', 'link-waves', 'Link');
  if ((readiness.pickupCount || readiness.equipmentCount || readiness.rewardCount || readiness.npcCount || readiness.merchantCount) && !scriptIds.has('gb_inventory_hotbar')) {
    addCheck('warning', 'Inventory runtime', 'Inventory-related components need the inventory system installed.', 'install-inventory-runtime');
  }
  if (readiness.componentCount && !((countComponents(objects).byType || {}).collider)) {
    addCheck('suggestion', 'Collision', 'Tag solid walls, floors, or props with collider components.', 'add-colliders');
  }

  getRenderableHotspots(objects).forEach((item) => {
    addCheck('suggestion', 'High triangles', item.name + ' has about ' + formatNumberShort(item.triangles) + ' triangles.');
  });

  const errors = checks.filter((check) => check.level === 'error').length;
  const warnings = checks.filter((check) => check.level === 'warning').length;
  const suggestions = checks.filter((check) => check.level === 'suggestion').length;
  const fixes = checks.filter((check) => check.action).length;
  const status = errors ? 'blocked' : warnings ? 'warn' : 'ready';
  const summary = status === 'ready'
    ? 'Core game loop linked'
    : status === 'warn'
      ? warnings + ' warning' + (warnings === 1 ? '' : 's')
      : errors + ' blocker' + (errors === 1 ? '' : 's');
  return {
    status,
    summary,
    errors,
    warnings,
    suggestions,
    fixes,
    checks,
  };
}

function createValidationRow(check) {
  const row = document.createElement('div');
  row.className = 'gb-validation-row';
  row.dataset.level = check.level || 'info';
  row.dataset.hasAction = check.action ? 'true' : 'false';
  row.append(createTextElement('span', '', check.label || 'Check'), createTextElement('strong', '', check.detail || 'Ready'));
  if (check.action) {
    const button = createSmallButton(check.actionLabel || 'Review', () => openValidationFixPreview(check.action), { editOnly: true, action: 'review validation fixes' });
    button.dataset.gbValidationFix = check.action;
    row.appendChild(button);
  }
  return row;
}

function renderValidationReview() {
  const review = document.getElementById('gb-validation-review');
  if (!review) return;
  review.replaceChildren();
  const latest = window._lastGameBuilderValidationFix || null;
  if (!pendingValidationFix && !latest) {
    review.dataset.state = 'empty';
    return;
  }

  review.dataset.state = pendingValidationFix ? 'pending' : 'applied';
  const head = document.createElement('div');
  head.className = 'gb-validation-review-head';
  const title = pendingValidationFix
    ? pendingValidationFix.title
    : (latest.applied > 0 ? 'Last fix applied' : 'Last fix');
  const meta = pendingValidationFix
    ? (pendingValidationFix.count + ' change' + (pendingValidationFix.count === 1 ? '' : 's'))
    : (latest.applied + ' applied');
  head.append(createTextElement('strong', '', title), createTextElement('span', '', meta));

  const detail = createTextElement('div', 'gb-validation-review-detail', pendingValidationFix ? pendingValidationFix.detail : latest.detail);
  review.append(head, detail);

  if (pendingValidationFix?.targets?.length) {
    const targets = document.createElement('div');
    targets.className = 'gb-validation-targets';
    pendingValidationFix.targets.slice(0, 4).forEach((name) => targets.appendChild(createTextElement('span', '', name)));
    if (pendingValidationFix.targets.length > 4) targets.appendChild(createTextElement('span', '', '+' + (pendingValidationFix.targets.length - 4)));
    review.appendChild(targets);
  }

  const actions = document.createElement('div');
  actions.className = 'gb-validation-review-actions';
  if (pendingValidationFix) {
    const apply = createSmallButton('Apply', () => applyPendingValidationFix(), { editOnly: true, action: 'apply validation fixes' });
    apply.dataset.gbValidationApply = pendingValidationFix.action;
    const cancel = createSmallButton('Cancel', () => cancelValidationFixPreview(), { editOnly: true, action: 'cancel validation fix preview' });
    cancel.dataset.gbValidationCancel = pendingValidationFix.action;
    actions.append(apply, cancel);
  } else if (latest?.undoAvailable && !latest.undone) {
    const undo = createSmallButton('Undo', () => undoValidationFix(latest.undoId), { editOnly: true, action: 'undo validation fixes' });
    undo.dataset.gbValidationUndo = latest.action;
    actions.appendChild(undo);
  }
  if (actions.childNodes.length) review.appendChild(actions);
}

function renderValidationStatus() {
  const status = document.getElementById('gb-validation-status');
  const list = document.getElementById('gb-validation-list');
  if (!status || !list) return;
  const validation = collectSceneValidation(window._gameBuilderReadiness || collectReadiness());
  const latest = window._lastGameBuilderValidationFix || null;
  const reviewSignature = JSON.stringify({
    pending: pendingValidationFix ? [pendingValidationFix.action, pendingValidationFix.count, pendingValidationFix.createdAt] : null,
    latest: latest ? [latest.action, latest.applied, latest.undoAvailable, latest.undone, latest.fixedAt] : null,
  });
  const signature = JSON.stringify(validation) + '|' + reviewSignature;
  window._gameBuilderValidation = validation;
  if (signature === lastValidationSignature) return;
  lastValidationSignature = signature;
  status.dataset.status = validation.status;
  status.dataset.summary = validation.summary;
  status.dataset.errors = String(validation.errors);
  status.dataset.warnings = String(validation.warnings);
  status.dataset.suggestions = String(validation.suggestions);
  status.dataset.fixes = String(validation.fixes);
  status.setAttribute('aria-label', validation.summary);
  status.replaceChildren(
    createTextElement('strong', '', validation.status === 'ready' ? 'Scene Ready' : validation.status === 'warn' ? 'Needs Attention' : 'Blocked'),
    createTextElement('span', '', validation.summary)
  );
  const rows = validation.checks.length
    ? validation.checks.slice(0, 7).map(createValidationRow)
    : [createValidationRow({ level: 'ready', label: 'Core loop', detail: 'Spawn, goals, systems, and links look ready.' })];
  list.replaceChildren(...rows);
  renderValidationReview();
}

function createTemplatesSection() {
  const section = document.createElement('section');
  section.className = 'gb-section';
  section.id = 'gb-templates';
  const heading = document.createElement('h3');
  heading.textContent = 'Templates';
  const list = document.createElement('div');
  list.id = 'gb-template-list';
  list.className = 'gb-template-list';
  GENRE_TEMPLATES.forEach((template) => {
    const card = document.createElement('div');
    card.className = 'gb-template-card';
    card.dataset.gbTemplate = template.id;
    const info = document.createElement('div');
    info.className = 'gb-template-info';
    info.append(
      createTextElement('strong', '', template.name),
      createTextElement('span', '', template.detail)
    );
    const button = createSmallButton('Apply', async () => {
      setBusy(button, true);
      await applyGenreTemplate(template);
      setBusy(button, false);
    }, { editOnly: true, action: 'apply templates' });
    button.dataset.gbTemplateAction = template.id;
    card.append(info, button);
    list.appendChild(card);
  });
  section.append(heading, list);
  window._gameBuilderTemplates = GENRE_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    commands: template.commands.slice(),
    scripts: template.scripts.slice(),
  }));
  return section;
}

function createGameSystemsSection() {
  const section = document.createElement('section');
  section.className = 'gb-section';
  section.id = 'gb-systems';
  const heading = document.createElement('h3');
  heading.textContent = 'Game Systems';
  const list = document.createElement('div');
  list.id = 'gb-systems-list';
  list.className = 'gb-systems-list';
  section.append(heading, list);
  return section;
}

function collectGameSystemState() {
  const objects = getSceneObjects();
  const componentCounts = countComponents(objects);
  const scriptIds = getInstalledScriptIds();
  const hasTarget = !!getTargetObject();
  return GAME_SYSTEMS.map((system) => {
    const installed = system.scriptId ? scriptIds.has(system.scriptId) : (componentCounts.byType[system.countKey] || 0) > 0;
    const count = system.countKey ? componentCounts.byType[system.countKey] || 0 : 0;
    const status = installed ? 'installed' : system.component && !hasTarget ? 'needs-object' : 'available';
    const statusText = installed
      ? (system.countKey ? count + ' tagged' : 'Installed')
      : (status === 'needs-object' ? 'Select object' : 'Ready');
    return {
      id: system.id,
      name: system.name,
      detail: system.detail,
      status,
      statusText,
      actionLabel: installed ? 'Reapply' : system.actionLabel,
      script: system.script,
      component: system.component,
    };
  });
}

function renderGameSystems() {
  const list = document.getElementById('gb-systems-list');
  if (!list) return;
  const systems = collectGameSystemState();
  const signature = JSON.stringify(systems.map((system) => [system.id, system.status, system.statusText]));
  window._gameBuilderSystems = systems;
  if (signature === lastGameSystemsSignature) return;
  lastGameSystemsSignature = signature;
  list.replaceChildren(...systems.map(createGameSystemCard));
  updateEditorControlState();
}

function createGameSystemCard(system) {
  const card = document.createElement('div');
  card.className = 'gb-system-card';
  card.dataset.gbSystem = system.id;
  card.dataset.status = system.status;

  const info = document.createElement('div');
  info.className = 'gb-system-info';
  info.append(
    createTextElement('strong', '', system.name),
    createTextElement('span', '', system.detail)
  );

  const controls = document.createElement('div');
  controls.className = 'gb-system-controls';
  const badge = createTextElement('span', 'gb-system-badge', system.statusText);
  const button = createSmallButton(system.actionLabel, async () => {
    if (system.script) await installScript(system.script);
    if (system.component) await markComponent(system.component);
    lastGameSystemsSignature = '';
    updateBuilderUi();
  }, { editOnly: true, action: system.script ? 'install game systems' : 'tag gameplay components' });
  button.dataset.gbAction = 'install-system';
  button.dataset.gbSystemAction = system.id;
  controls.append(badge, button);
  card.append(info, controls);
  return card;
}

function getAssetBaseUrl() {
  if (typeof window._crateAssetBaseUrl === 'function') {
    const base = window._crateAssetBaseUrl();
    if (base) return base;
  }
  const meta = document.querySelector('meta[name="crate-asset-base"],meta[name="crateship-asset-base"]');
  return (meta?.getAttribute('content') || window.CRATESHIP_ASSET_BASE_URL || '').replace(/\/+$/, '');
}

function shortAssetValue(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > 18 ? text.slice(0, 12) + '...' + text.slice(-4) : text;
}

async function refreshAssetManifest(force = false) {
  if (assetManifestLoadStarted && !force) return;
  assetManifestLoadStarted = true;
  const base = getAssetBaseUrl();
  window._crateAssetManifestStatus = { status: 'loading', base };
  renderAssetPackStatus();
  try {
    if (!base) throw new Error('No asset host configured');
    const response = await fetch(new URL('/asset-manifest.json', base + '/').href, { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const manifest = await response.json();
    window._crateAssetManifest = manifest;
    window._assetManifestVersion = manifest.version || '';
    window._crateAssetManifestStatus = { status: 'loaded', base, checkedAt: Date.now() };
  } catch (err) {
    window._crateAssetManifestStatus = { status: 'failed', base, error: err?.message || String(err || 'Asset manifest failed') };
  }
  lastAssetPackSignature = '';
  renderAssetPackStatus();
  updateProjectStatus();
}

function getCurrentMode() {
  const bridgeMode = window._engineBridge?.getMode?.();
  const raw = bridgeMode || window._engine?.mode || window._currentMode || (window._engine?.playMode ? 'play' : 'edit');
  const mode = String(raw || 'edit').toLowerCase();
  return mode === 'view' ? 'explore' : mode;
}

function isEditMode() {
  const bridgeValue = window._engineBridge?.isEditMode?.();
  if (bridgeValue === false) return false;
  return getCurrentMode() === 'edit';
}

function requireEditAction(action) {
  if (isEditMode()) return true;
  notify('Switch to Edit mode to ' + action);
  updateEditorControlState();
  return false;
}

function markEditOnly(el, action) {
  if (!el) return el;
  el.dataset.gbEditOnly = 'true';
  el.dataset.gbEditAction = action || 'edit this';
  return el;
}

function formatModeLabel(mode) {
  if (mode === 'play') return 'Play';
  if (mode === 'explore') return 'Explore';
  return 'Edit';
}

function updateEditorControlState() {
  const edit = isEditMode();
  const panel = document.getElementById('game-builder-panel');
  if (panel) panel.dataset.editMode = edit ? 'true' : 'false';
  document.querySelectorAll('[data-gb-edit-only="true"]').forEach((el) => {
    el.disabled = !edit;
    el.setAttribute('aria-disabled', edit ? 'false' : 'true');
    if (!edit) {
      el.dataset.disabledMode = getCurrentMode();
      if (!el.dataset.originalTitle) el.dataset.originalTitle = el.title || '';
      el.title = 'Switch to Edit mode to ' + (el.dataset.gbEditAction || 'edit this');
    } else {
      delete el.dataset.disabledMode;
      if (el.dataset.originalTitle !== undefined) {
        el.title = el.dataset.originalTitle;
        delete el.dataset.originalTitle;
      }
    }
  });
}

function updateModeControls() {
  const mode = getCurrentMode();
  document.querySelectorAll('[data-gb-mode]').forEach((button) => {
    const selected = button.dataset.gbMode === mode;
    button.dataset.selected = selected ? 'true' : 'false';
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
  updateEditorControlState();
}

function setBuilderMode(mode) {
  const normalized = mode === 'view' ? 'explore' : mode;
  const setter = window._setMode || window._engineBridge?.setMode || window._engine?.setMode;
  if (setter) setter(normalized);
  else if (normalized === 'play') window._engineBridge?.enterPlayMode?.();
  else window._engineBridge?.exitPlayMode?.();
  updateModeControls();
  updateBuilderUi();
  updateStats();
}

function createModeSection() {
  const section = document.createElement('section');
  section.className = 'gb-section';
  const heading = document.createElement('h3');
  heading.textContent = 'Mode';
  const row = document.createElement('div');
  row.className = 'gb-mode-row';
  [
    { mode: 'edit', label: 'Edit', title: 'Select, move, inspect, and change objects' },
    { mode: 'explore', label: 'Explore', title: 'Move the camera without selecting objects' },
    { mode: 'play', label: 'Play', title: 'Run the game without editor interactions' },
  ].forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gb-mode-btn';
    button.dataset.gbMode = item.mode;
    button.textContent = item.label;
    button.title = item.title;
    button.addEventListener('click', () => setBuilderMode(item.mode));
    row.appendChild(button);
  });
  section.append(heading, row);
  return section;
}

function createPlacementSection() {
  const section = document.createElement('section');
  section.className = 'gb-section';
  const heading = document.createElement('h3');
  heading.textContent = 'Placement';
  const status = document.createElement('div');
  status.id = 'gb-placement-status';
  status.className = 'gb-placement-status';
  section.append(heading, status);
  return section;
}

function createProjectSection() {
  const section = document.createElement('section');
  section.className = 'gb-section';
  section.id = 'gb-project';
  const heading = document.createElement('h3');
  heading.textContent = 'Project';
  const status = document.createElement('div');
  status.id = 'gb-project-status';
  status.className = 'gb-project-status';
  const grid = document.createElement('div');
  grid.className = 'gb-grid gb-project-grid';
  PROJECT_ACTIONS.forEach((preset) => grid.appendChild(createButton(preset)));
  section.append(heading, status, grid);
  return section;
}

function createAssetPackSection() {
  const section = document.createElement('section');
  section.className = 'gb-section';
  section.id = 'gb-asset-pack';
  const heading = document.createElement('h3');
  heading.textContent = 'Asset Pack';
  const status = document.createElement('div');
  status.id = 'gb-asset-pack-status';
  status.className = 'gb-asset-pack-status';
  const refresh = createSmallButton('Check', () => refreshAssetManifest(true), { action: 'check assets' });
  refresh.dataset.gbAction = 'asset-pack-refresh';
  section.append(heading, status, refresh);
  return section;
}

function formatPosition(obj) {
  if (!obj?.position) return 'No position';
  return 'x ' + obj.position.x.toFixed(1) + ' y ' + obj.position.y.toFixed(1) + ' z ' + obj.position.z.toFixed(1);
}

function formatPlacementPosition(state) {
  if (!Number.isFinite(state?.x) || !Number.isFinite(state?.z)) return '';
  const y = Number.isFinite(state.y) ? ' y ' + state.y.toFixed(1) : '';
  return 'x ' + state.x.toFixed(1) + y + ' z ' + state.z.toFixed(1);
}

function renderPlacementStatus() {
  const box = document.getElementById('gb-placement-status');
  if (!box) return;
  const state = window._lastAssetPlacement || {};
  const target = getTargetObject();
  const fallbackName = target ? getObjectName(target, 0) : '';
  const status = state.status || (fallbackName ? 'selected' : 'ready');
  const name = state.name || fallbackName || 'Ready';
  const position = formatPlacementPosition(state) || (target ? formatPosition(target) : '');
  const signature = [status, name, position, state.objectId || '', state.updatedAt || ''].join('|');
  if (signature === lastPlacementSignature) return;
  lastPlacementSignature = signature;
  box.dataset.status = status;
  box.innerHTML = '';
  const title = createTextElement('strong', '', status === 'loading' ? 'Placing' : status === 'failed' ? 'Placement failed' : status === 'blocked' ? 'Placement blocked' : status === 'placed' ? 'Placed' : 'Ready');
  const item = createTextElement('span', '', name);
  box.append(title, item);
  if (position) box.appendChild(createTextElement('span', '', position));
  if (state.error) box.appendChild(createTextElement('span', 'gb-placement-error', state.error));
}

function renderAssetPackStatus() {
  const box = document.getElementById('gb-asset-pack-status');
  if (!box) return;
  const state = window._crateAssetManifestStatus || {};
  const manifest = window._crateAssetManifest || {};
  const base = state.base || getAssetBaseUrl() || 'local';
  const version = manifest.version || window._assetManifestVersion || '';
  const integrity = manifest.integrity || {};
  const signature = [
    state.status || '',
    base,
    version,
    integrity.checkedModels || '',
    integrity.catalogReferences || '',
    state.error || '',
  ].join('|');
  if (signature === lastAssetPackSignature) return;
  lastAssetPackSignature = signature;
  box.dataset.status = state.status || (version ? 'loaded' : 'idle');
  box.innerHTML = '';
  if (state.status === 'failed') {
    box.append(createTextElement('strong', '', 'Asset host issue'), createTextElement('span', 'gb-placement-error', state.error || 'Manifest unavailable'));
    return;
  }
  if (state.status === 'loading') {
    box.append(createTextElement('strong', '', 'Checking assets'), createTextElement('span', '', shortAssetValue(base)));
    return;
  }
  box.append(
    createTextElement('strong', '', version ? 'Assets ' + shortAssetValue(version) : 'Assets ready'),
    createTextElement('span', '', shortAssetValue(base)),
  );
  if (integrity.checkedModels || integrity.catalogReferences) {
    box.appendChild(createTextElement('span', '', (integrity.checkedModels || 0) + ' models | ' + (integrity.catalogReferences || 0) + ' refs'));
  }
}

function formatComponentList(obj) {
  const components = Object.keys(obj?.userData?.gbComponents || {});
  if (obj?.userData?.hasPhysics && !components.includes('physics')) components.push('physics');
  return components.length ? components.join(', ') : 'No components';
}

function formatNumberShort(value) {
  const number = Math.max(0, Math.round(Number(value) || 0));
  if (number >= 1000000) return Math.round(number / 100000) / 10 + 'm';
  if (number >= 1000) return Math.round(number / 100) / 10 + 'k';
  return String(number);
}

function countRenderableStats(obj) {
  const stats = { meshes: 0, materials: 0, triangles: 0 };
  const materials = new Set();
  const visit = (node) => {
    if (!node || !node.isMesh) return;
    stats.meshes += 1;
    const materialList = Array.isArray(node.material) ? node.material : [node.material];
    materialList.filter(Boolean).forEach((material) => materials.add(material.uuid || material.name || material));
    const geometry = node.geometry || {};
    const positionCount = Number(geometry.attributes?.position?.count) || 0;
    const indexCount = Number(geometry.index?.count) || 0;
    stats.triangles += Math.floor((indexCount || positionCount) / 3);
  };
  if (typeof obj?.traverse === 'function') obj.traverse(visit);
  else visit(obj);
  stats.materials = materials.size;
  return stats;
}

function getObjectAssetSource(obj) {
  const data = obj?.userData || {};
  return data.assetPath || data.modelPath || data.modelUrl || data.url || data.src || data.source || data.path || '';
}

function collectObjectHealth(obj) {
  const components = obj?.userData?.gbComponents || {};
  const componentNames = Object.keys(components);
  const allCounts = countComponents(getSceneObjects()).byType || {};
  const issues = [];
  if (components.triggerZone && !allCounts.door) issues.push('Trigger needs a door');
  if (components.door && !allCounts.triggerZone) issues.push('Door needs a trigger');
  if ((components.missionReward || components.missionGate) && !allCounts.missionStep) issues.push('Mission link needs a step');
  if (components.waveController && !allCounts.enemySpawn) issues.push('Wave needs an enemy spawn');
  if (components.enemySpawn && !allCounts.waveController) issues.push('Enemy spawn needs a wave');
  const renderStats = countRenderableStats(obj);
  const status = componentNames.length ? (issues.length ? 'warn' : 'ready') : 'empty';
  const summary = status === 'ready'
    ? componentNames.length + ' components ready'
    : status === 'warn'
      ? issues.length + ' setup issue' + (issues.length === 1 ? '' : 's')
      : 'No gameplay components';
  return {
    status,
    summary,
    componentNames,
    issues,
    renderStats,
    interactable: obj?.userData?.interactable === true,
    interactLabel: obj?.userData?.interactLabel || '',
    assetSource: getObjectAssetSource(obj),
  };
}

function createObjectMetric(label, value) {
  const row = document.createElement('div');
  row.className = 'gb-object-metric';
  row.append(createTextElement('span', '', label), createTextElement('strong', '', value));
  return row;
}

function renderObjectHealth(health) {
  const panel = document.createElement('div');
  panel.id = 'gb-object-health';
  panel.className = 'gb-object-health';
  panel.dataset.status = health.status;
  panel.dataset.summary = health.summary;
  panel.dataset.components = String(health.componentNames.length);
  panel.dataset.issues = String(health.issues.length);

  const head = document.createElement('div');
  head.className = 'gb-object-health-head';
  head.append(createTextElement('strong', '', health.status === 'ready' ? 'Ready for Play' : health.status === 'warn' ? 'Needs links' : 'No gameplay yet'), createTextElement('span', '', health.summary));

  const metrics = document.createElement('div');
  metrics.className = 'gb-object-metrics';
  metrics.append(
    createObjectMetric('Meshes', formatNumberShort(health.renderStats.meshes)),
    createObjectMetric('Tris', formatNumberShort(health.renderStats.triangles)),
    createObjectMetric('Materials', formatNumberShort(health.renderStats.materials))
  );

  const chips = document.createElement('div');
  chips.className = 'gb-component-chips';
  const labels = health.componentNames.length ? health.componentNames.map(formatComponentLabel) : ['Add component'];
  labels.slice(0, 8).forEach((label) => chips.appendChild(createTextElement('span', '', label)));
  if (labels.length > 8) chips.appendChild(createTextElement('span', '', '+' + (labels.length - 8)));

  panel.append(head, metrics, chips);
  if (health.interactable || health.interactLabel) {
    panel.appendChild(createTextElement('div', 'gb-health-detail', 'Interact: ' + (health.interactLabel || 'Enabled')));
  }
  if (health.assetSource) {
    panel.appendChild(createTextElement('div', 'gb-health-detail', 'Asset: ' + shortAssetValue(health.assetSource)));
  }
  if (health.issues.length) {
    const issueList = document.createElement('div');
    issueList.className = 'gb-health-issues';
    health.issues.slice(0, 4).forEach((issue) => issueList.appendChild(createTextElement('span', '', issue)));
    panel.appendChild(issueList);
  }
  return panel;
}

function createTextElement(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

function createField(label, input) {
  const row = document.createElement('label');
  row.className = 'gb-field';
  row.append(createTextElement('span', '', label), input);
  return row;
}

function createNumberInput(value, step, onChange, options = {}) {
  const input = document.createElement('input');
  input.type = 'number';
  input.step = String(step || 0.1);
  input.value = Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : '0';
  if (options.editOnly) markEditOnly(input, options.action || 'edit values');
  input.addEventListener('change', () => {
    if (options.editOnly && !requireEditAction(options.action || 'edit values')) {
      input.value = Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : '0';
      return;
    }
    onChange(parseNumber(input.value, value || 0));
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') input.blur();
  });
  return input;
}

function createTextInput(value, onChange, options = {}) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value == null ? '' : String(value);
  if (options.editOnly) markEditOnly(input, options.action || 'edit text');
  input.addEventListener('change', () => {
    if (options.editOnly && !requireEditAction(options.action || 'edit text')) {
      input.value = value == null ? '' : String(value);
      return;
    }
    onChange(input.value.trim());
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') input.blur();
  });
  return input;
}

function createSmallButton(label, onClick, options = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'gb-small-btn';
  button.textContent = label;
  if (options.editOnly) markEditOnly(button, options.action || 'edit this');
  button.addEventListener('click', () => {
    if (options.editOnly && !requireEditAction(options.action || 'edit this')) return;
    onClick();
  });
  return button;
}

function updateInspectorObject(target) {
  window._lastPlacedObj = target;
  lastSceneSignature = '';
  updateStats();
  renderSceneList();
}

function renderComponentEditor(container, obj, componentName, data) {
  const card = document.createElement('div');
  card.className = 'gb-component-card';

  const head = document.createElement('div');
  head.className = 'gb-component-head';
  head.appendChild(createTextElement('strong', '', formatComponentLabel(componentName)));
  head.appendChild(createSmallButton('Remove', () => {
    delete obj.userData.gbComponents[componentName];
    lastInspectorSignature = '';
    notify(formatComponentLabel(componentName) + ' removed');
    updateBuilderUi();
  }, { editOnly: true, action: 'remove components' }));
  card.appendChild(head);

  const fields = COMPONENT_FIELDS[componentName] || Object.keys(data || {}).map((key) => ({ key, label: formatComponentLabel(key), kind: typeof data[key] === 'number' ? 'number' : 'text' }));
  fields.forEach((field) => {
    const value = data[field.key];
    const input = field.kind === 'number'
      ? createNumberInput(Number(value), field.step || 0.1, (next) => {
          data[field.key] = next;
          updateInspectorObject(obj);
        }, { editOnly: true, action: 'edit component fields' })
      : createTextInput(value, (next) => {
          data[field.key] = next;
          updateInspectorObject(obj);
        }, { editOnly: true, action: 'edit component fields' });
    card.appendChild(createField(field.label, input));
  });

  container.appendChild(card);
}

async function saveSelectedBlueprint() {
  if (!requireEditAction('save blueprints')) return;
  const target = selectObject(getTargetObject());
  if (!target) return;
  const components = cloneJson(target.userData?.gbComponents || {});
  const nameInput = document.getElementById('gb-blueprint-name');
  const name = (nameInput?.value || '').trim() || getObjectName(target, 0) + ' Blueprint';
  const blueprints = readBlueprints();
  const id = 'gbp_' + Date.now().toString(36);
  blueprints.unshift({
    id,
    name,
    components,
    interactable: !!target.userData?.interactable,
    interactLabel: target.userData?.interactLabel || '',
    createdAt: Date.now(),
  });
  writeBlueprints(blueprints);
  notify('Blueprint saved: ' + name);
  renderBlueprintList();
}

async function applyBlueprint(id) {
  if (!requireEditAction('apply blueprints')) return;
  const target = selectObject(getTargetObject());
  const blueprint = readBlueprints().find((item) => item.id === id);
  if (!target || !blueprint) return;
  target.userData = target.userData || {};
  target.userData.gbComponents = cloneJson(blueprint.components || {});
  if (blueprint.interactable) target.userData.interactable = true;
  if (blueprint.interactLabel) target.userData.interactLabel = blueprint.interactLabel;
  await ensureRuntimeForComponents(target.userData.gbComponents);
  lastInspectorSignature = '';
  notify('Applied blueprint: ' + blueprint.name);
  updateBuilderUi();
}

function deleteBlueprint(id) {
  if (!requireEditAction('delete blueprints')) return;
  const blueprints = readBlueprints().filter((item) => item.id !== id);
  writeBlueprints(blueprints);
  notify('Blueprint deleted');
  renderBlueprintList();
}

function renderInspector(options = {}) {
  const inspector = document.getElementById('gb-inspector');
  if (!inspector) return;
  if (!options.force && document.activeElement?.closest?.('#gb-inspector')) return;
  const target = getTargetObject();
  const edit = isEditMode();
  const objectHealth = target ? collectObjectHealth(target) : null;
  const signature = target ? [
    edit ? 'edit' : 'readonly',
    target.uuid || target.id || 'object',
    getObjectName(target, 0),
    target.position?.x?.toFixed(2),
    target.position?.y?.toFixed(2),
    target.position?.z?.toFixed(2),
    target.rotation?.y?.toFixed(2),
    target.scale?.x?.toFixed(2),
    JSON.stringify(target.userData?.gbComponents || {}),
    JSON.stringify(objectHealth),
  ].join('|') : 'empty';
  if (signature === lastInspectorSignature) return;
  lastInspectorSignature = signature;
  inspector.innerHTML = '';

  if (!target) {
    inspector.appendChild(createTextElement('div', 'gb-empty', 'Select an object from the scene list to edit game behavior.'));
    return;
  }

  if (!edit) {
    inspector.appendChild(createTextElement('div', 'gb-readonly-note', 'Read-only in ' + formatModeLabel(getCurrentMode()) + '. Switch to Edit to change this object.'));
  }

  const summary = document.createElement('div');
  summary.className = 'gb-inspector-summary';
  const title = createTextElement('strong', '', getObjectName(target, 0));
  const meta = createTextElement('span', '', formatPosition(target));
  summary.append(title, meta);
  inspector.appendChild(summary);
  inspector.appendChild(renderObjectHealth(objectHealth));

  inspector.appendChild(createField('Name', createTextInput(getObjectName(target, 0), (next) => {
    target.userData.name = next || getObjectName(target, 0);
    updateInspectorObject(target);
  }, { editOnly: true, action: 'rename objects' })));

  const transformGrid = document.createElement('div');
  transformGrid.className = 'gb-transform-grid';
  transformGrid.append(
    createField('X', createNumberInput(target.position.x, 0.1, (next) => { target.position.x = next; updateInspectorObject(target); }, { editOnly: true, action: 'move objects' })),
    createField('Y', createNumberInput(target.position.y, 0.1, (next) => { target.position.y = next; updateInspectorObject(target); }, { editOnly: true, action: 'move objects' })),
    createField('Z', createNumberInput(target.position.z, 0.1, (next) => { target.position.z = next; updateInspectorObject(target); }, { editOnly: true, action: 'move objects' })),
    createField('Rot Y', createNumberInput(target.rotation?.y || 0, 0.1, (next) => { target.rotation.y = next; updateInspectorObject(target); }, { editOnly: true, action: 'rotate objects' })),
    createField('Scale', createNumberInput(target.scale?.x || 1, 0.05, (next) => {
      const scale = Math.max(0.01, next);
      target.scale.setScalar(scale);
      updateInspectorObject(target);
    }, { editOnly: true, action: 'scale objects' }))
  );
  inspector.appendChild(transformGrid);

  const actionRow = document.createElement('div');
  actionRow.className = 'gb-action-row';
  actionRow.append(
    createSmallButton('Focus', () => focusObject(target)),
    createSmallButton('Clone', () => duplicateTarget(target), { editOnly: true, action: 'clone objects' }),
    createSmallButton('Delete', () => deleteTarget(target), { editOnly: true, action: 'delete objects' })
  );
  inspector.appendChild(actionRow);

  const components = target.userData?.gbComponents || {};
  const componentNames = Object.keys(components);
  const componentWrap = document.createElement('div');
  componentWrap.className = 'gb-component-editor';
  if (!componentNames.length) {
    componentWrap.appendChild(createTextElement('div', 'gb-empty', 'No behavior components yet. Add one above.'));
  } else {
    componentNames.forEach((name) => renderComponentEditor(componentWrap, target, name, components[name]));
  }
  inspector.appendChild(componentWrap);
}

function renderBlueprintList() {
  const list = document.getElementById('gb-blueprint-list');
  if (!list) return;
  if (document.activeElement?.closest?.('#gb-blueprints')) return;
  const blueprints = readBlueprints();
  const signature = blueprints.map((item) => [item.id, item.name, JSON.stringify(item.components || {})].join(':')).join('|') || 'empty';
  if (signature === lastBlueprintSignature) return;
  lastBlueprintSignature = signature;
  list.innerHTML = '';

  if (!blueprints.length) {
    list.appendChild(createTextElement('div', 'gb-empty', 'Save a selected object setup to reuse it on another object.'));
    return;
  }

  blueprints.slice(0, 8).forEach((blueprint) => {
    const row = document.createElement('div');
    row.className = 'gb-blueprint-row';
    const info = document.createElement('div');
    info.className = 'gb-blueprint-info';
    info.append(
      createTextElement('strong', '', blueprint.name),
      createTextElement('span', '', Object.keys(blueprint.components || {}).map(formatComponentLabel).join(', ') || 'No components')
    );
    const actions = document.createElement('div');
    actions.className = 'gb-scene-actions';
    actions.append(
      createSmallButton('Apply', () => applyBlueprint(blueprint.id), { editOnly: true, action: 'apply blueprints' }),
      createSmallButton('Delete', () => deleteBlueprint(blueprint.id), { editOnly: true, action: 'delete blueprints' })
    );
    row.append(info, actions);
    list.appendChild(row);
  });
}

function renderSceneList() {
  const list = document.getElementById('gb-scene-list');
  if (!list) return;
  const objects = getSceneObjects();
  const target = getTargetObject();
  const visibleObjects = objects.slice(-10).reverse();
  const signature = [
    objects.length,
    target?.uuid || 'none',
    ...visibleObjects.map((obj) => [
      obj.uuid || obj.id || obj.userData?.name || 'object',
      obj.position?.x?.toFixed(1),
      obj.position?.y?.toFixed(1),
      obj.position?.z?.toFixed(1),
      formatComponentList(obj),
    ].join(':')),
  ].join('|');
  if (signature === lastSceneSignature) return;
  lastSceneSignature = signature;
  list.innerHTML = '';

  if (!objects.length) {
    const empty = document.createElement('div');
    empty.className = 'gb-empty';
    empty.textContent = 'Build a world or add an asset to see scene objects here.';
    list.appendChild(empty);
    return;
  }

  visibleObjects.forEach((obj, index) => {
    const row = document.createElement('div');
    row.className = 'gb-scene-row';
    row.dataset.selected = obj === target ? 'true' : 'false';

    const main = document.createElement('button');
    main.className = 'gb-scene-main';
    main.type = 'button';
    main.title = 'Select object';
    markEditOnly(main, 'select objects');
    main.addEventListener('click', () => selectObject(obj));

    const name = document.createElement('span');
    name.className = 'gb-scene-name';
    name.textContent = getObjectName(obj, objects.length - index - 1);

    const meta = document.createElement('span');
    meta.className = 'gb-scene-meta';
    meta.textContent = formatPosition(obj) + ' | ' + formatComponentList(obj);

    const actions = document.createElement('div');
    actions.className = 'gb-scene-actions';

    const focus = document.createElement('button');
    focus.type = 'button';
    focus.textContent = 'View';
    focus.addEventListener('click', () => focusObject(obj));

    const clone = document.createElement('button');
    clone.type = 'button';
    clone.textContent = 'Clone';
    markEditOnly(clone, 'clone objects');
    clone.addEventListener('click', () => {
      if (!requireEditAction('clone objects')) return;
      duplicateTarget(obj);
    });

    main.append(name, meta);
    actions.append(focus, clone);
    row.append(main, actions);
    list.appendChild(row);
  });
}

function updateBuilderUi() {
  updateStats();
  updateModeControls();
  updateProjectStatus();
  renderPlacementStatus();
  renderAssetPackStatus();
  renderReadinessStatus();
  renderPerformanceStatus();
  renderValidationStatus();
  renderGameSystems();
  renderInspector();
  renderBlueprintList();
  renderSceneList();
  updateEditorControlState();
}

function setOpen(panel, toggle, open) {
  panel.dataset.open = open ? 'true' : 'false';
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  localStorage.setItem(STORAGE_KEY, open ? 'true' : 'false');
  repositionLegacyButtons(open);
}

function repositionLegacyButtons(open) {
  ['ai-settings-btn', 'mp-lobby-btn', 'code-editor-btn'].forEach((id, index) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.left = open && !isSmallScreen() ? (392 + index * 46) + 'px' : (16 + index * 46) + 'px';
  });
}

function mount() {
  if (document.getElementById('game-builder-panel')) return;

  const style = document.createElement('style');
  style.textContent = `
    #game-builder-panel{position:fixed;top:72px;left:14px;bottom:50px;width:360px;z-index:12000;background:rgba(10,11,12,.94);border:1px solid #262b2e;border-radius:8px;box-shadow:0 16px 45px rgba(0,0,0,.45);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#e9edf0;display:flex;flex-direction:column;overflow:hidden;backdrop-filter:blur(14px);pointer-events:auto}
    #game-builder-panel[data-open="false"]{width:48px;bottom:auto;height:48px}
    #game-builder-panel[data-open="false"] .gb-body,#game-builder-panel[data-open="false"] .gb-title,#game-builder-panel[data-open="false"] #gb-stats{display:none}
    .gb-head{height:48px;display:flex;align-items:center;gap:10px;padding:0 10px;border-bottom:1px solid #202427;flex-shrink:0}
    .gb-toggle{width:30px;height:30px;border:1px solid #30373b;background:#151819;color:#f0f0f0;border-radius:6px;cursor:pointer;font-weight:800}
    .gb-title{display:flex;flex-direction:column;min-width:0}
    .gb-title strong{font-size:13px;line-height:16px}
    .gb-title span{font-size:11px;color:#8a9298;line-height:14px}
    #gb-stats{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto;justify-content:flex-end}
    #gb-stats span{font-size:10px;color:#aeb7bd;background:#151819;border:1px solid #272c2f;border-radius:999px;padding:3px 6px;white-space:nowrap}
    .gb-body{display:flex;flex-direction:column;gap:10px;overflow:auto;padding:10px}
    .gb-section{border:1px solid #20262a;border-radius:8px;overflow:hidden;background:#0d0f10}
    .gb-section h3{margin:0;padding:9px 10px;font-size:11px;text-transform:uppercase;letter-spacing:0;color:#98a2a9;border-bottom:1px solid #20262a;background:#121516}
    .gb-mode-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;padding:8px}
    .gb-mode-btn{height:32px;border:1px solid #2a3237;background:#161a1c;color:#dfe6ea;border-radius:6px;font-size:12px;cursor:pointer}
    .gb-mode-btn:hover{border-color:#4a9eff;color:#fff}
    .gb-mode-btn[data-selected="true"]{border-color:#4a9eff;background:#102033;color:#fff;font-weight:700}
    .gb-mode-btn[data-gb-mode="edit"][data-selected="true"]{border-color:#d9572b;background:#211a16}
    .gb-mode-btn[data-gb-mode="play"][data-selected="true"]{border-color:#38a169;background:#102318}
    #game-builder-panel[data-edit-mode="false"] .gb-section:has([data-gb-edit-only="true"]) h3::after{content:"Read only";float:right;text-transform:none;font-weight:600;color:#75808a}
    [data-gb-edit-only="true"]:disabled{opacity:.42!important;cursor:not-allowed!important}
    .gb-readonly-note{margin-bottom:8px;border:1px solid #374151;background:#111827;color:#c7d2fe;border-radius:7px;padding:7px 8px;font-size:11px;line-height:15px}
    .gb-placement-status{display:flex;flex-direction:column;gap:3px;margin:8px;border:1px solid #20262a;background:#121516;border-radius:7px;padding:8px;min-height:52px}
    .gb-placement-status strong{font-size:12px;line-height:16px;color:#eef2f3}
    .gb-placement-status span{font-size:10px;line-height:14px;color:#8d979e;white-space:normal;overflow-wrap:anywhere}
    .gb-placement-status[data-status="placed"]{border-color:#2f6f44;background:#101a13}
    .gb-placement-status[data-status="loading"]{border-color:#4a6f9c;background:#101722}
    .gb-placement-status[data-status="failed"],.gb-placement-status[data-status="blocked"]{border-color:#7f2d2d;background:#211313}
    .gb-placement-error{color:#ff9b9b!important}
    .gb-asset-pack-status{display:flex;flex-direction:column;gap:3px;margin:8px;border:1px solid #20262a;background:#121516;border-radius:7px;padding:8px;min-height:52px}
    .gb-asset-pack-status strong{font-size:12px;line-height:16px;color:#eef2f3}
    .gb-asset-pack-status span{font-size:10px;line-height:14px;color:#8d979e;white-space:normal;overflow-wrap:anywhere}
    .gb-asset-pack-status[data-status="loaded"]{border-color:#2f6f44;background:#101a13}
    .gb-asset-pack-status[data-status="loading"]{border-color:#4a6f9c;background:#101722}
    .gb-asset-pack-status[data-status="failed"]{border-color:#7f2d2d;background:#211313}
    #gb-asset-pack .gb-small-btn{margin:0 8px 8px;width:calc(100% - 16px)}
    .gb-readiness-status{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin:8px 8px 6px;border:1px solid #20262a;background:#121516;border-radius:7px;padding:8px}
    .gb-readiness-status strong{font-size:12px;line-height:16px;color:#eef2f3;white-space:normal;overflow-wrap:anywhere}
    .gb-readiness-status span{font-size:10px;line-height:14px;color:#8d979e;white-space:normal;text-align:right}
    .gb-readiness-status[data-status="ready"]{border-color:#2f6f44;background:#101a13}
    .gb-readiness-status[data-status="warn"]{border-color:#725a21;background:#1c1710}
    .gb-readiness-status[data-status="blocked"]{border-color:#7f2d2d;background:#211313}
    .gb-readiness-list{display:flex;flex-direction:column;gap:5px;padding:0 8px 8px}
    .gb-readiness-row{display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid #20262a;background:#101213;border-radius:6px;padding:6px 7px}
    .gb-readiness-row span{font-size:10px;line-height:14px;color:#8d979e;min-width:0}
    .gb-readiness-row strong{font-size:10px;line-height:14px;color:#dfe6ea;text-align:right;white-space:normal;overflow-wrap:anywhere}
    .gb-performance-status{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin:8px 8px 6px;border:1px solid #20262a;background:#121516;border-radius:7px;padding:8px}
    .gb-performance-status strong{font-size:12px;line-height:16px;color:#eef2f3;white-space:normal;overflow-wrap:anywhere}
    .gb-performance-status span{font-size:10px;line-height:14px;color:#8d979e;white-space:normal;text-align:right}
    .gb-performance-status[data-status="ready"]{border-color:#2f6f44;background:#101a13}
    .gb-performance-status[data-status="warn"]{border-color:#725a21;background:#1c1710}
    .gb-performance-status[data-status="blocked"]{border-color:#7f2d2d;background:#211313}
    .gb-performance-list{display:flex;flex-direction:column;gap:5px;padding:0 8px 8px}
    .gb-performance-row{display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid #20262a;background:#101213;border-radius:6px;padding:6px 7px}
    .gb-performance-row span{font-size:10px;line-height:14px;color:#8d979e;min-width:0}
    .gb-performance-row strong{font-size:10px;line-height:14px;color:#dfe6ea;text-align:right;white-space:normal;overflow-wrap:anywhere}
    .gb-quality-controls{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:5px;padding:0 8px 6px}
    .gb-quality-btn{height:28px;border:1px solid #2a3237;background:#161a1c;color:#dfe6ea;border-radius:6px;font-size:11px;cursor:pointer}
    .gb-quality-btn:hover{border-color:#4a9eff;color:#fff}
    .gb-quality-btn[data-selected="true"]{border-color:#4a9eff;background:#102033;color:#fff;font-weight:700}
    .gb-quality-summary{padding:0 8px 7px;color:#8d979e;font-size:10px;line-height:14px;white-space:normal;overflow-wrap:anywhere}
    .gb-validation-status{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin:8px 8px 6px;border:1px solid #20262a;background:#121516;border-radius:7px;padding:8px}
    .gb-validation-status strong{font-size:12px;line-height:16px;color:#eef2f3;white-space:normal;overflow-wrap:anywhere}
    .gb-validation-status span{font-size:10px;line-height:14px;color:#8d979e;white-space:normal;text-align:right}
    .gb-validation-status[data-status="ready"]{border-color:#2f6f44;background:#101a13}
    .gb-validation-status[data-status="warn"]{border-color:#725a21;background:#1c1710}
    .gb-validation-status[data-status="blocked"]{border-color:#7f2d2d;background:#211313}
    .gb-validation-review{display:flex;flex-direction:column;gap:6px;margin:0 8px 7px;border:1px solid #263138;background:#101213;border-radius:7px;padding:7px}
    .gb-validation-review[data-state="empty"]{display:none}
    .gb-validation-review[data-state="pending"]{border-color:#4a6f9c;background:#101722}
    .gb-validation-review-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .gb-validation-review-head strong{font-size:12px;line-height:16px;color:#eef2f3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gb-validation-review-head span{font-size:10px;line-height:14px;color:#8d979e;white-space:nowrap}
    .gb-validation-review-detail{font-size:10px;line-height:14px;color:#aeb7bd}
    .gb-validation-targets{display:flex;flex-wrap:wrap;gap:5px}
    .gb-validation-targets span{border:1px solid #263138;background:#0d1012;border-radius:999px;padding:3px 6px;font-size:10px;line-height:13px;color:#aeb7bd;max-width:96px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gb-validation-review-actions{display:flex;gap:6px}
    .gb-validation-review-actions .gb-small-btn{width:auto;min-width:58px}
    .gb-validation-list{display:flex;flex-direction:column;gap:5px;padding:0 8px 8px}
    .gb-validation-row{display:grid;grid-template-columns:78px minmax(0,1fr);gap:8px;align-items:center;border:1px solid #20262a;background:#101213;border-radius:6px;padding:6px 7px}
    .gb-validation-row[data-has-action="true"]{grid-template-columns:70px minmax(0,1fr) 50px}
    .gb-validation-row .gb-small-btn{width:50px;height:24px;padding:0 6px}
    .gb-validation-row[data-level="error"]{border-color:#7f2d2d;background:#211313}
    .gb-validation-row[data-level="warning"]{border-color:#725a21;background:#1c1710}
    .gb-validation-row[data-level="ready"]{border-color:#2f6f44;background:#101a13}
    .gb-validation-row span{font-size:10px;line-height:14px;color:#8d979e;white-space:normal;overflow-wrap:anywhere}
    .gb-validation-row strong{font-size:10px;line-height:14px;color:#dfe6ea;white-space:normal;overflow-wrap:anywhere}
    .gb-template-list{display:flex;flex-direction:column;gap:7px;padding:8px}
    .gb-template-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;border:1px solid #20262a;background:#121516;border-radius:7px;padding:8px}
    .gb-template-info{min-width:0;display:flex;flex-direction:column;gap:2px}
    .gb-template-info strong{font-size:12px;line-height:16px;color:#eef2f3;white-space:normal;overflow-wrap:anywhere}
    .gb-template-info span{font-size:10px;line-height:14px;color:#8d979e;white-space:normal;overflow-wrap:anywhere}
    .gb-template-card .gb-small-btn{width:58px}
    .gb-systems-list{display:flex;flex-direction:column;gap:7px;padding:8px}
    .gb-system-card{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;align-items:start;border:1px solid #20262a;background:#121516;border-radius:7px;padding:8px}
    .gb-system-card[data-status="installed"]{border-color:#2f6f44;background:#101a13}
    .gb-system-card[data-status="needs-object"]{border-color:#725a21;background:#1c1710}
    .gb-system-info{min-width:0;display:flex;flex-direction:column;gap:2px}
    .gb-system-info strong{font-size:12px;line-height:16px;color:#eef2f3;white-space:normal;overflow-wrap:anywhere}
    .gb-system-info span{font-size:10px;line-height:14px;color:#8d979e;white-space:normal;overflow-wrap:anywhere}
    .gb-system-controls{display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap}
    .gb-system-badge{font-size:10px;line-height:14px;color:#aeb7bd;text-align:left;white-space:normal;overflow-wrap:anywhere;min-width:0;flex:1}
    .gb-system-controls .gb-small-btn{width:82px}
    .gb-project-status{padding:0 8px 7px;color:#8d979e;font-size:10px;line-height:14px;white-space:normal;overflow-wrap:anywhere}
    .gb-project-grid{padding-top:0}
    .gb-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:8px}
    .gb-preset{height:34px;border:1px solid #2a3237;background:#161a1c;color:#eef2f3;border-radius:6px;font-size:12px;cursor:pointer;text-align:left;padding:0 9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gb-preset:hover{border-color:#d9572b;background:#211a16}
    .gb-preset:disabled{opacity:.55;cursor:progress}
    .gb-component-btn{border-color:#354044}
    .gb-scene-list{display:flex;flex-direction:column;gap:6px;padding:8px;max-height:220px;overflow:auto}
    .gb-empty{font-size:12px;line-height:16px;color:#8d979e;padding:4px 2px}
    .gb-scene-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:center;border:1px solid #20262a;border-radius:7px;background:#121516;padding:5px}
    .gb-scene-row[data-selected="true"]{border-color:#d9572b;background:#1c1714}
    .gb-scene-main{min-width:0;border:0;background:transparent;color:#eef2f3;text-align:left;cursor:pointer;padding:2px 4px}
    .gb-scene-name{display:block;font-size:12px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gb-scene-meta{display:block;font-size:10px;line-height:14px;color:#8d979e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gb-scene-actions{display:flex;gap:4px}
    .gb-scene-actions button,.gb-small-btn{height:28px;border:1px solid #2a3237;background:#161a1c;color:#dfe6ea;border-radius:6px;font-size:11px;cursor:pointer;padding:0 7px}
    .gb-scene-actions button:hover,.gb-small-btn:hover{border-color:#d9572b;color:#fff}
    .gb-inspector{display:flex;flex-direction:column;gap:8px;padding:8px}
    .gb-inspector-summary{display:flex;flex-direction:column;gap:2px;border:1px solid #20262a;background:#121516;border-radius:7px;padding:8px}
    .gb-inspector-summary strong{font-size:12px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gb-inspector-summary span{font-size:10px;color:#8d979e;line-height:14px}
    .gb-object-health{display:flex;flex-direction:column;gap:7px;border:1px solid #20262a;background:#121516;border-radius:7px;padding:8px}
    .gb-object-health[data-status="ready"]{border-color:#2f6f44;background:#101a13}
    .gb-object-health[data-status="warn"]{border-color:#725a21;background:#1c1710}
    .gb-object-health-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .gb-object-health-head strong{font-size:12px;line-height:16px;color:#eef2f3;white-space:normal}
    .gb-object-health-head span{font-size:10px;line-height:14px;color:#8d979e;text-align:right;white-space:normal;overflow-wrap:anywhere}
    .gb-object-metrics{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px}
    .gb-object-metric{display:flex;flex-direction:column;gap:2px;border:1px solid #20262a;background:#0d0f10;border-radius:6px;padding:5px 6px;min-width:0}
    .gb-object-metric span{font-size:9px;line-height:12px;color:#7f8b92;white-space:nowrap}
    .gb-object-metric strong{font-size:11px;line-height:14px;color:#dfe6ea;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gb-component-chips{display:flex;flex-wrap:wrap;gap:5px}
    .gb-component-chips span{border:1px solid #263138;background:#0d1012;border-radius:999px;padding:3px 6px;font-size:10px;line-height:13px;color:#aeb7bd;max-width:96px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gb-health-detail{font-size:10px;line-height:14px;color:#8d979e;white-space:normal;overflow-wrap:anywhere}
    .gb-health-issues{display:flex;flex-direction:column;gap:4px}
    .gb-health-issues span{font-size:10px;line-height:14px;color:#f0c36d}
    .gb-field{display:flex;flex-direction:column;gap:4px;font-size:10px;line-height:12px;color:#8d979e}
    .gb-field input{min-width:0;height:28px;border:1px solid #2a3237;background:#0b0d0e;color:#eef2f3;border-radius:6px;padding:0 7px;font:inherit;font-size:12px}
    .gb-field input:focus{outline:1px solid #d9572b;border-color:#d9572b}
    .gb-transform-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
    .gb-transform-grid .gb-field:nth-child(4),.gb-transform-grid .gb-field:nth-child(5){grid-column:span 1}
    .gb-action-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
    .gb-action-row .gb-small-btn{width:100%;height:30px}
    .gb-component-editor{display:flex;flex-direction:column;gap:7px}
    .gb-component-card{border:1px solid #20262a;background:#121516;border-radius:7px;padding:7px;display:flex;flex-direction:column;gap:6px}
    .gb-component-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .gb-component-head strong{font-size:12px;color:#eef2f3;text-transform:capitalize;min-width:0;white-space:normal;overflow-wrap:anywhere}
    .gb-blueprint-tools{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;padding:8px;border-bottom:1px solid #20262a}
    .gb-blueprint-tools input{min-width:0;height:30px;border:1px solid #2a3237;background:#0b0d0e;color:#eef2f3;border-radius:6px;padding:0 8px;font-size:12px}
    .gb-blueprint-list{display:flex;flex-direction:column;gap:6px;padding:8px}
    .gb-blueprint-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:center;border:1px solid #20262a;border-radius:7px;background:#121516;padding:6px}
    .gb-blueprint-info{min-width:0;display:flex;flex-direction:column;gap:2px}
    .gb-blueprint-info strong{font-size:12px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gb-blueprint-info span{font-size:10px;line-height:14px;color:#8d979e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    @media (max-width:900px){#game-builder-panel{top:70px;left:8px;right:8px;bottom:auto;width:auto;max-height:58vh}#game-builder-panel[data-open="false"]{width:48px;right:auto}.gb-grid{grid-template-columns:1fr 1fr 1fr}}
  `;
  document.head.appendChild(style);

  const panel = document.createElement('aside');
  panel.id = 'game-builder-panel';
  panel.setAttribute('aria-label', 'Game Builder');

  const savedOpen = localStorage.getItem(STORAGE_KEY);
  const open = savedOpen ? savedOpen === 'true' : !isSmallScreen();
  panel.dataset.open = open ? 'true' : 'false';

  const head = document.createElement('div');
  head.className = 'gb-head';

  const toggle = document.createElement('button');
  toggle.className = 'gb-toggle';
  toggle.type = 'button';
  toggle.textContent = '+';
  toggle.setAttribute('aria-label', 'Toggle Game Builder');
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.addEventListener('click', () => {
    const nextOpen = panel.dataset.open !== 'true';
    setOpen(panel, toggle, nextOpen);
  });

  const title = document.createElement('div');
  title.className = 'gb-title';
  title.innerHTML = '<strong>Game Builder</strong><span>Presets and systems</span>';

  const stats = document.createElement('div');
  stats.id = 'gb-stats';

  head.append(toggle, title, stats);
  panel.appendChild(head);

  const body = document.createElement('div');
  body.className = 'gb-body';
  body.appendChild(createModeSection());
  body.appendChild(createPlacementSection());
  body.appendChild(createProjectSection());
  body.appendChild(createAssetPackSection());
  body.appendChild(createReadinessSection());
  body.appendChild(createPerformanceSection());
  body.appendChild(createValidationSection());
  body.appendChild(createTemplatesSection());
  body.appendChild(createGameSystemsSection());

  const appendBuilderToolSections = () => {
    const componentSection = document.createElement('section');
    componentSection.className = 'gb-section';
    const componentHeading = document.createElement('h3');
    componentHeading.textContent = 'Components';
    const componentGrid = document.createElement('div');
    componentGrid.className = 'gb-grid';
    COMPONENT_PRESETS.forEach((preset) => componentGrid.appendChild(createComponentButton(preset)));
    componentSection.append(componentHeading, componentGrid);
    body.appendChild(componentSection);

    const inspectorSection = document.createElement('section');
    inspectorSection.className = 'gb-section';
    const inspectorHeading = document.createElement('h3');
    inspectorHeading.textContent = 'Inspector';
    const inspector = document.createElement('div');
    inspector.id = 'gb-inspector';
    inspector.className = 'gb-inspector';
    inspectorSection.append(inspectorHeading, inspector);
    body.appendChild(inspectorSection);

    const blueprintSection = document.createElement('section');
    blueprintSection.className = 'gb-section';
    blueprintSection.id = 'gb-blueprints';
    const blueprintHeading = document.createElement('h3');
    blueprintHeading.textContent = 'Blueprints';
    const blueprintTools = document.createElement('div');
    blueprintTools.className = 'gb-blueprint-tools';
    const blueprintName = document.createElement('input');
    blueprintName.id = 'gb-blueprint-name';
    blueprintName.placeholder = 'Blueprint name';
    markEditOnly(blueprintName, 'save blueprints');
    const saveBlueprint = createSmallButton('Save', () => saveSelectedBlueprint(), { editOnly: true, action: 'save blueprints' });
    blueprintTools.append(blueprintName, saveBlueprint);
    const blueprintList = document.createElement('div');
    blueprintList.id = 'gb-blueprint-list';
    blueprintList.className = 'gb-blueprint-list';
    blueprintSection.append(blueprintHeading, blueprintTools, blueprintList);
    body.appendChild(blueprintSection);

    const sceneSection = document.createElement('section');
    sceneSection.className = 'gb-section';
    const sceneHeading = document.createElement('h3');
    sceneHeading.textContent = 'Scene';
    const sceneList = document.createElement('div');
    sceneList.id = 'gb-scene-list';
    sceneList.className = 'gb-scene-list';
    sceneSection.append(sceneHeading, sceneList);
    body.appendChild(sceneSection);
  };

  PRESET_GROUPS.forEach((group, index) => {
    const section = document.createElement('section');
    section.className = 'gb-section';
    const heading = document.createElement('h3');
    heading.textContent = group.label;
    const grid = document.createElement('div');
    grid.className = 'gb-grid';
    group.presets.forEach((preset) => grid.appendChild(createButton(preset)));
    section.append(heading, grid);
    body.appendChild(section);
    if (index === 0) appendBuilderToolSections();
  });

  panel.appendChild(body);
  document.body.appendChild(panel);

  repositionLegacyButtons(open);
  startPerformanceProbe();
  window._applyGameBuilderValidationFix = applyValidationFix;
  window._previewGameBuilderValidationFix = openValidationFixPreview;
  window._applyPendingGameBuilderValidationFix = applyPendingValidationFix;
  window._undoLastGameBuilderValidationFix = undoValidationFix;
  window._setGameBuilderGraphicsQuality = setBuilderGraphicsQuality;
  window._applyGameBuilderTemplate = (id) => applyGenreTemplate(GENRE_TEMPLATES.find((template) => template.id === id));
  window._refreshGameBuilder = () => {
    resetValidationUiState();
    updateBuilderUi();
  };
  window._refreshGameBuilderMode = () => {
    resetValidationUiState();
    updateModeControls();
    updateStats();
    updateProjectStatus();
    renderAssetPackStatus();
    renderReadinessStatus();
    renderPerformanceStatus();
    renderValidationStatus();
    renderGameSystems();
    renderInspector({ force: true });
    renderBlueprintList();
    renderSceneList();
    updateEditorControlState();
  };
  window._refreshGameBuilderPlacement = () => {
    lastPlacementSignature = '';
    lastValidationSignature = '';
    renderPlacementStatus();
    renderReadinessStatus();
    renderPerformanceStatus();
    renderValidationStatus();
    renderGameSystems();
    renderInspector({ force: true });
    renderSceneList();
  };
  window.addEventListener('crate:asset-placement', window._refreshGameBuilderPlacement);
  updateBuilderUi();
  refreshAssetManifest();
  setInterval(updateBuilderUi, 1200);
  window.addEventListener('resize', () => repositionLegacyButtons(panel.dataset.open === 'true'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
