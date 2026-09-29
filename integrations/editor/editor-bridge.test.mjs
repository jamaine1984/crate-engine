import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createEditorBridge } from './bridge.mjs';
import { callEditor } from './mcp-server.mjs';
import { readFileSync } from 'node:fs';
import { validArguments, validResult, toolDefinitions } from './contracts.mjs';
import { createEditorMcpClient, editObjectOperations } from '../../engine/editor/mcp-client.mjs';
import { sceneContext, objectContext } from '../../engine/editor/scene-context.mjs';
import { newProject } from '../../engine/core/schema.mjs';
import { compileWorldRecipe } from '../../engine/core/procedural.mjs';
import { ProjectStore } from '../../engine/core/project-store.mjs';

const origin='http://127.0.0.1:4173',recipe={version:1,seed:'local test',operations:[{op:'grid',entity:{type:'box',name:'Block'},counts:[2,3],spacing:[2,2],origin:[0,0,0]}]};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fixture(t,options={}){
 const bridge=createEditorBridge({port:0,origin,...options}),address=await bridge.listen();t.after(()=>bridge.close());const base=`http://127.0.0.1:${address.port}`;
 const request=(path,{browser=false,method='GET',body,headers={}}={})=>fetch(base+path,{method,headers:{authorization:`Bearer ${browser?bridge.editorToken:bridge.token}`,...(browser?{origin}:{}),...(body!==undefined?{'content-type':'application/json'}:{}),...headers},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});
 const connect=async(allowWrites=false,projectId='project-one')=>{const r=await request('/editor/connect',{browser:true,method:'POST',body:{projectId,allowWrites}});assert.equal(r.status,201);return r.json();};
 const submit=(session,command='get_scene',args={},requestId=randomUUID())=>request('/commands',{method:'POST',body:{requestId,sessionId:session.sessionId,projectId:session.projectId,command,arguments:args}});
 const poll=session=>request(`/editor/sessions/${session.sessionId}/commands`,{browser:true});
 const result=(session,commandId,value)=>request(`/editor/sessions/${session.sessionId}/results`,{browser:true,method:'POST',body:{commandId,projectId:session.projectId,result:value}});
 return {bridge,address,base,request,connect,submit,poll,result};
}
function scene(projectId='project-one'){const p=newProject('Test');p.id=projectId;return sceneContext(p);}
async function stage(f,session){const q=await(await f.submit(session,'preview_world',{recipe})).json();const batch=await(await f.poll(session)).json();assert.equal(batch.commands[0].id,q.id);const compiled=compileWorldRecipe(recipe,newProject());const preview={previewId:randomUUID(),summary:compiled.summary,entities:compiled.entities};assert.equal((await f.result(session,q.id,preview)).status,200);return preview;}

