// Offline evidence-first agent coordinator. It never invokes a cloud model or approves its own proposals.
import {RagAgentExperience} from './rag-agent-experience.js';
import {createRagWorkQueue} from './rag-work-queue.js';

export function createRagAgentCoordinator(db,{log=()=>{}}={}){
 if(!db||typeof db.prepare!=='function'||typeof log!=='function')throw Error('Invalid coordinator options');
 const experience=new RagAgentExperience(db);
 db.exec(`CREATE TABLE IF NOT EXISTS rag_agent_activity(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL, action TEXT NOT NULL, outcome TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 ); CREATE INDEX IF NOT EXISTS rag_agent_activity_recent ON rag_agent_activity(id);`);
 const record=(role,action,outcome,count,durationMs)=>{
  db.prepare('INSERT INTO rag_agent_activity(role,action,outcome,count,duration_ms) VALUES(?,?,?,?,?)')
   .run(role,action,outcome,count,Math.max(0,Math.round(durationMs)));
 };
 const queue=createRagWorkQueue({capacity:32,log});
 const roles=Object.freeze(["researcher","critic","librarian","architect","consolidator","auditor","optimizer","mentor","memory_engineer","document_analyst","ocr_specialist","rag_retriever","rag_reranker","rag_evaluator","index_engineer","system_architect","developer","tester","diagnostician","windows_engineer","security_engineer","release_engineer","dispatcher","scheduler","cloud_economist","quality_controller","performance_analyst","skills_teacher","experimenter","evolution_engineer"]);
 let proposed=0,rejected=0;
 const submitLesson=({role,taskKey,lesson,sourceId}={})=>{
  if(!roles.includes(role))throw Error('Unknown RAG agent role');
  // Human review is mandatory; agents cannot approve their own lessons.
  const result=experience.propose({agentId:role,taskKey,lesson,sourceId});
  proposed++;record(role,'lesson_proposed','pending',1,0);return result;
 };
 const auditPending=({limit=30}={})=>{
  const pending=experience.pending({limit});
  const stale=pending.filter(item=>!item.evidenceCurrent);
  return {pending:pending.length,stale:stale.length,staleIds:stale.map(item=>item.id)};
 };
 const rejectStale=({limit=30}={})=>{
  const started=Date.now();
  const audit=auditPending({limit});
  db.exec('SAVEPOINT rag_agent_stale_cleanup');
  try{
   let updated=0;
   for(const id of audit.staleIds){
    if(experience.review({id,approved:false}).updated)updated++;
   }
   record('auditor','stale_evidence_audit','completed',updated,Date.now()-started);
   db.exec('RELEASE SAVEPOINT rag_agent_stale_cleanup');
   rejected+=updated;
   return {...audit,rejected:updated,totalRejected:rejected};
  }catch(error){
   db.exec('ROLLBACK TO SAVEPOINT rag_agent_stale_cleanup');
   db.exec('RELEASE SAVEPOINT rag_agent_stale_cleanup');
   throw error;
  }
 };
 const activity=({limit=30}={})=>{
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid activity limit');
  return db.prepare('SELECT id,role,action,outcome,count,duration_ms,created_at FROM rag_agent_activity ORDER BY id DESC LIMIT ?').all(limit);
 };
 const enqueueAudit=()=>{
  const result=queue.submit('agent:evidence-audit',()=>rejectStale());
  if(result.queued)queueMicrotask(()=>{void queue.drain({maxJobs:1});});
  return result;
 };
 return {roles,submitLesson,auditPending,rejectStale,enqueueAudit,activity,
  status:()=>({proposed,rejected,queue:queue.status()}),stop:()=>queue.stop()};
}
