import {test,expect,type Page,type TestInfo} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
import {ADMIN} from './env.js';
import {isPhone,openSection,shot,signInAsAdmin,unique} from './helpers.js';
const iso=(days:number)=>{const d=new Date(Date.now()+days*86400_000);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};

/** Builds a realistic trip through the public API, as the signed-in organizer. */
async function seedTrip(page:Page,name:string){
 const api=async(path:string,data:unknown)=>{const r=await page.request.post(`/api/v1${path}`,{data});expect(r.ok(),`${path}: ${await r.text()}`).toBe(true);return r.json();};
 const trip=await api('/trips',{name,start:iso(-1),end:iso(8)});let n=0;
 const save=(entity:string,value:any)=>api(`/trips/${trip.id}/commands`,{mutationId:crypto.randomUUID(),entity,action:'save',expectedVersion:0,value:{version:0,...value}});
 for(const [id,fam] of [['A','Silva-Fernandes'],['B','Weber'],['C','Rossi']])await save('family',{id,name:fam,solo:false});
 await save('family',{id:'S',name:'Nora',solo:true});
 const people=[['a1','Ana','A',1],['a2','Tiago','A',.5],['a3','Inês','A',.25],['b1','Ben','B',1],['b2','Lena','B',1],['c1','Giulia','C',1],['c2','Marco','C',.75]] as const;
 for(const [id,pname,familyId,weight] of people)await save('person',{id,name:pname,familyId,weight,email:id==='b1'?`ben-${name.replace(/\W/g,'')}@splitfairy.test`:''});
 await save('person',{id:'s1',name:'Nora',familyId:'S',weight:1,email:''});
 const all=people.map(p=>({id:p[0],weight:p[3]}));
 await save('event',{id:'e1',title:'Sardine dinner at the harbour',date:iso(0),kind:'dinner',owner:'Ben',notes:'',participants:all});
 await save('event',{id:'e2',title:'Surf lesson',date:iso(0),kind:'activity',owner:'',notes:'',participants:all.slice(0,5)});
 for(const [i,text,eventId,done] of [[1,'Lemons','e1',false],[2,'Sunscreen SPF 50',null,true]] as const)await save('shopping',{id:`s${i}`,text,eventId,done});
 await save('expense',{id:`x${n++}`,title:'Groceries for the week at Pingo Doce',date:iso(0),category:'food',total:12870,payers:[{familyId:'A',amount:12870}],lines:[{id:'l1',label:'Groceries',amount:12870,splits:[{amount:12870,eventId:null,weights:all,fixed:[]}]}],notes:'',receiptIds:[],status:'posted'});
 await save('payment',{id:'p1',from:'B',to:'A',amount:2000,date:iso(0)});
 const photo=await sharp({create:{width:500,height:800,channels:3,background:'#fbfaf5'}}).jpeg().toBuffer();
 await api(`/trips/${trip.id}/receipts`,{image:photo.toString('base64')});
 await expect.poll(async()=>(await (await page.request.get(`/api/v1/trips/${trip.id}`)).json()).trip.receipts[0]?.status,{timeout:30_000}).toBe('review');
 return trip.id as string;
}

type Screen={name:string;open:(page:Page)=>Promise<void>;scope?:string};
async function checkScreen(page:Page,testInfo:TestInfo,screen:string,scope?:string){
 const phone=isPhone(page);
 const layout=await page.evaluate(({phone,scope})=>{
  const issues:string[]=[];const doc=document.documentElement;const root=scope?document.querySelector(scope)!:document.body;
  if(doc.scrollWidth>doc.clientWidth+1){
   // Name the widest culprits so a CI-only failure can be fixed without reproducing it.
   const scrolls=(e:Element|null)=>{for(;e&&e!==document.body;e=e.parentElement){const o=getComputedStyle(e).overflowX;if(o==='auto'||o==='scroll'||o==='hidden'||o==='clip')return true;}return false;};
   const wide=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>doc.clientWidth+1&&!scrolls(e.parentElement);}).map(e=>`${e.tagName.toLowerCase()}.${[...e.classList].join('.')}[${Math.round(e.getBoundingClientRect().right)}]`).slice(0,6);
   issues.push(`page scrolls sideways (${doc.scrollWidth}px > ${doc.clientWidth}px): ${wide.join(', ')}`);
  }
  const shown=(e:Element)=>{const r=e.getBoundingClientRect(),st=getComputedStyle(e);return r.width>0&&r.height>0&&st.visibility!=='hidden';};
  const name=(e:Element)=>((e.getAttribute('aria-label')||(e as HTMLElement).innerText||(e as HTMLInputElement).placeholder||e.tagName)+'').trim().replace(/\s+/g,' ').slice(0,40);
  if(phone){
   for(const e of root.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]),select,textarea'))if(shown(e)&&parseFloat(getComputedStyle(e).fontSize)<16)issues.push(`field "${name(e)}" is ${getComputedStyle(e).fontSize}; iOS zooms under 16px`);
   for(const e of root.querySelectorAll('button,a[href],select,input[type=checkbox],input[type=radio]')){
    if(!shown(e)||(e as HTMLButtonElement).disabled)continue;
    // A small control inside a large enough label or row is fine: the whole label is the target.
    const target=e.closest('label')??e;const r=target.getBoundingClientRect();
    if(r.height<44||r.width<44)issues.push(`tap target "${name(e)}" is ${Math.round(r.width)}x${Math.round(r.height)}`);
   }
  }
  return [...new Set(issues)];
 },{phone,scope});
 const axe=await new AxeBuilder({page}).include(scope??'body').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
 const detail=(n:any)=>{const d=n.any?.[0]?.data;return d?.fgColor?`${n.target.join(' ')} (${d.fgColor} on ${d.bgColor} = ${d.contrastRatio}:1, needs ${d.expectedContrastRatio})`:n.target.join(' ');};
 const serious=axe.violations.filter(v=>v.impact==='serious'||v.impact==='critical').flatMap(v=>v.nodes.map(n=>`${v.id}: ${detail(n)}`));
 await shot(page,testInfo,screen);
 expect.soft([...layout,...serious],`${screen}`).toEqual([]);
}

