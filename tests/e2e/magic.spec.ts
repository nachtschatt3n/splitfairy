import {test,expect} from '@playwright/test';
import {addFamily,addPerson,createTrip,openSection,shot,signInAsAdmin,unique} from './helpers.js';

test('the admin copies a sign-in link and it signs the person in once',async({page,browser},testInfo)=>{
 test.setTimeout(120_000);
 await signInAsAdmin(page);
 const name=unique(testInfo,'Magic');await createTrip(page,name);
 const bea=`bea-${testInfo.project.name}-${Date.now()}@splitfairy.test`;
 await openSection(page,'People');await addFamily(page,'Silva');await addPerson(page,'Bea','Silva',{email:bea});
 const tool=page.locator('.magic-block');
 await tool.getByLabel('For',{exact:true}).fill(bea);await tool.getByLabel('Valid for').selectOption('1h');
 await tool.getByRole('button',{name:'Create link'}).click();
 const url=await tool.locator('.token-value code').innerText();
 expect(url).toMatch(/\/login#[A-Za-z0-9_-]{43}$/);
 await shot(page,testInfo,'magic-link');
 // Long links and addresses wrap inside the box instead of widening the page.
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);

 const other=await browser.newContext(testInfo.project.use);const p=await other.newPage();
 await p.goto(url);
 await expect(p.getByText(`Continue as ${bea}?`)).toBeVisible();
 await p.getByRole('button',{name:`Continue as ${bea}`}).click();
 // New people are asked for their name once, then land on their trip list.
 await expect(p.getByRole('dialog',{name:'What should we call you?'})).toBeVisible();
 await p.getByRole('dialog').getByLabel(/name/i).first().fill('Bea');await p.getByRole('dialog').getByRole('button').last().click();
 await expect(p.locator('.trip-card',{hasText:name})).toBeVisible();
 expect(new URL(p.url()).hash).toBe('');
 // Used once: the same link no longer works.
 const again=await other.newPage();await again.goto(url);
 await expect(again.getByRole('alert')).toContainText('expired or was already used');
 await other.close();
});
