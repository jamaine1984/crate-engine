import {modelConnectionErasureStatements} from './model-connections.mjs';
import {engineAssetErasureStatements} from './engine-assets.mjs';
/** Called inside identity's atomic deletion transaction, after reauth and privilege checks. */
export function accountErasureStatements(env,userId){
 const db=env.PLATFORM_DB;
 const tables=['platform_projects','platform_progress','platform_preferences','platform_favorites','platform_library','platform_play_history','platform_notifications','platform_waitlist'];
 return [...engineAssetErasureStatements(env,userId),...modelConnectionErasureStatements(env,userId),...tables.map(table=>db.prepare(`DELETE FROM ${table} WHERE user_id=?`).bind(userId)),db.prepare('UPDATE platform_game_sessions SET user_id=NULL WHERE user_id=?').bind(userId)];
 // Financial/rights/security records retain the pseudonymous user id; credentials and profile are erased by identity.
}
