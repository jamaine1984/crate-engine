import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const engine = await readFile(new URL('../engine.mjs', import.meta.url), 'utf8');
const scripts = await readFile(new URL('../user-scripts.mjs', import.meta.url), 'utf8');
const settings = await readFile(new URL('../ai-settings-ui.mjs', import.meta.url), 'utf8');
const auth = await readFile(new URL('../auth.mjs', import.meta.url), 'utf8');
const hostile = '"><img src=x onerror="globalThis.executed=true"></textarea><script>globalThis.executed=true</script>';

// Track the browser sinks directly: attacker strings must never reach innerHTML.
// The controls use DOM value/textContent properties; no third-party DOM package is needed.
function domFixture(storage = {}) {
  const markup = [], elements = [], ids = new Map(), values = new Map(Object.entries(storage));
  class Element {
    constructor(tag) { this.tagName = tag; this.style = {}; this.children = []; this.value = ''; this.textContent = ''; this.parent = null; elements.push(this); }
    set innerHTML(value) {
      this.html = String(value); markup.push(this.html);
      for (const match of this.html.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]+)"/gi)) {
        const el = new Element(match[1]); el.id = match[2]; el.parent = this; this.children.push(el); ids.set(el.id, el);
      }
    }
    get innerHTML() { return this.html || ''; }
    querySelector(selector) { return ids.get(selector.slice(1)) || null; }
    appendChild(el) { this.children.push(el); el.parent = this; if (el.id) ids.set(el.id, el); return el; }
    append(...els) { for (const el of els) this.appendChild(el); }
    addEventListener() {}
    setAttribute(name, value) { this[name] = value; }
    remove() { this.removed = true; if (this.id) ids.delete(this.id); }
    focus() {}
  }
  const document = { createElement: tag => new Element(tag), getElementById: id => ids.get(id) || null, addEventListener() {} };
  document.body = new Element('body');
  const context = vm.createContext({ document, window: { addEventListener() {} }, console: { log() {}, warn() {}, error() {} },
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    performance: { now: () => 0 }, setTimeout() {}, setInterval() {}, clearTimeout() {}, clearInterval() {},
    fetch: async () => ({ ok: true, json: async () => ({ models: [] }) }) });
  return { context, ids, elements, markup, values, document };
}
function loadModule(source, names, fixture) {
  vm.runInContext(source.replace(/^export /gm, '') + '\nglobalThis.moduleApi = {' + names.join(',') + '};', fixture.context);
  return fixture.context.moduleApi;
}
function engineFunction(start, end, context) {
  const a = engine.indexOf(start), b = engine.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a);
  return vm.runInNewContext(engine.slice(a, b) + '\n' + start.match(/function\s+(\w+)/)[1], context);
}

