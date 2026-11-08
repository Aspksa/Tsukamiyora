import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {RagPipeline} from '../src/rag-pipeline.js';
import {ChatService} from '../src/chat-service.js';

test('adaptive RAG refuses invalid lexical-only punctuation queries',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const pipeline=new RagPipeline(new KnowledgeIndex(db));
  assert.throws(()=>pipeline.retrieve('!!!'),/Invalid query/);
  assert.throws(()=>pipeline.retrieve('test',{mode:'graph'}),/Invalid retrieval options/);
 }finally{db.close();}
});
test('chat keeps latest user message under large RAG context and history',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const chat=new ChatService(db,{async *stream(){yield 'ok';}});
  const conversationId='budget-test';
  for(let i=0;i<8;i++)chat.context.memory.append({conversationId,messageId:'history-'+i,role:'user',content:'Старый текст '+i+' '.repeat(3500)});
  chat.context.memory.index.ingest({id:'document',title:'Документ',text:'Контекст '+ 'много '.repeat(600)});
  const message='Контекст: мой новый вопрос?';
  const prepared=chat.prepare({conversationId,messageId:'current',message});
  assert.deepEqual(prepared.messages.at(-1),{role:'user',content:message});
  assert.ok(prepared.messages.reduce((n,m)=>n+m.content.length,0)<=12000);
 }finally{db.close();}
});
