import './styles.css';
import { createEditor } from '../runtime/editor.mjs';
import { newProject } from '../core/schema.mjs';
import { readLimitedResponse } from '../player/export.mjs';
import { createProposalRequests } from './proposal-request.mjs';
import { createEditorNavigation } from './navigation.mjs';
import { normalizeCatalog, catalogCategories, assetPage } from './catalog.mjs';
import { createWorldPanel } from './world-panel.mjs';
import { modelSceneContext, sceneFingerprint, authoredSceneJSON } from './scene-context.mjs';
import { esc, icon, tool, layout, hierarchy, inspector, assetCards, dialog, connectionsShell, modelConnections, primitiveTypes, typeIcons, bytes } from './panels.mjs';

const root = document.querySelector('#editor-root');
root.innerHTML = layout();
const $ = selector => root.querySelector(selector);
let editor, project = null, selected = null, activeTool = 'translate', space = 'world', mode = 'edit', ready = false, dirty = false, runtimeBusy = false;
let assetSource = 'project', catalog = [], catalogLoaded = false, connectionData = null, proposal = null, dialogFocus = null;
let assetLimit=80, assetCategory='';
let blenderToken = '', blenderAssets = [], blenderConnected = false;
const proposalRequests = createProposalRequests(({connectionId,body})=>api('/model-connections/'+encodeURIComponent(connectionId)+'/propose',{method:'POST',body}));
const logs = [];
const urlProjectId = new URL(location.href).searchParams.get('project');
const worldPanel=createWorldPanel({root,getEditor:()=>editor,getState:()=>({mode,busy:runtimeBusy}),openDialog,closeDialog,toast,changePane,log});
let connectionView=0;
let navigationApproved=false;
function commitActiveField(){const field=document.activeElement;if(field?.closest('#entity-form'))field.blur();}
const navigation=createEditorNavigation({getState:()=>({dirty,busy:runtimeBusy,mode}),stop:()=>editor.stop(),save:()=>{commitActiveField();return editor.saveLocal();},approve:value=>{navigationApproved=value;editor?.setNavigationApproved(value);},navigate:async href=>{await worldPanel.disconnect();location.assign(href);}});
async function requestNavigation(href){
 const result=await navigation.request(href);if(!result.needsSave)return;
 openDialog('Save before you leave?',`<p class="dialog-lead">${esc(project?.name||'Your project')} has unsaved changes. Save a copy on this device before returning to the games.</p><p class="field-help">Your original scene is saved. Temporary movement during Play is not written into your project.</p><div class="dialog-actions"><button class="primary-button" data-action="save-and-leave">Save & continue</button><button class="text-button" data-action="leave-without-save">Leave without saving</button><button class="text-button" data-action="close-dialog">Stay in editor</button></div><p class="field-help" style="margin-top:16px">Local saves are available now. Ads are not enabled.</p>`);
}

function log(entry = {}) {
 const level = entry.level || 'info', message = String(entry.message || entry);
 logs.push({ level, message, at: new Date() }); if (logs.length > 80) logs.shift();
 $('#log-count').textContent = logs.length;
 $('#console-list').innerHTML = logs.map(row=>`<div class="console-row ${['error','warn','info'].includes(row.level)?row.level:'info'}"><time>${row.at.toLocaleTimeString([], {hour12:false})}</time><span>${esc(row.message)}</span></div>`).join('');
 if (level === 'error') toast(message, true);
}
function toast(message, error = false) {
 const el = document.createElement('div'); el.className = 'editor-toast' + (error?' error':''); el.textContent = message;
 $('#editor-toasts').append(el); setTimeout(()=>el.remove(), error?8500:4200);
}
function saveStatus(text, saved = false) { $('#save-state').textContent = text; if (saved) dirty = false; }
async function run(task, element) {
 if(element?.disabled)return;
 if(element)element.disabled=true;
 try{return await task();}catch(error){log({level:'error',message:error?.message||'The action could not be completed.'});return null;}
 finally{if(element)element.disabled=false;if(editor)setMode(mode);}
}
async function api(path, options = {}) {
 const response = await fetch('/api/platform' + path, { credentials:'same-origin', ...options, headers:{'Content-Type':'application/json',...options.headers}, body:options.body===undefined?undefined:JSON.stringify(options.body) });
 const body = await response.json().catch(()=>({}));
 if(!response.ok){const error=new Error(body.error?.message||(typeof body.error==='string'?body.error:'The service is unavailable.'));error.status=response.status;error.code=body.error?.code;throw error;}
 return body;
}
let hierarchySignature='',assetsSignature='';
function renderHierarchy(){const filter=$('#hierarchy-search').value;const signature=JSON.stringify([selected?.id,filter,(project?.entities||[]).map(({id,name,type,parentId,visible})=>[id,name,type,parentId,visible])]);if(signature===hierarchySignature)return;hierarchySignature=signature;$('#hierarchy').innerHTML=hierarchy(project,selected?.id,filter);for(const button of $('#hierarchy').querySelectorAll('[data-visible]'))button.disabled=mode==='play'||runtimeBusy;}
function renderInspector(force=false){if(!force&&$('#inspector').contains(document.activeElement))return;$('#inspector').innerHTML=inspector(selected,project);$('#inspector-type').textContent=selected?.type?.toUpperCase()||'SCENE';for(const field of $('#inspector').querySelectorAll('input,select,button'))field.disabled=runtimeBusy||mode==='play';}
function renderAssets(){
 const items=assetSource==='catalog'?catalog:project?.assets||[],query=$('#asset-search').value,page=assetPage(items,{query,category:assetSource==='catalog'?assetCategory:'',limit:assetLimit});
 const signature=JSON.stringify([assetSource,query,assetCategory,assetLimit,page.items]);
 if(signature!==assetsSignature){assetsSignature=signature;$('#asset-grid').innerHTML=assetCards(page.items,assetSource);}
 $('#asset-count').textContent=project?.assets?.length||0;
 $('#asset-library-count').textContent=`Showing ${page.items.length.toLocaleString()} of ${page.matches.toLocaleString()}${query||assetCategory?' matches':''} · ${page.total.toLocaleString()} ${assetSource==='catalog'?'catalog entries':'project assets'}`;
 $('#asset-more').hidden=!page.hasMore;$('#asset-category').hidden=assetSource!=='catalog';
}

