import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CloudRu} from '../src/cloudru.js';

test('Cloud.ru streaming parses SSE chunks split in the middle of a frame',async()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-sse-'));
 try{
  const text='data: {"choices":[{"delta":{"content":"Привет"}}]}\n\ndata: [DONE]\n\n';
  const bytes=new TextEncoder().encode(text);
  const cloud=new CloudRu({root,fetchImpl:async()=>({ok:true,body:(async function*(){yield bytes.slice(0,11);yield bytes.slice(11,32);yield bytes.slice(32);})()})});
  cloud.save({enabled:true,apiKey:'mock-key',model:'mock/model'});
  const parts=[];
  for await(const part of cloud.stream([{role:'user',content:'Привет'}]))parts.push(part);
  assert.deepEqual(parts,['Привет']);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('Cloud.ru streaming rejects incomplete output',async()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-sse-fail-'));
 try{
  const cloud=new CloudRu({root,fetchImpl:async()=>({ok:true,body:(async function*(){yield new TextEncoder().encode('data: {"choices":[{"delta":{"content":"part"}}]}\n\n');})()})});
  cloud.save({enabled:true,apiKey:'mock-key',model:'mock/model'});
  await assert.rejects(async()=>{for await(const part of cloud.stream([{role:'user',content:'Hi'}])){}},/unexpectedly/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
