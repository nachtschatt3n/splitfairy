import {test,expect} from '@playwright/test';
import {addFamily,addPerson,createTrip,openSection,operatorCode,shot,signInAsAdmin,tripList,unique} from './helpers.js';
import {ADMIN} from './env.js';

test('when another family grabs something at the store, everyone sees it within seconds, with whose cart it is in',async({page,browser},testInfo)=>{
 test.setTimeout(120_000);
 const wolf=`wolf-${testInfo.project.name}-${Date.now().toString(36)}@splitfairy.test`;
 await signInAsAdmin(page);
 const name=unique(testInfo,'Live');await createTrip(page,name);
 await openSection(page,'People');await addFamily(page,'Uhl');await addFamily(page,'Wolf');
 await addPerson(page,'Mathias','Uhl',{email:ADMIN});await addPerson(page,'Wilma','Wolf',{email:wolf});
 await openSection(page,'Shop');
 const list=page.getByRole('region',{name:'Shopping list'});
 for(const text of ['Butter','Eggs']){await list.getByLabel('Add to the list').fill(text);await list.getByLabel('Add to the list').press('Enter');await expect(list).toContainText(text);}
 await list.getByRole('button',{name:'We’re at the store'}).click();
 // Wilma from the Wolf family, on her own phone.
 const other=await browser.newContext({...testInfo.project.use,baseURL:testInfo.project.use.baseURL});
 const phone=await other.newPage();
 const verify=await phone.request.post('/api/v1/auth/verify',{data:{email:wolf,code:operatorCode(wolf),name:'Wilma'}});
 expect(verify.ok(),await verify.text()).toBe(true);
 await phone.goto('/');await expect(tripList(phone)).toBeVisible();
 await phone.getByRole('button',{name:new RegExp(name)}).click();
 await openSection(phone,'Shop');
 await phone.getByRole('button',{name:'We’re at the store'}).click();
 const started=Date.now();
 await phone.locator('.shop-row',{hasText:'Butter'}).getByRole('checkbox').click();
 // Mathias gets a note and sees it in the Wolf cart, well before the 15-second refresh.
 await expect(page.getByRole('status').filter({hasText:'Wolf grabbed Butter'})).toBeVisible({timeout:6000});
 expect(Date.now()-started).toBeLessThan(6000);
 await expect(list.locator('.shop-row',{hasText:'Butter'})).toContainText('In Wolf’s cart');
 await shot(page,testInfo,'live-grabbed');
 await expect(list.locator('.shop-group',{hasText:'Wolf’s cart'})).toContainText('Butter',{timeout:8000});
 await other.close();
});
