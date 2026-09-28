import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
/** Local-only private storage. Keys are hashed, never interpreted as filesystem paths. */
export async function localR2(directory){
 const root=resolve(directory);await mkdir(root,{recursive:true});const file=key=>resolve(root,createHash('sha256').update(String(key)).digest('hex'));
 return {
  async put(key,data,options={}){const body=data instanceof Uint8Array?data:new Uint8Array(data instanceof ArrayBuffer?data:await new Response(data).arrayBuffer()),path=file(key),temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,body);await rename(temp,path);await writeFile(path+'.json',JSON.stringify({size:body.length,httpMetadata:options.httpMetadata||{},customMetadata:options.customMetadata||{}}));return {key,size:body.length};},
  async get(key){try{const bytes=await readFile(file(key)),meta=JSON.parse(await readFile(file(key)+'.json','utf8'));return {...meta,key,body:new Blob([bytes]).stream(),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),writeHttpMetadata(headers){if(meta.httpMetadata?.contentType)headers.set('content-type',meta.httpMetadata.contentType);}};}catch(error){if(error.code==='ENOENT')return null;throw error;}},
  async head(key){const object=await this.get(key);if(!object)return null;const {body,arrayBuffer,...meta}=object;return meta;},
  async delete(key){for(const suffix of ['', '.json'])try{await unlink(file(key)+suffix);}catch(error){if(error.code!=='ENOENT')throw error;}}
 };
}
