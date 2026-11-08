import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAgentDevelopmentPlan,summarizeAgentDevelopment} from '../src/agent-development.js';
test('mentor development plan prioritizes weak skills without automatic promotion',()=>{
 const profile={role:'researcher',level:2,attempts:4,skills:[{skill:'source_check',attempts:3,averageScore:0.9},{skill:'retrieval',attempts:1,averageScore:0.5}]};
 const plan=buildAgentDevelopmentPlan(profile);
 assert.equal(plan.weaknesses.length,1);
 assert.equal(plan.weaknesses[0].skill,'retrieval');
 assert.equal(plan.readyForPromotion,false);
 assert.equal(plan.automaticChanges,false);
 const overview=summarizeAgentDevelopment([profile,{role:'mentor',level:1,attempts:0,skills:[]}]);
 assert.equal(overview.total,2);
 assert.equal(overview.untrained,1);
 assert.equal(overview.plans[1].needsMoreEvidence,true);
 assert.throws(()=>buildAgentDevelopmentPlan(profile,{targetScore:2}),/Invalid development plan/);
});
