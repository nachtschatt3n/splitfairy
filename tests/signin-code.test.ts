import {it,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Store} from '../apps/server/src/store.js';
import {createApp} from '../apps/server/src/app.js';
it('operator code lets an invited address sign in without email, and refuses strangers',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'sf-code-'));const env={...process.env,DATA_DIR:dir,AUTH_SECRET:'s'.repeat(40),ADMIN_EMAIL:'Admin@Example.com'};
 const run=(email:string)=>execFileSync(process.execPath,['--import','tsx','scripts/signin-code.ts',email],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const out=run('admin@example.com');const code=out.match(/\b\d{6}\b/)![0];
 expect(()=>run('stranger@example.com')).toThrow();
 const store=new Store(new DatabaseSync(join(dir,'splitfairy.sqlite')));
 const app=await createApp({store,adminEmail:'Admin@Example.com',secret:env.AUTH_SECRET,sendMail:async()=>{},dataDir:dir,startWorker:false});
 const res=await app.inject({method:'POST',url:'/api/v1/auth/verify',payload:{email:'admin@example.com',code,name:'Mathias'}});
 expect(res.statusCode).toBe(200);expect(res.json()).toMatchObject({email:'admin@example.com',admin:true});
});
