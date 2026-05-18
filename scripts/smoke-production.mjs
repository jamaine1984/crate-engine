import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');

const baseUrl = normalizeBaseUrl(process.env.CRATE_SMOKE_BASE_URL || 'https://crateshipgames.com');
const forcedAssetBaseUrl = normalizeBaseUrl(process.env.CRATE_SMOKE_ASSET_BASE_URL || '');
const verify = process.env.CRATE_SMOKE_VERIFY || Date.now().toString(36);
const playUrl = `${baseUrl}/play?verify=${encodeURIComponent(verify)}`;
const timeoutMs = parseInt(process.env.CRATE_SMOKE_TIMEOUT_MS || '120000', 10);
const headless = process.env.CRATE_SMOKE_HEADLESS !== 'false';
const screenshotDir = path.resolve(process.env.CRATE_SMOKE_SCREENSHOT_DIR || path.join(rootDir, 'output', 'playwright'));
const screenshotPath = path.join(screenshotDir, `production-smoke-${verify}.png`);

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

function extractMetaContent(html, names) {
  for (const name of names) {
    const direct = html.match(new RegExp(`<meta\\s+[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i'))?.[1];
    if (direct) return direct;
    const reversed = html.match(new RegExp(`<meta\\s+[^>]*content=["']([^"']+)["'][^>]*name=["']${name}["'][^>]*>`, 'i'))?.[1];
    if (reversed) return reversed;
  }
  return '';
}

function resolveChromeExecutable() {
  if (process.env.CRATE_SMOKE_CHROME_PATH) return process.env.CRATE_SMOKE_CHROME_PATH;

  const candidates = [];
  if (process.platform === 'win32') {
    candidates.push(
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    );
  } else {
    candidates.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser');
  }

  return candidates.find((candidate) => candidate && existsSync(candidate));
}

async function checkHttp(pathname, expectedStatus, expectedTypeIncludes = '', origin = baseUrl) {
  const url = new URL(pathname, origin).href;
  const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  const contentType = response.headers.get('content-type') || '';

  if (response.status !== expectedStatus) {
    throw new Error(`${url} expected HTTP ${expectedStatus}, got ${response.status}`);
  }

  if (expectedTypeIncludes && !contentType.toLowerCase().includes(expectedTypeIncludes.toLowerCase())) {
    throw new Error(`${url} expected content-type containing "${expectedTypeIncludes}", got "${contentType || 'missing'}"`);
  }

  return { url, status: response.status, contentType };
}

async function checkAssetManifest(origin) {
  const url = new URL('/asset-manifest.json', origin).href;
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`${url} expected HTTP 200, got ${response.status}`);
  }

  const manifest = await response.json();
  if (manifest?.name !== 'crateship-games-assets') {
    throw new Error(`${url} has unexpected name "${manifest?.name || 'missing'}"`);
  }
  if (!manifest.version) {
    throw new Error(`${url} is missing version`);
  }
  if (!manifest.paths?.models || !manifest.paths?.textures) {
    throw new Error(`${url} is missing model/texture paths`);
  }

  return { url, manifest };
}

async function checkPlayHtml() {
  const response = await fetch(playUrl, { redirect: 'follow' });
  const body = await response.text();
  if (!response.ok) throw new Error(`${playUrl} expected HTTP 200, got ${response.status}`);

  const bundle = body.match(/\/assets\/play-[^"']+\.js/)?.[0];
  if (!bundle) throw new Error(`${playUrl} did not reference a hashed play bundle`);

  const assetBaseUrl = forcedAssetBaseUrl || normalizeBaseUrl(extractMetaContent(body, ['crate-asset-base', 'crateship-asset-base'])) || baseUrl;
  return { status: response.status, bundle, assetBaseUrl };
}

function summarizeConsoleMessage(message) {
  return `${message.type()}: ${message.text()}`;
}

async function runBrowserSmoke() {
  const executablePath = resolveChromeExecutable();
  const browser = await chromium.launch({
    headless,
    executablePath,
    channel: executablePath ? undefined : 'chrome',
    args: [
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  const badConsole = [];
  const pageErrors = [];
  const badAssetResponses = [];

  try {
    const context = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      deviceScaleFactor: 1,
    });

    if (forcedAssetBaseUrl) {
      await context.addInitScript((assetBaseUrl) => {
        window.CRATESHIP_ASSET_BASE_URL = assetBaseUrl;
        try {
          window.localStorage.setItem('crate_asset_base_url', assetBaseUrl);
        } catch {}
      }, forcedAssetBaseUrl);
    }

    const page = await context.newPage();

    page.on('console', (message) => {
      const text = summarizeConsoleMessage(message);
      if (
        message.type() === 'error' ||
        /RGBELoader|Couldn't load texture|Error creating WebGL|Engine error|ReferenceError|TypeError|SyntaxError/i.test(text)
      ) {
        badConsole.push(text);
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
    page.on('response', (response) => {
      const url = response.url();
      if ((url.includes('/models/') || url.includes('/textures/')) && response.status() >= 400) {
        badAssetResponses.push(`${response.status()} ${url}`);
      }
    });

    await page.goto(playUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForFunction(
      () => window._engineReady === true && window._engineBridge && window._crateAssetUrl && document.querySelector('#game-builder-panel'),
      undefined,
      { timeout: timeoutMs }
    );

    await page.waitForSelector('#prompt-input', { timeout: timeoutMs });
    await page.waitForSelector('#gb-inspector', { timeout: timeoutMs });
    await page.waitForSelector('#gb-blueprints', { timeout: timeoutMs });
    await page.waitForSelector('[data-gb-mode="edit"]', { timeout: timeoutMs });
    await page.waitForSelector('#gb-project button[data-gb-action="save"]', { timeout: timeoutMs });

    const projectControls = await page.evaluate(() => ({
      hasProject: !!document.querySelector('#gb-project'),
      actions: [...document.querySelectorAll('#gb-project button[data-gb-action]')].map((button) => button.dataset.gbAction),
      status: document.querySelector('#gb-project-status')?.textContent || '',
    }));
    for (const action of ['save', 'load', 'import', 'export', 'share', 'settings']) {
      if (!projectControls.actions.includes(action)) {
        throw new Error(`Project controls missing ${action}: ${JSON.stringify(projectControls)}`);
      }
    }

    await page.locator('#gb-project button[data-gb-action="save"]').click({ timeout: timeoutMs });
    await page.waitForSelector('#sl-modal #sl-save-btn', { timeout: timeoutMs });
    await page.locator('#sl-close').click({ timeout: timeoutMs });

    await page.locator('#gb-project button[data-gb-action="import"]').click({ timeout: timeoutMs });
    await page.waitForSelector('#ie-modal #ie-import-glb', { timeout: timeoutMs });
    await page.waitForSelector('#ie-modal #ie-import-crate', { timeout: timeoutMs });
    await page.locator('#ie-close').click({ timeout: timeoutMs });

    await page.locator('#gb-project button[data-gb-action="export"]').click({ timeout: timeoutMs });
    await page.waitForSelector('#ie-modal #ie-export-crate', { timeout: timeoutMs });
    await page.waitForSelector('#ie-modal #ie-export-html', { timeout: timeoutMs });
    await page.locator('#ie-close').click({ timeout: timeoutMs });

    const catalogState = await page.evaluate(async () => {
      const catalog = await window._engineBridge?.loadAssetCatalog?.();
      const items = Object.values(catalog || {}).flat().filter((item) => item && typeof item === 'object');
      const refs = items.map((item) => String(item.path || item.file || ''));
      return {
        hiddenUnavailable: window._assetCatalogHiddenUnavailable || 0,
        itemCount: items.length,
        furnitureCount: catalog?.furniture?.length || 0,
        hasTmpReference: refs.some((ref) => /\.tmp$/i.test(ref) || /\.glb\.tmp$/i.test(ref)),
        unresolvedDuplicatedKenneyPath: refs.some((ref) => /kenney_cars\/kenney_cars\//i.test(ref) && !/models\/catalog\.json/i.test(ref)),
      };
    });
    if (catalogState.hasTmpReference) throw new Error('Asset catalog still exposes .tmp references');

    await page.locator('button.gb-preset', { hasText: 'Inventory' }).click({ timeout: timeoutMs });
    await page.waitForFunction(() => Array.isArray(window._userScripts) && window._userScripts.length >= 1, undefined, { timeout: timeoutMs });

    const beforeFurnitureCount = await page.evaluate(() => window._engineBridge?.objects?.length || 0);
    await page.evaluate(() => window._runCommand?.('add chair'));
    await page.waitForFunction(
      (before) => (window._engineBridge?.objects?.length || 0) > before,
      beforeFurnitureCount,
      { timeout: timeoutMs }
    );
    await page.waitForSelector('#gb-placement-status', { timeout: timeoutMs });

    const beforePlacementCount = await page.evaluate(() => window._engineBridge?.objects?.length || 0);
    await page.evaluate(() => window._placeCatalogAsset?.({
      file: 'house_interior_pack_chair_1.glb',
      name: 'Smoke placement chair',
      path: '/models/house_interior_pack_chair_1.glb',
    }, 'production-smoke'));
    await page.waitForFunction(
      (before) => {
        const state = window._lastAssetPlacement || {};
        return (window._engineBridge?.objects?.length || 0) > before &&
          state.status === 'placed' &&
          state.source === 'production-smoke' &&
          !!state.objectId &&
          document.querySelector('#gb-placement-status')?.dataset.status === 'placed';
      },
      beforePlacementCount,
      { timeout: timeoutMs }
    );
    const placementState = await page.evaluate(() => {
      const selected = window._engineBridge?.getSelected?.() || null;
      const state = window._lastAssetPlacement || {};
      return {
        ...state,
        mode: window._currentMode || '',
        selectedId: selected?.uuid || '',
        statusText: document.querySelector('#gb-placement-status')?.textContent?.trim() || '',
      };
    });
    if (placementState.mode !== 'edit') {
      throw new Error(`Asset placement did not stay in Edit mode: ${JSON.stringify(placementState)}`);
    }
    if (placementState.selectedId !== placementState.objectId) {
      throw new Error(`Placed asset was not selected: ${JSON.stringify(placementState)}`);
    }
    if (!/Smoke placement chair/i.test(placementState.statusText)) {
      throw new Error(`Placement status did not name the placed asset: ${JSON.stringify(placementState)}`);
    }

    const input = page.locator('#prompt-input');
    await input.fill('build city', { timeout: timeoutMs });
    await input.press('Enter', { timeout: timeoutMs });

    await page.waitForFunction(
      () => (window._engineBridge?.objects?.length || window._sceneObjects?.length || 0) >= 100,
      undefined,
      { timeout: timeoutMs }
    );
    await page.waitForSelector('#gb-scene-list .gb-scene-row', { timeout: timeoutMs });

    await page.locator('#gb-scene-list .gb-scene-row .gb-scene-main').first().click({ timeout: timeoutMs });
    await page.locator('button[data-gb-component="pickup"]').click({ timeout: timeoutMs });
    await page.waitForFunction(
      () => {
        const selected = window._engineBridge?.getSelected?.() || window._lastPlacedObj;
        return !!selected?.userData?.gbComponents?.pickup;
      },
      undefined,
      { timeout: timeoutMs }
    );

    await page.locator('#gb-project button[data-gb-action="save"]').click({ timeout: timeoutMs });
    await page.waitForSelector('#sl-modal #sl-save-btn', { timeout: timeoutMs });
    await page.locator('#sl-name').fill('Production Smoke Project', { timeout: timeoutMs });
    await page.locator('#sl-save-btn').click({ timeout: timeoutMs });
    const savedProjectState = await page.waitForFunction(
      () => {
        const saves = JSON.parse(localStorage.getItem('crate-saves') || '[]');
        const save = saves.find((item) => item?.name === 'Production Smoke Project');
        if (!save?.data) return null;
        const parsed = JSON.parse(save.data);
        const hasPickup = Array.isArray(parsed.objects) && parsed.objects.some((obj) => obj?.components?.pickup);
        const hasAssetPath = Array.isArray(parsed.objects) && parsed.objects.some((obj) => obj?.assetPath);
        const hasScripts = Array.isArray(parsed.userScripts) && parsed.userScripts.length >= 1;
        const commands = Array.isArray(parsed.commands) ? parsed.commands : [];
        const hasBuildCityCommand = commands.some((cmd) => /^(?:build (?:a |the )?(?:city|full city|the city)|generate city|city world|new city)$/i.test(String(cmd || '').trim()));
        if (parsed.version !== 3 || !hasPickup || !hasAssetPath || !hasScripts || !hasBuildCityCommand) return null;
        return {
          version: parsed.version,
          objectCount: parsed.objects.length,
          scriptCount: parsed.userScripts.length,
          commandCount: commands.length,
          hasBuildCityCommand,
          hasPickup,
          hasAssetPath,
        };
      },
      undefined,
      { timeout: timeoutMs }
    ).then((handle) => handle.jsonValue());
    await page.waitForFunction(
      () => /saved project/i.test(document.querySelector('#gb-project-status')?.textContent || ''),
      undefined,
      { timeout: timeoutMs }
    );
    await page.locator('#sl-close').click({ timeout: timeoutMs });

    await page.evaluate(() => {
      const saves = JSON.parse(localStorage.getItem('crate-saves') || '[]');
      const index = saves.findIndex((item) => item?.name === 'Production Smoke Project');
      if (index < 0) throw new Error('Saved project was not found for load test');
      window._loadSaveSlot?.(index);
    });
    const loadedProjectState = await page.waitForFunction(
      (saved) => {
        const load = window._lastProjectLoad || {};
        const objects = window._engineBridge?.objects || window._sceneObjects || [];
        const scripts = Array.isArray(window._userScripts) ? window._userScripts.length : 0;
        const pickupObj = objects.find((obj) => obj?.userData?.gbComponents?.pickup);
        if (load.status !== 'loaded' || objects.length < 100 || scripts < saved.scriptCount || !pickupObj) return null;
        return {
          status: load.status,
          objectCount: objects.length,
          scriptCount: scripts,
          pickupId: pickupObj.uuid || '',
          spawned: load.snapshot?.spawned || 0,
          applied: load.snapshot?.applied || 0,
          expected: load.snapshot?.expected || 0,
        };
      },
      savedProjectState,
      { timeout: timeoutMs }
    ).then((handle) => handle.jsonValue());
    await page.evaluate(() => {
      const objects = window._engineBridge?.objects || window._sceneObjects || [];
      const pickupObj = objects.find((obj) => obj?.userData?.gbComponents?.pickup);
      if (pickupObj) window._engineBridge?.selectObject?.(pickupObj);
    });
    await page.waitForFunction(
      () => !!window._engineBridge?.getSelected?.()?.userData?.gbComponents?.pickup,
      undefined,
      { timeout: timeoutMs }
    );

    await page.evaluate(() => window._setMode?.('explore'));
    await page.waitForFunction(
      () => window._currentMode === 'explore' && window._playMode !== true,
      undefined,
      { timeout: timeoutMs }
    );
    const beforeReadOnly = await page.evaluate(() => {
      const selected = window._engineBridge?.getSelected?.() || window._lastPlacedObj || null;
      return {
        objectCount: window._engineBridge?.objects?.length || 0,
        selectedId: selected?.uuid || '',
        componentCount: Object.keys(selected?.userData?.gbComponents || {}).length,
      };
    });
    const editLockState = await page.evaluate(() => ({
      panelEditMode: document.querySelector('#game-builder-panel')?.dataset.editMode || '',
      pickupDisabled: document.querySelector('button[data-gb-component="pickup"]')?.disabled === true,
      sceneSelectDisabled: document.querySelector('#gb-scene-list .gb-scene-row .gb-scene-main')?.disabled === true,
      transformDisabled: document.querySelector('#gb-inspector input[type="number"]')?.disabled === true,
      cloneDisabled: [...document.querySelectorAll('.gb-small-btn')].some((button) => button.textContent === 'Clone' && button.disabled),
      presetDisabled: [...document.querySelectorAll('button.gb-preset')].some((button) => button.textContent === 'Inventory' && button.disabled),
      projectImportDisabled: document.querySelector('#gb-project button[data-gb-action="import"]')?.disabled === true,
      projectExportDisabled: document.querySelector('#gb-project button[data-gb-action="export"]')?.disabled === true,
      readOnlyNote: document.querySelector('#gb-inspector .gb-readonly-note')?.textContent || '',
    }));
    if (editLockState.panelEditMode !== 'false' ||
        !editLockState.pickupDisabled ||
        !editLockState.sceneSelectDisabled ||
        !editLockState.transformDisabled ||
        !editLockState.cloneDisabled ||
        !editLockState.presetDisabled ||
        !editLockState.projectImportDisabled ||
        editLockState.projectExportDisabled ||
        !/Read-only/i.test(editLockState.readOnlyNote)) {
      throw new Error(`Explore mode did not lock editor controls: ${JSON.stringify(editLockState)}`);
    }
    await page.evaluate(() => {
      document.querySelector('button[data-gb-component="damage"]')?.click();
      document.querySelector('#gb-scene-list .gb-scene-row .gb-scene-main')?.click();
      [...document.querySelectorAll('.gb-small-btn')].find((button) => button.textContent === 'Clone')?.click();
    });
    const afterReadOnlyClick = await page.evaluate(() => {
      const selected = window._engineBridge?.getSelected?.() || window._lastPlacedObj || null;
      return {
        objectCount: window._engineBridge?.objects?.length || 0,
        selectedId: selected?.uuid || '',
        componentCount: Object.keys(selected?.userData?.gbComponents || {}).length,
      };
    });
    if (afterReadOnlyClick.objectCount !== beforeReadOnly.objectCount ||
        afterReadOnlyClick.selectedId !== beforeReadOnly.selectedId ||
        afterReadOnlyClick.componentCount !== beforeReadOnly.componentCount) {
      throw new Error(`Read-only editor controls mutated scene in Explore mode: ${JSON.stringify({ beforeReadOnly, afterReadOnlyClick })}`);
    }
    await page.mouse.click(680, 470);
    const exploreState = await page.evaluate(() => ({
      mode: window._currentMode,
      playMode: window._playMode === true,
      legacyInspectorDisplay: document.querySelector('#inspector')?.style.display || '',
      selectedModeButton: document.querySelector('[data-gb-mode="explore"]')?.dataset.selected || '',
    }));
    if (exploreState.legacyInspectorDisplay === 'flex') {
      throw new Error('Explore mode canvas click opened the object inspector');
    }
    if (exploreState.selectedModeButton !== 'true') {
      throw new Error('Explore mode button did not reflect the active mode');
    }

    await page.locator('[data-gb-mode="play"]').click({ timeout: timeoutMs });
    await page.waitForFunction(
      () => window._currentMode === 'play' && window._playMode === true,
      undefined,
      { timeout: timeoutMs }
    );
    const playState = await page.evaluate(() => ({
      mode: window._currentMode,
      playMode: window._playMode === true,
      builderDisplay: document.querySelector('#game-builder-panel')?.style.display || '',
      builderPlayHidden: document.querySelector('#game-builder-panel')?.dataset.playHidden || '',
      browserDisplay: document.querySelector('#model-browser-button')?.style.display || '',
      browserPlayHidden: document.querySelector('#model-browser-button')?.dataset.playHidden || '',
      promptDisplay: document.querySelector('#prompt-input')?.parentElement?.style.display || '',
      legacyInspectorDisplay: document.querySelector('#inspector')?.style.display || '',
    }));
    if (playState.builderDisplay !== 'none' || playState.builderPlayHidden !== 'true') {
      throw new Error(`Play mode did not hide Game Builder: ${JSON.stringify(playState)}`);
    }
    if (playState.promptDisplay !== 'none') {
      throw new Error(`Play mode did not hide prompt input: ${JSON.stringify(playState)}`);
    }
    if (playState.browserDisplay !== 'none' || playState.browserPlayHidden !== 'true') {
      throw new Error(`Play mode did not hide model browser: ${JSON.stringify(playState)}`);
    }
    if (playState.legacyInspectorDisplay === 'flex') {
      throw new Error('Play mode left the legacy object inspector visible');
    }

    await page.evaluate(() => window._setMode?.('edit'));
    await page.waitForFunction(
      () => window._currentMode === 'edit' &&
        window._playMode !== true &&
        document.querySelector('[data-gb-mode="edit"]')?.dataset.selected === 'true' &&
        document.querySelector('#game-builder-panel')?.dataset.editMode === 'true' &&
        document.querySelector('button[data-gb-component="pickup"]')?.disabled === false &&
        document.querySelector('#game-builder-panel')?.style.display !== 'none' &&
        document.querySelector('#model-browser-button')?.style.display !== 'none',
      undefined,
      { timeout: timeoutMs }
    );

    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const state = await page.evaluate(() => {
      const objects = window._engineBridge?.objects || window._sceneObjects || [];
      const selected = window._engineBridge?.getSelected?.() || window._lastPlacedObj || null;
      return {
        engineReady: window._engineReady === true,
        hasAssetResolver: typeof window._crateAssetUrl === 'function',
        assetBaseUrl: typeof window._crateAssetBaseUrl === 'function' ? window._crateAssetBaseUrl() : '',
        objectCount: objects.length,
        sceneRows: document.querySelectorAll('#gb-scene-list .gb-scene-row').length,
        stats: document.querySelector('#gb-stats')?.textContent?.trim() || '',
        hasInspector: !!document.querySelector('#gb-inspector'),
        hasBlueprints: !!document.querySelector('#gb-blueprints'),
        hasProject: !!document.querySelector('#gb-project'),
        projectSaveCount: JSON.parse(localStorage.getItem('crate-saves') || '[]').length,
        mode: window._currentMode || '',
        hasModeButtons: document.querySelectorAll('[data-gb-mode]').length >= 3,
        hiddenUnavailableAssets: window._assetCatalogHiddenUnavailable || 0,
        placementStatus: window._lastAssetPlacement?.status || '',
        placementSource: window._lastAssetPlacement?.source || '',
        scriptCount: Array.isArray(window._userScripts) ? window._userScripts.length : 0,
        selectedComponents: Object.keys(selected?.userData?.gbComponents || {}),
      };
    });
    state.savedProjectVersion = savedProjectState.version;
    state.savedProjectObjectCount = savedProjectState.objectCount;
    state.savedProjectScriptCount = savedProjectState.scriptCount;
    state.savedProjectCommandCount = savedProjectState.commandCount;
    state.savedProjectHasBuildCityCommand = savedProjectState.hasBuildCityCommand;
    state.loadedProjectObjectCount = loadedProjectState.objectCount;
    state.loadedProjectScriptCount = loadedProjectState.scriptCount;
    state.loadedProjectPickupId = loadedProjectState.pickupId;
    state.loadedProjectSpawned = loadedProjectState.spawned;
    state.loadedProjectApplied = loadedProjectState.applied;

    if (pageErrors.length) throw new Error(`Page errors:\n${pageErrors.join('\n')}`);
    if (badAssetResponses.length) throw new Error(`Bad model/texture responses:\n${badAssetResponses.join('\n')}`);
    if (badConsole.length) throw new Error(`Console smoke failures:\n${badConsole.join('\n')}`);
    if (!state.hasAssetResolver) throw new Error('window._crateAssetUrl was not available');
    if (forcedAssetBaseUrl && state.assetBaseUrl !== forcedAssetBaseUrl) {
      throw new Error(`Expected browser asset base ${forcedAssetBaseUrl}, got ${state.assetBaseUrl || 'empty'}`);
    }
    if (!state.hasInspector || !state.hasBlueprints || !state.hasProject) throw new Error('Game Builder Project, Inspector, or Blueprints section was missing');
    if (state.projectSaveCount < 1) throw new Error('Project save workflow did not create a saved project');
    if (state.savedProjectVersion !== 3 || state.savedProjectObjectCount < 100 || state.savedProjectScriptCount < 1 || !state.savedProjectHasBuildCityCommand) {
      throw new Error(`Project save did not capture rich scene state: ${JSON.stringify(state)}`);
    }
    if (state.loadedProjectObjectCount < 100 || state.loadedProjectScriptCount < state.savedProjectScriptCount || state.loadedProjectApplied < 1 || !state.loadedProjectPickupId) {
      throw new Error(`Project load did not restore rich scene state: ${JSON.stringify(state)}`);
    }
    if (!state.hasModeButtons) throw new Error('Game Builder mode buttons were missing');
    if (state.mode !== 'edit') throw new Error(`Expected smoke to finish in edit mode, got ${state.mode || 'empty'}`);
    if (state.placementStatus !== 'placed' || state.placementSource !== 'production-smoke') {
      throw new Error(`Expected placement smoke to finish as placed, got ${state.placementStatus || 'empty'} from ${state.placementSource || 'empty'}`);
    }
    if (catalogState.itemCount < 1000 || catalogState.furnitureCount < 100) {
      throw new Error(`Asset catalog looks too small after filtering: ${JSON.stringify(catalogState)}`);
    }
    if (state.objectCount < 100) throw new Error(`Expected build city to create at least 100 objects, got ${state.objectCount}`);
    if (state.sceneRows < 1) throw new Error('Game Builder Scene list did not populate after build city');
    if (!state.selectedComponents.includes('pickup')) throw new Error('Pickup component was not applied to the selected object');

    return state;
  } finally {
    await browser.close();
  }
}

const play = await checkPlayHtml();
const assetBaseUrl = play.assetBaseUrl;
const assetManifest = await checkAssetManifest(assetBaseUrl);
const httpChecks = [
  await checkHttp('/asset-manifest.json', 200, 'application/json', assetBaseUrl),
  await checkHttp('/models/kenney_cars/sedan.glb', 200, 'model/gltf-binary', assetBaseUrl),
  await checkHttp('/models/house_interior_pack_chair_1.glb', 200, 'model/gltf-binary', assetBaseUrl),
  await checkHttp('/models/fab/street_props_streeprops.glb', 200, 'model/gltf-binary', assetBaseUrl),
  await checkHttp('/models/modular_street_seating.bin', 200, 'application/octet-stream', assetBaseUrl),
  await checkHttp('/textures/modular_street_seating_armrests_diff_1k.jpg', 200, 'image/jpeg', assetBaseUrl),
  await checkHttp('/models/__definitely_missing__.glb', 404, '', assetBaseUrl),
];
const browserState = await runBrowserSmoke();

console.log('Production smoke passed.');
console.log(`URL: ${playUrl}`);
console.log(`Bundle: ${play.bundle}`);
console.log(`Asset base: ${assetBaseUrl}`);
console.log(`Asset manifest: ${assetManifest.manifest.version}`);
console.log(`Objects: ${browserState.objectCount}`);
console.log(`Scene rows: ${browserState.sceneRows}`);
console.log(`Stats: ${browserState.stats}`);
console.log(`Mode: ${browserState.mode}`);
console.log(`Hidden unavailable assets: ${browserState.hiddenUnavailableAssets}`);
console.log(`Placement: ${browserState.placementStatus} (${browserState.placementSource})`);
console.log(`Scripts: ${browserState.scriptCount}`);
console.log(`Project saves: ${browserState.projectSaveCount}`);
console.log(`Project snapshot: v${browserState.savedProjectVersion} ${browserState.savedProjectObjectCount} objects ${browserState.savedProjectScriptCount} scripts ${browserState.savedProjectCommandCount} commands`);
console.log(`Project load: ${browserState.loadedProjectObjectCount} objects ${browserState.loadedProjectScriptCount} scripts (${browserState.loadedProjectApplied} applied, ${browserState.loadedProjectSpawned} spawned, pickup ${browserState.loadedProjectPickupId || 'missing'})`);
console.log(`Selected components: ${browserState.selectedComponents.join(', ')}`);
console.log(`Screenshot: ${screenshotPath}`);
console.log('HTTP checks:');
for (const check of httpChecks) {
  console.log(`- ${check.status} ${check.url} ${check.contentType}`);
}
