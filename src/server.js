import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { openStorage } from './storage.js';
import { mkdirSync, appendFileSync } from 'node:fs';
const app=Fastify({logger:false,bodyLimit:1048576});
await app.register(websocket);
const db=openStorage();
mkdirSync('logs',{recursive:true});
const log=(message)=>appendFileSync('logs/core.jsonl',JSON.stringify({at:new Date().toISOString(),message})+'\n');
app.get('/health',async()=>{db.prepare('SELECT 1').get();return {status:'ok',service:'tsukamiyora-core',version:'0.2.0',database:'ok'};});
app.get('/',async()=>({name:'Tsukamiyora Core',status:'running',endpoints:['/health','/api/events','/ws']}));
app.get('/api/events',async()=>({events:db.prepare('SELECT id,kind,detail,created_at FROM events ORDER BY id DESC LIMIT 50').all()}));
app.get('/ws',{websocket:true},(socket)=>{socket.send(JSON.stringify({type:'connected',service:'tsukamiyora-core'}));socket.on('message',data=>{if(data.length>65536){socket.close(1009);return;}socket.send(JSON.stringify({type:'echo',text:data.toString()}));});});
const port=Number(process.env.TSUKAMIYORA_PORT||4177);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port');
let stopping=false;
async function stop(){if(stopping)return;stopping=true;try{await app.close();db.close();}catch(e){log(String(e));process.exitCode=1;}}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
try{await app.listen({host:'127.0.0.1',port});log('Listening on '+port);}catch(e){log(String(e));console.error(e);process.exitCode=1;await stop();}
