import {cleanEntity,ENTITY_TYPES} from './schema.mjs';
import {MATERIAL_SCHEMA} from './material.mjs';

export const WORLD_LIMITS=Object.freeze({operations:64,generatedEntities:500,totalEntities:5000,totalLights:32,recipeBytes:131072});
const number=(minimum,maximum)=>({type:'number',minimum,maximum});
const integer=(minimum,maximum)=>({type:'integer',minimum,maximum});
const text=(maxLength,extra={})=>({type:'string',minLength:1,maxLength,...extra});
const tuple=(length,item)=>({type:'array',minItems:length,maxItems:length,items:item});
const object=(properties,required=[])=>({type:'object',additionalProperties:false,properties,required});
const vector=tuple(3,number(-1e6,1e6)),key=text(64,{pattern:'^[A-Za-z][A-Za-z0-9_-]*$'}),color={type:'string',pattern:'^#[a-fA-F0-9]{6}$'};
const vectorPath=object({points:{type:'array',minItems:3,maxItems:256,items:tuple(2,number(-100,100))},color,depth:number(-100,100)},['points','color']);
const customShape=object({paths:{type:'array',minItems:1,maxItems:64,items:vectorPath}},['paths']);
// Shared with the MCP contracts so recipes, edits and scene reads accept the same gameplay components.
export const COMPONENT_SCHEMAS=freeze({
 rigidbody:object({type:{enum:['static','dynamic']},mass:number(.001,10000),friction:number(0,10),restitution:number(0,1),collider:{enum:['box','shape']}}),
 player:object({speed:number(.1,50),jump:number(0,30),sideView:{type:'boolean'}}),
 collectible:object({value:integer(0,1e6)}),spin:object({speed:number(-720,720)}),
 animation:object({clip:{type:'string',maxLength:120},autoplay:{type:'boolean'},speed:number(.01,5)}),
 goal:object({message:{type:'string',maxLength:120}}),hazard:object({}),checkpoint:object({}),
 mover:object({offset:tuple(3,number(-1000,1000)),period:number(.2,120)}),
 water:object({waveHeight:number(0,5),waveLength:number(4,200),speed:number(0,5),choppiness:number(0,1),opacity:number(.3,1),deepColor:color,foam:{type:'boolean'}})
});
const components=object(COMPONENT_SCHEMAS);
const entity=object({
 type:{enum:[...ENTITY_TYPES]},name:text(100),position:vector,rotation:tuple(3,number(-36000,36000)),scale:tuple(3,number(.001,10000)),visible:{type:'boolean'},
 material:MATERIAL_SCHEMA,
 light:object({color,intensity:number(0,1000),distance:number(0,10000)}),components,shape:customShape,
 assetId:text(100,{pattern:'^[A-Za-z0-9_-]+$'})
},['type']);
const variants=[
 object({op:{const:'add'},key,parentKey:key,entity},['op','entity']),
 object({op:{const:'grid'},parentKey:key,entity,counts:tuple(2,integer(1,50)),spacing:tuple(2,number(0,1e5)),origin:vector},['op','entity','counts','spacing','origin']),
 object({op:{const:'scatter'},parentKey:key,entity,count:integer(1,500),bounds:object({min:tuple(2,number(-1e6,1e6)),max:tuple(2,number(-1e6,1e6))},['min','max']),y:number(-1e6,1e6),scaleRange:tuple(2,number(.001,1000)),rotationY:{type:'boolean'}},['op','entity','count','bounds'])
];
function freeze(value){if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}
export const WORLD_RECIPE_SCHEMA=freeze({
 $schema:'https://json-schema.org/draft/2020-12/schema',title:'Crate Engine declarative world recipe',
 ...object({version:{const:1},seed:{oneOf:[text(128),integer(0,4294967295)]},operations:{type:'array',minItems:1,maxItems:WORLD_LIMITS.operations,items:{oneOf:variants}}},['version','seed','operations'])
});

