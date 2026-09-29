import {playerCameraFollower,isInside} from './side-follow.mjs';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {ProjectStore} from '../core/project-store.mjs';
import {newProject,validateProject,cleanEntity,cleanSettings,STARTER_MODEL_URL} from '../core/schema.mjs';
import {expandLook} from '../core/look.mjs';
import {createWorldPreviewSession} from '../core/procedural.mjs';
import {inspectGLB,hashBytes,MAX_MODEL_BYTES} from '../core/gltf.mjs';
import * as local from '../storage/local.mjs';
import {createSceneRuntime,THREE,assetCacheKey} from './scene.mjs';
import {createPhysics} from './physics.mjs';
import {createAmbience} from './ambience.mjs';
import {groundWarnings,groundPlacements as findGroundPlacements,framingPose} from './scene-inspect.mjs';
import {mountTouchControls} from './touch-controls.mjs';
import {mountLookControls} from './look-controls.mjs';
import {mountGameHud} from './game-hud.mjs';
import {createSelectionGesture,cancelTransformGesture,preserveWorldTransform} from './editor-interactions.mjs';
import {exportGameZip,createPortableProject,readLimitedResponse,exportOriginalModel} from '../player/export.mjs';

export async function platformApi(path,options={}){
 const response=await fetch('/api/platform'+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers},body:options.body===undefined?undefined:JSON.stringify(options.body)});
 const body=await response.json().catch(()=>({}));
 if(!response.ok){const error=new Error(body.error?.message||(typeof body.error==='string'?body.error:'The request could not be completed.'));error.status=response.status;throw error;}
 return body;
}
const decode=value=>Uint8Array.from(atob(value),character=>character.charCodeAt(0));
const safeFilename=name=>String(name).replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,80)||'crate-world';

// Imported IDs are untrusted and must not replace assets already referenced by
// another saved project on this device. Local/cloud reopen retains stable IDs.
export async function prepareProjectLoad(input,{imported=false,name}={}){
 const project=validateProject(name?{...input,name}:input),embedded=new Map(),idMap=new Map();
 if(imported)project.id=crypto.randomUUID();
 for(const asset of project.assets){
  const oldId=asset.id;if(imported){asset.id=crypto.randomUUID();idMap.set(oldId,asset.id);}
  if(asset.embedded){const bytes=inspectGLB(decode(asset.embedded)).bytes,hash=await hashBytes(bytes);if(asset.sha256&&asset.sha256!==hash)throw new Error('Embedded model checksum does not match: '+asset.name);asset.sha256=hash;asset.size=bytes.length;embedded.set(asset.id,bytes);delete asset.embedded;delete asset.cloudId;delete asset.url;delete asset.legacyPath;}
 }
 if(imported)for(const entity of project.entities)if(entity.assetId)entity.assetId=idMap.get(entity.assetId)||entity.assetId;
 return {project,embedded};
}

export function createOperationLock(){
 let current=null,closed=false;
 return {get current(){return current;},assert(){if(closed)throw new Error('The editor has been closed.');if(current)throw new Error(current+' is still in progress.');},async run(name,task){this.assert();current=name;try{return await task();}finally{current=null;}},close(){closed=true;}};
}

