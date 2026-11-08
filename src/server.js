import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { openStorage } from './storage.js';
import { tasks, metrics, modules, events } from './runtime.js';
import { mkdirSync, appendFileSync } from 'node:fs';
const app=Fastify({logger:false,bodyLimit:1048576});
await app.register(websocket);
const db=openStorage();
mkdirSync('logs',{recursive:true});
const log=(message)=>appendFileSync('logs/core.jsonl',JSON.stringify({at:new Date().toISOString(),message})+'\n');
app.get('/health',async()=>{db.prepare('SELECT 1').get();return {status:'ok',service:'tsukamiyora-core',version:'0.3.0',database:'ok'};});
app.get('/',async()=>({name:'Tsukamiyora Core',status:'running',endpoints:['/health','/api/events','/api/metrics','/api/modules','/api/tasks','/ws']}));
app.get('/api/metrics',async()=>metrics());
app.get('/api/modules',async()=>({modules:modules()}));
app.post('/api/tasks',async(req,reply)=>{
 const {kind,payload,priority=0}=req.body??{};
 if(!['hash','sum'].includes(kind)||!Number.isInteger(priority)||priority<0||priority>10){reply.code(400);return {error:'invalid_task'};}
 if(kind==='hash'&&(typeof payload!=='string'||payload.length>1000000)){reply.code(400);return {error:'invalid_payload'};}
 if(kind==='sum'&&(!Array.isArray(payload)||payload.length>100000||!payload.every(x=>typeof x==='number'&&Number.isFinite(x)))){reply.code(400);return {error:'invalid_payload'};}
 try {const id=tasks.submit(kind,payload,{priority});reply.code(202);return {id,status:'queued'};}
 catch(e){reply.code(503);return {error:e.message};}
});
app.get('/api/tasks/:id',async(req,reply)=>{const task=tasks.get(req.params.id);if(!task){reply.code(404);return {error:'not_found'};}return task;});
app.get('/api/events',async()=>({events:db.prepare('SELECT id,kind,detail,created_at FROM events ORDER BY id DESC LIMIT 50').all()}));
app.get('/ws',{websocket:true},(socket)=>{
 const notify=event=>{if(socket.readyState===1)socket.send(JSON.stringify({type:'task:finished',...event}));};
 events.on('task:finished',notify);
 socket.on('close',()=>events.off('task:finished',notify));
 socket.send(JSON.stringify({type:'connected',service:'tsukamiyora-core'}));
 socket.on('message',data=>{if(data.length>65536){socket.close(1009);return;}socket.send(JSON.stringify({type:'echo',text:data.toString()}));});
});
const port=Number(process.env.TSUKAMIYORA_PORT||4177);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port');
let stopping=false;
async function stop(){if(stopping)return;stopping=true;try{tasks.close();await app.close();db.close();}catch(e){log(String(e));process.exitCode=1;}}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
try{await app.listen({host:'127.0.0.1',port});log('Listening on '+port);}catch(e){log(String(e));console.error(e);process.exitCode=1;await stop();}
