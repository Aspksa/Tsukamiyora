import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { indexDirectory } from './rag-import.js';

export function loadIndexConfig(root=process.cwd()){
 const path=join(root,'data','rag-settings.json');
 mkdirSync(join(root,'data'),{recursive:true});
 if(!existsSync(path)){
  const config={enabled:true,folders:['data/library'],intervalMinutes:30,maxFiles:2000,maxBytes:1048576};
  writeFileSync(path,JSON.stringify(config,null,2)+'\n',{flag:'wx'});
 }
 const value=JSON.parse(readFileSync(path,'utf8'));
 if(typeof value.enabled!=='boolean'||!Array.isArray(value.folders)||value.folders.length>20||!value.folders.every(x=>typeof x==='string'&&x.length>0&&x.length<=1024)||!Number.isInteger(value.intervalMinutes)||value.intervalMinutes<1||value.intervalMinutes>1440)throw Error('Invalid RAG settings');
 return value;
}
export function createAutoIndexer(db,{root=process.cwd(),log=()=>{}}={}){
 let timer=null,running=false,closed=false;
 const run=()=>{
  if(closed||running)return {skipped:true};
  running=true;
  try{
   const cfg=loadIndexConfig(root);
   if(!cfg.enabled)return {disabled:true};
   const results=[];
   for(const folder of cfg.folders){
    const path=resolve(root,folder);
    if(!existsSync(path)){if(path===join(root,'data','library'))mkdirSync(path,{recursive:true});else {results.push({folder,error:'folder not found'});continue;}}
    try{results.push({folder,...indexDirectory(db,path,{maxFiles:cfg.maxFiles,maxBytes:cfg.maxBytes})});}
    catch(error){results.push({folder,error:String(error)});}
   }
   log({event:'rag:index',results});return {results};
  }finally{running=false;}
 };
 const start=()=>{
  if(timer||closed)return;
  const cfg=loadIndexConfig(root);
  if(!cfg.enabled)return;
  timer=setInterval(()=>{try{run();}catch(error){log({event:'rag:error',error:String(error)});}},cfg.intervalMinutes*60000);
  timer.unref();
  queueMicrotask(()=>{try{run();}catch(error){log({event:'rag:error',error:String(error)});}});
 };
 const stop=()=>{closed=true;if(timer)clearInterval(timer);timer=null;};
 return {start,stop,run};
}
