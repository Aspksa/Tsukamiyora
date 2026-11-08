import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {chunkDocument} from '../src/rag-chunking.js';
import {CloudEmbeddings} from '../src/cloud-embeddings.js';

test('structure aware chunker keeps paragraphs when possible and never exceeds size',()=>{
 const paragraphs=['Первый абзац с важным смыслом.','Второй абзац с другим смыслом.','Третий абзац.'];
 const text=paragraphs.join('\n\n')+'\n'+'д'.repeat(1000);
 const chunks=chunkDocument(text,{chunkSize:200});
 assert.ok(chunks.length>2);
 assert.ok(chunks.every(x=>x.length<=200));
 assert.equal(chunks.join(''),text);
 assert.ok(chunks[0].includes(paragraphs[0]));
});

test('embeddings survive restart without another Cloud request',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  let calls=0;
  const cloud={async request(){calls++;return {data:[{embedding:[0.5,0.25]}]};}};
  const first=new CloudEmbeddings(cloud,{model:'test',db});
  assert.deepEqual(await first.embed('тестовый запрос'),[0.5,0.25]);
  const restarted=new CloudEmbeddings(cloud,{model:'test',db});
  assert.deepEqual(await restarted.embed('тестовый запрос'),[0.5,0.25]);
  assert.equal(calls,1);
  assert.equal(restarted.metrics().cacheHits,1);
 }finally{db.close();}
});
