// Durable, bounded, local-only journal of background knowledge checks.
// Reports contain counts and statuses only, never private document contents.
export class RagMaintenanceJournal {
 constructor(db){
  this.db=db;
  db.exec(`CREATE TABLE IF NOT EXISTS rag_maintenance_journal(
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   conflicts INTEGER NOT NULL,stale INTEGER NOT NULL,
   unsupported INTEGER NOT NULL,dangling INTEGER NOT NULL,
   consolidation_candidates INTEGER NOT NULL,requires_review INTEGER NOT NULL
  );`);
 }
 record({summary,consolidationCandidates=0,requiresReview=false}={}){
  const counts=[summary?.conflicts,summary?.stale,summary?.unsupported,summary?.danglingTopicLinks,consolidationCandidates];
  if(!counts.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000)||typeof requiresReview!=='boolean')throw Error('Invalid maintenance report');
  const result=this.db.prepare(`INSERT INTO rag_maintenance_journal
   (conflicts,stale,unsupported,dangling,consolidation_candidates,requires_review)
   VALUES(?,?,?,?,?,?)`).run(...counts,requiresReview?1:0);
  // Bounded retention; latest 500 checks remain.
  this.db.prepare('DELETE FROM rag_maintenance_journal WHERE id NOT IN (SELECT id FROM rag_maintenance_journal ORDER BY id DESC LIMIT 500)').run();
  return {id:Number(result.lastInsertRowid)};
 }
 recent({limit=20}={}){
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid journal limit');
  return this.db.prepare('SELECT * FROM rag_maintenance_journal ORDER BY id DESC LIMIT ?').all(limit);
 }
}
