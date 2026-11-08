// Stable document-level evaluation split. Splitting by source prevents the same file
// from appearing in both development and validation partitions.
import {createHash} from 'node:crypto';
const bucket=(seed,source)=>createHash('sha256').update(seed+'\0'+source).digest().readUInt32BE(0)/4294967296;
export function partitionLabeledCases(cases,{seed='tsukamiyora-eval-v1',validationFraction=0.25}={}){
 if(!Array.isArray(cases)||cases.length<4||cases.length>1000||typeof seed!=='string'||seed.length<1||seed.length>100||!Number.isFinite(validationFraction)||validationFraction<=0||validationFraction>=1)throw Error('Invalid evaluation split');
 const groups=new Map();
 for(const item of cases){
  if(typeof item?.query!=='string'||!item.query.trim()||typeof item.expectedSource!=='string'||!item.expectedSource.startsWith('file:'))throw Error('Invalid evaluation item');
  if(!groups.has(item.expectedSource))groups.set(item.expectedSource,[]);
  groups.get(item.expectedSource).push({query:item.query,expectedSource:item.expectedSource});
 }
 if(groups.size<2)throw Error('Need at least two different sources');
 const ordered=[...groups].sort((a,b)=>bucket(seed,a[0])-bucket(seed,b[0])||a[0].localeCompare(b[0]));
 const validationCount=Math.max(1,Math.min(groups.size-1,Math.round(groups.size*validationFraction)));
 const validationSources=new Set(ordered.slice(0,validationCount).map(x=>x[0]));
 const development=[],validation=[];
 for(const item of cases)(validationSources.has(item.expectedSource)?validation:development).push({query:item.query,expectedSource:item.expectedSource});
 return {development,validation,developmentSources:groups.size-validationCount,validationSources:validationCount,
  sourceDisjoint:true,seed,heldOutFromTraining:false,cloudCalls:0};
}
