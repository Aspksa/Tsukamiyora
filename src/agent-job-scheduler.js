// Conservative single-process polling for the persistent local job queue.
export function createAgentJobScheduler(engine,{intervalMs=5000,log=()=>{}}={}){
 if(!engine?.execute||!engine?.status||!Number.isInteger(intervalMs)||intervalMs<1000||typeof log!=='function')throw Error('Invalid agent job scheduler');
 let timer=null,running=false,lastRun=null,lastProcessed=0;
 const tick=async()=>{
  if(running)return {busy:true};
  running=true;
  try{
   if(engine.status().queued===0)return {busy:false,processed:0};
   const result=await engine.execute({limit:3});
   lastRun=new Date().toISOString();lastProcessed=result.processed??0;
   return result;
  }catch(error){log({event:'agent:job-scheduler-error',error:String(error)});return {error:'Job scheduler failed'};}
  finally{running=false;}
 };
 const start=()=>{
  if(timer)return false;
  timer=setInterval(()=>{void tick();},intervalMs);timer.unref?.();
  return true;
 };
 const stop=()=>{if(timer)clearInterval(timer);timer=null;};
 const status=()=>({scheduled:!!timer,running,intervalMs,lastRun,lastProcessed});
 return {tick,start,stop,status};
}
