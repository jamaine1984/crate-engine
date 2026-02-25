"""
Crate Engine Model Factory v2 — Blender Headless Generator
Generates quality low-poly GLB models with subdivision, bevels, and proper materials.
"""
import bpy
import bmesh
import os
import sys
import json
import math
import random
import time

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output_v2")
MANIFEST = []

class Rng:
    def __init__(self, seed):
        self.r = random.Random(seed)
    def f(self, lo, hi): return self.r.uniform(lo, hi)
    def i(self, lo, hi): return self.r.randint(lo, hi)
    def pick(self, arr): return self.r.choice(arr)
    def color(self): return (self.f(0.1,0.9), self.f(0.1,0.9), self.f(0.1,0.9), 1)
    def wood_color(self):
        h = self.f(0.04, 0.1)
        s = self.f(0.5, 0.8)
        v = self.f(0.15, 0.45)
        import colorsys
        r,g,b = colorsys.hsv_to_rgb(h, s, v)
        return (r, g, b, 1)
    def stone_color(self):
        v = self.f(0.3, 0.6)
        return (v, v*self.f(0.95,1.05), v*self.f(0.95,1.05), 1)
    def metal_color(self):
        v = self.f(0.6, 0.95)
        return (v, v, v*self.f(0.95,1.05), 1)
    def leaf_color(self):
        import colorsys
        r,g,b = colorsys.hsv_to_rgb(self.f(0.22,0.38), self.f(0.5,0.85), self.f(0.15,0.45))
        return (r, g, b, 1)

def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for c in [bpy.data.meshes, bpy.data.materials, bpy.data.textures, bpy.data.images]:
        for item in c: c.remove(item)

def make_mat(name, color, metallic=0.0, roughness=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return m

def add_cube(loc, scale, name="Part"):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object; o.name = name
    o.scale = scale
    return o

def add_cyl(loc, r, depth, name="Part", verts=16):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts, location=loc)
    o = bpy.context.active_object; o.name = name
    return o

def add_sphere(loc, r, name="Part", segments=16, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=segments, ring_count=rings, location=loc)
    o = bpy.context.active_object; o.name = name
    return o

def add_cone(loc, r1, r2, depth, name="Part", verts=16):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth, vertices=verts, location=loc)
    o = bpy.context.active_object; o.name = name
    return o

def add_torus(loc, major_r, minor_r, name="Part"):
    bpy.ops.mesh.primitive_torus_add(major_radius=major_r, minor_radius=minor_r, location=loc)
    o = bpy.context.active_object; o.name = name
    return o

def bevel(obj, width=0.01, segs=2):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_add(type='BEVEL')
    obj.modifiers["Bevel"].width = width
    obj.modifiers["Bevel"].segments = segs
    return obj

def subsurf(obj, levels=1):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_add(type='SUBSURF')
    obj.modifiers["Subdivision"].levels = levels
    return obj

def assign_mat(obj, mat):
    obj.data.materials.append(mat)
    return obj

def apply_all(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for mod in list(obj.modifiers):
        try: bpy.ops.object.modifier_apply(modifier=mod.name)
        except: pass
    obj.select_set(False)

def displace_verts(obj, amount=0.02, seed=42):
    """Slightly displace vertices for organic look"""
    rng = random.Random(seed)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(obj.data)
    for v in bm.verts:
        v.co.x += rng.uniform(-amount, amount)
        v.co.y += rng.uniform(-amount, amount)
        v.co.z += rng.uniform(-amount, amount)
    bmesh.update_edit_mesh(obj.data)
    bpy.ops.object.mode_set(mode='OBJECT')

def finalize_and_export(category, subcategory, name, filepath):
    """Apply modifiers and export"""
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            apply_all(obj)
    
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=filepath, export_format='GLB', use_selection=False)
    size = os.path.getsize(filepath)
    MANIFEST.append({"name": name, "category": category, "subcategory": subcategory, "file": filepath, "size": size})

# ======== BUILDERS ========

