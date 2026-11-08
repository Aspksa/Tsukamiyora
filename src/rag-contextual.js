// Context expansion is scoped to one conversation, with no remote calls.
import {ConversationMemory} from './rag-memory.js';
import {RagPipeline} from './rag-pipeline.js';
export class ContextualRag {
 constructor(index){this.memory=new ConversationMemory(index.db);this.pipeline=new RagPipeline(index);}
 retrieve({conversationId,query,limit=5,historyLimit=4}={}){
  if(typeof conversationId!=='string'||!conversationId.trim()||conversationId.length>200||typeof query!=='string'||!query.trim()||query.length>1000||!Number.isInteger(limit)||limit<1||limit>30||!Number.isInteger(historyLimit)||historyLimit<0||historyLimit>20)throw Error('Invalid contextual retrieval');
  const history=historyLimit?this.memory.history(conversationId,{limit:historyLimit}):[];
  const prior=history.filter(m=>m.role==='user').slice(-2).map(m=>m.content.slice(0,120));
  const expanded=[...prior,query].join(' ').slice(-1000);
  const sourceIds=new Set(history.map(m=>'chat:'+m.id));
  const result=this.pipeline.retrieve(expanded,{limit,allowedChatSourceIds:sourceIds});
  return {...result,contextualQuery:expanded,conversationId,historyMessages:history.length};
 }
}
