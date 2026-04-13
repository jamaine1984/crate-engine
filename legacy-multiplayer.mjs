let context = {
  getScene: () => null,
  getCamera: () => null,
  getTHREE: () => null,
  getGltfLoader: () => null,
  getAnimationMixers: () => [],
  showToast: () => {},
  getCharacterController: () => null,
  parseAndExecute: () => {},
  getHudUpdate: () => null,
};

let legacyMultiplayerClient = null;

export function setLegacyMultiplayerContext(nextContext = {}) {
  context = { ...context, ...nextContext };
}

function getShowToast() {
  return typeof context.showToast === 'function' ? context.showToast : () => {};
}

class MultiplayerClient {
  constructor() {
    this.ws = null;
    this.playerId = null;
    this.room = null;
    this.peers = new Map();
    this.connected = false;
    this._sendInterval = null;
  }

  connect(server, room, name) {
    if (this.ws) this.disconnect();
    server = server || localStorage.getItem('mp_server') || 'wss://crate-engine-mp.fly.dev';
    room = room || 'default';
    name = name || localStorage.getItem('mp_name') || 'Player_' + Math.floor(Math.random() * 9999);

    try {
      this.ws = new WebSocket(server);
    } catch (err) {
      getShowToast()('❌ Failed to connect: ' + err.message);
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.ws.send(JSON.stringify({
        type: 'join',
        room,
        name,
        character: context.getCharacterController?.()?.characterType || 'knight',
      }));
      getShowToast()('🌐 Connecting to ' + room + '...');

      this._sendInterval = setInterval(() => {
        const characterController = context.getCharacterController?.();
        if (!characterController || !this.connected || !this.ws) return;
        const pos = characterController.position;
        this.ws.send(JSON.stringify({
          type: 'move',
          position: {
            x: +pos.x.toFixed(2),
            y: +pos.y.toFixed(2),
            z: +pos.z.toFixed(2),
          },
          rotation: +(characterController.model?.rotation.y || 0).toFixed(3),
          animation: characterController.stateMachine?.state || 'idle',
        }));
      }, 66);
    };

    this.ws.onmessage = (event) => {
      try {
        this._handleMessage(JSON.parse(event.data));
      } catch {}
    };

    this.ws.onclose = () => {
      this.connected = false;
      if (this._sendInterval) clearInterval(this._sendInterval);
      this._sendInterval = null;
      this._removePeers();
      getShowToast()('🌐 Disconnected from multiplayer');
    };

    this.ws.onerror = () => {
      getShowToast()('❌ Multiplayer connection error');
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this._sendInterval) {
      clearInterval(this._sendInterval);
      this._sendInterval = null;
    }
    this.connected = false;
    this._removePeers();
  }

