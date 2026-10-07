import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import {createTrip,openSection,shot,signInAsAdmin,unique} from './helpers.js';

const photo=(background:string)=>sharp({create:{width:400,height:600,channels:3,background}}).jpeg().toBuffer();

test('receipts come from the camera or from files, several at once, one receipt per photo',async({page},testInfo)=>{
 test.setTimeout(90_000);
 await signInAsAdmin(page);
 const name=unique(testInfo,'Scan many');await createTrip(page,name);
 await page.getByRole('button',{name:'Add new'}).click();
 await page.getByRole('dialog').getByRole('button',{name:/Scan a receipt/}).click();
 const dialog=page.getByRole('dialog');
 // The camera button asks for the camera; the files button offers the library and Files, several at once.
 await expect(dialog.getByLabel('Take a photo of a receipt')).toHaveAttribute('capture','environment');
 const files=dialog.getByLabel('Choose receipt photos or files');
 await expect(files).not.toHaveAttribute('capture',/.*/);await expect(files).toHaveAttribute('multiple','');
 await files.setInputFiles([{name:'a.jpg',mimeType:'image/jpeg',buffer:await photo('#fbfaf5')},{name:'b.jpg',mimeType:'image/jpeg',buffer:await photo('#f5f0e1')}]);
 await dialog.getByLabel('Take a photo of a receipt').setInputFiles({name:'c.jpg',mimeType:'image/jpeg',buffer:await photo('#eeeeee')});
 await expect(dialog.getByRole('list',{name:'Receipts to upload'}).getByRole('listitem')).toHaveCount(3);
 await shot(page,testInfo,'scan-many');
 // Several photos are one long receipt unless you say otherwise.
 await expect(dialog.getByRole('button',{name:'One long receipt'})).toHaveAttribute('aria-pressed','true');
 await expect(dialog.getByRole('button',{name:'Read 1 receipt (3 photos)'})).toBeVisible();
 await dialog.getByRole('button',{name:'Separate receipts'}).click();
 await dialog.getByRole('button',{name:'Remove receipt 3'}).click();
 await dialog.getByRole('button',{name:'Read 2 receipts'}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 const tripId=decodeURIComponent(new URL(page.url()).pathname.split('/')[2]);
 await expect.poll(async()=>(await (await page.request.get(`/api/v1/trips/${tripId}`)).json()).trip.receipts.length,{timeout:15_000}).toBe(2);
 // Those two were really one receipt: combine them in the inbox, in order.
 await openSection(page,'Spend');
 const inbox=page.getByRole('region',{name:'Receipt inbox'});
 await expect(inbox.locator('.receipt-row')).toHaveCount(2);
 await expect.poll(async()=>(await (await page.request.get(`/api/v1/trips/${tripId}`)).json()).trip.receipts.every((r:any)=>r.status!=='processing'&&r.status!=='queued'),{timeout:30_000}).toBe(true);
 // Both read receipts show up in the expenses overview by themselves (live update, no reload), marked to check.
 await expect(page.getByRole('button',{name:/^Review receipt/})).toHaveCount(2,{timeout:8000});
 await expect(page.locator('.list-row.to-check').first()).toContainText('not in the totals yet');
 await shot(page,testInfo,'receipts-to-check');
 await page.reload();
 await inbox.getByRole('button',{name:'Combine photos'}).click();
 const picks=inbox.getByRole('checkbox');
 await picks.nth(1).check();await picks.nth(0).check();
 await shot(page,testInfo,'combine-receipts');
 await inbox.getByRole('button',{name:'Combine 2 photos into one receipt'}).click();
 await expect(inbox.locator('.receipt-row')).toHaveCount(1);
 await expect(inbox.locator('.receipt-row')).toContainText('2 photos');
 // A long receipt taken in parts goes up as one receipt with all its photos.
 await page.getByRole('button',{name:'Add new'}).click();
 await page.getByRole('dialog').getByRole('button',{name:/Scan a receipt/}).click();
 await page.getByRole('dialog').getByLabel('Choose receipt photos or files').setInputFiles([{name:'top.jpg',mimeType:'image/jpeg',buffer:await photo('#fafafa')},{name:'bottom.jpg',mimeType:'image/jpeg',buffer:await photo('#f0f0f0')}]);
 await page.getByRole('dialog').getByRole('button',{name:'Read 1 receipt (2 photos)'}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect.poll(async()=>(await (await page.request.get(`/api/v1/trips/${tripId}`)).json()).trip.receipts.map((r:any)=>r.pages??1).sort(),{timeout:15_000}).toEqual([2,2]);
});
