import {FIELDS,FIELD_LABELS,FILTER_KIND,OTIF_STATUS_LABELS,type FieldKey} from '../config';
import type {AnalysisNode,Filter} from './types';
export type DirectedLink={source:string;target:string};
/** Containment is a hidden one-way filter link, not a merger of child filters. */
export function filterLinks(nodes:AnalysisNode[],links?:DirectedLink[]):DirectedLink[]{
 const known=new Set(nodes.map(n=>n.id));
 const explicit=links??nodes.flatMap(n=>n.parentId?[{source:n.parentId,target:n.id}]:[]);
 const membership=nodes.flatMap(n=>n.containerId&&known.has(n.containerId)?[{source:n.containerId,target:n.id}]:[]);
 return [...explicit,...membership];
}
export type FilterTrace={nodeId:string|null;sourceLabel:string;filter:Filter;scope:'global'|'inherited'|'local'};
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const NUMBER=/^-?\d{1,12}(?:\.\d{1,6})?$/;
export function makeFilter(field:FieldKey,value:string|string[],scope:'global'|'local'='global',op:Filter['op']='eq'):Filter{
 return validateFilters([{id:crypto.randomUUID(),field,op,value,scope}])[0];
}
export function validateFilters(value:unknown):Filter[]{
 if(!Array.isArray(value)||value.length>12)throw Error('Maximal 12 Filter pro Analysepfad.');
 const seen=new Set<string>();
 return value.map((raw:Filter)=>{
  if(!raw||typeof raw!=='object'||!FIELDS.includes(raw.field))throw Error('Nicht erlaubte Filterdimension');
  const kind=FILTER_KIND(raw.field), op=raw.op||'eq',v=raw.value;
  if(kind==='category'){
   if(op!=='eq'&&op!=='in')throw Error('Kategorie: nur gleich oder Mehrfachauswahl möglich');
   if(op==='eq'&&(typeof v!=='string'||!v.trim()||v.length>200))throw Error('Ungültiger Kategoriewert');
   if(op==='in'&&(!Array.isArray(v)||!v.length||v.length>20||v.some(x=>typeof x!=='string'||!x.trim()||x.length>200)))throw Error('Ungültige Mehrfachauswahl');
  }else{
   if(!['eq','between','gte','lte'].includes(op))throw Error('Ungültiger Vergleichsoperator');
   const check=(s:unknown)=>{
    if(typeof s!=='string'||(kind==='date'?!DATE.test(s)||Number.isNaN(Date.parse(s+'T00:00:00Z')):!NUMBER.test(s)))throw Error('Datum oder Zahl ungültig');
   };
   if(op==='between'){
    if(!Array.isArray(v)||v.length!==2)throw Error('Bitte gültige Von- und Bis-Werte angeben');
    v.forEach(check);
    if((kind==='number'?Number(v[0])>Number(v[1]):v[0]>v[1]))throw Error('Von-Wert darf nicht größer als Bis-Wert sein');
   }else check(v);
  }
  const normalized:Filter={id:typeof raw.id==='string'&&raw.id.length<130?raw.id:crypto.randomUUID(),field:raw.field,op,value:Array.isArray(v)?[...v]:v,scope:raw.scope};
  const key=raw.field+':'+op+':'+JSON.stringify(normalized.value);
  if(seen.has(key))throw Error('Diesen Filter gibt es bereits');
  seen.add(key);
  return normalized;
 });
}
export function traceFilters(globals:Filter[],nodes:AnalysisNode[],locals:Record<string,Filter[]>,id:string,links?:DirectedLink[]):FilterTrace[]{
 const byId=new Map(nodes.map(n=>[n.id,n])),parents=new Map<string,Set<string>>();
 for(const e of filterLinks(nodes,links)){if(byId.has(e.source)&&byId.has(e.target)){const set=parents.get(e.target)||new Set<string>();set.add(e.source);parents.set(e.target,set);}}
 const trail:AnalysisNode[]=[],visited=new Set<string>(),active=new Set<string>();
 function visit(key:string){
  const n=byId.get(key);if(!n)return;
  if(active.has(key))throw Error('Filterkreis erkannt – Verbindung bitte entfernen.');
  if(visited.has(key))return;
  active.add(key);
  for(const prior of [...(parents.get(key)||[])])visit(prior);
  active.delete(key);visited.add(key);trail.push(n);
 }
 visit(id);
 const trace:FilterTrace[]=globals.map(filter=>({nodeId:null,sourceLabel:'Global',filter,scope:'global'}));
 for(const n of trail){
  const scope=n.id===id?'local':'inherited';
  if(n.predicate)trace.push({nodeId:n.id,sourceLabel:n.label,filter:n.predicate,scope});
  for(const filter of locals[n.id]||[])trace.push({nodeId:n.id,sourceLabel:n.label,filter,scope});
 }
 return trace;
}
export function effectiveFilters(globals:Filter[],nodes:AnalysisNode[],locals:Record<string,Filter[]>,id:string,links?:DirectedLink[]):Filter[]{
 const unique=new Map<string,Filter>();
 for(const {filter} of traceFilters(globals,nodes,locals,id,links)){
  unique.set(filter.field+':'+filter.op+':'+JSON.stringify(filter.value),filter);
 }
 return validateFilters([...unique.values()]);
}
export function conflictingFields(filters:Filter[]):FieldKey[]{
 const grouped=new Map<FieldKey,Filter[]>();for(const f of filters)grouped.set(f.field,[...(grouped.get(f.field)||[]),f]);
 const conflicts:FieldKey[]=[];
 for(const [field,list] of grouped){
  if(list.length<2)continue;
  const kind=FILTER_KIND(field);
  if(kind==='category'){
   let intersection:Set<string>|null=null;
   for(const f of list){const values=new Set(Array.isArray(f.value)?f.value:[String(f.value)]);intersection=intersection===null?values:new Set<string>(Array.from(intersection as Set<string>).filter((v:string)=>values.has(v)));}
   if(intersection!==null&&intersection.size===0)conflicts.push(field);
  }else{
   let lower=-Infinity,upper=Infinity;
   for(const f of list){
    const numeric=(s:string)=>kind==='date'?new Date(s+'T00:00:00Z').getTime():Number(s);
    const v=f.value as string|string[];
    if(f.op==='between'&&Array.isArray(v)){lower=Math.max(lower,numeric(v[0]));upper=Math.min(upper,numeric(v[1]));}
    else if(f.op==='gte')lower=Math.max(lower,numeric(String(v)));
    else if(f.op==='lte')upper=Math.min(upper,numeric(String(v)));
    else if(f.op==='eq'){const n=numeric(String(v));lower=Math.max(lower,n);upper=Math.min(upper,n);}
   }
   if(lower>upper)conflicts.push(field);
  }
 }
 return conflicts;
}
export function formatFilter(f:Filter,fieldNames:Record<string,string>=FIELD_LABELS):string{
 const value=(v:string)=>OTIF_STATUS_LABELS[v]||v;
 const formatted=Array.isArray(f.value)?f.value.map(value).join(f.op==='between'?' – ':', '):value(f.value);
 const prefix:Record<Filter['op'],string>={eq:'=',in:'in',between:'von/bis',gte:'≥',lte:'≤'};
 return (fieldNames[f.field]||f.field)+' '+prefix[f.op]+' '+formatted;
}
export function toBackend(filters:Filter[]){return validateFilters(filters).map(({field,op,value})=>({field,op,value}));}
export function labels(filters:Filter[]){return filters.map(f=>formatFilter(f)).join(' · ');}
export function filterSignature(filters:Filter[]){return JSON.stringify(toBackend(filters).map(f=>[f.field,f.op,f.value]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));}
