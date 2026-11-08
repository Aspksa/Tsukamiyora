import {DatabaseSync} from 'node:sqlite';
import {existsSync,statSync} from 'node:fs';
import {basename,join,resolve,sep} from 'node:path';
import {realpathSync} from 'node:fs';
import {verifySnapshotChecksum} from './backup-checksum.js';

// Read-only restore preflight. Never overwrites the active database.
export function checkRestoreCandidate({root=process.cwd(),filename}={}){
 if(typeof root!=='string'||!root.trim()||typeof filename!=='string'||!/^tsukamiyora-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-[0-9a-f]{8})?\.sqlite$/.test(filename)||basename(filename)!==filename)
  throw Error('Invalid restore candidate');
 const folder=resolve(root,'data','backups');
 const path=join(folder,filename);
 if(!existsSync(path))return {filename,ready:false,reason:'not_found'};
 const actualFolder=realpathSync(folder),actual=realpathSync(path);
 if(!actual.startsWith(actualFolder+sep))return {filename,ready:false,reason:'outside_backup_folder'};
 const size=statSync(actual).size;
 try{
  const db=new DatabaseSync(actual,{readOnly:true});
  try{
   const integrity=db.prepare('PRAGMA integrity_check').get();
   if(Object.values(integrity)[0]!=='ok')return {filename,ready:false,reason:'integrity_failed',size};
   const checksum=verifySnapshotChecksum(actual);
   if(checksum.valid===false)return {filename,ready:false,reason:'checksum_mismatch',size,checksum};
   return {filename,ready:true,size,checksum,requiresStoppedServer:true,restored:false};
  }finally{db.close();}
 }catch{return {filename,ready:false,reason:'invalid_sqlite',size};}
}
