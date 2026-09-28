// Shared by editor preview and exported games. This module has no platform,
// account, provider, or UI-framework dependencies.
export function createTouchState(onChange=()=>{}){
 const pointers=new Map();let current={x:0,z:0,jump:false},disposed=false;
 function publish(){const actions=[...pointers.values()],next={x:Number(actions.includes('right'))-Number(actions.includes('left')),z:Number(actions.includes('backward'))-Number(actions.includes('forward')),jump:actions.includes('jump')};if(next.x!==current.x||next.z!==current.z||next.jump!==current.jump){current=next;onChange({...current});}return {...current};}
 return {get current(){return {...current};},press(pointerId,action){if(disposed)return;if(!['forward','backward','left','right','jump'].includes(action))return;pointers.set(pointerId,action);return publish();},release(pointerId){if(disposed)return;pointers.delete(pointerId);return publish();},clear(){pointers.clear();return publish();},dispose(){if(disposed)return;pointers.clear();publish();disposed=true;}};
}
const styles=`
.crate-touch-controls{position:absolute;inset:0;pointer-events:none;z-index:20;display:none;font:12px system-ui,sans-serif;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.crate-touch-pad{position:absolute;bottom:max(18px,env(safe-area-inset-bottom));left:max(16px,env(safe-area-inset-left));display:grid;grid-template-columns:48px 48px 48px;grid-template-rows:48px 48px 48px;gap:4px;pointer-events:none}
.crate-touch-button{display:flex;align-items:center;justify-content:center;pointer-events:auto;touch-action:none;overscroll-behavior:contain;border:1px solid #86a68b;border-radius:12px;background:#14251dea;color:#eff5e9;font:700 24px system-ui,sans-serif;box-shadow:0 3px 12px #0004;padding:0;margin:0;min-width:48px;min-height:48px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.crate-touch-button[data-direction=forward]{grid-column:2;grid-row:1}.crate-touch-button[data-direction=left]{grid-column:1;grid-row:2}.crate-touch-button[data-direction=right]{grid-column:3;grid-row:2}.crate-touch-button[data-direction=backward]{grid-column:2;grid-row:3}
.crate-touch-button[aria-pressed=true]{background:#f09145;color:#112016;border-color:#ffc083;transform:scale(.97)}.crate-touch-button:focus-visible{outline:3px solid #ffba7c;outline-offset:3px}.crate-touch-button:disabled{opacity:.3;cursor:not-allowed}
.crate-touch-jump{position:absolute;bottom:max(35px,env(safe-area-inset-bottom));right:max(22px,env(safe-area-inset-right));width:72px;height:72px;border-radius:50%;font-size:15px;background:#8d542ce8;border-color:#ecac7f}
.crate-touch-caption{position:absolute;bottom:calc(max(18px,env(safe-area-inset-bottom)) + 160px);left:max(16px,env(safe-area-inset-left));padding:5px 8px;border-radius:5px;background:#102017dc;color:#d0dfd1;font-size:10px;max-width:calc(100% - 30px);line-height:1.4}
@media(any-pointer:coarse),(max-width:900px){.crate-touch-controls{display:block}.canvas-wrap:has(.crate-touch-controls) .runtime-hud{top:47px;bottom:auto;max-width:calc(100% - 24px);width:auto;white-space:normal;z-index:10}.canvas-wrap:has(.crate-touch-controls) .runtime-hud small{display:none}}
@media(max-height:420px){.crate-touch-pad{grid-template-columns:42px 42px 42px;grid-template-rows:42px 42px 42px;gap:3px;bottom:10px;left:12px}.crate-touch-button{min-height:42px;min-width:42px}.crate-touch-caption{bottom:148px}.crate-touch-jump{width:62px;height:62px;bottom:22px}}
@media(prefers-reduced-motion:reduce){.crate-touch-button{transform:none!important}}
`;