test('bridge binds loopback with separate random browser and MCP capabilities',async t=>{const f=await fixture(t),other=await fixture(t);assert.equal(f.address.address,'127.0.0.1');for(const token of[f.bridge.token,f.bridge.editorToken])assert.match(token,/^[A-Za-z0-9_-]{43}$/);assert.notEqual(f.bridge.token,f.bridge.editorToken);assert.notEqual(f.bridge.token,other.bridge.token);assert.equal((await(await f.request('/status')).json()).session,null);});
test('MCP capability cannot connect or grant writes even with spoofed allowed Origin',async t=>{const f=await fixture(t);assert.equal((await f.request('/editor/connect',{method:'POST',headers:{origin},body:{projectId:'project-one',allowWrites:true}})).status,403);const s=await f.connect();assert.equal((await f.request(`/editor/sessions/${s.sessionId}/permissions`,{method:'POST',headers:{origin},body:{projectId:s.projectId,allowWrites:true}})).status,403);});
test('browser capability cannot submit native commands',async t=>{const f=await fixture(t);await f.connect(true);assert.equal((await f.request('/commands',{browser:true,method:'POST',body:{}})).status,403);});
for(const [name,headers,status]of[['no token',{authorization:''},401],['foreign Origin',{origin:'https://evil.test'},403],['opaque Origin',{origin:'null'},403],['bad token',{authorization:'Bearer no'},401]])test(`rejects ${name}`,async t=>{const f=await fixture(t);assert.equal((await f.request('/status',{headers})).status,status);});
test('strict Host prevents DNS rebinding; paths cannot contain query credentials',async t=>{const f=await fixture(t);const status=await new Promise((resolve,reject)=>{const req=http.request(f.base+'/status',{headers:{host:'evil.test',authorization:`Bearer ${f.bridge.token}`}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});assert.equal(status,403);assert.equal((await f.request('/status?token=x')).status,403);});
test('only configured browser may preflight allowed methods and headers',async t=>{const f=await fixture(t);const r=await f.request('/editor/connect',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'authorization,content-type'}});assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),origin);assert.equal(r.headers.get('access-control-allow-credentials'),null);assert.equal((await f.request('/editor/connect',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'x-execute'}})).status,403);});
test('commands are session/project bound and delivered at most once',async t=>{const f=await fixture(t),s=await f.connect(),id=randomUUID();assert.equal((await f.submit({...s,projectId:'other'},'get_scene',{},id)).status,409);assert.equal((await f.submit(s,'get_scene',{},id)).status,202);assert.equal((await f.submit(s,'get_scene',{},id)).status,409);assert.equal((await(await f.poll(s)).json()).commands[0].id,id);assert.deepEqual((await(await f.poll(s)).json()).commands,[]);assert.equal((await f.result(s,id,scene())).status,200);assert.equal((await f.result(s,id,scene())).status,409);assert.deepEqual((await(await f.request('/commands/'+id)).json()).result,scene());});
test('writes are denied until the paired browser explicitly grants permission',async t=>{const f=await fixture(t),s=await f.connect(),p=await stage(f,s);assert.equal((await f.submit(s,'apply_world',{previewId:p.previewId})).status,403);assert.equal((await f.submit(s,'undo',{})).status,403);assert.equal((await f.request(`/editor/sessions/${s.sessionId}/permissions`,{browser:true,method:'POST',body:{projectId:s.projectId,allowWrites:true}})).status,200);assert.equal((await f.submit(s,'apply_world',{previewId:p.previewId})).status,202);assert.equal((await f.submit(s,'apply_world',{previewId:p.previewId})).status,409);});
test('revoking writes cancels queued mutations and rejects late delivered results',async t=>{const f=await fixture(t),s=await f.connect(true);const q=await(await f.submit(s,'undo')).json();await f.poll(s);await f.request(`/editor/sessions/${s.sessionId}/permissions`,{browser:true,method:'POST',body:{projectId:s.projectId,allowWrites:false}});assert.equal((await(await f.request('/commands/'+q.id)).json()).error.code,'COMMAND_OUTCOME_UNKNOWN');assert.equal((await f.result(s,q.id,{ok:true})).status,409);});
test('reconnect invalidates old sessions, pending commands and staged previews',async t=>{const f=await fixture(t),s=await f.connect(true),p=await stage(f,s),q=await(await f.submit(s)).json();const next=await f.connect(true,'another-project');assert.notEqual(next.sessionId,s.sessionId);assert.equal((await f.poll(s)).status,409);assert.equal((await(await f.request('/commands/'+q.id)).json()).status,'cancelled');assert.equal((await f.submit(next,'apply_world',{previewId:p.previewId})).status,409);});
test('session expires without browser polling even if native status is queried',async t=>{const f=await fixture(t,{sessionIdleMs:30}),s=await f.connect();await delay(50);assert.equal((await(await f.request('/status')).json()).session,null);assert.equal((await f.poll(s)).status,409);});
test('timeout records outcome uncertainty and cannot retry a delivered command',async t=>{
 const f=await fixture(t,{commandTimeoutMs:3000}),s=await f.connect(true),id=randomUUID();
 const submitted=await f.submit(s,'undo',{},id);assert.equal(submitted.status,202);
 const queued=await submitted.json(),polled=await f.poll(s);assert.equal(polled.status,200);
 const batch=await polled.json();assert.equal(batch.commands.length,1);assert.equal(batch.commands[0].id,id);
 // Confirm delivery before waiting for the real deadline; a 30ms deadline could
 // expire in the queue when this file runs alongside the full test suite.
 assert.equal((await(await f.request('/commands/'+id)).json()).status,'delivered');
 await delay(Math.max(0,queued.expiresAt-Date.now())+50);
 const state=await(await f.request('/commands/'+id)).json();assert.equal(state.status,'expired');assert.equal(state.error.code,'COMMAND_OUTCOME_UNKNOWN');
 assert.equal((await f.submit(s,'undo',{},id)).status,409);assert.equal((await f.result(s,id,{ok:true})).status,409);
});
test('cancellation tombstones block a racing late submission',async t=>{const f=await fixture(t),s=await f.connect(true),id=randomUUID();assert.equal((await f.request('/commands/'+id+'/cancel',{method:'POST',body:{}})).status,200);assert.equal((await f.submit(s,'undo',{},id)).status,409);assert.deepEqual((await(await f.poll(s)).json()).commands,[]);});
test('pending queue has a fixed eight command maximum',async t=>{const f=await fixture(t),s=await f.connect();for(let i=0;i<8;i++)assert.equal((await f.submit(s)).status,202);assert.equal((await f.submit(s)).status,429);});
test('body, MIME and arbitrary command schemas fail closed',async t=>{const f=await fixture(t),s=await f.connect();assert.equal((await f.request('/commands',{method:'POST',body:'x'.repeat(524289)})).status,413);assert.equal((await f.request('/commands',{method:'POST',body:{},headers:{'content-type':'text/plain'}})).status,415);for(const [command,args]of[['execute',{code:'evil()'}],['get_scene',{path:'C:/secret'}],['get_scene',{limit:251}],['preview_world',{recipe:{...recipe,script:'evil()'}}],['preview_world',{recipe:{...recipe,operations:[{op:'add',entity:{type:'model',url:'https://evil.test'}}]}}]])assert.equal((await f.submit(s,command,args)).status,400);});
test('preview transport uses the exact engine shape validator including optional scatter defaults',()=>{const value={version:1,seed:1,operations:[{op:'scatter',entity:{type:'box'},count:3,bounds:{min:[0,0],max:[5,5]}}]};assert.equal(validArguments('preview_world',{recipe:value}),true);assert.equal(validArguments('preview_world',{recipe:{...recipe,operations:[{...recipe.operations[0],counts:[51,1]}]}}),false);});
test('result projection rejects asset locations, secrets and arbitrary raw errors',async t=>{const f=await fixture(t),s=await f.connect(),q=await(await f.submit(s)).json();await f.poll(s);const value=scene();value.assets=[{id:'asset',name:'private',mime:'model/gltf-binary',url:'file:///secret'}];assert.equal((await f.result(s,q.id,value)).status,400);const secret=scene();secret.name=f.bridge.token;assert.equal((await f.result(s,q.id,secret)).status,400);const r=await f.request(`/editor/sessions/${s.sessionId}/results`,{browser:true,method:'POST',body:{commandId:q.id,projectId:s.projectId,error:{message:f.bridge.editorToken}}});assert.equal(r.status,200);const state=await(await f.request('/commands/'+q.id)).json();assert.deepEqual(state.error,{code:'EDITOR_REJECTED'});assert.equal(JSON.stringify(state).includes(f.bridge.editorToken),false);});
test('scene projection accepts fixed MIME but excludes provider/legacy metadata',()=>{const p=newProject();p.assets=[{id:'asset',name:'Model',mime:'model/gltf-binary',url:'https://private',cloudId:'private',embedded:'bytes'}];p.legacySource={token:'private'};const projected=sceneContext(p);assert.equal(validResult('get_scene',projected,p.id),true);assert.equal(JSON.stringify(projected).includes('private'),false);});

