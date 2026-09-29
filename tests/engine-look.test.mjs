import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOOKS, LOOK_DEFAULTS, LOOK_VALIDATORS, cleanLook, expandLook, sunState } from '../engine/core/look.mjs';
import { cleanSettings, newProject } from '../engine/core/schema.mjs';
import { validArguments, toolDefinitions } from '../integrations/editor/contracts.mjs';
import { postPlan } from '../engine/runtime/post.mjs';

test('old projects keep their look: defaults are the flat colour sky and ACES', () => {
  const settings = cleanSettings({ background: '#112233', exposure: 1.3 });
  assert.equal(settings.sky, 'color');
  assert.equal(settings.toneMapping, 'aces');
  assert.equal(settings.bloom, 0);
  assert.deepEqual(cleanLook({}), LOOK_DEFAULTS);
  assert.equal(newProject().settings.look, 'custom');
});

test('every preset is valid against the shared validators', () => {
  for (const [name, preset] of Object.entries(LOOKS)) {
    assert.ok(LOOK_VALIDATORS.look(name), name);
    for (const [key, value] of Object.entries(preset)) {
      if (LOOK_VALIDATORS[key]) assert.ok(LOOK_VALIDATORS[key](value), `${name}.${key}=${value}`);
    }
    assert.ok(validArguments('set_level_settings', { settings: expandLook({ look: name }) }), name);
  }
});

test('a preset fills the look; explicit fields win; undefined fields do not erase the preset', () => {
  const golden = expandLook({ look: 'golden-hour', bloom: 1.2, exposure: undefined });
  assert.equal(golden.sky, 'physical');
  assert.equal(golden.bloom, 1.2);
  assert.equal(golden.exposure, LOOKS['golden-hour'].exposure);
  assert.deepEqual(expandLook({ look: 'custom', bloom: .3 }), { look: 'custom', bloom: .3 });
});

test('invalid look values are rejected at the MCP boundary and cleaned in stored projects', () => {
  for (const bad of [{ look: 'hdr-max' }, { sky: 'hdri' }, { timeOfDay: 25 }, { bloom: -1 }, { toneMapping: 'filmic' }, { shadowDistance: 5 }, { clouds: 2 }]) {
    assert.equal(validArguments('set_level_settings', { settings: bad }), false, JSON.stringify(bad));
  }
  assert.equal(cleanSettings({ timeOfDay: 99, sky: 'hdri' }).timeOfDay, 14);
  assert.equal(cleanSettings({ sky: 'hdri' }).sky, 'color');
});

test('the MCP tool schema advertises the look fields', async () => {
  const tool = (await toolDefinitions()).find(t => t.name === 'set_level_settings');
  const props = tool.inputSchema.properties.settings.properties;
  for (const key of ['look', 'sky', 'timeOfDay', 'clouds', 'toneMapping', 'shadowDistance', 'bloom', 'vignette', 'dof', 'saturation', 'contrast', 'warmth']) assert.ok(props[key], key);
});

test('the sun rises in the east, peaks at noon, sets in the west, and becomes a dim moon at night', () => {
  const noon = sunState(12), morning = sunState(8), evening = sunState(16), night = sunState(23);
  assert.ok(noon.elevation > 60);
  assert.ok(morning.direction[0] > 0, 'morning sun is east (+x)');
  assert.ok(evening.direction[0] < 0, 'evening sun is west (-x)');
  assert.ok(night.night && night.intensity < .3 && night.skyDirection[1] < 0);
  assert.ok(night.direction[1] > 0, 'moonlight stays above the horizon so shadows stay sane');
  const low = sunState(17.9);
  assert.ok(!low.night && low.color[2] < low.color[0], 'sunset light is warm');
  for (const t of [0, 6, 12, 18, 24]) assert.ok(Math.abs(Math.hypot(...sunState(t).direction) - 1) < 1e-9);
});

test('post-processing plan: low quality renders directly; balanced only builds passes that are on', () => {
  const base = cleanSettings({});
  assert.equal(postPlan({ ...base, quality: 'low', bloom: 2 }).composer, false);
  assert.equal(postPlan({ ...base, quality: 'balanced' }).composer, false);
  assert.deepEqual(postPlan({ ...base, quality: 'balanced', bloom: .5 }), { ao: false, dof: false, bloom: true, grade: false, composer: true });
  assert.equal(postPlan({ ...base, quality: 'balanced', dof: .5 }).dof, false, 'depth of field is high quality only');
  assert.equal(postPlan({ ...base, quality: 'high', dof: .5 }).dof, true);
  assert.equal(postPlan({ ...base, quality: 'balanced', warmth: .2 }).grade, true);
});

test('three.js Sky shader still has the line the sky exposure patch replaces', async () => {
  const sky = readFileSync(new URL('../node_modules/three/examples/jsm/objects/Sky.js', import.meta.url), 'utf8');
  const atmosphere = readFileSync(new URL('../engine/runtime/atmosphere.mjs', import.meta.url), 'utf8');
  const marker = /SKY_MARKER='([^']+)'/.exec(atmosphere)[1];
  assert.ok(sky.includes(marker), 'Sky shader changed; update addSkyExposure in engine/runtime/atmosphere.mjs');
  assert.ok(sky.includes('varying vec3 vWorldPosition;'), 'star field reads vWorldPosition');
  for (const uniform of ['cloudCoverage', 'cloudDensity', 'turbidity', 'mieDirectionalG', 'sunPosition']) assert.ok(sky.includes(`'${uniform}'`), uniform);
});
