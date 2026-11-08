import { readdirSync, readFileSync, statSync, realpathSync } from 'node:fs';
import { join, relative, extname, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { KnowledgeIndex } from './rag.js';
const TYPES=new Set(['.txt','.md','.markdown','.json','.csv','.log']);
export function indexDirectory(db,folder,{maxFiles=2000,maxBytes=1024*1024}={}){
 if(!Number.isInteger(maxFiles)||maxFiles<1||maxFiles>100000||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>10*1024*1024)throw Error('Invalid limits');
 const root=realpathSync(resolve(folder));if(!statSync(root).isDirectory())throw Error('Not a directory');
 const rag=new KnowledgeIndex(db),pending=[root],seen=new Set();let scanned=0,changed=0,skipped=0,removed=0,truncated=false;
 while(pending.length&&scanned<maxFiles){
  const dir=pending.pop();
  for(const entry of readdirSync(dir,{withFileTypes:true})){
   if(scanned>=maxFiles){truncated=true;break;}
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
    seen.add(id);
    const result=rag.ingest({id,title:rel,text:readFileSync(path,'utf8')});
    if(result.changed)changed++;
   }catch{skipped++;}
  }
 }
 if(pending.length===0&&skipped===0&&!truncated){
  db.exec('CREATE TABLE IF NOT EXISTS rag_file_roots(root TEXT NOT NULL, source_id TEXT NOT NULL, PRIMARY KEY(root,source_id))');
  const old=db.prepare('SELECT source_id FROM rag_file_roots WHERE root=?').all(root);
  for(const row of old){if(!seen.has(row.source_id)){if(rag.removeSource(row.source_id))removed++;db.prepare('DELETE FROM rag_file_roots WHERE root=? AND source_id=?').run(root,row.source_id);}}
  const track=db.prepare('INSERT OR IGNORE INTO rag_file_roots(root,source_id) VALUES(?,?)');
  for(const id of seen)track.run(root,id);
 }else{
  db.exec('CREATE TABLE IF NOT EXISTS rag_file_roots(root TEXT NOT NULL, source_id TEXT NOT NULL, PRIMARY KEY(root,source_id))');
  const track=db.prepare('INSERT OR IGNORE INTO rag_file_roots(root,source_id) VALUES(?,?)');
  for(const id of seen)track.run(root,id);
 }
 return {scanned,changed,skipped,removed,remainingDirectories:pending.length};
}
