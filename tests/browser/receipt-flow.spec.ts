import {test,expect,type Page} from '@playwright/test';
import {allocateExpense} from '../../packages/domain/src/accounting.js';
// A stateful fake API: commands are applied like the server does, so the UI round-trips real trip data.
function fakeApi(){
 const user={id:'u',name:'Andrea Rossi',email:'andrea@example.com',admin:true};
 const trip:any={id:'t',name:'Summer in Liguria',start:'2026-10-01',end:'2026-10-05',version:5,archived:false,
  families:[{id:'A',name:'Rossi',version:1},{id:'B',name:'Weber',version:1}],
  people:[{id:'a1',name:'Andrea',familyId:'A',weight:1,version:1},{id:'a2',name:'Luca',familyId:'A',weight:.5,version:1},{id:'b1',name:'Ben',familyId:'B',weight:1,version:1},{id:'b2',name:'Mia',familyId:'B',weight:1,version:1}],
  events:[{id:'dinner',title:'Pasta night',date:'2026-10-02',kind:'dinner',owner:'Ben',notes:'',participants:[{id:'a1',weight:1},{id:'b1',weight:1},{id:'b2',weight:1}],version:2}],
  shopping:[{id:'s1',text:'Basil',eventId:'dinner',done:false,version:1}],expenses:[],payments:[],activity:[],
  receipts:[{id:'r1',status:'review',merchant:'Coop',date:'2026-10-02',total:1547,items:[{label:'Spaghetti',amount:129},{label:'Passata',amount:99},{label:'Parmigiano',amount:449},{label:'Sunscreen',amount:895},{label:'Deposit',amount:-25}],error:null,version:2,authorId:'u'}]};
 return {user,trip};
}
async function mount(page:Page){
 const {user,trip}=fakeApi();
 await page.route('**/api/v1/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();
  let data:any={ok:true};
  if(path.endsWith('/me'))data=user;
  else if(path.endsWith('/trips')&&method==='GET')data=[{id:trip.id,name:trip.name,start:trip.start,end:trip.end,archived:false}];
  else if(path.endsWith('/trips/t'))data={trip,role:'organizer',members:[{email:user.email,role:'organizer'}]};
  else if(path.endsWith('/commands')){
   const command=route.request().postDataJSON();const value=command.value;
   const key=({family:'families',person:'people',event:'events',shopping:'shopping',expense:'expenses',payment:'payments'} as any)[command.entity];
   const list=trip[key],index=list.findIndex((x:any)=>x.id===value.id);
   const saved={...value,version:(index<0?0:list[index].version)+1,authorId:'u'};
   if(command.entity==='expense'){saved.allocations=value.status==='void'?[]:allocateExpense({total:value.total,payers:value.payers,splits:value.lines.flatMap((l:any)=>l.splits)},trip.people);for(const id of value.receiptIds){const r=trip.receipts.find((x:any)=>x.id===id);r.status='posted';r.expenseId=value.id;}}
   if(index<0)list.push(saved);else list[index]=saved;trip.version++;
   data={trip,role:'organizer'};
  }
  else if(path.includes('/receipts/')&&path.endsWith('/image')){await route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="500"><rect width="100%" height="100%" fill="#fff"/><text x="20" y="40">COOP</text></svg>'});return;}
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.addInitScript(()=>localStorage.setItem('splitfairy-last-trip','t'));
 await page.goto('/');
 return trip;
}
const shot=async(page:Page,name:string)=>{if(process.env.SCREENSHOT_DIR)await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/${name}.png`,fullPage:!name.includes('receipt')});};
for(const viewport of [{name:'mobile',width:390,height:844},{name:'desktop',width:1366,height:900}]){
 test(`${viewport.name}: review a receipt, assign items to a meal, and settle up`,async({page})=>{
  await page.setViewportSize(viewport);
  const trip=await mount(page);
  await expect(page.getByText("Here's what's happening in Summer in Liguria.")).toBeVisible();
  await shot(page,`${viewport.name}-today`);
  await page.getByRole('button',{name:viewport.name==='mobile'?'Spend':'Expenses'}).click();
  await page.getByRole('button',{name:'Review'}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByText('Totals match')).toBeVisible();
  // Receipt date matches the only dinner, so food items start assigned to it; sunscreen is for everyone.
  await expect(dialog.getByLabel('Assign item 1')).toHaveValue('dinner');
  await dialog.getByLabel('Assign item 4').selectOption('');
  await dialog.getByLabel('Paid by').selectOption('B');
  const summary=dialog.getByLabel('Totals by meal or activity');
  await expect(summary.getByText('Pasta night')).toBeVisible();
  await expect(summary).toContainText('€6.52');
  await expect(summary).toContainText('€8.95');
  // A misread price blocks confirmation until it reconciles.
  await dialog.getByLabel('Amount for item 3').fill('4.94');
  await expect(dialog.getByRole('status')).toContainText('Difference -€0.45');
  await expect(dialog.getByRole('button',{name:'Confirm expense'})).toBeDisabled();
  await shot(page,`${viewport.name}-receipt-mismatch`);
  await dialog.getByLabel('Amount for item 3').fill('4.49');
  await expect(dialog.getByText('Totals match')).toBeVisible();
  await shot(page,`${viewport.name}-receipt-review`);
  await dialog.getByRole('button',{name:'Confirm expense'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(()=>trip.expenses.length).toBe(1);
  expect(trip.expenses[0].lines.map((l:any)=>l.splits[0].eventId)).toEqual(['dinner','dinner','dinner',null,'dinner']);
  await expect(page.getByText('Receipt inbox')).toHaveCount(0);
  await shot(page,`${viewport.name}-expenses`);
  await page.getByRole('button',{name:viewport.name==='mobile'?'Settle':'Balances'}).click();
  // Weber paid 15.47. Each item is split separately to the cent: Andrea's dinner items 0.43+0.33+1.50-0.09=2.17, plus Andrea 2.56 and Luca 1.28 of the sunscreen = 6.01.
  await expect(page.getByText('pays Weber')).toBeVisible();
  await expect(page.locator('.transfer-row')).toContainText('€6.01');
  await shot(page,`${viewport.name}-balances`);
 });
}
