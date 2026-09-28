import {describe,it,expect,beforeEach} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {Store} from '../apps/server/src/store.js';
import {createApp} from '../apps/server/src/app.js';
let code='';let app:Awaited<ReturnType<typeof createApp>>;
beforeEach(async()=>{const store=new Store(new DatabaseSync(':memory:'));app=await createApp({store,adminEmail:'admin@example.com',secret:'a very long integration test secret',sendMail:async(_to,_subject,body)=>{code=body.match(/\b\d{6}\b/)?.[0]??'';},dataDir:'/tmp/splitfairy-api-tests',startWorker:false});});
async function login(email='admin@example.com'){
 await app.inject({method:'POST',url:'/api/v1/auth/request',payload:{email}});
 const result=await app.inject({method:'POST',url:'/api/v1/auth/verify',payload:{email,code,name:'Test'}});
 return result.cookies.find(c=>c.name==='splitfairy_session')?.value??'';
}
describe('API access',()=>{
 it('verifies email and creates an organizer trip',async()=>{
  const cookie=await login();expect(cookie).toBeTruthy();
  const response=await app.inject({method:'POST',url:'/api/v1/trips',headers:{cookie:`splitfairy_session=${cookie}`},payload:{name:'Italy',start:'2026-10-01',end:'2026-10-09'}});
  expect(response.statusCode).toBe(201);expect(response.json().name).toBe('Italy');
 });
 it('requires membership to read trip data',async()=>{
  const cookie=await login();const trip=(await app.inject({method:'POST',url:'/api/v1/trips',headers:{cookie:`splitfairy_session=${cookie}`},payload:{name:'Italy',start:'2026-10-01',end:'2026-10-09'}})).json();
  expect((await app.inject({method:'GET',url:`/api/v1/trips/${trip.id}`})).statusCode).toBe(401);
 });
 it('rejects invalid and reused login codes',async()=>{
  await app.inject({method:'POST',url:'/api/v1/auth/request',payload:{email:'admin@example.com'}});
  expect((await app.inject({method:'POST',url:'/api/v1/auth/verify',payload:{email:'admin@example.com',code:'000000',name:'Test'}})).statusCode).toBe(401);
  expect((await app.inject({method:'POST',url:'/api/v1/auth/verify',payload:{email:'admin@example.com',code,name:'Test'}})).statusCode).toBe(200);
  expect((await app.inject({method:'POST',url:'/api/v1/auth/verify',payload:{email:'admin@example.com',code,name:'Test'}})).statusCode).toBe(401);
 });
});
describe('API hardening',()=>{
 it('sends security headers and never caches API responses',async()=>{
  const response=await app.inject({method:'GET',url:'/api/v1/me'});
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  expect(response.headers['cache-control']).toBe('no-store');
 });
 it('rejects cross-origin writes',async()=>{
  const response=await app.inject({method:'POST',url:'/api/v1/auth/request',headers:{origin:'https://evil.example',host:'splitfairy.example'},payload:{email:'admin@example.com'}});
  expect(response.statusCode).toBe(403);
 });
 it('keeps receipt actions to trip members',async()=>{
  const cookie=await login();
  const trip=(await app.inject({method:'POST',url:'/api/v1/trips',headers:{cookie:`splitfairy_session=${cookie}`},payload:{name:'Italy',start:'2026-10-01',end:'2026-10-09'}})).json();
  expect((await app.inject({method:'POST',url:`/api/v1/trips/${trip.id}/receipts/nope/dismiss`,payload:{}})).statusCode).toBe(401);
  expect((await app.inject({method:'POST',url:`/api/v1/trips/${trip.id}/receipts/nope/dismiss`,headers:{cookie:`splitfairy_session=${cookie}`},payload:{}})).statusCode).toBe(400);
  expect((await app.inject({method:'POST',url:`/api/v1/trips/${trip.id}/receipts/nope/explode`,headers:{cookie:`splitfairy_session=${cookie}`},payload:{}})).statusCode).toBe(404);
 });
 it('tells the user when the sign-in email cannot be sent',async()=>{
  const store=new Store(new DatabaseSync(':memory:'));
  const failing=await createApp({store,adminEmail:'admin@example.com',secret:'a very long integration test secret',sendMail:async()=>{throw new Error('smtp down');},dataDir:'/tmp/splitfairy-api-tests',startWorker:false});
  expect((await failing.inject({method:'POST',url:'/api/v1/auth/request',payload:{email:'admin@example.com'}})).statusCode).toBe(502);
 });
});
describe('sign-in throttling per email',()=>{
 it('stops guessing after 10 wrong codes in an hour even when new codes are requested',async()=>{
  const store=new Store(new DatabaseSync(':memory:'));let last='';
  const target=await createApp({store,adminEmail:'admin@example.com',secret:'a very long integration test secret',sendMail:async(_t,_s,body)=>{last=body.match(/\b\d{6}\b/)?.[0]??'';},dataDir:'/tmp/splitfairy-api-tests',startWorker:false});
  let ip=0;const from=()=>({'x-forwarded-for':`203.0.113.${++ip}`});
  for(let round=0;round<3;round++){
   await target.inject({method:'POST',url:'/api/v1/auth/request',headers:from(),payload:{email:'admin@example.com'}});
   for(let i=0;i<4;i++)await target.inject({method:'POST',url:'/api/v1/auth/verify',headers:from(),payload:{email:'admin@example.com',code:last==='000000'?'111111':'000000',name:'X'}});
  }
  await target.inject({method:'POST',url:'/api/v1/auth/request',headers:from(),payload:{email:'admin@example.com'}});
  const correct=await target.inject({method:'POST',url:'/api/v1/auth/verify',headers:from(),payload:{email:'admin@example.com',code:last,name:'X'}});
  expect(correct.statusCode).toBe(401);
 });
 it('sends at most five codes per address per hour',async()=>{
  const store=new Store(new DatabaseSync(':memory:'));let sent=0;
  const target=await createApp({store,adminEmail:'admin@example.com',secret:'a very long integration test secret',sendMail:async()=>{sent++;},dataDir:'/tmp/splitfairy-api-tests',startWorker:false});
  for(let i=0;i<8;i++)expect((await target.inject({method:'POST',url:'/api/v1/auth/request',headers:{'x-forwarded-for':`198.51.100.${i}`},payload:{email:'admin@example.com'}})).statusCode).toBe(200);
  expect(sent).toBe(5);
 });
});
describe('receipt upload',()=>{
 it('accepts photos and refuses other image formats such as SVG',async()=>{
  const sharp=(await import('sharp')).default;
  const cookie=await login();const headers={cookie:`splitfairy_session=${cookie}`};
  const trip=(await app.inject({method:'POST',url:'/api/v1/trips',headers,payload:{name:'Italy',start:'2026-10-01',end:'2026-10-09'}})).json();
  const png=await sharp({create:{width:300,height:400,channels:3,background:'#fff'}}).png().toBuffer();
  const ok=await app.inject({method:'POST',url:`/api/v1/trips/${trip.id}/receipts`,headers,payload:{image:png.toString('base64')}});
  expect(ok.statusCode).toBe(201);expect(ok.json().status).toBe('queued');
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#fff"/><text x="10" y="20">receipt text padding padding padding</text></svg>');
  expect((await app.inject({method:'POST',url:`/api/v1/trips/${trip.id}/receipts`,headers,payload:{image:svg.toString('base64')}})).statusCode).toBe(400);
 });
});
describe('people with accounts',()=>{
 it('invites a person saved with an email once, links them when they sign in, and keeps children without one',async()=>{
  const store=new Store(new DatabaseSync(':memory:'));const mails:{to:string;subject:string;body:string}[]=[];
  const a=await createApp({store,adminEmail:'admin@example.com',secret:'a very long integration test secret',sendMail:async(to,subject,body)=>{mails.push({to,subject,body});},dataDir:'/tmp/splitfairy-api-tests',startWorker:false});
  const signIn=async(email:string)=>{await a.inject({method:'POST',url:'/api/v1/auth/request',payload:{email}});const code=mails.filter(m=>m.to===email).at(-1)!.body.match(/\b\d{6}\b/)![0];return (await a.inject({method:'POST',url:'/api/v1/auth/verify',payload:{email,code,name:'X'}})).cookies.find(c=>c.name==='splitfairy_session')!.value;};
  const headers={cookie:`splitfairy_session=${await signIn('admin@example.com')}`,host:'splitfairy.example'};
  const trip=(await a.inject({method:'POST',url:'/api/v1/trips',headers,payload:{name:'Porto',start:'2026-10-01',end:'2026-10-05'}})).json();
  let n=0;const cmd=(entity:string,value:any,expectedVersion=0)=>a.inject({method:'POST',url:`/api/v1/trips/${trip.id}/commands`,headers,payload:{mutationId:`c${n++}`,entity,action:'save',expectedVersion,value:{version:0,...value}}});
  await cmd('family',{id:'f',name:'Silva',solo:false});
  const saved=await cmd('person',{id:'p1',name:'Bea',familyId:'f',weight:1,email:'Bea@Example.com'});
  expect(saved.statusCode).toBe(200);expect(saved.json().members).toContainEqual({email:'bea@example.com',role:'member',joined:false});
  const invite=mails.find(m=>m.to==='bea@example.com')!;expect(invite.subject).toBe('Join Porto on Splitfairy');expect(invite.body).toContain('http://splitfairy.example');
  await cmd('person',{id:'p1',name:'Beatriz',familyId:'f',weight:1,email:'bea@example.com'},1);
  expect(mails.filter(m=>m.subject.startsWith('Join')).length).toBe(1);
  expect((await cmd('person',{id:'p2',name:'Tiago',familyId:'f',weight:.5,email:''})).statusCode).toBe(200);
  expect((await cmd('person',{id:'p3',name:'Copy',familyId:'f',weight:1,email:'bea@example.com'})).json().error).toMatch(/already uses/);
  await signIn('bea@example.com');
  const view=(await a.inject({method:'GET',url:`/api/v1/trips/${trip.id}`,headers})).json();
  expect(view.members).toContainEqual({email:'bea@example.com',role:'member',joined:true});
  expect(view.trip.people.find((p:any)=>p.id==='p2').email).toBe('');
 });
});
describe('full lifecycle of trips, access and expenses',()=>{
 async function setup(){
  const store=new Store(new DatabaseSync(':memory:'));const mails:{to:string;body:string}[]=[];
  const a=await createApp({store,adminEmail:'admin@example.com',secret:'a very long integration test secret',sendMail:async(to,_s,body)=>{mails.push({to,body});},dataDir:'/tmp/splitfairy-api-tests',startWorker:false});
  const signIn=async(email:string)=>{await a.inject({method:'POST',url:'/api/v1/auth/request',payload:{email}});const code=mails.filter(m=>m.to===email).at(-1)!.body.match(/\b\d{6}\b/)![0];return `splitfairy_session=${(await a.inject({method:'POST',url:'/api/v1/auth/verify',payload:{email,code,name:email.split('@')[0]}})).cookies.find(c=>c.name==='splitfairy_session')!.value}`;};
  const admin=await signIn('admin@example.com');
  const trip=(await a.inject({method:'POST',url:'/api/v1/trips',headers:{cookie:admin},payload:{name:'Porto',start:'2026-10-01',end:'2026-10-05'}})).json();
  let n=0;const cmd=(cookie:string,entity:string,action:'save'|'delete',value:any,expectedVersion=0)=>a.inject({method:'POST',url:`/api/v1/trips/${trip.id}/commands`,headers:{cookie},payload:{mutationId:`m${n++}`,entity,action,expectedVersion,value}});
  return {a,admin,trip,cmd,signIn};
 }
 it('edits trip dates, refuses impossible ones, and deletes only trips without money',async()=>{
  const {a,admin,trip,cmd}=await setup();
  const moved=await cmd(admin,'trip','save',{name:'Porto & Douro',start:'2026-10-02',end:'2026-10-09'},0);
  expect(moved.json().trip).toMatchObject({name:'Porto & Douro',start:'2026-10-02',end:'2026-10-09'});
  expect((await cmd(admin,'trip','save',{start:'2026-10-10',end:'2026-10-01'},moved.json().trip.version)).statusCode).toBe(400);
  await cmd(admin,'family','save',{id:'f',name:'Silva',version:0});
  await cmd(admin,'payment','save',{id:'p',from:'f',to:'f',amount:5,date:'2026-10-02',version:0});
  await cmd(admin,'family','save',{id:'g',name:'Weber',version:0});
  await cmd(admin,'payment','save',{id:'p',from:'f',to:'g',amount:500,date:'2026-10-02',version:0});
  expect((await a.inject({method:'DELETE',url:`/api/v1/trips/${trip.id}`,headers:{cookie:admin}})).json().error).toMatch(/archived, not deleted/);
  await cmd(admin,'payment','delete',{id:'p'},1);
  expect((await a.inject({method:'DELETE',url:`/api/v1/trips/${trip.id}`,headers:{cookie:admin}})).statusCode).toBe(200);
  expect((await a.inject({method:'GET',url:`/api/v1/trips/${trip.id}`,headers:{cookie:admin}})).statusCode).toBe(403);
 });
 it('lets organizers change roles and revoke access but never lose the last organizer',async()=>{
  const {a,admin,trip,cmd,signIn}=await setup();
  await cmd(admin,'family','save',{id:'f',name:'Silva',version:0});
  await cmd(admin,'person','save',{id:'b',name:'Bea',familyId:'f',weight:1,email:'bea@example.com',version:0});
  const bea=await signIn('bea@example.com');
  expect((await a.inject({method:'PUT',url:`/api/v1/trips/${trip.id}/members/bea%40example.com`,headers:{cookie:bea},payload:{role:'organizer'}})).statusCode).toBe(403);
  expect((await a.inject({method:'PUT',url:`/api/v1/trips/${trip.id}/members/admin%40example.com`,headers:{cookie:admin},payload:{role:'member'}})).json().error).toMatch(/at least one organizer/);
  const promoted=await a.inject({method:'PUT',url:`/api/v1/trips/${trip.id}/members/bea%40example.com`,headers:{cookie:admin},payload:{role:'organizer'}});
  expect(promoted.json().members).toContainEqual({email:'bea@example.com',role:'organizer',joined:true});
  expect((await a.inject({method:'DELETE',url:`/api/v1/trips/${trip.id}/members/admin%40example.com`,headers:{cookie:admin}})).json().error).toMatch(/your own access/);
  await a.inject({method:'DELETE',url:`/api/v1/trips/${trip.id}/members/bea%40example.com`,headers:{cookie:admin}});
  expect((await a.inject({method:'GET',url:`/api/v1/trips/${trip.id}`,headers:{cookie:bea}})).statusCode).toBe(403);
 });
 it('edits, voids and restores an expense with the balances following',async()=>{
  const {a,admin,trip,cmd}=await setup();
  await cmd(admin,'family','save',{id:'f',name:'Silva',version:0});await cmd(admin,'family','save',{id:'g',name:'Weber',version:0});
  await cmd(admin,'person','save',{id:'p1',name:'Ana',familyId:'f',weight:1,version:0});await cmd(admin,'person','save',{id:'p2',name:'Ben',familyId:'g',weight:1,version:0});
  const expense=(total:number)=>({id:'x',title:'Taxi',date:'2026-10-02',category:'transport',total,payers:[{familyId:'g',amount:total}],lines:[{id:'l',label:'Taxi',amount:total,splits:[{amount:total,eventId:null,weights:[{id:'p1',weight:1},{id:'p2',weight:1}],fixed:[]}]}],notes:'',receiptIds:[],status:'posted',version:0});
  const settle=async()=>(await a.inject({method:'GET',url:`/api/v1/trips/${trip.id}/settlement`,headers:{cookie:admin}})).json().balances;
  await cmd(admin,'expense','save',expense(3000));expect(await settle()).toEqual({f:-1500,g:1500});
  await cmd(admin,'expense','save',expense(4000),1);expect(await settle()).toEqual({f:-2000,g:2000});
  await cmd(admin,'expense','save',{...expense(4000),status:'void'},2);expect(await settle()).toEqual({f:0,g:0});
  await cmd(admin,'expense','save',expense(4000),3);expect(await settle()).toEqual({f:-2000,g:2000});
 });
 it('signing out ends the session on the server',async()=>{
  const {a,admin}=await setup();
  expect((await a.inject({method:'POST',url:'/api/v1/auth/logout',headers:{cookie:admin}})).statusCode).toBe(200);
  expect((await a.inject({method:'GET',url:'/api/v1/trips',headers:{cookie:admin}})).statusCode).toBe(401);
 });
});
describe('forgiving code entry',()=>{
 it('accepts a code copied with spaces or a full stop, trims the address, and puts the code in the subject',async()=>{
  const store=new Store(new DatabaseSync(':memory:'));const mails:{subject:string;body:string}[]=[];
  const a=await createApp({store,adminEmail:'admin@example.com',secret:'a very long integration test secret',sendMail:async(_t,subject,body)=>{mails.push({subject,body});},dataDir:'/tmp/splitfairy-api-tests',startWorker:false});
  await a.inject({method:'POST',url:'/api/v1/auth/request',payload:{email:' Admin@Example.com '}});
  const code=mails[0].subject.match(/^\d{6}/)![0];
  expect(mails[0].body).toContain(`\n\n${code}\n\n`);expect(mails[0].body).toContain('30 minutes');
  const res=await a.inject({method:'POST',url:'/api/v1/auth/verify',payload:{email:'admin@example.com ',code:` ${code.slice(0,3)} ${code.slice(3)}.`,name:'Mathias'}});
  expect(res.statusCode).toBe(200);
 });
});
