"""Installable Blender addon: explicit GLB transfer and bounded optional local commands.

All bpy access runs on the main thread. The HTTP thread only authenticates, validates
transport framing, and queues commands. No eval, exec, arbitrary paths or shell tools.
"""
bl_info = {"name": "Crate Ship Local Bridge", "author": "Crate Ship Games", "version": (1, 0, 0),
           "blender": (4, 2, 0), "location": "3D View > Sidebar > Crate Ship", "category": "Import-Export"}

import bpy
from bpy.props import BoolProperty, IntProperty, StringProperty, PointerProperty
import hashlib
import http.client
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import math
import os
import queue
import secrets
import tempfile
import threading
import time
from urllib.parse import quote

MAX_BYTES = 16 * 1024 * 1024
_server = None
_thread = None
_token = ""
_commands = queue.Queue(maxsize=16)
_exports = []


def _plain(value, keys):
    if not isinstance(value, dict) or set(value) - set(keys):
        raise ValueError("Invalid command fields.")


def _name(value):
    if not isinstance(value, str) or not 1 <= len(value) <= 80 or any(ord(c) < 32 or c in "/\\" for c in value):
        raise ValueError("Use a name of 1 to 80 characters.")
    return value


def _vector(value, bound, minimum=None):
    if not isinstance(value, list) or len(value) != 3:
        raise ValueError("A three component vector is required.")
    if any(isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x)
           or abs(x) > bound or (minimum is not None and x < minimum) for x in value):
        raise ValueError("Transform is outside the allowed range.")
    return value


def _scene_info():
    objects = list(bpy.context.scene.objects)
    return {"scene": bpy.context.scene.name[:80], "objectCount": len(objects), "truncated": len(objects) > 200,
            "objects": [{"name": obj.name[:80], "type": obj.type, "selected": obj.select_get(),
                         "location": list(obj.location), "rotation": list(obj.rotation_euler), "scale": list(obj.scale)}
                        for obj in objects[:200]]}


def _export_selected(label="Blender export"):
    settings = bpy.context.window_manager.crateship_bridge
    if not settings.bridge_token or len(settings.bridge_token) != 43:
        raise ValueError("Pair with the local asset bridge first.")
    selected = list(bpy.context.selected_objects)
    if bpy.context.mode != 'OBJECT' or not selected or len(selected) > 100:
        raise ValueError("Select 1 to 100 objects in Object Mode.")
    if sum(len(obj.data.polygons) for obj in selected if obj.type == 'MESH') > 1_000_000:
        raise ValueError("Selection exceeds one million source polygons.")
    label = _name(label)
    # No caller chooses this temporary path. Context manager removes the exported file.
    with tempfile.TemporaryDirectory(prefix="crateship-export-") as folder:
        target = os.path.join(folder, "selection.glb")
        result = bpy.ops.export_scene.gltf(filepath=target, export_format='GLB', use_selection=True,
                                           export_extras=False, export_cameras=False, export_lights=False,
                                           export_animations=True, will_save_settings=False)
        if 'FINISHED' not in result or not os.path.isfile(target) or os.path.getsize(target) > MAX_BYTES:
            raise ValueError("Export failed or exceeds 16 MiB.")
        with open(target, 'rb') as source:
            data = source.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("Export exceeds 16 MiB.")
    connection = http.client.HTTPConnection('127.0.0.1', settings.bridge_port, timeout=8)
    try:
        connection.request('POST', '/assets', body=data, headers={
            'Authorization': 'Bearer ' + settings.bridge_token, 'Content-Type': 'model/gltf-binary',
            'X-Asset-Name': quote(label, safe=''), 'Content-Length': str(len(data))})
        response = connection.getresponse()
        body = response.read(16_385)
        if response.status != 201 or len(body) > 16_384:
            raise ValueError("Bridge rejected the export. Check pairing and size.")
        metadata = json.loads(body).get('asset', {})
        if metadata.get('sha256') != hashlib.sha256(data).hexdigest():
            raise ValueError("Bridge integrity response did not match.")
        # Bound local metadata and omit connection tokens from returned scene data.
        safe = {key: metadata.get(key) for key in ('id', 'name', 'size', 'sha256', 'createdAt')}
        _exports.insert(0, safe)
        del _exports[4:]
        settings.last_status = "Sent " + label + " to Crate Ship"
        return {"asset": safe}
    except (OSError, ValueError, json.JSONDecodeError):
        raise ValueError("Could not transfer model. Check that the paired local bridge is running.") from None
    finally:
        connection.close()


