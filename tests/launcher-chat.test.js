import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('BAT launcher opens the chat rather than a JSON service descriptor',()=>{
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const launcher=readFileSync(new URL('../scripts/launch.ps1',import.meta.url),'utf8');
 assert.match(server,/app\.get\('\/',async\(req,reply\)=>reply\.redirect\('\/chat'\)\)/);
 assert.match(launcher,/Start-Process "http:\/\/127\.0\.0\.1:\$port\/chat"/);
 assert.match(launcher,/Start-Process "http:\/\/127\.0\.0\.1:\$candidate\/chat"/);
 assert.doesNotMatch(launcher,/Start-Process "http:\/\/127\.0\.0\.1:\$port\/"/);
});
