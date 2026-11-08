import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ChatContext } from '../src/chat-context.js';
test('chat context combines persisted history and verified sources',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const chat=new ChatContext(db);
  chat.memory.append({conversationId:'one',messageId:'1',role:'user',content:'Память проекта содержит документы'});
  chat.memory.append({conversationId:'two',messageId:'1',role:'user',content:'Секрет другой переписки'});
  const result=chat.prepare({conversationId:'one',query:'память документы'});
  assert.equal(result.history.length,1);
  assert.ok(result.context.some(x=>x.source.sourceId.startsWith('chat:')));
  assert.equal(result.modeUsed,'lexical');
  assert.throws(()=>chat.prepare({conversationId:'',query:'память'}),/Invalid conversation/);
 }finally{db.close();}
});
