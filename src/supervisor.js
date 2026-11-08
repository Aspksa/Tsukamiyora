import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { backupDatabase } from './backup.js';

mkdirSync('logs', { recursive: true });
let child = null;
let stopping = false;
let attempts = 0;
let restartTimer = null;
let backupBusy = false;
const log = message => {
  const line = JSON.stringify({ at: new Date().toISOString(), component: 'supervisor', message }) + '\n';
  try { appendFileSync(join('logs', 'supervisor.jsonl'), line); } catch { console.error(line); }
  console.log(message);
};
async function makeBackup() {
  if (backupBusy || stopping) return;
  backupBusy = true;
  try { log('Backup: ' + await backupDatabase()); }
  catch (error) { log('Backup failed: ' + String(error)); }
  finally { backupBusy = false; }
}
function launch() {
  if (stopping) return;
  const started = Date.now();
  const proc = spawn(process.execPath, [join(process.cwd(), 'src', 'server.js')], {
    cwd: process.cwd(), env: process.env, stdio: 'inherit'
  });
  child = proc;
  let settled = false;
  const onExit = (code, signal) => {
    if (settled) return;
    settled = true;
    if (child === proc) child = null;
    if (stopping) { process.exitCode = 0; return; }
    if (Date.now() - started >= 60000) attempts = 0;
    attempts++;
    if (attempts > 5) {
      log('Restart limit reached; inspect logs before restarting');
      process.exitCode = 1;
      clearInterval(backupTimer);
      return;
    }
    const delay = Math.min(30000, 1000 * 2 ** (attempts - 1));
    log(`Server stopped (code=${code}, signal=${signal}); retry in ${delay}ms`);
    restartTimer = setTimeout(launch, delay);
  };
  proc.once('error', error => { log('Spawn error: ' + String(error)); onExit(1, 'spawn-error'); });
  proc.once('exit', onExit);
}
function stop() {
  if (stopping) return;
  stopping = true;
  clearTimeout(restartTimer);
  clearInterval(backupTimer);
  if (child && !child.killed) {
    child.kill();
    setTimeout(() => { if (child) child.kill('SIGKILL'); }, 5000).unref();
  }
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
const backupTimer = setInterval(makeBackup, 5 * 60 * 60 * 1000);
launch();
makeBackup();
