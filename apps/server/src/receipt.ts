import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import type {Trip} from '../../../packages/domain/src/model.js';
import type {Store} from './store.js';
const extracted=z.object({merchant:z.string().max(160),date:z.string().max(20),total:z.number().finite(),items:z.array(z.object({label:z.string().min(1).max(300),amount:z.number().finite()})).max(500)});
/** Receipts print dates as 02.10.2026, 02/10/26 or 2026-10-02; the app stores ISO dates. Returns '' when unsure. */
export function normalizeReceiptDate(value:string):string{
 const text=value.trim();
 let y:number,m:number,d:number;
 const iso=text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/),eu=text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})\b/);
 if(iso){y=+iso[1];m=+iso[2];d=+iso[3];}else if(eu){d=+eu[1];m=+eu[2];y=eu[3].length===2?2000+ +eu[3]:+eu[3];}else return '';
 const date=new Date(Date.UTC(y,m-1,d));
 if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)return '';
 return date.toISOString().slice(0,10);
}
export function resetInterruptedReceipts(store:Store){for(const row of store.db.prepare('SELECT id,data FROM trips').all() as {id:string;data:string}[]){const trip:Trip=JSON.parse(row.data);let changed=false;for(const receipt of trip.receipts)if(receipt.status==='processing'){receipt.status='queued';receipt.version++;changed=true;}if(changed)store.db.prepare('UPDATE trips SET data=? WHERE id=?').run(JSON.stringify(trip),trip.id);}}
export function claimReceipt(store:Store):{tripId:string;receiptId:string}|null{
 const rows=store.db.prepare('SELECT id,data FROM trips').all() as {id:string;data:string}[];
 for(const row of rows){const trip:Trip=JSON.parse(row.data);const receipt=trip.receipts.find(r=>r.status==='queued');if(receipt){receipt.status='processing';receipt.version++;store.db.prepare('UPDATE trips SET data=? WHERE id=?').run(JSON.stringify(trip),row.id);return {tripId:row.id,receiptId:receipt.id};}}
 return null;
}
export async function processReceipt(store:Store,dataDir:string,url:string,model:string,job:{tripId:string;receiptId:string},fetcher:typeof fetch=fetch){
 const row=store.db.prepare('SELECT data FROM trips WHERE id=?').get(job.tripId) as {data:string}|undefined;if(!row)return;
 try{
  const image=await readFile(join(dataDir,'receipts',job.tripId,`${job.receiptId}.jpg`));
  const response=await fetcher(`${url.replace(/\/$/,'')}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(300_000),body:JSON.stringify({model,stream:false,think:false,options:{temperature:0},format:{type:'object',properties:{merchant:{type:'string'},date:{type:'string'},total:{type:'number'},items:{type:'array',items:{type:'object',properties:{label:{type:'string'},amount:{type:'number'}},required:['label','amount']}}},required:['merchant','date','total','items']},messages:[{role:'user',content:'Transcribe this shopping receipt faithfully. Return item prices and the final total in euros as numbers. Give the purchase date as YYYY-MM-DD, or an empty string if it is not printed. Do not invent unreadable items. Discounts and deposit refunds are negative line items. Return JSON only.',images:[image.toString('base64')]}]})});
  if(!response.ok)throw new Error(`Vision service returned ${response.status}`);
  const envelope=await response.json() as any;const parsed=extracted.parse(JSON.parse(envelope.message?.content??'{}'));
  const fresh=store.db.prepare('SELECT data FROM trips WHERE id=?').get(job.tripId) as {data:string}|undefined;if(!fresh)return;const trip:Trip=JSON.parse(fresh.data),receipt=trip.receipts.find(r=>r.id===job.receiptId);if(!receipt||receipt.status!=='processing')return;
  receipt.merchant=parsed.merchant;receipt.date=normalizeReceiptDate(parsed.date);receipt.total=Math.round(parsed.total*100);receipt.items=parsed.items.map(i=>({label:i.label,amount:Math.round(i.amount*100)}));receipt.status='review';receipt.error=null;receipt.version++;trip.version++;store.db.prepare('UPDATE trips SET data=? WHERE id=?').run(JSON.stringify(trip),trip.id);
 }catch(error){const latest=store.db.prepare('SELECT data FROM trips WHERE id=?').get(job.tripId) as {data:string}|undefined;if(!latest)return;const trip:Trip=JSON.parse(latest.data),receipt=trip.receipts.find(r=>r.id===job.receiptId);if(receipt&&receipt.status==='processing'){receipt.status='failed';receipt.error=error instanceof Error?error.message:'Extraction failed';receipt.version++;trip.version++;store.db.prepare('UPDATE trips SET data=? WHERE id=?').run(JSON.stringify(trip),trip.id);}}
}