def build_sword(rng, idx):
    clear()
    blade_len = rng.f(0.8, 1.8)
    blade_w = rng.f(0.04, 0.12)
    blade_taper = rng.f(0.3, 0.8)
    
    # Blade - tapered using cone
    blade = add_cone((0, 0, blade_len/2 + 0.15), blade_w, blade_w * blade_taper, blade_len, "Blade", 4)
    blade.rotation_euler.z = math.radians(45)
    bevel(blade, rng.f(0.008, 0.02), 2)
    subsurf(blade, 1)
    assign_mat(blade, make_mat("BladeMetal", rng.metal_color(), 0.9, rng.f(0.15, 0.3)))
    
    # Fuller (groove) on some swords
    if rng.f(0,1) > 0.4:
        fuller = add_cube((0, 0, blade_len/2 + 0.2), (blade_w*0.3, blade_w*0.15, blade_len*0.6))
        fuller.name = "Fuller"
        assign_mat(fuller, make_mat("FullerMetal", (0.3, 0.3, 0.35, 1), 0.85, 0.4))
    
    # Guard
    guard_style = rng.i(0, 2)
    if guard_style == 0:  # straight
        guard = add_cube((0, 0, 0.12), (rng.f(0.15, 0.3), rng.f(0.03, 0.06), 0.025))
    elif guard_style == 1:  # curved
        guard = add_cyl((0, 0, 0.12), rng.f(0.08, 0.15), 0.025, "Guard", 8)
        guard.scale.x = rng.f(1.5, 2.5)
    else:  # cross guard
        guard = add_cube((0, 0, 0.12), (rng.f(0.18, 0.35), 0.04, 0.03))
    guard.name = "Guard"
    bevel(guard, 0.006, 2)
    gc = rng.pick([(0.45, 0.35, 0.12, 1), (0.3, 0.3, 0.3, 1), (0.6, 0.5, 0.2, 1)])
    assign_mat(guard, make_mat("GuardMetal", gc, 0.85, 0.3))
    
    # Grip with wrap detail
    grip = add_cyl((0, 0, -0.02), rng.f(0.018, 0.028), rng.f(0.18, 0.28), "Grip", 12)
    assign_mat(grip, make_mat("Leather", rng.wood_color(), 0.0, rng.f(0.7, 0.95)))
    
    # Grip wrap rings
    wrap_count = rng.i(3, 7)
    grip_h = 0.22
    for i in range(wrap_count):
        y = -0.13 + (i / wrap_count) * grip_h
        ring = add_torus((0, 0, y), 0.025, 0.004, f"Wrap{i}")
        ring.rotation_euler.x = math.radians(90)
        assign_mat(ring, make_mat(f"WrapMat{i}", rng.wood_color(), 0.0, 0.8))
    
    # Pommel
    pommel_style = rng.i(0, 2)
    if pommel_style == 0:
        pommel = add_sphere((0, 0, -0.15), rng.f(0.025, 0.04), "Pommel", 12, 8)
    elif pommel_style == 1:
        pommel = add_cyl((0, 0, -0.15), rng.f(0.03, 0.045), 0.025, "Pommel", 8)
    else:
        pommel = add_cone((0, 0, -0.17), 0.035, 0.01, 0.06, "Pommel", 6)
    bevel(pommel, 0.005, 2)
    assign_mat(pommel, make_mat("PommelMetal", gc, 0.85, 0.3))

def build_axe(rng, idx):
    clear()
    handle_len = rng.f(0.7, 1.4)
    
    # Handle - slightly tapered
    handle = add_cyl((0, 0, handle_len/2), rng.f(0.02, 0.03), handle_len, "Handle", 8)
    bevel(handle, 0.003, 1)
    assign_mat(handle, make_mat("Wood", rng.wood_color(), 0.0, 0.8))
    
    # Axe head
    head_w = rng.f(0.15, 0.35)
    head_h = rng.f(0.12, 0.25)
    head = add_cube((head_w/2 - 0.02, 0, handle_len - 0.05), (head_w, 0.03, head_h))
    head.name = "Head"
    bevel(head, rng.f(0.005, 0.015), 2)
    subsurf(head, 1)
    assign_mat(head, make_mat("AxeMetal", rng.metal_color(), 0.85, rng.f(0.2, 0.4)))
    
    # Blade edge
    edge = add_cube((head_w - 0.01, 0, handle_len - 0.05), (0.01, 0.02, head_h * 0.9))
    edge.name = "Edge"
    assign_mat(edge, make_mat("EdgeMetal", (0.9, 0.9, 0.92, 1), 0.95, 0.1))
    
    # Binding
    for i in range(rng.i(2, 4)):
        y = handle_len - 0.15 + i * 0.04
        ring = add_torus((0, 0, y), 0.032, 0.005, f"Bind{i}")
        ring.rotation_euler.x = math.radians(90)
        assign_mat(ring, make_mat(f"BindMat{i}", (0.2, 0.12, 0.05, 1), 0.0, 0.7))

def build_shield(rng, idx):
    clear()
    size = rng.f(0.35, 0.65)
    style = rng.i(0, 3)
    
    if style == 0:  # Round
        bpy.ops.mesh.primitive_cylinder_add(radius=size, depth=0.04, vertices=24, location=(0,0,0))
    elif style == 1:  # Kite
        bpy.ops.mesh.primitive_cone_add(radius1=size*0.7, radius2=size*0.4, depth=size*1.6, vertices=4, location=(0,0,0))
        bpy.context.active_object.scale.y = 0.03
    elif style == 2:  # Heater
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0))
        bpy.context.active_object.scale = (size*0.8, 0.025, size*1.1)
    else:  # Buckler
        bpy.ops.mesh.primitive_cylinder_add(radius=size*0.6, depth=0.05, vertices=20, location=(0,0,0))
    
    shield = bpy.context.active_object
    shield.name = "Shield"
    bevel(shield, 0.008, 2)
    subsurf(shield, 1)
    sc = rng.color()
    assign_mat(shield, make_mat("ShieldFace", sc, rng.f(0.2, 0.6), rng.f(0.3, 0.6)))
    
    # Boss (center piece)
    boss = add_sphere((0, 0.03, 0), size * rng.f(0.15, 0.25), "Boss", 12, 8)
    bevel(boss, 0.005, 1)
    assign_mat(boss, make_mat("BossMetal", rng.metal_color(), 0.85, 0.25))
    
    # Rim
    rim = add_torus((0, 0, 0), size * 0.95, rng.f(0.01, 0.02), "Rim")
    assign_mat(rim, make_mat("RimMetal", rng.metal_color(), 0.8, 0.3))
    
    # Handle (back)
    handle = add_cube((0, -0.03, 0), (0.12, 0.015, 0.03))
    handle.name = "Handle"
    assign_mat(handle, make_mat("HandleWood", rng.wood_color(), 0.0, 0.7))

