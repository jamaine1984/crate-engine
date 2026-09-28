import http from 'node:http';
import { pathToFileURL } from 'node:url';

const objectSchema = properties => ({ type: 'object', properties, additionalProperties: false });
const vector = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };
const operation = { ...objectSchema({ operation: { enum: ['transform', 'add_primitive'] }, name: { type: 'string', minLength: 1, maxLength: 80 }, primitive: { enum: ['CUBE', 'PLANE', 'UV_SPHERE', 'CYLINDER'] }, location: vector, rotation: vector, scale: vector }), required: ['operation', 'name'] };
const tools = [
  { name: 'get_scene_info', description: 'Read up to 200 current scene object names and transforms. No file paths or credentials.', inputSchema: objectSchema({}), annotations: { readOnlyHint: true } },
  { name: 'list_assets', description: 'List metadata for the last four explicitly exported GLB assets in this Blender session.', inputSchema: objectSchema({}), annotations: { readOnlyHint: true } },
  { name: 'export_selected', description: 'Export 1 to 100 selected objects as a GLB to the paired local Crate Ship bridge. Maximum 16 MiB. Requires explicit local pairing.', inputSchema: objectSchema({ name: { type: 'string', minLength: 1, maxLength: 80 } }), annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: 'apply_object_operations', description: 'Apply up to 16 transforms or add supported primitives. Both the Blender panel and MCP environment must explicitly permit edits. No deletion, code execution or filesystem commands.', inputSchema: { ...objectSchema({ operations: { type: 'array', items: operation, minItems: 1, maxItems: 16 } }), required: ['operations'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
];
const plain = x => !!x && typeof x === 'object' && !Array.isArray(x);
const keys = (x, allowed) => plain(x) && Object.keys(x).every(key => allowed.includes(key));
const name = x => typeof x === 'string' && x.length > 0 && x.length <= 80 && !/[\x00-\x1f\x7f/\\]/.test(x);
function validArgs(command, args) {
  if (command === 'get_scene_info' || command === 'list_assets') return keys(args, []);
  if (command === 'export_selected') return keys(args, ['name']) && (args.name === undefined || name(args.name));
  if (command !== 'apply_object_operations' || !keys(args, ['operations']) || !Array.isArray(args.operations) || args.operations.length < 1 || args.operations.length > 16) return false;
  return args.operations.every(op => keys(op, ['operation', 'name', 'primitive', 'location', 'rotation', 'scale']) && name(op.name)
    && ['transform', 'add_primitive'].includes(op.operation)
    && (op.operation === 'transform' ? op.primitive === undefined : ['CUBE', 'PLANE', 'UV_SPHERE', 'CYLINDER'].includes(op.primitive))
    && ['location', 'rotation', 'scale'].every(field => op[field] === undefined || (Array.isArray(op[field]) && op[field].length === 3
      && op[field].every(x => Number.isFinite(x) && Math.abs(x) <= ({ location: 10000, rotation: 20 * Math.PI, scale: 100 })[field] && (field !== 'scale' || x >= .001)))));
}

/** Native request uses a fixed loopback host; arguments never select a URL or file. */
export async function callBlender(command, args, { token, port = 9878 } = {}) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token || '') || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Blender pairing is not configured.');
  if (!validArgs(command, args)) throw new Error('Invalid bounded Blender arguments.');
  const body = JSON.stringify({ command, arguments: args });
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port, method: 'POST', path: '/command', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'content-length': Buffer.byteLength(body) }, timeout: 25_000 }, response => {
      const chunks = []; let size = 0;
      response.on('data', chunk => { size += chunk.length; if (size > 131072) { response.destroy(); reject(new Error('Blender response exceeded limits.')); } else chunks.push(chunk); });
      response.on('error', () => reject(new Error('Blender command connection failed.')));
      response.on('end', () => {
        try { const value = JSON.parse(Buffer.concat(chunks)); if (response.statusCode !== 200 || !plain(value.result)) throw new Error(); resolve(value.result); }
        catch { reject(new Error('Blender command failed. Check local pairing, selection and permissions.')); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', () => reject(new Error('Blender command server is unavailable.')));
    request.end(body);
  });
}

export function startMcp({ input = process.stdin, output = process.stdout, env = process.env } = {}) {
  // Explicitly supports the stable 2025 lifecycle; does not claim modern stateless protocol support.
  let initialized = false, ready = false, partial = Buffer.alloc(0), pending = 0, sequence = Promise.resolve(), stopped = false;
  const seen = new Set(), allowEdits = env.CRATESHIP_BLENDER_ALLOW_EDIT === 'true';
  const available = tools.filter(tool => tool.name !== 'apply_object_operations' || allowEdits);
  const emit = value => { if (!stopped) output.write(JSON.stringify(value) + '\n'); };
  const error = (id, code, message) => emit({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  async function dispatch(message) {
    if (!plain(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' || ('id' in message && !(typeof message.id === 'string' && message.id.length <= 80 || Number.isSafeInteger(message.id)))) return error(null, -32600, 'Invalid request.');
    const hasId = 'id' in message, id = message.id;
    if (!hasId) { if (message.method === 'notifications/initialized' && initialized) ready = true; return; }
    const key = typeof id + ':' + id;
    if (seen.has(key)) return error(id, -32600, 'Repeated request ID.');
    if (seen.size >= 10000) return error(id, -32000, 'Restart the local MCP session.');
    seen.add(key);
    const result = value => emit({ jsonrpc: '2.0', id, result: value });
    if (message.method === 'initialize') {
      if (initialized || !plain(message.params) || typeof message.params.protocolVersion !== 'string') return error(id, -32602, 'Invalid initialization.');
      initialized = true;
      return result({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'crateship-local-blender', version: '1.0.0' } });
    }
    if (message.method === 'ping') return result({});
    if (!ready) return error(id, -32000, 'Initialize the MCP session first.');
    if (message.method === 'tools/list') return result({ tools: available });
    if (message.method !== 'tools/call') return error(id, -32601, 'Method not found.');
    const params = message.params;
    if (!keys(params, ['name', 'arguments', '_meta']) || !available.some(tool => tool.name === params.name) || !validArgs(params.name, params.arguments ?? {})) return error(id, -32602, 'Unsupported tool or arguments.');
    try {
      const value = await callBlender(params.name, params.arguments ?? {}, { token: env.CRATESHIP_BLENDER_TOKEN, port: Number(env.CRATESHIP_BLENDER_PORT || 9878) });
      return result({ content: [{ type: 'text', text: JSON.stringify(value) }] });
    } catch { return result({ isError: true, content: [{ type: 'text', text: 'Blender is unavailable or rejected the bounded command. Check local pairing, selection and permissions.' }] }); }
  }
  function onData(chunk) {
    if (stopped) return;
    partial = Buffer.concat([partial, Buffer.from(chunk)]);
    // Input is bounded before line parsing; no unbounded readline allocation.
    if (partial.length > 65536) { error(null, -32600, 'MCP input limit exceeded.'); stopped = true; input.pause(); return; }
    let end;
    while ((end = partial.indexOf(10)) >= 0) {
      const line = partial.subarray(0, end); partial = partial.subarray(end + 1);
      if (pending >= 16) { error(null, -32000, 'MCP command queue is full.'); continue; }
      let message; try { message = JSON.parse(line.toString('utf8')); } catch { error(null, -32700, 'Invalid JSON.'); continue; }
      pending++;
      sequence = sequence.then(() => dispatch(message)).catch(() => error(null, -32603, 'Local MCP request failed.')).finally(() => { pending--; });
    }
  }
  input.on('data', onData);
  return { stop() { stopped = true; input.off('data', onData); }, idle: () => sequence };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startMcp();
