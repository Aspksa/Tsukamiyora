// User corrections are stored as review proposals, never silently overwrite source facts.
export class RagCorrections {
 constructor(db){
  this.db=db;
  db.exec(`CREATE TABLE IF NOT EXISTS rag_corrections(
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   source_id TEXT NOT NULL,subject TEXT NOT NULL,predicate TEXT NOT NULL,
   proposed_value TEXT NOT NULL,reason TEXT NOT NULL,
   status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   reviewed_at TEXT
  )`);
 }
 propose({sourceId,subject,predicate='значение',value,reason}={}){
  if(typeof sourceId!=='string'||!sourceId.startsWith('file:')||sourceId.length>200||
   ![subject,predicate,value,reason].every(x=>typeof x==='string'&&x.trim()&&x.length<=500))throw Error('Invalid correction');
  if(!this.db.prepare('SELECT 1 FROM rag_sources WHERE id=?').get(sourceId))throw Error('Source not found');
  const result=this.db.prepare('INSERT INTO rag_corrections(source_id,subject,predicate,proposed_value,reason) VALUES(?,?,?,?,?)')
   .run(sourceId,subject.trim(),predicate.trim(),value.trim(),reason.trim());
  return {id:Number(result.lastInsertRowid),status:'pending',applied:false};
 }
 list({limit=50,status='pending'}={}){
  if(!Number.isInteger(limit)||limit<1||limit>200||!['pending','accepted','rejected'].includes(status))throw Error('Invalid correction list');
  return this.db.prepare('SELECT id,source_id,subject,predicate,proposed_value,reason,status,created_at,reviewed_at FROM rag_corrections WHERE status=? ORDER BY id DESC LIMIT ?').all(status,limit);
 }
 review({id,accept}={}){
  if(!Number.isInteger(id)||id<1||typeof accept!=='boolean')throw Error('Invalid correction review');
  const row=this.db.prepare('SELECT id,status FROM rag_corrections WHERE id=?').get(id);
  if(!row)throw Error('Correction not found');
  if(row.status!=='pending')throw Error('Correction already reviewed');
  const status=accept?'accepted':'rejected';
  this.db.prepare('UPDATE rag_corrections SET status=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status=?').run(status,id,'pending');
  // Acceptance approves a proposal for human source editing, not a factual overwrite.
  return {id,status,applied:false,sourceUpdateRequired:accept};
 }
}
