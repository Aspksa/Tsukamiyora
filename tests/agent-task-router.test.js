import test from 'node:test';
import assert from 'node:assert/strict';
import {planAgentTask,submitPlannedAgentTask} from '../src/agent-task-router.js';
test('only one explicitly allowed route is selected',()=>{
 const allowedActions=['auditor:pending','mentor:development'];
 assert.deepEqual(
  {role:planAgentTask('Сделай аудит знаний',{allowedActions}).role,action:planAgentTask('Сделай аудит знаний',{allowedActions}).action},
  {role:'auditor',action:'auditor:pending'});
 assert.equal(planAgentTask('аудит и план развития',{allowedActions}).reason,'ambiguous_request');
 assert.equal(planAgentTask('удали все файлы',{allowedActions}).matched,false);
 assert.equal(planAgentTask('бюджет cloud',{allowedActions}).matched,false);
});
test('dispatch enqueues only recognized allowed action',()=>{
 const submitted=[];
 const engine={status:()=>({allowedActions:['mentor:development']}),submit:job=>{submitted.push(job);return {id:1};}};
 const result=submitPlannedAgentTask(engine,'План развития агентов');
 assert.equal(result.job.id,1);
 assert.equal(submitted[0].role,'mentor');
 assert.equal(submitted[0].action,'mentor:development');
 submitPlannedAgentTask(engine,'запусти shell');
 assert.equal(submitted.length,1);
});
