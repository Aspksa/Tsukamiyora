import { mkdirSync,readFileSync,writeFileSync,existsSync,renameSync,chmodSync } from 'node:fs';
import { join } from 'node:path';
const BASE='https://foundation-models.api.cloud.ru/v1';
export function classifyCloudError(status){
 return ({400:'Неверные параметры запроса',401:'Неверный или просроченный API-ключ',403:'Нет доступа к Foundation Models или модели',404:'Модель или адрес API не найден',409:'Модель недоступна',429:'Превышен лимит запросов',500:'Ошибка сервера Cloud.ru',502:'Ошибка шлюза',503:'Сервис временно недоступен',504:'Тайм-аут шлюза'})[status]||'Ошибка Cloud.ru';
}
export class CloudRu {
 constructor({root=process.cwd(),fetchImpl=fetch}={}){this.path=join(root,'data','cloudru-settings.json');this.fetchImpl=fetchImpl;this.last={status:'not_checked',checkedAt:null};}
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
  let response;
  try{response=await this.fetchImpl(BASE+path,{method,headers:{Authorization:'Bearer '+settings.apiKey,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout)});}
  catch(e){throw Object.assign(new Error(e.name==='TimeoutError'?'Превышено время ожидания Cloud.ru':'Нет соединения с Cloud.ru'),{status:503});}
  if(!response.ok)throw Object.assign(new Error(classifyCloudError(response.status)),{status:response.status});
  return response.json();
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
  let response;
  try{response=await this.fetchImpl(BASE+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model,messages,max_tokens:1024,stream:true}),signal:signal??AbortSignal.timeout(90000)});}
  catch(e){throw Object.assign(new Error('Нет соединения с Cloud.ru'),{status:503});}
  if(!response.ok)throw Object.assign(new Error(classifyCloudError(response.status)),{status:response.status});
  if(!response.body)throw Object.assign(new Error('Пустой поток Cloud.ru'),{status:502});
  const decoder=new TextDecoder();let buffer='',finished=false;
  for await(const chunk of response.body){
   buffer+=decoder.decode(chunk,{stream:true});
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
  if(!finished)throw Error('Cloud.ru stream ended unexpectedly');
 }
 async complete(messages){
  const {model}=this.read();if(!model)throw Object.assign(new Error('Модель не выбрана'),{status:400});
  if(!Array.isArray(messages)||messages.length<1||messages.length>30||!messages.every(m=>['user','assistant','system'].includes(m.role)&&typeof m.content==='string'&&m.content.length<=16000))throw Object.assign(new Error('Invalid messages'),{status:400});
  return this.request('/chat/completions',{method:'POST',body:{model,messages,max_tokens:1024,stream:false},timeout:60000});
 }
}
