import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {RagMaintenanceJournal} from '../src/rag-maintenance-journal.js';

const report=n=>({summary:{conflicts:n,stale:0,unsupported:0,danglingTopicLinks:0},consolidationCandidates:0,requiresReview:n>0});
test('maintenance journal retains latest 500 checks and rejects invalid input',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const journal=new RagMaintenanceJournal(db);
  assert.throws(()=>journal.record({summary:{conflicts:-1,stale:0,unsupported:0,danglingTopicLinks:0}}),/Invalid maintenance report/);
  for(let i=0;i<505;i++)journal.record(report(i));
  const rows=journal.recent({limit:100});
  assert.equal(rows.length,100);
  assert.equal(rows[0].conflicts,504);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rag_maintenance_journal').get().n,500);
  assert.equal(db.prepare('SELECT MIN(conflicts) n FROM rag_maintenance_journal').get().n,5);
  assert.throws(()=>journal.recent({limit:0}),/Invalid journal limit/);
 }finally{db.close();}
});
