"""Batch 5: Final push to 2000+ — armor, shields, more buildings, misc"""
import bpy, bmesh, math, os, random
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'web', 'models')
g = 0
def cs():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for b in bpy.data.meshes:
        if b.users==0: bpy.data.meshes.remove(b)
    for b in bpy.data.materials:
        if b.users==0: bpy.data.materials.remove(b)
def mt(n,c,r=0.5,m=0.0,e=0.0):
    ma=bpy.data.materials.new(name=n);ma.use_nodes=True;b=ma.node_tree.nodes.get('Principled BSDF')
    if b:b.inputs['Base Color'].default_value=(*[x/255 if x>1 else x for x in c],1);b.inputs['Roughness'].default_value=r;b.inputs['Metallic'].default_value=m
    if b and e>0:b.inputs['Emission Strength'].default_value=e
    return ma
def am(o,m):o.data.materials.clear();o.data.materials.append(m)
def ex(n):
    global g;bpy.ops.export_scene.gltf(filepath=os.path.join(OUTPUT_DIR,f'{n}.glb'),export_format='GLB',use_selection=False,export_apply=True,export_lights=False,export_cameras=False);g+=1;print(f'[{g}] {n}')

print("\n=== BATCH 5 (final) ===\n")

# Helmets (10)
for i in range(10):
    cs()
    c=random.choice([(150,150,160),(180,160,40),(80,80,90),(140,60,60),(60,60,140)])
    m=mt(f'helm',c,0.3,0.8)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.18,segments=12,ring_count=8,location=(0,0,0))
    o=bpy.context.active_object
    bpy.ops.object.mode_set(mode='EDIT')
    bm=bmesh.from_edit_mesh(o.data)
    verts=[v for v in bm.verts if v.co.z<-0.05]
    bmesh.ops.delete(bm,geom=verts,context='VERTS')
    bmesh.update_edit_mesh(o.data);bpy.ops.object.mode_set(mode='OBJECT')
    am(o,m)
    # Nose guard on some
    if i%3==0:
        bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0.16,-0.02))
        bpy.context.active_object.scale=(0.02,0.02,0.15);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,m)
    ex(f'helmet_{i:02d}')

# Armor pieces (10)
for i in range(10):
    cs()
    c=random.choice([(140,140,150),(100,80,40),(80,30,30),(30,30,80),(60,60,60)])
    m=mt('armor',c,0.3,0.8)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0.5))
    bpy.context.active_object.scale=(0.35,0.2,0.45);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,m)
    # Shoulder pads
    for x in [-0.22,0.22]:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.08,segments=8,ring_count=6,location=(x,0,0.7))
        am(bpy.context.active_object,m)
    ex(f'armor_{i:02d}')

# Spears (5)
for i in range(5):
    cs()
    w=mt('wood',(90,65,25),0.9);b=mt('blade',(180,180,190),0.2,0.9)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.02,depth=2,location=(0,0,1));am(bpy.context.active_object,w)
    bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=0.04,depth=0.2,location=(0,0,2.1));am(bpy.context.active_object,b)
    ex(f'spear_{i:02d}')

# Hammers (5)
for i in range(5):
    cs()
    w=mt('wood',(90,65,25),0.9);m=mt('metal',(120,120,130),0.3,0.8)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.025,depth=1,location=(0,0,0.5));am(bpy.context.active_object,w)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,1.05))
    bpy.context.active_object.scale=(0.25,0.12,0.12);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,m)
    ex(f'hammer_{i:02d}')

# Daggers (5)
for i in range(5):
    cs()
    b=mt('blade',(180,180,195),0.2,0.9);g_m=mt('grip',(60,30,10),0.9)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0.2))
    bpy.context.active_object.scale=(0.025,0.008,0.3);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,b)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.018,depth=0.1,location=(0,0,0.02));am(bpy.context.active_object,g_m)
    ex(f'dagger_{i:02d}')

# Crossbow (3)
for i in range(3):
    cs()
    w=mt('wood',(100,60,20),0.85);s=mt('string',(200,190,170),0.9)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0.1))
    bpy.context.active_object.scale=(0.03,0.4,0.03);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,w)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0.1))
    bpy.context.active_object.scale=(0.4,0.03,0.03);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,w)
    bpy.ops.mesh.primitive_cylinder_add(vertices=4,radius=0.003,depth=0.38,location=(0,0,0.1))
    bpy.context.active_object.rotation_euler.y=math.pi/2;am(bpy.context.active_object,s)
    ex(f'crossbow_{i:02d}')

# Quiver (3)
for i in range(3):
    cs()
    l=mt('leather',(120,70,30),0.85)
    bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=0.06,depth=0.5,location=(0,0,0.25));am(bpy.context.active_object,l)
    # Arrows
    for j in range(4):
        bpy.ops.mesh.primitive_cylinder_add(vertices=4,radius=0.005,depth=0.6,location=(random.uniform(-0.03,0.03),random.uniform(-0.03,0.03),0.35))
        am(bpy.context.active_object,mt(f'arrow_{j}',(180,170,140),0.8))
    ex(f'quiver_{i:02d}')

