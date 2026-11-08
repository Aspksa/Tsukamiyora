import { readdirSync, readFileSync, statSync, realpathSync } from 'node:fs';
import { join, relative, extname, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { KnowledgeIndex } from './rag.js';
const TYPES=new Set(['.txt','.md','.markdown','.json','.csv','.log']);
export function indexDirectory(db,folder,{maxFiles=2000,maxBytes=1024*1024}={}){
 if(!Number.isInteger(maxFiles)||maxFiles<1||maxFiles>100000||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>10*1024*1024)throw Error('Invalid limits');
 const root=realpathSync(resolve(folder));if(!statSync(root).isDirectory())throw Error('Not a directory');
 const rag=new KnowledgeIndex(db),pending=[root];let scanned=0,changed=0,skipped=0;
 while(pending.length&&scanned<maxFiles){
  const dir=pending.pop();
  for(const entry of readdirSync(dir,{withFileTypes:true})){
   if(scanned>=maxFiles)break;
   if(entry.isSymbolicLink()||entry.name.startsWith('.'))continue;
   const path=join(dir,entry.name);
   if(entry.isDirectory()){pending.push(path);continue;}
   if(!entry.isFile()||!TYPES.has(extname(entry.name).toLowerCase()))continue;
   scanned++;
   try{
    const info=statSync(path);if(info.size>maxBytes){skipped++;continue;}
    const actual=realpathSync(path);if(!actual.startsWith(root+sep)){skipped++;continue;}
    const rel=relative(root,path).replaceAll('\\','/');
    const id='file:'+createHash('sha256').update(root+'\0'+rel).digest('hex');
    const result=rag.ingest({id,title:rel,text:readFileSync(path,'utf8')});
    if(result.changed)changed++;
   }catch{skipped++;}
  }
 }
 return {scanned,changed,skipped,remainingDirectories:pending.length};
}
