import {FIELDS,type FieldKey} from '../config';
import {cleanDraft,type NNode,type NEdge} from './graph';
import type {SavedDraft,Filter,Metrics,Ribbon} from './types';

export type WidgetType='kpi'|'line'|'bar'|'table'|'donut'|'text';
export type MetricKey='orders'|'otifRate'|'onTimeRate'|'volumeConformanceRate'|'otifCases'|'lateOrders'|'avgDelayDays'|'affectedFactories'|'totalPenaltyEur'|'latePenaltyEur'|'shortfallPenaltyEur';
export type Width='half'|'full';
export type DashboardWidget={
 id:string;type:WidgetType;title:string;width:Width;
 metric?:MetricKey;dimension?:FieldKey;text?:string;
};
export type NodeDashboard={question:string;widgets:DashboardWidget[]};
export type WorkspaceDocument={version:3;graph:SavedDraft;globalFilters:Filter[];dashboards:Record<string,NodeDashboard>;metricNames?:Partial<Record<MetricKey,string>>};

export const METRIC_LABELS:Record<MetricKey,string>={
 orders:'Aufträge',otifRate:'OTIF · On Time In Full',onTimeRate:'On-Time Delivery',volumeConformanceRate:'Mengenkonformität',otifCases:'OTIF-Aufträge',lateOrders:'Verspätete Aufträge',avgDelayDays:'Ø Lieferverzug',affectedFactories:'Betroffene Werke',totalPenaltyEur:'Berechnete Vertragsstrafe',latePenaltyEur:'Verspätungsstrafe',shortfallPenaltyEur:'Unterlieferungsstrafe'
};
export const WIDGET_LABELS:Record<WidgetType,string>={
 kpi:'KPI-Karte',line:'Zeitreihe',bar:'Balkendiagramm',table:'Datentabelle',donut:'Donutdiagramm',text:'Text / Forschungsfrage'
};
export const WIDGET_ICONS:Record<WidgetType,string>={
 kpi:'chart-column',line:'chart-no-axes-combined',bar:'chart-column',table:'table-2',donut:'chart-pie',text:'type'
};
export const WIDGET_TYPES:WidgetType[]=['kpi','line','bar','table','donut','text'];
export const METRICS=Object.keys(METRIC_LABELS) as MetricKey[];

