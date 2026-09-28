"""Opt-in integration check. Run only in factory-startup background Blender.

Never loads or saves a user scene, startup file or preferences. Expects a separately
started paired Node asset bridge and receives its token through the environment.
"""
import importlib.util
import json
import os
import threading
import time
import http.client
import bpy

path = os.path.join(os.path.dirname(__file__), 'crateship_blender.py')
spec = importlib.util.spec_from_file_location('crateship_integration_addon', path)
addon = importlib.util.module_from_spec(spec)
spec.loader.exec_module(addon)
addon.register()
try:
    settings = bpy.context.window_manager.crateship_bridge
    settings.bridge_port = int(os.environ['CRATESHIP_TEST_BRIDGE_PORT'])
    settings.bridge_token = os.environ['CRATESHIP_TEST_BRIDGE_TOKEN']
    before = addon.dispatch_command('get_scene_info', {})
    assert before['objectCount'] == 3, 'Factory scene expected'
    assert any(x['name'] == 'Cube' and x['selected'] for x in before['objects'])
    for command, args in [('execute_python', {'code': 'pass'}), ('get_scene_info', {'path': 'arbitrary'}),
                          ('apply_object_operations', {'operations': [{'operation': 'transform', 'name': 'Cube', 'location': [1, 2, 3]}]})]:
        try:
            addon.dispatch_command(command, args)
            raise AssertionError('Unsafe command unexpectedly accepted')
        except ValueError:
            pass
    settings.allow_edits = True
    addon.dispatch_command('apply_object_operations', {'operations': [{'operation': 'transform', 'name': 'Cube', 'location': [1, 2, 3]}]})
    assert list(bpy.data.objects['Cube'].location) == [1, 2, 3]
    exported = addon.dispatch_command('export_selected', {'name': 'Headless test cube'})
    assert exported['asset']['size'] > 100 and len(exported['asset']['sha256']) == 64
    assert len(addon.dispatch_command('list_assets', {})['assets']) == 1
    addon.dispatch_command('apply_object_operations', {'operations': [{'operation': 'add_primitive', 'name': 'Bridge Test Plane', 'primitive': 'PLANE', 'scale': [2, 2, 2]}]})
    assert bpy.context.scene.objects.get('Bridge Test Plane')
    port = addon.start_command_server(0)

    # No bpy calls in the request thread: copy credentials before starting it.
    command_token = settings.command_token
    results = []

    def http_checks():
        for extra in [{'Origin': 'http://127.0.0.1:4173'}, {'Host': 'attacker.invalid'}, {'Authorization': 'Bearer wrong'}]:
            connection = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
            headers = {'Authorization': 'Bearer ' + command_token, 'Content-Type': 'application/json'}
            headers.update(extra)
            connection.request('POST', '/command', json.dumps({'command': 'get_scene_info', 'arguments': {}}), headers)
            response = connection.getresponse()
            results.append(response.status)
            response.read()
            connection.close()
        connection = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
        connection.request('POST', '/command', json.dumps({'command': 'get_scene_info', 'arguments': {}}), {'Authorization': 'Bearer ' + command_token, 'Content-Type': 'application/json'})
        response = connection.getresponse()
        results.append(response.status)
        results.append(json.loads(response.read())['result']['objectCount'])
        connection.close()

    thread = threading.Thread(target=http_checks)
    thread.start()
    deadline = time.monotonic() + 10
    while thread.is_alive() and time.monotonic() < deadline:
        addon._drain_commands()  # The headless script occupies Blender's main event loop.
        time.sleep(.01)
    thread.join(timeout=1)
    assert results == [403, 403, 401, 200, 4], results
    print('CRATESHIP_HEADLESS_OK ' + json.dumps({'asset': exported['asset'], 'objectCount': 4, 'nativeGuards': results[:4]}))
finally:
    addon.unregister()
