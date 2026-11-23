import {FIELDS,FIELD_LABELS,type FieldKey} from '../config';
import type {AnalysisNode,Filter} from './types';
export type DirectedLink={source:string;target:string};
export function makeFilter(field:FieldKey,value:string,scope:'global'|'local'='global'):Filter{
 if(!FIELDS.includes(field)||typeof value!=='string'||value.length>200||!value.trim())throw Error('Ungültige Filterdefinition');
 return {id:crypto.randomUUID(),field,op:'eq',value:value.trim(),scope};
}
export function validateFilters(value:unknown):Filter[]{
 if(!Array.isArray(value)||value.length>12)throw Error('Maximal 12 Filter sind möglich');
 const seen=new Set<string>();
 return value.map((f:Filter)=>{
  if(!f||typeof f!=='object'||!FIELDS.includes(f.field)||f.op!=='eq'||typeof f.value!=='string'||!f.value.trim()||f.value.length>200)throw Error('Unbekannter Filter oder Operator');
  const normalized={id:typeof f.id==='string'?f.id:crypto.randomUUID(),field:f.field,op:'eq' as const,value:f.value.trim(),scope:f.scope};
  const key=f.field+':'+f.value;
  if(seen.has(key))throw Error('Filter bereits vorhanden: '+FIELD_LABELS[f.field]);
  seen.add(key);return normalized;
 });
}
/**
 * Resolve all filters upstream of a node, including every manually connected edge.
 * Directed arrows mean filter flow (source → target). Merge at multi-parent nodes
 * is an AND; conflicting values are retained, so SQL correctly returns zero cases.
 * Existing four-argument callers retain the legacy parentId chain.
 */
export function effectiveFilters(globals:Filter[],nodes:AnalysisNode[],locals:Record<string,Filter[]>,id:string,links?:DirectedLink[]):Filter[]{
 const byId=new Map(nodes.map(n=>[n.id,n]));
 const parents=new Map<string,Set<string>>();
 if(links!==undefined){
  for(const e of links){
   if(!byId.has(e.source)||!byId.has(e.target))continue;
   const set=parents.get(e.target)||new Set<string>();set.add(e.source);parents.set(e.target,set);
  }
 }
 const visited=new Set<string>(),active=new Set<string>();const ordered:AnalysisNode[]=[];
 const walk=(key:string)=>{
  const n=byId.get(key);if(!n)return;
  if(active.has(key))throw Error('Filterkreis im Diagramm: Verbindung entfernen');
  if(visited.has(key))return;
  active.add(key);
  const predecessors=links===undefined?(n.parentId?[n.parentId]:[]):[...(parents.get(key)||[])];
  for(const prev of predecessors)walk(prev);
  active.delete(key);visited.add(key);ordered.push(n);
 };
 walk(id);
 const filters:Filter[]=[...globals];
 for(const n of ordered){if(n.predicate)filters.push(n.predicate);filters.push(...(locals[n.id]||[]));}
 const uniq=new Map<string,Filter>();
 for(const f of filters)uniq.set(f.field+'='+f.value,f);
 return validateFilters([...uniq.values()]);
}
export function conflictingFields(filters:Filter[]):FieldKey[]{
 const values=new Map<FieldKey,Set<string>>();
 for(const f of filters){const set=values.get(f.field)||new Set<string>();set.add(f.value);values.set(f.field,set);}
 return [...values.entries()].filter(([,set])=>set.size>1).map(([field])=>field);
}
export function toBackend(filters:Filter[]){return filters.map(({field,op,value})=>({field,op,value}));}
export function labels(filters:Filter[]){return filters.map(f=>FIELD_LABELS[f.field]+': '+f.value).join(' · ');}
export function filterSignature(filters:Filter[]){return JSON.stringify(toBackend(filters).map(f=>[f.field,f.op,f.value]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));}
