// Regenerates the README screenshots from the production build with an example trip.
// Usage: npm run build && npm run screenshots   (writes docs/screenshots/*.png)
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {chromium,webkit,devices} from '@playwright/test';
import sharp from 'sharp';

const out=resolve('docs/screenshots');mkdirSync(out,{recursive:true});
const data=mkdtempSync(join(tmpdir(),'splitfairy-shots-'));
const env={...process.env,NODE_ENV:'test',PORT:'3190',DATA_DIR:data,MAIL_CAPTURE_DIR:join(data,'mail'),ADMIN_EMAIL:'ana@example.com',AUTH_SECRET:'screenshots-secret-that-is-long-enough-000',OLLAMA_URL:'http://127.0.0.1:3191',OLLAMA_MODEL:'fake-vision',LOG_LEVEL:'warn',AUTH_RATE_LIMIT_FACTOR:'100'};
const ollama=spawn(process.execPath,['tests/e2e/fake-ollama.mjs','3191'],{stdio:'inherit'});
const server=spawn(process.execPath,['dist/server/apps/server/src/index.js'],{env,stdio:'inherit'});
const base='http://127.0.0.1:3190';
for(let i=0;i<50;i++){try{if((await fetch(`${base}/readyz`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
const day=n=>{const d=new Date(Date.now()+n*86400_000);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};

async function signedInContext(browser,options){
 const context=await browser.newContext({...options,locale:'en-GB',timezoneId:'Europe/Lisbon'});
 const code=execFileSync(process.execPath,['dist/server/scripts/signin-code.js','ana@example.com'],{env,encoding:'utf8'}).match(/\b\d{6}\b/)[0];
 const res=await context.request.post(`${base}/api/v1/auth/verify`,{data:{email:'ana@example.com',code,name:'Ana'}});
 if(!res.ok())throw new Error(await res.text());
 return context;
}

async function seed(request){
 const api=async(path,body)=>{const r=await request.post(`${base}/api/v1${path}`,{data:body});if(!r.ok())throw new Error(`${path}: ${await r.text()}`);return r.json();};
 const trip=await api('/trips',{name:'Summer in Portugal',start:day(-2),end:day(7),theme:'coast'});
 const save=(entity,value)=>api(`/trips/${trip.id}/commands`,{mutationId:crypto.randomUUID(),entity,action:'save',expectedVersion:0,value:{version:0,...value}});
 for(const [id,name,solo] of [['S','Silva',false],['W','Weber',false],['R','Rossi',false],['L','Lena',true]])await save('family',{id,name,solo});
 const people=[['ana','Ana','S',1,'ana@example.com'],['tiago','Tiago','S',1,''],['ines','Inês','S',.5,''],['ben','Ben','W',1,'ben@example.com'],['mia','Mia','W',1,''],['noah','Noah','W',.25,''],['giulia','Giulia','R',1,''],['marco','Marco','R',1,''],['lena','Lena','L',1,'']];
 for(const [id,name,familyId,weight,email] of people)await save('person',{id,name,familyId,weight,email});
 const all=people.map(p=>({id:p[0],weight:p[3]}));
 await save('event',{id:'dinner',title:'Grilled sardines on the terrace',date:day(0),time:'20:00',kind:'dinner',owner:'Tiago',notes:'',participants:all});
 await save('event',{id:'surf',title:'Surf lesson in Ericeira',date:day(0),time:'10:00',kind:'activity',owner:'Ben',notes:'',participants:all.filter(p=>!['ines','noah'].includes(p.id))});
 await save('event',{id:'breakfast',title:'Pastéis de nata breakfast',date:day(1),time:'09:00',kind:'breakfast',owner:'',notes:'',participants:all});
 for(const [i,text,eventId,done] of [[1,'Sardines (2 kg)','dinner',true],[2,'Lemons','dinner',false],[3,'Vinho verde','dinner',false],[4,'Sunscreen SPF 50',null,false],[5,'Oat milk','breakfast',false]])await save('shopping',{id:`s${i}`,text,eventId,done});
 for(const [id,name,kind,familyId,note] of [['silva-car','Silva car','car','S','Roof box'],['rossi-car','Rossi car','car','R',''],['weber-plane','Weber plane','plane','W','2 checked bags']])await save('transport',{id,name,kind,familyId,note});
 for(const [i,text,familyId,packed,quantity,note,transportId] of [[1,'Beach tent','S',true,1,'','silva-car'],[2,'Charcoal grill','R',false,1,'Borrow from Marco’s brother','rossi-car'],[3,'Travel cot','W',true,1,'',['weber-plane','silva-car']],[4,'Snorkel sets','W',false,4,'','weber-plane'],[5,'Board games','L',false,1,'',null],[6,'Speaker',null,false,1,'',null]])await save('gear',{id:`g${i}`,text,familyId,quantity,note,packed,...(Array.isArray(transportId)?{route:transportId,transportId:transportId[0]}:{transportId})});
 const expense=(id,title,date,category,total,payer,weights,eventId=null)=>save('expense',{id,title,date,category,total,payers:[{familyId:payer,amount:total}],lines:[{id:`${id}-l`,label:title,amount:total,splits:[{amount:total,eventId,eventVersion:eventId?1:undefined,weights,fixed:[]}]}],notes:'',receiptIds:[],status:'posted'});
 await expense('x1','Holiday house deposit',day(-2),'stay',120000,'S',all);
 await expense('x2','Surf lesson',day(0),'activity',28000,'W',all.filter(p=>!['ines','noah'].includes(p.id)),'surf');
 await expense('x3','Fuel for the rental car',day(-1),'transport',8640,'R',all);
 await expense('x4','Gelato at the harbour',day(-1),'food',3150,'L',all);
 // Getting there: the Webers fly in and ride on with the Silvas; one night in Lisbon, then the house in Ericeira.
 await save('leg',{id:'fly-in',transportId:'weber-plane',from:'Frankfurt (FRA)',to:'Lisbon (LIS)',departDate:day(-2),departTime:'07:10',arriveDate:day(-2),arriveTime:'09:05',people:['ben','mia','noah'],note:'LH 1172'});
 await save('leg',{id:'drive-in',transportId:'silva-car',from:'Lisbon',to:'Ericeira',departDate:day(-1),departTime:'11:00',arriveDate:day(-1),arriveTime:'11:45',people:['ana','tiago','ines','ben','mia','noah'],note:''});
 await save('leg',{id:'fly-home',transportId:'weber-plane',from:'Lisbon (LIS)',to:'Frankfurt (FRA)',departDate:day(7),departTime:'18:40',arriveDate:day(7),arriveTime:'22:35',people:['ben','mia','noah'],note:''});
 await save('stay',{id:'alfama',name:'Casa Alfama',address:'Rua de São Miguel 5, Lisboa',from:day(-2),to:day(-1),checkIn:'15:00',checkOut:'10:00',note:'Keys in the lockbox',expenseId:null});
 await save('stay',{id:'dunas',name:'Casa das Dunas',address:'Rua do Norte 12, Ericeira',from:day(-1),to:day(7),checkIn:'16:00',checkOut:'11:00',note:'',expenseId:'x1'});
 await save('payment',{id:'p1',from:'R',to:'S',amount:15000,date:day(-1)});
 const photo=await sharp({create:{width:600,height:900,channels:3,background:'#fbfaf5'}}).composite([{input:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><g font-family="Courier New, monospace" font-size="28" fill="#222"><text x="300" y="70" text-anchor="middle" font-size="34">MERCADO DA RIBEIRA</text><text x="40" y="190">Pão</text><text x="560" y="190" text-anchor="end">2,40</text><text x="40" y="240">Sardinhas</text><text x="560" y="240" text-anchor="end">9,90</text><text x="40" y="290">Vinho verde</text><text x="560" y="290" text-anchor="end">6,50</text><text x="40" y="340">Protetor solar</text><text x="560" y="340" text-anchor="end">4,80</text><text x="40" y="390">Tara garrafa</text><text x="560" y="390" text-anchor="end">-0,50</text><text x="40" y="520" font-size="32">TOTAL EUR</text><text x="560" y="520" text-anchor="end" font-size="32">23,10</text></g></svg>')}]).jpeg().toBuffer();
 await api(`/trips/${trip.id}/receipts`,{image:photo.toString('base64')});
 for(let i=0;i<60;i++){const view=await (await request.get(`${base}/api/v1/trips/${trip.id}`)).json();if(view.trip.receipts[0]?.status==='review')break;await new Promise(r=>setTimeout(r,500));}
 return trip.id;
}

async function capture(context,tripId,name,{tab,action,full=false}){
 const page=await context.newPage();
 await page.addInitScript(id=>localStorage.setItem('splitfairy-last-trip',id),tripId);
 await page.goto(base);
 await page.getByText("Here's what's happening in Summer in Portugal.").waitFor();
 const phone=(page.viewportSize()?.width??1000)<=740;
 const labels={Plan:['Plan','The plan'],Pack:['Pack','Packing list'],Spend:['Spend','Expenses'],Settle:['Settle','Balances'],People:['People','People & settings']};
 if(tab)await (phone?page.getByRole('navigation',{name:'Trip sections'}).getByRole('button',{name:labels[tab][0]}):page.locator('.sidebar .nav').getByRole('button',{name:labels[tab][1]})).click();
 if(action)await action(page);
 await page.waitForTimeout(400);
 const png=await page.screenshot({fullPage:full});
 await sharp(png).resize({width:phone?540:1400,withoutEnlargement:true}).png({compressionLevel:9,palette:true,quality:90}).toFile(join(out,`${name}.png`));
 await page.close();console.log('saved',name);
}

try{
 const phoneOpts=devices['iPhone 15'];
 const phone=await webkit.launch();
 for(const scheme of ['light','dark']){
  const context=await signedInContext(phone,{...phoneOpts,colorScheme:scheme});
  const tripId=globalThis.tripId??=await seed(context.request);
  if(scheme==='light'){
   await capture(context,tripId,'phone-today',{});
   await capture(context,tripId,'phone-plan',{tab:'Plan'});
   await capture(context,tripId,'phone-packing',{tab:'Pack',action:p=>p.evaluate(()=>{const el=document.querySelector('.transport-strip');window.scrollTo(0,(el?.getBoundingClientRect().top??0)+window.scrollY-90);})});
   await capture(context,tripId,'phone-receipt-review',{tab:'Spend',action:async p=>{await p.getByRole('button',{name:'Review'}).click();await p.getByRole('dialog').waitFor();await p.waitForTimeout(300);}});
   await capture(context,tripId,'phone-settle',{tab:'Settle'});
   await capture(context,tripId,'phone-people',{tab:'People'});
  }else{
   await capture(context,tripId,'phone-today-dark',{});
   await capture(context,tripId,'phone-plan-dark',{tab:'Plan'});
  }
  await context.close();
 }
 await phone.close();
 const browser=await chromium.launch();
 const context=await signedInContext(browser,{viewport:{width:1440,height:900},deviceScaleFactor:1,colorScheme:'light'});
 await capture(context,globalThis.tripId,'desktop-today',{});
 await capture(context,globalThis.tripId,'desktop-plan',{tab:'Plan'});
 await capture(context,globalThis.tripId,'desktop-settle',{tab:'Settle'});
 await browser.close();
 // The sign-in tour shows the same phone screenshots, smaller.
 const tour=resolve('public/tour');mkdirSync(tour,{recursive:true});
 for(const [from,to] of [['phone-today','today'],['phone-plan','plan'],['phone-packing','packing'],['phone-receipt-review','receipt'],['phone-settle','settle']])
  await sharp(join(out,`${from}.png`)).resize({width:360}).png({compressionLevel:9,palette:true,quality:85}).toFile(join(tour,`${to}.png`));
}finally{server.kill('SIGTERM');ollama.kill('SIGTERM');rmSync(data,{recursive:true,force:true});}
