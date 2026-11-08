import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { backupDatabase } from './backup.js';
mkdirSync('logs',{recursive:true});
let child, stopping=false, attempts=0, timer;
const log = (message) => { const line=JSON.stringify({time:new Date().toISOString(),component:'supervisor',message})+'\n'; appendFileSync(join('logs','supervisor.jsonl'),line); console.log(message); };
async function backup() { try { const result=await backupDatabase(); log('Backup '+result); } catch(e) { log('Backup failed: '+String(e)); } }
function start() {
 if(stopping) return;
 child=spawn(process.execPath,[join(process.cwd(),'src','server.js')],{cwd:process.cwd(),env:process.env,stdio:'inherit'});
 const started=Date.now();
 child.once('exit',(code,signal)=>{
  child=null;
  if(stopping) return;
  if(Date.now()-started>60000) attempts=0;
  attempts++;
  if(attempts>5){ log('Restart limit reached; manual intervention required'); process.exitCode=1; return; }
  const delay=Math.min(30000,1000*2**(attempts-1));
  log(`Server exited (code=${code}, signal=${signal}); restarting in ${delay}ms`);
  timer=setTimeout(start,delay);
 });
 child.once('error',error=>log('Spawn error: '+String(error)));
}
function stop(){stopping=true;clearTimeout(timer);clearInterval(backupTimer);if(child)child.kill();else process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
const backupTimer=setInterval(backup,5*60*60*1000);
backup().finally(start);
