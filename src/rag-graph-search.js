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
    const hit=stmt.all(sourceId).find(chunk=>triples.some(edge=>chunk.body.split(/\r?\n/).some(line=>line.trim()===`${edge.subject} -> ${edge.relation} -> ${edge.object}`)));
    if(hit)citations.push({...hit,citation:{sourceId:hit.source_id,chunkId:hit.id,title:hit.title},graphEvidence:true});
   }
  }
  const seen=new Set(),results=[];
  for(const hit of [...lexical.results,...citations]){
   if(seen.has(hit.id)||!this.pipeline.verifyCitation(hit.citation))continue;
   seen.add(hit.id);results.push(hit);
   if(results.length>=limit)break;
  }
  return {query,results,graph:{nodes:graph.nodes,edges:graph.edges},needsReview:!results.length,remoteCalls:0};
 }
}
