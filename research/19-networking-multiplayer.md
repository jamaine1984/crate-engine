# 19 — Networking & Multiplayer (Deep Dive)

> Already have basic WebSocket — here's how to make it production-ready

---

## Architecture: Authoritative Server

**Current:** Relay server (broadcast positions). 
**Need:** Server validates game state, prevents cheating.

```
Client A                    Server                    Client B
  |                           |                           |
  |--[input: move left]------>|                           |
  |                           |--[validate, apply]        |
  |                           |--[state update]---------->|
  |<--[state update]----------|                           |
  |                           |                           |
```

### Client-Side Prediction

Don't wait for server — move immediately, correct later:

```javascript
class NetworkedPlayer {
    constructor() {
        this.pendingInputs = []; // inputs sent but not confirmed
        this.inputSequence = 0;
    }
    
    processInput(input) {
        // Apply locally immediately
        this.applyInput(input);
        
        // Send to server
        input.sequence = this.inputSequence++;
        this.pendingInputs.push(input);
        socket.send(JSON.stringify({ type: 'input', data: input }));
    }
    
    onServerUpdate(state) {
        // Server says we're at position X
        this.position.copy(state.position);
        
        // Re-apply inputs server hasn't processed yet
        this.pendingInputs = this.pendingInputs.filter(
            i => i.sequence > state.lastProcessedInput
        );
        for (const input of this.pendingInputs) {
            this.applyInput(input);
        }
    }
}
```

### Entity Interpolation (Other Players)

Other players' positions arrive in packets. Interpolate between them for smooth movement:

```javascript
class RemotePlayer {
    constructor() {
        this.positionBuffer = []; // { timestamp, position, rotation }
        this.interpolationDelay = 100; // ms behind real-time
    }
    
    addState(timestamp, position, rotation) {
        this.positionBuffer.push({ timestamp, position, rotation });
        // Keep last 1 second of states
        const cutoff = Date.now() - 1000;
        this.positionBuffer = this.positionBuffer.filter(s => s.timestamp > cutoff);
    }
    
    update() {
        const renderTime = Date.now() - this.interpolationDelay;
        const buffer = this.positionBuffer;
        
        // Find two states to interpolate between
        let i = 0;
        while (i < buffer.length - 1 && buffer[i + 1].timestamp < renderTime) i++;
        
        if (i < buffer.length - 1) {
            const a = buffer[i];
            const b = buffer[i + 1];
            const t = (renderTime - a.timestamp) / (b.timestamp - a.timestamp);
            
            this.mesh.position.lerpVectors(a.position, b.position, t);
            this.mesh.quaternion.slerpQuaternions(a.rotation, b.rotation, t);
        }
    }
}
```

---

## State Sync Protocol

```javascript
// Server sends full state at low frequency (10Hz)
// + delta updates at high frequency (30Hz)

// Full state (every 100ms)
{
    type: 'state',
    tick: 1234,
    players: [
        { id: 'abc', pos: [x,y,z], rot: [x,y,z,w], health: 80, anim: 'run' },
    ],
    npcs: [...],
    projectiles: [...],
}

// Delta (every 33ms) - only changed fields
{
    type: 'delta',
    tick: 1235,
    changes: [
        { id: 'abc', pos: [x,y,z] }, // only position changed
    ]
}
```

## Bandwidth Optimization

```javascript
// Quantize positions (float32 → int16 = 50% bandwidth reduction)
function packPosition(pos) {
    return [
        Math.round(pos.x * 100), // 2 decimal places
        Math.round(pos.y * 100),
        Math.round(pos.z * 100),
    ];
}

// Binary protocol instead of JSON (80%+ reduction)
function encodeState(players) {
    const buffer = new ArrayBuffer(4 + players.length * 28);
    const view = new DataView(buffer);
    
    view.setUint32(0, players.length);
    
    let offset = 4;
    for (const p of players) {
        view.setFloat32(offset, p.pos.x); offset += 4;
        view.setFloat32(offset, p.pos.y); offset += 4;
        view.setFloat32(offset, p.pos.z); offset += 4;
        view.setFloat32(offset, p.rot.x); offset += 4;
        view.setFloat32(offset, p.rot.y); offset += 4;
        view.setFloat32(offset, p.rot.z); offset += 4;
        view.setFloat32(offset, p.rot.w); offset += 4;
    }
    
    return buffer;
}
```

## Room/Lobby System

```javascript
// Server-side room management
class Room {
    constructor(id, host, config) {
        this.id = id;
        this.host = host;
        this.players = new Map();
        this.maxPlayers = config.maxPlayers || 8;
        this.state = 'lobby'; // lobby, playing, ended
        this.worldData = null; // shared world state
    }
    
    join(player) {
        if (this.players.size >= this.maxPlayers) return false;
        this.players.set(player.id, player);
        this.broadcast({ type: 'player_joined', player: player.serialize() });
        return true;
    }
    
    leave(playerId) {
        this.players.delete(playerId);
        this.broadcast({ type: 'player_left', playerId });
        if (playerId === this.host && this.players.size > 0) {
            this.host = this.players.keys().next().value; // migrate host
        }
    }
}
```

---

## Implementation Plan

1. **Phase 1:** Improve current relay → add interpolation for remote players
2. **Phase 2:** Room/lobby system
3. **Phase 3:** Binary protocol for bandwidth
4. **Phase 4:** Server-side validation (authoritative)
5. **Phase 5:** World state sync (buildings, objects placed by any player)

---

*Next: 20-accessibility.md*
