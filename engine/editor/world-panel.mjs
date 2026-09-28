import {createWorldRecipe,getWorldRecipeHelp} from '../core/procedural.mjs';
import {createEditorMcpClient} from './mcp-client.mjs';
import {esc,icon} from './panels.mjs';
export function createWorldPanel({root,getEditor,getState,openDialog,closeDialog,toast,changePane,log}){
 const $=selector=>root.querySelector(selector);let pending=null,recipeText='',working=false,appliedCallback=()=>{};
 const mcp=createEditorMcpClient({getEditor,getState,onLog:log,onStatus:()=>renderMcpStatus()});
 function renderMcpStatus(){const target=$('#mcp-session-status');if(!target)return;const state=mcp.state;target.innerHTML=state.connected?`<b>Connected · ${state.allowWrites?'Scene changes allowed':'Read only'}</b><p>The connection ends when you leave this page or switch projects.</p><button type="button" class="text-button" data-world-action="disconnect">Disconnect MCP</button>`:'<b>Not connected</b><p>Start your local bridge, then paste its editor token below.</p>';}
 function presetOptions(){const entities=getEditor().getProject().entities;return {includePlayer:!entities.some(entity=>entity.components?.player),includeSun:!entities.some(entity=>entity.type==='directionalLight')};}
 function open(recipe,{onApplied=()=>{}}={}){
  appliedCallback=onApplied;
  const assets=getEditor().getProject().assets;
  pending=null;recipeText=JSON.stringify(recipe||createWorldRecipe('village',{seed:'my-world',...presetOptions()}),null,2);
  openDialog('Build a world',`<p class="dialog-lead">Start with a layout, or let your own AI design one. Review the objects, add them to your scene, and change anything with Undo.</p><div class="world-steps"><span>1. Choose</span><span>2. Review</span><span>3. Build</span></div><form id="world-builder-form" class="dialog-form"><div class="form-two"><label class="field"><span>Starting layout</span><select name="template"><option value="village">Village · houses and paths</option><option value="forest">Forest · scattered trees</option></select></label><label class="field"><span>World seed</span><input name="seed" value="my-world" maxlength="80" required></label></div><label class="field"><span>Forest model (optional)</span><select name="assetId"><option value="">Built-in stylized shapes</option>${assets.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></label><p class="field-help">A seed recreates the same arrangement. Imported tree models can replace the stylized forest shapes. This adds scene objects without changing your asset library.</p><button class="primary-button" type="submit">${icon('sparkle')} Review layout</button><button type="button" class="text-button" data-action="connections">Use my AI model</button></form><details class="world-advanced" ${recipe?'open':''}><summary>Advanced · JSON world recipe</summary><p class="field-help">AI tools can generate this format. The engine builds validated objects from it; scripts and external URLs are not executed.</p><textarea id="world-recipe" aria-label="World recipe" spellcheck="false" rows="10">${esc(recipeText)}</textarea><button type="button" class="text-button" data-world-action="review-json">Review this recipe</button><details><summary>Supported commands</summary><pre>${esc(JSON.stringify(getWorldRecipeHelp(),null,2))}</pre></details></details><div id="world-review" aria-live="polite"></div><details class="world-advanced"><summary>Connect an AI desktop app with MCP</summary><p class="field-help">Use the local editor bridge on this computer. Your chosen AI can inspect this project and preview world recipes. Allow scene changes only when you want it to build, edit, or Undo.</p><div class="inline-note" id="mcp-session-status"></div><form id="editor-mcp-form" class="dialog-form"><label class="field"><span>Editor bridge token</span><input name="token" type="password" autocomplete="off" placeholder="Paste the editor token from your bridge" required></label><label class="checkbox-field"><input name="allowWrites" type="checkbox">Allow this connected AI to add layouts, edit or remove objects, change level rules, and Undo in this project until I disconnect.</label><button class="primary-button" type="submit">Connect MCP</button></form><p class="field-help">Desktop setup: run <code>npm run bridge:editor</code> in the engine folder, then use the generated MCP configuration with your AI app. On a phone, use the API model connection; a desktop localhost bridge is not available there.</p></details>`,'large');
  renderMcpStatus();
 }
 function error(message){const output=$('#world-review');if(output)output.innerHTML=`<p class="dialog-error" role="alert">${esc(message)}</p>`;else toast(message,true);}
 async function review(recipe){
  if(getState().mode!=='edit')throw new Error('Stop Play before building a world.');
  const result=await getEditor().previewWorld(recipe);pending=result;
  recipeText=JSON.stringify(recipe,null,2);$('#world-recipe').value=recipeText;
  $('#world-review').innerHTML=`<div class="proposal-preview"><h3>${result.summary.entityCount.toLocaleString()} objects ready to add</h3><p>${Object.entries(result.summary.byType).map(([type,count])=>`${count} ${esc(type)}`).join(' · ')}</p><p>Your existing scene stays in place. The complete layout is one Undo step.</p><details><summary>Object list</summary><ul>${result.entities.slice(0,30).map(entity=>`<li>${esc(entity.name)} · ${esc(entity.type)}</li>`).join('')}${result.entities.length>30?`<li>And ${result.entities.length-30} more</li>`:''}</ul></details><button type="button" class="primary-button" data-world-action="apply">Add layout to scene</button></div>`;
 }
 async function run(action,button){if(working)return;working=true;if(button)button.disabled=true;try{await action();}catch(e){error(e.message);}finally{working=false;if(button?.isConnected)button.disabled=false;}}
 root.addEventListener('submit',event=>{
  const form=event.target;if(!['world-builder-form','editor-mcp-form'].includes(form.id))return;event.preventDefault();
  const data=Object.fromEntries(new FormData(form));void run(async()=>{
   if(form.id==='world-builder-form')await review(createWorldRecipe(data.template,{seed:data.seed,assetId:data.assetId||undefined,...presetOptions()}));
   else{await mcp.connect(data.token,{allowWrites:form.elements.allowWrites.checked});form.elements.token.value='';toast('Editor MCP connected to this project.');}
  },form.querySelector('[type=submit]'));
 });
 root.addEventListener('click',event=>{
  const button=event.target.closest('[data-world-action]');if(!button)return;event.preventDefault();void run(async()=>{
   if(button.dataset.worldAction==='review-json'){const text=$('#world-recipe').value;if(text.length>65536)throw new Error('World recipes are limited to 64 KiB.');await review(JSON.parse(text));}
   else if(button.dataset.worldAction==='apply'){if(!pending)throw new Error('Review the world layout first.');if($('#world-recipe').value!==recipeText)throw new Error('The recipe changed. Review it again before adding it.');await getEditor().applyWorld({previewId:pending.previewId});pending=null;appliedCallback();closeDialog();changePane('viewport');toast('World layout added. Use Undo to reverse the entire layout.');}
   else if(button.dataset.worldAction==='disconnect'){await mcp.disconnect();toast('Editor MCP disconnected.');}
  },button);
 });
 return {open,review,dispose:()=>mcp.dispose(),disconnect:()=>mcp.disconnect(),get connected(){return mcp.state.connected;}};
}
