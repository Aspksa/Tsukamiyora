import { RagPipeline } from './rag-pipeline.js';
import { ConversationMemory } from './rag-memory.js';
import { createHash } from 'node:crypto';

export class ChatContext {
 constructor(db){this.memory=new ConversationMemory(db);this.pipeline=new RagPipeline(this.memory.index);}
 prepare({conversationId,query,historyLimit=12,sourceLimit=5,maxChars=6000}){
  if(typeof conversationId!=='string'||!conversationId.trim()||conversationId.length>200)throw Error('Invalid conversation');
  if(!Number.isInteger(historyLimit)||historyLimit<1||historyLimit>50||!Number.isInteger(sourceLimit)||sourceLimit<1||sourceLimit>20||!Number.isInteger(maxChars)||maxChars<500||maxChars>16000)throw Error('Invalid context options');
  const history=this.memory.history(conversationId,{limit:historyLimit});
  const allowedChatIds=new Set(this.memory.db.prepare('SELECT id FROM rag_messages WHERE conversation_id=?').all(conversationId).map(row=>'chat:'+row.id));
  const retrieval=this.pipeline.retrieve(query,{limit:Math.min(30,sourceLimit*3),allowedChatSourceIds:allowedChatIds});
  const context=[];const seen=new Set();let remaining=maxChars;
  for(const hit of retrieval.results){
   if(context.length>=sourceLimit||remaining<=0)break;
   if(hit.source_id.startsWith('chat:')&&!allowedChatIds.has(hit.source_id))continue;
   if(!this.pipeline.verifyCitation(hit.citation))continue;
   const key=createHash('sha256').update(hit.body).digest('hex');
   if(seen.has(key))continue;
   seen.add(key);const text=hit.body.slice(0,remaining);remaining-=text.length;
   context.push({source:hit.citation,text,relevance:hit.relevance});
  }
  return {conversationId,history,context,needsReview:context.length===0||context[0].relevance<0.25,modeUsed:retrieval.modeUsed,elapsedMs:retrieval.elapsedMs};
 }
}
