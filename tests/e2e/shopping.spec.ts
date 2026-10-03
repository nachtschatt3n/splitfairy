import {test,expect} from '@playwright/test';
import {addFamily,addPerson,createTrip,isPhone,openSection,planEvent,shot,signInAsAdmin,unique} from './helpers.js';
import {ADMIN} from './env.js';

test('grocery items say which family buys them, can be claimed, and filtered',async({page},testInfo)=>{
 test.setTimeout(120_000);
 await signInAsAdmin(page);
 await createTrip(page,unique(testInfo,'Groceries'));
 await openSection(page,'People');await addFamily(page,'Uhl');await addFamily(page,'Moncrief');
 await addPerson(page,'Mathias','Uhl',{email:ADMIN});
 await openSection(page,'Shop');
 await expect(page).toHaveURL(/\/shop$/);
 const list=page.getByRole('region',{name:'Shopping list'});
 // "Who buys it" sticks: two Moncrief items in a row, typed and Enter.
 await list.getByLabel('Who buys it').selectOption({label:'Moncrief'});
 await list.getByLabel('Add to the list').fill('Sardines');await list.getByLabel('Add to the list').press('Enter');
 await expect(list.getByLabel('Add to the list')).toBeFocused();
 await list.getByLabel('Add to the list').fill('Olive oil');await list.getByLabel('Add to the list').press('Enter');
 await expect(list.locator('.shop-row',{hasText:'Olive oil'})).toContainText('Moncrief buys');
 await list.getByLabel('Who buys it').selectOption({label:'Everyone'});
 await list.getByLabel('Add to the list').fill('Lemons');await list.getByRole('button',{name:'Add item'}).click();
 await expect(list.locator('.shop-row',{hasText:'Sardines'})).toContainText('Moncrief buys');
 const lemons=list.locator('.shop-row',{hasText:'Lemons'});
 await expect(lemons.locator('.buyer-tag')).toHaveCount(0);
 await lemons.getByRole('button',{name:"We'll buy it"}).click();
 await expect(lemons).toContainText('Uhl buys');
 await shot(page,testInfo,'shopping-list');
 await list.getByRole('group',{name:'Show'}).getByRole('button',{name:'Uhl buys'}).click();
 await expect(list.locator('.shop-row')).toHaveCount(1);await expect(list).toContainText('Lemons');
 await list.getByRole('group',{name:'Show'}).getByRole('button',{name:'All'}).click();
 // The sheet changes it too.
 await list.getByRole('button',{name:'Edit Sardines'}).click();
 await page.getByRole('dialog').getByLabel('Who buys it').selectOption({label:'Everyone'});await page.getByRole('dialog').getByRole('button',{name:'Save changes'}).click();
 await expect(list.locator('.shop-row',{hasText:'Sardines'}).locator('.buyer-tag')).toHaveCount(0);

 // At the store: everything still to buy, ours first (Uhl's lemons), others' with their tag; ticked items land in our cart.
 await list.getByRole('button',{name:'We’re at the store'}).click();
 await expect(list.locator('.shop-row').first()).toContainText('Lemons');
 await expect(list.locator('.shop-row',{hasText:'Olive oil'})).toContainText('Moncrief buys');
 await shot(page,testInfo,'shopping-trip');
 await list.locator('.shop-row',{hasText:'Lemons'}).getByRole('checkbox').click();
 // Saved at once, but it stays in "To buy" for a moment, then moves to our cart.
 await expect(list.locator('.shop-row',{hasText:'Lemons'})).toContainText('In Uhl’s cart');
 await expect(list.locator('.shop-group',{hasText:'Our cart'})).toContainText('Lemons',{timeout:8000});
 await list.getByRole('button',{name:'Done shopping'}).click();
 await expect(list.getByLabel('Add to the list')).toBeVisible();

 // The plan shows a summary that opens the list; the Lists tab remembers shopping.
 await openSection(page,'Plan');
 const summary=page.getByRole('region',{name:'Shopping summary'});
 await expect(summary).toContainText('2 to buy');
 await summary.getByRole('button',{name:'Open the shopping list'}).click();
 await expect(page).toHaveURL(/\/shop$/);
 await openSection(page,'Plan');
 if(isPhone(page))await page.getByRole('navigation',{name:'Trip sections'}).getByRole('button',{name:'Lists'}).click();
 else await page.locator('.sidebar .nav').getByRole('button',{name:'Lists'}).click();
 await expect(page.getByRole('region',{name:'Shopping list'})).toBeVisible();
 await page.getByRole('group',{name:'Lists'}).getByRole('button',{name:'Packing'}).click();
 await expect(page).toHaveURL(/\/pack$/);
 await page.goBack();
 await expect(page.getByRole('region',{name:'Shopping list'})).toBeVisible();
});

test('meal ingredients added in the plan appear on the shopping list under the meal',async({page},testInfo)=>{
 test.setTimeout(90_000);
 await signInAsAdmin(page);
 await createTrip(page,unique(testInfo,'Meal list'));
 await openSection(page,'Plan');await planEvent(page,'Pasta night','dinner');
 const dinner=page.getByRole('article',{name:'Pasta night'});
 await dinner.getByLabel('Add to shopping for Pasta night').fill('Basil');await dinner.getByLabel('Add to shopping for Pasta night').press('Enter');
 await openSection(page,'Shop');
 await expect(page.getByRole('region',{name:'Shopping list'}).locator('.shop-row',{hasText:'Basil'})).toContainText('for Pasta night');
 // Adding for a meal from the list.
 await page.getByLabel('For',{exact:true}).selectOption((await page.getByLabel('For',{exact:true}).locator('option',{hasText:'Pasta night'}).getAttribute('value'))!);
 await page.getByLabel('Add to the list').fill('Parmesan');await page.getByLabel('Add to the list').press('Enter');
 await expect(page.getByRole('region',{name:'Shopping list'}).locator('.shop-row',{hasText:'Parmesan'})).toContainText('for Pasta night');
});