def build_hammer(rng, idx):
    clear()
    h_len = rng.f(0.6, 1.3)
    
    handle = add_cyl((0, 0, h_len/2), 0.025, h_len, "Handle", 8)
    bevel(handle, 0.003, 1)
    assign_mat(handle, make_mat("Wood", rng.wood_color(), 0.0, 0.8))
    
    head_s = rng.f(0.08, 0.18)
    style = rng.i(0, 2)
    if style == 0:  # Block
        head = add_cube((0, 0, h_len), (head_s*2, head_s, head_s))
    elif style == 1:  # Round
        head = add_cyl((0, 0, h_len), head_s, head_s*1.5, "Head", 12)
        head.rotation_euler.x = math.radians(90)
    else:  # War hammer
        head = add_cube((0, 0, h_len), (head_s*2.5, head_s*0.8, head_s*0.8))
        spike = add_cone((-head_s*1.5, 0, h_len), 0.02, 0.0, head_s, "Spike", 6)
        spike.rotation_euler.y = math.radians(90)
        assign_mat(spike, make_mat("SpikeMetal", rng.metal_color(), 0.9, 0.2))
    
    head.name = "Head"
    bevel(head, 0.008, 2)
    subsurf(head, 1)
    assign_mat(head, make_mat("HeadMetal", rng.metal_color(), 0.85, rng.f(0.2, 0.5)))

def build_tree(rng, idx):
    clear()
    trunk_h = rng.f(1.0, 3.5)
    trunk_r = rng.f(0.06, 0.2)
    
    # Trunk with slight taper
    trunk = add_cone((0, 0, trunk_h/2), trunk_r, trunk_r*0.6, trunk_h, "Trunk", rng.i(6, 10))
    displace_verts(trunk, 0.015, idx)
    assign_mat(trunk, make_mat("Bark", rng.wood_color(), 0.0, 0.9))
    
    style = rng.i(0, 3)
    leaf_mat = make_mat("Leaves", rng.leaf_color(), 0.0, 0.8)
    
    if style == 0:  # Round canopy
        canopy = add_sphere((0, 0, trunk_h + 0.3), rng.f(0.5, 1.5), "Canopy", 10, 8)
        displace_verts(canopy, rng.f(0.05, 0.15), idx+1)
        subsurf(canopy, 1)
        assign_mat(canopy, leaf_mat)
    elif style == 1:  # Conifer layers
        layers = rng.i(3, 6)
        for i in range(layers):
            r = rng.f(0.4, 1.0) * (1 - i*0.15)
            h = rng.f(0.5, 1.0)
            cone = add_cone((0, 0, trunk_h*0.6 + i*h*0.7), r, r*0.1, h, f"Layer{i}", 8)
            displace_verts(cone, 0.03, idx+i)
            assign_mat(cone, make_mat(f"Leaf{i}", rng.leaf_color(), 0.0, 0.8))
    elif style == 2:  # Cluster canopy
        for i in range(rng.i(3, 7)):
            x = rng.f(-0.5, 0.5)
            z = rng.f(-0.5, 0.5)
            s = add_sphere((x, z, trunk_h + rng.f(-0.2, 0.5)), rng.f(0.25, 0.7), f"Cluster{i}", 8, 6)
            displace_verts(s, 0.04, idx+i)
            assign_mat(s, leaf_mat)
    else:  # Palm
        for i in range(rng.i(5, 9)):
            a = (i / 7) * math.pi * 2
            frond = add_cube((math.cos(a)*0.5, math.sin(a)*0.5, trunk_h + 0.1), (0.08, 0.6, 0.015))
            frond.rotation_euler.z = a
            frond.rotation_euler.x = math.radians(rng.f(20, 50))
            frond.name = f"Frond{i}"
            assign_mat(frond, leaf_mat)

def build_rock(rng, idx):
    clear()
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=rng.i(2, 3), radius=rng.f(0.2, 0.8), location=(0, 0, 0))
    rock = bpy.context.active_object
    rock.name = "Rock"
    rock.scale = (rng.f(0.7, 1.4), rng.f(0.5, 1.0), rng.f(0.6, 1.2))
    displace_verts(rock, rng.f(0.02, 0.08), idx)
    bevel(rock, 0.005, 1)
    assign_mat(rock, make_mat("Stone", rng.stone_color(), 0.0, rng.f(0.7, 0.95)))
    
    # Sometimes add smaller rocks
    if rng.f(0,1) > 0.5:
        for i in range(rng.i(1, 3)):
            sr = add_sphere((rng.f(-0.3, 0.3), rng.f(-0.3, 0.3), rng.f(-0.1, 0.1)), rng.f(0.08, 0.2), f"SmallRock{i}", 8, 6)
            displace_verts(sr, 0.02, idx+i)
            assign_mat(sr, make_mat(f"Stone{i}", rng.stone_color(), 0.0, 0.85))

