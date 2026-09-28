import http from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { LIMITS, keys, identifier, uuid, validArguments, validResult } from './contracts.mjs';

const same=(a,b)=>typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const failure=(status,code)=>Object.assign(new Error(code),{status,code});
function appOrigin(value){const url=new URL(value);if(url.origin!==value||url.username||url.password||!['https:','http:'].includes(url.protocol)||(url.protocol==='http:'&&!['127.0.0.1','localhost'].includes(url.hostname)))throw new Error('Use an exact HTTPS or loopback app origin.');return value;}
async function readJson(req){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||'')||req.headers['content-encoding'])throw failure(415,'JSON_REQUIRED');
 const declared=req.headers['content-length'];if(declared&&(!/^\d+$/.test(declared)||Number(declared)>LIMITS.maxBodyBytes))throw failure(413,'BODY_TOO_LARGE');
 let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>LIMITS.maxBodyBytes)throw failure(413,'BODY_TOO_LARGE');chunks.push(chunk);}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,bytes)));}catch{throw failure(400,'INVALID_JSON');}
}

/** Private browser transport behind stdio MCP; this is not an MCP HTTP endpoint. */
export function createEditorBridge({origin='http://127.0.0.1:4173',port=9879,commandTimeoutMs=LIMITS.commandTimeoutMs,sessionIdleMs=LIMITS.sessionIdleMs}={}){
 appOrigin(origin);if(!Number.isInteger(port)||port<0||port>65535||!Number.isInteger(commandTimeoutMs)||commandTimeoutMs<10||commandTimeoutMs>30000||!Number.isInteger(sessionIdleMs)||sessionIdleMs<10||sessionIdleMs>90000)throw new Error('Invalid bridge configuration.');
 const token=randomBytes(32).toString('base64url'),editorToken=randomBytes(32).toString('base64url'),commands=new Map(),previews=new Map();let session=null,activeBodies=0,resultBytes=0;
 const terminal=new Set(['completed','rejected','cancelled','expired','result_expired']);
 const finish=(record,status,error)=>{record.status=status;record.arguments=null;if(record.result){resultBytes-=record.resultBytes;delete record.result;record.resultBytes=0;}if(error)record.error={code:error};};
 const revoke=code=>{for(const record of commands.values())if(!terminal.has(record.status))finish(record,'cancelled',code);previews.clear();session=null;};
 const cleanup=()=>{const time=Date.now();if(session&&session.expiresAt<=time)revoke('EDITOR_SESSION_EXPIRED');for(const record of commands.values())if(!terminal.has(record.status)&&record.expiresAt<=time)finish(record,'expired',record.status==='delivered'?'COMMAND_OUTCOME_UNKNOWN':'COMMAND_EXPIRED');for(const[id,p]of previews)if(p.expiresAt<=time)previews.delete(id);};
 const publicSession=()=>session?{sessionId:session.id,projectId:session.projectId,allowWrites:session.allowWrites,expiresAt:session.expiresAt}:null;
 const touch=()=>{session.expiresAt=Date.now()+sessionIdleMs;};
 const requireSession=(sessionId,projectId)=>{if(!session||session.id!==sessionId||(projectId!==undefined&&session.projectId!==projectId))throw failure(409,'EDITOR_SESSION_MISMATCH');return session;};
 const server=http.createServer(async(req,res)=>{
  const send=(status,body)=>{if(res.destroyed)return;res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(body===undefined?undefined:JSON.stringify(body));};
  try{
   cleanup();
   if(req.headers.host!==`127.0.0.1:${server.address()?.port}`||!/^\/(?:status|editor\/connect|editor\/sessions\/[a-f0-9-]{36}\/(?:commands|results|permissions|disconnect)|commands(?:\/[a-f0-9-]{36}(?:\/cancel)?)?)$/.test(req.url||''))throw failure(403,'INVALID_LOCAL_ENDPOINT');
   const browserOrigin=req.headers.origin;if(browserOrigin!==undefined&&browserOrigin!==origin)throw failure(403,'ORIGIN_DENIED');
   if(browserOrigin===origin){res.setHeader('access-control-allow-origin',origin);res.setHeader('vary','Origin');}
   if(req.method==='OPTIONS'){
    const headers=String(req.headers['access-control-request-headers']||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
    if(browserOrigin!==origin||!['GET','POST'].includes(req.headers['access-control-request-method'])||headers.some(x=>!['authorization','content-type'].includes(x)))throw failure(403,'PREFLIGHT_DENIED');
    res.setHeader('access-control-allow-methods','GET, POST');res.setHeader('access-control-allow-headers','Authorization, Content-Type');res.setHeader('access-control-allow-private-network','true');return send(204);
   }
   const editor=same(req.headers.authorization,`Bearer ${editorToken}`),native=same(req.headers.authorization,`Bearer ${token}`);
   if(!editor&&!native)throw failure(401,'PAIRING_REQUIRED');
   if(req.url==='/status'&&req.method==='GET')return send(200,{ok:true,protocol:1,session:publicSession(),limits:LIMITS});
   if(req.url.startsWith('/editor/')&&(!editor||browserOrigin!==origin))throw failure(403,'EDITOR_CAPABILITY_REQUIRED');
   if(req.url.startsWith('/commands')&&(!native||browserOrigin!==undefined))throw failure(403,'MCP_CAPABILITY_REQUIRED');
   if(req.method==='GET'){
    const poll=/^\/editor\/sessions\/([a-f0-9-]{36})\/commands$/.exec(req.url);
    if(poll){requireSession(poll[1]);touch();const record=[...commands.values()].find(r=>r.sessionId===session.id&&r.status==='queued');
     if(record){if(record.mutating&&!session.allowWrites){finish(record,'cancelled','WRITES_NOT_ENABLED');return send(200,{...publicSession(),commands:[]});}record.status='delivered';const result={...publicSession(),commands:[{id:record.id,command:record.command,arguments:record.arguments,projectId:record.projectId,expiresAt:record.expiresAt}]};record.arguments=null;return send(200,result);}
     return send(200,{...publicSession(),commands:[]});
    }
    const lookup=/^\/commands\/([a-f0-9-]{36})$/.exec(req.url);if(lookup){const record=commands.get(lookup[1]);if(!record)throw failure(404,'COMMAND_NOT_FOUND');return send(200,{id:record.id,status:record.status,expiresAt:record.expiresAt,...(record.result?{result:record.result}:{}),...(record.error?{error:record.error}:{})});}
    throw failure(405,'METHOD_NOT_ALLOWED');
   }
   if(req.method!=='POST')throw failure(405,'METHOD_NOT_ALLOWED');
   if(activeBodies>=8)throw failure(429,'BRIDGE_BUSY');activeBodies++;let body;try{body=await readJson(req);}finally{activeBodies--;}
   if(req.url==='/editor/connect'){
    if(!keys(body,['projectId','allowWrites'])||!identifier(body.projectId)||typeof body.allowWrites!=='boolean')throw failure(400,'INVALID_SESSION');
    revoke('EDITOR_RECONNECTED');session={id:randomUUID(),projectId:body.projectId,allowWrites:body.allowWrites,expiresAt:Date.now()+sessionIdleMs};return send(201,{...publicSession(),protocol:1,limits:LIMITS});
   }
   const browser=/^\/editor\/sessions\/([a-f0-9-]{36})\/(results|permissions|disconnect)$/.exec(req.url);
   if(browser){requireSession(browser[1],body?.projectId);if(body?.projectId!==session.projectId)throw failure(409,'EDITOR_PROJECT_MISMATCH');touch();
    if(browser[2]==='disconnect'){if(!keys(body,['projectId']))throw failure(400,'INVALID_REQUEST');revoke('EDITOR_DISCONNECTED');return send(200,{ok:true});}
    if(browser[2]==='permissions'){
     if(!keys(body,['projectId','allowWrites'])||typeof body.allowWrites!=='boolean')throw failure(400,'INVALID_PERMISSION');session.allowWrites=body.allowWrites;
     if(!session.allowWrites)for(const record of commands.values())if(record.mutating&&!terminal.has(record.status))finish(record,'cancelled',record.status==='delivered'?'COMMAND_OUTCOME_UNKNOWN':'WRITES_NOT_ENABLED');
     return send(200,{...publicSession()});
    }
    if(!keys(body,['commandId','projectId','result','error'])||!uuid(body.commandId)||('result'in body)===('error'in body))throw failure(400,'INVALID_RESULT');
    const record=commands.get(body.commandId);if(!record||record.sessionId!==session.id||record.projectId!==session.projectId||record.status!=='delivered')throw failure(409,'COMMAND_NOT_PENDING');
    if(record.mutating&&!session.allowWrites)throw failure(403,'WRITES_NOT_ENABLED');
    if(body.error!==undefined){finish(record,'rejected','EDITOR_REJECTED');return send(200,{ok:true});}
    if(!validResult(record.command,body.result,record.projectId,record.validationArguments))throw failure(400,'INVALID_RESULT');
    const encoded=JSON.stringify(body.result);if(encoded.includes(token)||encoded.includes(editorToken))throw failure(400,'CREDENTIAL_IN_RESULT');
    if(record.command==='preview_world'){
     while(previews.size>=8)previews.delete(previews.keys().next().value);
     previews.set(body.result.previewId,{sessionId:session.id,projectId:session.projectId,expiresAt:Date.now()+300000});
    }
    finish(record,'completed');record.result=body.result;record.resultBytes=Buffer.byteLength(encoded);resultBytes+=record.resultBytes;
    for(const old of commands.values()){if(resultBytes<=4*1024*1024)break;if(old.result)finish(old,'result_expired','RESULT_EXPIRED');}
    return send(200,{ok:true});
   }
   const cancel=/^\/commands\/([a-f0-9-]{36})\/cancel$/.exec(req.url);
   if(cancel){if(!keys(body,[]))throw failure(400,'INVALID_REQUEST');let record=commands.get(cancel[1]);if(!record){if(commands.size>=LIMITS.maxHistory)throw failure(429,'RESTART_BRIDGE_REQUIRED');record={id:cancel[1],status:'cancelled',error:{code:'COMMAND_CANCELLED'},expiresAt:Date.now()};commands.set(record.id,record);}if(!terminal.has(record.status))finish(record,'cancelled',record.status==='delivered'?'COMMAND_OUTCOME_UNKNOWN':'COMMAND_CANCELLED');return send(200,{ok:true,status:record.status});}
   if(req.url!=='/commands')throw failure(405,'METHOD_NOT_ALLOWED');
   if(!keys(body,['requestId','sessionId','projectId','command','arguments'])||!uuid(body.requestId)||!uuid(body.sessionId)||!identifier(body.projectId)||!validArguments(body.command,body.arguments))throw failure(400,'INVALID_COMMAND');
   requireSession(body.sessionId,body.projectId);
   if(commands.has(body.requestId))throw failure(409,'DUPLICATE_COMMAND');
   if(commands.size>=LIMITS.maxHistory)throw failure(429,'RESTART_BRIDGE_REQUIRED');
   if([...commands.values()].filter(r=>!terminal.has(r.status)).length>=LIMITS.maxPending)throw failure(429,'COMMAND_QUEUE_FULL');
   const mutating=['apply_world','undo'].includes(body.command);if(mutating&&!session.allowWrites)throw failure(403,'WRITES_NOT_ENABLED');
   if(body.command==='apply_world'){const preview=previews.get(body.arguments.previewId);if(!preview||preview.sessionId!==session.id||preview.projectId!==session.projectId)throw failure(409,'PREVIEW_UNAVAILABLE');previews.delete(body.arguments.previewId);}
   const record={id:body.requestId,sessionId:session.id,projectId:session.projectId,command:body.command,arguments:body.arguments,validationArguments:body.command==='get_scene'?body.arguments:{},mutating,status:'queued',expiresAt:Date.now()+commandTimeoutMs};commands.set(record.id,record);
   return send(202,{id:record.id,status:record.status,expiresAt:record.expiresAt});
  }catch(error){return send(error.status||500,{error:{code:error.code||'BRIDGE_ERROR'}});}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=2000;server.maxHeadersCount=30;
 server.on('clientError',(_error,socket)=>{if(!socket.destroyed)socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');});
 const timer=setInterval(cleanup,Math.min(1000,commandTimeoutMs,sessionIdleMs));timer.unref();
 return {server,token,editorToken,origin,listen:()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.off('error',reject);resolve(server.address());});}),close:()=>new Promise(resolve=>{clearInterval(timer);revoke('BRIDGE_CLOSED');commands.clear();server.closeAllConnections();server.close(resolve);})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){if(args[i]==='--origin'&&args[i+1])options.origin=args[i+1];else if(args[i]==='--port'&&/^\d+$/.test(args[i+1]||''))options.port=Number(args[i+1]);else throw new Error();}
  const bridge=createEditorBridge(options),address=await bridge.listen();process.stdout.write(`Crate Ship editor bridge: http://127.0.0.1:${address.port}\nApp origin: ${bridge.origin}\nBrowser pairing token: ${bridge.editorToken}\nMCP token (CRATESHIP_EDITOR_TOKEN): ${bridge.token}\nKeep tokens separate. Writes require explicit approval in the paired editor. Closing this process invalidates both tokens.\n`);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await bridge.close();process.exit(0);});
 }catch{process.stderr.write('Could not start editor bridge. Check --origin and --port; the port may already be in use.\n');process.exitCode=1;}
}
