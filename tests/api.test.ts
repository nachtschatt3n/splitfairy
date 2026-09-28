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
