import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ConversationMemory } from '../src/rag-memory.js';

test('chat memory indexes messages and prevents duplicates',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const memory=new ConversationMemory(db);
  const input={conversationId:'chat1',messageId:'m1',role:'user',content:'Проект хранит долговременную память'};
  const saved=memory.append(input);
   assert.equal(saved.created,true);
  assert.equal(memory.append(input).created,false);
  assert.equal(memory.history('chat1').length,1);
  assert.deepEqual(memory.index.search('долговременную'),[], 'private chats must not appear in public search');
   assert.equal(memory.index.search('долговременную',{allowedChatSourceIds:new Set([saved.sourceId])})[0].source_id,saved.sourceId);
  assert.throws(()=>memory.append({...input,content:'Изменённое сообщение'}),/conflict/);
  assert.throws(()=>memory.history('chat1',{limit:500}),/Invalid/);
 }finally{db.close();}
});
