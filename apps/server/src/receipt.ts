import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import sharp from 'sharp';
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
const FORMAT={type:'object',properties:{merchant:{type:'string'},date:{type:'string'},total:{type:'number'},items:{type:'array',items:{type:'object',properties:{label:{type:'string'},amount:{type:'number'}},required:['label','amount']}}},required:['merchant','date','total','items']};
const PROMPT=[
 'Transcribe this shopping receipt faithfully, line by line from top to bottom.',
 'Each item is one printed line: its label and the price printed at the right end of that same line. Never move a price to another line.',
 'The photo may be tilted: follow each printed line along its slant to find its price, which can then sit higher or lower than the label.',
 'Only purchased items, discounts and deposits are items. Do not list subtotal, total, payment, change or tax-summary lines as items.',
 'A deposit charge (Pfand, deposito) is a positive item; only a deposit return (Leergut, Pfandrückgabe) or a discount is negative.',
 'Return prices and the final total in euros as numbers. Give the purchase date as YYYY-MM-DD, or an empty string if it is not printed.',
 'Do not invent unreadable items. Return JSON only.'].join(' ');
type Reading=z.infer<typeof extracted>;
const cents=(n:number)=>Math.round(n*100);
const gap=(r:Reading)=>Math.abs(r.items.reduce((sum,i)=>sum+cents(i.amount),0)-cents(r.total));

/** Asks the vision model; a second message can show it its first answer and what does not add up. */
async function ask(url:string,model:string,images:Buffer[],fetcher:typeof fetch,previous?:Reading){
 // A long receipt comes in several photos, top to bottom, that may overlap.
 const parts=images.length>1?`This receipt was photographed in ${images.length} parts, given in order from top to bottom. Read them as one receipt; where the photos overlap, a line that appears in two photos is listed only once. `:'';
 const messages:any[]=[{role:'user',content:parts+PROMPT,images:images.map(i=>i.toString('base64'))}];
 if(previous){
  const sum=previous.items.reduce((n,i)=>n+cents(i.amount),0)/100;
  messages.push({role:'assistant',content:JSON.stringify(previous)},{role:'user',content:`Your items add up to ${sum.toFixed(2)} but the total is ${previous.total.toFixed(2)}. Look at the receipt again line by line: pair every label with the price on its own line, check the sign of discounts and deposits, and leave out total and payment lines. Return the corrected JSON only.`});
 }
 const response=await fetcher(`${url.replace(/\/$/,'')}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(300_000),body:JSON.stringify({model,stream:false,think:false,options:{temperature:0},format:FORMAT,messages})});
 if(!response.ok)throw new Error(`Vision service returned ${response.status}`);
 const envelope=await response.json() as any;return extracted.parse(JSON.parse(envelope.message?.content??'{}'));
}

/** Where page `n` (from 1) of a receipt's photos is stored. */
export const receiptPage=(dataDir:string,tripId:string,receiptId:string,n:number)=>join(dataDir,'receipts',tripId,n<=1?`${receiptId}.jpg`:`${receiptId}.p${n}.jpg`);
export const MAX_RECEIPT_PAGES=8;

/** Greyscale, stretched contrast and a little sharpening help the model read phone photos; the stored photo is untouched. */
async function forModel(image:Buffer){try{return await sharp(image).rotate().grayscale().normalize().sharpen({sigma:1}).jpeg({quality:90}).toBuffer();}catch{return image;}}

export async function processReceipt(store:Store,dataDir:string,url:string,model:string,job:{tripId:string;receiptId:string},fetcher:typeof fetch=fetch){
 const row=store.db.prepare('SELECT data FROM trips WHERE id=?').get(job.tripId) as {data:string}|undefined;if(!row)return;
 try{
  const pages=Math.max(1,JSON.parse(row.data).receipts?.find((r:{id:string})=>r.id===job.receiptId)?.pages??1);
  const image=await Promise.all(Array.from({length:pages},async(_,i)=>forModel(await readFile(receiptPage(dataDir,job.tripId,job.receiptId,i+1)))));
  let parsed=await ask(url,model,image,fetcher);
  // Items that do not add up to the total usually mean a misread line: one self-check, kept only if it is closer.
  if(gap(parsed)>0){try{const second=await ask(url,model,image,fetcher,parsed);if(gap(second)<gap(parsed))parsed=second;}catch{/* keep the first reading */}}
  const fresh=store.db.prepare('SELECT data FROM trips WHERE id=?').get(job.tripId) as {data:string}|undefined;if(!fresh)return;const trip:Trip=JSON.parse(fresh.data),receipt=trip.receipts.find(r=>r.id===job.receiptId);if(!receipt||receipt.status!=='processing')return;
  receipt.merchant=parsed.merchant;receipt.date=normalizeReceiptDate(parsed.date);receipt.total=Math.round(parsed.total*100);receipt.items=parsed.items.map(i=>({label:i.label,amount:Math.round(i.amount*100)}));receipt.status='review';receipt.error=null;receipt.version++;trip.version++;store.db.prepare('UPDATE trips SET data=? WHERE id=?').run(JSON.stringify(trip),trip.id);
 }catch(error){const latest=store.db.prepare('SELECT data FROM trips WHERE id=?').get(job.tripId) as {data:string}|undefined;if(!latest)return;const trip:Trip=JSON.parse(latest.data),receipt=trip.receipts.find(r=>r.id===job.receiptId);if(receipt&&receipt.status==='processing'){receipt.status='failed';receipt.error=error instanceof Error?error.message:'Extraction failed';receipt.version++;trip.version++;store.db.prepare('UPDATE trips SET data=? WHERE id=?').run(JSON.stringify(trip),trip.id);}}
}
