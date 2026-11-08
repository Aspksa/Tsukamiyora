import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { restoreDatabase } from '../scripts/restore.js';
test('restore replaces database only after verifying backup',()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-restore-'));
 try {
  const data=join(root,'data');const backups=join(data,'backups');
  mkdirSync(backups,{recursive:true});
  const live=join(data,'tsukamiyora.sqlite');
  const backup=join(backups,'valid.sqlite');
  let db=new DatabaseSync(live);db.exec('CREATE TABLE sample(value TEXT); INSERT INTO sample VALUES (\'old\')');db.close();
  db=new DatabaseSync(backup);db.exec('CREATE TABLE sample(value TEXT); INSERT INTO sample VALUES (\'new\')');db.close();
  const invalid=join(backups,'invalid.sqlite');writeFileSync(invalid,'not sqlite');
  assert.throws(()=>restoreDatabase(invalid,{root}));
  db=new DatabaseSync(live);assert.equal(db.prepare('SELECT value FROM sample').get().value,'old');db.close();
  restoreDatabase(backup,{root});
  db=new DatabaseSync(live);assert.equal(db.prepare('SELECT value FROM sample').get().value,'new');db.close();
  assert.throws(()=>restoreDatabase(join(root,'outside.sqlite'),{root}));
 }finally{rmSync(root,{recursive:true,force:true});}
});
