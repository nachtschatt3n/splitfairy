import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {allocateExpense} from '../../../packages/domain/src/accounting.js';
import {commandSchema,eventSchema,paymentSchema,expenseSchema,familySchema,personSchema,shoppingSchema,type Command,type Expense,type Trip,type User} from '../../../packages/domain/src/model.js';

export class ConflictError extends Error{statusCode=409;constructor(message='This item changed on another device'){super(message);}}
export class AccessError extends Error{statusCode=403;constructor(){super('Access denied');}}
export class InputError extends Error{statusCode=400;constructor(message:string){super(message);}}
export type Role='organizer'|'member';
export const freshTrip=(id:string,name:string,start:string,end:string):Trip=>({id,name,start,end,version:0,archived:false,families:[],people:[],events:[],shopping:[],expenses:[],payments:[],receipts:[],activity:[]});

export class Store{
 constructor(public db:DatabaseSync){
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,admin INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS trips(id TEXT PRIMARY KEY,data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS memberships(trip_id TEXT NOT NULL,email TEXT NOT NULL,role TEXT NOT NULL,PRIMARY KEY(trip_id,email));
  CREATE TABLE IF NOT EXISTS invites(trip_id TEXT NOT NULL,email TEXT NOT NULL,role TEXT NOT NULL,PRIMARY KEY(trip_id,email));
  CREATE TABLE IF NOT EXISTS codes(email TEXT PRIMARY KEY,hash TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS mutations(id TEXT PRIMARY KEY,trip_id TEXT NOT NULL,user_id TEXT NOT NULL,created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS auth_throttle(email TEXT PRIMARY KEY,window_start INTEGER NOT NULL,requests INTEGER NOT NULL,failures INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS expense_revisions(trip_id TEXT NOT NULL,expense_id TEXT NOT NULL,version INTEGER NOT NULL,data TEXT NOT NULL,changed_at TEXT NOT NULL,changed_by TEXT NOT NULL,PRIMARY KEY(trip_id,expense_id,version));`);
 }
 resetForTests(){this.db.exec('DELETE FROM auth_throttle;DELETE FROM expense_revisions;DELETE FROM mutations;DELETE FROM sessions;DELETE FROM codes;DELETE FROM invites;DELETE FROM memberships;DELETE FROM trips;DELETE FROM users;');}
 addUser(user:User){this.db.prepare('INSERT INTO users(id,email,name,admin) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name').run(user.id,user.email.toLowerCase(),user.name,user.admin?1:0);}
 userByEmail(email:string):User|null{const row=this.db.prepare('SELECT * FROM users WHERE email=?').get(email.toLowerCase()) as any;return row?{id:row.id,email:row.email,name:row.name,admin:!!row.admin}:null;}
 userById(id:string):User|null{const row=this.db.prepare('SELECT * FROM users WHERE id=?').get(id) as any;return row?{id:row.id,email:row.email,name:row.name,admin:!!row.admin}:null;}
 canLogin(email:string,adminEmail:string){return email.toLowerCase()===adminEmail.toLowerCase() || !!this.db.prepare('SELECT 1 FROM users WHERE email=?').get(email.toLowerCase()) || !!this.db.prepare('SELECT 1 FROM invites WHERE email=?').get(email.toLowerCase());}
 promoteInvites(email:string){this.db.prepare('INSERT OR IGNORE INTO memberships(trip_id,email,role) SELECT trip_id,email,role FROM invites WHERE email=?').run(email);this.db.prepare('DELETE FROM invites WHERE email=?').run(email);}
 createTrip(user:User,name:string,start:string,end:string):Trip{if(!user.admin)throw new AccessError();if(!name.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||end<start) throw new InputError('Name and valid dates required');const trip=freshTrip(randomUUID(),name.trim(),start,end);this.db.prepare('INSERT INTO trips(id,data) VALUES(?,?)').run(trip.id,JSON.stringify(trip));this.db.prepare('INSERT INTO memberships(trip_id,email,role) VALUES(?,?,?)').run(trip.id,user.email.toLowerCase(),'organizer');return trip;}
 role(user:User,tripId:string):Role{const row=this.db.prepare('SELECT role FROM memberships WHERE trip_id=? AND email=?').get(tripId,user.email.toLowerCase()) as {role:Role}|undefined;if(!row)throw new AccessError();return row.role;}
 getTrip(user:User,tripId:string):Trip{this.role(user,tripId);const row=this.db.prepare('SELECT data FROM trips WHERE id=?').get(tripId) as {data:string}|undefined;if(!row)throw new AccessError();return JSON.parse(row.data);}
 listTrips(user:User):Trip[]{return (this.db.prepare('SELECT data FROM trips WHERE id IN (SELECT trip_id FROM memberships WHERE email=?)').all(user.email.toLowerCase()) as {data:string}[]).map(r=>JSON.parse(r.data));}
 members(user:User,tripId:string){this.role(user,tripId);return this.db.prepare('SELECT email,role FROM memberships WHERE trip_id=? UNION SELECT email,role FROM invites WHERE trip_id=?').all(tripId,tripId) as {email:string;role:Role}[];}
 addMember(actor:User,tripId:string,email:string,role:Role){if(this.role(actor,tripId)!=='organizer')throw new AccessError();if(this.getTrip(actor,tripId).archived)throw new InputError('Trip is archived');email=email.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new InputError('Invalid email');this.db.prepare('INSERT INTO invites(trip_id,email,role) VALUES(?,?,?) ON CONFLICT(trip_id,email) DO UPDATE SET role=excluded.role').run(tripId,email,role);if(this.userByEmail(email))this.promoteInvites(email);}
 /** Retry a failed extraction or dismiss a receipt from the inbox. */
 updateReceipt(actor:User,tripId:string,receiptId:string,action:'retry'|'dismiss'):Trip{
  const role=this.role(actor,tripId);
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const row=this.db.prepare('SELECT data FROM trips WHERE id=?').get(tripId) as {data:string}|undefined;if(!row)throw new AccessError();const trip:Trip=JSON.parse(row.data);
   if(trip.archived)throw new InputError('Trip is archived');
   const receipt=trip.receipts.find(r=>r.id===receiptId);if(!receipt)throw new InputError('Receipt not found');
   if(receipt.authorId!==actor.id&&role!=='organizer')throw new AccessError();
   if(action==='retry'){if(receipt.status!=='failed')throw new InputError('Only failed receipts can be retried');receipt.status='queued';receipt.error=null;}
   else{if(!['failed','review'].includes(receipt.status))throw new InputError('This receipt cannot be dismissed');receipt.status='dismissed';}
   receipt.version++;trip.version++;
   trip.activity.unshift({id:randomUUID(),at:new Date().toISOString(),actor:actor.name,description:`${action} receipt`});trip.activity=trip.activity.slice(0,300);
   this.db.prepare('UPDATE trips SET data=? WHERE id=?').run(JSON.stringify(trip),tripId);this.db.exec('COMMIT');return trip;
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 /** Per-email sign-in budget that survives new codes and spoofed client IPs: 5 codes and 10 wrong guesses per hour. */
 authBudget(email:string,kind:'request'|'failure',now=Date.now()):boolean{
  const hour=3600_000,limits={request:5,failure:10};
  let row=this.db.prepare('SELECT window_start,requests,failures FROM auth_throttle WHERE email=?').get(email) as {window_start:number;requests:number;failures:number}|undefined;
  if(!row||now-row.window_start>=hour){row={window_start:now,requests:0,failures:0};}
  const used=kind==='request'?row.requests:row.failures;
  if(used>=limits[kind])return false;
  if(kind==='request')row.requests++;else row.failures++;
  this.db.prepare('INSERT INTO auth_throttle(email,window_start,requests,failures) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET window_start=excluded.window_start,requests=excluded.requests,failures=excluded.failures').run(email,row.window_start,row.requests,row.failures);
  return true;
 }
 authLocked(email:string,now=Date.now()){const row=this.db.prepare('SELECT window_start,failures FROM auth_throttle WHERE email=?').get(email) as {window_start:number;failures:number}|undefined;return !!row&&now-row.window_start<3600_000&&row.failures>=10;}
 /** Remove expired sign-in state and old idempotency keys. */
 prune(now=Date.now()){
  this.db.prepare('DELETE FROM sessions WHERE expires<?').run(now);
  this.db.prepare('DELETE FROM codes WHERE expires<?').run(now);
  this.db.prepare('DELETE FROM auth_throttle WHERE window_start<?').run(now-3600_000);
  this.db.prepare('DELETE FROM mutations WHERE created<?').run(now-180*86400_000);
 }
 mutate(actor:User,tripId:string,raw:Command):Trip{
  const command=commandSchema.parse(raw);const role=this.role(actor,tripId);
  if(['family','person','trip'].includes(command.entity)&&role!=='organizer')throw new AccessError();
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const row=this.db.prepare('SELECT data FROM trips WHERE id=?').get(tripId) as {data:string}|undefined;if(!row)throw new AccessError();const trip:Trip=JSON.parse(row.data);
   const prior=this.db.prepare('SELECT user_id,trip_id FROM mutations WHERE id=?').get(command.mutationId) as {user_id:string;trip_id:string}|undefined;
   if(prior){if(prior.user_id!==actor.id||prior.trip_id!==tripId)throw new ConflictError('Mutation ID reused');this.db.exec('COMMIT');return trip;}
   if(trip.archived&&command.entity!=='trip')throw new InputError('Trip is archived');
   if(command.entity==='trip'){
    if(command.expectedVersion!==trip.version)throw new ConflictError();
    const v=command.value as Partial<Trip>;
    if(typeof v.name==='string'&&v.name.trim())trip.name=v.name.trim().slice(0,160);
    if(typeof v.archived==='boolean')trip.archived=v.archived;
   }else{
    const key=({family:'families',person:'people',event:'events',shopping:'shopping',expense:'expenses',payment:'payments'})[command.entity];
    const list=(trip as any)[key] as any[];
    const value=command.value as any;
    if(!value?.id || typeof value.id!=='string')throw new InputError('Item ID required');
    const index=list.findIndex(item=>item.id===value.id),old=index<0?null:list[index];
    if((old?.version??0)!==command.expectedVersion)throw new ConflictError();
    if(command.action==='delete'){
     if(!old)throw new InputError('Item not found');
     if(command.entity==='expense')throw new InputError('Void expenses instead of deleting');
     if(command.entity==='payment'&&role!=='organizer'&&old.authorId!==actor.id)throw new AccessError();
     if(command.entity==='family'&&(trip.people.some(p=>p.familyId===value.id)||trip.expenses.some(e=>e.allocations.some(a=>a.familyId===value.id)||e.payers.some(p=>p.familyId===value.id)||e.lines.some(l=>l.splits.some(s=>s.fixed.some(f=>f.familyId===value.id))))||trip.payments.some(p=>p.from===value.id||p.to===value.id)))throw new InputError('Family is in use');
     if(command.entity==='person'&&trip.expenses.some(e=>e.allocations.some(a=>a.personId===value.id)))throw new InputError('Person is in use');
     if(command.entity==='person'&&trip.events.some(e=>e.participants.some(p=>p.id===value.id)))throw new InputError('Remove this person from planned events first');
     if(command.entity==='event'&&trip.expenses.some(e=>e.lines.some(l=>l.splits.some(s=>s.eventId===value.id))))throw new InputError('Event is linked to an expense');
     list.splice(index,1);
    }else{
     let parsed:any;
     switch(command.entity){
      case 'family':parsed=familySchema.parse(value);break;
      case 'person':parsed=personSchema.parse(value);if(!trip.families.some(f=>f.id===parsed.familyId))throw new InputError('Unknown family');break;
      case 'event':parsed=eventSchema.parse(value);for(const p of parsed.participants)if(!trip.people.some(x=>x.id===p.id))throw new InputError('Unknown participant');break;
      case 'shopping':parsed=shoppingSchema.parse(value);if(parsed.eventId&&!trip.events.some(e=>e.id===parsed.eventId))throw new InputError('Unknown event');break;
      case 'expense':{
       const e=expenseSchema.parse(value);
       if(old&&role!=='organizer'&&old.authorId!==actor.id)throw new AccessError();
       if(e.status==='void'&&!old)throw new InputError('Cannot void a new expense');
       for(const payer of e.payers)if(!trip.families.some(f=>f.id===payer.familyId))throw new InputError('Unknown payer');
       if(e.status==='draft'&&e.receiptIds.length)throw new InputError('Confirm a receipt expense instead of saving a draft');
       // Voiding keeps the lines as history; they need not match events that changed since.
       if(e.status!=='void')for(const line of e.lines)for(const split of line.splits){
        if(split.eventId){const event=trip.events.find(e=>e.id===split.eventId);if(!event||event.version!==split.eventVersion)throw new ConflictError('Event participants changed; review split again');
         if(JSON.stringify(event.participants)!==JSON.stringify(split.weights))throw new InputError('Event weights do not match');}
        for(const f of split.fixed)if(!trip.families.some(x=>x.id===f.familyId))throw new InputError('Unknown covering family');
       }
       if(e.lines.reduce((n,l)=>n+l.amount,0)!==e.total)throw new InputError('Receipt lines do not match total');
       for(const line of e.lines)if(line.splits.reduce((n,s)=>n+s.amount,0)!==line.amount)throw new InputError('Item split does not match item');
       if(old&&JSON.stringify([...old.receiptIds].sort())!==JSON.stringify([...e.receiptIds].sort()))throw new InputError('Receipts cannot be moved between expenses');
       for(const id of e.receiptIds){
        const receipt=trip.receipts.find(r=>r.id===id);
        const linkedHere=!!old&&receipt?.expenseId===e.id;
        if(!receipt||(!linkedHere&&receipt.status!=='review'))throw new InputError('Receipt is not ready for review');
        if(!old&&receipt.authorId!==actor.id&&role!=='organizer')throw new AccessError();
       }
       let allocations:Expense['allocations'];
       try{allocations=e.status==='void'?[]:allocateExpense({total:e.total,payers:e.payers,splits:e.lines.flatMap(l=>l.splits)},trip.people);}
       catch(error){throw new InputError(error instanceof Error?error.message:'Invalid split');}
       for(const id of e.receiptIds){
        const receipt=trip.receipts.find(r=>r.id===id)!;
        // A voided expense releases its receipt back to the inbox so it can be posted again correctly.
        const next=e.status==='void'?{status:'review' as const,expenseId:null}:{status:'posted' as const,expenseId:e.id};
        if(receipt.status!==next.status||receipt.expenseId!==next.expenseId){Object.assign(receipt,next);receipt.version++;}
       }
       if(old)this.db.prepare('INSERT INTO expense_revisions(trip_id,expense_id,version,data,changed_at,changed_by) VALUES(?,?,?,?,?,?)').run(tripId,old.id,old.version,JSON.stringify(old),new Date().toISOString(),actor.id);
       parsed={...e,allocations,authorId:old?.authorId??actor.id};break;
      }
      case 'payment':{
       if(old&&role!=='organizer'&&old.authorId!==actor.id)throw new AccessError();const p=paymentSchema.parse(value);if(!trip.families.some(f=>f.id===p.from)||!trip.families.some(f=>f.id===p.to)||p.from===p.to)throw new InputError('Invalid repayment');
       parsed={id:p.id,from:p.from,to:p.to,amount:p.amount,date:p.date,authorId:old?.authorId??actor.id,version:0};break;
      }
     }
     parsed.version=(old?.version??0)+1;
     if(index<0)list.push(parsed);else list[index]=parsed;
    }
   }
   trip.version++;trip.activity.unshift({id:randomUUID(),at:new Date().toISOString(),actor:actor.name,description:`${command.action} ${command.entity}`});trip.activity=trip.activity.slice(0,300);
   this.db.prepare('UPDATE trips SET data=? WHERE id=?').run(JSON.stringify(trip),tripId);
   this.db.prepare('INSERT INTO mutations(id,trip_id,user_id,created) VALUES(?,?,?,?)').run(command.mutationId,tripId,actor.id,Date.now());this.db.exec('COMMIT');return trip;
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
}
