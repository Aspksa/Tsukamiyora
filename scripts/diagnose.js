import { openStorage } from '../src/storage.js';
import { inspectBackups } from '../src/backup-inspect.js';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
const checks = { node: process.versions.node, platform: process.platform, cwd: process.cwd(), database: 'unknown', writable: false, backups: {total:0,valid:0,invalid:0} };
try {
  const db = openStorage();
  db.prepare('SELECT 1').get();
  const integrity=db.prepare('PRAGMA quick_check').get();
  checks.database = Object.values(integrity)[0]==='ok'?'ok':'integrity_failed';
  db.close();
  mkdirSync('logs',{recursive:true});
  writeFileSync(join('logs','.write-test'),'ok');
  checks.writable = existsSync(join('logs','.write-test'));
  unlinkSync(join('logs','.write-test'));
  const backups=inspectBackups({limit:100});
  checks.backups={total:backups.length,valid:backups.filter(x=>x.valid).length,invalid:backups.filter(x=>!x.valid).length};
} catch (error) { checks.error = String(error); }
console.log(JSON.stringify(checks,null,2));
if (checks.database !== 'ok' || !checks.writable || checks.backups.invalid>0) process.exitCode = 1;
