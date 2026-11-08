import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {RagIntelligence} from '../src/rag-intelligence.js';
import {RagPipeline} from '../src/rag-pipeline.js';
import {CloudEmbeddings} from '../src/cloud-embeddings.js';

test('document title update does not rebuild unchanged chunks',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'doc',title:'Old',text:'unchanged content'});
  const original=db.prepare('SELECT id FROM rag_chunks').get().id;
  assert.equal(index.ingest({id:'doc',title:'New',text:'unchanged content'}).changed,false);
  assert.equal(db.prepare('SELECT title FROM rag_sources').get().title,'New');
  assert.equal(db.prepare('SELECT id FROM rag_chunks').get().id,original);
 }finally{db.close();}
});

test('duplicate and contradiction diagnostics exclude chat sources',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  for(const id of ['doc-a','doc-b','chat:hidden'])index.ingest({id,title:id,text:'identical text'});
  index.fact('engine','oil','5W30','doc-a');
  index.fact('engine','oil','0W20','doc-b');
  index.fact('private','secret','one','chat:hidden');
  const intelligence=new RagIntelligence(db);
  const duplicates=intelligence.duplicates();
  assert.equal(duplicates.length,1);
  assert.deepEqual(duplicates[0].sourceIds.sort(),['doc-a','doc-b']);
  assert.deepEqual(intelligence.contradictions().map(x=>x.subject),['engine']);
 }finally{db.close();}
});

test('Cloud embeddings cache repeated text without additional requests',async()=>{
 let requests=0;
 const cloud={async request(path,{body}){requests++;assert.equal(path,'/embeddings');assert.equal(body.model,'embed-test');return {data:[{embedding:[0.2,0.4]}]};}};
 const adapter=new CloudEmbeddings(cloud,{model:'embed-test'});
 const first=await adapter.embed('hello');
 first[0]=100;
 assert.deepEqual(await adapter.embed('hello'),[0.2,0.4]);
 assert.equal(requests,1);
 assert.equal(adapter.metrics().cacheHits,1);
});

test('RAG retrieval evaluation measures recall at k on local fixture',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'manual',title:'Manual',text:'двигатель масло замена фильтра'});
  index.ingest({id:'other',title:'Other',text:'колесо шина давление'});
  const pipeline=new RagPipeline(index);
  const cases=[{query:'замена масла',expected:'manual'},{query:'давление шины',expected:'other'}];
  const hits=cases.filter(x=>pipeline.retrieve(x.query,{mode:'lexical',limit:1}).results.some(r=>r.source_id===x.expected)).length;
  assert.equal(hits/cases.length,1);
 }finally{db.close();}
});
