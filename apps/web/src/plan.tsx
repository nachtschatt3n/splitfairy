import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowRight,BedDouble,BookOpen,CalendarDays,MapPin,Pencil,Plus,ReceiptText,Search,Sun,UtensilsCrossed,Wine} from 'lucide-react';
import {GuestCard,LegCard,LegSheet,StayCard,StaySheet,TripOverview,dayEntries,stayPlace,tripDays,type Who} from './journey.js';
import {PhotoViewer,StayCover,StayPhotos,photosOf,type PhotoActions,type Place} from './photos.js';
import {TransportIcon} from './packing.js';
import type {Event,Leg,Shopping,Stay,Trip} from '../../../packages/domain/src/model.js';
import {Button,Empty,Sheet,euro,fmt,fmtTime,today,uid,type Remove,type Save} from './common.js';
import {api} from './api.js';
import {MealShopping,ShoppingSheet,ShoppingSummary} from './shopping.js';

const KINDS:[Event['kind'],string][]=[['breakfast','Breakfast'],['lunch','Lunch'],['dinner','Dinner'],['restaurant','Restaurant'],['activity','Activity']];
const ORDER=KINDS.map(([k])=>k);
export const joiningLabel=(e:Event,trip:Trip)=>!e.participants.length?'Nobody yet':e.participants.length===trip.people.length&&trip.people.length>0?`Everyone (${e.participants.length})`:`${e.participants.length} joining`;

/** Address for a restaurant: type it, or look it up by name on OpenStreetMap and pick a match. */
function PlaceLookup({name,address,onPick,onAddress}:{name:string;address:string;onPick:(name:string,address:string)=>void;onAddress:(a:string)=>void}){
 const [results,setResults]=useState<{name:string;address:string}[]|null>(null),[looking,setLooking]=useState(false),[error,setError]=useState('');
 const search=async()=>{
  const q=[name,address].map(x=>x.trim()).filter(Boolean).join(', ');if(q.length<3){setError('Type the restaurant name first.');return;}
  setLooking(true);setError('');setResults(null);
  try{const found=await api.places(q);setResults(found);if(!found.length)setError('Nothing found. Add the town, or type the address.');}
  catch(err){setError(err instanceof Error?err.message:'Address lookup failed; type the address instead.');}
  finally{setLooking(false);}
 };
 return <div className="place-lookup">
  <div className="lookup-row"><label>Address (optional)<input value={address} onChange={e=>{onAddress(e.target.value);setResults(null);}} placeholder="Rua do Diário de Notícias 39, Lisboa"/></label>
   <Button kind="secondary" disabled={looking} onClick={()=>void search()}><Search size={16}/> {looking?'Looking…':'Look up'}</Button></div>
  {results&&results.length>0&&<ul className="lookup-results" aria-label="Places found">{results.map(r=><li key={r.address}><button type="button" onClick={()=>{onPick(r.name,r.address);setResults(null);}}><MapPin size={15}/><span><strong>{r.name}</strong><small>{r.address}</small></span></button></li>)}</ul>}
  {error&&<p className="helper" role="status">{error}</p>}
  {address.trim()&&<a className="map-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer"><MapPin size={14}/> Open in Maps</a>}
  <p className="helper">Look up searches OpenStreetMap for the name you typed.</p>
 </div>;
}

