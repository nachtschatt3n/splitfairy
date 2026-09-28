import {test,expect,type Page} from '@playwright/test';
import {addFamily,addPerson,createTrip,openSection,shot,signInAsAdmin,unique} from './helpers.js';
const sheet=(page:Page)=>page.getByRole('dialog');
const closed=(page:Page)=>expect(page.getByRole('dialog')).toHaveCount(0);

test('a restaurant has an address from the lookup, who joins, and its bill instead of shopping',async({page},testInfo)=>{
 test.setTimeout(150_000);
 page.on('dialog',d=>d.accept());
 await signInAsAdmin(page);
 await createTrip(page,unique(testInfo,'Restaurant'));
 await openSection(page,'People');
 await addFamily(page,'Uhl');await addFamily(page,'Moncrief');
 await addPerson(page,'Mathias','Uhl');await addPerson(page,'Andrea','Uhl');await addPerson(page,'Will','Moncrief');

 await openSection(page,'Plan');
 await page.getByRole('button',{name:'Plan a meal or activity'}).click();
 await sheet(page).getByLabel('Type').selectOption('restaurant');
 await sheet(page).getByLabel('Which restaurant?').fill('Tasca');
 await sheet(page).getByRole('button',{name:'Look up'}).click();
 const found=sheet(page).getByRole('list',{name:'Places found'});
 await expect(found.getByRole('button')).toHaveCount(2);
 await found.getByRole('button',{name:/Tasca do Chico/}).click();
 await expect(sheet(page).getByLabel('Address (optional)')).toHaveValue(/Rua do Diário de Notícias, Bairro Alto, Lisboa/);
 await expect(sheet(page).getByLabel('Which restaurant?')).toHaveValue('Tasca do Chico');
 await expect(sheet(page).getByRole('link',{name:'Open in Maps'})).toHaveAttribute('href',/google\.com\/maps/);
 await sheet(page).getByLabel('Time (optional)').fill('20:30');
 await sheet(page).locator('label.chip',{hasText:'Will'}).click();
 await shot(page,testInfo,'restaurant-sheet');
 await sheet(page).getByRole('button',{name:'Add to plan'}).click();await closed(page);

 const card=page.getByRole('region',{name:/Plans for/}).getByRole('article',{name:'Tasca do Chico'});
 await expect(card).toContainText(/restaurant/i);await expect(card).toContainText('2 joining');
 await expect(card.getByRole('link',{name:/Rua do Diário de Notícias/})).toBeVisible();
 await expect(card.getByLabel(/Add to shopping/)).toHaveCount(0);
 // Restaurants are not offered for shopping items.
 await expect(page.locator('.shop-add select option',{hasText:'Tasca'})).toHaveCount(0);

 // The bill is an expense linked to the restaurant, shared by the people joining.
 await card.getByRole('button',{name:'Add the bill'}).click();
 const form=page.locator('#quick-expense');
 await expect(form.getByLabel('What was it?')).toHaveValue('Tasca do Chico');
 await expect(form).toContainText('Shared by the people joining that plan');
 await form.getByLabel('Amount in EUR').fill('84');await form.getByLabel('Paid by').selectOption({label:'Moncrief'});
 await form.getByRole('button',{name:'Save expense'}).click();await closed(page);
 await expect(page.getByRole('button',{name:'Open Tasca do Chico'})).toContainText('for Tasca do Chico');
 await page.getByRole('button',{name:'Open Tasca do Chico'}).click();
 await expect(sheet(page).locator('.detail-row',{hasText:'Uhl'})).toContainText('€84.00');
 await expect(sheet(page).locator('.detail-row',{hasText:'Uhl'})).toContainText('Mathias €42.00 · Andrea €42.00');
 await sheet(page).getByRole('button',{name:'Close'}).click();

 await openSection(page,'Plan');
 await expect(card).toContainText('The bill: €84.00');
 await expect(card.getByRole('button',{name:'Add another bill'})).toBeVisible();
 await shot(page,testInfo,'restaurant-card');
});
