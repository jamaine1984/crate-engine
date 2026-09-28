import {BufferGeometry,Float32BufferAttribute,ShapeUtils,Vector2,Group,Mesh,MeshBasicMaterial,Box3} from 'three';

/** Turn bounded, model-authored 2D polygon paths into a renderable colored mesh. */
export function createVectorGeometry(shape){
 const geometries=[];
 for(const path of shape.paths){
  const contour=path.points.map(point=>new Vector2(point[0],point[1])),triangles=ShapeUtils.triangulateShape(contour,[]),positions=[],indices=[];
  for(const point of path.points)positions.push(point[0],point[1],0);
  for(const triangle of triangles)indices.push(...triangle);
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();geometries.push({geometry,color:path.color,depth:path.depth||0});
 }
 return geometries;
}

/** Build explicit, depth-ordered flat-color polygon parts for predictable 2D artwork. */
export function createVectorObject(THREE,shape){
 const root=new Group();root.userData.vectorShape=true;
 const layers=createVectorGeometry(shape).sort((a,b)=>a.depth-b.depth);
 for(const {geometry,color,depth} of layers){
  const material=new MeshBasicMaterial({color,side:THREE.DoubleSide,toneMapped:false});
  const mesh=new Mesh(geometry,material);mesh.position.z=depth;mesh.userData.vectorShapeLayer=true;root.add(mesh);
 }
 root.traverse(node=>{if(node.isMesh){node.castShadow=false;node.receiveShadow=false;}});
 root.updateMatrixWorld(true);const bounds=root.children.reduce((box,mesh)=>{mesh.geometry.computeBoundingBox();const part=mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix);return box.union(part);},new Box3());
 if(!bounds.isEmpty()){root.userData.colliderBounds=bounds;}
 return root;
}

export function disposeVectorObject(root){
 root.traverse(node=>{if(!node.isMesh)return;node.geometry.dispose();node.material.dispose();});
}
