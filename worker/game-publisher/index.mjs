import {validateGameArchive} from '../../platform/server/archive.mjs';
import {readJson} from '../../platform/server/common.mjs';
/** Service-only bounded web promoter. Not a malware scanner; requires stored real scan attestation. */
export default {async fetch(request,env){
 const json=(data,status=200)=>Response.json(data,{status});
 if(request.method!=='POST'||new URL(request.url).pathname!=='/promote')return json({error:'Not found'},404);
 const secret=env.PUBLISHER_INTERNAL_SECRET;if(!secret||secret.length<32||request.headers.get('authorization')!=='Bearer '+secret)return json({error:'Unauthorized'},401);
 if(!env.PLATFORM_DB||!env.PLATFORM_UPLOADS||!env.PUBLISHED_GAMES)return json({error:'Unavailable'},503);
 let b;try{b=await readJson(request,2000);}catch(error){return json({error:'Invalid request'},error.status||400);}
 const v=await env.PLATFORM_DB.prepare("SELECT v.*,u.object_key FROM platform_game_versions v JOIN platform_uploads u ON u.id=v.upload_id JOIN platform_games g ON g.id=v.game_id WHERE v.id=? AND v.game_id=? AND v.checksum=? AND v.status='ready' AND v.scan_status='clean' AND u.status='ready' AND u.checksum=v.checksum AND g.status='approved' AND COALESCE(g.price_minor,0)=0 AND g.active_version_id=v.id AND v.platform='web'").bind(b.versionId,b.gameId,b.checksum).first();
 if(!v?.scan_reference)return json({error:'Build not approved'},409);
 // Larger games require the separately provisioned streaming container pipeline.
 const maximum=16*1024*1024;if(v.file_size>maximum)return json({error:'Streaming promoter required for this build size'},413);
 const object=await env.PLATFORM_UPLOADS.get(v.object_key);if(!object||object.size!==v.file_size||object.size>maximum)return json({error:'Archive mismatch'},409);
 let result;try{result=await validateGameArchive(new Uint8Array(await object.arrayBuffer()),{maxArchiveBytes:maximum,maxExtractedBytes:48*1024*1024,maxEntryBytes:16*1024*1024});}catch{return json({error:'Structural validation failed'},422);}
 if(result.sha256!==v.checksum||JSON.stringify(result.manifest)!==v.manifest_json)return json({error:'Scan manifest mismatch'},409);
 for(const file of result.manifest){const key=`games/${v.game_id}/${v.id}/${file.path}`;await env.PUBLISHED_GAMES.put(key,result.files.get(file.path),{customMetadata:{sha256:file.sha256,version:v.id}});}
 return json({status:'ready',gameId:v.game_id,versionId:v.id,checksum:result.sha256});
}};
