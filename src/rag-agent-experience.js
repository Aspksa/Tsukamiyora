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
 }
 propose({agentId,taskKey,lesson,sourceId}={}){
  if(![agentId,taskKey,lesson,sourceId].every(x=>typeof x==='string'&&x.trim())||
   agentId.length>100||taskKey.length>200||lesson.length>2000||
   !sourceId.startsWith('file:')||sourceId.length>200)throw Error('Invalid agent experience');
  if(!this.db.prepare('SELECT 1 FROM rag_sources WHERE id=?').get(sourceId))throw Error('Evidence source not found');
  const result=this.db.prepare('INSERT INTO rag_agent_experience(agent_id,task_key,lesson,source_id) VALUES(?,?,?,?)').run(agentId,taskKey,lesson,sourceId);
  return {id:Number(result.lastInsertRowid),status:'pending'};
 }
 review({id,approved}={}){
  if(!Number.isSafeInteger(id)||id<1||typeof approved!=='boolean')throw Error('Invalid experience review');
  const result=this.db.prepare("UPDATE rag_agent_experience SET status=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").run(approved?'approved':'rejected',id);
  return {updated:result.changes===1};
 }
 share({taskKey,limit=10}={}){
  if(typeof taskKey!=='string'||!taskKey.trim()||taskKey.length>200||!Number.isInteger(limit)||limit<1||limit>50)throw Error('Invalid experience search');
  // Only explicitly approved lessons with still-existing public evidence can be shared.
  return this.db.prepare(`SELECT e.id,e.agent_id,e.task_key,e.lesson,e.source_id,e.reviewed_at
   FROM rag_agent_experience e JOIN rag_sources s ON s.id=e.source_id
   WHERE e.task_key=? AND e.status='approved' AND substr(e.source_id,1,5)='file:'
   ORDER BY e.id DESC LIMIT ?`).all(taskKey,limit);
 }
}
