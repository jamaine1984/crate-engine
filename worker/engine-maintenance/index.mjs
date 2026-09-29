import {runMaintenance} from '../../platform/server/maintenance.mjs';
/** Bind only to the private platform database/bucket. No public HTTP actions. Runs once a day (see wrangler.toml). */
export default {async fetch(){return new Response('Not found',{status:404});},async scheduled(event,env,context){context.waitUntil(runMaintenance(env).then(summary=>console.log(JSON.stringify({event:'platform.maintenance.run',cron:event.cron,...summary}))));}};
