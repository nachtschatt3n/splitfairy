import {describe,it,expect} from 'vitest';
import {describeSplit,splitWho} from '../apps/web/src/split.js';
import {freshTrip} from '../apps/server/src/store.js';
import type {Expense} from '../packages/domain/src/model.js';
const trip=freshTrip('t','Algarve','2026-10-01','2026-10-09');
trip.families=[{id:'U',name:'Uhl',version:1},{id:'W',name:'Winn',version:1}];
trip.people=[{id:'m',name:'Mathias',familyId:'U',weight:1,version:1},{id:'a',name:'Andrea',familyId:'U',weight:1,version:1},{id:'r',name:'Richard',familyId:'W',weight:1,version:1}];
trip.events=[{id:'e',title:'Eggslut',date:'2026-10-05',kind:'breakfast',owner:'',notes:'',participants:[{id:'m',weight:1},{id:'r',weight:1}],version:1}];
const all=trip.people.map(p=>({id:p.id,weight:1}));
const split=(amount:number,extra:object)=>({amount,eventId:null,weights:[] as {id:string;weight:number}[],fixed:[] as {familyId:string;amount:number}[],personFixed:[] as {personId:string;amount:number}[],...extra});
const expense=(lines:{amount:number;splits:any[]}[]):Expense=>({id:'x',title:'SPAR',date:'2026-10-05',category:'food',total:lines.reduce((n,l)=>n+l.amount,0),payers:[{familyId:'U',amount:0}],lines:lines.map((l,i)=>({id:`l${i}`,label:`Item ${i}`,...l})),notes:'',receiptIds:[],status:'posted',version:1,allocations:[],authorId:'u'} as any);
describe('describing who an expense is for',()=>{
 it('names the meal, everyone, one family or one person',()=>{
  expect(splitWho(trip,split(100,{eventId:'e'}) as any)).toBe('for Eggslut');
  expect(splitWho(trip,split(100,{weights:all}) as any)).toBe('everyone');
  expect(splitWho(trip,split(100,{weights:[{id:'m',weight:1},{id:'a',weight:1}]}) as any)).toBe('only Uhl');
  expect(splitWho(trip,split(100,{fixed:[{familyId:'W',amount:100}]}) as any)).toBe('only Richard');
  expect(splitWho(trip,split(100,{weights:[{id:'a',weight:1}]}) as any)).toBe('only Andrea');
 });
 it('says what a receipt with many items was for',()=>{
  expect(describeSplit(trip,expense([{amount:300,splits:[split(300,{eventId:'e'})]},{amount:200,splits:[split(200,{eventId:'e'})]}]))).toBe('2 items · for Eggslut');
  expect(describeSplit(trip,expense([{amount:3010,splits:[split(3010,{eventId:'e'})]},{amount:1550,splits:[split(1550,{weights:all})]},{amount:100,splits:[split(100,{weights:[{id:'m',weight:1},{id:'a',weight:1}]})]}])))
   .toBe('3 items · for Eggslut €30.10, everyone €15.50 +1 more');
 });
});
