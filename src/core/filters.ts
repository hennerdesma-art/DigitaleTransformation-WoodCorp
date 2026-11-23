import {FIELDS,FIELD_LABELS,type FieldKey} from '../config';
import type {AnalysisNode,Filter} from './types';
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
export function effectiveFilters(globals:Filter[],nodes:AnalysisNode[],locals:Record<string,Filter[]>,id:string):Filter[]{
 const byId=new Map(nodes.map(n=>[n.id,n]));const trail:AnalysisNode[]=[];const seen=new Set<string>();let at=id;
 while(at&&byId.has(at)){if(seen.has(at))throw Error('Zyklische Elternbeziehung');seen.add(at);const n=byId.get(at)!;trail.unshift(n);at=n.parentId||'';}
 const filters:Filter[]=[...globals];
 for(const n of trail){if(n.predicate)filters.push(n.predicate);filters.push(...(locals[n.id]||[]));}
 return validateFilters(filters);
}
export function toBackend(filters:Filter[]){return filters.map(({field,op,value})=>({field,op,value}));}
export function labels(filters:Filter[]){return filters.map(f=>FIELD_LABELS[f.field]+': '+f.value).join(' · ');}
export function filterSignature(filters:Filter[]){return JSON.stringify(toBackend(filters).map(f=>[f.field,f.op,f.value]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));}
