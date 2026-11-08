import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync,readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {backupDatabase} from '../src/backup.js';

test('backup produces an integrity-checked SQLite snapshot',async()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-backup-'));
 try{
  mkdirSync(join(root,'data'));
  const db=new DatabaseSync(join(root,'data','tsukamiyora.sqlite'));
  db.exec('CREATE TABLE items(value TEXT); INSERT INTO items VALUES(\'important\')');
  db.close();
  const first=await backupDatabase({root,retention:2});
  const check=new DatabaseSync(first);
  assert.equal(check.prepare('SELECT value FROM items').get().value,'important');
  assert.equal(check.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  check.close();
  await new Promise(resolve=>setTimeout(resolve,5));
  await backupDatabase({root,retention:2});
  await new Promise(resolve=>setTimeout(resolve,5));
  await backupDatabase({root,retention:2});
  const files=readdirSync(join(root,'data','backups'));
  assert.equal(files.filter(name=>name.endsWith('.sqlite')).length,2);
  assert.equal(files.some(name=>name.endsWith('.partial')),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('backup skips missing database and validates retention',async()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-backup-empty-'));
 try{
  assert.match(await backupDatabase({root}),/skipped/);
  await assert.rejects(backupDatabase({root,retention:0}),/Invalid backup options/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
