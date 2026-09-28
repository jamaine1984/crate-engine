/** Save-before-leaving workflow. The runtime keeps ownership of scene state. */
export function createEditorNavigation({getState,stop,save,approve,navigate}){
 let pending=null,running=false;
 const assertReady=()=>{if(running||getState().busy)throw new Error('Wait for the current editor operation to finish before leaving.');};
 async function finish(saveChanges){
  assertReady();if(!pending)throw new Error('Choose a destination first.');running=true;
  try{if(getState().mode==='play')await stop();if(saveChanges)await save();approve(true);await navigate(pending);pending=null;}
  catch(error){approve(false);throw error;}finally{running=false;}
 }
 return {
  get pending(){return pending;},get running(){return running;},
  async request(href){assertReady();pending=href;if(getState().dirty)return {needsSave:true};await finish(false);return {needsSave:false};},
  saveAndLeave:()=>finish(true),leaveWithoutSaving:()=>finish(false),
  cancel(){if(running)return false;pending=null;return true;},
 };
}
