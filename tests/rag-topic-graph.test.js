import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {RagTopicGraph} from '../src/rag-topic-graph.js';

test('thematic graph provides verified source citations and excludes chats',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'file:one',title:'One',text:'двигатель масло фильтр'});
  index.ingest({id:'file:two',title:'Two',text:'двигатель ремень'});
  index.ingest({id:'chat:hidden',title:'Hidden',text:'двигатель секрет'});
  const graph=new RagTopicGraph(db);
  graph.rebuild({sourceId:'file:one'});
  graph.rebuild({sourceId:'file:two'});
  assert.throws(()=>graph.rebuild({sourceId:'chat:hidden'}),/Invalid/);
  const related=graph.related('двигатель');
  assert.equal(related.length,2);
  assert.ok(related.every(r=>r.citation.chunkId&&r.source_id.startsWith('file:')));
  index.ingest({id:'file:one',title:'One',text:'тормозные колодки'});
  graph.rebuild({sourceId:'file:one'});
  assert.equal(graph.related('двигатель').length,1);
 }finally{db.close();}
});
