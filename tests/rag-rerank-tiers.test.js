import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {RagPipeline} from '../src/rag-pipeline.js';
import {RagMemoryTiers} from '../src/rag-tiers.js';
import {rerankRag} from '../src/rag-reranker.js';

test('reranker rewards evidence coverage and exposes explanations',()=>{
 const hits=[
  {id:'a',body:'масло',citation:{sourceId:'file:a',chunkId:'a'}},
  {id:'b',body:'масло двигатель фильтр',citation:{sourceId:'file:b',chunkId:'b'}}
 ];
 const ranked=rerankRag('масло двигатель',hits);
 assert.equal(ranked[0].id,'b');
 assert.equal(ranked[0].explanation.matchedTerms,2);
 assert.equal(ranked[0].explanation.sourceVerified,true);
});

test('pipeline returns rerank evidence and retains private chat isolation',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'file:oil',title:'Oil',text:'масло двигатель фильтр'});
  index.ingest({id:'chat:hidden',title:'Hidden',text:'масло двигатель личное'});
  const results=new RagPipeline(index).retrieve('масло двигатель',{limit:5,mode:'lexical'}).results;
  assert.ok(results.some(x=>x.source_id==='file:oil'));
  assert.ok(results.every(x=>!x.source_id.startsWith('chat:')));
  assert.ok(results[0].explanation.coverage>0);
 }finally{db.close();}
});

test('memory tiers persist across instances and never delete sources',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'file:guide',title:'Guide',text:'important guide'});
  new RagMemoryTiers(db).set({sourceId:'file:guide',tier:'longterm',importance:95});
  assert.deepEqual(new RagMemoryTiers(db).get('file:guide').tier,'longterm');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_sources').get().n,1);
  assert.throws(()=>new RagMemoryTiers(db).set({sourceId:'file:guide',tier:'invalid'}));
 }finally{db.close();}
});
