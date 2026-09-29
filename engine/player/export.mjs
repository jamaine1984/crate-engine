import {SURFACE_MAPS} from '../core/material.mjs';
import {zipSync,strToU8} from 'fflate';
import {validateProject} from '../core/schema.mjs';
import {inspectGLB,hashBytes,MAX_MODEL_BYTES} from '../core/gltf.mjs';
export const MAX_EXPORT_MODEL_BYTES=80*1024*1024;

// Never trust Content-Length alone: chunked and inaccurate responses must obey
// the same byte limit before being buffered or handed to a model decoder.
export async function readLimitedResponse(response,limit,label='Download'){
 if(Number(response.headers?.get('content-length'))>limit){await response.body?.cancel();throw new Error(label+' exceeds its size limit.');}
 if(!response.body?.getReader){const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>limit)throw new Error(label+' exceeds its size limit.');return bytes;}
 const reader=response.body.getReader(),chunks=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw new Error(label+' exceeds its size limit.');}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
async function exactModelBytes(asset,resolveAsset){
 const input=await resolveAsset(asset),bytes=inspectGLB(input).bytes.slice(),hash=await hashBytes(bytes);
 if(asset.sha256&&hash!==asset.sha256)throw new Error('Model checksum does not match: '+asset.name);
 asset.sha256=hash;asset.size=bytes.length;return bytes;
}
export async function exportOriginalModel(input,resolveAsset){
 const asset=structuredClone(input),bytes=await exactModelBytes(asset,resolveAsset);
 const name=String(asset.name||'model').replace(/\.glb$/i,'').replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,100)||'model';
 return {blob:new Blob([bytes],{type:'model/gltf-binary'}),filename:name+'.glb'};
}
function portableAsset(asset){delete asset.cloudId;delete asset.url;delete asset.legacyPath;delete asset.embedded;}
function toBase64(bytes){let result='';for(let i=0;i<bytes.length;i+=8192)result+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(result);}
export async function createPortableProject(input,resolveAsset){
 const project=validateProject(input);let total=0;
 for(const asset of project.assets){const bytes=await exactModelBytes(asset,resolveAsset);total+=bytes.length;if(total>MAX_EXPORT_MODEL_BYTES)throw new Error('Portable backup is limited to 80 MB of models. Split this scene into smaller projects.');portableAsset(asset);asset.embedded=toBase64(bytes);}
 if(strToU8(JSON.stringify(project)).length>128*1024*1024)throw new Error('The portable project exceeds the 128 MB backup limit.');
 return project;
}
const htmlText=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
async function distributionFile(path,limit,label){
 const response=await fetch(path,{credentials:'same-origin',redirect:'error'});
 if(!response.ok)throw new Error(label+' is unavailable. Rebuild the game runtime before exporting.');
 return readLimitedResponse(response,limit,label);
}
export async function exportGameZip(input,resolveAsset){
 const project=validateProject(input),files={};
 // Game delivery includes only assets instantiated by this scene. Unused editor
// library entries remain available in portable project backups.
 const referenced=new Set(project.entities.filter(entity=>entity.type==='model').map(entity=>entity.assetId));
 project.assets=project.assets.filter(asset=>referenced.has(asset.id));
 let total=0;
 for(const asset of project.assets){const bytes=await exactModelBytes(asset,resolveAsset);total+=bytes.length;if(total>MAX_EXPORT_MODEL_BYTES)throw new Error('Web export is limited to 80 MB of models.');files['assets/'+asset.id+'.glb']=bytes;portableAsset(asset);}
 // Built-in surface textures used by this scene travel with the game (CC0).
 const surfaces=new Set(project.entities.map(entity=>entity.material?.surface).filter(Boolean));
 for(const surface of surfaces)for(const map of SURFACE_MAPS)files[`surfaces/${surface}/${map}.jpg`]=await distributionFile(`/starter-library/surfaces/${surface}/${map}.jpg`,8*1024*1024,'Surface texture '+surface);
 delete project.legacySource;delete project.migrationWarnings;
 const runtime=await distributionFile('/engine/distribution/game-runtime.js',32*1024*1024,'Game runtime');
 const code=new TextDecoder().decode(runtime);if(!code.includes('CrateGame'))throw new Error('The bundled game runtime is invalid.');
 const license=await distributionFile('/engine/distribution/THIRD-PARTY.txt',2*1024*1024,'Third-party notices');
 files['project.json']=strToU8(JSON.stringify(project));files['game-runtime.js']=runtime;files['THIRD-PARTY.txt']=license;
 files['index.html']=strToU8(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'"><title>${htmlText(project.name)}</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#122018;color:#eee;font:14px system-ui}canvas{display:block;width:100%;height:100%}#hud{position:fixed;left:16px;top:16px;background:#102016e8;padding:12px;border:1px solid #3e6248;border-radius:8px;max-width:calc(100vw - 60px);transition:opacity .6s}#hud.played{opacity:0;pointer-events:none}button{padding:10px;background:#ff8a3d;color:#162019;border:0;border-radius:6px;cursor:pointer;font-weight:700}button:disabled{opacity:.55}#error{color:#ffb095;max-width:480px;line-height:1.5}</style></head><body><canvas id="game" tabindex="0" aria-label="Game viewport"></canvas><div id="hud"><button id="start">Start game</button><p id="help">Touch pad + Jump on phones · WASD / arrows + Space on keyboard</p><p id="error" role="status"></p></div><script src="game-runtime.js"></script><script src="bootstrap.js"></script></body></html>`);
 files['bootstrap.js']=strToU8('document.getElementById("start").onclick=async function(){this.disabled=true;document.getElementById("error").textContent="";try{await CrateGame.start(document.getElementById("game"),null);this.remove();setTimeout(function(){document.getElementById("hud").classList.add("played");},6000);}catch(e){document.getElementById("error").textContent=e.message;this.disabled=false;}};');
 files['README.txt']=strToU8('Crate Engine browser game\n\nServe this folder with a static HTTP server, then open index.html. Direct file:// opening is not supported. Once served, all game code and model files are local to this package; no CDN is needed.\n\nIncludes the bundled renderer, physics runtime, model assets, and third-party notices. Provider connections, account sessions, legacy script source, and cloud asset identifiers are excluded.\n\nPhysics uses bounding-box colliders by default; objects set to shape collision follow their real outline. Score, lives, goals, hazards, checkpoints and moving platforms are shown by the in-game overlay. Add a player component with a dynamic rigid body for movement. An authored camera determines the game view; otherwise drag the scene to orbit. On phones and tablets, the movement pad and Jump appear after Start. Movement requires an active visible player with a dynamic rigid body. You can hold a direction and Jump with separate fingers. Controls clear on interruption or when the game is closed. Movement follows world X/Z axes, not camera direction.\n\nUse Low quality and smaller models for phones. Browser WebGL2 and WebAssembly support are required. Mobile GPU memory, thermal limits, and file-download behavior vary. This is a browser game, not a native app package.\n\nUpload the ZIP through the developer review workflow to publish on CrateShip Games. Exporting does not publish the game.');
 return {blob:new Blob([zipSync(files,{level:6})],{type:'application/zip'}),filename:(project.name.replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,80)||'crate-game')+'-web.zip'};
}
