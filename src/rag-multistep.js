// Bounded, deterministic multi-step retrieval; no external model calls.
import {RagPipeline} from './rag-pipeline.js';
import {planRag} from './rag-planner.js';
const words=s=>(String(s).toLocaleLowerCase('ru').match(/[\p{L}\p{N}]{3,}/gu)||[]);
export class MultiStepRag {
 constructor(index){this.index=index;this.pipeline=new RagPipeline(index);}
 search(query,{limit=5,maxSteps=3}={}){
  if(typeof query!=='string'||!query.trim()||query.length>1000||!Number.isInteger(limit)||limit<1||limit>30||!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>5)throw Error('Invalid multi-step options');
  const plan=planRag(query,{maxSteps});
  const steps=[query];
  for(const item of plan.steps)if(!steps.includes(item.query)&&steps.length<maxSteps)steps.push(item.query);
  const merged=new Map();
  for(const [step,phrase] of steps.entries()){
   const result=this.pipeline.retrieve(phrase,{mode:'adaptive',limit:Math.min(30,limit*3)});
   for(const [rank,hit] of result.results.entries()){
    const previous=merged.get(hit.id);
    const score=1/(60+rank+1);
    if(previous){previous.multistepScore+=score;previous.steps.push(step+1);}
    else merged.set(hit.id,{...hit,multistepScore:score,steps:[step+1]});
   }
  }
  const results=[...merged.values()].filter(hit=>!hit.source_id.startsWith('chat:')&&this.pipeline.verifyCitation(hit.citation))
   .sort((a,b)=>b.multistepScore-a.multistepScore||b.relevance-a.relevance).slice(0,limit);
  return {query,steps,planKind:plan.kind,results,needsReview:!results.length,remoteCalls:0};
 }
}
