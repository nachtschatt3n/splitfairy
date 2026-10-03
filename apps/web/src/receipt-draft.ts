import type {Expense,ExpenseInput,Receipt,SplitMode,Trip} from '../../../packages/domain/src/model.js';
/** A split made with the split editor (equally, exact, percent, shares, adjust, by family), or why it is not complete. */
export type CustomSplit={mode:SplitMode;weights:{id:string;weight:number}[];fixed:{familyId:string;amount:number}[];personFixed:{personId:string;amount:number}[];people:number}|{error:string};
/** `target`: '' for everyone, an event (meal or activity) ID, 'family:<id>', 'person:<id>', or 'custom' (then `custom` holds the split). */
export type DraftItem={key:string;label:string;amount:string;target:string;custom?:CustomSplit};
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
const FAMILY='family:',PERSON='person:';
export const CUSTOM='custom';
export const familyTarget=(familyId:string)=>`${FAMILY}${familyId}`;
export const personTarget=(personId:string)=>`${PERSON}${personId}`;
const familyOf=(trip:Trip,target:string)=>target.startsWith(FAMILY)?trip.families.find(f=>f.id===target.slice(FAMILY.length)):undefined;
const personOf=(trip:Trip,target:string)=>target.startsWith(PERSON)?trip.people.find(p=>p.id===target.slice(PERSON.length)):undefined;
/** Who shares an item, with their weights (custom splits carry their own). */
function sharers(trip:Trip,target:string){
 if(!target)return trip.people.map(p=>({id:p.id,weight:p.weight}));
 if(target.startsWith(FAMILY)){const f=familyOf(trip,target);return f?trip.people.filter(p=>p.familyId===f.id).map(p=>({id:p.id,weight:p.weight})):[];}
 if(target.startsWith(PERSON)){const p=personOf(trip,target);return p?[{id:p.id,weight:1}]:[];}
 return trip.events.find(e=>e.id===target)?.participants??[];
}
export function targetName(trip:Trip,target:string){
 if(!target)return 'General · everyone';
 if(target===CUSTOM)return 'Custom split';
 if(target.startsWith(FAMILY))return `Only ${familyOf(trip,target)?.name??'a removed family'}`;
 if(target.startsWith(PERSON))return `Only ${personOf(trip,target)?.name??'a removed person'}`;
 return trip.events.find(e=>e.id===target)?.title??'Removed event';
}
export function reviewSummary(draft:ReceiptDraft,trip:Trip){
 const invalid=draft.items.filter(i=>i.label.trim()===''||parseCents(i.amount)===null).map(i=>i.key);
 const reviewed=draft.items.reduce((n,i)=>n+(parseCents(i.amount)??0),0);
 const total=parseCents(draft.total);
 const groups=new Map<string,TargetTotal>();
 for(const item of draft.items){
  const amount=parseCents(item.amount)??0;
  // Each custom split is its own row, named after its item.
  const custom=item.target===CUSTOM,id=custom?`${CUSTOM}:${item.key}`:item.target;
  const people=custom?(item.custom&&!('error' in item.custom)?item.custom.people:0):sharers(trip,item.target).length;
  const group=groups.get(id)??{target:id,name:custom?`${item.label.trim()||'Item'} · custom split`:targetName(trip,item.target),people,amount:0,items:0};
  group.amount+=amount;group.items++;groups.set(id,group);
 }
 const unfinished=draft.items.filter(i=>i.target===CUSTOM&&(!i.custom||'error' in i.custom));
 const emptyTargets=[...groups.values()].filter(g=>g.people===0);
 const difference=total===null?null:total-reviewed;
 const problems:string[]=[];
 if(!draft.items.length)problems.push('Add at least one item.');
 if(invalid.length)problems.push('Every item needs a name and an amount like 4.99.');
 if(total===null)problems.push('Enter the receipt total.');
 else if(difference!==0)problems.push(`Items are ${formatCents(Math.abs(difference!))} € ${difference!>0?'below':'above'} the receipt total.`);
 for(const item of unfinished)problems.push(`${item.label.trim()||'An item'}: ${item.custom&&'error' in item.custom?item.custom.error:'finish its split.'}`);
 const empty=emptyTargets.filter(g=>!g.target.startsWith(`${CUSTOM}:`));
 if(empty.length)problems.push(`${empty.map(g=>g.name).join(', ')} has nobody to share the cost.`);
 if(!draft.payer)problems.push('Choose who paid.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(draft.date))problems.push('Choose a date.');
 if(!draft.title.trim())problems.push('Give the expense a name.');
 return {reviewed,total,difference,groups:[...groups.values()].sort((a,b)=>b.amount-a.amount),invalid,problems,ready:problems.length===0};
}
/** Turns a reviewed draft into an expense with one line per item: split by its meal/activity, one family or person, everyone, or its custom split. */
export function expenseFromDraft(draft:ReceiptDraft,trip:Trip,receiptId:string,makeId:()=>string):ExpenseInput{
 const summary=reviewSummary(draft,trip);
 if(!summary.ready)throw new Error(summary.problems[0]);
 const lines=draft.items.map(item=>{
  const amount=parseCents(item.amount)!;
  const event=item.target?trip.events.find(e=>e.id===item.target):undefined;
  if(item.target===CUSTOM&&item.custom&&!('error' in item.custom)){const {mode,weights,fixed,personFixed}=item.custom;return {id:makeId(),label:item.label.trim(),amount,splits:[{amount,eventId:null,mode,weights,fixed,personFixed}]};}
  return {id:makeId(),label:item.label.trim(),amount,splits:[{amount,eventId:event?.id??null,eventVersion:event?.version,weights:sharers(trip,item.target),fixed:[],personFixed:[]}]};
 });
 return {id:makeId(),title:draft.title.trim(),date:draft.date,category:draft.category,total:summary.total!,payers:[{familyId:draft.payer,amount:summary.total!}],lines,notes:'',receiptIds:[receiptId],status:'posted',version:0};
}
