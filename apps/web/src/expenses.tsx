import {useEffect,useState,type FormEvent} from 'react';
import {ArrowRight,BedDouble,Camera,Car,ChevronDown,Coins,Plus,ReceiptText,Sun,UtensilsCrossed} from 'lucide-react';
import type {Command,Expense,Receipt,Trip,User} from '../../../packages/domain/src/model.js';
import {ReceiptReview} from './receipt-review.js';
import {Button,Empty,Sheet,cents,euro,fmt,today,uid} from './common.js';
import {ExpenseSheet,canChange} from './money.js';
import {SplitEditor,compileSplit,describeSplit,initialSplit,type SplitState} from './split.js';

type Save=(entity:Command['entity'],value:any,old?:{version:number})=>Promise<void>;
export const CATEGORIES:[Expense['category'],string,typeof Coins][]=[['food','Food',UtensilsCrossed],['activity','Activity',Sun],['transport','Transport',Car],['stay','Stay',BedDouble],['other','Other',Coins]];
const categoryOf=(c:Expense['category'])=>CATEGORIES.find(x=>x[0]===c)??CATEGORIES[4];

/** A new expense: amount first, then what it was, who paid, and how it is split. */
function ExpenseForm({trip,save,busy,onClose,forEvent}:{trip:Trip;save:Save;busy:boolean;onClose:()=>void;forEvent?:string}){
 // Started from a plan (e.g. a restaurant's bill): linked to it, named and dated after it.
 const preset=trip.events.find(e=>e.id===forEvent);
 const [title,setTitle]=useState(preset?.title??''),[date,setDate]=useState(preset?.date??today()),[amount,setAmount]=useState(''),[payer,setPayer]=useState(trip.families[0]?.id??''),[eventId,setEventId]=useState(preset?.id??''),[category,setCategory]=useState<Expense['category']>('food');
 // Starts as an equal split between all families, shown as one line; the full options open on request.
 const [split,setSplit]=useState<SplitState>(()=>initialSplit(trip,trip.people,null,'families')),[showSplit,setShowSplit]=useState(false);
 const [notes,setNotes]=useState(''),[showNotes,setShowNotes]=useState(false),[refund,setRefund]=useState(false),[multiPay,setMultiPay]=useState(false),[payAmounts,setPayAmounts]=useState<Record<string,string>>({}),[error,setError]=useState('');
 const total=(refund?-1:1)*(amount.trim()?cents(amount):0);
 const create=async(e:FormEvent)=>{
  e.preventDefault();setError('');
  if(!Number.isSafeInteger(total)||!total||!payer){setError('Enter a valid amount and who paid.');return;}
  // An expense for a plan is shared by the people joining it; otherwise the split options decide.
  const ev=trip.events.find(x=>x.id===eventId);
  if(ev&&!ev.participants.length){setError('Nobody has joined that plan yet.');return;}
  const compiled=ev?{weights:ev.participants,fixed:[],personFixed:[],mode:undefined}:compileSplit(split,trip.people,total,trip);
  if('error' in compiled){setError(compiled.error);return;}
  const payers=multiPay?trip.families.map(f=>({familyId:f.id,amount:cents(payAmounts[f.id]||'0')*Math.sign(total)})).filter(p=>p.amount!==0):[{familyId:payer,amount:total}];
  if(payers.reduce((n,p)=>n+p.amount,0)!==total){setError('Amounts paid must add up to the expense total.');return;}
  await save('expense',{id:uid(),title:title.trim(),date,category,total,payers,lines:[{id:uid(),label:title.trim(),amount:total,splits:[{amount:total,eventId:ev?.id??null,eventVersion:ev?.version,...compiled}]}],notes:notes.trim(),receiptIds:[],status:'posted',version:0});
  onClose();
 };
 return <Sheet title="Add an expense" eyebrow="Spend" onClose={onClose}>
  <form className="form-stack expense-form" id="quick-expense" onSubmit={create}>
   <label className="amount-field">Amount in EUR<span className="amount-input"><i aria-hidden="true">€</i><input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" autoFocus required/></span></label>
   <label>What was it?<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Groceries for dinner" required/></label>
   <label>Paid by<select value={payer} onChange={e=>setPayer(e.target.value)} disabled={multiPay}>{trip.families.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
   <div className="form-row"><label>Date<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label>
    <label>Category<select value={category} onChange={e=>setCategory(e.target.value as Expense['category'])}>{CATEGORIES.map(([c,l])=><option key={c} value={c}>{l}</option>)}</select></label></div>
   <label>For<select value={eventId} onChange={e=>setEventId(e.target.value)}><option value="">General expense</option>{trip.events.map(e=><option key={e.id} value={e.id} disabled={!e.participants.length}>{e.title}{e.participants.length?'':' (nobody joining yet)'}</option>)}</select></label>
   {showNotes?<label>Notes (optional)<textarea rows={2} maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Tip included, paid by card" autoFocus/></label>
    :<button type="button" className="text-button add-note" onClick={()=>setShowNotes(true)}><Plus size={15}/> Add a note</button>}
   {eventId?<p className="helper">Shared by the people joining that plan, by their shares.</p>
    :showSplit?<SplitEditor trip={trip} people={trip.people} total={total} value={split} onChange={setSplit}/>
    :<div className="split-summary"><span><strong>Split equally between families</strong><small>{trip.families.length} {trip.families.length===1?'family':'families'}{Number.isSafeInteger(total)&&total?(Math.abs(total)%Math.max(1,trip.families.length)?` · about ${euro(Math.round(Math.abs(total)/trip.families.length))} each`:` · ${euro(Math.abs(total)/trip.families.length)} each`):''}</small></span><button type="button" className="text-button" onClick={()=>setShowSplit(true)}>Other split options</button></div>}
   <details className="advanced"><summary>Several payers or a refund <ChevronDown size={16}/></summary>
    <label className="check-label"><input type="checkbox" checked={refund} onChange={e=>setRefund(e.target.checked)}/> This is a refund received by the payer</label>
    <label className="check-label"><input type="checkbox" checked={multiPay} onChange={e=>setMultiPay(e.target.checked)}/> More than one family paid</label>
    {multiPay&&trip.families.map(f=><label key={f.id}>{f.name} paid in EUR<input inputMode="decimal" value={payAmounts[f.id]??''} onChange={e=>setPayAmounts({...payAmounts,[f.id]:e.target.value})} placeholder="0.00"/></label>)}
   </details>
   {error&&<p className="form-error" role="alert">{error}</p>}
   <Button type="submit" disabled={busy||!trip.families.length||!trip.people.length}><Plus size={17}/> Save expense</Button>
  </form>
 </Sheet>;
}

/** Spend: a summary, receipts waiting for a look, and every expense by day. Adding opens a sheet. */
export function Expenses({trip,user,role,save,onScan,onReceiptAction,onCombine,busy,addRequested=null,onAddHandled}:{trip:Trip;user:User|null|undefined;role:string;save:Save;onScan:()=>void;onReceiptAction:(id:string,action:'retry'|'dismiss')=>void;onCombine?:(ids:string[])=>Promise<boolean>;busy:boolean;addRequested?:{eventId?:string}|null;onAddHandled?:()=>void}){
 // Photos of one long receipt that were uploaded as separate receipts can be combined, in the order they are picked.
 const [combining,setCombining]=useState<string[]|null>(null);
 const [openExpense,setOpenExpense]=useState<string|null>(null),[showVoid,setShowVoid]=useState(false),[adding,setAdding]=useState<false|{eventId?:string}>(false),[filter,setFilter]=useState<Expense['category']|'all'>('all');
 const [review,setReview]=useState<string|null>(null);
 // "Add new → Add an expense" opens the form once.
 useEffect(()=>{if(addRequested){setAdding(addRequested);onAddHandled?.();}},[addRequested]);
 const waiting=trip.receipts.filter(r=>r.status==='queued'||r.status==='processing'||r.status==='review'||r.status==='failed');
 const receipt=trip.receipts.find(r=>r.id===review);
 const posted=trip.expenses.filter(e=>e.status==='posted');
 const spent=posted.reduce((n,e)=>n+e.total,0);
 const byCategory=CATEGORIES.map(([c,label])=>({c,label,amount:posted.filter(e=>e.category===c).reduce((n,e)=>n+e.total,0)})).filter(x=>x.amount>0);
 const voided=trip.expenses.filter(e=>e.status==='void');
 const shown=trip.expenses.filter(e=>(showVoid||e.status!=='void')&&(filter==='all'||e.category===filter)).slice().sort((a,b)=>b.date.localeCompare(a.date));
 // Read receipts waiting for a check show in the overview on their day too, so nothing scanned goes unnoticed.
 // Once confirmed (even before the server has caught up), the expense stands for it.
 const confirmed=new Set(trip.expenses.flatMap(e=>e.receiptIds??[]));
 const toCheck=trip.receipts.filter(r=>r.status==='review'&&!confirmed.has(r.id)&&(filter==='all'||filter==='food'));
 const checkDate=(r:Receipt)=>/^\d{4}-\d{2}-\d{2}$/.test(r.date)?r.date:today();
 const pendingTotal=trip.receipts.filter(r=>r.status==='review'&&!confirmed.has(r.id)).reduce((n,r)=>n+(r.total??0),0);
 const days=[...new Set([...shown.map(e=>e.date),...toCheck.map(checkDate)])].sort((a,b)=>b.localeCompare(a));
 const payerName=(e:Expense)=>e.payers.length>1?`${e.payers.length} families`:trip.families.find(f=>f.id===e.payers[0]?.familyId)?.name??'Unknown';
 return <>
  <section className="card spend-summary" aria-label="Trip spending">
   <div className="spend-total"><span className="eyebrow">Spent so far</span><strong>{euro(spent)}</strong><small>{posted.length} expense{posted.length===1?'':'s'}{trip.people.length&&spent>0?` · about ${euro(Math.round(spent/trip.people.length))} per person`:''}{pendingTotal>0?` · ${euro(pendingTotal)} in receipts to check`:''}</small></div>
   <div className="spend-actions"><Button onClick={()=>setAdding({})} disabled={!trip.families.length||!trip.people.length}><Plus size={17}/> Add expense</Button><Button kind="secondary" onClick={onScan}><Camera size={17}/> Scan a receipt</Button></div>
   {byCategory.length>0&&<div className="spend-breakdown">
    <div className="spend-bar" aria-hidden="true">{byCategory.map(x=><span key={x.c} className={`cat-${x.c}`} style={{flexGrow:x.amount}}/>)}</div>
    <ul className="spend-legend">{byCategory.map(x=><li key={x.c}><i className={`cat-${x.c}`}/>{x.label} <b>{euro(x.amount)}</b></li>)}</ul>
   </div>}
   {(!trip.families.length||!trip.people.length)&&<p className="helper">Add families and people first, so costs can be shared.</p>}
  </section>
  {waiting.length>0&&<section className="card review-section inbox-first" aria-label="Receipt inbox"><div className="card-head"><div><span className="eyebrow">A human final look</span><h2>Receipt inbox</h2></div>{onCombine&&waiting.filter(r=>r.status!=='processing').length>1&&(combining?<button type="button" className="text-button" onClick={()=>setCombining(null)}>Cancel</button>:<button type="button" className="text-button" onClick={()=>setCombining([])}>Combine photos</button>)}</div>
  {combining&&<p className="helper">Tap the photos of one long receipt from top to bottom; they are read again together as one receipt.</p>}
  {waiting.map(r=><div className={`receipt-row${combining?.includes(r.id)?' picked':''}`} key={r.id}>{combining&&r.status!=='processing'?<label className="combine-pick"><input type="checkbox" aria-label={`Combine ${r.merchant||'receipt photo'}`} checked={combining.includes(r.id)} onChange={()=>setCombining(c=>c!.includes(r.id)?c!.filter(x=>x!==r.id):[...c!,r.id])}/>{combining.includes(r.id)&&<b>{combining.indexOf(r.id)+1}</b>}</label>:null}<img className="receipt-thumb" src={`/api/v1/trips/${trip.id}/receipts/${r.id}/image`} alt="" loading="lazy"/><span className="receipt-text"><strong>{r.merchant||'Receipt photo'}</strong><small>{(r.pages??1)>1?`${r.pages} photos · `:''}{r.status==='review'?`${r.items.length} items · ${euro(r.total??0)} · ready for your check`:r.status==='failed'?`Could not read it${r.error?` (${r.error})`:''}`:r.status==='processing'?'The fairy is reading it…':'Waiting to be read…'}</small></span><span className="receipt-actions-row" hidden={!!combining}>{r.status==='review'&&<Button kind="secondary" onClick={()=>setReview(r.id)}>Review</Button>}{r.status==='failed'&&<><Button kind="ghost" disabled={busy} onClick={()=>onReceiptAction(r.id,'retry')}>Retry</Button><Button kind="ghost" disabled={busy} onClick={()=>{if(window.confirm('Remove this receipt? You can still add the expense by hand.'))onReceiptAction(r.id,'dismiss');}}>Discard</Button></>}{(r.status==='queued'||r.status==='processing')&&<span className={`pill ${r.status}`}>{r.status==='queued'?'queued':'reading'}</span>}</span></div>)}
  {combining&&<Button disabled={busy||combining.length<2} onClick={async()=>{if(await onCombine!(combining))setCombining(null);}}>{combining.length<2?'Pick at least two photos':`Combine ${combining.length} photos into one receipt`}</Button>}</section>}
  <section className="card expense-list">
   <div className="card-head"><div><span className="eyebrow">The running story</span><h2>Expenses</h2></div></div>
   {trip.expenses.length>0&&<div className="filter-chips" role="group" aria-label="Show category">{[['all','All'] as const,...CATEGORIES.map(([c,l])=>[c,l] as const)].map(([c,l])=><button key={c} type="button" className={filter===c?'on':''} aria-pressed={filter===c} onClick={()=>setFilter(c)}>{l}</button>)}</div>}
   {days.map(d=>{const list=shown.filter(e=>e.date===d),sum=list.filter(e=>e.status==='posted').reduce((n,e)=>n+e.total,0);
    return <div className="expense-day" key={d}><h3 className="day-head"><span>{fmt(d)}</span><span>{euro(sum)}</span></h3>
     {toCheck.filter(r=>checkDate(r)===d).map(r=><button type="button" className="list-row row-button to-check" key={r.id} onClick={()=>setReview(r.id)} aria-label={`Review receipt ${r.merchant||'photo'}`}>
       <span className="list-icon"><ReceiptText size={19}/></span>
       <div><strong>{r.merchant||'Receipt'}</strong><small><span className="check-tag">To check</span> {r.items.length} items · not in the totals yet</small></div>
       <b className="row-amount">{r.total===null?'':euro(r.total)}</b><span className="review-link">Review</span></button>)}
     {list.map(e=>{const [,label,Icon]=categoryOf(e.category);
      return <button type="button" className={`list-row row-button ${e.status==='void'?'voided':''}`} key={e.id} onClick={()=>setOpenExpense(e.id)} aria-label={`Open ${e.title}`}>
       <span className={`list-icon cat-${e.category}`} title={label}><Icon size={19}/></span>
       <div><strong>{e.title}</strong><small>{payerName(e)} paid · {describeSplit(trip,e)}{e.status==='void'?' · voided':''}</small></div>
       <b className={e.total<0?'row-amount refund':'row-amount'}>{e.total<0?`Refund ${euro(-e.total)}`:euro(e.total)}</b><ArrowRight size={16} aria-hidden="true"/></button>;})}
    </div>;})}
   {!shown.length&&(trip.expenses.length?<p className="helper">Nothing in this category yet.</p>:<Empty icon={<ReceiptText/>} heading="The slate is clean" body="Add a first purchase or scan a receipt to get going." action={<Button kind="secondary" onClick={()=>setAdding({})} disabled={!trip.people.length}><Plus size={17}/> Add expense</Button>}/>)}
   {voided.length>0&&<button type="button" className="text-button" onClick={()=>setShowVoid(v=>!v)}>{showVoid?'Hide voided expenses':`Show voided expenses (${voided.length})`}</button>}
  </section>
  {adding&&<ExpenseForm trip={trip} save={save} busy={busy} forEvent={adding.eventId} onClose={()=>setAdding(false)}/>}
  {(()=>{const e=trip.expenses.find(x=>x.id===openExpense);return e?<ExpenseSheet key={e.id} trip={trip} expense={e} editable={canChange(trip,user,role,e)} save={save} busy={busy} onClose={()=>setOpenExpense(null)}/>:null;})()}
  {receipt&&receipt.status==='review'&&<ReceiptReview key={receipt.id} trip={trip} receipt={receipt} today={today()} busy={busy} onClose={()=>setReview(null)} onDismiss={()=>{setReview(null);onReceiptAction(receipt.id,'dismiss');}} onConfirm={expense=>{save('expense',expense);setReview(null);}}/>}
 </>;
}
