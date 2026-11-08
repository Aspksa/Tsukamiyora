import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {RagIntelligence} from '../src/rag-intelligence.js';
import {RagPipeline} from '../src/rag-pipeline.js';

test('local semantic indexing, hybrid retrieval and citation integrity',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),intel=new RagIntelligence(db);
  index.ingest({id:'doc-1',title:'Механика',text:'Двигатель автомобиль масло техническое обслуживание'});
  assert.equal(intel.sync().indexed,1);
  assert.equal(intel.sync().indexed,0);
  const hits=intel.semantic('двигатель масло');
  assert.equal(hits[0].citation.sourceId,'doc-1');
  const result=new RagPipeline(index).retrieve('двигатель масло',{mode:'hybrid'});
  assert.ok(result.results.length);
  assert.equal(result.modeUsed,'hybrid');
  assert.equal(new RagPipeline(index).verifyCitation(result.results[0].citation),true);
 }finally{db.close();}
});
test('temporal facts, conflicts, graph and feedback',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),intel=new RagIntelligence(db);
  index.ingest({id:'source-1',title:'Документ',text:'Статус проекта'});
  index.relate('Tsukamiyora','использует','SQLite','source-1');
  assert.equal(intel.graph('Tsukamiyora').length,1);
  assert.equal(intel.recordFact({subject:'проект',predicate:'статус',value:'alpha',sourceId:'source-1'}).created,true);
  assert.equal(intel.recordFact({subject:'проект',predicate:'статус',value:'beta',sourceId:'source-1'}).conflicts.length,1);
  assert.equal(intel.rate({query:'статус проекта',sourceId:'source-1',helpful:true}).ok,true);
  assert.equal(intel.metrics().factEvents,2);
 }finally{db.close();}
});

test('vector model version and dimensions trigger safe reindex',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'doc',title:'Document',text:'память память память система'});
  const first=new RagIntelligence(db,{dimensions:128});
  assert.equal(first.sync().indexed,1);
  assert.equal(new RagIntelligence(db,{dimensions:128}).sync().indexed,0);
  const upgraded=new RagIntelligence(db,{dimensions:256});
  assert.equal(upgraded.sync().indexed,1);
  assert.equal(upgraded.semantic('память')[0].source_id,'doc');
  assert.throws(()=>new RagIntelligence(db,{dimensions:0}),/Invalid vector dimensions/);
 }finally{db.close();}
});
test('RAG feedback cannot reference a nonexistent source',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  new KnowledgeIndex(db);
  const intel=new RagIntelligence(db);
  assert.throws(()=>intel.rate({query:'hello',sourceId:'missing',helpful:true}),/Source not found/);
  assert.equal(intel.metrics().ratings,0);
 }finally{db.close();}
});

test('adaptive corrective retrieval retries sparse terms without model calls',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'repair',title:'Maintenance',text:'автомобиль двигатель масло ремонт'});
  const originalSearch=index.search.bind(index);
  index.search=(query,options)=>query.includes('несуществующийтермин')?[]:originalSearch(query,options);
  const pipeline=new RagPipeline(index);
  const result=pipeline.retrieve('несуществующийтермин двигатель',{mode:'adaptive'});
  assert.ok(result.results.some(x=>x.source_id==='repair'));
  assert.equal(pipeline.metrics().correctivePasses,1);
  assert.ok(result.results.every(x=>pipeline.verifyCitation(x.citation)));
 }finally{db.close();}
});

test('hybrid rank fusion prefers documents supported by both retrievers',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'shared',title:'Shared',text:'автомобиль двигатель масло обслуживание'});
  index.ingest({id:'lexical',title:'Lexical',text:'двигатель инструкция руководство'});
  const pipeline=new RagPipeline(index);
  const hybrid=pipeline.retrieve('двигатель масло',{mode:'hybrid',limit:5});
  assert.equal(hybrid.modeUsed,'hybrid');
  assert.ok(hybrid.results.some(x=>x.source_id==='shared'));
  assert.ok(hybrid.results.every(x=>Number.isFinite(x.hybridScore)));
  assert.ok(hybrid.results.every(x=>pipeline.verifyCitation(x.citation)));
 }finally{db.close();}
});

test('feedback reranking stays bounded and query-specific',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'a',title:'A',text:'масло двигатель автомобиль'});
  index.ingest({id:'b',title:'B',text:'масло двигатель руководство'});
  const pipeline=new RagPipeline(index);
  const before=pipeline.retrieve('масло двигатель',{mode:'lexical',limit:2});
  for(let i=0;i<20;i++)pipeline.intelligence.rate({query:'масло двигатель',sourceId:'b',helpful:true});
  const after=pipeline.retrieve('масло двигатель',{mode:'lexical',limit:2});
  assert.equal(after.results.length,2);
  assert.ok(after.results.every(r=>Math.abs(r.feedbackBoost)<=0.01));
  assert.ok(after.results.find(r=>r.source_id==='b').feedbackBoost>0);
  assert.equal(pipeline.intelligence.feedbackScores('другой запрос').size,0);
  assert.ok(before.results.every(r=>pipeline.verifyCitation(r.citation)));
 }finally{db.close();}
});
