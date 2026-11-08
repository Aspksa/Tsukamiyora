// Graph-aware search merges explicit relation provenance with ordinary RAG hits.
// No inference, remote calls or private chat traversal.
import {RagPipeline} from './rag-pipeline.js';
import {RagGraphTraversal} from './rag-graph-traversal.js';
import {RagRelationGraph} from './rag-relations.js';
export class GraphAwareRag {
 constructor(index){this.index=index;this.pipeline=new RagPipeline(index);new RagRelationGraph(index.db);this.graph=new RagGraphTraversal(index.db);}
 retrieve(query,{limit=5,maxHops=2}={}){
  if(typeof query!=='string'||!query.trim()||query.length>200||!Number.isInteger(limit)||limit<1||limit>30||!Number.isInteger(maxHops)||maxHops<1||maxHops>3)throw Error('Invalid graph retrieval');
  const lexical=this.pipeline.retrieve(query,{limit,mode:'adaptive'});
  const graph=this.graph.traverse(query.trim(),{maxHops,limit:Math.min(100,limit*5)});
  const sources=[...new Set(graph.edges.map(edge=>edge.source_id))];
  const citations=[];
  if(sources.length){
   const stmt=this.index.db.prepare(`SELECT c.id,c.source_id,c.body,s.title FROM rag_chunks c JOIN rag_sources s ON s.id=c.source_id
    WHERE c.source_id=? ORDER BY c.position LIMIT 500`);
   for(const sourceId of sources){
    const triples=graph.edges.filter(edge=>edge.source_id===sourceId);
    const hit=stmt.all(sourceId).find(chunk=>triples.some(edge=>chunk.body.split(/\r?\n/).some(line=>{
     const match=/^\s*([^\n>]{2,100})\s*->\s*([^\n>]{2,100})\s*->\s*([^\n>]{2,100})\s*$/.exec(line);
     return match&&match[1].trim()===edge.subject&&match[2].trim()===edge.relation&&match[3].trim()===edge.object;
    })));
    if(hit)citations.push({...hit,citation:{sourceId:hit.source_id,chunkId:hit.id,title:hit.title},graphEvidence:true});
   }
  }
  const seen=new Map(),results=[];
  // Reserve space for grounded graph evidence when lexical hits fill the limit.
  // Lexical hits retain priority, but a second-hop source must remain discoverable.
  const graphOnly=citations.filter(hit=>!lexical.results.some(item=>item.id===hit.id));
  const lexicalSlots=graphOnly.length?Math.max(0,limit-1):limit;
  for(const hit of lexical.results.slice(0,lexicalSlots)){
   if(!this.pipeline.verifyCitation(hit.citation)||seen.has(hit.id))continue;
   const item={...hit};seen.set(hit.id,item);results.push(item);
  }
  for(const hit of citations){
   if(!this.pipeline.verifyCitation(hit.citation))continue;
   const existing=seen.get(hit.id);
   if(existing){existing.graphEvidence=true;continue;}
   if(results.length>=limit)continue;
   const item={...hit};seen.set(hit.id,item);results.push(item);
  }
  for(const hit of lexical.results.slice(lexicalSlots)){
   if(results.length>=limit)break;
   if(!seen.has(hit.id)&&this.pipeline.verifyCitation(hit.citation)){
    const item={...hit};seen.set(hit.id,item);results.push(item);
   }
  }
  return {query,results,graph:{nodes:graph.nodes,edges:graph.edges},needsReview:!results.length,remoteCalls:0};
 }
}
