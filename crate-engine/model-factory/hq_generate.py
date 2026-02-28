"""
Crate Engine HQ Model Factory — Production Generator
5,000 high-quality Blender models with subdivision, bevels, PBR materials.
All colors baked into materials directly (no shader nodes that break GLB export).
"""
import bpy
import bmesh
import os
import sys
import json
import math
import random
import time
import colorsys

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output_hq_prod")
MANIFEST = []

class Rng:
    def __init__(self, seed):
        self.r = random.Random(seed)
    def f(self, lo, hi): return self.r.uniform(lo, hi)
    def i(self, lo, hi): return self.r.randint(lo, hi)
    def pick(self, arr): return self.r.choice(arr)
    def color(self):
        h,s,v = self.f(0,1), self.f(0.4,0.9), self.f(0.3,0.8)
        r,g,b = colorsys.hsv_to_rgb(h,s,v)
        return (r,g,b,1)
    def wood(self):
        r,g,b = colorsys.hsv_to_rgb(self.f(0.04,0.1), self.f(0.5,0.8), self.f(0.12,0.4))
        return (r,g,b,1)
    def dark_wood(self):
        r,g,b = colorsys.hsv_to_rgb(self.f(0.04,0.08), self.f(0.5,0.7), self.f(0.08,0.2))
        return (r,g,b,1)
    def stone(self):
        v = self.f(0.25,0.6); d = self.f(0.95,1.05)
        return (v,v*d,v*self.f(0.95,1.05),1)
    def metal(self):
        v = self.f(0.55,0.95)
        return (v,v,v*self.f(0.95,1.05),1)
    def dark_metal(self):
        v = self.f(0.2,0.45)
        return (v,v,v*self.f(0.9,1.1),1)
    def gold(self):
        return (self.f(0.6,0.8), self.f(0.45,0.6), self.f(0.05,0.2), 1)
    def bronze(self):
        return (self.f(0.5,0.7), self.f(0.3,0.45), self.f(0.1,0.2), 1)
    def leaf(self):
        r,g,b = colorsys.hsv_to_rgb(self.f(0.22,0.4), self.f(0.5,0.85), self.f(0.15,0.5))
        return (r,g,b,1)
    def dark_leaf(self):
        r,g,b = colorsys.hsv_to_rgb(self.f(0.25,0.38), self.f(0.6,0.9), self.f(0.1,0.25))
        return (r,g,b,1)
    def gem_color(self):
        hue = self.pick([0.0, 0.08, 0.3, 0.5, 0.58, 0.75, 0.85])
        r,g,b = colorsys.hsv_to_rgb(hue, self.f(0.7,1.0), self.f(0.5,0.95))
        return (r,g,b,1)
    def fabric(self):
        r,g,b = colorsys.hsv_to_rgb(self.f(0,1), self.f(0.3,0.7), self.f(0.2,0.6))
        return (r,g,b,1)
    def roof_color(self):
        return self.pick([
            (0.5,0.15,0.1,1),(0.35,0.2,0.12,1),(0.15,0.15,0.25,1),
            (0.6,0.35,0.15,1),(0.25,0.12,0.08,1),(0.4,0.25,0.15,1)
        ])

# ============ HELPERS ============
def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for c in [bpy.data.meshes, bpy.data.materials, bpy.data.textures, bpy.data.images]:
        for item in list(c): c.remove(item)

def mat(name, color, metallic=0.0, roughness=0.5, specular=0.5, emission=None, emission_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Specular IOR Level"].default_value = specular
    if emission:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return m

def smooth(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    obj.select_set(False)

def flat(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_flat()
    obj.select_set(False)

def apply_mods(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for mod in list(obj.modifiers):
        try: bpy.ops.object.modifier_apply(modifier=mod.name)
        except: pass
    obj.select_set(False)

def add_bevel(obj, width=0.01, segs=2):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_add(type='BEVEL')
    obj.modifiers["Bevel"].width = width
    obj.modifiers["Bevel"].segments = segs

def add_subsurf(obj, levels=2):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_add(type='SUBSURF')
    obj.modifiers["Subdivision"].levels = levels

def displace(obj, amount=0.02, seed=0):
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

def make_obj(geo_fn, name, loc=(0,0,0), **kwargs):
    geo_fn(location=loc, **kwargs)
    obj = bpy.context.active_object
    obj.name = name
    return obj

def finalize(obj, material=None, do_smooth=True, bevel_w=None, bevel_s=2, subsurf_lvl=None, do_displace=False, disp_amt=0.02, disp_seed=0):
    """One-call finalize: bevel → subsurf → displace → apply → smooth → material"""
    if bevel_w: add_bevel(obj, bevel_w, bevel_s)
    if subsurf_lvl: add_subsurf(obj, subsurf_lvl)
    if do_displace: displace(obj, disp_amt, disp_seed)
    apply_mods(obj)
    if do_smooth: smooth(obj)
    else: flat(obj)
    if material: obj.data.materials.append(material)
    return obj

# ============ SWORD ============
def build_sword(rng, idx):
    clear()
    blade_len = rng.f(1.0, 2.2)
    blade_w = rng.f(0.05, 0.13)
    blade_taper = rng.f(0.2, 0.7)
    
    # Blade — custom diamond cross-section mesh
    bm = bmesh.new()
    sections = rng.i(15, 25)
    for i in range(sections + 1):
        t = i / sections
        z = t * blade_len + 0.15
        w = blade_w * (1 - t * blade_taper)
        th = blade_w * 0.3 * (1 - t * 0.4)
        bm.verts.new((w, 0, z))
        bm.verts.new((0, th, z))
        bm.verts.new((-w, 0, z))
        bm.verts.new((0, -th, z))
    tip = bm.verts.new((0, 0, blade_len + 0.18))
    bm.verts.ensure_lookup_table()
    for i in range(sections):
        for j in range(4):
            v1, v2 = bm.verts[i*4+j], bm.verts[i*4+(j+1)%4]
            v3, v4 = bm.verts[(i+1)*4+(j+1)%4], bm.verts[(i+1)*4+j]
            bm.faces.new([v1, v2, v3, v4])
    last = sections * 4
    for j in range(4):
        bm.faces.new([bm.verts[last+j], bm.verts[last+(j+1)%4], tip])
    mesh = bpy.data.meshes.new("BladeMesh")
    bm.to_mesh(mesh); bm.free()
    blade = bpy.data.objects.new("Blade", mesh)
    bpy.context.collection.objects.link(blade)
    
    blade_color = rng.pick([rng.metal(), (0.75,0.78,0.85,1), (0.6,0.62,0.68,1), (0.85,0.87,0.92,1)])
    finalize(blade, mat("Blade", blade_color, 0.95, rng.f(0.1,0.25), 0.8), subsurf_lvl=2)
    
    # Blood groove / fuller on some
    if rng.f(0,1) > 0.5:
        fuller = make_obj(bpy.ops.mesh.primitive_cube_add, "Fuller", (0,0,blade_len*0.4+0.2), size=1)
        fuller.scale = (blade_w*0.25, blade_w*0.12, blade_len*0.5)
        finalize(fuller, mat("Fuller", (v:=rng.f(0.3,0.5), v, v+0.05, 1), 0.9, 0.35))
    
    # Guard — multiple styles
    guard_style = rng.i(0, 4)
    gc = rng.pick([rng.gold(), rng.bronze(), rng.dark_metal(), rng.metal()])
    g_mat = mat("Guard", gc, 0.88, rng.f(0.2,0.4), 0.7)
    
    if guard_style == 0:  # Straight cross
        guard = make_obj(bpy.ops.mesh.primitive_cube_add, "Guard", (0,0,0.13), size=1)
        guard.scale = (rng.f(0.18,0.35), rng.f(0.035,0.055), 0.025)
        finalize(guard, g_mat, bevel_w=0.01, bevel_s=3, subsurf_lvl=2)
    elif guard_style == 1:  # Curved swept
        guard = make_obj(bpy.ops.mesh.primitive_cube_add, "Guard", (0,0,0.13), size=1)
        guard.scale = (rng.f(0.2,0.3), 0.04, 0.03)
        finalize(guard, g_mat, bevel_w=0.012, bevel_s=3, subsurf_lvl=2)
        # Curved tips
        for x in [-1, 1]:
            tip_obj = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, f"GTip{x}", 
                (x*rng.f(0.18,0.3), 0, 0.13), radius=rng.f(0.015,0.025), segments=12, ring_count=8)
            finalize(tip_obj, g_mat)
    elif guard_style == 2:  # Disc guard
        guard = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Guard", (0,0,0.13), 
            radius=rng.f(0.08,0.14), depth=0.02, vertices=20)
        finalize(guard, g_mat, bevel_w=0.005, bevel_s=2, subsurf_lvl=1)
    elif guard_style == 3:  # S-curved
        guard = make_obj(bpy.ops.mesh.primitive_cube_add, "Guard", (0,0,0.13), size=1)
        guard.scale = (rng.f(0.22,0.32), 0.04, 0.025)
        finalize(guard, g_mat, bevel_w=0.01, bevel_s=3, subsurf_lvl=2)
        for x, z_off in [(-1, 0.02), (1, -0.02)]:
            curl = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, f"Curl{x}",
                (x*0.28, 0, 0.13+z_off), radius=0.02, segments=10, ring_count=8)
            finalize(curl, g_mat)
    else:  # Ring guard
        guard = make_obj(bpy.ops.mesh.primitive_torus_add, "Guard", (0,0,0.13),
            major_radius=0.1, minor_radius=0.012)
        finalize(guard, g_mat)
    
    # Grip
    grip_len = rng.f(0.18, 0.3)
    grip = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Grip", (0,0,-0.02),
        radius=rng.f(0.017,0.025), depth=grip_len, vertices=12)
    finalize(grip, mat("Leather", rng.pick([rng.wood(), rng.dark_wood(), (0.05,0.02,0.01,1)]), 0.0, rng.f(0.75,0.95), 0.15), subsurf_lvl=1)
    
    # Grip wrapping
    n_wraps = rng.i(5, 12)
    wrap_color = rng.pick([rng.wood(), rng.dark_wood(), (0.08,0.04,0.02,1)])
    w_mat = mat("Wrap", wrap_color, 0.0, 0.8, 0.15)
    for i in range(n_wraps):
        z = -0.02 - grip_len/2 + 0.02 + i * (grip_len - 0.04) / max(n_wraps-1, 1)
        wrap = make_obj(bpy.ops.mesh.primitive_torus_add, f"W{i}", (0,0,z),
            major_radius=0.023, minor_radius=rng.f(0.003,0.005))
        wrap.rotation_euler.x = math.radians(90)
        finalize(wrap, w_mat)
    
    # Pommel
    pommel_style = rng.i(0, 3)
    p_mat = mat("Pommel", gc, 0.88, 0.3, 0.7)
    pz = -0.02 - grip_len/2 - 0.02
    
    if pommel_style == 0:  # Sphere
        pom = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, "Pommel", (0,0,pz),
            radius=rng.f(0.025,0.04), segments=16, ring_count=12)
        pom.scale.z = rng.f(0.6, 0.9)
    elif pommel_style == 1:  # Disc
        pom = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Pommel", (0,0,pz),
            radius=rng.f(0.03,0.045), depth=0.02, vertices=16)
    elif pommel_style == 2:  # Cone
        pom = make_obj(bpy.ops.mesh.primitive_cone_add, "Pommel", (0,0,pz-0.02),
            radius1=0.035, radius2=0.01, depth=0.05, vertices=12)
    else:  # Fishtail
        pom = make_obj(bpy.ops.mesh.primitive_cube_add, "Pommel", (0,0,pz), size=1)
        pom.scale = (0.06, 0.02, 0.03)
    finalize(pom, p_mat, bevel_w=0.005, bevel_s=2)
    
    # Pommel gem (sometimes)
    if rng.f(0,1) > 0.5:
        gem = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, "Gem", (0, 0.02, pz),
            radius=rng.f(0.008,0.014), segments=10, ring_count=8)
        gc2 = rng.gem_color()
        finalize(gem, mat("GemMat", gc2, 0.0, 0.02, 1.0, emission=gc2, emission_strength=0.15))

