import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {ProjectStore} from '../core/project-store.mjs';
import {newProject,validateProject,cleanEntity} from '../core/schema.mjs';
import {createWorldPreviewSession} from '../core/procedural.mjs';
import {inspectGLB,hashBytes,MAX_MODEL_BYTES} from '../core/gltf.mjs';
import * as local from '../storage/local.mjs';
import {createSceneRuntime,THREE,assetCacheKey} from './scene.mjs';
import {createPhysics} from './physics.mjs';
import {mountTouchControls} from './touch-controls.mjs';
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
 let cloud=null,syncPromise=Promise.resolve(),syncVersion=0,syncPending=false,isDragging=false,hasChanges=false,playSnapshot=null,playPending=false,sceneError=null,touchControls=null,editorCameraState=null,previewCamera=null;
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
   if(!bytes&&(asset.url||asset.legacyPath)){
    let path=asset.legacyPath;
    if(asset.url){const parsed=new URL(asset.url);if(parsed.origin!=='https://crateship-games-assets.pages.dev'||parsed.username||parsed.password)throw new Error('Unsupported asset host.');path=parsed.pathname;}
    path=String(path).replace(/^\/+/, '');if(path.includes('..')||path.includes('\\')||/^[a-z]+:/i.test(path)||/[?#]/.test(path))throw new Error('Unsafe model path.');
    bytes=await remoteBytes('https://crateship-games-assets.pages.dev/'+path,{credentials:'omit'});
   }
   if(!bytes)throw new Error('The original GLB is not stored here. Import it or open a portable project backup.');
   bytes=inspectGLB(bytes).bytes;
   if(asset.sha256&&await hashBytes(bytes)!==asset.sha256)throw new Error('Model checksum does not match the saved project.');
   alive();return remember(key,bytes);
  })();assetRequests.set(key,request);
  try{return await request;}finally{if(assetRequests.get(key)===request)assetRequests.delete(key);}
 }
 const view=createSceneRuntime({canvas,resolveAsset,onLog,onInvalidate:()=>dirty=true});
 const controls=new OrbitControls(view.camera,canvas);controls.target.set(0,1,0);controls.enableDamping=true;controls.addEventListener('change',()=>dirty=true);
 const transform=new TransformControls(view.camera,canvas),helper=transform.getHelper();view.scene.add(helper);
 const grid=new THREE.GridHelper(100,100,'#587566','#2b3c33');grid.position.y=-.015;view.scene.add(grid);
 const selectionBox=new THREE.BoxHelper(undefined,'#ff8d45');selectionBox.visible=false;view.scene.add(selectionBox);
 function scheduleScene(project){
  sceneError=null;syncPending=true;const version=++syncVersion;transform.detach();selectionBox.visible=false;
  const pending=view.sync(project);syncPromise=pending.then(result=>{if(disposed||version!==syncVersion||result?.superseded)return result;syncPending=false;updateSelection();dirty=true;return result;},error=>{if(!disposed&&version===syncVersion){syncPending=false;sceneError=error;onLog({level:'error',message:error.message});}return {error};});
 }
 const store=new ProjectStore(newProject(),project=>{hasChanges=true;navigationApproved=false;authoringRevision++;scheduleScene(project);onChange(project);state();});
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
 const pointerUp=event=>{if(!selectionGesture.end(event)||mode!=='edit'||lock.current||syncPending||isDragging||transform.axis)return;const rect=canvas.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return;const ray=new THREE.Raycaster();ray.firstHitOnly=true;ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),view.camera);const hit=ray.intersectObjects(view.root.children,true).find(item=>effectivelyVisible(item.object)&&item.object.userData.entityId);select(hit?.object.userData.entityId||null);};
 function cancelActiveTransform(){selectionGesture.cancel();if(disposed)return;if(cancelTransformGesture(transform)){isDragging=false;controls.enabled=!previewCamera;updateSelection();dirty=true;}}
 const lostPointer=()=>queueMicrotask(()=>{selectionGesture.cancel();if(isDragging)cancelActiveTransform();});
 const visibility=()=>{if(document.hidden)cancelActiveTransform();};
 canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerup',pointerUp);
 canvas.addEventListener('pointercancel',cancelActiveTransform);canvas.addEventListener('lostpointercapture',lostPointer);window.addEventListener('blur',cancelActiveTransform);document.addEventListener('visibilitychange',visibility);
 function select(id){alive();if(isDragging)cancelActiveTransform();selected=id;updateSelection();return selected;}
 function frameSelection(){if(mode!=='edit')return;const object=view.objects.get(selected)||view.root,box=new THREE.Box3().setFromObject(object);if(box.isEmpty())return;const center=box.getCenter(new THREE.Vector3()),size=Math.max(box.getSize(new THREE.Vector3()).length(),2);controls.target.copy(center);view.camera.position.copy(center).add(new THREE.Vector3(1,.65,1).normalize().multiplyScalar(size*1.3));view.camera.near=.05;view.camera.far=Math.max(3000,size*10);view.camera.updateProjectionMatrix();controls.update();dirty=true;}
 const cameraPosition=new THREE.Vector3(),cameraRotation=new THREE.Quaternion();
 function followPreviewCamera(){if(!previewCamera)return;previewCamera.updateWorldMatrix(true,false);view.camera.position.copy(previewCamera.getWorldPosition(cameraPosition));view.camera.quaternion.copy(previewCamera.getWorldQuaternion(cameraRotation));}
 function beginPreviewCamera(){
  editorCameraState={position:view.camera.position.clone(),quaternion:view.camera.quaternion.clone(),target:controls.target.clone(),fov:view.camera.fov,near:view.camera.near,far:view.camera.far};
  previewCamera=view.gameCamera();controls.enabled=!previewCamera;
  if(previewCamera){view.camera.fov=previewCamera.fov;view.camera.near=previewCamera.near;view.camera.far=previewCamera.far;view.camera.updateProjectionMatrix();followPreviewCamera();}
 }
 function restoreEditorCamera(){
  previewCamera=null;controls.enabled=true;if(!editorCameraState)return;const saved=editorCameraState;editorCameraState=null;
  // Flush residual orbit damping before restoring the exact edit camera.
  const damping=controls.enableDamping;controls.enableDamping=false;controls.update();
  view.camera.position.copy(saved.position);view.camera.quaternion.copy(saved.quaternion);controls.target.copy(saved.target);view.camera.fov=saved.fov;view.camera.near=saved.near;view.camera.far=saved.far;view.camera.updateProjectionMatrix();controls.update();controls.enableDamping=damping;
 }
 function loop(time){
  if(disposed)return;raf=requestAnimationFrame(loop);const dt=Math.min((time-last)/1000,.05);last=time;if(document.hidden)return;if(controls.enabled)controls.update();
  if(mode==='play'){physics?.step(dt);view.tick(dt);followPreviewCamera();dirty=true;}
  if(dirty||isDragging){view.render();frames++;dirty=false;}
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
  hasChanges=source==='import';if(cloud)setCloudUrl();else clearCloudUrl();
  const keys=new Set(next.assets.map(assetCacheKey));for(const [key,bytes]of assetBytes)if(!keys.has(key)){assetBytes.delete(key);cacheBytes-=bytes.length;}
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
  await local.saveProject(snapshot);alive();hasChanges=false;state();return {id:snapshot.id,name:snapshot.name};
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
  store.project.assets=structuredClone(snapshot.assets);authoringRevision++;worldPreviews.invalidate();cloud={id:result.project.id,revision:result.project.revision};setCloudUrl();hasChanges=false;
  onChange(store.snapshot());state();return result.project;
 }
 async function play(){
  if(mode==='play')return;if(playPending)throw new Error('Physics is still loading.');editable();playPending=true;transform.enabled=false;state();
  try{await settled();view.assertComplete();playSnapshot=store.snapshot();view.resetAnimations();const next=await createPhysics(playSnapshot,view.objects,{onScore:score=>onLog({level:'info',message:'Score: '+score}),onLog});if(disposed){next.dispose();return;}physics=next;beginPreviewCamera();mode='play';transform.detach();grid.visible=false;selectionBox.visible=false;touchControls=mountTouchControls(canvas.parentElement,{onInput:value=>physics?.setInput(value),enabled:playSnapshot.entities.some(entity=>entity.components.player&&physics.bodies.has(entity.id))});onLog({level:'info',message:'Preview running. Player components use touch / WASD / arrows and Jump / Space. Stop to select and move scene objects.'});dirty=true;state();}
  catch(error){touchControls?.dispose();touchControls=null;physics?.dispose();physics=null;mode='edit';restoreEditorCamera();playSnapshot=null;grid.visible=true;transform.enabled=!disposed;throw error;}finally{playPending=false;if(!disposed)state();}
 }
 async function stop(){
  alive();if(playPending)throw new Error('Physics is still loading.');if(mode!=='play')return;
  try{await lock.run('Stopping preview',async()=>{
   touchControls?.dispose();touchControls=null;physics?.dispose();physics=null;mode='edit';restoreEditorCamera();grid.visible=true;transform.enabled=false;view.resetAnimations();state();
   // The authoring store never receives simulation transforms, scores, or hidden
   // collectibles. Restore precisely the snapshot used to enter preview.
   scheduleScene(playSnapshot||store.snapshot());await settled();playSnapshot=null;updateSelection();dirty=true;
  });}finally{transform.enabled=!disposed&&mode==='edit';if(!disposed)state();}
 }
 async function exportProject(){await settled();view.assertComplete();const portable=await createPortableProject(store.snapshot(),resolveAsset);return {blob:new Blob([JSON.stringify(portable)],{type:'application/json'}),filename:safeFilename(portable.name)+'.crate'};}
 const beforeUnload=event=>{if(hasChanges&&!navigationApproved){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);
 const api={
  getProject:()=>store.snapshot(),get dirty(){return hasChanges;},get mode(){return mode;},get busy(){return lock.current;},
  setNavigationApproved(value){navigationApproved=value===true;},
  previewWorld(recipe){editable();return worldPreviews.preview(recipe);},
  applyWorld:request=>exclusive('World generation',async()=>{await settled();const preview=worldPreviews.inspect(request),ids=new Set(preview.entities.filter(entity=>entity.type==='model').map(entity=>entity.assetId));const assets=store.project.assets.filter(asset=>ids.has(asset.id));if(assets.length!==ids.size)throw new Error('A model needed by this layout is no longer available. Review the recipe again.');await view.preflightAssets(assets);alive();const result=worldPreviews.apply(request);await settled();return result;}),
  loadProject:input=>exclusive('Project import',async()=>loadPrepared(await prepareProjectLoad(input,{imported:true}))),
  loadCloud:id=>exclusive('Cloud project load',()=>cloudLoad(id)),newProject:name=>exclusive('New project',()=>makeNew(name)),
  renameProject(name){editable();store.commit('Rename project',project=>project.name=String(name).slice(0,120));},
  updateSettings(patch){editable();store.commit('Scene settings',project=>project.settings={...project.settings,...patch});},
  async addEntity(type){editable();const id=store.add(type,{position:['pointLight','directionalLight'].includes(type)?[3,5,3]:[0,.5,0]});await settled();select(id);return id;},
  select,get selectedId(){return selected;},updateEntity(id,patch){editable();const entity=store.project.entities.find(item=>item.id===id),object=view.objects.get(id);if(Object.hasOwn(patch,'parentId')&&patch.parentId!==entity?.parentId&&!['position','rotation','scale'].some(key=>Object.hasOwn(patch,key))){if(syncPending||!object)throw new Error('Wait for the scene to finish updating before changing a parent.');patch={...patch,...preserveWorldTransform(object,view.objects.get(patch.parentId)||view.root)};}return store.update(id,patch);},
  async duplicate(id=selected){editable();const next=store.duplicate(id);await settled();select(next);return next;},
  remove(id=selected){editable();store.remove(id);},undo(){editable();return store.undo();},redo(){editable();return store.redo();},
  setTool(tool){editable();transform.setMode(tool);dirty=true;},setSpace(space){editable();transform.setSpace(space);dirty=true;},frameSelection,
  importFiles:files=>exclusive('Asset import',()=>importBatch(files)),importGLB:(bytes,name,source)=>exclusive('Model import',()=>importModel(bytes,name,source)),
  addCatalogAsset:record=>exclusive('Catalog import',async()=>{const path=record.path||record.file;if(typeof path!=='string'||path.includes('..')||path.includes('\\')||/^[a-z]+:/i.test(path)||/[?#]/.test(path))throw new Error('The catalog asset path is invalid.');const asset={id:crypto.randomUUID(),name:record.name||path.split('/').pop(),source:'catalog',mime:'model/gltf-binary',size:0,url:'https://crateship-games-assets.pages.dev/'+path.replace(/^\//,'')};return importModel(await resolveAsset(asset),asset.name,'catalog');}),
  instantiateAsset:id=>exclusive('Asset instantiation',()=>instantiate(id)),play,stop,
  exportProject:()=>exclusive('Project export',exportProject),exportGame:()=>exclusive('Game export',async()=>{await settled();view.assertComplete();return exportGameZip(store.snapshot(),resolveAsset);}),
  exportAsset:id=>exclusive('Model export',async()=>{const asset=store.project.assets.find(item=>item.id===id);if(!asset)throw new Error('Choose a model from this project.');return exportOriginalModel(asset,resolveAsset);}),
  saveLocal:()=>exclusive('Local save',persistLocal),listLocal:local.listProjects,
  loadLocal:id=>exclusive('Local project load',async()=>{const data=await local.getProject(id);alive();if(!data)throw new Error('Local project was not found.');return loadPrepared(await prepareProjectLoad(data),{source:'local'});}),
  saveCloud:()=>exclusive('Cloud save',cloudSave),applyProposal(proposal){editable();return store.apply(proposal);},
  async dispose(){if(disposed)return;disposed=true;lock.close();lifetime.abort();cancelAnimationFrame(raf);observer.disconnect();touchControls?.dispose();touchControls=null;physics?.dispose();controls.dispose();transform.removeEventListener('dragging-changed',dragging);transform.removeEventListener('objectChange',objectChange);transform.removeEventListener('mouseUp',transformEnd);transform.dispose();selectionBox.geometry.dispose();selectionBox.material.dispose();grid.geometry.dispose();grid.material.dispose();canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerup',pointerUp);canvas.removeEventListener('pointercancel',cancelActiveTransform);canvas.removeEventListener('lostpointercapture',lostPointer);window.removeEventListener('blur',cancelActiveTransform);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('beforeunload',beforeUnload);assetBytes.clear();cacheBytes=0;await view.dispose();}
 };
 try{const projectId=new URL(location.href).searchParams.get('project');if(projectId)await cloudLoad(projectId,{preserve:false});else await makeNew('Untitled World',{preserve:false,initial:true});await settled();hasChanges=false;state();return api;}
 catch(error){await api.dispose();throw error;}
}
