import {purgeEngineAssets} from '../../platform/server/engine-assets.mjs';
/** Bind only to the private platform database/bucket. No public HTTP actions. */
export default {async fetch(){return new Response('Not found',{status:404});},async scheduled(event,env,context){context.waitUntil(purgeEngineAssets(env));}};
