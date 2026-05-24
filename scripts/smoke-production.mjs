import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
const viewportProbeEnabled = process.env.CRATE_SMOKE_VIEWPORT_PROBES !== 'false';
const screenshotDir = path.resolve(process.env.CRATE_SMOKE_SCREENSHOT_DIR || path.join(rootDir, 'output', 'playwright'));
const screenshotPath = path.join(screenshotDir, `production-smoke-${verify}.png`);
const smokeAdminToken = String(process.env.CRATE_SMOKE_ADMIN_TOKEN || '').trim();
const smokeRunId = createHash('sha1')
  .update([baseUrl, verify, process.pid, Date.now()].join('|'))
  .digest('hex')
  .slice(0, 10);
const smokePublishedSlug = `production-smoke-published-game-${smokeRunId}`;
const smokeDeleteGuardSlug = `production-smoke-delete-guard-game-${smokeRunId}`;
const smokeMetadataGuardSlug = `production-smoke-metadata-guard-game-${smokeRunId}`;
const smokeBrowserGlobals = {
  publishedSlug: smokePublishedSlug,
  deleteGuardSlug: smokeDeleteGuardSlug,
  metadataGuardSlug: smokeMetadataGuardSlug,
};

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

async function addSmokeGlobals(context) {
  await context.addInitScript((data) => {
    window.__CRATE_SMOKE = data;
  }, smokeBrowserGlobals);
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
      serviceWorkers: 'block',
    });
    await addSmokeGlobals(context);

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
    await page.waitForSelector('#gb-readiness', { timeout: timeoutMs });
    await page.waitForSelector('#gb-performance [data-gb-quality="medium"]', { timeout: timeoutMs });
    await page.waitForSelector('#gb-templates [data-gb-template="survival"]', { timeout: timeoutMs });
    await page.waitForSelector('#gb-systems', { timeout: timeoutMs });
    await page.waitForSelector('[data-gb-mode="edit"]', { timeout: timeoutMs });
    await page.waitForSelector('#gb-mode-dock [data-gb-mode="edit"]', { timeout: timeoutMs });
    await page.waitForSelector('.gb-mobile-quick-tools button[data-gb-action="assets"]', { timeout: timeoutMs });
    await page.waitForSelector('#gb-project button[data-gb-action="save"]', { timeout: timeoutMs });
    await page.waitForFunction(
      () => window._crateAssetManifest?.version && document.querySelector('#gb-asset-pack-status')?.dataset.status === 'loaded',
      undefined,
      { timeout: timeoutMs }
    );

    const modeChromeState = await page.evaluate(() => {
      const quick = document.querySelector('.gb-mobile-quick-tools');
      const quickButton = quick?.querySelector('button[data-gb-action="assets"]');
      const quickRect = quickButton?.getBoundingClientRect();
      return {
        viewButtons: [...document.querySelectorAll('[data-gb-mode="explore"]')].map((button) => button.textContent?.trim() || ''),
        quickDisplay: quick ? getComputedStyle(quick).display : '',
        quickButtonVisible: !!(quickRect && quickRect.width > 0 && quickRect.height > 0 && quickRect.top >= 0 && quickRect.bottom <= window.innerHeight),
      };
    });
    if (!modeChromeState.viewButtons.length ||
        modeChromeState.viewButtons.some((label) => label !== 'View') ||
        modeChromeState.quickDisplay === 'none' ||
        !modeChromeState.quickButtonVisible) {
      throw new Error(`Mode chrome or quick asset controls are not ready: ${JSON.stringify(modeChromeState)}`);
    }

    const clippedBuilderLabels = await page.evaluate(() => {
      const targets = [
        ...document.querySelectorAll('#gb-systems .gb-system-info span,#gb-systems .gb-system-info strong,#gb-systems .gb-system-badge'),
        ...document.querySelectorAll('#gb-templates .gb-template-info span,#gb-templates .gb-template-info strong'),
        ...document.querySelectorAll('#gb-performance .gb-quality-btn,#gb-quality-summary'),
        ...document.querySelectorAll('#gb-readiness-status strong,#gb-performance-status strong,#gb-validation-status strong'),
      ];
      return targets
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > 0 &&
            rect.top < window.innerHeight &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
        })
        .map((el) => ({
          text: (el.textContent || '').trim().slice(0, 90),
          className: String(el.className || ''),
          width: el.clientWidth,
          scrollWidth: el.scrollWidth,
          height: el.clientHeight,
          scrollHeight: el.scrollHeight,
        }))
        .slice(0, 8);
    });
    if (clippedBuilderLabels.length) {
      throw new Error(`Visible Game Builder labels are clipped: ${JSON.stringify(clippedBuilderLabels)}`);
    }

    const projectControls = await page.evaluate(() => ({
      hasProject: !!document.querySelector('#gb-project'),
      actions: [...document.querySelectorAll('#gb-project button[data-gb-action]')].map((button) => button.dataset.gbAction),
      status: document.querySelector('#gb-project-status')?.textContent || '',
    }));
    for (const action of ['save', 'load', 'import', 'export', 'published', 'share', 'settings']) {
      if (!projectControls.actions.includes(action)) {
        throw new Error(`Project controls missing ${action}: ${JSON.stringify(projectControls)}`);
      }
    }

    const builderHardeningState = await page.evaluate(async () => {
      const validator = typeof window._validateUserModelFile === 'function' ? window._validateUserModelFile : null;
      const modelInspector = typeof window._inspectUserModelFile === 'function' ? window._inspectUserModelFile : null;
      const projectValidator = typeof window._validateCrateProjectData === 'function' ? window._validateCrateProjectData : null;
      const lightGltf = {
        asset: { version: '2.0' },
        accessors: [{ count: 3000 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        nodes: [{ mesh: 0 }],
      };
      const heavyGltf = {
        asset: { version: '2.0' },
        accessors: [{ count: 900000 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        nodes: Array.from({ length: 8 }, (_, index) => ({ mesh: index === 0 ? 0 : undefined })),
        textures: Array.from({ length: 30 }, (_, index) => ({ source: index })),
        images: Array.from({ length: 30 }, (_, index) => ({ uri: 'texture-' + index + '.png' })),
      };
      const heavyNeedsProxyGltf = {
        asset: { version: '2.0' },
        accessors: [{ count: 180000 }],
        meshes: [{ name: 'Hero mesh', primitives: [{ attributes: { POSITION: 0 } }] }],
        nodes: Array.from({ length: 140 }, (_, index) => ({ name: 'Hero node ' + index, mesh: index === 0 ? 0 : undefined })),
        textures: [],
        images: [],
      };
      const heavyProxyGltf = {
        ...heavyNeedsProxyGltf,
        meshes: [{ name: 'UCX_Hero_Collision', primitives: [{ attributes: { POSITION: 0 } }] }],
        nodes: [{ name: 'UCX_Hero_Collision', mesh: 0 }],
      };
      const lightFile = new File([JSON.stringify(lightGltf)], 'light.gltf', { type: 'model/gltf+json' });
      const heavyFile = new File([JSON.stringify(heavyGltf)], 'heavy.gltf', { type: 'model/gltf+json' });
      const needsProxyFile = new File([JSON.stringify(heavyNeedsProxyGltf)], 'needs-proxy.gltf', { type: 'model/gltf+json' });
      const hasProxyFile = new File([JSON.stringify(heavyProxyGltf)], 'has-proxy.gltf', { type: 'model/gltf+json' });
      return {
        qualityButtons: [...document.querySelectorAll('#gb-performance [data-gb-quality]')].map((button) => button.dataset.gbQuality),
        qualitySummary: document.querySelector('#gb-quality-summary')?.textContent || '',
        templateIds: [...document.querySelectorAll('#gb-templates [data-gb-template]')].map((card) => card.dataset.gbTemplate),
        templateExports: (window._gameBuilderTemplates || []).map((template) => template.id),
        templateApplyReady: typeof window._applyGameBuilderTemplate === 'function',
        qualitySetterReady: typeof window._setGameBuilderGraphicsQuality === 'function',
        userImportReady: typeof window._importGLBFile === 'function',
        userImportListReady: typeof window._listUserImportedModels === 'function',
        userImportPlaceReady: typeof window._placeUserImportedModel === 'function',
        userImportDeleteReady: typeof window._deleteUserImportedModel === 'function',
        cloudImportListReady: typeof window._listCloudUserAssets === 'function',
        cloudImportPlaceReady: typeof window._placeCloudUserAsset === 'function',
        cloudImportDeleteReady: typeof window._deleteCloudUserAsset === 'function',
        cloudImportOwnerReady: typeof window._getUserAssetOwnerToken === 'function',
        importValidatorReady: !!validator,
        invalidImport: validator ? validator({ name: 'bad.txt', size: 10 }) : null,
        oversizedImport: validator ? validator({ name: 'huge.glb', size: 60 * 1024 * 1024 }) : null,
        validImport: validator ? validator({ name: 'chair.glb', size: 1024 * 1024 }) : null,
        modelInspectorReady: !!modelInspector,
        lightModelInspection: modelInspector ? await modelInspector(lightFile) : null,
        heavyModelInspection: modelInspector ? await modelInspector(heavyFile) : null,
        proxyWarningInspection: modelInspector ? await modelInspector(needsProxyFile) : null,
        proxyReadyInspection: modelInspector ? await modelInspector(hasProxyFile) : null,
        projectValidatorReady: !!projectValidator,
        projectSchema: window._crateProjectSchema || null,
        migrateHelperReady: typeof window._migrateCrateProjectData === 'function',
        validProject: projectValidator ? projectValidator({ format: 'crate-engine-project', version: 3, commands: ['build city'], objects: [], userScripts: [] }, { source: 'smoke-valid' }) : null,
        migratedProject: projectValidator ? projectValidator({ version: 1, commands: 'build city|add chair' }, { source: 'smoke-migrate' }) : null,
        futureProject: projectValidator ? projectValidator({ format: 'crate-engine-project', version: 99, commands: ['build city'] }, { source: 'smoke-future' }) : null,
        wrongProject: projectValidator ? projectValidator({ format: 'other-engine', version: 1, commands: ['build city'] }, { source: 'smoke-wrong' }) : null,
        deserializeReady: typeof window._deserializeCrateProject === 'function',
      };
    });
    for (const level of ['low', 'medium', 'high', 'ultra']) {
      if (!builderHardeningState.qualityButtons.includes(level)) {
        throw new Error(`Performance quality controls missing ${level}: ${JSON.stringify(builderHardeningState)}`);
      }
    }
    for (const template of ['survival', 'shooter', 'rpg', 'racing', 'space', 'tycoon']) {
      if (!builderHardeningState.templateIds.includes(template) || !builderHardeningState.templateExports.includes(template)) {
        throw new Error(`Game template missing ${template}: ${JSON.stringify(builderHardeningState)}`);
      }
    }
    if (!builderHardeningState.templateApplyReady || !builderHardeningState.qualitySetterReady) {
      throw new Error(`Builder hardening helpers missing: ${JSON.stringify(builderHardeningState)}`);
    }
    if (!builderHardeningState.userImportReady ||
        !builderHardeningState.userImportListReady ||
        !builderHardeningState.userImportPlaceReady ||
        !builderHardeningState.userImportDeleteReady ||
        !builderHardeningState.cloudImportListReady ||
        !builderHardeningState.cloudImportPlaceReady ||
        !builderHardeningState.cloudImportDeleteReady ||
        !builderHardeningState.cloudImportOwnerReady) {
      throw new Error(`User import library helpers missing: ${JSON.stringify(builderHardeningState)}`);
    }
    if (!builderHardeningState.importValidatorReady || builderHardeningState.invalidImport?.ok !== false || builderHardeningState.oversizedImport?.ok !== false || builderHardeningState.validImport?.ok !== true) {
      throw new Error(`Import validation did not gate files correctly: ${JSON.stringify(builderHardeningState)}`);
    }
    if (!builderHardeningState.modelInspectorReady ||
        builderHardeningState.lightModelInspection?.ok !== true ||
        builderHardeningState.heavyModelInspection?.ok !== false ||
        !/budget/i.test(builderHardeningState.heavyModelInspection?.reason || '')) {
      throw new Error(`Model metadata budgets did not gate GLTF imports correctly: ${JSON.stringify(builderHardeningState)}`);
    }
    if (builderHardeningState.proxyWarningInspection?.ok !== true ||
        !builderHardeningState.proxyWarningInspection?.warnings?.some((warning) => /collision proxy/i.test(warning))) {
      throw new Error(`Collision proxy warnings did not flag heavy physics GLTF imports: ${JSON.stringify(builderHardeningState)}`);
    }
    if (builderHardeningState.proxyReadyInspection?.ok !== true ||
        builderHardeningState.proxyReadyInspection?.warnings?.some((warning) => /No collision proxy/i.test(warning))) {
      throw new Error(`Collision proxy hints did not clear heavy physics GLTF imports: ${JSON.stringify(builderHardeningState)}`);
    }
    if (!builderHardeningState.projectValidatorReady ||
        !builderHardeningState.migrateHelperReady ||
        !builderHardeningState.deserializeReady ||
        builderHardeningState.projectSchema?.version !== 3 ||
        builderHardeningState.validProject?.ok !== true ||
        builderHardeningState.migratedProject?.ok !== true ||
        builderHardeningState.migratedProject?.project?.version !== 3 ||
        builderHardeningState.migratedProject?.project?.commands?.length !== 2 ||
        !builderHardeningState.migratedProject?.migrations?.includes('v1-to-v3') ||
        builderHardeningState.futureProject?.ok !== false ||
        builderHardeningState.wrongProject?.ok !== false) {
      throw new Error(`Project schema validation did not gate project files correctly: ${JSON.stringify(builderHardeningState)}`);
    }

    const runtimePoolState = await page.evaluate(async () => {
      const readStats = () => ({ ...(window._crateRuntimePools?.stats?.() || window._crateObjectPoolStats || {}) });
      const before = readStats();
      if (typeof window._exerciseCrateRuntimePools !== 'function') {
        return { ready: false, before };
      }
      const firstImmediate = window._exerciseCrateRuntimePools();
      await new Promise((resolve) => setTimeout(resolve, 1300));
      const afterFirst = readStats();
      window._exerciseCrateRuntimePools();
      await new Promise((resolve) => setTimeout(resolve, 1300));
      const afterSecond = readStats();
      return { ready: true, before, firstImmediate, afterFirst, afterSecond };
    });
    if (!runtimePoolState.ready ||
        runtimePoolState.afterFirst?.damageNumberPool < 1 ||
        runtimePoolState.afterFirst?.impactPool < 1 ||
        runtimePoolState.afterFirst?.muzzleFlashPool < 1 ||
        runtimePoolState.afterSecond?.damageNumberCreated > runtimePoolState.afterFirst?.damageNumberCreated ||
        runtimePoolState.afterSecond?.impactCreated > runtimePoolState.afterFirst?.impactCreated ||
        runtimePoolState.afterSecond?.muzzleFlashCreated > runtimePoolState.afterFirst?.muzzleFlashCreated) {
      throw new Error(`Runtime object pools did not reuse combat effects: ${JSON.stringify(runtimePoolState)}`);
    }

    await page.locator('#gb-performance [data-gb-quality="low"]').click({ timeout: timeoutMs });
    await page.waitForFunction(() => window._crateGraphicsQuality === 'low', undefined, { timeout: timeoutMs });
    await page.locator('#gb-performance [data-gb-quality="medium"]').click({ timeout: timeoutMs });
    await page.waitForFunction(() => window._crateGraphicsQuality === 'medium', undefined, { timeout: timeoutMs });

    await page.waitForFunction(
      () => Array.isArray(window._gameBuilderSystems) &&
        window._gameBuilderSystems.length >= 20 &&
        !!document.querySelector('#gb-systems [data-gb-system="inventory"] button[data-gb-action="install-system"]'),
      undefined,
      { timeout: timeoutMs }
    );
    const initialSystems = await page.evaluate(() => ({
      cardCount: document.querySelectorAll('#gb-systems [data-gb-system]').length,
      ids: (window._gameBuilderSystems || []).map((system) => system.id),
    }));
    for (const id of ['inventory', 'hud', 'quest', 'runtime', 'pickups', 'equipment', 'npcs', 'merchants', 'objectives', 'missions', 'rewards', 'gates', 'enemySpawns', 'waves', 'checkpoints', 'win', 'doors', 'triggers', 'spawns', 'damage']) {
      if (!initialSystems.ids.includes(id)) {
        throw new Error(`Game Systems library missing ${id}: ${JSON.stringify(initialSystems)}`);
      }
    }

    await page.locator('#gb-project button[data-gb-action="save"]').click({ timeout: timeoutMs });
    await page.waitForSelector('#sl-modal #sl-save-btn', { timeout: timeoutMs });
    await page.locator('#sl-close').click({ timeout: timeoutMs });

    await page.locator('#gb-project button[data-gb-action="import"]').click({ timeout: timeoutMs });
    await page.waitForSelector('#ie-modal #ie-import-glb', { timeout: timeoutMs });
    await page.waitForSelector('#ie-modal #ie-import-crate', { timeout: timeoutMs });
    await page.waitForSelector('#ie-modal #ie-import-library', { timeout: timeoutMs });
    await page.waitForSelector('#ie-modal #ie-refresh-imports', { timeout: timeoutMs });
    await page.locator('#ie-close').click({ timeout: timeoutMs });

    await page.locator('#gb-project button[data-gb-action="export"]').click({ timeout: timeoutMs });
    await page.waitForSelector('#ie-modal #ie-export-playable', { timeout: timeoutMs });
    await page.waitForSelector('#ie-modal #ie-export-publish', { timeout: timeoutMs });
    await page.waitForSelector('#ie-modal #ie-export-library', { timeout: timeoutMs });
    await page.waitForSelector('#ie-modal #ie-export-crate', { timeout: timeoutMs });
    await page.waitForSelector('#ie-modal #ie-export-html', { timeout: timeoutMs });
    await page.locator('#ie-close').click({ timeout: timeoutMs });

    await page.locator('#gb-project button[data-gb-action="published"]').click({ timeout: timeoutMs });
    await page.waitForSelector('#published-games-modal', { timeout: timeoutMs });
    await page.locator('#published-close').click({ timeout: timeoutMs });

    const catalogState = await page.evaluate(async () => {
      const catalog = await window._engineBridge?.loadAssetCatalog?.();
      const items = Object.values(catalog || {}).flat().filter((item) => item && typeof item === 'object');
      const refs = items.map((item) => String(item.path || item.file || ''));
      return {
        hiddenUnavailable: window._assetCatalogHiddenUnavailable || 0,
        normalized: window._assetCatalogNormalized || 0,
        deduped: window._assetCatalogDeduped || 0,
        itemCount: items.length,
        furnitureCount: catalog?.furniture?.length || 0,
        hasTmpReference: refs.some((ref) => /\.tmp$/i.test(ref) || /\.glb\.tmp$/i.test(ref)),
        unresolvedDuplicatedKenneyPath: refs.some((ref) => /kenney_cars\/kenney_cars\//i.test(ref) && !/models\/catalog\.json/i.test(ref)),
        hasBrokenOutdoorChair: refs.some((ref) => /ph_outdoor_table_chair_set_01|outdoor_table_chair_set_01/i.test(ref)),
        hasBrokenSweepAsset: refs.some((ref) => /ph_namaqualand_(?:rocks|stones)_01|namaqualand_(?:rocks|stones)_01|ph_moon_rock_01|moon_rock_01|ph_food_pears_asian_01|food_pears_asian_01/i.test(ref)),
      };
    });
    if (catalogState.hasTmpReference) throw new Error('Asset catalog still exposes .tmp references');
    if (catalogState.unresolvedDuplicatedKenneyPath) throw new Error(`Asset catalog still exposes duplicated Kenney car paths: ${JSON.stringify(catalogState)}`);
    if (catalogState.hasBrokenOutdoorChair) throw new Error(`Asset catalog still exposes a broken outdoor table chair set: ${JSON.stringify(catalogState)}`);
    if (catalogState.hasBrokenSweepAsset) throw new Error(`Asset catalog still exposes known broken sweep assets: ${JSON.stringify(catalogState)}`);

    await page.locator('#gb-systems [data-gb-system="inventory"] button[data-gb-action="install-system"]').click({ timeout: timeoutMs });
    await page.waitForFunction(() => Array.isArray(window._userScripts) && window._userScripts.length >= 1, undefined, { timeout: timeoutMs });

    const beforeFurnitureCount = await page.evaluate(() => window._engineBridge?.objects?.length || 0);
    await page.evaluate(() => window._runCommand?.('add chair'));
    await page.waitForFunction(
      (before) => (window._engineBridge?.objects?.length || 0) > before,
      beforeFurnitureCount,
      { timeout: timeoutMs }
    );
    await page.waitForSelector('#gb-placement-status', { timeout: timeoutMs });

    const beforeBuilderMenuPlacementCount = await page.evaluate(() => window._engineBridge?.objects?.length || 0);
    await page.evaluate(() => {
      window._smokeOriginalCategoryPicker = window._showCategoryPicker;
      window._showCategoryPicker = () => Promise.resolve({
        file: 'house_interior_pack_chair_1.glb',
        name: 'Builder menu chair',
        path: '/models/house_interior_pack_chair_1.glb',
      });
    });
    await page.locator('.gb-mobile-quick-tools button[data-gb-action="assets"]').click({ timeout: timeoutMs });
    await page.waitForFunction(
      (before) => {
        const state = window._lastAssetPlacement || {};
        return (window._engineBridge?.objects?.length || 0) === before &&
          state.status === 'preview' &&
          state.source === 'game-builder-assets' &&
          state.awaitingConfirm === true &&
          /Builder menu chair/i.test(state.name || '') &&
          !!document.querySelector('#asset-placement-preview-toolbar');
      },
      beforeBuilderMenuPlacementCount,
      { timeout: timeoutMs }
    );
    const previewPlacementState = await page.evaluate(() => ({
      objectCount: window._engineBridge?.objects?.length || 0,
      placement: window._lastAssetPlacement || null,
      toolbarVisible: !!document.querySelector('#asset-placement-preview-toolbar [data-placement-action="confirm"]'),
      statusText: document.querySelector('#gb-placement-status')?.textContent || '',
    }));
    if (previewPlacementState.objectCount !== beforeBuilderMenuPlacementCount ||
        previewPlacementState.placement?.status !== 'preview' ||
        !previewPlacementState.placement?.awaitingConfirm ||
        !previewPlacementState.toolbarVisible ||
        !/Move over the scene/i.test(previewPlacementState.statusText)) {
      throw new Error(`Game Builder asset preview did not wait for confirmation: ${JSON.stringify(previewPlacementState)}`);
    }
    await page.locator('#asset-placement-preview-toolbar [data-placement-action="confirm"]').click({ timeout: timeoutMs });
    await page.waitForFunction(
      (before) => {
        const state = window._lastAssetPlacement || {};
        return (window._engineBridge?.objects?.length || 0) > before &&
          state.status === 'placed' &&
          state.source === 'game-builder-assets' &&
          state.awaitingConfirm !== true &&
          /Builder menu chair/i.test(state.name || '');
      },
      beforeBuilderMenuPlacementCount,
      { timeout: timeoutMs }
    );
    const builderMenuPlacementState = await page.evaluate(() => {
      const placementEl = document.querySelector('#gb-placement-status');
      if (window._smokeOriginalCategoryPicker) {
        window._showCategoryPicker = window._smokeOriginalCategoryPicker;
        delete window._smokeOriginalCategoryPicker;
      }
      return {
        objectCount: window._engineBridge?.objects?.length || 0,
        placement: window._lastAssetPlacement || null,
        placementViewport: window._lastAssetPlacement?.viewport || null,
        placementText: placementEl?.textContent || '',
        placementName: placementEl?.dataset?.placementName || '',
        placementPosition: placementEl?.dataset?.placementPosition || '',
      };
    });
    if (builderMenuPlacementState.placement?.source !== 'game-builder-assets') {
      throw new Error(`Game Builder asset menu did not place the picked asset: ${JSON.stringify(builderMenuPlacementState)}`);
    }
    if (!builderMenuPlacementState.placementViewport?.onScreen) {
      throw new Error(`Game Builder asset menu placed the asset outside the visible viewport: ${JSON.stringify(builderMenuPlacementState)}`);
    }
    const placementText = builderMenuPlacementState.placementText || '';
    if (!/Asset:\s*Builder menu chair/i.test(placementText) ||
        !/Position:\s*x -?\d/i.test(placementText) ||
        !/,\s*y -?\d/i.test(placementText) ||
        !/,\s*z -?\d/i.test(placementText)) {
      throw new Error(`Game Builder placement status is not readable: ${JSON.stringify(builderMenuPlacementState)}`);
    }

    const beforeRealGalleryPlacementCount = await page.evaluate(() => window._engineBridge?.objects?.length || 0);
    await page.locator('.gb-mobile-quick-tools button[data-gb-action="assets"]').click({ timeout: timeoutMs });
    await page.waitForSelector('#_catPicker [data-asset-category="furniture"]', { timeout: timeoutMs });
    const realGalleryCategoryState = await page.evaluate(() => ({
      categoryCount: document.querySelectorAll('#_catPicker [data-asset-category]').length,
      furnitureLabel: document.querySelector('#_catPicker [data-asset-category="furniture"]')?.getAttribute('aria-label') || '',
      searchVisible: !!document.querySelector('#_catSearch'),
    }));
    await page.locator('#_catPicker [data-asset-category="furniture"]').click({ timeout: timeoutMs });
    await page.waitForSelector('#asset-gallery-overlay [data-asset-card="true"]', { timeout: timeoutMs });
    await page.locator('#asset-gallery-overlay input').fill('chair');
    await page.waitForFunction(
      () => [...document.querySelectorAll('#asset-gallery-overlay [data-asset-card="true"]')]
        .some((card) => /chair/i.test(card.dataset.assetName || card.textContent || '')),
      undefined,
      { timeout: timeoutMs }
    );
    const realGallerySelected = await page.evaluate(() => {
      const card = [...document.querySelectorAll('#asset-gallery-overlay [data-asset-card="true"]')]
        .find((node) => /chair/i.test(node.dataset.assetName || node.textContent || '')) ||
        document.querySelector('#asset-gallery-overlay [data-asset-card="true"]');
      return {
        name: card?.dataset.assetName || '',
        file: card?.dataset.assetFile || '',
        path: card?.dataset.assetPath || '',
      };
    });
    await page.locator('#asset-gallery-overlay [data-asset-card="true"]').filter({ hasText: /chair/i }).first().click({ timeout: timeoutMs });
    await page.waitForFunction(
      (before) => {
        const state = window._lastAssetPlacement || {};
        return (window._engineBridge?.objects?.length || 0) === before &&
          state.status === 'preview' &&
          state.source === 'game-builder-assets' &&
          state.awaitingConfirm === true &&
          !!document.querySelector('#asset-placement-preview-toolbar [data-placement-action="confirm"]');
      },
      beforeRealGalleryPlacementCount,
      { timeout: timeoutMs }
    );
    const realGalleryPreviewState = await page.evaluate(() => ({
      objectCount: window._engineBridge?.objects?.length || 0,
      placement: window._lastAssetPlacement || null,
      toolbarVisible: !!document.querySelector('#asset-placement-preview-toolbar [data-placement-action="confirm"]'),
      statusText: document.querySelector('#gb-placement-status')?.textContent || '',
    }));
    await page.locator('#asset-placement-preview-toolbar [data-placement-action="confirm"]').click({ timeout: timeoutMs });
    await page.waitForFunction(
      (before) => {
        const state = window._lastAssetPlacement || {};
        return (window._engineBridge?.objects?.length || 0) > before &&
          state.status === 'placed' &&
          state.source === 'game-builder-assets' &&
          state.awaitingConfirm !== true;
      },
      beforeRealGalleryPlacementCount,
      { timeout: timeoutMs }
    );
    const realGalleryPlacementState = await page.evaluate(() => ({
      objectCount: window._engineBridge?.objects?.length || 0,
      placement: window._lastAssetPlacement || null,
      toolbarVisible: !!document.querySelector('#asset-placement-preview-toolbar'),
    }));
    if (realGalleryCategoryState.categoryCount < 10 ||
        !/Furniture/i.test(realGalleryCategoryState.furnitureLabel) ||
        !realGalleryCategoryState.searchVisible ||
        !/chair/i.test(realGallerySelected.name || '') ||
        realGalleryPreviewState.objectCount !== beforeRealGalleryPlacementCount ||
        realGalleryPreviewState.placement?.status !== 'preview' ||
        !realGalleryPreviewState.placement?.awaitingConfirm ||
        realGalleryPlacementState.objectCount <= beforeRealGalleryPlacementCount ||
        realGalleryPlacementState.toolbarVisible) {
      throw new Error(`Real Asset Library gallery placement failed: ${JSON.stringify({ realGalleryCategoryState, realGallerySelected, realGalleryPreviewState, realGalleryPlacementState })}`);
    }

    const gallerySweepBadStart = badAssetResponses.length;
    const gallerySweepState = [];
    for (const category of ['vehicles', 'rocks', 'food']) {
      await page.locator('.gb-mobile-quick-tools button[data-gb-action="assets"]').click({ timeout: timeoutMs });
      await page.waitForSelector('#_catPicker', { timeout: timeoutMs });
      const categoryButton = page.locator(`#_catPicker [data-asset-category="${category}"]`);
      if (await categoryButton.count() === 0) {
        await page.keyboard.press('Escape');
        gallerySweepState.push({ category, missing: true });
        continue;
      }
      await categoryButton.click({ timeout: timeoutMs });
      await page.waitForSelector('#asset-gallery-overlay [data-asset-card="true"]', { timeout: timeoutMs });
      await page.waitForTimeout(1400);
      await page.evaluate(() => {
        const scrollArea = document.querySelector('#asset-gallery-overlay div[style*="overflow-y"]');
        if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight * 0.5;
      });
      await page.waitForTimeout(1200);
      gallerySweepState.push(await page.evaluate((categoryName) => {
        const cards = [...document.querySelectorAll('#asset-gallery-overlay [data-asset-card="true"]')];
        return {
          category: categoryName,
          visibleCards: cards.length,
          firstNames: cards.slice(0, 6).map((card) => card.dataset.assetName || card.textContent?.trim() || ''),
          duplicatedKenneyCards: cards.filter((card) => /kenney_cars\/kenney_cars\//i.test(card.dataset.assetFile || card.dataset.assetPath || '')).length,
        };
      }, category));
      await page.keyboard.press('Escape');
    }
    const gallerySweepBadResponses = badAssetResponses.slice(gallerySweepBadStart);
    if (gallerySweepBadResponses.length ||
        gallerySweepState.some((entry) => entry.visibleCards === 0 || entry.duplicatedKenneyCards > 0)) {
      throw new Error(`Real gallery category sweep failed: ${JSON.stringify({ gallerySweepState, gallerySweepBadResponses })}`);
    }

    const categoryPlacementBadStart = badAssetResponses.length;
    const categoryPlacementState = [];
    for (const category of ['vehicles', 'weapons', 'buildings', 'nature']) {
      const beforeCategoryPlacementCount = await page.evaluate(() => window._engineBridge?.objects?.length || 0);
      await page.locator('.gb-mobile-quick-tools button[data-gb-action="assets"]').click({ timeout: timeoutMs });
      await page.waitForSelector('#_catPicker', { timeout: timeoutMs });
      await page.locator(`#_catPicker [data-asset-category="${category}"]`).click({ timeout: timeoutMs });
      await page.waitForSelector('#asset-gallery-overlay [data-asset-card="true"]', { timeout: timeoutMs });
      const selectedCategoryAsset = await page.evaluate((categoryName) => {
        const first = document.querySelector('#asset-gallery-overlay [data-asset-card="true"]');
        return {
          category: categoryName,
          name: first?.dataset.assetName || '',
          file: first?.dataset.assetFile || '',
          path: first?.dataset.assetPath || '',
        };
      }, category);
      await page.locator('#asset-gallery-overlay [data-asset-card="true"]').first().click({ timeout: timeoutMs });
      await page.waitForFunction(
        (before) => (window._engineBridge?.objects?.length || 0) === before &&
          window._lastAssetPlacement?.status === 'preview' &&
          window._lastAssetPlacement?.awaitingConfirm === true &&
          !!document.querySelector('#asset-placement-preview-toolbar [data-placement-action="confirm"]'),
        beforeCategoryPlacementCount,
        { timeout: timeoutMs }
      );
      const previewState = await page.evaluate(() => ({
        placement: window._lastAssetPlacement || null,
        toolbarVisible: !!document.querySelector('#asset-placement-preview-toolbar [data-placement-action="confirm"]'),
      }));
      await page.locator('#asset-placement-preview-toolbar [data-placement-action="confirm"]').click({ timeout: timeoutMs });
      await page.waitForFunction(
        (before) => (window._engineBridge?.objects?.length || 0) > before &&
          window._lastAssetPlacement?.status === 'placed' &&
          !!window._lastAssetPlacement?.objectId,
        beforeCategoryPlacementCount,
        { timeout: timeoutMs }
      );
      const placedState = await page.evaluate((before) => ({
        placement: window._lastAssetPlacement || null,
        objectCount: window._engineBridge?.objects?.length || 0,
        added: (window._engineBridge?.objects?.length || 0) - before,
        toolbarVisible: !!document.querySelector('#asset-placement-preview-toolbar'),
      }), beforeCategoryPlacementCount);
      categoryPlacementState.push({
        ...selectedCategoryAsset,
        previewStatus: previewState.placement?.status || '',
        previewAwaitingConfirm: previewState.placement?.awaitingConfirm === true,
        previewToolbarVisible: previewState.toolbarVisible,
        placedStatus: placedState.placement?.status || '',
        placedName: placedState.placement?.name || '',
        placedSource: placedState.placement?.source || '',
        placedObjectId: placedState.placement?.objectId || '',
        added: placedState.added,
        toolbarVisibleAfterPlace: placedState.toolbarVisible,
      });
    }
    const categoryPlacementBadResponses = badAssetResponses.slice(categoryPlacementBadStart);
    if (categoryPlacementBadResponses.length ||
        categoryPlacementState.some((entry) => !entry.name ||
          entry.previewStatus !== 'preview' ||
          !entry.previewAwaitingConfirm ||
          !entry.previewToolbarVisible ||
          entry.placedStatus !== 'placed' ||
          entry.placedSource !== 'game-builder-assets' ||
          !entry.placedObjectId ||
          entry.added <= 0 ||
          entry.toolbarVisibleAfterPlace)) {
      throw new Error(`Real category asset placement failed: ${JSON.stringify({ categoryPlacementState, categoryPlacementBadResponses })}`);
    }

    const userImportState = await page.evaluate(async () => {
      const before = window._engineBridge?.objects?.length || 0;
      if (typeof window._importGLBFile !== 'function' ||
          typeof window._listUserImportedModels !== 'function' ||
          typeof window._placeUserImportedModel !== 'function' ||
          typeof window._deleteUserImportedModel !== 'function' ||
          typeof window._listCloudUserAssets !== 'function' ||
          typeof window._placeCloudUserAsset !== 'function' ||
          typeof window._deleteCloudUserAsset !== 'function' ||
          typeof window._publishCloudUserAssetForGame !== 'function' ||
          typeof window._getUserAssetStorageUsage !== 'function') {
        return { ready: false, before };
      }
      const usageBefore = await window._getUserAssetStorageUsage();
      const cloudHealthResponse = await fetch('/api/assets/health', { cache: 'no-store' });
      const cloudHealth = await cloudHealthResponse.json().catch(() => ({}));
      const assetUrl = typeof window._crateAssetUrl === 'function'
        ? window._crateAssetUrl('/models/house_interior_pack_chair_1.glb')
        : '/models/house_interior_pack_chair_1.glb';
      const response = await fetch(assetUrl, { cache: 'no-store' });
      if (!response.ok) return { ready: true, fetchOk: false, status: response.status, assetUrl, before };
      const blob = await response.blob();
      const file = new File([blob], 'smoke-user-import-chair.glb', { type: 'model/gltf-binary' });
      const imported = await window._importGLBFile(file, { source: 'smoke-user-import' });
      const status = window._lastUserImportStatus || {};
      const afterImport = window._engineBridge?.objects?.length || 0;
      const savedId = status.savedModel?.id || '';
      const cloudId = status.cloudAsset?.id || status.savedModel?.cloudAssetId || '';
      const list = await window._listUserImportedModels();
      const listed = !!savedId && list.some((item) => item.id === savedId);
      const cloudList = await window._listCloudUserAssets();
      const cloudListed = !!cloudId && cloudList.some((item) => item.cloudAssetId === cloudId || item.id === cloudId);
      const usageAfterUpload = await window._getUserAssetStorageUsage();
      const placed = savedId ? await window._placeUserImportedModel(savedId) : false;
      const localPlaceState = window._lastUserImportLibraryAction || {};
      const afterPlace = window._engineBridge?.objects?.length || 0;
      const cloudPlaced = cloudId ? await window._placeCloudUserAsset(cloudId, { source: 'smoke-cloud-user-asset' }) : false;
      const cloudPlaceState = window._lastUserAssetCloudPlace || {};
      const afterCloudPlace = window._engineBridge?.objects?.length || 0;
      const removeObjectById = (id) => {
        if (!id) return false;
        const objects = window._engineBridge?.objects || window._sceneObjects || [];
        const index = objects.findIndex((obj) => obj?.uuid === id);
        if (index < 0) return false;
        const [obj] = objects.splice(index, 1);
        window._engine?.scene?.remove?.(obj);
        return true;
      };
      const removedSmokeObjects = [
        removeObjectById(status.objectId || ''),
        removeObjectById(localPlaceState.objectId || ''),
        removeObjectById(cloudPlaceState.objectId || ''),
      ].filter(Boolean).length;
      const deleted = savedId ? await window._deleteUserImportedModel(savedId) : false;
      const afterDeleteList = await window._listUserImportedModels();
      const cloudAfterDeleteList = await window._listCloudUserAssets();
      const usageAfterDelete = await window._getUserAssetStorageUsage();
      const publishFile = new File([blob], 'smoke-publish-cloud-chair.glb', { type: 'model/gltf-binary' });
      const publishImported = await window._importGLBFile(publishFile, { source: 'smoke-publish-cloud-asset' });
      const publishStatus = window._lastUserImportStatus || {};
      const publishCloudId = publishStatus.cloudAsset?.id || publishStatus.savedModel?.cloudAssetId || '';
      const publishSavedId = publishStatus.savedModel?.id || '';
      const publishObjectId = publishStatus.objectId || '';
      const usageAfterPublishImport = await window._getUserAssetStorageUsage();
      window._refreshGameBuilder?.();
      return {
        ready: true,
        cloudHealthOk: cloudHealthResponse.ok && cloudHealth?.ok === true && cloudHealth?.binding === true,
        cloudHealthStatus: cloudHealthResponse.status,
        cloudHealth,
        usageBeforePrivateAssets: Number(usageBefore?.private?.assets) || 0,
        usageAfterUploadPrivateAssets: Number(usageAfterUpload?.private?.assets) || 0,
        usageAfterUploadPrivateBytes: Number(usageAfterUpload?.private?.bytes) || 0,
        usageAfterDeletePrivateAssets: Number(usageAfterDelete?.private?.assets) || 0,
        usageAfterPublishPrivateAssets: Number(usageAfterPublishImport?.private?.assets) || 0,
        usageAfterPublishPrivateBytes: Number(usageAfterPublishImport?.private?.bytes) || 0,
        usageQuotaBytes: Number(usageAfterPublishImport?.quota?.bytes) || 0,
        usageQuotaPercent: Number(usageAfterPublishImport?.quota?.percent) || 0,
        fetchOk: true,
        imported,
        importStatus: status.status || '',
        savedId,
        cloudId,
        listed,
        cloudListed,
        placed,
        cloudPlaced,
        deleted,
        stillListed: !!savedId && afterDeleteList.some((item) => item.id === savedId),
        cloudStillListed: !!cloudId && cloudAfterDeleteList.some((item) => item.cloudAssetId === cloudId || item.id === cloudId),
        publishImported,
        publishImportStatus: publishStatus.status || '',
        publishCloudId,
        publishSavedId,
        publishObjectId,
        before,
        afterImport,
        afterPlace,
        afterCloudPlace,
        afterPublishImport: window._engineBridge?.objects?.length || 0,
        removedSmokeObjects,
        libraryCount: list.length,
        cloudLibraryCount: cloudList.length,
      };
    });
    if (!userImportState.ready ||
        !userImportState.cloudHealthOk ||
        !userImportState.fetchOk ||
        userImportState.imported !== true ||
        userImportState.importStatus !== 'loaded' ||
        !userImportState.savedId ||
        !userImportState.cloudId ||
        !userImportState.listed ||
        !userImportState.cloudListed ||
        userImportState.usageAfterUploadPrivateAssets < userImportState.usageBeforePrivateAssets + 1 ||
        userImportState.usageAfterUploadPrivateBytes <= 0 ||
        userImportState.usageAfterDeletePrivateAssets > userImportState.usageAfterUploadPrivateAssets - 1 ||
        userImportState.usageAfterPublishPrivateAssets < userImportState.usageAfterDeletePrivateAssets + 1 ||
        userImportState.usageAfterPublishPrivateBytes <= 0 ||
        userImportState.usageQuotaBytes <= 0 ||
        userImportState.placed !== true ||
        userImportState.cloudPlaced !== true ||
        userImportState.deleted !== true ||
        userImportState.stillListed ||
        userImportState.cloudStillListed ||
        userImportState.afterImport <= userImportState.before ||
        userImportState.afterPlace <= userImportState.afterImport ||
        userImportState.afterCloudPlace <= userImportState.afterPlace ||
        userImportState.removedSmokeObjects < 3 ||
        userImportState.publishImported !== true ||
        userImportState.publishImportStatus !== 'loaded' ||
        !userImportState.publishCloudId ||
        !userImportState.publishSavedId ||
        !userImportState.publishObjectId ||
        userImportState.afterPublishImport <= userImportState.before) {
      throw new Error(`User imported GLB did not persist, cloud sync, place, and delete cleanly: ${JSON.stringify(userImportState)}`);
    }

    const beforeStarterKitCount = await page.evaluate(() => window._engineBridge?.objects?.length || 0);
    await page.locator('[data-gb-starter-kit-action="adventure-loop"]').click({ timeout: timeoutMs });
    await page.waitForFunction(
      (before) => {
        const latest = window._lastStarterKit || {};
        return latest.id === 'adventure-loop' &&
          latest.objectCount >= 6 &&
          (window._engineBridge?.objects?.length || 0) >= before + latest.objectCount;
      },
      beforeStarterKitCount,
      { timeout: timeoutMs }
    );
    const starterKitState = await page.evaluate((before) => {
      const objects = window._engineBridge?.objects || [];
      const kitObjects = objects.filter((obj) => obj?.userData?.isGameBuilderStarterKit);
      const components = new Set();
      kitObjects.forEach((obj) => Object.keys(obj.userData?.gbComponents || {}).forEach((key) => components.add(key)));
      const scripts = (window._userScripts || []).map((script) => script.id);
      return {
        before,
        after: objects.length,
        latest: window._lastStarterKit || null,
        kitObjects: kitObjects.length,
        components: [...components].sort(),
        hasInventory: scripts.includes('gb_inventory_hotbar'),
        hasHud: scripts.includes('gb_game_hud'),
        hasQuest: scripts.includes('gb_quest_tracker'),
        hasRuntime: scripts.includes('gb_component_runtime'),
        statusText: document.querySelector('#gb-starter-kit-status')?.textContent || '',
      };
    }, beforeStarterKitCount);
    if (starterKitState.kitObjects < 6 ||
        !starterKitState.components.includes('spawnPoint') ||
        !starterKitState.components.includes('missionStep') ||
        !starterKitState.components.includes('missionReward') ||
        !starterKitState.components.includes('missionGate') ||
        !starterKitState.components.includes('checkpoint') ||
        !starterKitState.components.includes('winCondition') ||
        !starterKitState.hasInventory ||
        !starterKitState.hasHud ||
        !starterKitState.hasQuest ||
        !starterKitState.hasRuntime ||
        !/Adventure Loop added/i.test(starterKitState.statusText)) {
      throw new Error(`Starter kit did not create a complete game loop: ${JSON.stringify(starterKitState)}`);
    }
    const starterKitLayoutState = await page.evaluate(() => {
      const section = document.querySelector('#gb-starter-kits');
      const cards = [...document.querySelectorAll('#gb-starter-kits [data-gb-starter-kit]')];
      return {
        clientHeight: section?.clientHeight || 0,
        scrollHeight: section?.scrollHeight || 0,
        cardCount: cards.length,
        visibleCards: cards.filter((card) => {
          const rect = card.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }).length,
      };
    });
    if (starterKitLayoutState.cardCount < 3 ||
        starterKitLayoutState.visibleCards < 3 ||
        starterKitLayoutState.scrollHeight > starterKitLayoutState.clientHeight + 2) {
      throw new Error(`Starter kit cards were clipped in the Builder panel: ${JSON.stringify(starterKitLayoutState)}`);
    }

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
        retryReady: typeof window._retryLastAssetPlacement === 'function',
        viewport: state.viewport || null,
        statusText: document.querySelector('#gb-placement-status')?.textContent?.trim() || '',
      };
    });
    if (placementState.mode !== 'edit') {
      throw new Error(`Asset placement did not stay in Edit mode: ${JSON.stringify(placementState)}`);
    }
    if (!placementState.viewport?.onScreen) {
      throw new Error(`Asset placement was not framed onscreen: ${JSON.stringify(placementState)}`);
    }
    if (placementState.selectedId !== placementState.objectId) {
      throw new Error(`Placed asset was not selected: ${JSON.stringify(placementState)}`);
    }
    if (!placementState.retryReady) {
      throw new Error(`Asset placement retry hook was not available: ${JSON.stringify(placementState)}`);
    }
    if (!/Smoke placement chair/i.test(placementState.statusText)) {
      throw new Error(`Placement status did not name the placed asset: ${JSON.stringify(placementState)}`);
    }

    const readModeIsolationSnapshot = (label) => page.evaluate((snapshotLabel) => ({
      label: snapshotLabel,
      mode: window._currentMode || '',
      playMode: window._playMode === true,
      controlsEnabled: window._ctrl?.enabled === true,
      selectedId: window._engineBridge?.getSelected?.()?.uuid || '',
      interaction: window._modeInteractionState || null,
    }), label);
    const canvasBox = await page.locator('canvas').boundingBox({ timeout: timeoutMs });
    if (!canvasBox) throw new Error('Mode isolation smoke could not find the WebGL canvas');
    const canvasCenter = {
      x: canvasBox.x + canvasBox.width / 2,
      y: canvasBox.y + canvasBox.height / 2,
    };

    await page.evaluate(() => window._setMode?.('explore'));
    await page.waitForFunction(
      () => window._currentMode === 'explore' && window._ctrl?.enabled === true,
      undefined,
      { timeout: timeoutMs }
    );
    const viewBefore = await readModeIsolationSnapshot('view-before-click');
    await page.mouse.click(canvasCenter.x, canvasCenter.y);
    await page.waitForTimeout(80);
    const viewAfterClick = await readModeIsolationSnapshot('view-after-click');

    await page.evaluate(() => window._setMode?.('play'));
    await page.waitForFunction(
      () => window._currentMode === 'play' && window._playMode === true && window._ctrl?.enabled === false,
      undefined,
      { timeout: timeoutMs }
    );
    const playBeforeWheel = await readModeIsolationSnapshot('play-before-wheel');
    const playAfterWheel = await page.evaluate((center) => {
      const canvas = document.querySelector('canvas');
      const snapshot = (label) => ({
        label,
        mode: window._currentMode || '',
        playMode: window._playMode === true,
        controlsEnabled: window._ctrl?.enabled === true,
        selectedId: window._engineBridge?.getSelected?.()?.uuid || '',
        interaction: window._modeInteractionState || null,
      });
      if (!canvas) return { missingCanvas: true };
      if (window._cam) window._cam.rotation.z = 0.45;
      const wheelEvent = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: 360,
        clientX: center.x,
        clientY: center.y,
      });
      const wheelDispatchReturned = canvas.dispatchEvent(wheelEvent);
      return {
        ...snapshot('play-after-wheel'),
        cameraRoll: window._cam?.rotation?.z ?? null,
        wheelDefaultPrevented: wheelEvent.defaultPrevented === true,
        wheelDispatchReturned,
        stability: window._playCameraStability || null,
      };
    }, canvasCenter);
    await page.waitForTimeout(80);
    if (playAfterWheel.missingCanvas) throw new Error('Mode isolation smoke could not find the WebGL canvas');

    await page.evaluate(() => window._setMode?.('edit'));
    await page.waitForFunction(
      () => window._currentMode === 'edit' && window._playMode !== true && window._ctrl?.enabled === true,
      undefined,
      { timeout: timeoutMs }
    );
    const editAfter = await readModeIsolationSnapshot('edit-after-mode-return');
    const modeIsolationState = { viewBefore, viewAfterClick, playBeforeWheel, playAfterWheel, editAfter };
    if (modeIsolationState.viewBefore.mode !== 'explore' ||
        modeIsolationState.viewBefore.controlsEnabled !== true ||
        modeIsolationState.viewBefore.selectedId) {
      throw new Error(`View mode did not start as camera-only: ${JSON.stringify(modeIsolationState)}`);
    }
    if (modeIsolationState.viewAfterClick.mode !== 'explore' ||
        modeIsolationState.viewAfterClick.controlsEnabled !== true ||
        modeIsolationState.viewAfterClick.selectedId) {
      throw new Error(`View mode click selected or disabled camera controls: ${JSON.stringify(modeIsolationState)}`);
    }
    if (modeIsolationState.playBeforeWheel.mode !== 'play' ||
        modeIsolationState.playBeforeWheel.playMode !== true ||
        modeIsolationState.playBeforeWheel.controlsEnabled !== false) {
      throw new Error(`Play mode did not isolate editor controls: ${JSON.stringify(modeIsolationState)}`);
    }
    if (Math.abs(Number(modeIsolationState.playAfterWheel.cameraRoll) || 0) > 0.001 ||
        modeIsolationState.playAfterWheel.controlsEnabled !== false ||
        modeIsolationState.playAfterWheel.wheelDefaultPrevented !== true) {
      throw new Error(`Play mode wheel input did not keep the world level: ${JSON.stringify(modeIsolationState)}`);
    }
    if (modeIsolationState.editAfter.mode !== 'edit' ||
        modeIsolationState.editAfter.playMode === true ||
        modeIsolationState.editAfter.controlsEnabled !== true) {
      throw new Error(`Edit mode did not restore editor controls: ${JSON.stringify(modeIsolationState)}`);
    }

    const builderTextFitState = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('#game-builder-panel button')].filter((button) => button.offsetParent !== null);
      const clipped = buttons.filter((button) => button.scrollWidth > button.clientWidth + 2 || button.scrollHeight > button.clientHeight + 2)
        .map((button) => ({
          text: button.textContent.trim(),
          className: button.className,
          width: button.clientWidth,
          scrollWidth: button.scrollWidth,
          height: button.clientHeight,
          scrollHeight: button.scrollHeight,
        }))
        .slice(0, 8);
      return { count: clipped.length, clipped };
    });
    if (builderTextFitState.count) {
      throw new Error(`Game Builder visible buttons are clipping text: ${JSON.stringify(builderTextFitState)}`);
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

    await page.evaluate(() => {
      if (Array.isArray(window._crateFrameProfile?.samples)) window._crateFrameProfile.samples.length = 0;
    });
    const rawBuildCityPerformanceState = await page.waitForFunction(
      () => {
        const profile = window._crateFrameProfile || {};
        const samples = Array.isArray(profile.samples) ? profile.samples : [];
        const render = window._renderer?.info?.render || {};
        if (samples.length < 45 || !render.calls || !render.triangles) return null;
        return {
          samples: samples.length,
          fps: Number(profile.fps) || 0,
          avgFrameMs: Number(profile.avgFrameMs) || 0,
          worstFrameMs: Number(profile.worstFrameMs) || 0,
          avgUpdateMs: Number(profile.avgUpdateMs) || 0,
          avgRenderMs: Number(profile.avgRenderMs) || 0,
          calls: Number(render.calls) || 0,
          triangles: Number(render.triangles) || 0,
          objects: window._engineBridge?.objects?.length || window._sceneObjects?.length || 0,
          mode: window._currentMode || '',
        };
      },
      undefined,
      { timeout: timeoutMs }
    ).then((handle) => handle.jsonValue());

    await page.locator('#gb-scene-list .gb-scene-row .gb-scene-main').first().click({ timeout: timeoutMs });
    await page.locator('button[data-gb-component="pickup"]').click({ timeout: timeoutMs });
    await page.locator('#gb-systems [data-gb-system="checkpoints"] button[data-gb-action="install-system"]').click({ timeout: timeoutMs });
    await page.locator('#gb-systems [data-gb-system="win"] button[data-gb-action="install-system"]').click({ timeout: timeoutMs });
    await page.locator('#gb-systems [data-gb-system="spawns"] button[data-gb-action="install-system"]').click({ timeout: timeoutMs });
    await page.waitForFunction(
      () => {
        const selected = window._engineBridge?.getSelected?.() || window._lastPlacedObj;
        const components = selected?.userData?.gbComponents || {};
        return !!components.pickup && !!components.checkpoint && !!components.winCondition && !!components.spawnPoint;
      },
      undefined,
      { timeout: timeoutMs }
    );

    await page.locator('#gb-scene-list .gb-scene-row .gb-scene-main').nth(1).click({ timeout: timeoutMs });
    await page.locator('#gb-systems [data-gb-system="doors"] button[data-gb-action="install-system"]').click({ timeout: timeoutMs });
    await page.locator('#gb-systems [data-gb-system="triggers"] button[data-gb-action="install-system"]').click({ timeout: timeoutMs });
    await page.evaluate(() => {
      const selected = window._engineBridge?.getSelected?.() || window._lastPlacedObj;
      const components = selected?.userData?.gbComponents || {};
      if (components.triggerZone) {
        components.triggerZone.radius = 9999;
        components.triggerZone.message = 'Smoke trigger opened door';
      }
      if (components.door && components.triggerZone) {
        components.triggerZone.targetDoorId = components.door.id || 'nearest';
      }
      window._refreshGameBuilder?.();
    });
    await page.waitForFunction(
      () => {
        const selected = window._engineBridge?.getSelected?.() || window._lastPlacedObj;
        const components = selected?.userData?.gbComponents || {};
        return !!components.door && !!components.triggerZone && Number(components.triggerZone.radius) >= 9999;
      },
      undefined,
      { timeout: timeoutMs }
    );

    await page.locator('#gb-scene-list .gb-scene-row .gb-scene-main').nth(2).click({ timeout: timeoutMs });
    await page.locator('#gb-systems [data-gb-system="missions"] button[data-gb-action="install-system"]').click({ timeout: timeoutMs });
    await page.locator('#gb-systems [data-gb-system="rewards"] button[data-gb-action="install-system"]').click({ timeout: timeoutMs });
    await page.locator('#gb-systems [data-gb-system="gates"] button[data-gb-action="install-system"]').click({ timeout: timeoutMs });
    await page.evaluate(() => {
      const selected = window._engineBridge?.getSelected?.() || window._lastPlacedObj;
      const components = selected?.userData?.gbComponents || {};
      if (components.missionStep) {
        components.missionStep.label = 'Smoke mission step';
        components.missionStep.radius = 9999;
      }
      if (components.missionReward) {
        components.missionReward.label = 'Smoke reward';
        components.missionReward.item = 'smoke-token';
        components.missionReward.score = 75;
        components.missionReward.xp = 40;
        components.missionReward.slot = 'trinket';
        components.missionReward.power = 3;
        components.missionReward.radius = 9999;
      }
      if (components.missionGate) {
        components.missionGate.label = 'Smoke gate';
        components.missionGate.requiredStepId = components.missionStep?.id || 'all';
        components.missionGate.distance = 3;
      }
      if (components.missionReward && components.missionStep) {
        components.missionReward.requiredStepId = components.missionStep.id;
      }
      window._refreshGameBuilder?.();
    });
    await page.waitForFunction(
      () => {
        const selected = window._engineBridge?.getSelected?.() || window._lastPlacedObj;
        const components = selected?.userData?.gbComponents || {};
        return !!components.missionStep &&
          !!components.missionReward &&
          !!components.missionGate &&
          Number(components.missionStep.radius) >= 9999 &&
          Number(components.missionReward.score) === 75;
      },
      undefined,
      { timeout: timeoutMs }
    );

    await page.locator('#gb-scene-list .gb-scene-row .gb-scene-main').nth(3).click({ timeout: timeoutMs });
    await page.locator('#gb-systems [data-gb-system="enemySpawns"] button[data-gb-action="install-system"]').click({ timeout: timeoutMs });
    await page.locator('#gb-systems [data-gb-system="waves"] button[data-gb-action="install-system"]').click({ timeout: timeoutMs });
    await page.evaluate(() => {
      const selected = window._engineBridge?.getSelected?.() || window._lastPlacedObj;
      const components = selected?.userData?.gbComponents || {};
      if (components.enemySpawn) {
        components.enemySpawn.label = 'Smoke enemy spawn';
        components.enemySpawn.count = 2;
        components.enemySpawn.radius = 1.5;
        components.enemySpawn.speed = 0.2;
        components.enemySpawn.damage = 1;
        components.enemySpawn.health = 20;
        components.enemySpawn.attackRadius = 1.2;
        components.enemySpawn.dropItem = 'smoke blade';
        components.enemySpawn.dropSlot = 'weapon';
        components.enemySpawn.dropPower = 7;
        components.enemySpawn.dropXp = 35;
        components.enemySpawn.dropScore = 9;
        components.enemySpawn.dropChance = 1;
      }
      if (components.waveController) {
        components.waveController.label = 'Smoke wave';
        components.waveController.wave = 1;
        components.waveController.count = 2;
        components.waveController.spawnGroup = components.enemySpawn?.id || 'nearest';
        components.waveController.rewardScore = 25;
      }
      window._refreshGameBuilder?.();
    });
    await page.waitForFunction(
      () => {
        const selected = window._engineBridge?.getSelected?.() || window._lastPlacedObj;
        const components = selected?.userData?.gbComponents || {};
        return !!components.enemySpawn &&
          !!components.waveController &&
          Number(components.enemySpawn.count) === 2 &&
          Number(components.waveController.count) === 2;
      },
      undefined,
      { timeout: timeoutMs }
    );

    await page.locator('#gb-scene-list .gb-scene-row .gb-scene-main').nth(4).click({ timeout: timeoutMs });
    await page.locator('#gb-systems [data-gb-system="equipment"] button[data-gb-action="install-system"]').click({ timeout: timeoutMs });
    await page.evaluate(() => {
      const selected = window._engineBridge?.getSelected?.() || window._lastPlacedObj;
      const components = selected?.userData?.gbComponents || {};
      if (components.equipmentItem) {
        components.equipmentItem.item = 'Smoke armor';
        components.equipmentItem.slot = 'armor';
        components.equipmentItem.power = 2;
        components.equipmentItem.xp = 5;
      }
      window._refreshGameBuilder?.();
    });
    await page.waitForFunction(
      () => {
        const selected = window._engineBridge?.getSelected?.() || window._lastPlacedObj;
        const components = selected?.userData?.gbComponents || {};
        return !!components.equipmentItem &&
          components.equipmentItem.slot === 'armor' &&
          Number(components.equipmentItem.power) === 2;
      },
      undefined,
      { timeout: timeoutMs }
    );

    await page.locator('#gb-scene-list .gb-scene-row .gb-scene-main').nth(5).click({ timeout: timeoutMs });
    await page.locator('#gb-systems [data-gb-system="npcs"] button[data-gb-action="install-system"]').click({ timeout: timeoutMs });
    await page.evaluate(() => {
      const selected = window._engineBridge?.getSelected?.() || window._lastPlacedObj;
      const components = selected?.userData?.gbComponents || {};
      if (components.npc) {
        components.npc.name = 'Smoke guide';
        components.npc.role = 'Quest giver';
        components.npc.dialogue = 'The city needs a real quest giver.';
        components.npc.questId = 'smoke-npc-quest';
        components.npc.rewardItem = 'smoke note';
        components.npc.rewardScore = 10;
        components.npc.rewardXp = 20;
        components.npc.radius = 9999;
      }
      window._refreshGameBuilder?.();
    });
    await page.waitForFunction(
      () => {
        const selected = window._engineBridge?.getSelected?.() || window._lastPlacedObj;
        const components = selected?.userData?.gbComponents || {};
        return !!components.npc &&
          components.npc.name === 'Smoke guide' &&
          Number(components.npc.radius) >= 9999;
      },
      undefined,
      { timeout: timeoutMs }
    );

    await page.locator('#gb-scene-list .gb-scene-row .gb-scene-main').nth(6).click({ timeout: timeoutMs });
    await page.locator('#gb-systems [data-gb-system="merchants"] button[data-gb-action="install-system"]').click({ timeout: timeoutMs });
    await page.evaluate(() => {
      const selected = window._engineBridge?.getSelected?.() || window._lastPlacedObj;
      const components = selected?.userData?.gbComponents || {};
      if (components.merchant) {
        components.merchant.name = 'Smoke vendor';
        components.merchant.item = 'smoke cloak';
        components.merchant.price = 25;
        components.merchant.slot = 'armor';
        components.merchant.power = 4;
        components.merchant.xp = 15;
        components.merchant.stock = 1;
        components.merchant.radius = 9999;
      }
      window._refreshGameBuilder?.();
    });
    await page.waitForFunction(
      () => {
        const selected = window._engineBridge?.getSelected?.() || window._lastPlacedObj;
        const components = selected?.userData?.gbComponents || {};
        return !!components.merchant &&
          components.merchant.item === 'smoke cloak' &&
          Number(components.merchant.price) === 25 &&
          Number(components.merchant.radius) >= 9999;
      },
      undefined,
      { timeout: timeoutMs }
    );

    await page.evaluate(() => {
      const objects = window._engineBridge?.objects || window._sceneObjects || [];
      const target = objects.find((obj) => {
        const components = obj?.userData?.gbComponents || {};
        return obj?.userData && !components.missionStep && !components.enemySpawn && !components.collider;
      }) || objects[0];
      if (!target) throw new Error('No object available for validation fix smoke');
      target.userData = target.userData || {};
      target.userData.gbComponents = target.userData.gbComponents || {};
      target.userData.gbComponents.missionReward = {
        id: 'smoke_bad_reward_' + (target.uuid || Date.now()),
        label: 'Smoke bad reward',
        item: 'bad smoke token',
        score: 1,
        xp: 0,
        slot: '',
        power: 0,
        requiredStepId: 'missing_smoke_step',
        radius: 0.1,
      };
      target.userData.gbComponents.waveController = {
        id: 'smoke_bad_wave_' + (target.uuid || Date.now()),
        label: 'Smoke bad wave',
        wave: 2,
        count: 1,
        spawnGroup: 'missing_smoke_spawn',
        enemySpeed: 0,
        enemyDamage: 0,
        enemyHealth: 0,
        rewardScore: 0,
        dropItem: '',
        dropSlot: '',
        dropPower: 0,
        dropXp: 0,
        dropScore: 0,
        dropChance: 0,
      };
      window._engineBridge?.selectObject?.(target);
      window._lastPlacedObj = target;
      window._refreshGameBuilder?.();
    });
    await page.locator('#gb-validation [data-gb-validation-fix="link-missions"]').click({ timeout: timeoutMs });
    await page.waitForFunction(
      () => window._pendingGameBuilderValidationFix?.action === 'link-missions' &&
        document.querySelector('#gb-validation-review')?.dataset.state === 'pending',
      undefined,
      { timeout: timeoutMs }
    );
    await page.locator('#gb-validation [data-gb-validation-apply="link-missions"]').click({ timeout: timeoutMs });
    await page.waitForFunction(
      () => (window._gameBuilderValidationFixHistory || []).some((item) => item.action === 'link-missions' && item.applied > 0),
      undefined,
      { timeout: timeoutMs }
    );
    await page.locator('#gb-validation [data-gb-validation-fix="link-waves"]').click({ timeout: timeoutMs });
    await page.waitForFunction(
      () => window._pendingGameBuilderValidationFix?.action === 'link-waves' &&
        document.querySelector('#gb-validation-review')?.dataset.state === 'pending',
      undefined,
      { timeout: timeoutMs }
    );
    await page.locator('#gb-validation [data-gb-validation-apply="link-waves"]').click({ timeout: timeoutMs });
    await page.waitForFunction(
      () => (window._gameBuilderValidationFixHistory || []).some((item) => item.action === 'link-waves' && item.applied > 0),
      undefined,
      { timeout: timeoutMs }
    );
    await page.evaluate(() => {
      const objects = window._engineBridge?.objects || window._sceneObjects || [];
      objects.forEach((obj) => {
        if (obj?.userData?.gbComponents?.collider) delete obj.userData.gbComponents.collider;
      });
      window._refreshGameBuilder?.();
    });
    await page.waitForFunction(
      () => !!document.querySelector('#gb-validation [data-gb-validation-fix="add-colliders"]'),
      undefined,
      { timeout: timeoutMs }
    );
    await page.locator('#gb-validation [data-gb-validation-fix="add-colliders"]').click({ timeout: timeoutMs });
    await page.waitForFunction(
      () => window._pendingGameBuilderValidationFix?.action === 'add-colliders' &&
        (window._pendingGameBuilderValidationFix?.count || 0) > 0,
      undefined,
      { timeout: timeoutMs }
    );
    await page.locator('#gb-validation [data-gb-validation-apply="add-colliders"]').click({ timeout: timeoutMs });
    await page.waitForFunction(
      () => (window._gameBuilderValidationFixHistory || []).some((item) => item.action === 'add-colliders' && item.applied > 0 && item.undoAvailable),
      undefined,
      { timeout: timeoutMs }
    );
    await page.locator('#gb-validation [data-gb-validation-undo="add-colliders"]').click({ timeout: timeoutMs });
    await page.waitForFunction(
      () => window._lastGameBuilderValidationUndo?.restoredObjects > 0 &&
        (window._gameBuilderValidation?.suggestions || 0) > 0 &&
        !!document.querySelector('#gb-validation [data-gb-validation-fix="add-colliders"]'),
      undefined,
      { timeout: timeoutMs }
    );
    await page.locator('#gb-validation [data-gb-validation-fix="add-colliders"]').click({ timeout: timeoutMs });
    await page.waitForFunction(
      () => window._pendingGameBuilderValidationFix?.action === 'add-colliders' &&
        (window._pendingGameBuilderValidationFix?.count || 0) > 0,
      undefined,
      { timeout: timeoutMs }
    );
    await page.locator('#gb-validation [data-gb-validation-apply="add-colliders"]').click({ timeout: timeoutMs });
    const validationFixState = await page.waitForFunction(
      () => {
        const history = window._gameBuilderValidationFixHistory || [];
        const validation = window._gameBuilderValidation || {};
        const objects = window._engineBridge?.objects || window._sceneObjects || [];
        const colliderCount = objects.filter((obj) => obj?.userData?.gbComponents?.collider).length;
        const actions = history.map((item) => item.action);
        const undo = window._lastGameBuilderValidationUndo || {};
        if (!actions.includes('link-missions') || !actions.includes('link-waves') || !actions.includes('add-colliders')) return null;
        if (validation.status !== 'ready' || validation.errors !== 0 || validation.warnings !== 0 || validation.suggestions !== 0) return null;
        if (!colliderCount) return null;
        return {
          actions,
          colliderCount,
          latest: history[history.length - 1],
          undoRestoredObjects: undo.restoredObjects || 0,
          previewState: document.querySelector('#gb-validation-review')?.dataset.state || '',
          summary: validation.summary,
          rowCount: document.querySelectorAll('#gb-validation-list .gb-validation-row').length,
        };
      },
      undefined,
      { timeout: timeoutMs }
    ).then((handle) => handle.jsonValue());
    await page.evaluate(() => {
      const objects = window._engineBridge?.objects || window._sceneObjects || [];
      const target = objects.find((obj) => {
        const components = obj?.userData?.gbComponents || {};
        return components.pickup && components.checkpoint && components.winCondition && components.spawnPoint;
      });
      if (!target) throw new Error('Could not reselect smoke gameplay object after validation fixes');
      window._engineBridge?.selectObject?.(target);
      window._lastPlacedObj = target;
      window._refreshGameBuilder?.();
    });
    await page.waitForFunction(
      () => {
        const selected = window._engineBridge?.getSelected?.() || window._lastPlacedObj;
        const components = selected?.userData?.gbComponents || {};
        return !!components.pickup && !!components.checkpoint && !!components.winCondition && !!components.spawnPoint;
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
        const hasSpawnPoint = Array.isArray(parsed.objects) && parsed.objects.some((obj) => obj?.components?.spawnPoint);
        const hasDoor = Array.isArray(parsed.objects) && parsed.objects.some((obj) => obj?.components?.door);
        const hasTriggerZone = Array.isArray(parsed.objects) && parsed.objects.some((obj) => obj?.components?.triggerZone);
        const hasMissionStep = Array.isArray(parsed.objects) && parsed.objects.some((obj) => obj?.components?.missionStep);
        const hasMissionReward = Array.isArray(parsed.objects) && parsed.objects.some((obj) => obj?.components?.missionReward);
        const hasMissionGate = Array.isArray(parsed.objects) && parsed.objects.some((obj) => obj?.components?.missionGate);
        const hasEnemySpawn = Array.isArray(parsed.objects) && parsed.objects.some((obj) => obj?.components?.enemySpawn);
        const hasWaveController = Array.isArray(parsed.objects) && parsed.objects.some((obj) => obj?.components?.waveController);
        const hasEquipmentItem = Array.isArray(parsed.objects) && parsed.objects.some((obj) => obj?.components?.equipmentItem);
        const hasNpc = Array.isArray(parsed.objects) && parsed.objects.some((obj) => obj?.components?.npc);
        const hasMerchant = Array.isArray(parsed.objects) && parsed.objects.some((obj) => obj?.components?.merchant);
        const hasAssetPath = Array.isArray(parsed.objects) && parsed.objects.some((obj) => obj?.assetPath);
        const hasScripts = Array.isArray(parsed.userScripts) && parsed.userScripts.length >= 1;
        const hasValidationFixHistory = Array.isArray(parsed.validationFixHistory) && parsed.validationFixHistory.some((fix) => fix?.action === 'add-colliders' && fix?.applied > 0);
        const commands = Array.isArray(parsed.commands) ? parsed.commands : [];
        const hasBuildCityCommand = commands.some((cmd) => /^(?:build (?:a |the )?(?:city|full city|the city)|generate city|city world|new city)$/i.test(String(cmd || '').trim()));
        if (parsed.version !== 3 || !hasPickup || !hasSpawnPoint || !hasDoor || !hasTriggerZone || !hasMissionStep || !hasMissionReward || !hasMissionGate || !hasEnemySpawn || !hasWaveController || !hasEquipmentItem || !hasNpc || !hasMerchant || !hasAssetPath || !hasScripts || !hasValidationFixHistory || !hasBuildCityCommand) return null;
        return {
          version: parsed.version,
          objectCount: parsed.objects.length,
          scriptCount: parsed.userScripts.length,
          commandCount: commands.length,
          hasBuildCityCommand,
          hasPickup,
          hasSpawnPoint,
          hasDoor,
          hasTriggerZone,
          hasMissionStep,
          hasMissionReward,
          hasMissionGate,
          hasEnemySpawn,
          hasWaveController,
          hasEquipmentItem,
          hasNpc,
          hasMerchant,
          hasAssetPath,
          validationFixHistoryCount: parsed.validationFixHistory.length,
          hasValidationFixHistory,
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
    let loadedProjectState;
    try {
      loadedProjectState = await page.waitForFunction(
      (saved) => {
        const load = window._lastProjectLoad || {};
        const objects = window._engineBridge?.objects || window._sceneObjects || [];
        const scripts = Array.isArray(window._userScripts) ? window._userScripts.length : 0;
        const pickupObj = objects.find((obj) => obj?.userData?.gbComponents?.pickup);
        const doorObj = objects.find((obj) => obj?.userData?.gbComponents?.door);
        const triggerObj = objects.find((obj) => obj?.userData?.gbComponents?.triggerZone);
        const missionObj = objects.find((obj) => obj?.userData?.gbComponents?.missionStep);
        const rewardObj = objects.find((obj) => obj?.userData?.gbComponents?.missionReward);
        const gateObj = objects.find((obj) => obj?.userData?.gbComponents?.missionGate);
        const enemySpawnObj = objects.find((obj) => obj?.userData?.gbComponents?.enemySpawn);
        const waveObj = objects.find((obj) => obj?.userData?.gbComponents?.waveController);
        const equipmentObj = objects.find((obj) => obj?.userData?.gbComponents?.equipmentItem);
        const npcObj = objects.find((obj) => obj?.userData?.gbComponents?.npc);
        const merchantObj = objects.find((obj) => obj?.userData?.gbComponents?.merchant);
        if (load.status !== 'loaded' || objects.length < 100 || scripts < saved.scriptCount || !pickupObj || !doorObj || !triggerObj || !missionObj || !rewardObj || !gateObj || !enemySpawnObj || !waveObj || !equipmentObj || !npcObj || !merchantObj) return null;
        return {
          status: load.status,
          objectCount: objects.length,
          scriptCount: scripts,
          pickupId: pickupObj.uuid || '',
          doorId: doorObj.uuid || '',
          triggerId: triggerObj.uuid || '',
          missionId: missionObj.uuid || '',
          rewardId: rewardObj.uuid || '',
          gateId: gateObj.uuid || '',
          enemySpawnId: enemySpawnObj.uuid || '',
          waveId: waveObj.uuid || '',
          equipmentId: equipmentObj.uuid || '',
          npcId: npcObj.uuid || '',
          merchantId: merchantObj.uuid || '',
          spawned: load.snapshot?.spawned || 0,
          applied: load.snapshot?.applied || 0,
          expected: load.snapshot?.expected || 0,
        };
      },
      savedProjectState,
      { timeout: timeoutMs }
      ).then((handle) => handle.jsonValue());
    } catch (err) {
      const debug = await page.evaluate((saved) => {
        const load = window._lastProjectLoad || {};
        const objects = window._engineBridge?.objects || window._sceneObjects || [];
        const componentCounts = objects.reduce((out, obj) => {
          Object.keys(obj?.userData?.gbComponents || {}).forEach((key) => {
            out[key] = (out[key] || 0) + 1;
          });
          return out;
        }, {});
        return {
          saved,
          load,
          objectCount: objects.length,
          scriptCount: Array.isArray(window._userScripts) ? window._userScripts.length : 0,
          componentCounts,
          lastCommands: (window._sceneHistory || []).slice(-8),
          lastPlacement: window._lastAssetPlacement || null,
        };
      }, savedProjectState);
      throw new Error(`Project load restore did not reach expected state: ${JSON.stringify(debug)}`);
    }

    const playableExportState = await page.evaluate(async () => {
      const result = await window._exportPlayablePackage?.({ download: false, title: 'Production Smoke Game' });
      const stored = window._lastPlayableExport || {};
      return {
        format: result?.format || '',
        filename: result?.filename || '',
        assetBaseUrl: result?.assetBaseUrl || '',
        objectCount: Number(result?.objectCount) || 0,
        commandCount: Number(result?.commandCount) || 0,
        scriptCount: Number(result?.scriptCount) || 0,
        componentCount: Number(result?.componentCount) || 0,
        componentTypes: result?.componentTypes || {},
        files: result?.files || [],
        htmlBytes: Number(result?.htmlBytes) || 0,
        crateBytes: Number(result?.crateBytes) || 0,
        hasEmbeddedPackage: result?.hasEmbeddedPackage === true,
        hasRuntimeControls: result?.hasRuntimeControls === true,
        htmlHasAssetBase: typeof stored.html === 'string' && stored.html.includes('https://crateship-games-assets.pages.dev'),
        htmlHasNpcRuntime: typeof stored.html === 'string' && stored.html.includes('interactNpc'),
        htmlHasMerchantRuntime: typeof stored.html === 'string' && stored.html.includes('interactMerchant'),
        crateHasNpc: typeof stored.crate === 'string' && stored.crate.includes('"npc"'),
        crateHasMerchant: typeof stored.crate === 'string' && stored.crate.includes('"merchant"'),
      };
    });
    if (playableExportState.format !== 'crate-playable-package' ||
        !playableExportState.filename.endsWith('-playable.html') ||
        playableExportState.assetBaseUrl !== 'https://crateship-games-assets.pages.dev' ||
        playableExportState.objectCount < 100 ||
        playableExportState.componentCount < 14 ||
        playableExportState.scriptCount < 1 ||
        playableExportState.htmlBytes < 50000 ||
        playableExportState.crateBytes < 10000 ||
        !playableExportState.files.includes('index.html') ||
        !playableExportState.files.includes('game.crate') ||
        !playableExportState.files.includes('README.md') ||
        !playableExportState.hasEmbeddedPackage ||
        !playableExportState.hasRuntimeControls ||
        !playableExportState.htmlHasAssetBase ||
        !playableExportState.htmlHasNpcRuntime ||
        !playableExportState.htmlHasMerchantRuntime ||
        !playableExportState.crateHasNpc ||
        !playableExportState.crateHasMerchant) {
      throw new Error(`Playable export package was not complete: ${JSON.stringify(playableExportState)}`);
    }

    const publishedState = await page.evaluate(async () => {
      const smoke = window.__CRATE_SMOKE || {};
      const publishedSlug = smoke.publishedSlug || 'production-smoke-published-game';
      const result = await window._publishLocalGame?.({
        title: 'Production Smoke Published Game',
        slug: publishedSlug,
        description: 'Smoke test published build',
        tags: ['smoke', 'publish'],
        ownerToken: 'production-smoke-owner-token',
        creator: { name: 'Production Smoke Creator', website: 'https://crateshipgames.com' },
        visibility: 'public',
      });
      const rows = window._getPublishedGames?.() || [];
      const decoded = window._decompressScene?.(result?.sceneData || '');
      let parsed = null;
      try {
        parsed = JSON.parse(decoded);
      } catch {}
      const parsedObjects = Array.isArray(parsed?.objects) ? parsed.objects : [];
      const publicCloudObjects = parsedObjects.filter((obj) =>
        obj?.publicCloudAssetId || String(obj?.assetPath || '').startsWith('crate-cloud-public-asset:')
      );
      const publicCloudAssetId = publicCloudObjects[0]?.publicCloudAssetId ||
        String(publicCloudObjects[0]?.assetPath || '').replace(/^crate-cloud-public-asset:/, '');
      const privateCloudAssetId = publicCloudObjects[0]?.cloudAssetId || '';
      let publicCloudAssetDetailStatus = 0;
      let publicCloudAssetDownloadStatus = 0;
      let privateCloudAssetNoAuthStatus = 0;
      if (publicCloudAssetId) {
        try {
          publicCloudAssetDetailStatus = (await fetch('/api/assets/public/' + encodeURIComponent(publicCloudAssetId), { cache: 'no-store' })).status;
        } catch {}
        try {
          publicCloudAssetDownloadStatus = (await fetch('/api/assets/public/' + encodeURIComponent(publicCloudAssetId) + '/download', { cache: 'no-store' })).status;
        } catch {}
      }
      let apiGame = null;
      let apiList = null;
      let apiStatus = 0;
      let listStatus = 0;
      try {
        const apiResponse = await fetch('/api/games/' + encodeURIComponent(result?.slug || ''));
        apiStatus = apiResponse.status;
        const apiPayload = await apiResponse.json();
        apiGame = apiPayload?.game || null;
      } catch {}
      try {
        const listResponse = await fetch('/api/games?slug=' + encodeURIComponent(result?.slug || ''));
        listStatus = listResponse.status;
        const listPayload = await listResponse.json();
        apiList = Array.isArray(listPayload?.games) ? listPayload.games : [];
      } catch {}
      return {
        format: result?.format || '',
        version: Number(result?.version) || 0,
        slug: result?.slug || '',
        title: result?.title || '',
        shareUrl: result?.shareUrl || '',
        cloudStatus: result?.cloudStatus || '',
        cloudUrl: result?.cloud?.url || '',
        cloudSource: result?.cloud?.source || '',
        objects: Number(result?.objects) || 0,
        commands: Number(result?.commands) || 0,
        scripts: Number(result?.scripts) || 0,
        components: Number(result?.components) || 0,
        hasPlayable: !!result?.playable && result.playable.format === 'crate-playable-package',
        playableHtmlBytes: Number(result?.playable?.htmlBytes) || 0,
        storedCount: rows.length,
        storedSlug: rows.find((item) => item?.slug === result?.slug)?.slug || '',
        decodedFormat: parsed?.format || '',
        decodedObjects: parsedObjects.length,
        decodedComponents: parsedObjects.length
          ? parsedObjects.reduce((sum, obj) => sum + Object.keys(obj?.components || {}).length, 0)
          : 0,
        publicCloudAssetCount: publicCloudObjects.length,
        publicCloudAssetId,
        publicCloudAssetDetailStatus,
        publicCloudAssetDownloadStatus,
        privateCloudAssetId,
        privateCloudAssetNoAuthStatus,
        apiStatus,
        apiFormat: apiGame?.format || '',
        apiSlug: apiGame?.slug || '',
        apiObjects: Number(apiGame?.objects) || 0,
        apiComponents: Number(apiGame?.components) || 0,
        apiHasProjectData: typeof apiGame?.projectData === 'string' && apiGame.projectData.includes('"crate-engine-project"'),
        apiCloudAssetCount: Number(apiGame?.cloudAssetCount) || (Array.isArray(apiGame?.cloudAssets) ? apiGame.cloudAssets.length : 0),
        apiOwnerManaged: apiGame?.ownerManaged === true,
        apiCreatorName: apiGame?.creatorName || '',
        apiCreatorUrl: apiGame?.creatorUrl || '',
        apiVisibility: apiGame?.visibility || '',
        listStatus,
        listHasSlug: Array.isArray(apiList) && apiList.some((item) => item?.slug === result?.slug),
        listOwnerManaged: Array.isArray(apiList) && apiList.some((item) => item?.slug === result?.slug && item?.ownerManaged === true),
        listCreatorName: Array.isArray(apiList) ? (apiList.find((item) => item?.slug === result?.slug)?.creatorName || '') : '',
        listVisibility: Array.isArray(apiList) ? (apiList.find((item) => item?.slug === result?.slug)?.visibility || '') : '',
        lastPublishedSlug: window._lastPublishedGame?.slug || '',
      };
    });
    if (publishedState.privateCloudAssetId) {
      const privateNoAuth = await fetch(new URL('/api/assets/' + encodeURIComponent(publishedState.privateCloudAssetId) + '/download', baseUrl).href);
      publishedState.privateCloudAssetNoAuthStatus = privateNoAuth.status;
    }
    if (publishedState.format !== 'crate-published-game' ||
        publishedState.version < 2 ||
        publishedState.slug !== smokePublishedSlug ||
        !publishedState.shareUrl.includes(`/play?published=${smokePublishedSlug}`) ||
        publishedState.shareUrl.includes('#') ||
        publishedState.cloudStatus !== 'synced' ||
        !publishedState.cloudUrl.includes(`/play?published=${smokePublishedSlug}`) ||
        publishedState.cloudSource !== 'cloudflare-pages-kv' ||
        publishedState.objects < 100 ||
        publishedState.components < 14 ||
        publishedState.scripts < 1 ||
        !publishedState.hasPlayable ||
        publishedState.playableHtmlBytes < 50000 ||
        publishedState.storedSlug !== smokePublishedSlug ||
        publishedState.lastPublishedSlug !== smokePublishedSlug ||
        publishedState.decodedFormat !== 'crate-engine-project' ||
        publishedState.decodedObjects < 100 ||
        publishedState.decodedComponents < 14 ||
        publishedState.publicCloudAssetCount < 1 ||
        !publishedState.publicCloudAssetId ||
        publishedState.publicCloudAssetDetailStatus !== 200 ||
        publishedState.publicCloudAssetDownloadStatus !== 200 ||
        publishedState.privateCloudAssetNoAuthStatus !== 403 ||
        publishedState.apiStatus !== 200 ||
        publishedState.apiFormat !== 'crate-cloud-published-game' ||
        publishedState.apiSlug !== smokePublishedSlug ||
        publishedState.apiObjects < 100 ||
        publishedState.apiComponents < 14 ||
        !publishedState.apiHasProjectData ||
        publishedState.apiCloudAssetCount < 1 ||
        !publishedState.apiOwnerManaged ||
        publishedState.apiCreatorName !== 'Production Smoke Creator' ||
        publishedState.apiCreatorUrl !== 'https://crateshipgames.com/' ||
        publishedState.apiVisibility !== 'public' ||
        publishedState.listStatus !== 200 ||
        !publishedState.listHasSlug ||
        !publishedState.listOwnerManaged ||
        publishedState.listCreatorName !== 'Production Smoke Creator' ||
        publishedState.listVisibility !== 'public') {
      throw new Error(`Published game library did not create a portable playable link: ${JSON.stringify(publishedState)}`);
    }
    if (userImportState.publishSavedId) {
      await page.evaluate(async ({ id, objectId, cloudId }) => {
        const deleted = await window._deleteUserImportedModel?.(id);
        const objects = window._engineBridge?.objects || window._sceneObjects || [];
        for (let index = objects.length - 1; index >= 0; index--) {
          const obj = objects[index];
          const matches = obj?.uuid === objectId ||
            obj?.userData?.gbCloudAssetId === cloudId ||
            obj?.userData?.cloudAssetId === cloudId ||
            obj?.userData?.gbPlacementSource === 'smoke-publish-cloud-asset';
          if (!matches) continue;
          const [removed] = objects.splice(index, 1);
          window._engine?.scene?.remove?.(removed);
        }
        return deleted;
      }, { id: userImportState.publishSavedId, objectId: userImportState.publishObjectId, cloudId: userImportState.publishCloudId });
    }

    const deleteGuardPublishState = await page.evaluate(async () => {
      const smoke = window.__CRATE_SMOKE || {};
      const ownerToken = 'production-smoke-delete-owner-token';
      const result = await window._publishLocalGame?.({
        title: 'Production Smoke Delete Guard',
        slug: smoke.deleteGuardSlug || 'production-smoke-delete-guard-game',
        description: 'Smoke test delete guard',
        tags: ['smoke', 'delete'],
        ownerToken,
      });
      const slug = result?.slug || smoke.deleteGuardSlug || 'production-smoke-delete-guard-game';
      return {
        slug,
        ownerToken,
        publishStatus: result?.cloudStatus || '',
        publishSource: result?.cloud?.source || '',
        ownerManaged: result?.cloud?.ownerManaged === true,
      };
    });
    const deleteGuardApiUrl = new URL('/api/games/' + encodeURIComponent(deleteGuardPublishState.slug), baseUrl).href;
    const blockedDelete = await fetch(deleteGuardApiUrl, { method: 'DELETE' });
    let blockedError = '';
    try {
      blockedError = (await blockedDelete.json())?.error || '';
    } catch {}
    const ownerDelete = await fetch(deleteGuardApiUrl, {
      method: 'DELETE',
      headers: { 'X-Crate-Owner-Token': deleteGuardPublishState.ownerToken },
    });
    let ownerDeletePayload = {};
    try {
      ownerDeletePayload = await ownerDelete.json();
    } catch {}
    const missingAfterDelete = await fetch(deleteGuardApiUrl);
    const deleteGuardState = {
      ...deleteGuardPublishState,
      blockedStatus: blockedDelete.status,
      blockedError,
      deletedStatus: ownerDelete.status,
      deletedOk: ownerDeletePayload?.ok === true && ownerDeletePayload?.deleted === true,
      deletedAuthorization: ownerDeletePayload?.authorization || '',
      missingStatus: missingAfterDelete.status,
    };
    if (deleteGuardState.slug !== smokeDeleteGuardSlug ||
        deleteGuardState.publishStatus !== 'synced' ||
        deleteGuardState.publishSource !== 'cloudflare-pages-kv' ||
        !deleteGuardState.ownerManaged ||
        deleteGuardState.blockedStatus !== 403 ||
        !/owner token/i.test(deleteGuardState.blockedError) ||
        deleteGuardState.deletedStatus !== 200 ||
        !deleteGuardState.deletedOk ||
        deleteGuardState.deletedAuthorization !== 'owner' ||
        deleteGuardState.missingStatus !== 404) {
      throw new Error(`Published game delete guard failed: ${JSON.stringify(deleteGuardState)}`);
    }

    const metadataGuardPublishState = await page.evaluate(async () => {
      const smoke = window.__CRATE_SMOKE || {};
      const ownerToken = 'production-smoke-metadata-owner-token';
      const result = await window._publishLocalGame?.({
        title: 'Production Smoke Metadata Guard',
        slug: smoke.metadataGuardSlug || 'production-smoke-metadata-guard-game',
        description: 'Smoke test metadata guard',
        tags: ['smoke', 'metadata'],
        ownerToken,
        creator: { name: 'Smoke Metadata Creator', website: 'https://crateshipgames.com' },
        visibility: 'public',
      });
      const slug = result?.slug || smoke.metadataGuardSlug || 'production-smoke-metadata-guard-game';
      return {
        slug,
        ownerToken,
        publishStatus: result?.cloudStatus || '',
        publishSource: result?.cloud?.source || '',
        ownerManaged: result?.cloud?.ownerManaged === true,
        initialVisibility: result?.cloud?.visibility || '',
        initialCreator: result?.cloud?.creatorName || '',
      };
    });
    const metadataGuardApiUrl = new URL('/api/games/' + encodeURIComponent(metadataGuardPublishState.slug), baseUrl).href;
    const metadataUpdate = await fetch(metadataGuardApiUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Crate-Owner-Token': metadataGuardPublishState.ownerToken,
      },
      body: JSON.stringify({
        title: 'Production Smoke Metadata Guard Updated',
        description: 'Smoke test metadata guard updated',
        tags: ['smoke', 'metadata', 'updated'],
        creator: { name: 'Smoke Updated Creator', website: 'https://crateshipgames.com' },
        visibility: 'unlisted',
      }),
    });
    let metadataUpdatePayload = {};
    try {
      metadataUpdatePayload = await metadataUpdate.json();
    } catch {}
    const metadataFeaturedUpdate = await fetch(metadataGuardApiUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Crate-Owner-Token': metadataGuardPublishState.ownerToken,
      },
      body: JSON.stringify({ featured: true }),
    });
    let metadataFeaturedPayload = {};
    try {
      metadataFeaturedPayload = await metadataFeaturedUpdate.json();
    } catch {}
    const metadataDirect = await fetch(metadataGuardApiUrl);
    let metadataDirectPayload = {};
    try {
      metadataDirectPayload = await metadataDirect.json();
    } catch {}
    const metadataList = await fetch(new URL('/api/games?limit=50', baseUrl).href);
    let metadataListPayload = {};
    try {
      metadataListPayload = await metadataList.json();
    } catch {}
    const metadataDirectList = await fetch(new URL('/api/games?slug=' + encodeURIComponent(metadataGuardPublishState.slug), baseUrl).href);
    let metadataDirectListPayload = {};
    try {
      metadataDirectListPayload = await metadataDirectList.json();
    } catch {}
    const metadataDelete = await fetch(metadataGuardApiUrl, {
      method: 'DELETE',
      headers: { 'X-Crate-Owner-Token': metadataGuardPublishState.ownerToken },
    });
    const metadataMissing = await fetch(metadataGuardApiUrl);
    const metadataGuardState = {
      ...metadataGuardPublishState,
      updateStatus: metadataUpdate.status,
      updateOk: metadataUpdatePayload?.ok === true,
      updateAuthorization: metadataUpdatePayload?.authorization || '',
      updateVisibility: metadataUpdatePayload?.game?.visibility || '',
      updateCreator: metadataUpdatePayload?.game?.creatorName || '',
      featuredUpdateStatus: metadataFeaturedUpdate.status,
      featuredUpdateOk: metadataFeaturedPayload?.ok === true,
      featuredUpdateError: metadataFeaturedPayload?.error || '',
      directStatus: metadataDirect.status,
      directVisibility: metadataDirectPayload?.game?.visibility || '',
      directCreator: metadataDirectPayload?.game?.creatorName || '',
      directFeatured: metadataDirectPayload?.game?.featured === true,
      publicListStatus: metadataList.status,
      publicListHasSlug: Array.isArray(metadataListPayload?.games) && metadataListPayload.games.some((item) => item?.slug === metadataGuardPublishState.slug),
      directListStatus: metadataDirectList.status,
      directListVisibility: Array.isArray(metadataDirectListPayload?.games) ? (metadataDirectListPayload.games[0]?.visibility || '') : '',
      deletedStatus: metadataDelete.status,
      missingStatus: metadataMissing.status,
    };
    if (metadataGuardState.slug !== smokeMetadataGuardSlug ||
        metadataGuardState.publishStatus !== 'synced' ||
        metadataGuardState.publishSource !== 'cloudflare-pages-kv' ||
        !metadataGuardState.ownerManaged ||
        metadataGuardState.initialVisibility !== 'public' ||
        metadataGuardState.initialCreator !== 'Smoke Metadata Creator' ||
        metadataGuardState.updateStatus !== 200 ||
        !metadataGuardState.updateOk ||
        metadataGuardState.updateAuthorization !== 'owner' ||
        metadataGuardState.updateVisibility !== 'unlisted' ||
        metadataGuardState.updateCreator !== 'Smoke Updated Creator' ||
        metadataGuardState.featuredUpdateStatus !== 403 ||
        metadataGuardState.featuredUpdateOk ||
        metadataGuardState.directStatus !== 200 ||
        metadataGuardState.directVisibility !== 'unlisted' ||
        metadataGuardState.directCreator !== 'Smoke Updated Creator' ||
        metadataGuardState.directFeatured ||
        metadataGuardState.publicListStatus !== 200 ||
        metadataGuardState.publicListHasSlug ||
        metadataGuardState.directListStatus !== 200 ||
        metadataGuardState.directListVisibility !== 'unlisted' ||
        metadataGuardState.deletedStatus !== 200 ||
        metadataGuardState.missingStatus !== 404) {
      throw new Error(`Published metadata guard failed: ${JSON.stringify(metadataGuardState)}`);
    }

    const marketplaceContext = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
    });
    await addSmokeGlobals(marketplaceContext);
    const marketplacePage = await marketplaceContext.newPage();
    const marketplaceUrl = `${baseUrl}/marketplace.html?verify=${encodeURIComponent(verify + '-marketplace')}`;
    await marketplacePage.goto(marketplaceUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await marketplacePage.waitForFunction(
      () => window._cratePublishedMarketplace?.status === 'loaded' &&
        window._cratePublishedDiscovery?.status === 'loaded' &&
        document.querySelector('#published-market-grid')?.dataset.status === 'loaded',
      undefined,
      { timeout: timeoutMs }
    );
    await marketplacePage.locator('#published-market-search').fill(smokePublishedSlug);
    await marketplacePage.locator('[data-published-tag="smoke"]').click({ timeout: timeoutMs });
    await marketplacePage.locator('#published-market-sort').selectOption('objects', { timeout: timeoutMs });
    await marketplacePage.waitForFunction(
      (expectedQuery) => {
        const state = window._cratePublishedMarketplace || {};
        return state.status === 'loaded' &&
          state.query === expectedQuery &&
          state.tag === 'smoke' &&
          state.sort === 'objects';
      },
      smokePublishedSlug,
      { timeout: timeoutMs }
    );
    for (let pageIndex = 0; pageIndex < 6; pageIndex++) {
      const visible = await marketplacePage.locator(`[data-published-game="${smokePublishedSlug}"]`).count();
      if (visible > 0) break;
      const pageBefore = await marketplacePage.evaluate(() => Number(window._cratePublishedMarketplace?.page) || 0);
      const advanced = await marketplacePage.evaluate(() => {
        const state = window._cratePublishedMarketplace || {};
        const next = document.querySelector('[data-published-page="next"]');
        if (state.status !== 'loaded' || !state.hasNext || !next || next.disabled) return false;
        next.click();
        return true;
      });
      if (!advanced) break;
      await marketplacePage.waitForFunction(
        ({ previousPage, expectedQuery }) => {
          const state = window._cratePublishedMarketplace || {};
          return state.status === 'loaded' &&
            state.query === expectedQuery &&
            state.tag === 'smoke' &&
            state.sort === 'objects' &&
            Number(state.page) > Number(previousPage || 0);
        },
        { previousPage: pageBefore, expectedQuery: smokePublishedSlug },
        { timeout: timeoutMs }
      );
    }
    const marketplaceState = await marketplacePage.waitForFunction(
      ({ publishedSlug, metadataGuardSlug }) => {
        const state = window._cratePublishedMarketplace || {};
        const discovery = window._cratePublishedDiscovery || {};
        const grid = document.querySelector('#published-market-grid');
        const row = document.querySelector(`[data-published-game="${publishedSlug}"]`);
        if (state.status !== 'loaded' || state.query !== publishedSlug || state.tag !== 'smoke' || state.sort !== 'objects' || !row) return null;
        return {
          status: state.status,
          total: Number(state.total) || 0,
          shown: Number(state.shown) || 0,
          page: Number(state.page) || 0,
          pages: Number(state.pages) || 0,
          pageSize: Number(state.pageSize) || 0,
          query: state.query || '',
          tag: state.tag || '',
          sort: state.sort || '',
          availableTags: state.availableTags || [],
          discoveryStatus: discovery.status || '',
          discoveryTotal: Number(discovery.total) || 0,
          discoveryRailCards: Number(discovery.railCards) || 0,
          discoveryFeaturedSlugs: discovery.featuredSlugs || [],
          discoveryAdminFeaturedSlugs: discovery.adminFeaturedSlugs || [],
          discoveryFeaturedFlags: discovery.featuredFlags || {},
          discoveryRecentSlugs: discovery.recentSlugs || [],
          discoverySystemsSlugs: discovery.systemsSlugs || [],
          hasDiscoveryRails: !!document.querySelector('#published-market-rails'),
          hasSection: !!document.querySelector('#published-games-section'),
          hasSearch: !!document.querySelector('#published-market-search'),
          hasSort: !!document.querySelector('#published-market-sort'),
          hasTagFilters: document.querySelectorAll('[data-published-tag]').length,
          hasPagination: !!document.querySelector('#published-market-pagination'),
          hasRefresh: !!document.querySelector('#published-market-refresh'),
          hasSmoke: !!row,
          hasUnlistedGuard: !!document.querySelector(`[data-published-game="${metadataGuardSlug}"]`),
          featuredBadgeCount: document.querySelectorAll('.featured-badge').length,
          creatorText: row.querySelector('.creator')?.textContent || '',
          tagText: row.querySelector('.tags')?.textContent || '',
          playHref: row.querySelector('.actions a')?.getAttribute('href') || '',
          remixHref: row.querySelector('.actions a.secondary')?.getAttribute('href') || '',
          detailHref: row.querySelector('.actions a.detail')?.getAttribute('href') || '',
          summary: document.querySelector('#published-market-summary')?.textContent || '',
        };
      },
      { publishedSlug: smokePublishedSlug, metadataGuardSlug: smokeMetadataGuardSlug },
      { timeout: timeoutMs }
    ).then((handle) => handle.jsonValue());

    const gameDetailUrl = new URL(marketplaceState.detailHref, baseUrl).href;
    await marketplacePage.goto(`${gameDetailUrl}${gameDetailUrl.includes('?') ? '&' : '?'}verify=${encodeURIComponent(verify + '-detail')}`, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
    const gameDetailState = await marketplacePage.waitForFunction(
      (publishedSlug) => {
        const state = window._crateGameDetail || {};
        if (state.status !== 'loaded' || state.slug !== publishedSlug) return null;
        return {
          status: state.status,
          slug: state.slug || '',
          title: state.title || '',
          creatorName: state.creatorName || '',
          visibility: state.visibility || '',
          featured: state.featured === true,
          featuredAt: state.featuredAt || '',
          tags: state.tags || [],
          systems: state.systems || [],
          objects: Number(state.objects) || 0,
          components: Number(state.components) || 0,
          scripts: Number(state.scripts) || 0,
          playHref: state.playHref || '',
          remixHref: state.remixHref || '',
          hasPlay: !!document.querySelector('[data-game-action="play"]'),
          hasRemix: !!document.querySelector('[data-game-action="remix"]'),
          hasMarketplace: !!document.querySelector('[data-game-action="marketplace"]'),
          hasStats: document.querySelectorAll('.stat').length >= 4,
        };
      },
      smokePublishedSlug,
      { timeout: timeoutMs }
    ).then((handle) => handle.jsonValue());
    await marketplaceContext.close();

    const adminBlockedResponse = await fetch(new URL('/api/games/admin/list?limit=5', baseUrl).href, {
      headers: { Accept: 'application/json' },
    });
    const adminAuditBlockedResponse = await fetch(new URL(`/api/games/admin/audit/${encodeURIComponent(smokePublishedSlug)}?limit=5`, baseUrl).href, {
      headers: { Accept: 'application/json' },
    });
    const adminAuditVerifyBlockedResponse = await fetch(new URL('/api/games/admin/audit/verify', baseUrl).href, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    const adminAuditBackfillBlockedResponse = await fetch(new URL('/api/games/admin/audit/backfill?dryRun=true', baseUrl).href, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    const adminAssetCleanupBlockedResponse = await fetch(new URL('/api/assets/admin/public-cleanup', baseUrl).href, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: true, limit: 1 }),
    });
    let adminBlockedPayload = {};
    let adminAuditBlockedPayload = {};
    let adminAuditVerifyBlockedPayload = {};
    let adminAuditBackfillBlockedPayload = {};
    let adminAssetCleanupBlockedPayload = {};
    try {
      adminBlockedPayload = await adminBlockedResponse.json();
    } catch {}
    try {
      adminAuditBlockedPayload = await adminAuditBlockedResponse.json();
    } catch {}
    try {
      adminAuditVerifyBlockedPayload = await adminAuditVerifyBlockedResponse.json();
    } catch {}
    try {
      adminAuditBackfillBlockedPayload = await adminAuditBackfillBlockedResponse.json();
    } catch {}
    try {
      adminAssetCleanupBlockedPayload = await adminAssetCleanupBlockedResponse.json();
    } catch {}
    const adminGuardState = {
      blockedStatus: adminBlockedResponse.status,
      blockedError: adminBlockedPayload?.error || '',
      auditBlockedStatus: adminAuditBlockedResponse.status,
      auditBlockedError: adminAuditBlockedPayload?.error || '',
      auditVerifyBlockedStatus: adminAuditVerifyBlockedResponse.status,
      auditVerifyBlockedError: adminAuditVerifyBlockedPayload?.error || '',
      auditBackfillBlockedStatus: adminAuditBackfillBlockedResponse.status,
      auditBackfillBlockedError: adminAuditBackfillBlockedPayload?.error || '',
      assetCleanupBlockedStatus: adminAssetCleanupBlockedResponse.status,
      assetCleanupBlockedError: adminAssetCleanupBlockedPayload?.error || '',
    };
    if (adminGuardState.blockedStatus !== 403 ||
        !/admin authorization/i.test(adminGuardState.blockedError) ||
        adminGuardState.auditBlockedStatus !== 403 ||
        !/admin authorization/i.test(adminGuardState.auditBlockedError) ||
        adminGuardState.auditVerifyBlockedStatus !== 403 ||
        !/admin authorization/i.test(adminGuardState.auditVerifyBlockedError) ||
        adminGuardState.auditBackfillBlockedStatus !== 403 ||
        !/admin authorization/i.test(adminGuardState.auditBackfillBlockedError) ||
        adminGuardState.assetCleanupBlockedStatus !== 403 ||
        !/admin authorization/i.test(adminGuardState.assetCleanupBlockedError)) {
      throw new Error(`Admin moderation API guard failed: ${JSON.stringify(adminGuardState)}`);
    }

    let adminAuditVerifyState = null;
    let adminAssetCleanupDryRunState = null;
    if (smokeAdminToken) {
      const adminAuditVerifyResponse = await fetch(new URL('/api/games/admin/audit/verify', baseUrl).href, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'X-Crate-Admin-Token': smokeAdminToken,
        },
      });
      let adminAuditVerifyPayload = {};
      try {
        adminAuditVerifyPayload = await adminAuditVerifyResponse.json();
      } catch {}
      adminAuditVerifyState = {
        status: adminAuditVerifyResponse.status,
        ok: adminAuditVerifyPayload?.ok === true,
        source: adminAuditVerifyPayload?.source || '',
        mode: adminAuditVerifyPayload?.mode || '',
        inserted: adminAuditVerifyPayload?.inserted === true,
        deleted: adminAuditVerifyPayload?.deleted === true,
        writeVerified: adminAuditVerifyPayload?.writeVerified === true,
        adminRole: adminAuditVerifyPayload?.admin?.role || '',
      };
      if (adminAuditVerifyState.status !== 200 ||
          !adminAuditVerifyState.ok ||
          adminAuditVerifyState.source !== 'd1' ||
          adminAuditVerifyState.mode !== 'temporary-probe' ||
          !adminAuditVerifyState.inserted ||
          !adminAuditVerifyState.deleted ||
          !adminAuditVerifyState.writeVerified ||
          adminAuditVerifyState.adminRole !== 'admin') {
        throw new Error(`Admin audit D1 verification failed: ${JSON.stringify(adminAuditVerifyState)}`);
      }
      const adminAssetCleanupResponse = await fetch(new URL('/api/assets/admin/public-cleanup', baseUrl).href, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Crate-Admin-Token': smokeAdminToken,
        },
        body: JSON.stringify({ dryRun: true, limit: 10 }),
      });
      let adminAssetCleanupPayload = {};
      try {
        adminAssetCleanupPayload = await adminAssetCleanupResponse.json();
      } catch {}
      adminAssetCleanupDryRunState = {
        status: adminAssetCleanupResponse.status,
        ok: adminAssetCleanupPayload?.ok === true,
        dryRun: adminAssetCleanupPayload?.dryRun === true,
        scanned: Number(adminAssetCleanupPayload?.scanned) || 0,
        orphaned: Number(adminAssetCleanupPayload?.orphaned) || 0,
        deleted: Number(adminAssetCleanupPayload?.deleted) || 0,
        errors: Array.isArray(adminAssetCleanupPayload?.errors) ? adminAssetCleanupPayload.errors.length : 0,
      };
      if (adminAssetCleanupDryRunState.status !== 200 ||
          !adminAssetCleanupDryRunState.ok ||
          !adminAssetCleanupDryRunState.dryRun ||
          adminAssetCleanupDryRunState.deleted !== 0 ||
          adminAssetCleanupDryRunState.errors !== 0) {
        throw new Error(`Admin public asset cleanup dry run failed: ${JSON.stringify(adminAssetCleanupDryRunState)}`);
      }
    }

    const adminContext = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
    });
    await addSmokeGlobals(adminContext);
    const adminPage = await adminContext.newPage();
    const adminUrl = `${baseUrl}/admin.html?verify=${encodeURIComponent(verify + '-admin')}`;
    await adminPage.goto(adminUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const adminDashboardState = await adminPage.waitForFunction(
      () => {
        const state = window._crateAdminDashboard || {};
        if (!state.hasTokenInput || !state.hasControls || !state.hasTable || !state.hasAdminActor || !state.hasAuditDetail || !state.hasAuditStorage || !state.hasAssetCleanup || !state.hasCleanupWorker) return null;
        if (state.cleanupWorkerStatus === 'checking') return null;
        return {
          status: state.status || '',
          tokenStored: state.tokenStored === true,
          hasTokenInput: state.hasTokenInput === true,
          hasControls: state.hasControls === true,
          hasTable: state.hasTable === true,
          hasAuditDetail: state.hasAuditDetail === true,
          hasAuditStorage: state.hasAuditStorage === true,
          hasAuditStorageVerify: state.hasAuditStorageVerify === true,
          hasAuditBackfillDryRun: state.hasAuditBackfillDryRun === true,
          hasAuditBackfillRun: state.hasAuditBackfillRun === true,
          hasAssetCleanup: state.hasAssetCleanup === true,
          hasAssetCleanupDryRun: state.hasAssetCleanupDryRun === true,
          hasAssetCleanupRun: state.hasAssetCleanupRun === true,
          hasCleanupWorker: state.hasCleanupWorker === true,
          hasCleanupWorkerDryRun: state.hasCleanupWorkerDryRun === true,
          hasCleanupWorkerExport: state.hasCleanupWorkerExport === true,
          hasCleanupWorkerCsvExport: state.hasCleanupWorkerCsvExport === true,
          auditStorageStatus: state.auditStorageStatus || '',
          auditStorageWriteVerified: state.auditStorageWriteVerified === true,
          auditBackfillStatus: state.auditBackfillStatus || '',
          auditBackfillDryRun: state.auditBackfillDryRun === true,
          auditBackfillScanned: Number(state.auditBackfillScanned) || 0,
          auditBackfillEvents: Number(state.auditBackfillEvents) || 0,
          auditBackfillWritten: Number(state.auditBackfillWritten) || 0,
          assetCleanupStatus: state.assetCleanupStatus || '',
          assetCleanupDryRun: state.assetCleanupDryRun === true,
          assetCleanupScanned: Number(state.assetCleanupScanned) || 0,
          assetCleanupOrphaned: Number(state.assetCleanupOrphaned) || 0,
          assetCleanupDeleted: Number(state.assetCleanupDeleted) || 0,
          assetCleanupErrors: Number(state.assetCleanupErrors) || 0,
          cleanupWorkerStatus: state.cleanupWorkerStatus || '',
          cleanupWorkerName: state.cleanupWorkerName || '',
          cleanupWorkerUrl: state.cleanupWorkerUrl || '',
          cleanupWorkerDeleteEnabled: state.cleanupWorkerDeleteEnabled === true,
          cleanupWorkerLimit: Number(state.cleanupWorkerLimit) || 0,
          cleanupWorkerHasR2Binding: state.cleanupWorkerHasR2Binding === true,
          cleanupWorkerHasGameStore: state.cleanupWorkerHasGameStore === true,
          cleanupWorkerHasAuditStore: state.cleanupWorkerHasAuditStore === true,
          cleanupWorkerRunning: state.cleanupWorkerRunning === true,
          cleanupWorkerExporting: state.cleanupWorkerExporting === true,
          cleanupWorkerExportFormat: state.cleanupWorkerExportFormat || '',
          cleanupWorkerLastRunKnown: state.cleanupWorkerLastRunKnown === true,
          cleanupWorkerHasLastRun: state.cleanupWorkerHasLastRun === true,
          cleanupWorkerLastRunPersisted: state.cleanupWorkerLastRunPersisted === true,
          cleanupWorkerHistoryKnown: state.cleanupWorkerHistoryKnown === true,
          cleanupWorkerHistoryCount: Number(state.cleanupWorkerHistoryCount) || 0,
          cleanupWorkerHistoryLimit: Number(state.cleanupWorkerHistoryLimit) || 0,
          cleanupWorkerHistoryPersisted: state.cleanupWorkerHistoryPersisted === true,
          cleanupWorkerD1HistoryAvailable: state.cleanupWorkerD1HistoryAvailable === true,
          cleanupWorkerD1HistoryPersisted: state.cleanupWorkerD1HistoryPersisted === true,
          cleanupWorkerHistorySource: state.cleanupWorkerHistorySource || '',
          cleanupWorkerKvHistoryCount: Number(state.cleanupWorkerKvHistoryCount) || 0,
          cleanupWorkerExportCount: Number(state.cleanupWorkerExportCount) || 0,
          cleanupWorkerExportFileName: state.cleanupWorkerExportFileName || '',
          cleanupWorkerLatestHistoryReason: state.cleanupWorkerLatestHistoryReason || '',
          cleanupWorkerLastRunReason: state.cleanupWorkerLastRunReason || '',
          cleanupWorkerLastRunFinishedAt: state.cleanupWorkerLastRunFinishedAt || '',
          cleanupWorkerLastRunScanned: Number(state.cleanupWorkerLastRunScanned) || 0,
          cleanupWorkerLastRunOrphaned: Number(state.cleanupWorkerLastRunOrphaned) || 0,
          cleanupWorkerLastRunDeleted: Number(state.cleanupWorkerLastRunDeleted) || 0,
          cleanupWorkerLastRunErrorCount: Number(state.cleanupWorkerLastRunErrorCount) || 0,
          cleanupWorkerLastRunDryRun: state.cleanupWorkerLastRunDryRun !== false,
          cleanupWorkerError: state.cleanupWorkerError || '',
          hasCleanupAudit: state.hasCleanupAudit === true,
          hasCleanupAuditRefresh: state.hasCleanupAuditRefresh === true,
          cleanupAuditStatus: state.cleanupAuditStatus || '',
          cleanupAuditRows: Number(state.cleanupAuditRows) || 0,
          cleanupAuditTotal: Number(state.cleanupAuditTotal) || 0,
          cleanupAuditSource: state.cleanupAuditSource || '',
          cleanupAuditReason: state.cleanupAuditReason || '',
          cleanupAuditMode: state.cleanupAuditMode || '',
          cleanupAuditFrom: state.cleanupAuditFrom || '',
          cleanupAuditTo: state.cleanupAuditTo || '',
          cleanupAuditLimit: Number(state.cleanupAuditLimit) || 0,
          cleanupAuditOffset: Number(state.cleanupAuditOffset) || 0,
          cleanupAuditHasPrevious: state.cleanupAuditHasPrevious === true,
          cleanupAuditHasNext: state.cleanupAuditHasNext === true,
          cleanupAuditExporting: state.cleanupAuditExporting === true,
          cleanupAuditExportCount: Number(state.cleanupAuditExportCount) || 0,
          cleanupAuditExportFileName: state.cleanupAuditExportFileName || '',
          cleanupAuditLatestReason: state.cleanupAuditLatestReason || '',
          cleanupAuditLatestDryRun: state.cleanupAuditLatestDryRun === true,
          cleanupAuditLatestRunId: state.cleanupAuditLatestRunId || '',
          cleanupAuditRefreshDisabled: document.querySelector('#refresh-cleanup-audit')?.disabled === true,
          hasCleanupAuditCsvExport: !!document.querySelector('#export-cleanup-audit-csv'),
          cleanupAuditCsvExportDisabled: document.querySelector('#export-cleanup-audit-csv')?.disabled === true,
          hasCleanupAuditPrevious: !!document.querySelector('#cleanup-audit-prev'),
          cleanupAuditPreviousDisabled: document.querySelector('#cleanup-audit-prev')?.disabled === true,
          hasCleanupAuditNext: !!document.querySelector('#cleanup-audit-next'),
          cleanupAuditNextDisabled: document.querySelector('#cleanup-audit-next')?.disabled === true,
          hasCleanupAuditDateFilters: !!document.querySelector('#cleanup-audit-from') && !!document.querySelector('#cleanup-audit-to'),
          cleanupAuditFromDisabled: document.querySelector('#cleanup-audit-from')?.disabled === true,
          cleanupAuditToDisabled: document.querySelector('#cleanup-audit-to')?.disabled === true,
          hasCleanupAuditRows: !!document.querySelector('#cleanup-audit-rows'),
          cleanupAuditEmptyVisible: !!document.querySelector('#cleanup-audit-rows .empty'),
          auditDetailStatus: state.auditDetailStatus || '',
          auditDetailRows: Number(state.auditDetailRows) || 0,
          hasAdminActor: state.hasAdminActor === true,
          adminName: state.adminName || '',
          adminRole: state.adminRole || '',
          rowSlugs: state.rowSlugs || [],
          summary: document.querySelector('#table-summary')?.textContent || '',
          hasSearch: !!document.querySelector('#admin-search'),
          hasFilter: !!document.querySelector('#admin-filter'),
          hasSort: !!document.querySelector('#admin-sort'),
          hasRefresh: !!document.querySelector('#refresh-admin'),
          hasSave: !!document.querySelector('#save-token'),
          hasClear: !!document.querySelector('#clear-token'),
          hasCleanupWorkerDryRunAction: !!document.querySelector('#dry-run-cleanup-worker'),
          cleanupWorkerDryRunDisabled: document.querySelector('#dry-run-cleanup-worker')?.disabled === true,
          hasCleanupWorkerExportAction: !!document.querySelector('#export-cleanup-history'),
          cleanupWorkerExportDisabled: document.querySelector('#export-cleanup-history')?.disabled === true,
          hasCleanupWorkerCsvExportAction: !!document.querySelector('#export-cleanup-history-csv'),
          cleanupWorkerCsvExportDisabled: document.querySelector('#export-cleanup-history-csv')?.disabled === true,
          hasReviewNoteInput: !!document.querySelector('#admin-review-note'),
          reviewNoteRequired: state.reviewNoteRequired === true,
          reviewNoteCount: document.querySelector('#review-note-count')?.textContent || '',
          hasReviewQueue: /Review Queue/i.test(document.body.textContent || ''),
        };
      },
      undefined,
      { timeout: timeoutMs }
    ).then((handle) => handle.jsonValue());
    if (adminDashboardState.status !== 'locked' ||
        adminDashboardState.tokenStored ||
        !adminDashboardState.hasSearch ||
        !adminDashboardState.hasFilter ||
        !adminDashboardState.hasSort ||
        !adminDashboardState.hasRefresh ||
        !adminDashboardState.hasSave ||
        !adminDashboardState.hasClear ||
        !adminDashboardState.hasAdminActor ||
        !adminDashboardState.hasAuditDetail ||
        !adminDashboardState.hasAuditStorage ||
        !adminDashboardState.hasAuditStorageVerify ||
        !adminDashboardState.hasAuditBackfillDryRun ||
        !adminDashboardState.hasAuditBackfillRun ||
        !adminDashboardState.hasAssetCleanup ||
        !adminDashboardState.hasAssetCleanupDryRun ||
        !adminDashboardState.hasAssetCleanupRun ||
        !adminDashboardState.hasCleanupWorker ||
        !adminDashboardState.hasCleanupWorkerDryRun ||
        !adminDashboardState.hasCleanupWorkerExport ||
        !adminDashboardState.hasCleanupWorkerCsvExport ||
        !adminDashboardState.hasCleanupAudit ||
        !adminDashboardState.hasCleanupAuditRefresh ||
        !adminDashboardState.hasCleanupAuditRows ||
        !adminDashboardState.hasCleanupAuditCsvExport ||
        !adminDashboardState.hasCleanupAuditPrevious ||
        !adminDashboardState.hasCleanupAuditNext ||
        !adminDashboardState.hasCleanupAuditDateFilters ||
        !adminDashboardState.hasCleanupWorkerDryRunAction ||
        !adminDashboardState.cleanupWorkerDryRunDisabled ||
        !adminDashboardState.hasCleanupWorkerExportAction ||
        !adminDashboardState.cleanupWorkerExportDisabled ||
        !adminDashboardState.hasCleanupWorkerCsvExportAction ||
        !adminDashboardState.cleanupWorkerCsvExportDisabled ||
        !adminDashboardState.cleanupAuditRefreshDisabled ||
        !adminDashboardState.cleanupAuditCsvExportDisabled ||
        !adminDashboardState.cleanupAuditPreviousDisabled ||
        !adminDashboardState.cleanupAuditNextDisabled ||
        !adminDashboardState.cleanupAuditFromDisabled ||
        !adminDashboardState.cleanupAuditToDisabled ||
        adminDashboardState.cleanupAuditStatus !== 'locked' ||
        adminDashboardState.cleanupAuditRows !== 0 ||
        adminDashboardState.cleanupAuditTotal !== 0 ||
        adminDashboardState.cleanupAuditReason !== 'all' ||
        adminDashboardState.cleanupAuditMode !== 'all' ||
        adminDashboardState.cleanupAuditFrom ||
        adminDashboardState.cleanupAuditTo ||
        adminDashboardState.cleanupAuditOffset !== 0 ||
        adminDashboardState.cleanupAuditHasPrevious ||
        adminDashboardState.cleanupAuditHasNext ||
        adminDashboardState.cleanupAuditExporting ||
        !adminDashboardState.cleanupAuditEmptyVisible ||
        adminDashboardState.auditStorageStatus !== 'locked' ||
        adminDashboardState.auditStorageWriteVerified ||
        adminDashboardState.auditBackfillStatus !== 'locked' ||
        !adminDashboardState.auditBackfillDryRun ||
        adminDashboardState.auditBackfillScanned !== 0 ||
        adminDashboardState.auditBackfillEvents !== 0 ||
        adminDashboardState.auditBackfillWritten !== 0 ||
        adminDashboardState.assetCleanupStatus !== 'locked' ||
        !adminDashboardState.assetCleanupDryRun ||
        adminDashboardState.assetCleanupScanned !== 0 ||
        adminDashboardState.assetCleanupOrphaned !== 0 ||
        adminDashboardState.assetCleanupDeleted !== 0 ||
        adminDashboardState.assetCleanupErrors !== 0 ||
        adminDashboardState.cleanupWorkerStatus !== 'ready' ||
        adminDashboardState.cleanupWorkerName !== 'crateship-public-asset-cleanup' ||
        adminDashboardState.cleanupWorkerDeleteEnabled ||
        adminDashboardState.cleanupWorkerLimit <= 0 ||
        !adminDashboardState.cleanupWorkerHasR2Binding ||
        !adminDashboardState.cleanupWorkerHasGameStore ||
        !adminDashboardState.cleanupWorkerHasAuditStore ||
        !adminDashboardState.cleanupWorkerD1HistoryAvailable ||
        !adminDashboardState.cleanupWorkerHistorySource ||
        !adminDashboardState.cleanupWorkerLastRunKnown ||
        !adminDashboardState.cleanupWorkerHistoryKnown ||
        adminDashboardState.cleanupWorkerHistoryLimit <= 0 ||
        adminDashboardState.auditDetailStatus !== 'empty' ||
        adminDashboardState.adminName ||
        adminDashboardState.adminRole ||
        !adminDashboardState.hasReviewNoteInput ||
        !adminDashboardState.reviewNoteRequired ||
        !adminDashboardState.hasReviewQueue) {
      throw new Error(`Admin dashboard locked state failed: ${JSON.stringify(adminDashboardState)}`);
    }

    let adminDashboardAuthedState = null;
    let adminDashboardAuditState = null;
    let adminDashboardStorageState = null;
    let adminDashboardBackfillState = null;
    let adminDashboardAssetCleanupState = null;
    let adminDashboardCleanupWorkerDryRunState = null;
    let adminDashboardCleanupWorkerExportState = null;
    let adminDashboardCleanupWorkerCsvExportState = null;
    let adminDashboardCleanupAuditState = null;
    let adminDashboardCleanupAuditCsvState = null;
    if (smokeAdminToken) {
      await adminPage.locator('#admin-token').fill(smokeAdminToken);
      await adminPage.locator('#save-token').click({ timeout: timeoutMs });
      adminDashboardAuthedState = await adminPage.waitForFunction(
        () => {
          const state = window._crateAdminDashboard || {};
          if (state.status !== 'loaded') return null;
          return {
            status: state.status || '',
            total: Number(state.total) || 0,
            shown: Number(state.shown) || 0,
            adminName: state.adminName || '',
            adminRole: state.adminRole || '',
            hasAdminActor: state.hasAdminActor === true,
            rowSlugs: state.rowSlugs || [],
            counts: state.counts || {},
            auditRows: Number(state.auditRows) || 0,
            noteRows: Number(state.noteRows) || 0,
            featuredRows: Number(state.featuredRows) || 0,
            hiddenRows: Number(state.hiddenRows) || 0,
          };
        },
        undefined,
        { timeout: timeoutMs }
      ).then((handle) => handle.jsonValue());
      if (!adminDashboardAuthedState.rowSlugs.includes(smokePublishedSlug)) {
        throw new Error(`Admin dashboard did not list smoke published game: ${JSON.stringify(adminDashboardAuthedState)}`);
      }
      await adminPage.locator('#verify-audit-storage').click({ timeout: timeoutMs });
      adminDashboardStorageState = await adminPage.waitForFunction(
        () => {
          const state = window._crateAdminDashboard || {};
          if (state.auditStorageStatus !== 'verified') return null;
          return {
            status: state.auditStorageStatus || '',
            source: state.auditStorageSource || '',
            writeVerified: state.auditStorageWriteVerified === true,
          };
        },
        undefined,
        { timeout: timeoutMs }
      ).then((handle) => handle.jsonValue());
      if (adminDashboardStorageState.source !== 'd1' || !adminDashboardStorageState.writeVerified) {
        throw new Error(`Admin dashboard D1 storage probe did not verify: ${JSON.stringify(adminDashboardStorageState)}`);
      }
      await adminPage.locator('#dry-run-audit-backfill').click({ timeout: timeoutMs });
      adminDashboardBackfillState = await adminPage.waitForFunction(
        () => {
          const state = window._crateAdminDashboard || {};
          if (state.auditBackfillStatus !== 'dry-run') return null;
          return {
            status: state.auditBackfillStatus || '',
            dryRun: state.auditBackfillDryRun === true,
            scanned: Number(state.auditBackfillScanned) || 0,
            events: Number(state.auditBackfillEvents) || 0,
            written: Number(state.auditBackfillWritten) || 0,
          };
        },
        undefined,
        { timeout: timeoutMs }
      ).then((handle) => handle.jsonValue());
      if (!adminDashboardBackfillState.dryRun || adminDashboardBackfillState.written !== 0) {
        throw new Error(`Admin dashboard D1 backfill dry run did not stay read-only: ${JSON.stringify(adminDashboardBackfillState)}`);
      }
      await adminPage.locator('#dry-run-asset-cleanup').click({ timeout: timeoutMs });
      adminDashboardAssetCleanupState = await adminPage.waitForFunction(
        () => {
          const state = window._crateAdminDashboard || {};
          if (state.assetCleanupStatus !== 'dry-run') return null;
          return {
            status: state.assetCleanupStatus || '',
            dryRun: state.assetCleanupDryRun === true,
            scanned: Number(state.assetCleanupScanned) || 0,
            orphaned: Number(state.assetCleanupOrphaned) || 0,
            deleted: Number(state.assetCleanupDeleted) || 0,
            errors: Number(state.assetCleanupErrors) || 0,
          };
        },
        undefined,
        { timeout: timeoutMs }
      ).then((handle) => handle.jsonValue());
      if (!adminDashboardAssetCleanupState.dryRun || adminDashboardAssetCleanupState.deleted !== 0 || adminDashboardAssetCleanupState.errors !== 0) {
        throw new Error(`Admin dashboard public asset cleanup dry run failed: ${JSON.stringify(adminDashboardAssetCleanupState)}`);
      }
      await adminPage.locator('#dry-run-cleanup-worker').click({ timeout: timeoutMs });
      adminDashboardCleanupWorkerDryRunState = await adminPage.waitForFunction(
        () => {
          const state = window._crateAdminDashboard || {};
          if (state.cleanupWorkerRunning === true) return null;
          if (!state.cleanupWorkerHasLastRun || state.cleanupWorkerLastRunReason !== 'manual-api') return null;
          return {
            status: state.cleanupWorkerStatus || '',
            hasLastRun: state.cleanupWorkerHasLastRun === true,
            lastRunPersisted: state.cleanupWorkerLastRunPersisted === true,
            historyKnown: state.cleanupWorkerHistoryKnown === true,
            historyCount: Number(state.cleanupWorkerHistoryCount) || 0,
            historyPersisted: state.cleanupWorkerHistoryPersisted === true,
            d1HistoryAvailable: state.cleanupWorkerD1HistoryAvailable === true,
            d1HistoryPersisted: state.cleanupWorkerD1HistoryPersisted === true,
            historySource: state.cleanupWorkerHistorySource || '',
            latestHistoryReason: state.cleanupWorkerLatestHistoryReason || '',
            reason: state.cleanupWorkerLastRunReason || '',
            dryRun: state.cleanupWorkerLastRunDryRun === true,
            scanned: Number(state.cleanupWorkerLastRunScanned) || 0,
            orphaned: Number(state.cleanupWorkerLastRunOrphaned) || 0,
            deleted: Number(state.cleanupWorkerLastRunDeleted) || 0,
            errors: Number(state.cleanupWorkerLastRunErrorCount) || 0,
          };
        },
        undefined,
        { timeout: timeoutMs }
      ).then((handle) => handle.jsonValue());
      if (adminDashboardCleanupWorkerDryRunState.status !== 'ready' ||
          !adminDashboardCleanupWorkerDryRunState.hasLastRun ||
          !adminDashboardCleanupWorkerDryRunState.lastRunPersisted ||
          !adminDashboardCleanupWorkerDryRunState.historyKnown ||
          !adminDashboardCleanupWorkerDryRunState.historyPersisted ||
          !adminDashboardCleanupWorkerDryRunState.d1HistoryAvailable ||
          !adminDashboardCleanupWorkerDryRunState.d1HistoryPersisted ||
          adminDashboardCleanupWorkerDryRunState.historySource !== 'd1' ||
          adminDashboardCleanupWorkerDryRunState.historyCount < 1 ||
          adminDashboardCleanupWorkerDryRunState.latestHistoryReason !== 'manual-api' ||
          adminDashboardCleanupWorkerDryRunState.reason !== 'manual-api' ||
          !adminDashboardCleanupWorkerDryRunState.dryRun ||
          adminDashboardCleanupWorkerDryRunState.deleted !== 0 ||
          adminDashboardCleanupWorkerDryRunState.errors !== 0) {
        throw new Error(`Admin dashboard cleanup Worker dry scan failed: ${JSON.stringify(adminDashboardCleanupWorkerDryRunState)}`);
      }
      await adminPage.locator('#refresh-cleanup-audit').click({ timeout: timeoutMs });
      adminDashboardCleanupAuditState = await adminPage.waitForFunction(
        () => {
          const state = window._crateAdminDashboard || {};
          if (state.cleanupAuditStatus !== 'loaded' || Number(state.cleanupAuditRows) < 1) return null;
          return {
            status: state.cleanupAuditStatus || '',
            rows: Number(state.cleanupAuditRows) || 0,
            total: Number(state.cleanupAuditTotal) || 0,
            source: state.cleanupAuditSource || '',
            reason: state.cleanupAuditReason || '',
            mode: state.cleanupAuditMode || '',
            latestReason: state.cleanupAuditLatestReason || '',
            latestDryRun: state.cleanupAuditLatestDryRun === true,
            latestRunId: state.cleanupAuditLatestRunId || '',
          };
        },
        undefined,
        { timeout: timeoutMs }
      ).then((handle) => handle.jsonValue());
      if (adminDashboardCleanupAuditState.status !== 'loaded' ||
          adminDashboardCleanupAuditState.rows < 1 ||
          adminDashboardCleanupAuditState.source !== 'd1' ||
          adminDashboardCleanupAuditState.latestReason !== 'manual-api' ||
          !adminDashboardCleanupAuditState.latestDryRun ||
          (adminDashboardCleanupWorkerDryRunState.runId && adminDashboardCleanupAuditState.latestRunId !== adminDashboardCleanupWorkerDryRunState.runId)) {
        throw new Error(`Admin dashboard cleanup audit browser failed: ${JSON.stringify(adminDashboardCleanupAuditState)}`);
      }
      await adminPage.locator('#export-cleanup-audit-csv').click({ timeout: timeoutMs });
      adminDashboardCleanupAuditCsvState = await adminPage.waitForFunction(
        () => {
          const state = window._crateAdminDashboard || {};
          const exported = window._crateCleanupAuditCsvExport || null;
          if (state.cleanupAuditExporting === true || !exported || typeof exported.text !== 'string') return null;
          return {
            ok: exported.ok === true,
            rowCount: Number(exported.rowCount) || 0,
            stateCount: Number(state.cleanupAuditExportCount) || 0,
            fileName: state.cleanupAuditExportFileName || exported.fileName || '',
            hasHeader: /^exportGeneratedAt,worker,adminName,adminRole,runId,/i.test(exported.text || ''),
            hasManualRun: /manual-api/i.test(exported.text || ''),
          };
        },
        undefined,
        { timeout: timeoutMs }
      ).then((handle) => handle.jsonValue());
      if (!adminDashboardCleanupAuditCsvState.ok ||
          adminDashboardCleanupAuditCsvState.rowCount < 1 ||
          adminDashboardCleanupAuditCsvState.stateCount < 1 ||
          !adminDashboardCleanupAuditCsvState.hasHeader ||
          !adminDashboardCleanupAuditCsvState.hasManualRun ||
          !/cleanup-audit/i.test(adminDashboardCleanupAuditCsvState.fileName || '') ||
          !/\.csv$/i.test(adminDashboardCleanupAuditCsvState.fileName || '')) {
        throw new Error(`Admin dashboard cleanup audit CSV export failed: ${JSON.stringify(adminDashboardCleanupAuditCsvState)}`);
      }
      await adminPage.locator('#export-cleanup-history').click({ timeout: timeoutMs });
      adminDashboardCleanupWorkerExportState = await adminPage.waitForFunction(
        () => {
          const state = window._crateAdminDashboard || {};
          const exported = window._crateCleanupHistoryExport || null;
          if (state.cleanupWorkerExporting === true || !exported || !Array.isArray(exported.history)) return null;
          return {
            ok: exported.ok === true,
            exportedCount: exported.history.length,
            stateCount: Number(state.cleanupWorkerExportCount) || 0,
            fileName: state.cleanupWorkerExportFileName || exported.exportFileName || '',
            latestReason: exported.history[0]?.reason || '',
          };
        },
        undefined,
        { timeout: timeoutMs }
      ).then((handle) => handle.jsonValue());
      if (!adminDashboardCleanupWorkerExportState.ok ||
          adminDashboardCleanupWorkerExportState.exportedCount < 1 ||
          adminDashboardCleanupWorkerExportState.stateCount < 1 ||
          adminDashboardCleanupWorkerExportState.latestReason !== 'manual-api' ||
          !/cleanup-history/i.test(adminDashboardCleanupWorkerExportState.fileName || '')) {
        throw new Error(`Admin dashboard cleanup history export failed: ${JSON.stringify(adminDashboardCleanupWorkerExportState)}`);
      }
      await adminPage.locator('#export-cleanup-history-csv').click({ timeout: timeoutMs });
      adminDashboardCleanupWorkerCsvExportState = await adminPage.waitForFunction(
        () => {
          const state = window._crateAdminDashboard || {};
          const exported = window._crateCleanupHistoryCsvExport || null;
          if (state.cleanupWorkerExporting === true || !exported || typeof exported.text !== 'string') return null;
          return {
            ok: exported.ok === true,
            rowCount: Number(exported.rowCount) || 0,
            stateCount: Number(state.cleanupWorkerExportCount) || 0,
            fileName: state.cleanupWorkerExportFileName || exported.fileName || '',
            format: state.cleanupWorkerExportFormat || '',
            hasHeader: /^exportGeneratedAt,worker,adminName,adminRole,runId,/i.test(exported.text || ''),
            hasManualRun: /manual-api/i.test(exported.text || ''),
          };
        },
        undefined,
        { timeout: timeoutMs }
      ).then((handle) => handle.jsonValue());
      if (!adminDashboardCleanupWorkerCsvExportState.ok ||
          adminDashboardCleanupWorkerCsvExportState.rowCount < 1 ||
          adminDashboardCleanupWorkerCsvExportState.stateCount < 1 ||
          adminDashboardCleanupWorkerCsvExportState.format !== 'csv' ||
          !adminDashboardCleanupWorkerCsvExportState.hasHeader ||
          !adminDashboardCleanupWorkerCsvExportState.hasManualRun ||
          !/cleanup-history/i.test(adminDashboardCleanupWorkerCsvExportState.fileName || '') ||
          !/\.csv$/i.test(adminDashboardCleanupWorkerCsvExportState.fileName || '')) {
        throw new Error(`Admin dashboard cleanup CSV export failed: ${JSON.stringify(adminDashboardCleanupWorkerCsvExportState)}`);
      }
      await adminPage.locator(`button[data-action="audit"][data-slug="${smokePublishedSlug}"]`).click({ timeout: timeoutMs });
      adminDashboardAuditState = await adminPage.waitForFunction(
        () => {
          const state = window._crateAdminDashboard || {};
          if (state.auditDetailStatus !== 'loaded') return null;
          return {
            status: state.auditDetailStatus || '',
            slug: state.auditDetailSlug || '',
            rows: Number(state.auditDetailRows) || 0,
            source: state.auditDetailSource || '',
          };
        },
        undefined,
        { timeout: timeoutMs }
      ).then((handle) => handle.jsonValue());
      if (adminDashboardAuditState.slug !== smokePublishedSlug) {
        throw new Error(`Admin dashboard audit detail did not load smoke game: ${JSON.stringify(adminDashboardAuditState)}`);
      }
    }
    await adminContext.close();

    const publishedLoadContext = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
    });
    await addSmokeGlobals(publishedLoadContext);
    const publishedLoadPage = await publishedLoadContext.newPage();
    publishedLoadPage.on('console', (message) => {
      const text = summarizeConsoleMessage(message);
      if (
        message.type() === 'error' ||
        /RGBELoader|Couldn't load texture|Error creating WebGL|Engine error|ReferenceError|TypeError|SyntaxError/i.test(text)
      ) {
        badConsole.push(text);
      }
    });
    publishedLoadPage.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
    publishedLoadPage.on('response', (response) => {
      const url = response.url();
      if ((url.includes('/models/') || url.includes('/textures/')) && response.status() >= 400) {
        badAssetResponses.push(`${response.status()} ${url}`);
      }
    });
    const publishedLoadUrl = `${publishedState.shareUrl}${publishedState.shareUrl.includes('?') ? '&' : '?'}verify=${encodeURIComponent(verify + '-published-load')}`;
    await publishedLoadPage.goto(publishedLoadUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await publishedLoadPage.waitForFunction(
      () => window._engineReady === true && window._engineBridge && window._lastSharedSceneLoad?.status === 'cloud-published',
      undefined,
      { timeout: timeoutMs }
    );
    const publishedLoadState = await publishedLoadPage.waitForFunction(
      () => {
        const load = window._lastSharedSceneLoad || {};
        const projectLoad = window._lastProjectLoad || {};
        const objectCount = window._engineBridge?.objects?.length || 0;
        if (load.status !== 'cloud-published' || objectCount < 100 || projectLoad.status !== 'loaded') return null;
        return {
          status: load.status,
          slug: load.slug || '',
          objectCount,
          projectStatus: projectLoad.status || '',
          restoredObjects: projectLoad.restoredObjects || 0,
          commandCount: projectLoad.commandCount || 0,
        };
      },
      undefined,
      { timeout: timeoutMs }
    ).then((handle) => handle.jsonValue());
    await publishedLoadContext.close();

    await page.evaluate(() => window._showPublishedGames?.());
    await page.waitForSelector('#published-games-modal', { timeout: timeoutMs });
    await page.waitForFunction(
      () => {
        const publishedSlug = window.__CRATE_SMOKE?.publishedSlug || 'production-smoke-published-game';
        return document.querySelector('#published-cloud-list')?.dataset.status === 'loaded' &&
          Array.isArray(window._lastCloudPublishedGames) &&
          window._lastCloudPublishedGames.some((game) => game?.slug === publishedSlug);
      },
      undefined,
      { timeout: timeoutMs }
    );
    const publishedLibraryState = await page.evaluate(() => {
      const publishedSlug = window.__CRATE_SMOKE?.publishedSlug || 'production-smoke-published-game';
      const modal = document.querySelector('#published-games-modal');
      const cloudRows = [...document.querySelectorAll('#published-cloud-list [data-published-row]')];
      const localRows = [...document.querySelectorAll('#published-local-list [data-published-row]')];
      const cloudRow = cloudRows.find((row) => row.dataset.publishedRow === publishedSlug);
      const localRow = localRows.find((row) => row.dataset.publishedRow === publishedSlug);
      const cloudUrl = cloudRow?.querySelector('input')?.value || '';
      const localUrl = localRow?.querySelector('input')?.value || '';
      const copyButtons = modal ? modal.querySelectorAll('[data-publish-copy]').length : 0;
      const openButtons = modal ? modal.querySelectorAll('[data-publish-open]').length : 0;
      const loadButtons = modal ? modal.querySelectorAll('[data-publish-load]').length : 0;
      const sourceFilters = [...document.querySelectorAll('[data-published-source-filter]')].map((button) => button.dataset.publishedSourceFilter);
      return {
        modalOpen: !!modal,
        cloudStatus: document.querySelector('#published-cloud-list')?.dataset.status || '',
        cloudCount: cloudRows.length,
        localCount: localRows.length,
        hasCloudSmoke: !!cloudRow,
        hasLocalSmoke: !!localRow,
        hasCloudEdit: !!cloudRow?.querySelector('[data-publish-load]'),
        hasLocalEdit: !!localRow?.querySelector('[data-publish-load]'),
        hasCloudDetails: !!cloudRow?.querySelector('[data-publish-details]'),
        hasLocalDetails: !!localRow?.querySelector('[data-publish-details]'),
        hasAdminTokenInput: !!document.querySelector('#published-admin-token'),
        hasCreatorNameInput: !!document.querySelector('#published-creator-name'),
        cloudUrl,
        localUrl,
        lastCloudCount: window._lastCloudPublishedGames?.length || 0,
        copyButtons,
        openButtons,
        loadButtons,
        hasSearch: !!document.querySelector('#published-search'),
        sourceFilters,
        filterSummary: document.querySelector('#published-filter-summary')?.textContent || '',
        filterState: window._lastPublishedFilter || null,
      };
    });
    if (!publishedLibraryState.modalOpen ||
        publishedLibraryState.cloudStatus !== 'loaded' ||
        !publishedLibraryState.hasCloudSmoke ||
        !publishedLibraryState.hasLocalSmoke ||
        !publishedLibraryState.hasCloudEdit ||
        !publishedLibraryState.hasLocalEdit ||
        !publishedLibraryState.hasCloudDetails ||
        !publishedLibraryState.hasLocalDetails ||
        !publishedLibraryState.hasAdminTokenInput ||
        !publishedLibraryState.hasCreatorNameInput ||
        !publishedLibraryState.hasSearch ||
        !publishedLibraryState.sourceFilters.includes('all') ||
        !publishedLibraryState.sourceFilters.includes('cloud') ||
        !publishedLibraryState.sourceFilters.includes('local') ||
        !publishedLibraryState.cloudUrl.includes(`/play?published=${smokePublishedSlug}`) ||
        publishedLibraryState.cloudUrl.includes('#') ||
        !publishedLibraryState.localUrl.includes(`/play?published=${smokePublishedSlug}`) ||
        publishedLibraryState.lastCloudCount < 1 ||
        publishedLibraryState.copyButtons < 2 ||
        publishedLibraryState.openButtons < 2 ||
        publishedLibraryState.loadButtons < 2) {
      throw new Error(`Published Games modal did not show cloud/local library: ${JSON.stringify(publishedLibraryState)}`);
    }

    await page.locator(`#published-cloud-list [data-published-row="${smokePublishedSlug}"] [data-publish-details]`).click({ timeout: timeoutMs });
    const publishedDetailState = await page.waitForFunction(
      () => {
        const publishedSlug = window.__CRATE_SMOKE?.publishedSlug || 'production-smoke-published-game';
        const detail = window._lastPublishedDetail || {};
        const panel = document.querySelector('#published-detail-panel');
        if (panel?.dataset.status !== 'loaded' ||
            detail.status !== 'loaded' ||
            detail.slug !== publishedSlug ||
            detail.objects < 100 ||
            detail.components < 14 ||
            detail.ownerManaged !== true) {
          return null;
        }
        return {
          panelStatus: panel.dataset.status || '',
          slug: detail.slug || '',
          source: detail.source || '',
          ownerManaged: detail.ownerManaged === true,
          objects: detail.objects || 0,
          components: detail.components || 0,
          hasProjectData: detail.hasProjectData === true,
          hasEdit: !!panel.querySelector('[data-publish-load]'),
          hasDuplicate: !!panel.querySelector('[data-publish-duplicate]'),
          hasDelete: !!panel.querySelector('[data-publish-delete]'),
          hasVisibilityToggle: !!panel.querySelector('[data-publish-visibility]'),
          hasFeaturedToggle: !!panel.querySelector('[data-publish-featured]'),
          creatorName: /Production Smoke Creator/.test(panel.textContent || '') ? 'Production Smoke Creator' : '',
          visibility: /Visibility:\s*Public/i.test(panel.textContent || '') ? 'public' : '',
          featuredLabel: /Featured:/i.test(panel.textContent || '') ? 'present' : '',
          text: panel.textContent || '',
        };
      },
      undefined,
      { timeout: timeoutMs }
    ).then((handle) => handle.jsonValue());
    if (!publishedDetailState.hasFeaturedToggle || publishedDetailState.featuredLabel !== 'present') {
      throw new Error(`Published game detail did not show featured curation controls: ${JSON.stringify(publishedDetailState)}`);
    }

    await page.locator('#published-search').fill('production smoke');
    await page.waitForFunction(
      () => window._lastPublishedFilter?.query === 'production smoke' &&
        window._lastPublishedFilter?.source === 'all' &&
        window._lastPublishedFilter?.cloudShown >= 1 &&
        window._lastPublishedFilter?.localShown >= 1,
      undefined,
      { timeout: timeoutMs }
    );
    await page.locator('[data-published-source-filter="cloud"]').click({ timeout: timeoutMs });
    await page.waitForFunction(
      () => window._lastPublishedFilter?.source === 'cloud' &&
        document.querySelector('#published-cloud-section')?.style.display !== 'none' &&
        document.querySelector('#published-local-section')?.style.display === 'none' &&
        window._lastPublishedFilter?.cloudShown >= 1,
      undefined,
      { timeout: timeoutMs }
    );
    await page.locator('[data-published-source-filter="local"]').click({ timeout: timeoutMs });
    await page.waitForFunction(
      () => window._lastPublishedFilter?.source === 'local' &&
        document.querySelector('#published-cloud-section')?.style.display === 'none' &&
        document.querySelector('#published-local-section')?.style.display !== 'none' &&
        window._lastPublishedFilter?.localShown >= 1,
      undefined,
      { timeout: timeoutMs }
    );
    await page.locator('[data-published-source-filter="all"]').click({ timeout: timeoutMs });
    const publishedFilterState = await page.waitForFunction(
      () => {
        const state = window._lastPublishedFilter || {};
        if (state.query !== 'production smoke' || state.source !== 'all' || state.cloudShown < 1 || state.localShown < 1) return null;
        return {
          query: state.query || '',
          source: state.source || '',
          cloudShown: state.cloudShown || 0,
          localShown: state.localShown || 0,
          cloudTotal: state.cloudTotal || 0,
          localTotal: state.localTotal || 0,
          summary: document.querySelector('#published-filter-summary')?.textContent || '',
        };
      },
      undefined,
      { timeout: timeoutMs }
    ).then((handle) => handle.jsonValue());

    await page.locator(`#published-cloud-list [data-published-row="${smokePublishedSlug}"] [data-publish-load]`).click({ timeout: timeoutMs });
    const publishedEditorLoadState = await page.waitForFunction(
      () => {
        const publishedSlug = window.__CRATE_SMOKE?.publishedSlug || 'production-smoke-published-game';
        const editorLoad = window._lastPublishedEditorLoad || {};
        const projectLoad = window._lastProjectLoad || {};
        const objectCount = window._engineBridge?.objects?.length || 0;
        const scriptCount = Array.isArray(window._userScripts) ? window._userScripts.length : 0;
        if (editorLoad.status !== 'cloud-published' ||
            editorLoad.slug !== publishedSlug ||
            projectLoad.status !== 'loaded' ||
            objectCount < 100 ||
            scriptCount < 1 ||
            window._currentMode !== 'edit') {
          return null;
        }
        return {
          status: editorLoad.status || '',
          slug: editorLoad.slug || '',
          objectCount,
          scriptCount,
          projectStatus: projectLoad.status || '',
          restoredObjects: projectLoad.restoredObjects || 0,
          mode: window._currentMode || '',
        };
      },
      undefined,
      { timeout: timeoutMs }
    ).then((handle) => handle.jsonValue());

    const publishedCleanupState = await (async () => {
      const publicId = publishedState.publicCloudAssetId || '';
      const deleteResponse = await fetch(new URL('/api/games/' + encodeURIComponent(smokePublishedSlug), baseUrl).href, {
        method: 'DELETE',
        headers: { 'X-Crate-Owner-Token': 'production-smoke-owner-token' },
      });
      let deletePayload = {};
      try {
        deletePayload = await deleteResponse.json();
      } catch {}
      const cacheBust = 'cleanup-' + encodeURIComponent(verify);
      const publicDetailAfterDelete = publicId
        ? await fetch(new URL('/api/assets/public/' + encodeURIComponent(publicId) + '?verify=' + cacheBust, baseUrl).href, { cache: 'no-store' })
        : { status: 0 };
      const publicDownloadAfterDelete = publicId
        ? await fetch(new URL('/api/assets/public/' + encodeURIComponent(publicId) + '/download?verify=' + cacheBust, baseUrl).href, { cache: 'no-store' })
        : { status: 0 };
      const gameAfterDelete = await fetch(new URL('/api/games/' + encodeURIComponent(smokePublishedSlug) + '?verify=' + cacheBust, baseUrl).href, { cache: 'no-store' });
      return {
        deleteStatus: deleteResponse.status,
        deletedOk: deletePayload?.ok === true && deletePayload?.deleted === true,
        cleanupDeleted: Number(deletePayload?.publicAssetCleanup?.deleted) || 0,
        cleanupAttempted: Number(deletePayload?.publicAssetCleanup?.attempted) || 0,
        cleanupErrors: Array.isArray(deletePayload?.publicAssetCleanup?.errors) ? deletePayload.publicAssetCleanup.errors.length : 0,
        cleanupBinding: deletePayload?.publicAssetCleanup?.binding === true,
        publicDetailAfterDeleteStatus: publicDetailAfterDelete.status,
        publicDownloadAfterDeleteStatus: publicDownloadAfterDelete.status,
        gameAfterDeleteStatus: gameAfterDelete.status,
      };
    })();
    if (publishedCleanupState.deleteStatus !== 200 ||
        !publishedCleanupState.deletedOk ||
        publishedCleanupState.cleanupAttempted < 1 ||
        publishedCleanupState.cleanupDeleted < 1 ||
        publishedCleanupState.cleanupErrors !== 0 ||
        !publishedCleanupState.cleanupBinding ||
        publishedCleanupState.publicDetailAfterDeleteStatus !== 404 ||
        publishedCleanupState.publicDownloadAfterDeleteStatus !== 404 ||
        publishedCleanupState.gameAfterDeleteStatus !== 404) {
      throw new Error(`Published public asset cleanup failed: ${JSON.stringify(publishedCleanupState)}`);
    }
    await page.evaluate(async () => {
      await window._getUserAssetStorageUsage?.();
      window._refreshGameBuilder?.();
    });

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
      throw new Error(`View mode did not lock editor controls: ${JSON.stringify(editLockState)}`);
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
      throw new Error(`Read-only editor controls mutated scene in View mode: ${JSON.stringify({ beforeReadOnly, afterReadOnlyClick })}`);
    }
    const bridgeExploreSelectState = await page.evaluate(() => {
      const objects = window._engineBridge?.objects || window._sceneObjects || [];
      const before = window._lastPlacedObj?.uuid || '';
      const target = objects.find((obj) => obj?.uuid && obj.uuid !== before);
      const result = target ? window._engineBridge?.selectObject?.(target) : null;
      return {
        attempted: !!target,
        resultSelected: !!result,
        before,
        after: window._lastPlacedObj?.uuid || '',
        bridgeSelectedId: window._engineBridge?.getSelected?.()?.uuid || '',
        inspectorDisplay: document.querySelector('#inspector')?.style.display || '',
      };
    });
    if (bridgeExploreSelectState.attempted &&
        (bridgeExploreSelectState.resultSelected ||
          bridgeExploreSelectState.bridgeSelectedId ||
          bridgeExploreSelectState.after !== bridgeExploreSelectState.before ||
          bridgeExploreSelectState.inspectorDisplay === 'flex')) {
      throw new Error(`Engine bridge selected an object in View mode: ${JSON.stringify(bridgeExploreSelectState)}`);
    }
    await page.mouse.click(680, 470);
    const exploreState = await page.evaluate(() => ({
      mode: window._currentMode,
      playMode: window._playMode === true,
      legacyInspectorDisplay: document.querySelector('#inspector')?.style.display || '',
      bridgeSelectedId: window._engineBridge?.getSelected?.()?.uuid || '',
      selectedModeButton: document.querySelector('[data-gb-mode="explore"]')?.dataset.selected || '',
    }));
    if (exploreState.legacyInspectorDisplay === 'flex') {
      throw new Error('View mode canvas click opened the object inspector');
    }
    if (exploreState.bridgeSelectedId) {
      throw new Error(`View mode canvas click left an editor selection active: ${JSON.stringify(exploreState)}`);
    }
    if (exploreState.selectedModeButton !== 'true') {
      throw new Error('View mode button did not reflect the active mode');
    }

    await page.locator('#gb-mode-dock [data-gb-mode="play"]').click({ timeout: timeoutMs });
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
      bridgeSelectedId: window._engineBridge?.getSelected?.()?.uuid || '',
      controlsEnabled: window._engine?.controls?.enabled,
      modeDockDisplay: getComputedStyle(document.querySelector('#gb-mode-dock') || document.createElement('div')).display || '',
      modeDockSelected: document.querySelector('#gb-mode-dock [data-gb-mode="play"]')?.dataset.selected || '',
      cameraResetVisible: !!document.querySelector('#play-camera-reset-btn'),
      cameraResetReady: typeof window._resetPlayCameraView === 'function',
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
    if (playState.bridgeSelectedId) {
      throw new Error(`Play mode left an editor selection active: ${JSON.stringify(playState)}`);
    }
    if (playState.controlsEnabled !== false) {
      throw new Error(`Play mode left editor OrbitControls enabled: ${JSON.stringify(playState)}`);
    }
    if (playState.modeDockDisplay === 'none' || playState.modeDockSelected !== 'true') {
      throw new Error(`Play mode did not keep the global mode dock available: ${JSON.stringify(playState)}`);
    }
    if (!playState.cameraResetVisible || !playState.cameraResetReady) {
      throw new Error(`Play mode camera reset control was missing: ${JSON.stringify(playState)}`);
    }

    await page.locator('#gb-mode-dock [data-gb-mode="edit"]').click({ timeout: timeoutMs });
    await page.waitForFunction(
      () => window._currentMode === 'edit' && window._playMode !== true,
      undefined,
      { timeout: timeoutMs }
    );
    const playExitState = await page.evaluate(() => ({
      mode: window._currentMode,
      playMode: window._playMode === true,
      builderDisplay: document.querySelector('#game-builder-panel')?.style.display || '',
      builderPlayHidden: document.querySelector('#game-builder-panel')?.dataset.playHidden || '',
      promptDisplay: document.querySelector('#prompt-input')?.parentElement?.style.display || '',
      modeDockSelected: document.querySelector('#gb-mode-dock [data-gb-mode="edit"]')?.dataset.selected || '',
    }));
    if (playExitState.builderDisplay === 'none' ||
        playExitState.builderPlayHidden === 'true' ||
        playExitState.promptDisplay === 'none' ||
        playExitState.modeDockSelected !== 'true') {
      throw new Error(`Global mode dock did not return from Play to Edit cleanly: ${JSON.stringify(playExitState)}`);
    }
    await page.locator('#gb-mode-dock [data-gb-mode="play"]').click({ timeout: timeoutMs });
    await page.waitForFunction(
      () => window._currentMode === 'play' && window._playMode === true,
      undefined,
      { timeout: timeoutMs }
    );

    const playCameraBefore = await page.evaluate(() => ({
      x: window._engine?.camera?.rotation.x || 0,
      y: window._engine?.camera?.rotation.y || 0,
      z: window._engine?.camera?.rotation.z || 0,
      cameraOwned: window._isCharacterCameraOwned?.() === true,
      cameraOnly: window._engine?.character?._cameraOnlyMode === true,
    }));
    const playCameraGuardState = await page.evaluate(async () => {
      if (window._engine?.controls) {
        window._engine.controls.enabled = true;
        window._engine.controls.enableDamping = true;
      }
      if (window._engine?.camera) {
        const yaw = window._engine.camera.rotation.y || 0;
        window._engine.camera.rotation.set(-1.55, yaw, 0.35, 'YXZ');
      }
      window._lockPlayCameraRoll?.('smoke-forced-controls');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        x: window._engine?.camera?.rotation.x || 0,
        z: window._engine?.camera?.rotation.z || 0,
        controlsEnabled: window._engine?.controls?.enabled,
        cameraOwned: window._isCharacterCameraOwned?.() === true,
        cameraOnly: window._engine?.character?._cameraOnlyMode === true,
        stability: window._playCameraStability || null,
      };
    });
    if (Math.abs(playCameraGuardState.z) > 0.02 ||
        Math.abs(playCameraGuardState.x) > 1.16 ||
        playCameraGuardState.controlsEnabled !== false) {
      throw new Error(`Play camera guard did not clamp pitch, flatten roll, and disable editor controls: ${JSON.stringify(playCameraGuardState)}`);
    }
    const playCameraResetState = await page.evaluate(() => {
      if (window._engine?.camera) window._engine.camera.rotation.z = 0.42;
      const result = window._resetPlayCameraView?.() || null;
      return {
        ready: typeof window._resetPlayCameraView === 'function',
        buttonVisible: !!document.querySelector('#play-camera-reset-btn'),
        z: window._engine?.camera?.rotation.z || 0,
        result,
      };
    });
    if (!playCameraResetState.ready ||
        !playCameraResetState.buttonVisible ||
        Math.abs(playCameraResetState.z) > 0.02 ||
        Math.abs(playCameraResetState.result?.z || 0) > 0.02) {
      throw new Error(`Play camera reset did not flatten camera roll: ${JSON.stringify(playCameraResetState)}`);
    }
    await page.mouse.move(700, 470);
    await page.mouse.wheel(0, 700);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(930, 590, { steps: 8 });
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(400);
    const playCameraAfter = await page.evaluate(() => ({
      x: window._engine?.camera?.rotation.x || 0,
      y: window._engine?.camera?.rotation.y || 0,
      z: window._engine?.camera?.rotation.z || 0,
      controlsEnabled: window._engine?.controls?.enabled,
      stability: window._playCameraStability || null,
    }));
    if (Math.abs(playCameraAfter.z) > 0.02 ||
        Math.abs(playCameraAfter.x) > 1.16 ||
        playCameraAfter.controlsEnabled !== false) {
      throw new Error(`Play camera scroll/drag introduced tilt or re-enabled orbit controls: ${JSON.stringify({ before: playCameraBefore, after: playCameraAfter })}`);
    }
    const bridgePlaySelectState = await page.evaluate(() => {
      const objects = window._engineBridge?.objects || window._sceneObjects || [];
      const before = window._lastPlacedObj?.uuid || '';
      const target = objects.find((obj) => obj?.uuid && obj.uuid !== before);
      const result = target ? window._engineBridge?.selectObject?.(target) : null;
      return {
        attempted: !!target,
        resultSelected: !!result,
        before,
        after: window._lastPlacedObj?.uuid || '',
        inspectorDisplay: document.querySelector('#inspector')?.style.display || '',
      };
    });
    if (bridgePlaySelectState.attempted &&
        (bridgePlaySelectState.resultSelected ||
          bridgePlaySelectState.after !== bridgePlaySelectState.before ||
          bridgePlaySelectState.inspectorDisplay === 'flex')) {
      throw new Error(`Engine bridge selected an object in Play mode: ${JSON.stringify(bridgePlaySelectState)}`);
    }

    let doorTriggerState;
    try {
      doorTriggerState = await page.waitForFunction(
        () => {
          const runtime = window._userScriptScope?.gbRuntime || {};
          const doors = Object.values(runtime.doors || {});
          const triggers = Object.values(runtime.triggers || {});
          const openedDoor = doors.find((door) => door.open === true && (door.progress || 0) > 0);
          const firedTrigger = triggers.find((trigger) => (trigger.fireCount || 0) > 0);
          if (!openedDoor || !firedTrigger || !runtime.lastTrigger?.targetDoor) return null;
          return {
            openedDoor: openedDoor.label || '',
            doorProgress: openedDoor.progress || 0,
            firedTrigger: firedTrigger.label || '',
            triggerFireCount: firedTrigger.fireCount || 0,
            lastTriggerTarget: runtime.lastTrigger.targetDoor || '',
          };
        },
        undefined,
        { timeout: timeoutMs }
      ).then((handle) => handle.jsonValue());
    } catch (err) {
      const debug = await page.evaluate(() => {
        const runtime = window._userScriptScope?.gbRuntime || {};
        const objects = window._engineBridge?.objects || window._sceneObjects || [];
        const frameProfile = window._crateFrameProfile || {};
        return {
          mode: window._currentMode || '',
          playMode: window._playMode === true,
          scripts: (window._userScripts || []).map((script) => ({
            id: script.id,
            enabled: script.enabled,
            running: script._running,
            hasUpdate: typeof script._onUpdate === 'function',
          })),
          doors: Object.values(runtime.doors || {}).map((door) => ({
            id: door.id,
            label: door.label,
            open: door.open,
            progress: door.progress,
          })),
          triggers: Object.values(runtime.triggers || {}).map((trigger) => ({
            id: trigger.id,
            label: trigger.label,
            fired: trigger.fired,
            fireCount: trigger.fireCount,
            inside: trigger.inside,
            targetDoorId: trigger.targetDoorId,
          })),
          lastTrigger: runtime.lastTrigger || null,
          componentCounts: objects.reduce((counts, obj) => {
            Object.keys(obj?.userData?.gbComponents || {}).forEach((key) => {
              counts[key] = (counts[key] || 0) + 1;
            });
            return counts;
          }, {}),
          frameProfile: {
            mode: frameProfile.mode || '',
            fps: Number(frameProfile.fps) || 0,
            avgFrameMs: Number(frameProfile.avgFrameMs) || 0,
            avgUpdateMs: Number(frameProfile.avgUpdateMs) || 0,
            avgRenderMs: Number(frameProfile.avgRenderMs) || 0,
            calls: Number(frameProfile.calls) || 0,
            triangles: Number(frameProfile.triangles) || 0,
            objects: Number(frameProfile.objects) || 0,
            samples: Array.isArray(frameProfile.samples) ? frameProfile.samples.length : 0,
          },
        };
      });
      throw new Error(`Door/Trigger runtime wait timed out: ${JSON.stringify(debug)}; pageErrors=${JSON.stringify(pageErrors.slice(-5))}; badConsole=${JSON.stringify(badConsole.slice(-5))}; ${err.message}`);
    }
    if (!doorTriggerState.openedDoor || doorTriggerState.doorProgress <= 0 || doorTriggerState.triggerFireCount < 1) {
      throw new Error(`Door/Trigger runtime did not fire cleanly: ${JSON.stringify(doorTriggerState)}`);
    }

    const missionFlowState = await page.waitForFunction(
      () => {
        const runtime = window._userScriptScope?.gbRuntime || {};
        const steps = Object.values(runtime.missionSteps || {});
        const rewards = Object.values(runtime.rewards || {});
        const gates = Object.values(runtime.gates || {});
        const doneStep = steps.find((step) => step.done);
        const claimedReward = rewards.find((reward) => reward.claimed);
        const unlockedGate = gates.find((gate) => gate.unlocked && (gate.progress || 0) > 0);
        if (!doneStep || !claimedReward || !unlockedGate || !runtime.lastReward) return null;
        return {
          doneStep: doneStep.label || '',
          claimedReward: claimedReward.label || '',
          rewardScore: claimedReward.score || 0,
          unlockedGate: unlockedGate.label || '',
          gateProgress: unlockedGate.progress || 0,
          runtimeScore: runtime.score || 0,
          lastReward: runtime.lastReward?.label || '',
        };
      },
      undefined,
      { timeout: timeoutMs }
    ).then((handle) => handle.jsonValue());
    if (!missionFlowState.doneStep || !missionFlowState.claimedReward || !missionFlowState.unlockedGate || missionFlowState.rewardScore < 75) {
      throw new Error(`Mission flow runtime did not complete cleanly: ${JSON.stringify(missionFlowState)}`);
    }

    await page.waitForFunction(
      () => {
        const runtime = window._userScriptScope?.gbRuntime || {};
        return runtime.activeNpc?.name === 'Smoke guide' && runtime.activeMerchant?.item === 'smoke cloak';
      },
      undefined,
      { timeout: timeoutMs }
    );
    await page.keyboard.press('KeyT');
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', code: 'KeyT', bubbles: true }));
      for (const script of window._userScripts || []) {
        if (script && script.enabled !== false && script._running && typeof script._onKeyPress === 'function') {
          script._onKeyPress('t');
        }
      }
    });
    const npcRuntimeState = await page.waitForFunction(
      () => {
        const scope = window._userScriptScope || {};
        const runtime = scope.gbRuntime || {};
        const npcs = Object.values(runtime.npcs || {});
        const inventory = Array.isArray(scope.gbInventoryItems) ? scope.gbInventoryItems : [];
        const npc = npcs.find((item) => item.name === 'Smoke guide' && item.talked && item.rewardClaimed);
        const note = inventory.find((item) => item?.name === 'smoke note');
        if (!npc || !note || runtime.lastDialogue?.speaker !== 'Smoke guide') return null;
        return {
          name: npc.name || '',
          role: npc.role || '',
          dialogue: runtime.lastDialogue?.text || '',
          reward: note.name || '',
          rewardClaimed: npc.rewardClaimed === true,
          talkCount: Number(npc.talkCount) || 0,
          score: Number(runtime.score) || 0,
        };
      },
      undefined,
      { timeout: timeoutMs }
    ).then((handle) => handle.jsonValue());
    if (npcRuntimeState.name !== 'Smoke guide' || npcRuntimeState.reward !== 'smoke note' || !npcRuntimeState.rewardClaimed) {
      throw new Error(`NPC runtime did not talk and grant reward: ${JSON.stringify(npcRuntimeState)}`);
    }

    await page.keyboard.press('KeyE');
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', bubbles: true }));
      for (const script of window._userScripts || []) {
        if (script && script.enabled !== false && script._running && typeof script._onKeyPress === 'function') {
          script._onKeyPress('e');
        }
      }
    });
    const merchantRuntimeState = await page.waitForFunction(
      () => {
        const scope = window._userScriptScope || {};
        const runtime = scope.gbRuntime || {};
        const merchants = Object.values(runtime.merchants || {});
        const equipment = scope.gbEquipment || {};
        const inventory = Array.isArray(scope.gbInventoryItems) ? scope.gbInventoryItems : [];
        const merchant = merchants.find((item) => item.name === 'Smoke vendor');
        const cloak = inventory.find((item) => item?.name === 'smoke cloak');
        if (!merchant || !runtime.lastPurchase || !cloak || equipment.armor?.name !== 'smoke cloak') return null;
        return {
          name: merchant.name || '',
          item: runtime.lastPurchase.item || '',
          price: Number(runtime.lastPurchase.price) || 0,
          sold: Number(merchant.sold) || 0,
          armor: equipment.armor?.name || '',
          armorPower: Number(equipment.armor?.power) || 0,
          score: Number(runtime.score) || 0,
        };
      },
      undefined,
      { timeout: timeoutMs }
    ).then((handle) => handle.jsonValue());
    if (merchantRuntimeState.item !== 'smoke cloak' || merchantRuntimeState.armor !== 'smoke cloak' || merchantRuntimeState.armorPower < 4) {
      throw new Error(`Merchant runtime did not sell and equip item: ${JSON.stringify(merchantRuntimeState)}`);
    }

    const waveRuntimeState = await page.waitForFunction(
      () => {
        const runtime = window._userScriptScope?.gbRuntime || {};
        const spawns = Object.values(runtime.enemySpawns || {});
        const waves = Object.values(runtime.waves || {});
        const enemies = Object.values(runtime.enemies || {});
        const spawnedWave = waves.find((wave) => wave.spawned && (wave.count || 0) >= 2);
        const alive = enemies.filter((enemy) => enemy.alive).length;
        if (!spawns.length || !spawnedWave || enemies.length < 2 || alive < 1) return null;
        return {
          spawn: spawns[0].label || '',
          wave: spawnedWave.label || '',
          spawned: spawnedWave.spawned === true,
          active: spawnedWave.active === true,
          alive,
          defeated: spawnedWave.defeated || 0,
          enemyCount: enemies.length,
        };
      },
      undefined,
      { timeout: timeoutMs }
    ).then((handle) => handle.jsonValue());
    if (!waveRuntimeState.spawned || waveRuntimeState.enemyCount < 2 || waveRuntimeState.alive < 1) {
      throw new Error(`Enemy wave runtime did not spawn cleanly: ${JSON.stringify(waveRuntimeState)}`);
    }

    await page.waitForFunction(
      () => !!window._userScriptScope?.gbRuntime?.activeSpawn?.position,
      undefined,
      { timeout: timeoutMs }
    );
    await page.evaluate(() => {
      const runtime = window._userScriptScope?.gbRuntime || {};
      const target = runtime.activeSpawn?.position || { x: 0, y: 1.5, z: 0 };
      const enemy = Object.values(runtime.enemies || {}).find((item) => item?.alive && item.mesh?.position);
      if (!enemy) throw new Error('No live enemy available for drop test');
      enemy.health = 1;
      enemy.mesh.position.set(target.x, target.y, target.z);
      enemy.position = { x: target.x, y: target.y, z: target.z };
    });
    await page.keyboard.press('KeyF');
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', code: 'KeyF', bubbles: true }));
      for (const script of window._userScripts || []) {
        if (script && script.enabled !== false && script._running && typeof script._onKeyPress === 'function') {
          script._onKeyPress('f');
        }
      }
    });
    const readLootState = () => {
        const scope = window._userScriptScope || {};
        const runtime = scope.gbRuntime || {};
        const equipment = scope.gbEquipment || {};
        const stats = scope.gbPlayerStats || {};
        const inventory = Array.isArray(scope.gbInventoryItems) ? scope.gbInventoryItems : [];
        const weapon = equipment.weapon || null;
        const trinket = equipment.trinket || null;
        const attack = (Number(stats.attack) || 10) + (Number(weapon?.power) || 0) + (Number(trinket?.power) || 0);
        const hasDrop = inventory.some((item) => item?.name === 'smoke blade');
        if (!runtime.lastEnemyDefeated || !hasDrop || weapon?.name !== 'smoke blade' || attack < 20) return null;
        return {
          defeated: runtime.lastEnemyDefeated.label || '',
          drop: runtime.lastItemGrant?.name || '',
          weapon: weapon.name || '',
          weaponPower: Number(weapon.power) || 0,
          trinket: trinket?.name || '',
          trinketPower: Number(trinket?.power) || 0,
          attack,
          xp: Number(stats.xp) || 0,
          inventoryCount: inventory.length,
        };
      };
    const lootState = await page.waitForFunction(
      readLootState,
      undefined,
      { timeout: 10000 }
    ).then((handle) => handle.jsonValue()).catch(async () => {
      const diagnostic = await page.evaluate(() => {
        const scope = window._userScriptScope || {};
        const runtime = scope.gbRuntime || {};
        const equipment = scope.gbEquipment || {};
        const stats = scope.gbPlayerStats || {};
        const inventory = Array.isArray(scope.gbInventoryItems) ? scope.gbInventoryItems : [];
        const enemies = Object.values(runtime.enemies || {}).map((enemy) => ({
          id: enemy?.id || '',
          alive: enemy?.alive === true,
          health: Number(enemy?.health) || 0,
          dropItem: enemy?.dropItem || '',
          dropSlot: enemy?.dropSlot || '',
          hasMesh: !!enemy?.mesh,
        }));
        return {
          lastEnemyDefeated: runtime.lastEnemyDefeated || null,
          lastItemGrant: runtime.lastItemGrant || null,
          equipment,
          stats,
          inventory: inventory.map((item) => ({ name: item?.name || '', slot: item?.slot || '', power: Number(item?.power) || 0, xp: Number(item?.xp) || 0 })),
          enemies,
        };
      });
      throw new Error(`Enemy drop diagnostic: ${JSON.stringify(diagnostic)}`);
    });
    if (lootState.weapon !== 'smoke blade' || lootState.attack < 20 || lootState.inventoryCount < 2) {
      throw new Error(`Enemy drop did not update inventory/equipment/stats: ${JSON.stringify(lootState)}`);
    }

    const respawnState = await page.evaluate(() => {
      const runtime = window._userScriptScope.gbRuntime;
      runtime.health = 0;
      runtime.lastRespawnAt = -999;
      return {
        beforeRespawns: runtime.respawns || 0,
        activeSpawn: runtime.activeSpawn?.label || '',
        activeCheckpoint: runtime.activeCheckpoint?.label || '',
      };
    });
    const afterRespawnState = await page.waitForFunction(
      (before) => {
        const runtime = window._userScriptScope?.gbRuntime || {};
        if ((runtime.respawns || 0) <= before.beforeRespawns || runtime.health < 100) return null;
        return {
          health: runtime.health,
          respawns: runtime.respawns || 0,
          activeSpawn: runtime.activeSpawn?.label || '',
          activeCheckpoint: runtime.activeCheckpoint?.label || '',
          gameOver: runtime.gameOver === true,
        };
      },
      respawnState,
      { timeout: timeoutMs }
    ).then((handle) => handle.jsonValue());
    if (afterRespawnState.gameOver || !afterRespawnState.activeSpawn) {
      throw new Error(`Spawn runtime did not respawn cleanly: ${JSON.stringify({ before: respawnState, after: afterRespawnState })}`);
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
    await page.evaluate(() => window._refreshGameBuilder?.());
    await page.waitForFunction(
      () => {
        const validation = window._gameBuilderValidation || {};
        const readiness = window._gameBuilderReadiness || {};
        return !!validation.status &&
          !!readiness.status &&
          document.querySelector('#gb-validation-list .gb-validation-row');
      },
      undefined,
      { timeout: timeoutMs }
    );

    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const state = await page.evaluate(() => {
      const objects = window._engineBridge?.objects || window._sceneObjects || [];
      const selected = window._engineBridge?.getSelected?.() || window._lastPlacedObj || null;
      const readiness = window._gameBuilderReadiness || {};
      const validation = window._gameBuilderValidation || {};
      const performancePanel = window._gameBuilderPerformance || {};
      const frameProfile = window._crateFrameProfile || {};
      const rendererRender = window._renderer?.info?.render || {};
      const rendererMemory = window._renderer?.info?.memory || {};
      const performanceCalls = Math.max(Number(performancePanel.calls) || 0, Number(rendererRender.calls) || 0);
      const performanceTriangles = Math.max(Number(performancePanel.triangles) || 0, Number(rendererRender.triangles) || 0);
      const performanceTextures = Math.max(Number(performancePanel.textures) || 0, Number(rendererMemory.textures) || 0);
      const gameSystems = window._gameBuilderSystems || [];
      const storagePanel = document.querySelector('#gb-user-storage-status');
      return {
        engineReady: window._engineReady === true,
        hasAssetResolver: typeof window._crateAssetUrl === 'function',
        assetBaseUrl: typeof window._crateAssetBaseUrl === 'function' ? window._crateAssetBaseUrl() : '',
        objectCount: objects.length,
        sceneRows: document.querySelectorAll('#gb-scene-list .gb-scene-row').length,
        stats: document.querySelector('#gb-stats')?.dataset.summary ||
          document.querySelector('#gb-stats')?.getAttribute('aria-label') ||
          document.querySelector('#gb-stats')?.textContent?.trim() || '',
        hasInspector: !!document.querySelector('#gb-inspector'),
        hasInspectorHealth: !!document.querySelector('#gb-object-health'),
        inspectorHealthStatus: document.querySelector('#gb-object-health')?.dataset.status || '',
        inspectorHealthSummary: document.querySelector('#gb-object-health')?.dataset.summary || '',
        inspectorHealthComponents: Number(document.querySelector('#gb-object-health')?.dataset.components) || 0,
        inspectorHealthIssues: Number(document.querySelector('#gb-object-health')?.dataset.issues) || 0,
        inspectorMetricCount: document.querySelectorAll('#gb-object-health .gb-object-metric').length,
        hasBlueprints: !!document.querySelector('#gb-blueprints'),
        hasProject: !!document.querySelector('#gb-project'),
        hasAssetPack: !!document.querySelector('#gb-asset-pack'),
        hasReadiness: !!document.querySelector('#gb-readiness'),
        hasPerformance: !!document.querySelector('#gb-performance'),
        hasValidation: !!document.querySelector('#gb-validation'),
        hasTemplates: !!document.querySelector('#gb-templates'),
        hasStarterKits: !!document.querySelector('#gb-starter-kits'),
        hasSystems: !!document.querySelector('#gb-systems'),
        templateCount: document.querySelectorAll('#gb-templates [data-gb-template]').length,
        templateIds: [...document.querySelectorAll('#gb-templates [data-gb-template]')].map((card) => card.dataset.gbTemplate),
        starterKitCount: document.querySelectorAll('#gb-starter-kits [data-gb-starter-kit]').length,
        starterKitIds: [...document.querySelectorAll('#gb-starter-kits [data-gb-starter-kit]')].map((card) => card.dataset.gbStarterKit),
        starterKitStatus: document.querySelector('#gb-starter-kit-status')?.textContent || '',
        starterKitLatest: window._lastStarterKit || null,
        systemCardCount: document.querySelectorAll('#gb-systems [data-gb-system]').length,
        installedSystems: gameSystems.filter((system) => system.status === 'installed').map((system) => system.id),
        systemSummary: gameSystems.map((system) => system.id + ':' + system.statusText).join(', '),
        assetPackStatus: document.querySelector('#gb-asset-pack-status')?.dataset.status || '',
        assetPackText: document.querySelector('#gb-asset-pack-status')?.textContent?.trim() || '',
        assetPackVersion: window._crateAssetManifest?.version || '',
        userAssetStorageReady: typeof window._getUserAssetStorageUsage === 'function',
        userAssetStoragePanelStatus: storagePanel?.dataset.status || '',
        userAssetStoragePrivateAssets: Number(storagePanel?.dataset.privateAssets) || 0,
        userAssetStoragePrivateBytes: Number(storagePanel?.dataset.privateBytes) || 0,
        userAssetStoragePublishedAssets: Number(storagePanel?.dataset.publishedAssets) || 0,
        userAssetStoragePublishedBytes: Number(storagePanel?.dataset.publishedBytes) || 0,
        userAssetStorageQuotaBytes: Number(storagePanel?.dataset.quotaBytes) || 0,
        userAssetStorageQuotaPercent: Number(storagePanel?.dataset.quotaPercent) || 0,
        readinessStatus: readiness.status || '',
        readinessTone: readiness.tone || '',
        readinessSummary: document.querySelector('#gb-readiness-status')?.dataset.summary || readiness.summary || '',
        readinessObjectCount: readiness.objectCount || 0,
        readinessScriptCount: readiness.scriptCount || 0,
        readinessComponentCount: readiness.componentCount || 0,
        readinessEquipmentCount: readiness.equipmentCount || 0,
        readinessNpcCount: readiness.npcCount || 0,
        readinessMerchantCount: readiness.merchantCount || 0,
        readinessCheckpointCount: readiness.checkpointCount || 0,
        readinessWinConditionCount: readiness.winConditionCount || 0,
        readinessSpawnCount: readiness.spawnCount || 0,
        readinessDoorCount: readiness.doorCount || 0,
        readinessTriggerCount: readiness.triggerCount || 0,
        readinessMissionStepCount: readiness.missionStepCount || 0,
        readinessRewardCount: readiness.rewardCount || 0,
        readinessGateCount: readiness.gateCount || 0,
        readinessEnemySpawnCount: readiness.enemySpawnCount || 0,
        readinessWaveCount: readiness.waveCount || 0,
        readinessAssetStatus: readiness.assetStatus || '',
        performanceStatus: performancePanel.status || document.querySelector('#gb-performance-status')?.dataset.status || '',
        performanceFps: Number(performancePanel.fps ?? document.querySelector('#gb-performance-status')?.dataset.fps) || 0,
        performanceFrameMs: Number(performancePanel.frameMs ?? document.querySelector('#gb-performance-status')?.dataset.frameMs) || 0,
        performanceCalls,
        performanceTriangles,
        performanceTextures,
        performanceBudget: window._cratePerformanceBudget || null,
        cullingStats: window._crateCullingStats || null,
        objectPoolStats: window._crateObjectPoolStats || null,
        rawFrameFps: Number(frameProfile.fps) || 0,
        rawFrameMs: Number(frameProfile.avgFrameMs) || 0,
        rawUpdateMs: Number(frameProfile.avgUpdateMs) || 0,
        rawRenderMs: Number(frameProfile.avgRenderMs) || 0,
        rawFrameSamples: Array.isArray(frameProfile.samples) ? frameProfile.samples.length : 0,
        rendererCalls: Number(rendererRender.calls) || 0,
        rendererTriangles: Number(rendererRender.triangles) || 0,
        cityPerformanceProfile: window._lastCityPerformanceSettings?.profile || '',
        cityPerformanceProceduralProps: window._lastCityPerformanceSettings?.proceduralProps === true,
        cityPerformanceProceduralVehicles: window._lastCityPerformanceSettings?.proceduralVehicles === true,
        cityPerformanceProceduralNature: window._lastCityPerformanceSettings?.proceduralNature === true,
        performanceRows: document.querySelectorAll('#gb-performance-list .gb-performance-row').length,
        qualityButtons: [...document.querySelectorAll('#gb-performance [data-gb-quality]')].map((button) => button.dataset.gbQuality),
        activeQuality: window._crateGraphicsQuality || '',
        performanceWarnings: Array.isArray(performancePanel.warnings) ? performancePanel.warnings : [],
        userImportValidatorReady: typeof window._validateUserModelFile === 'function',
        userModelInspectorReady: typeof window._inspectUserModelFile === 'function',
        projectValidatorReady: typeof window._validateCrateProjectData === 'function',
        projectSchemaVersion: Number(window._crateProjectSchema?.version) || 0,
        cullingProcessed: Number(window._crateCullingStats?.processed) || 0,
        cullingSkipped: Number(window._crateCullingStats?.skipped) || 0,
        cullingFar: Number(window._crateCullingStats?.far) || 0,
        cullingMaxPerPass: Number(window._crateCullingStats?.maxPerPass) || 0,
        poolDamageCreated: Number(window._crateObjectPoolStats?.damageNumberCreated) || 0,
        poolImpactCreated: Number(window._crateObjectPoolStats?.impactCreated) || 0,
        poolMuzzleCreated: Number(window._crateObjectPoolStats?.muzzleFlashCreated) || 0,
        validationStatus: validation.status || document.querySelector('#gb-validation-status')?.dataset.status || '',
        validationSummary: validation.summary || document.querySelector('#gb-validation-status')?.dataset.summary || '',
        validationErrors: Number(validation.errors ?? document.querySelector('#gb-validation-status')?.dataset.errors) || 0,
        validationWarnings: Number(validation.warnings ?? document.querySelector('#gb-validation-status')?.dataset.warnings) || 0,
        validationSuggestions: Number(validation.suggestions ?? document.querySelector('#gb-validation-status')?.dataset.suggestions) || 0,
        validationRows: document.querySelectorAll('#gb-validation-list .gb-validation-row').length,
        validationMessages: [...document.querySelectorAll('#gb-validation-list .gb-validation-row')].map((row) => ({
          level: row.dataset.level || '',
          text: row.textContent?.replace(/\s+/g, ' ').trim() || '',
          action: row.querySelector('[data-gb-validation-fix]')?.dataset.gbValidationFix || '',
        })),
        projectSaveCount: JSON.parse(localStorage.getItem('crate-saves') || '[]').length,
        mode: window._currentMode || '',
        hasModeButtons: document.querySelectorAll('[data-gb-mode]').length >= 3,
        hiddenUnavailableAssets: window._assetCatalogHiddenUnavailable || 0,
        assetCatalogNormalized: window._assetCatalogNormalized || 0,
        assetCatalogDeduped: window._assetCatalogDeduped || 0,
        placementStatus: window._lastAssetPlacement?.status || '',
        placementSource: window._lastAssetPlacement?.source || '',
        scriptCount: Array.isArray(window._userScripts) ? window._userScripts.length : 0,
        selectedComponents: Object.keys(selected?.userData?.gbComponents || {}),
        gameplayComponents: [...new Set(objects.flatMap((obj) => Object.keys(obj?.userData?.gbComponents || {})))],
      };
    });
    state.savedProjectVersion = savedProjectState.version;
    state.realGalleryCategoryCount = realGalleryCategoryState.categoryCount;
    state.realGallerySelectedName = realGallerySelected.name;
    state.realGallerySelectedFile = realGallerySelected.file;
    state.realGalleryPreviewStatus = realGalleryPreviewState.placement?.status || '';
    state.realGalleryPlacementStatus = realGalleryPlacementState.placement?.status || '';
    state.realGalleryPlacementObjectCount = realGalleryPlacementState.objectCount;
    state.gallerySweepCategories = gallerySweepState.map((entry) => `${entry.category}:${entry.visibleCards || 0}`);
    state.gallerySweepBadResponses = gallerySweepBadResponses.length;
    state.categoryPlacements = categoryPlacementState.map((entry) => `${entry.category}:${entry.placedName || entry.name || 'missing'}`);
    state.categoryPlacementBadResponses = categoryPlacementBadResponses.length;
    state.rawBuildCitySamples = rawBuildCityPerformanceState.samples;
    state.rawBuildCityFps = rawBuildCityPerformanceState.fps;
    state.rawBuildCityFrameMs = rawBuildCityPerformanceState.avgFrameMs;
    state.rawBuildCityWorstFrameMs = rawBuildCityPerformanceState.worstFrameMs;
    state.rawBuildCityUpdateMs = rawBuildCityPerformanceState.avgUpdateMs;
    state.rawBuildCityRenderMs = rawBuildCityPerformanceState.avgRenderMs;
    state.rawBuildCityCalls = rawBuildCityPerformanceState.calls;
    state.rawBuildCityTriangles = rawBuildCityPerformanceState.triangles;
    state.rawBuildCityObjects = rawBuildCityPerformanceState.objects;
    state.rawBuildCityMode = rawBuildCityPerformanceState.mode;
    state.validationFixActions = validationFixState.actions;
    state.validationFixColliderCount = validationFixState.colliderCount;
    state.validationFixLatest = validationFixState.latest?.action || '';
    state.validationFixSummary = validationFixState.summary;
    state.validationFixRows = validationFixState.rowCount;
    state.validationFixUndoRestoredObjects = validationFixState.undoRestoredObjects;
    state.validationFixPreviewState = validationFixState.previewState;
    state.savedProjectObjectCount = savedProjectState.objectCount;
    state.savedProjectScriptCount = savedProjectState.scriptCount;
    state.savedProjectCommandCount = savedProjectState.commandCount;
    state.savedProjectHasBuildCityCommand = savedProjectState.hasBuildCityCommand;
    state.savedProjectHasSpawnPoint = savedProjectState.hasSpawnPoint;
    state.savedProjectHasDoor = savedProjectState.hasDoor;
    state.savedProjectHasTriggerZone = savedProjectState.hasTriggerZone;
    state.savedProjectHasMissionStep = savedProjectState.hasMissionStep;
    state.savedProjectHasMissionReward = savedProjectState.hasMissionReward;
    state.savedProjectHasMissionGate = savedProjectState.hasMissionGate;
    state.savedProjectHasEnemySpawn = savedProjectState.hasEnemySpawn;
    state.savedProjectHasWaveController = savedProjectState.hasWaveController;
    state.savedProjectHasEquipmentItem = savedProjectState.hasEquipmentItem;
    state.savedProjectHasNpc = savedProjectState.hasNpc;
    state.savedProjectHasMerchant = savedProjectState.hasMerchant;
    state.savedProjectValidationFixHistoryCount = savedProjectState.validationFixHistoryCount;
    state.savedProjectHasValidationFixHistory = savedProjectState.hasValidationFixHistory;
    state.loadedProjectObjectCount = loadedProjectState.objectCount;
    state.loadedProjectScriptCount = loadedProjectState.scriptCount;
    state.loadedProjectPickupId = loadedProjectState.pickupId;
    state.loadedProjectDoorId = loadedProjectState.doorId;
    state.loadedProjectTriggerId = loadedProjectState.triggerId;
    state.loadedProjectMissionId = loadedProjectState.missionId;
    state.loadedProjectRewardId = loadedProjectState.rewardId;
    state.loadedProjectGateId = loadedProjectState.gateId;
    state.loadedProjectEnemySpawnId = loadedProjectState.enemySpawnId;
    state.loadedProjectWaveId = loadedProjectState.waveId;
    state.loadedProjectEquipmentId = loadedProjectState.equipmentId;
    state.loadedProjectNpcId = loadedProjectState.npcId;
    state.loadedProjectMerchantId = loadedProjectState.merchantId;
    state.loadedProjectSpawned = loadedProjectState.spawned;
    state.loadedProjectApplied = loadedProjectState.applied;
    state.playableExportFormat = playableExportState.format;
    state.playableExportFilename = playableExportState.filename;
    state.playableExportObjectCount = playableExportState.objectCount;
    state.playableExportCommandCount = playableExportState.commandCount;
    state.playableExportScriptCount = playableExportState.scriptCount;
    state.playableExportComponentCount = playableExportState.componentCount;
    state.playableExportHtmlBytes = playableExportState.htmlBytes;
    state.playableExportCrateBytes = playableExportState.crateBytes;
    state.playableExportFiles = playableExportState.files;
    state.playableExportHasRuntimeControls = playableExportState.hasRuntimeControls;
    state.publishedFormat = publishedState.format;
    state.publishedSlug = publishedState.slug;
    state.publishedShareUrl = publishedState.shareUrl;
    state.publishedObjects = publishedState.objects;
    state.publishedCommands = publishedState.commands;
    state.publishedScripts = publishedState.scripts;
    state.publishedComponents = publishedState.components;
    state.publishedPlayableHtmlBytes = publishedState.playableHtmlBytes;
    state.publishedStoredCount = publishedState.storedCount;
    state.publishedDecodedFormat = publishedState.decodedFormat;
    state.publishedDecodedObjects = publishedState.decodedObjects;
    state.publishedDecodedComponents = publishedState.decodedComponents;
    state.publishedPublicCloudAssetCount = publishedState.publicCloudAssetCount;
    state.publishedPublicCloudAssetId = publishedState.publicCloudAssetId;
    state.publishedPublicCloudAssetDetailStatus = publishedState.publicCloudAssetDetailStatus;
    state.publishedPublicCloudAssetDownloadStatus = publishedState.publicCloudAssetDownloadStatus;
    state.publishedPrivateCloudAssetNoAuthStatus = publishedState.privateCloudAssetNoAuthStatus;
    state.publishedApiCloudAssetCount = publishedState.apiCloudAssetCount;
    state.publishedCloudStatus = publishedState.cloudStatus;
    state.publishedCloudSource = publishedState.cloudSource;
    state.publishedApiStatus = publishedState.apiStatus;
    state.publishedApiFormat = publishedState.apiFormat;
    state.publishedApiObjects = publishedState.apiObjects;
    state.publishedApiComponents = publishedState.apiComponents;
    state.publishedApiOwnerManaged = publishedState.apiOwnerManaged;
    state.publishedListStatus = publishedState.listStatus;
    state.publishedListHasSlug = publishedState.listHasSlug;
    state.publishedListOwnerManaged = publishedState.listOwnerManaged;
    state.publishedDeleteGuardBlockedStatus = deleteGuardState.blockedStatus;
    state.publishedDeleteGuardDeletedStatus = deleteGuardState.deletedStatus;
    state.publishedDeleteGuardMissingStatus = deleteGuardState.missingStatus;
    state.publishedDeleteGuardAuthorization = deleteGuardState.deletedAuthorization;
    state.publishedLoadStatus = publishedLoadState.status;
    state.publishedLoadSlug = publishedLoadState.slug;
    state.publishedLoadObjectCount = publishedLoadState.objectCount;
    state.publishedLoadProjectStatus = publishedLoadState.projectStatus;
    state.publishedLoadRestoredObjects = publishedLoadState.restoredObjects;
    state.publishedLibraryCloudStatus = publishedLibraryState.cloudStatus;
    state.publishedLibraryCloudCount = publishedLibraryState.cloudCount;
    state.publishedLibraryLocalCount = publishedLibraryState.localCount;
    state.publishedLibraryHasCloudSmoke = publishedLibraryState.hasCloudSmoke;
    state.publishedLibraryHasLocalSmoke = publishedLibraryState.hasLocalSmoke;
    state.publishedLibraryCopyButtons = publishedLibraryState.copyButtons;
    state.publishedLibraryOpenButtons = publishedLibraryState.openButtons;
    state.publishedLibraryLoadButtons = publishedLibraryState.loadButtons;
    state.publishedLibraryHasCloudEdit = publishedLibraryState.hasCloudEdit;
    state.publishedLibraryHasLocalEdit = publishedLibraryState.hasLocalEdit;
    state.publishedLibraryHasCloudDetails = publishedLibraryState.hasCloudDetails;
    state.publishedLibraryHasLocalDetails = publishedLibraryState.hasLocalDetails;
    state.publishedLibraryHasAdminTokenInput = publishedLibraryState.hasAdminTokenInput;
    state.publishedLibraryHasCreatorNameInput = publishedLibraryState.hasCreatorNameInput;
    state.publishedLibraryHasSearch = publishedLibraryState.hasSearch;
    state.publishedLibrarySourceFilters = publishedLibraryState.sourceFilters;
    state.publishedDetailPanelStatus = publishedDetailState.panelStatus;
    state.publishedDetailSlug = publishedDetailState.slug;
    state.publishedDetailOwnerManaged = publishedDetailState.ownerManaged;
    state.publishedDetailHasProjectData = publishedDetailState.hasProjectData;
    state.publishedDetailHasDuplicate = publishedDetailState.hasDuplicate;
    state.publishedDetailHasDelete = publishedDetailState.hasDelete;
    state.publishedDetailHasVisibilityToggle = publishedDetailState.hasVisibilityToggle;
    state.publishedDetailHasFeaturedToggle = publishedDetailState.hasFeaturedToggle;
    state.publishedDetailCreatorName = publishedDetailState.creatorName;
    state.publishedDetailVisibility = publishedDetailState.visibility;
    state.publishedMetadataGuardUpdateStatus = metadataGuardState.updateStatus;
    state.publishedMetadataGuardVisibility = metadataGuardState.updateVisibility;
    state.publishedMetadataGuardFeaturedUpdateStatus = metadataGuardState.featuredUpdateStatus;
    state.publishedMetadataGuardDirectFeatured = metadataGuardState.directFeatured;
    state.publishedMetadataGuardPublicListHasSlug = metadataGuardState.publicListHasSlug;
    state.publishedMetadataGuardDirectListVisibility = metadataGuardState.directListVisibility;
    state.marketplaceStatus = marketplaceState.status;
    state.marketplaceTotal = marketplaceState.total;
    state.marketplaceShown = marketplaceState.shown;
    state.marketplacePage = marketplaceState.page;
    state.marketplacePages = marketplaceState.pages;
    state.marketplacePageSize = marketplaceState.pageSize;
    state.marketplaceQuery = marketplaceState.query;
    state.marketplaceTag = marketplaceState.tag;
    state.marketplaceSort = marketplaceState.sort;
    state.marketplaceAvailableTags = marketplaceState.availableTags;
    state.marketplaceDiscoveryStatus = marketplaceState.discoveryStatus;
    state.marketplaceDiscoveryTotal = marketplaceState.discoveryTotal;
    state.marketplaceDiscoveryRailCards = marketplaceState.discoveryRailCards;
    state.marketplaceDiscoveryFeaturedSlugs = marketplaceState.discoveryFeaturedSlugs;
    state.marketplaceDiscoveryAdminFeaturedSlugs = marketplaceState.discoveryAdminFeaturedSlugs;
    state.marketplaceDiscoveryFeaturedFlags = marketplaceState.discoveryFeaturedFlags;
    state.marketplaceDiscoveryRecentSlugs = marketplaceState.discoveryRecentSlugs;
    state.marketplaceDiscoverySystemsSlugs = marketplaceState.discoverySystemsSlugs;
    state.marketplaceHasDiscoveryRails = marketplaceState.hasDiscoveryRails;
    state.marketplaceHasSection = marketplaceState.hasSection;
    state.marketplaceHasSearch = marketplaceState.hasSearch;
    state.marketplaceHasSort = marketplaceState.hasSort;
    state.marketplaceHasTagFilters = marketplaceState.hasTagFilters;
    state.marketplaceHasPagination = marketplaceState.hasPagination;
    state.marketplaceHasRefresh = marketplaceState.hasRefresh;
    state.marketplaceHasSmoke = marketplaceState.hasSmoke;
    state.marketplaceHasUnlistedGuard = marketplaceState.hasUnlistedGuard;
    state.marketplaceFeaturedBadgeCount = marketplaceState.featuredBadgeCount;
    state.marketplaceCreatorText = marketplaceState.creatorText;
    state.marketplaceTagText = marketplaceState.tagText;
    state.marketplacePlayHref = marketplaceState.playHref;
    state.marketplaceRemixHref = marketplaceState.remixHref;
    state.marketplaceDetailHref = marketplaceState.detailHref;
    state.marketplaceSummary = marketplaceState.summary;
    state.gameDetailStatus = gameDetailState.status;
    state.gameDetailSlug = gameDetailState.slug;
    state.gameDetailTitle = gameDetailState.title;
    state.gameDetailCreatorName = gameDetailState.creatorName;
    state.gameDetailVisibility = gameDetailState.visibility;
    state.gameDetailFeatured = gameDetailState.featured;
    state.gameDetailFeaturedAt = gameDetailState.featuredAt;
    state.gameDetailTags = gameDetailState.tags;
    state.gameDetailSystems = gameDetailState.systems;
    state.gameDetailObjects = gameDetailState.objects;
    state.gameDetailComponents = gameDetailState.components;
    state.gameDetailScripts = gameDetailState.scripts;
    state.gameDetailPlayHref = gameDetailState.playHref;
    state.gameDetailRemixHref = gameDetailState.remixHref;
    state.gameDetailHasPlay = gameDetailState.hasPlay;
    state.gameDetailHasRemix = gameDetailState.hasRemix;
    state.gameDetailHasMarketplace = gameDetailState.hasMarketplace;
    state.gameDetailHasStats = gameDetailState.hasStats;
    state.adminApiGuardStatus = adminGuardState.blockedStatus;
    state.adminAuditApiGuardStatus = adminGuardState.auditBlockedStatus;
    state.adminAuditVerifyGuardStatus = adminGuardState.auditVerifyBlockedStatus;
    state.adminAuditBackfillGuardStatus = adminGuardState.auditBackfillBlockedStatus;
    state.adminAssetCleanupGuardStatus = adminGuardState.assetCleanupBlockedStatus;
    state.adminAuditD1VerifyStatus = adminAuditVerifyState?.status || 0;
    state.adminAuditD1VerifySource = adminAuditVerifyState?.source || '';
    state.adminAuditD1WriteVerified = adminAuditVerifyState?.writeVerified === true;
    state.adminAssetCleanupDryRunStatus = adminAssetCleanupDryRunState?.status || 0;
    state.adminAssetCleanupDryRunOk = adminAssetCleanupDryRunState?.ok === true;
    state.adminAssetCleanupDryRunDeleted = adminAssetCleanupDryRunState?.deleted || 0;
    state.adminDashboardStatus = adminDashboardState.status;
    state.adminDashboardHasTokenInput = adminDashboardState.hasTokenInput;
    state.adminDashboardHasControls = adminDashboardState.hasControls;
    state.adminDashboardHasTable = adminDashboardState.hasTable;
    state.adminDashboardHasAuditDetail = adminDashboardState.hasAuditDetail;
    state.adminDashboardAuditDetailStatus = adminDashboardState.auditDetailStatus;
    state.adminDashboardHasAuditStorage = adminDashboardState.hasAuditStorage;
    state.adminDashboardHasAuditStorageVerify = adminDashboardState.hasAuditStorageVerify;
    state.adminDashboardAuditStorageStatus = adminDashboardState.auditStorageStatus;
    state.adminDashboardAuditStorageWriteVerified = adminDashboardState.auditStorageWriteVerified;
    state.adminDashboardHasAuditBackfillDryRun = adminDashboardState.hasAuditBackfillDryRun;
    state.adminDashboardHasAuditBackfillRun = adminDashboardState.hasAuditBackfillRun;
    state.adminDashboardAuditBackfillStatus = adminDashboardState.auditBackfillStatus;
    state.adminDashboardAuditBackfillDryRun = adminDashboardState.auditBackfillDryRun;
    state.adminDashboardAuditBackfillScanned = adminDashboardState.auditBackfillScanned;
    state.adminDashboardAuditBackfillEvents = adminDashboardState.auditBackfillEvents;
    state.adminDashboardAuditBackfillWritten = adminDashboardState.auditBackfillWritten;
    state.adminDashboardHasAssetCleanup = adminDashboardState.hasAssetCleanup;
    state.adminDashboardHasAssetCleanupDryRun = adminDashboardState.hasAssetCleanupDryRun;
    state.adminDashboardHasAssetCleanupRun = adminDashboardState.hasAssetCleanupRun;
    state.adminDashboardAssetCleanupStatus = adminDashboardState.assetCleanupStatus;
    state.adminDashboardAssetCleanupDryRun = adminDashboardState.assetCleanupDryRun;
    state.adminDashboardAssetCleanupScanned = adminDashboardState.assetCleanupScanned;
    state.adminDashboardAssetCleanupOrphaned = adminDashboardState.assetCleanupOrphaned;
    state.adminDashboardAssetCleanupDeleted = adminDashboardState.assetCleanupDeleted;
    state.adminDashboardAssetCleanupErrors = adminDashboardState.assetCleanupErrors;
    state.adminDashboardHasCleanupWorker = adminDashboardState.hasCleanupWorker;
    state.adminDashboardHasCleanupWorkerDryRun = adminDashboardState.hasCleanupWorkerDryRun;
    state.adminDashboardHasCleanupWorkerExport = adminDashboardState.hasCleanupWorkerExport;
    state.adminDashboardHasCleanupWorkerCsvExport = adminDashboardState.hasCleanupWorkerCsvExport;
    state.adminDashboardCleanupWorkerDryRunDisabled = adminDashboardState.cleanupWorkerDryRunDisabled;
    state.adminDashboardCleanupWorkerExportDisabled = adminDashboardState.cleanupWorkerExportDisabled;
    state.adminDashboardCleanupWorkerCsvExportDisabled = adminDashboardState.cleanupWorkerCsvExportDisabled;
    state.adminDashboardCleanupWorkerStatus = adminDashboardState.cleanupWorkerStatus;
    state.adminDashboardCleanupWorkerName = adminDashboardState.cleanupWorkerName;
    state.adminDashboardCleanupWorkerUrl = adminDashboardState.cleanupWorkerUrl;
    state.adminDashboardCleanupWorkerDeleteEnabled = adminDashboardState.cleanupWorkerDeleteEnabled;
    state.adminDashboardCleanupWorkerLimit = adminDashboardState.cleanupWorkerLimit;
    state.adminDashboardCleanupWorkerHasR2Binding = adminDashboardState.cleanupWorkerHasR2Binding;
    state.adminDashboardCleanupWorkerHasGameStore = adminDashboardState.cleanupWorkerHasGameStore;
    state.adminDashboardCleanupWorkerHasAuditStore = adminDashboardState.cleanupWorkerHasAuditStore;
    state.adminDashboardCleanupWorkerLastRunKnown = adminDashboardState.cleanupWorkerLastRunKnown;
    state.adminDashboardCleanupWorkerHasLastRun = adminDashboardState.cleanupWorkerHasLastRun;
    state.adminDashboardCleanupWorkerHistoryKnown = adminDashboardState.cleanupWorkerHistoryKnown;
    state.adminDashboardCleanupWorkerHistoryCount = adminDashboardState.cleanupWorkerHistoryCount;
    state.adminDashboardCleanupWorkerHistoryLimit = adminDashboardState.cleanupWorkerHistoryLimit;
    state.adminDashboardCleanupWorkerHistoryPersisted = adminDashboardState.cleanupWorkerHistoryPersisted;
    state.adminDashboardCleanupWorkerD1HistoryAvailable = adminDashboardState.cleanupWorkerD1HistoryAvailable;
    state.adminDashboardCleanupWorkerD1HistoryPersisted = adminDashboardState.cleanupWorkerD1HistoryPersisted;
    state.adminDashboardCleanupWorkerHistorySource = adminDashboardState.cleanupWorkerHistorySource;
    state.adminDashboardCleanupWorkerKvHistoryCount = adminDashboardState.cleanupWorkerKvHistoryCount;
    state.adminDashboardCleanupWorkerExportCount = adminDashboardState.cleanupWorkerExportCount;
    state.adminDashboardCleanupWorkerExportFileName = adminDashboardState.cleanupWorkerExportFileName;
    state.adminDashboardCleanupWorkerLatestHistoryReason = adminDashboardState.cleanupWorkerLatestHistoryReason;
    state.adminDashboardCleanupWorkerLastRunReason = adminDashboardState.cleanupWorkerLastRunReason;
    state.adminDashboardCleanupWorkerLastRunFinishedAt = adminDashboardState.cleanupWorkerLastRunFinishedAt;
    state.adminDashboardCleanupWorkerLastRunScanned = adminDashboardState.cleanupWorkerLastRunScanned;
    state.adminDashboardCleanupWorkerLastRunOrphaned = adminDashboardState.cleanupWorkerLastRunOrphaned;
    state.adminDashboardCleanupWorkerLastRunDeleted = adminDashboardState.cleanupWorkerLastRunDeleted;
    state.adminDashboardCleanupWorkerLastRunErrorCount = adminDashboardState.cleanupWorkerLastRunErrorCount;
    state.adminDashboardCleanupWorkerLastRunDryRun = adminDashboardState.cleanupWorkerLastRunDryRun;
    state.adminDashboardCleanupWorkerLastRunPersisted = adminDashboardState.cleanupWorkerLastRunPersisted;
    state.adminDashboardCleanupWorkerDryRunStatus = adminDashboardCleanupWorkerDryRunState?.status || '';
    state.adminDashboardCleanupWorkerDryRunReason = adminDashboardCleanupWorkerDryRunState?.reason || '';
    state.adminDashboardCleanupWorkerDryRunScanned = adminDashboardCleanupWorkerDryRunState?.scanned || 0;
    state.adminDashboardCleanupWorkerDryRunOrphaned = adminDashboardCleanupWorkerDryRunState?.orphaned || 0;
    state.adminDashboardCleanupWorkerDryRunDeleted = adminDashboardCleanupWorkerDryRunState?.deleted || 0;
    state.adminDashboardCleanupWorkerDryRunErrors = adminDashboardCleanupWorkerDryRunState?.errors || 0;
    state.adminDashboardCleanupWorkerDryRunPersisted = adminDashboardCleanupWorkerDryRunState?.lastRunPersisted === true;
    state.adminDashboardCleanupWorkerDryRunHistoryPersisted = adminDashboardCleanupWorkerDryRunState?.historyPersisted === true;
    state.adminDashboardCleanupWorkerDryRunHistoryCount = adminDashboardCleanupWorkerDryRunState?.historyCount || 0;
    state.adminDashboardCleanupWorkerDryRunD1Persisted = adminDashboardCleanupWorkerDryRunState?.d1HistoryPersisted === true;
    state.adminDashboardCleanupWorkerDryRunHistorySource = adminDashboardCleanupWorkerDryRunState?.historySource || '';
    state.adminDashboardCleanupWorkerExportStatus = adminDashboardCleanupWorkerExportState?.ok ? 'ready' : '';
    state.adminDashboardCleanupWorkerExportedCount = adminDashboardCleanupWorkerExportState?.exportedCount || 0;
    state.adminDashboardCleanupWorkerExportedFileName = adminDashboardCleanupWorkerExportState?.fileName || '';
    state.adminDashboardCleanupWorkerCsvExportStatus = adminDashboardCleanupWorkerCsvExportState?.ok ? 'ready' : '';
    state.adminDashboardCleanupWorkerCsvExportedCount = adminDashboardCleanupWorkerCsvExportState?.rowCount || 0;
    state.adminDashboardCleanupWorkerCsvExportedFileName = adminDashboardCleanupWorkerCsvExportState?.fileName || '';
    state.adminDashboardHasCleanupAudit = adminDashboardState.hasCleanupAudit;
    state.adminDashboardHasCleanupAuditRefresh = adminDashboardState.hasCleanupAuditRefresh;
    state.adminDashboardHasCleanupAuditCsvExport = adminDashboardState.hasCleanupAuditCsvExport;
    state.adminDashboardHasCleanupAuditPaging = adminDashboardState.hasCleanupAuditPrevious && adminDashboardState.hasCleanupAuditNext;
    state.adminDashboardHasCleanupAuditDateFilters = adminDashboardState.hasCleanupAuditDateFilters;
    state.adminDashboardCleanupAuditStatus = adminDashboardState.cleanupAuditStatus;
    state.adminDashboardCleanupAuditRows = adminDashboardState.cleanupAuditRows;
    state.adminDashboardCleanupAuditTotal = adminDashboardState.cleanupAuditTotal;
    state.adminDashboardCleanupAuditSource = adminDashboardState.cleanupAuditSource;
    state.adminDashboardCleanupAuditReason = adminDashboardState.cleanupAuditReason;
    state.adminDashboardCleanupAuditMode = adminDashboardState.cleanupAuditMode;
    state.adminDashboardCleanupAuditFrom = adminDashboardState.cleanupAuditFrom;
    state.adminDashboardCleanupAuditTo = adminDashboardState.cleanupAuditTo;
    state.adminDashboardCleanupAuditLimit = adminDashboardState.cleanupAuditLimit;
    state.adminDashboardCleanupAuditOffset = adminDashboardState.cleanupAuditOffset;
    state.adminDashboardCleanupAuditHasPrevious = adminDashboardState.cleanupAuditHasPrevious;
    state.adminDashboardCleanupAuditHasNext = adminDashboardState.cleanupAuditHasNext;
    state.adminDashboardCleanupAuditRefreshDisabled = adminDashboardState.cleanupAuditRefreshDisabled;
    state.adminDashboardCleanupAuditCsvExportDisabled = adminDashboardState.cleanupAuditCsvExportDisabled;
    state.adminDashboardCleanupAuditPreviousDisabled = adminDashboardState.cleanupAuditPreviousDisabled;
    state.adminDashboardCleanupAuditNextDisabled = adminDashboardState.cleanupAuditNextDisabled;
    state.adminDashboardCleanupAuditProbeStatus = adminDashboardCleanupAuditState?.status || '';
    state.adminDashboardCleanupAuditProbeRows = adminDashboardCleanupAuditState?.rows || 0;
    state.adminDashboardCleanupAuditProbeTotal = adminDashboardCleanupAuditState?.total || 0;
    state.adminDashboardCleanupAuditProbeSource = adminDashboardCleanupAuditState?.source || '';
    state.adminDashboardCleanupAuditProbeLatestReason = adminDashboardCleanupAuditState?.latestReason || '';
    state.adminDashboardCleanupAuditProbeLatestDryRun = adminDashboardCleanupAuditState?.latestDryRun === true;
    state.adminDashboardCleanupAuditCsvExportStatus = adminDashboardCleanupAuditCsvState?.ok ? 'ready' : '';
    state.adminDashboardCleanupAuditCsvExportedCount = adminDashboardCleanupAuditCsvState?.rowCount || 0;
    state.adminDashboardCleanupAuditCsvExportedFileName = adminDashboardCleanupAuditCsvState?.fileName || '';
    state.adminDashboardHasAdminActor = adminDashboardState.hasAdminActor;
    state.adminDashboardAdminName = adminDashboardState.adminName;
    state.adminDashboardAdminRole = adminDashboardState.adminRole;
    state.adminDashboardHasReviewQueue = adminDashboardState.hasReviewQueue;
    state.adminDashboardHasReviewNoteInput = adminDashboardState.hasReviewNoteInput;
    state.adminDashboardReviewNoteRequired = adminDashboardState.reviewNoteRequired;
    state.adminDashboardReviewNoteCount = adminDashboardState.reviewNoteCount;
    state.adminDashboardAuthedStatus = adminDashboardAuthedState?.status || '';
    state.adminDashboardAuthedTotal = adminDashboardAuthedState?.total || 0;
    state.adminDashboardAuthedAdminName = adminDashboardAuthedState?.adminName || '';
    state.adminDashboardAuthedAdminRole = adminDashboardAuthedState?.adminRole || '';
    state.adminDashboardAuthedSmokeListed = adminDashboardAuthedState?.rowSlugs?.includes(smokePublishedSlug) || false;
    state.adminDashboardLoadedAuditStatus = adminDashboardAuditState?.status || '';
    state.adminDashboardLoadedAuditSlug = adminDashboardAuditState?.slug || '';
    state.adminDashboardLoadedAuditRows = adminDashboardAuditState?.rows || 0;
    state.adminDashboardLoadedAuditSource = adminDashboardAuditState?.source || '';
    state.adminDashboardStorageProbeStatus = adminDashboardStorageState?.status || '';
    state.adminDashboardStorageProbeSource = adminDashboardStorageState?.source || '';
    state.adminDashboardStorageProbeWriteVerified = adminDashboardStorageState?.writeVerified === true;
    state.adminDashboardBackfillProbeStatus = adminDashboardBackfillState?.status || '';
    state.adminDashboardBackfillProbeDryRun = adminDashboardBackfillState?.dryRun === true;
    state.adminDashboardBackfillProbeScanned = adminDashboardBackfillState?.scanned || 0;
    state.adminDashboardBackfillProbeEvents = adminDashboardBackfillState?.events || 0;
    state.adminDashboardBackfillProbeWritten = adminDashboardBackfillState?.written || 0;
    state.adminDashboardAssetCleanupProbeStatus = adminDashboardAssetCleanupState?.status || '';
    state.adminDashboardAssetCleanupProbeDryRun = adminDashboardAssetCleanupState?.dryRun === true;
    state.adminDashboardAssetCleanupProbeScanned = adminDashboardAssetCleanupState?.scanned || 0;
    state.adminDashboardAssetCleanupProbeOrphaned = adminDashboardAssetCleanupState?.orphaned || 0;
    state.adminDashboardAssetCleanupProbeDeleted = adminDashboardAssetCleanupState?.deleted || 0;
    state.adminDashboardAssetCleanupProbeErrors = adminDashboardAssetCleanupState?.errors || 0;
    state.adminSmokeTokenProvided = !!smokeAdminToken;
    state.publishedFilterQuery = publishedFilterState.query;
    state.publishedFilterSource = publishedFilterState.source;
    state.publishedFilterCloudShown = publishedFilterState.cloudShown;
    state.publishedFilterLocalShown = publishedFilterState.localShown;
    state.publishedEditorLoadStatus = publishedEditorLoadState.status;
    state.publishedEditorLoadSlug = publishedEditorLoadState.slug;
    state.publishedEditorLoadObjectCount = publishedEditorLoadState.objectCount;
    state.publishedEditorLoadScriptCount = publishedEditorLoadState.scriptCount;
    state.publishedEditorLoadProjectStatus = publishedEditorLoadState.projectStatus;
    state.publishedEditorLoadMode = publishedEditorLoadState.mode;
    state.publishedCleanupDeleteStatus = publishedCleanupState.deleteStatus;
    state.publishedCleanupDeletedOk = publishedCleanupState.deletedOk;
    state.publishedCleanupAttempted = publishedCleanupState.cleanupAttempted;
    state.publishedCleanupDeleted = publishedCleanupState.cleanupDeleted;
    state.publishedCleanupErrors = publishedCleanupState.cleanupErrors;
    state.publishedCleanupBinding = publishedCleanupState.cleanupBinding;
    state.publishedCleanupPublicStatus = publishedCleanupState.publicDetailAfterDeleteStatus;
    state.publishedCleanupPublicDownloadStatus = publishedCleanupState.publicDownloadAfterDeleteStatus;
    state.publishedCleanupGameStatus = publishedCleanupState.gameAfterDeleteStatus;
    state.respawnHealth = afterRespawnState.health;
    state.respawnCount = afterRespawnState.respawns;
    state.openedDoor = doorTriggerState.openedDoor;
    state.firedTrigger = doorTriggerState.firedTrigger;
    state.doorProgress = doorTriggerState.doorProgress;
    state.triggerFireCount = doorTriggerState.triggerFireCount;
    state.missionStep = missionFlowState.doneStep;
    state.missionReward = missionFlowState.claimedReward;
    state.missionGate = missionFlowState.unlockedGate;
    state.missionGateProgress = missionFlowState.gateProgress;
    state.missionRewardScore = missionFlowState.rewardScore;
    state.missionRuntimeScore = missionFlowState.runtimeScore;
    state.npcName = npcRuntimeState.name;
    state.npcDialogue = npcRuntimeState.dialogue;
    state.npcReward = npcRuntimeState.reward;
    state.npcRewardClaimed = npcRuntimeState.rewardClaimed;
    state.merchantName = merchantRuntimeState.name;
    state.merchantItem = merchantRuntimeState.item;
    state.merchantPrice = merchantRuntimeState.price;
    state.merchantSold = merchantRuntimeState.sold;
    state.merchantArmor = merchantRuntimeState.armor;
    state.merchantArmorPower = merchantRuntimeState.armorPower;
    state.waveSpawn = waveRuntimeState.spawn;
    state.waveName = waveRuntimeState.wave;
    state.waveActive = waveRuntimeState.active;
    state.waveAlive = waveRuntimeState.alive;
    state.waveEnemyCount = waveRuntimeState.enemyCount;
    state.lootDrop = lootState.drop;
    state.lootWeapon = lootState.weapon;
    state.lootWeaponPower = lootState.weaponPower;
    state.lootTrinket = lootState.trinket;
    state.lootAttack = lootState.attack;
    state.lootXp = lootState.xp;
    state.lootInventoryCount = lootState.inventoryCount;

    if (pageErrors.length) throw new Error(`Page errors:\n${pageErrors.join('\n')}`);
    if (badAssetResponses.length) throw new Error(`Bad model/texture responses:\n${badAssetResponses.join('\n')}`);
    if (badConsole.length) throw new Error(`Console smoke failures:\n${badConsole.join('\n')}`);
    if (!state.hasAssetResolver) throw new Error('window._crateAssetUrl was not available');
    if (forcedAssetBaseUrl && state.assetBaseUrl !== forcedAssetBaseUrl) {
      throw new Error(`Expected browser asset base ${forcedAssetBaseUrl}, got ${state.assetBaseUrl || 'empty'}`);
    }
    if (!state.hasInspector || !state.hasBlueprints || !state.hasProject || !state.hasAssetPack || !state.hasReadiness || !state.hasPerformance || !state.hasValidation || !state.hasTemplates || !state.hasStarterKits || !state.hasSystems) throw new Error('Game Builder Project, Asset Pack, Readiness, Performance, Validation, Templates, Starter Kits, Systems, Inspector, or Blueprints section was missing');
    if (state.templateCount < 6 || !state.templateIds.includes('survival') || !state.templateIds.includes('rpg') || !state.templateIds.includes('tycoon')) {
      throw new Error(`Game Builder templates were missing starter genres: ${JSON.stringify(state)}`);
    }
    if (state.starterKitCount < 3 || !state.starterKitIds.includes('adventure-loop') || state.starterKitLatest?.id !== 'adventure-loop' || !/Adventure Loop added/i.test(state.starterKitStatus)) {
      throw new Error(`Game Builder starter kits were not available or did not apply: ${JSON.stringify(state)}`);
    }
    if (!state.hasInspectorHealth || state.inspectorHealthStatus !== 'ready' || state.inspectorHealthComponents < 2 || state.inspectorMetricCount < 3 || state.inspectorHealthIssues !== 0) {
      throw new Error(`Game Builder inspector health did not report the selected gameplay object as ready: ${JSON.stringify(state)}`);
    }
    if (state.assetPackStatus !== 'loaded' || state.assetPackVersion !== assetManifest.manifest.version) {
      throw new Error(`Asset Pack diagnostics did not load the production manifest: ${JSON.stringify(state)}`);
    }
    if (state.systemCardCount < 20 ||
      !state.installedSystems.includes('inventory') ||
      !state.installedSystems.includes('runtime') ||
      !state.installedSystems.includes('pickups') ||
      !state.installedSystems.includes('equipment') ||
      !state.installedSystems.includes('npcs') ||
      !state.installedSystems.includes('merchants') ||
      !state.installedSystems.includes('missions') ||
      !state.installedSystems.includes('rewards') ||
      !state.installedSystems.includes('gates') ||
      !state.installedSystems.includes('enemySpawns') ||
      !state.installedSystems.includes('waves') ||
      !state.installedSystems.includes('checkpoints') ||
      !state.installedSystems.includes('win') ||
      !state.installedSystems.includes('doors') ||
      !state.installedSystems.includes('triggers') ||
      !state.installedSystems.includes('spawns')) {
      throw new Error(`Game Systems library did not install expected systems: ${JSON.stringify(state)}`);
    }
    if (state.readinessTone !== 'ready' ||
      state.readinessObjectCount < 100 ||
      state.readinessScriptCount < 1 ||
      state.readinessComponentCount < 14 ||
      state.readinessEquipmentCount < 1 ||
      state.readinessNpcCount < 1 ||
      state.readinessMerchantCount < 1 ||
      state.readinessCheckpointCount < 1 ||
      state.readinessWinConditionCount < 1 ||
      state.readinessSpawnCount < 1 ||
      state.readinessDoorCount < 1 ||
      state.readinessTriggerCount < 1 ||
      state.readinessMissionStepCount < 1 ||
      state.readinessRewardCount < 1 ||
      state.readinessGateCount < 1 ||
      state.readinessEnemySpawnCount < 1 ||
      state.readinessWaveCount < 1 ||
      state.readinessAssetStatus !== 'loaded') {
      throw new Error(`Game Builder readiness did not report a testable game: ${JSON.stringify(state)}`);
    }
    if (!state.performanceStatus ||
      state.performanceFps <= 0 ||
      state.performanceFrameMs <= 0 ||
      state.performanceRows < 5 ||
      !state.qualityButtons.includes('low') ||
      !state.qualityButtons.includes('medium') ||
      !state.qualityButtons.includes('high') ||
      !state.qualityButtons.includes('ultra') ||
      !state.userImportValidatorReady ||
      !state.userModelInspectorReady ||
      !state.userAssetStorageReady ||
      state.userAssetStoragePanelStatus !== 'loaded' ||
      state.userAssetStorageQuotaBytes <= 0 ||
      !state.projectValidatorReady ||
      state.projectSchemaVersion !== 3 ||
      state.cullingProcessed < 1 ||
      state.cullingMaxPerPass < 1 ||
      !state.objectPoolStats ||
      state.poolDamageCreated < 1 ||
      state.poolImpactCreated < 1 ||
      state.poolMuzzleCreated < 1 ||
      state.performanceTriangles <= 0 ||
      state.performanceCalls > 900 ||
      state.performanceTriangles > 750000 ||
      !state.performanceBudget ||
      !Number.isFinite(Number(state.performanceBudget.cullDistance)) ||
      !Number.isFinite(Number(state.performanceBudget.shadowDistance)) ||
      !state.cityPerformanceProceduralProps ||
      !state.cityPerformanceProceduralVehicles ||
      !state.cityPerformanceProceduralNature) {
      throw new Error(`Game Builder performance panel did not report live renderer metrics: ${JSON.stringify(state)}`);
    }
    if (state.rawBuildCitySamples < 45 ||
      state.rawBuildCityFps <= 0 ||
      state.rawBuildCityFrameMs <= 0 ||
      state.rawBuildCityCalls > 900 ||
      state.rawBuildCityTriangles > 750000 ||
      state.rawBuildCityObjects < 100 ||
      state.rawBuildCityMode !== 'edit') {
      throw new Error(`Raw Build City performance probe did not meet budget: ${JSON.stringify(state)}`);
    }
    if (state.validationStatus !== 'ready' ||
      state.validationErrors !== 0 ||
      state.validationWarnings !== 0 ||
      state.validationSuggestions !== 0 ||
      state.validationRows < 1) {
      throw new Error(`Game Builder validation did not report the scene as ready: ${JSON.stringify(state)}`);
    }
    if (!Array.isArray(state.validationFixActions) ||
      !state.validationFixActions.includes('link-missions') ||
      !state.validationFixActions.includes('link-waves') ||
      !state.validationFixActions.includes('add-colliders') ||
      state.validationFixColliderCount < 1 ||
      state.validationFixUndoRestoredObjects < 1) {
      throw new Error(`Game Builder validation fixes did not preview, undo, and repair mission, wave, and collider checks: ${JSON.stringify(state)}`);
    }
    if (state.projectSaveCount < 1) throw new Error('Project save workflow did not create a saved project');
    if (state.savedProjectVersion !== 3 || state.savedProjectObjectCount < 100 || state.savedProjectScriptCount < 1 || !state.savedProjectHasBuildCityCommand || !state.savedProjectHasSpawnPoint || !state.savedProjectHasDoor || !state.savedProjectHasTriggerZone || !state.savedProjectHasMissionStep || !state.savedProjectHasMissionReward || !state.savedProjectHasMissionGate || !state.savedProjectHasEnemySpawn || !state.savedProjectHasWaveController || !state.savedProjectHasEquipmentItem || !state.savedProjectHasNpc || !state.savedProjectHasMerchant || !state.savedProjectHasValidationFixHistory) {
      throw new Error(`Project save did not capture rich scene state: ${JSON.stringify(state)}`);
    }
    if (state.loadedProjectObjectCount < 100 || state.loadedProjectScriptCount < state.savedProjectScriptCount || state.loadedProjectApplied < 1 || !state.loadedProjectPickupId || !state.loadedProjectDoorId || !state.loadedProjectTriggerId || !state.loadedProjectMissionId || !state.loadedProjectRewardId || !state.loadedProjectGateId || !state.loadedProjectEnemySpawnId || !state.loadedProjectWaveId || !state.loadedProjectEquipmentId || !state.loadedProjectNpcId || !state.loadedProjectMerchantId) {
      throw new Error(`Project load did not restore rich scene state: ${JSON.stringify(state)}`);
    }
    if (state.playableExportFormat !== 'crate-playable-package' || state.playableExportObjectCount < 100 || state.playableExportComponentCount < 14 || state.playableExportHtmlBytes < 50000 || !state.playableExportHasRuntimeControls) {
      throw new Error(`Playable export package did not include a runtime-ready project: ${JSON.stringify(state)}`);
    }
    if (state.publishedFormat !== 'crate-published-game' ||
        state.publishedSlug !== smokePublishedSlug ||
        state.publishedObjects < 100 ||
        state.publishedComponents < 14 ||
        state.publishedScripts < 1 ||
        state.publishedPlayableHtmlBytes < 50000 ||
        state.publishedDecodedFormat !== 'crate-engine-project' ||
        state.publishedDecodedObjects < 100 ||
        state.publishedDecodedComponents < 14 ||
        state.publishedPublicCloudAssetCount < 1 ||
        !state.publishedPublicCloudAssetId ||
        state.publishedPublicCloudAssetDetailStatus !== 200 ||
        state.publishedPublicCloudAssetDownloadStatus !== 200 ||
        state.publishedPrivateCloudAssetNoAuthStatus !== 403 ||
        state.publishedApiCloudAssetCount < 1 ||
        state.publishedCloudStatus !== 'synced' ||
        state.publishedCloudSource !== 'cloudflare-pages-kv' ||
        state.publishedApiStatus !== 200 ||
        state.publishedApiFormat !== 'crate-cloud-published-game' ||
        state.publishedApiObjects < 100 ||
        state.publishedApiComponents < 14 ||
        !state.publishedApiOwnerManaged ||
        state.publishedListStatus !== 200 ||
        !state.publishedListHasSlug ||
        !state.publishedListOwnerManaged ||
        state.publishedDeleteGuardBlockedStatus !== 403 ||
        state.publishedDeleteGuardDeletedStatus !== 200 ||
        state.publishedDeleteGuardMissingStatus !== 404 ||
        state.publishedDeleteGuardAuthorization !== 'owner' ||
        state.publishedLoadStatus !== 'cloud-published' ||
        state.publishedLoadSlug !== smokePublishedSlug ||
        state.publishedLoadObjectCount < 100 ||
        state.publishedLoadProjectStatus !== 'loaded' ||
        state.publishedLibraryCloudStatus !== 'loaded' ||
        !state.publishedLibraryHasCloudSmoke ||
        !state.publishedLibraryHasLocalSmoke ||
        !state.publishedLibraryHasCloudEdit ||
        !state.publishedLibraryHasLocalEdit ||
        !state.publishedLibraryHasCloudDetails ||
        !state.publishedLibraryHasLocalDetails ||
        !state.publishedLibraryHasAdminTokenInput ||
        !state.publishedLibraryHasCreatorNameInput ||
        !state.publishedLibraryHasSearch ||
        !state.publishedLibrarySourceFilters.includes('all') ||
        !state.publishedLibrarySourceFilters.includes('cloud') ||
        !state.publishedLibrarySourceFilters.includes('local') ||
        state.publishedLibraryCopyButtons < 2 ||
        state.publishedLibraryOpenButtons < 2 ||
        state.publishedLibraryLoadButtons < 2 ||
        state.publishedDetailPanelStatus !== 'loaded' ||
        state.publishedDetailSlug !== smokePublishedSlug ||
        !state.publishedDetailOwnerManaged ||
        !state.publishedDetailHasProjectData ||
        !state.publishedDetailHasDuplicate ||
        !state.publishedDetailHasDelete ||
        !state.publishedDetailHasVisibilityToggle ||
        state.publishedDetailCreatorName !== 'Production Smoke Creator' ||
        state.publishedDetailVisibility !== 'public' ||
        state.publishedMetadataGuardUpdateStatus !== 200 ||
        state.publishedMetadataGuardVisibility !== 'unlisted' ||
        state.publishedMetadataGuardPublicListHasSlug ||
        state.publishedMetadataGuardDirectListVisibility !== 'unlisted' ||
        state.marketplaceStatus !== 'loaded' ||
        !state.marketplaceHasSection ||
        !state.marketplaceHasSearch ||
        !state.marketplaceHasSort ||
        state.marketplaceHasTagFilters < 2 ||
        !state.marketplaceHasPagination ||
        !state.marketplaceHasRefresh ||
        !state.marketplaceHasSmoke ||
        state.marketplaceHasUnlistedGuard ||
        state.marketplacePage !== 1 ||
        state.marketplacePageSize !== 12 ||
        state.marketplaceQuery !== smokePublishedSlug ||
        state.marketplaceTag !== 'smoke' ||
        state.marketplaceSort !== 'objects' ||
        !state.marketplaceAvailableTags.includes('smoke') ||
        !state.marketplaceAvailableTags.includes('publish') ||
        state.marketplaceDiscoveryStatus !== 'loaded' ||
        !state.marketplaceHasDiscoveryRails ||
        state.marketplaceDiscoveryTotal < 1 ||
        state.marketplaceDiscoveryRailCards < 1 ||
        state.marketplaceShown < 1 ||
        !/Production Smoke Creator/.test(state.marketplaceCreatorText || '') ||
        !/smoke/.test(state.marketplaceTagText || '') ||
        !state.marketplacePlayHref.includes(`/play?published=${smokePublishedSlug}`) ||
        !state.marketplaceRemixHref.includes(`/play?published=${smokePublishedSlug}`) ||
        !state.marketplaceDetailHref.includes(`/game.html?slug=${smokePublishedSlug}`) ||
        state.gameDetailStatus !== 'loaded' ||
        state.gameDetailSlug !== smokePublishedSlug ||
        state.gameDetailTitle !== 'Production Smoke Published Game' ||
        state.gameDetailCreatorName !== 'Production Smoke Creator' ||
        state.gameDetailVisibility !== 'public' ||
        !Array.isArray(state.gameDetailTags) ||
        !state.gameDetailTags.includes('smoke') ||
        state.gameDetailObjects < 100 ||
        state.gameDetailComponents < 14 ||
        state.gameDetailScripts < 1 ||
        !state.gameDetailHasPlay ||
        !state.gameDetailHasRemix ||
        !state.gameDetailHasMarketplace ||
        !state.gameDetailHasStats ||
        !state.gameDetailPlayHref.includes(`/play?published=${smokePublishedSlug}`) ||
        !state.gameDetailRemixHref.includes(`/play?published=${smokePublishedSlug}`) ||
        state.adminApiGuardStatus !== 403 ||
        state.adminAuditApiGuardStatus !== 403 ||
        state.adminAuditVerifyGuardStatus !== 403 ||
        state.adminAuditBackfillGuardStatus !== 403 ||
        state.adminAssetCleanupGuardStatus !== 403 ||
        (state.adminSmokeTokenProvided && (state.adminAuditD1VerifyStatus !== 200 || state.adminAuditD1VerifySource !== 'd1' || !state.adminAuditD1WriteVerified || state.adminAssetCleanupDryRunStatus !== 200 || !state.adminAssetCleanupDryRunOk || state.adminAssetCleanupDryRunDeleted !== 0)) ||
        state.adminDashboardStatus !== 'locked' ||
        !state.adminDashboardHasTokenInput ||
        !state.adminDashboardHasControls ||
        !state.adminDashboardHasTable ||
        !state.adminDashboardHasAuditDetail ||
        !state.adminDashboardHasAuditStorage ||
        !state.adminDashboardHasAuditStorageVerify ||
        state.adminDashboardAuditStorageStatus !== 'locked' ||
        state.adminDashboardAuditStorageWriteVerified ||
        !state.adminDashboardHasAuditBackfillDryRun ||
        !state.adminDashboardHasAuditBackfillRun ||
        state.adminDashboardAuditBackfillStatus !== 'locked' ||
        !state.adminDashboardAuditBackfillDryRun ||
        state.adminDashboardAuditBackfillScanned !== 0 ||
        state.adminDashboardAuditBackfillEvents !== 0 ||
        state.adminDashboardAuditBackfillWritten !== 0 ||
        state.adminDashboardAuditDetailStatus !== 'empty' ||
        !state.adminDashboardHasAdminActor ||
        !state.adminDashboardHasReviewQueue ||
        !state.adminDashboardHasReviewNoteInput ||
        !state.adminDashboardReviewNoteRequired ||
        (state.adminSmokeTokenProvided && (state.adminDashboardAuthedStatus !== 'loaded' || !state.adminDashboardAuthedSmokeListed || !state.adminDashboardAuthedAdminName || !state.adminDashboardAuthedAdminRole || state.adminDashboardLoadedAuditStatus !== 'loaded' || state.adminDashboardLoadedAuditSlug !== smokePublishedSlug || state.adminDashboardStorageProbeStatus !== 'verified' || state.adminDashboardStorageProbeSource !== 'd1' || !state.adminDashboardStorageProbeWriteVerified || state.adminDashboardBackfillProbeStatus !== 'dry-run' || !state.adminDashboardBackfillProbeDryRun || state.adminDashboardBackfillProbeWritten !== 0)) ||
        state.publishedFilterQuery !== 'production smoke' ||
        state.publishedFilterSource !== 'all' ||
        state.publishedFilterCloudShown < 1 ||
        state.publishedFilterLocalShown < 1 ||
        state.publishedEditorLoadStatus !== 'cloud-published' ||
        state.publishedEditorLoadSlug !== smokePublishedSlug ||
        state.publishedEditorLoadObjectCount < 100 ||
        state.publishedEditorLoadProjectStatus !== 'loaded' ||
        state.publishedEditorLoadMode !== 'edit' ||
        state.publishedCleanupDeleteStatus !== 200 ||
        !state.publishedCleanupDeletedOk ||
        state.publishedCleanupAttempted < 1 ||
        state.publishedCleanupDeleted < 1 ||
        state.publishedCleanupErrors !== 0 ||
        !state.publishedCleanupBinding ||
        state.publishedCleanupPublicStatus !== 404 ||
        state.publishedCleanupPublicDownloadStatus !== 404 ||
        state.publishedCleanupGameStatus !== 404) {
      throw new Error(`Published game library did not finish with a runtime-ready game: ${JSON.stringify(state)}`);
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
    if (!state.gameplayComponents.includes('pickup') || !state.gameplayComponents.includes('checkpoint') || !state.gameplayComponents.includes('winCondition') || !state.gameplayComponents.includes('spawnPoint')) {
      throw new Error(`Required starter gameplay components were not present in the live scene: ${JSON.stringify(state.gameplayComponents)}`);
    }
    if (!state.gameplayComponents.includes('door') || !state.gameplayComponents.includes('triggerZone')) {
      throw new Error(`Door/Trigger components were not present in the live scene: ${JSON.stringify(state.gameplayComponents)}`);
    }
    if (!state.gameplayComponents.includes('missionStep') || !state.gameplayComponents.includes('missionReward') || !state.gameplayComponents.includes('missionGate')) {
      throw new Error(`Mission flow components were not present in the live scene: ${JSON.stringify(state.gameplayComponents)}`);
    }
    if (!state.gameplayComponents.includes('enemySpawn') || !state.gameplayComponents.includes('waveController')) {
      throw new Error(`Enemy wave components were not present in the live scene: ${JSON.stringify(state.gameplayComponents)}`);
    }
    if (!state.gameplayComponents.includes('equipmentItem')) {
      throw new Error(`Equipment component was not present in the live scene: ${JSON.stringify(state.gameplayComponents)}`);
    }
    if (!state.gameplayComponents.includes('npc') || !state.gameplayComponents.includes('merchant')) {
      throw new Error(`NPC/Merchant components were not present in the live scene: ${JSON.stringify(state.gameplayComponents)}`);
    }
    if (state.respawnHealth < 100 || state.respawnCount < 1) {
      throw new Error(`Spawn runtime did not reset health and respawn count: ${JSON.stringify(state)}`);
    }
    if (!state.openedDoor || state.doorProgress <= 0 || state.triggerFireCount < 1) {
      throw new Error(`Door/Trigger runtime did not open a door: ${JSON.stringify(state)}`);
    }
    if (!state.missionStep || !state.missionReward || !state.missionGate || state.missionGateProgress <= 0 || state.missionRewardScore < 75) {
      throw new Error(`Mission flow runtime did not finish: ${JSON.stringify(state)}`);
    }
    if (state.npcName !== 'Smoke guide' || state.npcReward !== 'smoke note' || !state.npcRewardClaimed) {
      throw new Error(`NPC runtime did not finish: ${JSON.stringify(state)}`);
    }
    if (state.merchantItem !== 'smoke cloak' || state.merchantArmor !== 'smoke cloak' || state.merchantArmorPower < 4 || state.merchantSold < 1) {
      throw new Error(`Merchant runtime did not finish: ${JSON.stringify(state)}`);
    }
    if (!state.waveName || state.waveEnemyCount < 2 || state.waveAlive < 1) {
      throw new Error(`Enemy wave runtime did not stay active: ${JSON.stringify(state)}`);
    }
    if (state.lootWeapon !== 'smoke blade' || state.lootAttack < 20 || state.lootInventoryCount < 2) {
      throw new Error(`Inventory/equipment/drop runtime did not update stats: ${JSON.stringify(state)}`);
    }

    return state;
  } finally {
    await browser.close();
  }
}

