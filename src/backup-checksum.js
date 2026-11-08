import {createHash,timingSafeEqual} from 'node:crypto';
import {openSync,readSync,closeSync,existsSync,readFileSync,lstatSync} from 'node:fs';

export function sha256File(path){
 const hash=createHash('sha256'),buffer=Buffer.allocUnsafe(65536);
 const fd=openSync(path,'r');
 try{let count;while((count=readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,count));}
 finally{closeSync(fd);}
 return hash.digest('hex');
}
export function verifySnapshotChecksum(path){
 const sidecar=path+'.sha256';
 if(!existsSync(sidecar))return {present:false,valid:null};
 if(!lstatSync(sidecar).isFile()||lstatSync(sidecar).size>128)return {present:true,valid:false};
 const expected=readFileSync(sidecar,'utf8').trim();
 if(!/^[0-9a-f]{64}$/.test(expected))return {present:true,valid:false};
 const actual=sha256File(path);
 return {present:true,valid:timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(actual,'hex'))};
}
