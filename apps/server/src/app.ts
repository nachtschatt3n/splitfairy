import Fastify,{LogController,type FastifyInstance} from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import {createHash,createHmac,randomBytes,randomInt,randomUUID,timingSafeEqual} from 'node:crypto';
import {join} from 'node:path';
import {mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {z,ZodError} from 'zod';
import {Store,AccessError,ConflictError,InputError,visibleTrip} from './store.js';
import {balances,settle} from '../../../packages/domain/src/accounting.js';
import {TRIP_THEMES,commandSchema,type Trip,type User,type Receipt} from '../../../packages/domain/src/model.js';
import {processReceipt,claimReceipt,resetInterruptedReceipts} from './receipt.js';
import {inviteEmail,signInEmail} from './mail.js';
import {registerMcp} from './mcp.js';
import {sendSettleReminders} from './reminders.js';
import {settleStatus} from '../../../packages/domain/src/settle-status.js';

const sha=(input:string)=>createHash('sha256').update(input).digest('hex');
const emailSchema=z.string().trim().pipe(z.email()).transform(v=>v.toLowerCase());
const inviteSchema=z.object({email:emailSchema,role:z.enum(['organizer','member']).default('member')});
const codeSchema=z.object({email:emailSchema,code:z.string().max(40).transform(v=>v.replace(/\D/g,'')).pipe(z.string().regex(/^\d{6}$/)),name:z.string().trim().max(80).optional()});
export type Mail=(to:string,subject:string,text:string,html?:string)=>Promise<void>;
export type Config={/** Default for the admin's sign-up switch (SIGNUP_OPEN); the admin can change it in the app. */signupOpen?:boolean;/** Public address for links in background emails (reminders); falls back to the last address the app was reached at. */publicUrl?:string;/** Time zone for sending reminders in the daytime. */timeZone?:string;/** Nominatim-compatible search for restaurant addresses; empty turns lookup off. */placesUrl?:string;store:Store;adminEmail:string;secret:string;sendMail:Mail;dataDir:string;startWorker?:boolean;secureCookies?:boolean;ollamaUrl?:string;ollamaModel?:string;logLevel?:string;/** Multiplies the per-IP sign-in limits; only the browser test server raises it. */authRateLimitFactor?:number};
export function codeHash(secret:string,email:string,code:string){return createHmac('sha256',secret).update(`${email}:${code}`).digest('hex');}
export async function createApp(config:Config):Promise<FastifyInstance>{
 const app=Fastify({logger:config.logLevel?{level:config.logLevel}:false,logController:new LogController({disableRequestLogging:true}),bodyLimit:16_000_000,trustProxy:true});
 await app.register(cookie);
 // Cloudflare sets CF-Connecting-IP itself; X-Forwarded-For's first hop can be supplied by the client.
 await app.register(rateLimit,{global:false,keyGenerator:request=>String(request.headers['cf-connecting-ip']??request.ip)});
 app.setErrorHandler((error,request,reply)=>{
  const status=error instanceof ZodError||error instanceof InputError?400:error instanceof ConflictError?409:error instanceof AccessError?403:(error as any).statusCode??500;
  if(status>=500)request.log.error(error);
  reply.status(status).send({error:status>=500?'Internal server error':error instanceof Error?error.message:'Invalid request'});
 });
 let seenOrigin:string|null=null;
 app.addHook('onRequest',async(request,reply)=>{
  if(request.url.startsWith('/api/')&&request.headers.host)seenOrigin=`${request.headers['x-forwarded-proto']??request.protocol}://${request.headers['x-forwarded-host']??request.headers.host}`;
  if(!['POST','PUT','PATCH','DELETE'].includes(request.method))return;
  const origin=request.headers.origin;
  if(origin){try{if(new URL(origin).host!==request.headers.host){reply.status(403).send({error:'Cross-origin write denied'});}}catch{reply.status(403).send({error:'Invalid origin'});}}
 });
 /** Who is calling: a personal access token (Authorization: Bearer sfp_…) or the app's session cookie. */
 function auth(request:any):User{
  const header=request.headers?.authorization;
  if(typeof header==='string'&&/^Bearer\s+/i.test(header)){
   const user=config.store.userByAccessToken(header.replace(/^Bearer\s+/i,'').trim());
   if(!user)throw Object.assign(new Error('Invalid or revoked access token'),{statusCode:401});
   return user;
  }
  return sessionUser(request);
 }
 /** Only the signed-in app (never a token) may manage tokens, so a leaked token cannot mint more. */
 function sessionUser(request:any):User{
  const token=request.cookies?.splitfairy_session;
  if(!token)throw Object.assign(new Error('Sign in required'),{statusCode:401});
  const row=config.store.db.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires>?').get(sha(token),Date.now()) as {user_id:string}|undefined;
  const user=row&&config.store.userById(row.user_id);
  if(!user)throw Object.assign(new Error('Sign in required'),{statusCode:401});
  return user;
 }
 app.addHook('onSend',async(request,reply,payload)=>{
  reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','same-origin').header('X-Frame-Options','DENY').header('Permissions-Policy','camera=(self), geolocation=(), microphone=()');
  if(request.url.startsWith('/api/'))reply.header('Cache-Control',reply.getHeader('Cache-Control')??'no-store');
  else reply.header('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  return payload;
 });
 app.get('/healthz',async()=>({ok:true}));
 app.get('/readyz',async()=>{config.store.db.prepare('SELECT 1').get();return {ok:true};});
 // Address lookup for restaurants, via OpenStreetMap Nominatim (one request per search, as its usage policy asks).
 app.get('/api/v1/places',{config:{rateLimit:{max:30,timeWindow:'1 minute'}}},async(request,reply)=>{
  auth(request);const q=z.string().trim().min(3).max(200).parse((request.query as {q?:string}).q);
  if(!config.placesUrl){reply.status(503);return {error:'Address lookup is not available'};}
  const url=new URL(config.placesUrl);url.searchParams.set('q',q);url.searchParams.set('format','jsonv2');url.searchParams.set('limit','5');url.searchParams.set('addressdetails','0');
  try{
   const response=await fetch(url,{headers:{'User-Agent':'Splitfairy (self-hosted trip planner)','Accept-Language':'en'},signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw new Error(String(response.status));
   const rows=z.array(z.object({name:z.string().optional().default(''),display_name:z.string(),lat:z.string().optional(),lon:z.string().optional()}).loose()).parse(await response.json());
   // Nominatim repeats the place's name at the start of the address; keep the address itself.
   return rows.slice(0,5).map(r=>{const name=r.name||r.display_name.split(',')[0];const address=r.display_name.startsWith(`${name}, `)?r.display_name.slice(name.length+2):r.display_name;return {name,address};});
  }catch{reply.status(502);return {error:'Address lookup failed; type the address instead'};}
 });
 app.get('/api/v1/me/tokens',async request=>config.store.listAccessTokens(sessionUser(request)));
 app.post('/api/v1/me/tokens',{config:{rateLimit:{max:20,timeWindow:'1 hour'}}},async(request,reply)=>{
  const user=sessionUser(request),{name}=z.object({name:z.string().trim().min(1).max(80)}).parse(request.body);
  reply.status(201);return config.store.createAccessToken(user,name);
 });
 app.delete('/api/v1/me/tokens/:id',async request=>{config.store.revokeAccessToken(sessionUser(request),(request.params as {id:string}).id);return {ok:true};});
 const signupOpen=()=>{const v=config.store.setting('signup_open');return v===null?!!config.signupOpen:v==='true';};
 // Public: the sign-in screen says whether new people can sign up.
 app.get('/api/v1/config',async()=>({signupOpen:signupOpen()}));
 app.get('/api/v1/admin/settings',async request=>{if(!sessionUser(request).admin)throw new AccessError();return {signupOpen:signupOpen()};});
 app.put('/api/v1/admin/settings',async request=>{
  if(!sessionUser(request).admin)throw new AccessError();
  const body=z.object({signupOpen:z.boolean()}).parse(request.body);config.store.setSetting('signup_open',String(body.signupOpen));return {signupOpen:signupOpen()};
 });
 app.get('/api/v1/me',async(request)=>{try{return auth(request);}catch{return null;}});
 app.post('/api/v1/auth/request',{config:{rateLimit:{max:5*(config.authRateLimitFactor??1),timeWindow:'15 minutes'}}},async(request)=>{
  const {email}=z.object({email:emailSchema}).parse(request.body);
  // Same response whether or not the address may sign in, and whether or not the budget is spent.
  if(config.store.canLogin(email,config.adminEmail,signupOpen())&&config.store.authBudget(email,'request')){
   const code=String(randomInt(0,1_000_000)).padStart(6,'0');
   // 30 minutes: some mail providers deliver slowly; attempts per code and per hour stay limited.
   config.store.issueCode(email,codeHash(config.secret,email,code),Date.now()+30*60_000);
   const mail=signInEmail(code);
   try{await config.sendMail(email,mail.subject,mail.text,mail.html);}
   catch(error){request.log.error({err:error},'sign-in email failed');throw Object.assign(new Error('The sign-in email could not be sent. Please try again later.'),{statusCode:502});}
  }
  return {ok:true};
 });
 /** Signs someone in: creates the account on first sign-in (named after the address until they choose), then a 30-day session. */
 function startSession(email:string,reply:any,name?:string){
  let user=config.store.userByEmail(email);const isNew=!user;
  if(!user){const local=email.split('@')[0].replace(/[._-]+/g,' ').trim();user={id:randomUUID(),email,name:name||local.replace(/\b\w/g,c=>c.toUpperCase())||'Traveller',admin:email===config.adminEmail.toLowerCase()};config.store.addUser(user);}
  config.store.promoteInvites(email);
  const token=randomBytes(32).toString('base64url');
  config.store.db.prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)').run(sha(token),user.id,Date.now()+30*86400_000);
  reply.setCookie('splitfairy_session',token,{httpOnly:true,sameSite:'strict',secure:config.secureCookies??false,path:'/',maxAge:30*86400});
  return {...user,isNew};
 }
 app.post('/api/v1/auth/verify',{config:{rateLimit:{max:10*(config.authRateLimitFactor??1),timeWindow:'15 minutes'}}},async(request,reply)=>{
  const input=codeSchema.parse(request.body);
  const row=config.store.db.prepare('SELECT hash,expires,attempts FROM codes WHERE email=?').get(input.email) as {hash:string;expires:number;attempts:number}|undefined;
  if(!row||row.expires<Date.now()||row.attempts>=5||config.store.authLocked(input.email)){reply.status(401);return {error:'Invalid or expired code'};}
  config.store.db.prepare('UPDATE codes SET attempts=attempts+1 WHERE email=?').run(input.email);
  const supplied=Buffer.from(codeHash(config.secret,input.email,input.code),'hex'),expected=Buffer.from(row.hash,'hex');
  if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied)){config.store.authBudget(input.email,'failure');reply.status(401);return {error:'Invalid or expired code'};}
  config.store.db.prepare('DELETE FROM codes WHERE email=?').run(input.email);
  return startSession(input.email,reply,input.name);
 });
 // Admin sign-in links: "/login#<token>". The token sits after the "#", so link previews in chat apps never
 // send it to the server; the page asks first and only a POST uses the link up. One link per address, single use.
 const MAGIC_TTL={'1h':3_600_000,'24h':86_400_000,'7d':7*86_400_000} as const;
 app.post('/api/v1/admin/magic-links',{config:{rateLimit:{max:30,timeWindow:'1 hour'}}},async(request,reply)=>{
  const admin=sessionUser(request);if(!admin.admin)throw new AccessError();
  const body=z.object({email:emailSchema,valid:z.enum(['1h','24h','7d']).default('24h')}).parse(request.body);
  if(!config.store.canLogin(body.email,config.adminEmail,signupOpen()))throw new InputError('This address cannot sign in: add the person to a trip with this email, or open sign-up');
  const token=randomBytes(32).toString('base64url'),expires=Date.now()+MAGIC_TTL[body.valid];
  config.store.db.prepare('INSERT INTO magic_links(email,token_hash,expires,created_by) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET token_hash=excluded.token_hash,expires=excluded.expires,created_by=excluded.created_by').run(body.email,sha(token),expires,admin.id);
  request.log.info({email:body.email,by:admin.email},'sign-in link created');
  const origin=config.publicUrl??`${request.headers['x-forwarded-proto']??request.protocol}://${request.headers['x-forwarded-host']??request.headers.host}`;
  reply.status(201);return {url:`${origin.replace(/\/$/,'')}/login#${token}`,email:body.email,expires:new Date(expires).toISOString()};
 });
 const magicRow=(token:string)=>config.store.db.prepare('SELECT email,expires FROM magic_links WHERE token_hash=?').get(sha(token)) as {email:string;expires:number}|undefined;
 const magicToken=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)});
 // Who the link is for, without using it up (the page shows "Continue as …").
 app.post('/api/v1/auth/magic/peek',{config:{rateLimit:{max:30*(config.authRateLimitFactor??1),timeWindow:'15 minutes'}}},async(request,reply)=>{
  const {token}=magicToken.parse(request.body),row=magicRow(token);
  if(!row||row.expires<Date.now()){reply.status(401);return {error:'This sign-in link has expired or was already used'};}
  return {email:row.email};
 });
 app.post('/api/v1/auth/magic',{config:{rateLimit:{max:30*(config.authRateLimitFactor??1),timeWindow:'15 minutes'}}},async(request,reply)=>{
  const {token}=magicToken.parse(request.body),row=magicRow(token);
  if(!row||row.expires<Date.now()){reply.status(401);return {error:'This sign-in link has expired or was already used'};}
  config.store.db.prepare('DELETE FROM magic_links WHERE email=?').run(row.email);
  // Access may have changed since the link was made.
  if(!config.store.canLogin(row.email,config.adminEmail,signupOpen())){reply.status(401);return {error:'This address can no longer sign in'};}
  return startSession(row.email,reply);
 });
 app.put('/api/v1/me',async(request)=>{const user=auth(request),{name}=z.object({name:z.string().trim().min(1).max(80)}).parse(request.body);config.store.renameUser(user.id,name);return config.store.userById(user.id);});
 app.post('/api/v1/auth/logout',async(request,reply)=>{const token=request.cookies.splitfairy_session;if(token)config.store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(token));reply.clearCookie('splitfairy_session',{path:'/'});return {ok:true};});
 app.get('/api/v1/trips',async(request)=>config.store.listTrips(auth(request)).map(t=>{const status=settleStatus(t,new Date().toISOString().slice(0,10));return {id:t.id,name:t.name,start:t.start,end:t.end,archived:t.archived,theme:t.theme??'classic',cover:t.photos?.[0]?.id??null,settle:{open:status.open,overdueDays:status.overdueDays}};}));
 app.post('/api/v1/trips',async(request,reply)=>{const body=z.object({name:z.string().trim().min(1).max(160),start:z.iso.date(),end:z.iso.date(),theme:z.enum(TRIP_THEMES).default('classic')}).parse(request.body);const trip=config.store.createTrip(auth(request),body.name,body.start,body.end,body.theme,signupOpen());reply.status(201);return trip;});
 app.get('/api/v1/trips/:tripId',async(request)=>{const user=auth(request),id=(request.params as any).tripId;return {trip:visibleTrip(config.store.getTrip(user,id),user),role:config.store.role(user,id),members:config.store.members(user,id)};});
 app.post('/api/v1/trips/:tripId/invites',async(request)=>{const user=auth(request),id=(request.params as any).tripId,body=inviteSchema.parse(request.body);config.store.addMember(user,id,body.email,body.role);const mail=inviteEmail({inviter:user.name,tripName:config.store.getTrip(user,id).name,url:siteUrl(request)});await config.sendMail(body.email,mail.subject,mail.text,mail.html);return {ok:true};});
 const siteUrl=(request:{protocol:string;host:string})=>`${request.protocol}://${request.host}`;
 app.post('/api/v1/trips/:tripId/commands',async(request)=>{
  const user=auth(request),id=(request.params as any).tripId,command=commandSchema.parse(request.body);
  const known=new Set(command.entity==='person'?config.store.members(user,id).map(m=>m.email):[]);
  const trip=config.store.mutate(user,id,command);
  if((command.entity==='stay'||command.entity==='event')&&command.action==='delete')await prunePhotoFiles(id,trip);
  if(command.entity==='stay'&&command.action==='delete')await pruneFiles(id,trip);
  // A person saved with a new email is invited to sign in; the mail is best effort because the change is already saved.
  const person=command.entity==='person'&&command.action==='save'?trip.people.find(p=>p.id===(command.value as any)?.id):undefined;
  if(person?.email&&!known.has(person.email)){
   config.store.addMember(user,id,person.email,'member');
   const mail=inviteEmail({inviter:user.name,tripName:trip.name,url:siteUrl(request),name:person.name});
   try{await config.sendMail(person.email,mail.subject,mail.text,mail.html);}
   catch(error){request.log.error({err:error},'invitation email failed');}
  }
  return {trip:visibleTrip(trip,user),role:config.store.role(user,id),members:config.store.members(user,id)};
 });
 app.get('/api/v1/trips/:tripId/settlement',async(request)=>{
  const trip=config.store.getTrip(auth(request),(request.params as any).tripId);
  const out=balances(trip.families.map(f=>f.id),trip.expenses.filter(e=>e.status==='posted'),trip.payments);
  return {balances:out,...settle(out)};
 });
 app.post('/api/v1/trips/:tripId/receipts',async(request,reply)=>{
  const user=auth(request),tripId=(request.params as any).tripId;if(config.store.getTrip(user,tripId).archived)throw new InputError('Trip is archived');
  const body=z.object({image:z.string().max(15_000_000),uploadId:z.uuid().optional()}).parse(request.body);
  if(body.uploadId){const prior=config.store.getTrip(user,tripId).receipts.find(r=>r.id===body.uploadId);if(prior)return prior;}
  const source=Buffer.from(body.image,'base64');if(source.length<100||source.length>10_000_000)throw new InputError('Invalid image size');
  let image:Buffer;try{const format=(await sharp(source).metadata()).format;if(!['jpeg','png','webp','heif'].includes(format??''))throw new Error('format');image=await sharp(source,{limitInputPixels:30_000_000}).rotate().resize({width:1800,withoutEnlargement:true}).jpeg({quality:83}).toBuffer();}catch{throw new InputError('Invalid photo');}
  const id=body.uploadId??randomUUID(),folder=join(config.dataDir,'receipts',tripId);await mkdir(folder,{recursive:true});try{await writeFile(join(folder,`${id}.jpg`),image,{flag:'wx',mode:0o600});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
  const trip=config.store.getTrip(user,tripId);const prior=trip.receipts.find(r=>r.id===id);if(prior)return prior;
  const receipt:Receipt={id,status:'queued',items:[],total:null,merchant:'',date:'',error:null,version:1,authorId:user.id};trip.receipts.push(receipt);trip.version++;
  config.store.db.prepare('UPDATE trips SET data=? WHERE id=?').run(JSON.stringify(trip),tripId);reply.status(201);return receipt;
 });
 const photoFolder=(tripId:string)=>join(config.dataDir,'photos',tripId);
 /** Removes image files whose photo is no longer on the trip (after a stay was deleted). */
 const prunePhotoFiles=async(tripId:string,trip:Trip)=>{
  const keep=new Set((trip.photos??[]).map(p=>p.id));
  const files=await readdir(photoFolder(tripId)).catch(()=>[] as string[]);
  await Promise.all(files.filter(f=>!keep.has(f.replace(/(-thumb)?\.jpg$/,''))).map(f=>rm(join(photoFolder(tripId),f),{force:true})));
 };
 app.post('/api/v1/trips/:tripId/photos',async(request,reply)=>{
  const user=auth(request),tripId=(request.params as any).tripId;
  // A photo belongs to a stay or to a plan (for example the dish of a dinner).
  const body=z.object({image:z.string().max(15_000_000),stayId:z.string().min(1).max(80).optional(),eventId:z.string().min(1).max(80).optional(),uploadId:z.uuid().optional()}).refine(b=>!!b.stayId!==!!b.eventId,{message:'Choose a stay or a plan'}).parse(request.body);
  const trip=config.store.getTrip(user,tripId);if(trip.archived)throw new InputError('Trip is archived');
  if(body.stayId&&!(trip.stays??[]).some(s=>s.id===body.stayId))throw new InputError('Stay not found');
  if(body.eventId&&!trip.events.some(e=>e.id===body.eventId))throw new InputError('Plan not found');
  if(body.uploadId){const prior=(trip.photos??[]).find(p=>p.id===body.uploadId);if(prior)return prior;}
  const source=Buffer.from(body.image,'base64');if(source.length<100||source.length>10_000_000)throw new InputError('Invalid image size');
  let image:Buffer,thumb:Buffer;
  try{
   const format=(await sharp(source).metadata()).format;if(!['jpeg','png','webp','heif'].includes(format??''))throw new Error('format');
   const upright=sharp(source,{limitInputPixels:40_000_000}).rotate();
   image=await upright.clone().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:82,mozjpeg:true}).toBuffer();
   thumb=await upright.clone().resize({width:480,height:360,fit:'cover'}).jpeg({quality:76,mozjpeg:true}).toBuffer();
  }catch{throw new InputError('Invalid photo');}
  const id=body.uploadId??randomUUID();await mkdir(photoFolder(tripId),{recursive:true});
  await writeFile(join(photoFolder(tripId),`${id}.jpg`),image,{mode:0o600});await writeFile(join(photoFolder(tripId),`${id}-thumb.jpg`),thumb,{mode:0o600});
  try{const photo=config.store.addPhoto(user,tripId,id,{stayId:body.stayId,eventId:body.eventId});reply.status(201);return photo;}
  catch(error){await prunePhotoFiles(tripId,config.store.getTrip(user,tripId));throw error;}
 });
 app.get('/api/v1/trips/:tripId/photos/:photoId',async(request,reply)=>{
  const user=auth(request),{tripId,photoId}=request.params as {tripId:string;photoId:string},trip=config.store.getTrip(user,tripId);
  if(!(trip.photos??[]).some(p=>p.id===photoId))throw new AccessError();
  const size=(request.query as {size?:string}).size==='thumb'?'-thumb':'';
  const image=await readFile(join(photoFolder(tripId),`${photoId}${size}.jpg`));
  // Photo IDs are never reused, so the image can be cached for long.
  reply.header('Content-Type','image/jpeg').header('Cache-Control','private, max-age=2592000, immutable');return reply.send(image);
 });
 app.delete('/api/v1/trips/:tripId/photos/:photoId',async(request)=>{
  const user=auth(request),{tripId,photoId}=request.params as {tripId:string;photoId:string};
  const trip=config.store.removePhoto(user,tripId,photoId);await prunePhotoFiles(tripId,trip);
  return {trip:visibleTrip(trip,user),role:config.store.role(user,tripId)};
 });
 // Documents on a stay (booking confirmations and the like). The type comes from the file's content, never its name.
 const fileFolder=(tripId:string)=>join(config.dataDir,'files',tripId);
 const sniff=(data:Buffer):string|null=>{
  if(data.subarray(0,5).toString('latin1')==='%PDF-')return 'application/pdf';
  if(data.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return 'image/png';
  if(data[0]===0xff&&data[1]===0xd8&&data[2]===0xff)return 'image/jpeg';
  if(data.subarray(0,4).toString('latin1')==='RIFF'&&data.subarray(8,12).toString('latin1')==='WEBP')return 'image/webp';
  if(!data.includes(0)){try{new TextDecoder('utf-8',{fatal:true}).decode(data);return 'text/plain; charset=utf-8';}catch{/* not text */}}
  return null;
 };
 const pruneFiles=async(tripId:string,trip:Trip)=>{
  const keep=new Set((trip.files??[]).map(f=>f.id));
  const names=await readdir(fileFolder(tripId)).catch(()=>[] as string[]);
  await Promise.all(names.filter(n=>!keep.has(n)).map(n=>rm(join(fileFolder(tripId),n),{force:true})));
 };
 app.post('/api/v1/trips/:tripId/files',async(request,reply)=>{
  const user=auth(request),tripId=(request.params as any).tripId;
  const body=z.object({stayId:z.string().min(1).max(80),name:z.string().min(1).max(200),data:z.string().max(14_000_000)}).parse(request.body);
  const trip=config.store.getTrip(user,tripId);if(trip.archived)throw new InputError('Trip is archived');
  if(!(trip.stays??[]).some(s=>s.id===body.stayId))throw new InputError('Stay not found');
  const data=Buffer.from(body.data,'base64');if(!data.length||data.length>10_000_000)throw new InputError('Files can be up to 10 MB');
  const mime=sniff(data);if(!mime)throw new InputError('Only PDF, image (PNG, JPEG, WebP) and text files');
  const name=body.name.replace(/^.*[\\/]/,'').replace(/[\u0000-\u001f\u007f"]/g,'').trim().slice(0,120)||'file';
  const id=randomUUID();await mkdir(fileFolder(tripId),{recursive:true});await writeFile(join(fileFolder(tripId),id),data,{mode:0o600});
  try{const file=config.store.addFile(user,tripId,{id,stayId:body.stayId,name,mime,size:data.length});reply.status(201);return file;}
  catch(error){await rm(join(fileFolder(tripId),id),{force:true});throw error;}
 });
 app.get('/api/v1/trips/:tripId/files/:fileId',async(request,reply)=>{
  const user=auth(request),{tripId,fileId}=request.params as {tripId:string;fileId:string};
  const file=(config.store.getTrip(user,tripId).files??[]).find(f=>f.id===fileId);if(!file)throw new AccessError();
  const data=await readFile(join(fileFolder(tripId),file.id));
  // Always a download, never rendered inside the app's origin.
  reply.header('Content-Type',file.mime).header('Content-Disposition',`attachment; filename="${file.name.replace(/[^\x20-\x7e]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(file.name)}`).header('Cache-Control','private, max-age=3600');
  return reply.send(data);
 });
 app.delete('/api/v1/trips/:tripId/files/:fileId',async(request)=>{
  const user=auth(request),{tripId,fileId}=request.params as {tripId:string;fileId:string};
  const trip=config.store.removeFile(user,tripId,fileId);await pruneFiles(tripId,trip);
  return {trip:visibleTrip(trip,user),role:config.store.role(user,tripId)};
 });
 app.delete('/api/v1/trips/:tripId',async(request)=>{
  const user=auth(request),id=(request.params as any).tripId;config.store.deleteTrip(user,id);
  await rm(join(config.dataDir,'receipts',id),{recursive:true,force:true});await rm(join(config.dataDir,'photos',id),{recursive:true,force:true});await rm(join(config.dataDir,'files',id),{recursive:true,force:true});return {ok:true};
 });
 const memberParams=(request:any)=>({user:auth(request),id:request.params.tripId as string,email:emailSchema.parse(decodeURIComponent(request.params.email))});
 app.delete('/api/v1/trips/:tripId/members/:email',async(request)=>{const {user,id,email}=memberParams(request);config.store.removeMember(user,id,email);return {members:config.store.members(user,id)};});
 app.put('/api/v1/trips/:tripId/members/:email',async(request)=>{const {user,id,email}=memberParams(request);config.store.setRole(user,id,email,z.object({role:z.enum(['organizer','member'])}).parse(request.body).role);return {members:config.store.members(user,id)};});
 app.post('/api/v1/trips/:tripId/receipts/:receiptId/:action',async(request)=>{
  const user=auth(request),{tripId,receiptId,action}=request.params as {tripId:string;receiptId:string;action:string};
  if(action!=='retry'&&action!=='dismiss')throw Object.assign(new Error('Not found'),{statusCode:404});
  return {trip:visibleTrip(config.store.updateReceipt(user,tripId,receiptId,action),user),role:config.store.role(user,tripId)};
 });
 app.get('/api/v1/trips/:tripId/receipts/:receiptId/image',async(request,reply)=>{
  const user=auth(request),{tripId,receiptId}=request.params as any,trip=config.store.getTrip(user,tripId);
  if(!trip.receipts.some(r=>r.id===receiptId))throw new AccessError();
  const image=await readFile(join(config.dataDir,'receipts',tripId,`${receiptId}.jpg`));reply.header('Content-Type','image/jpeg').header('Cache-Control','private, max-age=3600');return reply.send(image);
 });
 if(config.startWorker!==false){resetInterruptedReceipts(config.store);let working=false;const timer=setInterval(async()=>{if(working)return;working=true;try{const job=claimReceipt(config.store);if(job)await processReceipt(config.store,config.dataDir,config.ollamaUrl??'http://192.168.30.111:11434',config.ollamaModel??'gemma4:26b-mlx',job);}catch(error){app.log.error(error);}finally{working=false;}},5000);timer.unref();app.addHook('onClose',async()=>clearInterval(timer));}
 registerMcp(app);
 // Weekly settle-up reminders after a trip ended: checked every hour (sent in the daytime, once a week per family).
 if(config.startWorker!==false){
  const remind=()=>sendSettleReminders(config.store,config.sendMail,config.publicUrl??seenOrigin,{timeZone:config.timeZone}).then(sent=>{for(const s of sent)app.log.info({trip:s.tripId,family:s.familyId,recipients:s.to.length},'settle reminder sent');}).catch(error=>app.log.error(error,'settle reminders failed'));
  const first=setTimeout(remind,60_000),hourly=setInterval(remind,3_600_000);first.unref();hourly.unref();
  app.addHook('onClose',async()=>{clearTimeout(first);clearInterval(hourly);});
 }
 return app;
}
