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
