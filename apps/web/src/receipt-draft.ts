import type {Expense,ExpenseInput,Receipt,Trip} from '../../../packages/domain/src/model.js';
/** '' means a general item shared by everyone on the trip; otherwise an event (meal or activity) ID. */
export type DraftItem={key:string;label:string;amount:string;target:string};
export type ReceiptDraft={title:string;date:string;category:Expense['category'];payer:string;total:string;items:DraftItem[]};
export type TargetTotal={target:string;name:string;people:number;amount:number;items:number};
export function parseCents(value:string):number|null{
 const normalized=value.trim().replace(/\s/g,'').replace(',','.');
 if(!/^-?\d+(\.\d{0,2})?$/.test(normalized))return null;
 const cents=Math.round(Number(normalized)*100);
 return Number.isSafeInteger(cents)?cents:null;
}
export const formatCents=(n:number)=>(n/100).toFixed(2);
export function draftFromReceipt(receipt:Receipt,trip:Trip,fallbackDate:string,makeKey:()=>string):ReceiptDraft{
 const date=/^\d{4}-\d{2}-\d{2}$/.test(receipt.date)?receipt.date:fallbackDate;
 // Pre-assign to the only meal on that day, which is the common "groceries for tonight" case.
 const sameDay=trip.events.filter(e=>e.date===date&&e.participants.length);
 const target=sameDay.length===1?sameDay[0].id:'';
 return {title:receipt.merchant||'Receipt',date,category:'food',payer:trip.families[0]?.id??'',total:receipt.total===null?'':formatCents(receipt.total),
  items:receipt.items.map(item=>({key:makeKey(),label:item.label,amount:formatCents(item.amount),target}))};
}
export function targetName(trip:Trip,target:string){return target?trip.events.find(e=>e.id===target)?.title??'Removed event':'General · everyone';}
export function reviewSummary(draft:ReceiptDraft,trip:Trip){
 const invalid=draft.items.filter(i=>i.label.trim()===''||parseCents(i.amount)===null).map(i=>i.key);
 const reviewed=draft.items.reduce((n,i)=>n+(parseCents(i.amount)??0),0);
 const total=parseCents(draft.total);
 const groups=new Map<string,TargetTotal>();
 for(const item of draft.items){
  const amount=parseCents(item.amount)??0;
  const event=trip.events.find(e=>e.id===item.target);
  const group=groups.get(item.target)??{target:item.target,name:targetName(trip,item.target),people:item.target?event?.participants.length??0:trip.people.length,amount:0,items:0};
  group.amount+=amount;group.items++;groups.set(item.target,group);
 }
 const emptyTargets=[...groups.values()].filter(g=>g.people===0);
 const difference=total===null?null:total-reviewed;
 const problems:string[]=[];
 if(!draft.items.length)problems.push('Add at least one item.');
 if(invalid.length)problems.push('Every item needs a name and an amount like 4.99.');
 if(total===null)problems.push('Enter the receipt total.');
 else if(difference!==0)problems.push(`Items are ${formatCents(Math.abs(difference!))} € ${difference!>0?'below':'above'} the receipt total.`);
 if(emptyTargets.length)problems.push(`${emptyTargets.map(g=>g.name).join(', ')} has nobody to share the cost.`);
 if(!draft.payer)problems.push('Choose who paid.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(draft.date))problems.push('Choose a date.');
 if(!draft.title.trim())problems.push('Give the expense a name.');
 return {reviewed,total,difference,groups:[...groups.values()].sort((a,b)=>b.amount-a.amount),invalid,problems,ready:problems.length===0};
}
/** Turns a reviewed draft into an expense with one line per item, each split by its meal/activity participants or everyone. */
export function expenseFromDraft(draft:ReceiptDraft,trip:Trip,receiptId:string,makeId:()=>string):ExpenseInput{
 const summary=reviewSummary(draft,trip);
 if(!summary.ready)throw new Error(summary.problems[0]);
 const everyone=trip.people.map(p=>({id:p.id,weight:p.weight}));
 const lines=draft.items.map(item=>{
  const amount=parseCents(item.amount)!;
  const event=item.target?trip.events.find(e=>e.id===item.target):undefined;
  return {id:makeId(),label:item.label.trim(),amount,splits:[{amount,eventId:event?.id??null,eventVersion:event?.version,weights:event?event.participants:everyone,fixed:[],personFixed:[]}]};
 });
 return {id:makeId(),title:draft.title.trim(),date:draft.date,category:draft.category,total:summary.total!,payers:[{familyId:draft.payer,amount:summary.total!}],lines,notes:'',receiptIds:[receiptId],status:'posted',version:0};
}
