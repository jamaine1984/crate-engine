import {createWaterMesh,isWaterObject,updateWaterTime} from './water.mjs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createPost} from './post.mjs';
import {createAtmosphere} from './atmosphere.mjs';
import {computeBoundsTree,disposeBoundsTree,acceleratedRaycast} from 'three-mesh-bvh';
import {inspectGLB} from '../core/gltf.mjs';
import {createVectorObject} from './vector-shape.mjs';
THREE.BufferGeometry.prototype.computeBoundsTree=computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree=disposeBoundsTree;
THREE.Mesh.prototype.raycast=acceleratedRaycast;
export {THREE};

export function createGenerationGate(){let revision=0,closed=false;return {begin(){return ++revision;},current(token){return !closed&&token===revision;},close(){closed=true;revision++;}};}
export function assetCacheKey(asset){return JSON.stringify([asset?.id,asset?.sha256,asset?.cloudId,asset?.url,asset?.legacyPath,asset?.size]);}
export function applyTransform(object,entity){object.position.fromArray(entity.position);object.rotation.set(...entity.rotation.map(THREE.MathUtils.degToRad));object.scale.fromArray(entity.scale);object.visible=entity.visible;object.name=entity.name;object.userData.entityId=entity.id;}

function release(object){
 const geometries=new Set(),materials=new Set(),textures=new Set();
 object.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const material of Array.isArray(o.material)?o.material:[o.material])if(material){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
 for(const geometry of geometries){geometry.disposeBoundsTree?.();geometry.dispose();}
 for(const material of materials)material.dispose();
 for(const texture of textures)texture.dispose();
}
function releaseClone(object){object.traverse(child=>{if(child.isSkinnedMesh)child.skeleton?.dispose();});}

export function createModelInstance(gltf,entity,{onLog=()=>{}}={}){
 // Preserve imported root transforms and animation binding names. Editable
 // entity transforms belong to a wrapper around the original GLB scene root.
 const content=cloneSkeleton(gltf.scene),object=new THREE.Group();object.add(content);let mixer=null;
 if(entity.components.animation?.autoplay&&gltf.animations.length){
  mixer=new THREE.AnimationMixer(content);
  const requested=entity.components.animation.clip,clip=gltf.animations.find(item=>item.name===requested)||gltf.animations[0];
  if(requested&&clip.name!==requested)onLog({level:'warn',message:`Animation clip "${requested}" was not found in ${entity.name}. Using "${clip.name}".`});
  mixer.clipAction(clip).play();mixer.timeScale=entity.components.animation.speed;
 }
 return {object,mixer};
}