async function runViewportBuildCityProbe(label, options) {
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
      viewport: { width: options.width, height: options.height },
      deviceScaleFactor: options.deviceScaleFactor || 1,
      isMobile: options.isMobile === true,
      hasTouch: options.hasTouch === true,
      serviceWorkers: 'block',
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

    const probeUrl = `${baseUrl}/play?verify=${encodeURIComponent(`${verify}-${label}`)}`;
    await page.goto(probeUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForFunction(
      () => window._engineReady === true && window._engineBridge && window._crateAssetUrl && document.querySelector('#game-builder-panel'),
      undefined,
      { timeout: timeoutMs }
    );
    await page.waitForSelector('#prompt-input', { timeout: timeoutMs });
    const builderMobileLayout = await page.evaluate(() => {
      const grid = document.querySelector('#gb-project .gb-grid') || document.querySelector('.gb-grid');
      const columns = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
      const modeDock = document.querySelector('#gb-mode-dock');
      const modeDockRect = modeDock?.getBoundingClientRect();
      const modeButtons = [...document.querySelectorAll('#gb-mode-dock .gb-mode-dock-btn')].map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          text: button.textContent.trim(),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          nowrap: getComputedStyle(button).whiteSpace,
        };
      });
      const clipped = [...document.querySelectorAll('#game-builder-panel button')]
        .filter((button) => button.offsetParent !== null)
        .filter((button) => button.scrollWidth > button.clientWidth + 2 || button.scrollHeight > button.clientHeight + 2)
        .map((button) => ({
          text: button.textContent.trim(),
          width: button.clientWidth,
          scrollWidth: button.scrollWidth,
          height: button.clientHeight,
          scrollHeight: button.scrollHeight,
        }))
        .slice(0, 8);
      return {
        columns,
        clipped,
        modeDock: {
          top: Math.round(modeDockRect?.top || 0),
          bottom: Math.round(modeDockRect?.bottom || 0),
          height: Math.round(modeDockRect?.height || 0),
          width: Math.round(modeDockRect?.width || 0),
        },
        modeButtons,
      };
    });
    if (options.width <= 900 && builderMobileLayout.columns > 2) {
      throw new Error(`${label} viewport Builder grid did not collapse to two columns: ${JSON.stringify(builderMobileLayout)}`);
    }
    if (builderMobileLayout.clipped.length) {
      throw new Error(`${label} viewport Builder buttons are clipping text: ${JSON.stringify(builderMobileLayout)}`);
    }
    if (options.width <= 900 &&
        (builderMobileLayout.modeDock.height > 50 ||
          builderMobileLayout.modeDock.bottom > options.height - 78 ||
          builderMobileLayout.modeButtons.some((button) => button.height > 38 || button.nowrap !== 'nowrap'))) {
      throw new Error(`${label} viewport mode dock is crowding or wrapping text: ${JSON.stringify(builderMobileLayout)}`);
    }
    let mobileAssetMenu = null;
    if (options.width <= 900) {
      await page.locator('.gb-toggle').click({ timeout: timeoutMs });
      await page.waitForFunction(
        () => document.querySelector('#game-builder-panel')?.dataset.open === 'true',
        undefined,
        { timeout: timeoutMs }
      );
      mobileAssetMenu = await page.evaluate(() => {
        const panel = document.querySelector('#game-builder-panel');
        const quick = document.querySelector('.gb-mobile-quick-tools');
        const assetButton = quick?.querySelector('button[data-gb-action="assets"]');
        const panelRect = panel?.getBoundingClientRect();
        const buttonRect = assetButton?.getBoundingClientRect();
        return {
          panelOpen: panel?.dataset.open || '',
          quickDisplay: quick ? getComputedStyle(quick).display : '',
          assetButtonTop: Math.round(buttonRect?.top || 0),
          assetButtonBottom: Math.round(buttonRect?.bottom || 0),
          panelTop: Math.round(panelRect?.top || 0),
          panelBottom: Math.round(panelRect?.bottom || 0),
          assetButtonVisible: !!(buttonRect && buttonRect.width > 0 && buttonRect.height > 0 && buttonRect.top >= 0 && buttonRect.bottom <= window.innerHeight),
        };
      });
      if (mobileAssetMenu.panelOpen !== 'true' ||
          mobileAssetMenu.quickDisplay === 'none' ||
          !mobileAssetMenu.assetButtonVisible ||
          mobileAssetMenu.assetButtonTop > mobileAssetMenu.panelBottom) {
        throw new Error(`${label} viewport mobile quick Asset Library is not immediately reachable: ${JSON.stringify(mobileAssetMenu)}`);
      }
      await page.locator('.gb-mobile-quick-tools button[data-gb-action="assets"]').click({ timeout: timeoutMs });
      await page.waitForSelector('[data-asset-category="furniture"]', { timeout: timeoutMs });
      const mobileCategoryState = await page.evaluate(() => {
        const furniture = document.querySelector('[data-asset-category="furniture"]');
        const search = document.querySelector('#_catSearch');
        const searchRect = search?.getBoundingClientRect();
        const cardRect = furniture?.getBoundingClientRect();
        return {
          furnitureLabel: furniture?.dataset.assetCategoryLabel || '',
          furnitureCount: Number(furniture?.dataset.assetCategoryCount || 0),
          searchOffscreen: !!(searchRect && (searchRect.left < 0 || searchRect.right > window.innerWidth)),
          cardWidth: Math.round(cardRect?.width || 0),
        };
      });
      if (mobileCategoryState.furnitureLabel !== 'Furniture' ||
          mobileCategoryState.furnitureCount <= 0 ||
          mobileCategoryState.searchOffscreen ||
          mobileCategoryState.cardWidth <= 0) {
        throw new Error(`${label} viewport asset category picker failed: ${JSON.stringify(mobileCategoryState)}`);
      }
      await page.locator('[data-asset-category="furniture"]').click({ timeout: timeoutMs });
      await page.waitForSelector('[data-asset-card="true"]', { timeout: timeoutMs });
      const mobileGalleryState = await page.evaluate(() => {
        const search = document.querySelector('#asset-gallery-overlay input');
        const firstCard = document.querySelector('[data-asset-card="true"]');
        const searchRect = search?.getBoundingClientRect();
        const cardRect = firstCard?.getBoundingClientRect();
        return {
          searchOffscreen: !!(searchRect && (searchRect.left < 0 || searchRect.right > window.innerWidth)),
          searchWidth: Math.round(searchRect?.width || 0),
          firstCardName: firstCard?.dataset.assetName || '',
          firstCardWidth: Math.round(cardRect?.width || 0),
        };
      });
      if (mobileGalleryState.searchOffscreen ||
          mobileGalleryState.searchWidth <= 0 ||
          !mobileGalleryState.firstCardName ||
          mobileGalleryState.firstCardWidth <= 0) {
        throw new Error(`${label} viewport asset gallery layout failed: ${JSON.stringify(mobileGalleryState)}`);
      }
      const beforeMobileAssetCount = await page.evaluate(() => window._engineBridge?.objects?.length || 0);
      await page.locator('[data-asset-card="true"]').first().click({ timeout: timeoutMs });
      await page.waitForFunction(
        (before) => (window._engineBridge?.objects?.length || 0) === before &&
          window._lastAssetPlacement?.status === 'preview' &&
          window._lastAssetPlacement?.awaitingConfirm === true &&
          !!document.querySelector('#asset-placement-preview-toolbar [data-placement-action="confirm"]'),
        beforeMobileAssetCount,
        { timeout: timeoutMs }
      );
      await page.locator('#asset-placement-preview-toolbar [data-placement-action="confirm"]').click({ timeout: timeoutMs });
      await page.waitForFunction(
        (before) => (window._engineBridge?.objects?.length || 0) > before && window._lastAssetPlacement?.status === 'placed',
        beforeMobileAssetCount,
        { timeout: timeoutMs }
      );
      mobileAssetMenu = {
        ...mobileAssetMenu,
        category: mobileCategoryState,
        gallery: mobileGalleryState,
        placement: await page.evaluate(() => ({
          status: window._lastAssetPlacement?.status || '',
          name: window._lastAssetPlacement?.name || '',
          source: window._lastAssetPlacement?.source || '',
          text: document.querySelector('#gb-placement-status')?.textContent || '',
        })),
      };
      await page.evaluate((state) => {
        window.__mobileAssetMenuSmoke = state;
      }, mobileAssetMenu);
    }
    await page.locator('#prompt-input').fill('build city', { timeout: timeoutMs });
    await page.locator('#prompt-input').press('Enter', { timeout: timeoutMs });
    await page.waitForFunction(
      () => (window._engineBridge?.objects?.length || window._sceneObjects?.length || 0) >= 100,
      undefined,
      { timeout: timeoutMs }
    );
    await page.evaluate(() => {
      if (Array.isArray(window._crateFrameProfile?.samples)) window._crateFrameProfile.samples.length = 0;
    });
    const state = await page.waitForFunction(
      () => {
        const profile = window._crateFrameProfile || {};
        const samples = Array.isArray(profile.samples) ? profile.samples : [];
        const renderer = window._renderer;
        const render = renderer?.info?.render || {};
        if (samples.length < 45 || !render.calls || !render.triangles) return null;
        return {
          samples: samples.length,
          fps: Number(profile.fps) || 0,
          avgFrameMs: Number(profile.avgFrameMs) || 0,
          worstFrameMs: Number(profile.worstFrameMs) || 0,
          avgUpdateMs: Number(profile.avgUpdateMs) || 0,
          avgRenderMs: Number(profile.avgRenderMs) || 0,
          calls: Number(render.calls) || 0,
          triangles: Number(render.triangles) || 0,
          objects: window._engineBridge?.objects?.length || window._sceneObjects?.length || 0,
          mode: window._currentMode || '',
          devicePixelRatio: Number(window.devicePixelRatio) || 0,
          rendererPixelRatio: Number(renderer?.getPixelRatio?.()) || 0,
          rendererBudget: window._crateRendererBudget || null,
          performanceBudget: window._cratePerformanceBudget || null,
          cullingStats: window._crateCullingStats || null,
          mobileControls: !!document.querySelector('#mobile-controls'),
          mobileAssetMenu: window.__mobileAssetMenuSmoke || null,
          canvasWidth: renderer?.domElement?.width || 0,
          canvasHeight: renderer?.domElement?.height || 0,
          canvasClientWidth: renderer?.domElement?.clientWidth || 0,
          canvasClientHeight: renderer?.domElement?.clientHeight || 0,
        };
      },
      undefined,
      { timeout: timeoutMs }
    ).then((handle) => handle.jsonValue());

    if (pageErrors.length) throw new Error(`${label} viewport page errors:\n${pageErrors.join('\n')}`);
    if (badAssetResponses.length) throw new Error(`${label} viewport bad model/texture responses:\n${badAssetResponses.join('\n')}`);
    if (badConsole.length) throw new Error(`${label} viewport console smoke failures:\n${badConsole.join('\n')}`);
    if (state.avgFrameMs <= 0 || state.avgFrameMs > (options.maxFrameMs || 40) || state.calls > (options.maxCalls || 900) || state.triangles > (options.maxTriangles || 750000) || state.objects < 100 || state.mode !== 'edit') {
      throw new Error(`${label} viewport Build City performance failed: ${JSON.stringify(state)}`);
    }
    if (options.hasTouch && !state.mobileControls) {
      throw new Error(`${label} viewport did not initialize mobile controls: ${JSON.stringify(state)}`);
    }
    if (!state.rendererBudget || state.rendererPixelRatio > (options.maxPixelRatio || 1.25)) {
      throw new Error(`${label} viewport renderer pixel budget was not enforced: ${JSON.stringify(state)}`);
    }
    if (!state.performanceBudget || !Number.isFinite(Number(state.performanceBudget.cullDistance)) || !Number.isFinite(Number(state.performanceBudget.shadowDistance))) {
      throw new Error(`${label} viewport performance budget was not exposed: ${JSON.stringify(state)}`);
    }

    return { label, ...state };
  } finally {
    await browser.close();
  }
}

