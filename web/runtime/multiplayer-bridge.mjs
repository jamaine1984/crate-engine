// ============================================================================
// CRATE ENGINE 2.0 — MULTIPLAYER BRIDGE
// Connects the multiplayer WebSocket client to the command bus.
// Handles player sync, chat, and command broadcasting.
// ============================================================================

import { commandBus } from './command-bus.mjs';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {WebSocket|null} */
let _ws = null;

/** @type {string|null} */
let _currentRoom = null;

/** @type {string|null} */
let _username = null;

/** @type {Map<string, {position: number[], rotation: number[]}>} */
const _remotePlayers = new Map();

/** @type {Set<Function>} */
const _eventListeners = new Set();

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/**
 * Connect to a multiplayer server.
 * @param {string} serverUrl - WebSocket URL (e.g. "wss://mp.crateengine.com")
 * @param {string} username - Player display name
 * @returns {Promise<boolean>} true if connected
 */
export function connect(serverUrl, username) {
  return new Promise((resolve) => {
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      console.warn('[Multiplayer] Already connected');
      resolve(true);
      return;
    }

    _username = username;

    try {
      _ws = new WebSocket(serverUrl);
    } catch (err) {
      console.error('[Multiplayer] Connection failed:', err.message);
      resolve(false);
      return;
    }

    _ws.onopen = () => {
      console.log('[Multiplayer] Connected to', serverUrl);
      resolve(true);
    };

    _ws.onerror = (err) => {
      console.error('[Multiplayer] WebSocket error:', err);
      resolve(false);
    };

    _ws.onclose = () => {
      console.log('[Multiplayer] Disconnected');
      _currentRoom = null;
      _remotePlayers.clear();
      _emit('disconnected', {});
    };

    _ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        _handleServerMessage(msg);
      } catch (err) {
        console.error('[Multiplayer] Invalid message:', err);
      }
    };
  });
}

/**
 * Disconnect from the multiplayer server.
 */
export function disconnect() {
  if (_ws) {
    _ws.close();
    _ws = null;
  }
  _currentRoom = null;
  _username = null;
  _remotePlayers.clear();
}

/**
 * Check if connected to a multiplayer server.
 * @returns {boolean}
 */
export function isConnected() {
  return _ws !== null && _ws.readyState === WebSocket.OPEN;
}

// ---------------------------------------------------------------------------
// Room management
// ---------------------------------------------------------------------------

/**
 * Join a room on the connected server.
 * @param {string} room - Room name
 */
export function joinRoom(room) {
  if (!isConnected()) {
    console.warn('[Multiplayer] Not connected');
    return;
  }
  _send({ type: 'join', room, username: _username });
}

/**
 * Leave the current room.
 */
export function leaveRoom() {
  if (!isConnected()) return;
  _send({ type: 'leave' });
  _currentRoom = null;
  _remotePlayers.clear();
}

/**
 * Send a chat message to the current room.
 * @param {string} message
 */
export function sendChat(message) {
  if (!isConnected() || !_currentRoom) return;
  _send({ type: 'chat', message });
}

/**
 * Send position/rotation sync to other players.
 * @param {number[]} position - [x, y, z]
 * @param {number[]} rotation - [pitch, yaw, roll]
 */
export function sendSync(position, rotation) {
  if (!isConnected() || !_currentRoom) return;
  _send({ type: 'sync', position, rotation });
}

/**
 * Broadcast an engine command to other players in the room.
 * @param {string} commandType
 * @param {Object} payload
 */
export function broadcastCommand(commandType, payload) {
  if (!isConnected() || !_currentRoom) return;
  _send({ type: 'command', command_type: commandType, payload });
}

// ---------------------------------------------------------------------------
// Event subscription
// ---------------------------------------------------------------------------

/**
 * Subscribe to multiplayer events.
 * Events: 'joined', 'player_joined', 'player_left', 'chat', 'sync', 'command', 'disconnected', 'error'
 * @param {Function} listener - (eventType, data) => void
 * @returns {Function} unsubscribe function
 */