def build_chair(rng, idx):
    clear()
    w = rng.f(0.35, 0.5)
    wmat = make_mat("Wood", rng.wood_color(), 0.0, 0.75)
    
    # Seat
    seat = add_cube((0, 0, 0.4), (w, w, 0.03))
    seat.name = "Seat"
    bevel(seat, 0.005, 2)
    assign_mat(seat, wmat)
    
    # Legs
    leg_r = rng.f(0.015, 0.025)
    for x in [-1, 1]:
        for z in [-1, 1]:
            leg = add_cyl((x*w*0.4, z*w*0.4, 0.2), leg_r, 0.4, f"Leg_{x}_{z}", 8)
            bevel(leg, 0.002, 1)
            assign_mat(leg, wmat)
    
    # Back
    back_h = rng.f(0.3, 0.55)
    style = rng.i(0, 2)
    if style == 0:  # Solid back
        back = add_cube((0, -w*0.4, 0.4 + back_h/2), (w, 0.025, back_h))
        back.name = "Back"
        bevel(back, 0.004, 2)
        assign_mat(back, wmat)
    else:  # Slat back
        for i in range(rng.i(2, 4)):
            sx = -w*0.3 + i * (w*0.6 / 3)
            slat = add_cube((sx, -w*0.4, 0.4 + back_h/2), (0.025, 0.02, back_h))
            slat.name = f"Slat{i}"
            bevel(slat, 0.002, 1)
            assign_mat(slat, wmat)
        # Top rail
        rail = add_cube((0, -w*0.4, 0.4 + back_h), (w*0.8, 0.025, 0.025))
        rail.name = "Rail"
        bevel(rail, 0.003, 1)
        assign_mat(rail, wmat)

def build_table(rng, idx):
    clear()
    w = rng.f(0.8, 1.6)
    d = rng.f(0.5, 1.0)
    h = rng.f(0.7, 0.9)
    wmat = make_mat("Wood", rng.wood_color(), 0.0, 0.75)
    
    top = add_cube((0, 0, h), (w, d, 0.04))
    top.name = "Top"
    bevel(top, 0.006, 2)
    assign_mat(top, wmat)
    
    leg_style = rng.i(0, 2)
    if leg_style == 0:  # 4 legs
        for x in [-1, 1]:
            for z in [-1, 1]:
                leg = add_cyl((x*(w/2-0.06), z*(d/2-0.06), h/2), 0.025, h, f"Leg", 8)
                bevel(leg, 0.003, 1)
                assign_mat(leg, wmat)
    elif leg_style == 1:  # Trestle
        for x in [-1, 1]:
            trestle = add_cube((x*(w/2 - 0.1), 0, h/2), (0.04, d*0.7, h))
            trestle.name = f"Trestle{x}"
            bevel(trestle, 0.004, 1)
            assign_mat(trestle, wmat)
        beam = add_cube((0, 0, 0.15), (w*0.7, 0.04, 0.04))
        beam.name = "Beam"
        assign_mat(beam, wmat)
    else:  # Pedestal
        ped = add_cyl((0, 0, h/2), 0.06, h, "Pedestal", 8)
        bevel(ped, 0.004, 1)
        assign_mat(ped, wmat)
        base = add_cyl((0, 0, 0.03), 0.25, 0.06, "Base", 12)
        assign_mat(base, wmat)

def build_potion(rng, idx):
    clear()
    bottle_r = rng.f(0.04, 0.09)
    bottle_h = rng.f(0.08, 0.16)
    
    # Body
    style = rng.i(0, 2)
    if style == 0:  # Round
        body = add_sphere((0, 0, bottle_r), bottle_r, "Body", 12, 10)
    elif style == 1:  # Tall
        body = add_cyl((0, 0, bottle_h/2), bottle_r, bottle_h, "Body", 10)
        bevel(body, 0.005, 2)
    else:  # Flask
        body = add_sphere((0, 0, bottle_r*0.8), bottle_r, "Body", 12, 10)
        body.scale.z = 1.4
    
    import colorsys
    hue = rng.pick([0.0, 0.1, 0.3, 0.55, 0.75, 0.85])
    r,g,b = colorsys.hsv_to_rgb(hue, rng.f(0.6, 0.9), rng.f(0.4, 0.8))
    assign_mat(body, make_mat("Liquid", (r, g, b, 1), 0.0, 0.1))
    
    # Neck
    neck_h = rng.f(0.06, 0.12)
    neck = add_cyl((0, 0, bottle_r*1.5 + neck_h/2), bottle_r*0.3, neck_h, "Neck", 10)
    assign_mat(neck, make_mat("Glass", (0.8, 0.85, 0.9, 1), 0.0, 0.05))
    
    # Cork
    cork = add_cyl((0, 0, bottle_r*1.5 + neck_h + 0.015), bottle_r*0.35, 0.03, "Cork", 8)
    assign_mat(cork, make_mat("Cork", (0.6, 0.45, 0.25, 1), 0.0, 0.9))

