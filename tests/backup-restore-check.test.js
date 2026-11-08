import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {checkRestoreCandidate} from '../src/backup-restore-check.js';

test('restore preflight verifies integrity without replacing live database',()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-restore-'));
 try{
  const folder=join(root,'data','backups');mkdirSync(folder,{recursive:true});
  const good='tsukamiyora-2026-11-08T01-00-00-000Z-1234abcd.sqlite';
  const db=new DatabaseSync(join(folder,good));db.exec('CREATE TABLE saved(value TEXT); INSERT INTO saved VALUES(\'safe\')');db.close();
  const result=checkRestoreCandidate({root,filename:good});
  assert.equal(result.ready,true);
  assert.equal(result.restored,false);
  assert.deepEqual(result.checksum,{present:false,valid:null});
  const bad='tsukamiyora-2026-11-08T02-00-00-000Z.sqlite';
  writeFileSync(join(folder,bad),'corrupted');
  assert.equal(checkRestoreCandidate({root,filename:bad}).ready,false);
  assert.throws(()=>checkRestoreCandidate({root,filename:'../escape.sqlite'}),/Invalid restore candidate/);
  assert.equal(checkRestoreCandidate({root,filename:'tsukamiyora-2026-11-08T03-00-00-000Z.sqlite'}).reason,'not_found');
 }finally{rmSync(root,{recursive:true,force:true});}
});
