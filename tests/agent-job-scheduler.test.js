import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createAgentTaskEngine} from '../src/agent-task-engine.js';
import {createAgentJobScheduler} from '../src/agent-job-scheduler.js';
test('concurrent execution is serialized, preventing duplicate running jobs',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  let calls=0;
  const engine=createAgentTaskEngine(db,{roles:['auditor'],handlers:{'auditor:slow':async()=>{calls++;await gate;return {ok:true};}}});
  engine.submit({role:'auditor',action:'auditor:slow'});
  const first=engine.execute();
  const second=await engine.execute();
  assert.equal(second.busy,true);
  assert.equal(calls,1);
  release();await first;
  assert.equal(engine.status().completed,1);
 }finally{db.close();}
});
test('polling scheduler runs queued jobs and stops cleanly',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const engine=createAgentTaskEngine(db,{roles:['auditor'],handlers:{'auditor:check':()=>({ok:true})}});
  const scheduler=createAgentJobScheduler(engine,{intervalMs:1000});
  assert.equal(scheduler.start(),true);
  assert.equal(scheduler.start(),false);
  engine.submit({role:'auditor',action:'auditor:check'});
  const result=await scheduler.tick();
  assert.equal(result.processed,1);
  assert.equal(engine.status().queued,0);
  scheduler.stop();
  assert.equal(scheduler.status().scheduled,false);
 }finally{db.close();}
});
