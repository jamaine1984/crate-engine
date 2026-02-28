"""
CRATE ENGINE — Batch 2: More models (buildings, interiors, creatures, environment)
"""
import bpy
import bmesh
import math
import os
import random

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'web', 'models')
os.makedirs(OUTPUT_DIR, exist_ok=True)
generated = 0

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.meshes:
        if block.users == 0: bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        if block.users == 0: bpy.data.materials.remove(block)

def make_mat(name, color, roughness=0.5, metallic=0.0, emission=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (*[c/255 if c > 1 else c for c in color], 1.0)
        bsdf.inputs['Roughness'].default_value = roughness
        bsdf.inputs['Metallic'].default_value = metallic
        if emission > 0: bsdf.inputs['Emission Strength'].default_value = emission
    return mat

def assign_mat(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)

def export_glb(name):
    global generated
    filepath = os.path.join(OUTPUT_DIR, f'{name}.glb')
    bpy.ops.export_scene.gltf(filepath=filepath, export_format='GLB', use_selection=False, export_apply=True, export_lights=False, export_cameras=False)
    generated += 1
    print(f'[{generated}] {name}.glb')

# ============================================================
# LARGE BUILDINGS / INTERIORS
# ============================================================

def make_church(name):
    clear_scene()
    s = make_mat('stone', (170,165,155), 0.8)
    r = make_mat('roof', (80,60,50), 0.75)
    w = make_mat('wood', (80,50,20), 0.9)
    g = make_mat('glass', (100,150,200), 0.1, 0.2)
    
    # Main body
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,1.5))
    bpy.context.active_object.scale = (2.5,5,3)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, s)
    
    # Roof
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,3.3))
    obj = bpy.context.active_object
    obj.scale = (2.8,5.3,0.1)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(obj, r)
    
    # Tower
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,-2,2.5))
    bpy.context.active_object.scale = (1,1,5)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, s)
    
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.8, depth=1.5, location=(0,-2,5.5))
    bpy.context.active_object.rotation_euler.z = math.pi/4
    assign_mat(bpy.context.active_object, r)
    
    # Door
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,2.51,0.7))
    bpy.context.active_object.scale = (0.6,0.02,1.4)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, w)
    
    # Windows
    for y in [-1.5, 0, 1.5]:
        for x in [-1.2, 1.2]:
            bpy.ops.mesh.primitive_plane_add(size=0.5, location=(x+0.01 if x>0 else x-0.01, y, 2))
            bpy.context.active_object.rotation_euler = (0, math.pi/2 if x>0 else -math.pi/2, 0)
            assign_mat(bpy.context.active_object, g)
    
    export_glb(name)

def make_warehouse(name):
    clear_scene()
    wall = make_mat('wall', (150,140,120), 0.85)
    roof = make_mat('roof', (100,80,60), 0.8)
    
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,2))
    bpy.context.active_object.scale = (4,6,4)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, wall)
    
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,4.2))
    bpy.context.active_object.scale = (4.3,6.3,0.15)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, roof)
    
    # Large door
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,3.01,1.5))
    bpy.context.active_object.scale = (1.5,0.02,3)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, make_mat('door', (70,45,15), 0.9))
    
    export_glb(name)

def make_market_stall(name, color=(180,150,100)):
    clear_scene()
    wood = make_mat('wood', (100,70,30), 0.9)
    cloth = make_mat('cloth', color, 0.9)
    
    # Counter
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0.5))
    bpy.context.active_object.scale = (1.5,0.6,1)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, wood)
    
    # Posts
    for x in [-0.7, 0.7]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.04, depth=2, location=(x, 0, 1.5))
        assign_mat(bpy.context.active_object, wood)
    
    # Awning
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.3, 2.4))
    bpy.context.active_object.scale = (1.6, 1.0, 0.03)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, cloth)
    
    export_glb(name)

def make_blacksmith(name):
    clear_scene()
    stone = make_mat('stone', (100,95,85), 0.85)
    wood = make_mat('wood', (80,50,20), 0.9)
    metal = make_mat('metal', (60,60,65), 0.3, 0.8)
    fire = make_mat('fire', (255,120,20), 0.2, 0.0, 5.0)
    
    # Building
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,1.2))
    bpy.context.active_object.scale = (3,3,2.4)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, stone)
    
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=2.2, depth=1.2, location=(0,0,3.0))
    bpy.context.active_object.rotation_euler.z = math.pi/4
    assign_mat(bpy.context.active_object, wood)
    
    # Forge
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0.8,1.51,0.5))
    bpy.context.active_object.scale = (1,0.02,1)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, stone)
    
    # Anvil
    bpy.ops.mesh.primitive_cube_add(size=1, location=(-0.5, 0, 0.4))
    bpy.context.active_object.scale = (0.25, 0.4, 0.3)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, metal)
    
    # Chimney
    bpy.ops.mesh.primitive_cube_add(size=1, location=(1, -0.8, 2.5))
    bpy.context.active_object.scale = (0.5, 0.5, 2.5)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, stone)
    
    export_glb(name)

