"""
CRATE ENGINE — Procedural 3D Model Generator
Generates game-ready GLB models using Blender Python API
Run: blender --background --python generate_models.py
"""
import bpy
import bmesh
import math
import os
import random
import sys

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'web', 'models')
os.makedirs(OUTPUT_DIR, exist_ok=True)

generated = 0

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for c in bpy.data.collections:
        if c.name != 'Scene Collection' and c.name != 'Collection':
            bpy.data.collections.remove(c)
    for block in bpy.data.meshes:
        if block.users == 0: bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        if block.users == 0: bpy.data.materials.remove(block)

def make_mat(name, color, roughness=0.5, metallic=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (*[c/255 if c > 1 else c for c in color], 1.0)
        bsdf.inputs['Roughness'].default_value = roughness
        bsdf.inputs['Metallic'].default_value = metallic
    return mat

def assign_mat(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)

def export_glb(name):
    global generated
    filepath = os.path.join(OUTPUT_DIR, f'{name}.glb')
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
        export_lights=False,
        export_cameras=False,
    )
    generated += 1
    print(f'[{generated}] Exported: {name}.glb')

def join_all():
    """Join all mesh objects into one"""
    bpy.ops.object.select_all(action='DESELECT')
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not meshes: return
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()

# ============================================================
# HOUSES & BUILDINGS
# ============================================================

def make_simple_house(name, w=2, d=2, h=1.8, roof_h=0.8, wall_color=(139,115,85), roof_color=(139,26,26)):
    clear_scene()
    wall_mat = make_mat('wall', wall_color, 0.85)
    roof_mat = make_mat('roof', roof_color, 0.7)
    door_mat = make_mat('door', (58,42,16), 0.9)
    glass_mat = make_mat('glass', (136,204,255), 0.1, 0.3)
    
    # Walls
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, h/2))
    walls = bpy.context.active_object
    walls.scale = (w, d, h)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(walls, wall_mat)
    
    # Roof (cone)
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=w*0.9, depth=roof_h, location=(0, 0, h + roof_h/2))
    roof = bpy.context.active_object
    roof.rotation_euler.z = math.pi/4
    assign_mat(roof, roof_mat)
    
    # Door
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, d/2 + 0.01, 0.45))
    door = bpy.context.active_object
    door.scale = (0.4, 0.02, 0.9)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(door, door_mat)
    
    # Windows
    for x in [-w*0.3, w*0.3]:
        bpy.ops.mesh.primitive_plane_add(size=0.35, location=(x, d/2 + 0.02, h*0.6))
        win = bpy.context.active_object
        win.rotation_euler.x = math.pi/2
        assign_mat(win, glass_mat)
    
    export_glb(name)

def make_medieval_house(name, variant=0):
    colors = [
        ((139,115,85), (139,26,26)),   # brown/red
        ((180,160,120), (60,60,80)),    # tan/slate
        ((200,180,140), (80,40,20)),    # cream/dark brown
        ((160,140,100), (40,80,40)),    # olive/green
        ((120,100,80), (100,30,30)),    # dark/maroon
    ]
    wc, rc = colors[variant % len(colors)]
    w = 1.5 + random.random() * 1.5
    d = 1.5 + random.random() * 1.5
    h = 1.5 + random.random() * 1.0
    make_simple_house(name, w, d, h, 0.6 + random.random()*0.4, wc, rc)

def make_cottage(name):
    clear_scene()
    wall_mat = make_mat('wall', (200,180,140), 0.9)
    roof_mat = make_mat('thatch', (140,120,60), 0.95)
    wood_mat = make_mat('wood', (80,50,20), 0.9)
    
    # Round-ish cottage (octagonal base)
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=1.2, depth=1.5, location=(0,0,0.75))
    assign_mat(bpy.context.active_object, wall_mat)
    
    # Thatched roof
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=1.5, depth=1.0, location=(0,0,2.0))
    assign_mat(bpy.context.active_object, roof_mat)
    
    # Door
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 1.21, 0.4))
    d = bpy.context.active_object
    d.scale = (0.35, 0.02, 0.8)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(d, wood_mat)
    
    export_glb(name)

def make_tower(name, h=5, r=0.8):
    clear_scene()
    stone_mat = make_mat('stone', (130,130,140), 0.8)
    roof_mat = make_mat('roof', (60,60,100), 0.6)
    
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=r, depth=h, location=(0,0,h/2))
    assign_mat(bpy.context.active_object, stone_mat)
    
    # Cone roof
    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=r*1.3, depth=1.5, location=(0,0,h+0.75))
    assign_mat(bpy.context.active_object, roof_mat)
    
    # Battlements
    for i in range(8):
        angle = i * math.pi * 2 / 8
        x = math.cos(angle) * (r + 0.05)
        y = math.sin(angle) * (r + 0.05)
        bpy.ops.mesh.primitive_cube_add(size=0.2, location=(x, y, h + 0.1))
        assign_mat(bpy.context.active_object, stone_mat)
    
    export_glb(name)

def make_castle_wall(name, length=6):
    clear_scene()
    stone_mat = make_mat('stone', (130,130,140), 0.8)
    
    # Wall body
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,1.5))
    w = bpy.context.active_object
    w.scale = (length, 0.5, 3)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(w, stone_mat)
    
    # Battlements
    for i in range(int(length * 2)):
        x = -length/2 + 0.25 + i * 0.5
        if i % 2 == 0:
            bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 0, 3.25))
            b = bpy.context.active_object
            b.scale = (0.2, 0.55, 0.5)
            bpy.ops.object.transform_apply(scale=True)
            assign_mat(b, stone_mat)
    
    export_glb(name)

