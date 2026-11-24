import React,{useEffect,useMemo,useState} from 'react';
import {InteractiveBars,CostScenario} from './InteractiveCharts';
import {analysisApi,type SegmentStats,type HeatmapCell,type DistributionBucket} from '../lib/supabase';
import type {Filter,DashboardData} from '../core/types';
import {metricFormat,type DashboardWidget,type MetricKey,type WidgetType} from '../core/dashboard';
import {Notice,Spinner} from './Ui';

export const ADVANCED_TYPES:WidgetType[]=[
 'bar_horizontal','bar_vertical','stacked','stacked100','heatmap','pareto','scatter',
 'waterfall','bullet','histogram','treemap','funnel'
];
const GROUPED:WidgetType[]=['bar_horizontal','bar_vertical','stacked','stacked100','pareto','scatter','treemap'];
const classes=[
 {key:'otif_cases',title:'OTIF',color:'#008B92'},
 {key:'on_time_not_full_cases',title:'Pünktlich / Menge fehlt',color:'#7BB9BB'},
 {key:'late_in_full_cases',title:'Spät / vollständig',color:'#EAA35D'},
 {key:'late_not_full_cases',title:'Spät / unvollständig',color:'#B85C61'},
 {key:'unknown_cases',title:'Unbekannt',color:'#AAB8BE'}
] as const;
const cap=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const val=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)?n:Number(n)||0;
const fmt=(n:number,digits=0)=>n.toLocaleString('de-DE',{maximumFractionDigits:digits});
const euro=(n:number)=>fmt(n,2)+' €';
type DataState={key:string;loading:boolean;error:string;segments:SegmentStats[];heatmap:HeatmapCell[];bins:DistributionBucket[]};
const initial:DataState={key:'',loading:false,error:'',segments:[],heatmap:[],bins:[]};

