import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createAgentTaskEngine} from '../src/agent-task-engine.js';
import {createAgentExperienceLedger} from '../src/agent-experience-ledger.js';
test('job outcomes become durable evidence once per job',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const engine=createAgentTaskEngine(db,{roles:['auditor'],handlers:{'auditor:ok':()=>({ok:true}),'auditor:fail':()=>{throw Error('bad');}}});
  engine.submit({role:'auditor',action:'auditor:ok'});
  engine.submit({role:'auditor',action:'auditor:fail'});
  await engine.execute();
  const ledger=createAgentExperienceLedger(db);
  assert.equal(ledger.capture().recorded,2);
  assert.equal(ledger.capture().recorded,0);
  assert.equal(ledger.summary()[0].total,2);
  assert.equal(ledger.summary()[0].failed,1);
  assert.equal(ledger.list({role:'auditor'}).length,2);
  assert.throws(()=>ledger.list({limit:0}),/Invalid lesson limit/);
 }finally{db.close();}
});
