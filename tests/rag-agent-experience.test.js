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

test('approved agent lessons expire when their source changes',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),experience=new RagAgentExperience(db);
  index.ingest({id:'file:guide',title:'Guide',text:'Original verified procedure'});
  const item=experience.propose({agentId:'agent',taskKey:'procedure',lesson:'Use original procedure',sourceId:'file:guide'});
  experience.review({id:item.id,approved:true});
  assert.equal(experience.share({taskKey:'procedure'}).length,1);
  index.ingest({id:'file:guide',title:'Guide',text:'Revised procedure, old method obsolete'});
  assert.equal(experience.share({taskKey:'procedure'}).length,0);
 }finally{db.close();}
});

test('review cannot approve a proposal after its evidence has changed',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),experience=new RagAgentExperience(db);
  index.ingest({id:'file:guide',title:'Guide',text:'Version one'});
  const item=experience.propose({agentId:'agent',taskKey:'task',lesson:'Version one lesson',sourceId:'file:guide'});
  index.ingest({id:'file:guide',title:'Guide',text:'Version two'});
  assert.deepEqual(experience.review({id:item.id,approved:true}),{updated:false});
  assert.deepEqual(experience.share({taskKey:'task'}),[]);
 }finally{db.close();}
});

test('pending lessons include current evidence flag and exclude approved entries',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),experience=new RagAgentExperience(db);
  index.ingest({id:'file:guide',title:'Guide',text:'Procedure A'});
  const a=experience.propose({agentId:'a',taskKey:'task',lesson:'Check A',sourceId:'file:guide'});
  const b=experience.propose({agentId:'b',taskKey:'task',lesson:'Check B',sourceId:'file:guide'});
  assert.equal(experience.pending().length,2);
  assert.equal(experience.pending()[0].evidenceCurrent,1);
  experience.review({id:a.id,approved:true});
  assert.deepEqual(experience.pending().map(row=>row.id),[b.id]);
  index.ingest({id:'file:guide',title:'Guide',text:'Procedure B'});
  assert.equal(experience.pending()[0].evidenceCurrent,0);
  assert.throws(()=>experience.pending({limit:101}),/Invalid pending limit/);
 }finally{db.close();}
});

test('stale agent proposals may be rejected but never approved',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),experience=new RagAgentExperience(db);
  index.ingest({id:'file:guide',title:'Guide',text:'Initial evidence'});
  const item=experience.propose({agentId:'agent',taskKey:'task',lesson:'Old conclusion',sourceId:'file:guide'});
  index.removeSource('file:guide');
  assert.deepEqual(experience.review({id:item.id,approved:true}),{updated:false});
  assert.deepEqual(experience.review({id:item.id,approved:false}),{updated:true});
  assert.deepEqual(experience.pending(),[]);
 }finally{db.close();}
});

test('agent review audit is transactional and records each decision once',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),experience=new RagAgentExperience(db);
  index.ingest({id:'file:a',title:'A',text:'Original procedure'});
  const first=experience.propose({agentId:'a',taskKey:'task',lesson:'Do A',sourceId:'file:a'});
  const second=experience.propose({agentId:'a',taskKey:'task',lesson:'Do B',sourceId:'file:a'});
  assert.deepEqual(experience.review({id:first.id,approved:true}),{updated:true});
  assert.deepEqual(experience.review({id:first.id,approved:false}),{updated:false});
  assert.deepEqual(experience.review({id:second.id,approved:false}),{updated:true});
  const rows=experience.reviewHistory();
  assert.deepEqual(rows.map(row=>row.decision),['rejected','approved']);
  assert.deepEqual(rows.map(row=>row.experience_id),[second.id,first.id]);
  assert.throws(()=>experience.reviewHistory({limit:101}),/Invalid review history limit/);
 }finally{db.close();}
});
