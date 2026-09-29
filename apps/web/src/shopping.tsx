import {useRef,useState,type FormEvent,type ReactNode} from 'react';
import {ArrowRight,CalendarDays,ChevronDown,Pencil,Plus,ShoppingBasket,ShoppingCart,Users} from 'lucide-react';
import type {Shopping,Trip} from '../../../packages/domain/src/model.js';
import {Button,Empty,Sheet,fmt,uid,type Remove,type Save} from './common.js';

/** Meals and activities that can have a shopping list (restaurants have none), in date order. */
export const shoppable=(trip:Trip)=>trip.events.filter(e=>e.kind!=='restaurant').sort((a,b)=>a.date.localeCompare(b.date));
const byDone=(a:Shopping,b:Shopping)=>Number(a.done)-Number(b.done);

export function ShoppingSheet({trip,item,save,remove,busy,onClose}:{trip:Trip;item:Shopping;save:Save;remove:Remove;busy:boolean;onClose:()=>void}){
 const [text,setText]=useState(item.text),[eventId,setEventId]=useState(item.eventId??''),[buyerId,setBuyerId]=useState(item.buyerId??''),[done,setDone]=useState(item.done);
 // Restaurants have no shopping list.
 const events=shoppable(trip);
 return <Sheet title="Shopping item" eyebrow="The shared list" onClose={onClose}>
  <form className="form-stack" onSubmit={async e=>{e.preventDefault();if(!text.trim())return;await save('shopping',{...item,text:text.trim(),eventId:eventId||null,buyerId:buyerId||null,done},item);onClose();}}>
   <label>Item<input value={text} onChange={e=>setText(e.target.value)} autoFocus required/></label>
   <label>For<select value={eventId} onChange={e=>setEventId(e.target.value)}><option value="">General shopping</option>{events.map(e=><option key={e.id} value={e.id}>{e.title} · {fmt(e.date)}</option>)}</select></label>
   <BuyerSelect trip={trip} value={buyerId} onChange={setBuyerId}/>
   <label className="check-label"><input type="checkbox" checked={done} onChange={e=>setDone(e.target.checked)}/> Already bought</label>
   <Button type="submit" disabled={busy}>Save changes <ArrowRight size={17}/></Button>
   <Button kind="delete" disabled={busy} onClick={async()=>{await remove('shopping',item);onClose();}}>Delete item</Button>
  </form>
 </Sheet>;
}

