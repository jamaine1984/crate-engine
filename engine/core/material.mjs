/* Primitive/customMesh material fields: one definition for schema, MCP contract, recipes and model validator.
   Old projects only have color/metalness/roughness; every new field is optional and omitted when unset, so their
   stored JSON and look do not change. */

/** Built-in surfaces: real CC0 photo textures from Poly Haven (colour, normal, AO/roughness/metal), 1k JPG. */
export const SURFACES = Object.freeze({
 wood: { polyhaven: 'brown_planks_03', tile: 2 },
 stone: { polyhaven: 'rock_wall_08', tile: 3 },
 rock: { polyhaven: 'rocky_terrain_02', tile: 4 },
 brick: { polyhaven: 'red_brick_03', tile: 2 },
 concrete: { polyhaven: 'concrete_floor_02', tile: 3 },
 plaster: { polyhaven: 'painted_plaster_wall', tile: 3 },
 tiles: { polyhaven: 'floor_tiles_06', tile: 2 },
 metal: { polyhaven: 'metal_plate', tile: 2 },
 fabric: { polyhaven: 'denim_fabric', tile: 1 },
 grass: { polyhaven: 'aerial_grass_rock', tile: 6 },
 sand: { polyhaven: 'coast_sand_01', tile: 4 },
 dirt: { polyhaven: 'brown_mud_leaves_01', tile: 4 },
 'forest-floor': { polyhaven: 'forest_ground_04', tile: 4 },
 snow: { polyhaven: 'snow_02', tile: 4 }
});
export const SURFACE_NAMES = Object.freeze(Object.keys(SURFACES));
export const SURFACE_MAPS = Object.freeze(['color', 'normal', 'arm']);

const HEX = /^#[a-fA-F0-9]{6}$/;
/* [min, max] for optional numeric fields */
export const MATERIAL_RANGES = Object.freeze({
 emissiveIntensity: [0, 50], opacity: [0, 1], transmission: [0, 1], ior: [1, 2.5], thickness: [0, 10], clearcoat: [0, 1], sheen: [0, 1], textureScale: [.05, 100]
});
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export const MATERIAL_VALIDATORS = Object.freeze({
 color: value => typeof value === 'string' && HEX.test(value),
 metalness: value => finite(value, 0, 1),
 roughness: value => finite(value, 0, 1),
 emissive: value => typeof value === 'string' && HEX.test(value),
 surface: value => SURFACE_NAMES.includes(value),
 ...Object.fromEntries(Object.entries(MATERIAL_RANGES).map(([key, [min, max]]) => [key, value => finite(value, min, max)]))
});
export const MATERIAL_KEYS = Object.freeze(Object.keys(MATERIAL_VALIDATORS));

/** True when every present key is known and valid (partial patches allowed). */
export function validMaterial(value) {
 return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(([key, field]) => Object.hasOwn(MATERIAL_VALIDATORS, key) && MATERIAL_VALIDATORS[key](field));
}

/** Stored form: the three base fields always, optional fields only when valid. */
export function cleanMaterial(value = {}) {
 const out = { color: MATERIAL_VALIDATORS.color(value?.color) ? value.color : '#8ebfa6', metalness: finite(value?.metalness, 0, 1) ? value.metalness : .05, roughness: finite(value?.roughness, 0, 1) ? value.roughness : .65 };
 for (const key of MATERIAL_KEYS) if (!(key in out) && value && Object.hasOwn(value, key) && MATERIAL_VALIDATORS[key](value[key])) out[key] = value[key];
 return out;
}

const hexSchema = { type: 'string', pattern: '^#[a-fA-F0-9]{6}$' };
export const MATERIAL_SCHEMA = Object.freeze({
 type: 'object', additionalProperties: false,
 description: 'Surface look for primitives and customMesh. Use surface for real photo textures; emissive for things that glow (lamps, screens, lava); transmission for glass/water/ice; clearcoat for car paint and varnish; sheen for cloth.',
 properties: {
  color: hexSchema, metalness: { type: 'number', minimum: 0, maximum: 1 }, roughness: { type: 'number', minimum: 0, maximum: 1 },
  surface: { enum: SURFACE_NAMES, description: 'Real photo texture (CC0). color tints it; use #ffffff for the natural look.' },
  textureScale: { type: 'number', minimum: .05, maximum: 100, description: 'Metres covered by one texture tile (default depends on the surface).' },
  emissive: hexSchema, emissiveIntensity: { type: 'number', minimum: 0, maximum: 50, description: 'Glow strength; above ~3 it blooms when bloom is on.' },
  opacity: { type: 'number', minimum: 0, maximum: 1 },
  transmission: { type: 'number', minimum: 0, maximum: 1, description: '1 = clear glass. Combine with roughness 0-0.1 and ior.' },
  ior: { type: 'number', minimum: 1, maximum: 2.5, description: 'Glass 1.5, water 1.33, diamond 2.4.' },
  thickness: { type: 'number', minimum: 0, maximum: 10 },
  clearcoat: { type: 'number', minimum: 0, maximum: 1 }, sheen: { type: 'number', minimum: 0, maximum: 1 }
 }
});