async function subprocess(t,f){
 const child=spawn(process.execPath,[fileURLToPath(new URL('./mcp-server.mjs',import.meta.url))],{env:{SystemRoot:process.env.SystemRoot,CRATESHIP_EDITOR_TOKEN:f.bridge.token,CRATESHIP_EDITOR_PORT:String(f.address.port)},stdio:['pipe','pipe','pipe'],windowsHide:true});t.after(()=>child.kill());let partial='',stderr='';const waiting=new Map(),responses=[];child.stderr.on('data',x=>stderr+=x);
 child.stdout.on('data',x=>{partial+=x;let n;while((n=partial.indexOf('\n'))>=0){const value=JSON.parse(partial.slice(0,n));partial=partial.slice(n+1);responses.push(value);const waiter=waiting.get(value.id);if(waiter){clearTimeout(waiter.timer);waiting.delete(value.id);waiter.resolve(value);}}});
 const send=message=>child.stdin.write(JSON.stringify({jsonrpc:'2.0',...message})+'\n');
 const rpc=message=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('MCP timed out: '+stderr)),6000);waiting.set(message.id,{resolve,timer});send(message);});
 const init=async()=>{const r=await rpc({id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}}});assert.equal(r.result.protocolVersion,'2025-06-18');send({method:'notifications/initialized'});};
 return {child,send,rpc,init,responses};
}
test('real stdio subprocess discovers tools and reads through paired browser transport',async t=>{const f=await fixture(t),s=await f.connect(),m=await subprocess(t,f);assert.equal((await m.rpc({id:90,method:'tools/list'})).error.code,-32000);await m.init();const list=await m.rpc({id:2,method:'tools/list'});assert.deepEqual(list.result.tools.map(x=>x.name),['get_scene','get_object','preview_world','apply_world','edit_objects','set_level_settings','add_library_model','import_model','place_on_ground','check_scene','screenshot','play_test','save_project','undo']);const pending=m.rpc({id:3,method:'tools/call',params:{name:'get_scene',arguments:{limit:10}}});let command;for(let i=0;i<30&&!command;i++){command=(await(await f.poll(s)).json()).commands[0];if(!command)await delay(20);}assert.ok(command);assert.equal((await f.result(s,command.id,scene())).status,200);const answer=await pending;assert.equal(JSON.parse(answer.result.content[0].text).projectId,s.projectId);assert.equal((await m.rpc({id:3,method:'ping'})).error.code,-32600);});
test('MCP cancellation is handled while a tool is pending and removes queued work',async t=>{const f=await fixture(t),s=await f.connect(),m=await subprocess(t,f);await m.init();m.send({id:2,method:'tools/call',params:{name:'get_scene',arguments:{}}});let command;for(let i=0;i<30&&!command;i++){command=(await(await f.poll(s)).json()).commands[0];if(!command)await delay(20);}assert.ok(command);m.send({method:'notifications/cancelled',params:{requestId:2}});let status;for(let waited=0;waited<5000;waited+=30){status=(await(await f.request('/commands/'+command.id)).json()).status;if(status==='cancelled')break;await delay(30);}assert.equal(status,'cancelled');assert.ok((await m.rpc({id:3,method:'ping'})).result);assert.equal(m.responses.some(x=>x.id===2),false);});
test('MCP rejects arbitrary execution, per-call credentials and oversized unterminated input',async t=>{const f=await fixture(t),m=await subprocess(t,f);await m.init();for(const [i,params]of[{name:'execute_python',arguments:{code:'evil()'}},{name:'get_scene',arguments:{apiKey:'private'}},{name:'apply_world',arguments:{recipe}}].entries())assert.equal((await m.rpc({id:2+i,method:'tools/call',params})).error.code,-32602);m.child.stdin.write('x'.repeat(524289));const limited=()=>m.responses.some(x=>x.error?.message==='MCP input limit exceeded.');for(let waited=0;!limited()&&waited<5000;waited+=25)await delay(25);assert.ok(limited());});
test('real bridge plus browser client previews and applies a world as one reversible change',async t=>{
 const f=await fixture(t),store=new ProjectStore(newProject('Live transport test')),cache=new Map();let writes=0;
 const editor={getProject:()=>store.snapshot(),previewWorld:async value=>{const compiled=compileWorldRecipe(value,store.project),preview={previewId:randomUUID(),summary:compiled.summary,entities:compiled.entities};cache.set(preview.previewId,preview);return preview;},applyWorld:async({previewId})=>{const p=cache.get(previewId);if(!p)throw new Error('stale');cache.delete(previewId);store.commit('MCP world',project=>project.entities.push(...p.entities));writes++;},undo:async()=>{store.undo();}};
 const client=createEditorMcpClient({getEditor:()=>editor,getState:()=>({busy:false,mode:'edit'}),autoPoll:false,fetchFn:(url,options)=>fetch(f.base+new URL(url).pathname,{...options,headers:{...options.headers,origin}})});t.after(()=>client.dispose());await client.connect(f.bridge.editorToken,{allowWrites:true});
 async function run(command,args){console.log('START',command,Date.now()%100000);let done=false;const pending=callEditor(command,args,{token:f.bridge.token,port:f.address.port}).finally(()=>done=true);for(let i=0;i<300&&!done;i++){await client.pollOnce();await delay(15);}return pending;}
 const initial=await run('get_scene',{});assert.equal(initial.entityCount,0);const preview=await run('preview_world',{recipe});assert.equal(preview.entities.length,6);assert.equal(store.project.entities.length,0);await run('apply_world',{previewId:preview.previewId});assert.equal(store.project.entities.length,6);assert.equal(writes,1);assert.equal(store.past.length,1);await run('undo',{});assert.equal(store.project.entities.length,0);
});

