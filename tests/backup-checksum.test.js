import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {backupDatabase} from '../src/backup.js';
import {inspectBackups} from '../src/backup-inspect.js';
import {checkRestoreCandidate} from '../src/backup-restore-check.js';

test('snapshot checksum detects tampering even when SQLite remains valid',async()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-hash-'));
 try{
  mkdirSync(join(root,'data'));
  const db=new DatabaseSync(join(root,'data','tsukamiyora.sqlite'));
  db.exec("CREATE TABLE notes(value TEXT); INSERT INTO notes VALUES('original')");
  db.close();
  const path=await backupDatabase({root});
  assert.match(readFileSync(path+'.sha256','utf8'),/^[0-9a-f]{64}\s*$/);
  assert.equal(inspectBackups({root})[0].checksum.valid,true);
  assert.equal(checkRestoreCandidate({root,filename:basename(path)}).ready,true);
  const modified=new DatabaseSync(path);
  modified.prepare('UPDATE notes SET value=?').run('changed');
  modified.close();
  assert.equal(inspectBackups({root})[0].valid,false);
  assert.equal(checkRestoreCandidate({root,filename:basename(path)}).reason,'checksum_mismatch');
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('malformed checksum sidecars are rejected',async()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-hash-bad-'));
 try{
  mkdirSync(join(root,'data'));
  const db=new DatabaseSync(join(root,'data','tsukamiyora.sqlite'));
  db.exec('CREATE TABLE notes(value TEXT)');db.close();
  const path=await backupDatabase({root});
  writeFileSync(path+'.sha256','not-a-digest');
  assert.equal(inspectBackups({root})[0].valid,false);
  assert.equal(checkRestoreCandidate({root,filename:basename(path)}).reason,'checksum_mismatch');
 }finally{rmSync(root,{recursive:true,force:true});}
});
