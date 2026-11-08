import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ConversationMemory} from '../src/rag-memory.js';

test('chat append rolls back index when message insert fails',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const memory=new ConversationMemory(db);
  db.exec(`CREATE TRIGGER reject_chat BEFORE INSERT ON rag_messages BEGIN SELECT RAISE(ABORT,'simulated write failure'); END;`);
  assert.throws(()=>memory.append({conversationId:'c',messageId:'m',role:'user',content:'atomicity check'}),/simulated write failure/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_messages').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_chunks').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_sources').get().n,0);
  db.exec('DROP TRIGGER reject_chat');
  const saved=memory.append({conversationId:'c',messageId:'m',role:'user',content:'atomicity check'});
  assert.equal(saved.created,true);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_chunks').get().n,1);
 }finally{db.close();}
});
test('RAG source updates work inside outer transactions',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const memory=new ConversationMemory(db);
  db.exec('BEGIN IMMEDIATE');
  memory.index.ingest({id:'outer',title:'Outer',text:'transactional content'});
  db.exec('ROLLBACK');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_sources').get().n,0);
 }finally{db.close();}
});
