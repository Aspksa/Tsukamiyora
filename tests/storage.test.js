import test from 'node:test';
import assert from 'node:assert/strict';
import { openStorage } from '../src/storage.js';
test('SQLite schema persists key-value data',()=>{
 const db=openStorage();
 db.prepare('INSERT OR REPLACE INTO kv(key,value) VALUES(?,?)').run('__selftest__','ok');
 assert.equal(db.prepare('SELECT value FROM kv WHERE key=?').get('__selftest__').value,'ok');
 db.prepare('DELETE FROM kv WHERE key=?').run('__selftest__');
 db.close();
});
