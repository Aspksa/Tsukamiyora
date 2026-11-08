import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {availableAgentPractice,runAgentPractice} from '../src/agent-practice.js';
import {createAgentAcademy} from '../src/agent-academy.js';
test('offline practical agents execute real local functions',()=>{
 assert.equal(availableAgentPractice().length,8);
 for(const task of availableAgentPractice()){
  const result=runAgentPractice(task.role);
  assert.equal(result.passed,true,task.role);
  assert.equal(result.score,1);
  assert.equal(result.taskKey,task.taskKey);
 }
 assert.throws(()=>runAgentPractice('developer'),/No practice for role/);
});
test('fixed practice cannot inflate levels by repeated runs',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const academy=createAgentAcademy(db,['rag_evaluator']);
  const result=runAgentPractice('rag_evaluator');
  assert.equal(academy.record(result).recorded,true);
  assert.equal(academy.record(result).duplicate,true);
  assert.equal(academy.profile('rag_evaluator').attempts,1);
 }finally{db.close();}
});