def build_house(rng, idx):
    clear()
    w = rng.f(2.0, 4.0)
    h = rng.f(2.0, 3.5)
    d = rng.f(2.0, 3.5)
    
    # Walls
    import colorsys
    hue = rng.f(0.05, 0.15)
    r,g,b = colorsys.hsv_to_rgb(hue, rng.f(0.2, 0.5), rng.f(0.55, 0.85))
    wall_mat = make_mat("Wall", (r, g, b, 1), 0.0, 0.8)
    
    walls = add_cube((0, 0, h/2), (w, d, h))
    walls.name = "Walls"
    bevel(walls, 0.03, 2)
    assign_mat(walls, wall_mat)
    
    # Roof
    roof_h = rng.f(1.0, 2.0)
    roof_style = rng.i(0, 1)
    rc = rng.pick([(0.5, 0.15, 0.1, 1), (0.3, 0.25, 0.2, 1), (0.15, 0.15, 0.3, 1), (0.6, 0.35, 0.15, 1)])
    roof_mat = make_mat("Roof", rc, 0.0, 0.75)
    
    if roof_style == 0:  # Peaked
        roof = add_cone((0, 0, h + roof_h/2), max(w, d)*0.7, 0.0, roof_h, "Roof", 4)
        roof.rotation_euler.z = math.radians(45)
    else:  # Flat-ish
        roof = add_cube((0, 0, h + 0.1), (w*1.1, d*1.1, 0.15))
        roof.name = "Roof"
    bevel(roof, 0.02, 1)
    assign_mat(roof, roof_mat)
    
    # Door
    door = add_cube((0, d/2 + 0.01, 0.55), (0.4, 0.02, 1.0))
    door.name = "Door"
    bevel(door, 0.008, 2)
    assign_mat(door, make_mat("Door", rng.wood_color(), 0.0, 0.7))
    
    # Door handle
    handle = add_sphere((0.12, d/2 + 0.03, 0.55), 0.02, "Handle", 8, 6)
    assign_mat(handle, make_mat("HandleMetal", (0.7, 0.6, 0.2, 1), 0.8, 0.3))
    
    # Windows
    win_mat = make_mat("Window", (0.5, 0.7, 0.9, 1), 0.0, 0.05)
    for x in [-1, 1]:
        win = add_cube((x * w * 0.3, d/2 + 0.01, h * 0.6), (0.3, 0.015, 0.3))
        win.name = f"Window{x}"
        bevel(win, 0.005, 1)
        assign_mat(win, win_mat)
        # Window frame
        frame = add_cube((x * w * 0.3, d/2 + 0.02, h * 0.6), (0.35, 0.01, 0.35))
        frame.name = f"Frame{x}"
        assign_mat(frame, make_mat(f"WFrame{x}", rng.wood_color(), 0.0, 0.7))
    
    # Chimney (sometimes)
    if rng.f(0,1) > 0.4:
        ch = add_cube((w*0.3, 0, h + roof_h * 0.4), (0.25, 0.25, roof_h * 0.8))
        ch.name = "Chimney"
        bevel(ch, 0.01, 1)
        assign_mat(ch, make_mat("Chimney", rng.stone_color(), 0.0, 0.85))

def build_tower(rng, idx):
    clear()
    h = rng.f(4.0, 8.0)
    r = rng.f(0.6, 1.2)
    smat = make_mat("Stone", rng.stone_color(), 0.0, 0.85)
    
    body = add_cyl((0, 0, h/2), r, h, "Tower", rng.i(10, 16))
    body.scale = (1, 1, 1)
    bevel(body, 0.015, 1)
    assign_mat(body, smat)
    
    # Roof
    roof = add_cone((0, 0, h + 0.8), r*1.15, 0, rng.f(1.5, 2.5), "Roof", 12)
    assign_mat(roof, make_mat("TowerRoof", (0.4, 0.15, 0.15, 1), 0.0, 0.7))
    
    # Battlements
    nb = rng.i(6, 12)
    for i in range(nb):
        a = (i / nb) * math.pi * 2
        merlon = add_cube((math.cos(a)*r*0.95, math.sin(a)*r*0.95, h + 0.15), (0.15, 0.12, 0.3))
        merlon.name = f"Merlon{i}"
        assign_mat(merlon, smat)
    
    # Window slits
    for i in range(rng.i(2, 5)):
        a = rng.f(0, math.pi * 2)
        zh = rng.f(h*0.2, h*0.8)
        slit = add_cube((math.cos(a)*(r+0.01), math.sin(a)*(r+0.01), zh), (0.06, 0.02, 0.2))
        slit.name = f"Slit{i}"
        slit.rotation_euler.z = a
        assign_mat(slit, make_mat(f"SlitDark{i}", (0.05, 0.05, 0.08, 1), 0.0, 0.9))

