// Evidence-based development plans from recorded training, no model calls or autonomous promotion.
export function buildAgentDevelopmentPlan(profile,{targetScore=0.85,maxSkills=5}={}){
 if(!profile||typeof profile.role!=='string'||!Array.isArray(profile.skills)||!Number.isFinite(targetScore)||targetScore<=0||targetScore>1||!Number.isInteger(maxSkills)||maxSkills<1||maxSkills>20)throw Error('Invalid development plan');
 const ranked=profile.skills.map(s=>({skill:s.skill,attempts:Number(s.attempts),averageScore:Number(s.averageScore)}))
  .filter(s=>typeof s.skill==='string'&&Number.isFinite(s.averageScore)&&Number.isInteger(s.attempts)&&s.attempts>=0)
  .sort((a,b)=>a.averageScore-b.averageScore||a.attempts-b.attempts||a.skill.localeCompare(b.skill));
 const weaknesses=ranked.filter(s=>s.averageScore<targetScore).slice(0,maxSkills).map(s=>({
  skill:s.skill,averageScore:s.averageScore,attempts:s.attempts,
  recommendation:'Run an independent, unseen evaluation and compare with prior results',
  requiresIndependentEvaluation:true
 }));
 return {role:profile.role,level:profile.level,attempts:profile.attempts,targetScore,
  weaknesses,needsMoreEvidence:profile.attempts<3||ranked.length===0,
  readyForPromotion:false,automaticChanges:false};
}
export function summarizeAgentDevelopment(profiles){
 if(!Array.isArray(profiles))throw Error('Invalid profiles');
 return {total:profiles.length,untrained:profiles.filter(p=>p.attempts===0).length,
  withEvidence:profiles.filter(p=>p.attempts>0).length,
  plans:profiles.map(p=>buildAgentDevelopmentPlan(p))};
}
