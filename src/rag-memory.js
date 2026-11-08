import { createHash } from 'node:crypto';
import { KnowledgeIndex } from './rag.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const valid=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
export class ConversationMemory {
 constructor(db){
  this.db=db;this.index=new KnowledgeIndex(db);
  db.exec(`CREATE TABLE IF NOT EXISTS rag_messages(
   id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL,
   content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS rag_messages_conversation ON rag_messages(conversation_id,created_at,id);`);
 }
 append({conversationId,messageId,role,content}){
  if(!valid(conversationId,200)||!valid(messageId,200)||!['user','assistant'].includes(role)||!valid(content,100000))throw Error('Invalid message');
  const id=hash(conversationId+'\0'+messageId);
  const existing=this.db.prepare('SELECT content,role FROM rag_messages WHERE id=?').get(id);
  if(existing){
   if(existing.content!==content||existing.role!==role)throw Error('Message ID conflict');
   return {id,created:false};
  }
  const sourceId='chat:'+id;
  this.index.ingest({id:sourceId,title:'Chat '+conversationId+' / '+role,text:content});
  this.db.prepare('INSERT INTO rag_messages(id,conversation_id,role,content) VALUES(?,?,?,?)').run(id,conversationId,role,content);
  return {id,created:true,sourceId};
 }
 history(conversationId,{limit=50}={}){
  if(!valid(conversationId,200)||!Number.isInteger(limit)||limit<1||limit>200)throw Error('Invalid history request');
  return this.db.prepare('SELECT id,role,content,created_at FROM rag_messages WHERE conversation_id=? ORDER BY rowid DESC LIMIT ?').all(conversationId,limit).reverse();
 }
}
