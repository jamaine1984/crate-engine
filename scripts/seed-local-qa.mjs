// Explicit disposable local browser QA fixture. Never imports production credentials or connects remotely.
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {hashPassword} from '../platform/server/identity.mjs';
if(process.argv[2]!=='--local-only')throw new Error('Run with --local-only after starting npm run dev:platform.');
const root=resolve(import.meta.dirname,'..'),secrets=JSON.parse(await readFile(resolve(root,'.platform-local/secrets.json'),'utf8'));
const db=new DatabaseSync(resolve(root,'.platform-local/platform.sqlite'));
const userId='local-ui-qa-player',email='qa-player@example.test',stamp=Math.floor(Date.now()/1000);
const password='Local-QA-Only-September-2026';
db.prepare("INSERT OR IGNORE INTO platform_users(id,email,username,display_name,password_hash,email_verified,status,created_at,updated_at) VALUES(?,?,?,?,?,1,'active',?,?)").run(userId,email,'local_qa_player','Local QA Player',await hashPassword(password,secrets),stamp,stamp);
db.prepare('INSERT OR IGNORE INTO platform_user_roles VALUES(?,?,?)').run(userId,'PLAYER',stamp);db.close();
console.log('Created or retained disposable local-only QA player qa-player@example.test. Test password is documented in this local QA script. No production account was created.');
