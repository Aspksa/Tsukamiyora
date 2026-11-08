import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createAgentAcademy} from '../src/agent-academy.js';
test('academy persists per-agent experience and scores without auto-approval',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const academy=createAgentAcademy(db,['researcher','mentor']);
  assert.equal(academy.profile('researcher').level,1);
  for(let i=0;i<10;i++)academy.record({role:'researcher',skill:'retrieval',taskKey:'test-'+i,score:0.95,evidence:'Local benchmark'});
  assert.equal(academy.profile('researcher').level,3);
  assert.equal(academy.profile('mentor').attempts,0);
  assert.equal(academy.history({role:'researcher'}).length,10);
  const candidate=academy.propose({role:'researcher',skill:'retrieval',version:'v2',description:'Use tested reranking'});
  assert.equal(candidate.status,'pending');
  assert.equal(candidate.applied,false);
  assert.equal(academy.candidates()[0].status,'pending');
  assert.throws(()=>academy.record({role:'researcher',skill:'x',taskKey:'y',score:2,evidence:'z'}),/Invalid training result/);
  assert.throws(()=>academy.profile('unknown'),/Unknown academy role/);
  const restarted=createAgentAcademy(db,['researcher','mentor']);
  assert.equal(restarted.profile('researcher').attempts,10);
 }finally{db.close();}
});
