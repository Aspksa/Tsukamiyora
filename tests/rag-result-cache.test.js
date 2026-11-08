import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {RagPipeline} from '../src/rag-pipeline.js';

test('public RAG cache hits and invalidates after local document writes',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),pipeline=new RagPipeline(index);
  index.ingest({id:'file:a',title:'A',text:'двигатель масло'});
  const first=pipeline.retrieve('двигатель',{mode:'lexical'});
  assert.equal(first.cacheHit,false);
  const second=pipeline.retrieve('двигатель',{mode:'lexical'});
  assert.equal(second.cacheHit,true);
  assert.equal(pipeline.metrics().cacheHits,1);
  index.ingest({id:'file:b',title:'B',text:'двигатель фильтр'});
  const third=pipeline.retrieve('двигатель',{mode:'lexical'});
  assert.equal(third.cacheHit,false);
  assert.ok(third.results.some(x=>x.source_id==='file:b'));
 }finally{db.close();}
});

test('chat-scoped retrieval is never stored in public result cache',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),pipeline=new RagPipeline(index);
  index.ingest({id:'chat:private',title:'Private',text:'секретныйкод'});
  const allowed=new Set(['chat:private']);
  const privateResult=pipeline.retrieve('секретныйкод',{mode:'lexical',allowedChatSourceIds:allowed});
  assert.ok(privateResult.results.some(x=>x.source_id==='chat:private'));
  assert.equal(privateResult.cacheHit,false);
  const publicResult=pipeline.retrieve('секретныйкод',{mode:'lexical'});
  assert.ok(publicResult.results.every(x=>!x.source_id.startsWith('chat:')));
  assert.equal(publicResult.cacheHit,false);
 }finally{db.close();}
});

test('semantic retrieval bypasses public lexical cache',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),pipeline=new RagPipeline(index);
  index.ingest({id:'file:manual',title:'Manual',text:'масло двигателя'});
  const first=pipeline.retrieve('масло',{mode:'semantic'});
  const second=pipeline.retrieve('масло',{mode:'semantic'});
  assert.equal(first.cacheHit,false);
  assert.equal(second.cacheHit,false);
 }finally{db.close();}
});

import {createRagResultCache} from '../src/rag-result-cache.js';

test('bounded cache isolates values and evicts least recently used',()=>{
 const cache=createRagResultCache({capacity:2,ttlMs:1000});
 const original={results:[{id:'a'}]};
 cache.set('a',original);original.results[0].id='mutated';
 assert.equal(cache.get('a').results[0].id,'a');
 const copy=cache.get('a');copy.results[0].id='other';
 assert.equal(cache.get('a').results[0].id,'a');
 cache.set('b',2);cache.get('a');cache.set('c',3);
 assert.equal(cache.get('b'),null);
 cache.invalidate();assert.equal(cache.status().size,0);
});

test('bounded cache expires entries',async()=>{
 const cache=createRagResultCache({capacity:1,ttlMs:1});
 cache.set('x',{answer:1});
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(cache.get('x'),null);
 assert.throws(()=>createRagResultCache({capacity:0}),/Invalid RAG cache options/);
});