# ============ AXE ============
def build_axe(rng, idx):
    clear()
    h_len = rng.f(0.8, 1.5)
    
    # Handle — tapered cylinder
    handle = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Handle", (0,0,h_len/2),
        radius=0.025, depth=h_len, vertices=10)
    handle.scale.x = 0.8  # slightly oval
    finalize(handle, mat("Wood", rng.wood(), 0.0, 0.8, 0.15), subsurf_lvl=1, bevel_w=0.003)
    
    # Axe head — custom shape
    bm = bmesh.new()
    head_w = rng.f(0.18, 0.38)
    head_h = rng.f(0.14, 0.28)
    style = rng.i(0, 2)
    
    if style == 0:  # Bearded axe — curved cutting edge
        steps = 12
        for i in range(steps+1):
            t = i / steps
            angle = t * math.pi * 0.7 - math.pi * 0.35
            x = head_w * 0.5 + math.cos(angle) * head_w * 0.5
            z = math.sin(angle) * head_h * 0.5 + h_len - 0.05
            for y in [0.015, -0.015]:
                bm.verts.new((x, y, z))
        bm.verts.ensure_lookup_table()
        for i in range(steps):
            for j in [0]:
                v1 = bm.verts[i*2]; v2 = bm.verts[i*2+1]
                v3 = bm.verts[(i+1)*2+1]; v4 = bm.verts[(i+1)*2]
                bm.faces.new([v1,v2,v3,v4])
    else:  # Standard/broad axe
        hw, hh = head_w, head_h
        # Simple wedge shape
        verts = [
            bm.verts.new((-0.02, 0.02, h_len-hh/2)),
            bm.verts.new((-0.02, -0.02, h_len-hh/2)),
            bm.verts.new((hw, 0.005, h_len-hh/2)),
            bm.verts.new((hw, -0.005, h_len-hh/2)),
            bm.verts.new((-0.02, 0.02, h_len+hh/2)),
            bm.verts.new((-0.02, -0.02, h_len+hh/2)),
            bm.verts.new((hw, 0.005, h_len+hh/2)),
            bm.verts.new((hw, -0.005, h_len+hh/2)),
        ]
        bm.faces.new([verts[0],verts[1],verts[3],verts[2]])  # bottom
        bm.faces.new([verts[4],verts[6],verts[7],verts[5]])  # top
        bm.faces.new([verts[0],verts[2],verts[6],verts[4]])  # front
        bm.faces.new([verts[1],verts[5],verts[7],verts[3]])  # back
        bm.faces.new([verts[0],verts[4],verts[5],verts[1]])  # inner
        bm.faces.new([verts[2],verts[3],verts[7],verts[6]])  # edge
    
    mesh = bpy.data.meshes.new("HeadMesh")
    bm.to_mesh(mesh); bm.free()
    head = bpy.data.objects.new("Head", mesh)
    bpy.context.collection.objects.link(head)
    finalize(head, mat("AxeMetal", rng.metal(), 0.85, rng.f(0.2,0.45), 0.6), subsurf_lvl=2, bevel_w=0.008)
    
    # Binding wraps
    b_mat = mat("Binding", rng.dark_wood(), 0.0, 0.7)
    for i in range(rng.i(3, 6)):
        z = h_len - 0.2 + i * 0.04
        bind = make_obj(bpy.ops.mesh.primitive_torus_add, f"Bind{i}", (0,0,z),
            major_radius=0.028, minor_radius=0.004)
        bind.rotation_euler.x = math.radians(90)
        finalize(bind, b_mat)

# ============ SHIELD ============
def build_shield(rng, idx):
    clear()
    size = rng.f(0.35, 0.65)
    style = rng.i(0, 4)
    
    shield_color = rng.pick([rng.color(), rng.metal(), rng.dark_metal()])
    s_mat = mat("Shield", shield_color, rng.f(0.15,0.55), rng.f(0.3,0.6), 0.5)
    rim_mat = mat("Rim", rng.metal(), 0.8, 0.3, 0.6)
    
    if style == 0:  # Round
        body = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Shield", (0,0,0),
            radius=size, depth=0.035, vertices=32)
        finalize(body, s_mat, bevel_w=0.008, bevel_s=3, subsurf_lvl=1)
        rim = make_obj(bpy.ops.mesh.primitive_torus_add, "Rim", (0,0,0),
            major_radius=size*0.97, minor_radius=0.012)
        finalize(rim, rim_mat)
    elif style == 1:  # Kite
        body = make_obj(bpy.ops.mesh.primitive_cone_add, "Shield", (0,0,0),
            radius1=size*0.65, radius2=size*0.35, depth=size*1.7, vertices=4)
        body.scale.y = 0.025
        finalize(body, s_mat, bevel_w=0.01, bevel_s=3, subsurf_lvl=2)
    elif style == 2:  # Heater
        body = make_obj(bpy.ops.mesh.primitive_cube_add, "Shield", (0,0,0), size=1)
        body.scale = (size*0.75, 0.025, size*1.1)
        finalize(body, s_mat, bevel_w=0.012, bevel_s=3, subsurf_lvl=2)
    elif style == 3:  # Buckler (small round)
        body = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Shield", (0,0,0),
            radius=size*0.55, depth=0.04, vertices=24)
        finalize(body, s_mat, bevel_w=0.006, bevel_s=2, subsurf_lvl=1)
    else:  # Tower shield (tall rectangle)
        body = make_obj(bpy.ops.mesh.primitive_cube_add, "Shield", (0,0,0), size=1)
        body.scale = (size*0.6, 0.03, size*1.5)
        finalize(body, s_mat, bevel_w=0.015, bevel_s=3, subsurf_lvl=2)
    
    # Boss
    boss_r = size * rng.f(0.12, 0.22)
    boss = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, "Boss", (0,0.02,0),
        radius=boss_r, segments=16, ring_count=12)
    boss.scale.y = 0.6
    boss_mat = mat("Boss", rng.metal(), 0.88, 0.2, 0.7)
    finalize(boss, boss_mat)
    
    # Decorative rivets
    rivet_mat = mat("Rivet", rng.metal(), 0.85, 0.25)
    n_rivets = rng.i(4, 12)
    for i in range(n_rivets):
        a = (i / n_rivets) * math.pi * 2
        r = size * rng.f(0.5, 0.85)
        rv = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, f"Rv{i}",
            (math.cos(a)*r, 0.02, math.sin(a)*r), radius=0.01, segments=8, ring_count=6)
        finalize(rv, rivet_mat)
    
    # Handle (back)
    handle = make_obj(bpy.ops.mesh.primitive_cube_add, "Handle", (0,-0.03,0), size=1)
    handle.scale = (0.1, 0.012, 0.025)
    finalize(handle, mat("HandleWood", rng.wood(), 0.0, 0.7))

# ============ HAMMER ============
def build_hammer(rng, idx):
    clear()
    h_len = rng.f(0.7, 1.4)
    
    handle = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Handle", (0,0,h_len/2),
        radius=0.022, depth=h_len, vertices=10)
    finalize(handle, mat("Wood", rng.wood(), 0.0, 0.8), subsurf_lvl=1, bevel_w=0.003)
    
    style = rng.i(0, 3)
    head_s = rng.f(0.1, 0.2)
    h_mat = mat("HeadMetal", rng.metal(), 0.88, rng.f(0.2,0.45))
    
    if style == 0:  # Block hammer
        head = make_obj(bpy.ops.mesh.primitive_cube_add, "Head", (0,0,h_len), size=1)
        head.scale = (head_s*2.2, head_s, head_s)
        finalize(head, h_mat, bevel_w=0.008, bevel_s=3, subsurf_lvl=2)
    elif style == 1:  # Round mace-hammer
        head = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Head", (0,0,h_len),
            radius=head_s, depth=head_s*1.6, vertices=16)
        head.rotation_euler.y = math.radians(90)
        finalize(head, h_mat, bevel_w=0.008, bevel_s=2, subsurf_lvl=2)
    elif style == 2:  # War hammer with spike
        head = make_obj(bpy.ops.mesh.primitive_cube_add, "Head", (0,0,h_len), size=1)
        head.scale = (head_s*2.5, head_s*0.8, head_s*0.8)
        finalize(head, h_mat, bevel_w=0.006, bevel_s=3, subsurf_lvl=2)
        spike = make_obj(bpy.ops.mesh.primitive_cone_add, "Spike", (-head_s*1.5, 0, h_len),
            radius1=0.025, radius2=0.0, depth=head_s*0.8, vertices=8)
        spike.rotation_euler.y = math.radians(90)
        finalize(spike, h_mat, subsurf_lvl=1)
    else:  # Sledge
        head = make_obj(bpy.ops.mesh.primitive_cube_add, "Head", (0,0,h_len), size=1)
        head.scale = (head_s*1.5, head_s*1.5, head_s*2)
        finalize(head, h_mat, bevel_w=0.01, bevel_s=3, subsurf_lvl=2)
    
    # Handle wrapping near head
    wr_mat = mat("Wrap", rng.dark_wood(), 0.0, 0.75)
    for i in range(rng.i(2, 5)):
        z = h_len - 0.15 + i * 0.035
        wr = make_obj(bpy.ops.mesh.primitive_torus_add, f"Wr{i}", (0,0,z),
            major_radius=0.025, minor_radius=0.004)
        wr.rotation_euler.x = math.radians(90)
        finalize(wr, wr_mat)

# ============ SPEAR ============
def build_spear(rng, idx):
    clear()
    s_len = rng.f(2.2, 3.8)
    
    shaft = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Shaft", (0,0,s_len/2),
        radius=rng.f(0.015,0.022), depth=s_len, vertices=10)
    finalize(shaft, mat("Wood", rng.wood(), 0.0, 0.8), subsurf_lvl=1)
    
    # Spearhead — custom diamond
    bm = bmesh.new()
    head_len = rng.f(0.2, 0.45)
    head_w = rng.f(0.025, 0.05)
    sections = 8
    for i in range(sections+1):
        t = i / sections
        z = s_len + t * head_len
        w = head_w * math.sin(t * math.pi) * (1 if t < 0.5 else (1-t)*2)
        if t > 0.9: w = 0.002
        th = w * 0.3
        bm.verts.new((w, 0, z)); bm.verts.new((0, th, z))
        bm.verts.new((-w, 0, z)); bm.verts.new((0, -th, z))
    tip = bm.verts.new((0, 0, s_len + head_len + 0.02))
    bm.verts.ensure_lookup_table()
    for i in range(sections):
        for j in range(4):
            v1, v2 = bm.verts[i*4+j], bm.verts[i*4+(j+1)%4]
            v3, v4 = bm.verts[(i+1)*4+(j+1)%4], bm.verts[(i+1)*4+j]
            try: bm.faces.new([v1, v2, v3, v4])
            except: pass
    last = sections * 4
    for j in range(4):
        try: bm.faces.new([bm.verts[last+j], bm.verts[last+(j+1)%4], tip])
        except: pass
    mesh = bpy.data.meshes.new("HeadMesh")
    bm.to_mesh(mesh); bm.free()
    head = bpy.data.objects.new("Head", mesh)
    bpy.context.collection.objects.link(head)
    finalize(head, mat("SpearMetal", rng.metal(), 0.9, 0.18), subsurf_lvl=2)
    
    # Socket
    socket = make_obj(bpy.ops.mesh.primitive_cone_add, "Socket", (0,0,s_len+0.02),
        radius1=0.025, radius2=0.018, depth=0.06, vertices=12)
    finalize(socket, mat("Socket", rng.metal(), 0.85, 0.3), subsurf_lvl=1)
    
    # Butt cap
    butt = make_obj(bpy.ops.mesh.primitive_cone_add, "Butt", (0,0,-0.02),
        radius1=0.02, radius2=0.008, depth=0.04, vertices=10)
    butt.rotation_euler.x = math.radians(180)
    finalize(butt, mat("ButtMetal", rng.metal(), 0.85, 0.35))

# ============ BOW ============
def build_bow(rng, idx):
    clear()
    bow_h = rng.f(0.8, 1.4)
    
    # Bow limbs — curved using bezier-like points
    bm = bmesh.new()
    segments = 20
    curve = rng.f(0.2, 0.4)
    thickness = rng.f(0.012, 0.02)
    
    for i in range(segments + 1):
        t = i / segments
        z = (t - 0.5) * bow_h * 2
        x = curve * math.sin(t * math.pi) * (1 + 0.3 * math.sin(t * math.pi * 2))
        # Rectangular cross section
        for dx, dy in [(thickness, thickness*0.5), (thickness, -thickness*0.5), 
                       (-thickness, -thickness*0.5), (-thickness, thickness*0.5)]:
            bm.verts.new((x + dx, dy, z))
    
    bm.verts.ensure_lookup_table()
    for i in range(segments):
        for j in range(4):
            v1 = bm.verts[i*4+j]; v2 = bm.verts[i*4+(j+1)%4]
            v3 = bm.verts[(i+1)*4+(j+1)%4]; v4 = bm.verts[(i+1)*4+j]
            try: bm.faces.new([v1, v2, v3, v4])
            except: pass
    
    mesh = bpy.data.meshes.new("BowMesh")
    bm.to_mesh(mesh); bm.free()
    bow = bpy.data.objects.new("Bow", mesh)
    bpy.context.collection.objects.link(bow)
    finalize(bow, mat("BowWood", rng.wood(), 0.0, 0.7), subsurf_lvl=2)
    
    # String — thin cylinder
    bm2 = bmesh.new()
    for i in range(segments+1):
        t = i / segments
        z = (t - 0.5) * bow_h * 2
        x = curve * math.sin(t * math.pi) * 0.15  # slight curve
        bm2.verts.new((x, 0, z))
    bm2.verts.ensure_lookup_table()
    for i in range(segments):
        pass  # String as edges only won't export well, use thin cylinder
    bm2.free()
    
    # Simple string cylinder
    string = make_obj(bpy.ops.mesh.primitive_cylinder_add, "String", (0,0,0),
        radius=0.002, depth=bow_h*2, vertices=6)
    finalize(string, mat("String", (0.7,0.65,0.55,1), 0.0, 0.7))
    
    # Grip wrap
    grip = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Grip", (curve*0.95, 0, 0),
        radius=0.025, depth=0.12, vertices=10)
    finalize(grip, mat("GripLeather", rng.dark_wood(), 0.0, 0.85), subsurf_lvl=1)

