import {Box3,Vector3,Quaternion,Matrix4,MathUtils} from 'three';
let rapierPromise;
const STEP=1/60,FLAT_HALF_DEPTH=.5,FLAT_TRIANGLE_LIMIT=4000,MESH_TRIANGLE_LIMIT=100000,HULL_POINT_LIMIT=20000,RESPAWN_GRACE=.75;

/** Collect an entity's own mesh triangles in body-local (unscaled world-size) coordinates. */
function localTriangles(entity,object,inverse,scale){
 const positions=[],indices=[],point=new Vector3(),matrix=new Matrix4(),scaleMatrix=new Matrix4().makeScale(scale.x,scale.y,scale.z);
 object.traverse(mesh=>{
  if(!mesh.isMesh||!mesh.geometry?.attributes.position||mesh.userData.entityId&&mesh.userData.entityId!==entity.id)return;
  matrix.multiplyMatrices(scaleMatrix,new Matrix4().multiplyMatrices(inverse,mesh.matrixWorld));
  const attribute=mesh.geometry.attributes.position,base=positions.length/3,index=mesh.geometry.index;
  for(let i=0;i<attribute.count;i++){point.fromBufferAttribute(attribute,i).applyMatrix4(matrix);positions.push(point.x,point.y,point.z);}
  if(index)for(let i=0;i<index.count;i++)indices.push(base+index.getX(i));else for(let i=0;i<attribute.count;i++)indices.push(base+i);
 });
 return {positions,indices};
}

