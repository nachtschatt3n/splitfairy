import {useMemo,useState} from 'react';
import {CalendarDays,Check,Plus,SlidersHorizontal,Trash2,User,Users,X} from 'lucide-react';
import type {Expense,ExpenseInput,Receipt,Trip} from '../../../packages/domain/src/model.js';
import {fmt} from './common.js';
import {CUSTOM,targetName,draftFromReceipt,expenseFromDraft,familyTarget,formatCents,parseCents,personTarget,reviewSummary,type CustomSplit,type ReceiptDraft} from './receipt-draft.js';
import {SplitEditor,compileSplit,initialSplit,type SplitState} from './split.js';
const euro=(n:number)=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(n/100);
const shortDate=fmt;
export function ReceiptReview({trip,receipt,today,busy,onClose,onConfirm,onDismiss}:{trip:Trip;receipt:Receipt;today:string;busy:boolean;onClose:()=>void;onConfirm:(expense:ExpenseInput)=>void;onDismiss:()=>void}){
 const [draft,setDraft]=useState<ReceiptDraft>(()=>draftFromReceipt(receipt,trip,today,()=>crypto.randomUUID()));
 const [bulk,setBulk]=useState('');
 // Items with "Custom split…" use the same split editor as a new expense; its result goes into the draft here.
 const [splits,setSplits]=useState<Record<string,SplitState>>({});
 const resolved=useMemo<ReceiptDraft>(()=>({...draft,items:draft.items.map(item=>{
  if(item.target!==CUSTOM)return item;
  const state=splits[item.key];if(!state)return {...item,custom:{error:'finish its split.'}};
  const compiled=compileSplit(state,trip.people,parseCents(item.amount)??0,trip);
  if('error' in compiled)return {...item,custom:compiled};
  const who=new Set([...compiled.weights.filter(w=>w.weight>0).map(w=>w.id),...compiled.personFixed.map(f=>f.personId),...trip.people.filter(p=>compiled.fixed.some(f=>f.familyId===p.familyId)).map(p=>p.id)]);
  return {...item,custom:{...compiled,people:who.size} as CustomSplit};
 })}),[draft,splits,trip]);
 const summary=useMemo(()=>reviewSummary(resolved,trip),[resolved,trip]);
 const events=[...trip.events].sort((a,b)=>a.date.localeCompare(b.date));
 const setItem=(key:string,patch:Partial<ReceiptDraft['items'][number]>)=>setDraft(d=>({...d,items:d.items.map(i=>i.key===key?{...i,...patch}:i)}));
 // "Only <payer>": the family that paid keeps it (their own snacks, the toilet paper for their flat).
 const payerName=trip.families.find(f=>f.id===draft.payer)?.name,payerTarget=payerName?familyTarget(draft.payer):'';
 const [moreOpen,setMoreOpen]=useState<string[]>([]);
 const setTarget=(key:string,target:string)=>{if(target===CUSTOM&&!splits[key])setSplits(s=>({...s,[key]:initialSplit(trip,trip.people)}));setItem(key,{target});};
 const confirm=()=>{try{onConfirm(expenseFromDraft(resolved,trip,receipt.id,()=>crypto.randomUUID()));}catch{/* the summary already lists the problem */}};
 // Everyone, a meal or activity (its people), or one family only, e.g. the croissants only the Schupps had.
 const families=trip.families.filter(f=>trip.people.some(p=>p.familyId===f.id));
 const targetChoices=<><option value="">General · everyone</option>{families.length>1&&<optgroup label="Only one family">{families.map(f=><option key={f.id} value={familyTarget(f.id)}>Only {f.name}</option>)}</optgroup>}{trip.people.length>1&&<optgroup label="Only one person">{trip.people.map(p=><option key={p.id} value={personTarget(p.id)}>Only {p.name}</option>)}</optgroup>}{events.length>0&&<optgroup label="A meal or activity">{events.map(e=><option key={e.id} value={e.id} disabled={!e.participants.length}>{e.title} · {shortDate(e.date)}{e.participants.length?'':' (nobody joining)'}</option>)}</optgroup>}</>;
 // Per item there is one more choice: the full split editor.
 const targetOptions=<>{targetChoices}<optgroup label="Something else"><option value={CUSTOM}>Custom split…</option></optgroup></>;
 return <div className="modal-backdrop"><div className="modal receipt-modal" role="dialog" aria-modal="true" aria-labelledby="receipt-review-title">
  <div className="modal-head"><div><span className="eyebrow">Check · Assign · Confirm</span><h2 id="receipt-review-title">Review {receipt.merchant||'receipt'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X/></button></div>
  <div className="receipt-layout">
   <div className="receipt-photos">{Array.from({length:receipt.pages??1},(_,i)=>{const url=`/api/v1/trips/${trip.id}/receipts/${receipt.id}/image${i?`?page=${i+1}`:''}`;return <a key={i} className="receipt-photo" href={url} target="_blank" rel="noreferrer"><img src={url} alt={(receipt.pages??1)>1?`Receipt photo ${i+1} of ${receipt.pages}`:'Original receipt photo'}/><small>{(receipt.pages??1)>1?`Photo ${i+1} of ${receipt.pages} · open full size`:'Open full size'}</small></a>;})}</div>
   <div className="receipt-fields">
    <div className="form-row"><label>Name<input value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label>Date<input type="date" value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})}/></label></div>
    <div className="form-row"><label>Paid by<select value={draft.payer} onChange={e=>setDraft({...draft,payer:e.target.value})}><option value="">Choose family</option>{trip.families.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label><label>Category<select value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value as Expense['category']})}><option value="food">Food</option><option value="activity">Activity</option><option value="transport">Transport</option><option value="stay">Stay</option><option value="other">Other</option></select></label><label>Receipt total (€)<input inputMode="decimal" aria-label="Receipt total" value={draft.total} onChange={e=>setDraft({...draft,total:e.target.value})}/></label></div>
    <div className="receipt-bulk"><label>Assign every item to<select value={bulk} onChange={e=>setBulk(e.target.value)}>{targetChoices}</select></label><button className="btn btn-secondary" type="button" onClick={()=>setDraft(d=>({...d,items:d.items.map(i=>({...i,target:bulk}))}))}>Apply to all</button></div>
    <div className="receipt-items" aria-label="Receipt items">
     <div className="receipt-tally" aria-label="Running totals">{summary.groups.map(g=><span key={g.target||'general'}><b>{euro(g.amount)}</b> {g.target?g.name:'Everyone'}</span>)}</div>
     {draft.items.map((item,i)=>{const other=item.target!==''&&item.target!==payerTarget;const more=other||moreOpen.includes(item.key);return <div className={`receipt-item ${summary.invalid.includes(item.key)?'invalid':''}`} key={item.key}>
      <input aria-label={`Item ${i+1}`} value={item.label} onChange={e=>setItem(item.key,{label:e.target.value})}/>
      <input aria-label={`Amount for item ${i+1}`} inputMode="decimal" value={item.amount} onChange={e=>setItem(item.key,{amount:e.target.value})}/>
      {/* The two everyday answers are one tap; everything else is behind More. */}
      <div className="receipt-target" role="group" aria-label={`Who shares item ${i+1}`}>
       <button type="button" aria-pressed={item.target===''} onClick={()=>{setTarget(item.key,'');setMoreOpen(m=>m.filter(k=>k!==item.key));}}>Everyone</button>
       {payerTarget&&<button type="button" aria-pressed={item.target===payerTarget} onClick={()=>{setTarget(item.key,payerTarget);setMoreOpen(m=>m.filter(k=>k!==item.key));}}>Only {payerName}</button>}
       <button type="button" aria-pressed={other} aria-expanded={more} onClick={()=>setMoreOpen(m=>m.includes(item.key)?m.filter(k=>k!==item.key):[...m,item.key])}>{other?targetName(trip,item.target):'More…'}</button>
      </div>
      {more&&<select aria-label={`Assign item ${i+1}`} value={item.target} onChange={e=>setTarget(item.key,e.target.value)}>{targetOptions}</select>}
      <button type="button" className="icon-button" aria-label={`Remove item ${i+1}`} onClick={()=>setDraft(d=>({...d,items:d.items.filter(x=>x.key!==item.key)}))}><Trash2 size={16}/></button>
      {item.target===CUSTOM&&splits[item.key]&&<div className="receipt-item-split"><SplitEditor trip={trip} people={trip.people} total={parseCents(item.amount)??0} value={splits[item.key]} onChange={next=>setSplits(s=>({...s,[item.key]:next}))} legend={`How is ${item.label.trim()||`item ${i+1}`} split?`}/></div>}
     </div>;})}
     <div className="receipt-item-actions">
      <button type="button" className="text-button" onClick={()=>setDraft(d=>({...d,items:[...d.items,{key:crypto.randomUUID(),label:'',amount:'',target:''}]}))}><Plus size={15}/> Add item</button>
      {summary.difference!==null&&summary.difference!==0&&<button type="button" className="text-button" onClick={()=>setDraft(d=>({...d,items:[...d.items,{key:crypto.randomUUID(),label:summary.difference!<0?'Discount':'Deposit or other',amount:formatCents(summary.difference!),target:''}]}))}><Plus size={15}/> Add the {euro(Math.abs(summary.difference))} difference as a line</button>}
     </div>
    </div>
    <div className="assignment-summary" aria-label="Totals by meal or activity">
     <span className="eyebrow">Who shares what</span>
     {summary.groups.map(g=><div className={`assignment-row ${g.people?'':'empty'}`} key={g.target||'general'}><span className="list-icon">{g.target.startsWith(`${CUSTOM}:`)?<SlidersHorizontal size={16}/>:g.target.startsWith('person:')?<User size={16}/>:g.target&&!g.target.startsWith('family:')?<CalendarDays size={16}/>:<Users size={16}/>}</span><div><strong>{g.name}</strong><small>{g.items} item{g.items===1?'':'s'} · {g.people} {g.people===1?'person':'people'}</small></div><b>{euro(g.amount)}</b></div>)}
    </div>
    <div className={`receipt-total ${summary.difference===0?'matched':'mismatch'}`} role="status"><span>Items {euro(summary.reviewed)} · Receipt {summary.total===null?'—':euro(summary.total)}</span><strong>{summary.difference===0?'Totals match':summary.difference===null?'Total missing':`Difference ${euro(summary.difference)}`}</strong></div>
    {summary.problems.length>0&&<ul className="review-problems">{summary.problems.map(p=><li key={p}>{p}</li>)}</ul>}
    <div className="receipt-actions"><button type="button" className="btn btn-ghost" onClick={()=>{if(window.confirm('Remove this receipt from the inbox? No expense will be created.'))onDismiss();}}>Discard receipt</button><button type="button" className="btn btn-primary" onClick={confirm} disabled={busy||!summary.ready}>Confirm expense <Check size={17}/></button></div>
   </div>
  </div>
 </div></div>;
}
