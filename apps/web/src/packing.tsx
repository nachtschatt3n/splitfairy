import {useRef,useState,type FormEvent} from 'react';
import {ArrowRight,Bus,Car,Eye,Lock,Luggage,Package,Pencil,Plane,Plus,TrainFront,Trash2,Users} from 'lucide-react';
import type {Gear,Transport,Trip,User} from '../../../packages/domain/src/model.js';
import {Button,Empty,Sheet,uid,type Remove,type Save} from './common.js';
import {useSettled,useTick,withDone} from './tick.js';

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
   {transport&&<Button kind="delete" disabled={busy} onClick={async()=>{if(loads&&!window.confirm(`${loads} item${loads===1?'':'s'} travel in ${transport.name}. Remove it anyway? The items stay on the list.`))return;await remove('transport',transport);onClose();}}>Remove</Button>}
  </form>
 </Sheet>;
}

function GearSheet({trip,item,myFamily,save,remove,busy,onClose}:{trip:Trip;item:Gear;myFamily:string|null;save:Save;remove:Remove;busy:boolean;onClose:()=>void}){
 const [text,setText]=useState(item.text),[quantity,setQuantity]=useState(String(item.quantity)),[familyId,setFamilyId]=useState(item.familyId??''),[route,setRoute]=useState<string[]>(routeOf(item)),[note,setNote]=useState(item.note),[packed,setPacked]=useState(item.packed);
 const [privateItem,setPrivateItem]=useState(item.visibility==='family');
 return <Sheet title="Packing item" eyebrow="Who brings what" onClose={onClose}>
  <form className="form-stack" onSubmit={async e=>{e.preventDefault();if(!text.trim())return;await save('gear',{...item,text:text.trim(),quantity:Math.min(99,Math.max(1,Math.round(Number(quantity))||1)),familyId:familyId||null,route,transportId:route[0]??null,note:note.trim(),packed,visibility:privateItem&&familyId&&familyId===myFamily?'family':'everyone'},item);onClose();}}>
   <label>Item<input value={text} onChange={e=>setText(e.target.value)} autoFocus required/></label>
   <div className="form-row"><label>How many<input type="number" min={1} max={99} inputMode="numeric" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
    <label>Who brings it<select value={familyId} onChange={e=>setFamilyId(e.target.value)}><option value="">Undecided</option>{trip.families.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label></div>
   <RouteEditor trip={trip} route={route} onChange={setRoute}/>
   <label>Note (optional)<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Borrow from the neighbours"/></label>
   {myFamily&&familyId===myFamily&&<label className="check-label"><input type="checkbox" checked={privateItem} onChange={e=>setPrivateItem(e.target.checked)}/> Only visible to {familyName(trip,myFamily)}</label>}
   <label className="check-label"><input type="checkbox" checked={packed} onChange={e=>setPacked(e.target.checked)}/> Packed</label>
   <Button type="submit" disabled={busy}>Save changes <ArrowRight size={17}/></Button>
   <Button kind="delete" disabled={busy} onClick={async()=>{await remove('gear',item);onClose();}}>Delete item</Button>
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


/** "2x towels", "towels x2" or "2 × towels": a quantity typed with the item. */
export function parseQuick(input:string){
 const t=input.trim();
 const lead=/^(\d{1,2})\s*[x×]\s*(.+)$/i.exec(t)??/^(\d{1,2})\s+(.+)$/.exec(t),trail=/^(.+?)\s*[x×]\s*(\d{1,2})$/i.exec(t);
 if(lead&&Number(lead[1])>=1)return {text:lead[2].trim(),quantity:Math.min(99,Number(lead[1]))};
 if(trail&&Number(trail[2])>=1)return {text:trail[1].trim(),quantity:Math.min(99,Number(trail[2]))};
 return {text:t,quantity:1};
}
type Defaults={who:string;only:boolean;via:string};
const defaultsKey=(tripId:string)=>`splitfairy-pack-${tripId}`;

/** One packing row: tick it, tap the name to rename in place, delete or open everything from there. */
function PackRow({trip,item,myFamily,groupBy,save,remove,onMore}:{trip:Trip;item:Gear;myFamily:string|null;groupBy:'family'|'transport';save:Save;remove:Remove;onMore:()=>void}){
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState('');
 const vehicles=routeOf(item).map(id=>(trip.transport??[]).find(t=>t.id===id)?.name).filter(Boolean).join(' → ');
 const meta=[groupBy==='transport'?familyName(trip,item.familyId)||'Nobody yet':'',vehicles,item.note].filter(Boolean).join(' · ');
 const t=useTick(item.id,item.packed,(_,packed)=>save('gear',{...item,packed},item,{quiet:true}));
 const commit=async()=>{const next=parseQuick(draft);setEditing(false);if(next.text&&(next.text!==item.text||next.quantity!==item.quantity))await save('gear',{...item,text:next.text,quantity:next.quantity},item);};
 if(editing)return <div className="pack-row editing">
  <input aria-label={`Rename ${item.text}`} value={draft} autoFocus onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void commit();}if(e.key==='Escape')setEditing(false);}} onBlur={e=>{if(!e.currentTarget.parentElement?.contains(e.relatedTarget as Node))void commit();}}/>
  {/* Pressing these must not blur the field first (Safari), or the rename would save and close before the tap lands. */}
  <button type="button" className="icon-button subtle" aria-label={`Delete ${item.text}`} onPointerDown={e=>e.preventDefault()} onClick={()=>{setEditing(false);void remove('gear',item);}}><Trash2 size={16}/></button>
  <button type="button" className="text-button" onPointerDown={e=>e.preventDefault()} onClick={()=>{setEditing(false);onMore();}}>More</button>
 </div>;
 return <div className={`pack-row${t.className}`}>
  <label className="pack-check"><input type="checkbox" aria-label={`Packed: ${item.text}`} checked={t.checked} onChange={t.toggle}/></label>
  <button type="button" className={t.checked?'pack-name done':'pack-name'} onClick={()=>{setDraft(`${item.quantity>1?`${item.quantity}x `:''}${item.text}`);setEditing(true);}} aria-label={`Rename ${item.text}`}>
   <span>{item.quantity>1?`${item.quantity} × `:''}{item.text}{item.visibility==='family'&&<Lock size={13} className="pack-lock" aria-label="Only your family sees this"/>}</span>
   {meta&&<small>{meta}</small>}
  </button>
  {!item.familyId&&myFamily&&<button type="button" className="text-button claim" onClick={()=>void save('gear',{...item,familyId:myFamily},item)}>We'll bring it</button>}
  <button type="button" className="icon-button subtle" aria-label={`Edit ${item.text}`} onClick={onMore}><Pencil size={15}/></button>
 </div>;
}

