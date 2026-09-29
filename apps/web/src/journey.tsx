import {useState,type FormEvent} from 'react';
import {ArrowRight,BedDouble,ExternalLink,MapPin,Paperclip,Pencil,Plus} from 'lucide-react';
import type {Event,Leg,Stay,Transport,Trip} from '../../../packages/domain/src/model.js';
import {Button,Sheet,cents,euro,fmt,fmtTime,uid,type Remove,type Save} from './common.js';
import {TransportIcon} from './packing.js';
import {AirlineBadge,parseFlight} from './airlines.js';
import {AddPhotosButton,StayCover,StayPhotos,photosOf,type PhotoActions,type Place} from './photos.js';
export const stayPlace=(stay:Stay):Place=>({id:stay.id,name:stay.name,kind:'stay'});
import {StayFiles} from './stayfiles.js';
import {SplitEditor,compileSplit,initialSplit,type SplitState} from './split.js';

export const tripDays=(trip:Trip)=>!trip.start||!trip.end?[]:Array.from({length:Math.min(62,Math.max(1,Math.round((new Date(`${trip.end}T12:00:00`).getTime()-new Date(`${trip.start}T12:00:00`).getTime())/86400000)+1))},(_,i)=>{const d=new Date(`${trip.start}T12:00:00`);d.setDate(d.getDate()+i);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;});
const nightsBetween=(from:string,to:string)=>Math.max(0,Math.round((new Date(`${to}T12:00:00`).getTime()-new Date(`${from}T12:00:00`).getTime())/86400000));
const nights=(s:Stay)=>nightsBetween(s.from,s.to);
const mapsLink=(address:string)=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
export const legLoad=(trip:Trip,leg:Leg)=>(trip.gear??[]).filter(g=>(g.route?.length?g.route:g.transportId?[g.transportId]:[]).includes(leg.transportId));

/** Who may change an existing cost: organizers, or whoever added it. */
export type Who={id:string;organizer:boolean};
type ScheduleRow=Stay['schedule'][number];
/** Who arrives and leaves when, per family or per person; empty dates mean the stay's own check-in and check-out day. */
function ScheduleEditor({trip,from,to,rows,onChange}:{trip:Trip;from:string;to:string;rows:ScheduleRow[];onChange:(rows:ScheduleRow[])=>void}){
 const set=(i:number,patch:Partial<ScheduleRow>)=>onChange(rows.map((r,n)=>n===i?{...r,...patch}:r));
 const whoValue=(r:ScheduleRow)=>r.personId?`p:${r.personId}`:r.familyId?`f:${r.familyId}`:'';
 const setWho=(i:number,value:string)=>set(i,value.startsWith('p:')?{personId:value.slice(2),familyId:null}:{familyId:value.slice(2)||null,personId:null});
 const next=trip.families.find(f=>!rows.some(r=>r.familyId===f.id));
 return <fieldset className="schedule-editor"><legend>Arrivals and departures</legend>
  {rows.map((r,i)=><div className="schedule-row" key={r.id}>
   <label>Who<select value={whoValue(r)} onChange={e=>setWho(i,e.target.value)}><option value="">Choose…</option>
    {trip.families.map(f=><optgroup key={f.id} label={f.name}><option value={`f:${f.id}`}>{f.name} (everyone)</option>{trip.people.filter(p=>p.familyId===f.id).map(p=><option key={p.id} value={`p:${p.id}`}>{p.name}</option>)}</optgroup>)}</select></label>
   <div className="form-row"><label>Arrives<input type="date" value={r.arriveDate||from} min={from} max={to} onChange={e=>set(i,{arriveDate:e.target.value===from?'':e.target.value})}/></label><label>at<input type="time" value={r.arriveTime} onChange={e=>set(i,{arriveTime:e.target.value})}/></label></div>
   <div className="form-row"><label>Leaves<input type="date" value={r.departDate||to} min={from} max={to} onChange={e=>set(i,{departDate:e.target.value===to?'':e.target.value})}/></label><label>at<input type="time" value={r.departTime} onChange={e=>set(i,{departTime:e.target.value})}/></label></div>
   <button type="button" className="text-button" onClick={()=>onChange(rows.filter((_,n)=>n!==i))}>Remove</button>
  </div>)}
  <button type="button" className="text-button" onClick={()=>onChange([...rows,{id:uid(),familyId:next?.id??null,personId:null,arriveDate:'',arriveTime:'',departDate:'',departTime:''}])}><Plus size={15}/> {rows.length?'Add another':'Add arrival and departure times'}</button>
  {!rows.length&&<p className="helper">For families or people who arrive or leave at their own time.</p>}
 </fieldset>;
}

