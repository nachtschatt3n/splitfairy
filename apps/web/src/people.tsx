import {useState,type FormEvent} from 'react';
import {ArrowRight,Mail,Pencil,Plus,Settings2,UserRound,Users} from 'lucide-react';
import {api} from './api.js';
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
 const inExpenses=editing?trip.expenses.filter(x=>x.allocations.some(a=>a.personId===editing.id)).length:0;
 const del=async()=>{
  if(!editing||!window.confirm(`Remove ${editing.name} from the trip? They are also taken off planned meals and activities.`))return;
  // Take them off every plan first; the queue replays these before the removal.
  for(const ev of trip.events.filter(x=>x.participants.some(p=>p.id===editing.id)))await save('event',{...ev,participants:ev.participants.filter(p=>p.id!==editing.id)},ev);
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
   {editing&&(inExpenses?<p className="helper">{editing.name} is part of {inExpenses} expense{inExpenses===1?'':'s'}, so they stay on the trip. Void or edit {inExpenses===1?'it':'those'} to remove them.</p>:<Button kind="ghost" onClick={()=>void del()} disabled={busy}>Remove from trip</Button>)}
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
   {family&&(empty?<Button kind="ghost" onClick={async()=>{if(!window.confirm(`Delete ${family.name}?`))return;await remove('family',family);onClose();}} disabled={busy}>Delete family</Button>:<p className="helper">To delete this family, move or remove its people first.</p>)}
  </form>
 </Sheet>;
}

function TripSheet({trip,save,busy,onClose,onDeleted,onMessage}:{trip:Trip;save:Save;busy:boolean;onClose:()=>void;onDeleted:()=>void;onMessage:(m:string)=>void}){
 const [name,setName]=useState(trip.name),[start,setStart]=useState(trip.start),[end,setEnd]=useState(trip.end),[error,setError]=useState('');
 const outside=trip.events.filter(e=>e.date<start||e.date>end).length;
 const hasMoney=trip.expenses.length>0||trip.payments.length>0;
 return <Sheet title="Trip settings" eyebrow={trip.name} onClose={onClose}>
  <form className="form-stack" onSubmit={async e=>{e.preventDefault();if(end<start){setError('The last day must be on or after the first day.');return;}await save('trip',{name:name.trim()||trip.name,start,end},trip);onClose();}}>
   <label>Trip name<input value={name} onChange={e=>setName(e.target.value)} required/></label>
   <div className="form-row"><label>First day<input type="date" value={start} onChange={e=>setStart(e.target.value)} required/></label><label>Last day<input type="date" value={end} onChange={e=>setEnd(e.target.value)} required/></label></div>
   {outside>0&&<p className="helper">{outside} plan{outside===1?' falls':'s fall'} outside these dates. {outside===1?'It stays':'They stay'} on the trip; move {outside===1?'it':'them'} in the plan if needed.</p>}
   {error&&<p className="form-error" role="alert">{error}</p>}
   <Button type="submit" disabled={busy}>Save trip <ArrowRight size={17}/></Button>
  </form>
  <div className="settings-block">
   <h3>{trip.archived?'Archived':'Archive'}</h3>
   <p>{trip.archived?'This trip is read-only. Unarchive it to make changes again.':'When the trip is over and settled, archive it. It becomes read-only and stays in everyone’s history.'}</p>
   <Button kind="secondary" disabled={busy} onClick={async()=>{await save('trip',{archived:!trip.archived},trip);onClose();}}>{trip.archived?'Unarchive trip':'Archive trip'}</Button>
  </div>
  <div className="settings-block">
   <h3>Delete trip</h3>
   {hasMoney?<p>Trips with expenses or repayments can only be archived, so nobody loses the record of who paid what.</p>
    :<><p>Removes the trip, its plans and shopping list for everyone. This cannot be undone.</p><Button kind="ghost" disabled={busy} onClick={async()=>{if(!window.confirm(`Delete ${trip.name} for everyone? This cannot be undone.`))return;try{await api.deleteTrip(trip.id);onDeleted();}catch(error){onMessage(error instanceof Error?error.message:'Could not delete the trip');}}}>Delete trip</Button></>}
  </div>
 </Sheet>;
}

