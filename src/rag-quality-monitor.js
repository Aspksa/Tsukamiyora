import {mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {compareRag} from './rag-evaluation.js';
export function createRagQualityMonitor(root){
 const path=join(root,'data','rag-quality-baseline.json');
 const load=()=>{
  if(!existsSync(path))return null;
  const value=JSON.parse(readFileSync(path,'utf8'));
  if(!value||!Number.isInteger(value.total)||value.total<1||!Number.isInteger(value.limit)||value.limit<1||![value.hitAtK,value.mrrAtK].every(x=>Number.isFinite(x)&&x>=0&&x<=1))throw Error('Invalid quality baseline');
  return value;
 };
 const save=baseline=>{
  if(!baseline||!Number.isInteger(baseline.total)||baseline.total<1||!Number.isInteger(baseline.limit)||baseline.limit<1||![baseline.hitAtK,baseline.mrrAtK].every(x=>Number.isFinite(x)&&x>=0&&x<=1))throw Error('Invalid quality baseline');
  mkdirSync(join(root,'data'),{recursive:true});
  writeFileSync(path,JSON.stringify({total:baseline.total,limit:baseline.limit,hitAtK:baseline.hitAtK,mrrAtK:baseline.mrrAtK,mode:baseline.mode??'adaptive'})+'\n',{flag:'wx'});
  return {saved:true};
 };
 const check=candidate=>{
  const baseline=load();
  if(!baseline)return {status:'no_baseline',regression:null};
  const comparison=compareRag(baseline,candidate);
  return {status:comparison.regression?'regression':'ok',regression:comparison.regression,comparison};
 };
 return {load,save,check};
}