# ============ STAFF ============
def build_staff(rng, idx):
    clear()
    s_len = rng.f(1.6, 2.8)
    
    # Shaft — slight taper
    shaft = make_obj(bpy.ops.mesh.primitive_cone_add, "Shaft", (0,0,s_len/2),
        radius1=rng.f(0.02,0.03), radius2=rng.f(0.015,0.022), depth=s_len, vertices=10)
    finalize(shaft, mat("StaffWood", rng.wood(), 0.0, 0.75), subsurf_lvl=1)
    
    # Top ornament
    style = rng.i(0, 3)
    gc = rng.gem_color()
    
    if style == 0:  # Crystal
        crystal = make_obj(bpy.ops.mesh.primitive_ico_sphere_add, "Crystal", (0,0,s_len+0.08),
            subdivisions=2, radius=rng.f(0.05,0.1))
        finalize(crystal, mat("Crystal", gc, 0.0, 0.02, 1.0, emission=gc, emission_strength=0.3))
    elif style == 1:  # Orb
        orb = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, "Orb", (0,0,s_len+0.08),
            radius=rng.f(0.04,0.08), segments=20, ring_count=14)
        finalize(orb, mat("Orb", gc, 0.0, 0.05, 0.9, emission=gc, emission_strength=0.2))
    elif style == 2:  # Twisted top
        for i in range(3):
            a = (i/3) * math.pi * 2
            prong = make_obj(bpy.ops.mesh.primitive_cylinder_add, f"Prong{i}",
                (math.cos(a)*0.02, math.sin(a)*0.02, s_len+0.06),
                radius=0.008, depth=0.12, vertices=8)
            prong.rotation_euler.x = math.radians(rng.f(-15, 15))
            finalize(prong, mat(f"Prong{i}", rng.wood(), 0.0, 0.7), subsurf_lvl=1)
        gem = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, "Gem", (0,0,s_len+0.12),
            radius=0.025, segments=12, ring_count=8)
        finalize(gem, mat("GemMat", gc, 0.0, 0.02, 1.0, emission=gc, emission_strength=0.25))
    else:  # Gnarled top
        for i in range(rng.i(2, 5)):
            knot = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, f"Knot{i}",
                (rng.f(-0.03,0.03), rng.f(-0.03,0.03), s_len + rng.f(-0.05, 0.1)),
                radius=rng.f(0.015, 0.03), segments=10, ring_count=8)
            finalize(knot, mat(f"Bark{i}", rng.dark_wood(), 0.0, 0.9), do_displace=True, disp_amt=0.005, disp_seed=idx+i)

# ============ DAGGER ============
def build_dagger(rng, idx):
    clear()
    b_len = rng.f(0.2, 0.5)
    b_w = rng.f(0.025, 0.06)
    
    # Blade
    bm = bmesh.new()
    sections = 10
    for i in range(sections+1):
        t = i / sections
        z = t * b_len + 0.06
        w = b_w * (1 - t * 0.8)
        th = b_w * 0.25 * (1 - t * 0.5)
        bm.verts.new((w, 0, z)); bm.verts.new((0, th, z))
        bm.verts.new((-w, 0, z)); bm.verts.new((0, -th, z))
    tip = bm.verts.new((0, 0, b_len + 0.08))
    bm.verts.ensure_lookup_table()
    for i in range(sections):
        for j in range(4):
            v1, v2 = bm.verts[i*4+j], bm.verts[i*4+(j+1)%4]
            v3, v4 = bm.verts[(i+1)*4+(j+1)%4], bm.verts[(i+1)*4+j]
            try: bm.faces.new([v1, v2, v3, v4])
            except: pass
    last = sections * 4
    for j in range(4):
        try: bm.faces.new([bm.verts[last+j], bm.verts[last+(j+1)%4], tip])
        except: pass
    mesh = bpy.data.meshes.new("DaggerBlade")
    bm.to_mesh(mesh); bm.free()
    blade = bpy.data.objects.new("Blade", mesh)
    bpy.context.collection.objects.link(blade)
    finalize(blade, mat("DaggerMetal", rng.metal(), 0.92, 0.15, 0.8), subsurf_lvl=2)
    
    # Guard
    guard = make_obj(bpy.ops.mesh.primitive_cube_add, "Guard", (0,0,0.055), size=1)
    guard.scale = (rng.f(0.06, 0.1), 0.025, 0.015)
    gc = rng.pick([rng.gold(), rng.bronze(), rng.metal()])
    finalize(guard, mat("GuardM", gc, 0.85, 0.3), bevel_w=0.005, bevel_s=3, subsurf_lvl=2)
    
    grip = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Grip", (0,0,-0.01),
        radius=0.016, depth=0.1, vertices=10)
    finalize(grip, mat("Leather", rng.dark_wood(), 0.0, 0.85), subsurf_lvl=1)
    
    pommel = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, "Pommel", (0,0,-0.07),
        radius=0.02, segments=12, ring_count=8)
    finalize(pommel, mat("PommelM", gc, 0.85, 0.3))

# ============ TREE ============
def build_tree(rng, idx):
    clear()
    trunk_h = rng.f(1.2, 3.5)
    trunk_r = rng.f(0.08, 0.22)
    
    # Trunk — tapered with organic deformation
    trunk = make_obj(bpy.ops.mesh.primitive_cone_add, "Trunk", (0,0,trunk_h/2),
        radius1=trunk_r, radius2=trunk_r*rng.f(0.4,0.7), depth=trunk_h, vertices=rng.i(10,16))
    finalize(trunk, mat("Bark", rng.wood(), 0.0, 0.92, 0.1), subsurf_lvl=2, 
             do_displace=True, disp_amt=rng.f(0.01,0.025), disp_seed=idx)
    
    # Roots
    bark_mat = mat("RootBark", rng.dark_wood(), 0.0, 0.9)
    for i in range(rng.i(3, 7)):
        a = (i / 6) * math.pi * 2 + rng.f(-0.4, 0.4)
        root = make_obj(bpy.ops.mesh.primitive_cone_add, f"Root{i}",
            (math.cos(a)*trunk_r*0.8, math.sin(a)*trunk_r*0.8, 0.08),
            radius1=rng.f(0.03,0.06), radius2=0.01, depth=rng.f(0.3,0.6), vertices=8)
        root.rotation_euler.x = math.radians(rng.f(55,80))
        root.rotation_euler.z = a
        finalize(root, bark_mat, subsurf_lvl=1, do_displace=True, disp_amt=0.008, disp_seed=idx+i)
    
    # Branches
    branch_mat = mat("Branch", rng.dark_wood(), 0.0, 0.88)
    for i in range(rng.i(4, 10)):
        z = trunk_h * rng.f(0.4, 0.9)
        a = rng.f(0, math.pi * 2)
        br = make_obj(bpy.ops.mesh.primitive_cone_add, f"Branch{i}",
            (math.cos(a)*trunk_r*0.7, math.sin(a)*trunk_r*0.7, z),
            radius1=rng.f(0.015,0.035), radius2=0.005, depth=rng.f(0.3,0.8), vertices=6)
        br.rotation_euler.x = math.radians(rng.f(35,70))
        br.rotation_euler.z = a
        finalize(br, branch_mat, subsurf_lvl=1)
    
    # Canopy — style dependent
    style = rng.i(0, 3)
    
    if style == 0:  # Deciduous — multiple displaced spheres
        leaf_mat = mat("Leaves", rng.leaf(), 0.0, 0.75, 0.2)
        for i in range(rng.i(6, 12)):
            x, y = rng.f(-0.6,0.6), rng.f(-0.6,0.6)
            z = trunk_h + rng.f(-0.3, 0.6)
            r = rng.f(0.3, 0.75)
            leaf = make_obj(bpy.ops.mesh.primitive_ico_sphere_add, f"Canopy{i}",
                (x, y, z), subdivisions=3, radius=r)
            leaf.scale = (rng.f(0.8,1.2), rng.f(0.8,1.2), rng.f(0.6,1.0))
            finalize(leaf, leaf_mat, do_displace=True, disp_amt=rng.f(0.04,0.1), disp_seed=idx*10+i)
    elif style == 1:  # Conifer — layered cones
        for i in range(rng.i(4, 8)):
            r = rng.f(0.5, 1.2) * (1 - i*0.12)
            h = rng.f(0.5, 1.0)
            lc = rng.dark_leaf()
            cone = make_obj(bpy.ops.mesh.primitive_cone_add, f"Layer{i}",
                (0, 0, trunk_h*0.5 + i*h*0.65), radius1=r, radius2=r*0.15, depth=h, vertices=rng.i(8,12))
            finalize(cone, mat(f"Leaf{i}", lc, 0.0, 0.8), subsurf_lvl=1,
                     do_displace=True, disp_amt=0.03, disp_seed=idx+i)
    elif style == 2:  # Oak — chunky clusters
        leaf_mat = mat("OakLeaf", rng.leaf(), 0.0, 0.7)
        for i in range(rng.i(5, 9)):
            a = rng.f(0, math.pi*2)
            d = rng.f(0.2, 0.8)
            z = trunk_h + rng.f(-0.3, 0.4)
            cl = make_obj(bpy.ops.mesh.primitive_ico_sphere_add, f"Cluster{i}",
                (math.cos(a)*d, math.sin(a)*d, z), subdivisions=2, radius=rng.f(0.3,0.6))
            finalize(cl, leaf_mat, do_displace=True, disp_amt=rng.f(0.03,0.08), disp_seed=idx*5+i)
    else:  # Palm
        leaf_mat = mat("PalmLeaf", rng.leaf(), 0.0, 0.7)
        for i in range(rng.i(6, 12)):
            a = (i / 8) * math.pi * 2
            frond = make_obj(bpy.ops.mesh.primitive_cube_add, f"Frond{i}",
                (math.cos(a)*0.4, math.sin(a)*0.4, trunk_h+0.15), size=1)
            frond.scale = (0.06, 0.55, 0.012)
            frond.rotation_euler.z = a
            frond.rotation_euler.x = math.radians(rng.f(25,55))
            finalize(frond, leaf_mat, bevel_w=0.005, subsurf_lvl=1)

# ============ ROCK ============
def build_rock(rng, idx):
    clear()
    main_r = rng.f(0.2, 0.9)
    
    rock = make_obj(bpy.ops.mesh.primitive_ico_sphere_add, "Rock", (0,0,main_r*0.4),
        subdivisions=rng.i(2,3), radius=main_r)
    rock.scale = (rng.f(0.7,1.4), rng.f(0.6,1.0), rng.f(0.5,1.0))
    finalize(rock, mat("Stone", rng.stone(), 0.0, rng.f(0.7,0.95), 0.15),
             do_displace=True, disp_amt=rng.f(0.02,0.1), disp_seed=idx)
    
    # Smaller rocks around
    for i in range(rng.i(0, 4)):
        sr = make_obj(bpy.ops.mesh.primitive_ico_sphere_add, f"SmRock{i}",
            (rng.f(-0.5,0.5), rng.f(-0.5,0.5), rng.f(0,0.15)),
            subdivisions=2, radius=rng.f(0.06,0.2))
        sr.scale = (rng.f(0.7,1.3), rng.f(0.7,1.3), rng.f(0.5,0.9))
        finalize(sr, mat(f"Stone{i}", rng.stone(), 0.0, rng.f(0.75,0.95)),
                 do_displace=True, disp_amt=rng.f(0.01,0.04), disp_seed=idx+i+100)

