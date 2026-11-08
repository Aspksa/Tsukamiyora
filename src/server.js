import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { openStorage } from './storage.js';
import { KnowledgeIndex } from './rag.js';
import { createAutoIndexer } from './rag-auto.js';
import { tasks, metrics, modules, events } from './runtime.js';
import { mkdirSync, appendFileSync } from 'node:fs';
const app=Fastify({logger:false,bodyLimit:1048576});
await app.register(websocket);
const db=openStorage();
const rag=new KnowledgeIndex(db);
mkdirSync('logs',{recursive:true});
const log=(message)=>appendFileSync('logs/core.jsonl',JSON.stringify({at:new Date().toISOString(),message})+'\n');
const autoIndex=createAutoIndexer(db,{log});
app.get('/health',async()=>{db.prepare('SELECT 1').get();return {status:'ok',service:'tsukamiyora-core',version:'0.3.0',database:'ok'};});
app.get('/',async()=>({name:'Tsukamiyora Core',status:'running',endpoints:['/health','/api/events','/api/metrics','/api/modules','/api/tasks','/api/rag/search','/api/rag/documents','/api/rag/context','/api/rag/status','/ws']}));
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

app.get('/api/rag/status',async()=>({
 sources:db.prepare('SELECT COUNT(*) AS count FROM rag_sources').get().count,
 chunks:db.prepare('SELECT COUNT(*) AS count FROM rag_chunks').get().count,
 relations:db.prepare('SELECT COUNT(*) AS count FROM rag_edges').get().count,
 facts:db.prepare('SELECT COUNT(*) AS count FROM rag_facts').get().count
}));
app.post('/api/rag/documents',async(req,reply)=>{
 try{const result=rag.ingest(req.body??{});reply.code(result.changed?201:200);return result;}
 catch(error){reply.code(400);return {error:String(error.message)};}
});
app.get('/api/rag/search',async(req,reply)=>{
 try{return {results:rag.search(req.query?.q??'',{limit:Number(req.query?.limit??5)})};}
 catch(error){reply.code(400);return {error:String(error.message)};}
});
app.get('/api/rag/context',async(req,reply)=>{
 try{return {context:rag.context(req.query?.q??'',{limit:Number(req.query?.limit??5)})};}
 catch(error){reply.code(400);return {error:String(error.message)};}
});
app.post('/api/rag/relations',async(req,reply)=>{
 try{const {subject,relation,object,sourceId}=req.body??{};rag.relate(subject,relation,object,sourceId);reply.code(201);return {ok:true};}
 catch(error){reply.code(400);return {error:String(error.message)};}
});
app.get('/api/rag/relations',async(req,reply)=>{
 try{if(typeof req.query?.subject!=='string'||req.query.subject.length>200)throw Error('Invalid subject');return {relations:rag.neighbors(req.query.subject)};}
 catch(error){reply.code(400);return {error:String(error.message)};}
});
app.post('/api/rag/facts',async(req,reply)=>{
 try{const {subject,predicate,value,sourceId}=req.body??{};return rag.fact(subject,predicate,value,sourceId);}
 catch(error){reply.code(400);return {error:String(error.message)};}
});
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
async function stop(){if(stopping)return;stopping=true;try{autoIndex.stop();tasks.close();await app.close();db.close();}catch(e){log(String(e));process.exitCode=1;}}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
try{await app.listen({host:'127.0.0.1',port});log('Listening on '+port);autoIndex.start();}catch(e){log(String(e));console.error(e);process.exitCode=1;await stop();}
