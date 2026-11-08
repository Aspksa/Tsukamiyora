import test from 'node:test';
import assert from 'node:assert/strict';
import {rerankRag} from '../src/rag-reranker.js';

test('phrase adjacency ranks coherent source above unordered terms',()=>{
 const hits=[
  {id:'unordered',body:'масло и фильтр для двигатель',hybridScore:0},
  {id:'ordered',body:'двигатель масло фильтр',hybridScore:0}
 ];
 const ranked=rerankRag('двигатель масло фильтр',hits);
 assert.equal(ranked[0].id,'ordered');
 assert.equal(ranked[0].explanation.phraseScore,1);
 assert.equal(ranked[1].explanation.phraseScore,0);
 assert.ok(ranked.every(x=>x.rerankScore>=0&&x.rerankScore<=1));
});

test('reranker handles Cyrillic and bounded feedback',()=>{
 const ranked=rerankRag('проверка масла',[{body:'проверка масла',feedbackBoost:100}],{limit:1});
 assert.equal(ranked.length,1);
 assert.ok(ranked[0].rerankScore<=1);
 assert.throws(()=>rerankRag('x',[],{limit:31}));
});
