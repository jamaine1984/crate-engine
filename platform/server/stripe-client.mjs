/** Server-only Stripe REST client; no key is ever returned to the website. */
import {HttpError, now} from './common.mjs';
export const STRIPE_API_VERSION='2026-09-30.endive';
const fail=(status,message,code='STRIPE_UNAVAILABLE')=>{throw new HttpError(status,message,code);};
export function stripeConfiguration(env){
 const mode=env.STRIPE_MODE;
 if(!['test','live'].includes(mode)||typeof env.STRIPE_SECRET_KEY!=='string'||!env.STRIPE_SECRET_KEY.startsWith(`sk_${mode}_`))return {configured:false,mode:null,live:false};
 const live=mode==='live'&&env.STRIPE_LIVE_APPROVED==='true'&&typeof env.COMMERCE_POLICY_VERSION==='string'&&!/draft/i.test(env.COMMERCE_POLICY_VERSION)&&env.COMMERCE_POLICY_VERSION.length>3&&env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_');
 return {configured:true,mode,live:Boolean(live)};
}
export async function stripeRequest(env,path,{method='GET',fields={},idempotencyKey}={}){
 const config=stripeConfiguration(env);if(!config.configured)fail(503,'Stripe has not been connected yet.');
 if(!/^\/[a-z0-9_/?=&%.[\]-]+$/i.test(path))fail(500,'Invalid provider request.');
 const headers={Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'Stripe-Version':STRIPE_API_VERSION};
 if(idempotencyKey)headers['Idempotency-Key']=idempotencyKey;
 let response;try{response=await fetch('https://api.stripe.com/v1'+path,{method,headers:{...headers,...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:method==='POST'?new URLSearchParams(Object.entries(fields).filter(([,v])=>v!=null).map(([k,v])=>[k,String(v)])):undefined,signal:AbortSignal.timeout(15000)});}catch{fail(503,'Stripe could not be reached. Please try again with the same request.');}
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data)fail(502,'Stripe could not complete this request. Check the Stripe Dashboard for requirements.','STRIPE_REQUEST_FAILED');
 return data;
}
export async function verifyStripeEvent(request,env){
 if(!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'))fail(503,'Webhook verification has not been configured.');
 const signature=request.headers.get('stripe-signature')||'';
 const fields=signature.split(',').map(p=>p.split('=')),stamp=Number(fields.find(([k])=>k==='t')?.[1]);
 const candidates=fields.filter(([k,v])=>k==='v1'&&/^[a-f0-9]{64}$/.test(v||'')).map(([,v])=>v);
 if(!Number.isSafeInteger(stamp)||Math.abs(now()-stamp)>300||!candidates.length)fail(400,'Invalid webhook signature.','INVALID_SIGNATURE');
 if(Number(request.headers.get('content-length')||0)>1048576)fail(413,'Webhook is too large.');
 const reader=request.body?.getReader();if(!reader)fail(400,'Missing webhook body.');let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576){await reader.cancel();fail(413,'Webhook is too large.');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 const raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes),encoder=new TextEncoder();
 const key=await crypto.subtle.importKey('raw',encoder.encode(env.STRIPE_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const digest=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(`${stamp}.${raw}`)));
 const expected=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
 if(!candidates.some(candidate=>{let delta=0;for(let i=0;i<64;i++)delta|=candidate.charCodeAt(i)^expected.charCodeAt(i);return delta===0;}))fail(400,'Invalid webhook signature.','INVALID_SIGNATURE');
 let event;try{event=JSON.parse(raw);}catch{fail(400,'Invalid webhook JSON.');}
 const config=stripeConfiguration(env);
 if(!config.configured||event.livemode!==(config.mode==='live')||!/^evt_[A-Za-z0-9]+$/.test(event.id||'')||!event.data?.object)fail(400,'Webhook account mode or payload does not match.');
 return event;
}
