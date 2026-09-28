import {useState,type FormEvent} from 'react';
import {ArrowRight,Bus,Car,Luggage,Package,Pencil,Plane,Plus,TrainFront} from 'lucide-react';
import type {Gear,Transport,Trip,User} from '../../../packages/domain/src/model.js';
import {Button,Empty,Sheet,uid,type Remove,type Save} from './common.js';

const NONE='__none';
const KINDS:[Transport['kind'],string][]=[['car','Car'],['plane','Plane'],['train','Train'],['bus','Bus'],['other','Other']];
const KIND_ICON={car:Car,plane:Plane,train:TrainFront,bus:Bus,other:Package};
export function TransportIcon({kind,size=16}:{kind:Transport['kind'];size?:number}){const Icon=KIND_ICON[kind]??Package;return <Icon size={size} aria-hidden="true"/>;}
export const routeOf=(g:Gear)=>g.route?.length?g.route:g.transportId?[g.transportId]:[];
const familyName=(trip:Trip,id:string|null)=>id?trip.families.find(f=>f.id===id)?.name??'':'';

function TransportSheet({trip,transport,save,remove,busy,onClose}:{trip:Trip;transport?:Transport;save:Save;remove:Remove;busy:boolean;onClose:()=>void}){
 const [kind,setKind]=useState<Transport['kind']>(transport?.kind??'car'),[familyId,setFamilyId]=useState(transport?.familyId??''),[note,setNote]=useState(transport?.note??'');
 // Suggest "Uhl car" / "Weber plane" until the name is typed by hand.
 const suggest=(k:Transport['kind'],f:string)=>[familyName(trip,f||null),KINDS.find(([v])=>v===k)![1].toLowerCase()].filter(Boolean).join(' ').replace(/^./,c=>c.toUpperCase());
 const [name,setName]=useState(transport?.name??suggest('car',''));const [typed,setTyped]=useState(!!transport);
 const update=(k:Transport['kind'],f:string)=>{setKind(k);setFamilyId(f);if(!typed)setName(suggest(k,f));};
 const loads=transport?(trip.gear??[]).filter(i=>i.transportId===transport.id).length:0;
 return <Sheet title={transport?`Edit ${transport.name}`:'Add a car or flight'} eyebrow="How things travel" onClose={onClose}>
  <form className="form-stack" onSubmit={async e=>{e.preventDefault();if(!name.trim())return;await save('transport',{id:transport?.id??uid(),name:name.trim(),kind,familyId:familyId||null,note:note.trim(),version:transport?.version??0},transport);onClose();}}>
   <div className="form-row"><label>Type<select value={kind} onChange={e=>update(e.target.value as Transport['kind'],familyId)}>{KINDS.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
    <label>Whose (optional)<select value={familyId} onChange={e=>update(kind,e.target.value)}><option value="">Shared</option>{trip.families.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label></div>
   <label>Name<input value={name} onChange={e=>{setName(e.target.value);setTyped(true);}} placeholder="Uhl car" required/></label>
   <label>Note (optional)<input value={note} onChange={e=>setNote(e.target.value)} placeholder={kind==='plane'?'2 checked bags, 23 kg each':'Roof box, 5 seats'}/></label>
   <Button type="submit" disabled={busy}>{transport?'Save changes':'Add'} <ArrowRight size={17}/></Button>
   {transport&&<Button kind="ghost" disabled={busy} onClick={async()=>{if(loads&&!window.confirm(`${loads} item${loads===1?'':'s'} travel in ${transport.name}. Remove it anyway? The items stay on the list.`))return;await remove('transport',transport);onClose();}}>Remove</Button>}
  </form>
 </Sheet>;
}

function GearSheet({trip,item,save,remove,busy,onClose}:{trip:Trip;item:Gear;save:Save;remove:Remove;busy:boolean;onClose:()=>void}){
 const [text,setText]=useState(item.text),[quantity,setQuantity]=useState(String(item.quantity)),[familyId,setFamilyId]=useState(item.familyId??''),[route,setRoute]=useState<string[]>(routeOf(item)),[note,setNote]=useState(item.note),[packed,setPacked]=useState(item.packed);
 return <Sheet title="Packing item" eyebrow="Who brings what" onClose={onClose}>
  <form className="form-stack" onSubmit={async e=>{e.preventDefault();if(!text.trim())return;await save('gear',{...item,text:text.trim(),quantity:Math.min(99,Math.max(1,Math.round(Number(quantity))||1)),familyId:familyId||null,route,transportId:route[0]??null,note:note.trim(),packed},item);onClose();}}>
   <label>Item<input value={text} onChange={e=>setText(e.target.value)} autoFocus required/></label>
   <div className="form-row"><label>How many<input type="number" min={1} max={99} inputMode="numeric" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
    <label>Who brings it<select value={familyId} onChange={e=>setFamilyId(e.target.value)}><option value="">Undecided</option>{trip.families.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label></div>
   <RouteEditor trip={trip} route={route} onChange={setRoute}/>
   <label>Note (optional)<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Borrow from the neighbours"/></label>
   <label className="check-label"><input type="checkbox" checked={packed} onChange={e=>setPacked(e.target.checked)}/> Packed</label>
   <Button type="submit" disabled={busy}>Save changes <ArrowRight size={17}/></Button>
   <Button kind="ghost" disabled={busy} onClick={async()=>{await remove('gear',item);onClose();}}>Delete item</Button>
  </form>
 </Sheet>;
}

/** An ordered list of cars and flights an item travels in, for example the Uhl plane, then the Moncrief car. */
function RouteEditor({trip,route,onChange}:{trip:Trip;route:string[];onChange:(r:string[])=>void}){
 const transport=trip.transport??[];
 if(!transport.length)return null;
 const free=transport.filter(t=>!route.includes(t.id));
 return <fieldset className="route-editor"><legend>Travels in (optional)</legend>
  {route.map((id,i)=><div className="route-leg" key={`${id}-${i}`}>
   <span className="route-step" aria-hidden="true">{i+1}</span>
   <select aria-label={`Vehicle ${i+1}`} value={id} onChange={e=>onChange(route.map((x,n)=>n===i?e.target.value:x))}>{transport.filter(t=>t.id===id||!route.includes(t.id)).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
   <button type="button" className="icon-button subtle" aria-label={`Remove vehicle ${i+1}`} onClick={()=>onChange(route.filter((_,n)=>n!==i))}>×</button>
  </div>)}
  {free.length>0&&<button type="button" className="text-button" onClick={()=>onChange([...route,free[0].id])}>{route.length?'Add another vehicle':'Add a car or flight'}</button>}
  {route.length>1&&<p className="helper">In this order, for example first the plane, then the car from the airport.</p>}
 </fieldset>;
}

function TransportSelect({trip,value,onChange}:{trip:Trip;value:string;onChange:(v:string)=>void}){
 const transport=trip.transport??[];
 if(!transport.length)return null;
 return <label>Travels in (optional)<select value={value} onChange={e=>onChange(e.target.value)}><option value="">Undecided</option>{transport.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>;
}

export function Packing({trip,user,save,remove,busy}:{trip:Trip;user:User|null|undefined;save:Save;remove:Remove;busy:boolean}){
 const gear=trip.gear??[],transport=trip.transport??[];
 // The signed-in person's family, when their login is linked to a person on the trip.
 const myFamily=trip.people.find(p=>p.email&&p.email===user?.email)?.familyId??null;
 const [text,setText]=useState(''),[who,setWho]=useState<string>(myFamily??''),[via,setVia]=useState(''),[filter,setFilter]=useState('all'),[groupBy,setGroupBy]=useState<'family'|'transport'>('family');
 const [editing,setEditing]=useState<Gear|null>(null),[transportSheet,setTransportSheet]=useState<{transport?:Transport}|null>(null);
 // Clear first: typing the next item while this one saves must not be wiped.
 const add=async(e:FormEvent)=>{e.preventDefault();const value=text.trim();if(!value)return;setText('');await save('gear',{id:uid(),text:value,familyId:who||null,route:via?[via]:[],transportId:via||null,quantity:1,note:'',packed:false,version:0});};
 const inGroup=(i:Gear,id:string|null)=>groupBy==='family'?(i.familyId??null)===id:id===null?!routeOf(i).length:routeOf(i).includes(id);
 const buckets=groupBy==='family'?[...trip.families.map(f=>({id:f.id as string|null,name:f.name,kind:undefined as Transport['kind']|undefined})),{id:null,name:'Not decided yet',kind:undefined}]
  :[...transport.map(t=>({id:t.id as string|null,name:t.name,kind:t.kind as Transport['kind']|undefined})),{id:null,name:'No transport yet',kind:undefined}];
 const groups=buckets.map(g=>({...g,items:gear.filter(i=>inGroup(i,g.id)).sort((a,b)=>Number(a.packed)-Number(b.packed)||a.text.localeCompare(b.text))}))
  .filter(g=>g.items.length&&(filter==='all'||(filter===NONE?g.id===null:g.id===filter)));
 const chips=[['all','Everything'],...buckets.filter(b=>b.id&&gear.some(i=>inGroup(i,b.id))).map(b=>[b.id!,b.name]),...(gear.some(i=>inGroup(i,null))?[[NONE,buckets.at(-1)!.name]]:[])];
 const packed=gear.filter(i=>i.packed).length;
 const transportName=(id?:string|null)=>transport.find(t=>t.id===id);
 return <>
  <section className="card" aria-label="Packing list">
   <div className="card-head"><div><span className="eyebrow">Who brings what</span><h2>Packing & equipment</h2></div><Luggage size={23} aria-hidden="true"/></div>
   {gear.length>0&&<div className="progress" role="img" aria-label={`${packed} of ${gear.length} packed`}><div style={{width:`${Math.round(packed/gear.length*100)}%`}}/></div>}
   {gear.length>0&&<p className="helper">{packed} of {gear.length} packed{gear.some(i=>!i.familyId)?` · ${gear.filter(i=>!i.familyId).length} not decided yet`:''}</p>}
   <div className="transport-strip" aria-label="How things travel">
    <span className="eyebrow">How things travel</span>
    <div className="transport-list">
     {transport.map(t=>{const count=gear.filter(i=>routeOf(i).includes(t.id)).length;return <button key={t.id} type="button" className="transport-chip" onClick={()=>setTransportSheet({transport:t})} aria-label={`Edit ${t.name}`}><TransportIcon kind={t.kind}/><span>{t.name}</span><small>{count}</small></button>;})}
     <button type="button" className="transport-chip add" onClick={()=>setTransportSheet({})}><Plus size={16}/><span>Add car or flight</span></button>
    </div>
   </div>
   <form className="shop-add" onSubmit={add}>
    <label>Add something to bring<input value={text} onChange={e=>setText(e.target.value)} placeholder="Beach umbrella, travel cot, grill…"/></label>
    <div className="form-row"><label>Who brings it<select value={who} onChange={e=>setWho(e.target.value)}><option value="">Undecided</option>{trip.families.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
     {transport.length>0&&<TransportSelect trip={trip} value={via} onChange={setVia}/>}</div>
    <Button type="submit" kind="secondary" disabled={!text.trim()}><Plus size={16}/> Add item</Button>
   </form>
   {gear.length>0&&<div className="group-toggle" role="group" aria-label="Group by">
    {([['family','By family'],['transport','By transport']] as const).map(([k,l])=><button key={k} type="button" className={groupBy===k?'chip checked':'chip'} aria-pressed={groupBy===k} onClick={()=>{setGroupBy(k);setFilter('all');}}>{l}</button>)}
   </div>}
   {gear.length>0&&<div className="filter-chips" role="group" aria-label="Show">
    {chips.map(([id,label])=><button key={id} type="button" className={filter===id?'chip checked':'chip'} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}
   </div>}
   {groups.map(g=><div className="shop-group" key={g.id??'none'}>
    <h3>{g.kind&&<TransportIcon kind={g.kind} size={14}/>} {g.name} <small>{g.items.filter(i=>i.packed).length}/{g.items.length}</small></h3>
    {g.items.map(i=>{return <div className="shop-row" key={i.id}>
     <label className="shop-check"><input type="checkbox" checked={i.packed} onChange={()=>void save('gear',{...i,packed:!i.packed},i)}/><span className={i.packed?'done':''}>{i.quantity>1?`${i.quantity} × `:''}{i.text}
      <small className="gear-note">{[groupBy==='transport'?familyName(trip,i.familyId)||'Nobody yet':'',routeOf(i).map(id=>transportName(id)?.name).filter(Boolean).join(' → '),i.note].filter(Boolean).join(' · ')}</small></span></label>
     {!i.familyId&&myFamily&&<button type="button" className="text-button claim" onClick={()=>void save('gear',{...i,familyId:myFamily},i)}>We'll bring it</button>}
     <button type="button" className="icon-button subtle" aria-label={`Edit ${i.text}`} onClick={()=>setEditing(i)}><Pencil size={16}/></button>
    </div>;})}
   </div>)}
   {!gear.length&&<Empty icon={<Luggage/>} heading="Nothing to pack yet" body="List the shared things: grill, beach tent, travel cot, board games. Then decide which family brings each one and in which car or flight it travels."/>}
  </section>
  {editing&&<GearSheet key={editing.id} trip={trip} item={gear.find(i=>i.id===editing.id)??editing} save={save} remove={remove} busy={busy} onClose={()=>setEditing(null)}/>}
  {transportSheet&&<TransportSheet key={transportSheet.transport?.id??'new'} trip={trip} transport={transportSheet.transport} save={save} remove={remove} busy={busy} onClose={()=>setTransportSheet(null)}/>}
 </>;
}
