import {test,expect,type Page} from '@playwright/test';
import {addFamily,addPerson,createTrip,isPhone,openExpenseForm,openSection,shot,signInAsAdmin,unique} from './helpers.js';
const iso=(days:number)=>{const d=new Date(Date.now()+days*86400_000);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const sheet=(page:Page)=>page.getByRole('dialog');

test('money still owed after a trip is overdue everywhere, blocks archiving, and clears once repaid',async({page},testInfo)=>{
 test.setTimeout(150_000);
 page.on('dialog',d=>d.accept());
 await signInAsAdmin(page);
 const name=unique(testInfo,'Overdue');await createTrip(page,name,iso(-12),iso(-5));
 await openSection(page,'People');await addFamily(page,'Uhl');await addFamily(page,'Moncrief');
 await addPerson(page,'Mathias','Uhl');await addPerson(page,'Will','Moncrief');
 await openSection(page,'Spend');
 const form=await openExpenseForm(page);
 await form.getByLabel('Amount in EUR').fill('100');await form.getByLabel('What was it?').fill('House');await form.getByLabel('Paid by').selectOption({label:'Uhl'});
 await form.getByRole('button',{name:'Save expense'}).click();await expect(sheet(page)).toHaveCount(0);

 await openSection(page,'Today');
 await expect(page.getByRole('button',{name:/Settle up: overdue 5 days/})).toContainText('Moncrief owes Uhl €50.00');
 await expect(page.locator(isPhone(page)?'.mobile-nav .nav-alert':'.sidebar .nav-alert')).toHaveCount(1);
 await page.getByRole('button',{name:/Settle up: overdue 5 days/}).click();
 await expect(page.getByRole('alert')).toContainText('Overdue for 5 days');
 await expect(page.locator('.transfer-row').first()).toContainText('Overdue 5 days');
 await shot(page,testInfo,'overdue-settle');

 // Archiving waits until everyone is square.
 await openSection(page,'People');await page.getByRole('button',{name:'Edit trip'}).click();
 await expect(sheet(page)).toContainText('Settle up first: 1 repayment is still open');
 await expect(sheet(page).getByRole('button',{name:'Archive trip'})).toHaveCount(0);
 await expect(sheet(page).getByLabel(/Weekly settle-up reminders/)).toBeChecked();
 await sheet(page).getByRole('button',{name:'Close'}).click();

 // The trip list puts it on top.
 await page.getByRole('button',{name:/Switch trip/}).first().click();
 const card=page.locator('.trip-card',{hasText:name});
 await expect(card).toContainText('Overdue 5 days · settle up');await expect(card).toHaveClass(/urgent/);
 await shot(page,testInfo,'overdue-list');
 await card.click();

 // Recording the repayment clears everything.
 await openSection(page,'Settle');
 await page.getByRole('button',{name:'Mark Moncrief to Uhl as paid'}).click();
 await sheet(page).getByRole('button',{name:/Record|Save/}).first().click();await expect(sheet(page)).toHaveCount(0);
 await expect(page.getByRole('alert')).toHaveCount(0);
 await expect(page.locator('.nav-alert')).toHaveCount(0);
 await openSection(page,'People');await page.getByRole('button',{name:'Edit trip'}).click();
 await expect(sheet(page).getByRole('button',{name:'Archive trip'})).toBeVisible();
});
