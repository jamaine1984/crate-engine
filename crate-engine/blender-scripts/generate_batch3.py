"""CRATE ENGINE — Batch 3: Characters, creatures, modern, sci-fi, more variety"""
import bpy, bmesh, math, os, random

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'web', 'models')
generated = 0

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for b in bpy.data.meshes:
        if b.users==0: bpy.data.meshes.remove(b)
    for b in bpy.data.materials:
        if b.users==0: bpy.data.materials.remove(b)

def mat(name, c, r=0.5, m=0.0, e=0.0):
    mt = bpy.data.materials.new(name=name)
    mt.use_nodes = True
    b = mt.node_tree.nodes.get('Principled BSDF')
    if b:
        b.inputs['Base Color'].default_value = (*[x/255 if x>1 else x for x in c],1)
        b.inputs['Roughness'].default_value = r
        b.inputs['Metallic'].default_value = m
        if e>0: b.inputs['Emission Strength'].default_value = e
    return mt

def am(obj, m):
    obj.data.materials.clear()
    obj.data.materials.append(m)

def glb(name):
    global generated
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUTPUT_DIR,f'{name}.glb'),export_format='GLB',use_selection=False,export_apply=True,export_lights=False,export_cameras=False)
    generated += 1
    print(f'[{generated}] {name}')

# More characters with different body types
def make_char(name, body=(70,120,180), skin=(220,180,140), h_scale=1.0, w_scale=1.0):
    clear_scene()
    bm, sm, hm, sh = mat('body',body,0.8), mat('skin',skin,0.85), mat('hair',(40,25,10),0.9), mat('shoe',(50,35,15),0.85)
    s = h_scale; ws = w_scale
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0.85*s))
    bpy.context.active_object.scale=(0.3*ws,0.18,0.4*s); bpy.ops.object.transform_apply(scale=True); am(bpy.context.active_object,bm)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.16*max(s,0.8),segments=12,ring_count=8,location=(0,0,1.25*s)); am(bpy.context.active_object,sm)
    for x in [-0.35*ws,0.35*ws]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.05,depth=0.35*s,location=(x,0,0.85*s)); am(bpy.context.active_object,bm)
    for x in [-0.1*ws,0.1*ws]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.06*ws,depth=0.4*s,location=(x,0,0.43*s)); am(bpy.context.active_object,bm)
    glb(name)

def make_monster(name, color=(100,40,40), size=1.0):
    clear_scene()
    body = mat('body',color,0.85)
    eye = mat('eye',(255,200,0),0.2,0,3)
    s = size
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5*s,segments=10,ring_count=8,location=(0,0,0.6*s))
    obj = bpy.context.active_object
    obj.scale=(1,0.8,1.2); bpy.ops.object.transform_apply(scale=True); am(obj,body)
    # Eyes
    for x in [-0.15*s, 0.15*s]:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.06*s,location=(x,0.4*s,0.75*s)); am(bpy.context.active_object,eye)
    # Legs
    for x in [-0.2*s, 0.2*s]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.08*s,depth=0.3*s,location=(x,0,0.15*s)); am(bpy.context.active_object,body)
    glb(name)

def make_skeleton(name):
    clear_scene()
    bone = mat('bone',(230,220,200),0.85)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.14,segments=10,ring_count=8,location=(0,0,1.4)); am(bpy.context.active_object,bone)
    # Eye sockets (dark)
    dark = mat('dark',(10,10,10),1)
    for x in [-0.04,0.04]:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.03,location=(x,0.12,1.43)); am(bpy.context.active_object,dark)
    # Ribcage
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,1.0))
    bpy.context.active_object.scale=(0.2,0.12,0.35); bpy.ops.object.transform_apply(scale=True); am(bpy.context.active_object,bone)
    # Spine
    bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.03,depth=0.3,location=(0,0,0.75)); am(bpy.context.active_object,bone)
    # Legs
    for x in [-0.08,0.08]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.03,depth=0.5,location=(x,0,0.35)); am(bpy.context.active_object,bone)
    # Arms
    for x in [-0.25,0.25]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.025,depth=0.4,location=(x,0,1.0)); am(bpy.context.active_object,bone)
    glb(name)

