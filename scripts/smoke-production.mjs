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

    await page.locator('button.gb-preset', { hasText: 'Inventory' }).click({ timeout: timeoutMs });
    await page.waitForFunction(() => Array.isArray(window._userScripts) && window._userScripts.length >= 1, undefined, { timeout: timeoutMs });

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
        scriptCount: Array.isArray(window._userScripts) ? window._userScripts.length : 0,
        selectedComponents: Object.keys(selected?.userData?.gbComponents || {}),
      };
    });

    if (pageErrors.length) throw new Error(`Page errors:\n${pageErrors.join('\n')}`);
    if (badAssetResponses.length) throw new Error(`Bad model/texture responses:\n${badAssetResponses.join('\n')}`);
    if (badConsole.length) throw new Error(`Console smoke failures:\n${badConsole.join('\n')}`);
    if (!state.hasAssetResolver) throw new Error('window._crateAssetUrl was not available');
    if (forcedAssetBaseUrl && state.assetBaseUrl !== forcedAssetBaseUrl) {
      throw new Error(`Expected browser asset base ${forcedAssetBaseUrl}, got ${state.assetBaseUrl || 'empty'}`);
    }
    if (!state.hasInspector || !state.hasBlueprints) throw new Error('Game Builder Inspector or Blueprints section was missing');
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
const httpChecks = [
  await checkHttp('/models/kenney_cars/sedan.glb', 200, 'model/gltf-binary', assetBaseUrl),
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
console.log(`Objects: ${browserState.objectCount}`);
console.log(`Scene rows: ${browserState.sceneRows}`);
console.log(`Stats: ${browserState.stats}`);
console.log(`Scripts: ${browserState.scriptCount}`);
console.log(`Selected components: ${browserState.selectedComponents.join(', ')}`);
console.log(`Screenshot: ${screenshotPath}`);
console.log('HTTP checks:');
for (const check of httpChecks) {
  console.log(`- ${check.status} ${check.url} ${check.contentType}`);
}
