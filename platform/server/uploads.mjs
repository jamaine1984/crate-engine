import {HttpError,json,readJson,id,now,database,requireMutationOrigin,audit} from './common.mjs';
import {requireRole} from './identity.mjs';
import {LIMITS,ownGame,rate,demandFlag} from './data.mjs';
import {WEB_BUILD_LIMITS} from './game-scan.mjs';
const deny=(status,message,code='UPLOAD_INVALID')=>{throw new HttpError(status,message,code);};
const roles=['OWNER','DEVELOPER','PARTNER_DEVELOPER'];
const all=async q=>(await q.all()).results||[];
export async function handleUploads(request,env,path){
 if(!path.startsWith('/developer/uploads'))return null;
 if(request.method!=='GET')requireMutationOrigin(request,env);
 const u=await requireRole(request,env,roles),db=database(env);
 if(!u.emailVerified)deny(403,'Verify your email before uploading.');
 if(!env.PLATFORM_UPLOADS)deny(503,'Game uploads are not available yet.','STORAGE_UNAVAILABLE');
 await demandFlag(env,'PUBLIC_CREATOR_UPLOADS_ENABLED');
 if(path==='/developer/uploads'&&request.method==='POST'){
  await rate(env,u.id,'upload-start',10,3600);
  const b=await readJson(request,6000),g=await ownGame(env,u,b.gameId);
  if(!['web','windows','macos','linux'].includes(b.platform)||!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(b.version))deny(400,'Choose a platform and semantic version such as 1.0.0.');
  if(b.platform!=='web')deny(400,'Only browser games can be uploaded right now. Downloadable games are not open yet.');
  if(!Number.isSafeInteger(b.sizeBytes)||b.sizeBytes<22||b.sizeBytes>LIMITS.uploadBytes)deny(413,'The archive must fit the configured upload limit.');
  if(b.sizeBytes>WEB_BUILD_LIMITS.maxArchiveBytes)deny(413,'Browser game ZIPs must be 16 MB or smaller.');
  if(typeof b.fileName!=='string'||!b.fileName.toLowerCase().endsWith('.zip')||/[\/\\\x00-\x1f]/.test(b.fileName))deny(400,'Upload one ZIP package.');
  const uploadId=id(),versionId=id(),key=`quarantine/${u.id}/${g.id}/${uploadId}.zip`;
  const multipart=await env.PLATFORM_UPLOADS.createMultipartUpload(key,{httpMetadata:{contentType:'application/zip'},customMetadata:{owner:u.id,game:g.id,version:versionId}});
  try{await db.batch([db.prepare('INSERT INTO platform_game_versions(id,game_id,version,platform,upload_id,file_size,release_notes,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(versionId,g.id,b.version,b.platform,uploadId,b.sizeBytes,String(b.releaseNotes||'').slice(0,4000),u.id,now()),db.prepare('INSERT INTO platform_uploads(id,game_id,user_id,version_id,object_key,upload_id,file_name,size_bytes,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(uploadId,g.id,u.id,versionId,key,multipart.uploadId,b.fileName.slice(0,180),b.sizeBytes,'uploading',now(),now()+86400)]);}catch(e){await multipart.abort();throw e;}
  await audit(env,{actor:u.id,action:'upload.start',target:uploadId,detail:{gameId:g.id,sizeBytes:b.sizeBytes}});
  return json({upload:{id:uploadId,versionId,partBytes:LIMITS.partBytes,parts:Math.ceil(b.sizeBytes/LIMITS.partBytes),expiresAt:now()+86400}},201);
 }
 const match=/^\/developer\/uploads\/([^/]+)(?:\/(parts|complete|abort|process)(?:\/(\d+))?)?$/.exec(path);if(!match)return null;
 const upload=await db.prepare('SELECT * FROM platform_uploads WHERE id=? AND user_id=?').bind(match[1],u.id).first();if(!upload)deny(404,'Upload not found.');await ownGame(env,u,upload.game_id);
 const action=match[2];
 if(!action&&request.method==='GET')return json({upload:{id:upload.id,status:upload.status,versionId:upload.version_id,validation:upload.validation_json?JSON.parse(upload.validation_json):null}});
 if(action==='parts'&&request.method==='PUT'){
  if(upload.status!=='uploading'||upload.expires_at<now())deny(409,'This upload is closed or expired.');
  const number=Number(match[3]),count=Math.ceil(upload.size_bytes/LIMITS.partBytes);if(!Number.isInteger(number)||number<1||number>count)deny(400,'Invalid part number.');
  const expected=number===count?upload.size_bytes-LIMITS.partBytes*(count-1):LIMITS.partBytes;
  if(Number(request.headers.get('Content-Length'))!==expected)deny(400,'Upload part size does not match its reserved size.');
  const bytes=new Uint8Array(await request.arrayBuffer());if(bytes.length!==expected)deny(400,'Incomplete upload part.');
  const part=await env.PLATFORM_UPLOADS.resumeMultipartUpload(upload.object_key,upload.upload_id).uploadPart(number,bytes);
  await db.prepare('INSERT INTO platform_upload_parts VALUES(?,?,?,?) ON CONFLICT(upload_id,part_number) DO UPDATE SET etag=excluded.etag,size_bytes=excluded.size_bytes').bind(upload.id,number,part.etag,bytes.length).run();return json({partNumber:number,etag:part.etag});
 }
 if(action==='complete'&&request.method==='POST'){
  if(upload.status!=='uploading')return json({upload:{id:upload.id,status:upload.status,versionId:upload.version_id}});
  if(upload.expires_at<now())deny(409,'Upload expired.');
  const parts=await all(db.prepare('SELECT part_number,etag,size_bytes FROM platform_upload_parts WHERE upload_id=? ORDER BY part_number').bind(upload.id));
  if(parts.length!==Math.ceil(upload.size_bytes/LIMITS.partBytes)||parts.reduce((n,p)=>n+p.size_bytes,0)!==upload.size_bytes)deny(409,'All upload parts must finish before completion.');
  await env.PLATFORM_UPLOADS.resumeMultipartUpload(upload.object_key,upload.upload_id).complete(parts.map(p=>({partNumber:p.part_number,etag:p.etag})));
  await db.prepare("UPDATE platform_uploads SET status='quarantined' WHERE id=? AND status='uploading'").bind(upload.id).run();await audit(env,{actor:u.id,action:'upload.quarantine',target:upload.id});return json({upload:{id:upload.id,status:'quarantined',versionId:upload.version_id}},202);
 }
 if(action==='abort'&&request.method==='POST'){
  if(upload.status!=='uploading')deny(409,'Only an incomplete upload can be cancelled.');await env.PLATFORM_UPLOADS.resumeMultipartUpload(upload.object_key,upload.upload_id).abort();await db.prepare("UPDATE platform_uploads SET status='aborted' WHERE id=?").bind(upload.id).run();return json({aborted:true});
 }
 if(action==='process'&&request.method==='POST'){
  if(!['quarantined','scan_pending'].includes(upload.status))deny(409,'This upload is not awaiting processing.');
  if(!env.GAME_SCANNER)deny(503,'The build remains in quarantine until security processing is available.','SCANNER_UNAVAILABLE');
  await rate(env,u.id,'scan-request',5,3600);
  const response=await env.GAME_SCANNER.fetch(new Request('https://scanner.internal/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uploadId:upload.id,objectKey:upload.object_key,versionId:upload.version_id,limits:LIMITS})}));
  if(!response.ok)deny(503,'Security processing is unavailable. Your build remains private.','SCAN_FAILED');
  const scan=await response.json();
  // A trusted service binding is the ONLY authority for scan results. No public callback accepts client claims.
  if(scan.status!=='clean'||!/^[a-f0-9]{64}$/.test(scan.sha256||'')||scan.sizeBytes!==upload.size_bytes||!scan.reference||!Array.isArray(scan.manifest)||!scan.manifest.length){await db.batch([db.prepare("UPDATE platform_uploads SET status='validation_failed',validation_json=? WHERE id=?").bind(JSON.stringify({status:scan.status||'failed',errors:(scan.errors||[]).slice(0,20)}),upload.id),db.prepare("UPDATE platform_game_versions SET status='validation_failed',scan_status=? WHERE id=?").bind(scan.status==='infected'?'infected':'failed',upload.version_id)]);deny(422,'The build did not pass the security check: '+String((scan.errors||[])[0]||'unknown problem').slice(0,300),'VALIDATION_FAILED');}
  if(scan.manifest.some(f=>typeof f.path!=='string'||f.path.includes('..')||f.path.startsWith('/')||!Number.isSafeInteger(f.size)||f.size<0))deny(502,'Scanner returned an invalid manifest.');
  await db.batch([db.prepare("UPDATE platform_uploads SET status='ready',checksum=?,validation_json=? WHERE id=?").bind(scan.sha256,JSON.stringify({status:'clean',reference:scan.reference,warnings:Array.isArray(scan.warnings)?scan.warnings.slice(0,20).map(w=>String(w).slice(0,300)):[]}),upload.id),db.prepare("UPDATE platform_game_versions SET status='ready',scan_status='clean',checksum=?,manifest_json=?,scan_reference=? WHERE id=?").bind(scan.sha256,JSON.stringify(scan.manifest),scan.reference,upload.version_id)]);await audit(env,{actor:u.id,action:'upload.scan.complete',target:upload.id,detail:{reference:scan.reference,sha256:scan.sha256}});return json({upload:{id:upload.id,status:'ready',versionId:upload.version_id}});
 }
 return null;
}
