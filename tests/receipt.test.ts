import {it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp, mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../apps/server/src/store.js';
import {claimReceipt,processReceipt} from '../apps/server/src/receipt.js';
it('keeps extracted items in review and never posts an expense',async()=>{
 const store=new Store(new DatabaseSync(':memory:'));
 const user={id:'u',email:'a@example.com',name:'A',admin:true};store.addUser(user);
 const trip=store.createTrip(user,'Italy','2026-10-01','2026-10-03');trip.receipts.push({id:'r',status:'queued',items:[],total:null,merchant:'',date:'',error:null,version:1,authorId:'u'});
 store.db.prepare('UPDATE trips SET data=? WHERE id=?').run(JSON.stringify(trip),trip.id);
 const dir=await mkdtemp(join(tmpdir(),'splitfairy-receipt-'));await mkdir(join(dir,'receipts',trip.id),{recursive:true});await writeFile(join(dir,'receipts',trip.id,'r.jpg'),Buffer.from([1,2,3]));
 const job=claimReceipt(store)!;
 await processReceipt(store,dir,'http://ollama.local:11434','gemma4:26b-mlx',job,async(_url,init)=>{
  const payload=JSON.parse(String(init?.body));expect(payload.messages[0].images).toHaveLength(1);expect(payload.model).toBe('gemma4:26b-mlx');
  return new Response(JSON.stringify({message:{content:JSON.stringify({merchant:'Shop',date:'2026-10-01',total:10.5,items:[{label:'Eggs',amount:10.5}]})}}),{status:200});
 });
 const result=store.getTrip(user,trip.id);
 expect(result.receipts[0]).toMatchObject({status:'review',merchant:'Shop',total:1050,items:[{label:'Eggs',amount:1050}]});
 expect(result.expenses).toHaveLength(0);
});
it('normalizes printed receipt dates to ISO and drops impossible ones',async()=>{
 const {normalizeReceiptDate}=await import('../apps/server/src/receipt.js');
 expect(normalizeReceiptDate('02.10.2026')).toBe('2026-10-02');
 expect(normalizeReceiptDate('2/10/26 18:42')).toBe('2026-10-02');
 expect(normalizeReceiptDate('2026-10-02')).toBe('2026-10-02');
 expect(normalizeReceiptDate('31.02.2026')).toBe('');
 expect(normalizeReceiptDate('')).toBe('');
});
