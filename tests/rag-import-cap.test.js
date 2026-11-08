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
  assert.equal(indexDirectory(db,root,{maxFiles:1}).removed,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_sources').get().n,2);
  assert.equal(indexDirectory(db,root,{maxFiles:10}).removed,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_sources').get().n,1);
 }finally{db.close();rmSync(root,{recursive:true,force:true});}
});
