// Local, read-only fact review: provenance, conflicts, staleness and temporal evidence.
export class RagFactReview {
 constructor(db){this.db=db;}
 inspect({limit=100,staleDays=90}={}){
  if(!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(staleDays)||staleDays<1||staleDays>3650)throw Error('Invalid fact review options');
  const rows=this.db.prepare(`SELECT e.subject,e.predicate,e.value,e.source_id,e.chunk_id,
   e.verified_at,s.updated_at AS sourceUpdated
   FROM rag_evidence e JOIN rag_chunks c ON c.id=e.chunk_id AND c.source_id=e.source_id
   JOIN rag_sources s ON s.id=e.source_id
   WHERE substr(e.source_id,1,5)='file:'
   ORDER BY e.subject,e.predicate,e.value,e.source_id LIMIT ?`).all(limit*20);
  const grouped=new Map();
  for(const row of rows){
   const key=JSON.stringify([row.subject,row.predicate]);
   if(!grouped.has(key))grouped.set(key,{subject:row.subject,predicate:row.predicate,alternatives:new Map()});
   const group=grouped.get(key);
   if(!group.alternatives.has(row.value))group.alternatives.set(row.value,{value:row.value,sources:new Set(),citations:[],needsReview:false});
   const alt=group.alternatives.get(row.value);
   alt.sources.add(row.source_id);
   alt.citations.push({sourceId:row.source_id,chunkId:row.chunk_id});
   if(row.sourceUpdated>row.verified_at||this.db.prepare("SELECT datetime(?)<datetime('now',?) AS stale").get(row.verified_at,'-'+staleDays+' days').stale)alt.needsReview=true;
  }
  return [...grouped.values()].slice(0,limit).map(group=>{
   const alternatives=[...group.alternatives.values()].map(a=>({value:a.value,sourceCount:a.sources.size,sourceIds:[...a.sources],citations:a.citations,needsReview:a.needsReview}));
   const conflicting=alternatives.length>1;
   return {subject:group.subject,predicate:group.predicate,alternatives,conflicting,
    confidence:'unverified',resolution:'manual-review-required',
    note:'Multiple sources are not assumed independent; no facts were overwritten'};
  });
 }
}