  chat(message) {
    if (this.ws && this.connected) {
      this.ws.send(JSON.stringify({ type: 'chat', message }));
    }
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'joined':
        this.playerId = msg.playerId;
        this.room = msg.room;
        getShowToast()('🌐 Joined room: ' + (msg.roomName || msg.room) + ' (Player #' + msg.playerId + ')');
        if (msg.players) msg.players.forEach((player) => this._spawnPeer(player));
        break;
      case 'player_joined':
        this._spawnPeer(msg.player);
        getShowToast()('👤 ' + msg.player.name + ' joined');
        break;
      case 'player_left':
        this._removePeer(msg.id);
        getShowToast()('👤 ' + (msg.name || 'Player') + ' left');
        break;
      case 'player_moved':
        this._updatePeer(msg.id, msg.position, msg.rotation, msg.animation);
        break;
      case 'chat':
        this._showChat(msg.name, msg.message);
        break;
      case 'scene_command':
        context.parseAndExecute?.(msg.command);
        break;
      case 'pong': {
        const ping = Date.now() - (msg.time || 0);
        context.getHudUpdate?.()?.interact?.('Ping: ' + ping + 'ms');
        break;
      }
    }
  }

  _spawnPeer(data) {
    if (!data || this.peers.has(data.id)) return;
    const scene = context.getScene?.();
    const THREE = context.getTHREE?.();
    const gltfLoader = context.getGltfLoader?.();
    if (!scene || !THREE || !gltfLoader) return;

    const charType = data.character || 'knight';
    const url = '/models/character_' + charType + '.glb';
    gltfLoader.load(url, (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      model.scale.setScalar(1.8 / Math.max(size.y, 0.01));
      model.position.set(data.position?.x || 0, data.position?.y || 0, data.position?.z || 0);
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      const nameTag = document.createElement('div');
      nameTag.style.cssText = 'position:fixed;color:' + (data.color || '#fff') + ';font-size:11px;font-family:system-ui;pointer-events:none;z-index:9990;text-shadow:0 1px 3px rgba(0,0,0,0.8);font-weight:600;';
      nameTag.textContent = data.name || 'Player';
      document.body.appendChild(nameTag);

      let mixer = null;
      const clips = {};
      if (gltf.animations?.length) {
        mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach((clip) => {
          clips[clip.name.replace('HumanArmature|', '').toLowerCase()] = mixer.clipAction(clip);
        });
        clips.idle?.play();
        context.getAnimationMixers?.().push(mixer);
      }

      scene.add(model);
      this.peers.set(data.id, {
        model,
        nameTag,
        mixer,
        name: data.name,
        targetPos: new THREE.Vector3(
          data.position?.x || 0,
          data.position?.y || 0,
          data.position?.z || 0,
        ),
        targetRot: data.rotation || 0,
        currentAnim: 'idle',
        clips,
      });
    }, undefined, () => {
      const geo = new THREE.BoxGeometry(0.5, 1.8, 0.5);
      const mat = new THREE.MeshStandardMaterial({ color: data.color || '#ff6b35' });
      const model = new THREE.Mesh(geo, mat);
      model.position.set(data.position?.x || 0, 0.9, data.position?.z || 0);
      scene.add(model);
      this.peers.set(data.id, {
        model,
        targetPos: new THREE.Vector3(data.position?.x || 0, 0.9, data.position?.z || 0),
        targetRot: data.rotation || 0,
      });
    });
  }

  _updatePeer(id, position, rotation, animation) {
    const peer = this.peers.get(id);
    if (!peer || !position) return;
    peer.targetPos?.set(position.x || 0, position.y || 0, position.z || 0);
    peer.targetRot = rotation || 0;

    if (!animation || !peer.mixer || !peer.clips || peer.currentAnim === animation) return;
    const nextAction = peer.clips[animation] || peer.clips.idle;
    const currentAction = peer.clips[peer.currentAnim];
    if (currentAction && currentAction !== nextAction) currentAction.fadeOut(0.15);
    if (nextAction) {
      nextAction.reset().fadeIn(0.15).play();
      peer.currentAnim = animation;
    }
  }

  _removePeer(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    context.getScene?.()?.remove(peer.model);
    peer.nameTag?.remove();
    this.peers.delete(id);
  }

  _removePeers() {
    for (const [id] of this.peers) this._removePeer(id);
  }

  _showChat(name, message) {
    let chatEl = document.getElementById('mp-chat-log');
    if (!chatEl) {
      chatEl = document.createElement('div');
      chatEl.id = 'mp-chat-log';
      chatEl.style.cssText = 'position:fixed;bottom:60px;left:20px;max-width:350px;max-height:200px;overflow-y:auto;z-index:9999;pointer-events:none;font-family:system-ui;';
      document.body.appendChild(chatEl);
    }
    const line = document.createElement('div');
    line.style.cssText = 'color:rgba(255,255,255,0.8);font-size:12px;padding:2px 8px;background:rgba(0,0,0,0.5);border-radius:4px;margin-bottom:2px;animation:hud-fade-out 1s ease-in 10s forwards;';
    line.innerHTML = '<span style="color:#f59e0b;font-weight:600;">' + name + ':</span> ' + message;
    chatEl.appendChild(line);
    chatEl.scrollTop = chatEl.scrollHeight;
    while (chatEl.children.length > 20) chatEl.removeChild(chatEl.firstChild);
  }

  update() {
    const camera = context.getCamera?.();
    if (!camera) return;
    for (const [, peer] of this.peers) {
      if (!peer.model) continue;
      peer.model.position.lerp(peer.targetPos, 0.15);
      const diff = peer.targetRot - peer.model.rotation.y;
      peer.model.rotation.y += diff * 0.15;

      if (!peer.nameTag) continue;
      const worldPos = peer.model.position.clone();
      worldPos.y += 2.2;
      worldPos.project(camera);
      if (worldPos.z < 1) {
        peer.nameTag.style.left = ((worldPos.x * 0.5 + 0.5) * window.innerWidth) + 'px';
        peer.nameTag.style.top = ((-worldPos.y * 0.5 + 0.5) * window.innerHeight) + 'px';
        peer.nameTag.style.display = 'block';
      } else {
        peer.nameTag.style.display = 'none';
      }
    }
  }
}

