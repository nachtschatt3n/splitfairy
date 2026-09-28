import {useEffect,useState,type ChangeEvent} from 'react';
import {ChevronLeft,ChevronRight,ImagePlus,Trash2} from 'lucide-react';
import type {Photo,Stay,Trip} from '../../../packages/domain/src/model.js';
import {photoUrl} from './api.js';
import {Button,Sheet} from './common.js';

/** What the photo UI may do; the app shell uploads, removes and refreshes the trip. */
export type PhotoActions={userId:string;organizer:boolean;add:(stayId:string,files:File[])=>Promise<void>;remove:(photo:Photo)=>Promise<void>};
export const MAX_PHOTOS=12;
export const photosOf=(trip:Trip,stayId:string)=>(trip.photos??[]).filter(p=>p.stayId===stayId);
const canRemove=(actions:PhotoActions,photo:Photo)=>actions.organizer||photo.authorId===actions.userId;

/** The stay's first photo as a banner on its card, with how many more there are. */
export function StayCover({trip,stay,compact=false,onOpen}:{trip:Trip;stay:Stay;compact?:boolean;onOpen:(index:number)=>void}){
 const photos=photosOf(trip,stay.id);if(!photos.length)return null;
 return <button type="button" className={compact?'stay-cover compact':'stay-cover'} onClick={()=>onOpen(0)} aria-label={`Photos of ${stay.name} (${photos.length})`}>
  <img src={photoUrl(trip.id,photos[0].id,true)} alt="" loading="lazy" decoding="async"/>
  {photos.length>1&&<span className="photo-count">+{photos.length-1}</span>}
 </button>;
}

/** Full-size photos of one stay, one at a time. */
export function PhotoViewer({trip,stay,start,actions,onClose}:{trip:Trip;stay:Stay;start:number;actions:PhotoActions;onClose:()=>void}){
 const photos=photosOf(trip,stay.id);
 const [index,setIndex]=useState(start),[busy,setBusy]=useState(false);
 const i=Math.min(index,photos.length-1),photo=photos[i];
 // The last photo was removed: nothing left to show.
 useEffect(()=>{if(!photo)onClose();},[photo,onClose]);
 if(!photo)return null;
 const step=(d:number)=>setIndex((i+d+photos.length)%photos.length);
 return <Sheet title={stay.name} eyebrow={`Photo ${i+1} of ${photos.length}`} onClose={onClose}>
  <div className="photo-viewer" onKeyDown={e=>{if(e.key==='ArrowLeft')step(-1);if(e.key==='ArrowRight')step(1);}}>
   <img src={photoUrl(trip.id,photo.id)} alt={`${stay.name}, photo ${i+1}`}/>
   {photos.length>1&&<div className="photo-nav"><button type="button" className="icon-button" aria-label="Previous photo" onClick={()=>step(-1)}><ChevronLeft size={20}/></button><button type="button" className="icon-button" aria-label="Next photo" onClick={()=>step(1)}><ChevronRight size={20}/></button></div>}
  </div>
  <p className="helper">Added by {photo.author}</p>
  {canRemove(actions,photo)&&<Button kind="ghost" disabled={busy} onClick={async()=>{if(!window.confirm('Remove this photo?'))return;setBusy(true);try{await actions.remove(photo);}finally{setBusy(false);}}}><Trash2 size={16}/> Remove photo</Button>}
 </Sheet>;
}

/** Photos inside the stay sheet: thumbnails to open or remove, and a button to add more. */
export function StayPhotos({trip,stay,actions,onOpen}:{trip:Trip;stay:Stay;actions:PhotoActions;onOpen:(index:number)=>void}){
 const photos=photosOf(trip,stay.id);
 const [uploading,setUploading]=useState(0),[error,setError]=useState('');
 const pick=async(e:ChangeEvent<HTMLInputElement>)=>{
  const files=[...(e.target.files??[])].slice(0,MAX_PHOTOS-photos.length);e.target.value='';if(!files.length)return;
  setError('');setUploading(files.length);
  try{await actions.add(stay.id,files);}catch(err){setError(err instanceof Error?err.message:'The photos could not be added.');}finally{setUploading(0);}
 };
 return <fieldset className="stay-photos"><legend>Photos</legend>
  {photos.length>0&&<div className="photo-grid">{photos.map((p,n)=><div key={p.id} className="photo-tile">
   <button type="button" onClick={()=>onOpen(n)} aria-label={`Open photo ${n+1}`}><img src={photoUrl(trip.id,p.id,true)} alt="" loading="lazy"/></button>
   {canRemove(actions,p)&&<button type="button" className="photo-remove" aria-label={`Remove photo ${n+1}`} onClick={async()=>{if(window.confirm('Remove this photo?'))await actions.remove(p);}}><Trash2 size={14}/></button>}
  </div>)}</div>}
  {uploading>0?<p className="helper" role="status">Adding {uploading} photo{uploading===1?'':'s'}…</p>
   :photos.length<MAX_PHOTOS&&<label className="btn btn-secondary photo-add"><ImagePlus size={17}/> {photos.length?'Add more photos':'Add photos'}<input type="file" accept="image/*" multiple onChange={pick}/></label>}
  {!photos.length&&!uploading&&<p className="helper">Show everyone what the place looks like. Anyone on the trip can add photos.</p>}
  {error&&<p className="form-error" role="alert">{error}</p>}
 </fieldset>;
}
