import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateRankedResults,proposeRagPromotion} from '../src/rag-evaluation.js';

test('ranking metrics reward relevant results at earlier positions',()=>{
 const result=evaluateRankedResults([{relevant:['a','b'],retrieved:['a','c','b']}],{k:3});
 assert.equal(result.cases,1);
 assert.equal(result.recallAtK,1);
 assert.equal(result.precisionAtK,2/3);
 assert.equal(result.mrrAtK,1);
 assert.ok(result.ndcgAtK>0.9&&result.ndcgAtK<1);
});
test('candidate optimization is blocked when recall regresses',()=>{
 const baseline=evaluateRankedResults([{relevant:['a','b'],retrieved:['a','b']}],{k:2});
 const candidate=evaluateRankedResults([{relevant:['a','b'],retrieved:['a','x']}],{k:2});
 const verdict=proposeRagPromotion(baseline,candidate);
 assert.equal(verdict.eligible,false);
 assert.equal(verdict.applied,false);
 assert.equal(verdict.requiresApproval,true);
});
test('evaluation validates input and handles no scored cases',()=>{
 assert.equal(evaluateRankedResults([{relevant:[],retrieved:[]}]).cases,0);
 assert.throws(()=>evaluateRankedResults([{relevant:['a'],retrieved:[4]}]),/Invalid ranked evaluation case/);
 assert.throws(()=>proposeRagPromotion({cases:0,k:5},{cases:0,k:5}),/Invalid RAG promotion comparison/);
});
