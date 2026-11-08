// Read-only consolidation of repeated evidence; original facts and documents remain untouched.
export class RagConsolidation {
 constructor(db){this.db=db;}
 summarize({limit=100,minSources=2}={}){
  if(!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(minSources)||minSources<2||minSources>100)throw Error('Invalid consolidation options');
  const rows=this.db.prepare(`SELECT e.subject,e.predicate,e.value,
   COUNT(DISTINCT e.source_id) AS sourceCount,
   GROUP_CONCAT(DISTINCT e.source_id) AS sourceIds
   FROM rag_evidence e JOIN rag_chunks c ON c.id=e.chunk_id AND c.source_id=e.source_id
   JOIN rag_sources s ON s.id=e.source_id
   WHERE substr(e.source_id,1,5)='file:'
   GROUP BY e.subject,e.predicate,e.value
   HAVING COUNT(DISTINCT e.source_id)>=?
   ORDER BY sourceCount DESC,e.subject,e.predicate,e.value LIMIT ?`).all(minSources,limit);
  return rows.map(r=>({subject:r.subject,predicate:r.predicate,value:r.value,sourceCount:r.sourceCount,
   sourceIds:r.sourceIds.split(','),verifiedByIndependentSources:false,
   note:'Matching sources are not necessarily independent; review before trusting'}));
 }
}
