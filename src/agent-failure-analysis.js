// Classifies observed job failures; recommendations are advisory, not automatic patches.
export function classifyAgentFailure(job){
 if(!job||typeof job.status!=='string')throw Error('Invalid job');
 const message=String(job.error??'').slice(0,1000).toLowerCase();
 if(job.status==='interrupted')return {category:'interruption',recommendation:'Inspect restart or shutdown cause; retry only after review',retryAutomatically:false};
 if(job.status!=='failed')return {category:'none',recommendation:'No failure observed',retryAutomatically:false};
 if(/timeout|timed out|deadline/.test(message))return {category:'timeout',recommendation:'Inspect task duration and resource limits',retryAutomatically:false};
 if(/sqlite|database|locked|constraint/.test(message))return {category:'storage',recommendation:'Inspect SQLite integrity, concurrent access and available disk space',retryAutomatically:false};
 if(/permission|access denied|eacces|eperm/.test(message))return {category:'permission',recommendation:'Inspect file permissions and task authorization',retryAutomatically:false};
 if(/invalid|unsupported|not found|unknown/.test(message))return {category:'input',recommendation:'Validate input and allowlisted action',retryAutomatically:false};
 return {category:'unclassified',recommendation:'Inspect sanitized error and reproduce in an isolated test',retryAutomatically:false};
}
export function analyzeAgentFailures(db,{limit=100}={}){
 if(!db?.prepare||!Number.isInteger(limit)||limit<1||limit>500)throw Error('Invalid failure analysis');
 const jobs=db.prepare("SELECT id,role,action,status,error FROM agent_jobs WHERE status IN ('failed','interrupted') ORDER BY id DESC LIMIT ?").all(limit);
 const counts={};
 const findings=jobs.map(job=>{
  const classified=classifyAgentFailure(job);
  counts[classified.category]=(counts[classified.category]??0)+1;
  return {jobId:job.id,role:job.role,action:job.action,status:job.status,...classified};
 });
 return {inspected:jobs.length,categories:counts,findings,automaticRetry:false,automaticPatch:false};
}
