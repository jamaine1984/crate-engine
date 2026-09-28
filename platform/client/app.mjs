import './styles.css';
import {api,listOf,messageFor} from './api.mjs';
import {esc,icon,link,btn,notice,loading,feedback,input,downloadJson} from './ui.mjs';
import {renderShell} from './shell.mjs';
import {needsUser,homePage,catalogPage,gamePage,authPage,loginGate,collectionPage,walletPage,profilePage,settingsPage,projectsPage,creatorsPage} from './pages.mjs';
import {developerPage,ownerPage} from './creator-pages.mjs';
import {docsPage,staticPage} from './content.mjs';
import {mountIsolatedPlayer} from './player-bridge.mjs';
import {qrSvg,groupKey} from './qr.mjs';
import {administrationPanels} from './administration-ui.mjs';
import {firebaseSignUp,firebasePasswordToken,firebaseGoogleToken,firebaseResetPassword,rememberPendingProfile,pendingProfile,clearPendingProfile} from './firebase-auth.mjs';

const state={user:null,config:{flags:{},auth:{},limits:{}},library:[],history:[],favoriteIds:new Set(),preferences:{},serviceError:null};
let routeGeneration=0;let activePlayer=null;let activeSession=null;let uploadRunning=false;
const app=document.getElementById('app');
const clientRoots=['games','game','creators','community','support','marketplace','coming-soon','favorites','library','history','rewards','profile','settings','notifications','login','signup','forgot-password','reset-password','verify-email','engine','developer','developers','owners-portal','privacy','terms'];
function notify(text,error=false){const el=document.createElement('div');el.className='toast'+(error?' error':'');el.textContent=text;document.getElementById('toasts').append(el);setTimeout(()=>el.remove(),6500);}
function safeNext(){const next=new URLSearchParams(location.search).get('next')||'/profile';return next.startsWith('/')&&!next.startsWith('//')&&!next.startsWith('/api/')?next:'/profile';}
const firebaseConfig=()=>state.config.auth?.firebase||null;
async function completeFirebaseSignIn(token){const data=await api('/auth/firebase',{method:'POST',body:{idToken:token.idToken,...pendingProfile(token.email)}});clearPendingProfile();if(data.mfaRequired){state.mfaChallenge=data.challengeId;await render();return;}await refreshSession();state.serviceError=null;notify('Welcome to Crate Ship Games.');await navigate(safeNext());}
async function freshFirebaseToken(password){if(state.user?.signInProvider==='google.com')return firebaseGoogleToken(firebaseConfig());if(!password)throw new Error('Enter your password to confirm it is you.');return firebasePasswordToken(firebaseConfig(),state.user.email,password);}
async function refreshSession(){const data=await api('/me');state.user=data.user||null;if(state.user){const results=await Promise.allSettled([api('/library'),api('/history'),api('/preferences'),api('/favorites')]);state.library=results[0].status==='fulfilled'?listOf(results[0].value):[];state.history=results[1].status==='fulfilled'?listOf(results[1].value):[];state.preferences=results[2].status==='fulfilled'?results[2].value.preferences||{}:{};state.favoriteIds=new Set(results[3].status==='fulfilled'?listOf(results[3].value).map(g=>g.id||g.gameId):[]);state.user.preferences=state.preferences;}else{state.library=[];state.history=[];state.favoriteIds=new Set();state.preferences={};}document.documentElement.dataset.reducedMotion=state.preferences.reducedMotion?'true':'false';}
function closeMenu(){document.getElementById('sidebar')?.classList.remove('open');document.querySelector('.drawer-overlay')?.classList.remove('open');document.querySelector('[data-action=menu]')?.setAttribute('aria-expanded','false');}
async function navigate(path,replace=false){if(uploadRunning&&!confirm('An upload is in progress. Leaving this page will interrupt it. Continue?'))return;if(replace)history.replaceState({},'',path);else history.pushState({},'',path);closeMenu();await render();window.scrollTo({top:0,behavior:'instant'});document.getElementById('main-content')?.focus({preventScroll:true});}
async function render(){
 const generation=++routeGeneration;activePlayer?.destroy();activePlayer=null;if(activeSession&&state.user){api('/player/sessions/'+encodeURIComponent(activeSession.id)+'/end',{method:'POST',body:{}}).catch(()=>{});}activeSession=null;
 app.innerHTML=renderShell(state);const main=document.getElementById('main-content');main.innerHTML=loading();let path=location.pathname.replace(/\/$/,'')||'/';
 document.title=(path==='/'?'Crate Ship Games — Play. Create. Belong.':path.split('/').filter(Boolean).map(s=>s.replaceAll('-',' ')).join(' · ')+' — Crate Ship Games');
 try{
  let result;
  if(!state.user&&needsUser.some(p=>path===p||path.startsWith(p+'/'))){if(state.serviceError)throw state.serviceError;result=loginGate(path);}
  else if(path==='/')result=await homePage(state);
  else if(path==='/games'||path.startsWith('/games/'))result=await catalogPage(state,path);
  else if(path.startsWith('/game/'))result=await gamePage(state,decodeURIComponent(path.slice(6)));
  else if(['/login','/signup','/forgot-password','/reset-password','/verify-email'].includes(path))result=authPage(state,path);
  else if(['/favorites','/library','/history','/notifications'].includes(path))result=await collectionPage(state,path.slice(1));
  else if(path==='/rewards')result=await walletPage(state);
  else if(path==='/profile')result=profilePage(state);
  else if(path==='/settings')result=await settingsPage(state);
  else if(path==='/engine/projects')result=await projectsPage(state);
  else if(path==='/creators')result=creatorsPage(state);
  else if(path==='/developer'||path.startsWith('/developer/'))result=await developerPage(state,path);
  else if(path.startsWith('/owners-portal'))result=await ownerPage(state,path);
  else if(path.startsWith('/developers/docs'))result=docsPage(path);
  else result=staticPage(path);
  if(generation!==routeGeneration)return;
  main.innerHTML=result.html+(path.startsWith('/owners-portal')&&state.user?.roles?.includes('OWNER')?administrationPanels(path):'');document.getElementById('full-width-content').innerHTML=result.full||'';
  main.querySelectorAll('[data-action=favorite]').forEach(el=>el.setAttribute('aria-pressed',String(state.favoriteIds.has(el.dataset.id))));
  const submitGame=main.querySelector('form[data-form=submit-game]');if(submitGame&&!submitGame.elements.versionId.options.length){submitGame.querySelector('button[type=submit]').disabled=true;submitGame.insertAdjacentHTML('afterbegin',notice('No build has passed the security check yet. Upload your ZIP in Step 3 first.'));}else if(submitGame&&!state.media?.length){submitGame.querySelector('button[type=submit]').disabled=true;submitGame.insertAdjacentHTML('afterbegin',notice('Add at least one screenshot in Step 2 first.'));}
  if(state.serviceError&&path!=='/'&&!path.startsWith('/owners-portal'))main.insertAdjacentHTML('afterbegin',notice('Account services are currently unavailable. '+esc(messageFor(state.serviceError)),true));
  if(location.hash==='#join'||location.hash==='#waitlist')document.getElementById('join')?.scrollIntoView({block:'start'});
 }catch(error){if(generation!==routeGeneration)return;main.innerHTML=`<div class="page-error">${icon(error.status===403?'shield-check':'warning-circle')}<h2>${error.status===403?'Additional verification required':'This page could not load.'}</h2><p>${esc(messageFor(error))}</p><div class="inline-actions">${btn('retry','Try Again','btn primary')}${error.status===403?link('/settings','Security Settings','btn'):link('/','Back to Home','btn')}</div></div>`;}
}
function formResult(form,text,isError=false){const box=form.querySelector('.form-feedback');if(box){box.className='form-feedback'+(isError?' error':'');box.textContent=text;box.scrollIntoView({block:'nearest'});}}
const blankProject=()=>({format:'crate-engine-project',version:3,commands:[],objects:[],userScripts:[],validationFixHistory:[],weather:null,time:null});
const values=form=>Object.fromEntries(new FormData(form).entries());
const gamePayload=b=>({...b,genres:String(b.genres||'').split(',').map(s=>s.trim()).filter(Boolean),tags:String(b.tags||'').split(',').map(s=>s.trim()).filter(Boolean)});