# ============ MOUNTAIN ============
def build_mountain(rng, idx):
    clear()
    
    # Base terrain grid
    bm = bmesh.new()
    size = rng.f(8, 15)
    res = 40  # grid resolution
    verts_grid = []
    
    for iz in range(res+1):
        row = []
        for ix in range(res+1):
            x = (ix / res - 0.5) * size
            y = (iz / res - 0.5) * size
            
            # Mountain height function — central peak with ridges
            dx = x / (size*0.35)
            dy = y / (size*0.35)
            dist = math.sqrt(dx*dx + dy*dy)
            
            # Main peak
            peak_h = rng.f(3.0, 7.0)
            h = peak_h * max(0, 1 - dist) ** rng.f(1.2, 2.0)
            
            # Ridge lines
            n_ridges = rng.i(3, 6)
            for r_i in range(n_ridges):
                ridge_angle = (r_i / n_ridges) * math.pi * 2 + rng.f(-0.3, 0.3)
                ridge_dir = math.cos(ridge_angle) * dx + math.sin(ridge_angle) * dy
                ridge_perp = -math.sin(ridge_angle) * dx + math.cos(ridge_angle) * dy
                ridge_sharp = rng.f(3, 8)
                ridge_h = peak_h * 0.3 * max(0, ridge_dir) * math.exp(-abs(ridge_perp) * ridge_sharp)
                h += ridge_h
            
            # Noise for roughness
            noise_scale = rng.f(0.3, 0.8)
            nx = math.sin(x * 3.7 + y * 2.3) * 0.5 + math.sin(x * 7.1 - y * 5.3) * 0.25
            ny = math.cos(x * 4.3 - y * 3.1) * 0.5 + math.cos(x * 8.7 + y * 6.1) * 0.25
            h += (nx + ny) * noise_scale * max(0.1, h / peak_h)
            
            h = max(0, h)
            v = bm.verts.new((x, y, h))
            row.append(v)
        verts_grid.append(row)
    
    # Create faces
    bm.verts.ensure_lookup_table()
    for iz in range(res):
        for ix in range(res):
            v1 = verts_grid[iz][ix]
            v2 = verts_grid[iz][ix+1]
            v3 = verts_grid[iz+1][ix+1]
            v4 = verts_grid[iz+1][ix]
            bm.faces.new([v1, v2, v3, v4])
    
    mesh = bpy.data.meshes.new("MountainMesh")
    bm.to_mesh(mesh)
    bm.free()
    
    mountain = bpy.data.objects.new("Mountain", mesh)
    bpy.context.collection.objects.link(mountain)
    
    # Vertex colors for height-based coloring
    bpy.context.view_layer.objects.active = mountain
    
    # Apply subsurf for smoothness
    add_subsurf(mountain, 1)
    apply_mods(mountain)
    smooth(mountain)
    
    # Create vertex color layer
    if not mountain.data.color_attributes:
        mountain.data.color_attributes.new("Col", 'FLOAT_COLOR', 'CORNER')
    
    color_attr = mountain.data.color_attributes["Col"]
    peak_h = max(v.co.z for v in mountain.data.vertices)
    
    # Height-based colors
    grass_lo = (0.15, 0.3, 0.08, 1)    # dark grass
    grass_hi = (0.2, 0.42, 0.1, 1)     # light grass
    rock_lo = (0.35, 0.3, 0.25, 1)     # brown rock
    rock_hi = (0.5, 0.48, 0.45, 1)     # gray rock
    snow = (0.92, 0.94, 0.96, 1)       # snow
    
    snow_line = peak_h * rng.f(0.55, 0.75)
    rock_line = peak_h * rng.f(0.25, 0.45)
    
    for poly in mountain.data.polygons:
        for loop_idx in poly.loop_indices:
            vert_idx = mountain.data.loops[loop_idx].vertex_index
            h = mountain.data.vertices[vert_idx].co.z
            
            if h > snow_line:
                t = min(1, (h - snow_line) / (peak_h - snow_line + 0.01))
                c = [rock_hi[j] + (snow[j] - rock_hi[j]) * t for j in range(4)]
            elif h > rock_line:
                t = (h - rock_line) / (snow_line - rock_line + 0.01)
                c = [grass_hi[j] + (rock_hi[j] - grass_hi[j]) * t for j in range(4)]
            else:
                t = h / (rock_line + 0.01)
                c = [grass_lo[j] + (grass_hi[j] - grass_lo[j]) * t for j in range(4)]
            
            color_attr.data[loop_idx].color = c
    
    # Material that uses vertex colors
    m = bpy.data.materials.new("MountainMat")
    m.use_nodes = True
    nodes = m.node_tree.nodes
    links = m.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Specular IOR Level"].default_value = 0.1
    
    # Vertex color node
    vc = nodes.new('ShaderNodeVertexColor')
    vc.layer_name = "Col"
    links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    
    mountain.data.materials.append(m)

# ============ HILL ============
def build_hill(rng, idx):
    clear()
    
    bm = bmesh.new()
    size = rng.f(6, 12)
    res = 35
    verts_grid = []
    
    # Number of hills
    n_hills = rng.i(1, 4)
    hills = []
    for h_i in range(n_hills):
        hx = rng.f(-size*0.25, size*0.25)
        hy = rng.f(-size*0.25, size*0.25)
        hh = rng.f(1.0, 3.0)
        hw = rng.f(1.5, 4.0)
        hills.append((hx, hy, hh, hw))
    
    for iz in range(res+1):
        row = []
        for ix in range(res+1):
            x = (ix / res - 0.5) * size
            y = (iz / res - 0.5) * size
            
            h = 0
            for hx, hy, hh, hw in hills:
                dx = (x - hx) / hw
                dy = (y - hy) / hw
                dist2 = dx*dx + dy*dy
                h += hh * math.exp(-dist2 * rng.f(1.5, 3.0))
            
            # Gentle noise
            noise = math.sin(x*2.1+y*1.7)*0.15 + math.sin(x*5.3-y*3.7)*0.08
            h += noise * max(0.05, h * 0.15)
            h = max(0, h)
            
            v = bm.verts.new((x, y, h))
            row.append(v)
        verts_grid.append(row)
    
    bm.verts.ensure_lookup_table()
    for iz in range(res):
        for ix in range(res):
            bm.faces.new([verts_grid[iz][ix], verts_grid[iz][ix+1], 
                          verts_grid[iz+1][ix+1], verts_grid[iz+1][ix]])
    
    mesh = bpy.data.meshes.new("HillMesh")
    bm.to_mesh(mesh); bm.free()
    
    hill = bpy.data.objects.new("Hill", mesh)
    bpy.context.collection.objects.link(hill)
    bpy.context.view_layer.objects.active = hill
    
    add_subsurf(hill, 1)
    apply_mods(hill)
    smooth(hill)
    
    # Vertex colors — grass with darker valleys
    if not hill.data.color_attributes:
        hill.data.color_attributes.new("Col", 'FLOAT_COLOR', 'CORNER')
    color_attr = hill.data.color_attributes["Col"]
    peak_h = max(v.co.z for v in hill.data.vertices) or 1
    
    grass_dark = (0.1, 0.22, 0.05, 1)
    grass_mid = (0.18, 0.38, 0.08, 1)
    grass_light = (0.25, 0.5, 0.12, 1)
    
    for poly in hill.data.polygons:
        for loop_idx in poly.loop_indices:
            vert_idx = hill.data.loops[loop_idx].vertex_index
            h = hill.data.vertices[vert_idx].co.z
            t = h / peak_h
            if t < 0.3:
                c = [grass_dark[j] + (grass_mid[j]-grass_dark[j]) * (t/0.3) for j in range(4)]
            else:
                c = [grass_mid[j] + (grass_light[j]-grass_mid[j]) * ((t-0.3)/0.7) for j in range(4)]
            color_attr.data[loop_idx].color = c
    
    m = bpy.data.materials.new("HillMat")
    m.use_nodes = True
    nodes = m.node_tree.nodes
    links = m.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.9
    vc = nodes.new('ShaderNodeVertexColor')
    vc.layer_name = "Col"
    links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    hill.data.materials.append(m)
    
    # Scattered rocks on some hills
    if rng.f(0,1) > 0.4:
        for i in range(rng.i(3, 8)):
            rx, ry = rng.f(-size*0.3, size*0.3), rng.f(-size*0.3, size*0.3)
            rz = 0
            for hx, hy, hh, hw in hills:
                dx, dy = (rx-hx)/hw, (ry-hy)/hw
                rz += hh * math.exp(-(dx*dx+dy*dy)*2)
            sr = make_obj(bpy.ops.mesh.primitive_ico_sphere_add, f"HillRock{i}",
                (rx, ry, rz), subdivisions=2, radius=rng.f(0.08, 0.25))
            sr.scale = (rng.f(0.7,1.3), rng.f(0.7,1.3), rng.f(0.5,0.9))
            finalize(sr, mat(f"RockMat{i}", rng.stone(), 0.0, 0.85),
                     do_displace=True, disp_amt=0.02, disp_seed=idx+i)

# ============ CHAIR ============
def build_chair(rng, idx):
    clear()
    w = rng.f(0.35, 0.52)
    seat_h = rng.f(0.38, 0.48)
    wmat = mat("Wood", rng.wood(), 0.0, 0.72)
    
    # Seat
    seat = make_obj(bpy.ops.mesh.primitive_cube_add, "Seat", (0,0,seat_h), size=1)
    seat.scale = (w, w, 0.025)
    finalize(seat, wmat, bevel_w=0.006, bevel_s=3, subsurf_lvl=1)
    
    # Legs — slightly tapered
    leg_r = rng.f(0.013, 0.022)
    for x in [-1, 1]:
        for z in [-1, 1]:
            leg = make_obj(bpy.ops.mesh.primitive_cone_add, f"Leg{x}{z}",
                (x*w*0.4, z*w*0.4, seat_h/2), radius1=leg_r*1.15, radius2=leg_r, depth=seat_h, vertices=8)
            finalize(leg, wmat, bevel_w=0.002, subsurf_lvl=1)
    
    # Back
    back_h = rng.f(0.32, 0.58)
    style = rng.i(0, 3)
    
    if style == 0:  # Solid back
        back = make_obj(bpy.ops.mesh.primitive_cube_add, "Back", (0, -w*0.4, seat_h+back_h/2), size=1)
        back.scale = (w*0.9, 0.02, back_h)
        finalize(back, wmat, bevel_w=0.005, bevel_s=3, subsurf_lvl=1)
    elif style == 1:  # Slat back
        n_slats = rng.i(3, 6)
        for i in range(n_slats):
            sx = -w*0.35 + i * (w*0.7 / max(n_slats-1, 1))
            slat = make_obj(bpy.ops.mesh.primitive_cube_add, f"Slat{i}",
                (sx, -w*0.4, seat_h+back_h/2), size=1)
            slat.scale = (0.015, 0.015, back_h)
            finalize(slat, wmat, bevel_w=0.002, subsurf_lvl=1)
        rail = make_obj(bpy.ops.mesh.primitive_cube_add, "Rail", (0, -w*0.4, seat_h+back_h), size=1)
        rail.scale = (w*0.85, 0.02, 0.025)
        finalize(rail, wmat, bevel_w=0.003, subsurf_lvl=1)
    else:  # Curved back posts
        for x in [-1, 1]:
            post = make_obj(bpy.ops.mesh.primitive_cylinder_add, f"Post{x}",
                (x*w*0.38, -w*0.4, seat_h+back_h/2), radius=0.015, depth=back_h, vertices=8)
            finalize(post, wmat, subsurf_lvl=1)
        rail = make_obj(bpy.ops.mesh.primitive_cube_add, "Rail", (0, -w*0.4, seat_h+back_h), size=1)
        rail.scale = (w*0.8, 0.018, 0.022)
        finalize(rail, wmat, bevel_w=0.003, subsurf_lvl=1)
        mid_rail = make_obj(bpy.ops.mesh.primitive_cube_add, "MidRail", (0, -w*0.4, seat_h+back_h*0.5), size=1)
        mid_rail.scale = (w*0.7, 0.015, 0.018)
        finalize(mid_rail, wmat, bevel_w=0.002, subsurf_lvl=1)

# ============ TABLE ============
def build_table(rng, idx):
    clear()
    w = rng.f(0.8, 1.8)
    d = rng.f(0.5, 1.1)
    h = rng.f(0.68, 0.92)
    wmat = mat("Wood", rng.wood(), 0.0, 0.72)
    
    top = make_obj(bpy.ops.mesh.primitive_cube_add, "Top", (0,0,h), size=1)
    top.scale = (w, d, rng.f(0.03, 0.05))
    finalize(top, wmat, bevel_w=0.008, bevel_s=3, subsurf_lvl=1)
    
    style = rng.i(0, 3)
    if style == 0:  # 4 legs
        for x in [-1, 1]:
            for z in [-1, 1]:
                leg = make_obj(bpy.ops.mesh.primitive_cone_add, f"Leg{x}{z}",
                    (x*(w/2-0.06), z*(d/2-0.06), h/2), 
                    radius1=rng.f(0.025,0.035), radius2=rng.f(0.018,0.025), depth=h, vertices=8)
                finalize(leg, wmat, bevel_w=0.003, subsurf_lvl=1)
        # Stretchers
        if rng.f(0,1) > 0.4:
            for z in [-1, 1]:
                str_obj = make_obj(bpy.ops.mesh.primitive_cylinder_add, f"Str{z}",
                    (0, z*(d/2-0.06), h*0.2), radius=0.012, depth=w-0.12, vertices=6)
                str_obj.rotation_euler.y = math.radians(90)
                finalize(str_obj, wmat, subsurf_lvl=1)
    elif style == 1:  # Trestle
        for x in [-1, 1]:
            trestle = make_obj(bpy.ops.mesh.primitive_cube_add, f"Trestle{x}",
                (x*(w/2-0.1), 0, h/2), size=1)
            trestle.scale = (0.035, d*0.65, h)
            finalize(trestle, wmat, bevel_w=0.005, subsurf_lvl=1)
        beam = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Beam",
            (0, 0, h*0.2), radius=0.02, depth=w*0.7, vertices=8)
        beam.rotation_euler.y = math.radians(90)
        finalize(beam, wmat, subsurf_lvl=1)
    else:  # Pedestal
        ped = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Ped", (0,0,h/2),
            radius=0.055, depth=h, vertices=10)
        finalize(ped, wmat, bevel_w=0.004, subsurf_lvl=1)
        base = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Base", (0,0,0.04),
            radius=0.22, depth=0.06, vertices=12)
        finalize(base, wmat, bevel_w=0.006, bevel_s=2, subsurf_lvl=1)

