import React,{useEffect,useState} from 'react';
import {analysisApi} from '../lib/supabase';
import type {Filter} from '../core/types';
import type {DashboardWidget} from '../core/dashboard';
import {E02_INTERVALS,E02_KEYS,days,type E02IntervalKey,type E02IntervalStat,type E02Summary,type E02DistributionBucket} from '../core/processIntervals';
import {Notice,Spinner} from './Ui';

export const PROCESS_TYPES=['e02_overview','e02_compare','e02_quality','e02_distribution'] as const;
const fmt=(v:number|null|undefined,digits=0)=>v==null?'–':Number(v).toLocaleString('de-DE',{maximumFractionDigits:digits});
const max=(rows:number[])=>Math.max(1,...rows.filter(x=>Number.isFinite(x)));
function TableValues({headers,rows}:{headers:string[];rows:(string|number)[][]}){
 return <details className="nxt-chart-data-table"><summary>Berechnete Werte als Tabelle anzeigen</summary>
  <div className="table-overflow"><table><thead><tr>{headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead>
  <tbody>{rows.map((row,i)=><tr key={i}>{row.map((v,j)=><td key={j}>{v}</td>)}</tr>)}</tbody></table></div>
 </details>;
}
function useProcessData(widget:DashboardWidget,filters:Filter[]){
 const interval=widget.intervalKey||'order_to_delivery';
 const signature=JSON.stringify([interval,widget.type,filters.map(f=>[f.field,f.op,f.value])]);
 const [state,setState]=useState<{key:string;busy:boolean;error:string;summary:E02Summary|null;bins:E02DistributionBucket[]}>({key:'',busy:true,error:'',summary:null,bins:[]});
 useEffect(()=>{
  let mounted=true;
  const load=async()=>{
   const [base,buckets]=await Promise.allSettled([
     analysisApi.e02Summary(filters),
     widget.type==='e02_distribution'?analysisApi.e02Distribution(interval,filters):Promise.resolve([])
   ]);
   if(!mounted)return;
   if(base.status==='rejected'){
    setState({key:signature,busy:false,error:base.reason instanceof Error?base.reason.message:'E02-Kennzahlen konnten nicht geladen werden.',summary:null,bins:[]});return;
   }
   setState({key:signature,busy:false,summary:base.value,bins:buckets.status==='fulfilled'?buckets.value:[],
    error:buckets.status==='rejected'?'Histogramm konnte nicht geladen werden. Die Medianwerte sind weiterhin gültig.':''});
  };
  void load();return()=>{mounted=false};
 },[signature]);
 return state.key===signature?state:{key:signature,busy:true,error:'',summary:null,bins:[]};
}
export function ProcessDefinition({intervalKey,stat}:{intervalKey:E02IntervalKey;stat?:E02IntervalStat|null}){
 const entry=E02_INTERVALS[intervalKey];
 return <div className="e02-definition">
  <h5>Berechnungslogik · {entry.title}</h5>
  <p><strong>Formel:</strong> {entry.formula}</p>
  <p><strong>Start:</strong> {entry.start}</p>
  <p><strong>Ende:</strong> {entry.end}</p>
  <p><strong>Aggregation:</strong> zuerst eine Zeitdifferenz je Case-Key, dann Median und 90. Perzentil in Kalendertagen.</p>
  <p><strong>Gültigkeit:</strong> beide Zeitstempel vorhanden, Differenz ≥ 0 und kein markierter Zeitstempelfehler.</p>
  {stat&&<p><strong>Bewertbar:</strong> {fmt(stat.validCases)} von {fmt(stat.caseCount)} Fällen ({fmt(stat.coveragePct,1)} %). Negative Intervalle: {fmt(stat.negativeCases)}.</p>}
  <p className="muted">OTIF bezeichnet pünktliche und mengenkonforme Aufträge; Nicht-OTIF sind alle bewertbaren übrigen Fälle. Kein Kausalitätsnachweis. Die Mediane der Intervalle können nicht addiert werden.</p>
  {intervalKey==='shipment_to_delivery'||intervalKey==='order_to_delivery'
   ?<p className="e02-warning">Das Event „Goods delivered“ wird ausdrücklich nicht als tatsächlicher Liefertermin verwendet. Maßgeblich ist woodcorp_cases.delivered_date.</p>:null}
 </div>;
}
function Overview({items}:{items:E02IntervalStat[]}){
 const maximum=max(items.flatMap(i=>[i.medianDays||0,i.p90Days||0]));
 return <div className="e02-panel">
  <div className="e02-legend"><span><i className="median"/>Median (P50)</span><span><i className="p90"/>P90</span></div>
  <div className="e02-interval-list">{items.map(row=><div className="e02-interval-row" key={row.key}>
   <div className="e02-interval-title"><strong>{E02_INTERVALS[row.key].title}</strong><small>{fmt(row.validCases)} Fälle · {fmt(row.coveragePct,1)} % gültig</small></div>
   <div className="e02-two-bars">
    <div title={'Median: '+days(row.medianDays)}><i className="median" style={{width:(100*(row.medianDays||0)/maximum)+'%'}}/><span>{days(row.medianDays)}</span></div>
    <div title={'P90: '+days(row.p90Days)}><i className="p90" style={{width:(100*(row.p90Days||0)/maximum)+'%'}}/><span>{days(row.p90Days)}</span></div>
   </div>
  </div>)}</div>
  <TableValues headers={['Prozessintervall','Median','P90','Gültige Fälle','Abdeckung']}
   rows={items.map(i=>[E02_INTERVALS[i.key].title,days(i.medianDays),days(i.p90Days),fmt(i.validCases),fmt(i.coveragePct,1)+' %'])}/>
  <p className="e02-footnote">Nur nichtnegative, vollständige Zeitintervalle; Mediane sind nicht addierbar. Der Zeitraum und alle Segmentfilter werden vom ausgewählten Knoten übernommen.</p>
 </div>;
}
function Comparison({items}:{items:E02IntervalStat[]}){
 const maximum=max(items.flatMap(i=>[i.otifMedianDays||0,i.nonOtifMedianDays||0]));
 return <div className="e02-panel">
  <div className="e02-legend"><span><i className="otif"/>OTIF</span><span><i className="nonotif"/>Nicht-OTIF</span></div>
  {items.map(i=><div className="e02-compare-row" key={i.key}>
   <strong>{E02_INTERVALS[i.key].title}</strong>
   <div className="e02-compare-track"><span>OTIF · {days(i.otifMedianDays)}</span><i className="otif" style={{width:(100*(i.otifMedianDays||0)/maximum)+'%'}}/></div>
   <div className="e02-compare-track"><span>Nicht-OTIF · {days(i.nonOtifMedianDays)}</span><i className="nonotif" style={{width:(100*(i.nonOtifMedianDays||0)/maximum)+'%'}}/></div>
  </div>)}
  <TableValues headers={['Intervall','Median OTIF','Fälle OTIF','Median Nicht-OTIF','Fälle Nicht-OTIF']}
   rows={items.map(i=>[E02_INTERVALS[i.key].title,days(i.otifMedianDays),fmt(i.otifValidCases),days(i.nonOtifMedianDays),fmt(i.nonOtifValidCases)])}/>
  <p className="e02-footnote">Vergleich jeweils innerhalb des vererbten Filterkontexts. Unterschiede sind deskriptiv und belegen keine Ursache.</p>
 </div>;
}
function Quality({items}:{items:E02IntervalStat[]}){
 return <div className="e02-panel">
  <div className="e02-legend"><span><i className="valid"/>Gültig</span><span><i className="negative"/>Negativ</span><span><i className="missing"/>Fehlend</span></div>
  {items.map(i=><div className="e02-quality-row" key={i.key}>
   <div><strong>{E02_INTERVALS[i.key].short}</strong><small>{fmt(i.coveragePct,1)} % gültig</small></div>
   <div className="e02-quality-track" title={fmt(i.validCases)+' gültig, '+fmt(i.negativeCases)+' negativ, '+fmt(i.missingCases)+' fehlend'}>
    <i className="valid" style={{width:(i.caseCount?100*i.validCases/i.caseCount:0)+'%'}}/>
    <i className="negative" style={{width:(i.caseCount?100*i.negativeCases/i.caseCount:0)+'%'}}/>
    <i className="missing" style={{width:(i.caseCount?100*i.missingCases/i.caseCount:0)+'%'}}/>
   </div>
  </div>)}
  <TableValues headers={['Intervall','Gültige Fälle','Negative Differenzen','Fehlende Zeitwerte','Zeitstempel-Anomalien']}
   rows={items.map(i=>[E02_INTERVALS[i.key].title,fmt(i.validCases),fmt(i.negativeCases),fmt(i.missingCases),fmt(i.anomalyCases)])}/>
  <p className="e02-footnote">Negative Abstände werden nicht korrigiert oder stillschweigend gelöscht, sondern ausschließlich aus den Lagekennzahlen ausgeschlossen. Ihre Anzahl bleibt sichtbar.</p>
 </div>;
}
function Distribution({items,interval,bins}:{items:E02IntervalStat[];interval:E02IntervalKey;bins:E02DistributionBucket[]}){
 const chosen=items.find(i=>i.key===interval),maximum=max(bins.map(b=>b.cases));
 return <div className="e02-panel">
  <div className="e02-summary-strip">
   <div><small>Median</small><b>{days(chosen?.medianDays)}</b></div>
   <div><small>P90</small><b>{days(chosen?.p90Days)}</b></div>
   <div><small>Gültige Fälle</small><b>{fmt(chosen?.validCases)}</b></div>
  </div>
  <div className="e02-histogram" role="img" aria-label={'Häufigkeitsverteilung '+E02_INTERVALS[interval].title}>
   {bins.map(b=><div key={b.sort_order} className="e02-bin" title={b.bucket+': '+fmt(b.cases)+' Fälle'}>
    <b>{fmt(b.cases)}</b>
    <div className="e02-bin-track"><i style={{height:(100*b.cases/maximum)+'%'}}/></div><small>{b.bucket}</small>
   </div>)}
  </div>
  <TableValues headers={['Zeitklasse','Aufträge','OTIF','Nicht-OTIF']} rows={bins.map(b=>[b.bucket,fmt(b.cases),fmt(b.otif_cases),fmt(b.non_otif_cases)])}/>
  <ProcessDefinition intervalKey={interval} stat={chosen}/>
 </div>;
}
export function ProcessChart({widget,filters}:{widget:DashboardWidget;filters:Filter[]}){
 const data=useProcessData(widget,filters);
 if(data.busy)return <Spinner text="Prozessintervalle werden ausgewertet …"/>;
 if(!data.summary)return <Notice kind="error">{data.error||'Keine Prozessdaten verfügbar.'}</Notice>;
 const items=data.summary.intervals||[];
 if(!items.length)return <p className="widget-empty">Für den aktiven Filterpfad sind keine Fälle vorhanden.</p>;
 return <div className="e02-visual" aria-label={'E02-Prozessanalyse: '+widget.title}>
  <p className="e02-subtitle">Fallbasierte Analyse · {fmt(data.summary.caseCount)} Aufträge · Datenstand {data.summary.definitionVersion}</p>
  {widget.type==='e02_overview'&&<Overview items={items}/>}
  {widget.type==='e02_compare'&&<Comparison items={items}/>}
  {widget.type==='e02_quality'&&<Quality items={items}/>}
  {widget.type==='e02_distribution'&&<Distribution items={items} interval={widget.intervalKey||'order_to_delivery'} bins={data.bins}/>}
  {data.error&&<Notice kind="error">{data.error}</Notice>}
 </div>;
}
