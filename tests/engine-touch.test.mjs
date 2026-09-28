import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Group, Mesh, BoxGeometry, MeshBasicMaterial, MathUtils } from 'three';
import { createTouchState, mountTouchControls } from '../engine/runtime/touch-controls.mjs';
import { createPhysics } from '../engine/runtime/physics.mjs';
import { newProject, cleanEntity } from '../engine/core/schema.mjs';

test('touch directions support simultaneous pointers and release independently', () => {
  const changes = [], state = createTouchState(value => changes.push(value));
  state.press(1, 'forward'); state.press(2, 'right'); assert.deepEqual(state.current, { x: 1, z: -1, jump: false });
  state.release(1); assert.deepEqual(state.current, { x: 1, z: 0, jump: false });
  state.release(2); assert.deepEqual(state.current, { x: 0, z: 0, jump: false }); assert.equal(changes.length, 4);
});

test('same pointer changing direction replaces its original action', () => {
  const state = createTouchState(); state.press(1, 'left'); state.press(1, 'right');
  assert.deepEqual(state.current, { x: 1, z: 0, jump: false }); state.release(1); assert.equal(state.current.x, 0);
});

test('opposing directions cancel and duplicate holds do not emit false transitions', () => {
  const changes = [], state = createTouchState(value => changes.push(value));
  state.press(1, 'left'); state.press(2, 'left'); assert.equal(changes.length, 1);
  state.press(3, 'right'); assert.equal(state.current.x, 0); state.release(1); assert.equal(state.current.x, 0);
  state.release(2); assert.equal(state.current.x, 1); assert.equal(changes.length, 3);
});

test('jump stays held until every jump pointer is released', () => {
  const state = createTouchState(); state.press(1, 'jump'); state.press(2, 'jump'); state.press(3, 'forward');
  state.release(1); assert.equal(state.current.jump, true); state.release(2);
  assert.deepEqual(state.current, { x: 0, z: -1, jump: false });
});

test('clear and dispose release held input and dispose is idempotent', () => {
  const changes = [], state = createTouchState(value => changes.push(value)); state.press(1, 'right'); state.press(2, 'jump');
  state.clear(); assert.deepEqual(state.current, { x: 0, z: 0, jump: false });
  state.press(3, 'forward'); state.dispose(); const count = changes.length;
  state.dispose(); state.press(4, 'right'); state.release(3); assert.equal(changes.length, count);
  assert.deepEqual(state.current, { x: 0, z: 0, jump: false });
});

test('invalid actions and external snapshot mutation cannot change touch state', () => {
  const state = createTouchState(value => { value.x = 99; }); state.press(1, 'right'); state.press(2, 'execute');
  const copy = state.current; copy.z = 99; assert.deepEqual(state.current, { x: 1, z: 0, jump: false });
});

function events() {
  const listeners = new Map();
  return { listeners, addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    send(type, extra = {}) { for (const fn of listeners.get(type) || []) fn({ preventDefault() {}, ...extra }); } };
}
function fakeDom() {
  const win = events(), doc = { ...events(), hidden: false, defaultView: win, activeElement: null };
  class Element {
    constructor(tag) { Object.assign(this, events()); this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = []; this.dataset = {}; this.attributes = new Map(); this.captured = new Set(); this.disabled = false; }
    append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    focus() { if (doc.activeElement !== this) doc.activeElement?.send('blur'); doc.activeElement = this; }
    setPointerCapture(pointerId) { this.captured.add(pointerId); }
    hasPointerCapture(pointerId) { return this.captured.has(pointerId); }
    releasePointerCapture(pointerId) { this.captured.delete(pointerId); this.send('lostpointercapture', { pointerId, stopPropagation() {} }); }
  }
  doc.createElement = tag => new Element(tag); doc.head = new Element('head'); doc.body = new Element('body');
  const flatten = root => [root, ...root.children.flatMap(flatten)];
  doc.getElementById = id => [...flatten(doc.head), ...flatten(doc.body)].find(element => element.id === id) || null;
  const container = new Element('div'); doc.body.append(container);
  return { win, doc, container, buttons: () => flatten(container).filter(element => element.tagName === 'BUTTON'),
    pointer(button, type, pointerId) { let prevented = false, stopped = false; button.send(type, { pointerId, preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } }); return { prevented, stopped }; } };
}

