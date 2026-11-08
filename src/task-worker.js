import { parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';
const {kind,payload}=workerData;
if(kind==='hash'){
 if(typeof payload!=='string'||payload.length>1000000)throw Error('Invalid hash input');
 parentPort.postMessage(createHash('sha256').update(payload).digest('hex'));
}else if(kind==='sum'){
 if(!Array.isArray(payload)||payload.length>100000||!payload.every(n=>typeof n==='number'&&Number.isFinite(n)))throw Error('Invalid numbers');
 parentPort.postMessage(payload.reduce((a,b)=>a+b,0));
}else throw Error('Unknown task');