def make_castle_gate(name):
    clear_scene()
    stone_mat = make_mat('stone', (120,120,130), 0.8)
    wood_mat = make_mat('wood', (60,40,15), 0.9)
    
    # Two pillars
    for x in [-1.2, 1.2]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 0, 2.5))
        p = bpy.context.active_object
        p.scale = (0.6, 0.6, 5)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(p, stone_mat)
    
    # Arch top
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 4.5))
    t = bpy.context.active_object
    t.scale = (3, 0.6, 1)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(t, stone_mat)
    
    # Gate doors
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.31, 1.75))
    g = bpy.context.active_object
    g.scale = (1.8, 0.05, 3.5)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(g, wood_mat)
    
    export_glb(name)

def make_windmill(name):
    clear_scene()
    stone_mat = make_mat('stone', (180,170,150), 0.85)
    wood_mat = make_mat('wood', (80,50,20), 0.9)
    roof_mat = make_mat('roof', (100,40,20), 0.75)
    
    # Tapered body
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=1.5, radius2=1.0, depth=4, location=(0,0,2))
    assign_mat(bpy.context.active_object, stone_mat)
    
    # Roof
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=1.2, depth=1.2, location=(0,0,4.6))
    assign_mat(bpy.context.active_object, roof_mat)
    
    # Blades (cross shape)
    for rot in [0, math.pi/2]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 1.51, 3.5))
        blade = bpy.context.active_object
        blade.scale = (0.15, 0.03, 2.5)
        blade.rotation_euler.y = rot
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        assign_mat(blade, wood_mat)
    
    export_glb(name)

def make_bridge(name, length=4):
    clear_scene()
    wood_mat = make_mat('wood', (100,70,30), 0.9)
    rope_mat = make_mat('rope', (140,120,80), 0.95)
    
    # Planks
    for i in range(int(length * 4)):
        x = -length/2 + 0.125 + i * 0.25
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 0, 0))
        p = bpy.context.active_object
        p.scale = (0.22, 1.0, 0.05)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(p, wood_mat)
    
    # Rails
    for y in [-0.5, 0.5]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, y, 0.5))
        r = bpy.context.active_object
        r.scale = (length, 0.03, 0.03)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(r, rope_mat)
        # Posts
        for x in [-length/2, 0, length/2]:
            bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, 0.25))
            po = bpy.context.active_object
            po.scale = (0.05, 0.05, 0.5)
            bpy.ops.object.transform_apply(scale=True)
            assign_mat(po, wood_mat)
    
    export_glb(name)

def make_well(name):
    clear_scene()
    stone_mat = make_mat('stone', (140,140,140), 0.85)
    wood_mat = make_mat('wood', (80,50,20), 0.9)
    roof_mat = make_mat('roof', (100,60,30), 0.8)
    
    # Stone ring
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.5, depth=0.8, location=(0,0,0.4))
    ring = bpy.context.active_object
    assign_mat(ring, stone_mat)
    # Inner hole
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.35, depth=0.85, location=(0,0,0.4))
    assign_mat(bpy.context.active_object, make_mat('dark', (20,20,20), 1.0))
    
    # Support posts
    for x in [-0.4, 0.4]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 0, 1.2))
        p = bpy.context.active_object
        p.scale = (0.06, 0.06, 1.6)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(p, wood_mat)
    
    # Roof
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.7, depth=0.4, location=(0, 0, 2.1))
    bpy.context.active_object.rotation_euler.z = math.pi/4
    assign_mat(bpy.context.active_object, roof_mat)
    
    export_glb(name)

# ============================================================
# NATURE & VEGETATION
# ============================================================

def make_tree(name, trunk_h=2.0, crown_r=1.2, crown_type='sphere'):
    clear_scene()
    trunk_mat = make_mat('trunk', (80+random.randint(-20,20), 50+random.randint(-10,10), 20+random.randint(-10,10)), 0.9)
    leaf_mat = make_mat('leaves', (30+random.randint(-15,30), 120+random.randint(-30,40), 20+random.randint(-10,20)), 0.85)
    
    # Trunk
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.15, depth=trunk_h, location=(0,0,trunk_h/2))
    assign_mat(bpy.context.active_object, trunk_mat)
    
    # Crown
    if crown_type == 'sphere':
        bpy.ops.mesh.primitive_uv_sphere_add(radius=crown_r, segments=12, ring_count=8, location=(0,0,trunk_h + crown_r*0.6))
    elif crown_type == 'cone':
        bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=crown_r, depth=crown_r*2, location=(0,0,trunk_h + crown_r*0.8))
    elif crown_type == 'layers':
        for i in range(3):
            r = crown_r * (1 - i*0.25)
            bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=r, depth=crown_r*0.7, location=(0,0,trunk_h + i*crown_r*0.5))
            assign_mat(bpy.context.active_object, leaf_mat)
        export_glb(name)
        return
    assign_mat(bpy.context.active_object, leaf_mat)
    export_glb(name)

def make_palm_tree(name):
    clear_scene()
    trunk_mat = make_mat('trunk', (120,90,40), 0.9)
    leaf_mat = make_mat('palm_leaf', (40,140,30), 0.8)
    
    # Curved trunk (several segments)
    for i in range(8):
        t = i / 7
        x = math.sin(t * 0.5) * 0.3
        z = t * 3.0
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.12 - t*0.04, depth=0.45, location=(x, 0, z))
        seg = bpy.context.active_object
        seg.rotation_euler.y = math.sin(t * 0.5) * 0.15
        assign_mat(seg, trunk_mat)
    
    # Palm fronds (flat elongated shapes)
    for i in range(6):
        angle = i * math.pi * 2 / 6
        bpy.ops.mesh.primitive_cube_add(size=1, location=(math.cos(angle)*0.8, math.sin(angle)*0.8, 3.2))
        frond = bpy.context.active_object
        frond.scale = (0.15, 1.2, 0.02)
        frond.rotation_euler = (math.cos(angle)*0.6, math.sin(angle)*0.6, angle)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(frond, leaf_mat)
    
    export_glb(name)