const play = await checkPlayHtml();
const assetBaseUrl = play.assetBaseUrl;
const assetManifest = await checkAssetManifest(assetBaseUrl);
const httpChecks = [
  await checkHttp('/marketplace.html', 200, 'text/html', baseUrl),
  await checkHttp('/admin.html', 200, 'text/html', baseUrl),
  await checkHttp(`/game.html?slug=${encodeURIComponent(smokePublishedSlug)}`, 200, 'text/html', baseUrl),
  await checkHttp('/asset-manifest.json', 200, 'application/json', assetBaseUrl),
  await checkHttp('/models/kenney_cars/sedan.glb', 200, 'model/gltf-binary', assetBaseUrl),
  await checkHttp('/models/house_interior_pack_chair_1.glb', 200, 'model/gltf-binary', assetBaseUrl),
  await checkHttp('/models/fab/street_props_streeprops.glb', 200, 'model/gltf-binary', assetBaseUrl),
  await checkHttp('/models/modular_street_seating.bin', 200, 'application/octet-stream', assetBaseUrl),
  await checkHttp('/textures/modular_street_seating_armrests_diff_1k.jpg', 200, 'image/jpeg', assetBaseUrl),
  await checkHttp('/models/__definitely_missing__.glb', 404, '', assetBaseUrl),
];
const browserState = await runBrowserSmoke();
const viewportProbeStates = viewportProbeEnabled ? [
  await runViewportBuildCityProbe('phone', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    maxFrameMs: 40,
    maxPixelRatio: 1.25,
  }),
  await runViewportBuildCityProbe('tablet', {
    width: 820,
    height: 1180,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    maxFrameMs: 40,
    maxPixelRatio: 1,
  }),
] : [];

