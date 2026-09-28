import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {Readable} from 'node:stream';
import {createServer as createVite} from 'vite';
import {sqliteD1} from './sqlite-d1.mjs';
import {localR2} from './local-r2.mjs';
import {onRequest} from '../../functions/api/platform/[[path]].js';

const root=resolve(import.meta.dirname,'../..'),dir=resolve(root,'.platform-local');
await mkdir(dir,{recursive:true});
const sqlite=new DatabaseSync(resolve(dir,'platform.sqlite'));
sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY);');
for(const name of (await readdir(resolve(root,'platform/migrations'))).filter(n=>n.endsWith('.sql')).sort()){
 if(sqlite.prepare('SELECT 1 FROM local_migrations WHERE name=?').get(name))continue;
 sqlite.exec('BEGIN');try{sqlite.exec(await readFile(resolve(root,'platform/migrations',name),'utf8'));sqlite.prepare('INSERT INTO local_migrations VALUES(?)').run(name);sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}
}
const secretFile=resolve(dir,'secrets.json');let secrets;
try{secrets=JSON.parse(await readFile(secretFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;secrets={AUTH_SECRET:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'),ENCRYPTION_KEY:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')};await writeFile(secretFile,JSON.stringify(secrets),{mode:0o600});}
const port=Number(process.env.PLATFORM_PORT||4173),origin=`http://127.0.0.1:${port}`;
const env={...secrets,APP_ORIGIN:origin,AUTH_LOCAL_DEV:'true',PLATFORM_DB:sqliteD1(sqlite),ENGINE_ASSETS:await localR2(resolve(dir,'engine-assets')),PLATFORM_UPLOADS:await localR2(resolve(dir,'platform-uploads'))};
// Only explicit local mail/OAuth configuration is read; absent providers stay disabled.
for(const key of ['MAIL_PROVIDER','MAIL_FROM','MAIL_API_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET'])if(process.env[key])env[key]=process.env[key];
const built=process.argv.includes('--built');
const vite=built?null:await createVite({root,server:{middlewareMode:true},appType:'mpa'});
const staticTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.map':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8','.wasm':'application/wasm','.glb':'model/gltf-binary'};
const paths=/^\/(games|game|history|marketplace|coming-soon|library|favorites|rewards|profile|settings|login|signup|forgot-password|reset-password|verify-email|auth|notifications|developer|developers|owners-portal|creators|community|support|privacy|terms)(\/|$)|^\/engine\/projects/;
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin);
  if(url.pathname.startsWith('/api/')){
   if(!url.pathname.startsWith('/api/platform/')){res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'Legacy cloud services are unavailable in the isolated local preview.'}));return;}
   const headers=new Headers();for(const [k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
   headers.set('cf-connecting-ip','127.0.0.1');
   const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
   const response=await onRequest({request,env,params:{path:url.pathname.slice('/api/platform/'.length).split('/')}});
   res.statusCode=response.status;for(const [k,v]of response.headers)if(k!=='set-cookie')res.setHeader(k,v);
   if(response.headers.getSetCookie().length)res.setHeader('set-cookie',response.headers.getSetCookie());
   res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  if(paths.test(url.pathname))req.url='/index.html'+url.search;
  else if(url.pathname==='/play'||url.pathname==='/engine')req.url='/play.html'+url.search;
  if(built){
   const base=resolve(root,'dist'),pathname=new URL(req.url,origin).pathname,target=resolve(base,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
   if(!target.startsWith(base+sep)){res.writeHead(404);res.end('Not found');return;}
   try{const bytes=await readFile(target);res.writeHead(200,{'content-type':staticTypes[extname(target)]||'application/octet-stream','x-content-type-options':'nosniff','cache-control':'no-store'});res.end(bytes);}catch(error){if(['ENOENT','EISDIR'].includes(error.code)){res.writeHead(404);res.end('Not found');}else throw error;}
  }else vite.middlewares(req,res,()=>{res.writeHead(404);res.end('Not found');});
 }catch(e){console.error(e);res.writeHead(500);res.end('Local server error');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Crate Ship Games local preview: ${origin}\nSQLite persists in .platform-local. No production database or storage is bound.`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{server.close();await vite?.close();sqlite.close();process.exit(0);});
