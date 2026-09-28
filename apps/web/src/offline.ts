import Dexie,{type Table} from 'dexie';
import type {Command,TripView} from '../../../packages/domain/src/model.js';
import {api,ApiError} from './api.js';
import {overlay} from './overlay.js';
/** conflict: someone changed the item first. rejected: the server refused the change (e.g. it depends on a change that was itself refused). */
export type Pending={id:string;tripId:string;command:Command;state:'pending'|'conflict'|'rejected';error?:string;seq?:number};
class OfflineDb extends Dexie{
 snapshots!:Table<{id:string;view:TripView},string>;
 outbox!:Table<Pending,string>;
 photos!:Table<{id:string;tripId:string;file:File},string>;
 constructor(){super('splitfairy');this.version(1).stores({snapshots:'id',outbox:'id,tripId,state'});this.version(2).stores({snapshots:'id',outbox:'id,tripId,state',photos:'id,tripId'});this.version(3).stores({snapshots:'id',outbox:'id,tripId,state,seq',photos:'id,tripId'});}
}
export const localDb=new OfflineDb();
export class SessionExpired extends Error{constructor(){super('Please sign in again to sync your changes.');}}
let lastSeq=0,rejectedPhotos=0;
/** Photos dropped because the server refused them since the last call; lets the UI tell the user once. */
export function takeRejectedPhotos(){const n=rejectedPhotos;rejectedPhotos=0;return n;}
/** Everything still only on this device, across all trips. */
export async function unsyncedCount(){return (await localDb.outbox.count())+(await localDb.photos.count());}
/** Shrinks camera photos before storing or sending them: receipts stay legible at 2000px. */
export async function shrinkPhoto(file:File):Promise<File>{
 try{
  const bitmap=await createImageBitmap(file);const scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height));
  const canvas=new OffscreenCanvas(Math.round(bitmap.width*scale),Math.round(bitmap.height*scale));
  canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const blob=await canvas.convertToBlob({type:'image/jpeg',quality:.85});
  return new File([blob],file.name.replace(/\.\w+$/,'')+'.jpg',{type:'image/jpeg'});
 }catch{return file;}
}
/** Monotonic ordering key so offline edits replay in the order they were made (IDs are random UUIDs). */
export function nextSeq(now=Date.now()){lastSeq=Math.max(now*1000,lastSeq+1);return lastSeq;}
export function replayOrder<T extends {seq?:number}>(entries:T[]):T[]{return [...entries].sort((a,b)=>(a.seq??0)-(b.seq??0));}
/** Decide what a failed replay means for the queue: keep for later, park for review, or stop because the session ended. */
export function classifyFailure(error:unknown):'retry-later'|'conflict'|'rejected'|'signed-out'{
 if(!(error instanceof ApiError))return 'retry-later';
 if(error.status===401)return 'signed-out';
 if(error.status===409)return 'conflict';
 if(error.status===408||error.status===429||error.status>=500)return 'retry-later';
 return 'rejected';
}
export async function cachedTrip(id:string){return (await localDb.snapshots.get(id))?.view??null;}
export async function saveTrip(view:TripView){await localDb.snapshots.put({id:view.trip.id,view});}
export async function queue(tripId:string,command:Command){await localDb.outbox.put({id:command.mutationId,tripId,command,state:'pending',seq:nextSeq()});}
export async function pendingFor(tripId:string){return replayOrder(await localDb.outbox.where('tripId').equals(tripId).toArray());}
export async function queuePhoto(tripId:string,file:File){await localDb.photos.put({id:crypto.randomUUID(),tripId,file});}
export async function photoCount(tripId:string){return localDb.photos.where('tripId').equals(tripId).count();}
const running=new Map<string,Promise<TripView>>();
/** Replays queued photos and edits, then returns the server state with anything still unsynced laid over it. */
export function syncTrip(tripId:string):Promise<TripView>{
 const active=running.get(tripId);if(active)return active;
 const work=replay(tripId).finally(()=>running.delete(tripId));running.set(tripId,work);return work;
}
async function replay(tripId:string):Promise<TripView>{
 try{
  const photos=await localDb.photos.where('tripId').equals(tripId).toArray();
  for(const photo of photos){
   try{await api.receipt(tripId,photo.file,photo.id);await localDb.photos.delete(photo.id);}
   // A photo the server refuses (unreadable, too large) must not hold back every later edit.
   catch(error){if(classifyFailure(error)!=='rejected')throw error;await localDb.photos.delete(photo.id);rejectedPhotos++;}
  }
  for(const entry of await pendingFor(tripId)){
   if(entry.state!=='pending')continue;
   try{const view=await api.command(tripId,entry.command);await saveTrip(view);await localDb.outbox.delete(entry.id);}
   catch(error){
    const outcome=classifyFailure(error);
    if(outcome==='conflict'||outcome==='rejected'){await localDb.outbox.update(entry.id,{state:outcome,error:(error as Error).message});continue;}
    throw error;
   }
  }
  const latest=await api.trip(tripId);await saveTrip(latest);
  return {...latest,trip:overlay(latest.trip,(await pendingFor(tripId)).filter(e=>e.state==='pending').map(e=>e.command))};
 }catch(error){if(classifyFailure(error)==='signed-out')throw new SessionExpired();throw error;}
}
export async function clearOffline(){await localDb.transaction('rw',localDb.snapshots,localDb.outbox,localDb.photos,async()=>{await localDb.snapshots.clear();await localDb.outbox.clear();await localDb.photos.clear();});}
