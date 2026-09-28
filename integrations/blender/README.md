# Blender → Crate Ship local connection

This optional integration sends a selected Blender scene as a self-contained GLB to the web editor. It also supplies a small local MCP server for bounded scene actions. It contains no model provider, agent, OpenClaw installation, payment service or unrestricted Python command.

## Start and pair

1. In the repository, run `node integrations/blender/bridge.mjs --origin http://127.0.0.1:4173`. Replace the origin with the **exact** editor origin you use, including its port. The bridge always binds `127.0.0.1`; `--port` changes only its port, default `9877`.
2. The terminal shows a new pairing token. Copy it into the editor's Blender connection and the addon's **Bridge pairing token** field. Keep it local. Restarting the bridge invalidates the token and clears its assets.
3. Install `crateship_blender.py` using Blender's Add-ons **Install from Disk** control and enable **Crate Ship Local Bridge**. This is a single-file legacy addon; no installer modifies your Blender installation automatically.
4. Open the 3D View sidebar → **Crate Ship**. In Object Mode, select the desired objects and press **Send to Crate Ship**. Then refresh the editor's Blender asset list and import the desired model.

The addon creates a temporary GLB, posts it to the local bridge, checks its returned SHA-256, and removes the temporary file. It does not save your `.blend` file or change startup preferences. The bridge keeps only the latest four models in memory, at most 16 MiB each. Select no more than 100 objects and one million source mesh polygons. Evaluated geometry, textures and animations can still make exports expensive or exceed the limit; large assets need manual simplification.

Browsers may require permission to access the local network. A deployed HTTPS editor's policy must explicitly allow the local connection, and browser behavior must be checked for that deployment. Do not expose either loopback port through a tunnel. The browser pairing token belongs in memory, never URLs, projects, analytics, logs or local storage.

## Browser contract, protocol 1

All requests use `Authorization: Bearer <pairing token>`. Browser `Origin` must exactly match the configured app origin. Only that origin receives CORS permission; no credentialed CORS is enabled. `Host` must be `127.0.0.1:<actual port>`. Queries, filesystem paths and unknown endpoints are rejected.

| Request | Result |
| --- | --- |
| `GET /status` | `{ok:true,protocol:1,assetCount,maxAssetBytes:16777216}` |
| `GET /assets` | `{assets:[{id,name,size,sha256,createdAt}],latestId}`; newest first |
| `GET /assets/:id` | Exact GLB bytes, fixed `model/gltf-binary` MIME and `nosniff` |
| `POST /assets` | Raw `model/gltf-binary`; optional URL-encoded `X-Asset-Name`; returns `201 {asset:{id,name,size,sha256,createdAt}}` |

Native addon POSTs may omit `Origin` because they already require the pairing token. Native GETs are denied. Browser `Origin: null` is denied. Preflight permits only GET/POST and the Authorization, Content-Type and X-Asset-Name headers. The GLB container and embedded resource references are checked before retention; HTML and external texture/buffer URLs are rejected. This check is not a full glTF conformance or malware scan.

## Optional local MCP

The addon's **Start MCP Commands** button starts a separate native-only command server on `127.0.0.1:9878`. Its independent token changes on each start. It refuses every browser Origin and every Host other than its exact loopback address. Stop the server from the same panel to revoke access.

Configure your chosen MCP client to launch Node with the absolute path to `mcp-server.mjs`. Set `CRATESHIP_BLENDER_TOKEN` to the panel's current **MCP token** and, if changed, `CRATESHIP_BLENDER_PORT`. This integration implements newline-delimited stdio JSON-RPC with the **2025-06-18 MCP lifecycle**, including initialize/initialized, tools/list and tools/call. It negotiates that supported version; it does not claim support for the newer stateless lifecycle.

Available tools:

- `get_scene_info`: at most 200 object names/types/transforms; total object count and truncation flag.
- `list_assets`: the last four export metadata records from this Blender session. These can expire independently if the asset bridge restarts or evicts a model.
- `export_selected`: explicit GLB export of the current selection to the already paired asset bridge. Optional display `name`; no path argument.
- `apply_object_operations`: visible only when the MCP process has `CRATESHIP_BLENDER_ALLOW_EDIT=true`; execution also requires **Allow bounded scene edits** in Blender. At most 16 transforms or CUBE/PLANE/UV_SPHERE/CYLINDER additions; a scene below 2,000 objects; finite bounded vectors. No deletion, script execution, arbitrary operators, filesystem access, network URL argument or shell commands.

The HTTP thread authenticates and queues requests. A Blender main-thread timer performs all `bpy` operations. There are request size, timeout and queue limits. Metadata results exclude pairing tokens and file paths. Scene changes are explicit and bounded; keep a saved copy before substantial authoring, as this addon does not implement a transaction across Blender operators. Export itself runs on Blender's main thread and may temporarily occupy it; transfer has an eight-second timeout. A timeout after an operation began cannot promise to cancel Blender's exporter.

## Verification and limitations

`node --test tests/blender-bridge.test.mjs` checks real loopback HTTP, GLB transfers, host/origin/token guards, retention and size limits, actual Node MCP subprocess messages, replay/schema limits, and the Python command server/main-thread dispatch with an **explicit mocked bpy API**. Python 3 is required for that last check (`PYTHON_EXECUTABLE` can choose it).

For the real Blender integration test, set `BLENDER_EXECUTABLE` to a runnable Blender binary and run the same test file. It uses `--background --factory-startup --disable-autoexec`, an isolated default scene and a temporary paired bridge. It never loads or saves a user's project or preferences.

On this machine, the installed Microsoft Store Blender 5.2.2 executable returned `spawn EPERM`, and the installed Blender 4.5.14 LTS executable returned Windows **Access is denied**, including the actual binary under each package's `Blender` directory. Consequently the live exporter/UI path is **not verified** here. No permission workaround, new Blender installation, GUI launch or automatic addon installation was performed. The default test run explicitly skips the opt-in real Blender test.

Reference APIs: [Blender glTF export operator](https://docs.blender.org/api/main/bpy.ops.export_scene.html), [MCP 2025-06-18 schema](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-06-18/schema.mdx). This addon uses `use_selection=True`, `export_format='GLB'` and `will_save_settings=False`.
