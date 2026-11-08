import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
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

test('removed file is purged after full scan but retained after truncated scan',()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-prune-')),db=new DatabaseSync(':memory:');
 try{
  writeFileSync(join(root,'one.md'),'Уникальный старый документ');
  writeFileSync(join(root,'two.md'),'Уникальный второй документ');
  assert.equal(indexDirectory(db,root).changed,2);
  unlinkSync(join(root,'one.md'));
  writeFileSync(join(root,'three.md'),'Дополнительный документ');
  const partial=indexDirectory(db,root,{maxFiles:1});
  assert.equal(partial.removed,0);
  const full=indexDirectory(db,root);
  assert.equal(full.removed,1);
  assert.equal(new KnowledgeIndex(db).search('старый').length,0);
  assert.equal(new KnowledgeIndex(db).search('второй').length,1);
 }finally{db.close();rmSync(root,{recursive:true,force:true});}
});