def make_pine_tree(name, h=3):
    clear_scene()
    trunk_mat = make_mat('trunk', (90,60,25), 0.9)
    leaf_mat = make_mat('pine', (20,80+random.randint(-20,20),15), 0.85)
    
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.1, depth=h*0.6, location=(0,0,h*0.3))
    assign_mat(bpy.context.active_object, trunk_mat)
    
    for i in range(4):
        r = 0.8 - i*0.15
        z = h*0.4 + i * h*0.18
        bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=r, depth=h*0.25, location=(0,0,z))
        assign_mat(bpy.context.active_object, leaf_mat)
    
    export_glb(name)

def make_bush(name, r=0.4):
    clear_scene()
    leaf_mat = make_mat('bush', (30+random.randint(0,30), 100+random.randint(0,50), 20), 0.85)
    
    for i in range(3):
        ox = random.uniform(-0.15, 0.15)
        oy = random.uniform(-0.15, 0.15)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r*random.uniform(0.7,1.0), segments=8, ring_count=6, location=(ox, oy, r*0.8))
        assign_mat(bpy.context.active_object, leaf_mat)
    
    export_glb(name)

def make_rock(name, scale=1.0):
    clear_scene()
    rock_mat = make_mat('rock', (120+random.randint(-30,30), 115+random.randint(-30,30), 110+random.randint(-30,30)), 0.9)
    
    bpy.ops.mesh.primitive_ico_sphere_add(radius=0.5*scale, subdivisions=2, location=(0,0,0.3*scale))
    rock = bpy.context.active_object
    rock.scale = (random.uniform(0.8,1.3), random.uniform(0.8,1.3), random.uniform(0.5,0.8))
    bpy.ops.object.transform_apply(scale=True)
    
    # Distort vertices
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(rock.data)
    for v in bm.verts:
        v.co.x += random.uniform(-0.1, 0.1) * scale
        v.co.y += random.uniform(-0.1, 0.1) * scale
        v.co.z += random.uniform(-0.05, 0.05) * scale
    bmesh.update_edit_mesh(rock.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.shade_smooth()
    assign_mat(rock, rock_mat)
    
    export_glb(name)

def make_flower(name, color=(255,100,100)):
    clear_scene()
    stem_mat = make_mat('stem', (40,120,20), 0.8)
    petal_mat = make_mat('petal', color, 0.7)
    center_mat = make_mat('center', (255,200,50), 0.6)
    
    # Stem
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.02, depth=0.5, location=(0,0,0.25))
    assign_mat(bpy.context.active_object, stem_mat)
    
    # Petals
    for i in range(6):
        angle = i * math.pi * 2 / 6
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.08, segments=6, ring_count=4, location=(math.cos(angle)*0.08, math.sin(angle)*0.08, 0.52))
        p = bpy.context.active_object
        p.scale.z = 0.3
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(p, petal_mat)
    
    # Center
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.05, segments=6, ring_count=4, location=(0,0,0.52))
    assign_mat(bpy.context.active_object, center_mat)
    
    export_glb(name)

def make_mushroom(name, color=(200,50,50)):
    clear_scene()
    stem_mat = make_mat('stem', (230,220,200), 0.9)
    cap_mat = make_mat('cap', color, 0.7)
    
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.08, depth=0.3, location=(0,0,0.15))
    assign_mat(bpy.context.active_object, stem_mat)
    
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.2, segments=10, ring_count=6, location=(0,0,0.35))
    cap = bpy.context.active_object
    cap.scale.z = 0.4
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(cap, cap_mat)
    
    export_glb(name)

def make_log(name):
    clear_scene()
    wood_mat = make_mat('wood', (100,70,30), 0.9)
    ring_mat = make_mat('ring', (140,110,60), 0.85)
    
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.2, depth=1.5, location=(0,0,0.2))
    log = bpy.context.active_object
    log.rotation_euler.y = math.pi/2
    bpy.ops.object.transform_apply(rotation=True)
    assign_mat(log, wood_mat)
    
    # End rings
    for x in [-0.75, 0.75]:
        bpy.ops.mesh.primitive_circle_add(vertices=10, radius=0.19, location=(x, 0, 0.2))
        bpy.ops.object.convert(target='MESH')
        assign_mat(bpy.context.active_object, ring_mat)
    
    export_glb(name)

def make_stump(name):
    clear_scene()
    wood_mat = make_mat('wood', (90,60,25), 0.9)
    
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.3, depth=0.4, location=(0,0,0.2))
    stump = bpy.context.active_object
    # Distort top
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(stump.data)
    for v in bm.verts:
        if v.co.z > 0.15:
            v.co.z += random.uniform(-0.05, 0.05)
    bmesh.update_edit_mesh(stump.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    assign_mat(stump, wood_mat)
    
    export_glb(name)

def make_cactus(name):
    clear_scene()
    cactus_mat = make_mat('cactus', (50,120,40), 0.8)
    
    # Main body
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.2, depth=1.5, location=(0,0,0.75))
    assign_mat(bpy.context.active_object, cactus_mat)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.2, location=(0,0,1.55))
    assign_mat(bpy.context.active_object, cactus_mat)
    
    # Arms
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.12, depth=0.5, location=(0.3, 0, 0.8))
    arm = bpy.context.active_object
    arm.rotation_euler.y = math.pi/3
    bpy.ops.object.transform_apply(rotation=True)
    assign_mat(arm, cactus_mat)
    
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.12, depth=0.4, location=(0.45, 0, 1.0))
    arm2 = bpy.context.active_object
    assign_mat(arm2, cactus_mat)
    
    export_glb(name)

# ============================================================
# FURNITURE
# ============================================================

