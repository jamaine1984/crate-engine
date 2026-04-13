import http from 'node:http';
import express from 'express';
import { Server, Room } from 'colyseus';

class CrateRoom extends Room {
  onCreate() {
    this.state = { players: {} };
    this.onMessage('pose', (client, data) => {
      this.state.players[client.sessionId] = data;
      this.broadcast('pose', { id: client.sessionId, ...data }, { except: client });
    });
  }

  onJoin(client, options) {
    this.state.players[client.sessionId] = {
      name: options?.name || `Player_${client.sessionId.slice(0, 4)}`,
      position: { x: 0, y: 0, z: 0 }
    };
    this.broadcast('presence', { id: client.sessionId, state: this.state.players[client.sessionId] });
  }

  onLeave(client) {
    delete this.state.players[client.sessionId];
    this.broadcast('leave', { id: client.sessionId });
  }
}

const app = express();
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'crate-engine-colyseus-server' });
});

const server = http.createServer(app);
const gameServer = new Server({ server });
gameServer.define('crate-world', CrateRoom);

const port = Number(process.env.PORT || 2567);
server.listen(port, () => {
  console.log(`Crate Colyseus server listening on http://127.0.0.1:${port}`);
});
