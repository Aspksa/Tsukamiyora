// Local retrieval orchestration. No model calls or external network traffic.
import { RagIntelligence } from './rag-intelligence.js';
import { rerankRag } from './rag-reranker.js';
import { expandMultilingualQuery } from './rag-multilingual.js';
const words=text=>(text.toLocaleLowerCase('ru').match(/[\p{L}\p{N}]{2,}/gu)||[]);
const unique=items=>[...new Set(items)];
export class RagPipeline {
 constructor(index){this.index=index;this.intelligence=new RagIntelligence(index.db);this.stats={queries:0,hits:0,empty:0,totalMs:0,semanticFallbacks:0,verifiedCitations:0,correctivePasses:0};}
 rewrite(query){
  if(typeof query!=='string'||!query.trim()||query.length>1000||!words(query).length)throw Error('Invalid query');
  return expandMultilingualQuery(query,{maxTerms:24});
 }
 retrieve(query,{limit=5,mode='adaptive',allowedChatSourceIds=null}={}){
  if(!Number.isInteger(limit)||limit<1||limit>30||!['adaptive','lexical','semantic','hybrid'].includes(mode))throw Error('Invalid retrieval options');
  const start=performance.now(),rewritten=this.rewrite(query);
  const allowed=allowedChatSourceIds instanceof Set?allowedChatSourceIds:new Set();
  let lexical=(mode==='semantic'?[]:this.index.search(rewritten,{limit:Math.min(30,limit*5),allowedChatSourceIds:allowed}));
  // Corrective lexical pass: long queries can be over-specific. Retry with
  // individual high-signal terms and deduplicate by chunk ID, without an LLM.
  if(mode==='adaptive'&&lexical.length===0){
   this.stats.correctivePasses++;
   const candidates=unique(words(query)).sort((a,b)=>b.length-a.length).slice(0,5);
   const merged=new Map();
   for(const term of candidates){
    for(const hit of this.index.search(term,{limit:Math.min(30,limit*3),allowedChatSourceIds:allowed}))if(!merged.has(hit.id))merged.set(hit.id,hit);
   }
   lexical=[...merged.values()].slice(0,Math.min(30,limit*5));
  }
  const ranked=lexical.map((hit,i)=>{
   const terms=unique(words(query)),body=new Set(words(hit.body));
   const coverage=terms.length?terms.filter(t=>body.has(t)).length/terms.length:0;
   return {...hit,relevance:Math.round(coverage*1000)/1000,rank:i+1};
  }).sort((a,b)=>b.relevance-a.relevance||a.rank-b.rank);
  let selected=ranked,modeUsed='lexical';
  if(mode==='semantic'||mode==='hybrid'||(mode==='adaptive'&&(!selected.length||selected[0].relevance<0.25))){
   if(mode==='adaptive')this.stats.semanticFallbacks++;
   this.intelligence.sync({limit:500});
   const semantic=this.intelligence.semantic(query,{limit:Math.min(30,limit*3),excludeChat:false,allowedChatSourceIds:allowed});
   // Reciprocal-rank fusion: lexical and vector scores are not directly comparable.
   const fused=new Map();
   if(mode!=='semantic')ranked.forEach((hit,i)=>fused.set(hit.id,{...hit,hybridScore:1/(60+i+1)}));
   semantic.forEach((hit,i)=>{const previous=fused.get(hit.id);fused.set(hit.id,{...hit,...previous,relevance:Math.max(previous?.relevance??0,hit.similarity),hybridScore:(previous?.hybridScore??0)+1/(60+i+1)});});
   selected=[...fused.values()].sort((a,b)=>b.hybridScore-a.hybridScore||b.relevance-a.relevance);
   modeUsed=mode==='semantic'?'semantic':'hybrid';
  }
  // Verify and rerank the full candidate pool before applying the result limit.
  // Feedback applies only to the same query; cap its influence to avoid
  // overwhelming relevance or allowing feedback to bypass source ACLs.
  const feedback=this.intelligence.feedbackScores(query);
  selected=rerankRag(rewritten,selected.filter(hit=>(!hit.source_id.startsWith('chat:')||allowed.has(hit.source_id))&&this.verifyCitation(hit.citation))
   .map(hit=>({...hit,feedbackBoost:feedback.get(hit.source_id)??0})),{limit});
  this.stats.verifiedCitations+=selected.length;
  const elapsedMs=Math.round((performance.now()-start)*100)/100;
  this.stats.queries++;this.stats.hits+=selected.length;if(!selected.length)this.stats.empty++;this.stats.totalMs+=elapsedMs;
  return {query,rewritten,modeUsed,results:selected,needsReview:selected.length===0||selected[0].rerankScore<0.15,elapsedMs};
 }
 verifyCitation(citation){
  if(!citation||typeof citation.chunkId!=='string'||typeof citation.sourceId!=='string')return false;
  const row=this.index.db.prepare('SELECT 1 FROM rag_chunks c JOIN rag_sources s ON s.id=c.source_id WHERE c.id=? AND c.source_id=?').get(citation.chunkId,citation.sourceId);
  return Boolean(row);
 }
 context(query,{limit=5,maxChars=4000}={}){
  if(!Number.isInteger(maxChars)||maxChars<200||maxChars>16000)throw Error('Invalid context size');
  const retrieval=this.retrieve(query,{limit});
  const seen=new Set();let remaining=maxChars;
  const context=[];
  for(const hit of retrieval.results){
   if(remaining===0)break;
   const key=hit.body.trim();if(seen.has(key)||!this.verifyCitation(hit.citation))continue;
   seen.add(key);const text=hit.body.slice(0,remaining);remaining-=text.length;
   context.push({source:hit.citation,text,relevance:hit.relevance});
  }
  return {...retrieval,context};
 }
 metrics(){return {...this.stats,averageMs:this.stats.queries?Math.round(this.stats.totalMs/this.stats.queries*100)/100:0};}
}
