import {test,expect} from '@playwright/test';
test('invited traveler enters a code and reaches a trip dashboard',async({page})=>{
 const user={id:'u',name:'Andrea',email:'andrea@example.com',admin:false};
 const trip={id:'t',name:'Summer in Italy',start:'2026-10-01',end:'2026-10-08',version:0,archived:false,families:[],people:[],events:[],shopping:[],expenses:[],payments:[],receipts:[],activity:[]};
 await page.route('**/api/v1/**',async route=>{
  const url=new URL(route.request().url());const path=url.pathname;
  let data:any={ok:true};
  if(path.endsWith('/me'))data=null;
  if(path.endsWith('/auth/verify'))data=user;
  if(path.endsWith('/trips')&&route.request().method()==='GET')data=[{id:trip.id,name:trip.name,start:trip.start,end:trip.end,archived:false}];
  if(path.endsWith('/trips/t'))data={trip,role:'member',members:[{email:user.email,role:'member'}]};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('/');
 await expect(page.getByRole('heading',{name:/Good trips are/i})).toBeVisible();
 await page.getByLabel('Email address').fill('andrea@example.com');
 await page.getByRole('button',{name:'Email me a code'}).click();
 await page.getByLabel('Your six-digit code').fill('123456');
 await page.getByRole('button',{name:'Sign in'}).click();
 await page.locator('.trip-card',{hasText:'Summer in Italy'}).click();
 await expect(page.getByText("Here's what's happening in Summer in Italy.")).toBeVisible();
 if(process.env.SCREENSHOT_PATH) await page.screenshot({path:process.env.SCREENSHOT_PATH,fullPage:true});
});
test('a code already in the inbox can be used without requesting another',async({page})=>{
 let requested=0;
 await page.route('**/api/v1/**',async route=>{const path=new URL(route.request().url()).pathname;if(path.endsWith('/auth/request'))requested++;const data=path.endsWith('/me')?null:path.endsWith('/auth/verify')?{id:'u',name:'A',email:'a@example.com',admin:true}:path.endsWith('/trips')?[]:{ok:true};await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});});
 await page.goto('/');
 await page.getByLabel('Email address').fill('a@example.com');
 await page.getByRole('button',{name:'I already have a code'}).click();
 await page.getByLabel('Your six-digit code').fill('123456');
 await page.getByRole('button',{name:'Sign in'}).click();
 await expect(page.getByRole('region',{name:'Your trips'})).toBeVisible();
 expect(requested).toBe(0);
});
test('a hung start-up offers a reload instead of spinning forever',async({page})=>{
 let hang=true;
 await page.route('**/api/v1/me',route=>{if(!hang)return route.fulfill({status:200,contentType:'application/json',body:'null'});});
 await page.goto('/');
 await expect(page.getByText('Gathering your trip…')).toBeVisible();
 const reload=page.getByRole('button',{name:'Reload Splitfairy'});
 await expect(reload).toBeVisible({timeout:12_000});
 hang=false;
 await reload.click();
 await expect(page.getByRole('heading',{name:/Good trips are/i})).toBeVisible();
});
