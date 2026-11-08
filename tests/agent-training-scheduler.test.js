import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createAgentAcademy} from '../src/agent-academy.js';
import {createAgentTrainingScheduler} from '../src/agent-training-scheduler.js';
test('scheduler runs eight real offline practices once and skips repeats',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const academy=createAgentAcademy(db,['rag_evaluator','diagnostician','cloud_economist','security_engineer','index_engineer','quality_controller','tester','performance_analyst']);
  const scheduler=createAgentTrainingScheduler(academy,{intervalMs:60000});
  assert.equal(scheduler.status().rolesWithPractice,8);
  assert.equal(scheduler.start(),true);
  assert.equal(scheduler.start(),false);
  const first=scheduler.run();
  assert.equal(first.results.filter(x=>x.status==='completed').length,8);
  const second=scheduler.run();
  assert.equal(second.results.filter(x=>x.status==='already_trained').length,8);
  assert.equal(academy.profiles().reduce((sum,p)=>sum+p.attempts,0),8);
  assert.equal(scheduler.status().cloudCalls,0);
  scheduler.stop();
  assert.equal(scheduler.status().scheduled,false);
 }finally{db.close();}
});
