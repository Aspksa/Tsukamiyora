import { sep } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { indexDirectory } from './rag-import.js';
import { createRagWorkQueue } from './rag-work-queue.js';

export function loadIndexConfig(root=process.cwd()){
 const path=join(root,'data','rag-settings.json');
 mkdirSync(join(root,'data'),{recursive:true});
 if(!existsSync(path)){
  const config={enabled:true,folders:['data/library'],intervalMinutes:30,maxFiles:2000,maxBytes:1048576};
  writeFileSync(path,JSON.stringify(config,null,2)+'\n',{flag:'wx'});
 }
 const value=JSON.parse(readFileSync(path,'utf8'));
 if(typeof value.enabled!=='boolean'||!Array.isArray(value.folders)||value.folders.length>20||!value.folders.every(x=>typeof x==='string'&&x.length>0&&x.length<=1024)||!Number.isInteger(value.maxFiles)||value.maxFiles<1||value.maxFiles>100000||!Number.isInteger(value.maxBytes)||value.maxBytes<1||value.maxBytes>10*1024*1024||!Number.isInteger(value.intervalMinutes)||value.intervalMinutes<1||value.intervalMinutes>1440)throw Error('Invalid RAG settings');
 return value;
}
export function createAutoIndexer(db,{root=process.cwd(),log=()=>{}}={}){
 let timer=null,running=false,closed=false,last=null,runCount=0,skippedCount=0;
 const queue=createRagWorkQueue({capacity:2,log});
 const run=()=>{
  if(closed||running){skippedCount++;return {skipped:true};}
  running=true;
  try{
   const cfg=loadIndexConfig(root);
   if(!cfg.enabled)return {disabled:true};
   const results=[];
   for(const folder of cfg.folders){
    const path=resolve(root,folder);
    if(path!==resolve(root)&&!path.startsWith(resolve(root)+sep)){results.push({folder,error:'folder outside project root'});continue;}
    if(!existsSync(path)){if(path===resolve(root,'data','library'))mkdirSync(path,{recursive:true});else {results.push({folder,error:'folder not found'});continue;}}
    try{
     const actualRoot=realpathSync(root),actualPath=realpathSync(path);
     if(actualPath!==actualRoot&&!actualPath.startsWith(actualRoot+sep)){
      results.push({folder,error:'folder resolves outside project root'});continue;
     }
     results.push({folder,...indexDirectory(db,path,{maxFiles:cfg.maxFiles,maxBytes:cfg.maxBytes})});}
    catch(error){results.push({folder,error:String(error)});}
   }
   last={at:new Date().toISOString(),results};runCount++;
   try{log({event:'rag:index',results});}catch{}
   return {results};
  }finally{running=false;}
 };
 const enqueue=()=>{
  if(closed)return {skipped:true};
  const queued=queue.submit('rag:index',()=>run());
  // Defer the drain: duplicate submissions in the same tick coalesce before
  // any synchronous filesystem work begins.
  if(queued.queued)queueMicrotask(()=>{void queue.drain({maxJobs:1});});
  return queued;
 };
 const start=()=>{
  if(timer||closed)return;
  const cfg=loadIndexConfig(root);
  if(!cfg.enabled)return;
  timer=setInterval(()=>{try{enqueue();}catch(error){try{log({event:'rag:error',error:String(error)});}catch{}}},cfg.intervalMinutes*60000);
  timer.unref();
  queueMicrotask(()=>{try{enqueue();}catch(error){try{log({event:'rag:error',error:String(error)});}catch{}});
 };
 const stop=()=>{closed=true;if(timer)clearInterval(timer);timer=null;queue.stop();};
 return {start,stop,run,enqueue,status:()=>({running,closed,scheduled:Boolean(timer),runCount,skippedCount,last,queue:queue.status()})};
}
