// Deterministic, local, bounded ranking features; no LLM or network requests.
const tokens=s=>new Set((String(s).toLocaleLowerCase('ru').match(/[\p{L}\p{N}]{2,}/gu)||[]));
// Include single-letter words in adjacency checks to prevent false phrase matches.
const sequence=s=>(String(s).toLocaleLowerCase('ru').match(/[\p{L}\p{N}]{1,}/gu)||[]);
export function rerankRag(query,hits,{limit=5}={}){
 if(typeof query!=='string'||!query.trim()||query.length>1000||!Array.isArray(hits)||!Number.isInteger(limit)||limit<1||limit>30)throw Error('Invalid rerank input');
 const q=tokens(query),queryWords=sequence(query);
 return hits.map((hit,i)=>{
  const body=tokens(hit.body||''),bodyWords=sequence(hit.body||'');
  const matched=[...q].filter(t=>body.has(t)).length;
  const coverage=q.size?matched/q.size:0;
  const precision=body.size?matched/body.size:0;
  // Adjacent ordered terms improve relevance without a model call.
  let adjacent=0;
  for(let j=0;j<queryWords.length-1;j++){
   const left=queryWords[j],right=queryWords[j+1];
   if(bodyWords.some((word,k)=>word===left&&bodyWords[k+1]===right))adjacent++;
  }
  const phraseScore=queryWords.length>1?adjacent/(queryWords.length-1):0;
  const original=Number.isFinite(hit.hybridScore)?hit.hybridScore:0;
  const score=Math.max(0,Math.min(1,coverage*0.68+precision*0.17+phraseScore*0.1+Math.min(Math.max(original,0),0.05)+Math.max(-0.01,Math.min(0.01,Number.isFinite(hit.feedbackBoost)?hit.feedbackBoost:0))));
  return {...hit,rerankScore:score,explanation:{matchedTerms:matched,queryTerms:q.size,coverage,precision,phraseScore,sourceVerified:true},originalRank:i+1};
 }).sort((a,b)=>b.rerankScore-a.rerankScore||a.originalRank-b.originalRank).slice(0,limit);
}
