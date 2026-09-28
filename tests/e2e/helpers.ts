import {expect,type Page,type TestInfo} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readdirSync,readFileSync,existsSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {E2E_ENV} from './env.js';
export const isPhone=(page:Page)=>(page.viewportSize()?.width??1000)<=740;
export const unique=(testInfo:TestInfo,label:string)=>`${label} ${testInfo.project.name} ${Date.now().toString(36)}`;
/** Newest sign-in code emailed to an address (captured to files by the server under test). */
export async function mailedCode(to:string,after:number){
 let code='';
 await expect.poll(()=>{
  const dir=E2E_ENV.MAIL_CAPTURE_DIR;if(!existsSync(dir))return '';
  const mails=readdirSync(dir).map(f=>JSON.parse(readFileSync(join(dir,f),'utf8'))).filter(m=>m.to===to&&Date.parse(m.at)>=after&&/code/i.test(m.subject)).sort((a,b)=>a.at.localeCompare(b.at));
  code=mails.at(-1)?.text.match(/\b\d{6}\b/)?.[0]??'';return code;
 },{timeout:10_000,message:`sign-in email to ${to}`}).not.toBe('');
 return code;
}
export function mailsTo(to:string){const dir=E2E_ENV.MAIL_CAPTURE_DIR;return existsSync(dir)?readdirSync(dir).map(f=>JSON.parse(readFileSync(join(dir,f),'utf8'))).filter(m=>m.to===to):[];}
/** Operator path: a one-time code without email (same script operators use in the pod). */
export function operatorCode(email:string){
 const out=execFileSync(process.execPath,['dist/server/scripts/signin-code.js',email],{env:{...process.env,...E2E_ENV},encoding:'utf8'});
 return out.match(/\b\d{6}\b/)![0];
}
/** Workers share one admin address and each new code replaces the last, so admin sign-ins take turns. */
export async function withAdminLock<T>(work:()=>Promise<T>):Promise<T>{
 const lock=join(E2E_ENV.DATA_DIR,'..','admin-signin.lock');
 for(let i=0;;i++){try{mkdirSync(lock);break;}catch{if(i>600)throw new Error('admin sign-in lock stuck');await new Promise(r=>setTimeout(r,50));}}
 try{return await work();}finally{rmSync(lock,{recursive:true,force:true});}
}
/** Signs the organizer in without the UI (the UI path is covered by the email sign-in flow test). */
export async function signInAsAdmin(page:Page,name='Ana'){
 await withAdminLock(async()=>{
  const response=await page.request.post('/api/v1/auth/verify',{data:{email:E2E_ENV.ADMIN_EMAIL,code:operatorCode(E2E_ENV.ADMIN_EMAIL),name}});
  expect(response.ok(),await response.text()).toBe(true);
 });
 await page.goto('/');
 await expect(page.getByText('Every shared trip')).toBeVisible();
}
export async function signIn(page:Page,email:string,code:string,name:string){
 await page.goto('/');
 await page.getByLabel('Email address').fill(email);
 await page.getByRole('button',{name:'I already have a code'}).click();
 await page.getByLabel('Your six-digit code').fill(code);
 await page.getByLabel('Your name').fill(name);
 await page.getByRole('button',{name:'Start planning'}).click();
 await expect(page.getByText('Every shared trip')).toBeVisible();
}
export async function createTrip(page:Page,name:string,start='2026-10-01',end='2026-10-11'){
 await page.getByRole('button',{name:'Create a vacation'}).click();
 const sheet=page.getByRole('dialog');
 await sheet.getByLabel('Where are we going?').fill(name);
 await sheet.getByLabel('First day').fill(start);await sheet.getByLabel('Last day').fill(end);
 await sheet.getByRole('button',{name:'Create vacation'}).click();
 await expect(page.getByText(`Here's what's happening in ${name}.`)).toBeVisible();
}
/** Section navigation works the same way a person would use it on each device. */
export async function openSection(page:Page,section:'Today'|'Plan'|'Spend'|'Settle'|'People'){
 if(isPhone(page)){await page.getByRole('navigation',{name:'Trip sections'}).getByRole('button',{name:section}).click();return;}
 const desktop={Today:'Today',Plan:'The plan',Spend:'Expenses',Settle:'Balances',People:'People & settings'}[section];
 await page.locator('.sidebar .nav').getByRole('button',{name:desktop}).click();
}
export async function switchTrip(page:Page,name:string){
 const chip=page.getByRole('button',{name:/Switch trip/});
 if(await chip.isVisible()){await chip.click();await page.getByRole('button',{name:new RegExp(name)}).click();}
 else await page.getByLabel('Current trip').selectOption({label:name});
 await expect(page.getByText(`Here's what's happening in ${name}.`)).toBeVisible();
}
/** Attaches a screenshot to the report; with SHOT_DIR set also saves <project>-<name>.png for manual review. */
export async function shot(page:Page,testInfo:TestInfo,name:string){
 const body=await page.screenshot({fullPage:false});await testInfo.attach(name,{body,contentType:'image/png'});
 if(process.env.SHOT_DIR){mkdirSync(process.env.SHOT_DIR,{recursive:true});writeFileSync(join(process.env.SHOT_DIR,`${testInfo.project.name}-${name}.png`),body);}
}
