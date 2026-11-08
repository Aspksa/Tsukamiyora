import {DatabaseSync} from 'node:sqlite';
import {existsSync,readdirSync,statSync} from 'node:fs';
import {join,resolve} from 'node:path';

export function inspectBackups({root=process.cwd(),limit=10}={}){
 if(typeof root!=='string'||!root.trim()||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid backup inspection options');
 const folder=join(resolve(root),'data','backups');
 if(!existsSync(folder))return [];
 return readdirSync(folder).filter(name=>/^tsukamiyora-[0-9T-]+\.sqlite$/.test(name))
  .sort().reverse().slice(0,limit).map(name=>{
   const path=join(folder,name);
   try{
    const size=statSync(path).size;
    const db=new DatabaseSync(path,{readOnly:true});
    try{
     const result=db.prepare('PRAGMA integrity_check').get();
     return {name,size,valid:Object.values(result)[0]==='ok'};
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
