// Evaluate human-labeled queries against existing indexed files without reading their bodies into responses.
import {evaluateRag,compareRag} from './rag-evaluation.js';
export function evaluateLabeledDocuments(index,{cases,limit=5,mode='lexical'}={}){
 if(!index?.db?.prepare||!Array.isArray(cases)||cases.length<2||cases.length>100||
 !Number.isInteger(limit)||limit<1||limit>10||!['lexical','adaptive'].includes(mode))throw Error('Invalid labeled benchmark');
 const seen=new Set();
 const validated=cases.map(entry=>{
  if(typeof entry?.query!=='string'||entry.query.trim().length<2||entry.query.length>250||
   typeof entry.expectedSource!=='string'||!entry.expectedSource.startsWith('file:')||
   entry.expectedSource.length>200||seen.has(entry.query.trim()))throw Error('Invalid labeled case');
  seen.add(entry.query.trim());
  const source=index.db.prepare('SELECT id FROM rag_sources WHERE id=?').get(entry.expectedSource);
  if(!source)throw Error('Expected indexed source not found');
  return {query:entry.query.trim(),expectedSource:entry.expectedSource};
 });
 const result=evaluateRag(index,validated,{limit,mode});
 return {dataset:'user-labeled-indexed-files',mode,limit,total:result.total,
  hitAtK:result.hitAtK,mrrAtK:result.mrrAtK,
  details:result.details.map(row=>({case:row.case,expectedSource:row.expectedSource,rank:row.rank,hit:row.hit})),
  labelsProvidedByUser:true,labelsIndependentlyVerified:false,cloudCalls:0,applied:false};
}
export function compareLabeledDocumentModes(index,{cases,limit=5}={}){
 const lexical=evaluateLabeledDocuments(index,{cases,limit,mode:'lexical'});
 const adaptive=evaluateLabeledDocuments(index,{cases,limit,mode:'adaptive'});
 const comparison=compareRag(lexical,adaptive);
 return {lexical,adaptive,comparison,requiresApproval:true,applied:false};
}
