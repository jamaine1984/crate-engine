# Local editor MCP connection

This optional desktop helper connects an MCP-capable AI client to an explicitly paired Crate Ship editor tab. The regular browser editor and built-in BYOK connection do not require it. It controls Crate's own scene through bounded recipes; it does not expose a general script runner or native Unity/Unreal project adapter.

The MCP adapter supports **protocol version 2025-06-18**, using newline-delimited JSON-RPC over stdio and the initialize/initialized lifecycle. It does not claim compliance with the newer 2026-07-28 protocol. That newer revision changed the request metadata and HTTP/session model. Use a client compatible with the pinned version. [Supported lifecycle](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle), [current protocol compatibility](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning).

## Setup

Run from the repository root using a supported Node.js runtime:

```powershell
node integrations/editor/bridge.mjs --origin http://127.0.0.1:4173
```

The package shortcut is `npm run bridge:editor -- --origin http://127.0.0.1:4173`.

For a deployed editor, substitute its exact HTTPS origin; paths and trailing slashes are not accepted. An optional `--port 9879` selects the port. The bridge binds only to `127.0.0.1`, and the default port is 9879.

The bridge prints two different cryptographically random per-start tokens:

- **Browser pairing token:** enter this only in the editor's local MCP connection controls. It grants browser-side pairing and permission management for the active session.
- **MCP token (`CRATESHIP_EDITOR_TOKEN`):** configure this only in the desktop AI client's MCP subprocess environment. It can request permitted tools, but cannot change editor write permission even if it attempts to spoof an Origin header.

Configure the desktop AI client to launch Node with the absolute path to `integrations/editor/mcp-server.mjs`. Its environment needs:

```text
CRATESHIP_EDITOR_TOKEN=<MCP token printed by the current bridge>
CRATESHIP_EDITOR_PORT=9879
```

These are local connection credentials, not model-provider API keys. Do not place either token in a project, prompt, public source, exported game, or URL. Do not give the desktop AI client the browser pairing token. Closing/restarting the bridge invalidates both tokens. No connection, browser permission, or write permission is enabled automatically by installing this code.

Pair the editor to the running helper, then explicitly enable writes only when you want that AI client to apply changes. Disabling writes blocks mutation commands. Disconnect before changing accounts or handing the computer to someone else. The bridge holds one paired editor project at a time; a new connection replaces the previous session and cancels its pending work.

## Tools

| Tool | Arguments | Behavior |
| --- | --- | --- |
| `get_scene` | Optional `offset`, `limit` (maximum 250) | Read a bounded page of scene metadata and available asset IDs. Check total counts/truncation before reasoning about the full scene. |
| `get_object` | `{id}` | Read one object in full, including a `customMesh` object's vector `shape` (paths, colours, depth), so a client can copy that art into a recipe or change it. |
| `preview_world` | `{recipe}` | Validate and expand a deterministic world recipe against the paired project. Returns a preview ID and proposed entity metadata; does not commit edits. |
| `apply_world` | `{previewId}` | Apply an exact prior preview only while editor writes are enabled. Consumed, expired, wrong-project, or stale previews fail. One transaction supports Undo. |
| `edit_objects` | `{summary?, operations}` | Update (`{op:'update', id, patch}`) or remove (`{op:'remove', id}`) up to 50 existing objects by the IDs from `get_scene`, as one Undo step, while writes are enabled. `material` and `light` patches merge; each listed component replaces that component and `null` removes it. The whole edit fails if any operation is invalid. |
| `set_level_settings` | `{settings}` | Change level settings such as `lives` (0 = unlimited), `killY` (fall-out height), gravity, background, lighting and quality, as one Undo step, while writes are enabled. |
| `screenshot` | `{view?, width?}` | Returns a JPEG of the editor view or the level's game camera (grid and gizmos hidden) so the client can check its own work. Read-only. |
| `play_test` | `{seconds? \| steps?, screenshot?, width?}` | Plays the level with scripted input (`steps: [{move, seconds, jump?}]`, up to 12 s in total), then returns to Edit mode. Physics is stepped at a fixed 60 Hz, faster than real time, so it does not depend on frame rate or tab visibility. Reports start/end position, lowest/highest point, score, lives, won/lost, events and a picture of the last frame. It does not change the project. |
| `save_project` | `{where?}` | Saves the project on this device (`device`, default) or on this device and to the signed-in account (`account`), while writes are enabled. |
| `undo` | `{}` | Undo the latest editor change while writes are enabled. This can undo a manual edit too; use it deliberately. |

