import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync,writeFileSync,unlinkSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {indexDirectory} from '../src/rag-import.js';

test('capped scans never remove previously indexed documents',()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-cap-'));
 const db=new DatabaseSync(':memory:');
 try{
  writeFileSync(join(root,'a.md'),'First document');
  writeFileSync(join(root,'b.md'),'Second document');
  assert.equal(indexDirectory(db,root,{maxFiles:10}).changed,2);
  unlinkSync(join(root,'a.md'));
  const partial=indexDirectory(db,root,{maxFiles:1});
  assert.equal(partial.removed,0);
  assert.equal(partial.complete,false);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_sources').get().n,2);
  const full=indexDirectory(db,root,{maxFiles:10});
  assert.equal(full.removed,1);
  assert.equal(full.complete,true);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_sources').get().n,1);
 }finally{db.close();rmSync(root,{recursive:true,force:true});}
});

test('failed source tracking transaction rolls back all cleanup',()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-rollback-'));
 const db=new DatabaseSync(':memory:');
 try{
  writeFileSync(join(root,'a.md'),'First source');
  writeFileSync(join(root,'b.md'),'Second source');
  indexDirectory(db,root,{maxFiles:10});
  unlinkSync(join(root,'a.md'));
  db.exec(`CREATE TRIGGER fail_root_cleanup BEFORE DELETE ON rag_file_roots
   BEGIN SELECT RAISE(ABORT,'simulated tracking failure'); END;`);
  assert.throws(()=>indexDirectory(db,root,{maxFiles:10}),/simulated tracking failure/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_sources').get().n,2);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_file_roots').get().n,2);
  db.exec('DROP TRIGGER fail_root_cleanup');
  assert.equal(indexDirectory(db,root,{maxFiles:10}).removed,1);
 }finally{db.close();rmSync(root,{recursive:true,force:true});}
});
