const ASSET_PATH_PATTERN = /^(?:\.\/)?\/?(models|textures)(?:\/|$)/i;
const ASSET_META_NAMES = ['crate-asset-base', 'crateship-asset-base'];
const ASSET_STORAGE_KEYS = ['crate_asset_base_url', 'crateship_asset_base_url'];

function getWindow() {
  return typeof window !== 'undefined' ? window : null;
}

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

function getConfiguredBaseUrl() {
  const win = getWindow();
  if (!win) return '';

  if (typeof win.CRATESHIP_ASSET_BASE_URL === 'string') {
    const base = normalizeBaseUrl(win.CRATESHIP_ASSET_BASE_URL);
    if (base) return base;
  }

  for (const name of ASSET_META_NAMES) {
    const meta = win.document?.querySelector?.(`meta[name="${name}"]`);
    const base = normalizeBaseUrl(meta?.getAttribute('content'));
    if (base) return base;
  }

  try {
    for (const key of ASSET_STORAGE_KEYS) {
      const base = normalizeBaseUrl(win.localStorage?.getItem(key));
      if (base) return base;
    }
  } catch {}

  return '';
}

function isAssetPath(pathname) {
  return ASSET_PATH_PATTERN.test(pathname);
}

function extractRelativeAssetPath(value) {
  if (typeof value !== 'string') return null;
  if (/^(?:data|blob|javascript):/i.test(value)) return null;

  const win = getWindow();
  const baseHref = win?.location?.href || 'https://crateship.local/';

  try {
    const parsed = new URL(value, baseHref);
    const currentOrigin = win?.location?.origin;
    const configuredBase = getConfiguredBaseUrl();
    const configuredOrigin = configuredBase ? new URL(configuredBase, baseHref).origin : '';
    const isSamePageOrigin = !currentOrigin || parsed.origin === currentOrigin;
    const isConfiguredOrigin = configuredOrigin && parsed.origin === configuredOrigin;

    if (!isSamePageOrigin && !isConfiguredOrigin && /^[a-z][a-z0-9+.-]*:/i.test(value)) {
      return null;
    }

    if (!isAssetPath(parsed.pathname)) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    const normalized = value.replace(/^\.?\//, '');
    return isAssetPath(normalized) ? `/${normalized}` : null;
  }
}

export function getAssetBaseUrl() {
  return getConfiguredBaseUrl();
}

export function setAssetBaseUrl(baseUrl) {
  const win = getWindow();
  if (!win) return '';
  const normalized = normalizeBaseUrl(baseUrl);
  win.CRATESHIP_ASSET_BASE_URL = normalized;
  return normalized;
}

export function resolveAssetUrl(url) {
  const baseUrl = getConfiguredBaseUrl();
  if (!baseUrl || typeof url !== 'string') return url;

  const assetPath = extractRelativeAssetPath(url);
  if (!assetPath) return url;

  try {
    return new URL(assetPath, `${baseUrl}/`).toString();
  } catch {
    return `${baseUrl}${assetPath}`;
  }
}

export const resolveAssetFetchUrl = resolveAssetUrl;

export function installAssetPipeline(GLTFLoaderClass) {
  const win = getWindow();
  if (win) {
    win._crateAssetBaseUrl = getAssetBaseUrl;
    win._crateAssetUrl = resolveAssetUrl;
    win._crateSetAssetBaseUrl = setAssetBaseUrl;
  }

  if (!GLTFLoaderClass?.prototype || GLTFLoaderClass.prototype.__crateAssetPipelineInstalled) {
    return;
  }

  const originalLoad = GLTFLoaderClass.prototype.load;
  GLTFLoaderClass.prototype.load = function loadWithAssetBase(url, ...args) {
    return originalLoad.call(this, resolveAssetUrl(url), ...args);
  };

  if (typeof GLTFLoaderClass.prototype.loadAsync === 'function') {
    const originalLoadAsync = GLTFLoaderClass.prototype.loadAsync;
    GLTFLoaderClass.prototype.loadAsync = function loadAsyncWithAssetBase(url, ...args) {
      return originalLoadAsync.call(this, resolveAssetUrl(url), ...args);
    };
  }

  Object.defineProperty(GLTFLoaderClass.prototype, '__crateAssetPipelineInstalled', {
    value: true,
    enumerable: false,
  });
}

export function installAssetFetchPipeline() {
  const win = getWindow();
  if (!win || typeof win.fetch !== 'function' || win.fetch.__crateAssetPipelineInstalled) {
    return;
  }

  const originalFetch = win.fetch.bind(win);
  const fetchWithAssetBase = (input, init) => {
    if (typeof input === 'string') {
      return originalFetch(resolveAssetFetchUrl(input), init);
    }

    if (input instanceof URL) {
      const resolved = resolveAssetFetchUrl(input.toString());
      return originalFetch(resolved === input.toString() ? input : resolved, init);
    }

    if (typeof Request !== 'undefined' && input instanceof Request) {
      const resolved = resolveAssetFetchUrl(input.url);
      return originalFetch(resolved === input.url ? input : new Request(resolved, input), init);
    }

    return originalFetch(input, init);
  };

  Object.defineProperty(fetchWithAssetBase, '__crateAssetPipelineInstalled', {
    value: true,
    enumerable: false,
  });
  win.fetch = fetchWithAssetBase;
}
