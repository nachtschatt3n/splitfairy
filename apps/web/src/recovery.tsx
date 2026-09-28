import {Component,useEffect,useState,type ReactNode} from 'react';
/** Drops the cached app shell (service worker + Cache Storage) and reloads. Offline edits in IndexedDB are kept. */
export async function repairAndReload(){
 try{for(const r of await navigator.serviceWorker?.getRegistrations?.()??[])await r.unregister();}catch{}
 try{for(const key of await caches.keys())await caches.delete(key);}catch{}
 location.reload();
}
export function Loading({label}:{label:string}){
 const [slow,setSlow]=useState(false);
 useEffect(()=>{const t=setTimeout(()=>setSlow(true),8000);return()=>clearTimeout(t);},[]);
 return <div className="loading" role="status"><span className="brand">split<span className="brand-light">fairy</span></span><span>{label}</span>
  {slow&&<div className="loading-help"><p>This is taking longer than usual.</p><button className="btn btn-primary" onClick={()=>void repairAndReload()}>Reload Splitfairy</button><small>Your unsynced changes stay on this device.</small></div>}</div>;
}
export class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(error:unknown){console.error(error);}
 render(){return this.state.failed?<div className="loading" role="alert"><span className="brand">split<span className="brand-light">fairy</span></span><span>Something went wrong.</span><div className="loading-help"><button className="btn btn-primary" onClick={()=>void repairAndReload()}>Reload Splitfairy</button><small>Your unsynced changes stay on this device.</small></div></div>:this.props.children;}
}
