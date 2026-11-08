import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ChatContext} from '../src/chat-context.js';
import {RagPipeline} from '../src/rag-pipeline.js';

test('semantic and hybrid retrieval never expose other conversations',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const chat=new ChatContext(db);
  chat.memory.append({conversationId:'alpha',messageId:'a',role:'user',content:'секретная формула альфа'});
  chat.memory.append({conversationId:'beta',messageId:'b',role:'user',content:'секретная формула бета'});
  const allowed=new Set(db.prepare('SELECT id FROM rag_messages WHERE conversation_id=?').all('alpha').map(r=>'chat:'+r.id));
  const pipeline=new RagPipeline(chat.memory.index);
  for(const mode of ['lexical','hybrid','semantic','adaptive']){
   const result=pipeline.retrieve('секретная формула',{mode,allowedChatSourceIds:allowed});
   assert.ok(result.results.every(r=>!r.body.includes('бета')),mode);
  }
  const global=pipeline.retrieve('секретная формула',{mode:'hybrid'});
  assert.ok(global.results.every(r=>!r.source_id.startsWith('chat:')));
  const context=chat.prepare({conversationId:'alpha',query:'секретная формула'});
  assert.ok(context.context.every(r=>!r.text.includes('бета')));
 }finally{db.close();}
});

test('FTS LIMIT cannot be exhausted by private conversations',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const chat=new ChatContext(db);
  chat.memory.index.ingest({id:'public-guide',title:'Guide',text:'sharedkeyword public manual'});
  for(let i=0;i<35;i++)chat.memory.append({conversationId:'private-'+i,messageId:'m',role:'user',content:'sharedkeyword secret message '+i});
  const result=chat.memory.index.search('sharedkeyword',{limit:5});
  assert.equal(result.length,1);
  assert.equal(result[0].source_id,'public-guide');
  const scoped=chat.prepare({conversationId:'new-conversation',query:'sharedkeyword'});
  assert.ok(scoped.context.every(hit=>hit.source.sourceId==='public-guide'));
 }finally{db.close();}
});
