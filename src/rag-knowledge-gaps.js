// Local knowledge gaps: recommendations only, no autonomous remote queries.
import {RagPipeline} from './rag-pipeline.js';
export class RagKnowledgeGaps {
 constructor(index){this.pipeline=new RagPipeline(index);}
 inspect(queries,{limit=20}={}){
  if(!Array.isArray(queries)||queries.length<1||queries.length>100||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid knowledge gap input');
  const gaps=[];
  for(const query of queries){
   if(typeof query!=='string'||!query.trim()||query.length>1000)throw Error('Invalid knowledge gap query');
   const result=this.pipeline.retrieve(query,{limit:3,mode:'adaptive'});
   if(result.needsReview)gaps.push({query,reason:result.results.length?'low-confidence-evidence':'no-evidence',suggestedAction:'review-or-add-source',sourceIds:result.results.map(x=>x.source_id)});
   if(gaps.length>=limit)break;
  }
  return {checked:queries.length,gaps,remoteCalls:0,applied:false};
 }
}
