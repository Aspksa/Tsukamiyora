import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createAgentTaskEngine} from '../src/agent-task-engine.js';
test('durable dispatcher executes only allowlisted role actions and persists outcomes',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const options={roles:['auditor','mentor'],handlers:{'auditor:check':()=>({ok:true}),'mentor:fail':()=>{throw Error('expected failure');}}};
  const engine=createAgentTaskEngine(db,options);
  assert.throws(()=>engine.submit({role:'auditor',action:'auditor:shell'}),/Unsupported agent action/);
  assert.throws(()=>engine.submit({role:'mentor',action:'auditor:check'}),/Unsupported agent action/);
  engine.submit({role:'auditor',action:'auditor:check'});
  engine.submit({role:'mentor',action:'mentor:fail'});
  assert.equal(engine.status().queued,2);
  const result=await engine.execute();
  assert.equal(result.processed,2);
  assert.equal(engine.status().completed,1);
  assert.equal(engine.status().failed,1);
  assert.equal(engine.list()[0].status,'failed');
  const again=createAgentTaskEngine(db,options);
  assert.equal(again.status().completed,1);
  assert.equal(again.status().queued,0);
 }finally{db.close();}
});
test('interrupted jobs are marked on restart rather than replayed',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const options={roles:['auditor'],handlers:{'auditor:check':()=>({ok:true})}};
  const first=createAgentTaskEngine(db,options);
  const job=first.submit({role:'auditor',action:'auditor:check'});
  db.prepare("UPDATE agent_jobs SET status='running' WHERE id=?").run(job.id);
  const second=createAgentTaskEngine(db,options);
  assert.equal(second.status().interrupted,1);
  assert.equal(second.status().queued,0);
 }finally{db.close();}
});
