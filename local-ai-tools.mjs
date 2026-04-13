const TRANSFORMERS_VERSION = '3.7.2';
let extractorPromise = null;

async function ensureExtractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const url = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TRANSFORMERS_VERSION}/+esm`;
      const { env, pipeline } = await import(/* @vite-ignore */ url);
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      return pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        device: globalThis.navigator?.gpu ? 'webgpu' : 'wasm'
      });
    })();
  }
  return extractorPromise;
}

function normalizeCatalogEntries(catalog) {
  if (Array.isArray(catalog)) return catalog;
  return Object.entries(catalog || {}).map(([label, value]) => ({
    label,
    file: typeof value === 'string' ? value : value?.file || label,
    text: `${label} ${typeof value === 'string' ? value : JSON.stringify(value)}`
  }));
}

function keywordPrefilter(query, entries, limit = 48) {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return entries
    .map((entry) => {
      const hay = `${entry.label || ''} ${entry.file || ''} ${entry.text || ''}`.toLowerCase();
      const score = tokens.reduce((acc, token) => acc + (hay.includes(token) ? 1 : 0), 0);
      return { ...entry, _keywordScore: score };
    })
    .sort((a, b) => b._keywordScore - a._keywordScore)
    .slice(0, limit);
}

function dot(a, b) {
  let total = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) total += a[i] * b[i];
  return total;
}

async function embed(extractor, text) {
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

export async function semanticSearchAssets(query, catalog, limit = 8) {
  const entries = keywordPrefilter(query, normalizeCatalogEntries(catalog));
  const extractor = await ensureExtractor();
  const queryEmbedding = await embed(extractor, query);
  const scored = [];
  for (const entry of entries) {
    const embedding = await embed(extractor, entry.text || entry.label || entry.file || '');
    scored.push({
      ...entry,
      score: dot(queryEmbedding, embedding)
    });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
