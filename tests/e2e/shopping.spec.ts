import {test,expect} from '@playwright/test';
import {addFamily,addPerson,createTrip,openSection,shot,signInAsAdmin,unique} from './helpers.js';
import {ADMIN} from './env.js';

test('grocery items say which family buys them, can be claimed, and filtered',async({page},testInfo)=>{
 test.setTimeout(120_000);
 await signInAsAdmin(page);
 await createTrip(page,unique(testInfo,'Groceries'));
 await openSection(page,'People');await addFamily(page,'Uhl');await addFamily(page,'Moncrief');
 await addPerson(page,'Mathias','Uhl',{email:ADMIN});
 await openSection(page,'Plan');
 const list=page.getByRole('region',{name:'Shopping list'});
 await list.getByLabel('Add to the list').fill('Sardines');await list.getByLabel('Who buys it').selectOption({label:'Moncrief'});await list.getByRole('button',{name:'Add item'}).click();
 await list.getByLabel('Add to the list').fill('Lemons');await list.getByLabel('Who buys it').selectOption({label:'Everyone'});await list.getByRole('button',{name:'Add item'}).click();
 await expect(list.locator('.shop-row',{hasText:'Sardines'})).toContainText('Moncrief buys');
 const lemons=list.locator('.shop-row',{hasText:'Lemons'});
 await expect(lemons.locator('.buyer-tag')).toHaveCount(0);
 await lemons.getByRole('button',{name:"We'll buy it"}).click();
 await expect(lemons).toContainText('Uhl buys');
 await list.scrollIntoViewIfNeeded();await shot(page,testInfo,'shopping-buyers');
 await list.getByLabel('Show').selectOption({label:'Moncrief buys'});
 await expect(list.locator('.shop-row')).toHaveCount(1);await expect(list).toContainText('Sardines');
 await list.getByLabel('Show').selectOption({label:'Everything'});
 // The sheet changes it too.
 await list.getByRole('button',{name:'Edit Sardines'}).click();
 await page.getByRole('dialog').getByLabel('Who buys it').selectOption({label:'Everyone'});await page.getByRole('dialog').getByRole('button',{name:'Save changes'}).click();
 await expect(list.locator('.shop-row',{hasText:'Sardines'}).locator('.buyer-tag')).toHaveCount(0);
});
