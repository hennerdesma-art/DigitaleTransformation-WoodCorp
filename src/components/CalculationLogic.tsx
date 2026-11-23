import React from 'react';
import type {Metrics,AnalysisNode,CalculatedMetric} from '../core/types';
import {CALCULATION_TEMPLATES,formatCalculated} from '../core/calculations';
import type {FilterTrace} from '../core/filters';
import {formatFilter} from '../core/filters';
import {KPI_DEFINITIONS,KPI_DEFINITION_VERSION} from '../core/kpiDefinitions';
import {METRIC_LABELS,metricFormat,metricValue,type MetricKey} from '../core/dashboard';
import Icon from './Icon';
import {number} from './Ui';

function breakdown(metric:MetricKey,m:Metrics|null):Array<[string,string]>{
 if(!m)return [];
 const n=(key:keyof Metrics)=>number(typeof m[key]==='number'?(m[key] as number):null);
 if(metric==='otifRate')return [['OTIF-Aufträge (Zähler)',n('otifCases')],['Bewertbare Aufträge (Nenner)',n('otifCoverage')],['Nicht klassifiziert',n('unclassifiedCases')]];
 if(metric==='onTimeRate')return [['Pünktliche Aufträge',n('onTimeCases')],['Datumsbewertbare Aufträge',n('dateCoverage')]];
 if(metric==='volumeConformanceRate')return [['Mengenkonforme Aufträge',n('inFullCases')],['Bewertbare Aufträge',n('volumeCoverage')]];
 if(metric==='totalPenaltyEur')return [['Verspätet gelieferte Masse',n('lateKg')+' kg'],['Fehlende Masse',n('shortfallKg')+' kg'],['Verspätungsanteil',metricFormat('latePenaltyEur',m.latePenaltyEur??null)],['Unterlieferungsanteil',metricFormat('shortfallPenaltyEur',m.shortfallPenaltyEur??null)],['Satz',String(m.penaltyRateEurPerKg??0.75)+' €/kg'],['Ausgeschlossene Aufträge (nicht kg / fehlende Mengen)',n('kgExcludedCases')]];
 if(metric==='latePenaltyEur')return [['Verspätet gelieferte Masse',n('lateKg')+' kg'],['Satz',String(m.penaltyRateEurPerKg??0.75)+' €/kg'],['Ausgeschlossene Aufträge',n('kgExcludedCases')]];
 if(metric==='shortfallPenaltyEur')return [['Fehlende Masse',n('shortfallKg')+' kg'],['Satz',String(m.penaltyRateEurPerKg??0.75)+' €/kg'],['Ausgeschlossene Aufträge',n('kgExcludedCases')]];
 return [['Gefilterte Aufträge',n('orders')],['Aufträge mit vollständigen Lieferdaten',n('dateCoverage')]];
}
export function CalculationLogic({metric,metrics,trace,fieldNames,compact=false,node,calculated}:{
 metric:MetricKey;metrics:Metrics|null;trace:FilterTrace[];fieldNames:Record<string,string>;compact?:boolean;node?:AnalysisNode;calculated?:CalculatedMetric|null
}){
 const template=node?.visualization==='calculation'?node.calculationTemplate||'total_penalty_eur':null;
 const calculatedDefinition=template?CALCULATION_TEMPLATES[template]:null;
 const def=KPI_DEFINITIONS[metric];const result=metricValue(metric,metrics,null);
 const displayed=calculatedDefinition?formatCalculated(calculated||null):metricFormat(metric,result);
 const source=calculatedDefinition?'woodcorp_cases (Case-Key), Berechnung über nxt_calculated_metric':def.source;
 const denominator=calculatedDefinition?'Fallbezogene Summe oder Quote; siehe Definition der Vorlage':def.denominator;
 const exclusions=calculatedDefinition?'Von der Abfrage ausgeschlossene Fälle siehe unten':def.exclusions;
 const formula=calculatedDefinition?.description||def.formula;
 const sql=calculatedDefinition?.sql||def.sql;
 const note=calculatedDefinition?(calculated?.isModelledPenalty||template?.endsWith('_penalty_eur')?'Aus der Vertragsregel modellierte Strafgebühr (0,75 €/kg); keine nachgewiesene Zahlung.':'Berechnete Kennzahl aus der geprüften SQL-Vorlage.'):def.note;
 return <div className={'nxt-calculation-logic '+(compact?'compact':'')}>
  <div className="calculation-overview"><span className="nxt-eyebrow">Berechnungslogik · v1</span><h3>{calculatedDefinition?.label||def.label}</h3><strong>{displayed}</strong><small>Definition: {metrics?.definitionVersion||KPI_DEFINITION_VERSION} · gefilterte Fälle</small></div>
  <section className="calculation-section"><h4><Icon name="chart-column" size={16}/> Formel und Aggregation</h4><p className="calculation-formula">{formula}</p>
   <dl><dt>Datenquelle</dt><dd>{source}</dd><dt>Aggregationsebene</dt><dd>{def.grain}</dd><dt>Bezugsmenge / Nenner</dt><dd>{denominator}</dd><dt>Ausschlüsse</dt><dd>{exclusions}</dd></dl>
   {(calculatedDefinition?[["Gefilterte Fälle",String(calculated?.caseCount??'–')],["Bewertbare Fälle",String(calculated?.eligibleCases??'–')],["Ausgeschlossene Fälle",String(calculated?.excludedCases??'–')],...(calculated?.rateEurPerKg!=null?[["Kostensatz",String(calculated.rateEurPerKg)+' €/kg']]:[])]:breakdown(metric,metrics)).length>0&&<div className="calculation-facts">{(calculatedDefinition?[["Gefilterte Fälle",String(calculated?.caseCount??'–')],["Bewertbare Fälle",String(calculated?.eligibleCases??'–')],["Ausgeschlossene Fälle",String(calculated?.excludedCases??'–')],...(calculated?.rateEurPerKg!=null?[["Kostensatz",String(calculated.rateEurPerKg)+' €/kg']]:[])]:breakdown(metric,metrics)).map(([k,v])=><div key={k}><span>{k}</span><b>{v}</b></div>)}</div>}
  </section>
  <section className="calculation-section"><h4><Icon name="git-branch" size={16}/> Aktiver Filterpfad</h4>
   {trace.length===0?<p className="muted">Keine Einschränkungen – gesamter zulässiger Datenbestand.</p>:<ol className="calculation-filter-path">{trace.map((t,i)=><li key={i}><span className="filter-source">{t.scope==='global'?'Global':t.scope==='local'?'Aktueller Knoten':'Vorgängerknoten'} · {t.sourceLabel}</span><b>{formatFilter(t.filter,fieldNames)}</b></li>)}</ol>}
   <p className="muted">Alle Filter dieses Pfades werden mit UND kombiniert. Bei mehreren eingehenden Pfeilen gelten alle Vorgängerbedingungen. Ereignisbezogene Filter werden je Case-Key aus woodcorp_activities abgeleitet und über nxt_case_process_features mit Aufträgen verknüpft.</p>
  </section>
  <section className="calculation-section"><h4><Icon name="database" size={16}/> Fachliche SQL-Logik</h4>
   <pre className="calculation-sql"><code>{sql}</code></pre><p className="muted">Lesbare Beschreibung der serverseitigen Berechnung, kein ausführbarer SQL-Editor. Die konkreten Filter werden sicher und parametrisiert an Supabase übergeben.</p>
   {note&&<p className="calculation-disclaimer"><Icon name="triangle-alert" size={16}/>{note}</p>}
  </section>
 </div>;
}
