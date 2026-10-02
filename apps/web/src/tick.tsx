import {createContext,useCallback,useContext,useEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';

/**
 * Ticking off a list item, the way good list apps do it:
 * the box fills and the row flashes at once, the item stays put for a moment
 * (so a second tap undoes a mistake), and then it glides to the ticked items below.
 * Several quick ticks move together after the last one, so rows never jump under the finger.
 */
const PAUSE=900;

type Commit=(id:string,done:boolean)=>Promise<void>;
type Tick={checked:(id:string,actual:boolean)=>boolean;flashing:(id:string)=>boolean;tick:(id:string,actual:boolean,commit:Commit)=>void};
const TickContext=createContext<Tick|null>(null);

/** Open items first, then the ticked ones under a small divider such as "Bought · 3". */
export function withDone<T>(items:T[],isDone:(item:T)=>boolean,label:string,row:(item:T)=>ReactNode){
 const open=items.filter(i=>!isDone(i)),done=items.filter(isDone);
 return <>{open.map(row)}{done.length>0&&open.length>0&&<p className="done-divider" aria-hidden="true"><span>{label} · {done.length}</span></p>}{done.map(row)}</>;
}

const reducedMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
const frame=()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));

/** Wraps a list (or the whole plan) so its rows share one pause and move together. */
export function TickProvider({children}:{children:ReactNode}){
 const [pending,setPending]=useState<Map<string,{done:boolean;commit:Commit}>>(()=>new Map());
 const [flash,setFlash]=useState<Set<string>>(()=>new Set());
 const timer=useRef<ReturnType<typeof setTimeout>>(undefined);
 const latest=useRef(pending);latest.current=pending;
 const flush=useCallback(async(animate=true)=>{
  clearTimeout(timer.current);
  const batch=[...latest.current.entries()];if(!batch.length)return;
  latest.current=new Map();
  const apply=async()=>{setPending(new Map());await Promise.all(batch.map(([id,{done,commit}])=>commit(id,done)));await frame();};
  const doc=document as Document&{startViewTransition?:(cb:()=>Promise<void>)=>unknown};
  if(animate&&doc.startViewTransition&&!reducedMotion())doc.startViewTransition(apply);else await apply();
 },[]);
 // Leaving the list never loses a tick.
 useEffect(()=>()=>{void flush(false);},[flush]);
 const tick=useCallback((id:string,actual:boolean,commit:Commit)=>{
  const shown=latest.current.has(id)?latest.current.get(id)!.done:actual;
  const next=new Map(latest.current);
  // Tapping again during the pause puts it back where it was: nothing to save.
  if(!shown===actual)next.delete(id);else next.set(id,{done:!shown,commit});
  latest.current=next;setPending(next);
  if(!shown){setFlash(f=>new Set(f).add(id));setTimeout(()=>setFlash(f=>{const n=new Set(f);n.delete(id);return n;}),700);}
  clearTimeout(timer.current);timer.current=setTimeout(()=>void flush(),PAUSE);
 },[flush]);
 const value:Tick={checked:(id,actual)=>pending.has(id)?pending.get(id)!.done:actual,flashing:id=>flash.has(id),tick};
 return <TickContext.Provider value={value}>{children}</TickContext.Provider>;
}

/** For one row: what the box shows, whether it flashes, and the handler. Without a provider it saves at once. */
export function useTick(id:string,actual:boolean,commit:Commit){
 const ctx=useContext(TickContext);
 if(!ctx)return {checked:actual,flashing:false,toggle:()=>void commit(id,!actual),style:undefined};
 return {checked:ctx.checked(id,actual),flashing:ctx.flashing(id),toggle:()=>ctx.tick(id,actual,commit),
  // Lets the browser glide this row from its old place to its new one.
  style:{viewTransitionName:`tick-${id.replace(/[^a-zA-Z0-9_-]/g,'')}`} as CSSProperties};
}
