// Isolated end-to-end retrieval evaluation over synthetic documents; never touches user data.
import {DatabaseSync} from 'node:sqlite';
import {KnowledgeIndex} from './rag.js';
import {evaluateRag} from './rag-evaluation.js';
const DOCUMENTS=Object.freeze([
 {id:'file:fixture-oil',title:'Обслуживание двигателя',text:'Двигатель автомобиля: моторное масло меняют согласно регламенту технического обслуживания. Проверяют уровень масла щупом.'},
 {id:'file:fixture-tires',title:'Контроль шин',text:'Шины автомобиля: давление воздуха проверяют манометром на холодных колесах. Износ протектора осматривают регулярно.'},
 {id:'file:fixture-backup',title:'Резервное копирование',text:'Резервная копия базы данных создаётся перед обновлением. Восстановление проверяют на отдельной копии.'},
 {id:'file:fixture-search',title:'Поиск документов',text:'Поиск документов выполняется через индекс. Индекс хранит текстовые фрагменты и ссылки на исходные документы.'},
 {id:'file:fixture-permissions',title:'Права доступа',text:'Права доступа ограничивают чтение конфиденциальных документов. Доступ проверяют до выдачи результатов.'},
 {id:'file:fixture-agent',title:'Задачи агентов',text:'Агенты выполняют разрешённые задания через очередь. Ошибки фиксируются в журнале выполнения.'}
]);
const QUERIES=Object.freeze([
 {query:'моторное масло двигатель',expectedSource:'file:fixture-oil'},
 {query:'давление шины манометр',expectedSource:'file:fixture-tires'},
 {query:'резервная копия восстановление',expectedSource:'file:fixture-backup'},
 {query:'поиск документов индекс',expectedSource:'file:fixture-search'},
 {query:'права доступа конфиденциальных документов',expectedSource:'file:fixture-permissions'},
 {query:'агенты очередь задания',expectedSource:'file:fixture-agent'}
]);
export function runDocumentRetrievalBenchmark({mode='lexical',limit=3}={}){
 if(!['lexical','adaptive'].includes(mode)||!Number.isInteger(limit)||limit<1||limit>10)throw Error('Invalid document benchmark options');
 const db=new DatabaseSync(':memory:');
 try{
  const index=new KnowledgeIndex(db);
  for(const doc of DOCUMENTS)index.ingest(doc);
  const result=evaluateRag(index,QUERIES,{limit,mode});
  return {benchmarkId:'isolated-documents-v1',documents:DOCUMENTS.length,queries:QUERIES.length,mode,
   hitAtK:result.hitAtK,mrrAtK:result.mrrAtK,details:result.details,
   synthetic:true,isolatedDatabase:true,heldOut:false,cloudCalls:0,requiresApproval:true};
 }finally{db.close();}
}