def make_table(name, w=1.0, d=0.6, h=0.75):
    clear_scene()
    wood_mat = make_mat('wood', (100+random.randint(-20,20), 70+random.randint(-10,10), 30+random.randint(-10,10)), 0.85)
    
    # Top
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,h))
    t = bpy.context.active_object
    t.scale = (w, d, 0.04)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(t, wood_mat)
    
    # Legs
    for x, y in [(-w/2+0.05, -d/2+0.05), (w/2-0.05, -d/2+0.05), (-w/2+0.05, d/2-0.05), (w/2-0.05, d/2-0.05)]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, h/2))
        leg = bpy.context.active_object
        leg.scale = (0.04, 0.04, h)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(leg, wood_mat)
    
    export_glb(name)

def make_chair(name):
    clear_scene()
    wood_mat = make_mat('wood', (90,60,25), 0.85)
    
    # Seat
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0.45))
    s = bpy.context.active_object
    s.scale = (0.4, 0.4, 0.04)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(s, wood_mat)
    
    # Legs
    for x, y in [(-0.17,-0.17),(0.17,-0.17),(-0.17,0.17),(0.17,0.17)]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, 0.225))
        bpy.context.active_object.scale = (0.03, 0.03, 0.45)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(bpy.context.active_object, wood_mat)
    
    # Back
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.18, 0.7))
    b = bpy.context.active_object
    b.scale = (0.36, 0.03, 0.5)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(b, wood_mat)
    
    export_glb(name)

def make_bed(name, color=(200,200,220)):
    clear_scene()
    wood_mat = make_mat('frame', (80,50,20), 0.9)
    sheet_mat = make_mat('sheet', color, 0.95)
    pillow_mat = make_mat('pillow', (240,240,240), 0.95)
    
    # Frame
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0.2))
    bpy.context.active_object.scale = (0.9, 1.8, 0.25)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, wood_mat)
    
    # Mattress
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0.4))
    bpy.context.active_object.scale = (0.85, 1.7, 0.12)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, sheet_mat)
    
    # Pillow
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,-0.65,0.52))
    bpy.context.active_object.scale = (0.6, 0.25, 0.08)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, pillow_mat)
    
    # Headboard
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,-0.9,0.55))
    bpy.context.active_object.scale = (0.9, 0.04, 0.7)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, wood_mat)
    
    export_glb(name)

def make_bookshelf(name):
    clear_scene()
    wood_mat = make_mat('wood', (80,50,20), 0.9)
    
    # Frame
    w, d, h = 0.8, 0.25, 1.5
    # Sides
    for x in [-w/2, w/2]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 0, h/2))
        bpy.context.active_object.scale = (0.03, d, h)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(bpy.context.active_object, wood_mat)
    
    # Shelves
    for y in [0.02, 0.38, 0.76, 1.14, 1.48]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, y))
        bpy.context.active_object.scale = (w, d, 0.03)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(bpy.context.active_object, wood_mat)
    
    # Books on shelves
    book_colors = [(180,30,30),(30,30,180),(30,130,30),(180,180,30),(130,30,130),(30,130,130),(180,100,30)]
    for shelf_y in [0.1, 0.48, 0.86, 1.24]:
        x = -w/2 + 0.08
        while x < w/2 - 0.05:
            bw = random.uniform(0.03, 0.06)
            bh = random.uniform(0.15, 0.25)
            c = random.choice(book_colors)
            bpy.ops.mesh.primitive_cube_add(size=1, location=(x+bw/2, 0, shelf_y+bh/2))
            bpy.context.active_object.scale = (bw, d*0.7, bh)
            bpy.ops.object.transform_apply(scale=True)
            assign_mat(bpy.context.active_object, make_mat(f'book_{x}', c, 0.8))
            x += bw + 0.01
    
    export_glb(name)

def make_barrel(name):
    clear_scene()
    wood_mat = make_mat('wood', (120,80,30), 0.85)
    band_mat = make_mat('band', (80,80,80), 0.4, 0.6)
    
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.3, depth=0.8, location=(0,0,0.4))
    barrel = bpy.context.active_object
    # Bulge (scale middle wider)
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(barrel.data)
    for v in bm.verts:
        dist = 1 - abs(v.co.z) / 0.4
        v.co.x *= 1 + dist * 0.15
        v.co.y *= 1 + dist * 0.15
    bmesh.update_edit_mesh(barrel.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    assign_mat(barrel, wood_mat)
    
    # Bands
    for z in [0.15, 0.4, 0.65]:
        bpy.ops.mesh.primitive_torus_add(major_radius=0.32, minor_radius=0.01, location=(0,0,z))
        assign_mat(bpy.context.active_object, band_mat)
    
    export_glb(name)

def make_crate(name):
    clear_scene()
    wood_mat = make_mat('wood', (140,100,50), 0.9)
    
    bpy.ops.mesh.primitive_cube_add(size=0.6, location=(0,0,0.3))
    assign_mat(bpy.context.active_object, wood_mat)
    
    # Cross planks
    for axis in ['x', 'z']:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.31, 0.3))
        p = bpy.context.active_object
        if axis == 'x':
            p.scale = (0.58, 0.01, 0.06)
        else:
            p.scale = (0.06, 0.01, 0.58)
            p.rotation_euler.z = math.pi/4
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(p, make_mat(f'plank_{axis}', (120,85,35), 0.9))
    
    export_glb(name)

