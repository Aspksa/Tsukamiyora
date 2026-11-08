// Local evidence ledger derived from durable agent jobs. Does not train or modify a model.
export function createAgentExperienceLedger(db){
 if(!db?.prepare)throw Error('Invalid experience database');
 db.exec(`CREATE TABLE IF NOT EXISTS agent_job_lessons(
 id INTEGER PRIMARY KEY AUTOINCREMENT,job_id INTEGER NOT NULL UNIQUE,
 role TEXT NOT NULL,action TEXT NOT NULL,outcome TEXT NOT NULL,
 lesson TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE INDEX IF NOT EXISTS agent_job_lessons_role ON agent_job_lessons(role,id);`);
 const capture=({limit=100}={})=>{
  if(!Number.isInteger(limit)||limit<1||limit>500)throw Error('Invalid capture limit');
  const jobs=db.prepare(`SELECT id,role,action,status,error FROM agent_jobs
   WHERE status IN ('completed','failed','interrupted')
   AND NOT EXISTS(SELECT 1 FROM agent_job_lessons l WHERE l.job_id=agent_jobs.id)
   ORDER BY id LIMIT ?`).all(limit);
  const insert=db.prepare('INSERT OR IGNORE INTO agent_job_lessons(job_id,role,action,outcome,lesson) VALUES(?,?,?,?,?)');
  let recorded=0;
  for(const job of jobs){
   const lesson=job.status==='completed'?'Action completed; inspect result before reusing strategy':
    job.status==='interrupted'?'Execution interrupted; inspect before manual retry':
    'Action failed; review diagnostic evidence before retry';
   const result=insert.run(job.id,job.role,job.action,job.status,lesson);
   recorded+=result.changes;
  }
  return {recorded,inspected:jobs.length};
 };
 const list=({role,limit=30}={})=>{
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid lesson limit');
  if(role!==undefined&&(typeof role!=='string'||role.length>100))throw Error('Invalid role');
  return role?db.prepare('SELECT * FROM agent_job_lessons WHERE role=? ORDER BY id DESC LIMIT ?').all(role,limit):
   db.prepare('SELECT * FROM agent_job_lessons ORDER BY id DESC LIMIT ?').all(limit);
 };
 const summary=()=>db.prepare(`SELECT role,COUNT(*) AS total,
 SUM(CASE WHEN outcome='completed' THEN 1 ELSE 0 END) AS completed,
 SUM(CASE WHEN outcome='failed' THEN 1 ELSE 0 END) AS failed,
 SUM(CASE WHEN outcome='interrupted' THEN 1 ELSE 0 END) AS interrupted
 FROM agent_job_lessons GROUP BY role ORDER BY role`).all();
 return {capture,list,summary};
}
