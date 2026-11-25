import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ReactFlowProvider,useEdgesState,useNodesState,useReactFlow,type Connection,type EdgeChange,type NodeChange,type Viewport} from '@xyflow/react';
import {FIELD_LABELS,FIELDS,PROJECT,FILTER_KIND,OTIF_STATUS_LABELS,FILTER_GROUPS,filterGroup,CHART_SEGMENT_FIELDS,PROCESS_VARIANT_LEGEND,type FieldKey} from './config';
import {analysisApi,memberApi,supabase,clearAnalyticsCache} from './lib/supabase';
import {effectiveFilters,labels,makeFilter,toBackend,validateFilters,formatFilter,traceFilters} from './core/filters';
import {ROOT_ID,rootAnalysis,createInitialGraph,createBlankWorkspaceGraph,splitGraph,nodeFor,referenceEdge,annotationEdge,isValidAnnotation,isValidReference,cleanDraft,serializeDraft,restoreDraft,containerAt,worldPosition,moveIntoContainer,removeContainer,changeContainerSettings,resizeGraphCard,freeCanvasPosition,nodeLayoutSize,type NNode,type NEdge} from './core/graph';
import {ResearchExplorer} from './components/ResearchExplorer';
import {RESEARCH_LABELS,validResearchSpec,type ResearchSpec} from './core/research';
import {commitLayout,layoutFingerprint} from './core/smartLayout';
import {cardDimensions,type CardSize} from './core/cardLayout';
import type {Filter,Role,Ribbon,Metrics,TrendRow,BreakdownRow,PaletteType,DashboardData,SavedDraft,AnalysisNode} from './core/types';
import {CanvasWithFlow} from './components/GraphCanvas';
import Icon from './components/Icon';
import {Brand,Button,IconButton,Modal,Notice,Spinner,number,percent,decimal,SmallTrend} from './components/Ui';
import AuthScreen from './components/AuthScreen';
import {extractInviteTicket,isInviteFragment,type InvitationTicket} from './lib/invite';
import {findingStamp,findingStatus} from './core/findings';
import {canvasWidgetFor,combineLocals} from './core/analyticsCanvas';
import {appendChartFilter} from './core/chartInteraction';
import {CanvasWidgetSettings} from './components/CanvasWidgetSettings';
import {ChartAccess} from './components/InteractiveCharts';
import {DashboardRenderer,DashboardBuilder} from './components/DashboardBuilder';
import {WorkspaceControls,FilterCatalogPage} from './components/WorkspaceControls';
import {standardDashboard,makeDocument,validDocument,normalizeDashboard,freshWidget,WIDGET_TYPES,metricValue,metricFormat,METRIC_LABELS,type DashboardWidget,type WidgetType,type MetricKey,type NodeDashboard} from './core/dashboard';
import {CalculationLogic} from './components/CalculationLogic';
import {ProcessDefinition} from './components/ProcessCharts';
import {E02_KEYS} from './core/processIntervals';
import {workspacesApi,type WorkspaceRecord,type FilterCatalogRow} from './lib/workspaces';
import './styles/dashboard.css';
import './styles/v4.css';
import './styles/v5.css';
import './styles/v6.css';
import './styles/v7.css';
import './styles/v8.css';
import './styles/v9.css';
import './styles/v10.css';
import './styles/chart-cards.css';
import './styles/research.css';
import {ContainerSettings} from './components/ContainerSettings';
import {AiDashboardPrep} from './components/AiDashboardPrep';
import {IntelligencePanel} from './components/IntelligencePanel';
import {IntelligenceAdmin} from './components/IntelligenceAdmin';
import {assistantFingerprint,applyAssistantPlan,resolveAssistantNodeId,type AssistantState} from './core/assistant';
import type {AiPlan} from './core/assistantProtocol';
import './styles/intelligence.css';
import {NodeSettings} from './components/NodeSettings';
import {conflictingFields,filterSignature} from './core/filters';
import {WorkspaceOverview} from './components/WorkspaceOverview';
import {DataExplorer} from './components/DataExplorer';
import {FilterCatalogV4} from './components/FilterCatalogV4';
import {DashboardFullView,KpiNameDialog,RenameNodeDialog,type MetricNames} from './components/DashboardViews';
import type {FilterCandidate} from './lib/workspaces';

type View='home'|'workspaces'|'analytics'|'tree'|'builder'|'data'|'filters'|'team'|'profile';
const NAV:{id:View;label:string;icon:string;admin?:boolean}[]=[
 {id:'home',label:'Home',icon:'house'}, {id:'workspaces',label:'Workspaces',icon:'layers'}, {id:'analytics',label:'KPI-Analyse',icon:'chart-column'},
 {id:'tree',label:'Decision Tree',icon:'network'}, {id:'builder',label:'Dashboard Builder',icon:'layout-dashboard'},
 {id:'data',label:'Datenquellen',icon:'database'}, {id:'filters',label:'Filterbibliothek',icon:'filter'},
 {id:'team',label:'Team & Zugänge',icon:'user-round',admin:true},{id:'profile',label:'Konfiguration',icon:'settings'}
];
const emptyDetail:DashboardData={metrics:null,trend:[],breakdown:[],pending:false,error:null};
const fmtDate=(value:string|null|undefined)=>value?new Date(value).toLocaleDateString('de-DE'):'–';
const isEditing=(role:Role|null)=>role==='admin'||role==='analyst';

function FilterDialog({target,dimensions,allowedFields,fieldNames,onApply,onClose}:{target:{kind:'global'|'node';id?:string};dimensions:Record<string,string[]>;allowedFields:FieldKey[];fieldNames:Record<FieldKey,string>;onApply:(f:Filter)=>void;onClose:()=>void}){
 const [field,setField]=useState<FieldKey>(allowedFields[0]||'factory');
 const kind=FILTER_KIND(field), options=dimensions[field]||[];
 const [valueSearch,setValueSearch]=useState('');
 const visibleOptions=options.filter(v=>(OTIF_STATUS_LABELS[v]||v).toLowerCase().includes(valueSearch.trim().toLowerCase()));
 const [op,setOp]=useState<Filter['op']>('eq'),[value,setValue]=useState(''),[multi,setMulti]=useState<string[]>([]);
 const [from,setFrom]=useState(''),[to,setTo]=useState(''),[error,setError]=useState('');
 useEffect(()=>{setOp(FILTER_KIND(field)==='category'?'eq':'between');setValue((dimensions[field]||[])[0]||'');setMulti([]);setFrom('');setTo('');setError('');setValueSearch('');},[field,dimensions]);
 const categorical=kind==='category', numeric=kind==='number';
 const submit=(e:React.FormEvent)=>{
  e.preventDefault();setError('');
  try{
   if(!allowedFields.includes(field))throw Error('Filter noch nicht verfügbar oder deaktiviert.');
   const payload:string|string[]=categorical?(op==='in'?multi:value):op==='between'?[from,to]:from;
   onApply(makeFilter(field,payload,target.kind==='global'?'global':'local',op));onClose();
  }catch(err){setError(err instanceof Error?err.message:'Ungültiger Filter');}
 };
 return <Modal title={target.kind==='global'?'Globalen Filter hinzufügen':'Lokalen Filter für den Knoten'} onClose={onClose}>
  <p className="muted">{target.kind==='global'?'Dieser Filter gilt für alle Knoten, Diagramme und Dashboards.':'Der Filter gilt für diesen Knoten und alle über Filterpfeile erreichbaren Nachfolger, nicht für unabhängige Zweige.'}</p>
  <form onSubmit={submit} className="nxt-typed-filter">
   <label className="field">Dimension<select value={field} onChange={e=>setField(e.target.value as FieldKey)}>{FILTER_GROUPS.map(group=>{const fields=allowedFields.filter(f=>filterGroup(f)===group);return fields.length?<optgroup key={group} label={group}>{fields.map(f=><option key={f} value={f}>{fieldNames[f]}</option>)}</optgroup>:null})}</select></label>
   <label className="field">Vergleich<select value={op} onChange={e=>{setOp(e.target.value as Filter['op']);setError('')}}>{categorical?<><option value="eq">Ist gleich</option><option value="in">Ist einer von (Mehrfachauswahl)</option></>:<><option value="between">Zwischen / Zeitraum</option><option value="gte">Ab (≥)</option><option value="lte">Bis (≤)</option><option value="eq">Gleich (=)</option></>}</select></label>
   {categorical&&options.length>12&&<label className="field">Werte suchen<input type="search" value={valueSearch} onChange={e=>setValueSearch(e.target.value)} placeholder="Suchbegriff …"/><small className="muted">{visibleOptions.length} von {options.length} Werten</small></label>}
   {field==='process_variant'&&<details className="nxt-filter-legend"><summary>Aktivitätskürzel anzeigen</summary><p>{PROCESS_VARIANT_LEGEND}</p></details>}
   {field==='quantity_change_phase'&&<p className="muted">Phase der letzten Mengenänderung. Änderungen am selben Kalendertag wie ein Meilenstein oder unplausible Abfolgen gelten als nicht eindeutig.</p>}
   {field==='cust_name'&&<p className="muted">Gleiche Kundennamen können mehreren Kunden-IDs zugeordnet sein. Für einen einzelnen Kunden bitte zusätzlich nach Kunden-ID filtern.</p>}
   {field==='order_size_class'&&<p className="muted">Klassen bis 1.000, 5.000, 10.000 und über 10.000 kg. Andere Einheiten bleiben separat.</p>}
   {categorical&&!options.length&&<Notice kind="warning">Für diese Dimension sind noch keine Werte geladen.</Notice>}
   {categorical&&(op==='eq'?<label className="field">Wert<select value={value} onChange={e=>setValue(e.target.value)}><option value="">Bitte wählen</option>{[...new Set([...(value&&options.includes(value)?[value]:[]),...visibleOptions])].map(v=><option value={v} key={v}>{OTIF_STATUS_LABELS[v]||v}</option>)}</select></label>:
    <fieldset className="nxt-multiselect"><legend>Mehrere Werte auswählen ({multi.length}/20)</legend>{visibleOptions.map(v=><label key={v}><input type="checkbox" checked={multi.includes(v)} onChange={e=>setMulti(old=>e.target.checked?[...old,v].slice(0,20):old.filter(x=>x!==v))}/>{OTIF_STATUS_LABELS[v]||v}</label>)}</fieldset>)}
   {!categorical&&<div className="nxt-filter-range">
    <label className="field">{op==='between'?'Von':op==='gte'?'Ab':op==='lte'?'Bis':'Wert'}<input type={numeric?'number':'date'} step={numeric?'any':undefined} required value={from} onChange={e=>setFrom(e.target.value)}/></label>
    {op==='between'&&<label className="field">Bis<input type={numeric?'number':'date'} step={numeric?'any':undefined} required value={to} onChange={e=>setTo(e.target.value)}/></label>}
   </div>}
   {error&&<Notice kind="error">{error}</Notice>}
   <div className="modal-actions"><Button onClick={onClose}>Abbrechen</Button><Button kind="primary" icon="check" type="submit" disabled={!allowedFields.includes(field)||(categorical&&(op==='in'?!multi.length:!value))}>Filter anwenden</Button></div>
  </form>
 </Modal>;
}
function SplitDialog({nodeName,dimensions,allowedFields,fieldNames,onSplit,onClose}:{nodeName:string;dimensions:Record<string,string[]>;allowedFields:FieldKey[];fieldNames:Record<FieldKey,string>;onSplit:(f:FieldKey)=>Promise<void>;onClose:()=>void}){
 const splitFields=allowedFields.filter(f=>CHART_SEGMENT_FIELDS.includes(f)&&dimensions[f]?.length);
 const [field,setField]=useState<FieldKey>(splitFields.includes('product_type')?'product_type':splitFields[0]||'factory');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 return <Modal title="Knoten aufgliedern" onClose={onClose}><p className="muted"><b>{nodeName}</b> wird nach einer zugelassenen Dimension in analytische Teilgruppen zerlegt. Diese Teilgruppen erben automatisch die Knotenfilter.</p>
 <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await onSplit(field);onClose();}catch(e){setError(e instanceof Error?e.message:'Aufgliederung nicht möglich');}finally{setBusy(false)}}}>
  <label className="field">Split-Dimension<select value={field} onChange={e=>setField(e.target.value as FieldKey)}>{FILTER_GROUPS.map(group=>{const fields=splitFields.filter(f=>filterGroup(f)===group);return fields.length?<optgroup key={group} label={group}>{fields.map(f=><option key={f} value={f}>{fieldNames[f]}</option>)}</optgroup>:null})}</select></label>
  {error&&<Notice kind="error">{error}</Notice>}
  <div className="modal-actions"><Button onClick={onClose}>Abbrechen</Button><Button type="submit" kind="primary" icon="split" disabled={busy||!splitFields.includes(field)}>Aufgliedern</Button></div>
 </form></Modal>;
}
function Header({userEmail,onSignOut,onProfile,onSearch,onHelp}:{userEmail:string;onSignOut:()=>void;onProfile:()=>void;onSearch:(value:string)=>void;onHelp:()=>void}){
 const [search,setSearch]=useState('');const [focus,setFocus]=useState(false);
 useEffect(()=>{const fn=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();document.getElementById('nxt-search')?.focus();}};window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn)},[]);
 return <header className="app-header"><Brand/><div className="header-separator"/><div className="header-project"><strong>NXT Analytics</strong><small>Digital Transformation</small></div>
 <div className="header-search"><Icon name="search" size={18}/><input aria-label="Analysen, Knoten und Seiten durchsuchen" placeholder="Analysen, Dashboards, Knoten, Filter …" id="nxt-search" value={search} onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)} onChange={e=>{setSearch(e.target.value);onSearch(e.target.value)}}/><kbd>Strg + K</kbd></div>
 <div className="header-actions"><IconButton name="circle-help" title="Hilfe zur Analyse" onClick={onHelp}/><IconButton name="settings" title="Kontoeinstellungen" onClick={onProfile}/><div className="user-avatar" title={userEmail}>{userEmail?.split('@')[0]?.split('.')?.map(s=>s[0]?.toUpperCase()).join('').slice(0,2)||'NX'}</div><IconButton name="log-out" title="Abmelden" onClick={onSignOut}/></div></header>;
}
function Sidebar({view,onNavigate,collapsed,setCollapsed,role}:{view:View;onNavigate:(v:View)=>void;collapsed:boolean;setCollapsed:(v:boolean)=>void;role:Role|null}){
 return <aside className={'navigation '+(collapsed?'collapsed':'')} aria-label="Hauptnavigation"><nav><button className="nav-toggle" type="button" onClick={()=>setCollapsed(!collapsed)} aria-label={collapsed?'Navigation ausklappen':'Navigation einklappen'} title={collapsed?'Navigation ausklappen':'Navigation einklappen'}><Icon name={collapsed?'panel-left-open':'panel-left-close'} size={18}/>{!collapsed&&'Navigation'}</button>
 {NAV.filter(n=>!n.admin||role==='admin').map(n=><button className={'nav-entry '+(n.id===view?'active':'')} key={n.id} aria-current={n.id===view?'page':undefined} onClick={()=>onNavigate(n.id)} title={n.label} type="button"><Icon name={n.icon} size={19}/>{!collapsed&&<span>{n.label}</span>}</button>)}
 </nav><div className="nav-spacer"/><div className="nav-bottom">{!collapsed&&<><div className="nav-label"><Icon name="star" size={16}/> FAVORITEN</div><button type="button" onClick={()=>onNavigate('analytics')}><Icon name="target" size={16}/> On-Time Delivery</button><p>WoodCorp · O2C</p></>}<div className="nav-dots" aria-hidden="true"/></div></aside>;}