for(const scheme of ['light','dark'] as const){
 test(`every screen meets the UI rules (${scheme})`,async({page},testInfo)=>{
  test.setTimeout(180_000);
  await page.emulateMedia({colorScheme:scheme});
  await page.goto('/');await expect(page.getByRole('heading',{name:/Good trips are/i})).toBeVisible();
  await checkScreen(page,testInfo,`${scheme}-sign-in`);
  await signInAsAdmin(page);
  const name=unique(testInfo,`Algarve ${scheme}`);await seedTrip(page,name);
  await page.reload();await expect(page.getByText('Every shared trip')).toBeVisible();
  await checkScreen(page,testInfo,`${scheme}-trip-list`);
  // Nothing to navigate without a trip.
  await expect(page.getByRole('navigation',{name:'Trip sections'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Add new'})).toHaveCount(0);
  await page.getByRole('button',{name:new RegExp(name)}).click();
  await expect(page.getByText(`Here's what's happening in ${name}.`)).toBeVisible();
  const screens:Screen[]=[
   {name:'today',open:p=>openSection(p,'Today')},
   {name:'plan',open:p=>openSection(p,'Plan')},
   {name:'spend',open:p=>openSection(p,'Spend')},
   {name:'spend-options',open:async p=>{await openSection(p,'Spend');await p.getByText('Custom shares, several payers, or refund').click();}},
   {name:'receipt-review',scope:'[role=dialog]',open:async p=>{await openSection(p,'Spend');await p.getByRole('button',{name:'Review'}).click();}},
   {name:'settle',open:p=>openSection(p,'Settle')},
   {name:'people',open:p=>openSection(p,'People')},
   {name:'add-new',scope:'[role=dialog]',open:p=>p.getByRole('button',{name:'Add new'}).click()},
   {name:'scan',scope:'[role=dialog]',open:async p=>{await p.getByRole('button',{name:'Add new'}).click();await p.getByRole('dialog').getByRole('button',{name:/Scan a receipt/}).click();}},
   {name:'invite',scope:'[role=dialog]',open:async p=>{await openSection(p,'People');await p.getByRole('button',{name:'Invite someone without adding them'}).click();}},
   {name:'person-sheet',scope:'[role=dialog]',open:async p=>{await openSection(p,'People');await p.getByRole('button',{name:'Edit Ben'}).click();}},
   {name:'family-sheet',scope:'[role=dialog]',open:async p=>{await openSection(p,'People');await p.getByRole('button',{name:'Add family',exact:true}).click();}},
   {name:'plan-sheet',scope:'[role=dialog]',open:async p=>{await openSection(p,'Plan');await p.getByRole('button',{name:'Plan a meal or activity'}).click();}},
  ];
  for(const s of screens){
   await s.open(page);await page.waitForTimeout(250);
   await checkScreen(page,testInfo,`${scheme}-${s.name}`,s.scope);
   if(s.scope)await page.getByRole('dialog').getByRole('button',{name:'Close'}).click();
  }
 });
}

test('the phone menu fits the home-screen app safe area and never covers content',async({page},testInfo)=>{
 test.skip(!isPhone(page),'phone layout only');
 await signInAsAdmin(page);
 const name=unique(testInfo,'Safe area');await seedTrip(page,name);
 await page.reload();await page.getByRole('button',{name:new RegExp(name)}).click();
 const nav=page.getByRole('navigation',{name:'Trip sections'});
 for(const inset of [0,34]){
  // Chrome and Playwright cannot emulate iOS safe-area insets; the app routes them through --safe-bottom.
  await page.evaluate(px=>document.documentElement.style.setProperty('--safe-bottom',`${px}px`),inset);
  for(const section of ['Today','Plan','Spend','Settle','People'] as const){
   await openSection(page,section);
   const vh=page.viewportSize()!.height;const box=(await nav.boundingBox())!;
   expect(Math.round(box.y+box.height),`${section}: menu sits on the bottom edge`).toBe(vh);
   expect(box.height,`${section}: menu is 64px plus the ${inset}px safe area`).toBeGreaterThanOrEqual(64+inset-1);
   for(const b of await nav.getByRole('button').all()){const bb=(await b.boundingBox())!;expect(bb.y+bb.height,`${section}: menu buttons stay above the home indicator`).toBeLessThanOrEqual(vh-inset+1);expect(bb.height).toBeGreaterThanOrEqual(44);}
   await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(100);
   const last=await page.evaluate(()=>{const kids=[...document.querySelectorAll('main.content > *')].filter(e=>e.getBoundingClientRect().height>0);return kids.at(-1)!.getBoundingClientRect().bottom;});
   expect(last,`${section}: last content ends above the menu`).toBeLessThanOrEqual(box.y+1);
  }
  await shot(page,testInfo,`menu-inset-${inset}`);
 }
});
