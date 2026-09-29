import {useEffect,useState,type FormEvent} from 'react';
import {AlertTriangle,ArrowRight,Plus,X} from 'lucide-react';
import type {Trip,User} from '../../../packages/domain/src/model.js';
import {api,ApiError,photoUrl} from './api.js';
import {Button,Logo,LogoMark,Sheet,fmt,today} from './common.js';

type Notice={kind:'info'|'error';text:string};
const validEmail=(v:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const digits=(v:string)=>v.replace(/\D/g,'');
const failure=(error:unknown):Notice=>({kind:'error',text:error instanceof ApiError&&error.status===401
 ?'That code did not work. It may have expired (codes last 30 minutes), or a newer code was sent: only the newest one works. Use “Send a new code” to get a fresh one.'
 :error instanceof Error?error.message:'Could not sign in. Please try again.'});

const SLIDES=[
 {img:'/tour/today.png',title:'The trip at a glance',text:'What is coming up, what is still on the list, and which receipts need a look.'},
 {img:'/tour/plan.png',title:'Plan every day',text:'Breakfasts, dinners and activities, with the shopping for each meal right on it.'},
 {img:'/tour/packing.png',title:'Who brings what',text:'Share the packing list between families, and decide which car or flight each thing travels in.'},
 {img:'/tour/receipt.png',title:'Receipts, checked by you',text:'Snap a receipt, check what was read, and assign each item to the meal it was for.'},
 {img:'/tour/settle.png',title:'Fair to the cent',text:'Children count less than adults, families share a wallet, and a few payments settle everything.'},
];
/** Rotating product tour for the sign-in page; still for people who prefer reduced motion. */
function Tour({compact=false}:{compact?:boolean}){
 const [i,setI]=useState(0),[paused,setPaused]=useState(false);
 useEffect(()=>{if(paused||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;const t=setInterval(()=>setI(x=>(x+1)%SLIDES.length),5000);return()=>clearInterval(t);},[paused]);
 const slide=SLIDES[i];
 return <section className={compact?'tour compact':'tour'} aria-label="What Splitfairy does" onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocus={()=>setPaused(true)} onBlur={()=>setPaused(false)}>
  {!compact&&<><span className="auth-mark"><LogoMark size={40}/></span><h2>Plan the trip.<br/>Split it fairly.</h2><p className="tour-lead">Splitfairy is for families and friends who travel together: plan the days, share the lists, and split every cost fairly.</p></>}
  <div className="tour-stage">
   <div className="tour-phone">{SLIDES.map((x,n)=><img key={x.img} src={x.img} alt={n===i?`Screenshot: ${x.title}`:''} aria-hidden={n!==i} className={n===i?'on':''} loading={n===0?'eager':'lazy'}/>)}</div>
   <div className="tour-caption" aria-live="polite"><strong>{slide.title}</strong><span>{slide.text}</span></div>
  </div>
  <div className="tour-dots" role="group" aria-label="Choose a screen">{SLIDES.map((x,n)=><button key={x.img} type="button" aria-label={x.title} aria-pressed={n===i} className={n===i?'on':''} onClick={()=>{setI(n);setPaused(true);}}/>)}</div>
 </section>;
}

/** Two steps: the email address, then the six-digit code. Nothing else is asked at sign-in. */
export function SignIn({onSignedIn,initialNotice}:{onSignedIn:(user:User&{isNew?:boolean})=>Promise<void>;initialNotice?:string}){
 const [email,setEmail]=useState(''),[code,setCode]=useState(''),[step,setStep]=useState<'email'|'code'>('email'),[busy,setBusy]=useState(false);
 const [notice,setNotice]=useState<Notice|null>(initialNotice?{kind:'info',text:initialNotice}:null);
 const run=async(work:()=>Promise<void>)=>{setBusy(true);try{await work();}catch(error){setNotice(failure(error));}finally{setBusy(false);}};
 const request=(e?:FormEvent)=>{e?.preventDefault();
  if(!validEmail(email)){setNotice({kind:'error',text:'Enter the email address you were invited with.'});return;}
  void run(async()=>{await api.requestCode(email.trim());setCode('');setStep('code');setNotice({kind:'info',text:'If this address is invited, a code is on its way. It can take a few minutes; check spam too.'});});};
 const haveCode=()=>{if(!validEmail(email)){setNotice({kind:'error',text:'Enter the email address the code was sent to first.'});return;}setStep('code');setNotice({kind:'info',text:'Enter the newest code from your email.'});};
 const verify=(e:FormEvent)=>{e.preventDefault();
  if(digits(code).length!==6){setNotice({kind:'error',text:'The code has six digits. Paste or type it from the email.'});return;}
  void run(async()=>{const user=await api.verify(email.trim(),digits(code));await onSignedIn(user);});};
 return <main className="auth-page">
  <div className="auth-art"><Tour/></div>
  <div className="auth-content">
   <Logo/>
   <h1>Good trips are<br/><em>shared fairly.</em></h1>
   <p className="auth-lead">Sign in with the email address your trip organizer invited. No password needed.</p>
   {step==='email'?<form onSubmit={request} className="form-stack" noValidate>
    <label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" autoFocus/></label>
    <Button type="submit" disabled={busy}>Email me a code <ArrowRight size={17}/></Button>
    <button type="button" className="text-button" onClick={haveCode}>I already have a code</button>
   </form>:<form onSubmit={verify} className="form-stack" noValidate>
    <p className="sent-to">Code for <strong>{email.trim()}</strong> <button type="button" className="text-button" onClick={()=>{setStep('email');setNotice(null);}}>Change</button></p>
    <label>Your six-digit code<input className="code-input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)} onPaste={e=>{const pasted=digits(e.clipboardData.getData('text'));if(pasted.length===6){e.preventDefault();setCode(pasted);}}} placeholder="123 456" autoFocus/></label>
    <Button type="submit" disabled={busy}>Sign in <ArrowRight size={17}/></Button>
    <button type="button" className="text-button" disabled={busy} onClick={()=>void run(async()=>{await api.requestCode(email.trim());setCode('');setNotice({kind:'info',text:'A new code is on its way. Earlier codes no longer work.'});})}>Send a new code</button>
   </form>}
   {notice&&<p className={`form-message ${notice.kind}`} role={notice.kind==='error'?'alert':'status'}>{notice.text}</p>}
   <p className="auth-foot">Codes arrive by email and work for 30 minutes.</p>
   <details className="tour-mobile"><summary>What is Splitfairy?</summary><Tour compact/></details>
  </div>
 </main>;
}

/** Asked once after the first sign-in, so the group sees a real name instead of an email address. */
export function NameSheet({user,onSaved,onClose}:{user:User;onSaved:(user:User)=>void;onClose:()=>void}){
 const [name,setName]=useState(user.name),[error,setError]=useState('');
 return <Sheet title="What should we call you?" eyebrow="Welcome to Splitfairy" onClose={onClose}>
  <form className="form-stack" onSubmit={async e=>{e.preventDefault();if(!name.trim())return;try{onSaved(await api.rename(name.trim()));}catch(err){setError(err instanceof Error?err.message:'Could not save');}}}>
   <label>Your name<input value={name} onChange={e=>setName(e.target.value)} autoFocus required/></label>
   <p className="helper">The group sees this name next to what you add. You can change it later under People.</p>
   {error&&<p className="form-error" role="alert">{error}</p>}
   <Button type="submit">Continue <ArrowRight size={17}/></Button>
  </form>
 </Sheet>;
}

type TripSummary=Pick<Trip,'id'|'name'|'start'|'end'|'archived'|'theme'>&{cover?:string|null;settle?:{open:boolean;overdueDays:number}};
const dayMs=86400_000,dayNumber=(iso:string)=>Math.round(new Date(`${iso}T12:00:00`).getTime()/dayMs);
function status(t:TripSummary,now:string){
 const d=dayNumber(now),s=dayNumber(t.start),e=dayNumber(t.end);
 if(t.archived)return {group:'archived',label:'Archived'};
 if(d<s)return {group:'upcoming',label:s-d===1?'Tomorrow':`In ${s-d} days`};
 // Money still owed after the trip: it stays at the top until everyone is square.
 if(t.settle?.overdueDays)return {group:'overdue',label:`Overdue ${t.settle.overdueDays} day${t.settle.overdueDays===1?'':'s'} · settle up`};
 if(d>e)return {group:'past',label:'Ended'};
 return {group:'now',label:`Day ${d-s+1} of ${e-s+1}`};
}
const GROUPS:[string,string][]=[['overdue','Needs settling'],['now','Happening now'],['upcoming','Coming up'],['past','Past trips'],['archived','Archived']];

function TripCard({trip,label,urgent=false,onOpen}:{trip:TripSummary;label:string;urgent?:boolean;onOpen:()=>void}){
 const start=new Date(`${trip.start}T12:00:00`);
 return <button className={urgent?'trip-card urgent':'trip-card'} onClick={onOpen} data-trip-theme={trip.theme??'classic'}>
  <span className={trip.cover?'date-block with-photo':'date-block'} aria-hidden="true" style={trip.cover?{backgroundImage:`url(${photoUrl(trip.id,trip.cover,true)})`}:undefined}><small>{start.toLocaleDateString('en-GB',{month:'short'})}</small><strong>{start.getDate()}</strong></span>
  <span className="trip-card-text"><strong>{trip.name}</strong><small>{fmt(trip.start)} – {fmt(trip.end)}</small><span className={urgent?'trip-status urgent':'trip-status'}>{urgent&&<AlertTriangle size={13} aria-hidden="true"/>} {label}</span></span>
  <ArrowRight size={18} aria-hidden="true"/>
 </button>;
}

export function TripList({user,trips,message,onDismiss,onOpen,onCreate,onLogout}:{user:User|null|undefined;trips:TripSummary[];message:string;onDismiss:()=>void;onOpen:(id:string)=>void;onCreate:()=>void;onLogout:()=>void}){
 const now=today(),first=user?.name?.split(' ')[0]??'there';
 const withStatus=trips.map(t=>({trip:t,...status(t,now)}));
 const sorted=(group:string)=>withStatus.filter(x=>x.group===group).sort((a,b)=>group==='past'||group==='archived'?b.trip.start.localeCompare(a.trip.start):a.trip.start.localeCompare(b.trip.start));
 return <section className="trip-list" aria-label="Your trips">
  {message&&<div className="toast" onClick={onDismiss}>{message}<X size={16}/></div>}
  {trips.length?<>
   <div className="trip-list-head"><div><span className="eyebrow">Your trips</span><h1>Hello, <em>{first}.</em></h1><p>Pick up where you left off.</p></div>
    {user?.admin&&<Button kind="secondary" onClick={onCreate}><Plus size={17}/> Create a vacation</Button>}</div>
   {GROUPS.map(([group,title])=>{const items=sorted(group);return items.length?<div key={group} className="trip-group"><h2 className={group==='archived'?'archived-heading':undefined}>{title}</h2>
    <div className={`trip-grid${group==='archived'?' archived':''}`}>{items.map(x=><TripCard key={x.trip.id} trip={x.trip} label={x.label} urgent={x.group==='overdue'} onOpen={()=>onOpen(x.trip.id)}/>)}</div></div>:null;})}
  </>:<div className="landing">
   <span className="landing-mark"><LogoMark size={56}/></span>
   <div className="eyebrow">Your next chapter</div>
   <h1>Every shared trip<br/><em>starts somewhere.</em></h1>
   <p>{user?.admin?'Create the trip, add the families, and invite the grown-ups by email.':'No trips yet. Ask your organizer to add you with this email address.'}</p>
   {user?.admin&&<Button onClick={onCreate}><Plus size={18}/> Create a vacation</Button>}
  </div>}
  <div className="account-row"><span>Signed in as <strong>{user?.email}</strong></span><button className="text-button" onClick={onLogout}>Sign out</button></div>
 </section>;
}
