// Explicit opt-in hybrid retrieval. No implicit uploads or index sync.
import {RagPipeline} from './rag-pipeline.js';
import {NeuralRag} from './rag-neural.js';
export class HybridNeuralRag {
 constructor(index,cloud,{model}={}){
  this.pipeline=new RagPipeline(index);
  this.neural=new NeuralRag(index.db,cloud,{model});
 }
 async retrieve(query,{limit=5,neuralLimit=20,lexicalLimit=20}={}){
  if(!Number.isInteger(limit)||limit<1||limit>30||!Number.isInteger(neuralLimit)||neuralLimit<1||neuralLimit>30||!Number.isInteger(lexicalLimit)||lexicalLimit<1||lexicalLimit>30)throw Error('Invalid hybrid options');
  // NeuralRag searches only public documents. Keep this path public-only.
  const lexical=this.pipeline.retrieve(query,{mode:'lexical',limit:lexicalLimit}).results.filter(x=>!x.source_id.startsWith('chat:'));
  const neural=await this.neural.search(query,{limit:neuralLimit});
  const fused=new Map();
  for(const [rank,hit] of lexical.entries())fused.set(hit.id,{...hit,hybridScore:1/(60+rank+1),retrievers:['lexical']});
  for(const [rank,hit] of neural.entries()){
   const previous=fused.get(hit.id);
   if(previous){previous.hybridScore+=1/(60+rank+1);previous.retrievers.push('neural');}
   else fused.set(hit.id,{...hit,relevance:hit.similarity,hybridScore:1/(60+rank+1),retrievers:['neural']});
  }
  const results=[...fused.values()]
   .filter(hit=>!hit.source_id.startsWith('chat:')&&this.pipeline.verifyCitation(hit.citation))
   .sort((a,b)=>b.hybridScore-a.hybridScore||b.relevance-a.relevance)
   .slice(0,limit);
  return {query,modeUsed:'hybrid-neural',results,needsReview:results.length===0};
 }
}
