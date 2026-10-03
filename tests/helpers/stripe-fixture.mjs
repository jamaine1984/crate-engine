import {readFile,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {sqliteD1} from '../../platform/dev/sqlite-d1.mjs';
import {base64url,tokenHash} from '../../platform/server/identity.mjs';
import {handleStripeCommerce} from '../../platform/server/stripe-commerce.mjs';
export const stamp=()=>Math.floor(Date.now()/1000);
const key=()=>base64url(crypto.getRandomValues(new Uint8Array(32)));
export async function actor(f,role='OWNER',mfa=true){
 const id=crypto.randomUUID(),token=key(),at=stamp();
 f.sql.prepare(`INSERT INTO platform_users(id,email,username,display_name,email_verified,status,created_at,updated_at) VALUES(?,?,?,?,1,'active',?,?)`).run(id,id+'@example.test','u_'+id,'Isolated payment fixture',at,at);
 f.sql.prepare('INSERT INTO platform_user_roles VALUES(?,?,?)').run(id,role,at);
 f.sql.prepare(`INSERT INTO platform_sessions(id,token_hash,user_id,created_at,expires_at,last_seen_at,auth_time,mfa_time,user_agent,ip_hash) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),await tokenHash(token),id,at,at+3600,at,at,mfa?at:null,'fixture','fixture');
 return {id,cookie:'__Host-crateship_session='+token};
}
export async function fixture(mode='test',creator=true){
 const sql=new DatabaseSync(':memory:'),dir=new URL('../../platform/migrations/',import.meta.url);
 for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())sql.exec(await readFile(new URL(name,dir),'utf8'));
 const f={sql,env:{PLATFORM_DB:sqliteD1(sql),APP_ORIGIN:'https://crateshipgames.com',AUTH_SECRET:key(),STRIPE_MODE:mode,STRIPE_SECRET_KEY:'sk_'+mode+'_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_LIVE_APPROVED:'true',COMMERCE_POLICY_VERSION:'fixture-v1',STRIPE_DELIVERY_READY:'true'}};
 f.buyer=await actor(f);f.seller=await actor(f,'DEVELOPER');f.gameId=crypto.randomUUID();f.versionId=crypto.randomUUID();f.agreementId=crypto.randomUUID();f.agreementVersionId=crypto.randomUUID();
 const at=stamp();
 sql.prepare(`INSERT INTO platform_games(id,slug,developer_id,title,kind,status,price_minor,active_version_id,created_at,updated_at) VALUES(?,?,?,'CrateShip isolated sandbox game','web','published',999,?,?,?)`).run(f.gameId,'sandbox-'+f.gameId,f.seller.id,f.versionId,at,at);
 sql.prepare(`INSERT INTO platform_game_versions(id,game_id,version,platform,status,scan_status,uploaded_by,created_at) VALUES(?,?,'1.0.0','web','published','clean',?,?)`).run(f.versionId,f.gameId,f.seller.id,at);
 sql.prepare('INSERT INTO platform_agreements VALUES(?,?,?,?,?,?)').run(f.agreementId,'Fixture terms',creator?'creator_revenue_share':'platform_owned',creator?f.seller.id:null,f.buyer.id,at);
 sql.prepare(`INSERT INTO platform_agreement_versions(id,agreement_id,version,terms_json,effective_at,created_by,created_at) VALUES(?,?,1,?,?,?,?)`).run(f.agreementVersionId,f.agreementId,JSON.stringify({premium_sales:{creatorBps:creator?8000:0,platformBps:creator?2000:10000}}),at-10,f.buyer.id,at);
 sql.prepare('INSERT INTO platform_game_agreements VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),f.gameId,f.agreementVersionId,at-10,null,f.buyer.id,at);
 if(creator){sql.prepare('INSERT INTO platform_stripe_accounts(user_id,mode,account_id,created_at,updated_at) VALUES(?,?,?,?,?)').run(f.seller.id,mode,'acct_fixture',at,at);sql.prepare('INSERT INTO platform_seller_acceptances VALUES(?,?,?,?)').run(f.seller.id,f.agreementVersionId,'fixture-v1',at);}
 sql.exec("UPDATE platform_feature_flags SET enabled=1 WHERE key IN ('STRIPE_ENABLED','PAYMENTS_ENABLED','PREMIUM_SALES_ENABLED')");
 return f;
}
export function request(f,path,user=f.buyer,method='GET',body){return new Request(f.env.APP_ORIGIN+'/api/platform'+path,{method,headers:{origin:f.env.APP_ORIGIN,'content-type':'application/json',...(user?{cookie:user.cookie}:{})},...(!['GET','HEAD'].includes(method)?{body:JSON.stringify(body||{})}:{})});}
export const call=(f,path,user=f.buyer,method='GET',body)=>handleStripeCommerce(request(f,path,user,method,body),f.env,path);
