export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const icon = name => `<i class="ph ph-${esc(name)}" aria-hidden="true"></i>`;
export const link = (href, text, cls='btn', extra='') => `<a href="${esc(href)}" class="${cls}" ${extra}>${text}</a>`;
export const btn = (action,text,cls='btn',extra='') => `<button type="button" data-action="${esc(action)}" class="${cls}" ${extra}>${text}</button>`;
export const badge = (text,type='') => `<span class="badge ${type}">${esc(text)}</span>`;
export const notice = (text,error=false) => `<div class="notice ${error?'error':''}">${icon(error?'warning-circle':'info')}<p>${text}</p></div>`;
export const head = (title,description='',action='') => `<div class="page-head"><div><h1>${esc(title)}</h1>${description?`<p>${esc(description)}</p>`:''}</div>${action}</div>`;
export const empty = (title,description,action='',symbol='game-controller') => `<div class="empty-page">${icon(symbol)}<h2>${esc(title)}</h2><p>${esc(description)}</p>${action}</div>`;
export const loading = () => `<div class="loader" role="status">${icon('circle-notch')}Loading…</div>`;
export const feedback = () => '<div class="form-feedback" role="status" aria-live="polite"></div>';
export const input = (name,label,type='text',value='',extra='') => `<label>${esc(label)}<input name="${esc(name)}" type="${type}" value="${esc(value)}" ${extra}></label>`;
export const textArea = (name,label,value='',extra='') => `<label>${esc(label)}<textarea name="${esc(name)}" ${extra}>${esc(value)}</textarea></label>`;
export const select = (name,label,options,value='') => `<label>${esc(label)}<select name="${esc(name)}">${options.map(([v,t])=>`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
export const date = value => {const v=typeof value==='number'&&value<1e12?value*1000:value;return v && !Number.isNaN(new Date(v).valueOf()) ? new Date(v).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}) : 'Not recorded';};
export const money = (cents,currency='USD') => { try { return new Intl.NumberFormat(undefined,{style:'currency',currency}).format(Number(cents)/100); } catch {return 'Price unavailable';} };
export function safeImage(value,fallback='/platform/media/world-hero.png') {if(typeof value!=='string'||!value.trim())return fallback;try{const u=new URL(value,location.origin);return ['https:','http:'].includes(u.protocol)&&!value.startsWith('//')?u.href:fallback;}catch{return fallback;}}
export function gameCard(game) {
  const id=game.id||game.gameId||game.slug; const slug=game.slug||id;
  const premium=game.kind==='premium'||game.distributionType==='premium'||game.priceCents>0;
  return `<article class="game-card"><a href="/game/${encodeURIComponent(slug)}"><img class="game-cover" src="${esc(safeImage(game.coverUrl||game.coverImage||game.artworkUrl))}" alt="${esc(game.title||'Game')}" loading="lazy"><div class="game-card-body"><h3>${esc(game.title||'Untitled game')}</h3><div class="game-tags"><span>${esc(game.genre||game.tags?.[0]||'Independent')}</span>${premium?`<span class="price">${game.priceCents!=null?esc(money(game.priceCents,game.currency)):'Premium'}</span>`:badge(game.adsEnabled?'Free + ads':'Free')}</div></div></a>${btn('favorite',icon('heart'),'favorite-btn',`data-id="${esc(id)}" aria-label="Favorite ${esc(game.title||'game')}" aria-pressed="${Boolean(game.isFavorite)}"`)}</article>`;
}
export const gameGrid = games => `<div class="game-grid">${games.map(gameCard).join('')}</div>`;
export function table(columns,rows){return `<div class="table-wrap"><table><thead><tr>${columns.map(c=>`<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
export function downloadJson(value,name) {const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
