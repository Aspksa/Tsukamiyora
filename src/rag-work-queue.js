// Local bounded FIFO queue for maintenance jobs. No remote calls or concurrent writes.
export function createRagWorkQueue({capacity=100,log=()=>{}}={}){
 if(!Number.isInteger(capacity)||capacity<1||capacity>10000||typeof log!=='function')throw Error('Invalid RAG queue options');
 const pending=[],keys=new Set();let running=false,closed=false,completed=0,failed=0;
 const submit=(key,work)=>{
  if(closed||typeof key!=='string'||!key.trim()||key.length>200||typeof work!=='function')throw Error('Invalid RAG job');
  if(keys.has(key))return {queued:false,reason:'duplicate'};
  if(pending.length>=capacity)return {queued:false,reason:'full'};
  pending.push({key,work});keys.add(key);return {queued:true};
 };
 const drain=async({maxJobs=10}={})=>{
  if(!Number.isInteger(maxJobs)||maxJobs<1||maxJobs>1000)throw Error('Invalid queue batch');
  if(running||closed)return {skipped:true};
  running=true;let processed=0;
  try{
   while(pending.length&&processed<maxJobs&&!closed){
    const job=pending.shift();processed++;
    try{await job.work();completed++;}catch(error){failed++;try{log({event:'rag:job-error',key:job.key,error:String(error)});}catch{}}
    finally{keys.delete(job.key);}
   }
   return {processed,remaining:pending.length};
  }finally{running=false;}
 };
 return {submit,drain,stop:()=>{closed=true;pending.length=0;keys.clear();},status:()=>({pending:pending.length,running,closed,completed,failed})};
}
