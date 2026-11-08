// Opt-in neural retrieval backed by Cloud.ru embeddings and portable SQLite.
import {CloudEmbeddings} from './cloud-embeddings.js';
import {RagPermissions} from './rag-permissions.js';
const cosine=(a,b)=>{
 if(a.length!==b.length)return 0;
 let dot=0,aa=0,bb=0;
 for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}
 return aa&&bb?dot/Math.sqrt(aa*bb):0;
};
export class NeuralRag {
 constructor(db,cloud,{model}={}){
  this.db=db;this.permissions=new RagPermissions(db);this.embeddings=new CloudEmbeddings(cloud,{model});
  db.exec(`CREATE TABLE IF NOT EXISTS rag_neural_vectors (
   chunk_id TEXT NOT NULL,
   model TEXT NOT NULL,
   body_hash TEXT NOT NULL,
   vector TEXT NOT NULL,
   PRIMARY KEY(chunk_id,model)
  );`);
 }
 async sync({limit=25}={}){
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid sync limit');
  // Index public documents only. Chat history must never be uploaded implicitly.
  this.db.prepare('DELETE FROM rag_neural_vectors WHERE chunk_id NOT IN (SELECT c.id FROM rag_chunks c JOIN rag_cloud_permissions p ON p.source_id=c.source_id AND p.allowed=1)').run();
  const rows=this.db.prepare(`SELECT c.id,c.body,c.body_hash FROM rag_chunks c
   LEFT JOIN rag_neural_vectors v ON v.chunk_id=c.id AND v.model=?
   WHERE substr(c.source_id,1,5)='file:' AND EXISTS(SELECT 1 FROM rag_cloud_permissions p WHERE p.source_id=c.source_id AND p.allowed=1) AND (v.chunk_id IS NULL OR v.body_hash<>c.body_hash)
   ORDER BY c.id LIMIT ?`).all(this.embeddings.model,limit);
  let indexed=0;
  const insert=this.db.prepare(`INSERT INTO rag_neural_vectors(chunk_id,model,body_hash,vector) VALUES(?,?,?,?)
   ON CONFLICT(chunk_id,model) DO UPDATE SET body_hash=excluded.body_hash,vector=excluded.vector`);
  for(const row of rows){
   if(!this.db.prepare('SELECT 1 FROM rag_chunks c JOIN rag_cloud_permissions p ON p.source_id=c.source_id AND p.allowed=1 WHERE c.id=? AND c.body_hash=?').get(row.id,row.body_hash))continue;
   const vector=await this.embeddings.embed(row.body);
   // Source may have been deleted or updated during the remote request.
   const current=this.db.prepare("SELECT 1 FROM rag_chunks WHERE id=? AND body_hash=? AND substr(source_id,1,5)='file:' AND EXISTS(SELECT 1 FROM rag_cloud_permissions p WHERE p.source_id=rag_chunks.source_id AND p.allowed=1)").get(row.id,row.body_hash);
   if(!current)continue;
   insert.run(row.id,this.embeddings.model,row.body_hash,JSON.stringify(vector));indexed++;
  }
  this.db.prepare('DELETE FROM rag_neural_vectors WHERE chunk_id NOT IN (SELECT id FROM rag_chunks)').run();
  return {indexed,model:this.embeddings.model};
 }
 async search(query,{limit=5}={}){
  if(typeof query!=='string'||!query.trim()||query.length>1000||!Number.isInteger(limit)||limit<1||limit>30)throw Error('Invalid neural query');
  const vector=await this.embeddings.embed(query);
  const rows=this.db.prepare(`SELECT c.id,c.source_id,c.body,s.title,v.vector FROM rag_neural_vectors v
   JOIN rag_chunks c ON c.id=v.chunk_id AND c.body_hash=v.body_hash
   JOIN rag_sources s ON s.id=c.source_id
   WHERE v.model=? AND substr(c.source_id,1,5)='file:' AND EXISTS(SELECT 1 FROM rag_cloud_permissions p WHERE p.source_id=c.source_id AND p.allowed=1)`).all(this.embeddings.model);
  return rows.map(r=>({...r,similarity:cosine(vector,JSON.parse(r.vector))}))
   .filter(r=>r.similarity>0).sort((a,b)=>b.similarity-a.similarity).slice(0,limit)
   .map(({vector,...r})=>({...r,citation:{sourceId:r.source_id,title:r.title,chunkId:r.id}}));
 }
 metrics(){return {...this.embeddings.metrics(),stored:this.db.prepare('SELECT COUNT(*) AS n FROM rag_neural_vectors WHERE model=?').get(this.embeddings.model).n};}
}