/** A stay with its dates, times, address, notes, who is staying, and an optional booking cost (kept as a Stay expense). */
export function StaySheet({trip,stay,day,save,remove,busy,who,photos,onPhoto,onClose}:{trip:Trip;stay?:Stay;day:string;save:Save;remove:Remove;busy:boolean;who:Who;photos?:PhotoActions;onPhoto?:(index:number)=>void;onClose:()=>void}){
 const next=(d:string)=>{const x=new Date(`${d}T12:00:00`);if(Number.isNaN(x.getTime()))return d;x.setDate(x.getDate()+1);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;};
 const [name,setName]=useState(stay?.name??''),[address,setAddress]=useState(stay?.address??''),[from,setFrom]=useState(stay?.from??day),[to,setTo]=useState(stay?.to??next(day));
 const [checkIn,setCheckIn]=useState(stay?.checkIn??''),[checkOut,setCheckOut]=useState(stay?.checkOut??''),[note,setNote]=useState(stay?.note??''),[url,setUrl]=useState(stay?.url??''),[schedule,setSchedule]=useState<ScheduleRow[]>(stay?.schedule??[]);
 // Older stays have no guest list: they count as everyone.
 const [staying,setStaying]=useState<string[]>(stay?.guests?.length?stay.guests.map(g=>g.id):trip.people.map(p=>p.id));
 const linked=trip.expenses.find(e=>e.id===stay?.expenseId&&e.status==='posted');
 // A cost that was reshaped in Spend (several items, payers or custom amounts) is left alone here.
 const simple=!linked||(linked.lines.length===1&&linked.lines[0].splits.length===1&&!linked.lines[0].splits[0].eventId&&linked.payers.length===1);
 const mayEdit=!linked||who.organizer||linked.authorId===who.id;
 const [cost,setCost]=useState(linked?(linked.total/100).toFixed(2):''),[payer,setPayer]=useState(linked?.payers[0]?.familyId??''),[error,setError]=useState('');
 const guestPeople=trip.people.filter(p=>staying.includes(p.id)),guests=guestPeople.map(p=>({id:p.id,weight:p.weight}));
 const total=cost.trim()?cents(cost):0;
 // The booking is split among the people staying; by their trip shares unless changed.
 const [split,setSplit]=useState<SplitState>(()=>initialSplit(trip,guestPeople,simple?linked?.lines[0]?.splits[0]:null,'shares'));
 const toggle=(id:string)=>{
  const adding=!staying.includes(id),person=trip.people.find(p=>p.id===id);
  setStaying(list=>adding?[...list,id]:list.filter(x=>x!==id));
  // Someone who joins the stay also joins an equal split and starts with their trip share.
  if(adding&&person)setSplit(s=>({...s,people:s.people.includes(id)?s.people:[...s.people,id],shares:s.shares[id]!==undefined?s.shares:{...s.shares,[id]:String(person.weight)}}));
 };
 const submit=async(e:FormEvent)=>{
  e.preventDefault();setError('');
  if(!name.trim()){setError('Give the stay a name.');return;}
  if(to<from){setError('Check-out must be on or after the first night.');return;}
  if(url.trim()&&!/^https?:\/\/\S+\.\S+/.test(url.trim())){setError('Paste the full booking link, starting with https://');return;}
  if(schedule.some(r=>!r.familyId&&!r.personId)){setError('Choose who each arrival or departure is for.');return;}
  if(schedule.some(r=>r.arriveDate&&r.departDate&&r.departDate<r.arriveDate)){setError('A departure is before its arrival.');return;}
  let expenseId=linked?.id??null;
  if(simple&&mayEdit){
   if(cost.trim()){
    if(!Number.isSafeInteger(total)||total<=0){setError('Enter the booking cost like 480.00.');return;}
    if(!payer){setError('Choose who paid the booking, or leave the cost empty.');return;}
    if(!guests.length){setError('Choose who is staying, so the cost can be split.');return;}
    const compiled=compileSplit(split,guestPeople,total,trip);if('error' in compiled){setError(compiled.error);return;}
    // The booking is a normal Stay expense, split among the people staying.
    const id=linked?.id??uid(),line=linked?.lines[0];
    await save('expense',{id,title:`Stay: ${name.trim()}`,date:from,category:'stay',total,payers:[{familyId:payer,amount:total}],lines:[{id:line?.id??uid(),label:name.trim(),amount:total,splits:[{amount:total,eventId:null,...compiled}]}],notes:linked?.notes??'',receiptIds:linked?.receiptIds??[],status:'posted',version:linked?.version??0},linked);
    expenseId=id;
   }else if(linked){
    // Clearing the cost voids the expense; it can be restored from Spend.
    await save('expense',{...linked,status:'void'},linked);expenseId=null;
   }
  }
  await save('stay',{id:stay?.id??uid(),name:name.trim(),address:address.trim(),from,to,checkIn,checkOut,note:note.trim(),url:url.trim(),schedule,guests,expenseId,version:stay?.version??0},stay);onClose();
 };
 return <Sheet title={stay?`Edit ${stay.name}`:'Add a stay'} eyebrow="Where you sleep" onClose={onClose}>
  <form className="form-stack" onSubmit={submit}>
   <label>Name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Casa das Dunas" autoFocus required/></label>
   <label>Address (optional)<input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Rua das Dunas 12, Comporta"/></label>
   <div className="form-row"><label>First night<input type="date" value={from} min={trip.start} max={trip.end} onChange={e=>setFrom(e.target.value)} required/></label><label>Check-out day<input type="date" value={to} min={from} onChange={e=>setTo(e.target.value)} required/></label></div>
   <div className="form-row"><label>Check-in time<input type="time" value={checkIn} onChange={e=>setCheckIn(e.target.value)}/></label><label>Check-out time<input type="time" value={checkOut} onChange={e=>setCheckOut(e.target.value)}/></label></div>
   <label>Booking link (optional)<input type="url" inputMode="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://www.airbnb.com/rooms/…"/></label>
   <label>Notes (optional)<textarea rows={3} maxLength={4000} value={note} onChange={e=>setNote(e.target.value)} placeholder="Key box at the gate, code in the booking email. Wi-Fi: Dunas2026"/></label>
   <ScheduleEditor trip={trip} from={from} to={to} rows={schedule} onChange={setSchedule}/>
   {stay&&photos&&<StayFiles trip={trip} stay={stay} userId={photos.userId} organizer={photos.organizer} onChanged={photos.refresh}/>}
   {stay&&photos&&onPhoto?<StayPhotos trip={trip} place={stayPlace(stay)} actions={photos} onOpen={onPhoto}/>:!stay&&<p className="helper">You can add photos of the place once it's saved.</p>}
   <fieldset><legend>Who is staying?</legend>
    {trip.people.length?<>
     <div className="chip-actions"><button type="button" className="text-button" onClick={()=>setStaying(trip.people.map(p=>p.id))}>Everyone</button><button type="button" className="text-button" onClick={()=>setStaying([])}>Nobody yet</button></div>
     <div className="chip-list">{trip.people.map(p=><label key={p.id} className={staying.includes(p.id)?'chip checked':'chip'}><input type="checkbox" checked={staying.includes(p.id)} onChange={()=>toggle(p.id)}/>{p.name}</label>)}</div>
    </>:<p className="helper">No people on the trip yet. You can add the stay now and choose who stays later.</p>}
   </fieldset>
   {simple&&mayEdit?<>
    <div className="form-row"><label>Booking cost (optional)<input inputMode="decimal" value={cost} onChange={e=>setCost(e.target.value)} placeholder="480.00"/></label>
     <label>Paid by (optional)<select value={payer} onChange={e=>setPayer(e.target.value)}><option value="">Not paid yet</option>{trip.families.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label></div>
    {total>0&&guestPeople.length>0?<SplitEditor trip={trip} people={guestPeople} total={total} value={split} onChange={setSplit} legend="How is the booking split?"/>
     :<p className="helper">{linked?'Clear the cost to remove it from Spend (it is voided and can be restored).':'Add the cost and who paid to put it in Spend, split among the people staying.'}</p>}
   </>:linked&&<p className="helper">Booking cost: <strong>{euro(linked.total)}</strong>, recorded as “{linked.title}”. {mayEdit?'It was changed in Spend, so edit it there.':'Only the organizer or whoever added it can change it, in Spend.'}</p>}
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
 const isPlane=transportId==='__new'?newKind==='plane':vehicle?.kind==='plane';
 const [people,setPeople]=useState<string[]>(leg?.people??(vehicle?.familyId?trip.people.filter(p=>p.familyId===vehicle.familyId).map(p=>p.id):[]));
 const [note,setNote]=useState(leg?.note??''),[flightNo,setFlightNo]=useState(leg?.flightNo??''),[error,setError]=useState('');
 const submit=async(e:FormEvent)=>{
  e.preventDefault();setError('');
  if(!from.trim()||!to.trim()){setError('Say where the trip starts and ends.');return;}
  if(`${arriveDate}${arriveTime||'99:99'}`<`${departDate}${departTime||'00:00'}`){setError('Arrival must be after departure.');return;}
  if(isPlane&&flightNo.trim()&&!parseFlight(flightNo)){setError('Use a flight number like LH 1172.');return;}
  let id=transportId;
  if(id==='__new'){if(!newName.trim()){setError('Name the car or flight, for example “Uhl car”.');return;}id=uid();await save('transport',{id,name:newName.trim(),kind:newKind,familyId:null,note:'',version:0});}
  await save('leg',{id:leg?.id??uid(),transportId:id,from:from.trim(),to:to.trim(),departDate,departTime,arriveDate,arriveTime,people,note:note.trim(),flightNo:isPlane&&flightNo.trim()?parseFlight(flightNo)?.number??flightNo.trim():'',version:leg?.version??0},leg);onClose();
 };
 return <Sheet title={leg?'Edit travel':'Add travel'} eyebrow="On the way" onClose={onClose}>
  <form className="form-stack" onSubmit={submit}>
   <label>Car or flight<select value={transportId} onChange={e=>setTransportId(e.target.value)}>{transport.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}<option value="__new">A new car or flight…</option></select></label>
   {transportId==='__new'&&<div className="form-row"><label>Name<input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Uhl car"/></label><label>Type<select value={newKind} onChange={e=>setNewKind(e.target.value as Transport['kind'])}>{KINDS.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label></div>}
   <div className="form-row"><label>From<input value={from} onChange={e=>setFrom(e.target.value)} placeholder="Frankfurt (FRA)" required/></label><label>To<input value={to} onChange={e=>setTo(e.target.value)} placeholder="Lisbon (LIS)" required/></label></div>
   <div className="form-row"><label>Leaves<input type="date" value={departDate} onChange={e=>{setDepartDate(e.target.value);if(arriveDate<e.target.value)setArriveDate(e.target.value);}} required/></label><label>At<input type="time" value={departTime} onChange={e=>setDepartTime(e.target.value)}/></label></div>
   <div className="form-row"><label>Arrives<input type="date" value={arriveDate} min={departDate} onChange={e=>setArriveDate(e.target.value)} required/></label><label>At<input type="time" value={arriveTime} onChange={e=>setArriveTime(e.target.value)}/></label></div>
   <fieldset><legend>Who travels</legend><div className="chip-list">{trip.people.map(p=><label key={p.id} className={people.includes(p.id)?'chip checked':'chip'}><input type="checkbox" checked={people.includes(p.id)} onChange={()=>setPeople(x=>x.includes(p.id)?x.filter(i=>i!==p.id):[...x,p.id])}/>{p.name}</label>)}</div></fieldset>
   {isPlane&&<label>Flight number (optional)<span className="flight-input"><AirlineBadge flightNo={flightNo} size={30}/><input value={flightNo} onChange={e=>setFlightNo(e.target.value)} placeholder="TP 575" autoCapitalize="characters"/></span>{parseFlight(flightNo)?.airline&&<small className="helper">{parseFlight(flightNo)!.airline!.name}</small>}</label>}
   <label>Notes (optional)<input value={note} onChange={e=>setNote(e.target.value)} placeholder={isPlane?'Seats 12A–D, 2 checked bags':'Stop for lunch in Évora'}/></label>
   {error&&<p className="form-error" role="alert">{error}</p>}
   <Button type="submit" disabled={busy}>{leg?'Save changes':'Add travel'} <ArrowRight size={17}/></Button>
   {leg&&<Button kind="ghost" disabled={busy} onClick={async()=>{await remove('leg',leg);onClose();}}>Remove travel</Button>}
  </form>
 </Sheet>;
}

type Entry={key:string;time:string;kind:'event'|'leg'|'arrive'|'checkin'|'checkout'|'guest-in'|'guest-out';event?:Event;leg?:Leg;stay?:Stay;row?:ScheduleRow};
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
  // Families or people arriving or leaving on another day than the stay's own check-in and check-out.
  for(const r of s.schedule??[]){
   if(r.arriveDate&&r.arriveDate!==s.from&&r.arriveDate===day)entries.push({key:`gi${r.id}`,time:r.arriveTime,kind:'guest-in',stay:s,row:r});
   if(r.departDate&&r.departDate!==s.to&&r.departDate===day)entries.push({key:`go${r.id}`,time:r.departTime,kind:'guest-out',stay:s,row:r});
  }
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
 const label=`${vehicle?.name??'Travel'}: ${leg.from} → ${leg.to}`,flight=parseFlight(leg.flightNo);
 return <article className="tl-card travel" aria-label={label}>
  <div className="event-head"><AirlineBadge flightNo={leg.flightNo}/><div><span className="event-type">{arriving?'Arriving':'Travel'} · {vehicle?.name??'Travel'}</span><h3>{leg.from} → {leg.to}</h3>{flight&&<p className="flight-line">{flight.airline?`${flight.airline.name} `:''}<strong>{flight.number}</strong></p>}
   <p>{fmtTime(leg.departTime)||'?'} → {fmtTime(leg.arriveTime)||'?'}{leg.arriveDate!==leg.departDate?` (${fmt(leg.arriveDate)})`:''}{names.length?` · ${names.join(', ')}`:''}</p>
   {leg.note&&<p>{leg.note}</p>}</div>
   <button type="button" className="icon-button subtle" aria-label={`Edit ${label}`} onClick={onEdit}><Pencil size={16}/></button></div>
  {load.length>0&&<div className="load-chips" aria-label={`Carries ${load.length} item${load.length===1?'':'s'}`}>{load.slice(0,6).map(g=><span key={g.id} className="load-chip">{g.quantity>1?`${g.quantity} × `:''}{g.text}</span>)}{load.length>6&&<span className="load-chip">+{load.length-6}</span>}</div>}
 </article>;
}

/** "Uhl family" or "Mathias" for an arrival row. */
export const scheduleWho=(trip:Trip,r:ScheduleRow)=>r.personId?trip.people.find(p=>p.id===r.personId)?.name??'Someone':trip.families.find(f=>f.id===r.familyId)?.name??'A family';
/** A family or person arriving at, or leaving, a stay on a day of its own. */
export function GuestCard({trip,entry,onEdit}:{trip:Trip;entry:Entry;onEdit:()=>void}){
 const who=scheduleWho(trip,entry.row!),arriving=entry.kind==='guest-in',label=`${who} ${arriving?'arrives at':'leaves'} ${entry.stay!.name}`;
 return <article className="tl-card stay guest" aria-label={label}><div className="event-head"><div><span className="event-type">{arriving?'Arriving':'Leaving'}</span><h3>{label}</h3></div>
  <button type="button" className="icon-button subtle" aria-label={`Edit ${entry.stay!.name}`} onClick={onEdit}><Pencil size={16}/></button></div></article>;
}
export function StayCard({trip,stay,mode,onEdit,onPhoto,photos}:{trip:Trip;stay:Stay;mode:'checkin'|'checkout'|'staying';day:string;onEdit:()=>void;onPhoto?:(index:number)=>void;photos?:PhotoActions}){
 const cost=trip.expenses.find(e=>e.id===stay.expenseId&&e.status==='posted');
 const n=nights(stay);
 const title=mode==='checkin'?`Check in · ${stay.name}`:mode==='checkout'?`Check out · ${stay.name}`:`Staying at ${stay.name}`;
 return <article className={`tl-card stay ${mode}`} aria-label={title}>
  {mode==='checkin'&&onPhoto&&<StayCover trip={trip} place={stayPlace(stay)} onOpen={onPhoto}/>}
  <div className="event-head">{mode==='staying'&&onPhoto&&<StayCover trip={trip} place={stayPlace(stay)} compact onOpen={onPhoto}/>}<div><span className="event-type">{mode==='checkout'?'Leaving':`${n} night${n===1?'':'s'}`}{stay.guests?.length&&mode!=='checkout'?` · ${stay.guests.length} staying`:''}{cost?` · ${euro(cost.total)}`:''}</span><h3>{title}</h3>
   <p>{mode==='checkin'&&stay.checkIn?`From ${fmtTime(stay.checkIn)}`:mode==='checkout'&&stay.checkOut?`By ${fmtTime(stay.checkOut)}`:`${fmt(stay.from)} – ${fmt(stay.to)}`}{stay.note&&mode!=='staying'?` · ${stay.note}`:''}</p>
   {(()=>{const rows=(stay.schedule??[]).filter(r=>mode==='checkin'?!r.arriveDate||r.arriveDate===stay.from:mode==='checkout'?!r.departDate||r.departDate===stay.to:false).filter(r=>mode==='checkin'?r.arriveTime||r.arriveDate:r.departTime||r.departDate);
    return rows.length>0&&<ul className="schedule-list" aria-label={mode==='checkin'?'Arrivals':'Departures'}>{rows.map(r=><li key={r.id}><strong>{scheduleWho(trip,r)}</strong> {mode==='checkin'?'arrives':'leaves'}{(mode==='checkin'?r.arriveTime:r.departTime)?` at ${fmtTime(mode==='checkin'?r.arriveTime:r.departTime)}`:''}</li>)}</ul>;})()}
   {(stay.url||(trip.files??[]).some(f=>f.stayId===stay.id))&&mode!=='checkout'&&<p className="stay-links">{stay.url&&<a className="map-link" href={stay.url} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Booking</a>}{(trip.files??[]).some(f=>f.stayId===stay.id)&&<button type="button" className="text-button" onClick={onEdit}><Paperclip size={14}/> {(trip.files??[]).filter(f=>f.stayId===stay.id).length} file{(trip.files??[]).filter(f=>f.stayId===stay.id).length===1?'':'s'}</button>}</p>}
   {stay.address&&mode!=='staying'&&<a className="map-link" href={mapsLink(stay.address)} target="_blank" rel="noreferrer"><MapPin size={14}/> {stay.address}</a>}</div>
   <button type="button" className="icon-button subtle" aria-label={`Edit ${stay.name}`} onClick={onEdit}><Pencil size={16}/></button></div>
  {mode!=='checkout'&&photos&&!photosOf(trip,stay.id).length&&<AddPhotosButton place={stayPlace(stay)} actions={photos}/>}
 </article>;
}

/** Whole trip on one screen for wide layouts: stays as bars, travel days, and a dot per plan. */
export function TripOverview({trip,day,onDay}:{trip:Trip;day:string;onDay:(d:string)=>void}){
 // Two grid tracks per day: a stay runs from midday on its first night to midday on its check-out day,
 // so a check-out and the next check-in share a day without overlapping.
 const days=tripDays(trip);const at=(d:string)=>2+2*Math.max(0,days.indexOf(d));const col=(d:string)=>`${at(d)} / span 2`;
 const stayColumns=(s:Stay)=>`${s.from<trip.start?2:at(s.from)+1} / ${s.to>trip.end?2+2*days.length:at(s.to)+1}`;
 return <section className="card overview" aria-label="Whole trip">
  <div className="card-head"><div><span className="eyebrow">{fmt(trip.start)} – {fmt(trip.end)}</span><h2>The whole trip</h2></div></div>
  <div className="overview-scroll"><div className="overview-grid" style={{gridTemplateColumns:`84px repeat(${days.length*2},minmax(23px,1fr))`}}>
   <span/>
   {days.map(d=><button key={d} type="button" style={{gridColumn:col(d),gridRow:1}} className={d===day?'ov-day on':'ov-day'} onClick={()=>onDay(d)} aria-label={`Open ${fmt(d)}`}><small>{new Date(`${d}T12:00:00`).toLocaleDateString('en-GB',{weekday:'short'})}</small><strong>{Number(d.slice(-2))}</strong></button>)}
   <span className="ov-lane" style={{gridColumn:1,gridRow:2}}>Stays</span>
   {(trip.stays??[]).filter(s=>s.to>trip.start&&s.from<=trip.end).map((s,i)=><span key={s.id} className={`ov-stay c${i%3}`} style={{gridColumn:stayColumns(s),gridRow:2}} title={`${s.name}: ${nights(s)} nights`}><BedDouble size={13}/> {s.name}</span>)}
   <span className="ov-lane" style={{gridColumn:1,gridRow:3}}>Travel</span>
   {days.map(d=>{const legs=(trip.legs??[]).filter(l=>l.departDate===d);return <span key={d} className="ov-travel" style={{gridColumn:col(d),gridRow:3}}>{legs.slice(0,3).map(l=>{const v=(trip.transport??[]).find(t=>t.id===l.transportId);return <TransportIcon key={l.id} kind={v?.kind??'other'} size={14}/>;})}</span>;})}
   <span className="ov-lane" style={{gridColumn:1,gridRow:4}}>Plans</span>
   {days.map(d=><span key={d} className="ov-plans" style={{gridColumn:col(d),gridRow:4}}>{trip.events.filter(e=>e.date===d).slice(0,4).map(e=><i key={e.id} className={e.kind==='activity'?'act':''}/>)}</span>)}
  </div></div>
 </section>;
}

