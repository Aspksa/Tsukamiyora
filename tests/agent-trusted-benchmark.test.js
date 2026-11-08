import test from 'node:test';
import assert from 'node:assert/strict';
import {runTrustedAgentBenchmark,compareTrustedStrategies} from '../src/agent-trusted-benchmark.js';
test('trusted benchmark is deterministic and server scored',()=>{
 const a=runTrustedAgentBenchmark('original');
 const b=runTrustedAgentBenchmark('original');
 assert.deepEqual(a,b);
 assert.equal(a.cases.length,6);
 assert.equal(a.cloudCalls,0);
 assert.throws(()=>runTrustedAgentBenchmark('shell'),/Unsupported/);
});
test('strategy comparison uses same cases and requires approval',()=>{
 const result=compareTrustedStrategies('reverse','original');
 assert.equal(result.cases,6);
 assert.equal(result.serverScored,true);
 assert.equal(result.requiresApproval,true);
 assert.equal(result.applied,false);
 assert.equal(compareTrustedStrategies('original','original').eligible,false);
});
