import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {NeuralRag} from '../src/rag-neural.js';
import {RagPermissions} from '../src/rag-permissions.js';

test('cloud indexing requires per-file consent and revocation removes vectors',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'file:manual',title:'Manual',text:'техническое обслуживание двигателя'});
  const permissions=new RagPermissions(db);
  let calls=0;
  const cloud={async request(){calls++;return {data:[{embedding:[1,0]}]};}};
  const neural=new NeuralRag(db,cloud,{model:'embed-test'});
  assert.equal((await neural.sync()).indexed,0);
  assert.deepEqual(await neural.search('private query'),[]);
  assert.equal(calls,0);
  assert.equal(permissions.list()[0].allowed,false);
  permissions.set({sourceId:'file:manual',allowed:true});
  assert.equal((await neural.sync()).indexed,1);
  assert.equal(calls,1);
  permissions.set({sourceId:'file:manual',allowed:false});
  assert.equal((await neural.sync()).indexed,0);
  assert.equal(neural.metrics().stored,0);
  assert.deepEqual(await neural.search('двигателя'),[]);
  assert.equal(calls,1);
  assert.throws(()=>permissions.set({sourceId:'chat:secret',allowed:true}),/Invalid/);
 }finally{db.close();}
});