export function mountTouchControls(container,{onInput=()=>{},enabled=true}={}){
 const doc=container.ownerDocument||document,win=doc.defaultView||window;
 if(!doc.getElementById('crate-touch-control-styles')){const style=doc.createElement('style');style.id='crate-touch-control-styles';style.textContent=styles;doc.head.append(style);}
 const root=doc.createElement('div');root.className='crate-touch-controls';root.setAttribute('role','group');root.setAttribute('aria-label','Touch game controls');
 const pad=doc.createElement('div');pad.className='crate-touch-pad';pad.setAttribute('role','group');pad.setAttribute('aria-label','Movement');
 const caption=doc.createElement('span');caption.className='crate-touch-caption';caption.textContent=enabled?'Move with the pad · Tap Jump':'This scene has no active player controller';
 const buttons=new Map(),held=new Map(),keyboardPointers=new Set();let disposed=false;
 const state=createTouchState(value=>{onInput(value);for(const [action,button]of buttons)button.setAttribute('aria-pressed',String([...held.values()].includes(action)||keyboardPointers.has(action)));});
 const clear=()=>{const captured=[...held.entries()];held.clear();keyboardPointers.clear();state.clear();for(const button of buttons.values())button.setAttribute('aria-pressed','false');for(const [pointerId,action]of captured){const button=buttons.get(action);try{if(button.hasPointerCapture(pointerId))button.releasePointerCapture(pointerId);}catch{}}};
 function bind(button,action){
  button.type='button';button.className='crate-touch-button'+(action==='jump'?' crate-touch-jump':'');button.dataset.direction=action;button.disabled=!enabled;button.setAttribute('aria-pressed','false');
  button.setAttribute('aria-label',{forward:'Move forward',backward:'Move backward',left:'Move left',right:'Move right',jump:'Jump'}[action]);
  button.textContent={forward:'↑',backward:'↓',left:'←',right:'→',jump:'Jump'}[action];buttons.set(action,button);
  button.addEventListener('pointerdown',event=>{if(!enabled||disposed)return;event.preventDefault();event.stopPropagation();button.focus({preventScroll:true});try{button.setPointerCapture(event.pointerId);}catch{}held.set(event.pointerId,action);state.press(event.pointerId,action);button.setAttribute('aria-pressed','true');});
  const release=event=>{event.preventDefault();event.stopPropagation();held.delete(event.pointerId);state.release(event.pointerId);button.setAttribute('aria-pressed',String([...held.values()].includes(action)||keyboardPointers.has(action)));try{if(button.hasPointerCapture(event.pointerId))button.releasePointerCapture(event.pointerId);}catch{}};
  button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
  button.addEventListener('keydown',event=>{if(!enabled||!['Space','Enter'].includes(event.code))return;event.preventDefault();event.stopPropagation();keyboardPointers.add(action);state.press('keyboard-'+action,action);button.setAttribute('aria-pressed','true');});
  button.addEventListener('keyup',event=>{if(!['Space','Enter'].includes(event.code))return;event.preventDefault();event.stopPropagation();keyboardPointers.delete(action);state.release('keyboard-'+action);button.setAttribute('aria-pressed',String([...held.values()].includes(action)));});
  button.addEventListener('blur',()=>{keyboardPointers.delete(action);state.release('keyboard-'+action);button.setAttribute('aria-pressed',String([...held.values()].includes(action)));});
  button.addEventListener('contextmenu',event=>event.preventDefault());button.addEventListener('click',event=>event.preventDefault());
 }
 for(const action of ['forward','left','right','backward']){const button=doc.createElement('button');bind(button,action);pad.append(button);}
 const jump=doc.createElement('button');bind(jump,'jump');root.append(pad,jump,caption);container.append(root);
 const visibility=()=>{if(doc.hidden)clear();};win.addEventListener('blur',clear);win.addEventListener('pagehide',clear);doc.addEventListener('visibilitychange',visibility);
 return {element:root,clear,dispose(){if(disposed)return;disposed=true;clear();state.dispose();win.removeEventListener('blur',clear);win.removeEventListener('pagehide',clear);doc.removeEventListener('visibilitychange',visibility);root.remove();}};
}