document.addEventListener('click',async event=>{
 const a=event.target.closest('a[href]');if(a&&!event.defaultPrevented&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey&&event.button===0&&!a.target&&!a.hasAttribute('download')){const url=new URL(a.href,location.href);if(url.origin===location.origin&&(url.pathname==='/'||clientRoots.includes(url.pathname.split('/')[1]))&&!url.pathname.endsWith('.html')){event.preventDefault();navigate(url.pathname+url.search+url.hash);return;}}
 const el=event.target.closest('[data-action]');if(!el)return;const action=el.dataset.action;
 if(action==='remove-screenshot'){el.disabled=true;try{await api('/developer/games/'+encodeURIComponent(el.dataset.game)+'/media/'+el.dataset.position,{method:'DELETE'});notify('Screenshot removed.');await render();}catch(error){notify(messageFor(error),true);el.disabled=false;}return;}
 if(action==='owner-account-status'){const box=document.querySelector('form[data-form=owner-status]');if(!box)return;box.closest('details').open=true;box.elements.userId.value=el.dataset.id;box.elements.status.value=el.dataset.status;box.elements.reason.value='';box.elements.reason.placeholder=(el.dataset.status==='suspended'?'Why are you suspending ':'Why are you reactivating ')+el.dataset.name+'?';box.scrollIntoView({block:'center'});box.elements.reason.focus();return;}
 if(action==='menu'){const open=!document.getElementById('sidebar').classList.contains('open');document.getElementById('sidebar').classList.toggle('open',open);document.querySelector('.drawer-overlay').classList.toggle('open',open);el.setAttribute('aria-expanded',String(open));return;}
 if(action==='close-menu'){closeMenu();return;}
 if(action==='google-signin'){const note=el.closest('.panel')?.querySelector('.form-feedback');el.disabled=true;try{await completeFirebaseSignIn(await firebaseGoogleToken(firebaseConfig()));}catch(error){notify(messageFor(error),true);if(note){note.textContent=messageFor(error);note.classList.add('error');}}finally{el.disabled=false;}return;}if(action==='retry'){await boot();return;}
 const oldDisabled=el.disabled;el.disabled=true;
 try{
  if(action==='logout'||action==='logout-all'){await api('/auth/'+(action==='logout-all'?'logout-all':'logout'),{method:'POST',body:{}});await refreshSession();notify('You are logged out.');await navigate('/');}
  if(action==='favorite'){if(!state.user){navigate('/login?next='+encodeURIComponent(location.pathname));return;}const remove=el.getAttribute('aria-pressed')==='true'||location.pathname==='/favorites';await api(remove?'/favorites/'+encodeURIComponent(el.dataset.id):'/favorites',{method:remove?'DELETE':'POST',body:remove?undefined:{gameId:el.dataset.id}});if(remove)state.favoriteIds.delete(el.dataset.id);else state.favoriteIds.add(el.dataset.id);el.setAttribute('aria-pressed',String(!remove));notify(remove?'Removed from favorites.':'Saved to favorites.');if(location.pathname==='/favorites')await render();}
  if(action==='read-notification'){await api('/notifications/'+encodeURIComponent(el.dataset.id),{method:'PATCH',body:{}});await render();}
  if(action==='revoke-session'){await api('/auth/sessions/'+encodeURIComponent(el.dataset.id),{method:'DELETE'});notify('Session revoked.');await render();}
  if(action==='mfa-enroll'){const data=await api('/auth/mfa/enroll',{method:'POST',body:{}});const container=document.getElementById('mfa-enrollment');const uri=typeof data.otpauthUri==='string'&&data.otpauthUri.startsWith('otpauth://totp/')?data.otpauthUri:'';container.innerHTML=notice('1. In Google Authenticator or Microsoft Authenticator, delete any old Crate Ship Games entry. 2. Tap + and scan this QR code. 3. Type the six-digit code the app shows now. Keep this code private; it is only shown once.')+(uri?`<div class="mfa-qr section">${qrSvg(uri,{label:'Authenticator setup QR code'})}${link(uri,'Open in authenticator app','btn small')}</div>`:'')+`<details class="section"><summary>Can't scan? Type this setup key instead</summary><p class="code-block section">${esc(groupKey(data.secret))}</p><p class="form-hint">Choose "Enter a setup key", type the key exactly (spaces are optional), and pick "Time based".</p></details><form class="form section" data-form="mfa-confirm">${input('code','Authenticator code','text','','required inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="one-time-code"')}<button class="btn primary" type="submit">Confirm Authenticator</button>${feedback()}</form>`;}
  if(['export-project','duplicate-project','rename-project','delete-project'].includes(action)){const id=el.dataset.id;const data=await api('/projects/'+encodeURIComponent(id));const p=data.project;
   if(action==='export-project'){downloadJson({...p.data,name:p.name},(p.name||'project').replace(/[^\w-]/g,'-')+'.crate');notify('Project backup downloaded.');}
   if(action==='duplicate-project'){await api('/projects',{method:'POST',body:{name:p.name+' copy',project:p.data}});notify('Project duplicated.');await render();}
   if(action==='rename-project'){const name=prompt('New project name',p.name);if(name?.trim()){await api('/projects/'+encodeURIComponent(id),{method:'PUT',body:{name:name.trim(),revision:p.revision,project:p.data}});notify('Project renamed.');await render();}}
   if(action==='delete-project'&&confirm('Delete “'+p.name+'” from your cloud projects? Export a backup first if you need one.')){await api('/projects/'+encodeURIComponent(id),{method:'DELETE'});notify('Project deleted.');await render();}
  }
  if(action==='play-game'){const area=document.getElementById('player-area');area.innerHTML=loading();const data=await api('/player/sessions',{method:'POST',body:{gameId:state.currentGame.id}});activeSession=data.session;activePlayer=mountIsolatedPlayer(area,data.session,{api,onStatus:status=>{if(status==='ready')notify('Game ready.');}});activePlayer.frame.classList.add('player-frame');area.scrollIntoView({block:'center'});}
  if(action==='claim-game'){if(!state.user){navigate('/login?next='+encodeURIComponent(location.pathname));return;}await api('/library',{method:'POST',body:{gameId:state.currentGame.id}});notify('Added to your library.');await refreshSession();el.textContent='In Your Library';el.disabled=true;}
 }catch(error){notify(messageFor(error),true);if(action==='play-game'){const area=document.getElementById('player-area');if(area)area.innerHTML=notice(esc(messageFor(error)),true);}}
 finally{if(el.isConnected)el.disabled=oldDisabled;}
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});

