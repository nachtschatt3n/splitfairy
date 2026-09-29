import {test,expect} from '@playwright/test';
import {addFamily,addPerson,createTrip,openSection,planEvent,signInAsAdmin,unique} from './helpers.js';

test('a dinner can be deleted, also after its expense is voided',async({page},testInfo)=>{
 test.setTimeout(120_000);
 page.on('dialog',d=>d.accept());
 await signInAsAdmin(page);
 await createTrip(page,unique(testInfo,'Delete dinner'));
 await openSection(page,'People');await addFamily(page,'Uhl');await addPerson(page,'Mathias','Uhl');
 await openSection(page,'Plan');
 // A plain dinner with an ingredient.
 await planEvent(page,'Pizza night','dinner');
 const pizza=page.getByRole('article',{name:'Pizza night'});
 await pizza.getByLabel('Add to shopping for Pizza night').fill('Flour');await pizza.getByLabel('Add to shopping for Pizza night').press('Enter');
 await pizza.getByRole('button',{name:'Edit Pizza night'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Delete dinner'}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(pizza).toHaveCount(0);
 // A dinner with an expense split on it: blocked, then allowed once the expense is voided.
 await planEvent(page,'Fish dinner','dinner');
 // An expense split on the dinner, added through the API.
 const tripId=decodeURIComponent(new URL(page.url()).pathname.split('/')[2]);
 const load=async()=>(await (await page.request.get(`/api/v1/trips/${tripId}`)).json()).trip;
 await expect.poll(async()=>(await load()).events.some((e:any)=>e.title==='Fish dinner')).toBe(true);
 const trip=await load();
 const dinner=trip.events.find((e:any)=>e.title==='Fish dinner'),fam=trip.families[0].id,person=trip.people[0].id;
 const r=await page.request.post(`/api/v1/trips/${tripId}/commands`,{data:{mutationId:crypto.randomUUID(),entity:'expense',action:'save',expectedVersion:0,value:{id:'x1',title:'Fish',date:dinner.date,category:'food',total:3000,payers:[{familyId:fam,amount:3000}],lines:[{id:'l1',label:'Fish',amount:3000,splits:[{amount:3000,eventId:dinner.id,eventVersion:dinner.version,weights:[{id:person,weight:1}]}]}],notes:'',receiptIds:[],status:'posted',version:0}}});
 expect(r.ok(),await r.text()).toBe(true);
 await page.reload();
 await page.getByRole('button',{name:'Edit Fish dinner'}).click();
 await expect(page.getByRole('dialog')).toContainText('cannot be deleted');
 await page.getByRole('dialog').getByRole('button',{name:'Close'}).click();
 await openSection(page,'Spend');
 await page.getByRole('button',{name:'Open Fish'}).click();await page.getByRole('dialog').getByRole('button',{name:'Void expense'}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await openSection(page,'Plan');
 await page.getByRole('button',{name:'Edit Fish dinner'}).click();
 await expect(page.getByRole('dialog').getByRole('button',{name:'Delete dinner'})).toBeVisible();
 await page.getByRole('dialog').getByRole('button',{name:'Delete dinner'}).click();
 await expect(page.getByRole('article',{name:'Fish dinner'})).toHaveCount(0);
});