# ============ POTION ============
def build_potion(rng, idx):
    clear()
    
    style = rng.i(0, 3)
    hue = rng.pick([0.0, 0.08, 0.3, 0.45, 0.55, 0.75, 0.85])
    r,g,b = colorsys.hsv_to_rgb(hue, rng.f(0.6,0.9), rng.f(0.4,0.85))
    liquid_color = (r, g, b, 1)
    glass_color = (0.82, 0.86, 0.9, 1)
    
    if style == 0:  # Round flask
        body = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, "Body", (0,0,0.07),
            radius=rng.f(0.05,0.08), segments=20, ring_count=14)
        body.scale.z = rng.f(1.0, 1.4)
    elif style == 1:  # Tall bottle
        body = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Body", (0,0,0.08),
            radius=rng.f(0.035,0.06), depth=rng.f(0.1,0.16), vertices=16)
    elif style == 2:  # Wide flask
        body = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, "Body", (0,0,0.06),
            radius=rng.f(0.06,0.09), segments=20, ring_count=14)
        body.scale = (1, 1, rng.f(0.7,0.9))
    else:  # Teardrop
        body = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, "Body", (0,0,0.07),
            radius=rng.f(0.05,0.07), segments=20, ring_count=14)
        body.scale = (0.85, 0.85, 1.3)
    
    finalize(body, mat("Glass", glass_color, 0.0, 0.02, 1.0), subsurf_lvl=1, bevel_w=0.003)
    
    # Liquid inside (slightly smaller)
    liquid = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, "Liquid", body.location,
        radius=body.dimensions.x/2*0.85, segments=16, ring_count=10)
    liquid.scale = [s*0.88 for s in body.scale]
    finalize(liquid, mat("Liquid", liquid_color, 0.0, 0.05, 0.8, 
                         emission=liquid_color, emission_strength=rng.f(0.1,0.35)))
    
    # Neck
    neck_h = rng.f(0.05, 0.1)
    top_z = body.location.z + body.dimensions.z/2
    neck = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Neck", (0,0,top_z+neck_h/2),
        radius=rng.f(0.018,0.028), depth=neck_h, vertices=14)
    finalize(neck, mat("NeckGlass", glass_color, 0.0, 0.05, 0.9), subsurf_lvl=1)
    
    # Neck ring
    ring = make_obj(bpy.ops.mesh.primitive_torus_add, "Ring", (0,0,top_z),
        major_radius=neck.dimensions.x/2*1.3, minor_radius=0.004)
    finalize(ring, mat("RingGlass", glass_color, 0.0, 0.08))
    
    # Cork
    cork_z = top_z + neck_h + 0.012
    cork = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Cork", (0,0,cork_z),
        radius=neck.dimensions.x/2*1.1, depth=0.025, vertices=10)
    finalize(cork, mat("Cork", (rng.f(0.45,0.6), rng.f(0.3,0.42), rng.f(0.15,0.25), 1), 0.0, 0.9), 
             bevel_w=0.003, subsurf_lvl=1)

# ============ HOUSE ============
def build_house(rng, idx):
    clear()
    w = rng.f(2.2, 4.5)
    h = rng.f(2.2, 3.8)
    d = rng.f(2.2, 3.8)
    
    # Walls
    wc = rng.pick([
        (rng.f(0.6,0.85), rng.f(0.55,0.8), rng.f(0.4,0.65), 1),  # warm
        (0.75, 0.72, 0.68, 1),  # neutral
        (rng.f(0.5,0.7), rng.f(0.45,0.55), rng.f(0.35,0.45), 1),  # earthy
    ])
    wall_mat = mat("Wall", wc, 0.0, 0.82, 0.15)
    walls = make_obj(bpy.ops.mesh.primitive_cube_add, "Walls", (0,0,h/2), size=1)
    walls.scale = (w, d, h)
    finalize(walls, wall_mat, bevel_w=0.03, bevel_s=2, subsurf_lvl=1)
    
    # Roof
    roof_h = rng.f(1.2, 2.2)
    roof_mat = mat("Roof", rng.roof_color(), 0.0, 0.75)
    style = rng.i(0, 2)
    
    if style == 0:  # Peaked
        roof = make_obj(bpy.ops.mesh.primitive_cone_add, "Roof", (0,0,h+roof_h/2),
            radius1=max(w,d)*0.72, radius2=0, depth=roof_h, vertices=4)
        roof.rotation_euler.z = math.radians(45)
    elif style == 1:  # Gabled
        bm = bmesh.new()
        hw, hd = w*0.55, d*0.55
        v = [bm.verts.new(p) for p in [
            (-hw,-hd,h), (hw,-hd,h), (hw,hd,h), (-hw,hd,h),
            (0,-hd,h+roof_h), (0,hd,h+roof_h)
        ]]
        bm.faces.new([v[0],v[1],v[4]]); bm.faces.new([v[2],v[3],v[5]])
        bm.faces.new([v[0],v[4],v[5],v[3]]); bm.faces.new([v[1],v[2],v[5],v[4]])
        mesh = bpy.data.meshes.new("RoofMesh")
        bm.to_mesh(mesh); bm.free()
        roof = bpy.data.objects.new("Roof", mesh)
        bpy.context.collection.objects.link(roof)
    else:  # Flat with overhang
        roof = make_obj(bpy.ops.mesh.primitive_cube_add, "Roof", (0,0,h+0.08), size=1)
        roof.scale = (w*1.12, d*1.12, 0.12)
    
    finalize(roof, roof_mat, bevel_w=0.02, subsurf_lvl=1)
    
    # Door
    door = make_obj(bpy.ops.mesh.primitive_cube_add, "Door", (0, d/2+0.01, 0.6), size=1)
    door.scale = (rng.f(0.35,0.5), 0.02, rng.f(0.9,1.15))
    finalize(door, mat("Door", rng.wood(), 0.0, 0.7), bevel_w=0.008, bevel_s=3, subsurf_lvl=1)
    
    # Door handle
    handle = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, "Handle",
        (rng.f(0.1,0.15), d/2+0.03, 0.55), radius=0.018, segments=10, ring_count=8)
    finalize(handle, mat("HandleM", rng.gold(), 0.8, 0.3))
    
    # Windows
    win_mat = mat("Window", (0.5,0.7,0.9,1), 0.0, 0.05, 0.8)
    frame_mat = mat("Frame", rng.wood(), 0.0, 0.7)
    for x in [-1, 1]:
        win = make_obj(bpy.ops.mesh.primitive_cube_add, f"Win{x}",
            (x*w*0.3, d/2+0.012, h*0.6), size=1)
        win.scale = (0.28, 0.012, 0.3)
        finalize(win, win_mat, bevel_w=0.004)
        frame = make_obj(bpy.ops.mesh.primitive_cube_add, f"Frame{x}",
            (x*w*0.3, d/2+0.018, h*0.6), size=1)
        frame.scale = (0.32, 0.008, 0.34)
        finalize(frame, frame_mat, bevel_w=0.003, subsurf_lvl=1)
        # Window cross
        hbar = make_obj(bpy.ops.mesh.primitive_cube_add, f"HBar{x}",
            (x*w*0.3, d/2+0.02, h*0.6), size=1)
        hbar.scale = (0.28, 0.006, 0.012)
        finalize(hbar, frame_mat)
        vbar = make_obj(bpy.ops.mesh.primitive_cube_add, f"VBar{x}",
            (x*w*0.3, d/2+0.02, h*0.6), size=1)
        vbar.scale = (0.012, 0.006, 0.3)
        finalize(vbar, frame_mat)
    
    # Chimney
    if rng.f(0,1) > 0.35:
        ch = make_obj(bpy.ops.mesh.primitive_cube_add, "Chimney",
            (w*rng.f(0.2,0.35), 0, h+roof_h*rng.f(0.3,0.5)), size=1)
        ch.scale = (0.25, 0.25, roof_h*0.85)
        finalize(ch, mat("ChimneyStone", rng.stone(), 0.0, 0.85), bevel_w=0.01, subsurf_lvl=1)

# ============ TOWER ============
def build_tower(rng, idx):
    clear()
    h = rng.f(4.5, 9.0)
    r = rng.f(0.7, 1.3)
    smat = mat("Stone", rng.stone(), 0.0, 0.85, 0.12)
    
    body = make_obj(bpy.ops.mesh.primitive_cone_add, "Tower", (0,0,h/2),
        radius1=r, radius2=r*rng.f(0.85,0.95), depth=h, vertices=rng.i(14,20))
    finalize(body, smat, bevel_w=0.015, subsurf_lvl=1)
    
    # Roof
    roof = make_obj(bpy.ops.mesh.primitive_cone_add, "Roof", (0,0,h+rng.f(0.8,1.5)),
        radius1=r*1.15, radius2=0, depth=rng.f(1.8,3.0), vertices=14)
    finalize(roof, mat("Roof", rng.roof_color(), 0.0, 0.7), subsurf_lvl=1)
    
    # Battlements
    nb = rng.i(8, 16)
    for i in range(nb):
        a = (i / nb) * math.pi * 2
        merlon = make_obj(bpy.ops.mesh.primitive_cube_add, f"M{i}",
            (math.cos(a)*r*0.95, math.sin(a)*r*0.95, h+0.18), size=1)
        merlon.scale = (0.14, 0.1, 0.3)
        merlon.rotation_euler.z = a
        finalize(merlon, smat, bevel_w=0.005)
    
    # Window slits
    dark_mat = mat("Dark", (0.03,0.03,0.05,1), 0.0, 0.9)
    for i in range(rng.i(3, 7)):
        a = rng.f(0, math.pi*2)
        zh = rng.f(h*0.15, h*0.8)
        slit = make_obj(bpy.ops.mesh.primitive_cube_add, f"Slit{i}",
            (math.cos(a)*(r+0.01), math.sin(a)*(r+0.01), zh), size=1)
        slit.scale = (0.05, 0.015, 0.2)
        slit.rotation_euler.z = a
        finalize(slit, dark_mat)

# ============ CHEST ============
def build_chest(rng, idx):
    clear()
    w = rng.f(0.4, 0.75)
    h = rng.f(0.25, 0.42)
    d = rng.f(0.25, 0.42)
    wmat = mat("ChestWood", rng.wood(), 0.0, 0.72)
    
    body = make_obj(bpy.ops.mesh.primitive_cube_add, "Body", (0,0,h/2), size=1)
    body.scale = (w, d, h)
    finalize(body, wmat, bevel_w=0.008, bevel_s=3, subsurf_lvl=1)
    
    # Rounded lid
    lid = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Lid", (0,0,h),
        radius=d/2, depth=w, vertices=14)
    lid.rotation_euler.y = math.radians(90)
    lid.scale.z = 0.5
    finalize(lid, wmat, bevel_w=0.005, subsurf_lvl=1)
    
    # Metal bands
    b_mat = mat("Bands", rng.metal(), 0.8, 0.35)
    for xf in [-0.35, 0, 0.35]:
        band = make_obj(bpy.ops.mesh.primitive_cube_add, f"Band", (xf*w, 0, h/2), size=1)
        band.scale = (0.018, d*1.03, h*1.04)
        finalize(band, b_mat, bevel_w=0.002)
    # Lid bands
    for xf in [-0.35, 0, 0.35]:
        lb = make_obj(bpy.ops.mesh.primitive_torus_add, f"LBand",
            (xf*w, 0, h), major_radius=d/2*0.52, minor_radius=0.008)
        lb.rotation_euler.y = math.radians(90)
        lb.scale.z = 0.5
        finalize(lb, b_mat)
    
    # Lock
    lock = make_obj(bpy.ops.mesh.primitive_cube_add, "Lock", (0, d/2+0.01, h*0.65), size=1)
    lock.scale = (0.04, 0.01, 0.05)
    finalize(lock, mat("Lock", rng.gold(), 0.85, 0.25), bevel_w=0.003, bevel_s=2, subsurf_lvl=1)
    
    # Keyhole
    kh = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Keyhole", (0, d/2+0.015, h*0.63),
        radius=0.006, depth=0.005, vertices=8)
    kh.rotation_euler.x = math.radians(90)
    finalize(kh, mat("KeyholeDark", (0.02,0.02,0.02,1), 0.0, 0.9))

# ============ BARREL ============
def build_barrel(rng, idx):
    clear()
    h = rng.f(0.6, 1.1)
    r = rng.f(0.2, 0.38)
    
    body = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Barrel", (0,0,h/2),
        radius=r, depth=h, vertices=18)
    
    # Bulge middle
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(body.data)
    for v in bm.verts:
        dist = abs(v.co.z - h/2) / (h/2)
        bulge = 1 + rng.f(0.08, 0.15) * (1 - dist**2)
        v.co.x *= bulge
        v.co.y *= bulge
    bmesh.update_edit_mesh(body.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    
    finalize(body, mat("BarrelWood", rng.wood(), 0.0, 0.8), subsurf_lvl=1)
    
    # Metal bands
    bmat = mat("Band", rng.metal(), 0.75, 0.4)
    band_positions = [0.1, h/2, h-0.1] if h > 0.8 else [0.1, h-0.1]
    for z in band_positions:
        band = make_obj(bpy.ops.mesh.primitive_torus_add, "Band", (0,0,z),
            major_radius=r*1.08, minor_radius=rng.f(0.006,0.01))
        band.rotation_euler.x = math.radians(90)
        finalize(band, bmat)
    
    # Bung hole (sometimes)
    if rng.f(0,1) > 0.5:
        bung = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Bung", (r+0.005, 0, h/2),
            radius=0.02, depth=0.01, vertices=10)
        bung.rotation_euler.y = math.radians(90)
        finalize(bung, mat("Bung", rng.dark_wood(), 0.0, 0.85))