test('mounted touch buttons capture pointers, prevent scrolling and release/cancel held input', () => {
  const dom = fakeDom(), changes = [], mounted = mountTouchControls(dom.container, { onInput: value => changes.push(value) });
  const right = dom.buttons().find(button => button.dataset.direction === 'right'), jump = dom.buttons().find(button => button.dataset.direction === 'jump');
  assert.equal(right.getAttribute('aria-label'), 'Move right'); assert.equal(jump.getAttribute('aria-label'), 'Jump');
  assert.deepEqual(dom.pointer(right, 'pointerdown', 1), { prevented: true, stopped: true }); assert.equal(right.hasPointerCapture(1), true); assert.equal(right.getAttribute('aria-pressed'), 'true');
  dom.pointer(jump, 'pointerdown', 2); assert.deepEqual(changes.at(-1), { x: 1, z: 0, jump: true });
  dom.pointer(right, 'pointerup', 1); assert.equal(right.hasPointerCapture(1), false); assert.deepEqual(changes.at(-1), { x: 0, z: 0, jump: true });
  dom.pointer(jump, 'pointercancel', 2); assert.deepEqual(changes.at(-1), { x: 0, z: 0, jump: false }); assert.equal(jump.getAttribute('aria-pressed'), 'false'); mounted.dispose();
});

test('mounted controls clear on window blur, hidden document and pagehide', () => {
  const dom = fakeDom(), changes = [], mounted = mountTouchControls(dom.container, { onInput: value => changes.push(value) }), forward = dom.buttons()[0];
  dom.pointer(forward, 'pointerdown', 1); dom.win.send('blur'); assert.deepEqual(changes.at(-1), { x: 0, z: 0, jump: false });
  dom.pointer(forward, 'pointerdown', 2); dom.doc.hidden = true; dom.doc.send('visibilitychange'); assert.deepEqual(changes.at(-1), { x: 0, z: 0, jump: false });
  dom.doc.hidden = false; dom.pointer(forward, 'pointerdown', 3); dom.win.send('pagehide'); assert.deepEqual(changes.at(-1), { x: 0, z: 0, jump: false });
  assert.equal(forward.getAttribute('aria-pressed'), 'false'); mounted.dispose();
});

test('mounted controls support keyboard activation and remove overlay/listeners on dispose', () => {
  const dom = fakeDom(), changes = [], mounted = mountTouchControls(dom.container, { onInput: value => changes.push(value) }), right = dom.buttons().find(button => button.dataset.direction === 'right');
  right.send('keydown', { code: 'Space', stopPropagation() {} }); assert.deepEqual(changes.at(-1), { x: 1, z: 0, jump: false });
  right.send('keyup', { code: 'Space', stopPropagation() {} }); assert.deepEqual(changes.at(-1), { x: 0, z: 0, jump: false });
  dom.pointer(right, 'pointerdown', 1); mounted.dispose(); mounted.dispose(); assert.deepEqual(changes.at(-1), { x: 0, z: 0, jump: false });
  assert.equal(dom.container.children.length, 0); assert.equal([...dom.win.listeners.values(), ...dom.doc.listeners.values()].reduce((n, set) => n + set.size, 0), 0);
  assert.equal(dom.doc.head.children.length, 1, 'Shared style node is retained for future previews');
});

test('no-player touch controls are clearly disabled and cannot send movement', () => {
  const dom = fakeDom(), changes = [], mounted = mountTouchControls(dom.container, { enabled: false, onInput: value => changes.push(value) });
  assert.equal(dom.buttons().length, 5); assert.equal(dom.buttons().every(button => button.disabled && button.getAttribute('aria-label')), true);
  for (const button of dom.buttons()) dom.pointer(button, 'pointerdown', 1);
  assert.equal(changes.length, 0); assert.match(mounted.element.children.at(-1).textContent, /player controller/i); mounted.dispose();
});

async function fixture(t, extra = [], playerY = 2) {
  const previousWindow = globalThis.window, previousDocument = globalThis.document, win = events(), doc = events();
  win.performance = globalThis.performance; doc.hidden = false; globalThis.window = win; globalThis.document = doc;
  let physics; const scene = new Scene(), objects = new Map();
  t.after(() => { physics?.dispose(); scene.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; });
  const project = newProject('Touch fixture'); project.entities = [
    cleanEntity({ id: 'ground', type: 'box', position: [0, -.125, 0], scale: [20, .25, 20], components: { rigidbody: { type: 'static', restitution: 0 } } }),
    cleanEntity({ id: 'player', type: 'box', position: [0, playerY, 0], components: { rigidbody: { type: 'dynamic', restitution: 0 }, player: { speed: 5, jump: 6 } } }),
    ...extra.map(cleanEntity),
  ];
  for (const entity of project.entities) {
    const object = entity.type === 'empty' ? new Group() : new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    object.position.fromArray(entity.position); object.rotation.set(...entity.rotation.map(MathUtils.degToRad)); object.scale.fromArray(entity.scale);
    object.visible = entity.visible; object.userData.entityId = entity.id; objects.set(entity.id, object);
  }
  for (const entity of project.entities) (objects.get(entity.parentId) || scene).add(objects.get(entity.id)); scene.updateMatrixWorld(true);
  physics = await createPhysics(project, objects);
  return { physics, win, doc, objects, body: physics.bodies.get('player'), frames(count = 1) { for (let i = 0; i < count; i++) physics.step(1 / 60); } };
}

