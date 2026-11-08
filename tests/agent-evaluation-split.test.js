import test from 'node:test';
import assert from 'node:assert/strict';
import {partitionLabeledCases} from '../src/agent-evaluation-split.js';
test('source-disjoint split is stable and never mixes source IDs',()=>{
 const cases=Array.from({length:12},(_,i)=>({query:'query '+i,expectedSource:'file:'+Math.floor(i/2)}));
 const a=partitionLabeledCases(cases);
 const b=partitionLabeledCases(cases);
 assert.deepEqual(a,b);
 assert.equal(a.development.length+a.validation.length,12);
 const dev=new Set(a.development.map(x=>x.expectedSource));
 assert.ok(a.validation.every(x=>!dev.has(x.expectedSource)));
 assert.equal(a.heldOutFromTraining,false);
 assert.throws(()=>partitionLabeledCases(cases.slice(0,2)),/Invalid evaluation split/);
 assert.throws(()=>partitionLabeledCases(cases,{validationFraction:1}),/Invalid evaluation split/);
});
