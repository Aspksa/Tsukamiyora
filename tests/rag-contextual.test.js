import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {ConversationMemory} from '../src/rag-memory.js';
import {ContextualRag} from '../src/rag-contextual.js';

test('contextual RAG reads only current conversation history',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),memory=new ConversationMemory(db);
  index.ingest({id:'file:oil',title:'Oil',text:'двигатель масло'});
  memory.append({conversationId:'allowed',messageId:'1',role:'user',content:'двигатель'});
  memory.append({conversationId:'other',messageId:'2',role:'user',content:'секретный двигатель'});
  const result=new ContextualRag(index).retrieve({conversationId:'allowed',query:'масло'});
  assert.equal(result.historyMessages,1);
  assert.ok(result.results.some(x=>x.source_id==='file:oil'));
  assert.ok(result.results.every(x=>!x.body.includes('секретный')));
  assert.ok(!result.contextualQuery.includes('секретный'));
 }finally{db.close();}
});
