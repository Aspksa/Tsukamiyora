// Conservative local near-duplicate discovery. Never deletes sources or merges evidence.
const tokens=s=>new Set((String(s).toLocaleLowerCase('ru').match(/[\p{L}\p{N}]{2,}/gu)||[]));
export class RagDeduplicator {
 constructor(db){this.db=db;}
 candidates({limit=50,threshold=0.82,maxChunks=1000}={}){
  if(!Number.isInteger(limit)||limit<1||limit>200||typeof threshold!=='number'||threshold<0.5||threshold>1||!Number.isInteger(maxChunks)||maxChunks<2||maxChunks>5000)throw Error('Invalid deduplication options');
  const rows=this.db.prepare(`SELECT c.id,c.source_id,c.body,s.title FROM rag_chunks c JOIN rag_sources s ON s.id=c.source_id
   WHERE substr(c.source_id,1,5)='file:' ORDER BY c.source_id,c.position LIMIT ?`).all(maxChunks);
  const sets=rows.map(r=>tokens(r.body));const result=[];
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
   if(rows[i].source_id===rows[j].source_id)continue;
   const a=sets[i],b=sets[j];if(!a.size||!b.size)continue;
   let common=0;for(const t of a)if(b.has(t))common++;
   const score=common/(a.size+b.size-common);
   if(score>=threshold)result.push({first:{sourceId:rows[i].source_id,chunkId:rows[i].id,title:rows[i].title},second:{sourceId:rows[j].source_id,chunkId:rows[j].id,title:rows[j].title},similarity:Math.round(score*1000)/1000});
  }
  return result.sort((a,b)=>b.similarity-a.similarity||a.first.sourceId.localeCompare(b.first.sourceId)).slice(0,limit);
 }
}
