import {backup,DatabaseSync} from 'node:sqlite';
import {mkdir,cp,readdir,rm,writeFile,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const dataDir=resolve(process.env.DATA_DIR??'data');
const backupRoot=resolve(process.env.BACKUP_DIR??join(dataDir,'backups'));
await mkdir(backupRoot,{recursive:true});
const date=new Date().toISOString().slice(0,10),destination=join(backupRoot,date);
await mkdir(destination,{recursive:true});
const db=new DatabaseSync(join(dataDir,'splitfairy.sqlite'));
await backup(db,join(destination,'splitfairy.sqlite'));db.close();
try{await access(join(dataDir,'receipts'));await cp(join(dataDir,'receipts'),join(destination,'receipts'),{recursive:true});}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
await writeFile(join(destination,'manifest.json'),JSON.stringify({date,format:1,files:['splitfairy.sqlite','receipts/']},null,2));
const days=(await readdir(backupRoot,{withFileTypes:true})).filter(d=>d.isDirectory()&&/^\d{4}-\d{2}-\d{2}$/.test(d.name)).map(d=>d.name).sort().reverse();
for(const expired of days.slice(7))await rm(join(backupRoot,expired),{recursive:true,force:true});
console.log(`Backup complete: ${destination}`);
