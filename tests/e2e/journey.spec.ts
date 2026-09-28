import {test,expect,type Page} from '@playwright/test';
import {addFamily,addPerson,createTrip,isPhone,openSection,shot,signInAsAdmin,unique} from './helpers.js';
const iso=(days:number)=>{const d=new Date(Date.now()+days*86400_000);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const sheet=(page:Page)=>page.getByRole('dialog');
const closed=(page:Page)=>expect(page.getByRole('dialog')).toHaveCount(0);

test('travel, stays and routed packing come together on the day timeline',async({page},testInfo)=>{
 test.setTimeout(150_000);
 page.on('dialog',d=>d.accept());
 await signInAsAdmin(page);
 const name=unique(testInfo,'Journey');await createTrip(page,name,iso(2),iso(8));
 await openSection(page,'People');
 await addFamily(page,'Uhl');await addFamily(page,'Moncrief');
 await addPerson(page,'Mathias','Uhl');await addPerson(page,'Will','Moncrief');

 await openSection(page,'Plan');
 // Day 1: fly in, then stay one night in Lisbon; the house follows from day 2.
 await page.getByRole('button',{name:'Add travel'}).click();
 await sheet(page).getByLabel('Car or flight').selectOption('__new');
 await sheet(page).getByLabel('Name',{exact:true}).fill('Uhl plane');await sheet(page).getByLabel('Type').selectOption('plane');
 await sheet(page).getByLabel('From').fill('Frankfurt (FRA)');await sheet(page).getByLabel('To').fill('Lisbon (LIS)');
 await sheet(page).getByLabel('At',{exact:true}).first().fill('07:10');await sheet(page).getByLabel('At',{exact:true}).last().fill('09:05');
 await sheet(page).locator('label.chip',{hasText:'Mathias'}).click();
 await sheet(page).getByRole('button',{name:'Add travel'}).click();await closed(page);
 await page.getByRole('button',{name:'Add stay'}).click();
 await sheet(page).getByLabel('Name',{exact:true}).fill('Casa Alfama');await sheet(page).getByLabel('Address (optional)').fill('Rua de São Miguel 5, Lisboa');
 await sheet(page).getByLabel('Check-in time').fill('15:00');
 await sheet(page).getByLabel('Booking cost (optional)').fill('180');await sheet(page).getByLabel('Paid by').selectOption({label:'Uhl'});
 await sheet(page).getByRole('button',{name:'Add stay'}).click();await closed(page);
 await page.getByRole('button',{name:'Plan a meal or activity'}).click();
 await sheet(page).getByLabel('What is it?').fill('Dinner in a tasca');await sheet(page).getByLabel('Type').selectOption('dinner');await sheet(page).getByLabel('Time (optional)').fill('20:00');
 await sheet(page).getByRole('button',{name:'Add to plan'}).click();await closed(page);
 await page.getByRole('button',{name:'Plan a meal or activity'}).click();
 await sheet(page).getByLabel('What is it?').fill('Pick up keys');await sheet(page).getByLabel('Type').selectOption('activity');
 await sheet(page).getByRole('button',{name:'Add to plan'}).click();await closed(page);

 const day=page.getByRole('region',{name:/Plans for/});
 // Untimed first, then by time: keys, flight 07:10, check-in 15:00, dinner 20:00.
 await expect.poll(async()=>(await day.locator('.timeline article').evaluateAll(a=>a.map(x=>x.getAttribute('aria-label')))).join(' | '))
  .toBe('Pick up keys | Uhl plane: Frankfurt (FRA) → Lisbon (LIS) | Check in · Casa Alfama | Dinner in a tasca');
 await expect(day.getByRole('article',{name:'Check in · Casa Alfama'})).toContainText('€180.00');
 await expect(day.getByRole('link',{name:/Rua de São Miguel/})).toHaveAttribute('href',/google\.com\/maps/);

 // A second stay: check-out comes before check-in on the day in between.
 await page.locator('.day-strip button').nth(1).click();
 await page.getByRole('button',{name:'Add stay'}).click();
 await sheet(page).getByLabel('Name',{exact:true}).fill('Casa das Dunas');await sheet(page).getByLabel('Check-out day').fill(iso(8));
 await sheet(page).getByRole('button',{name:'Add stay'}).click();await closed(page);
 await expect(day.locator('.timeline article').first()).toHaveAttribute('aria-label','Check out · Casa Alfama');
 await expect(day.getByRole('article',{name:'Check in · Casa das Dunas'})).toContainText('5 nights');
 await page.locator('.day-strip button').nth(3).click();
 await expect(day.getByRole('article',{name:'Staying at Casa das Dunas'})).toBeVisible();
 if(!isPhone(page))await expect(page.getByRole('region',{name:'Whole trip'})).toContainText('Casa das Dunas');
 await shot(page,testInfo,'journey-day');

 // Booking cost became a shared Stay expense.
 await openSection(page,'Spend');
 await expect(page.getByRole('button',{name:'Open Stay: Casa Alfama'})).toContainText('€180.00');

 // Packing: the travel cot flies with the Uhls, then rides in the Moncrief car.
 await openSection(page,'Pack');
 const pack=page.getByRole('region',{name:'Packing list'});
 await pack.getByRole('button',{name:'Add car or flight'}).click();
 await sheet(page).getByLabel('Whose (optional)').selectOption({label:'Moncrief'});await sheet(page).getByRole('button',{name:'Add',exact:true}).click();await closed(page);
 await page.getByLabel('Add something to bring').fill('Travel cot');await page.getByRole('button',{name:'Add item'}).click();
 await pack.getByRole('button',{name:'Edit Travel cot'}).click();
 await sheet(page).getByRole('button',{name:'Add a car or flight'}).click();
 await sheet(page).getByLabel('Vehicle 1',{exact:true}).selectOption({label:'Uhl plane'});
 await sheet(page).getByRole('button',{name:'Add another vehicle'}).click();
 await sheet(page).getByLabel('Vehicle 2',{exact:true}).selectOption({label:'Moncrief car'});
 await sheet(page).getByRole('button',{name:'Save changes'}).click();await closed(page);
 await expect(pack.locator('.shop-row',{hasText:'Travel cot'})).toContainText('Uhl plane → Moncrief car');
 await pack.getByRole('button',{name:'By transport'}).click();
 await expect(pack.locator('.shop-group',{has:page.locator('h3',{hasText:'Uhl plane'})})).toContainText('Travel cot');
 await expect(pack.locator('.shop-group',{has:page.locator('h3',{hasText:'Moncrief car'})})).toContainText('Travel cot');
 // The flight on day 1 now shows what it carries.
 await openSection(page,'Plan');await page.locator('.day-strip button').first().click();
 await expect(day.getByRole('article',{name:/Uhl plane/})).toContainText('Travel cot');
});
