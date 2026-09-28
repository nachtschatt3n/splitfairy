import {allocateExpense} from '../../../packages/domain/src/accounting.js';
import type {Command,Trip} from '../../../packages/domain/src/model.js';
export function overlay(trip:Trip,commands:Command[]):Trip{
 const next:Trip=structuredClone(trip);
 for(const command of commands){
  if(command.entity==='trip'){if(command.action==='save')Object.assign(next,command.value);continue;}
  const key=({family:'families',person:'people',event:'events',shopping:'shopping',expense:'expenses',payment:'payments'})[command.entity];
  const list=(next as any)[key] as any[],value=command.value as any,index=list.findIndex(row=>row.id===value.id);
  if(command.action==='delete'){if(index>=0)list.splice(index,1);continue;}
  const updated={...value,version:(index>=0?list[index].version:0)+1};
  if(command.entity==='expense'){
   try{updated.allocations=value.status==='void'?[]:allocateExpense({total:value.total,payers:value.payers,splits:value.lines.flatMap((l:any)=>l.splits)},next.people);}catch{updated.allocations=[];}
  }
  if(index<0)list.push(updated);else list[index]=updated;
 }
 return next;
}
