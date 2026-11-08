// Compare candidate results against an independent baseline; never deploy automatically.
export function evaluateAgentCandidate(baseline,candidate,{minimumCases=5,maxRegression=0}={}){
 if(!Array.isArray(baseline)||!Array.isArray(candidate)||!Number.isInteger(minimumCases)||minimumCases<1||!Number.isFinite(maxRegression)||maxRegression<0||maxRegression>1)throw Error('Invalid candidate evaluation');
 const read=rows=>{
  const map=new Map();
  for(const item of rows){
   if(typeof item?.caseId!=='string'||!item.caseId||item.caseId.length>100||typeof item.score!=='number'||!Number.isFinite(item.score)||item.score<0||item.score>1||map.has(item.caseId))throw Error('Invalid evaluation case');
   map.set(item.caseId,item.score);
  }
  return map;
 };
 const before=read(baseline),after=read(candidate);
 if(before.size<minimumCases||before.size!==after.size||[...before.keys()].some(key=>!after.has(key)))throw Error('Incompatible evaluation sets');
 const mean=map=>[...map.values()].reduce((a,b)=>a+b,0)/map.size;
 const baselineScore=mean(before),candidateScore=mean(after);
 const regressions=[...before].filter(([id,score])=>after.get(id)<score-maxRegression).map(([caseId,score])=>({caseId,before:score,after:after.get(caseId)}));
 return {cases:before.size,baselineScore,candidateScore,delta:candidateScore-baselineScore,
  regressions,eligible:candidateScore>baselineScore&&regressions.length===0,
  requiresApproval:true,applied:false,independentCasesMustBeVerifiedExternally:true};
}
