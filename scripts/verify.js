import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const manifest=resolve('package-lock.json');
if(!existsSync(manifest)){console.error('Missing package-lock.json: run npm install --package-lock-only');process.exit(1);}
const lock=JSON.parse(readFileSync(manifest,'utf8'));
const pkg=JSON.parse(readFileSync('package.json','utf8'));
if(lock.name!==pkg.name||JSON.stringify(lock.packages?.['']?.dependencies)!==JSON.stringify(pkg.dependencies)){console.error('Dependency lock mismatch');process.exit(1);}
console.log('Dependency manifest matches lockfile; npm ci validates downloaded packages against lockfile integrity.');
