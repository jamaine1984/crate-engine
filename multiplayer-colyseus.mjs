let colyseusModPromise = null;

async function loadColyseus() {
  if (!colyseusModPromise) {
    const url = 'https://cdn.jsdelivr.net/npm/colyseus.js@0.16.19/+esm';
    colyseusModPromise = import(/* @vite-ignore */ url);
  }
  return colyseusModPromise;
}

export class ColyseusBridge {
  constructor() {
    this.client = null;
    this.room = null;
    this.connected = false;
  }

  async connect(endpoint, roomName = 'crate-world', options = {}) {
    const { Client } = await loadColyseus();
    this.client = new Client(endpoint);
    this.room = await this.client.joinOrCreate(roomName, options);
    this.connected = true;
    return this.room;
  }

  sendPose(payload) {
    if (!this.room) return false;
    this.room.send('pose', payload);
    return true;
  }

  onState(handler) {
    if (!this.room) return;
    this.room.onStateChange((state) => handler(state));
  }

  async disconnect() {
    if (this.room) await this.room.leave(true);
    this.room = null;
    this.connected = false;
  }
}
