import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { openStorage } from './storage.js';
import { KnowledgeIndex } from './rag.js';
import { RagPipeline } from './rag-pipeline.js';
import { RagIntelligence } from './rag-intelligence.js';
import { ConversationMemory } from './rag-memory.js';
import { ChatContext } from './chat-context.js';
import { CloudRu } from './cloudru.js';
import { ChatService } from './chat-service.js';
import { NeuralRag } from './rag-neural.js';
import { HybridNeuralRag } from './rag-hybrid-neural.js';
import { KnowledgeLifecycle } from './rag-lifecycle.js';
import { MultiStepRag } from './rag-multistep.js';
import { RagPermissions } from './rag-permissions.js';
import { RagTopicGraph } from './rag-topic-graph.js';
import { RagKnowledgeAudit } from './rag-audit.js';
import { evaluateRag, compareRag } from './rag-evaluation.js';
import { createAutoIndexer } from './rag-auto.js';
import { tasks, metrics, modules, events } from './runtime.js';
import { mkdirSync, appendFileSync, readFileSync } from 'node:fs';
const app=Fastify({logger:false,bodyLimit:1048576});
await app.register(websocket);
const db=openStorage();
const rag=new KnowledgeIndex(db);
const ragPipeline=new RagPipeline(rag);
const ragIntelligence=new RagIntelligence(db);
const lifecycle=new KnowledgeLifecycle(db);
const multiStep=new MultiStepRag(rag);
const ragPermissions=new RagPermissions(db);
const topicGraph=new RagTopicGraph(db);
const knowledgeAudit=new RagKnowledgeAudit(db);
const memory=new ConversationMemory(db);
const chatContext=new ChatContext(db);
const cloud=new CloudRu();
const chatService=new ChatService(db,cloud);
mkdirSync('logs',{recursive:true});
const log=(message)=>appendFileSync('logs/core.jsonl',JSON.stringify({at:new Date().toISOString(),message})+'\n');
const autoIndex=createAutoIndexer(db,{log});
app.addHook('onRequest',async(req,reply)=>{
 const host=req.headers.host;
 const expectedPort=String(process.env.TSUKAMIYORA_PORT||4177);
 if(typeof host!=='string'||!['127.0.0.1:'+expectedPort,'localhost:'+expectedPort].includes(host.toLowerCase())){
  reply.code(403);return reply.send({error:'forbidden_host'});
 }
 if(req.method!=='GET'&&req.method!=='HEAD'){
  const origin=req.headers.origin;
  if(origin){
   let url;try{url=new URL(origin);}catch{reply.code(403);return reply.send({error:'invalid_origin'});}
   if(!['127.0.0.1','localhost'].includes(url.hostname)||url.port!==String(process.env.TSUKAMIYORA_PORT||4177)){reply.code(403);return reply.send({error:'forbidden_origin'});}
  }
 }
});
app.get('/chat',async(req,reply)=>{reply.type('text/html; charset=utf-8');return readFileSync(new URL('../public/chat.html',import.meta.url),'utf8');});
app.post('/api/chat/stream',async(req,reply)=>{
 let generator;
 try{generator=chatService.respond(req.body??{});const first=await generator.next();
  reply.hijack();reply.raw.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache','X-Accel-Buffering':'no'});
  const send=item=>reply.raw.write('data: '+JSON.stringify(item)+'\n\n');
  if(!first.done)send(first.value);
  try{for await(const event of generator)send(event);}
  catch(e){send({type:'error',error:e.message});}
  reply.raw.end();
 }catch(e){reply.code(400);return {error:e.message};}
});
app.get('/settings',async(req,reply)=>{reply.type('text/html; charset=utf-8');return readFileSync(new URL('../public/settings.html',import.meta.url),'utf8');});
app.get('/api/cloud/settings',async()=>cloud.publicSettings());
app.post('/api/cloud/settings',async(req,reply)=>{try{return cloud.save(req.body??{});}catch(e){reply.code(400);return {error:e.message};}});
app.get('/api/cloud/models',async(req,reply)=>{try{return await cloud.models();}catch(e){reply.code(e.status||503);return {error:e.message};}});
app.post('/api/cloud/test',async(req,reply)=>{try{return await cloud.testModel();}catch(e){reply.code(e.status||503);return {error:e.message};}});
app.post('/api/cloud/chat',async(req,reply)=>{try{const response=await cloud.complete(req.body?.messages);return {message:response.choices?.[0]?.message??null,usage:response.usage??null};}catch(e){reply.code(e.status||503);return {error:e.message};}});
app.get('/health',async()=>{db.prepare('SELECT 1').get();return {status:'ok',service:'tsukamiyora-core',version:'0.3.0',database:'ok'};});
app.get('/',async()=>({name:'Tsukamiyora Core',status:'running',settings:'/settings',chat:'/chat',endpoints:['/health','/api/events','/api/metrics','/api/modules','/api/tasks','/api/rag/search','/api/rag/documents','/api/rag/context','/api/rag/status','/ws']}));
app.get('/api/metrics',async()=>({...metrics(),chat:chatService.metrics()}));
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

