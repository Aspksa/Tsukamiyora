import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from '../src/rag.js';
import {RagRelationGraph} from '../src/rag-relations.js';

test('explicit entity graph extracts only supported relations and preserves manual edges',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  index.ingest({id:'file:manual',title:'Manual',text:'Автомобиль -> использует -> Двигатель\nДвигатель -> требует -> Масло'});
  const graph=new RagRelationGraph(db);
  index.relate('Масло','тип','5W30','file:manual');
  assert.equal(graph.extract({sourceId:'file:manual'}).relations,2);
  assert.equal(graph.related('Двигатель').length,2);
  assert.equal(index.neighbors('Масло').length,1);
  assert.equal(graph.extract({sourceId:'file:manual'}).relations,2);
  assert.equal(graph.related('Двигатель').length,2);
  index.ingest({id:'file:manual',title:'Manual',text:'Автомобиль -> использует -> Батарея'});
  graph.extract({sourceId:'file:manual'});
  assert.equal(graph.related('Двигатель').length,0);
 }finally{db.close();}
});
