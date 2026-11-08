import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CloudRu} from '../src/cloudru.js';
test('Cloud.ru stream decodes split SSE frames',async()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-stream-'));
 try{
  const encoder=new TextEncoder();
  const chunks=['data: {"choices":[{"delta":{"content":"При"}}]}\n\n','data: {"choices":[{"delta":{"content":"вет"}}]}\n\n','data: [DONE]\n\n'];
  const cloud=new CloudRu({root,fetchImpl:async()=>({ok:true,body:(async function*(){for(const chunk of chunks)yield encoder.encode(chunk);})()})});
  cloud.save({enabled:true,apiKey:'test-key',model:'test-model'});
  const output=[];for await(const delta of cloud.stream([{role:'user',content:'Привет'}]))output.push(delta);
  assert.equal(output.join(''),'Привет');
 }finally{rmSync(root,{recursive:true,force:true});}
});
