import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {RagRelationGraph} from '../src/rag-relations.js';
import {GraphAwareRag} from '../src/rag-graph-search.js';

test('graph-aware search returns grounded linked documents with citations',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),relations=new RagRelationGraph(db);
  index.ingest({id:'file:a',title:'A',text:'Двигатель -> использует -> Масло'});
  index.ingest({id:'file:b',title:'B',text:'Масло -> имеет -> Вязкость'});
  index.ingest({id:'chat:secret',title:'Private',text:'Двигатель секрет'});
  relations.extract({sourceId:'file:a'});
  relations.extract({sourceId:'file:b'});
  const result=new GraphAwareRag(index).retrieve('Двигатель',{maxHops:2,limit:5});
  assert.equal(result.graph.edges.length,2);
  assert.ok(result.results.some(x=>x.source_id==='file:b'));
  assert.ok(result.results.every(x=>x.citation?.sourceId===x.source_id));
  assert.ok(result.results.every(x=>!x.source_id.startsWith('chat:')));
  assert.equal(result.remoteCalls,0);
 }finally{db.close();}
});

test('graph citations point to a chunk containing the explicit relation',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),relations=new RagRelationGraph(db);
  const filler='пустой '.repeat(40);
  index.ingest({id:'file:long',title:'Long',text:filler+'\nДвигатель -> использует -> Масло',chunkSize:200});
  relations.extract({sourceId:'file:long'});
  const result=new GraphAwareRag(index).retrieve('Двигатель',{limit:5});
  const graphHit=result.results.find(x=>x.graphEvidence);
  assert.ok(graphHit);
  assert.match(graphHit.body,/Двигатель -> использует -> Масло/);
  assert.equal(graphHit.citation.chunkId,graphHit.id);
 }finally{db.close();}
});

test('reindex invalidates obsolete graph edges and graph retrieval',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),relations=new RagRelationGraph(db);
  index.ingest({id:'file:changing',title:'Changing',text:'Двигатель -> использует -> Масло'});
  relations.extract({sourceId:'file:changing'});
  assert.equal(new GraphAwareRag(index).retrieve('Двигатель').graph.edges.length,1);
  index.ingest({id:'file:changing',title:'Changing',text:'Совершенно другой документ'});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_extracted_relations WHERE source_id=?').get('file:changing').n,0);
  assert.equal(new GraphAwareRag(index).retrieve('Двигатель').graph.edges.length,0);
 }finally{db.close();}
});

test('graph evidence survives when lexical results fill the result limit',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),relations=new RagRelationGraph(db);
  index.ingest({id:'file:a',title:'A',text:'Двигатель -> использует -> Масло'});
  index.ingest({id:'file:b',title:'B',text:'Масло -> имеет -> Вязкость'});
  index.ingest({id:'file:c',title:'C',text:'Двигатель проверка обслуживание'});
  relations.extract({sourceId:'file:a'});
  relations.extract({sourceId:'file:b'});
  const result=new GraphAwareRag(index).retrieve('Двигатель',{limit:2,maxHops:2});
  assert.equal(result.results.length,2);
  assert.ok(result.results.some(hit=>hit.graphEvidence));
  assert.ok(result.results.every(hit=>hit.citation?.chunkId===hit.id));
 }finally{db.close();}
});

test('graph citation accepts flexible spacing in explicit relations',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),relations=new RagRelationGraph(db);
  index.ingest({id:'file:spaced',title:'Spaced',text:'Двигатель->  использует  ->Масло'});
  relations.extract({sourceId:'file:spaced'});
  const result=new GraphAwareRag(index).retrieve('Двигатель',{limit:5});
  assert.equal(result.graph.edges.length,1);
  assert.ok(result.results.some(hit=>hit.graphEvidence&&hit.source_id==='file:spaced'));
 }finally{db.close();}
});

test('removing a document removes its extracted graph relations',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),relations=new RagRelationGraph(db);
  index.ingest({id:'file:obsolete',title:'Obsolete',text:'Двигатель -> использует -> Масло'});
  relations.extract({sourceId:'file:obsolete'});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_extracted_relations').get().n,1);
  assert.equal(index.removeSource('file:obsolete'),true);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_extracted_relations').get().n,0);
  assert.equal(new GraphAwareRag(index).retrieve('Двигатель').graph.edges.length,0);
 }finally{db.close();}
});