export function getLegacyMultiplayerClient() {
  if (!legacyMultiplayerClient) legacyMultiplayerClient = new MultiplayerClient();
  return legacyMultiplayerClient;
}

export function showMultiplayerLobby() {
  const existing = document.getElementById('mp-lobby-modal');
  if (existing) {
    existing.remove();
    return;
  }

  const modal = document.createElement('div');
  modal.id = 'mp-lobby-modal';
  Object.assign(modal.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%,-50%)',
    zIndex: '500',
    background: '#0d0d0d',
    border: '1px solid #333',
    borderRadius: '16px',
    padding: '28px',
    width: '500px',
    maxHeight: '80vh',
    overflowY: 'auto',
    color: '#eee',
    fontFamily: "'Inter',system-ui,sans-serif",
    boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
  });

  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2 style="margin:0;font-size:1.2rem">🌐 Multiplayer</h2>
      <button onclick="this.closest('#mp-lobby-modal').remove()" style="background:none;border:none;color:#666;font-size:1.5rem;cursor:pointer">✕</button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <input id="mp-name" value="${localStorage.getItem('mp_name') || 'Player'}" placeholder="Your name" style="flex:1;padding:10px;background:#111;border:1px solid #333;border-radius:8px;color:#fff;font-size:0.85rem">
      <input id="mp-server" value="${localStorage.getItem('mp_server') || 'wss://crate-engine-mp.fly.dev'}" placeholder="Server URL" style="flex:2;padding:10px;background:#111;border:1px solid #333;border-radius:8px;color:#fff;font-size:0.85rem">
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <button id="mp-quick-join" style="flex:1;padding:12px;background:linear-gradient(135deg,#ff6b35,#f7c948);border:none;border-radius:10px;color:#fff;font-weight:700;cursor:pointer;font-size:0.9rem">⚡ Quick Match</button>
      <button id="mp-create" style="flex:1;padding:12px;background:#1a1a2e;border:1px solid #333;border-radius:10px;color:#aaa;cursor:pointer;font-size:0.9rem">🏗️ Create Room</button>
      <button id="mp-refresh" style="padding:12px 16px;background:#111;border:1px solid #333;border-radius:10px;color:#aaa;cursor:pointer;font-size:0.9rem">🔄</button>
    </div>
    <div id="mp-rooms" style="min-height:100px">
      <div style="text-align:center;color:#555;padding:20px">Click 🔄 to load rooms or ⚡ Quick Match to jump in</div>
    </div>
    <div id="mp-status" style="margin-top:12px;font-size:0.78rem;color:#666"></div>
    <div style="margin-top:16px;padding-top:12px;border-top:1px solid #1a1a1a">
      <p style="font-size:0.72rem;color:#555">
        <strong>Self-host:</strong> Run <code style="background:#1a1a2e;padding:2px 6px;border-radius:4px;color:#f7c948">node server/multiplayer.mjs</code> or deploy to Railway/Render/Fly.io<br>
        <strong>Commands:</strong> <code style="background:#1a1a2e;padding:2px 6px;border-radius:4px;color:#f7c948">multiplayer</code> / <code style="background:#1a1a2e;padding:2px 6px;border-radius:4px;color:#f7c948">join [room]</code> / <code style="background:#1a1a2e;padding:2px 6px;border-radius:4px;color:#f7c948">chat [message]</code>
      </p>
    </div>
  `;
  document.body.appendChild(modal);

  const statusEl = document.getElementById('mp-status');

  document.getElementById('mp-quick-join').onclick = async () => {
    const server = document.getElementById('mp-server').value;
    const name = document.getElementById('mp-name').value;
    localStorage.setItem('mp_server', server);
    localStorage.setItem('mp_name', name);
    statusEl.innerHTML = '<span style="color:#f7c948">Matchmaking...</span>';
    try {
      const httpUrl = server.replace('ws://', 'http://').replace('wss://', 'https://');
      const resp = await fetch(httpUrl.replace(/:\d+.*/, ':' + new URL(server.replace('ws', 'http')).port) + '/matchmake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene: null }),
      });
      const data = await resp.json();
      if (data.room) {
        statusEl.innerHTML = '<span style="color:#4ade80">Joining ' + data.room + '...</span>';
        window._mp?.connect(server, data.room, name);
        setTimeout(() => modal.remove(), 1000);
      }
    } catch {
      statusEl.innerHTML = '<span style="color:#f87171">Could not reach server. Is it running?</span>';
    }
  };

  document.getElementById('mp-create').onclick = () => {
    const server = document.getElementById('mp-server').value;
    const name = document.getElementById('mp-name').value;
    const roomId = 'room_' + Date.now().toString(36);
    localStorage.setItem('mp_server', server);
    localStorage.setItem('mp_name', name);
    window._mp?.connect(server, roomId, name);
    statusEl.innerHTML = '<span style="color:#4ade80">Created room: ' + roomId + '</span>';
    setTimeout(() => modal.remove(), 1500);
  };

  document.getElementById('mp-refresh').onclick = async () => {
    const server = document.getElementById('mp-server').value;
    const roomsEl = document.getElementById('mp-rooms');
    roomsEl.innerHTML = '<div style="text-align:center;color:#f7c948;padding:10px">Loading...</div>';
    try {
      const httpUrl = server.replace('ws://', 'http://').replace('wss://', 'https://');
      const port = new URL(server.replace('ws', 'http')).port || '8860';
      const resp = await fetch(httpUrl.split(':' + port)[0] + ':' + port + '/lobby');
      const data = await resp.json();
      if (!data.rooms.length) {
        roomsEl.innerHTML = '<div style="text-align:center;color:#555;padding:20px">No rooms yet — create one!</div>';
      } else {
        roomsEl.innerHTML = data.rooms.map((room) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:#111;border:1px solid #1a1a1a;border-radius:8px;margin-bottom:6px">
            <div>
              <strong style="color:#fff">${room.name}</strong>
              <span style="color:#666;font-size:0.75rem;margin-left:8px">${room.scene || 'custom'}</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <span style="color:#888;font-size:0.8rem">${room.players}/${room.maxPlayers}</span>
              <button onclick="window._mp&&window._mp.connect('${server}','${room.id}',document.getElementById('mp-name').value);this.closest('#mp-lobby-modal').remove()" style="padding:6px 14px;background:#ff6b35;border:none;border-radius:6px;color:#fff;font-size:0.78rem;cursor:pointer;font-weight:600">Join</button>
            </div>
          </div>
        `).join('');
      }
    } catch {
      roomsEl.innerHTML = '<div style="text-align:center;color:#f87171;padding:20px">Could not reach server</div>';
    }
  };
}
