import { WORLD_RECIPE_SCHEMA, COMPONENT_SCHEMAS, validateWorldRecipeShape } from '../../engine/core/procedural.mjs';
import { ENTITY_TYPES } from '../../engine/core/schema.mjs';
import { LOOK_VALIDATORS, LOOK_SCHEMA } from '../../engine/core/look.mjs';
import { validMaterial as validMaterialFields, MATERIAL_SCHEMA } from '../../engine/core/material.mjs';
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
export const MUTATING_COMMANDS = Object.freeze(['apply_world','undo','edit_objects','set_level_settings','add_library_model','import_model','place_on_ground','save_project']);
/** Bumped whenever the editor gains commands or components. Older editor tabs are told to refresh. */
export const EDITOR_PROTOCOL=4;
/** A GLB the user's own browser may download for import: any public https address, or a file server on the user's own computer. */
export function importableModelUrl(x){
 if(typeof x!=='string'||x.length<8||x.length>600)return false;
 let u;try{u=new URL(x);}catch{return false;}
 if(u.username||u.password||u.hash||!/.glb$/i.test(u.pathname))return false;
 const host=u.hostname.toLowerCase();
 if(u.protocol==='http:')return host==='localhost'||host==='127.0.0.1'||host==='[::1]';
 if(u.protocol!=='https:')return false;
 return !(host==='localhost'||/^(127|10|0)./.test(host)||/^192.168./.test(host)||/^169.254./.test(host)||/^172.(1[6-9]|2d|3[01])./.test(host)||host==='[::1]'||host.endsWith('.local')||host.endsWith('.internal'));
}
export const PLAY_MOVES = Object.freeze(['none','left','right','up','down']);
export const MAX_PLAY_SECONDS = 12;
// Starter Library paths as the catalog lists them, e.g. "human".
export const LIBRARY_PATH = /^[A-Za-z0-9_-]{1,80}(?:\/[A-Za-z0-9_-]{1,80}){0,2}$/;
const COMPONENT_NAMES = Object.keys(COMPONENT_SCHEMAS);
const EDIT_FIELDS = ['name','position','rotation','scale','visible','material','light','components','shape'];
function validShape(x){
 if(!keys(x,['paths'])||!Array.isArray(x.paths)||x.paths.length<1||x.paths.length>64)return false;
 let total=0;
 return x.paths.every(p=>keys(p,['points','color','depth'])&&Array.isArray(p.points)&&p.points.length>=3&&p.points.length<=256&&(total+=p.points.length)<=8000&&p.points.every(point=>vector(point,2,-100,100))&&color(p.color)&&maybe(p,'depth',n=>finite(n,-100,100)));
}
const validMaterial = x => validMaterialFields(x);
const validLight = x => keys(x,['color','intensity','distance']) && maybe(x,'color',color) && maybe(x,'intensity',n=>finite(n,0,1000)) && maybe(x,'distance',n=>finite(n,0,10000));
function validComponents(x) {
 if(!keys(x,COMPONENT_NAMES))return false;
 return maybe(x,'rigidbody',r=>keys(r,['type','mass','restitution','friction','collider'])&&['static','dynamic'].includes(r.type)&&maybe(r,'mass',n=>finite(n,.001,10000))&&maybe(r,'restitution',n=>finite(n,0,1))&&maybe(r,'friction',n=>finite(n,0,10))&&maybe(r,'collider',n=>['box','shape'].includes(n))) &&
  maybe(x,'spin',r=>keys(r,['speed'])&&maybe(r,'speed',n=>finite(n,-720,720))) &&
  maybe(x,'collectible',r=>keys(r,['value'])&&maybe(r,'value',n=>int(n,0,1e6))) &&
  maybe(x,'player',r=>keys(r,['speed','jump','sideView'])&&maybe(r,'speed',n=>finite(n,.1,50))&&maybe(r,'jump',n=>finite(n,0,30))&&maybe(r,'sideView',n=>typeof n==='boolean')) &&
  maybe(x,'animation',r=>keys(r,['clip','autoplay','speed'])&&maybe(r,'clip',n=>text(n,120))&&maybe(r,'autoplay',n=>typeof n==='boolean')&&maybe(r,'speed',n=>finite(n,.01,5))) &&
  maybe(x,'goal',r=>keys(r,['message'])&&maybe(r,'message',n=>text(n,120))) && maybe(x,'hazard',r=>keys(r,[])) && maybe(x,'checkpoint',r=>keys(r,[])) &&
  maybe(x,'water',r=>keys(r,['waveHeight','waveLength','speed','choppiness','opacity','deepColor','foam'])&&maybe(r,'waveHeight',n=>finite(n,0,5))&&maybe(r,'waveLength',n=>finite(n,4,200))&&maybe(r,'speed',n=>finite(n,0,5))&&maybe(r,'choppiness',n=>finite(n,0,1))&&maybe(r,'opacity',n=>finite(n,.3,1))&&maybe(r,'deepColor',color)&&maybe(r,'foam',n=>typeof n==='boolean')) &&
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
  maybe(p,'visible',n=>typeof n==='boolean') && maybe(p,'material',validMaterial) && maybe(p,'light',validLight) && maybe(p,'shape',validShape) &&
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
function validPlayTest(args){
 if(!keys(args,['seconds','steps','screenshot','width'])||!maybe(args,'seconds',n=>finite(n,.5,MAX_PLAY_SECONDS))||!maybe(args,'screenshot',n=>typeof n==='boolean')||!maybe(args,'width',n=>int(n,240,1280)))return false;
 if(args.steps===undefined)return true;
 if(args.seconds!==undefined||!Array.isArray(args.steps)||args.steps.length<1||args.steps.length>12)return false;
 let total=0;
 return args.steps.every(step=>keys(step,['move','seconds','jump'])&&finite(step.seconds,.1,MAX_PLAY_SECONDS)&&(total+=step.seconds)<=MAX_PLAY_SECONDS&&maybe(step,'move',n=>PLAY_MOVES.includes(n))&&maybe(step,'jump',n=>typeof n==='boolean'));
}
const validImage=x=>keys(x,['mimeType','data'])&&x.mimeType==='image/jpeg'&&typeof x.data==='string'&&x.data.length>0&&x.data.length<=400000&&/^[A-Za-z0-9+/]+={0,2}$/.test(x.data);
function validPlayReport(value){
 const position=n=>vector(n,3,-1e7,1e7);
 return keys(value,['projectId','seconds','start','end','minY','maxY','path','state','events','warning','image','screenshotError'])&&finite(value.seconds,0,60)&&position(value.start)&&position(value.end)&&finite(value.minY,-1e7,1e7)&&finite(value.maxY,-1e7,1e7)&&
  Array.isArray(value.path)&&value.path.length<=40&&value.path.every(p=>keys(p,['t','x','y','z'])&&['t','x','y','z'].every(k=>finite(p[k],-1e7,1e7)))&&
  keys(value.state,['status','score','lives','maxLives'])&&['playing','won','lost'].includes(value.state.status)&&finite(value.state.score,-1e9,1e9)&&finite(value.state.lives,0,1e6)&&finite(value.state.maxLives,0,1e6)&&
  Array.isArray(value.events)&&value.events.length<=60&&value.events.every(e=>keys(e,['type','at','score','lives','message','name'])&&text(e.type,40)&&finite(e.at,0,1e4)&&maybe(e,'score',n=>finite(n,-1e9,1e9))&&maybe(e,'lives',n=>finite(n,0,1e6))&&maybe(e,'message',n=>text(n,120))&&maybe(e,'name',n=>text(n,100)))&&
  maybe(value,'warning',n=>text(n,300))&&maybe(value,'image',validImage)&&maybe(value,'screenshotError',n=>text(n,300));
}
export function validArguments(command,args){
 if(command==='get_scene')return keys(args,['offset','limit'])&&maybe(args,'offset',n=>int(n,0,4999))&&maybe(args,'limit',n=>int(n,1,LIMITS.maxSceneEntities));
 if(command==='get_object')return keys(args,['id'])&&identifier(args.id);
 if(command==='preview_world')return keys(args,['recipe'])&&recipeShape(args.recipe);
 if(command==='apply_world')return keys(args,['previewId'])&&uuid(args.previewId);
 if(command==='undo')return keys(args,[]);
 if(command==='screenshot')return keys(args,['view','width'])&&maybe(args,'view',n=>['editor','game'].includes(n))&&maybe(args,'width',n=>int(n,240,1280));
 if(command==='play_test')return validPlayTest(args);
 if(command==='save_project')return keys(args,['where'])&&maybe(args,'where',n=>['device','account'].includes(n));
 if(command==='edit_objects')return validEdits(args);
 if(command==='place_on_ground')return keys(args,['ids','surface','offset'])&&Array.isArray(args.ids)&&args.ids.length>=1&&args.ids.length<=100&&args.ids.every(identifier)&&new Set(args.ids).size===args.ids.length&&maybe(args,'surface',n=>['any','ground','water'].includes(n))&&maybe(args,'offset',n=>finite(n,-10,10));
 if(command==='check_scene')return keys(args,['look'])&&maybe(args,'look',n=>typeof n==='boolean');
 if(command==='import_model')return keys(args,['url','name'])&&importableModelUrl(args.url)&&maybe(args,'name',n=>text(n,100)&&n.length>0);
 if(command==='add_library_model')return keys(args,['path','name','position','rotation','scale'])&&typeof args.path==='string'&&LIBRARY_PATH.test(args.path)&&maybe(args,'name',n=>text(n,100)&&n.length>0)&&maybe(args,'position',n=>vector(n,3,-1e6,1e6))&&maybe(args,'rotation',n=>vector(n,3,-36000,36000))&&maybe(args,'scale',n=>vector(n,3,.001,10000));
 if(command==='set_level_settings')return keys(args,['settings'])&&plain(args.settings)&&Object.keys(args.settings).length>0&&validSettings(args.settings);
 return false;
}
const validSummary=x=>keys(x,['entityCount','byType','seed'])&&int(x.entityCount,0,500)&&plain(x.byType)&&Object.entries(x.byType).every(([k,v])=>TYPES.includes(k)&&int(v,0,500))&&(int(x.seed,0,4294967295)||text(x.seed,128));
function validPerformance(x){return keys(x,['drawCalls','triangles','geometries','textures','groups','instancedObjects','drawCallsSaved','lodGroups','farCopies','budget','tips'])&&['drawCalls','triangles','geometries','textures','groups','instancedObjects','drawCallsSaved','lodGroups','farCopies'].every(k=>int(x[k],0,1e9))&&['ok','heavy'].includes(x.budget)&&Array.isArray(x.tips)&&x.tips.length<=5&&x.tips.every(t=>text(t,400));}
function validSettings(x){return keys(x,['background','gravity','ambientIntensity','exposure','shadows','quality','fogDensity','killY','lives',...Object.keys(LOOK_VALIDATORS)])&&Object.entries(LOOK_VALIDATORS).every(([k,v])=>maybe(x,k,v))&&maybe(x,'killY',n=>finite(n,-10000,10000))&&maybe(x,'lives',n=>int(n,0,99))&&maybe(x,'background',color)&&maybe(x,'gravity',n=>finite(n,-100,100))&&maybe(x,'ambientIntensity',n=>finite(n,0,10))&&maybe(x,'exposure',n=>finite(n,.1,5))&&maybe(x,'shadows',n=>typeof n==='boolean')&&maybe(x,'quality',n=>['low','balanced','high'].includes(n))&&maybe(x,'fogDensity',n=>finite(n,0,.2));}
const validWarnings=x=>Array.isArray(x)&&x.length<=30&&x.every(w=>text(w,400));
export function validResult(command,value,projectId,args={}){
 if(!plain(value)||(value.projectId!==undefined&&value.projectId!==projectId))return false;
 if(command==='get_scene')return keys(value,['projectId','name','entities','assets','settings','entityCount','assetCount','truncated','offset','limit'])&&value.projectId===projectId&&text(value.name,120)&&Array.isArray(value.entities)&&value.entities.length<=(args.limit??250)&&value.entities.every(e=>entity(e,true))&&Array.isArray(value.assets)&&value.assets.length<=500&&value.assets.every(a=>keys(a,['id','name','mime'])&&identifier(a.id)&&text(a.name,180)&&maybe(a,'mime',m=>m==='model/gltf-binary'))&&validSettings(value.settings)&&int(value.entityCount,0,5000)&&int(value.assetCount,0,500)&&typeof value.truncated==='boolean'&&maybe(value,'offset',n=>int(n,0,4999))&&maybe(value,'limit',n=>int(n,1,250));
 if(command==='get_object')return keys(value,['projectId','entity'])&&value.projectId===projectId&&entity(value.entity,true);
 if(command==='screenshot')return keys(value,['projectId','view','width','height','image'])&&value.projectId===projectId&&['editor','game'].includes(value.view)&&int(value.width,1,4000)&&int(value.height,1,4000)&&validImage(value.image);
 if(command==='play_test')return value.projectId===projectId&&validPlayReport(value);
 if(command==='check_scene')return keys(value,['projectId','checked','warnings','performance','image'])&&value.projectId===projectId&&int(value.checked,0,5000)&&validWarnings(value.warnings)&&maybe(value,'performance',validPerformance)&&maybe(value,'image',validImage);
 if(command==='preview_world')return keys(value,['projectId','previewId','summary','entities','omitted'])&&maybe(value,'omitted',n=>int(n,0,500))&&uuid(value.previewId)&&validSummary(value.summary)&&Array.isArray(value.entities)&&value.entities.length<=500&&value.entities.every(e=>entity(e,true));
 return keys(value,['ok','projectId','entityCount','revision','summary','changed','warnings','image'])&&value.ok===true&&maybe(value,'warnings',validWarnings)&&maybe(value,'image',validImage)&&maybe(value,'entityCount',n=>int(n,0,5000))&&maybe(value,'revision',n=>int(n,0,Number.MAX_SAFE_INTEGER))&&maybe(value,'summary',s=>text(s,2000)||validSummary(s))&&maybe(value,'changed',n=>typeof n==='boolean');
}
const objectSchema=properties=>({type:'object',properties,additionalProperties:false});
const numberSchema=(minimum,maximum)=>({type:'number',minimum,maximum});
const vectorSchema=(minimum,maximum)=>({type:'array',minItems:3,maxItems:3,items:numberSchema(minimum,maximum)});
const colorSchema={type:'string',pattern:'^#[a-fA-F0-9]{6}$'};
const idSchema={type:'string',pattern:'^[A-Za-z0-9_-]{1,100}$'};
const SETTINGS_SCHEMA=objectSchema({background:colorSchema,gravity:numberSchema(-100,100),ambientIntensity:numberSchema(0,10),exposure:numberSchema(.1,5),shadows:{type:'boolean'},quality:{enum:['low','balanced','high']},fogDensity:numberSchema(0,.2),
 killY:{...numberSchema(-10000,10000),description:'Players who fall below this height lose a life and respawn.'},lives:{type:'integer',minimum:0,maximum:99,description:'Lives per run; 0 means unlimited.'},...LOOK_SCHEMA});
const SHAPE_SCHEMA={...objectSchema({paths:{type:'array',minItems:1,maxItems:64,items:{...objectSchema({points:{type:'array',minItems:3,maxItems:256,items:{type:'array',minItems:2,maxItems:2,items:numberSchema(-100,100)}},color:colorSchema,depth:numberSchema(-100,100)}),required:['points','color']}}}),required:['paths'],description:'customMesh vector art: up to 64 filled polygons (x,y points), each with a colour and optional depth. Only valid on customMesh objects.'};
const PATCH_SCHEMA=objectSchema({name:{type:'string',minLength:1,maxLength:100},shape:SHAPE_SCHEMA,position:vectorSchema(-1e6,1e6),rotation:vectorSchema(-36000,36000),scale:vectorSchema(.001,10000),visible:{type:'boolean'},
 material:MATERIAL_SCHEMA,light:objectSchema({color:colorSchema,intensity:numberSchema(0,1000),distance:numberSchema(0,10000)}),
 components:{...objectSchema(Object.fromEntries(Object.entries(COMPONENT_SCHEMAS).map(([name,schema])=>[name,{oneOf:[schema,{type:'null'}]}]))),description:'Each listed component replaces that component; null removes it. Unlisted components are kept.'}});
const EDIT_SCHEMA={...objectSchema({summary:{type:'string',maxLength:200},operations:{type:'array',minItems:1,maxItems:50,items:{oneOf:[
 {...objectSchema({op:{const:'update'},id:idSchema,patch:PATCH_SCHEMA}),required:['op','id','patch']},
 {...objectSchema({op:{const:'remove'},id:idSchema}),required:['op','id']}]}}}),required:['operations']};
/** MCP content blocks for a tool result: pictures go out as real images, everything else as JSON text. */
export function resultContent(value){
 const picture=value?.image&&typeof value.image.data==='string'?value.image:null,rest=picture?{...value,image:{mimeType:picture.mimeType,note:'shown as an image'}}:value;
 return {content:[...(picture?[{type:'image',data:picture.data,mimeType:picture.mimeType}]:[]),{type:'text',text:typeof value==='string'?value:JSON.stringify(rest)}],structured:rest};
}
export async function toolDefinitions(){
 return [
  {name:'get_scene',description:'Read a bounded page of the explicitly paired editor project: level settings (including lives and killY), object IDs, transforms, materials and gameplay components. customMesh vector paths are omitted to keep pages small; use get_object to read the art of one object. Assets contain IDs and names only; no credentials, files or URLs.',inputSchema:objectSchema({offset:{type:'integer',minimum:0,maximum:4999},limit:{type:'integer',minimum:1,maximum:250}}),annotations:{readOnlyHint:true}},
  {name:'get_object',description:'Read one object in full by the ID returned by get_scene, including customMesh vector paths (shape), so you can copy its art into a recipe or change it with edit_objects.',inputSchema:{...objectSchema({id:idSchema}),required:['id']},annotations:{readOnlyHint:true}},
  {name:'preview_world',description:'Preview a bounded deterministic declarative world recipe that adds objects, including gameplay rules (player, goal, hazard, checkpoint, collectible, mover). This does not apply edits. Use existing asset IDs returned by get_scene; no code, URLs or filesystem access.',inputSchema:{...objectSchema({recipe:WORLD_RECIPE_SCHEMA}),required:['recipe']},annotations:{readOnlyHint:true}},
  {name:'apply_world',description:'Apply an exact prior preview to the same project as one Undo step, only while the user has explicitly enabled MCP writes. Stale or consumed previews fail.',inputSchema:{...objectSchema({previewId:{type:'string',format:'uuid'}}),required:['previewId']},annotations:{readOnlyHint:false,destructiveHint:false}},
  {name:'edit_objects',description:'Update or remove existing objects by the IDs returned by get_scene, as one Undo step, only while the user has explicitly enabled MCP writes. material and light patches merge with current values; each listed component replaces that component and null removes it. Removing a parent requires removing its children first. The whole edit fails if any operation is invalid.',inputSchema:EDIT_SCHEMA,annotations:{readOnlyHint:false,destructiveHint:true}},
  {name:'set_level_settings',description:'Change level settings (lives, fall-out height killY, gravity, background, lighting, quality, and the look: a preset like look:"golden-hour", physical sky with timeOfDay, tone mapping, shadowDistance, bloom, vignette, dof, colour grading) as one Undo step, only while the user has explicitly enabled MCP writes. Unlisted settings are kept.',inputSchema:{...objectSchema({settings:SETTINGS_SCHEMA}),required:['settings']},annotations:{readOnlyHint:false,destructiveHint:false}},
  {name:'add_library_model',description:'Add one Starter Library 3D character (Human, Goat Kid or Blue Robot; rigged, with Walking and Running clips) to the scene as one object, only while the user has explicitly enabled MCP writes. Use a path from list_library_models. Returns the new object ID in the summary; set gameplay components on it afterwards with edit_objects.',inputSchema:{...objectSchema({path:{type:'string',pattern:'^[A-Za-z0-9_-]{1,80}(/[A-Za-z0-9_-]{1,80}){0,2}$',description:'Library path, for example "human".'},name:{type:'string',minLength:1,maxLength:100},position:vectorSchema(-1e6,1e6),rotation:{...vectorSchema(-36000,36000),description:'Degrees.'},scale:vectorSchema(.001,10000)}),required:['path']},annotations:{readOnlyHint:false,destructiveHint:false}},
  {name:'import_model',description:'Bring a 3D model file into the project so you can place it. Give a URL of a binary glTF (.glb, up to 32 MB, self-contained): a public https link, or http://127.0.0.1:PORT/file.glb served from the user’s own computer (start a tiny file server there; the user’s browser downloads it, so this only works when you can run programs on the same computer, as Claude Code can). This is how you use models you made or downloaded outside the editor (Blender, Poly Haven, Sketchfab exports). Only while the user has explicitly enabled MCP writes. The asset is added to the project library WITHOUT putting an object in the scene; the summary returns its asset ID. Place it with preview_world using {type:"model",assetId:"..."} (models placed by recipe keep their textures; add components.rigidbody {type:"static",collider:"box"} to make it solid). Importing the same file twice reuses the first asset.',inputSchema:{...objectSchema({url:{type:'string',maxLength:600,description:'https://... or http://127.0.0.1:PORT/name.glb'},name:{type:'string',minLength:1,maxLength:100,description:'Asset name shown in the library.'}}),required:['url']},annotations:{readOnlyHint:false,destructiveHint:false}},
  {name:'place_on_ground',description:'Drop objects straight down (or up, if they are buried) so their lowest point rests on the surface under them: terrain, a pier, a table, or the water surface. Use it after placing props on uneven ground, and whenever a result warns that something floats. surface "ground" ignores water, "water" floats on water only, "any" (default) takes whichever is higher. offset lifts (+) or sinks (-) the object in metres, e.g. -0.05 to sink a rock slightly. One Undo step; needs "Allow changes".',inputSchema:{...objectSchema({ids:{type:'array',minItems:1,maxItems:100,items:idSchema},surface:{enum:['any','ground','water']},offset:numberSchema(-10,10)}),required:['ids']},annotations:{readOnlyHint:false,destructiveHint:false}},
  {name:'check_scene',description:'Check the whole scene for mistakes: objects floating in the air or with nothing under them (terrain, oceans and other very large pieces are skipped). Returns warnings with the fix to apply, a performance report (draw calls, triangles, textures, how many copies were instanced, budget ok/heavy with tips), and a picture of the current editor view (look:false skips the picture). Run it before telling the user a scene is finished.',inputSchema:objectSchema({look:{type:'boolean'}}),annotations:{readOnlyHint:true}},
  {name:'screenshot',description:'Take a picture of what the user\'s editor shows right now so you can check your work. view "game" uses the level\'s Camera object (add one first), view "editor" uses the editor camera. The grid and selection handles are hidden. Returns a JPEG image. Use it after building or editing, and fix anything that looks wrong.',inputSchema:objectSchema({view:{enum:['editor','game'],description:'Default "editor".'},width:{type:'integer',minimum:240,maximum:1280,description:'Image width in pixels. Default 960.'}}),annotations:{readOnlyHint:true}},
  {name:'play_test',description:'Play the level in the user\'s editor for a few seconds with scripted controls, then return to Edit mode. Reports where the player started and ended, the lowest and highest point reached, score, lives, whether the level was won or lost, checkpoint and respawn events, and a picture of the last frame. Give steps like [{move:"right",seconds:3},{move:"right",jump:true,seconds:1}] (move is none, left, right, up or down; jump:true presses Jump again every 0.6 s), or just seconds to watch the level with no input. Up to 12 seconds in total; the game is simulated at 60 frames per second and finishes in a second or two. It does not change the project.',inputSchema:objectSchema({seconds:numberSchema(.5,12),steps:{type:'array',minItems:1,maxItems:12,items:{...objectSchema({move:{enum:['none','left','right','up','down']},seconds:numberSchema(.1,12),jump:{type:'boolean'}}),required:['seconds']},description:'Controls to hold, one after another. Do not combine with seconds.'},screenshot:{type:'boolean',description:'Include a picture of the last frame. Default true.'},width:{type:'integer',minimum:240,maximum:1280}}),annotations:{readOnlyHint:true}},
  {name:'save_project',description:'Save the project in the user\'s editor, only while the user has explicitly enabled changes. where "device" (default) saves it in this browser so it appears under Open; where "account" also saves a copy to the user\'s Crate Ship account. Use it when the work is in a good state.',inputSchema:objectSchema({where:{enum:['device','account']}}),annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true}},
  {name:'undo',description:'Undo the latest project edit only while the user has explicitly enabled MCP writes in this paired editor session.',inputSchema:objectSchema({}),annotations:{readOnlyHint:false,destructiveHint:true}},
 ];
}
