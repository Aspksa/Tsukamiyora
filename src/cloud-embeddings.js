// Optional Cloud.ru OpenAI-compatible embeddings adapter.
// Never sends data unless explicitly invoked with a configured embedding model.
import {createHash} from 'node:crypto';
export class CloudEmbeddings {
 constructor(cloud,{model,cacheSize=256}={}){
  if(typeof model!=='string'||!model.trim()||model.length>256||!/^[\w./:-]+$/.test(model))throw Error('Invalid embedding model');
  if(!Number.isInteger(cacheSize)||cacheSize<1||cacheSize>10000)throw Error('Invalid cache size');
  this.cloud=cloud;this.model=model;this.cacheSize=cacheSize;this.cache=new Map();this.inFlight=new Map();this.stats={requests:0,cacheHits:0,coalesced:0};
 }
 async embed(text){
  if(typeof text!=='string'||!text.trim()||text.length>16000)throw Error('Invalid embedding input');
  const key=createHash('sha256').update(this.model+'\0'+text).digest('hex');
  if(this.cache.has(key)){this.stats.cacheHits++;return [...this.cache.get(key)];}
  if(this.inFlight.has(key)){this.stats.coalesced++;return [...await this.inFlight.get(key)];}
  const pending=(async()=>{
   const response=await this.cloud.request('/embeddings',{method:'POST',body:{model:this.model,input:text},timeout:30000});
   const vector=response?.data?.[0]?.embedding;
   if(!Array.isArray(vector)||!vector.length||vector.length>8192||!vector.every(x=>typeof x==='number'&&Number.isFinite(x)))throw Error('Invalid embedding response');
   if(this.cache.size>=this.cacheSize)this.cache.delete(this.cache.keys().next().value);
   this.cache.set(key,[...vector]);this.stats.requests++;
   return vector;
  })();
  this.inFlight.set(key,pending);
  try{return [...await pending];}finally{this.inFlight.delete(key);}
 }
 metrics(){return {...this.stats,cached:this.cache.size};}
}
