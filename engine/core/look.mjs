/* Visual "look" settings: sky, sun/time of day, tone mapping, shadow range and post effects.
   One definition shared by the project schema, the editor inspector, the MCP contract and the
   model-connection validator, so every layer accepts exactly the same values. */

export const LOOK_ENUMS = Object.freeze({
 look: ['custom', 'clear-day', 'golden-hour', 'sunset', 'overcast', 'night', 'cinematic'],
 sky: ['color', 'physical'],
 toneMapping: ['aces', 'agx', 'neutral']
});

/* [min, max, default] */
export const LOOK_RANGES = Object.freeze({
 timeOfDay: [0, 24, 14],
 shadowDistance: [10, 400, 60],
 clouds: [0, 1, .3],
 bloom: [0, 3, 0],
 vignette: [0, 1, 0],
 dof: [0, 1, 0],
 saturation: [-1, 1, 0],
 contrast: [-1, 1, 0],
 warmth: [-1, 1, 0]
});

export const LOOK_DEFAULTS = Object.freeze({
 look: 'custom', sky: 'color', toneMapping: 'aces',
 ...Object.fromEntries(Object.entries(LOOK_RANGES).map(([key, [, , value]]) => [key, value]))
});

/* Presets fill every look field at once; the user or AI can then tweak single fields. */
export const LOOKS = Object.freeze({
 'clear-day': { sky: 'physical', timeOfDay: 13, toneMapping: 'agx', exposure: 1.1, fogDensity: .002, bloom: .15, vignette: .1, dof: 0, saturation: .1, contrast: .05, warmth: 0, shadowDistance: 80, clouds: .25 },
 'golden-hour': { sky: 'physical', timeOfDay: 17.6, toneMapping: 'agx', exposure: 1.25, fogDensity: .004, bloom: .5, vignette: .25, dof: 0, saturation: .15, contrast: .1, warmth: .35, shadowDistance: 100, clouds: .35 },
 sunset: { sky: 'physical', timeOfDay: 17.9, toneMapping: 'agx', exposure: 1.4, fogDensity: .006, bloom: .7, vignette: .3, dof: 0, saturation: .2, contrast: .1, warmth: .5, shadowDistance: 100, clouds: .45 },
 overcast: { sky: 'physical', timeOfDay: 12, toneMapping: 'neutral', exposure: .95, fogDensity: .012, bloom: 0, vignette: .15, dof: 0, saturation: -.35, contrast: -.05, warmth: -.1, shadowDistance: 40, clouds: .95 },
 night: { sky: 'physical', timeOfDay: 22.5, toneMapping: 'agx', exposure: 1.6, fogDensity: .008, bloom: .9, vignette: .4, dof: 0, saturation: -.2, contrast: .15, warmth: -.35, shadowDistance: 40, clouds: .2 },
 cinematic: { sky: 'physical', timeOfDay: 16.5, toneMapping: 'agx', exposure: 1.15, fogDensity: .005, bloom: .4, vignette: .35, dof: .35, saturation: .05, contrast: .2, warmth: .15, shadowDistance: 80, clouds: .4 }
});

const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** Validators keyed by setting name (look fields only). */
export const LOOK_VALIDATORS = Object.freeze({
 ...Object.fromEntries(Object.entries(LOOK_ENUMS).map(([key, values]) => [key, value => values.includes(value)])),
 ...Object.fromEntries(Object.entries(LOOK_RANGES).map(([key, [min, max]]) => [key, value => finite(value, min, max)]))
});

