import {randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {z} from 'zod';
import type {Trip} from '../../../packages/domain/src/model.js';

/**
 * MCP over Streamable HTTP at /mcp, authenticated with a personal access token.
 * Every tool calls the app's own REST API with the caller's token, so access rules,
 * validation and conflict checks are exactly the ones the app uses.
 */
const ENTITIES=['family','person','event','shopping','gear','transport','stay','leg','expense','payment'] as const;
type Entity=typeof ENTITIES[number];
const LISTS:Record<Entity,keyof Trip>={family:'families',person:'people',event:'events',shopping:'shopping',gear:'gear',transport:'transport',stay:'stays',leg:'legs',expense:'expenses',payment:'payments'};
const SPLIT_MODES=['families','equal','shares','exact','percent','adjust'] as const;

const ENTITY_GUIDE=`Entities (fields; ids are strings, dates YYYY-MM-DD, times HH:MM, money in cents):
- family {name, solo:boolean}
- person {name, familyId, weight (share: 1 adult, 0.5 child, 0 baby), email?}
- event {title, date, time?, kind: breakfast|lunch|dinner|restaurant|activity, address?, recipeUrl?, owner?, notes?, participants:[{id:personId, weight}]}
- shopping {text, eventId|null, buyerId|null (the family that buys it; null = anyone), done:boolean}
- gear {text, familyId|null, quantity, note?, packed:boolean, route:[transportId,…], visibility: everyone|family} (family = only that family sees it; only for your own family)
- transport {name, kind: car|plane|train|bus|other, familyId|null, note?}
- stay {name, address?, url? (booking link), from, to (check-out day), checkIn?, checkOut?, note?, guests:[{id:personId, weight}], schedule:[{id, familyId|null, personId|null, arriveDate?, arriveTime?, departDate?, departTime?}] (own arrival/departure per family or person; empty dates = the stay's), expenseId|null}
- leg {transportId, from, to, departDate, departTime?, arriveDate, arriveTime?, people:[personId], note?, flightNo?}
- expense: use add_expense to create; save_item for simple edits (title, date, category, notes, status: posted|void)
- payment {from:familyId, to:familyId, amount (cents), date} — a repayment between families`;

type Api=(method:'GET'|'POST'|'PUT'|'DELETE',url:string,body?:unknown)=>Promise<any>;
const text=(value:unknown)=>({content:[{type:'text' as const,text:typeof value==='string'?value:JSON.stringify(value,null,2)}]});
const fail=(message:string)=>({isError:true,content:[{type:'text' as const,text:message}]});

function tools(server:McpServer,api:Api,baseUrl:string){
 const trip=async(id:string):Promise<{trip:Trip;role:string}>=>api('GET',`/api/v1/trips/${encodeURIComponent(id)}`);
 const command=(tripId:string,entity:string,action:'save'|'delete',expectedVersion:number,value:unknown)=>api('POST',`/api/v1/trips/${encodeURIComponent(tripId)}/commands`,{mutationId:randomUUID(),entity,action,expectedVersion,value});
 const link=(tripId:string,path='')=>`${baseUrl}/trips/${tripId}${path}`;
 /** People or families by id or (case-insensitive) name. */
 const find=<T extends {id:string;name:string}>(list:T[],key:string,what:string)=>{const hit=list.find(x=>x.id===key)??list.find(x=>x.name.toLowerCase()===key.toLowerCase());if(!hit)throw new Error(`Unknown ${what} "${key}". Known: ${list.map(x=>x.name).join(', ')||'none yet'}`);return hit;};
 const guard=async(work:()=>Promise<unknown>)=>{try{return text(await work());}catch(error){return fail(error instanceof Error?error.message:String(error));}};

 server.registerTool('list_trips',{title:'List trips',description:'Trips the token owner belongs to, with their id, dates and a link.',inputSchema:{}},
  ()=>guard(async()=>(await api('GET','/api/v1/trips') as any[]).map(t=>({...t,url:link(t.id)}))));

 server.registerTool('get_trip',{title:'Get a trip',description:`Everything in a trip: families, people, plans, shopping, packing, transport, stays, travel legs, expenses, repayments, receipts and activity, plus your role. Use the ids from here in other tools.\n\n${ENTITY_GUIDE}`,
  inputSchema:{trip_id:z.string().describe('Trip id from list_trips')}},
  ({trip_id})=>guard(async()=>{const view=await trip(trip_id);return {role:view.role,url:link(trip_id),trip:view.trip};}));

 server.registerTool('create_trip',{title:'Create a trip',description:'Creates a trip; you become its organizer.',
  inputSchema:{name:z.string().min(1).max(160),start:z.string().describe('YYYY-MM-DD'),end:z.string().describe('YYYY-MM-DD'),theme:z.enum(['classic','coast','alpine','city','countryside']).optional()}},
  input=>guard(async()=>{const created=await api('POST','/api/v1/trips',input);return {...created,url:link(created.id)};}));

 server.registerTool('update_trip',{title:'Update a trip',description:'Changes the name, dates, theme or archived flag (organizers only).',
  inputSchema:{trip_id:z.string(),name:z.string().min(1).max(160).optional(),start:z.string().optional(),end:z.string().optional(),theme:z.enum(['classic','coast','alpine','city','countryside']).optional(),archived:z.boolean().optional()}},
  ({trip_id,...changes})=>guard(async()=>{const view=await trip(trip_id);const t=view.trip;
   const value={name:changes.name??t.name,start:changes.start??t.start,end:changes.end??t.end,theme:changes.theme??t.theme??'classic',archived:changes.archived??t.archived};
   const next=await command(trip_id,'trip','save',t.version,value);return {name:next.trip.name,start:next.trip.start,end:next.trip.end,theme:next.trip.theme,archived:next.trip.archived};}));

 server.registerTool('delete_trip',{title:'Delete a trip',description:'Deletes a trip for everyone (organizers only; trips with money in them can only be archived). Ask the user to confirm first.',
  inputSchema:{trip_id:z.string(),confirm:z.literal(true).describe('Must be true; confirm with the user first')}},
  ({trip_id})=>guard(async()=>api('DELETE',`/api/v1/trips/${encodeURIComponent(trip_id)}`)));

 server.registerTool('save_item',{title:'Create or update an item',description:`Creates an item (leave out "id") or updates one (give its "id"; only the fields you pass change). Returns the saved item.\n\n${ENTITY_GUIDE}`,
  inputSchema:{trip_id:z.string(),entity:z.enum(ENTITIES),item:z.record(z.string(),z.unknown()).describe('Fields of the item, see the entity list')}},
  ({trip_id,entity,item})=>guard(async()=>{
   const view=await trip(trip_id),list=(view.trip[LISTS[entity]] as {id:string;version:number}[]|undefined)??[];
   const old=typeof item.id==='string'?list.find(x=>x.id===item.id):undefined;
   if(item.id&&!old)throw new Error(`No ${entity} with id ${String(item.id)}`);
   const {allocations:_a,authorId:_b,...base}=(old??{}) as any;
   const value={...base,...item,id:old?.id??randomUUID(),version:old?.version??0};
   const next=await command(trip_id,entity,'save',old?.version??0,value);
   return (next.trip[LISTS[entity]] as {id:string}[]).find(x=>x.id===value.id);
  }));

 server.registerTool('delete_item',{title:'Delete an item',description:'Removes an item. Expenses cannot be deleted: this voids them instead (they leave the balances and can be restored).',
  inputSchema:{trip_id:z.string(),entity:z.enum(ENTITIES),id:z.string()}},
  ({trip_id,entity,id})=>guard(async()=>{
   const view=await trip(trip_id),list=(view.trip[LISTS[entity]] as any[]|undefined)??[],old=list.find(x=>x.id===id);
   if(!old)throw new Error(`No ${entity} with id ${id}`);
   if(entity==='expense'){const {allocations:_a,authorId:_b,...value}=old;await command(trip_id,'expense','save',old.version,{...value,status:'void'});return {voided:id};}
   await command(trip_id,entity,'delete',old.version,{id});return {deleted:id};
  }));

 server.registerTool('add_expense',{title:'Add an expense',description:'Adds what someone paid and how it is shared. People and families can be given by id or name. Default split: equally between all families. Modes: families (equal per family, optionally only some), equal (equal per person), shares (by weight per person; defaults to everyone\'s trip share), exact (euros per person), percent (per person, adds up to 100), adjust (euros on top per person, the rest equal). Give plan_id to link it to a meal, restaurant or activity (then it is shared by the people joining).',
  inputSchema:{trip_id:z.string(),title:z.string().min(1).max(160),amount_eur:z.number().describe('Total in euros; negative for a refund'),paid_by:z.string().describe('Family id or name'),date:z.string().optional().describe('YYYY-MM-DD, default today'),
   category:z.enum(['food','activity','transport','stay','other']).default('food'),notes:z.string().max(2000).optional(),plan_id:z.string().optional(),
   split:z.object({mode:z.enum(SPLIT_MODES).default('families'),families:z.array(z.string()).optional().describe('families mode: which families (default all)'),
    people:z.array(z.string()).optional().describe('equal mode: who shares it (default everyone)'),values:z.record(z.string(),z.number()).optional().describe('shares/exact/percent/adjust: person id or name → number')}).optional()}},
  input=>guard(async()=>{
   const view=await trip(input.trip_id),t=view.trip,total=Math.round(input.amount_eur*100);
   if(!Number.isSafeInteger(total)||!total)throw new Error('Give a non-zero amount');
   const payer=find(t.families,input.paid_by,'family'),sign=Math.sign(total),abs=Math.abs(total);
   let weights:{id:string;weight:number}[]=[],fixed:{familyId:string;amount:number}[]=[],personFixed:{personId:string;amount:number}[]=[];
   let mode:string|undefined=input.split?.mode??'families',eventId:string|null=null,eventVersion:number|undefined;
   const values=Object.entries(input.split?.values??{}).map(([key,value])=>({person:find(t.people,key,'person'),value}));
   if(input.plan_id){const ev=t.events.find(e=>e.id===input.plan_id);if(!ev)throw new Error('Unknown plan');if(!ev.participants.length)throw new Error('Nobody has joined that plan yet');eventId=ev.id;eventVersion=ev.version;weights=ev.participants;mode=undefined;}
   else if(mode==='families'){const chosen=input.split?.families?.length?input.split.families.map(f=>find(t.families,f,'family')):t.families;if(!chosen.length)throw new Error('The trip has no families yet');const each=Math.trunc(abs/chosen.length),extra=abs%chosen.length;fixed=chosen.map((f,i)=>({familyId:f.id,amount:(each+(i<extra?1:0))*sign}));}
   else if(mode==='equal'){const chosen=input.split?.people?.length?input.split.people.map(p=>find(t.people,p,'person')):t.people;weights=chosen.map(p=>({id:p.id,weight:1}));}
   else if(mode==='shares'){weights=values.length?values.map(v=>({id:v.person.id,weight:v.value})):t.people.map(p=>({id:p.id,weight:p.weight}));}
   else if(mode==='percent'){const sum=values.reduce((n,v)=>n+v.value,0);if(Math.abs(sum-100)>.001)throw new Error(`Percentages add up to ${sum}, not 100`);weights=values.map(v=>({id:v.person.id,weight:v.value}));}
   else if(mode==='exact'){personFixed=values.map(v=>({personId:v.person.id,amount:Math.round(v.value*100)*sign}));if(personFixed.reduce((n,f)=>n+Math.abs(f.amount),0)!==abs)throw new Error('Exact amounts must add up to the total');}
   else if(mode==='adjust'){weights=t.people.map(p=>({id:p.id,weight:1}));personFixed=values.map(v=>({personId:v.person.id,amount:Math.round(v.value*100)*sign}));}
   const id=randomUUID(),date=input.date??new Date().toISOString().slice(0,10);
   const next=await command(input.trip_id,'expense','save',0,{id,title:input.title,date,category:input.category,total,payers:[{familyId:payer.id,amount:total}],
    lines:[{id:randomUUID(),label:input.title,amount:total,splits:[{amount:total,eventId,eventVersion,weights,fixed,personFixed,...(mode?{mode}:{})}]}],notes:input.notes??'',receiptIds:[],status:'posted',version:0});
   const saved=next.trip.expenses.find((e:any)=>e.id===id);
   const owes:Record<string,number>={};for(const a of saved.allocations)owes[t.families.find(f=>f.id===a.familyId)?.name??a.familyId]=(owes[t.families.find(f=>f.id===a.familyId)?.name??a.familyId]??0)+a.amount/100;
   return {id,title:saved.title,total_eur:saved.total/100,paid_by:payer.name,owes_eur:owes,url:link(input.trip_id,'/spend')};
  }));

 server.registerTool('get_balances',{title:'Balances and settle up',description:'What each family is owed (positive) or owes (negative), and the fewest repayments to settle up.',
  inputSchema:{trip_id:z.string()}},
  ({trip_id})=>guard(async()=>{const [view,result]=await Promise.all([trip(trip_id),api('GET',`/api/v1/trips/${encodeURIComponent(trip_id)}/settlement`)]);const name=(id:string)=>view.trip.families.find(f=>f.id===id)?.name??id;
   return {balances_eur:Object.fromEntries(Object.entries(result.balances as Record<string,number>).map(([id,v])=>[name(id),v/100])),transfers:(result.transfers as {from:string;to:string;amount:number}[]).map(x=>({from:name(x.from),to:name(x.to),amount_eur:x.amount/100})),optimal:result.optimal};}));

 server.registerTool('invite_member',{title:'Invite someone',description:'Lets someone sign in to the trip with their email (organizers only).',
  inputSchema:{trip_id:z.string(),email:z.string().email(),role:z.enum(['member','organizer']).default('member')}},
  ({trip_id,email,role})=>guard(async()=>api('POST',`/api/v1/trips/${encodeURIComponent(trip_id)}/invites`,{email,role})));
}

/** Registers POST /mcp (stateless Streamable HTTP; one server per request, bound to the caller's token). */
export function registerMcp(app:FastifyInstance){
 app.post('/mcp',{config:{rateLimit:{max:240,timeWindow:'1 minute'}}},async(request,reply)=>{
  const authorization=request.headers.authorization;
  if(typeof authorization!=='string'||!/^Bearer\s+sfp_/i.test(authorization)){reply.header('WWW-Authenticate','Bearer').status(401);return {error:'Use a personal access token: Authorization: Bearer sfp_…'};}
  const check=await app.inject({method:'GET',url:'/api/v1/me',headers:{authorization}});
  if(check.statusCode!==200||!check.json()){reply.header('WWW-Authenticate','Bearer error="invalid_token"').status(401);return {error:'Invalid or revoked access token'};}
  const host=request.headers['x-forwarded-host']??request.headers.host,proto=request.headers['x-forwarded-proto']??request.protocol;
  const api:Api=async(method,url,body)=>{
   const res=await app.inject({method,url,headers:{authorization,...(body!==undefined?{'content-type':'application/json'}:{})},payload:body===undefined?undefined:JSON.stringify(body)});
   const data=res.body?JSON.parse(res.body):null;
   if(res.statusCode>=400)throw new Error(data?.error??`Request failed (${res.statusCode})`);
   return data;
  };
  const server=new McpServer({name:'splitfairy',version:'1.0.0'},{instructions:'Splitfairy: shared trips, plans and fair expense splitting between families. Start with list_trips, then get_trip for ids. Confirm with the user before deleting or voiding anything.'});
  tools(server,api,`${proto}://${host}`);
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  reply.hijack();
  reply.raw.on('close',()=>{void transport.close();void server.close();});
  await server.connect(transport);
  await transport.handleRequest(request.raw,reply.raw,request.body);
 });
 // Stateless: no server-sent stream or session to delete.
 const notAllowed=async(_request:unknown,reply:any)=>{reply.header('Allow','POST').status(405);return {error:'Use POST'};};
 app.get('/mcp',notAllowed);app.delete('/mcp',notAllowed);
}