def make_ghost(name):
    clear_scene()
    ghost = mat('ghost',(200,210,230),0.6,0,1.5)
    ghost.blend_method = 'BLEND' if hasattr(ghost,'blend_method') else None
    bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=0.4,radius2=0.2,depth=1.2,location=(0,0,0.6))
    am(bpy.context.active_object,ghost)
    dark = mat('eyes',(20,20,80),0.5,0,2)
    for x in [-0.08,0.08]:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.04,location=(x,0.18,0.85)); am(bpy.context.active_object,dark)
    glb(name)

def make_spider(name):
    clear_scene()
    body = mat('body',(30,25,20),0.85)
    eye = mat('eye',(200,30,30),0.3,0,2)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.15,segments=8,ring_count=6,location=(0,0,0.2)); am(bpy.context.active_object,body)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.2,segments=8,ring_count=6,location=(0,-0.2,0.2)); am(bpy.context.active_object,body)
    for i in range(4):
        for side in [-1,1]:
            angle = -0.3 + i*0.2
            bpy.ops.mesh.primitive_cylinder_add(vertices=4,radius=0.015,depth=0.4,location=(side*0.2,angle,0.15))
            bpy.context.active_object.rotation_euler.y = side*0.6
            am(bpy.context.active_object,body)
    for x in [-0.04,0.04]:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.025,location=(x,0.12,0.25)); am(bpy.context.active_object,eye)
    glb(name)

def make_crystal(name,color=(100,50,200)):
    clear_scene()
    m = mat('crystal',color,0.1,0.3,2)
    for i in range(3):
        h = 0.3+random.random()*0.5
        r = 0.05+random.random()*0.08
        x = random.uniform(-0.1,0.1)
        z_off = random.uniform(-0.05,0.05)
        bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=r,depth=h,location=(x,z_off,h/2))
        bpy.context.active_object.rotation_euler=(random.uniform(-0.2,0.2),random.uniform(-0.2,0.2),0)
        am(bpy.context.active_object,m)
    glb(name)

def make_neon_sign(name,color=(255,0,100)):
    clear_scene()
    frame = mat('frame',(30,30,30),0.4,0.7)
    neon = mat('neon',color,0.1,0,10)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0))
    bpy.context.active_object.scale=(1,0.03,0.5); bpy.ops.object.transform_apply(scale=True); am(bpy.context.active_object,frame)
    # Neon tube shape
    bpy.ops.mesh.primitive_torus_add(major_radius=0.2,minor_radius=0.02,location=(0,0.025,0))
    am(bpy.context.active_object,neon)
    glb(name)

def make_car(name,color=(180,30,30)):
    clear_scene()
    body_m = mat('body',color,0.3,0.7)
    glass_m = mat('glass',(100,150,200),0.05,0.3)
    tire_m = mat('tire',(30,30,30),0.9)
    # Body
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0.4))
    bpy.context.active_object.scale=(1.2,2.5,0.5); bpy.ops.object.transform_apply(scale=True); am(bpy.context.active_object,body_m)
    # Cabin
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0.1,0.85))
    bpy.context.active_object.scale=(1,1.2,0.45); bpy.ops.object.transform_apply(scale=True); am(bpy.context.active_object,glass_m)
    # Wheels
    for x,y in [(-0.6,-0.8),(0.6,-0.8),(-0.6,0.8),(0.6,0.8)]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=0.2,depth=0.12,location=(x,y,0.2))
        bpy.context.active_object.rotation_euler.y = math.pi/2
        am(bpy.context.active_object,tire_m)
    glb(name)

