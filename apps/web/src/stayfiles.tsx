import {useState,type ChangeEvent} from 'react';
import {FileText,Paperclip,Trash2} from 'lucide-react';
import type {Stay,Trip} from '../../../packages/domain/src/model.js';
import {api,fileUrl} from './api.js';

const size=(bytes:number)=>bytes<1024*1024?`${Math.max(1,Math.round(bytes/1024))} KB`:`${(bytes/1024/1024).toFixed(1)} MB`;
/** Documents on a stay (booking confirmation, directions): anyone can attach; whoever added one, or an organizer, can remove it. */
export function StayFiles({trip,stay,userId,organizer,onChanged}:{trip:Trip;stay:Stay;userId:string;organizer:boolean;onChanged:()=>Promise<void>}){
 const files=(trip.files??[]).filter(f=>f.stayId===stay.id);
 const [uploading,setUploading]=useState(0),[error,setError]=useState('');
 const pick=async(e:ChangeEvent<HTMLInputElement>)=>{
  const chosen=[...(e.target.files??[])];e.target.value='';if(!chosen.length)return;
  if(!navigator.onLine){setError('Attaching files needs a connection.');return;}
  const tooBig=chosen.find(f=>f.size>10_000_000);if(tooBig){setError(`${tooBig.name} is larger than 10 MB.`);return;}
  setError('');setUploading(chosen.length);
  try{for(const file of chosen)await api.file(trip.id,stay.id,file);await onChanged();}
  catch(err){setError(err instanceof Error?err.message:'The file could not be attached.');}
  finally{setUploading(0);}
 };
 const remove=async(id:string,name:string)=>{if(!window.confirm(`Remove ${name}?`))return;try{await api.deleteFile(trip.id,id);await onChanged();}catch(err){setError(err instanceof Error?err.message:'Could not remove it.');}};
 return <fieldset className="stay-files"><legend>Files</legend>
  {files.length>0&&<ul className="file-list">{files.map(f=><li key={f.id}><a href={fileUrl(trip.id,f.id)} download={f.name}><FileText size={16}/><span><strong>{f.name}</strong><small>{size(f.size)} · added by {f.author}</small></span></a>
   {(organizer||f.authorId===userId)&&<button type="button" className="icon-button subtle" aria-label={`Remove ${f.name}`} onClick={()=>void remove(f.id,f.name)}><Trash2 size={15}/></button>}</li>)}</ul>}
  {uploading?<p className="helper" role="status">Attaching {uploading} file{uploading===1?'':'s'}…</p>
   :<label className="btn btn-secondary photo-add"><Paperclip size={16}/> Attach files<input type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp,text/plain,.pdf,.txt" onChange={pick}/></label>}
  {!files.length&&!uploading&&<p className="helper">Booking confirmation, directions, house rules: PDF, images or text, up to 10 MB each.</p>}
  {error&&<p className="form-error" role="alert">{error}</p>}
 </fieldset>;
}
