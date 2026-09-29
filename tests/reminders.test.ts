import {it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {Store} from '../apps/server/src/store.js';
import {sendSettleReminders} from '../apps/server/src/reminders.js';
import {settleStatus} from '../packages/domain/src/settle-status.js';
import type {Command} from '../packages/domain/src/model.js';

const actor={id:'u',email:'ana@example.com',name:'Ana',admin:true};
let n=0;const cmd=(entity:Command['entity'],value:any,expectedVersion=0,action:'save'|'delete'='save'):Command=>({mutationId:`r${n++}`,entity,action,expectedVersion,value:{version:0,...value}});
function trip(){
 const store=new Store(new DatabaseSync(':memory:'));store.addUser(actor);
 const t=store.createTrip(actor,'Algarve','2026-09-20','2026-09-27');
 store.mutate(actor,t.id,cmd('family',{id:'U',name:'Uhl',solo:false}));store.mutate(actor,t.id,cmd('family',{id:'M',name:'Moncrief',solo:false}));
 store.mutate(actor,t.id,cmd('person',{id:'a',name:'Ana',familyId:'U',weight:1,email:'ana@example.com'}));
 store.mutate(actor,t.id,cmd('person',{id:'w',name:'Will',familyId:'M',weight:1,email:'will@example.com'}));
 store.mutate(actor,t.id,cmd('person',{id:'k',name:'Kid',familyId:'M',weight:0.5}));
 // Uhl paid 100, split evenly between the families: Moncrief owes Uhl 50.
 store.mutate(actor,t.id,cmd('expense',{id:'x',title:'House',date:'2026-09-20',category:'stay',total:10000,payers:[{familyId:'U',amount:10000}],lines:[{id:'l',label:'House',amount:10000,splits:[{amount:10000,eventId:null,weights:[],fixed:[{familyId:'U',amount:5000},{familyId:'M',amount:5000}]}]}],notes:'',receiptIds:[],status:'posted'}));
 return {store,id:t.id};
}
const at=(iso:string)=>({now:new Date(iso),timeZone:'Europe/Berlin'});

it('knows when a trip is overdue',()=>{
 const {store,id}=trip();const t=store.getTrip(actor,id);
 expect(settleStatus(t,'2026-09-27')).toMatchObject({open:true,ended:false,overdueDays:0,owed:5000});
 expect(settleStatus(t,'2026-10-06')).toMatchObject({open:true,ended:true,overdueDays:9});
});

it('emails families that still owe, weekly after the trip, in the daytime, until settled',async()=>{
 const {store,id}=trip();const mails:{to:string;subject:string;text:string}[]=[];
 const send=async(to:string,subject:string,text:string)=>{mails.push({to,subject,text});};
 expect(await sendSettleReminders(store,send,'https://trips.example',at('2026-09-27T10:00:00Z'))).toEqual([]);// last day: not yet
 expect(await sendSettleReminders(store,send,'https://trips.example',at('2026-09-28T03:00:00Z'))).toEqual([]);// night
 const first=await sendSettleReminders(store,send,'https://trips.example',at('2026-09-28T08:00:00Z'));
 expect(first).toEqual([{tripId:id,familyId:'M',to:['will@example.com']}]);
 expect(mails[0].subject).toMatch(/^Reminder: Moncrief still owes 50,00\s€ for Algarve$/);
 expect(mails[0].text).toMatch(/50,00\s€ to Uhl/);expect(mails[0].text).toContain(`https://trips.example/trips/${id}/settle`);expect(mails[0].text).toContain('ended 1 day ago');
 expect(await sendSettleReminders(store,send,'https://trips.example',at('2026-10-02T08:00:00Z'))).toEqual([]);// within the week
 expect(await sendSettleReminders(store,send,'https://trips.example',at('2026-10-05T07:30:00Z'))).toHaveLength(1);// a week later
 expect(mails.at(-1)!.text).toContain('ended 8 days ago');
 // Paused by an organizer: no reminders.
 let t=store.getTrip(actor,id);store.mutate(actor,id,cmd('trip',{reminders:false},t.version));
 expect(await sendSettleReminders(store,send,'https://trips.example',at('2026-10-13T08:00:00Z'))).toEqual([]);
 t=store.getTrip(actor,id);store.mutate(actor,id,cmd('trip',{reminders:true},t.version));
 // Archiving is refused while money is owed; once repaid, reminders stop and the trip can be archived.
 t=store.getTrip(actor,id);expect(()=>store.mutate(actor,id,cmd('trip',{archived:true},t.version))).toThrow(/Settle up first: 1 repayment is still open/);
 store.mutate(actor,id,cmd('payment',{id:'p',from:'M',to:'U',amount:5000,date:'2026-10-13'}));
 expect(await sendSettleReminders(store,send,'https://trips.example',at('2026-10-20T08:00:00Z'))).toEqual([]);
 t=store.getTrip(actor,id);expect(store.mutate(actor,id,cmd('trip',{archived:true},t.version)).archived).toBe(true);
});