export function People({trip,view,user,onRename,onLogout,save,remove,onInvite,pending,selected,onRefresh,onTripDeleted,onMessage,busy,describeActivity}:{trip:Trip;view:TripView;user:User|null|undefined;onRename:()=>void;onLogout:()=>void;save:Save;remove:Remove;onInvite:()=>void;pending:number;selected:string;onRefresh:()=>void;onTripDeleted:()=>void;onMessage:(m:string)=>void;busy:boolean;describeActivity:(s:string)=>string}){
 const [tripSheet,setTripSheet]=useState(false);
 const memberAction=async(work:()=>Promise<unknown>,done:string)=>{try{await work();onMessage(done);onRefresh();}catch(error){onMessage(error instanceof Error?error.message:'That did not work');}};
 const organizer=view.role==='organizer',members=view.members??[];
 const [personDraft,setPersonDraft]=useState<PersonDraft|null>(null),[familySheet,setFamilySheet]=useState<{family?:Family}|null>(null);
 const [queued,setQueued]=useState<{id:string;command:Command;state:string;error?:string}[]>([]);
 useEffect(()=>{pendingFor(selected).then(setQueued);},[selected,pending]);
 const families=trip.families.filter(f=>!f.solo),solo=trip.families.filter(f=>f.solo);
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
    <div className="card-head"><div><span className="eyebrow">Can sign in</span><h2>Who can sign in</h2></div></div>
    <p className="helper">Add an email to a person to invite them. Invited people can add expenses and scan receipts; organizers also manage people and the trip.</p>
    {members.map(m=>{const person=trip.people.find(p=>p.email===m.email);const self=m.email===user?.email;return <div className="member-row" key={m.email}>
     <span className="list-icon"><Mail size={18}/></span>
     <div><strong>{person?.name??m.email}</strong><small>{person?`${m.email} · `:''}{m.role==='organizer'?'Organizer':'Member'} · {m.joined?'signed in':'invited'}{self?' · you':''}</small></div>
     {organizer&&!self&&<div className="member-actions">
      <button type="button" className="text-button" onClick={()=>void memberAction(()=>api.setRole(trip.id,m.email,m.role==='organizer'?'member':'organizer'),`${person?.name??m.email} is now ${m.role==='organizer'?'a member':'an organizer'}.`)}>{m.role==='organizer'?'Make member':'Make organizer'}</button>
      <button type="button" className="text-button" onClick={()=>{if(window.confirm(`Remove ${m.email}'s access to this trip? Their person entry stays.`))void memberAction(()=>api.removeMember(trip.id,m.email),'Access removed.');}}>Remove access</button>
     </div>}
    </div>;})}
    {organizer&&<Button kind="ghost" onClick={onInvite}><Mail size={17}/> Invite someone without adding them</Button>}
    {organizer&&<div className="settings-block"><span className="eyebrow">Trip settings</span><h3>{trip.name}{trip.archived?' · archived':''}</h3><p>{fmt(trip.start)} – {fmt(trip.end)}</p><Button kind="secondary" onClick={()=>setTripSheet(true)}><Settings2 size={16}/> Edit trip</Button></div>}
    <div className="settings-block account-block"><span className="eyebrow">Your account</span><div className="account-row"><span><strong>{user?.name}</strong> · {user?.email??'—'}</span><span className="account-actions"><button className="text-button" onClick={onRename}>Change name</button><button className="text-button" onClick={onLogout}>Sign out</button></span></div></div>
   </section>
   <section className="card">
    <div className="settings-block first"><span className="eyebrow">Sync & history</span><h3>{pending?`${pending} change${pending===1?'':'s'} waiting`:'Everything is up to date'}</h3><p>Edits saved offline sync when this app is open and connected.</p>
     {queued.filter(q=>q.state!=='pending').map(q=><div className="conflict" key={q.id}><strong>{q.state==='conflict'?`Your ${q.command.entity} change clashed with a newer edit`:`Your ${q.command.entity} change was not accepted`}</strong><span>{q.error}</span><button className="text-button" onClick={async()=>{await localDb.outbox.delete(q.id);onRefresh();}}>Discard my local change</button></div>)}
     <Button kind="ghost" onClick={onRefresh}>Check for updates <ArrowRight size={16}/></Button></div>
    <div className="settings-block"><span className="eyebrow">Activity</span>{trip.activity.slice(0,8).map(a=><div className="activity-row" key={a.id}><strong>{a.actor}</strong> {describeActivity(a.description)} <small>{fmt(a.at.slice(0,10))}</small></div>)}</div>
   </section>
  </div>
  {personDraft&&<PersonSheet trip={trip} draft={personDraft} save={save} remove={remove} busy={busy} onClose={()=>setPersonDraft(null)}/>}
  {tripSheet&&<TripSheet trip={trip} save={save} busy={busy} onClose={()=>setTripSheet(false)} onDeleted={onTripDeleted} onMessage={onMessage}/>}
  {familySheet&&<FamilySheet trip={trip} family={familySheet.family} save={save} remove={remove} busy={busy} onClose={()=>setFamilySheet(null)}/>}
 </>;
}
