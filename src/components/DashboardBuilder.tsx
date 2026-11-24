import React,{useEffect,useMemo,useState} from 'react';
import {ChartAccess,InteractiveTrend,SegmentMetricOptions} from './InteractiveCharts';
import {appendChartFilter} from '../core/chartInteraction';
import {filterSignature,formatFilter} from '../core/filters';
import {DndContext,KeyboardSensor,PointerSensor,useDraggable,useDroppable,useSensor,useSensors,type DragEndEvent} from '@dnd-kit/core';
import {FIELD_LABELS,FIELDS,CHART_SEGMENT_FIELDS,HEATMAP_FIELDS,type FieldKey} from '../config';
import {analysisApi} from '../lib/supabase';
import type {Filter,DashboardData,BreakdownRow,TrendRow} from '../core/types';
import {WIDGET_LABELS,WIDGET_ICONS,WIDGET_TYPES,METRICS,METRIC_LABELS,addWidget,dashboardFor,metricFormat,metricValue,moveWidget,removeWidget,updateWidget,type DashboardWidget,type NodeDashboard,type WidgetType,type MetricKey} from '../core/dashboard';
import Icon from './Icon';
import {AdvancedChart,ADVANCED_TYPES} from './AdvancedCharts';
import {ProcessChart,PROCESS_TYPES} from './ProcessCharts';
import {E02_KEYS,E02_INTERVALS,type E02IntervalKey} from '../core/processIntervals';
import {Button,Notice,Spinner,number,percent} from './Ui';

