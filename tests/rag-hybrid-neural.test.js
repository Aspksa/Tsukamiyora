import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {HybridNeuralRag} from '../src/rag-hybrid-neural.js';
import {RagPermissions} from '../src/rag-permissions.js';

test('hybrid neural search fuses both retrievers and never returns private chats',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'file:one',title:'One',text:'масло двигатель фильтр'});
  index.ingest({id:'file:two',title:'Two',text:'тормозные колодки'});
  index.ingest({id:'chat:secret',title:'Secret',text:'масло двигатель личные данные'});
  new RagPermissions(db).set({sourceId:'file:one',allowed:true});
  new RagPermissions(db).set({sourceId:'file:two',allowed:true});
  let calls=0;
  const cloud={async request(path,{body}){
   assert.equal(path,'/embeddings');calls++;
   return {data:[{embedding:body.input.includes('масло')?[1,0]:[0,1]}]};
  }};
  const hybrid=new HybridNeuralRag(index,cloud,{model:'test-embedding'});
  await hybrid.neural.sync();
  const response=await hybrid.retrieve('масло двигатель',{limit:5});
  assert.equal(response.modeUsed,'hybrid-neural');
  assert.ok(response.results.some(x=>x.source_id==='file:one'));
  assert.ok(response.results.every(x=>!x.source_id.startsWith('chat:')));
  const shared=response.results.find(x=>x.source_id==='file:one');
  assert.deepEqual(shared.retrievers.sort(),['lexical','neural']);
  assert.ok(calls>=3);
 }finally{db.close();}
});

test('hybrid neural retrieval does not implicitly index or upload documents',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'file:manual',title:'Manual',text:'технический справочник'});
  let requests=0;
  const cloud={async request(){requests++;return {data:[{embedding:[1,0]}]};}};
  const hybrid=new HybridNeuralRag(index,cloud,{model:'test-embedding'});
  const result=await hybrid.retrieve('технический',{limit:1});
  assert.equal(requests,1);
  assert.equal(result.results.length,1);
  assert.equal(hybrid.neural.metrics().stored,0);
 }finally{db.close();}
});
