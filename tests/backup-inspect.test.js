import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {inspectBackups} from '../src/backup-inspect.js';

test('backup inventory validates snapshots and identifies damaged copies',()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-inspect-'));
 try{
  assert.deepEqual(inspectBackups({root}),[]);
  const folder=join(root,'data','backups');mkdirSync(folder,{recursive:true});
  const valid=join(folder,'tsukamiyora-2026-11-08T01-00-00-000Z.sqlite');
  const db=new DatabaseSync(valid);db.exec('CREATE TABLE evidence(id INTEGER)');db.close();
  writeFileSync(join(folder,'tsukamiyora-2026-11-08T02-00-00-000Z.sqlite'),'not a database');
  const unique=join(folder,'tsukamiyora-2026-11-08T03-00-00-000Z-a1b2c3d4.sqlite');
  const fresh=new DatabaseSync(unique);fresh.exec('CREATE TABLE evidence(id INTEGER)');fresh.close();
  const result=inspectBackups({root});
  assert.equal(result.length,3);
  assert.equal(result[0].valid,true);
  assert.equal(result[1].valid,false);
  assert.equal(result[2].valid,true);
  assert.throws(()=>inspectBackups({root,limit:101}),/Invalid backup inspection options/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
