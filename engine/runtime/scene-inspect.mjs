/* Scene checks for AI builders: what is under each object, which objects float or have nothing below them,
   and where an object would rest if dropped onto the ground or the water surface. Water planes are treated
   as flat surfaces at their height (their waves are drawn by the GPU), so boats and buoys can float on them. */
export const INSPECT_LIMITS=Object.freeze({checked:150,warnings:20,floatGap:.25,largeFootprint:60});
const SKIP_TYPES=new Set(['directionalLight','pointLight','camera','empty']);

function waterSurfaces(project){
 return project.entities.filter(e=>e.type==='plane'&&e.components?.water&&e.visible!==false).map(e=>({id:e.id,name:e.name,y:e.position[1],minX:e.position[0]-e.scale[0]/2,maxX:e.position[0]+e.scale[0]/2,minZ:e.position[2]-e.scale[2]/2,maxZ:e.position[2]+e.scale[2]/2}));
}
function waterAt(waters,x,z,below){
 let best=null;for(const w of waters)if(x>=w.minX&&x<=w.maxX&&z>=w.minZ&&z<=w.maxZ&&w.y<=below&&(!best||w.y>best.y))best=w;return best;
}
function ownerOf(object){for(let node=object;node;node=node.parent)if(node.userData?.entityId)return node.userData.entityId;return null;}
function visibleChain(object){for(let node=object;node;node=node.parent)if(node.visible===false)return false;return true;}

/**
 * Finds the first surface straight below a world point, ignoring the given entities.
 * Returns {y, name, id, water} or null.
 */
export function surfaceBelow({THREE,root,project,x,z,fromY,ignore=new Set(),surface='any'}){
 const waters=surface==='ground'?[]:waterSurfaces(project).filter(w=>!ignore.has(w.id));
 const names=new Map(project.entities.map(e=>[e.id,e.name]));
 let ground=null;
 if(surface!=='water'){
  const ray=new THREE.Raycaster(new THREE.Vector3(x,fromY,z),new THREE.Vector3(0,-1,0),0,5000);ray.layers.enableAll();
  const hits=ray.intersectObject(root,true);
  for(const hit of hits){
   const id=ownerOf(hit.object);if(!id||ignore.has(id)||hit.object.userData?.water||!hit.object.isMesh||!visibleChain(hit.object))continue;
   const entity=project.entities.find(e=>e.id===id);if(entity&&entity.components?.water)continue;
   ground={y:hit.point.y,name:names.get(id)||'an object',id,water:false};break;
  }
 }
 const water=waterAt(waters,x,z,fromY);
 if(water&&(!ground||water.y>=ground.y))return {y:water.y,name:water.name,id:water.id,water:true};
 return ground;
}

function worldBox(THREE,object){object.updateWorldMatrix(true,true);return new THREE.Box3().setFromObject(object);}

/** Checks objects for floating or having nothing under them. Returns human-readable warnings. */
export function groundWarnings({THREE,root,objects,project,ids}){
 const wanted=ids?.length?new Set(ids):null,warnings=[];let extra=0;
 const list=project.entities.filter(e=>(!wanted||wanted.has(e.id))&&!SKIP_TYPES.has(e.type)&&e.visible!==false&&!e.components?.water&&!e.components?.mover&&!e.components?.player&&!e.components?.spin&&e.components?.rigidbody?.type!=='dynamic').slice(0,INSPECT_LIMITS.checked);
 for(const entity of list){
  const object=objects.get(entity.id);if(!object||!visibleChain(object))continue;
  const box=worldBox(THREE,object);if(box.isEmpty())continue;
  const size=box.getSize(new THREE.Vector3());
  if(Math.max(size.x,size.z)>INSPECT_LIMITS.largeFootprint)continue; // terrain, oceans and other ground pieces
  const cx=(box.min.x+box.max.x)/2,cz=(box.min.z+box.max.z)/2;
  const ignore=new Set([entity.id]);for(const e of project.entities)if(e.parentId===entity.id)ignore.add(e.id);
  const below=surfaceBelow({THREE,root,project,x:cx,z:cz,fromY:box.min.y+Math.min(.5,size.y*.5),ignore});
  let message=null;
  if(!below)message=`${entity.name} has nothing under it (bottom at y=${box.min.y.toFixed(2)}).`;
  else{const gap=box.min.y-below.y;if(gap>INSPECT_LIMITS.floatGap)message=`${entity.name} floats ${gap.toFixed(2)} m above ${below.name}${below.water?' (water)':''}.`;}
  if(message){if(warnings.length<INSPECT_LIMITS.warnings)warnings.push(message+` Fix: place_on_ground {ids:["${entity.id}"]}.`);else extra++;}
 }
 if(extra)warnings.push(`And ${extra} more objects with the same problem.`);
 return warnings;
}

/** Position updates that drop objects so their lowest point rests on the surface below them. */
export function groundPlacements({THREE,root,objects,project,ids,surface='any',offset=0}){
 const updates=[],problems=[];
 for(const id of ids){
  const entity=project.entities.find(e=>e.id===id),object=objects.get(id);
  if(!entity||!object){problems.push(`Object ${id} is not in the scene.`);continue;}
  const box=worldBox(THREE,object);if(box.isEmpty()){problems.push(`${entity.name} has no size to place.`);continue;}
  const size=box.getSize(new THREE.Vector3()),cx=(box.min.x+box.max.x)/2,cz=(box.min.z+box.max.z)/2;
  const ignore=new Set([id]);for(const e of project.entities)if(e.parentId===id)ignore.add(e.id);
  const below=surfaceBelow({THREE,root,project,x:cx,z:cz,fromY:box.min.y+Math.max(size.y,2)+.01,ignore,surface});
  if(!below){problems.push(`${entity.name}: there is no ${surface==='any'?'surface':surface} under it.`);continue;}
  const dy=below.y+offset-box.min.y;if(Math.abs(dy)<.001)continue;
  const world=object.getWorldPosition(new THREE.Vector3());world.y+=dy;
  const local=object.parent?object.parent.worldToLocal(world.clone()):world;
  updates.push({id,position:[local.x,local.y,local.z].map(n=>Math.round(n*1000)/1000),restsOn:below.name,moved:Math.round(dy*100)/100});
 }
 return {updates,problems};
}

/** A camera pose that frames a box from a raised three-quarter angle. */
export function framingPose(THREE,box,aspect=16/9,fov=50){
 const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
 const radius=Math.max(size.length()/2,1.5);
 const distance=radius/Math.sin(THREE.MathUtils.degToRad(fov)/2)*(aspect<1?1.35:1.05);
 const direction=new THREE.Vector3(.62,.52,.58).normalize();
 return {target:center,position:center.clone().add(direction.multiplyScalar(distance))};
}
