import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';

/**
 * Ticking off a list item: the tap is saved at once (so everyone sees it), the item is struck
 * through and flashes, but it stays where it is for a few seconds, so a second tap undoes a slip
 * and nothing moves under the finger. Then it slides down to the ticked items. Nothing blocks taps.
 */
const SETTLE=5000;

type Commit=(id:string,done:boolean)=>Promise<void>;
type Tick={held:(id:string)=>boolean;flashing:(id:string)=>boolean;arriving:(id:string)=>boolean;shown:(id:string,actual:boolean)=>boolean;tick:(id:string,next:boolean,commit:Commit)=>void};
const TickContext=createContext<Tick|null>(null);

/** Open items first, then the ticked ones under a small divider such as "Bought · 3". `isDone` should come from `useSettled`. */
export function withDone<T>(items:T[],isDone:(item:T)=>boolean,label:string,row:(item:T)=>ReactNode){
 const open=items.filter(i=>!isDone(i)),done=items.filter(isDone);
 return <>{open.map(row)}{done.length>0&&open.length>0&&<p className="done-divider" aria-hidden="true"><span>{label} · {done.length}</span></p>}{done.map(row)}</>;
}

/** One provider for the whole trip, so every list shares the same held items. */
export function TickProvider({children}:{children:ReactNode}){
 const [hold,setHold]=useState<Map<string,number>>(()=>new Map());
 const [flash,setFlash]=useState<Set<string>>(()=>new Set());
 const [arrive,setArrive]=useState<Set<string>>(()=>new Set());
 // What the box shows until the saved trip catches up with the tap.
 const [optimistic,setOptimistic]=useState<Map<string,boolean>>(()=>new Map());
 const holdRef=useRef(hold);holdRef.current=hold;
 const brief=(set:typeof setFlash,id:string,ms:number)=>{set(s=>new Set(s).add(id));setTimeout(()=>set(s=>{const n=new Set(s);n.delete(id);return n;}),ms);};
 useEffect(()=>{
  if(!hold.size)return;
  const timer=setInterval(()=>{
   const now=Date.now(),due=[...holdRef.current].filter(([,until])=>until<=now).map(([id])=>id);
   if(!due.length)return;
   setHold(h=>{const n=new Map(h);for(const id of due)n.delete(id);return n;});
   for(const id of due)brief(setArrive,id,600);
  },250);
  return()=>clearInterval(timer);
 },[hold.size]);
 const tick=useCallback((id:string,next:boolean,commit:Commit)=>{
  setOptimistic(o=>new Map(o).set(id,next));
  if(next){setHold(h=>new Map(h).set(id,Date.now()+SETTLE));brief(setFlash,id,750);}
  else setHold(h=>{const n=new Map(h);n.delete(id);return n;});
  void commit(id,next).finally(()=>setTimeout(()=>setOptimistic(o=>{if(o.get(id)!==next)return o;const n=new Map(o);n.delete(id);return n;}),1500));
 },[]);
 const value:Tick={held:id=>hold.has(id),flashing:id=>flash.has(id),arriving:id=>arrive.has(id),shown:(id,actual)=>optimistic.has(id)?optimistic.get(id)!:actual,tick};
 return <TickContext.Provider value={value}>{children}</TickContext.Provider>;
}

/** For one row: what the box shows, its highlight, and the handler. Without a provider it just saves. */
export function useTick(id:string,actual:boolean,commit:Commit){
 const ctx=useContext(TickContext);
 if(!ctx)return {checked:actual,className:'',toggle:()=>void commit(id,!actual)};
 const checked=ctx.shown(id,actual);
 return {checked,className:ctx.flashing(id)?' just-ticked':ctx.arriving(id)?' settle-in':'',toggle:()=>ctx.tick(id,!checked,commit)};
}

/** Where a row belongs: ticked items stay among the open ones while they are held. */
export function useSettled(){
 const ctx=useContext(TickContext);
 return (id:string,done:boolean)=>{if(!ctx)return done;const shown=ctx.shown(id,done);return shown&&!ctx.held(id);};
}
