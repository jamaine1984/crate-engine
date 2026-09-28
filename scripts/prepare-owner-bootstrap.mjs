/** Generates a reviewable SQL file. Does not connect to D1 or grant any role. */
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const email=process.argv[2]?.trim().toLowerCase();
if(!email||email.length>254||!/^[a-z0-9.!#$%&*+\-/=?^_`{|}~]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)||email.includes("'"))throw new Error('Pass the intended verified owner email.');
const sql=`-- Review this file and target a NEW platform database only.
-- Requires an existing active verified account with enrolled MFA. No account is fabricated.
-- D1 CLI transaction handling should be used for the entire script in one request.
INSERT INTO platform_user_roles(user_id,role,created_at)
SELECT u.id,'OWNER',unixepoch() FROM platform_users u JOIN platform_mfa m ON m.user_id=u.id
WHERE lower(u.email)='${email}' AND u.status='active' AND u.email_verified=1 AND m.enabled=1
AND NOT EXISTS(SELECT 1 FROM platform_user_roles WHERE role='OWNER');
INSERT INTO platform_audit(id,actor_id,action,target_id,detail_json,result,created_at)
SELECT lower(hex(randomblob(16))),u.id,'owner.bootstrap',u.id,'{"method":"reviewed_operator_sql"}','success',unixepoch()
FROM platform_users u WHERE lower(u.email)='${email}' AND changes()=1;
UPDATE platform_sessions SET revoked_at=unixepoch() WHERE user_id IN (SELECT u.id FROM platform_users u JOIN platform_user_roles r ON r.user_id=u.id WHERE lower(u.email)='${email}' AND r.role='OWNER') AND revoked_at IS NULL;
SELECT u.id,u.email,r.role FROM platform_users u JOIN platform_user_roles r ON r.user_id=u.id WHERE lower(u.email)='${email}' AND r.role='OWNER';
-- Zero final rows means setup did not meet prerequisites. Do not weaken the checks.
`;
const dir=resolve(import.meta.dirname,'../.platform-local');await mkdir(dir,{recursive:true});
await writeFile(resolve(dir,'owner-bootstrap.sql'),sql);console.log('Prepared ignored .platform-local/owner-bootstrap.sql for review. No database was modified.');
