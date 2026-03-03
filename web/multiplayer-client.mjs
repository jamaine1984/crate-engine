// ═══════════════════════════════════════════════════════════════
// CRATE ENGINE — MULTIPLAYER CLIENT v1
// WebSocket client for real-time co-op
// ═══════════════════════════════════════════════════════════════

import * as THREE from 'three';

let _ws = null;
let _playerId = null;
let _roomId = null;
let _connected = false;
let _players = new Map(); // id → { mesh, name, nameTag, animation }
let _scene = null;
let _onCommand = null;
let _onChat = null;

const AVATAR_COLORS = {};

export function init(scene, onCommand, onChat) {
  _scene = scene;
  _onCommand = onCommand;
  _onChat = onChat;
}

export function connect(serverUrl, roomId = 'default', playerName = 'Player') {
  if (_ws) disconnect();
  
  _roomId = roomId;
  _ws = new WebSocket(serverUrl);
  
  _ws.onopen = () => {
    _connected = true;
    _ws.send(JSON.stringify({ type: 'join', room: roomId, name: playerName }));
    console.log(`[MP] Connected to ${serverUrl}, joining room: ${roomId}`);
    _showNotification(`Connected to multiplayer room: ${roomId}`);
  };
  
  _ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    
    switch (msg.type) {
      case 'joined':
        _playerId = msg.playerId;
        // Spawn existing players
        msg.players.forEach(p => _spawnPlayer(p));
        console.log(`[MP] Joined as Player ${_playerId}, ${msg.players.length} others in room`);
        break;
        
      case 'player_joined':
        _spawnPlayer(msg.player);
        _showNotification(`${msg.player.name} joined the game!`);
        break;
        
      case 'player_left':
        _removePlayer(msg.id);
        _showNotification(`${msg.name} left the game`);
        break;
        
      case 'player_moved':
        _updatePlayer(msg.id, msg.position, msg.rotation, msg.animation);
        break;
        
      case 'scene_command':
        if (_onCommand) _onCommand(msg.command, msg.playerName);
        break;
        
      case 'chat':
        if (_onChat) _onChat(msg.name, msg.message);
        _showChat(msg.name, msg.message);
        break;
        
      case 'player_attack':
        _showAttack(msg.id, msg.attackType);
        break;
        
      case 'pong':
        const ping = Date.now() - msg.time;
        console.log(`[MP] Ping: ${ping}ms`);
        break;
    }
  };
  
  _ws.onclose = () => {
    _connected = false;
    _showNotification('Disconnected from multiplayer');
    // Auto-reconnect
    setTimeout(() => { if (!_connected) connect(serverUrl, roomId, playerName); }, 3000);
  };
  
  _ws.onerror = (err) => { console.error('[MP] Error:', err); };
}

export function disconnect() {
  if (_ws) { _ws.close(); _ws = null; }
  _connected = false;
  // Remove all remote players
  for (const [id, p] of _players) {
    if (p.mesh) _scene.remove(p.mesh);
    if (p.nameTag) _scene.remove(p.nameTag);
  }
  _players.clear();
}

export function sendMove(position, rotation, animation) {
  if (!_connected) return;
  _ws.send(JSON.stringify({ type: 'move', position, rotation, animation }));
}

export function sendCommand(command) {
  if (!_connected) return;
  _ws.send(JSON.stringify({ type: 'command', command }));
}

export function sendChat(message) {
  if (!_connected) return;
  _ws.send(JSON.stringify({ type: 'chat', message }));
}

export function sendAttack(attackType) {
  if (!_connected) return;
  _ws.send(JSON.stringify({ type: 'attack', attackType }));
}

export function isConnected() { return _connected; }
export function getPlayerId() { return _playerId; }
export function getPlayerCount() { return _players.size + (_connected ? 1 : 0); }

// === INTERNAL ===

function _spawnPlayer(data) {
  if (_players.has(data.id)) return;
  
  // Simple capsule avatar for remote players
  const color = new THREE.Color(data.color || '#ff6b35');
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.3, 1.0, 8, 16),
    new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.7 })
  );
  body.position.set(data.position?.x || 0, 0.8, data.position?.z || 0);
  body.castShadow = true;
  
  // Name tag
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.roundRect(0, 0, 256, 64, 12);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(data.name || `Player ${data.id}`, 128, 40);
  
  const texture = new THREE.CanvasTexture(canvas);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  tag.scale.set(2, 0.5, 1);
  tag.position.set(data.position?.x || 0, 2.2, data.position?.z || 0);
  
  _scene.add(body);
  _scene.add(tag);
  _players.set(data.id, { mesh: body, nameTag: tag, name: data.name, targetPos: { ...data.position } });
}

function _removePlayer(id) {
  const p = _players.get(id);
  if (p) {
    if (p.mesh) _scene.remove(p.mesh);
    if (p.nameTag) _scene.remove(p.nameTag);
    _players.delete(id);
  }
}

function _updatePlayer(id, position, rotation, animation) {
  const p = _players.get(id);
  if (!p) return;
  p.targetPos = position;
  p.targetRot = rotation;
}

// Smooth interpolation — call in animation loop
export function updatePlayers(dt) {
  for (const [id, p] of _players) {
    if (!p.mesh || !p.targetPos) continue;
    // Lerp position
    p.mesh.position.x += (p.targetPos.x - p.mesh.position.x) * 8 * dt;
    p.mesh.position.z += (p.targetPos.z - p.mesh.position.z) * 8 * dt;
    p.mesh.position.y = 0.8 + (p.targetPos.y || 0);
    // Lerp rotation
    if (p.targetRot !== undefined) {
      p.mesh.rotation.y += (p.targetRot - p.mesh.rotation.y) * 8 * dt;
    }
    // Name tag follows
    if (p.nameTag) {
      p.nameTag.position.set(p.mesh.position.x, p.mesh.position.y + 1.4, p.mesh.position.z);
    }
  }
}

function _showAttack(id, attackType) {
  const p = _players.get(id);
  if (!p || !p.mesh) return;
  // Flash red
  const origColor = p.mesh.material.color.clone();
  p.mesh.material.color.set(0xff0000);
  setTimeout(() => { p.mesh.material.color.copy(origColor); }, 200);
}

function _showNotification(text) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);border:1px solid #7c5cff;border-radius:8px;padding:8px 20px;color:#fff;font-size:13px;z-index:10000;font-family:monospace;transition:opacity 0.5s;';
  el.textContent = '🎮 ' + text;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; }, 2000);
  setTimeout(() => { el.remove(); }, 2500);
}

function _showChat(name, message) {
  let chatBox = document.getElementById('mp-chat');
  if (!chatBox) {
    chatBox = document.createElement('div');
    chatBox.id = 'mp-chat';
    chatBox.style.cssText = 'position:fixed;bottom:80px;left:10px;width:300px;max-height:200px;overflow-y:auto;background:rgba(0,0,0,0.7);border:1px solid #333;border-radius:8px;padding:8px;font-family:monospace;font-size:12px;z-index:9999;';
    document.body.appendChild(chatBox);
  }
  const line = document.createElement('div');
  line.style.cssText = 'margin-bottom:4px;';
  line.innerHTML = `<span style="color:#7c5cff;font-weight:bold;">${name}:</span> <span style="color:#ddd;">${message}</span>`;
  chatBox.appendChild(line);
  chatBox.scrollTop = chatBox.scrollHeight;
  // Fade old messages
  while (chatBox.children.length > 20) chatBox.removeChild(chatBox.firstChild);
}
