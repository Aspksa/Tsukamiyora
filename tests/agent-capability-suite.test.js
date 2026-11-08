import test from 'node:test';
import assert from 'node:assert/strict';
import {runAgentCapabilitySuite} from '../src/agent-capability-suite.js';
test('capability suite runs deterministic checks across four domains',()=>{
 const first=runAgentCapabilitySuite();
 const second=runAgentCapabilitySuite();
 assert.deepEqual(first,second);
 assert.equal(first.total,8);
 assert.equal(first.passed,8);
 assert.deepEqual(first.domains.map(x=>x.domain),['memory','retrieval','diagnostics','safety']);
 assert.equal(first.serverScored,true);
 assert.equal(first.heldOut,false);
 assert.equal(first.cloudCalls,0);
});
