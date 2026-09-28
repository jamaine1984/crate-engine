// Pointer bookkeeping stays separate from rendering so mouse/touch cancellation
// and selection rules can be verified without a GPU context.
import {Matrix4,Vector3,Quaternion,Euler,MathUtils} from 'three';
export function createSelectionGesture({threshold=4}={}){
 let gesture=null;
 return {
  begin(event,{blocked=false}={}){if(gesture){gesture.blocked=true;return;}if(event.button!==0||event.isPrimary===false)return;gesture={id:event.pointerId,x:event.clientX,y:event.clientY,blocked};},
  move(event){if(gesture&&event.pointerId===gesture.id&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>threshold)gesture.blocked=true;},
  block(){if(gesture)gesture.blocked=true;},
  end(event){if(!gesture||event.pointerId!==gesture.id)return false;const current=gesture;gesture=null;return !current.blocked&&event.button===0&&Math.hypot(event.clientX-current.x,event.clientY-current.y)<=threshold;},
  cancel(){gesture=null;}
 };
}

export function preserveWorldTransform(object,parent){
 object.updateWorldMatrix(true,false);parent?.updateWorldMatrix(true,false);
 const local=object.matrixWorld.clone();if(parent)local.premultiply(parent.matrixWorld.clone().invert());
 const position=new Vector3(),rotation=new Quaternion(),scale=new Vector3();local.decompose(position,rotation,scale);
 const reconstructed=new Matrix4().compose(position,rotation,scale);
 if(local.elements.some((value,index)=>!Number.isFinite(value)||Math.abs(value-reconstructed.elements[index])>1e-5*Math.max(1,Math.abs(value)))||[scale.x,scale.y,scale.z].some(value=>value<.001||value>10000))throw new Error('This parent would require an unsupported sheared or mirrored transform. Use a parent with uniform positive scale.');
 const euler=new Euler().setFromQuaternion(rotation,'XYZ');
 return {position:position.toArray(),rotation:[euler.x,euler.y,euler.z].map(MathUtils.radToDeg),scale:scale.toArray()};
}

export function cancelTransformGesture(transform){
 if(!transform.dragging)return false;
 // reset() uses the public starting transform captured by TransformControls.
 // Do not call pointerUp(): a cancelled gesture must not create an undo record.
 transform.reset();transform.dragging=false;transform.axis=null;return true;
}
