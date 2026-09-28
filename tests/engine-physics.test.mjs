import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Mesh, Group, BoxGeometry, MeshBasicMaterial, MathUtils, Vector3 } from 'three';
import { newProject, cleanEntity } from '../engine/core/schema.mjs';
import { createPhysics } from '../engine/runtime/physics.mjs';
import { createVectorObject } from '../engine/runtime/vector-shape.mjs';

function keyboard(t) {
  const previous = globalThis.window, listeners = new Map();
  // Rapier reads window.performance when a browser-like window exists.
  globalThis.window = { performance: globalThis.performance, addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); }, removeEventListener(type, listener) { listeners.get(type)?.delete(listener); } };
  const cleanup = []; t.after(() => { for (const fn of cleanup) fn(); if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  return { listeners, cleanup, send(type, code) { for (const fn of listeners.get(type) || []) fn({ code, preventDefault() {} }); } };
}
async function fixture(t, extra = [], configure = () => {}) {
  const input = keyboard(t), project = newProject('Physics check');
  project.entities = [cleanEntity({ type: 'box', id: 'ground', position: [0, -.125, 0], scale: [20, .25, 20], components: { rigidbody: { type: 'static', restitution: 0 } } }), cleanEntity({ type: 'box', id: 'falling', position: [0, 3, 0], components: { rigidbody: { type: 'dynamic', restitution: 0 } } }), ...extra.map(cleanEntity)];
  const scene = new Scene(), objects = new Map();
  for (const e of project.entities) {
    const object = e.type === 'empty' ? new Group() : e.type==='customMesh'?createVectorObject({DoubleSide:2},e.shape):new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()); object.position.fromArray(e.position); object.rotation.set(...e.rotation.map(MathUtils.degToRad)); object.scale.fromArray(e.scale); object.visible = e.visible; object.userData.entityId = e.id; objects.set(e.id, object);
  }
  for (const e of project.entities) (objects.get(e.parentId) || scene).add(objects.get(e.id)); configure(objects, project); scene.updateMatrixWorld(true);
  const scores = [], physics = await createPhysics(project, objects, { onScore: score => scores.push(score) }); let disposed = false;
  input.cleanup.push(() => { if (!disposed) physics.dispose(); scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); });
  return { input, project, objects, physics, scores, dispose() { physics.dispose(); disposed = true; }, frames(count = 180) { for (let i = 0; i < count; i++) physics.step(1 / 60); } };
}
test('real Rapier body falls onto fixed ground while project edit data stays unchanged', async t => {
  const f = await fixture(t); const before = structuredClone(f.project); f.frames(); const y = f.objects.get('falling').position.y;
  assert.ok(y > .45 && y < .55, `Body should settle around y=.5; got ${y}`); assert.deepEqual(f.project, before); assert.ok(Math.abs(f.physics.bodies.get('falling').linvel().y) < .1);
});
test('fixed stepping tolerates small frame durations and caps long-frame catch-up', async t => {
  const f = await fixture(t); f.physics.step(1 / 120); assert.equal(f.objects.get('falling').position.y, 3); f.physics.step(1 / 120); assert.ok(f.objects.get('falling').position.y < 3);
  f.physics.step(1000); assert.ok(f.objects.get('falling').position.y > 2, 'Long inactive frame must not simulate thousands of seconds');
});
test('dispose removes keyboard listeners, is idempotent and stops stepping safely', async t => {
  const f = await fixture(t); assert.equal([...f.input.listeners.values()].reduce((n, s) => n + s.size, 0), 3); f.dispose(); const position = f.objects.get('falling').position.clone();
  assert.equal([...f.input.listeners.values()].reduce((n, s) => n + s.size, 0), 0); assert.doesNotThrow(() => f.physics.dispose()); assert.doesNotThrow(() => f.physics.step(1 / 60)); assert.deepEqual(f.objects.get('falling').position, position);
});
test('collectibles score once per preview and do not persist hidden state to the project', async t => {
  const f = await fixture(t, [{ type: 'box', id: 'player', position: [4, .5, 0], components: { player: {}, rigidbody: { type: 'dynamic' } } }, { type: 'sphere', id: 'coin', position: [4, .5, .3], components: { collectible: { value: 5 } } }]);
  f.frames(10); assert.deepEqual(f.scores, [5]); assert.equal(f.objects.get('coin').visible, false); assert.equal(f.project.entities.find(x => x.id === 'coin').visible, true);
});
test('player movement normalizes diagonal velocity and clears on blur', async t => {
  const f = await fixture(t, [{ type: 'box', id: 'player', position: [4, 2, 0], components: { player: { speed: 5 }, rigidbody: { type: 'dynamic' } } }]);
  f.input.send('keydown', 'KeyW'); f.input.send('keydown', 'KeyD'); f.physics.step(1 / 60); const velocity = f.physics.bodies.get('player').linvel(); assert.ok(Math.abs(Math.hypot(velocity.x, velocity.z) - 5) < .05);
  f.input.send('blur'); f.physics.step(1 / 60); const stopped = f.physics.bodies.get('player').linvel(); assert.equal(stopped.x, 0); assert.equal(stopped.z, 0);
});
test('side-view player moves in X, jumps on Y and stays on its depth plane',async t=>{
 const f=await fixture(t,[{type:'box',id:'side-player',position:[0,3,2],components:{player:{speed:6,jump:8,sideView:true},rigidbody:{type:'dynamic'}}}],(_objects,project)=>{project.settings.gravity=0;});
 f.input.send('keydown','ArrowRight');f.input.send('keydown','KeyW');f.physics.step(1/60);const velocity=f.physics.bodies.get('side-player').linvel();
 assert.ok(velocity.x>5.9,`side-view horizontal velocity: ${JSON.stringify(velocity)}; player=${JSON.stringify(f.project.entities.find(e=>e.id==='side-player').components.player)}`);assert.equal(velocity.z,0);assert.ok(Math.abs(f.objects.get('side-player').position.z-2)<1e-6);
});
test('custom vector ground creates a Rapier collider and supports a falling body',async t=>{
 const ground={type:'customMesh',id:'vector-floor',position:[0,-.2,0],shape:{paths:[{points:[[-8,-.2],[8,-.2],[8,.2],[-8,.2]],color:'#52764f'}]},components:{rigidbody:{type:'static'}}};
 const f=await fixture(t,[ground]);f.frames(240);const body=f.objects.get('falling').position.y;assert.ok(body>.45&&body<.6,`Expected body to land on vector floor, got ${body}`);assert.ok(f.physics.bodies.has('vector-floor'));
});
test('front-view player meshes collide on the same thin depth plane as vector platforms',async t=>{
 const floor={type:'customMesh',id:'art-floor',position:[0,-.2,0],shape:{paths:[{points:[[-8,-.2],[8,-.2],[8,.2],[-8,.2]],color:'#52764f',depth:.03}]},components:{rigidbody:{type:'static'}}};
 const hero={type:'customMesh',id:'art-player',position:[0,1.7,-.06],scale:[1.15,1.15,1],shape:{paths:[{points:[[-.4,-1.25],[.3,-1.25],[.4,.2],[.2,1.43],[-.2,1.3],[-.4,.1]],color:'#4c8e78',depth:.14},{points:[[-.2,-.9],[.2,-.9],[.2,.9],[-.2,.9]],color:'#e9c39a',depth:.01}]},components:{player:{sideView:true},rigidbody:{type:'dynamic'}}};
 const f=await fixture(t,[floor,hero]);f.frames(300);const body=f.physics.bodies.get('art-player').translation();
 assert.ok(body.y>1.2,`The hand-shaped player should land on the floor; Y=${body.y}`);assert.ok(Math.abs(body.z+.06)<.002,`Player depth should stay fixed; Z=${body.z}`);
});
test('side-view custom-mesh player jumps from and lands on the custom platform',async t=>{
 const floor={type:'customMesh',id:'jump-floor',position:[0,-.2,0],shape:{paths:[{points:[[-8,-.2],[8,-.2],[8,.2],[-8,.2]],color:'#52764f',depth:.03}]},components:{rigidbody:{type:'static'}}};
 const hero={type:'customMesh',id:'jump-player',position:[0,1.7,-.06],scale:[1.15,1.15,1],shape:{paths:[{points:[[-.4,-1.25],[.3,-1.25],[.4,.2],[.2,1.43],[-.2,1.3],[-.4,.1]],color:'#4c8e78',depth:.14}]},components:{player:{speed:7,jump:10,sideView:true},rigidbody:{type:'dynamic'}}};
 const f=await fixture(t,[floor,hero]);f.frames(180);const before=f.physics.bodies.get('jump-player').translation();f.input.send('keydown','Space');f.physics.step(1/60);f.input.send('keyup','Space');
 assert.ok(f.physics.bodies.get('jump-player').linvel().y>9,`Grounded player should jump, Y velocity=${f.physics.bodies.get('jump-player').linvel().y}`);
 f.frames(30);const airborne=f.physics.bodies.get('jump-player').translation();assert.ok(airborne.y>before.y+2,`Player should rise from the mesh platform; before=${before.y}, after=${airborne.y}`);assert.ok(Math.abs(airborne.z+.06)<.002);
 f.frames(180);const landed=f.physics.bodies.get('jump-player').translation();assert.ok(landed.y>before.y-.12&&landed.y<before.y+.12,`Player should return to its platform; before=${before.y}, landed=${landed.y}`);assert.ok(Math.abs(landed.z+.06)<.002);
});
test('blur also cancels an unconsumed jump press', async t => {
  const f = await fixture(t, [{ type: 'box', id: 'player', position: [4, .5, 0], components: { player: { jump: 6 }, rigidbody: { type: 'dynamic', restitution: 0 } } }]);
  f.frames(30); f.input.send('keydown', 'Space'); f.input.send('blur'); f.physics.step(1 / 60); assert.ok(f.physics.bodies.get('player').linvel().y < 1, 'Blurred window should not trigger a queued jump');
});
test('dynamic child world position is converted back into parent local coordinates', async t => {
  const f = await fixture(t, [{ type: 'empty', id: 'parent', position: [5, 0, 0] }, { type: 'box', id: 'child', parentId: 'parent', position: [0, 3, 0], components: { rigidbody: { type: 'dynamic', restitution: 0 } } }]);
  f.frames(); const child = f.objects.get('child'), parent = f.objects.get('parent'), body = f.physics.bodies.get('child').translation();
  const simulatedWorld = new Vector3(body.x, body.y, body.z), expectedLocal = parent.worldToLocal(simulatedWorld.clone());
  // Contact solving may introduce small lateral drift. Compare against the actual
  // body transform so this tests coordinate conversion, not a frozen solver result.
  assert.ok(child.position.distanceTo(expectedLocal) < .000001, 'Rendered local position must match the body transformed into parent space');
  assert.ok(child.getWorldPosition(new Vector3()).distanceTo(simulatedWorld) < .000001, 'Rendered world position must match the simulated body');
  assert.ok(child.position.y > .45 && child.position.y < .55, 'Child must settle on the ground around y=.5');
  assert.ok(Math.abs(body.x - 5) < .1 && Math.abs(body.z) < .1, 'Contact drift must remain small and the body must stay on the floor');
});
test('invalid delta values cannot permanently poison the simulation accumulator', async t => {
  const f = await fixture(t); for (const delta of [NaN, Infinity, -5]) { try { f.physics.step(delta); } catch (error) { assert.match(error.message, /time|delta|finite/i); } }
  f.frames(); assert.ok(f.objects.get('falling').position.y < 1, 'Normal simulation resumes after invalid deltas');
});
test('rotated box collider uses local bounds once rather than rotating world AABB twice', async t => {
  const f = await fixture(t, [{ type: 'box', id: 'rotated', position: [4, 2, 0], rotation: [0, 45, 0], scale: [4, 1, 1], components: { rigidbody: { type: 'static' } } }]);
  const body = f.physics.bodies.get('rotated'), extents = body.collider(0).halfExtents(); assert.ok(Math.abs(extents.x - 2) < .0001); assert.ok(Math.abs(extents.z - .5) < .0001); assert.ok(Math.abs(body.rotation().y - Math.sin(Math.PI / 8)) < .0001);
});
test('collider local offset matches geometry positioned away from a model origin', async t => {
  const f = await fixture(t, [{ type: 'empty', id: 'model', position: [5, 2, 0], components: { rigidbody: { type: 'static' } } }], objects => { const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()); mesh.position.x = 2; mesh.userData.entityId = 'model'; objects.get('model').add(mesh); });
  const body = f.physics.bodies.get('model'); assert.equal(body.translation().x, 5); assert.ok(Math.abs(body.collider(0).translation().x - 7) < .001);
});
test('dynamic parent synchronization is correct even when child precedes parent in project order', async t => {
  const f = await fixture(t, [{ type: 'box', id: 'child', parentId: 'parent', position: [0, 2, 0], components: { rigidbody: { type: 'dynamic', restitution: 0 } } }, { type: 'box', id: 'parent', position: [5, 3, 0], components: { rigidbody: { type: 'dynamic', restitution: 0 } } }]);
  f.frames(10); const rendered = f.objects.get('child').getWorldPosition(new Vector3()), simulated = f.physics.bodies.get('child').translation(); assert.ok(Math.abs(rendered.y - simulated.y) < .0001, `Rendered child ${rendered.y} must match simulated ${simulated.y}`);
});
test('hidden authored collectibles are not scored', async t => {
  const f = await fixture(t, [{ type: 'box', id: 'player', position: [4, .5, 0], components: { player: {}, rigidbody: { type: 'dynamic' } } }, { type: 'sphere', id: 'coin', position: [4, .5, .3], visible: false, components: { collectible: { value: 5 } } }]);
  f.frames(1); assert.deepEqual(f.scores, []);
});