# Throne (3)
for i in range(3):
    cs()
    c=random.choice([(160,140,40),(140,30,30),(60,40,80)])
    w=mt('wood',(70,45,15),0.85);v=mt('velvet',c,0.9)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0.35))
    bpy.context.active_object.scale=(0.6,0.5,0.7);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,w)
    # Back
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,-0.24,0.9))
    bpy.context.active_object.scale=(0.55,0.04,1.1);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,w)
    # Cushion
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0.72))
    bpy.context.active_object.scale=(0.5,0.4,0.06);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,v)
    # Armrests
    for x in [-0.28,0.28]:
        bpy.ops.mesh.primitive_cube_add(size=1,location=(x,0,0.55))
        bpy.context.active_object.scale=(0.04,0.4,0.04);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,w)
    ex(f'throne_{i:02d}')

# Chandelier (3)
for i in range(3):
    cs()
    m=mt('metal',(120,100,30),0.3,0.7);f=mt('flame',(255,200,60),0.2,0,5)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.4,minor_radius=0.02,location=(0,0,0));am(bpy.context.active_object,m)
    for j in range(6):
        a=j*math.pi*2/6
        bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.015,depth=0.1,location=(math.cos(a)*0.4,math.sin(a)*0.4,0.05))
        am(bpy.context.active_object,m)
        bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=0.025,depth=0.06,location=(math.cos(a)*0.4,math.sin(a)*0.4,0.13))
        am(bpy.context.active_object,f)
    bpy.ops.mesh.primitive_cylinder_add(vertices=4,radius=0.008,depth=0.5,location=(0,0,0.25));am(bpy.context.active_object,m)
    ex(f'chandelier_{i:02d}')

# Piano (1)
cs()
w=mt('piano',(20,15,10),0.6,0.3);k=mt('keys',(240,235,220),0.5)
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0.5))
bpy.context.active_object.scale=(1,0.5,0.6);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,w)
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0.26,0.82))
bpy.context.active_object.scale=(0.9,0.02,0.05);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,k)
ex('piano')

# Grandfather clock (1)
cs()
w=mt('wood',(80,50,20),0.85);g_m=mt('gold',(200,170,40),0.2,0.8);f=mt('face',(240,235,220),0.7)
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,1))
bpy.context.active_object.scale=(0.4,0.25,2);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,w)
bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=0.15,depth=0.02,location=(0,0.13,1.6));am(bpy.context.active_object,f)
bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=0.12,depth=0.8,location=(0,0,0.45))
am(bpy.context.active_object,make_mat('glass',(200,210,220),0.05,0.2) if False else g_m)
ex('grandfather_clock')

# Bathtub (2)
for i in range(2):
    cs()
    m=mt('porcelain',(240,235,225),0.4,0.1)
    bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=0.5,depth=0.4,location=(0,0,0.35))
    o=bpy.context.active_object;o.scale=(0.6,1,1);bpy.ops.object.transform_apply(scale=True);am(o,m)
    # Water
    w=mt('water',(100,160,200),0.1,0.1)
    bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=0.45,depth=0.02,location=(0,0,0.5))
    bpy.context.active_object.scale=(0.55,0.95,1);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,w)
    ex(f'bathtub_{i:02d}')

# Toilet (2)
for i in range(2):
    cs()
    m=mt('porcelain',(240,235,225),0.4,0.1)
    bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=0.15,depth=0.3,location=(0,0,0.15));am(bpy.context.active_object,m)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,-0.1,0.4))
    bpy.context.active_object.scale=(0.15,0.08,0.3);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,m)
    ex(f'toilet_{i:02d}')

# Sink (2)
for i in range(2):
    cs()
    m=mt('porcelain',(240,235,225),0.4,0.1);f=mt('faucet',(180,180,190),0.2,0.8)
    bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=0.2,depth=0.1,location=(0,0,0.8));am(bpy.context.active_object,m)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.02,depth=0.15,location=(0,-0.1,0.95));am(bpy.context.active_object,f)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0.4))
    bpy.context.active_object.scale=(0.25,0.15,0.75);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,m)
    ex(f'sink_{i:02d}')

# Stove (2)
for i in range(2):
    cs()
    m=mt('metal',(40,40,45),0.4,0.7)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0.45))
    bpy.context.active_object.scale=(0.5,0.4,0.9);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,m)
    for x,y in [(-0.12,-0.08),(0.12,-0.08),(-0.12,0.08),(0.12,0.08)]:
        bpy.ops.mesh.primitive_torus_add(major_radius=0.06,minor_radius=0.008,location=(x,y,0.91))
        am(bpy.context.active_object,mt(f'burner_{x}',(60,20,20),0.5,0.3))
    ex(f'stove_{i:02d}')

# Refrigerator (2)
for i in range(2):
    cs()
    m=mt('metal',(200,200,205),0.3,0.6);h=mt('handle',(160,160,165),0.2,0.8)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0.9))
    bpy.context.active_object.scale=(0.5,0.45,1.8);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,m)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0.22,0.23,1.1))
    bpy.context.active_object.scale=(0.02,0.02,0.3);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,h)
    ex(f'refrigerator_{i:02d}')

