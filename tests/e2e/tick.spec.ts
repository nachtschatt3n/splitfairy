import {test,expect} from '@playwright/test';
import {createTrip,openSection,signInAsAdmin,unique} from './helpers.js';

test('a ticked item is saved at once, stays in place and can be unticked, then moves below after a few seconds',async({page},testInfo)=>{
 test.setTimeout(90_000);
 await signInAsAdmin(page);
 await createTrip(page,unique(testInfo,'Tick'));
 await openSection(page,'Shop');
 const list=page.getByRole('region',{name:'Shopping list'}),add=list.getByLabel('Add to the list');
 for(const text of ['Bread','Milk','Eggs','Olives']){await add.fill(text);await add.press('Enter');await expect(list).toContainText(text);}
 const rows=list.locator('.shop-row');
 const names=async()=>(await rows.allInnerTexts()).map(t=>t.split('\n')[0].trim());
 await expect.poll(names).toEqual(['Bread','Milk','Eggs','Olives']);
 if(await page.locator('.toast').count())await page.locator('.toast').click();
 const tripId=decodeURIComponent(new URL(page.url()).pathname.split('/')[2]);
 const saved=async(text:string)=>(await (await page.request.get(`/api/v1/trips/${tripId}`)).json()).trip.shopping.find((i:any)=>i.text===text).done;
 const dir=process.env.SHOT_DIR,p=testInfo.project.name;
 const bread=rows.filter({hasText:'Bread'}).getByRole('checkbox');
 await bread.click();
 await expect(bread).toBeChecked();
 await expect(rows.filter({hasText:'Bread'})).toHaveClass(/just-ticked/);
 if(dir)await page.screenshot({path:`${dir}/${p}-tick-1-flash.png`});
 // Saved right away, so the others see it; still in its place.
 await expect.poll(()=>saved('Bread')).toBe(true);
 expect((await names())[0]).toBe('Bread');
 await expect(page.locator('.toast')).toHaveCount(0);
 // Other items can be ticked meanwhile, and a slip is undone with a second tap.
 const milk=rows.filter({hasText:'Milk'}).getByRole('checkbox');
 await milk.click();await expect(milk).toBeChecked();
 await milk.click();await expect(milk).not.toBeChecked();
 await expect.poll(()=>saved('Milk')).toBe(false);
 await rows.filter({hasText:'Eggs'}).getByRole('checkbox').click();
 expect(await names()).toEqual(['Bread','Milk','Eggs','Olives']);
 // After about five seconds the ticked ones settle below the open ones.
 await expect.poll(names,{timeout:9000}).toEqual(['Milk','Olives','Bread','Eggs']);
 await expect(list.locator('.done-divider')).toContainText('Bought · 2');
 if(dir){await page.waitForTimeout(600);await page.screenshot({path:`${dir}/${p}-tick-2-settled.png`});}
 // Unticking a settled item brings it straight back up.
 await rows.filter({hasText:'Bread'}).getByRole('checkbox').click();
 await expect.poll(names).toEqual(['Bread','Milk','Olives','Eggs']);
 await expect.poll(()=>saved('Bread')).toBe(false);
 // A dialog opened while an item is settling stays open.
 await rows.filter({hasText:'Olives'}).getByRole('checkbox').click();
 await page.getByRole('button',{name:'Add new'}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.waitForTimeout(6000);
 await expect(page.getByRole('dialog')).toBeVisible();
});