export async function createPhysics(project,objects,{onScore=()=>{},onLog=()=>{},onEvent=()=>{}}={}){
 rapierPromise??=import('@dimforge/rapier3d-compat').then(async module=>{await module.default.init();return module.default;});
 const R=await rapierPromise,world=new R.World({x:0,y:project.settings.gravity,z:0}),bodies=new Map(),keys=new Set(),collected=new Set(),heights=new Map();
 let accumulator=0,score=0,jumpPressed=false,disposed=false,input={x:0,z:0,jump:false},elapsed=0,status='playing';
 // Side-view players face the way they last moved (art is authored facing right).
 const facing=new Map();
 const killY=Number.isFinite(project.settings.killY)?project.settings.killY:-30,maxLives=project.settings.lives||0;let lives=maxLives;
 const axis=value=>Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;
 function setInput(next={}){if(disposed)return;const jump=next.jump===true;if(jump&&!input.jump&&!keys.has('Space'))jumpPressed=true;input={x:axis(next.x),z:axis(next.z),jump};}
 function clearInput(){keys.clear();input={x:0,z:0,jump:false};jumpPressed=false;}
 const down=event=>{if(event.target?.closest?.('input,textarea,select,[contenteditable=true]'))return;if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code)){if(event.code==='Space'&&!keys.has(event.code)&&!input.jump)jumpPressed=true;keys.add(event.code);event.preventDefault();}};
 const up=event=>keys.delete(event.code),blur=()=>clearInput(),visibility=()=>{if(globalThis.document?.hidden)clearInput();};
 window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);globalThis.document?.addEventListener?.('visibilitychange',visibility);
 function dispose(){if(disposed)return;disposed=true;window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);globalThis.document?.removeEventListener?.('visibilitychange',visibility);clearInput();world.free();}
 const byId=new Map(project.entities.map(entity=>[entity.id,entity]));
 const depth=entity=>{let n=0;while(entity?.parentId&&n<64){n++;entity=byId.get(entity.parentId);}return n;};
 const ordered=[...project.entities].sort((a,b)=>depth(a)-depth(b));
 const visible=entity=>{let depth=0;while(entity&&depth++<65){if(entity.visible===false||collected.has(entity.id))return false;entity=byId.get(entity.parentId);}return !entity;};
 const movers=new Map();

 function shapeColliders(entity,object,inverse,scale,size,center,kind){
  const {positions,indices}=localTriangles(entity,object,inverse,scale),triangles=indices.length/3;
  if(!triangles)return null;
  // Flat vector artwork: extrude every triangle into a solid convex wedge so the outline, not its box, collides.
  if(size.z<.05){
   if(triangles>FLAT_TRIANGLE_LIMIT){onLog({level:'warn',message:entity.name+' has too many triangles for shape collision; using its box.'});return null;}
   const half=Math.max(FLAT_HALF_DEPTH,size.z/2),descs=[];
   for(let t=0;t<triangles;t++){
    const points=new Float32Array(18);
    for(let corner=0;corner<3;corner++){const i=indices[t*3+corner]*3;for(const [slot,z] of [[corner,center.z-half],[corner+3,center.z+half]]){points[slot*3]=positions[i];points[slot*3+1]=positions[i+1];points[slot*3+2]=z;}}
    const desc=R.ColliderDesc.convexHull(points);if(desc)descs.push(desc);
   }
   return descs.length?descs:null;
  }
  if(kind==='dynamic'){
   let points=Float32Array.from(positions);if(points.length/3>HULL_POINT_LIMIT){const step=Math.ceil(points.length/3/HULL_POINT_LIMIT),sampled=[];for(let i=0;i<points.length/3;i+=step)sampled.push(points[i*3],points[i*3+1],points[i*3+2]);points=Float32Array.from(sampled);}
   const desc=R.ColliderDesc.convexHull(points);return desc?[desc]:null;
  }
  if(triangles>MESH_TRIANGLE_LIMIT){onLog({level:'warn',message:entity.name+' exceeds '+MESH_TRIANGLE_LIMIT+' triangles for shape collision; using its box.'});return null;}
  return [R.ColliderDesc.trimesh(Float32Array.from(positions),Uint32Array.from(indices))];
 }

 try{
  for(const entity of project.entities){
   const object=objects.get(entity.id),rigidbody=entity.components.rigidbody,mover=entity.components.mover;
   if(!object||!(rigidbody||mover)||!visible(entity))continue;
   object.updateWorldMatrix(true,true);const position=object.getWorldPosition(new Vector3()),rotation=object.getWorldQuaternion(new Quaternion()),scale=object.getWorldScale(new Vector3()),box=new Box3(),inverse=object.matrixWorld.clone().invert();
   object.traverse(mesh=>{if(!mesh.geometry||mesh.userData.entityId&&mesh.userData.entityId!==entity.id)return;mesh.geometry.computeBoundingBox();box.union(mesh.geometry.boundingBox.clone().applyMatrix4(new Matrix4().multiplyMatrices(inverse,mesh.matrixWorld)));});
   if(box.isEmpty()){onLog({level:'warn',message:entity.name+' has no collision geometry; its rigid body is inactive.'});continue;}const size=box.getSize(new Vector3()).multiply(scale),center=box.getCenter(new Vector3()).multiply(scale);heights.set(entity.id,Math.max(.05,size.y/2-center.y));
   const kind=mover?'kinematic':rigidbody.type==='dynamic'?'dynamic':'static';
   const desc=kind==='dynamic'?R.RigidBodyDesc.dynamic():kind==='kinematic'?R.RigidBodyDesc.kinematicPositionBased():R.RigidBodyDesc.fixed();desc.setTranslation(position.x,position.y,position.z).setRotation(rotation);if(entity.components.player){desc.lockRotations();if(entity.components.player.sideView)desc.enabledTranslations(true,true,false);}
   const body=world.createRigidBody(desc),friction=rigidbody?.friction??.7,restitution=rigidbody?.restitution??0,mass=rigidbody?.mass??1;
   const shaped=rigidbody?.collider==='shape'&&!entity.components.player?shapeColliders(entity,object,inverse,scale,size,center,kind):null;
   // Flat 2D artwork gets real depth: Rapier resolves paper-thin boxes by pushing 3D bodies out sideways, so they fall through.
   const halfDepth=size.z<.05&&!entity.components.player?FLAT_HALF_DEPTH:Math.max(.01,size.z/2);
   const descs=shaped||[R.ColliderDesc.cuboid(Math.max(.01,size.x/2),Math.max(.01,size.y/2),halfDepth).setTranslation(center.x,center.y,center.z)];
   for(const collider of descs)world.createCollider(collider.setFriction(friction).setRestitution(restitution).setMass(mass/descs.length),body);
   bodies.set(entity.id,body);
   if(mover)movers.set(body.handle,{entity,body,start:position.clone(),offset:new Vector3(...mover.offset),period:mover.period,velocity:new Vector3()});
  }
 }catch(error){dispose();throw error;}
 const controllers=project.entities.filter(entity=>entity.components.player&&bodies.has(entity.id));
 if(controllers.length>1)onLog({level:'warn',message:controllers.length+' active Player components share the same movement controls. This scene does not use independent player inputs.'});
 const spawns=new Map(controllers.map(entity=>{const t=bodies.get(entity.id).translation();return [entity.id,{x:t.x,y:t.y,z:t.z}];}));
 const graceUntil=new Map(),reachedCheckpoints=new Set();
 const triggers=project.entities.filter(entity=>entity.components.goal||entity.components.hazard||entity.components.checkpoint);

 function collect(entity,object){
  collected.add(entity.id);object.visible=false;
  // A collected object and its descendants must disappear from collision as
  // well as rendering. Leaving an invisible solid behind blocks the player.
  for(const candidate of project.entities){if(visible(candidate))continue;const body=bodies.get(candidate.id);if(body){movers.delete(body.handle);world.removeRigidBody(body);bodies.delete(candidate.id);}}
  score+=entity.components.collectible.value;onScore(score);onEvent({type:'score',score});
 }
 function freeze(){for(const entity of controllers){const body=bodies.get(entity.id);if(body){const v=body.linvel();body.setLinvel({x:0,y:Math.min(0,v.y),z:0},true);}}}
 function lose(entity){
  if(status!=='playing'||elapsed<(graceUntil.get(entity.id)||0))return;
  if(maxLives){lives=Math.max(0,lives-1);if(!lives){status='lost';freeze();onEvent({type:'lose',score,lives});return;}}
  const body=bodies.get(entity.id),spawn=spawns.get(entity.id);if(!body||!spawn)return;
  body.setTranslation(spawn,true);body.setLinvel({x:0,y:0,z:0},true);graceUntil.set(entity.id,elapsed+RESPAWN_GRACE);onEvent({type:'respawn',lives,score});
 }
 const playerBox=new Box3(),targetBox=new Box3();
 function rules(){
  for(const entity of controllers){
   const body=bodies.get(entity.id),object=objects.get(entity.id);if(!body||!object||!visible(entity))continue;
   if(body.translation().y<killY){lose(entity);continue;}
   playerBox.setFromObject(object);if(playerBox.isEmpty())continue;
   for(const trigger of triggers){
    if(status!=='playing')return;const target=objects.get(trigger.id);if(!target||target===object||!visible(trigger))continue;
    targetBox.setFromObject(target);if(targetBox.isEmpty()||!playerBox.intersectsBox(targetBox.expandByScalar(.05)))continue;
    const c=trigger.components;
    if(c.goal){status='won';freeze();onEvent({type:'win',message:c.goal.message,score,lives});return;}
    if(c.hazard){lose(entity);break;}
    if(c.checkpoint){const center=targetBox.getCenter(new Vector3()),spawn=spawns.get(entity.id),height=heights.get(entity.id)||.5;spawns.set(entity.id,{x:center.x,y:targetBox.max.y+height+.05,z:entity.components.player.sideView?spawn.z:center.z});if(!reachedCheckpoints.has(trigger.id)){reachedCheckpoints.add(trigger.id);onEvent({type:'checkpoint',id:trigger.id,name:trigger.name});}}
   }
  }
 }
 function step(dt){
  if(disposed)return;dt=Number.isFinite(dt)?Math.max(0,Math.min(dt,.15)):0;accumulator=Math.min(accumulator+dt,.15);
  while(accumulator>=STEP){
   elapsed+=STEP;
   for(const mover of movers.values()){
    const current=mover.body.translation(),phase=(1-Math.cos(elapsed/mover.period*Math.PI*2))/2,next=mover.start.clone().addScaledVector(mover.offset,phase);
    mover.velocity.set((next.x-current.x)/STEP,(next.y-current.y)/STEP,(next.z-current.z)/STEP);mover.body.setNextKinematicTranslation({x:next.x,y:next.y,z:next.z});
   }
   for(const entity of project.entities){
    const body=bodies.get(entity.id);if(!body||!entity.components.player)continue;
    const player=entity.components.player,active=status==='playing',x=active?axis(input.x+(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)):0,z=!active||player.sideView?0:axis(input.z+(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)),length=Math.max(1,Math.hypot(x,z)),velocity=body.linvel();let y=velocity.y;
    const position=body.translation(),hit=world.castRay(new R.Ray({x:position.x,y:position.y,z:position.z},{x:0,y:-1,z:0}),(heights.get(entity.id)||.5)+.12,true,undefined,undefined,undefined,body);
    // Standing on a moving platform carries the player with it.
    const carrier=hit?movers.get(hit.collider.parent()?.handle):null,carryX=carrier?carrier.velocity.x:0,carryZ=carrier&&!player.sideView?carrier.velocity.z:0;
    if(active&&jumpPressed&&hit)y=player.jump;
    if(player.sideView&&x)facing.set(entity.id,x<0?-1:1);
    body.setLinvel({x:x/length*player.speed+carryX,y,z:player.sideView?0:z/length*player.speed+carryZ},true);
   }
   jumpPressed=false;world.timestep=STEP;world.step();accumulator-=STEP;
   rules();
  }
  for(const entity of ordered){
   const object=objects.get(entity.id);if(!object||!visible(entity))continue;const body=bodies.get(entity.id);
   if(body){const position=body.translation(),rotation=body.rotation();object.position.set(position.x,position.y,position.z);if(object.parent)object.parent.worldToLocal(object.position);object.quaternion.set(rotation.x,rotation.y,rotation.z,rotation.w);if(object.parent)object.quaternion.premultiply(object.parent.getWorldQuaternion(new Quaternion()).invert());if(facing.has(entity.id))object.scale.x=Math.abs(object.scale.x)*facing.get(entity.id);}
   else if(entity.components.spin)object.rotation.y+=MathUtils.degToRad(entity.components.spin.speed)*dt;
  }
  const players=controllers.filter(entity=>visible(entity)&&bodies.has(entity.id)).map(entity=>objects.get(entity.id)).filter(Boolean);
  for(const entity of project.entities){if(!visible(entity)||!entity.components.collectible)continue;const object=objects.get(entity.id);if(object&&players.some(player=>player!==object&&player.getWorldPosition(new Vector3()).distanceTo(object.getWorldPosition(new Vector3()))<.85))collect(entity,object);}
 }
 return {step,world,bodies,setInput,clearInput,get input(){return {...input};},get state(){return {status,score,lives,maxLives};},dispose};
}
