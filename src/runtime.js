import { Worker } from 'node:worker_threads';
import { EventEmitter } from 'node:events';
import { cpus, freemem, totalmem } from 'node:os';
import { randomUUID } from 'node:crypto';
export const events = new EventEmitter();
events.setMaxListeners(50);
const registry = new Map();
export function registerModule(name, factory) {
 if (!/^[a-z][a-z0-9-]{1,48}$/.test(name) || typeof factory !== 'function' || registry.has(name)) throw Error('Invalid or duplicate module');
 registry.set(name, factory);
}
export function modules() { return [...registry.keys()]; }
export class TTLCache {
 #items = new Map();
 constructor(limit=256) { this.limit=limit; }
 get(key) { const entry=this.#items.get(key); if(!entry)return; if(entry.expires<=Date.now()){this.#items.delete(key);return;} return entry.value; }
 set(key,value,ttl=60000) { if(this.#items.size>=this.limit)this.#items.delete(this.#items.keys().next().value); this.#items.set(key,{value,expires:Date.now()+ttl}); }
 clear(){this.#items.clear();}
}
export const cache=new TTLCache();
export class TaskQueue {
 constructor({concurrency=2,capacity=100}={}){this.concurrency=concurrency;this.capacity=capacity;this.waiting=[];this.active=0;this.closed=false;this.tasks=new Map();}
 submit(kind,payload,{priority=0}={}) {
  if(this.closed||this.waiting.length>=this.capacity)throw Error('Task queue unavailable');
  if(kind!=='hash'&&kind!=='sum')throw Error('Unsupported task type');
  const id=randomUUID();const item={id,kind,payload,priority,status:'queued',createdAt:Date.now()};
  this.tasks.set(id,item);this.waiting.push(item);this.waiting.sort((a,b)=>b.priority-a.priority);this.#drain();return id;
 }
 #drain(){
  while(!this.closed&&this.active<this.concurrency&&this.waiting.length){
   const task=this.waiting.shift();this.active++;task.status='running';
   const worker=new Worker(new URL('./task-worker.js',import.meta.url),{workerData:{kind:task.kind,payload:task.payload}});
   let finished=false;
   const finish=(error,result)=>{
    if(finished)return;finished=true;this.active--;
    task.status=error?'failed':'done';task.completedAt=Date.now();
    if(error)task.error=String(error);else task.result=result;
    events.emit('task:finished',{id:task.id,status:task.status});
    worker.terminate().catch(()=>{});this.#drain();
   };
   worker.once('message',value=>finish(null,value));
   worker.once('error',error=>finish(error));
   worker.once('exit',code=>{if(!finished)finish(Error('Worker exited '+code));});
  }
 }
 get(id){return this.tasks.get(id);}
 close(){this.closed=true;}
}
export const tasks=new TaskQueue();
export function metrics(){const m=process.memoryUsage();return {uptimeSeconds:Math.floor(process.uptime()),rssBytes:m.rss,heapUsedBytes:m.heapUsed,freeMemoryBytes:freemem(),totalMemoryBytes:totalmem(),cpuCount:cpus().length,queueWaiting:tasks.waiting.length,queueActive:tasks.active};}
