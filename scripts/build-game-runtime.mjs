import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'engine/distribution');await mkdir(out,{recursive:true});
await build({entryPoints:[resolve(root,'engine/player/main.mjs')],bundle:true,format:'iife',globalName:'CrateGame',outfile:resolve(out,'game-runtime.js'),minify:true,target:'es2022',legalComments:'eof'});
let licenses='Crate Ship Engine runtime third-party notices\n';for(const [name,file]of [['three','LICENSE'],['three-mesh-bvh','LICENSE']])licenses+='\n\n'+name+'\n'+await readFile(resolve(root,'node_modules',name,file),'utf8');
licenses+='\n\nRapier / Dimforge — Apache-2.0\n'+await readFile(resolve(root,'engine/licenses/Rapier-LICENSE'),'utf8');
await writeFile(resolve(out,'THIRD-PARTY.txt'),licenses);console.log('Portable game runtime built.');
