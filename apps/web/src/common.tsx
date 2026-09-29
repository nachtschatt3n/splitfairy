import {useEffect,useId,useRef,type ReactNode} from 'react';
import {Info,X} from 'lucide-react';
import type {Command} from '../../../packages/domain/src/model.js';
/** The traveller's local calendar day (UTC would be yesterday just after midnight in Europe). */
export const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export const euro=(n:number)=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(n/100);
/** How dates and times are shown. Kept on this device for now (later per user); German style by default. */
export type DisplaySettings={date:'dmy'|'written'|'iso';time:'24h'|'12h'};
const DISPLAY_KEY='splitfairy-display';
let display:DisplaySettings=(()=>{try{const saved=JSON.parse(localStorage.getItem(DISPLAY_KEY)??'{}');return {date:['dmy','written','iso'].includes(saved.date)?saved.date:'dmy',time:saved.time==='12h'?'12h':'24h'};}catch{return {date:'dmy',time:'24h'};}})();
export const getDisplay=()=>display;
export function setDisplay(next:DisplaySettings){display=next;try{localStorage.setItem(DISPLAY_KEY,JSON.stringify(next));}catch{/* private mode: the setting lasts until reload */}}
const pad=(n:number)=>String(n).padStart(2,'0');
/** A day as "Sat 03.10.26" (or "Sat 3 Oct" / "Sat 2026-10-03", per the display setting). */
export const fmt=(iso:string)=>{
 const d=new Date(`${iso}T12:00:00`);if(Number.isNaN(d.getTime()))return '';
 const weekday=new Intl.DateTimeFormat('en-GB',{weekday:'short'}).format(d);
 if(display.date==='written')return new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short'}).format(d);
 if(display.date==='iso')return `${weekday} ${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
 return `${weekday} ${pad(d.getDate())}.${pad(d.getMonth()+1)}.${String(d.getFullYear()).slice(2)}`;
};
/** A clock time "HH:MM" as 20:30 or 8:30 pm, per the display setting. */
export const fmtTime=(hhmm:string|undefined)=>{
 if(!hhmm||!/^\d{2}:\d{2}$/.test(hhmm))return hhmm??'';
 if(display.time==='24h')return hhmm;
 const [h,m]=hhmm.split(':').map(Number);return `${h%12||12}:${pad(m)} ${h<12?'am':'pm'}`;
};
export const uid=()=>crypto.randomUUID();
export const cents=(s:string)=>Math.round(Number(s.replace(',','.'))*100);
export const money=(n:number)=>String((n/100).toFixed(2));
export type Save=(entity:Command['entity'],value:any,old?:{version:number})=>Promise<void>;
export type Remove=(entity:Command['entity'],old:{id:string;version:number})=>Promise<void>;
/** The split sparkle: two identical halves of a four-point star. Drawn in currentColor so it follows the theme. */
export function LogoMark({size=24}:{size?:number}){return <svg viewBox="0 0 256 256" width={size} height={size} aria-hidden="true" className="logo-mark"><path fill="currentColor" d="M117 5Q129 49 157 77L77 157Q49 129 5 117Q93 93 117 5ZM179 99Q207 127 251 139Q163 163 139 251Q127 207 99 179Z"/></svg>;}
export function Logo(){return <span className="brand"><span className="brand-mark"><LogoMark/></span><span>split<span className="brand-light">fairy</span></span></span>}
export function Button({children,onClick,kind='primary',type='button',disabled=false,label}: {children:ReactNode;onClick?:()=>void;kind?:'primary'|'secondary'|'ghost'|'danger';type?:'button'|'submit';disabled?:boolean;label?:string}){return <button className={`btn btn-${kind}`} onClick={onClick} type={type} disabled={disabled} aria-label={label}>{children}</button>}
export function Notice({children}: {children:ReactNode}){return <div className="notice"><Info size={16}/>{children}</div>}
export function Empty({icon,heading,body,action}: {icon:ReactNode;heading:string;body:string;action?:ReactNode}){return <div className="empty"><div className="empty-icon">{icon}</div><h3>{heading}</h3><p>{body}</p>{action}</div>}
/** Dialog that becomes a bottom sheet on phones (see .modal in style.css). */
/** Sheets that just closed and will step back unless a sheet re-mounts or takes over their entry. */
const pendingBack=new Map<string,{cancelled:boolean}>();
/**
 * While a sheet or dialog is open it has its own history entry, so the browser's back button closes it
 * instead of leaving the page. Closing it in the app removes the entry again. Safe with React's
 * double-run effects in development: a remount cancels the pending "back".
 */
export function useBackToClose(onClose:()=>void){
 const id=useId(),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  const pending=pendingBack.get(id);
  const closing=[...pendingBack.keys()].find(other=>other!==id&&history.state?.sheet===other);
  if(pending!==undefined){pending.cancelled=true;pendingBack.delete(id);}
  // A sheet that replaces one just closed (e.g. "Add new" → "Add stay") takes over its history entry.
  else if(closing!==undefined){pendingBack.get(closing)!.cancelled=true;pendingBack.delete(closing);history.replaceState({...(history.state??{}),sheet:id},'');}
  else if(history.state?.sheet!==id)history.pushState({...(history.state??{}),sheet:id},'');
  const onPop=()=>{if(history.state?.sheet!==id)close.current();};
  window.addEventListener('popstate',onPop);
  // React re-mounts within the same commit, so a microtask is late enough to tell a close from a re-mount.
  return()=>{window.removeEventListener('popstate',onPop);const job={cancelled:false};pendingBack.set(id,job);queueMicrotask(()=>{if(job.cancelled)return;pendingBack.delete(id);if(history.state?.sheet===id)history.back();});};
 },[id]);
}
/** For dialogs that are not a Sheet: back closes them too. */
export function BackToClose({onClose}:{onClose:()=>void}){useBackToClose(onClose);return null;}
export function Sheet({title,eyebrow='Splitfairy',onClose,children}:{title:string;eyebrow?:string;onClose:()=>void;children:ReactNode}){
 const id=useId();useBackToClose(onClose);
 return <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal" role="dialog" aria-modal="true" aria-labelledby={id}>
  <div className="modal-head"><div><span className="eyebrow">{eyebrow}</span><h2 id={id}>{title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X/></button></div>
  {children}
 </div></div>;
}
/** Share weights as people think about them; any other stored value shows as custom. */
export const WEIGHTS:[string,string][]=[['1','Adult · 1'],['0.75','Teen · 0.75'],['0.5','Child · 0.5'],['0.25','Small child · 0.25'],['0','Baby · free']];
export const weightLabel=(w:number)=>WEIGHTS.find(([v])=>Number(v)===w)?.[1].split(' · ')[0]??`Share ${w}`;
export const THEME_OPTIONS:[string,string,string][]=[['classic','Classic','Teal and coral, the default'],['coast','Coast','Sea, sand and sunset'],['alpine','Alpine','Snow, glacier and ski red'],['city','City','Stone, slate and brick'],['countryside','Countryside','Olive, wheat and lavender']];
/** Radio group of trip themes; each tile previews its own colours through data-trip-theme. */
export function ThemePicker({value,onChange,name='theme'}:{value:string;onChange:(v:string)=>void;name?:string}){
 return <fieldset className="theme-picker"><legend>Look of this trip</legend><div className="theme-options">
  {THEME_OPTIONS.map(([id,label,hint])=><label key={id} className={value===id?'theme-option checked':'theme-option'} data-trip-theme={id}>
   <input type="radio" name={name} value={id} checked={value===id} onChange={()=>onChange(id)}/>
   <span className="theme-swatch" aria-hidden="true"><i style={{background:'var(--primary)'}}/><i style={{background:'var(--soft)'}}/><i style={{background:'var(--accent)'}}/></span>
   <span className="theme-text"><strong>{label}</strong><small>{hint}</small></span>
  </label>)}
 </div></fieldset>;
}
