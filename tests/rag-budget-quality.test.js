import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assessCloudBudget} from '../src/cloud-budget.js';
import {createRagQualityMonitor} from '../src/rag-quality-monitor.js';

test('advisory cloud budget detects warning and exceedance',()=>{
 assert.equal(assessCloudBudget({requests:8,promptTokens:20,completionTokens:0},{maxRequests:10,maxTokens:100}).status,'warning');
 assert.equal(assessCloudBudget({requests:11,promptTokens:20,completionTokens:0},{maxRequests:10,maxTokens:100}).status,'exceeded');
 assert.equal(assessCloudBudget({requests:1,promptTokens:2,completionTokens:0},{maxRequests:10,maxTokens:100}).advisoryOnly,true);
 assert.throws(()=>assessCloudBudget({requests:1},{maxRequests:0}),/Invalid cloud budget/);
});

test('quality monitor preserves first baseline and flags regression',()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-quality-'));
 try{
  const monitor=createRagQualityMonitor(root);
  assert.equal(monitor.check({total:2,limit:5,hitAtK:1,mrrAtK:1}).status,'no_baseline');
  const baseline={total:2,limit:5,hitAtK:1,mrrAtK:1};
  assert.equal(monitor.save(baseline).saved,true);
  assert.equal(monitor.check({total:2,limit:5,hitAtK:0.5,mrrAtK:0.5}).status,'regression');
  assert.equal(monitor.check(baseline).status,'ok');
  assert.throws(()=>monitor.save(baseline));
 }finally{rmSync(root,{recursive:true,force:true});}
});
