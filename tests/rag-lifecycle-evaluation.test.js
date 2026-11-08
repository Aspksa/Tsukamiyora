import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {KnowledgeLifecycle} from '../src/rag-lifecycle.js';
import {evaluateRag,compareRag} from '../src/rag-evaluation.js';

test('extracts supported key-value facts with source evidence and records conflicts',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'file:one',title:'One',text:'Двигатель: дизель\nМасло: 5W30'});
  index.ingest({id:'file:two',title:'Two',text:'Масло: 0W20'});
  const lifecycle=new KnowledgeLifecycle(db);
  assert.equal(lifecycle.extract({sourceId:'file:one'}).created,2);
  assert.equal(lifecycle.extract({sourceId:'file:two'}).conflicts,1);
  const facts=lifecycle.facts({subject:'Масло'});
  assert.equal(facts.length,2);
  assert.ok(facts.every(f=>f.citation.chunkId&&f.evidence.includes('Масло')));
  assert.equal(lifecycle.history({subject:'Масло'}).length,2);
  assert.equal(lifecycle.extract({sourceId:'file:one'}).created,2);
  assert.throws(()=>lifecycle.extract({sourceId:'chat:private'}),/Private/);
 }finally{db.close();}
});

test('evaluation metrics identify retrieval regressions',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'file:engine',title:'Engine',text:'масло двигатель'});
  const cases=[{query:'масло двигатель',expectedSource:'file:engine'}];
  const good=evaluateRag(index,cases,{limit:1,mode:'lexical'});
  assert.equal(good.hitAtK,1);
  assert.equal(good.mrrAtK,1);
  const bad={...good,hitAtK:0,mrrAtK:0};
  assert.equal(compareRag(good,bad).regression,true);
 }finally{db.close();}
});
