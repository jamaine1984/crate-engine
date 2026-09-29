import {SURFACES,SURFACE_MAPS} from '../core/material.mjs';

/** Does this material need MeshPhysicalMaterial (glass, clearcoat, cloth)? */
export function needsPhysical(material){return !!(material.transmission||material.clearcoat||material.sheen);}

/** Signature fields that force a rebuild when they change (surface UVs depend on scale). */
export function materialSignature(entity){const m=entity.material||{};return m.surface?[m,entity.scale]:m;}

/**
 * Rewrites a primitive's UVs so one texture tile covers `tile` metres in the object's own scaled space.
 * Each vertex is projected on the plane facing its normal's dominant axis (box projection), which keeps
 * floors, walls and scaled boxes from stretching.
 */
export function worldScaleUVs(geometry,scale,tile){
 const position=geometry.attributes.position,normal=geometry.attributes.normal,uv=geometry.attributes.uv;if(!position||!normal||!uv)return geometry;
 for(let i=0;i<position.count;i++){
  const x=position.getX(i)*scale[0],y=position.getY(i)*scale[1],z=position.getZ(i)*scale[2],nx=Math.abs(normal.getX(i)),ny=Math.abs(normal.getY(i)),nz=Math.abs(normal.getZ(i));
  if(ny>=nx&&ny>=nz)uv.setXY(i,x/tile,z/tile);else if(nx>=nz)uv.setXY(i,z/tile,y/tile);else uv.setXY(i,x/tile,y/tile);
 }
 uv.needsUpdate=true;return geometry;
}

/** Shared texture loader for the built-in surfaces. Textures are cached per surface and never disposed per object. */
export function createSurfaceLibrary(THREE,{base='/starter-library/surfaces/',onLoad=()=>{}}={}){
 const loader=new THREE.TextureLoader(),cache=new Map();
 function load(surface){
  let maps=cache.get(surface);if(maps)return maps;
  maps={};for(const name of SURFACE_MAPS){const texture=loader.load(`${base}${surface}/${name}.jpg`,onLoad);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=8;if(name==='color')texture.colorSpace=THREE.SRGBColorSpace;texture.userData.shared=true;maps[name]=texture;}
  cache.set(surface,maps);return maps;
 }
 function dispose(){for(const maps of cache.values())for(const texture of Object.values(maps))texture.dispose();cache.clear();}
 return {load,dispose,get loaded(){return [...cache.keys()];}};
}

/** Builds the three.js material for a primitive or customMesh entity. */
export function createEntityMaterial(THREE,material,surfaces){
 const physical=needsPhysical(material),Type=physical?THREE.MeshPhysicalMaterial:THREE.MeshStandardMaterial;
 const out=new Type({color:material.color,metalness:material.metalness,roughness:material.roughness});
 if(material.emissive){out.emissive.set(material.emissive);out.emissiveIntensity=material.emissiveIntensity??1;}
 if(material.opacity!==undefined&&material.opacity<1){out.transparent=true;out.opacity=material.opacity;out.depthWrite=material.opacity>.6;}
 if(physical){
  if(material.transmission){out.transmission=material.transmission;out.ior=material.ior??1.5;out.thickness=material.thickness??.5;}
  if(material.clearcoat){out.clearcoat=material.clearcoat;out.clearcoatRoughness=.08;}
  if(material.sheen){out.sheen=material.sheen;out.sheenColor.set(material.color);out.sheenRoughness=.6;}
 }
 if(material.surface&&surfaces&&SURFACES[material.surface]){
  const maps=surfaces.load(material.surface);out.map=maps.color;out.normalMap=maps.normal;out.aoMap=maps.arm;out.roughnessMap=maps.arm;out.metalnessMap=maps.arm;
  // ARM packs AO/roughness/metal; the material's own values scale the texture's.
  out.roughness=material.roughness>.001?Math.min(1,material.roughness/.65):1;out.metalness=material.metalness;
 }
 return out;
}

/** Tile size in metres for an entity's surface. */
export function surfaceTile(material){return material.textureScale??SURFACES[material.surface]?.tile??2;}
