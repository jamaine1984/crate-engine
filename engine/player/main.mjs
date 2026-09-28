import {sideViewFollower} from '../runtime/side-follow.mjs';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {validateProject} from '../core/schema.mjs';
import {MAX_MODEL_BYTES,hashBytes} from '../core/gltf.mjs';
import {createSceneRuntime,THREE} from '../runtime/scene.mjs';
import {createPhysics} from '../runtime/physics.mjs';
import {mountTouchControls} from '../runtime/touch-controls.mjs';
import {mountGameHud} from '../runtime/game-hud.mjs';
// Keep the player bundle independent of the editor/exporter and its ZIP writer.
async function readBytes(response,limit){
 if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw new Error('A game file exceeds its size limit.');}
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new Error('A game file exceeds its size limit.');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
const instances=new WeakMap(),pending=new WeakMap();
export function start(canvas,score){
 if(instances.has(canvas))return Promise.resolve(instances.get(canvas));
 if(pending.has(canvas))return pending.get(canvas);
 const run=initialize(canvas,score).finally(()=>pending.delete(canvas));pending.set(canvas,run);return run;
}
async function initialize(canvas,score){
 const lifetime=new AbortController();let view,controls,physics,touchControls,hud,resize,raf=0,disposed=false,restarting=false;
 const dispose=async()=>{if(disposed)return;disposed=true;lifetime.abort();cancelAnimationFrame(raf);resize?.disconnect();hud?.dispose();touchControls?.dispose();physics?.dispose();controls?.dispose();window.removeEventListener('pagehide',pageHide);instances.delete(canvas);await view?.dispose();};
 const pageHide=event=>{if(!event.persisted)dispose();};window.addEventListener('pagehide',pageHide);
 const request=async(path,limit)=>{const response=await fetch(path,{signal:AbortSignal.any([lifetime.signal,AbortSignal.timeout(30000)]),credentials:'omit',redirect:'error'});if(!response.ok)throw new Error('Missing game file: '+path);return readBytes(response,limit);};
 try{
  const project=validateProject(JSON.parse(new TextDecoder().decode(await request('project.json',16*1024*1024))));
  view=createSceneRuntime({canvas,resolveAsset:async asset=>{const bytes=await request('assets/'+encodeURIComponent(asset.id)+'.glb',MAX_MODEL_BYTES);if(asset.sha256&&await hashBytes(bytes)!==asset.sha256)throw new Error('Game model checksum does not match: '+asset.name);return bytes;}});
  await view.sync(project);view.assertComplete();view.resize();if(disposed)throw new Error('Game startup was cancelled.');
  const camera=view.gameCamera(),cameraPosition=new THREE.Vector3(),cameraRotation=new THREE.Quaternion(),playerPosition=new THREE.Vector3();
  // Side-view games keep the authored camera framing and follow the player (see side-follow.mjs), matching the editor preview.
  let follow=null;const follower=sideViewFollower();
  const followCamera=(dt=0)=>{if(!camera)return;camera.updateWorldMatrix(true,false);view.camera.position.copy(camera.getWorldPosition(cameraPosition));view.camera.quaternion.copy(camera.getWorldQuaternion(cameraRotation));if(follow){follow.updateWorldMatrix(true,false);follower.apply(follow.getWorldPosition(playerPosition),view.camera.position,dt);}};
  const startFollow=()=>{follow=null;follower.stop();if(!camera||!physics)return;followCamera();const entity=project.entities.find(item=>item.components.player?.sideView&&physics.bodies.has(item.id)),object=entity&&view.objects.get(entity.id);if(!object)return;object.updateWorldMatrix(true,false);follower.start(object.getWorldPosition(playerPosition),view.camera.position,camera.fov);follow=object;};
  if(camera){view.camera.fov=camera.fov;view.camera.near=camera.near;view.camera.far=camera.far;view.camera.updateProjectionMatrix();followCamera();}
  else{controls=new OrbitControls(view.camera,canvas);controls.target.set(0,1,0);}
  // A round owns physics, touch controls and the HUD; Play again rebuilds all three from the untouched project.
  async function beginRound(){
   if(score)score.textContent='Score: 0';
   hud=mountGameHud(canvas.parentElement,{maxLives:project.settings.lives||0,onRestart:()=>{void restart();}});
   physics=await createPhysics(project,view.objects,{onScore:value=>{if(score)score.textContent='Score: '+value;},onEvent:event=>hud?.handle(event)});
   if(disposed){physics.dispose();throw new Error('Game startup was cancelled.');}
   touchControls=mountTouchControls(canvas.parentElement,{onInput:value=>physics.setInput(value),enabled:project.entities.some(entity=>entity.components.player&&physics.bodies.has(entity.id)),sideView:project.entities.some(entity=>entity.components.player?.sideView===true)});
   startFollow();canvas.focus();
  }
  async function restart(){
   if(restarting||disposed)return;restarting=true;
   try{const previous=physics;physics=null;hud?.dispose();hud=null;touchControls?.dispose();touchControls=null;previous?.dispose();view.resetAnimations();await view.sync(project);followCamera();await beginRound();}
   finally{restarting=false;}
  }
  await beginRound();
  resize=new ResizeObserver(()=>view.resize());resize.observe(canvas);let last=performance.now();
  const loop=time=>{if(disposed)return;raf=requestAnimationFrame(loop);const dt=Math.min((time-last)/1000,.05);last=time;if(document.hidden)return;physics?.step(dt);view.tick(dt);controls?.update();followCamera(dt);view.render();};raf=requestAnimationFrame(loop);
  const instance={dispose};instances.set(canvas,instance);return instance;
 }catch(error){await dispose();throw error;}
}