def make_stable(name):
    clear_scene()
    wood = make_mat('wood', (110,80,35), 0.9)
    hay = make_mat('hay', (180,160,80), 0.95)
    
    # Open-front stable
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,1))
    bpy.context.active_object.scale = (3,2,2)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, wood)
    
    # Roof
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,2.2))
    bpy.context.active_object.scale = (3.3,2.3,0.1)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, wood)
    
    # Hay bales
    for i in range(3):
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.3, depth=0.5, location=(-1+i*0.7, -0.5, 0.3))
        bpy.context.active_object.rotation_euler.y = math.pi/2
        assign_mat(bpy.context.active_object, hay)
    
    export_glb(name)

def make_watchtower(name):
    clear_scene()
    wood = make_mat('wood', (90,65,25), 0.85)
    
    # Legs
    for x,y in [(-0.5,-0.5),(0.5,-0.5),(-0.5,0.5),(0.5,0.5)]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x,y,2))
        bpy.context.active_object.scale = (0.1,0.1,4)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(bpy.context.active_object, wood)
    
    # Platform
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,3.5))
    bpy.context.active_object.scale = (1.3,1.3,0.08)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, wood)
    
    # Railing
    for x in [-0.6, 0.6]:
        for y in [-0.6, 0.6]:
            bpy.ops.mesh.primitive_cube_add(size=1, location=(x,y,4))
            bpy.context.active_object.scale = (0.04,0.04,1)
            bpy.ops.object.transform_apply(scale=True)
            assign_mat(bpy.context.active_object, wood)
    
    # Roof
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=1, depth=0.8, location=(0,0,4.9))
    bpy.context.active_object.rotation_euler.z = math.pi/4
    assign_mat(bpy.context.active_object, wood)
    
    # Ladder
    for z in range(8):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0.65, 0, z*0.45))
        bpy.context.active_object.scale = (0.02, 0.3, 0.03)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(bpy.context.active_object, wood)
    
    export_glb(name)

def make_dock(name):
    clear_scene()
    wood = make_mat('wood', (100,75,30), 0.9)
    
    # Planks
    for z_i in range(20):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, z_i*0.3 - 3, 0.3))
        bpy.context.active_object.scale = (1.5, 0.28, 0.04)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(bpy.context.active_object, wood)
    
    # Posts
    for y in [-2.5, 0, 2.5]:
        for x in [-0.7, 0.7]:
            bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.06, depth=1, location=(x, y, -0.1))
            assign_mat(bpy.context.active_object, wood)
    
    # Mooring posts
    for y in [-3, 3]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.05, depth=0.8, location=(0.9, y, 0.5))
        assign_mat(bpy.context.active_object, wood)
    
    export_glb(name)

# ============================================================
# ENVIRONMENT PIECES
# ============================================================

def make_lamp_post(name, style='medieval'):
    clear_scene()
    if style == 'medieval':
        m = make_mat('iron', (50,45,40), 0.4, 0.7)
        f = make_mat('fire', (255,180,60), 0.2, 0, 4)
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.04, depth=2.5, location=(0,0,1.25))
        assign_mat(bpy.context.active_object, m)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0.15,0,2.5))
        bpy.context.active_object.scale = (0.3,0.03,0.03)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(bpy.context.active_object, m)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.08, location=(0.3,0,2.35))
        assign_mat(bpy.context.active_object, f)
    else:
        m = make_mat('metal', (40,40,45), 0.3, 0.8)
        l = make_mat('light', (255,240,200), 0.1, 0, 5)
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.05, depth=3.5, location=(0,0,1.75))
        assign_mat(bpy.context.active_object, m)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.12, location=(0,0,3.6))
        assign_mat(bpy.context.active_object, l)
    export_glb(name)

