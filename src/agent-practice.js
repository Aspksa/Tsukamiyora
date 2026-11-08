// Real offline practice tasks using deterministic tools, not model-generated self-assessments.
import {evaluateRankedResults} from './rag-evaluation.js';
import {diagnoseAgents} from './rag-agent-diagnostics.js';
import {assessCloudBudget} from './cloud-budget.js';
const CASES=Object.freeze([
 {role:'rag_evaluator',skill:'retrieval_metrics',taskKey:'practice:retrieval:v1',run:()=>{
  const result=evaluateRankedResults([{relevant:['a','b'],retrieved:['a','c','b']}],{k:3});
  return {passed:result.recallAtK===1&&result.mrrAtK===1&&result.ndcgAtK>0.9,details:{recall:result.recallAtK,mrr:result.mrrAtK,ndcg:result.ndcgAtK}};
 }},
 {role:'diagnostician',skill:'incident_detection',taskKey:'practice:diagnostics:v1',run:()=>{
  const result=diagnoseAgents({activity:[{outcome:'failed'},{outcome:'failed'},{outcome:'failed'}],queue:{pending:25}});
  return {passed:result.alerts.some(a=>a.code==='agent_failures')&&result.alerts.some(a=>a.code==='agent_queue_backlog'),details:{alerts:result.alerts.map(a=>a.code)}};
 }},
 {role:'cloud_economist',skill:'budget_monitoring',taskKey:'practice:cloud-budget:v1',run:()=>{
  const result=assessCloudBudget({requests:101,promptTokens:10,completionTokens:5},{maxRequests:100,maxTokens:1000});
  return {passed:result.status==='exceeded'&&result.advisoryOnly,details:{status:result.status}};
 }}
]);
export function availableAgentPractice(){return CASES.map(({role,skill,taskKey})=>({role,skill,taskKey}));}
export function runAgentPractice(role){
 const entry=CASES.find(x=>x.role===role);
 if(!entry)throw Error('No practice for role');
 const result=entry.run();
 return {role:entry.role,skill:entry.skill,taskKey:entry.taskKey,score:Number(result.passed),evidence:JSON.stringify(result.details).slice(0,2000),passed:result.passed};
}
