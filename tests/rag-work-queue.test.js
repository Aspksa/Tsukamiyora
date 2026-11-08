import test from 'node:test';
import assert from 'node:assert/strict';
import {createRagWorkQueue} from '../src/rag-work-queue.js';

test('maintenance queue deduplicates jobs and runs sequentially',async()=>{
 const queue=createRagWorkQueue({capacity:2});
 const order=[];
 assert.deepEqual(queue.submit('a',async()=>{order.push('a');}),{queued:true});
 assert.deepEqual(queue.submit('a',async()=>{order.push('duplicate');}),{queued:false,reason:'duplicate'});
 assert.deepEqual(queue.submit('b',async()=>{order.push('b');}),{queued:true});
 assert.deepEqual(queue.submit('c',async()=>{}),{queued:false,reason:'full'});
 assert.deepEqual(await queue.drain({maxJobs:1}),{processed:1,remaining:1});
 assert.deepEqual(await queue.drain(),{processed:1,remaining:0});
 assert.deepEqual(order,['a','b']);
 assert.equal(queue.status().completed,2);
 queue.stop();
 assert.throws(()=>queue.submit('later',async()=>{}));
});

test('failed maintenance job cannot block the queue',async()=>{
 const events=[],queue=createRagWorkQueue({log:event=>events.push(event)});
 queue.submit('fail',()=>{throw Error('test failure');});
 queue.submit('ok',()=>42);
 assert.deepEqual(await queue.drain(),{processed:2,remaining:0});
 assert.equal(queue.status().failed,1);
 assert.equal(queue.status().completed,1);
 assert.equal(events[0].event,'rag:job-error');
});
