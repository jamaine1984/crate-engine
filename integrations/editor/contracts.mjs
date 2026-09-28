import { WORLD_RECIPE_SCHEMA, COMPONENT_SCHEMAS, validateWorldRecipeShape } from '../../engine/core/procedural.mjs';
import { ENTITY_TYPES } from '../../engine/core/schema.mjs';
export const LIMITS = Object.freeze({ maxBodyBytes: 524288, maxPending: 8, maxHistory: 1000, commandTimeoutMs: 30000, sessionIdleMs: 90000, maxSceneEntities: 250, maxWorldEntities: 500 });
export const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export const keys = (x, allowed) => plain(x) && Object.keys(x).every(k => allowed.includes(k));
export const identifier = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(x);
export const uuid = x => typeof x === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(x);
const finite = (x, min, max) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
const int = (x, min, max) => Number.isSafeInteger(x) && finite(x, min, max);
const vector = (x, length, min, max) => Array.isArray(x) && x.length === length && x.every(n => finite(n, min, max));
const text = (x, max) => typeof x === 'string' && x.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(x);
const color = x => typeof x === 'string' && /^#[a-f0-9]{6}$/i.test(x);
const maybe = (v, k, check) => v[k] === undefined || check(v[k]);
const TYPES = [...ENTITY_TYPES];
// Commands that change the paired project. The bridge refuses them unless the editor enabled writes.
export const MUTATING_COMMANDS = Object.freeze(['apply_world','undo','edit_objects','set_level_settings']);
const COMPONENT_NAMES = Object.keys(COMPONENT_SCHEMAS);
const EDIT_FIELDS = ['name','position','rotation','scale','visible','material','light','components'];
function validShape(x){
 if(!keys(x,['paths'])||!Array.isArray(x.paths)||x.paths.length<1||x.paths.length>64)return false;
 let total=0;
 return x.paths.every(p=>keys(p,['points','color','depth'])&&Array.isArray(p.points)&&p.points.length>=3&&p.points.length<=256&&(total+=p.points.length)<=8000&&p.points.every(point=>vector(point,2,-100,100))&&color(p.color)&&maybe(p,'depth',n=>finite(n,-100,100)));
}
const validMaterial = x => keys(x,['color','metalness','roughness']) && maybe(x,'color',color) && maybe(x,'metalness',n=>finite(n,0,1)) && maybe(x,'roughness',n=>finite(n,0,1));
const validLight = x => keys(x,['color','intensity','distance']) && maybe(x,'color',color) && maybe(x,'intensity',n=>finite(n,0,1000)) && maybe(x,'distance',n=>finite(n,0,10000));
function validComponents(x) {
 if(!keys(x,COMPONENT_NAMES))return false;
 return maybe(x,'rigidbody',r=>keys(r,['type','mass','restitution','friction','collider'])&&['static','dynamic'].includes(r.type)&&maybe(r,'mass',n=>finite(n,.001,10000))&&maybe(r,'restitution',n=>finite(n,0,1))&&maybe(r,'friction',n=>finite(n,0,10))&&maybe(r,'collider',n=>['box','shape'].includes(n))) &&
  maybe(x,'spin',r=>keys(r,['speed'])&&maybe(r,'speed',n=>finite(n,-720,720))) &&
  maybe(x,'collectible',r=>keys(r,['value'])&&maybe(r,'value',n=>int(n,0,1e6))) &&
  maybe(x,'player',r=>keys(r,['speed','jump','sideView'])&&maybe(r,'speed',n=>finite(n,.1,50))&&maybe(r,'jump',n=>finite(n,0,30))&&maybe(r,'sideView',n=>typeof n==='boolean')) &&
  maybe(x,'animation',r=>keys(r,['clip','autoplay','speed'])&&maybe(r,'clip',n=>text(n,120))&&maybe(r,'autoplay',n=>typeof n==='boolean')&&maybe(r,'speed',n=>finite(n,.01,5))) &&
  maybe(x,'goal',r=>keys(r,['message'])&&maybe(r,'message',n=>text(n,120))) && maybe(x,'hazard',r=>keys(r,[])) && maybe(x,'checkpoint',r=>keys(r,[])) &&
  maybe(x,'mover',r=>keys(r,['offset','period'])&&maybe(r,'offset',n=>vector(n,3,-1000,1000))&&maybe(r,'period',n=>finite(n,.2,120)));
}
function entity(x, snapshot=false) {
 return keys(x,['name','type','position','rotation','scale','visible','material','light','components','assetId','shape',...(snapshot?['id','parentId']:[])]) && TYPES.includes(x.type) && maybe(x,'shape',n=>x.type==='customMesh'&&validShape(n)) &&
  maybe(x,'name',n=>text(n,100)) && maybe(x,'position',n=>vector(n,3,-1e6,1e6)) && maybe(x,'rotation',n=>vector(n,3,-36000,36000)) &&
  maybe(x,'scale',n=>vector(n,3,.001,10000)) && maybe(x,'visible',n=>typeof n==='boolean') && maybe(x,'material',validMaterial) && maybe(x,'light',validLight) &&
  maybe(x,'components',validComponents) && maybe(x,'assetId',identifier) && (!snapshot||(identifier(x.id)&&(x.parentId===undefined||x.parentId===null||identifier(x.parentId))));
}
// Edits: partial material/light, and per-component replace-or-remove (null removes).
function validPatch(p){
 if(!keys(p,EDIT_FIELDS)||!Object.keys(p).length)return false;
 return maybe(p,'name',n=>text(n,100)&&n.length>0) && maybe(p,'position',n=>vector(n,3,-1e6,1e6)) && maybe(p,'rotation',n=>vector(n,3,-36000,36000)) && maybe(p,'scale',n=>vector(n,3,.001,10000)) &&
  maybe(p,'visible',n=>typeof n==='boolean') && maybe(p,'material',validMaterial) && maybe(p,'light',validLight) &&
  maybe(p,'components',c=>keys(c,COMPONENT_NAMES)&&Object.entries(c).every(([name,value])=>value===null||validComponents({[name]:value})));
}
function validEdits(args){
 if(!keys(args,['summary','operations'])||!maybe(args,'summary',n=>text(n,200))||!Array.isArray(args.operations)||args.operations.length<1||args.operations.length>50)return false;
 const ids=new Set();
 return args.operations.every(op=>plain(op)&&identifier(op.id)&&!ids.has(op.id)&&ids.add(op.id)&&(op.op==='remove'?keys(op,['op','id']):op.op==='update'&&keys(op,['op','id','patch'])&&validPatch(op.patch)));
}
function recipeShape(recipe) {
 try{validateWorldRecipeShape(recipe);return true;}catch{return false;}
}
export function validArguments(command,args){
 if(command==='get_scene')return keys(args,['offset','limit'])&&maybe(args,'offset',n=>int(n,0,4999))&&maybe(args,'limit',n=>int(n,1,LIMITS.maxSceneEntities));
 if(command==='preview_world')return keys(args,['recipe'])&&recipeShape(args.recipe);
 if(command==='apply_world')return keys(args,['previewId'])&&uuid(args.previewId);
 if(command==='undo')return keys(args,[]);
 if(command==='edit_objects')return validEdits(args);
 if(command==='set_level_settings')return keys(args,['settings'])&&plain(args.settings)&&Object.keys(args.settings).length>0&&validSettings(args.settings);
 return false;
}
const validSummary=x=>keys(x,['entityCount','byType','seed'])&&int(x.entityCount,0,500)&&plain(x.byType)&&Object.entries(x.byType).every(([k,v])=>TYPES.includes(k)&&int(v,0,500))&&(int(x.seed,0,4294967295)||text(x.seed,128));
function validSettings(x){return keys(x,['background','gravity','ambientIntensity','exposure','shadows','quality','fogDensity','killY','lives'])&&maybe(x,'killY',n=>finite(n,-10000,10000))&&maybe(x,'lives',n=>int(n,0,99))&&maybe(x,'background',color)&&maybe(x,'gravity',n=>finite(n,-100,100))&&maybe(x,'ambientIntensity',n=>finite(n,0,10))&&maybe(x,'exposure',n=>finite(n,.1,5))&&maybe(x,'shadows',n=>typeof n==='boolean')&&maybe(x,'quality',n=>['low','balanced','high'].includes(n))&&maybe(x,'fogDensity',n=>finite(n,0,.2));}
export function validResult(command,value,projectId,args={}){
 if(!plain(value)||(value.projectId!==undefined&&value.projectId!==projectId))return false;
 if(command==='get_scene')return keys(value,['projectId','name','entities','assets','settings','entityCount','assetCount','truncated','offset','limit'])&&value.projectId===projectId&&text(value.name,120)&&Array.isArray(value.entities)&&value.entities.length<=(args.limit??250)&&value.entities.every(e=>entity(e,true))&&Array.isArray(value.assets)&&value.assets.length<=500&&value.assets.every(a=>keys(a,['id','name','mime'])&&identifier(a.id)&&text(a.name,180)&&maybe(a,'mime',m=>m==='model/gltf-binary'))&&validSettings(value.settings)&&int(value.entityCount,0,5000)&&int(value.assetCount,0,500)&&typeof value.truncated==='boolean'&&maybe(value,'offset',n=>int(n,0,4999))&&maybe(value,'limit',n=>int(n,1,250));
 if(command==='preview_world')return keys(value,['projectId','previewId','summary','entities'])&&uuid(value.previewId)&&validSummary(value.summary)&&Array.isArray(value.entities)&&value.entities.length<=500&&value.entities.every(e=>entity(e,true));
 return keys(value,['ok','projectId','entityCount','revision','summary','changed'])&&value.ok===true&&maybe(value,'entityCount',n=>int(n,0,5000))&&maybe(value,'revision',n=>int(n,0,Number.MAX_SAFE_INTEGER))&&maybe(value,'summary',s=>text(s,2000)||validSummary(s))&&maybe(value,'changed',n=>typeof n==='boolean');
}
const objectSchema=properties=>({type:'object',properties,additionalProperties:false});
const numberSchema=(minimum,maximum)=>({type:'number',minimum,maximum});
const vectorSchema=(minimum,maximum)=>({type:'array',minItems:3,maxItems:3,items:numberSchema(minimum,maximum)});
const colorSchema={type:'string',pattern:'^#[a-fA-F0-9]{6}$'};
const idSchema={type:'string',pattern:'^[A-Za-z0-9_-]{1,100}$'};
const SETTINGS_SCHEMA=objectSchema({background:colorSchema,gravity:numberSchema(-100,100),ambientIntensity:numberSchema(0,10),exposure:numberSchema(.1,5),shadows:{type:'boolean'},quality:{enum:['low','balanced','high']},fogDensity:numberSchema(0,.2),
 killY:{...numberSchema(-10000,10000),description:'Players who fall below this height lose a life and respawn.'},lives:{type:'integer',minimum:0,maximum:99,description:'Lives per run; 0 means unlimited.'}});
