// Deterministic offline agent academy. No autonomous code execution, model calls or self-approval.
export function createAgentAcademy(db,roles){
 if(!db?.prepare||!Array.isArray(roles)||!roles.length)throw Error('Invalid academy options');
 db.exec(`CREATE TABLE IF NOT EXISTS agent_training(
 id INTEGER PRIMARY KEY AUTOINCREMENT,role TEXT NOT NULL,skill TEXT NOT NULL,
 task_key TEXT NOT NULL,score REAL NOT NULL,passed INTEGER NOT NULL,
 evidence TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE INDEX IF NOT EXISTS agent_training_role ON agent_training(role,id);
 CREATE TABLE IF NOT EXISTS agent_skill_candidates(
 id INTEGER PRIMARY KEY AUTOINCREMENT,role TEXT NOT NULL,skill TEXT NOT NULL,
 version TEXT NOT NULL,description TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(role,skill,version));`);
 const validRole=role=>{if(!roles.includes(role))throw Error('Unknown academy role');};
 const record=({role,skill,taskKey,score,evidence}={})=>{
  validRole(role);
  if(typeof skill!=='string'||!skill.trim()||skill.length>100||typeof taskKey!=='string'||!taskKey.trim()||taskKey.length>200||!Number.isFinite(score)||score<0||score>1||typeof evidence!=='string'||!evidence.trim()||evidence.length>2000)throw Error('Invalid training result');
  const passed=Number(score>=0.8);
  // Fixed benchmark identifiers must not inflate levels through repeated submissions.
  if(taskKey.startsWith('academy:')||taskKey.startsWith('practice:')){
   const existing=db.prepare('SELECT id,skill,score,passed FROM agent_training WHERE role=? AND task_key=?').get(role,taskKey);
   if(existing)return {id:Number(existing.id),role,skill:existing.skill,score:existing.score,passed:!!existing.passed,duplicate:true,recorded:false};
  }
  const result=db.prepare('INSERT INTO agent_training(role,skill,task_key,score,passed,evidence) VALUES(?,?,?,?,?,?)').run(role,skill.trim(),taskKey.trim(),score,passed,evidence.trim());
  return {id:Number(result.lastInsertRowid),role,skill,score,passed:!!passed,duplicate:false,recorded:true};
 };
 const profile=role=>{
  validRole(role);
  const summary=db.prepare('SELECT COUNT(*) AS attempts,COALESCE(SUM(passed),0) AS passed,COALESCE(AVG(score),0) AS averageScore FROM agent_training WHERE role=?').get(role);
  const skills=db.prepare('SELECT skill,COUNT(*) AS attempts,AVG(score) AS averageScore,MAX(created_at) AS lastTrained FROM agent_training WHERE role=? GROUP BY skill ORDER BY skill').all(role);
  const attempts=Number(summary.attempts),passed=Number(summary.passed),averageScore=Number(summary.averageScore);
  return {role,attempts,passed,averageScore,skills,level:attempts>=50&&averageScore>=0.9?5:attempts>=25&&averageScore>=0.85?4:attempts>=10&&averageScore>=0.8?3:attempts>=3&&averageScore>=0.7?2:1};
 };
 const propose=({role,skill,version,description}={})=>{
  validRole(role);
  if(![skill,version,description].every(x=>typeof x==='string'&&x.trim())||skill.length>100||version.length>40||description.length>2000)throw Error('Invalid skill proposal');
  const result=db.prepare('INSERT INTO agent_skill_candidates(role,skill,version,description) VALUES(?,?,?,?)').run(role,skill.trim(),version.trim(),description.trim());
  return {id:Number(result.lastInsertRowid),status:'pending',applied:false,requiresApproval:true};
 };
 const candidates=({limit=30}={})=>{
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid candidate limit');
  return db.prepare('SELECT * FROM agent_skill_candidates ORDER BY id DESC LIMIT ?').all(limit);
 };
 const history=({role,limit=30}={})=>{
  validRole(role);
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid training limit');
  return db.prepare('SELECT * FROM agent_training WHERE role=? ORDER BY id DESC LIMIT ?').all(role,limit);
 };
 return {record,profile,propose,candidates,history,profiles:()=>roles.map(profile)};
}
