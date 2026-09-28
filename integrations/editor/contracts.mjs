import { WORLD_RECIPE_SCHEMA, validateWorldRecipeShape } from '../../engine/core/procedural.mjs';
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
const TYPES = ['box','sphere','cylinder','capsule','plane','directionalLight','pointLight','camera','model','empty'];
const validMaterial = x => keys(x,['color','metalness','roughness']) && maybe(x,'color',color) && maybe(x,'metalness',n=>finite(n,0,1)) && maybe(x,'roughness',n=>finite(n,0,1));
const validLight = x => keys(x,['color','intensity','distance']) && maybe(x,'color',color) && maybe(x,'intensity',n=>finite(n,0,1000)) && maybe(x,'distance',n=>finite(n,0,10000));
function validComponents(x) {
 if(!keys(x,['rigidbody','spin','collectible','player','animation']))return false;
 return maybe(x,'rigidbody',r=>keys(r,['type','mass','restitution','friction'])&&['static','dynamic'].includes(r.type)&&maybe(r,'mass',n=>finite(n,.001,10000))&&maybe(r,'restitution',n=>finite(n,0,1))&&maybe(r,'friction',n=>finite(n,0,10))) &&
  maybe(x,'spin',r=>keys(r,['speed'])&&maybe(r,'speed',n=>finite(n,-720,720))) &&
  maybe(x,'collectible',r=>keys(r,['value'])&&maybe(r,'value',n=>int(n,0,1e6))) &&
  maybe(x,'player',r=>keys(r,['speed','jump'])&&maybe(r,'speed',n=>finite(n,.1,50))&&maybe(r,'jump',n=>finite(n,0,30))) &&
  maybe(x,'animation',r=>keys(r,['clip','autoplay','speed'])&&maybe(r,'clip',n=>text(n,120))&&maybe(r,'autoplay',n=>typeof n==='boolean')&&maybe(r,'speed',n=>finite(n,.01,5)));
}
function entity(x, snapshot=false) {
 return keys(x,['name','type','position','rotation','scale','visible','material','light','components','assetId',...(snapshot?['id','parentId']:[])]) && TYPES.includes(x.type) &&
  maybe(x,'name',n=>text(n,100)) && maybe(x,'position',n=>vector(n,3,-1e6,1e6)) && maybe(x,'rotation',n=>vector(n,3,-36000,36000)) &&
  maybe(x,'scale',n=>vector(n,3,.001,10000)) && maybe(x,'visible',n=>typeof n==='boolean') && maybe(x,'material',validMaterial) && maybe(x,'light',validLight) &&
  maybe(x,'components',validComponents) && maybe(x,'assetId',identifier) && (!snapshot||(identifier(x.id)&&(x.parentId===undefined||x.parentId===null||identifier(x.parentId))));
}
function recipeShape(recipe) {
 try{validateWorldRecipeShape(recipe);return true;}catch{return false;}
}
export function validArguments(command,args){
 if(command==='get_scene')return keys(args,['offset','limit'])&&maybe(args,'offset',n=>int(n,0,4999))&&maybe(args,'limit',n=>int(n,1,LIMITS.maxSceneEntities));
 if(command==='preview_world')return keys(args,['recipe'])&&recipeShape(args.recipe);
 if(command==='apply_world')return keys(args,['previewId'])&&uuid(args.previewId);
 if(command==='undo')return keys(args,[]);
 return false;
}
const validSummary=x=>keys(x,['entityCount','byType','seed'])&&int(x.entityCount,0,500)&&plain(x.byType)&&Object.entries(x.byType).every(([k,v])=>TYPES.includes(k)&&int(v,0,500))&&(int(x.seed,0,4294967295)||text(x.seed,128));
function validSettings(x){return keys(x,['background','gravity','ambientIntensity','exposure','shadows','quality','fogDensity'])&&maybe(x,'background',color)&&maybe(x,'gravity',n=>finite(n,-100,100))&&maybe(x,'ambientIntensity',n=>finite(n,0,10))&&maybe(x,'exposure',n=>finite(n,.1,5))&&maybe(x,'shadows',n=>typeof n==='boolean')&&maybe(x,'quality',n=>['low','balanced','high'].includes(n))&&maybe(x,'fogDensity',n=>finite(n,0,.2));}
export function validResult(command,value,projectId,args={}){
 if(!plain(value)||(value.projectId!==undefined&&value.projectId!==projectId))return false;
 if(command==='get_scene')return keys(value,['projectId','name','entities','assets','settings','entityCount','assetCount','truncated','offset','limit'])&&value.projectId===projectId&&text(value.name,120)&&Array.isArray(value.entities)&&value.entities.length<=(args.limit??250)&&value.entities.every(e=>entity(e,true))&&Array.isArray(value.assets)&&value.assets.length<=500&&value.assets.every(a=>keys(a,['id','name','mime'])&&identifier(a.id)&&text(a.name,180)&&maybe(a,'mime',m=>m==='model/gltf-binary'))&&validSettings(value.settings)&&int(value.entityCount,0,5000)&&int(value.assetCount,0,500)&&typeof value.truncated==='boolean'&&maybe(value,'offset',n=>int(n,0,4999))&&maybe(value,'limit',n=>int(n,1,250));
 if(command==='preview_world')return keys(value,['projectId','previewId','summary','entities'])&&uuid(value.previewId)&&validSummary(value.summary)&&Array.isArray(value.entities)&&value.entities.length<=500&&value.entities.every(e=>entity(e,true));
 return keys(value,['ok','projectId','entityCount','revision','summary','changed'])&&value.ok===true&&maybe(value,'entityCount',n=>int(n,0,5000))&&maybe(value,'revision',n=>int(n,0,Number.MAX_SAFE_INTEGER))&&maybe(value,'summary',s=>text(s,2000)||validSummary(s))&&maybe(value,'changed',n=>typeof n==='boolean');
}
const objectSchema=properties=>({type:'object',properties,additionalProperties:false});
export async function toolDefinitions(){
 return [
  {name:'get_scene',description:'Read a bounded page of the explicitly paired editor project. Assets contain IDs and names only; no credentials, files or URLs.',inputSchema:objectSchema({offset:{type:'integer',minimum:0,maximum:4999},limit:{type:'integer',minimum:1,maximum:250}}),annotations:{readOnlyHint:true}},
  {name:'preview_world',description:'Preview a bounded deterministic declarative world recipe. This does not apply edits. Use existing asset IDs returned by get_scene; no code, URLs or filesystem access.',inputSchema:{...objectSchema({recipe:WORLD_RECIPE_SCHEMA}),required:['recipe']},annotations:{readOnlyHint:true}},
  {name:'apply_world',description:'Apply an exact prior preview to the same project as one Undo step, only while the user has explicitly enabled MCP writes. Stale or consumed previews fail.',inputSchema:{...objectSchema({previewId:{type:'string',format:'uuid'}}),required:['previewId']},annotations:{readOnlyHint:false,destructiveHint:false}},
  {name:'undo',description:'Undo the latest project edit only while the user has explicitly enabled MCP writes in this paired editor session.',inputSchema:objectSchema({}),annotations:{readOnlyHint:false,destructiveHint:true}},
 ];
}