export async function createEditor({canvas,onChange=()=>{},onSelection=()=>{},onStats=()=>{},onLog=()=>{},onState=()=>{}}){
 let selected=null,mode='edit',physics=null,disposed=false,dirty=true,navigationApproved=false,authoringRevision=0,raf=0,last=performance.now(),frames=0,statsAt=last;
 let cloud=null,syncPromise=Promise.resolve(),syncVersion=0,syncPending=false,isDragging=false,hasChanges=false,playSnapshot=null,playPending=false,sceneError=null,touchControls=null,lookControls=null,hud=null,editorCameraState=null,previewCamera=null,playClock=0,playEvents=[],scriptedPlay=false;
 const lifetime=new AbortController(),lock=createOperationLock(),assetBytes=new Map(),assetRequests=new Map();let cacheBytes=0;
 const alive=()=>{if(disposed)throw new Error('The editor has been closed.');};
 const state=()=>onState({mode,dirty:hasChanges,busy:lock.current||(playPending?'Starting preview':null),cloudId:cloud?.id||null});
 const remember=(key,bytes)=>{const previous=assetBytes.get(key);if(previous)cacheBytes-=previous.length;assetBytes.delete(key);assetBytes.set(key,bytes);cacheBytes+=bytes.length;while(cacheBytes>128*1024*1024&&assetBytes.size>1){const oldest=assetBytes.keys().next().value;cacheBytes-=assetBytes.get(oldest).length;assetBytes.delete(oldest);}return bytes;};
 async function remoteBytes(url,options={}){
  const timeout=new AbortController(),timer=setTimeout(()=>timeout.abort(),30000);
  try{const signal=AbortSignal.any([lifetime.signal,timeout.signal]);const response=await fetch(url,{...options,signal,redirect:'error'});if(!response.ok)throw new Error('Model download failed (HTTP '+response.status+').');return await readLimitedResponse(response,MAX_MODEL_BYTES,'Model download');}
  catch(error){if(error.name==='AbortError')throw new Error('Model download was cancelled or timed out.');throw error;}finally{clearTimeout(timer);}
 }
 async function resolveAsset(asset){
  alive();const key=assetCacheKey(asset),cached=assetBytes.get(key);if(cached){assetBytes.delete(key);assetBytes.set(key,cached);return cached;}
  if(assetRequests.has(key))return assetRequests.get(key);
  const request=(async()=>{
   let bytes=await local.getAsset(asset.id);alive();
   if(!bytes&&asset.embedded)bytes=decode(asset.embedded);
   if(!bytes&&asset.cloudId)bytes=await remoteBytes('/api/platform/engine/assets/'+encodeURIComponent(asset.cloudId),{credentials:'same-origin'});
   if(!bytes&&asset.url&&STARTER_MODEL_URL.test(asset.url))bytes=await remoteBytes(asset.url,{credentials:'omit'});
   if(!bytes)throw new Error('The original GLB is not stored here. Import it or open a portable project backup.');
   bytes=inspectGLB(bytes).bytes;
   if(asset.sha256&&await hashBytes(bytes)!==asset.sha256)throw new Error('Model checksum does not match the saved project.');
   alive();return remember(key,bytes);
  })();assetRequests.set(key,request);
  try{return await request;}finally{if(assetRequests.get(key)===request)assetRequests.delete(key);}
 }
 const view=createSceneRuntime({canvas,resolveAsset,onLog,onInvalidate:()=>dirty=true});if(import.meta.env?.DEV)globalThis.__crateView=view;const ambience=createAmbience();
 const controls=new OrbitControls(view.camera,canvas);controls.target.set(0,1,0);controls.enableDamping=true;controls.addEventListener('change',()=>dirty=true);
 const transform=new TransformControls(view.camera,canvas),helper=transform.getHelper();view.scene.add(helper);
 const grid=new THREE.GridHelper(100,100,'#587566','#2b3c33');grid.position.y=-.015;grid.userData.editorHelper=true;view.scene.add(grid);
 const selectionBox=new THREE.BoxHelper(undefined,'#ff8d45');selectionBox.visible=false;view.scene.add(selectionBox);
 function scheduleScene(project){
  sceneError=null;syncPending=true;const version=++syncVersion;transform.detach();selectionBox.visible=false;
  const pending=view.sync(project);syncPromise=pending.then(result=>{if(disposed||version!==syncVersion||result?.superseded)return result;syncPending=false;updateSelection();dirty=true;return result;},error=>{if(!disposed&&version===syncVersion){syncPending=false;sceneError=error;onLog({level:'error',message:error.message});}return {error};});
 }
 // Crash recovery: unsaved edits are mirrored to a single browser slot shortly after each change.
 let recoveryTimer=0,recoveryWrite=Promise.resolve();
 function writeRecovery(){clearTimeout(recoveryTimer);recoveryTimer=0;if(disposed||!hasChanges)return recoveryWrite;const record={version:1,savedAt:Date.now(),project:store.snapshot(),cloud:cloud?{id:cloud.id,revision:cloud.revision}:null};recoveryWrite=recoveryWrite.then(()=>local.saveRecovery(record)).catch(error=>onLog({level:'warn',message:'Autosave failed: '+error.message}));return recoveryWrite;}
 function scheduleRecovery(){if(disposed)return;clearTimeout(recoveryTimer);recoveryTimer=setTimeout(writeRecovery,1500);}
 function discardRecovery(){clearTimeout(recoveryTimer);recoveryTimer=0;recoveryWrite=recoveryWrite.then(()=>local.clearRecovery()).catch(()=>{});return recoveryWrite;}
 const store=new ProjectStore(newProject(),project=>{hasChanges=true;navigationApproved=false;authoringRevision++;scheduleScene(project);onChange(project);state();scheduleRecovery();});
 const worldPreviews=createWorldPreviewSession({getProject:()=>store.snapshot(),getRevision:()=>authoringRevision,apply:entities=>store.commit('Generate world',project=>project.entities.push(...entities))});
 function editable(){alive();lock.assert();if(mode!=='edit'||playPending)throw new Error('Stop the preview before changing the scene.');if(isDragging)throw new Error('Finish the current transform before continuing.');}
 async function settled(){await syncPromise;alive();if(sceneError)throw sceneError;}
 async function exclusive(name,task){editable();try{return await lock.run(name,async()=>{transform.enabled=false;state();return task();});}finally{transform.enabled=!disposed&&mode==='edit';if(!disposed)state();}}
 function updateSelection(){
  const entity=store.project.entities.find(item=>item.id===selected)||null,object=view.objects.get(selected);if(!entity)selected=null;
  transform.detach();selectionBox.visible=!!object&&mode==='edit'&&!syncPending;transform.enabled=mode==='edit'&&!lock.current&&!syncPending;
  if(object&&mode==='edit'&&!syncPending&&object.parent){transform.attach(object);selectionBox.setFromObject(object);}onSelection(entity?structuredClone(entity):null);dirty=true;
 }
 const selectionGesture=createSelectionGesture();
 const dragging=event=>{isDragging=event.value;if(isDragging)selectionGesture.block();controls.enabled=!event.value&&!previewCamera;};
 const objectChange=()=>{selectionBox.update();dirty=true;};
 const transformEnd=()=>{if(disposed||lock.current||mode!=='edit')return;const object=view.objects.get(selected),entity=store.project.entities.find(item=>item.id===selected);if(!object||!entity)return;const patch={position:object.position.toArray(),rotation:[object.rotation.x,object.rotation.y,object.rotation.z].map(THREE.MathUtils.radToDeg),scale:object.scale.toArray()};if(Object.keys(patch).some(key=>patch[key].some((value,index)=>Math.abs(value-entity[key][index])>1e-7)))store.update(selected,patch);};
 transform.addEventListener('dragging-changed',dragging);transform.addEventListener('objectChange',objectChange);transform.addEventListener('mouseUp',transformEnd);
 const pointerDown=event=>selectionGesture.begin(event,{blocked:isDragging||mode!=='edit'||!!lock.current||syncPending});
 const pointerMove=event=>selectionGesture.move(event);
 const effectivelyVisible=object=>{for(let node=object;node;node=node.parent)if(node.visible===false)return false;return true;};
 const pointerUp=event=>{if(!selectionGesture.end(event)||mode!=='edit'||lock.current||syncPending||isDragging||transform.axis)return;const rect=canvas.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return;const ray=new THREE.Raycaster();ray.firstHitOnly=true;ray.layers.enableAll();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),view.camera);const hit=ray.intersectObjects(view.root.children,true).find(item=>effectivelyVisible(item.object)&&item.object.userData.entityId);select(hit?.object.userData.entityId||null);};
 function cancelActiveTransform(){selectionGesture.cancel();if(disposed)return;if(cancelTransformGesture(transform)){isDragging=false;controls.enabled=!previewCamera;updateSelection();dirty=true;}}
 const lostPointer=()=>queueMicrotask(()=>{selectionGesture.cancel();if(isDragging)cancelActiveTransform();});
 const visibility=()=>{if(document.hidden){cancelActiveTransform();if(recoveryTimer)writeRecovery();}};
 canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerup',pointerUp);
 canvas.addEventListener('pointercancel',cancelActiveTransform);canvas.addEventListener('lostpointercapture',lostPointer);window.addEventListener('blur',cancelActiveTransform);document.addEventListener('visibilitychange',visibility);
 function select(id){alive();if(isDragging)cancelActiveTransform();selected=id;updateSelection();return selected;}
 function frameSelection(){if(mode!=='edit')return;const object=view.objects.get(selected)||view.root,box=new THREE.Box3().setFromObject(object);if(box.isEmpty())return;const center=box.getCenter(new THREE.Vector3()),size=Math.max(box.getSize(new THREE.Vector3()).length(),2);controls.target.copy(center);view.camera.position.copy(center).add(new THREE.Vector3(1,.65,1).normalize().multiplyScalar(size*1.3));view.camera.near=.05;view.camera.far=Math.max(3000,size*10);view.camera.updateProjectionMatrix();controls.update();dirty=true;}
 const cameraPosition=new THREE.Vector3(),cameraRotation=new THREE.Quaternion();
 let sideViewFollow=null;const sideFollower=playerCameraFollower();
 function followPreviewCamera(dt=0){if(!previewCamera)return;previewCamera.updateWorldMatrix(true,false);view.camera.position.copy(previewCamera.getWorldPosition(cameraPosition));view.camera.quaternion.copy(previewCamera.getWorldQuaternion(cameraRotation));if(sideViewFollow){const player=view.objects.get(sideViewFollow.id);if(player){player.updateWorldMatrix(true,false);sideFollower.apply(player.getWorldPosition(cameraPosition),view.camera.position,dt);if(sideFollower.mode==='chase'){const t=sideFollower.target;view.camera.lookAt(t.x,t.y,t.z);}}}}
 function beginPreviewCamera(){
  editorCameraState={position:view.camera.position.clone(),quaternion:view.camera.quaternion.clone(),target:controls.target.clone(),fov:view.camera.fov,near:view.camera.near,far:view.camera.far};
  previewCamera=view.gameCamera();controls.enabled=!previewCamera;
  if(previewCamera){view.camera.fov=previewCamera.fov;view.camera.near=previewCamera.near;view.camera.far=previewCamera.far;view.camera.updateProjectionMatrix();sideViewFollow=null;sideFollower.stop();followPreviewCamera();sideViewFollow=store.project.entities.find(entity=>entity.components.player&&physics?.bodies.has(entity.id))||null;if(sideViewFollow){const player=view.objects.get(sideViewFollow.id);if(!player||isInside(previewCamera,player))sideViewFollow=null;else{player.updateWorldMatrix(true,false);sideFollower.start(player.getWorldPosition(cameraPosition).clone(),view.camera.position,previewCamera.fov,sideViewFollow.components.player.sideView===true);}}}
 }
 function restoreEditorCamera(){
  previewCamera=null;controls.enabled=true;if(!editorCameraState)return;const saved=editorCameraState;editorCameraState=null;
  // Flush residual orbit damping before restoring the exact edit camera.
  const damping=controls.enableDamping;controls.enableDamping=false;controls.update();
  view.camera.position.copy(saved.position);view.camera.quaternion.copy(saved.quaternion);controls.target.copy(saved.target);view.camera.fov=saved.fov;view.camera.near=saved.near;view.camera.far=saved.far;view.camera.updateProjectionMatrix();controls.update();controls.enableDamping=damping;
 }
 function loop(time){
  if(disposed)return;raf=requestAnimationFrame(loop);const dt=Math.min((time-last)/1000,.05);last=time;if(document.hidden)return;if(controls.enabled)controls.update();
  if(mode==='play'){if(!scriptedPlay){if(physics&&lookControls){physics.setPadInput(lookControls.poll(dt));physics.setViewYaw(sideFollower.yaw);}physics?.step(dt);playClock+=dt;view.tick(dt);followPreviewCamera(dt);}dirty=true;}
  const water=view.hasWater();if(mode==='edit')grid.visible=!water;
  if(dirty||isDragging||water){view.render();frames++;dirty=false;}
  if(time-statsAt>1000){onStats({fps:Math.round(frames*1000/(time-statsAt)),drawCalls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles,entities:store.project.entities.length,mode});statsAt=time;frames=0;}
 }
 const observer=new ResizeObserver(()=>view.resize());observer.observe(canvas);view.resize();raf=requestAnimationFrame(loop);
 function clearCloudUrl(){const url=new URL(location.href);url.pathname='/play';url.searchParams.delete('project');history.replaceState(null,'',url.pathname+url.search+url.hash);}
 function setCloudUrl(){const url=new URL(location.href);url.pathname='/play';url.searchParams.set('project',cloud.id);history.replaceState(null,'',url.pathname+url.search+url.hash);}
 async function preserveCurrent(){if(!hasChanges)return;const backup=store.snapshot();backup.id=crypto.randomUUID();backup.name=(backup.name+' (recovery)').slice(0,120);await local.saveProject(backup);alive();onLog({level:'info',message:'Saved a local recovery copy before switching projects.'});}
 async function loadPrepared(prepared,{source='import',cloudRecord=null,preserve=true}={}){
  if(preserve)await preserveCurrent();
  for(const [id,bytes]of prepared.embedded){await local.saveAsset(id,bytes);alive();}
  const next=prepared.project;selected=null;cloud=cloudRecord;
  store.load(next);await settled();
  hasChanges=source==='import'||source==='recovery';if(cloud)setCloudUrl();else clearCloudUrl();
  const keys=new Set(next.assets.map(assetCacheKey));for(const [key,bytes]of assetBytes)if(!keys.has(key)){assetBytes.delete(key);cacheBytes-=bytes.length;}
  if(hasChanges)scheduleRecovery();else await discardRecovery();
  for(const message of next.migrationWarnings||[])onLog({level:'warn',message});state();return store.snapshot();
 }
 async function makeNew(name,{preserve=true,initial=false}={}){
  if(preserve)await preserveCurrent();const project=newProject(name);
  project.entities=[cleanEntity({type:'box',name:'Ground',position:[0,-.125,0],scale:[12,.25,12],material:{color:'#46624f',roughness:.9},components:{rigidbody:{type:'static'}}}),cleanEntity({type:'box',name:'Cube',position:[0,2,0],material:{color:'#f38b3f',roughness:.35},components:{rigidbody:{type:'dynamic'}}}),cleanEntity({type:'directionalLight',name:'Sun',position:[4,8,5],light:{intensity:4,color:'#fff0d6'}})];
  const result=await loadPrepared({project,embedded:new Map()},{source:initial?'initial':'import',preserve:false});return result;
 }
 async function importModel(input,name='Imported model',source='local'){
  const bytes=inspectGLB(input).bytes,sha256=await hashBytes(bytes);alive();const existing=store.project.assets.find(asset=>asset.sha256===sha256);if(existing)return instantiate(existing.id);
  const asset={id:crypto.randomUUID(),name:String(name).replace(/\.glb$/i,'').slice(0,180),size:bytes.length,sha256,source,mime:'model/gltf-binary'};
  await local.saveAsset(asset.id,bytes);alive();remember(assetCacheKey(asset),bytes);
  const entity=cleanEntity({type:'model',name:asset.name,assetId:asset.id,position:[0,0,0],components:{animation:{autoplay:true}}});
  store.commit('Import model',project=>{project.assets.push(asset);project.entities.push(entity);});await settled();select(entity.id);frameSelection();view.assertComplete();return asset;
 }
 async function importAsset(input,name='Imported model',source='mcp'){
  const bytes=inspectGLB(input).bytes,sha256=await hashBytes(bytes);alive();const existing=store.project.assets.find(asset=>asset.sha256===sha256);if(existing)return existing;
  const asset={id:crypto.randomUUID(),name:String(name).replace(/.glb$/i,'').slice(0,180),size:bytes.length,sha256,source,mime:'model/gltf-binary'};
  await local.saveAsset(asset.id,bytes);alive();remember(assetCacheKey(asset),bytes);
  store.commit('Import model',project=>{project.assets.push(asset);});await settled();return asset;
 }
 async function instantiate(assetId){const asset=store.project.assets.find(item=>item.id===assetId);if(!asset)throw new Error('Choose an asset from this project.');const id=store.add('model',{assetId,name:asset.name,position:[0,0,0],components:{animation:{autoplay:true}}});await settled();select(id);return id;}
 async function importBatch(files){
  const list=Array.from(files);if(!list.length)return;
  const projects=list.filter(file=>/\.(crate|json)$/i.test(file.name));if(projects.length&&(projects.length!==1||list.length!==1))throw new Error('Open one project file at a time. Import models in a separate action.');
  for(const file of list)if(!/\.(glb|crate|json)$/i.test(file.name))throw new Error('Import a .glb model or .crate project backup.');
  if(projects.length){const file=projects[0];if(file.size>128*1024*1024)throw new Error('Project backup exceeds 128 MB.');const prepared=await prepareProjectLoad(JSON.parse(await file.text()),{imported:true});alive();return loadPrepared(prepared);}
  // Validate every selected file before changing the scene, so an unsupported
  // trailing file cannot discard or partially replace a project.
  const parsed=[];let total=0;for(const file of list){if(file.size>MAX_MODEL_BYTES)throw new Error('GLB exceeds 32 MB.');total+=file.size;if(total>80*1024*1024)throw new Error('Import up to 80 MB of models at a time.');parsed.push({name:file.name,bytes:inspectGLB(await file.arrayBuffer()).bytes});alive();}
  for(const item of parsed)await importModel(item.bytes,item.name);return store.snapshot();
 }
 async function persistLocal(){
  const snapshot=store.snapshot();for(const asset of snapshot.assets){const bytes=await resolveAsset(asset);await local.saveAsset(asset.id,bytes);alive();}
  await local.saveProject(snapshot);alive();hasChanges=false;await discardRecovery();state();return {id:snapshot.id,name:snapshot.name};
 }
 async function cloudLoad(id,{preserve=true}={}){
  const result=await platformApi('/projects/'+encodeURIComponent(id),{signal:lifetime.signal});alive();if(!result.project?.data)throw new Error('The cloud project is unavailable.');
  const prepared=await prepareProjectLoad(result.project.data,{name:result.project.name});alive();
  return loadPrepared(prepared,{source:'cloud',cloudRecord:{id:result.project.id,revision:result.project.revision},preserve});
 }
 async function cloudSave(){
  await settled();view.assertComplete();const snapshot=store.snapshot();
  // Preflight every original model before any network mutation, even when an
  // older snapshot already has a cloud identifier for that asset.
  for(const asset of snapshot.assets){const bytes=await resolveAsset(asset);asset.sha256=await hashBytes(bytes);asset.size=bytes.length;await local.saveAsset(asset.id,bytes);alive();}
  await local.saveProject(snapshot);alive();
  for(const asset of snapshot.assets){
   // The current account must own each referenced private object. The server
   // deduplicates these exact bytes within that account; a stored foreign ID
   // from another account on this device must never be trusted as ownership.
   const bytes=await resolveAsset(asset);
   const response=await fetch('/api/platform/engine/assets',{method:'POST',credentials:'same-origin',signal:lifetime.signal,headers:{'Content-Type':'model/gltf-binary','X-Asset-Name':encodeURIComponent(asset.name.slice(0,120))},body:bytes});
   const result=await response.json().catch(()=>({}));alive();
   if(!response.ok)throw new Error(result.error?.message||'Private model storage is not configured. Your local backup is preserved.');
   if(!result.asset?.id||result.asset.sha256!==asset.sha256||result.asset.size!==bytes.length)throw new Error('Private storage did not confirm the exact uploaded model. The project has not been cloud saved.');
   asset.cloudId=result.asset.id;delete asset.embedded;delete asset.url;delete asset.legacyPath;
  }
  const result=await platformApi(cloud?'/projects/'+encodeURIComponent(cloud.id):'/projects',{method:cloud?'PUT':'POST',signal:lifetime.signal,body:{name:snapshot.name,project:snapshot,...(cloud?{revision:cloud.revision}:{})}});alive();
  if(!result.project?.id||!Number.isSafeInteger(result.project.revision))throw new Error('The cloud service did not confirm the saved project revision.');
  // Scene mutations are locked for this operation; only persistence metadata
  // changes here, without adding a misleading user-edit undo step.
  store.project.assets=structuredClone(snapshot.assets);authoringRevision++;worldPreviews.invalidate();cloud={id:result.project.id,revision:result.project.revision};setCloudUrl();hasChanges=false;await discardRecovery();
  onChange(store.snapshot());state();return result.project;
 }
 async function play(){
  if(mode==='play')return;if(playPending)throw new Error('Physics is still loading.');editable();playPending=true;transform.enabled=false;state();
  try{await settled();view.assertComplete();playSnapshot=store.snapshot();playClock=0;playEvents=[];view.resetAnimations();hud?.dispose();hud=mountGameHud(canvas.parentElement,{maxLives:playSnapshot.settings.lives||0,onRestart:()=>{void stop().then(()=>play()).catch(error=>onLog({level:'error',message:error.message}));},onExit:()=>{void stop().catch(error=>onLog({level:'error',message:error.message}));}});
 const next=await createPhysics(playSnapshot,view.objects,{onScore:score=>onLog({level:'info',message:'Score: '+score}),onLog,onEvent:event=>{hud?.handle(event);if(playEvents.length<60)playEvents.push({...event,at:playClock});if(event.type==='win')onLog({level:'info',message:'Level complete! Score: '+event.score});else if(event.type==='lose')onLog({level:'info',message:'Game over. Score: '+event.score});}});if(disposed){next.dispose();return;}physics=next;beginPreviewCamera();mode='play';ambience.start(playSnapshot.settings);transform.detach();grid.visible=false;selectionBox.visible=false;const player=playSnapshot.entities.find(entity=>entity.components.player&&physics.bodies.has(entity.id));touchControls=mountTouchControls(canvas.parentElement,{onInput:value=>physics?.setInput(value),enabled:!!player,sideView:player?.components.player.sideView===true});lookControls=mountLookControls(canvas,{onLook:(yaw,pitch)=>sideFollower.rotate(yaw,pitch),onZoom:factor=>sideFollower.zoom(factor)});onLog({level:'info',message:'Preview running. Player components use touch / WASD / arrows / a gamepad and Jump / Space; drag the view (or the right stick) to look around. Stop to select and move scene objects.'});dirty=true;state();}
  catch(error){hud?.dispose();hud=null;touchControls?.dispose();touchControls=null;lookControls?.dispose();lookControls=null;physics?.dispose();physics=null;mode='edit';restoreEditorCamera();playSnapshot=null;grid.visible=true;transform.enabled=!disposed;throw error;}finally{playPending=false;if(!disposed)state();}
 }
 async function stop(){
  alive();if(playPending)throw new Error('Physics is still loading.');if(mode!=='play')return;
  try{await lock.run('Stopping preview',async()=>{
   ambience.stop();hud?.dispose();hud=null;touchControls?.dispose();touchControls=null;lookControls?.dispose();lookControls=null;physics?.dispose();physics=null;mode='edit';restoreEditorCamera();grid.visible=true;transform.enabled=false;view.resetAnimations();state();
   // The authoring store never receives simulation transforms, scores, or hidden
   // collectibles. Restore precisely the snapshot used to enter preview.
   scheduleScene(playSnapshot||store.snapshot());await settled();playSnapshot=null;updateSelection();dirty=true;
  });}finally{transform.enabled=!disposed&&mode==='edit';if(!disposed)state();}
 }
 async function exportProject(){await settled();view.assertComplete();const portable=await createPortableProject(store.snapshot(),resolveAsset);return {blob:new Blob([JSON.stringify(portable)],{type:'application/json'}),filename:safeFilename(portable.name)+'.crate'};}
 const beforeUnload=event=>{if(hasChanges&&!navigationApproved){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);
 /** One screenshot of the scene for an AI app: the editor view or the game camera, without the grid and selection gizmos. */
 async function screenshot({view:source='editor',width=960}={}){
  alive();await settled();view.assertComplete();if(lock.current)throw new Error(lock.current+' is still in progress.');
  const helpers=[grid,helper,selectionBox],wasVisible=helpers.map(item=>item.visible);let previewBegun=false;
  try{
   if(source==='game'&&mode==='edit'){beginPreviewCamera();previewBegun=true;if(!previewCamera)throw new Error('This project has no Camera object yet. Add one, or take the screenshot with view "editor".');}
   helpers.forEach(item=>item.visible=false);
   for(const quality of [.82,.66,.5]){
    const shot=view.capture({width,quality}),data=shot.dataUrl.slice(shot.dataUrl.indexOf(',')+1);
    if(data.length<=380*1024)return {mimeType:'image/jpeg',data,width:shot.width,height:shot.height,view:previewBegun||mode==='play'?'game':'editor'};
   }
   throw new Error('The screenshot was too large to send. Ask for a smaller width.');
  }finally{helpers.forEach((item,index)=>{item.visible=wasVisible[index];});if(previewBegun)restoreEditorCamera();dirty=true;}
 }
 /** For AI builders: a picture framed on the changed objects (or the current view) plus automatic floating/ground checks. */
 async function inspectChange({ids=[],look=true,width=640}={}){
  alive();await settled();const warnings=[];let image=null;
  if(ids.length){try{warnings.push(...groundWarnings({THREE,root:view.root,objects:view.objects,project:store.project,ids}));}catch(error){warnings.push('The ground check failed: '+error.message);}}
  if(look&&mode==='edit'&&!lock.current){
   const box=new THREE.Box3();for(const id of ids){const object=view.objects.get(id);if(object&&!object.isLight&&!object.isCamera)box.expandByObject(object);}
   const saved={position:view.camera.position.clone(),quaternion:view.camera.quaternion.clone(),near:view.camera.near,far:view.camera.far};
   const helpers=[grid,helper,selectionBox],wasVisible=helpers.map(item=>item.visible);
   try{
    if(!box.isEmpty()){const pose=framingPose(THREE,box,view.camera.aspect||16/9,view.camera.fov);view.camera.position.copy(pose.position);view.camera.lookAt(pose.target);view.camera.near=.05;view.camera.far=Math.max(3000,pose.position.distanceTo(pose.target)*20);view.camera.updateProjectionMatrix();}
    helpers.forEach(item=>item.visible=false);
    for(const quality of [.72,.55,.42]){const shot=view.capture({width,quality}),data=shot.dataUrl.slice(shot.dataUrl.indexOf(',')+1);if(data.length<=300*1024){image={mimeType:'image/jpeg',data};break;}}
   }catch(error){warnings.push('The picture could not be taken: '+error.message);}
   finally{helpers.forEach((item,index)=>{item.visible=wasVisible[index];});view.camera.position.copy(saved.position);view.camera.quaternion.copy(saved.quaternion);view.camera.near=saved.near;view.camera.far=saved.far;view.camera.updateProjectionMatrix();dirty=true;}
  }
  return {image,warnings};
 }
 async function checkScene(){alive();await settled();const ids=store.project.entities.map(entity=>entity.id);return {checked:Math.min(ids.length,150),warnings:groundWarnings({THREE,root:view.root,objects:view.objects,project:store.project,ids}),performance:view.performanceReport()};}
 async function groundPlacements(ids,surface='any',offset=0){alive();await settled();return findGroundPlacements({THREE,root:view.root,objects:view.objects,project:store.project,ids,surface,offset});}
 const PLAY_MOVES={left:{x:-1,z:0},right:{x:1,z:0},up:{x:0,z:-1},down:{x:0,z:1},none:{x:0,z:0}},round=value=>Math.round(value*100)/100;
 /**
  * Plays the level with scripted input, reports what happened, then stops and restores the editor.
  * The simulation is stepped here at a fixed 60 Hz, faster than real time, so a report does not depend on
  * frame rate or on whether the tab is in front, and it matches what a player would see at 60 fps.
  */
 async function playTest({seconds=5,steps=null,screenshot:takeShot=true,width=800}={}){
  alive();await play();scriptedPlay=true;
  try{
   const player=playSnapshot.entities.find(entity=>entity.components.player&&physics.bodies.has(entity.id));
   if(!player)throw new Error('Nothing to test: no object has a Player component with a solid body. Add a player first.');
   const body=physics.bodies.get(player.id),position=()=>{const p=body.translation();return [round(p.x),round(p.y),round(p.z)];};
   const plan=(steps||[{move:'none',seconds}]).map(step=>({move:step.move||'none',jump:step.jump===true,seconds:step.seconds})),total=plan.reduce((sum,step)=>sum+step.seconds,0);
   const dt=1/60,start=position(),begin=playClock,path=[],wallLimit=performance.now()+15000;let minY=start[1],maxY=start[1],nextSample=0,timedOut=false,ticks=0;
   for(;;){
    const t=playClock-begin;let offset=0,step=null;
    for(const candidate of plan){if(t<offset+candidate.seconds-1e-9){step=candidate;break;}offset+=candidate.seconds;}
    const current=position();minY=Math.min(minY,current[1]);maxY=Math.max(maxY,current[1]);
    if(t>=nextSample-1e-9&&path.length<40){path.push({t:round(t),x:current[0],y:current[1],z:current[2]});nextSample+=.5;}
    if(!step||physics.state.status!=='playing')break;
    if(performance.now()>wallLimit){timedOut=true;break;}
    physics.setInput({...PLAY_MOVES[step.move],jump:step.jump&&((t-offset)%.6)<.25});
    physics.step(dt);playClock+=dt;view.tick(dt);followPreviewCamera(dt);
    if(++ticks%40===0)await new Promise(resolve=>setTimeout(resolve,0));alive();
   }
   physics.clearInput();
   const end=position(),state=physics.state,elapsed=playClock-begin;
   const report={seconds:round(elapsed),start,end,minY,maxY,path,state:{status:state.status,score:state.score,lives:state.lives,maxLives:state.maxLives},events:playEvents.map(event=>({type:String(event.type).slice(0,40),at:round(event.at),...(Number.isFinite(event.score)?{score:event.score}:{}),...(Number.isFinite(event.lives)?{lives:event.lives}:{}),...(typeof event.message==='string'?{message:event.message.slice(0,120)}:{}),...(typeof event.name==='string'?{name:event.name.slice(0,100)}:{})}))};
   if(timedOut)report.warning='This computer was too slow to finish: only '+round(elapsed)+' of '+round(total)+' seconds were simulated.';
   if(takeShot){try{const shot=await screenshot({view:'game',width});report.image={mimeType:shot.mimeType,data:shot.data};}catch(error){report.screenshotError=String(error.message).slice(0,200);}}
   return report;
  }finally{scriptedPlay=false;await stop();}
 }
 const api={
  getProject:()=>store.snapshot(),get dirty(){return hasChanges;},get mode(){return mode;},get busy(){return lock.current;},
  setNavigationApproved(value){navigationApproved=value===true;},
  previewWorld(recipe){editable();return worldPreviews.preview(recipe);},
  applyWorld:request=>exclusive('World generation',async()=>{await settled();const preview=worldPreviews.inspect(request),ids=new Set(preview.entities.filter(entity=>entity.type==='model').map(entity=>entity.assetId));const assets=store.project.assets.filter(asset=>ids.has(asset.id));if(assets.length!==ids.size)throw new Error('A model needed by this layout is no longer available. Review the recipe again.');await view.preflightAssets(assets);alive();const result=worldPreviews.apply(request);await settled();return result;}),
  loadProject:input=>exclusive('Project import',async()=>loadPrepared(await prepareProjectLoad(input,{imported:true}))),
  loadCloud:id=>exclusive('Cloud project load',()=>cloudLoad(id)),newProject:name=>exclusive('New project',()=>makeNew(name)),
  renameProject(name){editable();store.commit('Rename project',project=>project.name=String(name).slice(0,120));},
  updateSettings(patch){editable();patch=expandLook(patch);store.commit('Scene settings',project=>project.settings=cleanSettings({...project.settings,...patch}));},
  async addEntity(type){editable();const id=store.add(type,{position:['pointLight','directionalLight'].includes(type)?[3,5,3]:[0,.5,0]});await settled();select(id);return id;},
  select,get selectedId(){return selected;},updateEntity(id,patch){editable();const entity=store.project.entities.find(item=>item.id===id),object=view.objects.get(id);if(Object.hasOwn(patch,'parentId')&&patch.parentId!==entity?.parentId&&!['position','rotation','scale'].some(key=>Object.hasOwn(patch,key))){if(syncPending||!object)throw new Error('Wait for the scene to finish updating before changing a parent.');patch={...patch,...preserveWorldTransform(object,view.objects.get(patch.parentId)||view.root)};}return store.update(id,patch);},
  async duplicate(id=selected){editable();const next=store.duplicate(id);await settled();select(next);return next;},
  remove(id=selected){editable();store.remove(id);},undo(){editable();return store.undo();},redo(){editable();return store.redo();},
  setTool(tool){editable();transform.setMode(tool);dirty=true;},setSpace(space){editable();transform.setSpace(space);dirty=true;},frameSelection,
  importFiles:files=>exclusive('Asset import',()=>importBatch(files)),importGLB:(bytes,name,source)=>exclusive('Model import',()=>importModel(bytes,name,source)),importAsset:(bytes,name,source)=>exclusive('Model import',()=>importAsset(bytes,name,source)),
  addCatalogAsset:record=>exclusive('Catalog import',async()=>{const path=record.path||record.file;if(typeof path!=='string'||path.includes('..')||path.includes('\\')||/^[a-z]+:/i.test(path)||/[?#]/.test(path))throw new Error('The catalog asset path is invalid.');if(typeof record.url!=='string'||!STARTER_MODEL_URL.test(record.url))throw new Error('That model is not in the Starter Library.');const asset={id:crypto.randomUUID(),name:record.name||path.split('/').pop(),source:'catalog',mime:'model/gltf-binary',size:0,url:record.url};return importModel(await resolveAsset(asset),asset.name,'catalog');}),
  instantiateAsset:id=>exclusive('Asset instantiation',()=>instantiate(id)),play,stop,capture:screenshot,playTest,inspectChange,checkScene,groundPlacements,
  exportProject:()=>exclusive('Project export',exportProject),exportGame:()=>exclusive('Game export',async()=>{await settled();view.assertComplete();return exportGameZip(store.snapshot(),resolveAsset);}),
  exportAsset:id=>exclusive('Model export',async()=>{const asset=store.project.assets.find(item=>item.id===id);if(!asset)throw new Error('Choose a model from this project.');return exportOriginalModel(asset,resolveAsset);}),
  saveLocal:()=>exclusive('Local save',persistLocal),listLocal:local.listProjects,
  loadLocal:id=>exclusive('Local project load',async()=>{const data=await local.getProject(id);alive();if(!data)throw new Error('Local project was not found.');return loadPrepared(await prepareProjectLoad(data),{source:'local'});}),
  saveCloud:()=>exclusive('Cloud save',cloudSave),applyProposal(proposal){editable();return store.apply(proposal);},
  async dispose(){if(disposed)return;if(recoveryTimer)await writeRecovery();disposed=true;void ambience.dispose();clearTimeout(recoveryTimer);lock.close();lifetime.abort();cancelAnimationFrame(raf);observer.disconnect();hud?.dispose();hud=null;touchControls?.dispose();touchControls=null;lookControls?.dispose();lookControls=null;physics?.dispose();controls.dispose();transform.removeEventListener('dragging-changed',dragging);transform.removeEventListener('objectChange',objectChange);transform.removeEventListener('mouseUp',transformEnd);transform.dispose();selectionBox.geometry.dispose();selectionBox.material.dispose();grid.geometry.dispose();grid.material.dispose();canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerup',pointerUp);canvas.removeEventListener('pointercancel',cancelActiveTransform);canvas.removeEventListener('lostpointercapture',lostPointer);window.removeEventListener('blur',cancelActiveTransform);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('beforeunload',beforeUnload);assetBytes.clear();cacheBytes=0;await view.dispose();}
 };
 async function restoreRecovery(projectId){
  let record;try{record=await local.getRecovery();}catch{return false;}alive();
  if(!record?.project)return false;
  const recordCloud=record.cloud&&typeof record.cloud.id==='string'&&Number.isSafeInteger(record.cloud.revision)?{id:record.cloud.id,revision:record.cloud.revision}:null;
  if(projectId&&recordCloud?.id!==projectId){
   // Opening a different project: keep the unsaved work as a separate local project instead of dropping it.
   try{const copy=validateProject(record.project);copy.id=crypto.randomUUID();copy.name=(copy.name+' (recovered)').slice(0,120);await local.saveProject(copy);await local.clearRecovery();onLog({level:'info',message:'Unsaved work from another project was kept as "'+copy.name+'" in Open.'});}catch{}
   return false;
  }
  try{await loadPrepared(await prepareProjectLoad(record.project),{source:'recovery',cloudRecord:recordCloud,preserve:false});hasChanges=true;scheduleRecovery();state();onLog({level:'info',message:'Restored unsaved work from '+new Date(record.savedAt).toLocaleString()+'. Save to keep it, or start a new project.'});return true;}
  catch(error){onLog({level:'warn',message:'Unsaved work could not be restored: '+error.message});return false;}
 }
 try{const projectId=new URL(location.href).searchParams.get('project');const restored=await restoreRecovery(projectId);if(!restored){if(projectId)await cloudLoad(projectId,{preserve:false});else await makeNew('Untitled World',{preserve:false,initial:true});}await settled();if(!restored)hasChanges=false;state();return api;}
 catch(error){await api.dispose();throw error;}
}
