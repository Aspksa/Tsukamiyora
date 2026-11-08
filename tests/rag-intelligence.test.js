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
