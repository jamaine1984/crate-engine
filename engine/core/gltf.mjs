export const MAX_MODEL_BYTES=32*1024*1024;
// Conservative aggregate geometry budget, not a total browser/GPU memory promise.
export const MAX_DECODED_GEOMETRY_BYTES=128*1024*1024;
const MESHOPT=['EXT_meshopt_compression','KHR_meshopt_compression'];
const COMPONENT_BYTES={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const COMPONENT_COUNTS={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function geometryBounds(json,binaryBytes){
 const buffers=json.buffers||[],views=json.bufferViews||[],accessors=json.accessors||[];
 for(const key of ['extensionsUsed','extensionsRequired'])if(json[key]!==undefined&&(!Array.isArray(json[key])||json[key].some(v=>typeof v!=='string')))throw new Error('Invalid GLB extension list.');
 let allocated=0;const charge=n=>{if(!integer(n)||n>MAX_DECODED_GEOMETRY_BYTES-allocated)throw new Error('Model exceeds the 128 MiB decoded geometry limit.');allocated+=n;};
 const reference=(items,index,label)=>{if(!integer(index)||!record(items[index]))throw new Error('Invalid model '+label+' reference.');return items[index];};
 const range=(offset,length,total,label)=>{if(!integer(offset)||!integer(length,1)||offset>total||length>total-offset)throw new Error('Invalid model '+label+' range.');};
 const compression=v=>{const names=MESHOPT.filter(name=>v.extensions?.[name]!==undefined);if(names.length>1)throw new Error('Ambiguous meshopt compression.');return names.length?{name:names[0],value:v.extensions[names[0]]}:null;};
 const placeholders=new Set(),fallbacks=new Set();
 for(const [i,b]of buffers.entries()){
  if(!record(b)||!integer(b.byteLength,1))throw new Error('Invalid GLB buffer length.');
  if(b.byteLength>MAX_DECODED_GEOMETRY_BYTES)throw new Error('Model exceeds the decoded geometry buffer limit.');
  for(const name of MESHOPT)if(b.extensions?.[name]!==undefined){if(!record(b.extensions[name])||b.extensions[name].fallback!==true)throw new Error('Invalid meshopt fallback buffer.');fallbacks.add(i);}
  if(b.uri===undefined){
   if(i===0){if(b.byteLength>binaryBytes)throw new Error('Incomplete GLB buffer data.');charge(b.byteLength);}
   else {placeholders.add(i);fallbacks.add(i);}
  }else{
   if(typeof b.uri!=='string'||!/^data:application\/(octet-stream|gltf-buffer);base64,[A-Za-z0-9+/]*={0,2}$/.test(b.uri))throw new Error('Embed all model buffers in the GLB.');
   const encoded=b.uri.slice(b.uri.indexOf(',')+1),padding=encoded.endsWith('==')?2:encoded.endsWith('=')?1:0;
   if(encoded.length%4||encoded.length/4*3-padding<b.byteLength)throw new Error('Incomplete GLB embedded buffer data.');
   charge(encoded.length/4*3-padding);
  }
 }
 const placeholderReferences=new Set();
 for(const v of views){
  if(!record(v))throw new Error('Invalid model buffer view.');
  const b=reference(buffers,v.buffer,'buffer');range(v.byteOffset??0,v.byteLength,b.byteLength,'buffer view');charge(v.byteLength);
  if(v.byteStride!==undefined&&(!integer(v.byteStride,4,252)||v.byteStride%4))throw new Error('Invalid model buffer view stride.');
  const c=compression(v);
  if(fallbacks.has(v.buffer)&&!c)throw new Error('Meshopt fallback buffer has an uncompressed reference.');
  if(!c)continue;
  const e=c.value,filter=e?.filter??'NONE';
  if(!record(e)||!json.extensionsUsed?.includes(c.name)||!integer(e.count,1)||!integer(e.byteStride,1,256)||
    !['ATTRIBUTES','TRIANGLES','INDICES'].includes(e.mode)||!['NONE','OCTAHEDRAL','QUATERNION','EXPONENTIAL'].includes(filter))throw new Error('Invalid meshopt compression descriptor.');
  const decoded=e.count*e.byteStride;
  if(!integer(decoded,1,MAX_DECODED_GEOMETRY_BYTES)||decoded!==v.byteLength)throw new Error('Invalid meshopt decoded geometry length.');
  if(v.byteStride!==undefined&&v.byteStride!==e.byteStride)throw new Error('Meshopt stride does not match the buffer view.');
  if((e.mode==='ATTRIBUTES'&&e.byteStride%4)||(e.mode!=='ATTRIBUTES'&&(![2,4].includes(e.byteStride)||filter!=='NONE'))||
    (e.mode==='TRIANGLES'&&e.count%3)||(filter==='OCTAHEDRAL'&&![4,8].includes(e.byteStride))||
    (filter==='QUATERNION'&&e.byteStride!==8)||(filter==='EXPONENTIAL'&&e.byteStride%4))throw new Error('Invalid meshopt mode, filter or stride.');
  const source=reference(buffers,e.buffer,'meshopt buffer');
  if(fallbacks.has(e.buffer))throw new Error('Meshopt compressed data cannot use a fallback buffer.');
  range(e.byteOffset??0,e.byteLength,source.byteLength,'meshopt compressed data');
  if(placeholders.has(v.buffer)){if(!json.extensionsRequired?.includes(c.name))throw new Error('Missing required meshopt extension for a fallback buffer.');placeholderReferences.add(v.buffer);}
 }
 for(const index of placeholders)if(!placeholderReferences.has(index))throw new Error('Unused or incomplete GLB fallback buffer.');
 const accessorRange=(index,offset,count,itemBytes,componentBytes,label,sparse=false)=>{
  const v=reference(views,index,label),stride=sparse?itemBytes:(v.byteStride??itemBytes);
  if(!integer(offset)||offset%componentBytes||((v.byteOffset??0)+offset)%componentBytes||stride<itemBytes||stride%componentBytes||
    (sparse&&v.byteStride!==undefined))throw new Error('Invalid model '+label+' alignment or stride.');
  range(offset,(count-1)*stride+itemBytes,v.byteLength,label);
  // GLTFLoader creates the complete final interleaved element, even if its last
  // attribute ends earlier. Reject a descriptor that would overrun that view.
  if(!sparse&&v.byteStride!==undefined&&Math.floor(offset/stride)*stride+count*stride>v.byteLength)throw new Error('Incomplete interleaved accessor data.');
  return stride;
 };
 for(const a of accessors){
  const componentBytes=COMPONENT_BYTES[a?.componentType],components=COMPONENT_COUNTS[a?.type];
  if(!record(a)||!componentBytes||!components||!integer(a.count,1))throw new Error('Invalid model accessor type or count.');
  const matrixSide=a.type.startsWith('MAT')?Number(a.type.slice(3)):0;
  const itemBytes=matrixSide?Math.ceil(matrixSide*componentBytes/4)*4*matrixSide:components*componentBytes;
  const offset=a.byteOffset??0;
  if(!integer(offset)||offset%componentBytes||(a.bufferView===undefined&&offset!==0))throw new Error('Invalid model accessor offset.');
  const stride=a.bufferView===undefined?itemBytes:accessorRange(a.bufferView,offset,a.count,itemBytes,componentBytes,'accessor');
  charge(a.count*stride);
  if(a.sparse!==undefined){
   const s=a.sparse,indices=s?.indices,values=s?.values,indexBytes=COMPONENT_BYTES[indices?.componentType];
   if(!record(s)||!integer(s.count,1,a.count)||!record(indices)||!record(values)||![5121,5123,5125].includes(indices.componentType))throw new Error('Invalid model sparse accessor.');
   if(components>4|| (a.bufferView!==undefined&&stride!==itemBytes))throw new Error('Sparse matrix/interleaved accessors are unsupported by this engine.');
   accessorRange(indices.bufferView,indices.byteOffset??0,s.count,indexBytes,indexBytes,'sparse indices',true);
   accessorRange(values.bufferView,values.byteOffset??0,s.count,itemBytes,componentBytes,'sparse values',true);
   if(a.bufferView!==undefined)charge(a.count*itemBytes); // Loader copies a populated base before sparse patching.
  }
 }
 return allocated;
}
export function inspectGLB(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);if(bytes.length<20||bytes.length>MAX_MODEL_BYTES)throw new Error('GLB files must be smaller than 32 MB.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.length)throw new Error('Choose a valid GLB 2.0 file exported from Blender or another 3D tool.');
 let offset=12,json=null,index=0,binaryBytes=0;while(offset<bytes.length){if(offset+8>bytes.length)throw new Error('Invalid GLB chunk.');const length=view.getUint32(offset,true),type=view.getUint32(offset+4,true);offset+=8;if(length%4||offset+length>bytes.length)throw new Error('Invalid GLB chunk length.');if(index===0&&type!==0x4e4f534a)throw new Error('GLB must begin with JSON.');if(type===0x4e4f534a){if(index!==0)throw new Error('Duplicate GLB JSON chunk.');json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(offset,offset+length)).trim());}else if(type===0x004e4942){if(index!==1)throw new Error('Invalid GLB binary chunk order.');binaryBytes=length;}else throw new Error('Unsupported GLB chunk.');offset+=length;index++;}
 if(!json||Array.isArray(json)||json.asset?.version!=='2.0')throw new Error('Unsupported GLB document.');
 for(const key of ['scenes','nodes','meshes','buffers','bufferViews','accessors','images','textures','materials'])if(json[key]!==undefined&&!Array.isArray(json[key]))throw new Error('Invalid GLB '+key+'.');
 const decodedGeometryBytes=geometryBounds(json,binaryBytes);
 for(const r of json.images||[]){if(!r||typeof r!=='object')throw new Error('Invalid GLB image.');if(r.uri!==undefined){if(typeof r.uri!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]*={0,2}$/.test(r.uri))throw new Error('Embed PNG, JPEG or WebP textures in the GLB.');}else if(!Number.isSafeInteger(r.bufferView)||r.bufferView<0||r.bufferView>=(json.bufferViews?.length||0)||!['image/png','image/jpeg','image/webp'].includes(r.mimeType))throw new Error('Invalid embedded image.');}
 if((json.nodes?.length||0)>10000||(json.meshes?.length||0)>5000)throw new Error('This model exceeds the scene complexity limit.');
 return {document:json,bytes,decodedGeometryBytes};
}
export async function hashBytes(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