# ============ GEM ============
def build_gem(rng, idx):
    clear()
    size = rng.f(0.06, 0.16)
    gc = rng.gem_color()
    
    style = rng.i(0, 3)
    if style == 0:  # Brilliant cut — top + bottom cones
        top = make_obj(bpy.ops.mesh.primitive_cone_add, "Crown", (0,0,size*0.3),
            radius1=size, radius2=size*0.6, depth=size*0.6, vertices=rng.i(6,12))
        finalize(top, mat("Gem", gc, rng.f(0,0.2), 0.02, 1.0, emission=gc, emission_strength=0.15))
        bottom = make_obj(bpy.ops.mesh.primitive_cone_add, "Pavilion", (0,0,-size*0.2),
            radius1=size, radius2=0, depth=size*0.6, vertices=rng.i(6,12))
        bottom.rotation_euler.x = math.radians(180)
        finalize(bottom, mat("Gem2", gc, rng.f(0,0.2), 0.02, 1.0))
    elif style == 1:  # Cabochon — smooth dome
        gem = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, "Gem", (0,0,size*0.3),
            radius=size, segments=18, ring_count=12)
        gem.scale.z = 0.5
        finalize(gem, mat("Gem", gc, rng.f(0,0.15), 0.03, 0.9, emission=gc, emission_strength=0.1), subsurf_lvl=1)
    elif style == 2:  # Raw crystal cluster
        for i in range(rng.i(3, 7)):
            ch = rng.f(0.3, 1.0) * size
            cr = rng.f(0.15, 0.35) * size
            shard = make_obj(bpy.ops.mesh.primitive_cone_add, f"Shard{i}",
                (rng.f(-size*0.3, size*0.3), rng.f(-size*0.3, size*0.3), ch/2),
                radius1=cr, radius2=0, depth=ch, vertices=rng.i(4,6))
            shard.rotation_euler.x = math.radians(rng.f(-12,12))
            shard.rotation_euler.y = math.radians(rng.f(-12,12))
            finalize(shard, mat(f"Shard{i}", gc, 0.0, 0.02, 1.0, emission=gc, emission_strength=0.2))
    else:  # Emerald cut — rectangular
        gem = make_obj(bpy.ops.mesh.primitive_cube_add, "Gem", (0,0,size*0.3), size=1)
        gem.scale = (size, size*0.7, size*0.5)
        finalize(gem, mat("Gem", gc, rng.f(0,0.2), 0.02, 1.0, emission=gc, emission_strength=0.15),
                 bevel_w=size*0.15, bevel_s=2, subsurf_lvl=1)

# ============ CAMPFIRE ============
def build_campfire(rng, idx):
    clear()
    
    # Stone ring
    smat = mat("Stone", rng.stone(), 0.0, 0.85)
    n_rocks = rng.i(7, 12)
    for i in range(n_rocks):
        a = (i / n_rocks) * math.pi * 2 + rng.f(-0.15, 0.15)
        rock = make_obj(bpy.ops.mesh.primitive_ico_sphere_add, f"Rock{i}",
            (math.cos(a)*0.28, math.sin(a)*0.28, 0.05),
            subdivisions=2, radius=rng.f(0.04,0.08))
        rock.scale = (rng.f(0.8,1.4), rng.f(0.8,1.4), rng.f(0.5,0.9))
        finalize(rock, smat, do_displace=True, disp_amt=0.01, disp_seed=idx+i)
    
    # Logs
    wmat = mat("LogWood", rng.wood(), 0.0, 0.85)
    char_mat = mat("Charred", (0.05,0.03,0.02,1), 0.0, 0.95)
    for i in range(rng.i(3, 5)):
        a = rng.f(0, math.pi)
        log = make_obj(bpy.ops.mesh.primitive_cylinder_add, f"Log{i}",
            (rng.f(-0.08,0.08), rng.f(-0.08,0.08), 0.05),
            radius=rng.f(0.02,0.04), depth=rng.f(0.2,0.38), vertices=8)
        log.rotation_euler.x = math.radians(rng.f(55,80))
        log.rotation_euler.z = a
        finalize(log, rng.pick([wmat, char_mat]), subsurf_lvl=1)
    
    # Flames
    for i in range(rng.i(3, 6)):
        fh = rng.f(0.08, 0.22)
        fr = rng.f(0.02, 0.05)
        flame_color = rng.pick([
            (1.0,0.6,0.1,1), (1.0,0.4,0.05,1), (1.0,0.75,0.2,1), (0.9,0.3,0.05,1)
        ])
        flame = make_obj(bpy.ops.mesh.primitive_cone_add, f"Flame{i}",
            (rng.f(-0.06,0.06), rng.f(-0.06,0.06), 0.1+i*0.04),
            radius1=fr, radius2=0, depth=fh, vertices=6)
        finalize(flame, mat(f"Flame{i}", flame_color, 0.0, 0.3, 0.2, 
                            emission=flame_color, emission_strength=rng.f(1.5,3.0)))
    
    # Embers
    for i in range(rng.i(4, 8)):
        ember = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, f"Ember{i}",
            (rng.f(-0.15,0.15), rng.f(-0.15,0.15), rng.f(0.01,0.06)),
            radius=rng.f(0.005,0.012), segments=6, ring_count=4)
        ec = (1.0, rng.f(0.2,0.6), 0.0, 1)
        finalize(ember, mat(f"Ember{i}", ec, 0.0, 0.3, 0.1, emission=ec, emission_strength=rng.f(2,5)))

# ============ HELMET ============
def build_helmet(rng, idx):
    clear()
    r = rng.f(0.13, 0.2)
    mc = rng.metal()
    h_mat = mat("HelmetMetal", mc, 0.88, rng.f(0.2,0.4))
    
    # Dome
    dome = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, "Dome", (0,0,0),
        radius=r, segments=20, ring_count=14)
    dome.scale.z = rng.f(1.0, 1.5)
    finalize(dome, h_mat, subsurf_lvl=1)
    
    style = rng.i(0, 4)
    
    # Nose guard
    if style >= 1:
        nose = make_obj(bpy.ops.mesh.primitive_cube_add, "Nose", (0, r*0.92, -r*0.22), size=1)
        nose.scale = (0.012, 0.018, r*0.55)
        finalize(nose, h_mat, bevel_w=0.003, subsurf_lvl=1)
    
    # Crest / ridge
    if style >= 2:
        crest = make_obj(bpy.ops.mesh.primitive_cube_add, "Crest", (0,0,r*1.1), size=1)
        crest.scale = (0.012, r*rng.f(0.35,0.5), r*rng.f(0.6,0.9))
        finalize(crest, mat("Crest", rng.pick([rng.color(), mc]), 0.7, 0.3), bevel_w=0.005, bevel_s=3, subsurf_lvl=2)
    
    # Cheek guards
    if style >= 3:
        for x in [-1, 1]:
            cheek = make_obj(bpy.ops.mesh.primitive_cube_add, f"Cheek{x}",
                (x*r*0.7, r*0.3, -r*0.35), size=1)
            cheek.scale = (0.015, r*0.4, r*0.4)
            finalize(cheek, h_mat, bevel_w=0.004, subsurf_lvl=1)
    
    # Rim
    rim = make_obj(bpy.ops.mesh.primitive_torus_add, "Rim", (0,0,-r*0.3),
        major_radius=r*1.02, minor_radius=rng.f(0.008,0.015))
    finalize(rim, h_mat)

# ============ PILLAR ============
def build_pillar(rng, idx):
    clear()
    h = rng.f(2.2, 5.5)
    r = rng.f(0.15, 0.32)
    smat = mat("Stone", rng.stone(), 0.0, 0.85, 0.12)
    
    col = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Column", (0,0,h/2),
        radius=r, depth=h, vertices=rng.i(12,20))
    finalize(col, smat, bevel_w=0.008, subsurf_lvl=1)
    
    # Base
    base = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Base", (0,0,0.07),
        radius=r*1.5, depth=0.14, vertices=rng.i(4,8))
    finalize(base, smat, bevel_w=0.012, bevel_s=3, subsurf_lvl=1)
    
    # Capital
    cap = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Capital", (0,0,h-0.05),
        radius=r*1.45, depth=0.12, vertices=rng.i(4,8))
    finalize(cap, smat, bevel_w=0.012, bevel_s=3, subsurf_lvl=1)
    
    # Fluting
    if rng.f(0,1) > 0.35:
        n = rng.i(8, 16)
        for i in range(n):
            a = (i / n) * math.pi * 2
            fl = make_obj(bpy.ops.mesh.primitive_cylinder_add, f"Fl{i}",
                (math.cos(a)*r*0.82, math.sin(a)*r*0.82, h/2),
                radius=r*0.06, depth=h*0.85, vertices=6)
            finalize(fl, mat(f"FlDark{i}", (v:=rng.f(0.15,0.35),v,v,1), 0.0, 0.9))

# ============ CRYSTAL ============
def build_crystal(rng, idx):
    clear()
    gc = rng.gem_color()
    c_mat = mat("Crystal", gc, rng.f(0,0.15), 0.02, 1.0, emission=gc, emission_strength=rng.f(0.2,0.5))
    
    n_shards = rng.i(4, 9)
    for i in range(n_shards):
        h = rng.f(0.2, 1.0)
        r = rng.f(0.025, 0.08)
        x, y = rng.f(-0.2,0.2), rng.f(-0.2,0.2)
        shard = make_obj(bpy.ops.mesh.primitive_cone_add, f"Shard{i}",
            (x, y, h/2), radius1=r, radius2=0, depth=h, vertices=rng.i(4,6))
        shard.rotation_euler.x = math.radians(rng.f(-18,18))
        shard.rotation_euler.y = math.radians(rng.f(-18,18))
        finalize(shard, c_mat, subsurf_lvl=1)
    
    # Base rock
    base = make_obj(bpy.ops.mesh.primitive_ico_sphere_add, "Base", (0,0,0.05),
        subdivisions=2, radius=rng.f(0.15,0.3))
    base.scale.z = 0.4
    finalize(base, mat("BaseRock", rng.stone(), 0.0, 0.85), 
             do_displace=True, disp_amt=0.02, disp_seed=idx)

# ============ FENCE ============
def build_fence(rng, idx):
    clear()
    posts = rng.i(4, 9)
    spacing = rng.f(0.3, 0.5)
    h = rng.f(0.65, 1.1)
    wmat = mat("Wood", rng.wood(), 0.0, 0.78)
    
    for i in range(posts):
        x = i * spacing - (posts-1)*spacing/2
        post = make_obj(bpy.ops.mesh.primitive_cube_add, f"Post{i}", (x,0,h/2), size=1)
        post.scale = (0.028, 0.028, h)
        finalize(post, wmat, bevel_w=0.003, subsurf_lvl=1)
        if rng.f(0,1) > 0.3:
            pt = make_obj(bpy.ops.mesh.primitive_cone_add, f"Pt{i}", (x,0,h+0.03),
                radius1=0.022, radius2=0, depth=0.06, vertices=4)
            finalize(pt, wmat, subsurf_lvl=1)
    
    for z in [h*0.3, h*0.7]:
        rail = make_obj(bpy.ops.mesh.primitive_cube_add, "Rail", (0,0,z), size=1)
        rail.scale = ((posts-1)*spacing+0.03, 0.022, 0.022)
        finalize(rail, wmat, bevel_w=0.002, subsurf_lvl=1)

# ============ WELL ============
def build_well(rng, idx):
    clear()
    r = rng.f(0.3, 0.55)
    h = rng.f(0.5, 0.85)
    smat = mat("Stone", rng.stone(), 0.0, 0.85)
    wmat = mat("Wood", rng.wood(), 0.0, 0.78)
    
    wall = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Wall", (0,0,h/2),
        radius=r, depth=h, vertices=18)
    finalize(wall, smat, bevel_w=0.008, subsurf_lvl=1)
    
    for x in [-1, 1]:
        post = make_obj(bpy.ops.mesh.primitive_cube_add, f"Post{x}",
            (x*r*0.7, 0, h+0.45), size=1)
        post.scale = (0.035, 0.035, 0.9)
        finalize(post, wmat, bevel_w=0.004, subsurf_lvl=1)
    
    beam = make_obj(bpy.ops.mesh.primitive_cube_add, "Beam", (0,0,h+0.92), size=1)
    beam.scale = (r*1.7, 0.035, 0.035)
    finalize(beam, wmat, bevel_w=0.004, subsurf_lvl=1)
    
    roof = make_obj(bpy.ops.mesh.primitive_cone_add, "Roof", (0,0,h+1.15),
        radius1=r*1.2, radius2=0, depth=0.55, vertices=4)
    roof.rotation_euler.z = math.radians(45)
    finalize(roof, mat("Roof", rng.roof_color(), 0.0, 0.78), bevel_w=0.01, subsurf_lvl=1)
    
    bucket = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Bucket", (0,0,h+0.35),
        radius=0.055, depth=0.08, vertices=10)
    finalize(bucket, wmat, bevel_w=0.003, subsurf_lvl=1)
    
    rope = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Rope", (0,0,h+0.6),
        radius=0.005, depth=0.5, vertices=6)
    finalize(rope, mat("Rope", (0.5,0.4,0.25,1), 0.0, 0.85))

