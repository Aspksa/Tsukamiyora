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
