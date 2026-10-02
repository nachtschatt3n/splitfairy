import {test,expect} from '@playwright/test';
import {createTrip,openSection,signInAsAdmin,unique} from './helpers.js';

test('a ticked item flashes, waits a moment, then moves below the open ones; a second tap undoes it',async({page},testInfo)=>{
 test.setTimeout(90_000);
 await signInAsAdmin(page);
 await createTrip(page,unique(testInfo,'Tick'));
 await openSection(page,'Shop');
 const list=page.getByRole('region',{name:'Shopping list'}),add=list.getByLabel('Add to the list');
 for(const text of ['Bread','Milk','Eggs','Olives']){await add.fill(text);await add.press('Enter');await expect(list).toContainText(text);}
 const rows=list.locator('.shop-row');
 const names=async()=>(await rows.allInnerTexts()).map(t=>t.split('\n')[0].trim());
 await expect.poll(names).toEqual(['Bread','Milk','Eggs','Olives']);
 // No "Saved." note pushing the list down on every tick.
 if(await page.locator('.toast').count())await page.locator('.toast').click();
 const dir=process.env.SHOT_DIR,p=testInfo.project.name;
 await rows.filter({hasText:'Bread'}).getByRole('checkbox').click();
 // At once: ticked and flashing, but still in place.
 await expect(rows.filter({hasText:'Bread'}).getByRole('checkbox')).toBeChecked();
 await expect(rows.filter({hasText:'Bread'})).toHaveClass(/just-ticked/);
 if(dir)await page.screenshot({path:`${dir}/${p}-tick-1-flash.png`});
 expect((await names())[0]).toBe('Bread');
 await expect(page.locator('.toast')).toHaveCount(0);
 // A second item ticked quickly: both wait for the last tap and move together.
 await page.waitForTimeout(500);
 await rows.filter({hasText:'Eggs'}).getByRole('checkbox').click();
 await page.waitForTimeout(600);
 expect(await names()).toEqual(['Bread','Milk','Eggs','Olives']);
 if(dir)await page.screenshot({path:`${dir}/${p}-tick-2-waiting.png`});
 await expect.poll(names,{timeout:5000}).toEqual(['Milk','Olives','Bread','Eggs']);
 await expect(list.locator('.done-divider')).toContainText('Bought · 2');
 if(dir){await page.waitForTimeout(500);await page.screenshot({path:`${dir}/${p}-tick-3-moved.png`});}
 // Tapping twice within the pause changes nothing.
 const milk=rows.filter({hasText:'Milk'}).getByRole('checkbox');
 await milk.click();await milk.click();
 await page.waitForTimeout(1500);
 expect((await names())[0]).toBe('Milk');await expect(milk).not.toBeChecked();
 // Unticking moves it back up after the pause, and it is saved.
 await rows.filter({hasText:'Bread'}).getByRole('checkbox').click();
 await expect.poll(names,{timeout:5000}).toEqual(['Bread','Milk','Olives','Eggs']);
 await page.reload();
 await expect(list.locator('.done-divider')).toContainText('Bought · 1');
 // A dialog opened during the pause stays open when the tick is saved.
 await rows.filter({hasText:'Olives'}).getByRole('checkbox').click();
 await page.getByRole('button',{name:'Add new'}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect.poll(async()=>(await (await page.request.get(`/api/v1/trips/${decodeURIComponent(new URL(page.url()).pathname.split('/')[2])}`)).json()).trip.shopping.find((i:any)=>i.text==='Olives').done,{timeout:5000}).toBe(true);
 await page.waitForTimeout(400);
 await expect(page.getByRole('dialog')).toBeVisible();
});
