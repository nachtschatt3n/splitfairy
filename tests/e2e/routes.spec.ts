import {test,expect} from '@playwright/test';
import {createTrip,openSection,signInAsAdmin,unique,iso} from './helpers.js';

test('clean URLs follow the trip, section and day, and back and forward restore them',async({page},testInfo)=>{
 test.setTimeout(120_000);
 await signInAsAdmin(page);
 const name=unique(testInfo,'Routes');await createTrip(page,name,iso(0),iso(5));
 await expect(page).toHaveURL(/\/trips\/[^/]+$/);
 const base=new URL(page.url()).pathname;
 await openSection(page,'Plan');await expect(page).toHaveURL(`${base}/plan`);
 await page.locator('.day-strip button').nth(2).click();await expect(page).toHaveURL(`${base}/plan/${iso(2)}`);
 await openSection(page,'Spend');await expect(page).toHaveURL(`${base}/spend`);
 await openSection(page,'Settle');await expect(page).toHaveURL(`${base}/settle`);

 await page.goBack();await expect(page).toHaveURL(`${base}/spend`);await expect(page.getByRole('region',{name:'Trip spending'})).toBeVisible();
 await page.goBack();await expect(page).toHaveURL(`${base}/plan/${iso(2)}`);
 await expect(page.locator('.day-strip button').nth(2)).toHaveAttribute('aria-selected','true');
 await page.goBack();await expect(page).toHaveURL(`${base}/plan`);
 await page.goForward();await expect(page.locator('.day-strip button').nth(2)).toHaveAttribute('aria-selected','true');

 // A deep link survives a reload.
 await page.reload();await expect(page.locator('.day-strip button').nth(2)).toHaveAttribute('aria-selected','true');
 await expect(page).toHaveURL(`${base}/plan/${iso(2)}`);

 // Back closes an open sheet instead of leaving the page.
 await page.getByRole('button',{name:'Add stay'}).click();await expect(page.getByRole('dialog')).toBeVisible();
 await page.goBack();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page).toHaveURL(`${base}/plan/${iso(2)}`);
 // Closing it in the app does not leave an extra history step behind.
 await page.getByRole('button',{name:'Add stay'}).click();await page.getByRole('dialog').getByRole('button',{name:'Close'}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.goBack();await expect(page).toHaveURL(`${base}/plan`);

 // The trip list has its own URL, and back returns to the trip.
 await page.goForward();await page.getByRole('button',{name:/Switch trip/}).first().click();await expect(page).toHaveURL(/\/trips$/);
 await page.goBack();await expect(page).toHaveURL(`${base}/plan/${iso(2)}`);await expect(page.getByRole('heading',{name:'The plan'})).toBeVisible();
});

test('every section opens straight from its URL after a reload',async({page},testInfo)=>{
 test.setTimeout(90_000);
 await signInAsAdmin(page);
 await createTrip(page,unique(testInfo,'Deep links'),iso(0),iso(3));
 const base=new URL(page.url()).pathname;
 for(const [slug,heading] of [['people','Your people'],['spend','Every little thing'],['settle','All settled, together'],['pack','Who brings what'],['shop','What we need'],['plan','The plan']] as const){
  await page.goto(`${base}/${slug}`);await expect(page.getByRole('heading',{name:heading})).toBeVisible();
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
 }
});
