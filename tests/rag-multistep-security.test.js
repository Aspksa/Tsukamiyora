import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {KnowledgeLifecycle} from '../src/rag-lifecycle.js';
import {MultiStepRag} from '../src/rag-multistep.js';
import {NeuralRag} from '../src/rag-neural.js';
import {RagPermissions} from '../src/rag-permissions.js';

test('multi-step retrieval finds evidence for both clauses and excludes chats',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'file:oil',title:'Oil',text:'двигатель масло фильтр'});
  index.ingest({id:'file:tires',title:'Tires',text:'колесо давление шины'});
  index.ingest({id:'chat:hidden',title:'Hidden',text:'двигатель масло колесо давление'});
  const result=new MultiStepRag(index).search('двигатель масло; колесо давление',{limit:5});
  assert.ok(result.steps.length>=2);
  assert.ok(result.results.some(x=>x.source_id==='file:oil'));
  assert.ok(result.results.some(x=>x.source_id==='file:tires'));
  assert.ok(result.results.every(x=>!x.source_id.startsWith('chat:')));
 }finally{db.close();}
});

test('fact refresh drops superseded extracted facts but retains history',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db),facts=new KnowledgeLifecycle(db);
  index.ingest({id:'file:oil',title:'Oil',text:'Масло: 5W30'});
  facts.extract({sourceId:'file:oil'});
  index.ingest({id:'file:oil',title:'Oil',text:'Масло: 0W20'});
  facts.extract({sourceId:'file:oil'});
  assert.deepEqual(facts.facts({subject:'Масло'}).map(x=>x.value),['0W20']);
  assert.equal(facts.history({subject:'Масло'}).length,2);
 }finally{db.close();}
});

test('neural sync excludes non-file sources even if they are not chats',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'private:internal',title:'Private',text:'sensitive internal data'});
  index.ingest({id:'file:public',title:'Public',text:'public technical reference'});
  new RagPermissions(db).set({sourceId:'file:public',allowed:true});
  const uploaded=[];
  const cloud={async request(path,{body}){uploaded.push(body.input);return {data:[{embedding:[1,0]}]};}};
  const neural=new NeuralRag(db,cloud,{model:'embed-test'});
  assert.equal((await neural.sync()).indexed,1);
  assert.deepEqual(uploaded,['public technical reference']);
 }finally{db.close();}
});
