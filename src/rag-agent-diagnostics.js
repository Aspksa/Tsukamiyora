// Read-only local diagnostics: no cloud calls and no automatic configuration changes.
export function diagnoseAgents({activity=[],queue={},cloud={},thresholds={}}={}){
 const maxFailures=thresholds.maxFailures??3;
 const maxQueued=thresholds.maxQueued??20;
 const maxCloudFailures=thresholds.maxCloudFailures??5;
 const maxAvgLatencyMs=thresholds.maxAvgLatencyMs??15000;
 if(![maxFailures,maxQueued,maxCloudFailures,maxAvgLatencyMs].every(x=>Number.isFinite(x)&&x>=0))throw Error('Invalid diagnostic thresholds');
 const alerts=[];
 const recent=activity.slice(0,100);
 const failures=recent.filter(x=>x.outcome==='failed');
 if(failures.length>=maxFailures&&failures.length>0)alerts.push({code:'agent_failures',severity:'warning',count:failures.length});
 const queued=Number(queue.pending??queue.queued??0);
 if(Number.isFinite(queued)&&queued>maxQueued)alerts.push({code:'agent_queue_backlog',severity:'warning',count:queued});
 const failed=Number(cloud.session?.failed??0);
 if(Number.isFinite(failed)&&failed>=maxCloudFailures&&failed>0)alerts.push({code:'cloud_failures',severity:'warning',count:failed});
 const succeeded=Number(cloud.session?.succeeded??0);
 const duration=Number(cloud.session?.durationMs??0);
 const avgLatencyMs=succeeded>0?Math.round(duration/succeeded):null;
 if(avgLatencyMs!==null&&avgLatencyMs>maxAvgLatencyMs)alerts.push({code:'cloud_latency',severity:'warning',avgLatencyMs});
 return {status:alerts.length?'attention':'ok',alerts,observed:{activity:recent.length,queued,cloudFailed:failed,avgLatencyMs},automaticChanges:false};
}
