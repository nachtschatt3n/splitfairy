import type {Trip} from '../../../packages/domain/src/model.js';
import {settleStatus} from '../../../packages/domain/src/settle-status.js';
import {settleReminderEmail} from './mail.js';
import type {Store} from './store.js';

type Send=(to:string,subject:string,text:string,html?:string)=>Promise<void>;
const WEEK=7*86_400_000;
/** Local calendar day and hour in the operator's time zone (reminders go out in the daytime). */
function local(now:Date,timeZone:string){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 return {day:`${parts.year}-${parts.month}-${parts.day}`,hour:Number(parts.hour)};
}

/**
 * After a trip has ended, every family that still owes money gets an email once a week (from the day after
 * the last day, between 9:00 and 20:00) until the balances are settled. Sent to the family's people who have
 * an email address; organizers can pause reminders per trip. Returns what was sent, for logs and tests.
 */
export async function sendSettleReminders(store:Store,send:Send,publicUrl:string|null,{now=new Date(),timeZone='Europe/Berlin'}:{now?:Date;timeZone?:string}={}){
 const {day,hour}=local(now,timeZone);
 const sent:{tripId:string;familyId:string;to:string[]}[]=[];
 if(hour<9||hour>=20||!publicUrl)return sent;
 for(const row of store.db.prepare('SELECT id,data FROM trips').all() as {id:string;data:string}[]){
  const trip:Trip=JSON.parse(row.data);if(trip.archived||trip.remindersOff)continue;
  const status=settleStatus(trip,day);if(!status.ended||!status.open)continue;
  for(const familyId of new Set(status.transfers.map(t=>t.from))){
   const last=store.db.prepare('SELECT last_sent FROM settle_reminders WHERE trip_id=? AND family_id=?').get(trip.id,familyId) as {last_sent:string}|undefined;
   // An hour of slack so the weekly email does not drift later every week.
   if(last&&now.getTime()-Date.parse(last.last_sent)<WEEK-3_600_000)continue;
   const family=trip.families.find(f=>f.id===familyId);if(!family)continue;
   const people=trip.people.filter(p=>p.familyId===familyId&&p.email);
   const recipients=[...new Map(people.map(p=>[p.email!.toLowerCase(),p.name])).entries()];
   if(!recipients.length)continue;
   const owes=status.transfers.filter(t=>t.from===familyId).map(t=>({to:trip.families.find(f=>f.id===t.to)?.name??'another family',amount:t.amount}));
   const url=`${publicUrl.replace(/\/$/,'')}/trips/${trip.id}/settle`;
   let delivered:string[]=[];
   for(const [email,name] of recipients){
    const mail=settleReminderEmail({name,tripName:trip.name,family:family.name,owes,overdueDays:status.overdueDays,url});
    try{await send(email,mail.subject,mail.text,mail.html);delivered=[...delivered,email];}catch{/* try again next hour */}
   }
   if(delivered.length){
    store.db.prepare('INSERT INTO settle_reminders(trip_id,family_id,last_sent) VALUES(?,?,?) ON CONFLICT(trip_id,family_id) DO UPDATE SET last_sent=excluded.last_sent').run(trip.id,familyId,now.toISOString());
    sent.push({tripId:trip.id,familyId,to:delivered});
   }
  }
 }
 return sent;
}
