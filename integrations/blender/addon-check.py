"""Standard-library checks of addon transport and validation using an explicit fake bpy.

These checks do not verify Blender's exporter or user interface. The separate
headless-check.py must run in a real Blender executable for that integration.
"""
import importlib.util
import json
import os
import struct
import sys
import threading
import time
import types
import http.client

class Objects(dict):
    def __iter__(self):
        return iter(self.values())

class Object:
    def __init__(self):
        self.name, self.type = 'Cube', 'MESH'
        self.location, self.rotation_euler, self.scale = [0, 0, 0], [0, 0, 0], [1, 1, 1]
        self.data = types.SimpleNamespace(polygons=[0] * 6)

    def select_get(self):
        return True

cube = Object()
objects = Objects(Cube=cube)
settings = types.SimpleNamespace(bridge_port=int(os.environ['CRATESHIP_TEST_BRIDGE_PORT']),
    bridge_token=os.environ['CRATESHIP_TEST_BRIDGE_TOKEN'], command_port=9878, command_token='', allow_edits=False, last_status='')
timers = set()
bpy = types.ModuleType('bpy')
props = types.ModuleType('bpy.props')
for name in ['BoolProperty', 'IntProperty', 'StringProperty', 'PointerProperty']:
    setattr(props, name, lambda **kwargs: None)
bpy.props = props
bpy.types = types.SimpleNamespace(PropertyGroup=type('PropertyGroup', (), {}), Operator=type('Operator', (), {}), Panel=type('Panel', (), {}), WindowManager=type('WindowManager', (), {}))
bpy.utils = types.SimpleNamespace(register_class=lambda cls: None, unregister_class=lambda cls: None)
bpy.app = types.SimpleNamespace(timers=types.SimpleNamespace(is_registered=lambda fn: fn in timers, register=lambda fn, **kw: timers.add(fn), unregister=lambda fn: timers.discard(fn)))
bpy.context = types.SimpleNamespace(window_manager=types.SimpleNamespace(crateship_bridge=settings), scene=types.SimpleNamespace(name='Mock scene', objects=objects), selected_objects=[cube], mode='OBJECT', object=cube)
bpy.data = types.SimpleNamespace(objects=objects)

def export_gltf(**options):
    assert options['export_format'] == 'GLB' and options['use_selection'] is True
    assert options['will_save_settings'] is False and options['export_extras'] is False
    data = json.dumps({'asset': {'version': '2.0'}, 'scenes': [{'nodes': []}], 'scene': 0}).encode()
    data += b' ' * (-len(data) % 4)
    with open(options['filepath'], 'wb') as target:
        target.write(struct.pack('<IIIII', 0x46546c67, 2, 20 + len(data), len(data), 0x4e4f534a) + data)
    return {'FINISHED'}

bpy.ops = types.SimpleNamespace(export_scene=types.SimpleNamespace(gltf=export_gltf))
sys.modules['bpy'] = bpy
sys.modules['bpy.props'] = props
spec = importlib.util.spec_from_file_location('crateship_test_addon', os.path.join(os.path.dirname(__file__), 'crateship_blender.py'))
addon = importlib.util.module_from_spec(spec)
spec.loader.exec_module(addon)
addon.register()

def rejected(command, args):
    try:
        addon.dispatch_command(command, args)
    except ValueError:
        return
    raise AssertionError('Unsafe command accepted: ' + command)

try:
    assert addon.dispatch_command('get_scene_info', {})['objectCount'] == 1
    rejected('execute_python', {'code': 'pass'})
    rejected('get_scene_info', {'path': 'C:/private'})
    rejected('export_selected', {'name': '../file'})
    rejected('apply_object_operations', {'operations': [{'operation': 'transform', 'name': 'Cube', 'location': [1, 2, 3]}]})
    settings.allow_edits = True
    for operation in [{'operation': 'delete', 'name': 'Cube'}, {'operation': 'transform', 'name': 'Cube', 'location': [float('nan'), 0, 0]},
                      {'operation': 'transform', 'name': 'Cube', 'scale': [-1, 1, 1]}, {'operation': 'add_primitive', 'name': 'Code', 'primitive': 'SCRIPT'}]:
        rejected('apply_object_operations', {'operations': [operation]})
    assert cube.location == [0, 0, 0]
    addon.dispatch_command('apply_object_operations', {'operations': [{'operation': 'transform', 'name': 'Cube', 'location': [1, 2, 3]}]})
    assert cube.location == [1, 2, 3]
    exported = addon.dispatch_command('export_selected', {'name': 'Python transfer test'})
    assert exported['asset']['size'] > 20
    assert len(addon.dispatch_command('list_assets', {})['assets']) == 1
    # bpy access is rejected from every non-main thread.
    thread_result = []
    def wrong_thread():
        try:
            addon.dispatch_command('get_scene_info', {})
        except ValueError:
            thread_result.append('blocked')
    thread = threading.Thread(target=wrong_thread)
    thread.start()
    thread.join()
    assert thread_result == ['blocked']

    port = addon.start_command_server(0)
    token = settings.command_token
    results = []
    def http_checks():
        for extra, command in [({'Origin': 'null'}, 'get_scene_info'), ({'Host': 'evil.test'}, 'get_scene_info'),
                               ({'Authorization': 'Bearer wrong'}, 'get_scene_info'), ({}, 'execute_python'), ({}, 'get_scene_info')]:
            connection = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
            headers = {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
            headers.update(extra)
            connection.request('POST', '/command', json.dumps({'command': command, 'arguments': {}}), headers)
            response = connection.getresponse()
            results.append(response.status)
            response.read()
            connection.close()
    thread = threading.Thread(target=http_checks)
    thread.start()
    deadline = time.monotonic() + 10
    while thread.is_alive() and time.monotonic() < deadline:
        addon._drain_commands()
        time.sleep(.01)
    thread.join(timeout=1)
    assert results == [403, 403, 401, 400, 200], results
    addon.stop_command_server()
    second_port = addon.start_command_server(0)
    assert settings.command_token != token
    print('CRATESHIP_ADDON_MOCK_OK ' + json.dumps({'nativeGuards': results, 'mainThreadGuard': True, 'explicitFakeBpy': True}))
finally:
    addon.unregister()
