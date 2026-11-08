import {DatabaseSync} from 'node:sqlite';
import {existsSync,readdirSync,statSync,realpathSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {verifySnapshotChecksum} from './backup-checksum.js';

export function inspectBackups({root=process.cwd(),limit=10}={}){
 if(typeof root!=='string'||!root.trim()||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid backup inspection options');
 const folder=join(resolve(root),'data','backups');
 if(!existsSync(folder))return [];
 const actualFolder=realpathSync(folder);
 return readdirSync(folder).filter(name=>/^tsukamiyora-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-[0-9a-f]{8})?\.sqlite$/.test(name))
  .sort().reverse().slice(0,limit).map(name=>{
   const path=join(folder,name);
   try{
    const actual=realpathSync(path);
    if(!actual.startsWith(actualFolder+sep))return {name,valid:false,error:'outside_backup_folder'};
    const size=statSync(actual).size;
    const db=new DatabaseSync(actual,{readOnly:true});
    try{
     const result=db.prepare('PRAGMA integrity_check').get();
     const checksum=verifySnapshotChecksum(actual);
     return {name,size,valid:Object.values(result)[0]==='ok'&&checksum.valid!==false,checksum};
    }finally{db.close();}
   }catch(error){return {name,valid:false,error:String(error)};}
  });
}

if(process.argv.includes('--inspect-backups')){
 try{
  const reports=inspectBackups();
  console.log(JSON.stringify(reports,null,2));
  if(reports.some(report=>!report.valid))process.exitCode=1;
 }catch(error){console.error(String(error));process.exitCode=1;}
}
