import {createCloudUsageStore} from './cloud-usage-store.js';
import { mkdirSync,readFileSync,writeFileSync,existsSync,renameSync,chmodSync } from 'node:fs';
import { join } from 'node:path';
const BASE='https://foundation-models.api.cloud.ru/v1';
export function classifyCloudError(status){
 return ({400:'Неверные параметры запроса',401:'Неверный или просроченный API-ключ',403:'Нет доступа к Foundation Models или модели',404:'Модель или адрес API не найден',409:'Модель недоступна',429:'Превышен лимит запросов',500:'Ошибка сервера Cloud.ru',502:'Ошибка шлюза',503:'Сервис временно недоступен',504:'Тайм-аут шлюза'})[status]||'Ошибка Cloud.ru';
}
export class CloudRu {
 constructor({root=process.cwd(),fetchImpl=fetch}={}){this.path=join(root,'data','cloudru-settings.json');this.usageStore=createCloudUsageStore(root);this.fetchImpl=fetchImpl;this.last={status:'not_checked',checkedAt:null};this.usage={requests:0,succeeded:0,failed:0,promptTokens:0,completionTokens:0,unreportedResponses:0,durationMs:0};}
 usageMetrics(){return {...this.usageStore.snapshot(),session:{...this.usage}};}
 bump(field,amount=1){this.usage[field]+=amount;this.usageStore.add({[field]:amount});}
 recordUsage(body){const usage=body?.usage;if(usage&&Number.isSafeInteger(usage.prompt_tokens)&&usage.prompt_tokens>=0&&Number.isSafeInteger(usage.completion_tokens)&&usage.completion_tokens>=0){this.bump('promptTokens',usage.prompt_tokens);this.bump('completionTokens',usage.completion_tokens);}else this.bump('unreportedResponses');}
 read(){
  if(!existsSync(this.path))return {enabled:false,apiKey:'',model:''};
  const data=JSON.parse(readFileSync(this.path,'utf8'));
  return {enabled:data.enabled===true,apiKey:typeof data.apiKey==='string'?data.apiKey:'',model:typeof data.model==='string'?data.model:''};
 }
 publicSettings(){const x=this.read();return {enabled:x.enabled,configured:Boolean(x.apiKey),model:x.model,status:this.last};}
 save({enabled,apiKey,model}){
  const old=this.read();
  if(enabled!==undefined&&typeof enabled!=='boolean')throw Error('Invalid enabled');
  if(apiKey!==undefined&&(typeof apiKey!=='string'||apiKey.length>4096))throw Error('Invalid key');
  if(model!==undefined&&(typeof model!=='string'||model.length>256||!/^[\w./:-]*$/.test(model)))throw Error('Invalid model');
  const next={enabled:enabled??old.enabled,apiKey:apiKey===undefined||apiKey===''?old.apiKey:apiKey.trim(),model:model??old.model};
  mkdirSync(join(this.path,'..'),{recursive:true});
  const tmp=this.path+'.tmp';writeFileSync(tmp,JSON.stringify(next,null,2),{mode:0o600});renameSync(tmp,this.path);
  try{chmodSync(this.path,0o600);}catch{}
  this.last={status:'not_checked',checkedAt:null};return this.publicSettings();
 }
 async request(path,{method='GET',body,timeout=12000}={}){
  const settings=this.read();if(!settings.enabled||!settings.apiKey)throw Object.assign(new Error('Cloud.ru не настроен или выключен'),{status:400});
  this.bump('requests');
  const started=Date.now();
  let response;
  try{response=await this.fetchImpl(BASE+path,{method,headers:{Authorization:'Bearer '+settings.apiKey,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout)});}
  catch(e){this.bump('failed');throw Object.assign(new Error(e.name==='TimeoutError'?'Превышено время ожидания Cloud.ru':'Нет соединения с Cloud.ru'),{status:503});}
  if(!response.ok){this.bump('failed');throw Object.assign(new Error(classifyCloudError(response.status)),{status:response.status});}
  try{const result=await response.json();this.bump('durationMs',Date.now()-started);this.bump('succeeded');if(path.includes('/chat/completions'))this.recordUsage(result);return result;}
  catch(e){this.bump('failed');throw e;}
 }
 async models(){
  try{
   const response=await this.request('/models');
   const models=Array.isArray(response.data)?response.data.filter(m=>typeof m.id==='string').map(m=>({id:m.id,name:m.id})).sort((a,b)=>a.id.localeCompare(b.id)):[];
   this.last={status:'online',checkedAt:new Date().toISOString(),models:models.length};return {models,status:this.last};
  }catch(e){this.last={status:'error',checkedAt:new Date().toISOString(),error:e.message,httpStatus:e.status||503};throw e;}
 }
 async testModel(){
  const {model}=this.read();if(!model)throw Object.assign(new Error('Сначала выберите модель'),{status:400});
  const response=await this.request('/chat/completions',{method:'POST',body:{model,messages:[{role:'user',content:'Ответь одним словом: OK'}],max_tokens:16,stream:false},timeout:30000});
  const text=response.choices?.[0]?.message?.content;
  if(typeof text!=='string'||!text.trim())throw Object.assign(new Error('Модель не вернула текст'),{status:502});
  this.last={status:'model_online',checkedAt:new Date().toISOString(),model};return {ok:true,model,status:this.last};
 }
 async *stream(messages,{signal}={}){
  const {model,enabled,apiKey}=this.read();
  if(!enabled||!apiKey||!model)throw Object.assign(new Error('Cloud.ru не настроен'),{status:400});
  if(!Array.isArray(messages)||messages.length<1||messages.length>30||!messages.every(m=>['user','assistant','system'].includes(m.role)&&typeof m.content==='string'&&m.content.length<=16000))throw Object.assign(new Error('Invalid messages'),{status:400});
  this.bump('requests');
  const started=Date.now();
  let response;
  try{response=await this.fetchImpl(BASE+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model,messages,max_tokens:1024,stream:true}),signal:signal??AbortSignal.timeout(90000)});}
  catch(e){this.bump('failed');throw Object.assign(new Error('Нет соединения с Cloud.ru'),{status:503});}
  if(!response.ok){this.bump('failed');throw Object.assign(new Error(classifyCloudError(response.status)),{status:response.status});}
  if(!response.body){this.bump('failed');throw Object.assign(new Error('Пустой поток Cloud.ru'),{status:502});}
  const decoder=new TextDecoder();let buffer='',finished=false;
  for await(const chunk of response.body){
   buffer+=decoder.decode(chunk,{stream:true});
   buffer=buffer.replaceAll('\r\n','\n');
   if(buffer.length>1048576)throw Error('Cloud.ru stream overflow');
   let boundary;
   while((boundary=buffer.indexOf('\n\n'))>=0){
    const frame=buffer.slice(0,boundary).replaceAll('\r','');buffer=buffer.slice(boundary+2);
    const data=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('');
    if(!data)continue;
    if(data==='[DONE]'){finished=true;break;}
    let parsed;try{parsed=JSON.parse(data);}catch{throw Error('Invalid Cloud.ru stream frame');}
    const delta=parsed.choices?.[0]?.delta?.content;
    if(typeof delta==='string'&&delta)yield delta;
   }
   if(finished)break;
  }
  if(!finished){this.bump('failed');throw Error('Cloud.ru stream ended unexpectedly');}
  this.bump('durationMs',Date.now()-started);this.bump('succeeded');this.bump('unreportedResponses');
 }
 async complete(messages){
  const {model}=this.read();if(!model)throw Object.assign(new Error('Модель не выбрана'),{status:400});
  if(!Array.isArray(messages)||messages.length<1||messages.length>30||!messages.every(m=>['user','assistant','system'].includes(m.role)&&typeof m.content==='string'&&m.content.length<=16000))throw Object.assign(new Error('Invalid messages'),{status:400});
  return this.request('/chat/completions',{method:'POST',body:{model,messages,max_tokens:1024,stream:false},timeout:60000});
 }
}