function valueFor(r:SegmentStats,m:MetricKey):number{
 switch(m){
  case 'orders':return val(r.orders);
  case 'otifCases':return val(r.otif_cases);
  case 'lateOrders':return val(r.late_orders);
  case 'onTimeRate':return val(r.on_time_rate);
  case 'volumeConformanceRate':return val(r.volume_rate);
  case 'latePenaltyEur':return val(r.late_penalty_eur);
  case 'shortfallPenaltyEur':return val(r.shortfall_penalty_eur);
  case 'totalPenaltyEur':return val(r.total_penalty_eur);
  case 'otifRate':return val(r.otif_rate);
  default:return val(r.otif_rate);
 }
}
function chosenMetric(w:DashboardWidget):MetricKey{
 return w.metric||(['pareto','treemap','bar_horizontal'].includes(w.type)?'totalPenaltyEur':'otifRate');
}
function isPct(m:MetricKey){return ['otifRate','onTimeRate','volumeConformanceRate'].includes(m)}
function TableFallback({rows,headers}:{rows:Array<Array<string|number>>;headers:string[]}){
 return <details className="nxt-chart-data-table"><summary>Werte als Datentabelle anzeigen</summary>
  <div className="table-overflow"><table><thead><tr>{headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead>
   <tbody>{rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j}>{v}</td>)}</tr>)}</tbody></table></div>
 </details>;
}
function useAdvancedData(widget:DashboardWidget,filters:Filter[]):DataState{
 const group=GROUPED.includes(widget.type),heat=widget.type==='heatmap',hist=widget.type==='histogram';
 const field=widget.dimension||'factory',other=widget.compareDimension||'product_type';
 const key=JSON.stringify([widget.type,field,other,widget.distributionMeasure||'quantity_change_count',
  filters.map(f=>[f.field,f.op,f.value])]);
 const [state,setState]=useState<DataState>(initial);
 useEffect(()=>{
  if(!group&&!heat&&!hist)return;
  let active=true;
  Promise.resolve().then(()=>{if(active)setState({...initial,key,loading:true})});
  const load=async()=>{
   try{
    const segments=group?await analysisApi.segments(field,filters):[];
    const heatmap=heat?await analysisApi.heatmap(field,other,filters):[];
    const bins=hist?await analysisApi.distribution(widget.distributionMeasure||'quantity_change_count',filters):[];
    if(active)setState({key,loading:false,error:'',segments,heatmap,bins});
   }catch(e){if(active)setState({...initial,key,error:e instanceof Error?e.message:'Diagrammdaten konnten nicht geladen werden'})}
  };
  void load();
  return()=>{active=false};
 },[key]);
 return state.key===key?state:{...initial,loading:group||heat||hist};
}
function RankedBars({rows,widget,vertical=false}:{rows:SegmentStats[];widget:DashboardWidget;vertical?:boolean}){
 const metric=chosenMetric(widget),sorted=[...rows].filter(r=>r.label).sort((a,b)=>valueFor(b,metric)-valueFor(a,metric)).slice(0,12);
 const max=Math.max(1,...sorted.map(r=>valueFor(r,metric)));
 if(!sorted.length)return <p className="widget-empty">Für diese Filter gibt es keine Segmentwerte.</p>;
 return <div className="advanced-chart">
  {vertical?<div className="nxt-vertical-bars" role="img" aria-label={'Vergleich nach '+metric}>
    {sorted.slice(0,10).map((r,i)=><div className="nxt-vertical-item" key={i} title={String(r.label)+' · '+metricFormat(metric,valueFor(r,metric))}>
     <b>{metricFormat(metric,valueFor(r,metric))}</b><div className="nxt-vertical-column"><i style={{height:cap(valueFor(r,metric)/max*100,0,100)+'%'}}/></div>
     <small>{r.label}</small>
    </div>)}
   </div>:<div className="nxt-ranked-bars" role="list" aria-label={'Rangliste nach '+metric}>
    {sorted.map((r,i)=><div className="nxt-ranked-row" role="listitem" key={i}>
      <span title={String(r.label)}>{r.label}</span><div className="nxt-ranked-track"><i style={{width:cap(valueFor(r,metric)/max*100,0,100)+'%'}}/></div>
      <b>{metricFormat(metric,valueFor(r,metric))}</b>
     </div>)}
   </div>}
   <TableFallback headers={['Segment','Aufträge','Wert']} rows={sorted.map(r=>[String(r.label),fmt(r.orders),metricFormat(metric,valueFor(r,metric))])}/>
 </div>;
}
function StackedBars({rows,normalized}:{rows:SegmentStats[];normalized:boolean}){
 const display=rows.filter(r=>r.label).slice(0,12);
 if(!display.length)return <p className="widget-empty">Keine passenden OTIF-Gruppen.</p>;
 const max=Math.max(1,...display.map(r=>r.orders));
 return <div className="advanced-chart">
  <div className="nxt-class-legend">{classes.map(c=><span key={c.key}><i style={{background:c.color}}/>{c.title}</span>)}</div>
  <div className="nxt-stacked-rows">{display.map((r,i)=><div className="nxt-stacked-row" key={i}>
   <span title={String(r.label)}>{r.label}</span><div className="nxt-stacked-track" style={{width:normalized?'100%':cap(r.orders/max*100,5,100)+'%'}}>
    {classes.map(c=><div key={c.key} title={c.title+': '+fmt(val(r[c.key]))+' Aufträge'} style={{width:cap(val(r[c.key])/Math.max(1,r.orders)*100,0,100)+'%',background:c.color}}/>)}
   </div><b>{fmt(r.orders)}</b>
  </div>)}</div>
  <TableFallback headers={['Segment',...classes.map(c=>c.title)]} rows={display.map(r=>[String(r.label),...classes.map(c=>fmt(val(r[c.key])))])}/>
 </div>;
}
function Heatmap({cells}:{cells:HeatmapCell[]}){
 if(!cells.length)return <p className="widget-empty">Keine Kreuzkombinationen in diesem Filterkontext.</p>;
 const xs=[...new Set(cells.map(r=>r.x||'Ohne Angabe'))].slice(0,12);
 const ys=[...new Set(cells.map(r=>r.y||'Ohne Angabe'))].slice(0,12);
 const dict=new Map(cells.map(r=>[(r.x||'Ohne Angabe')+'|'+(r.y||'Ohne Angabe'),r]));
 return <div className="advanced-chart">
  <div className="nxt-heatmap-wrap"><table className="nxt-heatmap"><thead><tr><th>Segment</th>{ys.map(y=><th key={y}>{y}</th>)}</tr></thead>
   <tbody>{xs.map(x=><tr key={x}><th>{x}</th>{ys.map(y=>{
    const cell=dict.get(x+'|'+y);const v=cell?.otif_rate==null?null:val(cell.otif_rate);
    const alpha=v===null?0:0.12+cap(v/100,0,1)*.78;
    return <td key={y} title={cell?x+' × '+y+' · '+fmt(cell.orders)+' Aufträge · '+fmt(v??0,1)+'% OTIF':'Keine Fälle'}
      style={{background:v===null?'#F4F6F7':'rgba(0,139,146,'+alpha+')',color:alpha>.58?'white':'#123E42'}}>
      {v===null?'–':fmt(v,1)+' %'}<small>{cell?fmt(cell.orders):''}</small></td>;
   })}</tr>)}</tbody></table></div>
  <TableFallback headers={['Segment X','Segment Y','Fälle','OTIF','Strafkosten (Modell)']}
   rows={cells.map(r=>[r.x||'–',r.y||'–',fmt(r.orders),fmt(r.otif_rate??0,1)+' %',euro(val(r.total_penalty_eur))])}/>
 </div>;
}
function Pareto({rows}:{rows:SegmentStats[]}){
 const data=[...rows].filter(r=>r.label&&val(r.total_penalty_eur)>0).sort((a,b)=>val(b.total_penalty_eur)-val(a.total_penalty_eur)).slice(0,12);
 const total=rows.reduce((s,r)=>s+val(r.total_penalty_eur),0),max=Math.max(1,...data.map(r=>val(r.total_penalty_eur)));
 if(!data.length)return <p className="widget-empty">Keine Kostenanteile für diese Auswahl.</p>;
 let sum=0;
 const cum=data.map(r=>{sum+=val(r.total_penalty_eur);return sum/Math.max(1,total)*100});
 const coords=cum.map((c,i)=>(26+i*520/data.length+260/data.length)+','+(196-1.66*c)).join(' ');
 return <div className="advanced-chart">
  <svg viewBox="0 0 570 235" role="img" aria-label="Pareto: modellierte Strafkosten pro Segment und kumulierter Anteil" className="nxt-chart-svg">
   {[0,25,50,75,100].map(p=><g key={p}><line x1="20" x2="548" y1={196-p*1.66} y2={196-p*1.66} stroke="#D6E7E7"/><text x="0" y={200-p*1.66} fontSize="10" fill="#637E81">{p}</text></g>)}
   {data.map((r,i)=>{const x=26+i*520/data.length,w=520/data.length-7,h=val(r.total_penalty_eur)/max*155;return <g key={i}><rect x={x} y={196-h} width={Math.max(4,w)} height={h} rx="3" fill="#68B9BD"/><title>{r.label}: {euro(val(r.total_penalty_eur))}</title></g>})}
   <polyline points={coords} fill="none" stroke="#B25558" strokeWidth="2.6" strokeLinejoin="round"/>
   {data.map((r,i)=><text key={i} x={26+i*520/data.length+240/data.length} y="222" textAnchor="middle" fontSize="9" fill="#315257">{String(r.label).slice(0,7)}</text>)}
  </svg>
  <p className="nxt-chart-note">Balken: modellierte Strafgebühren (0,75 €/kg). Linie: kumulierter Anteil an allen Segmenten (Top 12 dargestellt). Die Gesamtsumme kann Aufträge mit mehreren Kostenkomponenten enthalten.</p>
  <TableFallback headers={['Segment','Berechnete Strafgebühren','Kumuliert']} rows={data.map((r,i)=>[String(r.label),euro(val(r.total_penalty_eur)),fmt(cum[i],1)+' %'])}/>
 </div>;
}
function Scatter({rows}:{rows:SegmentStats[]}){
 const data=rows.filter(r=>r.label&&r.otif_rate!=null).slice(0,25);
 const maxX=Math.max(1,...data.map(r=>r.orders)),maxPenalty=Math.max(1,...data.map(r=>val(r.total_penalty_eur)));
 if(!data.length)return <p className="widget-empty">Keine gültigen Segmente vorhanden.</p>;
 return <div className="advanced-chart">
  <svg viewBox="0 0 580 266" role="img" aria-label="Streudiagramm: Auftragshäufigkeit gegen OTIF, Kreisgröße entspricht modellierten Strafkosten" className="nxt-chart-svg">
   {[0,20,40,60,80,100].map(y=><g key={y}><line x1="48" x2="556" y1={227-y*1.85} y2={227-y*1.85} stroke="#DDEAEA"/><text x="8" y={231-y*1.85} fill="#638184" fontSize="10">{y} %</text></g>)}
   {data.map((r,i)=><circle key={i} cx={48+val(r.orders)/maxX*502} cy={227-val(r.otif_rate)*1.85}
     r={5+Math.sqrt(val(r.total_penalty_eur)/maxPenalty)*15} fill="#008B92" fillOpacity=".56" stroke="#006C70">
     <title>{r.label} · {fmt(r.orders)} Fälle · {fmt(val(r.otif_rate),1)} % OTIF · {euro(val(r.total_penalty_eur))}</title></circle>)}
   <text x="290" y="255" fontSize="11" textAnchor="middle" fill="#496E74">Auftragsanzahl je Segment →</text>
  </svg>
  <p className="nxt-chart-note">Punktgröße = modellierte Vertragsstrafe. Die Darstellung zeigt einen Zusammenhang, keine Kausalität.</p>
  <TableFallback headers={['Segment','Fälle','OTIF','Berechnete Strafgebühr']}
   rows={data.map(r=>[String(r.label),fmt(r.orders),fmt(val(r.otif_rate),1)+' %',euro(val(r.total_penalty_eur))])}/>
 </div>;
}
function Treemap({rows}:{rows:SegmentStats[]}){
 const ordered=[...rows].filter(r=>r.label&&r.total_penalty_eur>0).sort((a,b)=>b.total_penalty_eur-a.total_penalty_eur).slice(0,11);
 const total=ordered.reduce((s,r)=>s+val(r.total_penalty_eur),0);
 if(!total)return <p className="widget-empty">Keine Kostendaten für diese Auswahl.</p>;
 let x=0;
 return <div className="advanced-chart">
  <svg viewBox="0 0 580 198" className="nxt-chart-svg" role="img" aria-label="Treemap-Streifen: relative Kostenanteile nach Segment">
   {ordered.map((r,i)=>{const w=580*r.total_penalty_eur/total;const start=x;x+=w;return <g key={i}><rect x={start} width={w} y="0" height="182" fill={i%2===0?'#008B92':'#327F85'} stroke="#fff" strokeWidth="2">
     <title>{r.label}: {euro(val(r.total_penalty_eur))} · {fmt(100*r.total_penalty_eur/total,1)} %</title></rect>
     {w>52&&<text x={start+w/2} y="84" textAnchor="middle" fontSize="12" fontWeight="600" fill="white">{String(r.label).slice(0,Math.max(3,Math.floor(w/11)))}</text>}</g>})}
  </svg>
  <p className="nxt-chart-note">Die Flächenbreite entspricht dem Anteil an den modellierten Strafgebühren der dargestellten Segmente.</p>
  <TableFallback headers={['Segment','Strafgebühren','Anteil']} rows={ordered.map(r=>[String(r.label),euro(val(r.total_penalty_eur)),fmt(100*r.total_penalty_eur/total,1)+' %'])}/>
 </div>;
}
function Waterfall({detail}:{detail:DashboardData}){
 const m=detail.metrics;
 if(!m)return <p className="widget-empty">Keine Kostendaten geladen.</p>;
 const a=val(m.latePenaltyEur),b=val(m.shortfallPenaltyEur),total=a+b,scale=Math.max(1,total);
 const h1=150*a/scale,h2=150*b/scale;
 return <div className="advanced-chart">
  <svg viewBox="0 0 580 240" role="img" className="nxt-chart-svg" aria-label="Kosten-Wasserfall: Verspätung, Unterlieferung, Gesamtkosten">
   <line x1="50" x2="530" y1="190" y2="190" stroke="#D7E7E7"/>
   <rect x="70" y={190-h1} width="92" height={h1} fill="#008B92" rx="4"/>
   <line x1="162" x2="245" y1={190-h1} y2={190-h1} stroke="#9CBABD" strokeDasharray="4 4"/>
   <rect x="245" y={190-h1-h2} width="92" height={h2} fill="#E2A05F" rx="4"/>
   <line x1="337" x2="415" y1={190-h1-h2} y2={190-h1-h2} stroke="#9CBABD" strokeDasharray="4 4"/>
   <rect x="415" y="40" width="92" height="150" fill="#004F55" rx="4"/>
   {['Verspätung','Unterlieferung','Gesamt'].map((t,i)=><text key={i} x={[116,291,461][i]} y="209" textAnchor="middle" fontSize="12" fill="#355A5F">{t}</text>)}
  </svg>
  <div className="nxt-waterfall-facts"><span>Verspätung: <b>{euro(a)}</b></span><span>Unterlieferung: <b>{euro(b)}</b></span><span>Gesamt: <b>{euro(total)}</b></span></div>
  <p className="nxt-chart-note">Berechnetes 0,75-€/kg-Vertragsstrafenmodell; keine nachgewiesene Zahlung.</p>
 </div>;
}
function Bullet({widget,detail}:{widget:DashboardWidget;detail:DashboardData}){
 const target=widget.target??80;
 const metric=widget.metric||'otifRate';
 const value=detail.metrics?(detail.metrics as unknown as Record<string,unknown>)[metric]:null;
 const actual=typeof value==='number'?value:null;
 return <div className="advanced-chart nxt-bullet">
  <p><b>{actual===null?'–':fmt(actual,1)+' %'}</b> gegenüber Ziel <strong>{fmt(target,1)} %</strong></p>
  <div className="nxt-bullet-track"><div className="nxt-bullet-fill" style={{width:cap((actual||0),0,100)+'%'}}/>
   <span className="nxt-bullet-target" style={{left:cap(target,0,100)+'%'}}><i/></span></div>
  <small>{actual===null?'Kein Wert':actual>=target?'Ziel erreicht':'Abweichung: '+fmt(target-actual,1)+' Prozentpunkte'}</small>
 </div>;
}
function Histogram({bins}:{bins:DistributionBucket[]}){
 const ordered=[...bins].sort((a,b)=>{
  const ranks=['0','1','2','3+','Pünktlich','1–7 Tage','8–30 Tage','>30 Tage','Unbekannt'];
  return ranks.indexOf(a.bucket)-ranks.indexOf(b.bucket);
 });
 const max=Math.max(1,...ordered.map(r=>r.orders));
 if(!ordered.length)return <p className="widget-empty">Keine Verteilungsdaten verfügbar.</p>;
 return <div className="advanced-chart"><div className="nxt-histogram">
  {ordered.map(r=><div className="nxt-histo-cell" key={r.bucket} title={r.bucket+': '+fmt(r.orders)+' Aufträge'}>
   <strong>{fmt(r.orders)}</strong><div className="nxt-histo-bar"><i style={{height:cap(r.orders/max*100,0,100)+'%'}}/></div><span>{r.bucket}</span>
  </div>)}
 </div><TableFallback headers={['Klasse','Aufträge','OTIF']} rows={ordered.map(r=>[r.bucket,fmt(r.orders),fmt(val(r.otif_rate),1)+' %'])}/></div>;
}
function Funnel({detail}:{detail:DashboardData}){
 const m=detail.metrics;
 const data:Array<[string,number]>=[['Alle Aufträge',val(m?.orders)],['Pünktlich',val(m?.onTimeCases)],['OTIF',val(m?.otifCases)]];
 const base=Math.max(1,data[0][1]);
 return <div className="advanced-chart nxt-funnel">
  {data.map(([label,value],i)=><div className="nxt-funnel-row" key={label}>
   <strong>{label}</strong><div style={{width:cap(value/base*100,1,100)+'%',background:['#A5D5D6','#379EA3','#006469'][i]}}>
     {fmt(value)} <small>({fmt(value/base*100,1)} %)</small>
   </div></div>)}
  <p className="nxt-chart-note">Deskriptive Teilmengen pünktlicher und OTIF-Aufträge; keine Prozesskonversionsmessung.</p>
 </div>;
}
export function AdvancedChart({widget,detail,filters,compact=false}:{widget:DashboardWidget;detail:DashboardData;filters:Filter[];compact?:boolean}){
 if(['bar','bar_horizontal','bar_vertical'].includes(widget.type))return <InteractiveBars key={widget.id} widget={widget} filters={filters} compact={compact}/>;
 return <StaticChart widget={widget} detail={detail} filters={filters}/>;
}
function StaticChart({widget,detail,filters}:{widget:DashboardWidget;detail:DashboardData;filters:Filter[]}){
 const state=useAdvancedData(widget,filters);
 if(detail.error)return <Notice kind="error">{detail.error}</Notice>;
 if(state.loading)return <Spinner text="Diagrammdaten werden geladen …"/>;
 if(state.error)return <Notice kind="error">{state.error}</Notice>;
 switch(widget.type){
  case 'bar_horizontal':return <RankedBars rows={state.segments} widget={widget}/>;
  case 'bar_vertical':return <RankedBars rows={state.segments} widget={widget} vertical/>;
  case 'stacked':return <StackedBars rows={state.segments} normalized={false}/>;
  case 'stacked100':return <StackedBars rows={state.segments} normalized/>;
  case 'heatmap':return <Heatmap cells={state.heatmap}/>;
  case 'pareto':return <Pareto rows={state.segments}/>;
  case 'scatter':return <Scatter rows={state.segments}/>;
  case 'waterfall':return <><Waterfall detail={detail}/><CostScenario detail={detail}/></>;
  case 'bullet':return <Bullet widget={widget} detail={detail}/>;
  case 'histogram':return <Histogram bins={state.bins}/>;
  case 'treemap':return <Treemap rows={state.segments}/>;
  case 'funnel':return <Funnel detail={detail}/>;
  default:return null;
 }
}
