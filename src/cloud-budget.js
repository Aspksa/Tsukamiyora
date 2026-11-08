// Local advisory limits only: no external billing API and no automatic model changes.
export function assessCloudBudget(usage,{maxRequests=1000,maxTokens=1000000,warnAt=0.8}={}){
 if(!Number.isSafeInteger(maxRequests)||maxRequests<1||!Number.isSafeInteger(maxTokens)||maxTokens<1||!Number.isFinite(warnAt)||warnAt<=0||warnAt>1)throw Error('Invalid cloud budget');
 const requests=usage?.requests??0;
 const tokens=(usage?.promptTokens??0)+(usage?.completionTokens??0);
 if(!Number.isSafeInteger(requests)||requests<0||!Number.isSafeInteger(tokens)||tokens<0)throw Error('Invalid cloud usage');
 const fraction=Math.max(requests/maxRequests,tokens/maxTokens);
 return {status:fraction>=1?'exceeded':fraction>=warnAt?'warning':'ok',requests,tokens,maxRequests,maxTokens,usageFraction:Math.round(fraction*1000)/1000,unreportedResponses:usage?.unreportedResponses??0,advisoryOnly:true};
}
