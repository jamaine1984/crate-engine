import {Box3,Vector3,Quaternion,Matrix4,MathUtils} from 'three';
let rapierPromise;
export async function createPhysics(project,objects,{onScore=()=>{},onLog=()=>{}}={}){
 rapierPromise??=import('@dimforge/rapier3d-compat').then(async module=>{await module.default.init();return module.default;});
 const R=await rapierPromise,world=new R.World({x:0,y:project.settings.gravity,z:0}),bodies=new Map(),keys=new Set(),collected=new Set(),heights=new Map();
 let accumulator=0,score=0,jumpPressed=false,disposed=false,input={x:0,z:0,jump:false};
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
 try{
  for(const entity of project.entities){
   const object=objects.get(entity.id);if(!object||!entity.components.rigidbody||!visible(entity))continue;
   object.updateWorldMatrix(true,true);const position=object.getWorldPosition(new Vector3()),rotation=object.getWorldQuaternion(new Quaternion()),scale=object.getWorldScale(new Vector3()),box=new Box3(),inverse=object.matrixWorld.clone().invert();
   object.traverse(mesh=>{if(!mesh.geometry||mesh.userData.entityId&&mesh.userData.entityId!==entity.id)return;mesh.geometry.computeBoundingBox();box.union(mesh.geometry.boundingBox.clone().applyMatrix4(new Matrix4().multiplyMatrices(inverse,mesh.matrixWorld)));});
   if(box.isEmpty()){onLog({level:'warn',message:entity.name+' has no collision geometry; its rigid body is inactive.'});continue;}const size=box.getSize(new Vector3()).multiply(scale),center=box.getCenter(new Vector3()).multiply(scale);heights.set(entity.id,Math.max(.05,size.y/2-center.y));
   const desc=entity.components.rigidbody.type==='dynamic'?R.RigidBodyDesc.dynamic():R.RigidBodyDesc.fixed();desc.setTranslation(position.x,position.y,position.z).setRotation(rotation);if(entity.components.player){desc.lockRotations();if(entity.components.player.sideView)desc.enabledTranslations(true,true,false);}
   const body=world.createRigidBody(desc),collider=R.ColliderDesc.cuboid(Math.max(.01,size.x/2),Math.max(.01,size.y/2),Math.max(.01,size.z/2)).setTranslation(center.x,center.y,center.z).setFriction(entity.components.rigidbody.friction).setRestitution(entity.components.rigidbody.restitution).setMass(entity.components.rigidbody.mass);
   world.createCollider(collider,body);bodies.set(entity.id,body);
  }
 }catch(error){dispose();throw error;}
 const controllers=project.entities.filter(entity=>entity.components.player&&bodies.has(entity.id));
 if(controllers.length>1)onLog({level:'warn',message:controllers.length+' active Player components share the same movement controls. This scene does not use independent player inputs.'});
 function collect(entity,object){
  collected.add(entity.id);object.visible=false;
  // A collected object and its descendants must disappear from collision as
  // well as rendering. Leaving an invisible solid behind blocks the player.
  for(const candidate of project.entities){if(visible(candidate))continue;const body=bodies.get(candidate.id);if(body){world.removeRigidBody(body);bodies.delete(candidate.id);}}
  score+=entity.components.collectible.value;onScore(score);
 }
 function step(dt){
  if(disposed)return;dt=Number.isFinite(dt)?Math.max(0,Math.min(dt,.15)):0;accumulator=Math.min(accumulator+dt,.15);
  while(accumulator>=1/60){
   for(const entity of project.entities){
    const body=bodies.get(entity.id);if(!body||!entity.components.player)continue;
    const player=entity.components.player,x=axis(input.x+(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)),z=player.sideView?0:axis(input.z+(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)),length=Math.max(1,Math.hypot(x,z)),velocity=body.linvel();let y=velocity.y;
    if(jumpPressed){const position=body.translation(),hit=world.castRay(new R.Ray({x:position.x,y:position.y,z:position.z},{x:0,y:-1,z:0}),(heights.get(entity.id)||.5)+.12,true,undefined,undefined,undefined,body);if(hit)y=player.jump;}
    body.setLinvel({x:x/length*player.speed,y,z:player.sideView?0:z/length*player.speed},true);
   }
   jumpPressed=false;world.timestep=1/60;world.step();accumulator-=1/60;
  }
  for(const entity of ordered){
   const object=objects.get(entity.id);if(!object||!visible(entity))continue;const body=bodies.get(entity.id);
   if(body){const position=body.translation(),rotation=body.rotation();object.position.set(position.x,position.y,position.z);if(object.parent)object.parent.worldToLocal(object.position);object.quaternion.set(rotation.x,rotation.y,rotation.z,rotation.w);if(object.parent)object.quaternion.premultiply(object.parent.getWorldQuaternion(new Quaternion()).invert());}
   else if(entity.components.spin)object.rotation.y+=MathUtils.degToRad(entity.components.spin.speed)*dt;
  }
  const players=controllers.filter(entity=>visible(entity)&&bodies.has(entity.id)).map(entity=>objects.get(entity.id)).filter(Boolean);
  for(const entity of project.entities){if(!visible(entity)||!entity.components.collectible)continue;const object=objects.get(entity.id);if(object&&players.some(player=>player!==object&&player.getWorldPosition(new Vector3()).distanceTo(object.getWorldPosition(new Vector3()))<.85))collect(entity,object);}
 }
 return {step,world,bodies,setInput,clearInput,get input(){return {...input};},dispose};
}
