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
const clock=z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),z.literal('')]).default('');
export const eventSchema=z.object({id,title:z.string().trim().min(1).max(160),date:z.iso.date(),time:clock,kind:z.enum(['breakfast','lunch','dinner','restaurant','activity']),address:z.string().trim().max(300).default(''),recipeUrl:z.union([z.literal(''),z.url({protocol:/^https?$/}).max(500)]).default(''),owner:z.string().max(80).default(''),notes:z.string().max(2000).default(''),participants:z.array(weightedSchema).max(100),version});
export const paymentSchema=z.object({id,from:id,to:id,amount:money.positive(),date:z.iso.date(),version});
/** A car, flight or other way things travel; optionally belongs to a family. */
export const transportSchema=z.object({id,name:z.string().trim().min(1).max(80),kind:z.enum(['car','plane','train','bus','other']).default('car'),familyId:id.nullable().default(null),note:z.string().trim().max(300).default(''),version});
/** Packing and equipment: who brings what. familyId null means nobody has taken it yet; transportId says how it travels. */
export const gearSchema=z.object({id,text:z.string().trim().min(1).max(200),familyId:id.nullable().default(null),transportId:id.nullable().default(null),route:z.array(id).max(10).default([]),quantity:z.number().int().min(1).max(99).default(1),note:z.string().trim().max(300).default(''),packed:z.boolean().default(false),version});
export const shoppingSchema=z.object({id,text:z.string().trim().min(1).max(200),eventId:id.nullable(),done:z.boolean(),version});
/** How a split was entered, so it can be edited the same way. All modes are stored as weights and fixed amounts. */
export const SPLIT_MODES=['equal','exact','percent','shares','adjust','families'] as const;
export type SplitMode=typeof SPLIT_MODES[number];
export const splitSchema=z.object({amount:money,eventId:id.nullable().default(null),eventVersion:z.number().int().optional(),weights:z.array(weightedSchema).max(100),fixed:z.array(z.object({familyId:id,amount:money})).default([]),
 personFixed:z.array(z.object({personId:id,amount:money})).max(100).default([]),mode:z.enum(SPLIT_MODES).optional()});
export const lineSchema=z.object({id,label:z.string().min(1).max(300),amount:money,splits:z.array(splitSchema).max(100)});
export const expenseSchema=z.object({id,title:z.string().trim().min(1).max(160),date:z.iso.date(),category:z.enum(['food','activity','transport','stay','other']),total:money,payers:z.array(z.object({familyId:id,amount:money})).min(1).max(100),lines:z.array(lineSchema).min(1).max(500),notes:z.string().max(2000).default(''),receiptIds:z.array(id).max(10).default([]),status:z.enum(['draft','posted','void']),version});
// Trips saved before these fields existed simply lack them.
export type Family=Omit<z.infer<typeof familySchema>,'solo'>&{solo?:boolean};
export type Person=Omit<z.infer<typeof personSchema>,'email'>&{email?:string};
// Events saved before times and addresses existed have neither.
export type Event=Omit<z.infer<typeof eventSchema>,'time'|'address'|'recipeUrl'>&{time?:string;address?:string;recipeUrl?:string};
export type Shopping=z.infer<typeof shoppingSchema>;
export type Gear=Omit<z.infer<typeof gearSchema>,'transportId'|'route'>&{transportId?:string|null;route?:string[]};
export type Transport=z.infer<typeof transportSchema>;
/** A place to sleep: first night (from) up to the check-out day (to), optionally linked to its booking cost. */
export const staySchema=z.object({id,name:z.string().trim().min(1).max(120),address:z.string().trim().max(300).default(''),from:z.iso.date(),to:z.iso.date(),checkIn:clock,checkOut:clock,note:z.string().trim().max(1000).default(''),guests:z.array(weightedSchema).max(100).default([]),expenseId:id.nullable().default(null),version}).refine(s=>s.to>=s.from,{message:'Check-out must be on or after the first night'});
/** One leg of travel in a car or flight: where from and to, when, and who is on board. */
export const legSchema=z.object({id,transportId:id,from:z.string().trim().min(1).max(120),to:z.string().trim().min(1).max(120),departDate:z.iso.date(),departTime:clock,arriveDate:z.iso.date(),arriveTime:clock,people:z.array(id).max(100).default([]),note:z.string().trim().max(1000).default(''),flightNo:z.string().trim().toUpperCase().regex(/^([A-Z0-9]{2}\s?\d{1,4}[A-Z]?)?$/,'Use a flight number like LH 1172').default(''),version}).refine(l=>`${l.arriveDate}${l.arriveTime||'99:99'}`>=`${l.departDate}${l.departTime||'00:00'}`,{message:'Arrival must be after departure'});
export type Stay=z.infer<typeof staySchema>;
export type Leg=z.infer<typeof legSchema>;
export type ExpenseInput=z.infer<typeof expenseSchema>;
export type Allocation={personId:string|null;familyId:string;amount:number};
export type Split=z.infer<typeof splitSchema>;
export type Expense=ExpenseInput & {allocations:Allocation[];authorId:string};
export type Payment={id:string;from:string;to:string;amount:number;date:string;authorId:string;version:number};
export type ReceiptStatus='queued'|'processing'|'review'|'failed'|'posted'|'dismissed';
export type Receipt={id:string;status:ReceiptStatus;items:{label:string;amount:number}[];total:number|null;merchant:string;date:string;error:string|null;version:number;authorId:string;expenseId?:string|null};
/** A picture of a place (a stay); the image lives on the server, next to the receipts. */
/** A picture of a stay (stayId) or of a plan such as a meal (eventId). */
export type Photo={id:string;stayId?:string;eventId?:string;authorId:string;author:string;at:string};
export const TRIP_THEMES=['classic','coast','alpine','city','countryside'] as const;
export type TripTheme=typeof TRIP_THEMES[number];
export type Trip={id:string;name:string;start:string;end:string;version:number;archived:boolean;theme?:TripTheme;families:Family[];people:Person[];events:Event[];shopping:Shopping[];gear?:Gear[];transport?:Transport[];stays?:Stay[];legs?:Leg[];expenses:Expense[];payments:Payment[];receipts:Receipt[];photos?:Photo[];activity:{id:string;at:string;actor:string;description:string}[]};
export const commandSchema=z.object({mutationId:id,entity:z.enum(['family','person','event','shopping','gear','transport','stay','leg','expense','payment','trip']),action:z.enum(['save','delete']),expectedVersion:z.number().int().nonnegative(),value:z.unknown()});
export type Command=z.infer<typeof commandSchema>;
export type User={id:string;email:string;name:string;admin:boolean};
export type Member={email:string;role:string;joined:boolean};
export type TripView={trip:Trip;role:'organizer'|'member';cursor:number;members?:Member[]};
