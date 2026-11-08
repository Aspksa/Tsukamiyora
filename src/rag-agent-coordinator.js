// Offline evidence-first agent coordinator. It never invokes a cloud model or approves its own proposals.
import {RagAgentExperience} from './rag-agent-experience.js';
import {createRagWorkQueue} from './rag-work-queue.js';

export function createRagAgentCoordinator(db,{log=()=>{}}={}){
 if(!db||typeof db.prepare!=='function'||typeof log!=='function')throw Error('Invalid coordinator options');
 const experience=new RagAgentExperience(db);
 const queue=createRagWorkQueue({capacity:32,log});
 const roles=Object.freeze(['researcher','critic','librarian','architect','consolidator','auditor','optimizer','mentor']);
 let proposed=0,rejected=0;
 const submitLesson=({role,taskKey,lesson,sourceId}={})=>{
  if(!roles.includes(role))throw Error('Unknown RAG agent role');
  // Human review is mandatory; agents cannot approve their own lessons.
  const result=experience.propose({agentId:role,taskKey,lesson,sourceId});
  proposed++;return result;
 };
 const auditPending=({limit=30}={})=>{
  const pending=experience.pending({limit});
  const stale=pending.filter(item=>!item.evidenceCurrent);
  return {pending:pending.length,stale:stale.length,staleIds:stale.map(item=>item.id)};
 };
 const rejectStale=({limit=30}={})=>{
  const audit=auditPending({limit});
  db.exec('SAVEPOINT rag_agent_stale_cleanup');
  try{
   let updated=0;
   for(const id of audit.staleIds){
    if(experience.review({id,approved:false}).updated)updated++;
   }
   db.exec('RELEASE SAVEPOINT rag_agent_stale_cleanup');
   rejected+=updated;
   return {...audit,rejected:updated,totalRejected:rejected};
  }catch(error){
   db.exec('ROLLBACK TO SAVEPOINT rag_agent_stale_cleanup');
   db.exec('RELEASE SAVEPOINT rag_agent_stale_cleanup');
   throw error;
  }
 };
 const enqueueAudit=()=>{
  const result=queue.submit('agent:evidence-audit',()=>rejectStale());
  if(result.queued)queueMicrotask(()=>{void queue.drain({maxJobs:1});});
  return result;
 };
 return {roles,submitLesson,auditPending,rejectStale,enqueueAudit,
  status:()=>({proposed,rejected,queue:queue.status()}),stop:()=>queue.stop()};
}