export function createSceneRuntime({canvas,resolveAsset,onLog=()=>{},onInvalidate=()=>{}}){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.autoUpdate=true;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.info.autoReset=false;
 const scene=new THREE.Scene(),root=new THREE.Group();scene.add(root);
 const camera=new THREE.PerspectiveCamera(50,1,.05,3000);camera.position.set(8,6,9);camera.lookAt(0,1,0);
 const ambient=new THREE.HemisphereLight('#e5f1ff','#353f2c',.8);scene.add(ambient);
 const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),environment=pmrem.fromScene(room,.04);
 scene.environment=environment.texture;room.dispose();pmrem.dispose();
 const atmosphere=createAtmosphere(THREE,{renderer,scene,defaultEnvironment:environment.texture}),post=createPost(THREE,{renderer,scene,camera,root});
 const objects=new Map(),entries=new Map(),loaded=new Map(),missing=new Map(),gate=createGenerationGate();
 const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
 let project=null,disposed=false,width=1,height=1,shadowWarning=false;

 function geometry(type){switch(type){case'sphere':return new THREE.SphereGeometry(.5,32,20);case'cylinder':return new THREE.CylinderGeometry(.5,.5,1,24);case'capsule':return new THREE.CapsuleGeometry(.3,.5,6,16);case'plane':return new THREE.BoxGeometry(1,.02,1);default:return new THREE.BoxGeometry(1,1,1);}}
 function disposeCache(key){const cached=loaded.get(key);if(!cached)return;loaded.delete(key);if(cached.released)return;cached.released=true;cached.promise.then(gltf=>release(gltf.scene)).catch(()=>{});}
 function sourceFor(asset){
  const key=assetCacheKey(asset);let cached=loaded.get(key);
  if(!cached){cached={released:false,promise:null};cached.promise=(async()=>{const bytes=inspectGLB(await resolveAsset(asset)).bytes;const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');try{gltf.scene.traverse(object=>{if(object.isMesh&&!object.isSkinnedMesh&&object.geometry?.attributes.position?.count<300000)object.geometry.computeBoundsTree();});return gltf;}catch(error){release(gltf.scene);throw error;}})();loaded.set(key,cached);cached.promise.catch(()=>{if(loaded.get(key)===cached)loaded.delete(key);});}
  return cached.promise;
 }
 async function preflightAssets(assets){
  if(disposed)throw new Error('The renderer has been closed.');const previous=new Set(loaded.keys());
  try{for(const asset of assets){await sourceFor(asset);if(disposed)throw new Error('The renderer has been closed.');}}
  catch(error){for(const key of [...loaded.keys()])if(!previous.has(key))disposeCache(key);throw error;}
 }
 function disposeEntry(entry){
  entry.mixer?.stopAllAction();if(entry.mixer)entry.mixer.uncacheRoot(entry.mixer.getRoot());
  entry.object.removeFromParent();entry.object.target?.removeFromParent();entry.object.shadow?.dispose();
  if(entry.assetKey)releaseClone(entry.object);else release(entry.object);
 }
 async function createEntry(entity,asset,token,signature){
  let object,mixer=null,assetKey=null;
  if(entity.type==='model'){
   if(!asset)throw new Error('Model asset is missing.');
   const gltf=await sourceFor(asset);if(!gate.current(token))return null;
   ({object,mixer}=createModelInstance(gltf,entity,{onLog}));assetKey=assetCacheKey(asset);
  }else if(entity.type==='customMesh')object=createVectorObject(THREE,entity.shape);
  else if(entity.type==='plane'&&entity.components?.water)object=createWaterMesh(THREE,entity);
  else if(entity.type==='directionalLight'){
   object=new THREE.DirectionalLight(entity.light.color,entity.light.intensity);object.userData.baseIntensity=entity.light.intensity;object.target.position.set(0,0,0);
  }else if(entity.type==='pointLight'){
   object=new THREE.PointLight(entity.light.color,entity.light.intensity,entity.light.distance,2);object.shadow.mapSize.set(512,512);object.shadow.bias=-.001;
  }else if(entity.type==='camera')object=new THREE.PerspectiveCamera(55,1,.05,3000);
  else if(entity.type==='empty')object=new THREE.Group();
  else object=new THREE.Mesh(geometry(entity.type),new THREE.MeshStandardMaterial({...entity.material}));
  object.traverse(child=>{if(child.isMesh){child.castShadow=!isWaterObject(child);child.receiveShadow=true;}child.userData.entityId=entity.id;});
  const entry={object,mixer,assetKey,signature,error:null};
  if(!gate.current(token)){disposeEntry(entry);return null;}
  return entry;
 }
 function configure(settings){
  scene.background=new THREE.Color(settings.background);ambient.intensity=settings.ambientIntensity;scene.environmentIntensity=settings.ambientIntensity;
  renderer.toneMappingExposure=settings.exposure;renderer.shadowMap.enabled=settings.shadows;
  const ratio=Math.min(globalThis.devicePixelRatio||1,settings.quality==='low'?1:settings.quality==='high'?2:1.5);
  if(renderer.getPixelRatio()!==ratio)renderer.setPixelRatio(ratio);post.setPixelRatio(ratio);
  const sunLight=[...objects.values()].find(object=>object.isDirectionalLight&&object.castShadow)||null;atmosphere.configure(settings,sunLight);
  scene.fog=settings.fogDensity?new THREE.FogExp2(atmosphere.physical?atmosphere.horizon.getHex():settings.background,settings.fogDensity):null;post.configure(settings);
 }
 async function sync(next){
  if(disposed)throw new Error('The renderer has been closed.');
  const token=gate.begin(),snapshot=structuredClone(next),assets=new Map(snapshot.assets.map(asset=>[asset.id,asset])),staged=new Map(),created=[];
  try{
   for(const entity of snapshot.entities){
    if(!gate.current(token))return {superseded:true};
    const asset=assets.get(entity.assetId),signature=JSON.stringify([entity.type,entity.assetId?assetCacheKey(asset):null,entity.components.animation,entity.components.water||null,entity.type==='model'?null:entity.material,entity.type==='customMesh'?entity.shape:null,entity.light]);
    let entry=entries.get(entity.id);
    if(!entry||entry.signature!==signature||entry.error){
     try{entry=await createEntry(entity,asset,token,signature);}
     catch(error){if(!gate.current(token))return {superseded:true};const object=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:'#ff7a36',wireframe:true}));object.userData.entityId=entity.id;object.userData.missingAsset=true;entry={object,mixer:null,assetKey:null,signature,error:error.message||'Model could not be loaded.'};}
     if(entry)created.push(entry);
    }
    if(entry)staged.set(entity.id,entry);
   }
   if(!gate.current(token))return {superseded:true};
   // Detach entity roots before releasing a replaced parent. Child entities keep
   // ownership of their own geometry and must never be disposed by that parent.
   for(const entry of entries.values())entry.object.removeFromParent();
   for(const [id,entry] of entries)if(staged.get(id)!==entry)disposeEntry(entry);
   const previousMissing=new Map(missing);entries.clear();objects.clear();missing.clear();
   for(const [id,entry] of staged){entries.set(id,entry);objects.set(id,entry.object);if(entry.object.target)scene.add(entry.object.target);if(entry.error)missing.set(id,entry.error);}
   let directionalShadows=0,pointShadows=0,extraShadowLights=0;
   for(const entity of snapshot.entities){const object=objects.get(entity.id);if(object)applyTransform(object,entity);}
   for(const entity of snapshot.entities){const object=objects.get(entity.id);if(object)(objects.get(entity.parentId)||root).add(object);}
   for(const object of objects.values()){if(!object.isLight)continue;object.castShadow=false;if(!effectivelyVisible(object))continue;if(object.isDirectionalLight)object.castShadow=directionalShadows++<1;else if(object.isPointLight)object.castShadow=pointShadows++<2;if(!object.castShadow)extraShadowLights++;}
   configure(snapshot.settings);project=snapshot;scene.updateMatrixWorld(true);
   const activeSources=new Set([...entries.values()].map(entry=>entry.assetKey).filter(Boolean));for(const key of loaded.keys())if(!activeSources.has(key))disposeCache(key);
   if(extraShadowLights&&!shadowWarning){shadowWarning=true;onLog({level:'warn',message:'Shadows are limited to one sun and two point lights to keep the scene responsive.'});}else if(!extraShadowLights)shadowWarning=false;
   for(const [id,message] of missing)if(previousMissing.get(id)!==message)onLog({level:'error',message:`${snapshot.entities.find(entity=>entity.id===id)?.name||'Model'}: ${message}`});
   onInvalidate();return {superseded:false,missingAssets:[...missing].map(([id,message])=>({id,message}))};
  }finally{
   // Only committed entries may remain attached or retain per-instance mixers.
   const committed=new Set(entries.values());for(const entry of created)if(!committed.has(entry))disposeEntry(entry);
  }
 }
 function assertComplete(){if(missing.size)throw new Error('Resolve the missing or unsupported models before playing, cloud saving, or exporting: '+[...missing.keys()].map(id=>project?.entities.find(entity=>entity.id===id)?.name||id).join(', '));}
 function resize(){if(disposed)return;const rect=canvas.getBoundingClientRect();width=Math.max(1,Math.round(rect.width));height=Math.max(1,Math.round(rect.height));renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();post.setSize(width,height);onInvalidate();}
 function hasWater(){for(const entry of entries.values())if(isWaterObject(entry.object))return true;return false;}
 function stepWater(){const seconds=performance.now()/1000,sky=atmosphere.physical?atmosphere.horizon:scene.background&&scene.background.isColor?scene.background:null;for(const entry of entries.values())if(isWaterObject(entry.object))updateWaterTime(entry.object,seconds,sky);}
 function render(){if(disposed)return;stepWater();atmosphere.update(camera,performance.now()/1000);renderer.info.reset();if(post.active)post.render();else renderer.render(scene,camera);}
 /** Renders one frame at a fixed size and returns it as a JPEG data URL, then restores the on-screen size. Must be called synchronously after the render, before the browser presents the frame. */
 function capture({width=960,quality=.82}={}){
  if(disposed)throw new Error('The renderer has been closed.');
  const outWidth=Math.max(160,Math.min(1600,Math.round(width))),outHeight=Math.max(90,Math.round(outWidth/(camera.aspect||1))),ratio=renderer.getPixelRatio();
  renderer.setPixelRatio(1);post.setPixelRatio(1);renderer.setSize(outWidth,outHeight,false);post.setSize(outWidth,outHeight);camera.aspect=outWidth/outHeight;camera.updateProjectionMatrix();
  try{render();return {dataUrl:canvas.toDataURL('image/jpeg',quality),width:outWidth,height:outHeight};}
  finally{renderer.setPixelRatio(ratio);post.setPixelRatio(ratio);resize();}
 }
 function tick(dt){for(const entry of entries.values())entry.mixer?.update(dt);}
 function resetAnimations(){for(const entry of entries.values()){if(entry.mixer){entry.mixer.setTime(0);}}}
 function effectivelyVisible(object){for(let node=object;node;node=node.parent)if(node.visible===false)return false;return !!object;}
 function gameCamera(){const active=project?.entities.find(entity=>entity.type==='camera'&&effectivelyVisible(objects.get(entity.id)));return active?objects.get(active.id):null;}
 async function dispose(){if(disposed)return;disposed=true;gate.close();for(const entry of entries.values())entry.object.removeFromParent();for(const entry of entries.values())disposeEntry(entry);entries.clear();objects.clear();missing.clear();for(const key of [...loaded.keys()])disposeCache(key);atmosphere.dispose();post.dispose();environment.dispose();renderer.dispose();}
 return {THREE,renderer,scene,root,camera,objects,post,atmosphere,sync,preflightAssets,assertComplete,resize,render,capture,tick,hasWater,resetAnimations,dispose,gameCamera};
}