def make_helicopter(name):
    clear_scene()
    body_m = mat('body',(60,80,60),0.5,0.3)
    glass_m = mat('glass',(120,180,220),0.05,0.2)
    rotor_m = mat('rotor',(40,40,40),0.3,0.7)
    # Body
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.6,segments=12,ring_count=8,location=(0,0,0.6))
    obj = bpy.context.active_object; obj.scale=(0.8,1.5,0.7); bpy.ops.object.transform_apply(scale=True); am(obj,body_m)
    # Cockpit glass
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.35,segments=10,ring_count=6,location=(0,0.7,0.7))
    am(bpy.context.active_object,glass_m)
    # Tail
    bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=0.25,radius2=0.08,depth=1.5,location=(0,-1.5,0.6))
    bpy.context.active_object.rotation_euler.x = math.pi/2
    am(bpy.context.active_object,body_m)
    # Main rotor
    for i in range(4):
        bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,1.15))
        bpy.context.active_object.scale=(2,0.1,0.01)
        bpy.context.active_object.rotation_euler.z = i*math.pi/2
        bpy.ops.object.transform_apply(scale=True,rotation=True)
        am(bpy.context.active_object,rotor_m)
    # Skids
    for x in [-0.4,0.4]:
        bpy.ops.mesh.primitive_cube_add(size=1,location=(x,0,-0.05))
        bpy.context.active_object.scale=(0.03,1.2,0.03); bpy.ops.object.transform_apply(scale=True); am(bpy.context.active_object,rotor_m)
    glb(name)

def make_spaceship(name):
    clear_scene()
    hull = mat('hull',(160,165,170),0.3,0.7)
    glass = mat('glass',(80,150,200),0.05,0.3)
    engine = mat('engine',(200,100,30),0.2,0.5,3)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1,segments=16,ring_count=8,location=(0,0,0.5))
    obj = bpy.context.active_object; obj.scale=(1,2,0.3); bpy.ops.object.transform_apply(scale=True); am(obj,hull)
    # Cockpit
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.3,segments=10,ring_count=6,location=(0,1,0.3))
    am(bpy.context.active_object,glass)
    # Wings
    for x in [-1,1]:
        bpy.ops.mesh.primitive_cube_add(size=1,location=(x*1.2,0,0.5))
        bpy.context.active_object.scale=(0.8,0.6,0.04); bpy.ops.object.transform_apply(scale=True); am(bpy.context.active_object,hull)
    # Engines
    for x in [-0.8,0.8]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=0.15,depth=0.4,location=(x,-0.8,0.5))
        bpy.context.active_object.rotation_euler.x = math.pi/2
        am(bpy.context.active_object,engine)
    glb(name)

def make_robot(name,color=(120,130,140)):
    clear_scene()
    m = mat('body',color,0.3,0.8)
    eye = mat('eye',(0,200,255),0.1,0,5)
    # Body
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0.7))
    bpy.context.active_object.scale=(0.4,0.25,0.5); bpy.ops.object.transform_apply(scale=True); am(bpy.context.active_object,m)
    # Head
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,1.15))
    bpy.context.active_object.scale=(0.25,0.2,0.25); bpy.ops.object.transform_apply(scale=True); am(bpy.context.active_object,m)
    for x in [-0.06,0.06]:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.04,location=(x,0.11,1.18)); am(bpy.context.active_object,eye)
    # Arms
    for x in [-0.3,0.3]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.04,depth=0.4,location=(x,0,0.65)); am(bpy.context.active_object,m)
    # Legs
    for x in [-0.12,0.12]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=0.06,depth=0.35,location=(x,0,0.25)); am(bpy.context.active_object,m)
    glb(name)

def make_mushroom_house(name):
    clear_scene()
    stem = mat('stem',(220,210,190),0.9)
    cap = mat('cap',(200,50,50),0.75)
    door = mat('door',(70,45,15),0.9)
    bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=0.6,depth=1.5,location=(0,0,0.75)); am(bpy.context.active_object,stem)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1.2,segments=14,ring_count=8,location=(0,0,1.8))
    obj = bpy.context.active_object; obj.scale.z=0.5; bpy.ops.object.transform_apply(scale=True); am(obj,cap)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0.61,0.45))
    bpy.context.active_object.scale=(0.3,0.02,0.7); bpy.ops.object.transform_apply(scale=True); am(bpy.context.active_object,door)
    # Spots
    for i in range(8):
        a=random.uniform(0,math.pi*2); el=random.uniform(0.1,0.6)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.08,location=(math.cos(a)*0.8*el,math.sin(a)*0.8*el,1.8+0.4*el))
        am(bpy.context.active_object,mat(f'spot_{i}',(255,255,240),0.85))
    glb(name)

