import {balances,settle,type Transfer} from './accounting.js';
import type {Trip} from './model.js';

export type SettleStatus={open:boolean;ended:boolean;overdueDays:number;transfers:Transfer[];balances:Record<string,number>;owed:number};
const dayNumber=(iso:string)=>Math.floor(Date.parse(`${iso}T00:00:00Z`)/86_400_000);

/**
 * Whether money is still owed in a trip, and for how long since it ended.
 * A trip is overdue from the day after its last day until the balances are settled.
 */
export function settleStatus(trip:Pick<Trip,'families'|'expenses'|'payments'|'end'>,today:string):SettleStatus{
 let b:Record<string,number>={},transfers:Transfer[]=[];
 try{b=balances(trip.families.map(f=>f.id),trip.expenses.filter(e=>e.status==='posted'),trip.payments);transfers=settle(b).transfers;}catch{/* inconsistent data is shown elsewhere */}
 const open=transfers.length>0,ended=!!trip.end&&trip.end<today;
 return {open,ended,overdueDays:open&&ended?dayNumber(today)-dayNumber(trip.end):0,transfers,balances:b,owed:transfers.reduce((n,t)=>n+t.amount,0)};
}
