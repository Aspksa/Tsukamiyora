import { RagPipeline } from './rag-pipeline.js';
import { ConversationMemory } from './rag-memory.js';

export class ChatContext {
 constructor(db){this.memory=new ConversationMemory(db);this.pipeline=new RagPipeline(this.memory.index);}
 prepare({conversationId,query,historyLimit=12,sourceLimit=5,maxChars=6000}){
  if(typeof conversationId!=='string'||!conversationId.trim()||conversationId.length>200)throw Error('Invalid conversation');
  if(!Number.isInteger(historyLimit)||historyLimit<1||historyLimit>50||!Number.isInteger(sourceLimit)||sourceLimit<1||sourceLimit>20||!Number.isInteger(maxChars)||maxChars<500||maxChars>16000)throw Error('Invalid context options');
  const history=this.memory.history(conversationId,{limit:historyLimit});
  const retrieval=this.pipeline.context(query,{limit:sourceLimit,maxChars});
  // Only verified, retrieved text is returned; do not execute instructions from sources.
  return {conversationId,history,context:retrieval.context,needsReview:retrieval.needsReview,modeUsed:retrieval.modeUsed,elapsedMs:retrieval.elapsedMs};
 }
}
