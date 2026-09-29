import {test,expect} from '@playwright/test';
import {createTrip,openSection,planEvent,shot,signInAsAdmin,unique} from './helpers.js';

test('a plan, stay or travel can be deleted from the sheet header without scrolling',async({page},testInfo)=>{
 test.setTimeout(90_000);
 page.on('dialog',d=>d.accept());
 await signInAsAdmin(page);
 await createTrip(page,unique(testInfo,'Delete from header'));
 await openSection(page,'Plan');
 await planEvent(page,'Pizza night','dinner');
 await page.getByRole('button',{name:'Edit Pizza night'}).click();
 const sheet=page.getByRole('dialog');
 // Both are there: the trash in the header (visible right away) and a red delete at the bottom.
 await expect(sheet.getByRole('button',{name:'Delete Pizza night'})).toBeInViewport();
 await expect(sheet.getByRole('button',{name:'Delete dinner'})).toBeAttached();
 await shot(page,testInfo,'delete-header');
 await sheet.getByRole('button',{name:'Delete Pizza night'}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByRole('article',{name:'Pizza night'})).toHaveCount(0);
 // A new plan has nothing to delete yet.
 await page.getByRole('button',{name:'Plan a meal or activity'}).click();
 await expect(page.getByRole('dialog').getByRole('button',{name:/^Delete/})).toHaveCount(0);
 await page.getByRole('dialog').getByRole('button',{name:'Close'}).click();
 // Travel, from the header as well.
 await page.getByRole('button',{name:'Add travel'}).click();
 await page.getByRole('dialog').getByLabel('Car or flight').selectOption('__new');await page.getByRole('dialog').getByLabel('Name',{exact:true}).fill('Uhl car');
 await page.getByRole('dialog').getByLabel('From').fill('Frankfurt (FRA)');await page.getByRole('dialog').getByLabel('To').fill('Lisbon (LIS)');
 await page.getByRole('dialog').getByRole('button',{name:'Add travel'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:/^Edit .*Lisbon|^Edit travel/}).first().click();
 await page.getByRole('dialog').getByRole('button',{name:'Remove this travel'}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByText('Frankfurt (FRA)')).toHaveCount(0);
});