# ============ BOOKSHELF ============
def build_bookshelf(rng, idx):
    clear()
    w = rng.f(0.65, 1.3)
    h = rng.f(1.3, 2.2)
    d = 0.3
    n_shelves = rng.i(3, 6)
    wmat = mat("Wood", rng.wood(), 0.0, 0.72)
    
    for x in [-1, 1]:
        side = make_obj(bpy.ops.mesh.primitive_cube_add, f"Side{x}", (x*w/2, 0, h/2), size=1)
        side.scale = (0.022, d, h)
        finalize(side, wmat, bevel_w=0.003, subsurf_lvl=1)
    
    for i in range(n_shelves + 1):
        z = (i / n_shelves) * h
        shelf = make_obj(bpy.ops.mesh.primitive_cube_add, f"Shelf{i}", (0,0,z+0.01), size=1)
        shelf.scale = (w, d, 0.018)
        finalize(shelf, wmat, bevel_w=0.002)
    
    # Books
    for i in range(n_shelves):
        z_base = (i / n_shelves) * h + 0.03
        shelf_h = h / n_shelves - 0.05
        x_pos = -w/2 + 0.05
        n_books = rng.i(5, 12)
        for b in range(n_books):
            bw = rng.f(0.02, 0.05)
            bh = rng.f(shelf_h*0.6, shelf_h*0.95)
            book = make_obj(bpy.ops.mesh.primitive_cube_add, f"Book{i}_{b}",
                (x_pos+bw/2, 0, z_base+bh/2), size=1)
            book.scale = (bw, d*0.7, bh)
            finalize(book, mat(f"Book{i}_{b}", rng.color(), 0.0, 0.7), bevel_w=0.001)
            x_pos += bw + rng.f(0.002, 0.008)
            if x_pos > w/2 - 0.05: break

# ============ GRAVESTONE ============
def build_gravestone(rng, idx):
    clear()
    w = rng.f(0.3, 0.5)
    h = rng.f(0.5, 1.0)
    smat = mat("Stone", rng.stone(), 0.0, 0.88)
    
    style = rng.i(0, 3)
    if style == 0:  # Rounded top
        body = make_obj(bpy.ops.mesh.primitive_cube_add, "Stone", (0,0,h/2), size=1)
        body.scale = (w, 0.06, h)
        finalize(body, smat, bevel_w=0.01, bevel_s=3, subsurf_lvl=2)
        top = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Top", (0,0,h),
            radius=w/2, depth=0.06, vertices=16)
        top.rotation_euler.x = math.radians(90)
        finalize(top, smat, subsurf_lvl=1)
    elif style == 1:  # Cross
        vert = make_obj(bpy.ops.mesh.primitive_cube_add, "Vert", (0,0,h/2), size=1)
        vert.scale = (w*0.3, 0.05, h)
        finalize(vert, smat, bevel_w=0.008, bevel_s=2, subsurf_lvl=1)
        horiz = make_obj(bpy.ops.mesh.primitive_cube_add, "Horiz", (0,0,h*0.7), size=1)
        horiz.scale = (w, 0.05, w*0.25)
        finalize(horiz, smat, bevel_w=0.008, bevel_s=2, subsurf_lvl=1)
    else:  # Simple slab
        body = make_obj(bpy.ops.mesh.primitive_cube_add, "Stone", (0,0,h/2), size=1)
        body.scale = (w, 0.055, h)
        body.rotation_euler.x = math.radians(rng.f(-8, 8))
        finalize(body, smat, bevel_w=0.008, bevel_s=3, subsurf_lvl=1, 
                 do_displace=True, disp_amt=0.003, disp_seed=idx)

# ============ TORCH ============
def build_torch(rng, idx):
    clear()
    t_len = rng.f(0.3, 0.6)
    
    handle = make_obj(bpy.ops.mesh.primitive_cone_add, "Handle", (0,0,t_len/2),
        radius1=0.02, radius2=0.015, depth=t_len, vertices=8)
    finalize(handle, mat("Wood", rng.wood(), 0.0, 0.8), subsurf_lvl=1)
    
    # Wrap at top
    wrap = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Wrap", (0,0,t_len-0.02),
        radius=0.025, depth=0.06, vertices=10)
    finalize(wrap, mat("Cloth", (0.4,0.3,0.2,1), 0.0, 0.85), subsurf_lvl=1)
    
    # Flame
    for i in range(3):
        fh = rng.f(0.06, 0.15) * (1 - i*0.25)
        fc = [(1,0.6,0.1,1), (1,0.45,0.05,1), (1,0.8,0.3,1)][i]
        flame = make_obj(bpy.ops.mesh.primitive_cone_add, f"Flame{i}",
            (rng.f(-0.01,0.01), rng.f(-0.01,0.01), t_len+0.03+i*0.03),
            radius1=0.02-i*0.005, radius2=0, depth=fh, vertices=6)
        finalize(flame, mat(f"Flame{i}", fc, 0.0, 0.3, 0.1, emission=fc, emission_strength=rng.f(2,4)))

# ============ ANVIL ============
def build_anvil(rng, idx):
    clear()
    m_mat = mat("AnvilMetal", rng.dark_metal(), 0.9, rng.f(0.3,0.5))
    
    # Base
    base = make_obj(bpy.ops.mesh.primitive_cube_add, "Base", (0,0,0.08), size=1)
    base.scale = (0.3, 0.2, 0.16)
    finalize(base, m_mat, bevel_w=0.008, bevel_s=2, subsurf_lvl=1)
    
    # Waist
    waist = make_obj(bpy.ops.mesh.primitive_cube_add, "Waist", (0,0,0.2), size=1)
    waist.scale = (0.2, 0.14, 0.08)
    finalize(waist, m_mat, bevel_w=0.005, subsurf_lvl=1)
    
    # Face (top)
    face = make_obj(bpy.ops.mesh.primitive_cube_add, "Face", (0,0,0.3), size=1)
    face.scale = (0.32, 0.18, 0.08)
    finalize(face, m_mat, bevel_w=0.01, bevel_s=3, subsurf_lvl=2)
    
    # Horn
    horn = make_obj(bpy.ops.mesh.primitive_cone_add, "Horn", (0.22, 0, 0.3),
        radius1=0.06, radius2=0.02, depth=0.15, vertices=8)
    horn.rotation_euler.y = math.radians(90)
    finalize(horn, m_mat, subsurf_lvl=1)
    
    # Hardy hole
    hardy = make_obj(bpy.ops.mesh.primitive_cube_add, "Hardy", (-0.08, 0, 0.35), size=1)
    hardy.scale = (0.02, 0.02, 0.02)
    finalize(hardy, mat("Dark", (0.02,0.02,0.02,1), 0.0, 0.9))

# ============ SIGN ============
def build_sign(rng, idx):
    clear()
    wmat = mat("Wood", rng.wood(), 0.0, 0.78)
    
    # Post
    post = make_obj(bpy.ops.mesh.primitive_cube_add, "Post", (0, 0, 0.6), size=1)
    post.scale = (0.035, 0.035, 1.2)
    finalize(post, wmat, bevel_w=0.004, subsurf_lvl=1)
    
    # Sign board
    board = make_obj(bpy.ops.mesh.primitive_cube_add, "Board", (0, 0, 1.0), size=1)
    bw = rng.f(0.35, 0.6)
    bh = rng.f(0.2, 0.35)
    board.scale = (bw, 0.02, bh)
    finalize(board, mat("Board", rng.pick([rng.wood(), (0.6,0.55,0.45,1)]), 0.0, 0.75), 
             bevel_w=0.005, bevel_s=2, subsurf_lvl=1)
    
    # Hanging chains/nails
    for x in [-bw*0.4, bw*0.4]:
        nail = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, f"Nail",
            (x, 0.015, 1.0+bh*0.4), radius=0.008, segments=6, ring_count=4)
        finalize(nail, mat("Nail", rng.metal(), 0.8, 0.3))

# ============ MUSHROOM ============
def build_mushroom(rng, idx):
    clear()
    stem_h = rng.f(0.1, 0.35)
    cap_r = rng.f(0.06, 0.2)
    
    stem = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Stem", (0,0,stem_h/2),
        radius=rng.f(0.02,0.04), depth=stem_h, vertices=10)
    finalize(stem, mat("Stem", (0.85,0.8,0.7,1), 0.0, 0.8), subsurf_lvl=1)
    
    # Cap — half sphere
    cap = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, "Cap", (0,0,stem_h),
        radius=cap_r, segments=16, ring_count=10)
    cap.scale.z = rng.f(0.4, 0.7)
    cap_color = rng.pick([
        (0.8,0.15,0.1,1), (0.6,0.35,0.15,1), (0.9,0.85,0.7,1),
        (0.3,0.2,0.1,1), (0.7,0.5,0.2,1), (0.15,0.12,0.08,1)
    ])
    finalize(cap, mat("Cap", cap_color, 0.0, rng.f(0.5,0.8)), subsurf_lvl=1)
    
    # Spots on some
    if rng.f(0,1) > 0.4:
        spot_mat = mat("Spot", (0.95,0.92,0.85,1), 0.0, 0.6)
        for i in range(rng.i(3, 8)):
            a = rng.f(0, math.pi*2)
            el = rng.f(0.2, 1.2)
            x = math.cos(a) * cap_r * 0.7 * math.sin(el)
            y = math.sin(a) * cap_r * 0.7 * math.sin(el)
            z = stem_h + cap_r * rng.f(0.3,0.5) * math.cos(el)
            spot = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, f"Spot{i}",
                (x, y, z), radius=rng.f(0.008,0.02), segments=8, ring_count=6)
            finalize(spot, spot_mat)

# ============ BUSH ============
def build_bush(rng, idx):
    clear()
    leaf_mat = mat("Bush", rng.leaf(), 0.0, 0.75)
    
    n = rng.i(4, 9)
    for i in range(n):
        x, y = rng.f(-0.3,0.3), rng.f(-0.3,0.3)
        z = rng.f(0.1, 0.35)
        r = rng.f(0.15, 0.45)
        blob = make_obj(bpy.ops.mesh.primitive_ico_sphere_add, f"Bush{i}",
            (x, y, z), subdivisions=2, radius=r)
        blob.scale = (rng.f(0.8,1.3), rng.f(0.8,1.3), rng.f(0.5,0.9))
        finalize(blob, leaf_mat, do_displace=True, disp_amt=rng.f(0.02,0.06), disp_seed=idx*10+i)

# ============ FLOWER ============
def build_flower(rng, idx):
    clear()
    stem_h = rng.f(0.15, 0.45)
    
    stem = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Stem", (0,0,stem_h/2),
        radius=0.008, depth=stem_h, vertices=6)
    finalize(stem, mat("StemGreen", (0.1,0.35,0.08,1), 0.0, 0.7), subsurf_lvl=1)
    
    # Petals
    n_petals = rng.i(5, 10)
    petal_color = rng.color()
    p_mat = mat("Petal", petal_color, 0.0, 0.5)
    petal_r = rng.f(0.02, 0.05)
    
    for i in range(n_petals):
        a = (i / n_petals) * math.pi * 2
        px = math.cos(a) * petal_r * 1.2
        py = math.sin(a) * petal_r * 1.2
        petal = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, f"Petal{i}",
            (px, py, stem_h), radius=petal_r, segments=10, ring_count=8)
        petal.scale = (rng.f(0.8,1.2), rng.f(0.8,1.2), 0.3)
        finalize(petal, p_mat)
    
    # Center
    center = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, "Center", (0,0,stem_h+0.005),
        radius=petal_r*0.5, segments=10, ring_count=8)
    finalize(center, mat("Center", (0.9,0.8,0.2,1), 0.0, 0.6))
    
    # Leaf
    leaf = make_obj(bpy.ops.mesh.primitive_cube_add, "Leaf", (0.04, 0, stem_h*0.35), size=1)
    leaf.scale = (0.04, 0.015, 0.008)
    leaf.rotation_euler.z = math.radians(rng.f(-30, 30))
    finalize(leaf, mat("Leaf", (0.12,0.3,0.06,1), 0.0, 0.7), bevel_w=0.003, subsurf_lvl=1)

