import {HttpError,json,readJson,id,now,database,appOrigin,requireMutationOrigin,audit} from './common.mjs';
import {requireUser,requireRole} from './identity.mjs';
import {rate,ownGame,demandFlag} from './data.mjs';
import {stripeConfiguration,stripeRequest,verifyStripeEvent} from './stripe-client.mjs';
const fail=(status,message,code='COMMERCE_BLOCKED')=>{throw new HttpError(status,message,code);};
const roles=['OWNER','DEVELOPER','PARTNER_DEVELOPER'];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const all=async query=>(await query.all()).results||[];
export function commerceStatus(env){const c=stripeConfiguration(env);return {connected:c.configured,mode:c.mode,checkoutEnabled:c.live&&env.STRIPE_DELIVERY_READY==='true',creatorSharePercent:80,platformSharePercent:20,currency:'USD',sellerCountries:['US'],downloadsEnabled:false};}
async function access(request,env,{seller=false}={}){
 const c=stripeConfiguration(env);if(!c.configured)fail(503,'Stripe setup is in progress.');
 const user=c.mode==='test'?await requireRole(request,env,['OWNER'],{mfa:true}):seller?await requireRole(request,env,roles):await requireUser(request,env);
 if(!user.emailVerified)fail(403,'Verify your email first.');
 if(c.mode==='live'&&!c.live)fail(503,'Live commerce is not open yet.');return {user,...c};
}
async function syncAccount(env,userId,mode){
 const db=database(env),row=await db.prepare('SELECT * FROM platform_stripe_accounts WHERE user_id=? AND mode=?').bind(userId,mode).first();if(!row)return null;
 const account=await stripeRequest(env,'/accounts/'+row.account_id);
 if(account.id!==row.account_id||account.country!=='US')fail(409,'This launch supports US seller accounts only.');
 await db.prepare('UPDATE platform_stripe_accounts SET charges_enabled=?,payouts_enabled=?,details_submitted=?,updated_at=? WHERE user_id=? AND mode=?').bind(account.charges_enabled?1:0,account.payouts_enabled?1:0,account.details_submitted?1:0,now(),userId,mode).run();
 return {accountId:account.id,chargesEnabled:!!account.charges_enabled,payoutsEnabled:!!account.payouts_enabled,detailsSubmitted:!!account.details_submitted,requirementsDue:account.requirements?.currently_due?.length||0};
}
async function assignedAgreement(db,game,at){
 const matches=await all(db.prepare(`SELECT v.*,a.creator_id,a.type FROM platform_game_agreements ga JOIN platform_agreement_versions v ON v.id=ga.version_id JOIN platform_agreements a ON a.id=v.agreement_id
 WHERE ga.game_id=? AND ga.effective_at<=? AND (ga.end_at IS NULL OR ga.end_at>?) AND v.effective_at<=? AND (v.end_at IS NULL OR v.end_at>?)`).bind(game.id,at,at,at,at));
 if(matches.length!==1)fail(409,'An effective game sales agreement is required.');const agreement=matches[0];
 let terms;try{terms=JSON.parse(agreement.terms_json).premium_sales;}catch{fail(409,'The game agreement needs owner review.');}
 const platformOwned=agreement.type==='platform_owned';
 if(agreement.currency!=='USD'||(platformOwned?(agreement.creator_id||terms?.creatorBps!==0||terms?.platformBps!==10000):(agreement.creator_id!==game.developer_id||terms?.creatorBps!==8000||terms?.platformBps!==2000)))fail(409,'This game needs an approved USD sales agreement: 80% creator and 20% platform, or platform-owned.');
 return agreement;
}
async function checkout(request,env){
 requireMutationOrigin(request,env);const {user,mode}=await access(request,env);const db=database(env),b=await readJson(request,1500);
 if(mode==='live')for(const key of ['STRIPE_ENABLED','PAYMENTS_ENABLED','PREMIUM_SALES_ENABLED'])await demandFlag(env,key);
 if(!uuid.test(b.requestKey||'')||typeof b.gameId!=='string')fail(400,'A game and checkout request ID are required.');
 await rate(env,user.id,'stripe-checkout',10,60);
 const game=await db.prepare(`SELECT g.* FROM platform_games g JOIN platform_game_versions v ON v.id=g.active_version_id AND v.game_id=g.id
 WHERE g.id=? AND g.status='published' AND g.kind IN ('web','both') AND v.status='published' AND v.scan_status='clean' AND v.platform='web'`).bind(b.gameId).first();
 if(!game||game.currency!=='USD'||!Number.isSafeInteger(game.price_minor)||game.price_minor<199||game.price_minor>99999)fail(409,'Choose a reviewed browser game priced from $1.99 to $999.99 USD.');
 if(mode==='live'&&env.STRIPE_DELIVERY_READY!=='true')fail(503,'Licensed game delivery is not ready.');
 const license=await db.prepare("SELECT id FROM platform_licenses WHERE user_id=? AND game_id=? AND status='active'").bind(user.id,game.id).first();if(license&&mode==='live')return json({owned:true,gameSlug:game.slug});
 const at=now(),agreement=await assignedAgreement(db,game,at);let destination=null;
 if(agreement.creator_id){
  if(mode==='live'&&!await db.prepare('SELECT 1 FROM platform_seller_acceptances WHERE user_id=? AND agreement_version_id=? AND policy_version=?').bind(agreement.creator_id,agreement.id,env.COMMERCE_POLICY_VERSION).first())fail(409,'The creator must accept the effective seller agreement.');
  const seller=await syncAccount(env,agreement.creator_id,mode);if(!seller?.chargesEnabled||!seller.payoutsEnabled)fail(409,'The creator must finish Stripe verification before sales can open.');destination=seller.accountId;
 }
 const creatorMinor=agreement.creator_id?Number(BigInt(game.price_minor)*8000n/10000n):0,orderId=id();
 await db.prepare(`INSERT INTO platform_stripe_orders(id,user_id,game_id,request_key,mode,agreement_version_id,creator_id,destination_account,gross_minor,creator_minor,platform_minor,currency,created_at,updated_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`).bind(orderId,user.id,game.id,b.requestKey,mode,agreement.id,agreement.creator_id,destination,game.price_minor,creatorMinor,game.price_minor-creatorMinor,'USD',at,at).run();
 const order=await db.prepare("SELECT * FROM platform_stripe_orders WHERE user_id=? AND mode=? AND (request_key=? OR (game_id=? AND status IN ('creating','pending'))) ORDER BY CASE WHEN request_key=? THEN 0 ELSE 1 END LIMIT 1").bind(user.id,mode,b.requestKey,game.id,b.requestKey).first();if(!order||order.game_id!==game.id)fail(409,'This checkout ID belongs to another game.');
 if(order.status==='paid')return json({owned:mode==='live',testPaymentComplete:mode==='test',gameSlug:game.slug});
 if(!['creating','pending'].includes(order.status))fail(409,'Start a new checkout for this game.');
 if(!order.session_id&&now()>order.created_at+1800){await db.prepare("UPDATE platform_stripe_orders SET status='expired',updated_at=? WHERE id=? AND status='creating' AND session_id IS NULL").bind(now(),order.id).run();fail(409,'Checkout expired. Click Buy again to start a fresh checkout.');}
 if(order.session_id){await fulfill(env,order.session_id);const current=await db.prepare('SELECT status FROM platform_stripe_orders WHERE id=?').bind(order.id).first();if(current.status==='paid')return json({owned:mode==='live',testPaymentComplete:mode==='test',gameSlug:game.slug});if(current.status==='expired')fail(409,'Checkout expired. Click Buy again to start a fresh checkout.');return json({url:order.checkout_url,orderId:order.id,mode});}
 const origin=appOrigin(env).origin,fields={mode:'payment','line_items[0][price_data][currency]':'usd','line_items[0][price_data][product_data][name]':game.title,'line_items[0][price_data][unit_amount]':order.gross_minor,'line_items[0][quantity]':1,client_reference_id:order.id,'metadata[crate_order]':order.id,'metadata[crate_app]':'crateshipgames','payment_intent_data[metadata][crate_order]':order.id,'payment_intent_data[metadata][crate_app]':'crateshipgames',success_url:`${origin}/checkout/return?order=${encodeURIComponent(order.id)}`,cancel_url:`${origin}/game/${encodeURIComponent(game.slug)}?checkout=cancelled`,expires_at:order.created_at+3600};
 if(order.destination_account){fields['payment_intent_data[transfer_data][destination]']=order.destination_account;fields['payment_intent_data[application_fee_amount]']=order.platform_minor;}
 const session=await stripeRequest(env,'/checkout/sessions',{method:'POST',fields,idempotencyKey:'crate-order-'+order.id});
 if(session.livemode!==(mode==='live')||!session.id?.startsWith('cs_')||!session.url?.startsWith('https://checkout.stripe.com/'))fail(502,'Stripe returned an unexpected checkout.');
 await db.prepare("UPDATE platform_stripe_orders SET session_id=?,checkout_url=?,status=CASE WHEN status='creating' THEN 'pending' ELSE status END,updated_at=? WHERE id=?").bind(session.id,session.url,now(),order.id).run();return json({url:session.url,orderId:order.id,mode});
}
async function fulfill(env,sessionId){
 if(!/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(sessionId||''))fail(400,'Invalid checkout session.');
 const db=database(env),session=await stripeRequest(env,'/checkout/sessions/'+sessionId+'?expand[]=payment_intent.latest_charge.balance_transaction');
 const order=await db.prepare('SELECT * FROM platform_stripe_orders WHERE id=?').bind(session.metadata?.crate_order||'').first();
 if(!order||session.metadata?.crate_app!=='crateshipgames'||session.client_reference_id!==order.id||session.livemode!==(order.mode==='live')||session.mode!=='payment'||session.amount_total!==order.gross_minor||session.currency!=='usd'||(order.session_id&&order.session_id!==session.id))fail(409,'Checkout does not match its stored order.');
 if(session.status==='expired'){await db.prepare("UPDATE platform_stripe_orders SET status='expired',updated_at=? WHERE id=? AND status IN ('creating','pending')").bind(now(),order.id).run();return;}
 if(session.status!=='complete'||session.payment_status!=='paid')return;
 const intent=session.payment_intent,charge=intent?.latest_charge;
 if(!intent?.id||intent.status!=='succeeded'||intent.metadata?.crate_order!==order.id||intent.metadata?.crate_app!=='crateshipgames'||intent.currency!=='usd'||intent.amount_received!==order.gross_minor||!charge?.paid||!charge.captured)fail(409,'Payment is not eligible for game access.');
 if(order.destination_account?(intent.transfer_data?.destination!==order.destination_account||intent.application_fee_amount!==order.platform_minor):(intent.transfer_data?.destination||intent.application_fee_amount))fail(409,'Payment split does not match the stored order.');
 if(order.status==='failed')return;
 const fees=charge.balance_transaction?.fee;
 if(!Number.isSafeInteger(fees)||fees<0||charge.balance_transaction.currency!=='usd')fail(503,'Stripe processing fees are not finalized yet. Retry fulfillment.');
 const currentStatus=charge.disputed?'disputed':charge.amount_refunded>0?'refunded':'paid';
 const at=now(),statements=[db.prepare("UPDATE platform_stripe_orders SET session_id=?,payment_intent_id=?,status=CASE WHEN status IN ('refunded','disputed') THEN status ELSE ? END,fees_minor=?,updated_at=? WHERE id=? AND status!='failed'").bind(session.id,intent.id,currentStatus,fees,at,order.id)];
 if(order.mode==='live'){
  if(!stripeConfiguration(env).live)fail(503,'Live payment fulfillment awaits commerce activation.');
  const revenueId='stripe-sale-'+order.id;
  statements.push(
   db.prepare(`INSERT INTO platform_purchases(id,user_id,provider_reference,status,currency,total_minor,created_at) SELECT id,user_id,?,status,currency,gross_minor,? FROM platform_stripe_orders WHERE id=? AND status IN ('paid','refunded','disputed') ON CONFLICT(provider_reference) DO NOTHING`).bind(intent.id,at,order.id),
   db.prepare(`INSERT INTO platform_licenses(id,user_id,game_id,purchase_id,status,created_at) SELECT ?,o.user_id,o.game_id,o.id,'active',? FROM platform_stripe_orders o JOIN platform_users u ON u.id=o.user_id WHERE o.id=? AND o.status='paid' AND u.status='active' ON CONFLICT(user_id,game_id,purchase_id) DO NOTHING`).bind('stripe-license-'+order.id,at,order.id),
   db.prepare(`INSERT INTO platform_library(user_id,game_id,source,created_at) SELECT user_id,game_id,'verified_purchase',? FROM platform_stripe_orders WHERE id=? AND status='paid' ON CONFLICT(user_id,game_id) DO UPDATE SET source='verified_purchase'`).bind(at,order.id),
   // Allocate the agreed share before processor costs. Fees are a separate, platform-only adjustment.
   db.prepare(`INSERT INTO platform_revenue_events(id,game_id,creator_id,agreement_version_id,provider,provider_reference,type,currency,gross_minor,fees_minor,eligible_minor,creator_minor,platform_minor,status,occurred_at,created_at)
   SELECT ?,game_id,creator_id,agreement_version_id,'stripe',?,'premium_sales',currency,gross_minor,0,gross_minor,creator_minor,platform_minor,'finalized',?,? FROM platform_stripe_orders WHERE id=? AND status IN ('paid','refunded','disputed') ON CONFLICT(provider,provider_reference) DO NOTHING`).bind(revenueId,intent.id,charge.created,at,order.id),
   db.prepare(`INSERT INTO platform_revenue_adjustments(id,event_id,provider_reference,creator_delta_minor,platform_delta_minor,reason,actor_id,created_at) SELECT ?,id,?,0,?,'Stripe processing fee paid by platform','stripe',? FROM platform_revenue_events WHERE id=? ON CONFLICT(provider_reference) DO NOTHING`).bind(id(),'stripe-fee-'+intent.id,-fees,at,revenueId),
   db.prepare(`INSERT INTO platform_creator_obligations(id,event_id,creator_id,amount_minor,currency,status,created_at) SELECT ?,id,creator_id,creator_minor,currency,'finalized',? FROM platform_revenue_events WHERE id=? AND creator_id IS NOT NULL AND creator_minor>0 ON CONFLICT(event_id) DO NOTHING`).bind(id(),at,revenueId)
  );
 }
 await db.batch(statements);
 if(currentStatus!=='paid')await reconcileCharge(env,charge.id);
}
async function reconcileCharge(env,chargeId){
 const db=database(env),charge=await stripeRequest(env,'/charges/'+chargeId),intentId=typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent?.id;
 let order=await db.prepare('SELECT * FROM platform_stripe_orders WHERE payment_intent_id=?').bind(intentId||'').first();
 // A refund notification may precede Checkout's completion webhook. Resolve only
 // a known CrateShip order and verify its Checkout session before recording it.
 if(!order&&charge.metadata?.crate_app==='crateshipgames'&&charge.metadata?.crate_order){
  const pending=await db.prepare('SELECT session_id FROM platform_stripe_orders WHERE id=?').bind(charge.metadata.crate_order).first();
  if(pending?.session_id){await fulfill(env,pending.session_id);order=await db.prepare('SELECT * FROM platform_stripe_orders WHERE payment_intent_id=?').bind(intentId||'').first();}
 }
 if(!order)return;
 if(charge.livemode!==(order.mode==='live')||charge.amount!==order.gross_minor||charge.currency!=='usd')fail(409,'Charge reconciliation mismatch.');
 const status=charge.disputed?'disputed':charge.amount_refunded>0?'refunded':'paid',at=now();
 const refunded=Math.max(order.refunded_minor,charge.amount_refunded||0);
 // Any refund or dispute suspends access. Restoration after a won dispute is an owner-reviewed operation.
 if(status==='paid')return;
 const statements=[db.prepare('UPDATE platform_stripe_orders SET status=?,refunded_minor=MAX(refunded_minor,?),updated_at=? WHERE id=?').bind(status,refunded,at,order.id)];
 if(order.mode==='live'){
  const revenueId='stripe-sale-'+order.id,creatorRefund=Number(BigInt(order.creator_minor)*BigInt(refunded)/BigInt(order.gross_minor)),platformRefund=refunded-creatorRefund;
  statements.push(db.prepare('UPDATE platform_purchases SET status=? WHERE id=?').bind(status,order.id),db.prepare("UPDATE platform_licenses SET status='revoked' WHERE purchase_id=?").bind(order.id),db.prepare('DELETE FROM platform_library WHERE user_id=? AND game_id=? AND NOT EXISTS(SELECT 1 FROM platform_licenses WHERE user_id=? AND game_id=? AND status=?)').bind(order.user_id,order.game_id,order.user_id,order.game_id,'active'),db.prepare("UPDATE platform_creator_obligations SET status='held' WHERE event_id=?").bind(revenueId));
  if(refunded>0)statements.push(db.prepare(`INSERT INTO platform_revenue_adjustments(id,event_id,provider_reference,creator_delta_minor,platform_delta_minor,reason,actor_id,created_at)
   SELECT ?,r.id,?,?-COALESCE((SELECT SUM(creator_delta_minor) FROM platform_revenue_adjustments WHERE event_id=r.id AND reason='Stripe sale refund'),0),
   ?-COALESCE((SELECT SUM(platform_delta_minor) FROM platform_revenue_adjustments WHERE event_id=r.id AND reason='Stripe sale refund'),0),
   'Stripe sale refund','stripe',? FROM platform_revenue_events r WHERE r.id=?
   AND ? > -COALESCE((SELECT SUM(creator_delta_minor+platform_delta_minor) FROM platform_revenue_adjustments WHERE event_id=r.id AND reason='Stripe sale refund'),0)
   ON CONFLICT(provider_reference) DO NOTHING`).bind(id(),`stripe-refund-${intentId}-${refunded}`,-creatorRefund,-platformRefund,at,revenueId,refunded));
 }
 // Refund/transfer reversals are performed through Stripe's reviewed workflow, never from an untrusted browser.
 await db.batch(statements);
}
async function webhook(request,env){
 const event=await verifyStripeEvent(request,env),db=database(env);if(event.account)return json({received:true,ignored:true});
 if(await db.prepare('SELECT 1 FROM platform_stripe_events WHERE event_id=?').bind(event.id).first())return json({received:true});
 if(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired'].includes(event.type)&&event.data.object.metadata?.crate_app==='crateshipgames')await fulfill(env,event.data.object.id);
 if(['charge.refunded','charge.dispute.created','charge.dispute.closed'].includes(event.type)){
  const obj=event.data.object,chargeId=event.type.startsWith('charge.dispute.')?(typeof obj.charge==='string'?obj.charge:obj.charge?.id):obj.id;
  if(!/^ch_[A-Za-z0-9]+$/.test(chargeId||''))fail(400,'Invalid charge.');await reconcileCharge(env,chargeId);
 }
 await db.prepare('INSERT OR IGNORE INTO platform_stripe_events VALUES(?,?,?,?)').bind(event.id,stripeConfiguration(env).mode,event.type,now()).run();return json({received:true});
}
export async function handleStripeCommerce(request,env,path){
 if(path==='/stripe/webhook'&&request.method==='POST')return webhook(request,env);
 if(path==='/checkout'&&request.method==='POST')return checkout(request,env);
 if(path==='/owner/stripe'&&request.method==='GET'){await requireRole(request,env,['OWNER'],{mfa:true});return json({...commerceStatus(env),webhookConfigured:!!env.STRIPE_WEBHOOK_SECRET,deliveryReady:env.STRIPE_DELIVERY_READY==='true',policyVersion:env.COMMERCE_POLICY_VERSION||null});}
 const orderMatch=/^\/checkout\/orders\/([^/]+)$/.exec(path);
 if(orderMatch&&request.method==='GET'){
  const {user,mode}=await access(request,env),db=database(env);await rate(env,user.id,'checkout-status',20,60);
  let order=await db.prepare('SELECT o.*,g.slug FROM platform_stripe_orders o JOIN platform_games g ON g.id=o.game_id WHERE o.id=? AND o.user_id=? AND o.mode=?').bind(orderMatch[1],user.id,mode).first();if(!order)fail(404,'Order not found.');
  if(order.session_id&&['pending','creating'].includes(order.status)){await fulfill(env,order.session_id);order={...order,...await db.prepare('SELECT status FROM platform_stripe_orders WHERE id=?').bind(order.id).first()};}
  return json({order:{id:order.id,status:order.status,mode:order.mode,gameSlug:order.slug,totalMinor:order.gross_minor,currency:order.currency},licensed:order.mode==='live'&&order.status==='paid'});
 }
 if(path==='/seller/stripe'&&request.method==='GET'){const {user,mode}=await access(request,env,{seller:true});await rate(env,user.id,'stripe-status',20,60);return json({mode,account:await syncAccount(env,user.id,mode),policyVersion:env.COMMERCE_POLICY_VERSION||null});}
 if(path==='/seller/agreements'&&request.method==='GET'){
  const {user}=await access(request,env,{seller:true}),db=database(env);
  const agreements=await all(db.prepare(`SELECT DISTINCT v.id,v.version,v.terms_json,v.public_notes,v.payment_schedule,v.currency,a.name,
   EXISTS(SELECT 1 FROM platform_seller_acceptances sa WHERE sa.user_id=? AND sa.agreement_version_id=v.id AND sa.policy_version=?) accepted
   FROM platform_agreement_versions v JOIN platform_agreements a ON a.id=v.agreement_id
   WHERE a.creator_id=? AND v.effective_at<=? AND (v.end_at IS NULL OR v.end_at>?)`).bind(user.id,env.COMMERCE_POLICY_VERSION||'',user.id,now(),now()));
  return json({policyVersion:env.COMMERCE_POLICY_VERSION||null,agreements:agreements.map(a=>({...a,terms:JSON.parse(a.terms_json),terms_json:undefined,accepted:!!a.accepted}))});
 }
 if(path==='/seller/agreements/accept'&&request.method==='POST'){
  requireMutationOrigin(request,env);const {user,mode}=await access(request,env,{seller:true}),db=database(env),b=await readJson(request,1000);
  if(mode!=='live'||!stripeConfiguration(env).live||b.accepted!==true||b.policyVersion!==env.COMMERCE_POLICY_VERSION)fail(409,'Effective live seller terms are required.');
  const agreement=await db.prepare(`SELECT v.id FROM platform_agreement_versions v JOIN platform_agreements a ON a.id=v.agreement_id WHERE v.id=? AND a.creator_id=? AND v.effective_at<=? AND (v.end_at IS NULL OR v.end_at>?)`).bind(b.agreementVersionId,user.id,now(),now()).first();if(!agreement)fail(403,'This agreement is not assigned to you.');
  await db.prepare('INSERT OR IGNORE INTO platform_seller_acceptances VALUES(?,?,?,?)').bind(user.id,agreement.id,b.policyVersion,now()).run();await audit(env,{actor:user.id,action:'seller.agreement.accepted',target:agreement.id,policyVersion:b.policyVersion});return json({accepted:true});
 }
 if(path==='/seller/stripe/onboard'&&request.method==='POST'){
  requireMutationOrigin(request,env);const {user,mode}=await access(request,env,{seller:true});await rate(env,user.id,'stripe-onboard',5,3600);const b=await readJson(request,500);
  if(b.adultAndUSSeller!==true)fail(400,'Seller onboarding is for US adults aged 18 or over.');const db=database(env),at=now();
  let row=await db.prepare('SELECT account_id FROM platform_stripe_accounts WHERE user_id=? AND mode=?').bind(user.id,mode).first();
  if(!row){const account=await stripeRequest(env,'/accounts',{method:'POST',idempotencyKey:`crate-seller-${mode}-${user.id}`,fields:{country:'US','controller[fees][payer]':'application','controller[losses][payments]':'application','controller[stripe_dashboard][type]':'express','capabilities[card_payments][requested]':'true','capabilities[transfers][requested]':'true','metadata[crate_user]':user.id,'metadata[crate_app]':'crateshipgames'}});if(!/^acct_[A-Za-z0-9]+$/.test(account.id||''))fail(502,'Invalid connected account.');await db.prepare('INSERT OR IGNORE INTO platform_stripe_accounts(user_id,mode,account_id,created_at,updated_at) VALUES(?,?,?,?,?)').bind(user.id,mode,account.id,at,at).run();row=await db.prepare('SELECT account_id FROM platform_stripe_accounts WHERE user_id=? AND mode=?').bind(user.id,mode).first();}
  const origin=appOrigin(env).origin,link=await stripeRequest(env,'/account_links',{method:'POST',fields:{account:row.account_id,type:'account_onboarding','collection_options[fields]':'eventually_due',refresh_url:origin+'/developer/payments?onboarding=expired',return_url:origin+'/developer/payments?onboarding=returned'}});
  if(!link.url?.startsWith('https://connect.stripe.com/'))fail(502,'Invalid Stripe onboarding address.');await audit(env,{actor:user.id,action:'stripe.onboarding.started',target:row.account_id,mode});return json({url:link.url});
 }
 const pricing=/^\/developer\/games\/([^/]+)\/pricing$/.exec(path);
 if(pricing&&request.method==='PUT'){
  requireMutationOrigin(request,env);const {user}=await access(request,env,{seller:true}),db=database(env),game=await ownGame(env,user,pricing[1]);if(game.developer_id!==user.id)fail(403,'Only the game owner can change pricing.');
  if(!['draft','changes_requested'].includes(game.status))fail(409,'Pricing is locked during review and while published.');const b=await readJson(request,800);
  if(!Number.isSafeInteger(b.priceMinor)||(b.priceMinor!==0&&(b.priceMinor<199||b.priceMinor>99999)))fail(400,'Use a free price or $1.99–$999.99 USD.');
  await db.prepare("UPDATE platform_games SET price_minor=?,currency='USD',updated_at=? WHERE id=? AND status=?").bind(b.priceMinor,now(),game.id,game.status).run();await audit(env,{actor:user.id,action:'game.price',target:game.id,priceMinor:b.priceMinor});return json({saved:true});
 }
 return null;
}
