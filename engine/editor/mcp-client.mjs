import {sceneContext,objectContext} from './scene-context.mjs';
import {readLimitedResponse} from '../player/export.mjs';
const BASE='http://127.0.0.1:9879';
/** Turns MCP partial patches into full-field proposal updates: material and light merge, a null component removes it. */
export function editObjectOperations(project,operations){
 const byId=new Map(project.entities.map(entity=>[entity.id,entity]));
 return operations.map(operation=>{
  const entity=byId.get(operation.id);if(!entity)throw new Error('Object '+operation.id+' is not in this project. Read the scene again.');
  if(operation.op==='remove')return {op:'remove',id:operation.id};
  const patch={...operation.patch};
  if(patch.shape&&entity.type!=='customMesh')throw new Error('Only customMesh objects have vector art (shape).');
  if(patch.material)patch.material={...entity.material,...patch.material};
  if(patch.light)patch.light={...entity.light,...patch.light};
  if(patch.components){const components={...entity.components};for(const [name,value]of Object.entries(patch.components)){if(value===null)delete components[name];else components[name]=value;}patch.components=components;}
  return {op:'update',id:operation.id,patch};
 });
}
/**
 * Runs one AI tool command against the open editor. Shared by the local desktop bridge and
 * the hosted AI app connection, so both behave identically. Previews are remembered per runner.
 */
export function createCommandRunner({getEditor,getState,onLog=()=>{},resolveLibraryModel=async()=>null}){
 const previews=new Set();
 async function run(command,args,{allowWrites}){
  const editor=getEditor(),state=getState();
  if(state.busy||state.mode!=='edit')throw new Error('Stop Play and finish the current operation first.');
  if(command==='get_scene')return sceneContext(editor.getProject(),args);
  if(command==='get_object')return objectContext(editor.getProject(),args.id);
  if(command==='preview_world'){const result=await editor.previewWorld(args.recipe);previews.add(result.previewId);return result;}
  if(!allowWrites)throw new Error('Scene changes are disabled for this connection.');
  let summary;
  if(command==='apply_world'){
   if(!previews.has(args.previewId))throw new Error('Preview this world in the connected session first.');
   previews.delete(args.previewId);await editor.applyWorld({previewId:args.previewId});onLog({level:'info',message:'AI applied a procedural world. Use Undo to reverse it.'});
  }else if(command==='undo'){await editor.undo();previews.clear();onLog({level:'info',message:'AI undid the last scene change.'});}
  else if(command==='edit_objects'){
   summary=args.summary||'AI object edits';
   editor.applyProposal({summary,operations:editObjectOperations(editor.getProject(),args.operations)});previews.clear();
   onLog({level:'info',message:'AI edited '+args.operations.length+' object(s). Use Undo to reverse it.'});
  }else if(command==='set_level_settings'){
   editor.updateSettings(structuredClone(args.settings));previews.clear();
   summary='Level settings: '+Object.keys(args.settings).join(', ');onLog({level:'info',message:'AI changed level settings. Use Undo to reverse it.'});
  }else if(command==='add_library_model'){
   const record=await resolveLibraryModel(args.path);if(!record)throw new Error('That model is not in the Starter Library.');
   const before=new Set(editor.getProject().entities.map(entity=>entity.id));
   await editor.addCatalogAsset(record);
   const added=editor.getProject().entities.find(entity=>!before.has(entity.id));if(!added)throw new Error('The model could not be added.');
   const patch={...(args.name?{name:args.name}:{}),...(args.position?{position:args.position}:{}),...(args.rotation?{rotation:args.rotation}:{}),...(args.scale?{scale:args.scale}:{})};
   if(Object.keys(patch).length)editor.applyProposal({summary:'Place '+(args.name||record.name),operations:[{op:'update',id:added.id,patch}]});
   previews.clear();summary=`Added ${args.name||record.name} as object ${added.id}`;onLog({level:'info',message:'AI added '+(args.name||record.name)+'. Use Undo to reverse it.'});
  }else throw new Error('Unsupported editor command.');
  const project=editor.getProject();
  return {ok:true,projectId:project.id,entityCount:project.entities.length,...(summary?{summary}:{})};
 }
 return {run,reset:()=>previews.clear()};
}
/** This connector exposes one explicitly connected project, never browser storage or provider keys. */
export function createEditorMcpClient({getEditor,getState,onStatus=()=>{},onLog=()=>{},fetchFn=fetch,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,autoPoll=true,resolveLibraryModel}){
 let session=null,token='',timer=null,generation=0,polling=false;
 const seen=new Set(),runner=createCommandRunner({getEditor,getState,onLog,resolveLibraryModel});
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
 function forget(){generation++;if(timer)clearTimer(timer);timer=null;session=null;token='';seen.clear();runner.reset();status();}
 async function disconnect(){const previous=session,key=token;forget();if(previous)try{await request(`/editor/sessions/${encodeURIComponent(previous.sessionId)}/disconnect`,{projectId:previous.projectId},key);}catch{} }
 function validateActive(current,epoch){if(!session||session!==current||generation!==epoch||getEditor().getProject().id!==current.projectId)throw new Error('The connected project changed. Reconnect MCP for this project.');}
 async function execute(command,current,epoch){
  validateActive(current,epoch);
  if(typeof command.id!=='string'||seen.has(command.id)||command.projectId!==current.projectId||!Number.isFinite(command.expiresAt)||command.expiresAt<=now())throw new Error('Expired or duplicate editor command.');
  seen.add(command.id);if(seen.size>1000)throw new Error('Reconnect the bridge to start a new command session.');
  const result=await runner.run(command.command,command.arguments||{},{allowWrites:current.allowWrites});
  validateActive(current,epoch);return result;
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