// The shipped Mira demo mixes customMesh vector art, a side-view player and gameplay components; AI clients must be able to read it.
test('Mira demo recipe previews and reads back through the MCP contracts',()=>{
 const demo=JSON.parse(readFileSync(fileURLToPath(new URL('../../platform/media/skybound-sprint-recipe.json',import.meta.url)),'utf8'));
 assert.equal(validArguments('preview_world',{recipe:demo}),true);
 const project=newProject('Mira');project.id='project-one';const compiled=compileWorldRecipe(demo,project);
 assert.ok(compiled.entities.some(e=>e.type==='customMesh'&&e.shape));assert.ok(compiled.entities.some(e=>e.components.player?.sideView));
 assert.equal(validResult('preview_world',{projectId:'project-one',previewId:randomUUID(),summary:compiled.summary,entities:compiled.entities},'project-one'),true);
 project.entities=compiled.entities;project.settings={...project.settings,lives:3,killY:-12};
 assert.equal(validResult('get_scene',sceneContext(project),'project-one'),true);
});
test('gameplay components and level settings pass the contracts; malformed ones fail closed',()=>{
 const level={version:1,seed:'rules',operations:[
  {op:'add',entity:{type:'capsule',name:'Hero',position:[0,1,0],components:{rigidbody:{type:'dynamic'},player:{speed:5,jump:7,sideView:true}}}},
  {op:'add',entity:{type:'box',name:'Lift',components:{rigidbody:{type:'static',collider:'shape'},mover:{offset:[4,0,0],period:3}}}},
  {op:'add',entity:{type:'box',name:'Spikes',components:{hazard:{}}}},{op:'add',entity:{type:'box',name:'Flag',components:{goal:{message:'Done'}}}},{op:'add',entity:{type:'box',name:'Save',components:{checkpoint:{}}}}]};
 assert.equal(validArguments('preview_world',{recipe:level}),true);
 const compiled=compileWorldRecipe(level,newProject());assert.equal(validResult('preview_world',{previewId:randomUUID(),summary:compiled.summary,entities:compiled.entities},undefined),true);
 for(const bad of [{hazard:{damage:5}},{mover:{offset:[1,2],period:3}},{goal:{message:1}},{rigidbody:{type:'static',collider:'mesh'}},{teleport:{}}])assert.equal(validArguments('preview_world',{recipe:{version:1,seed:1,operations:[{op:'add',entity:{type:'box',components:bad}}]}}),false,JSON.stringify(bad));
 assert.throws(()=>compileWorldRecipe({version:1,seed:1,operations:[{op:'add',entity:{type:'empty',components:{goal:{}}}}]},newProject()),/renderable/);
 assert.throws(()=>compileWorldRecipe({version:1,seed:1,operations:[{op:'add',entity:{type:'capsule',components:{rigidbody:{type:'dynamic'},player:{},hazard:{}}}}]},newProject()),/player cannot/);
 assert.equal(validArguments('set_level_settings',{settings:{lives:3,killY:-20,gravity:-12}}),true);
 for(const bad of [{},{lives:100},{lives:1.5},{killY:'low'},{script:'x'}])assert.equal(validArguments('set_level_settings',{settings:bad}),false,JSON.stringify(bad));
});
test('edit_objects accepts bounded partial patches and rejects unsupported edits',async()=>{
 const ok={summary:'Tune lift',operations:[{op:'update',id:'lift',patch:{position:[1,2,3],material:{color:'#ff0000'},components:{mover:{offset:[0,3,0],period:2},hazard:null}}},{op:'remove',id:'old-coin'}]};
 assert.equal(validArguments('edit_objects',ok),true);
 for(const bad of [{operations:[]},{operations:[{op:'update',id:'a',patch:{}}]},{operations:[{op:'update',id:'a',patch:{type:'model'}}]},{operations:[{op:'update',id:'a',patch:{parentId:'b'}}]},{operations:[{op:'update',id:'a',patch:{components:{mover:{period:500}}}}]},{operations:[{op:'remove',id:'a'},{op:'remove',id:'a'}]},{operations:[{op:'add',id:'a'}]},{operations:[{op:'remove',id:'../x'}]},{operations:[{op:'remove',id:'a'}],code:'x'}])assert.equal(validArguments('edit_objects',bad),false,JSON.stringify(bad));
 const tools=await toolDefinitions();for(const name of ['edit_objects','set_level_settings'])assert.equal(tools.find(t=>t.name===name).annotations.readOnlyHint,false);
});
test('bridge refuses edit and settings commands until writes are granted',async t=>{const f=await fixture(t),s=await f.connect();assert.equal((await f.submit(s,'edit_objects',{operations:[{op:'remove',id:'a'}]})).status,403);assert.equal((await f.submit(s,'set_level_settings',{settings:{lives:3}})).status,403);});
test('real bridge plus browser client builds a level, edits it, sets rules and undoes each step',async t=>{
 const f=await fixture(t),store=new ProjectStore(newProject('Level build')),cache=new Map();
 const editor={getProject:()=>store.snapshot(),previewWorld:async value=>{const compiled=compileWorldRecipe(value,store.project),preview={previewId:randomUUID(),summary:compiled.summary,entities:compiled.entities};cache.set(preview.previewId,preview);return preview;},applyWorld:async({previewId})=>{const p=cache.get(previewId);cache.delete(previewId);store.commit('MCP world',project=>project.entities.push(...p.entities));},undo:async()=>{store.undo();},applyProposal:proposal=>store.apply(proposal),updateSettings:patch=>store.commit('Scene settings',project=>project.settings={...project.settings,...patch})};
 const client=createEditorMcpClient({getEditor:()=>editor,getState:()=>({busy:false,mode:'edit'}),autoPoll:false,fetchFn:(url,options)=>fetch(f.base+new URL(url).pathname,{...options,headers:{...options.headers,origin}})});t.after(()=>client.dispose());await client.connect(f.bridge.editorToken,{allowWrites:true});
 async function run(command,args){let done=false;const pending=callEditor(command,args,{token:f.bridge.token,port:f.address.port}).finally(()=>done=true);pending.catch(()=>{});for(let i=0;i<300&&!done;i++){await client.pollOnce();await delay(15);}return pending;}
 const level={version:1,seed:'e2e',operations:[{op:'add',entity:{type:'capsule',name:'Hero',position:[0,1,0],components:{rigidbody:{type:'dynamic'},player:{sideView:true}}}},{op:'add',entity:{type:'box',name:'Lift',material:{color:'#c9b458',roughness:.4},components:{rigidbody:{type:'static'},mover:{offset:[4,0,0],period:3}}}},{op:'add',entity:{type:'box',name:'Spikes',components:{hazard:{}}}}]};
 const preview=await run('preview_world',{recipe:level});await run('apply_world',{previewId:preview.previewId});
 const read=await run('get_scene',{});const lift=read.entities.find(e=>e.name==='Lift'),spikes=read.entities.find(e=>e.name==='Spikes');assert.deepEqual(lift.components.mover,{offset:[4,0,0],period:3});
 const edited=await run('edit_objects',{summary:'Slow lift, drop spikes',operations:[{op:'update',id:lift.id,patch:{material:{color:'#ff8800'},components:{mover:{offset:[0,2,0],period:6}}}},{op:'remove',id:spikes.id}]});assert.equal(edited.ok,true);assert.equal(edited.entityCount,2);
 const after=store.project.entities.find(e=>e.id===lift.id);assert.deepEqual(after.components.mover,{offset:[0,2,0],period:6});assert.equal(after.components.rigidbody.type,'static');assert.equal(after.material.color,'#ff8800');assert.equal(after.material.roughness,.4);
 await run('edit_objects',{operations:[{op:'update',id:lift.id,patch:{components:{mover:null}}}]});assert.equal(store.project.entities.find(e=>e.id===lift.id).components.mover,undefined);
 const hero=read.entities.find(e=>e.name==='Hero');await assert.rejects(run('edit_objects',{operations:[{op:'update',id:hero.id,patch:{components:{goal:{}}}}]}));assert.equal(store.project.entities.find(e=>e.id===hero.id).components.goal,undefined);
 await run('set_level_settings',{settings:{lives:3,killY:-15}});assert.equal(store.project.settings.lives,3);assert.equal(store.project.settings.killY,-15);assert.equal((await run('get_scene',{})).settings.lives,3);
 await run('undo',{});assert.equal(store.project.settings.lives,0);await run('undo',{});assert.ok(store.project.entities.find(e=>e.id===lift.id).components.mover);await run('undo',{});assert.equal(store.project.entities.length,3);
});
test('get_object returns full customMesh art that edit_objects can change; shape edits need a customMesh', async () => {
 const demo=JSON.parse(readFileSync(fileURLToPath(new URL('../../platform/media/skybound-sprint-recipe.json',import.meta.url)),'utf8'));
 const project=newProject('Mira');project.id='project-one';project.entities=compileWorldRecipe(demo,project).entities;
 const art=project.entities.find(e=>e.type==='customMesh'&&e.shape),plainBox=project.entities.find(e=>e.type!=='customMesh');
 assert.equal(validArguments('get_object',{id:art.id}),true); assert.equal(validArguments('get_object',{id:'../x'}),false); assert.equal(validArguments('get_object',{}),false);
 assert.equal(sceneContext(project).entities.find(e=>e.id===art.id).shape,undefined);
 const full=objectContext(project,art.id); assert.deepEqual(full.entity.shape,art.shape); assert.equal(validResult('get_object',full,'project-one'),true);
 assert.equal(validResult('get_object',full,'other-project'),false); assert.throws(()=>objectContext(project,'missing'),/not in this project/);
 assert.ok((await toolDefinitions()).some(t=>t.name==='get_object'&&t.annotations.readOnlyHint));
 const recolored={paths:art.shape.paths.map(path=>({...path,color:'#123456'}))};
 const edit={operations:[{op:'update',id:art.id,patch:{shape:recolored}}]};
 assert.equal(validArguments('edit_objects',edit),true);
 assert.deepEqual(editObjectOperations(project,edit.operations)[0].patch.shape,recolored);
 assert.throws(()=>editObjectOperations(project,[{op:'update',id:plainBox.id,patch:{shape:recolored}}]),/Only customMesh/);
 assert.equal(validArguments('edit_objects',{operations:[{op:'update',id:art.id,patch:{shape:{paths:[{points:[[0,0],[1,1]],color:'#ffffff'}]}}}]}),false);
});
