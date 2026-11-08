import { openStorage } from '../src/storage.js';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const checks = { node: process.versions.node, platform: process.platform, cwd: process.cwd(), database: 'unknown', writable: false };
try {
  const db = openStorage();
  db.prepare('SELECT 1').get();
  checks.database = 'ok';
  db.close();
  mkdirSync('logs',{recursive:true});
  writeFileSync(join('logs','.write-test'),'ok');
  checks.writable = existsSync(join('logs','.write-test'));
} catch (error) { checks.error = String(error); }
console.log(JSON.stringify(checks,null,2));
if (checks.database !== 'ok' || !checks.writable) process.exitCode = 1;
