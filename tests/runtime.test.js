import test from 'node:test';
import assert from 'node:assert/strict';
import { TaskQueue, TTLCache, events, metrics, registerModule, modules } from '../src/runtime.js';
test('worker executes queued computation',async()=>{
 const q=new TaskQueue({concurrency:1});
 const id=q.submit('sum',[2,3,5]);
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{events.off('task:finished',onFinish);reject(Error('worker timeout'));},5000);const onFinish=e=>{if(e.id===id){clearTimeout(timer);events.off('task:finished',onFinish);resolve();}};events.on('task:finished',onFinish);if(q.get(id).status==='done') {clearTimeout(timer);events.off('task:finished',onFinish);resolve();}});
 assert.equal(q.get(id).result,10);q.close();
});
test('cache expires and module registration validates names',()=>{
 const c=new TTLCache(2);c.set('a',1,1000);assert.equal(c.get('a'),1);c.set('b',2,0);assert.equal(c.get('b'),undefined);
 registerModule('example-test',()=>({}));assert.ok(modules().includes('example-test'));
 assert.ok(metrics().rssBytes>0);
});

test('worker hash and rejected payload fail safely', async()=>{
 const q=new TaskQueue({concurrency:1,capacity:2});
 const id=q.submit('hash','abc');
 const end=Date.now()+5000;
 while(q.get(id).status==='running'||q.get(id).status==='queued'){
  if(Date.now()>end)throw Error('worker timeout');
  await new Promise(resolve=>setTimeout(resolve,20));
 }
 assert.equal(q.get(id).status,'done');
 assert.equal(q.get(id).result,'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 const bad=q.submit('sum','invalid');
 while(q.get(bad).status==='running'||q.get(bad).status==='queued'){
  if(Date.now()>end+5000)throw Error('failed worker timeout');
  await new Promise(resolve=>setTimeout(resolve,20));
 }
 assert.equal(q.get(bad).status,'failed');
 assert.throws(()=>q.submit('other',[]));
 q.close();
});
