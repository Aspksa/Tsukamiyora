// Lightweight periodic read-only knowledge health checks. No network or mutations.
import {RagKnowledgeGuardian} from './rag-guardian.js';
export function createGuardianScheduler(db,{intervalMinutes=60,log=()=>{},enabled=true}={}){
 if(!Number.isInteger(intervalMinutes)||intervalMinutes<5||intervalMinutes>1440||typeof log!=='function'||typeof enabled!=='boolean')throw Error('Invalid guardian scheduler options');
 const guardian=new RagKnowledgeGuardian(db);
 let timer=null,closed=false,running=false,last=null;
 const run=()=>{
  if(closed||running)return {skipped:true};
  running=true;
  try{
   const report=guardian.inspect({limit:50});
   last={checkedAt:new Date().toISOString(),summary:report.summary,requiresReview:report.requiresReview};
   try{log({event:'rag:guardian',...last});}catch{}
   return last;
  }finally{running=false;}
 };
 const start=()=>{
  if(!enabled||closed||timer)return;
  timer=setInterval(()=>{try{run();}catch(error){try{log({event:'rag:guardian-error',error:String(error)});}catch{}}},intervalMinutes*60000);
  timer.unref?.();
 };
 const stop=()=>{closed=true;if(timer)clearInterval(timer);timer=null;};
 return {start,stop,run,status:()=>({enabled:enabled&&!closed,running,last})};
}
