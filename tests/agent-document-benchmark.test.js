import test from 'node:test';
import assert from 'node:assert/strict';
import {runDocumentRetrievalBenchmark} from '../src/agent-document-benchmark.js';
test('real indexing and retrieval run against isolated documents',()=>{
 const a=runDocumentRetrievalBenchmark();
 const b=runDocumentRetrievalBenchmark();
 assert.equal(a.documents,6);
 assert.equal(a.queries,6);
 assert.equal(a.isolatedDatabase,true);
 assert.equal(a.synthetic,true);
 assert.equal(a.cloudCalls,0);
 assert.equal(a.hitAtK,b.hitAtK);
 assert.equal(a.mrrAtK,b.mrrAtK);
 assert.ok(a.hitAtK>=0&&a.hitAtK<=1);
 assert.ok(a.mrrAtK>=0&&a.mrrAtK<=1);
 assert.throws(()=>runDocumentRetrievalBenchmark({mode:'shell'}),/Invalid document benchmark/);
});
