// Receipt-reading quality check against the private Ollama endpoint, with realistic synthetic receipts. Not part of CI.
// Usage: OLLAMA_URL=http://192.168.30.111:11434 OLLAMA_MODEL=gemma4:26b-mlx npx tsx scripts/ai-eval.ts
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {Store} from '../apps/server/src/store.js';
import {claimReceipt,processReceipt} from '../apps/server/src/receipt.js';

const url=process.env.OLLAMA_URL??'http://192.168.30.111:11434',model=process.env.OLLAMA_MODEL??'gemma4:26b-mlx';
const out=process.env.EVAL_DIR??await mkdtemp(join(tmpdir(),'splitfairy-eval-'));
type Case={name:string;merchant:string;date:string;lines:string[];items:number[];total:number;photo?:boolean;tilt?:number};
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
/** A thermal-paper receipt: monospace text lines, 40 characters wide. */
function receiptSvg(lines:string[]){
 const h=80+lines.length*30;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="${h}"><rect width="100%" height="100%" fill="#fbfaf3"/><g font-family="Courier New, monospace" font-size="21" fill="#262626">${lines.map((l,i)=>`<text x="24" y="${50+i*30}" xml:space="preserve">${esc(l)}</text>`).join('')}</g></svg>`;
}
const row=(label:string,amount:string,width=40)=>`${label}${' '.repeat(Math.max(1,width-label.length-amount.length))}${amount}`;

const cases:Case[]=[
 {name:'Pingo Doce (PT supermarket, quantities, discount, IVA)',merchant:'Pingo Doce',date:'2026-10-02',
  lines:['          PINGO DOCE','   Dist. Alimentar S.A.  NIF 500829993','     Loja Lisboa - Rua Augusta','',
   row('PAO CARCACA','1,20'),row('2 X 1,29  AGUA LUSO 1.5L','2,58'),row('SARDINHA FRESCA KG','9,90'),row('LIMAO KG','1,35'),
   row('VINHO VERDE GAZELA','4,49'),row('AZEITE GALLO 750ML','7,99'),row('QUEIJO FRESCO','1,79'),row('TOMATE CHUCHA KG','2,14'),
   row('BATATA DOCE KG','1,87'),row('PROT SOLAR SPF50','12,99'),row('  DESCONTO CARTAO','-1,30'),row('CAFE DELTA 250G','3,49'),
   row('GELADO OLA','4,99'),'',row('TOTAL','53,48'),row('MULTIBANCO','53,48'),'',
   'IVA  6%  base 34,17  iva 2,05','IVA 23%  base 14,03  iva 3,23','','02-10-2026 18:42   OP 014  TR 3381'],
  items:[120,258,990,135,449,799,179,214,187,1299,-130,349,499],total:5348},
 {name:'REWE (DE supermarket, Pfand, MwSt, SUMME)',merchant:'REWE',date:'2026-10-03',
  lines:['            R E W E','      Markt GmbH  Leopoldstr. 44','          80802 München','',
   row('Brezel 4 St.','1,96 B'),row('Weissbier 0,5l','1,29 A'),row('Pfand','0,08 A'),row('Leberkäse 200g','2,79 B'),
   row('Obatzda','2,49 B'),row('Radieschen','0,99 B'),row('Sonnenmilch LSF30','5,95 A'),'----------------------------------------',
   row('SUMME EUR','15,55'),row('Geg. EC-Karte EUR','15,55'),'','Steuer %   Netto   Steuer  Brutto','A= 19,0%   6,20    1,18    7,32','B=  7,0%   7,69    0,54    8,23','',
   '03.10.26  12:07  Bon-Nr.:4411  Markt:0421'],
  items:[196,129,8,279,249,99,595],total:1555},
 {name:'Tasca do Chico (restaurant bill, cover, multiples)',merchant:'Tasca do Chico',date:'2026-10-02',
  lines:['        TASCA DO CHICO','  Rua do Diario de Noticias 39','        1200-141 Lisboa','','Mesa 7     Pessoas 8',
   row('8 COUVERT','12,00'),row('3 PATANISCAS','20,70'),row('2 POLVO A LAGAREIRO','43,00'),row('4 BACALHAU A BRAS','52,00'),
   row('1 SALADA MISTA','5,50'),row('2 JARRO VINHO CASA','24,00'),row('6 AGUA 0.5L','9,00'),row('5 CAFE','5,00'),'',
   row('Total a pagar','171,20'),'','IVA incluido a taxa em vigor','Data: 2026/10/02  22:51'],
  items:[1200,2070,4300,5200,550,2400,900,500],total:17120},
];
cases.push({...cases[0],name:'Pingo Doce as a phone photo (1.5° tilt, on a table, blurred, JPEG 60)',photo:true,tilt:-1.5});
cases.push({...cases[0],name:'Pingo Doce as a phone photo (3.5° tilt, on a table, blurred, JPEG 60)',photo:true,tilt:-3.5});

async function image(c:Case){
 const png=await sharp(Buffer.from(receiptSvg(c.lines))).png().toBuffer();
 if(!c.photo)return sharp(png).jpeg({quality:85}).toBuffer();
 // Like a phone photo: slightly rotated on a wooden table, soft focus, strong JPEG compression.
 const rotated=await sharp(png).rotate(c.tilt??-3.5,{background:{r:120,g:84,b:52,alpha:1}}).toBuffer();
 const meta=await sharp(rotated).metadata();
 return sharp({create:{width:meta.width!+160,height:meta.height!+200,channels:3,background:{r:120,g:84,b:52}}})
  .composite([{input:rotated,left:80,top:100}]).modulate({brightness:.92}).blur(.9).resize({width:900}).jpeg({quality:60}).toBuffer();
}

const results=[];
for(const c of cases){
 const store=new Store(new DatabaseSync(':memory:'));const user={id:'u',email:'eval@example.com',name:'Eval',admin:true};store.addUser(user);
 const trip=store.createTrip(user,'Eval','2026-10-01','2026-10-08');
 trip.receipts.push({id:'r',status:'queued',items:[],total:null,merchant:'',date:'',error:null,version:1,authorId:'u'});
 store.db.prepare('UPDATE trips SET data=? WHERE id=?').run(JSON.stringify(trip),trip.id);
 await mkdir(join(out,'receipts',trip.id),{recursive:true});
 const jpeg=await image(c);await writeFile(join(out,'receipts',trip.id,'r.jpg'),jpeg);await writeFile(join(out,`${c.name.split(' ')[0]}${c.photo?`-photo${Math.abs(c.tilt??0)}`:''}.jpg`),jpeg);
 const started=Date.now();
 await processReceipt(store,out,url,model,claimReceipt(store)!);
 const r=store.getTrip(user,trip.id).receipts[0],seconds=Math.round((Date.now()-started)/100)/10;
 const got=r.items.map(i=>i.amount),matched=c.items.filter(a=>got.includes(a)).length;
 const score={merchant:r.merchant.toLowerCase().includes(c.merchant.toLowerCase().split(' ')[0]),date:r.date===c.date,total:r.total===c.total,
  itemCount:`${r.items.length}/${c.items.length}`,amountsFound:`${matched}/${c.items.length}`,itemsAddUp:got.reduce((a,b)=>a+b,0)===r.total};
 results.push({case:c.name,seconds,status:r.status,score,read:{merchant:r.merchant,date:r.date,total:r.total,items:r.items}});
 console.log(`${c.name}: ${seconds}s`,JSON.stringify(score));
}
console.log(JSON.stringify({model,images:out,results},null,1));
