// ═══════════════════════════════════════════════════════════════
// CRATE ENGINE — MODEL REGISTRY
// Alias map is stored as static JSON to keep the JS bundle lean.
// ═══════════════════════════════════════════════════════════════

import { resolveAssetFetchUrl } from './asset-url.mjs';

const MODEL_ALIAS_URL = '/model-aliases.json';
const MODEL_CATALOG_URLS = [
  '/models/catalog.json',
  '/model-catalog.json',
];

let modelCatalog = null;
let modelCatalogPromise = null;
let modelAliasesPromise = null;

const MODEL_SCALE_OVERRIDES = {
  hd_ferrari: 2.5,
  'kenney_cars/sedan': 2.8,
  'kenney_cars/sedan-sports': 2.8,
  'kenney_cars/suv': 2.8,
  'kenney_cars/suv-luxury': 2.8,
  'kenney_cars/taxi': 2.8,
  'kenney_cars/police': 2.8,
  'kenney_cars/hatchback-sports': 2.8,
  'kenney_cars/van': 2.8,
  'kenney_cars/truck': 2.8,
  'kenney_cars/ambulance': 2.8,
  'kenney_cars/delivery': 2.8,
  'kenney_cars/firetruck': 2.8,
  'kenney_cars/garbage-truck': 2.8,
  'kenney_cars/race': 2.8,
  'kenney_cars/race-future': 2.8,
  helicopter: 2.0,
  milk_truck: 2.0,
};

const GLB_MODELS = {};

async function fetchJson(url) {
  const response = await fetch(resolveAssetFetchUrl(url));
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return response.json();
}

function normalizeModelCatalog(data) {
  if (Array.isArray(data)) {
    const normalized = {};
    for (const entry of data) {
      const key = entry?.file || entry?.name;
      if (!key) continue;
      normalized[key] = {
        name: entry.name || key,
        path: entry.path || entry.file || key,
        tags: Array.isArray(entry.tags) ? entry.tags : Array.isArray(entry.cats) ? entry.cats : [],
      };
    }
    return normalized;
  }

  if (data && typeof data === 'object') {
    return data;
  }

  return {};
}

export async function loadModelAliases() {
  if (Object.keys(GLB_MODELS).length) return GLB_MODELS;
  if (!modelAliasesPromise) {
    modelAliasesPromise = fetchJson(MODEL_ALIAS_URL).then((aliases) => {
      Object.assign(GLB_MODELS, aliases || {});
      return GLB_MODELS;
    }).catch((err) => {
      modelAliasesPromise = null;
      console.warn('[ModelRegistry] Alias load failed:', err.message);
      return GLB_MODELS;
    });
  }
  return modelAliasesPromise;
}

export async function loadModelCatalog() {
  if (modelCatalog) return modelCatalog;
  if (!modelCatalogPromise) {
    modelCatalogPromise = (async () => {
      for (const url of MODEL_CATALOG_URLS) {
        try {
          const data = normalizeModelCatalog(await fetchJson(url));
          if (Object.keys(data).length) {
            modelCatalog = data;
            console.log('[Catalog] Loaded', Object.keys(modelCatalog).length, 'models from', url);
            return modelCatalog;
          }
        } catch {}
      }
      modelCatalog = {};
      return modelCatalog;
    })().catch((err) => {
      modelCatalogPromise = null;
      throw err;
    });
  }
  return modelCatalogPromise;
}

export function searchModels(query, limit = 10) {
  if (!modelCatalog) return [];

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = [];

  for (const [name, info] of Object.entries(modelCatalog)) {
    let score = 0;
    const nameLower = name.toLowerCase();
    const tags = Array.isArray(info?.tags) ? info.tags : Array.isArray(info?.cats) ? info.cats : [];
    const allTags = tags.join(' ').toLowerCase();

    for (const term of terms) {
      if (nameLower.includes(term)) score += 3;
      if (allTags.includes(term)) score += 1;
      if (nameLower === term) score += 5;
    }

    if (score > 0) {
      results.push({
        name,
        path: info?.path || name,
        score,
        tags,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export { GLB_MODELS, MODEL_SCALE_OVERRIDES };