function MetricRibbon({ribbon,trend,pending,names,onExplain}:{ribbon:Ribbon|null;trend:TrendRow[];pending:boolean;names:MetricNames;onExplain:(metric:MetricKey)=>void}){
 const graph=trend.filter(r=>r.on_time_rate!=null).map(r=>Number(r.on_time_rate));
 const cards:{key:MetricKey;icon:string;hint:string;highlight?:boolean;graph?:number[]}[]=[
  {key:'otifRate',icon:'target',hint:'On Time In Full · Ziel 80 %',highlight:true},
  {key:'onTimeRate',icon:'clock-3',hint:'Pünktliche Lieferungen',graph},
  {key:'volumeConformanceRate',icon:'check-circle-2',hint:'Mengenkonforme Lieferungen'},
  {key:'totalPenaltyEur',icon:'triangle-alert',hint:'Vertragsstrafenmodell · 0,75 €/kg'},
  {key:'orders',icon:'package',hint:'Case-basierte Aufträge'}
 ];
 return <div className="kpi-ribbon">{cards.map(card=><section className={'ribbon-card '+(card.highlight?'featured':'')} key={card.key}>
   <div className="ribbon-symbol"><Icon name={card.icon} size={23}/></div>
   <div className="ribbon-content"><h3>{names[card.key]||METRIC_LABELS[card.key]}</h3><div className="ribbon-value">{pending&&!ribbon?'…':metricFormat(card.key,ribbon?metricValue(card.key,ribbon,ribbon):null)}</div><small>{card.hint}</small></div>
   {card.graph&&<SmallTrend values={card.graph}/>}
   <button className="ribbon-explain" type="button" onClick={()=>onExplain(card.key)} aria-label={'Berechnungslogik für '+METRIC_LABELS[card.key]} title="Berechnungslogik öffnen"><Icon name="info" size={15}/></button>
 </section>)}</div>;
}
function FilterStrip({globals,fieldNames,onRemove,onAdd,onReset,onShare}:{globals:Filter[];fieldNames:Record<FieldKey,string>;onRemove:(id:string)=>void;onAdd:()=>void;onReset:()=>void;onShare:()=>void}){
 return <div className="filter-strip"><div className="filter-title"><Icon name="filter" size={17}/> Aktive Filter <b>({globals.length})</b></div><div className="filter-chips">{globals.map(f=><div className="filter-chip" key={f.id}><span><b>{formatFilter(f,fieldNames)}</b></span><button title="Filter entfernen" aria-label={'Filter '+formatFilter(f,fieldNames)+' entfernen'} onClick={()=>onRemove(f.id)}>×</button></div>)}{!globals.length&&<span className="no-filters">Alle Werke · alle historischen Lieferungen</span>}</div>
 <button className="filter-add" onClick={onAdd}><Icon name="plus" size={17}/> Filter</button><IconButton name="refresh-cw" title="Globale Filter zurücksetzen" disabled={!globals.length} onClick={onReset}/><IconButton name="share-2" title="Gefilterte Ansicht teilen" onClick={onShare}/></div>;
}
function TrendChart({rows}:{rows:TrendRow[]}){
 const valid=rows.filter(r=>r.on_time_rate!=null);if(!valid.length)return <div className="chart-empty">Keine Zeitreihe für die aktuelle Auswahl</div>;
 const W=480,H=177,pad=37;const pts=valid.map((v,i)=>({x:pad+i*(W-pad-18)/Math.max(valid.length-1,1),y:14+(H-42)*(100-Number(v.on_time_rate))/100}));
 const points=pts.map(p=>p.x+','+p.y).join(' ');
 return <><svg viewBox="0 0 480 179" className="trend-svg" role="img" aria-label="On-Time Delivery im Verlauf der Monate">{[0,25,50,75,100].map(v=><g key={v}><line x1="37" x2="465" y1={14+(H-42)*(100-v)/100} y2={14+(H-42)*(100-v)/100} stroke="#e4ecee"/><text x="2" y={18+(H-42)*(100-v)/100} fontSize="11" fill="#64797e">{v}%</text></g>)}
 <polyline points={points} fill="none" stroke="#008B92" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>{pts.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="2.8" fill="#fff" stroke="#008B92" strokeWidth="1.8"/>)}
 <text x="37" y="177" fill="#64797e" fontSize="11">{valid[0].month}</text><text x="464" y="177" textAnchor="end" fill="#64797e" fontSize="11">{valid[valid.length-1].month}</text></svg>
 <details className="accessible-table"><summary>Daten als Tabelle</summary><table><thead><tr><th>Monat</th><th>Aufträge</th><th>Pünktlich</th></tr></thead><tbody>{valid.map(r=><tr key={r.month}><td>{r.month}</td><td>{number(r.orders)}</td><td>{percent(r.on_time_rate)}</td></tr>)}</tbody></table></details></>;
}
function BarChart({rows}:{rows:BreakdownRow[]}){
 const filtered=rows.filter(r=>r.label!=null&&r.on_time_rate!=null).slice(0,7);
 if(!filtered.length)return <div className="chart-empty">Keine Vergleichsdaten verfügbar</div>;
 return <div className="bar-chart">{filtered.map(r=><div className="bar-row" key={r.label}><span title={r.label||''}>{r.label}</span><div className="bar-track"><div style={{width:Math.max(0,Math.min(100,Number(r.on_time_rate)))+'%'}}/></div><b>{percent(r.on_time_rate)}</b></div>)}</div>;
}
function DetailPanel({node,detail,tab,setTab,onClose,onFilter,onExpand,onRename,dashboard,filters,fieldNames,filterTrace,onExplain,onEdit,canEdit,noteStatus,onEditNote,onOpenSource}:{node:NNode|undefined;detail:DashboardData;tab:string;setTab:(v:string)=>void;onClose:()=>void;onFilter:()=>void;onExpand:()=>void;onRename:()=>void;dashboard:NodeDashboard;filters:Filter[];fieldNames:Record<FieldKey,string>;filterTrace:ReturnType<typeof traceFilters>;onExplain:(metric:MetricKey)=>void;onEdit:()=>void;canEdit:boolean;noteStatus?:ReturnType<typeof findingStatus>;onEditNote:()=>void;onOpenSource:()=>void}){
 if(!node)return <section className="detail-panel"><div className="detail-header"><strong>Knoten-Dashboard</strong></div><div className="chart-empty">Knoten im Analysebaum auswählen.</div></section>;
 if(node.data.analysis.kind==='note'){const a=node.data.analysis;return <aside className="detail-panel"><div className="detail-header"><div><Icon name="type" size={20}/><div><strong>{a.label}</strong><small>Finding Document · WoodCorp O2C</small></div></div><IconButton name="x" title="Finding schließen" onClick={onClose}/></div><div className="detail-body"><div className="chart-box"><p className="nxt-finding-body">{a.description||'Freie Anmerkung'}</p>{noteStatus&&<span className={'nxt-finding-status '+noteStatus.state}>{noteStatus.text}</span>}{a.finding&&<p className="muted">Dokumentiert: {new Date(a.finding.recordedAt).toLocaleString('de-DE')} · Status vergleicht nur Filter und aggregierte KPIs, nicht die fachliche Richtigkeit.</p>}</div><div className="nxt-chart-controls">{a.finding&&<button type="button" onClick={onOpenSource}>Analysequelle öffnen</button>}{canEdit&&<button type="button" onClick={onEditNote}>Finding bearbeiten / prüfen</button>}</div></div></aside>;}
 const m=detail.metrics;const late=detail.ribbon?.lateOrders;const viz=node.data.analysis.visualization;const explanatoryMetric=(viz==='bar'||viz==='line'?(node.data.analysis.chartMetric||'onTimeRate'):viz==='donut'?(node.data.analysis.metricId||'otifRate'):node.data.analysis.metricId==='otd'?'onTimeRate':node.data.analysis.metricId||'otifRate') as MetricKey;const tabs=['Übersicht','Details','Treiber','Vergleich','Berechnungslogik'];
 return <aside className="detail-panel"><div className="detail-header"><div><Icon name="layers" size={20}/><div><strong>Knoten-Dashboard: {node.data.analysis.label}</strong><small>{node.data.analysis.predicate?fieldNames[node.data.analysis.predicate.field]:'Kennzahl'} · WoodCorp O2C</small></div></div><div className="detail-head-actions">{canEdit&&<IconButton name="type" title="Knoten umbenennen" onClick={onRename}/>}<IconButton name="maximize" title="Dashboard als Vollbild öffnen" onClick={onExpand}/><IconButton name="x" title="Detailbereich schließen" onClick={onClose}/></div></div>
 <nav className="detail-tabs" aria-label="Dashboard-Ansichten">{tabs.map(t=><button key={t} className={t===tab?'selected':''} aria-current={t===tab?'page':undefined} onClick={()=>setTab(t)}>{t}</button>)}</nav>
 {detail.pending&&!m?<Spinner text="Knotenkennzahlen werden geladen …"/>:detail.error?<Notice kind="error">{detail.error}</Notice>:<div className="detail-body">
 {tab==='Übersicht'&&<><div className="detail-dashboard-edit"><span className="muted">Knotenbezogenes Dashboard · {dashboard.widgets.length} Elemente</span>{canEdit&&<button className="nxt-button secondary" onClick={onEdit}><Icon name="layout-dashboard" size={16}/> Dashboard bearbeiten</button>}</div><DashboardRenderer key={node?.id} dashboard={dashboard} detail={detail} filters={filters} compact onExplain={onExplain}/></>}
 {tab==='Berechnungslogik'&&(node.data.analysis.visualization==='process_interval'?<ProcessDefinition intervalKey={node.data.analysis.intervalKey||'order_to_production'} stat={node.data.processInterval}/>:<CalculationLogic metric={explanatoryMetric} metrics={m} trace={filterTrace} fieldNames={fieldNames} node={node.data.analysis} calculated={node.data.calculation} compact/>)}
  {tab==='Details'&&<div className="chart-box"><h3>Kennzahlen und Datenumfang</h3><dl className="detail-list"><dt>Aufträge</dt><dd>{number(m?.orders)}</dd><dt>OTIF</dt><dd>{percent(m?.otifRate)}</dd><dt>OTIF-Aufträge</dt><dd>{number(m?.otifCases)}</dd><dt>Modellierte Vertragsstrafe (0,75 €/kg)</dt><dd>{metricFormat('totalPenaltyEur',m?.totalPenaltyEur??null)}</dd><dt>Pünktlich, aber nicht mengenkonform</dt><dd>{number(m?.onTimeNotFullCases)}</dd><dt>Verspätet, aber mengenkonform</dt><dd>{number(m?.lateInFullCases)}</dd><dt>Verspätet und nicht mengenkonform</dt><dd>{number(m?.lateNotFullCases)}</dd><dt>Pünktliche Lieferungen</dt><dd>{percent(m?.onTimeRate)}</dd><dt>Mengentreue</dt><dd>{percent(m?.volumeConformanceRate)}</dd><dt>Vollständige Liefertermine</dt><dd>{number(m?.dateCoverage)}</dd><dt>Früheste Lieferung</dt><dd>{fmtDate(m?.firstDelivery)}</dd><dt>Späteste Lieferung</dt><dd>{fmtDate(m?.lastDelivery)}</dd></dl></div>}
 {tab==='Treiber'&&<><Notice kind="warning">Dies sind beobachtete Segmentunterschiede, keine nachgewiesenen Ursachen.</Notice><div className="chart-box"><h3>Potenzielle Einflussbereiche · Lieferunternehmen</h3><BarChart rows={detail.breakdown}/></div></>}
 {tab==='Vergleich'&&<div className="chart-box"><h3>Vergleich nach Lieferunternehmen</h3><div className="table-overflow"><table><thead><tr><th>Lieferunternehmen</th><th>Aufträge</th><th>On-Time</th></tr></thead><tbody>{detail.breakdown.map((r,i)=><tr key={r.label||i}><td>{r.label||'Ohne Angabe'}</td><td>{number(r.orders)}</td><td>{percent(r.on_time_rate)}</td></tr>)}</tbody></table></div></div>}
 <button className="detail-refine" onClick={onFilter}><Icon name="filter" size={17}/> Diesen Knoten filtern</button><p className="dashboard-foot">Datenquelle: Supabase · Case-basiert · Historische Daten {PROJECT.years}</p></div>}</aside>;
}
type TeamMember={
 user_id:string;email?:string;display_name?:string;role:Role;
 confirmed?:boolean;lastSignIn?:string;workspace_count?:number;
};
function TeamPanel({role}:{role:Role}){
 const [members,setMembers]=useState<TeamMember[]>([]);
 const [name,setName]=useState(''),[email,setEmail]=useState('');
 const [roleNew,setRoleNew]=useState<Role>('viewer');
 const [link,setLink]=useState(''),[success,setSuccess]=useState(''),[error,setError]=useState('');
 const [busy,setBusy]=useState(false),[renewing,setRenewing]=useState('');
 const [ownId,setOwnId]=useState('');
 const [deleteTarget,setDeleteTarget]=useState<TeamMember|null>(null);
 const [deleteEmail,setDeleteEmail]=useState(''),[deleteError,setDeleteError]=useState('');
 const [deleting,setDeleting]=useState(false);
 const getToken=async()=>{
  const {data,error}=await supabase.auth.getSession();
  if(error||!data.session)throw Error('Deine Administrator-Sitzung ist abgelaufen. Bitte erneut anmelden.');
  setOwnId(data.session.user.id);
  return data.session.access_token;
 };
 const reload=useCallback(async()=>{
  try{
   const {data}=await supabase.auth.getSession();
   if(!data.session)throw Error('Bitte erneut anmelden.');
   setOwnId(data.session.user.id);
   const r=await memberApi({action:'list'},data.session.access_token);
   setMembers(r.members||[]);
  }catch(e){setError(e instanceof Error?e.message:'Mitglieder konnten nicht geladen werden.')}
 },[]);
 useEffect(()=>{if(role==='admin')void reload()},[role,reload]);
 if(role!=='admin')return <Notice kind="error">Administratorrechte erforderlich.</Notice>;
 const invite=async(e:React.FormEvent)=>{
  e.preventDefault();if(busy)return;
  if(name.trim().length<2){setError('Bitte einen vollständigen Namen eingeben.');return}
  setBusy(true);setError('');setLink('');setSuccess('');
  try{
   const r=await memberApi({action:'invite',display_name:name.trim(),email:email.trim(),role:roleNew},await getToken());
   if(!r.link?.startsWith('https://hennerdesma-art.github.io/DigitaleTransformation-WoodCorp/#nxt_invite='))
    throw Error('Die Funktion lieferte keinen gültigen NXT-Zugangslink.');
   setLink(r.link);setSuccess(r.message||'Einladung erstellt.');
   setName('');setEmail('');
   await reload();
  }catch(e){setError(e instanceof Error?e.message:'Einladung fehlgeschlagen.')}
  finally{setBusy(false)}
 };
 const changeRole=async(id:string,next:Role)=>{
  if(id===ownId){setError('Eigene Administratorrolle kann hier nicht verändert werden.');return}
  setBusy(true);setError('');
  try{await memberApi({action:'role',userId:id,role:next},await getToken());await reload()}
  catch(e){setError(e instanceof Error?e.message:'Rolle konnte nicht geändert werden.')}
  finally{setBusy(false)}
 };
 const renew=async(m:TeamMember)=>{
  if(busy||renewing||m.user_id===ownId)return;
  setRenewing(m.user_id);setLink('');setError('');setSuccess('');
  try{
   const r=await memberApi({action:'renew',userId:m.user_id},await getToken());
   if(!r.link?.startsWith('https://hennerdesma-art.github.io/DigitaleTransformation-WoodCorp/#nxt_invite='))
    throw Error('Der Dienst hat keinen NXT-Einmallink erzeugt.');
   setLink(r.link);setSuccess(r.message||'Ein neuer Einmallink wurde erzeugt.');
   await reload();
  }catch(e){setError(e instanceof Error?e.message:'Einladungslink konnte nicht erneuert werden.')}
  finally{setRenewing('')}
 };
 const remove=async(e:React.FormEvent)=>{
  e.preventDefault();if(!deleteTarget||deleting||deleteEmail.trim().toLowerCase()!==deleteTarget.email?.trim().toLowerCase())return;
  setDeleting(true);setDeleteError('');setError('');
  try{
   const r=await memberApi({action:'remove',userId:deleteTarget.user_id,confirmEmail:deleteEmail.trim()},await getToken());
   if(r.status!=='deleted')throw Error('Der Server hat keine vollständige Kontolöschung bestätigt.');
   setSuccess(r.warning||r.message||'Teamzugang und Auth-Konto wurden gelöscht.');
   setLink('');setDeleteTarget(null);setDeleteEmail('');
   await reload();
  }catch(e){setDeleteError(e instanceof Error?e.message:'Vollständige Kontolöschung fehlgeschlagen.')}
  finally{setDeleting(false)}
 };
 const display=(m:TeamMember)=>m.display_name?.trim()||'Name nicht hinterlegt';
 return <section className="content-page"><h2>Team & Zugänge</h2>
  <p className="muted">Persönliche Einladungen mit Namen, Rolle und einmaligem Link zur NXT-Webseite. Bereits entfernte Personen erhalten niemals allein durch Eingabe ihrer E-Mail-Adresse erneut Zugriff.</p>
  <div className="standard-card"><h3>Teammitglied einladen</h3>
   <form className="team-form nxt-team-invite-form" onSubmit={invite}>
    <label className="field">Vor- und Nachname
     <input type="text" minLength={2} maxLength={100} autoComplete="name" required
       value={name} onChange={e=>setName(e.target.value)} placeholder="Vorname Nachname"/>
    </label>
    <label className="field">E-Mail-Adresse
     <input type="email" autoComplete="off" required value={email} onChange={e=>setEmail(e.target.value)}
       placeholder="name@reutlingen-university.de"/>
    </label>
    <label className="field">Rolle
     <select value={roleNew} onChange={e=>setRoleNew(e.target.value as Role)}>
      <option value="viewer">Viewer</option><option value="analyst">Analyst</option><option value="admin">Administrator</option>
     </select>
    </label>
    <Button type="submit" disabled={busy||!!renewing} kind="primary" icon="plus">{busy?'Erstelle Zugang …':'Einmaligen NXT-Link erstellen'}</Button>
   </form>
   {success&&<Notice kind="success">{success}</Notice>}
   {link&&<div className="generated-link" role="status">
    <label>Einmaliger NXT-Zugangslink<input readOnly value={link} onFocus={e=>e.target.select()} aria-label="Einmaligen NXT-Zugangslink auswählen"/></label>
    <Button icon="copy" onClick={()=>{void navigator.clipboard?.writeText(link).catch(()=>setError('Automatisches Kopieren fehlgeschlagen. Bitte den Link manuell markieren und kopieren.'))}}>NXT-Link kopieren</Button>
    <span className="invite-privacy">Nur über einen vertraulichen Kanal an die betreffende Person senden. Sie legt ihr Passwort direkt auf der NXT-Webseite fest. Ein abgelaufener oder bereits genutzter Link kann über die Mitgliederliste erneuert werden.</span>
   </div>}
   {error&&<Notice kind="error">{error}</Notice>}
  </div>
  <div className="standard-card">
   <div className="card-heading"><h3>Mitglieder</h3><Button disabled={busy||deleting||!!renewing} onClick={()=>void reload()} icon="refresh-cw">Aktualisieren</Button></div>
   <div className="table-overflow"><table className="nxt-team-member-table">
    <thead><tr><th>Teammitglied</th><th>Status</th><th>Rolle</th><th>Aktionen</th></tr></thead>
    <tbody>{members.map(m=><tr key={m.user_id}>
     <td><div className="nxt-member-person"><strong>{display(m)}</strong><small>{m.email||'E-Mail nicht verfügbar'}</small></div></td>
     <td><span className={'nxt-member-status '+(m.confirmed?'confirmed':'pending')}>{m.confirmed?'Bestätigt':'Einladung ausstehend'}</span></td>
     <td><select value={m.role} disabled={busy||!!renewing||deleting||m.user_id===ownId}
       aria-label={'Rolle von '+display(m)} onChange={e=>void changeRole(m.user_id,e.target.value as Role)}>
       <option value="viewer">Viewer</option><option value="analyst">Analyst</option><option value="admin">Admin</option>
      </select></td>
     <td><div className="nxt-member-actions">
       {m.user_id!==ownId&&<Button disabled={busy||deleting||!!renewing} icon="refresh-cw" onClick={()=>void renew(m)}>
        {renewing===m.user_id?'Erstelle Link …':'Zugangslink erneuern'}</Button>}
       {m.user_id!==ownId&&<Button kind="danger" disabled={busy||deleting||!!renewing||!m.email} icon="trash-2"
        onClick={()=>{setDeleteTarget(m);setDeleteEmail('');setDeleteError('')}}>Endgültig löschen</Button>}
       {m.user_id===ownId&&<span className="muted">Eigenes Konto</span>}
      </div></td>
    </tr>)}</tbody>
   </table></div>
  </div>
  {role==='admin'&&<IntelligenceAdmin members={members}/>}
  {deleteTarget&&<Modal title="Teamzugang endgültig löschen" onClose={()=>{if(!deleting)setDeleteTarget(null)}}>
   <form className="nxt-team-delete-confirm" onSubmit={e=>void remove(e)}>
    <p>Das Supabase-Auth-Konto von <strong>{display(deleteTarget)}</strong> wird dauerhaft entfernt – einschließlich seiner Projektberechtigung, aktiven Auth-Sitzungen, bisherigen Einladungen und <strong>{deleteTarget.workspace_count||0} eigenen Workspaces</strong>. Die WoodCorp-Rohdaten und die Workspaces anderer Mitglieder bleiben erhalten.</p>
    <p>Ein späterer Zugang erfordert eine vollständig neue Einladung mit Name, E-Mail-Adresse und einmaligem Link.</p>
    <label className="field">Zur Bestätigung die vollständige E-Mail-Adresse eingeben
     <input autoFocus type="email" autoComplete="off" value={deleteEmail} onChange={e=>setDeleteEmail(e.target.value)}
      placeholder={deleteTarget.email||'E-Mail-Adresse'} required/>
    </label>
    {deleteError&&<Notice kind="error">{deleteError}</Notice>}
    <div className="modal-actions">
     <Button disabled={deleting} onClick={()=>setDeleteTarget(null)}>Abbrechen</Button>
     <Button kind="danger" type="submit" icon="trash-2" disabled={deleting||deleteEmail.trim().toLowerCase()!==deleteTarget.email?.trim().toLowerCase()}>
      {deleting?'Lösche Konto …':'Auth-Konto vollständig löschen'}</Button>
    </div>
   </form>
  </Modal>}
 </section>;
}
function DataPage(){return <section className="content-page"><h2>Datenquellen</h2><p className="muted">Verifizierter Datenbestand des Projekts WoodCorp Process Intelligence</p><div className="data-grid"><div className="standard-card"><Icon name="database"/><h3>woodcorp_cases</h3><b>19.953</b><small>Aufträge · Schlüssel case_key</small></div><div className="standard-card"><Icon name="network"/><h3>woodcorp_activities</h3><b>210.135</b><small>Ereignisse · Referenz case_key</small></div><div className="standard-card"><Icon name="lock"/><h3>RLS & Auth</h3><b>Geschützt</b><small>Persönliche Projektberechtigung</small></div></div><Notice kind="warning">Datenqualität: Das historische Flag <code>order_date_met</code> weicht bei 9.618 Aufträgen vom Vergleich <code>delivered_date ≤ promised_date</code> ab. Die aktuelle On-Time-Kennzahl verwendet den Datumsvergleich.</Notice></section>}
function FilterLibrary({dimensions,admin}:{dimensions:Record<string,string[]>;admin:boolean}){
 return <section className="content-page"><h2>Filterbibliothek</h2><p className="muted">Aktuell vom Datenbankserver validierte Filterfelder – weitere Datentypen und Administratorfreigaben folgen mit Phase 4/5.</p><div className="standard-card"><table><thead><tr><th>Dimension</th><th>Datenfeld</th><th>Werte</th><th>Status</th></tr></thead><tbody>{FIELDS.map(f=><tr key={f}><td>{FIELD_LABELS[f]}</td><td><code>{f}</code></td><td>{(dimensions[f]||[]).length}</td><td><span className="status-good">Freigegeben</span></td></tr>)}</tbody></table></div>{admin&&<Notice>Neue Filterfelder benötigen eine serverseitig geprüfte Allowlist und Datenberechtigungen; die Bearbeitung des Filterkatalogs folgt in der nächsten Ausbaustufe.</Notice>}</section>;
}function ProfilePage({email,role}:{email:string;role:Role|null}){const [pw,setPw]=useState('');const [notice,setNotice]=useState('');const submit=async(e:React.FormEvent)=>{e.preventDefault();if(pw.length<12){setNotice('Mindestens 12 Zeichen erforderlich');return;}const {error}=await supabase.auth.updateUser({password:pw});setNotice(error?error.message:'Passwort geändert');if(!error)setPw('')};return <section className="content-page"><h2>Konfiguration</h2><div className="standard-card profile"><h3>Mein Profil</h3><p><b>Adresse:</b> {email}</p><p><b>Rolle:</b> {role}</p><form onSubmit={submit}><label className="field">Neues Passwort<input type="password" minLength={12} autoComplete="new-password" value={pw} onChange={e=>setPw(e.target.value)} required/></label><Button kind="primary" type="submit" icon="lock">Passwort ändern</Button></form>{notice&&<Notice>{notice}</Notice>}</div></section>}

