import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {RagTopicGraph} from '../src/rag-topic-graph.js';
import {KnowledgeLifecycle} from '../src/rag-lifecycle.js';
import {createGuardianScheduler} from '../src/rag-guardian-scheduler.js';

test('guardian scheduler produces a read-only local report and stops cleanly',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  new RagTopicGraph(db);
  new KnowledgeLifecycle(db);
  index.ingest({id:'file:a',title:'A',text:'двигатель'});
  const before=db.prepare('SELECT COUNT(*) n FROM rag_chunks').get().n;
  const events=[];
  const scheduler=createGuardianScheduler(db,{log:event=>events.push(event),intervalMinutes:5});
  scheduler.start();
  const report=scheduler.run();
  assert.equal(report.requiresReview,false);
  assert.equal(scheduler.status().running,false);
  assert.equal(events[0].event,'rag:guardian');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_chunks').get().n,before);
  scheduler.stop();
  assert.deepEqual(scheduler.run(),{skipped:true});
  assert.equal(scheduler.status().enabled,false);
 }finally{db.close();}
});

test('guardian scheduler rejects unsafe intervals',()=>{
 const db=new DatabaseSync(':memory:');
 try{assert.throws(()=>createGuardianScheduler(db,{intervalMinutes:0}),/Invalid guardian scheduler options/);}
 finally{db.close();}
});

test('guardian discovers consolidation candidates without changing source evidence',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),lifecycle=new KnowledgeLifecycle(db);
  new RagTopicGraph(db);
  for(const id of ['file:a','file:b']){
   index.ingest({id,title:id,text:'Масло: 5W30'});
   lifecycle.extract({sourceId:id});
  }
  const before=db.prepare('SELECT COUNT(*) n FROM rag_evidence').get().n;
  const scheduler=createGuardianScheduler(db);
  const result=scheduler.run();
  assert.equal(result.consolidationCandidates,1);
  assert.equal(result.requiresReview,true);
  assert.equal(result.requiresApproval,true);
  assert.equal(result.remoteCalls,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_evidence').get().n,before);
  scheduler.stop();
 }finally{db.close();}
});
