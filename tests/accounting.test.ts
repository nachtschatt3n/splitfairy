import {describe,it,expect} from 'vitest';
import {splitWeighted,settle,balances,allocateExpense} from '../packages/domain/src/accounting.js';

describe('money conservation',()=>{
 it('weights babies and adults and distributes indivisible cents deterministically',()=>{
 expect(splitWeighted(1001,[{id:'a',weight:1},{id:'b',weight:1},{id:'c',weight:.5}])).toEqual({a:401,b:400,c:200});
 });
 it('refunds exactly reverse allocations',()=>{expect(splitWeighted(-1001,[{id:'a',weight:1},{id:'b',weight:1},{id:'c',weight:.5}])).toEqual({a:-401,b:-400,c:-200});});
 it('rejects empty, negative and non-finite shares',()=>{for(const people of [[],[{id:'a',weight:-1}],[{id:'a',weight:Infinity}],[{id:'a',weight:0}]]) expect(()=>splitWeighted(10,people)).toThrow();});
 it('keeps zero weight participants free',()=>expect(splitWeighted(100,[{id:'a',weight:1},{id:'b',weight:0}])).toEqual({a:100,b:0}));
 it('splits receipt costs by event with fixed coverage and multiple payers',()=>{
 const people=[{id:'a',familyId:'A',name:'A',weight:1},{id:'b',familyId:'B',name:'B',weight:.5}];
 const result=allocateExpense({total:900,payers:[{familyId:'A',amount:500},{familyId:'B',amount:400}],splits:[{amount:900,weights:[{id:'a',weight:1},{id:'b',weight:.5}],fixed:[{familyId:'B',amount:300}]}]},people);
 expect(result).toEqual([{personId:'a',familyId:'A',amount:400},{personId:'b',familyId:'B',amount:200},{personId:null,familyId:'B',amount:300}]);
 expect(balances(['A','B'],[{total:900,payers:[{familyId:'A',amount:500},{familyId:'B',amount:400}],allocations:result}],[])).toEqual({A:100,B:-100});
 });
 it('rejects a payer or allocation mismatch',()=>expect(()=>allocateExpense({total:100,payers:[{familyId:'A',amount:99}],splits:[]},[])).toThrow());
});
describe('settlement',()=>{
 it('finds minimum transfers where largest-first is suboptimal',()=>{
 const result=settle({a:-800,b:-700,c:-600,d:900,e:800,f:400});
 expect(result.optimal).toBe(true);expect(result.transfers).toHaveLength(4);
 const b={a:-800,b:-700,c:-600,d:900,e:800,f:400} as Record<string,number>;
 for(const t of result.transfers){b[t.from]+=t.amount;b[t.to]-=t.amount;}
 expect(Object.values(b).every(n=>n===0)).toBe(true);
 });
 it('repayments reduce debt, not expenses',()=>expect(balances(['A','B'],[{total:100,payers:[{familyId:'A',amount:100}],allocations:[{personId:null,familyId:'B',amount:100}]}],[{from:'B',to:'A',amount:40}])).toEqual({A:60,B:-60}));
 it('rejects nonconserving balances',()=>expect(()=>settle({a:100,b:-99})).toThrow());
});
describe('settlement cost',()=>{
 it('stays fast for 15 families and labels a budget-limited plan',()=>{
  let seed=7;const rand=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
  for(let round=0;round<5;round++){
   const input:Record<string,number>={};let sum=0;
   for(let i=0;i<14;i++){const v=Math.round((rand()-.5)*100000);input[`f${i}`]=v;sum+=v;}
   input.f14=-sum;
   const started=performance.now();const result=settle(input);
   expect(performance.now()-started).toBeLessThan(1500);
   const b={...input};for(const t of result.transfers){b[t.from]+=t.amount;b[t.to]-=t.amount;}
   expect(Object.values(b).every(n=>n===0)).toBe(true);
   expect(result.transfers.length).toBeLessThanOrEqual(14);
  }
 });
});
describe('split modes stored as weights and fixed amounts',()=>{
 const people=[{id:'m',familyId:'U'},{id:'a',familyId:'U'},{id:'w',familyId:'M'}];
 const alloc=(split:any,total=1000)=>allocateExpense({total,payers:[{familyId:'U',amount:total}],splits:[{amount:total,...split}]},people);
 const perPerson=(rows:any[])=>Object.fromEntries(rows.map(r=>[r.personId,r.amount]));
 it('splits equally, by percentage and by shares to the cent',()=>{
  expect(perPerson(alloc({weights:[{id:'m',weight:1},{id:'a',weight:1},{id:'w',weight:1}]}))).toEqual({m:334,a:333,w:333});
  expect(perPerson(alloc({weights:[{id:'m',weight:50},{id:'a',weight:30},{id:'w',weight:20}]}))).toEqual({m:500,a:300,w:200});
  expect(perPerson(alloc({weights:[{id:'m',weight:2},{id:'w',weight:3}]}))).toEqual({m:400,w:600});
 });
 it('takes exact amounts per person and rejects amounts that do not add up',()=>{
  const rows=alloc({weights:[],personFixed:[{personId:'m',amount:700},{personId:'w',amount:300}]});
  expect(rows).toEqual([{personId:'m',familyId:'U',amount:700},{personId:'w',familyId:'M',amount:300}]);
  expect(()=>alloc({weights:[],personFixed:[{personId:'m',amount:700}]})).toThrow();
  expect(()=>alloc({weights:[],personFixed:[{personId:'m',amount:1200}]})).toThrow(/exceeds/);
 });
 it('adds adjustments on top of an equal share of the rest',()=>{
  // 10.00 with Will paying 4.00 extra: the other 6.00 is shared equally, so Will owes 6.00 and each Uhl 2.00.
  const rows=alloc({weights:[{id:'m',weight:1},{id:'a',weight:1},{id:'w',weight:1}],personFixed:[{personId:'w',amount:400}]});
  const byPerson:Record<string,number>={};for(const r of rows)byPerson[r.personId!]=(byPerson[r.personId!]??0)+r.amount;
  expect(byPerson).toEqual({m:200,a:200,w:600});
 });
 it('keeps refunds negative, including exact amounts',()=>{
  expect(perPerson(alloc({weights:[],personFixed:[{personId:'m',amount:-600},{personId:'w',amount:-400}]},-1000))).toEqual({m:-600,w:-400});
 });
});