type DataProps={widget:DashboardWidget;detail:DashboardData;filters:Filter[]};
const fallbackRows:BreakdownRow[]=[];
function useBreakdown(widget:DashboardWidget,detail:DashboardData,filters:Filter[]){
 const [extra,setExtra]=useState<{key:string;rows:BreakdownRow[];loading:boolean;error:string}>({key:'',rows:[],loading:false,error:''});
 const field=widget.dimension||'delivery_company';
 const key=JSON.stringify(filters.map(f=>[f.field,f.op,f.value]).sort())+':'+field;
 useEffect(()=>{
  if(widget.type!=='table')return;
  if(field==='delivery_company')return;
  let active=true; Promise.resolve().then(()=>{if(active)setExtra({key,rows:[],loading:true,error:''})});
  analysisApi.breakdown(field,filters).then(rows=>{if(active)setExtra({key,rows,loading:false,error:''})}).catch(e=>{if(active)setExtra({key,rows:[],loading:false,error:e instanceof Error?e.message:'Abfrage fehlgeschlagen'})});
  return()=>{active=false};
 },[key,field,widget.type]);
 if(field==='delivery_company')return {rows:detail.breakdown||fallbackRows,loading:detail.pending,error:detail.error||''};
 return {rows:extra.key===key?extra.rows:[],loading:extra.loading,error:extra.error};
}
function LineWidget({values}:{values:TrendRow[]}){
 const rows=values.filter(x=>x.on_time_rate!=null);
 if(!rows.length)return <p className="widget-empty">Keine Zeitreihe für diese Filter</p>;
 const pts=rows.map((r,i)=>{const x=32+i*448/Math.max(rows.length-1,1);return `${x},${12+(100-Number(r.on_time_rate))*1.30}`}).join(' ');
 return <div className="nxt-widget-chart"><svg viewBox="0 0 510 179" role="img" aria-label="Monatliche pünktliche Lieferquote">
  {[0,25,50,75,100].map(y=><g key={y}><line x1="32" x2="480" y1={12+(100-y)*1.30} y2={12+(100-y)*1.30} stroke="#E1EDEE"/><text x="0" y={17+(100-y)*1.30} fontSize="10" fill="#6C8488">{y}%</text></g>)}
  <polyline points={pts} stroke="#008B92" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/><text x="32" y="165" fill="#6C8488" fontSize="10">{rows[0].month}</text><text x="480" y="165" textAnchor="end" fill="#6C8488" fontSize="10">{rows[rows.length-1].month}</text>
 </svg><details><summary>Werte als Tabelle</summary><table><thead><tr><th>Monat</th><th>Aufträge</th><th>On-Time</th></tr></thead><tbody>{rows.map(r=><tr key={r.month}><td>{r.month}</td><td>{number(r.orders)}</td><td>{percent(r.on_time_rate)}</td></tr>)}</tbody></table></details></div>;
}
function TableWidget({rows}:{rows:BreakdownRow[]}){
 if(!rows.length)return <p className="widget-empty">Keine Vergleichsgruppen verfügbar</p>;
 return <div className="widget-table-wrap"><table><thead><tr><th>Segment</th><th>Aufträge</th><th>On-Time</th><th>Volumen</th></tr></thead><tbody>{rows.slice(0,12).map((r,i)=><tr key={String(r.label)+i}><td>{r.label??'Ohne Angabe'}</td><td>{number(r.orders)}</td><td>{percent(r.on_time_rate)}</td><td>{percent(r.volume_rate)}</td></tr>)}</tbody></table></div>;
}
export function DashboardWidgetView({widget,detail,filters}:DataProps){
 const {rows,loading,error}=useBreakdown(widget,detail,filters);
 const value=widget.metric?metricValue(widget.metric,detail.metrics,detail.ribbon):null;
 if(PROCESS_TYPES.some(t=>t===widget.type))return <ProcessChart widget={widget} filters={filters}/>;
 if(widget.type==='text')return <div className="nxt-widget-notes"><Icon name="info" size={22}/><p>{widget.text||'Hier eine Forschungsfrage oder Interpretation formulieren.'}</p></div>;
 if(detail.error)return <Notice kind="error">{detail.error}</Notice>;
 if(detail.pending&&!detail.metrics)return <Spinner text="Daten werden berechnet …"/>;
 if(widget.type==='bar'||ADVANCED_TYPES.includes(widget.type))return <AdvancedChart widget={widget} detail={detail} filters={filters}/>;
 if(widget.type==='kpi')return <div className="nxt-widget-kpi"><strong>{metricFormat(widget.metric||'onTimeRate',value)}</strong><small>{METRIC_LABELS[widget.metric||'onTimeRate']} · WoodCorp O2C</small></div>;
 if(widget.type==='line')return <InteractiveTrend values={detail.trend} initialMetric={widget.metric}/>;
 if(widget.type==='donut'){
  const total=detail.metrics?.dateCoverage||0,late=detail.ribbon?.lateOrders??0,onTime=Math.max(0,total-late),share=total?100*onTime/total:0;
  return <div className="nxt-widget-donut"><div className="donut-ring" style={{background:`conic-gradient(#008B92 ${share}%, #E1EAEB 0)`}} role="img" aria-label={`${percent(share)} pünktliche Lieferungen`}><div><b>{total?percent(share):'–'}</b><span>Pünktlich</span></div></div><p>{number(onTime)} pünktlich · {number(late)} verspätet</p></div>;
 }
 if(loading)return <Spinner text="Vergleichsdaten werden geladen …"/>;
 if(error)return <Notice kind="error">{error}</Notice>;
 if(widget.type==='table')return <TableWidget rows={rows}/>;

 return null;
}
export function DashboardRenderer({dashboard,detail:baseDetail,filters:baseFilters,compact=false,onExplain}:{dashboard:NodeDashboard;detail:DashboardData;filters:Filter[];compact?:boolean;onExplain?:(metric:MetricKey)=>void}){
 const access=React.useContext(ChartAccess),baseKey=filterSignature(baseFilters);
 const [cross,setCross]=useState<{key:string;filters:Filter[]}>({key:'',filters:[]});const extra=cross.key===baseKey?cross.filters:[];
 const filters=extra.length?[...baseFilters,...extra]:baseFilters,key=filterSignature(filters);
 const [loaded,setLoaded]=useState<{key:string;detail:DashboardData}>({key:'',detail:{metrics:null,trend:[],breakdown:[],pending:true,error:null}});
 const [crossError,setCrossError]=useState('');
 useEffect(()=>{setCrossError('')},[baseKey]);
 useEffect(()=>{if(!extra.length)return;let active=true;const pending:DashboardData={metrics:null,trend:[],breakdown:[],pending:true,error:null};setLoaded({key,detail:pending});Promise.all([analysisApi.metrics(filters),analysisApi.trend(filters),analysisApi.breakdown('delivery_company',filters)]).then(([m,trend,breakdown])=>{if(active)setLoaded({key,detail:{metrics:m,ribbon:{...m,deliveryDateCount:m.dateCoverage} as NonNullable<DashboardData['ribbon']>,trend,breakdown,pending:false,error:null}})}).catch(e=>{if(active)setLoaded({key,detail:{...pending,pending:false,error:e instanceof Error?e.message:'Dashboard-Abfrage fehlgeschlagen'}})});return()=>{active=false}},[key,extra.length]);
 const detail=extra.length?(loaded.key===key?loaded.detail:{metrics:null,trend:[],breakdown:[],pending:true,error:null}):baseDetail;
 const crossFilter=(field:FieldKey,value:string)=>{try{if(!access.fields.includes(field))throw Error('Filter nicht freigegeben');setCross({key:baseKey,filters:appendChartFilter(baseFilters,extra,field,value)});setCrossError('')}catch(e){setCrossError(e instanceof Error?e.message:'Ungültiger Filter')}};
 return <ChartAccess.Provider value={{...access,crossFilter}}>{extra.length>0&&<div className="nxt-chart-selection"><strong>Temporäre Dashboardfilter</strong><small>Nur dieses Dashboard · kein Einfluss auf andere Zweige oder gespeicherte Filter.</small><div className="nxt-chart-controls">{extra.map(f=><button key={f.id} type="button" onClick={()=>setCross({key:baseKey,filters:extra.filter(x=>x.id!==f.id)})}>{formatFilter(f)} ×</button>)}<button type="button" onClick={()=>{setCross({key:baseKey,filters:[]});setCrossError('')}}>Alle zurücksetzen</button></div></div>}{crossError&&<Notice kind="error">{crossError}</Notice>} <div className={'node-dashboard-renderer '+(compact?'compact':'')}><p className="dashboard-question"><Icon name="circle-help" size={17}/>{dashboard.question}</p><div className="node-dashboard-widgets">{dashboard.widgets.map(w=><section key={w.id} className={'nxt-widget '+(w.width==='full'?'full':'half')}><header><Icon name={WIDGET_ICONS[w.type]} size={17}/><h4>{w.title}</h4>{onExplain&&!extra.length&&w.type!=='text'&&!PROCESS_TYPES.some(t=>t===w.type)&&<button type="button" className="nxt-widget-explain" onClick={()=>onExplain(w.type==='kpi'?(w.metric||'otifRate')
   :['waterfall','pareto','treemap'].includes(w.type)?'totalPenaltyEur'
   :['stacked','stacked100','heatmap','scatter','bullet','funnel'].includes(w.type)?'otifRate'
   :['histogram'].includes(w.type)?'otifRate'
   :['bar_horizontal','bar_vertical'].includes(w.type)?(w.metric||'otifRate'):'onTimeRate')} title={"Berechnungslogik für "+w.title} aria-label={"Berechnungslogik für "+w.title}><Icon name="info" size={15}/></button>}</header><DashboardWidgetView widget={w} detail={detail} filters={filters}/></section>)}{!dashboard.widgets.length&&<div className="widget-empty">Noch keine Dashboard-Elemente. Im Dashboard Builder können Widgets hinzugefügt werden.</div>}</div></div></ChartAccess.Provider>;
}
function LibraryTile({type,onClick,disabled}:{type:WidgetType;onClick:()=>void;disabled:boolean}){
 const drag=useDraggable({id:'palette:'+type,disabled,data:{type}});
 return <div ref={drag.setNodeRef} className={'widget-library-tile '+(drag.isDragging?'being-dragged':'')}><button type="button" className="widget-library-grip" disabled={disabled} ref={drag.setActivatorNodeRef} {...drag.attributes} {...drag.listeners} aria-label={WIDGET_LABELS[type]+' ziehen'} title="Per Drag & Drop hinzufügen"><Icon name="grip-vertical" size={18}/></button><Icon name={WIDGET_ICONS[type]} size={20}/><span>{WIDGET_LABELS[type]}</span><button type="button" disabled={disabled} aria-label={WIDGET_LABELS[type]+' hinzufügen'} onClick={onClick}><Icon name="plus" size={17}/></button></div>;
}
function WidgetItem({widget,detail,filters,selected,onSelect,disabled,index,onRemove,onMove}:{widget:DashboardWidget;detail:DashboardData;filters:Filter[];selected:boolean;onSelect:()=>void;disabled:boolean;index:number;onRemove:()=>void;onMove:(n:number)=>void}){
 const drag=useDraggable({id:'widget:'+widget.id,disabled});const drop=useDroppable({id:'drop:'+widget.id});
 return <article ref={drop.setNodeRef} className={'dashboard-edit-widget '+(widget.width==='full'?'full':'half')+(selected?' selected':'')+(drop.isOver?' drop-target':'')} style={drag.isDragging?{opacity:.45}:undefined}>
  <div className="dashboard-edit-widget-top"><button type="button" className="dashboard-drag-handle" disabled={disabled} ref={drag.setNodeRef} {...drag.attributes} {...drag.listeners} title="Widget verschieben"><Icon name="grip-vertical" size={16}/></button><button type="button" onClick={onSelect} aria-pressed={selected} className="dashboard-widget-title"><Icon name={WIDGET_ICONS[widget.type]} size={17}/>{widget.title}</button><button type="button" title="Widget nach oben" onClick={()=>onMove(index-1)} disabled={disabled||index===0}><Icon name="chevron-left" size={17}/></button><button type="button" title="Widget nach unten" onClick={()=>onMove(index+1)} disabled={disabled}><Icon name="chevron-right" size={17}/></button><button type="button" title="Widget entfernen" onClick={onRemove} disabled={disabled}><Icon name="trash-2" size={17}/></button></div>
  <div className="dashboard-edit-widget-content"><DashboardWidgetView widget={widget} detail={detail} filters={filters}/></div>
 </article>;
}
function EndDrop(){const {setNodeRef,isOver}=useDroppable({id:'drop:end'});return <div ref={setNodeRef} className={'dashboard-drop-end '+(isOver?'drop-target':'')}>Widget hier ablegen</div>}
function WidgetInspector({widget,onPatch,onRemove,disabled,fieldNames,allowedFields}:{widget?:DashboardWidget;onPatch:(patch:Partial<DashboardWidget>)=>void;onRemove:()=>void;disabled:boolean;fieldNames:Record<FieldKey,string>;allowedFields:FieldKey[]}){
 if(!widget)return <aside className="dashboard-inspector"><h3>Eigenschaften</h3><p className="muted">Wähle ein Dashboard-Element aus, um es zu konfigurieren.</p></aside>;
 return <aside className="dashboard-inspector"><h3><Icon name="sliders-horizontal" size={18}/> Eigenschaften</h3><label className="field">Überschrift<input value={widget.title} maxLength={100} disabled={disabled} onChange={e=>onPatch({title:e.target.value})}/></label>
  <label className="field">Breite<select value={widget.width} disabled={disabled} onChange={e=>onPatch({width:e.target.value as DashboardWidget['width']})}><option value="half">1/2 Breite</option><option value="full">Volle Breite</option></select></label>
  {widget.type==='kpi'&&<label className="field">Kennzahl<select value={widget.metric||'onTimeRate'} disabled={disabled} onChange={e=>onPatch({metric:e.target.value as DashboardWidget['metric']})}>{METRICS.map(m=><option value={m} key={m}>{METRIC_LABELS[m]}</option>)}</select></label>}
  {(widget.type==='bar'||widget.type==='table'||['bar_horizontal','bar_vertical','stacked','stacked100','heatmap','pareto','scatter','treemap'].includes(widget.type))&&<label className="field">Vergleichsdimension<select value={widget.dimension||'delivery_company'} disabled={disabled} onChange={e=>onPatch({dimension:e.target.value as FieldKey})}>{[...new Set([...allowedFields.filter(f=>(widget.type==='heatmap'?HEATMAP_FIELDS:CHART_SEGMENT_FIELDS).includes(f)),widget.dimension||'delivery_company'])].map(f=><option value={f} key={f}>{fieldNames[f]}</option>)}</select></label>}
  {['bar','line','bar_horizontal','bar_vertical'].includes(widget.type)&&<label className="field">Dargestellte Kennzahl<select value={widget.metric||'otifRate'} disabled={disabled} onChange={e=>onPatch({metric:e.target.value as DashboardWidget['metric']})}><SegmentMetricOptions/></select></label>}
  {widget.type==='heatmap'&&<label className="field">Zweite Dimension<select value={widget.compareDimension||'product_type'} disabled={disabled} onChange={e=>onPatch({compareDimension:e.target.value as FieldKey})}>{(['factory','product_type','delivery_company','cust_market','cust_country','warehouse_type'] as FieldKey[]).filter(f=>f!==widget.dimension).map(f=><option key={f} value={f}>{fieldNames[f]}</option>)}</select></label>}
  {widget.type==='bullet'&&<><label className="field">Rate<select value={widget.metric||'otifRate'} disabled={disabled} onChange={e=>onPatch({metric:e.target.value as MetricKey})}>{(['otifRate','onTimeRate','volumeConformanceRate'] as MetricKey[]).map(m=><option key={m} value={m}>{METRIC_LABELS[m]}</option>)}</select></label><label className="field">Zielwert (%)<input type="number" min="0" max="100" step=".1" disabled={disabled} value={widget.target??80} onChange={e=>onPatch({target:Math.max(0,Math.min(100,Number(e.target.value)||0))})}/></label></>}
  {widget.type==='e02_distribution'&&<label className="field">Prozessintervall<select value={widget.intervalKey||'order_to_delivery'} disabled={disabled} onChange={e=>onPatch({intervalKey:e.target.value as E02IntervalKey})}>{E02_KEYS.map(key=><option key={key} value={key}>{E02_INTERVALS[key].title}</option>)}</select></label>}
  {widget.type==='histogram'&&<label className="field">Verteilung<select value={widget.distributionMeasure||'quantity_change_count'} disabled={disabled} onChange={e=>onPatch({distributionMeasure:e.target.value as DashboardWidget['distributionMeasure']})}><option value="quantity_change_count">Anzahl Mengenänderungen</option><option value="lateness_days">Lieferverzug nach Intervall</option></select></label>}
  {widget.type==='text'&&<label className="field">Freitext<textarea rows={6} maxLength={3000} value={widget.text||''} disabled={disabled} onChange={e=>onPatch({text:e.target.value})}/></label>}
  <button className="nxt-button secondary" type="button" disabled={disabled} onClick={onRemove}><Icon name="trash-2" size={16}/> Widget entfernen</button>
  <p className="muted">Kennzahlen werden live im aktuellen Knoten-Filterkontext berechnet.</p>
 </aside>;
}
export function DashboardBuilder({nodeId,nodeLabel,nodeOptions,onSelectNode,dashboard,onChange,detail,filters,onBack,onSave,canEdit,saving,fieldNames,allowedFields}:{nodeId:string;nodeLabel:string;nodeOptions:Array<{id:string;label:string}>;onSelectNode:(id:string)=>void;dashboard:NodeDashboard;onChange:(dashboard:NodeDashboard)=>void;detail:DashboardData;filters:Filter[];onBack:()=>void;onSave:()=>void;canEdit:boolean;saving:boolean;fieldNames:Record<FieldKey,string>;allowedFields:FieldKey[]}){
 const [selected,setSelected]=useState<string|null>(null);
 const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:6}}),useSensor(KeyboardSensor));
 const selectedWidget=useMemo(()=>dashboard.widgets.find(w=>w.id===selected)||undefined,[dashboard,selected]);
 useEffect(()=>{setSelected(null)},[nodeId]);
 const update=(d:NodeDashboard)=>{if(canEdit)onChange(d)};
 const add=(type:WidgetType,index?:number)=>{if(!canEdit)return;const next=addWidget(dashboard,type,index);setSelected(next.widgets.find(w=>!dashboard.widgets.some(x=>x.id===w.id))?.id||null);update(next)};
 const dragEnd=({active,over}:DragEndEvent)=>{
  if(!canEdit||!over)return;
  const id=String(active.id),target=String(over.id);
  const index=target==='drop:end'?dashboard.widgets.length:dashboard.widgets.findIndex(w=>'drop:'+w.id===target);
  if(index<0)return;
  if(id.startsWith('palette:')){const type=id.slice(8) as WidgetType;if(WIDGET_TYPES.includes(type))add(type,index)}
  else if(id.startsWith('widget:'))update(moveWidget(dashboard,id.slice(7),index));
 };
 return <DndContext sensors={sensors} onDragEnd={dragEnd}><div className="dashboard-builder-screen"><header className="dashboard-builder-header"><div><h2><Icon name="layout-dashboard" size={23}/> Dashboard Builder</h2><p>Pro Knoten eigene Widgets konfigurieren · Daten bleiben an den aktuellen Analysefilter gebunden</p></div><div><button className="nxt-button secondary" onClick={onBack}><Icon name="arrow-left" size={16}/> Analyse</button><Button kind="primary" icon="save" onClick={onSave} disabled={!canEdit||saving}>{saving?'Speichert …':'Workspace speichern'}</Button></div></header>
 <div className="dashboard-builder-layout">
  <aside className="dashboard-library"><h3><Icon name="layers" size={18}/> Widgetbibliothek</h3><p className="muted">Ziehen oder per Plus hinzufügen</p>{WIDGET_TYPES.map(t=><LibraryTile key={t} type={t} disabled={!canEdit} onClick={()=>add(t)}/>)}</aside>
  <section className="dashboard-work-area"><div className="dashboard-work-head"><label className="field">Analysierter Knoten<select value={nodeId} onChange={e=>onSelectNode(e.target.value)}>{nodeOptions.map(n=><option key={n.id} value={n.id}>{n.label}</option>)}</select></label><label className="field dashboard-question-edit">Forschungsfrage<input value={dashboard.question} maxLength={700} disabled={!canEdit} onChange={e=>update({...dashboard,question:e.target.value})}/></label></div>
   <div className="dashboard-design-canvas"><div className="dashboard-edit-grid">{dashboard.widgets.map((w,i)=><WidgetItem key={w.id} index={i} widget={w} detail={detail} filters={filters} selected={selected===w.id} onSelect={()=>setSelected(w.id)} disabled={!canEdit} onRemove={()=>{update(removeWidget(dashboard,w.id));if(selected===w.id)setSelected(null)}} onMove={index=>update(moveWidget(dashboard,w.id,index))}/>)}<EndDrop/></div></div>
   <p className="dashboard-save-note">{canEdit?'Änderungen werden beim Speichern in deinem Workspace gesichert.':'Du kannst dieses Dashboard ansehen, benötigst für Änderungen jedoch Editorrechte.'}</p>
  </section>
  <WidgetInspector widget={selectedWidget} fieldNames={fieldNames} allowedFields={allowedFields} disabled={!canEdit} onPatch={patch=>selectedWidget&&update(updateWidget(dashboard,selectedWidget.id,patch))} onRemove={()=>{if(selectedWidget)update(removeWidget(dashboard,selectedWidget.id));setSelected(null)}}/>
 </div></div></DndContext>;
}