import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { indexDirectory } from '../src/rag-import.js';
import { KnowledgeIndex } from '../src/rag.js';
test('local library indexes supported text files without duplicating unchanged content',()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-rag-import-'));const db=new DatabaseSync(':memory:');
 try{
  mkdirSync(join(root,'notes'));writeFileSync(join(root,'notes','a.md'),'Тестовая память проекта');
  writeFileSync(join(root,'notes','ignore.exe'),'not a text document');
  const first=indexDirectory(db,root);assert.equal(first.changed,1);
  assert.equal(indexDirectory(db,root).changed,0);
  assert.equal(new KnowledgeIndex(db).search('Тестовая память').length,1);
  writeFileSync(join(root,'notes','a.md'),'Обновленная память проекта');
  assert.equal(indexDirectory(db,root).changed,1);
  assert.equal(new KnowledgeIndex(db).search('Тестовая').length,0);
 }finally{db.close();rmSync(root,{recursive:true,force:true});}
});
