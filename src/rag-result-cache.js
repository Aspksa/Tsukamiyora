// Bounded local cache for deterministic retrieval results. No network access.
export function createRagResultCache({capacity=128,ttlMs=60000}={}){
 if(!Number.isInteger(capacity)||capacity<1||capacity>10000||!Number.isInteger(ttlMs)||ttlMs<1||ttlMs>86400000)throw Error('Invalid RAG cache options');
 const entries=new Map();let hits=0,misses=0;
 const get=(key)=>{
  if(typeof key!=='string'||!key||key.length>4096)throw Error('Invalid cache key');
  const row=entries.get(key);
  if(!row||row.expires<=Date.now()){if(row)entries.delete(key);misses++;return null;}
  entries.delete(key);entries.set(key,row);hits++;
  return structuredClone(row.value);
 };
 const set=(key,value)=>{
  if(typeof key!=='string'||!key||key.length>4096||value===undefined)throw Error('Invalid cache entry');
  const snapshot=structuredClone(value);
  entries.delete(key);entries.set(key,{value:snapshot,expires:Date.now()+ttlMs});
  while(entries.size>capacity)entries.delete(entries.keys().next().value);
 };
 const invalidate=()=>entries.clear();
 return {get,set,invalidate,status:()=>({size:entries.size,capacity,hits,misses})};
}
