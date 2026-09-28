import {describe,it,expect} from 'vitest';
import {draftFromReceipt,expenseFromDraft,parseCents,reviewSummary} from '../apps/web/src/receipt-draft.js';
import {allocateExpense} from '../packages/domain/src/accounting.js';
import {freshTrip} from '../apps/server/src/store.js';
import type {Receipt} from '../packages/domain/src/model.js';
const trip=freshTrip('t','Italy','2026-10-01','2026-10-05');
trip.families=[{id:'A',name:'Rossi',version:1},{id:'B',name:'Weber',version:1}];
trip.people=[{id:'a1',name:'Ana',familyId:'A',weight:1,version:1},{id:'a2',name:'Leo',familyId:'A',weight:.5,version:1},{id:'b1',name:'Ben',familyId:'B',weight:1,version:1}];
trip.events=[{id:'dinner',title:'Pasta night',date:'2026-10-02',kind:'dinner',owner:'',notes:'',participants:[{id:'a1',weight:1},{id:'b1',weight:1}],version:3},{id:'hike',title:'Hike',date:'2026-10-03',kind:'activity',owner:'',notes:'',participants:[],version:1}];
const receipt:Receipt={id:'r',status:'review',merchant:'Coop',date:'2026-10-02',total:1250,items:[{label:'Pasta',amount:400},{label:'Sunscreen',amount:900},{label:'Bottle deposit',amount:-50}],error:null,version:2,authorId:'u'};
let n=0;const key=()=>`k${n++}`;
describe('receipt review draft',()=>{
 it('parses European and dotted amounts strictly',()=>{expect(parseCents('4,99')).toBe(499);expect(parseCents('-0.5')).toBe(-50);expect(parseCents('4.999')).toBeNull();expect(parseCents('abc')).toBeNull();});
 it('pre-assigns items to the only meal on the receipt date',()=>{const draft=draftFromReceipt(receipt,trip,'2026-10-04',key);expect(draft.items.every(i=>i.target==='dinner')).toBe(true);expect(draft.total).toBe('12.50');});
 it('summarises totals per assignment and reconciles with the receipt',()=>{
  const draft=draftFromReceipt(receipt,trip,'2026-10-04',key);draft.payer='B';draft.items[1].target='';
  const summary=reviewSummary(draft,trip);
  expect(summary.ready).toBe(true);expect(summary.difference).toBe(0);
  expect(summary.groups).toEqual([{target:'',name:'General · everyone',people:3,amount:900,items:1},{target:'dinner',name:'Pasta night',people:2,amount:350,items:2}]);
 });
 it('blocks confirmation on mismatch, bad amounts and events nobody joins',()=>{
  const draft=draftFromReceipt(receipt,trip,'2026-10-04',key);draft.items[0].amount='3.00';draft.items[1].amount='x';draft.items[2].target='hike';
  const summary=reviewSummary(draft,trip);
  expect(summary.ready).toBe(false);
  expect(summary.problems.join(' ')).toMatch(/amount like/);expect(summary.problems.join(' ')).toMatch(/Hike has nobody/);
 });
 it('builds a balanced expense that the domain can allocate',()=>{
  const draft=draftFromReceipt(receipt,trip,'2026-10-04',key);draft.payer='B';draft.items[1].target='';
  const expense=expenseFromDraft(draft,trip,'r',key);
  expect(expense).toMatchObject({title:'Coop',date:'2026-10-02',total:1250,payers:[{familyId:'B',amount:1250}],receiptIds:['r'],status:'posted'});
  expect(expense.lines[0].splits[0]).toMatchObject({eventId:'dinner',eventVersion:3,weights:trip.events[0].participants});
  const allocations=allocateExpense({total:expense.total,payers:expense.payers,splits:expense.lines.flatMap(l=>l.splits)},trip.people);
  expect(allocations.reduce((s,a)=>s+a.amount,0)).toBe(1250);
  const byFamily=(f:string)=>allocations.filter(a=>a.familyId===f).reduce((s,a)=>s+a.amount,0);
  // Pasta night (350) split Ana/Ben; sunscreen (900) split Ana 1, Leo .5, Ben 1.
  expect(byFamily('A')).toBe(175+360+180);expect(byFamily('B')).toBe(175+360);
 });
});
