/* Built-in terrain: a plane with a `terrain` component becomes a height field.
   Heights come from seeded fractal noise plus explicit features (hills, valleys, flattened pads, plateaus) and are
   fully deterministic, so the editor, exported games and physics all build the same ground from the same JSON. */
import { SURFACE_NAMES } from './material.mjs';

export const TERRAIN_FEATURE_KINDS = Object.freeze(['hill', 'valley', 'flatten', 'plateau']);
export const TERRAIN_LIMITS = Object.freeze({ features: 64, minResolution: 16, maxResolution: 256 });
export const TERRAIN_DEFAULTS = Object.freeze({
 resolution: 128, height: 6, seed: 1, roughness: .5, noiseScale: 40,
 low: 'sand', mid: 'grass', high: 'rock', steep: 'rock', lowLevel: .6, highLevel: 5, features: []
});

const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const int = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const surface = value => SURFACE_NAMES.includes(value);

export function validTerrainFeature(value) {
 return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => ['kind', 'x', 'z', 'radius', 'height'].includes(key)) &&
  TERRAIN_FEATURE_KINDS.includes(value.kind) && finite(value.x, -100000, 100000) && finite(value.z, -100000, 100000) && finite(value.radius, .5, 5000) && finite(value.height ?? 0, -500, 500);
}

export const TERRAIN_VALIDATORS = Object.freeze({
 resolution: value => int(value, TERRAIN_LIMITS.minResolution, TERRAIN_LIMITS.maxResolution),
 height: value => finite(value, 0, 500), seed: value => int(value, 0, 4294967295), roughness: value => finite(value, 0, 1), noiseScale: value => finite(value, 2, 5000),
 low: surface, mid: surface, high: surface, steep: surface, lowLevel: value => finite(value, -500, 500), highLevel: value => finite(value, -500, 500),
 features: value => Array.isArray(value) && value.length <= TERRAIN_LIMITS.features && value.every(validTerrainFeature)
});

export function validTerrain(value) {
 return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(([key, field]) => Object.hasOwn(TERRAIN_VALIDATORS, key) && TERRAIN_VALIDATORS[key](field));
}

export function cleanTerrain(value = {}) {
 const out = {};
 for (const [key, fallback] of Object.entries(TERRAIN_DEFAULTS)) out[key] = value && Object.hasOwn(value, key) && TERRAIN_VALIDATORS[key](value[key]) ? structuredClone(value[key]) : structuredClone(fallback);
 out.features = out.features.map(feature => ({ kind: feature.kind, x: feature.x, z: feature.z, radius: feature.radius, height: feature.height ?? 0 }));
 return out;
}

const number = (minimum, maximum, description) => ({ type: 'number', minimum, maximum, ...(description ? { description } : {}) });
export const TERRAIN_SCHEMA = Object.freeze({
 type: 'object', additionalProperties: false,
 description: 'Turns a plane into natural ground (its X/Z scale is the size in metres). Rolling noise hills plus features you place; textures blend by height and slope; players and props collide with it.',
 properties: {
  resolution: { type: 'integer', minimum: 16, maximum: 256, description: 'Grid cells per side (128 is plenty up to ~200 m).' },
  height: number(0, 500, 'Height of the natural rolling hills in metres (0 = flat base for features only).'),
  seed: { type: 'integer', minimum: 0, maximum: 4294967295 },
  roughness: number(0, 1, 'Small bumps vs smooth rolling hills.'),
  noiseScale: number(2, 5000, 'Metres between hill tops.'),
  low: { enum: SURFACE_NAMES, description: 'Texture below lowLevel (beach, riverbank).' }, mid: { enum: SURFACE_NAMES }, high: { enum: SURFACE_NAMES, description: 'Texture above highLevel (peaks).' },
  steep: { enum: SURFACE_NAMES, description: 'Texture on cliffs and steep slopes.' },
  lowLevel: number(-500, 500, 'Height (m, relative to the plane) where low turns into mid.'), highLevel: number(-500, 500),
  features: { type: 'array', minItems: 0, maxItems: 64, description: 'hill/valley add or dig a smooth bump; flatten levels ground to height (building pads, paths); plateau raises a flat-topped mesa. x/z are metres from the plane centre.', items: { type: 'object', additionalProperties: false, required: ['kind', 'x', 'z', 'radius'], properties: { kind: { enum: TERRAIN_FEATURE_KINDS }, x: number(-100000, 100000), z: number(-100000, 100000), radius: number(.5, 5000), height: number(-500, 500) } } }
 }
});

/* Seeded value noise (hash of integer lattice), smoothed and summed in octaves. */
function hash(x, z, seed) {
 let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
 h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
 return (h >>> 0) / 4294967295;
}
const smooth = t => t * t * (3 - 2 * t);
function valueNoise(x, z, seed) {
 const x0 = Math.floor(x), z0 = Math.floor(z), fx = smooth(x - x0), fz = smooth(z - z0);
 const a = hash(x0, z0, seed), b = hash(x0 + 1, z0, seed), c = hash(x0, z0 + 1, seed), d = hash(x0 + 1, z0 + 1, seed);
 return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}
function fbm(x, z, seed, roughness) {
 let sum = 0, amp = 1, norm = 0, freq = 1; const gain = .3 + roughness * .4;
 for (let octave = 0; octave < 5; octave++) { sum += amp * valueNoise(x * freq, z * freq, seed + octave * 101); norm += amp; amp *= gain; freq *= 2; }
 return sum / norm; // 0..1
}
const falloff = (distance, radius) => { const t = Math.min(1, distance / radius); return 1 - smooth(t); };

/** Ground height in metres at local (x, z) metres from the terrain centre. */
export function terrainHeight(terrain, x, z) {
 let y = terrain.height ? (fbm(x / terrain.noiseScale, z / terrain.noiseScale, terrain.seed, terrain.roughness) - .35) * terrain.height : 0;
 for (const feature of terrain.features) {
  const w = falloff(Math.hypot(x - feature.x, z - feature.z), feature.radius);
  if (!w) continue;
  if (feature.kind === 'hill') y += feature.height * w;
  else if (feature.kind === 'valley') y -= Math.abs(feature.height) * w;
  else if (feature.kind === 'flatten') y += (feature.height - y) * Math.min(1, w * 1.6);
  else if (feature.kind === 'plateau') y = Math.max(y, y + (feature.height - y) * Math.min(1, w * 2.5));
 }
 return y;
}

/** Heights for a (resolution+1)² grid covering sizeX × sizeZ metres, row-major along z then x. */
export function sampleTerrain(terrain, sizeX, sizeZ) {
 const n = terrain.resolution + 1, heights = new Float32Array(n * n);
 for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) heights[row * n + col] = terrainHeight(terrain, (col / terrain.resolution - .5) * sizeX, (row / terrain.resolution - .5) * sizeZ);
 return heights;
}
