// Bounded, local-only agent experience store. No private chat content or automatic trust.
export class RagAgentExperience {
 constructor(db){
  this.db=db;
  db.exec(`CREATE TABLE IF NOT EXISTS rag_agent_experience(
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   agent_id TEXT NOT NULL, task_key TEXT NOT NULL, lesson TEXT NOT NULL,
   source_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   reviewed_at TEXT,
   CHECK(status IN ('pending','approved','rejected'))
  );
  CREATE INDEX IF NOT EXISTS rag_agent_experience_lookup ON rag_agent_experience(task_key,status,id);`);
  // Additive migration: previously approved lessons without a source snapshot
  // remain withheld until re-proposed and reviewed against current evidence.
  if(!db.prepare("PRAGMA table_info(rag_agent_experience)").all().some(c=>c.name==='source_body_hash'))
   db.exec('ALTER TABLE rag_agent_experience ADD COLUMN source_body_hash TEXT');
 }
 propose({agentId,taskKey,lesson,sourceId}={}){
  if(![agentId,taskKey,lesson,sourceId].every(x=>typeof x==='string'&&x.trim())||
   agentId.length>100||taskKey.length>200||lesson.length>2000||
   !sourceId.startsWith('file:')||sourceId.length>200)throw Error('Invalid agent experience');
  const source=this.db.prepare('SELECT body_hash FROM rag_sources WHERE id=?').get(sourceId);
  if(!source)throw Error('Evidence source not found');
  const result=this.db.prepare('INSERT INTO rag_agent_experience(agent_id,task_key,lesson,source_id,source_body_hash) VALUES(?,?,?,?,?)').run(agentId,taskKey,lesson,sourceId,source.body_hash);
  return {id:Number(result.lastInsertRowid),status:'pending'};
 }
 review({id,approved}={}){
  if(!Number.isSafeInteger(id)||id<1||typeof approved!=='boolean')throw Error('Invalid experience review');
  // A review must not approve an outdated proposal after its evidence changed.
  const result=this.db.prepare(`UPDATE rag_agent_experience SET status=?,reviewed_at=CURRENT_TIMESTAMP
   WHERE id=? AND status='pending' AND (?=0 OR EXISTS(
    SELECT 1 FROM rag_sources s WHERE s.id=rag_agent_experience.source_id
     AND substr(s.id,1,5)='file:' AND s.body_hash=rag_agent_experience.source_body_hash
   ))`).run(approved?'approved':'rejected',id,approved?1:0);
  return {updated:result.changes===1};
 }
 pending({limit=30}={}){
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid pending limit');
  return this.db.prepare(`SELECT e.id,e.agent_id,e.task_key,e.lesson,e.source_id,e.created_at,
   CASE WHEN s.id IS NOT NULL AND s.body_hash=e.source_body_hash THEN 1 ELSE 0 END AS evidenceCurrent
   FROM rag_agent_experience e LEFT JOIN rag_sources s ON s.id=e.source_id
   WHERE e.status='pending' ORDER BY e.id DESC LIMIT ?`).all(limit);
 }
 share({taskKey,limit=10}={}){
  if(typeof taskKey!=='string'||!taskKey.trim()||taskKey.length>200||!Number.isInteger(limit)||limit<1||limit>50)throw Error('Invalid experience search');
  // Only explicitly approved lessons with still-existing public evidence can be shared.
  return this.db.prepare(`SELECT e.id,e.agent_id,e.task_key,e.lesson,e.source_id,e.reviewed_at
   FROM rag_agent_experience e JOIN rag_sources s ON s.id=e.source_id
   WHERE e.task_key=? AND e.status='approved' AND substr(e.source_id,1,5)='file:'
    AND e.source_body_hash=s.body_hash
   ORDER BY e.id DESC LIMIT ?`).all(taskKey,limit);
 }
}
