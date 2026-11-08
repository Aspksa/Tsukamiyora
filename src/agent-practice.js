// Real offline practice tasks using deterministic tools, not model-generated self-assessments.
import {evaluateRankedResults} from './rag-evaluation.js';
import {diagnoseAgents} from './rag-agent-diagnostics.js';
import {assessCloudBudget} from './cloud-budget.js';
import {createHash} from 'node:crypto';
const CASES=Object.freeze([
 {role:'security_engineer',skill:'secret_redaction',taskKey:'practice:secrets:v1',run:()=>{
  const secret='cloud-key-123456';const message='Authorization: Bearer '+secret;
  const redacted=message.replace(/Bearer\s+[^\s]+/gi,'Bearer [REDACTED]');
  return {passed:!redacted.includes(secret),details:{redacted}};
 }},
 {role:'index_engineer',skill:'content_hashing',taskKey:'practice:hash:v1',run:()=>{
  const digest=x=>createHash('sha256').update(x).digest('hex');
  return {passed:digest('same')===digest('same')&&digest('same')!==digest('changed'),details:{algorithm:'sha256'}};
 }},
 {role:'quality_controller',skill:'regression_detection',taskKey:'practice:quality:v1',run:()=>{
  const a=evaluateRankedResults([{relevant:['a'],retrieved:['a','b']}],{k:2});
  const b=evaluateRankedResults([{relevant:['a'],retrieved:['b','a']}],{k:2});
  return {passed:a.mrrAtK>b.mrrAtK&&a.ndcgAtK>b.ndcgAtK,details:{before:a.mrrAtK,after:b.mrrAtK}};
 }},
 {role:'tester',skill:'assertion_validation',taskKey:'practice:assertions:v1',run:()=>{
  const good=[1,2,3];return {passed:good.every((x,i)=>x===i+1)&&good.length===3,details:{assertions:4}};
 }},
 {role:'performance_analyst',skill:'latency_aggregation',taskKey:'practice:latency:v1',run:()=>{
  const d=diagnoseAgents({cloud:{session:{succeeded:2,durationMs:40000}}});
  return {passed:d.observed.avgLatencyMs===20000&&d.alerts.some(x=>x.code==='cloud_latency'),details:{avgLatencyMs:d.observed.avgLatencyMs}};
 }},

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