def make_chest(name):
    clear_scene()
    wood_mat = make_mat('wood', (100,65,20), 0.85)
    band_mat = make_mat('band', (180,160,40), 0.3, 0.7)
    
    # Base
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0.2))
    bpy.context.active_object.scale = (0.5, 0.3, 0.3)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, wood_mat)
    
    # Lid (half cylinder)
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.25, depth=0.5, location=(0,0,0.4))
    lid = bpy.context.active_object
    lid.rotation_euler.y = math.pi/2
    lid.scale.z = 0.5
    bpy.ops.object.transform_apply(rotation=True, scale=True)
    # Delete bottom half
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(lid.data)
    verts_to_del = [v for v in bm.verts if v.co.z < -0.01]
    bmesh.ops.delete(bm, geom=verts_to_del, context='VERTS')
    bmesh.update_edit_mesh(lid.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    lid.location.z = 0.35
    assign_mat(lid, wood_mat)
    
    # Metal bands
    for x in [-0.15, 0.15]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 0, 0.2))
        bpy.context.active_object.scale = (0.02, 0.32, 0.35)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(bpy.context.active_object, band_mat)
    
    # Lock
    bpy.ops.mesh.primitive_cube_add(size=0.06, location=(0, 0.16, 0.3))
    assign_mat(bpy.context.active_object, band_mat)
    
    export_glb(name)

def make_torch(name):
    clear_scene()
    wood_mat = make_mat('wood', (80,50,20), 0.9)
    fire_mat = make_mat('fire', (255,150,30), 0.3, 0.0)
    fire_mat.use_nodes = True
    bsdf = fire_mat.node_tree.nodes.get('Principled BSDF')
    if bsdf: bsdf.inputs['Emission Strength'].default_value = 5.0
    
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.03, depth=0.8, location=(0,0,0.4))
    assign_mat(bpy.context.active_object, wood_mat)
    
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.06, depth=0.15, location=(0,0,0.85))
    assign_mat(bpy.context.active_object, fire_mat)
    
    export_glb(name)

def make_lantern(name):
    clear_scene()
    metal_mat = make_mat('metal', (60,60,60), 0.4, 0.8)
    glass_mat = make_mat('glass', (255,220,150), 0.1, 0.0)
    glass_mat.use_nodes = True
    bsdf = glass_mat.node_tree.nodes.get('Principled BSDF')
    if bsdf: bsdf.inputs['Emission Strength'].default_value = 3.0
    
    # Frame
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.1, depth=0.03, location=(0,0,0))
    assign_mat(bpy.context.active_object, metal_mat)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.1, depth=0.03, location=(0,0,0.3))
    assign_mat(bpy.context.active_object, metal_mat)
    
    # Glass body
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.08, depth=0.28, location=(0,0,0.15))
    assign_mat(bpy.context.active_object, glass_mat)
    
    # Handle
    bpy.ops.mesh.primitive_torus_add(major_radius=0.06, minor_radius=0.008, location=(0,0,0.35))
    assign_mat(bpy.context.active_object, metal_mat)
    
    export_glb(name)

# ============================================================
# WEAPONS
# ============================================================

def make_sword(name, blade_l=0.8, color=(180,180,200)):
    clear_scene()
    blade_mat = make_mat('blade', color, 0.2, 0.9)
    guard_mat = make_mat('guard', (160,140,40), 0.3, 0.8)
    grip_mat = make_mat('grip', (60,30,10), 0.9)
    
    # Blade
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,blade_l/2 + 0.15))
    bpy.context.active_object.scale = (0.04, 0.01, blade_l)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, blade_mat)
    
    # Guard
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0.15))
    bpy.context.active_object.scale = (0.15, 0.03, 0.03)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, guard_mat)
    
    # Grip
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.02, depth=0.15, location=(0,0,0.05))
    assign_mat(bpy.context.active_object, grip_mat)
    
    # Pommel
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.025, location=(0,0,-0.03))
    assign_mat(bpy.context.active_object, guard_mat)
    
    export_glb(name)

def make_axe(name):
    clear_scene()
    wood_mat = make_mat('handle', (80,50,20), 0.9)
    metal_mat = make_mat('blade', (160,160,170), 0.3, 0.8)
    
    # Handle
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.025, depth=0.8, location=(0,0,0.4))
    assign_mat(bpy.context.active_object, wood_mat)
    
    # Axe head
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0.1, 0, 0.75))
    bpy.context.active_object.scale = (0.2, 0.02, 0.15)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, metal_mat)
    
    export_glb(name)

def make_shield(name, color=(30,30,150)):
    clear_scene()
    shield_mat = make_mat('shield', color, 0.6, 0.3)
    rim_mat = make_mat('rim', (160,140,40), 0.4, 0.7)
    
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.35, segments=16, ring_count=8, location=(0,0,0))
    shield = bpy.context.active_object
    shield.scale = (1, 0.15, 1.2)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(shield, shield_mat)
    
    # Boss (center)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.06, location=(0, 0.06, 0))
    assign_mat(bpy.context.active_object, rim_mat)
    
    export_glb(name)

def make_bow(name):
    clear_scene()
    wood_mat = make_mat('wood', (100,60,20), 0.85)
    string_mat = make_mat('string', (200,190,170), 0.9)
    
    # Bow curve (torus arc)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.5, minor_radius=0.02, major_segments=24, minor_segments=6, location=(0,0,0.5))
    bow = bpy.context.active_object
    # Delete half
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(bow.data)
    verts_to_del = [v for v in bm.verts if v.co.x < -0.01]
    bmesh.ops.delete(bm, geom=verts_to_del, context='VERTS')
    bmesh.update_edit_mesh(bow.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    assign_mat(bow, wood_mat)
    
    # String
    bpy.ops.mesh.primitive_cylinder_add(vertices=4, radius=0.003, depth=1.0, location=(0,0,0.5))
    assign_mat(bpy.context.active_object, string_mat)
    
    export_glb(name)

def make_staff(name):
    clear_scene()
    wood_mat = make_mat('wood', (70,45,15), 0.9)
    crystal_mat = make_mat('crystal', (100,50,200), 0.1, 0.3)
    crystal_mat.use_nodes = True
    bsdf = crystal_mat.node_tree.nodes.get('Principled BSDF')
    if bsdf: bsdf.inputs['Emission Strength'].default_value = 2.0
    
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.025, depth=1.5, location=(0,0,0.75))
    assign_mat(bpy.context.active_object, wood_mat)
    
    bpy.ops.mesh.primitive_ico_sphere_add(radius=0.08, subdivisions=2, location=(0,0,1.55))
    assign_mat(bpy.context.active_object, crystal_mat)
    
    export_glb(name)

