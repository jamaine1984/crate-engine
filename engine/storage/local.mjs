let connection;
// Version 2 adds a single-slot crash-recovery store; existing projects and assets are untouched.
function database(){return connection??=new Promise((resolve,reject)=>{const request=indexedDB.open('crateship-engine-v4',2);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('projects'))db.createObjectStore('projects',{keyPath:'id'});if(!db.objectStoreNames.contains('assets'))db.createObjectStore('assets');if(!db.objectStoreNames.contains('recovery'))db.createObjectStore('recovery');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>{connection=null;reject(new Error('Browser storage is unavailable. Export a project backup.'));};request.onblocked=()=>{connection=null;reject(new Error('Close other Crate Engine tabs so browser storage can update.'));};});}
async function transaction(store,mode,action){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),request=action(tx.objectStore(store));let result;request.onsuccess=()=>result=request.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(new Error('Local save failed. Browser storage may be full; export a backup.'));});}
export const saveProject=project=>transaction('projects','readwrite',s=>s.put(project));
export const getProject=id=>transaction('projects','readonly',s=>s.get(id));
export const listProjects=async()=>(await transaction('projects','readonly',s=>s.getAll())).map(({id,name,updatedAt,entities})=>({id,name,updatedAt,objects:entities.length})).sort((a,b)=>b.updatedAt-a.updatedAt);
export const saveAsset=(id,bytes)=>transaction('assets','readwrite',s=>s.put(bytes,id));
export const getAsset=id=>transaction('assets','readonly',s=>s.get(id));
export const saveRecovery=record=>transaction('recovery','readwrite',s=>s.put(record,'current'));
export const getRecovery=()=>transaction('recovery','readonly',s=>s.get('current'));
export const clearRecovery=()=>transaction('recovery','readwrite',s=>s.delete('current'));
