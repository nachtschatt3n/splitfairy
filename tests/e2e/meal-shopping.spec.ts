import {test,expect} from '@playwright/test';
import {addFamily,addPerson,createTrip,openSection,planEvent,shot,signInAsAdmin,unique} from './helpers.js';
import {ADMIN} from './env.js';

test('a meal with many ingredients folds them into one line that opens on tap',async({page},testInfo)=>{
 test.setTimeout(120_000);
 await signInAsAdmin(page);
 await createTrip(page,unique(testInfo,'Pancakes'));
 await openSection(page,'People');await addFamily(page,'Uhl');await addPerson(page,'Mathias','Uhl',{email:ADMIN});
 await openSection(page,'Plan');await planEvent(page,'Pancakes','breakfast');
 const card=page.getByRole('article',{name:'Pancakes'});
 const add=card.getByLabel('Add to shopping for Pancakes');
 for(const text of ['900g flour','200g butter','1.5L whole milk','Maple syrup','Strawberries']){await add.fill(text);await add.press('Enter');await expect(card).toContainText(text);}
 // Still open while adding; everyone claims it for Uhl.
 await expect(add).toBeVisible();
 for(const text of ['900g flour','200g butter','1.5L whole milk','Maple syrup','Strawberries']){const row=card.locator('.shop-row',{hasText:text});await row.getByRole('button',{name:"We'll buy it"}).click();await expect(row.getByRole('button',{name:"We'll buy it"})).toHaveCount(0);}
 // Opening the day again shows it folded, with the buyer said once.
 await page.reload();
 const toggle=card.getByRole('button',{name:/shopping for Pancakes/});
 await expect(toggle).toHaveAttribute('aria-expanded','false');
 await expect(toggle).toContainText('5 ingredients · 5 to buy · Uhl buys all');
 await expect(toggle).toContainText('900g flour, 200g butter, 1.5L whole milk +2');
 await expect(card.locator('.shop-row')).toHaveCount(0);
 await shot(page,testInfo,'meal-folded');
 await toggle.click();
 await expect(card.locator('.shop-row')).toHaveCount(5);
 await expect(card.locator('.buyer-tag')).toHaveCount(0);
 await expect(add).toBeVisible();
 await card.locator('.shop-row',{hasText:'Maple syrup'}).getByRole('checkbox').click();
 await expect(toggle).toContainText('4 to buy');
 await toggle.click();await expect(card.locator('.shop-row')).toHaveCount(0);
});