// This intentionally small validator supports exactly the schema above and has
// no executable expressions, remote references, coercion, or network access.
function check(value,schema,path){
 if(schema.oneOf){let valid=0;const errors=[];for(const option of schema.oneOf)try{check(value,option,path);valid++;}catch(error){errors.push(error.message);}
  // Report the specific failure of the variant the value chose (e.g. its op), so an AI or person can fix it.
  const specific=valid===0&&errors.find(message=>!message.startsWith(path+'.op ')&&!message.startsWith(path+' must be'));
  if(valid!==1)throw new Error(specific||path+' does not match a supported recipe value.');return;}
 if(Object.hasOwn(schema,'const')&&value!==schema.const)throw new Error(path+' has an unsupported value.');
 if(schema.enum&&!schema.enum.includes(value))throw new Error(path+' has an unsupported value.');
 if(schema.type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error(path+' must be an object.');
  for(const name of schema.required||[])if(!Object.hasOwn(value,name))throw new Error(path+'.'+name+' is required.');
  for(const name of Object.keys(value)){if(!Object.hasOwn(schema.properties,name))throw new Error(path+'.'+name+' is unsupported.');check(value[name],schema.properties[name],path+'.'+name);}
 }else if(schema.type==='array'){
  if(!Array.isArray(value)||value.length<schema.minItems||value.length>schema.maxItems)throw new Error(path+' has an invalid number of entries.');
  value.forEach((item,index)=>check(item,schema.items,path+'['+index+']'));
 }else if(schema.type==='string'){
  if(typeof value!=='string'||value.length<(schema.minLength||0)||value.length>(schema.maxLength||Infinity)||schema.pattern&&!new RegExp(schema.pattern).test(value))throw new Error(path+' must be valid text.');
 }else if(schema.type==='number'||schema.type==='integer'){
  if(!Number.isFinite(value)||schema.type==='integer'&&!Number.isInteger(value)||value<schema.minimum||value>schema.maximum)throw new Error(path+' must be a finite number within its allowed range.');
 }else if(schema.type==='boolean'&&typeof value!=='boolean')throw new Error(path+' must be true or false.');
}
function countOf(operation){return operation.op==='grid'?operation.counts[0]*operation.counts[1]:operation.op==='scatter'?operation.count:1;}
function modelRules(template){
 if(template.type==='model'&&!template.assetId)throw new Error('A model template requires an existing project assetId.');
 if(template.type!=='model'&&template.assetId)throw new Error('Only model templates may reference an assetId.');
 if(template.components?.water&&template.type!=='plane')throw new Error('Water components require a plane object.');
 if(template.components?.animation&&template.type!=='model')throw new Error('Animation components require a model with an embedded animation clip.');
 if(template.type==='customMesh'&&!template.shape)throw new Error('A custom mesh requires its own vector paths.');
 if(template.type!=='customMesh'&&template.shape)throw new Error('Custom vector paths are supported only on customMesh objects.');
 const renderable=['box','sphere','cylinder','capsule','plane','model','customMesh'].includes(template.type);
 if(template.components?.rigidbody&&!renderable)throw new Error('Procedural rigid bodies require a renderable object with collision geometry.');
 for(const name of ['goal','hazard','checkpoint','mover','collectible'])if(template.components?.[name]&&!renderable)throw new Error('The '+name+' component requires a renderable object that has a visible size.');
}
export function validateWorldRecipeShape(input){
 let encoded;try{encoded=JSON.stringify(input);}catch{throw new Error('The world recipe must be finite JSON data.');}
 if(typeof encoded!=='string'||new TextEncoder().encode(encoded).length>WORLD_LIMITS.recipeBytes)throw new Error('The world recipe exceeds 128 KB.');
 check(input,WORLD_RECIPE_SCHEMA,'recipe');
 const recipe=structuredClone(input),keys=new Set();let generated=0;
 for(const operation of recipe.operations){
  if(operation.parentKey&&!keys.has(operation.parentKey))throw new Error('parentKey must reference an earlier add operation with a key.');
  if(operation.key){if(keys.has(operation.key))throw new Error('World recipe keys must be unique.');keys.add(operation.key);}
  generated+=countOf(operation);if(generated>WORLD_LIMITS.generatedEntities)throw new Error('A world recipe can generate at most 500 objects.');
  modelRules(operation.entity);
  const normalized=cleanEntity({...operation.entity,...(operation.op!=='add'&&!operation.entity.position?{position:[0,0,0]}:{})});delete normalized.id;delete normalized.parentId;operation.entity=normalized;
  if(operation.op==='scatter'){
   if(operation.bounds.min.some((value,index)=>value>operation.bounds.max[index]))throw new Error('Scatter minimum bounds must not exceed maximum bounds.');
   operation.y??=0;operation.scaleRange??=[1,1];operation.rotationY??=false;
   if(operation.scaleRange[0]>operation.scaleRange[1])throw new Error('Scatter scaleRange must be in increasing order.');
  }
 }
 return recipe;
}
function seedRandom(seed){let state=2166136261;for(const char of String(seed)){state^=char.codePointAt(0);state=Math.imul(state,16777619);}return ()=>{state+=0x6D2B79F5;let value=state;value=Math.imul(value^value>>>15,value|1);value^=value+Math.imul(value^value>>>7,value|61);return ((value^value>>>14)>>>0)/4294967296;};}
function contextCount(value,fallback,max,label){const count=value??fallback;if(!Number.isInteger(count)||count<0||count>max)throw new Error('The project '+label+' is invalid.');return count;}
export function compileWorldRecipe(input,project={entities:[],assets:[]}){
 const recipe=validateWorldRecipeShape(input),existing=Array.isArray(project.entities)?project.entities:[],assets=Array.isArray(project.assets)?project.assets:[];
 const existingCount=Math.max(existing.length,contextCount(project.entityCount,existing.length,WORLD_LIMITS.totalEntities,'object count')),existingLights=Math.max(existing.filter(item=>['pointLight','directionalLight'].includes(item.type)).length,contextCount(project.lightCount,existing.filter(item=>['pointLight','directionalLight'].includes(item.type)).length,WORLD_LIMITS.totalLights,'light count'));
 const expected=recipe.operations.reduce((sum,operation)=>sum+countOf(operation),0);
 if(existingCount+expected>WORLD_LIMITS.totalEntities)throw new Error('The generated world would exceed the project limit of 5000 objects.');
 const knownAssets=new Set(assets.map(asset=>asset.id)),knownIds=new Set(existing.map(item=>item.id)),keys=new Map(),random=seedRandom(recipe.seed),entities=[],byType={};let lightCount=existingLights;
 function add(template,parentKey,patch={},key){
  if(template.type==='model'&&!knownAssets.has(template.assetId))throw new Error('World recipes can use only model assetIds already imported into this project.');
  if(['pointLight','directionalLight'].includes(template.type)&&++lightCount>WORLD_LIMITS.totalLights)throw new Error('The generated world would exceed the project limit of 32 lights.');
  const data={...structuredClone(template),...patch};
  for(const [name,min,max]of [['position',-1e6,1e6],['rotation',-36000,36000],['scale',.001,10000]])if(data[name].some(value=>!Number.isFinite(value)||value<min||value>max))throw new Error('Generated '+name+' exceeds the supported transform range.');
  let id;do{id=crypto.randomUUID();}while(knownIds.has(id));knownIds.add(id);
  const entity=cleanEntity({...data,id,parentId:parentKey?keys.get(parentKey):null});entities.push(entity);byType[entity.type]=(byType[entity.type]||0)+1;if(key)keys.set(key,id);
 }
 for(const operation of recipe.operations){
  const template=operation.entity;
  if(operation.op==='add')add(template,operation.parentKey,{},operation.key);
  else if(operation.op==='grid'){
   for(let z=0;z<operation.counts[1];z++)for(let x=0;x<operation.counts[0];x++)add(template,operation.parentKey,{name:(template.name+' '+(z*operation.counts[0]+x+1)).slice(0,100),position:[operation.origin[0]+x*operation.spacing[0]+template.position[0],operation.origin[1]+template.position[1],operation.origin[2]+z*operation.spacing[1]+template.position[2]]});
  }else{
   for(let index=0;index<operation.count;index++){
    const x=operation.bounds.min[0]+random()*(operation.bounds.max[0]-operation.bounds.min[0]),z=operation.bounds.min[1]+random()*(operation.bounds.max[1]-operation.bounds.min[1]),scale=operation.scaleRange[0]+random()*(operation.scaleRange[1]-operation.scaleRange[0]),rotation=[...template.rotation];if(operation.rotationY)rotation[1]+=random()*360;
    add(template,operation.parentKey,{name:(template.name+' '+(index+1)).slice(0,100),position:[x+template.position[0],operation.y+template.position[1],z+template.position[2]],rotation,scale:template.scale.map(value=>value*scale)});
   }
  }
 }
 return {recipe,entities,summary:{entityCount:entities.length,byType,seed:recipe.seed}};
}
export function validateWorldRecipe(recipe,project){return compileWorldRecipe(recipe,project).recipe;}
export function createWorldPreviewSession({getProject,getRevision,apply}){
 let pending=null;
 function current(request){
  if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(key=>key!=='previewId')||typeof request.previewId!=='string')throw new Error('Apply the preview using its previewId.');
  if(!pending||request.previewId!==pending.previewId)throw new Error('This world preview is no longer available. Preview the recipe again.');
  if(pending.revision!==getRevision()||pending.projectId!==getProject().id)throw new Error('The scene changed after this preview. Preview the recipe again before applying it.');
  return pending;
 }
 return {
  preview(recipe){const project=getProject(),compiled=compileWorldRecipe(recipe,project);pending={...compiled,previewId:crypto.randomUUID(),revision:getRevision(),projectId:project.id};return structuredClone({previewId:pending.previewId,summary:pending.summary,entities:pending.entities});},
  inspect(request){const selected=current(request);return structuredClone({entities:selected.entities,summary:selected.summary});},
  apply(request){
   const selected=current(request);
   apply(structuredClone(selected.entities));pending=null;return {applied:true,summary:structuredClone(selected.summary),entityIds:selected.entities.map(entity=>entity.id)};
  },
  invalidate(){pending=null;}
 };
}
export function getWorldRecipeHelp(){return 'Create declarative JSON {version:1,seed,operations}. Seed is text (1–128 chars) or an integer 0–4294967295. Operations: add {entity,key?,parentKey?}; grid {entity,counts:[x,z],spacing:[x,z],origin:[x,y,z],parentKey?}; scatter {entity,count,bounds:{min:[x,z],max:[x,z]},y?,scaleRange:[min,max]?,rotationY?,parentKey?}. Each operation has op:"add", "grid", or "scatter". parentKey references an earlier add.key, using local transforms. key and parentKey sit on the operation beside entity, never inside it. grid and scatter each include their own complete entity object, copied to every spot; they never refer to another object by name or key. Grid/scatter template position is an offset (default zero); add position defaults [0,.5,0]. Entity fields are type,name,position,rotation in degrees,positive scale,visible,material,light,components,assetId,shape. Use type customMesh for original model-authored vector geometry: shape.paths is 1–64 closed polygons, each path has 3–256 points [x,y] (range ±100), a hex color and optional depth. These paths become triangulated scene meshes; they are scene objects with editable transforms and bounding-box colliders unless rigidbody.collider is "shape". This is structured geometry, not executable code. No IDs,parentId,URLs,code or network access are accepted. Model assetId must already exist in the project; imported GLB materials remain intact. Player requires a renderable object and dynamic rigidbody; player.sideView locks depth and moves along X/jumps along Y, and a camera object makes the view follow the player sideways. rigidbody.collider:"shape" makes collision follow the real outline instead of the bounding box. Gameplay rules: goal {message?} wins the level on touch; hazard {} costs a life and respawns the player; checkpoint {} moves the respawn point; collectible {value} adds score; mover {offset:[x,y,z],period} travels back and forth by offset over period seconds and carries a standing player (no spin, player or dynamic rigidbody on a mover). Goal, hazard and checkpoint cannot be on the player. Lives and fall-out height are level settings, changed with set_level_settings, not recipe entities. Spin cannot combine with rigidbody; animation requires model. Maximum64 operations,500 generated objects,5000 project objects,32 project lights. Output is previewed against the current project; only an explicit apply of a valid preview changes the scene, as one Undo. Seeded scatter is deterministic; IDs are fresh per preview.';}

