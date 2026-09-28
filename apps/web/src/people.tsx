import {useState,type FormEvent} from 'react';
import {ArrowRight,Mail,Pencil,Plus,UserRound,Users} from 'lucide-react';
import type {Command,Family,Member,Person,Trip,TripView,User} from '../../../packages/domain/src/model.js';
import {Button,Empty,Sheet,WEIGHTS,fmt,uid,weightLabel,type Remove,type Save} from './common.js';
import {localDb,pendingFor} from './offline.js';
import {useEffect} from 'react';

const NEW_FAMILY='__new',ON_OWN='__solo';
type PersonDraft={person?:Person;familyId:string};

function AccountBadge({person,members}:{person:Person;members:Member[]}){
 if(!person.email)return <span className="badge muted">No account</span>;
 const member=members.find(m=>m.email===person.email);
 return member?.joined?<span className="badge ok">Signed in</span>:<span className="badge">Invited</span>;
}

function PersonRow({person,members,canEdit,onEdit}:{person:Person;members:Member[];canEdit:boolean;onEdit:()=>void}){
 const body=<><span className="person-name"><strong>{person.name}</strong><small>{weightLabel(person.weight)}{person.email?` · ${person.email}`:''}</small></span><AccountBadge person={person} members={members}/>{canEdit&&<Pencil size={16} aria-hidden="true"/>}</>;
 return canEdit?<button type="button" className="person-row" onClick={onEdit} aria-label={`Edit ${person.name}`}>{body}</button>:<div className="person-row">{body}</div>;
}

