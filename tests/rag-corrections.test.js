import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {RagCorrections} from '../src/rag-corrections.js';

test('correction review preserves original evidence and requires source update',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),corrections=new RagCorrections(db);
  index.ingest({id:'file:manual',title:'Manual',text:'Масло: 5W30'});
  const proposal=corrections.propose({sourceId:'file:manual',subject:'Масло',value:'0W20',reason:'Проверить спецификацию'});
  assert.equal(proposal.applied,false);
  assert.equal(corrections.list().length,1);
  const accepted=corrections.review({id:proposal.id,accept:true});
  assert.equal(accepted.status,'accepted');
  assert.equal(accepted.applied,false);
  assert.equal(accepted.sourceUpdateRequired,true);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_facts').get().n,0);
  assert.equal(index.search('5W30').length,1);
  assert.throws(()=>corrections.review({id:proposal.id,accept:false}),/already reviewed/);
 }finally{db.close();}
});

test('corrections reject private chat and missing sources',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),corrections=new RagCorrections(db);
  index.ingest({id:'chat:private',title:'Private',text:'secret'});
  assert.throws(()=>corrections.propose({sourceId:'chat:private',subject:'X',value:'Y',reason:'Z'}));
  assert.throws(()=>corrections.propose({sourceId:'file:missing',subject:'X',value:'Y',reason:'Z'}));
 }finally{db.close();}
});
