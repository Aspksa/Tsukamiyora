import { chunkDocument } from './rag-chunking.js';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
const digest=s=>createHash('sha256').update(s).digest('hex');
const tokens=s=>(s.toLocaleLowerCase('ru').match(/[\p{L}\p{N}]{2,}/gu)||[]).slice(0,24);
export class KnowledgeIndex {
 constructor(db){this.db=db;db.exec(`
 CREATE TABLE IF NOT EXISTS rag_sources(id TEXT PRIMARY KEY, title TEXT NOT NULL, body_hash TEXT NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS rag_chunks(id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES rag_sources(id) ON DELETE CASCADE, position INTEGER NOT NULL, body TEXT NOT NULL, body_hash TEXT NOT NULL);
 CREATE VIRTUAL TABLE IF NOT EXISTS rag_fts USING fts5(body,content='rag_chunks',content_rowid='rowid',tokenize='unicode61');
 CREATE TRIGGER IF NOT EXISTS rag_insert AFTER INSERT ON rag_chunks BEGIN INSERT INTO rag_fts(rowid,body) VALUES(new.rowid,new.body); END;
 CREATE TRIGGER IF NOT EXISTS rag_delete AFTER DELETE ON rag_chunks BEGIN INSERT INTO rag_fts(rag_fts,rowid,body) VALUES('delete',old.rowid,old.body); END;
 CREATE TABLE IF NOT EXISTS rag_edges(subject TEXT NOT NULL, relation TEXT NOT NULL, object TEXT NOT NULL, source_id TEXT NOT NULL, PRIMARY KEY(subject,relation,object,source_id));
 CREATE TABLE IF NOT EXISTS rag_facts(subject TEXT NOT NULL, predicate TEXT NOT NULL, value TEXT NOT NULL, source_id TEXT NOT NULL, PRIMARY KEY(subject,predicate,value,source_id));
 `);this.cache=new Map();}
 ingest({id,title,text,chunkSize=1000}){
  if(typeof id!=='string'||!id.trim()||id.length>200||typeof title!=='string'||title.length>500||typeof text!=='string'||text.length>1000000||!Number.isInteger(chunkSize)||chunkSize<200||chunkSize>4000)throw Error('Invalid document');
  const hash=digest(text),old=this.db.prepare('SELECT body_hash FROM rag_sources WHERE id=?').get(id);
  if(old?.body_hash===hash){
   this.db.prepare('UPDATE rag_sources SET title=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND title<>?').run(title,id,title);
   return {changed:false,chunks:0};
  }
  const parts=chunkDocument(text,{chunkSize});
  this.db.exec('SAVEPOINT rag_index_write');
  try{
   this.db.prepare('DELETE FROM rag_chunks WHERE source_id=?').run(id);
   this.db.prepare('DELETE FROM rag_edges WHERE source_id=?').run(id);
   this.db.prepare('DELETE FROM rag_facts WHERE source_id=?').run(id);
   // Explicitly extracted triples are derived from document text and must be
   // invalidated atomically whenever the underlying document changes.
   if(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='rag_extracted_relations'").get())
    this.db.prepare('DELETE FROM rag_extracted_relations WHERE source_id=?').run(id);
   this.db.prepare('INSERT INTO rag_sources(id,title,body_hash) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,body_hash=excluded.body_hash,updated_at=CURRENT_TIMESTAMP').run(id,title,hash);
   const insert=this.db.prepare('INSERT OR IGNORE INTO rag_chunks(id,source_id,position,body,body_hash) VALUES(?,?,?,?,?)');
   parts.forEach((body,i)=>insert.run(digest(id+':'+i),id,i,body,digest(body)));
   this.db.exec('RELEASE SAVEPOINT rag_index_write');
  }catch(e){this.db.exec('ROLLBACK TO SAVEPOINT rag_index_write');this.db.exec('RELEASE SAVEPOINT rag_index_write');throw e;}
  this.cache.clear();return {changed:true,chunks:parts.length};
 }
 search(query,{limit=5,allowedChatSourceIds=null}={}){
  if(typeof query!=='string'||query.length>1000||!Number.isInteger(limit)||limit<1||limit>30)throw Error('Invalid search');
  const terms=tokens(query);if(!terms.length)return [];

  const fts=terms.map(t=>'"'+t.replaceAll('"','')+'"').join(' OR ');
  // Restrict private chat sources before SQL LIMIT, not after ranking.
  const allowed=allowedChatSourceIds instanceof Set?[...allowedChatSourceIds].filter(x=>typeof x==='string'&&x.startsWith('chat:')).slice(0,500):[];
  const chatFilter=allowed.length?'(c.source_id NOT LIKE \'chat:%\' OR c.source_id IN ('+allowed.map(() => '?').join(',')+'))':"c.source_id NOT LIKE 'chat:%'";
  const sql=`SELECT c.id,c.source_id,s.title,c.position,c.body,bm25(rag_fts) AS score FROM rag_fts JOIN rag_chunks c ON c.rowid=rag_fts.rowid JOIN rag_sources s ON s.id=c.source_id WHERE rag_fts MATCH ? AND ${chatFilter} ORDER BY score LIMIT ?`;
  const rows=this.db.prepare(sql).all(fts,...allowed,Math.min(limit*4,100));
  const q=new Set(terms);const results=rows.map(r=>({...r,overlap:tokens(r.body).filter(t=>q.has(t)).length})).sort((a,b)=>b.overlap-a.overlap||a.score-b.score).slice(0,limit).map(({overlap,...r})=>({...r,citation:{sourceId:r.source_id,title:r.title,chunkId:r.id}}));
  return results;
 }
 removeSource(id){
  if(typeof id!=='string'||!id.startsWith('file:'))throw Error('Only indexed file sources may be removed');
  this.db.exec('SAVEPOINT rag_index_write');
  try{
   this.db.prepare('DELETE FROM rag_chunks WHERE source_id=?').run(id);
   this.db.prepare('DELETE FROM rag_edges WHERE source_id=?').run(id);
   this.db.prepare('DELETE FROM rag_facts WHERE source_id=?').run(id);
   if(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='rag_extracted_relations'").get())
    this.db.prepare('DELETE FROM rag_extracted_relations WHERE source_id=?').run(id);
   const result=this.db.prepare('DELETE FROM rag_sources WHERE id=?').run(id);
   this.db.exec('RELEASE SAVEPOINT rag_index_write');this.cache.clear();return result.changes>0;
  }catch(error){this.db.exec('ROLLBACK TO SAVEPOINT rag_index_write');this.db.exec('RELEASE SAVEPOINT rag_index_write');throw error;}
 }
 relate(subject,relation,object,sourceId){
  if(![subject,relation,object,sourceId].every(x=>typeof x==='string'&&x.length>0&&x.length<=200))throw Error('Invalid relation');
  if(!this.db.prepare('SELECT 1 FROM rag_sources WHERE id=?').get(sourceId))throw Error('Source not found');
  this.db.prepare('INSERT OR IGNORE INTO rag_edges VALUES(?,?,?,?)').run(subject,relation,object,sourceId);
 }
 neighbors(subject){return this.db.prepare('SELECT relation,object,source_id FROM rag_edges WHERE subject=? LIMIT 100').all(subject);}
 fact(subject,predicate,value,sourceId){
  if(![subject,predicate,value,sourceId].every(x=>typeof x==='string'&&x.length>0&&x.length<=500))throw Error('Invalid fact');
  if(!this.db.prepare('SELECT 1 FROM rag_sources WHERE id=?').get(sourceId))throw Error('Source not found');
  const conflicts=this.db.prepare('SELECT value,source_id FROM rag_facts WHERE subject=? AND predicate=? AND value<>?').all(subject,predicate,value);
  this.db.prepare('INSERT OR IGNORE INTO rag_facts VALUES(?,?,?,?)').run(subject,predicate,value,sourceId);
  return {conflicts};
 }
 context(query,{limit=5,maxChars=4000}={}){
  if(!Number.isInteger(maxChars)||maxChars<200||maxChars>16000)throw Error('Invalid context size');
  const hits=this.search(query,{limit});let used=0;
  return hits.map(hit=>{const body=hit.body.slice(0,Math.max(0,maxChars-used));used+=body.length;return {source:hit.citation,text:body};}).filter(x=>x.text);
 }
}
