import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {NeuralRag} from '../src/rag-neural.js';
import {RagPermissions} from '../src/rag-permissions.js';

test('neural RAG stores document vectors and reuses them without extra calls',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'file:public',title:'Public',text:'двигатель мотор масло'});
  index.ingest({id:'chat:private',title:'Private',text:'личный секрет'});
  new RagPermissions(db).set({sourceId:'file:public',allowed:true});
  let calls=0;
  const cloud={async request(path,{body}){
   assert.equal(path,'/embeddings');calls++;
   return {data:[{embedding:body.input.includes('масло')?[1,0]:[0,1]}]};
  }};
  const neural=new NeuralRag(db,cloud,{model:'test-embedding'});
  assert.equal((await neural.sync()).indexed,1);
  assert.equal((await neural.sync()).indexed,0);
  assert.equal(calls,1);
  const hits=await neural.search('масло');
  assert.equal(hits[0].source_id,'file:public');
  assert.equal(hits.some(x=>x.source_id.startsWith('chat:')),false);
  assert.equal((await neural.search('масло')).length,1);
  assert.equal(calls,2);
 }finally{db.close();}
});

test('neural index reindexes changed content and excludes deleted chunks',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'file:manual',title:'Manual',text:'первая версия'});
  new RagPermissions(db).set({sourceId:'file:manual',allowed:true});
  const cloud={async request(){return {data:[{embedding:[1,2,3]}]};}};
  const neural=new NeuralRag(db,cloud,{model:'test-embedding'});
  assert.equal((await neural.sync()).indexed,1);
  index.ingest({id:'file:manual',title:'Manual',text:'вторая версия'});
  assert.equal((await neural.sync()).indexed,1);
  assert.equal(neural.metrics().stored,1);
  index.removeSource('file:manual');
  assert.equal((await neural.sync()).indexed,0);
  assert.equal(neural.metrics().stored,0);
 }finally{db.close();}
});
