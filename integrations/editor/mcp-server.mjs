import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { LIMITS, plain, keys, validArguments, toolDefinitions } from './contracts.mjs';

const delay=(ms,signal)=>new Promise((resolve,reject)=>{if(signal?.aborted)return reject(new Error('CANCELLED'));const done=()=>{signal?.removeEventListener('abort',abort);resolve();},timer=setTimeout(done,ms);const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new Error('CANCELLED'));};signal?.addEventListener('abort',abort,{once:true});});
/** Fixed native loopback transport: no caller-selected host, URL, path or provider key. */
function requestBridge(path,method,body,{token,port,signal}){
 return new Promise((resolve,reject)=>{
  const encoded=body===undefined?undefined:JSON.stringify(body);
  const req=http.request({hostname:'127.0.0.1',port,path,method,headers:{authorization:`Bearer ${token}`,...(encoded?{'content-type':'application/json','content-length':Buffer.byteLength(encoded)}:{})},signal,timeout:5000},res=>{
   let size=0;const chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>LIMITS.maxBodyBytes+16384){res.destroy();reject(new Error('BRIDGE_RESPONSE_LIMIT'));}else chunks.push(chunk);});
   res.on('error',()=>reject(new Error('BRIDGE_UNAVAILABLE')));res.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks));if(res.statusCode<200||res.statusCode>=300)throw new Error();resolve(value);}catch{reject(new Error('BRIDGE_REJECTED'));}});
  });req.on('timeout',()=>req.destroy());req.on('error',()=>reject(new Error(signal?.aborted?'CANCELLED':'BRIDGE_UNAVAILABLE')));req.end(encoded);
 });
}
export async function callEditor(command,args,{token,port=9879,signal,timeoutMs=35000}={}){
 if(!/^[A-Za-z0-9_-]{43}$/.test(token||'')||!Number.isInteger(port)||port<1024||port>65535||!validArguments(command,args))throw new Error('INVALID_EDITOR_CONFIGURATION');
 const connection={token,port,signal},id=randomUUID();let submitted=false;
 try{
  const status=await requestBridge('/status','GET',undefined,connection);if(!status.session)throw new Error('EDITOR_NOT_CONNECTED');
  if(signal?.aborted)throw new Error('CANCELLED');submitted=true;
  await requestBridge('/commands','POST',{requestId:id,sessionId:status.session.sessionId,projectId:status.session.projectId,command,arguments:args},connection);
  const deadline=Date.now()+Math.min(Math.max(timeoutMs,100),35000);
  while(Date.now()<deadline){if(signal?.aborted)throw new Error('CANCELLED');const state=await requestBridge('/commands/'+id,'GET',undefined,connection);
   if(state.status==='completed'&&plain(state.result))return state.result;
   if(!['queued','delivered'].includes(state.status))throw new Error(state.error?.code||'EDITOR_COMMAND_REJECTED');
   await delay(100,signal);
  }
  throw new Error('COMMAND_TIMEOUT');
 }catch(error){if(submitted)try{await requestBridge('/commands/'+id+'/cancel','POST',{}, {token,port});}catch{}throw error;}
}

