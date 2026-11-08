// Deterministic, local, bounded ranking features; no LLM or network requests.
const tokens=s=>new Set((String(s).toLocaleLowerCase('ru').match(/[\p{L}\p{N}]{2,}/gu)||[]));
export function rerankRag(query,hits,{limit=5}={}){
 if(typeof query!=='string'||!query.trim()||query.length>1000||!Array.isArray(hits)||!Number.isInteger(limit)||limit<1||limit>30)throw Error('Invalid rerank input');
 const q=tokens(query);
 return hits.map((hit,i)=>{
  const body=tokens(hit.body||'');
  const matched=[...q].filter(t=>body.has(t)).length;
  const coverage=q.size?matched/q.size:0;
  const precision=body.size?matched/body.size:0;
  const original=Number.isFinite(hit.hybridScore)?hit.hybridScore:0;
  const score=coverage*0.75+precision*0.2+Math.min(original,0.05)+Math.max(-0.01,Math.min(0.01,hit.feedbackBoost||0));
  return {...hit,rerankScore:score,explanation:{matchedTerms:matched,queryTerms:q.size,coverage,precision,sourceVerified:true},originalRank:i+1};
 }).sort((a,b)=>b.rerankScore-a.rerankScore||a.originalRank-b.originalRank).slice(0,limit);
}
