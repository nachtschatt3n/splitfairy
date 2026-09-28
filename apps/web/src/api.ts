import type {Command,Trip,TripView,User} from '../../../packages/domain/src/model.js';
export class ApiError extends Error{constructor(message:string,public status:number){super(message);}}
async function request<T>(path:string,init:RequestInit={}):Promise<T>{
 const response=await fetch(`/api/v1${path}`,{credentials:'same-origin',headers:{'Content-Type':'application/json',...init.headers},...init});
 const result=await response.json().catch(()=>({error:'Invalid response'}));
 if(!response.ok)throw new ApiError(result.error??'Request failed',response.status);
 return result as T;
}
export const api={
 me:()=>request<User|null>('/me'),
 requestCode:(email:string)=>request<{ok:boolean}>('/auth/request',{method:'POST',body:JSON.stringify({email})}),
 verify:(email:string,code:string,name:string)=>request<User>('/auth/verify',{method:'POST',body:JSON.stringify({email,code,name})}),
 logout:()=>request('/auth/logout',{method:'POST'}),
 trips:()=>request<Pick<Trip,'id'|'name'|'start'|'end'|'archived'>[]>('/trips'),
 createTrip:(name:string,start:string,end:string)=>request<Trip>('/trips',{method:'POST',body:JSON.stringify({name,start,end})}),
 trip:(id:string)=>request<TripView>(`/trips/${id}`),
 command:(id:string,command:Command)=>request<TripView>(`/trips/${id}/commands`,{method:'POST',body:JSON.stringify(command)}),
 invite:(id:string,email:string,role:'member'|'organizer')=>request<{ok:boolean}>(`/trips/${id}/invites`,{method:'POST',body:JSON.stringify({email,role})}),
 receiptAction:(id:string,receiptId:string,action:'retry'|'dismiss')=>request<TripView>(`/trips/${id}/receipts/${receiptId}/${action}`,{method:'POST',body:'{}'}),
 receipt:async(id:string,file:File,uploadId?:string)=>{const image=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});return request<{id:string}>(`/trips/${id}/receipts`,{method:'POST',body:JSON.stringify({image,uploadId})});},
};
