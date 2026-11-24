import React,{createContext,useContext,useEffect,useMemo,useState} from 'react';
import {CHART_SEGMENT_FIELDS,FIELD_LABELS,FILTER_GROUPS,filterGroup,OTIF_STATUS_LABELS,type FieldKey} from '../config';
import {METRIC_LABELS,metricFormat,type DashboardWidget,type MetricKey} from '../core/dashboard';
import {SEGMENT_METRIC_KEYS,segmentMetric,scenarioSavings} from '../core/rootCauseMetrics';
import {KPI_DEFINITIONS} from '../core/kpiDefinitions';
import {rankSegments} from '../core/chartInteraction';
import type {DashboardData,Filter,TrendRow} from '../core/types';
import {analysisApi,type SegmentStats} from '../lib/supabase';
import {Notice,Spinner} from './Ui';
export const ChartAccess=createContext<{fields:FieldKey[];crossFilter?:(field:FieldKey,value:string)=>void;branchFilter?:(nodeId:string,field:FieldKey,value:string)=>void}>({fields:[]});
export function SegmentMetricOptions(){return <>{SEGMENT_METRIC_KEYS.map(m=><option key={m} value={m}>{METRIC_LABELS[m]}</option>)}</>}
const supported=(m:unknown,fallback:MetricKey='onTimeRate'):MetricKey=>SEGMENT_METRIC_KEYS.some(k=>k===m)?m as MetricKey:fallback;
export function InteractiveBars({widget,filters,compact=false}:{widget:DashboardWidget;filters:Filter[];compact?:boolean}){
 const ctx=useContext(ChartAccess),initial=widget.dimension|| (widget.type==='bar'?'delivery_company':'factory');
 const [field,setField]=useState<FieldKey>(initial),[metric,setMetric]=useState<MetricKey>(supported(widget.metric,widget.type==='bar_horizontal'?'totalPenaltyEur':widget.type==='bar_vertical'?'otifRate':'onTimeRate'));
 const [selected,setSelected]=useState<string[]|null>(null),[search,setSearch]=useState(''),[ascending,setAscending]=useState(false),[limit,setLimit]=useState(compact?'5':'12'),[vertical,setVertical]=useState(widget.type==='bar_vertical'),[active,setActive]=useState<string|null>(null);
 useEffect(()=>{setField(initial);setSelected(null);setSearch('');setActive(null)},[widget.id,initial]);
 useEffect(()=>{setMetric(supported(widget.metric,widget.type==='bar_horizontal'?'totalPenaltyEur':widget.type==='bar_vertical'?'otifRate':'onTimeRate'))},[widget.id,widget.metric,widget.type]);
 const key=JSON.stringify([field,filters.map(f=>[f.field,f.op,f.value])]);
 const [data,setData]=useState<{key:string;rows:SegmentStats[];error:string}>({key:'',rows:[],error:''});
 useEffect(()=>{let live=true;analysisApi.segments(field,filters).then(rows=>{if(live)setData({key,rows,error:''})}).catch(e=>{if(live)setData({key,rows:[],error:e instanceof Error?e.message:'Diagrammdaten nicht verfügbar'})});return()=>{live=false}},[key]);
 const rows=data.key===key?data.rows:[],categories=useMemo(()=>rows.flatMap(r=>r.label===null?[]:[r.label]),[rows]);
 const chosen=selected===null?categories:categories.filter(x=>selected.includes(x));
 const visible=rankSegments(rows,metric,selected,ascending,limit==='all'?null:Number(limit));
 const max=Math.max(1,...visible.map(r=>Math.abs(segmentMetric(r,metric)??0)));
 const signed=visible.some(r=>(segmentMetric(r,metric)??0)<0);
 const display=(s:string)=>OTIF_STATUS_LABELS[s]||s;
 const fieldOptions=[...new Set([field,...ctx.fields.filter(f=>CHART_SEGMENT_FIELDS.includes(f))])];
 const renderBar=(r:SegmentStats)=>{const label=String(r.label),v=segmentMetric(r,metric),pct=(v===null?0:Math.abs(v)/max*100)+'%';
 return <button type="button" className={(vertical&&!signed?'nxt-vertical-item':'nxt-ranked-row')+' nxt-segment-button '+(active===label?'selected':'')} key={label} aria-pressed={active===label} title={display(label)+' · '+metricFormat(metric,v)+' · '+r.orders+' Aufträge'} onClick={()=>setActive(a=>a===label?null:label)}>{vertical&&!signed?<><b>{metricFormat(metric,v)}</b><div className="nxt-vertical-column"><i style={{height:pct}}/></div><small>{display(label)}</small></>:<><span>{display(label)}</span><div className="nxt-ranked-track"><i style={{width:pct,background:v!=null&&v<0?'#B85C61':undefined}}/></div><b>{metricFormat(metric,v)}</b></>}</button>};
 return <div className="nxt-interactive-chart nodrag nowheel" onClick={e=>e.stopPropagation()}>
 <div className="nxt-chart-current"><strong>{METRIC_LABELS[metric]}</strong><small>{FIELD_LABELS[field]} · {visible.length} von {chosen.length} Segmenten</small></div>
 <details className="nxt-chart-settings"><summary>Diagramm konfigurieren</summary><div className="nxt-chart-control-grid">
 <label className="field">Kennzahl<select value={metric} onChange={e=>setMetric(e.target.value as MetricKey)}><SegmentMetricOptions/></select></label>
 <label className="field">Dimension<select value={field} onChange={e=>{setField(e.target.value as FieldKey);setSelected(null);setSearch('');setActive(null)}}>{FILTER_GROUPS.map(g=>{const fs=fieldOptions.filter(f=>filterGroup(f)===g);return fs.length?<optgroup key={g} label={g}>{fs.map(f=><option key={f} value={f}>{FIELD_LABELS[f]}</option>)}</optgroup>:null})}</select></label>
 <label className="field">Sortierung<select value={ascending?'asc':'desc'} onChange={e=>setAscending(e.target.value==='asc')}><option value="desc">Größte zuerst</option><option value="asc">Kleinste zuerst</option></select></label>
 <label className="field">Anzeige<select value={limit} onChange={e=>setLimit(e.target.value)}>{['5','10','12','20','50','all'].map(n=><option key={n} value={n}>{n==='all'?'Alle':'Top '+n}</option>)}</select></label>
 <label className="field">Ausrichtung<select value={vertical?'v':'h'} onChange={e=>setVertical(e.target.value==='v')}><option value="h">Horizontal</option><option value="v">Vertikal</option></select></label>
 </div><details><summary>Segmente auswählen ({chosen.length}/{categories.length})</summary><div className="nxt-chart-controls"><input type="search" aria-label="Segmente suchen" placeholder="Suchen …" value={search} onChange={e=>setSearch(e.target.value)}/><button type="button" onClick={()=>setSelected(null)}>Alle</button><button type="button" onClick={()=>setSelected([])}>Keine</button></div><div className="nxt-chart-scroll">{categories.filter(x=>display(x).toLowerCase().includes(search.toLowerCase())).map(x=><label key={x}><input type="checkbox" checked={chosen.includes(x)} onChange={e=>setSelected(e.target.checked?[...chosen,x]:chosen.filter(a=>a!==x))}/>{display(x)}</label>)}</div></details><small>Anzeigeauswahl verändert keine anderen Kennzahlen. Änderungen hier sind temporär.</small><details><summary>Definition der ausgewählten Kennzahl</summary><p>{KPI_DEFINITIONS[metric].formula}</p><small>{KPI_DEFINITIONS[metric].exclusions}</small></details><button type="button" className="nxt-chart-reset" onClick={()=>{setSelected(null);setActive(null);setSearch('');setAscending(false);setLimit(compact?'5':'12')}}>Anzeige zurücksetzen</button></details>
 {data.key!==key?<Spinner text="Segmente werden geladen …"/>:data.error?<Notice kind="error">{data.error}</Notice>:!visible.length?<p className="widget-empty">Keine ausgewählten Segmente mit Daten.</p>:vertical&&!signed?<div className="nxt-vertical-scroll"><div className="nxt-vertical-bars" style={{minWidth:Math.max(200,visible.length*80)}}>{visible.map(renderBar)}</div></div>:<div className="nxt-ranked-bars nxt-chart-scroll">{visible.map(renderBar)}</div>}
 {signed&&<small>Rote Balken: negative Werte. Länge entspricht dem Betrag.</small>}
 {active!==null&&categories.includes(active)&&<div className="nxt-chart-selection"><strong>{display(active)}</strong><div className="nxt-chart-controls"><button type="button" onClick={()=>setSelected([active])}>Nur anzeigen</button>{ctx.crossFilter&&ctx.fields.includes(field)&&<button type="button" onClick={()=>ctx.crossFilter?.(field,active)}>Dashboard filtern</button>}{ctx.branchFilter&&compact&&widget.id.startsWith('graph-chart:')&&ctx.fields.includes(field)&&<button type="button" onClick={()=>ctx.branchFilter?.(widget.id.slice('graph-chart:'.length),field,active)}>Zweig filtern</button>}<button type="button" onClick={()=>setActive(null)}>Schließen</button></div></div>}
 <details><summary>Werte als Tabelle</summary><div className="table-overflow nxt-chart-scroll"><table><thead><tr><th>Segment</th><th>Aufträge</th><th>{METRIC_LABELS[metric]}</th></tr></thead><tbody>{visible.map(r=><tr key={String(r.label)}><td>{display(String(r.label))}</td><td>{r.orders.toLocaleString('de-DE')}</td><td>{metricFormat(metric,segmentMetric(r,metric))}</td></tr>)}</tbody></table></div></details>
 </div>;
}
export function InteractiveTrend({values,initialMetric}:{values:TrendRow[];initialMetric?:MetricKey}){
 const [metric,setMetric]=useState<MetricKey>(supported(initialMetric));
 useEffect(()=>setMetric(supported(initialMetric)),[initialMetric]);
 const rows=values.map(r=>({month:r.month,orders:r.orders,value:metric==='onTimeRate'?r.on_time_rate:r.values?.[metric]??null}));
 const valid=rows.flatMap(r=>r.value===null?[]:[r.value]),min=Math.min(0,...valid),max=Math.max(min+1,...valid);
 const x=(i:number)=>100+i*390/Math.max(1,rows.length-1),y=(v:number)=>145-(v-min)/(max-min)*115;
 return <div className="nxt-interactive-chart nodrag nowheel" onClick={e=>e.stopPropagation()}><label className="field">Kennzahl nach Liefermonat<select value={metric} onChange={e=>setMetric(e.target.value as MetricKey)}><SegmentMetricOptions/></select></label><details><summary>Berechnungslogik</summary><p>{KPI_DEFINITIONS[metric].formula}</p><small>{KPI_DEFINITIONS[metric].exclusions}</small></details>
 {!valid.length?<p className="widget-empty">Keine gültigen Monatswerte.</p>:<><svg viewBox="0 0 510 180" className="nxt-chart-svg" role="img" aria-label={METRIC_LABELS[metric]+' nach Liefermonat'}>{[0,.25,.5,.75,1].map(t=><g key={t}><line x1="100" x2="490" y1={y(min+t*(max-min))} y2={y(min+t*(max-min))} stroke="#D6E7E7"/><text x="3" y={y(min+t*(max-min))+4} fontSize="10" fill="#637E81">{metricFormat(metric,min+t*(max-min))}</text></g>)}{rows.map((r,i)=>{const p=rows[i-1];return r.value!==null&&p?.value!=null?<line key={r.month} x1={x(i-1)} x2={x(i)} y1={y(p.value)} y2={y(r.value)} stroke="#008B92" strokeWidth="2.6"/>:null})}{rows.map((r,i)=>r.value!==null?<circle key={r.month} cx={x(i)} cy={y(r.value)} r="3" fill="#008B92"><title>{r.month} · {metricFormat(metric,r.value)} · {r.orders} Aufträge</title></circle>:null)}<text x="100" y="164" fontSize="10" fill="#637E81">{rows[0]?.month}</text><text x="490" y="164" textAnchor="end" fontSize="10" fill="#637E81">{rows.at(-1)?.month}</text></svg><details><summary>Monatswerte anzeigen</summary><div className="table-overflow nxt-chart-scroll"><table><thead><tr><th>Monat</th><th>Aufträge</th><th>{METRIC_LABELS[metric]}</th></tr></thead><tbody>{rows.map(r=><tr key={r.month}><td>{r.month}</td><td>{r.orders}</td><td>{metricFormat(metric,r.value)}</td></tr>)}</tbody></table></div></details></>}
 </div>;
}
export function CostScenario({detail}:{detail:DashboardData}){
 const [late,setLate]=useState(0),[shortfall,setShortfall]=useState(0);
 const l=detail.metrics?.latePenaltyEur,s=detail.metrics?.shortfallPenaltyEur;if(l==null||s==null)return null;
 const result=scenarioSavings(l,s,late,shortfall);
 return <details className="nxt-chart-settings nodrag nowheel" onClick={e=>e.stopPropagation()}><summary>Was-wäre-wenn · Kostenszenario</summary><p className="muted">Reine Szenariorechnung im aktuellen Filterkontext, keine Prognose und keine realisierte Einsparung.</p><label className="field">Verspätungsstrafen reduzieren: {late}%<input type="range" min="0" max="100" value={late} onChange={e=>setLate(Number(e.target.value))}/></label><label className="field">Fehlmengenstrafen reduzieren: {shortfall}%<input type="range" min="0" max="100" value={shortfall} onChange={e=>setShortfall(Number(e.target.value))}/></label><strong>Potenzial: {metricFormat('totalPenaltyEur',result.saved)}</strong><p>Restkosten: {metricFormat('totalPenaltyEur',result.remaining)}</p><button className="nxt-chart-reset" type="button" onClick={()=>{setLate(0);setShortfall(0)}}>Zurücksetzen</button></details>;
}
