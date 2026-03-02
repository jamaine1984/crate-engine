// ============================================================================
// CRATE ENGINE 2.0 — COMMAND BUS
// The single point through which ALL engine actions flow.
// See research/ENGINE_2_0_SPEC.md and research/COMMAND_SCHEMA.md
// ============================================================================

import { SCHEMA_VERSION, validateCommand, createCommandId, COMMAND_TYPES } from './command-schema.mjs';

// ---------------------------------------------------------------------------
// Command Bus
// ---------------------------------------------------------------------------

class CommandBus {
  constructor() {
    /** @type {Map<string, Function>} command type → handler */
    this._handlers = new Map();

    /** @type {Array<{before?: Function, after?: Function}>} */
    this._middleware = [];

    /** @type {Array<Object>} command history for undo/redo/replay */
    this._history = [];

    /** @type {number} max history entries to keep */
    this._historyLimit = 500;

    /** @type {Set<Function>} listeners notified on every dispatch */
    this._listeners = new Set();

    /** @type {boolean} whether the bus has been initialized */
    this._initialized = false;

    /** @type {number} total commands dispatched */
    this._stats = { dispatched: 0, succeeded: 0, failed: 0, rejected: 0 };
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  /**
   * Initialize the command bus. Call once at engine startup.
   * Makes the bus globally accessible at window.commandBus.
   */
  init() {
    if (this._initialized) return;
    this._initialized = true;
    window.commandBus = this;
    console.log('[CommandBus] Initialized — schema v' + SCHEMA_VERSION);
  }

  // -------------------------------------------------------------------------
  // Handler Registration
  // -------------------------------------------------------------------------

  /**
   * Register a handler for a command type.
   * Only one handler per type. Last registration wins.
   *
   * @param {string} commandType - e.g. 'SPAWN_OBJECT'
   * @param {Function} handler - async function(payload, command) → result
   */
  on(commandType, handler) {
    if (!COMMAND_TYPES.has(commandType)) {
      console.warn(`[CommandBus] Unknown command type: ${commandType}`);
    }
    this._handlers.set(commandType, handler);
  }

  /**
   * Register handlers for multiple command types at once.
   *
   * @param {Object} handlerMap - { COMMAND_TYPE: handler, ... }
   */
  registerHandlers(handlerMap) {
    for (const [type, handler] of Object.entries(handlerMap)) {
      this.on(type, handler);
    }
  }

  /**
   * Unregister a handler for a command type.
   */
  off(commandType) {
    this._handlers.delete(commandType);
  }

  // -------------------------------------------------------------------------
  // Middleware
  // -------------------------------------------------------------------------

  /**
   * Add middleware that runs before/after every command.
   * Use for: multiplayer sync, analytics, logging, rate limiting.
   *
   * @param {{ before?: Function, after?: Function }} mw
   * @returns {Function} unsubscribe function
   */
  use(mw) {
    this._middleware.push(mw);
    return () => {
      const idx = this._middleware.indexOf(mw);
      if (idx !== -1) this._middleware.splice(idx, 1);
    };
  }

  // -------------------------------------------------------------------------
  // Dispatch (the core method)
  // -------------------------------------------------------------------------

  /**
   * Dispatch a command through the bus.
   *
   * @param {Object} command - { type, payload, source? }
   *   Minimal: { type: 'CLEAR_SCENE', payload: {} }
   *   Full:    { v: 1, type: 'SPAWN_OBJECT', payload: {...}, source: 'chat' }
   *
   * @returns {Promise<Object>} { ok, commandId, message, data? }
   */
  async dispatch(command) {
    // Normalize: add envelope fields if missing
    const cmd = this._normalize(command);

    // Validate against schema
    const validation = validateCommand(cmd);
    if (!validation.valid) {
      this._stats.rejected++;
      const result = {
        ok: false,
        commandId: cmd.id,
        message: `Validation failed: ${validation.error}`,
      };
      this._notifyListeners('rejected', cmd, result);
      return result;
    }

    // Run before-middleware (can abort)
    for (const mw of this._middleware) {
      if (mw.before) {
        try {
          const proceed = await mw.before(cmd);
          if (proceed === false) {
            this._stats.rejected++;
            return {
              ok: false,
              commandId: cmd.id,
              message: 'Command blocked by middleware',
            };
          }
        } catch (err) {
          console.error('[CommandBus] Middleware error:', err);
        }
      }
    }

    // Find handler
    const handler = this._handlers.get(cmd.type);
    if (!handler) {
      this._stats.failed++;
      const result = {
        ok: false,
        commandId: cmd.id,
        message: `No handler registered for: ${cmd.type}`,
      };
      this._notifyListeners('unhandled', cmd, result);
      return result;
    }

    // Execute
    let result;
    this._stats.dispatched++;

    try {
      const handlerResult = await handler(cmd.payload, cmd);

      // Normalize handler result
      if (typeof handlerResult === 'string') {
        result = { ok: true, commandId: cmd.id, message: handlerResult };
      } else if (handlerResult && typeof handlerResult === 'object') {
        result = {
          ok: handlerResult.ok !== undefined ? handlerResult.ok : true,
          commandId: cmd.id,
          message: handlerResult.message || 'Done',
          data: handlerResult.data,
        };
      } else {
        result = { ok: true, commandId: cmd.id, message: 'Done' };
      }

      this._stats.succeeded++;
    } catch (err) {
      console.error(`[CommandBus] Handler error for ${cmd.type}:`, err);
      result = {
        ok: false,
        commandId: cmd.id,
        message: `Error: ${err.message || err}`,
      };
      this._stats.failed++;
    }

    // Push to history (mutating commands only)
    if (this._isMutating(cmd.type) && result.ok) {
      this._history.push({ command: cmd, result, ts: Date.now() });
      if (this._history.length > this._historyLimit) {
        this._history.shift();
      }
    }

    // Run after-middleware
    for (const mw of this._middleware) {
      if (mw.after) {
        try {
          await mw.after(cmd, result);
        } catch (err) {
          console.error('[CommandBus] After-middleware error:', err);
        }
      }
    }

    // Notify listeners
    this._notifyListeners('dispatched', cmd, result);

    return result;
  }

  /**
   * Dispatch multiple commands in sequence.
   * Stops on first failure unless `continueOnError` is true.
   *
   * @param {Array<Object>} commands
   * @param {{ continueOnError?: boolean }} options
   * @returns {Promise<Array<Object>>} array of results
   */
  async dispatchBatch(commands, { continueOnError = false } = {}) {
    const results = [];
    for (const cmd of commands) {
      const result = await this.dispatch(cmd);
      results.push(result);
      if (!result.ok && !continueOnError) break;
    }
    return results;
  }

  // -------------------------------------------------------------------------
  // Listeners (for UI updates, logging, debugging)
  // -------------------------------------------------------------------------

  /**
   * Subscribe to all command events.
   *
   * @param {Function} listener - (event, command, result) => void
   * @returns {Function} unsubscribe function
   */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  // -------------------------------------------------------------------------
  // History
  // -------------------------------------------------------------------------

  /**
   * Get command history.
   * @param {number} limit - max entries to return
   */
  getHistory(limit = 50) {
    return this._history.slice(-limit);
  }

  /**
   * Get the last executed command.
   */
  getLastCommand() {
    return this._history.length > 0 ? this._history[this._history.length - 1] : null;
  }

  /**
   * Clear command history.
   */
  clearHistory() {
    this._history = [];
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  getStats() {
    return { ...this._stats, historySize: this._history.length };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** Add envelope fields if missing */
  _normalize(command) {
    return {
      v: command.v || SCHEMA_VERSION,
      id: command.id || createCommandId(),
      ts: command.ts || Date.now(),
      source: command.source || 'system',
      type: command.type,
      payload: command.payload || {},
    };
  }

  /** Check if a command type is mutating (scene-modifying) */
  _isMutating(type) {
    const MUTATING = new Set([
      'CLEAR_SCENE', 'SPAWN_OBJECT', 'SCATTER_OBJECTS', 'REMOVE_OBJECT',
      'TRANSFORM_OBJECT', 'COLOR_OBJECT', 'SET_TERRAIN', 'SET_WEATHER',
      'SET_TIME', 'SET_FOG', 'SET_WATER', 'SET_PARTICLES', 'SET_WETNESS',
      'SPAWN_NPC', 'ADD_INTERIOR', 'BUILD_WORLD', 'WORLD_BUILD', 'EXEC_RAW',
    ]);
    return MUTATING.has(type);
  }

  /** Notify all listeners */
  _notifyListeners(event, command, result) {
    for (const listener of this._listeners) {
      try {
        listener(event, command, result);
      } catch (err) {
        console.error('[CommandBus] Listener error:', err);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

const commandBus = new CommandBus();

export { commandBus, CommandBus };
export default commandBus;
