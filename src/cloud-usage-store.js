import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,rmSync} from 'node:fs';
import {dirname,join} from 'node:path';

const FIELDS=['requests','succeeded','failed','promptTokens','completionTokens','unreportedResponses','durationMs'];
export function createCloudUsageStore(root){
 const path=join(root,'data','cloudru-usage.json');
 const empty=()=>Object.fromEntries(FIELDS.map(key=>[key,0]));
 let totals=empty(),lastError=null;
 try{
  if(existsSync(path)){
   const saved=JSON.parse(readFileSync(path,'utf8'));
   if(saved&&typeof saved==='object'&&FIELDS.every(key=>Number.isSafeInteger(saved[key])&&saved[key]>=0))
    totals=Object.fromEntries(FIELDS.map(key=>[key,saved[key]]));
   else lastError='invalid_usage_file';
  }
 }catch{lastError='usage_read_failed';}
 const add=(delta)=>{
  for(const key of FIELDS){
   const value=delta[key]??0;
   if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid usage delta');
  }
  const next=Object.fromEntries(FIELDS.map(key=>[key,totals[key]+(delta[key]??0)]));
  if(!FIELDS.every(key=>Number.isSafeInteger(next[key])))throw Error('Usage counter overflow');
  const tmp=path+'.tmp';
  try{
   mkdirSync(dirname(path),{recursive:true});
   writeFileSync(tmp,JSON.stringify(next)+'\n',{mode:0o600});
   renameSync(tmp,path);
   totals=next;lastError=null;
  }catch{
   lastError='usage_write_failed';
   try{rmSync(tmp,{force:true});}catch{}
   // Preserve accurate in-process counters even when disk persistence fails.
   totals=next;
  }
 };
 return {add,snapshot:()=>({...totals,persistenceError:lastError})};
}
