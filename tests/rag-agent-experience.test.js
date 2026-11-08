import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {RagAgentExperience} from '../src/rag-agent-experience.js';

test('agent experience is private until reviewed and evidence is present',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),experience=new RagAgentExperience(db);
  index.ingest({id:'file:guide',title:'Guide',text:'Документированный порядок проверки'});
  const item=experience.propose({agentId:'researcher',taskKey:'verification',lesson:'Проверять источник',sourceId:'file:guide'});
  assert.deepEqual(experience.share({taskKey:'verification'}),[]);
  assert.deepEqual(experience.review({id:item.id,approved:true}),{updated:true});
  assert.equal(experience.share({taskKey:'verification'}).length,1);
  index.removeSource('file:guide');
  assert.equal(experience.share({taskKey:'verification'}).length,0);
 }finally{db.close();}
});

test('agent experience rejects private chats and duplicate review',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),experience=new RagAgentExperience(db);
  index.ingest({id:'chat:secret',title:'Secret',text:'Private'});
  assert.throws(()=>experience.propose({agentId:'a',taskKey:'task',lesson:'secret',sourceId:'chat:secret'}));
  index.ingest({id:'file:public',title:'Public',text:'Public'});
  const item=experience.propose({agentId:'a',taskKey:'task',lesson:'Check evidence',sourceId:'file:public'});
  assert.deepEqual(experience.review({id:item.id,approved:false}),{updated:true});
  assert.deepEqual(experience.review({id:item.id,approved:true}),{updated:false});
  assert.deepEqual(experience.share({taskKey:'task'}),[]);
 }finally{db.close();}
});
