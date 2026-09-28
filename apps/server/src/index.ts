import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,existsSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {join,resolve} from 'node:path';
import nodemailer from 'nodemailer';
import fastifyStatic from '@fastify/static';
import {Store} from './store.js';
import {createApp} from './app.js';
if(!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length<32 || !process.env.ADMIN_EMAIL)throw new Error('AUTH_SECRET (32+ characters) and ADMIN_EMAIL are required');
const dataDir=resolve(process.env.DATA_DIR??'data');mkdirSync(dataDir,{recursive:true});
const db=new DatabaseSync(join(dataDir,'splitfairy.sqlite'));
const store=new Store(db);
store.prune();
const smtpHost=process.env.SMTP_HOST;
const mailCaptureDir=!smtpHost&&process.env.MAIL_CAPTURE_DIR?resolve(process.env.MAIL_CAPTURE_DIR):null;
const transport=smtpHost?nodemailer.createTransport({host:smtpHost,port:Number(process.env.SMTP_PORT??587),secure:process.env.SMTP_SECURE==='true',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined}):null;
const app=await createApp({store,dataDir,adminEmail:process.env.ADMIN_EMAIL,secret:process.env.AUTH_SECRET,secureCookies:process.env.NODE_ENV==='production',ollamaUrl:process.env.OLLAMA_URL,ollamaModel:process.env.OLLAMA_MODEL,logLevel:process.env.LOG_LEVEL??'info',authRateLimitFactor:Math.max(1,Number(process.env.AUTH_RATE_LIMIT_FACTOR??1)||1),sendMail:async(to,subject,body)=>{
 // Tests and local development without SMTP can capture mail as files; production always has SMTP_HOST.
 if(!transport&&mailCaptureDir){mkdirSync(mailCaptureDir,{recursive:true});writeFileSync(join(mailCaptureDir,`${Date.now()}-${Math.random().toString(36).slice(2)}.json`),JSON.stringify({to,subject,text:body,at:new Date().toISOString()}));return;}
 if(!transport)throw new Error('SMTP is not configured');const info=await transport.sendMail({from:process.env.SMTP_FROM,to,subject,text:body});app.log.info({to:to.replace(/^(.{2}).*(@.*)$/,'$1***$2'),subject,messageId:info.messageId,response:info.response},'email handed to SMTP server');}});
const publicDir=resolve('dist/web');
if(existsSync(publicDir)){await app.register(fastifyStatic,{root:publicDir,prefix:'/'});app.setNotFoundHandler((request,reply)=>{if(request.url.startsWith('/api/'))return reply.status(404).send({error:'Not found'});return reply.sendFile('index.html');});}
await app.listen({host:'0.0.0.0',port:Number(process.env.PORT??3000)});
app.log.info({dataDir,model:process.env.OLLAMA_MODEL},'Splitfairy started');
let lastBackupDate='';
const backupTimer=setInterval(()=>{const now=new Date();const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',hourCycle:'h23'}).format(now));if(hour!==3||day===lastBackupDate)return;lastBackupDate=day;store.prune();const child=spawn(process.execPath,['dist/server/scripts/backup.js'],{stdio:'inherit',env:process.env});child.on('error',error=>app.log.error({err:error},'backup failed to start'));child.on('exit',code=>{if(code)app.log.error({code},'backup failed');});},60_000);backupTimer.unref();
let stopping=false;
async function shutdown(signal:string){
 if(stopping)return;stopping=true;
 app.log.info({signal},'shutting down');
 clearInterval(backupTimer);
 try{await app.close();}finally{db.close();process.exit(0);}
}
process.on('SIGTERM',()=>void shutdown('SIGTERM'));
process.on('SIGINT',()=>void shutdown('SIGINT'));
