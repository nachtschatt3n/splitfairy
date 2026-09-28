import Fastify,{LogController,type FastifyInstance} from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import {createHash,createHmac,randomBytes,randomInt,randomUUID,timingSafeEqual} from 'node:crypto';
import {join} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {z,ZodError} from 'zod';
import {Store,AccessError,ConflictError,InputError} from './store.js';
import {balances,settle} from '../../../packages/domain/src/accounting.js';
import {commandSchema,type User,type Receipt} from '../../../packages/domain/src/model.js';
import {processReceipt,claimReceipt,resetInterruptedReceipts} from './receipt.js';

const sha=(input:string)=>createHash('sha256').update(input).digest('hex');
const emailSchema=z.email().transform(v=>v.toLowerCase());
const inviteSchema=z.object({email:emailSchema,role:z.enum(['organizer','member']).default('member')});
const codeSchema=z.object({email:emailSchema,code:z.string().regex(/^\d{6}$/),name:z.string().trim().min(1).max(80)});
export type Mail=(to:string,subject:string,body:string)=>Promise<void>;
export type Config={store:Store;adminEmail:string;secret:string;sendMail:Mail;dataDir:string;startWorker?:boolean;secureCookies?:boolean;ollamaUrl?:string;ollamaModel?:string;logLevel?:string;/** Multiplies the per-IP sign-in limits; only the browser test server raises it. */authRateLimitFactor?:number};
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
 app.addHook('onRequest',async(request,reply)=>{
  if(!['POST','PUT','PATCH','DELETE'].includes(request.method))return;
  const origin=request.headers.origin;
  if(origin){try{if(new URL(origin).host!==request.headers.host){reply.status(403).send({error:'Cross-origin write denied'});}}catch{reply.status(403).send({error:'Invalid origin'});}}
 });
 function auth(request:any):User{
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
 app.get('/api/v1/me',async(request)=>{try{return auth(request);}catch{return null;}});
 app.post('/api/v1/auth/request',{config:{rateLimit:{max:5*(config.authRateLimitFactor??1),timeWindow:'15 minutes'}}},async(request)=>{
  const {email}=z.object({email:emailSchema}).parse(request.body);
  // Same response whether or not the address may sign in, and whether or not the budget is spent.
  if(config.store.canLogin(email,config.adminEmail)&&config.store.authBudget(email,'request')){
   const code=String(randomInt(0,1_000_000)).padStart(6,'0');
   config.store.issueCode(email,codeHash(config.secret,email,code),Date.now()+10*60_000);
   try{await config.sendMail(email,'Your Splitfairy sign-in code',`Your Splitfairy code is ${code}. It expires in 10 minutes.`);}
   catch(error){request.log.error({err:error},'sign-in email failed');throw Object.assign(new Error('The sign-in email could not be sent. Please try again later.'),{statusCode:502});}
  }
  return {ok:true};
 });
 app.post('/api/v1/auth/verify',{config:{rateLimit:{max:10*(config.authRateLimitFactor??1),timeWindow:'15 minutes'}}},async(request,reply)=>{
  const input=codeSchema.parse(request.body);
  const row=config.store.db.prepare('SELECT hash,expires,attempts FROM codes WHERE email=?').get(input.email) as {hash:string;expires:number;attempts:number}|undefined;
  if(!row||row.expires<Date.now()||row.attempts>=5||config.store.authLocked(input.email)){reply.status(401);return {error:'Invalid or expired code'};}
  config.store.db.prepare('UPDATE codes SET attempts=attempts+1 WHERE email=?').run(input.email);
  const supplied=Buffer.from(codeHash(config.secret,input.email,input.code),'hex'),expected=Buffer.from(row.hash,'hex');
  if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied)){config.store.authBudget(input.email,'failure');reply.status(401);return {error:'Invalid or expired code'};}
  config.store.db.prepare('DELETE FROM codes WHERE email=?').run(input.email);
  let user=config.store.userByEmail(input.email);
  if(!user){user={id:randomUUID(),email:input.email,name:input.name,admin:input.email===config.adminEmail.toLowerCase()};config.store.addUser(user);}
  config.store.promoteInvites(input.email);
  const token=randomBytes(32).toString('base64url');
  config.store.db.prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)').run(sha(token),user.id,Date.now()+30*86400_000);
  reply.setCookie('splitfairy_session',token,{httpOnly:true,sameSite:'strict',secure:config.secureCookies??false,path:'/',maxAge:30*86400});
  return user;
 });
 app.post('/api/v1/auth/logout',async(request,reply)=>{const token=request.cookies.splitfairy_session;if(token)config.store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(token));reply.clearCookie('splitfairy_session',{path:'/'});return {ok:true};});
 app.get('/api/v1/trips',async(request)=>config.store.listTrips(auth(request)).map(t=>({id:t.id,name:t.name,start:t.start,end:t.end,archived:t.archived})));
 app.post('/api/v1/trips',async(request,reply)=>{const body=z.object({name:z.string().trim().min(1).max(160),start:z.iso.date(),end:z.iso.date()}).parse(request.body);const trip=config.store.createTrip(auth(request),body.name,body.start,body.end);reply.status(201);return trip;});
 app.get('/api/v1/trips/:tripId',async(request)=>{const user=auth(request),id=(request.params as any).tripId;return {trip:config.store.getTrip(user,id),role:config.store.role(user,id),members:config.store.members(user,id)};});
 app.post('/api/v1/trips/:tripId/invites',async(request)=>{const user=auth(request),id=(request.params as any).tripId,body=inviteSchema.parse(request.body);config.store.addMember(user,id,body.email,body.role);await config.sendMail(body.email,`Join ${config.store.getTrip(user,id).name} on Splitfairy`,`You've been invited to a vacation on Splitfairy. Open the app and sign in using ${body.email}.`);return {ok:true};});
 app.post('/api/v1/trips/:tripId/commands',async(request)=>{const user=auth(request),id=(request.params as any).tripId,command=commandSchema.parse(request.body);return {trip:config.store.mutate(user,id,command),role:config.store.role(user,id)};});
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
 app.post('/api/v1/trips/:tripId/receipts/:receiptId/:action',async(request)=>{
  const user=auth(request),{tripId,receiptId,action}=request.params as {tripId:string;receiptId:string;action:string};
  if(action!=='retry'&&action!=='dismiss')throw Object.assign(new Error('Not found'),{statusCode:404});
  return {trip:config.store.updateReceipt(user,tripId,receiptId,action),role:config.store.role(user,tripId)};
 });
 app.get('/api/v1/trips/:tripId/receipts/:receiptId/image',async(request,reply)=>{
  const user=auth(request),{tripId,receiptId}=request.params as any,trip=config.store.getTrip(user,tripId);
  if(!trip.receipts.some(r=>r.id===receiptId))throw new AccessError();
  const image=await readFile(join(config.dataDir,'receipts',tripId,`${receiptId}.jpg`));reply.header('Content-Type','image/jpeg').header('Cache-Control','private, max-age=3600');return reply.send(image);
 });
 if(config.startWorker!==false){resetInterruptedReceipts(config.store);let working=false;const timer=setInterval(async()=>{if(working)return;working=true;try{const job=claimReceipt(config.store);if(job)await processReceipt(config.store,config.dataDir,config.ollamaUrl??'http://192.168.30.111:11434',config.ollamaModel??'gemma4:26b-mlx',job);}catch(error){app.log.error(error);}finally{working=false;}},5000);timer.unref();app.addHook('onClose',async()=>clearInterval(timer));}
 return app;
}