def build_chest(rng, idx):
    clear()
    w = rng.f(0.4, 0.7)
    h = rng.f(0.25, 0.4)
    d = rng.f(0.25, 0.4)
    wmat = make_mat("ChestWood", rng.wood_color(), 0.0, 0.75)
    
    body = add_cube((0, 0, h/2), (w, d, h))
    body.name = "Body"
    bevel(body, 0.008, 2)
    assign_mat(body, wmat)
    
    # Rounded lid
    lid = add_cyl((0, 0, h), d/2, w, "Lid", 12)
    lid.rotation_euler.y = math.radians(90)
    lid.scale.z = 0.5
    bevel(lid, 0.005, 1)
    assign_mat(lid, wmat)
    
    # Metal bands
    mmat = make_mat("Bands", rng.metal_color(), 0.8, 0.35)
    for x in [-0.3, 0, 0.3]:
        band = add_cube((x*w, 0, h/2), (0.025, d*1.02, h*1.02))
        band.name = f"Band"
        assign_mat(band, mmat)
    
    # Lock
    lock = add_cube((0, d/2 + 0.01, h*0.6), (0.04, 0.01, 0.05))
    lock.name = "Lock"
    bevel(lock, 0.003, 1)
    assign_mat(lock, make_mat("Lock", (0.75, 0.65, 0.15, 1), 0.85, 0.25))

