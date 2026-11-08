import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createAgentEvaluationHistory} from '../src/agent-evaluation-history.js';
test('evaluation history rejects regressions and stores no queries',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const history=createAgentEvaluationHistory(db);
  const cases=[{query:'private phrase',expectedSource:'file:a'},{query:'secret phrase',expectedSource:'file:b'}];
  const baseline={total:2,hitAtK:0.5,mrrAtK:0.5};
  const candidate={total:2,hitAtK:1,mrrAtK:0.75};
  const first=history.record({cases,baseline,candidate});
  assert.equal(first.passed,true);
  assert.equal(first.applied,false);
  const second=history.record({cases,baseline,candidate:{total:2,hitAtK:0.5,mrrAtK:0.5}});
  assert.equal(second.passed,false);
  assert.equal(second.comparedWithPrevious,true);
  assert.equal(history.list().length,2);
  assert.equal(JSON.stringify(history.list()).includes('private phrase'),false);
  assert.equal(history.fingerprint(cases),history.fingerprint([...cases].reverse()));
  assert.throws(()=>history.record({cases,baseline,candidate:{total:2,hitAtK:2,mrrAtK:0.5}}),/Invalid evaluation metrics/);
 }finally{db.close();}
});
