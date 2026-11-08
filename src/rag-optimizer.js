// Evaluate candidates locally; never switch automatically on a regression.
import {evaluateRag} from './rag-evaluation.js';
export function optimizeRag(index,cases,{limit=5,modes=['lexical','adaptive','hybrid']}={}){
 if(!Array.isArray(cases)||cases.length<1||cases.length>100)throw Error('Invalid optimization case count');
 if(!Array.isArray(modes)||!modes.length||modes.length>4||!modes.every(m=>['lexical','adaptive','semantic','hybrid'].includes(m)))throw Error('Invalid optimization modes');
 const baseline=evaluateRag(index,cases,{limit,mode:modes[0]});
 const candidates=[baseline,...modes.slice(1).map(mode=>evaluateRag(index,cases,{limit,mode}))];
 const best=[...candidates].sort((a,b)=>b.hitAtK-a.hitAtK||b.mrrAtK-a.mrrAtK||modes.indexOf(a.mode)-modes.indexOf(b.mode))[0];
 const improvement=best.hitAtK>baseline.hitAtK||best.hitAtK===baseline.hitAtK&&best.mrrAtK>baseline.mrrAtK;
 return {baseline:{mode:baseline.mode,hitAtK:baseline.hitAtK,mrrAtK:baseline.mrrAtK},
  candidates:candidates.map(x=>({mode:x.mode,hitAtK:x.hitAtK,mrrAtK:x.mrrAtK})),
  recommendation:improvement?best.mode:baseline.mode,improvement,applied:false,
  note:'Recommendation only; changing production search requires separate approval and tests'};
}
