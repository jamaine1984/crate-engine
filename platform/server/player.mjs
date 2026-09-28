import {HttpError,json,readJson,id,now,database,requireMutationOrigin} from './common.mjs';
import {requireUser} from './identity.mjs';
import {LIMITS,rate} from './data.mjs';
const fail=(status,message,code='PLAYER_ERROR')=>{throw new HttpError(status,message,code);};
function contentOrigin(env,request){if(!env.GAME_CONTENT_ORIGIN)fail(503,'The isolated game player is not available yet.','ISOLATION_UNAVAILABLE');const origin=new URL(env.GAME_CONTENT_ORIGIN);if(origin.origin===new URL(request.url).origin||origin.protocol!=='https:')fail(503,'Game isolation requires a separate secure origin.','ISOLATION_INVALID');return origin.origin;}
export async function handlePlayer(request,env,path){
 if(!path.startsWith('/player/'))return null;
 const db=database(env);if(request.method!=='GET')requireMutationOrigin(request,env);
 if(path==='/player/sessions'&&request.method==='POST'){
  const b=await readJson(request,2000),game=await db.prepare("SELECT * FROM platform_games WHERE id=? AND status='published'").bind(b.gameId).first();if(!game)fail(404,'Game unavailable.');
  const version=await db.prepare("SELECT * FROM platform_game_versions WHERE id=? AND platform='web' AND scan_status='clean' AND status='published'").bind(game.active_version_id).first();if(!version)fail(409,'A reviewed browser build is required.');
  let user;try{user=await requireUser(request,env);}catch(e){if(e.status!==401)throw e;}
  if(game.price_minor>0){if(!user)fail(401,'Sign in to play a licensed game.');const license=await db.prepare("SELECT id FROM platform_licenses WHERE game_id=? AND user_id=? AND status='active'").bind(game.id,user.id).first();if(!license)fail(403,'A verified license is required.');}
  const origin=contentOrigin(env,request);const sessionId=id();if(user)await rate(env,user.id,'game-session',30,60);
  const stmts=[db.prepare('INSERT INTO platform_game_sessions(id,user_id,game_id,version_id,created_at,expires_at) VALUES(?,?,?,?,?,?)').bind(sessionId,user?.id||null,game.id,version.id,now(),now()+7200)];
  if(user)stmts.push(db.prepare('INSERT INTO platform_play_history VALUES(?,?,?,1) ON CONFLICT(user_id,game_id) DO UPDATE SET last_played_at=excluded.last_played_at,play_count=play_count+1').bind(user.id,game.id,now()));await db.batch(stmts);
  return json({session:{id:sessionId,gameId:game.id,expiresAt:now()+7200,contentUrl:`${origin}/games/${game.id}/${version.id}/index.html`,cloudSaveAvailable:Boolean(user)}},201);
 }
 const match=/^\/player\/sessions\/([^/]+)\/(progress|config|end)$/.exec(path);if(!match)return null;
 const u=await requireUser(request,env),session=await db.prepare('SELECT s.* FROM platform_game_sessions s JOIN platform_games g ON g.id=s.game_id WHERE s.id=? AND s.user_id=? AND s.expires_at>? AND s.ended_at IS NULL AND g.status=?').bind(match[1],u.id,now(),'published').first();if(!session)fail(403,'This game session has expired.','SESSION_EXPIRED');
 if(match[2]==='config'&&request.method==='GET')return json({gameId:session.game_id,rewardsEnabled:false,adsEnabled:false,language:'en'});
 if(match[2]==='progress'){
  if(request.method==='GET'){const p=await db.prepare('SELECT data_json,revision FROM platform_progress WHERE user_id=? AND game_id=?').bind(u.id,session.game_id).first();return json({progress:p?JSON.parse(p.data_json):null,revision:p?.revision||0});}
  if(request.method==='PUT'){await rate(env,u.id,'save-progress',60,60);const b=await readJson(request,LIMITS.progressBytes);if(!Number.isSafeInteger(b.revision)||b.revision<0)fail(400,'A progress revision is required.');let result;if(b.revision===0)result=await db.prepare('INSERT OR IGNORE INTO platform_progress VALUES(?,?,?,1,?)').bind(u.id,session.game_id,JSON.stringify(b.progress),now()).run();else result=await db.prepare('UPDATE platform_progress SET data_json=?,revision=revision+1,updated_at=? WHERE user_id=? AND game_id=? AND revision=?').bind(JSON.stringify(b.progress),now(),u.id,session.game_id,b.revision).run();if(!result.meta.changes)fail(409,'Progress was updated in another session. Reload before saving.','REVISION_CONFLICT');return json({saved:true,revision:b.revision+1});}
 }
 if(match[2]==='end'&&request.method==='POST'){await db.prepare('UPDATE platform_game_sessions SET ended_at=? WHERE id=? AND user_id=?').bind(now(),session.id,u.id).run();return json({ended:true});}return null;
}