# ============================================================
# CHARACTERS / FIGURES
# ============================================================

def make_simple_character(name, body_color=(70,120,180), skin_color=(220,180,140)):
    clear_scene()
    body_mat = make_mat('body', body_color, 0.8)
    skin_mat = make_mat('skin', skin_color, 0.85)
    hair_mat = make_mat('hair', (40,25,10), 0.9)
    shoe_mat = make_mat('shoe', (50,35,15), 0.85)
    
    # Body
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0.85))
    bpy.context.active_object.scale = (0.3, 0.18, 0.4)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, body_mat)
    
    # Head
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.16, segments=12, ring_count=8, location=(0,0,1.25))
    assign_mat(bpy.context.active_object, skin_mat)
    
    # Hair
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.17, segments=12, ring_count=8, location=(0,-0.02,1.3))
    hair = bpy.context.active_object
    hair.scale = (1, 0.9, 0.9)
    bpy.ops.object.transform_apply(scale=True)
    # Delete front half for hair cap
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(hair.data)
    verts_del = [v for v in bm.verts if v.co.y > 0.08]
    bmesh.ops.delete(bm, geom=verts_del, context='VERTS')
    bmesh.update_edit_mesh(hair.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    assign_mat(hair, hair_mat)
    
    # Arms
    for x in [-0.35, 0.35]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.05, depth=0.35, location=(x, 0, 0.85))
        assign_mat(bpy.context.active_object, body_mat)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.05, location=(x, 0, 0.65))
        assign_mat(bpy.context.active_object, skin_mat)
    
    # Legs
    for x in [-0.1, 0.1]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.06, depth=0.4, location=(x, 0, 0.43))
        assign_mat(bpy.context.active_object, body_mat)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 0.03, 0.17))
        bpy.context.active_object.scale = (0.07, 0.12, 0.06)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(bpy.context.active_object, shoe_mat)
    
    export_glb(name)

# ============================================================
# PROPS & MISC
# ============================================================

def make_campfire(name):
    clear_scene()
    wood_mat = make_mat('wood', (80,50,20), 0.9)
    stone_mat = make_mat('stone', (100,100,100), 0.85)
    fire_mat = make_mat('fire', (255,120,20), 0.2)
    fire_mat.use_nodes = True
    bsdf = fire_mat.node_tree.nodes.get('Principled BSDF')
    if bsdf: bsdf.inputs['Emission Strength'].default_value = 8.0
    
    # Stone ring
    for i in range(8):
        angle = i * math.pi * 2 / 8
        bpy.ops.mesh.primitive_cube_add(size=0.12, location=(math.cos(angle)*0.3, math.sin(angle)*0.3, 0.06))
        assign_mat(bpy.context.active_object, stone_mat)
    
    # Logs
    for i in range(3):
        angle = i * math.pi * 2 / 3
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.04, depth=0.4, location=(math.cos(angle)*0.1, math.sin(angle)*0.1, 0.08))
        log = bpy.context.active_object
        log.rotation_euler.y = math.pi/2 + angle*0.3
        log.rotation_euler.x = 0.3
        assign_mat(log, wood_mat)
    
    # Fire
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.12, depth=0.3, location=(0, 0, 0.25))
    assign_mat(bpy.context.active_object, fire_mat)
    
    export_glb(name)

def make_fence(name, sections=5):
    clear_scene()
    wood_mat = make_mat('wood', (110,80,35), 0.9)
    
    for i in range(sections + 1):
        x = -sections * 0.3 / 2 + i * 0.3
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 0, 0.35))
        bpy.context.active_object.scale = (0.03, 0.03, 0.7)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(bpy.context.active_object, wood_mat)
    
    for z in [0.2, 0.5]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, z))
        bpy.context.active_object.scale = (sections * 0.3, 0.02, 0.03)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(bpy.context.active_object, wood_mat)
    
    export_glb(name)

def make_cart(name):
    clear_scene()
    wood_mat = make_mat('wood', (110,80,35), 0.9)
    metal_mat = make_mat('metal', (70,70,70), 0.4, 0.7)
    
    # Bed
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0.4))
    bpy.context.active_object.scale = (0.8, 1.4, 0.05)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, wood_mat)
    
    # Sides
    for x in [-0.4, 0.4]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 0, 0.55))
        bpy.context.active_object.scale = (0.03, 1.4, 0.25)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(bpy.context.active_object, wood_mat)
    
    # Wheels
    for x, y in [(-0.45, -0.45), (0.45, -0.45), (-0.45, 0.45), (0.45, 0.45)]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.2, depth=0.04, location=(x, y, 0.2))
        w = bpy.context.active_object
        w.rotation_euler.y = math.pi/2
        assign_mat(w, metal_mat)
    
    export_glb(name)

def make_sign(name, text_str=""):
    clear_scene()
    wood_mat = make_mat('wood', (100,70,30), 0.9)
    board_mat = make_mat('board', (160,140,90), 0.85)
    
    # Post
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.04, depth=1.2, location=(0,0,0.6))
    assign_mat(bpy.context.active_object, wood_mat)
    
    # Sign board
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 1.0))
    bpy.context.active_object.scale = (0.6, 0.02, 0.3)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, board_mat)
    
    export_glb(name)

