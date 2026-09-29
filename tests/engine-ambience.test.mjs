import test from 'node:test';
import assert from 'node:assert/strict';
import { createAmbience, AMBIENCES } from '../engine/runtime/ambience.mjs';


class Param { constructor(v = 0) { this.value = v; } setValueAtTime() {} linearRampToValueAtTime() {} exponentialRampToValueAtTime() {} }
class Node { constructor() { this.gain = new Param(1); this.frequency = new Param(); this.Q = new Param(); this.connected = 0; } connect(n) { this.connected++; return n; } disconnect() {} start() {} stop() { this.stopped = true; } }
class FakeContext {
  constructor() { FakeContext.made++; this.sampleRate = 8000; this.currentTime = 0; this.destination = new Node(); this.closed = false; }
  createGain() { return new Node(); } createBiquadFilter() { return new Node(); } createOscillator() { return new Node(); }
  createBufferSource() { return new Node(); }
  createBuffer(channels, length) { const data = new Float32Array(length); return { getChannelData: () => data }; }
  resume() {} async close() { this.closed = true; }
}
FakeContext.made = 0;

test('every ambience builds a sound graph, switches, and stops cleanly', async () => {
  const ambience = createAmbience({ AudioContextClass: FakeContext });
  ambience.start({ ambience: 'none' }); assert.equal(FakeContext.made, 0, 'no audio context until a sound is chosen');
  for (const kind of AMBIENCES) { ambience.start({ ambience: kind, ambienceVolume: .3 }); assert.equal(ambience.playing, kind); }
  assert.equal(FakeContext.made, 1, 'one context is reused');
  ambience.start({ ambience: 'none' }); assert.equal(ambience.playing, 'none');
  await ambience.dispose();
});
