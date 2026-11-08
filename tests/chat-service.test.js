import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ChatService } from '../src/chat-service.js';
test('streaming chat uses RAG, saves history only after complete response and avoids repeat calls',async()=>{
 const db=new DatabaseSync(':memory:');let calls=0;
 try{
  const cloud={async *stream(messages){calls++;assert.ok(messages.some(m=>m.content.includes('Память')));yield 'Привет';yield ', мир!';}};
  const chat=new ChatService(db,cloud);
  chat.context.memory.index.ingest({id:'doc1',title:'Память',text:'Память проекта хранится локально'});
  const input={conversationId:'chat-1',messageId:'one',message:'Где хранится память?'};
  const events=[];for await(const e of chat.respond(input))events.push(e);
  assert.equal(events.at(-1).type,'done');
  assert.equal(chat.context.memory.history('chat-1').length,2);
  await assert.rejects(async()=>{for await(const e of chat.respond(input)){}},/already saved/);
  assert.equal(calls,1);
  assert.equal(chat.metrics().completed,1);
 }finally{db.close();}
});
test('failed stream does not persist incomplete assistant response',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const chat=new ChatService(db,{async *stream(){yield 'partial';throw Error('connection lost');}});
  await assert.rejects(async()=>{for await(const e of chat.respond({conversationId:'c',messageId:'m',message:'test'})){}},/connection lost/);
  assert.equal(chat.context.memory.history('c').length,0);
 }finally{db.close();}
});
