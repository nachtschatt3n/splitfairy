import {test,expect} from '@playwright/test';
import {addFamily,addPerson,createTrip,openSection,shot,signInAsAdmin,unique} from './helpers.js';
import {ADMIN} from './env.js';

test('quick add keeps its choices, items rename and delete in place, and private items stay in the family',async({page},testInfo)=>{
 test.setTimeout(150_000);
 await signInAsAdmin(page);
 await createTrip(page,unique(testInfo,'Packing'));
 await openSection(page,'People');
 await addFamily(page,'Uhl');await addFamily(page,'Moncrief');
 // The signed-in organizer is Mathias in the Uhl family.
 await addPerson(page,'Mathias','Uhl',{email:ADMIN});await addPerson(page,'Will','Moncrief');
 await openSection(page,'Pack');
 const pack=page.getByRole('region',{name:'Packing list'}),field=pack.getByLabel('Add something to bring');
 await pack.getByLabel('Who brings it').selectOption({label:'Uhl'});
 await pack.getByRole('button',{name:'Everyone'}).click();await expect(pack.getByRole('button',{name:'Only us'})).toHaveAttribute('aria-pressed','true');
 // Type, Enter, type, Enter: focus and choices stay.
 await field.fill('Underwear');await field.press('Enter');await expect(field).toBeFocused();await expect(field).toHaveValue('');
 await field.fill('2x swimsuits');await field.press('Enter');
 await field.fill('toothbrush x3');await field.press('Enter');
 const uhl=pack.locator('.shop-group',{hasText:'Uhl'});
 await expect(uhl).toContainText('2 × swimsuits');await expect(uhl).toContainText('3 × toothbrush');
 await expect(uhl.locator('.pack-row',{hasText:'Underwear'}).locator('.pack-lock')).toHaveCount(1);
 // Shared again for the grill.
 await pack.getByRole('button',{name:'Only us'}).click();await field.fill('Grill');await field.press('Enter');
 await expect(uhl.locator('.pack-row',{hasText:'Grill'}).locator('.pack-lock')).toHaveCount(0);
 // Rename in place, then delete in place.
 await uhl.getByRole('button',{name:'Rename Underwear'}).click();
 const rename=uhl.getByLabel('Rename Underwear');await rename.fill('Underwear and socks');await rename.press('Enter');
 await expect(uhl).toContainText('Underwear and socks');
 await uhl.getByRole('button',{name:'Rename Grill'}).click();await uhl.getByRole('button',{name:'Delete Grill'}).click();
 await expect(uhl).not.toContainText('Grill');
 // The choices are remembered after a reload.
 await page.reload();await expect(pack.getByLabel('Who brings it')).toHaveValue(/.+/);
 await expect(pack.getByRole('button',{name:'Everyone'})).toBeVisible();
 await shot(page,testInfo,'packing');
});
