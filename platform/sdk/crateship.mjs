/** Import inside an isolated published game. No cookies or account tokens are exposed. */
export function createCrateShipSDK(parentOrigin) {
 const expected=new URL(parentOrigin).origin;
 if(!/^https:/.test(expected)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(expected))throw new Error('A secure parent origin is required.');
 const pending=new Map();let closed=false;
 const listener=event=>{if(event.source!==parent||event.origin!==expected||event.data?.channel!=='crateship-v1')return;const item=pending.get(event.data.id);if(!item)return;clearTimeout(item.timer);pending.delete(event.data.id);event.data.error?item.reject(new Error(event.data.error)):item.resolve(event.data.result);};
 addEventListener('message',listener);
 const request=(action,payload={})=>new Promise((resolve,reject)=>{if(closed)return reject(new Error('SDK is closed.'));const id=crypto.randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(new Error('Platform request timed out.'));},15000);pending.set(id,{resolve,reject,timer});parent.postMessage({channel:'crateship-v1',id,action,payload},expected);});
 return Object.freeze({ready:()=>request('ready'),loadProgress:()=>request('progress.load'),saveProgress:(progress,revision)=>request('progress.save',{progress,revision}),configuration:()=>request('configuration'),pause:()=>request('pause'),resume:()=>request('resume'),requestRewardedAd:()=>request('ads.rewarded'),destroy(){closed=true;removeEventListener('message',listener);for(const item of pending.values()){clearTimeout(item.timer);item.reject(new Error('SDK closed.'));}pending.clear();}});
}
