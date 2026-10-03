import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
import {ADMIN} from './env.js';
import {addFamily,addPerson,createTrip,isPhone,mailedCode,mailsTo,nameIfAsked,openSection,planEvent,shot,signInAsAdmin,switchTrip,tripList,unique,withAdminLock,openExpenseForm,iso} from './helpers.js';
async function receiptPhoto(){return sharp({create:{width:500,height:800,channels:3,background:'#fbfaf5'}}).composite([{input:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="800"><text x="30" y="60" font-size="30">MERCADO</text><text x="30" y="700" font-size="30">TOTAL 23,10</text></svg>')}]).jpeg().toBuffer();}
async function toTripList(page:Page){
 const chip=page.getByRole('button',{name:/Switch trip/});
 if(await chip.isVisible())await chip.click();
 await expect(tripList(page)).toBeVisible();
}
test.describe.configure({mode:'serial'});
test('organizer plans a trip, splits a receipt, settles up and switches trips',async({page},testInfo)=>{
 test.setTimeout(120_000);
 const tripName=unique(testInfo,'Porto');
 // Sign in with the code from the real email (captured by the server under test).
 await withAdminLock(async()=>{
 const before=Date.now();
  await page.goto('/');
  // Guidance instead of a silently disabled button.
  await page.getByRole('button',{name:'I already have a code'}).click();
  await expect(page.getByRole('alert')).toContainText('Enter the email address the code was sent to first');
  await page.getByLabel('Email address').fill(ADMIN);
  await page.getByRole('button',{name:'Email me a code'}).click();
  await expect(page.getByText(/a code is on its way/)).toBeVisible();
  const code=await mailedCode(ADMIN,before);
  // The styled email carries the code and the inline logo reference.
  const mail=mailsTo(ADMIN).filter(m=>Date.parse(m.at)>=before).at(-1)!;
  expect(mail.subject).toBe(`${code} is your Splitfairy sign-in code`);expect(mail.html).toContain('cid:logo@splitfairy');expect(mail.html).toContain(`${code.slice(0,3)} ${code.slice(3)}`);
  // A wrong code explains what to do; a code copied with spaces and the full stop still works.
  await page.getByLabel('Your six-digit code').fill(code==='000000'?'111111':'000000');
  await page.getByRole('button',{name:'Sign in'}).click();
  await expect(page.getByRole('alert')).toContainText('only the newest one works');
  await page.getByLabel('Your six-digit code').fill(` ${code.slice(0,3)} ${code.slice(3)}.`);
  await page.getByRole('button',{name:'Sign in'}).click();
  await nameIfAsked(page,'Ana');
 });
 // Without a trip there is nothing to navigate: no section menu, no Add new.
 await expect(tripList(page)).toBeVisible();
 await expect(page.getByRole('navigation',{name:'Trip sections'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Add new'})).toHaveCount(0);
 await createTrip(page,tripName,iso(1),iso(9));
 await expect(page.getByRole('button',{name:'Add new'})).toBeVisible();
 if(isPhone(page))await expect(page.getByRole('navigation',{name:'Trip sections'})).toBeVisible();

 await openSection(page,'People');
 await addFamily(page,'Silva');await addFamily(page,'Weber');
 await addPerson(page,'Ana','Silva');
 await addPerson(page,'Tiago','Silva',{share:'Child · 0.5'});
 await addPerson(page,'Ben','Weber',{email:`ben-${testInfo.project.name}@splitfairy.test`});
 await addPerson(page,'Lena','On their own');
 await expect(page.locator('.family-block',{hasText:'On their own'})).toContainText('Lena');
 await expect(page.getByRole('button',{name:'Edit Tiago'})).toContainText('No account');
 await expect(page.getByRole('button',{name:'Edit Ben'})).toContainText('Invited');
 await expect.poll(()=>mailsTo(`ben-${testInfo.project.name}@splitfairy.test`).some(m=>m.subject.includes(tripName)),{message:'invitation email'}).toBe(true);
 await shot(page,testInfo,'people');

 await openSection(page,'Plan');
 await page.locator('.day-strip button').nth(3).click();
 // A plan can exist before anyone joins; people are added later.
 await planEvent(page,'Beach picnic','lunch','nobody');
 await expect(page.getByRole('article',{name:'Beach picnic'})).toContainText('Nobody yet');
 await page.getByRole('button',{name:'Edit Beach picnic'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Everyone'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Save changes'}).click();
 await expect(page.getByRole('article',{name:'Beach picnic'})).toContainText('Everyone (4)');
 await planEvent(page,'Sardine dinner','dinner');
 const dinner=page.getByRole('article',{name:'Sardine dinner'});
 // Ingredients go straight onto the meal.
 await dinner.getByLabel('Add to shopping for Sardine dinner').fill('Lemons');await dinner.getByLabel('Add to shopping for Sardine dinner').press('Enter');
 const lemons=dinner.locator('.shop-row',{hasText:'Lemons'});
 await expect(lemons).toBeVisible();await lemons.getByRole('checkbox').click();await expect(lemons.getByRole('checkbox')).toBeChecked();
 await shot(page,testInfo,'plan');
 await openSection(page,'Shop');await expect(page.locator('.shop-group',{hasText:'Sardine dinner'})).toContainText('Lemons');

 await openSection(page,'Spend');
 const quick=await openExpenseForm(page);
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
 await shot(page,testInfo,'receipt-review-top');
 // Two meals that day, so nothing is pre-assigned: send everything to dinner, then sunscreen to everyone.
 await expect(sheet.getByLabel('Assign item 1')).toHaveValue('');
 const dinnerId=await sheet.getByLabel('Assign every item to').locator('option',{hasText:'Sardine dinner'}).getAttribute('value');
 await sheet.getByLabel('Assign every item to').selectOption(dinnerId!);await sheet.getByRole('button',{name:'Apply to all'}).click();
 await expect(sheet.getByLabel('Assign item 1')).toHaveValue(dinnerId!);
 await sheet.getByLabel('Assign item 4').selectOption('');
 // One family only: the summary counts that family's people (Ben); then back to dinner.
 await sheet.getByLabel('Assign item 2').selectOption({label:'Only Weber'});
 await expect(sheet.getByLabel('Totals by meal or activity')).toContainText('Only Weber');
 await expect(sheet.getByLabel('Totals by meal or activity').locator('.assignment-row',{hasText:'Only Weber'})).toContainText('1 person');
 await sheet.getByLabel('Assign item 2').selectOption({label:'Only Ana'});
 await expect(sheet.getByLabel('Totals by meal or activity').locator('.assignment-row',{hasText:'Only Ana'})).toContainText('1 person');
 // Custom split: the same editor as a new expense, here exact amounts for two people.
 await sheet.getByLabel('Assign item 2').selectOption({label:'Custom split…'});
 const editor=sheet.locator('.receipt-item-split');
 await expect(editor.getByRole('group',{name:'Split options'})).toBeVisible();
 await editor.getByRole('button',{name:'Exact amounts',exact:true}).click();
 const item2=Number((await sheet.getByLabel('Amount for item 2').inputValue()).replace(',','.'));
 await editor.getByLabel(/^Ana:/).fill((item2-1).toFixed(2));
 await expect(sheet.locator('.review-problems')).toContainText('add up to');
 await editor.getByLabel(/^Ben:/).fill('1.00');
 await expect(sheet.getByLabel('Totals by meal or activity')).toContainText('custom split');
 await editor.scrollIntoViewIfNeeded();await shot(page,testInfo,'receipt-custom-split');
 await sheet.getByLabel('Assign item 2').selectOption(dinnerId!);
 await sheet.getByLabel('Paid by').selectOption({label:'Silva'});
 await expect(sheet.getByLabel('Totals by meal or activity')).toContainText('Sardine dinner');
 await shot(page,testInfo,'receipt-review');
 await sheet.getByRole('button',{name:'Confirm expense'}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.locator('.list-row',{hasText:'Mercado da Ribeira'})).toContainText('€23.10');
 await expect(page.getByText('Receipt inbox')).toHaveCount(0);

 await openSection(page,'Settle');
 await expect(page.locator('.transfer-row',{hasText:'pays Weber'})).toBeVisible();
 await shot(page,testInfo,'settle');
 // Record every suggested repayment; afterwards everyone is even.
 for(let i=0;i<5&&await page.locator('.transfer-row').count();i++){
  const row=page.locator('.transfer-row').first();
  const from=await row.locator('strong').innerText(),to=(await row.locator('small').innerText()).replace(/^pays /,''),amount=(await row.locator('b').innerText()).replace(/[^\d.,]/g,'');
  const pay=page.locator('form',{hasText:'Record payment'});
  await pay.getByLabel('From').selectOption({label:from});await pay.getByLabel('To').selectOption({label:to});await pay.getByLabel('Amount').fill(amount);
  await pay.getByRole('button',{name:'Record payment'}).click();
  await expect(page.locator('.transfer-row',{hasText:from}).filter({hasText:amount})).toHaveCount(0);
 }
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
 await addFamily(page,'Silva');await addPerson(page,'Ana','Silva');
 await addPerson(page,'Bea','Silva',{email:member});
 await expect(page.getByRole('button',{name:'Edit Bea'})).toContainText('Invited');
 await expect.poll(()=>mailsTo(member).some(m=>m.subject.includes(tripName)),{message:'invitation email'}).toBe(true);

 const memberContext=await browser.newContext(testInfo.project.use);const mp=await memberContext.newPage();
 const before=Date.now();
 await mp.goto('/');await mp.getByLabel('Email address').fill(member);await mp.getByRole('button',{name:'Email me a code'}).click();
 await mp.getByLabel('Your six-digit code').fill(await mailedCode(member,before));
 await mp.getByRole('button',{name:'Sign in'}).click();
 // A brand-new member is asked for their name once.
 await expect(mp.getByRole('dialog',{name:'What should we call you?'})).toBeVisible();await nameIfAsked(mp,'Bea');
 await expect(mp.getByRole('button',{name:'Create a vacation'})).toHaveCount(0);
 await mp.getByRole('button',{name:new RegExp(tripName)}).click();
 await openSection(mp,'People');
 await expect(mp.getByRole('button',{name:'Add family',exact:true})).toHaveCount(0);
 await expect(mp.getByRole('button',{name:'Edit Ana'})).toHaveCount(0);
 await openSection(mp,'Spend');
 const quick=await openExpenseForm(mp);
 await quick.getByLabel('What was it?').fill('Pastéis de nata');await quick.getByLabel('Amount in EUR').fill('7.20');
 await quick.getByRole('button',{name:'Save expense'}).click();
 await expect(mp.locator('.list-row',{hasText:'Pastéis de nata'})).toBeVisible();
 await memberContext.close();
 await page.reload();await openSection(page,'Spend');
 await expect(page.locator('.list-row',{hasText:'Pastéis de nata'})).toContainText('€7.20');
 await openSection(page,'People');
 await expect(page.getByRole('button',{name:'Edit Bea'})).toContainText('Signed in');
});
