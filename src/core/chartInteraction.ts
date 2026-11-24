import type {FieldKey} from '../config';
import type {Filter} from './types';
import {conflictingFields,makeFilter,validateFilters} from './filters';
import {segmentMetric} from './rootCauseMetrics';
export function rankSegments<T extends {label:string|null}>(rows:T[],metric:string,selected:string[]|null,ascending:boolean,limit:number|null):T[]{
 const list=rows.filter(r=>r.label!==null&&(selected===null||selected.includes(r.label))).sort((a,b)=>{
  const x=segmentMetric(a,metric),y=segmentMetric(b,metric);
  if(x===null)return y===null?String(a.label).localeCompare(String(b.label)):1;
  if(y===null)return -1;return (ascending?x-y:y-x)||String(a.label).localeCompare(String(b.label));
 });return limit===null?list:list.slice(0,limit);
}
export function appendChartFilter(base:Filter[],extra:Filter[],field:FieldKey,value:string):Filter[]{
 const next=extra.filter(f=>f.field!==field);
 if(!base.some(f=>f.field===field&&f.op==='eq'&&f.value===value))next.push(makeFilter(field,value,'local'));
 const all=validateFilters([...base,...next]);if(conflictingFields(all).length)throw Error('Die Diagrammauswahl widerspricht einem bestehenden Filter.');
 return next;
}
