// ============================================================================
// CRATE ENGINE 2.0 — ENGINE BRIDGE
// Connects the command bus to the existing engine.
// This is the ONLY file that touches both the new command bus and legacy code.
// See research/ENGINE_2_0_SPEC.md — Law #1: minimal bridge edits only.
// ============================================================================

import { commandBus } from './command-bus.mjs';
import { intentToCommand, requiresPro } from './command-schema.mjs';
import { interpret } from '../interpreter.mjs';
import { assetIndex } from './asset-index.mjs';
import { buildAndApply } from './world-client.mjs';
import { initWasm, isWasmReady } from './wasm-bridge.mjs';
import { registerMultiplayerHandlers } from './multiplayer-bridge.mjs';

// ---------------------------------------------------------------------------
// Initialize: register all handlers that route to the legacy engine
// ---------------------------------------------------------------------------

/**
 * Initialize the command bus bridge.
 * Call after engine.mjs has loaded and window._parseAndExecute is available.
 */
export function initBridge() {
  const execCmd = window._parseAndExecute;
  if (!execCmd) {
    console.error('[Bridge] window._parseAndExecute not found. Engine must expose it first.');
    return;
  }

  commandBus.init();

  // Initialize WASM module (non-blocking — JS fallback if it fails)
  initWasm().then(ok => {
    console.log(`[Bridge] WASM: ${ok ? 'active' : 'JS fallback'}`);
  });

  // -------------------------------------------------------------------------
  // Register handlers for every command type
  // -------------------------------------------------------------------------

  // Most commands route through parseAndExecute by converting back to
  // a text command. This is intentional: it preserves ALL existing behavior
  // while the command bus captures, validates, and logs every action.
  //
  // Over time, handlers will be replaced with direct implementations
  // that don't go through the legacy text parser.

  // --- Scene ---
  commandBus.on('CLEAR_SCENE', async () => {
    await execCmd('clear');
    return { ok: true, message: 'Scene cleared' };
  });

  commandBus.on('SAVE_SCENE', async (payload) => {
    if (window._sceneActions?.save) {
      window._sceneActions.save();
      return { ok: true, message: 'Scene saved' };
    }
    await execCmd(payload.name ? `save ${payload.name}` : 'save');
    return { ok: true, message: 'Scene saved' };
  });

  commandBus.on('LOAD_SCENE', async () => {
    if (window._sceneActions?.load) {
      window._sceneActions.load();
      return { ok: true, message: 'Load dialog opened' };
    }
    await execCmd('load');
    return { ok: true, message: 'Load dialog opened' };
  });

  commandBus.on('EXPORT_SCENE', async () => {
    if (window._sceneActions?.export_html) {
      window._sceneActions.export_html();
      return { ok: true, message: 'Exporting scene' };
    }
    return { ok: false, message: 'Export not available' };
  });

  commandBus.on('SHARE_SCENE', async () => {
    if (window._sceneActions?.share) {
      window._sceneActions.share();
      return { ok: true, message: 'Share dialog opened' };
    }
    return { ok: false, message: 'Share not available' };
  });

  commandBus.on('SCREENSHOT', async () => {
    await execCmd('screenshot');
    return { ok: true, message: 'Screenshot captured' };
  });

  // --- Objects ---
  commandBus.on('SPAWN_OBJECT', async (payload) => {
    const pos = payload.position;
    let cmdStr = `add ${payload.query}`;
    if (pos) cmdStr += ` at ${pos.x || 0} ${pos.y || 0} ${pos.z || 0}`;
    await execCmd(cmdStr);
    return { ok: true, message: `Added ${payload.query}` };
  });

  commandBus.on('SCATTER_OBJECTS', async (payload) => {
    await execCmd(`scatter ${payload.count} ${payload.query}`);
    return { ok: true, message: `Scattered ${payload.count} ${payload.query}` };
  });

  commandBus.on('REMOVE_OBJECT', async (payload) => {
    await execCmd(`remove ${payload.target}`);
    return { ok: true, message: `Removed ${payload.target}` };
  });

  commandBus.on('TRANSFORM_OBJECT', async (payload) => {
    if (payload.scale !== undefined) {
      await execCmd(`scale ${payload.target} ${payload.scale}`);
    }
    if (payload.rotation) {
      await execCmd(`rotate ${payload.target} ${payload.rotation.y || 0}`);
    }
    if (payload.position) {
      const p = payload.position;
      await execCmd(`move ${payload.target} ${p.x || 0} ${p.y || 0} ${p.z || 0}`);
    }
    return { ok: true, message: `Transformed ${payload.target}` };
  });

  commandBus.on('COLOR_OBJECT', async (payload) => {
    await execCmd(`color ${payload.target} ${payload.color}`);
    return { ok: true, message: `Colored ${payload.target} ${payload.color}` };
  });

  commandBus.on('UNDO', async () => {
    await execCmd('undo');
    return { ok: true, message: 'Undone' };
  });

  // --- Environment ---
  commandBus.on('SET_TERRAIN', async (payload) => {
    await execCmd(`terrain ${payload.type}`);
    return { ok: true, message: `Terrain set to ${payload.type}` };
  });

  commandBus.on('SET_WEATHER', async (payload) => {
    if (payload.type === 'clear') {
      await execCmd('clear weather');
    } else {
      await execCmd(payload.type);
    }
    return { ok: true, message: `Weather: ${payload.type}` };
  });

  commandBus.on('SET_TIME', async (payload) => {
    await execCmd(`time ${payload.time}`);
    return { ok: true, message: `Time: ${payload.time}` };
  });

  commandBus.on('SET_FOG', async (payload) => {
    await execCmd(payload.enabled ? 'fog on' : 'fog off');
    return { ok: true, message: payload.enabled ? 'Fog enabled' : 'Fog disabled' };
  });

  commandBus.on('SET_WATER', async (payload) => {
    if (payload.create) {
      await execCmd(`add ${payload.preset === 'lake' ? 'lake' : 'ocean'}`);
    } else if (payload.size) {
      await execCmd(`ocean ${payload.size}`);
    } else {
      await execCmd(`water ${payload.preset}`);
    }
    return { ok: true, message: `Water: ${payload.preset}` };
  });

  commandBus.on('SET_PARTICLES', async (payload) => {
    await execCmd(`particles ${payload.type}`);
    return { ok: true, message: `Particles: ${payload.type}` };
  });

  commandBus.on('SET_WETNESS', async (payload) => {
    await execCmd(`wet ${payload.value}`);
    return { ok: true, message: `Wetness: ${payload.value}` };
  });

  // --- Player ---
  commandBus.on('ENTER_PLAY_MODE', async () => {
    await execCmd('play');
    return { ok: true, message: 'Play mode entered' };
  });

  commandBus.on('EXIT_PLAY_MODE', async () => {
    await execCmd('edit');
    return { ok: true, message: 'Edit mode entered' };
  });

  commandBus.on('SET_CHARACTER', async (payload) => {
    await execCmd(`character ${payload.id}`);
    return { ok: true, message: `Character: ${payload.id}` };
  });

  commandBus.on('EQUIP_WEAPON', async (payload) => {
    await execCmd(`equip ${payload.weaponId}`);
    return { ok: true, message: `Equipped ${payload.weaponId}` };
  });

  commandBus.on('UNEQUIP_WEAPON', async () => {
    await execCmd('unequip');
    return { ok: true, message: 'Weapon unequipped' };
  });

  commandBus.on('TOGGLE_CAMERA', async () => {
    await execCmd('toggle camera');
    return { ok: true, message: 'Camera toggled' };
  });

  commandBus.on('TOGGLE_INVENTORY', async () => {
    await execCmd('inventory');
    return { ok: true, message: 'Inventory toggled' };
  });

  commandBus.on('SET_SENSITIVITY', async (payload) => {
    await execCmd(`sensitivity ${payload.value}`);
    return { ok: true, message: `Sensitivity: ${payload.value}` };
  });

  // --- NPCs ---
  commandBus.on('SPAWN_NPC', async (payload) => {
    const hostile = payload.hostile ? 'hostile ' : '';
    await execCmd(`spawn ${payload.count || 3} ${hostile}npcs`);
    return { ok: true, message: `Spawned ${payload.count || 3} NPCs` };
  });

  // --- Vehicles ---
  commandBus.on('DRIVE_VEHICLE', async (payload) => {
    await execCmd(`drive ${payload.target}`);
    return { ok: true, message: `Driving ${payload.target}` };
  });

  commandBus.on('EXIT_VEHICLE', async () => {
    await execCmd('exit vehicle');
    return { ok: true, message: 'Exited vehicle' };
  });

  // --- Buildings ---
  commandBus.on('ADD_INTERIOR', async (payload) => {
    if (payload.floors) {
      await execCmd(`${payload.floors} story ${payload.type}`);
    } else {
      await execCmd(`interior ${payload.type}`);
    }
    return { ok: true, message: `Added ${payload.type} interior` };
  });

  // --- Graphics ---
  commandBus.on('SET_GRAPHICS', async (payload) => {
    await execCmd(`graphics ${payload.level}`);
    return { ok: true, message: `Graphics: ${payload.level}` };
  });

  commandBus.on('SET_BLOOM', async (payload) => {
    if (payload.strength !== undefined) {
      await execCmd(`bloom ${payload.strength}`);
    } else {
      await execCmd(payload.enabled ? 'bloom on' : 'bloom off');
    }
    return { ok: true, message: payload.enabled ? 'Bloom on' : 'Bloom off' };
  });

  commandBus.on('SET_SSAO', async (payload) => {
    await execCmd(payload.enabled ? 'ssao on' : 'ssao off');
    return { ok: true, message: payload.enabled ? 'SSAO on' : 'SSAO off' };
  });

  commandBus.on('SET_POSTFX', async (payload) => {
    await execCmd(payload.enabled ? 'postfx on' : 'postfx off');
    return { ok: true, message: payload.enabled ? 'PostFX on' : 'PostFX off' };
  });

  commandBus.on('SET_VIGNETTE', async (payload) => {
    await execCmd(`vignette ${payload.value}`);
    return { ok: true, message: `Vignette: ${payload.value}` };
  });

  commandBus.on('SET_GRAIN', async (payload) => {
    await execCmd(`grain ${payload.value}`);
    return { ok: true, message: `Grain: ${payload.value}` };
  });

  // --- World Build ---
  commandBus.on('BUILD_WORLD', async (payload) => {
    await execCmd(`build a ${payload.template}`);
    return { ok: true, message: `Building ${payload.template}` };
  });

  commandBus.on('WORLD_BUILD', async (payload) => {
    // Phase 3: JS-side world compiler (mirrors Rust koko-world)
    try {
      const result = await buildAndApply({
        template: payload.template,
        seed: payload.seed,
        size: payload.size || 'medium',
      });
      return result;
    } catch (err) {
      console.warn('[Bridge] World build failed, falling back to legacy:', err.message);
      await execCmd(`build a ${payload.template.toLowerCase().replace(/_/g, ' ')}`);
      return { ok: true, message: `Building ${payload.template} (legacy fallback)` };
    }
  });

  // --- UI ---
  commandBus.on('SHOW_HELP', async () => {
    await execCmd('help');
    return { ok: true, message: 'Help displayed' };
  });

  commandBus.on('OPEN_LIBRARY', async (payload) => {
    await execCmd(payload.category ? `browse ${payload.category}` : 'library');
    return { ok: true, message: 'Library opened' };
  });

  commandBus.on('SHOW_GENERATOR', async () => {
    await execCmd('3d generator');
    return { ok: true, message: 'Generator opened' };
  });

  commandBus.on('AI_SETTINGS', async () => {
    await execCmd('ai settings');
    return { ok: true, message: 'AI settings opened' };
  });

  commandBus.on('SCRIPT_MANAGER', async () => {
    await execCmd('scripts');
    return { ok: true, message: 'Script manager opened' };
  });

  // --- Multiplayer (wired via multiplayer-bridge.mjs) ---
  registerMultiplayerHandlers();

  // --- Animation ---
  commandBus.on('PLAY_ANIMATION', async (payload) => {
    await execCmd(`animate ${payload.name}`);
    return { ok: true, message: `Playing animation: ${payload.name}` };
  });

  commandBus.on('STOP_ANIMATION', async (payload) => {
    await execCmd(`stop ${payload.target}`);
    return { ok: true, message: `Stopped animation: ${payload.target}` };
  });

  // --- Quick Play ---
  commandBus.on('QUICK_PLAY', async (payload) => {
    await execCmd(payload.mode);
    return { ok: true, message: `Quick play: ${payload.mode}` };
  });

  // --- Special ---
  commandBus.on('EXEC_RAW', async (payload) => {
    await execCmd(payload.input);
    return { ok: true, message: 'Executed' };
  });

  commandBus.on('AAA_SKY', async () => {
    await execCmd('aaa sky');
    return { ok: true, message: 'AAA sky enabled' };
  });

  commandBus.on('TOGGLE_DAY_NIGHT', async () => {
    await execCmd('day night cycle');
    return { ok: true, message: 'Day/night cycle toggled' };
  });

  commandBus.on('SHOOTER_MODE', async () => {
    await execCmd('shooter mode');
    return { ok: true, message: 'Shooter mode enabled' };
  });

  commandBus.on('DRIVING_DEMO', async () => {
    await execCmd('driving demo');
    return { ok: true, message: 'Driving demo started' };
  });

  // --- Asset Queries (Phase 2 — world compiler feeds) ---
  commandBus.on('QUERY_ASSETS', async (payload) => {
    const results = assetIndex.query({
      category: payload.category,
      zone: payload.zone,
      style: payload.style,
      placement: payload.placement,
      subcategory: payload.subcategory,
      search: payload.search,
      minHeight: payload.minHeight,
      maxHeight: payload.maxHeight,
    });
    return {
      ok: true,
      message: `Found ${results.length} assets`,
      data: { count: results.length, assets: results },
    };
  });

  // --- Rendering (Phase 5 — streaming + instancing) ---
  commandBus.on('RENDER_STATS', async () => {
    const scheduler = window._renderScheduler;
    if (!scheduler) return { ok: false, message: 'No render scheduler active' };
    const stats = scheduler.getStats();
    return { ok: true, message: `Rendering: ${stats.chunks.loaded} chunks loaded, ${stats.instances.instances} instances`, data: stats };
  });

  commandBus.on('RENDER_QUALITY', async (payload) => {
    const scheduler = window._renderScheduler;
    if (!scheduler) return { ok: false, message: 'No render scheduler active' };
    scheduler.setQuality(payload.level);
    return { ok: true, message: `Render quality: ${payload.level}` };
  });

  // -------------------------------------------------------------------------
  // Middleware: logging
  // -------------------------------------------------------------------------

  commandBus.use({
    after(cmd, result) {
      if (result.ok) {
        console.log(`[CMD] ${cmd.type} (${cmd.source}) → ${result.message}`);
      } else {
        console.warn(`[CMD] ${cmd.type} FAILED → ${result.message}`);
      }
    },
  });

  console.log('[Bridge] Command bus wired to engine. All handlers registered.');
}

// ---------------------------------------------------------------------------
// Convenience: parse text → dispatch through command bus
// ---------------------------------------------------------------------------

/**
 * Parse natural language text and dispatch through the command bus.
 * This is the new recommended way for any source to execute engine commands.
 *
 * @param {string} text - natural language input
 * @param {string} source - 'chat', 'voice', 'editor', etc.
 * @returns {Promise<Object>} command result
 */
export async function dispatchText(text, source = 'chat') {
  const intent = interpret(text);
  const cmd = intentToCommand(intent, source);
  return commandBus.dispatch(cmd);
}

export { commandBus };