/** JSON-schema fragments for MCP tool definitions. */
export const LOOK_SCHEMA = Object.freeze({
 look: { enum: LOOK_ENUMS.look, description: 'One-word preset that sets sky, sun, tone mapping and post effects together. Apply it first, then tweak single fields.' },
 sky: { enum: LOOK_ENUMS.sky, description: '"physical" draws a real sky with a sun that follows timeOfDay and lights the scene; "color" uses the flat background colour.' },
 timeOfDay: { type: 'number', minimum: 0, maximum: 24, description: 'Hours (13 = early afternoon, 17.5 = golden hour, 22 = night). Moves the sun, its colour and the sky.' },
 toneMapping: { enum: LOOK_ENUMS.toneMapping, description: '"agx" is the most natural for bright skies, "neutral" keeps colours true, "aces" is punchy.' },
 shadowDistance: { type: 'number', minimum: 10, maximum: 400, description: 'How far from the camera the sun casts sharp shadows (metres).' },
 bloom: { type: 'number', minimum: 0, maximum: 3, description: 'Glow around bright things (sun, lamps, emissive). 0 = off.' },
 vignette: { type: 'number', minimum: 0, maximum: 1, description: 'Darkened corners. 0 = off.' },
 dof: { type: 'number', minimum: 0, maximum: 1, description: 'Depth-of-field blur away from the focused point in the centre (quality high only). 0 = off.' },
 clouds: { type: 'number', minimum: 0, maximum: 1, description: 'Cloud cover in the physical sky (0 = clear, 1 = overcast).' },
 saturation: { type: 'number', minimum: -1, maximum: 1 },
 contrast: { type: 'number', minimum: -1, maximum: 1 },
 warmth: { type: 'number', minimum: -1, maximum: 1, description: 'Positive = warmer/orange, negative = cooler/blue.' }
});

/** Returns the clean look fields from a stored settings object (unknown or invalid values fall back to defaults). */
export function cleanLook(value = {}) {
 const out = {};
 for (const [key, fallback] of Object.entries(LOOK_DEFAULTS)) out[key] = LOOK_VALIDATORS[key](value[key]) ? value[key] : fallback;
 return out;
}

/** Expands a settings patch: a named look fills its preset values first, explicit fields in the patch win. */
export function expandLook(patch = {}) {
 const preset = patch.look && patch.look !== 'custom' ? LOOKS[patch.look] : null;
 const given = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
 return preset ? { ...preset, ...given } : given;
}

const clamp01 = value => Math.min(1, Math.max(0, value));
const mix = (a, b, t) => a + (b - a) * t;
const mixRgb = (a, b, t) => a.map((value, index) => mix(value, b[index], t));

/**
 * Sun state for a time of day. Sunrise 6:00, noon 12:00, sunset 18:00.
 * direction points from the scene towards the sun (y up). Between dusk and dawn the "sun" becomes a dim blue moon.
 */
export function sunState(timeOfDay) {
 const hours = ((timeOfDay % 24) + 24) % 24;
 const dayPhase = (hours - 6) / 12; // 0 at sunrise, 1 at sunset
 const elevation = Math.sin(dayPhase * Math.PI) * 62; // degrees, peaks at 62° at noon
 const azimuth = 90 + dayPhase * 180; // east → south → west (degrees from +z towards +x)
 const night = elevation < -4;
 const shown = night ? 35 : Math.max(elevation, 2); // keep the moon/sun light above the horizon so shadows stay sane
 const elevationRad = shown * Math.PI / 180, azimuthRad = (night ? azimuth + 180 : azimuth) * Math.PI / 180;
const trueRad = elevation * Math.PI / 180, trueAz = azimuth * Math.PI / 180;
 const skyDirection = [Math.cos(trueRad) * Math.sin(trueAz), Math.sin(trueRad), Math.cos(trueRad) * Math.cos(trueAz)];
 const direction = [Math.cos(elevationRad) * Math.sin(azimuthRad), Math.sin(elevationRad), Math.cos(elevationRad) * Math.cos(azimuthRad)];
 const low = clamp01(1 - elevation / 25); // 1 near the horizon, 0 high up
 const color = night ? [.55, .65, 1] : mixRgb([1, .97, .92], [1, .55, .28], low * low);
 const intensity = night ? .18 : mix(.25, 1, clamp01((elevation + 2) / 20));
 const skyTint = night ? [.02, .03, .07] : mixRgb([.62, .78, .95], [.95, .6, .42], low * low * .85);
 return { hours, elevation, azimuth, night, direction, skyDirection, color, intensity, horizon: skyTint };
}
