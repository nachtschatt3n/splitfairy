import {test,expect} from '@playwright/test';
import {createTrip,openSection,shot,signInAsAdmin,unique} from './helpers.js';

test('a personal access token is shown once, works for the API, and can be revoked',async({page},testInfo)=>{
 test.setTimeout(120_000);
 page.on('dialog',d=>d.accept());
 await signInAsAdmin(page);
 await createTrip(page,unique(testInfo,'Tokens'));
 await openSection(page,'People');
 const block=page.locator('.tokens-block');
 await block.getByLabel('Name').fill(`Claude ${testInfo.project.name}`);
 await block.getByRole('button',{name:'Create token'}).click();
 const value=await block.locator('.token-value code').innerText();
 expect(value).toMatch(/^sfp_[A-Za-z0-9_-]{43}$/);
 await expect(block).toContainText('/mcp');
 await shot(page,testInfo,'tokens');
 const me=await page.request.get('/api/v1/me',{headers:{authorization:`Bearer ${value}`}});expect((await me.json()).email).toBeTruthy();
 const row=block.getByRole('list',{name:'Your access tokens'}).getByRole('listitem').filter({hasText:`Claude ${testInfo.project.name}`});
 await expect(row).toContainText(value.slice(0,8));await expect(row).not.toContainText(value.slice(8,30));
 await row.getByRole('button',{name:/Revoke/}).click();
 await expect(row).toHaveCount(0);await expect(block.locator('.token-value')).toHaveCount(0);
 expect((await page.request.get('/api/v1/trips',{headers:{authorization:`Bearer ${value}`,cookie:''}})).status()).toBe(401);
});
