import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
import {addFamily,addPerson,createTrip,openSection,shot,signInAsAdmin,unique,iso} from './helpers.js';
const sheet=(page:Page)=>page.getByRole('dialog').last();
const picture=(color:string)=>sharp({create:{width:1200,height:800,channels:3,background:color}}).jpeg().toBuffer();

test('everyone can add photos of a place, open them, and they become the trip cover',async({page},testInfo)=>{
 test.setTimeout(150_000);
 page.on('dialog',d=>d.accept());
 await signInAsAdmin(page);
 const name=unique(testInfo,'Photos');await createTrip(page,name,iso(0),iso(4));
 await openSection(page,'People');await addFamily(page,'Silva');await addPerson(page,'Ana','Silva');
 await openSection(page,'Plan');
 await page.getByRole('button',{name:'Add stay'}).click();
 await expect(sheet(page)).toContainText('You can add photos of the place once it');
 await sheet(page).getByLabel('Name',{exact:true}).fill('Casa das Dunas');
 await sheet(page).getByRole('button',{name:'Add stay'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);

 const day=page.getByRole('region',{name:/Plans for/});
 await expect(day.getByText('Add photos of Casa das Dunas')).toBeVisible();
 await day.getByRole('button',{name:'Edit Casa das Dunas'}).click();
 await sheet(page).getByLabel('Add photos').setInputFiles([{name:'house.jpg',mimeType:'image/jpeg',buffer:await picture('#3a7ca5')},{name:'beach.jpg',mimeType:'image/jpeg',buffer:await picture('#e9c46a')}]);
 await expect(sheet(page).locator('.photo-tile')).toHaveCount(2,{timeout:30_000});
 await expect(page.getByText('2 photos added.')).toBeVisible();
 await sheet(page).getByRole('button',{name:'Close'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);

 const cover=day.getByRole('button',{name:'Photos of Casa das Dunas (2)'});
 await expect(cover).toBeVisible();await expect(cover).toContainText('+1');
 await expect.poll(()=>cover.locator('img').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth)).toBe(480);
 await cover.click();
 await expect(sheet(page)).toContainText('Photo 1 of 2');await expect(sheet(page)).toContainText('Added by');
 await sheet(page).getByRole('button',{name:'Next photo'}).click();await expect(sheet(page)).toContainText('Photo 2 of 2');
 await shot(page,testInfo,'photo-viewer');
 await sheet(page).getByRole('button',{name:'Remove photo'}).click();
 await expect(sheet(page)).toContainText('Photo 1 of 1');
 await sheet(page).getByRole('button',{name:'Close'}).click();
 await expect(day.getByRole('button',{name:'Photos of Casa das Dunas (1)'})).toBeVisible();
 await expect(day.getByText('Add photos of Casa das Dunas')).toHaveCount(0);

 // Meals get a recipe link and a photo of the dish.
 await page.getByRole('button',{name:'Plan a meal or activity'}).click();
 await sheet(page).getByLabel('What is it?').fill('Cataplana');await sheet(page).getByLabel('Type').selectOption('dinner');
 await sheet(page).getByLabel('Recipe link (optional)').fill('https://www.chefkoch.de/rezepte/123/cataplana.html');
 await sheet(page).getByRole('button',{name:'Add to plan'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 const dinner=day.getByRole('article',{name:'Cataplana'});
 await expect(dinner.getByRole('link',{name:/Recipe · chefkoch\.de/})).toHaveAttribute('href','https://www.chefkoch.de/rezepte/123/cataplana.html');
 await dinner.getByRole('button',{name:'Edit Cataplana'}).click();
 await sheet(page).getByLabel('Add photos').setInputFiles({name:'dish.jpg',mimeType:'image/jpeg',buffer:await picture('#c1440e')});
 await expect(sheet(page).locator('.photo-tile')).toHaveCount(1,{timeout:30_000});
 await sheet(page).getByRole('button',{name:'Close'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(dinner.getByRole('button',{name:'Photos of Cataplana (1)'})).toBeVisible();
 await shot(page,testInfo,'meal-photo');

 // Stays have a booking link, notes, their own arrival times per family, and documents.
 await day.getByRole('button',{name:'Edit Casa das Dunas'}).first().click();
 await sheet(page).getByLabel('Booking link (optional)').fill('https://www.airbnb.com/rooms/12345');
 await sheet(page).getByLabel('Notes (optional)').fill('Key box at the gate.\nWi-Fi: Dunas2026');
 await sheet(page).getByRole('button',{name:'Add arrival and departure times'}).click();
 const row=sheet(page).locator('.schedule-row').first();
 await row.getByLabel('Who').selectOption({label:'Ana'});await row.getByLabel('at').first().fill('18:30');
 await sheet(page).getByLabel('Attach files').setInputFiles({name:'Booking confirmation.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n% test booking\n')});
 await expect(sheet(page).locator('.file-list')).toContainText('Booking confirmation.pdf',{timeout:30_000});
 const [download]=await Promise.all([page.waitForEvent('download'),sheet(page).getByRole('link',{name:/Booking confirmation\.pdf/}).click()]);
 expect(download.suggestedFilename()).toBe('Booking confirmation.pdf');
 await sheet(page).getByRole('button',{name:'Save changes'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 const checkin=day.getByRole('article',{name:'Check in · Casa das Dunas'});
 await expect(checkin.getByRole('list',{name:'Arrivals'})).toContainText('Ana arrives at 18:30');
 await expect(checkin.getByRole('link',{name:'Booking'})).toHaveAttribute('href','https://www.airbnb.com/rooms/12345');
 await expect(checkin).toContainText('1 file');
 await shot(page,testInfo,'stay-details');

 // The first photo is the trip's cover on Today and in the trip list.
 await openSection(page,'Today');
 await expect(page.locator('.hero-photo img')).toHaveAttribute('alt','Casa das Dunas');
 await shot(page,testInfo,'today-cover');
 await page.getByRole('button',{name:/Switch trip/}).first().click();
 await expect(page.locator('.trip-card',{hasText:name}).locator('.date-block.with-photo')).toBeVisible();
});
