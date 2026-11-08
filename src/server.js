import { createServer } from 'node:http';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openStorage } from './storage.js';
const db = openStorage();
const host = '127.0.0.1';
const port = Number(process.env.TSUKAMIYORA_PORT || 4177);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
mkdirSync('logs', { recursive: true });
function log(level, message) {
  const line = JSON.stringify({ at: new Date().toISOString(), level, message }) + '\n';
  try { appendFileSync(join('logs','core.jsonl'), line); } catch { console.error(line); }
}
const server = createServer((req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'GET' && req.url === '/health') {
    try { db.prepare('SELECT 1').get(); send(200,{ status:'ok', service:'tsukamiyora-core', version:'0.1.0', database:'ok' }); }
    catch (error) { log('error',String(error)); send(503,{status:'error',database:'unavailable'}); }
  } else if (req.method === 'GET' && req.url === '/') {
    send(200,{ name:'Tsukamiyora Core', status:'running', endpoints:['/health'] });
  } else send(404,{error:'not_found'});
});
server.on('error',error => { log('error',String(error)); console.error(error); process.exitCode=1; });
server.listen(port,host,()=>{ log('info',`Listening on http://${host}:${port}`); console.log(`Tsukamiyora Core: http://${host}:${port}`); });
function stop() { server.close(()=>{ db.close(); process.exit(0); }); }
process.on('SIGINT',stop);
process.on('SIGTERM',stop);