test('real Rapier touch movement normalizes diagonal velocity without a keyboard', async t => {
  const f = await fixture(t); f.physics.setInput({ x: 1, z: -1, jump: false }); f.frames(); const velocity = f.body.linvel();
  assert.ok(Math.abs(Math.hypot(velocity.x, velocity.z) - 5) < .01); assert.ok(velocity.x > 0 && velocity.z < 0);
  f.physics.clearInput(); f.frames(); assert.equal(f.body.linvel().x, 0); assert.equal(f.body.linvel().z, 0);
});

test('touch analog values are bounded and preserve smaller analog movement', async t => {
  const f = await fixture(t); f.physics.setInput({ x: .5, z: 0 }); f.frames(); assert.ok(Math.abs(f.body.linvel().x - 2.5) < .01);
  f.physics.setInput({ x: 999, z: -999 }); f.frames(); assert.ok(Math.abs(Math.hypot(f.body.linvel().x, f.body.linvel().z) - 5) < .01);
  f.physics.setInput({ x: NaN, z: Infinity }); f.frames(); assert.deepEqual(f.physics.input, { x: 0, z: 0, jump: false });
});

test('holding touch jump creates one jump edge and requires release before another', async t => {
  const f = await fixture(t, [], .5); f.frames(60); f.physics.setInput({ x: 0, z: 0, jump: true }); f.frames();
  assert.ok(f.body.linvel().y > 5, `Expected jump impulse, got ${f.body.linvel().y}`);
  for (let i = 0; i < 240; i++) { f.physics.setInput({ x: 0, z: 0, jump: true }); f.frames(); }
  assert.ok(f.body.translation().y < .6, 'Held jump must not repeatedly jump after landing');
  f.physics.setInput({ jump: false }); f.physics.setInput({ jump: true }); f.frames(); assert.ok(f.body.linvel().y > 5);
});

test('window blur clears touch movement and an unconsumed touch jump', async t => {
  const f = await fixture(t, [], .5); f.frames(60); f.physics.setInput({ x: 1, z: 1, jump: true }); f.win.send('blur'); f.frames();
  assert.deepEqual(f.physics.input, { x: 0, z: 0, jump: false }); assert.equal(f.body.linvel().x, 0); assert.equal(f.body.linvel().z, 0); assert.ok(f.body.linvel().y < 1);
});

test('hidden document clears both keyboard and touch input before resuming', async t => {
  const f = await fixture(t); f.win.send('keydown', { code: 'KeyW' }); f.physics.setInput({ x: 1, z: 0, jump: true });
  f.doc.hidden = true; f.doc.send('visibilitychange'); f.frames();
  assert.deepEqual(f.physics.input, { x: 0, z: 0, jump: false }); assert.equal(f.body.linvel().x, 0); assert.equal(f.body.linvel().z, 0);
});

test('hidden ancestors prevent child collision bodies from being created', async t => {
  const f = await fixture(t, [
    { id: 'hidden-parent', type: 'empty', visible: false },
    { id: 'hidden-child', type: 'box', parentId: 'hidden-parent', visible: true, components: { rigidbody: { type: 'static' } } },
    { id: 'visible-parent', type: 'empty', visible: true },
    { id: 'visible-child', type: 'box', parentId: 'visible-parent', position: [4, 1, 0], components: { rigidbody: { type: 'static' } } },
  ]);
  assert.equal(f.physics.bodies.has('hidden-child'), false); assert.equal(f.physics.bodies.has('visible-child'), true);
});

test('disposing physics removes document/window listeners and makes input inert', async t => {
  const f = await fixture(t); f.physics.setInput({ x: 1, jump: true }); f.physics.dispose();
  assert.equal([...f.win.listeners.values(), ...f.doc.listeners.values()].reduce((total, set) => total + set.size, 0), 0);
  assert.doesNotThrow(() => f.physics.setInput({ x: 1, z: 1, jump: true })); assert.deepEqual(f.physics.input, { x: 0, z: 0, jump: false });
  assert.doesNotThrow(() => f.physics.step(1 / 60));
});
