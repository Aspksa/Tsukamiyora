// Durable local task dispatch. Only explicitly registered read-only executors can run.
export function createAgentTaskEngine(db,{roles,handlers={},maxJobs=3,log=()=>{}}={}){
 if(!db?.prepare||!Array.isArray(roles)||!Number.isInteger(maxJobs)||maxJobs<1||maxJobs>3)throw Error('Invalid agent task engine');
 db.exec(`CREATE TABLE IF NOT EXISTS agent_jobs(
 id INTEGER PRIMARY KEY AUTOINCREMENT,role TEXT NOT NULL,action TEXT NOT NULL,
 input_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',
 result_json TEXT,error TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 finished_at TEXT);
 CREATE INDEX IF NOT EXISTS agent_jobs_status ON agent_jobs(status,id);`);
 // Restart cannot resume in-flight work safely; mark interrupted jobs for inspection.
 db.prepare("UPDATE agent_jobs SET status='interrupted',error='Server restarted before completion',finished_at=CURRENT_TIMESTAMP WHERE status='running'").run();
 const allowed=new Map(Object.entries(handlers).filter(([name,fn])=>typeof fn==='function'&&name.includes(':')));
 const safeJson=x=>JSON.stringify(x??null);
 const submit=({role,action,input={}}={})=>{
  if(!roles.includes(role)||typeof action!=='string'||!action.startsWith(role+':')||!allowed.has(action))throw Error('Unsupported agent action');
  const serialized=safeJson(input);
  if(serialized.length>8192)throw Error('Agent input too large');
  const result=db.prepare('INSERT INTO agent_jobs(role,action,input_json) VALUES(?,?,?)').run(role,action,serialized);
  return {id:Number(result.lastInsertRowid),role,action,status:'queued'};
 };
 const execute=async({limit=maxJobs}={})=>{
  if(!Number.isInteger(limit)||limit<1||limit>maxJobs)throw Error('Invalid execution limit');
  const jobs=db.prepare("SELECT id,role,action,input_json FROM agent_jobs WHERE status='queued' ORDER BY id LIMIT ?").all(limit);
  const results=[];
  for(const job of jobs){
   const locked=db.prepare("UPDATE agent_jobs SET status='running' WHERE id=? AND status='queued'").run(job.id);
   if(!locked.changes)continue;
   try{
    const output=await allowed.get(job.action)(JSON.parse(job.input_json));
    const data=safeJson(output);
    if(data.length>32768)throw Error('Agent result too large');
    db.prepare("UPDATE agent_jobs SET status='completed',result_json=?,finished_at=CURRENT_TIMESTAMP WHERE id=?").run(data,job.id);
    results.push({id:job.id,status:'completed'});
   }catch(error){
    const message=String(error?.message??error).slice(0,1000);
    db.prepare("UPDATE agent_jobs SET status='failed',error=?,finished_at=CURRENT_TIMESTAMP WHERE id=?").run(message,job.id);
    log({event:'agent:job-failed',id:job.id,role:job.role,error:message});
    results.push({id:job.id,status:'failed'});
   }
  }
  return {results,processed:results.length};
 };
 const list=({limit=30}={})=>{
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid job list limit');
  return db.prepare('SELECT id,role,action,status,result_json,error,created_at,finished_at FROM agent_jobs ORDER BY id DESC LIMIT ?').all(limit);
 };
 const status=()=>({queued:db.prepare("SELECT COUNT(*) AS n FROM agent_jobs WHERE status='queued'").get().n,
  completed:db.prepare("SELECT COUNT(*) AS n FROM agent_jobs WHERE status='completed'").get().n,
  failed:db.prepare("SELECT COUNT(*) AS n FROM agent_jobs WHERE status='failed'").get().n,
  interrupted:db.prepare("SELECT COUNT(*) AS n FROM agent_jobs WHERE status='interrupted'").get().n,
  allowedActions:[...allowed.keys()],maxJobs,cloudCalls:0});
 return {submit,execute,list,status};
}
