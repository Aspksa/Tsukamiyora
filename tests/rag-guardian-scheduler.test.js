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
