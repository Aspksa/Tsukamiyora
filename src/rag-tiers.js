// Local memory importance; no automatic deletion and no cloud transfer.
export class RagMemoryTiers {
 constructor(db){
  this.db=db;
  db.exec(`CREATE TABLE IF NOT EXISTS rag_memory_tiers(
   source_id TEXT PRIMARY KEY, tier TEXT NOT NULL CHECK(tier IN ('temporary','working','longterm')),
   importance INTEGER NOT NULL CHECK(importance BETWEEN 0 AND 100),
   updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
 }
 set({sourceId,tier,importance=50}={}){
  if(typeof sourceId!=='string'||sourceId.length>200||!['temporary','working','longterm'].includes(tier)||!Number.isInteger(importance)||importance<0||importance>100)throw Error('Invalid memory tier');
  if(!this.db.prepare('SELECT 1 FROM rag_sources WHERE id=?').get(sourceId))throw Error('Source not found');
  this.db.prepare(`INSERT INTO rag_memory_tiers(source_id,tier,importance) VALUES(?,?,?)
   ON CONFLICT(source_id) DO UPDATE SET tier=excluded.tier,importance=excluded.importance,updated_at=CURRENT_TIMESTAMP`).run(sourceId,tier,importance);
  return {sourceId,tier,importance};
 }
 get(sourceId){
  return this.db.prepare(`SELECT t.tier,t.importance,t.updated_at FROM rag_memory_tiers t
   JOIN rag_sources s ON s.id=t.source_id WHERE t.source_id=?`).get(sourceId)??{tier:'working',importance:50};
 }
 pruneOrphans(){
  return this.db.prepare('DELETE FROM rag_memory_tiers WHERE source_id NOT IN (SELECT id FROM rag_sources)').run().changes;
 }
}