export function createWorldRecipe(kind,{seed='Crate world',assetId,includePlayer=true,includeSun=true}={}){
 if(!['village','forest'].includes(kind))throw new Error('Choose village or forest.');
 const add=(entity,key,parentKey)=>({op:'add',entity,...(key?{key}:{}),...(parentKey?{parentKey}:{})});
 const operations=[add({type:'empty',name:kind==='village'?'Village':'Forest',position:[0,0,0]},'world'),add({type:'box',name:'Ground',position:[0,-.2,0],scale:[44,.4,44],material:{color:'#466a43',roughness:1},components:{rigidbody:{type:'static'}}},undefined,'world')];
 if(includeSun)operations.push(add({type:'directionalLight',name:'World sun',position:[8,14,10],light:{intensity:3.5,color:'#fff0d0'}},undefined,'world'));
 if(includePlayer)operations.push(add({type:'capsule',name:'Player',position:[0,2,15],material:{color:'#ef954d'},components:{rigidbody:{type:'dynamic'},player:{speed:5,jump:6}}},undefined,'world'));
 if(kind==='village'){
  const houseGrid=(template,offset)=>({op:'grid',parentKey:'world',entity:{type:'box',...template},counts:[4,3],spacing:[8,8],origin:[-12+offset[0],offset[1],-10+offset[2]]});
  operations.push(
   houseGrid({name:'House',scale:[4,3,4],material:{color:'#e6d5b8',roughness:.8},components:{rigidbody:{type:'static'}}},[0,1.5,0]),
   houseGrid({name:'Stone foundation',scale:[4.18,.22,4.18],material:{color:'#7b827d',roughness:1}},[0,.11,0]),
   houseGrid({name:'Roof left slope',scale:[2.8,.18,5.1],rotation:[0,0,33],material:{color:'#985638',roughness:.8}},[-1.16,3.92,0]),
   houseGrid({name:'Roof right slope',scale:[2.8,.18,5.1],rotation:[0,0,-33],material:{color:'#985638',roughness:.8}},[1.16,3.92,0]),
   houseGrid({name:'Timber door',scale:[.9,1.85,.1],material:{color:'#4f3728',roughness:.75}},[0,.925,2.04]),
   houseGrid({name:'Door lintel',scale:[1.15,.16,.18],material:{color:'#f0e2c9',roughness:.85}},[0,1.92,2.08]),
   houseGrid({name:'Window frame left',scale:[.91,.92,.08],material:{color:'#f1e4ca',roughness:.8}},[-1.22,1.83,2.04]),
   houseGrid({name:'Window frame right',scale:[.91,.92,.08],material:{color:'#f1e4ca',roughness:.8}},[1.22,1.83,2.04]),
   houseGrid({name:'Window glass left',scale:[.72,.73,.06],material:{color:'#477d8a',metalness:.3,roughness:.2}},[-1.22,1.83,2.10]),
   houseGrid({name:'Window glass right',scale:[.72,.73,.06],material:{color:'#477d8a',metalness:.3,roughness:.2}},[1.22,1.83,2.10]),
   houseGrid({name:'Brick chimney',scale:[.5,1.4,.55],material:{color:'#785749',roughness:.95}},[1.1,4.6,-.85]),
   {op:'grid',parentKey:'world',entity:{type:'box',name:'Cross street',scale:[36,.05,2],material:{color:'#b4a48b',roughness:1}},counts:[1,2],spacing:[8,8],origin:[0,.026,-6]},
   {op:'grid',parentKey:'world',entity:{type:'box',name:'Village lane',scale:[2,.052,32],material:{color:'#b4a48b',roughness:1}},counts:[3,1],spacing:[8,8],origin:[-8,.026,-2]},
   add({type:'box',name:'Village promenade',position:[0,.029,14],scale:[38,.058,3],material:{color:'#b4a48b',roughness:1}},undefined,'world'),
   add({type:'box',name:'West hedge',position:[-20,.55,-1],scale:[.8,1.1,36],material:{color:'#36583b',roughness:1}},undefined,'world'),
   add({type:'box',name:'East hedge',position:[20,.55,-1],scale:[.8,1.1,36],material:{color:'#36583b',roughness:1}},undefined,'world'),
   add({type:'box',name:'North hedge',position:[0,.55,-19],scale:[40,1.1,.8],material:{color:'#36583b',roughness:1}},undefined,'world'),
   {op:'grid',parentKey:'world',entity:{type:'cylinder',name:'Village tree trunk',scale:[.6,3,.6],material:{color:'#76513a'},components:{rigidbody:{type:'static'}}},counts:[2,2],spacing:[36,26],origin:[-18,1.5,-14]},
   {op:'grid',parentKey:'world',entity:{type:'sphere',name:'Village tree canopy',scale:[3.4,4.6,3.4],material:{color:'#48724a'}},counts:[2,2],spacing:[36,26],origin:[-18,4.2,-14]}
  );
 }else if(assetId){operations.push({op:'scatter',parentKey:'world',entity:{type:'model',name:'Forest model',assetId},count:45,bounds:{min:[-18,-18],max:[18,10]},y:0,scaleRange:[.8,1.3],rotationY:true});}
 else{operations.push({op:'grid',parentKey:'world',entity:{type:'cylinder',name:'Trunk',scale:[.6,3,.6],material:{color:'#76523a'},components:{rigidbody:{type:'static'}}},counts:[6,5],spacing:[6,6],origin:[-15,1.5,-15]},{op:'grid',parentKey:'world',entity:{type:'sphere',name:'Canopy',scale:[4,5,4],material:{color:'#315f39'}},counts:[6,5],spacing:[6,6],origin:[-15,4.5,-15]});}
 operations.push({op:'scatter',parentKey:'world',entity:{type:'sphere',name:'Stone',scale:[1,.5,.8],material:{color:'#7b8580',roughness:1},components:{rigidbody:{type:'static'}}},count:12,bounds:{min:[-20,-20],max:[20,10]},y:.25,scaleRange:[.5,1.6],rotationY:true});
 return validateWorldRecipeShape({version:1,seed,operations});
}
