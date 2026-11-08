// Evidence-grounded thematic graph: only explicit key-value facts, no inferred claims.
const terms=s=>(String(s).toLocaleLowerCase('ru').match(/[\p{L}\p{N}]{3,}/gu)||[]);
export class RagTopicGraph {
 constructor(db){
  this.db=db;
  db.exec(`CREATE TABLE IF NOT EXISTS rag_topic_links(
   source_id TEXT NOT NULL,chunk_id TEXT NOT NULL,topic TEXT NOT NULL,
   PRIMARY KEY(source_id,chunk_id,topic)
  );`);
 }
 rebuild({sourceId,limit=500}={}){
  if(typeof sourceId!=='string'||!sourceId.startsWith('file:')||sourceId.length>200||!Number.isInteger(limit)||limit<1||limit>5000)throw Error('Invalid graph options');
  const rows=this.db.prepare('SELECT id,body FROM rag_chunks WHERE source_id=? ORDER BY position LIMIT ?').all(sourceId,limit);
  if(this.db.prepare('SELECT COUNT(*) n FROM rag_chunks WHERE source_id=?').get(sourceId).n>limit)throw Error('Partial graph rebuild forbidden');
  let count=0;
  this.db.exec('SAVEPOINT rag_topic_rebuild');
  try{
   this.db.prepare('DELETE FROM rag_topic_links WHERE source_id=?').run(sourceId);
   const insert=this.db.prepare('INSERT OR IGNORE INTO rag_topic_links(source_id,chunk_id,topic) VALUES(?,?,?)');
   for(const row of rows){
    const frequencies=new Map();
    for(const token of terms(row.body))frequencies.set(token,(frequencies.get(token)||0)+1);
    for(const topic of [...frequencies.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,30).map(([topic])=>topic)){
     count+=insert.run(sourceId,row.id,topic).changes;
    }
   }
   this.db.exec('RELEASE SAVEPOINT rag_topic_rebuild');
  }catch(e){this.db.exec('ROLLBACK TO SAVEPOINT rag_topic_rebuild');this.db.exec('RELEASE SAVEPOINT rag_topic_rebuild');throw e;}
  return {sourceId,topics:count};
 }
 related(topic,{limit=30}={}){
  if(typeof topic!=='string'||!topic.trim()||topic.length>100||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid topic query');
  return this.db.prepare(`SELECT t.topic,t.source_id,t.chunk_id,s.title,c.body
   FROM rag_topic_links t JOIN rag_chunks c ON c.id=t.chunk_id AND c.source_id=t.source_id
   JOIN rag_sources s ON s.id=t.source_id
   WHERE t.topic=? AND substr(t.source_id,1,5)='file:'
   ORDER BY t.source_id,t.chunk_id LIMIT ?`).all(topic.toLocaleLowerCase('ru'),limit)
   .map(r=>({...r,citation:{sourceId:r.source_id,chunkId:r.chunk_id,title:r.title}}));
 }
}
