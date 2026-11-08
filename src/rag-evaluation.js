// Deterministic local retrieval benchmark, no model or network required.
import {RagPipeline} from './rag-pipeline.js';
export const RAG_EVAL_CASES=Object.freeze([
 {query:'масло двигатель',expectedSource:'file:engine'},
 {query:'давление шины',expectedSource:'file:tires'},
 {query:'резервное копирование',expectedSource:'file:backup'},
 {query:'поиск по документам',expectedSource:'file:search'}
]);
export function evaluateRag(index,cases,{limit=5,mode='adaptive'}={}){
 if(!Array.isArray(cases)||!cases.length||cases.length>1000||!Number.isInteger(limit)||limit<1||limit>30)throw Error('Invalid evaluation');
 const pipeline=new RagPipeline(index);let hits=0,reciprocalRanks=0;
 const details=cases.map((entry,i)=>{
  if(typeof entry?.query!=='string'||typeof entry.expectedSource!=='string'||!entry.expectedSource.trim())throw Error('Invalid evaluation case');
  const response=pipeline.retrieve(entry.query,{limit,mode});
  const rank=response.results.findIndex(r=>r.source_id===entry.expectedSource)+1;
  if(rank)hits++;reciprocalRanks+=rank?1/rank:0;
  return {case:i+1,query:entry.query,expectedSource:entry.expectedSource,rank,hit:rank>0};
 });
 return {total:cases.length,hitAtK:hits/cases.length,mrrAtK:reciprocalRanks/cases.length,limit,mode,details};
}
export function compareRag(before,after){
 if(!before||!after||before.total!==after.total||before.limit!==after.limit)throw Error('Incompatible evaluations');
 return {hitAtKDelta:after.hitAtK-before.hitAtK,mrrAtKDelta:after.mrrAtK-before.mrrAtK,regression:after.hitAtK<before.hitAtK||after.mrrAtK<before.mrrAtK};
}

/** Ranking metrics for multiple relevant sources; independent of the RAG pipeline. */
export function evaluateRankedResults(cases,{k=5}={}){
 if(!Array.isArray(cases)||!Number.isInteger(k)||k<1||k>100)throw Error('Invalid ranked evaluation');
 const details=[];
 for(const entry of cases){
  if(!entry||!Array.isArray(entry.relevant)||!Array.isArray(entry.retrieved)||!entry.relevant.every(x=>typeof x==='string')||!entry.retrieved.every(x=>typeof x==='string'))throw Error('Invalid ranked evaluation case');
  const relevant=new Set(entry.relevant);
  if(!relevant.size)continue;
  const ids=[...new Set(entry.retrieved)].slice(0,k);
  const hits=ids.map(id=>Number(relevant.has(id)));
  const found=hits.reduce((a,b)=>a+b,0),first=hits.indexOf(1);
  const dcg=hits.reduce((sum,hit,i)=>sum+hit/Math.log2(i+2),0);
  const ideal=Array.from({length:Math.min(k,relevant.size)},(_,i)=>1/Math.log2(i+2)).reduce((a,b)=>a+b,0);
  details.push({recall:found/relevant.size,precision:found/k,mrr:first===-1?0:1/(first+1),ndcg:dcg/ideal});
 }
 const mean=key=>details.length?details.reduce((sum,row)=>sum+row[key],0)/details.length:0;
 return {cases:details.length,k,recallAtK:mean('recall'),precisionAtK:mean('precision'),mrrAtK:mean('mrr'),ndcgAtK:mean('ndcg'),details};
}
export function proposeRagPromotion(baseline,candidate,{minimumNdcgGain=0,maximumRecallLoss=0}={}){
 if(!baseline||!candidate||baseline.cases!==candidate.cases||baseline.k!==candidate.k||baseline.cases<1||!Number.isFinite(minimumNdcgGain)||minimumNdcgGain<0||!Number.isFinite(maximumRecallLoss)||maximumRecallLoss<0)throw Error('Invalid RAG promotion comparison');
 const ndcgGain=candidate.ndcgAtK-baseline.ndcgAtK;
 const recallLoss=baseline.recallAtK-candidate.recallAtK;
 return {eligible:ndcgGain>=minimumNdcgGain&&recallLoss<=maximumRecallLoss,ndcgGain,recallLoss,requiresApproval:true,applied:false};
}
