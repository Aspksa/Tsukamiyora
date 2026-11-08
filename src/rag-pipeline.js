// Local retrieval orchestration. No model calls or external network traffic.
import { RagIntelligence } from './rag-intelligence.js';
const words=text=>(text.toLocaleLowerCase('ru').match(/[\p{L}\p{N}]{2,}/gu)||[]);
const unique=items=>[...new Set(items)];
export class RagPipeline {
 constructor(index){this.index=index;this.intelligence=new RagIntelligence(index.db);this.stats={queries:0,hits:0,empty:0,totalMs:0,semanticFallbacks:0,verifiedCitations:0};}
 rewrite(query){
  if(typeof query!=='string'||!query.trim()||query.length>1000||!words(query).length)throw Error('Invalid query');
  return unique(words(query)).slice(0,24).join(' ');
 }
 retrieve(query,{limit=5,mode='adaptive',allowedChatSourceIds=null}={}){
  if(!Number.isInteger(limit)||limit<1||limit>30||!['adaptive','lexical','semantic','hybrid'].includes(mode))throw Error('Invalid retrieval options');
  const start=performance.now(),rewritten=this.rewrite(query);
  const allowed=allowedChatSourceIds instanceof Set?allowedChatSourceIds:new Set();
  const lexical=(mode==='semantic'?[]:this.index.search(rewritten,{limit:Math.min(30,limit*5)})).filter(hit=>!hit.source_id.startsWith('chat:')||allowed.has(hit.source_id));
  const ranked=lexical.map((hit,i)=>{
   const terms=unique(words(query)),body=new Set(words(hit.body));
   const coverage=terms.length?terms.filter(t=>body.has(t)).length/terms.length:0;
   return {...hit,relevance:Math.round(coverage*1000)/1000,rank:i+1};
  }).sort((a,b)=>b.relevance-a.relevance||a.rank-b.rank);
  let selected=ranked.slice(0,limit),modeUsed='lexical';
  if(mode==='semantic'||mode==='hybrid'||(mode==='adaptive'&&(!selected.length||selected[0].relevance<0.25))){
   if(mode==='adaptive')this.stats.semanticFallbacks++;
   this.intelligence.sync({limit:500});
   const semantic=this.intelligence.semantic(query,{limit:Math.min(30,limit*3),excludeChat:false,allowedChatSourceIds:allowed});
   const combined=new Map();
   if(mode!=='semantic')for(const hit of ranked)combined.set(hit.id,{...hit,hybridScore:hit.relevance*0.65+0.35/(hit.rank+1)});
   for(const hit of semantic){
    const old=combined.get(hit.id);
    const relevance=Math.max(old?.relevance??0,hit.similarity);
    combined.set(hit.id,{...hit,...old,relevance,hybridScore:(old?.hybridScore??0)+hit.similarity*0.55});
   }
   selected=[...combined.values()].sort((a,b)=>b.hybridScore-a.hybridScore).slice(0,limit);
   modeUsed=mode==='semantic'?'semantic':'hybrid';
  }
  selected=selected.filter(hit=>(!hit.source_id.startsWith('chat:')||allowed.has(hit.source_id))&&this.verifyCitation(hit.citation));
  this.stats.verifiedCitations+=selected.length;
  const elapsedMs=Math.round((performance.now()-start)*100)/100;
  this.stats.queries++;this.stats.hits+=selected.length;if(!selected.length)this.stats.empty++;this.stats.totalMs+=elapsedMs;
  return {query,rewritten,modeUsed,results:selected,needsReview:selected.length===0||selected[0].relevance<0.25,elapsedMs};
 }
 verifyCitation(citation){
  if(!citation||typeof citation.chunkId!=='string'||typeof citation.sourceId!=='string')return false;
  const row=this.index.db.prepare('SELECT 1 FROM rag_chunks WHERE id=? AND source_id=?').get(citation.chunkId,citation.sourceId);
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
