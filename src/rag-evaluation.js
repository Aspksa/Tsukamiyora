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
