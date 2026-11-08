// Evidence-strength signals are heuristic, never a claim of factual truth.
export function scoreEvidenceGroup(group){
 if(!group||!Array.isArray(group.alternatives))throw Error('Invalid evidence group');
 const alternatives=group.alternatives.map(alt=>{
  const sourceCount=Array.isArray(alt.sourceIds)?new Set(alt.sourceIds).size:0;
  const stale=Boolean(alt.needsReview);
  const conflicting=Boolean(group.conflicting);
  // Multiple files may copy one another; the score is not a probability.
  const evidenceStrength=Math.min(0.85,0.35+Math.min(sourceCount,5)*0.1-(stale?0.2:0)-(conflicting?0.2:0));
  return {...alt,evidenceStrength:Math.round(Math.max(0,evidenceStrength)*100)/100,
   independentSourcesVerified:false,confidenceKind:'heuristic-not-probability'};
 });
 return {...group,alternatives,requiresReview:Boolean(group.conflicting)||alternatives.some(a=>a.needsReview||a.sourceCount<2)};
}