document.addEventListener('submit',async event=>{
 const form=event.target.closest('form[data-form]');if(!form)return;event.preventDefault();if(!form.reportValidity())return;const name=form.dataset.form;const b=values(form);
 if(name==='search'){navigate('/games?'+new URLSearchParams({q:b.q||''}));return;}
 const buttons=[...form.querySelectorAll('button[type=submit]')];buttons.forEach(button=>button.disabled=true);formResult(form,'Working…');
 try{
  if(name==='register'&&firebaseConfig()){await firebaseSignUp(firebaseConfig(),{email:b.email,password:b.password,displayName:b.displayName});rememberPendingProfile(b.email,{username:b.username,displayName:b.displayName});formResult(form,'We sent a verification link to '+b.email+'. Open it, then log in to finish creating your account.');form.reset();}
  else if(name==='register'){await api('/auth/register',{method:'POST',body:{email:b.email,password:b.password,username:b.username,displayName:b.displayName}});formResult(form,'Check your email for a verification link. You can log in after your email is verified.');form.reset();}
  else if(name==='login'&&firebaseConfig()){await completeFirebaseSignIn(await firebasePasswordToken(firebaseConfig(),b.email,b.password));}
  else if(name==='login'){const data=await api('/auth/login',{method:'POST',body:{email:b.email,password:b.password}});if(data.mfaRequired){state.mfaChallenge=data.challengeId;await render();}else{await refreshSession();state.serviceError=null;notify('Welcome back.');await navigate(safeNext());}}
  else if(name==='mfa-login'){await api('/auth/mfa/verify',{method:'POST',body:{challengeId:state.mfaChallenge,code:b.code}});state.mfaChallenge='';await refreshSession();state.serviceError=null;notify('You are logged in.');await navigate(safeNext());}
  else if(name==='reset-request'&&firebaseConfig()){await firebaseResetPassword(firebaseConfig(),b.email);formResult(form,'If an account uses this email, a password reset link will arrive shortly.');}
  else if(name==='reset-request'||name==='verification-request'){await api(name==='reset-request'?'/auth/reset/request':'/auth/verification/request',{method:'POST',body:{email:b.email}});formResult(form,'If this account is eligible, an email with your next step will arrive shortly.');}
  else if(name==='reset-confirm'){if(!state.authToken)throw new Error('The reset token is missing. Request a new password reset email.');await api('/auth/reset/confirm',{method:'POST',body:{token:state.authToken,password:b.password}});state.authToken='';history.replaceState({},'',location.pathname);notify('Password updated. Log in with your new password.');await navigate('/login');}
  else if(name==='verify-email'){await api('/auth/verification/confirm',{method:'POST',body:{token:state.authToken}});state.authToken='';history.replaceState({},'',location.pathname);notify('Email verified. You can now log in.');await navigate('/login');}
  else if(name==='mfa-confirm'){await api('/auth/mfa/confirm',{method:'POST',body:{code:b.code}});notify('Authenticator enabled. Log in again to verify the new setup.');await refreshSession();await navigate('/login');}
  else if(name==='reauth'&&firebaseConfig()&&state.user?.signInProvider&&state.user.signInProvider!=='local'){const token=await freshFirebaseToken(b.password);await api('/auth/reauth',{method:'POST',body:{idToken:token.idToken,code:b.code||undefined}});await refreshSession();form.reset();formResult(form,'Identity verified. You can continue with sensitive actions for a limited time.');}
  else if(name==='reauth'){await api('/auth/reauth',{method:'POST',body:{password:b.password,code:b.code||undefined}});form.reset();formResult(form,'Identity verified. You can continue with sensitive actions for a limited time.');}
  else if(name==='profile'){await api('/profile',{method:'PUT',body:{displayName:b.displayName,username:b.username}});await refreshSession();formResult(form,'Profile saved.');}
  else if(name==='preferences'){await api('/preferences',{method:'PUT',body:{reducedMotion:form.elements.reducedMotion.checked,analyticsConsent:form.elements.analyticsConsent.checked,advertisingConsent:form.elements.advertisingConsent.checked,language:'en'}});await refreshSession();formResult(form,'Preferences saved.');}
  else if(name==='delete-account'&&firebaseConfig()&&state.user?.signInProvider&&state.user.signInProvider!=='local'){const token=await freshFirebaseToken(b.password);await api('/auth/reauth',{method:'POST',body:{idToken:token.idToken,code:b.code||undefined}});await api('/auth/account',{method:'DELETE',body:{confirmation:b.confirmation,idToken:token.idToken}});await refreshSession();notify('Your account has been deleted.');await navigate('/');}
  else if(name==='delete-account'){await api('/auth/account',{method:'DELETE',body:{confirmation:b.confirmation}});await refreshSession();notify('Your account has been deleted.');await navigate('/');}
  else if(name==='creator-join'){await api('/creator/join',{method:'POST',body:{guidelinesAccepted:form.elements.guidelinesAccepted.checked}});await refreshSession();notify('You are now a creator. Welcome aboard!');await navigate('/developer');}
  else if(name==='create-project'){const result=await api('/projects',{method:'POST',body:{name:b.name,project:blankProject()}});notify('Project created.');await render();}
  else if(name==='import-project'){const file=form.elements.projectFile.files[0];if(!file||file.size>(state.config.limits.projectBytes||2097152))throw new Error('Choose a project file within the configured size limit.');const data=JSON.parse(await file.text());if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Choose a valid Crate project JSON file.');await api('/projects',{method:'POST',body:{name:b.name,project:data}});notify('Project backup imported.');await render();}
  else if(name==='report'){await api('/reports',{method:'POST',body:{gameId:form.dataset.id,category:b.reason==='security'?'malware':b.reason,detail:b.description}});form.reset();formResult(form,'Your report has been submitted for review.');}
  else if(name==='create-game'){const data=await api('/developer/games',{method:'POST',body:gamePayload(b)});notify('Draft created.');await navigate('/developer/games/'+encodeURIComponent(data.game.id));}
  else if(name==='edit-game'){await api('/developer/games/'+encodeURIComponent(form.dataset.id),{method:'PUT',body:gamePayload(b)});formResult(form,'Game listing saved.');}
  else if(name==='upload-game'){await uploadBuild(form,b);}
  else if(name==='submit-game'){if(!b.versionId)throw new Error('Upload a build and wait for clean validation before submitting.');const result=await api('/developer/games/'+encodeURIComponent(form.dataset.id)+'/submit',{method:'POST',body:{versionId:b.versionId,rightsConfirmed:form.elements.rightsConfirmed.checked}});notify(result.updateStatus==='approved'?'Update approved automatically. Release it from Owner Portal → Review Games; the current version stays live until then.':result.updateStatus==='submitted'?'Update submitted for review. Your current version stays live.':result.status==='approved'?'Approved automatically. Publish it from Owner Portal → Review Games.':'Game submitted for review.');await render();}
  else if(name==='owner-flag'){await api('/owner/flags',{method:'PUT',body:{key:b.key,enabled:b.enabled==='true',reason:b.reason}});notify('Feature state updated and recorded.');await render();}
  else if(name==='owner-report'){await api('/owner/reports/'+encodeURIComponent(b.reportId),{method:'POST',body:{action:b.action,note:b.note}});notify(b.action==='suspend_game'?'Game taken off the site. The creator has been told.':'Report saved.');await render();}
  else if(name==='owner-review'){await api('/owner/games/'+encodeURIComponent(b.gameId)+'/review',{method:'POST',body:{decision:b.decision,reason:b.reason}});notify('Review decision recorded.');await render();}
  else if(name==='owner-publish'){if(!form.elements.confirmPublish.checked)throw new Error('Confirm public publication of this approved game.');await api('/owner/games/'+encodeURIComponent(b.gameId)+'/publish',{method:'POST',body:{reason:b.reason}});notify('The approved game has been published.');await render();}
  else if(name==='owner-agreement'){const terms={};for(const k of ['rewarded_ads','interstitial_ads','premium_sales','dlc','iap','subscriptions','sponsorships','promotions','other']){const creatorBps=Math.round(Number(b[k])*100);terms[k]={creatorBps,platformBps:10000-creatorBps};}await api('/owner/agreements',{method:'POST',body:{...b,effectiveAt:Math.floor(new Date(b.effectiveAt).valueOf()/1000),minimumPayoutMinor:Number(b.minimumPayoutMinor),terms}});notify('Agreement version created.');await render();}
  else if(name==='owner-assignment'){await api('/owner/agreements/assign',{method:'POST',body:{gameId:b.gameId,versionId:b.versionId,effectiveAt:Math.floor(new Date(b.effectiveAt).valueOf()/1000)}});formResult(form,'Agreement assigned. Historical revenue remains under its original agreement.');}
  else if(name==='owner-roles'){const roles=['PLAYER',...new FormData(form).getAll('roles')];await api('/owner/players/'+encodeURIComponent(b.userId)+'/roles',{method:'PUT',body:{roles,reason:b.reason}});formResult(form,'Roles updated. The account’s active sessions have been revoked.');}
  else if(name==='owner-status'){await api('/owner/players/'+encodeURIComponent(b.userId)+'/status',{method:'PUT',body:{status:b.status,reason:b.reason}});formResult(form,'Account status updated and active sessions revoked.');}
  else if(name==='owner-members'){await api('/owner/games/'+encodeURIComponent(b.gameId)+'/members',{method:'PUT',body:{userId:b.userId,permission:b.permission,reason:b.reason}});formResult(form,'Game assignment updated and recorded.');}
  else if(name==='owner-threshold'){await api('/owner/thresholds',{method:'PUT',body:{key:b.key,limitValue:Number(b.limitValue),reason:b.reason}});formResult(form,'Usage threshold saved and recorded.');}
 }catch(error){formResult(form,messageFor(error),true);if(error.code==='MFA_REQUIRED'||error.code==='REAUTH_REQUIRED')form.querySelector('.form-feedback')?.insertAdjacentHTML('beforeend',' '+link('/settings','Verify your identity in Security Settings','text-link'));}
 finally{buttons.forEach(button=>{if(button.isConnected)button.disabled=false;});}
});
async function uploadBuild(form,b){
 const file=form.elements.build.files[0];if(!file||!/\.zip$/i.test(file.name))throw new Error('Choose one complete ZIP archive.');if(file.size>(state.config.limits.uploadBytes||524288000))throw new Error('The archive exceeds the configured upload limit.');
 uploadRunning=true;let upload;let completed=false;
 try{const started=await api('/developer/uploads',{method:'POST',body:{gameId:form.dataset.id,platform:b.platform,version:b.version,sizeBytes:file.size,fileName:file.name,releaseNotes:b.releaseNotes}});upload=started.upload;const progress=form.querySelector('progress');progress.hidden=false;
  for(let n=1;n<=upload.parts;n++){formResult(form,`Uploading part ${n} of ${upload.parts}…`);const part=file.slice((n-1)*upload.partBytes,Math.min(file.size,n*upload.partBytes));await api('/developer/uploads/'+encodeURIComponent(upload.id)+'/parts/'+n,{method:'PUT',body:part,headers:{'Content-Type':'application/octet-stream'},timeout:120000});progress.value=Math.round(n/upload.parts*100);}
  await api('/developer/uploads/'+encodeURIComponent(upload.id)+'/complete',{method:'POST',body:{}});completed=true;formResult(form,'Upload finished. Running the security check…');
  try{await api('/developer/uploads/'+encodeURIComponent(upload.id)+'/process',{method:'POST',body:{},timeout:120000});notify('Your build passed the security check.');}catch(error){notify(messageFor(error),true);}
  await render();
 }catch(error){if(upload&&!completed){await api('/developer/uploads/'+encodeURIComponent(upload.id)+'/abort',{method:'POST',body:{}}).catch(()=>{});}throw error;}finally{uploadRunning=false;}
}
async function screenshotBlob(file){
 if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw new Error('Choose a PNG, JPEG or WebP image.');
 const bitmap=await createImageBitmap(file);if(bitmap.width<320||bitmap.height<180)throw new Error('Screenshots must be at least 320 × 180 pixels.');
 const scale=Math.min(1,1920/bitmap.width,1080/bitmap.height),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
 canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
 const encode=(type,quality)=>new Promise(resolve=>canvas.toBlob(resolve,type,quality));
 for(const [type,quality] of [['image/webp',0.85],['image/jpeg',0.85],['image/jpeg',0.7],['image/jpeg',0.55]]){const blob=await encode(type,quality);if(blob&&blob.type===type&&blob.size<=1048576)return blob;}
 throw new Error('This image is too detailed to fit in 1 MB. Try a smaller screenshot.');
}
document.addEventListener('change',async event=>{
 const input=event.target.closest?.('input[data-screenshot]');if(!input||!input.files[0])return;
 const box=document.querySelector('[data-screenshot-feedback]'),say=(text,error=false)=>{if(box){box.className='form-feedback'+(error?' error':'');box.textContent=text;}};
 try{say('Preparing screenshot…');const blob=await screenshotBlob(input.files[0]);say('Uploading screenshot…');await api('/developer/games/'+encodeURIComponent(input.dataset.game)+'/media/'+input.dataset.screenshot,{method:'PUT',body:blob,headers:{'Content-Type':blob.type}});notify('Screenshot saved.');await render();}
 catch(error){say(messageFor(error),true);}finally{input.value='';}
});
window.addEventListener('popstate',()=>render());
window.addEventListener('beforeunload',event=>{if(uploadRunning){event.preventDefault();event.returnValue='';}});
async function boot(){const results=await Promise.allSettled([api('/config'),refreshSession()]);if(results[0].status==='fulfilled')state.config=results[0].value;state.serviceError=results[1].status==='rejected'?results[1].reason:null;await render();}
boot();