export function Packing({trip,user,save,remove,busy}:{trip:Trip;user:User|null|undefined;save:Save;remove:Remove;busy:boolean}){
 const settled=useSettled();
 const gear=trip.gear??[],transport=trip.transport??[];
 // The signed-in person's family, when their login is linked to a person on the trip.
 const myFamily=trip.people.find(p=>p.email&&p.email===user?.email)?.familyId??null;
 // The quick-add choices stick (per trip, on this device), so adding many items is just typing and Enter.
 const [defaults,setDefaults]=useState<Defaults>(()=>{try{const saved=JSON.parse(localStorage.getItem(defaultsKey(trip.id))??'null');if(saved)return saved;}catch{/* ignore */}return {who:myFamily??'',only:false,via:''};});
 const choose=(patch:Partial<Defaults>)=>setDefaults(d=>{const next={...d,...patch};try{localStorage.setItem(defaultsKey(trip.id),JSON.stringify(next));}catch{/* private mode */}return next;});
 const who=trip.families.some(f=>f.id===defaults.who)?defaults.who:'',via=transport.some(t=>t.id===defaults.via)?defaults.via:'';
 const canBePrivate=!!myFamily&&who===myFamily,only=defaults.only&&canBePrivate;
 const [text,setText]=useState(''),[filter,setFilter]=useState('all'),[groupBy,setGroupBy]=useState<'family'|'transport'>('family');
 const [editing,setEditing]=useState<Gear|null>(null),[transportSheet,setTransportSheet]=useState<{transport?:Transport}|null>(null);
 const input=useRef<HTMLInputElement>(null);
 // Clear first: typing the next item while this one saves must not be wiped. Focus stays for the next one.
 const add=async(e:FormEvent)=>{e.preventDefault();const {text:value,quantity}=parseQuick(text);if(!value)return;setText('');input.current?.focus();
  await save('gear',{id:uid(),text:value,quantity,familyId:who||null,route:via?[via]:[],transportId:via||null,note:'',packed:false,visibility:only?'family':'everyone',version:0});};
 const inGroup=(i:Gear,id:string|null)=>groupBy==='family'?(i.familyId??null)===id:id===null?!routeOf(i).length:routeOf(i).includes(id);
 const buckets=groupBy==='family'?[...trip.families.map(f=>({id:f.id as string|null,name:f.name,kind:undefined as Transport['kind']|undefined})),{id:null,name:'Not decided yet',kind:undefined}]
  :[...transport.map(t=>({id:t.id as string|null,name:t.name,kind:t.kind as Transport['kind']|undefined})),{id:null,name:'No transport yet',kind:undefined}];
 const groups=buckets.map(g=>({...g,items:gear.filter(i=>inGroup(i,g.id)).sort((a,b)=>a.text.localeCompare(b.text))}))
  .filter(g=>g.items.length&&(filter==='all'||(filter===NONE?g.id===null:g.id===filter)));
 const options=[['all','Everything'],...buckets.filter(b=>b.id&&gear.some(i=>inGroup(i,b.id))).map(b=>[b.id!,b.name]),...(gear.some(i=>inGroup(i,null))?[[NONE,buckets.at(-1)!.name]]:[])];
 const packed=gear.filter(i=>i.packed).length;
 return <>
  <section className="card packing" aria-label="Packing list">
   <div className="pack-head"><div><h2 className="sr-only">Packing & equipment</h2>{gear.length>0&&<small>{packed} of {gear.length} packed{gear.some(i=>!i.familyId)?` · ${gear.filter(i=>!i.familyId).length} not decided`:''}</small>}</div>
    {gear.length>0&&<div className="progress" role="img" aria-label={`${packed} of ${gear.length} packed`}><div style={{width:`${Math.round(packed/gear.length*100)}%`}}/></div>}</div>
   <div className="transport-strip" aria-label="How things travel">
    <div className="transport-list">
     {transport.map(t=>{const count=gear.filter(i=>routeOf(i).includes(t.id)).length;return <button key={t.id} type="button" className="transport-chip" onClick={()=>setTransportSheet({transport:t})} aria-label={`Edit ${t.name}`}><TransportIcon kind={t.kind}/><span>{t.name}</span><small>{count}</small></button>;})}
     <button type="button" className="transport-chip add" onClick={()=>setTransportSheet({})}><Plus size={16}/><span>Add car or flight</span></button>
    </div>
   </div>
   <form className="quick-add" onSubmit={add}>
    <div className="qa-main"><input ref={input} aria-label="Add something to bring" value={text} onChange={e=>setText(e.target.value)} placeholder="Add an item, e.g. 2x beach towels" enterKeyHint="done"/>
     <button type="submit" className="qa-submit" aria-label="Add item" disabled={!text.trim()}><Plus size={20}/></button></div>
    <div className="qa-options">
     <label className="qa-pill"><Users size={14} aria-hidden="true"/><span className="sr-only">Who brings it</span><select aria-label="Who brings it" value={who} onChange={e=>choose({who:e.target.value})}><option value="">Nobody yet</option>{trip.families.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
     {canBePrivate&&<button type="button" className={only?'qa-pill on':'qa-pill'} aria-pressed={only} onClick={()=>choose({only:!defaults.only})}>{only?<Lock size={14}/>:<Eye size={14}/>} {only?'Only us':'Everyone'}</button>}
     {transport.length>0&&<label className="qa-pill"><Luggage size={14} aria-hidden="true"/><select aria-label="Travels in (optional)" value={via} onChange={e=>choose({via:e.target.value})}><option value="">No vehicle</option>{transport.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
    </div>
   </form>
   {gear.length>0&&<div className="pack-controls">
    <div className="segmented" role="group" aria-label="Group by">{([['family','By family'],['transport','By transport']] as const).map(([k,l])=><button key={k} type="button" className={groupBy===k?'on':''} aria-pressed={groupBy===k} onClick={()=>{setGroupBy(k);setFilter('all');}}>{l}</button>)}</div>
    {options.length>2&&<label className="qa-pill"><span className="sr-only">Show</span><select aria-label="Show" value={filter} onChange={e=>setFilter(e.target.value)}>{options.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}
   </div>}
   {groups.map(g=><div className="shop-group" key={g.id??'none'}>
    <h3>{g.kind&&<TransportIcon kind={g.kind} size={14}/>} {g.name} <small>{g.items.filter(i=>i.packed).length}/{g.items.length}</small></h3>
    {withDone(g.items,i=>settled(i.id,i.packed),'Packed',i=><PackRow key={i.id} trip={trip} item={i} myFamily={myFamily} groupBy={groupBy} save={save} remove={remove} onMore={()=>setEditing(i)}/>)}
   </div>)}
   {!gear.length&&<Empty icon={<Luggage/>} heading="Nothing to pack yet" body="Type an item above and press Enter; keep typing to add the next. Shared things like the grill or travel cot, or your own list, visible only to your family."/>}
  </section>
  {editing&&<GearSheet key={editing.id} trip={trip} item={gear.find(i=>i.id===editing.id)??editing} myFamily={myFamily} save={save} remove={remove} busy={busy} onClose={()=>setEditing(null)}/>}
  {transportSheet&&<TransportSheet key={transportSheet.transport?.id??'new'} trip={trip} transport={transportSheet.transport} save={save} remove={remove} busy={busy} onClose={()=>setTransportSheet(null)}/>}
 </>;
}
