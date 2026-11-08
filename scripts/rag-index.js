import { resolve } from 'node:path';
import { openStorage } from '../src/storage.js';
import { indexDirectory } from '../src/rag-import.js';
const folder=process.argv[2];
if(!folder){console.error('Usage: npm run rag:index -- "D:\\Library"');process.exit(2);}
const db=openStorage();
try{const result=indexDirectory(db,resolve(folder));console.log(JSON.stringify(result,null,2));}
catch(error){console.error(String(error));process.exitCode=1;}
finally{db.close();}
