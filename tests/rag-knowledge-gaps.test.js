import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {RagKnowledgeGaps} from '../src/rag-knowledge-gaps.js';

test('knowledge gap detector never exposes private chat content',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'chat:private',title:'Private',text:'секретныйкод пароль'});
  const result=new RagKnowledgeGaps(index).inspect(['секретныйкод']);
  assert.equal(result.gaps.length,1);
  assert.equal(result.gaps[0].reason,'no-evidence');
  assert.deepEqual(result.gaps[0].sourceIds,[]);
  assert.equal(result.remoteCalls,0);
  assert.equal(result.applied,false);
 }finally{db.close();}
});
