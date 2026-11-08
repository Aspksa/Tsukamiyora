import { backup, DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readdirSync, unlinkSync, renameSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
export async function backupDatabase({root=process.cwd(),retention=10}={}){
 if(typeof root!=='string'||!root.trim()||!Number.isInteger(retention)||retention<1||retention>100)throw Error('Invalid backup options');
 const source=join(root,'data','tsukamiyora.sqlite');
 if(!existsSync(source)) return 'skipped: no database yet';
 const folder=join(root,'data','backups');
 mkdirSync(folder,{recursive:true});
 const stamp=new Date().toISOString().replace(/[:.]/g,'-');
 const target=join(folder,`tsukamiyora-${stamp}-${randomUUID().slice(0,8)}.sqlite`);
 const tmp=target+'.partial';
 try {
  const db = new DatabaseSync(source);
  try { await backup(db,tmp); } finally { db.close(); }
  const check=new DatabaseSync(tmp);
  try { const integrity=check.prepare('PRAGMA integrity_check').get(); if(Object.values(integrity)[0]!=='ok')throw Error('Backup integrity check failed'); }
  finally { check.close(); }
  renameSync(tmp,target);
 } catch(e) { if(existsSync(tmp))unlinkSync(tmp); throw e; }
 const files=readdirSync(folder).filter(n=>/^tsukamiyora-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-[0-9a-f]{8})?\.sqlite$/.test(n)).sort().reverse();
 // Retain only snapshots produced by this application; do not delete unrelated files.
 for(const old of files.slice(retention)){
  const path=join(folder,old);
  if(lstatSync(path).isFile())unlinkSync(path);
 }
 return target;
}
if(process.argv.includes('--run-backup')){
 backupDatabase().then(console.log).catch(e=>{console.error(e);process.exitCode=1;});
}