console.log('Production smoke passed.');
console.log(`URL: ${playUrl}`);
console.log(`Bundle: ${play.bundle}`);
console.log(`Asset base: ${assetBaseUrl}`);
console.log(`Asset manifest: ${assetManifest.manifest.version}`);
console.log(`Asset pack UI: ${browserState.assetPackStatus} ${browserState.assetPackVersion}`);
console.log(`Asset storage: ${browserState.userAssetStoragePanelStatus || 'missing'} ${browserState.userAssetStoragePrivateAssets || 0} private/${browserState.userAssetStoragePublishedAssets || 0} public, ${browserState.userAssetStorageQuotaPercent || 0}% of ${browserState.userAssetStorageQuotaBytes || 0} bytes`);
console.log(`Readiness: ${browserState.readinessSummary}`);
console.log(`Performance: ${browserState.performanceStatus || 'missing'} (${browserState.performanceFps || 0} FPS, ${browserState.performanceFrameMs || 0} ms, ${browserState.performanceCalls || 0} calls, ${browserState.performanceTriangles || 0} tris)`);
console.log(`Runtime budget: ${browserState.performanceBudget?.level || 'missing'} (cull ${browserState.performanceBudget?.cullDistance || 0}, edit cull ${browserState.performanceBudget?.editCullDistance || 0}, shadow ${browserState.performanceBudget?.shadowDistance || 0}, pass ${browserState.performanceBudget?.maxLodObjectsPerPass || 0})`);
console.log(`LOD pass: ${browserState.cullingProcessed || 0} processed, ${browserState.cullingFar || 0} far, ${browserState.cullingSkipped || 0} skipped, max ${browserState.cullingMaxPerPass || 0}`);
console.log(`Runtime pools: damage ${browserState.objectPoolStats?.damageNumberPool || 0}/${browserState.poolDamageCreated || 0}, impact ${browserState.objectPoolStats?.impactPool || 0}/${browserState.poolImpactCreated || 0}, flash ${browserState.objectPoolStats?.muzzleFlashPool || 0}/${browserState.poolMuzzleCreated || 0}`);
console.log(`Raw Build City frame probe: ${browserState.rawBuildCityFps || 0} FPS, ${browserState.rawBuildCityFrameMs || 0} ms avg, ${browserState.rawBuildCityUpdateMs || 0} ms update, ${browserState.rawBuildCityRenderMs || 0} ms render, ${browserState.rawBuildCityCalls || 0} calls, ${browserState.rawBuildCityTriangles || 0} tris, ${browserState.rawBuildCitySamples || 0} samples`);
for (const probeState of viewportProbeStates) {
  console.log(`Viewport ${probeState.label}: ${probeState.fps || 0} FPS, ${probeState.avgFrameMs || 0} ms avg, ${probeState.calls || 0} calls, ${probeState.triangles || 0} tris, DPR ${probeState.devicePixelRatio || 0}->${probeState.rendererPixelRatio || 0}, cull ${probeState.performanceBudget?.cullDistance || 0}, shadow ${probeState.performanceBudget?.shadowDistance || 0}, canvas ${probeState.canvasWidth || 0}x${probeState.canvasHeight || 0}, mobile controls ${probeState.mobileControls ? 'ready' : 'missing'}`);
  if (probeState.mobileAssetMenu) {
    console.log(`Viewport ${probeState.label} asset menu: ${probeState.mobileAssetMenu.placement?.status || 'missing'} ${probeState.mobileAssetMenu.placement?.name || 'missing'}, gallery search ${probeState.mobileAssetMenu.gallery?.searchOffscreen ? 'offscreen' : 'onscreen'}, quick button top ${probeState.mobileAssetMenu.assetButtonTop || 0}`);
  }
}
console.log(`City performance profile: ${browserState.cityPerformanceProfile || 'missing'} (procedural props ${browserState.cityPerformanceProceduralProps ? 'on' : 'off'}, vehicles ${browserState.cityPerformanceProceduralVehicles ? 'on' : 'off'}, nature ${browserState.cityPerformanceProceduralNature ? 'on' : 'off'}, renderer ${browserState.rendererCalls || 0} calls/${browserState.rendererTriangles || 0} tris)`);
console.log(`Validation: ${browserState.validationStatus || 'missing'} (${browserState.validationErrors || 0} errors, ${browserState.validationWarnings || 0} warnings, ${browserState.validationSuggestions || 0} suggestions)`);
console.log(`Validation fixes: ${(browserState.validationFixActions || []).join(', ') || 'none'} (${browserState.validationFixColliderCount || 0} colliders, undo restored ${browserState.validationFixUndoRestoredObjects || 0})`);
console.log(`Game systems: ${browserState.systemSummary}`);
console.log(`Objects: ${browserState.objectCount}`);
console.log(`Scene rows: ${browserState.sceneRows}`);
console.log(`Stats: ${browserState.stats}`);
console.log(`Mode: ${browserState.mode}`);
console.log(`Inspector health: ${browserState.inspectorHealthStatus || 'missing'} (${browserState.inspectorHealthComponents || 0} components, ${browserState.inspectorMetricCount || 0} metrics)`);
console.log(`Hidden unavailable assets: ${browserState.hiddenUnavailableAssets} (normalized ${browserState.assetCatalogNormalized || 0}, deduped ${browserState.assetCatalogDeduped || 0})`);
console.log(`Placement: ${browserState.placementStatus} (${browserState.placementSource})`);
console.log(`Real gallery placement: ${browserState.realGallerySelectedName || 'missing'} (${browserState.realGallerySelectedFile || 'missing'}), preview ${browserState.realGalleryPreviewStatus || 'missing'}, final ${browserState.realGalleryPlacementStatus || 'missing'}, categories ${browserState.realGalleryCategoryCount || 0}`);
console.log(`Gallery sweep: ${(browserState.gallerySweepCategories || []).join(', ') || 'missing'}, bad responses ${browserState.gallerySweepBadResponses || 0}`);
console.log(`Category placements: ${(browserState.categoryPlacements || []).join(', ') || 'missing'}, bad responses ${browserState.categoryPlacementBadResponses || 0}`);
console.log(`Scripts: ${browserState.scriptCount}`);
console.log(`Project saves: ${browserState.projectSaveCount}`);
console.log(`Project snapshot: v${browserState.savedProjectVersion} ${browserState.savedProjectObjectCount} objects ${browserState.savedProjectScriptCount} scripts ${browserState.savedProjectCommandCount} commands, ${browserState.savedProjectValidationFixHistoryCount || 0} validation fixes`);
console.log(`Project load: ${browserState.loadedProjectObjectCount} objects ${browserState.loadedProjectScriptCount} scripts (${browserState.loadedProjectApplied} applied, ${browserState.loadedProjectSpawned} spawned, pickup ${browserState.loadedProjectPickupId || 'missing'}, equipment ${browserState.loadedProjectEquipmentId || 'missing'}, npc ${browserState.loadedProjectNpcId || 'missing'}, merchant ${browserState.loadedProjectMerchantId || 'missing'}, door ${browserState.loadedProjectDoorId || 'missing'}, trigger ${browserState.loadedProjectTriggerId || 'missing'}, mission ${browserState.loadedProjectMissionId || 'missing'}, reward ${browserState.loadedProjectRewardId || 'missing'}, gate ${browserState.loadedProjectGateId || 'missing'}, enemy spawn ${browserState.loadedProjectEnemySpawnId || 'missing'}, wave ${browserState.loadedProjectWaveId || 'missing'})`);
console.log(`Playable export: ${browserState.playableExportFilename || 'missing'} (${browserState.playableExportObjectCount} objects, ${browserState.playableExportComponentCount} components, ${browserState.playableExportHtmlBytes} html bytes)`);
console.log(`Published game: ${browserState.publishedSlug || 'missing'} (${browserState.publishedObjects} objects, ${browserState.publishedComponents} components, package ${browserState.publishedPlayableHtmlBytes} html bytes)`);
console.log(`Published API: ${browserState.publishedCloudSource || 'missing'} ${browserState.publishedApiStatus} (${browserState.publishedLoadStatus || 'missing'}, ${browserState.publishedLoadObjectCount} objects loaded)`);
console.log(`Published cloud assets: ${browserState.publishedPublicCloudAssetCount || 0} public, download ${browserState.publishedPublicCloudAssetDownloadStatus || 0}, private no-auth ${browserState.publishedPrivateCloudAssetNoAuthStatus || 0}`);
console.log(`Published cleanup: game delete ${browserState.publishedCleanupDeleteStatus || 0}, public asset ${browserState.publishedCleanupPublicStatus || 0}/${browserState.publishedCleanupPublicDownloadStatus || 0}, removed ${browserState.publishedCleanupDeleted || 0}/${browserState.publishedCleanupAttempted || 0}`);
console.log(`Published library UI: ${browserState.publishedLibraryCloudCount} cloud rows, ${browserState.publishedLibraryLocalCount} local rows, ${browserState.publishedLibraryLoadButtons} edit buttons`);
console.log(`Published editor load: ${browserState.publishedEditorLoadStatus || 'missing'} ${browserState.publishedEditorLoadSlug || 'missing'} (${browserState.publishedEditorLoadObjectCount} objects, filter ${browserState.publishedFilterQuery || 'empty'})`);
console.log(`Published management: detail ${browserState.publishedDetailPanelStatus || 'missing'}, owner ${browserState.publishedDetailOwnerManaged ? 'managed' : 'missing'}, delete guard ${browserState.publishedDeleteGuardBlockedStatus}/${browserState.publishedDeleteGuardDeletedStatus}/${browserState.publishedDeleteGuardMissingStatus}`);
console.log(`Published metadata: creator ${browserState.publishedDetailCreatorName || 'missing'}, visibility ${browserState.publishedDetailVisibility || 'missing'}, unlisted guard ${browserState.publishedMetadataGuardUpdateStatus}/${browserState.publishedMetadataGuardVisibility || 'missing'}, featured guard ${browserState.publishedMetadataGuardFeaturedUpdateStatus || 'missing'}, featured toggle ${browserState.publishedDetailHasFeaturedToggle ? 'ready' : 'missing'}`);
console.log(`Marketplace games: ${browserState.marketplaceShown}/${browserState.marketplaceTotal} shown for ${browserState.marketplaceQuery || 'empty'} tag ${browserState.marketplaceTag || 'all'} sort ${browserState.marketplaceSort || 'updated'}, smoke ${browserState.marketplaceHasSmoke ? 'visible' : 'missing'}`);
console.log(`Marketplace discovery: ${browserState.marketplaceDiscoveryStatus || 'missing'} ${browserState.marketplaceDiscoveryRailCards || 0} cards from ${browserState.marketplaceDiscoveryTotal || 0} games, admin featured ${(browserState.marketplaceDiscoveryAdminFeaturedSlugs || []).length}`);
console.log(`Game detail: ${browserState.gameDetailSlug || 'missing'} by ${browserState.gameDetailCreatorName || 'missing'} (${browserState.gameDetailObjects} objects, ${browserState.gameDetailComponents} components, featured ${browserState.gameDetailFeatured ? 'yes' : 'no'})`);
console.log(`Admin moderation: API guard ${browserState.adminApiGuardStatus || 'missing'}, audit guard ${browserState.adminAuditApiGuardStatus || 'missing'}, verify guard ${browserState.adminAuditVerifyGuardStatus || 'missing'}, backfill guard ${browserState.adminAuditBackfillGuardStatus || 'missing'}, asset cleanup guard ${browserState.adminAssetCleanupGuardStatus || 'missing'}, dashboard ${browserState.adminDashboardStatus || 'missing'}, controls ${browserState.adminDashboardHasControls ? 'ready' : 'missing'}, actor ${browserState.adminDashboardHasAdminActor ? 'ready' : 'missing'}, audit panel ${browserState.adminDashboardHasAuditDetail ? 'ready' : 'missing'}, storage panel ${browserState.adminDashboardHasAuditStorage && browserState.adminDashboardHasAuditStorageVerify ? browserState.adminDashboardAuditStorageStatus || 'ready' : 'missing'}, backfill controls ${browserState.adminDashboardHasAuditBackfillDryRun && browserState.adminDashboardHasAuditBackfillRun ? browserState.adminDashboardAuditBackfillStatus || 'ready' : 'missing'}, asset cleanup controls ${browserState.adminDashboardHasAssetCleanupDryRun && browserState.adminDashboardHasAssetCleanupRun ? browserState.adminDashboardAssetCleanupStatus || 'ready' : 'missing'}, cleanup worker ${browserState.adminDashboardHasCleanupWorker ? browserState.adminDashboardCleanupWorkerStatus || 'ready' : 'missing'} delete ${browserState.adminDashboardCleanupWorkerDeleteEnabled ? 'enabled' : 'disabled'} limit ${browserState.adminDashboardCleanupWorkerLimit || 0} history ${browserState.adminDashboardCleanupWorkerHistorySource || 'missing'} d1 ${browserState.adminDashboardCleanupWorkerD1HistoryAvailable ? 'ready' : 'missing'}, cleanup audit ${browserState.adminDashboardHasCleanupAudit && browserState.adminDashboardHasCleanupAuditCsvExport && browserState.adminDashboardHasCleanupAuditPaging && browserState.adminDashboardHasCleanupAuditDateFilters ? browserState.adminDashboardCleanupAuditStatus || 'ready' : 'missing'} rows ${browserState.adminDashboardCleanupAuditRows || 0}, review notes ${browserState.adminDashboardHasReviewNoteInput && browserState.adminDashboardReviewNoteRequired ? 'ready' : 'missing'}${browserState.adminSmokeTokenProvided ? `, d1 verify ${browserState.adminAuditD1VerifyStatus || 'missing'} ${browserState.adminAuditD1WriteVerified ? 'verified' : 'missing'}, asset dry run ${browserState.adminAssetCleanupDryRunStatus || 'missing'} ${browserState.adminAssetCleanupDryRunOk ? 'ready' : 'missing'}, ui storage ${browserState.adminDashboardStorageProbeStatus || 'missing'} ${browserState.adminDashboardStorageProbeWriteVerified ? 'verified' : 'missing'}, ui backfill ${browserState.adminDashboardBackfillProbeStatus || 'missing'} ${browserState.adminDashboardBackfillProbeDryRun ? 'dry-run' : 'missing'} wrote ${browserState.adminDashboardBackfillProbeWritten || 0}, ui asset cleanup ${browserState.adminDashboardAssetCleanupProbeStatus || 'missing'} ${browserState.adminDashboardAssetCleanupProbeDryRun ? 'dry-run' : 'missing'} deleted ${browserState.adminDashboardAssetCleanupProbeDeleted || 0}, cleanup audit ${browserState.adminDashboardCleanupAuditProbeStatus || 'missing'} ${browserState.adminDashboardCleanupAuditProbeRows || 0} rows latest ${browserState.adminDashboardCleanupAuditProbeLatestReason || 'missing'}, cleanup audit csv ${browserState.adminDashboardCleanupAuditCsvExportStatus || 'missing'} ${browserState.adminDashboardCleanupAuditCsvExportedCount || 0} rows, authed ${browserState.adminDashboardAuthedStatus || 'missing'} ${browserState.adminDashboardAuthedAdminName || 'missing'} audit ${browserState.adminDashboardLoadedAuditStatus || 'missing'} ${browserState.adminDashboardAuthedSmokeListed ? 'smoke listed' : 'smoke missing'}` : ''}`);
console.log(`Cleanup worker last run: ${browserState.adminDashboardCleanupWorkerLastRunKnown ? (browserState.adminDashboardCleanupWorkerHasLastRun ? `${browserState.adminDashboardCleanupWorkerLastRunReason || 'unknown'} scanned ${browserState.adminDashboardCleanupWorkerLastRunScanned || 0}, orphaned ${browserState.adminDashboardCleanupWorkerLastRunOrphaned || 0}, deleted ${browserState.adminDashboardCleanupWorkerLastRunDeleted || 0}, errors ${browserState.adminDashboardCleanupWorkerLastRunErrorCount || 0}` : 'none persisted yet') : 'missing health field'}`);
console.log(`Cleanup worker history: ${browserState.adminDashboardCleanupWorkerHistoryKnown ? `${browserState.adminDashboardCleanupWorkerHistoryCount || 0}/${browserState.adminDashboardCleanupWorkerHistoryLimit || 0} runs, latest ${browserState.adminDashboardCleanupWorkerLatestHistoryReason || 'none'}` : 'missing health field'}`);
if (browserState.adminSmokeTokenProvided) {
  console.log(`Cleanup worker dry scan: ${browserState.adminDashboardCleanupWorkerDryRunPersisted ? 'persisted' : 'missing'} ${browserState.adminDashboardCleanupWorkerDryRunReason || 'missing'} scanned ${browserState.adminDashboardCleanupWorkerDryRunScanned || 0}, orphaned ${browserState.adminDashboardCleanupWorkerDryRunOrphaned || 0}, deleted ${browserState.adminDashboardCleanupWorkerDryRunDeleted || 0}, errors ${browserState.adminDashboardCleanupWorkerDryRunErrors || 0}, history ${browserState.adminDashboardCleanupWorkerDryRunHistoryPersisted ? 'persisted' : 'missing'} (${browserState.adminDashboardCleanupWorkerDryRunHistoryCount || 0}), d1 ${browserState.adminDashboardCleanupWorkerDryRunD1Persisted ? 'persisted' : 'missing'} source ${browserState.adminDashboardCleanupWorkerDryRunHistorySource || 'missing'}`);
  console.log(`Cleanup worker export: ${browserState.adminDashboardCleanupWorkerExportStatus || 'missing'} ${browserState.adminDashboardCleanupWorkerExportedCount || 0} runs -> ${browserState.adminDashboardCleanupWorkerExportedFileName || 'missing'}`);
  console.log(`Cleanup worker CSV export: ${browserState.adminDashboardCleanupWorkerCsvExportStatus || 'missing'} ${browserState.adminDashboardCleanupWorkerCsvExportedCount || 0} rows -> ${browserState.adminDashboardCleanupWorkerCsvExportedFileName || 'missing'}`);
}
console.log(`Door trigger runtime: ${browserState.firedTrigger || 'missing'} opened ${browserState.openedDoor || 'missing'} (${browserState.doorProgress})`);
console.log(`Mission runtime: ${browserState.missionStep || 'missing'} -> ${browserState.missionReward || 'missing'} -> ${browserState.missionGate || 'missing'} (${browserState.missionRewardScore} score)`);
console.log(`NPC runtime: ${browserState.npcName || 'missing'} said "${browserState.npcDialogue || 'missing'}" and granted ${browserState.npcReward || 'missing'}`);
console.log(`Merchant runtime: ${browserState.merchantName || 'missing'} sold ${browserState.merchantItem || 'missing'} for ${browserState.merchantPrice} score (${browserState.merchantArmorPower} armor power)`);
console.log(`Enemy wave runtime: ${browserState.waveName || 'missing'} from ${browserState.waveSpawn || 'missing'} (${browserState.waveEnemyCount} spawned, ${browserState.waveAlive} alive)`);
console.log(`Inventory runtime: ${browserState.lootDrop || 'missing'} equipped ${browserState.lootWeapon || 'missing'} (${browserState.lootWeaponPower} power, ${browserState.lootAttack} attack, ${browserState.lootInventoryCount} items)`);
console.log(`Respawn runtime: ${browserState.respawnCount} respawns, ${browserState.respawnHealth} HP`);
console.log(`Selected components: ${browserState.selectedComponents.join(', ')}`);
console.log(`Gameplay components: ${browserState.gameplayComponents.join(', ')}`);
console.log(`Screenshot: ${screenshotPath}`);
console.log('HTTP checks:');
for (const check of httpChecks) {
  console.log(`- ${check.status} ${check.url} ${check.contentType}`);
}
