export const FORMAT='crateship-project';
export const VERSION=4;
export const ENTITY_TYPES=Object.freeze(['box','sphere','cylinder','capsule','plane','customMesh','directionalLight','pointLight','camera','model','empty']);
const clone=x=>structuredClone(x);
const text=(value,max,fallback='')=>typeof value==='string'?value.slice(0,max):fallback;
const finite=(value,fallback,min=-1e6,max=1e6)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
function vec(value,fallback,min=-1e6,max=1e6){return [0,1,2].map(i=>finite(value?.[i],fallback[i],min,max));}
function safeId(value){return typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value)?value:crypto.randomUUID();}
export function cleanComponents(value={}){
 const result={};
 if(value.rigidbody)result.rigidbody={type:value.rigidbody.type==='dynamic'?'dynamic':'static',mass:finite(value.rigidbody.mass,1,.001,10000),restitution:finite(value.rigidbody.restitution,.2,0,1),friction:finite(value.rigidbody.friction,.7,0,10),...(value.rigidbody.collider==='shape'?{collider:'shape'}:{})};
 if(value.spin)result.spin={speed:finite(value.spin.speed,30,-720,720)};
 if(value.collectible)result.collectible={value:Math.round(finite(value.collectible.value,1,0,1e6))};
 if(value.player)result.player={speed:finite(value.player.speed,5,.1,50),jump:finite(value.player.jump,6,0,30),...(value.player.sideView===true?{sideView:true}:{})};
 // Gameplay rules are declarative data so editors, exports and AI models share one safe contract.
 if(value.goal)result.goal={message:text(value.goal.message,120,'Level complete!')||'Level complete!'};
 if(value.hazard)result.hazard={};
 if(value.checkpoint)result.checkpoint={};
 if(value.mover)result.mover={offset:vec(value.mover.offset,[0,2,0],-1000,1000),period:finite(value.mover.period,4,.2,120)};
 if(value.animation)result.animation={clip:text(value.animation.clip,120),autoplay:value.animation.autoplay!==false,speed:finite(value.animation.speed,1,.01,5)};
 return result;
}
function cleanShape(value){
 if(value===undefined)return undefined;
 if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.paths)||value.paths.length<1||value.paths.length>64)throw new Error('A custom mesh needs 1 to 64 vector paths.');
 let total=0;
 const paths=value.paths.map(path=>{
  if(!path||typeof path!=='object'||Array.isArray(path)||!Array.isArray(path.points)||path.points.length<3||path.points.length>256)throw new Error('A custom mesh path needs 3 to 256 points.');
  total+=path.points.length;if(total>8000)throw new Error('A custom mesh exceeds 8000 vertices.');
  const points=path.points.map(point=>{if(!Array.isArray(point)||point.length!==2||point.some(n=>!Number.isFinite(n)||Math.abs(n)>100))throw new Error('Custom mesh points must be finite 2D coordinates within 100 units.');return [point[0],point[1]];});
  const color=typeof path.color==='string'&&/^#[a-fA-F0-9]{6}$/.test(path.color)?path.color:'#8ebfa6';
  const depth=Number.isFinite(path.depth)?Math.max(-100,Math.min(100,path.depth)):0;
  return {points,color,depth};
 });
 return {paths};
}
export function cleanEntity(value={}){
 if(!ENTITY_TYPES.includes(value.type))throw new Error('Unsupported scene object type.');
 const components=cleanComponents(value.components);
 if(components.player&&(!['box','sphere','cylinder','capsule','plane','model','customMesh'].includes(value.type)||components.rigidbody?.type!=='dynamic'))throw new Error('A player controller requires a renderable object with a dynamic rigid body.');
 if(components.spin&&components.rigidbody)throw new Error('Spin and rigid body components cannot be combined.');
 if(components.mover&&(components.spin||components.player||components.rigidbody?.type==='dynamic'))throw new Error('A moving platform cannot also spin, be a player, or use a dynamic rigid body.');
 if(components.player&&(components.goal||components.hazard||components.checkpoint))throw new Error('The player cannot also be a goal, hazard, or checkpoint.');
 return {id:safeId(value.id),name:text(value.name,100,value.type),type:value.type,parentId:value.parentId?safeId(value.parentId):null,
  position:vec(value.position,[0,.5,0]),rotation:vec(value.rotation,[0,0,0],-36000,36000),scale:vec(value.scale,[1,1,1],.001,10000),visible:value.visible!==false,
  material:{color:/^#[a-fA-F0-9]{6}$/.test(value.material?.color)?value.material.color:'#8ebfa6',metalness:finite(value.material?.metalness,.05,0,1),roughness:finite(value.material?.roughness,.65,0,1)},
  light:{color:/^#[a-fA-F0-9]{6}$/.test(value.light?.color)?value.light.color:'#fff1dd',intensity:finite(value.light?.intensity,3,0,1000),distance:finite(value.light?.distance,30,0,10000)},
  components,...(value.type==='customMesh'?{shape:cleanShape(value.shape)}:{}),...(value.assetId?{assetId:safeId(value.assetId)}:{})};
}
export function newProject(name='Untitled World'){
 return {format:FORMAT,version:VERSION,id:crypto.randomUUID(),name:text(name,120,'Untitled World'),settings:cleanSettings(),entities:[],assets:[],createdAt:Date.now(),updatedAt:Date.now()};
}
export function cleanSettings(value={}){return {background:/^#[a-fA-F0-9]{6}$/.test(value.background)?value.background:'#15251e',gravity:finite(value.gravity,-9.81,-100,100),ambientIntensity:finite(value.ambientIntensity,.8,0,10),exposure:finite(value.exposure,1.15,.1,5),shadows:value.shadows!==false,quality:['low','balanced','high'].includes(value.quality)?value.quality:'balanced',fogDensity:finite(value.fogDensity,0,0,.2),killY:finite(value.killY,-30,-10000,10000),lives:Math.round(finite(value.lives,0,0,99))};}
function migrateLegacy(input){
 const project=newProject(input.name||'Imported legacy world');project.legacySource=clone(input);project.migrationWarnings=['Legacy scripts and command history are retained as source data and are never executed. Rebuild gameplay with the new components.'];
 for(const snapshot of (input.objects||[]).slice(0,5000)){
  const path=snapshot.assetPath;let assetId;
  if(path){assetId=crypto.randomUUID();project.assets.push({id:assetId,name:snapshot.assetFile||snapshot.name||'Legacy model',source:'catalog',mime:'model/gltf-binary',size:0,legacyPath:String(path).slice(0,500)});}
  project.entities.push(cleanEntity({id:snapshot.id,name:snapshot.name||'Imported object',type:path?'model':'box',assetId,position:snapshot.position,rotation:(snapshot.rotation||[0,0,0]).map(n=>n*180/Math.PI),scale:snapshot.scale,components:{...(snapshot.userData?.isSolid?{rigidbody:{type:'static'}}:{})}}));
 }
 return project;
}
export function validateProject(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Choose a Crate project file.');
 if(input.format==='crate-engine-project'&&Number(input.version)<=3)return validateProject(migrateLegacy(input));
 if(input.format!==FORMAT||input.version!==VERSION)throw new Error('This project format or version is unsupported.');
 if(!Array.isArray(input.entities)||input.entities.length>5000||!Array.isArray(input.assets)||input.assets.length>500)throw new Error('Project exceeds its object or asset limit.');
 const p=newProject(input.name);p.id=safeId(input.id);p.createdAt=finite(input.createdAt,Date.now(),0,Number.MAX_SAFE_INTEGER);
 p.settings=cleanSettings(input.settings);
 p.entities=input.entities.map(cleanEntity);if(p.entities.filter(e=>e.type==='pointLight'||e.type==='directionalLight').length>32)throw new Error('Scenes support at most 32 real-time lights. Use baked lighting for larger environments.');const ids=new Set(p.entities.map(e=>e.id));if(ids.size!==p.entities.length)throw new Error('Duplicate object identifiers.');
 const byId=new Map(p.entities.map(e=>[e.id,e]));for(const e of p.entities){if(e.parentId&&!ids.has(e.parentId))throw new Error('An object parent is missing.');let cursor=e;const ancestors=new Set([e.id]);while(cursor.parentId){if(ancestors.has(cursor.parentId))throw new Error('Scene hierarchy contains a cycle.');if(ancestors.size>=64)throw new Error('Scene hierarchy exceeds 64 levels.');ancestors.add(cursor.parentId);cursor=byId.get(cursor.parentId);}}
 p.assets=input.assets.map(a=>({id:safeId(a.id),name:text(a.name,180,'Imported model'),mime:'model/gltf-binary',size:finite(a.size,0,0,32*1024*1024),sha256:/^[a-f0-9]{64}$/.test(a.sha256||'')?a.sha256:null,source:['local','catalog','blender'].includes(a.source)?a.source:'local',...(typeof a.cloudId==='string'?{cloudId:safeId(a.cloudId)}:{}),...(typeof a.legacyPath==='string'?{legacyPath:text(a.legacyPath,500)}:{}),...(typeof a.url==='string'&&/^https:\/\/crateship-games-assets\.pages\.dev\//.test(a.url)?{url:a.url}:{}),...(typeof a.embedded==='string'&&a.embedded.length<=44*1024*1024?{embedded:a.embedded}:{})}));
 const assets=new Set(p.assets.map(a=>a.id));if(assets.size!==p.assets.length)throw new Error('Duplicate asset identifiers.');for(const e of p.entities)if(e.type==='model'&&!assets.has(e.assetId))throw new Error('A model asset reference is missing.');
 if(input.legacySource)p.legacySource=clone(input.legacySource);if(Array.isArray(input.migrationWarnings))p.migrationWarnings=input.migrationWarnings.map(s=>text(s,300)).slice(0,20);
 return p;
}
export function validateProposal(proposal){
 if(!proposal||!Array.isArray(proposal.operations)||proposal.operations.length<1||proposal.operations.length>50)throw new Error('The model must return 1–50 supported scene operations.');
 const operations=proposal.operations.map(op=>{
  if(op.op==='add'){if(op.entity?.type==='model')throw new Error('Model proposals cannot import remote assets.');return {op:'add',entity:cleanEntity(op.entity)};}
  if(['update','remove'].includes(op.op)&&typeof op.id==='string'){
   if(op.op==='remove')return {op:'remove',id:op.id};
   const allowed=['name','position','rotation','scale','visible','material','light','components'];if(!op.patch||Object.keys(op.patch).some(k=>!allowed.includes(k)))throw new Error('The proposed change contains unsupported fields.');
   return {op:'update',id:op.id,patch:clone(op.patch)};
  }
  throw new Error('Unsupported model operation.');
 });return {summary:text(proposal.summary,2000,'Proposed scene changes'),operations};
}
