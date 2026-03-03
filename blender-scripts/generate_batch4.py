"""CRATE ENGINE — Batch 4: Fill to 2000+ — food, animals, more trees, decorative"""
import bpy, bmesh, math, os, random

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'web', 'models')
generated = 0

def cs():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for b in bpy.data.meshes:
        if b.users==0: bpy.data.meshes.remove(b)
    for b in bpy.data.materials:
        if b.users==0: bpy.data.materials.remove(b)

def mt(n,c,r=0.5,m=0.0,e=0.0):
    ma=bpy.data.materials.new(name=n); ma.use_nodes=True; b=ma.node_tree.nodes.get('Principled BSDF')
    if b: b.inputs['Base Color'].default_value=(*[x/255 if x>1 else x for x in c],1); b.inputs['Roughness'].default_value=r; b.inputs['Metallic'].default_value=m
    if b and e>0: b.inputs['Emission Strength'].default_value=e
    return ma

def am(o,m): o.data.materials.clear(); o.data.materials.append(m)

def ex(n):
    global generated
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUTPUT_DIR,f'{n}.glb'),export_format='GLB',use_selection=False,export_apply=True,export_lights=False,export_cameras=False)
    generated+=1; print(f'[{generated}] {n}')

# FOOD
def make_apple(n,c=(200,40,40)):
    cs(); m=mt('apple',c,0.7); s=mt('stem',(80,50,20),0.9)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.08,segments=10,ring_count=6,location=(0,0,0.08)); am(bpy.context.active_object,m)
    bpy.ops.mesh.primitive_cylinder_add(vertices=4,radius=0.008,depth=0.04,location=(0,0,0.17)); am(bpy.context.active_object,s)
    ex(n)

def make_bread(n):
    cs(); m=mt('bread',(200,160,80),0.85)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.12,segments=8,ring_count=6,location=(0,0,0.08))
    o=bpy.context.active_object; o.scale=(0.6,1,0.5); bpy.ops.object.transform_apply(scale=True); am(o,m); ex(n)

def make_cheese(n):
    cs(); m=mt('cheese',(240,200,50),0.8)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0.06))
    bpy.context.active_object.scale=(0.15,0.12,0.08); bpy.ops.object.transform_apply(scale=True); am(bpy.context.active_object,m); ex(n)

def make_mug(n):
    cs(); m=mt('clay',(160,120,80),0.85)
    bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=0.05,depth=0.1,location=(0,0,0.05)); am(bpy.context.active_object,m)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.04,minor_radius=0.008,location=(0.06,0,0.05))
    bpy.context.active_object.rotation_euler.x=math.pi/2; am(bpy.context.active_object,m); ex(n)

def make_plate(n):
    cs(); m=mt('ceramic',(230,225,215),0.7)
    bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=0.12,depth=0.015,location=(0,0,0.008)); am(bpy.context.active_object,m); ex(n)

def make_goblet(n):
    cs(); m=mt('gold',(200,170,40),0.2,0.8)
    bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=0.04,depth=0.08,location=(0,0,0.04)); am(bpy.context.active_object,m)
    bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=0.02,depth=0.05,location=(0,0,0.1)); am(bpy.context.active_object,m)
    bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=0.05,depth=0.015,location=(0,0,0.003)); am(bpy.context.active_object,m); ex(n)

# DECORATIVE
def make_banner(n,c=(180,30,30)):
    cs(); m=mt('cloth',c,0.9); p=mt('pole',(80,50,20),0.85)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.02,depth=1.5,location=(0,0,0.75)); am(bpy.context.active_object,p)
    bpy.ops.mesh.primitive_plane_add(size=0.5,location=(0.15,0,1.1))
    bpy.context.active_object.scale=(0.6,1,0.8); am(bpy.context.active_object,m); ex(n)

def make_flag(n,c=(200,200,200)):
    cs(); m=mt('cloth',c,0.9); p=mt('pole',(100,100,110),0.3,0.7)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.02,depth=2,location=(0,0,1)); am(bpy.context.active_object,p)
    bpy.ops.mesh.primitive_plane_add(size=0.4,location=(0.2,0,1.7))
    am(bpy.context.active_object,m); ex(n)

def make_gravestone_fancy(n):
    cs(); s=mt('stone',(140,135,125),0.85)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0.4))
    bpy.context.active_object.scale=(0.4,0.08,0.8); bpy.ops.object.transform_apply(scale=True)
    o=bpy.context.active_object
    bpy.ops.object.mode_set(mode='EDIT')
    bm=bmesh.from_edit_mesh(o.data)
    for v in bm.verts:
        if v.co.z>0.3: v.co.x*=0.7+0.3*math.cos((v.co.z-0.3)*3)
    bmesh.update_edit_mesh(o.data); bpy.ops.object.mode_set(mode='OBJECT')
    am(o,s); ex(n)

