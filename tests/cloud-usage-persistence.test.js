import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CloudRu} from '../src/cloudru.js';

test('cloud usage survives restart without persisting credentials',async()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-usage-'));
 try{
  const fake=async()=>({ok:true,json:async()=>({choices:[{message:{content:'OK'}}],usage:{prompt_tokens:12,completion_tokens:4}})});
  const first=new CloudRu({root,fetchImpl:fake});
  first.save({enabled:true,apiKey:'private-token',model:'test/model'});
  await first.complete([{role:'user',content:'hello'}]);
  const second=new CloudRu({root,fetchImpl:fake});
  const usage=second.usageMetrics();
  assert.equal(usage.requests,1);
  assert.equal(usage.succeeded,1);
  assert.equal(usage.promptTokens,12);
  assert.equal(usage.completionTokens,4);
  assert.equal(usage.session.requests,0);
  assert.ok(usage.durationMs>=0);
  assert.equal(readFileSync(join(root,'data','cloudru-usage.json'),'utf8').includes('private-token'),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('cloud usage persists error counts',async()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-usage-error-'));
 try{
  const cloud=new CloudRu({root,fetchImpl:async()=>({ok:false,status:429})});
  cloud.save({enabled:true,apiKey:'private-token'});
  await assert.rejects(cloud.models(),/Превышен лимит/);
  const next=new CloudRu({root});
  assert.equal(next.usageMetrics().requests,1);
  assert.equal(next.usageMetrics().failed,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});
