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
