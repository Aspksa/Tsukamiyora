import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {KnowledgeLifecycle} from '../src/rag-lifecycle.js';
import {RagConsolidation} from '../src/rag-consolidation.js';

test('fact extraction is idempotent and preserves manually authored facts',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),lifecycle=new KnowledgeLifecycle(db);
  index.ingest({id:'file:oil',title:'Oil',text:'Масло: 5W30'});
  index.fact('Manual','значение','Do not delete','file:oil');
  assert.equal(lifecycle.extract({sourceId:'file:oil'}).created,1);
  const before=lifecycle.history({subject:'Масло'}).length;
  assert.equal(lifecycle.extract({sourceId:'file:oil'}).created,0);
  assert.equal(lifecycle.history({subject:'Масло'}).length,before);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM rag_facts WHERE subject='Manual'").get().n,1);
 }finally{db.close();}
});

test('consolidation links source-backed evidence and excludes private chats',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),lifecycle=new KnowledgeLifecycle(db);
  for(const id of ['file:a','file:b','chat:secret'])index.ingest({id,title:id,text:'Масло: 5W30'});
  lifecycle.extract({sourceId:'file:a'});
  lifecycle.extract({sourceId:'file:b'});
  const groups=new RagConsolidation(db).summarize();
  assert.equal(groups.length,1);
  assert.equal(groups[0].sourceCount,2);
  assert.deepEqual(groups[0].sourceIds.sort(),['file:a','file:b']);
  assert.equal(groups[0].verifiedByIndependentSources,false);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_sources').get().n,3);
 }finally{db.close();}
});
