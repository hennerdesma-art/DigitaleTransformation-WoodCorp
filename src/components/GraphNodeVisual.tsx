import React from 'react';
import type {GraphNodeData} from '../core/types';
import {formatCalculated} from '../core/calculations';
import {number,percent} from './Ui';
import {days,E02_INTERVALS} from '../core/processIntervals';
import {AdvancedChart} from './AdvancedCharts';
import type {DashboardWidget,WidgetType} from '../core/dashboard';
import type {DashboardData} from '../core/types';
export function GraphNodeVisual({data}:{data:GraphNodeData}){
 const {analysis,onTimeRate,orders,chartRows,trendRows,calculation,busy,error}=data;
 const kind=analysis.visualization||'kpi';
 if(busy)return <div className="node-viz-loading" role="status"><span className="nxt-spinner"/> Werte werden aktualisiert …</div>;
 if(error)return <p className="node-viz-error" role="status">{error}</p>;
 if(['stacked','stacked100','heatmap','pareto','scatter','waterfall','histogram','treemap','funnel'].includes(kind)){
  const widget:DashboardWidget={
   id:'graph-chart:'+analysis.id,type:kind as WidgetType,title:analysis.label,width:'full',
   dimension:analysis.chartDimension||'factory',
   compareDimension:(analysis.chartDimension==='product_type'?'factory':'product_type'),
   distributionMeasure:'quantity_change_count',
   metric:'otifRate'
  };
  const detail:DashboardData={metrics:data.fullMetrics||null,trend:trendRows||[],breakdown:chartRows||[],pending:false,error:null};
  return <div className="graph-advanced-chart nodrag nowheel"><AdvancedChart widget={widget} detail={detail} filters={data.appliedFilters||[]}/></div>;
 }
 if(kind==='process_interval'){
  const stat=data.processInterval;
  const label=E02_INTERVALS[analysis.intervalKey||'order_to_delivery'].short;
  return <div className="node-viz-process">
    <small>{label}</small>
    <strong>{stat?days(stat.medianDays):'–'}</strong>
    <div><span>P90: {stat?days(stat.p90Days):'–'}</span><span>{stat?number(stat.validCases):'–'} gültige Fälle</span></div>
    <p>{stat?.coveragePct==null?'Keine auswertbaren Prozessdaten':Number(stat.coveragePct).toLocaleString('de-DE',{maximumFractionDigits:1})+' % Datenabdeckung'}</p>
   </div>;
 }
 if(kind==='calculation'){
  const estimate=calculation?.isEstimate;
  const contractual=calculation?.template?.endsWith('_penalty_eur');
  return <div className="node-viz-result"><strong>{formatCalculated(calculation||null)}</strong><small>{contractual?'Berechnete Vertragsstrafe · 0,75 €/kg':estimate?'Szenariorechnung · kein Ist-Kostenwert':calculation?.unit||'SQL-Vorlage'} · {calculation?number(calculation.eligibleCases)+' gültige Fälle':'Kostensatz konfigurieren'}</small></div>;
 }
 if(kind==='donut'){
  const preferred=(analysis.metricId||'otifRate')==='onTimeRate'?onTimeRate:data.primaryValue;
  const rate=preferred==null?null:Math.max(0,Math.min(100,Number(preferred)));
  const label=(analysis.metricId||'otifRate')==='onTimeRate'?'On-Time':'OTIF';
  return <div className="node-viz-donut"><div className="node-viz-ring" role="img" aria-label={rate===null?'Keine Werte':percent(rate)+' '+label} style={{background:rate===null?'#d8e7e8':`conic-gradient(#008b92 ${rate}%, #dce8e9 0)`}}><div><b>{percent(rate)}</b><small>{label}</small></div></div><span>{number(orders)} Aufträge</span></div>;
 }
 if(kind==='bar'){
  if(!chartRows?.length)return <p className="node-viz-empty">Keine Segmente für aktuelle Filter.</p>;
  return <div className="node-viz-bars" role="list" aria-label="Pünktlichkeitsquote je Segment">{chartRows.filter(r=>r.label!=null).slice(0,5).map((r,i)=><div key={String(r.label)+i} role="listitem" className="node-viz-bar"><div><span title={String(r.label)}>{r.label}</span><b>{percent(r.on_time_rate)}</b></div><div className="node-viz-track"><i style={{width:Math.max(0,Math.min(100,Number(r.on_time_rate)||0))+'%'}}/></div></div>)}</div>;
 }
 if(kind==='line'){
  const rows=(trendRows||[]).filter(r=>r.on_time_rate!=null);
  if(!rows.length)return <p className="node-viz-empty">Keine Monatswerte für diese Filter.</p>;
  const pts=rows.map((r,i)=>`${10+i*200/Math.max(1,rows.length-1)},${98-Number(r.on_time_rate)*.78}`).join(' ');
  return <div className="node-viz-line"><svg role="img" aria-label="On-Time Delivery nach Monat" viewBox="0 0 220 114"><line x1="10" x2="210" y1="98" y2="98" stroke="#cbdcde"/><line x1="10" x2="210" y1="20" y2="20" stroke="#e4f0f1"/><polyline points={pts} stroke="#008b92" strokeWidth="2.7" strokeLinejoin="round" strokeLinecap="round" fill="none"/></svg><div><span>{rows[0]?.month}</span><b>{percent(rows.at(-1)?.on_time_rate)}</b><span>{rows.at(-1)?.month}</span></div></div>;
 }
 return null;
}
