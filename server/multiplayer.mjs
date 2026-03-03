// ═══════════════════════════════════════════════════════════════
// CRATE ENGINE — MULTIPLAYER SERVER v2
// WebSocket: rooms, matchmaking, lobby, chat, scene sync
// Deploy: Railway / Render / Fly.io / any Node host
// ═══════════════════════════════════════════════════════════════

import { WebSocketServer } from 'ws';
import http from 'http';

const PORT = process.env.PORT || 8860;

// HTTP server for health checks + lobby API
const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', rooms: rooms.size, players: totalPlayers() }));
    return;
  }
  
  if (req.url === '/lobby') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const lobby = [];
    for (const [id, room] of rooms) {
      lobby.push({
        id,
        name: room.name || id,
        players: room.players.size,
        maxPlayers: room.maxPlayers,
        scene: room.sceneName || 'custom',
        host: room.hostName || 'Unknown',
        isPublic: room.isPublic !== false,
        createdAt: room.createdAt,
      });
    }
    res.end(JSON.stringify({ rooms: lobby.filter(r => r.isPublic) }));
    return;
  }
  
  if (req.url === '/matchmake' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { scene, maxPlayers } = JSON.parse(body || '{}');
        // Find a room with space, matching scene preference
        let bestRoom = null;
        for (const [id, room] of rooms) {
          if (room.isPublic && room.players.size < (room.maxPlayers || 8)) {
            if (!scene || room.sceneName === scene || !room.sceneName) {
              bestRoom = id;
              break;
            }
          }
        }
        if (!bestRoom) {
          // Create new room
          bestRoom = 'match_' + Date.now().toString(36);
          rooms.set(bestRoom, {
            players: new Map(),
            scene: null,
            sceneName: scene || null,
            name: scene ? `${scene} Match` : `Open Match`,
            maxPlayers: maxPlayers || 8,
            isPublic: true,
            hostName: null,
            createdAt: Date.now(),
          });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ room: bestRoom, players: rooms.get(bestRoom).players.size }));
      } catch(e) {
        res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  
  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocketServer({ server: httpServer });

const rooms = new Map();
let nextPlayerId = 1;

function totalPlayers() {
  let n = 0;
  for (const [, room] of rooms) n += room.players.size;
  return n;
}

console.log(`⚡ Crate Engine Multiplayer Server v2 starting on port ${PORT}`);

wss.on('connection', (ws, req) => {
  const playerId = nextPlayerId++;
  let currentRoom = null;
  let playerData = { id: playerId, name: `Player_${playerId}`, position: {x:0,y:0,z:0}, rotation: 0, animation: 'idle', color: randomColor(), character: 'knight' };
  
  console.log(`[+] Player ${playerId} connected from ${req.socket.remoteAddress}`);
  
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      
      switch (msg.type) {
        case 'join': {
          const roomId = msg.room || 'default';
          if (msg.name) playerData.name = msg.name.slice(0, 20);
          if (msg.character) playerData.character = msg.character;
          
          if (!rooms.has(roomId)) {
            rooms.set(roomId, {
              players: new Map(),
              scene: null,
              sceneName: msg.scene || null,
              name: msg.roomName || roomId,
              maxPlayers: msg.maxPlayers || 8,
              isPublic: msg.isPublic !== false,
              hostName: playerData.name,
              createdAt: Date.now(),
            });
          }
          const room = rooms.get(roomId);
          
          if (room.players.size >= (room.maxPlayers || 8)) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
            return;
          }
          
          room.players.set(playerId, { ws, ...playerData });
          currentRoom = roomId;
          if (!room.hostName) room.hostName = playerData.name;
          
          ws.send(JSON.stringify({
            type: 'joined',
            playerId,
            room: roomId,
            roomName: room.name,
            players: [...room.players.entries()].filter(([id]) => id !== playerId).map(([id, p]) => ({
              id, name: p.name, position: p.position, rotation: p.rotation, animation: p.animation, color: p.color, character: p.character
            })),
            scene: room.scene,
            isHost: room.players.size === 1,
          }));
          
          broadcast(room, playerId, { type: 'player_joined', player: { ...playerData } });
          console.log(`[Room:${roomId}] ${playerData.name} joined (${room.players.size}/${room.maxPlayers || 8})`);
          break;
        }
        
        case 'create_room': {
          const roomId = msg.roomId || 'room_' + Date.now().toString(36);
          rooms.set(roomId, {
            players: new Map(),
            scene: null,
            sceneName: msg.scene || null,
            name: msg.name || `${playerData.name}'s Room`,
            maxPlayers: Math.min(msg.maxPlayers || 8, 16),
            isPublic: msg.isPublic !== false,
            password: msg.password || null,
            hostName: playerData.name,
            createdAt: Date.now(),
          });
          ws.send(JSON.stringify({ type: 'room_created', roomId, name: rooms.get(roomId).name }));
          console.log(`[+] Room created: ${roomId} by ${playerData.name}`);
          break;
        }
        
        case 'list_rooms': {
          const lobby = [];
          for (const [id, room] of rooms) {
            if (room.isPublic) {
              lobby.push({ id, name: room.name, players: room.players.size, maxPlayers: room.maxPlayers, scene: room.sceneName, host: room.hostName });
            }
          }
          ws.send(JSON.stringify({ type: 'room_list', rooms: lobby }));
          break;
        }
        
        case 'move': {
          playerData.position = msg.position;
          playerData.rotation = msg.rotation;
          playerData.animation = msg.animation || 'idle';
          if (currentRoom) {
            const room = rooms.get(currentRoom);
            if (room) {
              const p = room.players.get(playerId);
              if (p) Object.assign(p, playerData);
              broadcast(room, playerId, {
                type: 'player_moved', id: playerId,
                position: msg.position, rotation: msg.rotation, animation: msg.animation,
              });
            }
          }
          break;
        }
        
        case 'command': {
          if (currentRoom) {
            const room = rooms.get(currentRoom);
            if (room) broadcast(room, playerId, { type: 'scene_command', playerId, playerName: playerData.name, command: msg.command });
          }
          break;
        }
        
        case 'chat': {
          if (currentRoom) {
            const room = rooms.get(currentRoom);
            if (room) broadcast(room, null, { type: 'chat', playerId, name: playerData.name, message: (msg.message || '').slice(0, 500) });
          }
          break;
        }
        
        case 'attack': {
          if (currentRoom) {
            const room = rooms.get(currentRoom);
            if (room) broadcast(room, playerId, { type: 'player_attack', id: playerId, attackType: msg.attackType || 'light', position: playerData.position, rotation: playerData.rotation });
          }
          break;
        }
        
        case 'sync_scene': {
          if (currentRoom) {
            const room = rooms.get(currentRoom);
            if (room) { room.scene = msg.scene; room.sceneName = msg.sceneName; broadcast(room, playerId, { type: 'scene_sync', scene: msg.scene }); }
          }
          break;
        }
        
        case 'emote': {
          if (currentRoom) {
            const room = rooms.get(currentRoom);
            if (room) broadcast(room, null, { type: 'emote', playerId, name: playerData.name, emote: msg.emote });
          }
          break;
        }
        
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', time: msg.time || Date.now() }));
          break;
      }
    } catch (e) {
      console.error(`[Player ${playerId}]`, e.message);
    }
  });
  
  ws.on('close', () => {
    console.log(`[-] Player ${playerId} disconnected`);
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.players.delete(playerId);
        broadcast(room, null, { type: 'player_left', id: playerId, name: playerData.name });
        if (room.players.size === 0) rooms.delete(currentRoom);
      }
    }
  });
  
  ws.on('error', () => {});
});

function broadcast(room, excludeId, msg) {
  const data = JSON.stringify(msg);
  for (const [id, player] of room.players) {
    if (id !== excludeId && player.ws && player.ws.readyState === 1) {
      try { player.ws.send(data); } catch {}
    }
  }
}

function randomColor() {
  const colors = ['#ff3333','#33ff33','#3333ff','#ffff33','#ff33ff','#33ffff','#ff6b35','#8b5cf6','#f59e0b','#10b981','#ec4899','#06b6d4'];
  return colors[Math.floor(Math.random() * colors.length)];
}

setInterval(() => {
  for (const [roomId, room] of rooms) {
    for (const [id, player] of room.players) {
      if (!player.ws || player.ws.readyState !== 1) {
        room.players.delete(id);
        broadcast(room, null, { type: 'player_left', id, name: player.name });
      }
    }
    if (room.players.size === 0) rooms.delete(roomId);
  }
}, 10000);

httpServer.listen(PORT, () => {
  console.log(`⚡ Crate Engine Multiplayer v2 live on :${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Lobby:  http://localhost:${PORT}/lobby`);
  console.log(`   Match:  POST http://localhost:${PORT}/matchmake`);
});
