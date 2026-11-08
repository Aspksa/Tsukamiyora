// Conservative, local, evidence-backed fact extraction. No LLM or network calls.
const PATTERN=/^\s*([^\n:=]{2,100})\s*[:=]\s*([^\n]{1,300})\s*$/gm;
export class KnowledgeLifecycle {
 constructor(db){
  this.db=db;
  db.exec(`CREATE TABLE IF NOT EXISTS rag_evidence(
   source_id TEXT NOT NULL,chunk_id TEXT NOT NULL,subject TEXT NOT NULL,predicate TEXT NOT NULL,
   value TEXT NOT NULL,confidence REAL NOT NULL,verified_at TEXT DEFAULT CURRENT_TIMESTAMP,
   PRIMARY KEY(source_id,chunk_id,subject,predicate,value)
  );
  CREATE TABLE IF NOT EXISTS rag_fact_history(id INTEGER PRIMARY KEY AUTOINCREMENT,subject TEXT NOT NULL,predicate TEXT NOT NULL,value TEXT NOT NULL,source_id TEXT NOT NULL,recorded_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
 }
 extract({sourceId,limit=100}={}){
  if(typeof sourceId!=='string'||!sourceId.trim()||sourceId.length>200||!Number.isInteger(limit)||limit<1||limit>500)throw Error('Invalid extraction options');
  // Never extract private chat messages into shared fact tables.
  if(sourceId.startsWith('chat:'))throw Error('Private chat extraction forbidden');
  const chunks=this.db.prepare('SELECT id,body FROM rag_chunks WHERE source_id=? ORDER BY position LIMIT ?').all(sourceId,limit);
  const total=this.db.prepare('SELECT COUNT(*) AS n FROM rag_chunks WHERE source_id=?').get(sourceId).n;
  if(total>limit)throw Error('Extraction would be partial; increase limit');
  const previous=this.db.prepare('SELECT chunk_id,subject,predicate,value FROM rag_evidence WHERE source_id=?').all(sourceId);
  const previousKeys=new Set(previous.map(x=>JSON.stringify([x.chunk_id,x.subject,x.predicate,x.value])));
  const add=this.db.prepare('INSERT OR IGNORE INTO rag_evidence(source_id,chunk_id,subject,predicate,value,confidence) VALUES(?,?,?,?,?,?)');
  const fact=this.db.prepare('INSERT OR IGNORE INTO rag_facts(subject,predicate,value,source_id) VALUES(?,?,?,?)');
  const history=this.db.prepare('INSERT INTO rag_fact_history(subject,predicate,value,source_id) VALUES(?,?,?,?)');
  let created=0,conflicts=0;
  this.db.exec('SAVEPOINT rag_extract');
  try{
   // Replace extracted evidence for changed/deleted chunks, without touching manual facts.
   this.db.prepare('DELETE FROM rag_evidence WHERE source_id=?').run(sourceId);
   // Keep manually recorded facts intact; only remove facts backed by old evidence
   // when no new evidence supports them after extraction.
   for(const chunk of chunks){
    for(const line of chunk.body.split(/\r?\n/)){
     const match=/^\s*([^:=\n]{2,100})\s*[:=]\s*([^\n]{1,300})\s*$/.exec(line);
     if(!match)continue;
     const subject=match[1].trim(),value=match[2].trim(),predicate='значение';
     if(!subject||!value)continue;
     const conflict=this.db.prepare('SELECT 1 FROM rag_facts WHERE subject=? AND predicate=? AND value<>? LIMIT 1').get(subject,predicate,value);
     if(conflict)conflicts++;
     const result=add.run(sourceId,chunk.id,subject,predicate,value,0.65);
     if(result.changes){
      const key=JSON.stringify([chunk.id,subject,predicate,value]);
      if(!previousKeys.has(key)){
       created++;
       history.run(subject,predicate,value,sourceId);
      }
      fact.run(subject,predicate,value,sourceId);
     }
    }
   }
   this.db.exec('RELEASE SAVEPOINT rag_extract');
  }catch(error){
   this.db.exec('ROLLBACK TO SAVEPOINT rag_extract');
   this.db.exec('RELEASE SAVEPOINT rag_extract');throw error;
  }
  return {created,conflicts,sourceId};
 }
 facts({subject,limit=50}={}){
  if(typeof subject!=='string'||!subject.trim()||subject.length>200||!Number.isInteger(limit)||limit<1||limit>200)throw Error('Invalid fact query');
  const rows=this.db.prepare(`SELECT e.subject,e.predicate,e.value,e.source_id,e.chunk_id,e.confidence,e.verified_at,
   s.updated_at AS source_updated_at,c.body AS evidence
   FROM rag_evidence e JOIN rag_chunks c ON c.id=e.chunk_id AND c.source_id=e.source_id
   JOIN rag_sources s ON s.id=e.source_id
   WHERE e.subject=? AND substr(e.source_id,1,5)<>'chat:'
   ORDER BY e.verified_at DESC LIMIT ?`).all(subject,limit);
  return rows.map(r=>({...r,needsReview:r.source_updated_at>r.verified_at,citation:{sourceId:r.source_id,chunkId:r.chunk_id}}));
 }
 history({subject,predicate='значение',limit=100}={}){
  if(typeof subject!=='string'||!subject.trim()||subject.length>200||typeof predicate!=='string'||predicate.length>200||!Number.isInteger(limit)||limit<1||limit>200)throw Error('Invalid history query');
  return this.db.prepare("SELECT value,source_id,recorded_at FROM rag_fact_history WHERE subject=? AND predicate=? AND substr(source_id,1,5)<>'chat:' ORDER BY id DESC LIMIT ?").all(subject,predicate,limit);
 }
 stale({days=90,limit=100}={}){
  if(!Number.isInteger(days)||days<1||days>3650||!Number.isInteger(limit)||limit<1||limit>500)throw Error('Invalid staleness options');
  return this.db.prepare(`SELECT e.subject,e.predicate,e.value,e.source_id,e.chunk_id,e.verified_at
   FROM rag_evidence e JOIN rag_chunks c ON c.id=e.chunk_id AND c.source_id=e.source_id
   WHERE substr(e.source_id,1,5)<>'chat:' AND e.verified_at < datetime('now',?)
   ORDER BY e.verified_at LIMIT ?`).all('-'+days+' days',limit);
 }
}
