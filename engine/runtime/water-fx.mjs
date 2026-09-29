/* Screen-space water effects: before the main frame, render the scene once without water into a
   colour + depth target (refraction and water depth) and once from a mirrored camera (planar
   reflection, clipped at the water surface with an oblique near plane, as in three's Reflector).
   Water materials read these targets, so shallow water shows the seabed, deep water absorbs
   light, foam hugs the shoreline and the pier, palms and sky really reflect.
   Quality low: off (water falls back to the simple shader). Shadow maps are rendered once per frame. */
import {isWaterObject} from './water.mjs';

export function createWaterFX(THREE,{renderer,scene}){
 const colorTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true});
 colorTarget.depthTexture=new THREE.DepthTexture(1,1,THREE.FloatType);
 const reflectTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true});
 const mirror=new THREE.PerspectiveCamera(),size=new THREE.Vector2();
 const normal=new THREE.Vector3(0,1,0),planePoint=new THREE.Vector3(),cameraPos=new THREE.Vector3(),view=new THREE.Vector3(),target=new THREE.Vector3(),lookAt=new THREE.Vector3();
 const rotation=new THREE.Matrix4(),plane=new THREE.Plane(),clip=new THREE.Vector4(),q=new THREE.Vector4(),textureMatrix=new THREE.Matrix4();
 let enabled=true,scale=.5,shadowAuto=null;
 const shared={uRefract:{value:colorTarget.texture},uDepth:{value:colorTarget.depthTexture},uReflect:{value:reflectTarget.texture},uTexMatrix:{value:textureMatrix},uRes:{value:new THREE.Vector2(1,1)},uNear:{value:.1},uFar:{value:1000},uFX:{value:0},uReflectOn:{value:0}};

 function setQuality(quality){enabled=quality!=='low';scale=quality==='high'?.6:.5;}
 function waters(){const list=[];scene.traverseVisible(object=>{if(isWaterObject(object))list.push(object);});return list;}
 function resize(){
  renderer.getDrawingBufferSize(size);shared.uRes.value.copy(size);
  const w=Math.max(1,Math.round(size.x*scale)),h=Math.max(1,Math.round(size.y*scale));
  if(colorTarget.width!==w||colorTarget.height!==h){colorTarget.setSize(w,h);reflectTarget.setSize(w,h);}
 }
 function mirrorCamera(camera,waterY){
  planePoint.set(0,waterY,0);cameraPos.setFromMatrixPosition(camera.matrixWorld);
  view.subVectors(planePoint,cameraPos);if(view.dot(normal)>0)return false;              // camera under water
  view.reflect(normal).negate().add(planePoint);
  rotation.extractRotation(camera.matrixWorld);lookAt.set(0,0,-1).applyMatrix4(rotation).add(cameraPos);
  target.subVectors(planePoint,lookAt).reflect(normal).negate().add(planePoint);
  mirror.position.copy(view);mirror.up.set(0,1,0).applyMatrix4(rotation).reflect(normal);mirror.lookAt(target);
  mirror.near=camera.near;mirror.far=camera.far;mirror.updateMatrixWorld();mirror.projectionMatrix.copy(camera.projectionMatrix);
  textureMatrix.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
  plane.setFromNormalAndCoplanarPoint(normal,planePoint.set(0,waterY-.35,0)).applyMatrix4(mirror.matrixWorldInverse);   // clip a little below the troughs
  clip.set(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
  const p=mirror.projectionMatrix.elements;
  q.set((Math.sign(clip.x)+p[8])/p[0],(Math.sign(clip.y)+p[9])/p[5],-1,(1+p[10])/p[14]);
  clip.multiplyScalar(2/clip.dot(q));p[2]=clip.x;p[6]=clip.y;p[10]=clip.z+1;p[14]=clip.w;
  mirror.projectionMatrixInverse.copy(mirror.projectionMatrix).invert();
  return true;
 }
 /** Call before the main render. Returns true when the water targets were refreshed. */
 function prepare(camera){
  shared.uFX.value=0;
  if(!enabled)return false;
  const list=waters();if(!list.length)return false;
  resize();shared.uNear.value=camera.near;shared.uFar.value=camera.far;
  const previous=renderer.getRenderTarget(),xr=renderer.xr.enabled;renderer.xr.enabled=false;
  for(const water of list)water.visible=false;
  try{
   renderer.setRenderTarget(colorTarget);renderer.clear();renderer.render(scene,camera);          // shadows update here
   shadowAuto=renderer.shadowMap.autoUpdate;renderer.shadowMap.autoUpdate=false;
   const waterY=list[0].getWorldPosition(planePoint).y;
   shared.uReflectOn.value=mirrorCamera(camera,waterY)?1:0;
   if(shared.uReflectOn.value){renderer.setRenderTarget(reflectTarget);renderer.clear();renderer.render(scene,mirror);}
  }finally{for(const water of list)water.visible=true;renderer.setRenderTarget(previous);renderer.xr.enabled=xr;}
  shared.uFX.value=1;
  return true;
 }
 /** Call after the main render. */
 function finish(){if(shadowAuto!==null){renderer.shadowMap.autoUpdate=shadowAuto;shadowAuto=null;}}
 function dispose(){colorTarget.depthTexture.dispose();colorTarget.dispose();reflectTarget.dispose();}
 return {uniforms:shared,prepare,finish,setQuality,dispose};
}