app.post('/api/chat/context',async(req,reply)=>{
 try{return chatContext.prepare(req.body??{});}
 catch(error){reply.code(400);return {error:String(error.message)};}
});
app.post('/api/memory/messages',async(req,reply)=>{
 try{const result=memory.append(req.body??{});reply.code(result.created?201:200);return result;}
 catch(error){reply.code(400);return {error:String(error.message)};}
});
app.get('/api/memory/:conversationId',async(req,reply)=>{
 try{return {messages:memory.history(req.params.conversationId,{limit:Number(req.query?.limit??50)})};}
 catch(error){reply.code(400);return {error:String(error.message)};}
});
app.post('/api/rag/semantic/index',async(req,reply)=>{try{return ragIntelligence.sync({limit:Number(req.body?.limit??500)});}catch(e){reply.code(400);return {error:e.message};}});
app.get('/api/rag/semantic/search',async(req,reply)=>{try{return {results:ragIntelligence.semantic(req.query?.q??'',{limit:Number(req.query?.limit??5)})};}catch(e){reply.code(400);return {error:e.message};}});
// Neural search is opt-in: a model must be explicitly supplied per request.
const neuralByModel=new Map();
const neural=model=>{
 if(typeof model!=='string'||!model.trim()||model.length>256||!/^[\w./:-]+$/.test(model))throw Error('Invalid embedding model');
 if(!neuralByModel.has(model))neuralByModel.set(model,new NeuralRag(db,cloud,{model}));
 return neuralByModel.get(model);
};
app.get('/api/rag/cloud/permissions',async()=>({sources:ragPermissions.list()}));
app.post('/api/rag/cloud/permissions',async(req,reply)=>{try{return ragPermissions.set(req.body??{});}catch(e){reply.code(400);return {error:e.message};}});
app.post('/api/rag/neural/index',async(req,reply)=>{try{
 const engine=neural(req.body?.model);
 return await engine.sync({limit:req.body?.limit??25});
}catch(e){reply.code(e.status||400);return {error:e.message};}});
app.post('/api/rag/neural/hybrid',async(req,reply)=>{try{
 const model=req.body?.model;
 const engine=neural(model);
 const hybrid=new HybridNeuralRag(rag,cloud,{model:engine.embeddings.model});
 return await hybrid.retrieve(req.body?.query,{limit:req.body?.limit??5});
}catch(e){reply.code(e.status||400);return {error:e.message};}});
app.post('/api/rag/neural/search',async(req,reply)=>{try{
 const engine=neural(req.body?.model);
 return {results:await engine.search(req.body?.query,{limit:req.body?.limit??5})};
}catch(e){reply.code(e.status||400);return {error:e.message};}});
app.get('/api/rag/audit',async(req,reply)=>{try{return knowledgeAudit.inspect({limit:Number(req.query?.limit??100),staleDays:Number(req.query?.staleDays??90)});}catch(e){reply.code(400);return {error:e.message};}});
app.post('/api/rag/maintenance',async(req,reply)=>{try{return knowledgeAudit.maintain();}catch(e){reply.code(500);return {error:e.message};}});
app.post('/api/rag/topics/rebuild',async(req,reply)=>{try{return topicGraph.rebuild(req.body??{});}catch(e){reply.code(400);return {error:e.message};}});
app.get('/api/rag/topics/related',async(req,reply)=>{try{return {results:topicGraph.related(req.query?.topic,{limit:Number(req.query?.limit??30)})};}catch(e){reply.code(400);return {error:e.message};}});
app.post('/api/rag/multistep',async(req,reply)=>{try{return multiStep.search(req.body?.query,{limit:req.body?.limit??5,maxSteps:req.body?.maxSteps??3});}catch(e){reply.code(400);return {error:e.message};}});
app.post('/api/rag/knowledge/extract',async(req,reply)=>{try{return lifecycle.extract(req.body??{});}catch(e){reply.code(400);return {error:e.message};}});
app.get('/api/rag/knowledge/facts',async(req,reply)=>{try{return {facts:lifecycle.facts({subject:req.query?.subject,limit:Number(req.query?.limit??50)})};}catch(e){reply.code(400);return {error:e.message};}});
app.get('/api/rag/knowledge/history',async(req,reply)=>{try{return {history:lifecycle.history({subject:req.query?.subject,predicate:req.query?.predicate??'значение'})};}catch(e){reply.code(400);return {error:e.message};}});
app.get('/api/rag/knowledge/stale',async(req,reply)=>{try{return {stale:lifecycle.stale({days:Number(req.query?.days??90)})};}catch(e){reply.code(400);return {error:e.message};}});
app.post('/api/rag/evaluate',async(req,reply)=>{try{return evaluateRag(rag,req.body?.cases,{limit:req.body?.limit??5,mode:req.body?.mode??'adaptive'});}catch(e){reply.code(400);return {error:e.message};}});
app.post('/api/rag/evaluate/compare',async(req,reply)=>{try{return compareRag(req.body?.before,req.body?.after);}catch(e){reply.code(400);return {error:e.message};}});
app.get('/api/rag/duplicates',async(req,reply)=>{try{return {duplicates:ragIntelligence.duplicates({limit:Number(req.query?.limit??100)})};}catch(e){reply.code(400);return {error:e.message};}});
app.get('/api/rag/contradictions',async(req,reply)=>{try{return {contradictions:ragIntelligence.contradictions({limit:Number(req.query?.limit??100)})};}catch(e){reply.code(400);return {error:e.message};}});
app.get('/api/rag/graph',async(req,reply)=>{try{return {relations:ragIntelligence.graph(req.query?.subject??'')};}catch(e){reply.code(400);return {error:e.message};}});
app.post('/api/rag/temporal/facts',async(req,reply)=>{try{return ragIntelligence.recordFact(req.body??{});}catch(e){reply.code(400);return {error:e.message};}});
app.post('/api/rag/feedback',async(req,reply)=>{try{return ragIntelligence.rate(req.body??{});}catch(e){reply.code(400);return {error:e.message};}});
app.get('/api/rag/intelligence/status',async()=>ragIntelligence.metrics());
app.get('/api/rag/status',async()=>({
 retrieval:ragPipeline.metrics(),
 sources:db.prepare('SELECT COUNT(*) AS count FROM rag_sources').get().count,
 chunks:db.prepare('SELECT COUNT(*) AS count FROM rag_chunks').get().count,
 relations:db.prepare('SELECT COUNT(*) AS count FROM rag_edges').get().count,
 facts:db.prepare('SELECT COUNT(*) AS count FROM rag_facts').get().count
}));
app.post('/api/rag/documents',async(req,reply)=>{
 try{const result=rag.ingest(req.body??{});reply.code(result.changed?201:200);return result;}
 catch(error){reply.code(400);return {error:String(error.message)};}
});
app.get('/api/rag/retrieve',async(req,reply)=>{
 try{return ragPipeline.retrieve(req.query?.q??'',{limit:Number(req.query?.limit??5)});}
 catch(error){reply.code(400);return {error:String(error.message)};}
});
app.get('/api/rag/search',async(req,reply)=>{
 try{return {results:rag.search(req.query?.q??'',{limit:Number(req.query?.limit??5)})};}
 catch(error){reply.code(400);return {error:String(error.message)};}
});
app.get('/api/rag/context',async(req,reply)=>{
 try{return ragPipeline.context(req.query?.q??'',{limit:Number(req.query?.limit??5)});}
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
