import {RagTopicGraph} from './rag-topic-graph.js';
import {KnowledgeLifecycle} from './rag-lifecycle.js';
// Read-only guardian report. Never deletes evidence, performs network calls or changes facts.
import {RagKnowledgeAudit} from './rag-audit.js';
import {RagFactReview} from './rag-fact-review.js';
export class RagKnowledgeGuardian {
 constructor(db){this.db=db;new RagTopicGraph(db);new KnowledgeLifecycle(db);this.audit=new RagKnowledgeAudit(db);this.review=new RagFactReview(db);}
 inspect({limit=50,staleDays=90}={}){
  const audit=this.audit.inspect({limit,staleDays});
  const facts=this.review.inspect({limit,staleDays});
  const actions=[];
  if(audit.conflicts.length||facts.some(f=>f.conflicting))actions.push({kind:'resolve-conflicts',count:Math.max(audit.conflicts.length,facts.filter(f=>f.conflicting).length),requiresApproval:true});
  if(audit.stale.length||facts.some(f=>f.alternatives.some(a=>a.needsReview)))actions.push({kind:'review-stale-evidence',count:audit.stale.length,requiresApproval:true});
  if(audit.unsupported.length)actions.push({kind:'review-unsupported-facts',count:audit.unsupported.length,requiresApproval:true});
  if(audit.danglingTopicLinks)actions.push({kind:'repair-dangling-topic-links',count:audit.danglingTopicLinks,requiresApproval:true});
  return {summary:{conflicts:audit.conflicts.length,stale:audit.stale.length,unsupported:audit.unsupported.length,danglingTopicLinks:audit.danglingTopicLinks},actions,requiresReview:actions.length>0,remoteCalls:0,applied:false};
 }
}
