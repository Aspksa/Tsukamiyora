import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {RagIntelligence} from '../src/rag-intelligence.js';
import {KnowledgeLifecycle} from '../src/rag-lifecycle.js';
import {RagTopicGraph} from '../src/rag-topic-graph.js';
import {RagKnowledgeAudit} from '../src/rag-audit.js';

test('audit reports contradictory and unsupported facts without leaking chats',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  new RagIntelligence(db);new KnowledgeLifecycle(db);new RagTopicGraph(db);
  index.ingest({id:'file:a',title:'A',text:'Масло: 5W30'});
  index.ingest({id:'file:b',title:'B',text:'Масло: 0W20'});
  index.ingest({id:'chat:private',title:'Private',text:'Масло: секрет'});
  index.fact('Масло','значение','5W30','file:a');
  index.fact('Масло','значение','0W20','file:b');
  index.fact('Масло','значение','секрет','chat:private');
  const audit=new RagKnowledgeAudit(db).inspect();
  assert.equal(audit.conflicts.length,1);
  assert.equal(audit.conflicts[0].alternatives,2);
  assert.ok(audit.unsupported.every(x=>x.source_id.startsWith('file:')));
  assert.equal(audit.requiresReview,true);
 }finally{db.close();}
});

test('maintenance removes orphaned graph links but retains valid evidence',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  new RagIntelligence(db);new KnowledgeLifecycle(db);
  const graph=new RagTopicGraph(db);
  index.ingest({id:'file:a',title:'A',text:'двигатель масло'});
  graph.rebuild({sourceId:'file:a'});
  const audit=new RagKnowledgeAudit(db);
  assert.equal(audit.maintain().topics,0);
  index.removeSource('file:a');
  assert.ok(audit.maintain().topics>0);
  assert.equal(audit.inspect().danglingTopicLinks,0);
 }finally{db.close();}
});