const MEALS:Event['kind'][]=['breakfast','lunch','dinner'];
export const eventPlace=(e:Event):Place=>({id:e.id,name:e.title,kind:'event'});
function EventSheet({trip,event,day,save,remove,busy,photos,onPhoto,onClose}:{trip:Trip;event?:Event;day:string;save:Save;remove:Remove;busy:boolean;photos?:PhotoActions;onPhoto?:(index:number)=>void;onClose:()=>void}){
 const [title,setTitle]=useState(event?.title??''),[kind,setKind]=useState<Event['kind']>(event?.kind??'dinner'),[date,setDate]=useState(event?.date??day),[time,setTime]=useState(event?.time??''),[owner,setOwner]=useState(event?.owner??''),[notes,setNotes]=useState(event?.notes??''),[address,setAddress]=useState(event?.address??''),[recipeUrl,setRecipeUrl]=useState(event?.recipeUrl??''),[error,setError]=useState('');
 // New plans start with everyone; it is easy to remove people or decide later.
 const [joining,setJoining]=useState<string[]>(event?event.participants.map(p=>p.id):trip.people.map(p=>p.id));
 const submit=async(e:FormEvent)=>{
  e.preventDefault();setError('');if(!title.trim())return;
  if(MEALS.includes(kind)&&recipeUrl.trim()&&!/^https?:\/\/\S+\.\S+/.test(recipeUrl.trim())){setError('Paste the full recipe link, starting with https://');return;}
  // Weights come from the people's current share; existing expenses keep the split they were posted with.
  const participants=trip.people.filter(p=>joining.includes(p.id)).map(p=>({id:p.id,weight:p.weight}));
  await save('event',{id:event?.id??uid(),title:title.trim(),kind,date,time,owner:owner.trim(),notes:notes.trim(),address:kind==='restaurant'?address.trim():'',recipeUrl:MEALS.includes(kind)?recipeUrl.trim():'',participants,version:event?.version??0},event);
  onClose();
 };
 const linked=event?trip.expenses.filter(x=>x.status!=='void'&&x.lines.some(l=>l.splits.some(sp=>sp.eventId===event.id))).length:0;
 const blockedWhy=`${linked} expense${linked===1?' is':'s are'} split on this plan, so it cannot be deleted. Void or edit ${linked===1?'it':'them'} first.`;
 // From the header too: when expenses hold it back, show why instead of deleting.
 const del=async()=>{if(!event)return;if(linked){const why=document.getElementById('plan-delete-why');why?.scrollIntoView({block:'center',behavior:'smooth'});why?.classList.add('flash');return;}
  if(!window.confirm(`Delete ${event.title}? Its shopping items stay on the general list.`))return;await remove('event',event);onClose();};
 const toggle=(id:string)=>setJoining(j=>j.includes(id)?j.filter(x=>x!==id):[...j,id]);
 return <Sheet title={event?`Edit ${event.title}`:'Plan a meal or activity'} eyebrow="The plan" onClose={onClose} onDelete={event?()=>void del():undefined} deleteLabel={event?`Delete ${event.title}`:undefined}>
  <form className="form-stack" onSubmit={submit}>
   <label>{kind==='restaurant'?'Which restaurant?':'What is it?'}<input value={title} onChange={e=>setTitle(e.target.value)} placeholder={kind==='restaurant'?'Tasca do Chico':'Grilled sardines'} autoFocus required/></label>
   <div className="form-row"><label>Type<select value={kind} onChange={e=>setKind(e.target.value as Event['kind'])}>{KINDS.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
    <label>Day<input type="date" value={date} min={trip.start} max={trip.end} onChange={e=>setDate(e.target.value)} required/></label><label>Time (optional)<input type="time" value={time} onChange={e=>setTime(e.target.value)}/></label></div>
   {kind==='restaurant'&&<PlaceLookup name={title} address={address} onPick={(name,addr)=>{setAddress(addr);if(!title.trim()||name.toLowerCase().includes(title.trim().toLowerCase()))setTitle(name);}} onAddress={setAddress}/>}
   {MEALS.includes(kind)&&<label>Recipe link (optional)<input type="url" inputMode="url" value={recipeUrl} onChange={e=>setRecipeUrl(e.target.value)} placeholder="https://www.chefkoch.de/rezepte/…"/></label>}
   {event&&photos&&onPhoto&&<StayPhotos trip={trip} place={eventPlace(event)} actions={photos} onOpen={onPhoto}/>}
   {kind!=='restaurant'&&<label>Who's organizing? (optional)<input value={owner} onChange={e=>setOwner(e.target.value)} placeholder="Ben cooks"/></label>}
   <label>Notes (optional)<textarea rows={3} maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Meet at the harbour, bring cash for the boat"/></label>
   <fieldset><legend>Who is joining?</legend>
    {trip.people.length?<>
     <div className="chip-actions"><button type="button" className="text-button" onClick={()=>setJoining(trip.people.map(p=>p.id))}>Everyone</button><button type="button" className="text-button" onClick={()=>setJoining([])}>Nobody yet</button></div>
     <div className="chip-list">{trip.people.map(p=><label key={p.id} className={joining.includes(p.id)?'chip checked':'chip'}><input type="checkbox" checked={joining.includes(p.id)} onChange={()=>toggle(p.id)}/>{p.name}</label>)}</div>
    </>:<p className="helper">No people on the trip yet. You can plan now and choose who joins later.</p>}
   </fieldset>
   {!joining.length&&trip.people.length>0&&<p className="helper">Nobody joining yet: costs for this can be split once someone joins.</p>}
   {error&&<p className="form-error" role="alert">{error}</p>}
   <Button type="submit" disabled={busy}>{event?'Save changes':'Add to plan'} <ArrowRight size={17}/></Button>
   {event&&(linked?<p className="helper" id="plan-delete-why">{blockedWhy}</p>:<Button kind="delete" disabled={busy} onClick={()=>void del()}>Delete {KINDS.find(([k])=>k===event.kind)?.[1].toLowerCase()??'plan'}</Button>)}
  </form>
 </Sheet>;
}

function QuickAdd({placeholder,label,onAdd,busy}:{placeholder:string;label:string;onAdd:(text:string)=>Promise<void>;busy:boolean}){
 const [text,setText]=useState('');
 return <form className="quick-add" onSubmit={async e=>{e.preventDefault();const value=text.trim();if(!value)return;setText('');await onAdd(value);}}>
  <input aria-label={label} value={text} onChange={e=>setText(e.target.value)} placeholder={placeholder}/>
  <Button type="submit" kind="secondary" disabled={!text.trim()} label="Add"><Plus size={17}/></Button>
 </form>;
}

export type PlanSheet='event'|'leg'|'stay';
export function Plan({trip,save,remove,busy,photos,who,intent,onAddBill,routeDay,onDayChange,myFamily,onOpenShopping}:{trip:Trip;save:Save;remove:Remove;busy:boolean;photos:PhotoActions;who:Who;intent?:{sheet:PlanSheet;n:number}|null;onAddBill?:(eventId:string)=>void;routeDay?:string|null;onDayChange?:(day:string)=>void;myFamily?:string|null;onOpenShopping?:()=>void}){
 // Open on today while the trip is running, otherwise on its first day.
 const defaultDay=()=>trip.start&&today()>=trip.start&&today()<=trip.end?today():trip.start||today();
 const [day,setShownDay]=useState(()=>routeDay&&routeDay>=trip.start&&routeDay<=trip.end?routeDay:defaultDay());
 // Picking a day puts it in the URL; back and forward bring the day from the URL.
 const setDay=(d:string)=>{setShownDay(d);onDayChange?.(d);};
 useEffect(()=>{setShownDay(routeDay&&routeDay>=trip.start&&routeDay<=trip.end?routeDay:defaultDay());},[routeDay]);
 const [sheet,setSheet]=useState<{event?:Event}|null>(null);
 // Keep the chosen day visible in the strip, also on narrow screens.
 useEffect(()=>{document.querySelector('.day-strip .selected')?.scrollIntoView({block:'nearest',inline:'nearest'});},[day]);
 const [itemSheet,setItemSheet]=useState<Shopping|null>(null);
 const days=tripDays(trip);
 const {staying,entries}=dayEntries(trip,day);
 const [legSheet,setLegSheet]=useState<{leg?:Leg}|null>(null),[staySheet,setStaySheet]=useState<{stay?:Stay}|null>(null),[viewer,setViewer]=useState<{place:Place;index:number}|null>(null);
 const closeViewer=useCallback(()=>setViewer(null),[]);
 // Only requests made while this trip is open count (the Plan remounts when switching trips).
 const seenIntent=useRef(intent?.n);
 useEffect(()=>{if(!intent||intent.n===seenIntent.current)return;seenIntent.current=intent.n;if(intent.sheet==='event')setSheet({});else if(intent.sheet==='leg')setLegSheet({});else setStaySheet({});},[intent?.n]);
 const allEvents=[...trip.events].filter(e=>e.kind!=='restaurant').sort((a,b)=>a.date.localeCompare(b.date)||ORDER.indexOf(a.kind)-ORDER.indexOf(b.kind));
 const spent=(id:string)=>trip.expenses.filter(x=>x.status==='posted').flatMap(x=>x.lines.flatMap(l=>l.splits.filter(s=>s.eventId===id).map(s=>s.amount))).reduce((a,b)=>a+b,0);
 const addItem=(text:string,eventId:string|null)=>save('shopping',{id:uid(),text,eventId,buyerId:null,done:false,version:0});

 return <>
  <TripOverview trip={trip} day={day} onDay={setDay}/>
  <div className="day-strip" role="tablist" aria-label="Trip days">{days.map(d=><button key={d} role="tab" aria-selected={day===d} onClick={()=>setDay(d)} className={day===d?'selected':''}><span>{new Date(`${d}T12:00:00`).toLocaleDateString('en-GB',{weekday:'short'})}</span><strong>{d.slice(-2)}</strong>{(trip.events.some(e=>e.date===d)||(trip.legs??[]).some(l=>l.departDate===d))&&<i className="day-dot" aria-hidden="true"/>}</button>)}</div>
  <div className="two-column plan-grid">
   <section className="card" aria-label={`Plans for ${fmt(day)}`}>
    <div className="card-head"><div><span className="eyebrow">{fmt(day)}</span><h2>The day</h2></div></div>
    {staying.map(s=><StayCard key={s.id} trip={trip} stay={s} mode="staying" day={day} onEdit={()=>setStaySheet({stay:s})} onPhoto={index=>setViewer({place:stayPlace(s),index})} photos={photos}/>)}
    <div className="timeline">
     {entries.map(x=><div className={`tl-item ${x.kind}`} key={x.key}>
      <time className="tl-time" dateTime={x.time||undefined}>{fmtTime(x.time)}</time>
      <span className="tl-dot" aria-hidden="true">{x.kind==='event'?(x.event!.kind==='activity'?<Sun size={13}/>:x.event!.kind==='restaurant'?<Wine size={13}/>:<UtensilsCrossed size={13}/>):x.kind==='leg'||x.kind==='arrive'?<TransportIcon kind={(trip.transport??[]).find(t=>t.id===x.leg!.transportId)?.kind??'other'} size={13}/>:<BedDouble size={13}/>}</span>
      {x.kind==='event'?(()=>{const e=x.event!;const items=trip.shopping.filter(s=>s.eventId===e.id).sort((a,b)=>Number(a.done)-Number(b.done));const cost=spent(e.id);return <article className="event-card tl-card" aria-label={e.title}>
       <div className="event-head">{photosOf(trip,e.id).length>0&&<StayCover trip={trip} place={eventPlace(e)} compact onOpen={index=>setViewer({place:eventPlace(e),index})}/>}<div><span className="event-type">{e.kind}</span><h3>{e.title}</h3><p>{joiningLabel(e,trip)}{e.owner?` · ${e.owner} organizes`:''}{cost?` · ${euro(cost)} spent`:''}</p>{e.address&&<a className="map-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.address)}`} target="_blank" rel="noreferrer"><MapPin size={14}/> {e.address}</a>}{e.recipeUrl&&<a className="map-link" href={e.recipeUrl} target="_blank" rel="noreferrer"><BookOpen size={14}/> Recipe · {(()=>{try{return new URL(e.recipeUrl).hostname.replace(/^www\./,'');}catch{return 'link';}})()}</a>}{e.notes&&<p className="event-notes">{e.notes}</p>}</div>
        <button type="button" className="icon-button subtle" aria-label={`Edit ${e.title}`} onClick={()=>setSheet({event:e})}><Pencil size={16}/></button></div>
       {e.kind==='restaurant'?<div className="event-bill">{cost?<p>The bill: <strong>{euro(cost)}</strong></p>:<p className="helper">No bill yet.</p>}<Button kind="secondary" disabled={!e.participants.length} onClick={()=>onAddBill?.(e.id)}><ReceiptText size={16}/> {cost?'Add another bill':'Add the bill'}</Button>{!e.participants.length&&<p className="helper">Choose who is joining first.</p>}</div>
       :<MealShopping trip={trip} title={e.title} items={items} myFamily={myFamily} save={save} onEdit={setItemSheet} addField={<QuickAdd label={`Add to shopping for ${e.title}`} placeholder="Add an ingredient…" busy={busy} onAdd={text=>addItem(text,e.id)}/>}/>}
      </article>;})()
      :x.kind==='guest-in'||x.kind==='guest-out'?<GuestCard trip={trip} entry={x} onEdit={()=>setStaySheet({stay:x.stay})}/>
      :x.leg?<LegCard trip={trip} leg={x.leg} arriving={x.kind==='arrive'} onEdit={()=>setLegSheet({leg:x.leg})}/>
      :<StayCard trip={trip} stay={x.stay!} mode={x.kind as 'checkin'|'checkout'} day={day} onEdit={()=>setStaySheet({stay:x.stay})} onPhoto={index=>setViewer({place:stayPlace(x.stay!),index})} photos={photos}/>}
     </div>)}
    </div>
    {!entries.length&&!staying.length&&<Empty icon={<CalendarDays/>} heading="Nothing planned" body="Add a meal, an activity, the travel or where you sleep."/>}
    <div className="add-row"><Button onClick={()=>setSheet({})}><Plus size={17}/> Plan a meal or activity</Button><Button kind="secondary" onClick={()=>setLegSheet({})}><Plus size={17}/> Add travel</Button><Button kind="secondary" onClick={()=>setStaySheet({})}><Plus size={17}/> Add stay</Button></div>
   </section>
   <ShoppingSummary trip={trip} myFamily={myFamily??null} onOpen={()=>onOpenShopping?.()}/>
  </div>
  {legSheet&&<LegSheet key={legSheet.leg?.id??'new-leg'} trip={trip} leg={legSheet.leg} day={day} save={save} remove={remove} busy={busy} onClose={()=>setLegSheet(null)}/>}
  {staySheet&&<StaySheet key={staySheet.stay?.id??'new-stay'} trip={trip} stay={staySheet.stay} day={day} save={save} remove={remove} busy={busy} who={who} photos={photos} onPhoto={index=>staySheet.stay&&setViewer({place:stayPlace(staySheet.stay),index})} onClose={()=>setStaySheet(null)}/>}
  {viewer&&<PhotoViewer key={`${viewer.place.id}-${viewer.index}`} trip={trip} place={viewer.place} start={viewer.index} actions={photos} onClose={closeViewer}/>}
  {sheet&&<EventSheet trip={trip} event={sheet.event} day={day} save={save} remove={remove} busy={busy} photos={photos} onPhoto={index=>sheet.event&&setViewer({place:eventPlace(sheet.event),index})} onClose={()=>setSheet(null)}/>}
  {itemSheet&&<ShoppingSheet key={itemSheet.id} trip={trip} item={trip.shopping.find(s=>s.id===itemSheet.id)??itemSheet} save={save} remove={remove} busy={busy} onClose={()=>setItemSheet(null)}/>}
 </>;
}
