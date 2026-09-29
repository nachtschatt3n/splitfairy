import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {Store} from '../apps/server/src/store.js';
import {createApp} from '../apps/server/src/app.js';

let app:Awaited<ReturnType<typeof createApp>>,base='',cookie='',token='';const mails:{to:string;body:string}[]=[];
beforeAll(async()=>{
 app=await createApp({store:new Store(new DatabaseSync(':memory:')),adminEmail:'admin@example.com',secret:'a very long integration test secret',sendMail:async(to,_s,body)=>{mails.push({to,body});},dataDir:'/tmp/splitfairy-mcp-tests',startWorker:false});
 base=await app.listen({port:0,host:'127.0.0.1'});
 await app.inject({method:'POST',url:'/api/v1/auth/request',payload:{email:'admin@example.com'}});
 const code=mails.at(-1)!.body.match(/\b\d{6}\b/)![0];
 cookie=`splitfairy_session=${(await app.inject({method:'POST',url:'/api/v1/auth/verify',payload:{email:'admin@example.com',code,name:'Ana'}})).cookies.find(c=>c.name==='splitfairy_session')!.value}`;
 const created=await app.inject({method:'POST',url:'/api/v1/me/tokens',headers:{cookie},payload:{name:'Claude'}});
 expect(created.statusCode).toBe(201);token=created.json().token;
});
afterAll(()=>app.close());
const connect=async(auth=`Bearer ${token}`)=>{const client=new Client({name:'test',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`),{requestInit:{headers:{Authorization:auth}}}));return client;};
const call=async(client:Client,name:string,args:Record<string,unknown>)=>{const r=await client.callTool({name,arguments:args}) as any;const body=r.content[0].text;if(r.isError)throw new Error(body);return JSON.parse(body);};

describe('personal access tokens',()=>{
 it('are shown once, listed without the secret, work as a bearer token, and cannot manage tokens',async()=>{
  expect(token).toMatch(/^sfp_[A-Za-z0-9_-]{43}$/);
  const list=(await app.inject({method:'GET',url:'/api/v1/me/tokens',headers:{cookie}})).json();
  expect(list).toHaveLength(1);expect(list[0]).toMatchObject({name:'Claude',prefix:token.slice(0,8)});expect(JSON.stringify(list)).not.toContain(token);
  expect((await app.inject({method:'GET',url:'/api/v1/me',headers:{authorization:`Bearer ${token}`}})).json().email).toBe('admin@example.com');
  expect((await app.inject({method:'GET',url:'/api/v1/trips',headers:{authorization:'Bearer sfp_wrong'}})).statusCode).toBe(401);
  expect((await app.inject({method:'POST',url:'/api/v1/me/tokens',headers:{authorization:`Bearer ${token}`},payload:{name:'more'}})).statusCode).toBe(401);
  const other=(await app.inject({method:'POST',url:'/api/v1/me/tokens',headers:{cookie},payload:{name:'Temp'}})).json();
  expect((await app.inject({method:'DELETE',url:`/api/v1/me/tokens/${other.id}`,headers:{cookie}})).statusCode).toBe(200);
  expect((await app.inject({method:'GET',url:'/api/v1/trips',headers:{authorization:`Bearer ${other.token}`}})).statusCode).toBe(401);
  expect((await app.inject({method:'GET',url:'/api/v1/me/tokens',headers:{cookie}})).json()[0].lastUsedAt).toBeTruthy();
 });
});

describe('MCP',()=>{
 it('refuses missing or revoked tokens',async()=>{
  await expect(connect('Bearer sfp_notarealtokennotarealtokennotarealtoken12')).rejects.toThrow();
  const r=await fetch(`${base}/mcp`,{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:'{}'});
  expect(r.status).toBe(401);expect(r.headers.get('www-authenticate')).toContain('Bearer');
 });
 it('runs a trip end to end with the tools',async()=>{
  const client=await connect();
  const names=(await client.listTools()).tools.map(t=>t.name).sort();
  expect(names).toEqual(['add_expense','create_trip','delete_item','delete_trip','get_balances','get_trip','invite_member','list_trips','save_item','update_trip']);
  const trip=await call(client,'create_trip',{name:'Algarve',start:'2026-10-01',end:'2026-10-08',theme:'coast'});
  expect(trip.url).toMatch(/\/trips\/[\w-]+$/);
  const uhl=await call(client,'save_item',{trip_id:trip.id,entity:'family',item:{name:'Uhl',solo:false}});
  await call(client,'save_item',{trip_id:trip.id,entity:'family',item:{name:'Moncrief',solo:false}});
  for(const [name,family,weight] of [['Mathias','Uhl',1],['Andrea','Uhl',1],['Will','Moncrief',1]] as const){
   const t=(await call(client,'get_trip',{trip_id:trip.id})).trip;
   await call(client,'save_item',{trip_id:trip.id,entity:'person',item:{name,familyId:t.families.find((f:any)=>f.name===family).id,weight}});
  }
  // Partial update keeps the other fields.
  const renamed=await call(client,'save_item',{trip_id:trip.id,entity:'family',item:{id:uhl.id,name:'Uhl family'}});
  expect(renamed).toMatchObject({id:uhl.id,name:'Uhl family',solo:false,version:2});

  const taxi=await call(client,'add_expense',{trip_id:trip.id,title:'Taxi',amount_eur:30,paid_by:'Moncrief'});
  expect(taxi.owes_eur).toEqual({'Uhl family':15,Moncrief:15});
  const boat=await call(client,'add_expense',{trip_id:trip.id,title:'Boat',amount_eur:100,paid_by:'uhl family',split:{mode:'percent',values:{Mathias:50,Andrea:20,Will:30}}});
  expect(boat.owes_eur).toEqual({'Uhl family':70,Moncrief:30});
  const ice=await call(client,'add_expense',{trip_id:trip.id,title:'Ice cream',amount_eur:10,paid_by:'Uhl family',split:{mode:'exact',values:{Will:10}}});
  expect(ice.owes_eur).toEqual({Moncrief:10});
  await expect(call(client,'add_expense',{trip_id:trip.id,title:'Bad',amount_eur:10,paid_by:'Nobody'})).rejects.toThrow(/Unknown family "Nobody"/);

  const balances=await call(client,'get_balances',{trip_id:trip.id});
  expect(balances.balances_eur).toEqual({'Uhl family':25,Moncrief:-25});
  expect(balances.transfers).toEqual([{from:'Moncrief',to:'Uhl family',amount_eur:25}]);

  const voided=await call(client,'delete_item',{trip_id:trip.id,entity:'expense',id:ice.id});expect(voided).toEqual({voided:ice.id});
  expect((await call(client,'get_balances',{trip_id:trip.id})).balances_eur).toEqual({'Uhl family':15,Moncrief:-15});

  const dinner=await call(client,'save_item',{trip_id:trip.id,entity:'event',item:{title:'Tasca do Chico',date:'2026-10-02',kind:'restaurant',address:'Rua do Diário de Notícias 39',participants:[]}});
  expect(dinner.kind).toBe('restaurant');
  expect(await call(client,'delete_item',{trip_id:trip.id,entity:'event',id:dinner.id})).toEqual({deleted:dinner.id});
  expect(await call(client,'update_trip',{trip_id:trip.id,name:'Algarve 2026',archived:false})).toMatchObject({name:'Algarve 2026',theme:'coast'});
  expect((await call(client,'list_trips',{})).map((t:any)=>t.name)).toContain('Algarve 2026');
  await client.close();
 });
});
