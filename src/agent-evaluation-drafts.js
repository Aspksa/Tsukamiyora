// Generate review-only retrieval evaluation candidates from indexed file chunks.
// Queries remain in the local database and are never returned by listing endpoints.
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const tokens=text=>[...new Set((text.toLocaleLowerCase('ru').match(/[\p{L}\p{N}]{5,}/gu)||[]).filter(x=>!/^\d+$/.test(x)))];
export function createAgentEvaluationDrafts(db){
 if(!db?.prepare)throw Error('Invalid evaluation draft storage');
 db.exec(`CREATE TABLE IF NOT EXISTS agent_eval_drafts(
 id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL, source_hash TEXT NOT NULL,
 query TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reviewed_at TEXT,
 UNIQUE(source_id,source_hash,query));
 CREATE INDEX IF NOT EXISTS agent_eval_drafts_status ON agent_eval_drafts(status,id);`);
 const generate=({limit=20}={})=>{
  if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('Invalid generation limit');
  const sources=db.prepare("SELECT s.id,s.body_hash,c.body FROM rag_sources s JOIN rag_chunks c ON c.source_id=s.id AND c.position=0 WHERE s.id LIKE 'file:%' ORDER BY s.id LIMIT ?").all(limit);
  const insert=db.prepare('INSERT OR IGNORE INTO agent_eval_drafts(source_id,source_hash,query) VALUES(?,?,?)');
  let created=0;
  for(const source of sources){
   const terms=tokens(source.body).slice(0,3);
   if(terms.length<2)continue;
   const query=terms.join(' ').slice(0,250);
   created+=insert.run(source.id,source.body_hash,query).changes;
  }
  return {inspected:sources.length,created,requiresReview:true,cloudCalls:0};
 };
 const list=({limit=30}={})=>{
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid draft limit');
  return db.prepare(`SELECT d.id,d.source_id,d.status,d.created_at,
  CASE WHEN s.body_hash=d.source_hash THEN 1 ELSE 0 END AS source_current
  FROM agent_eval_drafts d LEFT JOIN rag_sources s ON s.id=d.source_id
  ORDER BY d.id DESC LIMIT ?`).all(limit);
 };
 const review=({id,approve=false}={})=>{
  if(!Number.isSafeInteger(id)||id<1||typeof approve!=='boolean')throw Error('Invalid review');
  const draft=db.prepare('SELECT * FROM agent_eval_drafts WHERE id=?').get(id);
  if(!draft||draft.status!=='pending')throw Error('Draft not pending');
  if(approve){
   const source=db.prepare('SELECT body_hash FROM rag_sources WHERE id=?').get(draft.source_id);
   if(!source||source.body_hash!==draft.source_hash)throw Error('Source changed; regenerate draft');
  }
  db.prepare("UPDATE agent_eval_drafts SET status=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").run(approve?'approved':'rejected',id);
  return {id,status:approve?'approved':'rejected'};
 };
 const approved=({limit=100}={})=>{
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid approved limit');
  return db.prepare(`SELECT d.query,d.source_id AS expectedSource FROM agent_eval_drafts d
  JOIN rag_sources s ON s.id=d.source_id AND s.body_hash=d.source_hash
  WHERE d.status='approved' ORDER BY d.id LIMIT ?`).all(limit);
 };
 return {generate,list,review,approved};
}
