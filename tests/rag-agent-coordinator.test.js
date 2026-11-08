import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {createRagAgentCoordinator} from '../src/rag-agent-coordinator.js';

test('coordinator never approves agent lessons and rejects stale evidence',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const rag=new KnowledgeIndex(db);
  rag.ingest({id:'file:guide',title:'Guide',text:'Initial knowledge'});
  const agents=createRagAgentCoordinator(db);
  assert.equal(agents.roles.length,8);
  const proposal=agents.submitLesson({role:'researcher',taskKey:'guide',lesson:'Use the guide',sourceId:'file:guide'});
  assert.equal(proposal.status,'pending');
  assert.equal(agents.auditPending().stale,0);
  rag.ingest({id:'file:guide',title:'Guide',text:'Updated knowledge'});
  assert.equal(agents.auditPending().stale,1);
  assert.equal(agents.rejectStale().rejected,1);
  assert.equal(agents.auditPending().pending,0);
  assert.equal(db.prepare('SELECT status FROM rag_agent_experience WHERE id=?').get(proposal.id).status,'rejected');
  assert.throws(()=>agents.submitLesson({role:'unknown',taskKey:'x',lesson:'x',sourceId:'file:guide'}),/Unknown RAG agent role/);
  agents.stop();
 }finally{db.close();}
});
