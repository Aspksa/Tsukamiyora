import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {RagAgentExperience} from '../src/rag-agent-experience.js';
import {RagPipeline} from '../src/rag-pipeline.js';
import {createGuardianScheduler} from '../src/rag-guardian-scheduler.js';

test('approved agent experience can accompany grounded lexical retrieval',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),experiences=new RagAgentExperience(db);
  index.ingest({id:'file:manual',title:'Manual',text:'Проверка двигателя проводится перед запуском'});
  const proposal=experiences.propose({agentId:'inspector',taskKey:'engine',lesson:'Проверить двигатель',sourceId:'file:manual'});
  experiences.review({id:proposal.id,approved:true});
  const result=new RagPipeline(index).retrieve('двигателя',{mode:'lexical'});
  assert.ok(result.results.every(hit=>hit.citation?.sourceId===hit.source_id));
  assert.equal(experiences.share({taskKey:'engine'}).length,1);
  index.ingest({id:'file:manual',title:'Manual',text:'Новая процедура'});
  assert.equal(experiences.share({taskKey:'engine'}).length,0);
 }finally{db.close();}
});

test('guardian journal retains history across scheduler instances',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const first=createGuardianScheduler(db);
  first.run();first.stop();
  const second=createGuardianScheduler(db);
  assert.equal(second.history().length,1);
  second.run();
  assert.equal(second.history().length,2);
  second.stop();
 }finally{db.close();}
});
