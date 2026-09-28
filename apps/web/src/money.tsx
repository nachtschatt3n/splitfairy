import {useState,type FormEvent} from 'react';
import {ArrowRight,Pencil,RotateCcw} from 'lucide-react';
import type {Expense,Payment,Trip,User} from '../../../packages/domain/src/model.js';
import {Button,Sheet,cents,euro,fmt,money,today,uid,type Remove,type Save} from './common.js';

const CATEGORIES:[Expense['category'],string][]=[['food','Food'],['activity','Activity'],['transport','Transport'],['stay','Stay'],['other','Other']];
const familyName=(trip:Trip,id:string)=>trip.families.find(f=>f.id===id)?.name??'Removed family';
export const canChange=(trip:Trip,user:User|null|undefined,role:string,item:{authorId:string})=>role==='organizer'||item.authorId===user?.id;

/** A single-line, single-split expense without fixed amounts can be edited completely; anything richer keeps its split. */
function simpleSplit(e:Expense){const split=e.lines.length===1&&e.lines[0].splits.length===1?e.lines[0].splits[0]:null;return split&&!split.fixed.length&&!e.receiptIds.length?split:null;}

export function ExpenseSheet({trip,expense,editable,save,busy,onClose}:{trip:Trip;expense:Expense;editable:boolean;save:Save;busy:boolean;onClose:()=>void}){
 const split=simpleSplit(expense),singlePayer=expense.payers.length===1;
 const [editing,setEditing]=useState(false),[error,setError]=useState('');
 const [title,setTitle]=useState(expense.title),[date,setDate]=useState(expense.date),[category,setCategory]=useState(expense.category);
 const [amount,setAmount]=useState(money(Math.abs(expense.total))),[payer,setPayer]=useState(expense.payers[0]?.familyId??'');
 const [eventId,setEventId]=useState(split?.eventId??''),[people,setPeople]=useState<string[]>(split?.weights.map(w=>w.id)??[]);
 const shares=trip.families.map(f=>({id:f.id,amount:expense.allocations.filter(a=>a.familyId===f.id).reduce((n,a)=>n+a.amount,0)})).filter(s=>s.amount);
 const submit=async(e:FormEvent)=>{
  e.preventDefault();setError('');
  const sign=Math.sign(expense.total)||1;let next:Expense={...expense,title:title.trim()||expense.title,date,category};
  if(split){
   const total=cents(amount)*sign;if(!Number.isSafeInteger(total)||!total){setError('Enter a valid amount.');return;}
   const ev=trip.events.find(x=>x.id===eventId);
   const weights=ev?ev.participants:trip.people.filter(p=>people.includes(p.id)).map(p=>({id:p.id,weight:p.weight}));
   if(!weights.length){setError(ev?'Nobody has joined that plan yet.':'Choose at least one person.');return;}
   next={...next,total,payers:[{familyId:payer,amount:total}],lines:[{...expense.lines[0],label:next.title,amount:total,splits:[{amount:total,eventId:ev?.id??null,eventVersion:ev?.version,weights,fixed:[]}]}]};
  }else if(singlePayer)next={...next,payers:[{familyId:payer,amount:expense.total}]};
  const {allocations:_a,authorId:_b,...value}=next;
  await save('expense',value,expense);onClose();
 };
 const setStatus=async(status:Expense['status'])=>{const {allocations:_a,authorId:_b,...value}=expense;await save('expense',{...value,status},expense);onClose();};
 return <Sheet title={expense.title} eyebrow={expense.status==='void'?'Voided expense':'Expense'} onClose={onClose}>
  {!editing?<div className="detail">
   <dl className="facts"><div><dt>Amount</dt><dd>{euro(expense.total)}</dd></div><div><dt>Date</dt><dd>{fmt(expense.date)}</dd></div><div><dt>Paid by</dt><dd>{expense.payers.map(p=>`${familyName(trip,p.familyId)}${expense.payers.length>1?` ${euro(p.amount)}`:''}`).join(', ')}</dd></div><div><dt>Category</dt><dd>{CATEGORIES.find(([c])=>c===expense.category)?.[1]}</dd></div></dl>
   {expense.lines.length>1&&<div className="detail-block"><h3>Items</h3>{expense.lines.map(l=><div className="detail-row" key={l.id}><span>{l.label}<small>{l.splits.map(s=>s.eventId?trip.events.find(x=>x.id===s.eventId)?.title??'Removed plan':'Everyone').join(', ')}</small></span><b>{euro(l.amount)}</b></div>)}</div>}
   {expense.status!=='void'&&<div className="detail-block"><h3>Who pays what</h3>{shares.map(s=><div className="detail-row" key={s.id}><span>{familyName(trip,s.id)}</span><b>{euro(s.amount)}</b></div>)}</div>}
   {editable?<div className="sheet-actions">
    {expense.status!=='void'&&<Button onClick={()=>setEditing(true)}><Pencil size={16}/> Edit</Button>}
    {expense.status!=='void'?<Button kind="ghost" disabled={busy} onClick={()=>{if(window.confirm(`Void ${expense.title}? It leaves the balances but stays in the history, and you can restore it.`))void setStatus('void');}}>Void expense</Button>
     :<Button disabled={busy} onClick={()=>void setStatus('posted')}><RotateCcw size={16}/> Restore expense</Button>}
   </div>:<p className="helper">Only the person who added it or an organizer can change it.</p>}
  </div>:<form className="form-stack" onSubmit={submit}>
   <label>What was it?<input value={title} onChange={e=>setTitle(e.target.value)} required/></label>
   <div className="form-row"><label>Date<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label><label>Category<select value={category} onChange={e=>setCategory(e.target.value as Expense['category'])}>{CATEGORIES.map(([c,l])=><option key={c} value={c}>{l}</option>)}</select></label></div>
   {split&&<label>Amount in EUR{expense.total<0?' (refund)':''}<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} required/></label>}
   {singlePayer&&<label>Paid by<select value={payer} onChange={e=>setPayer(e.target.value)}>{trip.families.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
   {split&&<><label>For<select value={eventId} onChange={e=>setEventId(e.target.value)}><option value="">General expense</option>{trip.events.map(x=><option key={x.id} value={x.id} disabled={!x.participants.length}>{x.title} · {fmt(x.date)}</option>)}</select></label>
    {!eventId&&<fieldset><legend>Shared by</legend><div className="chip-list">{trip.people.map(p=><label key={p.id} className={people.includes(p.id)?'chip checked':'chip'}><input type="checkbox" checked={people.includes(p.id)} onChange={()=>setPeople(x=>x.includes(p.id)?x.filter(i=>i!==p.id):[...x,p.id])}/>{p.name}</label>)}</div></fieldset>}</>}
   {!split&&<p className="helper">{expense.receiptIds.length?'Items from a scanned receipt keep their split. To change them, void this expense and review the receipt again.':'This expense uses a custom split. To change amounts or shares, void it and add it again.'}</p>}
   {error&&<p className="form-error" role="alert">{error}</p>}
   <Button type="submit" disabled={busy}>Save changes <ArrowRight size={17}/></Button>
   <Button kind="ghost" onClick={()=>setEditing(false)}>Cancel</Button>
  </form>}
 </Sheet>;
}

export function RepaymentSheet({trip,payment,preset,save,remove,busy,onClose}:{trip:Trip;payment?:Payment;preset?:{from:string;to:string;amount:number};save:Save;remove:Remove;busy:boolean;onClose:()=>void}){
 const start=payment??preset;
 const [from,setFrom]=useState(start?.from??''),[to,setTo]=useState(start?.to??''),[amount,setAmount]=useState(start?money(start.amount):''),[date,setDate]=useState(payment?.date??today()),[error,setError]=useState('');
 const submit=async(e:FormEvent)=>{
  e.preventDefault();const value=cents(amount);
  if(!from||!to||from===to){setError('Choose two different families.');return;}
  if(!Number.isSafeInteger(value)||value<=0){setError('Enter an amount above zero.');return;}
  await save('payment',{id:payment?.id??uid(),from,to,amount:value,date,version:payment?.version??0},payment);onClose();
 };
 return <Sheet title={payment?'Edit repayment':'Record a repayment'} eyebrow="Settle up" onClose={onClose}>
  <form className="form-stack" onSubmit={submit}>
   <div className="form-row"><label>From<select value={from} onChange={e=>setFrom(e.target.value)} required><option value="">Choose family</option>{trip.families.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
    <label>To<select value={to} onChange={e=>setTo(e.target.value)} required><option value="">Choose family</option>{trip.families.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label></div>
   <div className="form-row"><label>Amount in EUR<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="25.00" required/></label><label>Date<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label></div>
   {error&&<p className="form-error" role="alert">{error}</p>}
   <Button type="submit" disabled={busy}>{payment?'Save changes':'Record payment'} <ArrowRight size={17}/></Button>
   {payment&&<Button kind="ghost" disabled={busy} onClick={async()=>{if(!window.confirm('Delete this repayment? The balances go back to before it was paid.'))return;await remove('payment',payment);onClose();}}>Delete repayment</Button>}
  </form>
 </Sheet>;
}

export function RepaymentList({trip,user,role,onOpen}:{trip:Trip;user:User|null|undefined;role:string;onOpen:(p:Payment)=>void}){
 if(!trip.payments.length)return <p className="helper">No repayments recorded yet.</p>;
 return <>{[...trip.payments].sort((a,b)=>b.date.localeCompare(a.date)).map(p=>{const editable=canChange(trip,user,role,p);const body=<><div><strong>{familyName(trip,p.from)} paid {familyName(trip,p.to)}</strong><small>{fmt(p.date)}</small></div><b className="row-amount">{euro(p.amount)}</b>{editable&&<Pencil size={16} aria-hidden="true"/>}</>;
  return editable?<button type="button" className="list-row row-button" key={p.id} onClick={()=>onOpen(p)} aria-label={`Edit repayment from ${familyName(trip,p.from)} to ${familyName(trip,p.to)}`}>{body}</button>:<div className="list-row" key={p.id}>{body}</div>;})}</>;
}
