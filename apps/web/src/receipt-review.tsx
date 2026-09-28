import {useMemo,useState} from 'react';
import {CalendarDays,Check,Plus,Trash2,Users,X} from 'lucide-react';
import type {Expense,ExpenseInput,Receipt,Trip} from '../../../packages/domain/src/model.js';
import {draftFromReceipt,expenseFromDraft,formatCents,reviewSummary,type ReceiptDraft} from './receipt-draft.js';
const euro=(n:number)=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(n/100);
const shortDate=(iso:string)=>new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short'}).format(new Date(`${iso}T12:00:00`));
export function ReceiptReview({trip,receipt,today,busy,onClose,onConfirm,onDismiss}:{trip:Trip;receipt:Receipt;today:string;busy:boolean;onClose:()=>void;onConfirm:(expense:ExpenseInput)=>void;onDismiss:()=>void}){
 const [draft,setDraft]=useState<ReceiptDraft>(()=>draftFromReceipt(receipt,trip,today,()=>crypto.randomUUID()));
 const [bulk,setBulk]=useState('');
 const summary=useMemo(()=>reviewSummary(draft,trip),[draft,trip]);
 const events=[...trip.events].sort((a,b)=>a.date.localeCompare(b.date));
 const setItem=(key:string,patch:Partial<ReceiptDraft['items'][number]>)=>setDraft(d=>({...d,items:d.items.map(i=>i.key===key?{...i,...patch}:i)}));
 const confirm=()=>{try{onConfirm(expenseFromDraft(draft,trip,receipt.id,()=>crypto.randomUUID()));}catch{/* the summary already lists the problem */}};
 const targetOptions=<><option value="">General · everyone</option>{events.map(e=><option key={e.id} value={e.id} disabled={!e.participants.length}>{e.title} · {shortDate(e.date)}{e.participants.length?'':' (nobody joining)'}</option>)}</>;
 return <div className="modal-backdrop"><div className="modal receipt-modal" role="dialog" aria-modal="true" aria-labelledby="receipt-review-title">
  <div className="modal-head"><div><span className="eyebrow">Check · Assign · Confirm</span><h2 id="receipt-review-title">Review {receipt.merchant||'receipt'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X/></button></div>
  <div className="receipt-layout">
   <a className="receipt-photo" href={`/api/v1/trips/${trip.id}/receipts/${receipt.id}/image`} target="_blank" rel="noreferrer"><img src={`/api/v1/trips/${trip.id}/receipts/${receipt.id}/image`} alt="Original receipt photo"/><small>Open full size</small></a>
   <div className="receipt-fields">
    <div className="form-row"><label>Name<input value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label>Date<input type="date" value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})}/></label></div>
    <div className="form-row"><label>Paid by<select value={draft.payer} onChange={e=>setDraft({...draft,payer:e.target.value})}><option value="">Choose family</option>{trip.families.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label><label>Category<select value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value as Expense['category']})}><option value="food">Food</option><option value="activity">Activity</option><option value="transport">Transport</option><option value="stay">Stay</option><option value="other">Other</option></select></label><label>Receipt total (€)<input inputMode="decimal" aria-label="Receipt total" value={draft.total} onChange={e=>setDraft({...draft,total:e.target.value})}/></label></div>
    <div className="receipt-bulk"><label>Assign every item to<select value={bulk} onChange={e=>setBulk(e.target.value)}>{targetOptions}</select></label><button className="btn btn-secondary" type="button" onClick={()=>setDraft(d=>({...d,items:d.items.map(i=>({...i,target:bulk}))}))}>Apply to all</button></div>
    <div className="receipt-items" role="table" aria-label="Receipt items">
     <div className="receipt-item receipt-item-head" role="row"><span role="columnheader">Item</span><span role="columnheader">€</span><span role="columnheader">For</span><span/></div>
     {draft.items.map((item,i)=><div className={`receipt-item ${summary.invalid.includes(item.key)?'invalid':''}`} role="row" key={item.key}>
      <input aria-label={`Item ${i+1}`} value={item.label} onChange={e=>setItem(item.key,{label:e.target.value})}/>
      <input aria-label={`Amount for item ${i+1}`} inputMode="decimal" value={item.amount} onChange={e=>setItem(item.key,{amount:e.target.value})}/>
      <select aria-label={`Assign item ${i+1}`} value={item.target} onChange={e=>setItem(item.key,{target:e.target.value})}>{targetOptions}</select>
      <button type="button" className="icon-button" aria-label={`Remove item ${i+1}`} onClick={()=>setDraft(d=>({...d,items:d.items.filter(x=>x.key!==item.key)}))}><Trash2 size={16}/></button>
     </div>)}
     <div className="receipt-item-actions">
      <button type="button" className="text-button" onClick={()=>setDraft(d=>({...d,items:[...d.items,{key:crypto.randomUUID(),label:'',amount:'',target:''}]}))}><Plus size={15}/> Add item</button>
      {summary.difference!==null&&summary.difference!==0&&<button type="button" className="text-button" onClick={()=>setDraft(d=>({...d,items:[...d.items,{key:crypto.randomUUID(),label:summary.difference!<0?'Discount':'Deposit or other',amount:formatCents(summary.difference!),target:''}]}))}><Plus size={15}/> Add the {euro(Math.abs(summary.difference))} difference as a line</button>}
     </div>
    </div>
    <div className="assignment-summary" aria-label="Totals by meal or activity">
     <span className="eyebrow">Who shares what</span>
     {summary.groups.map(g=><div className={`assignment-row ${g.people?'':'empty'}`} key={g.target||'general'}><span className="list-icon">{g.target?<CalendarDays size={16}/>:<Users size={16}/>}</span><div><strong>{g.name}</strong><small>{g.items} item{g.items===1?'':'s'} · {g.people} {g.people===1?'person':'people'}</small></div><b>{euro(g.amount)}</b></div>)}
    </div>
    <div className={`receipt-total ${summary.difference===0?'matched':'mismatch'}`} role="status"><span>Items {euro(summary.reviewed)} · Receipt {summary.total===null?'—':euro(summary.total)}</span><strong>{summary.difference===0?'Totals match':summary.difference===null?'Total missing':`Difference ${euro(summary.difference)}`}</strong></div>
    {summary.problems.length>0&&<ul className="review-problems">{summary.problems.map(p=><li key={p}>{p}</li>)}</ul>}
    <div className="receipt-actions"><button type="button" className="btn btn-ghost" onClick={()=>{if(window.confirm('Remove this receipt from the inbox? No expense will be created.'))onDismiss();}}>Discard receipt</button><button type="button" className="btn btn-primary" onClick={confirm} disabled={busy||!summary.ready}>Confirm expense <Check size={17}/></button></div>
   </div>
  </div>
 </div></div>;
}