export function onEvent(listener) {
  _eventListeners.add(listener);
  return () => _eventListeners.delete(listener);
}

/**
 * Get all remote players and their last known transforms.
 * @returns {Map<string, {position: number[], rotation: number[]}>}
 */
export function getRemotePlayers() {
  return new Map(_remotePlayers);
}

/**
 * Get the current room name.
 * @returns {string|null}
 */
export function getCurrentRoom() {
  return _currentRoom;
}

// ---------------------------------------------------------------------------
// Command bus integration
// ---------------------------------------------------------------------------

/**
 * Register multiplayer command handlers on the command bus.
 * Call this during engine initialization to wire multiplayer to the bus.
 */
export function registerMultiplayerHandlers() {
  commandBus.on('JOIN_MULTIPLAYER', async (payload) => {
    const url = payload.server || 'wss://mp.crateengine.com';
    const name = payload.username || 'Player';
    const ok = await connect(url, name);
    return { ok, message: ok ? 'Connected to multiplayer' : 'Connection failed' };
  });

  commandBus.on('LEAVE_MULTIPLAYER', async () => {
    disconnect();
    return { ok: true, message: 'Disconnected from multiplayer' };
  });

  commandBus.on('JOIN_ROOM', async (payload) => {
    joinRoom(payload.room);
    return { ok: true, message: `Joining room: ${payload.room}` };
  });

  commandBus.on('CHAT_MESSAGE', async (payload) => {
    sendChat(payload.message);
    return { ok: true, message: 'Message sent' };
  });

  // Middleware: broadcast mutating commands to other players
  commandBus.use({
    after(cmd, result) {
      if (!result.ok || !isConnected() || !_currentRoom) return;
      const BROADCAST_TYPES = new Set([
        'SPAWN_OBJECT', 'REMOVE_OBJECT', 'TRANSFORM_OBJECT',
        'COLOR_OBJECT', 'CLEAR_SCENE', 'SET_TERRAIN', 'SET_WEATHER',
      ]);
      if (BROADCAST_TYPES.has(cmd.type) && cmd.source !== 'multiplayer') {
        broadcastCommand(cmd.type, cmd.payload);
      }
    },
  });

  console.log('[Multiplayer] Command bus handlers registered');
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function _send(msg) {
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify(msg));
  }
}

function _emit(eventType, data) {
  for (const listener of _eventListeners) {
    try {
      listener(eventType, data);
    } catch (err) {
      console.error('[Multiplayer] Listener error:', err);
    }
  }
}

function _handleServerMessage(msg) {
  switch (msg.type) {
    case 'joined':
      _currentRoom = msg.room;
      _remotePlayers.clear();
      for (const name of msg.players) {
        if (name !== _username) {
          _remotePlayers.set(name, { position: [0, 0, 0], rotation: [0, 0, 0] });
        }
      }
      _emit('joined', { room: msg.room, players: msg.players });
      break;

    case 'player_joined':
      _remotePlayers.set(msg.username, { position: [0, 0, 0], rotation: [0, 0, 0] });
      _emit('player_joined', { username: msg.username });
      break;

    case 'player_left':
      _remotePlayers.delete(msg.username);
      _emit('player_left', { username: msg.username });
      break;

    case 'chat':
      _emit('chat', { username: msg.username, message: msg.message });
      break;

    case 'sync':
      if (_remotePlayers.has(msg.username)) {
        _remotePlayers.set(msg.username, {
          position: msg.position,
          rotation: msg.rotation,
        });
      }
      _emit('sync', { username: msg.username, position: msg.position, rotation: msg.rotation });
      break;

    case 'command':
      // Dispatch received commands through the bus with 'multiplayer' source
      commandBus.dispatch({
        type: msg.command_type,
        payload: msg.payload,
        source: 'multiplayer',
      });
      _emit('command', { username: msg.username, command_type: msg.command_type });
      break;

    case 'pong':
      _emit('pong', { ts: msg.ts, latency: Date.now() - msg.ts });
      break;

    case 'error':
      console.error('[Multiplayer] Server error:', msg.message);
      _emit('error', { message: msg.message });
      break;
  }
}
