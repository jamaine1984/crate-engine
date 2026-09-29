import {createCommandRunner} from './mcp-client.mjs';
import {EDITOR_PROTOCOL} from '../../integrations/editor/contracts.mjs';
import {normalizeCatalog} from './catalog.mjs';
import {esc,icon} from './panels.mjs';

/** Starter Library records keyed by their catalog path ("human"). */
let libraryIndex=null;
export async function resolveLibraryModel(path,fetchFn=fetch){
 if(!libraryIndex){
  const response=await fetchFn('/starter-library/catalog.json',{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('The Starter Library is unavailable right now.');
  libraryIndex=new Map(normalizeCatalog(await response.json()).map(record=>[record.path.replace(/^models\//,'').replace(/\.glb$/i,'').toLowerCase(),record]));
 }
 return libraryIndex.get(String(path).toLowerCase())||null;
}

/**
 * Links this editor tab to the user's AI apps through the site (hosted MCP connector).
 * The tab polls for tool calls, runs them with the shared command runner and returns results.
 */
export function createAiAppsLink({getEditor,getState,onLog=()=>{},onChange=()=>{},fetchFn=fetch,setTimer=setTimeout,clearTimer=clearTimeout}){
 const runner=createCommandRunner({getEditor,getState,onLog,resolveLibraryModel:path=>resolveLibraryModel(path,fetchFn)});
 let link=null,timer=null,epoch=0,failures=0,sentProject='';
 const activity=[],state={active:false,allowWrites:false,message:'',warning:''};
 const changed=()=>onChange({...state,activity:[...activity]});
 async function call(path,method='GET',body){
  const response=await fetchFn('/api/platform'+path,{method,credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(data?.error?.message||'The request failed.');error.status=response.status;throw error;}
  return data;
 }
 const project=()=>{const p=getEditor().getProject();return {projectId:p.id,projectName:String(p.name||'Untitled project').slice(0,120)};};
 function stopLocal(message=''){epoch++;if(timer)clearTimer(timer);timer=null;link=null;runner.reset();state.active=false;state.allowWrites=false;state.message=message;state.warning='';changed();}
 function remember(entry){activity.unshift({at:Date.now(),...entry});activity.length=Math.min(activity.length,12);}
 // The server holds each /next request open for a few seconds (long poll), so the next one can start at once.
 function schedule(current,delay=30){if(link===current)timer=setTimer(()=>{timer=null;void poll(current);},delay);}
 async function poll(current){
  if(link!==current)return;const mine=epoch;
  try{
   const now=project(),key=now.projectId+'|'+now.projectName;
   if(key!==sentProject){await call('/ai/editor/link/'+current.id,'PUT',{...now,allowWrites:state.allowWrites,protocol:EDITOR_PROTOCOL});sentProject=key;}
   const batch=await call('/ai/editor/link/'+current.id+'/next?p='+EDITOR_PROTOCOL+'&wait=1');if(mine!==epoch)return;
   if(batch.latestProtocol>EDITOR_PROTOCOL&&!state.warning){state.warning='A newer version of the editor is available. Save, then refresh this tab so your AI gets the newest tools.';changed();}
   if(failures&&state.warning&&state.warning.startsWith('Having trouble')){state.warning='';changed();}failures=0;
   state.allowWrites=batch.allowWrites===true;
   for(const command of batch.commands||[]){
    let body;
    try{
     if(command.projectId!==getEditor().getProject().id)throw new Error('The editor switched projects. Ask the AI to read the scene again.');
     if(!Number.isFinite(command.expiresAt)||command.expiresAt<=Date.now())throw new Error('This request expired before it reached the editor.');
     body={result:await runner.run(command.command,command.arguments||{},{allowWrites:state.allowWrites})};
     remember({app:command.app,command:command.command,ok:true});
    }catch(error){body={error:{message:String(error.message||'The editor refused this request.').slice(0,280)}};remember({app:command.app,command:command.command,ok:false,message:body.error.message});onLog({level:'warn',message:'AI request refused: '+body.error.message});}
    if(mine!==epoch)return;
    await call('/ai/editor/link/'+current.id+'/results','POST',{commandId:command.id,...body});changed();
   }
  }catch(error){
   if(mine!==epoch)return;
   if(error.status===410){stopLocal('Another editor tab took over the AI connection.');return;}
   if(error.status===401){stopLocal('You were signed out. Sign in again to keep building with AI.');return;}
   if(error.status===503){stopLocal(error.message);return;}
   if(++failures>=3&&!state.warning){state.warning='Having trouble reaching Crate Ship Games. Retrying…';changed();}
   schedule(current,Math.min(5000,500*failures));return;
  }
  schedule(current);
 }
 return {
  get state(){return {...state,activity:[...activity]};},
  async start({allowWrites=false}={}){
   await this.stop();const mine=epoch,now=project();
   const result=await call('/ai/editor/link','POST',{...now,allowWrites:allowWrites===true,protocol:EDITOR_PROTOCOL});
   if(mine!==epoch)return;
   link={id:result.linkId};sentProject=now.projectId+'|'+now.projectName;failures=0;
   Object.assign(state,{active:true,allowWrites:result.allowWrites===true,message:'',warning:''});changed();schedule(link);
  },
  async setAllowWrites(value){
   if(!link)return;await call('/ai/editor/link/'+link.id,'PUT',{...project(),allowWrites:value===true,protocol:EDITOR_PROTOCOL});state.allowWrites=value===true;runner.reset();changed();
  },
  async stop(){const current=link;stopLocal();if(current)try{await call('/ai/editor/link/'+current.id,'DELETE');}catch{}},
  dispose(){stopLocal();},
 };
}

const COMMAND_LABELS={get_scene:'Read the scene',get_object:'Read an object',preview_world:'Planned a layout',apply_world:'Built a layout',edit_objects:'Edited objects',set_level_settings:'Changed level settings',add_library_model:'Added a model',import_model:'Imported a model file',place_on_ground:'Placed objects on the ground',check_scene:'Checked the scene',screenshot:'Took a screenshot',play_test:'Ran a play test',save_project:'Saved the project',undo:'Undid a change'};
export function aiAppsPanel(info,state){
 if(info?.signedOut)return `<p class="dialog-lead">Connect Claude, ChatGPT, Cursor or any AI app you already use, on its normal subscription or API key, and let it build in this editor.</p><div class="dialog-actions"><a class="primary-button" href="/login?next=%2Fplay">${icon('sign-in')} Sign in to connect AI apps</a></div>`;
 if(info?.error)return `<p class="dialog-error">${esc(info.error)}</p><button class="text-button" data-ai-action="refresh">Try again</button>`;
 if(!info)return '<p class="loading-copy">Loading…</p>';
 if(!info.enabled)return '<p class="inline-note">AI app connections are paused by the site owner right now. Please try again later.</p>';
 const apps=info.apps||[],url=esc(info.mcpUrl);
 const activity=state.activity.length?`<ul class="ai-activity">${state.activity.map(a=>`<li class="${a.ok?'ok':'bad'}">${icon(a.ok?'check-circle':'warning-circle')}<span><b>${esc(a.app||'AI app')}</b> · ${esc(COMMAND_LABELS[a.command]||a.command)}${a.ok?'':` · ${esc(a.message||'refused')}`}</span><small>${new Date(a.at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</small></li>`).join('')}</ul>`:'<p class="field-help">Nothing yet. Ask your AI app to "check the Crate Ship editor status" to test the connection.</p>';
 return `<p class="dialog-lead">Use the AI you already pay for, Claude, ChatGPT, Cursor, VS Code or any app that supports MCP, on its normal subscription or API key. It builds right here in this tab, and you can undo anything it does.</p>
<div class="ai-step"><h3>1 · Add Crate Ship to your AI app <small>(once)</small></h3><div class="ai-url"><code id="ai-mcp-url">${url}</code><button type="button" class="text-button" data-ai-action="copy">${icon('copy')} Copy</button></div>
<details><summary>Where to paste it</summary><ul class="ai-howto"><li><b>Claude</b> (web, desktop or phone; Free, Pro, Max, Team): Settings → Connectors → <i>Add custom connector</i>. Paste the address, then press Connect and sign in to Crate Ship.</li><li><b>ChatGPT</b>: Settings → Apps &amp; Connectors → Advanced → turn on Developer mode, then <i>Create</i> and paste the address.</li><li><b>Claude Code</b>: run <code>claude mcp add --transport http crateship ${url}</code>, then <code>/mcp</code> to sign in.</li><li><b>Cursor, VS Code, Windsurf and others</b>: add an MCP server of type HTTP with this address. The app opens a Crate Ship sign-in page.</li></ul></details>
<p class="field-help">${apps.length?`Connected apps: ${apps.map(a=>esc(a.clientName)).join(', ')}. `:'No apps connected yet. '}<a href="/settings/ai" target="_blank" rel="noopener">Manage connected apps ${icon('arrow-up-right')}</a></p></div>
<div class="ai-step"><h3>2 · Let your AI work in this tab</h3>
<label class="ai-toggle"><input type="checkbox" data-ai-toggle="active" ${state.active?'checked':''}><span><b>Let AI apps build here</b><small>Your AI apps can read this project while this tab stays open.</small></span></label>
<label class="ai-toggle"><input type="checkbox" data-ai-toggle="writes" ${state.allowWrites?'checked':''} ${state.active?'':'disabled'}><span><b>Allow changes</b><small>Lets them add and change objects. Every change is one Undo step.</small></span></label>
${state.warning?`<p class="dialog-error">${esc(state.warning)}</p>`:''}${state.message?`<p class="inline-note">${esc(state.message)}</p>`:''}
<p class="field-help">${state.active?`${icon('broadcast')} Live on <b>${esc(info.projectName||'this project')}</b>. Keep this tab open and visible while your AI works.`:'Off. Nothing can reach this editor until you turn it on.'}</p></div>
<div class="ai-step"><h3>Recent AI activity</h3>${activity}</div>`;
}
