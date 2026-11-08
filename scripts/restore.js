import { DatabaseSync } from 'node:sqlite';
import { existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
const root=process.cwd();
const candidate=process.argv[2];
if(!candidate){console.error('Usage: node scripts/restore.js <backup.sqlite> (stop Tsukamiyora first)');process.exit(2);}
const folder=resolve(root,'data','backups');
const source=resolve(candidate);
if(!source.startsWith(folder+'\\') && !source.startsWith(folder+'/')){console.error('Backup must be inside data/backups');process.exit(2);}
if(!existsSync(source)){console.error('Backup missing');process.exit(2);}
const dest=join(root,'data','tsukamiyora.sqlite');
function check(path){const db=new DatabaseSync(path);try{const value=Object.values(db.prepare('PRAGMA integrity_check').get())[0];if(value!=='ok')throw Error('SQLite integrity check failed');}finally{db.close();}}
try {
 check(source);
 mkdirSync(join(root,'data'),{recursive:true});
 if(existsSync(dest)){
  const db=new DatabaseSync(dest);
  try{db.exec('PRAGMA wal_checkpoint(TRUNCATE)');}finally{db.close();}
  copyFileSync(dest,join(folder,'pre-restore-'+Date.now()+'.sqlite'));
 }
 copyFileSync(source,dest);
 check(dest);
 console.log('Restored '+basename(source)+'. Restart Tsukamiyora.');
} catch(error){console.error('Restore failed:',error.message);process.exitCode=1;}
