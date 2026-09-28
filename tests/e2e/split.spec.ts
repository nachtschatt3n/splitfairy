import {test,expect,type Page} from '@playwright/test';
import {addFamily,addPerson,createTrip,openExpenseForm,openSection,shot,signInAsAdmin,unique} from './helpers.js';
const sheet=(page:Page)=>page.getByRole('dialog');
const closed=(page:Page)=>expect(page.getByRole('dialog')).toHaveCount(0);
const form=(page:Page)=>page.locator('#quick-expense');
/** Picks a split option; in the add sheet the options first open from the one-line family split. */
async function mode(scope:ReturnType<Page['locator']>,name:string){
 const more=scope.getByRole('button',{name:'Other split options'});if(await more.isVisible())await more.click();
 await scope.getByRole('group',{name:'Split options'}).getByRole('button',{name,exact:true}).click();
}
const row=(scope:ReturnType<Page['locator']>,name:string)=>scope.locator('.split-row',{hasText:name});
/** Opens the expense and checks what each family owes. */
async function owes(page:Page,title:string,expected:Record<string,string>){
 await page.getByRole('button',{name:`Open ${title}`}).click();
 for(const [family,amount] of Object.entries(expected))await expect(sheet(page).locator('.detail-row',{hasText:family})).toContainText(amount);
 await sheet(page).getByRole('button',{name:'Close'}).click();await closed(page);
}
async function add(page:Page,title:string,amount:string,choose:(f:ReturnType<Page['locator']>)=>Promise<void>){
 await openExpenseForm(page);
 await form(page).getByLabel('What was it?').fill(title);await form(page).getByLabel('Amount in EUR').fill(amount);
 await choose(form(page));
 await form(page).getByRole('button',{name:'Save expense'}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByRole('button',{name:`Open ${title}`})).toBeVisible();
}

test('every split option records the right amounts and can be edited in the same mode',async({page},testInfo)=>{
 test.setTimeout(180_000);
 page.on('dialog',d=>d.accept());
 await signInAsAdmin(page);
 await createTrip(page,unique(testInfo,'Splits'));
 await openSection(page,'People');
 await addFamily(page,'Uhl');await addFamily(page,'Moncrief');
 await addPerson(page,'Mathias','Uhl');await addPerson(page,'Andrea','Uhl');await addPerson(page,'Will','Moncrief');
 await openSection(page,'Spend');

 await add(page,'Taxi',"30",async f=>{await f.getByRole('button',{name:'Add a note'}).click();await f.getByLabel('Notes (optional)').fill('Airport run, tip included');await mode(f,'Equally');await expect(f.locator('.split-footer')).toHaveText('€10.00 per person (3 people)');});
 await owes(page,'Taxi',{Uhl:'€20.00',Moncrief:'€10.00'});
 // Notes show on the expense and can be changed.
 await page.getByRole('button',{name:'Open Taxi'}).click();
 await expect(sheet(page).locator('.expense-notes')).toHaveText('Airport run, tip included');
 await sheet(page).getByRole('button',{name:'Edit'}).click();
 await expect(sheet(page).getByLabel('Notes (optional)')).toHaveValue('Airport run, tip included');
 await sheet(page).getByLabel('Notes (optional)').fill('Airport run, tip included, receipt with Will');
 await sheet(page).getByRole('button',{name:'Save changes'}).click();await closed(page);
 await page.getByRole('button',{name:'Open Taxi'}).click();
 await expect(sheet(page).locator('.expense-notes')).toHaveText('Airport run, tip included, receipt with Will');
 await sheet(page).getByRole('button',{name:'Close'}).click();await closed(page);

 await add(page,'Boat trip',"100",async f=>{
  await mode(f,'Percentages');
  await row(f,'Mathias').getByRole('textbox').fill('50');await row(f,'Andrea').getByRole('textbox').fill('20');
  await expect(f.locator('.split-footer')).toHaveText('70% of 100% · 30% left');
  await expect(f.locator('.split-warning')).toContainText('70%, not 100%');
  await row(f,'Will').getByRole('textbox').fill('30');
  await expect(row(f,'Will')).toContainText('€30.00');
 });
 await owes(page,'Boat trip',{Uhl:'€70.00',Moncrief:'€30.00'});

 await add(page,'Ice cream',"10",async f=>{
  await mode(f,'Exact amounts');
  await row(f,'Mathias').getByRole('textbox').fill('7');
  await expect(f.locator('.split-footer')).toHaveText('€7.00 of €10.00 · €3.00 left');
  await row(f,'Will').getByRole('textbox').fill('3');
 });
 await owes(page,'Ice cream',{Uhl:'€7.00',Moncrief:'€3.00'});

 await add(page,'Apartment',"60",async f=>{
  await mode(f,'Shares');
  await row(f,'Mathias').getByRole('textbox').fill('2');await row(f,'Will').getByRole('textbox').fill('3');
  await expect(f.locator('.split-footer')).toHaveText('6 total shares');
  await expect(row(f,'Will')).toContainText('€30.00');
 });
 await owes(page,'Apartment',{Uhl:'€30.00',Moncrief:'€30.00'});

 await add(page,'Wine',"10",async f=>{
  await mode(f,'Adjustments');
  await row(f,'Will').getByRole('textbox').fill('4');
  await expect(row(f,'Will')).toContainText('€6.00');await expect(row(f,'Andrea')).toContainText('€2.00');
 });
 await owes(page,'Wine',{Uhl:'€4.00',Moncrief:'€6.00'});

 await add(page,'Parking',"9",async f=>{await expect(f.locator('.split-summary')).toContainText('2 families · €4.50 each');});
 await owes(page,'Parking',{Uhl:'€4.50',Moncrief:'€4.50'});
 await shot(page,testInfo,'split-spend');

 // Editing keeps the mode it was entered in.
 await page.getByRole('button',{name:'Open Boat trip'}).click();await sheet(page).getByRole('button',{name:'Edit'}).click();
 await expect(sheet(page).getByRole('group',{name:'Split options'}).getByRole('button',{name:'Percentages'})).toHaveAttribute('aria-pressed','true');
 await expect(row(sheet(page),'Mathias').getByRole('textbox')).toHaveValue('50');
 await row(sheet(page),'Mathias').getByRole('textbox').fill('40');await row(sheet(page),'Andrea').getByRole('textbox').fill('30');
 await shot(page,testInfo,'split-edit');
 await sheet(page).getByRole('button',{name:'Save changes'}).click();await closed(page);
 await owes(page,'Boat trip',{Uhl:'€70.00',Moncrief:'€30.00'});
 await page.getByRole('button',{name:'Open Boat trip'}).click();await sheet(page).getByRole('button',{name:'Edit'}).click();
 await row(sheet(page),'Will').getByRole('textbox').fill('40');await row(sheet(page),'Mathias').getByRole('textbox').fill('30');
 await sheet(page).getByRole('button',{name:'Save changes'}).click();await closed(page);
 await owes(page,'Boat trip',{Uhl:'€60.00',Moncrief:'€40.00'});
});
