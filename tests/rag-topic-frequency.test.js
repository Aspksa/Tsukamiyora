import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {RagTopicGraph} from '../src/rag-topic-graph.js';
import {ContextualRag} from '../src/rag-contextual.js';

test('topic selection prefers repeated important terms over alphabetically first noise',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),graph=new RagTopicGraph(db);
  const noise=Array.from({length:40},(_,i)=>'ааа'+String(i).padStart(3,'0')).join(' ');
  index.ingest({id:'file:topic',title:'Topic',text:noise+' двигатель двигатель двигатель'});
  graph.rebuild({sourceId:'file:topic'});
  assert.equal(graph.related('двигатель').length,1);
 }finally{db.close();}
});

test('contextual search rejects zero history limit with explicit error',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  assert.throws(()=>new ContextualRag(index).retrieve({conversationId:'a',query:'масло',historyLimit:0}),/Invalid contextual retrieval/);
 }finally{db.close();}
});
