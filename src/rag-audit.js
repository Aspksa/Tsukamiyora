// Local-only evidence audit: never invent confidence from language-model output.
export class RagKnowledgeAudit {
 constructor(db){this.db=db;}
 inspect({limit=100,staleDays=90}={}){
  if(!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(staleDays)||staleDays<1||staleDays>3650)throw Error('Invalid audit options');
  const conflicts=this.db.prepare(`SELECT f.subject,f.predicate,COUNT(DISTINCT f.value) AS alternatives,
    GROUP_CONCAT(DISTINCT f.source_id) AS sources
    FROM rag_facts f JOIN rag_sources s ON s.id=f.source_id
    WHERE substr(f.source_id,1,5)='file:'
    GROUP BY f.subject,f.predicate HAVING COUNT(DISTINCT f.value)>1
    ORDER BY alternatives DESC,f.subject LIMIT ?`).all(limit);
  const stale=this.db.prepare(`SELECT e.source_id,e.chunk_id,e.subject,e.value,e.verified_at
    FROM rag_evidence e JOIN rag_chunks c ON c.id=e.chunk_id AND c.source_id=e.source_id
    WHERE substr(e.source_id,1,5)='file:' AND e.verified_at<datetime('now',?)
    ORDER BY e.verified_at LIMIT ?`).all('-'+staleDays+' days',limit);
  const unsupported=this.db.prepare(`SELECT f.subject,f.predicate,f.value,f.source_id
    FROM rag_facts f JOIN rag_sources s ON s.id=f.source_id
    WHERE substr(f.source_id,1,5)='file:' AND NOT EXISTS(
      SELECT 1 FROM rag_evidence e JOIN rag_chunks c ON c.id=e.chunk_id AND c.source_id=e.source_id
      WHERE e.source_id=f.source_id AND e.subject=f.subject AND e.predicate=f.predicate AND e.value=f.value
    ) ORDER BY f.source_id,f.subject LIMIT ?`).all(limit);
  const dangling=this.db.prepare(`SELECT COUNT(*) n FROM rag_topic_links t
    LEFT JOIN rag_chunks c ON c.id=t.chunk_id AND c.source_id=t.source_id
    WHERE c.id IS NULL`).get().n;
  return {conflicts,stale,unsupported,danglingTopicLinks:dangling,requiresReview:conflicts.length>0||stale.length>0||unsupported.length>0||dangling>0};
 }
 maintain(){
  const result={};
  result.topics=this.db.prepare('DELETE FROM rag_topic_links WHERE NOT EXISTS (SELECT 1 FROM rag_chunks c WHERE c.id=rag_topic_links.chunk_id AND c.source_id=rag_topic_links.source_id)').run().changes;
  result.evidence=this.db.prepare('DELETE FROM rag_evidence WHERE NOT EXISTS (SELECT 1 FROM rag_chunks c WHERE c.id=rag_evidence.chunk_id AND c.source_id=rag_evidence.source_id)').run().changes;
  result.vectors=this.db.prepare('DELETE FROM rag_vectors WHERE NOT EXISTS (SELECT 1 FROM rag_chunks c WHERE c.id=rag_vectors.chunk_id)').run().changes;
  return result;
 }
}
