import {useId,type ReactNode} from 'react';
import {Sparkles,X} from 'lucide-react';
import type {Command} from '../../../packages/domain/src/model.js';
/** The traveller's local calendar day (UTC would be yesterday just after midnight in Europe). */
export const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export const euro=(n:number)=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(n/100);
export const fmt=(iso:string)=>new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short'}).format(new Date(`${iso}T12:00:00`));
export const uid=()=>crypto.randomUUID();
export const cents=(s:string)=>Math.round(Number(s.replace(',','.'))*100);
export const money=(n:number)=>String((n/100).toFixed(2));
export type Save=(entity:Command['entity'],value:any,old?:{version:number})=>Promise<void>;
export type Remove=(entity:Command['entity'],old:{id:string;version:number})=>Promise<void>;
export function Logo(){return <span className="brand"><span className="brand-mark"><Sparkles size={18}/></span><span>split<span className="brand-light">fairy</span></span></span>}
export function Button({children,onClick,kind='primary',type='button',disabled=false,label}: {children:ReactNode;onClick?:()=>void;kind?:'primary'|'secondary'|'ghost'|'danger';type?:'button'|'submit';disabled?:boolean;label?:string}){return <button className={`btn btn-${kind}`} onClick={onClick} type={type} disabled={disabled} aria-label={label}>{children}</button>}
export function Notice({children}: {children:ReactNode}){return <div className="notice"><Sparkles size={16}/>{children}</div>}
export function Empty({icon,heading,body,action}: {icon:ReactNode;heading:string;body:string;action?:ReactNode}){return <div className="empty"><div className="empty-icon">{icon}</div><h3>{heading}</h3><p>{body}</p>{action}</div>}
/** Dialog that becomes a bottom sheet on phones (see .modal in style.css). */
export function Sheet({title,eyebrow='Splitfairy',onClose,children}:{title:string;eyebrow?:string;onClose:()=>void;children:ReactNode}){
 const id=useId();
 return <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal" role="dialog" aria-modal="true" aria-labelledby={id}>
  <div className="modal-head"><div><span className="eyebrow">{eyebrow}</span><h2 id={id}>{title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X/></button></div>
  {children}
 </div></div>;
}
/** Share weights as people think about them; any other stored value shows as custom. */
export const WEIGHTS:[string,string][]=[['1','Adult · 1'],['0.75','Teen · 0.75'],['0.5','Child · 0.5'],['0.25','Small child · 0.25'],['0','Baby · free']];
export const weightLabel=(w:number)=>WEIGHTS.find(([v])=>Number(v)===w)?.[1].split(' · ')[0]??`Share ${w}`;
