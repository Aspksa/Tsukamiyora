import { DatabaseSync } from 'node:sqlite';
import { existsSync, copyFileSync, mkdirSync, renameSync, unlinkSync, realpathSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, basename } from 'node:path';

export function restoreDatabase(backupPath,{root=process.cwd()}={}) {
 const folder=resolve(root,'data','backups');
 const source=resolve(backupPath);
 const rel=relative(folder,source);
 if(!rel||rel==='..'||rel.startsWith('..'+requireSeparator())||isAbsolute(rel))throw Error('Backup must be inside data/backups');
 if(!existsSync(source))throw Error('Backup missing');
 if(!realpathSync(source).startsWith(realpathSync(folder)+requireSeparator()))throw Error('Backup symlink escapes backups directory');
 const data=join(root,'data');
 const dest=join(data,'tsukamiyora.sqlite');
 if(existsSync(dest+'-wal')||existsSync(dest+'-shm'))throw Error('WAL/SHM present: stop all database users before restoring');
 function check(path) {
  const db=new DatabaseSync(path,{readOnly:true});
  try{if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('SQLite integrity check failed');}
  finally{db.close();}
 }
 check(source);
 mkdirSync(data,{recursive:true});
 const staged=dest+'.restore-'+process.pid+'.tmp';
 try{
  copyFileSync(source,staged);
  check(staged);
  if(existsSync(dest))copyFileSync(dest,join(folder,'pre-restore-'+Date.now()+'.sqlite'));
  renameSync(staged,dest);
 }finally{if(existsSync(staged))unlinkSync(staged);}
 return dest;
}
function requireSeparator(){return process.platform==='win32'?'\\':'/';}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/,'')){
 try{if(!process.argv[2])throw Error('Usage: node scripts/restore.js <backup.sqlite> (stop app first)');console.log('Restored to '+restoreDatabase(process.argv[2]));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
