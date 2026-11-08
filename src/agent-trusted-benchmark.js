// Trusted local benchmark: cases and scoring live in server code, not client-submitted scores.
import {evaluateRankedResults} from './rag-evaluation.js';
const BENCHMARK=Object.freeze([
 {caseId:'rank:1',relevant:['a'],retrieved:['a','b','c']},
 {caseId:'rank:2',relevant:['b'],retrieved:['a','b','c']},
 {caseId:'rank:3',relevant:['c'],retrieved:['c','a','b']},
 {caseId:'rank:4',relevant:['a','c'],retrieved:['a','b','c']},
 {caseId:'rank:5',relevant:['b','c'],retrieved:['b','a','c']},
 {caseId:'rank:6',relevant:['a'],retrieved:['c','b','a']}
]);
function rerank(ids,strategy){
 if(strategy==='original')return ids;
 if(strategy==='reverse')return [...ids].reverse();
 if(strategy==='alphabetical')return [...ids].sort();
 throw Error('Unsupported benchmark strategy');
}
export function runTrustedAgentBenchmark(strategy){
 if(!['original','reverse','alphabetical'].includes(strategy))throw Error('Unsupported benchmark strategy');
 const cases=BENCHMARK.map(entry=>{
  const ranking=rerank(entry.retrieved,strategy);
  const score=evaluateRankedResults([{relevant:entry.relevant,retrieved:ranking}],{k:3});
  return {caseId:entry.caseId,score:score.ndcgAtK};
 });
 return {benchmarkId:'ranked-results-v1',strategy,cases,source:'server-owned-fixed-cases',cloudCalls:0};
}
export function compareTrustedStrategies(baselineStrategy,candidateStrategy){
 const before=runTrustedAgentBenchmark(baselineStrategy);
 const after=runTrustedAgentBenchmark(candidateStrategy);
 const mean=rows=>rows.reduce((s,x)=>s+x.score,0)/rows.length;
 const regressions=before.cases.filter((entry,i)=>after.cases[i].score<entry.score-1e-12).map((entry,i)=>({caseId:entry.caseId}));
 return {benchmarkId:before.benchmarkId,baselineStrategy,candidateStrategy,cases:before.cases.length,
  baselineScore:mean(before.cases),candidateScore:mean(after.cases),regressions,
  eligible:mean(after.cases)>mean(before.cases)+1e-12&&regressions.length===0,
  requiresApproval:true,applied:false,serverScored:true,
  limitations:'Fixed public benchmark is not a held-out test and does not establish general agent competence'};
}
