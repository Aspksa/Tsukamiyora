import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createAutoIndexer, loadIndexConfig } from '../src/rag-auto.js';
import { KnowledgeIndex } from '../src/rag.js';
test('background indexer creates settings and scans local library automatically',async()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-auto-')),db=new DatabaseSync(':memory:');
 try{
  const settings=loadIndexConfig(root);
  assert.equal(settings.enabled,true);
  const library=join(root,'data','library');mkdirSync(library,{recursive:true});
  writeFileSync(join(library,'knowledge.md'),'Автоматическая индексация знаний');
  const indexer=createAutoIndexer(db,{root});
  indexer.start();
  const deadline=Date.now()+2000;
  while(new KnowledgeIndex(db).search('индексация').length===0){
   if(Date.now()>deadline)throw Error('automatic indexing timeout');
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(indexer.run().results[0].changed,0);
  indexer.stop();
  assert.equal(indexer.run().skipped,true);
  assert.ok(readFileSync(join(root,'data','rag-settings.json'),'utf8').includes('intervalMinutes'));
 }finally{db.close();rmSync(root,{recursive:true,force:true});}
});

test('scheduled indexer exposes queue status and avoids duplicate queued scans',async()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-queue-')),db=new DatabaseSync(':memory:');
 try{
  const library=join(root,'data','library');mkdirSync(library,{recursive:true});
  writeFileSync(join(library,'knowledge.md'),'Фоновая очередь обновляет знания');
  const indexer=createAutoIndexer(db,{root});
  assert.deepEqual(indexer.enqueue(),{queued:true});
  assert.deepEqual(indexer.enqueue(),{queued:false,reason:'duplicate'});
  const deadline=Date.now()+2000;
  while(indexer.status().queue.completed===0){
   if(Date.now()>deadline)throw Error('queue timeout');
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(indexer.status().runCount,1);
  assert.equal(indexer.status().queue.failed,0);
  assert.ok(new KnowledgeIndex(db).search('очередь').length>0);
  indexer.stop();
 }finally{db.close();rmSync(root,{recursive:true,force:true});}
});