def make_fountain(name):
    clear_scene()
    stone = make_mat('stone', (160,155,145), 0.8)
    water = make_mat('water', (80,160,200), 0.1, 0.2)
    
    # Basin
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=1.2, depth=0.5, location=(0,0,0.25))
    assign_mat(bpy.context.active_object, stone)
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=1.0, depth=0.45, location=(0,0,0.3))
    assign_mat(bpy.context.active_object, water)
    
    # Center pillar
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.15, depth=1.5, location=(0,0,1.0))
    assign_mat(bpy.context.active_object, stone)
    
    # Top bowl
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.4, depth=0.2, location=(0,0,1.8))
    assign_mat(bpy.context.active_object, stone)
    
    export_glb(name)

def make_grave(name, with_cross=True):
    clear_scene()
    stone = make_mat('stone', (130,125,120), 0.85)
    
    if with_cross:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0.5))
        bpy.context.active_object.scale = (0.06,0.04,1)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(bpy.context.active_object, stone)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0.7))
        bpy.context.active_object.scale = (0.4,0.04,0.06)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(bpy.context.active_object, stone)
    else:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0.3))
        bpy.context.active_object.scale = (0.3,0.05,0.6)
        bpy.ops.object.transform_apply(scale=True)
        obj = bpy.context.active_object
        bpy.ops.object.mode_set(mode='EDIT')
        bm = bmesh.from_edit_mesh(obj.data)
        for v in bm.verts:
            if v.co.z > 0.2: v.co.x *= 0.8
        bmesh.update_edit_mesh(obj.data)
        bpy.ops.object.mode_set(mode='OBJECT')
        assign_mat(obj, stone)
    
    export_glb(name)

def make_column(name, style='doric'):
    clear_scene()
    stone = make_mat('marble', (220,215,200), 0.6)
    
    # Base
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.25, depth=0.15, location=(0,0,0.075))
    assign_mat(bpy.context.active_object, stone)
    
    # Shaft
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.18, depth=2.5, location=(0,0,1.4))
    assign_mat(bpy.context.active_object, stone)
    
    # Capital
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.28, depth=0.2, location=(0,0,2.75))
    assign_mat(bpy.context.active_object, stone)
    
    export_glb(name)

def make_statue(name, pose='standing'):
    clear_scene()
    stone = make_mat('bronze', (140,120,70), 0.4, 0.6)
    base = make_mat('base', (80,80,80), 0.8)
    
    # Pedestal
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0.3))
    bpy.context.active_object.scale = (0.6,0.6,0.6)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, base)
    
    # Body
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,1.1))
    bpy.context.active_object.scale = (0.3,0.2,0.7)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, stone)
    
    # Head
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.14, location=(0,0,1.6))
    assign_mat(bpy.context.active_object, stone)
    
    # Arms
    if pose == 'arms_up':
        for x in [-0.2, 0.2]:
            bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.04, depth=0.5, location=(x,0,1.35))
            bpy.context.active_object.rotation_euler.x = -0.5 if x > 0 else 0.5
            assign_mat(bpy.context.active_object, stone)
    else:
        for x in [-0.25, 0.25]:
            bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.04, depth=0.4, location=(x,0,0.95))
            assign_mat(bpy.context.active_object, stone)
    
    export_glb(name)

def make_hay_bale(name):
    clear_scene()
    hay = make_mat('hay', (200,180,80), 0.95)
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.4, depth=0.5, location=(0,0,0.4))
    bpy.context.active_object.rotation_euler.y = math.pi/2
    assign_mat(bpy.context.active_object, hay)
    export_glb(name)

def make_cannon(name):
    clear_scene()
    wood = make_mat('wood', (80,55,20), 0.85)
    metal = make_mat('iron', (50,50,55), 0.3, 0.8)
    
    # Barrel
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.12, depth=1.2, location=(0,0.3,0.45))
    bpy.context.active_object.rotation_euler.x = math.pi/2 - 0.2
    assign_mat(bpy.context.active_object, metal)
    
    # Carriage
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0.2))
    bpy.context.active_object.scale = (0.4,0.8,0.15)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, wood)
    
    # Wheels
    for x in [-0.25, 0.25]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.2, depth=0.04, location=(x,-0.2,0.2))
        bpy.context.active_object.rotation_euler.y = math.pi/2
        assign_mat(bpy.context.active_object, wood)
    
    export_glb(name)

