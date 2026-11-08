import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CloudRu,classifyCloudError } from '../src/cloudru.js';
test('Cloud.ru settings keep secrets local and do not expose them',async()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-cloud-'));
 try{
  const calls=[];
  const cloud=new CloudRu({root,fetchImpl:async(url,options)=>{
   calls.push({url,options});
   if(url.endsWith('/models'))return {ok:true,json:async()=>({data:[{id:'test/model'},{id:'another/model'}]})};
   return {ok:true,json:async()=>({choices:[{message:{content:'OK'}}]})};
  }});
  assert.equal(cloud.publicSettings().configured,false);
  cloud.save({enabled:true,apiKey:'secret-local-only',model:'test/model'});
  assert.equal(cloud.publicSettings().configured,true);
  assert.equal(JSON.stringify(cloud.publicSettings()).includes('secret-local-only'),false);
  assert.equal(readFileSync(join(root,'data','cloudru-settings.json'),'utf8').includes('secret-local-only'),true);
  assert.equal((await cloud.models()).models.length,2);
  assert.equal((await cloud.testModel()).ok,true);
  assert.equal(calls[0].options.headers.Authorization,'Bearer secret-local-only');
  assert.equal(calls[1].options.body.includes('test/model'),true);
  assert.equal(classifyCloudError(429),'Превышен лимит запросов');
  assert.throws(()=>cloud.save({model:'bad?model'}),/Invalid model/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('Cloud.ru errors are mapped without exposing response bodies',async()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-cloud-errors-'));
 try{
  const cloud=new CloudRu({root,fetchImpl:async()=>({ok:false,status:401})});
  cloud.save({enabled:true,apiKey:'secret'});
  await assert.rejects(cloud.models(),/Неверный или просроченный API-ключ/);
  assert.equal(cloud.publicSettings().status.status,'error');
 }finally{rmSync(root,{recursive:true,force:true});}
});