def build_barrel(rng, idx):
    clear()
    h = rng.f(0.6, 1.0)
    r = rng.f(0.2, 0.35)
    
    # Body - use cylinder with slight bulge via vertex edit
    body = add_cyl((0, 0, h/2), r, h, "Barrel", 16)
    # Bulge the middle
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(body.data)
    for v in bm.verts:
        dist_from_center = abs(v.co.z - h/2) / (h/2)
        bulge = 1 + 0.12 * (1 - dist_from_center**2)
        v.co.x *= bulge
        v.co.y *= bulge
    bmesh.update_edit_mesh(body.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    assign_mat(body, make_mat("BarrelWood", rng.wood_color(), 0.0, 0.8))
    
    # Metal bands
    bmat = make_mat("Band", rng.metal_color(), 0.75, 0.4)
    for z in [0.12, h-0.12, h/2]:
        band = add_torus((0, 0, z), r*1.08, 0.008, f"Band")
        band.rotation_euler.x = math.radians(90)
        assign_mat(band, bmat)

def build_gem(rng, idx):
    clear()
    size = rng.f(0.05, 0.15)
    
    # Gem body - icosphere with flattened bottom
    gem = add_sphere((0, 0, size*0.6), size, "Gem", 8, 6)
    gem.scale.z = rng.f(0.6, 1.2)
    
    import colorsys
    hue = rng.pick([0.0, 0.08, 0.3, 0.5, 0.6, 0.75, 0.85])
    r,g,b = colorsys.hsv_to_rgb(hue, rng.f(0.7, 1.0), rng.f(0.5, 0.9))
    assign_mat(gem, make_mat("Gem", (r, g, b, 1), rng.f(0.0, 0.3), 0.05))

def build_campfire(rng, idx):
    clear()
    # Rocks in circle
    smat = make_mat("Stone", rng.stone_color(), 0.0, 0.85)
    n_rocks = rng.i(6, 10)
    for i in range(n_rocks):
        a = (i / n_rocks) * math.pi * 2
        rock = add_sphere((math.cos(a)*0.25, math.sin(a)*0.25, 0.05), rng.f(0.04, 0.08), f"Rock{i}", 6, 5)
        rock.scale = (rng.f(0.8, 1.3), rng.f(0.8, 1.3), rng.f(0.5, 0.9))
        displace_verts(rock, 0.01, idx+i)
        assign_mat(rock, smat)
    
    # Logs
    wmat = make_mat("LogWood", rng.wood_color(), 0.0, 0.85)
    for i in range(rng.i(2, 4)):
        a = rng.f(0, math.pi)
        log = add_cyl((0, 0, 0.06), 0.025, rng.f(0.2, 0.35), f"Log{i}", 6)
        log.rotation_euler.x = math.radians(rng.f(60, 80))
        log.rotation_euler.z = a
        assign_mat(log, wmat)
    
    # Flame (simple cone shapes)
    flame_mat = make_mat("Flame", (1.0, 0.6, 0.1, 1), 0.0, 0.3)
    for i in range(3):
        flame = add_cone((rng.f(-0.05, 0.05), rng.f(-0.05, 0.05), 0.15 + i*0.05), 0.06-i*0.015, 0, rng.f(0.1, 0.2), f"Flame{i}", 6)
        assign_mat(flame, flame_mat)

def build_helmet(rng, idx):
    clear()
    r = rng.f(0.12, 0.18)
    
    # Dome
    dome = add_sphere((0, 0, 0), r, "Dome", 14, 10)
    dome.scale.z = rng.f(1.0, 1.4)
    bevel(dome, 0.003, 1)
    mcolor = rng.metal_color()
    assign_mat(dome, make_mat("HelmetMetal", mcolor, 0.85, rng.f(0.2, 0.4)))
    
    style = rng.i(0, 3)
    if style >= 1:  # Nose guard
        nose = add_cube((0, r*0.9, -r*0.2), (0.015, 0.02, r*0.6))
        nose.name = "NoseGuard"
        assign_mat(nose, make_mat("NoseMetal", mcolor, 0.85, 0.3))
    if style >= 2:  # Crest/ridge
        crest = add_cube((0, 0, r*1.1), (0.015, r*0.4, r*0.8))
        crest.name = "Crest"
        bevel(crest, 0.005, 2)
        assign_mat(crest, make_mat("CrestMetal", rng.color(), 0.7, 0.3))
    
    # Rim
    rim = add_torus((0, 0, -r*0.3), r*1.02, 0.01, "Rim")
    assign_mat(rim, make_mat("RimMetal", mcolor, 0.8, 0.35))

def build_pillar(rng, idx):
    clear()
    h = rng.f(2.0, 5.0)
    r = rng.f(0.15, 0.3)
    smat = make_mat("Stone", rng.stone_color(), 0.0, 0.85)
    
    # Column
    col = add_cyl((0, 0, h/2), r, h, "Column", rng.i(8, 16))
    bevel(col, 0.008, 1)
    assign_mat(col, smat)
    
    # Base
    base = add_cyl((0, 0, 0.06), r*1.5, 0.12, "Base", rng.i(4, 8))
    bevel(base, 0.01, 2)
    assign_mat(base, smat)
    
    # Capital
    cap = add_cyl((0, 0, h - 0.05), r*1.4, 0.1, "Capital", rng.i(4, 8))
    bevel(cap, 0.01, 2)
    assign_mat(cap, smat)
    
    # Fluting (grooves)
    if rng.f(0,1) > 0.4:
        n_flutes = rng.i(6, 12)
        for i in range(n_flutes):
            a = (i / n_flutes) * math.pi * 2
            flute = add_cyl((math.cos(a)*r*0.85, math.sin(a)*r*0.85, h/2), r*0.08, h*0.85, f"Flute{i}", 6)
            assign_mat(flute, make_mat(f"FluteDark{i}", (v:=rng.f(0.2,0.4), v, v, 1), 0.0, 0.9))

def build_crystal(rng, idx):
    clear()
    import colorsys
    hue = rng.pick([0.5, 0.6, 0.75, 0.85, 0.95])
    r,g,b = colorsys.hsv_to_rgb(hue, rng.f(0.5, 0.9), rng.f(0.5, 0.9))
    cmat = make_mat("Crystal", (r, g, b, 1), rng.f(0.0, 0.2), 0.05)
    
    n_shards = rng.i(3, 7)
    for i in range(n_shards):
        h = rng.f(0.2, 0.8)
        rad = rng.f(0.03, 0.08)
        x = rng.f(-0.15, 0.15)
        y = rng.f(-0.15, 0.15)
        shard = add_cone((x, y, h/2), rad, 0.0, h, f"Shard{i}", rng.i(4, 6))
        shard.rotation_euler.x = math.radians(rng.f(-15, 15))
        shard.rotation_euler.y = math.radians(rng.f(-15, 15))
        assign_mat(shard, cmat)

def build_fence(rng, idx):
    clear()
    posts = rng.i(4, 8)
    spacing = rng.f(0.3, 0.5)
    h = rng.f(0.6, 1.0)
    wmat = make_mat("Wood", rng.wood_color(), 0.0, 0.8)
    
    for i in range(posts):
        x = i * spacing - (posts-1)*spacing/2
        post = add_cube((x, 0, h/2), (0.03, 0.03, h))
        post.name = f"Post{i}"
        bevel(post, 0.003, 1)
        assign_mat(post, wmat)
        # Point top
        if rng.f(0,1) > 0.3:
            pt = add_cone((x, 0, h + 0.03), 0.025, 0, 0.06, f"Point{i}", 4)
            assign_mat(pt, wmat)
    
    # Rails
    for z in [h*0.3, h*0.7]:
        rail = add_cube((0, 0, z), ((posts-1)*spacing, 0.025, 0.025))
        rail.name = "Rail"
        bevel(rail, 0.002, 1)
        assign_mat(rail, wmat)

def build_bookshelf(rng, idx):
    clear()
    w = rng.f(0.6, 1.2)
    h = rng.f(1.2, 2.0)
    d = 0.3
    wmat = make_mat("Wood", rng.wood_color(), 0.0, 0.75)
    shelves = rng.i(3, 5)
    
    # Sides
    for x in [-1, 1]:
        side = add_cube((x*w/2, 0, h/2), (0.025, d, h))
        side.name = f"Side{x}"
        bevel(side, 0.003, 1)
        assign_mat(side, wmat)
    
    # Shelves
    for i in range(shelves + 1):
        z = (i / shelves) * h
        shelf = add_cube((0, 0, z + 0.01), (w, d, 0.02))
        shelf.name = f"Shelf{i}"
        assign_mat(shelf, wmat)
    
    # Books
    for i in range(shelves):
        z_base = (i / shelves) * h + 0.03
        x_pos = -w/2 + 0.06
        n_books = rng.i(4, 10)
        for b in range(n_books):
            bw = rng.f(0.02, 0.05)
            bh = rng.f(0.1, (h/shelves) - 0.05)
            book = add_cube((x_pos + bw/2, 0, z_base + bh/2), (bw, d*0.7, bh))
            book.name = f"Book{i}_{b}"
            assign_mat(book, make_mat(f"BookMat{i}_{b}", rng.color(), 0.0, 0.7))
            x_pos += bw + 0.005
            if x_pos > w/2 - 0.06: break

def build_well(rng, idx):
    clear()
    r = rng.f(0.3, 0.5)
    h = rng.f(0.5, 0.8)
    smat = make_mat("Stone", rng.stone_color(), 0.0, 0.85)
    wmat = make_mat("Wood", rng.wood_color(), 0.0, 0.8)
    
    # Wall (cylinder with hole)
    wall = add_cyl((0, 0, h/2), r, h, "Wall", 16)
    bevel(wall, 0.008, 1)
    assign_mat(wall, smat)
    
    # Posts
    for x in [-1, 1]:
        post = add_cube((x*r*0.7, 0, h + 0.4), (0.04, 0.04, 0.8))
        post.name = f"Post{x}"
        assign_mat(post, wmat)
    
    # Crossbeam
    beam = add_cube((0, 0, h + 0.85), (r*1.6, 0.04, 0.04))
    beam.name = "Beam"
    assign_mat(beam, wmat)
    
    # Roof
    roof = add_cone((0, 0, h + 1.1), r*1.1, 0, 0.5, "Roof", 4)
    roof.rotation_euler.z = math.radians(45)
    assign_mat(roof, make_mat("Roof", (0.4, 0.2, 0.1, 1), 0.0, 0.8))
    
    # Bucket
    bucket = add_cyl((0, 0, h + 0.3), 0.06, 0.08, "Bucket", 8)
    assign_mat(bucket, wmat)

# ======== CATEGORY MAP ========
CATEGORIES = {
    "weapons/swords": (build_sword, 400),
    "weapons/axes": (build_axe, 400),
    "weapons/shields": (build_shield, 300),
    "weapons/hammers": (build_hammer, 300),
    "nature/trees": (build_tree, 500),
    "nature/rocks": (build_rock, 400),
    "furniture/chairs": (build_chair, 300),
    "furniture/tables": (build_table, 300),
    "furniture/bookshelves": (build_bookshelf, 200),
    "items/potions": (build_potion, 400),
    "items/gems": (build_gem, 300),
    "items/chests": (build_chest, 300),
    "buildings/houses": (build_house, 200),
    "buildings/towers": (build_tower, 200),
    "props/barrels": (build_barrel, 300),
    "props/campfires": (build_campfire, 200),
    "props/fences": (build_fence, 200),
    "props/wells": (build_well, 150),
    "armor/helmets": (build_helmet, 300),
    "dungeon/pillars": (build_pillar, 200),
    "dungeon/crystals": (build_crystal, 300),
}

# Parse args
start_cat = sys.argv[sys.argv.index("--start-cat") + 1] if "--start-cat" in sys.argv else None
only_cat = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None

total = 0
t0 = time.time()

for cat_path, (builder, count) in CATEGORIES.items():
    if only_cat and cat_path != only_cat:
        continue
    if start_cat and cat_path < start_cat:
        continue
    
    actual_count = min(count, limit) if limit else count
    cat_dir = os.path.join(OUTPUT_DIR, cat_path)
    os.makedirs(cat_dir, exist_ok=True)
    
    sub = cat_path.split("/")[-1]
    print(f"\n{'='*50}")
    print(f"Generating {actual_count} {cat_path}...")
    
    for i in range(actual_count):
        rng = Rng(hash(f"{cat_path}_{i}") % 2147483647)
        
        adjectives = ["ancient", "rustic", "elegant", "dark", "mystic", "noble", "battle", "frost", "ember", "storm", "shadow", "iron", "golden", "silver", "crystal"]
        adj = rng.pick(adjectives)
        name = f"{adj}-{sub[:-1] if sub.endswith('s') else sub}-{i:04d}"
        filepath = os.path.join(cat_dir, f"{name}.glb")
        
        try:
            builder(rng, i)
            finalize_and_export(cat_path.split("/")[0], sub, name, filepath)
            total += 1
            if (i+1) % 50 == 0:
                elapsed = time.time() - t0
                print(f"  {i+1}/{actual_count} done ({total} total, {elapsed:.1f}s)")
        except Exception as e:
            print(f"  ERROR on {name}: {e}")
    
    print(f"  ✅ {actual_count} {cat_path} complete")

elapsed = time.time() - t0
print(f"\n{'='*50}")
print(f"DONE: {total} models in {elapsed:.1f}s ({total/max(elapsed,0.1):.1f}/sec)")
print(f"Output: {OUTPUT_DIR}")

# Save manifest
manifest_path = os.path.join(OUTPUT_DIR, "manifest.json")
with open(manifest_path, "w") as f:
    json.dump(MANIFEST, f, indent=2)
print(f"Manifest: {manifest_path}")