def make_anvil(n):
    cs(); m=mt('iron',(60,60,65),0.4,0.8)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0.15))
    bpy.context.active_object.scale=(0.3,0.5,0.15); bpy.ops.object.transform_apply(scale=True); am(bpy.context.active_object,m)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0.35))
    bpy.context.active_object.scale=(0.2,0.3,0.25); bpy.ops.object.transform_apply(scale=True); am(bpy.context.active_object,m)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0.15,0.45))
    bpy.context.active_object.scale=(0.15,0.25,0.05); bpy.ops.object.transform_apply(scale=True); am(bpy.context.active_object,m); ex(n)

def make_cauldron(n):
    cs(); m=mt('iron',(40,40,45),0.4,0.7); l=mt('liquid',(30,150,30),0.3,0,2)
    bpy.ops.mesh.primitive_cylinder_add(vertices=14,radius=0.35,depth=0.5,location=(0,0,0.35)); am(bpy.context.active_object,m)
    bpy.ops.mesh.primitive_cylinder_add(vertices=14,radius=0.3,depth=0.1,location=(0,0,0.55)); am(bpy.context.active_object,l)
    for x in [-0.2,0.2]:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.04,location=(x,0,0.1)); am(bpy.context.active_object,m)
    ex(n)

def make_scarecrow(n):
    cs(); w=mt('wood',(90,65,25),0.9); c=mt('cloth',(140,100,50),0.9); h=mt('hat',(60,40,15),0.85)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.03,depth=1.5,location=(0,0,0.75)); am(bpy.context.active_object,w)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.03,depth=1,location=(0,0,1.1))
    bpy.context.active_object.rotation_euler.y=math.pi/2; am(bpy.context.active_object,w)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.15,location=(0,0,1.65)); am(bpy.context.active_object,c)
    bpy.ops.mesh.primitive_cone_add(vertices=8,radius1=0.2,depth=0.15,location=(0,0,1.85)); am(bpy.context.active_object,h)
    # Body cloth
    bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=0.3,radius2=0.15,depth=0.6,location=(0,0,1.0)); am(bpy.context.active_object,c)
    ex(n)

def make_sack(n):
    cs(); m=mt('burlap',(160,140,90),0.95)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.2,segments=8,ring_count=6,location=(0,0,0.15))
    o=bpy.context.active_object; o.scale=(1,0.8,0.8); bpy.ops.object.transform_apply(scale=True); am(o,m); ex(n)

def make_wagon_wheel(n):
    cs(); w=mt('wood',(100,70,30),0.85); m=mt('metal',(70,70,75),0.4,0.7)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.4,minor_radius=0.03,location=(0,0,0.4)); am(bpy.context.active_object,m)
    for i in range(8):
        a=i*math.pi/4
        bpy.ops.mesh.primitive_cylinder_add(vertices=4,radius=0.015,depth=0.35,location=(math.cos(a)*0.2,math.sin(a)*0.2,0.4))
        bpy.context.active_object.rotation_euler=(math.cos(a)*math.pi/2,math.sin(a)*math.pi/2,0)
        am(bpy.context.active_object,w)
    ex(n)

# More trees
def make_dead_tree(n):
    cs(); m=mt('dead',(80,65,50),0.9)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.12,depth=2,location=(0,0,1)); am(bpy.context.active_object,m)
    for i in range(3):
        a=random.uniform(0,math.pi*2); el=random.uniform(0.3,0.7)
        bpy.ops.mesh.primitive_cylinder_add(vertices=4,radius=0.04,depth=0.8,location=(math.cos(a)*0.15,math.sin(a)*0.15,1.5+el))
        bpy.context.active_object.rotation_euler=(random.uniform(-0.5,0.5),random.uniform(-0.5,0.5),0)
        am(bpy.context.active_object,m)
    ex(n)

def make_cherry_tree(n):
    cs(); t=mt('trunk',(80,50,25),0.9); p=mt('petals',(255,180,200),0.75)
    bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=0.12,depth=1.8,location=(0,0,0.9)); am(bpy.context.active_object,t)
    for i in range(5):
        x=random.uniform(-0.4,0.4); y=random.uniform(-0.4,0.4); z=random.uniform(1.5,2.5)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=random.uniform(0.3,0.6),segments=8,ring_count=6,location=(x,y,z))
        am(bpy.context.active_object,p)
    ex(n)

def make_willow_tree(n):
    cs(); t=mt('trunk',(70,55,25),0.9); l=mt('leaf',(50,100,40),0.85)
    bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=0.2,depth=2.5,location=(0,0,1.25)); am(bpy.context.active_object,t)
    for i in range(12):
        a=i*math.pi*2/12
        bpy.ops.mesh.primitive_cylinder_add(vertices=4,radius=0.02,depth=2,location=(math.cos(a)*0.5,math.sin(a)*0.5,1.5))
        bpy.context.active_object.rotation_euler=(random.uniform(0.2,0.5)*math.cos(a),random.uniform(0.2,0.5)*math.sin(a),0)
        am(bpy.context.active_object,l)
    ex(n)