function onChange(next){project=next;selected=next?.entities?.find(e=>e.id===selected?.id)||null;$('#project-name').textContent=next?.name||'Untitled project';$('#scene-root-name').textContent=next?.name||'Scene';$('#entity-count').textContent=next?.entities?.length||0;renderHierarchy();renderInspector();renderAssets();}
function onState(state){dirty=state.dirty;runtimeBusy=Boolean(state.busy);setMode(state.mode);if(ready)saveStatus(state.busy?state.busy+'…':dirty?'Unsaved changes':state.cloudId?'Account project':'Saved state');for(const field of $('#inspector').querySelectorAll('input,select,button'))field.disabled=runtimeBusy||state.mode==='play';}
function onSelection(entity){selected=entity;renderHierarchy();renderInspector(true);}
let lastStatsTime=0;
function onStats(stats){const now=performance.now();if(now-lastStatsTime<350)return;lastStatsTime=now;const nextMode=['play','playing','runtime'].includes(stats.mode)?'play':'edit';$('#stats').textContent=[nextMode==='edit'&&!stats.fps?'Idle':`${Math.round(stats.fps||0)} FPS`,`${stats.drawCalls||0} draws`,`${Number(stats.triangles||0).toLocaleString()} tris`].join(' · ');if(nextMode!==mode)setMode(nextMode);}
function setMode(next){mode=['play','playing','runtime'].includes(next)?'play':'edit';root.classList.toggle('is-playing',mode==='play');$('#mode-label').textContent=mode==='play'?'PLAY':'EDIT';$('#mode-label').classList.toggle('running',mode==='play');$('#runtime-hud').hidden=mode!=='play';$('#viewport-guidance').hidden=mode==='play';$('.stop-button').disabled=mode!=='play'||runtimeBusy;$('#play-button').disabled=mode==='play'||runtimeBusy;$('#editor-status-text').textContent=mode==='play'?'Play mode · Stop to edit objects':runtimeBusy?'Working…':'Edit mode · Select an object to move it';for(const button of root.querySelectorAll('[data-action="space"],[data-action="world-builder"],[data-action="demo"],[data-action="new"],[data-action="rename"],[data-action="add"],[data-action="undo"],[data-action="redo"],[data-action="duplicate"],[data-action="remove"],[data-action^="tool:"],[data-visible]'))button.disabled=mode==='play'||runtimeBusy;}
function openDialog(title,body,cls=''){dialogFocus=document.activeElement;$('#dialog-root').innerHTML=dialog(title,body,cls);$('#dialog-root').querySelector('input:not([type=hidden]),button,select')?.focus();}
function closeDialog(){if(navigation.running)return;connectionView++;navigation.cancel();$('#dialog-root').replaceChildren();proposal=null;dialogFocus?.focus?.();}
function dialogError(message){let el=$('#dialog-root .dialog-error');if(!el){el=document.createElement('p');el.className='dialog-error';el.setAttribute('role','alert');$('#dialog-root .editor-dialog')?.append(el);}el.textContent=message;}
function changePane(pane){$('.editor-workspace').dataset.pane=pane;root.querySelectorAll('[data-pane]').forEach(el=>{if(el.tagName==='BUTTON')el.setAttribute('aria-pressed',String(el.dataset.pane===pane));});requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));}
function exportDownload(result, fallback) {
 if(!result||result.downloaded)return;
 const blob=result instanceof Blob?result:result.blob instanceof Blob?result.blob:typeof result==='string'?new Blob([result],{type:'application/json'}):result.data?new Blob([typeof result.data==='string'?result.data:JSON.stringify(result.data)],{type:'application/json'}):null;
 if(!blob)throw new Error('The exporter did not return a downloadable file.');
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=result.filename||fallback;a.className='primary-button';a.textContent='Download '+a.download;
 const existing=$('#export-download-ready');existing?.remove();const ready=document.createElement('div');ready.id='export-download-ready';ready.className='inline-note';const note=document.createElement('p');note.textContent='Your file is ready. If the download did not start, tap the link below.';ready.append(note,a);($('#dialog-root .editor-dialog')||$('#editor-toasts')).append(ready);a.click();
 const observer=new MutationObserver(()=>{if(!a.isConnected){URL.revokeObjectURL(url);observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});
}
async function saveLocal(){commitActiveField();if(mode==='play')await editor.stop();await editor.saveLocal();saveStatus('Saved locally',true);toast('Project saved on this device.');}
function demoDialog(){openDialog('Build a 2D adventure',`<p class="dialog-lead">Build an original side-scrolling forest game with a hand-designed human character, layered trees, carved platforms, collectible fireflies, and solid collisions. The scene uses model-authored vector paths instead of primitive shapes.</p><p class="field-help">The editable project is saved on this device before Play starts. Stop to edit the character and world objects.</p><div class="dialog-actions"><button class="text-button" data-action="close-dialog">Cancel</button><button class="primary-button" data-action="create-demo">Build and play game</button></div>`);}
async function buildDemo(){
 const response=await fetch('/platform/media/skybound-sprint-recipe.json',{credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('The platformer recipe is unavailable.');
 const recipe=JSON.parse(new TextDecoder().decode(await readLimitedResponse(response,128*1024,'Platformer recipe')));
 await worldPanel.disconnect();
 await editor.loadProject(newProject('Mira and the Dawnwood'));
 await editor.updateSettings({background:'#25466d',ambientIntensity:1.2,fogDensity:0});
 const preview=await editor.previewWorld(recipe);
 await editor.applyWorld({previewId:preview.previewId});
 await editor.saveLocal();
 closeDialog();changePane('viewport');
 toast('Built '+preview.summary.entityCount+' editable custom-shape game objects. Press Stop to edit.');
 await editor.play();setMode('play');$('#editor-canvas').focus();
}
async function importFiles(files){if(!files?.length)return;await editor.importFiles(Array.from(files));toast(`${files.length===1?files[0].name:files.length+' files'} imported.`);changePane('viewport');}
async function loadCatalog(){
 for(const url of ['https://crateship-games-assets.pages.dev/models/catalog.json','/asset-catalog.json']){
  try{const response=await fetch(url,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000)});if(!response.ok)continue;
   const data=JSON.parse(new TextDecoder().decode(await readLimitedResponse(response,8*1024*1024,'Asset catalog')));catalog=normalizeCatalog(data);if(catalog.length)break;
  }catch{}
 }
 if(!catalog.length){catalogLoaded=false;renderAssets();throw new Error('The optional catalog is unavailable. Select Existing catalog again to retry, or import your own GLB files.');}
 catalogLoaded=true;
 $('#asset-category').innerHTML='<option value="">All categories</option>'+catalogCategories(catalog).map(([cat,count])=>`<option value="${esc(cat)}">${esc(cat)} (${count.toLocaleString()})</option>`).join('');
 renderAssets();
}

async function openProjects(){openDialog('Open a project','<p class="loading-copy">Loading saved projects…</p>');const result=await editor.listLocal();const list=Array.isArray(result)?result:result?.projects||[];openDialog('Open a project',`<p class="dialog-lead">Continue a project from this device, open a project file, or visit your account library.</p><div class="dialog-list">${list.length?list.map(p=>`<button data-load-project="${esc(p.id)}">${icon('cube')}<span>${esc(p.name||'Untitled project')}</span><small>${p.updatedAt?new Date(typeof p.updatedAt==='number'&&p.updatedAt<1e12?p.updatedAt*1000:p.updatedAt).toLocaleDateString():''}</small></button>`).join(''):'<p class="inline-note">No projects saved on this device yet.</p>'}</div><div class="dialog-actions"><a class="text-button" href="/engine/projects">Account projects ${icon('arrow-up-right')}</a><button class="primary-button" data-action="import">Open project file</button></div>`);}
function newProjectDialog(){openDialog('Start something new',`<p class="dialog-lead">Begin with a floor, a dynamic cube, and a sun light. Your current scene will be saved locally before switching.</p><form id="new-project-form" class="dialog-form"><label class="field"><span>Project name</span><input name="name" value="My new world" required maxlength="120"></label><div class="dialog-actions"><button class="text-button" type="button" data-action="close-dialog">Cancel</button><button class="primary-button" type="submit">Create project</button></div></form>`);}
function renameDialog(){openDialog('Name your project',`<form id="rename-form" class="dialog-form"><label class="field"><span>Project name</span><input name="name" value="${esc(project?.name)}" required maxlength="120"></label><div class="dialog-actions"><button class="primary-button" type="submit">Rename project</button></div></form>`);}
function addDialog(){openDialog('Add to your scene',`<div class="primitive-grid">${primitiveTypes.map(([type,name])=>`<button data-add-type="${type}">${icon(typeIcons[type])}<span>${name}</span></button>`).join('')}</div><p class="field-help" style="margin:18px 0 0">Have your own model? Import a GLB file or connect Blender.</p>`);}
function componentDialog(){
 if(!selected){toast('Select an object first.');return;}
 const renderable=['box','sphere','cylinder','capsule','plane','model','customMesh'].includes(selected.type),c=selected.components||{};
 const choices=[...(renderable&&!c.spin?[['rigidbody','Rigid body','Physical collisions and gravity'],['player','Player controller','Move this object with touch controls or WASD']]:[]),...(renderable?[['collectible','Collectible','Collect a value on contact']]:[]),...(!c.rigidbody?[['spin','Spin','Rotate the object during play']]:[]),...(selected.type==='model'?[['animation','Animation','Play an animation clip from this model']]:[]),...(renderable&&!c.player?[['goal','Goal','Win the level on touch'],['hazard','Hazard','Lose a life on touch'],['checkpoint','Checkpoint','Save the respawn point on touch']]:[]),...(renderable&&!c.player&&!c.spin&&c.rigidbody?.type!=='dynamic'?[['mover','Moving platform','Travel back and forth, carrying the player']]:[])].filter(([key])=>!c[key]);
 openDialog('Add a component',choices.length?`<div class="dialog-list">${choices.map(([key,name,note])=>`<button data-add-component="${key}" aria-label="Add ${esc(name)}: ${esc(note)}">${icon('puzzle-piece')}<span>${name}<small style="display:block;margin:5px 0 0">${note}</small></span></button>`).join('')}</div>`:'<p class="inline-note">No additional compatible components are available for this object.</p>');
}

function exportDialog(){openDialog('Take your work anywhere',`<p class="dialog-lead">Keep an editable project backup, or build a playable browser game from your scene.</p>${selected?.assetId?`<button class="export-option" data-export-asset="${esc(selected.assetId)}">${icon('cube-transparent')}<span><b>Export selected model · GLB</b><small>Original model, materials, and animations. Scene transforms are not baked into this file.</small></span>${icon('arrow-down')}</button>`:''}<button class="export-option" data-export="project">${icon('file-code')}<span><b>Export Crate project</b><small>Editable scene, components, and imported assets.</small></span>${icon('arrow-down')}</button><button class="export-option" data-export="game">${icon('game-controller')}<span><b>Build browser game</b><small>Download the playable package for your own hosting.</small></span>${icon('arrow-down')}</button><button class="export-option" data-action="save-cloud">${icon('cloud-arrow-up')}<span><b>Save to my account</b><small>Keep a private cloud copy of this project.</small></span>${icon('arrow-up-right')}</button><p class="field-help" style="margin:18px 0 0">The browser ZIP and Crate backup are not native Unity, Unreal, or Godot projects. Original imported GLBs are included in the browser ZIP for reuse. Public listings require a build submission and review. <a href="/developer/games/new" target="_blank" rel="noopener">Open developer dashboard</a>.</p>`);}
function helpDialog(){openDialog('A few useful shortcuts',`<div class="shortcut-list"><span>Move / Rotate / Scale</span><kbd>W / E / R</kbd><span>Frame the selected object</span><kbd>F</kbd><span>Save locally</span><kbd>Ctrl S</kbd><span>Undo / Redo</span><kbd>Ctrl Z / Shift Z</kbd><span>Duplicate selection</span><kbd>Ctrl D</kbd><span>Delete selection</span><kbd>Delete</kbd><span>Stop preview / Close dialog</span><kbd>Esc</kbd></div><p class="dialog-lead" style="margin:22px 0 0">Drag to orbit the scene, right drag or two-finger drag to pan, and pinch or scroll to zoom. Tap an object to inspect it.</p>`);}

async function loadConnections(){const view=++connectionView;try{const result=await api('/model-connections');if(view!==connectionView||!$('#connection-content'))return;connectionData=result;$('#connection-content').innerHTML=modelConnections(connectionData);renderProposalAttempt();}catch(error){if(view!==connectionView||!$('#connection-content'))return;$('#connection-content').innerHTML=`<p class="dialog-error">${esc(error.message)}</p>${error.status===401?'<a class="primary-button" href="/login?returnTo=%2Fplay">Sign in to manage connections</a>':'<button class="text-button" data-action="refresh-connections">Try again</button>'}`;}}
async function connections(){openDialog('Your creative toolkit',connectionsShell(),'large');await loadConnections();}
function renderBlender(){connectionView++;if(!$('#connection-content'))return;
 $('#connection-content').innerHTML=`<p class="dialog-lead">Create in Blender. Bring the models you choose into this project through your local bridge.</p><form id="blender-connect-form" class="dialog-form"><label class="field"><span>Local bridge token</span><input name="token" id="blender-token" type="password" autocomplete="off" required placeholder="Paste the token from your Blender bridge"></label><p class="field-help">The token stays in memory until this page closes. The browser connects only to <code>127.0.0.1:9877</code>.</p><button class="primary-button" type="submit">${icon('plugs-connected')} Connect locally</button></form><div id="blender-status" class="inline-note" style="margin-top:18px">${blenderConnected?'Bridge connected. Select an exported asset below.':'Start the local bridge and set its allowed origin to '+esc(location.origin)+'.'}</div><div id="blender-assets" class="dialog-list">${blenderAssets.map(asset=>`<button data-blender-asset="${esc(asset.id)}">${icon('cube-transparent')}<span>${esc(asset.name||asset.id)}</span><small>${bytes(asset.size||asset.sizeBytes)} · Import</small></button>`).join('')}</div><div class="blender-step"><h3>Using Blender exports</h3><p>Export the objects you want to share from Blender through the bridge, then refresh this panel. Imported GLB geometry becomes part of your Crate project.</p><button class="text-button" data-action="refresh-blender" ${blenderConnected?'':'disabled'}>${icon('arrows-clockwise')} Refresh available assets</button><button class="text-button" data-action="import">Import a GLB file instead</button></div>`;
 $('#blender-token').value=blenderToken;
}
async function blenderFetch(path, binary=false){const response=await fetch('http://127.0.0.1:9877'+path,{headers:{Authorization:'Bearer '+blenderToken},credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('Blender bridge returned HTTP '+response.status+'. Check the token and allowed origin.');const bytes=await readLimitedResponse(response,binary?16*1024*1024:256*1024,'Blender response');return binary?bytes:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
async function refreshBlender(){await blenderFetch('/status');const result=await blenderFetch('/assets');blenderAssets=Array.isArray(result)?result:result.assets||result.items||[];blenderConnected=true;renderBlender();if(!blenderAssets.length)$('#blender-status').textContent='Bridge connected. Export a GLB from Blender to make it available here.';}


function renderProposalAttempt(){
 const form=$('#model-proposal-form'),output=$('#proposal-result');if(!form||!output)return;
 const attempt=proposalRequests.state;
 for(const name of ['connectionId','prompt','maxOutputTokens','confirmProviderUsage'])form.elements[name].disabled=Boolean(attempt);
 form.querySelector('[type=submit]').disabled=Boolean(attempt)||!connectionData?.enabled;
 if(!attempt){output.replaceChildren();return;}
 form.elements.connectionId.value=attempt.connectionId;form.elements.prompt.value=attempt.body.prompt;form.elements.maxOutputTokens.value=attempt.body.maxOutputTokens;
 form.elements.confirmProviderUsage.checked=false;
 if(attempt.sending){output.innerHTML='<p class="loading-copy" role="status">Waiting for your provider. This request will keep the same identifier if you need to check it again.</p>';return;}
 const newButton='<button class="text-button" type="button" data-action="new-proposal-request">Start a new request</button>';
 if(attempt.status==='complete'){
  const result=attempt.result;proposal=attempt.applied?null:{...(result.proposal||{summary:result.summary,operations:result.operations,worldRecipe:result.worldRecipe}),baseFingerprint:result.baseFingerprint||attempt.body.sceneSummary.baseFingerprint};
  const returned={...(result.proposal||{summary:result.summary,operations:result.operations,worldRecipe:result.worldRecipe}),baseFingerprint:result.baseFingerprint||attempt.body.sceneSummary.baseFingerprint},valid=Boolean(returned?.worldRecipe)||(Array.isArray(returned?.operations)&&returned.operations.length>0);
  output.innerHTML=`<div class="proposal-preview"><h3>${attempt.applied?'Changes already applied':valid?'Review the proposed changes':'Provider response'}</h3><p>${esc(returned?.summary||'The provider did not return a valid scene operation list.')}</p><pre>${esc(valid?JSON.stringify(returned.worldRecipe||returned.operations,null,2):result.text||'No scene changes returned.')}</pre>${valid&&!attempt.applied?'<button class="primary-button" type="button" data-action="apply-proposal">'+(returned.worldRecipe?'Review world layout':'Apply these changes')+'</button>':'<p class="field-help">'+(attempt.applied?'Use Undo in the editor to reverse the applied changes.':'No changes were made to your scene.')+'</p>'}${newButton}</div>`;
 }else{
  proposal=null;
  output.innerHTML=`<p class="dialog-error" role="alert">${esc(attempt.error?.message||'The request is unresolved.')}</p><p class="field-help">${attempt.status==='uncertain'?'Your provider may have processed this request and charged your account. Checking the same request will not send a second completion for an existing reservation. Starting a new request may add another charge.':'Check this same request, or start a new request after correcting the issue. A new request requires fresh confirmation.'}</p><div class="dialog-actions"><button class="primary-button" type="button" data-action="retry-proposal-request">Check the same request</button>${newButton}</div>`;
 }
}
async function sendProposalAttempt(form,retry=false){
 let pending;
 try{
  proposal=null;
  if(retry)pending=proposalRequests.retry();
  else{const data=Object.fromEntries(new FormData(form));pending=proposalRequests.start({connectionId:data.connectionId,prompt:data.prompt,sceneSummary:await modelSceneContext(editor.getProject()),maxOutputTokens:Number(data.maxOutputTokens),confirmProviderUsage:form.elements.confirmProviderUsage.checked});}
  renderProposalAttempt();await pending;
 }catch(error){log({level:'error',message:error.message});}
 finally{renderProposalAttempt();}
}

root.addEventListener('click',event=>{
 const el=event.target.closest('button,a');if(!el||el.disabled)return;
 if(el.tagName==='A'&&el.hasAttribute('href')&&!el.hasAttribute('download')&&!el.target&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){const href=new URL(el.href,location.href);if(href.origin===location.origin&&href.pathname!==location.pathname){event.preventDefault();run(()=>requestNavigation(href.pathname+href.search+href.hash));return;}}
 if(el.dataset.pane){changePane(el.dataset.pane);return;}
 if(el.dataset.select){editor?.select(el.dataset.select);return;}
 if(el.dataset.visible){const entity=project.entities.find(e=>e.id===el.dataset.visible);run(()=>editor.updateEntity(entity.id,{visible:entity.visible===false}),el);return;}
 if(el.dataset.addType){run(async()=>{await editor.addEntity(el.dataset.addType);closeDialog();changePane('viewport');},el);return;}
 if(el.dataset.addComponent){const defaults={rigidbody:{type:'dynamic',mass:1},player:{speed:5,jump:6},collectible:{value:1},spin:{speed:30},animation:{clip:'',autoplay:true,speed:1},goal:{message:'Level complete!'},hazard:{},checkpoint:{},mover:{offset:[4,0,0],period:4}};run(async()=>{const key=el.dataset.addComponent,components={...selected.components,[key]:defaults[key]};if(key==='mover'&&!components.rigidbody)components.rigidbody={type:'static'};if(key==='player'){if(!['box','sphere','cylinder','capsule','plane','model'].includes(selected.type))throw new Error('A player needs a renderable object with collision geometry.');components.rigidbody={...defaults.rigidbody,...components.rigidbody,type:'dynamic'};}if(key==='spin'&&components.rigidbody)throw new Error('Remove the rigid body before adding a spin component.');if(key==='rigidbody'&&components.spin)throw new Error('Remove the spin component before adding a rigid body.');await editor.updateEntity(selected.id,{components});closeDialog();renderInspector(true);},el);return;}
 if(el.dataset.removeComponent){const components={...selected.components};run(async()=>{if(el.dataset.removeComponent==='rigidbody'&&components.player)throw new Error('Remove the player controller before removing its rigid body.');delete components[el.dataset.removeComponent];await editor.updateEntity(selected.id,{components});renderInspector(true);},el);return;}
 if(el.dataset.bottomTab){const assets=el.dataset.bottomTab==='assets';$('#assets-view').hidden=!assets;$('#console-view').hidden=assets;root.querySelectorAll('[data-bottom-tab]').forEach(b=>{b.classList.toggle('active',b===el);b.setAttribute('aria-selected',String(b===el));});return;}
 if(el.dataset.assetSource){assetSource=el.dataset.assetSource;assetLimit=80;assetCategory='';$('#asset-category').value='';root.querySelectorAll('[data-asset-source]').forEach(b=>b.classList.toggle('active',b===el));$('#asset-source-note').textContent=assetSource==='catalog'?'Legacy catalog · some files need conversion before import':'Your imports stay with your project';if(assetSource==='catalog'&&!catalogLoaded){$('#asset-grid').innerHTML='<p class="loading-copy">Loading the optional model catalog…</p>';run(loadCatalog,el);}else renderAssets();return;}
 if(el.dataset.asset){run(async()=>{if(el.dataset.source==='catalog'){const record=catalog.find(a=>a.file===el.dataset.asset);if(record)await editor.addCatalogAsset(record);}else if(typeof editor.instantiateAsset==='function')await editor.instantiateAsset(el.dataset.asset);else{const entity=project.entities.find(e=>e.assetId===el.dataset.asset);if(entity)editor.select(entity.id);else throw new Error('This asset does not have a scene object yet.');}changePane('viewport');},el);return;}
 if(el.dataset.exportAsset){run(async()=>{exportDownload(await editor.exportAsset(el.dataset.exportAsset),'model.glb');toast('Original model export is ready.');},el);return;}
 if(el.dataset.export){run(async()=>{const result=await(el.dataset.export==='project'?editor.exportProject():editor.exportGame());exportDownload(result,el.dataset.export==='project'?'project.crate':'game.zip');toast('Your export download is ready.');},el);return;}
 if(el.dataset.loadProject){run(async()=>{await editor.loadLocal(el.dataset.loadProject);saveStatus('Loaded from device');closeDialog();},el);return;}
 if(el.dataset.connectionTab){root.querySelectorAll('[data-connection-tab]').forEach(b=>b.classList.toggle('active',b===el));if(el.dataset.connectionTab==='blender')renderBlender();else loadConnections();return;}
 if(el.dataset.testConnection){run(async()=>{const result=await api('/model-connections/'+encodeURIComponent(el.dataset.testConnection)+'/test',{method:'POST',body:{}});toast(result.message||'Provider connection checked.');await loadConnections();},el);return;}
 if(el.dataset.deleteConnection){run(async()=>{await api('/model-connections/'+encodeURIComponent(el.dataset.deleteConnection),{method:'DELETE'});await loadConnections();toast('Connection removed.');},el);return;}
 if(el.dataset.blenderAsset){run(async()=>{const asset=blenderAssets.find(a=>a.id===el.dataset.blenderAsset);const data=await blenderFetch('/assets/'+encodeURIComponent(el.dataset.blenderAsset),true);await editor.importGLB(data,asset?.name||'Blender asset','blender');toast('Blender asset imported into your project.');closeDialog();changePane('viewport');},el);return;}
 const action=el.dataset.action;if(!action)return;
 if(action==='close-dialog'){closeDialog();return;}
 if(action==='save-and-leave'||action==='leave-without-save'){run(async()=>{try{await(action==='save-and-leave'?navigation.saveAndLeave():navigation.leaveWithoutSaving());}catch(error){dialogError(error.message);throw error;}},el);return;}
 if(action==='world-builder'){if(!editor)return;if(mode==='play'){toast('Press Stop before building a world.');return;}worldPanel.open();return;}
 if(action==='more-assets'){assetLimit+=80;renderAssets();return;}
 if(action==='help'){helpDialog();return;}
 if(action==='connections'){run(connections,el);return;}
 if(action==='refresh-connections'){loadConnections();return;}
 if(action==='refresh-blender'){run(refreshBlender,el);return;}
 if(action==='retry-proposal-request'){void sendProposalAttempt(null,true);return;}
 if(action==='new-proposal-request'){run(()=>{proposalRequests.newRequest();proposal=null;renderProposalAttempt();const form=$('#model-proposal-form');if(form){form.elements.confirmProviderUsage.checked=false;form.elements.prompt.focus();}},el);return;}
 if(action==='import'){$('#import-files').click();return;}
 if(action==='clear-log'){logs.length=0;$('#console-list').replaceChildren();$('#log-count').textContent='0';return;}
 if(!editor){toast('The renderer is still starting.');return;}
 if(action.startsWith('tool:')){activeTool=action.split(':')[1];editor.setTool(activeTool);root.querySelectorAll('[data-action^="tool:"]').forEach(b=>{const active=b.dataset.action==='tool:'+activeTool;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});return;}
 const actions={new:newProjectDialog,demo:demoDialog,'create-demo':buildDemo,rename:renameDialog,add:addDialog,component:componentDialog,open:openProjects,save:saveLocal,export:exportDialog,undo:()=>editor.undo(),redo:()=>editor.redo(),duplicate:()=>selected?editor.duplicate(selected.id):toast('Select an object first.'),remove:()=>selected?editor.remove(selected.id):toast('Select an object first.'),frame:()=>editor.frameSelection(),space:()=>{const nextSpace=space==='world'?'local':'world';editor.setSpace(nextSpace);space=nextSpace;$('#space-label').textContent=space==='world'?'World':'Local';},fullscreen:()=>document.fullscreenElement?document.exitFullscreen():$('#canvas-wrap').requestFullscreen(),'scene-settings':()=>{editor.select(null);changePane('inspector');},play:async()=>{changePane('viewport');await editor.play();setMode('play');$('#editor-canvas').focus();},stop:async()=>{await editor.stop();setMode('edit');},'save-cloud':async()=>{commitActiveField();if(mode==='play')await editor.stop();await editor.saveCloud();saveStatus('Saved to account',true);toast('Project saved to your account.');},'apply-proposal':async()=>{if(!proposal?.worldRecipe&&!proposal?.operations?.length)throw new Error('There is no valid proposal to apply.');const before=editor.getProject(),fingerprint=await sceneFingerprint(before);if((proposal.baseFingerprint&&fingerprint!==proposal.baseFingerprint)||authoredSceneJSON(before)!==authoredSceneJSON(editor.getProject()))throw new Error('The scene changed since this model request. Start a new request using the current scene.');if(proposal.worldRecipe){const recipe=proposal.worldRecipe;worldPanel.open(recipe,{onApplied:()=>proposalRequests.markApplied()});await worldPanel.review(recipe);return;}await editor.applyProposal(proposal);proposalRequests.markApplied();proposal=null;toast('Proposal applied. Use Undo to reverse it.');closeDialog();}};
 if(actions[action])run(actions[action],el);
});

root.addEventListener('submit',event=>{
 event.preventDefault();const form=event.target,data=Object.fromEntries(new FormData(form)),button=form.querySelector('[type=submit]');
 if(['world-builder-form','editor-mcp-form'].includes(form.id))return;
 if(form.id==='model-proposal-form'){void sendProposalAttempt(form);return;}
 run(async()=>{
  if(form.id==='new-project-form'){await editor.newProject(data.name);closeDialog();saveStatus('New project · Unsaved');changePane('viewport');}
  else if(form.id==='rename-form'){await editor.renameProject(data.name);closeDialog();}
  else if(form.id==='scene-settings-form'){await editor.updateSettings({background:data.background,ambientIntensity:Number(data.ambientIntensity),gravity:Number(data.gravity),exposure:Number(data.exposure),fogDensity:Number(data.fogDensity),quality:data.quality,shadows:data.shadows==='true',lives:Number(data.lives),killY:Number(data.killY)});toast('Scene environment updated.');}
  else if(form.id==='model-connection-form'){await api('/model-connections',{method:'POST',body:{provider:data.provider,label:data.label,apiKey:data.apiKey,model:data.model}});form.reset();await loadConnections();toast('Connection saved. Provider requests begin only when you choose.');}
  else if(form.id==='blender-connect-form'){blenderToken=data.token.trim();blenderConnected=false;await refreshBlender();}
 },button);
});
root.addEventListener('change',event=>{
 const input=event.target;
 if(input.id==='import-files'){const files=[...input.files];input.value='';run(()=>importFiles(files));return;}
 if(!input.closest('#entity-form')||!selected||!input.name)return;
 const key=input.name;let patch={};
 if(['position','rotation','scale'].some(name=>key.startsWith(name+'.'))){const [name,axis]=key.split('.'),value=Number(input.value);if(!Number.isFinite(value))return;const vector=[...(selected[name]||[0,0,0])];vector[Number(axis)]=value;patch={[name]:vector};}
  else if(key.startsWith('material.')){const name=key.split('.')[1];patch={material:{...selected.material,[name]:name==='color'?input.value:Number(input.value)}};}
 else if(key.startsWith('light.')){const name=key.split('.')[1];patch={light:{...selected.light,[name]:name==='color'?input.value:Number(input.value)}};}
 else if(key.startsWith('components.mover.offset.')){const axis=Number(key.split('.')[3]),value=Number(input.value);if(!Number.isFinite(value))return;const offset=[...(selected.components.mover?.offset||[0,0,0])];offset[axis]=value;patch={components:{...selected.components,mover:{...selected.components.mover,offset}}};}
 else if(key==='components.rigidbody.collider'){const rigidbody={...selected.components.rigidbody};if(input.value==='shape')rigidbody.collider='shape';else delete rigidbody.collider;patch={components:{...selected.components,rigidbody}};}
 else if(key.startsWith('components.')){const [,name,property]=key.split('.');const value=property==='autoplay'?input.value==='true':['type','clip','message'].includes(property)?input.value:Number(input.value);if(name==='rigidbody'&&property==='type'&&value!=='dynamic'&&selected.components.player){input.value='dynamic';toast('A player controller requires a dynamic rigid body.',true);return;}patch={components:{...selected.components,[name]:{...selected.components[name],[property]:value}}};}
 else if(key==='name')patch={name:input.value};else if(key==='parentId')patch={parentId:input.value||null};
 run(async()=>{try{await editor.updateEntity(selected.id,patch);}catch(error){renderInspector(true);throw error;}});
});
$('#hierarchy-search').addEventListener('input',renderHierarchy);
$('#asset-search').addEventListener('input',()=>{assetLimit=80;renderAssets();});
$('#asset-category').addEventListener('change',()=>{assetCategory=$('#asset-category').value;assetLimit=80;renderAssets();});
$('#dialog-root').addEventListener('click',event=>{if(event.target.classList.contains('dialog-backdrop'))closeDialog();});
document.addEventListener('keydown',event=>{
 const editable=event.target.closest('input,textarea,select,[contenteditable=true]');
 if(event.key==='Escape'){if(mode==='play'){event.preventDefault();run(async()=>{await editor.stop();setMode('edit');});}else closeDialog();return;}
 if($('#dialog-root').children.length){if(event.key==='Tab'){const controls=[...$('#dialog-root').querySelectorAll('button:not([disabled]),input:not([disabled]),select,textarea,a[href],summary')];if(!controls.length)return;const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}return;}
 const key=event.key.toLowerCase(),mod=event.ctrlKey||event.metaKey;
 if(mod&&key==='s'&&editor){event.preventDefault();run(saveLocal);return;}
 if(editable||!editor||mode==='play')return;
 if(mod&&key==='z'){event.preventDefault();run(()=>event.shiftKey?editor.redo():editor.undo());return;}
 if(mod&&key==='d'){event.preventDefault();if(selected)run(()=>editor.duplicate(selected.id));return;}
 if(key==='delete'||key==='backspace'){if(selected){event.preventDefault();run(()=>editor.remove(selected.id));}return;}
 if(['w','e','r'].includes(key)){event.preventDefault();$('[data-action="tool:'+({w:'translate',e:'rotate',r:'scale'}[key])+'"]').click();}
 if(key==='f'){event.preventDefault();editor.frameSelection();}
 if(key==='/'){event.preventDefault();changePane('scene');$('#hierarchy-search').focus();}
});
let dragDepth=0;
const canvasWrap=$('#canvas-wrap');
canvasWrap.addEventListener('dragenter',event=>{if(!event.dataTransfer?.types.includes('Files'))return;event.preventDefault();dragDepth++;$('#drop-target').hidden=false;});
canvasWrap.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();});
canvasWrap.addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('#drop-target').hidden=true;});
canvasWrap.addEventListener('drop',event=>{event.preventDefault();dragDepth=0;$('#drop-target').hidden=true;if(editor)run(()=>importFiles([...event.dataTransfer.files]));});
window.addEventListener('beforeunload',event=>{if(dirty&&!navigationApproved){event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',event=>{blenderToken='';worldPanel.dispose();if(!event.persisted)editor?.dispose?.();});

try{
 editor=await createEditor({canvas:$('#editor-canvas'),onChange,onSelection,onStats,onLog:log,onState});
 onChange(editor.getProject());
 saveStatus(urlProjectId?'Loaded from account':'Ready');
 ready=true;dirty=false;$('#viewport-loading').remove();setMode('edit');log({level:'info',message:'Workspace ready. Import your own assets or start with a primitive.'});
}catch(error){$('#viewport-loading').innerHTML=`${icon('warning')}<b>We couldn’t start the editor</b><span>${esc(error.message)}</span><button class="primary-button" data-action="retry-page">Reload editor</button>`;$('#editor-status-text').textContent='Renderer unavailable';log({level:'error',message:error.message});$('#viewport-loading [data-action="retry-page"]').onclick=()=>location.reload();}