/** MCP stdio pinned to 2025-06-18; the private polling HTTP API is not MCP HTTP. */
export function startMcp({input=process.stdin,output=process.stdout,env=process.env}={}){
 let initialized=false,ready=false,partial=Buffer.alloc(0),stopped=false,outputPaused=false;const seen=new Set(),active=new Map(),tasks=new Set();
 const emit=value=>{
  if(stopped)return;
  if((output.writableLength||0)>LIMITS.maxBodyBytes*4){stop();return;}
  if(!output.write(JSON.stringify(value)+'\n')&&!outputPaused){outputPaused=true;input.pause();output.once('drain',()=>{outputPaused=false;if(!stopped)input.resume();});}
 };
 const error=(id,code,message)=>emit({jsonrpc:'2.0',id:id??null,error:{code,message}});
 const result=(id,value)=>emit({jsonrpc:'2.0',id,result:value});
 async function dispatch(message){
  if(!plain(message)||message.jsonrpc!=='2.0'||typeof message.method!=='string'||('id'in message&&!(typeof message.id==='string'&&message.id.length<=80||Number.isSafeInteger(message.id))))return error(null,-32600,'Invalid request.');
  const hasId='id'in message,id=message.id,key=typeof id+':'+id;
  if(!hasId){
   if(message.method==='notifications/initialized'&&initialized)ready=true;
   if(message.method==='notifications/cancelled'&&plain(message.params)){const target=message.params.requestId;active.get(typeof target+':'+target)?.abort();}
   return;
  }
  if(seen.has(key))return error(id,-32600,'Repeated request ID.');if(seen.size>=10000)return error(id,-32000,'Restart this local MCP session.');seen.add(key);
  if(message.method==='initialize'){
   if(initialized||!plain(message.params)||typeof message.params.protocolVersion!=='string'||!plain(message.params.capabilities)||!plain(message.params.clientInfo))return error(id,-32602,'Invalid initialization.');
   initialized=true;return result(id,{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'crateship-local-editor',version:'1.0.0'}});
  }
  if(message.method==='ping')return result(id,{});
  if(!ready)return error(id,-32000,'Initialize this MCP session first.');
  if(message.method==='tools/list')return result(id,{tools:await toolDefinitions()});
  if(message.method!=='tools/call')return error(id,-32601,'Method not found.');
  if(!keys(message.params,['name','arguments','_meta'])||!validArguments(message.params.name,message.params.arguments??{}))return error(id,-32602,'Unsupported tool or arguments.');
  if(active.size>=LIMITS.maxPending)return error(id,-32000,'Local MCP command queue is full.');
  const controller=new AbortController();active.set(key,controller);
  try{const value=await callEditor(message.params.name,message.params.arguments??{},{token:env.CRATESHIP_EDITOR_TOKEN,port:Number(env.CRATESHIP_EDITOR_PORT||9879),signal:controller.signal});
   if(!controller.signal.aborted)return result(id,{content:[{type:'text',text:JSON.stringify(value)}]});
  }catch{if(!controller.signal.aborted)return result(id,{isError:true,content:[{type:'text',text:'The paired editor could not complete this command. Check pairing, active project, preview and write permission. A timeout or cancelled delivered edit may already have applied; inspect the scene before trying a new command.'}]});}
  finally{active.delete(key);}
 }
 function onData(chunk){
  if(stopped)return;const incoming=Buffer.from(chunk);if(incoming.length>LIMITS.maxBodyBytes*2||partial.length+incoming.length>LIMITS.maxBodyBytes*2){error(null,-32600,'MCP input limit exceeded.');stop();return;}
  partial=Buffer.concat([partial,incoming]);let index;
  while((index=partial.indexOf(10))>=0){const line=partial.subarray(0,index);partial=partial.subarray(index+1);if(line.length>LIMITS.maxBodyBytes){error(null,-32600,'MCP input limit exceeded.');continue;}
   let message;try{message=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(line));}catch{error(null,-32700,'Invalid JSON.');continue;}
   if(!('id' in Object(message))){void dispatch(message).catch(()=>{});continue;}
   if(tasks.size>=16){error(message.id,-32000,'Local MCP dispatch queue is full.');continue;}
   // Dispatch starts synchronously, so lifecycle and cancellation notifications
   // cannot wait behind a long-running tool call. Active calls remain bounded.
   const task=dispatch(message).catch(()=>error(message?.id,-32603,'Local MCP request failed.'));tasks.add(task);task.finally(()=>tasks.delete(task));
  }
  if(partial.length>LIMITS.maxBodyBytes){error(null,-32600,'MCP input limit exceeded.');stop();}
 }
 function stop(){if(stopped)return;stopped=true;input.off('data',onData);input.pause();for(const controller of active.values())controller.abort();partial=Buffer.alloc(0);}
 input.on('data',onData);input.once('end',stop);input.once('error',stop);
 return {stop,idle:()=>Promise.allSettled([...tasks])};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)startMcp();
