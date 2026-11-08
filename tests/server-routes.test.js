import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Fastify GET routes are uniquely registered',()=>{
 const source=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const paths=[...source.matchAll(/app\.get\('([^']+)'/g)].map(match=>match[1]);
 const duplicates=paths.filter((path,index)=>paths.indexOf(path)!==index);
 assert.deepEqual(duplicates,[]);
 assert.ok(paths.includes('/api/rag/relations'));
 assert.ok(paths.includes('/api/rag/edges'));
 assert.ok(paths.includes('/knowledge'));
});

test('agent review endpoints remain distinct',()=>{
 const source=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const paths=[...source.matchAll(/app\.post\('([^']+)'/g)].map(match=>match[1]);
 assert.deepEqual(paths.filter((path,index)=>paths.indexOf(path)!==index),[]);
});

test('agent coordinator API routes and lifecycle hooks are wired',()=>{
 const source=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 for(const route of ['/api/rag/agents/coordinator/status','/api/rag/agents/coordinator/audit','/api/rag/agents/coordinator/lessons']){
  assert.ok(source.includes(route),route+' missing');
 }
 assert.ok(source.includes('agentCoordinator.stop()'));
 assert.ok(source.includes('agentAuditTimer=setInterval('));
});