def _apply_operations(args):
    settings = bpy.context.window_manager.crateship_bridge
    if not settings.allow_edits:
        raise ValueError("Scene edits are disabled in the Blender panel.")
    _plain(args, ('operations',))
    operations = args.get('operations')
    if not isinstance(operations, list) or not 1 <= len(operations) <= 16 or len(bpy.context.scene.objects) + len(operations) > 2000:
        raise ValueError("Use 1 to 16 bounded operations in a scene below 2000 objects.")
    # Validate the entire batch before changing any objects.
    validated = []
    for op in operations:
        _plain(op, ('operation', 'name', 'primitive', 'location', 'rotation', 'scale'))
        kind = op.get('operation')
        if kind not in ('transform', 'add_primitive'):
            raise ValueError("Only transform and add_primitive are allowed.")
        name = _name(op.get('name'))
        if kind == 'transform' and (name not in bpy.context.scene.objects or 'primitive' in op):
            raise ValueError("The named scene object does not exist.")
        if kind == 'add_primitive' and (op.get('primitive') not in ('CUBE', 'PLANE', 'UV_SPHERE', 'CYLINDER') or name in bpy.data.objects):
            raise ValueError("Choose a supported primitive and unused name.")
        for field, bound, minimum in [('location', 10000, None), ('rotation', 20 * math.pi, None), ('scale', 100, .001)]:
            if field in op:
                _vector(op[field], bound, minimum)
        validated.append(op)
    if bpy.context.mode != 'OBJECT':
        raise ValueError("Switch to Object Mode first.")
    changed = []
    for op in validated:
        if op['operation'] == 'add_primitive':
            operators = {'CUBE': bpy.ops.mesh.primitive_cube_add, 'PLANE': bpy.ops.mesh.primitive_plane_add,
                         'UV_SPHERE': bpy.ops.mesh.primitive_uv_sphere_add, 'CYLINDER': bpy.ops.mesh.primitive_cylinder_add}
            operators[op['primitive']]()
            obj = bpy.context.object
            obj.name = op['name']
        else:
            obj = bpy.context.scene.objects[op['name']]
        for field, prop in [('location', 'location'), ('rotation', 'rotation_euler'), ('scale', 'scale')]:
            if field in op:
                setattr(obj, prop, op[field])
        changed.append(obj.name)
    return {"changed": changed}


def dispatch_command(command, args):
    """Called by the main-thread queue (or explicit headless integration tests)."""
    if threading.current_thread() is not threading.main_thread():
        raise ValueError("Blender operations require the main thread.")
    if command in ('get_scene_info', 'list_assets'):
        _plain(args, ())
        return _scene_info() if command == 'get_scene_info' else {"assets": list(_exports)}
    if command == 'export_selected':
        _plain(args, ('name',))
        return _export_selected(args.get('name', 'Blender export'))
    if command == 'apply_object_operations':
        return _apply_operations(args)
    raise ValueError("Unsupported command.")


def _drain_commands():
    for _ in range(2):
        try:
            ticket = _commands.get_nowait()
        except queue.Empty:
            break
        if ticket['deadline'] < time.monotonic():
            ticket['response'] = {"error": "Command expired before execution."}
        else:
            try:
                ticket['response'] = {"result": dispatch_command(ticket['command'], ticket['arguments'])}
            except Exception:
                # Arbitrary bpy errors can contain paths or scene details; do not relay them.
                ticket['response'] = {"error": "Blender command failed. Check selection, pairing and permissions."}
        ticket['event'].set()
    return .1 if _server is not None else None


