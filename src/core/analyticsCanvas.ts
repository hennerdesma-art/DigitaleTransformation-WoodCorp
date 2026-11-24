import type {FieldKey} from '../config';
import {CHART_SEGMENT_FIELDS,FIELD_LABELS} from '../config';
import {SEGMENT_METRIC_KEYS,segmentMetric} from './rootCauseMetrics';
import type {DashboardWidget,MetricKey} from './dashboard';
import type {AnalysisNode,Filter} from './types';
import {validateFilters} from './filters';
export type TimeAnchor='delivered'|'ordered'|'promised';
export const TIME_LABELS:Record<TimeAnchor,string>={delivered:'Tatsächlicher Liefermonat',ordered:'Auftragseingangsmonat',promised:'Zugesagter Liefermonat'};
export const TIME_DIMENSIONS={delivered:'delivery_month',ordered:'order_received_month',promised:'promised_month'} as const;
export type SegmentDimension=FieldKey|'order_received_month'|'promised_month'|'customer_product'|'all';
export const dimensionLabel=(d:SegmentDimension)=>d==='all'?'Gesamt':d==='customer_product'?'Kunden-ID × Produkt':d==='order_received_month'?TIME_LABELS.ordered:d==='promised_month'?TIME_LABELS.promised:FIELD_LABELS[d];
export const manualChartFields=(allowed:FieldKey[])=>allowed.filter(f=>CHART_SEGMENT_FIELDS.includes(f)||f==='cust_id'||f==='cust_name');
export function dimensionOptions(allowed:FieldKey[],current:SegmentDimension):SegmentDimension[]{
 const fields:SegmentDimension[]=[...manualChartFields(allowed),'all'];
 if(allowed.includes('order_received_date'))fields.push('order_received_month');
 if(allowed.includes('promised_date'))fields.push('promised_month');
 if(allowed.includes('cust_id')&&allowed.includes('product_type'))fields.push('customer_product');
 return [...new Set([current,...fields])];
}
export function isSegmentDimension(d:unknown):d is SegmentDimension{return typeof d==='string'&&(['all','customer_product','order_received_month','promised_month','cust_id','cust_name',...CHART_SEGMENT_FIELDS] as string[]).includes(d);}
export type ChartDisplay={groupBy?:SegmentDimension;timeAnchor?:TimeAnchor;ascending?:boolean;limit?:'5'|'10'|'12'|'20'|'50'|'100'|'all';orientation?:'horizontal'|'vertical';selectedLabels?:string[]|null;columns?:MetricKey[];sortMetric?:MetricKey;xMetric?:MetricKey;yMetric?:MetricKey;sizeMetric?:MetricKey;secondaryMetric?:MetricKey;comparison?:'rates'|'costs'|'mass';targetOtd?:number;lateReduction?:number;shortfallReduction?:number;pageSize?:10|20|50};
const supportedMetric=(v:unknown)=>typeof v==='string'&&SEGMENT_METRIC_KEYS.some(k=>k===v);
export function validChartDisplay(v:unknown):boolean{
 if(v===undefined)return true;if(!v||typeof v!=='object'||Array.isArray(v))return false;
 const d=v as ChartDisplay,known=['groupBy','timeAnchor','ascending','limit','orientation','selectedLabels','columns','sortMetric','xMetric','yMetric','sizeMetric','secondaryMetric','comparison','targetOtd','lateReduction','shortfallReduction','pageSize'];
 if(Object.keys(d).some(k=>!known.includes(k)))return false;
 if(d.groupBy!==undefined&&!isSegmentDimension(d.groupBy)||d.timeAnchor!==undefined&&!['delivered','ordered','promised'].includes(d.timeAnchor)||d.ascending!==undefined&&typeof d.ascending!=='boolean'||d.limit!==undefined&&!['5','10','12','20','50','100','all'].includes(d.limit)||d.orientation!==undefined&&!['horizontal','vertical'].includes(d.orientation))return false;
 if(d.selectedLabels!==undefined&&d.selectedLabels!==null&&(!Array.isArray(d.selectedLabels)||d.selectedLabels.length>400||d.selectedLabels.some(s=>typeof s!=='string'||s.length>200)||new Set(d.selectedLabels).size!==d.selectedLabels.length))return false;
 if(d.columns!==undefined&&(!Array.isArray(d.columns)||d.columns.length<1||d.columns.length>12||!d.columns.every(supportedMetric)||new Set(d.columns).size!==d.columns.length))return false;
 if([d.sortMetric,d.xMetric,d.yMetric,d.sizeMetric,d.secondaryMetric].some(m=>m!==undefined&&!supportedMetric(m)))return false;
 if(d.comparison!==undefined&&!['rates','costs','mass'].includes(d.comparison)||d.pageSize!==undefined&&![10,20,50].includes(d.pageSize))return false;
 return [d.targetOtd,d.lateReduction,d.shortfallReduction].every(x=>x===undefined||(typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=100));
}
export function groupFor(w:DashboardWidget,fallback:FieldKey='factory'):SegmentDimension{return w.display?.groupBy||w.dimension||fallback;}
export function targetSavings(dateCoverage:number,lateOrders:number,lateCost:number,target:number){
 if(![dateCoverage,lateOrders,lateCost,target].every(Number.isFinite)||!Number.isInteger(dateCoverage)||!Number.isInteger(lateOrders)||dateCoverage<=0||lateOrders<0||lateOrders>dateCoverage||lateCost<0||target<0||target>100)return null;
 const additional=Math.min(lateOrders,Math.max(0,Math.ceil(dateCoverage*target/100-1e-9)-(dateCoverage-lateOrders)));
 return {additional,actual:100*(dateCoverage-lateOrders)/dateCoverage,savings:lateOrders?lateCost*additional/lateOrders:0};
}
export function canvasWidgetFor(node:AnalysisNode,dashboards:Record<string,{widgets:DashboardWidget[]}>):DashboardWidget|undefined{return dashboards[node.id]?.widgets.find(w=>w.id===node.canvasWidgetId);}
export function combineLocals(saved:Record<string,Filter[]>,temporary:Record<string,Filter[]>):Record<string,Filter[]>{
 const result={...saved};for(const [id,fs] of Object.entries(temporary))result[id]=validateFilters([...(saved[id]||[]),...fs]);return result;
}
export function sortSegmentRows<T extends {label:string|null}>(rows:T[],metric:string,asc=false):T[]{return [...rows].sort((a,b)=>{const av=segmentMetric(a,metric),bv=segmentMetric(b,metric);if(av===null)return bv===null?String(a.label).localeCompare(String(b.label)):1;if(bv===null)return -1;return (asc?av-bv:bv-av)||String(a.label).localeCompare(String(b.label));});}
