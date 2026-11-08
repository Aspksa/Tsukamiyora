// Small transparent Russian-English technical glossary, applied only to retrieval queries.
// This is not machine translation and cannot cover arbitrary multilingual text.
const pairs=[
 ['двигатель','engine'],['масло','oil'],['фильтр','filter'],
 ['колесо','wheel'],['тормоз','brake'],['шина','tire'],
 ['резервное','backup'],['копирование','backup'],['документ','document'],
 ['документы','documents'],['поиск','search'],['память','memory'],
 ['настройки','settings'],['автомобиль','car'],['ошибка','error']
];
const map=new Map();
for(const [ru,en] of pairs){map.set(ru,en);map.set(en,ru);}
export function expandMultilingualQuery(query,{maxTerms=24}={}){
 if(typeof query!=='string'||!query.trim()||query.length>1000||!Number.isInteger(maxTerms)||maxTerms<1||maxTerms>48)throw Error('Invalid multilingual query');
 const terms=(query.toLocaleLowerCase('ru').replaceAll('ё','е').match(/[\p{L}\p{N}]{2,}/gu)||[]);
 const result=new Set();
 for(const term of terms){
  if(result.size>=maxTerms)break;
  result.add(term);
  if(map.has(term)&&result.size<maxTerms)result.add(map.get(term));
 }
 return [...result].join(' ');
}