print("\n=== BATCH 4 ===\n")

# Food (30)
for i in range(5): make_apple(f'apple_{i:02d}',random.choice([(200,40,40),(40,180,40),(200,180,40)]))
for i in range(3): make_bread(f'bread_{i:02d}')
for i in range(3): make_cheese(f'cheese_{i:02d}')
for i in range(5): make_mug(f'mug_{i:02d}')
for i in range(3): make_plate(f'plate_{i:02d}')
for i in range(3): make_goblet(f'goblet_{i:02d}')

# Decorative (40)
for i in range(6): make_banner(f'banner_{i:02d}',random.choice([(180,30,30),(30,30,180),(30,130,30),(180,160,40),(150,30,150)]))
for i in range(5): make_flag(f'flag_{i:02d}',random.choice([(200,200,200),(180,30,30),(30,30,180),(200,180,50)]))
for i in range(5): make_gravestone_fancy(f'gravestone_{i:02d}')
for i in range(3): make_anvil(f'anvil_{i:02d}')
for i in range(3): make_cauldron(f'cauldron_{i:02d}')
for i in range(3): make_scarecrow(f'scarecrow_{i:02d}')
for i in range(5): make_sack(f'sack_{i:02d}')
for i in range(3): make_wagon_wheel(f'wagon_wheel_{i:02d}')

# More trees (40)
for i in range(10): make_dead_tree(f'dead_tree_{i:02d}')
for i in range(8): make_cherry_tree(f'cherry_tree_{i:02d}')
for i in range(5): make_willow_tree(f'willow_{i:02d}')

# More rocks with different colors (30)
for i in range(10):
    cs()
    c = random.choice([(80,75,70),(140,130,110),(100,90,80),(160,150,130),(60,60,70)])
    m=mt('rock',c,0.9)
    s=0.3+random.random()*1.0
    bpy.ops.mesh.primitive_ico_sphere_add(radius=0.5*s,subdivisions=2,location=(0,0,0.25*s))
    o=bpy.context.active_object; o.scale=(random.uniform(0.7,1.4),random.uniform(0.7,1.4),random.uniform(0.4,0.8))
    bpy.ops.object.transform_apply(scale=True); am(o,m)
    bpy.ops.object.mode_set(mode='EDIT')
    bm=bmesh.from_edit_mesh(o.data)
    for v in bm.verts: v.co.x+=random.uniform(-0.08,0.08)*s; v.co.y+=random.uniform(-0.08,0.08)*s
    bmesh.update_edit_mesh(o.data); bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.shade_smooth()
    ex(f'boulder_{i:02d}')

# More flowers (20)
for i in range(20):
    cs()
    fc=random.choice([(255,100,100),(100,100,255),(255,255,100),(255,150,200),(200,100,255),(100,255,200)])
    sm=mt('stem',(40,120,20),0.8); pm=mt('petal',fc,0.7); cm=mt('center',(255,200,50),0.6)
    h=0.3+random.random()*0.3
    bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.015,depth=h,location=(0,0,h/2)); am(bpy.context.active_object,sm)
    for j in range(random.randint(5,8)):
        a=j*math.pi*2/max(5,j+1)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.06,segments=6,ring_count=4,location=(math.cos(a)*0.06,math.sin(a)*0.06,h+0.02))
        o=bpy.context.active_object; o.scale.z=0.3; bpy.ops.object.transform_apply(scale=True); am(o,pm)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.04,location=(0,0,h+0.02)); am(bpy.context.active_object,cm)
    ex(f'wildflower_{i:02d}')

# Misc props (20)
for i in range(5):
    cs(); m=mt('metal',(150,150,155),0.3,0.8)
    bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=0.04+random.random()*0.04,depth=0.6+random.random()*0.4,location=(0,0,0.3))
    am(bpy.context.active_object,m); ex(f'candle_{i:02d}')

for i in range(5):
    cs(); m=mt('clay',(180,140,80),0.85)
    bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=0.1+random.random()*0.05,depth=0.2+random.random()*0.1,location=(0,0,0.1))
    am(bpy.context.active_object,m)
    bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=0.03,depth=0.1,location=(0,0,0.25))
    am(bpy.context.active_object,m); ex(f'vase_{i:02d}')

for i in range(5):
    cs(); m=mt('metal',(180,160,40),0.2,0.8)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.06+random.random()*0.03,minor_radius=0.01,location=(0,0,0))
    am(bpy.context.active_object,m); ex(f'ring_{i:02d}')

for i in range(5):
    cs(); m=mt('metal',(200,180,50),0.2,0.9)
    bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=0.06,depth=0.003,location=(0,0,0))
    am(bpy.context.active_object,m); ex(f'coin_{i:02d}')

print(f"\n✅ BATCH 4: {generated}")
