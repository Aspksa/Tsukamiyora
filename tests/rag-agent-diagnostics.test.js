import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseAgents} from '../src/rag-agent-diagnostics.js';

test('diagnostics flags repeated failures, backlog and slow cloud calls',()=>{
 const result=diagnoseAgents({
  activity:[{outcome:'failed'},{outcome:'failed'},{outcome:'failed'}],
  queue:{pending:21},
  cloud:{session:{failed:5,succeeded:2,durationMs:40000}}
 });
 assert.equal(result.status,'attention');
 assert.deepEqual(result.alerts.map(x=>x.code),['agent_failures','agent_queue_backlog','cloud_failures','cloud_latency']);
 assert.equal(result.automaticChanges,false);
});

test('diagnostics is safe with empty counters and rejects invalid thresholds',()=>{
 assert.equal(diagnoseAgents().status,'ok');
 assert.equal(diagnoseAgents().observed.avgLatencyMs,null);
 assert.throws(()=>diagnoseAgents({thresholds:{maxQueued:-1}}),/Invalid diagnostic thresholds/);
});
