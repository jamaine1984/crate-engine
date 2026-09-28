import {newProject,validateProject,cleanEntity,validateProposal} from './schema.mjs';
export class ProjectStore {
 constructor(project=newProject(),onChange=()=>{}){this.project=validateProject(project);this.onChange=onChange;this.past=[];this.future=[];}
 snapshot(){return structuredClone(this.project);}
 load(project){this.project=validateProject(project);this.past=[];this.future=[];this.emit();}
 emit(){this.project.updatedAt=Date.now();this.onChange(this.snapshot());}
 commit(label,fn){const before=this.snapshot(),next=this.snapshot();fn(next);const checked=validateProject(next);this.past.push({label,project:before});if(this.past.length>80)this.past.shift();this.future=[];this.project=checked;this.emit();return this.snapshot();}
 add(type,patch={}){const e=cleanEntity({type,...patch});this.commit('Add '+e.name,p=>p.entities.push(e));return e.id;}
 update(id,patch){return this.commit('Edit object',p=>{const i=p.entities.findIndex(e=>e.id===id);if(i<0)throw new Error('Object no longer exists.');p.entities[i]=cleanEntity({...p.entities[i],...patch,id});});}
 remove(id){return this.commit('Remove object',p=>{const removed=new Set([id]);let changed=true;while(changed){changed=false;for(const e of p.entities)if(removed.has(e.parentId)&&!removed.has(e.id)){removed.add(e.id);changed=true;}}p.entities=p.entities.filter(e=>!removed.has(e.id));});}
 duplicate(id){
  const source=this.project.entities.find(e=>e.id===id);if(!source)throw new Error('Select an object first.');
  const descendants=new Set([id]);let changed=true;
  while(changed){changed=false;for(const entity of this.project.entities)if(descendants.has(entity.parentId)&&!descendants.has(entity.id)){descendants.add(entity.id);changed=true;}}
  const ids=new Map([...descendants].map(oldId=>[oldId,crypto.randomUUID()]));
  this.commit('Duplicate '+source.name,project=>{const copies=project.entities.filter(entity=>descendants.has(entity.id)).map(entity=>{const copy=structuredClone(entity);copy.id=ids.get(entity.id);copy.parentId=ids.get(entity.parentId)||entity.parentId;if(entity.id===id){copy.name=copy.name.slice(0,95)+' copy';copy.position[0]+=1;}return copy;});project.entities.push(...copies);});
  return ids.get(id);
 }
 undo(){const item=this.past.pop();if(!item)return false;this.future.push({label:item.label,project:this.snapshot()});this.project=item.project;this.emit();return true;}
 redo(){const item=this.future.pop();if(!item)return false;this.past.push({label:item.label,project:this.snapshot()});this.project=item.project;this.emit();return true;}
 apply(proposal){const validated=validateProposal(proposal);return this.commit(validated.summary,p=>{for(const op of validated.operations){if(op.op==='add')p.entities.push(op.entity);else{const i=p.entities.findIndex(e=>e.id===op.id);if(i<0)throw new Error('The proposal references an object that is no longer present.');if(op.op==='update')p.entities[i]=cleanEntity({...p.entities[i],...op.patch,id:op.id});else{const children=p.entities.filter(e=>e.parentId===op.id);if(children.length)throw new Error('Remove child objects before their parent.');p.entities.splice(i,1);}}}});}
}
