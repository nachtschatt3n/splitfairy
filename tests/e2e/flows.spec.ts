import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
import {ADMIN} from './env.js';
import {createTrip,isPhone,mailedCode,mailsTo,openSection,shot,signInAsAdmin,switchTrip,unique,withAdminLock} from './helpers.js';
const iso=(days:number)=>{const d=new Date(Date.now()+days*86400_000);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
async function receiptPhoto(){return sharp({create:{width:500,height:800,channels:3,background:'#fbfaf5'}}).composite([{input:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="800"><text x="30" y="60" font-size="30">MERCADO</text><text x="30" y="700" font-size="30">TOTAL 23,10</text></svg>')}]).jpeg().toBuffer();}
async function toTripList(page:Page){
 const chip=page.getByRole('button',{name:/Switch trip/});
 if(await chip.isVisible())await chip.click();else await page.getByLabel('Current trip').selectOption({label:'All trips'});
 await expect(page.getByText('Every shared trip')).toBeVisible();
}
test.describe.configure({mode:'serial'});
test('organizer plans a trip, splits a receipt, settles up and switches trips',async({page},testInfo)=>{
 test.setTimeout(120_000);
 const tripName=unique(testInfo,'Porto');
 // Sign in with the code from the real email (captured by the server under test).
 await withAdminLock(async()=>{
 const before=Date.now();
  await page.goto('/');
  await page.getByLabel('Email address').fill(ADMIN);
  await page.getByRole('button',{name:'Email me a code'}).click();
  await expect(page.getByText(/six-digit code is on its way/)).toBeVisible();
  await page.getByLabel('Your six-digit code').fill(await mailedCode(ADMIN,before));
  await page.getByLabel('Your name').fill('Ana');
  await page.getByRole('button',{name:'Start planning'}).click();
 });
 // Without a trip there is nothing to navigate: no section menu, no Add new.
 await expect(page.getByText('Every shared trip')).toBeVisible();
 await expect(page.getByRole('navigation',{name:'Trip sections'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Add new'})).toHaveCount(0);
 await createTrip(page,tripName,iso(1),iso(9));
 await expect(page.getByRole('button',{name:'Add new'})).toBeVisible();
 if(isPhone(page))await expect(page.getByRole('navigation',{name:'Trip sections'})).toBeVisible();

 await openSection(page,'People');
 for(const family of ['Silva','Weber']){await page.getByPlaceholder('The Millers').fill(family);await page.locator('form',{hasText:'Add a family'}).getByRole('button',{name:'Add'}).click();await expect(page.locator('.family-title',{hasText:family})).toBeVisible();}
 const personForm=page.locator('form',{hasText:'Add a person'});
 for(const [name,family,weight] of [['Ana','Silva','Adult · 1'],['Tiago','Silva','Child · 0.5'],['Ben','Weber','Adult · 1']]){
  await personForm.getByPlaceholder('First name').fill(name);
  await personForm.locator('select').nth(0).selectOption({label:family});
  await personForm.locator('select').nth(1).selectOption({label:weight});
  await personForm.getByRole('button',{name:'Add'}).click();
  await expect(page.locator('.person-row',{hasText:name})).toBeVisible();
 }

 await openSection(page,'Plan');
 await page.locator('.day-strip button').nth(3).click();
 const planForm=page.locator('#new-event');
 await planForm.getByLabel('What is it?').fill('Sardine dinner');
 await planForm.getByLabel('Type').selectOption('dinner');
 await planForm.getByRole('button',{name:'Add to plan'}).click();
 await expect(page.locator('.event-card',{hasText:'Sardine dinner'})).toBeVisible();
 await page.getByLabel('Add to the list').fill('Lemons');
 const shopForm=page.locator('form',{hasText:'Add to the list'});
 const dinnerOption=await shopForm.getByLabel('For').locator('option',{hasText:'Sardine dinner'}).getAttribute('value');
 await shopForm.getByLabel('For').selectOption(dinnerOption!);
 await page.getByRole('button',{name:'Add item'}).click();
 const lemons=page.locator('.shop-row',{hasText:'Lemons'});
 await expect(lemons).toBeVisible();await lemons.click();await expect(lemons.locator('input')).toBeChecked();
 await shot(page,testInfo,'plan');

 await openSection(page,'Spend');
 const quick=page.locator('#quick-expense');
 await quick.getByLabel('What was it?').fill('Taxi from the airport');
 await quick.getByLabel('Amount in EUR').fill('30,00');
 await quick.getByLabel('Paid by').selectOption({label:'Weber'});
 await quick.getByLabel('Category').selectOption('transport');
 await quick.getByRole('button',{name:'Save expense'}).click();
 await expect(page.locator('.list-row',{hasText:'Taxi from the airport'})).toContainText('€30.00');

 // Receipt: photo -> real worker -> (fake) vision model -> human review -> expense.
 await page.getByRole('button',{name:'Add new'}).click();
 await page.getByRole('dialog').getByRole('button',{name:/Scan a receipt/}).click();
 await page.locator('.upload-zone input[type=file]').setInputFiles({name:'receipt.jpg',mimeType:'image/jpeg',buffer:await receiptPhoto()});
 await page.getByRole('button',{name:/Extract items/}).click();
 const review=page.getByRole('button',{name:'Review'});
 // The worker picks the photo up within seconds; the app refreshes the trip every 15 s.
 await expect(review).toBeVisible({timeout:40_000});
 await review.click();
 const sheet=page.getByRole('dialog');
 await expect(sheet.getByRole('status')).toContainText('Totals match');
 await expect(sheet.getByLabel('Assign item 1')).toHaveValue(/.+/);
 await sheet.getByLabel('Assign item 4').selectOption('');
 await sheet.getByLabel('Paid by').selectOption({label:'Silva'});
 await expect(sheet.getByLabel('Totals by meal or activity')).toContainText('Sardine dinner');
 await shot(page,testInfo,'receipt-review');
 await sheet.getByRole('button',{name:'Confirm expense'}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.locator('.list-row',{hasText:'Mercado da Ribeira'})).toContainText('€23.10');
 await expect(page.getByText('Receipt inbox')).toHaveCount(0);

 await openSection(page,'Settle');
 const transfer=page.locator('.transfer-row').first();
 await expect(transfer).toContainText('Silva');await expect(transfer).toContainText('pays Weber');
 const amount=(await transfer.locator('b').innerText()).replace(/[^\d.,]/g,'');
 await shot(page,testInfo,'settle');
 const pay=page.locator('form',{hasText:'Record payment'});
 await pay.getByLabel('From').selectOption({label:'Silva'});await pay.getByLabel('To').selectOption({label:'Weber'});await pay.getByLabel('Amount').fill(amount);
 await pay.getByRole('button',{name:'Record payment'}).click();
 await expect(page.locator('.balance-banner')).toContainText('Everyone is settled.');

 // A second trip, then back: switching must work on every device.
 await toTripList(page);
 await expect(page.getByRole('navigation',{name:'Trip sections'})).toHaveCount(0);
 const second=unique(testInfo,'Algarve');
 await createTrip(page,second,iso(20),iso(25));
 await switchTrip(page,tripName);
 await openSection(page,'Spend');
 await expect(page.locator('.list-row',{hasText:'Taxi from the airport'})).toBeVisible();
 await switchTrip(page,second);
 await openSection(page,'Spend');
 await expect(page.locator('.list-row',{hasText:'Taxi from the airport'})).toHaveCount(0);
 // Signing out is reachable on every device, from the trip itself and from the trip list.
 await openSection(page,'People');
 await expect(page.locator('.account-block')).toContainText(ADMIN);
 await toTripList(page);
 await page.locator('.account-row').getByRole('button',{name:'Sign out'}).click();
 await expect(page.getByRole('heading',{name:/Good trips are/i})).toBeVisible();
});

test('an invited member signs in by email, sees only member tools, and adds an expense',async({page,browser},testInfo)=>{
 test.setTimeout(90_000);
 const tripName=unique(testInfo,'Lisbon'),member=`member-${testInfo.project.name}-${Date.now()}@splitfairy.test`;
 await signInAsAdmin(page);
 await createTrip(page,tripName,iso(2),iso(6));
 await openSection(page,'People');
 await page.getByPlaceholder('The Millers').fill('Silva');await page.locator('form',{hasText:'Add a family'}).getByRole('button',{name:'Add'}).click();
 await page.getByPlaceholder('First name').fill('Ana');await page.locator('form',{hasText:'Add a person'}).getByRole('button',{name:'Add'}).click();
 await expect(page.locator('.person-row',{hasText:'Ana'})).toBeVisible();
 await page.getByRole('button',{name:'Invite by email'}).click();
 await page.getByRole('dialog').getByLabel('Email address').fill(member);
 await page.getByRole('dialog').getByRole('button',{name:'Send invitation'}).click();
 await expect(page.locator('.list-row',{hasText:member})).toBeVisible();
 expect(mailsTo(member).some(m=>m.subject.includes(tripName))).toBe(true);

 const memberContext=await browser.newContext(testInfo.project.use);const mp=await memberContext.newPage();
 const before=Date.now();
 await mp.goto('/');await mp.getByLabel('Email address').fill(member);await mp.getByRole('button',{name:'Email me a code'}).click();
 await mp.getByLabel('Your six-digit code').fill(await mailedCode(member,before));await mp.getByLabel('Your name').fill('Bea');
 await mp.getByRole('button',{name:'Start planning'}).click();
 await expect(mp.getByRole('button',{name:'Create a vacation'})).toHaveCount(0);
 await mp.getByRole('button',{name:new RegExp(tripName)}).click();
 await openSection(mp,'People');
 await expect(mp.getByPlaceholder('The Millers')).toHaveCount(0);
 await openSection(mp,'Spend');
 const quick=mp.locator('#quick-expense');
 await quick.getByLabel('What was it?').fill('Pastéis de nata');await quick.getByLabel('Amount in EUR').fill('7.20');
 await quick.getByRole('button',{name:'Save expense'}).click();
 await expect(mp.locator('.list-row',{hasText:'Pastéis de nata'})).toBeVisible();
 await memberContext.close();
 await page.reload();await openSection(page,'Spend');
 await expect(page.locator('.list-row',{hasText:'Pastéis de nata'})).toContainText('€7.20');
});
