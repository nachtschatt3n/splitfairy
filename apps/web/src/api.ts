import type {Command,Member,Photo,StayFile,Trip,TripView,User} from '../../../packages/domain/src/model.js';
export type AccessToken={id:string;name:string;prefix:string;createdAt:string;lastUsedAt:string|null};
export class ApiError extends Error{constructor(message:string,public status:number){super(message);}}
async function request<T>(path:string,init:RequestInit={},timeoutMs=15_000):Promise<T>{
 // A request must never hang the app (seen on iOS Safari): time out and let callers treat it as offline.
 const response=await fetch(`/api/v1${path}`,{credentials:'same-origin',headers:init.body?{'Content-Type':'application/json',...init.headers}:{...init.headers},signal:AbortSignal.timeout(timeoutMs),...init});
 const result=await response.json().catch(()=>({error:'Invalid response'}));
 if(!response.ok)throw new ApiError(result.error??'Request failed',response.status);
 return result as T;
}
const base64=(file:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
/** Where a place photo is served; thumbnails are 480×360. */
/** Download link for a stay document (served as an attachment). */
export const fileUrl=(tripId:string,fileId:string)=>`/api/v1/trips/${tripId}/files/${fileId}`;
export const photoUrl=(tripId:string,photoId:string,thumb=false)=>`/api/v1/trips/${tripId}/photos/${photoId}${thumb?'?size=thumb':''}`;
export const api={
 me:()=>request<User|null>('/me'),
 requestCode:(email:string)=>request<{ok:boolean}>('/auth/request',{method:'POST',body:JSON.stringify({email})}),
 verify:(email:string,code:string,name?:string)=>request<User&{isNew?:boolean}>('/auth/verify',{method:'POST',body:JSON.stringify({email,code,...(name?{name}:{})})}),
 rename:(name:string)=>request<User>('/me',{method:'PUT',body:JSON.stringify({name})}),
 logout:()=>request('/auth/logout',{method:'POST'}),
 trips:()=>request<(Pick<Trip,'id'|'name'|'start'|'end'|'archived'|'theme'>&{cover?:string|null})[]>('/trips'),
 createTrip:(name:string,start:string,end:string,theme?:string)=>request<Trip>('/trips',{method:'POST',body:JSON.stringify({name,start,end,theme})}),
 trip:(id:string)=>request<TripView>(`/trips/${id}`),
 command:(id:string,command:Command)=>request<TripView>(`/trips/${id}/commands`,{method:'POST',body:JSON.stringify(command)}),
 invite:(id:string,email:string,role:'member'|'organizer')=>request<{ok:boolean}>(`/trips/${id}/invites`,{method:'POST',body:JSON.stringify({email,role})}),
 deleteTrip:(id:string)=>request<{ok:boolean}>(`/trips/${id}`,{method:'DELETE'}),
 removeMember:(id:string,email:string)=>request<{members:Member[]}>(`/trips/${id}/members/${encodeURIComponent(email)}`,{method:'DELETE'}),
 setRole:(id:string,email:string,role:'organizer'|'member')=>request<{members:Member[]}>(`/trips/${id}/members/${encodeURIComponent(email)}`,{method:'PUT',body:JSON.stringify({role})}),
 receiptAction:(id:string,receiptId:string,action:'retry'|'dismiss')=>request<TripView>(`/trips/${id}/receipts/${receiptId}/${action}`,{method:'POST',body:'{}'}),
 places:(q:string)=>request<{name:string;address:string}[]>(`/places?q=${encodeURIComponent(q)}`,{},10_000),
 tokens:()=>request<AccessToken[]>('/me/tokens'),
 createToken:(name:string)=>request<AccessToken&{token:string}>('/me/tokens',{method:'POST',body:JSON.stringify({name})}),
 revokeToken:(id:string)=>request<{ok:boolean}>(`/me/tokens/${id}`,{method:'DELETE'}),
 file:async(id:string,stayId:string,file:File)=>request<StayFile>(`/trips/${id}/files`,{method:'POST',body:JSON.stringify({stayId,name:file.name,data:await base64(file)})},90_000),
 deleteFile:(id:string,fileId:string)=>request<TripView>(`/trips/${id}/files/${fileId}`,{method:'DELETE'}),
 photo:async(id:string,target:{stayId?:string;eventId?:string},file:File,uploadId:string)=>request<Photo>(`/trips/${id}/photos`,{method:'POST',body:JSON.stringify({image:await base64(file),...target,uploadId})},90_000),
 deletePhoto:(id:string,photoId:string)=>request<TripView>(`/trips/${id}/photos/${photoId}`,{method:'DELETE'}),
 receipt:async(id:string,file:File,uploadId?:string)=>{const image=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});return request<{id:string}>(`/trips/${id}/receipts`,{method:'POST',body:JSON.stringify({image,uploadId})},120_000);},
};
