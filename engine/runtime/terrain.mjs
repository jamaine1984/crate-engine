import {sampleTerrain} from '../core/terrain.mjs';
import {SURFACES} from '../core/material.mjs';

export const isTerrainObject=object=>!!object?.userData?.terrain;

/*
 Splat shader: four photo surfaces (low / mid / high / steep) blended by world height and slope, each tiled in
 metres. Only colour maps are blended; the mid layer supplies the normal map. Everything else is three's standard
 PBR, so the sun, shadows, fog and tone mapping keep working.
*/
function splat(THREE,material,maps,terrain,baseY,tiles){
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{tLow:{value:maps.low.color},tMid:{value:maps.mid.color},tHigh:{value:maps.high.color},tSteep:{value:maps.steep.color},uTiles:{value:new THREE.Vector4(...tiles)},uLevels:{value:new THREE.Vector3(baseY+terrain.lowLevel,baseY+terrain.highLevel,0)}});
  shader.vertexShader='varying vec3 vTerrainPos;\nvarying float vTerrainUp;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTerrainPos=(modelMatrix*vec4(transformed,1.0)).xyz;\nvTerrainUp=normalize(mat3(modelMatrix)*objectNormal).y;');
  shader.fragmentShader='uniform sampler2D tLow;\nuniform sampler2D tMid;\nuniform sampler2D tHigh;\nuniform sampler2D tSteep;\nuniform vec4 uTiles;\nuniform vec3 uLevels;\nvarying vec3 vTerrainPos;\nvarying float vTerrainUp;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
vec2 tp=vTerrainPos.xz;
vec3 cLow=texture2D(tLow,tp/uTiles.x).rgb,cMid=texture2D(tMid,tp/uTiles.y).rgb,cHigh=texture2D(tHigh,tp/uTiles.z).rgb,cSteep=texture2D(tSteep,tp/uTiles.w).rgb;
float h=vTerrainPos.y;
vec3 ground=mix(cLow,cMid,smoothstep(uLevels.x-.35,uLevels.x+.35,h));
ground=mix(ground,cHigh,smoothstep(uLevels.y-1.0,uLevels.y+1.0,h));
ground=mix(ground,cSteep,1.0-smoothstep(.62,.8,vTerrainUp));
diffuseColor.rgb*=ground;`);
 };
 material.customProgramCacheKey=()=>'crate-terrain';
}

/** Builds the terrain mesh for a plane entity. The plane's X/Z scale is the size in metres. */
export function createTerrainMesh(THREE,entity,surfaces){
 const terrain=entity.components.terrain,[sx,sy,sz]=entity.scale,res=terrain.resolution,heights=sampleTerrain(terrain,sx,sz);
 const geometry=new THREE.PlaneGeometry(1,1,res,res);geometry.rotateX(-Math.PI/2);
 const position=geometry.attributes.position,n=res+1;
 // After rotateX(-90°) PlaneGeometry row 0 sits at z=-.5, matching sampleTerrain's row order.
 const uv=geometry.attributes.uv,tile=SURFACES[terrain.mid].tile;
 for(let i=0;i<position.count;i++){const col=i%n,row=Math.floor(i/n);position.setY(i,heights[row*n+col]/(sy||1));uv.setXY(i,position.getX(i)*sx/tile,position.getZ(i)*sz/tile);}
 geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const names={low:terrain.low,mid:terrain.mid,high:terrain.high,steep:terrain.steep},maps={};
 for(const [slot,name] of Object.entries(names))maps[slot]=surfaces.load(name);
 const material=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.95,metalness:0,normalMap:maps.mid.normal});
 material.normalScale.set(.7,.7);
 const tiles=Object.values(names).map(name=>SURFACES[name].tile);
 splat(THREE,material,maps,terrain,entity.position[1],tiles);
 const mesh=new THREE.Mesh(geometry,material);mesh.userData.terrain=true;mesh.userData.noInstancing=true;mesh.name=entity.name;
 return mesh;
}
