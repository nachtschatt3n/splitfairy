import {useState,type FormEvent} from 'react';
import {ArrowRight,BedDouble,MapPin,Pencil} from 'lucide-react';
import type {Event,Leg,Stay,Transport,Trip} from '../../../packages/domain/src/model.js';
import {Button,Sheet,cents,euro,fmt,uid,type Remove,type Save} from './common.js';
import {TransportIcon} from './packing.js';
import {StayCover,StayPhotos,type PhotoActions} from './photos.js';

export const tripDays=(trip:Trip)=>!trip.start||!trip.end?[]:Array.from({length:Math.min(62,Math.max(1,Math.round((new Date(`${trip.end}T12:00:00`).getTime()-new Date(`${trip.start}T12:00:00`).getTime())/86400000)+1))},(_,i)=>{const d=new Date(`${trip.start}T12:00:00`);d.setDate(d.getDate()+i);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;});
const nightsBetween=(from:string,to:string)=>Math.max(0,Math.round((new Date(`${to}T12:00:00`).getTime()-new Date(`${from}T12:00:00`).getTime())/86400000));
const nights=(s:Stay)=>nightsBetween(s.from,s.to);
const mapsLink=(address:string)=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
export const legLoad=(trip:Trip,leg:Leg)=>(trip.gear??[]).filter(g=>(g.route?.length?g.route:g.transportId?[g.transportId]:[]).includes(leg.transportId));

