import {z} from 'zod';
export const id=z.string().min(1).max(100);
export const money=z.number().int().min(-100000000).max(100000000);
const version=z.number().int().nonnegative().default(0);
export const weight=z.number().finite().min(0).max(100).multipleOf(.001);
/** solo: a wallet for one person who travels on their own (shown as a person, not a family). */
export const familySchema=z.object({id,name:z.string().trim().min(1).max(80),solo:z.boolean().default(false),version});
/** email is optional: adults get an invitation to sign in, children usually have none. */
export const personSchema=z.object({id,name:z.string().trim().min(1).max(80),familyId:id,weight,email:z.union([z.email().max(254),z.literal('')]).default('').transform(v=>v.toLowerCase()),version});
export const weightedSchema=z.object({id,weight});
export const eventSchema=z.object({id,title:z.string().trim().min(1).max(160),date:z.iso.date(),kind:z.enum(['breakfast','lunch','dinner','activity']),owner:z.string().max(80).default(''),notes:z.string().max(2000).default(''),participants:z.array(weightedSchema).max(100),version});
export const paymentSchema=z.object({id,from:id,to:id,amount:money.positive(),date:z.iso.date(),version});
/** A car, flight or other way things travel; optionally belongs to a family. */
export const transportSchema=z.object({id,name:z.string().trim().min(1).max(80),kind:z.enum(['car','plane','train','bus','other']).default('car'),familyId:id.nullable().default(null),note:z.string().trim().max(300).default(''),version});
/** Packing and equipment: who brings what. familyId null means nobody has taken it yet; transportId says how it travels. */
export const gearSchema=z.object({id,text:z.string().trim().min(1).max(200),familyId:id.nullable().default(null),transportId:id.nullable().default(null),quantity:z.number().int().min(1).max(99).default(1),note:z.string().trim().max(300).default(''),packed:z.boolean().default(false),version});
export const shoppingSchema=z.object({id,text:z.string().trim().min(1).max(200),eventId:id.nullable(),done:z.boolean(),version});
export const splitSchema=z.object({amount:money,eventId:id.nullable().default(null),eventVersion:z.number().int().optional(),weights:z.array(weightedSchema).max(100),fixed:z.array(z.object({familyId:id,amount:money})).default([])});
export const lineSchema=z.object({id,label:z.string().min(1).max(300),amount:money,splits:z.array(splitSchema).max(100)});
export const expenseSchema=z.object({id,title:z.string().trim().min(1).max(160),date:z.iso.date(),category:z.enum(['food','activity','transport','stay','other']),total:money,payers:z.array(z.object({familyId:id,amount:money})).min(1).max(100),lines:z.array(lineSchema).min(1).max(500),notes:z.string().max(2000).default(''),receiptIds:z.array(id).max(10).default([]),status:z.enum(['draft','posted','void']),version});
// Trips saved before these fields existed simply lack them.
export type Family=Omit<z.infer<typeof familySchema>,'solo'>&{solo?:boolean};
export type Person=Omit<z.infer<typeof personSchema>,'email'>&{email?:string};
export type Event=z.infer<typeof eventSchema>;
export type Shopping=z.infer<typeof shoppingSchema>;
export type Gear=Omit<z.infer<typeof gearSchema>,'transportId'>&{transportId?:string|null};
export type Transport=z.infer<typeof transportSchema>;
export type ExpenseInput=z.infer<typeof expenseSchema>;
export type Allocation={personId:string|null;familyId:string;amount:number};
export type Expense=ExpenseInput & {allocations:Allocation[];authorId:string};
export type Payment={id:string;from:string;to:string;amount:number;date:string;authorId:string;version:number};
export type ReceiptStatus='queued'|'processing'|'review'|'failed'|'posted'|'dismissed';
export type Receipt={id:string;status:ReceiptStatus;items:{label:string;amount:number}[];total:number|null;merchant:string;date:string;error:string|null;version:number;authorId:string;expenseId?:string|null};
export type Trip={id:string;name:string;start:string;end:string;version:number;archived:boolean;families:Family[];people:Person[];events:Event[];shopping:Shopping[];gear?:Gear[];transport?:Transport[];expenses:Expense[];payments:Payment[];receipts:Receipt[];activity:{id:string;at:string;actor:string;description:string}[]};
export const commandSchema=z.object({mutationId:id,entity:z.enum(['family','person','event','shopping','gear','transport','expense','payment','trip']),action:z.enum(['save','delete']),expectedVersion:z.number().int().nonnegative(),value:z.unknown()});
export type Command=z.infer<typeof commandSchema>;
export type User={id:string;email:string;name:string;admin:boolean};
export type Member={email:string;role:string;joined:boolean};
export type TripView={trip:Trip;role:'organizer'|'member';cursor:number;members?:Member[]};
