import React from 'react';
import type {Metrics,Filter} from '../core/types';
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
export function CalculationLogic({metric,metrics,trace,fieldNames,compact=false}:{
 metric:MetricKey;metrics:Metrics|null;trace:FilterTrace[];fieldNames:Record<string,string>;compact?:boolean
}){
 const def=KPI_DEFINITIONS[metric],result=metricValue(metric,metrics,null);
 return <div className={'nxt-calculation-logic '+(compact?'compact':'')}>
  <div className="calculation-overview"><span className="nxt-eyebrow">Berechnungslogik · v1</span><h3>{def.label}</h3><strong>{metricFormat(metric,result)}</strong><small>Definition: {metrics?.definitionVersion||KPI_DEFINITION_VERSION} · gefilterte Fälle</small></div>
  <section className="calculation-section"><h4><Icon name="chart-column" size={16}/> Formel und Aggregation</h4><p className="calculation-formula">{def.formula}</p>
   <dl><dt>Datenquelle</dt><dd>{def.source}</dd><dt>Aggregationsebene</dt><dd>{def.grain}</dd><dt>Bezugsmenge / Nenner</dt><dd>{def.denominator}</dd><dt>Ausschlüsse</dt><dd>{def.exclusions}</dd></dl>
   {breakdown(metric,metrics).length>0&&<div className="calculation-facts">{breakdown(metric,metrics).map(([k,v])=><div key={k}><span>{k}</span><b>{v}</b></div>)}</div>}
  </section>
  <section className="calculation-section"><h4><Icon name="git-branch" size={16}/> Aktiver Filterpfad</h4>
   {trace.length===0?<p className="muted">Keine Einschränkungen – gesamter zulässiger Datenbestand.</p>:<ol className="calculation-filter-path">{trace.map((t,i)=><li key={i}><span className="filter-source">{t.scope==='global'?'Global':t.scope==='local'?'Aktueller Knoten':'Vorgängerknoten'} · {t.sourceLabel}</span><b>{formatFilter(t.filter,fieldNames)}</b></li>)}</ol>}
   <p className="muted">Alle Filter dieses Pfades werden mit UND kombiniert. Bei mehreren eingehenden Pfeilen gelten alle Vorgängerbedingungen.</p>
  </section>
  <section className="calculation-section"><h4><Icon name="database" size={16}/> Fachliche SQL-Logik</h4>
   <pre className="calculation-sql"><code>{def.sql}</code></pre><p className="muted">Lesbare Beschreibung der serverseitigen Berechnung, kein ausführbarer SQL-Editor. Die konkreten Filter werden sicher und parametrisiert an Supabase übergeben.</p>
   {def.note&&<p className="calculation-disclaimer"><Icon name="triangle-alert" size={16}/>{def.note}</p>}
  </section>
 </div>;
}