test('restored, installed and manually requested scripts cannot execute on the account origin', () => {
  const fixture = domFixture({ 'crate-user-scripts': JSON.stringify([{ id: 'saved', name: 'Source', code: 'globalThis.executed=true', enabled: true }]) });
  const api = loadModule(scripts, ['initializeUserScripts', 'installUserScript', 'runUserScript', 'updateUserScripts'], fixture);
  const restored = api.initializeUserScripts();
  assert.equal(restored[0].enabled, false);
  const installed = api.installUserScript({ id: 'imported', code: 'globalThis.executed=true', enabled: true });
  assert.equal(installed._running, false);
  let callbackRan = false;
  installed._onUpdate = () => { callbackRan = true; };
  assert.equal(api.runUserScript(installed), false);
  api.updateUserScripts(1);
  assert.equal(callbackRan, false);
  assert.equal(fixture.context.executed, undefined);
  assert.doesNotMatch(scripts, /new\s+Function\b|\beval\s*\(/);
});

test('script editor preserves hostile source as control values, never markup', () => {
  const fixture = domFixture();
  const api = loadModule(scripts, ['showScriptEditor'], fixture);
  api.showScriptEditor({ id: hostile, name: hostile, code: hostile, description: hostile });
  assert.equal(fixture.ids.get('script-name').value, hostile);
  assert.equal(fixture.ids.get('script-code').value, hostile);
  assert.equal(fixture.ids.get('script-prompt').value, hostile);
  assert.ok(fixture.markup.every(html => !html.includes(hostile)));
  fixture.ids.get('script-save').onclick();
  const saved = JSON.parse(fixture.values.get('crate-user-scripts'))[0];
  assert.equal(saved.code, hostile);
  assert.equal(saved.enabled, false);
});

test('script manager renders hostile names as text and keeps IDs out of markup', () => {
  const fixture = domFixture({ 'crate-user-scripts': JSON.stringify([{ id: hostile, name: hostile, code: hostile, enabled: true }]) });
  const api = loadModule(scripts, ['showScriptManager'], fixture);
  api.showScriptManager();
  assert.ok(fixture.elements.some(el => el.textContent === hostile));
  assert.ok(fixture.markup.every(html => !html.includes(hostile)));
  const edit = fixture.elements.find(el => el.className === 'script-edit');
  edit.onclick();
  assert.equal(fixture.ids.get('script-code').value, hostile);
});

test('AI model/key values and provider errors never become HTML', async () => {
  const fixture = domFixture();
  const api = loadModule(settings, ['setAiSettingsUiContext', 'showAISettingsModal', 'showMeshyKeyModal'], fixture);
  api.setAiSettingsUiContext({ getUserAIConfig: () => ({ provider: 'ollama', apiKey: hostile, model: hostile }), getMeshyApiKey: () => hostile });
  api.showAISettingsModal();
  assert.equal(fixture.ids.get('ai-model').value, hostile);
  assert.equal(fixture.ids.get('ai-apikey').value, hostile);
  fixture.ids.get('ai-provider').value = 'ollama';
  await fixture.ids.get('ai-test-btn').onclick();
  assert.ok(fixture.ids.get('ai-status').textContent.includes(hostile));
  api.showMeshyKeyModal();
  assert.equal(fixture.ids.get('meshy-key-input').value, hostile);
  fixture.context.fetch = async () => ({ ok: false, json: async () => ({ message: hostile }) });
  await fixture.ids.get('meshy-test-btn').onclick();
  assert.equal(fixture.ids.get('meshy-key-status').textContent, hostile);
  assert.ok(fixture.markup.every(html => !html.includes(hostile)));
});

test('legacy direct publishing rejects without contacting a service', async () => {
  const fn = engineFunction('async function syncPublishedGameToCloudflare(gameData) {', 'async function deletePublishedGameFromCloudflare', {
    fetch() { assert.fail('Direct publication must not make a request'); }
  });
  await assert.rejects(fn({ title: 'Draft' }), /developer dashboard.*review/);
  assert.doesNotMatch(engine, /fetch\(['"]\/api\/games\/publish/);
  assert.doesNotMatch(engine + auth, /buy\.stripe\.com|checkout\.stripe\.com/);
});

test('publishing saves an exact v3 local project draft without public assets or links', async () => {
  const project = { format: 'crate-engine-project', version: 3, objects: [{ id: 'character', components: { collectible: { value: 2 } } }], commands: ['add cube'], userScripts: [{ code: hostile }] };
  const data = JSON.stringify(project), values = new Map();
  const window = { _saveCloudCrateProject: async () => undefined };
  const fn = engineFunction('async function publishSceneToLocalLibrary(options) {', 'function showPublishedGamesLibrary() {', {
    serializeScene: () => data, CRATE_PROJECT_FORMAT: 'crate-engine-project', CRATE_PROJECT_VERSION: 3,
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }, window,
    logOutput() {}, fetch() { assert.fail('Publishing draft cannot call a legacy service'); }
  });
  const draft = await fn({ title: hostile });
  assert.equal(draft.status, 'draft');
  assert.equal(draft.localSaved, true);
  assert.equal(draft.projectData, data);
  assert.equal(draft.cloudStatus, 'attempted');
  assert.equal(draft.shareUrl, undefined);
  assert.equal(draft.publishedAt, undefined);
  const saves = JSON.parse(values.get('crate-saves'));
  assert.equal(saves[0].data, data);
  assert.ok(!saves[0].name.includes(hostile));
  assert.equal(values.has('crate_published_games'), false);
  assert.match(engine, /const CRATE_PROJECT_VERSION = 3;/);
  assert.match(engine, /import\('\.\/platform\/engine\/cloud-projects\.mjs'\)/);
});

test('a failed local backup prevents the publishing workflow from proceeding', async () => {
  let cloudCalled = false;
  const fn = engineFunction('async function publishSceneToLocalLibrary(options) {', 'function showPublishedGamesLibrary() {', {
    serializeScene: () => '{"format":"crate-engine-project","version":3}', CRATE_PROJECT_FORMAT: 'crate-engine-project', CRATE_PROJECT_VERSION: 3,
    localStorage: { getItem: () => null, setItem() { throw new Error('Storage quota exceeded'); } },
    window: { _saveCloudCrateProject: async () => { cloudCalled = true; } }, logOutput() {}
  });
  await assert.rejects(fn(), /Storage quota/);
  assert.equal(cloudCalled, false);
});
