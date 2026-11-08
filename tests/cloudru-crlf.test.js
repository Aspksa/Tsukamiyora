import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CloudRu} from '../src/cloudru.js';

test('Cloud.ru accepts CRLF event framing and fragmented Unicode',async()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-crlf-'));
 try{
  const payload='data: {"choices":[{"delta":{"content":"Привет"}}]}\r\n\r\ndata: [DONE]\r\n\r\n';
  const bytes=new TextEncoder().encode(payload);
  const cloud=new CloudRu({root,fetchImpl:async()=>({ok:true,body:(async function*(){for(let i=0;i<bytes.length;i+=3)yield bytes.slice(i,i+3);})()})});
  cloud.save({enabled:true,apiKey:'mock-key',model:'mock/model'});
  const result=[];for await(const chunk of cloud.stream([{role:'user',content:'hello'}]))result.push(chunk);
  assert.deepEqual(result,['Привет']);
 }finally{rmSync(root,{recursive:true,force:true});}
});
