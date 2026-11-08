import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {RagDeduplicator} from '../src/rag-dedup.js';
import {optimizeRag} from '../src/rag-optimizer.js';

test('near duplicates keep original sources and do not expose chats',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'file:a',title:'A',text:'двигатель масло фильтр'});
  index.ingest({id:'file:b',title:'B',text:'двигатель масло фильтр проверка'});
  index.ingest({id:'chat:secret',title:'Secret',text:'двигатель масло фильтр'});
  const candidates=new RagDeduplicator(db).candidates({threshold:0.7});
  assert.equal(candidates.length,1);
  assert.equal(candidates[0].first.sourceId,'file:a');
  assert.equal(candidates[0].second.sourceId,'file:b');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_sources').get().n,3);
 }finally{db.close();}
});

test('optimization compares actual results and never changes live configuration',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'file:oil',title:'Oil',text:'двигатель масло фильтр'});
  const result=optimizeRag(index,[{query:'двигатель масло',expectedSource:'file:oil'}]);
  assert.equal(result.applied,false);
  assert.equal(result.baseline.hitAtK,1);
  assert.equal(result.candidates.length,3);
  assert.ok(['lexical','adaptive','hybrid'].includes(result.recommendation));
 }finally{db.close();}
});
