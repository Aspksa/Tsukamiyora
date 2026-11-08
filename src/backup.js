import { backup, DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, renameSync } from 'node:fs';
import { join } from 'node:path';
const root=process.cwd();
export async function backupDatabase(){
 const source=join(root,'data','tsukamiyora.sqlite');
 if(!existsSync(source)) return 'skipped: no database yet';
 const folder=join(root,'data','backups');
 mkdirSync(folder,{recursive:true});
 const stamp=new Date().toISOString().replace(/[:.]/g,'-');
 const target=join(folder,`tsukamiyora-${stamp}.sqlite`);
 const tmp=target+'.partial';
 try {
  const db = new DatabaseSync(source);
  try { await backup(db,tmp); } finally { db.close(); }
  const check=new DatabaseSync(tmp);
  try { const integrity=check.prepare('PRAGMA integrity_check').get(); if(Object.values(integrity)[0]!=='ok')throw Error('Backup integrity check failed'); }
  finally { check.close(); }
  renameSync(tmp,target);
 } catch(e) { if(existsSync(tmp))unlinkSync(tmp); throw e; }
 const files=readdirSync(folder).filter(n=>/^tsukamiyora-.*\.sqlite$/.test(n)).sort().reverse();
 for(const old of files.slice(10)) unlinkSync(join(folder,old));
 return target;
}
if(process.argv.includes('--run-backup')){
 backupDatabase().then(console.log).catch(e=>{console.error(e);process.exitCode=1;});
}
