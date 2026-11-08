// Read-only GraphRAG traversal grounded in explicit source relations and chunks.
// Never traverses private chat sources and never fabricates inferred edges.
export class RagGraphTraversal {
 constructor(db){this.db=db;}
 traverse(entity,{maxHops=2,limit=30}={}){
  if(typeof entity!=='string'||!entity.trim()||entity.length>200||!Number.isInteger(maxHops)||maxHops<1||maxHops>3||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid graph traversal');
  const statement=this.db.prepare(`SELECT e.subject,e.relation,e.object,e.source_id,s.title
   FROM rag_extracted_relations e JOIN rag_sources s ON s.id=e.source_id
   WHERE (e.subject=? OR e.object=?) AND substr(e.source_id,1,5)='file:'
   ORDER BY e.source_id,e.subject,e.relation,e.object LIMIT ?`);
  const visited=new Set([entity]),edges=new Map(),frontier=[entity];
  for(let depth=1;depth<=maxHops&&frontier.length&&edges.size<limit;depth++){
   const next=[];
   for(const node of frontier){
    for(const row of statement.all(node,node,limit)){
     const key=JSON.stringify([row.subject,row.relation,row.object,row.source_id]);
     if(!edges.has(key))edges.set(key,{...row,hop:depth});
     const other=row.subject===node?row.object:row.subject;
     if(!visited.has(other)){visited.add(other);next.push(other);}
     if(edges.size>=limit)break;
    }
    if(edges.size>=limit)break;
   }
   frontier.splice(0,frontier.length,...next);
  }
  return {entity,nodes:[...visited],edges:[...edges.values()],maxHops,remoteCalls:0,readOnly:true};
 }
}
