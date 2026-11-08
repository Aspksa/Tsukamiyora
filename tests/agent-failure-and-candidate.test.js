import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {classifyAgentFailure,analyzeAgentFailures} from '../src/agent-failure-analysis.js';
import {evaluateAgentCandidate} from '../src/agent-candidate-evaluation.js';
test('failure analysis groups observed errors without retrying or patching',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec("CREATE TABLE agent_jobs(id INTEGER PRIMARY KEY,role TEXT,action TEXT,status TEXT,error TEXT)");
  db.prepare('INSERT INTO agent_jobs VALUES(?,?,?,?,?)').run(1,'auditor','auditor:check','failed','SQLITE_BUSY database locked');
  db.prepare('INSERT INTO agent_jobs VALUES(?,?,?,?,?)').run(2,'auditor','auditor:check','interrupted','restart');
  const result=analyzeAgentFailures(db);
  assert.equal(result.categories.storage,1);
  assert.equal(result.categories.interruption,1);
  assert.equal(result.automaticPatch,false);
  assert.equal(classifyAgentFailure({status:'failed',error:'timed out'}).category,'timeout');
 }finally{db.close();}
});
test('candidate must improve without regressions on identical case ids',()=>{
 const baseline=Array.from({length:5},(_,i)=>({caseId:'c'+i,score:0.5}));
 const better=baseline.map(x=>({...x,score:0.7}));
 const worse=baseline.map((x,i)=>({...x,score:i===0?0.1:0.9}));
 assert.equal(evaluateAgentCandidate(baseline,better).eligible,true);
 assert.equal(evaluateAgentCandidate(baseline,worse).eligible,false);
 assert.equal(evaluateAgentCandidate(baseline,better).applied,false);
 assert.throws(()=>evaluateAgentCandidate(baseline,better.slice(1)),/Incompatible/);
});
