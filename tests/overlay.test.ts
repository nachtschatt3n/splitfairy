import {it,expect} from 'vitest';
import {overlay} from '../apps/web/src/overlay.js';
import {freshTrip} from '../apps/server/src/store.js';
it('shows offline additions in balances without mutating the saved server snapshot',()=>{
 const trip=freshTrip('t','Italy','2026-10-01','2026-10-09');
 trip.families=[{id:'f1',name:'A',version:1},{id:'f2',name:'B',version:1}];
 trip.people=[{id:'p1',name:'Ann',familyId:'f1',weight:1,version:1},{id:'p2',name:'Ben',familyId:'f2',weight:1,version:1}];
 const expense={id:'e',title:'Boat',date:'2026-10-01',category:'activity',total:1000,payers:[{familyId:'f1',amount:1000}],lines:[{id:'l',label:'Boat',amount:1000,splits:[{amount:1000,eventId:null,weights:[{id:'p1',weight:1},{id:'p2',weight:1}],fixed:[]}]}],status:'posted',version:0,notes:'',receiptIds:[]};
 const local=overlay(trip,[{mutationId:'m',entity:'expense',action:'save',expectedVersion:0,value:expense}]);
 expect(local.expenses[0].allocations).toEqual([{personId:'p1',familyId:'f1',amount:500},{personId:'p2',familyId:'f2',amount:500}]);
 expect(trip.expenses).toHaveLength(0);
});
