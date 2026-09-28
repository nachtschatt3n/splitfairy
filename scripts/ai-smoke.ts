// Real receipt-extraction check against the private Ollama endpoint. Not part of CI.
// Usage: OLLAMA_URL=http://192.168.30.111:11434 OLLAMA_MODEL=gemma4:26b-mlx npm run smoke:ai
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {Store} from '../apps/server/src/store.js';
import {claimReceipt,processReceipt} from '../apps/server/src/receipt.js';
const url=process.env.OLLAMA_URL??'http://192.168.30.111:11434',model=process.env.OLLAMA_MODEL??'gemma4:26b-mlx';
const lines=[['Spaghetti 500g','1,29'],['Passata 700g','0,99'],['Parmigiano 200g','4,49'],['Sonnencreme LSF50','8,95'],['Pfand','-0,25']];
const expected={total:1547,items:lines.map(([,a])=>Math.round(Number(a.replace(',','.'))*100))};
const rows=lines.map(([l,a],i)=>`<text x="40" y="${190+i*44}">${l}</text><text x="560" y="${190+i*44}" text-anchor="end">${a}</text>`).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="560"><rect width="100%" height="100%" fill="#fbfaf5"/><g font-family="Courier New, monospace" font-size="26" fill="#222"><text x="300" y="60" text-anchor="middle" font-size="34">COOP SUPERMARKT</text><text x="300" y="100" text-anchor="middle">02.10.2026 18:42</text>${rows}<text x="40" y="470" font-size="30">SUMME EUR</text><text x="560" y="470" text-anchor="end" font-size="30">15,47</text></g></svg>`;
const dir=await mkdtemp(join(tmpdir(),'splitfairy-smoke-'));
const store=new Store(new DatabaseSync(':memory:'));
const user={id:'u',email:'smoke@example.com',name:'Smoke',admin:true};store.addUser(user);
const trip=store.createTrip(user,'Smoke','2026-10-01','2026-10-05');
trip.receipts.push({id:'r',status:'queued',items:[],total:null,merchant:'',date:'',error:null,version:1,authorId:'u'});
store.db.prepare('UPDATE trips SET data=? WHERE id=?').run(JSON.stringify(trip),trip.id);
await mkdir(join(dir,'receipts',trip.id),{recursive:true});
await writeFile(join(dir,'receipts',trip.id,'r.jpg'),await sharp(Buffer.from(svg)).jpeg({quality:85}).toBuffer());
const started=Date.now();
await processReceipt(store,dir,url,model,claimReceipt(store)!);
const receipt=store.getTrip(user,trip.id).receipts[0];
console.log(JSON.stringify({model,seconds:Math.round((Date.now()-started)/100)/10,receipt},null,1));
const ok=receipt.status==='review'&&receipt.date==='2026-10-02'&&receipt.total===expected.total&&receipt.items.length===expected.items.length&&receipt.items.every((item,i)=>item.amount===expected.items[i]);
console.log(ok?'AI smoke check passed':'AI smoke check FAILED: extraction did not match the synthetic receipt');
process.exit(ok?0:1);