/** Who buys it: a family, or everyone (anyone can pick it up). */
function BuyerSelect({trip,value,onChange,compact=false}:{trip:Trip;value:string;onChange:(v:string)=>void;compact?:boolean}){
 const select=<select aria-label="Who buys it" value={value} onChange={e=>onChange(e.target.value)}><option value="">Everyone</option>{trip.families.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>;
 return compact?<label className="qa-pill"><Users size={14} aria-hidden="true"/>{select}</label>:<label>Who buys it{select}</label>;
}

export function ShoppingItem({trip,item,myFamily,save,onEdit,context,hideBuyer=false}:{trip:Trip;item:Shopping;myFamily?:string|null;save:Save;onEdit:(item:Shopping)=>void;context?:string;hideBuyer?:boolean}){
 const buyer=hideBuyer?undefined:trip.families.find(f=>f.id===item.buyerId)?.name;
 return <div className="shop-row">
  <label className="shop-check"><input type="checkbox" checked={item.done} onChange={()=>void save('shopping',{...item,done:!item.done},item)}/><span className={item.done?'done':''}>{item.text}{buyer&&<small className="buyer-tag">{buyer} buys</small>}{context&&<small className="shop-context">{context}</small>}</span></label>
  {!item.buyerId&&!item.done&&myFamily&&<button type="button" className="text-button claim" onClick={()=>void save('shopping',{...item,buyerId:myFamily},item)}>We'll buy it</button>}
  <button type="button" className="icon-button subtle" aria-label={`Edit ${item.text}`} onClick={()=>onEdit(item)}><Pencil size={16}/></button>
 </div>;
}

type Defaults={eventId:string;buyer:string};
const defaultsKey=(tripId:string)=>`splitfairy-shop-${tripId}`;
type Show='all'|'open'|'ours';

/** The shopping list, full width: quick-add with sticky choices, grouped by meal, and a shopping-trip mode for the store. */
export function ShoppingList({trip,myFamily,save,remove,busy}:{trip:Trip;myFamily:string|null;save:Save;remove:Remove;busy:boolean}){
 const events=shoppable(trip),mine=trip.families.find(f=>f.id===myFamily);
 // "For" and "Who buys it" stick (per trip, on this device): typing the next item and Enter is all it takes.
 const [defaults,setDefaults]=useState<Defaults>(()=>{try{const saved=JSON.parse(localStorage.getItem(defaultsKey(trip.id))??'null');if(saved)return saved;}catch{/* ignore */}return {eventId:'',buyer:''};});
 const choose=(patch:Partial<Defaults>)=>setDefaults(d=>{const next={...d,...patch};try{localStorage.setItem(defaultsKey(trip.id),JSON.stringify(next));}catch{/* private mode */}return next;});
 const eventId=events.some(e=>e.id===defaults.eventId)?defaults.eventId:'',buyer=trip.families.some(f=>f.id===defaults.buyer)?defaults.buyer:'';
 const [text,setText]=useState(''),[show,setShow]=useState<Show>('all'),[storeMode,setStoreMode]=useState(false),[editing,setEditing]=useState<Shopping|null>(null);
 const input=useRef<HTMLInputElement>(null);
 const add=async(e:FormEvent)=>{e.preventDefault();const value=text.trim();if(!value)return;setText('');input.current?.focus();
  await save('shopping',{id:uid(),text:value,eventId:eventId||null,buyerId:buyer||null,done:false,version:0});};
 const items=trip.shopping,open=items.filter(i=>!i.done),ours=open.filter(i=>myFamily&&i.buyerId===myFamily).length;
 const title=(id:string|null)=>{const e=events.find(x=>x.id===id);return e?`${e.title} · ${fmt(e.date)}`:'General';};
 const visible=(i:Shopping)=>show==='all'||(show==='open'?!i.buyerId:!!myFamily&&i.buyerId===myFamily);
 const groups=[{id:null as string|null,title:'General'},...events.map(e=>({id:e.id as string|null,title:title(e.id)}))]
  .map(g=>({...g,items:items.filter(i=>(i.eventId??null)===g.id&&visible(i)).sort(byDone)})).filter(g=>g.items.length);
 // At the store: only what is still to buy by us or by anyone, ours first; what was just ticked stays below to undo.
 const forUs=(i:Shopping)=>!i.buyerId||(!!myFamily&&i.buyerId===myFamily);
 const storeGroups=[
  {id:'ours',title:mine?`${mine.name} buys`:'Ours',items:open.filter(i=>myFamily&&i.buyerId===myFamily)},
  {id:'anyone',title:'Anyone can buy',items:open.filter(i=>!i.buyerId)},
  {id:'basket',title:'In the basket',items:items.filter(i=>i.done&&forUs(i))},
 ].filter(g=>g.items.length);
 const row=(item:Shopping,context?:string)=><ShoppingItem key={item.id} trip={trip} myFamily={myFamily} item={item} save={save} onEdit={setEditing} context={context}/>;
 return <>
  <section className={storeMode?'card shopping store-mode':'card shopping'} aria-label="Shopping list">
   <div className="pack-head"><div><h2 className="sr-only">Shopping</h2>{items.length>0&&<small>{open.length} to buy{ours?` · ${ours} for ${mine?.name??'you'}`:''}{items.length-open.length?` · ${items.length-open.length} bought`:''}</small>}</div>
    {items.length>0&&<button type="button" className={storeMode?'qa-pill on':'qa-pill'} aria-pressed={storeMode} onClick={()=>setStoreMode(m=>!m)}><ShoppingCart size={15} aria-hidden="true"/> {storeMode?'Done shopping':'Shopping trip'}</button>}</div>
   {!storeMode&&<form className="quick-add" onSubmit={add}>
    <div className="qa-main"><input ref={input} aria-label="Add to the list" value={text} onChange={e=>setText(e.target.value)} placeholder="Eggs, bread, sunscreen…" enterKeyHint="done"/>
     <button type="submit" className="qa-submit" aria-label="Add item" disabled={!text.trim()}><Plus size={20}/></button></div>
    <div className="qa-options">
     <label className="qa-pill"><CalendarDays size={14} aria-hidden="true"/><select aria-label="For" value={eventId} onChange={e=>choose({eventId:e.target.value})}><option value="">General</option>{events.map(e=><option key={e.id} value={e.id}>{e.title} · {fmt(e.date)}</option>)}</select></label>
     {trip.families.length>0&&<BuyerSelect trip={trip} value={buyer} onChange={v=>choose({buyer:v})} compact/>}
    </div>
   </form>}
   {storeMode?<>
    <p className="helper">Tick things as they go in the basket. Showing what {mine?`${mine.name} or anyone`:'anyone'} can buy.</p>
    {storeGroups.map(g=><div className="shop-group" key={g.id}><h3>{g.title} <small>{g.items.length}</small></h3>{g.items.map(i=>row(i,i.eventId?title(i.eventId):undefined))}</div>)}
    {!open.some(forUs)&&<Empty icon={<ShoppingCart/>} heading="Everything is in the basket" body="Nothing left for you on the list."/>}
   </>:<>
    {items.length>0&&trip.families.length>0&&<div className="pack-controls"><div className="segmented" role="group" aria-label="Show">{([['all','All'],['open','Anyone can buy'],...(mine?[['ours',`${mine.name} buys`]]:[])] as [Show,string][]).map(([k,l])=><button key={k} type="button" className={show===k?'on':''} aria-pressed={show===k} onClick={()=>setShow(k)}>{l}</button>)}</div></div>}
    {groups.map(g=><div className="shop-group" key={g.id??'general'}><h3>{g.title} <small>{g.items.filter(i=>i.done).length}/{g.items.length}</small></h3>{g.items.map(i=>row(i))}</div>)}
    {items.length>0&&!groups.length&&<p className="helper">Nothing here with this filter.</p>}
    {!items.length&&<Empty icon={<ShoppingBasket/>} heading="Your list is clear" body="Type an item above and press Enter; keep typing to add the next. Ingredients can also go straight on a meal in the plan."/>}
   </>}
  </section>
  {editing&&<ShoppingSheet key={editing.id} trip={trip} item={items.find(s=>s.id===editing.id)??editing} save={save} remove={remove} busy={busy} onClose={()=>setEditing(null)}/>}
 </>;
}

/** A small card that points to the list: how much is open and what is for us. */
export function ShoppingSummary({trip,myFamily,onOpen}:{trip:Trip;myFamily:string|null;onOpen:()=>void}){
 const open=trip.shopping.filter(i=>!i.done),mine=trip.families.find(f=>f.id===myFamily),ours=open.filter(i=>myFamily&&i.buyerId===myFamily);
 const next=(ours.length?ours:open).slice(0,4);
 return <section className="card shop-summary" aria-label="Shopping summary">
  <div className="card-head"><div><span className="eyebrow">The shared list</span><h2>Shopping</h2></div><ShoppingBasket size={23} aria-hidden="true"/></div>
  <p className="shop-summary-count"><strong>{open.length}</strong> to buy{ours.length?<> · <strong>{ours.length}</strong> for {mine?.name}</>:null}</p>
  {next.length>0&&<ul className="shop-peek">{next.map(i=><li key={i.id}>{i.text}</li>)}{open.length>next.length&&<li className="more">+{open.length-next.length} more</li>}</ul>}
  <Button kind="secondary" onClick={onOpen}>Open the shopping list <ArrowRight size={16}/></Button>
 </section>;
}

/** Ingredients on a meal card: short meals show everything; longer ones fold into one line that opens on tap. */
export function MealShopping({trip,title,items,myFamily,save,onEdit,addField}:{trip:Trip;title:string;items:Shopping[];myFamily?:string|null;save:Save;onEdit:(item:Shopping)=>void;addField:ReactNode}){
 // Starts folded only when it is already long; a list that grows while adding stays open.
 const [open,setOpen]=useState(()=>items.length<=3);
 const toBuy=items.filter(i=>!i.done);
 // One buyer for all of them: say it once instead of on every row.
 const buyers=[...new Set(items.map(i=>i.buyerId??''))],shared=buyers.length===1&&buyers[0]?trip.families.find(f=>f.id===buyers[0])?.name:undefined;
 const rows=items.map(item=><ShoppingItem key={item.id} trip={trip} myFamily={myFamily} item={item} save={save} onEdit={onEdit} hideBuyer={!!shared}/>);
 if(items.length<=3)return <div className="event-shopping">{shared&&items.length>1&&<p className="meal-shop-buyer">{shared} buys these</p>}{rows}{addField}</div>;
 const summary=[`${items.length} ingredients`,toBuy.length?`${toBuy.length} to buy`:'all bought',shared?`${shared} buys all`:''].filter(Boolean).join(' · ');
 const preview=(toBuy.length?toBuy:items).slice(0,3).map(i=>i.text).join(', ');
 const more=(toBuy.length?toBuy:items).length-3;
 return <div className="event-shopping">
  <button type="button" className="meal-shop-toggle" aria-expanded={open} aria-label={`${open?'Hide':'Show'} shopping for ${title}: ${summary}`} onClick={()=>setOpen(o=>!o)}>
   <ShoppingBasket size={17} aria-hidden="true"/>
   <span><strong>{summary}</strong>{!open&&<small>{preview}{more>0?` +${more}`:''}</small>}</span>
   <ChevronDown size={18} aria-hidden="true" className={open?'flip':''}/>
  </button>
  {open&&<>{rows}{addField}</>}
 </div>;
}