Turning on writes authorizes the connected client to call `apply_world`, `edit_objects`, `set_level_settings`, `add_library_model`, `save_project` and `undo` within that paired session.

### Building a playable level

Recipes and edits use the same gameplay components as the editor Inspector, so an AI client can build a complete game:

- `player` with a dynamic `rigidbody` is the controllable character; `sideView: true` makes a side-scroller, and a `camera` object makes the view follow the player.
- `goal {message?}` wins the level, `hazard {}` costs a life, `checkpoint {}` moves the respawn point, `collectible {value}` adds score.
- `mover {offset:[x,y,z], period}` is a moving platform that carries a standing player.
- `rigidbody.collider: 'shape'` makes collision follow an object's real outline instead of its bounding box.
- Lives and fall-out height are level settings, changed with `set_level_settings`.

`get_scene` omits `customMesh` vector paths to keep pages small; those objects still report their transforms and components. Use `get_object` to read one object's art, and an `edit_objects` patch with `shape` (customMesh only) to change it. Preview is still required before applying a world; a preview result alone does not mean the world was applied or saved. Saving and exporting remain explicit editor operations.

The authoritative recipe contract is `engine/core/procedural.mjs`, exposed through the tool's schema. A version-1 recipe supplies an integer or string seed and `add`, `grid`, or `scatter` operations. Supported objects use the editor's allowlisted types/components. Model entities must reference existing project asset IDs. Limits include 64 recipe operations, 500 new entities, 5,000 total project entities, and 32 total lights. No code, arbitrary URLs, filesystem commands, API keys, or paid provider invocation is available through these tools.

## Browser bridge boundary

`bridge.mjs` uses a private authenticated HTTP transport between the browser and stdio adapter. It is **not** an MCP Streamable HTTP endpoint and should not be registered as a remote MCP URL.

The bridge checks the exact loopback Host and configured browser Origin, separates editor and native credentials, and binds commands/results to a paired session and project. Native command submission refuses browser Origin headers. CORS permission is limited to the configured origin. Requests, queues, retained results, and command lifetimes are bounded. The current bridge caps JSON bodies at 512 KiB, pending commands at eight, command lifetime at 30 seconds, and idle sessions at 90 seconds. Session polling refreshes the idle expiry.

Timeout or connection loss after a mutation was delivered can leave its outcome uncertain. Inspect the scene/status before requesting another change; do not blindly issue a fresh apply request. A consumed preview cannot simply be replayed. Stopping the helper clears its in-memory queues and retained results, but does not reverse changes already committed in the editor.

Internally, native submissions receive a queued `202` response and are polled by command ID. The adapter does not retry command submission automatically. Duplicate command IDs retain rejection records, and cancellation does not claim to reverse a mutation that already reached the editor.

The security design follows the MCP guidance to validate origins, bind local services to loopback, and authenticate connections. A session identifier is never a substitute for the pairing credential. [MCP HTTP security guidance](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http).

Browsers can require local-network permission and enforce CORS/CSP restrictions. An HTTPS deployment and local helper must be verified in the actual browser. Permission denial must fail clearly; disabling browser protections is not a setup step. A phone's `127.0.0.1` refers to that phone, so this desktop helper is not automatically reachable from mobile. [Chrome Local Network Access](https://developer.chrome.com/blog/local-network-access).

## Verification status

This helper is being integrated locally. Source and subprocess/loopback tests establish only the behavior covered by those tests. Root's browser verification is required before claiming the complete AI-client-to-browser workflow works on a given machine. No real provider call, paid generation, customer API credential, account grant, or production deployment is part of this setup document.

For the language choice, BYOK proposal path, trust boundaries, and remaining procedural authoring work, see [procedural authoring design](../../docs/platform-rebuild/procedural-authoring.md).
