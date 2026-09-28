import {sceneContext} from './scene-context.mjs';
import {readLimitedResponse} from '../player/export.mjs';
const BASE='http://127.0.0.1:9879';
/** This connector exposes one explicitly connected project, never browser storage or provider keys. */
export function createEditorMcpClient({getEditor,getState,onStatus=()=>{},onLog=()=>{},fetchFn=fetch,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,autoPoll=true}){
 let session=null,token='',timer=null,generation=0,polling=false;
 const seen=new Set(),previews=new Set();
 const status=()=>onStatus(session?{connected:true,projectId:session.projectId,allowWrites:session.allowWrites}:{connected:false,allowWrites:false});
 async function request(path,body,credential=token){
  let response;
  try{response=await fetchFn(BASE+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+credential,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});}
  catch(error){
   if(['AbortError','TimeoutError','TypeError'].includes(error?.name))throw new Error('This browser could not reach the local editor bridge at 127.0.0.1:9879. Check that the bridge is running and that this browser allows local network connections.');
   throw error;
  }
  if(!response.ok)throw new Error('The local editor bridge rejected the request. Check its token, origin, and session.');
  return JSON.parse(new TextDecoder().decode(await readLimitedResponse(response,512*1024,'Editor bridge response')));
 }
 function forget(){generation++;if(timer)clearTimer(timer);timer=null;session=null;token='';seen.clear();previews.clear();status();}
 async function disconnect(){const previous=session,key=token;forget();if(previous)try{await request(`/editor/sessions/${encodeURIComponent(previous.sessionId)}/disconnect`,{projectId:previous.projectId},key);}catch{} }
 function validateActive(current,epoch){if(!session||session!==current||generation!==epoch||getEditor().getProject().id!==current.projectId)throw new Error('The connected project changed. Reconnect MCP for this project.');}
 async function execute(command,current,epoch){
  validateActive(current,epoch);
  if(typeof command.id!=='string'||seen.has(command.id)||command.projectId!==current.projectId||!Number.isFinite(command.expiresAt)||command.expiresAt<=now())throw new Error('Expired or duplicate editor command.');
  seen.add(command.id);if(seen.size>1000)throw new Error('Reconnect the bridge to start a new command session.');
  const editor=getEditor(),args=command.arguments||{},state=getState();
  if(state.busy||state.mode!=='edit')throw new Error('Stop Play and finish the current operation first.');
  if(command.command==='get_scene')return sceneContext(editor.getProject(),args);
  if(command.command==='preview_world'){const result=await editor.previewWorld(args.recipe);validateActive(current,epoch);previews.add(result.previewId);return result;}
  if(!current.allowWrites)throw new Error('Scene changes are disabled for this connection.');
  if(command.command==='apply_world'){
   if(!previews.has(args.previewId))throw new Error('Preview this world in the connected session first.');
   previews.delete(args.previewId);validateActive(current,epoch);await editor.applyWorld({previewId:args.previewId});
  }else if(command.command==='undo'){validateActive(current,epoch);await editor.undo();previews.clear();}
  else throw new Error('Unsupported editor command.');
  const project=editor.getProject();onLog({level:'info',message:command.command==='undo'?'MCP undid the last scene change.':'MCP applied a procedural world. Use Undo to reverse it.'});
  return {ok:true,projectId:project.id,entityCount:project.entities.length};
 }
 function schedule(){if(autoPoll&&session)timer=setTimer(()=>{timer=null;void pollOnce();},750);}
 async function pollOnce(){
  if(!session||polling)return;polling=true;const current=session,epoch=generation;
  try{validateActive(current,epoch);const batch=await request(`/editor/sessions/${encodeURIComponent(current.sessionId)}/commands`);validateActive(current,epoch);
   if(batch.sessionId!==current.sessionId||batch.projectId!==current.projectId||!Array.isArray(batch.commands)||batch.commands.length>1)throw new Error('Invalid bridge command batch.');
   for(const command of batch.commands){let body;try{body={result:await execute(command,current,epoch)};}catch(error){onLog({level:'warn',message:error.message});body={error:{code:'EDITOR_REJECTED'}};}
    validateActive(current,epoch);await request(`/editor/sessions/${encodeURIComponent(current.sessionId)}/results`,{commandId:command.id,projectId:current.projectId,...body});
   }
  }catch(error){if(session===current){forget();onLog({level:'warn',message:'Editor MCP disconnected: '+error.message});}}
  finally{polling=false;schedule();}
 }
 return {get state(){return session?{connected:true,projectId:session.projectId,allowWrites:session.allowWrites}:{connected:false,allowWrites:false};},async connect(value,{allowWrites=false}={}){
   await disconnect();const credential=String(value).trim();if(!/^[a-zA-Z0-9_-]{32,256}$/.test(credential))throw new Error('Paste the editor token printed by your local bridge.');
   const projectId=getEditor().getProject().id,epoch=generation;const result=await request('/editor/connect',{projectId,allowWrites:allowWrites===true},credential);
   if(generation!==epoch||getEditor().getProject().id!==projectId)throw new Error('The project changed while connecting.');
   if(result.projectId!==projectId||typeof result.sessionId!=='string'||!result.sessionId||result.protocol!==1||result.allowWrites!==(allowWrites===true))throw new Error('Invalid editor bridge session.');
   token=credential;session={sessionId:result.sessionId,projectId,allowWrites:allowWrites===true};status();schedule();
  },disconnect,pollOnce,dispose:forget};
}
