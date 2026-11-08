import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {indexDirectory} from '../src/rag-import.js';
import {RagTopicGraph} from '../src/rag-topic-graph.js';
import {createAutoIndexer,loadIndexConfig} from '../src/rag-auto.js';

test('local file changes refresh topic graph without Cloud requests',()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-topic-')),db=new DatabaseSync(':memory:');
 try{
  const file=join(root,'manual.md');
  writeFileSync(file,'двигатель масло фильтр');
  assert.equal(indexDirectory(db,root).changed,1);
  const graph=new RagTopicGraph(db);
  assert.equal(graph.related('двигатель').length,1);
  writeFileSync(file,'колесо тормоз');
  assert.equal(indexDirectory(db,root).changed,1);
  assert.equal(graph.related('двигатель').length,0);
  assert.equal(graph.related('колесо').length,1);
  rmSync(file);
  assert.equal(indexDirectory(db,root).removed,1);
  assert.equal(graph.related('колесо').length,0);
 }finally{db.close();rmSync(root,{recursive:true,force:true});}
});

test('automatic indexing rejects folders outside project root',()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-guard-')),db=new DatabaseSync(':memory:');
 try{
  const settings=loadIndexConfig(root);
  settings.folders=['../private'];
  writeFileSync(join(root,'data','rag-settings.json'),JSON.stringify(settings));
  const result=createAutoIndexer(db,{root}).run();
  assert.match(result.results[0].error,/outside project root/);
 }finally{db.close();rmSync(root,{recursive:true,force:true});}
});