function PersonSheet({trip,draft,save,remove,busy,onClose}:{trip:Trip;draft:PersonDraft;save:Save;remove:Remove;busy:boolean;onClose:()=>void}){
 const editing=draft.person,oldFamily=trip.families.find(f=>f.id===editing?.familyId);
 const [name,setName]=useState(editing?.name??''),[weight,setWeight]=useState(String(editing?.weight??1)),[email,setEmail]=useState(editing?.email??'');
 const [target,setTarget]=useState(oldFamily?.solo?ON_OWN:draft.familyId||(trip.families.some(f=>!f.solo)?trip.families.find(f=>!f.solo)!.id:NEW_FAMILY));
 const [familyName,setFamilyName]=useState(''),[error,setError]=useState('');
 const groups=trip.families.filter(f=>!f.solo);
 const submit=async(e:FormEvent)=>{
  e.preventDefault();setError('');
  const clean=name.trim();if(!clean){setError('Give the person a name.');return;}
  let familyId=target;
  // Commands replay in order, so the new wallet exists before the person who joins it.
  if(target===NEW_FAMILY){if(!familyName.trim()){setError('Name the new family.');return;}familyId=uid();await save('family',{id:familyId,name:familyName.trim(),solo:false,version:0});}
  else if(target===ON_OWN){
   if(oldFamily?.solo){familyId=oldFamily.id;if(oldFamily.name!==clean)await save('family',{...oldFamily,name:clean},oldFamily);}
   else{familyId=uid();await save('family',{id:familyId,name:clean,solo:true,version:0});}
  }
  await save('person',{id:editing?.id??uid(),name:clean,familyId,weight:Number(weight),email:email.trim(),version:editing?.version??0},editing);
  // Someone who leaves their own wallet does not leave an empty one behind.
  if(oldFamily?.solo&&familyId!==oldFamily.id)await remove('family',oldFamily);
  onClose();
 };
 const del=async()=>{
  if(!editing||!window.confirm(`Remove ${editing.name} from the trip?`))return;
  await remove('person',editing);if(oldFamily?.solo)await remove('family',oldFamily);onClose();
 };
 const weightOptions=WEIGHTS.some(([v])=>v===weight)?WEIGHTS:[...WEIGHTS,[weight,`Custom · ${weight}`] as [string,string]];
 return <Sheet title={editing?`Edit ${editing.name}`:'Add a person'} eyebrow="People" onClose={onClose}>
  <form className="form-stack" onSubmit={submit}>
   <label>Name<input value={name} onChange={e=>setName(e.target.value)} placeholder="First name" autoFocus required/></label>
   <label>Share of costs<select value={weight} onChange={e=>setWeight(e.target.value)}>{weightOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   <label>Belongs to<select value={target} onChange={e=>setTarget(e.target.value)}>
    {groups.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
    <option value={NEW_FAMILY}>A new family…</option>
    <option value={ON_OWN}>On their own</option>
   </select></label>
   {target===NEW_FAMILY&&<label>Family name<input value={familyName} onChange={e=>setFamilyName(e.target.value)} placeholder="The Millers"/></label>}
   <p className="helper">{target===ON_OWN?'They settle up on their own, like a family of one.':'A family shares one wallet: its members’ costs are settled together.'}</p>
   <label>Email (optional)<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com" autoComplete="off"/></label>
   <p className="helper">{editing?.email&&editing.email===email.trim()?'This person can sign in with this address.':'With an email they get an invitation to sign in and add expenses. Leave it empty for children.'}</p>
   {error&&<p className="form-error" role="alert">{error}</p>}
   <Button type="submit" disabled={busy}>{editing?'Save changes':'Add person'} <ArrowRight size={17}/></Button>
   {editing&&<Button kind="ghost" onClick={()=>void del()} disabled={busy}>Remove from trip</Button>}
  </form>
 </Sheet>;
}

function FamilySheet({family,save,remove,busy,onClose,trip}:{family?:Family;save:Save;remove:Remove;busy:boolean;onClose:()=>void;trip:Trip}){
 const [name,setName]=useState(family?.name??'');
 const empty=!!family&&!trip.people.some(p=>p.familyId===family.id);
 return <Sheet title={family?`Edit ${family.name}`:'Add a family'} eyebrow="People" onClose={onClose}>
  <form className="form-stack" onSubmit={async e=>{e.preventDefault();if(!name.trim())return;await save('family',family?{...family,name:name.trim()}:{id:uid(),name:name.trim(),solo:false,version:0},family);onClose();}}>
   <label>Family name<input value={name} onChange={e=>setName(e.target.value)} placeholder="The Millers" autoFocus required/></label>
   <p className="helper">Add the people after creating the family. Costs are settled per family.</p>
   <Button type="submit" disabled={busy}>{family?'Save':'Add family'} <ArrowRight size={17}/></Button>
   {family&&empty&&<Button kind="ghost" onClick={async()=>{await remove('family',family);onClose();}} disabled={busy}>Delete family</Button>}
  </form>
 </Sheet>;
}

export function People({trip,view,user,onLogout,save,remove,onInvite,pending,selected,onRefresh,busy,describeActivity}:{trip:Trip;view:TripView;user:User|null|undefined;onLogout:()=>void;save:Save;remove:Remove;onInvite:()=>void;pending:number;selected:string;onRefresh:()=>void;busy:boolean;describeActivity:(s:string)=>string}){
 const organizer=view.role==='organizer',members=view.members??[];
 const [personDraft,setPersonDraft]=useState<PersonDraft|null>(null),[familySheet,setFamilySheet]=useState<{family?:Family}|null>(null);
 const [queued,setQueued]=useState<{id:string;command:Command;state:string;error?:string}[]>([]);
 useEffect(()=>{pendingFor(selected).then(setQueued);},[selected,pending]);
 const families=trip.families.filter(f=>!f.solo),solo=trip.families.filter(f=>f.solo);
 const inTrip=new Set(trip.people.map(p=>p.email).filter(Boolean));
 const loose=members.filter(m=>!inTrip.has(m.email)&&m.email!==user?.email);
 return <>
  <section className="card">
   <div className="card-head"><div><span className="eyebrow">Shared wallets</span><h2>Families & people</h2></div>
    {organizer&&<div className="card-actions"><Button kind="secondary" onClick={()=>setFamilySheet({})}><Users size={16}/> Add family</Button><Button kind="secondary" onClick={()=>setPersonDraft({familyId:''})}><Plus size={16}/> Add person</Button></div>}
   </div>
   {!trip.families.length&&<Empty icon={<Users/>} heading="Who is coming?" body={organizer?'Add a family, then its people, or add someone travelling on their own.':'The organizer has not added anyone yet.'}/>}
   {families.map(f=>{const people=trip.people.filter(p=>p.familyId===f.id);return <div className="family-block" key={f.id}>
    <div className="family-title"><span className="avatar">{f.name.slice(0,1).toUpperCase()}</span><div><strong>{f.name}</strong><small>{people.length} {people.length===1?'person':'people'}</small></div>
     {organizer&&<button type="button" className="icon-button subtle" aria-label={`Edit ${f.name}`} onClick={()=>setFamilySheet({family:f})}><Pencil size={16}/></button>}</div>
    {people.map(p=><PersonRow key={p.id} person={p} members={members} canEdit={organizer} onEdit={()=>setPersonDraft({person:p,familyId:p.familyId})}/>)}
    {organizer&&<button type="button" className="text-button add-to-family" onClick={()=>setPersonDraft({familyId:f.id})}><Plus size={16}/> Add person to {f.name}</button>}
   </div>;})}
   {solo.length>0&&<div className="family-block"><div className="family-title"><span className="avatar"><UserRound size={18}/></span><div><strong>On their own</strong><small>Each settles up separately</small></div></div>
    {solo.flatMap(f=>trip.people.filter(p=>p.familyId===f.id)).map(p=><PersonRow key={p.id} person={p} members={members} canEdit={organizer} onEdit={()=>setPersonDraft({person:p,familyId:p.familyId})}/>)}
   </div>}
  </section>
  <div className="two-column people-lower">
   <section className="card">
    <div className="card-head"><div><span className="eyebrow">Can sign in</span><h2>Accounts</h2></div></div>
    <p className="helper">Add an email to a person to invite them. Invited people can add expenses and scan receipts; only organizers manage people.</p>
    {loose.map(m=><div className="list-row" key={m.email}><span className="list-icon"><Mail size={18}/></span><div><strong>{m.email}</strong><small>{m.role} · {m.joined?'signed in':'invited'} · not linked to a person</small></div></div>)}
    {organizer&&<Button kind="ghost" onClick={onInvite}><Mail size={17}/> Invite someone without adding them</Button>}
    <div className="settings-block account-block"><span className="eyebrow">Your account</span><div className="account-row"><span>Signed in as <strong>{user?.email??'—'}</strong></span><button className="text-button" onClick={onLogout}>Sign out</button></div></div>
   </section>
   <section className="card">
    <div className="settings-block first"><span className="eyebrow">Sync & history</span><h3>{pending?`${pending} change${pending===1?'':'s'} waiting`:'Everything is up to date'}</h3><p>Edits saved offline sync when this app is open and connected.</p>
     {queued.filter(q=>q.state!=='pending').map(q=><div className="conflict" key={q.id}><strong>{q.state==='conflict'?`Your ${q.command.entity} change clashed with a newer edit`:`Your ${q.command.entity} change was not accepted`}</strong><span>{q.error}</span><button className="text-button" onClick={async()=>{await localDb.outbox.delete(q.id);onRefresh();}}>Discard my local change</button></div>)}
     <Button kind="ghost" onClick={onRefresh}>Check for updates <ArrowRight size={16}/></Button></div>
    <div className="settings-block"><span className="eyebrow">Activity</span>{trip.activity.slice(0,8).map(a=><div className="activity-row" key={a.id}><strong>{a.actor}</strong> {describeActivity(a.description)} <small>{fmt(a.at.slice(0,10))}</small></div>)}</div>
   </section>
  </div>
  {personDraft&&<PersonSheet trip={trip} draft={personDraft} save={save} remove={remove} busy={busy} onClose={()=>setPersonDraft(null)}/>}
  {familySheet&&<FamilySheet trip={trip} family={familySheet.family} save={save} remove={remove} busy={busy} onClose={()=>setFamilySheet(null)}/>}
 </>;
}
