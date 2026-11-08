import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {evaluateLabeledDocuments,compareLabeledDocumentModes} from '../src/agent-labeled-document-eval.js';
test('labeled indexed-file evaluation is bounded, local, and non-disclosing',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'file:oil',title:'Oil',text:'Двигатель моторное масло замена регламент'});
  index.ingest({id:'file:tires',title:'Tires',text:'Шины давление манометр проверка'});
  const cases=[{query:'моторное масло',expectedSource:'file:oil'},{query:'давление манометр',expectedSource:'file:tires'}];
  const result=evaluateLabeledDocuments(index,{cases,limit:2});
  assert.equal(result.total,2);
  assert.equal(result.hitAtK,1);
  assert.equal(result.details.length,2);
  assert.equal(JSON.stringify(result).includes('регламент'),false);
  const compared=compareLabeledDocumentModes(index,{cases,limit:2});
  assert.equal(compared.applied,false);
  assert.equal(compared.lexical.cloudCalls,0);
  assert.throws(()=>evaluateLabeledDocuments(index,{cases:[...cases,{query:'private',expectedSource:'chat:secret'}]}),/Invalid labeled case/);
  assert.throws(()=>evaluateLabeledDocuments(index,{cases:[cases[0],cases[0]]}),/Invalid labeled case/);
  assert.throws(()=>evaluateLabeledDocuments(index,{cases:[cases[0],{query:'missing',expectedSource:'file:missing'}]}),/not found/);
 }finally{db.close();}
});
