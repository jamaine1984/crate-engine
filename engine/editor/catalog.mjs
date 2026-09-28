export function normalizeCatalog(data){
 const entries=[];
 if(Array.isArray(data))entries.push(...data.map(item=>[item?.file||item?.name,item]));
 else for(const [key,value]of Object.entries(data||{})){if(Array.isArray(value))entries.push(...value.map(item=>[item?.file||item?.name,{...item,cat:item?.cat||key}]));else if(value&&typeof value==='object')entries.push([key,value]);}
 const records=new Map();
 for(const [key,value]of entries){if(!value||typeof value!=='object')continue;let path=String(value.path||value.file||key||'').replace(/^\/+/, '');if(!path||path.includes('..')||/[\\?#%]/.test(path)||/^[a-z]+:/i.test(path)||/\.gltf$/i.test(path))continue;if(!/\.[a-z0-9]+$/i.test(path))path+='.glb';if(!path.startsWith('models/'))path='models/'+path;if(!/\.glb$/i.test(path))continue;records.set(path,{...value,file:path,path,name:String(value.name||key).slice(0,180),cat:String(value.cat||value.category||'Uncategorized').slice(0,100)});}
 return [...records.values()];
}
export function catalogCategories(items){const counts=new Map();for(const item of items)counts.set(item.cat,(counts.get(item.cat)||0)+1);return [...counts].sort(([a],[b])=>a.localeCompare(b));}
export function assetPage(items,{query='',category='',limit=80}={}){
 const needle=String(query).toLocaleLowerCase(),matches=items.filter(item=>(!category||item.cat===category)&&(!needle||`${item.name} ${item.cat||''}`.toLocaleLowerCase().includes(needle))),count=Math.max(1,Math.min(5000,Number.isFinite(limit)?Math.floor(limit):80));
 return {items:matches.slice(0,count),matches:matches.length,total:items.length,hasMore:matches.length>count};
}
