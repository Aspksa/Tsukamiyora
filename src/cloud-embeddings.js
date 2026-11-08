// Optional Cloud.ru OpenAI-compatible embeddings adapter.
// Never sends data unless explicitly invoked with a configured embedding model.
import {createHash} from 'node:crypto';
export class CloudEmbeddings {
 constructor(cloud,{model,cacheSize=256,db=null,ttlDays=30}={}){
  if(typeof model!=='string'||!model.trim()||model.length>256||!/^[\w./:-]+$/.test(model))throw Error('Invalid embedding model');
  if(!Number.isInteger(cacheSize)||cacheSize<1||cacheSize>10000)throw Error('Invalid cache size');
  if(!Number.isInteger(ttlDays)||ttlDays<1||ttlDays>365)throw Error('Invalid embedding TTL');
  this.db=db;this.ttlDays=ttlDays;
  if(db)db.exec('CREATE TABLE IF NOT EXISTS rag_embedding_cache(key TEXT PRIMARY KEY,vector TEXT NOT NULL,created_at INTEGER NOT NULL)');
  this.cloud=cloud;this.model=model;this.cacheSize=cacheSize;this.cache=new Map();this.inFlight=new Map();this.stats={requests:0,cacheHits:0,coalesced:0};
 }
 async embed(text){
  if(typeof text!=='string'||!text.trim()||text.length>16000)throw Error('Invalid embedding input');
  const key=createHash('sha256').update(this.model+'\0'+text).digest('hex');
  if(this.cache.has(key)){this.stats.cacheHits++;return [...this.cache.get(key)];}
  if(this.db){
   const stored=this.db.prepare('SELECT vector,created_at FROM rag_embedding_cache WHERE key=?').get(key);
   if(stored&&stored.created_at>Date.now()-this.ttlDays*86400000){
    try{const vector=JSON.parse(stored.vector);if(Array.isArray(vector)&&vector.length&&vector.every(Number.isFinite)){this.stats.cacheHits++;return vector;}}catch{}
   }
  }
  if(this.inFlight.has(key)){this.stats.coalesced++;return [...await this.inFlight.get(key)];}
  const pending=(async()=>{
   const response=await this.cloud.request('/embeddings',{method:'POST',body:{model:this.model,input:text},timeout:30000});
   const vector=response?.data?.[0]?.embedding;
   if(!Array.isArray(vector)||!vector.length||vector.length>8192||!vector.every(x=>typeof x==='number'&&Number.isFinite(x)))throw Error('Invalid embedding response');
   if(this.cache.size>=this.cacheSize)this.cache.delete(this.cache.keys().next().value);
   this.cache.set(key,[...vector]);
   if(this.db){
    this.db.prepare('INSERT INTO rag_embedding_cache(key,vector,created_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET vector=excluded.vector,created_at=excluded.created_at').run(key,JSON.stringify(vector),Date.now());
    this.db.prepare('DELETE FROM rag_embedding_cache WHERE created_at<?').run(Date.now()-this.ttlDays*86400000);
    const excess=this.db.prepare('SELECT COUNT(*) n FROM rag_embedding_cache').get().n-this.cacheSize*4;
    if(excess>0)this.db.prepare('DELETE FROM rag_embedding_cache WHERE key IN (SELECT key FROM rag_embedding_cache ORDER BY created_at ASC,key ASC LIMIT ?)').run(excess);
   }
   this.stats.requests++;
   return vector;
  })();
  this.inFlight.set(key,pending);
  try{return [...await pending];}finally{this.inFlight.delete(key);}
 }
 metrics(){return {...this.stats,cached:this.cache.size};}
}
