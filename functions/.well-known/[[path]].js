import {handleAiConnect} from '../../platform/server/ai-connect.mjs';
// MCP endpoint, OAuth authorization server and discovery metadata for AI app connections.
export async function onRequest({request,env}){return await handleAiConnect(request,env)||new Response('Not found',{status:404});}
