import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
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

test('backup retention never removes unrelated SQLite files',async()=>{
 const root=mkdtempSync(join(tmpdir(),'tsuka-backup-retention-'));
 try{
  const data=join(root,'data'),folder=join(data,'backups');
  mkdirSync(folder,{recursive:true});
  const db=new DatabaseSync(join(data,'tsukamiyora.sqlite'));db.exec('CREATE TABLE data(value TEXT)');db.close();
  const unrelated=join(folder,'tsukamiyora-my-personal-notes.sqlite');
  writeFileSync(unrelated,'do not touch');
  for(let i=0;i<3;i++)await backupDatabase({root,retention:1});
  assert.equal(readdirSync(folder).filter(name=>/^tsukamiyora-\d{4}.*\.sqlite$/.test(name)).length,1);
   assert.equal(readdirSync(folder).filter(name=>/^tsukamiyora-\d{4}.*\.sqlite\.sha256$/.test(name)).length,1);
  assert.ok(readdirSync(folder).includes('tsukamiyora-my-personal-notes.sqlite'));
 }finally{rmSync(root,{recursive:true,force:true});}
});