def make_streetlight(name):
    clear_scene()
    metal_mat = make_mat('metal', (50,50,50), 0.3, 0.8)
    light_mat = make_mat('light', (255,240,200), 0.1)
    light_mat.use_nodes = True
    bsdf = light_mat.node_tree.nodes.get('Principled BSDF')
    if bsdf: bsdf.inputs['Emission Strength'].default_value = 5.0
    
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.04, depth=3, location=(0,0,1.5))
    assign_mat(bpy.context.active_object, metal_mat)
    
    # Arm
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0.2, 0, 2.9))
    bpy.context.active_object.scale = (0.4, 0.03, 0.03)
    bpy.ops.object.transform_apply(scale=True)
    assign_mat(bpy.context.active_object, metal_mat)
    
    # Lamp
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.12, depth=0.15, location=(0.4, 0, 2.8))
    assign_mat(bpy.context.active_object, light_mat)
    
    export_glb(name)

def make_tent(name, color=(180,160,120)):
    clear_scene()
    tent_mat = make_mat('canvas', color, 0.9)
    pole_mat = make_mat('pole', (80,50,20), 0.85)
    
    # A-frame tent
    verts = [
        (-0.8, -0.6, 0), (0.8, -0.6, 0), (0.8, 0.6, 0), (-0.8, 0.6, 0),  # base
        (-0.8, 0, 1.2), (0.8, 0, 1.2)  # peak
    ]
    faces = [(0,1,5,4), (2,3,4,5), (0,4,3), (1,2,5)]
    
    mesh = bpy.data.meshes.new('tent')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('tent', mesh)
    bpy.context.collection.objects.link(obj)
    assign_mat(obj, tent_mat)
    
    # Center pole
    bpy.ops.mesh.primitive_cylinder_add(vertices=4, radius=0.02, depth=1.25, location=(0, 0, 0.6))
    assign_mat(bpy.context.active_object, pole_mat)
    
    export_glb(name)

# ============================================================
# FOOD & POTIONS
# ============================================================

def make_potion(name, color=(200,50,50)):
    clear_scene()
    glass_mat = make_mat('glass', color, 0.1, 0.2)
    cork_mat = make_mat('cork', (160,130,80), 0.9)
    
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.08, segments=10, ring_count=6, location=(0,0,0.08))
    assign_mat(bpy.context.active_object, glass_mat)
    
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.03, depth=0.1, location=(0,0,0.2))
    assign_mat(bpy.context.active_object, glass_mat)
    
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.035, depth=0.03, location=(0,0,0.27))
    assign_mat(bpy.context.active_object, cork_mat)
    
    export_glb(name)

# ============================================================
# VEHICLES
# ============================================================

def make_boat(name):
    clear_scene()
    wood_mat = make_mat('wood', (110,80,35), 0.85)
    sail_mat = make_mat('sail', (230,220,200), 0.9)
    
    # Hull (tapered box)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0.15))
    hull = bpy.context.active_object
    hull.scale = (0.6, 1.5, 0.3)
    bpy.ops.object.transform_apply(scale=True)
    # Taper front
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(hull.data)
    for v in bm.verts:
        if v.co.y > 0.5:
            factor = (v.co.y - 0.5) / 0.25
            v.co.x *= max(0.3, 1 - factor * 0.7)
    bmesh.update_edit_mesh(hull.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    assign_mat(hull, wood_mat)
    
    # Mast
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.03, depth=1.5, location=(0, 0, 1.0))
    assign_mat(bpy.context.active_object, wood_mat)
    
    # Sail
    bpy.ops.mesh.primitive_plane_add(size=0.8, location=(0.2, 0, 1.2))
    bpy.context.active_object.rotation_euler.z = math.pi/2
    bpy.context.active_object.scale = (1, 0.8, 1)
    bpy.ops.object.transform_apply(rotation=True, scale=True)
    assign_mat(bpy.context.active_object, sail_mat)
    
    export_glb(name)

def make_ship(name):
    clear_scene()
    wood_mat = make_mat('wood', (90,60,20), 0.85)
    sail_mat = make_mat('sail', (230,220,200), 0.9)
    
    # Larger hull
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0.5))
    hull = bpy.context.active_object
    hull.scale = (1.5, 4, 0.8)
    bpy.ops.object.transform_apply(scale=True)
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(hull.data)
    for v in bm.verts:
        if v.co.y > 1.5:
            factor = (v.co.y - 1.5) / 0.5
            v.co.x *= max(0.2, 1 - factor * 0.8)
        if v.co.y < -1.5:
            factor = (-1.5 - v.co.y) / 0.5
            v.co.x *= max(0.5, 1 - factor * 0.5)
    bmesh.update_edit_mesh(hull.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    assign_mat(hull, wood_mat)
    
    # Masts
    for y in [-0.8, 0.5, 1.5]:
        h = 3 if abs(y - 0.5) < 0.1 else 2.5
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.05, depth=h, location=(0, y, h/2 + 0.9))
        assign_mat(bpy.context.active_object, wood_mat)
        # Sail
        bpy.ops.mesh.primitive_plane_add(size=1.2, location=(0.3, y, h/2 + 1.2))
        bpy.context.active_object.scale = (0.8, 0.6, 1)
        bpy.ops.object.transform_apply(scale=True)
        assign_mat(bpy.context.active_object, sail_mat)
    
    export_glb(name)

# ============================================================
# GENERATE ALL MODELS
# ============================================================

print("\n=== CRATE ENGINE MODEL GENERATOR ===")
print(f"Output: {OUTPUT_DIR}\n")

# --- HOUSES (50 variants) ---
for i in range(10):
    make_medieval_house(f'house_{i:02d}', variant=i)
for i in range(5):
    make_cottage(f'cottage_{i:02d}')
make_simple_house('house_large', 3, 3, 2.5, 1.0, (160,140,110), (80,40,20))
make_simple_house('house_small', 1.5, 1.5, 1.5, 0.6, (180,170,150), (100,50,30))
make_simple_house('house_stone', 2.5, 2, 2.0, 0.8, (140,140,140), (80,80,90))
make_simple_house('house_red', 2, 2, 1.8, 0.7, (160,80,70), (120,30,20))
make_simple_house('house_blue', 2, 2, 1.8, 0.7, (70,90,160), (50,50,80))

