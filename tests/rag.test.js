import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { KnowledgeIndex } from '../src/rag.js';
test('RAG indexes Russian text, returns citations and reindexes incrementally',()=>{
 const db=new DatabaseSync(':memory:');const rag=new KnowledgeIndex(db);
 try{
  assert.deepEqual(rag.ingest({id:'a',title:'Проект',text:'Tsukamiyora использует локальную память и поиск по документам.'}),{changed:true,chunks:1});
  assert.equal(rag.ingest({id:'a',title:'Проект',text:'Tsukamiyora использует локальную память и поиск по документам.'}).changed,false);
  const hits=rag.search('локальную память');
  assert.equal(hits[0].citation.sourceId,'a');
  assert.ok(rag.context('память')[0].text.includes('память'));
  rag.ingest({id:'a',title:'Новое',text:'Система теперь индексирует архивы и заметки.'});
  assert.equal(rag.search('локальную память').length,0);
  assert.equal(rag.search('архивы')[0].citation.title,'Новое');
 }finally{db.close();}
});
test('RAG graph and conflicting facts preserve provenance',()=>{
 const db=new DatabaseSync(':memory:');const rag=new KnowledgeIndex(db);
 try{
  rag.ingest({id:'a',title:'A',text:'Первый источник'});
  rag.ingest({id:'b',title:'B',text:'Второй источник'});
  rag.relate('Tsukamiyora','uses','SQLite','a');
  assert.deepEqual(rag.neighbors('Tsukamiyora')[0],{relation:'uses',object:'SQLite',source_id:'a'});
  assert.deepEqual(rag.fact('project','database','SQLite','a').conflicts,[]);
  const conflict=rag.fact('project','database','PostgreSQL','b').conflicts;
  assert.equal(conflict[0].value,'SQLite');
  assert.equal(conflict[0].source_id,'a');
  assert.throws(()=>rag.relate('a','b','c','unknown'),/Source not found/);
 }finally{db.close();}
});
