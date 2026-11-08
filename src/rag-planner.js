// A bounded local planner: no model calls, no remote search, no unapproved writes.
const patterns=[
 {test:/(?:^|[^\p{L}])(почему|как|why|how)(?=$|[^\p{L}])/iu,kind:'explanation'},
 {test:/(?:^|[^\p{L}])(сравни|разница|compare|difference)(?=$|[^\p{L}])/iu,kind:'comparison'},
 {test:/(?:^|[^\p{L}])(когда|история|изменил|when|history|changed)(?=$|[^\p{L}])/iu,kind:'temporal'}
];
export function planRag(query,{maxSteps=4}={}){
 if(typeof query!=='string'||!query.trim()||query.length>1000||!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>6)throw Error('Invalid RAG plan');
 const kind=patterns.find(p=>p.test.test(query))?.kind||'fact';
 const parts=query.split(/\s+(?:и|а также|and|versus|vs\.?|или)\s+|[;?]+/iu).map(x=>x.trim()).filter(Boolean);
 const steps=[...new Set(parts)].slice(0,maxSteps).map((text,i)=>({id:i+1,query:text,strategy:kind==='temporal'?'temporal-evidence':kind==='comparison'?'hybrid':'adaptive'}));
 return {kind,steps:steps.length?steps:[{id:1,query,strategy:'adaptive'}],requiresReview:kind==='temporal',remoteCalls:0,applied:false};
}
