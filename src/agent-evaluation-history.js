// Durable, reviewable evaluation history. No raw queries or document text are stored.
import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
export function createAgentEvaluationHistory(db){
 if(!db?.prepare)throw Error('Invalid evaluation history storage');
 db.exec(`CREATE TABLE IF NOT EXISTS agent_eval_runs(
 id INTEGER PRIMARY KEY AUTOINCREMENT, dataset_hash TEXT NOT NULL,
 mode TEXT NOT NULL, total INTEGER NOT NULL, hit_at_k REAL NOT NULL,
 mrr_at_k REAL NOT NULL, passed INTEGER NOT NULL,
 reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE INDEX IF NOT EXISTS agent_eval_runs_dataset ON agent_eval_runs(dataset_hash,id);`);
 const fingerprint=cases=>{
  if(!Array.isArray(cases)||!cases.length||cases.length>1000)throw Error('Invalid evaluation cases');
  const rows=cases.map(c=>{
   if(typeof c?.query!=='string'||typeof c.expectedSource!=='string')throw Error('Invalid evaluation case');
   return [c.query,c.expectedSource];
  }).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return sha(JSON.stringify(rows));
 };
 const record=({cases,baseline,candidate,mode='adaptive'}={})=>{
  if(!baseline||!candidate||baseline.total!==candidate.total||baseline.total!==cases?.length||
   !['adaptive','lexical'].includes(mode))throw Error('Incompatible evaluation results');
  for(const item of [baseline,candidate]){
   if(!Number.isFinite(item.hitAtK)||!Number.isFinite(item.mrrAtK)||item.hitAtK<0||item.hitAtK>1||item.mrrAtK<0||item.mrrAtK>1)throw Error('Invalid evaluation metrics');
  }
  const datasetHash=fingerprint(cases);
  const previous=db.prepare('SELECT hit_at_k,mrr_at_k FROM agent_eval_runs WHERE dataset_hash=? AND mode=? ORDER BY id DESC LIMIT 1').get(datasetHash,mode);
  const regression=candidate.hitAtK<baseline.hitAtK-1e-12||candidate.mrrAtK<baseline.mrrAtK-1e-12||
   (previous&&(candidate.hitAtK<previous.hit_at_k-1e-12||candidate.mrrAtK<previous.mrr_at_k-1e-12));
  const passed=!regression;
  const reason=passed?'no_observed_regression':'retrieval_metric_regression';
  const result=db.prepare('INSERT INTO agent_eval_runs(dataset_hash,mode,total,hit_at_k,mrr_at_k,passed,reason) VALUES(?,?,?,?,?,?,?)').run(
   datasetHash,mode,candidate.total,candidate.hitAtK,candidate.mrrAtK,passed?1:0,reason);
  return {id:Number(result.lastInsertRowid),datasetHash,passed,reason,
   comparedWithPrevious:Boolean(previous),requiresApproval:true,applied:false};
 };
 const list=({limit=30}={})=>{
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid history limit');
  return db.prepare('SELECT id,dataset_hash,mode,total,hit_at_k,mrr_at_k,passed,reason,created_at FROM agent_eval_runs ORDER BY id DESC LIMIT ?').all(limit);
 };
 return {fingerprint,record,list};
}
