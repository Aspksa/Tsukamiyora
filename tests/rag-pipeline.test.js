import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { KnowledgeIndex } from '../src/rag.js';
import { RagPipeline } from '../src/rag-pipeline.js';
test('retrieval normalizes, reranks and verifies source citations',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'a',title:'Memory',text:'Память проекта хранит знания и документы'});
  index.ingest({id:'b',title:'Other',text:'Документы содержат отчеты'});
  const pipeline=new RagPipeline(index);
  const result=pipeline.retrieve('ПАМЯТЬ память документы');
  assert.equal(result.rewritten,'память memory документы documents');
  assert.equal(result.results[0].source_id,'a');
  assert.equal(result.modeUsed,'lexical');
  assert.equal(pipeline.verifyCitation(result.results[0].citation),true);
  assert.equal(pipeline.verifyCitation({sourceId:'a',chunkId:'missing'}),false);
  assert.ok(pipeline.context('память документы').context.length>0);
  assert.equal(pipeline.metrics().queries,2);
  assert.throws(()=>pipeline.retrieve('',{}),/Invalid query/);
 }finally{db.close();}
});
