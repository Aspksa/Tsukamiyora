import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {RagRelationGraph} from '../src/rag-relations.js';
import {RagTopicGraph} from '../src/rag-topic-graph.js';
import {KnowledgeLifecycle} from '../src/rag-lifecycle.js';
import {RagGraphTraversal} from '../src/rag-graph-traversal.js';
import {RagKnowledgeGuardian} from '../src/rag-guardian.js';

test('GraphRAG traverses two explicit hops without exposing private chat relations',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),relations=new RagRelationGraph(db);
  index.ingest({id:'file:a',title:'A',text:'Двигатель -> использует -> Масло'});
  index.ingest({id:'file:b',title:'B',text:'Масло -> имеет -> Вязкость'});
  index.ingest({id:'chat:secret',title:'Private',text:'Вязкость -> секрет -> Пароль'});
  for(const id of ['file:a','file:b'])relations.extract({sourceId:id});
  const result=new RagGraphTraversal(db).traverse('Двигатель',{maxHops:2});
  assert.equal(result.edges.length,2);
  assert.ok(result.nodes.includes('Вязкость'));
  assert.ok(result.edges.every(e=>e.source_id.startsWith('file:')));
  assert.equal(result.remoteCalls,0);
 }finally{db.close();}
});

test('guardian reports conflicts without deleting or modifying evidence',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),lifecycle=new KnowledgeLifecycle(db);
  new RagTopicGraph(db);
  index.ingest({id:'file:a',title:'A',text:'Масло: 5W30'});
  index.ingest({id:'file:b',title:'B',text:'Масло: 0W20'});
  lifecycle.extract({sourceId:'file:a'});
  lifecycle.extract({sourceId:'file:b'});
  const before=db.prepare('SELECT COUNT(*) n FROM rag_evidence').get().n;
  const report=new RagKnowledgeGuardian(db).inspect();
  assert.ok(report.requiresReview);
  assert.ok(report.actions.some(x=>x.kind==='resolve-conflicts'&&x.requiresApproval));
  assert.equal(report.remoteCalls,0);
  assert.equal(report.applied,false);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_evidence').get().n,before);
 }finally{db.close();}
});

test('guardian reports a positive count for source-updated evidence',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),lifecycle=new KnowledgeLifecycle(db);
  new RagTopicGraph(db);
  index.ingest({id:'file:manual',title:'Manual',text:'Масло: 5W30'});
  lifecycle.extract({sourceId:'file:manual'});
  db.prepare("UPDATE rag_sources SET updated_at='2099-01-01 00:00:00' WHERE id='file:manual'").run();
  const report=new RagKnowledgeGuardian(db).inspect();
  const stale=report.actions.find(x=>x.kind==='review-stale-evidence');
  assert.ok(stale);
  assert.ok(stale.count>0);
  assert.equal(stale.requiresApproval,true);
 }finally{db.close();}
});