# --- TOWERS & CASTLES (20) ---
for i in range(5):
    make_tower(f'tower_{i:02d}', h=4+i, r=0.6+i*0.1)
make_castle_wall('castle_wall_short', 4)
make_castle_wall('castle_wall_medium', 6)
make_castle_wall('castle_wall_long', 10)
make_castle_gate('castle_gate')

# --- STRUCTURES (20) ---
make_windmill('windmill')
make_bridge('bridge_short', 3)
make_bridge('bridge_medium', 5)
make_bridge('bridge_long', 8)
make_well('well')
make_fence('fence_short', 3)
make_fence('fence_medium', 5)
make_fence('fence_long', 8)
make_sign('sign')
make_streetlight('streetlight')

# --- TREES (100 variants) ---
for i in range(20):
    make_tree(f'tree_round_{i:02d}', trunk_h=1.5+random.random()*2, crown_r=0.8+random.random()*1.0, crown_type='sphere')
for i in range(15):
    make_tree(f'tree_cone_{i:02d}', trunk_h=1.5+random.random()*1.5, crown_r=0.6+random.random()*0.8, crown_type='cone')
for i in range(15):
    make_tree(f'tree_layered_{i:02d}', trunk_h=1.5+random.random()*1.5, crown_r=0.7+random.random()*0.6, crown_type='layers')
for i in range(10):
    make_pine_tree(f'pine_{i:02d}', h=2+random.random()*3)
for i in range(10):
    make_palm_tree(f'palm_{i:02d}')

# --- NATURE (80) ---
for i in range(15):
    make_bush(f'bush_{i:02d}', r=0.3+random.random()*0.3)
for i in range(20):
    make_rock(f'rock_{i:02d}', scale=0.5+random.random()*1.5)
for i in range(10):
    color = random.choice([(255,80,80),(255,200,50),(200,100,255),(255,150,200),(100,200,255)])
    make_flower(f'flower_{i:02d}', color)
for i in range(8):
    color = random.choice([(200,50,50),(180,140,50),(100,50,200),(50,150,50)])
    make_mushroom(f'mushroom_{i:02d}', color)
for i in range(5):
    make_log(f'log_{i:02d}')
for i in range(5):
    make_stump(f'stump_{i:02d}')
for i in range(5):
    make_cactus(f'cactus_{i:02d}')

# --- FURNITURE (60) ---
for i in range(8):
    make_table(f'table_{i:02d}', w=0.8+random.random()*0.5, d=0.5+random.random()*0.3)
for i in range(8):
    make_chair(f'chair_{i:02d}')
for i in range(5):
    color = random.choice([(200,200,220),(220,200,180),(180,200,220),(200,180,180)])
    make_bed(f'bed_{i:02d}', color)
for i in range(5):
    make_bookshelf(f'bookshelf_{i:02d}')
for i in range(10):
    make_barrel(f'barrel_{i:02d}')
for i in range(8):
    make_crate(f'crate_{i:02d}')
for i in range(5):
    make_chest(f'chest_{i:02d}')
for i in range(5):
    make_torch(f'torch_{i:02d}')
for i in range(5):
    make_lantern(f'lantern_{i:02d}')

# --- WEAPONS (30) ---
make_sword('sword_iron', 0.8, (180,180,200))
make_sword('sword_gold', 0.9, (200,180,40))
make_sword('sword_dark', 0.85, (60,50,70))
make_sword('sword_fire', 0.85, (200,80,30))
make_sword('sword_ice', 0.8, (100,180,220))
make_sword('sword_long', 1.2, (190,190,200))
make_axe('axe_iron')
make_shield('shield_blue', (30,30,150))
make_shield('shield_red', (150,30,30))
make_shield('shield_gold', (180,160,40))
make_bow('bow_wood')
make_staff('staff_magic')

# --- CHARACTERS (40 variants) ---
char_colors = [
    ((70,120,180),(220,180,140),'villager_blue'),
    ((150,50,50),(220,180,140),'villager_red'),
    ((50,120,50),(220,180,140),'villager_green'),
    ((80,60,40),(220,180,140),'villager_brown'),
    ((30,30,30),(220,180,140),'villager_dark'),
    ((200,180,50),(220,180,140),'villager_gold'),
    ((150,100,200),(220,180,140),'villager_purple'),
    ((200,200,200),(220,180,140),'villager_white'),
    ((100,50,20),(100,60,30),'warrior_dark'),
    ((180,180,190),(220,180,140),'knight_silver'),
    ((50,80,50),(180,140,100),'ranger_green'),
    ((80,30,80),(200,170,130),'mage_purple'),
    ((140,20,20),(220,180,140),'guard_red'),
    ((20,20,100),(220,180,140),'guard_blue'),
    ((60,60,60),(200,170,130),'thief_gray'),
]
for body_c, skin_c, char_name in char_colors:
    make_simple_character(f'char_{char_name}', body_c, skin_c)

# --- PROPS (30) ---
make_campfire('campfire')
make_cart('cart')
for i in range(5):
    make_tent(f'tent_{i:02d}', random.choice([(180,160,120),(160,140,100),(200,180,150),(140,120,80),(100,80,60)]))
for i in range(6):
    color = random.choice([(200,50,50),(50,50,200),(50,200,50),(200,200,50),(200,50,200),(50,200,200)])
    make_potion(f'potion_{i:02d}', color)

# --- VEHICLES (10) ---
for i in range(3):
    make_boat(f'boat_{i:02d}')
for i in range(3):
    make_ship(f'ship_{i:02d}')

print(f"\n✅ TOTAL MODELS GENERATED: {generated}")
print(f"📁 Location: {OUTPUT_DIR}")
