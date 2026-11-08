import {createHash} from 'node:crypto';
const tokens=s=>[...new Set((String(s).toLocaleLowerCase('ru').match(/[\p{L}\p{N}]{2,}/gu)||[]))];
const hash=s=>createHash('sha256').update(s).digest('hex');
const cosine=(a,b)=>{let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return aa&&bb?dot/Math.sqrt(aa*bb):0;};
export class RagIntelligence {
 constructor(db,{dimensions=256}={}){
  if(!Number.isInteger(dimensions)||dimensions<32||dimensions>2048)throw Error('Invalid vector dimensions');
  this.db=db;this.dimensions=dimensions;this.vectorVersion='hash-v2:'+dimensions;
  db.exec(`CREATE TABLE IF NOT EXISTS rag_vectors(chunk_id TEXT PRIMARY KEY,body_hash TEXT NOT NULL,vector TEXT NOT NULL,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS rag_fact_history(id INTEGER PRIMARY KEY AUTOINCREMENT,subject TEXT NOT NULL,predicate TEXT NOT NULL,value TEXT NOT NULL,source_id TEXT NOT NULL,recorded_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS rag_fact_history_lookup ON rag_fact_history(subject,predicate);
  CREATE TABLE IF NOT EXISTS rag_ratings(id INTEGER PRIMARY KEY AUTOINCREMENT,query_hash TEXT NOT NULL,source_id TEXT NOT NULL,helpful INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
  db.exec('CREATE TABLE IF NOT EXISTS rag_vector_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
  const previous=db.prepare("SELECT value FROM rag_vector_metadata WHERE key='version'").get()?.value;
  if(previous!==this.vectorVersion){db.prepare('DELETE FROM rag_vectors').run();db.prepare("INSERT INTO rag_vector_metadata(key,value) VALUES('version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(this.vectorVersion);}
  this.stats={indexed:0,searches:0,cacheHits:0};this.queryCache=new Map();
 }
 embed(text){
  const vec=new Array(this.dimensions).fill(0);
  for(const word of (String(text).toLocaleLowerCase('ru').match(/[\p{L}\p{N}]{2,}/gu)||[])){
   const digest=createHash('sha256').update(word).digest();
   const idx=digest.readUInt32BE(0)%this.dimensions;
   vec[idx]+=(digest[4]&1)?1:-1;
  }
  return vec;
 }
 sync({limit=500}={}){
  if(!Number.isInteger(limit)||limit<1||limit>5000)throw Error('Invalid limit');
  this.db.prepare('DELETE FROM rag_vectors WHERE chunk_id NOT IN (SELECT id FROM rag_chunks)').run();
  const rows=this.db.prepare('SELECT c.id,c.body,c.body_hash FROM rag_chunks c LEFT JOIN rag_vectors v ON v.chunk_id=c.id WHERE v.chunk_id IS NULL OR v.body_hash<>c.body_hash LIMIT ?').all(limit);
  const insert=this.db.prepare('INSERT INTO rag_vectors(chunk_id,body_hash,vector) VALUES(?,?,?) ON CONFLICT(chunk_id) DO UPDATE SET body_hash=excluded.body_hash,vector=excluded.vector,updated_at=CURRENT_TIMESTAMP');
  for(const row of rows)insert.run(row.id,row.body_hash,JSON.stringify(this.embed(row.body)));
  this.stats.indexed+=rows.length;this.queryCache.clear();return {indexed:rows.length};
 }
 semantic(query,{limit=5,excludeChat=true,allowedChatSourceIds=null}={}){
  if(typeof query!=='string'||!query.trim()||query.length>1000||!Number.isInteger(limit)||limit<1||limit>30)throw Error('Invalid semantic search');
  this.stats.searches++;
  const key=hash(query);let vec=this.queryCache.get(key);
  if(vec)this.stats.cacheHits++;else{vec=this.embed(query);if(this.queryCache.size>=100)this.queryCache.clear();this.queryCache.set(key,vec);}
  const rows=this.db.prepare('SELECT c.id,c.source_id,c.body,s.title,v.vector FROM rag_vectors v JOIN rag_chunks c ON c.id=v.chunk_id JOIN rag_sources s ON s.id=c.source_id').all();
  return rows.filter(r=>!r.source_id.startsWith('chat:')||(!excludeChat&&allowedChatSourceIds instanceof Set&&allowedChatSourceIds.has(r.source_id))).map(r=>({...r,similarity:cosine(vec,JSON.parse(r.vector))})).filter(r=>r.similarity>0).sort((a,b)=>b.similarity-a.similarity).slice(0,limit).map(({vector,...r})=>({...r,citation:{sourceId:r.source_id,title:r.title,chunkId:r.id}}));
 }
 graph(subject,{limit=30}={}){
  if(typeof subject!=='string'||!subject.trim()||subject.length>200||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid graph query');
  return this.db.prepare('SELECT subject,relation,object,source_id FROM rag_edges WHERE subject=? OR object=? LIMIT ?').all(subject,subject,limit);
 }
 recordFact({subject,predicate,value,sourceId}){
  if(![subject,predicate,value,sourceId].every(x=>typeof x==='string'&&x.trim()&&x.length<=500))throw Error('Invalid fact');
  if(!this.db.prepare('SELECT 1 FROM rag_sources WHERE id=?').get(sourceId))throw Error('Source not found');
  const previous=this.db.prepare('SELECT value,source_id,recorded_at FROM rag_fact_history WHERE subject=? AND predicate=? ORDER BY id DESC LIMIT 30').all(subject,predicate);
  const duplicate=previous.some(x=>x.value===value&&x.source_id===sourceId);
  if(!duplicate)this.db.prepare('INSERT INTO rag_fact_history(subject,predicate,value,source_id) VALUES(?,?,?,?)').run(subject,predicate,value,sourceId);
  return {created:!duplicate,conflicts:previous.filter(x=>x.value!==value),history:previous};
 }
 rate({query,sourceId,helpful}){
  if(typeof query!=='string'||!query.trim()||query.length>1000||typeof sourceId!=='string'||sourceId.length>200||typeof helpful!=='boolean')throw Error('Invalid rating');
  if(!this.db.prepare('SELECT 1 FROM rag_sources WHERE id=?').get(sourceId))throw Error('Source not found');
  this.db.prepare('INSERT INTO rag_ratings(query_hash,source_id,helpful) VALUES(?,?,?)').run(hash(query),sourceId,helpful?1:0);
  return {ok:true};
 }
 metrics(){return {...this.stats,vectors:this.db.prepare('SELECT COUNT(*) n FROM rag_vectors').get().n,factEvents:this.db.prepare('SELECT COUNT(*) n FROM rag_fact_history').get().n,ratings:this.db.prepare('SELECT COUNT(*) n FROM rag_ratings').get().n};}
}
