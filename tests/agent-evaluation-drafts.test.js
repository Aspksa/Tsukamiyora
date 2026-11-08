import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {createAgentEvaluationDrafts} from '../src/agent-evaluation-drafts.js';
test('drafts are local, deduplicated, reviewed and invalidated when source changes',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'file:a',title:'A',text:'Двигатель моторное масло техническое обслуживание регламент'});
  index.ingest({id:'file:b',title:'B',text:'Шины давление манометр проверка безопасность'});
  const drafts=createAgentEvaluationDrafts(db);
  assert.equal(drafts.generate().created,2);
  assert.equal(drafts.generate().created,0);
  const items=drafts.list();
  assert.equal('query' in items[0],false);
  const first=drafts.detail(items[0].id);
  assert.equal(typeof first.query,'string');
  drafts.review({id:first.id,approve:true});
  assert.equal(drafts.approved().length,1);
  const other=items.find(x=>x.id!==first.id);
  index.ingest({id:other.source_id,title:'Updated',text:'Совершенно другие данные для обновлённого документа'});
  assert.throws(()=>drafts.review({id:other.id,approve:true}),/Source changed/);
  assert.equal(drafts.generate().created,1);
  assert.throws(()=>drafts.review({id:first.id,approve:true}),/not pending/);
 }finally{db.close();}
});
