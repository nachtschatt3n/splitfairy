import {useEffect,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';

/** The app bundle this page runs, e.g. "/assets/index-AbC123.js". */
const running=()=>{const src=document.querySelector<HTMLScriptElement>('script[type=module][src*="/assets/index-"]')?.src;return src?new URL(src).pathname:null;};

/** Asks the server which bundle is current; a query string keeps the offline cache out of it. */
async function latest(){
 try{const html=await (await fetch(`/?version-check=${Date.now()}`,{cache:'no-store'})).text();return html.match(/\/assets\/index-[\w-]+\.js/)?.[0]??null;}catch{return null;}
}

/** Fetches the new offline copy first, so the reload really starts the new version. */
async function applyUpdate(){
 try{
  const registration=await navigator.serviceWorker?.getRegistration();
  if(registration){
   await registration.update();
   const worker=registration.installing??registration.waiting;
   if(worker)await new Promise<void>(resolve=>{const done=()=>{if(worker.state==='activated'||worker.state==='redundant')resolve();};worker.addEventListener('statechange',done);done();setTimeout(resolve,8000);});
  }
 }catch{/* reload anyway */}
 location.reload();
}

/**
 * A home-screen app can stay open for days on an old version. Check when it comes back to the
 * front (and every half hour); update right away if nothing is open, otherwise offer a button.
 */
export function useAppUpdate(busy:boolean){
 const [ready,setReady]=useState(false);
 const busyRef=useRef(busy);busyRef.current=busy;
 useEffect(()=>{
  const current=running();if(!current)return;
  let stale=false;
  const check=async()=>{
   if(document.visibilityState!=='visible')return;
   if(!stale){const next=await latest();stale=!!next&&next!==current;}
   if(!stale)return;
   // Never reload under someone's fingers: an open sheet or a half-typed field waits for the button.
   const typing=document.activeElement instanceof HTMLInputElement||document.activeElement instanceof HTMLTextAreaElement;
   if(!busyRef.current&&!document.querySelector('[role=dialog]')&&!typing)void applyUpdate();else setReady(true);
  };
  const onVisible=()=>void check();
  document.addEventListener('visibilitychange',onVisible);
  const timer=setInterval(check,30*60_000);
  return()=>{document.removeEventListener('visibilitychange',onVisible);clearInterval(timer);};
 },[]);
 return ready;
}

export function UpdateBanner(){
 const [busy,setBusy]=useState(false);
 return <div className="update-banner" role="status"><RefreshCw size={16} aria-hidden="true"/><span>A new version of Splitfairy is ready.</span><button type="button" className="text-button" disabled={busy} onClick={()=>{setBusy(true);void applyUpdate();}}>{busy?'Updating…':'Update now'}</button></div>;
}
