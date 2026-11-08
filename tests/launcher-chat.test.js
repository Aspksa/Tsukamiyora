import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('BAT launcher checks chat readiness before opening the browser',()=>{
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const launcher=readFileSync(new URL('../scripts/launch.ps1',import.meta.url),'utf8');
 const bat=readFileSync(new URL('../Tsukamiyora.bat',import.meta.url),'utf8');
 assert.match(server,/app\.get\('\/',async\(req,reply\)=>reply\.redirect\('\/chat'\)\)/);
 assert.match(server,/instanceId:process\.env\.TSUKAMIYORA_INSTANCE_ID/);
 assert.match(launcher,/function ChatReady\(\[int\]\$port\)/);
 assert.match(launcher,/ChatReady \$port/);
 assert.match(launcher,/ChatReady \$candidate/);
 assert.match(launcher,/function OpenChat\(\[int\]\$port\)/);
 assert.match(launcher,/OpenChat \$port/);
 assert.match(launcher,/OpenChat \$candidate/);
 assert.match(launcher,/UseShellExecute = \$true/);
 assert.match(launcher,/Open this address in your browser:/);
 assert.match(launcher,/Открыть Tsukamiyora\.url/);
 assert.match(launcher,/-ArgumentList 'src\/supervisor\.js' -WorkingDirectory \$root/);
 assert.doesNotMatch(launcher,/-ArgumentList @\(\$server\)/);
 assert.match(bat,/if not defined CI pause/);
});

test('chat initial HTML has a visible landing state and composer',()=>{
 const page=readFileSync(new URL('../public/chat.html',import.meta.url),'utf8');
 assert.match(page,/id="welcome"/);
 assert.match(page,/id="form"/);
 assert.match(page,/id="message"/);
 assert.match(page,/Tsukamiyora/);
});