function AnalyticsWorkspace({userId,role,email,onSignOut}:{userId:string;role:Role;email:string;onSignOut:()=>void}){
 const flow=useReactFlow<NNode,NEdge>();const [view,setView]=useState<View>('analytics');const [collapsed,setCollapsed]=useState(false);
 const [globals,setGlobals]=useState<Filter[]>([]);const [locals,setLocals]=useState<Record<string,Filter[]>>({});const [canvasCross,setCanvasCross]=useState<Record<string,Filter[]>>({});
 const [dimensions,setDimensions]=useState<Record<string,string[]>>({});const [ribbon,setRibbon]=useState<Ribbon|null>(null);const [rootMetrics,setRootMetrics]=useState<Metrics|null>(null);const [ribbonTrend,setRibbonTrend]=useState<TrendRow[]>([]);
 const [selectedId,setSelectedId]=useState(ROOT_ID);const [selectedTab,setSelectedTab]=useState('Übersicht');const [logicContext,setLogicContext]=useState<{metric:MetricKey;nodeId:string|null}|null>(null);const [detail,setDetail]=useState<DashboardData>(emptyDetail);
 const [nodes,setNodes,onNodesChange]=useNodesState<NNode>([nodeFor(rootAnalysis(),{x:500,y:70})]);
 const [dashboards,setDashboards]=useState<Record<string,NodeDashboard>>({});const [metricNames,setMetricNames]=useState<MetricNames>({});const [fullDashboard,setFullDashboard]=useState(false);const [aiPrep,setAiPrep]=useState(false);const [intelligenceOpen,setIntelligenceOpen]=useState(false);const [nameDialog,setNameDialog]=useState<'node'|'metrics'|null>(null);const defaultDashboardRef=useRef<Record<string,NodeDashboard>>({});
 const [workspaces,setWorkspaces]=useState<WorkspaceRecord[]>([]);const [activeWorkspace,setActiveWorkspace]=useState<WorkspaceRecord|null>(null);
 const [catalog,setCatalog]=useState<FilterCatalogRow[]>([]);const [candidates,setCandidates]=useState<FilterCandidate[]>([]);const [saving,setSaving]=useState(false);const [catalogBusy,setCatalogBusy]=useState(false);
 const [edges,setEdges,onEdgesChange]=useEdgesState<NEdge>([]);const [editMode,setEditMode]=useState(false);const [rightVisible,setRightVisible]=useState(false);const [fullscreen,setFullscreen]=useState(false);const [busy,setBusy]=useState(true);const [warning,setWarning]=useState('');const [toast,setToast]=useState('');
 const [dialog,setDialog]=useState<{kind:'global'|'node'|'split';id?:string}|null>(null);const [configureNodeId,setConfigureNodeId]=useState<string|null>(null);const [researchId,setResearchId]=useState<string|null>(null);const [help,setHelp]=useState(false);const [search,setSearch]=useState('');const [dirty,setDirty]=useState(false);const [loaded,setLoaded]=useState(false);const [reloadKey,setReloadKey]=useState(0);
 const viewportRef=useRef<Viewport>({x:0,y:0,zoom:1});const requestRef=useRef(0);const detailRequest=useRef(0);const graphRequest=useRef(0);const undoRef=useRef<Array<{nodes:NNode[];edges:NEdge[];locals:Record<string,Filter[]>;dashboards:Record<string,NodeDashboard>}>>([]);const redoRef=useRef<Array<{nodes:NNode[];edges:NEdge[];locals:Record<string,Filter[]>;dashboards:Record<string,NodeDashboard>}>>([]);const initializedRef=useRef(false);
 const localKey='nxt-v2-layout:'+userId;
 const say=useCallback((s:string)=>{setToast(s);},[]);
 const canModify=isEditing(role)&&(!activeWorkspace||activeWorkspace.owner_id===userId||role==='admin');
 useEffect(()=>{if(!canModify)setEditMode(false)},[canModify]);
 const allowedFields=useMemo(()=>catalog.filter(c=>c.enabled&&FIELDS.includes(c.field_key)).map(c=>c.field_key),[catalog]);
 const fieldNames=useMemo(()=>({...FIELD_LABELS,...Object.fromEntries(catalog.map(c=>[c.field_key,c.display_name]))}) as Record<FieldKey,string>,[catalog]);
 const currentDashboard=useMemo(()=>{
  if(dashboards[selectedId])return dashboards[selectedId];
  const a=nodes.find(n=>n.id===selectedId)?.data.analysis;
  if(a?.kind==='note')return {question:'Finding Document',widgets:[]} as NodeDashboard;
  if(a?.kind==='root'&&!a.metricId)
   return {question:'Ausgangspunkt – wähle erst eine KPI und füge danach Dashboard-Widgets hinzu.',widgets:[]} as NodeDashboard;
  return defaultDashboardRef.current[selectedId]??=standardDashboard();
 },[dashboards,selectedId,nodes]);
 const updateDashboard=(next:NodeDashboard)=>{if(!canModify)return;const n=nodes.find(x=>x.id===selectedId);if(n?.data.analysis.canvasWidgetId&&!next.widgets.some(w=>w.id===n.data.analysis.canvasWidgetId)){setNodes(ns=>changeContainerSettings(ns,selectedId,{canvasWidgetId:undefined,canvasWidgetType:undefined,visualization:'kpi'}));say('Canvas-Verknüpfung entfernt; die KPI-Ansicht bleibt erhalten.');}setDashboards(old=>({...old,[selectedId]:next}));setDirty(true);};
 const reloadWorkspaces=useCallback(async()=>{try{setWorkspaces(await workspacesApi.list())}catch(e){say(e instanceof Error?e.message:'Workspace-Abfrage fehlgeschlagen')}},[say]);
 const reloadCatalog=useCallback(async()=>{try{setCatalog(await workspacesApi.catalog())}catch(e){say(e instanceof Error?e.message:'Filterkatalog nicht verfügbar')}},[say]);
 const reloadCandidates=useCallback(async()=>{try{setCandidates(await workspacesApi.candidates())}catch(e){say(e instanceof Error?e.message:'Filterkandidaten nicht verfügbar')}},[say]);
 useEffect(()=>{void reloadWorkspaces();void reloadCatalog();void reloadCandidates()},[userId,reloadWorkspaces,reloadCatalog,reloadCandidates]);
 useEffect(()=>{if(toast){const t=setTimeout(()=>setToast(''),4200);return()=>clearTimeout(t)}},[toast]);
 const handleSetView=(next:View)=>{setView(next);if(next==='builder')setEditMode(canModify);if(next==='tree'||next==='analytics')setRightVisible(false)};
 const graphFilterKey=JSON.stringify({nodes:nodes.map(n=>{const {cardWidth,cardHeight,containerWidth,containerHeight,...analysis}=n.data.analysis;return analysis}),edges:edges.map(e=>({source:e.source,target:e.target,kind:e.data?.kind}))});
 const topology=useMemo(()=>JSON.parse(graphFilterKey) as {nodes:AnalysisNode[];edges:Array<{source:string;target:string;kind?:string}>},[graphFilterKey]);
 const analysisNodes=topology.nodes;
 const runtimeLocals=useMemo(()=>{try{return combineLocals(locals,canvasCross)}catch{return locals}},[locals,canvasCross]);
 useEffect(()=>{setCanvasCross({})},[activeWorkspace?.id,globals,locals,graphFilterKey]);
 const selectedNode=nodes.find(n=>n.id===selectedId);
 // Restored/new local workspaces use generated root IDs rather than ROOT_ID.
 useEffect(()=>{if(!loaded)return;const next=resolveAssistantNodeId(nodes,selectedId);if(next&&next!==selectedId)setSelectedId(next);},[loaded,nodes,selectedId]);
 const effective=useCallback((id=selectedId)=>effectiveFilters(globals,analysisNodes,runtimeLocals,id,topology.edges),[globals,analysisNodes,runtimeLocals,selectedId,topology.edges]);
 const snapshot=useCallback(()=>({nodes:structuredClone(nodes),edges:structuredClone(edges),locals:structuredClone(locals),dashboards:structuredClone(dashboards)}),[nodes,edges,locals,dashboards]);
 const remember=useCallback(()=>{undoRef.current=[...undoRef.current.slice(-29),snapshot()];redoRef.current=[];setDirty(true)},[snapshot]);
 const undo=useCallback(()=>{if(!canModify)return;const prev=undoRef.current.pop();if(!prev)return;redoRef.current.push(snapshot());setNodes(prev.nodes);setEdges(prev.edges);setLocals(prev.locals);setDashboards(prev.dashboards);setSelectedId(id=>prev.nodes.some(n=>n.id===id)?id:prev.nodes[0]?.id||ROOT_ID);setDirty(true)},[setNodes,setEdges,snapshot,canModify]);
 const redo=useCallback(()=>{if(!canModify)return;const prev=redoRef.current.pop();if(!prev)return;undoRef.current.push(snapshot());setNodes(prev.nodes);setEdges(prev.edges);setLocals(prev.locals);setDashboards(prev.dashboards);setSelectedId(id=>prev.nodes.some(n=>n.id===id)?id:prev.nodes[0]?.id||ROOT_ID);setDirty(true)},[setNodes,setEdges,snapshot,canModify]);
 const onNodeChanges=useCallback((changes:NodeChange<NNode>[])=>{if(editMode&&!canModify)return;onNodesChange(changes);if(editMode&&canModify&&changes.some(c=>c.type==='position'))setDirty(true)},[onNodesChange,editMode,canModify]);
 const onEdgeChanges=useCallback((changes:EdgeChange<NEdge>[])=>{if(!editMode||!canModify)return;onEdgesChange(changes);setDirty(true)},[onEdgesChange,editMode,canModify]);
 const connect=useCallback((c:Connection,mode:'filter'|'annotation'='filter')=>{if(!editMode||!canModify||!c.source||!c.target)return;if(mode==='annotation'){if(!isValidAnnotation(c.source,c.target,edges,nodes)){say('Referenz ungültig oder bereits vorhanden.');return;}remember();setEdges(e=>[...e,annotationEdge(c.source!,c.target!)]);say('Referenz hinzugefügt · keine Filtervererbung.');return;}if(!isValidReference(c.source,c.target,edges,nodes)){say('Verbindung ungültig, bereits vorhanden oder führt zu einem Filterkreis.');return;}
  remember();setEdges(e=>[...e,referenceEdge(c.source!,c.target!)]);say('Filterfluss verbunden: Alle Filter des Ursprungsknotens gelten nun auch im Ziel und dessen Nachfolgern.');},[edges,nodes,editMode,canModify,remember,setEdges,say]);
 useEffect(()=>{undoRef.current=[];redoRef.current=[]},[activeWorkspace?.id]);
 const buildDocument=()=>makeDocument(serializeDraft(nodes,edges,locals,viewportRef.current),globals,dashboards,metricNames);
 const createWorkspace=async(title:string):Promise<boolean>=>{
  if(!isEditing(role))return false;
  if(dirty&&!confirm('Aktuelle Änderungen sind noch nicht gespeichert. Wirklich einen neuen, leeren Workspace öffnen?'))return false;
  setSaving(true);
  try{
   const base=createBlankWorkspaceGraph();
   const viewport={x:0,y:0,zoom:1};
   const document=makeDocument(serializeDraft(base.nodes,base.edges,{},viewport),[],{},{});
   const ws=await workspacesApi.create(userId,document,title);
   setNodes(base.nodes);setEdges([]);setGlobals([]);setLocals({});
   setDashboards({});setMetricNames({});defaultDashboardRef.current={};
   setSelectedId(base.nodes[0].id);setSelectedTab('Übersicht');
   viewportRef.current=viewport;
   setActiveWorkspace(ws);setWorkspaces(prev=>[ws,...prev]);
   localStorage.setItem(localKey,JSON.stringify(document));
   initializedRef.current=true;setLoaded(true);setDirty(false);
   window.setTimeout(()=>void flow.fitView({duration:280,padding:.45}),80);
   say('Neuer privater Workspace: ein unkonfigurierter Ausgangsknoten, keine Unterpunkte.');
   return true;
  }catch(e){say(e instanceof Error?e.message:'Workspace konnte nicht erstellt werden');return false;}
  finally{setSaving(false)}
 };
 const saveDraft=async()=>{if(!canModify){say('Keine Berechtigung zum Speichern dieses Workspaces');return;}setSaving(true);
  try{const document=buildDocument();localStorage.setItem(localKey,JSON.stringify(document.graph));
   if(!activeWorkspace){const ws=await workspacesApi.create(userId,document,'Meine Analyse');setActiveWorkspace(ws);setWorkspaces(prev=>[ws,...prev]);}
   else{const saved=await workspacesApi.save(activeWorkspace,document);setActiveWorkspace(saved);setWorkspaces(prev=>prev.map(w=>w.id===saved.id?saved:w));}
   setDirty(false);say('Workspace mit allen Knoten und Dashboards in Supabase gespeichert');
  }catch(e){say(e instanceof Error?e.message:'Speichern fehlgeschlagen')}finally{setSaving(false)};
 };
 const selectWorkspace=async(id:string)=>{
  if(dirty&&!confirm('Es gibt ungespeicherte Änderungen. Workspace trotzdem wechseln?'))return false;
  if(id==='local'){setActiveWorkspace(null);setCanvasCross({});defaultDashboardRef.current={};setDirty(false);say('Lokale Kopie aktiviert; bisherige Ansicht bleibt erhalten');return true;}
  const ws=workspaces.find(w=>w.id===id);if(!ws)return false;
  const data=validDocument(ws.document);if(!data){say('Gespeicherte Workspace-Daten sind ungültig');return false;}
  try{const graph=restoreDraft(data.graph);setNodes(graph.nodes);setEdges(graph.edges);setGlobals(validateFilters(data.globalFilters));setLocals(data.graph.localFilters||{});setDashboards(data.dashboards);setMetricNames(data.metricNames||{});setSelectedId(graph.nodes.find(n=>n.id===ROOT_ID)?.id||graph.nodes[0]?.id||ROOT_ID);setActiveWorkspace(ws);setDirty(false);initializedRef.current=true;setLoaded(true);viewportRef.current=data.graph.viewport;
   window.setTimeout(()=>void flow.setViewport(data.graph.viewport,{duration:280}),100);say('Workspace geladen: '+ws.title);return true;
  }catch(e){say(e instanceof Error?e.message:'Laden fehlgeschlagen');return false}
 };
 const toggleShare=async()=>{if(!activeWorkspace||!canModify)return;
  if(dirty){say('Bitte zuerst Änderungen speichern, bevor du den Workspace freigibst.');return;}  const publishing=activeWorkspace.status!=='published'||activeWorkspace.visibility!=='team';
  if(publishing&&!confirm('Diesen Workspace für alle Mitglieder des NXT Analytics-Projekts sichtbar machen?'))return;
  setSaving(true);try{const saved=await workspacesApi.updateMetadata(activeWorkspace,publishing?{status:'published',visibility:'team'}:{status:'draft',visibility:'private'});setActiveWorkspace(saved);setWorkspaces(prev=>prev.map(w=>w.id===saved.id?saved:w));say(publishing?'Workspace für das Team veröffentlicht':'Workspace wieder privat gestellt');}catch(e){say(e instanceof Error?e.message:'Freigabe fehlgeschlagen')}finally{setSaving(false)}
 };
 const deleteWorkspace=async(id:string):Promise<void>=>{
  const ws=workspaces.find(x=>x.id===id);
  if(!ws||!(isEditing(role)&&(ws.owner_id===userId||role==='admin')))throw Error('Keine Löschberechtigung.');
  setSaving(true);
  try{
   await workspacesApi.remove(id,ws.revision);
   setWorkspaces(prev=>prev.filter(w=>w.id!==id));
   if(activeWorkspace?.id===id){
    const base=createBlankWorkspaceGraph();
    setActiveWorkspace(null);setNodes(base.nodes);setEdges([]);setGlobals([]);
    setLocals({});setDashboards({});setMetricNames({});defaultDashboardRef.current={};
    setSelectedId(base.nodes[0].id);setDirty(false);setLoaded(true);
    localStorage.removeItem(localKey);
   }
   say('Workspace "'+ws.title+'" wurde gelöscht. WoodCorp-Daten bleiben erhalten.');
  }finally{setSaving(false)}
 };
 const removeWorkspace=async()=>{
  if(!activeWorkspace||!canModify)return;
  if(!confirm('Workspace "'+activeWorkspace.title+'" unwiderruflich löschen?'))return;
  try{await deleteWorkspace(activeWorkspace.id)}catch(e){say(e instanceof Error?e.message:'Löschen fehlgeschlagen')}
 };
 const toggleCatalog=async(field:FieldKey,enabled:boolean)=>{
  if(role!=='admin')return;
  try{const saved=await workspacesApi.updateCatalog(field,enabled);setCatalog(rows=>rows.map(r=>r.field_key===field?saved:r));say('Filterfreigabe aktualisiert');}catch(e){say(e instanceof Error?e.message:'Änderung nicht gespeichert')}
 };
 const addCatalogField=async(field:FieldKey,name:string)=>{
  if(role!=='admin')throw Error('Administratorrechte erforderlich');
  setCatalogBusy(true);try{
   await workspacesApi.registerFilter(field,name);
   await Promise.all([reloadCatalog(),reloadCandidates()]);
   say('Filter validiert und zur Bibliothek hinzugefügt: '+name);
  }finally{setCatalogBusy(false)}
 };
 const renameCatalogField=async(field:FieldKey,name:string)=>{
  if(role!=='admin')throw Error('Administratorrechte erforderlich');
  setCatalogBusy(true);try{
   await workspacesApi.renameFilter(field,name);
   await reloadCatalog();say('Filterbezeichnung geändert: '+name);
  }finally{setCatalogBusy(false)}
 };
 const renameSelectedNode=(name:string)=>{
  if(!canModify)return;
  if(name.trim().length<2||name.trim().length>100){say('Name muss 2–100 Zeichen umfassen.');return;}
  remember();
  setNodes(prev=>prev.map(n=>n.id===selectedId?{...n,data:{...n.data,analysis:{...n.data.analysis,label:name.trim()}}}:n));
  setDirty(true);say('Knoten umbenannt. Änderungen im Workspace speichern.');
 };
 const resetCamera=()=>{void flow.fitView({padding:.17,duration:250})};
 const resetDraft=()=>{if(!confirm('Lokalen Entwurf verwerfen und OTIF-Ausgangsknoten neu laden? Eine gespeicherte Server-Version bleibt erhalten.'))return;localStorage.removeItem(localKey);setActiveWorkspace(null);setDashboards({});setMetricNames({});initializedRef.current=false;setLocals({});setGlobals([]);setLoaded(false);setReloadKey(i=>i+1);say('Lokaler Entwurf zurückgesetzt')};
 const addNode=useCallback((type:PaletteType,position:{x:number;y:number})=>{if(!editMode||!canModify){say('Zum Hinzufügen zuerst den Bearbeitungsmodus mit Schreibrechten aktivieren.');return;}
  if(type==='connector'){say('Connector: Ziehe einen Verbindungspunkt an einem Knoten zu einem anderen Verbindungspunkt.');return;}
  if(nodes.length>=300){say('Maximal 300 Canvas-Elemente.');return;}
  const widgetType=type.startsWith('widget:')?type.slice(7) as WidgetType:null;
  if(widgetType&&!WIDGET_TYPES.includes(widgetType)){say('Elementtyp nicht verfügbar');return;}
  const widget=widgetType?freshWidget(widgetType):null;
  remember();const label=widget?widget.title:type==='container'?'Neuer Analysecontainer':type==='root'?'Neuer Ausgangsknoten':type==='metric'?'Neue KPI':type==='note'?'Neue Anmerkung':type==='condition'?'Neuer Filterknoten':type==='donut'?'Donut · On-Time':type==='bar'?'Balken · Segmentvergleich':type==='line'?'Zeitreihe · On-Time':type==='calculation'?'Vertragsstrafe · 0,75 €/kg':type==='process_interval'?'E02 · Prozessintervall':
  ({stacked:'OTIF-Klassen',stacked100:'OTIF 100%-Vergleich',heatmap:'OTIF-Heatmap',pareto:'Strafkosten-Pareto',scatter:'OTIF-Streudiagramm',waterfall:'Kosten-Wasserfall',histogram:'Mengenänderungen-Verteilung',treemap:'Kosten-Treemap',funnel:'OTIF-Funnel'} as Record<string,string>)[type]||'Neue Aufgliederung';
  const analysis:AnalysisNode={id:'user:'+crypto.randomUUID(),parentId:null,label,kind:type==='container'?'container':type==='root'?'root':type==='metric'?'metric':type==='note'?'note':type==='condition'?'condition':'segment',metricId:type==='root'||type==='container'?undefined:'otifRate',createdBy:'user',description:type==='note'?'Anmerkung':undefined,visualization:({donut:'donut',bar:'bar',line:'line',calculation:'calculation',stacked:'stacked',stacked100:'stacked100',heatmap:'heatmap',pareto:'pareto',scatter:'scatter',waterfall:'waterfall',histogram:'histogram',treemap:'treemap',funnel:'funnel',process_interval:'process_interval'} as Record<string,AnalysisNode['visualization']>)[type]||'kpi',intervalKey:type==='process_interval'?'order_to_production':undefined,chartDimension:'factory',calculationTemplate:'total_penalty_eur'};
  if(widget){Object.assign(analysis,{kind:'metric',canvasWidgetId:widget.id,canvasWidgetType:widget.type,metricId:widget.metric||'otifRate',visualization:widget.type==='kpi'?'kpi':'bar'});setDashboards(ds=>({...ds,[analysis.id]:{question:'',widgets:[widget]}}));}
  setNodes(ns=>{
   if(type==='container')return [...ns,nodeFor(analysis,position)];
   const group=containerAt(ns,position);
   if(group){
    try{return moveIntoContainer([...ns,nodeFor(analysis,position)],edges,analysis.id,group.id,position)}
    catch(e){say(e instanceof Error?e.message:'Container ungültig');return [...ns,nodeFor(analysis,position)]}
   }
   const next=freeCanvasPosition(ns,position,cardDimensions(analysis));
   return [...ns,nodeFor(analysis,next)];
  });setSelectedId(analysis.id);say('Knoten hinzugefügt. Einstellungen über das Zahnrad am Knoten konfigurieren.');
 },[editMode,canModify,remember,setNodes,say,edges,nodes.length]);
 const finishDrag=(node:NNode)=>{
  if(!editMode||!canModify)return;
  const current=nodes.find(n=>n.id===node.id);if(!current)return;
  const moved=nodes.map(n=>n.id===node.id?{...n,position:node.position}:n);
  if(current.data.analysis.kind==='container'){setNodes(moved);setDirty(true);return}
  const absolute=worldPosition({...current,position:node.position},moved);
  const point={x:absolute.x+60,y:absolute.y+40};
  const target=containerAt(moved,point,node.id);
  try{
   if(target||current.data.analysis.containerId){
    const next=moveIntoContainer(moved,edges,node.id,target?.id,absolute);setNodes(next);
    if(target?.id!==current.data.analysis.containerId)say(target?'Block in Container aufgenommen. Gemeinsame Filter werden vererbt.':'Block aus Container gelöst. Eigene Pfeile und Filter bleiben erhalten.');
   }else setNodes(moved);
   setDirty(true);
  }catch(e){
   const previous=undoRef.current[undoRef.current.length-1];
   if(previous)setNodes(previous.nodes);
   say(e instanceof Error?e.message:'Gruppierung nicht möglich');
  }
 };
 const toggleContainer=(id:string)=>{
  if(!editMode||!canModify)return;
  const group=nodes.find(n=>n.id===id&&n.data.analysis.kind==='container');if(!group)return;
  remember();setNodes(ns=>changeContainerSettings(ns,id,{containerCollapsed:!group.data.analysis.containerCollapsed}));
  if(!group.data.analysis.containerCollapsed&&nodes.some(n=>n.id===selectedId&&n.data.analysis.containerId===id))setSelectedId(id);
 };
 const removeNode=(id:string)=>{const n=nodes.find(n=>n.id===id);if(!editMode||!canModify||!n)return;if(!confirm(n.data.analysis.kind==='container'?'Container auflösen? Die enthaltenen Elemente bleiben an ihrer Position; die gemeinsamen Containerfilter und -verbindungen entfallen.':'Knoten und seine Verbindungen entfernen?'))return;remember();setNodes(ns=>n.data.analysis.kind==='container'?removeContainer(ns,id):ns.filter(n=>n.id!==id));setEdges(es=>es.filter(e=>e.source!==id&&e.target!==id));setDashboards(ds=>Object.fromEntries(Object.entries(ds).filter(([key])=>key!==id)));setLocals(ls=>Object.fromEntries(Object.entries(ls).filter(([key])=>key!==id)));if(selectedId===id)setSelectedId(nodes.find(n=>n.id!==id)?.id||ROOT_ID);say('Knoten entfernt');};
 const applyFilter=(f:Filter)=>{if(canModify)setDirty(true);if(dialog?.kind==='global'){setGlobals(gs=>{try{return validateFilters([...gs,f])}catch(e){say((e as Error).message);return gs}})}else if(dialog?.id){setLocals(old=>{const current=old[dialog.id!]||[];try{return {...old,[dialog.id!]:validateFilters([...current,f])}}catch(e){say((e as Error).message);return old}})} };
 const removeGlobal=(id:string)=>{setGlobals(gs=>gs.filter(f=>f.id!==id));if(canModify)setDirty(true)};
 const share=async()=>{if(globals.some(f=>['cust_id','cust_name','cust_addr_code'].includes(f.field))||/:(cust_id|cust_name|cust_addr_code):/.test(selectedId)){say('Ansicht enthält Kundenkennungen. Bitte diese Filter entfernen und einen nicht personenbezogenen Knoten auswählen, bevor du den Link teilst.');return;}const data={v:1,g:globals.map(({field,op,value})=>({field,op,value})),selected:selectedId};const u=new URL(location.href);u.searchParams.set('view',btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''));try{await navigator.clipboard.writeText(u.toString());say('Link kopiert. Lokale Knotenfilter werden nicht mitgeteilt.')}catch{say('Zwischenablage nicht verfügbar. URL bitte manuell kopieren.')}};
 const triggerReload=()=>{clearAnalyticsCache();setReloadKey(v=>v+1)};
 useEffect(()=>{const query=new URLSearchParams(location.search).get('view');if(!query)return;try{const raw=JSON.parse(decodeURIComponent(escape(atob(query.replace(/-/g,'+').replace(/_/g,'/')))));if(raw.v!==1)return;const gs=validateFilters((raw.g||[]).map((f:Filter)=>({...f,id:crypto.randomUUID()})));setGlobals(gs);if(typeof raw.selected==='string')setSelectedId(raw.selected);}catch{say('Ungültiger Ansichtslink ignoriert.')}},[]);
 useEffect(()=>{analysisApi.dimensions().then(setDimensions).catch(e=>setWarning('Filterkatalog konnte nicht geladen werden: '+e.message));},[]);
 // Initialize the graph independently from network responses. A timeout cannot
 // leave the user with an empty graph or prevent the workspace from opening.
 useEffect(()=>{
  if(initializedRef.current)return;
  const base=createBlankWorkspaceGraph();
  let recovered=false;
  const saved=localStorage.getItem(localKey);
  if(saved){
   try{
    const raw=JSON.parse(saved),doc=validDocument(raw),draft=doc?.graph||cleanDraft(raw);
    if(draft){
     if(doc){setDashboards(doc.dashboards);setGlobals(doc.globalFilters);setMetricNames(doc.metricNames||{})}
     else{for(const n of draft.nodes)if(n.analysis.canvasWidgetId){n.analysis={...n.analysis,canvasWidgetId:undefined,canvasWidgetType:undefined}}}
     const graph=restoreDraft(draft);
     setNodes(graph.nodes.length?graph.nodes:base.nodes);setEdges(graph.nodes.length?graph.edges:[]);
     setSelectedId(resolveAssistantNodeId(graph.nodes.length?graph.nodes:base.nodes,ROOT_ID));
     setLocals(graph.nodes.length?(draft.localFilters||{}):{});
     viewportRef.current=draft.viewport;
     setTimeout(()=>void flow.setViewport(draft.viewport),120);
     recovered=true;
    }
   }catch{/* invalid browser draft ignored */}
  }
  if(!recovered){setNodes(base.nodes);setEdges(base.edges);setSelectedId(base.nodes[0].id);}
  initializedRef.current=true;setLoaded(true);
 },[localKey]);
 useEffect(()=>{
  const run=++requestRef.current;
  setBusy(true);setWarning('');
  // Load the KPI first; a timed-out trend must never invalidate valid KPIs.
  const fetchAll=async()=>{
   const [metricsResult,trendResult]=await Promise.allSettled([
    analysisApi.metrics(globals),analysisApi.trend(globals)
   ]);
   if(run!==requestRef.current)return;
   if(metricsResult.status==='fulfilled'){
    const m=metricsResult.value;
    setRootMetrics(m);
    setRibbon({...m,deliveryDateCount:m.dateCoverage??0} as Ribbon);
   }else{
    setWarning('KPI-Abfrage nicht verfügbar: '+String(metricsResult.reason instanceof Error?metricsResult.reason.message:metricsResult.reason));
   }
   if(trendResult.status==='fulfilled')setRibbonTrend(trendResult.value);
   else setRibbonTrend([]);
   setBusy(false);
  };
  void fetchAll();
  return()=>{requestRef.current++};
 },[globals,reloadKey]);
 useEffect(()=>{
  if(!initializedRef.current||!loaded)return;
  if(!rightVisible&&!fullDashboard&&view!=='builder')return;
  const selected=topology.nodes.find(n=>n.id===selectedId);
  if(selected?.kind==='note'||(selected?.kind==='root'&&!selected.metricId&&!dashboards[selectedId]?.widgets.length)){
   setDetail({...emptyDetail,pending:false,error:null});return;
  }
  let filt:Filter[];
  try{filt=effective(selectedId)}
  catch(e){setDetail({...emptyDetail,error:e instanceof Error?e.message:'Ungültiger Analysezweig'});return}
  const idx=++detailRequest.current;
  setDetail({...emptyDetail,pending:true,error:null});
  const load=async()=>{
   const [metricsResult,trendResult,breakdownResult]=await Promise.allSettled([
    analysisApi.metrics(filt),analysisApi.trend(filt),analysisApi.breakdown('delivery_company',filt)
   ]);
   if(idx!==detailRequest.current)return;
   const metrics=metricsResult.status==='fulfilled'?metricsResult.value:null;
   const trend=trendResult.status==='fulfilled'?trendResult.value:[];
   const breakdown=breakdownResult.status==='fulfilled'?breakdownResult.value:[];
   const error=metricsResult.status==='rejected'
    ?String(metricsResult.reason instanceof Error?metricsResult.reason.message:metricsResult.reason):null;
   const ribbon=metrics?{...metrics,deliveryDateCount:metrics.dateCoverage??0} as Ribbon:null;
   setDetail({metrics,trend,breakdown,ribbon,pending:false,error});
   if(metrics)setNodes(ns=>ns.map(n=>n.id===selectedId?{...n,data:{...n.data,orders:metrics.orders,onTimeRate:metrics.onTimeRate}}:n));
  };
  void load();
  return()=>{detailRequest.current++};
 },[selectedId,globals,runtimeLocals,loaded,graphFilterKey,!!dashboards[selectedId]?.widgets.length,rightVisible,fullDashboard,view,reloadKey]);
 const saveNodeSettings=(id:string,patch:Partial<AnalysisNode>,sourceId?:string)=>{
  if(!canModify)return;
  const current=nodes.find(n=>n.id===id);if(!current)return;
  let next=nodes;
  if(current.data.analysis.kind!=='container'&&Object.prototype.hasOwnProperty.call(patch,'containerId')&&patch.containerId!==current.data.analysis.containerId)next=moveIntoContainer(next,edges,id,patch.containerId);
  if(current.data.analysis.kind==='note'&&sourceId!==undefined)patch={...patch,finding:sourceId?findingStamp(sourceId,next,edges,globals,locals):undefined};
  next=changeContainerSettings(next,id,patch);
  remember();setNodes(next);
  setDirty(true);say('Knoten aktualisiert; Filter und Diagramm werden neu berechnet.');
 };
 // Visible cards use the same inherited predicates as detail dashboards.
 // A stable semantic key prevents metric updates from starting new requests.
 useEffect(()=>{
  if(!loaded)return;
  const run=++graphRequest.current;
  const ordinary=topology.nodes.filter(a=>a.kind!=='note'&&a.kind!=='container');
  setNodes(old=>old.map(n=>n.data.analysis.kind==='note'||n.data.analysis.kind==='container'?n:{...n,data:{...n.data,busy:true,error:undefined}}));
  const metricPromises=new Map<string,ReturnType<typeof analysisApi.metrics>>();
  const breakdownPromises=new Map<string,ReturnType<typeof analysisApi.breakdown>>();
  const trendPromises=new Map<string,ReturnType<typeof analysisApi.trend>>();
  const calculations=new Map<string,ReturnType<typeof analysisApi.calculated>>();
  const processPromises=new Map<string,ReturnType<typeof analysisApi.e02Summary>>();
  const update=(id:string,patch:Partial<NNode['data']>)=>{
   if(run!==graphRequest.current)return;
   setNodes(old=>old.map(n=>n.id===id?{...n,data:{...n.data,...patch,busy:false}}:n));
  };
  const tasks=ordinary.map(a=>async()=>{
   try{
    if(a.kind==='root'&&!a.metricId){
     update(a.id,{orders:null,onTimeRate:null,primaryValue:null,primaryLabel:'KPI auswählen',error:undefined,filterSummary:'Unkonfigurierter Ausgangsknoten'});
     return;
    }
    const filters=effectiveFilters(globals,topology.nodes,runtimeLocals,a.id,topology.edges);
    const contradictions=conflictingFields(filters);
    if(contradictions.length){
     update(a.id,{orders:0,onTimeRate:null,chartRows:[],trendRows:[],calculation:undefined,error:'Keine passenden Aufträge: widersprüchliche Filter ('+contradictions.map(f=>fieldNames[f]).join(', ')+').',filterSummary:'Filterkonflikt'});
     return;
    }
    const key=filterSignature(filters);
    let promise=metricPromises.get(key);
    if(!promise){promise=analysisApi.metrics(filters);metricPromises.set(key,promise)}
    const metrics=await promise;
    if(run!==graphRequest.current)return;
    const viz=a.visualization||'kpi';
    const chosen=(a.metricId==='otd'?'onTimeRate':a.metricId&&Object.prototype.hasOwnProperty.call(METRIC_LABELS,a.metricId)?a.metricId:'otifRate') as MetricKey;
    const patch:Partial<NNode['data']>={orders:metrics.orders,onTimeRate:metrics.onTimeRate,fullMetrics:metrics,appliedFilters:filters,primaryValue:metricValue(chosen,metrics,null),primaryLabel:METRIC_LABELS[chosen],filterSummary:filters.map(f=>formatFilter(f,fieldNames)).join(' · '),error:undefined,chartRows:undefined,calculation:undefined};
    if(a.canvasWidgetId){/* Shared widgets lazily request the data they render. */}
    else if(viz==='process_interval'){
      let request=processPromises.get(key);
      if(!request){request=analysisApi.e02Summary(filters);processPromises.set(key,request)}
      const summary=await request;
      patch.processInterval=summary.intervals.find(r=>r.key===(a.intervalKey||'order_to_production'))||null;
    }else if(viz==='line'){
      let lookup=trendPromises.get(key);
      if(!lookup){lookup=analysisApi.trend(filters);trendPromises.set(key,lookup)}
      patch.trendRows=await lookup;
    }else if(viz==='calculation'){
      const template=a.calculationTemplate||'shortfall_kg';
      const calcKey=key+':'+template+':'+(a.rateEurPerKg??'');
      let lookup=calculations.get(calcKey);
      if(!lookup){lookup=analysisApi.calculated(template,filters,a.rateEurPerKg);calculations.set(calcKey,lookup)}
      patch.calculation=await lookup;
    }
    update(a.id,patch);
   }catch(e){update(a.id,{error:e instanceof Error?e.message:'Knotendaten konnten nicht geladen werden'});}
  });
  let next=0;
  const worker=async()=>{while(next<tasks.length&&run===graphRequest.current){const at=next++;await tasks[at]()}}
  void Promise.all(Array.from({length:Math.min(2,tasks.length)},()=>worker()));
  return()=>{graphRequest.current++};
 },[graphFilterKey,globals,runtimeLocals,loaded,reloadKey]);
 const split=async(id:string,field:FieldKey)=>{const f=effective(id);const rows=await analysisApi.breakdown(field,f);if(!rows.length)throw Error('Keine Teilgruppen für diese Filter verfügbar');
  remember();const next=splitGraph(nodes,edges,id,field,rows);setNodes(next.nodes);setEdges(next.edges);say(rows.length+' Teilgruppen geladen');};
 const pageSearch=(term:string)=>{setSearch(term);if(term.trim().length<2)return;const item=nodes.find(n=>n.data.analysis.label.toLowerCase().includes(term.toLowerCase()));if(item){setSelectedId(item.id);setView('analytics');void flow.fitView({nodes:[{id:item.id}],duration:250,padding:.6});}};
 const assistantDashboards=useMemo(()=>({...dashboards,...(selectedNode?{[selectedId]:currentDashboard}:{})}),[dashboards,selectedId,currentDashboard,selectedNode?.id]);
 const assistantState:AssistantState={nodes,edges,globals,locals,dashboards:assistantDashboards,selectedId:resolveAssistantNodeId(nodes,selectedId),allowedFields};
 const assistantStamp=assistantFingerprint(assistantState,activeWorkspace?.id||null,activeWorkspace?.revision??null);
 const applyAi=(plan:AiPlan,stamp:string)=>{
  if(!canModify||saving||!loaded)throw Error('Keine Schreibberechtigung oder Workspace wird gerade gespeichert.');
  if(Object.values(canvasCross).some(fs=>fs.length))throw Error('Bitte temporäre Canvas-Filter zuerst zurücksetzen. KI-Änderungen verwenden den gespeicherten Filterkontext.');
  if(stamp!==assistantStamp)throw Error('Workspace wurde verändert. Bitte Vorschlag neu erstellen.');
  const next=applyAssistantPlan(assistantState,plan);remember();setNodes(next.nodes);setEdges(next.edges);setLocals(next.locals);setDashboards(next.dashboards);setDirty(true);setSelectedId(next.selectedId);setRightVisible(false);setView('analytics');setFullDashboard(false);say('KI-Vorschlag übernommen. Im Workspace speichern, um Änderungen dauerhaft zu sichern.');
  if(next.nodes.length>nodes.length||next.nodes.some(n=>{const old=nodes.find(o=>o.id===n.id);return old&&(old.position.x!==n.position.x||old.position.y!==n.position.y||old.data.analysis.containerWidth!==n.data.analysis.containerWidth||old.data.analysis.containerHeight!==n.data.analysis.containerHeight)}))requestAnimationFrame(()=>void flow.fitView({duration:300,padding:.2}));
 };
 const branchFilter=(nodeId:string,field:FieldKey,value:string)=>{if(!canModify||!allowedFields.includes(field))return;try{if(!nodes.some(n=>n.id===nodeId))throw Error('Knoten fehlt.');const existing=effective(nodeId);if(existing.some(f=>f.field===field&&f.op==='eq'&&f.value===value)){say('Dieser Filter gilt bereits.');return;}const f=makeFilter(field,value,'local'),next=validateFilters([...existing,f]);if(conflictingFields(next).length)throw Error('Auswahl widerspricht vorhandenen Filtern.');const local=validateFilters([...(locals[nodeId]||[]),f]);remember();setLocals(old=>({...old,[nodeId]:local}));say('Zweigfilter angewendet · gilt auch für analytische Nachfolger.');}catch(e){say(e instanceof Error?e.message:'Zweigfilter fehlgeschlagen');}};
 const areaFilter=(nodeId:string,field:FieldKey,value:string)=>{try{if(!allowedFields.includes(field))throw Error('Filter nicht freigegeben');const source=nodes.find(n=>n.id===nodeId);if(!source)throw Error('Knoten fehlt');const target=source.data.analysis.containerId||nodeId,base=effectiveFilters(globals,analysisNodes,locals,target,topology.edges),next=appendChartFilter(base,canvasCross[target]||[],field,value);const proposed={...canvasCross,[target]:next};combineLocals(locals,proposed);setCanvasCross(proposed);say('Temporärer Analysebereich-Filter gesetzt. Wird nicht gespeichert.');}catch(e){say(e instanceof Error?e.message:'Auswahl ungültig')}};
 const createBranchFromSegment=(nodeId:string,field:FieldKey,value:string)=>{if(!canModify||!allowedFields.includes(field))return;try{const source=nodes.find(n=>n.id===nodeId);if(!source||nodes.length>=300||edges.length>=400)throw Error('Knoten- oder Kantenlimit erreicht');const base=effectiveFilters(globals,analysisNodes,locals,nodeId,topology.edges),current=effective(nodeId),sig=(f:Filter)=>JSON.stringify([f.field,f.op,f.value]),known=new Set(base.map(sig));const own:Filter[]=current.filter(f=>!known.has(sig(f))).map(f=>({...f,id:crypto.randomUUID(),scope:'local' as const}));const f=makeFilter(field,value,'local');if(![...base,...own].some(x=>sig(x)===sig(f)))own.push(f);const combined=validateFilters([...base,...own]);if(conflictingFields(combined).length)throw Error('Auswahl widerspricht bestehenden Filtern');const id='user:'+crypto.randomUUID(),label=['cust_id','cust_name','cust_addr_code'].includes(field)?'Kundendetail · '+fieldNames[field]:fieldNames[field]+' · '+value;const widget={...freshWidget('kpi'),title:label.slice(0,100)};const a:AnalysisNode={id,label:widget.title,kind:'metric',parentId:null,createdBy:'user',metricId:'otifRate',canvasWidgetId:widget.id,canvasWidgetType:widget.type,visualization:'kpi'};const pos=worldPosition(source,nodes),size=nodeLayoutSize(source),p=freeCanvasPosition(nodes,{x:pos.x,y:pos.y+size.height+70},cardDimensions(a));remember();setNodes(ns=>[...ns,nodeFor(a,p)]);setEdges(es=>[...es,referenceEdge(nodeId,id)]);setLocals(ls=>({...ls,[id]:validateFilters(own)}));setDashboards(ds=>({...ds,[id]:{question:'Wie unterscheidet sich dieses Segment?',widgets:[widget]}}));setSelectedId(id);setCanvasCross({});say('Neuer Analysezweig mit explizitem Filterkontext erstellt.');}catch(e){say(e instanceof Error?e.message:'Zweig konnte nicht erstellt werden')}};
 const saveCanvasWidget=(nodeId:string,widget:DashboardWidget,containerId?:string)=>{if(!canModify)return;const n=nodes.find(x=>x.id===nodeId);if(!n)throw Error('Knoten fehlt');const previous=dashboards[nodeId]||{question:'',widgets:[]};const next={...previous,widgets:previous.widgets.some(w=>w.id===widget.id)?previous.widgets.map(w=>w.id===widget.id?widget:w):[...previous.widgets,widget]};if(!normalizeDashboard(next))throw Error('Ungültige Widget-Konfiguration');let ns=nodes;if(n.data.analysis.containerId!==containerId)ns=moveIntoContainer(ns,edges,nodeId,containerId);ns=changeContainerSettings(ns,nodeId,{label:widget.title,canvasWidgetId:widget.id,canvasWidgetType:widget.type,metricId:widget.metric||n.data.analysis.metricId||'otifRate',cardWidth:widget.type===n.data.analysis.canvasWidgetType?n.data.analysis.cardWidth:undefined,cardHeight:widget.type===n.data.analysis.canvasWidgetType?n.data.analysis.cardHeight:undefined});remember();setNodes(ns);setDashboards(ds=>({...ds,[nodeId]:next}));setDirty(true);say('Canvas-Element aktualisiert. Workspace speichern, um die Darstellung zu sichern.');};
 const updateCanvasWidget=(nodeId:string,widgetId:string,patch:Partial<DashboardWidget>)=>{if(!canModify||!editMode)return;try{const n=nodes.find(x=>x.id===nodeId);if(!n)return;let w=canvasWidgetFor(n.data.analysis,dashboards);if(!w&&widgetId==='graph-chart:'+nodeId){const type=(n.data.analysis.visualization||'kpi') as WidgetType;if(!WIDGET_TYPES.includes(type))throw Error('Dieser Diagrammtyp kann nicht umgewandelt werden.');w={...freshWidget(type),title:n.data.analysis.label,dimension:n.data.analysis.chartDimension||'factory',metric:(n.data.analysis.chartMetric||n.data.analysis.metricId||'otifRate') as MetricKey};}if(!w)throw Error('Widget nicht mehr vorhanden');saveCanvasWidget(nodeId,{...w,...patch,id:w.id,type:w.type},n.data.analysis.containerId)}catch(e){say(e instanceof Error?e.message:'Darstellung konnte nicht gespeichert werden')}};
 const pinWidget=(id:string)=>{try{const n=nodes.find(x=>x.id===selectedId),widget=currentDashboard.widgets.find(w=>w.id===id);if(!n||!widget||n.data.analysis.kind==='note'||n.data.analysis.kind==='container')throw Error('Bitte einen regulären Analyseblock wählen.');remember();setDashboards(ds=>({...ds,[selectedId]:currentDashboard}));setNodes(ns=>changeContainerSettings(ns,selectedId,{canvasWidgetId:widget.id,canvasWidgetType:widget.type,label:widget.title,metricId:widget.metric||'otifRate',cardWidth:undefined,cardHeight:undefined}));setView('analytics');setRightVisible(false);say('Dasselbe Widget wird jetzt direkt im Canvas angezeigt.');}catch(e){say(e instanceof Error?e.message:'Element konnte nicht angeheftet werden')}};
 const resizeCard=(id:string,size:CardSize|null)=>{if(!canModify||!editMode)return;const next=resizeGraphCard(nodes,id,size);if(next===nodes)return;remember();setNodes(next);setDirty(true);};
 const applySmartLayout=(proposed:NNode[],stamp:string)=>{if(!canModify||saving)throw Error('Workspace kann gerade nicht bearbeitet werden.');if(stamp!==layoutFingerprint(nodes,edges))throw Error('Die Struktur wurde geändert. Bitte erneut prüfen.');const next=commitLayout(nodes,proposed);remember();setNodes(next);setDirty(true);say('Layout übernommen · Filter und Kennzahlen unverändert.');};
 const researchSource=researchId?nodes.find(n=>n.id===researchId):undefined;let researchFilters:Filter[]=[];let researchError='';if(researchSource){try{researchFilters=effective(researchSource.id)}catch(e){researchError=e instanceof Error?e.message:'Filterpfad ungültig';}}
 const openResearch=(id:string)=>{const source=nodes.find(n=>n.id===id);if(!source||source.data.analysis.kind==='note'){say('Bitte einen regulären Analyseblock auswählen.');return;}setSelectedId(id);setResearchId(id);};
 const pinResearch=(spec:ResearchSpec)=>{if(!canModify||!researchSource||!validResearchSpec(spec))return;try{if(Object.values(canvasCross).some(fs=>fs.length))throw Error('Bitte temporäre Canvas-Filter vor dem Speichern zurücksetzen.');if(nodes.length>=300||edges.length>=400)throw Error('Knoten- oder Kantenlimit erreicht.');if(conflictingFields(researchFilters).length)throw Error('Filterkonflikt zuerst auflösen.');const id='user:'+crypto.randomUUID(),widget={...freshWidget('research'),title:RESEARCH_LABELS[spec.tab],research:spec};const a:AnalysisNode={id,parentId:null,kind:'metric',createdBy:'user',label:widget.title,visualization:'bar',metricId:'otifRate',canvasWidgetId:widget.id,canvasWidgetType:widget.type};const pos=worldPosition(researchSource,nodes),p=freeCanvasPosition(nodes,{x:pos.x,y:pos.y+nodeLayoutSize(researchSource).height+70},cardDimensions(a));remember();setNodes(ns=>[...ns,nodeFor(a,p)]);setEdges(es=>[...es,referenceEdge(researchSource.id,id)]);setDashboards(ds=>({...ds,[id]:{question:'',widgets:[widget]}}));setSelectedId(id);setResearchId(null);setEditMode(true);setDirty(true);say('Live-Analyse hinzugefügt · der Filterkontext wird vererbt. Workspace speichern.');}catch(e){say(e instanceof Error?e.message:'Analyse konnte nicht angeheftet werden')}};
 const addResearchFinding=(title:string,body:string)=>{if(!canModify||!researchSource)return;try{if(Object.values(canvasCross).some(fs=>fs.length))throw Error('Bitte temporäre Canvas-Filter vor dem Dokumentieren zurücksetzen.');if(nodes.length>=300||edges.length>=400)throw Error('Knoten- oder Kantenlimit erreicht.');const id='user:'+crypto.randomUUID(),a:AnalysisNode={id,parentId:null,kind:'note',createdBy:'user',label:title.slice(0,100),description:body.slice(0,1800),finding:findingStamp(researchSource.id,nodes,edges,globals,locals)};const pos=worldPosition(researchSource,nodes),p=freeCanvasPosition(nodes,{x:pos.x+nodeLayoutSize(researchSource).width+70,y:pos.y},cardDimensions(a));remember();setNodes(ns=>[...ns,nodeFor(a,p)]);setEdges(es=>[...es,annotationEdge(researchSource.id,id)]);setResearchId(null);setSelectedId(id);setDirty(true);say('Finding gespeichert · fachliche Interpretation bitte prüfen.');}catch(e){say(e instanceof Error?e.message:'Finding konnte nicht erstellt werden')}};
 const modeActions={nodes,edges,globals,locals:runtimeLocals,dashboards,onApplyLayout:applySmartLayout,onResearch:openResearch,onUpdateWidget:updateCanvasWidget,onAreaFilter:areaFilter,onCreateBranch:createBranchFromSegment,onOpenDetails:(id:string)=>{setSelectedId(id);setSelectedTab('Übersicht');setRightVisible(true)},onResizeCard:resizeCard,onRemoveEdge:(id:string)=>{if(!editMode||!canModify)return;remember();setEdges(es=>es.filter(e=>e.id!==id));say('Verbindung entfernt');},onNodesChange:onNodeChanges,onEdgesChange:onEdgeChanges,onConnect:connect,onSelect:setSelectedId,onSelectionClear:()=>{},selectedId,editMode,onEditToggle:()=>{if(canModify)setEditMode(v=>!v)},onFilter:(id:string)=>setDialog({kind:'node',id}),onSplit:(id:string)=>setDialog({kind:'split',id}),onRemove:removeNode,onConfigure:(id:string)=>{setSelectedId(id);setConfigureNodeId(id)},onExplain:(id:string)=>{setSelectedId(id);setRightVisible(true);setSelectedTab('Berechnungslogik')},onAdd:addNode,onSave:saveDraft,onReset:resetDraft,onGraphMove:finishDrag,onGraphStart:remember,onToggleContainer:toggleContainer,onUndo:undo,onRedo:redo,fieldNames,onViewportChange:(v:Viewport)=>{viewportRef.current=v;},fullscreen,setFullscreen,canEdit:canModify,dirty,onHelp:()=>say('Bitte Bearbeitungsmodus aktivieren. Der Dashboard Builder bleibt optional verfügbar.')};
 return <ChartAccess.Provider value={{fields:allowedFields,branchFilter:canModify?branchFilter:undefined}}><div className={'app-shell '+(collapsed?'sidebar-collapsed':'')}><Header userEmail={email} onSignOut={onSignOut} onProfile={()=>handleSetView('profile')} onSearch={pageSearch} onHelp={()=>setHelp(true)}/>
  <Sidebar view={view} onNavigate={handleSetView} collapsed={collapsed} setCollapsed={setCollapsed} role={role}/>
  <main className="app-main">
   {(['analytics','tree','builder','home'] as View[]).includes(view)?<>
    <div className="page-title-row"><div className="page-heading"><Icon name="chart-column" size={28}/><div><h1>{view==='tree'?'Decision Tree':view==='builder'?'Dashboard Builder':view==='home'?'Willkommen bei NXT Analytics':'KPI-Analyse'}</h1><p>Interaktive Ursachenanalyse mit Decision Tree · {PROJECT.years}</p></div></div><div className="top-actions"><Button icon="save" onClick={()=>void saveDraft()} disabled={!canModify||saving}>{saving?'Speichert …':'Speichern'}</Button><Button icon="share-2" onClick={share}>Teilen</Button><Button icon="layout-dashboard" onClick={()=>{setRightVisible(true);setFullDashboard(true)}}>Dashboard öffnen</Button>{canModify&&<Button icon="layout-dashboard" className="nxt-ai-entry" onClick={()=>setAiPrep(true)}>AI Dashboard Builder</Button>}{canModify&&<Button icon="type" onClick={()=>setNameDialog('node')}>Knotenname</Button>}{canModify&&<Button icon="settings" onClick={()=>setNameDialog('metrics')}>KPI-Titel</Button>}<Button kind="primary" icon="play" onClick={triggerReload} disabled={busy}>Analyse ausführen</Button></div></div>
    {warning&&<Notice kind="warning">{warning}</Notice>}
    <WorkspaceControls workspaces={workspaces} active={activeWorkspace} canEdit={canModify} role={role} saving={saving} onSelect={id=>void selectWorkspace(id)} onCreate={name=>void createWorkspace(name)} onSave={()=>void saveDraft()} onToggleShare={()=>void toggleShare()} onRemove={()=>void removeWorkspace()}/>
    <MetricRibbon ribbon={ribbon} trend={ribbonTrend} pending={busy} names={metricNames} onExplain={metric=>setLogicContext({metric,nodeId:null})}/>
    <FilterStrip globals={globals} fieldNames={fieldNames} onRemove={removeGlobal} onAdd={()=>setDialog({kind:'global'})} onReset={()=>{setGlobals([]);if(canModify)setDirty(true)}} onShare={share}/>
    {Object.values(canvasCross).some(fs=>fs.length)&&<div className="nxt-canvas-crossbar"><strong>Temporäre Analysebereich-Filter · nicht gespeichert</strong>{Object.entries(canvasCross).flatMap(([id,fs])=>fs.map(f=><button type="button" key={f.id} onClick={()=>setCanvasCross(old=>({...old,[id]:(old[id]||[]).filter(x=>x.id!==f.id)}))}>{nodes.find(n=>n.id===id)?.data.analysis.label||'Bereich'}: {formatFilter(f,fieldNames)} ×</button>))}<button type="button" onClick={()=>setCanvasCross({})}>Alle zurücksetzen</button></div>}
    {view==='builder'?<DashboardBuilder onPinWidget={pinWidget} nodeId={selectedId} nodeLabel={selectedNode?.data.analysis.label||'Knoten'} nodeOptions={nodes.filter(n=>n.data.analysis.kind!=='note').map(n=>({id:n.id,label:n.data.analysis.label}))} onSelectNode={setSelectedId} dashboard={currentDashboard} onChange={updateDashboard} detail={detail} filters={effective()} onBack={()=>handleSetView('analytics')} onSave={()=>void saveDraft()} canEdit={canModify} saving={saving} fieldNames={fieldNames} allowedFields={allowedFields}/>:
      <><div className={'workspace-row '+(!rightVisible?'no-detail':'')}><CanvasWithFlow {...modeActions}/>{rightVisible&&<DetailPanel node={selectedNode} detail={detail} tab={selectedTab} setTab={setSelectedTab} onClose={()=>setRightVisible(false)} onExpand={()=>setFullDashboard(true)} onRename={()=>setNameDialog('node')} onFilter={()=>setDialog({kind:'node',id:selectedId})} dashboard={currentDashboard} filters={effective()} fieldNames={fieldNames} filterTrace={traceFilters(globals,analysisNodes,runtimeLocals,selectedId,topology.edges)} onExplain={metric=>setLogicContext({metric,nodeId:selectedId})} onEdit={()=>handleSetView('builder')} canEdit={canModify} noteStatus={selectedNode?.data.analysis.kind==='note'?findingStatus(selectedNode.data.analysis,nodes,edges,globals,runtimeLocals):undefined} onEditNote={()=>setConfigureNodeId(selectedId)} onOpenSource={()=>{const id=selectedNode?.data.analysis.finding?.sourceId;if(id&&nodes.some(n=>n.id===id)){setSelectedId(id);setSelectedTab('Übersicht');}else say('Analysequelle nicht mehr vorhanden.');}}/>}</div>
      {!rightVisible&&<button className="detail-reopen" onClick={()=>setRightVisible(true)}><Icon name="layers" size={17}/> Detaildashboard einblenden</button>}</>}
    <div className="bottom-disclaimer">Analyse-Ansicht · Datenbasis WoodCorp {PROJECT.years} · Das Referenzdesign enthält illustrative, nicht übernommene Beispielwerte. {isEditing(role)?'Private Entwürfe können in Supabase gespeichert und für das Team freigegeben werden.':''}</div>
   </>:view==='workspaces'?<WorkspaceOverview items={workspaces} userId={userId} role={role} busy={saving} onOpen={id=>{void selectWorkspace(id).then(ok=>{if(ok)handleSetView('analytics')})}} onCreate={title=>{void createWorkspace(title).then(ok=>{if(ok)handleSetView('analytics')})}} onDelete={deleteWorkspace} onRefresh={()=>void reloadWorkspaces()}/>:
     view==='data'?<DataExplorer dimensions={dimensions}/>:
     view==='filters'?<FilterCatalogV4 rows={catalog} candidates={candidates} admin={role==='admin'} busy={catalogBusy} onRefresh={()=>{void reloadCatalog();void reloadCandidates()}} onToggle={(field,enabled)=>void toggleCatalog(field,enabled)} onRegister={addCatalogField} onRename={renameCatalogField}/>:view==='team'?<TeamPanel role={role}/>:<ProfilePage email={email} role={role}/>}
  </main>
  {dialog&&dialog.kind!=='split'&&<FilterDialog target={{kind:dialog.kind==='global'?'global':'node',id:dialog.id}} dimensions={dimensions} allowedFields={allowedFields} fieldNames={fieldNames} onApply={applyFilter} onClose={()=>setDialog(null)}/>}
  {dialog?.kind==='split'&&<SplitDialog nodeName={nodes.find(n=>n.id===dialog.id)?.data.analysis.label||'Knoten'} dimensions={dimensions} allowedFields={allowedFields} fieldNames={fieldNames} onSplit={field=>split(dialog.id!,field)} onClose={()=>setDialog(null)}/>}
  {fullDashboard&&selectedNode?.data.analysis.kind!=='note'&&<DashboardFullView key={selectedId} title={selectedNode?.data.analysis.label||'Knoten-Dashboard'} dashboard={currentDashboard} detail={detail} filters={effective()} onClose={()=>setFullDashboard(false)} onEdit={()=>{setFullDashboard(false);handleSetView('builder')}} onExplain={metric=>{setFullDashboard(false);setLogicContext({metric,nodeId:selectedId})}} canEdit={canModify}/>}
  {logicContext&&<Modal title={'Berechnungslogik · '+METRIC_LABELS[logicContext.metric]} onClose={()=>setLogicContext(null)}><CalculationLogic metric={logicContext.metric} metrics={logicContext.nodeId?detail.metrics:ribbon} trace={logicContext.nodeId?traceFilters(globals,analysisNodes,locals,logicContext.nodeId,topology.edges):globals.map(filter=>({nodeId:null,sourceLabel:'Global',filter,scope:'global' as const}))} fieldNames={fieldNames}/></Modal>}
   {nameDialog==='node'&&<RenameNodeDialog label={selectedNode?.data.analysis.label||'KPI'} onSave={renameSelectedNode} onClose={()=>setNameDialog(null)}/>}
  {nameDialog==='metrics'&&<KpiNameDialog names={metricNames} onSave={names=>{if(canModify){setMetricNames(names);setDirty(true);say('KPI-Titel aktualisiert. Im Workspace speichern.')}}} onClose={()=>setNameDialog(null)}/>}
  {configureNodeId&&nodes.find(n=>n.id===configureNodeId)&&(nodes.find(n=>n.id===configureNodeId)!.data.analysis.kind==='container'?<ContainerSettings node={nodes.find(n=>n.id===configureNodeId)!.data.analysis} fieldNames={fieldNames} filters={locals[configureNodeId]||[]} onRemoveFilter={fid=>{if(!canModify)return;setLocals(old=>({...old,[configureNodeId]:(old[configureNodeId]||[]).filter(f=>f.id!==fid)}));setDirty(true)}} onSave={patch=>saveNodeSettings(configureNodeId,patch)} onClose={()=>setConfigureNodeId(null)}/>:canvasWidgetFor(nodes.find(n=>n.id===configureNodeId)!.data.analysis,dashboards)?<CanvasWidgetSettings key={configureNodeId} node={nodes.find(n=>n.id===configureNodeId)!.data.analysis} widget={canvasWidgetFor(nodes.find(n=>n.id===configureNodeId)!.data.analysis,dashboards)!} containers={nodes.filter(n=>n.data.analysis.kind==='container').map(n=>n.data.analysis)} allowedFields={allowedFields} fieldNames={fieldNames} filters={locals[configureNodeId]||[]} onRemoveFilter={fid=>{if(!canModify)return;setLocals(old=>({...old,[configureNodeId]:(old[configureNodeId]||[]).filter(f=>f.id!==fid)}));setDirty(true)}} onSave={(widget,containerId)=>saveCanvasWidget(configureNodeId,widget,containerId)} onClose={()=>setConfigureNodeId(null)}/>:<NodeSettings node={nodes.find(n=>n.id===configureNodeId)!.data.analysis} fieldNames={fieldNames} filters={locals[configureNodeId]||[]} onRemoveFilter={fid=>{if(!canModify)return;setLocals(old=>({...old,[configureNodeId]:(old[configureNodeId]||[]).filter(f=>f.id!==fid)}));setDirty(true)}} onSave={(patch,sourceId)=>saveNodeSettings(configureNodeId,patch,sourceId)} onClose={()=>setConfigureNodeId(null)} allowedFields={allowedFields} sources={nodes.filter(n=>n.data.analysis.kind!=='note'&&n.data.analysis.kind!=='container').map(n=>n.data.analysis)} containers={nodes.filter(n=>n.data.analysis.kind==='container').map(n=>n.data.analysis)}/>)}
  {researchId&&researchSource&&(researchError?<Modal title="Deep Analysis" onClose={()=>setResearchId(null)}><Notice kind="error">{researchError}</Notice></Modal>:<ResearchExplorer key={researchId} title={researchSource.data.analysis.label} filters={researchFilters} allowedFields={allowedFields} initial={canvasWidgetFor(researchSource.data.analysis,dashboards)?.research} onPin={canModify?pinResearch:undefined} onFinding={canModify?addResearchFinding:undefined} onClose={()=>setResearchId(null)}/>)}
  {aiPrep&&canModify&&<AiDashboardPrep nodeLabel={selectedNode?.data.analysis.label||'Knoten'} existingCount={currentDashboard.widgets.length} allowedFields={allowedFields} onApply={draft=>{updateDashboard(draft);setAiPrep(false);handleSetView('builder');say('Dashboard-Vorlage übernommen. Bitte prüfen und Workspace speichern.')}} onClose={()=>setAiPrep(false)}/>}
  {help&&<Modal title="NXT Analytics – Bedienung" onClose={()=>setHelp(false)}><div className="help-copy"><p><b>Analysieren:</b> Knoten auswählen, global filtern und im rechten Dashboard die Detaildaten ansehen.</p><p><b>Bearbeiten:</b> Im Bearbeitungsmodus Knoten frei verschieben, Notizen aus der Palette ziehen und Verbindungspunkte mit der Maus verbinden. Filterfluss-Linien übertragen Filter in Pfeilrichtung; gestrichelte Referenzen verknüpfen nur fachlich; Rückverbindungen, die einen Zyklus bilden würden, werden verhindert.</p><p><b>Split:</b> Über die Knoten-Aktion eine Dimension auswählen. Die Filter jedes Vorgängers werden entlang aller eingehenden Pfeile vererbt (UND). Im Canvas lassen sich außerdem Balken-, Donut- und Zeitreihendiagramme sowie sichere SQL-Kennzahlen hinzufügen.</p><p><b>Container:</b> Container aus der Palette hinzufügen, Blöcke hinein- oder herausziehen oder die Gruppierung im Zahnrad wählen. Ein Pfeil zum Container überträgt den gemeinsamen Filterkontext auf alle Mitglieder. Beim Auflösen bleiben die Blöcke erhalten.</p><p><b>Speichern:</b> Änderungen lassen sich in privaten Supabase-Workspaces speichern und später für alle Projektmitglieder veröffentlichen. Dashboard-Widgets werden pro Knoten gesichert.</p></div></Modal>}
  {loaded&&<IntelligencePanel state={assistantState} workspace={activeWorkspace} fingerprint={assistantStamp} canEdit={canModify} busy={saving} onApply={applyAi} onUndo={undo} onSelectNode={setSelectedId} onOpenDashboard={()=>{setIntelligenceOpen(false);setFullDashboard(true);setView('analytics')}} open={intelligenceOpen} onOpen={setIntelligenceOpen}/>}
  {!!toast&&<div className="nxt-toast" role="status">{toast}<button aria-label="Meldung schließen" onClick={()=>setToast('')}>×</button></div>}
 </div></ChartAccess.Provider>;
}
export default function App(){
 const [state,setState]=useState<'loading'|'login'|'app'|'no-access'>('loading');
 const [authMode,setAuthMode]=useState<'login'|'invite'|'recovery'>('login');
 const [inviteError,setInviteError]=useState('');
 const [inviteTicket,setInviteTicket]=useState<InvitationTicket|null>(null);
 const invitePending=useRef(false),booted=useRef(false);
 const [role,setRole]=useState<Role|null>(null);
 const [email,setEmail]=useState(''),[userId,setUserId]=useState('');
 const refreshAuth=useCallback(async()=>{
  // Do not route another already signed-in account into a pending invite flow.
  if(invitePending.current){setAuthMode('invite');setState('login');return}
  const {data,error}=await supabase.auth.getUser();
  if(error||!data.user){setState('login');setAuthMode('login');return}
  setEmail(data.user.email||'');setUserId(data.user.id);
  const membership=await supabase.from('woodcorp_access').select('role')
    .eq('user_id',data.user.id).maybeSingle();
  if(!membership.data?.role){setState('no-access');return}
  setRole(membership.data.role as Role);
  if(new URLSearchParams(location.search).has('recovery')){
   setAuthMode('recovery');setState('login');
  }else{setAuthMode('login');setState('app')}
 },[]);
 useEffect(()=>{
  const {data}=supabase.auth.onAuthStateChange(event=>{
   if(invitePending.current)return; // Verify the invite only on password submission.
   if(event==='SIGNED_OUT'){setState('login');setAuthMode('login')}
   else if(event==='SIGNED_IN'||event==='PASSWORD_RECOVERY'){
    // Defer Supabase calls outside its synchronous auth-state callback.
    setTimeout(()=>void refreshAuth(),0);
   }
  });
  if(!booted.current){
   booted.current=true;
   const start=async()=>{
    const hash=location.hash;
    const ticket=extractInviteTicket(hash);
    if(ticket){
     invitePending.current=true;
     // Token stays in component memory, NEVER in history or network navigation.
     history.replaceState({},document.title,location.pathname+location.search);
     setInviteTicket(ticket);setInviteError('');
     setAuthMode('invite');setState('login');return;
    }
    if(isInviteFragment(hash)){
     history.replaceState({},document.title,location.pathname+location.search);
     setInviteError('Ungültiger Einladungslink. Bitte in „Team & Zugänge“ einen neuen Link erzeugen lassen.');
     setAuthMode('login');setState('login');return;
    }
    await refreshAuth();
   };
   void start();
  }
  return()=>data.subscription.unsubscribe();
 },[refreshAuth]);
 const signout=async()=>{invitePending.current=false;setInviteTicket(null);await supabase.auth.signOut();setState('login')};
 if(state==='loading')return <div className="boot-screen"><Spinner text="NXT Analytics wird vorbereitet …"/></div>;
 if(state==='login')return <AuthScreen client={supabase} mode={authMode} inviteTicket={inviteTicket} initialNotice={inviteError} onDone={()=>{
   invitePending.current=false;setInviteTicket(null);setInviteError('');void refreshAuth();
 }}/>;
 if(state==='no-access')return <div className="access-denied"><Brand/><h1>Für dieses Projekt ist eine Freigabe erforderlich.</h1><p>Du bist angemeldet, aber noch nicht für NXT Analytics berechtigt. Bitte wende dich an die Administration.</p><Button icon="log-out" onClick={signout}>Abmelden</Button></div>;
 return <ReactFlowProvider><AnalyticsWorkspace userId={userId} role={role!} email={email} onSignOut={signout}/></ReactFlowProvider>;
}
