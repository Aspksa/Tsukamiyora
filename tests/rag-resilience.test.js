import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {HybridNeuralRag} from '../src/rag-hybrid-neural.js';
import {CloudEmbeddings} from '../src/cloud-embeddings.js';

test('concurrent duplicate embeddings share one Cloud.ru request',async()=>{
 let calls=0,release;
 const gate=new Promise(resolve=>release=resolve);
 const cloud={async request(){calls++;await gate;return {data:[{embedding:[1,2]}]};}};
 const client=new CloudEmbeddings(cloud,{model:'embed-test'});
 const a=client.embed('same text'),b=client.embed('same text');
 release();
 const [first,second]=await Promise.all([a,b]);
 assert.deepEqual(first,second);
 assert.equal(calls,1);
 assert.equal(client.metrics().coalesced,1);
});

test('failed embedding request is not cached and can be retried',async()=>{
 let calls=0;
 const cloud={async request(){calls++;if(calls===1)throw Error('offline');return {data:[{embedding:[1,2]}]};}};
 const client=new CloudEmbeddings(cloud,{model:'embed-test'});
 await assert.rejects(client.embed('same text'),/offline/);
 assert.deepEqual(await client.embed('same text'),[1,2]);
 assert.equal(calls,2);
});

test('hybrid search falls back to lexical retrieval on Cloud failure',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'file:manual',title:'Manual',text:'масло двигатель фильтр'});
  const cloud={async request(){throw Error('Cloud unavailable');}};
  const hybrid=new HybridNeuralRag(index,cloud,{model:'embed-test'});
  const result=await hybrid.retrieve('масло двигатель');
  assert.equal(result.modeUsed,'lexical-fallback');
  assert.equal(result.results[0].source_id,'file:manual');
  assert.match(result.neuralError,/Cloud unavailable/);
 }finally{db.close();}
});
