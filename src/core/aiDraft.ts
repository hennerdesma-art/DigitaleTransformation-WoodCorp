import {freshWidget,normalizeDashboard,type NodeDashboard,type WidgetType} from './dashboard';
import type {FieldKey} from '../config';
export type DraftTopic='executive'|'segment'|'process';
export const DRAFT_TOPICS:Record<DraftTopic,{label:string;question:string;types:WidgetType[]}>={
 executive:{label:'OTIF · Executive Overview',question:'Wie groß ist die OTIF-Lücke und welche modellierten Vertragsstrafen entstehen?',types:['kpi','kpi','kpi','kpi','line','waterfall']},
 segment:{label:'Performance Breakdown',question:'Welche Segmente zeigen auffällige Lieferperformance?',types:['kpi','bar_vertical','stacked100','heatmap','pareto']},
 process:{label:'Process Intervals',question:'Welche Prozessintervalle unterscheiden OTIF- von Nicht-OTIF-Aufträgen?',types:['e02_overview','e02_compare','e02_quality','e02_distribution']}
};
/** Local template, NOT an AI call. Future provider output must pass the same normalization and allowed-field checks. */
export function createDashboardDraft(topic:DraftTopic,question:string,allowedFields:FieldKey[]):NodeDashboard{
 const config=DRAFT_TOPICS[topic];
 if(!config)throw Error('Unbekannte Analysevorlage.');
 const q=question.trim()||config.question;
 if(q.length>700)throw Error('Forschungsfrage darf höchstens 700 Zeichen enthalten.');
 const allowed=new Set(allowedFields);
 const widgets=config.types.map(type=>freshWidget(type));
 if(topic==='executive'){
  const keys=['otifRate','onTimeRate','volumeConformanceRate','totalPenaltyEur'] as const;
  const titles=['OTIF','On-Time Delivery','Mengenkonformität','Berechnete Vertragsstrafe'];
  widgets.slice(0,4).forEach((w,i)=>{w.metric=keys[i];w.title=titles[i]});
 }
 // Only use dimensions currently enabled in the catalog; never silently query disabled fields.
 const permitted=widgets.filter(w=>(!w.dimension||allowed.has(w.dimension))&&(!w.compareDimension||allowed.has(w.compareDimension)));
 const result=normalizeDashboard({question:q,widgets:permitted});
 if(!result)throw Error('Dashboard-Konfiguration ungültig.');
 return result;
}