class _Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.0'

    def log_message(self, *_args):
        pass

    def _reply(self, status, value):
        body = json.dumps(value, separators=(',', ':'), allow_nan=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except OSError:
            pass

    def do_POST(self):
        self.connection.settimeout(5)
        if self.path != '/command' or self.headers.get('Host') != '127.0.0.1:' + str(self.server.server_port) or self.headers.get('Origin') is not None:
            return self._reply(403, {"error": "Native local endpoint only."})
        if not secrets.compare_digest(self.headers.get('Authorization', '').encode('utf-8'), ('Bearer ' + _token).encode('ascii')):
            return self._reply(401, {"error": "Pairing required."})
        if self.headers.get('Content-Type') != 'application/json' or self.headers.get('Transfer-Encoding') or self.headers.get('Content-Encoding'):
            return self._reply(415, {"error": "Invalid content type."})
        length = self.headers.get('Content-Length', '')
        if not length.isdigit() or not 1 <= int(length) <= 65_536:
            return self._reply(413, {"error": "Invalid request size."})
        try:
            body = json.loads(self.rfile.read(int(length)))
            _plain(body, ('command', 'arguments'))
            if body.get('command') not in ('get_scene_info', 'list_assets', 'export_selected', 'apply_object_operations') or not isinstance(body.get('arguments'), dict):
                raise ValueError()
        except (ValueError, OSError):
            return self._reply(400, {"error": "Invalid command."})
        ticket = {"command": body['command'], "arguments": body['arguments'], "event": threading.Event(), "deadline": time.monotonic() + 15}
        try:
            _commands.put_nowait(ticket)
        except queue.Full:
            return self._reply(429, {"error": "Blender command queue is full."})
        if not ticket['event'].wait(20):
            ticket['deadline'] = 0
            return self._reply(504, {"error": "Blender is busy. Command timed out."})
        self._reply(200 if 'result' in ticket['response'] else 400, ticket['response'])


class _LocalServer(HTTPServer):
    def get_request(self):
        connection, address = super().get_request()
        connection.settimeout(5)
        return connection, address

    def handle_error(self, request, client_address):
        # Keep internal paths and arbitrary request text out of logs.
        pass


def start_command_server(port=None):
    global _server, _thread, _token
    if _server is not None:
        raise ValueError("Command server already running.")
    settings = bpy.context.window_manager.crateship_bridge
    _token = secrets.token_urlsafe(32)
    server = _LocalServer(('127.0.0.1', settings.command_port if port is None else port), _Handler)
    server.timeout = .5
    _server = server
    settings.command_token = _token
    _thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': .1}, daemon=True)
    _thread.start()
    if not bpy.app.timers.is_registered(_drain_commands):
        bpy.app.timers.register(_drain_commands, first_interval=.1)
    return server.server_port


def stop_command_server():
    global _server, _thread, _token
    server, _server = _server, None
    _thread = None
    _token = ''
    while True:
        try:
            ticket = _commands.get_nowait()
            ticket['response'] = {'error': 'Server stopped.'}
            ticket['event'].set()
        except queue.Empty:
            break
    if server:
        server.shutdown()
        server.server_close()
    if bpy.app.timers.is_registered(_drain_commands):
        bpy.app.timers.unregister(_drain_commands)
    if hasattr(bpy.context.window_manager, 'crateship_bridge'):
        bpy.context.window_manager.crateship_bridge.command_token = ''


class CRATESHIP_Settings(bpy.types.PropertyGroup):
    bridge_port: IntProperty(name='Asset bridge port', default=9877, min=1024, max=65535)
    bridge_token: StringProperty(name='Bridge pairing token', subtype='PASSWORD', options={'SKIP_SAVE'})
    command_port: IntProperty(name='MCP command port', default=9878, min=1024, max=65535)
    command_token: StringProperty(name='MCP token', options={'SKIP_SAVE'})
    allow_edits: BoolProperty(name='Allow bounded scene edits', default=False, options={'SKIP_SAVE'})
    last_status: StringProperty(name='Status', default='Not paired', options={'SKIP_SAVE'})


class CRATESHIP_OT_Send(bpy.types.Operator):
    bl_idname = 'crateship.send_selected'
    bl_label = 'Send to Crate Ship'
    bl_description = 'Export the selected objects as a GLB to the paired local bridge'

    def execute(self, context):
        try:
            _export_selected(context.object.name[:80] if context.object else 'Blender export')
            self.report({'INFO'}, 'Selected model sent to Crate Ship')
            return {'FINISHED'}
        except Exception:
            self.report({'ERROR'}, 'Transfer failed. Check pairing, Object Mode, selection and size.')
            return {'CANCELLED'}


class CRATESHIP_OT_Toggle(bpy.types.Operator):
    bl_idname = 'crateship.toggle_commands'
    bl_label = 'Start / Stop MCP Commands'

    def execute(self, context):
        try:
            stop_command_server() if _server else start_command_server()
            return {'FINISHED'}
        except Exception:
            self.report({'ERROR'}, 'Could not start local commands. Check whether the port is in use.')
            return {'CANCELLED'}


class CRATESHIP_PT_Bridge(bpy.types.Panel):
    bl_label = 'Crate Ship Local Bridge'
    bl_idname = 'CRATESHIP_PT_bridge'
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Crate Ship'

    def draw(self, context):
        layout, settings = self.layout, context.window_manager.crateship_bridge
        layout.prop(settings, 'bridge_port')
        layout.prop(settings, 'bridge_token')
        layout.operator('crateship.send_selected')
        layout.label(text=settings.last_status[:60])
        box = layout.box()
        box.label(text='Optional local MCP commands')
        box.prop(settings, 'command_port')
        box.prop(settings, 'allow_edits')
        box.operator('crateship.toggle_commands', text='Stop MCP Commands' if _server else 'Start MCP Commands')
        if _server:
            box.prop(settings, 'command_token')
            box.label(text='Token changes each time commands start.')


_classes = (CRATESHIP_Settings, CRATESHIP_OT_Send, CRATESHIP_OT_Toggle, CRATESHIP_PT_Bridge)


def register():
    for cls in _classes:
        bpy.utils.register_class(cls)
    bpy.types.WindowManager.crateship_bridge = PointerProperty(type=CRATESHIP_Settings)


def unregister():
    stop_command_server()
    if hasattr(bpy.types.WindowManager, 'crateship_bridge'):
        del bpy.types.WindowManager.crateship_bridge
    for cls in reversed(_classes):
        bpy.utils.unregister_class(cls)


if __name__ == '__main__':
    register()