/** A stay with its dates, times, address, notes and optional booking cost (created as a Stay expense). */
export function StaySheet({trip,stay,day,save,remove,busy,photos,onPhoto,onClose}:{trip:Trip;stay?:Stay;day:string;save:Save;remove:Remove;busy:boolean;photos?:PhotoActions;onPhoto?:(index:number)=>void;onClose:()=>void}){
 const next=(d:string)=>{const x=new Date(`${d}T12:00:00`);if(Number.isNaN(x.getTime()))return d;x.setDate(x.getDate()+1);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;};
 const [name,setName]=useState(stay?.name??''),[address,setAddress]=useState(stay?.address??''),[from,setFrom]=useState(stay?.from??day),[to,setTo]=useState(stay?.to??next(day));
 const [checkIn,setCheckIn]=useState(stay?.checkIn??''),[checkOut,setCheckOut]=useState(stay?.checkOut??''),[note,setNote]=useState(stay?.note??'');
 const linked=trip.expenses.find(e=>e.id===stay?.expenseId);
 const [cost,setCost]=useState(''),[payer,setPayer]=useState(trip.families[0]?.id??''),[error,setError]=useState('');
 const submit=async(e:FormEvent)=>{
  e.preventDefault();setError('');
  if(!name.trim()){setError('Give the stay a name.');return;}
  if(to<from){setError('Check-out must be on or after the first night.');return;}
  let expenseId=stay?.expenseId??null;
  if(!linked&&cost.trim()){
   const total=cents(cost);if(!Number.isSafeInteger(total)||total<=0){setError('Enter the booking cost like 480.00.');return;}
   if(!payer||!trip.people.length){setError('Add people and choose who paid before adding a cost.');return;}
   // The booking becomes a normal Stay expense shared by everyone, so it is settled like any other cost.
   expenseId=uid();const everyone=trip.people.map(p=>({id:p.id,weight:p.weight}));
   await save('expense',{id:expenseId,title:`Stay: ${name.trim()}`,date:from,category:'stay',total,payers:[{familyId:payer,amount:total}],lines:[{id:uid(),label:name.trim(),amount:total,splits:[{amount:total,eventId:null,weights:everyone,fixed:[]}]}],notes:'',receiptIds:[],status:'posted',version:0});
  }
  await save('stay',{id:stay?.id??uid(),name:name.trim(),address:address.trim(),from,to,checkIn,checkOut,note:note.trim(),expenseId,version:stay?.version??0},stay);onClose();
 };
 return <Sheet title={stay?`Edit ${stay.name}`:'Add a stay'} eyebrow="Where you sleep" onClose={onClose}>
  <form className="form-stack" onSubmit={submit}>
   <label>Name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Casa das Dunas" autoFocus required/></label>
   <label>Address (optional)<input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Rua das Dunas 12, Comporta"/></label>
   <div className="form-row"><label>First night<input type="date" value={from} min={trip.start} max={trip.end} onChange={e=>setFrom(e.target.value)} required/></label><label>Check-out day<input type="date" value={to} min={from} onChange={e=>setTo(e.target.value)} required/></label></div>
   <div className="form-row"><label>Check-in time<input type="time" value={checkIn} onChange={e=>setCheckIn(e.target.value)}/></label><label>Check-out time<input type="time" value={checkOut} onChange={e=>setCheckOut(e.target.value)}/></label></div>
   <label>Notes (optional)<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Key box at the gate, code in the booking email"/></label>
   {linked?<p className="helper">Booking cost: <strong>{euro(linked.total)}</strong>, recorded as the expense “{linked.title}”.</p>
    :<div className="form-row"><label>Booking cost (optional)<input inputMode="decimal" value={cost} onChange={e=>setCost(e.target.value)} placeholder="480.00"/></label><label>Paid by<select value={payer} onChange={e=>setPayer(e.target.value)}>{trip.families.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label></div>}
   {!linked&&<p className="helper">The cost is added to Spend and shared by everyone on the trip. You can change the split there.</p>}
   {stay&&photos&&onPhoto?<StayPhotos trip={trip} stay={stay} actions={photos} onOpen={onPhoto}/>:!stay&&<p className="helper">You can add photos of the place once it's saved.</p>}
   {error&&<p className="form-error" role="alert">{error}</p>}
   <Button type="submit" disabled={busy}>{stay?'Save changes':'Add stay'} <ArrowRight size={17}/></Button>
   {stay&&<Button kind="ghost" disabled={busy} onClick={async()=>{if(!window.confirm(`Remove ${stay.name}?${linked?' Its booking cost stays in Spend.':''}`))return;await remove('stay',stay);onClose();}}>Remove stay</Button>}
  </form>
 </Sheet>;
}

const KINDS:[Transport['kind'],string][]=[['car','Car'],['plane','Plane'],['train','Train'],['bus','Bus'],['other','Other']];
/** One leg of travel. A new car or flight can be created right here. */
export function LegSheet({trip,leg,day,save,remove,busy,onClose}:{trip:Trip;leg?:Leg;day:string;save:Save;remove:Remove;busy:boolean;onClose:()=>void}){
 const transport=trip.transport??[];
 const [transportId,setTransportId]=useState(leg?.transportId??transport[0]?.id??'__new'),[newName,setNewName]=useState(''),[newKind,setNewKind]=useState<Transport['kind']>('car');
 const [from,setFrom]=useState(leg?.from??''),[to,setTo]=useState(leg?.to??''),[departDate,setDepartDate]=useState(leg?.departDate??day),[departTime,setDepartTime]=useState(leg?.departTime??''),[arriveDate,setArriveDate]=useState(leg?.arriveDate??day),[arriveTime,setArriveTime]=useState(leg?.arriveTime??'');
 const vehicle=transport.find(t=>t.id===transportId);
 const [people,setPeople]=useState<string[]>(leg?.people??(vehicle?.familyId?trip.people.filter(p=>p.familyId===vehicle.familyId).map(p=>p.id):[]));
 const [note,setNote]=useState(leg?.note??''),[error,setError]=useState('');
 const submit=async(e:FormEvent)=>{
  e.preventDefault();setError('');
  if(!from.trim()||!to.trim()){setError('Say where the trip starts and ends.');return;}
  if(`${arriveDate}${arriveTime||'99:99'}`<`${departDate}${departTime||'00:00'}`){setError('Arrival must be after departure.');return;}
  let id=transportId;
  if(id==='__new'){if(!newName.trim()){setError('Name the car or flight, for example “Uhl car”.');return;}id=uid();await save('transport',{id,name:newName.trim(),kind:newKind,familyId:null,note:'',version:0});}
  await save('leg',{id:leg?.id??uid(),transportId:id,from:from.trim(),to:to.trim(),departDate,departTime,arriveDate,arriveTime,people,note:note.trim(),version:leg?.version??0},leg);onClose();
 };
 return <Sheet title={leg?'Edit travel':'Add travel'} eyebrow="On the way" onClose={onClose}>
  <form className="form-stack" onSubmit={submit}>
   <label>Car or flight<select value={transportId} onChange={e=>setTransportId(e.target.value)}>{transport.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}<option value="__new">A new car or flight…</option></select></label>
   {transportId==='__new'&&<div className="form-row"><label>Name<input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Uhl car"/></label><label>Type<select value={newKind} onChange={e=>setNewKind(e.target.value as Transport['kind'])}>{KINDS.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label></div>}
   <div className="form-row"><label>From<input value={from} onChange={e=>setFrom(e.target.value)} placeholder="Frankfurt (FRA)" required/></label><label>To<input value={to} onChange={e=>setTo(e.target.value)} placeholder="Lisbon (LIS)" required/></label></div>
   <div className="form-row"><label>Leaves<input type="date" value={departDate} onChange={e=>{setDepartDate(e.target.value);if(arriveDate<e.target.value)setArriveDate(e.target.value);}} required/></label><label>At<input type="time" value={departTime} onChange={e=>setDepartTime(e.target.value)}/></label></div>
   <div className="form-row"><label>Arrives<input type="date" value={arriveDate} min={departDate} onChange={e=>setArriveDate(e.target.value)} required/></label><label>At<input type="time" value={arriveTime} onChange={e=>setArriveTime(e.target.value)}/></label></div>
   <fieldset><legend>Who travels</legend><div className="chip-list">{trip.people.map(p=><label key={p.id} className={people.includes(p.id)?'chip checked':'chip'}><input type="checkbox" checked={people.includes(p.id)} onChange={()=>setPeople(x=>x.includes(p.id)?x.filter(i=>i!==p.id):[...x,p.id])}/>{p.name}</label>)}</div></fieldset>
   <label>Notes (optional)<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Flight TP 575, seats 12A–D"/></label>
   {error&&<p className="form-error" role="alert">{error}</p>}
   <Button type="submit" disabled={busy}>{leg?'Save changes':'Add travel'} <ArrowRight size={17}/></Button>
   {leg&&<Button kind="ghost" disabled={busy} onClick={async()=>{await remove('leg',leg);onClose();}}>Remove travel</Button>}
  </form>
 </Sheet>;
}

type Entry={key:string;time:string;kind:'event'|'leg'|'arrive'|'checkin'|'checkout';event?:Event;leg?:Leg;stay?:Stay};
/** Everything on one day, untimed things first, then by time. */
export function dayEntries(trip:Trip,day:string):{staying:Stay[];entries:Entry[]}{
 const entries:Entry[]=[];
 for(const e of trip.events.filter(x=>x.date===day))entries.push({key:`e${e.id}`,time:e.time??'',kind:'event',event:e});
 for(const l of trip.legs??[]){
  if(l.departDate===day)entries.push({key:`l${l.id}`,time:l.departTime,kind:'leg',leg:l});
  else if(l.arriveDate===day)entries.push({key:`a${l.id}`,time:l.arriveTime,kind:'arrive',leg:l});
 }
 for(const s of trip.stays??[]){
  if(s.from===day)entries.push({key:`i${s.id}`,time:s.checkIn,kind:'checkin',stay:s});
  if(s.to===day)entries.push({key:`o${s.id}`,time:s.checkOut,kind:'checkout',stay:s});
 }
 const staying=(trip.stays??[]).filter(s=>s.from<day&&day<s.to);
 const rank=(x:Entry)=>x.time?1:0;
 entries.sort((a,b)=>rank(a)-rank(b)||a.time.localeCompare(b.time)||(a.kind==='checkout'?-1:0));
 return {staying,entries};
}

export function LegCard({trip,leg,arriving,onEdit}:{trip:Trip;leg:Leg;arriving?:boolean;onEdit:()=>void}){
 const vehicle=(trip.transport??[]).find(t=>t.id===leg.transportId);
 const names=leg.people.map(id=>trip.people.find(p=>p.id===id)?.name).filter(Boolean);
 const load=legLoad(trip,leg);
 const label=`${vehicle?.name??'Travel'}: ${leg.from} → ${leg.to}`;
 return <article className="tl-card travel" aria-label={label}>
  <div className="event-head"><div><span className="event-type">{arriving?'Arriving':'Travel'} · {vehicle?.name??'Travel'}</span><h3>{leg.from} → {leg.to}</h3>
   <p>{leg.departTime||'?'} → {leg.arriveTime||'?'}{leg.arriveDate!==leg.departDate?` (${fmt(leg.arriveDate)})`:''}{names.length?` · ${names.join(', ')}`:''}</p>
   {leg.note&&<p>{leg.note}</p>}</div>
   <button type="button" className="icon-button subtle" aria-label={`Edit ${label}`} onClick={onEdit}><Pencil size={16}/></button></div>
  {load.length>0&&<div className="load-chips" aria-label={`Carries ${load.length} item${load.length===1?'':'s'}`}>{load.slice(0,6).map(g=><span key={g.id} className="load-chip">{g.quantity>1?`${g.quantity} × `:''}{g.text}</span>)}{load.length>6&&<span className="load-chip">+{load.length-6}</span>}</div>}
 </article>;
}

export function StayCard({trip,stay,mode,onEdit,onPhoto}:{trip:Trip;stay:Stay;mode:'checkin'|'checkout'|'staying';day:string;onEdit:()=>void;onPhoto?:(index:number)=>void}){
 const cost=trip.expenses.find(e=>e.id===stay.expenseId&&e.status==='posted');
 const n=nights(stay);
 const title=mode==='checkin'?`Check in · ${stay.name}`:mode==='checkout'?`Check out · ${stay.name}`:`Staying at ${stay.name}`;
 return <article className={`tl-card stay ${mode}`} aria-label={title}>
  {mode==='checkin'&&onPhoto&&<StayCover trip={trip} stay={stay} onOpen={onPhoto}/>}
  <div className="event-head">{mode==='staying'&&onPhoto&&<StayCover trip={trip} stay={stay} compact onOpen={onPhoto}/>}<div><span className="event-type">{mode==='checkout'?'Leaving':`${n} night${n===1?'':'s'}`}{cost?` · ${euro(cost.total)}`:''}</span><h3>{title}</h3>
   <p>{mode==='checkin'&&stay.checkIn?`From ${stay.checkIn}`:mode==='checkout'&&stay.checkOut?`By ${stay.checkOut}`:`${fmt(stay.from)} – ${fmt(stay.to)}`}{stay.note&&mode!=='staying'?` · ${stay.note}`:''}</p>
   {stay.address&&mode!=='staying'&&<a className="map-link" href={mapsLink(stay.address)} target="_blank" rel="noreferrer"><MapPin size={14}/> {stay.address}</a>}</div>
   <button type="button" className="icon-button subtle" aria-label={`Edit ${stay.name}`} onClick={onEdit}><Pencil size={16}/></button></div>
 </article>;
}

/** Whole trip on one screen for wide layouts: stays as bars, travel days, and a dot per plan. */
export function TripOverview({trip,day,onDay}:{trip:Trip;day:string;onDay:(d:string)=>void}){
 const days=tripDays(trip);const col=(d:string)=>Math.max(0,days.indexOf(d))+2;
 return <section className="card overview" aria-label="Whole trip">
  <div className="card-head"><div><span className="eyebrow">{fmt(trip.start)} – {fmt(trip.end)}</span><h2>The whole trip</h2></div></div>
  <div className="overview-scroll"><div className="overview-grid" style={{gridTemplateColumns:`84px repeat(${days.length},minmax(46px,1fr))`}}>
   <span/>
   {days.map(d=><button key={d} type="button" className={d===day?'ov-day on':'ov-day'} onClick={()=>onDay(d)} aria-label={`Open ${fmt(d)}`}><small>{new Date(`${d}T12:00:00`).toLocaleDateString('en-GB',{weekday:'short'})}</small><strong>{Number(d.slice(-2))}</strong></button>)}
   <span className="ov-lane">Stays</span>
   {(trip.stays??[]).filter(s=>s.to>trip.start&&s.from<=trip.end).map((s,i)=><span key={s.id} className={`ov-stay c${i%3}`} style={{gridColumn:`${col(s.from<trip.start?trip.start:s.from)} / ${Math.min(days.length+2,col(s.to>trip.end?trip.end:s.to)+(s.to>trip.end?1:0))}`,gridRow:2}} title={`${s.name}: ${nights(s)} nights`}><BedDouble size={13}/> {s.name}</span>)}
   <span className="ov-lane" style={{gridRow:3}}>Travel</span>
   {days.map(d=>{const legs=(trip.legs??[]).filter(l=>l.departDate===d);return <span key={d} className="ov-travel" style={{gridColumn:col(d),gridRow:3}}>{legs.slice(0,3).map(l=>{const v=(trip.transport??[]).find(t=>t.id===l.transportId);return <TransportIcon key={l.id} kind={v?.kind??'other'} size={14}/>;})}</span>;})}
   <span className="ov-lane" style={{gridRow:4}}>Plans</span>
   {days.map(d=><span key={d} className="ov-plans" style={{gridColumn:col(d),gridRow:4}}>{trip.events.filter(e=>e.date===d).slice(0,4).map(e=><i key={e.id} className={e.kind==='activity'?'act':''}/>)}</span>)}
  </div></div>
 </section>;
}

