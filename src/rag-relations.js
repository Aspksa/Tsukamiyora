// Conservative entity-relation extraction from explicit "subject -> relation -> object" lines.
// No LLM and no inferred relationships.
export class RagRelationGraph {
 constructor(db){this.db=db;db.exec('CREATE TABLE IF NOT EXISTS rag_extracted_relations(subject TEXT NOT NULL,relation TEXT NOT NULL,object TEXT NOT NULL,source_id TEXT NOT NULL,PRIMARY KEY(subject,relation,object,source_id))');}
 extract({sourceId,limit=500}={}){
  if(typeof sourceId!=='string'||!sourceId.startsWith('file:')||sourceId.length>200||!Number.isInteger(limit)||limit<1||limit>5000)throw Error('Invalid relation extraction');
  const rows=this.db.prepare('SELECT body FROM rag_chunks WHERE source_id=? ORDER BY position LIMIT ?').all(sourceId,limit);
  if(this.db.prepare('SELECT COUNT(*) n FROM rag_chunks WHERE source_id=?').get(sourceId).n>limit)throw Error('Partial relation extraction forbidden');
  const triples=new Set();
  for(const row of rows)for(const line of row.body.split(/\r?\n/)){
   const match=/^\s*([^\n>]{2,100})\s*->\s*([^\n>]{2,100})\s*->\s*([^\n>]{2,100})\s*$/.exec(line);
   if(match)triples.add(JSON.stringify(match.slice(1).map(x=>x.trim())));
  }
  this.db.exec('SAVEPOINT rag_relations');
  try{
   this.db.prepare('DELETE FROM rag_extracted_relations WHERE source_id=?').run(sourceId);
   const add=this.db.prepare('INSERT OR IGNORE INTO rag_extracted_relations(subject,relation,object,source_id) VALUES(?,?,?,?)');
   for(const triple of triples)add.run(...JSON.parse(triple),sourceId);
   this.db.exec('RELEASE SAVEPOINT rag_relations');
  }catch(e){this.db.exec('ROLLBACK TO SAVEPOINT rag_relations');this.db.exec('RELEASE SAVEPOINT rag_relations');throw e;}
  return {sourceId,relations:triples.size};
 }
 related(entity,{limit=50}={}){
  if(typeof entity!=='string'||!entity.trim()||entity.length>200||!Number.isInteger(limit)||limit<1||limit>200)throw Error('Invalid entity');
  return this.db.prepare(`SELECT e.subject,e.relation,e.object,e.source_id,s.title
   FROM rag_extracted_relations e JOIN rag_sources s ON s.id=e.source_id
   WHERE (e.subject=? OR e.object=?) AND substr(e.source_id,1,5)='file:'
   ORDER BY e.source_id,e.subject,e.relation LIMIT ?`).all(entity,entity,limit);
 }
}