def make_treehouse(name):
    clear_scene()
    trunk = mat('trunk',(80,55,20),0.9)
    leaf = mat('leaf',(30,120,20),0.85)
    wood = mat('wood',(110,80,35),0.9)
    bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=0.3,depth=5,location=(0,0,2.5)); am(bpy.context.active_object,trunk)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=2,segments=12,ring_count=8,location=(0,0,5.5)); am(bpy.context.active_object,leaf)
    # Platform
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,3))
    bpy.context.active_object.scale=(2,2,0.08); bpy.ops.object.transform_apply(scale=True); am(bpy.context.active_object,wood)
    # Small house
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,3.7))
    bpy.context.active_object.scale=(1.2,1.2,1.2); bpy.ops.object.transform_apply(scale=True); am(bpy.context.active_object,wood)
    bpy.ops.mesh.primitive_cone_add(vertices=4,radius1=1,depth=0.8,location=(0,0,4.7))
    bpy.context.active_object.rotation_euler.z=math.pi/4; am(bpy.context.active_object,mat('roof',(120,50,20),0.8))
    glb(name)

print("\n=== BATCH 3 ===\n")

# Characters — many variants
body_colors = [
    ((200,50,50),'red'), ((50,50,200),'blue'), ((50,150,50),'green'),
    ((200,200,50),'gold'), ((150,50,150),'purple'), ((200,100,50),'orange'),
    ((50,200,200),'cyan'), ((200,150,100),'tan'), ((100,100,100),'gray'),
    ((20,20,20),'black'), ((255,255,255),'white'), ((150,80,40),'copper'),
]
skin_tones = [(220,180,140),(180,140,100),(140,100,60),(100,60,30),(80,45,20),(240,210,180)]

for bc, bname in body_colors:
    for i, st in enumerate(skin_tones[:3]):
        make_char(f'char_{bname}_skin{i}', bc, st)
# Big/small variants
for i in range(5):
    bc = random.choice(body_colors)
    make_char(f'char_big_{i:02d}', bc[0], random.choice(skin_tones), h_scale=1.3, w_scale=1.3)
for i in range(5):
    bc = random.choice(body_colors)
    make_char(f'char_small_{i:02d}', bc[0], random.choice(skin_tones), h_scale=0.7, w_scale=0.8)

# Creatures
monster_colors = [(100,40,40),(40,100,40),(40,40,100),(100,100,40),(100,40,100),(40,100,100),(80,80,80)]
for i,mc in enumerate(monster_colors):
    make_monster(f'monster_{i:02d}', mc, 0.8+random.random()*0.8)
for i in range(3):
    make_skeleton(f'skeleton_{i:02d}')
for i in range(3):
    make_ghost(f'ghost_{i:02d}')
for i in range(3):
    make_spider(f'spider_{i:02d}')

# Crystals
crystal_colors = [(100,50,200),(50,200,100),(200,50,50),(50,150,255),(255,200,50),(200,100,200)]
for i,cc in enumerate(crystal_colors):
    make_crystal(f'crystal_{i:02d}',cc)

# Modern/Cyberpunk
for i in range(5):
    c = random.choice([(255,0,100),(0,255,100),(100,0,255),(255,255,0),(0,255,255)])
    make_neon_sign(f'neon_sign_{i:02d}',c)
car_colors = [(180,30,30),(30,30,180),(30,130,30),(200,200,30),(30,30,30),(200,200,200)]
for i,cc in enumerate(car_colors):
    make_car(f'car_{i:02d}',cc)

# Vehicles
make_helicopter('helicopter')
for i in range(3):
    make_spaceship(f'spaceship_{i:02d}')
for i in range(3):
    make_robot(f'robot_{i:02d}',random.choice([(120,130,140),(180,50,50),(50,50,180)]))

# Fantasy
make_mushroom_house('mushroom_house')
make_treehouse('treehouse')

print(f"\n✅ BATCH 3: {generated}")
