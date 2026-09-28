import {test,expect} from '@playwright/test';
test('edits made offline are kept on the device and replay in order on reconnect',async({page,context})=>{
 const user={id:'u',name:'Andrea',email:'andrea@example.com',admin:true};
 const trip:any={id:'t',name:'Summer in Liguria',start:'2026-10-01',end:'2026-10-05',version:1,archived:false,families:[],people:[],events:[],shopping:[],expenses:[],payments:[],receipts:[],activity:[]};
 const received:string[]=[];let online=true;
 await page.route('**/api/v1/**',async route=>{
  if(!online){await route.abort('internetdisconnected');return;}
  const path=new URL(route.request().url()).pathname,method=route.request().method();
  let data:any={ok:true};
  if(path.endsWith('/me'))data=user;
  else if(path.endsWith('/trips')&&method==='GET')data=[{id:'t',name:trip.name,start:trip.start,end:trip.end,archived:false}];
  else if(path.endsWith('/trips/t'))data={trip,role:'organizer',members:[]};
  else if(path.endsWith('/commands')){
   const c=route.request().postDataJSON();received.push(`${c.entity}:${c.value.name}`);
   if(c.entity==='person'&&!trip.families.some((f:any)=>f.id===c.value.familyId)){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Unknown family'})});return;}
   (c.entity==='family'?trip.families:trip.people).push({...c.value,version:1});trip.version++;data={trip,role:'organizer'};
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.addInitScript(()=>localStorage.setItem('splitfairy-last-trip','t'));
 await page.goto('/');
 await expect(page.getByText("Here's what's happening in Summer in Liguria.")).toBeVisible();
 await page.getByRole('button',{name:'People & settings'}).click();
 await expect(page.getByText('All synced')).toBeVisible();
 online=false;await context.setOffline(true);
 await page.evaluate(()=>window.dispatchEvent(new Event('offline')));
 await page.getByPlaceholder('The Millers').fill('Rossi');
 await page.getByRole('button',{name:'Add',exact:true}).first().click();
 await expect(page.getByText('Saved on this device')).toBeVisible();
 await expect(page.locator('.family-title strong',{hasText:'Rossi'})).toBeVisible();
 await page.getByPlaceholder('First name').fill('Luca');
 await page.locator('form').filter({hasText:'Add a person'}).locator('select').first().selectOption({label:'Rossi'});
 await page.locator('form').filter({hasText:'Add a person'}).getByRole('button',{name:'Add'}).click();
 await expect(page.locator('.person-row',{hasText:'Luca'})).toBeVisible();
 expect(received).toEqual([]);
 online=true;await context.setOffline(false);
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect.poll(()=>received).toEqual(['family:Rossi','person:Luca']);
 await expect(page.getByText('All synced')).toBeVisible();
 expect(trip.people.map((p:any)=>p.name)).toEqual(['Luca']);
});
