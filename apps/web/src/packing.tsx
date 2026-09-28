import {useState,type FormEvent} from 'react';
import {ArrowRight,Luggage,Pencil,Plus} from 'lucide-react';
import type {Gear,Trip,User} from '../../../packages/domain/src/model.js';
import {Button,Empty,Sheet,uid,type Remove,type Save} from './common.js';

const UNASSIGNED='__none';

function GearSheet({trip,item,save,remove,busy,onClose}:{trip:Trip;item:Gear;save:Save;remove:Remove;busy:boolean;onClose:()=>void}){
 const [text,setText]=useState(item.text),[quantity,setQuantity]=useState(String(item.quantity)),[familyId,setFamilyId]=useState(item.familyId??''),[note,setNote]=useState(item.note),[packed,setPacked]=useState(item.packed);
 return <Sheet title="Packing item" eyebrow="Who brings what" onClose={onClose}>
  <form className="form-stack" onSubmit={async e=>{e.preventDefault();if(!text.trim())return;await save('gear',{...item,text:text.trim(),quantity:Math.min(99,Math.max(1,Math.round(Number(quantity))||1)),familyId:familyId||null,note:note.trim(),packed},item);onClose();}}>
   <label>Item<input value={text} onChange={e=>setText(e.target.value)} autoFocus required/></label>
   <div className="form-row"><label>How many<input type="number" min={1} max={99} inputMode="numeric" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
    <label>Who brings it<select value={familyId} onChange={e=>setFamilyId(e.target.value)}><option value="">Not decided yet</option>{trip.families.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label></div>
   <label>Note (optional)<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Borrow from the neighbours"/></label>
   <label className="check-label"><input type="checkbox" checked={packed} onChange={e=>setPacked(e.target.checked)}/> Packed</label>
   <Button type="submit" disabled={busy}>Save changes <ArrowRight size={17}/></Button>
   <Button kind="ghost" disabled={busy} onClick={async()=>{await remove('gear',item);onClose();}}>Delete item</Button>
  </form>
 </Sheet>;
}

export function Packing({trip,user,save,remove,busy}:{trip:Trip;user:User|null|undefined;save:Save;remove:Remove;busy:boolean}){
 const gear=trip.gear??[];
 // The signed-in person's family, when their login is linked to a person on the trip.
 const myFamily=trip.people.find(p=>p.email&&p.email===user?.email)?.familyId??null;
 const [text,setText]=useState(''),[who,setWho]=useState<string>(myFamily??''),[filter,setFilter]=useState('all'),[editing,setEditing]=useState<Gear|null>(null);
 // Clear first: typing the next item while this one saves must not be wiped.
 const add=async(e:FormEvent)=>{e.preventDefault();const value=text.trim();if(!value)return;setText('');await save('gear',{id:uid(),text:value,familyId:who||null,quantity:1,note:'',packed:false,version:0});};
 const groups=[...trip.families.map(f=>({id:f.id as string|null,name:f.name})),{id:null,name:'Not decided yet'}]
  .map(g=>({...g,items:gear.filter(i=>i.familyId===g.id).sort((a,b)=>Number(a.packed)-Number(b.packed)||a.text.localeCompare(b.text))}))
  .filter(g=>g.items.length&&(filter==='all'||(filter===UNASSIGNED?g.id===null:g.id===filter)));
 const packed=gear.filter(i=>i.packed).length;
 return <>
  <section className="card" aria-label="Packing list">
   <div className="card-head"><div><span className="eyebrow">Who brings what</span><h2>Packing & equipment</h2></div><Luggage size={23} aria-hidden="true"/></div>
   {gear.length>0&&<div className="progress" role="img" aria-label={`${packed} of ${gear.length} packed`}><div style={{width:`${Math.round(packed/gear.length*100)}%`}}/></div>}
   {gear.length>0&&<p className="helper">{packed} of {gear.length} packed{gear.some(i=>!i.familyId)?` · ${gear.filter(i=>!i.familyId).length} not decided yet`:''}</p>}
   <form className="shop-add" onSubmit={add}>
    <label>Add something to bring<input value={text} onChange={e=>setText(e.target.value)} placeholder="Beach umbrella, travel cot, grill…"/></label>
    <label>Who brings it<select value={who} onChange={e=>setWho(e.target.value)}><option value="">Not decided yet</option>{trip.families.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
    <Button type="submit" kind="secondary" disabled={!text.trim()}><Plus size={16}/> Add item</Button>
   </form>
   {gear.length>0&&<div className="filter-chips" role="group" aria-label="Show">
    {[['all','Everything'],...trip.families.filter(f=>gear.some(i=>i.familyId===f.id)).map(f=>[f.id,f.name]),...(gear.some(i=>!i.familyId)?[[UNASSIGNED,'Not decided yet']]:[])].map(([id,label])=>
     <button key={id} type="button" className={filter===id?'chip checked':'chip'} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}
   </div>}
   {groups.map(g=><div className="shop-group" key={g.id??'none'}>
    <h3>{g.name} <small>{g.items.filter(i=>i.packed).length}/{g.items.length}</small></h3>
    {g.items.map(i=><div className="shop-row" key={i.id}>
     <label className="shop-check"><input type="checkbox" checked={i.packed} onChange={()=>void save('gear',{...i,packed:!i.packed},i)}/><span className={i.packed?'done':''}>{i.quantity>1?`${i.quantity} × `:''}{i.text}{i.note&&<small className="gear-note">{i.note}</small>}</span></label>
     {!i.familyId&&myFamily&&<button type="button" className="text-button claim" onClick={()=>void save('gear',{...i,familyId:myFamily},i)}>We'll bring it</button>}
     <button type="button" className="icon-button subtle" aria-label={`Edit ${i.text}`} onClick={()=>setEditing(i)}><Pencil size={16}/></button>
    </div>)}
   </div>)}
   {!gear.length&&<Empty icon={<Luggage/>} heading="Nothing to pack yet" body="List the shared things: grill, beach tent, travel cot, board games. Then decide which family brings each one."/>}
  </section>
  {editing&&<GearSheet key={editing.id} trip={trip} item={gear.find(i=>i.id===editing.id)??editing} save={save} remove={remove} busy={busy} onClose={()=>setEditing(null)}/>}
 </>;
}

