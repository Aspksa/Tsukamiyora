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
