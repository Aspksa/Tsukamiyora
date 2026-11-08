import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ChatService} from '../src/chat-service.js';

test('chat rejects a second in-flight request with the same message ID',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  let resume;
  const gate=new Promise(resolve=>{resume=resolve;});
  const chat=new ChatService(db,{async *stream(){await gate;yield 'answer';}});
  const input={conversationId:'same',messageId:'request',message:'hello'};
  const first=chat.respond(input);
  const pending=first.next();
  await assert.rejects(chat.respond(input).next(),/already in progress/);
  resume();
  await pending;
  await first.next();
  assert.equal(chat.context.memory.history('same').length,2);
  assert.equal(chat.metrics().completed,1);
 }finally{db.close();}
});

test('chat response pair is rolled back when assistant persistence fails',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const chat=new ChatService(db,{async *stream(){yield 'answer';}});
  db.exec(`CREATE TRIGGER reject_assistant BEFORE INSERT ON rag_messages WHEN NEW.role='assistant' BEGIN SELECT RAISE(ABORT,'assistant write failed'); END;`);
  const stream=chat.respond({conversationId:'atomic',messageId:'request',message:'hello'});
  await assert.rejects(async()=>{for await(const event of stream){}},/assistant write failed/);
  assert.equal(chat.context.memory.history('atomic').length,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_sources').get().n,0);
  assert.equal(chat.metrics().failed,1);
 }finally{db.close();}
});

test('aborted response releases in-flight request guard',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const chat=new ChatService(db,{async *stream(){yield 'first';yield 'second';}});
  const input={conversationId:'cancel',messageId:'id',message:'hello'};
  const first=chat.respond(input);
  assert.equal((await first.next()).value.text,'first');
  await first.return();
  const retry=chat.respond(input);
  const events=[];
  for await(const event of retry)events.push(event);
  assert.equal(events.at(-1).type,'done');
  assert.equal(chat.context.memory.history('cancel').length,2);
 }finally{db.close();}
});
