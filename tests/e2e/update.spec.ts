import {test,expect} from '@playwright/test';
import {createTrip,signInAsAdmin,unique} from './helpers.js';

// The fake "newer version" answer is set up with page.route, which cannot see requests a service worker makes.
test.use({serviceWorkers:'block'});

test('an app left open on an old version updates when it comes back to the front, but never under an open dialog',async({page},testInfo)=>{
 test.setTimeout(90_000);
 await signInAsAdmin(page);
 await createTrip(page,unique(testInfo,'Update'));
 // The server now has a newer bundle than the one this page runs.
 await page.route(/\/\?version-check=/,async route=>{const html=await (await route.fetch()).text();await route.fulfill({contentType:'text/html',body:html.replace(/\/assets\/index-[\w-]+\.js/,'/assets/index-NEWER.js')});});
 const back=()=>page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 // A dialog is open: offer the update instead of reloading.
 await page.getByRole('button',{name:'Add new'}).click();await expect(page.getByRole('dialog')).toBeVisible();
 await back();
 await expect(page.getByText('A new version of Splitfairy is ready.')).toBeVisible();
 await page.getByRole('dialog').getByRole('button',{name:'Close'}).click();
 // Nothing open: coming back to the app reloads it.
 const reloaded=page.waitForEvent('load',{timeout:20_000});
 await page.locator('body').click({position:{x:5,y:5}});
 await back();
 await reloaded;
});
