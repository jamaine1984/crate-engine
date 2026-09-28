// Shared by editor preview and exported games: score, lives, short notices and the win/lose screen.
// All text is set with textContent; nothing from a project is ever parsed as HTML.
const styles=`
.crate-hud{position:absolute;inset:0;pointer-events:none;z-index:25;font:600 14px system-ui,sans-serif;color:#f4f8ef}
.crate-hud-stats{position:absolute;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));display:flex;gap:8px}
.crate-hud-pill{padding:6px 11px;border-radius:999px;background:#0f1d16d9;border:1px solid #86a68b66;box-shadow:0 3px 10px #0005;letter-spacing:.02em}
.crate-hud-pill[hidden]{display:none}
.crate-hud-notice{position:absolute;top:18%;left:50%;transform:translateX(-50%);padding:8px 16px;border-radius:10px;background:#f09145;color:#1a1208;font-weight:800;opacity:0;transition:opacity .25s ease}
.crate-hud-notice[data-show=true]{opacity:1}
.crate-hud-screen{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:#07100bcc;pointer-events:auto}
.crate-hud-screen[data-open=true]{display:flex}
.crate-hud-card{min-width:min(320px,86vw);max-width:86vw;padding:26px 24px;border-radius:18px;background:#13241b;border:1px solid #86a68b88;text-align:center;box-shadow:0 18px 50px #0008}
.crate-hud-card h2{margin:0 0 6px;font-size:26px;overflow-wrap:anywhere}
.crate-hud-card p{margin:0 0 18px;color:#c8d6c9;font-weight:500}
.crate-hud-card button{font:700 15px system-ui,sans-serif;padding:11px 20px;border-radius:10px;border:0;background:#f09145;color:#1a1208;cursor:pointer;min-height:44px}
.crate-hud-card button+button{margin-left:8px;background:#2a4234;color:#eef4ea}
.crate-hud-card button:focus-visible{outline:3px solid #ffba7c;outline-offset:3px}
@media(prefers-reduced-motion:reduce){.crate-hud-notice{transition:none}}
`;
export function mountGameHud(container,{maxLives=0,onRestart=null,onExit=null,exitLabel='Back to editing'}={}){
 if(!container)return {handle(){},dispose(){}};
 const doc=container.ownerDocument;
 if(!doc.getElementById('crate-hud-styles')){const style=doc.createElement('style');style.id='crate-hud-styles';style.textContent=styles;doc.head.append(style);}
 const make=(tag,className,text)=>{const el=doc.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
 const root=make('div','crate-hud'),stats=make('div','crate-hud-stats'),scorePill=make('span','crate-hud-pill','Score 0'),livesPill=make('span','crate-hud-pill'),notice=make('div','crate-hud-notice'),screen=make('div','crate-hud-screen'),card=make('div','crate-hud-card'),title=make('h2'),detail=make('p'),actions=make('div');
 root.setAttribute('aria-live','polite');screen.setAttribute('role','dialog');screen.setAttribute('aria-modal','true');
 livesPill.hidden=!maxLives;livesPill.textContent='Lives '+maxLives;
 stats.append(scorePill,livesPill);card.append(title,detail,actions);screen.append(card);root.append(stats,notice,screen);container.append(root);
 let noticeTimer=0,disposed=false;
 function flash(text){notice.textContent=text;notice.dataset.show='true';clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{notice.dataset.show='false';},1400);}
 function button(label,action){const el=make('button',null,label);el.type='button';el.addEventListener('click',()=>{if(!disposed)action();});actions.append(el);return el;}
 function open(heading,text){title.textContent=heading;detail.textContent=text;actions.replaceChildren();const first=onRestart?button('Play again',onRestart):null;if(onExit)button(exitLabel,onExit);screen.dataset.open='true';first?.focus();}
 function handle(event){
  if(disposed||!event)return;
  if(Number.isFinite(event.score))scorePill.textContent='Score '+event.score;
  if(maxLives&&Number.isFinite(event.lives))livesPill.textContent='Lives '+event.lives;
  if(event.type==='checkpoint')flash('Checkpoint!');
  else if(event.type==='respawn')flash(maxLives?'Ouch! '+event.lives+' '+(event.lives===1?'life':'lives')+' left':'Try again!');
  else if(event.type==='win')open(event.message||'Level complete!','Score '+(event.score||0));
  else if(event.type==='lose')open('Game over','Score '+(event.score||0));
 }
 return {handle,dispose(){if(disposed)return;disposed=true;clearTimeout(noticeTimer);root.remove();}};
}