export function freshWidget(type:WidgetType):DashboardWidget{
 const standard:Record<WidgetType,Omit<DashboardWidget,'id'|'type'>>={
  kpi:{title:'OTIF · On Time In Full',metric:'otifRate',width:'half'},
  line:{title:'Lieferperformance im Zeitverlauf',width:'full'},
  bar:{title:'Vergleich der Lieferunternehmen',dimension:'delivery_company',width:'full'},
  table:{title:'Lieferunternehmen im Detail',dimension:'delivery_company',width:'full'},
  donut:{title:'Pünktliche und verspätete Lieferungen',width:'half'},
  text:{title:'Forschungsfrage',text:'Welche Segmente beeinflussen die Lieferperformance?',width:'full'}
 };
 return {id:crypto.randomUUID(),type,...standard[type]};
}
export function standardDashboard():NodeDashboard{
 return {question:'Welche Prozessmerkmale erklären die OTIF-Lücke und die modellierten Vertragsstrafen?',widgets:[
  {...freshWidget('kpi'),title:'OTIF',metric:'otifRate'}, {...freshWidget('kpi'),title:'Vertragsstrafe (Modell)',metric:'totalPenaltyEur'},
  {...freshWidget('kpi'),title:'Aufträge',metric:'orders'}, {...freshWidget('kpi'),title:'On-Time Delivery',metric:'onTimeRate'},
  {...freshWidget('line')},{...freshWidget('bar')}
 ]};
}
export function dashboardFor(store:Record<string,NodeDashboard>,nodeId:string):NodeDashboard{
 return store[nodeId] || standardDashboard();
}
export function addWidget(d:NodeDashboard,type:WidgetType,index=d.widgets.length):NodeDashboard{
 if(!WIDGET_TYPES.includes(type))throw Error('Unbekannter Widgettyp');
 if(d.widgets.length>=24)throw Error('Maximal 24 Widgets pro Knoten');
 const widgets=[...d.widgets];widgets.splice(Math.max(0,Math.min(index,widgets.length)),0,freshWidget(type));
 return {...d,widgets};
}
export function moveWidget(d:NodeDashboard,widgetId:string,toIndex:number):NodeDashboard{
 const widgets=[...d.widgets];const from=widgets.findIndex(w=>w.id===widgetId);
 if(from<0)return d;const [w]=widgets.splice(from,1);
 widgets.splice(Math.max(0,Math.min(toIndex,widgets.length)),0,w);
 return {...d,widgets};
}
export function updateWidget(d:NodeDashboard,id:string,patch:Partial<DashboardWidget>):NodeDashboard{ const widgets=d.widgets.map(w=>w.id!==id?w:{...w,...patch,id:w.id,type:w.type});
 return {...d,widgets};
}
export function removeWidget(d:NodeDashboard,id:string):NodeDashboard{
 return {...d,widgets:d.widgets.filter(w=>w.id!==id)};
}
export function normalizeDashboard(value:unknown):NodeDashboard|null{
 if(!value||typeof value!=='object')return null;
 const d=value as NodeDashboard;
 if(typeof d.question!=='string'||d.question.length>700||!Array.isArray(d.widgets)||d.widgets.length>24)return null;
 const ids=new Set<string>();const widgets:DashboardWidget[]=[];
 for(const w of d.widgets){
  if(!w||typeof w.id!=='string'||w.id.length>120||ids.has(w.id)||!WIDGET_TYPES.includes(w.type)
    ||typeof w.title!=='string'||w.title.length>100||!['full','half'].includes(w.width))return null;
  if(w.metric&&!METRICS.includes(w.metric))return null;
  if(w.dimension&&!FIELDS.includes(w.dimension))return null;
  if(w.text&&(typeof w.text!=='string'||w.text.length>3000))return null;
  ids.add(w.id);widgets.push(w);
 }
 return {question:d.question,widgets};
}
export function validDocument(value:unknown):WorkspaceDocument|null{
 if(!value||typeof value!=='object')return null;
 const d=value as WorkspaceDocument;
 if(d.version!==3||!cleanDraft(d.graph)||!Array.isArray(d.globalFilters)||d.globalFilters.length>12||!d.dashboards||typeof d.dashboards!=='object')return null;
 if(d.metricNames!==undefined){if(!d.metricNames||typeof d.metricNames!=='object'||Array.isArray(d.metricNames))return null;
  for(const [key,value] of Object.entries(d.metricNames)){if(!METRICS.includes(key as MetricKey)||typeof value!=='string'||value.length>80||value.trim().length<1)return null;}
 }
 const clean:Record<string,NodeDashboard>={};
 const entries=Object.entries(d.dashboards);
 if(entries.length>300)return null;
 for(const [id,settings] of entries){if(id.length>180)return null;const v=normalizeDashboard(settings);if(!v)return null;clean[id]=v;}
 return {...d,dashboards:clean};
}
export function metricValue(metric:MetricKey,m:Metrics|null,r:Ribbon|null|undefined):number|null{
 const source=r||m;
 const val=source?(source as unknown as Record<string,unknown>)[metric]:null;
 return typeof val==='number'&&Number.isFinite(val)?val:null;
}
export function metricFormat(metric:MetricKey,value:number|null):string{
 if(value==null||!Number.isFinite(value))return '–';
 const number=(n:number,digits:number)=>n.toLocaleString('de-DE',{minimumFractionDigits:digits,maximumFractionDigits:digits});
 if(['onTimeRate','volumeConformanceRate','otifRate'].includes(metric))return number(value,1)+' %';
 if(metric==='avgDelayDays')return number(value,1)+' Tage';
 if(metric.endsWith('PenaltyEur'))return number(value,2)+' €';
 return number(value,0);
}
export function makeDocument(graph:SavedDraft,globalFilters:Filter[],dashboards:Record<string,NodeDashboard>,metricNames:Partial<Record<MetricKey,string>>={}):WorkspaceDocument{
 const result={version:3 as const,graph,globalFilters,dashboards,metricNames};
 if(!validDocument(result))throw Error('Ungültige Workspace-Daten. Bitte überprüfe die Einstellungen.');
 return result;
}