import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Mesh, Group, BoxGeometry, MeshBasicMaterial, MathUtils } from 'three';
import { newProject, cleanEntity, cleanSettings } from '../engine/core/schema.mjs';
import { createPhysics } from '../engine/runtime/physics.mjs';
import { createVectorObject } from '../engine/runtime/vector-shape.mjs';

const windows = new WeakMap();
function keyboard(t) {
  // One fake window per test; physics instances are disposed before it is removed.
  if (windows.has(t)) return windows.get(t);
  const previous = globalThis.window, listeners = new Map(), cleanup = [];
  globalThis.window = { performance: globalThis.performance, addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); }, removeEventListener(type, listener) { listeners.get(type)?.delete(listener); } };
  t.after(() => { for (const fn of cleanup) fn(); if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const keys = { cleanup, send(type, code) { for (const fn of listeners.get(type) || []) fn({ code, preventDefault() {} }); } };
  windows.set(t, keys); return keys;
}
const ground = { type: 'box', id: 'ground', position: [0, -.125, 0], scale: [60, .25, 4], components: { rigidbody: { type: 'static', restitution: 0 } } };
const hero = (extra = {}) => ({ type: 'box', id: 'hero', position: [0, .6, 0], scale: [.8, 1, .8], components: { rigidbody: { type: 'dynamic', restitution: 0 }, player: { speed: 6, jump: 7, sideView: true } }, ...extra });
async function world(t, entities, settings = {}) {
  const keys = keyboard(t), project = newProject('Gameplay check');
  project.settings = cleanSettings(settings); project.entities = entities.map(cleanEntity);
  const scene = new Scene(), objects = new Map();
  for (const e of project.entities) {
    const object = e.type === 'empty' ? new Group() : e.type === 'customMesh' ? createVectorObject({ DoubleSide: 2 }, e.shape) : new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    object.position.fromArray(e.position); object.rotation.set(...e.rotation.map(MathUtils.degToRad)); object.scale.fromArray(e.scale); object.userData.entityId = e.id; objects.set(e.id, object);
  }
  for (const e of project.entities) (objects.get(e.parentId) || scene).add(objects.get(e.id)); scene.updateMatrixWorld(true);
  const events = [], physics = await createPhysics(project, objects, { onEvent: event => events.push(event) });
  keys.cleanup.push(() => physics.dispose());
  return { keys, physics, objects, events, frames(n) { for (let i = 0; i < n; i++) physics.step(1 / 60); },
    until(done, max = 600) { for (let i = 0; i < max; i++) { physics.step(1 / 60); if (done()) return i + 1; } throw new Error('Condition not reached'); }, x: id => physics.bodies.get(id).translation().x, y: id => physics.bodies.get(id).translation().y };
}

test('touching a goal wins once and freezes player input', async t => {
  const w = await world(t, [ground, hero(), { type: 'box', id: 'flag', name: 'Flag', position: [4, 1, 0], scale: [.5, 2, .5], components: { goal: { message: 'You made it!' } } }]);
  w.keys.send('keydown', 'ArrowRight'); w.frames(150);
  const wins = w.events.filter(e => e.type === 'win');
  assert.equal(wins.length, 1); assert.equal(wins[0].message, 'You made it!'); assert.equal(w.physics.state.status, 'won');
  const frozenAt = w.x('hero'); w.frames(60);
  assert.ok(Math.abs(w.x('hero') - frozenAt) < .05, 'held input must not move a player after winning');
});

test('hazards cost a life and respawn the player; the last life ends the game', async t => {
  const w = await world(t, [ground, hero(), { type: 'box', id: 'spikes', position: [3, .25, 0], scale: [1, .5, 1], components: { hazard: {} } }], { lives: 2 });
  w.keys.send('keydown', 'ArrowRight'); w.until(() => w.events.some(e => e.type === 'respawn')); w.keys.send('keyup', 'ArrowRight');
  const respawn = w.events.find(e => e.type === 'respawn');
  assert.equal(respawn.lives, 1); assert.equal(w.physics.state.lives, 1); assert.equal(w.physics.state.status, 'playing');
  assert.ok(Math.abs(w.x('hero')) < .2, 'respawned at the start');
  w.frames(60); w.keys.send('keydown', 'ArrowRight'); w.until(() => w.physics.state.status === 'lost');
  assert.equal(w.events.filter(e => e.type === 'lose').length, 1); assert.equal(w.physics.state.status, 'lost'); assert.equal(w.physics.state.lives, 0);
});

test('falling below killY respawns at the start with unlimited lives', async t => {
  const w = await world(t, [{ ...ground, scale: [4, .25, 4] }, hero()], { killY: -5 });
  w.keys.send('keydown', 'ArrowRight'); w.frames(200); w.keys.send('keyup', 'ArrowRight');
  assert.ok(w.events.some(e => e.type === 'respawn'), 'walking off the edge must respawn');
  assert.equal(w.physics.state.status, 'playing'); assert.equal(w.physics.state.maxLives, 0);
  w.frames(30); assert.ok(w.y('hero') > -1, 'player is back above the ground after respawn');
});

test('checkpoints move the respawn point', async t => {
  const w = await world(t, [ground, hero(),
    { type: 'box', id: 'cp', name: 'Camp', position: [3, .05, 0], scale: [.6, .1, .6], components: { checkpoint: {} } },
    { type: 'box', id: 'lava', position: [7, .25, 0], scale: [1, .5, 1], components: { hazard: {} } }]);
  w.keys.send('keydown', 'ArrowRight'); w.until(() => w.events.some(e => e.type === 'respawn')); w.keys.send('keyup', 'ArrowRight');
  assert.deepEqual(w.events.filter(e => e.type === 'checkpoint').map(e => e.name), ['Camp']);
  w.frames(5); assert.ok(Math.abs(w.x('hero') - 3) < .6, `respawned near the checkpoint, x=${w.x('hero')}`);
});

test('moving platforms oscillate and carry a standing player', async t => {
  const w = await world(t, [
    { type: 'box', id: 'lift', position: [0, 0, 0], scale: [3, .3, 3], components: { rigidbody: { type: 'static', restitution: 0 }, mover: { offset: [6, 0, 0], period: 4 } } },
    hero({ position: [0, .9, 0] })]);
  w.frames(120);
  const platformX = w.x('lift'); assert.ok(platformX > 2.5, `platform moved along its offset, x=${platformX}`);
  assert.ok(Math.abs(w.x('hero') - platformX) < 1.2, `player rode the platform, hero=${w.x('hero')} lift=${platformX}`);
  w.frames(120); assert.ok(w.x('lift') < 1, 'platform returns after a full period');
});

test('shape collision follows a vector outline instead of its bounding box', async t => {
  const notch = { paths: [{ color: '#556b2f', points: [[-3, 0], [3, 0], [3, 3], [1, 3], [1, 1], [-1, 1], [-1, 3], [-3, 3]] }] };
  const crate = { type: 'box', id: 'crate', position: [0, 6, 0], scale: [.8, .8, .8], components: { rigidbody: { type: 'dynamic', restitution: 0 } } };
  const shaped = await world(t, [{ type: 'customMesh', id: 'u', shape: notch, position: [0, 0, 0], components: { rigidbody: { type: 'static', collider: 'shape' } } }, crate]);
  shaped.frames(240);
  assert.ok(shaped.y('crate') < 1.8, `crate settles inside the notch, y=${shaped.y('crate')}`);
  const boxed = await world(t, [{ type: 'customMesh', id: 'u', shape: notch, position: [0, 0, 0], components: { rigidbody: { type: 'static' } } }, crate]);
  boxed.frames(240);
  assert.ok(boxed.y('crate') > 3 && boxed.y('crate') < 4, `default box collider catches the crate on top of the outline box, y=${boxed.y('crate')}`);
});

test('schema rejects impossible rule combinations and clamps level settings', () => {
  assert.throws(() => cleanEntity({ type: 'box', components: { player: {}, rigidbody: { type: 'dynamic' }, goal: {} } }), /player cannot/);
  assert.throws(() => cleanEntity({ type: 'box', components: { mover: {}, rigidbody: { type: 'dynamic' } } }), /moving platform/);
  assert.deepEqual(cleanEntity({ type: 'box', components: { mover: { offset: [1e9, 0, 0], period: 0 } } }).components.mover, { offset: [1000, 0, 0], period: .2 });
  assert.equal(cleanSettings({ lives: 500 }).lives, 99); assert.equal(cleanSettings({}).killY, -30);
});