# ============ WALL ============
def build_wall(rng, idx):
    clear()
    length = rng.f(3, 8)
    h = rng.f(2.2, 4.5)
    thick = rng.f(0.3, 0.6)
    smat = mat("Stone", rng.stone(), 0.0, 0.85)
    
    body = make_obj(bpy.ops.mesh.primitive_cube_add, "Wall", (0,0,h/2), size=1)
    body.scale = (length, thick, h)
    finalize(body, smat, bevel_w=0.02, bevel_s=2, subsurf_lvl=1)
    
    # Crenellations
    nb = int(length / 0.5)
    for i in range(0, nb, 2):
        merlon = make_obj(bpy.ops.mesh.primitive_cube_add, f"Merlon{i}",
            (-length/2 + 0.25 + i*0.5, 0, h+0.2), size=1)
        merlon.scale = (0.28, thick+0.04, 0.4)
        finalize(merlon, smat, bevel_w=0.008)

# ============ BRIDGE ============
def build_bridge(rng, idx):
    clear()
    length = rng.f(3.5, 7)
    w = rng.f(1.2, 2.2)
    wmat = mat("Wood", rng.wood(), 0.0, 0.78)
    smat = mat("Stone", rng.stone(), 0.0, 0.85)
    
    # Deck
    deck = make_obj(bpy.ops.mesh.primitive_cube_add, "Deck", (0,0,1.0), size=1)
    deck.scale = (length, w, 0.08)
    finalize(deck, wmat, bevel_w=0.008, subsurf_lvl=1)
    
    # Planks detail
    n_planks = int(length / 0.15)
    for i in range(0, n_planks, 3):
        x = -length/2 + 0.075 + i * 0.15
        gap = make_obj(bpy.ops.mesh.primitive_cube_add, f"Gap{i}", (x, 0, 1.045), size=1)
        gap.scale = (0.008, w*0.9, 0.005)
        finalize(gap, mat(f"Gap{i}", (0.05,0.03,0.02,1), 0.0, 0.9))
    
    # Railings
    for z in [-1, 1]:
        rail = make_obj(bpy.ops.mesh.primitive_cube_add, f"Rail{z}", (0, z*w/2, 1.35), size=1)
        rail.scale = (length, 0.03, 0.03)
        finalize(rail, wmat, bevel_w=0.004, subsurf_lvl=1)
        
        # Railing posts
        for i in range(int(length / 0.8)):
            x = -length/2 + 0.4 + i * 0.8
            post = make_obj(bpy.ops.mesh.primitive_cube_add, f"RPost{z}{i}", (x, z*w/2, 1.2), size=1)
            post.scale = (0.025, 0.025, 0.35)
            finalize(post, wmat, bevel_w=0.003)
    
    # Support pillars
    for x in [-length*0.3, 0, length*0.3]:
        pillar = make_obj(bpy.ops.mesh.primitive_cylinder_add, f"Pillar",
            (x, 0, 0.5), radius=0.1, depth=1.2, vertices=10)
        finalize(pillar, smat, bevel_w=0.005, subsurf_lvl=1)

# ============ BED ============
def build_bed(rng, idx):
    clear()
    w = rng.f(0.85, 1.25)
    length = rng.f(1.8, 2.3)
    wmat = mat("Wood", rng.wood(), 0.0, 0.72)
    
    # Frame
    frame = make_obj(bpy.ops.mesh.primitive_cube_add, "Frame", (0,0,0.22), size=1)
    frame.scale = (w, length, 0.08)
    finalize(frame, wmat, bevel_w=0.005, subsurf_lvl=1)
    
    # Legs
    for x in [-1,1]:
        for y in [-1,1]:
            leg = make_obj(bpy.ops.mesh.primitive_cylinder_add, f"Leg{x}{y}",
                (x*(w/2-0.05), y*(length/2-0.05), 0.1), radius=0.025, depth=0.2, vertices=8)
            finalize(leg, wmat, subsurf_lvl=1)
    
    # Mattress
    mattress = make_obj(bpy.ops.mesh.primitive_cube_add, "Mattress", (0,0,0.32), size=1)
    mattress.scale = (w-0.04, length-0.04, 0.1)
    finalize(mattress, mat("Mattress", (0.85,0.82,0.78,1), 0.0, 0.85), bevel_w=0.01, bevel_s=3, subsurf_lvl=2)
    
    # Pillow
    pillow = make_obj(bpy.ops.mesh.primitive_cube_add, "Pillow", (0, -length/2+0.2, 0.4), size=1)
    pillow.scale = (w*0.5, 0.2, 0.06)
    finalize(pillow, mat("Pillow", (0.95,0.93,0.9,1), 0.0, 0.8), bevel_w=0.02, bevel_s=3, subsurf_lvl=2)
    
    # Blanket
    blanket = make_obj(bpy.ops.mesh.primitive_cube_add, "Blanket", (0, 0.15, 0.38), size=1)
    blanket.scale = (w-0.02, length*0.55, 0.04)
    finalize(blanket, mat("Blanket", rng.fabric(), 0.0, 0.85), bevel_w=0.008, bevel_s=3, subsurf_lvl=1)
    
    # Headboard
    headboard = make_obj(bpy.ops.mesh.primitive_cube_add, "Headboard", (0, -length/2, 0.45), size=1)
    headboard.scale = (w, 0.03, 0.5)
    finalize(headboard, wmat, bevel_w=0.006, bevel_s=3, subsurf_lvl=1)

# ============ CAULDRON ============  
def build_cauldron(rng, idx):
    clear()
    r = rng.f(0.2, 0.4)
    
    # Body — sphere squashed
    body = make_obj(bpy.ops.mesh.primitive_uv_sphere_add, "Cauldron", (0,0,r*0.6),
        radius=r, segments=20, ring_count=14)
    body.scale.z = 0.7
    finalize(body, mat("Iron", rng.dark_metal(), 0.85, rng.f(0.4,0.6)), subsurf_lvl=1)
    
    # Rim
    rim = make_obj(bpy.ops.mesh.primitive_torus_add, "Rim", (0,0,r*0.85),
        major_radius=r*0.9, minor_radius=r*0.08)
    finalize(rim, mat("RimMetal", rng.dark_metal(), 0.85, 0.45))
    
    # Legs
    for i in range(3):
        a = (i / 3) * math.pi * 2
        leg = make_obj(bpy.ops.mesh.primitive_cone_add, f"Leg{i}",
            (math.cos(a)*r*0.6, math.sin(a)*r*0.6, 0.05),
            radius1=0.03, radius2=0.015, depth=0.15, vertices=6)
        finalize(leg, mat(f"LegMetal{i}", rng.dark_metal(), 0.85, 0.5))
    
    # Liquid inside
    liquid = make_obj(bpy.ops.mesh.primitive_cylinder_add, "Liquid", (0,0,r*0.65),
        radius=r*0.75, depth=0.03, vertices=16)
    lc = rng.pick([(0.2,0.7,0.15,1), (0.6,0.1,0.6,1), (0.1,0.3,0.7,1)])
    finalize(liquid, mat("Liquid", lc, 0.0, 0.05, 0.8, emission=lc, emission_strength=0.3))

# ============ LADDER ============
def build_ladder(rng, idx):
    clear()
    h = rng.f(1.5, 3.0)
    w = rng.f(0.3, 0.45)
    wmat = mat("Wood", rng.wood(), 0.0, 0.78)
    
    # Side rails
    for x in [-1, 1]:
        rail = make_obj(bpy.ops.mesh.primitive_cube_add, f"Rail{x}", (x*w/2, 0, h/2), size=1)
        rail.scale = (0.025, 0.025, h)
        finalize(rail, wmat, bevel_w=0.003, subsurf_lvl=1)
    
    # Rungs
    n_rungs = rng.i(5, 10)
    for i in range(n_rungs):
        z = 0.15 + i * (h - 0.3) / max(n_rungs-1, 1)
        rung = make_obj(bpy.ops.mesh.primitive_cylinder_add, f"Rung{i}",
            (0, 0, z), radius=0.012, depth=w-0.04, vertices=8)
        rung.rotation_euler.y = math.radians(90)
        finalize(rung, wmat, subsurf_lvl=1)

# ============ CATEGORY MAP ============
CATEGORIES = {
    # Weapons — 1,400
    "weapons/swords": (build_sword, 250),
    "weapons/axes": (build_axe, 200),
    "weapons/shields": (build_shield, 250),
    "weapons/hammers": (build_hammer, 200),
    "weapons/spears": (build_spear, 150),
    "weapons/bows": (build_bow, 100),
    "weapons/staffs": (build_staff, 150),
    "weapons/daggers": (build_dagger, 100),
    # Nature — 1,250
    "nature/trees": (build_tree, 350),
    "nature/rocks": (build_rock, 250),
    "nature/bushes": (build_bush, 150),
    "nature/flowers": (build_flower, 100),
    "nature/mushrooms": (build_mushroom, 100),
    "terrain/mountains": (build_mountain, 150),
    "terrain/hills": (build_hill, 150),
    # Furniture — 750
    "furniture/chairs": (build_chair, 200),
    "furniture/tables": (build_table, 200),
    "furniture/bookshelves": (build_bookshelf, 100),
    "furniture/beds": (build_bed, 100),
    "furniture/barrels": (build_barrel, 150),
    # Items — 650
    "items/potions": (build_potion, 200),
    "items/gems": (build_gem, 200),
    "items/chests": (build_chest, 150),
    "items/torches": (build_torch, 100),
    # Buildings — 400
    "buildings/houses": (build_house, 150),
    "buildings/towers": (build_tower, 100),
    "buildings/walls": (build_wall, 80),
    "buildings/bridges": (build_bridge, 70),
    # Props — 650
    "props/campfires": (build_campfire, 100),
    "props/fences": (build_fence, 100),
    "props/wells": (build_well, 80),
    "props/gravestones": (build_gravestone, 80),
    "props/signs": (build_sign, 60),
    "props/anvils": (build_anvil, 60),
    "props/cauldrons": (build_cauldron, 60),
    "props/ladders": (build_ladder, 60),
    "props/mushrooms_giant": (build_mushroom, 50),
    # Armor — 200
    "armor/helmets": (build_helmet, 200),
    # Dungeon — 300
    "dungeon/pillars": (build_pillar, 150),
    "dungeon/crystals": (build_crystal, 150),
}

# ============ MAIN ============
start_cat = sys.argv[sys.argv.index("--start-cat") + 1] if "--start-cat" in sys.argv else None
only_cat = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None

total_planned = sum(min(c, limit) if limit else c for _, (_, c) in CATEGORIES.items())
print(f"\n🏭 Crate Engine HQ Model Factory")
print(f"   Planned: {total_planned} models across {len(CATEGORIES)} categories\n")

total = 0
errors = 0
t0 = time.time()

ADJECTIVES = ["ancient","rustic","elegant","dark","mystic","noble","battle","frost","ember",
              "storm","shadow","iron","golden","silver","crystal","royal","fierce","sacred",
              "twilight","dawn","obsidian","jade","ivory","crimson","azure"]

for cat_path, (builder, count) in CATEGORIES.items():
    if only_cat and cat_path != only_cat:
        continue
    if start_cat and cat_path < start_cat:
        continue
    
    actual_count = min(count, limit) if limit else count
    cat_dir = os.path.join(OUTPUT_DIR, cat_path)
    os.makedirs(cat_dir, exist_ok=True)
    
    sub = cat_path.split("/")[-1]
    singular = sub[:-1] if sub.endswith('s') and sub not in ['glass','grass'] else sub
    
    print(f"{'='*50}")
    print(f"🔨 {cat_path} — {actual_count} models")
    
    cat_errors = 0
    for i in range(actual_count):
        rng = Rng(hash(f"{cat_path}_{i}") % 2147483647)
        adj = rng.pick(ADJECTIVES)
        name = f"{adj}-{singular}-{i:04d}"
        filepath = os.path.join(cat_dir, f"{name}.glb")
        
        try:
            builder(rng, i)
            # Export
            bpy.ops.export_scene.gltf(filepath=filepath, export_format='GLB', use_selection=False)
            size = os.path.getsize(filepath)
            MANIFEST.append({
                "id": f"{cat_path}/{name}",
                "name": name.replace("-", " ").title(),
                "category": cat_path.split("/")[0],
                "subcategory": sub,
                "file": os.path.relpath(filepath, OUTPUT_DIR),
                "size": size
            })
            total += 1
        except Exception as e:
            cat_errors += 1
            errors += 1
            if cat_errors <= 3:
                print(f"  ❌ {name}: {e}")
        
        if (i+1) % 25 == 0 or i == actual_count - 1:
            elapsed = time.time() - t0
            rate = total / max(elapsed, 0.1)
            remaining = (total_planned - total) / max(rate, 0.01)
            print(f"  {i+1}/{actual_count} | Total: {total} | {rate:.1f}/sec | ETA: {remaining/60:.0f}min")
    
    if cat_errors:
        print(f"  ⚠️  {cat_errors} errors in {cat_path}")
    print(f"  ✅ {cat_path} complete")

elapsed = time.time() - t0
print(f"\n{'='*50}")
print(f"🏭 COMPLETE: {total} models in {elapsed/60:.1f} minutes ({total/max(elapsed,0.1):.1f}/sec)")
print(f"   Errors: {errors}")
print(f"   Output: {OUTPUT_DIR}")

# Save manifest
manifest_path = os.path.join(OUTPUT_DIR, "manifest.json")
with open(manifest_path, "w") as f:
    json.dump(MANIFEST, f, indent=2)
print(f"   Manifest: {manifest_path}")
