// Deterministic intent router. Never lets free-form text become executable actions.
const ROUTES=Object.freeze([
 {intent:'audit',role:'auditor',action:'auditor:pending',words:['аудит','audit','проверка знаний']},
 {intent:'activity',role:'auditor',action:'auditor:activity',words:['активность агентов','agent activity']},
 {intent:'development',role:'mentor',action:'mentor:development',words:['развитие агентов','план развития','agent development']},
 {intent:'profiles',role:'mentor',action:'mentor:profiles',words:['профили агентов','agent profiles']},
 {intent:'retrieval',role:'rag_evaluator',action:'rag_evaluator:practice',words:['проверка rag','retrieval benchmark']},
 {intent:'diagnostics',role:'diagnostician',action:'diagnostician:practice',words:['диагностика агентов','agent diagnostics']},
 {intent:'cloud_budget',role:'cloud_economist',action:'cloud_economist:practice',words:['бюджет cloud','cloud budget']},
]);
export function planAgentTask(text,{allowedActions=[]}={}){
 if(typeof text!=='string'||text.length>500||!Array.isArray(allowedActions))throw Error('Invalid agent request');
 const normalized=text.toLocaleLowerCase('ru').trim().replace(/\s+/g,' ');
 if(!normalized)return {matched:false,reason:'empty_request'};
 const matches=ROUTES.filter(route=>route.words.some(word=>normalized.includes(word))&&allowedActions.includes(route.action));
 if(matches.length!==1)return {matched:false,reason:matches.length?'ambiguous_request':'no_safe_route'};
 const {intent,role,action}=matches[0];
 return {matched:true,intent,role,action,input:{},requiresApproval:false,cloudCalls:0};
}
export function submitPlannedAgentTask(engine,text){
 if(!engine?.submit||!engine?.status)throw Error('Invalid task engine');
 const plan=planAgentTask(text,{allowedActions:engine.status().allowedActions});
 if(!plan.matched)return plan;
 return {...plan,job:engine.submit({role:plan.role,action:plan.action,input:plan.input})};
}