def make_treasure_pile(name):
    clear_scene()
    gold = make_mat('gold', (220,180,30), 0.2, 0.9)
    
    # Pile of coins/gold
    for i in range(20):
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=random.uniform(0.03,0.06), depth=0.015, 
            location=(random.uniform(-0.25,0.25), random.uniform(-0.25,0.25), random.uniform(0,0.2)))
        bpy.context.active_object.rotation_euler = (random.uniform(0,0.3), random.uniform(0,0.3), random.uniform(0,math.pi))
        assign_mat(bpy.context.active_object, gold)
    
    # A few gems
    for i in range(5):
        gem_colors = [(200,30,30),(30,30,200),(30,200,30),(200,50,200),(30,200,200)]
        bpy.ops.mesh.primitive_ico_sphere_add(radius=0.04, subdivisions=1,
            location=(random.uniform(-0.15,0.15), random.uniform(-0.15,0.15), random.uniform(0.05,0.2)))
        assign_mat(bpy.context.active_object, make_mat(f'gem_{i}', gem_colors[i], 0.05, 0.3))
    
    export_glb(name)

def make_ladder(name, h=2):
    clear_scene()
    wood = make_mat('wood', (100,70,30), 0.9)
    
    for x in [-0.15, 0.15]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x,0,h/2))
        bpy.context.active_object.scale = (0.03, 0.03, h)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(bpy.context.active_object, wood)
    
    rungs = int(h / 0.3)
    for i in range(rungs):
        z = 0.2 + i * 0.3
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,z))
        bpy.context.active_object.scale = (0.28, 0.03, 0.02)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(bpy.context.active_object, wood)
    
    export_glb(name)

def make_door(name, color=(70,45,15)):
    clear_scene()
    wood = make_mat('wood', color, 0.85)
    handle = make_mat('handle', (160,140,40), 0.3, 0.7)
    
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,1))
    bpy.context.active_object.scale = (0.8,0.05,2)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, wood)
    
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.03, location=(0.25,0.04,0.9))
    assign_mat(bpy.context.active_object, handle)
    
    export_glb(name)

def make_window(name):
    clear_scene()
    wood = make_mat('frame', (80,50,20), 0.85)
    glass = make_mat('glass', (140,200,240), 0.05, 0.2)
    
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0))
    bpy.context.active_object.scale = (0.6,0.04,0.5)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, wood)
    
    bpy.ops.mesh.primitive_plane_add(size=0.45, location=(0,0.025,0))
    assign_mat(bpy.context.active_object, glass)
    
    # Cross bars
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0.025,0))
    bpy.context.active_object.scale = (0.5,0.01,0.02)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, wood)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0.025,0))
    bpy.context.active_object.scale = (0.02,0.01,0.4)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, wood)
    
    export_glb(name)

# ============================================================
# INTERIOR FURNITURE DETAIL
# ============================================================

def make_wardrobe(name):
    clear_scene()
    wood = make_mat('wood', (90,60,20), 0.85)
    handle = make_mat('handle', (140,120,30), 0.3, 0.7)
    
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,1))
    bpy.context.active_object.scale = (0.8,0.4,2)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, wood)
    
    # Door line
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0.21,1))
    bpy.context.active_object.scale = (0.01,0.01,1.8)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, make_mat('line', (60,40,10), 0.9))
    
    for x in [-0.1, 0.1]:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.02, location=(x,0.22,1))
        assign_mat(bpy.context.active_object, handle)
    
    export_glb(name)

def make_dresser(name):
    clear_scene()
    wood = make_mat('wood', (110,75,30), 0.85)
    handle = make_mat('handle', (140,120,30), 0.3, 0.7)
    
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0.4))
    bpy.context.active_object.scale = (0.7,0.35,0.8)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, wood)
    
    # Drawer lines
    for z in [0.25, 0.5, 0.75]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0.18,z))
        bpy.context.active_object.scale = (0.65,0.005,0.005)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(bpy.context.active_object, make_mat(f'line_{z}', (70,45,15), 0.9))
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.015, location=(0,0.19,z-0.06))
        assign_mat(bpy.context.active_object, handle)
    
    export_glb(name)

def make_cabinet(name):
    clear_scene()
    wood = make_mat('wood', (100,70,25), 0.85)
    glass = make_mat('glass', (180,210,230), 0.1, 0.1)
    
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0.8))
    bpy.context.active_object.scale = (0.8,0.3,1.6)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, wood)
    
    # Glass doors on top half
    bpy.ops.mesh.primitive_plane_add(size=0.6, location=(0,0.16,1.2))
    assign_mat(bpy.context.active_object, glass)
    
    export_glb(name)

