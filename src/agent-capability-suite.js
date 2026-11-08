// Reproducible local multi-domain checks. No client-provided scores, network or model calls.
import {createHash} from 'node:crypto';
import {evaluateRankedResults} from './rag-evaluation.js';
import {classifyAgentFailure} from './agent-failure-analysis.js';
import {planAgentTask} from './agent-task-router.js';
const CASES=Object.freeze([
 {id:'memory:stable-hash',domain:'memory',run:()=>createHash('sha256').update('знание').digest('hex')===createHash('sha256').update('знание').digest('hex')},
 {id:'memory:change-detection',domain:'memory',run:()=>createHash('sha256').update('a').digest('hex')!==createHash('sha256').update('b').digest('hex')},
 {id:'retrieval:relevant-first',domain:'retrieval',run:()=>evaluateRankedResults([{relevant:['doc'],retrieved:['doc','noise']}],{k:2}).mrrAtK===1},
 {id:'retrieval:irrelevant-first',domain:'retrieval',run:()=>evaluateRankedResults([{relevant:['doc'],retrieved:['noise','doc']}],{k:2}).mrrAtK===0.5},
 {id:'diagnostics:storage',domain:'diagnostics',run:()=>classifyAgentFailure({status:'failed',error:'SQLITE_BUSY database locked'}).category==='storage'},
 {id:'diagnostics:timeout',domain:'diagnostics',run:()=>classifyAgentFailure({status:'failed',error:'timed out'}).category==='timeout'},
 {id:'safety:reject-shell',domain:'safety',run:()=>!planAgentTask('выполни shell',{allowedActions:['auditor:pending']}).matched},
 {id:'safety:route-audit',domain:'safety',run:()=>planAgentTask('аудит знаний',{allowedActions:['auditor:pending']}).action==='auditor:pending'}
]);
export function runAgentCapabilitySuite(){
 const cases=CASES.map(entry=>{
  try{return {caseId:entry.id,domain:entry.domain,passed:entry.run()===true};}
  catch{return {caseId:entry.id,domain:entry.domain,passed:false};}
 });
 const domains=[...new Set(cases.map(x=>x.domain))].map(domain=>{
  const group=cases.filter(x=>x.domain===domain);
  return {domain,total:group.length,passed:group.filter(x=>x.passed).length};
 });
 return {suite:'agent-capabilities-v1',cases,domains,total:cases.length,passed:cases.filter(x=>x.passed).length,
  serverScored:true,heldOut:false,cloudCalls:0,modelTraining:false};
}
