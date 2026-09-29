import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GTAOShader } from 'three/addons/shaders/GTAOShader.js';

const scene = readFileSync(new URL('../engine/runtime/post.mjs', import.meta.url), 'utf8');

// High quality patches three's ambient-occlusion shader so far surfaces (a sky dome 450 m away, for example) are not
// darkened by depth-precision noise. The patch is a string replace, so a three.js upgrade that renames the text would
// silently switch the fix off and bring back the black sky. This test fails loudly instead.
test('three.js ambient-occlusion shader still contains the text the distance fade patches', () => {
  assert.ok(GTAOShader.fragmentShader.includes('ao = pow(ao, scale);'), 'marker line moved; update fadeAoWithDistance in engine/runtime/post.mjs');
  assert.ok(/vec3 viewPos = getViewPosition\(/.test(GTAOShader.fragmentShader), 'viewPos variable renamed; the fade reads -viewPos.z');
});

test('the editor and runtime apply the distance fade before the AO pass is used', () => {
  assert.ok(scene.includes('function fadeAoWithDistance('));
  assert.ok(scene.includes('smoothstep(30.0, 90.0, -viewPos.z)'));
  assert.ok(scene.indexOf('fadeAoWithDistance(passes.ao);composer.addPass(passes.ao)') > 0, 'fade must run before the pass is added');
});
