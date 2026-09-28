import {handleReleases} from '../../../platform/server/releases.mjs';
import {handleModelConnections} from '../../../platform/server/model-connections.mjs';
import {handleEngineAssets} from '../../../platform/server/engine-assets.mjs';
import {handleAuth} from '../../../platform/server/identity.mjs';
import {handleAdministration} from '../../../platform/server/administration.mjs';
import {handleData,flags} from '../../../platform/server/data.mjs';
import {handleUploads} from '../../../platform/server/uploads.mjs';
import {handleMedia} from '../../../platform/server/media.mjs';
import {handlePlayer} from '../../../platform/server/player.mjs';
import {json} from '../../../platform/server/common.mjs';
import {accountErasureStatements} from '../../../platform/server/erasure.mjs';

export async function onRequest(context){
 const {request,env}=context;
 const path='/'+(Array.isArray(context.params.path)?context.params.path:[context.params.path||'']).join('/');
 try{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{Allow:'GET,POST,PUT,PATCH,DELETE,OPTIONS'}});
  if(path==='/health')return json({ok:true,service:'crate-platform',databaseConfigured:Boolean(env.PLATFORM_DB),uploadsConfigured:Boolean(env.PLATFORM_UPLOADS)});
  if(!path.startsWith('/auth/')&&!path.startsWith('/owner/')&&!['/config','/me'].includes(path)&&(await flags(env)).MAINTENANCE_MODE)return json({error:{code:'MAINTENANCE',message:'Crate Ship Games is temporarily unavailable for maintenance. Please try again later.'}},503);
  const response=await handleAuth(request,env,path,{accountErasureStatements:userId=>accountErasureStatements(env,userId)})||await handleEngineAssets(request,env,path)||await handleModelConnections(request,env,path)||await handleReleases(request,env,path)||await handleAdministration(request,env,path)||await handleUploads(request,env,path)||await handleMedia(request,env,path)||await handlePlayer(request,env,path)||await handleData(request,env,path)||json({error:{code:'NOT_FOUND',message:'This endpoint does not exist.'}},404);
  const safe=new Response(response.body,response);if(!response.headers.has('Cache-Control'))safe.headers.set('Cache-Control','no-store');safe.headers.set('X-Content-Type-Options','nosniff');safe.headers.set('Referrer-Policy','same-origin');return safe;
 }catch(error){
  const status=Number.isInteger(error.status)?error.status:500;
  if(status>=500)console.error(JSON.stringify({event:'platform.request.failed',path,code:error.code||'INTERNAL_ERROR',requestId:request.headers.get('cf-ray')||null}));
  return json({error:{code:error.code||(status===500?'INTERNAL_ERROR':'REQUEST_FAILED'),message:status===500?'We could not complete this request. Please try again.':error.message}},status);
 }
}
