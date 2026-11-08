import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {KnowledgeIndex} from '../src/rag.js';
import {RagTopicGraph} from '../src/rag-topic-graph.js';
import {indexDirectory} from '../src/rag-import.js';

test('failed graph update rolls back document and retains prior searchable content',()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-atomic-')),db=new DatabaseSync(':memory:');
 try{
  const path=join(root,'manual.md');
  writeFileSync(path,'двигатель масло фильтр');
  assert.equal(indexDirectory(db,root).changed,1);
  db.exec(`CREATE TRIGGER deny_topics BEFORE INSERT ON rag_topic_links
    BEGIN SELECT RAISE(ABORT,'simulated topic failure'); END;`);
  writeFileSync(path,'колесо тормоз');
  const result=indexDirectory(db,root);
  assert.equal(result.changed,0);
  assert.ok(result.skipped>0);
  const index=new KnowledgeIndex(db),graph=new RagTopicGraph(db);
  assert.equal(index.search('двигатель').length,1);
  assert.equal(index.search('колесо').length,0);
  assert.equal(graph.related('двигатель').length,1);
  db.exec('DROP TRIGGER deny_topics');
  assert.equal(indexDirectory(db,root).changed,1);
  assert.equal(index.search('колесо').length,1);
 }finally{db.close();rmSync(root,{recursive:true,force:true});}
});