def make_cooking_pot(name):
    clear_scene()
    metal = make_mat('iron', (50,50,55), 0.4, 0.7)
    
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.2, depth=0.25, location=(0,0,0.125))
    assign_mat(bpy.context.active_object, metal)
    
    # Handle
    bpy.ops.mesh.primitive_torus_add(major_radius=0.12, minor_radius=0.01, location=(0,0,0.35))
    bpy.context.active_object.rotation_euler.x = math.pi/2
    assign_mat(bpy.context.active_object, metal)
    
    export_glb(name)

def make_rug(name, color=(150,40,40)):
    clear_scene()
    mat = make_mat('rug', color, 0.95)
    
    bpy.ops.mesh.primitive_plane_add(size=1.5, location=(0,0,0.01))
    bpy.context.active_object.scale = (1, 0.7, 1)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, mat)
    
    # Border
    border = make_mat('border', (min(255,color[0]+50), min(255,color[1]+30), min(255,color[2]+30)), 0.9)
    for x in [-0.74, 0.74]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 0, 0.012))
        bpy.context.active_object.scale = (0.02, 1.04, 0.01)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(bpy.context.active_object, border)
    for y in [-0.52, 0.52]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, y, 0.012))
        bpy.context.active_object.scale = (1.5, 0.02, 0.01)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(bpy.context.active_object, border)
    
    export_glb(name)

def make_painting(name, frame_color=(120,80,20)):
    clear_scene()
    frame = make_mat('frame', frame_color, 0.7, 0.3)
    canvas = make_mat('canvas', (random.randint(50,200), random.randint(50,200), random.randint(50,200)), 0.9)
    
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0))
    bpy.context.active_object.scale = (0.5,0.03,0.4)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, frame)
    
    bpy.ops.mesh.primitive_plane_add(size=0.4, location=(0,0.02,0))
    bpy.context.active_object.scale = (1, 0.8, 1)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, canvas)
    
    export_glb(name)

def make_mirror(name):
    clear_scene()
    frame = make_mat('frame', (160,140,40), 0.3, 0.7)
    glass = make_mat('mirror', (200,210,220), 0.02, 0.95)
    
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.3, depth=0.03, location=(0,0,0))
    assign_mat(bpy.context.active_object, frame)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.27, depth=0.02, location=(0,0.02,0))
    assign_mat(bpy.context.active_object, glass)
    
    export_glb(name)

# ============================================================
# GENERATE BATCH 2
# ============================================================

print("\n=== CRATE ENGINE BATCH 2 ===\n")

# Buildings
make_church('church')
make_warehouse('warehouse')
make_blacksmith('blacksmith')
make_stable('stable')
make_watchtower('watchtower')
make_dock('dock')
for i in range(5):
    make_market_stall(f'market_stall_{i:02d}', random.choice([(180,150,100),(150,50,50),(50,50,150),(50,150,50),(200,150,50)]))

# Environment
make_fountain('fountain')
for i in range(5):
    make_grave(f'grave_cross_{i:02d}', True)
for i in range(5):
    make_grave(f'grave_stone_{i:02d}', False)
for i in range(5):
    make_column(f'column_{i:02d}')
make_statue('statue_standing', 'standing')
make_statue('statue_arms_up', 'arms_up')
for i in range(3):
    make_hay_bale(f'hay_bale_{i:02d}')
make_cannon('cannon')
make_treasure_pile('treasure_pile')
make_ladder('ladder_short', 1.5)
make_ladder('ladder_tall', 3)
make_lamp_post('lamp_post_medieval', 'medieval')
make_lamp_post('lamp_post_modern', 'modern')
for i in range(3):
    make_door(f'door_{i:02d}', random.choice([(70,45,15),(50,30,10),(100,60,20)]))
for i in range(3):
    make_window(f'window_{i:02d}')

# Interior furniture
for i in range(3):
    make_wardrobe(f'wardrobe_{i:02d}')
for i in range(3):
    make_dresser(f'dresser_{i:02d}')
for i in range(3):
    make_cabinet(f'cabinet_{i:02d}')
make_cooking_pot('cooking_pot')
for i in range(5):
    c = random.choice([(150,40,40),(40,40,150),(40,120,40),(150,100,40),(100,40,100)])
    make_rug(f'rug_{i:02d}', c)
for i in range(5):
    make_painting(f'painting_{i:02d}')
make_mirror('mirror')

print(f"\n✅ BATCH 2 TOTAL: {generated}")
