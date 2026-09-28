import {describe,it,expect,beforeEach} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {Store,ConflictError,InputError} from '../apps/server/src/store.js';
import type {Command} from '../packages/domain/src/model.js';
const db=new DatabaseSync(':memory:');
const store=new Store(db);
beforeEach(()=>store.resetForTests());
const actor={id:'u1',email:'a@example.com',name:'A',admin:true};
const cmd=(entity:Command['entity'],value:unknown,expectedVersion=0,mutationId='m1')=>({entity,value,expectedVersion,mutationId,action:'save' as const});
describe('trip mutation store',()=>{
 it('applies different entity changes and suppresses duplicate retry',()=>{
  store.addUser(actor);const trip=store.createTrip(actor,'Italy', '2026-10-01','2026-10-09');
  const first=store.mutate(actor,trip.id,cmd('family',{id:'f1',name:'Family A',version:0}));
  expect(first.families).toHaveLength(1);
  expect(store.mutate(actor,trip.id,cmd('family',{id:'f1',name:'Family A',version:0})).families).toHaveLength(1);
  store.mutate(actor,trip.id,cmd('shopping',{id:'s1',text:'eggs',eventId:null,done:false,version:0},0,'m2'));
  expect(store.getTrip(actor,trip.id).shopping[0].text).toBe('eggs');
 });
 it('rejects stale changes without losing another entity',()=>{
  store.addUser(actor);const trip=store.createTrip(actor,'Italy','2026-10-01','2026-10-09');
  store.mutate(actor,trip.id,cmd('family',{id:'f1',name:'Family A',version:0}));
  expect(()=>store.mutate(actor,trip.id,cmd('family',{id:'f1',name:'Family B',version:0},0,'m2'))).toThrow(ConflictError);
  expect(store.getTrip(actor,trip.id).families[0].name).toBe('Family A');
 });
 it('blocks unrelated users from reading the trip',()=>{
  store.addUser(actor);const trip=store.createTrip(actor,'Italy','2026-10-01','2026-10-09');
  expect(()=>store.getTrip({id:'u2',email:'other@example.com',name:'Other',admin:false},trip.id)).toThrow();
 });
 it('requires organizer to manage families',()=>{
  store.addUser(actor);const trip=store.createTrip(actor,'Italy','2026-10-01','2026-10-09');
  const other={id:'u2',email:'b@example.com',name:'B',admin:false};store.addUser(other);store.addMember(actor,trip.id,other.email,'member');
  expect(()=>store.mutate(other,trip.id,cmd('family',{id:'f1',name:'Family A',version:0}))).toThrow();
 });
 it('freezes posted amounts and rejects changed event participants',()=>{
  store.addUser(actor);const trip=store.createTrip(actor,'Italy','2026-10-01','2026-10-09');
  store.mutate(actor,trip.id,cmd('family',{id:'f1',name:'A',version:0}));
  store.mutate(actor,trip.id,cmd('person',{id:'p1',name:'Ann',familyId:'f1',weight:1,version:0},0,'m2'));
  store.mutate(actor,trip.id,cmd('event',{id:'e1',title:'Dinner',date:'2026-10-01',kind:'dinner',owner:'',notes:'',participants:[{id:'p1',weight:1}],version:0},0,'m3'));
  const expense={id:'x1',title:'Groceries',date:'2026-10-01',category:'food',total:100,payers:[{familyId:'f1',amount:100}],lines:[{id:'l1',label:'Eggs',amount:100,splits:[{amount:100,eventId:'e1',eventVersion:1,weights:[{id:'p1',weight:1}],fixed:[]}]}],notes:'',receiptIds:[],status:'posted',version:0};
  store.mutate(actor,trip.id,cmd('expense',expense,0,'m4'));
  expect(store.getTrip(actor,trip.id).expenses[0].allocations).toEqual([{personId:'p1',familyId:'f1',amount:100}]);
  store.mutate(actor,trip.id,cmd('event',{id:'e1',title:'Dinner',date:'2026-10-01',kind:'dinner',owner:'',notes:'',participants:[],version:1},1,'m5'));
  expect(()=>store.mutate(actor,trip.id,cmd('expense',{...expense,id:'x2'},0,'m6'))).toThrow(ConflictError);
 });
});
describe('receipt lifecycle',()=>{
 function setup(){
  store.addUser(actor);const trip=store.createTrip(actor,'Italy','2026-10-01','2026-10-09');
  store.mutate(actor,trip.id,cmd('family',{id:'f1',name:'A',version:0},0,'r1'));
  store.mutate(actor,trip.id,cmd('person',{id:'p1',name:'Ann',familyId:'f1',weight:1,version:0},0,'r2'));
  const t=store.getTrip(actor,trip.id);t.receipts.push({id:'rc',status:'review',items:[{label:'Eggs',amount:300}],total:300,merchant:'Shop',date:'2026-10-01',error:null,version:1,authorId:actor.id});
  store.db.prepare('UPDATE trips SET data=? WHERE id=?').run(JSON.stringify(t),t.id);
  const expense={id:'x1',title:'Shop',date:'2026-10-01',category:'food',total:300,payers:[{familyId:'f1',amount:300}],lines:[{id:'l1',label:'Eggs',amount:300,splits:[{amount:300,eventId:null,weights:[{id:'p1',weight:1}],fixed:[]}]}],notes:'',receiptIds:['rc'],status:'posted',version:0};
  return {tripId:trip.id,expense};
 }
 it('marks a receipt posted and refuses to post it twice',()=>{
  const {tripId,expense}=setup();
  store.mutate(actor,tripId,cmd('expense',expense,0,'r3'));
  expect(store.getTrip(actor,tripId).receipts[0]).toMatchObject({status:'posted',expenseId:'x1'});
  expect(()=>store.mutate(actor,tripId,cmd('expense',{...expense,id:'x2',lines:[{...expense.lines[0],id:'l2'}]},0,'r4'))).toThrow(/not ready/);
 });
 it('releases the receipt back to review when its expense is voided',()=>{
  const {tripId,expense}=setup();
  store.mutate(actor,tripId,cmd('expense',expense,0,'r3'));
  store.mutate(actor,tripId,cmd('expense',{...expense,status:'void'},1,'r4'));
  expect(store.getTrip(actor,tripId).receipts[0]).toMatchObject({status:'review',expenseId:null});
 });
 it('retries failed and dismisses reviewable receipts only',()=>{
  const {tripId}=setup();
  expect(()=>store.updateReceipt(actor,tripId,'rc','retry')).toThrow(/failed/);
  expect(store.updateReceipt(actor,tripId,'rc','dismiss').receipts[0].status).toBe('dismissed');
  expect(()=>store.updateReceipt(actor,tripId,'rc','dismiss')).toThrow();
 });
 it('reports impossible splits as input errors, not server errors',()=>{
  const {tripId,expense}=setup();
  const bad={...expense,receiptIds:[],lines:[{...expense.lines[0],splits:[{amount:300,eventId:null,weights:[{id:'ghost',weight:1}],fixed:[]}]}]};
  expect(()=>store.mutate(actor,tripId,cmd('expense',bad,0,'r5'))).toThrow(InputError);
 });
 it('keeps people who are planned into events',()=>{
  const {tripId}=setup();
  store.mutate(actor,tripId,cmd('event',{id:'e1',title:'Dinner',date:'2026-10-01',kind:'dinner',owner:'',notes:'',participants:[{id:'p1',weight:1}],version:0},0,'r6'));
  expect(()=>store.mutate(actor,tripId,{mutationId:'r7',entity:'person',action:'delete',expectedVersion:1,value:{id:'p1'}})).toThrow(/planned events/);
 });
});
describe('review fixes',()=>{
 const member={id:'u2',email:'b@example.com',name:'B',admin:false};
 function base(){
  store.addUser(actor);store.addUser(member);const trip=store.createTrip(actor,'Italy','2026-10-01','2026-10-09');store.addMember(actor,trip.id,member.email,'member');
  store.mutate(actor,trip.id,cmd('family',{id:'f1',name:'A',version:0},0,'b1'));
  store.mutate(actor,trip.id,cmd('family',{id:'f2',name:'B',version:0},0,'b2'));
  store.mutate(actor,trip.id,cmd('person',{id:'p1',name:'Ann',familyId:'f1',weight:1,version:0},0,'b3'));
  return trip.id;
 }
 it('only lets the author or an organizer delete a repayment',()=>{
  const id=base();
  store.mutate(actor,id,cmd('payment',{id:'pay',from:'f2',to:'f1',amount:500,date:'2026-10-02',version:0},0,'b4'));
  expect(()=>store.mutate(member,id,{mutationId:'b5',entity:'payment',action:'delete',expectedVersion:1,value:{id:'pay'}})).toThrow(/Access denied/);
  expect(store.getTrip(actor,id).payments).toHaveLength(1);
 });
 it('validates repayment fields strictly',()=>{
  const id=base();
  expect(()=>store.mutate(member,id,cmd('payment',{id:'x'.repeat(5000),from:'f2',to:'f1',amount:5,date:'2026-10-02',version:0},0,'b6'))).toThrow();
  expect(()=>store.mutate(member,id,cmd('payment',{id:'p',from:'f2',to:'f1',amount:5,date:'soon',version:0},0,'b7'))).toThrow();
 });
 it('lets an organizer unarchive a trip',()=>{
  const id=base();
  const t=store.mutate(actor,id,{mutationId:'b8',entity:'trip',action:'save',expectedVersion:store.getTrip(actor,id).version,value:{archived:true}});
  expect(store.mutate(actor,id,{mutationId:'b9',entity:'trip',action:'save',expectedVersion:t.version,value:{archived:false}}).archived).toBe(false);
 });
 it('voids an event expense after the event changed, and keeps paying families',()=>{
  const id=base();
  store.mutate(actor,id,cmd('event',{id:'e1',title:'Dinner',date:'2026-10-01',kind:'dinner',owner:'',notes:'',participants:[{id:'p1',weight:1}],version:0},0,'c1'));
  const expense={id:'x',title:'Dinner',date:'2026-10-01',category:'food',total:100,payers:[{familyId:'f2',amount:100}],lines:[{id:'l',label:'Dinner',amount:100,splits:[{amount:100,eventId:'e1',eventVersion:1,weights:[{id:'p1',weight:1}],fixed:[]}]}],notes:'',receiptIds:[],status:'posted',version:0};
  store.mutate(actor,id,cmd('expense',expense,0,'c2'));
  store.mutate(actor,id,cmd('event',{id:'e1',title:'Dinner',date:'2026-10-01',kind:'dinner',owner:'',notes:'',participants:[],version:1},1,'c3'));
  expect(()=>store.mutate(actor,id,{mutationId:'c4',entity:'family',action:'delete',expectedVersion:1,value:{id:'f2'}})).toThrow(/in use/);
  expect(store.mutate(actor,id,cmd('expense',{...expense,status:'void'},1,'c5')).expenses[0].status).toBe('void');
 });
});
describe('planning',()=>{
 it('allows plans nobody has joined yet and keeps shopping items when a plan is deleted',()=>{
  store.addUser(actor);const trip=store.createTrip(actor,'Italy','2026-10-01','2026-10-09');
  store.mutate(actor,trip.id,cmd('event',{id:'e1',title:'Dinner',date:'2026-10-02',kind:'dinner',owner:'',notes:'',participants:[],version:0},0,'q1'));
  store.mutate(actor,trip.id,cmd('shopping',{id:'s1',text:'Lemons',eventId:'e1',done:false,version:0},0,'q2'));
  const after=store.mutate(actor,trip.id,{mutationId:'q3',entity:'event',action:'delete',expectedVersion:1,value:{id:'e1'}});
  expect(after.events).toHaveLength(0);expect(after.shopping[0]).toMatchObject({text:'Lemons',eventId:null});
 });
});
describe('packing list',()=>{
 it('stores who brings what, rejects unknown families, and frees items when a family is deleted',()=>{
  store.addUser(actor);const trip=store.createTrip(actor,'Italy','2026-10-01','2026-10-09');
  store.mutate(actor,trip.id,cmd('family',{id:'f1',name:'A',version:0},0,'g1'));
  const saved=store.mutate(actor,trip.id,cmd('gear',{id:'x',text:'Beach tent',familyId:'f1',quantity:2,version:0},0,'g2'));
  expect(saved.gear![0]).toMatchObject({text:'Beach tent',familyId:'f1',quantity:2,packed:false,note:''});
  expect(()=>store.mutate(actor,trip.id,cmd('gear',{id:'y',text:'Grill',familyId:'nope',version:0},0,'g3'))).toThrow(/Unknown family/);
  const after=store.mutate(actor,trip.id,{mutationId:'g4',entity:'family',action:'delete',expectedVersion:1,value:{id:'f1'}});
  expect(after.gear![0]).toMatchObject({familyId:null,version:2});
 });
 it('works on trips saved before the packing list existed',()=>{
  store.addUser(actor);const trip=store.createTrip(actor,'Old','2026-10-01','2026-10-09');
  const t=store.getTrip(actor,trip.id);delete (t as any).gear;store.db.prepare('UPDATE trips SET data=? WHERE id=?').run(JSON.stringify(t),t.id);
  expect(store.mutate(actor,trip.id,cmd('gear',{id:'x',text:'Cooler',familyId:null,version:0},0,'g5')).gear).toHaveLength(1);
 });
});
describe('transport for packing',()=>{
 it('links items to a car or flight, rejects unknown ones, and keeps items when a car is removed',()=>{
  store.addUser(actor);const trip=store.createTrip(actor,'Italy','2026-10-01','2026-10-09');
  store.mutate(actor,trip.id,cmd('family',{id:'f1',name:'Uhl',version:0},0,'t1'));
  const car=store.mutate(actor,trip.id,cmd('transport',{id:'c',name:'Uhl car',kind:'car',familyId:'f1',version:0},0,'t2'));
  expect(car.transport![0]).toMatchObject({name:'Uhl car',kind:'car',familyId:'f1',note:''});
  store.mutate(actor,trip.id,cmd('gear',{id:'g',text:'Roof box',familyId:'f1',transportId:'c',version:0},0,'t3'));
  expect(()=>store.mutate(actor,trip.id,cmd('gear',{id:'h',text:'Tent',transportId:'nope',version:0},0,'t4'))).toThrow(/Unknown transport/);
  const after=store.mutate(actor,trip.id,{mutationId:'t5',entity:'transport',action:'delete',expectedVersion:1,value:{id:'c'}});
  expect(after.transport).toHaveLength(0);expect(after.gear![0]).toMatchObject({text:'Roof box',transportId:null});
 });
});
