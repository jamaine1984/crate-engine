import {HttpError,json,readJson,database,id,now,requireMutationOrigin} from './common.mjs';
import {requireRole,ROLES} from './identity.mjs';
const fail=(status,message)=>{throw new HttpError(status,message,'ADMINISTRATION_DENIED');};
export async function handleAdministration(request,env,path){
 const match=/^\/owner\/(players\/([^/]+)\/(roles|status)|games\/([^/]+)\/members|thresholds)$/.exec(path);
 if(!match||request.method!=='PUT')return null;
 requireMutationOrigin(request,env);const actor=await requireRole(request,env,['OWNER'],{mfa:true,recent:true}),db=database(env),body=await readJson(request,5000);
 const reason=String(body.reason||'').trim();if(reason.length<5||reason.length>500)fail(400,'Give a reason of 5–500 characters.');
 const audit=(action,target,details)=>db.prepare('INSERT INTO platform_audit VALUES(?,?,?,?,?,?,?)').bind(id(),actor.id,action,target,JSON.stringify({...details,reason}),'success',now());
 if(match[2]){
  const target=await db.prepare("SELECT id FROM platform_users WHERE id=? AND status!='deleted'").bind(match[2]).first();if(!target)fail(404,'Account not found.');
  if(target.id===actor.id)fail(409,'Owner access cannot be changed from its own session.');
  const existing=(await db.prepare('SELECT role FROM platform_user_roles WHERE user_id=?').bind(target.id).all()).results.map(r=>r.role);
  if(existing.includes('OWNER'))fail(409,'Changes to another owner require the separately reviewed owner recovery procedure.');
  const statements=[];
  if(match[3]==='roles'){
   if(!Array.isArray(body.roles)||!body.roles.length||body.roles.some(r=>!ROLES.includes(r))||body.roles.includes('OWNER'))fail(400,'Select supported roles. Owner access requires a separate setup procedure.');
   const roles=[...new Set(['PLAYER',...body.roles])];
   if((roles.includes('PARTNER_DEVELOPER')||existing.includes('PARTNER_DEVELOPER'))&&roles.some(r=>['MODERATOR','CONTENT_MANAGER','FINANCE_ADMIN','PLATFORM_ADMIN'].includes(r)))fail(409,'A partner account must stay limited to its developer workspace.');
   statements.push(db.prepare('UPDATE platform_users SET auth_version=auth_version+1,updated_at=? WHERE id=?').bind(now(),target.id),db.prepare('DELETE FROM platform_user_roles WHERE user_id=?').bind(target.id),...roles.map(role=>db.prepare('INSERT INTO platform_user_roles VALUES(?,?,?)').bind(target.id,role,now())),audit('account.roles',target.id,{before:existing,after:roles}));
  }else{if(!['active','suspended'].includes(body.status))fail(400,'Choose active or suspended.');statements.push(db.prepare('UPDATE platform_users SET status=?,updated_at=?,auth_version=auth_version+1 WHERE id=?').bind(body.status,now(),target.id),audit('account.status',target.id,{status:body.status}));}
  statements.push(db.prepare('UPDATE platform_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').bind(now(),target.id));await db.batch(statements);return json({saved:true,sessionsRevoked:true});
 }
 if(match[4]){
  const game=await db.prepare('SELECT id,developer_id FROM platform_games WHERE id=?').bind(match[4]).first();if(!game)fail(404,'Game not found.');
  const target=await db.prepare("SELECT u.id FROM platform_users u JOIN platform_user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND u.email_verified=1 AND r.role IN ('DEVELOPER','PARTNER_DEVELOPER')").bind(body.userId).first();if(!target)fail(400,'Choose a verified developer account.');
  if(!['edit','analytics','remove'].includes(body.permission))fail(400,'Choose edit, analytics or remove.');
  const change=body.permission==='remove'?db.prepare('DELETE FROM platform_game_members WHERE game_id=? AND user_id=?').bind(game.id,target.id):db.prepare('INSERT INTO platform_game_members VALUES(?,?,?,?) ON CONFLICT(game_id,user_id) DO UPDATE SET permission=excluded.permission').bind(game.id,target.id,body.permission,now());
  await db.batch([change,audit('game.member',game.id,{userId:target.id,permission:body.permission})]);return json({saved:true});
 }
 if(path==='/owner/thresholds'){
  if(!['storage_bytes','monthly_requests','monthly_bandwidth_bytes','daily_upload_bytes'].includes(body.key)||!Number.isSafeInteger(body.limitValue)||body.limitValue<1)fail(400,'Choose a supported threshold and positive integer limit.');
  await db.batch([db.prepare('INSERT INTO platform_usage_thresholds VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET limit_value=excluded.limit_value,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(body.key,body.limitValue,body.key.includes('bytes')?'bytes':'requests',actor.id,now()),audit('usage.threshold',body.key,{limitValue:body.limitValue})]);return json({saved:true});
 }
 return null;
}
