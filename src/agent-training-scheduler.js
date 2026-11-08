// Bounded, local-only training scheduler. Never invokes Cloud.ru or modifies skill versions.
import {availableAgentPractice,runAgentPractice} from './agent-practice.js';
export function createAgentTrainingScheduler(academy,{intervalMs=6*60*60*1000,log=()=>{}}={}){
 if(!academy?.record||!academy?.history||!Number.isInteger(intervalMs)||intervalMs<60000||typeof log!=='function')throw Error('Invalid training scheduler');
 let timer=null,running=false,lastRun=null,lastResults=[];
 const run=()=>{
  if(running)return {busy:true};
  running=true;const results=[];
  try{
   for(const task of availableAgentPractice()){
    try{
     const previous=academy.history({role:task.role,limit:100}).some(x=>x.task_key===task.taskKey);
     if(previous){results.push({role:task.role,status:'already_trained'});continue;}
     const evaluation=runAgentPractice(task.role);
     const saved=academy.record(evaluation);
     results.push({role:task.role,status:saved.recorded?'completed':'already_trained',passed:saved.passed});
    }catch(error){results.push({role:task.role,status:'failed'});log({event:'agent:training-failed',role:task.role,error:String(error)});}
   }
   lastRun=new Date().toISOString();lastResults=results;
   return {busy:false,lastRun,results};
  }finally{running=false;}
 };
 const start=()=>{
  if(timer)return false;
  timer=setInterval(()=>{try{run();}catch(error){log({event:'agent:training-error',error:String(error)});}},intervalMs);
  timer.unref?.();
  return true;
 };
 const stop=()=>{if(timer)clearInterval(timer);timer=null;};
 const status=()=>({running,scheduled:!!timer,intervalMs,lastRun,lastResults,rolesWithPractice:availableAgentPractice().length,cloudCalls:0});
 return {run,start,stop,status};
}
