import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {RagPipeline} from '../src/rag-pipeline.js';
import {expandMultilingualQuery} from '../src/rag-multilingual.js';

test('technical glossary expands Russian and English without remote translation',()=>{
 assert.match(expandMultilingualQuery('двигатель масло'),/engine/);
 assert.match(expandMultilingualQuery('engine oil'),/двигатель/);
 assert.throws(()=>expandMultilingualQuery(''));
});

test('multilingual retrieval finds English document from Russian query and keeps chat private',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'file:engine',title:'Engine',text:'engine oil filter maintenance'});
  index.ingest({id:'chat:hidden',title:'Hidden',text:'engine oil secret'});
  const result=new RagPipeline(index).retrieve('двигатель масло',{mode:'lexical'});
  assert.ok(result.results.some(r=>r.source_id==='file:engine'));
  assert.ok(result.results.every(r=>!r.source_id.startsWith('chat:')));
 }finally{db.close();}
});