# Washing machine (2)
for i in range(2):
    cs()
    m=mt('metal',(220,220,225),0.3,0.5);g_m=mt('glass',(150,180,200),0.05,0.2)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0.4))
    bpy.context.active_object.scale=(0.45,0.4,0.8);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,m)
    bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=0.12,depth=0.02,location=(0,0.21,0.45))
    am(bpy.context.active_object,g_m)
    ex(f'washing_machine_{i:02d}')

# Sofa (3)
for i in range(3):
    cs()
    c=random.choice([(100,60,40),(60,60,120),(120,40,40),(40,100,60)])
    m=mt('fabric',c,0.9)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0.25))
    bpy.context.active_object.scale=(1.2,0.5,0.5);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,m)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,-0.22,0.55))
    bpy.context.active_object.scale=(1.15,0.06,0.55);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,m)
    for x in [-0.6,0.6]:
        bpy.ops.mesh.primitive_cube_add(size=1,location=(x,0,0.35))
        bpy.context.active_object.scale=(0.06,0.45,0.25);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,m)
    ex(f'sofa_{i:02d}')

# TV (2)
for i in range(2):
    cs()
    f=mt('frame',(20,20,20),0.4,0.3);s=mt('screen',(10,10,15),0.1,0.1,0.5)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0))
    bpy.context.active_object.scale=(1,0.03,0.6);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,f)
    bpy.ops.mesh.primitive_plane_add(size=0.9,location=(0,0.02,0))
    bpy.context.active_object.scale=(1,0.6,1);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,s)
    ex(f'tv_{i:02d}')

# Computer/desk setup (2)
for i in range(2):
    cs()
    m=mt('plastic',(40,40,45),0.6);s=mt('screen',(50,70,100),0.1,0,1)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0.5))
    bpy.context.active_object.scale=(0.4,0.02,0.3);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,m)
    bpy.ops.mesh.primitive_plane_add(size=0.35,location=(0,0.015,0.5))
    bpy.context.active_object.scale=(1,0.75,1);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,s)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0.05,0.25))
    bpy.context.active_object.scale=(0.04,0.04,0.2);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,m)
    ex(f'computer_{i:02d}')

# Lamp (desk) (3)
for i in range(3):
    cs()
    m=mt('metal',(60,60,65),0.3,0.7);l=mt('shade',(220,200,160),0.8)
    bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=0.08,depth=0.02,location=(0,0,0.01));am(bpy.context.active_object,m)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.01,depth=0.4,location=(0,0,0.21));am(bpy.context.active_object,m)
    bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=0.12,radius2=0.06,depth=0.12,location=(0,0,0.45));am(bpy.context.active_object,l)
    ex(f'desk_lamp_{i:02d}')

# Floor lamp (3)
for i in range(3):
    cs()
    m=mt('metal',(50,50,55),0.3,0.7);l=mt('shade',(200,180,140),0.8)
    bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=0.1,depth=0.03,location=(0,0,0.015));am(bpy.context.active_object,m)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.015,depth=1.5,location=(0,0,0.78));am(bpy.context.active_object,m)
    bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=0.18,radius2=0.08,depth=0.2,location=(0,0,1.6));am(bpy.context.active_object,l)
    ex(f'floor_lamp_{i:02d}')

# Bookcase large (3)
for i in range(3):
    cs()
    w=mt('wood',(80+random.randint(-15,15),50+random.randint(-10,10),20+random.randint(-5,5)),0.85)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,1.2))
    bpy.context.active_object.scale=(1.2,0.3,2.4);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,w)
    for z in [0.05,0.5,0.95,1.4,1.85]:
        bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,z))
        bpy.context.active_object.scale=(1.15,0.28,0.03);bpy.ops.object.transform_apply(scale=True);am(bpy.context.active_object,w)
    ex(f'bookcase_large_{i:02d}')

# Potted plant (5)
for i in range(5):
    cs()
    p=mt('pot',(random.randint(120,180),random.randint(60,100),random.randint(20,50)),0.8)
    l=mt('leaf',(30+random.randint(0,40),100+random.randint(0,60),20+random.randint(0,30)),0.85)
    d=mt('dirt',(80,60,30),0.95)
    bpy.ops.mesh.primitive_cone_add(vertices=10,radius1=0.12,radius2=0.08,depth=0.2,location=(0,0,0.1));am(bpy.context.active_object,p)
    bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=0.07,depth=0.02,location=(0,0,0.21));am(bpy.context.active_object,d)
    for j in range(random.randint(3,6)):
        a=j*math.pi*2/max(3,j)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=random.uniform(0.06,0.12),segments=6,ring_count=4,location=(math.cos(a)*0.04,math.sin(a)*0.04,0.3+random.uniform(0,0.1)))
        am(bpy.context.active_object,l)
    ex(f'potted_plant_{i:02d}')

print(f"\n✅ BATCH 5: {g}")