const PATCH_SCHEMA=objectSchema({name:{type:'string',minLength:1,maxLength:100},position:vectorSchema(-1e6,1e6),rotation:vectorSchema(-36000,36000),scale:vectorSchema(.001,10000),visible:{type:'boolean'},
 material:objectSchema({color:colorSchema,metalness:numberSchema(0,1),roughness:numberSchema(0,1)}),light:objectSchema({color:colorSchema,intensity:numberSchema(0,1000),distance:numberSchema(0,10000)}),
 components:{...objectSchema(Object.fromEntries(Object.entries(COMPONENT_SCHEMAS).map(([name,schema])=>[name,{oneOf:[schema,{type:'null'}]}]))),description:'Each listed component replaces that component; null removes it. Unlisted components are kept.'}});
const EDIT_SCHEMA={...objectSchema({summary:{type:'string',maxLength:200},operations:{type:'array',minItems:1,maxItems:50,items:{oneOf:[
 {...objectSchema({op:{const:'update'},id:idSchema,patch:PATCH_SCHEMA}),required:['op','id','patch']},
 {...objectSchema({op:{const:'remove'},id:idSchema}),required:['op','id']}]}}}),required:['operations']};
export async function toolDefinitions(){
 return [
  {name:'get_scene',description:'Read a bounded page of the explicitly paired editor project: level settings (including lives and killY), object IDs, transforms, materials and gameplay components. customMesh vector paths are omitted to keep pages small. Assets contain IDs and names only; no credentials, files or URLs.',inputSchema:objectSchema({offset:{type:'integer',minimum:0,maximum:4999},limit:{type:'integer',minimum:1,maximum:250}}),annotations:{readOnlyHint:true}},
  {name:'preview_world',description:'Preview a bounded deterministic declarative world recipe that adds objects, including gameplay rules (player, goal, hazard, checkpoint, collectible, mover). This does not apply edits. Use existing asset IDs returned by get_scene; no code, URLs or filesystem access.',inputSchema:{...objectSchema({recipe:WORLD_RECIPE_SCHEMA}),required:['recipe']},annotations:{readOnlyHint:true}},
  {name:'apply_world',description:'Apply an exact prior preview to the same project as one Undo step, only while the user has explicitly enabled MCP writes. Stale or consumed previews fail.',inputSchema:{...objectSchema({previewId:{type:'string',format:'uuid'}}),required:['previewId']},annotations:{readOnlyHint:false,destructiveHint:false}},
  {name:'edit_objects',description:'Update or remove existing objects by the IDs returned by get_scene, as one Undo step, only while the user has explicitly enabled MCP writes. material and light patches merge with current values; each listed component replaces that component and null removes it. Removing a parent requires removing its children first. The whole edit fails if any operation is invalid.',inputSchema:EDIT_SCHEMA,annotations:{readOnlyHint:false,destructiveHint:true}},
  {name:'set_level_settings',description:'Change level settings (lives, fall-out height killY, gravity, background, lighting, quality) as one Undo step, only while the user has explicitly enabled MCP writes. Unlisted settings are kept.',inputSchema:{...objectSchema({settings:SETTINGS_SCHEMA}),required:['settings']},annotations:{readOnlyHint:false,destructiveHint:false}},
  {name:'undo',description:'Undo the latest project edit only while the user has explicitly enabled MCP writes in this paired editor session.',inputSchema:objectSchema({}),annotations:{readOnlyHint:false,destructiveHint:true}},
 ];
}
