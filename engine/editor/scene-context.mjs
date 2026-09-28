const entityFields=['id','name','type','parentId','position','rotation','scale','visible','material','light','components','assetId'];
export function sceneContext(project,{offset=0,limit=250}={}){
 const start=Math.max(0,Math.min(4999,Math.floor(offset))),size=Math.max(1,Math.min(250,Math.floor(limit)));
 return {projectId:project.id,name:project.name,settings:structuredClone(project.settings),entities:project.entities.slice(start,start+size).map(entity=>Object.fromEntries(entityFields.filter(key=>entity[key]!==undefined).map(key=>[key,structuredClone(entity[key])]))),assets:project.assets.map(({id,name,mime})=>({id,name,mime})),entityCount:project.entities.length,assetCount:project.assets.length,truncated:start>0||start+size<project.entities.length,offset:start,limit:size};
}
export function authoredSceneJSON(project){return JSON.stringify({id:project.id,name:project.name,settings:project.settings,entities:project.entities,assets:project.assets.map(({id,name,sha256})=>({id,name,sha256}))});}
export async function sceneFingerprint(project){
 const data=authoredSceneJSON(project);
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data)))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function modelSceneContext(project){
 const context=sceneContext(project);delete context.offset;delete context.limit;
 context.lightCount=project.entities.filter(entity=>['directionalLight','pointLight'].includes(entity.type)).length;
 context.baseFingerprint=await sceneFingerprint(project);
 context.assets=context.assets.slice(0,100);
 const size=()=>new TextEncoder().encode(JSON.stringify(context)).byteLength;
 while(size()>24000&&context.entities.length)context.entities.pop();
 while(size()>24000&&context.assets.length)context.assets.pop();
 context.truncated=context.entities.length<context.entityCount;
 context.assetsTruncated=context.assets.length<context.assetCount;
 return context;
}
// One object in full, including customMesh vector paths, so an AI client can copy or edit art.
export function objectContext(project,id){
 const entity=project.entities.find(item=>item.id===id);if(!entity)throw new Error('Object '+id+' is not in this project. Read the scene again.');
 return {projectId:project.id,entity:Object.fromEntries([...entityFields,'shape'].filter(key=>entity[key]!==undefined).map(key=>[key,structuredClone(entity[key])]))};
}
