// Per-source opt-in for transmitting file content to a remote embedding provider.
export class RagPermissions {
 constructor(db){
  this.db=db;
  db.exec(`CREATE TABLE IF NOT EXISTS rag_cloud_permissions(
   source_id TEXT PRIMARY KEY,
   allowed INTEGER NOT NULL CHECK(allowed IN (0,1)),
   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`);
 }
 set({sourceId,allowed}){
  if(typeof sourceId!=='string'||!sourceId.startsWith('file:')||sourceId.length>200||typeof allowed!=='boolean')throw Error('Invalid cloud permission');
  if(!this.db.prepare('SELECT 1 FROM rag_sources WHERE id=?').get(sourceId))throw Error('Source not found');
  this.db.exec('SAVEPOINT rag_cloud_permission_change');
  try{
  this.db.prepare(`INSERT INTO rag_cloud_permissions(source_id,allowed) VALUES(?,?)
   ON CONFLICT(source_id) DO UPDATE SET allowed=excluded.allowed,updated_at=CURRENT_TIMESTAMP`).run(sourceId,allowed?1:0);
  if(!allowed){
   // Revocation must take effect before the next background sync.
   const vectors=this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rag_neural_vectors'").get();
   if(vectors)this.db.prepare('DELETE FROM rag_neural_vectors WHERE chunk_id IN (SELECT id FROM rag_chunks WHERE source_id=?)').run(sourceId);
   if(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='rag_embedding_cache'").get()){
    // Clear all cached vectors, including query embeddings, on revocation.
    this.db.prepare('DELETE FROM rag_embedding_cache').run();
   }
  }
  this.db.exec('RELEASE SAVEPOINT rag_cloud_permission_change');
  }catch(e){this.db.exec('ROLLBACK TO SAVEPOINT rag_cloud_permission_change');this.db.exec('RELEASE SAVEPOINT rag_cloud_permission_change');throw e;}
  return {sourceId,allowed};
 }
 allowed(sourceId){
  return Boolean(this.db.prepare('SELECT allowed FROM rag_cloud_permissions WHERE source_id=?').get(sourceId)?.allowed);
 }
 list(){
  return this.db.prepare(`SELECT s.id AS sourceId,s.title,COALESCE(p.allowed,0) AS allowed
   FROM rag_sources s LEFT JOIN rag_cloud_permissions p ON p.source_id=s.id
   WHERE substr(s.id,1,5)='file:' ORDER BY s.id`).all().map(r=>({...r,allowed:Boolean(r.allowed)}));
 }
}
