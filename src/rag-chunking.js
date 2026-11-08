// Deterministic structure-aware chunking, with a hard size bound.
export function chunkDocument(text,{chunkSize=1000}={}){
 if(typeof text!=='string'||!Number.isInteger(chunkSize)||chunkSize<200||chunkSize>4000)throw Error('Invalid chunk input');
 if(!text)return [];
 const blocks=text.split(/(?<=\n)\s*\n/).flatMap(block=>{
  // Prefer sentence/line boundaries when a paragraph is too large.
  if(block.length<=chunkSize)return [block];
  const lines=block.split(/(?<=\n)/);
  return lines.flatMap(line=>line.length<=chunkSize?[line]:line.match(new RegExp('[\\s\\S]{1,'+chunkSize+'}','g'))||[]);
 }).filter(Boolean);
 const result=[];let current='';
 for(const block of blocks){
  if(current&&current.length+block.length>chunkSize){result.push(current);current='';}
  if(block.length>chunkSize){for(let i=0;i<block.length;i+=chunkSize)result.push(block.slice(i,i+chunkSize));continue;}
  current+=block;
 }
 if(current)result.push(current);
 return result;
}
