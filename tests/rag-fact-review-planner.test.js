import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {KnowledgeLifecycle} from '../src/rag-lifecycle.js';
import {RagFactReview} from '../src/rag-fact-review.js';
import {planRag} from '../src/rag-planner.js';
import {MultiStepRag} from '../src/rag-multistep.js';

test('fact review flags conflicts and preserves citations without overwriting facts',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),lifecycle=new KnowledgeLifecycle(db);
  index.ingest({id:'file:a',title:'A',text:'Масло: 5W30'});
  index.ingest({id:'file:b',title:'B',text:'Масло: 0W20'});
  lifecycle.extract({sourceId:'file:a'});
  lifecycle.extract({sourceId:'file:b'});
  const result=new RagFactReview(db).inspect();
  assert.equal(result.length,1);
  assert.equal(result[0].conflicting,true);
  assert.equal(result[0].alternatives.length,2);
  assert.ok(result[0].alternatives.every(a=>a.citations.length===1));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_evidence').get().n,2);
 }finally{db.close();}
});

test('query planner splits bounded steps without remote requests',()=>{
 const plan=planRag('сравни масло и двигатель',{maxSteps:2});
 assert.equal(plan.kind,'comparison');
 assert.equal(plan.steps.length,2);
 assert.equal(plan.remoteCalls,0);
 assert.equal(plan.applied,false);
 assert.throws(()=>planRag('x',{maxSteps:100}));
});

test('multi-step retrieval executes planned subqueries without private chat leakage',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'file:engine',title:'Engine',text:'двигатель диагностика'});
  index.ingest({id:'chat:secret',title:'Private',text:'двигатель секрет'});
  const result=new MultiStepRag(index).search('сравни двигатель и диагностика',{maxSteps:3});
  assert.equal(result.planKind,'comparison');
  assert.equal(result.remoteCalls,0);
  assert.ok(result.results.some(x=>x.source_id==='file:engine'));
  assert.ok(result.results.every(x=>!x.source_id.startsWith('chat:')));
 }finally{db.close();}
});
