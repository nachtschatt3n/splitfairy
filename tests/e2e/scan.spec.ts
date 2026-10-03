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
 await dialog.getByRole('button',{name:'Remove receipt 3'}).click();
 await dialog.getByRole('button',{name:'Read 2 receipts'}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 const tripId=decodeURIComponent(new URL(page.url()).pathname.split('/')[2]);
 await expect.poll(async()=>(await (await page.request.get(`/api/v1/trips/${tripId}`)).json()).trip.receipts.length,{timeout:15_000}).toBe(2);
 await openSection(page,'Spend');
});
