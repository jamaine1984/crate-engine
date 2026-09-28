let connection;
function database(){return connection??=new Promise((resolve,reject)=>{const request=indexedDB.open('crateship-engine-v4',1);request.onupgradeneeded=()=>{request.result.createObjectStore('projects',{keyPath:'id'});request.result.createObjectStore('assets');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Browser storage is unavailable. Export a project backup.'));});}
async function transaction(store,mode,action){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),request=action(tx.objectStore(store));let result;request.onsuccess=()=>result=request.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(new Error('Local save failed. Browser storage may be full; export a backup.'));});}
export const saveProject=project=>transaction('projects','readwrite',s=>s.put(project));
export const getProject=id=>transaction('projects','readonly',s=>s.get(id));
export const listProjects=async()=>(await transaction('projects','readonly',s=>s.getAll())).map(({id,name,updatedAt,entities})=>({id,name,updatedAt,objects:entities.length})).sort((a,b)=>b.updatedAt-a.updatedAt);
export const saveAsset=(id,bytes)=>transaction('assets','readwrite',s=>s.put(bytes,id));
export const getAsset=id=>transaction('assets','readonly',s=>s.get(id));
